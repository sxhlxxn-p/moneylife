function createPaperContext() {
  const paper = {
    referenceKey: "money-life-paper-plan",
    current: null,
    explanations: new Map(),
    sources: [],
    selectedSeriesId: null,
    reference: null,
    won: (value) => value.toLocaleString("ko-KR") + "원",
    signed: (value) => (value > 0 ? "+" : "") + paper.won(value),
    goal: (value) =>
      value === null
        ? "아직 미달성"
        : value === 0
          ? "시작 시점"
          : `${value}개월차`,
  };
  paper.queue = createPaperRequests(() => localStorage);
  try {
    paper.reference = localStorage.getItem(paper.referenceKey);
  } catch {}
  paper.resetForSession = function (reason = "session-renewed") {
    paper.queue.archive(reason);
    localStorage.removeItem(paper.referenceKey);
    paper.current = null;
    paper.reference = null;
    paper.explanations.clear();
    if (paper.render) paper.render();
  };
  return paper;
}
