// The financial snapshot remains authoritative. This layer only stages its story.
const LifeJourney = (() => {
  const world = document.querySelector(".ml-world");
  const frame = document.querySelector(".play-map-frame");
  const actor = document.querySelector(".play-avatar");
  frame.append(actor);
  const status = document.createElement("div");
  status.className = "life-world-status";
  status.id = "life-world-status";
  world.append(status);
  const changes = document.createElement("div");
  changes.className = "life-town-changes";
  changes.setAttribute("aria-hidden", "true");
  changes.innerHTML = `<svg viewBox="0 0 1200 600" fill="none">
    <g class="life-home-change"><path d="M862 312l107-94 107 94z" fill="#608b7c"/><path d="M969 218l27-11 107 91-27 14z" fill="#4b7268"/>
      <path d="M905 338h26v27h-26zm98 0h26v27h-26z" fill="#f7d88b"/>
      <path d="M918 338v27m-13-14h26m85-13v27m-13-14h26" stroke="#fff2c8" stroke-width="3"/>
      <rect x="949" y="405" width="39" height="10" rx="3" fill="#5f8577"/>
      <path d="M891 390h25l-3 18h-19zm139 0h22l-3 18h-16z" fill="#b78266"/>
      <path d="M903 391v-19m139 19v-19" stroke="#718d63" stroke-width="4"/>
      <g fill="#e7c2a1"><circle cx="903" cy="371" r="7"/><circle cx="1042" cy="371" r="7"/></g>
      <path d="M936 289h67v14h-67z" fill="#fff3d5"/>
      <path d="M955 296h31" stroke="#6f8b74" stroke-width="3" stroke-linecap="round"/>
    </g>
    <g class="life-work-change">
      <path d="M735 191v-46" stroke="#587f85" stroke-width="4"/>
      <path d="M737 145h35l-7 13 7 13h-35z" fill="#557e90"/>
      <rect x="623" y="352" width="43" height="33" rx="2" fill="#5d7f88"/>
      <path d="M634 354v30m21-30v30" stroke="#e0e9dc" stroke-width="3"/>
      <path d="M592 216h18v23h-18zm34 39h18v23h-18zm34-39h18v23h-18z" fill="#fff0bc"/>
    </g>
    <g class="life-rest-change">
      <path d="M734 411h73v18h-73z" fill="#b69b72"/><path d="M737 434h68m-60-5v18m51-18v18" stroke="#68856a" stroke-width="5"/>
      <path d="M760 395q8-13 16 0m-28-6q6-11 12 0" stroke="#e7f0db" stroke-width="3" stroke-linecap="round"/>
    </g>
    <g class="life-travel-change">
      <path d="M1073 430h28v31h-28z" fill="#af7f5c"/><path d="M1081 430v-7h12v7m-13 2v27m14-27v27" stroke="#ead9b9" stroke-width="3"/>
      <path d="m1058 410 27-13-9 15-4-7-14 5Z" fill="#fcf4dc"/>
    </g>
    <g class="life-learning-change">
      <path d="M611 365q15-6 30 0v22q-15-6-30 0zm30 0q15-6 30 0v22q-15-6-30 0z" fill="#e5d5a9" stroke="#59797b" stroke-width="2"/>
      <path d="M641 366v20" stroke="#59797b" stroke-width="2"/>
    </g>
  </svg>`;
  frame.insertBefore(changes, actor);
  const settlement = document.createElement("section");
  settlement.id = "life-settlement";
  settlement.className = "life-settlement";
  settlement.hidden = true;
  settlement.setAttribute("aria-label", "월말 정산 연출");
  world.append(settlement);
  const mission = document.createElement("div");
  mission.className = "life-mission-progress";
  mission.innerHTML =
    '<div id="life-mission-progress" role="progressbar" aria-label="이번 장의 목표 진행률" aria-valuemin="0" aria-valuemax="100"><span></span></div><div class="life-mission-caption"><span id="life-mission-amount"></span><button id="life-mission-open" type="button">여정 보기</button></div>';
  $("game-story-body").after(mission);
  document.querySelector(".game-story .play-label").textContent =
    "지금 도전할 목표";
  $("life-mission-open").onclick = showAlbum;
  const album = document.createElement("button");
  album.type = "button";
  album.className = "ml-btn life-album-trigger";
  album.innerHTML = mlIcon("calendar") + "나의 이야기";
  album.onclick = showAlbum;
  const headingActions = document.createElement("div");
  headingActions.className = "life-heading-actions";
  const heading = document.querySelector(".play-heading");
  headingActions.append(album, heading.querySelector("button"));
  heading.append(headingActions);
  const stepControl = document.createElement("button");
  stepControl.type = "button";
  stepControl.id = "life-step-control";
  stepControl.className = "ml-btn life-step-control";
  stepControl.setAttribute("aria-label", "한 달만 진행");
  stepControl.textContent = "한 달";
  stepControl.onclick = () => $("ml-one-month").click();
  document
    .querySelector(".experience-time-controls")
    .insertBefore(
      stepControl,
      document.querySelector(".experience-time-controls .play-speed"),
    );
  const recap = document.createElement("section");
  recap.id = "life-report-recap";
  recap.className = "ml-card life-report-recap";
  const report = $("ml-page-report");
  report.insertBefore(recap, report.querySelector(".experience-page-actions"));
  let current, receiptTimer;
  const acknowledgements = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem("money-life-story-seen-v1"));
    if (Array.isArray(saved))
      saved
        .filter((value) => typeof value === "string")
        .slice(-150)
        .forEach((value) => acknowledgements.add(value));
  } catch {}
  const won = (value) => Math.round(value).toLocaleString("ko-KR") + "원";
  const brief = (value) => mlFormatKoreanWon(value);
  const signed = (value) =>
    (value > 0 ? "+" : value < 0 ? "−" : "") + won(Math.abs(value));
  const direction = (value) =>
    value < 0 ? "negative" : value > 0 ? "positive" : "neutral";
  function stateKey(state) {
    return JSON.stringify([
      state.initial,
      state.goal,
      state.monthlySaving,
      state.annualRate,
    ]);
  }
  function milestoneKey(item) {
    return current.key + ":" + item.id + ":" + item.hit;
  }
  function remember(key) {
    acknowledgements.add(key);
    try {
      localStorage.setItem(
        "money-life-story-seen-v1",
        JSON.stringify([...acknowledgements].slice(-150)),
      );
    } catch {}
  }
  function sceneHeadline(state, life, row) {
    if (state.month === 0)
      return state.initial.income > 0
        ? "내 첫 월급, 어디에 쓸까요?"
        : "나의 첫 달, 어떻게 시작할까요?";
    if (row.short > 0) return "생활비가 부족해요. 다음 달을 준비해요.";
    if (life.travelling) return "모아온 돈으로, 꿈꾸던 곳에 왔어요.";
    if (life.work === "rest") return "오늘은 나의 속도로 쉬어갑니다.";
    if (state.month === 49 && life.work === "newjob")
      return "새로운 직장에서 첫 달을 시작해요.";
    if (state.month === 13 && life.home === "independent")
      return "내가 고른 집에서 맞는 첫 아침.";
    if (state.month === 1)
      return row.income > 0
        ? "첫 월급을 나누니, 내일이 보입니다."
        : "소득 없이 보낸 첫 달, 지갑을 살펴봐요.";
    return [
      "조금씩 쌓이는 돈, 넓어지는 선택.",
      "어떤 일상을 만들고 싶나요?",
      "이번 달도 내 미래를 만들어갑니다.",
    ][state.month % 3];
  }
  function render(path) {
    if (!LifeEventCatalog) return;
    const state = JourneyStore.snapshot();
    if (
      current &&
      (current.state.month !== state.month || current.key !== stateKey(state))
    ) {
      clearTimeout(receiptTimer);
      settlement.hidden = true;
    }
    const life = MoneyLifeStory.life(state, LifeEventCatalog);
    const missions = MoneyLifeStory.missions(state, path).map((item) => ({
      ...item,
      title:
        item.id === "first"
          ? `첫 ${brief(item.needed)} 더 모으기`
          : item.id === "reserve" && item.needed === state.initial.expense * 3
            ? "시작 생활비 3개월분 더 모으기"
            : item.title,
    }));
    const active = missions.find((item) => !item.complete) || missions.at(-1);
    current = { state, life, missions, active, path, key: stateKey(state) };
    world.dataset.lifeHome = life.home;
    world.dataset.lifeWork = life.work;
    world.dataset.lifeTravel = life.travelled ? "yes" : "no";
    world.dataset.lifeLearning = life.learning ? "yes" : "no";
    world.dataset.lifeLocation = life.location;
    status.innerHTML =
      mlIcon(
        life.travelling
          ? "arrow"
          : life.work === "rest"
            ? "home"
            : life.learning
              ? "work"
              : "home",
      ) + `<span>${escapeHtml(life.label)}</span>`;
    const home = document.querySelector(".ml-building.home strong");
    home.innerHTML =
      (life.home === "independent"
        ? "나의 집"
        : life.home === "unknown"
          ? "우리 집"
          : "함께 사는 집") +
      `<small>${life.home === "independent" ? "내가 선택한 독립" : life.home === "unknown" ? "나의 생활 공간" : "독립 준비하기"}</small>`;
    const office = document.querySelector(".ml-building.office strong");
    office.innerHTML =
      (life.work === "newjob"
        ? "새로운 직장"
        : life.work === "rest"
          ? "잠시 쉬는 중"
          : "직장") +
      `<small>${life.learning ? "배움으로 넓힌 나의 경험" : life.work === "rest" ? "3개월의 휴식" : "일과 새로운 기회"}</small>`;
    const due =
      EV[state.month] && !JourneyStore.current.events.has(state.month);
    $("ml-game-chapter").textContent =
      state.month >= 120
        ? "여정 완료 · 내가 살아본 10년"
        : `${active.index}장 · ${active.chapter}`;
    if (!due && state.month < 120) {
      $("ml-world-title").textContent = sceneHeadline(
        state,
        life,
        path[state.month],
      );
      $("game-story-title").textContent = active.complete
        ? active.amount < active.needed
          ? "도달한 목표를 다시 준비해요"
          : "목표에 도착한 나의 일상"
        : path[state.month].short > 0
          ? "이번 달 생활비가 부족해요"
          : active.title;
      $("game-story-body").textContent = active.complete
        ? `${dates(active.hit)}에 처음 도달했어요. ${active.amount < active.needed ? `지금은 목표보다 ${brief(active.needed - active.amount)} 부족해요.` : "다음 목표를 정하거나 이 일상을 이어가세요."}`
        : path[state.month].short > 0
          ? `이번 달 부족액 ${brief(path[state.month].short * 10000)}. 내 자산과 다음 달 조건을 먼저 확인해보세요.`
          : active.id === "goal"
            ? state.month > state.goal.months
              ? `목표 기한을 ${state.month - state.goal.months}개월 지났어요. 금액이나 기한을 목표 설정에서 다시 정할 수 있어요.`
              : `${state.goal.months}개월차까지 ${brief(active.target)}. 매달의 생활과 선택으로 완성해보세요.`
            : `출발보다 순자산 ${brief(active.needed)} 더 모으기. 달성하면 다음 장이 열려요.`;
    }
    mission.hidden = Boolean(due || state.month >= 120);
    $("life-mission-progress").setAttribute(
      "aria-valuenow",
      String(Math.round(active.progress * 100)),
    );
    $("life-mission-progress").setAttribute(
      "aria-valuetext",
      `${brief(active.amount)} / ${brief(active.needed)}`,
    );
    $("life-mission-progress").firstElementChild.style.width =
      active.progress * 100 + "%";
    $("life-mission-amount").textContent =
      `${brief(active.amount)} / ${brief(active.needed)}`;
    $("life-mission-open").textContent = active.complete
      ? "목표 관리"
      : path[state.month].short > 0
        ? "내 자산 확인"
        : "여정 보기";
    $("life-mission-open").onclick = active.complete
      ? () => mlShowPage("goal")
      : path[state.month].short > 0
        ? () => mlShowPage("assets")
        : showAlbum;
    $("ml-world-desc").textContent =
      `${life.label}. ${due ? "지금의 선택이 다음 달의 생활을 바꿔요." : "작은 목표를 채우며 나만의 삶을 만들어보세요."}`;
    const count = life.choices.length;
    recap.innerHTML = `<div class="life-recap-heading"><div><span class="play-label">숫자에 담긴 나의 이야기</span><h2>${state.month}개월, ${count}번의 인생 선택</h2></div><button type="button" class="ml-btn" id="life-report-story">여정 돌아보기</button></div><p>${escapeHtml(life.label)} · 지금 순자산 ${escapeHtml(won(path[state.month].total * 10000))}</p>`;
    $("life-report-story").onclick = showAlbum;
  }
  function milestoneCard(item) {
    return `<li class="life-chapter-step${item.complete ? " is-complete" : ""}"><span class="life-chapter-dot" aria-hidden="true"></span><div><span class="play-label">${item.index}장 · ${escapeHtml(item.chapter)}</span><strong>${escapeHtml(item.title)}</strong><p>${item.base ? "출발보다 " : "순자산 "}${escapeHtml(brief(item.needed))}${item.base ? " 더 모으기" : " 모으기"}</p><small>${item.complete ? (item.hit === 0 ? "출발 시점에 도달" : `${dates(item.hit)} · 첫 도달`) : current.state.month >= 120 ? "이번 여정에서는 미도달" : "앞으로 만들어갈 이야기"}</small></div></li>`;
  }
  function showAlbum() {
    if (!current) return;
    const { state, life, missions, path } = current;
    const entries = life.choices
      .map(
        (choice) =>
          `<li><span>${dates(choice.month)}</span><strong>${escapeHtml(choice.label)}</strong><small>${choice.accepted === null ? "선택한 내용이 기록에 남아 있지 않아요." : !choice.accepted ? "현재 조건 유지" : choice.applied ? "생활에 반영됨" : "다음 달부터 생활에 반영"}</small></li>`,
      )
      .join("");
    show(
      `<div class="game-kicker">MY LIFE · 나의 여정</div><h2>${state.month >= 120 ? escapeHtml(MoneyLifeStory.ending(state, LifeEventCatalog)) : "지금까지 만들어온 나의 삶"}</h2><p>${escapeHtml(life.label)}</p><div class="life-album-grid"><section><h3>작은 목표가 모여 하나의 미래로</h3><ol class="life-chapter-list">${missions.map(milestoneCard).join("")}</ol></section><section><h3>내가 고른 삶</h3>${entries ? `<ol class="life-choice-history">${entries}</ol>` : `<p class="life-empty">${state.month < 12 ? "첫 인생 선택은 12개월차의 독립이에요. 그전에는 매달의 생활을 준비해보세요." : "이 여정에 저장된 인생 선택이 없어요. 현재 불러온 진행 기록을 기준으로 보여드려요."}</p>`}<div class="life-ending-money"><span>지금까지 순자산 변화</span><strong data-money-direction="${direction(path[state.month].total - path[0].total)}">${signed((path[state.month].total - path[0].total) * 10000)}</strong><small>출발 ${won(path[0].total * 10000)} → 현재 ${won(path[state.month].total * 10000)}</small></div></section></div><div class="buttonrow"><button type="button" class="btn primary" id="life-album-back">마을에서 계속하기</button><button type="button" class="btn" id="life-album-report">금액으로 비교하기</button></div>`,
      "life-album",
    );
    $("life-album-back").textContent =
      state.month >= 120 ? "마을 돌아보기" : "마을에서 계속하기";
    $("life-album-back").onclick = () => {
      closeModal();
      mlShowPage("dashboard");
    };
    $("life-album-report").onclick = () => {
      closeModal();
      compare();
    };
  }
  function goalTiming(item) {
    if (item.id !== "goal") return "";
    const delay = item.hit - current.state.goal.months;
    return `<p class="life-goal-timing">${delay > 0 ? `목표 기한보다 ${delay}개월 늦게 처음 도달했어요.` : "정해둔 기한 안에 처음 도달했어요."}</p>`;
  }
  function showMilestone(item) {
    const { path, state, missions } = current;
    const next = missions[item.index];
    for (const completed of missions.filter(
      (entry) => entry.complete && entry.hit <= item.hit,
    ))
      remember(milestoneKey(completed));
    show(
      `<div class="game-kicker">CHAPTER CLEAR · ${item.index}장</div><div class="life-achievement-art" aria-hidden="true">${mlIcon(item.id === "first" ? "coins" : item.id === "reserve" ? "home" : "target")}</div><h2>${item.id === "goal" ? "내가 그린 목표에 도착했어요" : `${escapeHtml(item.chapter)}, 해냈어요`}</h2><p>${item.base ? "출발 자산에 더해 " : "순자산 "}<strong>${escapeHtml(brief(item.needed))}</strong>${item.base ? "을 모았어요." : "에 처음 도달했어요."} ${dates(item.hit)}의 기록이에요.</p>${goalTiming(item)}<div class="life-achievement-value"><span>지금의 순자산</span><strong>${won(path[state.month].total * 10000)}</strong></div><p>${next ? `다음은 ${escapeHtml(next.chapter)}. ${next.base ? "출발보다 " : "순자산 "}${escapeHtml(brief(next.needed))}${next.base ? " 더 모으기" : " 모으기"}에 도전해요.` : "지나온 선택을 돌아보고, 다음 목표를 직접 정할 수 있어요."}</p><p class="note">작은 목표는 여정을 나눈 이정표예요. 달성으로 자산이 추가되거나 기존 목표가 바뀌지는 않아요.</p><div class="buttonrow"><button type="button" class="btn primary" id="life-chapter-continue">${next ? "다음 장으로" : "이 여정 계속하기"}</button>${next ? "" : '<button type="button" class="btn" id="life-next-goal">다음 목표 정하기</button>'}<button type="button" class="btn" id="life-chapter-album">나의 이야기 보기</button></div>`,
      "life-milestone",
    );
    $("life-chapter-continue").onclick = () => {
      remember(milestoneKey(item));
      closeModal();
      render(current.path);
    };
    if ($("life-next-goal"))
      $("life-next-goal").onclick = () => {
        remember(milestoneKey(item));
        closeModal();
        mlShowPage("goal");
      };
    $("life-chapter-album").onclick = () => {
      remember(milestoneKey(item));
      showAlbum();
    };
  }
  function progressed(from) {
    if (!current || JourneyStore.current.activePage !== "dashboard") return;
    const state = JourneyStore.current;
    if (state.month <= from) return;
    clearTimeout(receiptTimer);
    if (state.month - from === 1) {
      const receipt = MoneyLifeStory.receipt(current.path, state.month);
      settlement.innerHTML = `<span class="life-settlement-title">${dates(state.month)} 정산</span><div><span>${mlIcon("work")} 소득</span><strong data-money-direction="${direction(receipt.income)}">${signed(receipt.income)}</strong></div><div><span>${mlIcon("wallet")} 지출</span><strong data-money-direction="${direction(-receipt.expense)}">${signed(-receipt.expense)}</strong></div><div><span>${mlIcon("coins")} 저축 이동</span><strong>${won(receipt.transfer)}</strong></div><small>저축 이동은 현금에서 저축으로 옮긴 금액이에요.</small>`;
      settlement.hidden = false;
      settlement.style.setProperty(
        "--settlement-step",
        `${Math.min(180, 160 / state.speed)}ms`,
      );
      settlement
        .getAnimations({ subtree: true })
        .forEach((animation) => animation.cancel());
      settlement.classList.remove("is-arriving");
      void settlement.offsetWidth;
      settlement.classList.add("is-arriving");
      receiptTimer = setTimeout(
        () => {
          settlement.hidden = true;
        },
        Math.max(500, Math.min(2200, 1800 / state.speed)),
      );
    }
    if (
      state.month - from !== 1 ||
      (EV[state.month] && !state.events.has(state.month))
    )
      return;
    const achieved = current.missions
      .filter(
        (item) =>
          item.complete &&
          item.hit > from &&
          !acknowledgements.has(milestoneKey(item)),
      )
      .at(-1);
    if (!achieved && state.month < 120) return;
    stop();
    const month = state.month,
      key = current.key;
    queueMicrotask(() => {
      if (
        month !== JourneyStore.current.month ||
        key !== current.key ||
        JourneyStore.current.activePage !== "dashboard" ||
        !$("overlay").classList.contains("hidden")
      )
        return;
      if (month >= 120) showAlbum();
      else showMilestone(achieved);
    });
  }
  function beforeAdvance() {
    if (
      !current ||
      !EV[current.state.month] ||
      !JourneyStore.current.events.has(current.state.month)
    )
      return false;
    const item = current.missions
      .filter(
        (entry) =>
          entry.complete &&
          entry.hit === current.state.month &&
          !acknowledgements.has(milestoneKey(entry)),
      )
      .at(-1);
    if (!item) return false;
    showMilestone(item);
    return true;
  }
  function openPlace(place) {
    if (!current || !["home", "work"].includes(place)) return false;
    const months = place === "home" ? [12] : [30, 48, 96];
    const choice = current.life.choices
      .filter((entry) => months.includes(entry.month))
      .at(-1);
    if (!choice) return false;
    const target = months.find(
      (month) =>
        month >= current.state.month && !JourneyStore.current.events.has(month),
    );
    const row = current.path[current.state.month];
    const choiceStatus =
      choice.accepted === null
        ? "선택 내용 기록 없음"
        : !choice.accepted
          ? "기존 조건 유지"
          : !choice.applied
            ? "다음 달부터 반영 예정"
            : choice.month === 30 && current.state.month > 33
              ? "3개월의 휴식을 마치고 일상으로 복귀"
              : "선택이 반영된 생활";
    const title =
      place === "home"
        ? current.life.home === "independent"
          ? "나의 집과 일상"
          : "내가 선택한 생활 공간"
        : current.life.work === "rest"
          ? "잠시 쉬어가는 나의 일상"
          : current.life.work === "newjob"
            ? "새로운 직장에서의 일상"
            : "나의 일과 다음 기회";
    show(
      `<div class="game-kicker">${place === "home" ? "HOME" : "WORK"} · 지금의 생활</div><h2>${title}</h2><p>${escapeHtml(choice.label)} · ${choiceStatus}</p><dl class="life-place-wallet"><div><dt>남은 현금</dt><dd>${won(row.cash * 10000)}</dd></div><div><dt>이번 달 소득</dt><dd>${won(row.income * 10000)}</dd></div><div><dt>이번 달 지출</dt><dd>${won(row.expense * 10000)}</dd></div></dl><p class="note">이번 달 지출에는 생활비와 일회성 이벤트 비용이 함께 포함돼요.</p>${target !== undefined ? `<h3>이 장소의 다음 이야기</h3><p>${escapeHtml(EV[target].title)} · ${dates(target)}</p><p class="note">다른 장소에서 먼저 만날 선택이 있으면 그 선택부터 진행해요.</p>` : "<p>이 장소의 예정된 선택을 모두 지났어요. 지금까지의 이야기를 돌아볼 수 있어요.</p>"}<div class="buttonrow">${target !== undefined ? '<button type="button" class="btn primary" id="game-place-next">다음 인생 선택 만나기</button>' : ""}<button type="button" class="btn" id="life-place-story">나의 이야기 보기</button></div>`,
      "life-place",
    );
    if ($("game-place-next"))
      $("game-place-next").onclick = () => {
        closeModal();
        nextEvent();
      };
    $("life-place-story").onclick = showAlbum;
    return true;
  }
  function reset() {
    acknowledgements.clear();
    try {
      localStorage.removeItem("money-life-story-seen-v1");
    } catch {}
    clearTimeout(receiptTimer);
    settlement.hidden = true;
  }
  return { render, progressed, beforeAdvance, openPlace, reset, showAlbum };
})();
