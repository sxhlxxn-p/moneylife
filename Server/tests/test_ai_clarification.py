"""Follow-up answers are bound to the original plan and request. Author: sxhlxxn."""
import asyncio
import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import llm, database, ai_explanation
from app.ai_schemas import Extraction, ChangeIntent
from app.models import AIClarification
from sqlalchemy.ext.asyncio import AsyncSession


def ask(client, plan, text='생활비 줄여줘', **extra):
    return client.post('/ai/parse-change', json={'planId': plan['id'], 'message': text, **extra})


def test_followup_keeps_original_request_and_requires_approval(client, payload, monkeypatch):
    contexts = []
    async def fake(message, context):
        contexts.append((message, context))
        if len(contexts) == 1:
            return Extraction(status='needs_clarification', changes=[], question='얼마를 줄일까요?')
        return Extraction(status='ready', question=None, changes=[ChangeIntent(
            field='expense', operation='subtract', amount=200000, startMonth='2027-12', endMonth=None)])
    monkeypatch.setattr(llm, 'extract', fake)
    plan = client.post('/plans', json=payload).json()
    first = ask(client, plan).json()
    assert first['clarificationId'] and first['proposalId'] is None
    second = ask(client, plan, '20만 원', clarificationId=first['clarificationId']).json()
    assert contexts[1][0] == '생활비 줄여줘'
    assert contexts[1][1]['clarificationTurns'] == [{'question': '얼마를 줄일까요?', 'answer': '20만 원'}]
    assert second['status'] == 'ready'
    assert client.get('/plans/' + plan['id']).json() == plan
    applied = client.post('/ai/proposals/' + second['proposalId'] + '/apply', json={'confirmed': True})
    assert applied.status_code == 200


def test_clarification_owner_and_plan_are_checked(client, payload, monkeypatch):
    async def fake(*args): return Extraction(status='needs_clarification', changes=[], question='금액은요?')
    monkeypatch.setattr(llm, 'extract', fake)
    plan = client.post('/plans', json=payload).json()
    other_plan = client.post('/plans', json=payload).json()
    record = ask(client, plan).json()
    assert ask(client, other_plan, clarificationId=record['clarificationId']).status_code == 409
    assert ask(client, plan, clarificationId=str(uuid4())).status_code == 404
    with TestClient(app) as other:
        foreign = other.post('/plans', json=payload).json()
        assert ask(other, foreign, clarificationId=record['clarificationId']).status_code == 404


def test_expiration_and_turn_limit(client, payload, monkeypatch):
    async def fake(*args): return Extraction(status='needs_clarification', changes=[], question='시점은요?')
    monkeypatch.setattr(llm, 'extract', fake)
    plan = client.post('/plans', json=payload).json()
    first = ask(client, plan).json()
    async def expire():
        async with AsyncSession(database.engine, expire_on_commit=False) as session:
            row = await session.get(AIClarification, first['clarificationId'])
            row.expires_at = int(time.time()) - 1
            await session.commit()
    asyncio.run(expire())
    assert ask(client, plan, clarificationId=first['clarificationId']).status_code == 410
    current = ask(client, plan).json()
    for _ in range(3):
        current = ask(client, plan, '추가 답변', clarificationId=current['clarificationId']).json()
        assert current['status'] == 'needs_clarification'
    assert ask(client, plan, '다시', clarificationId=current['clarificationId']).status_code == 422


@pytest.mark.parametrize('difference', [-1000000, 0, 1000000])
def test_fact_sentences_bind_asset_and_shortage_direction(difference):
    facts = ai_explanation.facts_for(dict(baseGoalMonth=None, candidateGoalMonth=0,
        finalAssetsDifference=difference, shortageMonthsDifference=-2))
    assert ('높습니다' if difference > 0 else '낮습니다' if difference < 0 else '같습니다') in facts['assets']
    assert '적습니다' in facts['liquidity']
    assert '시작 시점' in facts['goal'] and '기간 내 미달성' in facts['goal']


def test_legacy_opposite_direction_claim_is_rejected():
    with pytest.raises(ValueError):
        ai_explanation.render_verified('자산이 감소했습니다: {{assetDifference}}. {{baseGoal}} {{candidateGoal}} {{shortageDifference}}',
            dict(baseGoalMonth=20, candidateGoalMonth=10, finalAssetsDifference=1000000, shortageMonthsDifference=0))
