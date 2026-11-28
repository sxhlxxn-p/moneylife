function installNewsComparison(news) {
  news.compareSnapshots = async function (host, session, list, selected) {
    if (session.busy || selected.size < 2 || selected.size > 3) return;
    session.busy = true;
    const status = list.querySelector(".news-comparison-status");
    status.textContent = "같은 라운드의 저장 결과를 비교하는 중이에요.";
    list.querySelectorAll("button,input").forEach((node) => {
      node.disabled = true;
    });
    try {
      const result = await apiRequest("news-game-comparisons", "", {
        method: "POST",
        body: JSON.stringify({
          recordIds: [...selected.keys()],
        }),
      });
      if (!host.isConnected || !list.isConnected) return;
      list.replaceChildren(
        news.el("div", "같은 뉴스, 다른 대응", "eyebrow"),
        news.el("h4", `${result.throughRound}라운드까지 대응을 비교했어요`),
        news.el(
          "p",
          `출발 순자산 ${news.won(result.initialAssets)} · 계속 보유한 경우 ${news.won(result.heldAssets)}. 선택한 기록이 모두 진행한 구간만 비교해요.`,
          "paper-caption",
        ),
      );
      const cards = news.el("div", undefined, "news-comparison-cards");
      for (const [index, path] of result.paths.entries()) {
        const card = news.el("article");
        card.append(
          news.el(
            "h4",
            `${String.fromCharCode(65 + index)} · ${index ? "비교 기록" : "기준 기록"}`,
          ),
          news.el(
            "small",
            `저장 ${path.savedRounds}라운드 / 비교 ${result.throughRound}라운드`,
          ),
          news.el("strong", news.won(path.finalAssets)),
          news.el(
            "p",
            `현금 ${news.won(path.cash)} · 주식 평가액 ${news.won(path.stockValue)}`,
          ),
          news.el("p", `누적 주가 손익 ${news.signed(path.stockChange)}`),
          news.el(
            "p",
            `뉴스에 따른 소득 변화 ${news.signed(path.incomeChange)} · 추가 생활비 ${news.signed(path.expenseChange)}`,
          ),
          news.el("p", `새로 발생한 생활비 부족액 ${news.won(path.shortfall)}`),
          news.el(
            "p",
            index
              ? `A 대비 순자산 ${news.signed(path.assetsDifference)}`
              : "선택한 첫 기록을 차이의 기준으로 사용해요.",
            "paper-caption",
          ),
        );
        cards.append(card);
      }
      list.append(cards, news.comparisonChart(result));
      const details = news.el("div", undefined, "news-round-comparison");
      for (let round = 0; round < result.throughRound; round++) {
        const row = news.el("article");
        row.append(
          news.el("h4", `${round + 1}. ${NewsScenario.events[round].title}`),
        );
        for (const [index, path] of result.paths.entries()) {
          const value = path.history[round];
          row.append(
            news.el(
              "p",
              `${String.fromCharCode(65 + index)} · ${NewsScenario.actions[value.action]} / 주가 손익 ${news.signed(value.stockChange)} / 순자산 ${news.won(value.total)}`,
            ),
          );
        }
        details.append(row);
      }
      list.append(
        details,
        news.el(
          "p",
          "동일한 가상 뉴스 조건에서 저장한 대응만 비교해요. 실제 투자 성과나 미래 수익을 평가하지 않습니다. 비교는 현재 게임 진행과 서버 기록을 바꾸지 않아요.",
          "paper-caption",
        ),
        news.button("뉴스 기록 다시 선택", () =>
          news.loadSnapshots(host, session),
        ),
        news.button("게임으로 돌아가기", () => news.draw(host, session)),
      );
      list.scrollIntoView({
        block: "start",
      });
    } catch (error) {
      if (status.isConnected) status.textContent = error.message;
    } finally {
      session.busy = false;
      if (list.isConnected)
        list.querySelectorAll("button,input").forEach((node) => {
          node.disabled = node.dataset.newsNeedsSelection === "true";
        });
    }
  };
  news.comparisonChart = function (result) {
    const paths = result.paths.map((path) => [
      result.initialAssets,
      ...path.history.map((row) => row.total),
    ]);
    const min = Math.min(...paths.flat()),
      max = Math.max(...paths.flat()),
      range = max - min || 1;
    const figure = news.el("figure", undefined, "paper-chart");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 160");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `${result.throughRound}라운드까지 ${paths.length}개 뉴스 대응 기록의 순자산 비교`,
    );
    paths.forEach((values, index) => {
      const line = document.createElementNS(svg.namespaceURI, "path");
      line.setAttribute(
        "d",
        values
          .map(
            (value, i) =>
              `${i ? "L" : "M"}${12 + (i / result.throughRound) * 576},${148 - ((value - min) / range) * 136}`,
          )
          .join(" "),
      );
      line.setAttribute("class", "paper-branch-line-" + index);
      svg.append(line);
    });
    figure.append(
      news.el("figcaption", "공통 라운드 순자산 · A 진녹색 / B 연두 / C 황토"),
      svg,
    );
    return figure;
  };
  news.chart = function (session) {
    const selected = [
      NewsScenario.total(session.seed),
      ...session.history.map((row) => row.total),
    ];
    let baseline = {
      ...session.seed,
    };
    const held = [NewsScenario.total(baseline)];
    session.history.forEach((row, index) => {
      const result = NewsScenario.play(
        baseline,
        NewsScenario.events[index].id,
        "hold",
      );
      baseline = result.state;
      held.push(result.total);
    });
    const min = Math.min(...selected, ...held),
      max = Math.max(...selected, ...held),
      range = max - min || 1;
    const figure = news.el("figure", undefined, "paper-chart");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 160");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "진행한 뉴스 라운드의 나의 선택과 계속 보유한 경우 순자산 비교",
    );
    [held, selected].forEach((values, index) => {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        values
          .map(
            (value, i) =>
              `${i ? "L" : "M"}${12 + (i / session.history.length) * 576},${148 - ((value - min) / range) * 136}`,
          )
          .join(" "),
      );
      path.setAttribute(
        "class",
        index ? "paper-line-invested" : "paper-line-baseline",
      );
      svg.append(path);
    });
    figure.append(
      news.el(
        "figcaption",
        "연습 순자산 · 진녹색 실선: 나의 대응 / 회색 점선: 계속 보유",
      ),
      svg,
      news.el(
        "p",
        `같은 뉴스 조건의 현재 결과: 나의 대응 ${news.won(selected.at(-1))} / 계속 보유 ${news.won(held.at(-1))}`,
        "paper-caption",
      ),
    );
    return figure;
  };
}
