async function recoverGuestSession() {
  if (serverPlanBusy) return;
  setPlanBusy(true);
  try {
    const result = await planRequest("/session/recover", {
      method: "POST",
    });
    if (result.status === "renewed") {
      serverPlanId = null;
      try {
        localStorage.removeItem("money-life-server-plan");
      } catch {}
      eventRequests.archive("session-renewed");
      renderEventRecovery();
      window.dispatchEvent(new Event("moneylife:session-renewed"));
    }
    closeModal();
    $("serverstatus").textContent =
      "새 세션을 준비했어요. 로컬 여정을 다시 저장할 수 있어요.";
    toast("현재 여정은 유지됩니다. 저장 또는 이벤트 선택을 다시 진행해주세요.");
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
window.addEventListener("moneylife:session-expired", () => {
  show(
    '<h2>저장 세션이 만료됐어요</h2><p>현재 여정은 이 기기에 남아 있어요. 새 세션을 시작하면 로컬 여정을 다시 저장할 수 있어요. 이전 세션의 서버 자료는 자동으로 연결되지 않아요.</p><button class="btn primary" onclick="recoverGuestSession()">새 세션으로 계속하기</button>',
  );
});
