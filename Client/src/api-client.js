async function apiRequest(resource, path, options = {}) {
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const epoch = getSessionEpoch();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let failureStatus;
  let failureCode;
  try {
    const response = await fetch("/api/" + resource + path, {
      ...fetchOptions,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (epoch !== getSessionEpoch())
      throw Object.assign(
        new Error("세션이 변경됐어요. 현재 세션에서 다시 확인해주세요."),
        { status: 409, code: "SESSION_CHANGED" },
      );
    if (!response.ok) {
      failureStatus = response.status;
      const body = await response.json().catch(() => ({}));
      failureCode = typeof body.detail === "string" ? body.detail : undefined;
      if (response.status === 401)
        window.dispatchEvent(new Event("moneylife:session-expired"));
      throw new Error(apiErrorMessage(resource, failureCode, response.status));
    }
    const body = await response.json();
    if (epoch !== getSessionEpoch())
      throw Object.assign(
        new Error("세션이 변경됐어요. 현재 세션에서 다시 확인해주세요."),
        { status: 409, code: "SESSION_CHANGED" },
      );
    return body;
  } catch (error) {
    if (failureStatus) {
      error.status = failureStatus;
      error.code = failureCode;
    }
    if (error.name === "AbortError")
      throw new Error(
        "서버 응답이 늦어졌어요. 저장 목록에서 저장 여부를 확인해주세요.",
      );
    if (error instanceof TypeError)
      throw new Error("서버에 연결하지 못했어요. 현재 여정은 유지됩니다.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
