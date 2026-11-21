function installNewsRound(news) {
  news.drawRound = function (host, session, event, index) {
    const card = news.el("article", undefined, "news-headline");
    card.append(
      news.el("div", `ROUND ${index + 1} · ${event.category}`, "eyebrow"),
      news.el("h4", event.title),
      news.el("p", event.text),
      news.el("p", "이번 라운드의 가정: " + event.reason, "news-assumption"),
    );
    host.append(
      card,
      news.el(
        "p",
        "충격을 적용하기 전 가격으로 대응한 뒤, 가정한 가격 변화와 한 달의 소득·생활비를 계산해요. 매도 시점도 게임 규칙이며 실제 시장 체결을 뜻하지 않아요.",
        "paper-caption",
      ),
    );
    const choices = news.el("div", undefined, "news-choices");
    for (const [action, title] of Object.entries(NewsScenario.actions)) {
      const choice = news.button(title, () => {
        session.preview = action;
        news.draw(host, session);
        host.querySelector(".news-preview")?.focus();
      });
      choice.classList.add("news-choice");
      choice.setAttribute("aria-pressed", String(session.preview === action));
      if (session.state.quantity === 0 && action !== "hold")
        choice.disabled = true;
      choices.append(choice);
    }
    host.append(choices);
    if (!session.state.quantity)
      host.append(
        news.el(
          "p",
          "보유 주식이 없어 주가 손익은 0원이에요. 소득·생활비 변화는 반영됩니다.",
          "paper-caption",
        ),
      );
    if (session.preview) {
      const preview = news.el("div", undefined, "news-preview");
      preview.tabIndex = -1;
      const results = Object.keys(NewsScenario.actions).map((action) =>
        NewsScenario.play(session.state, event.id, action),
      );
      const chosen = results.find((row) => row.action === session.preview);
      preview.append(
        news.el(
          "h4",
          NewsScenario.actions[session.preview] + " 선택 시 가정 결과",
        ),
        news.el(
          "p",
          `매도 ${chosen.sold}주 · 가정 가격 ${news.won(session.state.price)} → ${news.won(chosen.state.price)}`,
        ),
        news.el(
          "p",
          `주가 변화 손익 ${news.signed(chosen.stockChange)} · 추가 생활비 ${news.signed(chosen.expenseChange)} · 소득 변화 ${news.signed(chosen.incomeChange)}`,
        ),
        news.el(
          "p",
          `라운드 후 순자산 ${news.won(chosen.total)} · 시작 직전 대비 ${news.signed(chosen.difference)} · 이번 생활비 부족 ${news.won(chosen.shortfall)}`,
        ),
      );
      const compare = news.el("div", undefined, "news-alternatives");
      for (const row of results)
        compare.append(
          news.el(
            "p",
            `${NewsScenario.actions[row.action]}: ${news.won(row.total)} · 주가 손익 ${news.signed(row.stockChange)}`,
          ),
        );
      preview.append(
        compare,
        news.el(
          "p",
          "같은 가정 아래 선택만 바꾼 비교입니다. 확률·실제 미래 수익은 계산하지 않아요.",
          "paper-caption",
        ),
      );
      const confirm = news.button("이 선택으로 라운드 진행", () => {
        // Recompute from the current state; a preview never changes money.
        const result = NewsScenario.play(
          session.state,
          event.id,
          session.preview,
        );
        session.history.push(result);
        session.state = result.state;
        session.preview = null;
        session.requestId = null;
        session.savedChoices = null;
        session.status = "";
        news.save(session);
        news.draw(host, session);
        host.querySelector(".news-headline h4, .news-finish")?.focus();
      });
      confirm.classList.add("primary");
      preview.append(confirm);
      host.append(preview);
    }
  };
}
