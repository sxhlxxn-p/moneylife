"""Dataset and evaluation protocol checks. Author: sxhlxxn / 202439688."""
import asyncio
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys

import pytest
from fastapi import HTTPException

from app.ai_changes import build_candidate, model_context
from app.ai_evaluation import evaluation_state, rules_extract, score, summarize
from app.ai_schemas import Extraction
from app import llm

ROOT = Path(__file__).resolve().parents[2]
DATASET = json.loads((ROOT / 'Test/ai/cases-v1.json').read_text())


def test_dataset_has_fixed_balanced_split_and_unique_requests():
    cases = DATASET['cases']
    assert len(cases) == 100
    assert len({case['id'] for case in cases}) == 100
    assert len({case['request'] for case in cases}) == 100
    assert Counter(case['split'] for case in cases) == {'dev': 60, 'test': 40}
    for category in {case['category'] for case in cases}:
        assert Counter(case['split'] for case in cases if case['category'] == category) == {'dev': 6, 'test': 4}


def test_gold_outputs_fit_schema_and_final_validation_labels():
    # Contract consistency, not independent semantic annotation of the authored labels.
    for case in DATASET['cases']:
        extraction = Extraction.model_validate(case['expected'])
        evaluation_state(case)
        if extraction.status == 'ready':
            if case['expectedFinalStatus'] == 'invalid_change':
                with pytest.raises(ValueError):
                    build_candidate(evaluation_state(case), extraction.changes)
            else:
                build_candidate(evaluation_state(case), extraction.changes)
        assert score(case, extraction)['rawExact']
        assert score(case, extraction)['finalExact']


def test_server_validation_cannot_detect_semantically_wrong_but_valid_amount():
    case = DATASET['cases'][10]  # expense -200000
    wrong = Extraction(status='ready', changes=[{
        'field': 'expense', 'operation': 'subtract', 'amount': 100000,
        'startMonth': '2026-11', 'endMonth': None}], question=None)
    result = score(case, wrong)
    assert result['finalStatus'] == 'ready'
    assert result['wrongApplication']
    assert not result['rawExact']
    assert not result['finalExact']


def test_unsafe_gold_extraction_is_blocked_by_server_validation():
    case = next(case for case in DATASET['cases'] if case['id'] == 'invalid_change-01')
    result = score(case, Extraction.model_validate(case['expected']))
    assert result['rawExact']
    assert result['finalStatus'] == 'invalid_change'
    assert not result['wrongApplication']


def test_metric_denominators_and_errors_are_explicit():
    rows = [dict(expectedStatus='ready', finalStatus='ready', rawExact=False, finalExact=False,
                 wrongApplication=True, latencyMs=10, usage={'input_tokens': 20, 'output_tokens': 5}),
            dict(expectedStatus='needs_clarification', finalStatus='error', rawExact=False, finalExact=False,
                 wrongApplication=False, latencyMs=30, usage=None)]
    result = summarize(rows)
    assert result['wrongApplicationRateOfApplied'] == 1
    assert result['appliedCount'] == 1
    assert result['clarificationRecall'] == 0
    assert result['errors'] == 1
    assert result['meanLatencyMs'] == 20
    assert result['p95LatencyMs'] == 30
    assert result['inputTokens'] == 20
    assert result['costUsd'] is None
    assert summarize([])['rawExactRate'] is None


def test_rules_baseline_is_deterministic_and_has_no_model_calls():
    case = DATASET['cases'][10]
    context = model_context(evaluation_state(case))
    assert rules_extract(case['request'], context) == rules_extract(case['request'], context)
    assert rules_extract('生活費', context).status == 'needs_clarification'
    assert rules_extract('삼성전자 10주 매수', context).status == 'unsupported'


def test_final_test_requires_full_frozen_development_config(tmp_path):
    result = subprocess.run([sys.executable, str(ROOT / 'Test/ai/evaluate.py'), '--mode', 'rules',
                             '--split', 'test', '--output', str(tmp_path / 'report.json')], capture_output=True, text=True)
    assert result.returncode != 0
    assert 'requires --frozen-config' in result.stderr
    assert not (tmp_path / 'report.json').exists()


def test_plain_adapter_returns_raw_output_before_parsing(monkeypatch):
    import httpx
    monkeypatch.setenv('OPENAI_API_KEY', 'not-a-real-key')
    monkeypatch.setenv('LLM_MODEL', 'configured-test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    real_client = httpx.AsyncClient
    def handle(request):
        body = json.loads(request.content)
        assert 'text' not in body
        assert '추출 스키마' in body['input'][0]['content']
        return httpx.Response(200, json={'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': 'not JSON'}]}], 'usage': {'input_tokens': 10, 'output_tokens': 2}})
    monkeypatch.setattr(llm.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    response = asyncio.run(llm.request_raw('테스트', {}, structured=False))
    assert response['text'] == 'not JSON'
    assert response['usage']['input_tokens'] == 10
    with pytest.raises(HTTPException) as error:
        llm.parse_extraction(response['text'])
    assert error.value.detail == 'MODEL_OUTPUT_INVALID'
