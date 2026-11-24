// Independent KRW ledger checks for cash-savings-krw-v1. Author: taekgi.
// Expected values come from the spec (Shared/simulation-contract.md), not engine output.
const test = require('node:test');
const assert = require('node:assert/strict');
const {calculateSnapshot, ENGINE_VERSION} = require('../Engine/src/snapshot.cjs');
const fixture = require('../fixtures/expected-results/krw-cases.json');

test('수기 기대값 fixture가 현재 원 단위 엔진 버전을 대상으로 한다', () => {
  assert.equal(fixture.engineVersion, ENGINE_VERSION);
  assert.ok(fixture.cases.length > 0);
});

for (const item of fixture.cases) {
  test(`수기 기대값과 월별 결과가 일치한다: ${item.id}`, () => {
    const input = structuredClone(item.state);
    const result = calculateSnapshot(input, item.months);

    assert.deepEqual(input, item.state, '입력을 변경하지 않는다');
    assert.equal(result.monthlyResults.length, item.months + 1);
    item.expected.monthlyResults.forEach((expected, month) => {
      assert.deepEqual(result.monthlyResults[month], expected, `${item.id} ${month}개월`);
    });
    assert.deepEqual(result.summary, item.expected.summary);
  });
}

test('모든 사례에서 총자산은 현금 + 저축 - 미충족액이고 금액은 정수 원이다', () => {
  for (const item of fixture.cases) {
    for (const row of calculateSnapshot(item.state, item.months).monthlyResults) {
      assert.equal(row.total, row.cash + row.saved - row.unpaid, `${item.id} ${row.month}개월`);
      assert.ok(row.cash >= 0, '현금은 음수가 되지 않는다');
      for (const value of Object.values(row)) assert.ok(Number.isSafeInteger(value));
    }
  }
});
