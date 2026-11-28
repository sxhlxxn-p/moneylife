function installPaperSession(paper) {
  paper.open = async function () {
    if (serverPlanBusy) return;
    if (typeof mlShowPage === "function") mlShowPage("investment");
    stop();
    $("paperlab").classList.remove("hidden");
    $("paperlab").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setPlanBusy(true);
    paper.render();
    paper.message("투자 연습을 불러오는 중이에요.");
    try {
      let catalogError = "";
      try {
        paper.sources = await apiRequest("market", "/series");
        if (
          !paper.sources.some(
            (source) => source.priceSeriesId === paper.selectedSeriesId,
          )
        )
          paper.selectedSeriesId = paper.sources[0]?.priceSeriesId;
      } catch (error) {
        paper.sources = [];
        catalogError = error.message;
      }
      if (paper.reference && !paper.current) {
        const plan = await apiRequest(
          "paper-plans",
          "/" + encodeURIComponent(paper.reference),
        );
        const run = await apiRequest(
          "paper-runs",
          "/" + encodeURIComponent(plan.runId),
        );
        paper.current = {
          plan,
          run,
        };
      }
      paper.message(
        paper.queue.get()
          ? "확인하지 못한 요청이 있어요. 같은 요청 다시 확인을 눌러주세요."
          : paper.current
            ? "저장된 투자 연습이에요. 본편의 재무 조건과 시간은 유지됩니다." +
              (catalogError
                ? " 새 가격 목록은 불러오지 못했지만 저장된 가격으로 진행할 수 있어요."
                : "")
            : catalogError || "현재 여정 또는 예시 조건으로 시작할 수 있어요.",
      );
    } catch (error) {
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
      paper.render();
      if (!paper.current && !paper.queue.get()) paper.setup();
    }
  };
  paper.setup = function () {
    if (!paper.available()) return;
    const selectingSource = document.activeElement?.id === "paperseries";
    paper.render();
    const box = paper.node("div", undefined, "paper-setup");
    box.append(
      paper.node("h3", "어떤 조건으로 시작할까요?"),
      paper.node(
        "p",
        "현재 여정의 재무 조건은 사본으로 보관해요. 투자 연습에서 진행한 시간과 주문은 본편을 바꾸지 않아요.",
      ),
    );
    if (!paper.sources.length) {
      box.append(
        paper.node("p", "서버와 가격 목록을 확인한 후 다시 열어주세요."),
        paper.button("다시 연결", paper.open),
      );
    } else {
      const label = paper.node("label", "사용할 가격 데이터");
      label.htmlFor = "paperseries";
      const select = paper.node("select");
      select.id = "paperseries";
      select.dataset.planAction = "paper-source";
      for (const item of paper.sources) {
        const option = paper.node(
          "option",
          `${item.symbol} · ${paper.dataLabel(item)} · ${item.label}`,
        );
        option.value = item.priceSeriesId;
        option.selected = item.priceSeriesId === paper.selectedSeriesId;
        select.append(option);
      }
      select.addEventListener("change", () => {
        paper.selectedSeriesId = select.value;
        paper.setup();
      });
      box.append(label, select);
      if (!paper.sources.some((item) => item.dataKind === "historical-market"))
        box.append(
          paper.node(
            "p",
            "실제 과거 주가 자료는 아직 등록되지 않았어요. 지금은 가상 가격으로 체험할 수 있어요.",
            "paper-warning",
          ),
        );
      const source =
        paper.sources.find(
          (item) => item.priceSeriesId === paper.selectedSeriesId,
        ) || paper.sources[0];
      if (source.dataKind === "historical-market")
        box.append(
          paper.node(
            "p",
            `주가 재생 기간 ${source.historicalStartMonth}~${source.historicalEndMonth}. 경과 월 0은 이 기간의 첫 달에 대응해요.`,
          ),
        );
      box.append(
        paper.node(
          "p",
          `지원 기간은 시작 후 ${source.lastMonth}개월까지예요. 지금 ${JourneyStore.current.month}개월차 여정은 ${JourneyStore.current.month <= source.lastMonth ? "사본으로 시작할 수 있어요." : "지원 기간을 지났어요. 예시 조건으로 체험해주세요."}`,
        ),
        paper.button(
          "현재 여정의 사본으로 시작",
          () => paper.create(false),
          JourneyStore.current.month > source.lastMonth,
          true,
        ),
        paper.button("예시 조건으로 체험", () => paper.create(true)),
        paper.node(
          "p",
          "예시: 현금 100만 원 · 월 소득 20만 원 · 생활비 10만 원 · 저축 5만 원 · 목표 125만 원 · 저축 금리 0%.",
          "paper-caption",
        ),
      );
    }
    paper.showPanel(box);
    if (selectingSource) $("paperseries")?.focus();
  };
  paper.create = async function (example) {
    if (!paper.available() || !paper.sources.length) return;
    stop();
    const source =
      paper.sources.find(
        (item) => item.priceSeriesId === paper.selectedSeriesId,
      ) || paper.sources[0];
    let state = JourneyStore.snapshot();
    if (example)
      state = {
        ...state,
        initial: {
          ...state.initial,
          name: "나의 첫 투자 연습",
          cash: 1000000,
          saved: 0,
          income: 200000,
          expense: 100000,
          target: 1250000,
        },
        monthlySaving: 50000,
        annualRate: 0,
        month: 0,
        changes: [],
        rateChanges: [],
        logs: [],
        events: [],
      };
    setPlanBusy(true);
    paper.render();
    paper.message("조건의 사본을 보관하는 중이에요.");
    try {
      // No active financial plan ID is changed by this independent copy.
      const plan = await planRequest("", {
        method: "POST",
        body: JSON.stringify({
          state,
        }),
      });
      paper.queue.stage({
        action: "create",
        body: {
          requestId: crypto.randomUUID(),
          planId: plan.id,
          priceSeriesId: source.priceSeriesId,
        },
      });
    } catch (error) {
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
      paper.render();
    }
    if (paper.queue.get()) await paper.executePending();
  };
  paper.startNews = async function () {
    if (!paper.available() || !paper.current) return;
    const bundle = paper.current;
    setPlanBusy(true);
    paper.message("뉴스 게임의 출발 조건을 불러오는 중이에요.");
    try {
      const conditions = await apiRequest(
        "paper-plans",
        "/" + encodeURIComponent(bundle.plan.id) + "/conditions",
      );
      if (paper.current?.run.id !== bundle.run.id) return;
      const row = bundle.run.result.invested.monthlyResults.at(-1);
      show('<div id="newsportfolio"></div>');
      NewsGame.start(
        $("newsportfolio"),
        {
          cash: row.cash,
          saved: row.saved,
          quantity: row.investment.quantity,
          price: row.investment.price,
          unpaid: row.unpaid,
          income: conditions.values.income,
          expense: conditions.values.expense,
        },
        bundle.run.id,
        `${bundle.plan.name} · ${bundle.plan.month}개월차`,
        bundle.plan.id,
      );
      paper.message(
        "뉴스 게임은 별도 연습이에요. 원래 투자 사본의 시간과 주문은 유지됩니다.",
      );
    } catch (error) {
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
    }
  };
  paper.list = async function (offset = 0) {
    if (!paper.available()) return;
    setPlanBusy(true);
    paper.render();
    paper.message("저장한 투자 연습을 불러오는 중이에요.");
    try {
      const plans = await apiRequest(
        "paper-plans",
        `?limit=20&offset=${offset}`,
      );
      const box = paper.node("div", undefined, "saved-plans");
      box.append(
        paper.node("h3", "저장한 투자 연습"),
        paper.node(
          "p",
          "주문·월 진행마다 보관된 시점이에요. 이전 시점에서 다른 선택을 시작할 수 있어요.",
        ),
      );
      if (!plans.length)
        box.append(paper.node("p", "저장된 투자 연습이 없어요."));
      for (const plan of plans)
        box.append(
          paper.button(
            `${plan.name} · ${plan.month}개월${plan.action === "cancel" ? " · 주문 취소" : plan.action === "conditions" ? " · 생활 조건 변경" : ""} · ${new Date(plan.createdAt / 1000).toLocaleString("ko-KR")}`,
            () => paper.load(plan.id),
          ),
        );
      const pages = paper.node("div", undefined, "paper-toolbar");
      if (offset)
        pages.append(
          paper.button("이전 목록", () => paper.list(Math.max(0, offset - 20))),
        );
      if (plans.length === 20)
        pages.append(paper.button("다음 목록", () => paper.list(offset + 20)));
      box.append(pages);
      paper.showPanel(box);
      paper.message("불러올 시점을 선택해주세요.");
    } catch (error) {
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
    }
  };
  paper.load = async function (id) {
    if (!paper.available()) return;
    setPlanBusy(true);
    paper.message("저장한 결과를 확인하는 중이에요.");
    try {
      const plan = await apiRequest(
        "paper-plans",
        "/" + encodeURIComponent(id),
      );
      const run = await apiRequest(
        "paper-runs",
        "/" + encodeURIComponent(plan.runId),
      );
      paper.remember({
        plan,
        run,
      });
      paper.message("저장된 결과를 불러왔어요. 본편 여정은 유지됩니다.");
      $("paperentry-status").textContent =
        `${plan.name} · ${plan.month}개월차 저장됨`;
    } catch (error) {
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
      paper.render();
    }
  };
  paper.create = serializedMutation(paper.create, paper.message);
}
