// Fixed stdin/stdout bridge. Author: sxhlxxn / Student ID: 202439688.
const {calculateSnapshot} = require('./snapshot.cjs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 250000) process.exit(1);
});
process.stdin.on('end', () => {
  try {
    const {state, months} = JSON.parse(input);
    if (!Number.isInteger(months) || months < 1 || months > 120) throw new Error('Invalid period');
    process.stdout.write(JSON.stringify(calculateSnapshot(state, months)));
  } catch {
    process.stderr.write('Calculation failed');
    process.exitCode = 1;
  }
});
