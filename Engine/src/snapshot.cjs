(function(root) {
const commonJS=typeof module !== 'undefined' && module.exports;
// Server KRW calculation policy.
const {createInterestCalculator} = (commonJS ? require('./interest.cjs') : root.MoneyLifeInterest);
const engine = (commonJS ? require('./index') : GameEngine);
const ENGINE_VERSION = 'cash-savings-krw-v1';

function calculateSnapshot(state, months = 120) {
  const interest = createInterestCalculator();
  const rows = engine.simulate({initial: state.initial, changes: state.changes,
    rateChanges: state.rateChanges, monthlySaving: state.monthlySaving,
    annualRate: state.annualRate, months, calculateInterest: interest});
  const monthlyResults = rows.map((row, month) => {
    if (!Object.values(row).every(Number.isSafeInteger)) throw new Error('Unsafe calculated amount');
    return {month, ...row};
  });
  return {engineVersion: ENGINE_VERSION, monthlyResults, summary: summarizePath(rows, state.initial.target)};
}

function summarizePath(rows, target) {
  const final = rows.at(-1);
  const goal = engine.goalMonth(rows, target);
  const firstShortage = rows.findIndex(row => row.short > 0);
  return {
    goalMonth: goal < 0 ? null : goal,
    finalNetAssets: final.total,
    finalCash: final.cash,
    finalSaved: final.saved,
    firstShortageMonth: firstShortage < 0 ? null : firstShortage,
    shortageMonths: rows.filter(row => row.short > 0).length,
    unmetTotal: final.unpaid
  };
}
const api={calculateSnapshot,summarizePath,ENGINE_VERSION};
if(commonJS) module.exports=api; else root.MoneyLifeSnapshot=api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
