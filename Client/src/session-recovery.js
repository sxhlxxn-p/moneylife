function resetSessionState() {
  const warnings = [];
  serverPlanId = null;
  try {
    localStorage.removeItem("money-life-server-plan");
  } catch {
    warnings.push("서버 참조를 지우지 못했어요.");
  }
  for (const journal of [
    eventRequests,
    ...(typeof planSaves === "undefined" ? [] : [planSaves]),
  ]) {
    try {
      journal.archive("session-renewed");
    } catch {
      journal.suspend();
      warnings.push("이전 요청을 보관하지 못해 재전송을 중지했어요.");
    }
  }
  renderEventRecovery();
  if (typeof renderSaveRecovery === "function") renderSaveRecovery();
  window.dispatchEvent(
    new CustomEvent("moneylife:session-renewed", { detail: { warnings } }),
  );
  return warnings;
}
async function recoverGuestSessionTransaction() {
  if (serverPlanBusy) return;
  setPlanBusy(true);
  try {
    const result = await planRequest("/session/recover", { method: "POST" });
    let warnings = [];
    if (result.status === "renewed") {
      const persisted = publishSessionEpoch();
      warnings = resetSessionState();
      if (!persisted) warnings.push("브라우저 저장 공간을 확인해주세요.");
    }
    closeModal();
    $("serverstatus").textContent = warnings.length
      ? "세션은 새로 시작했어요. 일부 이전 요청은 보관하지 못해 전송을 중지했어요. 저장 공간을 확인해주세요."
      : "세션을 준비했어요. 로컬 여정을 다시 저장할 수 있어요.";
    toast(
      warnings.length
        ? "현재 여정은 유지됩니다. 이전 요청 보관 상태와 저장 공간을 확인해주세요."
        : "현재 여정은 유지됩니다. 저장 또는 이벤트 선택을 다시 진행해주세요.",
    );
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
const recoverGuestSession = serializedMutation(recoverGuestSessionTransaction);
window.addEventListener("moneylife:external-session-renewed", () => {
  resetSessionState();
  closeModal();
  $("serverstatus").textContent =
    "다른 탭에서 세션을 변경했어요. 현재 로컬 여정은 유지됩니다.";
});
window.addEventListener("moneylife:session-expired", () => {
  show(
    '<h2>저장 세션이 만료됐어요</h2><p>현재 여정은 이 기기에 남아 있어요. 새 세션을 시작하면 로컬 여정을 다시 저장할 수 있어요. 이전 세션의 서버 자료는 자동으로 연결되지 않아요.</p><button class="btn primary" onclick="recoverGuestSession()">새 세션으로 계속하기</button>',
  );
});
