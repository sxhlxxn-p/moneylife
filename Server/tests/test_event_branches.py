from copy import deepcopy
import pytest
from sqlalchemy import select, func
from app import database
from app.models import Plan, Run
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio


def command(payload, event=12, accepted=True):
    base = deepcopy(payload)
    base['state'].update(month=event, changes=[], events=[], logs=[])
    return {'requestId': 'c96744a7-76a7-4eee-a3a7-ceb14e129f08', 'base': base,
            'eventMonth': event, 'accepted': accepted}

@pytest.mark.parametrize('event', [12, 30, 48, 72, 96])
def test_event_saves_immutable_original_child_and_run(client, payload, event):
    body = command(payload, event)
    response = client.post('/event-branches', json=body)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result['plan']['parentPlanId'] == result['basePlan']['id']
    assert result['run']['planId'] == result['plan']['id']
    assert result['basePlan']['state']['events'] == []
    assert result['plan']['state']['events'] == [event]
    assert all(c['m'] == event+1 or event == 30 for c in result['plan']['state']['changes'])
    if event == 30:
        assert [result['run']['monthlyResults'][m]['income'] for m in [31,32,33]] == [0,0,0]
        assert result['run']['monthlyResults'][34]['income'] == 2500000
    assert client.get('/plans/'+result['basePlan']['id']).json()['state']['changes'] == []
    assert client.post('/event-branches', json=body).json() == result
    assert len(client.get('/plans').json()) == 2
    body['accepted'] = False
    assert client.post('/event-branches', json=body).status_code == 409


def test_rejected_event_is_recorded_without_financial_changes(client, payload):
    result = client.post('/event-branches', json=command(payload, accepted=False)).json()
    assert result['plan']['state']['changes'] == []
    assert result['plan']['state']['events'] == [12]


def test_invalid_event_and_foreign_parent_rejected(client, payload):
    body = command(payload)
    body['base']['state']['month'] = 13
    assert client.post('/event-branches', json=body).status_code == 422
    body = command(payload)
    parent = client.post('/plans', json=body['base']).json()['id']
    client.cookies.clear()
    body['base']['parentPlanId'] = parent
    assert client.post('/event-branches', json=body).status_code == 404


def test_engine_failure_does_not_save_either_plan(client, payload, monkeypatch):
    from app import events
    from fastapi import HTTPException
    async def fail(*args, **kwargs):
        raise HTTPException(503, 'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(events, 'calculate', fail)
    assert client.post('/event-branches', json=command(payload)).status_code == 503
    assert client.get('/plans').json() == []


def test_event_exceeding_history_limit_is_rejected_without_storage(client, payload):
    body = command(payload)
    body['base']['state']['changes'] = [{'type': 'expense', 'v': 0, 'm': 1}] * 200
    response = client.post('/event-branches', json=body)
    assert response.status_code == 422
    assert client.get('/plans').json() == []
