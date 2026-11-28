"use strict";

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("overlay").classList.contains("hidden")) closeModal();
    else if ($("ml-mobile-toggle").getAttribute("aria-expanded") === "true") {
      $("ml-mobile-toggle").setAttribute("aria-expanded", "false");
      $("ml-mobile-toggle").focus();
    }
  }
  if (event.key === "Tab" && !$("overlay").classList.contains("hidden")) {
    const nodes = [
      ...$("modal").querySelectorAll("button,input,select,textarea,a[href]"),
    ].filter(
      (node) =>
        !node.disabled && node.getClientRects().length && node.tabIndex >= 0,
    );
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
      event.preventDefault();
      nodes[0]?.focus();
    }
  }
});
restoreLocalJourney();
document.querySelectorAll("[data-page]").forEach((node) =>
  node.addEventListener("click", () => {
    mlShowPage(node.dataset.page);
    if (node.dataset.page === "investment") PaperTrading.open();
  }),
);
$("ml-mobile-toggle").onclick = () => {
  const button = $("ml-mobile-toggle");
  button.setAttribute(
    "aria-expanded",
    String(button.getAttribute("aria-expanded") !== "true"),
  );
};
$("ml-mobile-toggle").addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  $("ml-mobile-toggle").setAttribute("aria-expanded", "true");
  const options = $("ml-main-nav").querySelectorAll("button");
  (event.key === "ArrowUp" ? options[options.length - 1] : options[0]).focus();
});
document
  .querySelectorAll("[data-game-place]")
  .forEach((node) =>
    node.addEventListener("click", () => openLifePlace(node.dataset.gamePlace)),
  );
$("ml-play").onclick = toggle;
$("ml-one-month").onclick = () => {
  if (JourneyStore.current.month >= 120) compare();
  else step();
};
$("ml-next-event").onclick = nextEvent;
$("ml-event-yes").onclick = nextEvent;
$("ml-event-later").onclick = toggle;
document.querySelectorAll("[data-speed]").forEach(
  (node) =>
    (node.onclick = () => {
      JourneyStore.set("speed", Number(node.dataset.speed));
      document.querySelectorAll("[data-speed]").forEach((item) => {
        item.classList.toggle("active", item === node);
        item.setAttribute("aria-pressed", String(item === node));
      });
      if (JourneyStore.current.timer) {
        stop();
        toggle();
      }
      if (typeof GameExperience !== "undefined") GameExperience.speedChanged();
    }),
);
$("ml-finance-form").onsubmit = startFinance;
$("ml-finance-form").oninput = financeSummary;
$("ml-finance-reset").onclick = () => {
  for (const key of ["cash", "saved", "income", "expense"])
    mlSetWon("ml-" + key, defaults[key] * 10000);
  mlSetWon("ml-saving", 700000);
  $("ml-start-rate").value = 3;
  for (const input of $("ml-finance-form").querySelectorAll(
    "input[aria-invalid]",
  )) {
    if (input.validity.valid) input.removeAttribute("aria-invalid");
  }
  $("ml-finance-error").textContent = "";
  financeSummary();
};
$("ml-goal-form").onsubmit = (event) => {
  event.preventDefault();
  if (serverPlanBusy) return;
  const amountText = $("ml-goal-amount").value.trim(),
    target = Number(amountText.replaceAll(",", "")),
    months = Number($("ml-goal-months").value);
  const amountValid =
    /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(amountText) &&
    Number.isSafeInteger(target) &&
    target >= 1 &&
    target <= 10000000000;
  const monthsValid = Number.isInteger(months) && months >= 1 && months <= 120;
  mlSetFieldError(
    "ml-goal-amount",
    "ml-goal-amount-error",
    amountValid
      ? ""
      : "1원~100억 원 사이의 정수 금액을 입력하세요. 쉼표는 1,000처럼 세 자리마다 넣어주세요.",
  );
  mlSetFieldError(
    "ml-goal-months",
    "ml-goal-months-error",
    monthsValid ? "" : "목표 기한은 1~120개월 사이의 정수로 입력하세요.",
  );
  if (!amountValid || !monthsValid) {
    $(amountValid ? "ml-goal-months" : "ml-goal-amount").focus();
    return;
  }
  GameExperience.clearGoalDraft();
  JourneyStore.set("goalName", $("ml-goal-name").value.trim() || "나의 목표");
  JourneyStore.set("goalMonths", months);
  JourneyStore.set("start", {
    ...JourneyStore.current.start,
    target: target / 10000,
  });
  render();
  toast("목표를 저장했어요.");
};
for (const name of ["amount", "months"])
  $("ml-goal-" + name).addEventListener("input", () =>
    mlSetFieldError("ml-goal-" + name, "ml-goal-" + name + "-error"),
  );
$("ml-refresh-report").onclick = () => {
  mlRenderReport();
  toast("현재 조건으로 비교 결과를 갱신했어요.");
};
$("ml-settings-form").onsubmit = (event) => {
  event.preventDefault();
  if (serverPlanBusy || JourneyStore.current.month >= 120) return;
  if (
    !$("ml-setting-saving").reportValidity() ||
    !$("ml-setting-rate").reportValidity()
  )
    return;
  const value = mlParseWon($("ml-setting-saving").value),
    nextRate = Number($("ml-setting-rate").value);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 10000000000 ||
    !Number.isFinite(nextRate) ||
    nextRate < 0 ||
    nextRate > 8
  ) {
    toast("저축액과 금리를 확인해주세요.");
    return;
  }
  if (
    value / 10000 === JourneyStore.current.saving &&
    nextRate === JourneyStore.current.rate
  ) {
    toast("변경된 값이 없어요.");
    return;
  }
  const previousSaving = JourneyStore.current.saving;
  const previousRate = JourneyStore.current.rate;
  JourneyStore.set("saving", value / 10000);
  JourneyStore.set("rate", nextRate);
  JourneyStore.mutate("mods", "push", {
    type: "saving",
    v: JourneyStore.current.saving,
    m: JourneyStore.current.month + 1,
  });
  JourneyStore.mutate("rateMods", "push", {
    m: JourneyStore.current.month + 1,
    v: JourneyStore.current.rate,
  });
  log(
    `다음 달부터 월 저축 ${money(previousSaving)} → ${money(value / 10000)}, 연 저축 금리 ${previousRate}% → ${nextRate}%로 변경했어요.`,
  );
  render();
  GameExperience.showSettingsChange(previousSaving, previousRate);
  toast("다음 달부터 새 저축액과 금리가 적용돼요.");
};
async function startApplication() {
  try {
    await loadLifeEvents();
    render();
    fillFinance();
    mlShowPage("dashboard");
    welcome();
  } catch (error) {
    show(
      '<h2>화면을 준비하지 못했어요</h2><p id="start-error"></p><button class="btn" onclick="location.reload()">다시 불러오기</button>',
    );
    $("start-error").textContent = error.message;
  }
}
startApplication();
