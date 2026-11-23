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
  JourneyStore.set("focusBefore", document.activeElement);
  $("modal").innerHTML =
    '<button class="close" onclick="closeModal()" aria-label="닫기">×</button>' +
    html;
  $("overlay").classList.remove("hidden");
  $("modal").querySelector("button,input")?.focus();
}
function closeModal() {
  $("overlay").classList.add("hidden");
  if (JourneyStore.current.focusBefore?.isConnected)
    JourneyStore.current.focusBefore.focus();
}
function mlShowPage(page) {
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
  show(
    "<h2>나의 선택 기록</h2>" +
      JourneyStore.current.logs
        .map((item) => "<p>" + escapeHtml(item.text) + "</p>")
        .join(""),
  );
}
function welcome() {
  show(
    '<div class="eyebrow">WELCOME TO MONEY LIFE</div><h2>돈을 모으는 시간도,<br>당신의 인생이니까요.</h2><p>개인의 조건으로 선택 전후의 계획을 비교해요. 저장한 진행은 같은 기기에서 이어집니다.</p><div class="modalactions"><button class="btn" onclick="closeModal();settings()">재무 정보 입력</button><button class="btn primary" onclick="closeModal()">마을로 시작하기 →</button></div>',
  );
}
// Restore the established version-1 game snapshot; do not reinterpret legacy stock inputs as deposits.
