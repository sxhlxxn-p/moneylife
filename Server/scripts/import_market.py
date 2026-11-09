"""Collect and validate historical prices locally. Author: sxhlxxn / 202439688."""
import argparse
import asyncio
import csv
from datetime import date, datetime
from zoneinfo import ZoneInfo
import json
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from dotenv import dotenv_values
from app.market_import import DailyClose, build_series, decimal_integer, parse_month, end_of_month, month_number
from app.market_provider import fetch_toss_daily, MarketProviderError


def arguments():
    parser = argparse.ArgumentParser(description='과거 원화 일봉을 월별 투자 가격 묶음으로 등록')
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument('--csv', type=Path, help='date,close,volume 열의 UTF-8 CSV')
    input_group.add_argument('--toss', action='store_true', help='환경변수의 액세스 토큰으로 일봉 조회')
    parser.add_argument('--series-id', required=True)
    parser.add_argument('--symbol', required=True)
    parser.add_argument('--label', required=True)
    parser.add_argument('--start-month', required=True)
    parser.add_argument('--end-month', required=True)
    parser.add_argument('--provider', default='CSV')
    parser.add_argument('--source-url', help='출처 공개 HTTPS URL, query/인증정보 제외')
    parser.add_argument('--usage-scope', choices=['private', 'project'], default='private', help='프로젝트 표시가 허용된 데이터만 project로 등록')
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[2] / '.data' / 'market')
    return parser.parse_args()


async def collect(args):
    start, end = parse_month(args.start_month), parse_month(args.end_month)
    if not 1 <= month_number(end) - month_number(start) <= 120 or end_of_month(end) >= datetime.now(ZoneInfo('Asia/Seoul')).date():
        raise ValueError('Only 2~121 completed months are supported')
    if args.toss:
        values = dotenv_values(Path(__file__).resolve().parents[1] / '.env', interpolate=False)
        token = os.getenv('TOSS_ACCESS_TOKEN') or values.get('TOSS_ACCESS_TOKEN') or ''
        async with httpx.AsyncClient(trust_env=False) as client:
            daily = await fetch_toss_daily(client=client, access_token=token, symbol=args.symbol,
                start=parse_month(args.start_month), end=end_of_month(parse_month(args.end_month)))
        provider, url = '토스증권 Open API', 'https://developers.tossinvest.com/docs/market-data'
    else:
        if not args.source_url: raise ValueError('CSV source URL is required')
        if args.csv.stat().st_size > 5_000_000: raise ValueError('CSV size exceeds 5MB')
        with args.csv.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames != ['date', 'close', 'volume']: raise ValueError('CSV columns must be date,close,volume')
            daily = [DailyClose(date=date.fromisoformat(row['date']), close=decimal_integer(row['close']), volume=decimal_integer(row['volume'])) for row in reader]
        provider, url = args.provider, args.source_url
    result = build_series(daily=daily, series_id=args.series_id, symbol=args.symbol, label=args.label,
        start_month=args.start_month, end_month=args.end_month, provider=provider, source_url=url, usage_scope=args.usage_scope)
    args.directory.mkdir(parents=True, exist_ok=True)
    destination = args.directory / (result['priceSeriesId'] + '.json')
    # Never replace an existing version. A different import must use a new ID.
    encoded = json.dumps(result, ensure_ascii=False, indent=2)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.directory, delete=False) as stream:
            temporary = Path(stream.name); stream.write(encoded)
        os.link(temporary, destination)
    finally:
        if temporary: temporary.unlink(missing_ok=True)
    print(json.dumps({'priceSeriesId': result['priceSeriesId'], 'dataKind': result['dataKind'],
        'usageScope': result['usageScope'], 'months': result['lastMonth'],
        'missingMonths': sum(q['price'] is None for q in result['prices']),
        'priceDataHash': result['priceDataHash'], 'file': str(destination)}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try:
        asyncio.run(collect(arguments()))
    except (ValueError, OSError, MarketProviderError):
        # Provider URLs/exceptions can contain authentication data; emit fixed text only.
        print('가격 등록 실패: 입력·기간·인증·기존 버전을 확인해주세요. 원본 파일은 덮어쓰지 않았습니다.', file=sys.stderr)
        sys.exit(1)
