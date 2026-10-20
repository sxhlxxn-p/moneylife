# 처음 시작하기

## 저장소 복제와 실행

Git과 Node.js 18 이상, npm이 필요하다. 팀 공통 런타임 버전 고정은 아직 합의 전이다.

```bash
git clone https://github.com/sxhlxxn-p/moneylife.git
cd moneylife
npm ci
npm run dev:client
```

브라우저에서 <http://localhost:5173>을 연다. 종료는 `Ctrl+C`다. 현재 화면과 엔진은 실제 API 키, DB, `.env` 없이 실행할 수 있다. `.env.example`은 향후 연동에 필요한 변수 안내이며 Node 개발 서버는 `.env`를 자동으로 읽지 않는다.

## 개인 브랜치에서 작업

```bash
git switch main
git pull --ff-only
git switch -c <본인-브랜치명>
```

이미 작업 중인 변경이 있다면 브랜치를 바꾸거나 main을 반영하기 전에 커밋 또는 백업한다. 충돌 해결 기준과 리뷰 예외는 [협업 규칙](../CONTRIBUTING.md)을 따른다.

## 담당 영역 확인

현재 화면은 `Client`, 금융 계산은 `Engine`, 회귀 검증은 `Test`에 있다. `Server`와 `Shared`는 계획과 패키지 경계가 준비된 상태다. [문서 목차](README.md)에서 담당 영역의 README와 Guideline을 확인한다.

의존성은 루트에서 설치하고 루트 `package-lock.json` 하나를 공유한다. 특정 영역에 의존성을 추가할 때는 `npm install <패키지명> --workspace <영역>`을 사용하고 설치 이유와 실행 방법을 문서에 남긴다.

## PR 전 확인

```bash
npm run check
npm test
npm run tree
```

변경 내용을 커밋해 본인 브랜치로 push하고 `main` 대상 PR을 만든다. 자동으로 표시되는 PR 양식에 변경 내용과 검증 결과를 적고, Assignee는 본인으로 지정한다. 일반 변경은 관련 영역 팀원 또는 팀장 `@sxhlxxn-p`에게 리뷰를 요청하고, PR 링크를 팀 채팅에 공유한다.
