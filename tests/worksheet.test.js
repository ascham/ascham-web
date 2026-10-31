// The worksheet (src/ui/worksheet.js), held to its correctness rules:
// verbatim, no leaks, no overlap, deterministic, a subset of the ticked
// cards. Over every paste fixture, both line-break modes, and seeded random
// tick patterns; then the caps and the edges on hand-made cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from '../src/ui/worksheet.js';
import * as Project from '../src/ui/project.js';
import { analyse } from '../src/ui/pipeline.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/paste');
const FILES = fs.readdirSync(FIX).filter((f) => f.endsWith('.txt')).sort();

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const isGap = (p) => typeof p !== 'string';
const refilled = (item) => item.parts.map((p) => (isGap(p) ? p.answer : p)).join('');
const visible = (item) => item.parts.filter((p) => !isGap(p)).join(' ');
const gapsOf = (sheet) => sheet.items.flatMap((it) => it.parts.filter(isGap));

// An independent reading of "the answer appears": split the visible text into
// words on anything that is not a letter, mark or digit, and compare in lower
// case. Written apart from worksheet.js's regex on purpose.
const wordsIn = (s) => s.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).map((w) => w.toLowerCase());

// Every fixture, both modes, all ticked and 20 seeded tick patterns each.
const DECKS = [];
for (const file of FILES) {
  const raw = fs.readFileSync(path.join(FIX, file), 'utf8');
  for (const lineBreaks of [true, false]) {
    const r = analyse({ raw, start: 0, end: 0, keepLineBreaks: lineBreaks });
    if (r.state !== 'cards') continue;
    const rand = rng(file.length * 31 + (lineBreaks ? 1 : 2));
    const patterns = [r.cards.map(() => true)];
    for (let k = 0; k < 20; k++) patterns.push(r.cards.map(() => rand() < 0.6));
    for (const keep of patterns) DECKS.push({ name: `${file} lineBreaks=${lineBreaks}`, raw, lineBreaks, cards: r.cards, keep });
  }
}
const sheetOf = (d, extra = {}) => W.build({ cards: d.cards, keep: d.keep, text: d.raw, lineBreaks: d.lineBreaks, title: 't', source: 's', ...extra });

test('worksheet › the fixtures give real sheets to test', () => {
  assert.ok(DECKS.length >= FILES.length * 2 * 21 - 21, DECKS.length);
  const all = sheetOf(DECKS.find((d) => d.name === 'nasa.chrome.txt lineBreaks=true'));
  assert.ok(all.items.length >= 5, all.items.length);
});

test('worksheet › verbatim: every item, answers back in, is its source sentence exactly', () => {
  for (const d of DECKS) {
    const sentences = new Set(d.cards.filter((c) => c.sentence).map((c) => c.sentence.text));
    for (const item of sheetOf(d).items) {
      assert.ok(sentences.has(refilled(item)), `${d.name}: item ${item.number}`);
    }
  }
});

test('worksheet › no leaks: no answer stands un-blanked anywhere in the gap-fill', () => {
  for (const d of DECKS) {
    const sheet = sheetOf(d);
    const answers = new Set(gapsOf(sheet).map((g) => g.answer.toLowerCase()));
    const shown = sheet.items.flatMap((it) => wordsIn(visible(it)));
    const leaked = shown.filter((w) => answers.has(w));
    assert.deepEqual(leaked, [], d.name);
  }
});

test('worksheet › one item per sentence, in text order, no sentence twice', () => {
  for (const d of DECKS) {
    const sheet = sheetOf(d);
    const texts = sheet.items.map(refilled);
    assert.equal(new Set(texts).size, texts.length, d.name);
    const at = texts.map((t) => d.cards.find((c) => c.sentence && c.sentence.text === t).sentence.start);
    assert.deepEqual(at, [...at].sort((a, b) => a - b), d.name);
    assert.deepEqual(sheet.items.map((it) => it.number), sheet.items.map((_, i) => i + 1));
  }
});

test('worksheet › the caps: at most 15 items, 4 gaps an item, and the rest are counted', () => {
  for (const d of DECKS) {
    const sheet = sheetOf(d);
    assert.ok(sheet.items.length <= W.MAX_ITEMS);
    for (const it of sheet.items) assert.ok(it.parts.filter(isGap).length <= W.MAX_GAPS, `${d.name} ${it.number}`);
    const ticked = d.keep.filter(Boolean).length;
    const ranks = new Set(gapsOf(sheet).map((g) => g.rank));
    assert.equal(sheet.deckOnly, ticked - ranks.size, d.name);
  }
});

test('worksheet › a limited sheet is the whole sheet\'s first items, a sheet of its own: verbatim, no leaks, its own bank and key', () => {
  for (const d of DECKS) {
    const whole = sheetOf(d);
    const part = sheetOf(d, { limit: 3 });
    assert.equal(part.items.length, Math.min(3, whole.items.length), d.name);
    assert.deepEqual(part.items.map(refilled), whole.items.slice(0, 3).map(refilled), d.name);
    assert.deepEqual(part.items.map((it) => it.number), part.items.map((_, i) => i + 1));
    const answers = new Set(gapsOf(part).map((g) => g.answer.toLowerCase()));
    assert.deepEqual(part.items.flatMap((it) => wordsIn(visible(it))).filter((w) => answers.has(w)), [], d.name);
    assert.deepEqual(new Set(part.bank.map((w) => w.toLowerCase())), answers, d.name);
    assert.deepEqual(part.key, gapsOf(part).map((g) => ({ label: g.label, answer: g.answer })));
  }
});

test('worksheet › subset: every gap is a ticked card; no unticked word in the bank or the key', () => {
  for (const d of DECKS) {
    const sheet = sheetOf(d);
    for (const g of gapsOf(sheet)) {
      assert.equal(d.keep[g.rank], true, d.name);
      assert.equal(g.answer.toLowerCase(), d.cards[g.rank].word.toLowerCase(), `${d.name}: ${g.answer}`);
    }
    const unticked = new Set(d.cards.filter((_, i) => !d.keep[i]).map((c) => c.word.toLowerCase()));
    for (const w of [...sheet.bank, ...sheet.key.map((k) => k.answer)]) {
      assert.ok(!unticked.has(w.toLowerCase()), `${d.name}: ${w}`);
    }
  }
});

test('worksheet › the bank is every gap\'s answer, once whatever its case, alphabetical', () => {
  for (const d of DECKS.slice(0, 40)) {
    const sheet = sheetOf(d);
    const lower = (list) => new Set(list.map((w) => w.toLowerCase()));
    assert.deepEqual(lower(sheet.bank), lower(gapsOf(sheet).map((g) => g.answer)));
    assert.equal(lower(sheet.bank).size, sheet.bank.length);
    for (const w of sheet.bank) assert.ok(gapsOf(sheet).some((g) => g.answer === w), w);
    const sorted = [...sheet.bank].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant', caseFirst: 'lower' }) || (a < b ? -1 : 1));
    assert.deepEqual(sheet.bank, sorted);
  }
});

test('worksheet › labels: "3" for a lone gap, "3a", "3b" for several; the key follows the items', () => {
  for (const d of DECKS.slice(0, 40)) {
    const sheet = sheetOf(d);
    for (const it of sheet.items) {
      const labels = it.parts.filter(isGap).map((g) => g.label);
      const want = labels.length === 1 ? [String(it.number)] : labels.map((_, j) => `${it.number}${'abcd'[j]}`);
      assert.deepEqual(labels, want);
    }
    assert.deepEqual(sheet.key, gapsOf(sheet).map((g) => ({ label: g.label, answer: g.answer })));
  }
});

test('worksheet › deterministic: the same deck gives the same sheet, and so does its project file', () => {
  for (const d of DECKS.filter((_, i) => i % 21 === 0)) {
    const a = sheetOf(d, { options: { fullText: true, answerKey: true } });
    assert.deepEqual(sheetOf(d, { options: { fullText: true, answerKey: true } }), a);
    const file = Project.serialise({ title: 't', source: 's', text: d.raw, lineBreaks: d.lineBreaks,
      selection: { from: 0, to: 0 }, unticked: d.cards.filter((_, i) => !d.keep[i]).map((c) => c.word),
      questions: W.emptyQuestions(), worksheet: { fullText: true, answerKey: true } });
    const p = Project.parse(file).project;
    const again = analyse({ raw: p.text, start: p.selection.from, end: p.selection.to, keepLineBreaks: p.lineBreaks });
    const off = new Set(p.unticked);
    const b = W.build({ cards: again.cards, keep: again.cards.map((c) => !off.has(c.word)), text: p.text,
      lineBreaks: p.lineBreaks, title: p.title, source: p.source, questions: p.questions, options: p.worksheet });
    assert.deepEqual(b, a, d.name);
  }
});

// ---- the cut, as a seeded property --------------------------------------------

test('worksheet › no overlap: cutMany refuses overlapping ranges and reassembles the rest exactly (5,000 seeded)', () => {
  const r = rng(7);
  const ALPHA = 'ab é’.́😀';
  for (let k = 0; k < 5000; k++) {
    const len = Math.floor(r() * 30);
    let text = '';
    while (text.length < len) text += ALPHA[Math.floor(r() * ALPHA.length)];
    const ranges = [];
    const n = Math.floor(r() * 5);
    for (let j = 0; j < n; j++) {
      const at = Math.floor(r() * (text.length + 2)) - 1;
      ranges.push({ at, length: Math.floor(r() * 6) });
    }
    const parts = W.cutMany(text, ranges);
    const sorted = [...ranges].sort((a, b) => a.at - b.at);
    const bad = sorted.some((x, i) => x.at < 0 || x.length < 1 || x.at + x.length > text.length
      || (i > 0 && sorted[i - 1].at + sorted[i - 1].length > x.at));
    if (bad) {
      assert.equal(parts, null, JSON.stringify({ text, ranges }));
      continue;
    }
    assert.ok(parts, JSON.stringify({ text, ranges }));
    assert.equal(parts.map((p) => (isGap(p) ? p.answer : p)).join(''), text);
    const gaps = parts.filter(isGap);
    assert.equal(gaps.length, ranges.length);
    for (const g of gaps) assert.equal(g.answer, text.substr(g.at, g.length));
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i - 1].at + gaps[i - 1].length <= gaps[i].at);
  }
});

// ---- hand-made cards: the old bugs and the edges ------------------------------

// A deck of hand-made cards over one text: each [word, sentenceIndex].
function deck(sentences, picks) {
  let at = 0;
  const placed = sentences.map((text) => {
    const s = { text, start: at, end: at + text.length };
    at += text.length + 1;
    return s;
  });
  const cards = picks.map(([word, si, nth = 0]) => {
    const s = placed[si];
    let pos = -1;
    for (let i = 0; i <= nth; i++) pos = s.text.indexOf(word, pos + 1);
    assert.ok(pos >= 0, word);
    return { word: word.toLowerCase(), sentence: s, target: { at: pos, length: word.length } };
  });
  return { cards, keep: cards.map(() => true), text: sentences.join('\n'), lineBreaks: true };
}

test('worksheet › a sentence shared by several cards is one item; seven targets become four gaps', () => {
  const d = deck(['The alpha, then beta, then gamma, then delta, then epsilon, then zeta, then eta rose.'],
    [['alpha', 0], ['beta', 0], ['gamma', 0], ['delta', 0], ['epsilon', 0], ['zeta', 0], ['eta', 0]]);
  const sheet = W.build(d);
  assert.equal(sheet.items.length, 1);
  assert.deepEqual(sheet.items[0].parts.filter(isGap).map((g) => [g.label, g.answer]),
    [['1a', 'alpha'], ['1b', 'beta'], ['1c', 'gamma'], ['1d', 'delta']]);
  assert.equal(sheet.deckOnly, 3);
  assert.equal(refilled(sheet.items[0]), d.cards[0].sentence.text);
});

test('worksheet › the cap keeps the best-ranked targets, not the first in the sentence', () => {
  const d = deck(['One and two and three and four and five and six.'],
    [['six', 0], ['five', 0], ['four', 0], ['three', 0], ['two', 0]]);
  const sheet = W.build(d);
  assert.deepEqual(sheet.items[0].parts.filter(isGap).map((g) => g.answer), ['three', 'four', 'five', 'six']);
});

test('worksheet › a single-gap sentence is kept, and its gap is labelled by the item alone', () => {
  const d = deck(['The tariff rose again this spring.'], [['tariff', 0]]);
  const sheet = W.build(d);
  assert.deepEqual(sheet.items[0].parts, ['The ', { label: '1', answer: 'tariff', rank: 0 }, ' rose again this spring.']);
  assert.deepEqual(sheet.key, [{ label: '1', answer: 'tariff' }]);
});

test('worksheet › the old leak: an answer from one item printed in another is blanked there too', () => {
  const d = deck(['The tariff rose again this spring.', 'Farmers said the Tariff hurt local farmers.'],
    [['tariff', 0], ['Farmers', 1]]);
  const sheet = W.build(d);
  assert.equal(sheet.items.length, 2);
  const second = sheet.items[1];
  assert.deepEqual(second.parts.filter(isGap).map((g) => [g.label, g.answer, g.rank]),
    [['2a', 'Farmers', 1], ['2b', 'Tariff', 0], ['2c', 'farmers', 1]]);
  assert.equal(refilled(second), 'Farmers said the Tariff hurt local farmers.');
});

test('worksheet › a word inside a longer word is not an answer and stays', () => {
  const d = deck(['The tariff rose again this spring.', 'Tariffs and tariff-free trade both grew.'],
    [['tariff', 0], ['trade', 1]]);
  const sheet = W.build(d);
  assert.equal(visible(sheet.items[1]), 'Tariffs and  -free   both grew.');
});

test('worksheet › an answer that cannot be blanked cleanly drops its item, and only that item', () => {
  // A target that starts mid-word ("iff came") overlaps the whole word
  // "tariff" without matching it, so "tariff" cannot be blanked there.
  const d = deck(['The tariff rose again this spring.', 'A new tariff came in last week.'],
    [['tariff', 0], ['iff came', 1]]);
  const sheet = W.build(d);
  assert.equal(sheet.items.length, 1);
  assert.equal(refilled(sheet.items[0]), 'The tariff rose again this spring.');
  assert.equal(sheet.deckOnly, 1);
});

test('worksheet › gaps beyond four, counting repeats, drop the lowest-ranked target', () => {
  const d = deck(['Gold and gold and gold, then silver and bronze.'], [['Gold', 0], ['silver', 0], ['bronze', 0]]);
  const sheet = W.build(d);
  const gaps = sheet.items[0].parts.filter(isGap);
  assert.deepEqual(gaps.map((g) => g.answer), ['Gold', 'gold', 'gold', 'silver']);
  assert.equal(sheet.deckOnly, 1);
});

test('worksheet › at most fifteen items, the first in text order; the rest are counted', () => {
  const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number${i} and it ends.`);
  const d = deck(sentences, sentences.map((_, i) => [`number${i}`, i]));
  const sheet = W.build(d);
  assert.equal(sheet.items.length, 15);
  assert.equal(sheet.items[14].parts[1].answer, 'number14');
  assert.equal(sheet.deckOnly, 5);
});

test('worksheet › why: words in sentences past the fifteenth are counted as such', () => {
  const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number${i} and it ends.`);
  const sheet = W.build(deck(sentences, sentences.map((_, i) => [`number${i}`, i])));
  assert.deepEqual(sheet.deckOnlyWhy, { sentences: 5, blanks: 0, other: 0 });
});

test('worksheet › why: words past four blanks in a sentence are counted as such, repeats included', () => {
  const six = W.build(deck(['One and two and three and four and five and six.'],
    [['One', 0], ['two', 0], ['three', 0], ['four', 0], ['five', 0], ['six', 0]]));
  assert.deepEqual(six.deckOnlyWhy, { sentences: 0, blanks: 2, other: 0 });
  const gold = W.build(deck(['Gold and gold and gold, then silver and bronze.'], [['Gold', 0], ['silver', 0], ['bronze', 0]]));
  assert.deepEqual(gold.deckOnlyWhy, { sentences: 0, blanks: 1, other: 0 });
});

test('worksheet › why: any other reason is "other", and the three reasons always add up to the deck-only count', () => {
  // No usable target; side by side with another blank; an item dropped
  // because "tariff" cannot be blanked cleanly there.
  const d = deck(['The tariff rose again this spring.', 'The quota fell again this spring.',
    'The grain levy fell again this spring.', 'A new tariff came in last week.'],
  [['tariff', 0], ['quota', 1], ['grain', 2], ['levy', 2], ['iff came', 3]]);
  d.cards[1] = { ...d.cards[1], target: { at: 90, length: 4 } };
  const sheet = W.build(d);
  assert.equal(sheet.items.length, 2);
  assert.deepEqual(sheet.deckOnlyWhy, { sentences: 0, blanks: 0, other: 3 });
  for (const deckOf of DECKS) {
    for (const extra of [{}, { limit: 3 }]) {
      const s = sheetOf(deckOf, extra);
      const { sentences, blanks, other } = s.deckOnlyWhy;
      assert.equal(sentences + blanks + other, s.deckOnly, deckOf.name);
    }
  }
});

test('worksheet › a card with no usable target, or unticked, is never a gap', () => {
  const d = deck(['The tariff rose again this spring.', 'The quota fell again this spring.', 'The levy held firm this spring.'],
    [['tariff', 0], ['quota', 1], ['levy', 2]]);
  d.cards[1] = { ...d.cards[1], target: { at: 90, length: 4 } };
  d.keep[2] = false;
  const sheet = W.build(d);
  assert.deepEqual(sheet.bank, ['tariff']);
  assert.equal(sheet.deckOnly, 1);
  assert.equal(W.build({ ...d, keep: [false, false, false] }).items.length, 0);
});

test('worksheet › the options: full text off and answer key on by default', () => {
  const d = deck(['The tariff rose again this spring.', 'It fell.'], [['tariff', 0]]);
  const plain = W.build(d);
  assert.equal(plain.paragraphs, null);
  assert.ok(Array.isArray(plain.key));
  const both = W.build({ ...d, options: { fullText: true, answerKey: false } });
  assert.deepEqual(both.paragraphs, ['The tariff rose again this spring.', 'It fell.']);
  assert.equal(both.key, null);
  assert.deepEqual(both.items, plain.items);
});

// ---- the worksheet rules ----------------------------------

test('worksheet › real sentences only: an end mark (closing quote or bracket allowed) and six words', () => {
  const ok = [
    'The tariff rose again this spring.',
    'Did the tariff rise again this spring?',
    'The tariff rose again this spring!',
    '"The tariff rose again this spring."',
    'The tariff rose again (this spring.)',
    '‘The tariff rose again this spring.’'
  ];
  for (const text of ok) {
    assert.equal(W.build(deck([text], [['tariff', 0]])).items.length, 1, text);
  }
  const no = [
    'The tariff rose this spring.',              // five words
    'The tariff rose again this spring',          // no end mark
    'The tariff rose again this spring:',
    'The tariff rose again this spring.Reuters'   // something after the mark
  ];
  for (const text of no) {
    const sheet = W.build(deck([text], [['tariff', 0]]));
    assert.equal(sheet.items.length, 0, text);
    assert.equal(sheet.deckOnly, 1, text);
  }
});

test('worksheet › real sentences only: the pasted line must end as a sentence does too', () => {
  // A caption: the sentence ends, then the credit runs on to the line's end.
  const text = 'Reuters The suspect was flanked by armed police. Reuters';
  const s = { text: 'Reuters The suspect was flanked by armed police.', start: 0, end: 48 };
  const card = { word: 'flanked', sentence: s, target: { at: s.text.indexOf('flanked'), length: 7 } };
  const sheet = W.build({ cards: [card], keep: [true], text, lineBreaks: true });
  assert.equal(sheet.items.length, 0);
  assert.equal(sheet.deckOnly, 1);
  const whole = W.build({ cards: [card], keep: [true], text: s.text, lineBreaks: true });
  assert.equal(whole.items.length, 1);
});

test('worksheet › real sentences only: a sentence not where it says it is in the text is no item', () => {
  const d = deck(['The tariff rose again this spring.'], [['tariff', 0]]);
  assert.equal(W.build({ ...d, text: 'Something else entirely, and longer than that.' }).items.length, 0);
});

test('worksheet › the news fixture: the timestamp, byline and captions are no longer items', () => {
  const raw = fs.readFileSync(path.join(FIX, 'nasa.chrome.txt'), 'utf8');
  const r = analyse({ raw, start: 0, end: 0, keepLineBreaks: true });
  const sheet = W.build({ cards: r.cards, keep: r.cards.map(() => true), text: raw, lineBreaks: true });
  const items = sheet.items.map(refilled);
  for (const gone of ['2 min read', 'Contract release, Science Mission Directorate', 'eight rotors',
    'the dunes of Saturn’s moon Titan.', 'Launch Complex 39A at Kennedy:']) {
    assert.ok(!items.some((t) => t.includes(gone)), gone);
  }
  assert.ok(items[0].startsWith('NASA has selected SpaceX'), items[0]);
  for (const t of items) assert.match(t, /[.!?]["'”’)]*$/u);
});

test('worksheet › no two gaps side by side: the earlier is kept, the later word is deck-only', () => {
  // "glamping resort": the later word goes, whichever ranks higher.
  const d = deck(['He checked in to the glamping resort near the coast.'], [['resort', 0], ['glamping', 0]]);
  const sheet = W.build(d);
  assert.deepEqual(gapsOf(sheet).map((g) => g.answer), ['glamping']);
  assert.equal(sheet.deckOnly, 1);
  // Punctuation alone between them is still side by side; a word is not.
  const dash = W.build(deck(['They attacked civilian infrastructure – allegedly acting for others.'],
    [['infrastructure', 0], ['allegedly', 0]]));
  assert.deepEqual(gapsOf(dash).map((g) => g.answer), ['infrastructure']);
  const hyphen = W.build(deck(['The tariff-free zone opened again this spring.'], [['tariff', 0], ['free', 0]]));
  assert.deepEqual(gapsOf(hyphen).map((g) => g.answer), ['tariff']);
  const apart = W.build(deck(['The tariff and the quota rose again this spring.'], [['tariff', 0], ['quota', 0]]));
  assert.deepEqual(gapsOf(apart).map((g) => g.answer), ['tariff', 'quota']);
});

test('worksheet › no two gaps side by side: a repeat blanked beside a gap takes its card off the sheet', () => {
  // "levy" is blanked in the second sentence as a repeat, right after "quota".
  const d = deck(['The levy rose again this spring, they said.', 'The new quota levy fell again this spring.'],
    [['levy', 0], ['quota', 1]]);
  const sheet = W.build(d);
  assert.deepEqual(gapsOf(sheet).map((g) => g.answer), ['quota']);
  assert.equal(sheet.deckOnly, 1);
  assert.ok(!sheet.bank.includes('levy'));
});

// Adjacency over every fixture deck, and over seeded hand-made decks.
const crowded = (item) => item.parts.some((p, i) => i > 0 && i < item.parts.length - 1 && !isGap(p)
  && isGap(item.parts[i - 1]) && isGap(item.parts[i + 1]) && /^[\s\p{P}]*$/u.test(p));

test('worksheet › no two gaps side by side, over every fixture deck', () => {
  for (const d of DECKS) {
    for (const it of sheetOf(d).items) assert.ok(!crowded(it), `${d.name}: item ${it.number}`);
  }
});

test('worksheet › no two gaps side by side, verbatim and no leaks: 2,000 seeded hand-made decks', () => {
  const r = rng(11);
  const WORDS = ['tariff', 'Tariff', 'quota', 'levy', 'duty', 'Duty', 'trade', 'rose', 'fell', 'the', 'and', 'of'];
  const JOIN = [' ', ' ', ' ', ', ', ' – ', '-', ' (', ') ', '; '];
  for (let k = 0; k < 2000; k++) {
    const sentences = [];
    for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
      let t = 'It said';
      for (let w = 4 + Math.floor(r() * 8); w > 0; w--) t += JOIN[Math.floor(r() * JOIN.length)] + WORDS[Math.floor(r() * WORDS.length)];
      sentences.push(`${t}.`);
    }
    const picks = [];
    const seen = new Set();
    for (let j = Math.floor(r() * 6); j > 0; j--) {
      const si = Math.floor(r() * sentences.length);
      const words = sentences[si].match(/\p{L}+/gu).filter((w) => w !== 'It' && w !== 'said');
      const w = words[Math.floor(r() * words.length)];
      if (seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      const at = new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'u').exec(sentences[si]).index;
      picks.push({ si, w, at });
    }
    let start = 0;
    const placed = sentences.map((text) => { const s = { text, start, end: start + text.length }; start += text.length + 1; return s; });
    const cards = picks.map((p) => ({ word: p.w.toLowerCase(), sentence: placed[p.si], target: { at: p.at, length: p.w.length } }));
    const sheet = W.build({ cards, keep: cards.map(() => true), text: sentences.join('\n'), lineBreaks: true });
    const label = JSON.stringify({ sentences, picks });
    const answers = new Set(gapsOf(sheet).map((g) => g.answer.toLowerCase()));
    for (const it of sheet.items) {
      assert.ok(!crowded(it), label);
      assert.ok(sentences.includes(refilled(it)), label);
      assert.deepEqual(wordsIn(visible(it)).filter((w) => answers.has(w)), [], label);
    }
  }
});

test('worksheet › repeated answers: flagged when any answer, case aside, fills more than one gap', () => {
  const once = W.build(deck(['The tariff rose again this spring.', 'The quota fell again this spring.'],
    [['tariff', 0], ['quota', 1]]));
  assert.equal(once.repeats, false);
  const twice = W.build(deck(['The tariff rose again this spring.', 'Then the Tariff and the quota fell again.'],
    [['tariff', 0], ['quota', 1]]));
  assert.equal(twice.repeats, true);
});

test('worksheet › the bank: one entry per answer whatever its case; lower case unless every use is capitalised', () => {
  const d = deck(['Farmers said the Tariff hurt local farmers.', 'The tariff rose again this spring, said Reuters.'],
    [['Farmers', 0], ['tariff', 1], ['Reuters', 1]]);
  const sheet = W.build(d);
  assert.deepEqual(sheet.bank, ['farmers', 'Reuters', 'tariff']);
  // The key keeps the form each gap has in its sentence.
  assert.deepEqual(sheet.key.map((k) => k.answer), ['Farmers', 'Tariff', 'farmers', 'tariff', 'Reuters']);
});

test('worksheet › teacher questions: trimmed, blanks dropped, capped, sections kept apart', () => {
  const long = 'q'.repeat(W.MAX_QUESTION + 50);
  const q = W.cleanQuestions({ before: ['  Who?  ', '', '   ', long], while: ['1', '2', '3', '4', '5', '6'], after: 'not a list' });
  assert.deepEqual(q.before, ['Who?', 'q'.repeat(W.MAX_QUESTION)]);
  assert.deepEqual(q.while, ['1', '2', '3', '4', '5']);
  assert.deepEqual(q.after, []);
  assert.deepEqual(W.cleanQuestions(undefined), W.emptyQuestions());
  assert.deepEqual(W.SECTIONS, ['before', 'while', 'after']);
});

test('worksheet › print: a short line with no closing punctuation reads as a heading, kept with the next', () => {
  for (const line of ['Grievances', 'The River and Its History', 'United States Declaration of Independence (1776)', 'Jane Austen'])
    assert.equal(W.keepsWithNext(line), true, line);
  const nine = 'one two three four five six seven eight nine';
  assert.equal(nine.split(' ').length, W.KEEP_WORDS + 1);
  for (const line of ['He has refused his Assent to Laws.', 'Dear all,', 'Why not?', 'As follows:', '"Stop."', nine, '', '  ', '--'])
    assert.equal(W.keepsWithNext(line), false, line);
});

test('worksheet › print: pairs never overlap, never start at the last line, and a run of heading lines keeps its last with what follows', () => {
  assert.deepEqual(W.keptPairs(['Part One', 'Chapter 1', 'The River', 'It was a long day.']), [0, 2]);
  assert.deepEqual(W.keptPairs(['A sentence.', 'Heading']), []);
  assert.deepEqual(W.keptPairs([]), []);
  for (const d of DECKS.filter((_, i) => i % 21 === 0)) {
    const lines = sheetOf(d, { options: { fullText: true } }).paragraphs;
    const starts = W.keptPairs(lines);
    starts.forEach((s, j) => {
      assert.ok(W.keepsWithNext(lines[s]) && s + 1 < lines.length, d.name);
      if (j > 0) assert.ok(s > starts[j - 1] + 1, d.name);
    });
    // Every heading-like line is a pair's start unless its next line is.
    lines.forEach((l, i) => {
      if (i + 1 < lines.length && W.keepsWithNext(l)) assert.ok(starts.includes(i) || starts.includes(i + 1), `${d.name}: ${l}`);
    });
  }
});

test('worksheet › print: the Declaration\'s "Grievances" is kept with the grievance after it', () => {
  for (const file of ['wikisource.chrome.txt', 'wikisource.firefox.txt']) {
    const d = DECKS.find((x) => x.name === `${file} lineBreaks=true`);
    const lines = sheetOf(d, { options: { fullText: true } }).paragraphs;
    const at = lines.findIndex((l) => l.trim() === 'Grievances');
    assert.ok(at >= 0 && W.keptPairs(lines).includes(at) && /^He has refused/.test(lines[at + 1]), file);
  }
});
