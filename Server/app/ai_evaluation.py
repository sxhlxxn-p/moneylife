"""Offline extraction evaluation, never a production fallback. Author: sxhlxxn / 202439688."""
import hashlib
import json
import re
import time
from decimal import Decimal
from pathlib import Path

from fastapi import HTTPException

from app import llm
from app.ai_changes import build_candidate, model_context, month_name, month_number
from app.ai_schemas import Extraction
from app.schemas import GameState


EVALUATION_VERSION = 'change-eval-v1'


def rules_extract(message, context):
    """Conservative single-request baseline; missing details are never guessed."""
    def question(status='needs_clarification'):
        return Extraction(status=status, changes=[], question='지원 항목의 금액과 적용 연월을 확인해주세요.')
    if re.search(r'주식|매수|매도|대출|금리|이자율|환율|부동산|비트코인|세금|펀드|서버|SQL', message, re.I):
        return question('unsupported')
    fields = [('income', r'소득|월급|수입'), ('expense', r'생활비|지출'), ('monthlySaving', r'저축')]
    matched = [field for field, pattern in fields if re.search(pattern, message)]
    amounts = re.findall(r'(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|원)', message)
    if len(matched) != 1 or len(amounts) != 1 or re.search(r'말고|않|절반|비슷|정도|쯤|좋을까|%|또는|부터.*부터', message):
        return question()
    number, unit = amounts[0]
    value = Decimal(number.replace(',', '')) * (10000 if unit.replace(' ', '') == '만원' else 1)
    if value != value.to_integral_value() or not 0 <= value <= 10_000_000_000:
        return question()
    if re.search(r'(?:만\s*원|원)\s*(?:으로|로)|설정|고정', message):
        operation = 'set'
    elif re.search(r'줄|낮|감소|덜', message):
        operation = 'subtract'
    elif re.search(r'늘|올|증가|추가|더', message):
        operation = 'add'
    else:
        return question()
    # This baseline intentionally does not support bounded/compound requests.
    if re.search(r'까지|동안|한\s*달|한\s*개월|이번 달|오늘|올해|후부터|뒤부터', message):
        return question()
    start = context['nextMonth']
    absolute = re.search(r'(\d{4})년\s*(\d{1,2})월', message)
    relative = re.search(r'내년\s*(\d{1,2})월', message)
    iso = re.search(r'(?<!\d)(\d{4}-\d{2})(?!\d)', message)
    if absolute:
        start = f'{int(absolute[1]):04d}-{int(absolute[2]):02d}'
    elif relative:
        start = f'{int(context["currentMonth"][:4])+1:04d}-{int(relative[1]):02d}'
    elif iso:
        start = iso[1]
    elif re.search(r'\d+월|분기|내후년|다다음|며칠|언젠가', message):
        return question()
    elif '부터' in message and not re.search(r'다음\s*달부터', message):
        return question()
    try:
        return Extraction.model_validate({'status': 'ready', 'changes': [{
            'field': matched[0], 'operation': operation, 'amount': int(value),
            'startMonth': start, 'endMonth': None}], 'question': None})
    except ValueError:
        return question()


def evaluation_state(case):
    month = month_number(case['currentMonth']) - month_number('2026-10')
    return GameState.model_validate({
        'initial': {'name': '비식별 평가 조건', 'age': 25, 'avatar': 'test',
                    'cash': 10000000, 'saved': 0, 'income': 2500000, 'expense': 1600000, 'target': 20000000},
        'monthlySaving': 700000, 'annualRate': 0, 'month': month,
    }).model_dump(mode='json')


def comparable(value):
    return {'status': value['status'], 'changes': value.get('changes', [])}


def score(case, extraction):
    predicted = extraction.model_dump()
    raw_exact = comparable(predicted) == comparable(case['expected'])
    final_status = extraction.status
    if extraction.status == 'ready':
        try:
            build_candidate(evaluation_state(case), extraction.changes)
        except ValueError:
            final_status = 'invalid_change'
    final_exact = final_status == case['expectedFinalStatus'] and (
        raw_exact if final_status == 'ready' else True)
    return {'rawExact': raw_exact, 'finalStatus': final_status, 'finalExact': final_exact,
            'wrongApplication': final_status == 'ready' and not (raw_exact and case['expectedFinalStatus'] == 'ready')}


async def evaluate_case(case, mode, repetition):
    started = time.perf_counter()
    row = {'caseId': case['id'], 'category': case['category'], 'repetition': repetition,
           'expectedStatus': case['expected']['status'], 'expectedFinalStatus': case['expectedFinalStatus'],
           'rawExact': False, 'finalExact': False, 'wrongApplication': False, 'usage': None}
    try:
        context = model_context(evaluation_state(case))
        if mode == 'rules':
            extraction = rules_extract(case['request'], context)
            raw = {'text': extraction.model_dump_json(), 'usage': None}
        else:
            raw = await llm.request_raw(case['request'], context, structured=(mode == 'structured'))
            # Keep the raw response for format-error analysis before server validation.
            row['rawResponse'] = raw['text']
            row['usage'] = raw['usage']
            extraction = llm.parse_extraction(raw['text'])
        row.update(score(case, extraction))
        row['prediction'] = extraction.model_dump()
    except HTTPException as error:
        row.update(error=error.detail, finalStatus='error')
    finally:
        row['latencyMs'] = round((time.perf_counter() - started) * 1000, 3)
    return row


def summarize(rows):
    count = len(rows)
    applied = [row for row in rows if row.get('finalStatus') == 'ready']
    ready = [row for row in rows if row['expectedStatus'] == 'ready']
    questions = [row for row in rows if row['expectedStatus'] == 'needs_clarification']
    def rate(n, d):
        return n / d if d else None
    durations = sorted(row['latencyMs'] for row in rows)
    usage = [row['usage'] for row in rows if row['usage']]
    return {'attempts': count, 'rawExactRate': rate(sum(row['rawExact'] for row in rows), count),
            'readyConditionExactRate': rate(sum(row['rawExact'] for row in ready), len(ready)),
            'finalExactRate': rate(sum(row['finalExact'] for row in rows), count),
            'wrongApplications': sum(row['wrongApplication'] for row in rows), 'appliedCount': len(applied),
            'wrongApplicationRateOfApplied': rate(sum(row['wrongApplication'] for row in rows), len(applied)),
            'clarificationRecall': rate(sum(row.get('finalStatus') == 'needs_clarification' for row in questions), len(questions)),
            'errors': sum(row.get('finalStatus') == 'error' for row in rows),
            'meanLatencyMs': sum(durations) / count if count else None,
            'p95LatencyMs': durations[max(0, (95 * count + 99) // 100 - 1)] if count else None,
            'inputTokens': sum(item.get('input_tokens', 0) for item in usage) if usage else None,
            'outputTokens': sum(item.get('output_tokens', 0) for item in usage) if usage else None,
            'costUsd': None}


def configuration(dataset_path: Path, mode: str, model: str | None):
    source = Path(__file__).parent
    code = b''.join((source / name).read_bytes() for name in ['ai_evaluation.py', 'ai_changes.py', 'ai_schemas.py', 'schemas.py', 'llm.py'])
    code += (source.parent.parent / 'Test/ai/evaluate.py').read_bytes()
    return {'evaluationVersion': EVALUATION_VERSION, 'datasetSha256': hashlib.sha256(dataset_path.read_bytes()).hexdigest(),
            'codeSha256': hashlib.sha256(code).hexdigest(), 'mode': mode, 'model': model,
            'promptVersion': llm.PROMPT_VERSION, 'maxOutputTokens': 2500 if mode != 'rules' else None,
            'sampling': 'provider-default' if mode != 'rules' else 'deterministic'}
