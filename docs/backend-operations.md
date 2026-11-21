# 이벤트 저장과 서버 운영

## 이벤트 확정

`POST /event-branches`는 requestId, base(현재 PlanCreate 입력), eventMonth, accepted를 받는다. 서버에서 고정 이벤트 비용을 적용하고 공용 엔진으로 계산한 뒤 선택 전 Plan, 선택 후 Plan, Run, 중복 요청 기록을 하나의 트랜잭션으로 저장한다. 응답은 basePlan/plan/run이다. 선택 전 스냅샷의 parentPlanId도 소유권을 검증한다. 동일 소유자·requestId·명령은 저장 결과를 재사용하고, 내용이 다르면 409를 반환한다.

이벤트 확정에는 서버 연결이 필요하다. 실패하면 로컬 조건은 변경하지 않는다. 응답이 유실될 경우 같은 화면에서 재선택하면 같은 요청 ID로 재시도한다. 미확인 요청 ID와 원래 입력을 브라우저에 보관한다. 새로고침 후 ‘이전 선택 결과 확인’으로 같은 ID를 재시도한다. 다른 조건으로 새 선택을 시도하면 먼저 이전 결과를 확인하거나 요청을 별도 보관해야 한다. 별도 보관은 서버 작업 취소가 아니다. 계산 중 사용자가 조건을 수정하면 서버 결과는 보존하되 현재 화면과 활성 계획 ID를 덮어쓰지 않는다. 일반 수동 저장은 기존대로 명시적인 새 사본 저장이다.

## 게스트 세션

만료·잘못된 세션은 401로 거부한다. 화면의 ‘새 세션으로 계속하기’에서 `POST /plans/session/recover`를 호출한다. 정상 세션이면 유지하고, 만료된 경우 새 소유자로 시작한다. 로컬 여정은 보존하고 이전 서버 Plan ID 연결은 지운다. 이전 서버 자료는 새 세션에서 읽을 수 없다. 재질문·모의투자 등 이전 서버 ID는 소유권 검사를 우회하지 않는다. 세션 교체 시 모의투자 참조를 초기화하고 미확인 요청을 별도 보관해 새 연습을 시작할 수 있게 한다. 원본 사본 404도 불확실한 요청의 별도 보관 경로로 처리한다. 이 기능은 계정 복구 기능이 아니다.

## 스키마 변경

서버 시작 시 Alembic head까지 순서대로 적용한다. 0001은 변경 전 스키마의 고정 정의이며, 기존 DB는 정의가 일치할 때만 채택한다. 0002는 이벤트 기록, 0003은 요청 제한 테이블이다. 알려지지 않은 기존 스키마는 임의로 수정하지 않고 시작을 중단한다. 기존 revision은 수정하지 않고 새 revision을 추가한다.

실행 전 Python 의존성을 갱신한다.

```bash
python -m pip install -r Server/requirements-dev.txt
python Server/scripts/maintain_database.py migrate
```

DATABASE_URL은 환경변수를 우선 사용한다. 없으면 로컬 `.data/dev.db`를 사용한다. 운영 배포의 migration은 서버를 한 번만 실행하는 절차로 수행하고 동시 시작을 피한다. 기존 DB 변경 전에는 반드시 백업한다.

## 임시 데이터 정리

```bash
python Server/scripts/maintain_database.py cleanup
python Server/scripts/maintain_database.py cleanup --apply
```

기본은 삭제 예정 개수만 표시한다. apply 시 만료 게스트 세션, 재질문, 미적용 AI 제안, 지난 요청 제한 창만 삭제한다. 저장한 계획·실행 결과와 적용된 제안은 삭제하지 않는다. 계획 보관 기간이나 탈퇴 기능은 별도 정책이 필요하다. 매일 정리 작업을 실행하는 운영 일정은 배포 환경에서 등록한다.

## SQLite 백업과 복구

```bash
python Server/scripts/sqlite_backup.py backup .data/dev.db .data/backups/before-migration.db
python Server/scripts/sqlite_backup.py restore .data/backups/before-migration.db .data/restored.db
```

SQLite backup API로 일관된 사본을 만들고 무결성을 확인한다. 기존 파일에는 덮어쓰지 않는다. 복구 시 API를 중지한 뒤 새 파일로 복원하고 DATABASE_URL을 새 파일로 바꿔 재시작한다. 백업에는 재무 정보와 세션 데이터가 있으므로 Git에 넣지 않고 접근을 제한한다. 파일 권한은 0600이다.

## PostgreSQL 백업과 복구

Compose 기준으로 API를 중지하고 같은 PostgreSQL 버전의 도구로 백업한다. 아래 파일명은 매번 새 이름을 사용한다.

```bash
docker compose -f Server/compose.yaml stop api
docker compose -f Server/compose.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > .data/backups/before-migration.dump
```

복구는 원본을 덮어쓰지 않고 새 DB에 수행한다.

```bash
docker compose -f Server/compose.yaml exec -T db sh -c 'createdb -U "$POSTGRES_USER" moneylife_restored'
docker compose -f Server/compose.yaml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d moneylife_restored --exit-on-error' < .data/backups/before-migration.dump
```

복구 성공 후 DATABASE_URL을 새 DB로 지정해 API를 재시작한다. 덤프 파일 접근 권한을 제한하고 명령의 종료 코드를 확인한다. PostgreSQL 실제 복구 및 동시 접근은 해당 배포 환경에서 검증해야 한다.

## 요청 제한과 로그

AI 경로는 DB에 저장하는 60초 고정 창 제한을 적용한다. 기본 소유자당 12회, 접속 IP당 60회다. AI_REQUESTS_PER_MINUTE와 AI_IP_REQUESTS_PER_MINUTE로 조절한다. 세션 복구는 접속 IP당 분당 30회다. 여러 API 프로세스도 같은 DB의 카운터를 사용한다. 쿠키를 초기화해도 IP 제한은 유지된다. 역방향 프록시 환경에서는 신뢰하는 프록시만 forwarded IP를 제공하도록 배포 설정해야 한다.

모든 응답에 X-Request-ID가 포함된다. 로그에는 요청 ID·HTTP 메서드·라우트 템플릿·상태·처리 시간만 남긴다. 쿼리, 본문, 쿠키, 인증 키는 기록하지 않는다. 내부 예외도 원문을 사용자에게 반환하지 않는다. 실행 환경에서 moneylife.requests 로그 수집을 설정한다.
