// Review estimates must not use future quotes. Author: sxhlxxn / Student ID: 202439688.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {previewOrder} = require('../Engine/src/order-preview.cjs');
const fixture = require('../fixtures/paper-trading/monthly-run.json');
const state = fixture.state;
const input = () => ({...structuredClone(fixture.investment), orders: []});
const order = (side = 'buy', quantity = 50) => ({id: 'review-1', side, quantity});

test('현재 가격·생활비·월말 저축을 반영하고 다음 달 실제 가격은 참조하지 않는다', () => {
  const investment = input();
  const result = previewOrder(state, investment, 0, order());
  assert.equal(result.referencePrice, 9500);
  assert.equal(result.referenceGross, 475000);
  assert.equal(result.nextIncome, 200000);
  assert.equal(result.nextExpense, 100000);
  assert.equal(result.estimatedNextCash, 575000);
  assert.equal(result.estimatedNextSaved, 50000);
  investment.prices[1].price = 9999999;
  assert.deepEqual(previewOrder(state, investment, 0, order()), result);
});
test('수수료·세금은 체결 정산과 같은 원 단위 반올림을 쓴다', () => {
  const investment = input(); investment.costs = {feeBps: 1, sellTaxBps: 10};
  const result = previewOrder(state, investment, 0, order('buy', 1));
  assert.equal(result.referenceFee, 1);
  assert.equal(result.referenceTax, 0);
  assert.equal(result.referenceCashChange, -9501);
});
test('기존 예약과 새 주문을 함께 계산하고 입력을 바꾸지 않는다', () => {
  const investment = input();
  investment.orders = [{id: 'existing', symbol: 'TEST-KRW', side: 'buy', quantity: 50, submittedMonth: 0}];
  const before = structuredClone(investment);
  const result = previewOrder(state, investment, 0, order('buy', 50));
  assert.equal(result.existingPendingCount, 1);
  assert.equal(result.estimatedNextCash, 100000);
  assert.deepEqual(investment, before);
});
test('같은 달 매도 대금으로 앞선 생활비 부족을 지우지 않는다', () => {
  const investment = input();
  investment.orders = [{id: 'past-buy', symbol: 'TEST-KRW', side: 'buy', quantity: 50, submittedMonth: 0}];
  const changed = {...state, changes: [{type: 'once', m: 2, v: 700000}]};
  const result = previewOrder(changed, investment, 1, order('sell', 20));
  assert.equal(result.currentQuantity, 50);
  assert.equal(result.nextExpense, 800000);
  assert.equal(result.estimatedNextShortfall, 50000);
  assert.equal(result.estimatedNextCash, 150000);
});
test('이전 월 가격을 참고할 때 기준 월과 지연 상태를 남긴다', () => {
  const investment = input(); investment.prices[1].price = null;
  const result = previewOrder(state, investment, 1, order('buy', 1));
  assert.equal(result.referencePriceMonth, 0);
  assert.equal(result.staleReference, true);
  assert.equal(result.referencePrice, 9500);
});
test('참고할 가격이 없으면 금액·잔액을 만들어내지 않는다', () => {
  const investment = input(); investment.prices = [];
  const result = previewOrder(state, investment, 0, order());
  assert.equal(result.referenceGross, null);
  assert.equal(result.estimatedNextCash, null);
  assert.equal(result.estimatedStatus, 'unavailable');
  assert.equal(result.nextExpense, 100000);
});
test('참고 조건의 현금 부족은 참고 거부로 표시한다', () => {
  const result = previewOrder(state, input(), 0, order('buy', 1000));
  assert.equal(result.estimatedStatus, 'rejected');
  assert.equal(result.estimatedReason, 'INSUFFICIENT_CASH');
});
