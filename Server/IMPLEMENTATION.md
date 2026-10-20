# Server 구현 계획

Node.js 서버 프레임워크와 PostgreSQL 접근 방식이 확정되면 `Server` 아래에 구현한다. 현재는 빈 구현 파일을 만들지 않는다.

예정 경계:

- 계획 저장·조회와 버전 관리
- 시뮬레이션·비교 API 조정
- 인증과 환경변수 관리
- LLM 및 외부 자산 조회 어댑터 호출

API 계약은 `../docs/architecture.md`, `../docs/api-contract.md`와 Notion의 `DB와 API 계약`을 기준으로 한다.

