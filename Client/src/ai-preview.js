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
