const planSaves = createRequestJournal(
  () => localStorage,
  "money-life-save-pending",
  (saved) =>
    Boolean(
      saved &&
      /^[a-f0-9-]{36}$/.test(saved.requestId) &&
      /^[a-f0-9-]{36}$/.test(saved.runRequestId) &&
      saved.snapshot &&
      ((saved.command?.kind === "save" && saved.command.plan?.state) ||
        (saved.command?.kind === "calculate" &&
          typeof saved.command.planId === "string")),
    ),
);
function renderSaveRecovery() {
  for (const id of ["plansave-retry", "plansave-archive"]) {
    const node = $(id);
    if (node) node.hidden = !planSaves.get();
  }
}
async function retryPlanSaveTransaction() {
  const request = planSaves.get();
  if (serverPlanBusy || !request) return;
  if (planSaves.isSuspended()) {
    toast(
      "이전 요청을 보관하지 못했어요. 저장 공간을 확인한 뒤 별도 보관해주세요.",
    );
    return;
  }
  stop();
  setPlanBusy(true);
  let saved = false;
  try {
    const plan =
      request.command.kind === "save"
        ? await apiRequest("plan-saves", "", {
            method: "POST",
            body: JSON.stringify({
              requestId: request.requestId,
              plan: request.command.plan,
            }),
          })
        : await planRequest("/" + encodeURIComponent(request.command.planId));
    saved = true;
    const same = () =>
      JSON.stringify(JourneyStore.snapshot()) ===
      JSON.stringify(request.snapshot);
    if (same()) {
      serverPlanId = plan.id;
      try {
        localStorage.setItem("money-life-server-plan", plan.id);
      } catch {}
    }
    $("serverstatus").textContent = "계획 저장 완료 · 계산 결과 확인 중";
    await simulationRequest("", {
      method: "POST",
      body: JSON.stringify({
        planId: plan.id,
        requestId: request.runRequestId,
        months: 120,
      }),
    });
    planSaves.clear(request.requestId);
    closeModal();
    $("serverstatus").textContent = same()
      ? "계획과 계산 결과를 저장했어요."
      : "이전 조건의 저장·계산을 확인했어요. 현재 수정 중인 여정은 유지됩니다.";
    toast("저장과 계산 결과를 확인했어요.");
  } catch (error) {
    if (error.status === 404 && ["PLAN_NOT_FOUND"].includes(error.code)) {
      try {
        planSaves.archive("source-unavailable");
      } catch {
        planSaves.suspend();
      }
      serverPlanId = null;
      try {
        localStorage.removeItem("money-life-server-plan");
      } catch {}
    }
    $("serverstatus").textContent =
      error.code === "PLAN_NOT_FOUND"
        ? "이전 서버 참조를 확인할 수 없어 요청을 별도 보관했어요. 현재 조건으로 새 저장을 시작할 수 있어요."
        : saved
          ? "계획은 저장됐어요. 같은 요청으로 계산을 다시 확인할 수 있어요."
          : error.message;
    toast(error.message);
  } finally {
    setPlanBusy(false);
    renderSaveRecovery();
  }
}
async function calculateSavedPlanTransaction() {
  if (serverPlanBusy || !serverPlanId) return;
  if (!planSaves.get())
    planSaves.stage({
      requestId: crypto.randomUUID(),
      runRequestId: crypto.randomUUID(),
      snapshot: JourneyStore.snapshot(),
      command: { kind: "calculate", planId: serverPlanId },
    });
  return retryPlanSaveTransaction();
}
function archivePlanSaveTransaction() {
  planSaves.archive("user-archived-unconfirmed");
  renderSaveRecovery();
  closeModal();
  toast("이전 요청을 별도 보관했어요. 서버 저장을 취소한 것은 아니에요.");
}
const retryPlanSave = serializedMutation(retryPlanSaveTransaction);
const calculateSavedPlan = serializedMutation(calculateSavedPlanTransaction);
const archivePlanSave = serializedMutation(archivePlanSaveTransaction);
window.addEventListener("storage", (event) => {
  if (event.key === "money-life-save-pending") renderSaveRecovery();
});
