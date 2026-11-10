// 순수 금융 계산 엔진입니다. 금액은 모두 만 원 단위로 계산합니다.
const GameEngine = {
  simulate({ initial, changes = [], rateChanges = [], monthlySaving = 70, annualRate = 3, months = 120 }) {
    let cash = initial.cash;
    let saved = initial.saved;
    let unpaid = 0;
    const debt = initial.debt || 0;
    const otherAssets = initial.otherAssets || 0;
    const result = [{
      cash, saved, unpaid, debt, otherAssets, total: cash + saved + otherAssets - debt,
      income: initial.income, expense: initial.expense, short: 0
    }];
    for (let m = 1; m <= months; m++) {
      let income = initial.income;
      let expense = initial.expense;
      let saving = monthlySaving;
      let rate = annualRate;
      let once = 0;
      for (const change of changes) {
        if (m >= change.m && (change.end == null || m <= change.end)) {
          if (change.type === "saving") saving = change.v;
          if (change.type === "expense") expense += change.v;
          if (change.type === "income") income += change.v;
          if (change.type === "once" && m === change.m) once += change.v;
        }
      }
      for (const change of rateChanges) if (m >= change.m) rate = change.v;
      saved *= Math.pow(1 + rate / 100, 1 / 12);
      const before = cash + income - expense - once;
      const short = Math.max(0, -before);
      unpaid += short;
      cash = Math.max(0, before);
      const transfer = Math.min(saving, cash);
      cash -= transfer;
      saved += transfer;
      result.push({
        cash, saved, unpaid, debt, otherAssets, total: cash + saved + otherAssets - unpaid - debt,
        income, expense: expense + once, short
      });
    }
    return result;
  }
};

// 브라우저의 app.js에서 접근할 수 있도록 전역 객체에 연결합니다.
if (typeof window !== "undefined") {
  window.GameEngine = GameEngine;
}

// Node.js 환경에서 단위 테스트 또는 별도 모듈로 사용할 수 있도록 내보냅니다.
if (typeof module !== "undefined" && module.exports) {
  module.exports = GameEngine;
}
