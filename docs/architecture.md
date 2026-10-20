# 개발 구조와 모듈 경계

이 구조는 Notion의 `개발 환경과 패키지 구조`, `DB와 API 계약`, `금융 계산 명세와 검증`, `LLM 설계와 성능 실험`을 로컬 작업 경로에 반영한다.

```text
Client             게임 화면·스타일·프론트 상태·API 호출
Server             API·DB·LLM·토스증권 연동
Engine             독립 금융 계산 로직
Shared             공통 타입·검증 스키마
Test               통합 테스트·엔진 회귀·AI 평가
fixtures           공통 비식별 입력·기대 결과
docs               개발·API·계산 명세
prototype          기존 정적 초안 원본
```

## 현재 결정

- 기존 정적 초안은 `prototype`에 동일본으로 보관했다.
- 현재 실행본은 `Client`와 `Engine`으로 분리했다.
- 실행 가능한 상태를 유지하기 위해 루트 개발 서버가 웹 파일과 엔진 파일만 명시적으로 제공한다.
- 서버·공통 계약·테스트는 기술 스택 합의 전이므로 README와 명세만 준비했다.
- `dist`는 향후 빌드 산출물 전용이며 Git에 포함하지 않는다.
- Notion과 동일한 `Client`, `Server`, `Engine`, `Shared`, `Test` 경로명을 사용한다.
- npm workspaces로 역할 경계를 선언하고 루트 lockfile 하나를 사용한다.
- 각 workspace의 실제 의존성은 해당 구현을 시작할 때 추가한다.

## 현재 의존 방향

```text
Client ──> Engine
Test ───> Engine
scripts ─> Client + Engine 또는 prototype 제공
```

현재 Client는 정적 스크립트로 Engine을 직접 불러온다. `Engine`은 Client, Server, DB에 의존하지 않는다.

## 서버 연동 후 목표 방향

```text
Client ──> Shared <── Server ──> Engine
                         ├─────> DB
                         ├─────> LLM
                         └─────> 토스증권 어댑터
Test ───> Client + Server + Engine
```

LLM은 `Server` 내부에서 계산 결과를 설명하되 금융 수치를 직접 산출하지 않는다. 외부 API와 비밀정보는 Server 경계를 넘겨 브라우저에 전달하지 않는다.

## 예시 구조에서 적용하지 않은 항목

- `Client/public`, `Client/src/assets`: 실제 정적 자산이 추가될 때 생성한다.
- React·TypeScript 세부 폴더: 이전 작업을 시작할 때 실제 코드와 함께 생성한다.
- Cypress 기본 예제: 테스트 도구 선정 후 프로젝트 시나리오만 추가한다.
- React·Vite 파일: 기술 전환 결정 전에는 현재 HTML·CSS·JavaScript 실행을 유지한다.

## 다음 합의 항목

1. 현재 정적 JavaScript client를 유지한 상태에서 Node.js 서버 프레임워크 확정
2. Plan·Event·Run 계약 및 원 단위·반올림 규칙 확정
3. 패키지 관리자·런타임 버전 고정
4. PostgreSQL 초기화와 테스트 명령 확정
5. 배포 방식과 환경변수 이름 검토

