// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The project file: what the teacher pasted and the choices they
// made, as a local .json file they save and open. Pure: no DOM, no storage.
//
//   { format: "<SLUG>-project", version: 2, appVersion, title, source,
//     text, lineBreaks, selection: { from, to }, unticked: [word, …],
//     questions: { before: […], while: […], after: […] },
//     worksheet: { fullText, answerKey } }
//
// Version 1 had no `questions` or `worksheet`; it still opens, with
// no questions and the worksheet's default options. Saving always writes 2.
//
// NEVER CARDS. The file holds the paste and the choices; the cards are
// recomputed from them on open, by the same pipeline as a fresh paste. So a
// file cannot carry a stale deck from an older word list, nor a forged card
// whose sentence is not in its text (promise 4).
//
// `text` is the raw paste, exactly as it was in the box. `selection` is the
// box's selectionStart/selectionEnd when the deck was read, in that raw text.
// `unticked` names cards by their word, not their position, so a later word
// list that reorders the deck still leaves the same words unticked.
//
// OPENING IS STRICT. Anything that is not exactly this shape is refused, with
// a code strings.js turns into words: too big, not JSON, not a project, a newer
// format, a wrong key or type, or a selection outside the text. A file that
// passes is still only data: its text reaches the page through the textarea's
// value and the same textContent path as a paste, and the questions through
// input values and textContent.
//
// KNOWN LIMIT: a duplicated key. JSON.parse keeps the last of two `"text"`
// keys without saying so, and nothing here can see the first. Accepted: the
// file that opens is still exactly this shape.

import { VERSION } from '../core/version.js';
import { SLUG } from '../core/brand.js';
import { LIMIT } from './pipeline.js';
import { SECTIONS, MAX_QUESTIONS, MAX_QUESTION, DEFAULT_OPTIONS, emptyQuestions } from './worksheet.js';

// The format identifier, built from the product's slug (src/core/brand.js).
const FORMAT = `${SLUG}-project`;
const FORMAT_VERSION = 2;

// The longest text a project holds, in UTF-16 units. Generous beside the
// 120,000 the pipeline reads, because the file keeps the paste as it was.
const MAX_TEXT = 500000;
// Title and source: a line each, not a document.
const MAX_LINE = 500;
// A card face is one word.
const MAX_WORD = 100;
// The largest file opened, in bytes. JSON escapes a control character as six
// bytes, so the longest legal text fits with room for everything else.
const MAX_FILE_BYTES = 6 * MAX_TEXT + 64 * 1024;

const KEYS_V1 = ['format', 'version', 'appVersion', 'title', 'source', 'text',
  'lineBreaks', 'selection', 'unticked'];
const KEYS = [...KEYS_V1, 'questions', 'worksheet'];
const SELECTION_KEYS = ['from', 'to'];
const WORKSHEET_KEYS = Object.keys(DEFAULT_OPTIONS);

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.getPrototypeOf(v) === Object.prototype;
const sameKeys = (o, want) => {
  const got = Object.keys(o).sort();
  return got.length === want.length && [...want].sort().every((k, i) => got[i] === k);
};
const isLine = (v) => typeof v === 'string' && v.length <= MAX_LINE;
const isOffset = (v) => Number.isSafeInteger(v) && v >= 0;

// The file's contents, as a string. Two-space indented with a final newline,
// so a teacher who opens it in a text editor can read it.
function serialise({ title, source, text, lineBreaks, selection, unticked, questions, worksheet }) {
  const q = questions || emptyQuestions();
  const w = { ...DEFAULT_OPTIONS, ...(worksheet || {}) };
  const project = {
    format: FORMAT,
    version: FORMAT_VERSION,
    appVersion: VERSION,
    title,
    source,
    text,
    lineBreaks,
    selection: { from: selection.from, to: selection.to },
    unticked: [...unticked],
    questions: { before: [...q.before], while: [...q.while], after: [...q.after] },
    worksheet: { fullText: w.fullText, answerKey: w.answerKey }
  };
  return `${JSON.stringify(project, null, 2)}\n`;
}

// parse(contents) -> { ok: true, project } | { ok: false, code }
// `contents` is the file read as UTF-8 text. The caller checks the file's
// byte size against MAX_FILE_BYTES before reading it at all; the length check
// here is the same bound, for a caller that did not.
function parse(contents) {
  if (typeof contents !== 'string') return { ok: false, code: 'not-project' };
  if (contents.length > MAX_FILE_BYTES) return { ok: false, code: 'too-big' };
  let p;
  try {
    p = JSON.parse(contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents);
  } catch (e) {
    return { ok: false, code: 'not-json' };
  }
  if (!isPlain(p) || p.format !== FORMAT) return { ok: false, code: 'not-project' };
  if (Number.isInteger(p.version) && p.version > FORMAT_VERSION) return { ok: false, code: 'newer' };
  if (p.version !== 1 && p.version !== FORMAT_VERSION) return { ok: false, code: 'bad-shape' };
  if (!sameKeys(p, p.version === 1 ? KEYS_V1 : KEYS)) return { ok: false, code: 'bad-shape' };
  if (p.version === 1) {
    p.questions = emptyQuestions();
    p.worksheet = { ...DEFAULT_OPTIONS };
  }

  const shapeOk =
    typeof p.appVersion === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(p.appVersion) &&
    isLine(p.title) && isLine(p.source) &&
    typeof p.text === 'string' && p.text.length <= MAX_TEXT &&
    typeof p.lineBreaks === 'boolean' &&
    isPlain(p.selection) && sameKeys(p.selection, SELECTION_KEYS) &&
    Array.isArray(p.unticked) && p.unticked.length <= LIMIT &&
    p.unticked.every((w) => typeof w === 'string' && w.length > 0 && w.length <= MAX_WORD) &&
    new Set(p.unticked).size === p.unticked.length &&
    isPlain(p.questions) && sameKeys(p.questions, SECTIONS) &&
    SECTIONS.every((s) => Array.isArray(p.questions[s]) && p.questions[s].length <= MAX_QUESTIONS &&
      p.questions[s].every((q) => typeof q === 'string' && q.length > 0 && q.length <= MAX_QUESTION)) &&
    isPlain(p.worksheet) && sameKeys(p.worksheet, WORKSHEET_KEYS) &&
    WORKSHEET_KEYS.every((k) => typeof p.worksheet[k] === 'boolean');
  if (!shapeOk) return { ok: false, code: 'bad-shape' };

  const { from, to } = p.selection;
  if (!isOffset(from) || !isOffset(to) || from > to || to > p.text.length) {
    return { ok: false, code: 'bad-selection' };
  }
  return {
    ok: true,
    project: {
      appVersion: p.appVersion,
      title: p.title,
      source: p.source,
      text: p.text,
      lineBreaks: p.lineBreaks,
      selection: { from, to },
      unticked: [...p.unticked],
      questions: { before: [...p.questions.before], while: [...p.questions.while], after: [...p.questions.after] },
      worksheet: { fullText: p.worksheet.fullText, answerKey: p.worksheet.answerKey }
    }
  };
}

export { serialise, parse, FORMAT, FORMAT_VERSION, MAX_TEXT, MAX_LINE, MAX_WORD, MAX_FILE_BYTES };
