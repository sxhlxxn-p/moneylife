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

## 과거 주가 가져오기·등록

외부 API 호출은 투자 화면에서 직접 실행하지 않는다. 운영자가 로컬 수집 스크립트로 자료를 가져오고 정규화한 가격 파일을 서버에 등록한다. 새 Python 의존성은 없다. 실제 토큰 조회는 아직 검증하지 않았으며 기본 실행은 가상 가격을 유지한다.

CSV 형식(값은 형식 설명용 가상 예시):

```csv
date,close,volume
2024-01-31,10000,100
2024-02-29,12000,100
```

이미 사용할 수 있는 원화 일봉 CSV를 프로젝트 루트에서 등록한다. `source-url`은 데이터 원본의 공개 HTTPS 주소이며 인증정보나 query를 포함하지 않는다.

```bash
.venv/bin/python Server/scripts/import_market.py \
  --csv /absolute/path/daily.csv \
  --series-id stock-history-v1 --symbol 005930 \
  --label '과거 주가 재생' --provider '자료 제공처' \
  --source-url https://example.org/dataset \
  --start-month 2024-01 --end-month 2024-12
```

기본은 `private` 파일로 저장되어 화면에 나오지 않는다. 프로젝트에서 사용자에게 표시할 수 있는 자료에만 `--usage-scope project`를 붙인다. 기본 위치는 `.data/market`이다. 기존 ID는 덮어쓰지 않으며 자료가 바뀌면 새 ID로 등록한다. 화면을 다시 열거나 새로고침하면 목록이 갱신된다. 원본 파일을 제거해도 이미 시작한 계획은 DB의 고정 가격을 사용한다.

토스 조회는 승인된 **액세스 토큰**을 서버 환경변수 `TOSS_ACCESS_TOKEN` 또는 로컬 `Server/.env`에 두고 실행한다. LLM API 키와는 별개다. 토큰을 명령 인자·브라우저·Git에 넣지 않는다. 토큰 발급은 공식 인증 문서를 따른다. 공유 서비스의 시세 표시 이용 범위는 별도로 확인해야 하며, 기본 private를 바꾸지 않고 수집 동작부터 확인할 수 있다.

```bash
.venv/bin/python Server/scripts/import_market.py \
  --toss --series-id toss-history-v1 --symbol 005930 \
  --label '토스 과거 일봉 수집' \
  --start-month 2024-01 --end-month 2024-12
```

읽기 전용 `GET /api/v1/candles`만 호출한다. KRW·수정주가 미적용 일봉을 최대 32페이지까지 읽는다. 요청 오류·인증 실패·429·잘못된 응답에서는 파일을 만들지 않는다. 중간 월 누락은 거래 불가로 보존하고, 월 0 가격이 없거나 진행 중인 달·잘못된 가격·상충하는 같은 날짜 데이터는 등록하지 않는다. 분할·배당이 없는 기간으로 시연 범위를 제한한다.

Docker Compose는 호스트 `.data/market`을 읽기 전용으로 마운트한다. 자체 가격 폴더는 서버 실행 환경의 `MARKET_SERIES_DIR`로 지정한다. Docker 실행 검증은 이번 확인 범위에 포함하지 않았다. 세부 정책은 [과거 주가 계약](../Shared/historical-market-contract.md)을 따른다.

## 주문 전 확인 API

`POST /paper-plans/{id}/order-preview`에 `{side, quantity}`를 보내면 현재 확인 가격 기준의 참고 거래대금·비용과 다음 달 지출·월말 현금/저축을 반환한다. 주문·Run·계획은 저장하지 않는다. 확인 후 기존 `/orders`에 새 requestId로 별도 예약한다.

서버는 현재 월까지의 가격만 엔진에 전달한다. 엔진은 그 가격이 유지되고 거래 가능하다는 가정으로 기존 예약·새 주문·지출·저축을 계산한다. 실제 다음 달 가격을 참조하지 않으며 가격 누락 시 추정 금액은 null이다. 수량·소유권·매도 가능 수량·지원 기간은 예약과 동일하게 검사한다. 세부 필드와 확인/취소 동작은 [주문 확인 계약](../Shared/order-preview-contract.md)을 따른다. 새 의존성이나 DB 변경은 없다.

## 투자 결과 해설 API

`GET /paper-runs/{id}/explanation`은 본인 Run의 기본 해설을 반환한다. 조회 시 모델·가격 API·계산 엔진을 호출하거나 계획/주문/Run을 수정하지 않는다.

`POST /paper-runs/{id}/explanation`의 `{useAI: true}`는 선택형 AI 해설 요청이다. 외부 모델은 사실 ID의 선택·순서만 반환하며 서버가 저장 결과의 문장을 연결한다. 비교·목표·가정과 필요한 부족/가격 지연 사실의 누락, 중복·미등록 ID·추가 문장을 검증한다. 한 번 재요청 후 실패하면 기본 해설로 대체한다. 키·모델 미설정 시에는 외부 요청 없이 대체한다.

검증된 선택은 `paper_explanations` 테이블에 Run·프롬프트 버전·모델별로 저장한다. 서버 시작 시 새 테이블을 생성하고 기존 테이블은 바꾸지 않는다. 실패한 선택은 저장하지 않는다. 같은 실행의 동시 요청은 단일 서버 프로세스 내에서 잠그며, 다중 프로세스에서는 캐시 고유 키로 중복 저장을 막는다. 모델 입력은 생성된 해설 사실만 포함하고 원본 가격·이름·계좌·인증정보는 포함하지 않는다. 새 의존성은 없다. [해설 계약](../Shared/paper-explanation-contract.md)을 따른다.

실제 모델의 결과 품질·지연·비용은 아직 검증하지 않았다. 현재 테스트는 기본 해설과 모의 모델 선택·검증·대체·캐시 흐름을 확인한다.

## 대기 주문 취소

`POST /paper-plans/{id}/orders/{orderId}/cancel`에 `{requestId}`를 보낸다. 본인 사본의 현재 월 대기 주문만 제외한 새 계획·Run을 원자적으로 저장한다. 동일 요청은 원래 결과를 반환한다. 다른 명령/원본/주문에 같은 번호를 쓰면 409이며 이미 체결·거부된 주문도 409다. 해당 사본에 없는 주문은 404다.

부모 계획과 과거 Run·다른 분기는 변경하지 않는다. 선택 주문 외의 접수 순서를 유지한다. 새 Run의 대기 주문·매도 가능 수량·해설도 새 목록을 기준으로 계산한다. 공개 계획의 action=cancel과 부모 ID로 취소 사본을 구분한다. 별도 의존성·DB 변경은 없다. [모의투자 계약](../Shared/paper-api-contract.md)을 따른다.

## 투자 중 소득·생활비·저축 변경

`GET /paper-plans/{id}/conditions`는 다음 달 예정 값과 canEdit·적용 구간을 반환한다. 모델·시세·엔진을 호출하지 않는다. `POST /paper-plans/{id}/conditions`의 `{requestId, values:{income?,expense?,monthlySaving?}}`로 지정 항목을 다음 달부터 가격 지원 마지막 달까지 설정한다. 정수 원 0~100억원, 한 항목 이상이며 null이나 초기 자산·목표·주식 수량·임의 적용 시점은 허용하지 않는다.

기존 자연어 조건 검증의 build_candidate를 재사용하고 외부 LLM은 호출하지 않는다. 선택 항목의 기존 미래 변동을 반영해 모든 적용 월의 값이 요청 금액이 되도록 정규화한다. 선택하지 않은 조건과 일회성 지출은 유지한다. 현재까지의 월별 자산·보유량·체결·대기 주문과 고정 가격은 유지한 새 사본·Run을 원자적으로 저장한다. 기록 제한·유효성 검증 실패 시 원본을 보존하고 422를 반환한다. 전체 적용 기간에서 이미 같은 값이면 409다.

새 의존성·DB 변경은 없다. 요청 재전송과 충돌 정책은 다른 투자 명령과 같고 action=conditions로 변경 사본을 구분한다. 최초 financialPlanId는 출발 재무 계획이며 새 투자 사본의 조건은 plan.state에서 읽는다. 상세 정책은 [모의투자 계약](../Shared/paper-api-contract.md)을 따른다.

## 저장 투자 사본 비교

`POST /paper-comparisons`에 `{planIds:[UUID,UUID,(UUID)], throughMonth?:정수}`를 보낸다. 본인의 같은 출발 계획·초기 조건·가격 해시·엔진 버전만 비교한다. 기본 비교 시점은 선택 사본의 진행 월 최솟값이며 그 이후를 요청하면 409다. 해당 시점까지의 저장된 행과 목표/부족 요약을 다시 집계한다. 미래 가격·미실행 결과·주문·원본 state를 반환하지 않고 엔진·모델·시세를 호출하거나 DB 사본을 생성하지 않는다. 새 의존성·DB 변경은 없다. [비교 계약](../Shared/paper-comparison-contract.md)을 따른다.
