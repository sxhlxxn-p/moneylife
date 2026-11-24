// Independent news-game-v1 expected values. Author: taekgi.
// Expected values come from docs/news-game.md rules, not engine output.
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../Engine/src/news-scenario.js');
const fixture = require('../fixtures/news-game/four-rounds.json');

test('수기 기대값 fixture가 현재 뉴스 게임 규칙 버전을 대상으로 한다', () => {
  assert.equal(fixture.version, game.replay(fixture.cases[0].seed, []).version);
  assert.ok(fixture.cases.length > 0);
});

for (const item of fixture.cases) {
  test(`수기 기대값과 4라운드 재생 결과가 일치한다: ${item.id}`, () => {
    const seed = structuredClone(item.seed);
    const result = game.replay(seed, item.choices);

    assert.deepEqual(seed, item.seed, '출발 자산을 변경하지 않는다');
    item.expected.history.forEach((expected, index) => {
      assert.deepEqual(result.history[index], expected, `${item.id} ${index + 1}라운드`);
      assert.deepEqual(result.heldHistory[index], item.expected.heldHistory[index],
        `${item.id} ${index + 1}라운드 계속 보유`);
    });
    assert.equal(result.history.length, item.expected.history.length);
    assert.equal(result.finalAssets, item.expected.finalAssets);
    assert.equal(result.heldAssets, item.expected.heldAssets);
  });
}

test('모든 라운드에서 순자산 변동은 주가 손익·소득·생활비·부족액 구성과 맞는다', () => {
  for (const item of fixture.cases) {
    let previous = item.seed;
    for (const row of game.replay(item.seed, item.choices).history) {
      const {state} = row;
      assert.equal(row.total, state.cash + state.saved + state.quantity * state.price - state.unpaid);
      assert.equal(row.difference, row.stockChange + row.income - row.expense, `${item.id} ${row.eventId}`);
      assert.equal(state.saved, previous.saved, '저축은 자동 인출하지 않는다');
      assert.ok(state.unpaid >= previous.unpaid, '미충족액은 자동 상환하지 않는다');
      previous = state;
    }
  }
});
