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
  window.addEventListener("moneylife:session-renewed", (event) => {
    try {
      paper.resetForSession();
    } catch (error) {
      if (event.detail?.warnings) event.detail.warnings.push(error.message);
      paper.message(
        "이전 요청을 별도 보관하지 못했어요. 브라우저 저장 공간을 확인해주세요.",
      );
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "money-life-paper-pending" && !serverPlanBusy)
      paper.render();
  });
  return { open: paper.open };
})();
