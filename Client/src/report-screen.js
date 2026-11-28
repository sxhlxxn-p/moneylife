function mlFormatDuration(months) {
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  return [years ? years + "년" : "", remaining ? remaining + "개월" : ""]
    .filter(Boolean)
    .join(" ");
}
function mlCompareNetWorth(difference, baseline) {
  if (Math.round(Math.abs(difference) * 10000) === 0)
    return baseline + "과 같아요.";
  return (
    baseline +
    "보다 " +
    mlFormatMan(Math.abs(difference)) +
    (difference < 0 ? " 낮아요." : " 높아요.")
  );
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
  const svg = $(svgId);
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
    Math.max(large ? 0 : financialProfile().goalAmount / 10000, ...all, 1) *
    1.12;
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
  const goal = financialProfile().goalAmount / 10000;
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
  const current = paths[0][Math.min(JourneyStore.current.month, 120)];
  html +=
    '<line x1="' +
    x(JourneyStore.current.month) +
    '" x2="' +
    x(JourneyStore.current.month) +
    '" y1="' +
    pad.top +
    '" y2="' +
    (height - pad.bottom) +
    '" stroke="#c7b5e3" stroke-dasharray="3 4"/>';
  html +=
    '<circle cx="' +
    x(JourneyStore.current.month) +
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
function mlRenderReport(paths = null) {
  const base = paths?.base ?? simulate([], [], JourneyStore.current.baseSaving);
  const current = paths?.current ?? simulate();
  const stressMonths = Math.min(6, 120 - JourneyStore.current.month);
  const stress = paths?.stress ?? simulate(stressChanges(current));
  const goalAmount = mlFormatKoreanWon(financialProfile().goalAmount);
  const goalMonths = {
    base: mlGoalMonth(base),
    current: mlGoalMonth(current),
    stress: mlGoalMonth(stress),
  };
  $("ml-report-goal-amount").textContent = goalAmount;
  $("ml-report-goal-deadline").textContent =
    financialProfile().goalMonths + "개월차";
  $("ml-report-stress-description").textContent =
    stressMonths > 0
      ? "내 선택에 " +
        (JourneyStore.current.month + 1) +
        "개월차부터 " +
        stressMonths +
        "개월간 월 소득 최대 100만 원 감소를 추가한 경우"
      : "10년 진행이 끝나 내 선택과 같아요.";
  Object.entries({
    base,
    current,
    stress,
  }).forEach(([id, path]) => {
    const hit = goalMonths[id];
    $("ml-report-" + id).textContent = mlFormatKoreanWon(
      Math.round(path[120].total * 10000),
    );
    $("ml-report-" + id + "-goal").textContent =
      hit < 0
        ? "10년 내 미도달"
        : hit === 0
          ? "시작 시점"
          : "시작 후 " + mlFormatDuration(hit);
    const month = $("ml-report-" + id + "-month");
    month.textContent = hit > 0 ? hit + "개월차" : "";
    month.hidden = hit <= 0;
    mlShowGoalDeadline("ml-report-" + id + "-deadline", hit);
    const shortage = $("ml-report-" + id + "-shortage");
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
        "개월차 · 충당하지 못한 지출 누적 " +
        mlFormatKoreanWon(path[120].unpaid * 10000)
      : "";
  });
  const difference =
    Math.round(current[120].total * 10000) -
    Math.round(base[120].total * 10000);
  $("ml-report-net-difference").textContent =
    difference === 0
      ? "차이 없음"
      : mlFormatKoreanWon(Math.abs(difference)) +
        (difference < 0 ? " 감소" : " 증가");
  $("ml-report-goal-difference").textContent = mlCompareGoalTiming(
    goalMonths.base,
    goalMonths.current,
  );
  const showGoal = mlDrawChart(
    "ml-report-chart",
    [current, base, stress],
    true,
  );
  const goalLegend = $("ml-report-goal-legend");
  const chartNote = $("ml-report-chart-note");
  goalLegend.hidden = !showGoal;
  goalLegend.textContent = showGoal ? "목표 " + goalAmount : "";
  chartNote.hidden = showGoal;
  chartNote.textContent = showGoal
    ? ""
    : "목표 " + goalAmount + "은 차트의 표시 범위보다 높아요.";
}
