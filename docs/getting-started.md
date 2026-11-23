# 처음 시작하기

현재 실행 구조와 검증 범위는 [현재 상태](project-status.md), 변경 위치는 [개발 구조](architecture.md)를 기준으로 한다. 과거 진행 보고서는 현재 상태 안내를 대체하지 않는다.

## 설치와 로컬 실행

팀 공통 검증 환경은 Node.js 22와 Python 3.12다. 저장소 루트에서 npm 의존성과 Python 가상환경을 준비한다.

```bash
git clone https://github.com/sxhlxxn-p/moneylife.git
cd moneylife
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r Server/requirements-dev.txt
npm run dev:server:local
```

Windows에서는 가상환경 활성화에 `.venv\Scripts\Activate.ps1`을 사용한다. 화면 개발 서버는 별도 터미널에서 실행한다.

```bash
npm run dev
```

화면은 http://localhost:5173, API는 http://localhost:3000/docs다. 로컬 서버 명령은 DATABASE_URL이 없으면 `.data/dev.db` SQLite를 사용한다. 이미 실행 중인 서버는 코드 변경 후 재시작한다. Docker 개발 환경은 [Server 안내](../Server/README.md), PostgreSQL·HTTPS 배포는 [배포 안내](deployment.md)를 따른다.

LLM·시세 실 API 설정 없이 수동 입력·계산·저장·가상 투자 기능을 사용할 수 있다. LLM 미설정 상태에서는 자연어 해석 요청이 설정 오류로 끝나며 가짜 모델로 대체되지 않는다.

## 작업과 검사

```bash
git switch main
git pull --ff-only
git switch -c <작업-브랜치명>
```

현재 작업을 커밋하거나 백업한 뒤 브랜치를 바꾼다. API·계산 변경의 기본 검사는 다음 명령이다.

```bash
npm run verify:backend
```

이 명령은 Python 구문·미정의 이름·포맷 검사, Node 단위 검사, 서버 회귀 검사를 수행한다. Python 실행기는 저장소의 `.venv`를 우선 사용하며 `PYTHON_BINARY`로 명시할 수 있다. `.venv`가 없으면 python3를 사용하므로 해당 Python에도 서버 의존성이 있어야 한다.

- `npm test`: Node 단위 검사만 실행한다. 서버·브라우저 검사까지 완료했다는 뜻이 아니다.
- `npm run test:server`: 임시 SQLite를 사용하는 서버 검사. 실제 제공자 응답은 대역으로 처리한다.
- `npm run check`: JavaScript와 공개 파일 연결 검사.
- `npm run format:check`: Client 포맷 검사.
- `npm run test:ui`: 기존 전체 브라우저 회귀 검사. 최초 실행 전 `npx playwright install chromium`이 필요하다.

GitHub에서는 위 검사와 별도로 실제 PostgreSQL·배포 이미지·HTTPS·백업 복원을 검사한다. 외부 LLM·토스 인증은 별도 실연동 검증 대상이다.

## 협업 기준

패키지는 루트에서 설치하고 `package-lock.json` 하나를 공유한다. Python 의존성은 Server requirements 파일로 관리하며 현재 범위 지정이므로 완전한 버전 고정은 아니다. 계약 변경 시 Shared 명세와 관련 테스트를 함께 수정한다. PR 검토와 병합 규칙은 [협업 규칙](../CONTRIBUTING.md)을 따른다.

백엔드 포맷은 `npm run format:server`, 확인은 `npm run format:server:check`를 사용한다. Ruff 버전은 개발 의존성에서 고정하며 미정의 이름 검사도 수행한다.
