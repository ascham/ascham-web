// Local dev server. Node built-ins only; never deployed.
//
//   node scripts/serve.mjs [port]          then open http://localhost:8000/
//   node scripts/serve.mjs [port] --dist   the built site (scripts/build.sh)
//   node scripts/serve.mjs [port] --root=DIR   a built site elsewhere (the
//                                          browser test's copy of dist/)
//
// Serves public/ and src/ from the repository root (the app loads
// ../../src/ui/main.js) and nothing else, on loopback only; with --dist, serves
// dist/ as its root, as the host will. Sends the headers in _headers, so the
// header-only CSP directives behave as on the host.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AT = (process.argv.find((a) => a.startsWith('--root=')) || '').slice('--root='.length);
const DIST = process.argv.includes('--dist') || Boolean(AT);
const PORT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 8000;
const BASE = AT ? path.resolve(AT) : DIST ? path.join(ROOT, 'dist') : ROOT;
const SERVED = DIST ? null : ['public', 'src'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

// The "/*" block of public/_headers: indented "Name: value" lines.
const HEADERS = {};
let inBlock = false;
for (const line of fs.readFileSync(path.join(DIST ? BASE : path.join(ROOT, 'public'), '_headers'), 'utf8').split('\n')) {
  if (/^\S/.test(line)) inBlock = line.trim() === '/*';
  else if (inBlock && line.includes(':')) {
    const at = line.indexOf(':');
    HEADERS[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' && !DIST) {
    res.writeHead(302, { Location: '/public/' });
    return res.end();
  }
  let file = path.normalize(path.join(BASE, decodeURIComponent(url.pathname)));
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  const top = path.relative(BASE, file).split(path.sep)[0];
  if (!file.startsWith(BASE + path.sep) || (SERVED && !SERVED.includes(top))
      || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, HEADERS);
    return res.end('not found');
  }
  res.writeHead(200, {
    ...HEADERS,
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`http://localhost:${PORT}/  (${DIST ? 'dist/' : 'public/ and src/ only'})`);
});
