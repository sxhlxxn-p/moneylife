let serverPlanId = null;
let serverPlanBusy = false;
try {
  serverPlanId = localStorage.getItem("money-life-server-plan");
} catch {}
function setPlanBusy(busy) {
  serverPlanBusy = busy;
  for (const button of document.querySelectorAll("[data-plan-action]"))
    button.disabled = busy || button.dataset.paperDisabled === "true";
  if (typeof GameExperience !== "undefined") GameExperience.setBusy(busy);
}
function planRequest(path, options) {
  return apiRequest("plans", path, options);
}
function simulationRequest(path, options) {
  return apiRequest("simulations", path, options);
}
async function saveServerPlanTransaction() {
  if (serverPlanBusy) return;
  const snapshot = JourneyStore.snapshot();
  const previous = planSaves.get();
  if (
    previous &&
    JSON.stringify(previous.snapshot) !== JSON.stringify(snapshot)
  ) {
    show(
      '<h2>확인하지 못한 저장이 있어요</h2><p>이전 저장 결과를 먼저 확인해주세요. 별도 보관해도 서버에서 처리된 저장을 취소하지는 않아요.</p><button class="btn primary" onclick="retryPlanSave()">이전 저장 결과 확인</button><button class="btn" onclick="archivePlanSave()">이전 요청 별도 보관</button>',
    );
    return;
  }
  if (!previous)
    planSaves.stage({
      requestId: crypto.randomUUID(),
      runRequestId: crypto.randomUUID(),
      snapshot,
      command: {
        kind: "save",
        plan: {
          schemaVersion: 1,
          goalBasis: "net_assets",
          parentPlanId: serverPlanId,
          state: snapshot,
        },
      },
    });
  return retryPlanSaveTransaction();
}
async function openServerPlans(offset = 0) {
  if (serverPlanBusy) return;
  stop();
  setPlanBusy(true);
  try {
    const plans = await planRequest(`?limit=20&offset=${offset}`);
    show(
      '<h2>서버에 저장한 여정</h2><p>불러오면 현재 화면을 저장된 시점으로 바꿉니다. 남겨둘 여정은 먼저 서버에 저장해주세요.</p><div id="serverplans" class="saved-plans"></div><div id="planpages" class="modalactions"></div>',
    );
    const container = $("serverplans");
    if (!plans.length) container.textContent = "저장된 계획이 없어요.";
    for (const plan of plans) {
      const button = document.createElement("button");
      button.className = "btn saved-plan";
      button.dataset.planAction = "load";
      button.textContent = `${plan.name} · ${plan.month}개월 · ${new Date(plan.createdAt * 1000).toLocaleString("ko-KR")}`;
      button.addEventListener("click", () => loadServerPlan(plan.id));
      container.appendChild(button);
    }
    for (const [label, next] of [
      ["이전", offset - 20],
      ["다음", offset + 20],
    ]) {
      if (
        (label === "이전" && offset === 0) ||
        (label === "다음" && plans.length < 20)
      )
        continue;
      const button = document.createElement("button");
      button.className = "btn";
      button.dataset.planAction = "page";
      button.textContent = label;
      button.addEventListener("click", () => openServerPlans(next));
      $("planpages").appendChild(button);
    }
  } catch (error) {
    $("serverstatus").textContent = error.message;
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
async function loadServerPlan(id) {
  if (serverPlanBusy) return;
  stop();
  setPlanBusy(true);
  try {
    const plan = await planRequest("/" + encodeURIComponent(id));
    restoreServerPlan(plan);
    toast("저장된 조건과 선택 기록을 불러왔어요.");
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
function restoreServerPlan(plan) {
  const game = MoneyLifePlanState.decode(plan);
  // Do not replace active state until the complete snapshot has been decoded.
  JourneyStore.restore(game);
  serverPlanId = plan.id;
  try {
    localStorage.setItem("money-life-server-plan", plan.id);
  } catch {}
  $("ml-world-title").textContent = "저장한 여정에서 다시 시작해요";
  $("ml-world-desc").textContent = "이 시점의 조건과 선택 기록을 불러왔어요.";
  closeModal();
  render();
  $("serverstatus").textContent =
    `${JourneyStore.current.month}개월 시점 서버에서 불러옴`;
}
async function openServerResult() {
  if (serverPlanBusy) return;
  if (!serverPlanId) {
    toast("먼저 서버 계산·저장을 누르거나 저장한 여정을 불러와주세요.");
    return;
  }
  stop();
  setPlanBusy(true);
  try {
    const runs = await simulationRequest(
      "?planId=" + encodeURIComponent(serverPlanId) + "&limit=1",
    );
    if (!runs.length) {
      show(
        '<h2>저장된 계획의 계산이 필요해요</h2><p>새 계획을 만들지 않고 저장된 조건으로 다시 계산할 수 있어요.</p><button class="btn primary" onclick="calculateSavedPlan()">저장된 계획 다시 계산</button>',
      );
      return;
    }
    const run = await simulationRequest("/" + encodeURIComponent(runs[0].id));
    show(
      '<h2>서버 계산 결과</h2><p id="runstatus"></p><div id="runsummary" class="run-summary"></div><div id="saved-ai-comparison" aria-label="저장된 조건 변경 전후 비교"></div><details class="run-details"><summary>월별 자산 상세 보기</summary><div class="run-table-scroll"><table><thead><tr><th>경과 월</th><th>현금</th><th>저축</th><th>누적 미충족액</th><th>총자산</th></tr></thead><tbody id="runmonths"></tbody></table></div></details>',
    );
    $("runstatus").textContent =
      `저장한 조건으로 ${run.months}개월을 계산한 결과입니다. 이자는 매월 원 단위로 반올림합니다. 화면 미리보기와 같은 원 단위 반올림 규칙을 사용해요.`;
    if (run.inputSnapshot?.aiComparison)
      renderAIComparison(
        $("saved-ai-comparison"),
        run.inputSnapshot.aiComparison,
        run.months,
      );
    const currency = (value) => value.toLocaleString("ko-KR") + "원";
    const goal = run.summary.goalMonth;
    const metrics = [
      [
        "목표 최초 달성",
        goal === null
          ? "기간 내 미달성"
          : goal === 0
            ? "시작 시점"
            : goal + "개월차",
      ],
      ["기간 말 총자산", currency(run.summary.finalNetAssets)],
      ["현금 부족 기간", run.summary.shortageMonths + "개월"],
      ["누적 미충족액", currency(run.summary.unmetTotal)],
    ];
    for (const [label, value] of metrics) {
      const card = document.createElement("div");
      const caption = document.createElement("small");
      const amount = document.createElement("strong");
      caption.textContent = label;
      amount.textContent = value;
      card.append(caption, amount);
      $("runsummary").append(card);
    }
    for (const row of run.monthlyResults) {
      const tr = document.createElement("tr");
      for (const value of [
        row.month + "개월",
        currency(row.cash),
        currency(row.saved),
        currency(row.unpaid),
        currency(row.total),
      ]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      $("runmonths").append(tr);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}

const saveServerPlan = serializedMutation(saveServerPlanTransaction);
