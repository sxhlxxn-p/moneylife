function mlParseWon(value) {
  const text = String(value).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return NaN;
  const amount = Number(text.replaceAll(",", ""));
  return Number.isSafeInteger(amount) ? amount : NaN;
}
function mlSetWon(id, amount) {
  const input = document.getElementById(id);
  input.value = Number(amount).toLocaleString("ko-KR");
  input.setCustomValidity?.("");
  input.removeAttribute?.("aria-invalid");
}
function mlInstallMoneyInput(input, minimum = 0) {
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  function validate() {
    const amount = mlParseWon(input.value);
    input.setCustomValidity(
      input.value.trim() &&
        (!Number.isFinite(amount) || amount < minimum || amount > 10000000000)
        ? `${minimum}원~100억 원 사이의 정수 금액을 입력하세요. 쉼표는 세 자리마다 넣어주세요.`
        : "",
    );
  }
  input.addEventListener("input", (event) => {
    if (event.isComposing) return;
    const raw = input.value;
    const typedComma =
      typeof event.data === "string" && event.data.includes(",");
    const bulkComma =
      (event.inputType === "insertFromPaste" || !event.inputType) &&
      raw.includes(",");
    const preserveInvalid =
      (typedComma || bulkComma) && !Number.isFinite(mlParseWon(raw));
    const digits = raw.replaceAll(",", "");
    if (
      !preserveInvalid &&
      /^\d+$/.test(digits) &&
      Number.isSafeInteger(Number(digits))
    ) {
      const before = (
        raw.slice(0, input.selectionStart ?? raw.length).match(/\d/g) || []
      ).length;
      const formatted = Number(digits).toLocaleString("ko-KR");
      if (formatted !== raw) {
        input.value = formatted;
        let count = 0,
          cursor = 0;
        while (cursor < formatted.length && count < before)
          if (/\d/.test(formatted[cursor++])) count++;
        input.setSelectionRange(cursor, cursor);
      }
    }
    validate();
  });
  if (Number.isFinite(mlParseWon(input.value)))
    mlSetWon(input.id, mlParseWon(input.value));
  validate();
}
