# 자연어 조건 변경 v1

현재 범위는 사용자 승인형 조건 변경이다. LLM은 소득·생활비·월 저축의 항목, set/add/subtract 연산, 정수 원 금액, 시작/종료 연월을 구조화한다. 금융 금액·목표 시점은 기존 Engine이 계산한다. 주식 주문·금리·대출·자동 계획 탐색은 이 API에서 실행하지 않는다.

- `POST /ai/parse-change`: `{planId, message}`. 본인 소유의 불변 Plan을 기준으로 해석한다. ready이면 DB에 30분 유효한 변경안과 검증된 후보 상태를 보관하고 proposalId·원문·항목·기간·요약을 반환한다. 이 단계에서는 새 Plan·Run을 만들지 않는다.
- 정보가 부족하면 `needs_clarification`과 question, 미지원 요청은 `unsupported`를 반환한다. 질문에 대한 답은 원래 요청과 함께 완성된 문장으로 재요청한다. 채팅 이력을 자동 추측하지 않는다.
- `POST /ai/proposals/{id}/apply`: `{confirmed: true}`. 저장된 변경안만 적용한다. 사용자가 보낸 변경 상태를 신뢰하지 않는다. 원본과 후보를 엔진으로 계산한 뒤 새 Plan·Run과 적용 상태를 한 트랜잭션으로 저장한다. 원본은 보존한다. 같은 변경안의 재확인은 기존 Plan·Run을 반환한다.
- 응답에는 같은 120개월 시점의 비교 수치와 정형 설명을 포함한다. 승인 직후 설명은 정형 문장이다. 별도 설명 API에서 서버가 사실 문장을 작성하고 모델은 사실 ID의 순서만 선택한다.

## 월·금액과 변경 의미

기준 연월은 실제 오늘이 아니라 `state.startMonth + state.month`다. index 0은 시작 월, index 1은 다음 월이다. 적용은 현재 진행 월 다음부터 120개월 이내만 허용한다. 시점이 없으면 다음 월부터, 종료가 없으면 시뮬레이션 종료까지로 해석하고 확인 화면에 표시한다. 명시된 시점이 불명확하면 질문한다.

set은 지정 기간의 해당 항목을 고정 값으로, add/subtract는 기존 각 월의 값에 금액을 가감한다. 기존 이벤트를 포함한 각 월의 상태에서 계산하고 연속 구간으로 변환한다. 기간 밖의 기존 변화와 다른 필드는 보존한다. 변경 후 소득·지출·저축이 음수이거나 계약 범위를 넘으면 적용하지 않는다. 여러 변경은 문장에 추출된 순서대로 적용한다.

## 외부 모델과 실패

OpenAI Responses API의 strict JSON Schema 출력을 사용한다. 서버가 허용 필드·연산·금액·기간·GameState를 다시 검증한다. 프로필 이름·쿠키·토큰·기록은 모델에 보내지 않는다. 사용자 원문에는 사용자가 직접 적은 정보가 포함될 수 있음을 입력 화면에 안내한다. 키와 모델이 없으면 503 LLM_NOT_CONFIGURED이며 규칙 응답을 LLM 결과로 가장하지 않는다. 호출 실패·거부·불완전 응답·잘못된 출력은 오류로 중단한다.

모델은 `LLM_MODEL`, 키는 `OPENAI_API_KEY`, 공급자는 `LLM_PROVIDER=openai`로 설정한다. 모델을 임의로 고정하지 않는다. 제공자 응답은 테스트 대역으로 검증하며, 실제 모델 성능은 API 키 연결 후 평가한다.

## 설명 API

`POST /ai/explain`: `{runId}`. 본인 소유이며 aiComparison이 있는 Run만 허용한다. `text, source: llm|template, attempts, fallbackReason, verifiedNumbers`를 반환한다. 성공한 모델 선택 순서의 설명은 별도 테이블에 저장하며 Run은 불변이다. goal/assets/liquidity/assumptions의 네 ID를 중복·누락 없이 선택해야 한다. 문장과 수치는 서버가 작성한다. ID 중복·누락이나 직접 작성한 문장은 한 번 재요청한 뒤 정형 설명으로 대체한다. 모델 호출은 8초 제한을 적용하며 HTTP 장애는 즉시 대체한다. source=llm은 사실 문장의 순서 선택에 모델이 참여했다는 의미다.

## 승인 화면 상세

ready 응답은 기존 preview 문자열과 함께 previewDetails를 제공한다. 각 항목은 field/label/operation/amount/startMonth/endMonth와 segments를 포함한다. 각 segment는 startMonth/endMonth/before/after이며 금액은 정수 원이다. 기존 미래 변경으로 값이 달라지는 구간을 나누어 표시하고, 복합 요청은 앞선 변경을 반영한 순서대로 보여준다. 직접 모델 출력이 아닌 서버 계산 조건이다. 세부 대화·수정 정책은 docs/ai-clarification-policy.md를 따른다. 보충 답변은 clarificationId를 통해 원래 요청과 같은 계획에 연결한다.


조건 추출 평가 데이터와 실행기는 `Test/ai/README.md`를 따른다. 실제 모델 평가와 오프라인 규칙 기준선 결과를 구분한다.
