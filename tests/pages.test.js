// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The site's pages (the landing page, public/index.html, and every
// public/*/index.html but the app's) are plain HTML
// with no script, and say only what PROMISES.md quotes (rule 6): every
// heading and paragraph, and the title, stands there word for word, and no
// text stands outside them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fold = (s) => s.replace(/\s+/g, ' ').trim();
const promises = fold(fs.readFileSync(path.join(ROOT, 'PROMISES.md'), 'utf8'));
const text = (html) => fold(html.replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
const BLOCK = /<(title|h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g;

const pages = ['public/index.html', ...fs.readdirSync(path.join(ROOT, 'public'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'app' && fs.existsSync(path.join(ROOT, 'public', e.name, 'index.html')))
  .map((e) => `public/${e.name}/index.html`)];

test('pages › the site has its pages beside the app', () => {
  for (const p of ['public/index.html', 'public/privacy/index.html', 'public/licence/index.html', 'public/contact/index.html']) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), p);
  }
});

test('pages › every line of text on each page is quoted in PROMISES.md', () => {
  const missing = [];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const [, , inner] of html.matchAll(BLOCK)) {
      const t = text(inner);
      if (!promises.includes(t)) missing.push(`${p}: ${t}`);
    }
    const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/) || [, ''])[1];
    const loose = text(body.replace(BLOCK, ''));
    if (loose) missing.push(`${p}: text outside a heading or paragraph: ${loose}`);
  }
  assert.deepEqual(missing, []);
});

test('pages › no page carries a script', () => {
  assert.deepEqual(pages.filter((p) => /<script\b/i.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))), []);
});
