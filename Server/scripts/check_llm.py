"""Readiness check and opt-in one-request smoke test. Author: sxhlxxn."""
import argparse
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'Server'))
from fastapi import HTTPException
from app import llm
from app.settings import configuration_status


async def check(live=False):
    result = {'configuration': configuration_status(), 'liveAttempted': False, 'livePassed': None}
    if not result['configuration']['configured']:
        result['error'] = 'LLM_NOT_CONFIGURED' if result['configuration']['missing'] else 'LLM_PROVIDER_UNSUPPORTED'
        return result
    if not live:
        return result
    result['liveAttempted'] = True
    try:
        extraction = await llm.extract('다음 달부터 생활비를 20만원 줄여줘',
            {'currentMonth': '2026-10', 'nextMonth': '2026-11', 'lastMonth': '2036-10'})
        expected = [{'field': 'expense', 'operation': 'subtract', 'amount': 200000,
                     'startMonth': '2026-11', 'endMonth': None}]
        passed = extraction.status == 'ready' and [change.model_dump() for change in extraction.changes] == expected
        result['livePassed'] = passed
        if not passed:
            result['error'] = 'LLM_SMOKE_MISMATCH'
    except HTTPException as error:
        result.update(livePassed=False, error=error.detail)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='No network by default; --live makes one model request.')
    parser.add_argument('--live', action='store_true')
    arguments = parser.parse_args()
    result = asyncio.run(check(arguments.live))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if 'error' not in result else 2)
