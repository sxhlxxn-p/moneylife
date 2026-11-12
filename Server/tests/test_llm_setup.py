"""Settings precedence and redacted diagnostics. Author: sxhlxxn."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path

from fastapi import HTTPException
import httpx
import pytest

from app import llm
from app.settings import LLM_KEYS, configuration_status, load_llm_settings

ROOT = Path(__file__).resolve().parents[2]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


setup = module('llm_setup_script', 'Server/scripts/setup_llm.py')
diagnostic = module('llm_diagnostic_script', 'Server/scripts/check_llm.py')


def test_file_loads_only_llm_settings_and_environment_takes_precedence(tmp_path, monkeypatch):
    for key in LLM_KEYS:
        monkeypatch.setenv(key, 'temporary-before-load')
        monkeypatch.delenv(key)
    monkeypatch.setenv('DATABASE_URL', 'existing-database')
    monkeypatch.setenv('LLM_MODEL', 'deployment-model')
    path = tmp_path / '.env'
    path.write_text("LLM_PROVIDER='openai'\nLLM_MODEL='local-model'\nOPENAI_API_KEY='test-${VALUE}'\nDATABASE_URL='ignored-database'\n")
    load_llm_settings(path)
    assert os.environ['LLM_MODEL'] == 'deployment-model'
    assert os.environ['OPENAI_API_KEY'] == 'test-${VALUE}'
    assert os.environ['DATABASE_URL'] == 'existing-database'


def test_hidden_setup_preserves_other_settings_and_writes_private_file(tmp_path):
    path = tmp_path / '.env'
    path.write_text('# Existing settings\nDATABASE_URL=sqlite+aiosqlite:///local.db\nLLM_MODEL=old\n')
    setup.write_settings(path, 'test-model', 'unit-test-key')
    from dotenv import dotenv_values
    values = dotenv_values(path)
    assert values['DATABASE_URL'] == 'sqlite+aiosqlite:///local.db'
    assert values['LLM_MODEL'] == 'test-model'
    assert values['OPENAI_API_KEY'] == 'unit-test-key'
    assert (path.stat().st_mode & 0o777) == 0o600


def test_invalid_setup_does_not_overwrite_existing_file(tmp_path):
    path = tmp_path / '.env'
    path.write_text('KEEP=value\n')
    for model, key in [('', 'key'), ('sk-looks-like-a-key', 'key'), ('model', ''), ('model\nX=1', 'key')]:
        with pytest.raises(ValueError):
            setup.write_settings(path, model, key)
        assert path.read_text() == 'KEEP=value\n'


def test_status_does_not_expose_credentials_and_empty_env_does_not_fall_back(tmp_path, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', '')
    monkeypatch.setenv('LLM_MODEL', 'model-not-for-output')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    path = tmp_path / '.env'
    path.write_text('OPENAI_API_KEY=do-not-load-this\n')
    load_llm_settings(path)
    status = configuration_status()
    assert not status['configured']
    assert status['missing'] == ['OPENAI_API_KEY']
    assert 'model-not-for-output' not in json.dumps(status)
    assert 'do-not-load-this' not in json.dumps(status)


@pytest.mark.parametrize('status,code,expected', [
    (401, 'invalid_api_key', 'LLM_AUTHENTICATION_FAILED'),
    (403, None, 'LLM_ACCESS_DENIED'),
    (403, 'model_not_found', 'LLM_MODEL_UNAVAILABLE'),
    (404, None, 'LLM_MODEL_UNAVAILABLE'),
    (429, 'insufficient_quota', 'LLM_QUOTA_EXCEEDED'),
    (429, 'credit_balance_exhausted', 'LLM_QUOTA_EXCEEDED'),
    (429, 'project_spend_limit_exceeded', 'LLM_QUOTA_EXCEEDED'),
    (429, 'rate_limit_exceeded', 'LLM_RATE_LIMITED'),
    (400, None, 'LLM_REQUEST_INVALID'),
    (500, None, 'LLM_UNAVAILABLE'),
])
def test_http_failure_is_classified_without_echoing_provider_messages(status, code, expected, monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test-key-never-print')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    real_client = httpx.AsyncClient
    def handle(request):
        return httpx.Response(status, json={'error': {'code': code, 'message': 'unit-test-key-never-print'}})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(HTTPException) as error:
        asyncio.run(llm.extract('테스트', {}))
    assert error.value.detail == expected
    assert 'unit-test-key-never-print' not in str(error.value)


def test_diagnostic_does_not_call_provider_unless_live_requested(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test-key')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    async def forbidden(*args, **kwargs):
        pytest.fail('offline diagnostic called a provider')
    monkeypatch.setattr(llm, 'extract', forbidden)
    result = asyncio.run(diagnostic.check(False))
    assert result['configuration']['configured']
    assert not result['liveAttempted']
    assert 'unit-test-key' not in json.dumps(result)


def test_missing_config_stops_even_live_diagnostic(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('LLM_MODEL', raising=False)
    result = asyncio.run(diagnostic.check(True))
    assert not result['liveAttempted']
    assert result['error'] == 'LLM_NOT_CONFIGURED'


@pytest.mark.parametrize('amount,passed', [(200000, True), (100000, False)])
def test_live_diagnostic_makes_one_request_and_checks_semantic_result(monkeypatch, amount, passed):
    from app.ai_schemas import Extraction, ChangeIntent
    monkeypatch.setenv('OPENAI_API_KEY', 'unit-test-key')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    calls = []
    async def extract(message, context):
        calls.append((message, context))
        return Extraction(status='ready', question=None, changes=[ChangeIntent(
            field='expense', operation='subtract', amount=amount, startMonth='2026-11', endMonth=None)])
    monkeypatch.setattr(llm, 'extract', extract)
    result = asyncio.run(diagnostic.check(True))
    assert len(calls) == 1
    assert result['liveAttempted']
    assert result['livePassed'] is passed
    assert ('error' in result) is not passed
