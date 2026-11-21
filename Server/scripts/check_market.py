"""Offline readiness and opt-in historical market smoke test. Author: sxhlxxn."""
import argparse
import asyncio
from datetime import date
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.market_auth import readiness, access_token
from app.market_provider import fetch_toss_daily, MarketProviderError
from app.market import catalog_sources


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='실제 토큰/일봉 호출. 기본은 외부 요청 없음')
    args = parser.parse_args()
    report = {**readiness(), 'registeredHistoricalSeries': sum(source['dataKind'] == 'historical-market' for source in catalog_sources()), 'liveChecked': False}
    if args.live:
        if not report['configured']:
            report['error'] = 'MARKET_NOT_CONFIGURED'
        else:
            try:
                async with httpx.AsyncClient(trust_env=False) as client:
                    token = await access_token(client)
                    rows = await fetch_toss_daily(client=client, access_token=token, symbol='005930',
                        start=date(2024, 1, 1), end=date(2024, 1, 31), max_pages=4)
                if not rows:
                    raise MarketProviderError('MARKET_EMPTY_DATA')
                report.update(liveChecked=True, symbol='005930', observations=len(rows), firstDate=str(rows[0].date), lastDate=str(rows[-1].date))
            except MarketProviderError as error:
                report['error'] = str(error)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if 'error' in report else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
