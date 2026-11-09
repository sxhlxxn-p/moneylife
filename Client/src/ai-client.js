/* AI change approval flow. Author: sxhlxxn / Student ID: 202439688. */
function aiSnapshot() {
  return MoneyLifePlanState.encode({start, month, baseSaving, baseRate, mods, rateMods, logs, events});
}

async function askServer() {
  if (serverPlanBusy) return;
  const message = $('ask').value.trim();
  if (!message) { toast('바꾸고 싶은 조건을 입력해주세요.'); return; }
  stop();
  setPlanBusy(true);
  const snapshot = aiSnapshot();
  try {
    $('serverstatus').textContent = '현재 조건을 보관하고 AI 변경안을 확인하고 있어요.';
    const plan = await planRequest('', {method: 'POST', body: JSON.stringify({schemaVersion: 1,
      goalBasis: 'net_assets', parentPlanId: serverPlanId, state: snapshot})});
    const proposal = await apiRequest('ai', '/parse-change', {method: 'POST', timeoutMs: 35000,
      body: JSON.stringify({planId: plan.id, message})});
    if (JSON.stringify(snapshot) !== JSON.stringify(aiSnapshot())) {
      toast('해석 중 조건이 바뀌었어요. 현재 조건으로 다시 요청해주세요.');
      return;
    }
    show('<h2>AI 조건 변경안</h2><p id="airequest"></p><div id="aipreview"></div><p id="aistatus" role="status"></p><div class="modalactions"><button class="btn" onclick="closeModal()">취소</button><button id="aiapply" class="btn primary" data-plan-action="ai">확인하고 새 계획 계산</button></div>');
    $('airequest').textContent = message;
    if (proposal.status !== 'ready') {
      $('aistatus').textContent = proposal.question;
      $('aiapply').remove();
    } else {
      for (const line of proposal.preview) {
        const p = document.createElement('p'); p.textContent = line; $('aipreview').append(p);
      }
      $('aistatus').textContent = '30분 안에 확인해주세요. 원본은 보존하고 새 계획을 만듭니다. 결과 설명은 계산 지표를 넣은 정형 문장입니다.';
      $('aiapply').addEventListener('click', () => applyAIProposal(proposal.proposalId, snapshot));
    }
    $('serverstatus').textContent = '변경안을 확인해주세요. 아직 현재 여정에는 적용하지 않았어요.';
  } catch (error) {
    $('serverstatus').textContent = error.message;
    toast(error.message);
  } finally { setPlanBusy(false); }
}

async function applyAIProposal(id, snapshot) {
  if (serverPlanBusy) return;
  if (JSON.stringify(snapshot) !== JSON.stringify(aiSnapshot())) {
    toast('현재 조건이 바뀌었어요. 변경안을 다시 요청해주세요.'); return;
  }
  setPlanBusy(true);
  try {
    const result = await apiRequest('ai', '/proposals/' + encodeURIComponent(id) + '/apply', {
      method: 'POST', timeoutMs: 35000, body: JSON.stringify({confirmed: true})});
    restoreServerPlan(result.plan);
    show('<h2>새 계획을 계산했어요</h2><p id="aiexplanation"></p><p>원본과 새 계획은 저장한 여정에서 각각 불러올 수 있어요. 상세 수치는 계산 결과에서 확인하세요.</p>');
    $('aiexplanation').textContent = result.explanation;
    $('serverstatus').textContent = 'AI 변경안 적용 · 새 계획과 서버 계산 결과 저장 완료';
  } catch (error) { toast(error.message); }
  finally { setPlanBusy(false); }
}
