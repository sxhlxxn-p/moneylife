// Shared cash-flow and investment simulation. Author: sxhlxxn.
const engine = require('./index.js');
const {createInterestCalculator} = require('./interest.cjs');
const {calculateSnapshot, summarizePath} = require('./snapshot.cjs');
const {createAccount, executeOrder, valueAccount, applyCashFlow} = require('./paper-trading.cjs');

const ENGINE_VERSION = 'monthly-investment-krw-v2';

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INTEGER');
}
function rate(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail('INVALID_RATE');
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(value)) fail('INVALID_IDENTIFIER');
}

function financialState(state) {
  if (!state?.initial) fail('INVALID_STATE');
  for (const field of ['cash', 'saved', 'income', 'expense']) integer(state.initial[field], 0, 10000000000);
  integer(state.initial.target, 1, 10000000000);
  integer(state.monthlySaving, 0, 10000000000);
  rate(state.annualRate);
  const changes = state.changes === undefined ? [] : state.changes;
  const rateChanges = state.rateChanges === undefined ? [] : state.rateChanges;
  if (!Array.isArray(changes) || changes.length > 200 || !Array.isArray(rateChanges) || rateChanges.length > 200) fail('INVALID_STATE');
  for (const change of changes) {
    if (!['income', 'expense', 'saving', 'once'].includes(change?.type)) fail('INVALID_CHANGE');
    integer(change.m, 1, 120);
    integer(change.v, ['saving', 'once'].includes(change.type) ? 0 : -10000000000, 10000000000);
    if (change.end != null) integer(change.end, change.m, 120);
  }
  for (const change of rateChanges) { integer(change.m, 1, 120); rate(change.v); }
  for (let month = 1; month <= 120; month++) {
    for (const field of ['income', 'expense']) {
      const current = changes.filter(c => c.type === field && c.m <= month && (c.end == null || month <= c.end))
        .reduce((value, c) => value + c.v, state.initial[field]);
      integer(current);
    }
  }
  return {...state, changes, rateChanges};
}

function marketInput(investment) {
  if (!investment || typeof investment !== 'object') fail('INVALID_INVESTMENT');
  identifier(investment.symbol);
  identifier(investment.priceSeriesId);
  const prices = new Map();
  if (!Array.isArray(investment.prices) || investment.prices.length > 121) fail('INVALID_PRICES');
  for (const quote of investment.prices) {
    integer(quote.month, 0, 120);
    if (prices.has(quote.month)) fail('DUPLICATE_PRICE_MONTH');
    if (quote.price !== null) integer(quote.price, 1);
    if (typeof quote.tradable !== 'boolean') fail('INVALID_TRADABLE');
    prices.set(quote.month, {...quote, symbol: investment.symbol});
  }
  if (!Array.isArray(investment.orders) || investment.orders.length > 1000) fail('INVALID_ORDERS');
  const orders = new Map();
  for (const order of investment.orders) {
    identifier(order.id);
    identifier(order.symbol);
    if (order.symbol !== investment.symbol) fail('SYMBOL_MISMATCH');
    if (!['buy', 'sell'].includes(order.side)) fail('INVALID_SIDE');
    integer(order.quantity, 1);
    integer(order.submittedMonth, 0, 119);
    const normalized = {id: order.id, symbol: order.symbol, side: order.side,
      quantity: order.quantity, submittedMonth: order.submittedMonth};
    const previous = orders.get(order.id);
    if (previous && Object.keys(normalized).some(key => previous[key] !== normalized[key])) fail('ORDER_ID_CONFLICT');
    orders.set(order.id, normalized);
  }
  const costs = investment.costs === undefined ? {} : investment.costs;
  if (!costs || typeof costs !== 'object' || Array.isArray(costs)) fail('INVALID_COSTS');
  integer(costs.feeBps ?? 0, 0, 10000);
  integer(costs.sellTaxBps ?? 0, 0, 10000);
  return {prices, orders: [...orders.values()], costs};
}

function simulateWithTrading(input, investment, months = 120) {
  integer(months, 0, 120);
  const state = financialState(input);
  const market = marketInput(investment);
  let account = createAccount({symbol: investment.symbol, cash: state.initial.cash});
  let lastQuote = null;
  let priceMonth = null;
  const executions = [];
  function position(month, current) {
    if (current?.price != null) { lastQuote = current; priceMonth = month; }
    const valued = valueAccount(account, lastQuote);
    return {quantity: valued.quantity, costBasis: valued.costBasis, averageCost: valued.averageCost,
      marketValue: valued.marketValue, realizedPnl: valued.realizedPnl, unrealizedPnl: valued.unrealizedPnl,
      feesPaid: valued.feesPaid, taxesPaid: valued.taxesPaid,
      price: lastQuote?.price ?? null, priceMonth, stale: priceMonth !== month};
  }
  const initialPosition = position(0, market.prices.get(0));
  const rows = engine.simulate({initial: state.initial, monthlySaving: state.monthlySaving,
    annualRate: state.annualRate, changes: state.changes, rateChanges: state.rateChanges, months,
    calculateInterest: createInterestCalculator(),
    processInvestment({month, cash}) {
      // Cash comes from the financial engine after income, living costs and events.
      account = applyCashFlow(account, cash - account.cash);
      const quote = market.prices.get(month);
      const due = market.orders.filter(order => order.submittedMonth + 1 === month)
        .sort((a, b) => a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1);
      for (const order of due) {
        const {submittedMonth, ...intent} = order;
        const result = executeOrder(account, intent, quote, market.costs);
        account = result.account;
        executions.push({...result.execution, submittedMonth, executionMonth: month});
      }
      return {cash: account.cash, investment: position(month, quote)};
    }});
  rows[0] = {...rows[0], investment: initialPosition};
  for (const row of rows) {
    for (const key of ['cash', 'saved', 'unpaid', 'income', 'expense', 'short']) integer(row[key]);
    integer(row.total, -Number.MAX_SAFE_INTEGER);
  }
  // Reconcile the final month-end saving transfer; never add separate trading funds.
  account = applyCashFlow(account, rows.at(-1).cash - account.cash);
  const monthlyResults = rows.map((row, month) => ({month, ...row}));
  const final = rows.at(-1).investment;
  return {engineVersion: ENGINE_VERSION, priceSeriesId: investment.priceSeriesId,
    monthlyResults, summary: {...summarizePath(rows, state.initial.target),
      finalInvestmentValue: final.marketValue, finalRealizedPnl: final.realizedPnl, finalUnrealizedPnl: final.unrealizedPnl},
    executions, pendingOrders: market.orders.filter(order => order.submittedMonth === months), account};
}

function compareWithTrading(state, investment, months = 120) {
  const invested = simulateWithTrading(state, investment, months);
  const baseline = calculateSnapshot(financialState(state), months);
  const baseGoal = baseline.summary.goalMonth;
  const investmentGoal = invested.summary.goalMonth;
  const difference = invested.summary.finalNetAssets - baseline.summary.finalNetAssets;
  integer(difference, -Number.MAX_SAFE_INTEGER);
  return {baseline, invested, comparison: {
    finalAssetsDifference: difference,
    goalMonthDifference: baseGoal == null || investmentGoal == null ? null : investmentGoal - baseGoal,
    shortageMonthsDifference: invested.summary.shortageMonths - baseline.summary.shortageMonths}};
}

module.exports = {simulateWithTrading, compareWithTrading, ENGINE_VERSION};
