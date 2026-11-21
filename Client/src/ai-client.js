function aiSnapshot() {
  return JourneyStore.snapshot();
}
async function askServer() {
  const message = $("ask").value.trim();
  if (!message) {
    toast("바꾸고 싶은 조건을 입력해주세요.");
    return;
  }
  return requestAIChange(message);
}
async function requestAIChange(message, followup = null) {
  if (serverPlanBusy) return;
  stop();
  const snapshot = aiSnapshot();
  if (
    followup &&
    JSON.stringify(snapshot) !== JSON.stringify(followup.snapshot)
  ) {
    toast("조건이 바뀌었어요. 새 조건에서 다시 질문해주세요.");
    return;
  }
  setPlanBusy(true);
  try {
    $("serverstatus").textContent =
      "현재 조건으로 AI 변경안을 확인하고 있어요.";
    const plan = followup
      ? {
          id: followup.planId,
        }
      : await planRequest("", {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: 1,
            goalBasis: "net_assets",
            parentPlanId: serverPlanId,
            state: snapshot,
          }),
        });
    const proposal = await apiRequest("ai", "/parse-change", {
      method: "POST",
      timeoutMs: 35000,
      body: JSON.stringify({
        planId: plan.id,
        message,
        ...(followup
          ? {
              clarificationId: followup.id,
            }
          : {}),
      }),
    });
    if (JSON.stringify(snapshot) !== JSON.stringify(aiSnapshot())) {
      toast("해석 중 조건이 바뀌었어요. 현재 조건으로 다시 요청해주세요.");
      return;
    }
    show(
      '<h2>AI 조건 변경안</h2><p id="airequest"></p><div id="aipreview"></div><p id="aistatus" role="status"></p><div class="modalactions"><button class="btn" onclick="closeModal()">취소</button><button id="aiedit" class="btn" type="button" data-plan-action="ai">요청 수정</button><button id="aiapply" class="btn primary" data-plan-action="ai">확인하고 새 계획 계산</button></div>',
    );
    $("airequest").textContent = proposal.message;
    $("aiedit").onclick = () => {
      closeModal();
      const answers =
        followup?.history?.map((turn) => turn.answer) ||
        (followup ? [message] : []);
      $("ask").value = [
        proposal.message,
        ...answers.map((answer, index) => `보충 조건 ${index + 1}: ${answer}`),
      ].join("\n");
      $("ask").focus();
      toast(
        "항목·금액·적용 시점을 수정한 뒤 다시 요청해주세요. 현재 계획은 바뀌지 않았어요.",
      );
    };
    if (followup) {
      for (const turn of followup.history || [{ answer: message }]) {
        const answer = document.createElement("p");
        answer.className = "ai-followup-answer";
        answer.textContent =
          (turn.question ? turn.question + " → " : "보충 답변: ") + turn.answer;
        $("aipreview").append(answer);
      }
    }
    if (proposal.status !== "ready") {
      $("aistatus").textContent = proposal.question;
      $("aiapply").remove();
      if (proposal.clarificationId) {
        const label = document.createElement("label");
        label.textContent = "추가 답변";
        const input = document.createElement("input");
        input.id = "aifollowup";
        input.maxLength = 2000;
        label.htmlFor = input.id;
        label.append(input);
        const send = document.createElement("button");
        send.className = "btn primary";
        send.textContent = "답변 보내기";
        send.dataset.planAction = "ai-followup";
        send.onclick = () => {
          const answer = input.value.trim();
          if (answer)
            requestAIChange(answer, {
              id: proposal.clarificationId,
              planId: plan.id,
              snapshot,
              history: [
                ...(followup?.history || []),
                { question: proposal.question, answer },
              ],
            });
        };
        $("aipreview").append(label, send);
      }
    } else {
      if (proposal.previewDetails?.length)
        renderAIChangeDetails($("aipreview"), proposal.previewDetails);
      for (const line of proposal.previewDetails?.length
        ? []
        : proposal.preview) {
        const node = document.createElement("p");
        node.textContent = line;
        $("aipreview").append(node);
      }
      $("aistatus").textContent =
        "30분 안에 확인해주세요. 원본을 보존하고 새 계획을 만들어요. 아직 현재 여정에는 적용하지 않았어요.";
      $("aiapply").addEventListener("click", () =>
        applyAIProposal(proposal.proposalId, snapshot),
      );
    }
    $("serverstatus").textContent =
      "변경안을 확인해주세요. 아직 현재 여정에는 적용하지 않았어요.";
  } catch (error) {
    $("serverstatus").textContent = error.message;
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
async function applyAIProposal(id, snapshot) {
  if (serverPlanBusy) return;
  if (JSON.stringify(snapshot) !== JSON.stringify(aiSnapshot())) {
    toast("현재 조건이 바뀌었어요. 변경안을 다시 요청해주세요.");
    return;
  }
  setPlanBusy(true);
  try {
    const result = await apiRequest(
      "ai",
      "/proposals/" + encodeURIComponent(id) + "/apply",
      {
        method: "POST",
        timeoutMs: 35000,
        body: JSON.stringify({
          confirmed: true,
        }),
      },
    );
    if (JSON.stringify(snapshot) !== JSON.stringify(aiSnapshot())) {
      $("serverstatus").textContent =
        "이전 조건의 결과는 서버에 저장했어요. 현재 변경은 유지하며 저장한 여정에서 결과를 확인할 수 있어요.";
      toast("계산 중 조건이 바뀌어 현재 여정을 유지했어요.");
      return;
    }
    restoreServerPlan(result.plan);
    show(
      '<h2>새 계획을 계산했어요</h2><p id="aiexplanation"></p><p id="aiexplanationsource">계산 결과를 넣은 정형 설명입니다.</p><div class="modalactions"><button id="explainai" class="btn" data-plan-action="explain">AI 설명 보기</button></div><p>원본과 새 계획은 저장한 여정에서 각각 불러올 수 있어요. 상세 수치는 계산 결과에서 확인하세요.</p>',
    );
    $("aiexplanation").textContent = result.explanation;
    $("explainai").addEventListener("click", () => explainAIRun(result.run.id));
    $("serverstatus").textContent =
      "AI 변경안 적용 · 새 계획과 서버 계산 결과 저장 완료";
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
async function explainAIRun(runId) {
  if (serverPlanBusy) return;
  setPlanBusy(true);
  try {
    const result = await apiRequest("ai", "/explain", {
      method: "POST",
      timeoutMs: 35000,
      body: JSON.stringify({
        runId,
      }),
    });
    if (!$("aiexplanation") || !$("aiexplanationsource")) return;
    $("aiexplanation").textContent = result.text;
    $("aiexplanationsource").textContent =
      result.source === "llm"
        ? "AI가 사실의 읽기 순서를 정했어요. 문장과 수치·증감 방향은 서버 계산 결과입니다."
        : "AI 설명을 생성하지 못해 정형 설명을 유지했어요.";
  } catch (error) {
    toast(error.message);
  } finally {
    setPlanBusy(false);
  }
}
