const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5173);
const apiUrl = new URL(process.env.API_BASE_URL || 'http://127.0.0.1:3000');
if (apiUrl.protocol !== 'http:') throw new Error('Local API_BASE_URL must use http');
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
  ['/plan-state.js', 'Client/src/plan-state.js'],
  ['/server-plans.js', 'Client/src/server-plans.js'],
  ['/engine.js', 'Engine/src/index.js']
]);
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (!prototypeMode && req.url.startsWith('/api/')) {
      // Same-origin proxy keeps guest cookies out of browser API configuration.
      const upstream = http.request({
        hostname: apiUrl.hostname,
        port: apiUrl.port || 80,
        method: req.method,
        path: req.url.slice(4),
        headers: {...req.headers, host: apiUrl.host}
      }, reply => {
        res.writeHead(reply.statusCode, {...reply.headers, 'cache-control': 'no-store'});
        reply.pipe(res);
      });
      upstream.setTimeout(15000, () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(503, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({detail: 'API_UNAVAILABLE'}));
      });
      req.pipe(upstream);
      return;
    }
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
