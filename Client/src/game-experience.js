// Presentation and interaction around the existing monthly engine and APIs.
const GameExperience = (() => {
  const app = $("money-life-app"),
    overlay = $("overlay"),
    modal = $("modal");
  const avatar = document.querySelector(".play-avatar > svg");
  const goalCard = document.querySelector(".game-goal");
  const goalHeading = document.createElement("div");
  goalHeading.className = "goal-section goal-section-heading";
  const goalTitle = document.createElement("div");
  goalTitle.className = "goal-section-title";
  goalTitle.append(
    goalCard.querySelector("h3"),
    goalCard.querySelector(".play-objective-edit"),
  );
  goalHeading.append(goalTitle, $("ml-game-goal-name"));
  const goalAmount = document.createElement("div");
  goalAmount.className = "goal-section goal-section-amount";
  const amountLabel = document.createElement("span");
  amountLabel.className = "goal-amount-caption";
  amountLabel.textContent = "현재 모은 금액";
  goalAmount.append(amountLabel, goalCard.querySelector(".ml-goal-money"));
  const goalProgress = document.createElement("div");
  goalProgress.className = "goal-section goal-section-progress";
  const progressHeading = document.createElement("div");
  progressHeading.className = "goal-progress-heading";
  progressHeading.innerHTML =
    '<span>목표 달성률</span><strong id="game-goal-percentage"></strong>';
  goalProgress.append(
    progressHeading,
    goalCard.querySelector(".ml-bar"),
    $("ml-game-goal-eta"),
    $("ml-game-goal-deadline"),
  );
  goalCard.append(goalHeading, goalAmount, goalProgress);
  const liveSummary = document.createElement("section");
  liveSummary.className = "desktop-live-summary";
  liveSummary.setAttribute("aria-label", "현재 월 재무 요약");
  liveSummary.innerHTML =
    '<h2>이번 달 내 지갑</h2><dl><div><dt>현금</dt><dd id="desktop-game-cash"></dd></div><div><dt>이번 달 소득</dt><dd id="desktop-game-income"></dd></div><div><dt>이번 달 지출</dt><dd id="desktop-game-expense"></dd></div></dl>';
  document.querySelector(".play-objective").append(liveSummary);
  const storageDrawer = document.querySelector(".journey-drawer");
  const storageAnchor = document.createComment(
    "storage drawer default position",
  );
  storageDrawer.before(storageAnchor);
  const desktopGame = matchMedia("(min-width: 1024px) and (min-height: 560px)");
  const storageButton = document.createElement("button");
  storageButton.type = "button";
  storageButton.className = "desktop-storage-trigger";
  storageButton.innerHTML = mlIcon("wallet") + "저장·불러오기";
  storageButton.onclick = () => {
    $("play-details").open = true;
    storageDrawer.open = true;
    storageDrawer.scrollIntoView({ block: "nearest" });
  };
  $("ml-page-dashboard").append(storageButton);
  const leftPanel = document.createElement("aside");
  leftPanel.className = "desktop-goal-panel";
  leftPanel.setAttribute("aria-label", "목표·지갑·게임 메뉴");
  $("ml-page-dashboard").append(leftPanel);
  const leftPanelItems = [
    document.querySelector(".play-objective"),
    document.querySelector(".play-toolbelt"),
  ].map((node) => {
    const anchor = document.createComment("left panel default position");
    node.before(anchor);
    return { node, anchor };
  });
  const dateBlock = document.querySelector(".ml-world-top > div:first-child");
  dateBlock.classList.add("game-date-block");
  const dateLine = document.createElement("div");
  dateLine.className = "game-date-line";
  dateLine.append(...dateBlock.childNodes);
  dateBlock.append(dateLine);
  const chapter = $("ml-game-chapter");
  document.querySelector(".ml-world-copy").prepend(chapter);
  function placeStorage() {
    for (const { node, anchor } of leftPanelItems) {
      if (desktopGame.matches) leftPanel.append(node);
      else anchor.before(node);
    }
    if (desktopGame.matches && JourneyStore.current.activePage === "dashboard")
      $("play-details").append(storageDrawer);
    else storageAnchor.before(storageDrawer);
  }
  desktopGame.addEventListener("change", placeStorage);
  placeStorage();
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      $("ml-mobile-toggle").getAttribute("aria-expanded") !== "true" &&
      $("overlay").classList.contains("hidden") &&
      $("play-details").open
    ) {
      $("play-details").open = false;
      $("play-details").querySelector("summary").focus();
    }
  });
  const financeFields = document.querySelector(
    "#ml-finance-form > section > .ml-fields",
  );
  const fields = Array.from(financeFields.children);
  const groups = document.createElement("div");
  groups.className = "finance-groups";
  for (const [name, icon, entries] of [
    ["기본 정보", "home", fields.slice(0, 2)],
    ["지금 가진 자산", "wallet", fields.slice(2, 4)],
    ["매달의 생활 조건", "sliders", fields.slice(4)],
  ]) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const grid = document.createElement("div");
    legend.innerHTML = mlIcon(icon) + name;
    grid.className = "ml-fields";
    grid.append(...entries);
    fieldset.append(legend, grid);
    groups.append(fieldset);
  }
  financeFields.replaceWith(groups);
  const settingsCards = document.querySelector("#ml-page-settings > .ml-stack");
  settingsCards.prepend(settingsCards.lastElementChild);
  for (const node of document.querySelectorAll("[data-icon]"))
    node.innerHTML = mlIcon(node.dataset.icon);
  const stage = document.createElement("div");
  stage.className = "event-dialog-stage";
  modal.before(stage);
  stage.append(modal);
  const controls = document.createElement("div");
  controls.className = "experience-time-controls";
  controls.innerHTML =
    '<span id="game-time-state" role="status"></span><button type="button" id="game-play-toggle" class="ml-btn primary" data-plan-action="life-play" aria-pressed="false"></button>';
  controls.append(document.querySelector(".play-speed"));
  document
    .querySelector(".ml-world-top")
    .insertBefore(controls, document.querySelector(".play-age"));
  $("game-play-toggle").onclick = () => {
    if (serverPlanBusy) return;
    if (JourneyStore.current.month >= 120) return compare();
    if (eventRequests.get()) return retryPendingEvent();
    toggle();
  };
  $("ml-one-month").classList.remove("primary");
  const header = document.querySelector(".ml-topbar"),
    user = header.querySelector(".ml-top-user");
  header.insertBefore(document.querySelector(".ml-mobile-menu"), user);
  header.insertBefore($("ml-main-nav"), user);
  $("ml-mobile-toggle").innerHTML = mlIcon("menu") + "<span>메뉴</span>";
  const navIcons = {
    dashboard: "home",
    assets: "wallet",
    finance: "sliders",
    goal: "target",
    report: "chart",
    investment: "stock",
    settings: "sliders",
  };
  for (const button of document.querySelectorAll("#ml-main-nav [data-page]"))
    button.querySelector(".ml-nav-icon").innerHTML = mlIcon(
      navIcons[button.dataset.page],
    );
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target))
      $("ml-mobile-toggle").setAttribute("aria-expanded", "false");
  });
  $("ml-main-nav").addEventListener("keydown", (event) => {
    const buttons = Array.from($("ml-main-nav").querySelectorAll("button"));
    const index = buttons.indexOf(document.activeElement);
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    buttons[
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
            buttons.length
    ].focus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && JourneyStore.current.timer) {
      stop();
      render();
    }
  });
  for (const panel of [
    document.querySelector("#play-details"),
    document.querySelector(".journey-drawer"),
  ])
    panel.addEventListener("toggle", () => {
      if (panel.open && JourneyStore.current.timer) {
        stop();
        render();
      }
    });
  const labels = {
    finance: "나의 시작 조건",
    assets: "지금의 자산",
    goal: "이루고 싶은 목표",
    report: "선택이 만든 미래",
    settings: "여정 관리",
    investment: "주식 투자 연습",
  };
  for (const [page, label] of Object.entries(labels)) {
    const section = $("ml-page-" + page),
      head = section.querySelector(".ml-page-head");
    head.querySelector(".ml-eyebrow").textContent = label;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "experience-back";
    back.dataset.page = "dashboard";
    back.innerHTML = mlIcon("back") + "마을로 돌아가기";
    head.before(back);
    const context = document.createElement("p");
    context.className = "experience-page-context";
    context.id = "experience-context-" + page;
    head.after(context);
  }
  for (const [page, actions] of Object.entries({
    assets: [
      ["settings", "저축·금리 바꾸기", "sliders"],
      ["dashboard", "마을로 돌아가기", "arrow"],
    ],
    goal: [["dashboard", "마을에서 계속하기", "arrow"]],
    report: [
      ["goal", "목표 조정하기", "target"],
      ["dashboard", "마을에서 계속하기", "arrow"],
    ],
  })) {
    const footer = document.createElement("nav");
    footer.className = "experience-page-actions";
    footer.setAttribute("aria-label", "다음 작업");
    for (const [destination, text, icon] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ml-btn";
      button.dataset.page = destination;
      button.innerHTML = mlIcon(icon) + text;
      footer.append(button);
    }
    $("ml-page-" + page).append(footer);
  }
  const financeNote = document.createElement("p");
  financeNote.id = "experience-finance-note";
  financeNote.className = "experience-form-note";
  $("ml-finance-form").before(financeNote);
  const settingsNote = document.createElement("p");
  settingsNote.id = "experience-settings-note";
  settingsNote.className = "experience-form-note";
  $("ml-apply-settings").closest(".ml-button-row").after(settingsNote);
  $("ml-apply-settings").setAttribute("aria-describedby", settingsNote.id);
  const settingsReceipt = document.createElement("section");
  settingsReceipt.id = "settings-change-receipt";
  settingsReceipt.className = "settings-change-receipt";
  settingsReceipt.hidden = true;
  settingsReceipt.setAttribute("role", "status");
  $("ml-settings-form").append(settingsReceipt);
  let settingsChange = null;
  const settingsBasis = () =>
    JSON.stringify([
      JourneyStore.current.start.cash,
      JourneyStore.current.start.saved,
      JourneyStore.current.start.income,
      JourneyStore.current.start.expense,
      JourneyStore.current.mods,
      JourneyStore.current.rateMods,
    ]);
  const goalEditorTitle = $("ml-page-goal").querySelector(".ml-card h2");
  const goalEditorHeading = document.createElement("div");
  goalEditorHeading.className = "goal-editor-heading";
  goalEditorTitle.before(goalEditorHeading);
  const goalSaveState = document.createElement("span");
  goalSaveState.id = "goal-save-state";
  goalSaveState.setAttribute("role", "status");
  goalEditorHeading.append(goalEditorTitle, goalSaveState);
  for (const input of document.querySelectorAll(
    "#ml-finance-form input, #ml-settings-form input",
  )) {
    input.addEventListener("invalid", () =>
      input.setAttribute("aria-invalid", "true"),
    );
    input.addEventListener("input", () =>
      input.removeAttribute("aria-invalid"),
    );
  }
  let financeDraft = null;
  let goalDraft = null;
  const goalKey = () =>
    JSON.stringify([
      JourneyStore.current.goalName,
      JourneyStore.current.start.target,
      JourneyStore.current.goalMonths,
    ]);
  $("ml-goal-form").addEventListener("input", () => {
    goalDraft = {
      base: goalKey(),
      values: ["name", "amount", "months"].map((key) => [
        "ml-goal-" + key,
        $("ml-goal-" + key).value,
      ]),
    };
  });
  function captureFinanceDraft() {
    financeDraft = Array.from(
      $("ml-finance-form").querySelectorAll("input"),
    ).map((input) => [input.id, input.value]);
  }
  $("ml-finance-form").addEventListener("input", () => {
    captureFinanceDraft();
    $("ml-finance-error").textContent = "";
  });
  const readable = [
    "ml-cash",
    "ml-saved",
    "ml-income",
    "ml-expense",
    "ml-saving",
    "ml-setting-saving",
    "ml-goal-amount",
  ];
  for (const id of readable) {
    const field = $(id),
      hint = document.createElement("small");
    hint.id = id + "-readable";
    hint.className = "experience-amount-hint";
    field.closest(".ml-input-wrap").after(hint);
    mlInstallMoneyInput(field, id === "ml-goal-amount" ? 1 : 0);
    field.setAttribute(
      "aria-describedby",
      [field.getAttribute("aria-describedby"), hint.id]
        .filter(Boolean)
        .join(" "),
    );
  }
  function hints() {
    for (const id of readable) {
      const amount = mlParseWon($(id).value);
      $(id + "-readable").textContent =
        Number.isSafeInteger(amount) && amount >= 0
          ? mlFormatKoreanWon(amount)
          : "";
    }
    markLongAmounts();
    updateSettingsAction();
    updateGoalSaveState();
  }
  function updateGoalSaveState() {
    const state = JourneyStore.current;
    const dirty =
      ($("ml-goal-name").value.trim() || "나의 목표") !== state.goalName ||
      mlParseWon($("ml-goal-amount").value) !== state.start.target * 10000 ||
      Number($("ml-goal-months").value) !== state.goalMonths;
    goalSaveState.textContent = dirty ? "저장 전 변경" : "저장됨";
    goalSaveState.dataset.state = dirty ? "dirty" : "saved";
    $("ml-save-goal").textContent = dirty ? "변경 내용 저장" : "목표 저장하기";
  }
  function markLongAmounts() {
    for (const node of document.querySelectorAll(
      "#money-life-app strong, #money-life-app dd, #ml-game-goal-current, #ml-goal-current-page, #ml-goal-target-page, #overlay strong",
    )) {
      const value = node.textContent.trim();
      const amount = /^[-+−]?[\d,.]+원$/.test(value);
      node.classList.toggle("is-long-money", amount && value.length > 13);
      node.classList.toggle("is-extra-long-money", amount && value.length > 17);
    }
  }
  document.addEventListener("input", hints);
  $("ml-finance-reset").addEventListener("click", () =>
    queueMicrotask(() => {
      captureFinanceDraft();
      hints();
    }),
  );
  const compact = matchMedia("(max-width:950px)");
  const plans = Array.from(document.querySelectorAll(".ml-report-item"));
  let selectedPlan = 1;
  const tabs = document.createElement("div");
  tabs.className = "experience-report-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "비교할 계획");
  document.querySelector(".ml-report-grid").before(tabs);
  plans.forEach((plan, index) => {
    plan.id = "experience-report-" + index;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = "experience-report-tab-" + index;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", plan.id);
    tab.textContent =
      index === 2 ? "가정 실험" : plan.querySelector("h3").textContent;
    tab.onclick = () => selectPlan(index);
    tabs.append(tab);
    const list = plan.querySelector("dl");
    for (const term of Array.from(list.querySelectorAll(":scope > dt"))) {
      const value = term.nextElementSibling,
        group = document.createElement("div");
      group.append(term, value);
      list.append(group);
    }
  });
  function selectPlan(index) {
    selectedPlan = index;
    plans.forEach((plan, i) => {
      plan.hidden = compact.matches && i !== index;
      if (compact.matches) {
        plan.setAttribute("role", "tabpanel");
        plan.setAttribute("aria-labelledby", "experience-report-tab-" + i);
      } else {
        plan.removeAttribute("role");
        plan.removeAttribute("aria-labelledby");
      }
    });
    Array.from(tabs.children).forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
  }
  tabs.onkeydown = (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 2
          : (selectedPlan + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    selectPlan(index);
    tabs.children[index].focus();
  };
  compact.addEventListener("change", () => selectPlan(selectedPlan));
  selectPlan(selectedPlan);
  let previousMonth = null;
  function syncControls() {
    const state = JourneyStore.current,
      running = Boolean(state.timer),
      due = Boolean(EV[state.month] && !state.events.has(state.month)),
      pending = Boolean(eventRequests.get());
    app.dataset.playback = running
      ? "running"
      : due
        ? "choice"
        : state.month >= 120
          ? "complete"
          : "paused";
    const playLabel =
      state.month >= 120
        ? "10년 결과 보기"
        : pending
          ? "저장 결과 다시 확인"
          : due
            ? "선택 확인하기"
            : running
              ? "일시 정지"
              : "자동 진행";
    $("game-play-toggle").innerHTML =
      mlIcon(
        state.month >= 120
          ? "chart"
          : pending
            ? "refresh"
            : due
              ? "message"
              : running
                ? "pause"
                : "play",
      ) +
      "<span>" +
      playLabel +
      "</span>";
    $("game-play-toggle").disabled = serverPlanBusy;
    $("game-play-toggle").setAttribute("aria-pressed", String(running));
    $("game-time-state").textContent =
      state.month >= 120
        ? "여정 완료"
        : due
          ? "선택 대기"
          : running
            ? "시간 진행 중"
            : "일시 정지";
    $("ml-one-month").disabled = serverPlanBusy;
    if ($("life-step-control")) {
      $("life-step-control").disabled = serverPlanBusy;
      $("life-step-control").textContent =
        state.month >= 120 ? "결과" : due ? "선택 확인" : "한 달";
      $("life-step-control").setAttribute(
        "aria-label",
        state.month >= 120
          ? "10년 결과 보기"
          : due
            ? "지금 인생 선택 확인"
            : "한 달 진행",
      );
    }
    $("ml-next-event").disabled = serverPlanBusy || running;
    document.querySelector(".play-speed > summary").textContent =
      state.speed + "×";
    document
      .querySelector(".play-speed > summary")
      .setAttribute("aria-label", "시간 진행 속도 " + state.speed + "배");
  }
  function renderExperience(path) {
    syncControls();
    hints();
    const state = JourneyStore.current,
      row = path[state.month],
      delta = row.total - path[Math.max(0, state.month - 1)].total;
    $("game-goal-percentage").textContent =
      Math.max(
        0,
        Math.min(100, (row.total / state.start.target) * 100),
      ).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "%";
    for (const key of ["cash", "income", "expense"])
      $("desktop-game-" + key).textContent = money(row[key]);
    const month = (9 + state.month) % 12;
    document.querySelector(".ml-world").dataset.season =
      month >= 2 && month <= 4
        ? "spring"
        : month >= 5 && month <= 7
          ? "summer"
          : month >= 8 && month <= 10
            ? "autumn"
            : "winter";
    if (state.timer) {
      $("game-story-title").textContent = "나의 일상이 쌓이고 있어요.";
      $("game-story-body").textContent =
        "매달 소득·지출·저축을 정산해요. 인생의 갈림길에서는 시간이 멈춰요.";
    } else if (state.month === 0)
      $("game-story-body").textContent =
        "자동 진행을 누르면 한 달씩 시간이 흘러가요. 한 달만 직접 진행할 수도 있어요.";
    const last = document.querySelector(
      "#game-month-receipt > div:last-of-type strong",
    );
    if (state.month && last) {
      last.textContent = (delta > 0 ? "+" : "") + money(delta);
      last.dataset.moneyDirection =
        delta < 0 ? "negative" : delta > 0 ? "positive" : "neutral";
    }
    const profile = $("ml-user-avatar");
    const portrait = avatar.cloneNode(true);
    portrait.setAttribute("viewBox", "15 0 70 70");
    profile.replaceChildren(portrait);
    profile.setAttribute("role", "img");
    profile.setAttribute("aria-label", "나의 캐릭터");
    const fullPortrait = avatar.cloneNode(true);
    fullPortrait.setAttribute("viewBox", "15 0 70 70");
    $("ml-profile-avatar").replaceChildren(fullPortrait);
    if (!state.logs.length)
      $("ml-game-log").textContent =
        "아직 선택한 이벤트가 없어요. 시간을 시작하면 인생의 갈림길을 만나요.";
    updateContext();
    if (
      previousMonth !== null &&
      previousMonth !== state.month &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      $("ml-game-date").animate(
        [
          { opacity: 0.3, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 350, easing: "ease-out" },
      );
      $("ml-game-goal-current").animate([{ opacity: 0.4 }, { opacity: 1 }], {
        duration: 450,
      });
    }
    previousMonth = state.month;
    markLongAmounts();
  }
  function onModal(scene) {
    app.inert = true;
    document.documentElement.classList.add("game-modal-open");
    overlay.setAttribute(
      "aria-label",
      scene === "event" ? "인생 선택 · 시간이 멈췄어요" : "금융 게임 상세",
    );
    const title = modal.querySelector("h2");
    if (title) {
      if (!title.id) title.id = "experience-dialog-title";
      overlay.setAttribute("aria-labelledby", title.id);
    } else overlay.removeAttribute("aria-labelledby");
    syncControls();
  }
  function onClose() {
    app.inert = false;
    document.documentElement.classList.remove("game-modal-open");
  }
  function setBusy(busy) {
    syncControls();
    updateContext();
    markLongAmounts();
    const feedback = $("life-event-feedback");
    if (feedback) {
      modal.setAttribute("aria-busy", String(busy));
      if (busy) {
        feedback.dataset.state = "loading";
        feedback.textContent = "선택을 저장하고 있어요…";
      } else if (feedback.dataset.state === "loading") {
        feedback.dataset.state = "";
        feedback.textContent = "";
      }
    }
  }
  function eventError(message) {
    const feedback = $("life-event-feedback");
    if (feedback) {
      feedback.dataset.state = "error";
      feedback.textContent = message + " 같은 선택으로 다시 확인할 수 있어요.";
    }
  }
  function updateContext() {
    const state = JourneyStore.current;
    const context = {
      assets: dates(state.month) + " · 현재 진행 월의 자산이에요.",
      report:
        dates(state.month) + "까지의 선택을 반영한 10년 후 예상 결과예요.",
      finance: "여기서 시작하면 현재 기기의 여정이 0개월부터 새로 시작돼요.",
      goal: "목표를 바꿔도 현재 자산과 이벤트 기록은 유지돼요.",
      settings:
        state.month >= 120
          ? "10년의 여정을 마쳤어요. 결과를 확인하거나 새로 시작할 수 있어요."
          : dates(state.month + 1) + "부터 적용할 조건을 정해요.",
      investment:
        "생활 시뮬레이션을 바탕으로 별도 사본에서 투자해요. 마을의 시간은 멈춰 있어요.",
    };
    for (const [page, text] of Object.entries(context))
      $("experience-context-" + page).textContent = text;
    $("experience-finance-note").textContent =
      state.month > 0
        ? "지금 여정을 이어가며 저축·금리만 바꾸려면 메뉴의 설정을 이용하세요. 입력 중인 값은 다른 화면을 다녀와도 이 탭에서 유지돼요."
        : "";
    $("experience-finance-note").hidden = state.month === 0;
    updateSettingsAction();
  }
  function updateSettingsAction() {
    const state = JourneyStore.current;
    const saving = $("ml-setting-saving").value.trim(),
      rate = $("ml-setting-rate").value.trim();
    const unchanged =
      saving !== "" &&
      rate !== "" &&
      mlParseWon(saving) / 10000 === state.saving &&
      Number(rate) === state.rate;
    $("ml-apply-settings").disabled =
      serverPlanBusy || state.month >= 120 || unchanged;
    $("experience-settings-note").textContent =
      state.month >= 120
        ? "10년의 여정이 끝났어요. 결과를 비교하거나 새 여정을 시작하세요."
        : unchanged
          ? "저축액이나 금리를 바꾼 후 적용하세요. 현재 자산과 기록은 유지돼요."
          : "이번 달까지의 자산은 그대로 두고, 다음 달부터 저축액과 저축 금리를 변경해요.";
    if (settingsChange && settingsChange.basis !== settingsBasis())
      settingsChange = null;
    settingsReceipt.hidden = !settingsChange;
  }
  function showSettingsChange(previousSaving, previousRate) {
    const state = JourneyStore.current;
    settingsChange = { basis: settingsBasis() };
    settingsReceipt.innerHTML = `<h3>${dates(Math.min(120, state.month + 1))}부터 적용</h3><dl><div><dt>월 저축액</dt><dd>${escapeHtml(mlFormatKoreanWon(previousSaving * 10000))} → <strong>${escapeHtml(mlFormatKoreanWon(state.saving * 10000))}</strong></dd></div><div><dt>연 저축 금리</dt><dd>${previousRate}% → <strong>${state.rate}%</strong></dd></div></dl>`;
    settingsReceipt.hidden = false;
  }
  function onPage(page) {
    placeStorage();
    if (page !== "dashboard" && desktopGame.matches) {
      $("play-details").open = false;
    }
    if (page === "finance" && financeDraft) {
      for (const [id, value] of financeDraft) $(id).value = value;
      financeSummary();
    }
    if (page === "goal" && goalDraft) {
      if (goalDraft.base === goalKey())
        for (const [id, value] of goalDraft.values) $(id).value = value;
      else goalDraft = null;
    }
    document
      .querySelectorAll(".play-header-tools [data-page]")
      .forEach((button) => {
        if (button.dataset.page === page)
          button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    updateContext();
    hints();
    syncControls();
  }
  function speedChanged() {
    syncControls();
    persist();
    document.querySelector(".play-speed").open = false;
  }
  return {
    render: renderExperience,
    syncControls,
    onModal,
    onClose,
    setBusy,
    eventError,
    onPage,
    clearFinanceDraft: () => {
      financeDraft = null;
      settingsChange = null;
      settingsReceipt.hidden = true;
    },
    clearGoalDraft: () => {
      goalDraft = null;
    },
    hasGoalDraft: () => Boolean(goalDraft && goalDraft.base === goalKey()),
    showSettingsChange,
    speedChanged,
  };
})();
