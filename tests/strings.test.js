// Wording in one place (src/ui/strings.js, check.sh U1): the page's keys and
// the strings agree both ways, and the <title> is the app name, brand.js's
// NAME, written into the page (check.sh B1's one exemption).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/ui/strings.js';
import { NAME, SLUG } from '../src/core/brand.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'public/app/index.html'), 'utf8');
const keys = [...html.matchAll(/\bdata-s="([^"]*)"/g)].map((m) => m[1]);

test('strings › every data-s key in index.html has a string', () => {
  const missing = keys.filter((k) => typeof S.PAGE[k] !== 'string' || !S.PAGE[k]);
  assert.deepEqual(missing, []);
});
test('strings › every page string is used by index.html or the UI code', () => {
  const ui = fs.readdirSync(path.join(ROOT, 'src/ui'))
    .filter((f) => f.endsWith('.js') && f !== 'strings.js')
    .map((f) => fs.readFileSync(path.join(ROOT, 'src/ui', f), 'utf8')).join('\n');
  const unused = Object.keys(S.PAGE).filter((k) => !keys.includes(k) && !ui.includes(`'${k}'`));
  assert.deepEqual(unused, []);
});
test('strings › the <title> is the app name, from brand.js', () => {
  assert.equal((html.match(/<title>([^<]*)<\/title>/) || [])[1], NAME);
  assert.equal(S.PAGE.appName, NAME);
});
test('strings › the slug is safe as a file name, an Anki tag and a storage key', () => {
  assert.match(SLUG, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});
// The wording in PROMISES.md § The licence and the name.
const fold = (t) => t.replace(/\s+/g, ' ');
const readme = fold(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));
test('strings › the page footer and README say the app is independent, in the same words', () => {
  assert.equal(S.PAGE.independent,
    'Ascham is independent and not affiliated with any school, publisher or institution.');
  assert.match(html, /<footer>\s*<p class="note" data-s="independent"><\/p>\s*<p class="note" data-s="licenceLine"><\/p>\s*<\/footer>/);
  assert.ok(readme.includes(S.PAGE.independent));
});
test('strings › the page footer and README give the licence in the one sentence check.sh allows', () => {
  const check = fs.readFileSync(path.join(ROOT, 'scripts/check.sh'), 'utf8');
  const sentence = check.match(/^LICENCE_LINE="([^"]+)"$/m)[1];
  assert.equal(sentence, 'Open source under the GNU AGPL, version 3: anyone can read, build, verify ' +
    'and change the code, and share changes under the same licence.');
  assert.ok(readme.includes(sentence));
  assert.equal(S.PAGE.licenceLine, sentence);
  assert.match(html, /<footer>[\s\S]*data-s="licenceLine"[\s\S]*<\/footer>/);
});
test('strings › every project refusal code has a line', () => {
  for (const code of ['too-big', 'not-json', 'not-project', 'newer', 'bad-shape', 'bad-selection']) {
    assert.ok(Object.values(S.MESSAGES).includes(S.projectRefused(code)), code);
  }
  assert.equal(S.projectRefused('anything else'), S.MESSAGES.DAMAGED);
});
test('strings › the small wording functions', () => {
  assert.equal(S.tally(3, 7), '3 of 7 selected');
  assert.equal(S.setAsideTally(4), '4 set aside');
  assert.equal(S.keepWord('ombudsman'), 'Keep ombudsman');
  assert.equal(S.level('B2'), '~B2');
  assert.equal(S.wordList(['a', 'b']), 'a, b');
  assert.equal(S.tooLongToSave(500000), 'This text is longer than 500,000 characters, too long to save as a project.');
});
test('strings › free-mode wording never says the word is bold: bold is Pro', () => {
  assert.doesNotMatch(S.basicWhy(false), /bold/i);
  assert.doesNotMatch(S.basicWhy(undefined), /bold/i);
  assert.match(S.basicWhy(true), /in bold/);
  // Nothing else on the page, shown free or paid, mentions bold either.
  const said = Object.values(S.PAGE).filter((v) => /bold/i.test(v));
  assert.deepEqual(said, []);
});
test('strings › every licence verdict has a line in plain words', async () => {
  const { REASONS } = await import('../src/core/licence-core.js');
  for (const reason of [...Object.values(REASONS), 'environment']) {
    const line = S.licenceSaid({ ok: false, reason, claim: reason === 'ceiling' ? { max: 0 } : null }, 1);
    assert.ok(typeof line === 'string' && line.length > 10, reason);
  }
  assert.equal(S.licenceSaid({ ok: false, reason: 'missing' }, 1), S.LICENCE.missing);
  assert.equal(S.licenceSaid({ ok: true, claim: { buyer: '' } }, 1), 'Pro is unlocked for Ascham 1.');
  assert.equal(S.licenceSaid({ ok: true, claim: { buyer: 'example-buyer' } }, 1), 'Pro is unlocked for Ascham 1.', 'the buyer field is never shown');
  assert.match(S.licenceSaid({ ok: false, reason: 'ceiling', claim: { max: 0 } }, 1), /bought for Ascham 0/);
});
