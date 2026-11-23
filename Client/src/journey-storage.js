let localStorageWarningShown = false;

function persist() {
  try {
    localStorage.setItem(
      "money-life-v1",
      JSON.stringify({
        start: JourneyStore.current.start,
        goalName: JourneyStore.current.goalName,
        goalMonths: JourneyStore.current.goalMonths,
        month: JourneyStore.current.month,
        baseSaving: JourneyStore.current.baseSaving,
        baseRate: JourneyStore.current.baseRate,
        saving: JourneyStore.current.saving,
        rate: JourneyStore.current.rate,
        mods: JourneyStore.current.mods,
        rateMods: JourneyStore.current.rateMods,
        logs: JourneyStore.current.logs,
        events: [...JourneyStore.current.events],
      }),
    );
    localStorage.setItem(
      "money-life-goal-v1",
      JSON.stringify({
        goalName: JourneyStore.current.goalName,
        goalMonths: JourneyStore.current.goalMonths,
      }),
    );
    return true;
  } catch {
    if (!localStorageWarningShown) {
      localStorageWarningShown = true;
      toast(
        "이 기기에 저장할 수 없어요. 페이지를 닫기 전에 서버에 여정을 저장해주세요.",
      );
    }
    return false;
  }
}

function restoreLocalJourney() {
  // Restore the established version-1 game snapshot; do not reinterpret legacy stock inputs as deposits.
  try {
    const stored = JSON.parse(localStorage.getItem("money-life-v1"));
    if (stored) {
      const decoded = MoneyLifePlanState.decode({
        schemaVersion: 1,
        goalBasis: "net_assets",
        state: MoneyLifePlanState.encode({
          ...stored,
          events: new Set(stored.events),
        }),
      });
      JourneyStore.restore(decoded);
    }
    const profile = JSON.parse(localStorage.getItem("money-life-goal-v1"));
    if (!stored?.goalName && typeof profile?.goalName === "string")
      JourneyStore.set("goalName", profile.goalName.slice(0, 40));
    if (
      stored?.goalMonths === undefined &&
      Number.isInteger(profile?.goalMonths) &&
      profile.goalMonths >= 1 &&
      profile.goalMonths <= 120
    )
      JourneyStore.set("goalMonths", profile.goalMonths);
  } catch {}
}
