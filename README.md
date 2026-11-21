# 머니 라이프

개인의 재무 조건과 선택에 따른 미래 계획을 비교하는 금융 시뮬레이션 프로젝트다.

- 현재 구현·검증 범위: [현재 상태](docs/project-status.md)
- 설치·로컬 실행·검사: [처음 시작하기](docs/getting-started.md)
- 역할별 수정 위치: [개발 구조](docs/architecture.md)
- 기능별 명세: [문서 목차](docs/README.md)
- 브랜치·PR 규칙: [협업 규칙](CONTRIBUTING.md)

현재 스택은 정적 HTML·CSS·JavaScript, FastAPI·SQLAlchemy·Pydantic, 공용 Node.js 계산 엔진이다. Docker 없는 로컬 DB는 SQLite, Compose와 격리 배포 검사는 PostgreSQL을 사용한다. React·TypeScript 전환과 실제 LLM·토스 연결은 구현 완료로 소개하지 않는다.

## 기본 실행

Python 가상환경과 서버 의존성 설치 후 아래 명령을 사용한다. 전체 설치 순서는 처음 시작하기 문서를 따른다.

```bash
npm ci
npm run dev:server:local
# 별도 터미널
npm run dev
```

화면은 http://localhost:5173, API는 http://localhost:3000/docs다. 설치된 외부 API 키 없이 수동 입력·계산·저장·가상 투자 기능을 사용할 수 있다.

## 기본 검사

```bash
npm run verify:backend
```

Python 구문·Node 단위·서버 회귀 검사다. `npm test`만 실행하면 Node 검사만 수행한다. 전체 화면 흐름은 기존 `npm run test:ui`, 실제 PostgreSQL·HTTPS·백업 복원은 GitHub의 별도 작업에서 검사한다. 실제 제공자 호출과 오프라인 검사는 구분한다.

## 저장소

`Client`는 화면, `Server`는 API·DB·외부 연결, `Engine`은 독립 금융 계산, `Shared`는 공통 명세·이벤트 규칙, `Test`는 Node·브라우저·AI 평가를 담당한다. `fixtures`는 비식별 공통 예시, `prototype`은 보관용 초안이다.

npm workspaces와 루트 package-lock 하나를 사용한다. 금융 수치는 정수 원, 이자는 월별 반올림이며 사용자 입력과 계산 결과는 사본으로 보존한다. 실제 키·토큰·개인 계좌 자료를 저장소에 넣지 않는다.
