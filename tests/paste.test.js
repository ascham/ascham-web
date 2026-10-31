// The paste normaliser (src/core/paste.js): whitespace as the extension's extractor did it,
// line breaks by the teacher's choice, the 120,000 cap, and the mapping from
// the textarea's selection onto the normalised text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../src/core/paste.js';
import * as V from '../src/core/vocab-core.js';
import * as W from '../src/core/wordlist.js';
import { metadataIn, stripInfo } from '../scripts/lib/pdf-meta.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/paste');
const keep = (raw) => P.normalise(raw, { keepLineBreaks: true });
const join = (raw) => P.normalise(raw, { keepLineBreaks: false });

// ---- whitespace -------------------------------------------------------------

test('paste › runs of spaces and tabs collapse to one space', () => {
  assert.equal(keep('a  \t b').text, 'a b');
});
test('paste › a no-break space collapses like any other (\\s, as the extractor)', () => {
  assert.equal(keep('a  b').text, 'a b');
});
test('paste › leading and trailing whitespace is trimmed', () => {
  assert.equal(keep(' \n\t a b \n ').text, 'a b');
});
test('paste › empty and whitespace-only pastes give empty text', () => {
  assert.equal(keep('').text, '');
  assert.equal(keep(' \n\n\t').text, '');
  assert.equal(keep(undefined).text, '');
});

// ---- line breaks ------------------------------------------------------------

test('paste › a blank line is a hard boundary in both modes', () => {
  assert.equal(keep('a\n\nb').text, 'a\nb');
  assert.equal(join('a\n\nb').text, 'a\nb');
});
test('paste › a blank line holding spaces is still a blank line', () => {
  assert.equal(join('a\n  \t\nb').text, 'a\nb');
});
test('paste › a single line break is kept when keepLineBreaks is on', () => {
  assert.equal(keep('a\nb').text, 'a\nb');
});
test('paste › a single line break becomes a space when it is off', () => {
  assert.equal(join('a\nb').text, 'a b');
  assert.equal(join('a \n  b').text, 'a b');
});
test('paste › CRLF and a lone CR are one line break each', () => {
  assert.equal(join('a\r\nb').text, 'a b');
  assert.equal(join('a\rb').text, 'a b');
  assert.equal(join('a\r\n\r\nb').text, 'a\nb');
  assert.equal(join('a\r\rb').text, 'a\nb');
});
test('paste › U+2028 is a line break, U+2029 a blank line', () => {
  assert.equal(join('a b').text, 'a b');
  assert.equal(join('a b').text, 'a\nb');
});
// ---- a word hyphenated at a line end --------

test('paste › join mode closes a line-end hyphen and keeps the hyphen', () => {
  assert.equal(join('a third-\nparty app').text, 'a third-party app');
  assert.equal(join('a third- \r\n  party app').text, 'a third-party app');
  assert.equal(join('pages 10-\n12').text, 'pages 10-12');
  assert.equal(join('Anglo\u2010\nSaxon').text, 'Anglo\u2010Saxon');
});
test('paste › keep mode leaves a line-end hyphen on its own line', () => {
  assert.equal(keep('a third-\nparty app').text, 'a third-\nparty app');
});
test('paste › a hyphen is never removed, even where the wrap invented it', () => {
  // "investi-\ngated" is a word the typesetter split: kept as written, so the
  // card is declined as hyphenated rather than an invented word appearing.
  assert.equal(join('was investi-\ngated').text, 'was investi-gated');
});
test('paste › only a hyphen ending a word, and only across one line break', () => {
  assert.equal(join('then -\nwe left').text, 'then - we left');
  assert.equal(join('items:-\n- one').text, 'items:- - one');
  assert.equal(join('third-\n\nparty').text, 'third-\nparty');
  assert.equal(join('third-\n(party)').text, 'third- (party)');
  assert.equal(join('third- party').text, 'third- party');
});
test('paste › a closed hyphen maps the selection across the join', () => {
  const raw = 'a third-\nparty app';
  const n = join(raw);
  const sel = P.selectionOf(n, raw.indexOf('third'), raw.indexOf(' app'));
  assert.equal(n.text.slice(sel.from, sel.to), 'third-party');
  assert.equal(n.map[raw.indexOf('\n')], n.text.indexOf('party'));
});

// ---- a heading in join mode --------------------------------------------------

const GRIEVANCE = 'He has refused his Assent to Laws, the most wholesome and necessary for the public good.';
test('paste › join mode keeps the line break after a heading-like line', () => {
  assert.equal(join(`Grievances\n${GRIEVANCE}`).text, `Grievances\n${GRIEVANCE}`);
  assert.equal(join(`Part 2 of the report\r\n${GRIEVANCE}`).text, `Part 2 of the report\n${GRIEVANCE}`);
  assert.equal(join(`Grievances\n1776 was the year.\n${GRIEVANCE}`).text, `Grievances\n1776 was the year. ${GRIEVANCE}`);
});
test('paste › join mode joins a line that closes, carries on, is long or meets lowercase', () => {
  for (const line of ['Grievances.', 'Grievances,', 'Grievances:', 'the pursuit of', 'Life, Liberty and the',
    'one two three four five six seven eight nine']) {
    assert.equal(join(`${line}\n${GRIEVANCE}`).text, `${line} ${GRIEVANCE}`, line);
  }
  assert.equal(join(`Grievances\nhe has refused.`).text, 'Grievances he has refused.');
  // Wrapped lines all near one width: none is short against the median.
  const wrapped = 'among these are Life\nLiberty and the pursuit\nof Happiness for all men.';
  assert.equal(join(wrapped).text, wrapped.replaceAll('\n', ' '));
});
test('paste › a line-end hyphen still joins before the heading rule', () => {
  assert.equal(join(`Anglo-\nSaxon\n${GRIEVANCE}\n${GRIEVANCE}`).text, `Anglo-Saxon\n${GRIEVANCE} ${GRIEVANCE}`);
});
// Real prose re-wrapped at 25 to 70 characters, as a PDF or email would wrap
// it: join mode gives each paragraph back whole, a break inside none.
for (const f of ['wikisource.chrome.txt', 'gutenberg.chrome.txt', 'nasa.chrome.txt', 'pdf.firefox.txt']) {
  test(`paste › ${f}: its prose re-wrapped at 25 to 70 characters joins whole`, () => {
    const raw = fs.readFileSync(path.join(FIX, f), 'utf8');
    const segs = raw.split(/\n\s*\n/).flatMap((p) => (f.startsWith('pdf') ? [p] : p.split('\n')))
      .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const width of [25, 30, 35, 45, 70]) {
      const wrapped = segs.map((s) => {
        const lines = [''];
        for (const w of s.split(' ')) {
          if (lines.at(-1) && (lines.at(-1) + ' ' + w).length > width) lines.push(w);
          else lines[lines.length - 1] = lines.at(-1) ? `${lines.at(-1)} ${w}` : w;
        }
        return lines.join('\n');
      });
      const got = join(wrapped.join('\n\n')).text.split('\n');
      const want = join(segs.join('\n\n')).text.split('\n');
      assert.equal(got.length, want.length, `${width}: ${got.find((l, i) => l !== want[i])}`);
    }
  });
}
test('paste › wikisource.chrome.txt in join mode: "Grievances" stands alone and is not carded', () => {
  const n = join(fs.readFileSync(path.join(FIX, 'wikisource.chrome.txt'), 'utf8'));
  assert.ok(n.text.includes(`\nGrievances\n${GRIEVANCE}`));
  const { cards } = V.harvest(n.text, 0, n.text.length, {
    bandOf: W.bandOf, isKnown: W.isKnown, isName: W.isProperNoun, limit: 40
  });
  assert.ok(!cards.some((c) => c.word === 'grievances'));
});

test('paste › the default keeps line breaks (measured: see fixtures README)', () => {
  assert.equal(P.KEEP_LINE_BREAKS_DEFAULT, true);
  assert.equal(P.normalise('a\nb').text, 'a\nb');
});
test('paste › keepLineBreaks must be exactly true or false to override', () => {
  assert.equal(P.normalise('a\nb', { keepLineBreaks: 0 }).text, 'a b');
  assert.equal(P.normalise('a\nb', { keepLineBreaks: 'yes' }).text, 'a b');
});
test('paste › no newline survives except as a lone hard boundary', () => {
  const t = keep('a\n\n\n\nb\n \n c\r\n\r\n\r\nd').text;
  assert.equal(t, 'a\nb\nc\nd');
});

// ---- the cap ----------------------------------------------------------------

test('paste › text at the cap is not truncated', () => {
  const raw = 'a'.repeat(P.MAX_CHARS);
  const n = keep(raw);
  assert.equal(n.truncated, false);
  assert.equal(n.text.length, P.MAX_CHARS);
});
test('paste › text past the cap is cut at a word boundary and flagged', () => {
  const word = 'abcdefghi ';
  const raw = word.repeat(Math.ceil(P.MAX_CHARS / word.length) + 5);
  const n = keep(raw);
  assert.equal(n.truncated, true);
  assert.ok(n.text.length <= P.MAX_CHARS, String(n.text.length));
  assert.ok(n.text.endsWith('abcdefghi'), JSON.stringify(n.text.slice(-12)));
  assert.equal(n.map[raw.length], n.text.length);
});
test('paste › one unbroken word past the cap is cut at the cap', () => {
  const n = keep('x'.repeat(P.MAX_CHARS + 50));
  assert.equal(n.truncated, true);
  assert.equal(n.text.length, P.MAX_CHARS);
});
test('paste › whitespace past the cap does not count as truncation', () => {
  const n = keep('a'.repeat(P.MAX_CHARS) + '   \n\n ');
  assert.equal(n.truncated, false);
});
test('paste › a selection wholly past the cap is empty', () => {
  const raw = 'word '.repeat(P.MAX_CHARS / 4);
  const n = keep(raw);
  const s = P.selectionOf(n, raw.length - 20, raw.length - 2);
  assert.equal(s.empty, true);
});

// ---- the selection mapping --------------------------------------------------

test('paste › no selection means the whole text', () => {
  const n = keep('  one two  ');
  assert.deepEqual(P.selectionOf(n, 4, 4), { from: 0, to: 7, whole: true, empty: false });
});
test('paste › a selection maps onto the same characters', () => {
  const raw = 'The  cat\r\n\r\n sat   on the mat.';
  const n = keep(raw);
  const s = raw.indexOf('sat'), e = raw.indexOf('mat') + 3;
  const sel = P.selectionOf(n, s, e);
  assert.equal(n.text.slice(sel.from, sel.to), 'sat on the mat');
});
test('paste › a backwards selection is the same selection', () => {
  const n = keep('one two three');
  assert.deepEqual(P.selectionOf(n, 7, 4), P.selectionOf(n, 4, 7));
});
test('paste › a whitespace-only selection is empty', () => {
  const raw = 'one     two';
  const sel = P.selectionOf(keep(raw), 4, 7);
  assert.equal(sel.empty, true);
});
test('paste › a selection inside trimmed leading whitespace is empty', () => {
  const sel = P.selectionOf(keep('    one'), 0, 3);
  assert.equal(sel.empty, true);
});
test('paste › out-of-range offsets are clamped', () => {
  const n = keep('one two');
  const sel = P.selectionOf(n, -5, 999);
  assert.deepEqual([sel.from, sel.to], [0, 7]);
});
test('paste › a selection starting mid-word keeps the partial word', () => {
  const raw = 'alpha  beta gamma';
  const n = keep(raw);
  const sel = P.selectionOf(n, 2, raw.indexOf('gamma'));
  assert.equal(n.text.slice(sel.from, sel.to), 'pha beta ');
});

// The mapping property, over random pastes: the normalised slice of any raw
// selection equals the selection's own text normalised the same way, up to
// one collapsed separator at either edge. Seeded, so a failure reproduces.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const PIECES = ['a', 'b', 'Word', '.', ' ', '  ', '\t', '\n', '\n\n', '\r\n', '\r', ' ', ' ', ' ', 'é', '’'];
for (const mode of [true, false]) {
  test(`paste › the mapping holds for 3,000 random pastes (keepLineBreaks ${mode})`, () => {
    const r = rng(mode ? 1 : 2);
    for (let k = 0; k < 3000; k++) {
      let raw = '';
      const len = Math.floor(r() * 40);
      for (let j = 0; j < len; j++) raw += PIECES[Math.floor(r() * PIECES.length)];
      const n = P.normalise(raw, { keepLineBreaks: mode });
      // monotonic, in range, ends at text.length
      for (let i = 1; i < n.map.length; i++) assert.ok(n.map[i] >= n.map[i - 1], JSON.stringify(raw));
      assert.equal(n.map[raw.length], n.text.length);
      // every non-whitespace raw character lands on itself
      for (let i = 0; i < raw.length; i++) {
        if (/\S/.test(raw[i])) assert.equal(n.text[n.map[i]], raw[i], JSON.stringify({ raw, i }));
      }
      // slices agree with normalising the slice on its own
      let a = Math.floor(r() * (raw.length + 1)), b = Math.floor(r() * (raw.length + 1));
      if (a > b) [a, b] = [b, a];
      const got = n.text.slice(n.map[a], n.map[b]).replace(/\s/g, ' ').trim();
      const want = P.normalise(raw.slice(a, b), { keepLineBreaks: mode }).text.replace(/\s/g, ' ');
      assert.equal(got, want, JSON.stringify({ raw, a, b }));
    }
  });
}

// With hyphens in the mix, join mode neither loses nor invents a character:
// every non-whitespace character survives, in order, and nothing else does.
test('paste › 3,000 random pastes with hyphens lose and invent nothing', () => {
  const r = rng(3);
  const pieces = [...PIECES, '-', '-', '\u2010', '3'];
  for (let k = 0; k < 3000; k++) {
    let raw = '';
    const len = Math.floor(r() * 40);
    for (let j = 0; j < len; j++) raw += pieces[Math.floor(r() * pieces.length)];
    for (const mode of [true, false]) {
      const n = P.normalise(raw, { keepLineBreaks: mode });
      assert.equal(n.text.replace(/\s/g, ''), raw.replace(/\s/g, ''), JSON.stringify(raw));
      for (let i = 1; i < n.map.length; i++) assert.ok(n.map[i] >= n.map[i - 1], JSON.stringify(raw));
      for (let i = 0; i < raw.length; i++) {
        if (/\S/.test(raw[i])) assert.equal(n.text[n.map[i]], raw[i], JSON.stringify({ raw, i }));
      }
    }
  }
});

// The selection reaches harvest: candidates only from [from, to), context
// from the whole text.
test('paste › harvest takes candidates only from the mapped selection', () => {
  const raw = 'Gerrymandering   was alleged.\r\n\r\nThe   ombudsman   investigated   thoroughly.';
  const n = keep(raw);
  const sel = P.selectionOf(n, raw.indexOf('The'), raw.length);
  const { cards } = V.harvest(n.text, sel.from, sel.to, {
    bandOf: W.bandOf, isKnown: W.isKnown, isName: W.isProperNoun, limit: 40
  });
  const words = cards.map((c) => c.word);
  assert.ok(words.includes('ombudsman'), words.join(' '));
  assert.ok(!words.includes('gerrymandering'), words.join(' '));
  for (const c of cards) assert.ok(n.text.includes(c.sentence.text));
});

// ---- the hint ---------------------------------------------------------------

test('paste › looksWrapped wants three carried lines and a quarter of breaks', () => {
  assert.equal(P.looksWrapped('one\ntwo\nthree'), false);
  assert.equal(P.looksWrapped('The cat\nsat on\nthe mat and\nthen slept.'), true);
  assert.equal(P.looksWrapped('Title\n\nA paragraph.\n\nAnother one.'), false);
});

// ---- the real pastes --------------------------------------------------------

const fixtures = fs.readdirSync(FIX).filter((f) => f.endsWith('.txt')).sort();
test('paste › the fixture set is all there', () => {
  assert.deepEqual(fixtures, [
    'email.chrome.txt', 'email.firefox.txt', 'gutenberg.chrome.txt', 'gutenberg.firefox.txt',
    'nasa.chrome.txt', 'nasa.firefox.txt', 'pdf.chrome.txt', 'pdf.firefox.txt',
    'wikisource.chrome.txt', 'wikisource.firefox.txt'
  ]);
});
for (const f of fixtures) {
  const raw = fs.readFileSync(path.join(FIX, f), 'utf8');
  const source = f.split('.')[0];
  test(`paste › ${f}: looksWrapped is ${source === 'pdf' || source === 'email'}`, () => {
    assert.equal(P.looksWrapped(raw), source === 'pdf' || source === 'email');
  });
  // Output `\n` is always a hard boundary, so the output is a fixed point of
  // the keep mode whichever mode made it.
  test(`paste › ${f}: the output is already normal and every card sentence is in it`, () => {
    for (const mode of [true, false]) {
      const n = P.normalise(raw, { keepLineBreaks: mode });
      assert.equal(keep(n.text).text, n.text);
      assert.doesNotMatch(n.text, /\n\n|[ \t]\n|\n[ \t]|  /);
      const { cards } = V.harvest(n.text, 0, n.text.length, {
        bandOf: W.bandOf, isKnown: W.isKnown, isName: W.isProperNoun, limit: 40
      });
      assert.ok(cards.length > 0);
      for (const c of cards) assert.ok(n.text.includes(c.sentence.text), c.sentence.text);
    }
  });
}

// ---- the PDF fixture's metadata ---------------------------------------------
// collect-paste.mjs strips the Info dictionary Chrome writes (title, producer,
// dates with a timezone) before sample.pdf is saved.
test('paste › sample.pdf carries no metadata', () => {
  assert.deepEqual(metadataIn(fs.readFileSync(path.join(FIX, 'sample.pdf'))), []);
});
test('paste › stripInfo blanks the Info dictionary and keeps every offset', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<</Title (Rivers) /Producer (Skia/PDF m155) /CreationDate (D:20261011120000+01\'00\')>>\nendobj\n' +
    'trailer\n<</Size 2 /Info 1 0 R>>\n%%EOF\n', 'latin1');
  assert.deepEqual(metadataIn(pdf), ['Title', 'Producer', 'CreationDate', 'Info dictionary not empty']);
  const clean = stripInfo(pdf);
  assert.equal(clean.length, pdf.length);
  assert.deepEqual(metadataIn(clean), []);
  assert.ok(clean.toString('latin1').endsWith('trailer\n<</Size 2 /Info 1 0 R>>\n%%EOF\n'));
});
