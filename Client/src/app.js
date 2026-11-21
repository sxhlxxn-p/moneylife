/* Integrated screen and shared game state. Layout: yebin branch. Author: sxhlxxn. */
"use strict";
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const aliases = { worldtitle: "ml-world-title", worlddesc: "ml-world-desc" };
const $ = (id) => document.getElementById(aliases[id] || id);
const defaults = {
  income: 250,
  expense: 160,
  cash: 300,
  saved: 700,
  age: 25,
  name: "나의 첫 번째 인생",
  target: 5000,
  avatar: "🌱",
};
let start = { ...defaults },
  month = 0,
  baseSaving = 70,
  baseRate = 3,
  saving = 70,
  rate = 3,
  mods = [],
  rateMods = [],
  logs = [],
  events = new Set(),
  speed = 1,
  timer = null,
  focusBefore;
let goalName = "나만의 공간 마련하기",
  goalMonths = 60,
  activePage = "dashboard",
  mlFinance = {};
const money = (value) =>
  Math.round(value * 10000).toLocaleString("ko-KR") + "원";
const dates = (m) => {
  const d = new Date(2026, 9 + m, 1);
  return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월";
};
const mlEl = $,
  mlFormatAmount = (value) => Math.round(value).toLocaleString("ko-KR");
const mlFormatMan = (value) => mlFormatKoreanWon(Math.round(value * 10000));
function simulate(ms = mods, rs = rateMods, sv = baseSaving, rt = baseRate) {
  return GameEngine.simulate({
    initial: start,
    changes: ms,
    rateChanges: rs,
    monthlySaving: sv,
    annualRate: rt,
    months: 120,
  });
}
const mlSimulation = simulate;
function syncFinance() {
  mlFinance = {
    ...start,
    income: start.income * 10000,
    expense: start.expense * 10000,
    cash: start.cash * 10000,
    saved: start.saved * 10000,
    goalAmount: start.target * 10000,
    goalName,
    goalMonths,
    annualRate: baseRate,
  };
}
function persist() {
  try {
    localStorage.setItem(
      "money-life-v1",
      JSON.stringify({
        start,
        month,
        baseSaving,
        baseRate,
        saving,
        rate,
        mods,
        rateMods,
        logs,
        events: [...events],
      }),
    );
    localStorage.setItem(
      "money-life-goal-v1",
      JSON.stringify({ goalName, goalMonths }),
    );
  } catch {}
}
function log(text) {
  logs.unshift({ month, text });
  if (logs.length > 80) logs.pop();
}
function stop() {
  clearInterval(timer);
  timer = null;
  if ($("ml-play"))
    $("ml-play").textContent = month >= 120 ? "여정 완료" : "▶ 시간 시작";
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 3500);
}
const mlToast = toast;
function show(html) {
  stop();
  focusBefore = document.activeElement;
  $("modal").innerHTML =
    '<button class="close" onclick="closeModal()" aria-label="닫기">×</button>' +
    html;
  $("overlay").classList.remove("hidden");
  $("modal").querySelector("button,input")?.focus();
}
function closeModal() {
  $("overlay").classList.add("hidden");
  if (focusBefore?.isConnected) focusBefore.focus();
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
  if (event.key === "Tab" && !$("overlay").classList.contains("hidden")) {
    const nodes = [
      ...$("modal").querySelectorAll("button,input,select,textarea,a[href]"),
    ].filter((node) => !node.disabled);
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0]?.focus();
    }
  }
});
function mlShowPage(page) {
  if (page !== "dashboard") stop();
  activePage = page;
  document
    .querySelectorAll(".ml-page")
    .forEach((node) =>
      node.classList.toggle("active", node.id === "ml-page-" + page),
    );
  document.querySelectorAll("#ml-main-nav [data-page]").forEach((node) => {
    const selected = node.dataset.page === page;
    node.classList.toggle("active", selected);
    if (selected) {
      node.setAttribute("aria-current", "page");
      $("ml-mobile-current").textContent =
        node.querySelector(".ml-nav-label").textContent;
    } else node.removeAttribute("aria-current");
  });
  $("ml-mobile-toggle").setAttribute("aria-expanded", "false");
  if (page === "finance") fillFinance();
  if (page === "settings") {
    $("ml-setting-saving").value = Math.round(saving * 10000);
    $("ml-setting-rate").value = rate;
  }
}
function stressChanges() {
  const path = simulate();
  return [
    ...mods,
    ...Array.from({ length: Math.min(6, 120 - month) }, (_, i) => ({
      type: "income",
      v: -Math.min(100, path[month + i + 1].income),
      m: month + i + 1,
      end: month + i + 1,
    })),
  ];
}

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
      { type: "expense", v: 30 },
      { type: "once", v: 300 },
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
    mods: [{ type: "income", v: -250, duration: 3 }],
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
      { type: "income", v: 40 },
      { type: "once", v: 200 },
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
    mods: [{ type: "once", v: 400 }],
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
    mods: [{ type: "once", v: 200 }],
    mood: "새로운 것을 배우는 당신.<br>또 다른 내일을 준비합니다.",
  },
};

function mlFormatKoreanWon(value) {
  let remainder = Math.round(Math.abs(value));
  const parts = [];
  for (const [size, unit] of [
    [1e12, "조"],
    [1e8, "억"],
    [1e4, "만"],
  ]) {
    const count = Math.floor(remainder / size);
    if (count) parts.push(mlFormatAmount(count) + unit);
    remainder %= size;
  }
  const sign = value < 0 && (parts.length || remainder) ? "−" : "";
  parts.push(
    remainder || !parts.length ? mlFormatAmount(remainder) + "원" : "원",
  );
  return sign + parts.join(" ");
}
function mlFormatDuration(months) {
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  return [years ? years + "년" : "", remaining ? remaining + "개월" : ""]
    .filter(Boolean)
    .join(" ");
}
function mlCompareNetWorth(difference, baseline) {
  if (Math.round(Math.abs(difference)) === 0) return baseline + "과 같아요.";
  return (
    baseline +
    "보다 " +
    mlFormatMan(Math.abs(difference)) +
    (difference < 0 ? " 낮아요." : " 높아요.")
  );
}
function mlGoalMonth(path) {
  return path.findIndex((point) => point.total >= mlFinance.goalAmount / 10000);
}
function mlShowGoalDeadline(id, hit, prefix = "") {
  const label = mlEl(id);
  const delay = hit - mlFinance.goalMonths;
  label.dataset.goalStatus =
    hit < 0 ? "unreached" : delay > 0 ? "late" : "on-time";
  label.textContent =
    prefix +
    (hit < 0
      ? "10년 내 미도달"
      : delay > 0
        ? delay + "개월 초과"
        : "기한 내 도달");
}
function mlCompareGoalTiming(base, current) {
  if (base < 0 && current < 0) return "두 계획 모두 10년 내 미도달";
  if (base < 0) return "내 선택만 10년 내 도달";
  if (current < 0) return "처음 계획만 10년 내 도달";
  const difference = current - base;
  if (difference === 0) return "같은 시점에 도달";
  return (
    mlFormatDuration(Math.abs(difference)) +
    (difference > 0 ? " 늦어짐" : " 빨라짐")
  );
}
function mlDrawChart(svgId, paths, large = false) {
  const svg = mlEl(svgId);
  const width = large ? 520 : 420;
  const height = large ? 250 : 127;
  const pad = {
    left: large ? 106 : 46,
    right: 15,
    top: large ? 18 : 14,
    bottom: large ? 30 : 25,
  };
  const all = paths.flatMap((path) => path.map((point) => point.total));
  let minimum = Math.min(0, ...all) * 1.12;
  let maximum =
    Math.max(large ? 0 : mlFinance.goalAmount / 10000, ...all, 1) * 1.12;
  let tickCount = 3;
  if (large) {
    const desiredStep = Math.max(1, (maximum - minimum) / 5);
    const unit = 10 ** Math.floor(Math.log10(desiredStep));
    const step =
      [1, 2, 5, 10].find((factor) => desiredStep <= factor * unit * 1.5) * unit;
    minimum = Math.floor(minimum / step) * step;
    maximum = Math.ceil(maximum / step) * step;
    tickCount = Math.round((maximum - minimum) / step);
  }
  const x = (month) =>
    pad.left + (month / 120) * (width - pad.left - pad.right);
  const y = (value) =>
    height -
    pad.bottom -
    ((value - minimum) / (maximum - minimum)) * (height - pad.top - pad.bottom);
  let html = "";
  for (let i = 0; i <= tickCount; i++) {
    const value = minimum + ((maximum - minimum) * i) / tickCount;
    html +=
      '<line x1="' +
      pad.left +
      '" y1="' +
      y(value) +
      '" x2="' +
      (width - pad.right) +
      '" y2="' +
      y(value) +
      '" stroke="#eeeaf3" stroke-dasharray="3 4"/>';
    if (large)
      html +=
        '<text class="ml-chart-axis-label" x="' +
        (pad.left - 8) +
        '" y="' +
        y(value) +
        '" text-anchor="end" dominant-baseline="middle">' +
        mlFormatKoreanWon(value * 10000).replace(/ ?원$/, "") +
        "</text>";
  }
  const goal = mlFinance.goalAmount / 10000;
  const showGoal = large && goal <= maximum;
  if (showGoal) {
    html +=
      '<line class="ml-chart-goal ml-series-goal" x1="' +
      pad.left +
      '" y1="' +
      y(goal) +
      '" x2="' +
      (width - pad.right) +
      '" y2="' +
      y(goal) +
      '" stroke-dasharray="8 4"/>';
  }
  const series = ["current", "base", "stress"];
  const dashes = ["none", "5 4", "1 4"];
  paths.forEach((path, index) => {
    const points = path
      .map((point, month) => x(month) + "," + y(point.total))
      .join(" ");
    html +=
      '<polyline class="ml-series-' +
      series[index] +
      '" points="' +
      points +
      '" fill="none" stroke-width="' +
      (index === 0 ? 2.7 : 1.8) +
      '" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="' +
      dashes[index] +
      '"/>';
  });
  const current = paths[0][Math.min(month, 120)];
  html +=
    '<line x1="' +
    x(month) +
    '" x2="' +
    x(month) +
    '" y1="' +
    pad.top +
    '" y2="' +
    (height - pad.bottom) +
    '" stroke="#c7b5e3" stroke-dasharray="3 4"/>';
  html +=
    '<circle cx="' +
    x(month) +
    '" cy="' +
    y(current.total) +
    '" r="4" fill="#8c75ce" stroke="white" stroke-width="2"/>';
  const milestones = large ? [0, 24, 48, 72, 96, 120] : [0, 120];
  milestones.forEach((month) => {
    const anchor = month === 0 ? "start" : month === 120 ? "end" : "middle";
    const label = month === 0 ? "시작" : month / 12 + "년";
    html +=
      '<text class="ml-chart-axis-label" x="' +
      x(month) +
      '" y="' +
      (height - 8) +
      '" text-anchor="' +
      anchor +
      '">' +
      label +
      "</text>";
  });
  svg.innerHTML = html;
  return showGoal;
}
function mlRenderGoal() {
  mlEl("ml-goal-name").value = mlFinance.goalName;
  mlEl("ml-goal-amount").value = mlFormatAmount(mlFinance.goalAmount);
  mlEl("ml-goal-months").value = mlFinance.goalMonths;

  const path = mlSimulation();
  const state = path[month];
  mlEl("ml-goal-current-page").textContent = mlFormatMan(state.total);
  mlEl("ml-goal-target-page").textContent = mlFormatKoreanWon(
    mlFinance.goalAmount,
  );
  const pct = Math.max(
    0,
    Math.min(100, (state.total / (mlFinance.goalAmount / 10000)) * 100),
  );
  mlEl("ml-goal-bar-page").style.width = pct + "%";
  const hit = mlGoalMonth(path);
  mlEl("ml-goal-deadline").textContent = mlFinance.goalMonths + "개월차";
  mlEl("ml-goal-status").textContent =
    hit < 0 ? "10년 내 미도달" : hit === 0 ? "시작 시점" : hit + "개월차";
  mlShowGoalDeadline("ml-goal-deadline-status", hit);
}
function mlRenderReport() {
  const base = mlSimulation([], [], baseSaving);
  const current = mlSimulation();
  const stressMonths = Math.min(6, 120 - month);
  const stress = simulate(stressChanges());
  const goalAmount = mlFormatKoreanWon(mlFinance.goalAmount);
  const goalMonths = {
    base: mlGoalMonth(base),
    current: mlGoalMonth(current),
    stress: mlGoalMonth(stress),
  };
  mlEl("ml-report-goal-amount").textContent = goalAmount;
  mlEl("ml-report-goal-deadline").textContent = mlFinance.goalMonths + "개월차";
  mlEl("ml-report-stress-description").textContent =
    stressMonths > 0
      ? "내 선택에 " +
        (month + 1) +
        "개월차부터 " +
        stressMonths +
        "개월간 월 소득 최대 100만 원 감소를 추가한 경우"
      : "10년 진행이 끝나 내 선택과 같아요.";
  Object.entries({ base, current, stress }).forEach(([id, path]) => {
    const hit = goalMonths[id];
    mlEl("ml-report-" + id).textContent = mlFormatKoreanWon(
      Math.round(path[120].total) * 10000,
    );
    mlEl("ml-report-" + id + "-goal").textContent =
      hit < 0
        ? "10년 내 미도달"
        : hit === 0
          ? "시작 시점"
          : "시작 후 " + mlFormatDuration(hit);
    const month = mlEl("ml-report-" + id + "-month");
    month.textContent = hit > 0 ? hit + "개월차" : "";
    month.hidden = hit <= 0;
    mlShowGoalDeadline("ml-report-" + id + "-deadline", hit);
    const shortage = mlEl("ml-report-" + id + "-shortage");
    const shortageMonths = path.flatMap((state, index) =>
      Math.round(state.short * 10000) > 0 ? [index] : [],
    );
    shortage.toggleAttribute("data-shortage", shortageMonths.length > 0);
    shortage.querySelector("span").textContent = shortageMonths.length
      ? shortageMonths.length + "개월 발생"
      : "없음";
    shortage.querySelector("small").textContent = shortageMonths.length
      ? "첫 부족 " +
        shortageMonths[0] +
        "개월차 · 미충족 지출 누적 " +
        mlFormatKoreanWon(path[120].unpaid * 10000)
      : "";
  });
  const difference =
    Math.round(current[120].total) - Math.round(base[120].total);
  mlEl("ml-report-net-difference").textContent =
    difference === 0
      ? "차이 없음"
      : mlFormatKoreanWon(Math.abs(difference) * 10000) +
        (difference < 0 ? " 감소" : " 증가");
  mlEl("ml-report-goal-difference").textContent = mlCompareGoalTiming(
    goalMonths.base,
    goalMonths.current,
  );
  const showGoal = mlDrawChart(
    "ml-report-chart",
    [current, base, stress],
    true,
  );
  const goalLegend = mlEl("ml-report-goal-legend");
  const chartNote = mlEl("ml-report-chart-note");
  goalLegend.hidden = !showGoal;
  goalLegend.textContent = showGoal ? "목표 " + goalAmount : "";
  chartNote.hidden = showGoal;
  chartNote.textContent = showGoal
    ? ""
    : "목표 " + goalAmount + "은 차트의 표시 범위보다 높아요.";
}

function render() {
  syncFinance();
  const path = simulate(),
    row = path[month],
    goal = mlGoalMonth(path);
  for (const [id, value] of Object.entries({
    "ml-game-net": row.total,
    "ml-game-income": row.income,
    "ml-game-expense": row.expense,
    "ml-game-cash": row.cash,
    "ml-game-goal-current": row.total,
  }))
    $(id).textContent = money(value);
  $("ml-user-name").textContent = start.name;
  $("ml-user-avatar").textContent = start.avatar;
  $("ml-profile-name").textContent = start.name;
  $("ml-profile-avatar").textContent = start.avatar;
  $("ml-profile-age").textContent = start.age + Math.floor(month / 12);
  $("ml-game-date").textContent = dates(month);
  $("ml-game-month-label").textContent = month + " / 120개월";
  $("ml-game-age").textContent = start.age + Math.floor(month / 12) + "세";
  $("ml-time-progress").style.width = (month / 120) * 100 + "%";
  $("ml-game-goal-name").textContent = goalName;
  $("ml-game-goal-target").textContent = money(start.target);
  $("ml-game-goal-bar").style.width =
    Math.max(0, Math.min(100, (row.total / start.target) * 100)) + "%";
  $("ml-game-goal-eta").textContent =
    goal < 0
      ? "기간 내 목표 미도달"
      : goal <= month
        ? "첫 번째 목표에 도달했어요!"
        : "목표까지 " + (goal - month) + "개월";
  mlShowGoalDeadline("ml-game-goal-deadline", goal);
  $("ml-game-health").textContent =
    row.short > 0
      ? "생활비 부족 발생"
      : row.cash < 300
        ? "비상금 확인 필요"
        : "차근차근 안정적으로";
  $("ml-game-chart-current").textContent = "현재 " + money(row.total);
  mlDrawChart("ml-game-chart", [path, simulate([], [])]);
  $("ml-game-log").replaceChildren();
  for (const item of logs.slice(0, 5)) {
    const line = document.createElement("p");
    line.textContent = dates(item.month) + " · " + item.text;
    $("ml-game-log").append(line);
  }
  const next = Object.keys(EV)
    .map(Number)
    .find((m) => m >= month && !events.has(m));
  $("ml-event-title").textContent = next
    ? EV[next].title
    : "당신의 10년이 쌓였어요";
  $("ml-event-desc").textContent = next
    ? dates(next) + "에 만나는 선택이에요."
    : "다른 선택과 비교해보세요.";
  $("ml-event-yes").textContent = next ? "이벤트 만나보기" : "분석 리포트 보기";
  $("ml-event-later").textContent = "시간 계속 진행";
  $("ml-one-month").disabled = month >= 120;
  for (const [i, node] of [...$("ml-milestones").children].entries())
    node.textContent = [
      start.age + "세 출발",
      start.age + 1 + "세 독립",
      start.age + 4 + "세 이직",
      start.age + 6 + "세 여행",
      start.age + 10 + "세 다음 장",
    ][i];
  const assets = $("ml-live-assets");
  assets.replaceChildren();
  for (const [label, value] of [
    ["가용 현금", row.cash],
    ["예금·저축", row.saved],
    ["미충족 생활비 누적", row.unpaid],
    ["순자산", row.total],
  ]) {
    const item = document.createElement("div");
    item.className = "ml-summary-row";
    const title = document.createElement("span");
    title.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = money(value);
    item.append(title, amount);
    assets.append(item);
  }
  mlRenderGoal();
  mlRenderReport();
  persist();
}
function eventMods(m) {
  if (m !== 30)
    return EV[m].mods.map((value) => ({ ...value, m: month + 1, end: null }));
  const path = simulate();
  return Array.from({ length: Math.min(3, 120 - month) }, (_, i) => ({
    type: "income",
    v: -path[month + i + 1].income,
    m: month + i + 1,
    end: month + i + 1,
  }));
}
function eventPreview(m) {
  if (events.has(m)) return;
  const event = EV[m];
  const reference = simulate(),
    candidate = simulate([...mods, ...eventMods(m)]),
    next = month + 1;
  show(
    '<div class="eyebrow">' +
      dates(month) +
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
      '</small></button></div><p class="note">선택은 다음 달부터 반영해요. 원본을 보관하려면 선택 전 서버에 저장해주세요.</p>',
  );
}
function choose(m, accepted) {
  if (serverPlanBusy || events.has(m)) return;
  if (accepted) mods.push(...eventMods(m));
  events.add(m);
  log(accepted ? EV[m].a : EV[m].b);
  closeModal();
  render();
}
function step() {
  if (serverPlanBusy) return;
  stop();
  if (EV[month] && !events.has(month)) {
    eventPreview(month);
    return;
  }
  if (month >= 120) return;
  month++;
  render();
  if (EV[month] && !events.has(month)) eventPreview(month);
}
function toggle() {
  if (serverPlanBusy) return;
  if (timer) {
    stop();
    return;
  }
  if (EV[month] && !events.has(month)) {
    eventPreview(month);
    return;
  }
  if (month >= 120) return;
  $("ml-play").textContent = "Ⅱ 잠시 멈춤";
  timer = setInterval(() => {
    if (serverPlanBusy || month >= 120) {
      stop();
      return;
    }
    month++;
    render();
    if (EV[month] && !events.has(month)) {
      stop();
      eventPreview(month);
    }
  }, 1500 / speed);
}
function nextEvent() {
  if (serverPlanBusy) return;
  stop();
  const next = Object.keys(EV)
    .map(Number)
    .find((m) => m >= month && !events.has(m));
  if (next === undefined) {
    mlShowPage("report");
    return;
  }
  month = next;
  render();
  eventPreview(next);
}
function fillFinance() {
  for (const key of ["cash", "saved", "income", "expense"])
    $("ml-" + key).value = Math.round(start[key] * 10000);
  $("ml-saving").value = Math.round(baseSaving * 10000);
  $("ml-start-name").value = start.name;
  $("ml-start-age").value = start.age;
  $("ml-start-rate").value = baseRate;
  financeSummary();
}
function financeSummary() {
  const value = (key) => Number($("ml-" + key).value) || 0;
  $("ml-total-assets").textContent =
    (value("cash") + value("saved")).toLocaleString("ko-KR") + "원";
  $("ml-month-balance").textContent =
    (value("income") - value("expense")).toLocaleString("ko-KR") + "원";
}
function applyFinance(values) {
  start = { ...start, ...values.initial };
  baseSaving = values.saving;
  baseRate = values.rate;
  saving = baseSaving;
  rate = baseRate;
  month = 0;
  mods = [];
  rateMods = [];
  events = new Set();
  logs = [];
  serverPlanId = null;
  try {
    localStorage.removeItem("money-life-server-plan");
  } catch {}
  log("새로운" + " 여정을 시작했어요.");
  closeModal();
  render();
  mlShowPage("dashboard");
}
function startFinance(event) {
  event.preventDefault();
  if (serverPlanBusy) return;
  const initial = {
    ...start,
    name: $("ml-start-name").value.trim() || defaults.name,
    age: Number($("ml-start-age").value),
  };
  for (const key of ["cash", "saved", "income", "expense", "saving"]) {
    const input = $("ml-" + key),
      value = Number(input.value);
    if (
      input.value.trim() === "" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 10000000000
    ) {
      $("ml-finance-error").textContent =
        "금액은 0~100억원의 정수 원으로 입력해주세요.";
      input.focus();
      return;
    }
    if (key !== "saving") initial[key] = value / 10000;
  }
  const annualRate = Number($("ml-start-rate").value);
  if (
    !Number.isInteger(initial.age) ||
    initial.age < 18 ||
    initial.age > 80 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    annualRate > 8
  ) {
    $("ml-finance-error").textContent = "나이와 금리를 확인해주세요.";
    return;
  }
  const values = {
    initial,
    saving: Number($("ml-saving").value) / 10000,
    rate: annualRate,
  };
  if (month || mods.length) {
    show(
      '<h2>새 여정을 시작할까요?</h2><p>현재 기록은 초기화됩니다. 남겨둘 기록은 먼저 서버에 저장해주세요.</p><button class="btn primary" id="confirmjourney">새 여정 시작</button>',
    );
    $("confirmjourney").onclick = () => applyFinance(values);
  } else applyFinance(values);
}
function settings() {
  mlShowPage("finance");
}
function compare() {
  mlShowPage("report");
}
function assets() {
  mlShowPage("assets");
}
function journal() {
  show(
    "<h2>나의 선택 기록</h2>" +
      logs.map((item) => "<p>" + escapeHtml(item.text) + "</p>").join(""),
  );
}
function welcome() {
  show(
    '<div class="eyebrow">WELCOME TO MONEY LIFE</div><h2>돈을 모으는 시간도,<br>당신의 인생이니까요.</h2><p>개인의 조건으로 선택 전후의 계획을 비교해요. 저장한 진행은 같은 기기에서 이어집니다.</p><div class="modalactions"><button class="btn" onclick="closeModal();settings()">재무 정보 입력</button><button class="btn primary" onclick="closeModal()">마을로 시작하기 →</button></div>',
  );
}
// Restore the established version-1 game snapshot; do not reinterpret legacy stock inputs as deposits.
try {
  const stored = JSON.parse(localStorage.getItem("money-life-v1"));
  if (stored) {
    const decoded = MoneyLifePlanState.decode({
      schemaVersion: 1,
      goalBasis: "net_assets",
      state: MoneyLifePlanState.encode({
        ...stored,
        events: new Set(stored.events),
      }),
    });
    ({
      start,
      month,
      baseSaving,
      baseRate,
      saving,
      rate,
      mods,
      rateMods,
      logs,
    } = decoded);
    events = new Set(decoded.events);
  }
  const profile = JSON.parse(localStorage.getItem("money-life-goal-v1"));
  if (typeof profile?.goalName === "string")
    goalName = profile.goalName.slice(0, 40);
  if (
    Number.isInteger(profile?.goalMonths) &&
    profile.goalMonths >= 1 &&
    profile.goalMonths <= 120
  )
    goalMonths = profile.goalMonths;
} catch {}
document.querySelectorAll("[data-page]").forEach((node) =>
  node.addEventListener("click", () => {
    mlShowPage(node.dataset.page);
    if (node.dataset.page === "investment") PaperTrading.open();
  }),
);
$("ml-mobile-toggle").onclick = () => {
  const button = $("ml-mobile-toggle");
  button.setAttribute(
    "aria-expanded",
    String(button.getAttribute("aria-expanded") !== "true"),
  );
};
$("ml-play").onclick = toggle;
$("ml-one-month").onclick = step;
$("ml-next-event").onclick = nextEvent;
$("ml-event-yes").onclick = nextEvent;
$("ml-event-later").onclick = toggle;
document.querySelectorAll("[data-speed]").forEach(
  (node) =>
    (node.onclick = () => {
      speed = Number(node.dataset.speed);
      document.querySelectorAll("[data-speed]").forEach((item) => {
        item.classList.toggle("active", item === node);
        item.setAttribute("aria-pressed", String(item === node));
      });
      if (timer) {
        stop();
        toggle();
      }
    }),
);
$("ml-finance-form").onsubmit = startFinance;
$("ml-finance-form").oninput = financeSummary;
$("ml-finance-reset").onclick = () => {
  for (const key of ["cash", "saved", "income", "expense"])
    $("ml-" + key).value = defaults[key] * 10000;
  $("ml-saving").value = 700000;
  $("ml-start-rate").value = 3;
  financeSummary();
};
$("ml-goal-form").onsubmit = (event) => {
  event.preventDefault();
  if (serverPlanBusy) return;
  const target = Number($("ml-goal-amount").value.replaceAll(",", "")),
    months = Number($("ml-goal-months").value);
  if (
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > 10000000000 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  ) {
    toast("목표" + " 금액·기한을 확인해주세요.");
    return;
  }
  goalName = $("ml-goal-name").value.trim() || "나의 목표";
  goalMonths = months;
  start.target = target / 10000;
  render();
  toast("목표를 저장했어요.");
};
$("ml-refresh-report").onclick = () => {
  syncFinance();
  mlRenderReport();
};
$("ml-apply-settings").onclick = () => {
  if (serverPlanBusy || month >= 120) return;
  const value = Number($("ml-setting-saving").value),
    nextRate = Number($("ml-setting-rate").value);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 10000000000 ||
    !Number.isFinite(nextRate) ||
    nextRate < 0 ||
    nextRate > 8
  ) {
    toast("저축액과 금리를 확인해주세요.");
    return;
  }
  saving = value / 10000;
  rate = nextRate;
  mods.push({ type: "saving", v: saving, m: month + 1 });
  rateMods.push({ m: month + 1, v: rate });
  log("다음 달 저축·금리 조건을 변경했어요.");
  render();
};
$("ml-reset-all").onclick = () => {
  settings();
  toast(
    "재무 입력에서 새 여정을 시작할 수 있어요. 기존 서버 기록은 보존됩니다.",
  );
};
render();
fillFinance();
mlShowPage("dashboard");
welcome();
