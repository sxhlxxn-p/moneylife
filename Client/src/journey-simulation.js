function simulate(
  changes = JourneyStore.current.mods,
  rateChanges = JourneyStore.current.rateMods,
  monthlySaving = JourneyStore.current.baseSaving,
  annualRate = JourneyStore.current.baseRate,
) {
  return GameEngine.simulate({
    initial: JourneyStore.current.start,
    changes: changes,
    rateChanges: rateChanges,
    monthlySaving: monthlySaving,
    annualRate: annualRate,
    months: 120,
  });
}
function financialProfile() {
  return {
    ...JourneyStore.current.start,
    income: JourneyStore.current.start.income * 10000,
    expense: JourneyStore.current.start.expense * 10000,
    cash: JourneyStore.current.start.cash * 10000,
    saved: JourneyStore.current.start.saved * 10000,
    goalAmount: JourneyStore.current.start.target * 10000,
    goalName: JourneyStore.current.goalName,
    goalMonths: JourneyStore.current.goalMonths,
    annualRate: JourneyStore.current.baseRate,
  };
}
function log(text) {
  JourneyStore.mutate("logs", "unshift", {
    month: JourneyStore.current.month,
    text,
  });
  if (JourneyStore.current.logs.length > 80) JourneyStore.mutate("logs", "pop");
}
function stressChanges() {
  const path = simulate();
  return [
    ...JourneyStore.current.mods,
    ...Array.from(
      {
        length: Math.min(6, 120 - JourneyStore.current.month),
      },
      (_, i) => ({
        type: "income",
        v: -Math.min(100, path[JourneyStore.current.month + i + 1].income),
        m: JourneyStore.current.month + i + 1,
        end: JourneyStore.current.month + i + 1,
      }),
    ),
  ];
}
