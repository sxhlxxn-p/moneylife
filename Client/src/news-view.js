function installNewsView(news) {
  news.el = function (tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  news.button = function (text, action) {
    const node = news.el("button", text, "btn");
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  news.start = function (host, seed, id, label, paperPlanId = null) {
    let session = news.sessions.get(id);
    if (!session) {
      session = {
        id,
        label,
        paperPlanId,
        seed: {
          ...seed,
        },
        state: {
          ...seed,
        },
        history: [],
        preview: null,
      };
      try {
        const saved = JSON.parse(localStorage.getItem(news.storageKey));
        if (
          saved?.id === id &&
          Array.isArray(saved.choices) &&
          saved.choices.length <= NewsScenario.events.length
        ) {
          for (const [i, action] of saved.choices.entries()) {
            const row = NewsScenario.play(
              session.state,
              NewsScenario.events[i].id,
              action,
            );
            session.history.push(row);
            session.state = row.state;
          }
          if (
            typeof saved.requestId === "string" &&
            /^[a-f0-9-]{36}$/.test(saved.requestId)
          )
            session.requestId = saved.requestId;
        }
      } catch {
        session.history = [];
        session.state = {
          ...seed,
        };
      }
      news.sessions.set(id, session);
      if (news.sessions.size > 20)
        news.sessions.delete(news.sessions.keys().next().value);
    }
    news.draw(host, session);
  };
  news.draw = function (host, session) {
    host.replaceChildren();
    host.classList.add("news-game");
    host.setAttribute("aria-label", "가상 경제 뉴스 게임");
    const index = session.history.length,
      event = NewsScenario.events[index];
    const header = news.el("div", undefined, "news-topline");
    header.append(
      news.el("span", "가상 경제 뉴스 · 연습 전용", "news-badge"),
      news.el(
        "span",
        `${index} / ${NewsScenario.events.length} 라운드`,
        "news-round",
      ),
    );
    host.append(
      header,
      news.el("h3", "세상이 바뀌면, 내 자산은?"),
      news.el(
        "p",
        `${session.label}에서 출발한 별도 연습입니다. 실제 뉴스·예측이 아니며 원본 주문과 자산에 반영되지 않아요.`,
        "paper-caption",
      ),
    );
    const metrics = news.el("div", undefined, "news-metrics");
    for (const [title, value] of [
      ["연습 순자산", news.won(NewsScenario.total(session.state))],
      [
        "처음 대비",
        news.signed(
          NewsScenario.total(session.state) - NewsScenario.total(session.seed),
        ),
      ],
      ["연습 보유 주식", `${session.state.quantity}주`],
      ["미충족 생활비 누적", news.won(session.state.unpaid)],
    ]) {
      const card = news.el("div");
      card.append(news.el("small", title), news.el("strong", value));
      metrics.append(card);
    }
    host.append(metrics);
    if (event) {
      news.drawRound(host, session, event, index);
    } else {
      const finish = news.el(
        "h4",
        "네 번의 뉴스, 나의 대응을 돌아보세요",
        "news-finish",
      );
      finish.tabIndex = -1;
      host.append(
        finish,
        news.el(
          "p",
          "하락 때 현금을 확보하는 선택과 반등 때 주식을 보유하는 선택의 차이를 비교해보세요. 결과는 공개된 충격 수치와 선택으로 정해지며 투자 실력을 평가하는 점수가 아닙니다.",
        ),
      );
    }
    if (session.history.length) {
      host.append(news.chart(session));
      const history = news.el("div", undefined, "news-history");
      history.setAttribute("aria-live", "polite");
      history.append(news.el("h4", "나의 대응 기록"));
      for (const [i, row] of session.history.entries())
        history.append(
          news.el(
            "p",
            `${i + 1}. ${NewsScenario.events[i].title} / ${NewsScenario.actions[row.action]} · 주가 손익 ${news.signed(row.stockChange)} · 순자산 ${news.won(row.total)}`,
          ),
        );
      host.append(history);
    }
    host.append(
      news.el(
        "p",
        "연습 규칙: 1라운드=가상의 1개월 · 원 단위 반올림 · 저축·이자·세금·수수료·기존 예약 주문·일회성 지출 제외 · 저축 잔액 고정. 소득·생활비 충격은 해당 라운드에만 적용해요.",
        "paper-caption",
      ),
    );
    const reset = news.button("뉴스 게임 처음부터", () => {
      session.state = {
        ...session.seed,
      };
      session.history = [];
      session.preview = null;
      session.requestId = null;
      session.savedChoices = null;
      session.status = "";
      news.save(session);
      news.draw(host, session);
    });
    host.append(reset);
    if (session.paperPlanId) {
      const controls = news.el("div", undefined, "paper-toolbar");
      const saveButton = news.button(
        session.savedChoices ? "현재 라운드 저장됨" : "뉴스 진행 서버 저장",
        () => news.saveSnapshot(host, session),
      );
      saveButton.disabled =
        session.busy ||
        !session.history.length ||
        Boolean(session.savedChoices);
      controls.append(
        saveButton,
        news.button("저장한 뉴스 기록", () =>
          news.loadSnapshots(host, session),
        ),
      );
      const status = news.el(
        "p",
        session.status ||
          "확정한 라운드를 별도 기록으로 보관해요. 원본 투자 사본은 바뀌지 않아요.",
        "paper-caption",
      );
      status.setAttribute("role", "status");
      status.classList.add("news-save-status");
      host.append(controls, status);
    }
    if (session.storageFailed)
      host.append(
        news.el(
          "p",
          "브라우저 저장 공간이 없어 새로고침하면 뉴스 진행 기록이 사라질 수 있어요.",
          "paper-caption",
        ),
      );
    if (session.busy)
      host.querySelectorAll("button").forEach((node) => {
        node.disabled = true;
      });
    host.querySelector(".news-headline h4")?.setAttribute("tabindex", "-1");
  };
  news.demo = function () {
    stop();
    show('<div id="newsdemo"></div>');
    news.start(
      $("newsdemo"),
      {
        cash: 500000,
        saved: 0,
        quantity: 50,
        price: 10000,
        income: 200000,
        expense: 100000,
        unpaid: 0,
      },
      "demo-v1",
      "예시 포트폴리오 · 현금 50만원 / 주식 50만원",
    );
  };
}
