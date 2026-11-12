// Monthly paper-trading demo. Author: sxhlxxn.
const {compareWithTrading} = require('../src/monthly-trading.cjs');
const fixture = require('../../fixtures/paper-trading/monthly-run.json');
const result = compareWithTrading(fixture.state, fixture.investment, fixture.months);
console.log(JSON.stringify({dataKind: fixture.dataKind, engineVersion: result.invested.engineVersion,
  months: result.invested.monthlyResults.map(row => ({month: row.month, cash: row.cash, saved: row.saved,
    quantity: row.investment.quantity, investmentValue: row.investment.marketValue, total: row.total})),
  executions: result.invested.executions, investmentSummary: result.invested.summary,
  baselineSummary: result.baseline.summary, comparison: result.comparison}, null, 2));
