# Decisions

## 현재 결정

- 기존 HTML·CSS·JavaScript 초안은 유지하고 React·TypeScript 이전은 별도 작업으로 진행한다.
- npm workspaces는 `Client`, `Server`, `Engine`, `Shared`, `Test`로 구성하고 lockfile은 루트에서 하나만 관리한다.
- 실시간 멀티플레이가 없는 MVP에는 socket.io를 사용하지 않는다.
- LLM은 별도 Python 서비스가 아니라 초기에는 `Server` 내부 어댑터로 구성한다.
- 금융 수치와 목표 시점은 LLM이 아닌 `Engine`에서 산출한다.
- ORM, 인증 방식, 배포 공급자와 토스증권 인증 방식은 아직 확정하지 않는다.

결정이 바뀌면 날짜, 근거, 영향받는 계약·테스트와 승인자를 함께 기록한다.
