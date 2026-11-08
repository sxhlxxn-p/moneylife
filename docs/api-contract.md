# API 명세 초안

계획 스냅샷 생성·목록·조회 API는 구현했다. 서버 계산·Run 저장·조회도 구현했다. LLM 변경안 해석·사용자 승인·계산·비교 저장 흐름도 구현했다. 지표 연결 설명 API도 구현했다. 독립 비교·자율 탐색은 후속 구현 대상이다. 이번 통합 계약은 `../Shared/plan-contract.md`, 실행 안내는 `first-integration.md`를 참고한다.

## 데이터 경계

- Plan: 시작월, 기간, 초기 자산, 현금흐름, 가정, 목표와 버전
- Event: 적용 계획, 종류, 시작·종료 월, 필드, 연산, 값
- Run: 계획 스냅샷, 엔진 버전, 월별 결과, 요약과 생성 시각
- AIRequest: 질문, 추출 변경값, 확인 상태, 도구 호출, 모델·프롬프트 버전과 오류

금액은 API에서 정수 원을 사용하고, 월 인덱스 0은 시작 상태로 정의한다. 화면의 만 원 표시는 Client에서 변환한다.

## 엔드포인트 초안

- 구현: `POST /plans`, `GET /plans?limit=20&offset=0`, `GET /plans/{id}`
- `POST /plans/{id}/branches`
- 구현: `POST /simulations`, `GET /simulations?planId={id}&limit=20`, `GET /simulations/{id}`
- `POST /comparisons`
- 구현: `POST /ai/parse-change`, `POST /ai/proposals/{id}/apply`
- 구현: `POST /ai/explain` (비교 결과가 있는 본인 Run, 수치 연결·실패 시 정형 설명)
- `POST /ai/compare-plans`

오류는 `VALIDATION_ERROR`, `NEEDS_CLARIFICATION`, `EXTERNAL_API_ERROR`, `MODEL_OUTPUT_INVALID`, `RUN_NOT_FOUND`를 구분한다. 인증정보와 계좌 식별자는 응답이나 LLM 입력에 포함하지 않는다.

## 첫 통합 범위

현재 연결은 계획 생성·조회와 서버 1~120개월 계산이다. 화면의 저장 버튼은 120개월을 실행한다. 상세 입력·결과·중복 요청·이자 정책은 `Shared/simulation-contract.md`를 따른다. AI 후보는 사용자 확인 전 확정 계획에 반영하지 않는다.


자연어 변경·기간·승인·오류 계약은 [AI 변경 계약](../Shared/ai-change-contract.md)을 따른다. 외부 모델 실제 호출은 키와 모델 설정 후 확인해야 한다.
