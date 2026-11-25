"use strict";

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("overlay").classList.contains("hidden")) closeModal();
    else {
      const panel = ["life-archive", "life-details", "life-time-options"]
        .map($)
        .find((node) => node?.open && node.getClientRects().length);
      if (panel) {
        panel.open = false;
        panel.querySelector("summary")?.focus({ preventScroll: true });
      }
    }
  }
  if (event.key === "Tab" && !$("overlay").classList.contains("hidden")) {
    const nodes = [
      ...$("modal").querySelectorAll(
        "button,input,select,textarea,a[href],summary,[tabindex='0']",
      ),
    ].filter((node) => !node.disabled && node.getClientRects().length > 0);
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
$("ml-play").onclick = toggle;

const lifePanels = ["life-details", "life-time-options", "life-archive"].map($);
lifePanels.forEach((panel) => {
  panel.addEventListener("toggle", () => {
    if (!panel.open || JourneyStore.current.activePage !== "dashboard") return;
    lifePanels.forEach((other) => {
      if (other !== panel) other.open = false;
    });
    panel.querySelector("summary")?.focus({ preventScroll: true });
  });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && JourneyStore.current.timer) {
    stop();
    render();
  }
});
$("ml-one-month").onclick = step;
$("ml-next-event").onclick = playLifeStory;
$("life-pause").onclick = () => {
  stop();
  render();
};
$("life-time-options").addEventListener("toggle", () => {
  if (!$("life-time-options").open && !lifeStoryRunning) {
    stop();
    render();
  }
});
$("life-details").addEventListener("toggle", () => {
  if ($("life-details").open) {
    stop();
    render();
  }
});
$("life-open-archive").onclick = () => {
  stop();
  $("life-archive").open = true;
  $("life-archive").scrollIntoView({ block: "start" });
};
document.querySelectorAll("[data-speed]").forEach(
  (node) =>
    (node.onclick = () => {
      JourneyStore.set("speed", Number(node.dataset.speed));
      document.querySelectorAll("[data-speed]").forEach((item) => {
        item.classList.toggle("active", item === node);
        item.setAttribute("aria-pressed", String(item === node));
      });
      if (JourneyStore.current.timer) {
        const resumeStory = lifeStoryRunning;
        stop();
        if (resumeStory) playLifeStory();
        else toggle();
      }
    }),
);
$("ml-finance-form").onsubmit = startFinance;
$("ml-finance-form").oninput = financeSummary;
$("ml-finance-reset").onclick = () => {
  for (const key of ["cash", "saved", "income", "expense"])
    $("ml-" + key).value = defaults[key] * 10000;
  $("ml-saving").value = 700000;
  $("ml-start-rate").value = 3;
  financeSummary();
};
$("ml-goal-form").onsubmit = (event) => {
  event.preventDefault();
  if (serverPlanBusy) return;
  const target = Number($("ml-goal-amount").value.replaceAll(",", "")),
    months = Number($("ml-goal-months").value);
  if (
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > 10000000000 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 120
  ) {
    toast("목표" + " 금액·기한을 확인해주세요.");
    return;
  }
  JourneyStore.set("goalName", $("ml-goal-name").value.trim() || "나의 목표");
  JourneyStore.set("goalMonths", months);
  JourneyStore.set("start", {
    ...JourneyStore.current.start,
    target: target / 10000,
  });
  render();
  toast("목표를 저장했어요.");
};
$("ml-refresh-report").onclick = () => {
  mlRenderReport();
};
$("ml-apply-settings").onclick = () => {
  if (serverPlanBusy || JourneyStore.current.month >= 120) return;
  const value = Number($("ml-setting-saving").value),
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
  log("다음 달 저축·금리 조건을 변경했어요.");
  render();
};
$("ml-reset-all").onclick = () => {
  settings();
  toast(
    "재무 입력에서 새 여정을 시작할 수 있어요. 기존 서버 기록은 보존됩니다.",
  );
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
