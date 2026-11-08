// Paper trading accounting tests. Author: sxhlxxn / Student ID: 202439688.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAccount, executeOrder, valueAccount} = require('../Engine/src/paper-trading.cjs');
const fixture = require('../fixtures/paper-trading/single-stock.json');
const symbol = 'TEST-KRW';
const account = (cash = 1000000) => createAccount({symbol, cash});
const order = (id, side = 'buy', quantity = 1) => ({id, symbol, side, quantity});
const quote = (price = 10000, tradable = true) => ({symbol, price, tradable});
const fails = code => error => error.code === code;

function freeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return value;
}

test('가상 가격 fixture로 매수·부분 매도·평가손익을 재현한다', () => {
  let state = account(fixture.initialCash);
  for (const step of fixture.steps) state = executeOrder(state, step.order, step.quote).account;
  assert.deepEqual(valueAccount(state, fixture.steps.at(-1).quote), fixture.expected);
  assert.equal(state.executions.length, 2);
});

test('매수 수수료와 매도 수수료·세금을 현금과 손익에 한 번씩 반영한다', () => {
  const costs = {feeBps: 100, sellTaxBps: 200};
  let state = executeOrder(account(), order('buy', 'buy', 40), quote(), costs).account;
  assert.equal(state.cash, 596000);
  assert.equal(state.costBasis, 404000);
  state = executeOrder(state, order('sell', 'sell', 10), quote(12500), costs).account;
  assert.deepEqual(valueAccount(state, quote(12500)), {
    cash: 717250, quantity: 30, costBasis: 303000, averageCost: '10100.000000',
    marketValue: 375000, realizedPnl: 20250, unrealizedPnl: 72000,
    totalPnl: 92250, totalAssets: 1092250, feesPaid: 5250, taxesPaid: 2500
  });
});

test('추가 매수는 이동평균 원가를 사용하고 전량 매도 후 원가가 남지 않는다', () => {
  let state = executeOrder(account(), order('a', 'buy', 3), quote(100)).account;
  state = executeOrder(state, order('b', 'buy', 2), quote(200)).account;
  assert.equal(valueAccount(state, quote(200)).averageCost, '140.000000');
  state = executeOrder(state, order('c', 'sell', 2), quote(150)).account;
  assert.equal(state.costBasis, 420);
  assert.equal(state.realizedPnl, 20);
  state = executeOrder(state, order('d', 'sell', 3), quote(100)).account;
  assert.equal(state.quantity, 0);
  assert.equal(state.costBasis, 0);
  assert.equal(state.realizedPnl, -100);
  assert.equal(valueAccount(state, null).averageCost, null);
});

test('부분 매도 원가의 반올림 잔액은 최종 매도에서 모두 정산한다', () => {
  let state = executeOrder(account(100), order('b', 'buy', 3), quote(1), {feeBps: 3333}).account;
  assert.equal(state.costBasis, 4);
  state = executeOrder(state, order('s1', 'sell', 1), quote(1)).account;
  assert.equal(state.costBasis, 3);
  state = executeOrder(state, order('s2', 'sell', 1), quote(1)).account;
  assert.equal(state.costBasis, 1);
  state = executeOrder(state, order('s3', 'sell', 1), quote(1)).account;
  assert.equal(state.costBasis, 0);
  assert.equal(state.cash, 99);
  assert.equal(state.realizedPnl, -1);
});

test('거래 비용 0.5원은 HALF_UP으로 1원 처리한다', () => {
  const result = executeOrder(account(100), order('b'), quote(50), {feeBps: 100});
  assert.equal(result.execution.fee, 1);
  assert.equal(result.account.cash, 49);
});

test('현금 부족 주문은 전량 거부하고 잔액·원가·보유 수량을 유지한다', () => {
  const original = account(100);
  const result = executeOrder(original, order('b'), quote(100), {feeBps: 100});
  assert.equal(result.execution.reason, 'INSUFFICIENT_CASH');
  assert.deepEqual({...result.account, executions: []}, original);
  assert.equal(result.account.executions.length, 1);
});

test('현금 전액에 해당하는 매수는 체결하고 보유 수량 초과 매도는 거부한다', () => {
  const bought = executeOrder(account(100), order('b'), quote(100)).account;
  assert.equal(bought.cash, 0);
  const result = executeOrder(bought, order('s', 'sell', 2), quote(100));
  assert.equal(result.execution.reason, 'INSUFFICIENT_SHARES');
  assert.equal(result.account.quantity, 1);
  assert.equal(result.account.cash, 0);
});

test('가격 누락·거래 불가·종목 불일치에서 임의로 체결하지 않는다', () => {
  for (const [price, reason] of [[null, 'PRICE_UNAVAILABLE'], [quote(0), 'PRICE_UNAVAILABLE'],
    [quote(-1), 'PRICE_UNAVAILABLE'], [quote(1.5), 'PRICE_UNAVAILABLE'],
    [quote(10, false), 'NOT_TRADABLE'], [{...quote(), symbol: 'OTHER'}, 'SYMBOL_MISMATCH']]) {
    const result = executeOrder(account(), order('b'), price);
    assert.equal(result.execution.reason, reason);
    assert.equal(result.account.cash, 1000000);
    assert.equal(result.account.quantity, 0);
  }
  assert.equal(executeOrder(account(), {...order('b'), symbol: 'OTHER'}, quote()).execution.reason, 'SYMBOL_MISMATCH');
});

test('동일 주문 재전송은 가격이 달라져도 재체결하지 않고 다른 내용이면 충돌한다', () => {
  const intent = order('same', 'buy', 2);
  const first = executeOrder(account(), intent, quote());
  const retry = executeOrder(first.account, intent, quote(20000), {feeBps: 100});
  assert.deepEqual(retry, first);
  assert.equal(retry.account.executions.length, 1);
  assert.throws(() => executeOrder(first.account, {...intent, quantity: 3}, quote()), fails('ORDER_ID_CONFLICT'));
});

test('거부 주문의 재전송도 중복되지 않고 새로운 ID로 재시도한다', () => {
  const first = executeOrder(account(100), order('b'), quote(200));
  const retry = executeOrder(first.account, order('b'), quote(100));
  assert.deepEqual(retry, first);
  const next = executeOrder(retry.account, order('b-new'), quote(100));
  assert.equal(next.execution.status, 'filled');
  assert.equal(next.account.executions.length, 2);
});

test('수량·방향·ID·요율의 형식 오류를 거부한다', () => {
  for (const quantity of [0, -1, .5, '1', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => executeOrder(account(), order('b', 'buy', quantity), quote()), fails('INVALID_INTEGER'));
  }
  assert.throws(() => executeOrder(account(), order('b', 'hold'), quote()), fails('INVALID_SIDE'));
  assert.throws(() => executeOrder(account(), order(''), quote()), fails('INVALID_IDENTIFIER'));
  assert.throws(() => executeOrder(account(), order('b'), quote(), {feeBps: 10001}), fails('INVALID_COST_RATE'));
  assert.throws(() => executeOrder(account(), order('b'), quote(), {sellTaxBps: -1}), fails('INVALID_INTEGER'));
});

test('안전 정수 범위를 벗어나는 거래대금과 평가액은 계산하지 않는다', () => {
  assert.throws(() => executeOrder(account(), order('b', 'buy', 2), quote(Number.MAX_SAFE_INTEGER)), fails('INVALID_INTEGER'));
  const held = executeOrder(account(), order('b', 'buy', 2), quote()).account;
  assert.throws(() => valueAccount(held, quote(Number.MAX_SAFE_INTEGER)), fails('INVALID_INTEGER'));
});

test('보유 주식 평가에는 유효한 해당 종목 가격이 필요하고 0주는 가격 없이 평가한다', () => {
  assert.equal(valueAccount(account(), null).totalAssets, 1000000);
  const held = executeOrder(account(), order('b'), quote()).account;
  assert.throws(() => valueAccount(held, null), fails('PRICE_UNAVAILABLE'));
  assert.throws(() => valueAccount(held, {...quote(), symbol: 'OTHER'}), fails('SYMBOL_MISMATCH'));
  assert.equal(valueAccount(held, quote(9000, false)).unrealizedPnl, -1000);
});

test('매도 비용이 대금을 초과하면 음수 현금 유입 대신 거부한다', () => {
  const held = executeOrder(account(), order('b'), quote(1)).account;
  const result = executeOrder(held, order('s', 'sell'), quote(1), {feeBps: 5000, sellTaxBps: 5000});
  assert.equal(result.execution.reason, 'COST_EXCEEDS_PROCEEDS');
  assert.equal(result.account.quantity, 1);
});

test('입력을 변경하지 않고 JSON 왕복 후에도 같은 거래 결과를 재현한다', () => {
  const original = freeze(account());
  const intent = freeze(order('b', 'buy', 40));
  const price = freeze(quote());
  const first = executeOrder(original, intent, price);
  assert.equal(original.executions.length, 0);
  const restored = JSON.parse(JSON.stringify(first.account));
  const sell = order('s', 'sell', 10);
  assert.deepEqual(executeOrder(restored, sell, quote(12500)), executeOrder(freeze(first.account), sell, quote(12500)));
});

test('같은 가격의 반복 매매에서 자산 변화는 거래 비용과 일치한다', () => {
  let state = account();
  for (let i = 0; i < 50; i++) {
    state = executeOrder(state, order('buy-' + i, 'buy', 3), quote(1234), {feeBps: 15}).account;
    state = executeOrder(state, order('sell-' + i, 'sell', 3), quote(1234), {feeBps: 15, sellTaxBps: 20}).account;
    const value = valueAccount(state, null);
    assert.equal(value.totalAssets, state.initialCash - state.feesPaid - state.taxesPaid);
    assert.equal(value.totalPnl, value.totalAssets - state.initialCash);
    assert.equal(state.costBasis, 0);
  }
});

test('저장 과정에서 주문 객체의 필드 순서가 바뀌어도 같은 ID는 재체결하지 않는다', () => {
  const first = executeOrder(account(), order('b'), quote());
  const restored = JSON.parse(JSON.stringify(first.account));
  restored.executions[0].order = {quantity: 1, side: 'buy', symbol, id: 'b'};
  const result = executeOrder(restored, order('b'), quote(20000));
  assert.equal(result.account.executions.length, 1);
  assert.equal(result.account.cash, first.account.cash);
  assert.equal(result.execution.price, 10000);
});

test('계좌 잔액과 원가가 손익 기록에 맞지 않으면 계산을 중단한다', () => {
  const invalid = {...account(), cash: 0};
  assert.throws(() => executeOrder(invalid, order('b'), quote()), fails('INVALID_ACCOUNT'));
  assert.throws(() => valueAccount(invalid, null), fails('INVALID_ACCOUNT'));
});
