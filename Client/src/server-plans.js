/* Server snapshot controls. Author: sxhlxxn / Student ID: 202439688. */
let serverPlanId = null;
let serverPlanBusy = false;
try { serverPlanId = localStorage.getItem('money-life-server-plan'); } catch {}

function setPlanBusy(busy) {
  serverPlanBusy = busy;
  for (const button of document.querySelectorAll('[data-plan-action]')) button.disabled = busy || button.dataset.paperDisabled === 'true';
}

async function apiRequest(resource, path, options = {}) {
  const {timeoutMs = 10000, ...fetchOptions} = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let failureStatus;
  let failureCode;
  try {
    const response = await fetch('/api/' + resource + path, {
      ...fetchOptions,
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      signal: controller.signal
    });
    if (!response.ok) {
      failureStatus = response.status;
      const body = await response.json().catch(() => ({}));
      failureCode = typeof body.detail === 'string' ? body.detail : undefined;
      if (['paper-plans', 'paper-runs', 'market'].includes(resource)) {
        const messages = {
          INSUFFICIENT_SHARES: '현재 보유 주식에서 이미 예약한 매도 수량을 제외한 수량만 팔 수 있어요.',
          SERIES_PERIOD_EXCEEDED: '가상 가격이 지원하는 마지막 달이에요. 새 투자 연습을 시작해주세요.',
          REQUEST_ID_CONFLICT: '요청 번호가 다른 내용에 사용됐어요. 저장한 투자 연습을 확인해주세요.',
          MARKET_CATALOG_INVALID: '등록된 가격 자료의 형식을 확인해주세요. 기존 저장 결과는 유지됩니다.',
          MARKET_CATALOG_LIMIT: '등록된 가격 자료 수를 확인해주세요.',
          EXPLANATION_INPUT_INVALID: '저장된 결과의 지표를 확인하지 못해 해설을 표시할 수 없어요.',
          ORDER_VALUE_TOO_LARGE: '참고 거래대금이 계산 범위를 넘었어요. 수량을 줄여주세요.',
          ORDER_LIMIT_EXCEEDED: '이 계획의 주문 수가 한도에 도달했어요.',
          ENGINE_OUTPUT_INVALID: '계산 결과를 확인하지 못했어요. 같은 요청을 다시 확인해주세요.',
          ENGINE_UNAVAILABLE: '계산 서버를 사용할 수 없어요. 같은 요청으로 다시 확인할 수 있어요.',
          ENGINE_TIMEOUT: '계산 시간이 초과됐어요. 같은 요청으로 다시 확인할 수 있어요.'
        };
        if (messages[failureCode]) throw new Error(messages[failureCode]);
      }
      if (resource === 'ai') {
        const messages = {
          LLM_NOT_CONFIGURED: '서버에 LLM API 키와 모델을 설정해야 해요. 현재 여정은 유지됩니다.',
          LLM_AUTHENTICATION_FAILED: '서버의 LLM API 키 인증을 확인해주세요. 현재 여정은 유지됩니다.',
          LLM_ACCESS_DENIED: '설정한 키의 API 접근 권한을 확인해주세요.',
          LLM_MODEL_UNAVAILABLE: '서버의 모델 ID와 모델 접근 권한을 확인해주세요.',
          LLM_PROVIDER_UNSUPPORTED: '서버의 LLM 공급자 설정을 확인해주세요.',
          LLM_QUOTA_EXCEEDED: '모델 제공자의 크레딧·사용 한도를 확인해주세요.',
          LLM_RATE_LIMITED: 'AI 요청이 많아요. 잠시 후 다시 요청해주세요.',
          LLM_TIMEOUT: 'AI 응답 시간이 초과됐어요. 현재 여정은 유지됩니다.',
          LLM_REQUEST_INVALID: '모델이 요청 설정을 받지 못했어요. 서버의 모델·출력 형식을 확인해주세요.',
          LLM_UNAVAILABLE: 'AI 서버가 응답하지 않아요. 잠시 후 다시 요청해주세요.',
          LLM_REFUSED: '이 요청을 해석하지 못했어요. 바꿀 조건을 다시 입력해주세요.',
          MODEL_OUTPUT_INVALID: 'AI 응답 형식이 올바르지 않아 적용하지 않았어요.',
          PROPOSAL_EXPIRED: '변경안이 만료됐어요. 다시 요청해주세요.',
          SIMULATION_FINISHED: '진행이 끝났어요. 새로운 여정에서 요청해주세요.'
        };
        if (messages[body.detail]) throw new Error(messages[body.detail]);
      }
      if (response.status === 401) throw new Error('저장 세션이 만료됐어요. 현재 여정은 이 기기에 남아 있어요.');
      if (response.status === 422) throw new Error('입력이나 이벤트 적용 후 금액·기간을 확인해주세요.');
      if (response.status === 404) throw new Error('저장된 계획이나 계산 결과를 찾을 수 없어요.');
      throw new Error('서버에 연결하지 못했어요. 현재 여정은 이 기기에 남아 있어요.');
    }
    return await response.json();
  } catch (error) {
    if (failureStatus) { error.status = failureStatus; error.code = failureCode; }
    if (error.name === 'AbortError') throw new Error('서버 응답이 늦어졌어요. 저장 목록에서 저장 여부를 확인해주세요.');
    if (error instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 현재 여정은 유지됩니다.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function planRequest(path, options) { return apiRequest('plans', path, options); }
function simulationRequest(path, options) { return apiRequest('simulations', path, options); }

async function saveServerPlan() {
  if (serverPlanBusy) return;
  stop();
  setPlanBusy(true);
  let planSaved = false;
  try {
    const state = MoneyLifePlanState.encode({start, month, baseSaving, baseRate, mods, rateMods, logs, events});
    const plan = await planRequest('', {
      method: 'POST',
      body: JSON.stringify({schemaVersion: 1, goalBasis: 'net_assets', parentPlanId: serverPlanId, state})
    });
    serverPlanId = plan.id;
    planSaved = true;
    try { localStorage.setItem('money-life-server-plan', plan.id); } catch {}
    $('serverstatus').textContent = '계획을 저장했어요. 서버에서 계산 중이에요.';
    await simulationRequest('', {
      method: 'POST',
      body: JSON.stringify({planId: plan.id, requestId: crypto.randomUUID(), months: 120})
    });
    $('serverstatus').textContent = `${state.month}개월 시점 서버 저장 완료 · 계산 결과 보관`;
    toast('여정과 서버 계산 결과를 새 사본으로 저장했어요.');
  } catch (error) {
    const message = planSaved ? '계획은 저장됐지만 계산을 완료하지 못했어요. 저장한 여정은 유지됩니다.' : error.message;
    $('serverstatus').textContent = message;
    toast(message);
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
    restoreServerPlan(plan);
    toast('저장된 조건과 선택 기록을 불러왔어요.');
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}

function restoreServerPlan(plan) {
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
}


async function openServerResult() {
  if (serverPlanBusy) return;
  if (!serverPlanId) {
    toast('먼저 서버 계산·저장을 누르거나 저장한 여정을 불러와주세요.');
    return;
  }
  stop();
  setPlanBusy(true);
  try {
    const runs = await simulationRequest('?planId=' + encodeURIComponent(serverPlanId) + '&limit=1');
    if (!runs.length) {
      toast('이 여정에는 계산 결과가 없어요. 서버 계산·저장을 눌러주세요.');
      return;
    }
    const run = await simulationRequest('/' + encodeURIComponent(runs[0].id));
    show('<h2>서버 계산 결과</h2><p id="runstatus"></p><div id="runsummary" class="run-summary"></div><details class="run-details"><summary>월별 자산 상세 보기</summary><div class="run-table-scroll"><table><thead><tr><th>경과 월</th><th>현금</th><th>저축</th><th>누적 미충족액</th><th>총자산</th></tr></thead><tbody id="runmonths"></tbody></table></div></details>');
    $('runstatus').textContent = `저장한 조건으로 ${run.months}개월을 계산한 결과입니다. 이자는 매월 원 단위로 반올림합니다. 현재 화면의 미리보기와 소액 차이가 날 수 있어요.`;
    const currency = value => value.toLocaleString('ko-KR') + '원';
    const goal = run.summary.goalMonth;
    const metrics = [
      ['목표 최초 달성', goal === null ? '기간 내 미달성' : goal === 0 ? '시작 시점' : goal + '개월차'],
      ['기간 말 총자산', currency(run.summary.finalNetAssets)],
      ['현금 부족 기간', run.summary.shortageMonths + '개월'],
      ['누적 미충족액', currency(run.summary.unmetTotal)]
    ];
    for (const [label, value] of metrics) {
      const card = document.createElement('div');
      const caption = document.createElement('small');
      const amount = document.createElement('strong');
      caption.textContent = label;
      amount.textContent = value;
      card.append(caption, amount);
      $('runsummary').append(card);
    }
    for (const row of run.monthlyResults) {
      const tr = document.createElement('tr');
      for (const value of [row.month + '개월', currency(row.cash), currency(row.saved), currency(row.unpaid), currency(row.total)]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      $('runmonths').append(tr);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
