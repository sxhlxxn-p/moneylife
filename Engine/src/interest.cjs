(function(root) {
const commonJS=typeof module !== 'undefined' && module.exports;
// Monthly KRW interest policy.
const Decimal = (commonJS ? require('decimal.js') : root.Decimal).clone({precision: 40, rounding: 4});

function createInterestCalculator() {
  const rates = new Map();
  return function interest(balance, annualRate) {
    if (!rates.has(annualRate)) {
      rates.set(annualRate, new Decimal(annualRate).div(100).plus(1)
        .pow(new Decimal(1).div(12)).minus(1));
    }
    return new Decimal(balance).times(rates.get(annualRate)).toDecimalPlaces(0).toNumber();
  };
}

const api = {createInterestCalculator};
if(commonJS) module.exports=api; else root.MoneyLifeInterest=api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
