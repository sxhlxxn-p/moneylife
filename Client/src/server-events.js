let pendingEventRequest = null;
async function saveEventBranch(eventMonth, accepted) {
  if (serverPlanBusy || JourneyStore.current.events.has(eventMonth)) return;
  stop();
  const state = MoneyLifePlanState.encode({
    start: JourneyStore.current.start,
    month: JourneyStore.current.month,
    baseSaving: JourneyStore.current.baseSaving,
    baseRate: JourneyStore.current.baseRate,
    mods: JourneyStore.current.mods,
    rateMods: JourneyStore.current.rateMods,
    logs: JourneyStore.current.logs,
    events: JourneyStore.current.events,
  });
  const command = {
    base: {
      schemaVersion: 1,
      goalBasis: "net_assets",
      parentPlanId: serverPlanId,
      state,
    },
    eventMonth,
    accepted,
  };
  const snapshot = JSON.stringify(command);
  if (!pendingEventRequest || pendingEventRequest.snapshot !== snapshot) {
    pendingEventRequest = {
      snapshot,
      requestId: crypto.randomUUID(),
    };
  }
  setPlanBusy(true);
  try {
    const result = await apiRequest("event-branches", "", {
      method: "POST",
      body: JSON.stringify({
        ...command,
        requestId: pendingEventRequest.requestId,
      }),
    });
    // Never overwrite edits made while the server was calculating.
    const current = MoneyLifePlanState.encode({
      start: JourneyStore.current.start,
      month: JourneyStore.current.month,
      baseSaving: JourneyStore.current.baseSaving,
      baseRate: JourneyStore.current.baseRate,
      mods: JourneyStore.current.mods,
      rateMods: JourneyStore.current.rateMods,
      logs: JourneyStore.current.logs,
      events: JourneyStore.current.events,
    });
    if (JSON.stringify(current) !== JSON.stringify(state)) {
      toast("선택 결과를 서버에 저장했어요. 현재 수정 중인 여정은 유지됩니다.");
      return;
    }
    const decoded = MoneyLifePlanState.decode(result.plan);
    serverPlanId = result.plan.id;
    try {
      localStorage.setItem("money-life-server-plan", serverPlanId);
    } catch {}
    JourneyStore.set("mods", decoded.mods);
    JourneyStore.set("events", new Set(decoded.events));
    JourneyStore.set("logs", decoded.logs);
    pendingEventRequest = null;
    closeModal();
    render();
    $("serverstatus").textContent =
      "선택 전 원본과 선택 후 계획·계산 결과를 저장했어요.";
    toast("선택을 반영했어요. 이전 계획은 저장한 여정에서 확인할 수 있어요.");
  } catch (error) {
    $("serverstatus").textContent =
      "선택 반영을 확인하지 못했어요. 현재 여정은 유지됩니다.";
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
