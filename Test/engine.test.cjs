const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../Engine/src');
const fixture = require('../fixtures/expected-results/example-run.json');

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('기준 fixture를 120개월 동안 동일하게 재현한다', () => {
  const results = engine.simulate(fixture.plan);

  assert.equal(results.length, fixture.plan.months + 1);
  fixture.monthlyResults.forEach((expected, month) => {
    closeTo(results[month].total, expected.total);
  });
  closeTo(results.at(-1).total, fixture.summary.finalNetAssets);
});

test('0% 수익률에서는 월 소득-지출만큼 총자산이 변한다', () => {
  const [initial, month1] = engine.simulate({
    initial: {cash: 300, saved: 700, income: 250, expense: 160},
    monthlySaving: 70,
    annualRate: 0,
    months: 1
  });

  assert.equal(month1.total - initial.total, 90);
  assert.equal(month1.cash, 320);
  assert.equal(month1.saved, 770);
});

test('일회성 이벤트 비용은 지정 월에 한 번만 반영한다', () => {
  const results = engine.simulate({
    initial: {cash: 1000, saved: 0, income: 0, expense: 0},
    changes: [{type: 'once', v: 100, m: 2}],
    monthlySaving: 0,
    annualRate: 0,
    months: 3
  });

  assert.deepEqual(results.map(row => row.total), [1000, 1000, 900, 900]);
});

test('현금이 부족하면 부족액을 기록하고 자동 차입하지 않는다', () => {
  const results = engine.simulate({
    initial: {cash: 0, saved: 0, income: 50, expense: 100},
    monthlySaving: 20,
    annualRate: 0,
    months: 2
  });

  assert.equal(results[1].cash, 0);
  assert.equal(results[1].short, 50);
  assert.equal(results[2].unpaid, 100);
  assert.equal(results[2].total, -100);
});
