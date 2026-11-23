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
    let failed = false;
    try {
      paper.queue.archive(reason);
    } catch {
      paper.queue.suspend();
      failed = true;
    }
    try {
      localStorage.removeItem(paper.referenceKey);
    } catch {
      failed = true;
    }
    paper.current = null;
    paper.reference = null;
    paper.explanations.clear();
    if (paper.render) paper.render();
    if (failed)
      throw new Error(
        "이전 요청은 전송을 중지했어요. 보관하려면 브라우저 저장 공간을 확인해주세요.",
      );
  };
  return paper;
}
