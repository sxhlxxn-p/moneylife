from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from fastapi import HTTPException
from app import simulations


def test_idempotent_save_reuses_plan_and_checks_payload(client,payload):
    command={'requestId':str(uuid4()),'plan':payload}
    first=client.post('/plan-saves',json=command)
    assert first.status_code==201
    assert client.post('/plan-saves',json=command).json()==first.json()
    assert len(client.get('/plans').json())==1
    changed=deepcopy(command);changed['plan']['state']['initial']['expense']=1000000
    assert client.post('/plan-saves',json=changed).status_code==409
    client.cookies.clear()
    assert client.get('/plans/'+first.json()['id']).status_code==404


def test_calculation_failure_can_resume_without_another_plan(client,payload,monkeypatch):
    command={'requestId':str(uuid4()),'plan':payload}
    plan=client.post('/plan-saves',json=command).json()
    run={'planId':plan['id'],'requestId':str(uuid4()),'months':120}
    calculate=simulations.calculate
    async def fail(*args):raise HTTPException(503,'ENGINE_UNAVAILABLE')
    monkeypatch.setattr(simulations,'calculate',fail)
    assert client.post('/simulations',json=run).status_code==503
    assert client.post('/plan-saves',json=command).json()['id']==plan['id']
    monkeypatch.setattr(simulations,'calculate',calculate)
    first=client.post('/simulations',json=run)
    assert first.status_code==200
    assert client.post('/simulations',json=run).json()==first.json()
    assert len(client.get('/plans').json())==1


def test_concurrent_save_creates_one_plan(client,payload):
    client.get('/plans')
    command={'requestId':str(uuid4()),'plan':payload}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(lambda _:client.post('/plan-saves',json=command),range(2)))
    assert all(response.status_code==201 for response in responses)
    assert len({response.json()['id'] for response in responses})==1
    assert len(client.get('/plans').json())==1
