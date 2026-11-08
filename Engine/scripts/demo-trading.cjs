// Synthetic calculation demo. Author: sxhlxxn / Student ID: 202439688.
const {createAccount, executeOrder, valueAccount} = require('../src/paper-trading.cjs');
const fixture = require('../../fixtures/paper-trading/single-stock.json');
let account = createAccount({symbol: fixture.symbol, cash: fixture.initialCash});
for (const step of fixture.steps) {
  const result = executeOrder(account, step.order, step.quote);
  account = result.account;
  console.log(JSON.stringify(result.execution, null, 2));
}
console.log(JSON.stringify({dataKind: fixture.dataKind,
  valuation: valueAccount(account, fixture.steps.at(-1).quote)}, null, 2));
