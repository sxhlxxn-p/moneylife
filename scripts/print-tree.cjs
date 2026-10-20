const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const skipped = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);

function walk(directory, indent = '') {
  const entries = fs.readdirSync(directory, {withFileTypes: true})
    .filter(entry => !skipped.has(entry.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'ko');
    });

  for (const entry of entries) {
    console.log(`${indent}+---${entry.name}`);
    if (entry.isDirectory()) walk(path.join(directory, entry.name), `${indent}|   `);
  }
}

console.log(path.basename(root));
walk(root);
