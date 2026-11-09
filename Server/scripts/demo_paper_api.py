"""Run against a local API using synthetic prices. Author: sxhlxxn / 202439688."""
import argparse
import json
from pathlib import Path
from uuid import uuid4
import httpx


def main():
    parser = argparse.ArgumentParser(description='로컬 모의투자 저장 API 시연 (가상 데이터)')
    parser.add_argument('--url', default='http://localhost:8000')
    args = parser.parse_args()
    fixture = json.loads((Path(__file__).resolve().parents[2] / 'fixtures/paper-trading/monthly-run.json').read_text())
    with httpx.Client(base_url=args.url, timeout=15, trust_env=False) as client:
        def post(path, body):
            response = client.post(path, json=body)
            response.raise_for_status()
            return response.json()
        state = {**fixture['state'], 'initial': {'name': '모의투자 API 시연', 'age': 25, 'avatar': '🌱', **fixture['state']['initial']}, 'month': 0}
        base = post('/plans', {'state': state})
        current = post('/paper-plans', {'requestId': str(uuid4()), 'planId': base['id'], 'priceSeriesId': 'synthetic-monthly-v1'})
        def command(action, **fields):
            return post(f"/paper-plans/{current['plan']['id']}/{action}", {'requestId': str(uuid4()), **fields})
        current = command('orders', side='buy', quantity=50)
        current = command('advance', months=2)
        current = command('orders', side='sell', quantity=20)
        current = command('advance')
        current = command('orders', side='sell', quantity=30)
        current = command('advance')
        result = current['run']['result']
        assert result['invested']['summary']['finalNetAssets'] == 1410000
        assert result['comparison']['finalAssetsDifference'] == 10000
        response = client.get(f"/paper-runs/{current['run']['id']}")
        response.raise_for_status()
        assert response.json() == current['run']
        print(json.dumps({'dataKind': 'synthetic-test-only', 'planId': current['plan']['id'],
            'summary': result['invested']['summary'], 'comparison': result['comparison'],
            'persistedReadVerified': True}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
