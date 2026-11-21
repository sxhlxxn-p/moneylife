# 배포 및 복원 절차

공개 서비스의 공급자·도메인은 아직 정하지 않았다. 아래 구성은 PostgreSQL과 HTTPS 프록시를 포함하는 배포용 구성이다. 개발 환경은 `Server/compose.yaml`, 배포 환경은 `Server/compose.production.yaml`을 사용한다.

## 이미지와 기동 순서

- 개발 이미지: 테스트 의존성과 코드 자동 재시작 포함. 로컬 HTTP에서 보안 쿠키를 강제하지 않는다.
- 배포 이미지: 일반 실행 의존성만 설치하고 비특권 사용자로 실행한다. 자동 재시작과 자동 마이그레이션을 사용하지 않는다.
- Client는 `Client/assets.json`의 공개 파일만 복사해 Nginx로 제공한다. API와 DB 포트는 외부에 공개하지 않는다.
- DB 정상 기동 → 별도 migrate 작업 완료 → API의 스키마 버전 확인 → HTTPS 프록시 순서로 시작한다. 스키마가 최신이 아니면 API는 시작하지 않는다.

## 실행

1. `Server/.env.production.example`을 참고해 별도 환경 파일에 실제 DB 비밀번호·연결 주소·HTTPS Origin을 지정한다. 저장소에 실제 값을 커밋하지 않는다.
2. `.data/tls/server.crt`, `.data/tls/server.key`에 도메인 인증서와 키를 배치한다. 키 파일의 읽기 권한을 제한한다.
3. 아래 명령을 실행한다. `--env-file`은 프로젝트 루트 기준이다.

```bash
docker compose --env-file Server/.env.production -f Server/compose.production.yaml build
docker compose --env-file Server/.env.production -f Server/compose.production.yaml up -d
```

기본 HTTPS 포트는 8443이다. 실제 도메인에서는 `HTTPS_PORT=443`과 일치하는 `CLIENT_ORIGIN`을 지정한다. 예제 인증서가 아닌 유효한 인증서를 사용한다. 이 구성의 LLM 연결 값은 비어 있으며 실제 외부 API 호출은 활성화하지 않는다.

프록시는 전달 헤더를 덮어쓴다. API의 프록시 신뢰 설정은 API 포트가 외부에 공개되지 않는 이 구성에서만 사용한다. 서버를 독립 공개하면 신뢰 프록시 주소를 제한해야 한다.

## 백업·복원

```bash
docker compose --env-file Server/.env.production -f Server/compose.production.yaml exec -T db pg_dump -U moneylife -d moneylife -Fc > backup.dump
```

백업에는 개인 조건과 익명 세션 정보가 포함되므로 접근 권한과 보관 기간을 제한한다. 운영 DB에 덮어쓰지 않고 새 DB를 생성한 뒤 `pg_restore --exit-on-error`로 복원한다. 복원 DB의 마이그레이션 버전과 데이터 확인 후 `DATABASE_URL`을 변경하고 API를 재생성한다. Nginx도 재시작해 변경된 API 주소를 다시 해석하도록 한다. 원본 DB와 이전 이미지 태그를 보존해 되돌릴 수 있도록 한다.

SQLite 개발 DB의 백업은 기존 `Server/scripts/sqlite_backup.py`를 사용한다. PostgreSQL 파일 복사로 대체하지 않는다.

## 자동 검증 범위

GitHub 검사에는 일반 회귀 검사 외에 두 작업이 포함된다.

- PostgreSQL: 명시적 마이그레이션, 동일 저장 요청 재전송·동시 요청, 계산 재시도, 재시작 후 소유권·목표 보존, 자동 마이그레이션 비활성화.
- 배포: 실제 배포 이미지 빌드, 격리된 PostgreSQL과 자체 서명 HTTPS 기동, Secure·HttpOnly 쿠키, Origin 차단, 서버 재시작, 백업을 별도 DB로 복원한 뒤 기존 계획·결과 조회, 브라우저 저장·계산 결과 표시.

자체 서명 인증서 검사는 CI의 localhost에서만 인증서 검증을 생략한다. 공개 도메인의 인증서 갱신·DNS·운영 모니터링까지 검증하는 것은 아니다. 합격 여부는 해당 변경의 GitHub 검사 결과로 확인한다.
