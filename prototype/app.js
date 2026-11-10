/*
 * 파일 목적: 머니 라이프 화면의 입력, 페이지 전환, 금융 시뮬레이션을 제어합니다.
 * 화면 구성: index.html의 MY FINANCE 사이드바는 유지하고 오른쪽 콘텐츠만 전환합니다.
 * 연동 파일: 재무 입력은 finance.html, 금융 계산은 engine.js, 스타일은 styles.css에 있습니다.
 * 금액 단위: 입력 데이터는 원, 금융 계산 엔진으로 전달할 때는 만 원으로 변환합니다.
 */
/* =========================================================
   머니 라이프 통합 스크립트
   1) 재무 입력값을 원 단위로 관리합니다.
   2) 시뮬레이션 엔진에는 만 원 단위로 변환해 전달합니다.
   3) 기존 사이드바는 유지하고 오른쪽 페이지 내용만 전환합니다.
   ========================================================= */
const mlEl = (id) => document.getElementById(id);
const won = (value) => Math.max(0, Number(value) || 0);
const mlFormatAmount = (value) => Math.round(value).toLocaleString("ko-KR");
const mlFormatWon = (value) => mlFormatAmount(value) + "원";
const mlFormatMan = (value) => Math.round(value).toLocaleString("ko-KR") + "만 원";
function mlFormatKoreanWon(value) {
  let remainder = Math.round(Math.abs(value));
  const parts = [];
  for (const [size, unit] of [[1e12,"조"],[1e8,"억"],[1e4,"만"]]) {
    const count = Math.floor(remainder/size);
    if (count) parts.push(mlFormatAmount(count) + unit);
    remainder %= size;
  }
  const sign = value < 0 && (parts.length || remainder) ? "−" : "";
  parts.push(remainder || !parts.length ? mlFormatAmount(remainder) + "원" : "원");
  return sign + parts.join(" ");
}

function mlFormatDuration(months) {
  const years = Math.floor(months/12);
  const remaining = months%12;
  return [years ? years + "년" : "", remaining ? remaining + "개월" : ""].filter(Boolean).join(" ");
}
const mlCompact = (value) => {
  const n = Math.round(value);
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + "억";
  return n.toLocaleString("ko-KR");
};
const mlFinanceStorageKey = "money-life-finance-v1";

// 재무 입력 화면의 기본 예시값입니다. 금액 단위는 원입니다.
const mlDefaults = {
  cash:12000000, stocks:5000000, funds:3000000, property:50000000,
  loan:30000000, credit:5000000, cardDebt:2000000, otherDebt:0,
  income:4000000, expense:2500000, goalName:"나만의 공간 마련하기",
  goalAmount:50000000, goalMonths:60, incomeType:"근로소득", expenseCategories:["주거비","식비"],
  name:"나의 첫 번째 인생", age:25, annualRate:3, monthlySaving:null
};
const mlFinanceFields = {
  cash:"cash", stocks:"stocks", funds:"funds", property:"property",
  loan:"loan", credit:"credit", "card-debt":"cardDebt", "other-debt":"otherDebt",
  income:"income", expense:"expense"
};
const mlStartFieldErrors = {
  "ml-start-age":"시작 나이는 18~80세 사이의 정수로 입력해 주세요.",
  "ml-start-saving":"월 저축액을 0원 이상의 정수로 입력해 주세요.",
  "ml-start-rate":"연 수익률은 0~8% 사이로 입력해 주세요."
};
const mlIncomeOptions = document.querySelectorAll("#ml-income-types .ml-choice");
const mlExpenseOptions = document.querySelectorAll("#ml-finance-form .ml-tag input");
let mlFinance = {...mlDefaults};
let mlFinanceDraft = {};
let mlMonth = 0;
let mlTimer = null;
let mlSpeed = 1;
let mlBaseSaving = 150;
let mlCurrentSaving = 150;
let mlChanges = [];
let mlRateChanges = [];
let mlEventSelections = new Set();
let mlLogs = [];
const mlEvents = {
  12:{emoji:"🏡",title:"나만의 공간, 시작해볼까요?",body:"혼자만의 작은 집을 구할 기회가 생겼습니다. 자유로운 일상과 늘어나는 생활비, 당신의 선택은?",yes:"지금 독립할래요",yesText:"다음 달에 이사비 300만 원을 한 번 내고, 그달부터 생활비가 매달 30만 원 늘어요.",changes:[{type:"expense",v:30},{type:"once",v:300}],no:"조금 더 준비할래요",noText:"이사비 없이 현재 생활비를 유지하며 목표 자금을 모아요."},
  30:{emoji:"🌿",title:"잠깐 쉬어가도 괜찮을까요?",body:"3개월의 휴식이 가능한 시점입니다. 잠시 일을 내려놓으면 금융 계획은 어떻게 바뀔까요?",yes:"나를 위한 휴식",yesText:"다음 달부터 3개월 동안 월 소득이 250만 원 감소합니다.",changes:[{type:"income",v:-250,duration:3}],no:"지금의 일상 유지",noText:"휴식으로 인한 소득 변화 없이 계획을 이어갑니다."},
  48:{emoji:"💼",title:"새로운 기회가 찾아왔어요",body:"새로운 직장의 제안을 받았습니다. 준비 비용이 들지만 월 소득이 늘어납니다.",yes:"새로운 도전 시작",yesText:"다음 달부터 월 소득 40만 원 증가와 준비 비용 200만 원을 반영합니다.",changes:[{type:"income",v:40},{type:"once",v:200}],no:"지금의 자리에서",noText:"현재 직장과 소득을 유지합니다."},
  72:{emoji:"✈️",title:"꿈꿔왔던 여행을 떠날까요?",body:"오랫동안 마음속에 담아둔 여행입니다. 오늘의 경험과 내일의 목표 사이에서 선택해보세요.",yes:"지금 떠날래요",yesText:"다음 달에 여행 비용 400만 원을 지출합니다.",changes:[{type:"once",v:400}],no:"다음을 기약할래요",noText:"추가 지출 없이 목표 자금을 유지합니다."},
  96:{emoji:"🎓",title:"배움에 투자할 시간",body:"새로운 역량을 배울 수 있는 과정이 열렸습니다. 교육 비용을 반영해 미래를 비교해보세요.",yes:"배움을 시작할래요",yesText:"다음 달에 교육 비용 200만 원을 지출합니다.",changes:[{type:"once",v:200}],no:"지금 계획을 유지",noText:"현재의 지출과 저축 계획을 유지합니다."}
};

function mlParseFinanceAmount(value) {
  const text = value.trim();
  if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(text)) return null;
  const amount = Number(text.replaceAll(",", ""));
  return Number.isSafeInteger(amount) ? amount : null;
}

function mlSetFinanceFieldError(input, message) {
  const error = mlEl(input.id + "-error");
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  error.hidden = !message;
  error.textContent = message;
  return !message;
}

function mlValidateFinanceAmount(input) {
  if (mlParseFinanceAmount(input.value) !== null) return mlSetFinanceFieldError(input,"");
  const message = input.value.trim() ? "0원 이상의 정수 금액을 입력해 주세요." : "금액을 입력해 주세요. 해당 금액이 없으면 0원을 입력하세요.";
  return mlSetFinanceFieldError(input,message);
}

function mlValidateStartField(input) {
  const valid = input.id === "ml-start-saving" ? !input.value.trim() || mlParseFinanceAmount(input.value) !== null : input.validity.valid;
  return mlSetFinanceFieldError(input,valid ? "" : mlStartFieldErrors[input.id]);
}

function mlWriteFinanceInputs(data) {
  mlEl("ml-start-name").value = data.name;
  mlEl("ml-start-age").value = data.age;
  mlEl("ml-start-rate").value = data.annualRate;
  mlEl("ml-start-saving").value = data.monthlySaving == null ? "" : mlFormatAmount(data.monthlySaving);
  Object.keys(mlStartFieldErrors).forEach((id) => mlValidateStartField(mlEl(id)));
  Object.entries(mlFinanceFields).forEach(([id, key]) => {
    const input = mlEl("ml-" + id);
    mlFinanceDraft[key] = data[key];
    input.value = mlFormatAmount(data[key]);
    mlValidateFinanceAmount(input);
  });
  mlIncomeOptions.forEach((button) => button.classList.toggle("active",button.dataset.value === data.incomeType));
  const categories = Array.isArray(data.expenseCategories) ? data.expenseCategories : mlDefaults.expenseCategories;
  mlExpenseOptions.forEach((input) => { input.checked = categories.includes(input.value); });
}

// 입력을 수정하는 동안에는 마지막으로 유효했던 금액을 요약에 사용합니다.
function mlReadFinanceAmounts() {
  return Object.fromEntries(Object.entries(mlFinanceFields).map(([id, key]) => [
    key, mlParseFinanceAmount(mlEl("ml-" + id).value) ?? mlFinanceDraft[key]
  ]));
}
function mlTotalAssets(data=mlFinance) { return data.cash + data.stocks + data.funds + data.property; }
function mlTotalDebt(data=mlFinance) { return data.loan + data.credit + data.cardDebt + data.otherDebt; }
function mlNetWorth(data=mlFinance) { return mlTotalAssets(data) - mlTotalDebt(data); }
function mlMonthlyLeft(data=mlFinance) { return data.income - data.expense; }
function mlInitialSaving() { return (mlFinance.monthlySaving ?? Math.max(0,mlMonthlyLeft()))/10000; }

// 재무 정보 입력값을 원 단위로 요약해 보여줍니다.
function mlUpdateFinanceSummary() {
  mlFinanceDraft = mlReadFinanceAmounts();
  const net = mlNetWorth(mlFinanceDraft);
  const balance = mlMonthlyLeft(mlFinanceDraft);
  mlEl("ml-total-assets").textContent = mlFormatWon(mlTotalAssets(mlFinanceDraft));
  mlEl("ml-total-debt").textContent = mlFormatWon(mlTotalDebt(mlFinanceDraft));
  mlEl("ml-net-assets").textContent = mlFormatWon(net);
  mlEl("ml-month-balance").textContent = mlFormatWon(balance);
  mlEl("ml-net-assets").style.color = net < 0 ? "#c56868" : "#7563df";
  mlEl("ml-month-balance").style.color = balance < 0 ? "#c56868" : "#292841";
}

// 엔진의 시작 데이터는 만 원 단위입니다.
function mlEngineStart() {
  return {
    cash:mlFinance.cash / 10000,
    saved:(mlFinance.stocks + mlFinance.funds) / 10000,
    otherAssets:mlFinance.property / 10000,
    debt:mlTotalDebt() / 10000,
    income:mlFinance.income / 10000,
    expense:mlFinance.expense / 10000
  };
}
function mlSimulation(changes=mlChanges, rates=mlRateChanges, monthlySaving=mlBaseSaving) {
  return window.GameEngine.simulate({
    initial:mlEngineStart(), changes, rateChanges:rates,
    monthlySaving, annualRate:mlFinance.annualRate, months:120
  });
}
function mlCurrentState() { return mlSimulation()[mlMonth]; }
function mlLog(message, effectiveMonth = null) {
  mlLogs.unshift({month:mlMonth,text:message,effectiveMonth});
  if (mlLogs.length > 30) mlLogs.pop();
}
function mlToast(message) {
  const toast = mlEl("ml-toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(mlToast.timer);
  mlToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function mlSaveFinance() {
  try {
    localStorage.setItem(mlFinanceStorageKey,JSON.stringify(mlFinance));
    return true;
  } catch(error) { return false; }
}

function mlConfirmAction(title, description, action, onConfirm) {
  const dialog = mlEl("ml-confirm");
  const accept = mlEl("ml-confirm-accept");
  mlEl("ml-confirm-title").textContent = title;
  mlEl("ml-confirm-description").textContent = description;
  accept.textContent = action;
  accept.onclick = () => {
    dialog.close();
    onConfirm();
  };
  dialog.showModal();
}

// 왼쪽 사이드바 버튼에 맞춰 오른쪽 콘텐츠만 교체합니다.
function mlShowPage(page) {
  if (page !== "dashboard" && mlTimer) mlStop();
  document.querySelectorAll("#money-life-app .ml-page").forEach((section) => {
    section.classList.toggle("active", section.id === "ml-page-" + page);
  });
  document.querySelectorAll("#money-life-app .ml-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  if (page === "dashboard") mlRenderDashboard();
  if (page === "assets") mlRenderAssets();
  if (page === "goal") mlRenderGoal();
  if (page === "report") mlRenderReport();
  if (page === "settings") {
    mlEl("ml-setting-rate").value = mlRateChanges.at(-1)?.v ?? mlFinance.annualRate;
    mlEl("ml-setting-saving").value = Math.round(mlCurrentSaving*10000);
  }
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("#money-life-app [data-page]").forEach((button) => {
  button.addEventListener("click", () => mlShowPage(button.dataset.page));
});

// 자산 시뮬레이션 그래프의 SVG를 생성합니다.
function mlDrawChart(svgId, paths, large=false) {
  const svg = mlEl(svgId);
  const width = large ? 520 : 420;
  const height = large ? 250 : 127;
  const pad = {left:large?106:46,right:15,top:large?18:14,bottom:large?30:25};
  const all = paths.flatMap((path) => path.map((point) => point.total));
  let minimum = Math.min(0,...all) * 1.12;
  let maximum = Math.max(large?0:mlFinance.goalAmount/10000,...all,1) * 1.12;
  let tickCount = 3;
  if (large) {
    const desiredStep = Math.max(1,(maximum-minimum)/5);
    const unit = 10**Math.floor(Math.log10(desiredStep));
    const step = [1,2,5,10].find((factor) => desiredStep <= factor*unit*1.5)*unit;
    minimum = Math.floor(minimum/step)*step;
    maximum = Math.ceil(maximum/step)*step;
    tickCount = Math.round((maximum-minimum)/step);
  }
  const x = (month) => pad.left + month/120*(width-pad.left-pad.right);
  const y = (value) => height-pad.bottom-((value-minimum)/(maximum-minimum))*(height-pad.top-pad.bottom);
  let html = "";
  for (let i=0;i<=tickCount;i++) {
    const value = minimum + (maximum-minimum)*i/tickCount;
    html += '<line x1="' + pad.left + '" y1="' + y(value) + '" x2="' + (width-pad.right) + '" y2="' + y(value) + '" stroke="#eeeaf3" stroke-dasharray="3 4"/>';
    if (large) html += '<text class="ml-chart-axis-label" x="' + (pad.left-8) + '" y="' + y(value) + '" text-anchor="end" dominant-baseline="middle">' + mlFormatKoreanWon(value*10000).replace(/ ?원$/,"") + '</text>';
  }
  const goal = mlFinance.goalAmount/10000;
  const showGoal = large && goal <= maximum;
  if (showGoal) {
    html += '<line class="ml-chart-goal ml-series-goal" x1="' + pad.left + '" y1="' + y(goal) + '" x2="' + (width-pad.right) + '" y2="' + y(goal) + '" stroke-dasharray="8 4"/>';
  }
  const series = ["current","base","stress"];
  const dashes = ["none","5 4","1 4"];
  paths.forEach((path,index) => {
    const points = path.map((point,month) => x(month) + "," + y(point.total)).join(" ");
    html += '<polyline class="ml-series-' + series[index] + '" points="' + points + '" fill="none" stroke-width="' + (index===0?2.7:1.8) + '" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="' + dashes[index] + '"/>';
  });
  const current = paths[0][Math.min(mlMonth,120)];
  html += '<line x1="' + x(mlMonth) + '" x2="' + x(mlMonth) + '" y1="' + pad.top + '" y2="' + (height-pad.bottom) + '" stroke="#c7b5e3" stroke-dasharray="3 4"/>';
  html += '<circle cx="' + x(mlMonth) + '" cy="' + y(current.total) + '" r="4" fill="#8c75ce" stroke="white" stroke-width="2"/>';
  const milestones = large ? [0,24,48,72,96,120] : [0,120];
  milestones.forEach((month) => {
    const anchor = month === 0 ? "start" : month === 120 ? "end" : "middle";
    const label = month === 0 ? "시작" : month/12 + "년";
    html += '<text class="ml-chart-axis-label" x="' + x(month) + '" y="' + (height-8) + '" text-anchor="' + anchor + '">' + label + '</text>';
  });
  svg.innerHTML = html;
  return showGoal;
}

// 이벤트가 적용된 금융 경로를 생성합니다.
function mlEventChanges(eventMonth, event) {
  return event.changes.map((change) => ({
    ...change, m:eventMonth+1,
    end:change.duration ? eventMonth+change.duration : null
  }));
}
function mlNextEventMonth() {
  return Object.keys(mlEvents).map(Number).find((m) => m >= mlMonth && !mlEventSelections.has(m));
}

function mlCompareNetWorth(difference, baseline) {
  if (Math.round(Math.abs(difference)) === 0) return baseline + "과 같아요.";
  return baseline + "보다 " + mlFormatMan(Math.abs(difference)) + (difference < 0 ? " 낮아요." : " 높아요.");
}

function mlGoalMonth(path) {
  return path.findIndex((point) => point.total >= mlFinance.goalAmount/10000);
}

function mlCompareGoalTiming(base, current) {
  if (base < 0 && current < 0) return "두 계획 모두 10년 내 미도달";
  if (base < 0) return "내 선택만 10년 내 도달";
  if (current < 0) return "처음 계획만 10년 내 도달";
  const difference = current-base;
  if (difference === 0) return "같은 시점에 도달";
  return mlFormatDuration(Math.abs(difference)) + (difference > 0 ? " 늦어짐" : " 빨라짐");
}

function mlShowEvent(eventMonth) {
  const event = mlEvents[eventMonth];
  mlStop();
  const nextMonth = eventMonth + 1;
  const withoutEvent = mlSimulation()[nextMonth];
  const withEvent = mlSimulation([...mlChanges,...mlEventChanges(eventMonth,event)])[nextMonth];
  mlEl("ml-event-dialog-date").textContent = eventMonth + "개월차 · " + (mlFinance.age + Math.floor(eventMonth/12)) + "세";
  mlEl("ml-event-dialog-title").textContent = event.emoji + " " + event.title;
  mlEl("ml-event-dialog-description").textContent = event.body;
  mlEl("ml-event-accept-detail").textContent = event.yesText;
  mlEl("ml-event-accept-impact").textContent = nextMonth + "개월차 예상 순자산은 " + mlCompareNetWorth(withEvent.total-withoutEvent.total,"기존 계획");
  mlEl("ml-event-decline-detail").textContent = event.noText;
  mlEl("ml-event-decline-impact").textContent = nextMonth + "개월차 예상 순자산은 기존 계획과 같아요.";
  const accept = mlEl("ml-event-accept");
  const decline = mlEl("ml-event-decline");
  accept.textContent = event.yes;
  decline.textContent = event.no;
  accept.onclick = () => mlChooseEvent(eventMonth,true);
  decline.onclick = () => mlChooseEvent(eventMonth,false);
  mlEl("ml-modal").showModal();
}
function mlChooseEvent(eventMonth, accepted) {
  if (eventMonth !== mlMonth || mlEventSelections.has(eventMonth)) return;
  mlEventSelections.add(eventMonth);
  const event = mlEvents[eventMonth];
  if (accepted) mlChanges.push(...mlEventChanges(eventMonth,event));
  mlLog(accepted ? event.yes + " · " + event.yesText : event.no, accepted ? eventMonth+1 : null);
  mlEl("ml-modal").close();
  mlRenderDashboard();
  mlRenderReport();
  mlToast(accepted ? "선택을 기록했어요. 한 달 진행하면 변경 사항이 반영돼요." : "선택을 기록했어요. 지금의 계획으로 이어가요.");
}
function mlShowPendingEvent() {
  if (mlNextEventMonth() !== mlMonth) return false;
  mlShowEvent(mlMonth);
  return true;
}
function mlStep() {
  if (mlMonth >= 120) { mlStop(); return; }
  if (mlShowPendingEvent()) return;
  mlMonth = Math.min(120,mlMonth+1);
  mlRenderDashboard();
  if (mlShowPendingEvent()) return;
  if (mlMonth >= 120) {
    mlStop();
    mlLog("10년의 여정을 마쳤습니다.");
    mlRenderDashboard();
    mlShowPage("report");
  }
}
function mlStop() {
  if (mlTimer) clearInterval(mlTimer);
  mlTimer = null;
  mlEl("ml-play").textContent = mlMonth >= 120 ? "여정 완료" : "▶ 시간 시작";
}
function mlTogglePlay() {
  if (mlTimer) { mlStop(); return; }
  if (mlMonth >= 120) { mlToast("10년의 여정을 완료했어요. 새 조건으로 다시 시작할 수 있습니다."); return; }
  if (mlShowPendingEvent()) return;
  mlEl("ml-play").textContent = "Ⅱ 잠시 멈춤";
  mlTimer = setInterval(mlStep,1500/mlSpeed);
}
mlEl("ml-play").addEventListener("click",mlTogglePlay);
mlEl("ml-one-month").addEventListener("click",() => { mlStop(); mlStep(); });
function mlOpenNextEvent() {
  mlStop();
  const next = mlNextEventMonth();
  if (next) {
    mlMonth = next;
    mlRenderDashboard();
    mlShowEvent(next);
  } else {
    mlMonth = 120;
    mlRenderDashboard();
    mlShowPage("report");
  }
}
mlEl("ml-next-event").addEventListener("click",mlOpenNextEvent);
document.querySelectorAll("#money-life-app [data-speed]").forEach((button) => {
  button.addEventListener("click",() => {
    mlSpeed = Number(button.dataset.speed);
    document.querySelectorAll("#money-life-app [data-speed]").forEach((item) => item.classList.toggle("active",item===button));
    if (mlTimer) { mlStop(); mlTogglePlay(); }
  });
});

// 대시보드에 현재 월, 자산, 목표, 기록을 표시합니다.
function mlRenderDashboard() {
  const path = mlSimulation();
  const state = path[mlMonth];
  const base = mlSimulation([],[],mlBaseSaving);
  const year = 2026 + Math.floor((9+mlMonth)/12);
  const month = ((9+mlMonth)%12)+1;
  mlEl("ml-game-date").textContent = year + "년 " + month + "월";
  mlEl("ml-game-month-label").textContent = mlMonth + " / 120개월";
  mlEl("ml-game-age").textContent = "☀ 맑음 · " + (mlFinance.age+Math.floor(mlMonth/12)) + "세";
  mlEl("ml-game-net").innerHTML = Math.round(state.total).toLocaleString("ko-KR") + "<small>만 원</small>";
  mlEl("ml-game-income").innerHTML = Math.round(state.income).toLocaleString("ko-KR") + "<small>만 원</small>";
  mlEl("ml-game-expense").innerHTML = Math.round(state.expense).toLocaleString("ko-KR") + "<small>만 원</small>";
  mlEl("ml-game-cash").innerHTML = Math.round(state.cash).toLocaleString("ko-KR") + "<small>만 원</small>";
  mlEl("ml-time-progress").style.width = (mlMonth/120*100) + "%";
  const next = mlNextEventMonth();
  if (next) {
    const event = mlEvents[next];
    mlEl("ml-event-title").textContent = event.emoji + " " + event.title;
    mlEl("ml-event-desc").textContent = next === mlMonth ? "지금 만난 이벤트예요. 두 선택의 결과를 비교해 보세요." : next + "개월차에 만나는 선택이에요.";
    mlEl("ml-event-yes").textContent = next === mlMonth ? "이벤트 다시 열기" : "이벤트 만나보기";
    mlEl("ml-event-later").textContent = "나중에 보기";
    mlEl("ml-event-yes").onclick = mlOpenNextEvent;
    mlEl("ml-event-later").onclick = () => mlToast("현재의 일상을 이어가 볼게요.");
  } else {
    mlEl("ml-event-title").textContent = "당신의 10년이 쌓였어요";
    mlEl("ml-event-desc").textContent = "지나온 기록을 확인하거나 새로운 조건으로 다시 시작해보세요.";
    mlEl("ml-event-yes").textContent = "결과 확인";
    mlEl("ml-event-later").textContent = "설정 변경";
    mlEl("ml-event-yes").onclick = () => mlShowPage("report");
    mlEl("ml-event-later").onclick = () => mlShowPage("settings");
  }
  mlEl("ml-game-goal-name").textContent = mlFinance.goalName;
  mlEl("ml-game-goal-current").textContent = mlCompact(Math.max(0,state.total));
  mlEl("ml-game-goal-target").textContent = mlCompact(mlFinance.goalAmount/10000);
  const percent = Math.max(0,Math.min(100,state.total/(mlFinance.goalAmount/10000)*100));
  mlEl("ml-game-goal-bar").style.width = percent + "%";
  const goalHit = mlGoalMonth(path);
  let goalStatus = "10년 안에 목표에 도달하지 못하는 것으로 계산돼요.";
  if (goalHit >= 0) {
    if (goalHit > mlMonth) goalStatus = "목표까지 약 " + (goalHit-mlMonth) + "개월 남았어요.";
    else goalStatus = percent >= 100 ? "첫 번째 목표에 도달했어요!" : "목표에 한 번 도달했지만, 현재 순자산은 목표 금액보다 낮아요.";
  }
  mlEl("ml-game-goal-eta").textContent = goalStatus;
  mlEl("ml-profile-name").textContent = mlFinance.name;
  mlEl("ml-profile-age").textContent = mlFinance.age+Math.floor(mlMonth/12);
  mlEl("ml-user-name").textContent = mlFinance.name + "님";
  mlEl("ml-profile-avatar").textContent = "🌱";
  mlEl("ml-game-health").textContent = state.short ? "지출 부족 발생" : state.cash < 300 ? "비상금 확인 필요" : "차근차근 안정적으로";
  mlEl("ml-game-chapter").textContent = "CHAPTER 0" + (mlMonth<12?1:mlMonth<48?2:mlMonth<96?3:4) + " · " + (mlMonth<12?"새로운 출발":mlMonth<48?"나만의 일상":mlMonth<96?"선택이 쌓이는 시간":"다음 장을 준비하며");
  if (mlMonth >= 120) {
    mlEl("ml-world-title").innerHTML = "당신만의 10년이<br>한 편의 이야기가 되었어요.";
    mlEl("ml-world-desc").textContent = "다른 선택으로 다시 살아보거나 지나온 기록을 확인해보세요.";
  } else {
    mlEl("ml-world-title").innerHTML = "작은 시작에도<br>커다란 가능성이 있어요.";
    mlEl("ml-world-desc").textContent = "새로운 일상을 시작한 당신. 오늘은 어떤 미래를 만들어볼까요?";
  }
  mlEl("ml-milestones").innerHTML = [0,12,48,72,120].map((m,index) => {
    const labels = [mlFinance.age+"세 출발",(mlFinance.age+1)+"세 독립",(mlFinance.age+4)+"세 이직",(mlFinance.age+6)+"세 여행",(mlFinance.age+10)+"세 다음 장"];
    return '<span class="' + (mlMonth>=m?"reached":"") + '">' + labels[index] + '</span>';
  }).join("");
  mlEl("ml-game-log").innerHTML = mlLogs.slice(0,6).map((entry) => {
    const status = entry.effectiveMonth === null ? "" : '<span class="ml-log-status">' + entry.effectiveMonth + "개월차 " + (mlMonth < entry.effectiveMonth ? "반영 예정" : "반영됨") + "</span>";
    return '<div class="ml-log-entry"><small>' + (mlFinance.age+Math.floor(entry.month/12)) + "세 · " + entry.month + "개월차</small><p>" + entry.text + "</p>" + status + "</div>";
  }).join("") || '<div class="ml-hint">아직 기록이 없습니다.</div>';
  mlEl("ml-game-chart-current").textContent = (mlMonth === 0 ? "시작" : mlMonth + "개월차") + " 순자산 " + mlFormatMan(state.total) + " · " + mlCompareNetWorth(state.total-base[mlMonth].total,"처음 계획");
  mlDrawChart("ml-game-chart",[path,base],false);
  mlRenderAssets();
}

// 자산관리 화면은 입력 데이터와 현재 시뮬레이션 상태를 함께 표시합니다.
function mlRenderAssets() {
  const total = mlTotalAssets(), debt = mlTotalDebt(), net = mlNetWorth();
  mlEl("ml-assets-net").textContent = mlFormatWon(net);
  mlEl("ml-assets-total").textContent = mlFormatWon(total);
  mlEl("ml-assets-debt").textContent = mlFormatWon(debt);
  mlEl("ml-assets-left").textContent = mlFormatWon(mlMonthlyLeft());
  const rows = [["예금 · 현금",mlFinance.cash],["주식",mlFinance.stocks],["펀드 · 기타 금융자산",mlFinance.funds],["부동산",mlFinance.property],["대출", -mlFinance.loan],["신용대출", -mlFinance.credit],["카드 미결제", -mlFinance.cardDebt],["기타 부채", -mlFinance.otherDebt]];
  mlEl("ml-assets-table").innerHTML = rows.map((row) => '<tr><td>' + row[0] + '</td><td style="text-align:right;color:' + (row[1]<0?"#c56868":"#292841") + '">' + mlFormatWon(row[1]) + '</td></tr>').join("");
  const state = mlCurrentState();
  mlEl("ml-live-cash").textContent = mlFormatMan(state.cash);
  mlEl("ml-live-saved").textContent = mlFormatMan(state.saved);
  mlEl("ml-live-property").textContent = mlFormatMan(state.otherAssets);
  mlEl("ml-live-unpaid").textContent = mlFormatMan(state.unpaid);
  mlEl("ml-live-total").textContent = mlFormatMan(state.total);
}

// 목표 화면의 값과 진행률을 갱신합니다.
function mlRenderGoal() {
  mlEl("ml-goal-name").value = mlFinance.goalName;
  mlEl("ml-goal-amount").value = mlFinance.goalAmount;
  mlEl("ml-goal-months").value = mlFinance.goalMonths;
  const state = mlCurrentState();
  mlEl("ml-goal-current-page").textContent = mlCompact(Math.max(0,state.total));
  mlEl("ml-goal-target-page").textContent = mlCompact(mlFinance.goalAmount/10000);
  const pct = Math.max(0,Math.min(100,state.total/(mlFinance.goalAmount/10000)*100));
  mlEl("ml-goal-bar-page").style.width = pct + "%";
  const path = mlSimulation();
  const hit = mlGoalMonth(path);
  mlEl("ml-goal-status").textContent = hit < 0 ? "현재 조건으로는 10년 안에 목표에 도달하지 못해요." : "현재 조건에서는 약 " + hit + "개월 후 목표에 도달할 것으로 계산돼요.";
}

// 기본 계획, 현재 선택, 소득 공백 가정을 비교합니다.
function mlRenderReport() {
  const base = mlSimulation([],[],mlBaseSaving);
  const current = mlSimulation();
  const stressMonths = Math.min(6,120-mlMonth);
  const stress = stressMonths > 0 ? mlSimulation([...mlChanges,{
    type:"income",v:-100,m:mlMonth+1,end:mlMonth+stressMonths
  }]) : current;
  const goalAmount = mlFormatKoreanWon(mlFinance.goalAmount);
  const goalMonths = {base:mlGoalMonth(base),current:mlGoalMonth(current),stress:mlGoalMonth(stress)};
  mlEl("ml-report-goal-amount").textContent = goalAmount;
  mlEl("ml-report-stress-description").textContent = stressMonths > 0
    ? "내 선택에 " + (mlMonth+1) + "개월차부터 " + stressMonths + "개월간 월 소득 100만 원 감소를 추가한 경우"
    : "10년 진행이 끝나 내 선택과 같아요.";
  Object.entries({base,current,stress}).forEach(([id,path]) => {
    const hit = goalMonths[id];
    mlEl("ml-report-" + id).textContent = mlFormatKoreanWon(Math.round(path[120].total)*10000);
    mlEl("ml-report-" + id + "-goal").textContent = hit < 0 ? "10년 내 미도달" : hit === 0 ? "시작 시점" : "시작 후 " + mlFormatDuration(hit);
    const month = mlEl("ml-report-" + id + "-month");
    month.textContent = hit > 0 ? hit + "개월차" : "";
    month.hidden = hit <= 0;
  });
  const difference = Math.round(current[120].total)-Math.round(base[120].total);
  mlEl("ml-report-net-difference").textContent = difference === 0 ? "차이 없음"
    : mlFormatKoreanWon(Math.abs(difference)*10000) + (difference < 0 ? " 감소" : " 증가");
  mlEl("ml-report-goal-difference").textContent = mlCompareGoalTiming(goalMonths.base,goalMonths.current);
  const showGoal = mlDrawChart("ml-report-chart",[current,base,stress],true);
  const goalLegend = mlEl("ml-report-goal-legend");
  const chartNote = mlEl("ml-report-chart-note");
  goalLegend.hidden = !showGoal;
  goalLegend.textContent = showGoal ? "목표 " + goalAmount : "";
  chartNote.hidden = showGoal;
  chartNote.textContent = showGoal ? "" : "목표 " + goalAmount + "은 차트의 표시 범위보다 높아요.";
}

// 재무 정보 입력 폼을 제출하면 시뮬레이션 시작 조건으로 변환합니다.
function mlStartFromFinance() {
  let firstInvalid;
  for (const id of Object.keys(mlStartFieldErrors)) {
    const input = mlEl(id);
    if (!mlValidateStartField(input)) firstInvalid ??= input;
  }
  for (const id of Object.keys(mlFinanceFields)) {
    const input = mlEl("ml-" + id);
    if (!mlValidateFinanceAmount(input)) firstInvalid ??= input;
  }
  if (firstInvalid) {
    if (!mlEl("ml-page-finance").classList.contains("active")) mlShowPage("finance");
    const details = firstInvalid.closest("details");
    if (details) details.open = true;
    firstInvalid.focus();
    return false;
  }
  if (mlMonth > 0 || mlChanges.length || mlRateChanges.length) {
    mlConfirmAction("새 여정을 시작할까요?","현재 진행 월과 이벤트 선택 기록이 초기화돼요. 입력한 조건으로 0개월부터 다시 시작합니다.","새 여정 시작",mlApplyFinance);
    return false;
  }
  mlApplyFinance();
  return true;
}

function mlApplyFinance() {
  mlFinance = {
    ...mlFinance,
    ...mlReadFinanceAmounts(),
    name:mlEl("ml-start-name").value.trim() || mlDefaults.name,
    age:mlEl("ml-start-age").valueAsNumber,
    annualRate:mlEl("ml-start-rate").valueAsNumber,
    monthlySaving:mlParseFinanceAmount(mlEl("ml-start-saving").value),
    incomeType:mlEl("ml-income-types").querySelector(".active")?.dataset.value ?? mlDefaults.incomeType,
    expenseCategories:[...mlExpenseOptions].filter((input) => input.checked).map((input) => input.value)
  };
  mlWriteFinanceInputs(mlFinance);
  mlBaseSaving = mlInitialSaving();
  mlCurrentSaving = mlBaseSaving;
  mlChanges = [];
  mlRateChanges = [];
  mlMonth = 0;
  mlStop();
  mlEventSelections = new Set();
  mlLogs = [];
  mlLog("재무 정보를 바탕으로 새로운 10년의 여정을 시작합니다.");
  const saved = mlSaveFinance();
  mlEl("ml-finance-notice").textContent = "입력한 정보가 적용됐어요. 이제 나의 마을에서 10년의 미래를 탐험해보세요.";
  mlEl("ml-finance-notice").classList.add("show");
  mlShowPage("dashboard");
  mlToast(saved ? "재무 정보를 시뮬레이션에 적용했어요." : "재무 정보를 적용했어요. 이 브라우저에는 저장하지 못했어요.");
}
mlEl("ml-finance-form").addEventListener("submit",(event) => {
  event.preventDefault();
  mlStartFromFinance();
});
Object.keys(mlStartFieldErrors).forEach((id) => {
  const input = mlEl(id);
  if (id === "ml-start-saving") input.addEventListener("focus", () => {
    if (mlParseFinanceAmount(input.value) !== null) input.value = input.value.replaceAll(",", "");
  });
  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) mlValidateStartField(input);
  });
  input.addEventListener("blur", () => {
    if (mlValidateStartField(input) && id === "ml-start-saving" && input.value.trim()) {
      input.value = mlFormatAmount(mlParseFinanceAmount(input.value));
    }
  });
});

// 소득 유형 선택 버튼을 활성화합니다.
mlIncomeOptions.forEach((button) => {
  button.addEventListener("click",() => {
    mlIncomeOptions.forEach((item) => item.classList.toggle("active",item===button));
  });
});

// 편집 중에는 숫자를 입력하고, 입력을 마치면 천 단위 구분을 표시합니다.
Object.keys(mlFinanceFields).forEach((id) => {
  const input = mlEl("ml-" + id);
  input.addEventListener("focus", () => {
    if (mlParseFinanceAmount(input.value) !== null) input.value = input.value.replaceAll(",", "");
  });
  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) mlValidateFinanceAmount(input);
    mlUpdateFinanceSummary();
  });
  input.addEventListener("blur", () => {
    if (mlValidateFinanceAmount(input)) input.value = mlFormatAmount(mlParseFinanceAmount(input.value));
  });
});
mlEl("ml-finance-reset").addEventListener("click",() => {
  mlWriteFinanceInputs(mlDefaults);
  mlUpdateFinanceSummary();
  mlToast("예시 재무 정보를 복원했어요.");
});

// 자산관리 건물은 자산관리 화면으로 이동합니다.
document.querySelectorAll("#money-life-app .ml-building").forEach((building) => {
  building.addEventListener("click",() => mlShowPage(building.dataset.page));
});
mlEl("ml-save-goal").addEventListener("click",() => {
  mlFinance.goalName = mlEl("ml-goal-name").value.trim() || mlDefaults.goalName;
  mlFinance.goalAmount = won(mlEl("ml-goal-amount").value);
  mlFinance.goalMonths = Math.max(1,Math.min(120,won(mlEl("ml-goal-months").value)));
  mlRenderGoal();
  mlRenderDashboard();
  mlRenderReport();
  mlToast("새로운 목표를 저장했어요.");
});
mlEl("ml-refresh-report").addEventListener("click",() => { mlRenderReport(); mlToast("현재 조건으로 다시 계산했어요."); });
mlEl("ml-apply-saving").addEventListener("click",() => {
  const amount = won(mlEl("ml-ask-saving").value)/10000;
  if (!mlEl("ml-ask-saving").value || mlMonth>=120) { mlToast("진행 중인 여정에서 월 저축액을 입력해 주세요."); return; }
  mlChanges.push({type:"saving",v:amount,m:mlMonth+1});
  mlCurrentSaving = amount;
  mlLog("다음 달부터 월 저축 이체액을 " + mlFormatMan(amount) + "으로 변경했습니다.");
  mlRenderDashboard(); mlRenderReport(); mlToast("새로운 저축 조건을 적용했어요.");
});
mlEl("ml-apply-settings").addEventListener("click",() => {
  if (mlMonth >= 120) { mlToast("여정이 끝났어요. 재무 정보 입력에서 새로 시작할 수 있어요."); return; }
  const rateInput = mlEl("ml-setting-rate");
  const savingInput = mlEl("ml-setting-saving");
  if (!savingInput.reportValidity() || !rateInput.reportValidity()) return;
  const rate = rateInput.valueAsNumber;
  const saving = savingInput.valueAsNumber/10000;
  mlCurrentSaving = saving;
  mlChanges.push({type:"saving",v:saving,m:mlMonth+1});
  mlRateChanges.push({v:rate,m:mlMonth+1});
  mlLog("월 저축 " + mlFormatMan(saving) + ", 연 수익률 가정 " + rate + "%",mlMonth+1);
  mlRenderDashboard(); mlRenderReport(); mlToast("다음 달부터 설정을 적용해요.");
});
function mlResetAll() {
  let cleared = true;
  try { localStorage.removeItem(mlFinanceStorageKey); } catch(error) { cleared = false; }
  mlFinance = {...mlDefaults};
  mlWriteFinanceInputs(mlDefaults);
  mlMonth = 0; mlChanges = []; mlRateChanges = []; mlEventSelections = new Set(); mlLogs = [];
  mlBaseSaving = mlInitialSaving(); mlCurrentSaving = mlBaseSaving; mlStop();
  mlEl("ml-finance-notice").classList.remove("show");
  mlUpdateFinanceSummary(); mlRenderGoal(); mlRenderDashboard(); mlRenderReport();
  mlShowPage("finance");
  mlToast(cleared ? "모든 정보를 예시값으로 초기화했어요." : "화면을 초기화했어요. 브라우저에 저장된 정보는 지우지 못했어요.");
}
mlEl("ml-reset-all").addEventListener("click",() => {
  mlConfirmAction("모든 정보를 초기화할까요?","현재 여정과 이 브라우저에 저장한 시작 조건·목표가 지워져요.","모든 정보 초기화",mlResetAll);
});

// 저장된 재무 입력값이 있으면 복원하고, 없으면 예시값으로 시작합니다.
let hasSavedFinance = false;
try {
  const saved = JSON.parse(localStorage.getItem(mlFinanceStorageKey));
  if (saved && typeof saved === "object") {
    mlFinance = {...mlFinance,...saved};
    if (!Number.isSafeInteger(mlFinance.goalAmount) || mlFinance.goalAmount < 1) mlFinance.goalAmount = mlDefaults.goalAmount;
    if (!Number.isInteger(mlFinance.goalMonths) || mlFinance.goalMonths < 1 || mlFinance.goalMonths > 120) mlFinance.goalMonths = mlDefaults.goalMonths;
    hasSavedFinance = true;
  }
} catch(error) {}
mlWriteFinanceInputs(mlFinance);
mlBaseSaving = mlInitialSaving();
mlCurrentSaving = mlBaseSaving;
mlUpdateFinanceSummary();
mlRenderGoal();
mlRenderReport();
mlShowPage("dashboard");

const welcome = mlEl("ml-welcome");
mlEl("ml-welcome-age").textContent = mlFinance.age + "세";
mlEl("ml-welcome-net").textContent = mlFormatKoreanWon(mlNetWorth());
const welcomeStart = mlEl("ml-welcome-start");
if (hasSavedFinance) {
  welcomeStart.textContent = "저장한 조건으로 시작 →";
  mlEl("ml-welcome-note").textContent = "저장한 재무 정보로 0개월부터 새 여정을 시작해요.";
}
mlEl("ml-welcome-settings").addEventListener("click", () => {
  welcome.close();
  mlShowPage("finance");
});
welcomeStart.addEventListener("click", () => {
  welcome.close();
  if (mlStartFromFinance()) mlTogglePlay();
});
welcome.showModal();
