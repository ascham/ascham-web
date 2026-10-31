// The review table's wording (src/ui/strings.js) and logic (src/ui/review.js),
// rebuilt from the extension's popup.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/ui/review.js';
import * as S from '../src/ui/strings.js';
import { analyse } from '../src/ui/pipeline.js';
import { MAX_ITEMS, MAX_GAPS } from '../src/ui/worksheet.js';

// ---- AND THE TWO SURFACES SAY THE SAME WORDS -------------------------------
//
// Ported from the extension harness (§ set-aside, four cases), where they read
// the popup's source. The headings of the set-aside view are
// character-for-character copies of the phrases setAsideNote() prints in the
// line above the deck; the day the note is reworded and the view is not, the
// product tells a teacher two things about one refusal. Here the note is run
// rather than read: every reason fires once, and each heading must appear in
// what it prints.
const EVERY_REASON = {
  rejected: { name: 1, band1: 1, unbandable: 1, phrase: 1, alone: 1 },
  abbreviations: ['etc.'],
  filtered: 1
};
const headings = S.GROUPS.map((g) => g.heading);
test('set-aside › the view declares three headings', () => {
  assert.equal(headings.length, 3, `found ${headings.length}: ${headings.join(' | ')}`);
});
const printed = S.setAsideNote(EVERY_REASON, false);
for (const heading of headings) {
  test(`set-aside › the note prints this heading word for word: ${heading}`, () => {
    assert.ok(printed.includes(heading), `"${heading}" is on the view and nowhere in setAsideNote()`);
  });
}

// ---- the popup's wording, unchanged -----------------------------------------

test('set-aside › the note reads as the popup wrote it', () => {
  assert.equal(printed, 'Set aside: 1 treated as names, 1 already common, ' +
    '1 written with a hyphen or apostrophe, 1 written as part of a phrase, ' +
    'etc. written as an abbreviation, ' +
    '1 found only on a line of their own, as in a heading, 1 by your settings.');
  assert.equal(S.setAsideNote({ rejected: {}, abbreviations: [] }, false), '');
  assert.equal(S.setAsideNote({ rejected: {}, abbreviations: ['e.g.', 'i.e.', 'etc.'] }, false),
    'Set aside: e.g., i.e. and etc. written as abbreviations.');
});
test('set-aside › the blocklist is never announced', () => {
  const note = S.setAsideNote({ rejected: { taboo: 3 }, abbreviations: [], filtered: 0 }, false);
  assert.equal(note, '');
});
test('set-aside › band 2 is listed before band 1 under "already common"', () => {
  const d = { band1: ['the', 'over'], band2: ['policy'], name: [], unbandable: [] };
  assert.deepEqual(R.wordsFor(d, 'common'), ['policy', 'the', 'over']);
  assert.equal(R.declinedTotal(d, 2), 5);
});
test('set-aside › the withheld line, singular and plural', () => {
  assert.equal(S.withheldLine(1), '1 more is counted in the line above and not listed here.');
  assert.equal(S.withheldLine(3), '3 more are counted in the line above and not listed here.');
});
test('set-aside › door labels', () => {
  assert.deepEqual([S.DOOR_OPEN, S.DOOR_SHUT], ['Set aside', 'Back to the deck']);
});

// ---- the states -------------------------------------------------------------

test('review › empty paste, whitespace selection, no candidates', () => {
  assert.equal(analyse({ raw: '' }).state, 'no-text');
  assert.equal(analyse({ raw: '  \n\n ' }).state, 'no-text');
  assert.equal(analyse({ raw: 'one     two', start: 4, end: 7 }).state, 'no-selection');
  const none = analyse({ raw: 'The dog and the cat.' });
  assert.equal(none.state, 'no-cards');
  assert.equal(S.noCardsMessage(none.stats.candidates, none.whole),
    'Nothing in that text became a card. Try a denser passage.');
  assert.equal(S.noCardsMessage(0, false), 'No words were found in that highlight.');
});
test('review › the deck stops at 40 cards and says how many more ranked below', () => {
  const words = ['ombudsman', 'gerrymandering', 'redistricting', 'councillor', 'entrenched',
    'scrupulous', 'opaque', 'consultation', 'jurisdiction', 'litigation', 'prosecutor',
    'extradition', 'sabotage', 'infrastructure', 'pipeline', 'allegation', 'testimony',
    'adjudicate', 'arbitration', 'tribunal', 'precedent', 'statute', 'injunction',
    'plaintiff', 'defendant', 'indictment', 'acquittal', 'verdict', 'appellate',
    'deposition', 'subpoena', 'affidavit', 'magistrate', 'constable', 'coroner',
    'inquest', 'ombudsperson', 'commissioner', 'legislature', 'bicameral',
    'filibuster', 'caucus', 'plebiscite', 'referendum', 'electorate', 'franchise'];
  const raw = words.map((w) => `The ${w} was discussed at length.`).join(' ');
  const r = analyse({ raw });
  assert.equal(r.cards.length, 40);
  assert.ok(r.stats.dropped > 0, String(r.stats.dropped));
  assert.equal(S.droppedLine(40, 1), 'The deck stops at 40 cards; 1 more word ranked below these.');
  assert.equal(S.droppedLine(40, 3), 'The deck stops at 40 cards; 3 more words ranked below these.');
});
test('review › the deck-only line states the worksheet\'s limit and counts each reason, never a promise that words fit', () => {
  const lead = `The worksheet holds up to ${MAX_ITEMS} sentences, ${MAX_GAPS} blanks each.`;
  assert.equal(lead, 'The worksheet holds up to 15 sentences, 4 blanks each.');
  assert.equal(S.deckOnlyLine({ sentences: 3, blanks: 2, other: 1 }, MAX_ITEMS, MAX_GAPS),
    `${lead} 3 ticked words are in sentences after the first 15, 2 would go past 4 blanks in their sentence, and 1 is in a sentence too short or unfinished to use, or right beside another blank. These stay in the deck only.`);
  assert.equal(S.deckOnlyLine({ sentences: 1, blanks: 0, other: 0 }, MAX_ITEMS, MAX_GAPS),
    `${lead} 1 ticked word is in a sentence after the first 15. It stays in the deck only.`);
  assert.equal(S.deckOnlyLine({ sentences: 0, blanks: 1, other: 2 }, MAX_ITEMS, MAX_GAPS),
    `${lead} 1 ticked word would go past 4 blanks in its sentence and 2 are in sentences too short or unfinished to use, or right beside another blank. These stay in the deck only.`);
  for (let n = 1; n < 27; n++) {
    const why = { sentences: n % 3, blanks: Math.floor(n / 3) % 3, other: Math.floor(n / 9) % 3 };
    const line = S.deckOnlyLine(why, MAX_ITEMS, MAX_GAPS);
    assert.ok(line.startsWith(`${lead} `), line);
    assert.ok(!/\b0\b/.test(line.slice(lead.length)), line);
    assert.ok(!/always|did not fit/i.test(line), line);
  }
});
test('review › the truncation line names the cap', () => {
  assert.equal(S.truncatedLine(120000),
    'Your text was longer than 120,000 characters, so only the first 120,000 were read.');
});
