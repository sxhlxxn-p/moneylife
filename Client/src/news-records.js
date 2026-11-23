function installNewsRecords(news) {
  news.save = function (session) {
    try {
      localStorage.setItem(
        news.storageKey,
        JSON.stringify({
          id: session.id,
          choices: session.history.map((row) => row.action),
          requestId: session.requestId,
        }),
      );
    } catch {
      session.storageFailed = true;
    }
  };
  news.saveSnapshot = async function (host, session) {
    if (session.busy || !session.history.length || session.savedChoices) return;
    session.requestId ||= crypto.randomUUID();
    news.save(session);
    const choices = session.history.map((row) => row.action);
    session.busy = true;
    session.status = "서버에서 출발 자산과 선택을 다시 계산하고 있어요.";
    news.draw(host, session);
    try {
      const record = await apiRequest(
        "paper-plans",
        "/" + encodeURIComponent(session.paperPlanId) + "/news-games",
        {
          method: "POST",
          body: JSON.stringify({
            requestId: session.requestId,
            choices,
          }),
        },
      );
      const expected = NewsScenario.replay(session.seed, choices);
      if (
        record.paperRunId !== session.id ||
        record.result.finalAssets !== expected.finalAssets ||
        record.result.heldAssets !== expected.heldAssets ||
        JSON.stringify(record.result.choices) !== JSON.stringify(choices)
      )
        throw new Error(
          "서버 결과와 화면 결과가 달라요. 저장 목록에서 확인해주세요.",
        );
      session.savedChoices = JSON.stringify(choices);
      session.status = `${choices.length}라운드를 서버에 저장했어요. 순자산 ${news.won(record.result.finalAssets)} · 계속 보유 ${news.won(record.result.heldAssets)}.`;
    } catch (error) {
      session.status =
        error.message +
        " 선택 기록은 유지돼요. 같은 저장 버튼으로 다시 확인할 수 있어요.";
    } finally {
      session.busy = false;
      if (host.isConnected) news.draw(host, session);
    }
  };
  news.loadSnapshots = async function (
    host,
    session,
    offset = 0,
    selected = new Map(),
  ) {
    if (session.busy) return;
    session.busy = true;
    session.status = "저장한 뉴스 기록을 불러오는 중이에요.";
    news.draw(host, session);
    try {
      const records = await apiRequest(
        "paper-plans",
        "/" +
          encodeURIComponent(session.paperPlanId) +
          `/news-games?limit=20&offset=${offset}`,
      );
      if (!host.isConnected) return;
      const list = news.el("section", undefined, "news-saved-records");
      list.append(news.el("h4", "저장한 뉴스 기록"));
      const selectionStatus = news.el(
        "p",
        `비교할 기록 ${selected.size}개 선택 · 먼저 선택한 기록이 A 기준이에요.`,
        "news-comparison-status",
      );
      selectionStatus.setAttribute("role", "status");
      const compareButton = news.button("선택한 뉴스 기록 비교", () =>
        news.compareSnapshots(host, session, list, selected),
      );
      compareButton.dataset.newsNeedsSelection = String(selected.size < 2);
      compareButton.disabled = selected.size < 2;
      list.append(
        news.el(
          "p",
          "같은 출발 조건의 기록 2~3개를 선택하면 모두 진행한 라운드까지 비교해요.",
          "paper-caption",
        ),
        selectionStatus,
        compareButton,
      );
      if (!records.length)
        list.append(
          news.el(
            "p",
            "저장한 뉴스 기록이 없어요. 먼저 한 라운드 이상 진행해 저장해주세요.",
          ),
        );
      for (const record of records) {
        const article = news.el("article");
        const label = news.el("label", undefined, "news-compare-choice");
        const checkbox = news.el("input");
        checkbox.type = "checkbox";
        checkbox.value = record.id;
        checkbox.checked = selected.has(record.id);
        checkbox.setAttribute(
          "aria-label",
          `비교에 추가 · ${record.result.choices.length}라운드 · ${record.id}`,
        );
        checkbox.addEventListener("change", () => {
          if (checkbox.checked && selected.size >= 3) {
            checkbox.checked = false;
            selectionStatus.textContent =
              "뉴스 기록은 최대 3개까지 비교할 수 있어요.";
            return;
          }
          if (checkbox.checked) selected.set(record.id, record);
          else selected.delete(record.id);
          selectionStatus.textContent = `비교할 기록 ${selected.size}개 선택 · 먼저 선택한 기록이 A 기준이에요.`;
          compareButton.dataset.newsNeedsSelection = String(selected.size < 2);
          compareButton.disabled = selected.size < 2;
        });
        label.append(
          checkbox,
          news.el(
            "span",
            record.result.choices
              .map((action) => NewsScenario.actions[action])
              .join(" → "),
          ),
        );
        article.append(label);
        article.append(
          news.el(
            "p",
            `${record.result.choices.length}라운드 · ${news.won(record.result.finalAssets)} · ${new Date(record.createdAt / 1000).toLocaleString("ko-KR")}`,
          ),
          news.button("이 기록 이어하기", () => {
            try {
              const replay = NewsScenario.replay(
                session.seed,
                record.result.choices,
              );
              if (
                record.paperRunId !== session.id ||
                replay.finalAssets !== record.result.finalAssets ||
                record.result.version !== replay.version ||
                Object.entries(session.seed).some(
                  ([key, value]) => record.result.seed[key] !== value,
                )
              )
                throw new Error("이 출발 조건과 맞지 않는 기록이에요.");
              session.history = replay.history;
              session.state = replay.history.at(-1)?.state || {
                ...session.seed,
              };
              session.preview = null;
              session.requestId = null;
              session.savedChoices = JSON.stringify(replay.choices);
              session.status = `${replay.choices.length}라운드 기록을 불러왔어요. 이후 선택은 새 기록으로 저장해요.`;
              news.save(session);
              news.draw(host, session);
            } catch (error) {
              session.status = error.message;
              news.draw(host, session);
            }
          }),
        );
        list.append(article);
      }
      if (offset > 0)
        list.append(
          news.button("이전 뉴스 기록", () =>
            news.loadSnapshots(
              host,
              session,
              Math.max(0, offset - 20),
              selected,
            ),
          ),
        );
      if (records.length === 20)
        list.append(
          news.button("다음 뉴스 기록", () =>
            news.loadSnapshots(host, session, offset + 20, selected),
          ),
        );
      host.append(list);
      list.scrollIntoView({
        block: "nearest",
      });
      session.status =
        "불러올 기록을 선택해주세요. 현재 진행은 선택하기 전까지 유지돼요.";
    } catch (error) {
      session.status = error.message;
      if (host.isConnected) news.draw(host, session);
    } finally {
      session.busy = false;
      if (host.isConnected) {
        host.querySelectorAll("button").forEach((node) => {
          node.disabled = node.dataset.newsNeedsSelection === "true";
        });
        // Redraw only on failure; a successful list must remain open.
        if (!host.querySelector(".news-saved-records"))
          news.draw(host, session);
        else {
          host.querySelector(".news-save-status").textContent = session.status;
          // The underlying game remains locked while a record list is open.
          for (const node of host.querySelectorAll("button"))
            if (!node.closest(".news-saved-records")) node.disabled = true;
          host
            .querySelector(".news-saved-records")
            .append(
              news.button("기록 목록 닫기", () => news.draw(host, session)),
            );
        }
      }
    }
  };
  news.saveSnapshot = serializedMutation(news.saveSnapshot);
}
