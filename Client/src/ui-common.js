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
function mlSetFieldError(inputId, errorId, message = "") {
  const input = $(inputId),
    error = $(errorId);
  input.setAttribute("aria-invalid", String(Boolean(message)));
  error.textContent = message;
  error.hidden = !message;
}
function stop() {
  clearInterval(JourneyStore.current.timer);
  JourneyStore.set("timer", null);
  if ($("ml-play"))
    $("ml-play").textContent =
      JourneyStore.current.month >= 120 ? "여정 완료" : "▶ 자동 진행";
  if (typeof GameExperience !== "undefined") GameExperience.syncControls();
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.add("hidden"), 3500);
}
function show(html, scene = "default") {
  $("overlay").dataset.scene = scene;
  stop();
  if ($("overlay").classList.contains("hidden"))
    JourneyStore.set("focusBefore", document.activeElement);
  $("modal").innerHTML =
    '<button class="close" onclick="closeModal()" aria-label="닫기">' +
    mlIcon("close") +
    "</button>" +
    html;
  $("overlay").classList.remove("hidden");
  if (typeof GameExperience !== "undefined") GameExperience.onModal(scene);
  $("modal").querySelector("button,input")?.focus();
}
function closeModal() {
  $("overlay").classList.add("hidden");
  if (typeof GameExperience !== "undefined") GameExperience.onClose();
  if (JourneyStore.current.focusBefore?.isConnected)
    JourneyStore.current.focusBefore.focus();
}
function mlShowPage(page) {
  const changed = JourneyStore.current.activePage !== page;
  if (changed) {
    clearTimeout(toast.timer);
    $("toast").classList.add("hidden");
  }
  document.body.classList.toggle("is-playing", page === "dashboard");
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
  if (page === "finance") fillFinance();
  if (page === "settings") {
    mlSetWon("ml-setting-saving", Math.round(JourneyStore.current.saving * 10000));
    $("ml-setting-rate").value = JourneyStore.current.rate;
  }
  if (typeof GameExperience !== "undefined") GameExperience.onPage(page);
  if (changed) {
    window.scrollTo({ top: 0, behavior: "instant" });
    const title = $("ml-page-" + page).querySelector("h1");
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
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
  show(
    "<h2>나의 선택 기록</h2>" +
      (JourneyStore.current.logs.length
        ? JourneyStore.current.logs
            .map((item) => "<p>" + escapeHtml(item.text) + "</p>")
            .join("")
        : "<p>아직 선택한 이벤트가 없어요. 마을에서 시간을 시작하면 인생의 갈림길을 만나요.</p>"),
  );
}
function welcome() {
  showJourneyStart();
}
