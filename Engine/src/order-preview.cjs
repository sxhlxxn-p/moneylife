// Price-only assumption for order review. Author: sxhlxxn / Student ID: 202439688.
const {simulateWithTrading} = require('./monthly-trading.cjs');
const {calculateOrderAmounts} = require('./paper-trading.cjs');

function previewOrder(state, investment, month, order) {
  if (!Number.isInteger(month) || month < 0 || month >= 120) throw new Error('INVALID_PERIOD');
  // The private future price series must never enter the hypothetical calculation.
  const visible = {...investment, prices: investment.prices.filter(q => q.month <= month),
    orders: investment.orders.filter(o => o.submittedMonth <= month)};
  const current = simulateWithTrading(state, visible, month);
  const now = current.monthlyResults.at(-1);
  const position = now.investment;
  const reservedSellQuantity = current.pendingOrders.filter(o => o.side === 'sell').reduce((n, o) => n + o.quantity, 0);
  const amounts = position.price === null ? null : calculateOrderAmounts(order.side, order.quantity, position.price, investment.costs);
  const hypothesis = {...visible, prices: [...visible.prices, {month: month + 1, price: position.price, tradable: true}],
    orders: [...visible.orders, {...order, symbol: investment.symbol, submittedMonth: month}]};
  const assumed = simulateWithTrading(state, hypothesis, month + 1);
  const next = assumed.monthlyResults.at(-1);
  const execution = assumed.executions.find(e => e.order.id === order.id);
  return {basis: 'current-price-assumption', referencePrice: position.price,
    referencePriceMonth: position.priceMonth, staleReference: position.stale,
    referenceGross: amounts?.gross ?? null, referenceFee: amounts?.fee ?? null,
    referenceTax: amounts?.tax ?? null, referenceCashChange: amounts?.cashDelta ?? null,
    currentCash: now.cash, currentQuantity: position.quantity, reservedSellQuantity,
    availableSellQuantity: position.quantity - reservedSellQuantity,
    existingPendingCount: current.pendingOrders.length,
    nextIncome: next.income, nextExpense: next.expense,
    estimatedNextCash: position.price === null ? null : next.cash,
    estimatedNextSaved: position.price === null ? null : next.saved,
    estimatedNextShortfall: next.short,
    estimatedStatus: position.price === null ? 'unavailable' : execution.status,
    estimatedReason: execution.status === 'rejected' ? execution.reason : null};
}
module.exports = {previewOrder};
