const PaperTrading = (() => {
  const paper = createPaperContext();
  installPaperView(paper);
  installPaperOrders(paper);
  installPaperComparison(paper);
  installPaperConditions(paper);
  installPaperSession(paper);
  installPaperCommands(paper);
  installPaperCharts(paper);
  installPaperExplanation(paper);
  window.addEventListener("moneylife:session-renewed", () => {
    try {
      paper.resetForSession();
    } catch {
      paper.message(
        "이전 요청을 별도 보관하지 못했어요. 브라우저 저장 공간을 확인해주세요.",
      );
    }
  });
  return { open: paper.open };
})();
