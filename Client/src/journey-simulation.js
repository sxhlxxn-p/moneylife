function simulate(
  changes = JourneyStore.current.mods,
  rateChanges = JourneyStore.current.rateMods,
  monthlySaving = JourneyStore.current.baseSaving,
  annualRate = JourneyStore.current.baseRate,
) {
  const toWon = (value) => Math.round(value * 10000);
  const state = {
    ...JourneyStore.snapshot(),
    changes: changes.map((change) => ({
      ...change,
      v: toWon(change.v),
      end: change.end ?? null,
    })),
    rateChanges,
    monthlySaving: toWon(monthlySaving),
    annualRate,
  };
  return MoneyLifeSnapshot.calculateSnapshot(state, 120).monthlyResults.map(
    (row) => ({
      month: row.month,
      ...Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => key !== "month")
          .map(([key, value]) => [key, value / 10000]),
      ),
    }),
  );
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
  if (JourneyStore.current.logs.length > 80)
    JourneyStore.set(
      "logs",
      typeof MoneyLifeStory !== "undefined" && LifeEventCatalog
        ? MoneyLifeStory.retainLogs(JourneyStore.current.logs, LifeEventCatalog)
        : JourneyStore.current.logs.slice(0, 80),
    );
}
function stressChanges(path = simulate()) {
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
