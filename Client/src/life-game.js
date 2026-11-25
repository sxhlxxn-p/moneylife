// The game presents the existing monthly engine and confirmed server choices.
let lifeStoryRunning = false;
function lifeAccepted(month) {
  return (
    JourneyStore.current.events.has(month) &&
    JourneyStore.current.logs.some(
      (item) => item.month === month && item.text === EV[month]?.a,
    )
  );
}
function resetLifePlayback() {
  lifeStoryRunning = false;
  LifeAnimation.setMoving(false);
  $("life-scene")?.classList.remove("is-travelling");
  if ($("life-pause")) $("life-pause").hidden = true;
  if ($("ml-next-event")) $("ml-next-event").disabled = false;
}
function playLifeStory() {
  if (serverPlanBusy || JourneyStore.current.timer) return;
  const state = JourneyStore.current;
  const next = Object.keys(EV)
    .map(Number)
    .find((month) => month >= state.month && !state.events.has(month));
  if (next === state.month) return eventPreview(next);
  if (state.month === 120) return showLifeEnding();
  stop();
  lifeStoryRunning = true;
  $("life-time-options").open = false;
  $("life-details").open = false;
  const destination = next ?? 120;
  JourneyStore.set(
    "timer",
    setInterval(() => {
      if (serverPlanBusy || JourneyStore.current.activePage !== "dashboard") {
        stop();
        return;
      }
      JourneyStore.increment("month", 1);
      if (JourneyStore.current.month >= destination) {
        stop();
        render();
        if (destination === 120) showLifeEnding();
        else eventPreview(destination);
        return;
      }
      render();
    }, 180 / JourneyStore.current.speed),
  );
  render();
}
function renderLifeGame(path, next) {
  const state = JourneyStore.current,
    month = state.month,
    row = path[month];
  const chapters = [
    [
      0,
      "start",
      "첫 번째 장",
      "내 이야기가 시작됐다.",
      "어떤 10년을 살아볼까?",
    ],
    [
      12,
      "home",
      "나만의 일상",
      "나만의 일상을 찾아서.",
      lifeAccepted(12)
        ? "작은 집에 내 이름표를 달았다."
        : "지금의 일상에서 조금 더 준비하기로 했다.",
    ],
    [
      30,
      "rest",
      "나의 속도",
      "잠깐, 숨을 고르는 시간.",
      lifeAccepted(30)
        ? "나를 위한 휴식을 선택했다."
        : "익숙한 일상을 이어가기로 했다.",
    ],
    [
      48,
      "work",
      "새로운 가능성",
      "새로운 기회 앞에서.",
      lifeAccepted(48)
        ? "새 직장으로 첫발을 내디뎠다."
        : "지금의 자리에서 한 걸음 더.",
    ],
    [
      72,
      "travel",
      "경험의 가치",
      "떠나거나, 머무르거나.",
      lifeAccepted(72)
        ? "떠나고 싶던 곳에서 추억을 남겼다."
        : "여행은 다음을 위해 아껴두었다.",
    ],
    [
      96,
      "learn",
      "다음의 나",
      "아직 배울 것이 많다.",
      lifeAccepted(96)
        ? "새로운 배움을 시작했다."
        : "지금의 계획을 차근차근 이어간다.",
    ],
    [
      120,
      "end",
      "마지막 장",
      "어느새, 10년이 흘렀다.",
      "내가 남긴 선택들을 돌아볼 시간.",
    ],
  ];
  const chapter = chapters.findLast((chapter) => month >= chapter[0]);
  $("life-chapter").textContent = chapter[2];
  $("life-title").textContent = next === month ? EV[next].title : chapter[3];
  $("life-caption").textContent =
    next === month ? "내 앞에 새로운 갈림길이 놓였다." : chapter[4];
  const scene = $("life-scene");

  scene.dataset.scene = chapter[1];
  scene.classList.toggle("has-home", lifeAccepted(12));
  scene.classList.toggle("has-career", lifeAccepted(48));
  scene.classList.toggle("is-travelling", Boolean(state.timer));
  $("life-cash").textContent = mlFormatMan(row.cash);
  $("life-goal-name").textContent = state.goalName;
  $("life-goal-progress").textContent =
    Math.max(
      0,
      Math.min(100, Math.round((row.total / state.start.target) * 100)),
    ) + "%";
  $("ml-next-event").disabled = Boolean(state.timer) || serverPlanBusy;
  $("ml-next-event").textContent = state.timer
    ? "이야기가 흐르는 중…"
    : next === month
      ? "내 선택 정하기 →"
      : month === 120
        ? "내 인생 돌아보기 →"
        : "살아가기 ▶";
  $("life-pause").hidden = !state.timer;
  document.querySelectorAll("[data-speed]").forEach((button) => {
    const selected = Number(button.dataset.speed) === state.speed;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $("life-next-hint").textContent = state.timer
    ? "나의 일상이 조금씩 쌓이고 있어요."
    : next === month
      ? "당신은 어떤 선택을 할까요?"
      : next !== undefined
        ? next - month + "개월 뒤, 새로운 이야기가 기다려요."
        : month < 120
          ? "남은 일상을 살아보고 마지막 장을 만나요."
          : "선택들이 모여 나만의 이야기가 됐어요.";
  $("ml-play").disabled = month === 120;
  if (month === 120) $("ml-play").textContent = "여정 완료";
  const eventMonths = Object.keys(EV).map(Number);
  const waypoints = $("life-waypoints");
  if (waypoints.children.length !== eventMonths.length) {
    waypoints.replaceChildren(
      ...eventMonths.map(() => {
        const dot = document.createElement("span");
        dot.className = "life-waypoint";
        dot.setAttribute("role", "img");
        return dot;
      }),
    );
  }
  eventMonths.forEach((m, index) => {
    const dot = waypoints.children[index];
    dot.classList.toggle("completed", state.events.has(m));
    dot.classList.toggle("current", m === month && !state.events.has(m));
    dot.style.left = (m / 120) * 100 + "%";
    dot.title = EV[m].title;
    dot.setAttribute(
      "aria-label",
      EV[m].title +
        (state.events.has(m)
          ? " · 선택 완료"
          : m === month
            ? " · 현재 선택"
            : " · 앞으로 만날 선택"),
    );
  });
  LifeAnimation.sync({
    phase: chapter[1],
    month,
    moving: Boolean(state.timer),
    home: lifeAccepted(12),
    rest: lifeAccepted(30),
    career: lifeAccepted(48),
    travel: lifeAccepted(72),
    learn: lifeAccepted(96),
  });
  const warning = $("life-warning");
  warning.hidden = row.short <= 0 && row.cash >= 300;
  warning.textContent =
    row.short > 0
      ? "이번 달 생활비가 부족해요. 지갑에서 계획을 확인해보세요."
      : "사용할 현금이 300만 원 미만이에요. 다음 선택 전에 지갑을 살펴보세요.";
}
function showLifeJournal() {
  const state = JourneyStore.current;
  const memories = Object.keys(EV)
    .map(Number)
    .filter((m) => state.events.has(m));
  show(
    '<div class="game-dialog-kicker">LIFE RECORDS</div><h2>나의 선택 기록</h2><p>선택한 시점과 내용을 돌아보고 다음 계획을 준비해요.</p><div class="life-memory-list" id="life-memories"></div><details class="life-result-details"><summary>전체 기록 펼치기</summary><div id="life-all-logs"></div></details><button class="btn primary" onclick="closeModal()">마을로 돌아가기</button>',
  );
  for (const m of memories) {
    const card = document.createElement("article");
    const icon = document.createElement("span");
    icon.textContent = String(memories.indexOf(m) + 1).padStart(2, "0");
    icon.setAttribute("aria-hidden", "true");
    const caption = document.createElement("div");
    const age = document.createElement("small");
    age.textContent = state.start.age + Math.floor(m / 12) + "세 · " + dates(m);
    const title = document.createElement("h3");
    const record = state.logs.find(
      (item) => item.month === m && [EV[m].a, EV[m].b].includes(item.text),
    );
    title.textContent = record?.text ?? EV[m].title;
    caption.append(age, title);
    card.append(icon, caption);
    $("life-memories").append(card);
  }
  if (!memories.length)
    $("life-memories").textContent =
      "아직 선택 기록이 없어요. 다음 이벤트에서 선택해보세요.";
  for (const item of [...state.logs].sort((a, b) => a.month - b.month)) {
    const line = document.createElement("p");
    line.textContent = dates(item.month) + " · " + item.text;
    $("life-all-logs").append(line);
  }
}
function showLifeResult(eventMonth, accepted, before) {
  const event = EV[eventMonth],
    next = eventMonth + 1,
    after = simulate()[next];
  const metric = (label, oldValue, newValue) => {
    const difference =
      Math.round(newValue * 10000) - Math.round(oldValue * 10000);
    const change =
      difference === 0
        ? "변화 없음"
        : (difference > 0 ? "+" : "−") +
          mlFormatKoreanWon(Math.abs(difference));
    const direction =
      difference === 0 ? "neutral" : difference > 0 ? "positive" : "negative";
    return (
      '<div data-money-direction="' +
      direction +
      '"><dt>' +
      label +
      '</dt><dd><strong class="life-money-change">' +
      escapeHtml(change) +
      '</strong><span class="life-money-after">선택 후 예상 <b>' +
      escapeHtml(mlFormatMan(newValue)) +
      '</b></span><small class="life-money-before">' +
      "선택 전 " +
      escapeHtml(mlFormatMan(oldValue)) +
      "</small></dd></div>"
    );
  };
  show(
    '<div class="game-dialog-kicker">선택을 반영했어요</div><h2>' +
      escapeHtml(accepted ? event.a : event.b) +
      "</h2><p>" +
      escapeHtml(
        accepted
          ? event.mood.replace(/<br\s*\/?\s*>/gi, " ")
          : "지금의 일상을 이어가기로 했다. 준비하는 시간도 내 이야기니까.",
      ) +
      '</p><p class="life-impact">' +
      escapeHtml(accepted ? event.ad : event.bd) +
      '</p><section class="life-money-result" aria-label="선택에 따른 재무 변화"><h3>다음 달 재무 변화</h3><dl class="life-result-stats life-money-cards">' +
      metric("순자산", before[next].total, after.total) +
      metric("총지출 · 일회성 비용 포함", before[next].expense, after.expense) +
      '</dl><p class="life-money-basis">' +
      dates(next) +
      ' 예상 · 같은 달의 선택 전 계획과 비교한 금액이에요.</p></section><button class="btn primary life-full-button" onclick="closeModal();step()">다음 달로 이동 →</button><button class="btn life-full-button" onclick="closeModal()">마을로 돌아가기</button>',
  );
}
function showLifeEnding() {
  const state = JourneyStore.current,
    path = simulate(),
    end = path[120],
    base = simulate([], [])[120];
  const hit = mlGoalMonth(path);
  show(
    '<div class="game-dialog-kicker">10년의 선택을 돌아보며</div><h2>' +
      escapeHtml(state.start.name) +
      "의 10년</h2><p>" +
      state.events.size +
      '번의 선택. 매일의 작은 결정이 지금의 나를 만들었어요.</p><dl class="life-result-stats"><div><dt>10년 뒤 순자산</dt><dd>' +
      money(end.total) +
      "</dd></div><div><dt>첫 목표 도달</dt><dd>" +
      (hit < 0
        ? "다음 이야기로 남겼어요"
        : hit === 0
          ? "시작부터 달성"
          : hit + "개월차") +
      '</dd></div></dl><button class="btn primary life-full-button" onclick="journal()">선택 기록 돌아보기 →</button><details class="life-result-details"><summary>처음 계획과 비교하기</summary><div class="life-ending-comparison"><p>선택을 하지 않은 처음 계획보다 순자산이 ' +
      money(Math.abs(end.total - base.total)) +
      (end.total < base.total ? " 낮아요." : " 높아요.") +
      '</p><button class="btn" onclick="closeModal();compare()">자세한 계획 비교</button></div></details><div class="modalactions"><button class="btn" onclick="closeModal();openServerPlans()">다른 선택으로 살아보기</button><button class="btn" onclick="closeModal();settings()">새 여정 준비하기</button></div><p class="note">다른 선택은 서버에 보관한 선택 전 시점을 불러와 이어가요. 현재 여정을 남기려면 먼저 보관함에서 저장해주세요.</p>',
  );
}
