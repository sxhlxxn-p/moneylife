const eventRequests = createRequestJournal(
  () => localStorage,
  "money-life-event-pending",
  (saved) =>
    Boolean(
      saved &&
      /^[a-f0-9-]{36}$/.test(saved.requestId) &&
      saved.command?.base?.state &&
      [12, 30, 48, 72, 96].includes(saved.command.eventMonth) &&
      typeof saved.command.accepted === "boolean" &&
      saved.snapshot === JSON.stringify(saved.command),
    ),
);
function renderEventRecovery() {
  const button = $("eventrequest-retry");
  if (button) button.hidden = !eventRequests.get();
}
async function saveEventBranch(eventMonth, accepted) {
  if (serverPlanBusy || JourneyStore.current.events.has(eventMonth)) return;
  stop();
  const command = {
    base: {
      schemaVersion: 1,
      goalBasis: "net_assets",
      parentPlanId: serverPlanId,
      state: JourneyStore.snapshot(),
    },
    eventMonth,
    accepted,
    eventRulesVersion: LifeEventCatalog.version,
  };
  const snapshot = JSON.stringify(command);
  const previous = eventRequests.get();
  if (previous && previous.snapshot !== snapshot) {
    show(
      '<h2>확인하지 못한 선택이 있어요</h2><p>먼저 같은 요청으로 결과를 확인해주세요. 이전 선택을 별도 보관해도 서버에서 이미 처리된 결과가 취소되지는 않아요.</p><button class="btn primary" onclick="retryPendingEvent()">이전 선택 결과 확인</button><button class="btn" onclick="archivePendingEvent()">이전 요청 별도 보관</button>',
    );
    return;
  }
  if (!previous) {
    try {
      eventRequests.stage({
        requestId: crypto.randomUUID(),
        command,
        snapshot,
      });
    } catch {
      toast(
        "요청을 복구할 수 있도록 브라우저 저장 공간을 먼저 확인해주세요. 선택은 적용하지 않았어요.",
      );
      return;
    }
  }
  renderEventRecovery();
  return retryPendingEvent();
}
function archivePendingEvent() {
  try {
    eventRequests.archive("user-archived-unconfirmed");
    renderEventRecovery();
    closeModal();
    toast(
      "미확인 요청을 별도 보관했어요. 서버 처리 결과를 취소한 것은 아니에요.",
    );
  } catch {
    toast("요청을 보관하지 못했어요. 브라우저 저장 공간을 확인해주세요.");
  }
}
async function retryPendingEvent() {
  const pending = eventRequests.get();
  if (serverPlanBusy || !pending) return;
  stop();
  setPlanBusy(true);
  try {
    const result = await apiRequest("event-branches", "", {
      method: "POST",
      body: JSON.stringify({
        ...pending.command,
        requestId: pending.requestId,
      }),
    });
    const decoded = MoneyLifePlanState.decode(result.plan);
    // A retry recovers the old operation without overwriting a newly edited journey.
    const sameState =
      JSON.stringify(JourneyStore.snapshot()) ===
      JSON.stringify(pending.command.base.state);
    eventRequests.clear();
    if (!sameState) {
      $("serverstatus").textContent =
        "이전 선택 결과를 서버에서 확인했어요. 현재 수정 중인 여정은 유지하며 저장 목록에서 결과를 볼 수 있어요.";
      toast("이전 결과를 확인했어요. 현재 여정은 바꾸지 않았어요.");
      return;
    }
    serverPlanId = result.plan.id;
    try {
      localStorage.setItem("money-life-server-plan", serverPlanId);
    } catch {}
    JourneyStore.restore(decoded);
    closeModal();
    render();
    $("serverstatus").textContent =
      "선택 전 원본과 선택 후 계획·계산 결과를 저장했어요.";
    toast("선택을 반영했어요. 이전 계획은 저장한 여정에서 확인할 수 있어요.");
  } catch (error) {
    $("serverstatus").textContent =
      "선택 반영을 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요.";
    toast(error.message);
  } finally {
    setPlanBusy(false);
    renderEventRecovery();
  }
}
