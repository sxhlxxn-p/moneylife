function createPaperRequests(storage) {
  const getStorage = typeof storage === "function" ? storage : () => storage;
  const key = "money-life-paper-pending";
  let pending = null;
  try {
    const saved = JSON.parse(getStorage().getItem(key));
    if (
      saved &&
      ["create", "orders", "advance", "cancel", "conditions"].includes(
        saved.action,
      ) &&
      typeof saved.body?.requestId === "string" &&
      (saved.action === "create" || /^[a-f0-9-]{36}$/.test(saved.parentId)) &&
      (saved.action !== "cancel" || /^[a-f0-9-]{36}$/.test(saved.orderId))
    )
      pending = saved;
  } catch {}
  return {
    get: () => pending,
    stage(request) {
      getStorage().setItem(key, JSON.stringify(request));
      pending = request;
    },
    clear() {
      getStorage().removeItem(key);
      pending = null;
    },
  };
}
