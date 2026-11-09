// Fixed stdin/stdout bridge. Author: sxhlxxn / Student ID: 202439688.
const {calculateSnapshot} = require('./snapshot.cjs');
const {compareWithTrading} = require('./monthly-trading.cjs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 500000) process.exit(1);
});
process.stdin.on('end', () => {
  try {
    const {state, months, investment, mode} = JSON.parse(input);
    const minimum = mode === 'monthly-investment' ? 0 : 1;
    if (!Number.isInteger(months) || months < minimum || months > 120) throw new Error('Invalid period');
    if (mode === 'monthly-investment') process.stdout.write(JSON.stringify(compareWithTrading(state, investment, months)));
    else if (mode === undefined) process.stdout.write(JSON.stringify(calculateSnapshot(state, months)));
    else throw new Error('Unknown mode');
  } catch {
    process.stderr.write('Calculation failed');
    process.exitCode = 1;
  }
});
