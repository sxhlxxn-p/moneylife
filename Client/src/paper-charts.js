function installPaperCharts(paper) {
  paper.chart = function (invested, baseline) {
    const wrap = paper.node("figure", undefined, "paper-chart");
    const width = 640,
      height = 170,
      left = 10,
      top = 15;
    const values = [...invested, ...baseline].map((row) => row.total);
    const min = Math.min(...values),
      max = Math.max(...values),
      range = max - min || 1;
    const lastMonth = invested.at(-1).month;
    const xy = (row) =>
      `${left + (row.month / Math.max(1, lastMonth)) * (width - 2 * left)},${height - top - ((row.total - min) / range) * (height - 2 * top)}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `시작부터 ${lastMonth}개월까지 투자와 비투자 순자산 비교`,
    );
    [baseline, invested].forEach((rows, i) => {
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        rows.map((row, index) => (index ? "L" : "M") + xy(row)).join(" "),
      );
      path.setAttribute(
        "class",
        i ? "paper-line-invested" : "paper-line-baseline",
      );
      svg.append(path);
      const dot = document.createElementNS(svg.namespaceURI, "circle");
      const [x, y] = xy(rows.at(-1)).split(",");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", "4");
      dot.setAttribute(
        "class",
        i ? "paper-dot-invested" : "paper-dot-baseline",
      );
      svg.append(dot);
    });
    wrap.append(
      paper.node(
        "figcaption",
        "지금까지의 순자산 · 보라: 투자 / 회색 점선: 비투자",
      ),
      svg,
      paper.node(
        "p",
        `0 → ${lastMonth}개월 · 최저 ${paper.won(min)} / 최고 ${paper.won(max)}`,
        "paper-caption",
      ),
    );
    return wrap;
  };
  paper.branchChart = function (paths, throughMonth) {
    const figure = paper.node("figure", undefined, "paper-chart");
    const width = 640,
      height = 170,
      pad = 12;
    const values = paths.flatMap((path) =>
      path.monthlyResults.map((row) => row.total),
    );
    const min = Math.min(...values),
      max = Math.max(...values),
      range = max - min || 1;
    const point = (row) => [
      pad + (row.month / Math.max(1, throughMonth)) * (width - pad * 2),
      height - pad - ((row.total - min) / range) * (height - pad * 2),
    ];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `선택한 ${paths.length}개 사본의 ${throughMonth}개월까지 순자산 비교`,
    );
    paths.forEach((path, index) => {
      const line = document.createElementNS(svg.namespaceURI, "path");
      line.setAttribute(
        "d",
        path.monthlyResults
          .map((row, i) => (i ? "L" : "M") + point(row).join(","))
          .join(" "),
      );
      line.setAttribute("class", "paper-branch-line-" + index);
      svg.append(line);
      const [x, y] = point(path.monthlyResults.at(-1));
      const dot = document.createElementNS(svg.namespaceURI, "circle");
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", "4");
      dot.setAttribute("class", "paper-branch-dot-" + index);
      svg.append(dot);
    });
    figure.append(
      paper.node("figcaption", "순자산 경로 · A 보라 / B 초록 / C 황토"),
      svg,
      paper.node(
        "p",
        `0~${throughMonth}개월 · 최저 ${paper.won(min)} / 최고 ${paper.won(max)}`,
        "paper-caption",
      ),
    );
    return figure;
  };
}
