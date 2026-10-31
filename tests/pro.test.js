// Pro (src/ui/pro.js), held where each action runs: every Pro action is
// called directly, never through the page, under every licence state. No
// key, a forged key, a genuine key whose ceiling 1.x is past, a malformed
// key, and a test key checked against the shipped public key all unlock
// nothing; a valid key (test-signed, checked against the test public key)
// unlocks each one. PROMISES.md § What is free.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Pro from '../src/ui/pro.js';
import * as Settings from '../src/core/settings-core.js';
import * as Licence from '../src/core/licence-core.js';
import * as Sheet from '../src/ui/worksheet.js';
import { analyse } from '../src/ui/pipeline.js';
import { store } from '../src/core/store.js';
import { VERSION } from '../src/core/version.js';
import { parseCsv } from './lib/rfc4180.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/licence');
const KEYS = JSON.parse(fs.readFileSync(path.join(FIX, 'keys.json'), 'utf8'));
const TEST_ISSUER = JSON.parse(fs.readFileSync(path.join(FIX, 'TEST-ONLY-issuer.json'), 'utf8')).public;
const subtle = globalThis.crypto.subtle;
const ENV = { subtle, issuer: TEST_ISSUER };

// A fresh localStorage for each case, recording every write.
function install() {
  const m = new Map();
  const writes = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { writes.push(k); m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); }
    }
  });
  return { writes };
}
const uninstall = () => { delete globalThis.localStorage; };

// What a Pro teacher has saved: every Pro setting away from the free floor.
const PRO_SETTINGS = { tier: Settings.TIERS.OFF, terms: ['ombudsman'], cloze: true, tag: 'Year 9 autumn' };
// "ombudsman" is the teacher's own blocked word; "bollocks" cards only with
// the filter off.
const PASSAGE = 'The ombudsman called the bollocks reply crass, opaque and entrenched, said the tribunal.';

// Each licence state: what is held, and the env it is checked under.
const REFUSED = {
  'no key': { key: '', env: ENV },
  'a forged key': { key: KEYS.forged, env: ENV },
  'a genuine key bought for an earlier major (0.x)': { key: KEYS.ceilingZero, env: ENV },
  'a malformed key': { key: KEYS.malformed, env: ENV },
  'a test key checked against the shipped public key': { key: KEYS.valid1, env: { subtle } },
  'a valid key with no WebCrypto': { key: KEYS.valid1, env: { issuer: TEST_ISSUER } }
};
const VALID = { key: KEYS.valid1, env: ENV };

// Sets up a state with the Pro settings already stored, as a teacher whose
// key was removed or edited would have them.
function holding(state) {
  const env = install();
  Settings.write(PRO_SETTINGS, store);
  if (state.key) Licence.keep(state.key, store);
  return env;
}

async function deckOf(state) {
  const r = await Pro.readText({ raw: PASSAGE, keepLineBreaks: true }, state.env);
  assert.equal(r.state, 'cards');
  return r.cards;
}

async function csvOf(state) {
  const cards = await deckOf(state);
  // The first card asks for Basic, the second for cloze, the rest follow the deck.
  const styles = [false, true];
  const file = await Pro.csvFile({ cards, keep: cards.map(() => true), title: 'Reading', source: '', styles }, state.env, 0);
  return { cards, text: file.text, records: parseCsv(file.text.replace(/^﻿/, '')) };
}

// A whole worksheet's input from the news fixture: every card ticked, the
// full text and the key asked for, a question in each section.
const NEWS = fs.readFileSync(path.join(FIX, '../paste/nasa.chrome.txt'), 'utf8');
const NEWS_DECK = analyse({ raw: NEWS, start: 0, end: 0, keepLineBreaks: true });
const SHEET_INPUT = {
  cards: NEWS_DECK.cards, keep: NEWS_DECK.cards.map(() => true), text: NEWS, lineBreaks: true,
  title: 'Reading', source: 'NASA',
  questions: { before: ['What is Titan?'], while: ['Why fly?'], after: ['Would you go?'] },
  options: { fullText: true, answerKey: true }
};
const WHOLE = Sheet.build(SHEET_INPUT);
const gapsOf = (sheet) => sheet.items.flatMap((it) => it.parts.filter((p) => typeof p !== 'string'));

test('pro › the news fixture gives a whole sheet longer than the sample, with everything the sample leaves out', () => {
  assert.ok(WHOLE.items.length > Pro.SAMPLE_ITEMS, WHOLE.items.length);
  assert.ok(WHOLE.key.length > 0 && WHOLE.paragraphs.length > 0 && WHOLE.questions.before.length === 1);
});

for (const [name, state] of Object.entries(REFUSED)) {
  test(`pro › ${name}: the licence says no`, async () => {
    holding(state);
    try {
      assert.equal(await Pro.paid(state.env), false);
    } finally { uninstall(); }
  });

  test(`pro › ${name}: reading the text ignores the filter level and own blocked words`, async () => {
    holding(state);
    try {
      const words = (await deckOf(state)).map((c) => c.word);
      assert.ok(words.includes('ombudsman'), words.join(' '));
      assert.ok(!words.includes('bollocks'), words.join(' '));
    } finally { uninstall(); }
  });

  test(`pro › ${name}: the CSV is the free Basic deck: no markup, no cloze, no own tag`, async () => {
    holding(state);
    try {
      const { text, records } = await csvOf(state);
      assert.ok(text.includes('#html:false'), text.slice(0, 200));
      assert.doesNotMatch(text, /\{\{c1::|<b>|#notetype column|Year-9-autumn/);
      assert.equal(records.find((r) => r[0].startsWith('#tags:'))[0], '#tags:ascham Reading');
    } finally { uninstall(); }
  });

  test(`pro › ${name}: the sheet on screen is the sample: 3 items, their words only, no full text, questions or key`, async () => {
    holding(state);
    try {
      const shown = await Pro.sheet(SHEET_INPUT, state.env);
      assert.equal(shown.sample, true);
      assert.equal(shown.items.length, Pro.SAMPLE_ITEMS);
      const sentence = (it) => it.parts.map((p) => (typeof p === 'string' ? p : p.answer)).join('');
      assert.deepEqual(shown.items.map(sentence), WHOLE.items.slice(0, Pro.SAMPLE_ITEMS).map(sentence));
      const lower = (list) => new Set(list.map((w) => w.toLowerCase()));
      assert.deepEqual(lower(shown.bank), lower(gapsOf(shown).map((g) => g.answer)));
      assert.ok(shown.bank.length < WHOLE.bank.length, `${shown.bank.length} of ${WHOLE.bank.length}`);
      assert.equal(shown.paragraphs, null);
      assert.deepEqual(shown.questions, Sheet.emptyQuestions());
      assert.equal(shown.key, null);
    } finally { uninstall(); }
  });

  test(`pro › ${name}: printing the worksheet refuses and never prints`, async () => {
    holding(state);
    try {
      let printed = 0;
      const said = await Pro.printSheet({ input: SHEET_INPUT, print: () => { printed++; } }, state.env);
      assert.equal(said, 'pro');
      assert.equal(printed, 0);
    } finally { uninstall(); }
  });

  test(`pro › ${name}: saving settings refuses and writes nothing`, async () => {
    const env = holding(state);
    try {
      const before = env.writes.length;
      assert.equal(await Pro.saveSettings({ ...PRO_SETTINGS, tag: 'other' }, state.env), 'pro');
      assert.equal(env.writes.length, before);
      assert.deepEqual(await Pro.settingsShown(state.env), Settings.effective({}, false));
    } finally { uninstall(); }
  });
}

test('pro › a valid key: the licence says yes', async () => {
  holding(VALID);
  try {
    assert.equal(await Pro.paid(VALID.env), true);
  } finally { uninstall(); }
});

test('pro › a valid key: reading the text uses the filter level and own blocked words', async () => {
  holding(VALID);
  try {
    const words = (await deckOf(VALID)).map((c) => c.word);
    assert.ok(!words.includes('ombudsman'), words.join(' '));
    assert.ok(words.includes('bollocks'), words.join(' '));
  } finally { uninstall(); }
});

test('pro › a valid key: the CSV has the bold word, cloze, a mixed deck and the own tag', async () => {
  holding(VALID);
  try {
    const { cards, text, records } = await csvOf(VALID);
    assert.ok(text.includes('#html:true'));
    assert.equal(records.find((r) => r[0].startsWith('#tags:'))[0], '#tags:ascham Year-9-autumn');
    const rows = records.filter((r) => !r[0].startsWith('#'));
    assert.equal(rows.length, cards.length);
    // Mixed: a column names each note's type. Card 1 asked for Basic, the rest are cloze.
    assert.deepEqual(rows.map((r) => r[0]), cards.map((_, i) => (i === 0 ? 'Basic' : 'Cloze')));
    assert.match(rows[0].join(' '), /<b>/);
    assert.ok(rows.slice(1).every((r) => r.join(' ').includes('{{c1::')), JSON.stringify(rows));
  } finally { uninstall(); }
});

test('pro › a valid key: the sheet on screen is the whole sheet', async () => {
  holding(VALID);
  try {
    assert.deepEqual(await Pro.sheet(SHEET_INPUT, VALID.env), WHOLE);
  } finally { uninstall(); }
});

test('pro › a valid key: printing the worksheet prints the whole sheet', async () => {
  holding(VALID);
  try {
    const printed = [];
    assert.equal(await Pro.printSheet({ input: SHEET_INPUT, print: (m) => { printed.push(m); } }, VALID.env), 'printed');
    assert.deepEqual(printed, [WHOLE]);
    assert.equal(await Pro.printSheet({ input: { ...SHEET_INPUT, keep: [] }, print: (m) => { printed.push(m); } }, VALID.env), 'no-worksheet');
    assert.equal(printed.length, 1);
  } finally { uninstall(); }
});

test('pro › a valid key: saving settings saves them, and the panel shows them', async () => {
  holding(VALID);
  try {
    const next = { tier: Settings.TIERS.YOUNG, terms: ['tribunal'], cloze: false, tag: 'Year 10' };
    assert.equal(await Pro.saveSettings(next, VALID.env), 'saved');
    assert.deepEqual(await Pro.settingsShown(VALID.env), Settings.coerce(next));
  } finally { uninstall(); }
});

test('pro › entering a key: a refused key is never kept, a valid one is, and Remove key removes it', async () => {
  const env = install();
  try {
    for (const key of [KEYS.forged, KEYS.ceilingZero, KEYS.malformed, '']) {
      const said = await Pro.enterKey(key, ENV);
      assert.equal(said.ok, false, key);
    }
    assert.equal((await Pro.enterKey(KEYS.forged, ENV)).reason, Licence.REASONS.SIGNATURE);
    assert.equal((await Pro.enterKey(KEYS.ceilingZero, ENV)).reason, Licence.REASONS.CEILING);
    assert.equal((await Pro.enterKey(KEYS.malformed, ENV)).reason, Licence.REASONS.SHAPE);
    assert.deepEqual(env.writes, []);
    const said = await Pro.enterKey(`  ${KEYS.valid1}\n`, ENV);
    assert.equal(said.ok, true);
    assert.equal(said.kept, true);
    assert.equal(Licence.held(store), KEYS.valid1);
    assert.equal(await Pro.paid(ENV), true);
    assert.ok(Pro.removeKey());
    assert.equal(Licence.held(store), '');
    assert.equal(await Pro.paid(ENV), false);
  } finally { uninstall(); }
});

test('pro › the page\'s own call, with no public key named, checks against the shipped one', async () => {
  holding(VALID);
  try {
    assert.equal((await Pro.verdict({ subtle })).reason, Licence.REASONS.SIGNATURE);
    assert.equal((await Pro.verdict({ subtle, issuer: Licence.ISSUER })).reason, Licence.REASONS.SIGNATURE);
  } finally { uninstall(); }
});

// The tag: ASCH1 is the only one. A key signed now in that format
// unlocks this major version and no later one, and the same signed payload
// under the tag used before the rename is refused before any signature check.
async function signedNow(tag) {
  const pair = JSON.parse(fs.readFileSync(path.join(FIX, 'TEST-ONLY-issuer.json'), 'utf8'));
  const signer = await subtle.importKey('jwk', pair.private, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const payload = Buffer.from(JSON.stringify({ v: 1, max: 1, buyer: '' }));
  const signature = Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, payload));
  return `${tag}.${payload.toString('base64url')}.${signature.toString('base64url')}`;
}

test('pro › an ASCH1 key signed now unlocks this major version', async () => {
  const key = await signedNow('ASCH1');
  assert.equal(Licence.TAG, 'ASCH1');
  assert.match(VERSION, /^1\./);
  for (const running of [VERSION, '1.0.0', '1.99.99']) {
    assert.equal((await Licence.verify(key, running, subtle, TEST_ISSUER)).ok, true, running);
  }
  assert.equal((await Licence.verify(key, '2.0.0', subtle, TEST_ISSUER)).reason, Licence.REASONS.CEILING);
  assert.equal((await Licence.verify(key, VERSION, subtle, Licence.ISSUER)).reason, Licence.REASONS.SIGNATURE);
  holding({ key, env: ENV });
  try {
    assert.equal(await Pro.paid(ENV), true);
  } finally { uninstall(); }
});

async function refused(tag) {
  const key = await signedNow(tag);
  assert.equal((await Licence.verify(key, VERSION, subtle, TEST_ISSUER)).reason, Licence.REASONS.SHAPE, tag);
  assert.equal((await Pro.enterKey(key, ENV)).ok, false, tag);
  holding({ key, env: ENV });
  try {
    assert.equal(await Pro.paid(ENV), false, tag);
  } finally { uninstall(); }
}

test('pro › a key under any other tag is refused', async () => {
  for (const tag of ['ASCH2', 'ASCH0', 'asch1', 'ASCH', 'ZZZZ1']) await refused(tag);
});

// The tag used before the rename is never spelt here: it is read from the
// private retired-term list (scripts/lib/retired.sh), so the case runs only
// in the owner's checkout and is skipped anywhere else. The owner's checkout
// is told as retired.sh tells it; there a list with no tag line fails, so the
// case cannot skip itself.
const GIT_INFO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.git/info');
const lines = (f) => (fs.existsSync(path.join(GIT_INFO, f)) ? fs.readFileSync(path.join(GIT_INFO, f), 'utf8').split('\n') : []);
const ownersCheckout = lines('exclude').some((l) => !/^\s*(#|$)/.test(l));
const retiredTags = lines('retired').map((l) => l.trim().split(/\s+/)).filter(([k]) => k === 'tag').map(([, w]) => w);
test('pro › a key with the tag used before the rename is refused',
  { skip: ownersCheckout ? false : 'no retired-term list here (not the owner\'s checkout)' }, async () => {
    assert.ok(retiredTags.length, '.git/info/retired holds no tag line');
    for (const tag of retiredTags) await refused(tag);
  });
