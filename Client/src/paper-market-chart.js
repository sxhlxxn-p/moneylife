function paperPriceWindow(rows, throughMonth, months = null) {
  const start = months === null ? 0 : Math.max(0, throughMonth - months + 1);
  return rows
    .filter((row) => row.month >= start && row.month <= throughMonth)
    .map((row) => ({
      month: row.month,
      price:
        row.investment?.priceMonth === row.month &&
        Number.isSafeInteger(row.investment?.price) &&
        row.investment.price > 0
          ? row.investment.price
          : null,
    }));
}
function installPaperMarketChart(paper) {
  paper.marketChart = function (plan, invested) {
    const panel = paper.node("section", undefined, "stock-market");
    const source = plan.source,
      rows = invested.monthlyResults.filter((row) => row.month <= plan.month);
    const position = rows.at(-1).investment;
    const title = paper.node("div", undefined, "stock-symbol");
    title.append(
      paper.node("span", source.symbol.slice(0, 2), "stock-symbol-icon"),
      paper.node("h3", source.symbol),
      paper.node("span", paper.dataLabel(source), "stock-data-tag"),
    );
    const quote = paper.node("div", undefined, "stock-quote");
    quote.append(
      paper.node(
        "strong",
        position.price === null ? "가격 없음" : paper.won(position.price),
      ),
    );
    const previous = rows.find(
      (row) => row.month === plan.month - 1,
    )?.investment;
    const delta =
      position.price !== null &&
      !position.stale &&
      previous?.price !== null &&
      previous?.priceMonth === plan.month - 1
        ? position.price - previous.price
        : null;
    const change = paper.node(
      "span",
      delta === null
        ? plan.month === 0
          ? "첫 기준 가격"
          : "전월비 계산 불가"
        : `전월 대비 ${paper.signed(delta)} (${delta > 0 ? "+" : ""}${((delta / previous.price) * 100).toFixed(2)}%)`,
      delta === null || delta === 0
        ? "stock-flat"
        : delta > 0
          ? "stock-up"
          : "stock-down",
    );
    quote.append(change);
    panel.append(
      title,
      quote,
      paper.node(
        "p",
        `${paper.marketDate(source, plan.month)} 기준${position.stale ? " · 해당 월 가격 없음, 이전 가격으로 평가 중" : ""}`,
        "stock-price-date",
      ),
    );
    const tools = paper.node("div", undefined, "stock-chart-tools");
    tools.append(paper.node("strong", "월별 종가"));
    const ranges = paper.node("div", undefined, "stock-ranges");
    const plot = paper.node("div", undefined, "stock-plot");
    const readout = paper.node("p", undefined, "stock-readout");
    readout.setAttribute("aria-live", "polite");
    const slider = paper.node("input", undefined, "stock-scrubber");
    slider.type = "range";
    slider.min = "0";
    slider.step = "1";
    slider.setAttribute("aria-label", "주가 시점 탐색");
    const table = paper.node("details", undefined, "stock-price-table");
    table.append(paper.node("summary", "월별 가격 데이터 보기"));
    const list = paper.node("div");
    table.append(list);
    function draw(months) {
      const points = paperPriceWindow(rows, plan.month, months);
      const valid = points.filter((point) => point.price !== null);
      plot.replaceChildren();
      list.replaceChildren();
      for (const point of points)
        list.append(
          paper.node(
            "p",
            `${paper.marketDate(source, point.month)} · ${point.price === null ? "가격 없음" : paper.won(point.price)}`,
          ),
        );
      slider.max = String(Math.max(0, points.length - 1));
      slider.value = slider.max;
      slider.disabled = points.length <= 1;
      if (!valid.length) {
        plot.append(
          paper.node("p", "이 구간에는 관측된 가격이 없어요.", "stock-no-data"),
        );
        readout.textContent = "가격 데이터 없음";
        slider.oninput = null;
        return;
      }
      const width = 800,
        height = 310,
        left = 14,
        right = 103,
        top = 26,
        bottom = 36;
      const rawMin = Math.min(...valid.map((point) => point.price)),
        rawMax = Math.max(...valid.map((point) => point.price));
      const padding = Math.max(1, (rawMax - rawMin) * 0.15, rawMax * 0.015);
      const min = Math.max(0, rawMin - padding),
        max = rawMax + padding;
      const first = points[0].month,
        last = points.at(-1).month;
      const x = (month) =>
        first === last
          ? (width - right + left) / 2
          : left + ((month - first) / (last - first)) * (width - left - right);
      const y = (price) =>
        top + ((max - price) / (max - min)) * (height - top - bottom);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        `${source.symbol} · ${first}~${last}개월의 월별 종가 차트`,
      );
      const add = (tag, attrs, text) => {
        const node = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs))
          node.setAttribute(key, String(value));
        if (text !== undefined) node.textContent = text;
        svg.append(node);
        return node;
      };
      for (let tick = 0; tick <= 4; tick++) {
        const price = min + ((max - min) * tick) / 4;
        add("line", {
          x1: left,
          y1: y(price),
          x2: width - right,
          y2: y(price),
          class: "stock-grid",
        });
        add(
          "text",
          { x: width - right + 12, y: y(price) + 4, class: "stock-axis" },
          Math.round(price).toLocaleString("ko-KR"),
        );
      }
      for (const month of [
        ...new Set([first, Math.round((first + last) / 2), last]),
      ]) {
        add(
          "text",
          {
            x: x(month),
            y: height - 10,
            "text-anchor":
              month === first && first !== last
                ? "start"
                : month === last && first !== last
                  ? "end"
                  : "middle",
            class: "stock-axis",
          },
          paper.marketDate(source, month).replace("년 ", ".").replace("월", ""),
        );
      }
      let segment = [];
      const flush = () => {
        if (!segment.length) return;
        const d = segment
          .map(
            (point, index) =>
              `${index ? "L" : "M"}${x(point.month)} ${y(point.price)}`,
          )
          .join(" ");
        if (segment.length > 1)
          add("path", {
            d: `${d} L${x(segment.at(-1).month)} ${height - bottom} L${x(segment[0].month)} ${height - bottom} Z`,
            class: "stock-area",
          });
        add("path", { d, class: "stock-price-line" });
        for (const point of segment)
          add("circle", {
            cx: x(point.month),
            cy: y(point.price),
            r: segment.length === 1 ? 4 : 2,
            class: "stock-price-dot",
          });
        segment = [];
      };
      for (const point of points) {
        if (point.price === null) flush();
        else segment.push(point);
      }
      flush();
      const average = Number(position.averageCost);
      if (
        position.quantity > 0 &&
        Number.isFinite(average) &&
        average >= min &&
        average <= max
      ) {
        add("line", {
          x1: left,
          y1: y(average),
          x2: width - right,
          y2: y(average),
          class: "stock-average",
        });
        add(
          "text",
          { x: left + 5, y: y(average) - 7, class: "stock-average-label" },
          `내 평균 ${paper.won(Math.round(average))}`,
        );
      }
      for (const trade of invested.executions.filter(
        (trade) =>
          trade.status === "filled" &&
          trade.executionMonth >= first &&
          trade.executionMonth <= last &&
          trade.executionMonth <= plan.month,
      )) {
        if (!valid.some((point) => point.month === trade.executionMonth))
          continue;
        add(
          "text",
          {
            x: x(trade.executionMonth),
            y: y(trade.price) + (trade.order.side === "buy" ? 23 : -15),
            "text-anchor": "middle",
            class:
              trade.order.side === "buy" ? "stock-buy-mark" : "stock-sell-mark",
          },
          trade.order.side === "buy" ? "매수" : "매도",
        );
      }
      const vertical = add("line", {
        x1: 0,
        y1: top,
        x2: 0,
        y2: height - bottom,
        class: "stock-crosshair",
      });
      const dot = add("circle", {
        cx: 0,
        cy: 0,
        r: 5,
        class: "stock-selected-dot",
      });
      function select(index) {
        const point = points[index];
        if (!point) return;
        readout.textContent = `${paper.marketDate(source, point.month)} · ${point.price === null ? "가격 없음" : paper.won(point.price)}`;
        slider.value = String(index);
        vertical.setAttribute("x1", x(point.month));
        vertical.setAttribute("x2", x(point.month));
        dot.setAttribute(
          "visibility",
          point.price === null ? "hidden" : "visible",
        );
        if (point.price !== null) {
          dot.setAttribute("cx", x(point.month));
          dot.setAttribute("cy", y(point.price));
        }
      }
      svg.addEventListener("pointermove", (event) => {
        const rect = svg.getBoundingClientRect();
        const month =
          first +
          Math.max(
            0,
            Math.min(
              1,
              (((event.clientX - rect.left) / rect.width) * width) /
                (width - right - left) -
                left / (width - right - left),
            ),
          ) *
            (last - first);
        select(
          points.reduce(
            (best, point, i) =>
              Math.abs(point.month - month) <
              Math.abs(points[best].month - month)
                ? i
                : best,
            0,
          ),
        );
      });
      slider.oninput = () => select(Number(slider.value));
      plot.append(svg);
      select(points.length - 1);
    }
    for (const [label, months] of [
      ["6개월", 6],
      ["1년", 12],
      ["전체", null],
    ]) {
      const button = paper.node("button", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(months === null));
      button.addEventListener("click", () => {
        for (const node of ranges.children)
          node.setAttribute("aria-pressed", String(node === button));
        draw(months);
      });
      ranges.append(button);
    }
    tools.append(ranges);
    panel.append(
      tools,
      readout,
      plot,
      slider,
      paper.node(
        "p",
        "현재 진행 월까지의 종가만 표시 · 점선: 내 평균 매입가 · 매수/매도: 실제 모의 체결",
        "stock-chart-note",
      ),
      table,
    );
    draw(null);
    return panel;
  };
}
