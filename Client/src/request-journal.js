function createRequestJournal(storage, key, valid) {
  const getStorage = typeof storage === "function" ? storage : () => storage;
  let pending = null,
    ownedId = null,
    suspended = false;
  const id = (value) => value?.requestId || value?.body?.requestId;
  function read() {
    const raw = getStorage().getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return valid(value) ? value : null;
  }
  try {
    pending = read();
    ownedId = id(pending);
  } catch {}
  function get() {
    try {
      pending = read();
    } catch {}
    return pending;
  }
  function conflict() {
    throw new Error(
      "다른 요청이 보관돼 있어요. 기존 요청을 확인한 뒤 다시 시도해주세요.",
    );
  }
  function clear(expectedId = ownedId) {
    const latest = read();
    if (latest && id(latest) !== expectedId) conflict();
    getStorage().removeItem(key);
    pending = null;
    ownedId = null;
    suspended = false;
  }
  return {
    get,
    stage(request) {
      if (suspended)
        throw new Error("이전 세션의 요청을 보관한 뒤 새 작업을 시작해주세요.");
      if (!valid(request)) throw new Error("복구할 요청 형식을 확인해주세요.");
      const latest = read();
      if (latest && JSON.stringify(latest) !== JSON.stringify(request))
        conflict();
      getStorage().setItem(key, JSON.stringify(request));
      pending = request;
      ownedId = id(request);
    },
    clear,
    suspend() {
      suspended = true;
    },
    isSuspended: () => suspended,
    archive(reason) {
      const request = get();
      if (!request) {
        suspended = false;
        return;
      }
      const archiveKey = key + "-archive";
      let entries = [];
      try {
        const saved = JSON.parse(getStorage().getItem(archiveKey));
        if (Array.isArray(saved)) entries = saved;
      } catch {}
      getStorage().setItem(
        archiveKey,
        JSON.stringify(
          [...entries, { reason, archivedAt: Date.now(), request }].slice(-20),
        ),
      );
      clear(id(request));
    },
  };
}
