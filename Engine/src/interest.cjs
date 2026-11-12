// Monthly KRW interest policy. Author: sxhlxxn.
const Decimal = require('decimal.js').clone({precision: 40, rounding: 4});

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

module.exports = {createInterestCalculator};
