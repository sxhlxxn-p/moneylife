# Server

FastAPI 기반의 머니 라이프 API 서버다. 개발 환경은 Docker Compose로 실행하며, 로컬 Python 설치 없이 소스 변경 자동 반영을 지원한다.

## 실행

저장소 루트에서 다음 명령을 실행한다.

```bash
npm run dev:server
```

또는 `Server` 디렉터리에서 직접 실행할 수 있다.

```bash
docker compose up --build
```

- API: <http://localhost:3000>
- 상태 확인: <http://localhost:3000/health>
- PostgreSQL 연결 확인: <http://localhost:3000/health/db>
- Swagger UI: <http://localhost:3000/docs>
- ReDoc: <http://localhost:3000/redoc>
- OpenAPI JSON: <http://localhost:3000/openapi.json>
- 종료: `Ctrl+C`

API 루트인 <http://localhost:3000>으로 접속해도 Swagger UI로 이동한다. FastAPI 라우트에 요청·응답 Pydantic 모델과 설명을 추가하면 OpenAPI 스키마와 두 문서 화면에 자동 반영된다.

기본 포트와 Client 출처를 바꾸려면 `.env.example`을 `.env`로 복사한 뒤 `PORT`, `CLIENT_ORIGIN`을 수정한다. Compose는 PostgreSQL 컨테이너와 `postgres_data` 볼륨을 함께 실행하므로 컨테이너를 다시 만들어도 개발 데이터가 유지된다. `.env`와 비밀키는 Git에 커밋하지 않는다.

## PostgreSQL

FastAPI는 `DATABASE_URL`만 사용하므로 로컬 PostgreSQL과 AWS RDS 사이에 코드 변경이 필요 없다.

```env
# Docker Compose 개발 DB
DATABASE_URL=postgresql+psycopg://moneylife:moneylife@db:5432/moneylife

# AWS RDS 예시
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@RDS_ENDPOINT:5432/moneylife?sslmode=require
```

로컬에서는 `db`가 Compose 서비스 이름이다. 호스트 PC에서 DB 클라이언트로 접속할 때는 `localhost:5432`를 사용한다. 운영 자격 증명은 파일에 저장하지 않고 AWS Secrets Manager 등을 통해 ECS 환경변수로 주입한다.

연결 확인 엔드포인트는 실제로 `SELECT 1`을 실행한다.

```bash
curl http://localhost:3000/health/db
```

정상이면 `200`과 `{"status":"ok","database":"postgresql"}`, 연결할 수 없으면 민감한 오류 내용을 노출하지 않고 `503`을 반환한다.

## 테스트

```bash
docker compose run --build --rm api pytest
```

저장소 루트에서는 다음 명령도 동일하게 동작한다.

```bash
npm test --workspace Server
```

## 구조

```text
Server/
├── app/
│   └── main.py            FastAPI 진입점과 /health
│   └── database.py        DATABASE_URL 기반 PostgreSQL 연결
├── tests/
│   └── test_health.py     상태 확인 API 테스트
├── compose.yaml           FastAPI와 PostgreSQL 개발 컨테이너
├── Dockerfile             Python 3.12 + Node 계산 런타임
├── requirements.txt       런타임 의존성
└── requirements-dev.txt   테스트 의존성
```

요청 검증과 단위 변환은 API 경계에서 수행하고, 금융 결과는 `../Engine`을 호출해 계산한다. API 초안은 `../docs/api-contract.md`, 계산 규칙은 `../docs/simulation-rules.md`, 화면 연결은 `../docs/FRONTEND_HANDOFF.md`를 참고한다.

LLM과 외부 자산 조회는 장애가 발생해도 수동 시뮬레이션이 동작하도록 어댑터 경계로 분리한다. 실제 키와 인증정보는 서버 환경변수로만 관리하며 응답, 로그, LLM 입력에 포함하지 않는다.

## 서버 계산 결과

`POST /simulations`는 저장된 본인 계획으로 공통 JS 엔진을 실행한다. `GET /simulations?planId=...`와 `GET /simulations/{id}`는 저장된 Run을 조회한다. 입력 스냅샷·버전·월별 결과·요약을 보존하고 같은 requestId의 중복 저장을 방지한다. `app/engine.py`가 시간 제한과 결과 검증, `app/simulations.py`가 소유권과 저장을 담당한다.

호스트 실행·테스트는 Node와 루트 `npm ci` 설치가 필요하다. Dockerfile은 루트 build context에서 Node와 decimal.js를 함께 포함한다. 이자 반올림과 실패 처리는 [서버 계산 계약](../Shared/simulation-contract.md)을 따른다. Docker/PostgreSQL 실환경 검증은 아직 남아 있다.

## 계획 저장 API와 Docker 없는 실행

`POST /plans`, `GET /plans`, `GET /plans/{id}`를 구현했다. 현재 여정의 입력과 선택 기록을 새 스냅샷으로 저장하며, 게스트 세션 소유권을 검사한다. 브라우저는 Client 개발 서버의 `/api` 프록시를 사용한다.

Docker가 없으면 가상환경에서 의존성을 설치한 뒤 루트의 `npm run dev:server:local`을 실행한다. 이 명령만 DATABASE_URL 미설정 시 SQLite `.data/dev.db`를 사용한다. Compose의 PostgreSQL 기본값은 유지한다. `aiosqlite`는 이 로컬 실행과 영속성 테스트용 드라이버다. 자세한 명령과 검증 범위는 [실행 안내](../docs/first-integration.md)를 따른다.

## LLM 조건 변경 API

`POST /ai/parse-change`는 본인 계획을 기준으로 구조화 추출·서버 검증을 수행한다. `POST /ai/proposals/{id}/apply`에서 명시적으로 확인하면 원본을 보존한 새 계획과 계산 결과를 저장한다. 모델은 금액을 계산하지 않는다. 결과 설명은 현재 정형 문장이다.

`LLM_PROVIDER=openai`, `LLM_MODEL`, `OPENAI_API_KEY` 설정이 필요하다. Compose는 Server/.env를 사용하며 로컬 Python·평가 도구도 해당 파일의 LLM 설정만 읽는다. 기존 환경변수가 파일보다 우선한다. 키 미설정 시 503이며 테스트 모형으로 자동 대체하지 않는다. [실행과 평가](../docs/llm-evaluation.md)를 참고한다. httpx는 실제 모델 HTTP 연결에 사용하는 런타임 의존성이다.

`POST /ai/explain`는 비교가 저장된 본인 Run의 지표 연결 설명을 생성한다. 검증 실패 후 한 번 재요청하고 계속 실패하면 정형 설명을 유지한다. 성공한 설명은 Run과 별도로 보관한다. 조건 추출 100건 평가 실행기는 `Test/ai/README.md`를 참고한다.

로컬 연결 준비: 가상환경 활성화 및 의존성 설치 후 루트에서 `npm run setup:llm` → `npm run check:llm -- --live`. 키는 숨김 입력으로 받고 기존 DB 설정은 보존한다. 서버 재시작이 필요하다. 실제 모델/인증/한도 오류를 진단 코드로 구분한다.

## 월별 모의투자 저장 API

`/docs`의 `paper-trading` 그룹에서 재무 계획 생성 후 투자 계획·주문·월 진행·결과 조회를 실행할 수 있다. 상세 입력과 응답 정책은 [공통 계약](../Shared/paper-api-contract.md)을 따른다.

- `GET /market/series`에서 사용 가능한 데이터 ID를 확인한다.
- 진행 월이 0인 `/plans` 결과 ID로 `POST /paper-plans`를 호출한다.
- 반환된 `plan.id`에 `/orders`와 `/advance` 명령을 보낸다. 각 명령의 응답은 새 계획이므로 다음 명령에 새 ID를 사용한다.
- 주문은 다음 달에 체결한다. 같은 `requestId`와 명령을 재전송하면 기존 결과를 돌려준다.
- `GET /paper-runs/{id}`는 저장 결과를 조회하며 엔진을 다시 실행하지 않는다. 게스트 쿠키가 필요하다.

서버를 실행한 뒤 프로젝트 루트에서 다음 명령으로 전체 저장·재조회 흐름을 확인한다. 해당 서버 DB에 시연용 게스트와 계획이 생성된다.

```bash
.venv/bin/python Server/scripts/demo_paper_api.py
```

시연은 실제 종목과 무관한 `TEST-KRW`의 가상 가격(0~4개월)과 수수료·세율 0을 사용한다. 현재 월 이후 가격은 API에 노출하지 않으며 투자 시작 시 가격 원본과 해시를 DB 내부에 고정한다. 실제 주가 공급자 연결, 다중 종목, 주문 취소와 투자 화면 연결은 후속 작업이다. 신규 `paper_plans`, `paper_runs` 테이블은 서버 시작 시 생성된다. 기존 테이블 변경이나 별도 패키지 설치는 없다.
