function fillFinance() {
  for (const key of ["cash", "saved", "income", "expense"])
    $("ml-" + key).value = Math.round(JourneyStore.current.start[key] * 10000);
  $("ml-saving").value = Math.round(JourneyStore.current.baseSaving * 10000);
  $("ml-start-name").value = JourneyStore.current.start.name;
  $("ml-start-age").value = JourneyStore.current.start.age;
  $("ml-start-rate").value = JourneyStore.current.baseRate;
  financeSummary();
}
function financeSummary() {
  const value = (key) => Number($("ml-" + key).value) || 0;
  $("ml-total-assets").textContent =
    (value("cash") + value("saved")).toLocaleString("ko-KR") + "원";
  $("ml-month-balance").textContent =
    (value("income") - value("expense")).toLocaleString("ko-KR") + "원";
}
function applyFinance(values) {
  JourneyStore.set("start", {
    ...JourneyStore.current.start,
    ...values.initial,
  });
  JourneyStore.set("baseSaving", values.saving);
  JourneyStore.set("baseRate", values.rate);
  JourneyStore.set("saving", JourneyStore.current.baseSaving);
  JourneyStore.set("rate", JourneyStore.current.baseRate);
  JourneyStore.set("month", 0);
  JourneyStore.set("mods", []);
  JourneyStore.set("rateMods", []);
  JourneyStore.set("events", new Set());
  JourneyStore.set("logs", []);
  serverPlanId = null;
  try {
    localStorage.removeItem("money-life-server-plan");
  } catch {}
  log("새로운" + " 여정을 시작했어요.");
  closeModal();
  render();
  mlShowPage("dashboard");
}
function startFinance(event) {
  event.preventDefault();
  if (serverPlanBusy) return;
  const initial = {
    ...JourneyStore.current.start,
    name: $("ml-start-name").value.trim() || defaults.name,
    age: Number($("ml-start-age").value),
  };
  for (const key of ["cash", "saved", "income", "expense", "saving"]) {
    const input = $("ml-" + key),
      value = Number(input.value);
    if (
      input.value.trim() === "" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 10000000000
    ) {
      $("ml-finance-error").textContent =
        "금액은 0~100억원의 정수 원으로 입력해주세요.";
      input.focus();
      return;
    }
    if (key !== "saving") initial[key] = value / 10000;
  }
  const annualRate = Number($("ml-start-rate").value);
  if (
    !Number.isInteger(initial.age) ||
    initial.age < 18 ||
    initial.age > 80 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    annualRate > 8
  ) {
    $("ml-finance-error").textContent = "나이와 금리를 확인해주세요.";
    return;
  }
  const values = {
    initial,
    saving: Number($("ml-saving").value) / 10000,
    rate: annualRate,
  };
  if (JourneyStore.current.month || JourneyStore.current.mods.length) {
    show(
      '<h2>새 여정을 시작할까요?</h2><p>현재 기록은 초기화됩니다. 남겨둘 기록은 먼저 서버에 저장해주세요.</p><button class="btn primary" id="confirmjourney">새 여정 시작</button>',
    );
    $("confirmjourney").onclick = () => applyFinance(values);
  } else applyFinance(values);
}
