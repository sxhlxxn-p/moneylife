/* News game interface. Author: sxhlxxn / Student ID: 202439688. */
const NewsGame = (() => {
  'use strict';
  const sessions = new Map();
  const storageKey = 'money-life-news-rounds-v1';
  const won = value => value.toLocaleString('ko-KR') + '원';
  const signed = value => (value > 0 ? '+' : '') + won(value);
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const node = el('button', text, 'btn'); node.type = 'button';
    node.addEventListener('click', action); return node;
  }
  function save(session) {
    try { localStorage.setItem(storageKey, JSON.stringify({id: session.id, choices: session.history.map(row => row.action)})); }
    catch { session.storageFailed = true; }
  }
  function start(host, seed, id, label) {
    let session = sessions.get(id);
    if (!session) {
      session = {id, label, seed: {...seed}, state: {...seed}, history: [], preview: null};
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved?.id === id && Array.isArray(saved.choices) && saved.choices.length <= NewsScenario.events.length) {
          for (const [i, action] of saved.choices.entries()) {
            const row = NewsScenario.play(session.state, NewsScenario.events[i].id, action);
            session.history.push(row); session.state = row.state;
          }
        }
      } catch { session.history = []; session.state = {...seed}; }
      sessions.set(id, session);
      if (sessions.size > 20) sessions.delete(sessions.keys().next().value);
    }
    draw(host, session);
  }
  function draw(host, session) {
    host.replaceChildren(); host.classList.add('news-game'); host.setAttribute('aria-label', '가상 경제 뉴스 게임');
    const index = session.history.length, event = NewsScenario.events[index];
    const header = el('div', undefined, 'news-topline');
    header.append(el('span', '가상 경제 뉴스 · 연습 전용', 'news-badge'), el('span', `${index} / ${NewsScenario.events.length} 라운드`, 'news-round'));
    host.append(header, el('h3', '세상이 바뀌면, 내 자산은?'),
      el('p', `${session.label}에서 출발한 별도 연습입니다. 실제 뉴스·예측이 아니며 원본 주문과 자산에 반영되지 않아요.`, 'paper-caption'));
    const metrics = el('div', undefined, 'news-metrics');
    for (const [title, value] of [['연습 순자산', won(NewsScenario.total(session.state))],
      ['처음 대비', signed(NewsScenario.total(session.state) - NewsScenario.total(session.seed))],
      ['연습 보유 주식', `${session.state.quantity}주`], ['미충족 생활비 누적', won(session.state.unpaid)]]) {
      const card = el('div'); card.append(el('small', title), el('strong', value)); metrics.append(card);
    }
    host.append(metrics);
    if (event) {
      const card = el('article', undefined, 'news-headline');
      card.append(el('div', `ROUND ${index + 1} · ${event.category}`, 'eyebrow'), el('h4', event.title),
        el('p', event.text), el('p', '이번 라운드의 가정: ' + event.reason, 'news-assumption'));
      host.append(card, el('p', '충격을 적용하기 전 가격으로 대응한 뒤, 가정한 가격 변화와 한 달의 소득·생활비를 계산해요. 매도 시점도 게임 규칙이며 실제 시장 체결을 뜻하지 않아요.', 'paper-caption'));
      const choices = el('div', undefined, 'news-choices');
      for (const [action, title] of Object.entries(NewsScenario.actions)) {
        const choice = button(title, () => { session.preview = action; draw(host, session); host.querySelector('.news-preview')?.focus(); });
        choice.classList.add('news-choice'); choice.setAttribute('aria-pressed', String(session.preview === action));
        if (session.state.quantity === 0 && action !== 'hold') choice.disabled = true;
        choices.append(choice);
      }
      host.append(choices);
      if (!session.state.quantity) host.append(el('p', '보유 주식이 없어 주가 손익은 0원이에요. 소득·생활비 변화는 반영됩니다.', 'paper-caption'));
      if (session.preview) {
        const preview = el('div', undefined, 'news-preview'); preview.tabIndex = -1;
        const results = Object.keys(NewsScenario.actions).map(action => NewsScenario.play(session.state, event.id, action));
        const chosen = results.find(row => row.action === session.preview);
        preview.append(el('h4', NewsScenario.actions[session.preview] + ' 선택 시 가정 결과'),
          el('p', `매도 ${chosen.sold}주 · 가정 가격 ${won(session.state.price)} → ${won(chosen.state.price)}`),
          el('p', `주가 변화 손익 ${signed(chosen.stockChange)} · 추가 생활비 ${signed(chosen.expenseChange)} · 소득 변화 ${signed(chosen.incomeChange)}`),
          el('p', `라운드 후 순자산 ${won(chosen.total)} · 시작 직전 대비 ${signed(chosen.difference)} · 이번 생활비 부족 ${won(chosen.shortfall)}`));
        const compare = el('div', undefined, 'news-alternatives');
        for (const row of results) compare.append(el('p', `${NewsScenario.actions[row.action]}: ${won(row.total)} · 주가 손익 ${signed(row.stockChange)}`));
        preview.append(compare, el('p', '같은 가정 아래 선택만 바꾼 비교입니다. 확률·실제 미래 수익은 계산하지 않아요.', 'paper-caption'));
        const confirm = button('이 선택으로 라운드 진행', () => {
          // Recompute from the current state; a preview never changes money.
          const result = NewsScenario.play(session.state, event.id, session.preview);
          session.history.push(result); session.state = result.state; session.preview = null; save(session); draw(host, session);
          host.querySelector('.news-headline h4, .news-finish')?.focus();
        }); confirm.classList.add('primary'); preview.append(confirm); host.append(preview);
      }
    } else {
      const finish = el('h4', '네 번의 뉴스, 나의 대응을 돌아보세요', 'news-finish'); finish.tabIndex = -1;
      host.append(finish, el('p', '하락 때 현금을 확보하는 선택과 반등 때 주식을 보유하는 선택의 차이를 비교해보세요. 결과는 공개된 충격 수치와 선택으로 정해지며 투자 실력을 평가하는 점수가 아닙니다.'));
    }
    if (session.history.length) {
      host.append(chart(session));
      const history = el('div', undefined, 'news-history'); history.setAttribute('aria-live', 'polite');
      history.append(el('h4', '나의 대응 기록'));
      for (const [i, row] of session.history.entries()) history.append(el('p', `${i + 1}. ${NewsScenario.events[i].title} / ${NewsScenario.actions[row.action]} · 주가 손익 ${signed(row.stockChange)} · 순자산 ${won(row.total)}`));
      host.append(history);
    }
    host.append(el('p', '연습 규칙: 1라운드=가상의 1개월 · 원 단위 반올림 · 저축·이자·세금·수수료·기존 예약 주문·일회성 지출 제외 · 저축 잔액 고정. 소득·생활비 충격은 해당 라운드에만 적용해요.', 'paper-caption'));
    const reset = button('뉴스 게임 처음부터', () => {
      session.state = {...session.seed}; session.history = []; session.preview = null; save(session); draw(host, session);
    }); host.append(reset);
    if (session.storageFailed) host.append(el('p', '브라우저 저장 공간이 없어 새로고침하면 뉴스 진행 기록이 사라질 수 있어요.', 'paper-caption'));
    host.querySelector('.news-headline h4')?.setAttribute('tabindex', '-1');
  }
  function chart(session) {
    const selected = [NewsScenario.total(session.seed), ...session.history.map(row => row.total)];
    let baseline = {...session.seed}; const held = [NewsScenario.total(baseline)];
    session.history.forEach((row, index) => {
      const result = NewsScenario.play(baseline, NewsScenario.events[index].id, 'hold');
      baseline = result.state; held.push(result.total);
    });
    const min = Math.min(...selected, ...held), max = Math.max(...selected, ...held), range = max - min || 1;
    const figure = el('figure', undefined, 'paper-chart');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 600 160'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '진행한 뉴스 라운드의 나의 선택과 계속 보유한 경우 순자산 비교');
    [held, selected].forEach((values, index) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', values.map((value, i) => `${i ? 'L' : 'M'}${12 + i / session.history.length * 576},${148 - (value - min) / range * 136}`).join(' '));
      path.setAttribute('class', index ? 'paper-line-invested' : 'paper-line-baseline'); svg.append(path);
    });
    figure.append(el('figcaption', '연습 순자산 · 보라: 나의 대응 / 회색 점선: 계속 보유'), svg,
      el('p', `같은 뉴스 조건의 현재 결과: 나의 대응 ${won(selected.at(-1))} / 계속 보유 ${won(held.at(-1))}`, 'paper-caption'));
    return figure;
  }
  function demo() {
    stop(); show('<div id="newsdemo"></div>');
    start($('newsdemo'), {cash: 500000, saved: 0, quantity: 50, price: 10000,
      income: 200000, expense: 100000, unpaid: 0}, 'demo-v1', '예시 포트폴리오 · 현금 50만원 / 주식 50만원');
  }
  return {start, demo};
})();
