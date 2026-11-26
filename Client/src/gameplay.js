function gameGoalLabel(path) {
  const month = mlGoalMonth(path);
  return month < 0
    ? "10년 내 미도달"
    : month === 0
      ? "출발 시점 달성"
      : `${month}개월차`;
}
const JourneyStarts = {
  first: {
    title: "첫 월급으로 시작하기",
    description: "월 소득 250만 · 생활비 160만 · 자산 1,000만 원",
    initial: {
      name: "첫 월급, 첫 번째 미래",
      age: 25,
      income: 250,
      expense: 160,
      cash: 300,
      saved: 700,
      target: 3000,
      avatar: "🌱",
    },
    saving: 70,
    rate: 3,
    goal: "첫 3,000만 원 모으기",
    months: 24,
  },
  home: {
    title: "독립 자금 모아보기",
    description: "월 소득 300만 · 생활비 180만 · 자산 1,500만 원",
    initial: {
      name: "나만의 공간을 향해",
      age: 27,
      income: 300,
      expense: 180,
      cash: 500,
      saved: 1000,
      target: 5000,
      avatar: "🏡",
    },
    saving: 100,
    rate: 3,
    goal: "독립 자금 5,000만 원",
    months: 36,
  },
};
function showJourneyStart() {
  const continuing =
    JourneyStore.current.month > 0 || JourneyStore.current.logs.length > 0;
  show(`<div class="game-kicker">MONEY LIFE · 나의 출발</div>
    <h2>내 선택으로 살아보는<br>앞으로의 10년.</h2>
    <p>출발 조건을 고르고, 한 달씩 살아보세요.<br>독립·이직·투자 앞에서 달라지는 미래를 비교할 수 있어요.</p>
    <div class="game-starts">${Object.entries(JourneyStarts)
      .map(
        ([id, start]) =>
          `<button class="game-start-card" data-start="${id}"><span>${start.initial.avatar}</span><strong>${start.title}</strong><small>${start.description}</small><em>${start.goal} →</em></button>`,
      )
      .join("")}</div>
    <p class="note">위 두 출발은 체험용 가정입니다. 실제 내 조건은 직접 입력할 수 있어요. 투자 연습은 은행에서 별도로 시작해요.</p>
    <div class="buttonrow"><button class="btn primary" id="game-own-start">내 조건 직접 입력</button><button class="btn" id="game-continue">${continuing ? "진행 중인 여정 이어하기" : "현재 조건으로 마을 둘러보기"}</button></div>`);
  document.querySelectorAll("[data-start]").forEach((button) => {
    button.onclick = () => confirmJourneyStart(button.dataset.start);
  });
  $("game-own-start").onclick = () => {
    closeModal();
    mlShowPage("finance");
  };
  $("game-continue").onclick = closeModal;
}
function confirmJourneyStart(id) {
  const start = JourneyStarts[id];
  if (!start || serverPlanBusy) return;
  if (eventRequests.get() || eventRequests.isSuspended()) {
    toast(
      "미확인 선택 결과를 먼저 확인하거나 별도 보관해주세요. 기존 여정은 유지했어요.",
    );
    return;
  }
  show(`<div class="game-kicker">새 여정 확인</div><h2>${start.title}</h2><p>${start.description}</p>
    <p>목표는 ${start.months}개월 안에 ${start.goal}입니다. 저축은 월 ${money(start.saving)}, 연 금리는 ${start.rate}%로 가정해요.</p>
    <p class="note">현재 기기의 여정은 새 조건으로 바뀝니다. 보관할 기록은 먼저 서버에 저장해주세요. 기존 서버 기록과 모의투자 기록은 유지됩니다.</p>
    <button class="btn primary" id="game-confirm-start">이 조건으로 새 여정 시작</button><button class="btn" id="game-back-start">돌아가기</button>`);
  $("game-back-start").onclick = showJourneyStart;
  $("game-confirm-start").onclick = () => {
    if (serverPlanBusy || eventRequests.get() || eventRequests.isSuspended())
      return;
    JourneyStore.set("goalName", start.goal);
    JourneyStore.set("goalMonths", start.months);
    applyFinance(start);
  };
}
function renderGameplay(path) {
  $("game-choice-result").hidden = true;
  $("play-dialogue").hidden = false;
  $("ml-one-month").disabled = false;
  $("ml-one-month").textContent =
    JourneyStore.current.month >= 120
      ? "나의 10년 돌아보기 →"
      : "한 달 살아보기 →";
  const state = JourneyStore.current,
    row = path[state.month],
    previous = path[Math.max(0, state.month - 1)];
  const due = EV[state.month] && !state.events.has(state.month);
  const hit = path.findIndex((point) => point.total >= state.start.target);
  const reached = row.total >= state.start.target;
  const title = due
    ? "인생의 갈림길에 도착했어요."
    : state.month === 120
      ? "10년의 여정, 어떤 미래를 만들었나요?"
      : reached
        ? "목표에 도착했어요! 다음 미래도 그려볼까요?"
        : state.month === 0
          ? "지금부터, 나의 첫 달."
          : row.short > 0
            ? "이번 달 생활비가 부족했어요."
            : "한 달을 살아냈어요. 미래가 조금 달라졌어요.";
  $("game-story-title").textContent = title;
  $("game-story-body").textContent = due
    ? "시간을 잠시 멈췄어요. 비용과 목표 시점을 확인하고 선택하세요."
    : state.month === 0
      ? "한 달 보내기로 시작하거나, 다음 선택까지 시간을 건너뛰세요."
      : `${dates(state.month)} · 지난달 대비 순자산 ${money(row.total - previous.total)}. ${reached ? "결과 비교에서 처음 계획과의 차이를 확인하세요." : hit < 0 ? "현재 조건으로는 10년 내 목표에 도달하지 못해요." : `현재 계획의 목표 도달 시점은 ${hit}개월차예요.`}`;
  $("game-turn").textContent =
    state.month === 120
      ? "FINISH"
      : `MONTH ${String(state.month).padStart(2, "0")}`;
  $("ml-game-chapter").textContent =
    `CHAPTER ${String(Math.min(5, 1 + Math.floor(state.month / 24))).padStart(2, "0")} · ${state.month < 12 ? "새로운 출발" : state.month < 48 ? "선택이 쌓이는 시간" : "나만의 미래"}`;
  $("ml-world-title").textContent = due
    ? EV[state.month].title
    : reached
      ? "작은 선택이 만든, 나의 목표."
      : state.month === 0
        ? "이곳에서, 나의 미래가 시작돼요."
        : row.short > 0
          ? "잠깐, 내 지갑을 살펴볼 시간."
          : state.month < 12
            ? "나의 일상에 조금씩 쌓이는 미래."
            : "선택이 쌓여, 나만의 삶이 됩니다.";
  $("ml-world-desc").textContent =
    state.month === 0
      ? "월급을 받고, 생활비를 쓰고, 저축하는 매달. 그 사이 찾아올 선택들을 직접 경험해보세요."
      : "같은 출발이어도 선택은 다른 미래로 이어집니다. 이번에는 어떤 길을 걸어볼까요?";
  $("game-character").textContent = state.start.avatar;
  $("ml-event-status").textContent = due
    ? "지금, 당신의 선택"
    : "다가오는 인생 선택";
  $("ml-event-yes").textContent = due
    ? "선택지 확인하기"
    : state.month === 120
      ? "나의 10년 비교하기"
      : "다음 선택까지 가기";
  $("ml-event-later").textContent = state.timer
    ? "잠시 멈추기"
    : "한 달씩 자동 진행";
  const receipt = $("game-month-receipt");
  receipt.replaceChildren();
  if (!state.month) {
    receipt.textContent =
      "출발 자산 " +
      money(row.total) +
      " · 한 달을 보내면 소득과 지출이 정산됩니다.";
    return;
  }
  for (const [label, value] of [
    ["들어온 소득", row.income],
    ["생활비·이벤트 비용", row.expense],
    ["순자산 변화", row.total - previous.total],
  ]) {
    const item = document.createElement("div"),
      caption = document.createElement("span"),
      amount = document.createElement("strong");
    caption.textContent = label;
    amount.textContent = money(value);
    item.append(caption, amount);
    receipt.append(item);
  }
  if (row.short > 0) {
    const warning = document.createElement("p");
    warning.className = "game-warning";
    warning.textContent = `미충족 생활비 ${money(row.short)} · 부족분은 누적 미충족 생활비에 반영됩니다.`;
    receipt.append(warning);
  }
}
function openLifePlace(place) {
  if (serverPlanBusy) return;
  const months = place === "home" ? [12] : [30, 48, 96];
  const target = months.find(
    (month) =>
      month >= JourneyStore.current.month &&
      !JourneyStore.current.events.has(month),
  );
  if (target === undefined) {
    show(
      '<h2>지나온 선택을 돌아볼까요?</h2><p>이 장소에서 만날 선택을 모두 지나왔어요. 결과 비교에서 처음 계획과 현재 계획의 차이를 확인할 수 있어요.</p><button class="btn primary" id="game-place-report">결과 비교 열기</button>',
    );
    $("game-place-report").onclick = () => {
      closeModal();
      compare();
    };
    return;
  }
  show(
    `<div class="game-kicker">${place === "home" ? "HOME · 독립 준비" : "WORK · 일과 미래"}</div><h2>${escapeHtml(EV[target].title)}</h2><p>${escapeHtml(EV[target].body)}</p><p class="note">${dates(target)}에 만나는 선택입니다. 앞서 결정하지 않은 이벤트가 있다면 그 선택부터 진행해요.</p><button class="btn primary" id="game-place-next">다음 인생 선택 만나기</button>`,
  );
  $("game-place-next").onclick = () => {
    closeModal();
    nextEvent();
  };
}
function showChoiceResult(reference, candidate, eventMonth, accepted) {
  const panel = $("game-choice-result"),
    next = JourneyStore.current.month + 1;
  panel.hidden = false;
  panel.replaceChildren();
  $("play-dialogue").hidden = true;
  const title = document.createElement("strong"),
    body = document.createElement("p");
  title.textContent = `${EV[eventMonth].emoji} ${accepted ? EV[eventMonth].a : EV[eventMonth].b}`;
  body.textContent = `선택 전후 계획을 보관했어요. 비용과 조건은 다음 달부터 반영됩니다. 다음 달 순자산 차이 ${money(candidate[next].total - reference[next].total)}.`;
  const metrics = document.createElement("div");
  metrics.className = "game-result-metrics";
  for (const [label, value] of [
    [
      "목표 도달 시점",
      `${gameGoalLabel(reference)} → ${gameGoalLabel(candidate)}`,
    ],
    [
      "다음 달 순자산 차이",
      money(candidate[next].total - reference[next].total),
    ],
  ]) {
    const card = document.createElement("div"),
      caption = document.createElement("span"),
      amount = document.createElement("strong");
    caption.textContent = label;
    amount.textContent = value;
    card.append(caption, amount);
    metrics.append(card);
  }
  const actions = document.createElement("div"),
    nextButton = document.createElement("button"),
    compareButton = document.createElement("button");
  actions.className = "game-result-actions";
  nextButton.className = "ml-btn primary";
  nextButton.textContent = "선택한 삶으로 한 달 살아보기 →";
  nextButton.onclick = step;
  compareButton.className = "ml-btn";
  compareButton.textContent = "두 미래 비교하기";
  compareButton.onclick = compare;
  actions.append(nextButton, compareButton);
  panel.append(title, body, metrics, actions);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
