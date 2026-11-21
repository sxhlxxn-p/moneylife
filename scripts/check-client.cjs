const { readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const source = path.resolve(__dirname, "../Client/src");
for (const name of readdirSync(source).filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(source, name)],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}

// Keep the HTML entry point and the server's public asset list in sync.
const {readFileSync, existsSync} = require('node:fs');
const assets = require('../Client/assets.json');
const project = path.resolve(__dirname, '..');
const html = readFileSync(path.join(project, 'Client/index.html'), 'utf8');
for (const [, url] of html.matchAll(/<script src="([^"]+)"/g)) {
  if (!assets['/' + url]) throw new Error('Unregistered client script: ' + url);
}
for (const file of Object.values(assets)) {
  if (!existsSync(path.join(project, file))) throw new Error('Missing client asset: ' + file);
}
