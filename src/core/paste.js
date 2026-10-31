// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The paste normaliser.
// ============================================================
// Turns what the teacher pasted into the `text` harvest reads, and maps the
// textarea's selection onto it. Pure: no DOM, no storage.
//
// THE SAME WHITESPACE RULES AS THE EXTENSION'S EXTRACTOR, which built its
// text from the page: every run of whitespace collapses to one character, the text
// is trimmed, and a `\n` in the result is a hard sentence boundary for
// sentence-core. The extractor put that `\n` at block elements; a paste has no
// elements, so the line breaks are what is left of them, and:
//
//   a blank line (two or more line breaks in one run)  ->  '\n', always
//   one line break, `keepLineBreaks` on                 ->  '\n'
//   one line break, `keepLineBreaks` off                ->  ' '
//   any other run                                       ->  ' '
//
// with two exceptions, in join mode only. A single line break between a
// hyphen ending a word and the letter or digit that carries on ("third-\n
// party") collapses to nothing, giving "third-party". The hyphen is never
// removed. A hyphen that was only there for the wrap and is kept costs a
// declined card ("written with a hyphen"); one that was real and is removed
// invents a word. And a single line break after a heading-like line stays
// '\n' (HEADING_BREAK below); the hyphen join goes first.
//
// "Whitespace" is JavaScript's `\s`, as in the extractor — so a no-break space
// collapses like any other. A line break is `\n`, `\r\n`, a lone `\r` or
// U+2028; U+2029 (paragraph separator) counts as a blank line.
//
// WHICH WAY THE DEFAULT FALLS was measured, not assumed: see
// tests/fixtures/paste/README.md. Web pages copied from Chrome and Firefox
// put a single line break between blocks (headline, byline, caption,
// paragraph) and never inside a sentence; PDFs and plain-text email put one
// at every wrapped line.
//
// THE CAP is the extractor's 120,000 characters, applied to the normalised text
// and cut back to the last whitespace so the final word is never half a word.
// `truncated` says it happened; the caller must tell the teacher.
// ============================================================

const MAX_CHARS = 120000;
const KEEP_LINE_BREAKS_DEFAULT = true;

// One run of whitespace, and the line breaks inside it.
const WS = /\s+/g;
const BREAK = /\r\n|[\n\r\u2028]|(\u2029)/g;
// A hyphen ending a word, and what may carry on after it across a line end.
const WORD_HYPHEN = /[\p{L}\p{N}][-\u2010]$/u;
const CARRIES_ON = /[\p{L}\p{N}]/u;

// Whether a line reads as a heading: at most KEEP_WORDS words and no closing
// . ! ? : ; or , (then any closing quotes or brackets). The printed worksheet
// keeps such a line with the next (worksheet.js); join mode keeps its line
// break when HEADING_BREAK also holds.
const KEEP_WORDS = 8;
const CLOSED = /[.!?:;,][\p{Pf}\p{Pe}"']*\s*$/u;
const wordCount = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const keepsWithNext = (line) => wordCount(line) > 0 && wordCount(line) <= KEEP_WORDS && !CLOSED.test(line);

// HEADING_BREAK, join mode only: a single line break stays one after a
// heading-like line that is also short against the paste (at most
// HEADING_SHARE of its median line, in characters), does not end in a word
// that carries a sentence on (an article, determiner, conjunction or
// preposition), and is followed by a capital or a digit. A heading keeps its
// own line, as in keep mode, so "Grievances" is never glued to the sentence
// under it. Measured on the fixtures and on their text re-wrapped at 25 to 70
// characters (fixtures README): it keeps breaks at headings, titles, bylines
// and page clutter, and never inside a sentence.
const HEADING_SHARE = 0.6;
const CARRIES_SENTENCE = new Set(('a an the this that these those my your his her its our their ' +
  'and or but nor so if as than of to in on at by for with from into onto upon about over under ' +
  'via per').split(' '));
const STARTS_CAPITAL = /^[\p{Lu}\p{N}]/u;
function medianLine(src) {
  const lens = src.split(/\r\n|[\n\r\u2028\u2029]/).map((l) => l.trim().length).filter((n) => n > 0)
    .sort((a, b) => a - b);
  return lens.length ? lens[lens.length >> 1] : 0;
}
function headingBreak(line, next, median) {
  return keepsWithNext(line) && line.length <= HEADING_SHARE * median
    && !CARRIES_SENTENCE.has(line.toLowerCase().match(/[\p{L}\p{N}]+/gu).at(-1))
    && STARTS_CAPITAL.test(next);
}

// How many line breaks a whitespace run holds. U+2029 counts as two: it is a
// paragraph separator, so it is a blank line on its own.
function breaksIn(run) {
  let n = 0;
  for (const m of run.matchAll(BREAK)) n += m[1] ? 2 : 1;
  return n;
}

// normalise(raw, { keepLineBreaks }) -> { text, truncated, map }
//
// `map` is an Int32Array of raw.length + 1 entries: map[i] is the offset in
// `text` that raw offset i lands on. Monotonic, so a raw selection [s, e)
// becomes [map[s], map[e]). Inside a collapsed run, the run's first raw
// character maps to the collapsed character and every later one maps just
// past it. Offsets in trimmed whitespace map to 0 or text.length; offsets
// beyond the cap map to text.length.
function normalise(raw, opts = {}) {
  const src = typeof raw === 'string' ? raw : '';
  const keep = opts.keepLineBreaks === undefined
    ? KEEP_LINE_BREAKS_DEFAULT : opts.keepLineBreaks === true;
  const n = src.length;
  const map = new Int32Array(n + 1);
  const median = keep ? 0 : medianLine(src);
  let out = '';
  let i = 0;
  // Where the raw line holding i starts, for HEADING_BREAK; a line joined at a
  // hyphen goes on as one line.
  let lineFrom = 0;
  // Built in one pass, so the text and the mapping cannot disagree.
  while (i < n && out.length <= MAX_CHARS) {
    WS.lastIndex = i;
    const m = WS.exec(src);
    const runStart = m ? m.index : n;
    for (; i < runStart; i++) {
      map[i] = out.length;
      out += src[i];
    }
    if (!m) break;
    const runEnd = runStart + m[0].length;
    if (out.length === 0 || runEnd === n) {
      // Leading or trailing: trimmed, so the run lands where text resumes.
      for (; i < runEnd; i++) map[i] = out.length;
      continue;
    }
    const breaks = breaksIn(m[0]);
    if (breaks === 1 && !keep && WORD_HYPHEN.test(out.slice(-2)) && CARRIES_ON.test(src[runEnd])) {
      // A word hyphenated at a line end: the run is dropped, the hyphen kept.
      for (; i < runEnd; i++) map[i] = out.length;
      continue;
    }
    map[i] = out.length;
    out += breaks >= 2 || (breaks === 1 && (keep || headingBreak(src.slice(lineFrom, runStart).trim(), src[runEnd], median)))
      ? '\n' : ' ';
    if (breaks > 0) lineFrom = runEnd;
    for (i += 1; i < runEnd; i++) map[i] = out.length;
  }
  // Stopped early on a long paste: whatever is left lands at the end.
  let truncated = /\S/.test(src.slice(i));
  for (; i <= n; i++) map[i] = out.length;

  if (out.length > MAX_CHARS) {
    truncated = true;
    // Back to the last whitespace at or before the cap, so no word is cut.
    let cut = MAX_CHARS;
    while (cut > 0 && !/\s/.test(out[cut])) cut--;
    if (cut === 0) cut = MAX_CHARS;
    out = out.slice(0, cut).trimEnd();
    for (let k = 0; k <= n; k++) if (map[k] > out.length) map[k] = out.length;
  }
  return { text: out, truncated, map };
}

// Does this paste look hard-wrapped, as PDFs and plain-text email are? Only a
// hint for the teacher; it changes nothing by itself. The signal is a single
// line break followed by a lowercase letter: a sentence carrying on. In the
// web-page fixtures that almost never happens, because their single breaks
// sit between blocks; in the PDF and email fixtures it is most of them.
const WRAP_MIN = 3;
const WRAP_SHARE = 0.25;
function looksWrapped(raw) {
  const lines = (typeof raw === 'string' ? raw : '').split(/\r\n|[\n\r\u2028]/);
  let single = 0;
  let carried = 0;
  for (let k = 0; k + 1 < lines.length; k++) {
    if (!/\S/.test(lines[k]) || !/\S/.test(lines[k + 1])) continue;
    single++;
    if (/^\s*\p{Ll}/u.test(lines[k + 1])) carried++;
  }
  return carried >= WRAP_MIN && carried >= single * WRAP_SHARE;
}

// The selection harvest gets. With nothing selected (start === end) the whole
// text is the passage, as the extension did with no highlight. `empty` is a
// selection that held something in the textarea but nothing after
// normalising — only whitespace, or only text past the cap.
function selectionOf(normalised, start, end) {
  const { text, map } = normalised;
  const last = map.length - 1;
  const s = Math.max(0, Math.min(last, Math.min(start, end) | 0));
  const e = Math.max(0, Math.min(last, Math.max(start, end) | 0));
  if (s === e) return { from: 0, to: text.length, whole: true, empty: text.length === 0 };
  const from = map[s];
  const to = map[e];
  return { from, to, whole: false, empty: to <= from || !/\S/.test(text.slice(from, to)) };
}

export {
  normalise, selectionOf, looksWrapped, wordCount, keepsWithNext,
  MAX_CHARS, KEEP_LINE_BREAKS_DEFAULT, KEEP_WORDS, HEADING_SHARE
};
