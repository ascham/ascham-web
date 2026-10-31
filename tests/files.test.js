// The files a teacher saves (src/ui/files.js, src/ui/download.js): the Anki
// CSV is csv-core's, built from the ticked cards only, parses as strict RFC
// 4180, keeps its byte order mark and formula guard, and keeps promise 4; the
// project file names the unticked words; and filenames are safe everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvFile, projectFile } from '../src/ui/files.js';
import { safeName } from '../src/ui/download.js';
import * as Project from '../src/ui/project.js';
import { analyse } from '../src/ui/pipeline.js';
import { normalise } from '../src/core/paste.js';
import { parseCsv } from './lib/rfc4180.mjs';

const RAW = 'Ombudsman report\n\n-20% growth, said the "ombudsman", was =SUM(A1) scrupulous.\r\n' +
  '+Critics called the gerrymandering opaque; the café owners called it entrenched.\n' +
  '@everyone: the extradition, they said, was "scrupulously" argued.';
const WHEN = Date.UTC(2026, 9, 11, 12);
const deck = () => {
  const r = analyse({ raw: RAW });
  assert.equal(r.state, 'cards');
  return r.cards;
};

function csvRows(text) {
  assert.equal(text.charCodeAt(0), 0xfeff, 'byte order mark');
  const records = parseCsv(text.slice(1));
  const directives = records.filter((r) => r[0].startsWith('#'));
  const rows = records.filter((r) => !r[0].startsWith('#'));
  return { directives: directives.map((r) => r.join(',')), rows };
}

test('csv › only ticked cards, as strict RFC 4180, with the BOM', () => {
  const cards = deck();
  assert.ok(cards.length >= 4, cards.map((c) => c.word).join(' '));
  const keep = cards.map((_, i) => i % 2 === 0);
  const f = csvFile({ cards, keep, title: 'Ombudsman report', source: '' }, WHEN);
  const { directives, rows } = csvRows(f.text);
  assert.deepEqual(directives, ['#separator:comma', '#html:false', '#notetype:Basic',
    '#columns:Front,Back', '#tags:ascham Ombudsman-report']);
  assert.deepEqual(rows.map((r) => r[0]), cards.filter((_, i) => keep[i]).map((c) => c.word));
  for (const r of rows) assert.equal(r.length, 2);
  assert.equal(f.type, 'text/csv;charset=utf-8');
  assert.equal(f.name, 'ascham_ombudsman-report_2026-10-11.csv');
});
test('csv › promise 4: every sentence is verbatim in the source, every face in its sentence', () => {
  const cards = deck();
  const text = normalise(RAW).text;
  const { rows } = csvRows(csvFile({ cards, keep: cards.map(() => true), title: '', source: '' }, WHEN).text);
  for (const [face, back] of rows) {
    // The formula guard's apostrophe is the one byte csv-core may add.
    const sentence = /^'[=+\-@\t\r]/.test(back) ? back.slice(1) : back;
    assert.ok(text.includes(sentence), sentence);
    assert.ok(sentence.toLowerCase().includes(face.toLowerCase()), `${face} / ${sentence}`);
  }
});
test('csv › the formula guard survives into the file', () => {
  const cards = deck();
  const { rows } = csvRows(csvFile({ cards, keep: cards.map(() => true), title: '', source: '' }, WHEN).text);
  const backs = rows.map((r) => r[1]);
  assert.ok(backs.some((b) => b.startsWith("'-20%")), backs.join('\n'));
  assert.ok(backs.some((b) => b.startsWith("'+Critics")), backs.join('\n'));
  assert.ok(backs.some((b) => b.startsWith("'@everyone")), backs.join('\n'));
  for (const b of backs) assert.doesNotMatch(b, /^[=+\-@\t\r]/);
});
test('csv › tags: the title, else the source, else csv-core\'s floor "deck"', () => {
  const cards = deck();
  const keep = cards.map(() => true);
  const tags = (title, source) => csvRows(csvFile({ cards, keep, title, source }, WHEN).text)
    .directives.find((d) => d.startsWith('#tags:'));
  assert.equal(tags('Year 9: Nord Stream', 'BBC'), '#tags:ascham Year-9-Nord-Stream');
  assert.equal(tags('', 'BBC News, 10 Oct'), '#tags:ascham BBC-News-10-Oct');
  assert.equal(tags('  ', ''), '#tags:ascham deck');
  assert.equal(tags('—', '«»'), '#tags:ascham deck');
  assert.equal(csvFile({ cards, keep, title: '', source: '' }, WHEN).name, 'ascham_deck_2026-10-11.csv');
});
test('csv › nothing ticked gives a deck with no rows', () => {
  const cards = deck();
  const { rows } = csvRows(csvFile({ cards, keep: cards.map(() => false), title: '', source: '' }, WHEN).text);
  assert.deepEqual(rows, []);
});

test('project file › names the unticked words and opens again', () => {
  const cards = deck();
  const keep = cards.map((_, i) => i !== 1);
  const f = projectFile({ cards, keep, title: 'T', source: 'S', text: RAW, lineBreaks: true,
    selection: { from: 2, to: 30 } }, WHEN);
  assert.equal(f.name, 'ascham_t_2026-10-11.json');
  assert.equal(f.type, 'application/json');
  const r = Project.parse(f.text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.project.unticked, [cards[1].word]);
  assert.equal(r.project.text, RAW);
  assert.deepEqual(r.project.selection, { from: 2, to: 30 });
});

test('filenames › safe on every filesystem', () => {
  assert.equal(safeName('ascham_deck_2026-10-11.csv', 'csv'), 'ascham_deck_2026-10-11.csv');
  assert.equal(safeName('../../etc/passwd', ''), 'etc-passwd');
  assert.equal(safeName('a/b\\c:d*e?f"g<h>i|j.csv', 'csv'), 'a-b-c-d-e-f-g-h-i-j.csv');
  assert.equal(safeName('bad\u0000\u001f\u007fname.json', 'json'), 'bad-name.json');
  assert.equal(safeName('...hidden', ''), 'hidden');
  assert.equal(safeName('trailing. . ', ''), 'trailing');
  assert.equal(safeName('CON.csv', 'csv'), 'ascham-CON.csv');
  assert.equal(safeName('lpt1', ''), 'ascham-lpt1');
  assert.equal(safeName('', 'csv'), 'ascham.csv');
  assert.equal(safeName('///', 'json'), 'ascham.json');
  assert.equal(safeName('Café “quotes”.csv', 'csv'), 'Café “quotes”.csv');
  const long = safeName(`${'x'.repeat(300)}.json`, 'json');
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.json'));
});
