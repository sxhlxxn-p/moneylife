# 머니 라이프 · 금융 미래 시뮬레이터

현재 소득·지출·자산과 목표를 입력하고 생애 이벤트와 조건 변경에 따라 10년의 금융 경로를 비교하는 웹 서비스다. 현재 기술 스택인 HTML·CSS·JavaScript client와 Node.js 개발 서버를 유지하면서 Notion 기획의 workspace 경계를 반영한다.

## 실행

Node.js 18 이상에서 저장소 루트의 workspace 의존성을 설치한다.

```bash
npm ci
```

현재 Client 실행:

```bash
npm run dev:client
```

브라우저에서 <http://localhost:5173>에 접속한다. 종료는 터미널에서 `Ctrl+C`를 누른다.

구조 변경 전 정적 초안은 별도 명령으로 확인할 수 있다.

```bash
npm run prototype
```

문법 검사는 다음 명령으로 실행한다.

```bash
npm run check
```

금융 계산 회귀 테스트와 폴더 구조 확인은 다음 명령을 사용한다.

```bash
npm test
npm run tree
```

## 저장소 구조

```text
Client/                게임 화면·스타일·프론트 상태·API 호출
Server/                API·DB·LLM·토스증권 연동
Engine/                독립 금융 계산 로직
Shared/                공통 타입·검증 스키마
Test/                  통합 테스트·엔진 회귀·AI 평가
fixtures/              영역들이 공유하는 비식별 예시·기대 결과
docs/                  개발·API·계산 명세
prototype/             기존 정적 초안 원본
scripts/               공통 개발 도구
CONTRIBUTING.md         브랜치·PR·영역별 협업 규칙
```

세부 경계와 다음 합의 항목은 [docs/architecture.md](docs/architecture.md)를 참고한다.

루트 `package.json`은 `Client`, `Server`, `Engine`, `Shared`, `Test`를 npm workspaces로 관리한다. 각 영역의 `package.json`은 경계와 실행 명령을 정의하며 `package-lock.json`과 설치된 의존성은 루트에서 한 번만 관리한다.

## 구현 상태

현재 `Client`에는 예시 데이터, 월별 계산, 이벤트 선택, 자산·계획 비교와 로컬 저장이 구현되어 있다. 실제 LLM, 토스증권 API, 사용자 인증, PostgreSQL과 Server API는 아직 연결되지 않았다.

이번 구조 정리는 기존 HTML·CSS·JavaScript와 Node.js 실행 방식을 보존한다. React·TypeScript 전환, 서버 프레임워크와 스키마 라이브러리 선택은 후속 합의 사항이다.

## 데이터와 비밀정보

- 현재 프로토타입 금액 단위는 만 원이며, 공통 API 계약에서는 정수 원 단위로 통일할 예정이다.
- 실제 키와 토큰은 `.env`에만 두고 Git에 올리지 않는다.
- 필요한 변수 이름은 `.env.example`에 기록한다.
- 실제 계좌·개인 식별 데이터는 `fixtures`와 `Test`에 넣지 않는다.

## 협업

팀장은 수현([@sxhlxxn-p](https://github.com/sxhlxxn-p))이다. 리뷰어를 정하기 어렵거나 영역 간 조율이 필요하면 팀장에게 요청한다.

기능 작업은 개인 브랜치에서 진행하고 PR을 통해 `main`에 반영한다. 일반 변경은 최소 1명의 리뷰 승인을 받고, 다른 workspace와 겹치지 않는 간단한 작업이나 동작에 영향이 없는 문서 변경은 리뷰어 없이 셀프 머지할 수 있다. PR의 Assignees는 본인으로 지정한다. 설치한 모듈과 실행 방법은 문서로 남긴다. 전체 작업 방식은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따른다.
