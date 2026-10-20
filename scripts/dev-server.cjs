const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const prototypeMode = process.argv.includes('--prototype');
const routes = new Map(prototypeMode ? [
  ['/', 'prototype/index.html'],
  ['/index.html', 'prototype/index.html'],
  ['/styles.css', 'prototype/styles.css'],
  ['/app.js', 'prototype/app.js'],
  ['/engine.js', 'prototype/engine.js']
] : [
  ['/', 'Client/index.html'],
  ['/index.html', 'Client/index.html'],
  ['/styles.css', 'Client/src/styles.css'],
  ['/app.js', 'Client/src/app.js'],
  ['/engine.js', 'Engine/src/index.js']
]);
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const relativePath = routes.get(pathname);
    if (!relativePath) { res.writeHead(404); return res.end('Not found'); }
    const file = path.resolve(projectRoot, relativePath);
    const data = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => {
  const target = prototypeMode ? 'prototype' : 'client';
  console.log(`Money Life (${target}): http://localhost:${port}`);
});
