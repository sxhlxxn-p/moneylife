# MoneyLife API 엔드포인트 명세서

이 문서는 실행 중인 FastAPI `/openapi.json`을 기준으로 작성했다. 경로·HTTP 메서드·매개변수·요청/응답 자료형·선언된 상태 코드와 77개 구성 스키마를 포함한다. 쿠키·동작·추가 검증·런타임 오류는 서버 코드에서 확인한 보충 사항이다.

| 항목                        | 값                                                                       |
| --------------------------- | ------------------------------------------------------------------------ |
| 작성 기준일                 | 2026-11-23 (KST)                                                         |
| 기준 커밋                   | `12775c29e70a888b41c57b40258d6e421ed7ab77`                               |
| API / OpenAPI 버전          | `0.1.0` / `3.1.0`                                                        |
| 문서 범위                   | 27개 경로, 33개 HTTP 작업, 77개 구성 스키마                              |
| 로컬 API Base URL           | `http://localhost:3000`                                                  |
| 로컬 화면의 프록시 Base URL | `http://localhost:5173/api`                                              |
| Swagger UI                  | [http://localhost:3000/docs](http://localhost:3000/docs)                 |
| 원본 OpenAPI                | [http://localhost:3000/openapi.json](http://localhost:3000/openapi.json) |
| ReDoc                       | [http://localhost:3000/redoc](http://localhost:3000/redoc)               |

프록시에서는 예를 들어 `/api/plans`를 호출하면 API 서버의 `/plans`로 전달된다. 이 문서의 경로는 API 서버 기준이다. 실제 도메인·Origin은 배포 설정을 따른다.

## 목차

- [공통 계약](#common-contract)
- [엔드포인트 목록](#endpoint-index)
- [엔드포인트 상세](#endpoint-details)
- [요청·응답 스키마](#schemas)
- [오류 처리](#errors)
- [호출 예시](#examples)
- [갱신 및 관련 문서](#maintenance)

<a id="common-contract"></a>

## 1. 공통 계약

### 1.1 형식·단위

- 요청·응답 본문은 명시된 경우 `application/json`을 사용한다. 경로 변수와 필드명은 대소문자를 구분한다.
- 금액은 별도 설명이 없으면 정수 원(KRW), 수량은 정수 주, 금리는 연 퍼센트다. `annualRate=3`은 연 3%다. `feeBps=1`은 0.01%다.
- 월 0은 시작 상태다. 일반 계산 결과에는 월 0과 계산 월이 포함되어 `months + 1`행을 반환한다. 월별 이자는 연 유효 금리에서 월 금리를 구해 정수 원으로 반올림한다.
- `GameState.startMonth`는 현재 `2026-10`, 전체 기간 `months`는 `120`으로 고정된다. 계산 요청의 `SimulationCreate.months`(1~120)와 구분한다.
- `createdAt` 단위가 자원별로 다르다. 금융 Plan·일반 Run 응답은 Unix 초, PaperPlan·PaperRun·뉴스 기록은 Unix 마이크로초다. `expiresAt`은 Unix 초다. OpenAPI에는 단위가 없어 코드 기준으로 보충했다.
- 객체의 `additionalProperties=false`는 정의되지 않은 필드를 거부한다. OpenAPI 기본값이 없는 선택 필드는 아래 표에 “명시 없음”으로 표시한다. 필수 여부와 null 허용 여부는 서로 다르다.
- `anyOf`는 나열한 형식 중 하나 이상, `oneOf`는 정확히 하나, `allOf`는 모든 형식을 만족한다. `any`는 OpenAPI가 자료형을 제한하지 않은 경우다.

### 1.2 익명 게스트·소유권 (코드 보충)

- 소유권 보호 API는 `moneylife_guest` 쿠키를 사용한다. 쿠키가 없으면 서버가 새 게스트와 쿠키를 생성하고, 만료·잘못된 쿠키는 `401 SESSION_EXPIRED`로 거부한다.
- 쿠키 유효기간은 30일이며 `HttpOnly`, `SameSite=Lax`, `Path=/`이다. `COOKIE_SECURE=true` 환경에서는 `Secure`를 사용한다.
- 브라우저에서 다른 Origin으로 직접 호출할 때는 `credentials: "include"`와 서버 CORS 설정이 필요하다. 로컬 화면은 `/api` 프록시를 사용한다.
- 다른 게스트의 자원은 일반적으로 없는 자원과 같은 404로 응답한다. 세션 갱신은 계정 복구가 아니므로 이전 소유자의 자료를 새 게스트에게 연결하지 않는다.
- 공개 조회는 `/health`, `/health/db`, `/market/series`다. 세션 갱신은 별도 경로다. OpenAPI에 인증 `securitySchemes`와 쿠키 매개변수는 선언되어 있지 않지만 실제 서버는 위 소유권 검사를 수행한다.

### 1.3 Origin·요청 제한·헤더 (코드 보충)

- 소유권 보호 경로와 세션 갱신은 GET/HEAD 이외 요청에 Origin 헤더가 있고 허용 목록에 없으면 `403 ORIGIN_NOT_ALLOWED`로 거부한다. Origin 헤더가 없으면 이 검사를 통과한다. 기본 `CLIENT_ORIGIN`은 `http://localhost:5173`이며 요청 서버 Origin도 허용한다.
- 모든 응답에 서버가 발급한 `X-Request-ID`를 붙인다. 본문의 재시도용 `requestId`와 용도가 다르다.
- AI 해석·AI 설명·투자 AI 설명 POST에는 기본 게스트당 60초에 12회, IP당 60회 제한을 적용한다. 세션 갱신은 IP당 60초에 30회다. 초과 시 `429 REQUEST_RATE_LIMITED`와 `Retry-After`(초)를 반환한다. AI 승인 API는 이 AI 할당량 의존성을 사용하지 않는다.
- 금융·투자·뉴스 자원 응답은 `Cache-Control: no-store`를 사용한다. AI 설명 결과의 서버 내부 캐시는 별도다.

### 1.4 저장·재시도·분기 (코드 보충)

- Plan·Run·PaperPlan·PaperRun·뉴스 기록은 저장된 사본이다. 이벤트·조건·주문 변경은 부모를 연결한 새 사본을 만든다.
- `/plan-saves`, `/simulations`, `/event-branches`, 모의투자 생성·주문·취소·진행·조건 변경, 뉴스 기록 생성은 같은 소유자·같은 requestId·같은 명령에 기존 결과를 돌려준다. 동일 ID에 다른 명령이면 `409 REQUEST_ID_CONFLICT`다. API별 요청 ID 적용 범위를 유지한다.
- 재전송 시 기존 requestId와 본문을 함께 보관한다. `/plans` 생성에는 이 기능이 없다. 미리보기·비교·설명 요청에도 requestId 필드는 없다.
- 모의 주문 거절은 HTTP 오류와 구분한다. 진행 요청 자체가 성공해도 결과의 체결 항목이 `status="rejected"`일 수 있다.

### 1.5 OpenAPI에 나타나지 않는 추가 검증 (코드 보충)

- `Change.end >= m`; saving·once의 v는 음수 불가. 모든 적용 월의 소득·생활비가 음수가 되지 않아야 한다.
- `GameState.events`는 중복 불가·현재 진행 월 이하이며, logs의 월도 진행 월 이하이다. 목표 이름은 공백만으로 입력할 수 없다.
- `PaperConditionValues`는 한 항목 이상을 포함해야 하며 명시적 null은 거부한다. 조건 변경 전후가 같으면 409다.
- 비교할 사본·뉴스 기록 ID는 서로 달라야 하며, 공통으로 완료한 시점을 넘어 비교할 수 없다.
- 자연어 변경은 게임 현재 월 이후부터 120개월 범위에서만 적용한다. 금액·기간을 확정할 수 없으면 재질문하며, 재질문은 30분 만료·최대 3턴이다.
- `GameState.goal` 미지정/null은 저장 응답에서 생략될 수 있다. changes·rateChanges·logs·events 생략 시 빈 배열을 사용한다.

<a id="endpoint-index"></a>

## 2. 엔드포인트 목록

| 번호 | 메서드 | 경로                                                               | 기능                          |
| ---- | ------ | ------------------------------------------------------------------ | ----------------------------- |
| 01   | `GET`  | [`/health`](#operation-01)                                         | 서버 상태 확인                |
| 02   | `GET`  | [`/health/db`](#operation-02)                                      | DB 연결 상태 확인             |
| 03   | `POST` | [`/event-branches`](#operation-03)                                 | 생애 이벤트 선택 및 분기 저장 |
| 04   | `POST` | [`/plans/session/recover`](#operation-04)                          | 게스트 세션 갱신              |
| 05   | `POST` | [`/plans`](#operation-05)                                          | 금융 계획 생성                |
| 06   | `GET`  | [`/plans`](#operation-06)                                          | 금융 계획 목록                |
| 07   | `GET`  | [`/plans/{plan_id}`](#operation-07)                                | 금융 계획 상세                |
| 08   | `POST` | [`/plan-saves`](#operation-08)                                     | 재시도 가능한 금융 계획 저장  |
| 09   | `POST` | [`/simulations`](#operation-09)                                    | 금융 계획 계산 및 결과 저장   |
| 10   | `GET`  | [`/simulations`](#operation-10)                                    | 금융 계획의 계산 결과 목록    |
| 11   | `GET`  | [`/simulations/{run_id}`](#operation-11)                           | 계산 결과 상세                |
| 12   | `POST` | [`/ai/explain`](#operation-12)                                     | AI 변경 전후 결과 설명        |
| 13   | `POST` | [`/ai/parse-change`](#operation-13)                                | 자연어 조건 변경안 추출       |
| 14   | `POST` | [`/ai/proposals/{proposal_id}/apply`](#operation-14)               | AI 변경안 승인 및 적용        |
| 15   | `GET`  | [`/market/series`](#operation-15)                                  | 등록 가격 자료 목록           |
| 16   | `POST` | [`/paper-plans`](#operation-16)                                    | 모의투자 사본 생성            |
| 17   | `GET`  | [`/paper-plans`](#operation-17)                                    | 모의투자 사본 목록            |
| 18   | `GET`  | [`/paper-plans/{plan_id}`](#operation-18)                          | 모의투자 사본 상세            |
| 19   | `GET`  | [`/paper-plans/{plan_id}/market`](#operation-19)                   | 진행 월까지의 가격 조회       |
| 20   | `POST` | [`/paper-plans/{plan_id}/orders`](#operation-20)                   | 다음 달 모의 주문 예약        |
| 21   | `POST` | [`/paper-plans/{plan_id}/advance`](#operation-21)                  | 모의투자 월 진행              |
| 22   | `GET`  | [`/paper-runs/{run_id}`](#operation-22)                            | 모의투자 계산 결과 상세       |
| 23   | `POST` | [`/paper-plans/{plan_id}/order-preview`](#operation-23)            | 모의 주문 영향 미리보기       |
| 24   | `POST` | [`/paper-plans/{plan_id}/orders/{order_id}/cancel`](#operation-24) | 미체결 모의 주문 취소         |
| 25   | `GET`  | [`/paper-plans/{plan_id}/conditions`](#operation-25)               | 모의투자 생활 조건 조회       |
| 26   | `POST` | [`/paper-plans/{plan_id}/conditions`](#operation-26)               | 모의투자 생활 조건 변경       |
| 27   | `POST` | [`/paper-comparisons`](#operation-27)                              | 저장된 모의투자 사본 비교     |
| 28   | `GET`  | [`/paper-runs/{run_id}/explanation`](#operation-28)                | 모의투자 기본 설명            |
| 29   | `POST` | [`/paper-runs/{run_id}/explanation`](#operation-29)                | 모의투자 AI 정렬 설명         |
| 30   | `POST` | [`/paper-plans/{plan_id}/news-games`](#operation-30)               | 가상 뉴스 선택 결과 저장      |
| 31   | `GET`  | [`/paper-plans/{plan_id}/news-games`](#operation-31)               | 모의투자의 뉴스 기록 목록     |
| 32   | `GET`  | [`/news-games/{record_id}`](#operation-32)                         | 뉴스 기록 상세                |
| 33   | `POST` | [`/news-game-comparisons`](#operation-33)                          | 저장된 뉴스 기록 비교         |

<a id="endpoint-details"></a>

## 3. 엔드포인트 상세

각 응답 표의 상태 코드는 OpenAPI에 선언된 코드다. 본문의 “동작”과 “코드에 직접 선언된 오류”는 코드 보충이며, 공통 의존성·호출 함수의 추가 오류는 [오류 처리](#errors)를 함께 확인한다.

<a id="operation-01"></a>

### 3.1 서버 상태 확인

`GET /health`

- Swagger 태그: `system`
- operationId: `health_health_get`
- 접근: 공개 조회
- 구현: [app/main.py](app/main.py) · `145`행

**동작:** 프로세스의 기본 응답을 확인한다. DB 연결 여부는 /health/db로 별도 확인한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                   | Content-Type       | Swagger 설명   |
| --------- | ---------------------------------------- | ------------------ | -------------- |
| `200`     | [HealthResponse](#schema-healthresponse) | `application/json` | 정상 동작 상태 |

**정상 응답 예시**

```json
{ "status": "ok" }
```

<a id="operation-02"></a>

### 3.2 DB 연결 상태 확인

`GET /health/db`

- Swagger 태그: `system`
- operationId: `database_health_health_db_get`
- 접근: 공개 조회
- 구현: [app/main.py](app/main.py) · `157`행

**동작:** 현재 설정된 DB에 SELECT 1을 실행한다. Swagger summary에는 PostgreSQL로 표시되지만 로컬 SQLite도 지원하며 database 필드에 실제 종류를 반환한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                                   | Content-Type       | Swagger 설명         |
| --------- | -------------------------------------------------------- | ------------------ | -------------------- |
| `200`     | [DatabaseHealthResponse](#schema-databasehealthresponse) | `application/json` | PostgreSQL 연결 상태 |
| `503`     | [DatabaseHealthResponse](#schema-databasehealthresponse) | `application/json` | Service Unavailable  |

**SQLite 실행 응답 예시**

```json
{ "status": "ok", "database": "sqlite" }
```

DB 연결 실패 시 503 본문도 `DatabaseHealthResponse`이며 status는 `unavailable`이다.

<a id="operation-03"></a>

### 3.3 생애 이벤트 선택 및 분기 저장

`POST /event-branches`

- Swagger 태그: `plans`
- operationId: `branch_event_branches_post`
- 접근: 게스트 소유권
- 구현: [app/events.py](app/events.py) · `68`행

**동작:** 선택 전 Plan·선택 후 Plan·Run·요청 기록을 하나의 트랜잭션으로 저장한다. base.state.month와 eventMonth가 일치해야 한다. 거절 선택도 기록하며, 수락한 효과는 다음 달부터 적용한다. 원본은 보존한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [EventCreate](#schema-eventcreate) · `application/json` · 필수

| 필드                | 자료형                           | 필수   | 기본값(OpenAPI)    | 제약                      | 설명                                                                  |
| ------------------- | -------------------------------- | ------ | ------------------ | ------------------------- | --------------------------------------------------------------------- |
| `requestId`         | string (uuid)                    | 예     | 명시 없음          | —                         | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `eventRulesVersion` | string                           | 아니요 | `"life-events-v1"` | 고정값 `"life-events-v1"` | —                                                                     |
| `base`              | [PlanCreate](#schema-plancreate) | 예     | 명시 없음          | —                         | 선택 전 금융 PlanCreate.                                              |
| `eventMonth`        | integer                          | 예     | 명시 없음          | 허용값 `[12,30,48,72,96]` | 생애 이벤트가 발생한 월.                                              |
| `accepted`          | boolean                          | 예     | 명시 없음          | —                         | 이벤트 수락 여부.                                                     |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000004",
  "eventRulesVersion": "life-events-v1",
  "base": {
    "schemaVersion": 1,
    "goalBasis": "net_assets",
    "parentPlanId": null,
    "state": {
      "startMonth": "2026-10",
      "months": 120,
      "initial": {
        "name": "나의 첫 번째 인생",
        "age": 25,
        "avatar": "🌱",
        "cash": 3000000,
        "saved": 7000000,
        "income": 2500000,
        "expense": 1600000,
        "target": 50000000
      },
      "goal": {
        "name": "나만의 공간 마련하기",
        "months": 60
      },
      "monthlySaving": 700000,
      "annualRate": 3,
      "month": 12,
      "changes": [],
      "rateChanges": [],
      "logs": [],
      "events": []
    }
  },
  "eventMonth": 12,
  "accepted": true
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [EventResult](#schema-eventresult)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `422 EVENT_NOT_AVAILABLE`, `422 EVENT_STATE_INVALID`.

<a id="operation-04"></a>

### 3.4 게스트 세션 갱신

`POST /plans/session/recover`

- Swagger 태그: `plans`
- operationId: `recover_session_plans_session_recover_post`
- 접근: 세션 갱신·Origin 검사·IP 요청 제한
- 구현: [app/session_api.py](app/session_api.py) · `19`행

**동작:** 정상 세션은 유지하고, 쿠키가 없거나 만료됐으면 새 소유자를 발급한다. 이전 소유자의 서버 자료를 새 세션으로 이관하지 않는다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형 | Content-Type       | Swagger 설명        |
| --------- | ------ | ------------------ | ------------------- |
| `200`     | any    | `application/json` | Successful Response |

OpenAPI의 200 schema는 빈 객체(`{}`)라 필드가 정의되어 있지 않다. 실제 구현 응답은 다음 두 형태다.

```json
{ "status": "active", "previousServerPlansAccessible": true }
```

```json
{ "status": "renewed", "previousServerPlansAccessible": false }
```

<a id="operation-05"></a>

### 3.5 금융 계획 생성

`POST /plans`

- Swagger 태그: `plans`
- operationId: `create_plan_plans_post`
- 접근: 게스트 소유권
- 구현: [app/plans.py](app/plans.py) · `21`행

**동작:** 입력 스냅샷을 새 Plan으로 저장한다. parentPlanId가 있으면 부모 계획의 소유권을 확인한다. requestId가 없는 생성 API이며 요청할 때마다 새 사본이 생긴다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [PlanCreate](#schema-plancreate) · `application/json` · 필수

| 필드            | 자료형                         | 필수   | 기본값(OpenAPI) | 제약                  | 설명                                                            |
| --------------- | ------------------------------ | ------ | --------------- | --------------------- | --------------------------------------------------------------- |
| `schemaVersion` | integer                        | 아니요 | `1`             | 고정값 `1`            | 입력 계약 버전.                                                 |
| `goalBasis`     | string                         | 아니요 | `"net_assets"`  | 고정값 `"net_assets"` | 목표 달성 판단 기준.                                            |
| `parentPlanId`  | anyOf(string (uuid) / null)    | 아니요 | 명시 없음       | —                     | 부모 금융 Plan ID.                                              |
| `state`         | [GameState](#schema-gamestate) | 예     | 명시 없음       | —                     | 저장된 금융 상태 또는 뉴스 라운드 상태. 연결된 스키마를 따른다. |

**요청 예시**

```json
{
  "schemaVersion": 1,
  "goalBasis": "net_assets",
  "parentPlanId": null,
  "state": {
    "startMonth": "2026-10",
    "months": 120,
    "initial": {
      "name": "나의 첫 번째 인생",
      "age": 25,
      "avatar": "🌱",
      "cash": 3000000,
      "saved": 7000000,
      "income": 2500000,
      "expense": 1600000,
      "target": 50000000
    },
    "goal": {
      "name": "나만의 공간 마련하기",
      "months": 60
    },
    "monthlySaving": 700000,
    "annualRate": 3,
    "month": 0,
    "changes": [],
    "rateChanges": [],
    "logs": [],
    "events": []
  }
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PlanDetail](#schema-plandetail)                   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-06"></a>

### 3.6 금융 계획 목록

`GET /plans`

- Swagger 태그: `plans`
- operationId: `list_plans_plans_get`
- 접근: 게스트 소유권
- 구현: [app/plans.py](app/plans.py) · `46`행

**동작:** 본인 계획을 createdAt 내림차순, id 내림차순으로 조회한다. 응답은 페이지 객체가 아닌 PlanSummary 배열이다.

**경로·쿼리 매개변수**

| 이름     | 위치  | 필수   | 자료형  | 기본값 | 제약                     |
| -------- | ----- | ------ | ------- | ------ | ------------------------ |
| `limit`  | query | 아니요 | integer | `20`   | 최솟값 `1`; 최댓값 `100` |
| `offset` | query | 아니요 | integer | `0`    | 최솟값 `0`               |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | array&lt;[PlanSummary](#schema-plansummary)&gt;    | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-07"></a>

### 3.7 금융 계획 상세

`GET /plans/{plan_id}`

- Swagger 태그: `plans`
- operationId: `get_plan_plans__plan_id__get`
- 접근: 게스트 소유권
- 구현: [app/plans.py](app/plans.py) · `65`행

**동작:** 본인이 소유한 계획의 저장 입력을 조회한다. 없는 계획과 다른 소유자의 계획은 모두 404다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [PlanDetail](#schema-plandetail)                   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-08"></a>

### 3.8 재시도 가능한 금융 계획 저장

`POST /plan-saves`

- Swagger 태그: `plans`
- operationId: `save_plan_saves_post`
- 접근: 게스트 소유권
- 구현: [app/plan_saves.py](app/plan_saves.py) · `40`행

**동작:** requestId와 입력을 함께 저장한다. 같은 소유자·같은 ID·같은 내용은 기존 Plan을 반환하고, 같은 ID에 다른 내용이면 409 REQUEST_ID_CONFLICT다. 화면 저장 흐름은 이 API를 사용한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [SaveCommand](#schema-savecommand) · `application/json` · 필수

| 필드        | 자료형                           | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | -------------------------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid)                    | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `plan`      | [PlanCreate](#schema-plancreate) | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계획. 연결된 스키마를 따른다.                   |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "plan": {
    "schemaVersion": 1,
    "goalBasis": "net_assets",
    "parentPlanId": null,
    "state": {
      "startMonth": "2026-10",
      "months": 120,
      "initial": {
        "name": "나의 첫 번째 인생",
        "age": 25,
        "avatar": "🌱",
        "cash": 3000000,
        "saved": 7000000,
        "income": 2500000,
        "expense": 1600000,
        "target": 50000000
      },
      "goal": {
        "name": "나만의 공간 마련하기",
        "months": 60
      },
      "monthlySaving": 700000,
      "annualRate": 3,
      "month": 0,
      "changes": [],
      "rateChanges": [],
      "logs": [],
      "events": []
    }
  }
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PlanDetail](#schema-plandetail)                   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-09"></a>

### 3.9 금융 계획 계산 및 결과 저장

`POST /simulations`

- Swagger 태그: `simulations`
- operationId: `simulate_simulations_post`
- 접근: 게스트 소유권
- 구현: [app/simulations.py](app/simulations.py) · `53`행

**동작:** 저장된 본인 Plan을 지정 기간만큼 공통 엔진으로 계산하고 Run을 저장한다. 같은 requestId의 동일 명령은 기존 Run을 반환한다. 계획 저장용 ID와 계산용 ID를 각각 보관한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [SimulationCreate](#schema-simulationcreate) · `application/json` · 필수

| 필드        | 자료형        | 필수   | 기본값(OpenAPI) | 제약                         | 설명                                                                  |
| ----------- | ------------- | ------ | --------------- | ---------------------------- | --------------------------------------------------------------------- |
| `planId`    | string (uuid) | 예     | 명시 없음       | —                            | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `requestId` | string (uuid) | 예     | 명시 없음       | —                            | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `months`    | integer       | 아니요 | `120`           | 최솟값 `1.0`; 최댓값 `120.0` | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |

**요청 예시**

```json
{
  "planId": "00000000-0000-4000-8000-000000000002",
  "requestId": "00000000-0000-4000-8000-000000000003",
  "months": 120
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [RunDetail](#schema-rundetail)                     | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-10"></a>

### 3.10 금융 계획의 계산 결과 목록

`GET /simulations`

- Swagger 태그: `simulations`
- operationId: `list_runs_simulations_get`
- 접근: 게스트 소유권
- 구현: [app/simulations.py](app/simulations.py) · `97`행

**동작:** 필수 planId로 본인 계획의 Run을 최신순 조회한다. limit만 제공하며 offset은 없다.

**경로·쿼리 매개변수**

| 이름     | 위치  | 필수   | 자료형        | 기본값    | 제약                     |
| -------- | ----- | ------ | ------------- | --------- | ------------------------ |
| `planId` | query | 예     | string (uuid) | 명시 없음 | —                        |
| `limit`  | query | 아니요 | integer       | `20`      | 최솟값 `1`; 최댓값 `100` |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | array&lt;[RunSummary](#schema-runsummary)&gt;      | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-11"></a>

### 3.11 계산 결과 상세

`GET /simulations/{run_id}`

- Swagger 태그: `simulations`
- operationId: `get_run_simulations__run_id__get`
- 접근: 게스트 소유권
- 구현: [app/simulations.py](app/simulations.py) · `116`행

**동작:** 입력 사본·엔진 버전·요약·월별 결과를 저장값 그대로 조회한다. 조회 중 재계산하지 않는다.

**경로·쿼리 매개변수**

| 이름     | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| -------- | ---- | ---- | ------------- | --------- | ---- |
| `run_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [RunDetail](#schema-rundetail)                     | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 RUN_NOT_FOUND`.

<a id="operation-12"></a>

### 3.12 AI 변경 전후 결과 설명

`POST /ai/explain`

- Swagger 태그: `ai`
- operationId: `explain_ai_explain_post`
- 접근: 게스트 소유권 + AI 요청 제한
- 구현: [app/ai.py](app/ai.py) · `38`행

**동작:** AI 적용으로 aiComparison이 저장된 본인 Run에만 사용할 수 있다. 서버가 확정한 사실 문장의 순서를 모델이 선택하며, 검증 실패·외부 모델 미설정 등에는 정형 설명을 반환한다. 일반 수동 Run은 422 COMPARISON_REQUIRED다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [ExplainRequest](#schema-explainrequest) · `application/json` · 필수

| 필드    | 자료형        | 필수 | 기본값(OpenAPI) | 제약 | 설명               |
| ------- | ------------- | ---- | --------------- | ---- | ------------------ |
| `runId` | string (uuid) | 예   | 명시 없음       | —    | 연결 계산 결과 ID. |

**요청 예시**

```json
{
  "runId": "00000000-0000-4000-8000-000000000005"
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [ExplainResult](#schema-explainresult)             | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 RUN_NOT_FOUND`, `422 COMPARISON_REQUIRED`.

<a id="operation-13"></a>

### 3.13 자연어 조건 변경안 추출

`POST /ai/parse-change`

- Swagger 태그: `ai`
- operationId: `parse_change_ai_parse_change_post`
- 접근: 게스트 소유권 + AI 요청 제한
- 구현: [app/ai.py](app/ai.py) · `101`행

**동작:** 본인 계획과 요청 문장을 외부 모델로 해석한다. 지원 항목은 income·expense·monthlySaving이며 set/add/subtract를 지원한다. 적용 기준은 게임 진행 월이다. 제안만 저장하며 계획 변경·계산은 승인 API에서 수행한다. clarificationId는 같은 계획의 재질문에 사용한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [ParseChange](#schema-parsechange) · `application/json` · 필수

| 필드              | 자료형                      | 필수   | 기본값(OpenAPI) | 제약                            | 설명                                             |
| ----------------- | --------------------------- | ------ | --------------- | ------------------------------- | ------------------------------------------------ |
| `planId`          | string (uuid)               | 예     | 명시 없음       | —                               | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다. |
| `message`         | string                      | 예     | 명시 없음       | 최소 길이 `1`; 최대 길이 `2000` | —                                                |
| `clarificationId` | anyOf(string (uuid) / null) | 아니요 | 명시 없음       | —                               | 재질문 문맥 ID. 처음 요청할 때 생략한다.         |

**요청 예시**

```json
{
  "planId": "00000000-0000-4000-8000-000000000002",
  "message": "다음 달부터 생활비 20만 원 줄여줘"
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [ProposalResponse](#schema-proposalresponse)       | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 CLARIFICATION_NOT_FOUND`, `409 CLARIFICATION_PLAN_MISMATCH`, `410 CLARIFICATION_EXPIRED`, `422 CLARIFICATION_LIMIT`, `422 SIMULATION_FINISHED`.

<a id="operation-14"></a>

### 3.14 AI 변경안 승인 및 적용

`POST /ai/proposals/{proposal_id}/apply`

- Swagger 태그: `ai`
- operationId: `apply_change_ai_proposals__proposal_id__apply_post`
- 접근: 게스트 소유권 + AI 요청 제한
- 구현: [app/ai.py](app/ai.py) · `209`행

**동작:** confirmed=true로 명시적으로 승인한다. 원본·후보를 계산하고 새 Plan·Run·비교 결과를 저장한다. 이미 적용된 제안의 재호출은 저장된 적용 결과를 반환한다. 미적용 제안은 30분 후 만료된다.

**경로·쿼리 매개변수**

| 이름          | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| ------------- | ---- | ---- | ------------- | --------- | ---- |
| `proposal_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [ApplyChange](#schema-applychange) · `application/json` · 필수

| 필드        | 자료형  | 필수 | 기본값(OpenAPI) | 제약          | 설명                           |
| ----------- | ------- | ---- | --------------- | ------------- | ------------------------------ |
| `confirmed` | boolean | 예   | 명시 없음       | 고정값 `true` | 명시적 변경 승인. true만 허용. |

**요청 예시**

```json
{
  "confirmed": true
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [ApplyResult](#schema-applyresult)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 PROPOSAL_NOT_FOUND`, `410 PROPOSAL_EXPIRED`.

<a id="operation-15"></a>

### 3.15 등록 가격 자료 목록

`GET /market/series`

- Swagger 태그: `paper-trading`
- operationId: `market_series_market_series_get`
- 접근: 공개 조회
- 구현: [app/paper.py](app/paper.py) · `39`행

**동작:** 등록된 가상·과거 가격 자료의 출처와 지원 기간을 조회한다. 전체 미래 가격은 반환하지 않는다. 토스 실시간 조회를 수행하는 공개 엔드포인트가 아니다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                            | Content-Type       | Swagger 설명        |
| --------- | ------------------------------------------------- | ------------------ | ------------------- |
| `200`     | array&lt;[MarketSource](#schema-marketsource)&gt; | `application/json` | Successful Response |

<a id="operation-16"></a>

### 3.16 모의투자 사본 생성

`POST /paper-plans`

- Swagger 태그: `paper-trading`
- operationId: `create_paper_plans_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `45`행

**동작:** 본인 금융 Plan과 등록 priceSeriesId로 별도 모의투자 사본·Run을 만든다. 가격 스냅샷을 고정하고 원본 금융 Plan을 보존한다. 금융 Plan의 진행 월이 자료의 지원 기간을 넘으면 거부한다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [PaperCreate](#schema-papercreate) · `application/json` · 필수

| 필드            | 자료형        | 필수 | 기본값(OpenAPI) | 제약                          | 설명                                                                  |
| --------------- | ------------- | ---- | --------------- | ----------------------------- | --------------------------------------------------------------------- |
| `requestId`     | string (uuid) | 예   | 명시 없음       | —                             | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `planId`        | string (uuid) | 예   | 명시 없음       | —                             | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `priceSeriesId` | string        | 예   | 명시 없음       | 최소 길이 `1`; 최대 길이 `64` | 등록 가격 자료 식별자.                                                |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000006",
  "planId": "00000000-0000-4000-8000-000000000002",
  "priceSeriesId": "synthetic-monthly-v1"
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PaperBundle](#schema-paperbundle)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `409 SERIES_PERIOD_EXCEEDED`.

<a id="operation-17"></a>

### 3.17 모의투자 사본 목록

`GET /paper-plans`

- Swagger 태그: `paper-trading`
- operationId: `listing_paper_plans_get`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `66`행

**동작:** 본인 사본을 최신순 페이지 조회한다. 목록에서는 결과 JSON 전체를 읽지 않는다. 연결 Run 누락·소유권 불일치는 503 PAPER_RUN_UNAVAILABLE다.

**경로·쿼리 매개변수**

| 이름     | 위치  | 필수   | 자료형  | 기본값 | 제약                     |
| -------- | ----- | ------ | ------- | ------ | ------------------------ |
| `limit`  | query | 아니요 | integer | `20`   | 최솟값 `1`; 최댓값 `100` |
| `offset` | query | 아니요 | integer | `0`    | 최솟값 `0`               |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | array&lt;[PaperSummary](#schema-papersummary)&gt;  | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-18"></a>

### 3.18 모의투자 사본 상세

`GET /paper-plans/{plan_id}`

- Swagger 태그: `paper-trading`
- operationId: `get_plan_paper_plans__plan_id__get`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `79`행

**동작:** 입력·주문·출처·연결 Run ID를 조회한다. plan_id는 금융 Plan ID가 아닌 PaperPlan ID다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [PaperDetail](#schema-paperdetail)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-19"></a>

### 3.19 진행 월까지의 가격 조회

`GET /paper-plans/{plan_id}/market`

- Swagger 태그: `paper-trading`
- operationId: `get_market_paper_plans__plan_id__market_get`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `91`행

**동작:** 사본에 고정된 자료에서 현재 진행 월까지의 가격만 반환한다. 이 경로는 임의 query parameter를 받지 않으며 전달 시 422 MARKET_QUERY_NOT_ALLOWED다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [MarketView](#schema-marketview)                   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `422 MARKET_QUERY_NOT_ALLOWED`.

<a id="operation-20"></a>

### 3.20 다음 달 모의 주문 예약

`POST /paper-plans/{plan_id}/orders`

- Swagger 태그: `paper-trading`
- operationId: `order_paper_plans__plan_id__orders_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `130`행

**동작:** 현재 월에 주문을 제출한 새 사본을 만든다. 체결은 다음 달 진행 시 결정된다. 매도 가능 수량에서 기존 예약 매도를 차감하며, 예약 매수는 보유 수량으로 인정하지 않는다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [PaperOrderCreate](#schema-paperordercreate) · `application/json` · 필수

| 필드        | 자료형        | 필수 | 기본값(OpenAPI) | 제약                                | 설명                                                                  |
| ----------- | ------------- | ---- | --------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예   | 명시 없음       | —                                   | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `side`      | string        | 예   | 명시 없음       | 허용값 `["buy","sell"]`             | buy=매수, sell=매도.                                                  |
| `quantity`  | integer       | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `1000000000.0` | 주식 수량(주).                                                        |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000007",
  "side": "buy",
  "quantity": 10
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PaperBundle](#schema-paperbundle)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-21"></a>

### 3.21 모의투자 월 진행

`POST /paper-plans/{plan_id}/advance`

- Swagger 태그: `paper-trading`
- operationId: `advance_paper_plans__plan_id__advance_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `173`행

**동작:** 지정 개월을 진행한 새 사본·Run을 만든다. 한 번에 1~12개월이며 가격 자료의 지원 마지막 월을 넘을 수 없다. 체결 불가 주문은 결과 안에서 rejected로 기록될 수 있다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [PaperAdvance](#schema-paperadvance) · `application/json` · 필수

| 필드        | 자료형        | 필수   | 기본값(OpenAPI) | 제약                        | 설명                                                                  |
| ----------- | ------------- | ------ | --------------- | --------------------------- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예     | 명시 없음       | —                           | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `months`    | integer       | 아니요 | `1`             | 최솟값 `1.0`; 최댓값 `12.0` | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000008",
  "months": 1
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PaperBundle](#schema-paperbundle)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `409 SERIES_PERIOD_EXCEEDED`.

<a id="operation-22"></a>

### 3.22 모의투자 계산 결과 상세

`GET /paper-runs/{run_id}`

- Swagger 태그: `paper-trading`
- operationId: `get_run_paper_runs__run_id__get`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `208`행

**동작:** 저장된 원래 금융 경로와 투자 경로, 비교 지표·체결·보유 상태를 반환한다. 현재 진행 월 이후의 가격·경로는 노출하지 않는다.

**경로·쿼리 매개변수**

| 이름     | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| -------- | ---- | ---- | ------------- | --------- | ---- |
| `run_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [PaperRunDetail](#schema-paperrundetail)           | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 PAPER_RUN_NOT_FOUND`.

<a id="operation-23"></a>

### 3.23 모의 주문 영향 미리보기

`POST /paper-plans/{plan_id}/order-preview`

- Swagger 태그: `paper-trading`
- operationId: `preview_order_paper_plans__plan_id__order_preview_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `224`행

**동작:** 현재 확인 가능한 가격이 다음 달에도 같다는 가정으로 영향을 계산한다. 실제 미래 체결 가격을 쓰지 않으며 주문·사본·Run을 저장하지 않는다. 확정하려면 orders API를 별도로 호출한다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [OrderPreviewCreate](#schema-orderpreviewcreate) · `application/json` · 필수

| 필드       | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                | 설명                 |
| ---------- | ------- | ---- | --------------- | ----------------------------------- | -------------------- |
| `side`     | string  | 예   | 명시 없음       | 허용값 `["buy","sell"]`             | buy=매수, sell=매도. |
| `quantity` | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `1000000000.0` | 주식 수량(주).       |

**요청 예시**

```json
{
  "side": "buy",
  "quantity": 10
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [OrderPreviewDetail](#schema-orderpreviewdetail)   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `422 ORDER_VALUE_TOO_LARGE`, `503 ENGINE_OUTPUT_INVALID`.

<a id="operation-24"></a>

### 3.24 미체결 모의 주문 취소

`POST /paper-plans/{plan_id}/orders/{order_id}/cancel`

- Swagger 태그: `paper-trading`
- operationId: `cancel_order_paper_plans__plan_id__orders__order_id__cancel_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `269`행

**동작:** 현재 월의 미체결 주문을 제외한 새 사본을 만든다. 기존 사본은 보존한다. 체결·거절 등 이미 처리된 주문은 취소할 수 없다.

**경로·쿼리 매개변수**

| 이름       | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| ---------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id`  | path | 예   | string (uuid) | 명시 없음 | —    |
| `order_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [PaperCancel](#schema-papercancel) · `application/json` · 필수

| 필드        | 자료형        | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | ------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000009"
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PaperBundle](#schema-paperbundle)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 ORDER_NOT_FOUND`, `409 ORDER_ALREADY_PROCESSED`.

<a id="operation-25"></a>

### 3.25 모의투자 생활 조건 조회

`GET /paper-plans/{plan_id}/conditions`

- Swagger 태그: `paper-trading`
- operationId: `read_conditions_paper_plans__plan_id__conditions_get`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `305`행

**동작:** 현재 월 다음 달에 적용될 소득·생활비·저축과 편집 가능 여부·적용 기간을 조회한다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                                 | Content-Type       | Swagger 설명        |
| --------- | ------------------------------------------------------ | ------------------ | ------------------- |
| `200`     | [PaperConditionsDetail](#schema-paperconditionsdetail) | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror)     | `application/json` | Validation Error    |

<a id="operation-26"></a>

### 3.26 모의투자 생활 조건 변경

`POST /paper-plans/{plan_id}/conditions`

- Swagger 태그: `paper-trading`
- operationId: `change_conditions_paper_plans__plan_id__conditions_post`
- 접근: 게스트 소유권
- 구현: [app/paper.py](app/paper.py) · `329`행

**동작:** values에 바꿀 항목을 하나 이상 전달한다. null은 변경값으로 허용되지 않는다. 다음 달부터 자료 지원 끝까지 변경하며 다른 항목·일회성 지출·금리·주문은 보존한다. 변화가 없으면 409 CONDITIONS_UNCHANGED다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [PaperConditionsCreate](#schema-paperconditionscreate) · `application/json` · 필수

| 필드        | 자료형                                               | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | ---------------------------------------------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid)                                        | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `values`    | [PaperConditionValues](#schema-paperconditionvalues) | 예   | 명시 없음       | —    | 변경할 생활 조건 값 또는 조회한 유효 조건.                            |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000010",
  "values": {
    "expense": 1400000
  }
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [PaperBundle](#schema-paperbundle)                 | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `409 CONDITIONS_UNCHANGED`, `409 SERIES_PERIOD_EXCEEDED`, `422 CONDITIONS_INVALID`.

<a id="operation-27"></a>

### 3.27 저장된 모의투자 사본 비교

`POST /paper-comparisons`

- Swagger 태그: `paper-comparison`
- operationId: `compare_paper_comparisons_post`
- 접근: 게스트 소유권
- 구현: [app/paper_comparison.py](app/paper_comparison.py) · `34`행

**동작:** 동일 소유자의 서로 다른 2~3개 사본을 비교한다. 금융 출발 계획·초기 조건·가격 해시·엔진 버전이 같아야 한다. 기본 비교 월은 공통 진행 월의 최솟값이고 첫 ID가 기준이다. 저장 결과만 잘라 비교하며 재계산·사본 생성·LLM 호출을 하지 않는다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [PaperComparisonCreate](#schema-papercomparisoncreate) · `application/json` · 필수

| 필드           | 자료형                     | 필수   | 기본값(OpenAPI) | 제약                                  | 설명                                     |
| -------------- | -------------------------- | ------ | --------------- | ------------------------------------- | ---------------------------------------- |
| `planIds`      | array&lt;string (uuid)&gt; | 예     | 명시 없음       | 최소 항목 수 `2`; 최대 항목 수 `3`    | 비교할 서로 다른 모의투자 사본 ID 2~3개. |
| `throughMonth` | anyOf(integer / null)      | 아니요 | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0` | 조회·비교 끝 월.                         |

**요청 예시**

```json
{
  "planIds": [
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000012"
  ]
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                                 | Content-Type       | Swagger 설명        |
| --------- | ------------------------------------------------------ | ------------------ | ------------------- |
| `200`     | [PaperComparisonDetail](#schema-papercomparisondetail) | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror)     | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `409 COMPARISON_FUTURE_MONTH`, `409 COMPARISON_INCOMPATIBLE`, `503 COMPARISON_INPUT_INVALID`.

<a id="operation-28"></a>

### 3.28 모의투자 기본 설명

`GET /paper-runs/{run_id}/explanation`

- Swagger 태그: `paper-explanation`
- operationId: `basic_explanation_paper_runs__run_id__explanation_get`
- 접근: 게스트 소유권
- 구현: [app/paper_explanation_api.py](app/paper_explanation_api.py) · `35`행

**동작:** 저장된 본인 Run의 수치로 정형 설명을 구성한다. 외부 LLM 호출이나 설명 캐시 저장 없이 조회한다.

**경로·쿼리 매개변수**

| 이름     | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| -------- | ---- | ---- | ------------- | --------- | ---- |
| `run_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [PaperExplainDetail](#schema-paperexplaindetail)   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-29"></a>

### 3.29 모의투자 AI 정렬 설명

`POST /paper-runs/{run_id}/explanation`

- Swagger 태그: `paper-explanation`
- operationId: `ranked_explanation_paper_runs__run_id__explanation_post`
- 접근: 게스트 소유권 + AI 요청 제한
- 구현: [app/paper_explanation_api.py](app/paper_explanation_api.py) · `48`행

**동작:** useAI=true로 서버가 만든 사실 문장의 선택·순서 구성을 요청한다. 모델 원문으로 금액을 만들지 않는다. 검증 실패 시 기본 설명으로 대체하고, 성공 결과는 Run·프롬프트·모델 기준으로 캐시한다.

**경로·쿼리 매개변수**

| 이름     | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| -------- | ---- | ---- | ------------- | --------- | ---- |
| `run_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [PaperExplainCreate](#schema-paperexplaincreate) · `application/json` · 필수

| 필드    | 자료형  | 필수 | 기본값(OpenAPI) | 제약          | 설명                                 |
| ------- | ------- | ---- | --------------- | ------------- | ------------------------------------ |
| `useAI` | boolean | 예   | 명시 없음       | 고정값 `true` | AI 사실 선택·정렬 요청. true만 허용. |

**요청 예시**

```json
{
  "useAI": true
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [PaperExplainDetail](#schema-paperexplaindetail)   | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 PAPER_RUN_NOT_FOUND`.

<a id="operation-30"></a>

### 3.30 가상 뉴스 선택 결과 저장

`POST /paper-plans/{plan_id}/news-games`

- Swagger 태그: `news-games`
- operationId: `create_paper_plans__plan_id__news_games_post`
- 접근: 게스트 소유권
- 구현: [app/news_games.py](app/news_games.py) · `26`행

**동작:** 서버가 본인 PaperPlan의 연결 Run에서 출발 자산을 가져온다. 클라이언트는 requestId·choices만 전달한다. 1~4라운드를 서버 엔진으로 계산해 별도 불변 기록을 저장하며 원래 투자 사본은 바꾸지 않는다.

**경로·쿼리 매개변수**

| 이름      | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| --------- | ---- | ---- | ------------- | --------- | ---- |
| `plan_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** [Create](#schema-create) · `application/json` · 필수

| 필드        | 자료형              | 필수 | 기본값(OpenAPI) | 제약                                                                           | 설명                                                                  |
| ----------- | ------------------- | ---- | --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `requestId` | string (uuid)       | 예   | 명시 없음       | —                                                                              | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `choices`   | array&lt;string&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `4`; 배열 항목: 허용값 `["hold","half","sell"]` | 각 라운드 선택. hold=보유, half=절반 매도, sell=전량 매도.            |

**요청 예시**

```json
{
  "requestId": "00000000-0000-4000-8000-000000000013",
  "choices": ["hold", "half", "sell", "hold"]
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `201`     | [Detail](#schema-detail)                           | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `503 ENGINE_OUTPUT_INVALID`, `503 NEWS_SOURCE_INVALID`.

<a id="operation-31"></a>

### 3.31 모의투자의 뉴스 기록 목록

`GET /paper-plans/{plan_id}/news-games`

- Swagger 태그: `news-games`
- operationId: `listing_paper_plans__plan_id__news_games_get`
- 접근: 게스트 소유권
- 구현: [app/news_games.py](app/news_games.py) · `104`행

**동작:** 해당 본인 투자 사본에서 저장한 뉴스 기록을 최신순으로 조회한다. 페이지 객체가 아닌 Detail 배열이다.

**경로·쿼리 매개변수**

| 이름      | 위치  | 필수   | 자료형        | 기본값    | 제약                     |
| --------- | ----- | ------ | ------------- | --------- | ------------------------ |
| `plan_id` | path  | 예     | string (uuid) | 명시 없음 | —                        |
| `limit`   | query | 아니요 | integer       | `20`      | 최솟값 `1`; 최댓값 `100` |
| `offset`  | query | 아니요 | integer       | `0`       | 최솟값 `0`               |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | array&lt;[Detail](#schema-detail)&gt;              | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

<a id="operation-32"></a>

### 3.32 뉴스 기록 상세

`GET /news-games/{record_id}`

- Swagger 태그: `news-games`
- operationId: `read_news_games__record_id__get`
- 접근: 게스트 소유권
- 구현: [app/news_games.py](app/news_games.py) · `125`행

**동작:** 본인 뉴스 기록의 출발 조건·선택·라운드 결과·전부 보유 기준 결과를 저장값 그대로 조회한다.

**경로·쿼리 매개변수**

| 이름        | 위치 | 필수 | 자료형        | 기본값    | 제약 |
| ----------- | ---- | ---- | ------------- | --------- | ---- |
| `record_id` | path | 예   | string (uuid) | 명시 없음 | —    |

**요청 본문:** 없음.

**OpenAPI 응답**

| HTTP 상태 | 자료형                                             | Content-Type       | Swagger 설명        |
| --------- | -------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [Detail](#schema-detail)                           | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror) | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 NEWS_GAME_NOT_FOUND`.

<a id="operation-33"></a>

### 3.33 저장된 뉴스 기록 비교

`POST /news-game-comparisons`

- Swagger 태그: `news-games`
- operationId: `compare_news_game_comparisons_post`
- 접근: 게스트 소유권
- 구현: [app/news_comparison.py](app/news_comparison.py) · `57`행

**동작:** 같은 출발 PaperPlan·PaperRun·버전·seed를 가진 서로 다른 2~3개 기록을 비교한다. 기본 시점은 공통 완료 라운드의 최솟값이며 이후 라운드는 노출하지 않는다. 새 계산·기록 저장·LLM 호출을 하지 않는다.

**경로·쿼리 매개변수:** 없음.

**요청 본문:** [Selection](#schema-selection) · `application/json` · 필수

| 필드           | 자료형                     | 필수   | 기본값(OpenAPI) | 제약                                | 설명                                 |
| -------------- | -------------------------- | ------ | --------------- | ----------------------------------- | ------------------------------------ |
| `recordIds`    | array&lt;string (uuid)&gt; | 예     | 명시 없음       | 최소 항목 수 `2`; 최대 항목 수 `3`  | 비교할 서로 다른 뉴스 기록 ID 2~3개. |
| `throughRound` | anyOf(integer / null)      | 아니요 | 명시 없음       | integer: 최솟값 `1.0`; 최댓값 `4.0` | 뉴스 비교 끝 라운드(1~4).            |

**요청 예시**

```json
{
  "recordIds": [
    "00000000-0000-4000-8000-000000000014",
    "00000000-0000-4000-8000-000000000015"
  ],
  "throughRound": 2
}
```

**OpenAPI 응답**

| HTTP 상태 | 자료형                                                                       | Content-Type       | Swagger 설명        |
| --------- | ---------------------------------------------------------------------------- | ------------------ | ------------------- |
| `200`     | [app**news_comparison**Comparison](#schema-app--news-comparison--comparison) | `application/json` | Successful Response |
| `422`     | [HTTPValidationError](#schema-httpvalidationerror)                           | `application/json` | Validation Error    |

**코드에 직접 선언된 오류:** `404 NEWS_GAME_NOT_FOUND`, `409 NEWS_COMPARISON_FUTURE_ROUND`, `409 NEWS_COMPARISON_INCOMPATIBLE`.

<a id="schemas"></a>

## 4. 요청·응답 스키마

아래 이름은 OpenAPI `components.schemas`의 키와 정확히 일치한다. `Create`·`Detail`·`State`·`Result`·`Round`·`Path`·`Selection`은 뉴스 도메인의 모델이다. `app__...__Comparison`은 서로 다른 모듈의 동명 모델을 구분하기 위한 OpenAPI 이름이다.

“명시 없음”은 OpenAPI에 default 키가 없다는 뜻이며, 필수 필드의 기본값이 있다는 뜻은 아니다. 객체 표의 필수 여부는 해당 객체 내부 기준이다.

<a id="schema-applychange"></a>

### ApplyChange

형식: object. 추가 필드 금지.

| 필드        | 자료형  | 필수 | 기본값(OpenAPI) | 제약          | 설명                           |
| ----------- | ------- | ---- | --------------- | ------------- | ------------------------------ |
| `confirmed` | boolean | 예   | 명시 없음       | 고정값 `true` | 명시적 변경 승인. true만 허용. |

<a id="schema-applyresult"></a>

### ApplyResult

형식: object. 추가 필드 금지.

| 필드                | 자료형                                                             | 필수 | 기본값(OpenAPI) | 제약                | 설명                                                     |
| ------------------- | ------------------------------------------------------------------ | ---- | --------------- | ------------------- | -------------------------------------------------------- |
| `plan`              | [PlanDetail](#schema-plandetail)                                   | 예   | 명시 없음       | —                   | 저장된 금융 또는 투자 계획. 연결된 스키마를 따른다.      |
| `run`               | [RunDetail](#schema-rundetail)                                     | 예   | 명시 없음       | —                   | 저장된 금융 또는 투자 계산 결과. 연결된 스키마를 따른다. |
| `comparison`        | [app**ai_schemas**Comparison](#schema-app--ai-schemas--comparison) | 예   | 명시 없음       | —                   | —                                                        |
| `explanation`       | string                                                             | 예   | 명시 없음       | —                   | —                                                        |
| `explanationSource` | string                                                             | 예   | 명시 없음       | 고정값 `"template"` | 설명의 생성 방식.                                        |
| `toolsExecuted`     | array&lt;string&gt;                                                | 예   | 명시 없음       | —                   | —                                                        |

<a id="schema-baselineresult"></a>

### BaselineResult

형식: object. 추가 필드 금지.

| 필드             | 자료형                                              | 필수 | 기본값(OpenAPI) | 제약                                 | 설명                          |
| ---------------- | --------------------------------------------------- | ---- | --------------- | ------------------------------------ | ----------------------------- |
| `engineVersion`  | string                                              | 예   | 명시 없음       | 고정값 `"cash-savings-krw-v1"`       | 계산 엔진 버전.               |
| `monthlyResults` | array&lt;[MonthlyResult](#schema-monthlyresult)&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `121` | 월 0을 포함한 월별 결과 배열. |
| `summary`        | [RunMetrics](#schema-runmetrics)                    | 예   | 명시 없음       | —                                    | 계산 구간 요약.               |

<a id="schema-change"></a>

### Change

형식: object. 추가 필드 금지.

| 필드   | 자료형                | 필수   | 기본값(OpenAPI) | 제약                                            | 설명                                                                       |
| ------ | --------------------- | ------ | --------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `type` | string                | 예     | 명시 없음       | 허용값 `["expense","income","saving","once"]`   | —                                                                          |
| `v`    | integer               | 예     | 명시 없음       | 최솟값 `-10000000000.0`; 최댓값 `10000000000.0` | 변경 금액(원). saving은 설정액, income/expense는 증감, once는 일회성 지출. |
| `m`    | integer               | 예     | 명시 없음       | 최솟값 `1.0`; 최댓값 `120.0`                    | 효과 적용 시작 월(1~120).                                                  |
| `end`  | anyOf(integer / null) | 아니요 | 명시 없음       | integer: 최솟값 `1.0`; 최댓값 `120.0`           | 효과 종료 월(포함). null/생략 시 끝까지. once는 시작 월에만 적용.          |

<a id="schema-changeintent"></a>

### ChangeIntent

형식: object. 추가 필드 금지.

| 필드         | 자료형               | 필수 | 기본값(OpenAPI) | 제약                                          | 설명                                                               |
| ------------ | -------------------- | ---- | --------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `field`      | string               | 예   | 명시 없음       | 허용값 `["income","expense","monthlySaving"]` | 변경할 소득·생활비·저축 항목.                                      |
| `operation`  | string               | 예   | 명시 없음       | 허용값 `["set","add","subtract"]`             | set=설정, add=증가, subtract=감소.                                 |
| `amount`     | integer              | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0`          | 변경 금액(정수 원). 차감도 양수 금액과 subtract 연산으로 표현한다. |
| `startMonth` | string               | 예   | 명시 없음       | 패턴 `"^\\d{4}-(0[1-9]&#124;1[0-2])$"`        | 시작 연월. AI 조건에서는 효과 시작 연월.                           |
| `endMonth`   | anyOf(string / null) | 예   | 명시 없음       | —                                             | 효과 종료 연월. null은 기본 종료 시점까지.                         |

<a id="schema-changepreview"></a>

### ChangePreview

형식: object. 추가 필드 금지.

| 필드         | 자료형                                                            | 필수 | 기본값(OpenAPI) | 제약                                          | 설명                                                               |
| ------------ | ----------------------------------------------------------------- | ---- | --------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `field`      | string                                                            | 예   | 명시 없음       | 허용값 `["income","expense","monthlySaving"]` | 변경할 소득·생활비·저축 항목.                                      |
| `label`      | string                                                            | 예   | 명시 없음       | —                                             | —                                                                  |
| `operation`  | string                                                            | 예   | 명시 없음       | 허용값 `["set","add","subtract"]`             | set=설정, add=증가, subtract=감소.                                 |
| `amount`     | integer                                                           | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0`          | 변경 금액(정수 원). 차감도 양수 금액과 subtract 연산으로 표현한다. |
| `startMonth` | string                                                            | 예   | 명시 없음       | —                                             | 시작 연월. AI 조건에서는 효과 시작 연월.                           |
| `endMonth`   | string                                                            | 예   | 명시 없음       | —                                             | 효과 종료 연월. null은 기본 종료 시점까지.                         |
| `segments`   | array&lt;[ChangePreviewSegment](#schema-changepreviewsegment)&gt; | 예   | 명시 없음       | 최대 항목 수 `120`                            | —                                                                  |

<a id="schema-changepreviewsegment"></a>

### ChangePreviewSegment

형식: object. 추가 필드 금지.

| 필드         | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                      | 설명                                       |
| ------------ | ------- | ---- | --------------- | ----------------------------------------- | ------------------------------------------ |
| `startMonth` | string  | 예   | 명시 없음       | —                                         | 시작 연월. AI 조건에서는 효과 시작 연월.   |
| `endMonth`   | string  | 예   | 명시 없음       | —                                         | 효과 종료 연월. null은 기본 종료 시점까지. |
| `before`     | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | —                                          |
| `after`      | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | —                                          |

<a id="schema-create"></a>

### Create

형식: object. 추가 필드 금지.

| 필드        | 자료형              | 필수 | 기본값(OpenAPI) | 제약                                                                           | 설명                                                                  |
| ----------- | ------------------- | ---- | --------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `requestId` | string (uuid)       | 예   | 명시 없음       | —                                                                              | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `choices`   | array&lt;string&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `4`; 배열 항목: 허용값 `["hold","half","sell"]` | 각 라운드 선택. hold=보유, half=절반 매도, sell=전량 매도.            |

<a id="schema-databasehealthresponse"></a>

### DatabaseHealthResponse

형식: object. 추가 필드 금지는 OpenAPI에 선언되어 있지 않다.

| 필드       | 자료형 | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                        |
| ---------- | ------ | ---- | --------------- | ---- | ----------------------------------------------------------- |
| `status`   | string | 예   | 명시 없음       | —    | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `database` | string | 예   | 명시 없음       | —    | —                                                           |

<a id="schema-detail"></a>

### Detail

형식: object. 추가 필드 금지.

| 필드          | 자료형                   | 필수 | 기본값(OpenAPI) | 제약 | 설명                                              |
| ------------- | ------------------------ | ---- | --------------- | ---- | ------------------------------------------------- |
| `id`          | string (uuid)            | 예   | 명시 없음       | —    | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다. |
| `paperPlanId` | string (uuid)            | 예   | 명시 없음       | —    | 모의투자 PaperPlan ID.                            |
| `paperRunId`  | string (uuid)            | 예   | 명시 없음       | —    | 출발 모의투자 Run ID.                             |
| `name`        | string                   | 예   | 명시 없음       | —    | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.    |
| `sourceMonth` | integer                  | 예   | 명시 없음       | —    | 뉴스 게임 출발 투자 월.                           |
| `createdAt`   | integer                  | 예   | 명시 없음       | —    | 생성 Unix timestamp(마이크로초).                  |
| `result`      | [Result](#schema-result) | 예   | 명시 없음       | —    | —                                                 |

<a id="schema-effectivepaperconditions"></a>

### EffectivePaperConditions

형식: object. 추가 필드 금지.

| 필드            | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                      | 설명                                                         |
| --------------- | ------- | ---- | --------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `income`        | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 월 소득(원).                                                 |
| `expense`       | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `monthlySaving` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 월말 저축 이체액(원).                                        |

<a id="schema-eventcreate"></a>

### EventCreate

형식: object. 추가 필드 금지.

| 필드                | 자료형                           | 필수   | 기본값(OpenAPI)    | 제약                      | 설명                                                                  |
| ------------------- | -------------------------------- | ------ | ------------------ | ------------------------- | --------------------------------------------------------------------- |
| `requestId`         | string (uuid)                    | 예     | 명시 없음          | —                         | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `eventRulesVersion` | string                           | 아니요 | `"life-events-v1"` | 고정값 `"life-events-v1"` | —                                                                     |
| `base`              | [PlanCreate](#schema-plancreate) | 예     | 명시 없음          | —                         | 선택 전 금융 PlanCreate.                                              |
| `eventMonth`        | integer                          | 예     | 명시 없음          | 허용값 `[12,30,48,72,96]` | 생애 이벤트가 발생한 월.                                              |
| `accepted`          | boolean                          | 예     | 명시 없음          | —                         | 이벤트 수락 여부.                                                     |

<a id="schema-eventresult"></a>

### EventResult

형식: object. 추가 필드 금지.

| 필드       | 자료형                           | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                     |
| ---------- | -------------------------------- | ---- | --------------- | ---- | -------------------------------------------------------- |
| `basePlan` | [PlanDetail](#schema-plandetail) | 예   | 명시 없음       | —    | 선택 전 저장 계획.                                       |
| `plan`     | [PlanDetail](#schema-plandetail) | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계획. 연결된 스키마를 따른다.      |
| `run`      | [RunDetail](#schema-rundetail)   | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계산 결과. 연결된 스키마를 따른다. |

<a id="schema-explainrequest"></a>

### ExplainRequest

형식: object. 추가 필드 금지.

| 필드    | 자료형        | 필수 | 기본값(OpenAPI) | 제약 | 설명               |
| ------- | ------------- | ---- | --------------- | ---- | ------------------ |
| `runId` | string (uuid) | 예   | 명시 없음       | —    | 연결 계산 결과 ID. |

<a id="schema-explainresult"></a>

### ExplainResult

형식: object. 추가 필드 금지.

| 필드              | 자료형               | 필수 | 기본값(OpenAPI) | 제약                        | 설명                                                             |
| ----------------- | -------------------- | ---- | --------------- | --------------------------- | ---------------------------------------------------------------- |
| `text`            | string               | 예   | 명시 없음       | —                           | —                                                                |
| `source`          | string               | 예   | 명시 없음       | 허용값 `["template","llm"]` | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `attempts`        | integer              | 예   | 명시 없음       | —                           | 외부 모델 호출 시도 횟수.                                        |
| `fallbackReason`  | anyOf(string / null) | 예   | 명시 없음       | —                           | 정형 설명으로 대체한 이유. 대체하지 않았으면 null.               |
| `verifiedNumbers` | boolean              | 예   | 명시 없음       | 고정값 `true`               | 서버가 확정한 사실·수치에 연결된 설명인지 여부.                  |

<a id="schema-explanationsection"></a>

### ExplanationSection

형식: object. 추가 필드 금지.

| 필드    | 자료형 | 필수 | 기본값(OpenAPI) | 제약                                                                                            | 설명                                              |
| ------- | ------ | ---- | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `id`    | string | 예   | 명시 없음       | 허용값 `["comparison","portfolio","pnl","goal","liquidity","orders","assumptions","valuation"]` | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다. |
| `title` | string | 예   | 명시 없음       | —                                                                                               | —                                                 |
| `text`  | string | 예   | 명시 없음       | —                                                                                               | —                                                 |

<a id="schema-filledexecution"></a>

### FilledExecution

형식: object. 추가 필드 금지.

| 필드             | 자료형                             | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                        |
| ---------------- | ---------------------------------- | ---- | --------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `order`          | [OrderIntent](#schema-orderintent) | 예   | 명시 없음       | —                                                         | —                                                           |
| `status`         | string                             | 예   | 명시 없음       | 고정값 `"filled"`                                         | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `price`          | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 주당 가격(원). null이면 확인 가능한 가격 없음.              |
| `gross`          | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 금액(원).                                              |
| `fee`            | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 수수료(원).                                                 |
| `tax`            | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 매도세(원).                                                 |
| `feeBps`         | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000.0`                            | 수수료율. 1bps=0.01%.                                       |
| `sellTaxBps`     | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000.0`                            | 매도세율. 1bps=0.01%.                                       |
| `cashDelta`      | integer                            | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 거래로 인한 현금 증감(원).                                  |
| `removedCost`    | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 매도 수량에 배분한 취득 원가(원).                           |
| `realizedPnl`    | integer                            | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 실현 손익(원).                                              |
| `cashAfter`      | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 현금(원).                                           |
| `quantityAfter`  | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 보유 수량(주).                                      |
| `costBasisAfter` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 취득 원가(원).                                      |
| `submittedMonth` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 주문 제출 월.                                               |
| `executionMonth` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 주문 실행 월(제출 다음 달).                                 |

<a id="schema-filledtrade"></a>

### FilledTrade

형식: object. 추가 필드 금지.

| 필드             | 자료형                             | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                        |
| ---------------- | ---------------------------------- | ---- | --------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `order`          | [OrderIntent](#schema-orderintent) | 예   | 명시 없음       | —                                                         | —                                                           |
| `status`         | string                             | 예   | 명시 없음       | 고정값 `"filled"`                                         | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `price`          | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 주당 가격(원). null이면 확인 가능한 가격 없음.              |
| `gross`          | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 금액(원).                                              |
| `fee`            | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 수수료(원).                                                 |
| `tax`            | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 매도세(원).                                                 |
| `feeBps`         | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000.0`                            | 수수료율. 1bps=0.01%.                                       |
| `sellTaxBps`     | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000.0`                            | 매도세율. 1bps=0.01%.                                       |
| `cashDelta`      | integer                            | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 거래로 인한 현금 증감(원).                                  |
| `removedCost`    | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 매도 수량에 배분한 취득 원가(원).                           |
| `realizedPnl`    | integer                            | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 실현 손익(원).                                              |
| `cashAfter`      | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 현금(원).                                           |
| `quantityAfter`  | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 보유 수량(주).                                      |
| `costBasisAfter` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 체결 후 취득 원가(원).                                      |

<a id="schema-gamestate"></a>

### GameState

형식: object. 추가 필드 금지.

| 필드            | 자료형                                             | 필수   | 기본값(OpenAPI) | 제약                                                   | 설명                                                              |
| --------------- | -------------------------------------------------- | ------ | --------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `startMonth`    | string                                             | 아니요 | `"2026-10"`     | 고정값 `"2026-10"`                                     | 시작 연월. AI 조건에서는 효과 시작 연월.                          |
| `months`        | integer                                            | 아니요 | `120`           | 고정값 `120`                                           | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다. |
| `initial`       | [InitialState](#schema-initialstate)               | 예     | 명시 없음       | —                                                      | 시작 시점 재무·프로필.                                            |
| `goal`          | anyOf([GoalMetadata](#schema-goalmetadata) / null) | 아니요 | 명시 없음       | —                                                      | 목표 이름·기한 메타데이터. 목표 금액은 initial.target.            |
| `monthlySaving` | integer                                            | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0`                   | 월말 저축 이체액(원).                                             |
| `annualRate`    | number                                             | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `100.0`                           | 연 유효 금리(%). 3은 연 3%.                                       |
| `month`         | integer                                            | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                           | 게임 시작 이후 진행 월 인덱스.                                    |
| `changes`       | array&lt;[Change](#schema-change)&gt;              | 아니요 | 명시 없음       | 최대 항목 수 `200`                                     | 조건 변경 목록. 스키마에 따라 금융 효과 또는 AI 추출 조건.        |
| `rateChanges`   | array&lt;[RateChange](#schema-ratechange)&gt;      | 아니요 | 명시 없음       | 최대 항목 수 `200`                                     | 적용월 이후 금리 변경 목록.                                       |
| `logs`          | array&lt;[LogEntry](#schema-logentry)&gt;          | 아니요 | 명시 없음       | 최대 항목 수 `80`                                      | 사용자 선택·진행 기록.                                            |
| `events`        | array&lt;integer&gt;                               | 아니요 | 명시 없음       | 최대 항목 수 `5`; 배열 항목: 허용값 `[12,30,48,72,96]` | 이미 선택한 이벤트 월 목록.                                       |

<a id="schema-goalmetadata"></a>

### GoalMetadata

형식: object. 추가 필드 금지.

| 필드     | 자료형  | 필수 | 기본값(OpenAPI) | 제약                          | 설명                                                              |
| -------- | ------- | ---- | --------------- | ----------------------------- | ----------------------------------------------------------------- |
| `name`   | string  | 예   | 명시 없음       | 최소 길이 `1`; 최대 길이 `40` | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.                    |
| `months` | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `120.0`  | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다. |

<a id="schema-httpvalidationerror"></a>

### HTTPValidationError

형식: object. 추가 필드 금지는 OpenAPI에 선언되어 있지 않다.

| 필드     | 자료형                                                  | 필수   | 기본값(OpenAPI) | 제약 | 설명 |
| -------- | ------------------------------------------------------- | ------ | --------------- | ---- | ---- |
| `detail` | array&lt;[ValidationError](#schema-validationerror)&gt; | 아니요 | 명시 없음       | —    | —    |

<a id="schema-healthresponse"></a>

### HealthResponse

형식: object. 추가 필드 금지는 OpenAPI에 선언되어 있지 않다.

| 필드     | 자료형 | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                        |
| -------- | ------ | ---- | --------------- | ---- | ----------------------------------------------------------- |
| `status` | string | 예   | 명시 없음       | —    | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |

<a id="schema-initialstate"></a>

### InitialState

형식: object. 추가 필드 금지.

| 필드      | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                 | 설명                                                         |
| --------- | ------- | ---- | --------------- | ------------------------------------ | ------------------------------------------------------------ |
| `name`    | string  | 예   | 명시 없음       | 최소 길이 `1`; 최대 길이 `40`        | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.               |
| `age`     | integer | 예   | 명시 없음       | 최솟값 `18.0`; 최댓값 `80.0`         | 시작 나이(세).                                               |
| `avatar`  | string  | 예   | 명시 없음       | 최소 길이 `1`; 최대 길이 `16`        | 프로필 아바타 문자열.                                        |
| `cash`    | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0` | 가용 현금(원).                                               |
| `saved`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0` | 저축 잔액(원).                                               |
| `income`  | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0` | 월 소득(원).                                                 |
| `expense` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `10000000000.0` | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `target`  | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `10000000000.0` | 목표 순자산(원).                                             |

<a id="schema-investmentaccount"></a>

### InvestmentAccount

형식: object. 추가 필드 금지.

| 필드          | 자료형                                                                                          | 필수 | 기본값(OpenAPI) | 제약                                                                                                                                                                          | 설명                                  |
| ------------- | ----------------------------------------------------------------------------------------------- | ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `symbol`      | string                                                                                          | 예   | 명시 없음       | —                                                                                                                                                                             | 종목 식별자.                          |
| `initialCash` | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 투자 계정의 시작 현금(원).            |
| `cash`        | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 가용 현금(원).                        |
| `quantity`    | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 주식 수량(주).                        |
| `costBasis`   | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 보유 주식 취득 원가(원).              |
| `realizedPnl` | integer                                                                                         | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0`                                                                                                                     | 실현 손익(원).                        |
| `netCashFlow` | integer                                                                                         | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0`                                                                                                                     | 투자 계정의 누적 외부 순현금흐름(원). |
| `feesPaid`    | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 누적 수수료(원).                      |
| `taxesPaid`   | integer                                                                                         | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                                                                                                                                     | 누적 세금(원).                        |
| `executions`  | array&lt;oneOf([FilledTrade](#schema-filledtrade) / [RejectedTrade](#schema-rejectedtrade))&gt; | 예   | 명시 없음       | 최대 항목 수 `1000`; 배열 항목: 분기 기준 `{"propertyName":"status","mapping":{"filled":"#/components/schemas/FilledTrade","rejected":"#/components/schemas/RejectedTrade"}}` | —                                     |

<a id="schema-investmentengineresult"></a>

### InvestmentEngineResult

형식: object. 추가 필드 금지.

| 필드             | 자료형                                                                                                          | 필수 | 기본값(OpenAPI) | 제약                                                                                                                                                                                  | 설명                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `engineVersion`  | string                                                                                                          | 예   | 명시 없음       | 고정값 `"monthly-investment-krw-v2"`                                                                                                                                                  | 계산 엔진 버전.               |
| `priceSeriesId`  | string                                                                                                          | 예   | 명시 없음       | —                                                                                                                                                                                     | 등록 가격 자료 식별자.        |
| `monthlyResults` | array&lt;[InvestmentMonth](#schema-investmentmonth)&gt;                                                         | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `121`                                                                                                                                                  | 월 0을 포함한 월별 결과 배열. |
| `summary`        | [InvestmentMetrics](#schema-investmentmetrics)                                                                  | 예   | 명시 없음       | —                                                                                                                                                                                     | 계산 구간 요약.               |
| `executions`     | array&lt;oneOf([FilledExecution](#schema-filledexecution) / [RejectedExecution](#schema-rejectedexecution))&gt; | 예   | 명시 없음       | 최대 항목 수 `1000`; 배열 항목: 분기 기준 `{"propertyName":"status","mapping":{"filled":"#/components/schemas/FilledExecution","rejected":"#/components/schemas/RejectedExecution"}}` | —                             |
| `pendingOrders`  | array&lt;[OrderRecord](#schema-orderrecord)&gt;                                                                 | 예   | 명시 없음       | 최대 항목 수 `1000`                                                                                                                                                                   | —                             |
| `account`        | [InvestmentAccount](#schema-investmentaccount)                                                                  | 예   | 명시 없음       | —                                                                                                                                                                                     | —                             |

<a id="schema-investmentmetrics"></a>

### InvestmentMetrics

형식: object. 추가 필드 금지.

| 필드                   | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                           |
| ---------------------- | --------------------- | ---- | --------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `goalMonth`            | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                     | 관측 구간 내 최초 목표 달성 월. 미달성은 null. |
| `finalNetAssets`       | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 마지막 시점 순자산(원).                        |
| `finalCash`            | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 시점 현금(원).                          |
| `finalSaved`           | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 시점 저축(원).                          |
| `firstShortageMonth`   | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                     | 최초 지출 부족 월. 없으면 null.                |
| `shortageMonths`       | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 지출 부족이 발생한 월 수.                      |
| `unmetTotal`           | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 월의 누적 미충족 지출(원).              |
| `finalInvestmentValue` | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 시점 주식 평가액(원).                   |
| `finalRealizedPnl`     | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | —                                              |
| `finalUnrealizedPnl`   | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | —                                              |

<a id="schema-investmentmonth"></a>

### InvestmentMonth

형식: object. 추가 필드 금지.

| 필드         | 자료형                       | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                         |
| ------------ | ---------------------------- | ---- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `month`      | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 게임 시작 이후 진행 월 인덱스.                               |
| `cash`       | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 가용 현금(원).                                               |
| `saved`      | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 저축 잔액(원).                                               |
| `unpaid`     | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 누적 미충족 지출(원).                                        |
| `total`      | integer                      | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 현금 + 저축 + 투자 평가액(해당 시) − 누적 미충족 지출(원).   |
| `income`     | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 월 소득(원).                                                 |
| `expense`    | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `short`      | integer                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 해당 월의 미충족 지출(원).                                   |
| `investment` | [Position](#schema-position) | 예   | 명시 없음       | —                                                         | —                                                            |

<a id="schema-logentry"></a>

### LogEntry

형식: object. 추가 필드 금지.

| 필드    | 자료형  | 필수 | 기본값(OpenAPI) | 제약                         | 설명                           |
| ------- | ------- | ---- | --------------- | ---------------------------- | ------------------------------ |
| `month` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0` | 게임 시작 이후 진행 월 인덱스. |
| `text`  | string  | 예   | 명시 없음       | 최대 길이 `500`              | —                              |

<a id="schema-marketsource"></a>

### MarketSource

형식: object. 추가 필드 금지.

| 필드                   | 자료형                           | 필수   | 기본값(OpenAPI) | 제약                                                 | 설명                              |
| ---------------------- | -------------------------------- | ------ | --------------- | ---------------------------------------------------- | --------------------------------- |
| `priceSeriesId`        | string                           | 예     | 명시 없음       | —                                                    | 등록 가격 자료 식별자.            |
| `symbol`               | string                           | 예     | 명시 없음       | —                                                    | 종목 식별자.                      |
| `label`                | string                           | 예     | 명시 없음       | —                                                    | —                                 |
| `dataKind`             | string                           | 예     | 명시 없음       | 허용값 `["synthetic-test-only","historical-market"]` | 가상/과거 자료 구분.              |
| `priceDataHash`        | string                           | 예     | 명시 없음       | —                                                    | 고정된 전체 가격 자료 해시.       |
| `lastMonth`            | integer                          | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                         | 자료가 지원하는 마지막 월 인덱스. |
| `provider`             | anyOf(string / null)             | 아니요 | 명시 없음       | —                                                    | —                                 |
| `sourceUrl`            | anyOf(string / null)             | 아니요 | 명시 없음       | —                                                    | 자료 출처 URL.                    |
| `collectedAt`          | anyOf(string (date-time) / null) | 아니요 | 명시 없음       | —                                                    | 수집 시각 문자열.                 |
| `historicalStartMonth` | anyOf(string / null)             | 아니요 | 명시 없음       | —                                                    | —                                 |
| `historicalEndMonth`   | anyOf(string / null)             | 아니요 | 명시 없음       | —                                                    | —                                 |
| `adjustment`           | anyOf(string / null)             | 아니요 | 명시 없음       | string: 고정값 `"unadjusted"`                        | —                                 |
| `sampling`             | anyOf(string / null)             | 아니요 | 명시 없음       | string: 고정값 `"last-observed-daily-close"`         | —                                 |
| `corporateActions`     | anyOf(string / null)             | 아니요 | 명시 없음       | string: 고정값 `"not-modeled"`                       | —                                 |

<a id="schema-marketview"></a>

### MarketView

형식: object. 추가 필드 금지.

| 필드           | 자료형                               | 필수 | 기본값(OpenAPI) | 제약                         | 설명                                                             |
| -------------- | ------------------------------------ | ---- | --------------- | ---------------------------- | ---------------------------------------------------------------- |
| `source`       | [MarketSource](#schema-marketsource) | 예   | 명시 없음       | —                            | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `throughMonth` | integer                              | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0` | 조회·비교 끝 월.                                                 |
| `prices`       | array&lt;[Price](#schema-price)&gt;  | 예   | 명시 없음       | —                            | —                                                                |

<a id="schema-monthlyresult"></a>

### MonthlyResult

형식: object. 추가 필드 금지.

| 필드      | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                         |
| --------- | ------- | ---- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| `month`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 게임 시작 이후 진행 월 인덱스.                               |
| `cash`    | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 가용 현금(원).                                               |
| `saved`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 저축 잔액(원).                                               |
| `unpaid`  | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 누적 미충족 지출(원).                                        |
| `total`   | integer | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 현금 + 저축 + 투자 평가액(해당 시) − 누적 미충족 지출(원).   |
| `income`  | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 월 소득(원).                                                 |
| `expense` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `short`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 해당 월의 미충족 지출(원).                                   |

<a id="schema-orderintent"></a>

### OrderIntent

형식: object. 추가 필드 금지.

| 필드       | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                      | 설명                                              |
| ---------- | ------- | ---- | --------------- | ----------------------------------------- | ------------------------------------------------- |
| `id`       | string  | 예   | 명시 없음       | —                                         | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다. |
| `symbol`   | string  | 예   | 명시 없음       | —                                         | 종목 식별자.                                      |
| `side`     | string  | 예   | 명시 없음       | 허용값 `["buy","sell"]`                   | buy=매수, sell=매도.                              |
| `quantity` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 주식 수량(주).                                    |

<a id="schema-orderpreviewcreate"></a>

### OrderPreviewCreate

형식: object. 추가 필드 금지.

| 필드       | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                | 설명                 |
| ---------- | ------- | ---- | --------------- | ----------------------------------- | -------------------- |
| `side`     | string  | 예   | 명시 없음       | 허용값 `["buy","sell"]`             | buy=매수, sell=매도. |
| `quantity` | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `1000000000.0` | 주식 수량(주).       |

<a id="schema-orderpreviewdetail"></a>

### OrderPreviewDetail

형식: object. 추가 필드 금지.

| 필드                     | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                               | 설명                                                          |
| ------------------------ | --------------------- | ---- | --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `basis`                  | string                | 예   | 명시 없음       | 고정값 `"current-price-assumption"`                                | 비교·미리보기 계산 기준.                                      |
| `referencePrice`         | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 미리보기의 현재 확인 가능한 기준 주가(원).                    |
| `referencePriceMonth`    | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                              | 미리보기 기준 주가의 관측 월.                                 |
| `staleReference`         | boolean               | 예   | 명시 없음       | —                                                                  | 미리보기 기준 가격이 현재 월보다 이전인지 여부.               |
| `referenceGross`         | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 현재 가격 기준 예상 주문 금액(원).                            |
| `referenceFee`           | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 현재 가격 기준 예상 수수료(원).                               |
| `referenceTax`           | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 현재 가격 기준 예상 매도세(원).                               |
| `referenceCashChange`    | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 현재 가격 기준 예상 거래 현금 증감(원).                       |
| `currentCash`            | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 현재 가용 현금(원).                                           |
| `currentQuantity`        | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 현재 보유 수량(주).                                           |
| `reservedSellQuantity`   | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 기존 미체결 매도 예약 수량(주).                               |
| `availableSellQuantity`  | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 예약을 제외한 추가 매도 가능 수량(주).                        |
| `existingPendingCount`   | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `1000.0`                                      | 기존 미체결 주문 수.                                          |
| `nextIncome`             | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 다음 달 소득(원).                                             |
| `nextExpense`            | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 다음 달 생활비·일회성 지출(원).                               |
| `estimatedNextCash`      | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 현재 가격 가정에서 다음 달 말 예상 현금(원).                  |
| `estimatedNextSaved`     | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 현재 가격 가정에서 다음 달 말 예상 저축(원).                  |
| `estimatedNextShortfall` | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                          | 현재 가격 가정에서 다음 달 예상 미충족 지출(원).              |
| `estimatedStatus`        | string                | 예   | 명시 없음       | 허용값 `["filled","rejected","unavailable"]`                       | 현재 가격 가정에서 예상한 체결 상태. 실제 체결 보장이 아니다. |
| `estimatedReason`        | anyOf(string / null)  | 예   | 명시 없음       | —                                                                  | 예상 거절·계산 불가 이유. 없으면 null.                        |
| `paperPlanId`            | string (uuid)         | 예   | 명시 없음       | —                                                                  | 모의투자 PaperPlan ID.                                        |
| `symbol`                 | string                | 예   | 명시 없음       | —                                                                  | 종목 식별자.                                                  |
| `side`                   | string                | 예   | 명시 없음       | 허용값 `["buy","sell"]`                                            | buy=매수, sell=매도.                                          |
| `quantity`               | integer               | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `1000000000.0`                                | 주식 수량(주).                                                |
| `month`                  | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                       | 게임 시작 이후 진행 월 인덱스.                                |
| `executionMonth`         | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                       | 주문 실행 월(제출 다음 달).                                   |

<a id="schema-orderrecord"></a>

### OrderRecord

형식: object. 추가 필드 금지.

| 필드             | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                      | 설명                                              |
| ---------------- | ------- | ---- | --------------- | ----------------------------------------- | ------------------------------------------------- |
| `id`             | string  | 예   | 명시 없음       | —                                         | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다. |
| `symbol`         | string  | 예   | 명시 없음       | —                                         | 종목 식별자.                                      |
| `side`           | string  | 예   | 명시 없음       | 허용값 `["buy","sell"]`                   | buy=매수, sell=매도.                              |
| `quantity`       | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 주식 수량(주).                                    |
| `submittedMonth` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`              | 주문 제출 월.                                     |

<a id="schema-paperadvance"></a>

### PaperAdvance

형식: object. 추가 필드 금지.

| 필드        | 자료형        | 필수   | 기본값(OpenAPI) | 제약                        | 설명                                                                  |
| ----------- | ------------- | ------ | --------------- | --------------------------- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예     | 명시 없음       | —                           | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `months`    | integer       | 아니요 | `1`             | 최솟값 `1.0`; 최댓값 `12.0` | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |

<a id="schema-paperbundle"></a>

### PaperBundle

형식: object. 추가 필드 금지.

| 필드   | 자료형                                   | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                     |
| ------ | ---------------------------------------- | ---- | --------------- | ---- | -------------------------------------------------------- |
| `plan` | [PaperDetail](#schema-paperdetail)       | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계획. 연결된 스키마를 따른다.      |
| `run`  | [PaperRunDetail](#schema-paperrundetail) | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계산 결과. 연결된 스키마를 따른다. |

<a id="schema-papercancel"></a>

### PaperCancel

형식: object. 추가 필드 금지.

| 필드        | 자료형        | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | ------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |

<a id="schema-papercomparisoncreate"></a>

### PaperComparisonCreate

형식: object. 추가 필드 금지.

| 필드           | 자료형                     | 필수   | 기본값(OpenAPI) | 제약                                  | 설명                                     |
| -------------- | -------------------------- | ------ | --------------- | ------------------------------------- | ---------------------------------------- |
| `planIds`      | array&lt;string (uuid)&gt; | 예     | 명시 없음       | 최소 항목 수 `2`; 최대 항목 수 `3`    | 비교할 서로 다른 모의투자 사본 ID 2~3개. |
| `throughMonth` | anyOf(integer / null)      | 아니요 | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0` | 조회·비교 끝 월.                         |

<a id="schema-papercomparisondetail"></a>

### PaperComparisonDetail

형식: object. 추가 필드 금지.

| 필드              | 자료형                                                                      | 필수 | 기본값(OpenAPI) | 제약                                | 설명                                                             |
| ----------------- | --------------------------------------------------------------------------- | ---- | --------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `basis`           | string                                                                      | 예   | 명시 없음       | 고정값 `"saved-runs-common-period"` | 비교·미리보기 계산 기준.                                         |
| `throughMonth`    | integer                                                                     | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`        | 조회·비교 끝 월.                                                 |
| `referencePlanId` | string (uuid)                                                               | 예   | 명시 없음       | —                                   | 비교 기준인 첫 번째 사본 ID.                                     |
| `financialPlanId` | string (uuid)                                                               | 예   | 명시 없음       | —                                   | 출발 금융 Plan ID.                                               |
| `source`          | [MarketSource](#schema-marketsource)                                        | 예   | 명시 없음       | —                                   | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `paths`           | array&lt;[SavedComparisonPath](#schema-savedcomparisonpath)&gt;             | 예   | 명시 없음       | 최소 항목 수 `2`; 최대 항목 수 `3`  | —                                                                |
| `differences`     | array&lt;[SavedComparisonDifference](#schema-savedcomparisondifference)&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `2`  | 첫 번째 사본 대비 차이.                                          |

<a id="schema-paperconditionvalues"></a>

### PaperConditionValues

형식: object. 추가 필드 금지.

| 필드            | 자료형                | 필수   | 기본값(OpenAPI) | 제약                                          | 설명                                                         |
| --------------- | --------------------- | ------ | --------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `income`        | anyOf(integer / null) | 아니요 | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `10000000000.0` | 월 소득(원).                                                 |
| `expense`       | anyOf(integer / null) | 아니요 | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `10000000000.0` | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `monthlySaving` | anyOf(integer / null) | 아니요 | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `10000000000.0` | 월말 저축 이체액(원).                                        |

<a id="schema-paperconditionscreate"></a>

### PaperConditionsCreate

형식: object. 추가 필드 금지.

| 필드        | 자료형                                               | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | ---------------------------------------------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid)                                        | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `values`    | [PaperConditionValues](#schema-paperconditionvalues) | 예   | 명시 없음       | —    | 변경할 생활 조건 값 또는 조회한 유효 조건.                            |

<a id="schema-paperconditionsdetail"></a>

### PaperConditionsDetail

형식: object. 추가 필드 금지.

| 필드             | 자료형                                                       | 필수 | 기본값(OpenAPI) | 제약                                  | 설명                                       |
| ---------------- | ------------------------------------------------------------ | ---- | --------------- | ------------------------------------- | ------------------------------------------ |
| `paperPlanId`    | string (uuid)                                                | 예   | 명시 없음       | —                                     | 모의투자 PaperPlan ID.                     |
| `month`          | integer                                                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`          | 게임 시작 이후 진행 월 인덱스.             |
| `canEdit`        | boolean                                                      | 예   | 명시 없음       | —                                     | 다음 달 생활 조건 편집 가능 여부.          |
| `appliesFrom`    | anyOf(integer / null)                                        | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0` | 생활 조건 적용 시작 월.                    |
| `appliesThrough` | integer                                                      | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`          | 생활 조건 적용 마지막 월.                  |
| `values`         | [EffectivePaperConditions](#schema-effectivepaperconditions) | 예   | 명시 없음       | —                                     | 변경할 생활 조건 값 또는 조회한 유효 조건. |

<a id="schema-papercreate"></a>

### PaperCreate

형식: object. 추가 필드 금지.

| 필드            | 자료형        | 필수 | 기본값(OpenAPI) | 제약                          | 설명                                                                  |
| --------------- | ------------- | ---- | --------------- | ----------------------------- | --------------------------------------------------------------------- |
| `requestId`     | string (uuid) | 예   | 명시 없음       | —                             | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `planId`        | string (uuid) | 예   | 명시 없음       | —                             | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `priceSeriesId` | string        | 예   | 명시 없음       | 최소 길이 `1`; 최대 길이 `64` | 등록 가격 자료 식별자.                                                |

<a id="schema-paperdetail"></a>

### PaperDetail

형식: object. 추가 필드 금지.

| 필드                | 자료형                                          | 필수   | 기본값(OpenAPI) | 제약                                                                | 설명                                                             |
| ------------------- | ----------------------------------------------- | ------ | --------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `action`            | anyOf(string / null)                            | 아니요 | 명시 없음       | string: 허용값 `["create","order","advance","cancel","conditions"]` | 이 사본을 만든 명령 종류. 레거시 사본은 null일 수 있다.          |
| `id`                | string (uuid)                                   | 예     | 명시 없음       | —                                                                   | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.                |
| `parentPaperPlanId` | anyOf(string (uuid) / null)                     | 예     | 명시 없음       | —                                                                   | 부모 모의투자 사본 ID.                                           |
| `financialPlanId`   | string (uuid)                                   | 예     | 명시 없음       | —                                                                   | 출발 금융 Plan ID.                                               |
| `name`              | string                                          | 예     | 명시 없음       | —                                                                   | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.                   |
| `month`             | integer                                         | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                        | 게임 시작 이후 진행 월 인덱스.                                   |
| `source`            | [MarketSource](#schema-marketsource)            | 예     | 명시 없음       | —                                                                   | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `runId`             | string (uuid)                                   | 예     | 명시 없음       | —                                                                   | 모의투자 PaperRun ID.                                            |
| `createdAt`         | integer                                         | 예     | 명시 없음       | —                                                                   | 생성 Unix timestamp(마이크로초).                                 |
| `state`             | [GameState](#schema-gamestate)                  | 예     | 명시 없음       | —                                                                   | 저장된 금융 상태 또는 뉴스 라운드 상태. 연결된 스키마를 따른다.  |
| `orders`            | array&lt;[OrderRecord](#schema-orderrecord)&gt; | 예     | 명시 없음       | —                                                                   | —                                                                |

<a id="schema-paperenginecomparison"></a>

### PaperEngineComparison

형식: object. 추가 필드 금지.

| 필드         | 자료형                                                                   | 필수 | 기본값(OpenAPI) | 제약 | 설명 |
| ------------ | ------------------------------------------------------------------------ | ---- | --------------- | ---- | ---- |
| `baseline`   | [BaselineResult](#schema-baselineresult)                                 | 예   | 명시 없음       | —    | —    |
| `invested`   | [InvestmentEngineResult](#schema-investmentengineresult)                 | 예   | 명시 없음       | —    | —    |
| `comparison` | [app**paper_schemas**Comparison](#schema-app--paper-schemas--comparison) | 예   | 명시 없음       | —    | —    |

<a id="schema-paperexplaincreate"></a>

### PaperExplainCreate

형식: object. 추가 필드 금지.

| 필드    | 자료형  | 필수 | 기본값(OpenAPI) | 제약          | 설명                                 |
| ------- | ------- | ---- | --------------- | ------------- | ------------------------------------ |
| `useAI` | boolean | 예   | 명시 없음       | 고정값 `true` | AI 사실 선택·정렬 요청. true만 허용. |

<a id="schema-paperexplaindetail"></a>

### PaperExplainDetail

형식: object. 추가 필드 금지.

| 필드             | 자료형                                                        | 필수 | 기본값(OpenAPI) | 제약                               | 설명                                                             |
| ---------------- | ------------------------------------------------------------- | ---- | --------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `runId`          | string (uuid)                                                 | 예   | 명시 없음       | —                                  | 모의투자 PaperRun ID.                                            |
| `paperPlanId`    | string (uuid)                                                 | 예   | 명시 없음       | —                                  | 모의투자 PaperPlan ID.                                           |
| `throughMonth`   | integer                                                       | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`       | 조회·비교 끝 월.                                                 |
| `sections`       | array&lt;[ExplanationSection](#schema-explanationsection)&gt; | 예   | 명시 없음       | 최소 항목 수 `4`; 최대 항목 수 `7` | —                                                                |
| `source`         | string                                                        | 예   | 명시 없음       | 허용값 `["template","llm-ranked"]` | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `attempts`       | integer                                                       | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `2.0`         | 외부 모델 호출 시도 횟수.                                        |
| `fallbackReason` | anyOf(string / null)                                          | 예   | 명시 없음       | —                                  | 정형 설명으로 대체한 이유. 대체하지 않았으면 null.               |
| `cached`         | boolean                                                       | 예   | 명시 없음       | —                                  | 저장된 AI 설명 정렬을 재사용했는지 여부.                         |
| `promptVersion`  | string                                                        | 예   | 명시 없음       | —                                  | 설명·추출 프롬프트 버전.                                         |
| `verifiedFacts`  | boolean                                                       | 예   | 명시 없음       | 고정값 `true`                      | 서버가 검증한 사실 문장 사용 여부.                               |

<a id="schema-paperordercreate"></a>

### PaperOrderCreate

형식: object. 추가 필드 금지.

| 필드        | 자료형        | 필수 | 기본값(OpenAPI) | 제약                                | 설명                                                                  |
| ----------- | ------------- | ---- | --------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `requestId` | string (uuid) | 예   | 명시 없음       | —                                   | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `side`      | string        | 예   | 명시 없음       | 허용값 `["buy","sell"]`             | buy=매수, sell=매도.                                                  |
| `quantity`  | integer       | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `1000000000.0` | 주식 수량(주).                                                        |

<a id="schema-paperrundetail"></a>

### PaperRunDetail

형식: object. 추가 필드 금지.

| 필드            | 자료형                                                 | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                             |
| --------------- | ------------------------------------------------------ | ---- | --------------- | ---- | ---------------------------------------------------------------- |
| `id`            | string (uuid)                                          | 예   | 명시 없음       | —    | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.                |
| `paperPlanId`   | string (uuid)                                          | 예   | 명시 없음       | —    | 모의투자 PaperPlan ID.                                           |
| `engineVersion` | string                                                 | 예   | 명시 없음       | —    | 계산 엔진 버전.                                                  |
| `createdAt`     | integer                                                | 예   | 명시 없음       | —    | 생성 Unix timestamp(마이크로초).                                 |
| `source`        | [MarketSource](#schema-marketsource)                   | 예   | 명시 없음       | —    | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `result`        | [PaperEngineComparison](#schema-paperenginecomparison) | 예   | 명시 없음       | —    | —                                                                |

<a id="schema-papersummary"></a>

### PaperSummary

형식: object. 추가 필드 금지.

| 필드                | 자료형                               | 필수   | 기본값(OpenAPI) | 제약                                                                | 설명                                                             |
| ------------------- | ------------------------------------ | ------ | --------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `action`            | anyOf(string / null)                 | 아니요 | 명시 없음       | string: 허용값 `["create","order","advance","cancel","conditions"]` | 이 사본을 만든 명령 종류. 레거시 사본은 null일 수 있다.          |
| `id`                | string (uuid)                        | 예     | 명시 없음       | —                                                                   | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.                |
| `parentPaperPlanId` | anyOf(string (uuid) / null)          | 예     | 명시 없음       | —                                                                   | 부모 모의투자 사본 ID.                                           |
| `financialPlanId`   | string (uuid)                        | 예     | 명시 없음       | —                                                                   | 출발 금융 Plan ID.                                               |
| `name`              | string                               | 예     | 명시 없음       | —                                                                   | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.                   |
| `month`             | integer                              | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                        | 게임 시작 이후 진행 월 인덱스.                                   |
| `source`            | [MarketSource](#schema-marketsource) | 예     | 명시 없음       | —                                                                   | 가격 자료 출처 또는 설명 생성 방식. 연결된 스키마·enum을 따른다. |
| `runId`             | string (uuid)                        | 예     | 명시 없음       | —                                                                   | 모의투자 PaperRun ID.                                            |
| `createdAt`         | integer                              | 예     | 명시 없음       | —                                                                   | 생성 Unix timestamp(마이크로초).                                 |

<a id="schema-parsechange"></a>

### ParseChange

형식: object. 추가 필드 금지.

| 필드              | 자료형                      | 필수   | 기본값(OpenAPI) | 제약                            | 설명                                             |
| ----------------- | --------------------------- | ------ | --------------- | ------------------------------- | ------------------------------------------------ |
| `planId`          | string (uuid)               | 예     | 명시 없음       | —                               | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다. |
| `message`         | string                      | 예     | 명시 없음       | 최소 길이 `1`; 최대 길이 `2000` | —                                                |
| `clarificationId` | anyOf(string (uuid) / null) | 아니요 | 명시 없음       | —                               | 재질문 문맥 ID. 처음 요청할 때 생략한다.         |

<a id="schema-path"></a>

### Path

형식: object. 추가 필드 금지.

| 필드               | 자료형                              | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                   |
| ------------------ | ----------------------------------- | ---- | --------------- | --------------------------------------------------------- | -------------------------------------- |
| `recordId`         | string (uuid)                       | 예   | 명시 없음       | —                                                         | —                                      |
| `savedRounds`      | integer                             | 예   | 명시 없음       | —                                                         | 해당 기록에 저장된 라운드 수.          |
| `finalAssets`      | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 선택 경로의 최종 순자산(원).           |
| `cash`             | integer                             | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 가용 현금(원).                         |
| `stockValue`       | integer                             | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 주식 평가액(원).                       |
| `stockChange`      | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 가격 충격에 따른 주식 평가액 변화(원). |
| `incomeChange`     | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 기준 대비 소득 변화(원).               |
| `expenseChange`    | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 기준 대비 생활비 변화(원).             |
| `shortfall`        | integer                             | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 해당 구간 미충족 지출(원).             |
| `assetsDifference` | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | —                                      |
| `history`          | array&lt;[Round](#schema-round)&gt; | 예   | 명시 없음       | —                                                         | 선택한 행동의 라운드 결과.             |

<a id="schema-plancreate"></a>

### PlanCreate

형식: object. 추가 필드 금지.

| 필드            | 자료형                         | 필수   | 기본값(OpenAPI) | 제약                  | 설명                                                            |
| --------------- | ------------------------------ | ------ | --------------- | --------------------- | --------------------------------------------------------------- |
| `schemaVersion` | integer                        | 아니요 | `1`             | 고정값 `1`            | 입력 계약 버전.                                                 |
| `goalBasis`     | string                         | 아니요 | `"net_assets"`  | 고정값 `"net_assets"` | 목표 달성 판단 기준.                                            |
| `parentPlanId`  | anyOf(string (uuid) / null)    | 아니요 | 명시 없음       | —                     | 부모 금융 Plan ID.                                              |
| `state`         | [GameState](#schema-gamestate) | 예     | 명시 없음       | —                     | 저장된 금융 상태 또는 뉴스 라운드 상태. 연결된 스키마를 따른다. |

<a id="schema-plandetail"></a>

### PlanDetail

형식: object. 추가 필드 금지.

| 필드            | 자료형                         | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                            |
| --------------- | ------------------------------ | ---- | --------------- | ---- | --------------------------------------------------------------- |
| `id`            | string (uuid)                  | 예   | 명시 없음       | —    | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.               |
| `name`          | string                         | 예   | 명시 없음       | —    | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.                  |
| `parentPlanId`  | anyOf(string (uuid) / null)    | 예   | 명시 없음       | —    | 부모 금융 Plan ID.                                              |
| `schemaVersion` | integer                        | 예   | 명시 없음       | —    | 입력 계약 버전.                                                 |
| `goalBasis`     | string                         | 예   | 명시 없음       | —    | 목표 달성 판단 기준.                                            |
| `createdAt`     | integer                        | 예   | 명시 없음       | —    | 생성 Unix timestamp(초).                                        |
| `month`         | integer                        | 예   | 명시 없음       | —    | 게임 시작 이후 진행 월 인덱스.                                  |
| `state`         | [GameState](#schema-gamestate) | 예   | 명시 없음       | —    | 저장된 금융 상태 또는 뉴스 라운드 상태. 연결된 스키마를 따른다. |

<a id="schema-plansummary"></a>

### PlanSummary

형식: object. 추가 필드 금지.

| 필드            | 자료형                      | 필수 | 기본값(OpenAPI) | 제약 | 설명                                              |
| --------------- | --------------------------- | ---- | --------------- | ---- | ------------------------------------------------- |
| `id`            | string (uuid)               | 예   | 명시 없음       | —    | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다. |
| `name`          | string                      | 예   | 명시 없음       | —    | 이름. 계획·목표·초기 프로필 등 해당 객체 기준.    |
| `parentPlanId`  | anyOf(string (uuid) / null) | 예   | 명시 없음       | —    | 부모 금융 Plan ID.                                |
| `schemaVersion` | integer                     | 예   | 명시 없음       | —    | 입력 계약 버전.                                   |
| `goalBasis`     | string                      | 예   | 명시 없음       | —    | 목표 달성 판단 기준.                              |
| `createdAt`     | integer                     | 예   | 명시 없음       | —    | 생성 Unix timestamp(초).                          |
| `month`         | integer                     | 예   | 명시 없음       | —    | 게임 시작 이후 진행 월 인덱스.                    |

<a id="schema-position"></a>

### Position

형식: object. 추가 필드 금지.

| 필드            | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                |
| --------------- | --------------------- | ---- | --------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `quantity`      | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 주식 수량(주).                                      |
| `costBasis`     | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 보유 주식 취득 원가(원).                            |
| `averageCost`   | anyOf(string / null)  | 예   | 명시 없음       | —                                                         | 평균 취득 원가의 문자열 표현. 보유 수량 0이면 null. |
| `marketValue`   | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 보유 주식 평가액(원).                               |
| `realizedPnl`   | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 실현 손익(원).                                      |
| `unrealizedPnl` | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 미실현 평가 손익(원).                               |
| `feesPaid`      | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 누적 수수료(원).                                    |
| `taxesPaid`     | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 누적 세금(원).                                      |
| `price`         | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `9007199254740991.0`        | 주당 가격(원). null이면 확인 가능한 가격 없음.      |
| `priceMonth`    | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                     | 평가에 사용한 가격 월.                              |
| `stale`         | boolean               | 예   | 명시 없음       | —                                                         | 과거 마지막 유효 가격으로 평가했는지 여부.          |

<a id="schema-price"></a>

### Price

형식: object. 추가 필드 금지.

| 필드         | 자료형                      | 필수   | 기본값(OpenAPI) | 제약                                               | 설명                                           |
| ------------ | --------------------------- | ------ | --------------- | -------------------------------------------------- | ---------------------------------------------- |
| `month`      | integer                     | 예     | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                       | 게임 시작 이후 진행 월 인덱스.                 |
| `price`      | anyOf(integer / null)       | 예     | 명시 없음       | integer: 최솟값 `1.0`; 최댓값 `9007199254740991.0` | 주당 가격(원). null이면 확인 가능한 가격 없음. |
| `tradable`   | boolean                     | 예     | 명시 없음       | —                                                  | 해당 월 거래 가능 여부.                        |
| `observedOn` | anyOf(string (date) / null) | 아니요 | 명시 없음       | —                                                  | 실제 관측일(YYYY-MM-DD).                       |

<a id="schema-proposalresponse"></a>

### ProposalResponse

형식: object. 추가 필드 금지.

| 필드              | 자료형                                              | 필수   | 기본값(OpenAPI) | 제약                                                                    | 설명                                                        |
| ----------------- | --------------------------------------------------- | ------ | --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `status`          | string                                              | 예     | 명시 없음       | 허용값 `["ready","needs_clarification","unsupported","invalid_change"]` | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `proposalId`      | anyOf(string (uuid) / null)                         | 아니요 | 명시 없음       | —                                                                       | 승인할 변경안 ID.                                           |
| `clarificationId` | anyOf(string (uuid) / null)                         | 아니요 | 명시 없음       | —                                                                       | 재질문 문맥 ID. 처음 요청할 때 생략한다.                    |
| `basePlanId`      | string (uuid)                                       | 예     | 명시 없음       | —                                                                       | AI 요청의 원본 금융 Plan ID.                                |
| `message`         | string                                              | 예     | 명시 없음       | —                                                                       | —                                                           |
| `changes`         | array&lt;[ChangeIntent](#schema-changeintent)&gt;   | 아니요 | 명시 없음       | —                                                                       | 조건 변경 목록. 스키마에 따라 금융 효과 또는 AI 추출 조건.  |
| `question`        | anyOf(string / null)                                | 아니요 | 명시 없음       | —                                                                       | —                                                           |
| `preview`         | array&lt;string&gt;                                 | 아니요 | 명시 없음       | —                                                                       | —                                                           |
| `previewDetails`  | array&lt;[ChangePreview](#schema-changepreview)&gt; | 아니요 | 명시 없음       | 최대 항목 수 `10`                                                       | 구간별 변경 전후 금액.                                      |
| `expiresAt`       | anyOf(integer / null)                               | 아니요 | 명시 없음       | —                                                                       | 만료 Unix timestamp(초).                                    |
| `model`           | anyOf(string / null)                                | 아니요 | 명시 없음       | —                                                                       | —                                                           |
| `promptVersion`   | string                                              | 예     | 명시 없음       | —                                                                       | 설명·추출 프롬프트 버전.                                    |

<a id="schema-ratechange"></a>

### RateChange

형식: object. 추가 필드 금지.

| 필드 | 자료형  | 필수 | 기본값(OpenAPI) | 제약                         | 설명                      |
| ---- | ------- | ---- | --------------- | ---------------------------- | ------------------------- |
| `m`  | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `120.0` | 효과 적용 시작 월(1~120). |
| `v`  | number  | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `100.0` | 연 유효 금리(%).          |

<a id="schema-rejectedexecution"></a>

### RejectedExecution

형식: object. 추가 필드 금지.

| 필드             | 자료형                             | 필수 | 기본값(OpenAPI) | 제약                                                                                                                              | 설명                                                        |
| ---------------- | ---------------------------------- | ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `order`          | [OrderIntent](#schema-orderintent) | 예   | 명시 없음       | —                                                                                                                                 | —                                                           |
| `status`         | string                             | 예   | 명시 없음       | 고정값 `"rejected"`                                                                                                               | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `reason`         | string                             | 예   | 명시 없음       | 허용값 `["SYMBOL_MISMATCH","PRICE_UNAVAILABLE","NOT_TRADABLE","INSUFFICIENT_CASH","INSUFFICIENT_SHARES","COST_EXCEEDS_PROCEEDS"]` | 거절 사유 코드.                                             |
| `submittedMonth` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                                                                                      | 주문 제출 월.                                               |
| `executionMonth` | integer                            | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                                                                                                      | 주문 실행 월(제출 다음 달).                                 |

<a id="schema-rejectedtrade"></a>

### RejectedTrade

형식: object. 추가 필드 금지.

| 필드     | 자료형                             | 필수 | 기본값(OpenAPI) | 제약                                                                                                                              | 설명                                                        |
| -------- | ---------------------------------- | ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `order`  | [OrderIntent](#schema-orderintent) | 예   | 명시 없음       | —                                                                                                                                 | —                                                           |
| `status` | string                             | 예   | 명시 없음       | 고정값 `"rejected"`                                                                                                               | 업무 처리 상태 또는 서버 상태. enum·고정값을 함께 확인한다. |
| `reason` | string                             | 예   | 명시 없음       | 허용값 `["SYMBOL_MISMATCH","PRICE_UNAVAILABLE","NOT_TRADABLE","INSUFFICIENT_CASH","INSUFFICIENT_SHARES","COST_EXCEEDS_PROCEEDS"]` | 거절 사유 코드.                                             |

<a id="schema-result"></a>

### Result

형식: object. 추가 필드 금지.

| 필드          | 자료형                              | 필수 | 기본값(OpenAPI) | 제약                                                                           | 설명                                                       |
| ------------- | ----------------------------------- | ---- | --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `version`     | string                              | 예   | 명시 없음       | 고정값 `"news-game-v1"`                                                        | —                                                          |
| `seed`        | [State](#schema-state)              | 예   | 명시 없음       | —                                                                              | 서버가 저장된 투자 결과에서 추출한 뉴스 게임 출발 상태.    |
| `choices`     | array&lt;string&gt;                 | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `4`; 배열 항목: 허용값 `["hold","half","sell"]` | 각 라운드 선택. hold=보유, half=절반 매도, sell=전량 매도. |
| `history`     | array&lt;[Round](#schema-round)&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `4`                                             | 선택한 행동의 라운드 결과.                                 |
| `heldHistory` | array&lt;[Round](#schema-round)&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `4`                                             | 계속 보유했을 때의 비교 라운드 결과.                       |
| `finalAssets` | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0`                      | 선택 경로의 최종 순자산(원).                               |
| `heldAssets`  | integer                             | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0`                      | 계속 보유 경로의 순자산(원).                               |

<a id="schema-round"></a>

### Round

형식: object. 추가 필드 금지.

| 필드            | 자료형                 | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                            |
| --------------- | ---------------------- | ---- | --------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| `state`         | [State](#schema-state) | 예   | 명시 없음       | —                                                         | 저장된 금융 상태 또는 뉴스 라운드 상태. 연결된 스키마를 따른다. |
| `eventId`       | string                 | 예   | 명시 없음       | 허용값 `["rates","energy","recovery","employment"]`       | —                                                               |
| `action`        | string                 | 예   | 명시 없음       | 허용값 `["hold","half","sell"]`                           | —                                                               |
| `sold`          | integer                | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | —                                                               |
| `proceeds`      | integer                | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | —                                                               |
| `income`        | integer                | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 월 소득(원).                                                    |
| `expense`       | integer                | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다.    |
| `shortfall`     | integer                | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 해당 구간 미충족 지출(원).                                      |
| `stockChange`   | integer                | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 가격 충격에 따른 주식 평가액 변화(원).                          |
| `incomeChange`  | integer                | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 기준 대비 소득 변화(원).                                        |
| `expenseChange` | integer                | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 기준 대비 생활비 변화(원).                                      |
| `total`         | integer                | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 현금 + 저축 + 투자 평가액(해당 시) − 누적 미충족 지출(원).      |
| `difference`    | integer                | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | —                                                               |

<a id="schema-rundetail"></a>

### RunDetail

형식: object. 추가 필드 금지.

| 필드             | 자료형                                              | 필수 | 기본값(OpenAPI) | 제약       | 설명                                                                  |
| ---------------- | --------------------------------------------------- | ---- | --------------- | ---------- | --------------------------------------------------------------------- |
| `id`             | string (uuid)                                       | 예   | 명시 없음       | —          | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.                     |
| `planId`         | string (uuid)                                       | 예   | 명시 없음       | —          | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `requestId`      | string (uuid)                                       | 예   | 명시 없음       | —          | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `planVersion`    | integer                                             | 예   | 명시 없음       | 고정값 `1` | 계산에 사용한 금융 계획 버전.                                         |
| `engineVersion`  | string                                              | 예   | 명시 없음       | —          | 계산 엔진 버전.                                                       |
| `months`         | integer                                             | 예   | 명시 없음       | —          | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |
| `createdAt`      | integer                                             | 예   | 명시 없음       | —          | 생성 Unix timestamp(초).                                              |
| `summary`        | [RunMetrics](#schema-runmetrics)                    | 예   | 명시 없음       | —          | 계산 구간 요약.                                                       |
| `inputSnapshot`  | object                                              | 예   | 명시 없음       | —          | 계산에 사용한 입력 사본. AI 적용 Run에는 비교·설명 근거가 추가된다.   |
| `monthlyResults` | array&lt;[MonthlyResult](#schema-monthlyresult)&gt; | 예   | 명시 없음       | —          | 월 0을 포함한 월별 결과 배열.                                         |

<a id="schema-runmetrics"></a>

### RunMetrics

형식: object. 추가 필드 금지.

| 필드                 | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                           |
| -------------------- | --------------------- | ---- | --------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `goalMonth`          | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                     | 관측 구간 내 최초 목표 달성 월. 미달성은 null. |
| `finalNetAssets`     | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 마지막 시점 순자산(원).                        |
| `finalCash`          | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 시점 현금(원).                          |
| `finalSaved`         | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 시점 저축(원).                          |
| `firstShortageMonth` | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `0.0`; 최댓값 `120.0`                     | 최초 지출 부족 월. 없으면 null.                |
| `shortageMonths`     | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`                              | 지출 부족이 발생한 월 수.                      |
| `unmetTotal`         | integer               | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0`                 | 마지막 월의 누적 미충족 지출(원).              |

<a id="schema-runsummary"></a>

### RunSummary

형식: object. 추가 필드 금지.

| 필드            | 자료형                           | 필수 | 기본값(OpenAPI) | 제약       | 설명                                                                  |
| --------------- | -------------------------------- | ---- | --------------- | ---------- | --------------------------------------------------------------------- |
| `id`            | string (uuid)                    | 예   | 명시 없음       | —          | 자원 또는 항목 식별자. 모델별 형식·enum을 따른다.                     |
| `planId`        | string (uuid)                    | 예   | 명시 없음       | —          | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `requestId`     | string (uuid)                    | 예   | 명시 없음       | —          | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `planVersion`   | integer                          | 예   | 명시 없음       | 고정값 `1` | 계산에 사용한 금융 계획 버전.                                         |
| `engineVersion` | string                           | 예   | 명시 없음       | —          | 계산 엔진 버전.                                                       |
| `months`        | integer                          | 예   | 명시 없음       | —          | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |
| `createdAt`     | integer                          | 예   | 명시 없음       | —          | 생성 Unix timestamp(초).                                              |
| `summary`       | [RunMetrics](#schema-runmetrics) | 예   | 명시 없음       | —          | 계산 구간 요약.                                                       |

<a id="schema-savecommand"></a>

### SaveCommand

형식: object. 추가 필드 금지.

| 필드        | 자료형                           | 필수 | 기본값(OpenAPI) | 제약 | 설명                                                                  |
| ----------- | -------------------------------- | ---- | --------------- | ---- | --------------------------------------------------------------------- |
| `requestId` | string (uuid)                    | 예   | 명시 없음       | —    | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `plan`      | [PlanCreate](#schema-plancreate) | 예   | 명시 없음       | —    | 저장된 금융 또는 투자 계획. 연결된 스키마를 따른다.                   |

<a id="schema-savedcomparisondifference"></a>

### SavedComparisonDifference

형식: object. 추가 필드 금지.

| 필드                       | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                          |
| -------------------------- | --------------------- | ---- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `planId`                   | string (uuid)         | 예   | 명시 없음       | —                                                         | 비교 대상 모의투자 PaperPlan ID.                              |
| `finalAssetsDifference`    | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 비교 대상의 마지막 순자산 − 기준 순자산(원).                  |
| `goalMonthDifference`      | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `-120.0`; 최댓값 `120.0`                  | 대상 최초 목표 월 − 기준 최초 목표 월. 양쪽 달성 시에만 계산. |
| `shortageMonthsDifference` | integer               | 예   | 명시 없음       | 최솟값 `-120.0`; 최댓값 `120.0`                           | 대상 부족 월 수 − 기준 부족 월 수.                            |
| `unmetDifference`          | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 대상 누적 미충족액 − 기준 누적 미충족액(원).                  |

<a id="schema-savedcomparisonpath"></a>

### SavedComparisonPath

형식: object. 추가 필드 금지.

| 필드             | 자료형                                                  | 필수 | 기본값(OpenAPI) | 제약                                 | 설명                                           |
| ---------------- | ------------------------------------------------------- | ---- | --------------- | ------------------------------------ | ---------------------------------------------- |
| `planId`         | string (uuid)                                           | 예   | 명시 없음       | —                                    | 비교 대상 모의투자 PaperPlan ID.               |
| `runId`          | string (uuid)                                           | 예   | 명시 없음       | —                                    | 모의투자 PaperRun ID.                          |
| `name`           | string                                                  | 예   | 명시 없음       | —                                    | 이름. 계획·목표·초기 프로필 등 해당 객체 기준. |
| `savedMonth`     | integer                                                 | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `120.0`         | 비교 대상 사본이 저장된 진행 월.               |
| `summary`        | [InvestmentMetrics](#schema-investmentmetrics)          | 예   | 명시 없음       | —                                    | 계산 구간 요약.                                |
| `monthlyResults` | array&lt;[InvestmentMonth](#schema-investmentmonth)&gt; | 예   | 명시 없음       | 최소 항목 수 `1`; 최대 항목 수 `121` | 월 0을 포함한 월별 결과 배열.                  |

<a id="schema-selection"></a>

### Selection

형식: object. 추가 필드 금지.

| 필드           | 자료형                     | 필수   | 기본값(OpenAPI) | 제약                                | 설명                                 |
| -------------- | -------------------------- | ------ | --------------- | ----------------------------------- | ------------------------------------ |
| `recordIds`    | array&lt;string (uuid)&gt; | 예     | 명시 없음       | 최소 항목 수 `2`; 최대 항목 수 `3`  | 비교할 서로 다른 뉴스 기록 ID 2~3개. |
| `throughRound` | anyOf(integer / null)      | 아니요 | 명시 없음       | integer: 최솟값 `1.0`; 최댓값 `4.0` | 뉴스 비교 끝 라운드(1~4).            |

<a id="schema-simulationcreate"></a>

### SimulationCreate

형식: object. 추가 필드 금지.

| 필드        | 자료형        | 필수   | 기본값(OpenAPI) | 제약                         | 설명                                                                  |
| ----------- | ------------- | ------ | --------------- | ---------------------------- | --------------------------------------------------------------------- |
| `planId`    | string (uuid) | 예     | 명시 없음       | —                            | 금융 Plan ID. 모의투자 API의 plan_id와 구분한다.                      |
| `requestId` | string (uuid) | 예     | 명시 없음       | —                            | 같은 작업의 재시도에 재사용하는 UUID. 다른 작업에는 새 ID를 사용한다. |
| `months`    | integer       | 아니요 | `120`           | 최솟값 `1.0`; 최댓값 `120.0` | 계산 기간·진행 개월 수 또는 목표 기한. 해당 스키마 제약을 따른다.     |

<a id="schema-state"></a>

### State

형식: object. 추가 필드 금지.

| 필드       | 자료형  | 필수 | 기본값(OpenAPI) | 제약                                      | 설명                                                         |
| ---------- | ------- | ---- | --------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `cash`     | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 가용 현금(원).                                               |
| `saved`    | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 저축 잔액(원).                                               |
| `quantity` | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 주식 수량(주).                                               |
| `price`    | integer | 예   | 명시 없음       | 최솟값 `1.0`; 최댓값 `9007199254740991.0` | 주당 가격(원). null이면 확인 가능한 가격 없음.               |
| `income`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 월 소득(원).                                                 |
| `expense`  | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 생활비·지출(원). 월별 결과에는 일회성 지출이 포함될 수 있다. |
| `unpaid`   | integer | 예   | 명시 없음       | 최솟값 `0.0`; 최댓값 `9007199254740991.0` | 누적 미충족 지출(원).                                        |

<a id="schema-validationerror"></a>

### ValidationError

형식: object. 추가 필드 금지는 OpenAPI에 선언되어 있지 않다.

| 필드    | 자료형                               | 필수   | 기본값(OpenAPI) | 제약 | 설명 |
| ------- | ------------------------------------ | ------ | --------------- | ---- | ---- |
| `loc`   | array&lt;anyOf(string / integer)&gt; | 예     | 명시 없음       | —    | —    |
| `msg`   | string                               | 예     | 명시 없음       | —    | —    |
| `type`  | string                               | 예     | 명시 없음       | —    | —    |
| `input` | any                                  | 아니요 | 명시 없음       | —    | —    |
| `ctx`   | object                               | 아니요 | 명시 없음       | —    | —    |

<a id="schema-app--ai-schemas--comparison"></a>

### app**ai_schemas**Comparison

형식: object. 추가 필드 금지.

| 필드                       | 자료형                | 필수 | 기본값(OpenAPI) | 제약 | 설명                                         |
| -------------------------- | --------------------- | ---- | --------------- | ---- | -------------------------------------------- |
| `baseGoalMonth`            | anyOf(integer / null) | 예   | 명시 없음       | —    | —                                            |
| `candidateGoalMonth`       | anyOf(integer / null) | 예   | 명시 없음       | —    | —                                            |
| `finalAssetsDifference`    | integer               | 예   | 명시 없음       | —    | 비교 대상의 마지막 순자산 − 기준 순자산(원). |
| `shortageMonthsDifference` | integer               | 예   | 명시 없음       | —    | 대상 부족 월 수 − 기준 부족 월 수.           |

<a id="schema-app--news-comparison--comparison"></a>

### app**news_comparison**Comparison

형식: object. 추가 필드 금지.

| 필드            | 자료형                            | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                         |
| --------------- | --------------------------------- | ---- | --------------- | --------------------------------------------------------- | ---------------------------- |
| `basis`         | string                            | 예   | 명시 없음       | —                                                         | 비교·미리보기 계산 기준.     |
| `paperPlanId`   | string (uuid)                     | 예   | 명시 없음       | —                                                         | 모의투자 PaperPlan ID.       |
| `paperRunId`    | string (uuid)                     | 예   | 명시 없음       | —                                                         | 출발 모의투자 Run ID.        |
| `version`       | string                            | 예   | 명시 없음       | —                                                         | —                            |
| `throughRound`  | integer                           | 예   | 명시 없음       | —                                                         | 뉴스 비교 끝 라운드(1~4).    |
| `initialAssets` | integer                           | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | —                            |
| `heldAssets`    | integer                           | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 계속 보유 경로의 순자산(원). |
| `paths`         | array&lt;[Path](#schema-path)&gt; | 예   | 명시 없음       | —                                                         | —                            |

<a id="schema-app--paper-schemas--comparison"></a>

### app**paper_schemas**Comparison

형식: object. 추가 필드 금지.

| 필드                       | 자료형                | 필수 | 기본값(OpenAPI) | 제약                                                      | 설명                                                          |
| -------------------------- | --------------------- | ---- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `finalAssetsDifference`    | integer               | 예   | 명시 없음       | 최솟값 `-9007199254740991.0`; 최댓값 `9007199254740991.0` | 비교 대상의 마지막 순자산 − 기준 순자산(원).                  |
| `goalMonthDifference`      | anyOf(integer / null) | 예   | 명시 없음       | integer: 최솟값 `-120.0`; 최댓값 `120.0`                  | 대상 최초 목표 월 − 기준 최초 목표 월. 양쪽 달성 시에만 계산. |
| `shortageMonthsDifference` | integer               | 예   | 명시 없음       | 최솟값 `-120.0`; 최댓값 `120.0`                           | 대상 부족 월 수 − 기준 부족 월 수.                            |

<a id="errors"></a>

## 5. 오류 처리

### 5.1 응답 형태

일반 HTTPException·DB 오류의 대표 형태:

```json
{ "detail": "REQUEST_ID_CONFLICT" }
```

FastAPI 입력 검증 오류는 별도 HTTPValidationError 구조다. 예:

```json
{
  "detail": [
    {
      "loc": ["body", "months"],
      "msg": "Input should be greater than or equal to 1",
      "type": "greater_than_equal",
      "input": 0,
      "ctx": {
        "ge": 1
      }
    }
  ]
}
```

422는 위 검증 배열 외에 `{"detail":"CONDITIONS_INVALID"}`처럼 코드 문자열로도 반환될 수 있다. `/health/db`의 503은 `{status,database}`이며 일반 오류 본문과 구분한다.

### 5.2 공통·의존성 오류 (코드 보충)

| HTTP 상태 | 대표 코드                                                                                               | 적용 상황                                       |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 401       | `SESSION_EXPIRED`                                                                                       | 만료·유효하지 않은 게스트 쿠키                  |
| 403       | `ORIGIN_NOT_ALLOWED`                                                                                    | Origin 검사 대상 요청의 허용되지 않은 Origin    |
| 404       | `PLAN_NOT_FOUND`, `RUN_NOT_FOUND`, `PAPER_PLAN_NOT_FOUND`, `PAPER_RUN_NOT_FOUND`, `NEWS_GAME_NOT_FOUND` | 자원 없음 또는 다른 소유자                      |
| 409       | `REQUEST_ID_CONFLICT`                                                                                   | 같은 소유자의 동일 요청 ID를 다른 명령에 재사용 |
| 410       | `PROPOSAL_EXPIRED`, `CLARIFICATION_EXPIRED`                                                             | AI 변경안·재질문 문맥 만료                      |
| 422       | `HTTPValidationError`, `CONDITIONS_INVALID` 등                                                          | 입력 형식·추가 도메인 검증 실패                 |
| 429       | `REQUEST_RATE_LIMITED`                                                                                  | 서버 요청 제한 초과. Retry-After 확인           |
| 502       | `MODEL_OUTPUT_INVALID`                                                                                  | 외부 모델 추출 결과를 검증할 수 없음            |
| 503       | `DATABASE_UNAVAILABLE`, `ENGINE_UNAVAILABLE`, `ENGINE_TIMEOUT`, `ENGINE_ERROR`, `ENGINE_OUTPUT_INVALID` | DB·계산 엔진 장애                               |
| 503       | `LLM_NOT_CONFIGURED`, `LLM_PROVIDER_UNSUPPORTED`, `LLM_TIMEOUT`, `LLM_UNAVAILABLE` 등                   | 자연어 추출의 외부 모델 설정·호출 오류          |
| 503       | `PAPER_RUN_UNAVAILABLE`, `NEWS_SOURCE_INVALID`, `COMPARISON_INPUT_INVALID` 등                           | 저장 데이터·연결 결과 무결성 오류               |
| 500       | `INTERNAL_ERROR`                                                                                        | 처리되지 않은 서버 예외                         |

위 코드는 대표 목록이다. 특정 경로에서 실제로 적용되는 코드는 해당 라우트·공통 서비스에 따라 다르며, 모든 API가 모든 코드를 반환하는 것은 아니다. 설명 API는 모델 장애를 fallbackReason과 정형 설명으로 처리할 수 있다.

### 5.3 업무 상태와 HTTP 상태 구분

- `/ai/parse-change`는 200 응답 안에서 ready / needs_clarification / unsupported / invalid_change를 반환한다. ready일 때만 proposalId를 승인 API에 전달한다.
- 모의 주문 결과의 filled / rejected는 체결 업무 상태다. 거절 사유는 RejectedExecution / RejectedTrade의 reason enum을 따른다.
- 일반 설명은 source=template/llm, 모의투자 설명은 스키마에 선언된 source를 확인한다. 외부 모델 설정이 없다는 사실만으로 설명 HTTP 응답 전체가 실패한다고 가정하지 않는다.

<a id="examples"></a>

## 6. 호출 예시

모든 요청 JSON 예시의 UUID는 형식 예시다. planId·runId·proposalId·사본 ID는 앞선 실제 응답의 ID로 바꾼다. requestId는 새 작업마다 새 UUID를 만들고, 같은 작업을 재시도할 때는 원래 값을 재사용한다. PaperCreate의 priceSeriesId는 `/market/series` 목록의 실제 ID로 바꾼다.

### 6.1 PowerShell: 저장 → 계산 → 재조회

다음은 로컬 서버에서 직접 실행할 수 있는 예다. 게스트 쿠키를 같은 WebRequestSession으로 유지한다. 새 작업을 실행하면 로컬 DB에 계획과 결과가 저장된다.

```powershell
$apiBase = "http://localhost:3000"
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$planInput = @'
{
  "schemaVersion": 1,
  "goalBasis": "net_assets",
  "parentPlanId": null,
  "state": {
    "startMonth": "2026-10",
    "months": 120,
    "initial": {
      "name": "나의 첫 번째 인생",
      "age": 25,
      "avatar": "🌱",
      "cash": 3000000,
      "saved": 7000000,
      "income": 2500000,
      "expense": 1600000,
      "target": 50000000
    },
    "goal": {
      "name": "나만의 공간 마련하기",
      "months": 60
    },
    "monthlySaving": 700000,
    "annualRate": 3,
    "month": 0,
    "changes": [],
    "rateChanges": [],
    "logs": [],
    "events": []
  }
}
'@ | ConvertFrom-Json

$saveBody = @{ requestId = [guid]::NewGuid().ToString(); plan = $planInput } | ConvertTo-Json -Depth 20
$plan = Invoke-RestMethod -Method Post -Uri "$apiBase/plan-saves" -WebSession $webSession -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($saveBody))

$runBody = @{ requestId = [guid]::NewGuid().ToString(); planId = $plan.id; months = 120 } | ConvertTo-Json
$run = Invoke-RestMethod -Method Post -Uri "$apiBase/simulations" -WebSession $webSession -ContentType "application/json; charset=utf-8" -Body $runBody
$run.summary
Invoke-RestMethod -Method Get -Uri "$apiBase/simulations/$($run.id)" -WebSession $webSession
```

### 6.2 연결 순서

1. 기본 여정: plan-saves → simulations → 저장 결과 조회. 각 저장/계산 요청의 본문과 ID를 보관한다.
2. 생애 이벤트: 현재 상태를 base로 전달해 event-branches → 반환된 plan/run으로 화면 전환. 원래 Plan ID는 유지한다.
3. AI 변경: parse-change → 필요 시 같은 clarificationId로 보충 답변 → ready 변경안을 사용자에게 확인 → confirmed=true로 apply → 반환 Run으로 explain.
4. 모의투자: market/series → paper-plans 생성 → order-preview → 사용자 확인 후 orders → 반환된 새 사본으로 advance → 결과·기본 설명 조회.
5. 투자 비교: 같은 출발점의 사본을 각각 원하는 월까지 진행 → paper-comparisons. 조회 시 사본을 자동 진행하지 않는다.
6. 뉴스 게임: 출발 투자 사본의 news-games에 choices 저장 → 뉴스 기록 조회 → 동일 출발 기록끼리 news-game-comparisons.

<a id="maintenance"></a>

## 7. 갱신 및 관련 문서

- API 경로·모델을 변경하면 실행 중인 서버를 재시작하고 `/openapi.json`과 이 문서를 대조한다. 요청 필드·required·nullable·default·enum·제약·응답 코드를 함께 갱신한다.
- 현재 Swagger의 일반 런타임 오류 응답, 쿠키 인증, 세션 갱신 200의 필드, 사용자 정의 validator 일부는 스키마에 완전히 선언되어 있지 않다. 이 문서의 코드 보충 부분도 해당 구현과 함께 갱신한다.
- `/`의 Swagger 리다이렉트와 `/docs`·`/redoc`·`/openapi.json` 자체는 업무 API 33개에 포함하지 않았다.
- 초기 제안 경로 `/comparisons`, `/plans/{id}/branches`, `/ai/compare-plans`는 현재 Swagger에 등록되어 있지 않아 엔드포인트 목록에 포함하지 않았다.
- [서버 실행 안내](README.md) · [현재 구현 상태](../docs/project-status.md) · [서버 운영](../docs/backend-operations.md) · [배포](../docs/deployment.md) · [공통 계약](../Shared/README.md)
