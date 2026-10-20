# Server LLM 영역

자연어 조건 추출, 계산 도구 호출, 지표 기반 해설은 Server가 소유한다. 금액과 목표 시점의 최종 계산은 LLM이 아니라 `../Engine`이 담당한다.

계획된 도구:

- `get_current_plan`
- `run_simulation`
- `compare_plans`
- `find_cash_shortfall`

모델·프롬프트가 확정되면 Server 내부 모듈로 구현한다. 평가 데이터는 `../Test`에서 관리하고, 비밀키와 원본 계좌 식별자는 입력이나 fixture에 저장하지 않는다.

