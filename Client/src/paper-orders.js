function installPaperOrders(paper) {
  paper.submitOrder = async function (side) {
    if (!paper.available() || !paper.current) return;
    const input = $("paperquantity");
    const quantity = Number(input.value);
    if (
      input.value.trim() === "" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000000
    ) {
      paper.message("주문 수량은 1~1,000,000,000 사이의 정수로 입력해주세요.");
      input.focus();
      return;
    }
    const planId = paper.current.plan.id;
    setPlanBusy(true);
    show(
      '<div id="paperreview"><div class="eyebrow">주문 전 확인</div><h2>참고 금액을 확인하고 있어요</h2><p role="status">현재까지 확인한 가격과 다음 달 생활 조건으로 계산합니다. 아직 주문은 접수되지 않았어요.</p></div>',
    );
    const container = $("paperreview");
    try {
      const review = await apiRequest(
        "paper-plans",
        "/" + encodeURIComponent(planId) + "/order-preview",
        {
          method: "POST",
          body: JSON.stringify({
            side,
            quantity,
          }),
        },
      );
      if (!container.isConnected || $("overlay").classList.contains("hidden"))
        return;
      container.replaceChildren(
        paper.node("div", "주문 전 확인", "eyebrow"),
        paper.node(
          "h2",
          `${side === "buy" ? "매수" : "매도"} ${quantity.toLocaleString("ko-KR")}주를 예약할까요?`,
        ),
        paper.node(
          "p",
          `${review.symbol} · ${paper.marketDate(paper.current.plan.source, review.executionMonth)} 체결 예정. 아직 주문은 접수되지 않았어요.`,
        ),
      );
      const grid = paper.node("div", undefined, "paper-review-grid");
      const amount = (value) =>
        value === null ? "계산할 가격이 없어요" : paper.won(value);
      for (const [label, value] of [
        ["현재 기준 가격", amount(review.referencePrice)],
        ["참고 거래대금", amount(review.referenceGross)],
        [
          "참고 수수료 / 세금",
          review.referenceFee === null
            ? "가격 없음"
            : `${paper.won(review.referenceFee)} / ${paper.won(review.referenceTax)}`,
        ],
        ["현재 현금", paper.won(review.currentCash)],
        ["다음 달 소득", paper.won(review.nextIncome)],
        ["다음 달 생활비·일회성 지출", paper.won(review.nextExpense)],
        ["같은 가격일 때 다음 달말 현금", amount(review.estimatedNextCash)],
        ["같은 가격일 때 다음 달말 저축", amount(review.estimatedNextSaved)],
      ]) {
        const card = paper.node("div");
        card.append(paper.node("small", label), paper.node("strong", value));
        grid.append(card);
      }
      container.append(
        grid,
        paper.node(
          "p",
          `현재 매도 가능 ${review.availableSellQuantity.toLocaleString("ko-KR")}주 · 기존 매도 예약 ${review.reservedSellQuantity.toLocaleString("ko-KR")}주. 기존 예약 ${review.existingPendingCount}건과 이번 주문, 생활비와 월말 저축을 함께 반영한 참고값이에요.`,
        ),
      );
      const warning = paper.node("div", undefined, "paper-review-warning");
      warning.append(
        paper.node("strong", "다음 달 실제 가격으로 다시 판단해요."),
        paper.node(
          "p",
          "참고 금액은 지금까지 확인한 가격이 유지되고 다음 달에 거래할 수 있다는 가정입니다. 체결 금액이나 수익을 보장하지 않아요.",
        ),
      );
      if (review.referencePriceMonth !== null)
        warning.append(
          paper.node(
            "p",
            `가격 기준 ${paper.marketDate(paper.current.plan.source, review.referencePriceMonth)}${review.staleReference ? " · 현재 월 가격이 없어 이전 가격으로 계산했어요." : ""}`,
          ),
        );
      if (review.estimatedStatus === "rejected")
        warning.append(
          paper.node(
            "p",
            review.estimatedReason === "INSUFFICIENT_CASH"
              ? "참고 조건에서는 현금이 부족해 이 주문이 거부돼요. 다음 달에는 실제 가격과 현금으로 다시 판단합니다."
              : "참고 조건에서는 이 주문이 체결되지 않아요. 다음 달에 실제 조건으로 다시 판단합니다.",
          ),
        );
      if (review.estimatedStatus === "unavailable")
        warning.append(
          paper.node(
            "p",
            "확인된 가격이 없어 거래대금과 거래 후 잔액을 계산하지 않았어요. 예약 후 다음 달에 체결 여부를 판단합니다.",
          ),
        );
      if (review.estimatedNextShortfall > 0)
        warning.append(
          paper.node(
            "p",
            `다음 달 지출 중 ${paper.won(review.estimatedNextShortfall)}이 부족해요. 주식은 자동 매도하지 않고 같은 달 매도 대금으로 앞선 미충족 지출을 지우지 않아요.`,
          ),
        );
      container.append(warning);
      const actions = paper.node("div", undefined, "modalactions");
      actions.append(
        paper.button("수량 다시 수정", () => {
          closeModal();
          $("paperquantity")?.focus();
        }),
        paper.button(
          "예약 확정",
          () => {
            if (!paper.available()) return;
            if (
              !paper.current ||
              paper.current.plan.id !== planId ||
              review.paperPlanId !== planId
            ) {
              closeModal();
              paper.message(
                "투자 계획이 바뀌었어요. 주문 내용을 다시 확인해주세요.",
              );
              return;
            }
            closeModal();
            paper.command("orders", {
              side,
              quantity,
            });
          },
          false,
          true,
        ),
      );
      container.append(actions);
    } catch (error) {
      if (container.isConnected && !$("overlay").classList.contains("hidden")) {
        container.replaceChildren(
          paper.node("h2", "주문 내용을 확인하지 못했어요"),
          paper.node("p", error.message),
          paper.button("돌아가기", closeModal),
        );
      }
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
      if (container.isConnected && !$("overlay").classList.contains("hidden"))
        container.querySelector("button")?.focus();
    }
  };
  paper.reviewCancellation = function (order) {
    if (!paper.available() || !paper.current) return;
    const planId = paper.current.plan.id;
    show(
      '<div id="papercancelreview"><div class="eyebrow">대기 주문 취소</div></div>',
    );
    const content = $("papercancelreview");
    content.append(
      paper.node(
        "h2",
        `${order.side === "buy" ? "매수" : "매도"} ${order.quantity.toLocaleString("ko-KR")}주 예약을 취소할까요?`,
      ),
      paper.node(
        "p",
        "이 주문을 제외한 새 투자 사본을 저장해요. 이전 시점의 기록과 다른 사본은 그대로 남아요.",
      ),
      paper.node(
        "p",
        "아직 체결 전이므로 현재 현금과 보유 주식은 바뀌지 않아요. 매도 예약 취소 시에는 그 수량만큼 다시 매도할 수 있어요.",
      ),
    );
    const actions = paper.node("div", undefined, "modalactions");
    actions.append(
      paper.button("주문 유지", closeModal),
      paper.button(
        "취소 확정",
        () => {
          if (!paper.available()) return;
          if (!paper.current || paper.current.plan.id !== planId) {
            closeModal();
            paper.message(
              "투자 사본이 바뀌었어요. 현재 대기 주문을 다시 확인해주세요.",
            );
            return;
          }
          closeModal();
          paper.command("cancel", {
            orderId: order.id,
          });
        },
        false,
        true,
      ),
    );
    content.append(actions);
  };
}
