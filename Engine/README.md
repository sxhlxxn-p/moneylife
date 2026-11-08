# 금융 계산 엔진

`src/index.js`는 현금·저축·소득·지출·이벤트의 월별 처리 규칙을 공유한다. DOM·DB·네트워크에 의존하지 않는다.

- 브라우저: 만 원 단위 실수 계산 미리보기. 기존 화면의 계산 동작을 유지한다.
- 서버: `src/snapshot.cjs`가 정수 원 입력과 Decimal 이자 반올림 정책을 적용한다. `src/runner.cjs`는 고정된 stdin/stdout JSON 인터페이스다.
- 금리: 유효 연 금리에서 월 금리를 구해 월초 저축 잔액에 적용, 원 단위 HALF_UP. 월말 이체는 다음 달부터 이자 발생.
- 목표: `cash + saved - unpaid` 최초 도달 월. 현금 부족 시 자동 대출·저축 인출·상환을 하지 않는다.
- 결과: 초기 0개월부터 월별 잔액, 목표 도달 월·부족 기간·기간 말 자산.

루트에서 `npm ci`로 decimal.js를 설치한다. `npm test`는 기존 미리보기 회귀 사례를 검증한다. `cd Server` 후 `../.venv/bin/python -m pytest -q`는 실제 Node 실행·원 단위 반올림·Run 저장을 검증한다. 서버 계약은 [simulation-contract](../Shared/simulation-contract.md)를 따른다.

단일 종목 모의투자 정산은 별도 모듈로 구현했다. 월별 투자 연결·물가·부채와 TypeScript 전환은 후속 범위다. 입력 단위와 반올림 정책을 바꾸면 엔진 버전과 기대 결과를 함께 변경한다.

## 단일 종목 모의투자 계산

`src/paper-trading.cjs`는 `createAccount`, `executeOrder`, `valueAccount`를 제공한다. 입력을 변경하지 않고 매수·부분/전량 매도·이동평균 원가·거래 비용·실현/미실현 손익을 계산한다. 현금·수량 부족 주문을 거부하고 같은 주문 ID의 재체결을 막는다. decimal.js를 재사용하며 새 의존성은 없다.

루트에서 검증용 가상 가격 데모를 실행한다.

```bash
npm run demo:trading
```

현금 100만원에서 1만원에 40주 매수하고 1만2500원에 10주 매도하면 현금 72만5000원, 보유 30주, 실현손익 2만5000원, 미실현손익 7만5000원, 총자산 110만원이다. 데모는 수수료·세금을 0으로 둔 테스트 가정이며 실제 시세나 제도 요율을 사용하지 않는다.

현재 화면·서버·월별 엔진에는 이 모듈을 연결하지 않았다. 가격 시점 선택과 월 진행, 생활비와 현금 공유는 다음 단계다. 계약은 [paper-trading-contract](../Shared/paper-trading-contract.md), 검증 사례는 `Test/paper-trading.test.cjs`를 따른다.
