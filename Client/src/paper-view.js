function installPaperView(paper) {
  paper.marketDate = function (source, offset) {
    if (!source.historicalStartMonth) return dates(offset);
    const [year, month] = source.historicalStartMonth.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  };
  paper.dataLabel = function (source) {
    return source.dataKind === "historical-market"
      ? "실제 과거 주가"
      : "가상 가격";
  };
  paper.node = function (tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  paper.button = function (text, action, disabled = false, primary = false) {
    const el = paper.node("button", text, primary ? "btn primary" : "btn");
    el.type = "button";
    el.dataset.planAction = "paper";
    el.dataset.paperDisabled = String(disabled);
    el.disabled = disabled || serverPlanBusy;
    el.addEventListener("click", action);
    return el;
  };
  paper.message = function (text) {
    const el = $("paperstatus");
    if (el) el.textContent = text;
  };
  paper.available = function () {
    return !serverPlanBusy && !paper.queue.get();
  };
  paper.remember = function (bundle) {
    paper.current = bundle;
    paper.reference = bundle.plan.id;
    localStorage.setItem(paper.referenceKey, paper.reference);
  };
  paper.render = function () {
    const root = $("papercontent");
    root.replaceChildren();
    const controls = paper.node("div", undefined, "paper-toolbar");
    controls.append(
      paper.button(
        "새 투자 연습",
        () => paper.setup(),
        Boolean(paper.queue.get()),
      ),
      paper.button(
        "저장한 투자 연습",
        () => paper.list(),
        Boolean(paper.queue.get()),
      ),
    );
    if (paper.current)
      controls.append(
        paper.button(
          "생활 조건 변경",
          paper.editConditions,
          Boolean(paper.queue.get()) ||
            paper.current.plan.month >= paper.current.plan.source.lastMonth,
        ),
        paper.button(
          "투자 사본 비교",
          paper.compareSavedPlans,
          Boolean(paper.queue.get()),
        ),
      );
    root.append(controls);
    if (paper.queue.get()) {
      const box = paper.node("div", undefined, "paper-warning");
      box.append(
        paper.node("strong", "처리 결과를 확인해야 하는 요청이 있어요."),
        paper.node(
          "p",
          "같은 요청 번호로 다시 확인합니다. 확인 전에는 다른 주문이나 월 진행을 할 수 없어요.",
        ),
        paper.button(
          "같은 요청 다시 확인",
          () => paper.sendPending(),
          false,
          true,
        ),
      );
      root.append(box);
    }
    if (!paper.current) {
      root.append(
        paper.node(
          "p",
          "재무 조건의 사본으로 투자 연습을 시작하거나, 저장한 투자 연습을 불러오세요.",
          "paper-empty",
        ),
      );
      return;
    }
    const { plan, run } = paper.current;
    const { invested, baseline, comparison } = run.result;
    const final = invested.monthlyResults.at(-1);
    const position = final.investment;
    const heading = paper.node("div", undefined, "paper-heading");
    heading.append(
      paper.node("h3", plan.name),
      paper.node(
        "span",
        `${plan.month} / ${plan.source.lastMonth}개월 · 가격 기준 ${paper.marketDate(plan.source, plan.month)}`,
        "paper-date",
      ),
    );
    if (plan.action === "conditions")
      root.append(
        paper.node(
          "p",
          "생활 조건을 바꾼 사본이에요. 새 조건은 다음 달부터 반영되며 지금까지의 자산과 거래 기록은 유지됩니다.",
          "paper-status",
        ),
      );
    root.append(
      heading,
      paper.node(
        "p",
        `${plan.source.symbol} · ${paper.dataLabel(plan.source)} · 수수료·세율 0 가정`,
        "paper-caption",
      ),
    );
    if (plan.source.dataKind === "historical-market") {
      const provenance = paper.node("div", undefined, "paper-provenance");
      provenance.append(
        paper.node(
          "p",
          `${plan.source.label} · ${plan.source.provider} · 주가 기간 ${plan.source.historicalStartMonth}~${plan.source.historicalEndMonth}`,
        ),
        paper.node(
          "p",
          "각 월에 수집된 마지막 일봉의 원화 종가를 재생합니다. 수정주가·주식 분할·배당은 반영하지 않아요. 과거 수익은 미래 수익을 뜻하지 않습니다.",
        ),
      );
      if (plan.source.sourceUrl) {
        const link = paper.node("a", "가격 출처 확인");
        link.href = plan.source.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        provenance.append(link);
      }
      root.append(provenance);
    }
    const metrics = paper.node("div", undefined, "paper-metrics");
    for (const [label, value] of [
      ["사용 가능한 현금", paper.won(final.cash)],
      ["보유 주식", `${position.quantity.toLocaleString("ko-KR")}주`],
      ["주식 평가액", paper.won(position.marketValue)],
      ["평가 손익", paper.signed(position.unrealizedPnl)],
      ["실현 손익", paper.signed(position.realizedPnl)],
      ["투자 포함 순자산", paper.won(final.total)],
    ]) {
      const card = paper.node("div");
      card.append(paper.node("small", label), paper.node("strong", value));
      metrics.append(card);
    }
    root.append(metrics);
    const quote =
      position.price === null ? "가격 없음" : paper.won(position.price);
    root.append(
      paper.node(
        "p",
        `현재 평가 가격 ${quote}${position.stale ? " · 이전 유효 가격으로 평가 중" : ""}${position.priceMonth === null ? "" : " · " + paper.marketDate(plan.source, position.priceMonth)}. 주문은 다음 달 가격으로 체결 여부가 결정됩니다.`,
        "paper-caption",
      ),
    );
    const form = paper.node("form", undefined, "paper-order");
    const label = paper.node("label", "주문 수량 · 주");
    label.htmlFor = "paperquantity";
    const input = paper.node("input");
    input.type = "number";
    input.id = "paperquantity";
    input.min = "1";
    input.max = "1000000000";
    input.step = "1";
    input.value = "1";
    input.inputMode = "numeric";
    input.dataset.planAction = "paper-input";
    input.dataset.paperDisabled = String(
      Boolean(paper.queue.get()) || plan.month >= plan.source.lastMonth,
    );
    input.disabled = serverPlanBusy || input.dataset.paperDisabled === "true";
    const buy = paper.button(
      "매수 예약",
      () => paper.submitOrder("buy"),
      Boolean(paper.queue.get()) || plan.month >= plan.source.lastMonth,
      true,
    );
    const sell = paper.button(
      "매도 예약",
      () => paper.submitOrder("sell"),
      Boolean(paper.queue.get()) ||
        plan.month >= plan.source.lastMonth ||
        position.quantity === 0,
    );
    form.append(label, input, buy, sell);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      paper.submitOrder("buy");
    });
    root.append(form);
    const time = paper.node("div", undefined, "paper-toolbar");
    time.append(
      paper.button(
        "다음 달로 +1개월",
        () =>
          paper.command("advance", {
            months: 1,
          }),
        Boolean(paper.queue.get()) || plan.month >= plan.source.lastMonth,
        true,
      ),
      paper.node(
        "span",
        plan.month >= plan.source.lastMonth
          ? "가격 데이터의 마지막 달에 도착했어요."
          : "생활비 → 주문 체결 → 저축 순서로 반영해요.",
        "paper-caption",
      ),
    );
    root.append(time);
    const pendingList = paper.node("div", undefined, "paper-orders");
    pendingList.append(paper.node("h4", "다음 달 체결 대기"));
    if (!invested.pendingOrders.length)
      pendingList.append(paper.node("p", "대기 중인 주문이 없어요."));
    for (const order of invested.pendingOrders) {
      const row = paper.node("div", undefined, "paper-pending-row");
      row.append(
        paper.node(
          "p",
          `${order.side === "buy" ? "매수" : "매도"} ${order.quantity.toLocaleString("ko-KR")}주 · ${paper.marketDate(plan.source, order.submittedMonth + 1)} 체결 예정`,
        ),
        paper.button(
          "주문 취소",
          () => paper.reviewCancellation(order),
          Boolean(paper.queue.get()),
        ),
      );
      pendingList.append(row);
    }
    if (plan.action === "cancel")
      pendingList.append(
        paper.node(
          "p",
          "주문 취소를 반영한 사본이에요. 이전 시점의 기록은 저장한 투자 연습에 남아 있어요.",
          "paper-caption",
        ),
      );
    root.append(
      pendingList,
      paper.chart(invested.monthlyResults, baseline.monthlyResults),
    );
    const compare = paper.node("div", undefined, "paper-comparison");
    compare.append(
      paper.node("h4", "같은 조건에서 투자하지 않았다면?"),
      paper.node(
        "p",
        `현재 순자산 차이 ${paper.signed(comparison.finalAssetsDifference)} · 투자 ${paper.won(final.total)} / 비투자 ${paper.won(baseline.summary.finalNetAssets)}`,
      ),
      paper.node(
        "p",
        `목표 최초 달성: 투자 ${paper.goal(invested.summary.goalMonth)} / 비투자 ${paper.goal(baseline.summary.goalMonth)}`,
      ),
      paper.node(
        "p",
        `현금 부족: 투자 ${invested.summary.shortageMonths}개월 / 비투자 ${baseline.summary.shortageMonths}개월 · 투자 계획 미충족 지출 ${paper.won(final.unpaid)}`,
      ),
    );
    const news = paper.node("section", undefined, "news-investment-entry");
    news.append(
      paper.node("span", "NEWS SIMULATION", "tag"),
      paper.node("h3", "내 포트폴리오에 경제 뉴스가 찾아온다면?"),
      paper.node(
        "p",
        "금리·물가·고용 변화에 대응하며 가정한 손실과 현금 부족을 체험해요. 원본과 분리된 4라운드 연습이에요.",
      ),
      paper.button(
        "내 투자로 뉴스 체험",
        paper.startNews,
        Boolean(paper.queue.get()) || position.price === null,
        true,
      ),
    );
    root.append(news, compare, paper.explanationPanel(run.id));
    const tableBox = paper.node("details", undefined, "paper-history");
    tableBox.append(
      paper.node("summary", `체결·거부 기록 ${invested.executions.length}건`),
    );
    const scroll = paper.node("div", undefined, "run-table-scroll");
    const table = paper.node("table");
    const head = paper.node("thead");
    const tr = paper.node("tr");
    for (const title of ["체결 월", "구분", "수량", "결과", "가격 / 거부 사유"])
      tr.append(paper.node("th", title));
    head.append(tr);
    table.append(head);
    const body = paper.node("tbody");
    const reasons = {
      INSUFFICIENT_CASH: "현금 부족",
      INSUFFICIENT_SHARES: "보유 주식 부족",
      PRICE_UNAVAILABLE: "가격 없음",
      NOT_TRADABLE: "거래 불가",
      COST_EXCEEDS_PROCEEDS: "비용이 매도 대금 초과",
      SYMBOL_MISMATCH: "종목 불일치",
    };
    for (const entry of [...invested.executions].reverse()) {
      const row = paper.node("tr");
      for (const value of [
        paper.marketDate(plan.source, entry.executionMonth),
        entry.order.side === "buy" ? "매수" : "매도",
        `${entry.order.quantity}주`,
        entry.status === "filled" ? "체결" : "거부",
        entry.status === "filled"
          ? paper.won(entry.price)
          : reasons[entry.reason] || entry.reason,
      ])
        row.append(paper.node("td", value));
      body.append(row);
    }
    table.append(body);
    scroll.append(table);
    tableBox.append(scroll);
    root.append(tableBox);
  };
}
