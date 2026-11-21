async function withMutationLock(action) {
  if (!globalThis.navigator?.locks)
    throw new Error(
      "현재 브라우저에서 안전하게 저장할 수 없어요. 다른 브라우저에서 다시 시도해주세요.",
    );
  return navigator.locks.request(
    "moneylife:mutations",
    { ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error(
          "다른 탭이나 화면에서 처리 중이에요. 완료된 뒤 다시 시도해주세요.",
        );
      return action();
    },
  );
}
function serializedMutation(action, onError = (message) => toast(message)) {
  return async function (...args) {
    try {
      return await withMutationLock(() => action.apply(this, args));
    } catch (error) {
      onError(error.message);
    }
  };
}

const sessionEpochKey = "money-life-session-epoch";
let sessionEpoch = "initial";
try {
  sessionEpoch = localStorage.getItem(sessionEpochKey) || "initial";
} catch {}
const sessionChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("moneylife-session")
    : null;
function getSessionEpoch() {
  return sessionEpoch;
}
function acceptSessionEpoch(value) {
  if (typeof value !== "string" || value === sessionEpoch) return;
  sessionEpoch = value;
  window.dispatchEvent(new Event("moneylife:external-session-renewed"));
}
function publishSessionEpoch() {
  sessionEpoch = crypto.randomUUID();
  let persisted = true;
  try {
    localStorage.setItem(sessionEpochKey, sessionEpoch);
  } catch {
    persisted = false;
  }
  if (sessionChannel) sessionChannel.postMessage(sessionEpoch);
  return persisted;
}
if (sessionChannel)
  sessionChannel.onmessage = (event) => acceptSessionEpoch(event.data);
window.addEventListener("storage", (event) => {
  if (event.key === sessionEpochKey) acceptSessionEpoch(event.newValue);
});
