/* Financial transition rules. Author: sxhlxxn / Student ID: 202439688. */
const GameEngine = {
  goalMonth(path, target) {
    return path.findIndex(row => row.total >= target);
  },

  simulate({initial, changes = [], rateChanges = [], monthlySaving = 70,
    annualRate = 3, months = 120, calculateInterest = null}) {
    let cash = initial.cash;
    let saved = initial.saved;
    let unpaid = 0;
    const results = [{cash, saved, unpaid, total: cash + saved,
      income: initial.income, expense: initial.expense, short: 0}];

    for (let month = 1; month <= months; month++) {
      let income = initial.income;
      let expense = initial.expense;
      let saving = monthlySaving;
      let rate = annualRate;
      let once = 0;
      for (const change of changes) {
        if (month < change.m || (change.end != null && month > change.end)) continue;
        if (change.type === 'saving') saving = change.v;
        if (change.type === 'expense') expense += change.v;
        if (change.type === 'income') income += change.v;
        if (change.type === 'once' && month === change.m) once += change.v;
      }
      for (const change of rateChanges) if (month >= change.m) rate = change.v;
      if (calculateInterest) saved += calculateInterest(saved, rate);
      else saved *= Math.pow(1 + rate / 100, 1 / 12);

      const beforeTransfer = cash + income - expense - once;
      const short = Math.max(0, -beforeTransfer);
      unpaid += short;
      cash = Math.max(0, beforeTransfer);
      const transfer = Math.min(saving, cash);
      cash -= transfer;
      saved += transfer;
      results.push({cash, saved, unpaid, total: cash + saved - unpaid,
        income, expense: expense + once, short});
    }
    return results;
  }
};
if (typeof module !== 'undefined') module.exports = GameEngine;
