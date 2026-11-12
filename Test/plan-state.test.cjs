// Persistence unit contract. Author: sxhlxxn.
const test = require('node:test');
const assert = require('node:assert/strict');
const codec = require('../Client/src/plan-state');
const engine = require('../Engine/src');

test('원 단위 서버 저장과 복원이 월별 자산 경로를 보존한다', () => {
  const game = {
    start: {name: '독립', age: 25, avatar: '🌱', cash: 1000, saved: 0, income: 250, expense: 160, target: 2000},
    month: 13, baseSaving: 70, baseRate: 3,
    mods: [{type: 'expense', v: 30, m: 13}, {type: 'once', v: 300, m: 13}, {type: 'saving', v: 60, m: 14}],
    rateMods: [{m: 14, v: 2.5}], events: new Set([12]), logs: [{month: 12, text: '독립 선택'}]
  };
  const state = codec.encode(game);
  assert.equal(state.initial.cash, 10000000);
  assert.equal(state.changes[0].v, 300000);
  assert.equal(state.monthlySaving, 700000);
  const restored = codec.decode({schemaVersion: 1, goalBasis: 'net_assets', state});
  const run = game => engine.simulate({initial: game.start, changes: game.mods, rateChanges: game.rateMods, monthlySaving: game.baseSaving, annualRate: game.baseRate});
  assert.deepEqual(run(restored), run(game));
  assert.equal(restored.saving, 60);
  assert.equal(restored.rate, 2.5);
  assert.deepEqual(restored.events, [12]);
  assert.deepEqual(restored.logs, game.logs);
});

test('총자산 목표는 발표 사례 12개월과 22개월을 재현한다', () => {
  const plan = {initial: {cash: 1000, saved: 0, income: 250, expense: 160}, monthlySaving: 70, annualRate: 0, months: 24};
  const base = engine.simulate(plan);
  const branch = engine.simulate({...plan, changes: [{type: 'expense', v: 30, m: 1}, {type: 'once', v: 300, m: 1}]});
  assert.equal(engine.goalMonth(base, 2000), 12);
  assert.equal(engine.goalMonth(branch, 2000), 22);
  assert.equal(base.at(-1).total, 3160);
  assert.equal(branch.at(-1).total, 2140);
  assert.equal(engine.goalMonth(base, 1000), 0);
  assert.equal(engine.goalMonth(base, 10000), -1);
});

test('지원하지 않는 스냅샷은 복원하지 않는다', () => {
  assert.throws(() => codec.decode({schemaVersion: 99, goalBasis: 'net_assets'}));
  assert.throws(() => codec.decode({schemaVersion: 1, goalBasis: 'net_assets', state: {startMonth: '2027-01'}}));
});
