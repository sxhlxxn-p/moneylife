"""Facts bound to immutable investment results. Author: sxhlxxn."""
import json
import os
from typing import Literal

from fastapi import HTTPException
from pydantic import Field, ValidationError
from app import llm
from app.paper_schemas import PaperEngineComparison
from app.investment_engine import validate_result
from app.schemas import StrictModel
from app.settings import configuration_status

PROMPT_VERSION = 'paper-facts-v1'
FactId = Literal['comparison', 'portfolio', 'pnl', 'goal', 'liquidity', 'orders', 'assumptions', 'valuation']

class Fact(StrictModel):
    id: FactId
    title: str
    text: str

class FactSelection(StrictModel):
    selectedIds: list[FactId] = Field(min_length=4, max_length=7)


def won(value):
    return f'{value:,}원'

def signed(value):
    return f'{value:+,}원' if value else '0원'

def goal(month):
    return '아직 달성하지 못했습니다' if month is None else '시작 시점에 달성했습니다' if month == 0 else f'{month}개월차에 달성했습니다'


def facts_for(run):
    try:
        result = PaperEngineComparison.model_validate(run.result)
        invested, baseline = result.invested, result.baseline
        rows = invested.monthlyResults
        current = rows[-1]
        base = baseline.monthlyResults[-1]
        month = current.month
        market = run.input_snapshot['market']
        investment = {key: market[key] for key in ('symbol', 'priceSeriesId', 'prices', 'costs')}
        investment['orders'] = run.input_snapshot['orders']
        validate_result(result, run.input_snapshot['state'], investment, month)
        position = current.investment
        if current.total != current.cash + current.saved + position.marketValue - current.unpaid:
            raise ValueError('Inconsistent assets')
        difference = current.total - base.total
        if difference != result.comparison.finalAssetsDifference:
            raise ValueError('Inconsistent comparison')
        relation = '두 계획의 순자산은 같습니다.' if difference == 0 else f'투자 쪽 순자산이 {won(abs(difference))} ' + ('높습니다.' if difference > 0 else '낮습니다.')
        values = [
            Fact(id='comparison', title='투자하지 않은 경우와 비교', text=f'지금까지 진행한 {month}개월 시점의 순자산은 투자 {won(current.total)}, 비투자 {won(base.total)}입니다. {relation}'),
            Fact(id='portfolio', title='현재 자산 구성', text=f'현금 {won(current.cash)}, 저축 {won(current.saved)}, 주식 평가액 {won(position.marketValue)}에서 누적 미충족 지출 {won(current.unpaid)}을 뺀 순자산입니다. 주식을 사는 원금은 소비 지출로 다시 차감하지 않습니다.'),
            Fact(id='pnl', title='실현 손익과 평가 손익', text=f'지금까지 실현 손익은 {signed(position.realizedPnl)}, 남은 주식의 평가 손익은 {signed(position.unrealizedPnl)}입니다. 납부한 수수료 {won(position.feesPaid)}와 세금 {won(position.taxesPaid)}은 정산에 반영돼 있습니다. 이 손익을 비투자 대비 순자산 차이와 같은 값으로 해석하지 않습니다.'),
            Fact(id='goal', title='지금까지의 목표 달성', text=f'진행한 구간에서 투자 계획은 목표를 {goal(invested.summary.goalMonth)}. 비투자 계획은 {goal(baseline.summary.goalMonth)}. 아직 미달성인 경우 이후에도 도달하지 못한다는 뜻은 아닙니다.'),
            Fact(id='liquidity', title='생활비와 현금 부족', text=f'현금 부족은 투자 {invested.summary.shortageMonths}개월, 비투자 {baseline.summary.shortageMonths}개월입니다. 투자 계획의 누적 미충족 지출은 {won(current.unpaid)}입니다. 주식은 생활비를 위해 자동 매도되지 않으며 이 부족 기록은 실제 대출 잔액이 아닙니다.'),
            Fact(id='orders', title='체결과 대기 중인 주문', text=f'지금까지 체결 {sum(e.status == "filled" for e in invested.executions)}건, 거부 {sum(e.status == "rejected" for e in invested.executions)}건입니다. 현재 대기 중인 주문은 {len(invested.pendingOrders)}건이며 다음 달 가격과 현금으로 체결 여부를 판단합니다.'),
            Fact(id='assumptions', title='결과를 읽을 때의 가정', text=('과거 실제 종가를 재생한 계산입니다.' if run.input_snapshot['market']['dataKind'] == 'historical-market' else '실제 종목과 무관한 가상 가격으로 계산했습니다.') + ' 저장된 거래비용 가정을 사용하며 실제 시장의 모든 세금·비용을 재현하지 않습니다. 배당과 주식 분할은 반영하지 않습니다. 과거 또는 가상 결과는 미래 수익 예측이나 종목 추천이 아닙니다.'),
        ]
        required = {'comparison', 'goal', 'assumptions'}
        if invested.summary.shortageMonths or baseline.summary.shortageMonths or current.unpaid:
            required.add('liquidity')
        if position.stale:
            basis = '확인된 가격이 없습니다' if position.priceMonth is None else f'{position.priceMonth}개월차의 마지막 유효 가격을 사용했습니다'
            values.append(Fact(id='valuation', title='평가 가격의 기준', text=f'현재 월의 유효 가격이 없어 {basis}. 이전 가격을 참고한 평가는 이번 달 실제 체결 가능 가격을 뜻하지 않습니다.'))
            required.add('valuation')
        default = [v.id for v in values if v.id != 'orders'] if position.stale else [v.id for v in values]
        return values, required, default
    except (ValidationError, ValueError, KeyError, TypeError):
        raise HTTPException(503, 'EXPLANATION_INPUT_INVALID') from None


def select_verified(selected, facts, required):
    result = FactSelection.model_validate({'selectedIds': selected}).selectedIds
    available = {fact.id for fact in facts}
    if len(set(result)) != len(result) or not set(result) <= available or not required <= set(result):
        raise ValueError('Invalid fact selection')
    return result


def output(run, facts, selected, *, source='template', attempts=0, fallback_reason=None, cached=False):
    by_id = {fact.id: fact for fact in facts}
    return {'runId': run.id, 'paperPlanId': run.paper_plan_id,
        'throughMonth': run.result['invested']['monthlyResults'][-1]['month'],
        'sections': [by_id[key].model_dump() for key in selected], 'source': source,
        'attempts': attempts, 'fallbackReason': fallback_reason, 'cached': cached,
        'promptVersion': PROMPT_VERSION, 'verifiedFacts': True}


async def rank_facts(facts, required, default):
    config = configuration_status()
    if config['missing'] or not config['providerSupported']:
        return default, 0, 'LLM_NOT_CONFIGURED' if config['missing'] else 'LLM_PROVIDER_UNSUPPORTED'
    system = '''재무 시뮬레이션의 사실 목록에서 읽기 순서를 정한다. 문장이나 수치를 생성하지 않는다.
selectedIds에 목록의 ID만 고르고 중복하지 않는다. 필수 ID는 모두 포함한다.
차이, 목표, 현금 부족, 체결/평가 구분이 잘 드러나도록 선택한다.
모든 문장은 서버가 그대로 연결한다. 추천, 원인 추정, 미래 예측은 하지 않는다.'''
    user = json.dumps({'facts': [fact.model_dump() for fact in facts], 'requiredIds': sorted(required)}, ensure_ascii=False)
    for attempt in range(1, 3):
        try:
            response = await llm.call_response({'model': os.environ['LLM_MODEL'], 'store': False,
                'max_output_tokens': 600, 'input': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
                'text': {'format': {'type': 'json_schema', 'name': 'paper_fact_order', 'strict': True,
                                    'schema': llm.schema(FactSelection)}}}, timeout=8, prompt_version=PROMPT_VERSION)
            selection = FactSelection.model_validate_json(response['text'])
            return select_verified(selection.selectedIds, facts, required), attempt, None
        except HTTPException as error:
            if error.detail != 'MODEL_OUTPUT_INVALID':
                # Only the transport's fixed error codes are suitable for public responses.
                reason = error.detail if isinstance(error.detail, str) and error.detail.startswith('LLM_') and error.detail.replace('_', '').isupper() else 'LLM_UNAVAILABLE'
                return default, attempt, reason
        except (ValidationError, ValueError, KeyError, TypeError):
            pass
        user += '\n선택 검증 실패. 목록의 ID만 사용하고 필수 ID를 모두 포함해주세요.'
    return default, 2, 'EXPLANATION_VALIDATION_FAILED'
