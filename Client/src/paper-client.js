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
  return { open: paper.open };
})();
