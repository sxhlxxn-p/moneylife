"""Bounded numeric explanations and fallback. Author: sxhlxxn."""
import asyncio
import json

from fastapi import HTTPException
import pytest

from app import ai_explanation, llm
from app.ai_explanation import render_verified
from app.ai_schemas import Extraction, ChangeIntent

TEXT = ('기존 목표는 {{baseGoal}}, 변경 목표는 {{candidateGoal}}입니다. '
        '자산 차이는 {{assetDifference}}, 현금 부족 기간 차이는 {{shortageDifference}}입니다. 가정에 따른 비교입니다.')
METRICS = dict(baseGoalMonth=12, candidateGoalMonth=10, finalAssetsDifference=24000000, shortageMonthsDifference=-2)


def test_render_uses_engine_values_and_preserves_sign_and_null():
    rendered = render_verified(TEXT, METRICS)
    assert '12개월차' in rendered and '10개월차' in rendered
    assert '+24,000,000원' in rendered and '-2개월' in rendered
    rendered = render_verified(TEXT, {**METRICS, 'baseGoalMonth': None, 'candidateGoalMonth': 0})
    assert '기간 내 미달성' in rendered and '시작 시점 달성' in rendered


@pytest.mark.parametrize('text', [TEXT+' 99만원', TEXT+' 천만원', TEXT+' 두 배', TEXT+' ٣개월',
                                       TEXT.replace('{{assetDifference}}', '{{unknown}}'),
                                       TEXT.replace('{{baseGoal}}', '기존 계획'), TEXT+' {{baseGoal}}'])
def test_unbound_numbers_missing_and_unknown_references_fail(text):
    with pytest.raises(ValueError):
        render_verified(text, METRICS)


@pytest.mark.parametrize('recover', [True, False])
def test_retry_once_then_return_verified_text_or_template(monkeypatch, recover):
    monkeypatch.setenv('OPENAI_API_KEY', 'not-real')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    calls = []
    async def fake(body, **kwargs):
        calls.append(body)
        assert body['text']['format']['strict']
        text = TEXT if recover and len(calls) == 2 else TEXT+' 999원'
        return {'text': json.dumps({'text': text})}
    monkeypatch.setattr(llm, 'call_response', fake)
    result = asyncio.run(ai_explanation.generate(METRICS, '정형 설명'))
    assert len(calls) == 2
    assert result['attempts'] == 2
    assert result['source'] == ('llm' if recover else 'template')
    assert result['verifiedNumbers']
    assert '999' not in result['text']


def test_provider_failure_falls_back_without_retrying_outage(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'not-real')
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    async def unavailable(*args, **kwargs):
        raise HTTPException(503, detail='LLM_UNAVAILABLE')
    monkeypatch.setattr(llm, 'call_response', unavailable)
    result = asyncio.run(ai_explanation.generate(METRICS, '정형 설명'))
    assert result['attempts'] == 1 and result['source'] == 'template'


def test_explain_api_checks_owner_caches_success_and_preserves_run(client, payload, monkeypatch):
    monkeypatch.setenv('LLM_MODEL', 'test-model')
    async def extract(*args):
        return Extraction(status='ready', changes=[ChangeIntent(field='expense', operation='subtract', amount=200000,
                           startMonth='2027-12', endMonth=None)], question=None)
    monkeypatch.setattr(llm, 'extract', extract)
    plan = client.post('/plans', json=payload).json()
    proposal = client.post('/ai/parse-change', json={'planId': plan['id'], 'message': '생활비 줄이기'}).json()
    applied = client.post(f"/ai/proposals/{proposal['proposalId']}/apply", json={'confirmed': True}).json()
    run = applied['run']
    calls = []
    async def generate(comparison, fallback):
        calls.append(comparison)
        return dict(text=render_verified(TEXT, comparison), source='llm', attempts=1,
                    fallbackReason=None, verifiedNumbers=True)
    monkeypatch.setattr(ai_explanation, 'generate', generate)
    first = client.post('/ai/explain', json={'runId': run['id']})
    assert first.status_code == 200
    assert first.json()['source'] == 'llm'
    assert first.headers['cache-control'] == 'no-store'
    assert client.post('/ai/explain', json={'runId': run['id']}).json() == first.json()
    assert len(calls) == 1
    assert client.get('/simulations/' + run['id']).json() == run
    client.cookies.clear()
    assert client.post('/ai/explain', json={'runId': run['id']}).status_code == 404


def test_missing_key_keeps_template_without_claiming_model_success(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    result = asyncio.run(ai_explanation.generate(METRICS, '정형 설명'))
    assert result == dict(text='정형 설명', source='template', attempts=0,
                          fallbackReason='LLM_NOT_CONFIGURED', verifiedNumbers=True)
