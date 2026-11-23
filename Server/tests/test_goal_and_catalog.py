from copy import deepcopy
from app.events import CATALOG


def test_goal_metadata_round_trip_without_changing_legacy_shape(client,payload):
    legacy=client.post('/plans',json=payload).json()
    assert 'goal' not in legacy['state']
    value=deepcopy(payload)
    value['state']['goal']={'name':'독립 자금','months':24}
    saved=client.post('/plans',json=value).json()
    restored=client.get('/plans/'+saved['id']).json()
    assert restored['state']['goal']==value['state']['goal']
    assert client.get('/plans/'+legacy['id']).json()['state']==legacy['state']


def test_invalid_goal_is_not_saved(client,payload):
    payload['state']['goal']={'name':'독립 자금','months':0}
    assert client.post('/plans',json=payload).status_code==422
    assert client.get('/plans').json()==[]


def test_shared_catalog_has_supported_units_rules_and_event_months():
    assert CATALOG['version']=='life-events-v1'
    assert CATALOG['unit']=='KRW'
    assert [event['month'] for event in CATALOG['events']]==[12,30,48,72,96]
    for event in CATALOG['events']:
        rule=event['rule']
        assert rule['kind'] in ('effects','income-pause')
        if rule['kind']=='income-pause':
            assert 1<=rule['months']<=120
        else:
            for effect in rule['effects']:
                assert effect['type'] in ('income','expense','once')
                assert type(effect['value']) is int and 0<=effect['value']<=10000000000


def test_blank_goal_name_is_rejected(client,payload):
    payload['state']['goal']={'name':'   ','months':24}
    assert client.post('/plans',json=payload).status_code==422
