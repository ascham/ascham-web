// Finds anything in a tree that the production issuer signed or could sign:
// a licence key whose signature verifies under licence-core.js's ISSUER, or
// a private JWK whose public half is ISSUER. Dev tooling only, never shipped;
// scripts/pre-publish.sh runs it.
//
//   node scripts/lib/real-keys.mjs DIR [ISSUER]
//
// Prints one line per finding and exits 1 if there is any, 0 if none. ISSUER
// defaults to the shipped key; passing the test-only public key is how the
// finder is shown to find, on tests/fixtures/licence/ (keys it signed).
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { ISSUER } from '../../src/core/licence-core.js';

const dir = process.argv[2];
const issuer = process.argv[3] || ISSUER;
if (!dir || !fs.existsSync(dir)) { console.log('usage: real-keys.mjs DIR [ISSUER]'); process.exit(2); }

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const pub = await crypto.subtle.importKey('raw', b64(issuer), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
// Any tag, so a key in an earlier format is found too.
const KEY = /\b[A-Za-z0-9]{1,16}\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/g;
const JWK = /"x"\s*:\s*"([A-Za-z0-9_-]+)"[\s\S]{0,200}?"y"\s*:\s*"([A-Za-z0-9_-]+)"/g;

function* files(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.isFile()) yield p;
  }
}

let found = 0;
const report = (line) => { console.log(line); found++; };
for (const f of files(dir)) {
  const rel = path.relative(dir, f);
  if (['.issuer-key.json', '.orders.jsonl', 'mint.js', 'mint.mjs'].includes(path.basename(f))) report(`${rel}: the issuer's private files are never in the tree`);
  // A key split across concatenated string literals is joined first.
  const text = fs.readFileSync(f, 'latin1').replace(/['"`]\s*\+\s*['"`]/g, '');
  for (const m of text.matchAll(KEY)) {
    if (m[2].length !== 86) continue; // a P-256 signature, 64 bytes
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64(m[2]), b64(m[1])).catch(() => false);
    if (ok) report(`${rel}: a key signed by the issuer: ${m[0].slice(0, 24)}…`);
  }
  for (const m of text.matchAll(JWK)) {
    const raw = Buffer.concat([Buffer.from([4]), b64(m[1]), b64(m[2])]);
    if (raw.equals(b64(issuer)) && /"d"\s*:/.test(text)) report(`${rel}: the issuer's private key`);
  }
}
process.exit(found ? 1 : 0);
