// A read-only story built from the same snapshots and calculated money as the game.
// Values here describe progress; they never grant money or change event effects.
(function (root) {
  function decisions(state, catalog) {
    const answered = new Set(state.events);
    return catalog.events
      .filter(
        (event) => answered.has(event.month) && event.month <= state.month,
      )
      .map((event) => {
        const entry = state.logs.find(
          (log) =>
            log.month === event.month && [event.a, event.b].includes(log.text),
        );
        return {
          month: event.month,
          accepted: entry ? entry.text === event.a : null,
          title: event.title,
          label: entry?.text || event.title,
          applied: state.month > event.month,
        };
      });
  }
  function life(state, catalog) {
    const choices = decisions(state, catalog);
    const accepted = (month) =>
      choices.some(
        (choice) => choice.month === month && choice.accepted && choice.applied,
      );
    const resting = accepted(30) && state.month <= 33;
    const homeChoice = choices.find((choice) => choice.month === 12);
    const home =
      homeChoice?.accepted === null && homeChoice.applied
        ? "unknown"
        : accepted(12)
          ? "independent"
          : "family";
    const work = resting ? "rest" : accepted(48) ? "newjob" : "steady";
    const learning = accepted(96);
    const travelled = accepted(72);
    const travelling = travelled && state.month === 73;
    const location = travelling
      ? "travel"
      : resting
        ? "park"
        : state.month === 13 && home === "independent"
          ? "home"
          : state.month === 49 && work === "newjob"
            ? "work"
            : learning
              ? "work"
              : state.month % 3 === 1
                ? "bank"
                : state.month % 3 === 2
                  ? "work"
                  : "home";
    const label = travelling
      ? "꿈꾸던 여행 중"
      : resting
        ? "잠시 쉬어가는 일상"
        : learning
          ? "배움의 경험을 더한 일상"
          : work === "newjob"
            ? "새 직장에 다니는 중"
            : home === "independent"
              ? "내 집에서 시작하는 일상"
              : home === "unknown"
                ? "나의 일상을 이어가는 중"
                : "함께 살며 준비하는 내일";
    return {
      home,
      work,
      learning,
      travelled,
      travelling,
      location,
      label,
      choices,
    };
  }
  function missions(state, path) {
    const start = Math.round(path[0].total * 10000);
    const target = state.initial.target;
    const gap = Math.max(0, target - start);
    const first = Math.min(1000000, Math.max(1, Math.floor(gap / 3)));
    const reserve = Math.max(
      first + 1,
      Math.min(
        Math.max(state.initial.expense * 3, 3000000),
        Math.floor((gap * 2) / 3),
      ),
    );
    const specs = [];
    if (gap > 2) {
      specs.push({
        id: "first",
        chapter: "첫 돈의 흐름",
        title: "출발보다 한 걸음 더",
        target: start + first,
        base: start,
        description: "출발 자산에 더해 모을 금액",
      });
      if (start + reserve < target)
        specs.push({
          id: "reserve",
          chapter: "생활의 여유 만들기",
          title: "다음 생활을 준비하기",
          target: start + reserve,
          base: start,
          description: "출발 자산에 더해 모을 금액",
        });
    }
    specs.push({
      id: "goal",
      chapter: "내가 그린 미래",
      title: state.goal.name,
      target,
      base: 0,
      description: "이번 여정의 순자산 목표",
    });
    return specs.map((spec, index) => {
      const hit = path.findIndex(
        (row) => Math.round(row.total * 10000) >= spec.target,
      );
      const total = Math.round(path[state.month].total * 10000);
      const amount =
        spec.id === "goal" ? total : Math.max(0, total - spec.base);
      const needed = spec.target - spec.base;
      return {
        ...spec,
        index: index + 1,
        count: specs.length,
        hit: hit < 0 || hit > state.month ? null : hit,
        complete: hit >= 0 && hit <= state.month,
        amount,
        needed,
        progress: needed <= 0 ? 1 : Math.max(0, Math.min(1, amount / needed)),
      };
    });
  }
  function context(state, catalog, eventMonth) {
    const choices = decisions(state, catalog);
    const previous = choices
      .filter((choice) => choice.month < eventMonth && choice.accepted !== null)
      .at(-1);
    if (!previous) return null;
    const independent = choices.some(
      (choice) => choice.month === 12 && choice.accepted,
    );
    const text =
      eventMonth === 30
        ? independent
          ? "독립을 선택한 뒤 찾아온 휴식이에요. 소득이 쉬어도 생활비는 계속 나가요. 남은 현금과 3개월의 생활을 함께 살펴보세요."
          : "함께 살며 자금을 모아온 뒤 찾아온 휴식이에요. 지금까지 쌓은 현금으로 소득 없는 3개월을 보낼 수 있을까요?"
        : eventMonth === 48
          ? independent
            ? "내 공간을 꾸려가는 생활에 새 직장 제안이 왔어요. 준비 비용과 앞으로 늘어날 월 소득을 함께 비교해보세요."
            : "지금까지 유지한 생활을 바탕으로 새로운 일을 고민해요. 익숙한 일상과 새 소득 중 어떤 미래를 선택할까요?"
          : eventMonth === 72
            ? previous.accepted
              ? "새로운 선택을 지나, 이번에는 나를 위한 경험을 고민해요. 여행 비용을 쓴 뒤에도 목표까지 갈 수 있는지 확인하세요."
              : "지금의 일상을 지켜온 당신에게 여행의 기회가 왔어요. 쌓아온 자금의 일부를 경험에 써볼까요?"
            : "지금까지의 경험 위에 배움을 더할 기회예요. 교육 비용은 반영하지만, 아직 정해지지 않은 미래 소득을 보상으로 더하지는 않아요.";
    return { previous, text };
  }
  function receipt(path, month) {
    const current = path[month],
      previous = path[month - 1];
    if (!previous) return null;
    const toWon = (value) => Math.round(value * 10000);
    const income = toWon(current.income),
      expense = toWon(current.expense);
    return {
      income,
      expense,
      transfer:
        Math.max(0, toWon(previous.cash) + income - expense) -
        toWon(current.cash),
      change: toWon(current.total) - toWon(previous.total),
    };
  }
  function choiceOutcome(month, accepted, state, catalog) {
    const labels = {
      12: ["혼자 꾸리는 나만의 생활", "함께 살며 독립 자금 준비"],
      30: ["3개월, 나를 위한 휴식", "소득이 이어지는 일상"],
      48: ["새 직장과 늘어나는 소득", "익숙한 직장과 현재의 소득"],
      72: ["꿈꾸던 여행의 경험", "목표를 위해 남겨둔 여행 자금"],
      96: ["새로운 배움을 시작하는 생활", "추가 교육 지출 없이 이어가는 일상"],
    };
    if (accepted && state && catalog) {
      const choices = decisions(state, catalog);
      const home = choices.find((choice) => choice.month === 12);
      if (month === 30 && home?.accepted !== null && home)
        return home.accepted
          ? "내 공간에서 쉬어가는 3개월"
          : "함께 사는 집에서 쉬어가는 3개월";
      if (month === 48 && home?.accepted !== null && home)
        return home.accepted
          ? "새 직장으로 내 생활 기반 넓히기"
          : "새 직장으로 독립 준비 이어가기";
      if (
        month === 96 &&
        choices.some((choice) => choice.month === 72 && choice.accepted)
      )
        return "여행 다음, 이번에는 새로운 배움";
    }
    return labels[month]?.[accepted ? 0 : 1] || "내가 선택한 일상";
  }
  function ending(state, catalog) {
    const choices = decisions(state, catalog),
      accepted = (month) =>
        choices.some((choice) => choice.month === month && choice.accepted);
    if (accepted(48) && accepted(96)) return "일과 배움의 가능성을 넓힌 10년";
    if (accepted(12) && accepted(72))
      return "내 공간과 새로운 경험을 만든 10년";
    if (accepted(12)) return "나만의 생활을 꾸려온 10년";
    if (accepted(30)) return "나의 속도를 찾아간 10년";
    if (accepted(72) || accepted(96) || accepted(48))
      return "새로운 경험을 선택해온 10년";
    return choices.length &&
      choices.every((choice) => choice.accepted === false)
      ? "익숙한 일상을 차근차근 쌓은 10년"
      : "내 선택으로 만들어온 10년";
  }
  function retainLogs(logs, catalog, limit = 80) {
    const next = [...logs];
    const isChoice = (log) =>
      catalog.events.some(
        (event) =>
          event.month === log.month && [event.a, event.b].includes(log.text),
      );
    while (next.length > limit) {
      let index = next.length - 1;
      while (index >= 0 && isChoice(next[index])) index--;
      next.splice(index < 0 ? next.length - 1 : index, 1);
    }
    return next;
  }
  const api = {
    decisions,
    life,
    missions,
    context,
    receipt,
    choiceOutcome,
    ending,
    retainLogs,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MoneyLifeStory = api;
})(typeof globalThis === "object" ? globalThis : this);
