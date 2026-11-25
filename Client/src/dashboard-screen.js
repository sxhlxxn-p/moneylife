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
function mlGoalMonth(path) {
  return path.findIndex(
    (point) => point.total >= financialProfile().goalAmount / 10000,
  );
}
function mlShowGoalDeadline(id, hit, prefix = "") {
  const label = $(id);
  const delay = hit - financialProfile().goalMonths;
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
function mlRenderGoal() {
  $("ml-goal-name").value = financialProfile().goalName;
  $("ml-goal-amount").value = mlFormatAmount(financialProfile().goalAmount);
  $("ml-goal-months").value = financialProfile().goalMonths;
  const path = simulate();
  const state = path[JourneyStore.current.month];
  $("ml-goal-current-page").textContent = mlFormatMan(state.total);
  $("ml-goal-target-page").textContent = mlFormatKoreanWon(
    financialProfile().goalAmount,
  );
  const pct = Math.max(
    0,
    Math.min(
      100,
      (state.total / (financialProfile().goalAmount / 10000)) * 100,
    ),
  );
  $("ml-goal-bar-page").style.width = pct + "%";
  const hit = mlGoalMonth(path);
  $("ml-goal-deadline").textContent = financialProfile().goalMonths + "개월차";
  $("ml-goal-status").textContent =
    hit < 0 ? "10년 내 미도달" : hit === 0 ? "시작 시점" : hit + "개월차";
  mlShowGoalDeadline("ml-goal-deadline-status", hit);
}
function render() {
  const path = simulate(),
    row = path[JourneyStore.current.month],
    goal = mlGoalMonth(path);
  for (const [id, value] of Object.entries({
    "ml-game-net": row.total,
    "ml-game-income": row.income,
    "ml-game-expense": row.expense,
    "ml-game-cash": row.cash,
    "ml-game-goal-current": row.total,
  }))
    $(id).textContent = money(value);
  $("ml-user-name").textContent = JourneyStore.current.start.name;
  LifeArt.mountAvatar($("ml-user-avatar"));
  $("ml-profile-name").textContent = JourneyStore.current.start.name;
  LifeArt.mountAvatar($("ml-profile-avatar"));
  $("ml-profile-age").textContent =
    JourneyStore.current.start.age +
    Math.floor(JourneyStore.current.month / 12);
  $("ml-game-date").textContent = dates(JourneyStore.current.month);
  $("ml-game-month-label").textContent =
    JourneyStore.current.month + " / 120개월";
  $("ml-game-age").textContent =
    JourneyStore.current.start.age +
    Math.floor(JourneyStore.current.month / 12) +
    "세";
  $("ml-time-progress").style.width =
    (JourneyStore.current.month / 120) * 100 + "%";
  $("ml-game-goal-name").textContent = JourneyStore.current.goalName;
  $("ml-game-goal-target").textContent = money(
    JourneyStore.current.start.target,
  );
  $("ml-game-goal-bar").style.width =
    Math.max(
      0,
      Math.min(100, (row.total / JourneyStore.current.start.target) * 100),
    ) + "%";
  $("ml-game-goal-eta").textContent =
    goal < 0
      ? "기간 내 목표 미도달"
      : row.total >= JourneyStore.current.start.target
        ? "첫 번째 목표에 도달했어요!"
        : goal <= JourneyStore.current.month
          ? "목표를 다시 향해 가고 있어요."
          : "목표까지 " + (goal - JourneyStore.current.month) + "개월";
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
  for (const item of JourneyStore.current.logs.slice(0, 5)) {
    const line = document.createElement("p");
    line.textContent = dates(item.month) + " · " + item.text;
    $("ml-game-log").append(line);
  }
  const next = Object.keys(EV)
    .map(Number)
    .find(
      (m) =>
        m >= JourneyStore.current.month && !JourneyStore.current.events.has(m),
    );
  $("ml-one-month").disabled = JourneyStore.current.month >= 120;
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
  renderLifeGame(path, next);
  mlRenderReport();
  persist();
  renderEventRecovery();
  renderSaveRecovery();
}
