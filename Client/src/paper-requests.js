function createPaperRequests(storage) {
  return createRequestJournal(storage, "money-life-paper-pending", (saved) =>
    Boolean(
      saved &&
      ["create", "orders", "advance", "cancel", "conditions"].includes(
        saved.action,
      ) &&
      typeof saved.body?.requestId === "string" &&
      (saved.action === "create" || /^[a-f0-9-]{36}$/.test(saved.parentId)) &&
      (saved.action !== "cancel" || /^[a-f0-9-]{36}$/.test(saved.orderId)),
    ),
  );
}
