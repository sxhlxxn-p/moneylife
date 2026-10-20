# 팀 협업 가이드

## 저장소 원칙

- 프로젝트 루트 하나만 Git 저장소로 사용하고 하위 폴더에 별도 `.git`을 만들지 않는다.
- 기능 브랜치에서 작업하고 `main` 반영 전 Pull Request와 최소 1명의 리뷰를 거친다.
- 빌드 결과, `node_modules`, 환경변수와 인증정보는 커밋하지 않는다.
- 새 의존성을 추가하면 설치 이유와 실행 방법을 같은 PR에서 문서화한다.

## 소유 영역

- `Client`: 화면, 스타일, 브라우저 상태와 API 호출
- `Server`: API, DB, 인증, LLM과 외부 자산 조회
- `Engine`: 결정론적 금융 계산
- `Shared`: Client·Server·Engine 공통 계약과 검증
- `Test`: 통합 테스트, 회귀 fixture와 AI 평가
- `fixtures`: 모든 영역이 공유하는 비식별 입력과 기대 결과
- `docs`: 합의된 개발·API·계산 명세
- `prototype`: 읽기 전용으로 보관하는 초기 정적 초안

한 작업이 여러 영역을 바꾸면 계약 변경을 `Shared`와 `docs`에 먼저 반영하고 관련 담당자를 리뷰어로 지정한다.

## 작업 흐름

1. 작업 시작 전 `main` 최신 상태와 관련 명세를 확인한다.
2. 변경 범위를 한 역할 단위로 작게 유지한다.
3. `npm run check`와 `npm test`를 실행한다.
4. 실행 방법, 환경변수 또는 데이터 형식이 바뀌면 README와 명세도 수정한다.
5. PR 설명에 변경 영역, 검증 결과, 미완료 사항과 화면 변경 캡처를 남긴다.

## 경로와 이름

- Notion의 workspace 명칭과 동일하게 `Client`, `Server`, `Engine`, `Shared`, `Test`의 대소문자를 유지한다.
- 각 역할 폴더는 workspace `package.json`을 갖고 lockfile은 루트 하나만 관리한다. 하위 `node_modules`와 lockfile은 커밋하지 않는다.
- 파일이 생기기 전에는 빈 `public`, `assets`, `src`, Cypress 예제 폴더를 미리 만들지 않는다.
- `prototype`은 버그 수정 대상이 아니다. 새 작업은 역할별 workspace에서 진행한다.

현재 폴더 구조는 `npm run tree`로 확인할 수 있다.
