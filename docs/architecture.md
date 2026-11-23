# 개발 구조와 수정 위치

현재 구현 상태는 [project-status.md](project-status.md)를 기준으로 한다. 초기 구조와 미정 스택은 [과거 기록](history/architecture-initial.md)에 보관한다.

## 실행 경계

- Client: 정적 화면·브라우저 상태·API 호출. 이번 백엔드 정리에서 수정하지 않는다.
- Server: FastAPI·Pydantic·SQLAlchemy. DB 저장과 소유권 검사를 수행하고 Node 엔진·외부 제공자 어댑터를 호출한다.
- Engine: DB·HTTP·화면에 의존하지 않는 JavaScript 계산. 브라우저와 서버가 공용 원 단위 계산을 사용한다.
- Shared: 필드·단위·오류·시뮬레이션 규칙 명세와 생애 이벤트 JSON. 모든 런타임 타입이 이 폴더에 구현된 것은 아니다.
- Test·Server/tests: Node·브라우저·서버·오프라인 평가 검사. 실제 제공자 호출과 대역 검증을 구분한다.
- prototype: 보관용 초안. 현재 개발 대상이 아니다.

## 백엔드 작업 위치

라우트는 요청·응답, 소유권 의존성, 사용자 흐름을 연결한다. 다른 라우트의 내부 함수를 가져다 쓰지 않고 공통 모듈을 사용한다.

- `sessions.py`: 게스트 소유자 확인·Origin 검사·쿠키 설정. `session_api.py`가 세션 갱신 API를 제공한다.
- `plan_store.py`: 금융 계획 소유권 조회와 응답 요약. `plans.py`는 기본 저장·조회, `plan_saves.py`는 재전송 가능한 저장을 제공한다.
- `paper_store.py`: 투자 사본·Run 조회, 동일 요청 결과 확인, 계산 후 트랜잭션 저장. `paper.py`가 주문·월 진행·조건 편집 API를 연결한다.
- `financial_conditions.py`·`condition_schemas.py`: 수동 입력과 자연어 입력이 공유하는 조건 적용·검증. LLM과 API 라우트에 의존하지 않는다.
- `ai_changes.py`: 모델에 전달할 기준 연월과 승인 전 변경 내역. `ai.py`가 재질문·승인·비교 저장을 연결한다.
- `news_records.py`: 저장 뉴스의 계약·검증·응답 변환·재전송 조회. 뉴스 API와 비교 API가 함께 사용한다.
- `engine.py`·`investment_engine.py`: 고정 Node 실행, 시간 제한, 출력 검증. 입력·출력 검증은 각 경계의 책임이므로 임의로 삭제하지 않는다.
- `models.py`·`migrations/`: DB 모델과 스키마 변경. 배포 API는 자동 마이그레이션을 수행하지 않고 버전을 검사한다.

새 기능 때문에 모든 모듈에 클래스나 저장소 계층을 추가하지 않는다. 같은 규칙이 두 기능에서 필요할 때 공통 함수의 소유 위치를 먼저 결정한다.

## 데이터와 트랜잭션

계획·투자 사본·Run은 불변 기록이다. 수정은 기존 기록을 덮어쓰지 않고 새 사본을 만든다. 요청 ID 검사와 사본·결과 저장은 기존 트랜잭션 경계를 유지한다. 소유권은 클라이언트가 보낸 소유자 ID가 아닌 서버 세션에서 결정한다.

투자 목록은 정렬·페이지를 먼저 확정하고 Plan과 Run을 한 번에 조회한다. Run이 없거나 다른 소유자라면 기존과 같이 503으로 실패한다. 불완전한 기록을 목록에서 조용히 제거하지 않는다.

## 변경 후 확인

API·계산 수정은 `npm run verify:backend`, 사용자 흐름 검증은 기존 `npm run test:ui`를 사용한다. PostgreSQL과 배포 검사는 GitHub의 별도 작업에서 실행한다. API 필드·단위·오류·이벤트 효과를 바꾸면 Shared 명세와 관련 fixture·테스트를 함께 변경한다.
