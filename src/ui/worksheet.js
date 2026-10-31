// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The worksheet. Pure: no
// DOM, no wording (strings.js), so the harness builds exactly the sheet the
// page prints. review.js renders it.
//
// Built from the ticked cards only, in this order: header; the full text if
// asked for; the word bank; the gap-fill; the teacher's own questions; the
// answer key, on its own page, if asked for.
//
// THE EXTENSION'S WORKSHEET FAILED TWICE: one item per
// card, so a sentence was asked as often as it held cards; and answers leaked,
// item 4 blanking a word item 7 printed. So this file is built round
// sentences, not cards, and every answer is blanked wherever the gap-fill
// shows it:
//
//   - Real sentences only. An item's sentence ends in
//     . ! or ?, a closing quote or bracket allowed after it, and has at least
//     MIN_WORDS words; so does the pasted line it stands in, which turns away
//     captions with a credit after the full stop ("…armed police. Reuters").
//   - One item per sentence, in text order. Every ticked target in it is a
//     gap, at most MAX_GAPS gaps an item; the rest stay deck-only.
//   - No two gaps side by side. Gaps with only whitespace or punctuation
//     between them would be one long blank; the earlier gap is kept and the
//     later word stays deck-only.
//   - No leaks. Any answer that appears as a whole word (any case) in an item
//     is blanked there too, as a gap of its own. An occurrence that overlaps a
//     gap without matching it cannot be blanked cleanly, so the item is
//     dropped. Gaps beyond MAX_GAPS drop the item's lowest-ranked target.
//   - At most MAX_ITEMS items, the first in text order.
//   - The bank lists an answer once whatever its case: in lower case unless
//     every gap it fills is capitalised. The key keeps each gap's own form.
//   - Verbatim. Gaps are cut from the sentence with csv-core's `cutAt`, right
//     to left so each offset is still valid when it is used; each gap's
//     answer is the text it removed, so answers back in their gaps give the
//     sentence exactly (promise 4).
//   - Deterministic: the same deck and choices give the same sheet.
//
// A card is "deck-only" when it is ticked but not a gap: no usable target, or
// one of the caps, or a dropped item. The page tells the teacher how many.

import { cutAt } from '../core/csv-core.js';
import { normalise, wordCount, keepsWithNext, KEEP_WORDS } from '../core/paste.js';

const MAX_ITEMS = 15;
const MAX_GAPS = 4;
const MIN_WORDS = 6;
// The teacher's questions: three sections, each up to MAX_QUESTIONS lines.
const SECTIONS = Object.freeze(['before', 'while', 'after']);
const MAX_QUESTIONS = 5;
const MAX_QUESTION = 300;
const DEFAULT_OPTIONS = Object.freeze({ fullText: false, answerKey: true });

const emptyQuestions = () => ({ before: [], while: [], after: [] });

// The teacher's questions as the sheet uses them: trimmed, blanks dropped,
// each section capped. The project file refuses what breaks the caps; this
// is the same bound for a caller that did not check.
function cleanQuestions(questions) {
  const out = emptyQuestions();
  for (const s of SECTIONS) {
    const list = questions && Array.isArray(questions[s]) ? questions[s] : [];
    out[s] = list.filter((q) => typeof q === 'string')
      .map((q) => q.trim().slice(0, MAX_QUESTION))
      .filter(Boolean)
      .slice(0, MAX_QUESTIONS);
  }
  return out;
}

// Where a card's target sits in its own sentence, or null when it does not
// describe a real slice of that sentence.
function rangeOf(card) {
  const text = card && card.sentence && card.sentence.text;
  if (typeof text !== 'string' || !Number.isInteger(card.sentence.start)) return null;
  if (!cutAt(text, card.target)) return null;
  return { at: card.target.at, length: card.target.length };
}

const overlaps = (a, b) => a.at < b.at + b.length && b.at < a.at + a.length;

// Ends as a sentence does: . ! or ?, then any closing quotes or brackets.
const ENDS = /[.!?][\p{Pf}\p{Pe}"']*$/u;

// A heading-like line of the full text (keepsWithNext, paste.js) is kept on the
// same page as the line after it. Where the printed text's pairs start: each
// heading-like line with the line after it, never a line in two pairs. Paired
// from the end, so in a run of such lines the last is the one kept with what
// follows. -> [index, …]
function keptPairs(lines) {
  const starts = [];
  for (let i = lines.length - 2; i >= 0; i--) {
    if (keepsWithNext(lines[i]) && starts.at(-1) !== i + 1) starts.push(i);
  }
  return starts.reverse();
}

// Whether a card's sentence may be an item: it ends as a sentence does and is
// long enough, and so does the line of `lines` (the normalised text) it
// stands in. A sentence that is not where it says it is in that text fails.
function realSentence(card, lines) {
  const { text, start } = card.sentence;
  if (lines.substr(start, text.length) !== text) return false;
  const from = lines.lastIndexOf('\n', start - 1) + 1;
  const nl = lines.indexOf('\n', start);
  const line = lines.slice(from, nl === -1 ? lines.length : nl);
  return ENDS.test(text.trimEnd()) && ENDS.test(line.trimEnd()) && wordCount(text) >= MIN_WORDS;
}

// Two gaps, in that order, with nothing but whitespace or punctuation between.
const sideBySide = (text, a, b) => /^[\s\p{P}]*$/u.test(text.slice(a.at + a.length, b.at));

// cutMany(text, ranges) -> [text, gap, text, gap, …, text], each gap the
// range it was given plus `answer`, the text it removed. Null when any two
// ranges overlap or any range is not a slice of `text`. Cut right to left:
// each cut shortens only the text to its left, which no later cut indexes
// past, so every offset is still the one it was measured against.
function cutMany(text, ranges) {
  const sorted = [...ranges].sort((a, b) => a.at - b.at);
  for (let i = 1; i < sorted.length; i++) {
    if (overlaps(sorted[i - 1], sorted[i])) return null;
  }
  const parts = [];
  let head = String(text);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const cut = cutAt(head, sorted[i]);
    if (!cut) return null;
    parts.unshift({ ...sorted[i], answer: cut[1] }, cut[2]);
    head = cut[0];
  }
  parts.unshift(head);
  return parts;
}

// Every place one of `forms` stands as a whole word in `text`, in any case.
// A word boundary is anything but a letter, mark or digit, so "tariff's" and
// "tariff-free" hold "tariff" and "tariffs" does not.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function wholeWords(text, forms) {
  const alts = [...forms].filter(Boolean).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (!alts.length) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${alts.map(escapeRe).join('|')})(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  return [...text.matchAll(re)].map((m) => ({ at: m.index, length: m[0].length }));
}

// One pass over the active cards: group them by sentence, apply the target
// cap, and find each item's extra gaps. Returns the items, the ranks this
// pass says must leave (empty when the active set is settled), and those of
// them leaving for the MAX_GAPS cap.
function pass(cards, active) {
  const groups = new Map();
  for (const rank of active) {
    const card = cards[rank];
    const key = card.sentence.start;
    if (!groups.has(key)) groups.set(key, { sentence: card.sentence, members: [] });
    groups.get(key).members.push({ rank, ...rangeOf(card) });
  }
  const leave = [];
  const capped = [];
  const items = [...groups.values()].sort((a, b) => a.sentence.start - b.sentence.start);
  for (const g of items) {
    // Ranks arrive in deck order, so a lower rank is a better card: it wins an
    // overlap, and it is kept when the cap bites.
    const clear = [];
    for (const m of g.members) {
      if (clear.some((k) => overlaps(k, m))) leave.push(m.rank);
      else clear.push(m);
    }
    // Side by side, the earlier in the sentence stays, whatever the ranks.
    const apart = [];
    for (const m of [...clear].sort((a, b) => a.at - b.at)) {
      const last = apart[apart.length - 1];
      if (last && sideBySide(g.sentence.text, last, m)) leave.push(m.rank);
      else apart.push(m);
    }
    const kept = [];
    for (const m of clear) {
      if (!apart.includes(m)) continue;
      if (kept.length === MAX_GAPS) {
        leave.push(m.rank);
        capped.push(m.rank);
      } else kept.push(m);
    }
    g.members = kept;
  }
  if (leave.length) return { items, leave, capped };

  const answers = new Set(items.flatMap((g) => g.members.map((m) => g.sentence.text.substr(m.at, m.length))));
  // The cards behind each answer, in any case: an extra gap belongs to them.
  const owners = new Map();
  for (const g of items) {
    for (const m of g.members) {
      const lower = g.sentence.text.substr(m.at, m.length).toLowerCase();
      if (!owners.has(lower)) owners.set(lower, []);
      owners.get(lower).push(m.rank);
    }
  }
  for (const g of items) {
    const extras = [];
    let clean = true;
    for (const occ of wholeWords(g.sentence.text, answers)) {
      const same = g.members.find((m) => m.at === occ.at && m.length === occ.length);
      if (same) continue;
      if (g.members.some((m) => overlaps(m, occ)) || extras.some((e) => overlaps(e, occ))) clean = false;
      else extras.push(occ);
    }
    if (!clean) {
      leave.push(...g.members.map((m) => m.rank));
    } else {
      // An extra gap side by side with another: the later one's card leaves,
      // and with it every gap of that answer.
      const all = [...g.members, ...extras].sort((a, b) => a.at - b.at);
      let crowded = false;
      for (let i = 1; i < all.length && !crowded; i++) {
        if (!sideBySide(g.sentence.text, all[i - 1], all[i])) continue;
        const later = all[i];
        const theirs = owners.get(g.sentence.text.substr(later.at, later.length).toLowerCase());
        if (Number.isInteger(later.rank)) leave.push(later.rank);
        else if (theirs) leave.push(...theirs);
        else leave.push(...g.members.map((m) => m.rank));
        crowded = true;
      }
      if (!crowded && all.length > MAX_GAPS) {
        leave.push(g.members[g.members.length - 1].rank);
        capped.push(g.members[g.members.length - 1].rank);
      }
    }
    g.extras = extras;
  }
  return { items, leave, capped };
}

// Alphabetical, the same in every browser: a collator for the order, then
// code units to break any tie it leaves.
const COLLATOR = new Intl.Collator('en', { sensitivity: 'variant', caseFirst: 'lower', numeric: false });
const alphabetical = (a, b) => COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

// Capitalised: its first letter is a capital.
const capitalised = (s) => /^[^\p{L}]*[\p{Lu}\p{Lt}]/u.test(s);

// build({ cards, keep, text, lineBreaks, title, source, questions, options, limit })
//   -> { title, source, paragraphs, bank, repeats, items, questions, key, deckOnly }
//
// `limit` cuts the items before the bank, the extra gaps and the key are
// worked out, so a limited sheet is a whole sheet of its own and nothing of
// the items past it is built (pro.js's free sample).
//
//   paragraphs  the normalised text's lines, or null without the option
//   bank        every gap's answer once, case aside, alphabetical
//   repeats     whether any answer, case aside, fills more than one gap
//   items       [{ number, parts: [text | { label, answer, rank }, …] }]
//               `label` is "3" alone, or "3a", "3b" when an item has several;
//               `rank` is the card's index in the deck
//   questions   { before, while, after }, each a list, empty ones empty
//   key         [{ label, answer }] in item order, or null without the option
//   deckOnly    how many ticked cards are not gaps
//   deckOnlyWhy { sentences, blanks, other }, adding up to deckOnly: in an
//               item past MAX_ITEMS (or `limit`), past MAX_GAPS in its
//               sentence, or any other reason
function build({ cards = [], keep = [], text = '', lineBreaks = true, title = '', source = '', questions, options, limit = Infinity } = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const ticked = cards.map((_, i) => i).filter((i) => keep[i] === true);
  const lines = normalise(text, { keepLineBreaks: lineBreaks }).text;
  let active = ticked.filter((i) => rangeOf(cards[i]) && realSentence(cards[i], lines));
  let items;
  const capped = new Set();
  for (;;) {
    const r = pass(cards, active);
    items = r.items;
    if (!r.leave.length) break;
    r.capped.forEach((i) => capped.add(i));
    const gone = new Set(r.leave);
    active = active.filter((i) => !gone.has(i));
  }
  items = items.filter((g) => g.members.length);
  const past = items.slice(Math.min(MAX_ITEMS, limit)).flatMap((g) => g.members.map((m) => m.rank));
  items = items.slice(0, MAX_ITEMS);
  items = items.slice(0, limit);

  // Fewer items can only mean fewer answers, so the extra gaps are found again
  // against what is left; nothing this removes can make an item unclean.
  const answerOf = (g, r) => g.sentence.text.substr(r.at, r.length);
  const forms = new Set(items.flatMap((g) => g.members.map((m) => answerOf(g, m))));
  const rankOfForm = new Map();
  for (const g of items) {
    for (const m of g.members) {
      const lower = answerOf(g, m).toLowerCase();
      if (!rankOfForm.has(lower)) rankOfForm.set(lower, m.rank);
    }
  }

  const sheetItems = items.map((g, i) => {
    const number = i + 1;
    const ranges = [...g.members];
    for (const occ of wholeWords(g.sentence.text, forms)) {
      if (!ranges.some((m) => overlaps(m, occ))) {
        ranges.push({ ...occ, rank: rankOfForm.get(answerOf(g, occ).toLowerCase()) });
      }
    }
    const parts = cutMany(g.sentence.text, ranges);
    const gaps = parts.filter((p) => typeof p !== 'string');
    gaps.forEach((gap, j) => {
      gap.label = gaps.length === 1 ? String(number) : `${number}${'abcdefgh'[j]}`;
    });
    return {
      number,
      parts: parts.map((p) => (typeof p === 'string' ? p : { label: p.label, answer: p.answer, rank: p.rank }))
    };
  });

  const allGaps = sheetItems.flatMap((it) => it.parts.filter((p) => typeof p !== 'string'));
  const used = new Set(allGaps.map((g) => g.rank));
  // One bank entry per answer, case aside: the first form not capitalised,
  // or the first form when every gap it fills is.
  const entries = new Map();
  for (const g of allGaps) {
    const lower = g.answer.toLowerCase();
    if (!entries.has(lower)) entries.set(lower, { form: g.answer, count: 0 });
    const e = entries.get(lower);
    e.count += 1;
    if (capitalised(e.form) && !capitalised(g.answer)) e.form = g.answer;
  }
  const deckOnly = ticked.filter((i) => !used.has(i));
  return {
    title,
    source,
    paragraphs: opts.fullText === true ? lines.split('\n').filter((l) => /\S/.test(l)) : null,
    bank: [...entries.values()].map((e) => e.form).sort(alphabetical),
    repeats: [...entries.values()].some((e) => e.count > 1),
    items: sheetItems,
    questions: cleanQuestions(questions),
    key: opts.answerKey === true ? allGaps.map((g) => ({ label: g.label, answer: g.answer })) : null,
    deckOnly: deckOnly.length,
    deckOnlyWhy: {
      sentences: deckOnly.filter((i) => past.includes(i)).length,
      blanks: deckOnly.filter((i) => capped.has(i)).length,
      other: deckOnly.filter((i) => !past.includes(i) && !capped.has(i)).length
    }
  };
}

export {
  build, cutMany, wholeWords, cleanQuestions, emptyQuestions, keepsWithNext, keptPairs,
  KEEP_WORDS, MAX_ITEMS, MAX_GAPS, MIN_WORDS, SECTIONS, MAX_QUESTIONS, MAX_QUESTION, DEFAULT_OPTIONS
};
