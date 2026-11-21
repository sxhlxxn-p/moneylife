# 현재 개발 결정

구현 범위는 [현재 상태](project-status.md), 수정 경계는 [개발 구조](architecture.md)를 기준으로 한다. 초기 미정 항목과 당시 결정은 [과거 결정 기록](history/decisions-initial.md)에 보관한다.

- 현재 Client는 정적 JavaScript, Server는 FastAPI·SQLAlchemy·Pydantic, Engine은 Node.js JavaScript다. React·TypeScript 이전은 별도 결정 대상이다.
- 로컬 개발은 SQLite, Compose와 격리 배포 검사는 PostgreSQL을 사용한다. 공개 배포 공급자·도메인은 확정하지 않았다.
- 인증은 익명 게스트 세션이다. 계정 로그인·이전 세션 계정 복구를 제공하는 것으로 설명하지 않는다.
- API 금액은 정수 원이며 Decimal 이자를 월별 HALF_UP 반올림한다. 화면 단위와 반올림 위치는 별도로 검토한다.
- 사본·계산 결과와 요청 ID를 보존한다. 재시도는 기존 요청 ID를 사용하며 거래 결과를 임의로 덮어쓰지 않는다.
- 공통 소유권·금융 조건·투자 저장 함수는 라우트에서 분리한다. 공통 코드를 사용하기 위해 다른 라우트 내부를 import하지 않는다.
- LLM은 구조화 조건 추출과 서버 사실 문장 순서 선택을 담당한다. 계산과 도구 실행 순서는 서버가 결정한다. 자율 후보 탐색은 현재 구현이 아니다.
- 실제 LLM·토스 연결은 별도 검증 단계다. 오프라인 규칙 결과·모의 응답·배포 검사를 실제 모델 성능으로 소개하지 않는다.
- 팀 검증 런타임은 CI와 동일한 Node.js 22·Python 3.12다. npm 의존성은 루트 lockfile을 공유한다. Python requirements는 범위 지정이며 완전한 잠금 파일 도입은 후속 결정이다.
