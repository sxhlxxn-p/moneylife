"""Validate model intents against every affected month. Author: sxhlxxn."""
from copy import deepcopy

from app.schemas import GameState


LABELS = {'income': '월 소득', 'expense': '월 생활비', 'monthlySaving': '월 저축 이체액'}


def month_number(value):
    year, month = map(int, value.split('-'))
    if not 1 <= month <= 12:
        raise ValueError('유효한 연월을 입력해주세요.')
    return year * 12 + month - 1


def month_name(number):
    return f'{number // 12:04d}-{number % 12 + 1:02d}'


def effective(state, field, month):
    value = state['monthlySaving'] if field == 'monthlySaving' else state['initial'][field]
    kind = 'saving' if field == 'monthlySaving' else field
    for change in state['changes']:
        if change['type'] == kind and change['m'] <= month and (change['end'] is None or month <= change['end']):
            value = change['v'] if kind == 'saving' else value + change['v']
    return value


def model_context(state):
    start = month_number(state['startMonth'])
    return {'currentMonth': month_name(start + state['month']),
            'nextMonth': month_name(start + state['month'] + 1),
            'lastMonth': month_name(start + 120)}


def build_candidate(original, intents):
    state = deepcopy(original)
    start = month_number(state['startMonth'])
    preview = []
    for intent in intents:
        begin = month_number(intent.startMonth) - start
        end = month_number(intent.endMonth) - start if intent.endMonth else 120
        if not state['month'] < begin <= end <= 120:
            raise ValueError('적용 기간은 현재 진행 월 다음부터 120개월 이내로 지정해주세요.')
        generated = []
        kind = 'saving' if intent.field == 'monthlySaving' else intent.field
        for month in range(begin, end + 1):
            current = effective(state, intent.field, month)
            desired = intent.amount if intent.operation == 'set' else current + (
                intent.amount if intent.operation == 'add' else -intent.amount)
            if not 0 <= desired <= 10_000_000_000:
                raise ValueError(f'{LABELS[intent.field]}의 변경 후 금액은 0~100억원이어야 합니다.')
            value = desired if kind == 'saving' else desired - current
            if generated and generated[-1]['v'] == value:
                generated[-1]['end'] = month
            else:
                generated.append({'type': kind, 'v': value, 'm': month, 'end': month})
        state['changes'].extend(generated)
        verb = {'set': '설정', 'add': '증가', 'subtract': '감소'}[intent.operation]
        preview.append(f'{intent.startMonth} ~ {intent.endMonth or month_name(start + 120)}: '
                       f'{LABELS[intent.field]} {intent.amount:,}원 {verb}')
    # Reuse the existing contract, including limits and all monthly income/expense checks.
    return GameState.model_validate(state).model_dump(mode='json'), preview
