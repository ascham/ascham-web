// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The page: paste, highlight, review, and what a teacher takes
// away: the Anki CSV, the printed list, the worksheet, the project; and the
// settings panel with the licence key.
//
// `deck` below is the only copy of what the teacher pasted and what came of
// it. It lives as long as the tab and is written nowhere but a file the
// teacher asks for (promise 3).
//
// Pro controls are disabled without a key, each with its "Part of Pro." line
// (Print worksheet only aria-disabled, so it stays in the Tab order), but the gate is pro.js's, where each action runs: this file only asks.

import { LIMIT } from './pipeline.js';
import * as Pro from './pro.js';
import { TIERS, parseTerms } from '../core/settings-core.js';
import { majorOf } from '../core/licence-core.js';
import { VERSION } from '../core/version.js';
import { looksWrapped, MAX_CHARS } from '../core/paste.js';
import * as Review from './review.js';
import * as S from './strings.js';
import * as Files from './files.js';
import * as Project from './project.js';
import * as Sheet from './worksheet.js';
import { save } from './download.js';

const $ = (id) => document.getElementById(id);
const els = {
  open: $('open'), title: $('title'), sourceField: $('source-field'),
  paste: $('paste'), keepBreaks: $('keep-breaks'), read: $('read'),
  hint: $('hint'), status: $('status'), notice: $('notice'),
  results: $('results'), heading: $('results-heading'),
  deckTitle: $('deck-title'), deckSource: $('deck-source'), note: $('note'),
  dropped: $('dropped'), tally: $('tally'), all: $('all'), none: $('none'),
  door: $('door'), cards: $('cards'), declined: $('declined'),
  actions: $('actions'), exportCsv: $('export-csv'), printList: $('print-list'),
  printSheet: $('print-sheet'), styleBasicWhy: $('style-basic-why'), save: $('save'), printout: $('printout'),
  worksheet: $('worksheet'), fullText: $('opt-full-text'), answerKey: $('opt-answer-key'),
  questions: $('questions'), deckOnly: $('deck-only'), sheet: $('sheet'),
  confirm: $('confirm'), confirmYes: $('confirm-yes'), confirmNo: $('confirm-no'),
  reset: $('reset'), resetConfirm: $('reset-confirm'), resetYes: $('reset-yes'), resetNo: $('reset-no'),
  licenceState: $('licence-state'), key: $('key'), keySave: $('key-save'), keyRemove: $('key-remove'),
  upgrade: $('upgrade'), terms: $('terms'), deckTag: $('deck-tag'), settingsSave: $('settings-save'),
  settingsSaid: $('settings-said')
};
const radios = (name) => [...document.querySelectorAll(`input[name="${name}"]`)];
const proLines = () => [...document.querySelectorAll('.pro-line')];
// WebCrypto, for the licence. The page never names a public key: pro.js
// checks against the one licence-core.js ships.
const ENV = { subtle: globalThis.crypto && globalThis.crypto.subtle };
// Whether the controls are drawn as Pro. A copy of pro.js's last answer, for
// the page's looks only; every action asks again.
let proShown = false;
const questionBoxes = (section) => [...document.querySelectorAll(`[data-q="${section}"]`)];

// The page's fixed text, from strings.js by key.
for (const node of document.querySelectorAll('[data-s]')) {
  node.textContent = S.PAGE[node.dataset.s];
}
for (const section of Sheet.SECTIONS) {
  questionBoxes(section).forEach((box, i) => box.setAttribute('aria-label', S.questionLabel(section, i + 1)));
}

const EMPTY = { cards: [], keep: [], styles: [], declined: null, withheld: 0, text: '', lineBreaks: true, selection: { from: 0, to: 0 } };
let deck = EMPTY;
// The text as it was last saved to or opened from a project file: opening a
// project over anything else in the box asks first.
let lastFiled = '';
// A project chosen while the box held unsaved text, waiting on the answer.
let pending = null;

// The work on the page, as one string: the box, the line-break choice, the
// title and source, the deck and its ticks, the questions and the worksheet
// options. `filed` is that string as it stood at the last save, open or clear,
// held in this variable and nowhere else; work differs from it until saved.
const state = () => JSON.stringify([els.paste.value, els.keepBreaks.checked, fields(),
  deck.cards.map((c) => c.word), deck.keep, questions(), sheetOptions()]);
let filed = '';
const unsaved = () => state() !== filed;

function show(node, text) {
  node.textContent = text || '';
  node.hidden = !text;
}

const fields = () => ({ title: els.title.value.trim(), source: els.sourceField.value.trim() });
const questions = () => Sheet.cleanQuestions(Object.fromEntries(
  Sheet.SECTIONS.map((s) => [s, questionBoxes(s).map((box) => box.value)])));
const sheetOptions = () => ({ fullText: els.fullText.checked, answerKey: els.answerKey.checked });

// What Ctrl+P prints: the list when there is a deck, the page as it is when
// there is not. "Print worksheet" switches to the sheet until printing ends.
function printDefault() {
  if (deck.cards.length) document.body.dataset.print = 'list';
  else delete document.body.dataset.print;
}

const sheetInput = () => ({ ...deck, ...fields(), questions: questions(), options: sheetOptions() });

// The sheet on screen is pro.js's: the whole sheet with a key, the sample
// without. Each call outdates the ones before it, so a slow answer never
// draws over a newer one. A sample counts only its own items, so it has no
// deck-only line.
let sheetDrawn = 0;
function drawSheet(model) {
  sheetDrawn++;
  Review.renderSheet(els.sheet, model);
  show(els.deckOnly, !model.sample && model.deckOnly > 0 ? S.deckOnlyLine(model.deckOnlyWhy, Sheet.MAX_ITEMS, Sheet.MAX_GAPS) : '');
}
async function updateSheet() {
  const asked = ++sheetDrawn;
  const model = await Pro.sheet(sheetInput(), ENV);
  if (asked === sheetDrawn) drawSheet(model);
}

function updatePrintout() {
  Review.renderPrintout(els.printout, { cards: deck.cards, keep: deck.keep, ...fields() });
  updateSheet();
}

function updateTally() {
  const n = deck.keep.filter(Boolean).length;
  els.tally.textContent = S.tally(n, deck.cards.length);
  updatePrintout();
}

function renderDeck() {
  Review.renderRows(els.cards.tBodies[0], deck.cards, deck.keep, updateTally, proShown ? deck.styles : undefined);
  showDeck();
  els.door.hidden = Review.declinedTotal(deck.declined, deck.withheld) === 0;
}

function showDeck() {
  els.declined.hidden = true;
  els.declined.textContent = '';
  els.cards.hidden = false;
  els.all.hidden = false;
  els.none.hidden = false;
  els.actions.hidden = deck.cards.length === 0;
  els.worksheet.hidden = deck.cards.length === 0;
  els.door.textContent = S.DOOR_OPEN;
  els.door.setAttribute('aria-expanded', 'false');
  updateTally();
}

function showDeclined() {
  Review.renderDeclined(els.declined, deck.declined, deck.withheld);
  els.cards.hidden = true;
  els.declined.hidden = false;
  els.all.hidden = true;
  els.none.hidden = true;
  els.actions.hidden = true;
  els.worksheet.hidden = true;
  els.door.textContent = S.DOOR_SHUT;
  els.door.setAttribute('aria-expanded', 'true');
  els.tally.textContent = S.setAsideTally(Review.declinedTotal(deck.declined, deck.withheld));
}

// Nothing to show, so show nothing — and hold nothing either.
function clearDeck() {
  deck = EMPTY;
  els.cards.tBodies[0].textContent = '';
  els.declined.textContent = '';
  els.declined.hidden = true;
  els.results.hidden = true;
  els.worksheet.hidden = true;
  els.save.hidden = true;
  for (const node of [els.note, els.dropped, els.deckTitle, els.deckSource, els.notice]) show(node, '');
  updatePrintout();
  printDefault();
}

function updateHint() {
  show(els.hint, els.keepBreaks.checked && looksWrapped(els.paste.value) ? S.WRAPPED_HINT : '');
}

// Reads the box. `unticked`, from an opened project, names the words to
// untick once the deck is rebuilt; a word no longer in the deck is ignored.
async function read(unticked = []) {
  els.read.disabled = true;
  clearDeck();
  show(els.status, '');
  const text = els.paste.value;
  const selection = { from: els.paste.selectionStart, to: els.paste.selectionEnd };
  const lineBreaks = els.keepBreaks.checked;
  let result;
  try {
    result = await Pro.readText({ raw: text, start: selection.from, end: selection.to, keepLineBreaks: lineBreaks }, ENV);
  } catch (e) {
    result = { state: 'failed' };
  } finally {
    els.read.disabled = false;
  }

  if (result.truncated) show(els.notice, S.truncatedLine(MAX_CHARS));

  if (result.state === 'no-text') return show(els.status, S.MESSAGES.NO_TEXT);
  if (result.state === 'no-selection') return show(els.status, S.MESSAGES.NO_SELECTION);
  if (result.state === 'failed') return show(els.status, S.MESSAGES.FAILED);

  const { cards, stats } = result;
  const { title, source } = fields();
  show(els.deckTitle, title);
  show(els.deckSource, source);

  if (result.state === 'no-cards') {
    show(els.status, S.noCardsMessage(stats.candidates, result.whole));
    // As in the extension's popup: the list is the whole panel here, with no door and no
    // pickers, and `withheld` is not carried — the line it would point to
    // ("counted in the line above") is not on screen.
    deck = { ...EMPTY, declined: stats.declined };
    if (Review.declinedTotal(deck.declined, 0) > 0) {
      els.results.hidden = false;
      els.door.hidden = true;
      showDeclined();
    }
    return;
  }

  const off = new Set(unticked);
  deck = {
    cards,
    keep: cards.map((c) => !off.has(c.word)),
    // Each card's own style, Pro only: undefined follows the deck.
    styles: [],
    declined: stats.declined,
    withheld: stats.withheld,
    // What made this deck, for the project file: the box may change after.
    text,
    lineBreaks,
    selection
  };
  // Truncation has its own line above, so the note does not say it twice.
  show(els.note, S.setAsideNote(stats, false));
  show(els.dropped, stats.dropped > 0 ? S.droppedLine(LIMIT, stats.dropped) : '');
  els.results.hidden = false;
  els.save.hidden = false;
  renderDeck();
  printDefault();
  els.heading.focus();
}

function setAll(value) {
  deck.keep = deck.keep.map(() => value);
  renderDeck();
}

// ---- the files ----------------------------------------------------------------

async function exportCsv() {
  if (!deck.keep.some(Boolean)) return show(els.status, S.MESSAGES.NOTHING_TICKED);
  show(els.status, '');
  save(await Pro.csvFile({ ...deck, ...fields() }, ENV));
}

function printList() {
  if (!deck.keep.some(Boolean)) return show(els.status, S.MESSAGES.NOTHING_TICKED);
  show(els.status, '');
  updatePrintout();
  document.body.dataset.print = 'list';
  window.print();
}

async function printSheet() {
  if (!deck.keep.some(Boolean)) return show(els.status, S.MESSAGES.NOTHING_TICKED);
  updatePrintout();
  show(els.status, '');
  const said = await Pro.printSheet({
    input: sheetInput(),
    print: (model) => {
      drawSheet(model);
      document.body.dataset.print = 'sheet';
      window.print();
    }
  }, ENV);
  if (said === 'pro') show(els.status, S.MESSAGES.PRO_ONLY);
  if (said === 'no-worksheet') show(els.status, S.MESSAGES.NO_WORKSHEET);
}

// ---- Pro, the licence key and the settings ------------------------------------------

// Draws the page as the licence says: the state in plain words, Pro controls
// on or off with their lines, the upgrade line, and the settings shown.
async function showPro(said) {
  const verdict = said || await Pro.verdict(ENV);
  proShown = verdict.ok === true;
  els.licenceState.textContent = S.licenceSaid(verdict, majorOf(VERSION));
  // Focusable either way, so its "Part of Pro." line is reached; pro.js refuses.
  els.printSheet.setAttribute('aria-disabled', String(!proShown));
  els.styleBasicWhy.textContent = S.basicWhy(proShown);
  for (const line of proLines()) line.hidden = proShown;
  els.upgrade.hidden = proShown;
  for (const field of [...radios('tier'), ...radios('card-style'), els.terms, els.deckTag, els.settingsSave]) {
    field.disabled = !proShown;
  }
  const shown = await Pro.settingsShown(ENV);
  for (const r of radios('tier')) r.checked = r.dataset.v === shown.tier;
  for (const r of radios('card-style')) r.checked = r.dataset.v === (shown.cloze ? 'cloze' : 'basic');
  els.terms.value = shown.terms.join('\n');
  els.deckTag.value = shown.tag;
  if (deck.cards.length) renderDeck();
}

async function saveKey() {
  show(els.settingsSaid, '');
  const said = await Pro.enterKey(els.key.value, ENV);
  if (said.ok === true && said.kept === false) {
    els.licenceState.textContent = S.LICENCE.notKept;
    return;
  }
  if (said.ok === true) els.key.value = '';
  await showPro(said.ok === true ? said : undefined);
  // A refused key leaves the state as it was and says why, after it.
  if (said.ok !== true) els.licenceState.textContent = S.licenceSaid(said, majorOf(VERSION));
}

async function removeKey() {
  Pro.removeKey();
  els.key.value = '';
  show(els.settingsSaid, '');
  await showPro();
}

async function saveSettings() {
  const chosen = (name) => (radios(name).find((r) => r.checked) || { dataset: {} }).dataset.v;
  const tier = chosen('tier') || TIERS.STANDARD;
  const cloze = chosen('card-style') === 'cloze';
  const said = await Pro.saveSettings({ tier, terms: parseTerms(els.terms.value), cloze, tag: els.deckTag.value }, ENV);
  show(els.settingsSaid, said === 'saved' ? S.MESSAGES.SETTINGS_SAVED
    : said === 'pro' ? S.MESSAGES.SETTINGS_PRO : S.MESSAGES.SETTINGS_FAILED);
  if (said === 'saved') await showPro();
}

function saveProject() {
  if (deck.text.length > Project.MAX_TEXT) return show(els.status, S.tooLongToSave(Project.MAX_TEXT));
  show(els.status, '');
  save(Files.projectFile({ ...deck, ...fields(), questions: questions(), worksheet: sheetOptions() }));
  lastFiled = deck.text;
  filed = state();
}

function applyProject(p) {
  els.title.value = p.title;
  els.sourceField.value = p.source;
  els.paste.value = p.text;
  els.keepBreaks.checked = p.lineBreaks;
  els.fullText.checked = p.worksheet.fullText;
  els.answerKey.checked = p.worksheet.answerKey;
  for (const section of Sheet.SECTIONS) {
    questionBoxes(section).forEach((box, i) => { box.value = p.questions[section][i] || ''; });
  }
  els.questions.open = Sheet.SECTIONS.some((s) => p.questions[s].length > 0);
  els.paste.setSelectionRange(p.selection.from, p.selection.to);
  lastFiled = p.text;
  updateHint();
  read(p.unticked).then(() => { filed = state(); });
}

function answerConfirm(replace) {
  const p = pending;
  pending = null;
  if (els.confirm.open) els.confirm.close();
  if (replace && p) applyProject(p);
  else els.paste.focus();
}

function openProject() {
  const file = els.open.files && els.open.files[0];
  // Cleared at once, so choosing the same file again still opens it.
  els.open.value = '';
  if (!file) return;
  if (file.size > Project.MAX_FILE_BYTES) return show(els.status, S.projectRefused('too-big'));
  const reader = new FileReader();
  reader.addEventListener('error', () => show(els.status, S.MESSAGES.READ_FAILED));
  reader.addEventListener('load', () => {
    const parsed = Project.parse(reader.result);
    if (!parsed.ok) {
      clearDeck();
      return show(els.status, S.projectRefused(parsed.code));
    }
    show(els.status, '');
    const box = els.paste.value;
    if (box !== '' && box !== lastFiled) {
      pending = parsed.project;
      els.confirm.showModal();
      els.confirmNo.focus();
      return;
    }
    applyProject(parsed.project);
  });
  reader.readAsText(file, 'utf-8');
}

// "Start again": the page as it opens, the settings and key untouched. Over
// unsaved work it asks first, with "Keep my work" focused.
function clearPage() {
  for (const field of [els.paste, els.title, els.sourceField, ...document.querySelectorAll('input[data-q]')]) field.value = '';
  for (const box of [els.keepBreaks, els.fullText, els.answerKey]) box.checked = box.defaultChecked;
  els.questions.open = false;
  clearDeck();
  show(els.status, '');
  updateHint();
  filed = state();
  els.paste.focus();
}

function startAgain() {
  if (!unsaved()) return clearPage();
  els.resetConfirm.showModal();
  els.resetNo.focus();
}

function answerReset(clear) {
  els.resetConfirm.close();
  if (clear) clearPage();
  else els.reset.focus();
}

els.read.addEventListener('click', () => read());
els.paste.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    read();
  }
});
els.paste.addEventListener('input', updateHint);
els.keepBreaks.addEventListener('change', updateHint);
els.title.addEventListener('input', updatePrintout);
els.sourceField.addEventListener('input', updatePrintout);
els.fullText.addEventListener('change', updatePrintout);
els.answerKey.addEventListener('change', updatePrintout);
els.questions.addEventListener('input', updatePrintout);
els.all.addEventListener('click', () => setAll(true));
els.none.addEventListener('click', () => setAll(false));
els.door.addEventListener('click', () => {
  if (els.declined.hidden) showDeclined();
  else showDeck();
});
els.exportCsv.addEventListener('click', exportCsv);
els.printList.addEventListener('click', printList);
els.printSheet.addEventListener('click', printSheet);
els.save.addEventListener('click', saveProject);
els.open.addEventListener('change', openProject);
els.confirmYes.addEventListener('click', () => answerConfirm(true));
els.confirmNo.addEventListener('click', () => answerConfirm(false));
// Escape closes the dialog: the same as keeping the text.
els.confirm.addEventListener('cancel', () => { pending = null; });
els.reset.addEventListener('click', startAgain);
els.resetYes.addEventListener('click', () => answerReset(true));
els.resetNo.addEventListener('click', () => answerReset(false));
// Leaving the page with unsaved work asks first, in the browser's own words.
// Only asks: the work is kept nowhere but this tab.
window.addEventListener('beforeunload', (e) => {
  if (unsaved()) e.preventDefault();
});
els.keySave.addEventListener('click', saveKey);
els.keyRemove.addEventListener('click', removeKey);
els.settingsSave.addEventListener('click', saveSettings);
window.addEventListener('afterprint', printDefault);
els.door.textContent = S.DOOR_OPEN;
updateHint();
filed = state();
showPro();
