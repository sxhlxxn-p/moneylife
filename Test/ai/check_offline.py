"""Exercise real API, validation, database and calculation with scripted provider responses."""
import argparse
from collections import deque
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import patch

if not __debug__:
    raise RuntimeError('Offline checks require assertions enabled; do not run with -O.')

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
import httpx
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine
from app import database
from app.main import app
from app.ai_explanation import facts_for


def extraction(changes=None, status='ready', question=None):
    return {'status': status, 'changes': changes or [], 'question': question}


def change(amount=200000, start='2026-11'):
    return {'field': 'expense', 'operation': 'subtract', 'amount': amount,
            'startMonth': start, 'endMonth': None}


def run_checks():
    real_client = httpx.AsyncClient
    scripted, requests, checks = deque(), [], []

    def provider(request):
        if str(request.url) != 'https://api.openai.com/v1/responses':
            raise AssertionError('Unexpected provider URL; no network request is permitted.')
        body = json.loads(request.content)
        requests.append(body)
        assert body['model'] == 'offline-fixture' and body['store'] is False
        assert body['text']['format']['strict'] is True
        if not scripted:
            raise AssertionError('No scripted response remains.')
        value = scripted.popleft()
        if value == 'timeout':
            raise httpx.ReadTimeout('Scripted timeout', request=request)
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        return httpx.Response(200, json={'status': 'completed', 'output': [
            {'type': 'message', 'content': [{'type': 'output_text', 'text': text}]}]})

    def local_provider(**kwargs):
        return real_client(transport=httpx.MockTransport(provider), **kwargs)

    def checked(response, status=200):
        assert response.status_code == status, (response.status_code, response.text)
        return response.json()

    with TemporaryDirectory(prefix='moneylife-offline-') as directory:
        engine = create_async_engine(f'sqlite+aiosqlite:///{Path(directory) / "checks.db"}')
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'offline-placeholder', 'LLM_MODEL': 'offline-fixture',
                                    'LLM_PROVIDER': 'openai', 'AI_REQUESTS_PER_MINUTE': '100',
                                    'AI_IP_REQUESTS_PER_MINUTE': '100'}), \
             patch.object(database, 'engine', engine), \
             patch.object(httpx, 'AsyncClient', local_provider), TestClient(app) as client:
            base_input = {'state': {'initial': {'name': '오프라인 검증', 'age': 25, 'avatar': 'test',
                'cash': 10000000, 'saved': 0, 'income': 2500000, 'expense': 1600000, 'target': 20000000},
                'monthlySaving': 700000, 'annualRate': 0, 'month': 0}}
            base = checked(client.post('/plans', json=base_input), 201)

            def ask(text, **extra):
                return client.post('/ai/parse-change', json={'planId': base['id'], 'message': text, **extra})

            scripted.append(extraction([change()]))
            proposal = checked(ask('다음 달부터 생활비를 20만원 줄여줘'))
            assert proposal['status'] == 'ready'
            assert len(checked(client.get('/plans'))) == 1
            assert checked(client.get('/plans/'+base['id'])) == base
            checked(client.post('/ai/proposals/'+proposal['proposalId']+'/apply', json={'confirmed': False}), 422)
            result = checked(client.post('/ai/proposals/'+proposal['proposalId']+'/apply', json={'confirmed': True}))
            assert result['comparison'] == {'baseGoalMonth': 12, 'candidateGoalMonth': 10,
                'finalAssetsDifference': 24000000, 'shortageMonthsDifference': 0}
            assert result['toolsExecuted'] == ['run_simulation:base', 'run_simulation:candidate', 'compare_plans']
            again = checked(client.post('/ai/proposals/'+proposal['proposalId']+'/apply', json={'confirmed': True}))
            assert result == again and len(checked(client.get('/plans'))) == 2
            checks.append({'id': 'approval-calculation-repeat', 'passed': True,
                           'comparison': result['comparison']})

            scripted.append(extraction(status='needs_clarification', question='얼마를 줄일까요?'))
            question = checked(ask('생활비 줄여줘'))
            assert question['proposalId'] is None
            scripted.append(extraction([change()]))
            followup = checked(ask('20만원', clarificationId=question['clarificationId']))
            context = json.loads(requests[-1]['input'][1]['content'])
            assert context['message'] == '생활비 줄여줘'
            assert context['context']['clarificationTurns'] == [{'question': '얼마를 줄일까요?', 'answer': '20만원'}]
            assert followup['status'] == 'ready' and len(checked(client.get('/plans'))) == 2
            checks.append({'id': 'clarification-context', 'passed': True})

            scripted.append(extraction([change(start='2027-03')]))
            checked(ask('내년 3월부터 생활비를 20만원 줄여줘'))
            context = json.loads(requests[-1]['input'][1]['content'])['context']
            assert context['currentMonth'] == '2026-10'
            checks.append({'id': 'relative-date-context', 'passed': True,
                           'limitation': 'Date extraction is scripted; only reference-month transmission is verified.'})

            for name, value, status, expected in [
                ('negative-condition', extraction([change(2000000)]), 200, 'invalid_change'),
                ('unsupported', extraction(status='unsupported', question='주식 주문은 지원하지 않아요.'), 200, 'unsupported'),
                ('malformed-response', 'not JSON', 502, 'MODEL_OUTPUT_INVALID'),
                ('provider-timeout', 'timeout', 503, 'LLM_TIMEOUT')]:
                scripted.append(value)
                response = checked(ask(name), status)
                assert response.get('status', response.get('detail')) == expected
                assert len(checked(client.get('/plans'))) == 2
                checks.append({'id': name, 'passed': True})

            run_id = result['run']['id']
            scripted.extend([{'selectedIds': ['assets'] * 4}, {'text': '자산은 999999999원입니다.'}])
            fallback = checked(client.post('/ai/explain', json={'runId': run_id}))
            assert fallback['source'] == 'template' and fallback['attempts'] == 2
            assert fallback['text'] == result['explanation'] and '999999999' not in fallback['text']
            checks.append({'id': 'invalid-explanation-fallback', 'passed': True})
            scripted.append({'selectedIds': ['assets', 'goal', 'liquidity', 'assumptions']})
            explanation = checked(client.post('/ai/explain', json={'runId': run_id}))
            facts = facts_for(result['comparison'])
            assert explanation['text'].splitlines() == [facts[k] for k in ['assets', 'goal', 'liquidity', 'assumptions']]
            assert explanation['verifiedNumbers'] is True
            checked(client.post('/ai/explain', json={'runId': run_id}))  # Cache must not consume a response.
            checks.append({'id': 'verified-explanation-cache', 'passed': True})
            for name, changes, goal, difference in [
                ('compound-approved-comparison', [
                    change(),
                    {**change(300000), 'field': 'income', 'operation': 'add'},
                ], 8, 60000000),
                ('bounded-approved-comparison', [
                    {**change(), 'endMonth': '2027-02'},
                ], 11, 800000),
            ]:
                scripted.append(extraction(changes))
                proposal = checked(ask(name))
                assert proposal['status'] == 'ready'
                assert len(proposal['previewDetails']) == len(changes)
                approved = checked(client.post(
                    '/ai/proposals/' + proposal['proposalId'] + '/apply',
                    json={'confirmed': True},
                ))
                assert approved['comparison']['baseGoalMonth'] == 12
                assert approved['comparison']['candidateGoalMonth'] == goal
                assert approved['comparison']['finalAssetsDifference'] == difference
                stored_run = checked(client.get('/simulations/' + approved['run']['id']))
                assert stored_run['inputSnapshot']['aiComparison'] == approved['comparison']
                checks.append({'id': name, 'passed': True,
                               'comparison': approved['comparison']})
            assert not scripted
            assert checked(client.get('/plans/'+base['id'])) == base
    return {'kind': 'offline-integration-check', 'externalApiCalls': 0,
            'scriptedProviderRequests': len(requests), 'checks': checks,
            'limitations': ['Scripted provider responses do not measure language understanding or model quality.',
                            'Uses an isolated SQLite database and the real shared calculation engine.',
                            'The production server and its provider configuration are not changed.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.data/ai-evaluation/offline-flow.json')
    args = parser.parse_args()
    report = run_checks()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
