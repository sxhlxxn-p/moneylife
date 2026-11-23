"""Prepare one reproducible market demo; collection is explicit."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_auth import readiness
from app.market import load_historical
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description='삼성전자 2024년 시연 자료 준비/등록 확인')
    parser.add_argument('--collect', action='store_true', help='인증정보를 사용해 실제 일봉 수집')
    parser.add_argument('--project-usage-confirmed', action='store_true', help='프로젝트 표시 가능 범위를 확인한 자료를 등록')
    args = parser.parse_args()
    spec = json.loads((ROOT / 'fixtures/market-demo-spec.json').read_text())
    report = {'specId': spec['priceSeriesId'], 'symbol': spec['symbol'], 'period': [spec['startMonth'], spec['endMonth']], **readiness()}
    try:
        stored = load_historical(spec['priceSeriesId'])
    except HTTPException as error:
        if error.status_code != 404:
            print(json.dumps({**report, 'status': 'invalid-registered-data'}, ensure_ascii=False)); return 1
        stored = None
    if stored:
        if (stored['symbol'] != spec['symbol'] or stored['historicalStartMonth'] != spec['startMonth'] or
            stored['historicalEndMonth'] != spec['endMonth'] or stored['dataKind'] != 'historical-market'):
            print(json.dumps({**report, 'status': 'spec-mismatch'}, ensure_ascii=False)); return 1
        print(json.dumps({**report, 'status': 'registered', 'priceDataHash': stored['priceDataHash'],
            'missingMonths': sum(row['price'] is None for row in stored['prices'])}, ensure_ascii=False, indent=2)); return 0
    if not args.collect:
        print(json.dumps({**report, 'status': 'awaiting-collection'}, ensure_ascii=False, indent=2)); return 0
    if not report['configured'] or not args.project_usage_confirmed:
        print(json.dumps({**report, 'status': 'credentials-or-project-scope-required'}, ensure_ascii=False)); return 1
    command = [sys.executable, str(ROOT / 'Server/scripts/import_market.py'), '--toss', '--series-id', spec['priceSeriesId'],
        '--symbol', spec['symbol'], '--label', spec['label'], '--start-month', spec['startMonth'],
        '--end-month', spec['endMonth'], '--usage-scope', 'project']
    return subprocess.run(command, cwd=ROOT, check=False).returncode


if __name__ == '__main__':
    sys.exit(main())
