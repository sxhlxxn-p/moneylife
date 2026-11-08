// Server KRW calculation policy. Author: sxhlxxn / Student ID: 202439688.
const Decimal = require('decimal.js').clone({precision: 40, rounding: 4});
const engine = require('./index');
const ENGINE_VERSION = 'cash-savings-krw-v1';

function calculateSnapshot(state, months = 120) {
  const rates = new Map();
  function interest(balance, annualRate) {
    if (!rates.has(annualRate)) {
      rates.set(annualRate, new Decimal(annualRate).div(100).plus(1)
        .pow(new Decimal(1).div(12)).minus(1));
    }
    return new Decimal(balance).times(rates.get(annualRate)).toDecimalPlaces(0).toNumber();
  }
  const rows = engine.simulate({initial: state.initial, changes: state.changes,
    rateChanges: state.rateChanges, monthlySaving: state.monthlySaving,
    annualRate: state.annualRate, months, calculateInterest: interest});
  const monthlyResults = rows.map((row, month) => {
    if (!Object.values(row).every(Number.isSafeInteger)) throw new Error('Unsafe calculated amount');
    return {month, ...row};
  });
  const final = rows.at(-1);
  const goal = engine.goalMonth(rows, state.initial.target);
  const firstShortage = rows.findIndex(row => row.short > 0);
  return {
    engineVersion: ENGINE_VERSION,
    monthlyResults,
    summary: {
      goalMonth: goal < 0 ? null : goal,
      finalNetAssets: final.total,
      finalCash: final.cash,
      finalSaved: final.saved,
      firstShortageMonth: firstShortage < 0 ? null : firstShortage,
      shortageMonths: rows.filter(row => row.short > 0).length,
      unmetTotal: final.unpaid
    }
  };
}
module.exports = {calculateSnapshot, ENGINE_VERSION};
