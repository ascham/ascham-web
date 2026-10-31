// Promise 3 (PROMISES.md): we store nothing; settings and the licence key stay
// in this browser. store.js is the one door to browser storage and holds two
// keys. The marker test runs the page's own pipeline over a passage carrying a
// marker and holds every browser store to never having seen it; the project
// file is the only place the passage may go.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, KEYS } from '../src/core/store.js';
import * as Settings from '../src/core/settings-core.js';
import * as Licence from '../src/core/licence-core.js';
import { analyse } from '../src/ui/pipeline.js';
import * as Pro from '../src/ui/pro.js';
import { csvFile, projectFile } from '../src/ui/files.js';
import * as Project from '../src/ui/project.js';
import * as Sheet from '../src/ui/worksheet.js';

// A Storage that remembers every write, for localStorage and sessionStorage.
function recordingStorage() {
  const m = new Map();
  const writes = [];
  return {
    writes,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { writes.push([String(k), String(v)]); m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

// Anything touching these at all is a failure: nothing here may use them.
function tripwire(name, touched) {
  return new Proxy({}, { get(_, p) { touched.push(`${name}.${String(p)}`); return () => ({}); } });
}

function install() {
  const touched = [];
  const local = recordingStorage();
  const session = recordingStorage();
  const cookies = [];
  const set = (name, value) => Object.defineProperty(globalThis, name,
    { value, configurable: true, writable: true });
  set('localStorage', local);
  set('sessionStorage', session);
  set('indexedDB', tripwire('indexedDB', touched));
  set('caches', tripwire('caches', touched));
  set('cookieStore', tripwire('cookieStore', touched));
  set('document', { set cookie(v) { cookies.push(String(v)); }, get cookie() { return cookies.join('; '); } });
  // Every value any store holds or was handed, as one string to search.
  const everything = () => [
    ...local.writes.flat(), ...session.writes.flat(), ...cookies, ...touched
  ].join('\n');
  return { local, session, cookies, touched, everything };
}

function uninstall() {
  for (const n of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'document']) {
    delete globalThis[n];
  }
}

// ---- the door ---------------------------------------------------------------

test('store › exactly two keys: the settings blob and the licence key', () => {
  assert.deepEqual([...KEYS].sort(), [Licence.STORE, Settings.STORE].sort());
  assert.equal(KEYS.length, 2);
  assert.ok(Object.isFrozen(KEYS));
});

test('store › any other key is refused, read or write', () => {
  const env = install();
  try {
    assert.throws(() => store.setItem('ascham.passage', 'x'), /not a key this app keeps/);
    assert.throws(() => store.getItem('ascham.passage'), /not a key this app keeps/);
    assert.throws(() => store.removeItem('anything'), /not a key this app keeps/);
    assert.deepEqual(env.local.writes, []);
  } finally { uninstall(); }
});

test('store › the two keys round-trip through localStorage', () => {
  const env = install();
  try {
    assert.ok(Settings.write({ tier: Settings.TIERS.OFF, terms: ['ministry'] }, store));
    assert.deepEqual(Settings.read(store).terms, ['ministry']);
    assert.ok(Licence.keep('not-a-real-key', store));
    assert.equal(Licence.held(store), 'not-a-real-key');
    assert.deepEqual(env.local.writes.map(([k]) => k).sort(), [Licence.STORE, Settings.STORE].sort());
    assert.deepEqual(env.session.writes, []);
  } finally { uninstall(); }
});

test('store › with storage blocked, reads are empty and the harvest still runs', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new Error('SecurityError'); }
  });
  try {
    assert.equal(store.getItem(Settings.STORE), null);
    assert.throws(() => store.setItem(Settings.STORE, '{}'), /unavailable/);
    assert.equal(Settings.write({}, store), false);
    assert.equal(Licence.held(store), '');
    assert.equal(analyse({ raw: 'The ombudsman investigated the allegations thoroughly.' }).state, 'cards');
  } finally { delete globalThis.localStorage; }
});

// ---- the marker -------------------------------------------------------------

// Invented words, so they are band 5 and certain to become cards: the marker
// demonstrably went all the way through the pipeline.
const MARKER = 'Zorblaxian';
const PASSAGE = `Quarterly Report\n\nThe ${MARKER} committee published its findings. ` +
  `Critics said the ${MARKER.toLowerCase()} proposals were opaque and unworkable.\n` +
  `A spokesperson for the ${MARKER} panel declined to comment on the vexatious claims.`;

test('store › the marker test can see a marker when one is written', () => {
  // The control: without it, an empty result below could mean a blind search.
  const env = install();
  try {
    store.setItem(Settings.STORE, JSON.stringify({ note: PASSAGE }));
    assert.match(env.everything(), new RegExp(MARKER, 'i'));
  } finally { uninstall(); }
});

test('store › a harvest never puts the passage in any browser store', async () => {
  const env = install();
  try {
    // Settings and a key are held, as for a real teacher, so both stores are
    // live while the passage goes through.
    Settings.write({ tier: Settings.TIERS.YOUNG, terms: ['ministry'] }, store);
    Licence.keep('ASCHAM-not-a-valid-key', store);
    const paid = await Pro.paid({ subtle: globalThis.crypto && globalThis.crypto.subtle });
    assert.equal(paid, false);

    const runs = [
      { raw: PASSAGE },
      { raw: PASSAGE, keepLineBreaks: false },
      { raw: PASSAGE, start: PASSAGE.indexOf('Critics'), end: PASSAGE.length },
      { raw: `  ${PASSAGE}\r\n`, start: 3, end: 3, paid: true }
    ];
    let carded = 0;
    for (const run of runs) {
      const result = analyse(run);
      assert.equal(result.state, 'cards');
      if (result.cards.some((c) => c.word.toLowerCase() === MARKER.toLowerCase())) carded++;
    }
    assert.equal(carded, runs.length, 'the marker did not become a card, so the test proves nothing');

    const seen = env.everything();
    assert.doesNotMatch(seen, new RegExp(MARKER, 'i'));
    assert.doesNotMatch(seen, /committee|spokesperson|vexatious/i);
    assert.deepEqual(env.touched, []);
    assert.deepEqual(env.cookies, []);
    assert.deepEqual(env.session.writes, []);
    // The only writes are the two this test made itself.
    assert.deepEqual(env.local.writes.map(([k]) => k), [Settings.STORE, Licence.STORE]);
  } finally { uninstall(); }
});

// The files the teacher can save. The passage carries a second marker in a
// paragraph outside the selection: it is in the passage, so it must reach the
// project file, and it is in no card, so it must reach nothing else.
const OUTSIDE = 'Quuxberian';
const ASKED = 'Zorvathine';
const WITH_OUTSIDE = `${PASSAGE}\n\nThe ${OUTSIDE} delegation's memorandum was circulated.`;

test('store › the project file is the only place the passage goes', () => {
  const env = install();
  try {
    Settings.write({ tier: Settings.TIERS.YOUNG, terms: [] }, store);
    const selection = { from: 0, to: PASSAGE.length };
    const r = analyse({ raw: WITH_OUTSIDE, start: selection.from, end: selection.to });
    assert.equal(r.state, 'cards');
    assert.ok(r.cards.some((c) => c.word.toLowerCase() === MARKER.toLowerCase()));
    const keep = r.cards.map(() => true);
    const fields = { cards: r.cards, keep, title: 'Quarterly', source: '' };

    // As main.js does: both files and the worksheet are built from the whole
    // deck, with the teacher's questions (a marker of their own).
    const questions = { before: [`Who is ${ASKED}?`], while: [], after: [] };
    const whole = { ...fields, text: WITH_OUTSIDE, lineBreaks: true, selection, questions,
      worksheet: { fullText: true, answerKey: true } };
    const sheet = Sheet.build({ ...whole, options: whole.worksheet });
    assert.ok(sheet.items.length > 0 && sheet.paragraphs.join('\n').includes(OUTSIDE));
    const project = projectFile(whole);
    const opened = Project.parse(project.text);
    assert.equal(opened.ok, true);
    assert.equal(opened.project.text, WITH_OUTSIDE, 'the project file holds the passage exactly');
    assert.match(project.text, new RegExp(OUTSIDE));
    assert.deepEqual(opened.project.questions, questions, 'and the questions');

    const csv = csvFile(whole).text;
    assert.match(csv, new RegExp(MARKER), 'the CSV holds the marker card, or this test proves nothing');
    assert.doesNotMatch(csv, new RegExp(`${OUTSIDE}|${ASKED}`), 'the CSV holds only card sentences');

    const seen = env.everything();
    assert.doesNotMatch(seen, new RegExp(`${MARKER}|${OUTSIDE}|${ASKED}`, 'i'));
    assert.deepEqual(env.local.writes.map(([k]) => k), [Settings.STORE]);
    assert.deepEqual(env.session.writes, []);
    assert.deepEqual(env.touched, []);
    assert.deepEqual(env.cookies, []);
  } finally { uninstall(); }
});

// Promise 5: the key is never sent anywhere, so with a valid key held, as for
// a paying teacher, neither file carries any part of it. The key names a
// buyer, so a leak of the payload would show its reference too.
test('store › with a key held, neither file carries any part of it', async () => {
  const fix = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/licence');
  const key = JSON.parse(fs.readFileSync(path.join(fix, 'keys.json'), 'utf8')).namedBuyer;
  const issuer = JSON.parse(fs.readFileSync(path.join(fix, 'TEST-ONLY-issuer.json'), 'utf8')).public;
  const env = install();
  try {
    const ENV = { subtle: globalThis.crypto.subtle, issuer };
    assert.equal((await Pro.enterKey(key, ENV)).ok, true);
    assert.equal(await Pro.paid(ENV), true, 'the key does not unlock Pro, so this test proves nothing');
    assert.equal(Licence.held(store), key);

    const r = analyse({ raw: PASSAGE });
    const deck = { cards: r.cards, keep: r.cards.map(() => true), title: 'Quarterly', source: '',
      text: PASSAGE, lineBreaks: true, selection: { from: 0, to: PASSAGE.length },
      questions: { before: [], while: [], after: [] }, worksheet: { fullText: true, answerKey: true } };
    const files = [(await Pro.csvFile(deck, ENV)).text, projectFile(deck).text];
    assert.match(files[0], new RegExp(MARKER), 'the CSV holds the deck, or this test proves nothing');
    const [tag, payload, signature] = key.split('.');
    for (const text of files) {
      for (const part of [tag, payload, signature, 'example-buyer']) assert.ok(!text.includes(part), part);
    }
  } finally { uninstall(); }
});
