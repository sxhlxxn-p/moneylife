# Decisions

## 현재 결정

- 기존 HTML·CSS·JavaScript 초안은 유지하고 React·TypeScript 이전은 별도 작업으로 진행한다.
- npm workspaces는 `Client`, `Server`, `Engine`, `Shared`, `Test`로 구성하고 lockfile은 루트에서 하나만 관리한다.
- 실시간 멀티플레이가 없는 MVP에는 socket.io를 사용하지 않는다.
- LLM은 별도 Python 서비스가 아니라 초기에는 `Server` 내부 어댑터로 구성한다.
- 금융 수치와 목표 시점은 LLM이 아닌 `Engine`에서 산출한다.
- ORM, 인증 방식, 배포 공급자와 토스증권 인증 방식은 아직 확정하지 않는다.

결정이 바뀌면 날짜, 근거, 영향받는 계약·테스트와 승인자를 함께 기록한다.

## 첫 저장 통합에서 반영한 결정

- 서버는 taewoo 브랜치의 FastAPI·SQLAlchemy·PostgreSQL 구성을 재사용했다. 로컬 검증용 SQLite 실행 경로를 추가했다.
- 클라이언트의 기존 정적 구현은 보존했다. React 전환과 엔진 TypeScript 전환은 수행하지 않았다.
- 목표는 총자산 기준으로 통일했고, 비상금 경고와 분리했다.
- 계획은 명시적 저장 시 불변 스냅샷으로 생성한다. 현재 계산 결과는 브라우저에서 재계산한다.
- 게스트 세션은 DB에 토큰 해시와 만료 시각을 저장한다. 현재 단계에는 계정 복구가 없다.
- 상위의 스택 미정 항목은 당시 기록이다. 최신 구현은 이 결정과 `first-integration.md`를 따른다.
