# Shared Fixtures

Client·Server·Engine·Test가 함께 사용하는 비식별 입력과 기대 결과를 관리한다.

- `expected-results/example-run.json`: 현재 금융 엔진 기준 실행 결과
- `expected-results/krw-cases.json`: 원 단위 서버 계산(`cash-savings-krw-v1`)의 월 이자 HALF_UP·다음 달 이자 이체·부족 누적·금리/기간 변경 경계·목표 동일 금액을 엔진 출력이 아닌 명세 기준으로 독립 계산한 기대값. `notes`에 월별 검산 근거가 있으며 `Test/krw-ledger.test.cjs`가 대조한다.
- `paper-trading/single-stock.json`: 실제 시세와 무관한 가상 종목 매수·부분 매도 입력과 수기 정산 기대값
- 실제 계좌 정보, 인증정보와 개인 식별 데이터는 저장하지 않는다.
- 데이터 구조가 바뀌면 관련 명세와 테스트를 같은 PR에서 수정한다.

- `news-game/four-rounds.json`: 가상 뉴스 게임(`news-game-v1`) 4라운드의 대응·주가 충격·해당 라운드 생활비/소득 충격·HALF_UP 0.5원 경계·미충족 누적을 `docs/news-game.md` 규칙으로 독립 계산한 기대값. `Test/news-ledger.test.cjs`가 대조한다.

- `paper-trading/monthly-run.json`: 공유 현금·월별 저축·매수/부분 매도/전량 매도의 가상 가격과 수기 정산 기대값. 실제 종목·시세가 아니다.
