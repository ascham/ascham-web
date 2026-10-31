// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Every word the page says. The only place wording lives
// (check.sh U1): the other UI modules and index.html carry keys, never text.
//
// Each entry says where it came from. "popup" means the extension's popup and
// "options page" its options page, kept character for character;
// tests/review.test.js holds several of those to the letter. "New" means the
// web app wrote it; every new line is approved before it ships.
//
// Pure: no DOM, nothing at import, so the harness can read it. The product's
// name comes from src/core/brand.js (check.sh B1).

import { NAME, SLUG } from '../core/brand.js';

// ---- the page's fixed text (index.html, by data-s key) ---------------------

const PAGE = Object.freeze({
  appName: NAME,                          // popup; index.html's <title> too, by data-s
  inputHeading: 'Your text',
  titleLabel: 'Title', // split from "Title or source"
  sourceLabel: 'Source',
  optional: '(optional)',
  pasteLabel: 'Paste the text here',
  pasteHelp: 'Select a passage in the box to read only that part. ' +
    'With nothing selected, the whole text is read.',
  pasteTip: "Paste only the article's text, with a blank line between paragraphs, not the page's menus, links or notes.",
  keepBreaks: 'Keep line breaks',
  read: 'Find words',
  openLabel: 'Open a saved project',
  resultsHeading: 'Words',
  all: 'All',                              // popup
  none: 'None',                            // popup
  colKeep: 'Keep',
  colWord: 'Word',
  colLevel: 'Level',
  colSentence: 'Sentence',
  exportCsv: 'Download for Anki (.csv)',
  printList: 'Print vocabulary list',
  printSheet: 'Print worksheet',
  printTip: 'When printing, your browser adds its own header and footer: the date, the page address and page numbers. ' +
    'For a clean sheet, turn off “Headers and footers” in the print dialog (in Chrome and Firefox, under More settings).',
  saveProject: 'Save project',
  worksheetHeading: 'Worksheet',
  optFullText: 'Include the full text',
  optAnswerKey: 'Include answer key',
  questionsSummary: 'Add your own questions (optional)',
  questionsHelp: 'Up to five in each section. Empty sections are not printed.',
  before: 'Before reading',
  while: 'While reading',
  after: 'After reading',
  confirmReplace: 'The box holds text you have not saved. Replace it with the project you opened?',
  confirmYes: 'Replace my text',
  confirmNo: 'Keep my text',
  reset: 'Start again',
  confirmReset: 'This clears the text, the cards and your choices from this page. ' +
    'Anything you have not saved to a project file is lost. Your settings and licence key stay.',
  confirmResetYes: 'Clear the page',
  confirmResetNo: 'Keep my work',
  // ---- Pro, the licence key and the settings ----
  proLine: 'Part of Pro.', // beside each Pro control in free mode
  upgrade: `Pro is a one-time $15 for ${NAME} 1. Buy a key at ${SLUG}.app/buy.`,
  settingsSummary: 'Settings and licence key',
  licenceHeading: 'Your licence key',      // options page
  keyLabel: 'Paste your licence key',
  keyHelp: 'Paste the key we email you. It is checked on this computer against a signature — ' +
    `${NAME} does not contact a server to do it, so once this page is open, checking a key needs no internet connection.`, // options page
  keySave: 'Save key',                     // options page
  // ---- the name ----
  independent: `${NAME} is independent and not affiliated with any school, publisher or institution.`, // footer and README
  licenceLine: 'Open source under the GNU AGPL, version 3: anyone can read, build, verify and change the code, and share changes under the same licence.', // check.sh L1's one sentence: footer and README
  keyRemove: 'Remove key', // the options page said "Remove"
  tierLegend: 'Which words never become a card', // options page
  tierYoung: 'Young learners',             // options page
  tierYoungWhy: 'The standard filter, plus a shortlist of words with innocent meanings a young class does not need ' +
    'to meet on a card — a rooster, a donkey, a female dog.', // options page
  tierStandard: 'Standard',                // options page
  tierStandardWhy: `Slurs and obscenity never become cards. This is what every copy of ${NAME} does, paid or not, ` +
    'and it is what you get if these settings are ever unreadable.', // options page
  tierOff: 'Off — adult and advanced classes', // options page
  tierOffWhy: 'No filter at all. A text about racist language will card the words it is about. ' +
    'Choose this only when that is what the room needs.', // options page
  termsLabel: 'Your own words',            // options page
  termsHelp: 'Words you never want on a card from your own classroom — one per line, or separated by commas. ' +
    'These are added to whichever filter is chosen above, including when it is off. ' +
    'Enter the plain form of a word: “protest” also covers “protests”, “protested” and “protesting”.', // options page
  styleLegend: 'Card style',               // options page
  styleBasic: 'Word and sentence cards',
  styleCloze: 'Fill-in-the-blank cards',   // options page
  styleClozeWhy: 'Instead of the word on the front and the sentence on the back, each card is the sentence with the ' +
    'word blanked out. Anki calls these cloze cards, and the deck imports against Anki’s Cloze note type. ' +
    'This sets the whole deck. Each card in the word list also carries a small control of its own, so a deck ' +
    'that is mostly one kind with a few of the other still goes into Anki as one file.', // options page, "review panel" now "word list"
  tagLabel: 'Your own deck tag',           // options page
  tagHelp: `Every deck is tagged “${SLUG}” and the title you gave the text — or its source, if it has no title, ` +
    'or “deck”, if it has neither. This replaces the second one, so a ' +
    'term’s worth of lessons can share a tag: “Year 9 Autumn” on six texts is one search in Anki, where six ' +
    'titles are six searches. Anki separates tags on spaces, so spaces and punctuation become hyphens on the deck: ' +
    '“Year 9 — Autumn” is written into the file as “Year-9-Autumn”, and that is what you search for. ' +
    'Leave it empty to keep that second tag.', // options page, for titles and tags that keep their case
  settingsSave: 'Save settings'            // options page
});

// ---- the set-aside view (popup) -----------------------------------------

// popup: the door's two labels.
const DOOR_OPEN = 'Set aside';
const DOOR_SHUT = 'Back to the deck';

// popup: the set-aside headings, each a character-for-character copy of a
// phrase setAsideNote() prints. Band 2 is served before band 1 inside the
// heading they share, because band 2 is where a teacher might disagree.
const GROUPS = Object.freeze([
  { key: 'name', heading: 'treated as names' },
  { key: 'common', heading: 'already common' },
  { key: 'unbandable', heading: 'written with a hyphen or apostrophe' }
]);

// popup, unchanged: the line above the deck. Six reasons; the blocklist is
// silent by ruling, and `filtered` is the same
// number the export prints.
function setAsideNote(stats, truncated) {
  const notes = [];
  if (stats.rejected.name) notes.push(`${stats.rejected.name} treated as names`);
  if (stats.rejected.band1) notes.push(`${stats.rejected.band1} already common`);
  if (stats.rejected.unbandable) {
    notes.push(`${stats.rejected.unbandable} written with a hyphen or apostrophe`);
  }
  if (stats.rejected.phrase) {
    notes.push(`${stats.rejected.phrase} written as part of a phrase`);
  }
  const abbrevs = stats.abbreviations;
  if (abbrevs.length) {
    const list = abbrevs.length === 1
      ? abbrevs[0]
      : `${abbrevs.slice(0, -1).join(', ')} and ${abbrevs[abbrevs.length - 1]}`;
    notes.push(`${list} written as ` +
      (abbrevs.length === 1 ? 'an abbreviation' : 'abbreviations'));
  }
  if (stats.rejected.alone) {
    notes.push(`${stats.rejected.alone} found only on a line of their own, as in a heading`);
  }
  if (Number.isInteger(stats.filtered) && stats.filtered > 0) {
    notes.push(`${stats.filtered} by your settings`);
  }
  if (truncated) notes.push('the passage was long and was cut short');
  return notes.length ? `Set aside: ${notes.join(', ')}.` : '';
}

// the popup's withheld line, unchanged.
function withheldLine(n) {
  return n === 1
    ? '1 more is counted in the line above and not listed here.'
    : `${n} more are counted in the line above and not listed here.`;
}

// ---- the deck ----------------------------------------------------------------

// popup: the tally in both views.
const tally = (kept, total) => `${kept} of ${total} selected`;
const setAsideTally = (n) => `${n} set aside`;
// The untick control's accessible name.
const keepWord = (word) => `Keep ${word}`;
// popup: the level chip, `~B2`; the tilde says it is an estimate.
const level = (code) => `~${code}`;
// popup: the words under a set-aside heading.
const wordList = (words) => words.join(', ');
// popup: the badge's explanation, and the word beside a band-4 chip.
const LEVEL_TITLE = `Estimated level. ${NAME}’s own bands, not a CEFR measurement.`;
const ACADEMIC = 'academic';
// popup: a card whose sentence could not be found.
const NO_SENTENCE = '(no sentence found)';

// ---- status lines --------------------------------------------------------------

// Changed from the popup only where it named a page or a highlight the web app
// does not have: "that highlight" becomes "that text" when nothing was
// selected, because then the whole text was read.
const MESSAGES = Object.freeze({
  NO_TEXT: 'Paste a text into the box first.',
  NO_SELECTION: 'That highlight holds no readable text.',            // popup NO_TEXT
  FAILED: `${NAME} could not read that text. Reload the page and try once more.`,
  NOTHING_TICKED: 'Tick at least one word first.',
  READ_FAILED: `${NAME} could not read that file.`,
  NOT_PROJECT: `That file is not an ${NAME} project.`,
  TOO_BIG: `That file is too large to be an ${NAME} project.`,
  NEWER: `That project was saved by a newer ${NAME} than this page. Reload the page and try again.`,
  DAMAGED: `That project file is damaged or was edited, so ${NAME} will not open it.`,
  NO_WORKSHEET: 'None of the ticked words can be gapped on a worksheet.',
  PRO_ONLY: 'Printing the worksheet is part of Pro.',
  SETTINGS_SAVED: 'Settings saved. A changed filter applies the next time you find words.',
  SETTINGS_FAILED: 'This browser would not save your settings.',
  SETTINGS_PRO: 'Settings are part of Pro.'
});

// ---- the licence key ------------------------------------------------------

// What the licence says, in plain words: the state of the key this browser
// holds, or why a pasted one was refused. The options page's lines, except where
// noted.
const LICENCE = Object.freeze({
  missing: `No key saved. ${NAME} is running as the free version.`,
  shape: `That does not look like an ${NAME} key. Copy the whole key from ` +
    'the email we sent you, including the part before the first full stop.',
  encoding: 'That key has been altered since it was issued — even one changed ' +
    'character does this. Paste it again from the email we sent.',
  payload: `That key is not one this version of ${NAME} can read.`,
  signature: `That key was not issued by ${NAME}. If you bought it from us, ` +
    'send us the reference from the email we sent with your key and we will look.',
  // The page has no WebCrypto, so it cannot check anything.
  environment: 'This browser cannot check a licence key on this page.',
  // A good key the browser would not store is a key the page cannot use.
  notKept: `That key is valid, but this browser would not save it, so ${NAME} cannot use it. ` +
    'Check that this browser lets sites save data, then try again.'
});
// options page: a genuine key for another major version.
function ceilingSaid(claim, running) {
  if (!claim || !Number.isInteger(claim.max) || !Number.isInteger(running)) {
    return `That key is genuine but is not for this version of ${NAME}.`;
  }
  return `That key was bought for ${NAME} ${claim.max}. This is ${NAME} ` +
    `${running}, and a major version is a separate purchase — your key still ` +
    `unlocks every ${claim.max}.x release.`;
}
// Pro unlocked. The key's buyer field, an order reference, is never
// shown (PROMISES.md 5); `claim` stays so the callers do not change.
function unlockedSaid(claim, running) {
  return `Pro is unlocked for ${NAME} ${running}.`;
}
// The line for any verdict from pro.js.
function licenceSaid(said, running) {
  if (said && said.ok === true) return unlockedSaid(said.claim, running);
  if (said && said.reason === 'ceiling') return ceilingSaid(said.claim, running);
  return LICENCE[said && said.reason] || LICENCE.environment;
}

// popup, with "that text" for a whole-text read.
function noCardsMessage(candidates, whole) {
  const what = whole ? 'that text' : 'that highlight';
  return candidates === 0
    ? `No words were found in ${what}.`
    : `Nothing in ${what} became a card. Try a denser passage.`;
}

// New: the paste cap, the deck limit, the hard-wrap hint, and the save cap.
const grouped = (n) => n.toLocaleString('en-GB');
function truncatedLine(max) {
  return `Your text was longer than ${grouped(max)} characters, so only the first ${grouped(max)} were read.`;
}
function droppedLine(limit, dropped) {
  return `The deck stops at ${limit} cards; ${dropped} more ${dropped === 1 ? 'word ranked' : 'words ranked'} below these.`;
}
const WRAPPED_HINT = 'This text looks hard-wrapped, as PDFs and plain-text emails are. ' +
  'Some browsers drop the hyphen when they copy a word split across two lines of a PDF, ' +
  'so check words like “thirdparty”. ' +
  'Untick “Keep line breaks” to join the lines back into sentences.';
function tooLongToSave(max) {
  return `This text is longer than ${grouped(max)} characters, too long to save as a project.`;
}

// Why a project file was refused, from src/ui/project.js's codes. Every code
// has a line; one the table does not know reads as damaged.
const PROJECT_REFUSED = Object.freeze({
  'too-big': MESSAGES.TOO_BIG,
  'not-json': MESSAGES.NOT_PROJECT,
  'not-project': MESSAGES.NOT_PROJECT,
  newer: MESSAGES.NEWER,
  'bad-shape': MESSAGES.DAMAGED,
  'bad-selection': MESSAGES.DAMAGED
});
const projectRefused = (code) => PROJECT_REFUSED[code] || MESSAGES.DAMAGED;

// ---- the printout ----------------------------------------------------------------

// New: the heading of a printed list whose teacher gave no title.
const PRINT_UNTITLED = 'Vocabulary';

// ---- the worksheet (new) ------------------------------------------------

// What the printed sheet says. Addressed to the student, so nothing here
// says card, band or deck.
const SHEET = Object.freeze({
  untitled: 'Worksheet',
  name: 'Name:',
  date: 'Date:',
  wordBank: 'Word bank',
  gapFill: 'Fill in the gaps',
  gapFillHow: 'Write a word from the word bank in each gap.',
  repeats: 'Some words are used more than once.',
  answerKey: 'Answer key',
  sample: 'This is a sample. Pro shows and prints the whole worksheet, with your questions and the answer key.'
});
// popup, unchanged: the per-card style control, Pro only. The face says
// what the card asked for; `undefined` follows the deck.
const STYLE_FACES = new Map([
  [undefined, ['deck',
    'Written the way the rest of the deck is. Click for a fill-in-the-blank card.']],
  [true, ['gap',
    'A fill-in-the-blank card, whatever the rest of the deck is. Click for a plain card.']],
  [false, ['plain',
    'A plain card, whatever the rest of the deck is. Click to follow the deck again.']]
]);
// popup: the control's accessible name.
const styleName = (face) => `Card style: ${face}`;
// The Basic card style's explanation. Bold is Pro, so only a paid deck says so.
const basicWhy = (paid) => (paid === true
  ? 'The word on the front and the sentence on the back, with the word in bold.'
  : 'The word on the front and the sentence on the back.');

// An item's number on the sheet, and a gap's accessible name in the preview.
const itemNumber = (n) => `${n}.`;
const gapName = (label) => `Gap ${label}`;
// A question box's accessible name: "Before reading, question 2".
const questionLabel = (section, n) => `${PAGE[section]}, question ${n}`;
// Addressed to the teacher, on the page and never printed: the worksheet's
// limit, then why ticked words are not on it, each reason counted
// (worksheet.js deckOnlyWhy). The first count names the ticked words.
function deckOnlyLine({ sentences = 0, blanks = 0, other = 0 }, maxItems, maxGaps) {
  const parts = [];
  const lead = (n) => (parts.length ? `${n}` : `${n} ticked ${n === 1 ? 'word' : 'words'}`);
  if (sentences) {
    parts.push(sentences === 1
      ? `${lead(1)} is in a sentence after the first ${maxItems}`
      : `${lead(sentences)} are in sentences after the first ${maxItems}`);
  }
  if (blanks) {
    parts.push(`${lead(blanks)} would go past ${maxGaps} blanks in ${blanks === 1 ? 'its' : 'their'} sentence`);
  }
  if (other) {
    parts.push(other === 1
      ? `${lead(1)} is in a sentence too short or unfinished to use, or right beside another blank`
      : `${lead(other)} are in sentences too short or unfinished to use, or right beside another blank`);
  }
  const list = parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  const stay = sentences + blanks + other === 1 ? 'It stays in the deck only.' : 'These stay in the deck only.';
  return `The worksheet holds up to ${maxItems} sentences, ${maxGaps} blanks each. ${list}. ${stay}`;
}

export {
  PAGE, DOOR_OPEN, DOOR_SHUT, GROUPS, setAsideNote, withheldLine,
  tally, setAsideTally, keepWord, level, wordList, LEVEL_TITLE, ACADEMIC, NO_SENTENCE,
  MESSAGES, noCardsMessage, truncatedLine, droppedLine, WRAPPED_HINT,
  tooLongToSave, PROJECT_REFUSED, projectRefused, PRINT_UNTITLED,
  SHEET, itemNumber, gapName, questionLabel, deckOnlyLine,
  LICENCE, ceilingSaid, unlockedSaid, licenceSaid, STYLE_FACES, styleName, basicWhy
};
