# Server

FastAPI·SQLAlchemy·Pydantic 서버다. 현재 상태는 [현재 상태](../docs/project-status.md), 모듈별 수정 위치는 [개발 구조](../docs/architecture.md)를 따른다.

## 로컬 실행

저장소 루트에서 Node.js 22·Python 3.12와 의존성을 준비한다.

```bash
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r Server/requirements-dev.txt
npm run dev:server:local
```

DATABASE_URL이 없으면 이 로컬 실행 명령은 `.data/dev.db` SQLite를 사용한다. API와 Swagger는 http://localhost:3000/docs, 연결 확인은 `/health/db`다. 별도 터미널에서 `npm run dev`로 화면을 실행한다. Python 가상환경 활성화와 Windows 안내는 [처음 시작하기](../docs/getting-started.md)를 참고한다.

## PostgreSQL 개발 환경

```bash
npm run dev:server
```

이 명령은 Server workspace의 Docker Compose를 실행한다. DB는 개발 볼륨에 보존된다. 환경 변수는 `Server/.env.example`을 참고한다. 비밀값을 Git에 커밋하지 않는다. Docker가 없는 환경에서는 위 SQLite 실행을 사용한다.

배포는 별도 production 이미지와 Compose를 사용한다. 비특권 API, 명시적 마이그레이션, 스키마 버전 확인, Nginx HTTPS 설정은 [배포 안내](../docs/deployment.md)를 따른다. 공개 서비스 운영이 이미 시작됐다는 뜻은 아니다.

## 검사

```bash
npm run verify:backend
```

Python 구문·미정의 이름·포맷 검사, Node 단위 검사와 Server/tests를 실행한다. `npm run test:server`만 실행할 수도 있다. `.venv`를 자동 선택하며 다른 Python은 `PYTHON_BINARY`로 지정한다. Docker에서는 `npm test --workspace Server`로 서버 검사만 실행한다.

일반 서버 검사는 임시 SQLite와 모의 제공자 응답을 사용한다. PostgreSQL 전용 검사는 `Server/integration`이며 실제 개인 DB가 아닌 격리된 테스트 DB를 요구한다. GitHub는 별도 PostgreSQL 작업과 HTTPS 배포·재시작·백업 복원 작업을 실행한다.

## 수정 경계

- 요청·응답은 `plans.py`, `session_api.py`, `paper.py`, `ai.py`, 뉴스·비교 API 파일에서 연결한다.
- 공통 인증은 `sessions.py`, 금융 계획 조회는 `plan_store.py`, 투자 사본·Run 저장은 `paper_store.py`를 사용한다.
- 조건 적용은 `financial_conditions.py`·`condition_schemas.py`가 담당한다. 수동 투자 조건을 바꾸기 위해 AI 전용 코드를 수정하지 않는다.
- 금융 계산은 Engine을 호출한다. 서버의 엔진 출력 검증과 소유권 검사를 제거하지 않는다.
- DB 변경은 `models.py`와 Alembic migration에 반영한다. 배포 API 시작 시 임의로 테이블을 생성하지 않는다.

외부 LLM과 토스의 실제 연결은 별도 설정·검증 대상이다. 미설정 모델을 가짜 모델로 자동 대체하지 않는다. [LLM 안내](../docs/llm-evaluation.md), [시장 데이터 안내](../docs/market-demo.md), [공통 계약](../Shared/README.md)을 참고한다.
