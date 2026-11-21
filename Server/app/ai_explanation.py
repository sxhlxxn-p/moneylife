"""Generate prose with server-bound numeric references. Author: sxhlxxn."""
import json
import os
import re

from fastapi import HTTPException
from pydantic import Field, ValidationError
from typing import Literal

from app import llm
from app.schemas import StrictModel


PROMPT_VERSION = 'metric-facts-v2'
TOKENS = ('baseGoal', 'candidateGoal', 'assetDifference', 'shortageDifference')


class ExplanationText(StrictModel):
    text: str = Field(min_length=1, max_length=1000)


def bindings(comparison):
    def goal(month):
        return '기간 내 미달성' if month is None else ('시작 시점 달성' if month == 0 else f'{month}개월차')
    return {'baseGoal': goal(comparison['baseGoalMonth']),
            'candidateGoal': goal(comparison['candidateGoalMonth']),
            'assetDifference': f'{comparison["finalAssetsDifference"]:+,}원',
            'shortageDifference': f'{comparison["shortageMonthsDifference"]:+d}개월'}


def render_verified(text, comparison):
    """Only trusted placeholders may carry numbers; model-generated literals are refused."""
    references = re.findall(r'\{\{(.*?)\}\}', text)
    if set(references) != set(TOKENS) or len(references) != len(TOKENS):
        raise ValueError('Missing or unknown metric')
    prose = re.sub(r'\{\{.*?\}\}', '', text)
    if re.search(r'\d|[{}%]|(?:[영공일이삼사오육칠팔구십백천만억조]+|한|두|세|네|다섯|여섯|열|스무|서른)\s*(?:원|개월|년|배|달|퍼센트)', prose):
        raise ValueError('Unbound numeric claim')
    allowed = ('기존 목표는 {{baseGoal}}, 변경 목표는 {{candidateGoal}}입니다.',
               '자산 차이는 {{assetDifference}}, 현금 부족 기간 차이는 {{shortageDifference}}입니다.',
               '가정에 따른 비교입니다.')
    if text != ' '.join(allowed):
        raise ValueError('Only server-authored legacy clauses are supported')
    result = text
    for key, value in bindings(comparison).items():
        result = result.replace('{{' + key + '}}', value)
    return result


class FactOrder(StrictModel):
    selectedIds: list[Literal['goal', 'assets', 'liquidity', 'assumptions']] = Field(min_length=4, max_length=4)


def facts_for(comparison):
    values = bindings(comparison)
    assets = comparison['finalAssetsDifference']
    shortage = comparison['shortageMonthsDifference']
    asset_text = '두 계획의 기간 말 순자산이 같습니다.' if assets == 0 else f'변경 계획의 기간 말 순자산이 기존보다 {abs(assets):,}원 ' + ('높습니다.' if assets > 0 else '낮습니다.')
    shortage_text = '두 계획의 현금 부족 기간이 같습니다.' if shortage == 0 else f'변경 계획의 현금 부족 기간이 기존보다 {abs(shortage)}개월 ' + ('많습니다.' if shortage > 0 else '적습니다.')
    return {'goal': f"목표 최초 달성은 기존 {values['baseGoal']}, 변경 후 {values['candidateGoal']}입니다.",
            'assets': asset_text, 'liquidity': shortage_text,
            'assumptions': '동일한 기간과 입력 가정의 계산 결과이며 실제 미래 수익을 보장하지 않습니다.'}


async def generate(comparison, fallback):
    if not os.getenv('OPENAI_API_KEY') or not os.getenv('LLM_MODEL') or os.getenv('LLM_PROVIDER', 'openai') != 'openai':
        return {'text': fallback, 'source': 'template', 'attempts': 0,
                'fallbackReason': 'LLM_NOT_CONFIGURED', 'verifiedNumbers': True}
    facts = facts_for(comparison)
    user = json.dumps({'facts': facts}, ensure_ascii=False)
    for attempt in range(1, 3):
        try:
            response = await llm.call_response({
                'model': os.environ['LLM_MODEL'], 'store': False, 'max_output_tokens': 400,
                'input': [{'role': 'system', 'content': '서버가 작성한 네 사실의 읽기 순서만 정한다. selectedIds에 네 ID를 각각 한 번 넣는다. 문장·숫자·원인은 작성하지 않는다.'},
                          {'role': 'user', 'content': user}],
                'text': {'format': {'type': 'json_schema', 'name': 'comparison_fact_order',
                                    'strict': True, 'schema': llm.schema(FactOrder)}}},
                timeout=8, prompt_version=PROMPT_VERSION)
            order = FactOrder.model_validate_json(response['text']).selectedIds
            if len(set(order)) != 4:
                raise ValueError('Duplicate fact')
            return {'text': '\n'.join(facts[key] for key in order), 'source': 'llm', 'attempts': attempt,
                    'fallbackReason': None, 'verifiedNumbers': True}
        except HTTPException as error:
            if error.detail != 'MODEL_OUTPUT_INVALID':
                return {'text': fallback, 'source': 'template', 'attempts': attempt,
                        'fallbackReason': error.detail, 'verifiedNumbers': True}
        except (ValueError, ValidationError, KeyError, TypeError):
            pass
        user += '\nID 중복·누락 없이 네 사실을 모두 선택해주세요.'
    return {'text': fallback, 'source': 'template', 'attempts': 2,
            'fallbackReason': 'EXPLANATION_VALIDATION_FAILED', 'verifiedNumbers': True}
