# API 명세 초안

현재 Server API는 미구현이며 아래 계약은 Client·Server 통합을 위한 기준 초안이다.

## 데이터 경계

- Plan: 시작월, 기간, 초기 자산, 현금흐름, 가정, 목표와 버전
- Event: 적용 계획, 종류, 시작·종료 월, 필드, 연산, 값
- Run: 계획 스냅샷, 엔진 버전, 월별 결과, 요약과 생성 시각
- AIRequest: 질문, 추출 변경값, 확인 상태, 도구 호출, 모델·프롬프트 버전과 오류

금액은 API에서 정수 원을 사용하고, 월 인덱스 0은 시작 상태로 정의한다. 화면의 만 원 표시는 Client에서 변환한다.

## 엔드포인트 초안

- `POST /plans`, `GET /plans/{id}`
- `POST /plans/{id}/branches`
- `POST /simulations`, `GET /simulations/{id}`
- `POST /comparisons`
- `POST /ai/parse-change`, `POST /ai/explain`
- `POST /ai/compare-plans`

오류는 `VALIDATION_ERROR`, `NEEDS_CLARIFICATION`, `EXTERNAL_API_ERROR`, `MODEL_OUTPUT_INVALID`, `RUN_NOT_FOUND`를 구분한다. 인증정보와 계좌 식별자는 응답이나 LLM 입력에 포함하지 않는다.

## 첫 통합 범위

첫 연결은 계획 생성·조회와 12개월 계산이다. 동일 입력 스냅샷과 기대 결과로 Client·Server·Engine을 검증한 뒤 120개월·이벤트·AI로 확장한다. AI 후보는 사용자 확인 전 확정 계획에 반영하지 않는다.

