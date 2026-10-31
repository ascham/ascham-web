// The project file (src/ui/project.js): it round-trips exactly, and opening
// is strict — anything not exactly the format is refused with a code.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/ui/project.js';
import { VERSION } from '../src/core/version.js';
import { LIMIT } from '../src/ui/pipeline.js';
import * as W from '../src/ui/worksheet.js';

const STATE = {
  title: 'Nord Stream — the trial',
  source: 'BBC News, 10 October 2026',
  text: 'Héllo “world”.\r\n\r\nThe ombudsman investigated <b>thoroughly</b>. {"x":1}',
  lineBreaks: false,
  selection: { from: 3, to: 40 },
  unticked: ['ombudsman', 'thoroughly'],
  questions: { before: ['What do you know about <gas pipelines>?'], while: [], after: ['Who gains?', 'Who loses?'] },
  worksheet: { fullText: true, answerKey: false }
};
const good = () => JSON.parse(P.serialise(STATE));
const opens = (obj) => P.parse(typeof obj === 'string' ? obj : JSON.stringify(obj));
const refused = (obj, code) => {
  const r = opens(obj);
  assert.equal(r.ok, false, JSON.stringify(obj).slice(0, 200));
  assert.equal(r.code, code);
};

test('project › the file holds exactly the format, and no cards', () => {
  const p = good();
  assert.deepEqual(Object.keys(p), ['format', 'version', 'appVersion', 'title', 'source',
    'text', 'lineBreaks', 'selection', 'unticked', 'questions', 'worksheet']);
  assert.equal(p.format, 'ascham-project');
  assert.equal(p.version, 2);
  assert.equal(p.appVersion, VERSION);
  assert.ok(P.serialise(STATE).endsWith('}\n'));
});
test('project › save then open gives back exactly what was saved', () => {
  const r = P.parse(P.serialise(STATE));
  assert.equal(r.ok, true);
  assert.deepEqual(r.project, { appVersion: VERSION, ...STATE });
});
test('project › round trip holds for awkward text', () => {
  for (const text of ['', ' ', '\u0000\u001f\u007f', '😀 emoji', '\ud800 lone', '"\\/\b\f\n\r\t', 'x'.repeat(P.MAX_TEXT)]) {
    const st = { ...STATE, text, selection: { from: 0, to: text.length } };
    const r = P.parse(P.serialise(st));
    assert.equal(r.ok, true, JSON.stringify(text).slice(0, 40));
    assert.equal(r.project.text, text);
  }
});
test('project › the longest legal text, all control characters, still fits the size cap', () => {
  const text = '\u0001'.repeat(P.MAX_TEXT);
  const file = P.serialise({ ...STATE, title: 't'.repeat(P.MAX_LINE), source: 's'.repeat(P.MAX_LINE),
    text, selection: { from: 0, to: text.length },
    unticked: Array.from({ length: LIMIT }, (_, i) => `${'w'.repeat(P.MAX_WORD - 3)}${i}`),
    questions: Object.fromEntries(W.SECTIONS.map((k) => [k, Array(W.MAX_QUESTIONS).fill('\u0002'.repeat(W.MAX_QUESTION))])) });
  assert.ok(Buffer.byteLength(file) <= P.MAX_FILE_BYTES, Buffer.byteLength(file));
  assert.equal(P.parse(file).ok, true);
});
test('project › a byte order mark from an editor is tolerated', () => {
  assert.equal(P.parse(`﻿${P.serialise(STATE)}`).ok, true);
});

// ---- hostile files ----------------------------------------------------------

test('project › not JSON, or not a project', () => {
  refused('', 'not-json');
  refused('<html><script>alert(1)</script></html>', 'not-json');
  refused('{"format":"ascham-project",', 'not-json');
  refused(null, 'not-project');
  refused([], 'not-project');
  refused('"ascham-project"', 'not-project');
  refused({ ...good(), format: 'ascham-deck' }, 'not-project');
  refused({ ...good(), format: 'Ascham-project' }, 'not-project');
  const { format, ...noFormat } = good();
  refused(noFormat, 'not-project');
  assert.equal(P.parse(undefined).code, 'not-project');
});
test('project › a newer format says so', () => {
  refused({ ...good(), version: 3, cards: [] }, 'newer');
});
test('project › a version 1 file still opens, with no questions and the default options', () => {
  const { questions, worksheet, ...v1 } = good();
  const r = opens({ ...v1, version: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.project.questions, W.emptyQuestions());
  assert.deepEqual(r.project.worksheet, { fullText: false, answerKey: true });
  assert.equal(r.project.text, STATE.text);
  refused({ ...v1, version: 1, questions }, 'bad-shape');
  refused({ ...v1, version: 2 }, 'bad-shape');
});
test('project › a wrong version is damaged', () => {
  for (const version of [0, '1', 1.5, null]) refused({ ...good(), version }, 'bad-shape');
});
test('project › extra or missing keys are refused', () => {
  refused({ ...good(), cards: [{ word: 'forged', sentence: { text: 'Not in the text.' } }] }, 'bad-shape');
  refused({ ...good(), html: '<img src=x onerror=alert(1)>' }, 'bad-shape');
  refused(`${P.serialise(STATE).slice(0, -2)},"__proto__":{"polluted":true}}`, 'bad-shape');
  assert.equal(({}).polluted, undefined);
  for (const key of ['appVersion', 'title', 'source', 'text', 'lineBreaks', 'selection', 'unticked', 'questions', 'worksheet']) {
    const p = good();
    delete p[key];
    refused(p, 'bad-shape');
  }
  refused({ ...good(), selection: { from: 0, to: 1, extra: 2 } }, 'bad-shape');
  refused({ ...good(), selection: { from: 0 } }, 'bad-shape');
});
test('project › wrong types are refused', () => {
  const cases = {
    appVersion: [1.4, '1.4', '1.4.0-beta', '<b>1</b>.0.0', null],
    title: [1, null, ['x'], { x: 1 }, 'x'.repeat(P.MAX_LINE + 1)],
    source: [false, 'x'.repeat(P.MAX_LINE + 1)],
    text: [42, null, ['a'], { toString: 'x' }],
    lineBreaks: ['true', 1, null],
    selection: [null, [0, 1], 'all', { from: '0', to: 1 }],
    unticked: [null, 'word', [1], [''], ['a', 'a'], ['x'.repeat(P.MAX_WORD + 1)],
      Array.from({ length: LIMIT + 1 }, (_, i) => `w${i}`), [{ word: 'x' }]],
    questions: [null, [], 'x', { before: [], while: [] }, { before: [], while: [], after: [], during: [] },
      { before: [''], while: [], after: [] }, { before: [1], while: [], after: [] },
      { before: ['q'.repeat(W.MAX_QUESTION + 1)], while: [], after: [] },
      { before: Array(W.MAX_QUESTIONS + 1).fill('q'), while: [], after: [] },
      { before: 'q', while: [], after: [] }],
    worksheet: [null, true, {}, { fullText: true }, { fullText: 'true', answerKey: true },
      { fullText: true, answerKey: true, html: true }]
  };
  for (const [key, values] of Object.entries(cases)) {
    for (const v of values) {
      const r = opens({ ...good(), [key]: v });
      assert.equal(r.ok, false, `${key}: ${JSON.stringify(v).slice(0, 60)}`);
      assert.match(r.code, /^bad-(shape|selection)$/);
    }
  }
});
test('project › offsets outside the text are refused', () => {
  const len = STATE.text.length;
  for (const sel of [{ from: -1, to: 2 }, { from: 0, to: len + 1 }, { from: 5, to: 4 },
    { from: 0.5, to: 2 }, { from: 0, to: 1e300 }, { from: 0, to: Number.MAX_SAFE_INTEGER + 2 }]) {
    refused({ ...good(), selection: sel }, 'bad-selection');
  }
  assert.equal(opens({ ...good(), selection: { from: len, to: len } }).ok, true);
});
test('project › a huge file is refused before it is parsed', () => {
  refused(' '.repeat(P.MAX_FILE_BYTES + 1), 'too-big');
  refused({ ...good(), text: 'x'.repeat(P.MAX_TEXT + 1), selection: { from: 0, to: 0 } }, 'bad-shape');
});
test('project › HTML in every string field opens as plain data', () => {
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const r = opens({ ...good(), title: evil, source: evil, text: evil, selection: { from: 0, to: 0 }, unticked: [evil],
    questions: { before: [evil], while: [evil], after: [evil] } });
  assert.equal(r.ok, true);
  assert.equal(r.project.questions.while[0], evil);
  assert.equal(r.project.title, evil);
  assert.equal(r.project.text, evil);
});
