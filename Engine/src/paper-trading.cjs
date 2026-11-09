// Single-stock paper trading. Author: sxhlxxn / Student ID: 202439688.
const Decimal = require('decimal.js').clone({precision: 40, rounding: 4});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail('INVALID_INTEGER');
  return value === 0 ? 0 : value;
}

function won(value) {
  return integer(new Decimal(value).toDecimalPlaces(0).toNumber(), -Number.MAX_SAFE_INTEGER);
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(value)) fail('INVALID_IDENTIFIER');
  return value;
}

function validateAccount(account) {
  if (!account || typeof account !== 'object') fail('INVALID_ACCOUNT');
  identifier(account.symbol);
  for (const key of ['initialCash', 'cash', 'quantity', 'costBasis', 'feesPaid', 'taxesPaid']) integer(account[key]);
  integer(account.realizedPnl, -Number.MAX_SAFE_INTEGER);
  integer(account.netCashFlow ?? 0, -Number.MAX_SAFE_INTEGER);
  if (!Array.isArray(account.executions) || (account.quantity === 0 && account.costBasis !== 0) ||
      !new Decimal(account.cash).plus(account.costBasis).equals(new Decimal(account.initialCash)
        .plus(account.netCashFlow ?? 0).plus(account.realizedPnl))) {
    fail('INVALID_ACCOUNT');
  }
}

function createAccount({symbol, cash}) {
  const initialCash = integer(cash);
  return {symbol: identifier(symbol), initialCash, cash: initialCash, quantity: 0,
    costBasis: 0, realizedPnl: 0, netCashFlow: 0, feesPaid: 0, taxesPaid: 0, executions: []};
}

function applyCashFlow(account, delta) {
  validateAccount(account);
  integer(delta, -Number.MAX_SAFE_INTEGER);
  const cash = won(new Decimal(account.cash).plus(delta));
  if (cash < 0) fail('INSUFFICIENT_CASH_FLOW');
  const next = {...account, cash,
    netCashFlow: won(new Decimal(account.netCashFlow ?? 0).plus(delta))};
  validateAccount(next);
  return next;
}

function validPrice(quote) {
  return quote && Number.isSafeInteger(quote.price) && quote.price > 0;
}

function calculateOrderAmounts(side, quantity, price, costs = {}) {
  if (!['buy', 'sell'].includes(side)) fail('INVALID_SIDE');
  integer(quantity, 1); integer(price, 1);
  const feeBps = integer(costs.feeBps ?? 0);
  const sellTaxBps = integer(costs.sellTaxBps ?? 0);
  if (feeBps > 10000 || sellTaxBps > 10000) fail('INVALID_COST_RATE');
  const gross = won(new Decimal(price).times(quantity));
  const fee = won(new Decimal(gross).times(feeBps).div(10000));
  const tax = side === 'sell' ? won(new Decimal(gross).times(sellTaxBps).div(10000)) : 0;
  const cashDelta = side === 'buy' ? -won(new Decimal(gross).plus(fee)) : won(new Decimal(gross).minus(fee).minus(tax));
  return {gross, fee, tax, cashDelta};
}

function executeOrder(account, order, quote, costs = {}) {
  validateAccount(account);
  if (!order || typeof order !== 'object') fail('INVALID_ORDER');
  if (!costs || typeof costs !== 'object') fail('INVALID_COST_RATE');
  const intent = {id: identifier(order.id), symbol: identifier(order.symbol),
    side: order.side, quantity: integer(order.quantity, 1)};
  if (!['buy', 'sell'].includes(intent.side)) fail('INVALID_SIDE');
  const previous = account.executions.find(item => item.order.id === intent.id);
  if (previous) {
    if (Object.keys(intent).some(key => previous.order[key] !== intent[key])) fail('ORDER_ID_CONFLICT');
    return {account, execution: previous};
  }
  const feeBps = integer(costs.feeBps ?? 0);
  const sellTaxBps = integer(costs.sellTaxBps ?? 0);
  if (feeBps > 10000 || sellTaxBps > 10000) fail('INVALID_COST_RATE');

  function rejected(reason) {
    const execution = {order: intent, status: 'rejected', reason};
    return {account: {...account, executions: [...account.executions, execution]}, execution};
  }
  if (intent.symbol !== account.symbol || (quote && quote.symbol !== account.symbol)) return rejected('SYMBOL_MISMATCH');
  if (!validPrice(quote)) return rejected('PRICE_UNAVAILABLE');
  if (quote.tradable !== true) return rejected('NOT_TRADABLE');

  const {gross, fee, tax, cashDelta: quotedCashDelta} = calculateOrderAmounts(intent.side, intent.quantity, quote.price, {feeBps, sellTaxBps});
  let cashDelta, costDelta, realizedDelta = 0;
  if (intent.side === 'buy') {
    const payment = -quotedCashDelta;
    if (payment > account.cash) return rejected('INSUFFICIENT_CASH');
    cashDelta = -payment;
    costDelta = payment;
  } else {
    if (intent.quantity > account.quantity) return rejected('INSUFFICIENT_SHARES');
    cashDelta = quotedCashDelta;
    if (cashDelta < 0) return rejected('COST_EXCEEDS_PROCEEDS');
    const removedCost = intent.quantity === account.quantity ? account.costBasis :
      won(new Decimal(account.costBasis).times(intent.quantity).div(account.quantity));
    costDelta = -removedCost;
    realizedDelta = won(new Decimal(cashDelta).minus(removedCost));
  }
  const next = {...account,
    cash: won(new Decimal(account.cash).plus(cashDelta)),
    quantity: integer(account.quantity + (intent.side === 'buy' ? intent.quantity : -intent.quantity)),
    costBasis: won(new Decimal(account.costBasis).plus(costDelta)),
    realizedPnl: won(new Decimal(account.realizedPnl).plus(realizedDelta)),
    feesPaid: won(new Decimal(account.feesPaid).plus(fee)),
    taxesPaid: won(new Decimal(account.taxesPaid).plus(tax))};
  const execution = {order: intent, status: 'filled', price: quote.price, gross, fee, tax,
    feeBps, sellTaxBps, cashDelta, removedCost: costDelta < 0 ? -costDelta : 0, realizedPnl: realizedDelta,
    cashAfter: next.cash, quantityAfter: next.quantity, costBasisAfter: next.costBasis};
  next.executions = [...account.executions, execution];
  validateAccount(next);
  return {account: next, execution};
}

function valueAccount(account, quote) {
  validateAccount(account);
  if (account.quantity && quote && quote.symbol !== account.symbol) fail('SYMBOL_MISMATCH');
  if (account.quantity && !validPrice(quote)) fail('PRICE_UNAVAILABLE');
  const marketValue = account.quantity ? won(new Decimal(quote.price).times(account.quantity)) : 0;
  const unrealizedPnl = won(new Decimal(marketValue).minus(account.costBasis));
  return {cash: account.cash, quantity: account.quantity, costBasis: account.costBasis,
    averageCost: account.quantity ? new Decimal(account.costBasis).div(account.quantity).toFixed(6) : null,
    marketValue, realizedPnl: account.realizedPnl, unrealizedPnl,
    totalPnl: won(new Decimal(account.realizedPnl).plus(unrealizedPnl)),
    totalAssets: won(new Decimal(account.cash).plus(marketValue)),
    feesPaid: account.feesPaid, taxesPaid: account.taxesPaid};
}

module.exports = {calculateOrderAmounts, createAccount, executeOrder, valueAccount, applyCashFlow};
