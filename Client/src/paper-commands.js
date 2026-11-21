function installPaperCommands(paper) {
  paper.command = async function (action, fields) {
    if (!paper.available() || !paper.current) return;
    const request =
      action === "cancel"
        ? {
            action,
            parentId: paper.current.plan.id,
            orderId: fields.orderId,
            body: {
              requestId: crypto.randomUUID(),
            },
          }
        : {
            action,
            parentId: paper.current.plan.id,
            body: {
              requestId: crypto.randomUUID(),
              ...fields,
            },
          };
    try {
      paper.queue.stage(request);
    } catch {
      paper.message(
        "중복 요청을 막으려면 이 기기의 저장 공간을 사용할 수 있어야 해요.",
      );
      return;
    }
    await paper.sendPending();
  };
  paper.sendPending = async function () {
    if (serverPlanBusy || !paper.queue.get()) return;
    setPlanBusy(true);
    paper.render();
    paper.message("서버에서 처리 결과를 확인하는 중이에요.");
    const request = paper.queue.get();
    try {
      const path =
        request.action === "create"
          ? ""
          : request.action === "cancel"
            ? "/" +
              encodeURIComponent(request.parentId) +
              "/orders/" +
              encodeURIComponent(request.orderId) +
              "/cancel"
            : "/" + encodeURIComponent(request.parentId) + "/" + request.action;
      const result = await apiRequest("paper-plans", path, {
        method: "POST",
        body: JSON.stringify(request.body),
      });
      // Store the returned reference before clearing the recoverable command.
      paper.remember(result);
      paper.queue.clear();
      paper.message(
        request.action === "conditions"
          ? "생활 조건을 변경한 새 사본을 저장했어요. 다음 달부터 반영됩니다."
          : request.action === "cancel"
            ? "대기 주문을 취소한 새 사본을 저장했어요. 이전 기록은 유지됩니다."
            : request.action === "orders"
              ? "주문을 예약했어요. 다음 달로 진행하면 체결 여부를 확인할 수 있어요."
              : request.action === "advance"
                ? "월 진행 결과와 체결 기록을 저장했어요."
                : "투자 연습을 시작했어요. 모든 금액은 원 단위입니다.",
      );
      $("paperentry-status").textContent =
        `${result.plan.name} · ${result.plan.month}개월차 저장됨`;
    } catch (error) {
      // A definite validation failure can be corrected. Uncertain transport/server failures keep the ID.
      if (
        error.status === 404 &&
        ["PAPER_PLAN_NOT_FOUND", "PLAN_NOT_FOUND"].includes(error.code)
      ) {
        paper.resetForSession("source-unavailable");
        paper.message(
          "원본 투자 사본을 확인할 수 없어 미확인 요청을 별도 보관했어요. 취소된 것으로 간주하지 않으며 새 연습을 시작할 수 있어요.",
        );
        return;
      }
      if (
        [400, 403, 409, 422].includes(error.status) ||
        error.code === "ORDER_NOT_FOUND"
      ) {
        paper.queue.clear();
      }
      paper.message(error.message);
    } finally {
      setPlanBusy(false);
      paper.render();
    }
  };
}
