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
  const difference =
    Math.round(candidate[next].total * 10000) -
    Math.round(reference[next].total * 10000);
  const direction =
    difference === 0 ? "neutral" : difference > 0 ? "positive" : "negative";
  show(
    '<div class="game-dialog-kicker">' +
      dates(JourneyStore.current.month) +
      " · 인생 이벤트</div><h2>" +
      event.title +
      "</h2><p>" +
      event.body +
      '</p><div class="eventoptions"><button class="choice" aria-label="' +
      event.a +
      '" onclick="choose(' +
      m +
      ',true)" data-plan-action="event-choice"><strong>' +
      event.a +
      "</strong><small>" +
      event.ad +
      '</small><span class="life-choice-money" data-money-direction="' +
      direction +
      '">다음 달 순자산 ' +
      (difference === 0
        ? "변화 없음"
        : (difference > 0 ? "+" : "") + mlFormatKoreanWon(difference)) +
      '</span></button><button class="choice" aria-label="' +
      event.b +
      '" onclick="choose(' +
      m +
      ',false)" data-plan-action="event-choice"><strong>' +
      event.b +
      "</strong><small>" +
      event.bd +
      '</small><span>지금의 계획을 이어가요.</span></button></div><p class="note" role="status" id="life-choice-status">선택은 다음 달부터 반영돼요. 선택 전후의 여정을 보관하려면 서버 연결이 필요합니다.</p>',
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
  if (JourneyStore.current.month === 120) showLifeEnding();
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
      if (JourneyStore.current.month === 120) {
        stop();
        render();
        showLifeEnding();
        return;
      }
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
    JourneyStore.set("month", 120);
    render();
    showLifeEnding();
    return;
  }
  JourneyStore.set("month", next);
  render();
  eventPreview(next);
}
