const NewsGame = (() => {
  const news = {
    sessions: new Map(),
    storageKey: "money-life-news-rounds-v1",
    won: (value) => value.toLocaleString("ko-KR") + "원",
    signed: (value) => (value > 0 ? "+" : "") + news.won(value),
  };
  installNewsView(news);
  installNewsRecords(news);
  installNewsComparison(news);
  installNewsRound(news);
  window.addEventListener("moneylife:session-renewed", () =>
    news.sessions.clear(),
  );
  return { start: news.start, demo: news.demo };
})();
