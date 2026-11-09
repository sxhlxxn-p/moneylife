# Shared Fixtures

Client·Server·Engine·Test가 함께 사용하는 비식별 입력과 기대 결과를 관리한다.

- `expected-results/example-run.json`: 현재 금융 엔진 기준 실행 결과
- `paper-trading/single-stock.json`: 실제 시세와 무관한 가상 종목 매수·부분 매도 입력과 수기 정산 기대값
- 실제 계좌 정보, 인증정보와 개인 식별 데이터는 저장하지 않는다.
- 데이터 구조가 바뀌면 관련 명세와 테스트를 같은 PR에서 수정한다.

- `paper-trading/monthly-run.json`: 공유 현금·월별 저축·매수/부분 매도/전량 매도의 가상 가격과 수기 정산 기대값. 실제 종목·시세가 아니다.
