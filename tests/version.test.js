// The version is written once, in src/core/version.js (Ascham stays 1.x so
// existing 1.x licence keys keep working).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/core/version.js';
import * as Licence from '../src/core/licence-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('version › VERSION is a 1.x release number', () => {
  assert.match(VERSION, /^1\.\d+\.\d+$/);
  assert.equal(Licence.majorOf(VERSION), 1);
});

test('version › no other shipped file writes a version literal', () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|html|css)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'public'));
  const found = [];
  for (const f of files) {
    if (f === path.join(ROOT, 'src/core/version.js')) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/['"`]v?\d+\.\d+(\.\d+)?['"`]/.test(line)) found.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test('version › CHANGELOG.md starts with this version', () => {
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const top = log.match(/^## (\S+) — /m);
  assert.ok(top, 'CHANGELOG.md has a release heading');
  assert.equal(top[1], VERSION);
});
