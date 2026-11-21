# Shared

Client·Server·Engine이 함께 사용하는 데이터 계약과 규칙을 관리한다. 계획·서버 계산·AI 변경·모의투자·뉴스 게임의 명세와 `life-events.json`이 있다.

Shared 전체가 실행 가능한 공통 타입 패키지인 것은 아니다. 현재 런타임 검증은 서버 Pydantic, Client의 plan-state 변환, Engine 입력 검사에 구현되어 있다. 생애 이벤트 규칙은 공통 JSON을 실제로 읽는다.

필드·단위·오류 코드 변경 시 해당 명세와 실제 검증 코드·fixture·테스트를 함께 수정한다. 특히 금액은 API에서 정수 원이며 화면 표시 단위와 구분한다. 현재 실행 구조는 [개발 구조](../docs/architecture.md), 구현 상태는 [현재 상태](../docs/project-status.md)를 따른다.
