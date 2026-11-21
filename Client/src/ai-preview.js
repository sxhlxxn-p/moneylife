function renderAIChangeDetails(host, details) {
  const won = (value) => value.toLocaleString("ko-KR") + "원";
  const date = (value) =>
    value.slice(0, 4) + "년 " + Number(value.slice(5)) + "월";
  for (const detail of details) {
    const card = document.createElement("section");
    card.className = "ai-change-detail";
    const heading = document.createElement("h3");
    heading.textContent = detail.label;
    const rule = document.createElement("p");
    rule.textContent =
      ({ set: "설정 금액 ", add: "증가 금액 ", subtract: "감소 금액 " }[
        detail.operation
      ] || "") + won(detail.amount);
    const period = document.createElement("p");
    period.textContent =
      "적용 기간: " + date(detail.startMonth) + " ~ " + date(detail.endMonth);
    const list = document.createElement("dl");
    for (const segment of detail.segments) {
      const term = document.createElement("dt");
      term.textContent =
        date(segment.startMonth) +
        (segment.startMonth === segment.endMonth
          ? ""
          : " ~ " + date(segment.endMonth));
      const value = document.createElement("dd");
      value.textContent = won(segment.before) + " → " + won(segment.after);
      list.append(term, value);
    }
    card.append(heading, rule, period, list);
    host.append(card);
  }
}

function renderAIComparison(host, comparison, months) {
  const goal = (value) =>
    value === null
      ? "기간 내 미달성"
      : value === 0
        ? "시작 시점 달성"
        : value + "개월차";
  const signed = (value, unit) =>
    (value > 0 ? "+" : "") + value.toLocaleString("ko-KR") + unit;
  const caption = document.createElement("p");
  caption.className = "ai-comparison-caption";
  caption.textContent =
    "같은 " + months + "개월을 계산한 변경 전후 결과입니다.";
  const list = document.createElement("dl");
  list.className = "ai-comparison-metrics";
  const metrics = [
    ["원본 목표 최초 달성", goal(comparison.baseGoalMonth)],
    ["새 계획 목표 최초 달성", goal(comparison.candidateGoalMonth)],
    [
      months + "개월 말 총자산 차이",
      signed(comparison.finalAssetsDifference, "원"),
    ],
    [
      "현금 부족 기간 차이",
      signed(comparison.shortageMonthsDifference, "개월"),
    ],
  ];
  for (const [label, text] of metrics) {
    const card = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = text;
    card.append(term, value);
    list.append(card);
  }
  const note = document.createElement("p");
  note.className = "ai-comparison-caption";
  note.textContent =
    "차이 = 새 계획 − 원본. 부족 기간은 줄어들수록 현금이 부족한 달이 적습니다. 실제 미래를 예측한 값은 아닙니다.";
  host.replaceChildren(caption, list, note);
}
