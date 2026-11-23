let EV = {};
let LifeEventCatalog;
async function loadLifeEvents() {
  const response = await fetch("/life-events.json");
  if (!response.ok) throw new Error("생애 이벤트 규칙을 불러오지 못했어요.");
  const catalog = await response.json();
  if (catalog.version !== "life-events-v1" || catalog.unit !== "KRW")
    throw new Error("생애 이벤트 규칙 버전을 확인해주세요.");
  LifeEventCatalog = catalog;
  EV = Object.fromEntries(catalog.events.map((event) => [event.month, event]));
}
function eventMods(m) {
  const rule = EV[m].rule;
  if (rule.kind === "effects")
    return rule.effects.map((effect) => ({
      type: effect.type,
      v: effect.value / 10000,
      m: JourneyStore.current.month + 1,
      end: null,
    }));
  const path = simulate();
  return Array.from(
    { length: Math.min(rule.months, 120 - JourneyStore.current.month) },
    (_, i) => ({
      type: "income",
      v: -path[JourneyStore.current.month + i + 1].income,
      m: JourneyStore.current.month + i + 1,
      end: JourneyStore.current.month + i + 1,
    }),
  );
}
function eventPreview(m) {
  if (JourneyStore.current.events.has(m)) return;
  const event = EV[m];
  const reference = simulate(),
    candidate = simulate([...JourneyStore.current.mods, ...eventMods(m)]),
    next = JourneyStore.current.month + 1;
  show(
    `<header class="event-scene-header"><div class="event-scene-icon" aria-hidden="true">${escapeHtml(event.emoji)}</div><div><div class="game-kicker">${dates(JourneyStore.current.month)} · 인생의 갈림길</div><h2>${escapeHtml(event.title)}</h2></div></header>
    <p>${escapeHtml(event.body)}</p>
    <div class="game-event-forecast"><span>지금 계획의 목표 도달<strong>${gameGoalLabel(reference)}</strong></span><span aria-hidden="true">→</span><span>첫 번째 선택을 한다면<strong>${gameGoalLabel(candidate)}</strong></span></div>
    <div class="eventoptions"><button class="choice" aria-label="${escapeHtml(event.a)}" onclick="choose(${m},true)"><strong>${escapeHtml(event.a)} ↗</strong><small>${escapeHtml(event.ad)}</small><span>다음 달 순자산 차이 ${money(candidate[next].total - reference[next].total)}</span></button>
    <button class="choice" aria-label="${escapeHtml(event.b)}" onclick="choose(${m},false)"><strong>${escapeHtml(event.b)}</strong><small>${escapeHtml(event.bd)}</small><span>이번 이벤트의 비용·조건 변경 없이 계속</span></button></div>
    <p class="note">선택은 다음 달부터 반영합니다. 확정하면 선택 전후 계획을 서버에 함께 보관해요. 서버 연결이 필요합니다.</p>`,
    "event",
  );
}
function choose(m, accepted) {
  return saveEventBranch(m, accepted);
}
function step() {
  if (serverPlanBusy) return;
  stop();
  if (
    EV[JourneyStore.current.month] &&
    !JourneyStore.current.events.has(JourneyStore.current.month)
  ) {
    eventPreview(JourneyStore.current.month);
    return;
  }
  if (JourneyStore.current.month >= 120) return;
  JourneyStore.increment("month", 1);
  render();
  if (
    EV[JourneyStore.current.month] &&
    !JourneyStore.current.events.has(JourneyStore.current.month)
  )
    eventPreview(JourneyStore.current.month);
}
function toggle() {
  if (serverPlanBusy) return;
  if (JourneyStore.current.timer) {
    stop();
    return;
  }
  if (
    EV[JourneyStore.current.month] &&
    !JourneyStore.current.events.has(JourneyStore.current.month)
  ) {
    eventPreview(JourneyStore.current.month);
    return;
  }
  if (JourneyStore.current.month >= 120) return;
  $("ml-play").textContent = "Ⅱ 잠시 멈춤";
  JourneyStore.set(
    "timer",
    setInterval(() => {
      if (serverPlanBusy || JourneyStore.current.month >= 120) {
        stop();
        return;
      }
      JourneyStore.increment("month", 1);
      render();
      if (
        EV[JourneyStore.current.month] &&
        !JourneyStore.current.events.has(JourneyStore.current.month)
      ) {
        stop();
        eventPreview(JourneyStore.current.month);
      }
    }, 1500 / JourneyStore.current.speed),
  );
}
function nextEvent() {
  if (serverPlanBusy) return;
  stop();
  const next = Object.keys(EV)
    .map(Number)
    .find(
      (m) =>
        m >= JourneyStore.current.month && !JourneyStore.current.events.has(m),
    );
  if (next === undefined) {
    mlShowPage("report");
    return;
  }
  JourneyStore.set("month", next);
  render();
  eventPreview(next);
}
