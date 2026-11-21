const EV = {
  12: {
    emoji: "🏡",
    title: "나만의 공간, 시작해볼까요?",
    body: "혼자만의 작은 집을 구할 기회가 생겼습니다. 자유로운 일상과 늘어나는 생활비, 당신의 선택은?",
    a: "지금 독립할래요",
    ad: "다음 달부터 월 생활비 +30만 원, 일회성 이사 비용 300만 원.",
    b: "조금 더 준비할래요",
    bd: "현재의 생활비를 유지하고 목표 자금을 더 모읍니다.",
    mods: [
      {
        type: "expense",
        v: 30,
      },
      {
        type: "once",
        v: 300,
      },
    ],
    mood: "나만의 공간을 선택한 당신.<br>일상에도 새로운 장이 열립니다.",
  },
  30: {
    emoji: "🌿",
    title: "잠깐 쉬어가도 괜찮을까요?",
    body: "3개월의 휴식이 가능한 시점입니다. 잠시 일을 내려놓으면 금융 계획은 어떻게 바뀔까요?",
    a: "나를 위한 휴식",
    ad: "다음 달부터 3개월 동안 소득을 0원으로 가정합니다.",
    b: "지금의 일상 유지",
    bd: "휴식으로 인한 소득 변화 없이 계획을 이어갑니다.",
    mods: [
      {
        type: "income",
        v: -250,
        duration: 3,
      },
    ],
    mood: "조금 느리게 가는 시간.<br>당신만의 속도를 찾고 있어요.",
  },
  48: {
    emoji: "💼",
    title: "새로운 기회가 찾아왔어요",
    body: "새로운 직장의 제안을 받았습니다. 준비 비용이 들지만 월 소득이 늘어납니다.",
    a: "새로운 도전 시작",
    ad: "다음 달부터 월 소득 +40만 원, 준비 비용 200만 원.",
    b: "지금의 자리에서",
    bd: "현재 직장과 소득을 유지하며 계획을 이어갑니다.",
    mods: [
      {
        type: "income",
        v: 40,
      },
      {
        type: "once",
        v: 200,
      },
    ],
    mood: "새로운 일을 시작합니다.<br>앞으로의 가능성도 넓어져요.",
  },
  72: {
    emoji: "✈️",
    title: "꿈꿔왔던 여행을 떠날까요?",
    body: "오랫동안 마음속에 담아둔 여행입니다. 오늘의 경험과 내일의 목표 사이에서 선택해보세요.",
    a: "지금 떠날래요",
    ad: "다음 달에 여행 비용 400만 원을 지출합니다.",
    b: "다음을 기약할래요",
    bd: "추가 지출 없이 목표 자금을 유지합니다.",
    mods: [
      {
        type: "once",
        v: 400,
      },
    ],
    mood: "낯선 곳에서 얻은 기억.<br>삶은 숫자보다 더 넓으니까요.",
  },
  96: {
    emoji: "🎓",
    title: "배움에 투자할 시간",
    body: "새로운 역량을 배울 수 있는 과정이 열렸습니다. 미래 소득 증가는 가정하지 않고 교육 비용만 반영합니다.",
    a: "배움을 시작할래요",
    ad: "다음 달에 교육 비용 200만 원을 지출합니다.",
    b: "지금 계획을 유지",
    bd: "현재의 지출과 저축 계획을 유지합니다.",
    mods: [
      {
        type: "once",
        v: 200,
      },
    ],
    mood: "새로운 것을 배우는 당신.<br>또 다른 내일을 준비합니다.",
  },
};
function eventMods(m) {
  if (m !== 30)
    return EV[m].mods.map((value) => ({
      ...value,
      m: JourneyStore.current.month + 1,
      end: null,
    }));
  const path = simulate();
  return Array.from(
    {
      length: Math.min(3, 120 - JourneyStore.current.month),
    },
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
    '<div class="eyebrow">' +
      dates(JourneyStore.current.month) +
      " · 인생 이벤트</div><h2>" +
      event.emoji +
      " " +
      event.title +
      "</h2><p>" +
      event.body +
      '</p><div class="eventoptions"><button class="choice" aria-label="' +
      event.a +
      '" onclick="choose(' +
      m +
      ',true)"><strong>' +
      event.a +
      "</strong><small>" +
      event.ad +
      "</small><span>다음 달 순자산 " +
      money(candidate[next].total - reference[next].total) +
      '</span></button><button class="choice" aria-label="' +
      event.b +
      '" onclick="choose(' +
      m +
      ',false)"><strong>' +
      event.b +
      "</strong><small>" +
      event.bd +
      '</small></button></div><p class="note">선택은 다음 달부터 반영해요. 확정하면 선택 전 원본과 새 계획을 서버에 함께 저장해요. 서버 연결이 필요합니다.</p>',
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
