/* Plan unit conversion. Author: sxhlxxn. */
(function (root) {
  'use strict';
  const MONEY_FIELDS = ['cash', 'saved', 'income', 'expense', 'target'];

  function toWon(value) {
    if (!Number.isFinite(value)) throw new Error('유효하지 않은 금액입니다.');
    const result = Math.round(value * 10000);
    if (!Number.isSafeInteger(result)) throw new Error('금액 범위를 확인해주세요.');
    return result;
  }

  function fromWon(value) {
    if (!Number.isSafeInteger(value)) throw new Error('저장된 금액 형식이 올바르지 않습니다.');
    return value / 10000;
  }

  function encode(game) {
    const initial = {...game.start};
    for (const field of MONEY_FIELDS) initial[field] = toWon(initial[field]);
    return {
      startMonth: '2026-10',
      months: 120,
      initial,
      monthlySaving: toWon(game.baseSaving),
      annualRate: game.baseRate,
      month: game.month,
      changes: game.mods.map(({type, v, m, end}) => ({type, v: toWon(v), m, end: end ?? null})),
      rateChanges: game.rateMods.map(({m, v}) => ({m, v})),
      logs: game.logs.map(({month, text}) => ({month, text})),
      events: [...game.events]
    };
  }

  function decode(plan) {
    if (plan.schemaVersion !== 1 || plan.goalBasis !== 'net_assets') {
      throw new Error('지원하지 않는 계획 형식입니다.');
    }
    const s = plan.state;
    if (s.startMonth !== '2026-10' || s.months !== 120 || !Number.isInteger(s.month) || s.month < 0 || s.month > 120) {
      throw new Error('저장된 진행 기간을 확인할 수 없습니다.');
    }
    const start = {...s.initial};
    for (const field of MONEY_FIELDS) start[field] = fromWon(start[field]);
    const baseSaving = fromWon(s.monthlySaving);
    const mods = s.changes.map(x => ({...x, v: fromWon(x.v)}));
    const rateMods = s.rateChanges.map(x => ({...x}));
    // Restore the currently effective slider settings as well as the full history.
    let saving = baseSaving;
    let rate = s.annualRate;
    for (const x of mods) {
      if (x.type === 'saving' && x.m <= s.month + 1 && (x.end == null || s.month + 1 <= x.end)) saving = x.v;
    }
    for (const x of rateMods) if (x.m <= s.month + 1) rate = x.v;
    return {
      start, month: s.month, baseSaving, baseRate: s.annualRate, saving, rate, mods, rateMods,
      logs: s.logs.map(x => ({...x})), events: [...s.events]
    };
  }

  const api = {encode, decode};
  if (typeof module !== 'undefined') module.exports = api;
  else root.MoneyLifePlanState = api;
})(typeof window === 'undefined' ? globalThis : window);
