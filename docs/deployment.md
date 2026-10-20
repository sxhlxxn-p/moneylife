# Deployment

배포 공급자와 운영 환경은 아직 확정되지 않았다.

목표는 Client 정적 배포와 Server·PostgreSQL 배포를 분리하는 것이다. 배포 전 다음을 확정한다.

- Node.js와 패키지 버전
- Client API 주소와 Server 허용 Origin
- DB 생성·마이그레이션·백업·복구 절차
- Server 환경변수와 비밀 관리 방식
- `/health` 및 주요 사용자 흐름 확인 방법
- 이전 버전으로 되돌리는 절차

실제 검증 전에는 특정 공급자 명령이나 성공 상태를 기록하지 않는다.
