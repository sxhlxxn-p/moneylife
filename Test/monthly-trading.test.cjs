// Shared wallet investment regression tests. Author: sxhlxxn / Student ID: 202439688.
const test = require('node:test');
const assert = require('node:assert/strict');
const {simulateWithTrading, compareWithTrading} = require('../Engine/src/monthly-trading.cjs');
const {calculateSnapshot} = require('../Engine/src/snapshot.cjs');
const {createAccount, applyCashFlow, executeOrder} = require('../Engine/src/paper-trading.cjs');
const fixture = require('../fixtures/paper-trading/monthly-run.json');

const symbol = 'TEST-KRW';
const plan = overrides => ({initial: {cash: 100, saved: 0, income: 0, expense: 0, target: 150},
  monthlySaving: 0, annualRate: 0, changes: [], rateChanges: [], ...overrides});
const order = (id, side, quantity, submittedMonth = 0) => ({id, symbol, side, quantity, submittedMonth});
const price = (month, value = 10, tradable = true) => ({month, price: value, tradable});
const market = (orders = [], prices = []) => ({symbol, priceSeriesId: 'synthetic-v1', orders, prices});
const fails = code => error => error.code === code;

test('수기 정산 fixture의 공유 현금·저축·주식·총자산·목표 시점을 재현한다', () => {
  const result = compareWithTrading(fixture.state, fixture.investment, fixture.months);
  const rows = result.invested.monthlyResults;
  for (const key of ['cash', 'saved']) assert.deepEqual(rows.map(row => row[key]), fixture.expected[key]);
  assert.deepEqual(rows.map(row => row.total), fixture.expected.totals);
  assert.deepEqual(rows.map(row => row.investment.quantity), fixture.expected.quantity);
  assert.equal(result.invested.summary.finalRealizedPnl, fixture.expected.finalRealizedPnl);
  assert.equal(result.comparison.finalAssetsDifference, 10000);
  assert.equal(result.baseline.summary.goalMonth, 3);
  assert.equal(result.invested.summary.goalMonth, 2);
  assert.equal(result.comparison.goalMonthDifference, -1);
  assert.equal(result.invested.account.cash, rows.at(-1).cash);
});

test('접수 월에는 체결하지 않고 다음 월 가격으로만 체결한다', () => {
  const input = market([order('b', 'buy', 2)], [price(0, 1), price(1, 20)]);
  const initial = simulateWithTrading(plan(), input, 0);
  assert.equal(initial.executions.length, 0);
  assert.equal(initial.pendingOrders.length, 1);
  assert.equal(initial.monthlyResults[0].investment.quantity, 0);
  const next = simulateWithTrading(plan(), input, 1);
  assert.equal(next.executions[0].price, 20);
  assert.equal(next.executions[0].executionMonth, 1);
  assert.equal(next.monthlyResults[1].cash, 60);
});

test('생활비를 먼저 내고 잔액이 부족한 매수는 거부한 뒤 남은 돈만 저축한다', () => {
  const state = plan({initial: {cash: 100, saved: 0, income: 0, expense: 70, target: 150}, monthlySaving: 50});
  const result = simulateWithTrading(state, market([order('b', 'buy', 1)], [price(1, 50)]), 1);
  assert.equal(result.executions[0].reason, 'INSUFFICIENT_CASH');
  assert.equal(result.monthlyResults[1].cash, 0);
  assert.equal(result.monthlyResults[1].saved, 30);
  assert.equal(result.monthlyResults[1].total, 30);
});

test('매수가 저축 가능액을 줄여도 총자산에서 원금을 두 번 차감하지 않는다', () => {
  const result = compareWithTrading(plan({monthlySaving: 70}), market([order('b', 'buy', 8)], [price(1)]), 1);
  const row = result.invested.monthlyResults[1];
  assert.equal(row.saved, 20);
  assert.equal(row.cash, 0);
  assert.equal(row.investment.marketValue, 80);
  assert.equal(row.total, 100);
  assert.equal(result.comparison.finalAssetsDifference, 0);
});

test('같은 월 매도 대금을 사용해 매수하며 같은 방향의 주문 순서를 유지한다', () => {
  const orders = [order('hold', 'buy', 2), order('b1', 'buy', 1, 1), order('b2', 'buy', 1, 1), order('s', 'sell', 2, 1)];
  const result = simulateWithTrading(plan(), market(orders, [price(1, 50), price(2, 100)]), 2);
  assert.deepEqual(result.executions.map(x => x.order.id), ['hold', 's', 'b1', 'b2']);
  assert.equal(result.executions.every(x => x.status === 'filled'), true);
  assert.equal(result.monthlyResults[2].investment.quantity, 2);
});

test('보유 주식은 자동 매도하지 않고 같은 달 매도도 앞서 발생한 부족액을 지우지 않는다', () => {
  const state = plan({changes: [{type: 'once', v: 200, m: 2}]});
  const orders = [order('b', 'buy', 10), order('s', 'sell', 10, 1)];
  const result = simulateWithTrading(state, market(orders, [price(1), price(2)]), 3);
  assert.equal(result.monthlyResults[2].unpaid, 200);
  assert.equal(result.monthlyResults[2].cash, 100);
  assert.equal(result.monthlyResults[3].unpaid, 200);
  assert.equal(result.monthlyResults[3].total, -100);
});

test('체결 가격 누락은 거부하고 다음 월 유효 가격이 생겨도 자동 재주문하지 않는다', () => {
  const result = simulateWithTrading(plan(), market([order('b', 'buy', 1)], [price(2)]), 2);
  assert.equal(result.executions.length, 1);
  assert.equal(result.executions[0].reason, 'PRICE_UNAVAILABLE');
  assert.equal(result.monthlyResults[2].investment.quantity, 0);
});

test('가격 누락 월은 과거 가격으로 평가하되 매수에는 과거 가격을 쓰지 않는다', () => {
  const result = simulateWithTrading(plan(), market([order('b', 'buy', 2), order('again', 'buy', 1, 1)],
    [price(1), price(3, 20)]), 3);
  const stale = result.monthlyResults[2].investment;
  assert.equal(stale.marketValue, 20);
  assert.equal(stale.priceMonth, 1);
  assert.equal(stale.stale, true);
  assert.equal(result.executions[1].reason, 'PRICE_UNAVAILABLE');
  assert.equal(result.monthlyResults[3].investment.marketValue, 40);
  assert.equal(result.monthlyResults[3].investment.stale, false);
});

test('거래 불가 월은 체결을 막고 제공된 유효 가격으로 평가만 한다', () => {
  const result = simulateWithTrading(plan(), market([order('b', 'buy', 2), order('s', 'sell', 1, 1)],
    [price(1), price(2, 20, false)]), 2);
  assert.equal(result.executions[1].reason, 'NOT_TRADABLE');
  assert.equal(result.monthlyResults[2].investment.quantity, 2);
  assert.equal(result.monthlyResults[2].investment.marketValue, 40);
});

test('이후 가격·미접수 주문은 이전 경로와 실행 결과에 영향을 주지 않는다', () => {
  const first = market([order('b', 'buy', 2), order('future', 'sell', 1, 5)], [price(1), price(6, 20)]);
  const changed = structuredClone(first);
  changed.prices[1].price = 99999;
  changed.orders[1].quantity = 2;
  assert.deepEqual(simulateWithTrading(plan(), first, 2), simulateWithTrading(plan(), changed, 2));
  assert.equal(simulateWithTrading(plan(), first, 2).pendingOrders.length, 0);
});

test('주문이 없으면 금리·이벤트가 있어도 기존 정수 원 엔진과 같은 경로다', () => {
  const state = plan({initial: {cash: 1000000, saved: 700000, income: 2500000, expense: 1600000, target: 20000000},
    monthlySaving: 700000, annualRate: 3, changes: [{type: 'once', v: 300000, m: 5},
      {type: 'income', v: 100000, m: 10, end: 20}, {type: 'saving', v: 500000, m: 30}],
    rateChanges: [{m: 24, v: 4}]});
  const invested = simulateWithTrading(state, market(), 120);
  const baseline = calculateSnapshot(state, 120);
  assert.deepEqual(invested.monthlyResults.map(({investment, ...row}) => row), baseline.monthlyResults);
  assert.equal(invested.summary.goalMonth, baseline.summary.goalMonth);
});

test('같은 가격에서 수수료·세금이 유일한 자산 차이가 된다', () => {
  const input = market([order('b', 'buy', 4), order('s', 'sell', 4, 1)], [price(1), price(2)]);
  input.costs = {feeBps: 1000, sellTaxBps: 500};
  const result = compareWithTrading(plan({monthlySaving: 10}), input, 2);
  assert.equal(result.invested.summary.finalRealizedPnl, -10);
  assert.equal(result.comparison.finalAssetsDifference, -10);
});

test('투자 때문에 저축 이체가 줄면 다음 달 저축 이자도 실제 잔액으로 줄어든다', () => {
  const result = compareWithTrading(plan({monthlySaving: 100, annualRate: 100}),
    market([order('b', 'buy', 5)], [price(1), price(2)]), 2);
  assert.equal(result.baseline.monthlyResults[2].saved, 106);
  assert.equal(result.invested.monthlyResults[2].saved, 53);
  assert.equal(result.invested.monthlyResults[2].investment.marketValue, 50);
  assert.equal(result.comparison.finalAssetsDifference, -3);
});

test('총자산이 같아도 투자로 현금이 묶이면 부족 기간 차이가 생긴다', () => {
  const result = compareWithTrading(plan({initial: {cash: 100, saved: 0, income: 0, expense: 30, target: 150}}),
    market([order('b', 'buy', 7)], [price(1), price(2)]), 2);
  assert.equal(result.comparison.finalAssetsDifference, 0);
  assert.equal(result.comparison.shortageMonthsDifference, 1);
  assert.equal(result.invested.monthlyResults[2].investment.quantity, 7);
  assert.equal(result.invested.monthlyResults[2].unpaid, 30);
});

test('저축 잔액을 자동 인출하지 않고 한쪽만 목표를 달성하면 월 차이는 null이다', () => {
  const invested = simulateWithTrading(plan({initial: {cash: 0, saved: 100, income: 0, expense: 0, target: 150}}),
    market([order('b', 'buy', 1)], [price(1)]), 1);
  assert.equal(invested.executions[0].reason, 'INSUFFICIENT_CASH');
  assert.equal(invested.monthlyResults[1].saved, 100);
  const compared = compareWithTrading(plan(), market([order('b', 'buy', 10)], [price(1), price(2, 20)]), 2);
  assert.equal(compared.invested.summary.goalMonth, 2);
  assert.equal(compared.baseline.summary.goalMonth, null);
  assert.equal(compared.comparison.goalMonthDifference, null);
});

test('동일 주문 중복은 한 번만 체결하고 접수 월·수량을 바꾸면 충돌한다', () => {
  const single = order('b', 'buy', 1);
  assert.equal(simulateWithTrading(plan(), market([single, {...single}], [price(1)]), 1).executions.length, 1);
  for (const different of [{...single, submittedMonth: 1}, {...single, quantity: 2}]) {
    assert.throws(() => simulateWithTrading(plan(), market([single, different], [price(1)]), 2), fails('ORDER_ID_CONFLICT'));
  }
});

test('최종 접수 월의 주문은 다음 계산 월에만 실행하고 기간 밖 주문은 거부한다', () => {
  const input = market([order('last', 'buy', 1, 119)], [price(120)]);
  assert.equal(simulateWithTrading(plan(), input, 119).executions.length, 0);
  assert.equal(simulateWithTrading(plan(), input, 119).pendingOrders.length, 1);
  assert.equal(simulateWithTrading(plan(), input, 120).executions.length, 1);
  input.orders[0].submittedMonth = 120;
  assert.throws(() => simulateWithTrading(plan(), input, 120), fails('INVALID_INTEGER'));
});

test('미달성 목표의 월 차이는 임의 숫자로 바꾸지 않고 null로 둔다', () => {
  const result = compareWithTrading(plan(), market(), 2);
  assert.equal(result.baseline.summary.goalMonth, null);
  assert.equal(result.invested.summary.goalMonth, null);
  assert.equal(result.comparison.goalMonthDifference, null);
  const achieved = compareWithTrading(plan({initial: {cash: 100, saved: 0, income: 0, expense: 0, target: 100}}), market(), 0);
  assert.equal(achieved.invested.summary.goalMonth, 0);
  assert.equal(achieved.comparison.goalMonthDifference, 0);
});

test('월·가격·요율·금융 조건의 잘못된 입력을 조용히 보정하지 않는다', () => {
  for (const input of [market([], [price(1, -1)]), market([], [price(1, 1.5)]), market([], [price(121)]),
    market([order('bad', 'buy', 0)], []), {...market(), costs: {feeBps: 10001}}]) {
    assert.throws(() => simulateWithTrading(plan(), input, 2));
  }
  assert.throws(() => simulateWithTrading(plan(), market([], [price(1), price(1)]), 2), fails('DUPLICATE_PRICE_MONTH'));
  assert.throws(() => simulateWithTrading(plan({monthlySaving: -1}), market(), 2), fails('INVALID_INTEGER'));
  assert.throws(() => simulateWithTrading(plan({changes: [{type: 'expense', v: -1, m: 1}]}), market(), 2), fails('INVALID_INTEGER'));
});

test('외부 현금 이동은 매매 손익이 아니며 기존 계좌 스냅샷도 읽을 수 있다', () => {
  const initial = createAccount({symbol, cash: 100});
  const legacy = {...initial}; delete legacy.netCashFlow;
  let state = applyCashFlow(legacy, 50);
  state = executeOrder(state, {id: 'b', symbol, side: 'buy', quantity: 2}, {symbol, price: 10, tradable: true}).account;
  state = applyCashFlow(state, -100);
  assert.equal(state.cash, 30);
  assert.equal(state.netCashFlow, -50);
  assert.equal(state.realizedPnl, 0);
  assert.equal(initial.cash, 100);
  assert.throws(() => applyCashFlow(state, -31), fails('INSUFFICIENT_CASH_FLOW'));
});

test('입력을 변경하지 않고 JSON 왕복 후 같은 월별 결과를 재현한다', () => {
  const input = structuredClone(fixture);
  const before = JSON.stringify(input);
  const first = simulateWithTrading(input.state, input.investment, input.months);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first, simulateWithTrading(JSON.parse(before).state, JSON.parse(before).investment, input.months));
  for (const row of first.monthlyResults) {
    assert.equal(row.total, row.cash + row.saved + row.investment.marketValue - row.unpaid);
  }
  assert.equal(first.account.cash + first.account.costBasis,
    first.account.initialCash + first.account.netCashFlow + first.account.realizedPnl);
});
