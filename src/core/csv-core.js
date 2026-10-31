// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// CSV core.
// ============================================================
// Cards in, a file out that two hostile readers both accept.
//
// THE TWO READERS DISAGREE ABOUT WHAT A CSV IS
// Anki wants directive lines, treats field content as markup or not depending
// on what it is told, and is strict about column counts. Excel wants a byte
// order mark or it mangles every accented word, and — the dangerous part —
// evaluates a field beginning with =, +, - or @ as a FORMULA.
//
// WHY THE FORMULA CASE MATTERS MORE HERE THAN USUAL
// The whole distribution model is a teacher e-mailing this file to thirty
// students. An article containing "-20% growth was the headline" is enough to
// produce a field starting with a hyphen, and a hostile page could craft one
// deliberately. Formula injection in a file that is, by design, forwarded to a
// class is not a theoretical finding.
//
// An ES module (the web app). The extension loaded it as a classic script and
// published it on `globalThis`; the logic below is unchanged by the move.
// ============================================================

'use strict';

import { NAME, SLUG } from './brand.js';

// Excel, LibreOffice and Sheets all read a leading =, +, - or @ as the start
// of a formula. Tab and carriage return are here because both can lead a field
// after a malformed escape and both are treated as whitespace before the
// formula character that follows.
const DANGEROUS_LEAD = /^[=+\-@\t\r]/;

// ------------------------------------------------------------
// THE FORMULA GUARD
//
// A leading apostrophe is the standard mitigation. WHAT EACH READER THEN DOES
// WITH IT WAS MEASURED, because this comment previously claimed
// "spreadsheets read it as 'the rest is text' and do not display it" and that
// is true of one of the three readers tested:
//
//   Google Sheets     consumes it. The cell reads -20%, nothing is evaluated.
//   LibreOffice Calc  DISPLAYS it. The cell reads '-20%. Nothing is evaluated.
//   Anki              displays it, as expected — it has no such convention.
//
// The text-marker convention applies to a value TYPED into a cell; on CSV
// import a leading apostrophe is just data, and whether it survives to the
// screen is the reader's choice. So the honest statement is that the guard
// reliably stops evaluation everywhere and reliably hides itself nowhere.
//
// Excel proper is untested — no Windows machine in this project — and
// LibreOffice is a stand-in for it, not a substitute. If it behaves like
// Sheets, nobody notices; if it behaves like Calc, the cost is the stray
// apostrophe below, which is already accepted.
//
// A ZERO-WIDTH SPACE WAS CONSIDERED AND REJECTED. U+200B disarms the formula
// just as well and renders as nothing in Anki, so the card would look
// untouched — which is exactly the problem. This codebase prefers the visible
// error to the silent one (see the band tie-break in wordlist.js and the
// sentence-choice note in vocab-core.js): a teacher who sees a stray
// apostrophe can delete it, whereas an invisible character in a field is
// undebuggable the day something downstream chokes on it.
//
// Only ever fires on a field that BEGINS with one of those characters. The
// word column cannot: tokens start with a letter by construction.
// ------------------------------------------------------------
function guardFormula(value) {
  const s = String(value == null ? '' : value);
  return DANGEROUS_LEAD.test(s) ? `'${s}` : s;
}

// ------------------------------------------------------------
// RFC4180
//
// Quote when the field holds the separator, a quote, CR or LF; double any
// internal quote. Leading or trailing spaces are also quoted, because a
// reader that trims them silently changes a quotation.
// ------------------------------------------------------------
function escapeField(value, separator) {
  const s = String(value == null ? '' : value);
  const mustQuote =
    s.includes(separator) ||
    s.includes('"') ||
    s.includes('\n') ||
    s.includes('\r') ||
    s !== s.trim();
  if (!mustQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function row(fields, separator) {
  return fields
    .map((f) => escapeField(guardFormula(f), separator))
    .join(separator);
}

// ------------------------------------------------------------
// BUILD
//
// `cards`   from vocab-core's harvest()
// `source`  { title, url } — the article the passage came from
//
// TWO COLUMNS, AND THE REASON IS A FAILED IMPORT.
//
// This file used to emit four — Word, Sentence, Source, URL — on the reasoning
// that provenance belongs in the deck. Anki disagreed, in the worst available
// way. Against the Basic note type, which has exactly two fields, four columns
// left the mapping underdetermined; Anki resolved it by putting column 1 on
// the front, treating column 2 as TAGS, and dropping the rest. Every card
// imported with an EMPTY BACK and the context sentence shredded into 24 tags,
// one per word.
//
// It imported. It reported ten notes. Nothing errored. The teacher would have
// found out when a student turned over the first card — which is precisely the
// failure this project's manual checks exist to catch, and precisely why "the
// harness proves the format" was never claimed.
//
// So the file no longer offers Anki a choice:
//   - two columns, matching Basic's field count exactly;
//   - named Front and Back, so mapping by NAME agrees with mapping by
//     position rather than merely coinciding with it;
//   - #notetype pinned, so the field count is not whatever was used last.
//
// THE CLOZE DECK IS THE SAME THREE RULES AGAINST A DIFFERENT NOTE TYPE, and
// not an exception to them: two columns, named Text and Back Extra, which are
// Cloze's two fields exactly; and `#notetype:Cloze` pinned for the reason
// `#notetype:Basic` is pinned. What is never offered is a choice of field
// count, and that is what the four-column afternoon actually cost.
//
// Provenance moves to #tags, which is Anki's own mechanism for "these notes
// came from one place" and survives a merge into an existing deck. That is
// better than the column it replaces: a tag can be searched and filtered, and
// a Source column could only be read.
//
// html:false is the free deck and stays that way. With it true, an article
// containing "<" or "&" would render as broken markup on the card, so the
// directive and the escaping have to move together — which is why the Pro path
// below is a change to this file and not a flag a caller can set on its own.
// ------------------------------------------------------------
const SEPARATORS = { comma: ',', semicolon: ';', tab: '\t' };

// ------------------------------------------------------------
// THE PRO PATH: THE TARGET WORD, MARKED
//
// `#html:true` and `<b>` around the word the card is
// teaching, inside the sentence it was read in.
//
// THREE CHARACTERS, AND NOT FIVE. `&`, `<` and `>` are escaped; quotes are
// not. The sentence lands in a field Anki renders as TEXT CONTENT, where a
// quote means a quote — escaping it would be inert on the card and one more
// transformation that something downstream has to undo correctly. The rule for
// what to escape comes from where the string is going, not from a list copied
// out of a different context.
//
// AND THE PIECES ARE ESCAPED SEPARATELY, WHICH IS THE WHOLE TRICK. Escaping
// lengthens the string: one `&` becomes five characters. So an offset taken
// against the article's text cannot be used to index the ESCAPED text — it
// lands inside `&amp;` and the mark opens mid-entity. Cutting first at the
// offsets that are true of the plain sentence, then escaping each of the three
// pieces, means no offset is ever applied to a string that escaping has moved.
//
// A card with no target renders unmarked rather than guessing. That happens
// where `chooseSentence` fell back to a sentence the face does not sit inside,
// and a bold in the wrong place is worse than no bold at all.
// ONE LIST, NOT TWO. This was written as a table beside a hand-kept
// `/[&<>]/g`, and a mutation found what that costs: adding a
// character to the table changed nothing at all, because the regex is what
// decides and it had never heard of it. Two lists of the same three characters
// is one list and one rumour. The pattern is built from the table's own keys,
// so the table is the only place the set is stated.
//
// The keys must stay character-class-safe — `]`, `^` and `-` would have to be
// escaped, and none of the three characters HTML needs is one of them. Nor is
// either brace the cloze table below adds.
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const HTML_UNSAFE =
  new RegExp('[' + Object.keys(HTML_ESCAPE).join('') + ']', 'g');

function escapeHtml(text) {
  return String(text).replace(HTML_UNSAFE, (c) => HTML_ESCAPE[c]);
}

// ------------------------------------------------------------
// THE CLOZE TABLE: THE SAME THREE CHARACTERS, PLUS THE TWO THAT ARE MARKUP
// ONLY HERE
//
// `{{c1::word}}` is Anki's own syntax for a deletion, and it
// is read out of the field's text before the field is rendered as HTML. So in
// a cloze field a brace is not a character — it is the opening and closing of
// a deletion, exactly as `<` is the opening of a tag.
//
// WHICH IS WHY THE RULE IS "WHAT DOES THIS FIELD TREAT AS MARKUP", and why
// this is a second table rather than three characters written into a fourth
// place. It DERIVES from HTML_ESCAPE: the three characters are stated once,
// above, and adding a fourth there reaches this table without anybody
// remembering to come here. The mutation that found a hand-kept
// regex ignoring its own table is the reason both patterns are built from
// their table's keys and never written out.
//
// BOTH BRACES, AND NOT JUST THE OPENER. Only `{{c1::` opens a deletion, so
// escaping `{` alone would stop a sentence from forging one — but the deletion
// this file writes is closed by the FIRST `}}` after it, and the fallback
// below can put a whole sentence inside one. A sentence carrying `}}` would
// then close the deletion early and spill the rest of itself onto the front of
// the card. Escaping both leaves an invariant a case can actually hold: the
// only unescaped braces in a cloze field are the four this file wrote.
//
// AND THE ENTITY IS THE POINT. `&#123;` renders as `{` under `#html:true`, so
// a teacher reading the card sees the brace the article had. What it is not is
// the zero-width space this file rejected for the formula guard: the character
// is still there, still visible, still deletable. Nothing is hidden — the
// escaping is undone by the renderer, which is the whole difference.
//
// NOT MEASURED AGAINST A REAL IMPORT YET. That braces in prose are rare is
// measured — zero sentences in 112 cards across the three fixtures carry one —
// and rare is not never, which is why the escaping is here rather than in a
// list of things to watch. What the importer does with `&#123;&#123;c1::` is
// reasoned from where the cloze filter runs, and it is owed a manual check
// alongside the import itself.
const CLOZE_ESCAPE = Object.assign(
  {}, HTML_ESCAPE, { '{': '&#123;', '}': '&#125;' });
const CLOZE_UNSAFE =
  new RegExp('[' + Object.keys(CLOZE_ESCAPE).join('') + ']', 'g');

function escapeCloze(text) {
  return String(text).replace(CLOZE_UNSAFE, (c) => CLOZE_ESCAPE[c]);
}

// The cut, on its own, because two renderings depend on it and the guard is
// the load-bearing half. Written once so that a fix to what counts as a usable
// offset reaches the bold and the deletion together — two copies of this test
// is the shape the escaping table was already caught in.
//
// The third rendering is why `cutAt` is exported at all: the worksheet's
// gaps are cut by a caller in another file (src/ui/worksheet.js). A rule that
// leaves the file it was written in is a rule that gets copied unless it is
// handed over.
//
// Returns the three pieces of the plain string, or null when the target does
// not describe a real slice of THIS string. The offset arrives from another
// file, and a stale one would mark the wrong word silently — the failure this
// whole path was warned about.
function cutAt(text, target) {
  const t = String(text);
  if (!target) return null;
  const at = Number(target.at);
  const len = Number(target.length);
  if (!(Number.isInteger(at) && Number.isInteger(len)
        && at >= 0 && len > 0 && at + len <= t.length)) {
    return null;
  }
  return [t.slice(0, at), t.slice(at, at + len), t.slice(at + len)];
}

function markTarget(text, target) {
  const t = String(text);
  const cut = cutAt(t, target);
  if (!cut) return escapeHtml(t);
  return escapeHtml(cut[0]) + '<b>' + escapeHtml(cut[1]) + '</b>'
    + escapeHtml(cut[2]);
}

// ------------------------------------------------------------
// THE DELETION
//
// The same cut, the same three pieces, the same escape-each-piece discipline —
// `{{c1::` and `}}` where the bold put `<b>` and `</b>`. Everything the
// paragraph over `markTarget` says about applying an offset to a string that
// escaping has already lengthened is true here and is true for a second
// reason: `&#123;` is six characters where the article had one.
//
// WHERE IT PARTS COMPANY WITH THE BOLD IS THE CARD WITH NO USABLE TARGET, and
// the difference is not cosmetic. An unmarked bold is a perfectly good card
// that is merely missing its emphasis. A cloze note with no deletion in it is
// NOT A CARD AT ALL — Anki generates nothing from it, so a teacher who ticked
// twenty and was told twenty notes were added would have nineteen cards and no
// line anywhere saying which one went missing. That is the silent failure this
// file is built around, arriving through the one path where doing nothing
// looks harmless.
//
// SO THE WHOLE SENTENCE BECOMES THE DELETION. The card is a poor one — its
// front is a blank and nothing else — and it is poor IN FRONT OF THE TEACHER,
// on the screen, in one card out of twenty, where it can be deleted in a click.
// The choice is between a visibly bad card and an invisibly absent one, and
// this file has made that choice the same way twice already: see the
// zero-width space rejected above, and the band tie-break in wordlist.js.
//
// IT IS THE DEFENSIVE PATH AND NOT THE COMMON ONE. Measured over
// the three fixtures: 112 cards, every one of them with a usable target, so
// `targetIn` returning null is a guard against an offset that crossed a file
// boundary wrong rather than a case a teacher meets on a Tuesday. It gets one
// line of fallback and no counting machinery, which is what a rate of zero
// buys.
//
// An empty sentence gets an empty field rather than an empty deletion:
// `{{c1::}}` is a deletion of nothing, and a note with no text in it is one
// Anki refuses on import — which is visible, but so is the empty field, and
// the empty field does not first claim to be a deletion.
function clozeTarget(text, target) {
  const t = String(text);
  const cut = cutAt(t, target);
  if (!cut) return t ? `{{c1::${escapeCloze(t)}}}` : '';
  return escapeCloze(cut[0]) + '{{c1::' + escapeCloze(cut[1]) + '}}'
    + escapeCloze(cut[2]);
}

// Anki separates tags on whitespace, so a tag cannot contain a space — the
// shredded-sentence failure above is what that looks like when it is violated.
//
// THE SHAPING IS ITS OWN FUNCTION BECAUSE TWO CALLERS NOW WANT IT. The
// article's title has come through here since the beginning; a
// teacher's own tag does too, and that one arrives out of a text box where a
// space is the most natural character in the world to type. One sanitiser, so
// that a change to what a tag may contain reaches both — two copies of a rule
// is the shape `cutAt` was pulled out of a fortnight after the escaping table
// was, and this file has now been caught that way twice.
//
// IT RETURNS '' AND NOT A FALLBACK, because the two callers do not want the
// same one. A title that reduces to nothing means the literal `deck`; a
// teacher's tag that reduces to nothing means the article's own slug, which is
// the free floor and is a different sentence about a different failure.
//
// LETTERS IN ANY SCRIPT, IN THEIR OWN CASE (the web app). The extension kept only a-z and 0-9, lower-cased, and its
// record gives no reason beyond the whitespace rule above, so `café` tagged as
// `caf`. Any Unicode letter is kept now, with its combining marks (text is
// composed to NFC first, so a decomposed `é` is one letter); whitespace and
// punctuation still become a hyphen. Case is kept: Anki matches tags without
// regard to case, so lower-casing gained nothing, and it turned `İstanbul`
// into `i̇stanbul`. The 48 is counted in code points, so a cut never splits a
// pair.
function slugTag(text) {
  const cleaned = String(text || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  // Cut at a word boundary. A blunt slice leaves "...with-new-execut", which
  // reads as a corrupted tag rather than a shortened one, and a teacher
  // filtering their collection has to trust what they see in that list.
  const points = [...cleaned];
  const cut = points.slice(0, 48).join('');
  const tidy = (points.length > 48 ? cut.replace(/-[^-]*$/, '') : cut)
    .replace(/^-+|-+$/g, '');
  return /[\p{L}0-9]/u.test(tidy) ? tidy : '';
}

function tagFor(source) {
  return slugTag((source && source.title) || '') || 'deck';
}

function build(cards, source, options) {
  const opts = options || {};
  const sepName = SEPARATORS[opts.separator] ? opts.separator : 'comma';
  const sep = SEPARATORS[sepName];
  const bom = opts.bom !== false;
  const src = source || {};
  // The Pro path is OPT-IN AND EXPLICIT. `=== true` rather than a truthiness
  // test, so that a caller passing a string, a 1 or an object it happened to
  // have cannot switch the deck into a markup format by accident. The free
  // tier is what an absent option means, and it is what a wrong option means.
  const html = opts.html === true;

  // ---- THE CLOZE DECK ------------------------------------------------------
  //
  // `=== true` for the reason `html` is, and then ANDED WITH
  // `html` — which is the guarantee and not a convenience.
  //
  // A deletion is markup. Cutting the sentence at an offset and escaping the
  // three pieces is a thing this file only knows how to do on the markup path,
  // and `#html:false` is the free deck, byte for byte, which the paragraph
  // over the set-aside line says must not move. Writing the flag this way
  // means there is NO argument to `build()` that puts a `{{c1::` into a free
  // deck: a caller passing `{ cloze: true }` and nothing else gets the free
  // deck, exactly as a caller passing a wrong `html` does.
  //
  // It is the same shape as `effective()` in settings-core.js asking the
  // licence before it asks the store, and it is here for the same reason —
  // the paid rendering must not be reachable by a caller who merely asked
  // nicely.
  const cloze = html && opts.cloze === true;

  // ---- THE CARD THAT DISAGREES WITH THE DECK -------------------------------
  //
  // `opts.cloze` is the deck's default and stays exactly what
  // it was; a card may now overrule it for itself with `card.cloze`.
  //
  // WHY IT EXISTS. Until today the choice was the whole deck or nothing, and a
  // teacher who wanted most cards plain and three of them gapped had one move
  // available: import as Cloze and change the note type in Anki afterwards.
  // That move destroys the notes. `{{c1::word}}` is markup to a Cloze note and
  // literal text to a Basic one, so a converted note keeps its braces in the
  // field, and Anki has nothing else it could do with them. The corruption is
  // not reachable from here and cannot be fixed there — what can be fixed is
  // the reason a teacher went looking for the lever, which is that the choice
  // was made too early and for too many cards at once.
  //
  // THREE STATES AND NOT TWO, and the absent one is the point. `=== true` and
  // `=== false` are both explicit; anything else — undefined, null, a string, a
  // 1 — means THIS CARD DID NOT ASK, and the deck default decides. So a caller
  // that has never heard of this field gets byte for byte the deck it got
  // yesterday, which is the property the whole of this file is arranged around.
  //
  // AND `html` GATES IT, in the same breath and for the same reason `cloze` is
  // anded rather than tested separately. A deletion is markup. There is no
  // argument to `build()` — not on the deck, not on a card — that puts a
  // `{{c1::` into a free deck.
  const noteIsCloze = (card) => {
    if (!html) return false;
    if (card.cloze === true) return true;
    if (card.cloze === false) return false;
    return cloze;
  };

  // Resolved once, here, rather than inside the loop that writes the rows. The
  // header has to know whether the deck is of one mind before the first row is
  // written, and a second traversal that re-derived the same answer is the
  // four-column failure wearing a different hat: two places deciding the same
  // thing is one place too many.
  const kinds = cards.map(noteIsCloze);
  const mixed = kinds.some((k) => k) && kinds.some((k) => !k);

  // WHAT THE HOMOGENEOUS DECK PINS. An empty deck has no card to read a kind
  // off, and it kept a `#notetype:` line before today; it keeps the same one.
  const pinned = kinds.length ? kinds[0] : cloze;

  // ---- THE TEACHER'S OWN TAG -----------------------------------------------
  //
  // The second tag is the article's slug, and Pro lets a
  // teacher name it instead: `year-9-autumn` across six articles is one search
  // in their collection, where six slugs is six searches and no way to see the
  // term as a term.
  //
  // THE PRODUCT TAG (`SLUG`, src/core/brand.js) STAYS FIRST AND IS NOT REPLACEABLE. It is the provenance tag —
  // the note above this function is about exactly that — and a deck that can
  // drop it is a deck that cannot be found again by the one name that is true
  // of every deck this product has ever written.
  //
  // ANDED WITH `html`, FOR ONE OF THE TWO REASONS `cloze` IS AND NOT BOTH.
  // A deletion is markup and could not have been written on the free path at
  // all; a tag is a word, and nothing technical stands in the way of this one.
  // What stands in the way is the other reason, unchanged: the free deck is
  // byte for byte what it was before any of this, and no argument to this
  // function may put a paid string into one. Stating that here rather than
  // trusting the caller is what makes it checkable in this file — which is the
  // whole of why `cloze` is written the way it is.
  //
  // AND THE TYPE IS TESTED, not coerced. `String({})` is `[object Object]`,
  // which slugs to a perfectly plausible `object-object` and would tag a
  // teacher's deck with it. settings-core coerces this field before it is
  // stored; this is the same refusal made again at the file that writes it,
  // because a caller is not obliged to have come through there.
  const wanted = html && typeof opts.tag === 'string' ? slugTag(opts.tag) : '';
  const tag = wanted || tagFor(src);

  const lines = [];

  // Anki reads these; every other reader treats a leading # as a comment.
  lines.push(`#separator:${sepName}`);
  // The directive and the escaping move together, always. This line is the
  // deck telling Anki how to read every field below it, so it is derived from
  // the same flag the fields are — never written as a constant beside a loop
  // that has its own opinion.
  lines.push(`#html:${html}`);
  // Both of these are derived from the one flag, for that same reason. A note
  // type and a column list that can disagree about how many fields there are
  // is the four-column failure with a second way in.
  // ---- ONE NOTE TYPE PINNED, OR A COLUMN THAT NAMES ONE PER ROW ------------
  //
  // A DECK OF ONE MIND WRITES WHAT IT WROTE YESTERDAY, byte for byte. That is
  // not tidiness: `#notetype:` is what every deck this product has ever
  // written carries, the free deck must not move at all, and a paid deck whose
  // teacher never touched the new control has not asked for a new format
  // either. The mixed form is reached only by a deck that cannot be described
  // any other way.
  //
  // `#notetype column:1` HANDS THE DECISION TO THE ROW. Anki reads column 1 as
  // a note type name and maps what is left BY POSITION — the first regular
  // column into field 1 of whatever that row turned out to be, the second into
  // field 2. Basic is `Front, Back` and Cloze is `Text, Back Extra`: two fields
  // each, so a three-column row feeds both correctly without either note type
  // knowing the other is in the file. That the two types have the same field
  // count is what makes this cheap, and it is luck rather than design — a
  // three-field type in the file would need a wider row and a decision about
  // what goes in the empty cell.
  //
  // NO `#columns:` ON THIS PATH, DELIBERATELY. That line names fields, and in a
  // mixed file there is no name that is true of a column: cell 2 is a Front on
  // one row and a Text on the next. The mapping Anki uses here is positional
  // and needs no naming, so the honest move is to write nothing rather than
  // write one type's field names over both. A line that is right about half the
  // rows is worse than an absent line, because it reads as authoritative.
  //
  // IT COSTS NO COMPATIBILITY, which was the objection worth checking. Every
  // directive above — `#separator:`, `#html:`, `#notetype:` — is Anki 2.1.54+,
  // so this file has required 2.1.54 since the day it wrote its first header.
  // `#notetype column` is of that same generation. Nothing that could read one of
  // our decks yesterday is shut out by this.
  //
  // MEASURED, and it holds. A mixed check deck went through
  // Anki's import screen: the preview labelled the first column `1: Note Type`
  // and left columns 2 and 3 unnamed, which is `#notetype column:1` being read
  // and the absent `#columns:` being handled by position exactly as reasoned
  // above. 23 notes found, 23 imported, none skipped and none merged — 16
  // Basic and 7 Cloze in one file. Both kinds were opened afterwards: a Basic
  // note carries `Front`/`Back` and a Cloze note carries `Text`/`Back Extra`,
  // each fed from the same two positional columns, neither note type aware the
  // other is in the file. `#html:true` was honoured — `<b>` renders as bold
  // rather than as literal tags — and both `#tags:` values landed on every
  // note.
  //
  // THE ROW THAT WAS WORTH FEARING WAS THE ONE WITH A LINE BREAK IN IT. The
  // `paragraph` row carries a newline inside a quoted field and spans two
  // physical lines, which is the shape that turns into a 24th note or a
  // truncated card if the reader is line-oriented. It arrived as one note with
  // both lines intact. That is measured now rather than assumed, and it is the
  // reason the note count was predicted before the import rather than read off
  // the screen afterwards.
  //
  // WHAT THIS IMPORT DID NOT WITNESS, and it is a different claim in this same
  // file: the `CLOZE_ESCAPE` table above. The mixed check deck contains no
  // escaped brace at all — the braces it does carry are on Basic rows, where
  // the escaping never runs. The two escaped braces checked are in the
  // cloze check deck, so `&#123;&#123;c1::` rendering back to `{{c1::`
  // for a reader is still reasoned rather than measured, and still owed: the
  // `forged` card in that deck has to be previewed, and its front has to read
  // `{{c1::this}}` as visible text with only the word *forged* hidden. A mixed
  // import passing says nothing about it.
  if (mixed) {
    lines.push('#notetype column:1');
  } else {
    lines.push(`#notetype:${pinned ? 'Cloze' : 'Basic'}`);
    lines.push(`#columns:${(pinned ? ['Text', 'Back Extra']
      : ['Front', 'Back']).join(sep)}`);
  }
  lines.push(`#tags:${SLUG} ${tag}`);

  // ---- THE FILTERED COUNT --------------------------------------------------
  //
  // What the teacher's own settings took out of this deck, written into the
  // deck itself, because the panel that said so is closed by the time anybody
  // opens the file. Paid path only: it is one of the Pro controls — enumerated in settings-core.js and counted nowhere else, because
  // three files carrying "four" is how the gate ledger went stale in three
  // places at once — and, the harder reason, the free deck must stay byte
  // for byte what it is today, which a line appearing in it would end.
  //
  // THAT SENTENCE BECAME TRUE and was not quite true before it.
  // The number arriving here included the free blocklist floor, which is the
  // one refusal in it no teacher sets, so a line reading "by your <NAME>
  // settings" was crediting the teacher with a decision the product makes for
  // everybody. The ruling took the floor out of the sum
  // rather than out of this wording — see the note over `filtered` in
  // `vocab-core.js`. **The wording here did not change and must not**: it is
  // the description this count was built to satisfy, and it is now the panel's
  // wording as well, because both surfaces print the one number.
  //
  // A POSITIVE INTEGER OR NOTHING. Not a truthiness test and not a cast: a
  // caller handing this an object, a string or a NaN gets the free header
  // rather than `#undefined words`. Zero prints nothing, because a line
  // announcing that a filter did nothing is a line every deck carries and
  // nobody reads.
  //
  // LAST OF THE # LINES, DELIBERATELY. Every directive Anki actually reads is
  // above it, so a reader that stops scanning for directives at the first line
  // it does not recognise has already read all of them.
  //
  // NO COLON IN IT, ALSO DELIBERATELY. Anki's directives are `#key:value`, and
  // a sentence with a colon in it is a sentence that can be mistaken for one.
  // No comma either — that is the default separator, and a reader treating
  // this as data should get one cell rather than a ragged row. WITNESSED
  // in LibreOffice Calc: the line lands whole in A6 with B6 empty,
  // four rows below `#columns:Front,Back`, which splits across two cells in the
  // same import. The row that splits is worth more than the row that does not —
  // it rules out a reader that drops every leading-# line into one column for
  // reasons of its own, which would have made this claim look true without
  // testing it.
  //
  // WHAT ANKI DOES WITH IT WAS REASONED, AND IS NOW MEASURED. Every other claim
  // about the importer in this file was measured against a real import; this
  // one was reasoned previously. The reasoning is that leading-# lines
  // are comments, and the
  // design above is what makes the worst case survivable rather than what
  // makes it unlikely: if some reader does take this as a row, it becomes one
  // visibly wrong note at the top of the deck that says in English what it is
  // — not a silent mangling of thirty. That is the whole lesson of the
  // four-column failure, applied to the one line that lesson was never
  // measured against.
  //
  // "THERE IS NO ANKI ON THIS MACHINE" is what this paragraph said previously,
  // and it was not true. Anki 25.09.4 is installed here, and the
  // collection it keeps was last written on the afternoon of the
  // four-column failure this file is built around. The real
  // import cited three sentences above happened on this machine, so the
  // sentence denying the machine could run one was contradicted by its own
  // neighbour.
  //
  // It was doing real work while it was wrong, which is why it is worth this
  // much ink: it turned an UNWITNESSED line into an UNWITNESSABLE one. A check
  // that is merely undone stays on a list; a check nobody can run comes off it.
  //
  // THE DECK IS WRITTEN AND THE IMPORT IS DONE, the same day.
  // The check-deck script writes a Pro deck beside the free deck it has
  // always written — this line included, the target word marked,
  // and the same hazards put through the escaping path they have never met.
  // Anki 25.09.4 read its 21 cards into a fresh profile and reported 21 NOTES
  // ADDED, 0 UPDATED, 0 SKIPPED. The card count was the whole check: one note
  // more than the script printed would have meant the reasoning above was
  // wrong and this line came out of the file. It was not one more.
  //
  // The count only reads cleanly because the deck has 21 distinct first
  // fields, checked before the import rather than after. Anki's import screen
  // defaulted to `Existing notes: Update`, and two rows sharing a Front would
  // have collapsed into one — 20 notes, from a duplicate rather than from
  // anything this line did. A number that can move for two reasons measures
  // neither.
  //
  // This line is paid-only, so its witness was owed before the first paid
  // build, against a deck that can carry it, and that is the import above.
  //
  // Everything else about the line IS driven:
  // tests/logic.test.js § the count on the deck holds the wording, the guard,
  // the position, and the one that matters — that it is not a card.
  const filtered = opts.filtered;
  if (Number.isInteger(filtered) && filtered > 0) {
    const one = filtered === 1;
    lines.push(`# ${filtered} ${one ? 'word was' : 'words were'} set aside by`
      + ` your ${NAME} settings and ${one ? 'is' : 'are'} not in this deck`);
  }

  for (const [i, card] of cards.entries()) {
    const sentence = card.sentence ? card.sentence.text : '';
    // Every field is escaped, not just the one being marked: under
    // `#html:true` Anki renders BOTH columns as markup, and a front left raw
    // is the same defect as a back left raw, on the half of the card the
    // teacher sees first.
    //
    // The formula guard and the RFC4180 escaping still run inside `row`, which
    // means they run on exactly the bytes that reach the cell — after the HTML
    // work rather than before it. That order is the one the guard needs: it
    // exists to stop a spreadsheet reading a field as a formula, and what the
    // spreadsheet gets is what is written here.
    //
    // THE CLOZE ROW PUTS THE SAME TWO FACTS IN THE OTHER ORDER, because Cloze
    // reads its first field as the one carrying the deletion. So the sentence
    // leads and the word follows — and the word is in `Back Extra` rather than
    // dropped, on three counts. It is the form the teacher is teaching, named
    // in its own right rather than only as a gap in a sentence; the note type
    // has two fields and this file's whole discipline is to fill exactly as
    // many as the note type has; and item 6's gloss, when it lands, goes
    // beside a word that is already there instead of inventing a column to
    // hold it. It is not new information today — the deletion is that same
    // word — and saying so here is cheaper than a reader working it out.
    //
    // `escapeHtml` and not `escapeCloze` on that field: `Back Extra` is not
    // wrapped in `{{cloze:...}}` by Anki's template, so nothing there is read
    // as a deletion and a brace in it would be a character. It cannot hold one
    // anyway — a face is a token and tokens begin with a letter — but the
    // choice is made on where the string is going, which is the rule this
    // file's escaping has followed since the quote was left alone.
    // READ OFF `kinds` AND NOT RE-DERIVED. The header has already committed to
    // a shape on the strength of this array, and a row that asked the question
    // again could answer it differently — which is the one failure this whole
    // arrangement exists to make unreachable.
    const asCloze = kinds[i];
    const fields = asCloze
      ? [clozeTarget(sentence, card.target), escapeHtml(card.word)]
      : [
        html ? escapeHtml(card.word) : card.word,
        html ? markTarget(sentence, card.target) : sentence
      ];

    // The name goes through `row()` with everything else rather than being
    // concatenated in front of it. It needs no escaping — both are single
    // words — but a field that skips the escaping because today's value is
    // harmless is a field that will be quoted wrong the day the value changes.
    lines.push(row(mixed ? [asCloze ? 'Cloze' : 'Basic'].concat(fields) : fields, sep));
  }

  // CRLF, because RFC4180 says so and because Excel on Windows is the reader
  // most likely to be upset by bare LF.
  const body = lines.join('\r\n') + '\r\n';

  // The byte order mark keeps Excel from reading UTF-8 as its local codepage,
  // which is what turns "café" into "cafÃ©". Anki strips it.
  return (bom ? '﻿' : '') + body;
}

// A filename that makes a downloads folder searchable six months later.
// Sanitised hard: path separators are the ones that matter, but the final
// test is load-bearing — a title that reduces to punctuation would otherwise
// produce "<SLUG>_..csv".
//
// THE CONVENTION IS THE PRODUCT'S AND NOT THE CSV'S, which is why this
// function was asked for the worksheet's name too rather than having it
// assembled in the file that built the worksheet. `<SLUG>_<article>_<date>`
// is how a teacher finds anything this extension ever wrote, whatever wrote it.
//
// NOTHING ASKS FOR `html` TODAY. The worksheet was withdrawn in 1.1.0 and it
// was the only caller that ever passed one. The branch stays, and the reason is
// the next paragraph rather than sentiment: `ext` is the one argument in this
// file that reaches a filesystem, so what it does with a value it does not know
// is a property worth keeping tested. A version that dropped the second token
// would still need every one of those cases, and would need them written
// against a parameter that had stopped having more than one legal value.
//
// AND THE EXTENSION IS A NAMED TYPE OR THE FLOOR, not a string that is
// appended. `filename(src, when, '../x')` is what that guards: two known
// tokens, and everything else is a deck.
function filename(source, when, ext) {
  const d = new Date(when || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const cleaned = String((source && source.title) || '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase();

  const stem = /[a-z0-9]/.test(cleaned) ? cleaned : 'deck';
  return `${SLUG}_${stem}_${stamp}.${ext === 'html' ? 'html' : 'csv'}`;
}

export {
  build, filename, escapeField, guardFormula, row, SEPARATORS,
  escapeHtml, markTarget, escapeCloze, clozeTarget, slugTag, cutAt
};
