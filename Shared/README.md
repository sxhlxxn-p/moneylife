# Shared

웹·서버·계산 엔진·AI 모듈이 공유하는 타입과 런타임 검증 스키마의 소유 경로다.

Plan, Event, Run, AIRequest의 필드명·단위·오류 코드는 이 영역에서 한 번만 정의한다. 현재 기술 스택이 확정되지 않아 구현 파일은 만들지 않았으며, 합의 후 검증 스키마와 함께 추가한다.

공통 계약을 변경할 때는 Client·Server·Engine 담당자가 함께 검토하고 `../docs/api-contract.md`와 관련 테스트를 같은 변경에 포함한다. 구현 전 결정 항목은 `SCHEMA_PLAN.md`에 기록한다.

