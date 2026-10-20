# Server

현재 서버는 미구현이다. 기술 스택 합의 후 이 경로에 팀이 선택한 Node.js 서버 프레임워크를 구성한다.

- 사용자 인증 및 금융 계획 저장·조회
- 금융 시뮬레이션 실행 API
- LLM 요청 처리 및 계산 도구 호출
- 토스증권 API 연동 가능 범위 확인 후 서버 측 연동

API 초안은 `../docs/api-contract.md`, 계산 규칙은 `../docs/simulation-rules.md`, 화면 연결은 `../docs/FRONTEND_HANDOFF.md`를 참고한다.
API 비밀키는 프론트엔드 코드에 넣지 않고 서버 환경변수로 관리한다.

## 팀 작업 기준

- 요청 검증과 단위 변환은 API 경계에서 수행한다.
- 금융 결과는 `../Engine`을 호출해 계산하고 Server나 LLM에서 다시 구현하지 않는다.
- Client·Server 공통 필드는 `../Shared`에서 합의한 뒤 변경한다.
- LLM과 토스증권 연동은 실패해도 수동 시뮬레이션이 동작하도록 어댑터 경계로 분리한다.
- 서버 프레임워크가 확정되기 전에는 실행되지 않는 빈 라우트나 DB 파일을 만들지 않는다.

세부 계획은 `IMPLEMENTATION.md`, `LLM_IMPLEMENTATION.md`, `../docs/llm-evaluation.md`에 정리되어 있다.

Server 실행 스크립트는 실제 Express 진입점과 `/health`가 구현되는 작업에서 추가한다. 현재는 동작하지 않는 `dev:server` 명령을 만들지 않는다.
