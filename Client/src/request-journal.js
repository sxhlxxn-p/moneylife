function createRequestJournal(storage, key, valid) {
  const getStorage = typeof storage === "function" ? storage : () => storage;
  let pending = null;
  try {
    const saved = JSON.parse(getStorage().getItem(key));
    if (valid(saved)) pending = saved;
  } catch {}
  function clear() {
    getStorage().removeItem(key);
    pending = null;
  }
  return {
    get: () => pending,
    stage(request) {
      if (!valid(request)) throw new Error("복구할 요청 형식을 확인해주세요.");
      getStorage().setItem(key, JSON.stringify(request));
      pending = request;
    },
    clear,
    archive(reason) {
      if (!pending) return;
      const archiveKey = key + "-archive";
      let entries = [];
      try {
        const saved = JSON.parse(getStorage().getItem(archiveKey));
        if (Array.isArray(saved)) entries = saved;
      } catch {}
      getStorage().setItem(
        archiveKey,
        JSON.stringify(
          [
            ...entries,
            { reason, archivedAt: Date.now(), request: pending },
          ].slice(-20),
        ),
      );
      clear();
    },
  };
}
