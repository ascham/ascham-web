// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Sentence core.
// ============================================================
// Text in, sentences out, each carrying the offsets it occupied in the input.
//
// THE TRAP THIS FILE EXISTS FOR
// `text.split(/[.!?]/)` looks like it works. It fails on "Dr. Aldana", on
// "U.S. policy", on "e.g.", on "3.5%", on "$1.2bn", on an ellipsis, and on a
// closing quote that follows the stop. Every one of those failures puts a
// FRAGMENT on the back of a flashcard, and a fragment is worse than no card —
// the teacher's whole reason for using this is that the sentence is the real
// one from the reading. The tool looks fine until somebody reads row 14.
//
// WHY OFFSETS, AND NOT JUST STRINGS
// Two callers need to map a position back to a sentence. vocab-core.js has to
// find which sentence a word occurrence sits in, and the page hands us a
// block of text plus the character range the teacher actually highlighted.
// Returning offsets means neither has to re-find anything by searching for the
// substring, which would pick the wrong occurrence whenever a word repeats.
//
// An ES module (the web app). The extension loaded it as a classic script and
// published it on `globalThis`; the logic below is unchanged by the move.
// ============================================================

'use strict';

// ------------------------------------------------------------
// ABBREVIATIONS
//
// A full stop closing one of these is not a sentence end. The list is
// deliberately short and high-frequency: every entry costs a false NEGATIVE
// somewhere (a genuine sentence end that we run through), so a huge list is
// not automatically a better one. These are the ones that actually turn up in
// journalism and academic prose.
//
// THE LAST GROUP WAS ADDED FOR THE SECOND READER OF THIS LIST. vocab-core
// declines a vocabulary card on it, so an abbreviation missing from here does
// not merely join two sentences — it reaches a deck as a word. §7 of the
// article writes the part-of-speech gloss "Det. Noun Prep. Det. Noun Conj.
// Det. Adj. Noun Verb Advb." and the deck carded `adj`, whose back was the
// single word "Adj.".
//
// WHAT THE EIGHT COST WAS MEASURED AND NOT ARGUED, because the standing
// objection to a longer list is the false negative and it deserved a number.
// They remove 22 sentence boundaries in the tree and every one of the 22 is a
// repair: 14 are `Vol.` inside bibliography entries, 8 are that gloss, which
// was being read as nine sentences. None is a genuine sentence end, and none
// could be, because no English sentence ends on `vol`, `adj`, `conj`, `det` or
// `pron`. `prep` is the exception and pays the usual price — "he finished his
// prep." now runs on — which is the same bargain `in`, `no`, `sat` and `max`
// have always struck here, on far commoner words.
//
// THAT NUMBER READ 36 PREVIOUSLY, AND THE 36 WAS DOUBLED. The corpus set
// held the article's §10 and, separately, the two apparatus blocks §10 is made
// of — 50,201 characters against their 50,160 — so every bibliography sighting
// was counted twice, once as itself and once inside the section. What each
// entry is worth did not move: a repair counted twice is still a repair. But a
// cost measured over text that is present twice is not a cost, and the two
// halves were both real corpora, which is why nothing looked wrong.
//
// `advb` IS DELIBERATELY ABSENT though the gloss above uses it and listing it
// would finish the job. It is that page's spelling, not a convention; `adv` is
// the convention and is here. Fitting this list to one article is how a list
// that must serve every page stops being about prose at all.
//
// THE CITATION APPARATUS IS THE OTHER HALF OF THAT PAGE, and `pp`, `ed`, `eds`
// were added for it. They remove 156 boundaries in the article's
// footnotes and bibliography — 143, 7 and 6 — and NOT ONE OF THEM CAN REACH A
// CARD FACE, because the grouping loop drops anything under three letters long
// before the filter that would decline it. What they damage is the BACK, which
// is quoted from the article and is the half of a card this project treats as
// evidence. `Lehohla, Pali, ed.` was a card back. So was `Berlin: Mouton de
// Gruyter. pp.` Sixteen backs change and twelve are simply repaired. The four
// that are not, measured rather than waved at: two `doi` cards go from bad to
// less bad — they stop opening on an orphaned page range and are still
// citation fragments; `amsterdam` moves laterally between two publisher lines,
// neither of them severed, because the vote flipped when the other candidate's
// sentence changed length; and `lexis` is a wash, trading an orphaned head for
// a run-on tail that is not this change's doing, since that footnote body
// carries NO TERMINATOR AT ALL in the source and the sentence must run to the
// next stop. No card was lost, no count moved, and no FACE changed on any of
// the sixteen.
//
// `ed` PAYS A PRICE THE OTHERS DO NOT, AND IT IS THE NAME ED. This list is
// matched without case, so "I spoke to Ed. He said no." now joins, exactly as
// "the second ed." does. That is the `max` bargain — a name that is also an
// abbreviation — struck a second time, on a commoner name; `no` in this same
// list ends sentences far more often than either. logic.test.js asserts the
// join rather than leaving it to be found later.
//
// `p` IS DELIBERATELY ABSENT AND WOULD CHANGE NOTHING. All 244 of its
// sightings are already answered below, by the rule reading a single letter
// after a space as an initial in a name. Listing it removes zero boundaries —
// measured, not assumed — and two rules that catch the same thing are one rule
// and a decoration.
//
// Stored without the trailing stop and matched case-insensitively.
// ------------------------------------------------------------
const ABBREV = new Set([
  // titles
  'mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'hon', 'st', 'sr', 'jr',
  'sgt', 'capt', 'lt', 'col', 'gen', 'gov', 'sen', 'rep', 'pres',
  // latin and editorial
  'e.g', 'i.e', 'etc', 'cf', 'viz', 'al', 'ibid', 'op', 'cit', 'vs', 'v',
  'approx', 'est', 'incl', 'excl', 'min', 'max', 'no', 'nos',
  // measurement and money
  'kg', 'km', 'cm', 'mm', 'ml', 'lb', 'oz', 'ft', 'in', 'hr', 'sec',
  // organisation and place
  'inc', 'ltd', 'co', 'corp', 'plc', 'dept', 'univ', 'assn', 'bros',
  'ave', 'blvd', 'rd', 'sq', 'mt', 'ft',
  // calendar
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sept', 'sep', 'oct',
  'nov', 'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri',
  'sat', 'sun',
  // reference, and the word classes as a grammar gloss writes them
  'vol', 'vols',
  'adj', 'adv', 'conj', 'det', 'pron', 'prep',
  // the citation apparatus. `p` is not here and is not missing — see above
  'pp', 'ed', 'eds'
]);

// Characters that may legitimately trail a terminator and still belong to the
// sentence that is ending: closing quotes and brackets, in the several forms a
// real web page uses.
const TRAILING = new Set(['"', "'", '”', '’', ')', ']', '}', '»']);

// Words that begin a sentence far more often than they continue a noun
// phrase. Consulted ONLY to resolve a stop that closed an acronym — see
// classifyStop's 'soft' verdict. Kept small on purpose: every entry is a
// chance to split "the U.S. Senate", and the damage from splitting wrongly is
// worse than from joining wrongly.
//
// KNOWN RESIDUAL: "based in the U.S. Senate rules do not apply" joins, because
// "Senate" is not here and cannot be — adding it would split "the U.S. Senate
// approved it". The sentence is genuinely ambiguous without parsing, and a
// joined pair still reads as a complete, honest quotation from the article.
const STARTERS = new Set([
  'the', 'this', 'that', 'these', 'those', 'it', 'he', 'she', 'they', 'we',
  'but', 'and', 'however', 'yet', 'still', 'meanwhile', 'now', 'then',
  'there', 'some', 'many', 'most', 'in', 'on', 'at', 'by', 'for', 'after',
  'before', 'when', 'while', 'if', 'although', 'despite', 'since', 'as',
  'a', 'an', 'its', 'his', 'her', 'their', 'our', 'no', 'not', 'one',
  'first', 'last', 'next', 'other', 'another', 'such', 'what', 'who', 'why'
]);

// ------------------------------------------------------------
// IS THIS FULL STOP A SENTENCE END?
//
// Called only at a position already known to hold . ! or ?. Returns:
//   'hard'  — a terminator; the caller still checks what follows
//   'soft'  — closed an acronym, which MIGHT still end a sentence. "the U.S.
//             Senate" continues; "based in the U.S. The vote" does not. Only
//             the following word can tell them apart.
//   'no'    — not a sentence end under any reading
//
// The soft verdict exists because an absolute one is wrong in both
// directions. Treat every acronym stop as a terminator and "the U.S. Senate"
// splits into a fragment; treat none as one and every sentence ending in an
// acronym swallows its successor.
// ------------------------------------------------------------
function classifyStop(text, i) {
  const ch = text[i];

  // ! and ? are almost never ambiguous. The one common case is a run of them
  // ("What?!"), handled by the caller consuming the whole run.
  if (ch === '!' || ch === '?') return 'hard';

  // ---- from here, ch === '.' ----

  // A decimal point, a version number, or a thousands separator: digit on both
  // sides. "3.5%", "$1.2bn", "v2.1". Checked first because it is the cheapest
  // test and one of the commonest failures.
  if (/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) return 'no';

  // An ellipsis. Three stops are one piece of punctuation, and while it CAN
  // end a sentence, mid-sentence use ("a long, drawn-out ... pause") is common
  // enough that running them together is the safer error: a slightly long
  // sentence beats a fragment.
  if (text[i + 1] === '.' || text[i - 1] === '.') return 'no';

  // An initial in a name: single letter, preceded by a space or the start of
  // the text. "J. R. R. Tolkien", "George W. Bush".
  //
  // The preceding character must be WHITESPACE, not merely a non-letter. A dot
  // there means we are inside an acronym — the "S." of "U.S." — and that has
  // to fall through to the walk-back below. Testing for non-letter instead
  // swallows every acronym's final stop and makes the soft verdict below
  // unreachable.
  const prev2 = i >= 2 ? text[i - 2] : ' ';
  if (/[A-Za-z]/.test(text[i - 1] || '') && /\s/.test(prev2)) return 'no';

  // A dotted acronym: "U.S.", "U.K.", "Ph.D.". These end in a stop that looks
  // exactly like a terminator. Walk back over letter-dot pairs; two or more
  // means an acronym. Soft, not no: the following word decides.
  let j = i;
  let pairs = 0;
  while (j >= 1 && text[j] === '.' && /[A-Za-z]/.test(text[j - 1])) {
    pairs++;
    j -= 2;
  }
  if (pairs >= 2) return 'soft';

  // A known abbreviation. Read back the word that this stop closes.
  //
  // These stay absolute rather than soft, and the asymmetry is deliberate: an
  // abbreviation is nearly always followed by the thing it qualifies ("Dr.
  // Aldana", "approx. 40"), whereas an acronym as often ends a clause as not.
  let k = i - 1;
  while (k >= 0 && /[A-Za-z.]/.test(text[k])) k--;
  const word = text.slice(k + 1, i).toLowerCase();
  if (ABBREV.has(word)) return 'no';

  return 'hard';
}

// The word after a soft stop, lower-cased, or '' if there is none. Used only
// to resolve the acronym case.
function nextWord(text, i) {
  let j = i;
  while (j < text.length && (TRAILING.has(text[j]) || /\s/.test(text[j]))) j++;
  while (j < text.length && /["'“‘(\[«]/.test(text[j])) j++;
  let e = j;
  while (e < text.length && /[A-Za-z]/.test(text[e])) e++;
  return text.slice(j, e).toLowerCase();
}

// ------------------------------------------------------------
// WHAT FOLLOWS A TERMINATOR?
//
// Even a real terminator only ends a sentence if something plausibly starts
// after it. This is what rescues the acronym case above: "the U.S. Senate"
// continues, "based in the U.S. The vote" does not.
// ------------------------------------------------------------
function startsNewSentence(text, i) {
  let j = i;

  // Step over trailing quotes and brackets.
  while (j < text.length && TRAILING.has(text[j])) j++;

  // End of input is a sentence end.
  if (j >= text.length) return true;

  // There must be whitespace between the terminator and the next sentence.
  // Without this, "google.com" and "3.Section" would both split.
  if (!/\s/.test(text[j])) return false;
  while (j < text.length && /\s/.test(text[j])) j++;
  if (j >= text.length) return true;

  // Step over an opening quote or bracket on the new sentence.
  while (j < text.length && /["'“‘(\[«]/.test(text[j])) j++;
  if (j >= text.length) return true;

  // A new sentence starts with a capital, a digit, or a dash used as a
  // dialogue marker. A lower-case letter means we were wrong about the stop.
  return /[A-Z0-9—–]/.test(text[j]) || !/[a-z]/.test(text[j]);
}

// ------------------------------------------------------------
// SEGMENT
//
// Returns [{ text, start, end }], where start/end are offsets into the input
// and `text` is trimmed. Whitespace between sentences belongs to neither, so
// offsets are NOT contiguous — callers must not assume end === next.start.
// ------------------------------------------------------------
function segment(input) {
  const text = String(input || '');
  const out = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // A newline is a HARD boundary, with no punctuation required.
    //
    // The extension's extractor emitted one wherever it crossed a block
    // element, and a paste keeps one at a line break (paste.js); that is
    // the only way a heading can be kept apart from the paragraph beneath it:
    // "Boundaries Redrawn The commission said..." has no full stop anywhere in
    // it, so no punctuation rule can find the seam. Inserting a fabricated
    // full stop instead would put wording on the card that is not in the
    // article, which is the one thing this product must never do.
    if (ch === '\n') {
      push(out, text, start, i);
      start = i + 1;
      continue;
    }

    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const verdict = classifyStop(text, i);
    if (verdict === 'no') continue;

    // Consume a run of terminators: "What?!" and "Really..." end once.
    let e = i;
    while (e + 1 < text.length && /[.!?]/.test(text[e + 1])) e++;

    if (!startsNewSentence(text, e + 1)) {
      i = e;
      continue;
    }

    // A soft stop closed an acronym. Capitalisation cannot settle it — both
    // "U.S. Senate" and "U.S. The vote" are capitalised — so the question is
    // whether the next word is one that starts sentences.
    if (verdict === 'soft' && !STARTERS.has(nextWord(text, e + 1))) {
      i = e;
      continue;
    }

    // Take the trailing quote or bracket with the sentence it closes.
    let stop = e + 1;
    while (stop < text.length && TRAILING.has(text[stop])) stop++;

    push(out, text, start, stop);
    start = stop;
    i = stop - 1;
  }

  // Whatever trails the last terminator is a sentence too — an article's final
  // line often has no full stop at all, and a heading never does.
  push(out, text, start, text.length);
  return out;
}

function push(out, text, from, to) {
  const raw = text.slice(from, to);
  const lead = raw.length - raw.trimStart().length;
  const body = raw.trim();
  if (!body) return;
  out.push({ text: body, start: from + lead, end: from + lead + body.length });
}

// ------------------------------------------------------------
// WHICH SENTENCE HOLDS THIS OFFSET?
//
// Binary search, because a long article segmented once is then queried once
// per word occurrence. Returns the index, or -1 for an offset that fell in the
// whitespace between two sentences.
// ------------------------------------------------------------
function sentenceAt(sentences, offset) {
  let lo = 0;
  let hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = sentences[mid];
    if (offset < s.start) hi = mid - 1;
    else if (offset >= s.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

// TRAILING joined the export, for `vocab-core.js`'s rule that
// a card back must end in a stop. That rule has to know which characters
// `segment` pulled INTO a sentence after its terminator, or it refuses every
// quoted sentence in the article — `…said."` ends in a quote, not a stop.
// Exported rather than restated there because this set is the definition of
// what `segment` does, and a second copy would be a second answer the day
// either changed.
export {
  segment, sentenceAt, classifyStop, nextWord, ABBREV, STARTERS, TRAILING
};
