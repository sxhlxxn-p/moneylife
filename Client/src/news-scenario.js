/* Fictional news round rules. Author: sxhlxxn / Student ID: 202439688. */
const NewsScenario = (() => {
  'use strict';
  // These are authored teaching assumptions, never inferred from news or market data.
  const events = [
    {id: 'rates', category: '통화 정책', title: '금리 인상 가능성, 시장의 긴장',
      text: '자금 조달 부담이 커지는 상황을 가정합니다. 다음 라운드의 주가 하락에 어떻게 대비할까요?',
      priceBps: -1200, expenseBps: 0, incomeBps: 0, reason: '주가 −12% · 생활비·소득 유지'},
    {id: 'energy', category: '국제 경제', title: '유가 급등, 생활비까지 흔들리다',
      text: '에너지 비용이 오르는 상황입니다. 주식 평가액과 이번 라운드 생활비에 동시에 충격을 줍니다.',
      priceBps: -800, expenseBps: 1000, incomeBps: 0, reason: '주가 −8% · 이번 생활비 +10%'},
    {id: 'recovery', category: '경기 회복', title: '경기 부양 기대, 반등하는 시장',
      text: '정책 기대가 주가 회복으로 이어지는 상황입니다. 현금 보유와 주식 보유의 차이를 확인하세요.',
      priceBps: 1500, expenseBps: 0, incomeBps: 0, reason: '주가 +15% · 생활비·소득 유지'},
    {id: 'employment', category: '고용 변화', title: '경기 둔화, 나의 소득에도 영향이?',
      text: '근무 시간이나 부수입이 줄었다고 가정합니다. 소득 감소가 현금 여유에 미치는 영향을 확인하세요.',
      priceBps: -500, expenseBps: 0, incomeBps: -2000, reason: '주가 −5% · 이번 소득 −20%'}
  ].map(item => Object.freeze(item));
  Object.freeze(events);
  const actions = Object.freeze({hold: '보유 유지', half: '절반 매도', sell: '전량 매도'});
  function integer(value, min = 0) {
    if (!Number.isSafeInteger(value) || value < min) throw new Error('INVALID_SCENARIO_VALUE');
    return value === 0 ? 0 : value;
  }
  function checked(value) {
    integer(value.cash); integer(value.saved); integer(value.quantity);
    integer(value.price, 1); integer(value.income); integer(value.expense); integer(value.unpaid);
    integer(value.quantity * value.price); integer(value.cash + value.saved + value.quantity * value.price);
  }
  function scaled(value, bps) {
    const numerator = BigInt(value) * BigInt(10000 + bps);
    return integer(Number((numerator + 5000n) / 10000n));
  }
  function total(state) { return integer(state.cash + state.saved + state.quantity * state.price - state.unpaid, -Number.MAX_SAFE_INTEGER); }
  function play(state, eventId, action) {
    checked(state);
    const event = events.find(item => item.id === eventId);
    if (!event || !Object.hasOwn(actions, action)) throw new Error('INVALID_SCENARIO_CHOICE');
    const sold = action === 'sell' ? state.quantity : action === 'half' ? Math.floor(state.quantity / 2) : 0;
    const proceeds = integer(sold * state.price);
    const price = Math.max(1, scaled(state.price, event.priceBps));
    const income = scaled(state.income, event.incomeBps);
    const expense = scaled(state.expense, event.expenseBps);
    const available = integer(state.cash + proceeds + income);
    const shortfall = Math.max(0, expense - available);
    const next = {...state, cash: Math.max(0, available - expense), quantity: state.quantity - sold,
      price, unpaid: integer(state.unpaid + shortfall)};
    checked(next);
    return {state: next, eventId, action, sold, proceeds, income, expense, shortfall,
      stockChange: integer(next.quantity * (price - state.price), -Number.MAX_SAFE_INTEGER),
      incomeChange: income - state.income, expenseChange: expense - state.expense,
      total: total(next), difference: total(next) - total(state)};
  }
  return Object.freeze({events, actions, play, total});
})();
if (typeof module !== 'undefined') module.exports = NewsScenario;
