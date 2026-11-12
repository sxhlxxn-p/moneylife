"""Generate prose with server-bound numeric references. Author: sxhlxxn."""
import json
import os
import re

from fastapi import HTTPException
from pydantic import Field, ValidationError

from app import llm
from app.schemas import StrictModel


PROMPT_VERSION = 'metric-explanation-v1'
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
    result = text
    for key, value in bindings(comparison).items():
        result = result.replace('{{' + key + '}}', value)
    return result


async def generate(comparison, fallback):
    if not os.getenv('OPENAI_API_KEY') or not os.getenv('LLM_MODEL') or os.getenv('LLM_PROVIDER', 'openai') != 'openai':
        return {'text': fallback, 'source': 'template', 'attempts': 0,
                'fallbackReason': 'LLM_NOT_CONFIGURED', 'verifiedNumbers': True}
    system = '''개인 재무 시뮬레이션의 두 계획을 짧게 비교한다. 입력된 엔진 지표만 설명한다.
모든 수치는 다음 네 자리표시자로만 표현하고 각각 한 번 사용한다:
{{baseGoal}}, {{candidateGoal}}, {{assetDifference}}, {{shortageDifference}}.
직접 숫자나 한글 금액, 배수, 날짜, 비율을 쓰지 않는다. 기존 목표와 변경 목표를 구분한다.
자산/부족 기간 차이는 변경 계획에서 기존 계획을 뺀 값이다. 방향을 거꾸로 설명하지 않는다.
기간 내 미달성과 시작 시점 달성을 임의 개월로 바꾸지 않는다. 원인을 추측하지 않는다.
실제 미래 예측, 수익 보장, 투자 종목 추천을 하지 않는다. 설정 가정의 비교임을 설명한다.'''
    user = json.dumps({'metrics': comparison, 'displayBindings': bindings(comparison)}, ensure_ascii=False)
    for attempt in range(1, 3):
        try:
            response = await llm.call_response({
                'model': os.environ['LLM_MODEL'], 'store': False, 'max_output_tokens': 1000,
                'input': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
                'text': {'format': {'type': 'json_schema', 'name': 'metric_explanation',
                                    'strict': True, 'schema': llm.schema(ExplanationText)}}},
                timeout=8, prompt_version=PROMPT_VERSION)
            generated = ExplanationText.model_validate_json(response['text'])
            text = render_verified(generated.text, comparison)
            return {'text': text, 'source': 'llm', 'attempts': attempt,
                    'fallbackReason': None, 'verifiedNumbers': True}
        except HTTPException as error:
            if error.detail != 'MODEL_OUTPUT_INVALID':
                return {'text': fallback, 'source': 'template', 'attempts': attempt,
                        'fallbackReason': error.detail, 'verifiedNumbers': True}
        except (ValueError, ValidationError):
            pass
        user += '\n이전 응답 검증 실패: 네 자리표시자를 모두 사용하고 직접 수치를 쓰지 말아주세요.'
    return {'text': fallback, 'source': 'template', 'attempts': 2,
            'fallbackReason': 'EXPLANATION_VALIDATION_FAILED', 'verifiedNumbers': True}
