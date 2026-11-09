# Test

통합 테스트, 엔진 회귀 검증, AI 평가와 비식별 기준 데이터를 관리한다. 테스트 도구가 확정되기 전에는 빈 테스트 파일을 만들지 않는다.

- `../fixtures/expected-results/example-run.json`: 현재 Client 계산 응답 예시
- `engine.test.cjs`: Node 내장 테스트 러너를 사용하는 금융 엔진 회귀 테스트
- 실제 계좌 정보, 인증정보, 개인 식별자는 저장하지 않는다.
- 개발용과 최종 평가용 데이터는 추후 하위 경로로 분리한다.

현재 테스트는 별도 패키지 설치 없이 실행된다.

```bash
npm test
```

Server와 Client가 실제로 연결되면 이 폴더에 통합 테스트를 추가한다. Cypress 같은 도구는 선정된 뒤 실제 테스트와 함께 설치하며, 예제 테스트 폴더를 먼저 복사하지 않는다. AI 평가는 정상·모호·불가능·오류 사례와 기대 조건을 fixture로 분리한다.


현재 `plan-state.test.cjs`는 원/만 원 왕복 변환 후 전체 계산 경로 재현과 12/22개월 목표 사례를 검증한다. API 영속성 테스트는 `Server/tests/test_plans.py`에 있으며 로컬 실행 방법은 `docs/first-integration.md`를 참고한다.

자연어 조건 변경의 100건 평가 데이터와 실행 방법은 [AI 평가](ai/README.md)를 따른다. 단위 테스트는 외부 모델을 호출하지 않으며 실제 모델 평가는 별도 명령이다.

## 실제 브라우저 통합 테스트

투자 화면은 Playwright Chromium으로 테스트한다. Playwright는 Test workspace의 개발 의존성이며 앱 실행에는 사용하지 않는다. Node 20 이상, Python 가상환경과 `Server/requirements-dev.txt` 설치가 필요하다.

프로젝트 루트에서 실행한다.

```bash
npm install
npx playwright install chromium
npm run test:ui
```

테스트가 임시 SQLite DB, API 서버(3017), Client 서버(5187)를 자동으로 실행하고 종료한다. 실제 계좌·외부 LLM API는 호출하지 않는다. Python은 기본적으로 루트 `.venv`를 사용한다. 별도 환경은 `PYTHON_BIN`, 사용 중인 포트는 `UI_TEST_PORT`·`UI_TEST_API_PORT`로 지정한다. 이미 설치된 호환 Chromium은 `UI_BROWSER_PATH`로 지정할 수 있다. 화면 캡처가 필요하면 존재하는 폴더를 `UI_SCREENSHOT_DIR`에 지정한다.

검증 범위: 개인 조건 사본·본편 보존, 주문·월 진행·손익·비투자 비교, 저장 목록·새로고침 복원, 서버에서 처리한 응답 유실 후 동일 요청 재확인, 모바일 가로 넘침·오류 안내, 기간 제한, 기존 계획 저장·AI 오류 처리 회귀.

과거 가격 테스트는 실제 시세를 사용하지 않는다. 브라우저 테스트 시작 시 임시 가상 CSV를 정규 등록 경로로 등록해 목록 선택·출처·과거 월 표시·체결·새로고침을 확인한다. `Server/tests/test_market_data.py`는 누락·중복·변조·private 숨김·파일 삭제 후 재현, 캔들 요청의 GET 전용·페이지네이션·오류·토큰 비노출을 검증한다. 외부 조회는 MockTransport로 대체한다.

주문 전 확인은 `order-preview.test.cjs`와 `Server/tests/test_order_preview.py`에서 현재 가격 가정·미래 가격 차단·기존 예약·지출·저축·비용 정산·DB 미저장을 검증한다. 브라우저 테스트는 확인 전 주문 미생성, 취소·Escape·새로고침, 수량 고정, 실패/늦은 응답, 모바일 확인 화면을 포함한다.

`Server/tests/test_paper_explanation.py`는 기본 해설의 외부/엔진 호출 부재, 손익·비교 방향과 기간, ID 선택 검증·재요청·대체, 현금 부족/가격 지연 필수 설명, 개인정보 미전송, 캐시 소유권·재시작·동시 요청을 검증한다. 브라우저는 기본 GET과 명시적 AI POST, 출처 구분, 미설정 대체, Run 변경 시 이전 설명 제거, 오류·모바일 표시를 확인한다. 브라우저 테스트의 API 서버는 LLM 환경변수를 빈 값으로 고정해 실제 모델을 호출하지 않는다.
