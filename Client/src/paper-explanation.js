function installPaperExplanation(paper) {
  paper.explanationPanel = function (runId) {
    const section = paper.node("section", undefined, "paper-explanation");
    section.setAttribute("aria-label", "투자 결과 해설");
    section.append(
      paper.node("h4", "이 결과는 어떻게 읽을까요?"),
      paper.node(
        "p",
        "저장된 실행 결과의 숫자와 방향을 연결해 설명해요. 기본 해설은 외부 AI를 호출하지 않아요.",
        "paper-caption",
      ),
    );
    const actions = paper.node("div", undefined, "paper-toolbar");
    const body = paper.node("div", undefined, "paper-explanation-facts");
    const status = paper.node("p", "", "paper-caption");
    status.setAttribute("role", "status");
    function display(result) {
      body.replaceChildren();
      for (const fact of result.sections) {
        const card = paper.node("article");
        card.append(paper.node("h5", fact.title), paper.node("p", fact.text));
        body.append(card);
      }
      if (result.source === "llm-ranked") {
        status.textContent =
          "AI가 선택·정렬한 지표 해설 · 문장과 수치는 서버 계산 결과에 연결했어요." +
          (result.cached ? " 저장된 선택을 다시 불러왔어요." : "");
      } else {
        status.textContent =
          result.fallbackReason === "LLM_NOT_CONFIGURED"
            ? "AI 연결 설정 전이라 기본 계산 지표 해설을 표시했어요."
            : result.fallbackReason
              ? "AI 선택을 확인하지 못해 기본 계산 지표 해설로 표시했어요."
              : "기본 계산 지표 해설 · LLM이 작성한 문장이 아닙니다.";
      }
    }
    async function explain(useAI) {
      if (
        !paper.available() ||
        !paper.current ||
        paper.current.run.id !== runId
      )
        return;
      setPlanBusy(true);
      status.textContent = useAI
        ? "AI가 읽기 순서를 정리하는 중이에요."
        : "저장된 결과를 읽는 중이에요.";
      try {
        const result = await apiRequest(
          "paper-runs",
          "/" + encodeURIComponent(runId) + "/explanation",
          useAI
            ? {
                method: "POST",
                timeoutMs: 25000,
                body: JSON.stringify({
                  useAI: true,
                }),
              }
            : {},
        );
        if (!paper.current || paper.current.run.id !== runId) return;
        paper.explanations.set(runId, result);
        if (paper.explanations.size > 20)
          paper.explanations.delete(paper.explanations.keys().next().value);
        if (section.isConnected) display(result);
      } catch (error) {
        if (section.isConnected)
          status.textContent =
            error.message + " 저장된 투자 결과와 주문은 유지됩니다.";
      } finally {
        setPlanBusy(false);
      }
    }
    actions.append(
      paper.button(
        "기본 해설 보기",
        () => explain(false),
        Boolean(paper.queue.get()),
      ),
      paper.button(
        "AI로 핵심 지표 정리",
        () => explain(true),
        Boolean(paper.queue.get()),
      ),
    );
    section.append(
      actions,
      paper.node(
        "p",
        "AI 버튼을 누르면 이 실행의 해설용 금융 지표 문장이 외부 AI에 전송돼요. 이름·계좌·가격 원본은 전송하지 않아요. AI는 사실의 선택과 읽기 순서만 정합니다.",
        "paper-explanation-notice",
      ),
      status,
      body,
    );
    if (paper.explanations.has(runId)) display(paper.explanations.get(runId));
    return section;
  };
}
