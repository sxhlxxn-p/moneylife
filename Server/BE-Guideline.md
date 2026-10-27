# Backend Guideline

- `Server`는 API, DB, 인증정보, LLM과 토스증권 어댑터를 소유한다.
- 요청과 모델 출력은 `Shared` 스키마로 검증하고 금융 수치는 `Engine`으로 계산한다.
- DB 쿼리는 매개변수화하며 비밀정보를 응답·로그·LLM 입력에 넣지 않는다.
- AI 또는 외부 API 장애에도 수동 시뮬레이션 흐름을 유지한다.
- 구현 전 계약은 `docs/api-contract.md`, 계산 규칙은 `docs/simulation-rules.md`를 기준으로 한다.
- 서버 프레임워크와 DB 방식이 확정되기 전에는 실행되지 않는 빈 라우트·마이그레이션 파일을 만들지 않는다.
- API 테스트를 위한 Swagger는 ./docs로, static한 문서는 ./redoc을 통해 확인한다.