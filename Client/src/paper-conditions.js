function installPaperConditions(paper) {
  paper.editConditions = async function () {
    if (!paper.available() || !paper.current) return;
    const planId = paper.current.plan.id;
    const source = paper.current.plan.source;
    setPlanBusy(true);
    show(
      '<div id="paperconditions"><div class="eyebrow">생활 조건 변경</div><h2>다음 달 조건을 확인하고 있어요</h2><p role="status">저장된 조건을 불러옵니다. 아직 변경하지 않았어요.</p></div>',
    );
    const container = $("paperconditions");
    try {
      const data = await apiRequest(
        "paper-plans",
        "/" + encodeURIComponent(planId) + "/conditions",
      );
      if (!container.isConnected || $("overlay").classList.contains("hidden"))
        return;
      if (!data.canEdit) {
        container.replaceChildren(
          paper.node("h2", "이 사본은 마지막 달이에요"),
          paper.node(
            "p",
            "새 투자 연습을 시작하거나 이전 시점을 불러와 조건을 바꿀 수 있어요.",
          ),
          paper.button("돌아가기", closeModal),
        );
        return;
      }
      const fields = [
        ["income", "월 소득"],
        ["expense", "월 생활비"],
        ["monthlySaving", "월 저축 이체액"],
      ];
      const draft = {
        ...data.values,
      };
      function form() {
        container.replaceChildren(
          paper.node("div", "생활 조건 변경", "eyebrow"),
          paper.node("h2", "다음 달부터 어떻게 바꿀까요?"),
          paper.node(
            "p",
            `적용 구간: ${data.appliesFrom}~${data.appliesThrough}개월차 · 주가 기준 ${paper.marketDate(source, data.appliesFrom)}부터. 금액은 원 단위예요.`,
          ),
        );
        const grid = paper.node("div", undefined, "fields");
        for (const [field, title] of fields) {
          const label = paper.node("label", title + " · 원");
          label.htmlFor = "papercondition-" + field;
          const input = paper.node("input");
          input.type = "number";
          input.id = label.htmlFor;
          input.min = "0";
          input.step = "1";
          input.inputMode = "numeric";
          input.value = String(draft[field]);
          input.dataset.planAction = "paper-condition-input";
          label.append(input);
          grid.append(label);
        }
        container.append(
          grid,
          paper.node(
            "p",
            "바꾼 항목만 지원 기간 마지막 달까지 입력 금액으로 설정해요. 해당 항목에 예약된 미래 변동도 이 금액에 맞춰 조정합니다. 나머지 항목·일회성 지출·보유 주식·대기 주문은 유지돼요.",
            "paper-caption",
          ),
        );
        const error = paper.node("p", "", "paper-condition-error");
        error.id = "papercondition-error";
        error.setAttribute("role", "status");
        container.append(error);
        const actions = paper.node("div", undefined, "modalactions");
        actions.append(
          paper.button("변경 없이 닫기", closeModal),
          paper.button(
            "변경 내용 확인",
            () => {
              if (!paper.available()) return;
              const values = {};
              for (const [field, title] of fields) {
                const input = $("papercondition-" + field);
                const value = Number(input.value);
                if (
                  input.value.trim() === "" ||
                  !Number.isSafeInteger(value) ||
                  value < 0 ||
                  (value !== data.values[field] && value > 10000000000)
                ) {
                  error.textContent =
                    title + "은 0~100억원의 정수 원으로 입력해주세요.";
                  input.focus();
                  return;
                }
                draft[field] = value;
                if (value !== data.values[field]) values[field] = value;
              }
              if (!Object.keys(values).length) {
                error.textContent = "바꿀 금액을 한 항목 이상 입력해주세요.";
                return;
              }
              review(values);
            },
            false,
            true,
          ),
        );
        container.append(actions);
      }
      function review(values) {
        container.replaceChildren(
          paper.node("div", "변경 전 확인", "eyebrow"),
          paper.node("h2", "이 조건으로 새 사본을 만들까요?"),
          paper.node(
            "p",
            `${data.appliesFrom}~${data.appliesThrough}개월차에 반영해요. 지금까지의 자산과 거래 결과는 바뀌지 않아요.`,
          ),
        );
        const grid = paper.node("div", undefined, "paper-review-grid");
        for (const [field, title] of fields) {
          if (!(field in values)) continue;
          const card = paper.node("div");
          card.append(
            paper.node("small", title),
            paper.node(
              "strong",
              paper.won(data.values[field]) + " → " + paper.won(values[field]),
            ),
          );
          grid.append(card);
        }
        container.append(
          grid,
          paper.node(
            "p",
            "새 조건의 자산 변화는 다음 달로 진행하면 확인할 수 있어요. 이 화면은 미래 주가나 수익을 계산하지 않습니다. 기존 사본은 저장 목록에 남아요.",
            "paper-caption",
          ),
        );
        const actions = paper.node("div", undefined, "modalactions");
        actions.append(
          paper.button("다시 수정", () => {
            form();
            container.querySelector("input")?.focus();
          }),
          paper.button(
            "다음 달부터 적용",
            () => {
              if (!paper.available()) return;
              if (
                !paper.current ||
                paper.current.plan.id !== planId ||
                data.paperPlanId !== planId
              ) {
                closeModal();
                paper.message(
                  "투자 사본이 바뀌었어요. 조건을 다시 확인해주세요.",
                );
                return;
              }
              closeModal();
              paper.command("conditions", {
                values,
              });
            },
            false,
            true,
          ),
        );
        container.append(actions);
        actions.querySelector("button")?.focus();
      }
      form();
    } catch (error) {
      if (container.isConnected && !$("overlay").classList.contains("hidden"))
        container.replaceChildren(
          paper.node("h2", "조건을 불러오지 못했어요"),
          paper.node("p", error.message),
          paper.button("돌아가기", closeModal),
        );
    } finally {
      setPlanBusy(false);
      if (container.isConnected && !$("overlay").classList.contains("hidden"))
        container.querySelector("input, button")?.focus();
    }
  };
}
