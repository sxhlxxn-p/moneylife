// News shock arithmetic and isolation. Author: sxhlxxn / Student ID: 202439688.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const game = require('../Client/src/news-scenario.js');
const seed = {cash: 500000, saved: 0, quantity: 50, price: 10000, income: 200000, expense: 100000, unpaid: 0};
test('금리 충격의 손익과 월 현금흐름을 분리하고 원본을 보존한다', () => {
  const input = structuredClone(seed); const row = game.play(input, 'rates', 'hold');
  assert.equal(row.stockChange, -60000); assert.equal(row.total, 1040000);
  assert.equal(row.difference, 40000); assert.equal(row.state.cash, 600000);
  assert.deepEqual(input, seed);
});
test('같은 뉴스에서 보유·절반·전량 매도의 주가 손익을 비교한다', () => {
  const rows = ['hold', 'half', 'sell'].map(action => game.play(seed, 'rates', action));
  assert.deepEqual(rows.map(row => row.stockChange), [-60000, -30000, 0]);
  assert.deepEqual(rows.map(row => row.total), [1040000, 1070000, 1100000]);
  assert.equal(game.play({...seed, quantity: 5}, 'rates', 'half').sold, 2);
});
test('유가·고용 충격은 한 라운드에만 적용하며 기초 월 조건을 누적 변경하지 않는다', () => {
  const energy = game.play(seed, 'energy', 'hold');
  assert.equal(energy.expenseChange, 10000); assert.equal(energy.state.expense, 100000);
  const jobs = game.play(energy.state, 'employment', 'hold');
  assert.equal(jobs.income, 160000); assert.equal(jobs.expense, 100000);
  assert.equal(jobs.state.income, 200000);
});
test('현금 부족을 기록하고 저축·주식을 자동 청산하지 않는다', () => {
  const row = game.play({...seed, cash: 0, saved: 300000, income: 0}, 'energy', 'hold');
  assert.equal(row.shortfall, 110000); assert.equal(row.state.unpaid, 110000);
  assert.equal(row.state.saved, 300000); assert.equal(row.state.quantity, 50);
  assert.equal(row.total, 650000);
});
test('반등 시나리오에서 현금 전환의 기회비용과 무보유 손익을 확인한다', () => {
  assert.equal(game.play(seed, 'recovery', 'hold').stockChange, 75000);
  assert.equal(game.play(seed, 'recovery', 'sell').stockChange, 0);
  assert.equal(game.play({...seed, quantity: 0}, 'rates', 'hold').stockChange, 0);
});
test('원 단위 반올림과 잘못된 입력·오버플로를 검사한다', () => {
  assert.equal(game.play({...seed, price: 10005}, 'recovery', 'hold').state.price, 11506);
  assert.throws(() => game.play(seed, 'unknown', 'hold'));
  assert.throws(() => game.play(seed, 'rates', 'buy'));
  assert.throws(() => game.play({...seed, quantity: 0.5}, 'rates', 'hold'));
  assert.throws(() => game.play({...seed, cash: Number.MAX_SAFE_INTEGER}, 'rates', 'sell'));
});
