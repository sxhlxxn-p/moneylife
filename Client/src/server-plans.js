/* Server snapshot controls. Author: sxhlxxn / Student ID: 202439688. */
let serverPlanId = null;
let serverPlanBusy = false;
try { serverPlanId = localStorage.getItem('money-life-server-plan'); } catch {}

function setPlanBusy(busy) {
  serverPlanBusy = busy;
  for (const button of document.querySelectorAll('[data-plan-action]')) button.disabled = busy;
}

async function planRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/plans' + path, {
      ...options,
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('저장 세션이 만료됐어요. 현재 여정은 이 기기에 남아 있어요.');
      if (response.status === 422) throw new Error('입력이나 이벤트 적용 후 금액·기간을 확인해주세요.');
      if (response.status === 404) throw new Error('계획을 찾을 수 없어요. 현재 여정은 유지됩니다.');
      throw new Error('서버에 연결하지 못했어요. 현재 여정은 이 기기에 남아 있어요.');
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('서버 응답이 늦어졌어요. 저장 목록에서 저장 여부를 확인해주세요.');
    if (error instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 현재 여정은 유지됩니다.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveServerPlan() {
  if (serverPlanBusy) return;
  stop();
  setPlanBusy(true);
  try {
    const state = MoneyLifePlanState.encode({start, month, baseSaving, baseRate, mods, rateMods, logs, events});
    const plan = await planRequest('', {
      method: 'POST',
      body: JSON.stringify({schemaVersion: 1, goalBasis: 'net_assets', parentPlanId: serverPlanId, state})
    });
    serverPlanId = plan.id;
    try { localStorage.setItem('money-life-server-plan', plan.id); } catch {}
    $('serverstatus').textContent = `${state.month}개월 시점 서버 저장 완료`;
    toast('현재 시점의 새 사본을 서버에 저장했어요.');
  } catch (error) {
    $('serverstatus').textContent = error.message;
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}

async function openServerPlans(offset = 0) {
  if (serverPlanBusy) return;
  stop();
  setPlanBusy(true);
  try {
    const plans = await planRequest(`?limit=20&offset=${offset}`);
    show('<h2>서버에 저장한 여정</h2><p>불러오면 현재 화면을 저장된 시점으로 바꿉니다. 남겨둘 여정은 먼저 서버에 저장해주세요.</p><div id="serverplans" class="saved-plans"></div><div id="planpages" class="modalactions"></div>');
    const container = $('serverplans');
    if (!plans.length) container.textContent = '저장된 계획이 없어요.';
    for (const plan of plans) {
      const button = document.createElement('button');
      button.className = 'btn saved-plan';
      button.dataset.planAction = 'load';
      button.textContent = `${plan.name} · ${plan.month}개월 · ${new Date(plan.createdAt * 1000).toLocaleString('ko-KR')}`;
      button.addEventListener('click', () => loadServerPlan(plan.id));
      container.appendChild(button);
    }
    for (const [label, next] of [['이전', offset - 20], ['다음', offset + 20]]) {
      if ((label === '이전' && offset === 0) || (label === '다음' && plans.length < 20)) continue;
      const button = document.createElement('button');
      button.className = 'btn';
      button.dataset.planAction = 'page';
      button.textContent = label;
      button.addEventListener('click', () => openServerPlans(next));
      $('planpages').appendChild(button);
    }
  } catch (error) {
    $('serverstatus').textContent = error.message;
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
    const plan = await planRequest('/' + encodeURIComponent(id));
    const game = MoneyLifePlanState.decode(plan);
    // Do not replace active state until the complete snapshot has been decoded.
    start = game.start;
    month = game.month;
    baseSaving = game.baseSaving;
    baseRate = game.baseRate;
    saving = game.saving;
    rate = game.rate;
    mods = game.mods;
    rateMods = game.rateMods;
    logs = game.logs;
    events = new Set(game.events);
    serverPlanId = plan.id;
    try { localStorage.setItem('money-life-server-plan', plan.id); } catch {}
    $('worldtitle').textContent = '저장한 여정에서 다시 시작해요';
    $('worlddesc').textContent = '이 시점의 조건과 선택 기록을 불러왔어요.';
    closeModal();
    render();
    $('serverstatus').textContent = `${month}개월 시점 서버에서 불러옴`;
    toast('저장된 조건과 선택 기록을 불러왔어요.');
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
