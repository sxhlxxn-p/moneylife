const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const $ = (id) => document.getElementById(id);
const money = (value) =>
  Math.round(value * 10000).toLocaleString("ko-KR") + "원";
const dates = (m) => {
  const d = new Date(2026, 9 + m, 1);
  return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월";
};
const mlFormatAmount = (value) => Math.round(value).toLocaleString("ko-KR");
const mlFormatMan = (value) => mlFormatKoreanWon(Math.round(value * 10000));
function stop() {
  clearInterval(JourneyStore.current.timer);
  JourneyStore.set("timer", null);
  if (typeof resetLifePlayback === "function") resetLifePlayback();
  if ($("ml-play"))
    $("ml-play").textContent =
      JourneyStore.current.month >= 120 ? "여정 완료" : "▶ 시간 시작";
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 3500);
}
function show(html) {
  stop();
  if ($("overlay").classList.contains("hidden"))
    JourneyStore.set("focusBefore", document.activeElement);
  $("modal").innerHTML =
    '<div class="modal-header"><span aria-hidden="true">MONEY LIFE</span><button class="close" onclick="closeModal()" aria-label="닫기">×</button></div><div class="modal-scroll">' +
    html +
    "</div>";
  $("overlay").classList.remove("hidden");
  fitLifeModal();
  queueModalFit();
  $("modal").querySelector("button,input")?.focus();
}
function closeModal() {
  $("overlay").classList.add("hidden");
  if (JourneyStore.current.focusBefore?.isConnected)
    JourneyStore.current.focusBefore.focus();
}
let modalFitFrame = null;
function queueModalFit() {
  if (modalFitFrame !== null) return;
  if (
    $("overlay").classList.contains("hidden") &&
    !document.querySelector(
      'body[data-life-page="dashboard"] details[open] > .life-panel-scroll',
    )
  )
    return;
  modalFitFrame = requestAnimationFrame(() => {
    modalFitFrame = null;
    fitLifeModal();
    if (document.body.dataset.lifePage === "dashboard") {
      for (const id of ["life-details", "life-time-options", "life-archive"]) {
        const panel = $(id);
        if (!panel.open) continue;
        const viewport = document.documentElement.clientWidth;
        const available =
          viewport <= 760
            ? viewport - 20
            : viewport -
              document.querySelector(".ml-sidebar").getBoundingClientRect()
                .width -
              48;
        const preferred =
          id === "life-time-options" ? 400 : id === "life-archive" ? 520 : 960;
        fitPopupContent(
          panel,
          panel.querySelector(".life-panel-scroll"),
          preferred,
          Math.min(1180, available),
          "--panel-width",
        );
      }
    }
  });
}
function fitLifeModal() {
  if ($("overlay").classList.contains("hidden")) return;
  const modal = $("modal"),
    body = modal.querySelector(".modal-scroll");
  if (!body) return;
  const viewport = document.documentElement.clientWidth;
  const available = Math.min(1180, viewport - 32);
  let preferred = 660;
  if (
    body.querySelector(
      ".life-result-stats,.run-summary,.saved-plans,.life-memory-list",
    )
  )
    preferred = 820;
  if (
    body.querySelector(
      ".eventoptions,.life-money-result,.life-ending-comparison,table,svg,.comparecards,.ai-comparison-metrics,#papercompare,#newsdemo,#newsportfolio",
    )
  )
    preferred = 1040;
  fitPopupContent(modal, body, preferred, available, "--modal-width");
}
function fitPopupContent(shell, body, preferred, available, property) {
  if (!body) return;
  const widths = [
    ...new Set(
      [preferred, 820, 1040, 1180]
        .filter((width) => width >= preferred)
        .map((width) => Math.min(width, available)),
    ),
  ];
  let bestWidth = widths[0],
    leastOverflow = Infinity;
  const previousScroll = body.scrollTop;
  for (const width of widths) {
    shell.style.setProperty(property, width + "px");
    // Measure the rendered content, including asynchronously populated cards.
    const overflow =
      Math.max(0, body.scrollHeight - body.clientHeight) +
      Math.max(0, body.scrollWidth - body.clientWidth);
    if (overflow < leastOverflow) {
      leastOverflow = overflow;
      bestWidth = width;
    }
    if (overflow <= 1) break;
  }
  shell.style.setProperty(property, bestWidth + "px");
  body.scrollTop = previousScroll;
}
const popupLayoutObserver = new MutationObserver(queueModalFit);
for (const id of ["modal", "life-details", "life-time-options", "life-archive"])
  popupLayoutObserver.observe($(id), {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["open", "hidden", "class"],
  });
window.addEventListener("resize", queueModalFit);
document.fonts?.ready.then(queueModalFit);
function mlShowPage(page) {
  document.body.dataset.lifePage = page;
  if (page !== "dashboard") stop();
  JourneyStore.set("activePage", page);
  document
    .querySelectorAll(".ml-page")
    .forEach((node) =>
      node.classList.toggle("active", node.id === "ml-page-" + page),
    );
  document.querySelectorAll("#ml-main-nav [data-page]").forEach((node) => {
    const selected = node.dataset.page === page;
    node.classList.toggle("active", selected);
    if (selected) {
      node.setAttribute("aria-current", "page");
      $("ml-mobile-current").textContent =
        node.querySelector(".ml-nav-label").textContent;
    } else node.removeAttribute("aria-current");
  });
  $("ml-mobile-toggle").setAttribute("aria-expanded", "false");
  if (typeof LifeAnimation !== "undefined")
    LifeAnimation.setVisible(page === "dashboard");
  if (page === "finance") fillFinance();
  if (page === "settings") {
    $("ml-setting-saving").value = Math.round(
      JourneyStore.current.saving * 10000,
    );
    $("ml-setting-rate").value = JourneyStore.current.rate;
  }
}
function settings() {
  mlShowPage("finance");
}
function compare() {
  mlShowPage("report");
}
function assets() {
  mlShowPage("assets");
}
function journal() {
  showLifeJournal();
}
function welcome() {
  show(
    '<div class="game-dialog-kicker">MONEY LIFE · 10년의 선택</div><h2>이번 인생은, 어떤 모습일까?</h2><p>소득과 지출, 일상의 선택이 만드는 변화를 확인해요.<br>다섯 번의 선택으로 나의 10년을 살아보세요.</p>' +
      (hasRestoredLife
        ? '<button class="btn primary life-full-button" onclick="closeModal()">내 이야기 이어하기 →</button>'
        : '<button class="btn primary life-full-button" onclick="closeModal()">예시 인생으로 시작 →</button>') +
      '<button class="btn life-full-button" onclick="closeModal();settings()">내 조건으로 새 여정 준비</button><p class="note">이 기기에 자동 저장돼요. 금융 미래를 가정하는 시뮬레이션입니다.</p>',
  );
}
// Restore the established version-1 game snapshot; do not reinterpret legacy stock inputs as deposits.
