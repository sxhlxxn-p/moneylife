const JourneyStore = (() => {
  const state = {
    start: { ...defaults },
    month: 0,
    baseSaving: 70,
    baseRate: 3,
    saving: 70,
    rate: 3,
    mods: [],
    rateMods: [],
    logs: [],
    events: new Set(),
    speed: 1,
    timer: null,
    focusBefore: null,
    goalName: "나만의 공간 마련하기",
    goalMonths: 60,
    activePage: "dashboard",
  };
  function immutable(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(immutable));
    if (value && Object.getPrototypeOf(value) === Object.prototype)
      return Object.freeze(
        Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, immutable(item)]),
        ),
      );
    return value;
  }
  for (const key of Object.keys(state))
    if (!["timer", "focusBefore"].includes(key))
      state[key] = immutable(state[key]);
  function get(key) {
    return state[key] instanceof Set ? new Set(state[key]) : state[key];
  }
  const current = Object.freeze(
    Object.fromEntries(
      Object.keys(state).map((key) => [key, { get: () => get(key) }]),
    ),
  );
  const view = {};
  Object.defineProperties(view, current);
  Object.freeze(view);
  function set(key, value) {
    if (!Object.hasOwn(state, key))
      throw new Error("Unknown journey field: " + key);
    state[key] = ["timer", "focusBefore"].includes(key)
      ? value
      : value instanceof Set
        ? new Set(value)
        : immutable(value);
    return value;
  }
  function increment(key, amount) {
    const old = get(key);
    set(key, old + amount);
    return old;
  }
  function mutate(key, operation, ...args) {
    if (!["push", "pop", "unshift", "add"].includes(operation))
      throw new Error("Unknown collection operation");
    const next =
      state[key] instanceof Set ? new Set(state[key]) : [...state[key]];
    const result = next[operation](...args);
    set(key, next);
    return result;
  }
  function restore(game) {
    for (const key of [
      "start",
      "month",
      "baseSaving",
      "baseRate",
      "saving",
      "rate",
      "mods",
      "rateMods",
      "logs",
    ])
      set(key, game[key]);
    set("events", new Set(game.events));
  }
  return { current: view, get, set, increment, mutate, restore };
})();
