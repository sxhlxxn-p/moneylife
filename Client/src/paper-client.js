/* Monthly paper trading screen. Author: sxhlxxn / Student ID: 202439688. */
const PaperTrading = (() => {
  'use strict';
  const referenceKey = 'money-life-paper-plan';
  const pendingKey = 'money-life-paper-pending';
  let current = null;
  let sources = [];
  let pending = null;
  let reference = null;
  try {
    reference = localStorage.getItem(referenceKey);
    const saved = JSON.parse(localStorage.getItem(pendingKey));
    // Only replay the three allowed commands, never arbitrary stored URLs.
    if (saved && ['create', 'orders', 'advance'].includes(saved.action) &&
        typeof saved.body?.requestId === 'string' &&
        (saved.action === 'create' || /^[a-f0-9-]{36}$/.test(saved.parentId))) pending = saved;
  } catch {}
  const won = value => value.toLocaleString('ko-KR') + '원';
  const signed = value => (value > 0 ? '+' : '') + won(value);
  const goal = value => value === null ? '아직 미달성' : value === 0 ? '시작 시점' : `${value}개월차`;
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, action, disabled = false, primary = false) {
    const el = node('button', text, primary ? 'btn primary' : 'btn');
    el.type = 'button'; el.dataset.planAction = 'paper';
    el.dataset.paperDisabled = String(disabled); el.disabled = disabled || serverPlanBusy;
    el.addEventListener('click', action);
    return el;
  }
  function message(text) {
    const el = $('paperstatus');
    if (el) el.textContent = text;
  }
  function available() { return !serverPlanBusy && !pending; }
  function remember(bundle) {
    current = bundle;
    reference = bundle.plan.id;
    localStorage.setItem(referenceKey, reference);
  }
  function render() {
    const root = $('papercontent');
    root.replaceChildren();
    const controls = node('div', undefined, 'paper-toolbar');
    controls.append(button('새 투자 연습', () => setup(), Boolean(pending)),
      button('저장한 투자 연습', () => list(), Boolean(pending)));
    root.append(controls);
    if (pending) {
      const box = node('div', undefined, 'paper-warning');
      box.append(node('strong', '처리 결과를 확인해야 하는 요청이 있어요.'),
        node('p', '같은 요청 번호로 다시 확인합니다. 확인 전에는 다른 주문이나 월 진행을 할 수 없어요.'),
        button('같은 요청 다시 확인', () => sendPending(), false, true));
      root.append(box);
    }
    if (!current) {
      root.append(node('p', '재무 조건의 사본으로 투자 연습을 시작하거나, 저장한 투자 연습을 불러오세요.', 'paper-empty'));
      return;
    }
    const {plan, run} = current;
    const {invested, baseline, comparison} = run.result;
    const final = invested.monthlyResults.at(-1);
    const position = final.investment;
    const heading = node('div', undefined, 'paper-heading');
    heading.append(node('h3', plan.name), node('span', `${dates(plan.month)} · ${plan.month} / ${plan.source.lastMonth}개월`, 'paper-date'));
    root.append(heading, node('p', `${plan.source.symbol} · 가상 가격 · 수수료·세율 0 가정`, 'paper-caption'));
    const metrics = node('div', undefined, 'paper-metrics');
    for (const [label, value] of [
      ['사용 가능한 현금', won(final.cash)], ['보유 주식', `${position.quantity.toLocaleString('ko-KR')}주`],
      ['주식 평가액', won(position.marketValue)], ['평가 손익', signed(position.unrealizedPnl)],
      ['실현 손익', signed(position.realizedPnl)], ['투자 포함 순자산', won(final.total)]
    ]) {
      const card = node('div'); card.append(node('small', label), node('strong', value)); metrics.append(card);
    }
    root.append(metrics);
    const quote = position.price === null ? '가격 없음' : won(position.price);
    root.append(node('p', `현재 평가 가격 ${quote}${position.stale ? ' · 이전 유효 가격으로 평가 중' : ''}. 주문은 다음 달 가격으로 체결 여부가 결정됩니다.`, 'paper-caption'));
    const form = node('form', undefined, 'paper-order');
    const label = node('label', '주문 수량 · 주'); label.htmlFor = 'paperquantity';
    const input = node('input'); input.type = 'number'; input.id = 'paperquantity';
    input.min = '1'; input.max = '1000000000'; input.step = '1'; input.value = '1'; input.inputMode = 'numeric';
    input.dataset.planAction = 'paper-input';
    input.dataset.paperDisabled = String(Boolean(pending) || plan.month >= plan.source.lastMonth);
    input.disabled = serverPlanBusy || input.dataset.paperDisabled === 'true';
    const buy = button('매수 예약', () => submitOrder('buy'), Boolean(pending) || plan.month >= plan.source.lastMonth, true);
    const sell = button('매도 예약', () => submitOrder('sell'), Boolean(pending) || plan.month >= plan.source.lastMonth || position.quantity === 0);
    form.append(label, input, buy, sell);
    form.addEventListener('submit', event => { event.preventDefault(); submitOrder('buy'); });
    root.append(form);
    const time = node('div', undefined, 'paper-toolbar');
    time.append(button('다음 달로 +1개월', () => command('advance', {months: 1}), Boolean(pending) || plan.month >= plan.source.lastMonth, true),
      node('span', plan.month >= plan.source.lastMonth ? '가격 데이터의 마지막 달에 도착했어요.' : '생활비 → 주문 체결 → 저축 순서로 반영해요.', 'paper-caption'));
    root.append(time);
    const pendingList = node('div', undefined, 'paper-orders');
    pendingList.append(node('h4', '다음 달 체결 대기'));
    if (!invested.pendingOrders.length) pendingList.append(node('p', '대기 중인 주문이 없어요.'));
    for (const order of invested.pendingOrders) pendingList.append(node('p', `${order.side === 'buy' ? '매수' : '매도'} ${order.quantity.toLocaleString('ko-KR')}주 · ${dates(order.submittedMonth + 1)} 체결 예정`));
    root.append(pendingList, chart(invested.monthlyResults, baseline.monthlyResults));
    const compare = node('div', undefined, 'paper-comparison');
    compare.append(node('h4', '같은 조건에서 투자하지 않았다면?'),
      node('p', `현재 순자산 차이 ${signed(comparison.finalAssetsDifference)} · 투자 ${won(final.total)} / 비투자 ${won(baseline.summary.finalNetAssets)}`),
      node('p', `목표 최초 달성: 투자 ${goal(invested.summary.goalMonth)} / 비투자 ${goal(baseline.summary.goalMonth)}`),
      node('p', `현금 부족: 투자 ${invested.summary.shortageMonths}개월 / 비투자 ${baseline.summary.shortageMonths}개월 · 투자 계획 미충족 지출 ${won(final.unpaid)}`));
    root.append(compare);
    const tableBox = node('details', undefined, 'paper-history');
    tableBox.append(node('summary', `체결·거부 기록 ${invested.executions.length}건`));
    const scroll = node('div', undefined, 'run-table-scroll');
    const table = node('table'); const head = node('thead'); const tr = node('tr');
    for (const title of ['체결 월', '구분', '수량', '결과', '가격 / 거부 사유']) tr.append(node('th', title));
    head.append(tr); table.append(head);
    const body = node('tbody');
    const reasons = {INSUFFICIENT_CASH: '현금 부족', INSUFFICIENT_SHARES: '보유 주식 부족', PRICE_UNAVAILABLE: '가격 없음', NOT_TRADABLE: '거래 불가', COST_EXCEEDS_PROCEEDS: '비용이 매도 대금 초과', SYMBOL_MISMATCH: '종목 불일치'};
    for (const entry of [...invested.executions].reverse()) {
      const row = node('tr');
      for (const value of [dates(entry.executionMonth), entry.order.side === 'buy' ? '매수' : '매도', `${entry.order.quantity}주`, entry.status === 'filled' ? '체결' : '거부', entry.status === 'filled' ? won(entry.price) : reasons[entry.reason] || entry.reason]) row.append(node('td', value));
      body.append(row);
    }
    table.append(body); scroll.append(table); tableBox.append(scroll); root.append(tableBox);
  }
  function chart(invested, baseline) {
    const wrap = node('figure', undefined, 'paper-chart');
    const width = 640, height = 170, left = 10, top = 15;
    const values = [...invested, ...baseline].map(row => row.total);
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const lastMonth = invested.at(-1).month;
    const xy = row => `${left + row.month / Math.max(1, lastMonth) * (width - 2 * left)},${height - top - (row.total - min) / range * (height - 2 * top)}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `시작부터 ${lastMonth}개월까지 투자와 비투자 순자산 비교`);
    [baseline, invested].forEach((rows, i) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', rows.map((row, index) => (index ? 'L' : 'M') + xy(row)).join(' '));
      path.setAttribute('class', i ? 'paper-line-invested' : 'paper-line-baseline'); svg.append(path);
      const dot = document.createElementNS(svg.namespaceURI, 'circle');
      const [x, y] = xy(rows.at(-1)).split(','); dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', '4');
      dot.setAttribute('class', i ? 'paper-dot-invested' : 'paper-dot-baseline'); svg.append(dot);
    });
    wrap.append(node('figcaption', '지금까지의 순자산 · 보라: 투자 / 회색 점선: 비투자'), svg,
      node('p', `0 → ${lastMonth}개월 · 최저 ${won(min)} / 최고 ${won(max)}`, 'paper-caption'));
    return wrap;
  }
  async function open() {
    if (serverPlanBusy) return;
    stop(); $('paperlab').classList.remove('hidden');
    $('paperlab').scrollIntoView({behavior: 'smooth', block: 'start'});
    setPlanBusy(true); render(); message('투자 연습을 불러오는 중이에요.');
    try {
      sources = await apiRequest('market', '/series');
      if (reference && !current) {
        const plan = await apiRequest('paper-plans', '/' + encodeURIComponent(reference));
        const run = await apiRequest('paper-runs', '/' + encodeURIComponent(plan.runId));
        current = {plan, run};
      }
      message(pending ? '확인하지 못한 요청이 있어요. 같은 요청 다시 확인을 눌러주세요.' : current ? '저장된 투자 연습이에요. 본편의 재무 조건과 시간은 유지됩니다.' : '현재 여정 또는 예시 조건으로 시작할 수 있어요.');
    } catch (error) { message(error.message); }
    finally { setPlanBusy(false); render(); if (!current && !pending) setup(); }
  }
  function setup() {
    if (!available()) return;
    render();
    const box = node('div', undefined, 'paper-setup');
    box.append(node('h3', '어떤 조건으로 시작할까요?'), node('p', '현재 여정의 재무 조건은 사본으로 보관해요. 투자 연습에서 진행한 시간과 주문은 본편을 바꾸지 않아요.'));
    if (!sources.length) {
      box.append(node('p', '서버와 가격 목록을 확인한 후 다시 열어주세요.'), button('다시 연결', open));
    } else {
      const source = sources[0];
      box.append(node('p', `지원 기간은 시작 후 ${source.lastMonth}개월까지예요. 지금 ${month}개월차 여정은 ${month <= source.lastMonth ? '사본으로 시작할 수 있어요.' : '지원 기간을 지났어요. 예시 조건으로 체험해주세요.'}`),
        button('현재 여정의 사본으로 시작', () => create(false), month > source.lastMonth, true),
        button('예시 조건으로 체험', () => create(true)),
        node('p', '예시: 현금 100만 원 · 월 소득 20만 원 · 생활비 10만 원 · 저축 5만 원 · 목표 125만 원 · 저축 금리 0%.', 'paper-caption'));
    }
    $('papercontent').append(box);
  }
  async function create(example) {
    if (!available() || !sources.length) return;
    stop();
    let state = MoneyLifePlanState.encode({start, month, baseSaving, baseRate, mods, rateMods, logs, events});
    if (example) state = {...state, initial: {...state.initial, name: '나의 첫 투자 연습', cash: 1000000, saved: 0, income: 200000, expense: 100000, target: 1250000}, monthlySaving: 50000, annualRate: 0, month: 0, changes: [], rateChanges: [], logs: [], events: []};
    setPlanBusy(true); render(); message('조건의 사본을 보관하는 중이에요.');
    try {
      // No active financial plan ID is changed by this independent copy.
      const plan = await planRequest('', {method: 'POST', body: JSON.stringify({state})});
      pending = {action: 'create', body: {requestId: crypto.randomUUID(), planId: plan.id, priceSeriesId: sources[0].priceSeriesId}};
      localStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch (error) { pending = null; message(error.message); }
    finally { setPlanBusy(false); render(); }
    if (pending) await sendPending();
  }
  function submitOrder(side) {
    if (!available() || !current) return;
    const input = $('paperquantity');
    const quantity = Number(input.value);
    if (input.value.trim() === '' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000000) {
      message('주문 수량은 1~1,000,000,000 사이의 정수로 입력해주세요.'); input.focus(); return;
    }
    command('orders', {side, quantity});
  }
  async function command(action, fields) {
    if (!available() || !current) return;
    pending = {action, parentId: current.plan.id, body: {requestId: crypto.randomUUID(), ...fields}};
    try { localStorage.setItem(pendingKey, JSON.stringify(pending)); }
    catch { pending = null; message('중복 요청을 막으려면 이 기기의 저장 공간을 사용할 수 있어야 해요.'); return; }
    await sendPending();
  }
  async function sendPending() {
    if (serverPlanBusy || !pending) return;
    setPlanBusy(true); render(); message('서버에서 처리 결과를 확인하는 중이에요.');
    const request = pending;
    try {
      const path = request.action === 'create' ? '' : '/' + encodeURIComponent(request.parentId) + '/' + request.action;
      const result = await apiRequest('paper-plans', path, {method: 'POST', body: JSON.stringify(request.body)});
      // Store the returned reference before clearing the recoverable command.
      remember(result);
      localStorage.removeItem(pendingKey); pending = null;
      message(request.action === 'orders' ? '주문을 예약했어요. 다음 달로 진행하면 체결 여부를 확인할 수 있어요.' : request.action === 'advance' ? '월 진행 결과와 체결 기록을 저장했어요.' : '투자 연습을 시작했어요. 모든 금액은 원 단위입니다.');
      $('paperentry-status').textContent = `${result.plan.name} · ${result.plan.month}개월차 저장됨`;
    } catch (error) {
      // A definite validation failure can be corrected. Uncertain transport/server failures keep the ID.
      if ([400, 403, 409, 422].includes(error.status)) {
        localStorage.removeItem(pendingKey); pending = null;
      }
      message(error.message);
    } finally { setPlanBusy(false); render(); }
  }
  async function list(offset = 0) {
    if (!available()) return;
    setPlanBusy(true); render(); message('저장한 투자 연습을 불러오는 중이에요.');
    try {
      const plans = await apiRequest('paper-plans', `?limit=20&offset=${offset}`);
      const box = node('div', undefined, 'saved-plans');
      box.append(node('h3', '저장한 투자 연습'), node('p', '주문·월 진행마다 보관된 시점이에요. 이전 시점에서 다른 선택을 시작할 수 있어요.'));
      if (!plans.length) box.append(node('p', '저장된 투자 연습이 없어요.'));
      for (const plan of plans) box.append(button(`${plan.name} · ${plan.month}개월 · ${new Date(plan.createdAt / 1000).toLocaleString('ko-KR')}`, () => load(plan.id)));
      const pages = node('div', undefined, 'paper-toolbar');
      if (offset) pages.append(button('이전 목록', () => list(Math.max(0, offset - 20))));
      if (plans.length === 20) pages.append(button('다음 목록', () => list(offset + 20)));
      box.append(pages);
      $('papercontent').append(box); message('불러올 시점을 선택해주세요.');
    } catch (error) { message(error.message); }
    finally { setPlanBusy(false); }
  }
  async function load(id) {
    if (!available()) return;
    setPlanBusy(true); message('저장한 결과를 확인하는 중이에요.');
    try {
      const plan = await apiRequest('paper-plans', '/' + encodeURIComponent(id));
      const run = await apiRequest('paper-runs', '/' + encodeURIComponent(plan.runId));
      remember({plan, run}); message('저장된 결과를 불러왔어요. 본편 여정은 유지됩니다.');
      $('paperentry-status').textContent = `${plan.name} · ${plan.month}개월차 저장됨`;
    } catch (error) { message(error.message); }
    finally { setPlanBusy(false); render(); }
  }
  return {open};
})();
