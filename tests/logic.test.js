// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
/*
 * logic.test — table tests over the core modules, run with `node --test`.
 *
 * Ported from the extension's own logic.test.js. It still loads the
 * SHIPPED files rather than reimplementing them. Each check() registers one
 * node:test test, so the runner's own tally is the case count; nothing else
 * records it.
 *
 * What did not come across, and why:
 *   - set-aside headings vs the popup, the palette (popup and options page),
 *     and "one page, one scope": they test extension UI files that are not
 *     ported. Classic-script scope collisions cannot happen between modules.
 *   - "licence: issuing one": it mints with the private key, which stays out
 *     of this repository. The licence cases verify fixtures signed by a
 *     test-only pair instead (tests/fixtures/licence/).
 * Cases that deleted or stubbed a `globalThis` namespace now build a scratch
 * copy of the module graph with one file removed or wrapped (see graphOf).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import * as W from '../src/core/wordlist.js';
import * as S from '../src/core/sentence-core.js';
import * as V from '../src/core/vocab-core.js';
import * as C from '../src/core/csv-core.js';
import * as T from '../src/core/taboo.js';
import * as L from '../src/core/licence-core.js';
import * as ST from '../src/core/settings-core.js';
import { analyse } from '../src/ui/pipeline.js';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../src/core');

let group_ = '';
function check(name, pass, detail) {
  const ok = !!pass;
  test(`${group_} › ${name}`, () => assert.ok(ok, detail));
}

function eq(name, got, want) {
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

function group(title) {
  group_ = title;
}

// A scratch copy of src/core with one file removed (`content` undefined) or
// replaced, then `entry` imported from it. Stands in for the extension
// harness deleting or stubbing a namespace on globalThis: module bindings
// cannot be swapped, so the swap happens on disk, in a copy, and the shipped
// graph is never touched. Resolves to { ns } or { error }.
const scratch = [];
process.on('exit', () => {
  for (const dir of scratch) fs.rmSync(dir, { recursive: true, force: true });
});

async function graphOf(entry, file, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascham-graph-'));
  scratch.push(dir);
  try {
    fs.cpSync(CORE, dir, { recursive: true });
    if (content === undefined) fs.rmSync(path.join(dir, file));
    else fs.writeFileSync(path.join(dir, file), content);
    return { ns: await import(pathToFileURL(path.join(dir, entry)).href), dir };
  } catch (error) {
    return { error, dir };
  }
}

check('every module exports its namespace',
  [W.bandOf, S.segment, V.harvest, C.build, T.blocks, L.verify, ST.read]
    .every((f) => typeof f === 'function'));

const known = W.isKnown;
// The silent-e fold asks whether ANY shipped list holds a spelling, so it needs
// the bands and the proper nouns together. harvest() builds exactly this union
// from the two predicates it is handed, and this helper is built the same way
// ON PURPOSE: a harness that lemmatises in a configuration the product never
// runs proves nothing about the product. Handed `known` alone it folded
// `alice` to `alic`, and INVARIANT 6 below is what said so.
const held = (w) => known(w) || W.isProperNoun(w);
const lemma = (w) => V.lemmatise(w, known, held);

// ============================================================================
group('bands');
// ============================================================================

// The five cases the product was specified against.
eq('band gerrymandering', W.bandOf(lemma('gerrymandering')), 5);
eq('band ubiquitous', W.bandOf('ubiquitous'), 4);
// `subsequently` was one of the five specification cases and was pinned to
// band 4. It moved to 3 with the rest of the band-4
// reclassification: it is a discourse adverb of ordinary journalism, not a word
// a student meets only in essays. It is still a card, which is what the
// specification case was actually about — the band number was the proxy.
eq('band subsequently', W.bandOf('subsequently'), 3);
check('subsequently is still a card', W.bandOf('subsequently') >= 3);
eq('band because', W.bandOf('because'), 1);
eq('band the', W.bandOf('the'), 1);
eq('band empty', W.bandOf(''), 5);

// INVARIANT 1: the bands are pairwise disjoint. bandOf checks them in a fixed
// order, so an entry appearing twice is dead data in the band that loses —
// and worse, the band it loses to may not be the one the author intended.
//
// This has to sweep all four pairs, not just one. When bands 2 and 3 were
// added there were 512 collisions across six pairs, and the old assertion
// looked at exactly one of them.
const BANDS = { 1: W.GENERAL, 2: W.COMMON, 3: W.UPPER, 4: W.ACADEMIC };
const collisions = [];
for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]) {
  for (const w of BANDS[b]) if (BANDS[a].has(w)) collisions.push(`${w}(b${a}/b${b})`);
}
check('the four bands are pairwise disjoint', collisions.length === 0,
  `${collisions.length} collisions: ${collisions.slice(0, 10).join(' ')}`);

// INVARIANT 2: every entry's own lemma is a known word.
//
// This caught a real bug class. The bands hold LEMMAS, and lookup happens on
// lemmatise() output — so an entry the lemmatiser mangles is unreachable.
// "politics" stripped to "politic", "whereas" to "wherea", "according" to
// "accord": each was a common word being scored as band 5, and none of them
// was visible by reading the list.
// Bands 2 and 3 found 48 more of these on the day they were written, including
// "speed" -> "spe" and "breed" -> "bre": the -ed rule was eating the stem of
// any verb ending -ee. That was live from the first build, and no article
// mentioning a speed limit could ever have scored the word correctly.
const unreachable = [];
for (const set of [W.GENERAL, W.COMMON, W.UPPER, W.ACADEMIC]) {
  for (const w of set) if (!known(lemma(w))) unreachable.push(`${w}->${lemma(w)}`);
}
check('every band entry lemmatises to a known word', unreachable.length === 0,
  unreachable.slice(0, 8).join(', '));

// INVARIANT 3: nothing this ordinary is band 5.
//
// This exists because "with" was missing from the preposition line and became
// a flashcard on the first real article anyone tried. One word, in a
// hand-authored list of a thousand, invisible to every check here — and the
// only reason it surfaced was that a human read the deck.
//
// BAND 4 USED TO BE ALLOWED HERE, AND THAT EXEMPTION WAS THE BUG.
//
// The old wording: "A common word can be deliberately academic, and that
// decision reaches the review table where a teacher sees it." Both halves are
// true and the conclusion did not follow. Band 4 produces a card exactly as
// band 5 does, and it is checked BEFORE bands 2 and 3, so it is the one band
// that can hold a word this common and still ship it as vocabulary worth
// teaching. Exempting it meant the check swept the four bands that could not
// cause the defect and skipped the one that could.
//
// `create` is in the sample below. It was band 4. This check read it and
// passed it, every run, for the life of the file — while `create` went out on
// a flashcard from a real newspaper, along with `data`,
// `process`, `policy`, `research`, `method`, `labour` and about 180 more.
//
// So the assertion is now band 1 or 2 — suppressed — with no exemption. A word
// this ordinary is not worth a card at ANY level, and if one of these genuinely
// belongs in band 3 or 4 the honest move is to argue it out of this sample by
// name, in a commit that says so, rather than to widen the assertion until it
// stops asking.
//
// Auditing the list again by hand would have closed this hole and left the
// next one open. The list is the thing that cannot be trusted, so the check
// has to come from outside it — and it has to be allowed to fail.
const COMMONEST = `
the be to of and a in that have i it for not on with he as you do at this but
his by from they we say her she or an will my one all would there their what
so up out if about who get which go me when make can like time no just him
know take people into year your good some could them see other than then now
look only come its over think also back after use two how our work first well
way even new want because any these give day most us is are was were been
being has had did does said made
man woman child boy girl person family friend home house room door window wall
floor water food money job school student teacher doctor book word name number
hand head eye face foot body life death world country city town street road
car train plane place part side end top thing case point fact idea reason
problem question answer story news line letter page group team company business
market price cost value power law right left order rule system state government
find tell ask feel try leave call keep let put mean become seem show hear play
run move live believe hold bring happen write provide sit stand lose pay meet
include continue set learn change lead understand watch follow stop create
speak read allow add spend grow open walk win offer remember love consider
appear buy wait serve die send build stay fall cut reach kill remain
big small large little long short high low old young new early late good bad
best better worse great fine nice happy sad hard easy soft strong weak hot cold
warm cool full empty free busy real true false same different next last own
sure clear dark light heavy quick slow safe common special simple
very much many more most less least too also just only even still already again
once always never often sometimes usually here there now then today yesterday
tomorrow soon late early together alone
morning evening night week month year hour minute second weekend summer winter
spring autumn red blue green black white brown grey yellow
mother father son daughter brother sister wife husband baby parent
eat drink sleep walk talk sing dance cook clean wash drive ride swim jump laugh
cry smile help thank sorry please
under over above below inside outside near far between behind front back around
through across along past
because although however therefore whether unless until while since though
january february march april may june july august september october november
december monday tuesday wednesday thursday friday saturday sunday
| Added with the band-4 fix. The closed classes in full, because
| "with" and "throughout" were both missing prepositions and the sample written
| after "with" still did not contain "throughout" — a sample that grows one
| word per incident is a list of incidents, not a check.
throughout amid amongst despite besides via per plus versus toward towards
upon within without beneath underneath alongside opposite outside inside
during against beyond across onto into unless whereas instead rather
perhaps maybe
| ARGUED OUT OF THIS SAMPLE BY NAME: albeit, nonetheless,
| nevertheless, moreover, furthermore. The tightened assertion caught them on
| its first run and they are the one group in it I do not think is ordinary —
| they are the formal register of written argument, and a teacher assigning an
| editorial has a real use for them. "however" and "therefore" stay above,
| because they are commoner by an order of magnitude. Band 3, deliberately.
| The ordinary words that band 4 was holding. Every one shipped as a flashcard
| off a real newspaper article, and the reason the sample above missed them is
| that it was built from conversational English while these are the register of
| journalism — which is the register a teacher actually assigns.
data research policy process method approach structure function factor
context finance labour industry economy employment investment evidence theory
element category survey examine investigate establish indicate confirm reveal
demonstrate conclude occur emerge generate operate obtain adapt adjust
transform promote decline restrict maintain propose observe relevant reliable
valid objective significant sufficient initial prior ultimate consequence
sequence dimension component aspect procedure technique argument relation
democracy economic financial industrial commercial environmental
`;
// The `|` lines are prose, not vocabulary: this sample is one long blob and a
// comment inside it would be tokenised as words. Anything after a `|` to the
// end of the line is dropped.
const commonest = [...new Set(COMMONEST.replace(/^\|.*$/gm, '')
  .trim().split(/\s+/).filter(Boolean))];
const tooRare = commonest.filter((w) => W.bandOf(lemma(w)) >= 3);
check(`all ${commonest.length} commonest words are suppressed (band 1 or 2)`,
  tooRare.length === 0,
  `${tooRare.length} would be cards: ${tooRare.slice(0, 20).join(' ')}`);

// The same defect measured on the register that actually exposed it. Every
// word below was band 5 when a teacher ran a BBC article through the tool:
// 25% of an ordinary-vocabulary sample was being offered as worth a card.
// The threshold is zero, not "better than before" — an eyeballed improvement
// is not a gate, and this number silently creeping back up is the whole risk.
const ORDINARY = `born foreign signed birth advantage federal repeatedly
existing shot weeks hotel colour sport noisy famous correct practice mothers
babies orders president`.trim().split(/\s+/);
const falseRare = ORDINARY.filter((w) => W.bandOf(lemma(w)) === 5);
check('no ordinary word from the field sample is band 5',
  falseRare.length === 0, `rated rare: ${falseRare.join(' ')}`);

// ...AND THE SAME CLAIM MADE STRUCTURALLY, BECAUSE A SAMPLE CANNOT COVER A
// PARADIGM.
//
// Both checks above are hand-written samples, and this file has already said
// what is wrong with that: "a sample that grows one word per incident is a
// list of incidents, not a check." COMMONEST contains `something`. It does not
// contain `everybody`, `nowhere`, `whichever` or `oneself` — for no reason at
// all beyond nobody having typed them. Those words were band 5, which is a
// card at weight 3.0 badged ~C1+, and both checks above passed on every one of
// them on every run since the file was written.
//
// The sample cannot be fixed by adding them. It could be extended forever and
// still be a record of which holes somebody happened to notice.
//
// English has a few paradigms that are closed and small enough to write out in
// full, and a paradigm written out in full cannot be half-written. Four of the
// six below are products — the loop builds every cell, so a hole is a failure
// rather than an omission — and the other two are lists a reader can check
// against the pronoun and auxiliary tables in any grammar in about ten
// seconds, which is not a thing anyone can do to a sample of "ordinary words".
//
// THE NUMBERS ARE HERE FOR THE REASON THE QUANTIFIER GRID IS.
// `twenty`, `thirty`, `forty` and `fifty` were banded from the first day of the
// file and `sixty` through `ninety` were not; the teens were absent entirely,
// and so were 26 of the 29 ordinals. Nothing distinguishes the words that were
// typed from the words that were not, which is the signature of a list rather
// than a paradigm. A teacher highlighting a paragraph with a date or a count in
// it was being offered `seventeen` and `twentieth` as vocabulary at ~C1+.
//
// The stems are the interesting part and they are why this is a rule and not a
// list of 37 words: the teens and tens take allomorphs that no plain
// concatenation produces — `thirteen` not `threeteen`, `fifty` not `fivety`,
// `forty` not `fourty` — so the product carries them once and the ordinal rule
// reads off the cardinal it is built from. `first`, `second`, `third`, `fifth`,
// `eighth`, `ninth` and `twelfth` are genuinely irregular and are the whole of
// the exception table; every other ordinal falls out of `-th`, or `-y` to
// `-ieth`, and a new cardinal added above generates its own ordinal below.
//
// The assertion is band 1 or 2, suppressed, with no exemption for band 4, for
// the reason INVARIANT 3 gives at length above. Every cell here is a function
// word and there is no level at which one is worth teaching from an article.
//
// WHAT THIS DOES NOT COVER, said plainly rather than left to be discovered.
// Eight words were band 5 alongside these and belong to no paradigm at all:
// `cannot`, `else`, `plenty`, `anyhow`, `anymore`, `hence`, `seldom`,
// `likewise`. They were banded by hand and nothing here would notice if they
// came back out. This check closes the classes that ARE closed and claims
// nothing whatever about the rest of the language.
const joinEver = (a, b) => (a.endsWith(b[0]) ? a + b.slice(1) : a + b);

// `noone` is not a word: English writes this cell as two, so the tokeniser can
// never produce it and there is nothing to band. Asserted below to still be
// absent, so that typing it into a list one day fails here instead of quietly
// becoming the sixteenth cell.
const NOT_ONE_WORD = new Set(['noone']);

// The cardinals, as three groups because English builds them three ways: a
// suppletive run to twelve, then two productive series with their own stems,
// then the scale words. Everything the ordinal rule below knows, it knows from
// this list.
const UNITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve'];
const TEENS = ['thir', 'four', 'fif', 'six', 'seven', 'eigh', 'nine']
  .map((s) => s + 'teen');
const TENS = ['twen', 'thir', 'for', 'fif', 'six', 'seven', 'eigh', 'nine']
  .map((s) => s + 'ty');
const SCALES = ['hundred', 'thousand', 'million', 'billion'];
const CARDINALS = [...UNITS, ...TEENS, ...TENS, ...SCALES];

// The seven that are not `-th`. Named exhaustively rather than patched in as
// they are noticed, which is the difference this whole block is about.
const ORDINAL_IRREGULAR = {
  one: 'first', two: 'second', three: 'third', five: 'fifth',
  eight: 'eighth', nine: 'ninth', twelve: 'twelfth'
};
const ordinalOf = (c) => ORDINAL_IRREGULAR[c] ||
  (c.endsWith('y') ? `${c.slice(0, -1)}ieth` : `${c}th`);

const PARADIGMS = [
  ['quantifier compound', ['some', 'any', 'every', 'no']
    .flatMap((d) => ['thing', 'one', 'body', 'where'].map((h) => d + h))],
  ['cardinal', CARDINALS],
  ['ordinal', CARDINALS.map(ordinalOf)],
  // `where` + `ever` elides one `e`. No other pair in the set collides, which
  // is why the join is a rule and not five words and an exception.
  ['wh- + ever', ['who', 'what', 'when', 'where', 'which', 'how']
    .map((w) => joinEver(w, 'ever'))],
  ['reflexive', ['myself', 'yourself', 'himself', 'herself', 'itself',
    'ourselves', 'yourselves', 'themselves', 'oneself']],
  ['modal', ['can', 'could', 'may', 'might', 'must', 'shall', 'should',
    'will', 'would', 'ought']],
  // Added, and it is this block's own argument arriving a second
  // time. `north`, `south`, `east`, `west` and their four -ern adjectives were
  // banded from the first day of the file; `northeast` and its seven were not,
  // for no reason beyond nobody having typed them — which is the signature
  // this block was written to catch. A real exported deck carded `northeast`,
  // `northwest` and `southeast` at ~C1+, three of its 27 cards. Written as a
  // product for the same reason the ordinals are: a hole becomes a failure
  // instead of an omission.
  ['compass', ['north', 'south'].flatMap((a) => ['east', 'west']
    .flatMap((b) => [a + b, a + b + 'ern']))
    .concat(['north', 'south', 'east', 'west'].map((p) => p + 'ern'))]
];

const openCells = [];
const bandedExceptions = [];
let cellCount = 0;
for (const [name, cells] of PARADIGMS) {
  for (const cell of cells) {
    if (NOT_ONE_WORD.has(cell)) {
      if (W.bandOf(cell) !== 5) bandedExceptions.push(cell);
      continue;
    }
    cellCount++;
    if (W.bandOf(lemma(cell)) >= 3) openCells.push(`${name}:${cell}`);
  }
}
check(`every cell of the ${PARADIGMS.length} closed paradigms is suppressed`,
  openCells.length === 0,
  `${openCells.length} of ${cellCount} would be cards: ${openCells.slice(0, 20).join(' ')}`);
check('every NOT_ONE_WORD cell is still absent from the bands',
  bandedExceptions.length === 0, `now banded: ${bandedExceptions.join(' ')}`);

// THE COMPASS IS A MIRROR, AND BOTH HALVES OF THAT ARE CHECKED.
//
// The paradigm loop above proves the eight cells are suppressed. It does not
// prove the thing CM_COMPASS actually claims, which is narrower and is the
// whole licence for the change: the intercardinals are given EXACTLY the bands
// and EXACTLY the forms the list already gave the cardinals, and no others.
//
// Half one: same band as the point it is made of. Asserted as an equality
// rather than as `< 3`, so demoting the cardinals one day drags this with them
// instead of leaving the compound stranded four bands away, which was the
// original defect.
for (const [a, b] of [['north', 'east'], ['north', 'west'],
  ['south', 'east'], ['south', 'west']]) {
  eq(`"${a + b}" is banded with "${a}"`, W.bandOf(a + b), W.bandOf(a));
  eq(`"${a + b}ern" is banded with "${a}ern"`,
    W.bandOf(a + b + 'ern'), W.bandOf(a + 'ern'));
}

// Half two, and it is the one that stops this group growing. The list keeps
// the point and the -ern adjective and NOTHING ELSE — `northerly`,
// `northward`, `northerner` and `northernmost` are all band 5 for the cardinal
// points too. So the mirror is only a mirror while those stay absent on both
// sides. A later hand reaching for `southeasterly` has to argue with the
// cardinal first, which is the correct order and the one CM_COMPASS took.
const OVERREACH = [];
for (const stem of ['north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest']) {
  for (const suffix of ['erly', 'ward', 'wards', 'erner', 'ernmost']) {
    if (W.bandOf(stem + suffix) !== 5) OVERREACH.push(stem + suffix);
  }
}
check('the compass keeps two forms per point on both sides of the mirror',
  OVERREACH.length === 0, `also banded: ${OVERREACH.join(' ')}`);

// INVARIANT 4: a derived word whose base is common is not band 5.
//
// The five-newspaper run put `discussion`, `criticism`,
// `politician`, `headline`, `insider`, `reminder` and `neighbourhood` on
// flashcards while `discuss`, `criticise`, `politics`, `head`, `inside`,
// `remind` and `neighbour` all sat in band 1. Six of the fifteen bad cards in
// that run were this one hole, and a 633-word probe found 435 more.
//
// Every word below is a word that shipped, or one measured band 5 beside it.
// Band 4 is not allowed here, unlike INVARIANT 3: these are the ordinary
// derived nouns of newspaper English, and calling one academic is the same
// misfiling by a different name.
const DERIVED_FIELD = `discussion discussions criticism politician politicians
headline headlines insider insiders reminder neighbourhood neighbourhoods
negotiation negotiations announcement agreement development management
government environment information education population generation operation
darkness happiness illness weakness awareness business fitness
teacher speaker writer leader manager owner worker officer director editor
reporter photographer supporter customer
ability activity community quality security society university variety
difference experience importance independence violence audience
membership leadership relationship citizenship childhood`
  .trim().split(/\s+/);
const derivedRare = [...new Set(DERIVED_FIELD)]
  .filter((w) => W.bandOf(lemma(w)) >= 4);
check('no ordinary derived word from the field sample is band 4 or 5',
  derivedRare.length === 0, `rated hard: ${derivedRare.join(' ')}`);

// INVARIANT 5: every entry in CM_DERIVED really is transparent.
//
// The comment above CM_DERIVED says its members are readable from a base the
// learner already holds. That is a claim about 342 words, and a claim nothing
// checks is decoration — the list would rot the first time someone dropped a
// word in because it "felt common", which is exactly how band 4 came to hold
// `create` and `data`.
//
// So: strip the suffix, and the base must be band 1 or 2. This deliberately
// re-implements the split rather than importing it, because a check that shares
// its code with the thing it checks agrees with it by construction.
const DERIV_SUFFIXES = ['ation', 'ition', 'ution', 'ion', 'ment', 'ness',
  'ship', 'hood', 'ity', 'ety', 'ance', 'ence', 'ism', 'ist', 'ian', 'er',
  'or', 'ure', 'age', 'al', 'y'];
function transparentFrom(w) {
  for (const s of DERIV_SUFFIXES) {
    if (!w.endsWith(s) || w.length - s.length < 3) continue;
    const stem = w.slice(0, -s.length);
    const cands = [stem, stem + 'e', stem + 'y'];
    if (stem.endsWith('i')) cands.push(stem.slice(0, -1) + 'y', stem.slice(0, -1) + 'e');
    if (stem.endsWith('bil')) cands.push(stem.slice(0, -3) + 'ble');
    if (s === 'ation') cands.push(stem + 'ate');
    if (s === 'ion') cands.push(stem + 'te', stem.slice(0, -1) + 'de', stem.slice(0, -1) + 'd');
    if (s === 'ism' || s === 'ist') cands.push(stem + 'ic', stem + 'ical');
    if (s === 'ian') cands.push(stem + 'ics', stem + 'ic', stem + 's');
    if (/([bdfglmnprt])\1$/.test(stem)) cands.push(stem.slice(0, -1));
    // `c !== w` is load-bearing, not defensive. Stripping `-y` and adding one
    // back reconstructs the word: `celebrity` -> `celebrit` -> `celebrity`,
    // which is band 2 because this list put it there. Six entries passed on
    // their own authority before this clause existed.
    if (cands.some((c) => c !== w && c.length >= 3 &&
      (W.bandOf(c) === 1 || W.bandOf(c) === 2))) {
      return true;
    }
  }
  return false;
}

// The hand-placed exceptions, named individually. Each is here because its own
// base is mis-banded — `achieve`, `construct`, `describe`, `explain` and the
// rest are in band 4 today, which is hole B of the same five-article run — or
// because the base is a word we simply do not list (`terror`, `spokes-`).
// WHEN HOLE B IS FIXED, MOST OF THIS LIST SHOULD BE DELETED and the check will
// say so by passing without it. That is the point of naming them rather than
// widening the rule.
//
// D1 took fourteen of them — `advertisement`, `attraction`,
// `construction`, `exception`, `location` and the rest — because banding the
// BASE is what made them derivable. Nobody went looking; the staleness check
// below named all fourteen the first time the gate ran after the change.
const DERIVED_EXCEPTIONS = new Set(`
admission application approval assessment assignment assistance audience
balance broadcaster celebrity competitor composer conductor culture
curiosity deadline description destruction disability distribution edition
editor emotion environment explanation feature foundation founder headline
identity illustration importance independence intelligence introduction
journalism journalist licence messenger photographer profession
pronunciation qualification recognition reduction registration revolution
satisfaction simplicity spokesman spokesperson spokeswoman sponsor
subscriber subscription supervisor technician terrorism terrorist usage
violence population
`
  .trim().split(/\s+/));

const CM_DERIVED_WORDS = (fs.readFileSync(path.join(CORE, 'wordlist.js'), 'utf8')
  .match(/const CM_DERIVED = `([^`]*)`/) || [, ''])[1].trim().split(/\s+/);
check('CM_DERIVED was found and is not empty', CM_DERIVED_WORDS.length > 300,
  `found ${CM_DERIVED_WORDS.length}`);
const opaqueInBand2 = CM_DERIVED_WORDS
  .filter((w) => !DERIVED_EXCEPTIONS.has(w) && !transparentFrom(w));
check('every CM_DERIVED entry is transparent, or a named exception',
  opaqueInBand2.length === 0,
  `no known base: ${opaqueInBand2.slice(0, 12).join(' ')}`);

// And the exception list must not outlive its reasons. An entry that has become
// derivable is a line to delete, and nothing else will point that out.
const staleExceptions = [...DERIVED_EXCEPTIONS].filter(transparentFrom);
check('no exception is stale — its base is still not band 1 or 2',
  staleExceptions.length === 0,
  `now derivable, delete: ${staleExceptions.join(' ')}`);

// INVARIANT 6: the proper-noun set is closed under lemmatisation.
//
// INVARIANT 2's argument, one set over. harvest() asks isProperNoun(LEMMA),
// never the surface form, so an entry the lemmatiser rewrites can never be
// reached. It sits in the file looking like coverage and suppresses nothing.
//
// And it is not enough for the lemma to be some word — it must be IN THIS SET,
// because this set is the entire lookup. `Wales` reduces to `wale` and
// `Philippines` to `philippine`, so both spellings are listed.
//
// THAT IS NOT A LEMMATISER BUG AND MUST NOT BE FIXED THERE. The plain -s rule
// is right about `words` -> `word`, and the -is/-us guard beside it is right
// about `analysis` and `virus`. Either change moves the whole language at once,
// which is how `speed` became `spe`. A list can be asked to be closed; the
// lemmatiser is left alone.
//
// Its first run found this was already broken for people: `charles` -> `charle`,
// `james` -> `jame`, `thomas` -> `thoma`. Three of the commonest names in
// English news, in the list since the list existed, unreachable the whole time.
// An entry may also lemmatise to something a BAND already suppresses, and that
// is a pass, not an exemption granted to get to green. `rose` reduces to `rise`
// through the irregular map, and `rise` is band 1 — so "Rose said" is suppressed
// before the proper nouns are consulted at all. The list only ever matters for
// band 5, which is the same ordering that makes it safe to hold `mark` and
// `april`, stated once more at the point where it does the work.
const unreachableNames = [];
for (const w of W.PROPER_NOUNS) {
  const l = lemma(w);
  if (l !== w && !W.PROPER_NOUNS.has(l) && W.bandOf(l) === 5) {
    unreachableNames.push(`${w}->${l}`);
  }
}
check('every proper noun lemmatises to a proper noun, or to a suppressed word',
  unreachableNames.length === 0, unreachableNames.slice(0, 10).join(', '));

// The plural is the form the article actually carries — "Israelis said" — and
// `israelis` does not reduce to `israeli`, because it ends -is and the guard
// protecting `analysis` cannot tell the two apart.
//
// SCOPED TO THE ENTRIES ENDING -i, WHICH IS WHERE THAT GUARD BITES. Every other
// demonym plural reduces cleanly by the plain -s rule, and the closure check
// above already covers where it lands. Run over all of them instead, this
// demands `chineses`, `swisss` and `britishs` — and a check answered by adding
// words English does not have is a check that has been satisfied with junk.
const unreachablePlurals = [];
for (const w of W.DEMONYMS) {
  if (!w.endsWith('i')) continue;
  const l = lemma(`${w}s`);
  if (!W.PROPER_NOUNS.has(l)) unreachablePlurals.push(`${w}s->${l}`);
}
check('every -i demonym plural lemmatises to a proper noun',
  unreachablePlurals.length === 0, unreachablePlurals.slice(0, 10).join(', '));

// INVARIANT 7: every list entry is pure a-z.
//
// This one is not here to catch a typo. harvest declines any lemma outside
// V.BANDABLE, and the JUSTIFICATION for declining it is that such a lemma
// cannot match a list entry — so its band 5 is a failed lookup rather than a
// verdict. That justification is a claim ABOUT THE DATA, and this is the check
// that keeps it true.
//
// Add one hyphenated entry to a band and the reasoning inverts: `well-being`
// would become genuinely bandable, and harvest would be throwing away a word
// the list had an answer for. The check fails on the entry, which is the right
// place to argue about it — before the behaviour quietly stops matching the
// comment that explains it.
//
// It uses the SHIPPED regex, not a copy, for the same reason.
const unbandableEntries = [];
for (const [name, set] of [['band 1', W.GENERAL], ['band 2', W.COMMON],
  ['band 3', W.UPPER], ['band 4', W.ACADEMIC], ['proper nouns', W.PROPER_NOUNS]]) {
  for (const w of set) {
    if (!V.BANDABLE.test(w)) unbandableEntries.push(`${name}: ${w}`);
  }
}
check('every list entry is pure a-z, so harvest is right to decline the rest',
  unbandableEntries.length === 0, unbandableEntries.slice(0, 10).join(', '));

// And the converse, on the tokens themselves: the shapes the tokeniser really
// produces from web prose must be the shapes the regex rejects. A regex that
// matched everything would pass the check above and suppress nothing.
for (const t of ['so-called', 'well-being', "don't", "o'clock", 'covid-19']) {
  check(`"${t}" is not bandable`, V.BANDABLE.test(V.lemmatise(t, W.isKnown)) === false);
}
check('and an ordinary word still is', V.BANDABLE.test('unrelenting') === true);

// THE HYPHEN IS THREE CHARACTERS ON A REAL PAGE.
//
// Everything above assumes the tokeniser HOLDS a hyphenated word together, so
// that BANDABLE can then decline it. That assumption was true only for U+002D.
// Wikipedia sets "non-existent" with U+2011 and a saved article carried 61 of
// them; each one split, and the front half went to the deck. "non" is in no
// band, so it took band 5 at weight 3.0 — above every word that lemmatised
// correctly — and it did that in eight of thirty-three sections.
//
// These cases are written against the codepoints rather than pasted glyphs,
// because U+002D, U+2010 and U+2011 are indistinguishable in a monospace font
// and a reader has to be able to tell which one is under test.
const HYPHENS = { 'U+002D': '-', 'U+2010': '‐', 'U+2011': '‑' };
for (const [name, h] of Object.entries(HYPHENS)) {
  const toks = V.tokenise(`non${h}existent`);
  check(`${name} holds a hyphenated word together`, toks.length === 1,
    `split into ${toks.length}: ${toks.map((t) => t.surface).join(' | ')}`);
  check(`${name} then fails BANDABLE, so it is declined not scored`,
    toks.length === 1 && V.BANDABLE.test(V.lemmatise(toks[0].surface, W.isKnown)) === false);
  check(`a trailing ${name} is trimmed off the surface`,
    V.tokenise(`hard${h} pressed`)[0].surface === 'hard');
}

// The en dash is NOT in that set, and the reason is what each split leaves
// behind. "Anglo-Saxon" written with a dash breaks into two whole words that
// look themselves up; "non-existent" breaks into a prefix that is not a word.
// If this ever starts passing as one token, the rule above has been widened
// past its own justification.
check('an en dash still separates two whole words',
  V.tokenise('Anglo–Saxon').map((t) => t.surface).join(',') === 'Anglo,Saxon');

// A DIGIT INSIDE A WORD, WHICH IS THE SAME BUG WEARING DIFFERENT CLOTHES.
// Previously WORD_RE carried no \p{N}, so it stopped at the first digit
// and the trailing-punctuation trim then removed the hyphen that would have
// made the remainder fail BANDABLE. `mid-14th` was the FOURTH CARD of a real
// deck at ~C1+, above every word that had lemmatised correctly.
//
// Re-measured the day it was fixed and the record had understated it: the
// string yields TWO faces, `mid` AND `th`. Both are asserted, because a fix
// that caught only the one that had been written down would pass this file and
// still ship the other. `1920s` is the same defect with no hyphen involved at
// all — it left a bare `s` behind.
//
// `19th-century` GAINS NO CARD AND IS HERE ANYWAY. It was declined before the
// fix and it is declined after — but as `th-century` before, which is a
// truncation of the text, and as itself after. The refusal was right by
// accident of the hyphen surviving the trim, and a rule that is right by
// accident is one mutation away from being wrong. `century` stays inside it
// either way: a hyphen inside one word is not a separator, which is the same
// line the en-dash case above draws.
const DIGIT_WORDS = [
  ['a mid-14th century text', 'mid-14th', ['mid', 'th']],
  ['a 19th-century text', '19th-century', ['th-century', 'th']],
  ['the 1920s saw it', '1920s', ['s']]
];
for (const [text, whole, fragments] of DIGIT_WORDS) {
  const faces = V.tokenise(text).map((t) => t.surface);
  check(`"${whole}" survives tokenising as one token`, faces.includes(whole),
    faces.join(' | '));
  check(`"${whole}" then fails BANDABLE, so it is declined not scored`,
    V.BANDABLE.test(V.lemmatise(whole, W.isKnown)) === false);
  for (const frag of fragments) {
    check(`"${whole}" leaves no "${frag}" fragment behind`,
      !faces.includes(frag), faces.join(' | '));
  }
}
// The spaced form is the one that keeps its noun, and it kept it before the fix
// too — `century` was never inside `mid-14th`. Asserted so that a later widening
// of the class cannot quietly start swallowing it.
check('a spaced "mid-14th century" still cards "century"',
  V.tokenise('a mid-14th century text').map((t) => t.surface).includes('century'));

// A CITED SUFFIX, WHICH IS THE THIRD OUTING OF THE SAME FAULT. The article
// writes "the suffix -er marking the comparative, and -est marking the
// superlative". A class that could only START at a letter began at the `e`,
// and `est` came out a bare word between spaces — in no band list, and absence
// is band 5 at weight 3.0. Measured: 1 card in 1125 over eleven
// sections, and near the top of the deck.
//
// THE TOKEN IS NOT DELETED, it is seen whole. `-est` then fails BANDABLE for
// the same reason `well-being` does, which is the whole economy of this fix:
// no list of suffixes, no new counter, and a teacher told "written with a
// hyphen" about a thing their page writes with a hyphen.
//
// The last three rows are the lookbehind, and each kills a different widening.
// `U.S.-based` has a hyphen nothing claimed and a NON-SPACE before it — drop
// the lookbehind and `based` becomes `-based`. `- item` is a hyphen with a
// space AFTER it, which no reading should take. `well-being` is the hyphen
// that was never free: a letter precedes it, so it was inside the token before
// this rule existed and is untouched by it.
const CITED_HYPHENS = [
  ['a cited suffix keeps its hyphen', 'the suffix -est marks it', '-est'],
  ['U+2010 as well as ASCII', 'the suffix ‐est marks it', '‐est'],
  ['U+2011 as well as ASCII', 'the suffix ‑est marks it', '‑est'],
  ['a compound is untouched', 'a well-being clause', 'well-being'],
  ['a claimed hyphen stays claimed', 'a U.S.-based firm', 'based'],
  ['a hyphen with a space after it is not a prefix', 'a list:\n- item here',
    'item']
];
for (const [name, text, want] of CITED_HYPHENS) {
  const faces = V.tokenise(text).map((t) => t.surface);
  check(name, faces.includes(want), faces.join(' | '));
}

// THE FRAGMENT IS GONE, not merely joined — asserted separately because a rule
// that emitted BOTH `-est` and `est` would satisfy every row above.
check('and no bare "est" fragment is left behind',
  !V.tokenise('the suffix -est marks it').map((t) => t.surface).includes('est'),
  V.tokenise('the suffix -est marks it').map((t) => t.surface).join(' | '));

// THE BOUNDARY IS THE RANGE, BECAUSE THE MATCH RUNS ON THE SLICE. A selection
// beginning ON the hyphen sees start-of-input before it and the rule fires,
// which is why the test is `(?<!\S)` and not `(?<=\s)` — the second reads the
// same on every corpus in this file and loses the first token of every
// highlight that starts on one.
const CITEDCUT = '-est marks the superlative';
eq('a range starting on the hyphen still keeps it',
  V.tokenise(CITEDCUT, 0, CITEDCUT.length)[0].surface, '-est');

// THE POSSESSIVE RULE, WHERE ITS SHAPES CAN BE SEEN. `POSSESSIVE` is stripped
// in three places — the lookup key here, the census key, and the card face —
// and four mutations of it survived every end-to-end case in
// this file: made case-sensitive, unanchored, stripped of its curly
// apostrophe, and removed from this call site altogether. None of that is
// subtle. Every corpus in the tree spells a possessive exactly one way, lower
// case with a straight apostrophe, so the cases downstream could not tell the
// rule from any of its four widenings. Written as a table for the reason the
// hyphens above are: the shapes are the point, and one of them is invisible in
// a monospace font.
//
// The last two rows are the anchor and the trim. `D'Souza` and `O'Sullivan`
// carry an apostrophe-then-s IN THE MIDDLE, which an unanchored rule eats;
// `teachers'` has lost its apostrophe to the trailing-punctuation trim before
// this rule is ever asked, which is why the rule holds no plural branch.
const POSSESSIVES = [
  ["a straight apostrophe: teacher's files as teacher", "teacher's", 'teacher'],
  ['a curly apostrophe files the same way', 'teacher’s', 'teacher'],
  ["an upper-case possessive: TEACHER'S files as teacher", "TEACHER'S",
    'teacher'],
  ["a plural possessive: teachers' files as teacher", "teachers'", 'teacher'],
  ["an internal apostrophe is not a possessive: D'Souza keeps it", "D'Souza",
    "d'souza"],
];
for (const [name, surface, lemma] of POSSESSIVES) {
  eq(name, V.tokenise(surface)[0].lemma, lemma);
}

// A TABLE CAN LOSE A ROW AND STAY GREEN, which is the same failure the passage
// below guards against wearing different clothes: the shapes this covers are
// the reason it exists, and a table that quietly stops covering one of them
// reports exactly what a table that covers all four reports.
const shapes = POSSESSIVES.map((r) => r[1]);
check('the possessive table still covers all four shapes',
  shapes.some((s) => /['’]s$/.test(s) && !/’/.test(s)) &&
  shapes.some((s) => /’s$/.test(s)) &&
  shapes.some((s) => s === s.toUpperCase() && /['’]s$/i.test(s)) &&
  shapes.some((s) => /['’]s/i.test(s) && !/['’]s$/i.test(s)),
  shapes.join(' '));

// INVARIANT 8: no base is rated harder than a word derived from it.
//
// INVARIANT 5 asks this of CM_DERIVED — is the derived word's base banded? —
// and D1 asked the mirror question of every band at once: is the BASE banded
// when the derivative is? It was not, 98 times. `association` band 1 over an
// unlisted `associate`, `successfully` over `successful`, `effectiveness`
// over `effective`.
//
// THE UNIVERSAL FORM OF THIS CHECK CANNOT BE A GATE, and saying so is more use
// than a gate that lies. Peeling suffixes without a dictionary cannot tell a
// derived word from one that merely ends in those letters: run over all 4,370
// entries it reports 688 holes, among them `sausage`, `brother`, `wednesday`
// and `january`. The probe that found the real 98 used /usr/share/dict/words,
// which this harness will not depend on — zero dependencies is a promise about
// what has to be installed for the gate to mean anything.
//
// So the review itself is the fixture. All 98 candidates are frozen below, and
// each must be EITHER banded now OR named as not a base — which makes the
// judgement auditable one word at a time instead of asserted in a comment.
const D1_REVIEWED = `
absolute administrate advertise amaze amend amuse approximate aspirate
associate attract champ clare commode commune complicate conserve
considerate construct convent converse cooperate corrupt declare definite
dense destruct determinate discrete effective elder emote equip especial
except exhibit expanse facile format graduate grave homeless hopeful
implicate incline increasing indict infect inflate inject insecure institute
instruct intent interact legislate locale locate migrate morale motivate
mutual obligate occasional opine opportune petite pollute populate posit
productive profess proliferate prosecute quest recess recruit relate
repeated repute resent reserve retaliate situate subscript successful supple
surprising televise transact transit undoubted unlike utter variate verse
vindicate volatile wilder
`.trim().split(/\s+/);

// The 41 rejected, by the reason they were rejected — because "reviewed and
// declined" is a different claim from "not yet looked at", and only one of
// them is worth keeping.
//
// NOT THE BASE AT ALL, just what the peel invented: `quest` under `question`,
// `verse` under `version`, `morale` under `morality`, `wilder` under
// `wilderness`, `champ`, `clare`, `commode`, `convent`, `discrete`, `facile`,
// `format`, `locale`, `petite`, `posit`, `recess`, `subscript`, `supple`,
// `transit`. REAL WORDS, WRONG SENSE, so the derivative does not teach them:
// `considerate`, `expanse`, `grave`, `profess`, `unlike`. NOT CURRENT ENGLISH
// at the level in question, or not in this variety: `administrate` (the verb
// is `administer`), `obligate` (`oblige`), `aspirate`, `commune`, `converse`,
// `destruct`, `determinate`, `emote`, `especial`, `opine`, `opportune`,
// `repute`, `transact`, `undoubted`, `variate`. ALREADY REACHED by the
// lemmatiser, so a band entry would never be consulted: `increasing`,
// `repeated`, `surprising`.
//
// Several are genuine vocabulary gaps under a different heading — `grave`,
// `format` and `unlike` are ordinary words sitting in band 5. They are NOT
// added here, because adding them on this evidence would be smuggling one hole
// through another's justification, which is how band 4 came to hold `create`.
// TEN CAME OFF, which is what the staleness check below is for.
// The common-core import banded them, and a word that has been banded has
// stopped being a rejection: `considerate`, `converse`, `discrete`, `format`,
// `grave`, `increasing`, `quest`, `transit`, `unlike`, `verse`.
//
// The paragraph above had already called three of them out — "`grave`,
// `format` and `unlike` are ordinary words sitting in band 5… NOT added here,
// because adding them on this evidence would be smuggling one hole through
// another's justification". They arrived through the other heading it was
// holding the door for: a sweep of SCOWL's two smallest lists, on the finding
// that only 4,427 words were banded at all.
//
// `increasing` is the one worth a second line. It was listed above as ALREADY
// REACHED BY THE LEMMATISER, and it was not: `lemma('increasing')` returned
// `increasing` under the pre-import bands too, so a band entry for it was
// always live and the stated reason for rejecting it had never been true.
const D1_NOT_A_BASE = new Set(`
administrate aspirate champ clare commode commune convent destruct
determinate emote especial expanse facile locale morale obligate opine
opportune petite posit profess recess repeated repute subscript supple
surprising transact undoubted variate wilder
`.trim().split(/\s+/));

const d1Unfixed = D1_REVIEWED
  .filter((w) => !D1_NOT_A_BASE.has(w) && W.bandOf(w) === 5);
check('every reviewed base is banded, or named as not a base',
  d1Unfixed.length === 0, `still band 5: ${d1Unfixed.join(' ')}`);

// And the rejections must not outlive their reasons either. A word here that
// has since been banded — for any cause — has stopped being a rejection and is
// a line to delete, the same way a stale CM_DERIVED exception is.
const d1Stale = [...D1_NOT_A_BASE].filter((w) => W.bandOf(w) !== 5);
check('no rejected candidate has since been banded',
  d1Stale.length === 0, `now banded, delete: ${d1Stale.join(' ')}`);

// The lists cannot be padded. Every entry has to BE an instance of this hole:
// some derivative of it, built by running the peel backwards, must already be
// banded. A word that is merely worth adding belongs in the group that says so.
function hasBandedDerivative(b) {
  const c = [b + 'ion', b + 'ment', b + 'ness', b + 'ly', b + 'ity'];
  if (b.endsWith('e')) c.push(b.slice(0, -1) + 'ion', b.slice(0, -1) + 'ation',
    b.slice(0, -1) + 'ity');
  if (b.endsWith('ate')) c.push(b.slice(0, -3) + 'ation');
  return c.some((w) => W.bandOf(w) !== 5);
}
const WORDLIST_SRC = fs.readFileSync(path.join(CORE, 'wordlist.js'), 'utf8');
const BASE_LISTS = ['CM_BASES', 'UP_BASES'].flatMap((name) => {
  const m = WORDLIST_SRC.match(new RegExp(`const ${name} = \`([^\`]*)\``));
  check(`${name} was found and is not empty`, !!m && m[1].trim().length > 0);
  return m ? m[1].trim().split(/\s+/) : [];
});
const d1Unearned = BASE_LISTS.filter((w) => !hasBandedDerivative(w));
check('every base-list entry has a banded derivative of its own',
  d1Unearned.length === 0, `no derivative: ${d1Unearned.join(' ')}`);

// THE PART THE ASYMMETRY ARGUMENT DOES NOT MENTION, and the reason this was
// worth its bytes. reduce() offers [undoubled, stem+'e', stem] to isKnown and
// takes the first hit; foldSilentE drops a final -e from any spelling no list
// holds. With the base off-list both fall through, so `declared` filed under
// `declar` — a non-word — at band 5 and weight 3.0, above every word that
// lemmatised correctly. Each surface below was measured doing exactly that.
// No rule changed; the band entry is what answers isKnown.
const D1_INFLECTED = [
  ['declared', 'declare'], ['declaring', 'declare'], ['associated', 'associate'],
  ['locating', 'locate'], ['graduated', 'graduate'], ['motivated', 'motivate'],
  ['polluting', 'pollute'], ['related', 'relate'], ['situated', 'situate'],
  ['populated', 'populate'], ['migrating', 'migrate'], ['prosecuted', 'prosecute'],
  ['televised', 'televise'], ['inclined', 'incline'], ['equipped', 'equip'],
  ['advertising', 'advertise']
];
const d1Adrift = D1_INFLECTED
  .filter(([form, base]) => lemma(form) !== base || W.bandOf(base) > 3)
  .map(([form, base]) => `${form}>${lemma(form)} (want ${base})`);
check('an inflected form of a banded base reaches the base, not a stem',
  d1Adrift.length === 0, d1Adrift.join(' '));

// INVARIANT 9: both spellings of a word we hold score the same band.
//
// Band 5 is absence from every list, and BAND_WEIGHT puts absence at 3.0 — so a
// word held in one spelling and not the other is not mis-levelled in the second
// spelling, it is PROMOTED above every word that scored correctly. That is the
// same promotion mechanism as the U+2011 split and the comparatives, applied to
// a whole orthographic system, and it shipped in 0.1.0.
//
// BUILT CONTROL-FIRST, for the reason the blocklist group is. "Every American
// spelling scores what its British partner scores" is also exactly what this
// prints on a tree where the table has been deleted and every pair scores band 5
// TOGETHER — a uniform wrong answer satisfies an equality check as happily as a
// uniform right one. So the table is emptied first and the disagreements are
// counted with it gone. The stub works on the exported Map because it IS the
// Map bandOf closes over; clearing it is the nearest thing to shipping without
// the table, which is the only comparison worth making.
const VARIANTS = [...W.US_VARIANTS];
check('the dialect table is not empty', VARIANTS.length > 0,
  'an empty table satisfies every check below and fixes nothing');

// THE COUNT IS DECLARED HERE, AND THIS LITERAL IS THE WHOLE DEFENCE AGAINST A
// PAIR GOING QUIETLY MISSING. Every other check in this invariant reads the
// table and asks whether what is in it is right, so deleting a line satisfies
// all of them by removing the thing they would have complained about — the
// shape of failure this repository has hit twice, in `brand/` and in the
// hardcoded Ships list. 54 is the number the review approved, and
// moving it is a decision someone makes on purpose in a diff, which is exactly
// what it is for. It lives HERE and nowhere else: README.md used to restate
// figures like this one and § Size claims is the record of what that cost.
eq('the table holds every pair the review approved', VARIANTS.length, 54);

// The four inflections are here because the table lists BASES ONLY and never
// mentions a suffix. `analyze` is what makes reduce() land `analyzed` on a key
// instead of on `analyz`, and if that stops working the table still passes on
// its 54 base forms while every inflected occurrence in a real article goes back
// to band 5. Those are the occurrences: an article says `organized`, not
// `organize`.
const forms = (w) => [w, `${w}s`, `${w}ed`, `${w}ing`];
function disagreements() {
  const out = [];
  for (const [american, british] of VARIANTS) {
    const want = W.bandOf(british);
    for (const f of forms(american)) {
      const got = W.bandOf(lemma(f));
      if (got !== want) out.push(`${f}>${lemma(f)}(${got}) want ${want}`);
    }
  }
  return out;
}

const restore = [...W.US_VARIANTS];
W.US_VARIANTS.clear();
const without = disagreements();
for (const [k, v] of restore) W.US_VARIANTS.set(k, v);
check('and the whole table is what fixes it, not two words of it',
  without.length >= VARIANTS.length * 3,
  `emptied, only ${without.length} of ${VARIANTS.length * 4} forms misband — ` +
  'the check below would have passed without the table');

eq('every American spelling scores what its British partner scores',
  disagreements().join(' '), '');

// A key the bands already hold is not a pair, it is a duplicate — and a silent
// one, because bandOf canonicalises BEFORE the four lookups, so the band would
// answer and the table would look load-bearing while doing nothing.
const keysBanded = VARIANTS.map(([a]) => a)
  .filter((a) => [W.GENERAL, W.COMMON, W.UPPER, W.ACADEMIC].some((s) => s.has(a)));
eq('no American spelling is itself a band entry', keysBanded.join(' '), '');

// The mirror, and the one that catches a typo in the right-hand column: a pair
// pointing at a word no band holds resolves to band 5, which is the defect the
// table exists to remove, now written down as though it were the fix.
const valuesUnbanded = VARIANTS.filter(([, b]) => W.bandOf(b) === 5)
  .map(([a, b]) => `${a}>${b}`);
eq('every British partner is banded', valuesUnbanded.join(' '), '');

// bandOf hops once and must never need a second. A value that is also a key
// would resolve halfway and stop, and the answer would be wrong in a way no
// other check here looks at.
const keys = new Set(VARIANTS.map(([a]) => a));
const chained = VARIANTS.filter(([, b]) => keys.has(b)).map(([a, b]) => `${a}>${b}`);
eq('no partner is itself an American spelling', chained.join(' '), '');

// INVARIANT 2's question asked of this table. bandOf only ever sees LEMMAS, so a
// key the lemmatiser rewrites is unreachable — it sits in the file looking like
// a pair and is consulted for nothing. This caught `grueling` on the day the
// table landed: `gruelling` was on NO_STRIP and its American spelling was not,
// so the -ing rule took it to `gruel` and the pair never fired. One of 54.
const unreachableVariants = VARIANTS.map(([a]) => a)
  .filter((a) => lemma(a) !== a).map((a) => `${a}>${lemma(a)}`);
eq('every American spelling lemmatises to itself',
  unreachableVariants.join(' '), '');

// INVARIANT 7's question, same reasoning: harvest declines any lemma outside
// BANDABLE before a lookup happens, so a key with anything but a-z in it could
// never be reached even if everything above passed.
eq('every entry is pure a-z',
  VARIANTS.flat().filter((w) => !/^[a-z]+$/.test(w)).join(' '), '');

// A key that is also a name would hand `isProperNoun` a word this table has just
// declared to be vocabulary, and harvest asks that question of the same lemma.
// None today; the check is what keeps it that way when the next pair is added.
eq('no American spelling collides with a proper noun',
  VARIANTS.map(([a]) => a).filter(W.isProperNoun).join(' '), '');

// INVARIANT 10: a comparative and a superlative score what their base scores.
//
// The -ly/-er/-est rule landed and closed the defect it was written
// for — "every comparative and superlative in English is band 5" — and it has
// been false since that day. What arrived with no check of its own
// was the CANDIDATE ORDER, and it was wrong for four days: the loop asked for
// the bare stem before the restored 'e', so `huger` reduced to `hug` and
// `humaner` to `human`. The -ing/-ed loop directly above it had always asked in
// the other order. Two loops in one function, the same shape of word, two
// answers, and 312 cases went green throughout.
//
// The four rows marked below are the ones that detect it. Every other row here
// passes under either order, because their stems are not words — revert the
// order in vocab-core.js and those four are what fail. A table of ordinary
// adjectives would have been all check and no detector, which is the shape of
// gate this repository has agreed to stop writing.
//
// AND THE BAND CHECK ALONE MISSES ONE OF THE FOUR, which is why there are two.
// `barer` reduces to `bar` under the wrong order, and `bar` and `bare` are BOTH
// band 2 — so the band agrees while the lemma is wrong, and the row detects
// nothing. The lemma is the key cards are deduplicated on, so that is not a
// harmless near-miss: `bare` and `barer` in one article become two cards. Both
// checks are kept. The band one is what the teacher sees; the lemma one is what
// catches a right answer arrived at by coincidence, and it was added
// after the band one was measured killing 3 of the 4 detectors.
//
// WHY THIS IS A HAND-PICKED TABLE AND NOT A SWEEP OF THE BANDS. A sweep needs to
// know which words are gradable, and nothing shipped here is tagged for part of
// speech. Generating degree forms from all 4,427 lemmas produces `thest`, `sher`
// and `arest` and then reports them as failures — 53 of them, every one an
// artefact of the generator rather than a defect in the rule. SCOWL cannot
// rescue it either: asked to attest, it returns `hadder`, `diddest` and
// `earnest`, the last being the collision predicted for this exact test.
// So the rows are chosen by hand, the way the dialect pairs were, and each was
// confirmed attested before it was written down.
const DEGREES = [
  // ORDER-SENSITIVE — an -e adjective whose bare stem is ALSO a band entry.
  // These four are the whole reason this invariant exists.
  ['huge', 'huger', 'hugest'], ['bare', 'barer', 'barest'],
  ['cute', 'cuter', 'cutest'], ['humane', 'humaner', 'humanest'],
  // Doubled consonant.
  ['big', 'bigger', 'biggest'], ['thin', 'thinner', 'thinnest'],
  ['fit', 'fitter', 'fittest'], ['hot', 'hotter', 'hottest'],
  ['sad', 'sadder', 'saddest'], ['wet', 'wetter', 'wettest'],
  // -y to -i.
  ['happy', 'happier', 'happiest'], ['easy', 'easier', 'easiest'],
  ['heavy', 'heavier', 'heaviest'], ['tiny', 'tinier', 'tiniest'],
  ['busy', 'busier', 'busiest'], ['angry', 'angrier', 'angriest'],
  // Silent e, stem not a word.
  ['large', 'larger', 'largest'], ['wide', 'wider', 'widest'],
  ['nice', 'nicer', 'nicest'], ['fine', 'finer', 'finest'],
  ['close', 'closer', 'closest'], ['safe', 'safer', 'safest'],
  ['simple', 'simpler', 'simplest'], ['rare', 'rarer', 'rarest'],
  // Plain.
  ['kind', 'kinder', 'kindest'], ['deep', 'deeper', 'deepest'],
  ['thick', 'thicker', 'thickest'], ['narrow', 'narrower', 'narrowest'],
  ['small', 'smaller', 'smallest'], ['great', 'greater', 'greatest'],
  ['strong', 'stronger', 'strongest'], ['warm', 'warmer', 'warmest'],
  ['cheap', 'cheaper', 'cheapest'], ['quick', 'quicker', 'quickest'],
  ['poor', 'poorer', 'poorest'], ['rich', 'richer', 'richest']
];

// Declared here for INVARIANT 9's reason, which applies unchanged: every check
// below reads this table, so deleting a row satisfies all of them by removing
// what would have complained.
eq('the degree table holds every row the review approved', DEGREES.length, 36);

// THE CONTROL. Scoring the surface form is not a mutation of the rule, it is
// what the deck did before there was a rule — no lemma, no lookup, straight to
// bandOf. If that is not comprehensively broken then the check below is proving
// nothing, because band 5 is absence and absence agrees with itself.
const rawFive = DEGREES.flatMap(([, c, s]) => [c, s]).filter((f) => W.bandOf(f) === 5);
check('unlemmatised, every degree form in this table is band 5',
  rawFive.length === DEGREES.length * 2,
  `only ${rawFive.length} of ${DEGREES.length * 2} — the check below would ` +
  'pass on a tree with no suffix rule in it');

const degreeWrong = [];
for (const [base, ...both] of DEGREES) {
  const want = W.bandOf(base);
  for (const f of both) {
    const got = W.bandOf(lemma(f));
    if (got !== want) degreeWrong.push(`${f}>${lemma(f)}(${got}) want ${base}(${want})`);
  }
}
eq('every comparative and superlative scores what its base scores',
  degreeWrong.join(' '), '');

const degreeLemma = [];
for (const [base, ...both] of DEGREES) {
  for (const f of both) if (lemma(f) !== base) degreeLemma.push(`${f}>${lemma(f)} want ${base}`);
}
eq('and lands on the base itself, not merely on its band',
  degreeLemma.join(' '), '');

// A form the bands hold themselves is answered by the guard at the top of the
// rule — `known(w)` returns it untouched — so it would pass every check above
// while testing none of the suffix logic. `cleaner`, `earnest` and `latest` are
// all band entries and all excluded for this reason, not overlooked.
const degreeBanded = DEGREES.flatMap(([, c, s]) => [c, s]).filter(W.isKnown);
eq('no degree form in this table is itself a band entry',
  degreeBanded.join(' '), '');

// The base has to be banded or the row proves nothing: two band-5 answers agree
// with each other, which is the uniform-wrong-answer trap the control covers for
// the forms and this covers for the bases.
eq('every base in this table is banded',
  DEGREES.filter(([b]) => W.bandOf(b) === 5).map(([b]) => b).join(' '), '');

// ----------------------------------------------------------------------------
// INVARIANT 11: a plural that does not end in -s scores what its singular
// scores — and an ordinary word in the same ending is left alone.
//
// FOUND WHILE PREPARING THE BAND IMPORT, not while reading this file. The
// corpus offers 79 candidates that are irregular plurals of a singular we hold
// or are about to hold, which raised the question of what the shipped tree does
// with them today. The answer was: nothing at all. `spokesmen`, `maxima`,
// `stimuli` and `syntheses` end in no suffix `reduce()` had ever looked at, so
// they fell through every rule untouched and landed in band 5 — absence from
// every list, weight 3.0, the top of the deck.
//
// TWELVE OF THEM EXIST AGAINST THE SHIPPED BANDS AND ALL TWELVE WERE BAND 5.
// Swept over all 4,427 banded lemmas, generating the plural from our
// own entry and asking SCOWL only whether it is attested. Seven of the twelve
// have a singular in band 1 or band 2 — the two bands that SUPPRESS a card — so
// `spokesman` could never be offered and `spokesmen`, in the same paragraph,
// was the first card in the deck. Unlike the -er/-est work above this one, that
// IS a visible defect: `spokesmen`, `scarves` and `selves` are ordinary English,
// and this table is the whole population rather than a sample of it.
//
// THE FIRST SWEEP RETURNED NINE AND THE NINE WERE NOT THE ANSWER. Its generator
// proposed `-men`, `-a`, `-i` and `-es` and no others, so it could not have
// found `scarves`, `selves` or `stigmata` and reported a clean zero once the
// rule closed the nine it could see. A sweep is only ever as wide as the forms
// it thinks to propose, and a zero from a narrow one reads exactly like a zero
// from a complete one. Widened, re-run, and three more came back.
//
// THE NEGATIVE ROWS ARE HALF THE POINT. `-a`, `-i` and `-men` are three of the
// commonest endings in English that are not plurals of anything: `agenda`,
// `formula`, `ski`, `safari`, `specimen`, `abdomen`. The rule fires only when
// the bands recognise the singular it proposes, exactly as every other rule in
// `reduce()` does, and NEGATIVE is what pins that guard. Take `known(c)` away
// and `specimen` reduces to `speciman` and `ski` to `skus`, which is the
// `speed` → `spe` failure in a new ending; every check above would still pass.
// The rows here are deliberately unbanded, because a banded word is answered by
// the guard at the top of the rule and would test nothing.
const PLURALS = [
  // Closed by the rule. Every one measured band 5 before it landed.
  ['consortium', 'consortia'], ['maximum', 'maxima'], ['minimum', 'minima'],
  ['momentum', 'momenta'], ['spectrum', 'spectra'], ['stimulus', 'stimuli'],
  ['spokesman', 'spokesmen'], ['spokeswoman', 'spokeswomen'],
  ['synthesis', 'syntheses'],
  // Closed by IRREGULAR, because no safe rule reaches them — see the map's own
  // note. They are in the same table because the teacher cannot tell which
  // mechanism answered, and neither should this invariant.
  ['scarf', 'scarves'], ['self', 'selves'], ['stigma', 'stigmata']
];

// Unbanded, and must come back exactly as they went in.
// FOUR WERE REPLACED — `specimen`, `agenda`, `drama` and
// `formula` — because the common-core import banded them and the row below
// requires these to be unbanded. That is not a formality: the guard asks
// whether a word ending in -a, -i or -men is returned untouched, and a banded
// word is returned untouched by `isKnown` before the plural rules are reached
// at all. It would pass for the wrong reason, which is the one outcome a guard
// must not have. Same maintenance as FOLDED below, and same reason.
const NEGATIVE = [
  'hymen', 'abdomen', 'regimen', 'omen', 'acumen', 'bitumen', 'albumen',
  'tundra', 'saliva', 'nebula', 'stamina', 'peninsula',
  'ski', 'alibi', 'safari', 'spaghetti', 'broccoli'
];

eq('the plural table holds every form the sweep found', PLURALS.length, 12);

// THE RULE THAT WAS MEASURED AND DECLINED, pinned so it is not proposed a third
// time. `-ves` -> `-f`/`-fe` looks like the obvious way to fold `scarves` and
// `selves` in, and it cannot be placed anywhere safe: below the plain `-s` rule
// it is unreachable, and above it, it claims `saves` -> `safe`. Both of those
// are band entries, so the dictionary guard that makes every other rule here
// safe is blind to it, and the commoner word loses. These two cases are what
// fails if someone adds the rule anyway.
eq('the plural of a verb is not read as an adjective', lemma('saves'), 'save');
// Stated as a refusal rather than an expected lemma on purpose. `deaves` comes
// out as `deav` today, which is a non-word and an ordinary band-5 fallthrough —
// pinning that would bless it. What must never happen is the rule's answer.
eq('and a word that merely looks like a -ves plural is not read as one',
  lemma('deaves') === 'deaf' ? 'deaves>deaf' : '', '');

// THE CONTROL, AND IT IS WEAKER HERE THAN IT IS ABOVE — measured, and said so
// rather than copied across. In INVARIANT 10 the control is the only thing
// standing between the band check and a tree with no suffix rule in it. Here
// the band check catches that on its own: strip the plural rule and all eight
// non-Greek rows report `spokesmen(5) want spokesman(2)` immediately. What this
// control actually catches is a stale ROW — a plural that has since become a
// band entry in its own right, which makes the row prove nothing — and when it
// fires, three other checks fire with it. It is kept because it names the
// problem in one line where the others describe symptoms, not because it is an
// independent detector, and calling it one would be the overclaim.
const rawPlural = PLURALS.filter(([, p]) => W.bandOf(p) === 5);
check('unlemmatised, every plural in this table is band 5',
  rawPlural.length === PLURALS.length,
  `only ${rawPlural.length} of ${PLURALS.length} — the check below would pass ` +
  'on a tree with no plural rule in it');

const pluralWrong = [];
for (const [base, p] of PLURALS) {
  const want = W.bandOf(base), got = W.bandOf(lemma(p));
  if (got !== want) pluralWrong.push(`${p}>${lemma(p)}(${got}) want ${base}(${want})`);
}
eq('every irregular plural scores what its singular scores', pluralWrong.join(' '), '');

const pluralLemma = PLURALS
  .filter(([base, p]) => lemma(p) !== base)
  .map(([base, p]) => `${p}>${lemma(p)} want ${base}`);
eq('and lands on the singular itself, not merely on its band', pluralLemma.join(' '), '');

eq('no plural in this table is itself a band entry',
  PLURALS.filter(([, p]) => W.isKnown(p)).map(([, p]) => p).join(' '), '');

eq('every singular in this table is banded',
  PLURALS.filter(([b]) => W.bandOf(b) === 5).map(([b]) => b).join(' '), '');

// The guard. These end in the same three shapes and are plurals of nothing.
eq('a word that merely ends in -a, -i or -men is returned untouched',
  NEGATIVE.filter((w) => lemma(w) !== w).map((w) => `${w}>${lemma(w)}`).join(' '), '');

eq('and every negative row is unbanded, so the guard above cannot answer for it',
  NEGATIVE.filter(W.isKnown).join(' '), '');

// ---- levels ----------------------------------------------------------------
//
// A CEFR-SHAPED estimate read off our own bands. These cases pin the mapping
// so it cannot drift silently; they say nothing about whether the estimate is
// any good, which no automated check here can judge.
eq('level of a core word', W.levelOf('the'), 'A2');
eq('level of a common word', W.levelOf('celebrate'), 'B1');
eq('level of an upper-intermediate word', W.levelOf('eligible'), 'B2');
eq('level of an academic word', W.levelOf('ubiquitous'), 'C1');
eq('level of an off-list word', W.levelOf(lemma('gerrymandering')), 'C1+');

// Band 5 is the absence of an entry, so its label must not claim to know how
// hard the word is — only that it is past the last band we wrote down.
eq('an unknown word gets the open-ended label', W.levelOf('zzzznotaword'), 'C1+');
check('every band has a level', [1, 2, 3, 4, 5].every((b) => W.LEVELS[b]));

// ============================================================================
group('lemmatise');
// ============================================================================

const LEMMAS = [
  // regular plurals
  ['words', 'word'], ['studies', 'study'], ['policies', 'policy'],
  ['watches', 'watch'], ['boxes', 'box'],
  // irregulars
  ['children', 'child'], ['ran', 'run'], ['better', 'good'],
  ['analyses', 'analysis'], ['criteria', 'criterion'],
  // doubled consonant
  ['running', 'run'], ['stopped', 'stop'],
  // the silent-e problem, resolved by the dictionary
  ['hoping', 'hope'], ['moved', 'move'], ['increased', 'increase'],
  ['demonstrated', 'demonstrate'], ['scrutinised', 'scrutinise'],
  ['constrained', 'constrain'], ['diminishing', 'diminish'],
  // ...and the other side of it: no 'e' where none belongs
  ['walking', 'walk'], ['eating', 'eat'], ['offered', 'offer'],
  ['gerrymandering', 'gerrymander'],
  // words the stripper must leave alone
  ['news', 'news'], ['during', 'during'], ['business', 'business'],
  ['politics', 'politics'], ['bias', 'bias'], ['whereas', 'whereas'],
  ['according', 'according'], ['data', 'data'],
  // short words are returned as-is
  ['an', 'an'],

  // ---- added off a real Wikipedia article ---------------------
  // Five of thirteen cards on that deck were there because the lemmatiser did
  // not reach them, so they fell to band 5 — which is the ABSENCE band and
  // carries the highest weight of all. The deck told a teacher "died" is ~C1+.
  ['died', 'die'], ['later', 'late'], ['newly', 'new'],
  ['fought', 'fight'], ['predominantly', 'predominant'],

  // -ed on a two-character stem. The floor used to be three, which silently
  // excluded the shortest and commonest verbs in English.
  ['used', 'use'], ['aged', 'age'], ['tied', 'tie'], ['owed', 'owe'],
  ['doing', 'do'], ['going', 'go'],

  // Irregular pasts. Every one of these was band 5 before the map grew: the
  // strong verbs are the commonest verbs, so they were the words most likely
  // to be offered as advanced vocabulary.
  ['won', 'win'], ['sold', 'sell'], ['slept', 'sleep'], ['flew', 'fly'],
  ['stolen', 'steal'], ['struck', 'strike'], ['hung', 'hang'],
  ['learnt', 'learn'], ['forgotten', 'forget'], ['withdrawn', 'withdraw'],

  // -ly and the comparatives, which had no rule at all until this date. These
  // are forms the bands do NOT list, which is the only case where the rules
  // fire — see the guard group below.
  ['happily', 'happy'], ['abruptly', 'abrupt'], ['starkly', 'stark'],
  ['smaller', 'small'], ['bigger', 'big'], ['easier', 'easy'],
  ['largest', 'large'],

  // THE GUARD, which is what makes those three rules safe without a list: a
  // word the bands already hold IS a lemma, so no suffix rule may touch it.
  // Every one of these has a known stem and would be wrecked without it.
  ['early', 'early'], ['likely', 'likely'], ['friendly', 'friendly'],
  ['daily', 'daily'], ['apply', 'apply'], ['truly', 'truly'],
  ['jolly', 'jolly'], ['only', 'only'], ['family', 'family'],
  ['teacher', 'teacher'], ['writer', 'writer'], ['speaker', 'speaker'],
  ['forest', 'forest'], ['other', 'other'], ['water', 'water'],
  ['number', 'number'], ['honest', 'honest'],
  // The guard is not only for words the rules would MANGLE. It also holds for
  // ones they would reduce correctly: "quickly" -> "quick" is good English and
  // still wrong here, because the bands list "quickly" with a level of its own
  // and reducing it would make that entry unreachable. The band list is the
  // authority on what counts as a headword; the suffix rules are not.
  ['quickly', 'quickly'], ['fully', 'fully'], ['latest', 'latest'],

  // Base words that merely END in -ed. Three of these were already broken and
  // had never been looked for; the rest broke the day the -ed floor dropped to
  // two characters, and they are worse, because a two-letter stem is far more
  // likely to be a real word than a three-letter one.
  ['feed', 'feed'], ['seed', 'seed'], ['shed', 'shed'], ['heed', 'heed'],
  ['weed', 'weed'], ['greed', 'greed'], ['creed', 'creed'],
  ['bleed', 'bleed'], ['need', 'need'], ['deed', 'deed'],
  // ...and the ones that really are inflections, which must still reduce.
  ['freed', 'free'], ['agreed', 'agree'], ['fleeing', 'flee']
];
for (const [input, want] of LEMMAS) eq(`lemma ${input}`, lemma(input), want);

// Every IRREGULAR target must be a word the bands actually hold. A typo in
// that map is invisible by reading — it simply sends a common verb to a lemma
// nothing matches, which is the exact defect the map was grown to fix. The
// map is imported rather than copied, so a harness copy cannot drift from it.
//
// Seven targets are legitimately off the bands: they are real English words
// the lists simply do not carry, so form and base are both band 5 and the
// mapping harms nothing. They are named rather than exempted by a rule,
// because the rule that would cover them ("allow any unbanded target") is
// exactly the rule that would let a typo through.
//
// It was eight. `basis` came off when it was banded — `bases` is the plural of
// both `base` and `basis`, this map picks the second, and while `basis` sat
// off the bands that pick sent an ordinary word to band 5 and a ~C1+ card.
// Banding it is what settles the ambiguity in the direction the tie-break
// above already argues for: the word is shown at its own level and costs a
// click, rather than being withheld at `base`'s level and never seen.
// It was seven previously, and five came off at once for the reason
// `basis` came off: the common-core import banded `thesis`, `index`, `matrix`,
// `medium` and `bacterium`, so an exemption saying "the bands do not hold this
// target" stopped describing them. Each is now shown at its own level and
// costs a click, rather than being withheld or landing on a ~C1+ card.
// AND THE LAST TWO CAME OFF AND THE EXEMPTION WENT WITH THEM.
// `goose` and `kneel` were banded — both at band 2, placed against their own
// peers rather than by feel: every other `-ves`/strong-verb neighbour this map
// carries (`mouse`, `wolf`, `thief`, `leaf`, `shelf`, `scarf`; `weep`, `creep`,
// `sweep`, `swing`, `sink`, `flee`, `strike`) already sat at band 2, and an
// irregular whose base is band 2 is withheld rather than offered at ~C1+.
//
// So the set is empty, and an empty exemption is not a set to keep — it is the
// invariant it was standing in for. The reverse check that guarded this list
// against rot is gone with it: there is no list left to rot, and a check over
// an empty set passes for the wrong reason forever.
//
// WHAT THIS COSTS IS DELIBERATE. Adding an irregular whose target no band holds
// now FAILS rather than warns, and the repair is to band the target or to
// reintroduce the exemption above with the argument written beside it. That is
// the trade this check was always heading for: the exemption existed because
// the invariant could not be stated, and it can be stated now.
const badTargets = [...V.IRREGULAR.entries()]
  .filter(([, base]) => !known(base))
  .map(([form, base]) => `${form}->${base}`);
check('every IRREGULAR target is itself a banded word',
  badTargets.length === 0, badTargets.join(', '));

// THE INVARIANT THAT WOULD HAVE CAUGHT ALL OF THIS, stated generally rather
// than as the list of words that happened to be found.
//
// An inflected form must never be rated RARER than the word it inflects. Band
// 5 is the absence of an entry and carries weight 3.0, so any form the
// lemmatiser fails to reduce is not merely mis-levelled — it is promoted above
// every word that was reduced correctly. That is why a single missing rule put
// "died", "won" and "sold" on decks as advanced vocabulary.
const promoted = [];
for (const [form, base] of V.IRREGULAR.entries()) {
  if (W.bandOf(lemma(form)) === 5 && W.bandOf(base) !== 5) {
    promoted.push(`${form} (${W.levelOf(lemma(form))}) vs ${base} (${W.levelOf(base)})`);
  }
}
check('no irregular form is scored rarer than its own base word',
  promoted.length === 0, promoted.slice(0, 10).join(', '));

// ...AND THE SAME INVARIANT ASKED OF REGULAR INFLECTION, WHICH IS ALL THE REST
// OF ENGLISH.
//
// The check above states the rule generally and then enforces it over
// V.IRREGULAR — about a hundred hand-written forms. That is the smallest
// domain the rule could possibly have. Every regular plural and third-person
// singular in the language went unasked, and 100 band entries were failing it
// the whole time: `case` is band 1 and `cases` scored band 5,
// `promise` is band 1 and `promises` scored band 5. The word is IN the list.
// The lemmatiser cannot reach it.
//
// A card is offered from a band-5 lemma at weight 3.0, the highest in the
// deck, so these do not merely arrive mis-levelled — they outrank every word
// that reduced correctly. And the page and csv-core.js both display
// `card.word`, the surface form, so the teacher sees "cases", never "cas".
// Nothing looks broken. It reads as a product with bad taste in vocabulary.
//
// This is INVARIANT 2 one step further out. That one asks whether an entry
// lemmatises to a known word — `case` -> `case`, which passes. It never asks
// what happens to the form an article actually contains.
//
// WHY THE -s FORM ONLY.
// It is the one inflection every open-class entry has, and it is the same
// string for the plural noun and the third-person verb, so it can be generated
// without knowing the part of speech. Generating -ed and -ing needs that
// knowledge: `caseing` and `chaired` are not words, and a check that has to
// carry a list of the nouns it must skip is a check whose exceptions outgrow
// its findings. The -ed and -ing rules ask the dictionary before they strip,
// which is precisely what the -es rule does not do — so this is also where the
// damage was concentrated.
//   linguistic  `linguistics` is not the plural of it — it is the name of the
//               field, a mass noun that happens to end in -s. The sweep is
//               right that the -s form scores band 5 while its base scores
//               band 3, and wrong that the two are the same word. Added
//               when the common-core import banded the adjective
//               and made the pair visible for the first time. `these` came off
//               the same day: it was here because `theses` maps to `thesis`,
//               which the bands did not hold, and the same import banded
//               `thesis`.
//
// EVERY ENTRY HERE IS THE BASE, never the -s form — the sweep walks the bands
// and asks each member for its plural, so `by` stands for `bys` and
// `linguistic` for `linguistics`. Written down because the first attempt at
// the line below put `linguistics` here and the check went on failing, naming
// the same pair, which is the right behaviour and an easy minute to lose.
const NO_S_FORM = new Set(['by', 'my', 'linguistic']);

// Regular English orthography, and nothing beyond it. The -oes plurals are
// lexical rather than rule-governed — `potatoes` but `photos` — so they are
// named below instead of guessed at here.
function sForm(w) {
  if (/(ch|sh|ss|x|z|s)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

// Entries with no -s form at all. Named one by one rather than covered by a
// rule, for the reason OFF_BAND_TARGETS gives above — the rule that would
// cover them is the rule that would hide a real failure. Every one is asserted
// to still be doing work, so an exception cannot outlive the thing it excuses.
//
// It began at eighteen. Fixing the plural rules killed fifteen of them in one
// go: once -es asks the dictionary, the invented "thoses" and "whoses" reduce
// to `those` and `whose` and stop looking like failures, so the exemptions
// covering them stopped being needed. The liveness check below is what said
// so — it failed on all fifteen and named them. Three remain, and each is a
// different reason:
//
//   by, my   two letters before the -y, so the -ies rule's length floor
//            declines them and "bies" falls to a plain -s
//   these    "theses" is in IRREGULAR as the plural of `thesis`, which is a
//            real word the bands do not hold. That mapping is right and the
//            band-5 result is honest; `these` is simply not its singular.
const inflected = [];
const deadExceptions = [];
for (const set of [W.GENERAL, W.COMMON, W.UPPER, W.ACADEMIC]) {
  for (const w of set) {
    const form = sForm(w);
    if (form === w || W.bandOf(w) === 5) continue;
    const lost = W.bandOf(lemma(form)) === 5;
    if (NO_S_FORM.has(w)) { if (!lost) deadExceptions.push(w); continue; }
    if (lost) inflected.push(`${form}>${lemma(form)}`);
  }
}
check('no regular -s form is scored rarer than its own base word',
  inflected.length === 0,
  `${inflected.length} of ${W.GENERAL.size + W.COMMON.size + W.UPPER.size +
    W.ACADEMIC.size}: ${inflected.slice(0, 12).join(' ')}`);
check('every NO_S_FORM exception is still catching something',
  deadExceptions.length === 0, `no longer needed: ${deadExceptions.join(' ')}`);

// The lexical -oes plurals, as data rather than as a rule. `does` is already
// in IRREGULAR and reduces correctly; it is listed to show the shape the other
// nine are missing. `echoes` is absent on purpose — `echo` is band 5 itself,
// so its plural scoring band 5 is an answer, not a failure.
const OES = [
  ['goes', 'go'], ['does', 'do'], ['heroes', 'hero'], ['potatoes', 'potato'],
  ['tomatoes', 'tomato'], ['vetoes', 'veto'], ['embargoes', 'embargo'],
  ['mosquitoes', 'mosquito'], ['undergoes', 'undergo'],
  ['manifestoes', 'manifesto']
];
const oesLost = OES
  .filter(([form, base]) => W.bandOf(base) !== 5 && W.bandOf(lemma(form)) === 5)
  .map(([form]) => `${form}>${lemma(form)}`);
check('no -oes plural is scored rarer than its own base word',
  oesLost.length === 0, oesLost.join(' '));

// ---------------------------------------------------------------------------
// THE SILENT-E FOLD.
//
// The lemma is a GROUPING KEY. Its job is not to be a word, it is to be the
// SAME for every form of one word — and for an off-list base ending in -e it
// was not, because the base never enters the -ing/-ed loop that strips the e
// off its own inflections. `parse` filed apart from `parsed`, and one word
// exported as two cards.
//
// Restoration cannot fix this: it is confirmed by isKnown, and the words that
// need it are exactly the ones isKnown declines. So the fold goes the other
// way and removes the e from both sides. See vocab-core.js.
// ---------------------------------------------------------------------------
// `migrate` and `declare` stood here until D1 banded them, and the guard below
// said so rather than passing on words that had stopped being off-list.
// Seven of the ten went the same way, to the common-core import:
// `parse`, `expose`, `bundle`, `toggle`, `quote`, `truncate` and `rename`. The
// guard named each one rather than passing, which is the whole point of it
// being written as a refusal instead of a skip — a fold test whose subjects
// have all been banded is a fold test that proves nothing about folding.
const FOLDED = ['deprecate', 'collide', 'traverse', 'transpose', 'extrude',
  'connote', 'elide', 'obtrude', 'occlude', 'permeate'];
const unmerged = [];
for (const base of FOLDED) {
  if (known(base)) { unmerged.push(`${base} is banded, pick another`); continue; }
  const forms = [base, base + 'd', base.slice(0, -1) + 'ing', base + 's'];
  const keys = new Set(forms.map(lemma));
  if (keys.size !== 1) unmerged.push(`${base}: ${forms.map((f) => `${f}>${lemma(f)}`).join(' ')}`);
}
check('an off-list base ending in -e files with its own inflections',
  unmerged.length === 0, unmerged.join(' | '));

// The control that makes the check above mean something. If these broke too,
// the fold would be papering over a rule that was wrong for every word rather
// than repairing one that was wrong for band 5.
//
// NO_STRIP forms are excluded, and the exclusion is the interesting part. It
// holds `increasing`, which is a headword in its own right — "increasing
// pressure" is not a use of the verb — so it files apart from `increase` BY
// DESIGN. That is a split this fold must not close, and the first run of this
// control found it, which is the difference between a control and a formality.
const inbandSplit = [];
for (const base of ['assume', 'decide', 'increase', 'hope', 'promise']) {
  if (!known(base)) { inbandSplit.push(`${base} is not banded, control is void`); continue; }
  const forms = [base, base + 'd', base.slice(0, -1) + 'ing', base + 's']
    .filter((f) => !V.NO_STRIP.has(f));
  const keys = new Set(forms.map(lemma));
  if (keys.size !== 1) inbandSplit.push(`${base}: ${[...keys].join(' ')}`);
}
check('an in-band base ending in -e still files with its own inflections',
  inbandSplit.length === 0, inbandSplit.join(' | '));

// GUARD 1, THE STEM. 82 off-list -e words sit directly on top of a banded word.
// Folding them hands a C1+ word its neighbour's band, and harvest DROPS bands 1
// and 2 — the card does not arrive mis-levelled, it does not arrive.
const swallowed = [];
for (const w of ['suite', 'bathe', 'cape', 'fare', 'bane', 'dote', 'flue']) {
  if (known(w) || !known(w.slice(0, -1))) continue;   // not the shape being tested
  if (lemma(w) !== w) swallowed.push(`${w}>${lemma(w)}`);
}
check('an off-list -e word is not folded onto a banded stem',
  swallowed.length === 0, swallowed.join(' '));

// GUARD 2, THE NAMES. isProperNoun() is asked about the LEMMA, and 100 of the
// 886 entries end in -e, 16 of them demonyms. This is the same closure argument
// as INVARIANT 6, restated at the fold because the fold is what would break it
// and because a two-argument caller — which is what the harness used to be —
// gets a fold that cannot see the name list at all.
const foldedNames = [...W.PROPER_NOUNS]
  .filter((n) => n.endsWith('e') && V.foldSilentE(n, held) !== n);
check('the fold leaves every proper noun ending in -e whole',
  foldedNames.length === 0, foldedNames.slice(0, 8).join(' '));

// GUARD 3, THE FLOOR. harvest skips any lemma under 3 characters, so folding a
// 3-letter word would not mis-file it — it would delete the word.
const tooShort = [];
for (const w of ['ace', 'ave', 'eve', 'ode', 'ore', 'awe']) {
  if (V.foldSilentE(w, held).length < 3) tooShort.push(`${w}>${V.foldSilentE(w, held)}`);
}
check('the fold never produces a lemma harvest will discard',
  tooShort.length === 0, tooShort.join(' '));

// AND THE DEFECT ITSELF, end to end, because everything above tests the key and
// the defect was a card. Six uses of one word; the deck used to carry "parsed"
// at 4 and "parse" at 2, ranked separately, scored separately.
const splitText =
  'The tool will parse the page for you. It parsed the whole article last night. ' +
  'Parsing the markup is the slow step, and the team parses every draft twice. ' +
  'A second parse ran later. The reviewer parsed it again before the meeting.';
const splitDeck = V.harvest(splitText, null, null,
  { isKnown: known, bandOf: W.bandOf, isName: W.isProperNoun });
const parseCards = splitDeck.cards.filter((c) => c.word.toLowerCase().startsWith('pars'));
eq('one word yields one card, not one per spelling', parseCards.length, 1);
eq('and it is counted across every form it took', parseCards[0] ? parseCards[0].count : 0, 6);

// The wiring, asserted where it is actually used. harvest builds the fold's
// predicate from the two it is handed; a version that forgot would fold names,
// and this is the check that would notice rather than INVARIANT 6, which tests
// lemmatise directly.
const nameDeck = V.harvest(
  'Charlotte met Irene in Florence. Charlotte and Irene had not met since Florence.',
  null, null, { isKnown: known, bandOf: W.bandOf, isName: W.isProperNoun });
check('harvest still suppresses names ending in -e',
  nameDeck.cards.length === 0,
  `leaked: ${nameDeck.cards.map((c) => `${c.word}(${c.lemma})`).join(' ')}`);

// AND THE OTHER HALF OF THE NAME DEFENCE. isProperNoun only knows the names we
// listed; the capitalisation census catches the rest, by looking a GROUP up in
// a map that has to be keyed the same way. The fold changes that key, so the
// census is downstream of this change whether or not it looks it.
//
// Ravenscombe is invented on purpose: an -e name the list cannot hold, so the
// census is the only thing standing between it and a flashcard. Verified by
// mutation — key the census off tokenise's dictionary-free lemma, which is the
// bug filedLemma was written to end, and this is one of the two checks that
// notice.
const unlisted = 'Ravenscombe';
check('the -e name used here is genuinely not on the list',
  !W.PROPER_NOUNS.has(lemma(unlisted.toLowerCase())) &&
  !W.PROPER_NOUNS.has(unlisted.toLowerCase()), unlisted);
const censusDeck = V.harvest(
  `The council met at ${unlisted} on Tuesday. Reaching ${unlisted} takes an hour, ` +
  `and ${unlisted} has no station of its own.`,
  null, null, { isKnown: known, bandOf: W.bandOf, isName: W.isProperNoun });
check('the capitalisation census still catches an unlisted name ending in -e',
  !censusDeck.cards.some((c) => c.word.toLowerCase().startsWith('ravenscomb')),
  `leaked: ${censusDeck.cards.map((c) => `${c.word}(${c.lemma})`).join(' ')}`);

// AND THE VERDICT ON THE OTHER SIDE OF THE SAME RULE, which nothing asserted
// anywhere previously. `only ever sentence-initial -> unproven, and
// therefore ALLOWED through`, on the stated ground that a capital at a sentence
// start is the orthography's and not the author's — so the word reaches the
// review table for one click instead of being withheld silently.
//
// OBSERVED ON A REAL DECK. An English-language Wikipedia article opened its
// only sentence about the source with `Ethnologue`, and the word went out as a
// card face at band 5. Nothing was broken: that is this ruling, working. What
// was missing was any check that it still is. The case directly above tests
// only the CATCHING half, so a change that started withholding sentence-initial
// capitals too would have left every test in this file green while quietly
// reversing a decision — and the deck would just get shorter, which is the
// direction nobody investigates.
//
// The same invented word as above, moved. Two placements, two verdicts, one
// rule; and because it is the same word, neither case can be passing for a
// reason about the word rather than about its position.
const initialOnly = V.harvest(
  `${unlisted} met on Tuesday. ${unlisted} takes an hour to reach.`,
  null, null, { isKnown: known, bandOf: W.bandOf, isName: W.isProperNoun });
check('but a capital seen only at a sentence start is allowed through',
  initialOnly.cards.some((c) => c.word.toLowerCase().startsWith('ravenscomb')),
  `withheld: ${initialOnly.cards.map((c) => c.word).join(' ')}`);

// ============================================================================
group('sentence segmentation');
// ============================================================================

const SENTENCES = [
  ['Dr. Aldana met the board. She resigned.', 2, 'title abbreviation'],
  ['Use a hedge, e.g. a caveat. Then argue.', 2, 'latin abbreviation'],
  ['Inflation hit 3.5% last year. Wages did not follow.', 2, 'decimal'],
  ['The deal was worth $1.2bn. Nobody blinked.', 2, 'money decimal'],
  ['He paused... then spoke. The room was silent.', 2, 'ellipsis'],
  ['“It is over.” He left the building.', 2, 'quote after stop'],
  ['J. R. R. Tolkien wrote it. It sold well.', 2, 'initials'],
  ['George W. Bush spoke first. Nobody moved.', 2, 'middle initial'],
  ['What?! Nobody told me.', 2, 'terminator run'],
  ['Visit google.com for details. Then decide.', 2, 'dot inside a domain'],
  ['A heading with no stop', 1, 'unterminated tail'],
  ['', 0, 'empty input'],
  // The acronym pair: identical punctuation, opposite answers, and only the
  // following word can tell them apart.
  ['Based in the U.S. The vote passed anyway.', 2, 'acronym then sentence'],
  ['He joined the U.S. Senate in 1998.', 1, 'acronym inside a name'],
  ['The U.S. Air Force denied it.', 1, 'acronym then proper noun'],
  // Block boundaries, as a line break leaves them. A heading carries no terminator, so only
  // the newline keeps it off the front of the paragraph beneath.
  ['Boundaries Redrawn\nThe commission said little.', 2, 'heading then body'],
  ['One.\nTwo.\nThree.', 3, 'newline and full stop together'],
  ['Trailing newline is not a sentence.\n', 1, 'trailing newline']
];
for (const [text, want, label] of SENTENCES) {
  eq(`segment: ${label}`, S.segment(text).length, want);
}

// Offsets must slice back to exactly the sentence text, or vocab-core maps
// words to the wrong sentence.
const offText = 'Dr. Aldana met the board. She resigned within a week. The vote was close.';
const offs = S.segment(offText);
let offsetsOk = true;
for (const s of offs) if (offText.slice(s.start, s.end) !== s.text) offsetsOk = false;
check('sentence offsets slice back exactly', offsetsOk);
eq('sentenceAt finds the right sentence',
  offs[S.sentenceAt(offs, offText.indexOf('resigned'))].text,
  'She resigned within a week.');
eq('sentenceAt returns -1 between sentences',
  S.sentenceAt(offs, offText.indexOf('board.') + 6), -1);

// ============================================================================
group('sentence choice');
// ============================================================================

// Which sentence lands on the card back. This used to be "the first one of a
// usable length", and a live BBC article showed the cost: "advantage" drew
// thirty words of executive-order prose because that occurrence came first and
// fitted inside the old ceiling. Shortest wins now.
function choose(text, word) {
  const sentences = S.segment(text);
  const occurrences = [];
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    occurrences.push({ start: i });
  }
  const picked = V.chooseSentence(occurrences, sentences);
  return picked && picked.text;
}

eq('picks the shorter of two usable sentences',
  choose(
    'The measure confers a clear advantage on every applicant who files early ' +
    'and can show that they were resident in the district for the whole of ' +
    'the preceding year. The advantage was obvious to every applicant in the room.',
    'advantage'),
  'The advantage was obvious to every applicant in the room.');

eq('order does not matter — shortest still wins',
  choose(
    'The advantage was obvious to every applicant in the room. The measure confers a clear advantage on every ' +
    'applicant who files early and can show that they were resident in the ' +
    'district for the whole of the preceding year.',
    'advantage'),
  'The advantage was obvious to every applicant in the room.');

// A sentence over HARD_MAX is still better than no card at all.
const runOn =
  'The committee agreed that the advantage which had accrued to the earlier ' +
  'applicants over the course of the preceding eighteen months was neither ' +
  'foreseen by the drafters nor addressed by any of the amendments that were ' +
  'tabled during the second reading, and that it would therefore fall to the ' +
  'incoming administration to decide whether the schedule should be reopened ' +
  'at all before the deadline passes next spring.';
eq('an over-long sentence is used when it is the only one',
  choose(runOn, 'advantage'), runOn);

// The floor does real work, and it caught a bad case while this was written.
// "The advantage was obvious." is four words, which is a fragment rather than
// context — shorter is better only down to the point where the sentence stops
// teaching the word.
eq('a sentence below the floor is passed over for a longer one',
  choose(
    'The advantage was obvious. The measure confers a clear advantage on ' +
    'every applicant who files early in the year.',
    'advantage'),
  'The measure confers a clear advantage on every applicant who files early in the year.');

// Determinism is the constraint the whole function is written around: two runs
// over one article must not disagree, or the teacher cannot trust the export.
const tie = 'The vote was close and bitter. The vote was late and bitter.';
eq('equal lengths break to the earlier occurrence',
  choose(tie, 'vote'), 'The vote was close and bitter.');

// WHAT THE DECK HAS ALREADY SPENT.
//
// Shortest-wins, asked once per word with no memory, makes the shortest
// sentence in the passage the answer to every question it is a candidate for.
// These pin the fourth argument that fixes it. `used` is a count per sentence
// offset, and it only ever REORDERS candidates — the cases below check both
// that it moves a word and that it cannot cost a word its card.
function chooseWith(text, word, usedTexts) {
  const sentences = S.segment(text);
  const used = new Map();
  for (const t of usedTexts) {
    const hit = sentences.find((s) => s.text === t);
    if (!hit) throw new Error(`test bug: no sentence reads "${t}"`);
    used.set(hit.start, (used.get(hit.start) || 0) + 1);
  }
  const occurrences = [];
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    occurrences.push({ start: i });
  }
  const picked = V.chooseSentence(occurrences, sentences, used);
  return picked && picked.text;
}

const PAIR =
  'The advantage was obvious to every applicant in the room. ' +
  'The measure confers a clear advantage on every applicant who files early in the year.';
const SHORT = 'The advantage was obvious to every applicant in the room.';
const LONG =
  'The measure confers a clear advantage on every applicant who files early in the year.';

eq('with nothing spent, the shortest still wins — the old rule is the default',
  chooseWith(PAIR, 'advantage', []), SHORT);
eq('a sentence another card already carries loses to an unused one',
  chooseWith(PAIR, 'advantage', [SHORT]), LONG);
eq('and it goes back to the shortest once both are equally spent',
  chooseWith(PAIR, 'advantage', [SHORT, LONG]), SHORT);

// QUALITY IS RANKED ABOVE NOVELTY. A back nobody has used is worth having;
// it is not worth fifty words. If this case ever fails, the first key has
// been dropped and variety is being bought with sentences no one can read.
const MIXED =
  'The advantage was obvious to every applicant in the room. ' +
  'The committee accepted that the advantage accruing to the earlier applicants ' +
  'over the preceding eighteen months had been neither foreseen by the drafters ' +
  'nor addressed by any amendment tabled during the second reading, and that the ' +
  'incoming administration would have to decide whether to reopen the schedule.';
eq('an unused sentence past the ideal length does not displace a used one inside it',
  chooseWith(MIXED, 'advantage', [SHORT, SHORT, SHORT]), SHORT);

// A word occurring once has no choice, and must not be punished for it.
eq('a word with one sentence keeps it however often it has been used',
  chooseWith(SHORT, 'advantage', [SHORT, SHORT, SHORT, SHORT]), SHORT);

// DETERMINISM IS A PROPERTY OF THE SET, NOT OF THE ORDER IT ARRIVES IN.
//
// The last key is the sentence's offset, and while `harvest` is the only
// caller it looks redundant — occurrences are built in document order, so the
// first candidate holding the winning key already has the lowest offset.
// Removing the key passed all 179 cases when this was mutation-tested.
//
// It is kept, and this case is why. Without it, determinism rests on an
// invariant living in the CALLER rather than in this function, which is the
// same hidden coupling that let a fixture's paragraph length silently disable
// four extraction checks. Deduplicating a lemma across several articles
// would be a caller that would merge occurrence lists and have no
// reason to keep them sorted.
const tied = 'The vote was close and bitter. The vote was late and bitter.';
const tiedSentences = S.segment(tied);
const forwards = [{ start: tied.indexOf('vote') }, { start: tied.lastIndexOf('vote') }];
const backwards = [forwards[1], forwards[0]];
eq('two equal candidates resolve the same way whichever order they arrive in',
  V.chooseSentence(backwards, tiedSentences).text,
  V.chooseSentence(forwards, tiedSentences).text);
eq('and that answer is the earlier sentence',
  V.chooseSentence(backwards, tiedSentences).text,
  'The vote was close and bitter.');

// ---- A HEADLINE IS NOT A SENTENCE -----------------------------------------
//
// Added off a real deck: an Al Jazeera card carried
// *"Israeli forces storm West Bank town of Tammun, Wafa reports"* on its back.
//
// A newline is `segment`'s hard boundary, so a heading arrives correctly
// isolated and then WINS ON LENGTH — headlines are short, and short was the
// first key. These pin the key that now sits above it.
//
// The fixture is built the way the extension's extractor built one: a newline at every
// block boundary, nothing else. Nothing here fabricates a full stop, which is
// the thing the segmenter's own comment rules out.
const HEADED =
  'Officials defend overnight incursion into border town\n'
  + 'The mayor said the overnight operation had been planned for weeks and was '
  + 'carried out with the knowledge of the regional authority.';
const HEADLINE = 'Officials defend overnight incursion into border town';
const BODY =
  'The mayor said the overnight operation had been planned for weeks and was '
  + 'carried out with the knowledge of the regional authority.';

// Liveness first: the two are genuinely both candidates, and the headline is
// genuinely the shorter. Without this the case below passes on a fixture where
// the headline was never in the running.
check('the headline and the prose both hold the word, and the headline is shorter',
  S.segment(HEADED).length === 2
  && HEADED.indexOf('overnight') < HEADED.indexOf('\n')
  && HEADED.lastIndexOf('overnight') > HEADED.indexOf('\n')
  && V.wordCount(HEADLINE) < V.wordCount(BODY),
  `${S.segment(HEADED).length} sentences, ${V.wordCount(HEADLINE)} vs ${V.wordCount(BODY)} words`);

eq('a sentence that ends in a stop beats a shorter one that does not',
  choose(HEADED, 'overnight'), BODY);

// AND IT OUTRANKS THE OTHER TWO KEYS, not just length. A back the deck has
// already spent three times is still prose, and prose is the promise — the
// sentence is there to show the word "in the register the writer chose", and
// headline register is not that register.
eq('and it still wins when the prose is the sentence already spent',
  chooseWith(HEADED, 'overnight', [BODY, BODY, BODY]), BODY);

// NO WORD LOSES ITS CARD TO THIS RULE, which is the bound the whole design
// rests on. `incursion` is in the headline and nowhere else, so the rule has
// nothing to prefer and must return the headline anyway.
eq('a word that appears only in a headline keeps the headline',
  choose(HEADED, 'incursion'), HEADLINE);

// AND THE SAME BOUND ON THE FALLBACK PATH, WHICH THE CASE ABOVE DOES NOT
// REACH. Written after a mutation survived: making the rule filter
// `chooseSentence`'s fallback — `return best || (endsInAStop(fallback) ?
// fallback : null)` — passed all 841 cases. The headline above is 7 words,
// inside IDEAL_MIN..HARD_MAX, so it becomes `best` on the ordinary path and
// the fallback is never consulted. The comment here said otherwise and was
// wrong about its own mechanism.
//
// The fallback is reached only by a candidate OUTSIDE the length bounds, so
// this fixture is a 3-word heading — under the floor — and it is stopless as
// well. That pair is the one input where a rule about terminal punctuation
// could cost a word its card entirely, and it must not.
const STUB = 'Overnight incursion condemned';
check('a word whose only sentence is both too short and stopless still gets it',
  V.wordCount(STUB) < 6 && !/[.!?…]$/.test(STUB),
  `${V.wordCount(STUB)} words, ends "${STUB.slice(-1)}"`);
eq('and the card back is that line rather than nothing',
  choose(STUB, 'incursion'), STUB);

// THE CLOSING QUOTE COMES FROM sentence-core's OWN SET, and this is the case
// that says so. `segment` pulls a trailing quote INTO the sentence it closes,
// so a quoted sentence ends `."` — a rule with its own idea of which
// characters may follow a stop would refuse it and prefer the headline, which
// is the mutation this kills.
const QUOTED =
  'Officials defend overnight incursion into border town\n'
  + 'The mayor said, "the overnight operation was planned for weeks and was '
  + 'carried out with the regional authority\'s knowledge."';
eq('a sentence ending in a stop inside a closing quote is still prose',
  choose(QUOTED, 'overnight'),
  QUOTED.slice(QUOTED.indexOf('\n') + 1));

// The article's last line often has no stop either, and it is demoted by the
// same rule. That cost is named in vocab-core's comment and is bounded here:
// it only ever loses to a sentence holding the SAME word, so a trailing line
// that is the only home for a word keeps it.
const TRAILS =
  'The mayor confirmed the overnight operation had been planned for weeks.\n'
  + 'Reporting by our correspondent in the region';
eq('a stopless trailing line loses to prose holding the same word',
  choose(TRAILS, 'overnight'),
  'The mayor confirmed the overnight operation had been planned for weeks.');

// ---- A WORD ON A LINE OF ITS OWN IS NOT A SENTENCE --------------------------
//
// Off the Declaration fixture: `Grievances`, `Constitution` and `Edit` each
// went out with the heading as their back. Under 6 words both lines are
// fallbacks, and the fallback is the first, so before the rule the heading
// won over the short sentence beneath it. The rule reads the lines, so these
// hand `chooseSentence` the text, and match the capital the heading carries.
function chooseIn(text, word) {
  const occurrences = [...text.matchAll(new RegExp(word, 'gi'))]
    .map((m) => ({ start: m.index }));
  const picked = V.chooseSentence(occurrences, S.segment(text), undefined, text);
  return picked && picked.text;
}
const HEADING = 'Grievances\nThey aired grievances.';
eq('a word on a line of its own never wins the fallback',
  chooseIn(HEADING, 'grievances'), 'They aired grievances.');

// The test is the line: a one-word sentence the writer wrote inside a
// paragraph is still a sentence, and the note says "on a line of their own".
const INLINE = 'They objected. Grievances. The king said nothing.';
eq('a one-word sentence inside a paragraph is still chosen',
  chooseIn(INLINE, 'grievances'), 'Grievances.');

const ONLY_HEADING =
  'Grievances\nThe colonists wrote to the king about the many unfair taxes.';
const onlyHeading = V.harvest(ONLY_HEADING, 0, ONLY_HEADING.length,
  { bandOf: W.bandOf, isKnown: known, isName: W.isProperNoun, limit: 20 });
check('a word met only on a line of its own is not carded, and is counted',
  !onlyHeading.cards.some((c) => c.word === 'grievances')
  && onlyHeading.stats.rejected.alone === 1
  && onlyHeading.stats.withheld >= 1,
  JSON.stringify({ words: onlyHeading.cards.map((c) => c.word), stats: onlyHeading.stats }));

// The Declaration fixture, as pasted with its line breaks kept: the three
// headings measured when the rule landed, and no other card.
const DECLARATION = fs.readFileSync(
  path.join(CORE, '../../tests/fixtures/paste/wikisource.chrome.txt'), 'utf8');
const declaration = analyse({ raw: DECLARATION, keepLineBreaks: true });
check('the Declaration loses exactly its three heading cards',
  declaration.stats.rejected.alone === 3
  && !declaration.cards.some((c) => ['constitution', 'edit', 'grievances'].includes(c.word))
  && declaration.cards.every((c) => c.sentence && V.wordCount(c.sentence.text) > 1),
  JSON.stringify(declaration.stats.rejected));

// ============================================================================
group('harvest');
// ============================================================================

const ARTICLE =
  'Dr. Aldana published the findings last week. The report argues that the ' +
  'boundaries were drawn to entrench a majority, a practice critics call ' +
  'gerrymandering. Gerrymandering is now ubiquitous in state politics, and ' +
  'Aldana says its consequences are subsequently felt at every level. ' +
  'Turnout fell 3.5% in the affected districts. The committee demanded she ' +
  'substantiate the ambiguous claim.';

const opts = {
  bandOf: W.bandOf, isKnown: known, isName: W.isProperNoun, limit: 20
};
const all = V.harvest(ARTICLE, 0, ARTICLE.length, opts);
const words = all.cards.map((c) => c.word);

check('keeps a rare word', words.includes('gerrymandering'));
check('keeps an academic word', words.includes('ubiquitous'));
check('drops general-service words', !words.some((w) => /^(the|last|week|now)$/i.test(w)));

// The same defect the lemma table above covers, asserted where it actually
// hurt: on a deck. A unit case proves `fought` reduces to `fight`; only this
// proves that reducing it is what keeps the word off the card.
//
// Written as its own passage rather than by extending ARTICLE, because
// ARTICLE's own assertions depend on its exact contents and a shared fixture
// that everything edits is how those quietly stop meaning anything.
const PAST_TENSE =
  'The regiment fought through the campaign and won. Its commander died ' +
  'later that year, and the newly promoted officer sold the horses he had ' +
  'stolen. He slept badly and used the last of the water.';
const pastFaces = V.harvest(PAST_TENSE, 0, PAST_TENSE.length, opts)
  .cards.map((c) => c.word.toLowerCase());
const inflectedLeaks = ['fought', 'won', 'died', 'later', 'newly', 'sold',
  'stolen', 'slept', 'used'].filter((w) => pastFaces.includes(w));
check('no ordinary inflected form reaches the deck as vocabulary',
  inflectedLeaks.length === 0, `offered as cards: ${inflectedLeaks.join(' ')}`);

// Band 2 must suppress a card, not merely rank it low. This is the whole point
// of the band: before it existed these words were band 5 — "rare BY
// CONSTRUCTION" — and a teacher was being offered "born" and "foreign" as
// vocabulary worth teaching.
const B2 =
  'The pregnant tourist celebrated her birthday at a foreign hotel. ' +
  'Her famous neighbour was born nearby and signed the register correctly. ' +
  'The committee will subsequently substantiate the ambiguous claim.';
const b2run = V.harvest(B2, 0, B2.length, opts);
const b2words = b2run.cards.map((c) => c.word.toLowerCase());
const leaked = ['pregnant', 'celebrated', 'birthday', 'foreign', 'hotel',
  'famous', 'neighbour', 'born', 'signed', 'register', 'correctly']
  .filter((w) => b2words.includes(w));
check('band 2 words never reach the table', leaked.length === 0,
  `leaked: ${leaked.join(' ')}`);
check('and the academic words in the same passage still do',
  b2words.includes('subsequently') && b2words.includes('ambiguous'),
  `got: ${b2words.join(' ')}`);
check('the suppressed words are counted, not silently dropped',
  b2run.stats.rejected.band1 >= 8, `counted ${b2run.stats.rejected.band1}`);

// Proper nouns. "Aldana" is capitalised mid-sentence twice, which is the only
// signal that separates it from a rare but teachable word.
check('rejects a mid-sentence proper noun', !words.some((w) => /aldana/i.test(w)));
check('counts the rejection', all.stats.rejected.name >= 1);

// A capital that is only ever sentence-initial says nothing about the word.
check('turnout is not carried as a name', !words.includes('Turnout'));

// THE SAME RULE, FOR A WORD THE DICTIONARY RE-LEMMATISES.
//
// "Turnout" above passes on a word both lemmatisers agree about, so it proved
// the rule and not the lookup. The census is built from `tokenise`, which has
// no word list and files "predominantly" under itself and "hoping" under
// "hop"; harvest, holding the list, groups them under "predominant" and
// "hope". The census lookup therefore missed, `rec` came back undefined, and
// the correction was skipped in silence — for the whole silent-e class, since
// the day the dictionary argument was added.
//
// Caught by a teacher reading a real deck with "Predominantly" on a card face,
// not by the 246 cases standing at the time. The two keys are now derived in
// one place; this is what fails if they are ever separated again.
const POSITIONAL =
  'Predominantly rural counties reported late. Hoping for calm, the board ' +
  'met. Increased turnout was recorded across the affected districts.';
const posFaces = V.harvest(POSITIONAL, 0, POSITIONAL.length, opts)
  .cards.map((c) => c.word);
const stillCapital = posFaces.filter((w) => /^[A-Z]/.test(w));
check('a positional capital is dropped even when the lemma is re-derived',
  stillCapital.length === 0, `card faces still capitalised: ${stillCapital.join(' ')}`);

// AND THE CASE THE RULE USED TO GET BACKWARDS.
//
// The test was `lower === 0 && midCap === 0`: correct only where the block
// never showed the word in lower case at all. But meeting "nonetheless"
// mid-sentence is the STRONGEST evidence that the "Nonetheless" opening the
// sentence before it is positional — and that was the one case excluded. A
// block holding both forms shipped the capital; a block holding only the
// capital did not, which is the wrong way round.
//
// The surface vote cannot rescue it: one of each ties, and a tie keeps the
// first seen, which for a sentence-opening word is the capital. So this fails
// on the whole of the old condition, not on a corner of it.
const BOTH_CASES =
  'Nonetheless the committee met. The rain fell hard and nonetheless the ' +
  'children stayed inside. Discourse in the hall was loud, and discourse ' +
  'continued well past dusk.';
const bothFaces = V.harvest(BOTH_CASES, 0, BOTH_CASES.length, opts)
  .cards.map((c) => c.word);
const wronglyCapital = bothFaces.filter((w) => /^[A-Z]/.test(w));
check('a word seen in lower case is not capitalised by having opened a sentence',
  wronglyCapital.length === 0, `card faces still capitalised: ${wronglyCapital.join(' ')}`);
check('and those words did reach the deck, so the case is testing something',
  bothFaces.includes('nonetheless') && bothFaces.includes('discourse'),
  `faces: ${bothFaces.join(' ')}`);

// THE WIDENED RULE DID BECOME "LOWER-CASE EVERYTHING".
//
// This block read `a genuine mid-sentence capital survives on the card face`
// and asserted `Cavalry`. The passage below is that fixture, unchanged, and the
// reasoning it rested on was half right: the capital in "the 5th Cavalry
// Division" is real and is not positional. It is also not the WORD'S. It is the
// division's, and a headword does not inherit a capital from a name it stands
// inside — the word on the card is `cavalry`, which is why there is a card.
//
// What settled it was the back. `Cavalry` shipped over "He served in the
// cavalry for years.", a front the evidence printed beneath it refuses; 14 of
// the 41 capitalised faces across fifteen corpora were doing exactly that. So
// the assertion here is the PAIR and not the face on its own.
//
// The hollowness guard the old block carried is kept and is still needed: the
// passage has to show "cavalry" in lower case somewhere, or looksLikeName
// rejects it, no card is produced, and a check on the face passes on nothing.
const PHRASE =
  'He served in the cavalry for years. The 5th Cavalry Division moved at ' +
  'dawn, and the Cavalry Division held its ground until noon.';
//
// AND THE PASSAGE NEEDS A MARGIN, which a mutation run found and reading did
// not. Drop it to one capital and two lower-case sightings and the SURFACE VOTE
// returns `cavalry` on its own; the checks below then pass without the face
// rule doing anything, and the block goes quietly hollow. The capital has to
// outnumber the lower case for the rule to be the thing under test.
const phraseCaps = (PHRASE.match(/Cavalry/g) || []).length;
const phraseLower = (PHRASE.match(/cavalry/g) || []).length;
check('the capital outnumbers the lower case, so the vote cannot do this alone',
  phraseCaps > phraseLower, `Cavalry x${phraseCaps}, cavalry x${phraseLower}`);

const phrase = V.harvest(PHRASE, 0, PHRASE.length, opts)
  .cards.find((c) => c.lemma === 'cavalry');
check('the word is on the deck at all, so the next checks have something to judge',
  !!phrase, 'cavalry was refused, so nothing below this line is being tested');
check('a capital owned by the phrase does not reach the card face',
  !!phrase && phrase.word === 'cavalry', `face: ${phrase && phrase.word}`);
check('and the face is now spelled the way its own back spells it',
  !!phrase && !!phrase.sentence && phrase.sentence.text.includes(phrase.word),
  `${phrase && phrase.word} over ${phrase && phrase.sentence && phrase.sentence.text}`);

// TITLE CASE, the shape the clause was filed under. A work's title capitalises
// every content word, so a citation hands the census a mid-sentence capital for
// an ordinary noun, and one lower-case sighting elsewhere then clears the word
// of being a name while leaving the capital on its face. `History` x11 out of
// "A History of the English Language" was the largest single instance.
const TITLED =
  'Baugh, Albert (1951). A History of the English Language. London. ' +
  'Cable, Thomas (2002). A History of the English Language. London. ' +
  'The English language in Canada: status, history and comparative ' +
  'analysis. Studies in Linguistics.';
const titled = V.harvest(TITLED, 0, TITLED.length, opts)
  .cards.find((c) => c.lemma === 'history');
check('a title case capital does not reach the card face either',
  !!titled && titled.word === 'history', `face: ${titled && titled.word}`);

// WHY THE PROMISE-6 COMPARISON AT THE END OF THIS FILE FOLDS CASE, pinned so
// that nobody reads the rule above as licence to tighten it. The face is lower
// case; the sentence it was chosen from need not be, and here is not — every
// sighting of the word in `history`'s own back is capitalised. A case-sensitive
// `sentence.includes(face)` would fail on a card that is entirely correct.
check('a lower-cased face may still sit over a back that capitalises it',
  !!titled && !!titled.sentence &&
  !titled.sentence.text.includes(titled.word) &&
  titled.sentence.text.toLowerCase().includes(titled.word),
  `${titled && titled.word} over ${titled && titled.sentence &&
    titled.sentence.text}`);

// THE SAME MECHANISM WITH NO TITLE ANYWHERE NEAR IT, because the clause called
// this a bibliography residue and 25 of the 41 stood in prose. A table flattens
// into one unbroken run of text, so every header cell becomes a mid-sentence
// capital: the article's consonant chart alone carded `Nasal`, `Velar`,
// `Labiodental`, `Lateral`, `Affricate` and `Plosive`, and its table of
// contents carded `History`, `Phonology`, `Dialects`, `Contents` and `Nouns`.
const CHARTED =
  'Consonant phonemes Bilabial Labiodental Dental Alveolar Velar Nasal m ' +
  'n Plosive p b t d Affricate. Clusters of nasal and stop are only ' +
  'allowed in codas, and the voiceless velar fricative is rare.';
const charted = V.harvest(CHARTED, 0, CHARTED.length, opts).cards;
const chartFaces = charted.map((c) => c.word);
check('a table header capital does not reach the card face',
  chartFaces.includes('nasal') && chartFaces.includes('velar'),
  `faces: ${chartFaces.join(' ')}`);
check('and those cards carry the prose sentence, not the header row',
  charted.filter((c) => c.lemma === 'nasal' || c.lemma === 'velar')
    .every((c) => !!c.sentence && c.sentence.text.includes(c.word)),
  charted.map((c) => `${c.word}|${c.sentence && c.sentence.text}`).join(' /// '));

// THE CONTROL, and the reason this is a change to the FACE and not to the
// filter. Lower-casing the face unconditionally must not lower-case a name onto
// a deck: a word only ever met capitalised away from a sentence start is still
// refused, and still counted where it always was.
const NAMEONLY =
  'The committee met in Aldana last week and again on Tuesday. Aldana was ' +
  'chosen for its transport links. The findings were ambiguous.';
const nameOnly = V.harvest(NAMEONLY, 0, NAMEONLY.length, opts);
check('a word never seen in lower case is still refused as a name',
  !nameOnly.cards.some((c) => /aldana/i.test(c.word)),
  `faces: ${nameOnly.cards.map((c) => c.word).join(' ')}`);
check('and the refusal is still counted as a name',
  nameOnly.stats.rejected.name >= 1, `name: ${nameOnly.stats.rejected.name}`);

// The case the capitalisation heuristic cannot reach. "Donald Trump is trying
// again" gives it a capital fully explained by position, so it must let the
// word through — and "donald" went out on a card from a live article.
const NAMED =
  'Donald met the committee last week. Priya chaired it. The findings were ' +
  'ambiguous, and Aldana said so. Gerrymandering was the substantive charge.';
const named = V.harvest(NAMED, 0, NAMED.length, opts);
const namedWords = named.cards.map((c) => c.word.toLowerCase());
check('a sentence-initial given name is rejected',
  !namedWords.includes('donald') && !namedWords.includes('priya'),
  `got: ${namedWords.join(' ')}`);
check('and the real vocabulary in the same passage survives',
  namedWords.includes('gerrymandering') && namedWords.includes('ambiguous'),
  `got: ${namedWords.join(' ')}`);

// THE ORDERING THAT MAKES THE NAME LIST SAFE. It is consulted only after every
// band has declined the word, so ordinary words that are also names are never
// put to it. Check the sharp end directly: these are all in the names list AND
// in a band, and the band must win.
for (const w of ['mark', 'hope', 'april', 'will', 'rose', 'frank']) {
  check(`"${w}" is a word before it is a name`,
    W.PROPER_NOUNS.has(w) === true && W.bandOf(w) < 5,
    `in names: ${W.PROPER_NOUNS.has(w)}, band: ${W.bandOf(w)}`);
}

// The same sharp end for places and nationalities, and it is sharper, because
// `frank` was one word and these were seven. Every one was band 5 on the day
// the demonym list was written, so listing them without banding them first
// would have deleted `pole`, `jersey`, `swede`, `bass`, `mandarin`, `cardigan`
// and `china` from the product — silently, and with no gesture that recovers
// them. They were banded first, in CM_HOMOGRAPHS and UP_HOMOGRAPHS.
for (const w of ['polish', 'turkey', 'china', 'pole', 'jersey', 'swede',
  'cardigan', 'mandarin', 'bass']) {
  check(`"${w}" is a word before it is a place`,
    W.PROPER_NOUNS.has(w) === true && W.bandOf(w) < 5,
    `in proper nouns: ${W.PROPER_NOUNS.has(w)}, band: ${W.bandOf(w)}`);
}

// THE CASE THE CENSUS CANNOT REACH, taken from a live article. Al Jazeera's
// card for `israeli` carried a HEADLINE as its context sentence — "Israeli
// forces storm West Bank town of Tammun" — where the capital is explained by
// position and by nothing else, so looksLikeName is right to decline and the
// list is the only thing left. Every demonym below is sentence-initial except
// "Germany", which is there to show the census still doing its own job.
const PLACES =
  'Israeli forces entered Tammun at dawn. Palestinians in the town called ' +
  'the incursion unprecedented. Britain and Germany urged restraint. ' +
  'Israelis living nearby were unaffected.';
const places = V.harvest(PLACES, 0, PLACES.length, opts);
const placeWords = places.cards.map((c) => c.word.toLowerCase());
const leakedPlaces = ['israeli', 'israelis', 'palestinians', 'britain',
  'germany'].filter((w) => placeWords.includes(w));
check('a sentence-initial nationality is rejected', leakedPlaces.length === 0,
  `leaked: ${leakedPlaces.join(' ')}`);
check('and the real vocabulary in the same passage survives',
  placeWords.includes('incursion') && placeWords.includes('restraint'),
  `got: ${placeWords.join(' ')}`);

// THE CASE ABOVE IS THE CENSUS BEING RIGHT TO GIVE UP. This one is the census
// giving up where it should not, and the two are checked together because the
// difference between them is the whole rule.
//
// "Donald met the committee" earns its exemption: an English sentence has to
// start somewhere, and nothing chose to put `Donald` at the front. A
// bibliography chooses. `Aitken, A. J.; McArthur, Tom, eds. (1979).` puts the
// surname first BECAUSE it is the surname, which is the strongest evidence in
// the block, and the census was reading it as the weakest. 112 of the article's
// 160 bibliography cards came through this way, measured.
//
// The tell is asserted on its own below before any deck is built, because it
// carries three refusals that a deck-level case would only cover by accident.
const slot = (s) => V.opensAnAuthorSlot(s, 0, s.length);
check('a bare year in the next bracket is an author slot',
  slot('Aitken, A. J.; McArthur, Tom, eds. (1979).'));
check('and so is a lettered one, which is how two works in one year are split',
  slot('Kachru, Braj (2006a). The Handbook of World Englishes.'));
// `[^()]*` again, from the other side. A greedy group runs from the first
// bracket to the LAST one and reads `1979). Languages of Scotland (2nd edn`
// as the year, so a citation with anything bracketed after it stops counting.
check('a later bracket does not spoil the first one',
  slot('Aitken, A. J. (1979). Languages of Scotland (2nd edn).'));
check('an issue number standing in that same position is not a year',
  !slot('Bao, Zhiming. Language Policy . 5 (2): 141– 160.'));
check('nor is a volume number that happens to hold a slash',
  !slot('Studies . 16 (1/2): 83– 84.'));
// `[^()]*` inside BRACKET_GROUP is what makes "next" mean next. Greedy `.*`
// passes this case by running from the bracket before `Irminonic` to the one
// after `1483`, nine hundred characters on, and reading the span as one group —
// which is how the §11 navigation box, 3,737 characters with no stop in it,
// scored as a citation under the rule this replaced.
// Copied off the page rather than invented, and it has to keep BOTH years. The
// first draft ended at `(1483)`, which is outside the range BARE_YEAR admits,
// so the case passed without ever exercising the thing it is named for — found
// by mutation, not by reading. `(1596)` is what makes it discriminate.
const NAVBOX = 'Skirian ? Elbe (Irminonic) Weser-Rhine (Istvaeonic) ' +
  'Catholicon Anglicum (1483) The English Schoole-Master (1596)';
check('a bracket that is not a year refuses the slot even when a year follows',
  !slot(NAVBOX));
check('and ordinary prose opens no slot at all',
  !slot('Turnout fell in the affected districts.'));

// `Annotation` opens a sentence of its own between two citations, which is the
// shape a reference list is full of — `Retrieved 6 April 2015 . Aitken, A. J.
// (1979).` — and the reason the slot test is clipped to its own sentence. Let
// it read on and the next entry's year answers for this sentence's first word.
const CITED =
  'Aitken, A. J.; McArthur, Tom, eds. (1979). Languages of Scotland. ' +
  'Fasold, Ralph (2006). Annotation proved unrelenting. ' +
  'Mufwene, Salikoko (2004). The apparatus was ubiquitous.';
const citedWords = V.harvest(CITED, 0, CITED.length, opts)
  .cards.map((c) => c.word.toLowerCase());
const leakedAuthors = ['aitken', 'fasold', 'mufwene']
  .filter((w) => citedWords.includes(w));
check('a surname in an author slot is rejected', leakedAuthors.length === 0,
  `leaked: ${leakedAuthors.join(' ')}`);
check('and the real vocabulary in the same passage survives',
  citedWords.includes('annotation') && citedWords.includes('ubiquitous'),
  `got: ${citedWords.join(' ')}`);

// THE CONTROL, and it is the more important half. The rule keys on the
// CITATION and not on the position, so the same surnames opening ordinary
// sentences must still come through — that is the third verdict, it is
// deliberate, and narrowing it into "a capital at a sentence start is a name"
// would delete `Turnout` and `Nonetheless` from every deck in the product.
// `Fasold` is absent here for the older reason and not this one: the passage
// puts it mid-sentence, where the census has always called it a name.
const UNCITED =
  'Aitken chaired the committee and Fasold agreed. Mufwene dissented. ' +
  'The annotation was unrelenting and the apparatus ubiquitous.';
const uncitedWords = V.harvest(UNCITED, 0, UNCITED.length, opts)
  .cards.map((c) => c.word.toLowerCase());
check('with no citation around it the same surname is still allowed through',
  uncitedWords.includes('aitken') && uncitedWords.includes('mufwene'),
  `got: ${uncitedWords.join(' ')}`);

// WHY THE SLOT IS COUNTED APART FROM `midCap` AND NOT FOLDED INTO IT. Folding
// is one line shorter and passes every case above, because the name verdict
// reads both counters the same way. The FACE rule does not: it lower-cases a
// word whose capital is positional, and an author slot IS a sentence start.
// So the word to catch it with is one that a lower-case sighting rescues from
// the name verdict and that opens a citation anyway — TWICE, or the surface
// vote ties, keeps the first-seen lower-case form, and the face comes out right
// for a reason that has nothing to do with this rule. Under the fold it is
// `Crystal`.
const HOMONYM = 'The crystal lattice was unrelenting. Crystal, David (2003). ' +
  'Crystal, David (2004). The gloss proved ubiquitous.';
const homonymFaces = V.harvest(HOMONYM, 0, HOMONYM.length, opts)
  .cards.map((c) => c.word);
check('a lower-case sighting keeps the word AND keeps the capital off its face',
  homonymFaces.includes('crystal') && !homonymFaces.includes('Crystal'),
  `faces: ${homonymFaces.join(' ')}`);

// AN IDENTIFIER IS NOT PROSE. Eleven of the article's apparatus cards are
// letter runs inside a DOI — `chol` out of `10.1017/chol9780521264754.006`,
// `hongkong` out of `10.5790/hongkong/9789622099470.003.0004` — and four more
// are the pieces of one permanent-link URL.
const surfacesOf = (s) => V.tokenise(s).map((t) => t.surface);
check('a slash between two words is a coordination and both words survive',
  surfacesOf('the input/output bottleneck').includes('input') &&
  surfacesOf('the input/output bottleneck').includes('output'),
  surfacesOf('the input/output bottleneck').join(' '));
const DOIED = 'doi : 10.5790/hongkong/9789622099470.003.0004 .';
check('a slash carrying a digit is an identifier and its letters are not words',
  !surfacesOf(DOIED).includes('hongkong'), surfacesOf(DOIED).join(' '));
check('a slash carrying a colon is one too',
  surfacesOf('https://en.wikipedia.org/w/index.php').length === 0,
  surfacesOf('https://en.wikipedia.org/w/index.php').join(' '));
check('and an identifier does not reach out of its own run',
  surfacesOf('see doi : 10.5334/labphon.37 and the annotation')
    .includes('annotation'),
  surfacesOf('see doi : 10.5334/labphon.37 and the annotation').join(' '));

// THE SIXTEENTH CARD IS WHY THIS SITS IN THE TOKENISER RATHER THAN BESIDE THE
// OTHER REFUSALS. `Wikipedia` was going out CAPITALISED from a section that
// names it mid-sentence over and over, which is the census's clearest possible
// name verdict — overturned by `en.wikipedia.org` inside a URL, because one
// lower-case sighting vetoes the verdict, exactly as it must when a real
// article uses a real word in lower case. A URL is not an article using a word,
// and no rule reading capitalisation can tell the difference once the tokeniser
// has handed the census a lie.
const LINKED =
  'Wikipedia has grown steadily. The editors of Wikipedia disagree about ' +
  'scope. Retrieved from https://en.wikipedia.org/w/index.php?title=Cavalry ' +
  '. The disagreement was unrelenting.';
const linkedWords = V.harvest(LINKED, 0, LINKED.length, opts)
  .cards.map((c) => c.word.toLowerCase());
const leakedUrl = ['wikipedia', 'https', 'index', 'org', 'php', 'cavalry']
  .filter((w) => linkedWords.includes(w));
check('a lower-case sighting inside a URL no longer overturns a name verdict',
  leakedUrl.length === 0, `leaked: ${leakedUrl.join(' ')}`);
check('and the real vocabulary beside it survives',
  linkedWords.includes('scope') && linkedWords.includes('unrelenting'),
  `got: ${linkedWords.join(' ')}`);

// THE TRAP. Every case above passes on a passage that has quietly stopped
// holding the shape it is named for — a tidying hand that closes `(1979)` into
// `1979`, or shortens the URL past its own colon, leaves the checks sweeping
// nothing and reporting PASS.
check('the five passages still hold the shapes they are named for',
  /, eds\. \(1979\)\./.test(CITED) && /\(2006\)\./.test(CITED) &&
  /Aitken chaired/.test(UNCITED) && !/\(\d/.test(UNCITED) &&
  /https:\/\/en\.wikipedia\.org\//.test(LINKED) &&
  (LINKED.match(/Wikipedia/g) || []).length === 2 &&
  /\(Irminonic\)[\s\S]*\(1596\)/.test(NAVBOX) && /\/hongkong\//.test(DOIED),
  `CITED brackets: ${(CITED.match(/\(\d{4}[a-z]?\)/g) || []).join(' ')}, ` +
  `LINKED Wikipedia: ${(LINKED.match(/Wikipedia/g) || []).length}, ` +
  `NAVBOX brackets: ${(NAVBOX.match(/\([^)]*\)/g) || []).join(' ')}`);

// THE TOKENS NO LIST CAN BE ASKED ABOUT. Six of the sixteen surviving cards
// from the five-article run were hyphenated compounds — `prima-dani` was a pun
// the headline writer invented that morning — and each one was band 5 for the
// one reason that is not evidence of rarity: the lists hold no hyphens, so the
// lookup could not succeed. BAND_WEIGHT then ranked the failure top.
const COMPOUND =
  'The so-called reforms were thin-skinned and media-savvy. Frontier ' +
  'artificial-intelligence models proved unrelenting. The commission ' +
  'conceded the criteria had been applied inconsistently.';
const compound = V.harvest(COMPOUND, 0, COMPOUND.length, opts);
const compoundWords = compound.cards.map((c) => c.word.toLowerCase());
check('no hyphenated token becomes a card',
  !compoundWords.some((w) => w.includes('-')), `leaked: ${compoundWords.join(' ')}`);
check('and the real vocabulary in the same passage survives',
  compoundWords.includes('unrelenting') && compoundWords.includes('inconsistently'),
  `got: ${compoundWords.join(' ')}`);

// The half the newspapers hid. News prose barely contracts, so five articles
// could not show this; a blog, an interview or any quoted speech would have.
// These outranked `conceded` and `assume` in the deck they came from.
const SPOKEN =
  "Don't assume they've conceded. We can't and won't, she'd rather they'd go.";
const spoken = V.harvest(SPOKEN, 0, SPOKEN.length, opts);
const spokenWords = spoken.cards.map((c) => c.word.toLowerCase());
check('no contraction becomes a card',
  !spokenWords.some((w) => /['’]/.test(w)), `leaked: ${spokenWords.join(' ')}`);
check('and the words worth teaching around them survive',
  spokenWords.includes('conceded') && spokenWords.includes('assume'),
  `got: ${spokenWords.join(' ')}`);

// ABSENCE MUST BE VISIBLE. `well-being` is a word a teacher might reasonably
// expect, and it is declined; the count is what turns an honest limit into
// something they can see, so it is asserted rather than assumed.
const WELL = 'Their well-being and self-esteem were unrelenting concerns.';
const well = V.harvest(WELL, 0, WELL.length, opts);
check('a teachable compound is declined too — no exception for the ones we like',
  !well.cards.some((c) => c.word.includes('-')),
  well.cards.map((c) => c.word).join(' '));
eq('and the teacher is told how many were set aside',
  well.stats.rejected.unbandable, 2);

// The possessive is NOT in this class: it is stripped before the lookup, so
// "commission's" is asked about as `commission` and answered properly. Pinned
// because the obvious over-broad fix — declining every token with an
// apostrophe in it — would silently take this with it.
const POSS = "The teachers' scrutiny and the commission's rationale were unrelenting.";
const poss = V.harvest(POSS, 0, POSS.length, opts);
check('a possessive is still graded on its bare word',
  poss.cards.some((c) => c.lemma === 'scrutiny') &&
  poss.cards.some((c) => c.lemma === 'rationale'),
  poss.cards.map((c) => c.lemma).join(' '));
eq('and nothing in that sentence was set aside', poss.stats.rejected.unbandable, 0);

// THE GRADING AND THE FACE ARE DIFFERENT QUESTIONS, and this passage answered
// only the first for five days. `commission` is what the lookup was asked
// about; `commission's` is what the card showed, because the face is the
// surface form and the possessive is part of the surface. The rule the face
// serves is "show the word as the class will meet it, not the stem" — it
// exists so `gerrymandering` is not shown as `gerrymander`, and a possessive
// is not that. It is a grammatical form wearing the vocabulary item's clothes.
check('and no possessive reaches the card face',
  !poss.cards.some((c) => /['’]/.test(c.word)),
  poss.cards.map((c) => c.word).join(' '));

// THE FACE AND THE SENTENCE HAVE TO AGREE ON WHAT THE FACE IS. Now
// the sentence is chosen from the occurrences BEARING the face, so
// stripping the face without widening that match empties the pool for a lemma
// seen only as a possessive — and an empty pool is a card with no sentence at
// all. `auditor` below is that lemma. `commission` is the other shape, seen
// both ways, where the pool has to hold BOTH occurrences and not just the one
// spelled like the face.
//
// `auditor’s` is written with a CURLY apostrophe on purpose: the rule table
// above proves the rule handles one, and this proves the face path does, on
// the character real articles actually use. The fixture's own header calls out
// curly apostrophes for the same reason.
const POSSPAIR =
  'The auditor’s report was filed late in the year, and nobody in the ' +
  'chamber had expected it to arrive at all. ' +
  "The commission's rationale was thin and widely disputed. " +
  'The commission met again in the spring, and the tribunal met with it.';
const possPair = V.harvest(POSSPAIR, 0, POSSPAIR.length, opts);
const faced = (lemma) => possPair.cards.find((c) => c.lemma === lemma);
check('a lemma seen only as a possessive is carded on its bare word',
  !!faced('auditor') && faced('auditor').word === 'auditor',
  faced('auditor') ? faced('auditor').word : 'auditor never reached the deck');
check('and that card still carries a sentence',
  !!faced('auditor') && !!faced('auditor').sentence,
  faced('auditor') ? String(faced('auditor').sentence) : 'no auditor card');
check('a lemma seen both ways is carded once, on the bare word',
  !!faced('commission') && faced('commission').word === 'commission' &&
  faced('commission').count === 2,
  faced('commission')
    ? `${faced('commission').word} x${faced('commission').count}`
    : 'commission never reached the deck');

// THE TRAP HAS TO STAY SET. Both cases above are satisfied by a passage that
// has quietly lost the shape they were written for — an `auditor` that turns
// up bare somewhere, or a `commission` that stops appearing both ways, and
// neither case would say a word. So the passage is asserted, not just its
// deck: one lemma apostrophe-only, one lemma both ways.
const bareAuditor = /auditor\b(?!['’])/.test(POSSPAIR);
check('the passage still holds a possessive-only lemma and a mixed one',
  /auditor’s/.test(POSSPAIR) && !bareAuditor &&
  /commission['’]s/.test(POSSPAIR) && /commission\b(?!['’])/.test(POSSPAIR),
  `auditor bare: ${bareAuditor}, curly: ${/auditor’s/.test(POSSPAIR)}`);

// AN ABBREVIATION IS NOT VOCABULARY, AND THE FULL STOP IS THE ONLY THING THAT
// SAYS SO. `etc.` tokenises as `etc` because a stop is a separator; `etc` is in
// no band; band 5 weighs 3.0. So this is not a card that slipped in at the
// bottom of the deck, it is one of the first the teacher is shown. Measured on
// the article the clause was written from, before the rule was written: 2 such
// cards in 1125 over 11 sections, both `etc`.
const ABBREVS =
  'The syllabus lists idioms, collocations, phrasal verbs, etc. and the ' +
  'moderator said the omission was deliberate.';
const abbrevs = V.harvest(ABBREVS, 0, ABBREVS.length, opts);
check('an abbreviation does not reach the deck as vocabulary',
  !abbrevs.cards.some((c) => c.word.toLowerCase() === 'etc'),
  abbrevs.cards.map((c) => c.word).join(' '));
check('and the words standing next to it still do',
  abbrevs.cards.some((c) => c.word === 'syllabus') &&
  abbrevs.cards.some((c) => c.word === 'collocations'),
  abbrevs.cards.map((c) => c.word).join(' '));
eq('and the refusal is counted, like every other',
  abbrevs.stats.rejected.abbrev, 1);

// THE TOKEN IS STILL EMITTED. Only the CARD is declined, and the difference is
// not cosmetic: every sentence offset, the capitalisation census and the
// sentence-length score are computed from the token stream, so a rule that
// deleted `etc` at the tokeniser would silently move the back of every other
// card in the passage. This case exists to stop a later hand "simplifying" it
// one layer down.
check('the abbreviation is still a token — only the card is declined',
  V.tokenise(ABBREVS, 0, ABBREVS.length).some((t) => t.surface === 'etc'),
  V.tokenise(ABBREVS, 0, ABBREVS.length).map((t) => t.surface).join(' '));

// THE STOP, AND NOT THE LIST ALONE. `wed` is listed because articles write
// "Wed. 14 May", and it is also an ordinary verb in band 5. Across the tree's
// corpora and the article's sections, 660 tokens wear a surface the splitter
// lists and 644 of them are bare words doing a word's job — `no`, `in`, `sat`,
// `sun`. A rule keying on the list alone declines every one of them and leaves
// a worse deck than it found.
const WED =
  'They wed in the spring, and the ceremony was deliberate and sparse.';
const wed = V.harvest(WED, 0, WED.length, opts);
check('a listed abbreviation used as an ordinary word is still a card',
  wed.cards.some((c) => c.word === 'wed'),
  wed.cards.map((c) => c.word).join(' '));

// ...and the converse, which is the larger class by far: an ordinary word that
// happens to close a sentence has a full stop after it too — 55 faces on the
// article against the 2 this rule is for. The stop is a necessary condition and
// nowhere near sufficient.
const ENDSTOP =
  'The reform was unrelenting. Nobody in the chamber disputed it.';
const endStop = V.harvest(ENDSTOP, 0, ENDSTOP.length, opts);
check('a word that merely ends a sentence is not an abbreviation',
  endStop.cards.some((c) => c.word === 'unrelenting'),
  endStop.cards.map((c) => c.word).join(' '));

// ONE BARE USE SETTLES IT. A group whose every occurrence is stop-closed is an
// abbreviation; a group holding one bare use is a word this article also
// abbreviates, and the word wins. That is the capitalisation census's rule in
// another costume — one lower-case sighting outranks any number of capitals —
// and it is the half a careless `some` for `every` would invert.
const MAXBOTH =
  'The estimate gave a max. of forty. The max was reached by noon, and the ' +
  'moderator called the total deliberate.';
const maxBoth = V.harvest(MAXBOTH, 0, MAXBOTH.length, opts);
const maxCard = maxBoth.cards.find((c) => c.word === 'max');
check('a word this passage also abbreviates is still a card',
  !!maxCard, maxBoth.cards.map((c) => c.word).join(' '));
eq('and both sightings are counted', maxCard ? maxCard.count : 0, 2);

// THE TRAP HAS TO STAY SET. Every case above is satisfied by a passage that has
// quietly lost the shape it was written for — an `etc` with no stop after it, a
// `wed` that grew one, a list that stopped holding either — and not one of them
// would say a word. So the passages and the list are asserted, not just the
// decks they build.
check('the passages and the list still hold the shapes these cases need',
  S.ABBREV.has('etc') && /etc\.\s/.test(ABBREVS) &&
  S.ABBREV.has('wed') && !/wed\./.test(WED) &&
  S.ABBREV.has('max') && /max\.\s/.test(MAXBOTH) && /max\b(?!\.)/.test(MAXBOTH),
  `etc listed: ${S.ABBREV.has('etc')}, wed listed: ${S.ABBREV.has('wed')}, ` +
  `max listed: ${S.ABBREV.has('max')}`);

// A CITED SUFFIX, ON A DECK. The tokeniser cases above prove `-est` comes out
// as one token; this proves that being one token is what keeps it off a card,
// which is a different claim and the one the teacher experiences. The passage
// is the article's own sentence, which is where the defect was measured.
//
// NO NEW FILTER RAN. The refusal lands in `unbandable` beside `well-being`,
// and that is the design rather than a side effect — see WORD_RE. So the count
// is asserted too: a fix that dropped the token at the tokeniser would satisfy
// the first case here and silently stop telling the teacher anything.
const SUFFIXCITED =
  'Old English marked degree with the suffix -er marking the comparative, ' +
  'and -est marking the superlative, a pattern the grammarians inherited ' +
  'wholesale.';
const suffixCited = V.harvest(SUFFIXCITED, 0, SUFFIXCITED.length, opts);
check('a cited suffix does not reach the deck as vocabulary',
  !suffixCited.cards.some((c) => c.word.toLowerCase() === 'est'),
  suffixCited.cards.map((c) => c.word).join(' '));
check('and the words standing next to it still do',
  suffixCited.cards.some((c) => c.word === 'superlative') &&
  suffixCited.cards.some((c) => c.word === 'grammarians'),
  suffixCited.cards.map((c) => c.word).join(' '));
eq('and the refusal is counted where the hyphen rule counts them',
  suffixCited.stats.rejected.unbandable, 2);
eq('and no filter written for a word ran on it',
  suffixCited.stats.rejected.abbrev + suffixCited.stats.rejected.phrase +
  suffixCited.stats.rejected.name, 1);

// ONE BARE USE IS UNAFFECTED, and it needs no `every` clause to be — which is
// the difference between this and the abbreviation rule one screen up. The
// citation and the word are now separate TOKENS, so they file under separate
// lemmas: `-less` is declined on its own and every bare `less` in the passage
// cards exactly as it did. The abbreviation rule needs `.every()` because
// `etc` and `etc.` are the same token wearing a stop.
const SUFFIXBOTH =
  'The suffix -tion marks the noun. Every tion in the register was itemised ' +
  'and the moderator called the omission deliberate.';
const suffixBoth = V.harvest(SUFFIXBOTH, 0, SUFFIXBOTH.length, opts);
check('a word this passage also cites as a suffix is still a card',
  suffixBoth.cards.some((c) => c.word === 'tion'),
  suffixBoth.cards.map((c) => c.word).join(' '));

// THE TRAP HAS TO STAY SET. Both passages are satisfied by text that has
// quietly lost the shape they were written for — an `-est` that grew a space
// after its hyphen, a `tion` that lost its bare sighting — and neither would
// say a word.
check('the passages still hold a cited suffix and a bare-plus-cited pair',
  /\s-est\s/.test(SUFFIXCITED) && /\s-er\s/.test(SUFFIXCITED) &&
  /\s-tion\s/.test(SUFFIXBOTH) && /\stion\s/.test(SUFFIXBOTH),
  `cited: ${/\s-est\s/.test(SUFFIXCITED)}, both: ${/\stion\s/.test(SUFFIXBOTH)}`);

// THE COMPASS, ON A DECK, IN THE SENTENCE IT WAS MEASURED IN.
//
// Verbatim from a real export (France, Wikipedia),
// not a plant. It carried `northeast`, `northwest` and `southeast` as three
// separate cards badged ~C1+, out of 27, and every one of them off this one
// sentence about which country is on which side of France.
//
// The band cases above prove the eight entries exist. This proves what the
// entries are FOR, which is a different claim: the deck a teacher opens. It
// also fixes the shape of the refusal — bands 1 and 2 are counted in the
// "already common" line, so the teacher is told three words were set aside and
// why, rather than the deck quietly being three shorter.
const BORDERS =
  'Metropolitan France shares borders with Belgium and Luxembourg to the ' +
  'north, Germany to the northeast, Switzerland to the east, Italy and ' +
  'Monaco to the southeast, Andorra and Spain to the south, and a maritime ' +
  'border with the United Kingdom to the northwest.';
const borders = V.harvest(BORDERS, 0, BORDERS.length, opts);
const borderFaces = borders.cards.map((c) => c.word);
check('no point of the compass reaches the deck',
  !borderFaces.some((w) => /^(north|south)(east|west)$/.test(w)),
  borderFaces.join(' '));
check('and the vocabulary in the same sentence still does',
  borderFaces.includes('maritime') && borderFaces.includes('metropolitan'),
  borderFaces.join(' '));
eq('and the three are counted as common rather than dropped',
  borders.stats.rejected.band1, 12);

// The trap. This passage is satisfied by a sentence that has quietly lost the
// words it was written for, and a sentence naming only cardinal points would
// pass all three cases above while proving nothing.
check('the passage still names three intercardinal points',
  /\bnortheast\b/.test(BORDERS) && /\bsoutheast\b/.test(BORDERS) &&
  /\bnorthwest\b/.test(BORDERS), BORDERS.slice(0, 60));

// THE SHAPE THE CORPORA CANNOT SHOW, and the second time this exact blind spot
// has been caught by mutation rather than by reading. Every abbreviation in
// every corpus here is lower-case and spelled the way the list spells it, so a
// case-sensitive lookup and a lookup keyed on the LEMMA both went green — and
// both are wrong on a page that writes "Pres." or "Sept.", which is what a page
// writes.
//
// SENTENCE-INITIAL, and that is not a detail of taste. The filter runs below
// the name filter now, so a capitalised abbreviation standing mid-sentence is
// taken as a name before it ever arrives here: "meets Wed. and Sat." declines
// nothing at all, and loses nothing, because those two were going out as a name
// and as band 1 anyway. Opening a sentence is what stops the capitalisation
// census reading a capital as a name, so it is the one position in which this
// filter still meets one. The passage this replaces is kept below, as the case
// for exactly that.
//
// Two words, chosen for failing differently under mutation. A case-sensitive
// lookup misses both and they CARD, in the deck where the teacher would see
// them. A lookup keyed on the lemma misses `Pres.` alone — `sept` lemmatises to
// itself, `pres` lemmatises to `pre`, which is on no list.
const STARTCAP =
  'Pres. Lincoln was described as unrelenting. Sept. was the wettest month ' +
  'the registry ever recorded.';
const startCap = V.harvest(STARTCAP, 0, STARTCAP.length, opts);
check('a capitalised abbreviation opening a sentence is declined',
  !startCap.cards.some((c) => ['pres', 'sept'].includes(c.word.toLowerCase())),
  startCap.cards.map((c) => c.word).join(' '));
eq('and both are counted as abbreviations, not as something else',
  startCap.stats.rejected.abbrev, 2);
check('and the passage still yields the words a teacher came for',
  startCap.cards.some((c) => c.word === 'registry') &&
  startCap.cards.some((c) => c.word === 'unrelenting'),
  startCap.cards.map((c) => c.word).join(' '));

// COUNTED ONLY WHERE A CARD WAS ACTUALLY LOST, which is what moving the filter
// to the bottom of the loop bought and the only reason this refusal can be
// spoken aloud. `Inc.` on the article's section 11 was declined here and was
// going out as a name regardless — one firing in four across every corpus in
// the tree announcing a loss that had not happened. Both words below are in
// that position: `Wed.` mid-sentence reads as a name, `Sat.` lemmatises to
// `sit` and is band 1.
const TAKENFIRST = 'The seminar meets Wed. and Sat. and the timetable was ' +
  'described as provisional.';
const takenFirst = V.harvest(TAKENFIRST, 0, TAKENFIRST.length, opts);
eq('a word another filter would have taken is not called an abbreviation',
  takenFirst.stats.rejected.abbrev, 0);
eq('and it is not named to the teacher either',
  takenFirst.stats.abbreviations.length, 0);
check('and it is kept out of the deck all the same',
  !takenFirst.cards.some((c) => ['wed', 'sat'].includes(c.word.toLowerCase())),
  takenFirst.cards.map((c) => c.word).join(' '));

// THE WORDS THEMSELVES, NOT A NUMBER. This is the one refusal the popup names,
// because it is the one whose rule can be wrong in a way a teacher can check by
// looking at their own page — and the stop is part of what they are looking at,
// so it is part of what is shown. Document order, which is the order the words
// were met in, and the surface as met: `Pres.`, never `pre.`.
eq('the declined words are named, in document order, with their stops',
  startCap.stats.abbreviations.join(' '), 'Pres. Sept.');
eq('and one on its own is named the same way',
  abbrevs.stats.abbreviations.join(' '), 'etc.');
eq('and a passage that declines nothing names nothing',
  wed.stats.abbreviations.length, 0);

// FIRST-MET, NOT LAST, and nothing found on a page can tell the two apart: a
// group holding two different surfaces, both stop-closed and both listed, does
// not occur in any corpus swept — 36 selections, and the only mixed groups
// anywhere are `v` and `no`, neither long enough to reach this filter. So the
// passage is built rather than found, for the reason the blocklist ordering is
// checked with a recording stub: the shape is real, the corpora do not hold it.
// Mutation: naming the last sighting instead of the first passes all 364 cases
// without this one.
const MIXEDCASE =
  'Sept. was the wettest month the registry recorded, and the moderator ' +
  'noted that sept. had been wetter still in the unrelenting decade before.';
const mixedCase = V.harvest(MIXEDCASE, 0, MIXEDCASE.length, opts);
eq('a group spelled two ways is named as it was first met',
  mixedCase.stats.abbreviations.join(' '), 'Sept.');
eq('and it is one refusal, not two', mixedCase.stats.rejected.abbrev, 1);

// THE TRAP, for the passage above: sentence-initial is the whole of why it
// works, and a later hand tidying the wording into one sentence would leave
// every case above green and testing nothing.
check('the passage still opens two sentences with a listed abbreviation',
  /^Pres\.\s/.test(STARTCAP) && /\.\s+Sept\.\s/.test(STARTCAP) &&
  S.ABBREV.has('pres') && S.ABBREV.has('sept'),
  `starts: ${/^Pres\.\s/.test(STARTCAP)}, second: ` +
  `${/\.\s+Sept\.\s/.test(STARTCAP)}`);

// AN ABBREVIATION THE LIST DOES NOT HOLD IS STILL A CARD, which is the `etc`
// defect seen from the other end: absence from every band is how this pipeline
// recognises a hard word, and an abbreviation is absent from every band. The
// clause was written about `vol. 3`, and no page in the tree contains that —
// every `Vol.` on the article is capitalised inside a bibliography. The sighted
// instance was somewhere else entirely. §7 writes the part-of-speech gloss
// "Det. Noun Prep. Det. Noun Conj. Det. Adj. Noun" and the deck carded `adj`,
// whose back was the single word "Adj.".
//
// EIGHT ENTRIES ANSWER IT, added to sentence-core's list with the
// cost measured there rather than argued: across 37 corpora they remove 36
// sentence boundaries and all 36 are repairs. That list is shared with the
// segmenter, and these cases are where its second reader's stake in it is
// written down — delete an entry to make a sentence split and something here
// says so.
const VOLPROSE =
  'The editors reprinted the disputed passage in vol. 3 of the collected ' +
  'edition, and the annotation was unrelenting.';
const volProse = V.harvest(VOLPROSE, 0, VOLPROSE.length, opts);
check('an abbreviation the list did not hold is no longer a card',
  !volProse.cards.some((c) => c.word.toLowerCase() === 'vol'),
  volProse.cards.map((c) => c.word).join(' '));
eq('and the teacher is told which word it was',
  volProse.stats.abbreviations.join(' '), 'vol.');

// THE OTHER READER, ON THE SAME ENTRY. Declining a card is half of what listing
// `vol` did. The other half is that this passage stopped being two sentences,
// which is what puts a whole quotation on the back of every card in it instead
// of a fragment beginning at "3 of the collected edition".
eq('and the stop stops cutting the sentence those cards quote',
  S.segment(VOLPROSE).length, 1);

const VOLPLURAL = 'The bequest ran to vols. 4 and 5, which the registry ' +
  'recorded as incomplete.';
const volPlural = V.harvest(VOLPLURAL, 0, VOLPLURAL.length, opts);
eq('and the plural is held too, the way `no` and `nos` are both held',
  volPlural.stats.abbreviations.join(' '), 'vols.');

// ALL SIX WORD CLASSES AT ONCE. A page that abbreviates one of these
// abbreviates the set, so the set is listed and the set is checked here; a case
// naming two of them would let the other four be deleted in silence. `noun` and
// `verb` are spelled out in the same breath and must survive — they are words,
// and the stop is the only thing that ever said otherwise.
const GLOSS =
  'The handbook glosses the example as det. adj. noun prep. det. noun conj. ' +
  'pron. adv. verb, a notation the moderator called unrelenting.';
const gloss = V.harvest(GLOSS, 0, GLOSS.length, opts);
eq('a gloss declines every class it abbreviates, in the order met',
  gloss.stats.abbreviations.join(' '), 'det. adj. prep. conj. pron. adv.');
check('and the two it spells out in full are still cards',
  gloss.cards.some((c) => c.word === 'noun') &&
  gloss.cards.some((c) => c.word === 'verb'),
  gloss.cards.map((c) => c.word).join(' '));

// AND THE SHAPE THE ARTICLE ACTUALLY WROTE, which reaches the same deck down a
// different road. Capitalised and mid-sentence, the classes read as names two
// filters above this one — so nothing is declined HERE, nothing is named to the
// teacher, and the cards are gone all the same. That is the `Inc.` rule working
// rather than failing: this count is cards lost, and these were not lost here.
const GLOSSCAP =
  'The seven classes are exemplified in this sample sentence: Det. Noun ' +
  'Prep. Det. Adj. Noun Verb, which the registry called unrelenting.';
const glossCap = V.harvest(GLOSSCAP, 0, GLOSSCAP.length, opts);
eq('a capitalised gloss is not a refusal this rule may claim',
  glossCap.stats.rejected.abbrev, 0);
check('and none of it reaches the deck regardless',
  !glossCap.cards.some((c) =>
    ['det', 'adj', 'prep', 'noun', 'verb'].includes(c.word.toLowerCase())),
  glossCap.cards.map((c) => c.word).join(' '));

// THE TRAP. A case above dies loudly if any of the eight is deleted, but only
// while the passages still hold the stops. A tidying hand that wrote "volume 3"
// here, or closed the gloss with commas, would leave every case above green and
// checking nothing whatever.
const EIGHT = ['vol', 'vols', 'adj', 'adv', 'conj', 'det', 'pron', 'prep'];
check('the eight are listed and the passages still hold their stops',
  EIGHT.every((w) => S.ABBREV.has(w)) &&
  /\bvol\.\s3\b/.test(VOLPROSE) && /\bvols\.\s4\b/.test(VOLPLURAL) &&
  /det\. adj\. noun prep\./.test(GLOSS) &&
  /conj\. pron\. adv\. verb,/.test(GLOSS),
  EIGHT.filter((w) => !S.ABBREV.has(w)).join(' ') || 'all listed');

// THE SAME LIST, THE OTHER DEFECT, AND IT NEVER TOUCHES A CARD FACE. `pp`, `ed`
// and `eds` went in for the citation apparatus, which the
// segmenter was chopping at every page range: 156 boundaries in the article's
// footnotes and bibliography. Not one of the three can reach a face — two are
// under the grouping loop's three-letter floor and `eds` files under `ed` — so
// what they damage is the BACK, the half of a card that is quoted from the
// article and treated here as evidence. `Woodbridge : Boydell Brewer. pp.` was
// a real card back on the real page, ending on the abbreviation.
const CITE =
  'The essay is reprinted in Woodbridge : Boydell Brewer. pp. 339– 373. ' +
  'doi : 10.1017/9781787440630 . The annotation was unrelenting.';
const cite = V.harvest(CITE, 0, CITE.length, opts);
const citeCard = cite.cards.find((c) => c.word === 'essay');
check('a page range no longer cuts the citation off its own card',
  !!citeCard && /pp\. 339– 373\. doi/.test(citeCard.sentence.text),
  citeCard ? citeCard.sentence.text : 'no card for `essay`');

// THE EDITOR SLOT, SINGULAR AND PLURAL, which is where the bibliography half of
// those 156 lives: seven and six of them, every one `Surname, Forename, ed.`
// followed by the year it introduces.
const EDITOR = 'Lehohla, Pali, ed. (2012). The census was described as ' +
  'unrelenting.';
eq('an editor keeps the year the abbreviation introduces',
  S.segment(EDITOR)[0].text, 'Lehohla, Pali, ed. (2012).');
const EDITORS = 'Aitken, A. J.; McArthur, Tom, eds. (1979). Languages of ' +
  'Scotland . The registry called the arrangement unrelenting.';
eq('and so do two of them, the way `no` and `nos` are both held',
  S.segment(EDITORS)[0].text, 'Aitken, A. J.; McArthur, Tom, eds. (1979).');
check('and none of the three ever becomes a card',
  ![cite, V.harvest(EDITOR, 0, EDITOR.length, opts),
    V.harvest(EDITORS, 0, EDITORS.length, opts)]
    .some((r) => r.cards.some((c) => ['pp', 'ed', 'eds'].includes(c.word))),
  'a face reached the deck');

// WHAT `ed` COSTS, ASSERTED RATHER THAN REGRETTED. The list is matched without
// case, so the name Ed is the same token as the abbreviation and a sentence
// ending on it runs into the next. This case exists to make that a decision on
// the record: if it ever stops being worth paying, this is what turns red.
const EDNAME = 'I spoke to Ed. He said the arrangement was unrelenting.';
eq('the price of `ed` is the name Ed, and it is paid here',
  S.segment(EDNAME).length, 1);

// AND `p` IS ABSENT BECAUSE IT WOULD DO NOTHING. All 244 sightings on the
// article are already answered by the initial-in-a-name rule, which fires long
// before the list is consulted; listing it removes zero boundaries, measured.
// Both halves are checked, because the case is only worth anything if it fails
// when someone adds the entry AND when someone deletes the rule that makes it
// redundant.
const INITIAL = 'The passage is quoted in Daniels, P. T. (2006). The gloss ' +
  'was unrelenting.';
check('`p.` is answered by the initial rule and not by this list',
  !S.ABBREV.has('p') &&
  S.classifyStop(INITIAL, INITIAL.indexOf('P. T.') + 1) === 'no',
  `listed: ${S.ABBREV.has('p')}, verdict: ` +
  `${S.classifyStop(INITIAL, INITIAL.indexOf('P. T.') + 1)}`);

// THE TRAP, for the same reason the eight have one: every case above passes if
// a tidying hand rewrites "pp. 339" as "pages 339" or closes the editor slot
// with a comma.
const APPARATUS = ['pp', 'ed', 'eds'];
check('the three are listed and the passages still hold their stops',
  APPARATUS.every((w) => S.ABBREV.has(w)) && !S.ABBREV.has('p') &&
  /pp\. 339/.test(CITE) && /, ed\. \(2012\)/.test(EDITOR) &&
  /, eds\. \(1979\)/.test(EDITORS) && /to Ed\. He/.test(EDNAME),
  APPARATUS.filter((w) => !S.ABBREV.has(w)).join(' ') || 'all listed');

// THE LIST IS SOFT, AND SOFT HAS TO MEAN SOMETHING. sentence-core supplies both
// the sentences and the abbreviation list, so a page that fails to load it gets
// a worse deck — no context sentences — and must still get a DECK. The
// blocklist is hard for the opposite reason and is checked that way twenty
// lines from here; this is the same question with the answer going the other
// way, and the two are only meaningfully different if both are asserted.
//
// Mutation: `if (!abbrev) return false` inverted to `return true` reads "no
// list means everything is an abbreviation", and every card in the passage
// disappears. Nothing else in the harness runs without a segmenter, so nothing
// else would have said a word.
//
// BROWSER PORT: the soft dependency is gone. vocab-core imports sentence-core
// statically, and a module graph missing a file does not link, so a page with
// no segmenter gets no deck at all. Asserted as what it now is.
const noSegmenter = await graphOf('vocab-core.js', 'sentence-core.js');
check('with no segmenter, vocab-core does not load at all',
  !noSegmenter.ns && /sentence-core\.js/.test(String(noSegmenter.error)),
  noSegmenter.ns ? 'it loaded' : String(noSegmenter.error));
check('and the tree it was restored into still declines abbreviations',
  !V.harvest(ABBREVS, 0, ABBREVS.length, opts).cards
    .some((c) => c.word.toLowerCase() === 'etc'));

// THE BLOCKLIST GOES FIRST, AND THIS IS THE ONLY WAY TO SAY SO. Moving the
// abbreviation filter above the blocklist changes no card in any corpus and no
// count a teacher is shown — the word is declined either way — so the whole
// battery went green on it. What it does change is that a word which is both
// blocked and abbreviated is never put to taboo.js at all, and "every surface
// in the group, every time" is the guarantee that file states in its own words
// and refuses to export a one-argument predicate to protect.
//
// So the assertion is not about the deck: it is that the blocklist was ASKED.
// Stubbing `blocks` to record its arguments is a thing only a harness can do,
// which is the same reason the control below this section builds its input that
// way rather than holding a fixture.
//
// The stub is a wrapper module written into a scratch copy of the graph, so
// the copy's vocab-core imports it as `./taboo.js`. `borderline` is passed
// through rather than omitted: `harvest` requires both predicates.
const recording = await graphOf('vocab-core.js', 'taboo.js', `
import * as real from ${JSON.stringify(pathToFileURL(path.join(CORE, 'taboo.js')).href)};
export const asked = [];
export const { TABOO, SURFACE_ONLY, BORDERLINE, BORDERLINE_SURFACE_ONLY } = real;
export function blocks(surface, lemma) {
  asked.push(surface);
  return real.blocks(surface, lemma);
}
export function borderline(surface, lemma) { return real.borderline(surface, lemma); }
`);
const asked = recording.ns
  ? (recording.ns.harvest(ABBREVS, 0, ABBREVS.length, opts),
    (await import(pathToFileURL(path.join(recording.dir, 'taboo.js')).href)).asked)
  : [];
check('a word declined as an abbreviation went to the blocklist first',
  asked.includes('etc'), recording.ns
    ? `asked about: ${asked.join(' ')}` : String(recording.error));
// The stub lived in a copy; this asks the shipped blocklist one live question,
// on a word taken from the list rather than written here.
const firstBlocked = [...T.TABOO].sort()[0];
check('and the shipped blocklist still answers for itself',
  T.blocks(firstBlocked, V.lemmatise(firstBlocked)),
  `answered ${T.blocks(firstBlocked, V.lemmatise(firstBlocked))} for a listed word`);

// THE MAGNET, AT DECK LEVEL.
//
// Every one of the four target words below appears twice: once in the opening
// sentence, which is the shortest in the passage, and once further down. Under
// shortest-wins-per-word all four took the opening sentence and three quarters
// of the passage was never quoted. The count is asserted rather than the
// assignment, because WHICH alternative each word lands on is a detail of
// document order, while "the deck does not pile onto one sentence" is the
// property worth defending.
//
// Mutation: drop the `used` argument in harvest and this reads 5, not 2.
const MAGNET = [
  'Corruption was thriving, regulation was porous, and unlicensed dealers prospered.',
  'The inquiry found that corruption had reached the licensing office itself, and that several inspectors had been paid to look away for years.',
  'Informal workshops were thriving in the border provinces, turning out replica frames that no registry could ever hope to trace.',
  'Oversight of the trade was porous enough that a shipment could cross three districts without once being counted or questioned.',
  'Existing regulation was drafted for a market that no longer exists, and nobody in the ministry has proposed replacing it.',
  'Unlicensed dealers now outnumber registered ones in every province the auditors visited during the eighteen-month review.'
].join(' ');
const magnet = V.harvest(MAGNET, 0, MAGNET.length, opts);
const opening = magnet.cards.filter(
  (c) => c.sentence && c.sentence.text.startsWith('Corruption was thriving'));
check('no more than two cards pile onto the passage\'s shortest sentence',
  opening.length <= 2,
  `${opening.length} cards on it: ${opening.map((c) => c.word).join(' ')}`);
check('and every card still carries a sentence',
  magnet.cards.every((c) => c.sentence && c.sentence.text),
  magnet.cards.filter((c) => !c.sentence).map((c) => c.word).join(' '));
// Matched on the card FACE, not the lemma: `thriving` lemmatises to `thrive`
// and `unlicensed` to `unlicens`, and a test that hardcodes those is pinned to
// the lemmatiser's current shape rather than to the property being checked.
const COMPETING = ['thriving', 'porous', 'regulation', 'unlicensed'];
const spread = magnet.cards.filter((c) => COMPETING.includes(c.word.toLowerCase()));
eq('all four competing words became cards', spread.length, 4);
check('and they are spread across four different sentences',
  new Set(spread.map((c) => c.sentence.start)).size === 4,
  spread.map((c) => `${c.word}@${c.sentence.start}`).join(' '));

// Deduplication across inflection and case, with the surface form displayed.
const gerry = all.cards.find((c) => /gerrymander/i.test(c.word));
eq('dedupes case variants into one card', gerry.count, 2);
eq('card face is the surface form, not the lemma', gerry.word, 'gerrymandering');

// THE BOUNDARY PROMISE. The highlight starts mid-sentence at "boundaries"; the
// card back must still carry the whole sentence, not the fragment selected.
const from = ARTICLE.indexOf('boundaries');
const to = ARTICLE.indexOf('Turnout') + 20;
const clipped = V.harvest(ARTICLE, from, to, opts);
const entrench = clipped.cards.find((c) => c.word === 'entrench');
check('a mid-sentence highlight still yields a whole sentence',
  !!entrench && entrench.sentence.text.startsWith('The report argues'),
  entrench ? entrench.sentence.text.slice(0, 40) : 'entrench not found');
check('the context sentence ends properly too',
  !!entrench && entrench.sentence.text.endsWith('gerrymandering.'));

// Candidates come only from the selection, even though context does not.
check('words outside the highlight are not candidates',
  !clipped.cards.some((c) => c.word === 'substantiate'));

// Determinism: two runs over one passage must agree, or the teacher cannot
// trust that redoing an export gives the same deck.
const again = V.harvest(ARTICLE, 0, ARTICLE.length, opts);
eq('harvest is deterministic', JSON.stringify(again.cards), JSON.stringify(all.cards));

// Empty and degenerate inputs must not throw.
check('empty text yields no cards', V.harvest('', 0, 0, opts).cards.length === 0);
check('whitespace-only text yields no cards', V.harvest('   \n  ', 0, 6, opts).cards.length === 0);

// ============================================================================
group('phrases');
// ============================================================================
//
// `facto` was card 1 of a real deck, and `due` was on the same
// one. The tokeniser is right in both cases and that is what makes this its own
// group rather than another row in the hyphen table: `de facto` is two words
// with a space between them, and the second one is simply not a word.
//
// THE LIST IS SWEPT BEFORE ANY BEHAVIOUR IS CHECKED, because the expensive
// mistake here is not a wrong decline — it is an entry that declines nothing
// and looks like coverage. `per se` was in the first draft and could never have
// fired: `per` is band 1 and `se` is under the length floor, so no page could
// ever have reached it. This is the check that found it, and it is written to
// find the next one.
const phraseWords = new Set();
for (const p of V.PHRASES) for (const w of p.split(' ')) phraseWords.add(w);

check('every entry is exactly two words',
  V.PHRASES.every((p) => p.split(' ').length === 2),
  V.PHRASES.filter((p) => p.split(' ').length !== 2).join(' | '));
check('every entry is lower case, letters and one space only',
  V.PHRASES.every((p) => /^[a-z]+ [a-z]+$/.test(p)),
  V.PHRASES.filter((p) => !/^[a-z]+ [a-z]+$/.test(p)).join(' | '));
check('no entry appears twice',
  new Set(V.PHRASES).size === V.PHRASES.length);

// The lemma is what the floor and the band lists are applied to, so this is
// asked exactly the way harvest asks it. A word survives to the filter if it
// clears the floor and is not already common.
const reaches = (w) => {
  const l = lemma(w);
  return l.length >= 3 && V.BANDABLE.test(l)
    && W.bandOf(l) !== 1 && W.bandOf(l) !== 2;
};
const deadEntries = V.PHRASES.filter((p) => !p.split(' ').some(reaches));
check('no entry is dead — every phrase can still decline one of its halves',
  deadEntries.length === 0, deadEntries.join(' | '));

// AND THE LIST IS MATCHED ON SURFACES, WHICH IS WHY IT IS WRITTEN IN THEM. The
// silent-e fold shortens a third of these, so a list keyed on lemmas would be a
// list of strings no article contains. This holds the two apart rather than
// trusting the comment that says so.
const folded = [...phraseWords].filter((w) => lemma(w) !== w);
check('several entries do not survive the fold, so lemmas would not match',
  folded.length >= 5, `only ${folded.length}: ${folded.join(' ')}`);

// ---- and now what a page gets ---------------------------------------------
const FACTO = 'The arrangement became the de facto standard, and unrelenting '
  + 'scrutiny followed it.';
const facto = V.harvest(FACTO, 0, FACTO.length, opts);
check('the bound half of a Latin tag does not become a card',
  !facto.cards.some((c) => c.lemma === 'facto'),
  facto.cards.map((c) => c.word).join(' '));
eq('and the teacher is told one was set aside',
  facto.stats.rejected.phrase, 1);
check('while the real vocabulary in the same sentence survives',
  facto.cards.some((c) => c.lemma === 'scrutiny'),
  facto.cards.map((c) => c.word).join(' '));

// THE FOLD AGAIN, ON A PAGE. `vice` lemmatises to `vic`, so this passage is the
// one that fails if the lookup is ever moved onto the lemma.
const VERSA = 'Examiners may scrutinise candidates and vice versa, which is '
  + 'an unrelenting arrangement.';
const versa = V.harvest(VERSA, 0, VERSA.length, opts);
check('a phrase whose halves both fold is still caught',
  !versa.cards.some((c) => c.lemma === 'vic' || c.lemma === 'versa'),
  versa.cards.map((c) => c.word).join(' '));
eq('and both halves are counted', versa.stats.rejected.phrase, 2);

// ---- THE HALF THAT IS A REAL WORD -----------------------------------------
//
// This is the pair the whole design rests on. `due` is on the list, and `due`
// is a perfectly good card from "the essay is due". The group is declined only
// when EVERY occurrence sits inside the phrase, so the first passage loses it
// and the second keeps it. Delete `.every`-equivalent line in harvest and the
// second case fails; delete the entry and the first one does.
const DUEONLY = 'The delay was due to unrelenting weather. A second delay was '
  + 'due to the same unrelenting weather.';
const dueOnly = V.harvest(DUEONLY, 0, DUEONLY.length, opts);
check('a real word used only inside a fixed phrase is declined',
  !dueOnly.cards.some((c) => c.lemma === 'due'),
  dueOnly.cards.map((c) => c.word).join(' '));
eq('and it is counted once, for the group and not the occurrences',
  dueOnly.stats.rejected.phrase, 1);

const DUEBOTH = 'The delay was due to unrelenting weather. The final essay is '
  + 'due on Friday regardless.';
const dueBoth = V.harvest(DUEBOTH, 0, DUEBOTH.length, opts);
check('but one honest sighting anywhere in the passage keeps the card',
  dueBoth.cards.some((c) => c.lemma === 'due'),
  dueBoth.cards.map((c) => c.word).join(' '));
eq('and nothing is reported as set aside', dueBoth.stats.rejected.phrase, 0);

// ---- ADJACENCY IS WRITTEN, NOT ADJACENT IN THE TOKEN LIST -----------------
//
// "due. To" is two tokens next to each other in the stream and is not a phrase.
// Without the whitespace test this passage loses a card to a full stop, which
// is the cheapest possible way for this filter to start costing real words.
const DUESTOP = 'The final essay is due. To begin with, read the unrelenting '
  + 'introduction.';
const dueStop = V.harvest(DUESTOP, 0, DUESTOP.length, opts);
check('a full stop between the two words is not a phrase',
  dueStop.cards.some((c) => c.lemma === 'due'),
  dueStop.cards.map((c) => c.word).join(' '));
eq('and nothing is set aside for it', dueStop.stats.rejected.phrase, 0);

// A comma is the same refusal on a shape that reads much more like the phrase.
const DUECOMMA = 'Whatever is due, to a first approximation, is unrelenting.';
const dueComma = V.harvest(DUECOMMA, 0, DUECOMMA.length, opts);
check('nor is a comma between them',
  dueComma.cards.some((c) => c.lemma === 'due'),
  dueComma.cards.map((c) => c.word).join(' '));

// ---- AND THE COUNT IS NOT THE TEACHER'S ------------------------------------
//
// `filtered` is what the teacher's own settings took, and this is not one of
// them. A phrase is Ascham declining a word on its own account, like a band
// or a name, so it must not move the number the export line prints.
eq('a declined phrase does not count as one of the teacher\'s settings',
  facto.stats.filtered, 0);

// ============================================================================
group('the blocklist');
// ============================================================================

// THIS GATE SYNTHESISES ITS INPUT FROM taboo.js AND HOLDS NO FIXTURE OF ITS
// OWN. Iterating `T.TABOO` means the check covers every entry, follows the list
// as it grows, and puts no second copy of these words anywhere in the
// repository — the one place they are written down stays the one place.
//
// THE CONTROL IS THE POINT AND IT IS BUILT FIRST. "No card carried a blocked
// word" is also what a gate prints when nothing was ever a candidate: an entry
// too short for the length floor, or one `BANDABLE` refuses, passes the filtered
// sweep without the filter doing anything at all. So each entry is harvested
// TWICE — once with `blocks` stubbed false, where it must card, and once for
// real, where it must not. The first run is what makes the second mean
// something, and a shrinking control is the tell that the sweep has gone quiet.
//
// The stub is the reason `harvest` has no opt-out flag: swapping the exported
// predicate is a thing only a harness can do, and it leaves no unfiltered path
// for a call site to reach.
//
// BROWSER PORT: module exports are read-only, so the swap is a scratch graph
// whose taboo.js answers `blocks` with false, and `unfiltered` points
// `harvestNow` at that graph's harvest for the length of `fn`.
const realBlocks = T.blocks;
const unblocked = await graphOf('vocab-core.js', 'taboo.js', `
import * as real from ${JSON.stringify(pathToFileURL(path.join(CORE, 'taboo.js')).href)};
export const { TABOO, SURFACE_ONLY, BORDERLINE, BORDERLINE_SURFACE_ONLY } = real;
export const blocks = () => false;
export function borderline(surface, lemma) { return real.borderline(surface, lemma); }
`);
if (!unblocked.ns) throw unblocked.error;
let harvestNow = V.harvest;
function unfiltered(fn) {
  harvestNow = unblocked.ns.harvest;
  try { return fn(); } finally { harvestNow = V.harvest; }
}

// Ordinary news prose with one slot in it. Lower case and mid-sentence, so the
// capitalisation census reads the word as a word and not as a name.
function carrier(w) {
  return `The witness said the ${w} remark was repeated at the hearing.`;
}
function deck(w) {
  const t = carrier(w);
  return harvestNow(t, 0, t.length, opts);
}

const TABOO_WORDS = [...T.TABOO].sort();

// An empty list would sweep nothing and report PASS on every check below.
check('the blocklist is not empty', TABOO_WORDS.length > 0,
  'taboo.js exported an empty TABOO, so every sweep below is vacuous');

const wouldCard = unfiltered(
  () => TABOO_WORDS.filter((w) => deck(w).cards.some((c) => c.word === w)));
eq('every entry would card if the filter were not there',
  wouldCard.length, TABOO_WORDS.length);
check('and the control names the entries it could not place',
  wouldCard.length === TABOO_WORDS.length,
  `not candidates without the filter: ${
    TABOO_WORDS.filter((w) => !wouldCard.includes(w)).join(' ')}`);

const survived = TABOO_WORDS.filter((w) => deck(w).cards.some((c) => c.word === w));
eq('and none of them survives harvest', survived.join(' '), '');

// The counter, because a filter whose work leaves no trace is a filter nobody
// can hold a number against — and because attribution is the check that the
// refusal happened HERE and not somewhere downstream that would have declined
// the word anyway.
//
// The same carrier with an innocent rare word in the slot is the baseline. An
// absolute assertion cannot do this job: `the`, `said`, `was` and `at` are
// band 1, so `rejected.band1` is 4 either way, and a first draft that read it
// as 0 failed for the wrong reason and would have passed for one too.
const blockedRun = deck(TABOO_WORDS[0]).stats.rejected;
const cleanRun = deck('gerrymandering').stats.rejected;
check('the control word cards in the carrier',
  deck('gerrymandering').cards.some((c) => c.word === 'gerrymandering'));
eq('the refusal is counted as taboo', blockedRun.taboo - cleanRun.taboo, 1);
eq('and no other counter moved',
  JSON.stringify({ ...blockedRun, taboo: 0 }),
  JSON.stringify({ ...cleanRun, taboo: 0 }));
eq('a clean passage counts none',
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).stats.rejected.taboo, 0);

// EVERY INFLECTION, WHICH IS WHERE THIS FILTER ACTUALLY LEAKED. `whore` files
// as `whor`, so a set of the written entries alone lets every -e slur through
// in the plural — that much taboo.js closed when it was written. Running the
// forms through `harvest` rather than reasoning about them found five more it
// had not: `darkies` and `creampies` fold to `darky` and `creampy` under the
// -ies → -y rule, `pakis` folds to itself, and `jizzed`/`jizzing` walk past a
// doubled consonant. Fixed in taboo.js's keys(); this is the check that would
// have caught it, and the check that catches the next one.
//
// SURFACE_ONLY is excluded because its whole point is that the lemma leads
// somewhere innocent. Those entries are checked from the other side below.
const INFLECTED = [];
for (const w of TABOO_WORDS) {
  if (T.SURFACE_ONLY.has(w)) continue;
  for (const suffix of ['s', 'ed', 'ing']) {
    if (!w.endsWith(suffix)) INFLECTED.push(w + suffix);
  }
}
check('there are inflections to test', INFLECTED.length > 0);
const inflectedControl = unfiltered(
  () => INFLECTED.filter((w) => deck(w).cards.some((c) => c.word === w)));
eq('every inflection would card if the filter were not there',
  inflectedControl.length, INFLECTED.length);
eq('and no inflection survives harvest',
  INFLECTED.filter((w) => deck(w).cards.some((c) => c.word === w)).join(' '), '');

// BOTH HALVES OF EVERY SURFACE-ONLY EXEMPTION. The innocent word must still
// pass, or the exemption bought nothing; and the collision that justified it
// must still be real, or the exemption is a hole outliving its excuse.
const lem = (w) => V.lemmatise(w, known, known);
const wrongly = [...T.SURFACE_ONLY.entries()]
  .filter(([, innocent]) => realBlocks(innocent, lem(innocent)));
eq('the word each exemption protects is not blocked',
  wrongly.map(([, i]) => i).join(' '), '');
const stale = [...T.SURFACE_ONLY.entries()]
  .filter(([entry, innocent]) => lem(entry) !== lem(innocent));
eq('and every exemption still has a live collision behind it',
  stale.map(([e]) => e).join(' '), '');
check('there are exemptions to check', T.SURFACE_ONLY.size > 0);
// And the inflections of the protected word, which is the form the loop above
// would have blocked had SURFACE_ONLY not been excluded from it.
const partners = [...new Set(T.SURFACE_ONLY.values())];
eq('nor are the inflections of the word it protects',
  partners.flatMap((w) => [`${w}s`, `${w}d`])
    .filter((w) => realBlocks(w, lem(w))).join(' '), '');

// SUBSTRING MATCHING IS HOW EVERY NAIVE PROFANITY FILTER BECOMES A JOKE, and
// the joke is the cheap part — the expensive part is a teacher losing a word off
// a card and never learning why. These are the words taboo.js names at the top
// as the ones that hold an entry inside them.
const INNOCENT = ['assassin', 'classic', 'cockpit', 'shiitake', 'analysis',
  'scunthorpe', 'therapist', 'grape', 'butter'];
eq('a word that merely contains an entry is not blocked',
  INNOCENT.filter((w) => realBlocks(w, lem(w))).join(' '), '');

// AND THE FILTER MUST NOT BE OPTIONAL AT RUNTIME. A page that loads
// vocab-core.js without taboo.js has to fail loudly: the alternative is a deck
// that looks exactly like a filtered one and is not.
// BROWSER PORT: missing taboo.js now fails at link time, before harvest exists.
const noBlocklist = await graphOf('vocab-core.js', 'taboo.js');
const refused = noBlocklist.ns ? '' : String(noBlocklist.error);
check('vocab-core refuses to load with no blocklist present',
  refused.includes('taboo.js'), `threw ${JSON.stringify(refused)}`);
check('and the tree it was restored into still filters',
  deck(TABOO_WORDS[0]).cards.every((c) => c.word !== TABOO_WORDS[0]));

// ============================================================================
group('what was set aside');
// ============================================================================
//
// The half of the harvest that never became a card, opened on the panel.
// The counts have been on the screen since the note was written;
// what is new is that three of them can be looked inside, and this group holds
// the line between the three that can and the five that cannot.
//
// THE ORDER IS THE PROTECTION AND THAT IS WHAT MAKES IT FRAGILE. The floor, the
// tier and the teacher's own terms are asked before the band, so a word that
// reaches the band branch has been let past every list and is safe to print
// with no guard on it at all. `unbandable` is the exception: it runs FIRST, ten
// lines before the blocklist is consulted, which was harmless for as long as it
// was a count and is the one door a slur can walk out of the moment those words
// are named. The cases below are what stands between that ordering and a later
// hand rearranging it.
const setAside = (text, extra) =>
  V.harvest(text, 0, text.length, { ...opts, ...(extra || {}) }).stats;

const SA = setAside('Dr. Aldana published the findings on the well-being of '
  + 'the state last week, and the report argues that the boundaries were '
  + 'drawn to entrench a durable majority.');

eq('the two bands add up to the one number the teacher is told',
  SA.declined.band1.length + SA.declined.band2.length, SA.rejected.band1);
eq('the names add up to theirs', SA.declined.name.length, SA.rejected.name);
check('and the hyphens never add up to more than theirs',
  SA.declined.unbandable.length <= SA.rejected.unbandable,
  `${SA.declined.unbandable.length} named of ${SA.rejected.unbandable}`);

// THE FIVE THAT HAVE NO KEY, and the absence is the ruling. A later hand adding
// one of these arrays would break this line before it broke anything a teacher
// could see, which is the only order in which it is cheap to find.
for (const silent of ['taboo', 'tier', 'yours', 'phrase', 'abbrev']) {
  check(`the harvest offers no words for: ${silent}`,
    !(silent in SA.declined),
    `declined.${silent} exists, and a caller will print it`);
}
check('the abbreviations are still named, in the one place they always were',
  Array.isArray(SA.abbreviations), 'stats.abbreviations went missing');

eq('what the note says and the list does not open is phrase, tier and yours',
  SA.withheld,
  SA.rejected.phrase + SA.rejected.tier + SA.rejected.yours);

// AND IT MUST BE MEASURED WITH A BLOCKED WORD ACTUALLY IN THE PASSAGE. The
// three cases above ran on text the floor never fired on, so `rejected.taboo`
// was zero in all of them and a version of `withheld` that added it in passed
// every one — found by mutation, not by reading. This is the
// blocklist silence stated as arithmetic: a count of "and 1 more" that moves
// when a slur is in the passage has announced the slur by subtraction.
const BLOCKED = setAside(`The witness repeated the word ${TABOO_WORDS[0]} `
  + 'twice in evidence, and the committee asked her to substantiate it.');
eq('the floor really fired, so the next line is testing something',
  BLOCKED.rejected.taboo, 1);
eq('and the count the list does not open does not move when it does',
  BLOCKED.withheld,
  BLOCKED.rejected.phrase + BLOCKED.rejected.tier + BLOCKED.rejected.yours);
eq('nor is the blocked word named anywhere in the list',
  Object.values(BLOCKED.declined).flat()
    .filter((w) => w.toLowerCase() === TABOO_WORDS[0]).length, 0);

// ---- THE ONE DOOR, SHUT ----------------------------------------------------
//
// A blocked word written with a hyphen. `blocks()` answers FALSE to the
// hyphenated form — the list does not hold it in that shape — which is exactly
// how the word arrives in the unbandable branch instead of the taboo one. The
// guard strips before it asks, and these two cases are the difference.
const hyphenated = TABOO_WORDS[0].slice(0, 2) + '-' + TABOO_WORDS[0].slice(2);
check('the blocklist does not recognise the hyphenated form, which is the risk',
  !T.blocks(hyphenated, hyphenated),
  'blocks() caught it, so this group is no longer testing anything');
const HY = setAside(`The committee described the ${hyphenated} openly in `
  + 'evidence given to the inquiry today.');
eq('a blocked word written with a hyphen is still counted', HY.rejected.unbandable, 1);
eq('and it is not named', HY.declined.unbandable.length, 0);
eq('and the count the list does not open stays silent about it', HY.withheld, 0);

const SA_WELL = setAside('The report described the well-being of the state in '
  + 'plain terms and at some length.');
check('an innocent hyphenated word IS named',
  SA_WELL.declined.unbandable.some((w) => /well-being/i.test(w)),
  SA_WELL.declined.unbandable.join(' '));
eq('the teacher’s own term is not, even hyphenated',
  setAside('The report described the well-being of the state in plain terms '
    + 'and at some length.', { also: ['well-being'] })
    .declined.unbandable.length, 0);

// termsHelp tells the teacher that "protest" also covers "protests",
// "protested" and "protesting". Each form is read in a passage of its own, so
// one form cannot stand in for the rest. "protest" is a common word, so with
// no term set each form goes on to the band and is declined there: that is
// the control, and without it the second case would pass on passages the
// term never had to catch. With the term, each form is the teacher's.
const PROTESTS = {
  protest: 'The miners staged a protest outside the ministry.',
  protests: 'The miners staged protests outside the ministry.',
  protested: 'The miners protested outside the ministry.',
  protesting: 'The miners were protesting outside the ministry.'
};
const reachesBand = (form, s) =>
  s.rejected.yours === 0 && [...s.declined.band1, ...s.declined.band2].includes(form);
const caughtAsYours = (form, s) =>
  s.rejected.yours === 1 && ![...s.declined.band1, ...s.declined.band2].includes(form);
eq('with no term set, each form of protest reaches the band',
  Object.keys(PROTESTS).filter((f) => !reachesBand(f, setAside(PROTESTS[f]))).join(' '), '');
eq('and the term "protest" catches every form first, as termsHelp says',
  Object.keys(PROTESTS).filter((f) => !caughtAsYours(f, setAside(PROTESTS[f], { also: ['protest'] }))).join(' '), '');
// termsHelp: "including when it is off". The off switch subtracts the
// blocklist and nothing else, so the teacher's own term still catches every form.
eq('and it still does with the filter off',
  Object.keys(PROTESTS).filter((f) => !caughtAsYours(f,
    setAside(PROTESTS[f], { also: ['protest'], unfiltered: V.UNFILTERED }))).join(' '), '');

// ---- WHAT THE TEACHER SAW ---------------------------------------------------
//
// Surfaces, not lemmas, and the precedent is the abbreviation list. A teacher
// checking a refusal is checking it against their own page, so a list saying
// `boundary` where the article said `boundaries` would be the first surface in
// this product to answer in the pipeline's own vocabulary.
const PLURAL = setAside('The boundaries were redrawn and the boundaries held.');
const pluralWords = PLURAL.declined.band1.concat(PLURAL.declined.band2);
check('the list prints the plural the article wrote',
  pluralWords.includes('boundaries'), pluralWords.join(' '));
check('and not the singular the lemmatiser reduced it to',
  !pluralWords.includes('boundary'), pluralWords.join(' '));
check('the fold really does move this word, so the pair above is a real test',
  V.lemmatise('boundaries') === 'boundary', V.lemmatise('boundaries'));
check('nothing blank reaches the list',
  pluralWords.every((w) => /\S/.test(w)), JSON.stringify(pluralWords));

// ============================================================================
group('csv');
// ============================================================================

// A strict RFC4180 parser, written HERE so the test does not trust the writer
// it is checking.
function parseCsv(text, sep) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; i++;
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HOSTILE = [
  ['comma', 'A practice critics call gerrymandering, and it spread.'],
  ['quote', 'He said "it is over" and left.'],
  ['newline', 'Line one\nline two.'],
  ['leading hyphen', '-20% growth was the headline.'],
  ['leading at', '@everyone was mentioned.'],
  ['leading equals', '=SUM(A1:A9) appeared in the leak.'],
  ['leading plus', '+44 was the dialling code.'],
  ['accented', 'The café closed.'],
  ['semicolon', 'One; two; three.']
];

const hostileCards = HOSTILE.map(([label, text]) => ({
  word: label.replace(/\s/g, ''), sentence: { text }
}));
const csv = C.build(hostileCards, { title: 'Test, Article "X"', url: 'https://example.org/a' });

check('csv carries a byte order mark', csv.charCodeAt(0) === 0xFEFF);
check('csv declares its separator', csv.includes('#separator:comma'));
check('csv disables html interpretation', csv.includes('#html:false'));

const parsed = parseCsv(csv, ',').filter((r) => !r[0].startsWith('#'));
eq('csv row count', parsed.length, HOSTILE.length);

for (let i = 0; i < HOSTILE.length; i++) {
  const [label, want] = HOSTILE[i];
  // The guard prefix is the one deliberate difference from the source text.
  const got = parsed[i][1].replace(/^'/, '');
  eq(`csv round-trip: ${label}`, got, want);
}

// The guard must fire on exactly the fields that would execute, and no others.
const guarded = HOSTILE.filter((_, i) => parsed[i][1].startsWith("'")).map((h) => h[0]);
eq('formula guard fires on the dangerous leads', guarded.join(','),
  'leading hyphen,leading at,leading equals,leading plus');

// ---- the shape Anki will not misread -------------------------------------
//
// Four columns against the Basic note type, which has two fields, left the
// mapping underdetermined. Anki resolved it by taking column 1 as the front,
// column 2 as TAGS, and dropping the rest: ten notes imported with empty backs
// and the context sentence shredded into 24 tags, one per word. Nothing
// errored. These cases exist so the file can never again offer that choice.
eq('exactly two columns, matching Basic', parsed[0].length, 2);
check('the note type is pinned, not inherited from the last import',
  csv.includes('#notetype:Basic'));
check('columns are named for the fields they map to',
  csv.includes('#columns:Front,Back'));

// Provenance moved from a column to a tag, which is Anki's own mechanism for
// it — searchable, and it survives a merge into an existing deck.
const tagLine = csv.split('\r\n').find((l) => l.startsWith('#tags:'));
check('the deck is tagged with its article', /^#tags:ascham Test-Article-X$/.test(tagLine),
  `got ${JSON.stringify(tagLine)}`);
check('no tag contains a space — Anki splits on whitespace',
  tagLine.slice('#tags:'.length).split(' ').every((t) => t.length > 0));

// A title that reduces to punctuation must still yield a usable tag rather
// than an empty one, which Anki would read as the next tag running on.
const untitled = C.build([{ word: 'w', sentence: { text: 'x y z' } }], { title: '!!!' });
check('an unusable title falls back to a valid tag',
  untitled.includes('#tags:ascham deck'));

// A long headline is cut at a word boundary. "...with-new-execut" reads as a
// corrupted tag rather than a shortened one, and the teacher filtering their
// collection has only that list to go on.
const longTitle = C.build([{ word: 'w', sentence: { text: 'x y z' } }],
  { title: 'Trump again limits US birthright citizenship with new executive orders' });
const longTag = longTitle.split('\r\n')
  .find((l) => l.startsWith('#tags:')).split(' ')[1];
// THE PROPERTY, AND NOT THE NAME OF ONE STUB. This read
// `pop() !== 'execut'` previously, which names the fragment a blunt
// slice would leave at SOME length and not at this one — at 48 the blunt cut
// lands on `wit`, so the clause was true either way and stayed true when the
// word-boundary trim was mutated out from under it. Found by running that
// mutation rather than by reading the line.
//
// What is actually claimed is that the tag stops where a word stops: the full
// slug either IS the tag, or carries on with a hyphen immediately after it.
// That is one expression, it holds at every length, and it fails the moment
// the trim goes.
const endsAtAWord = (full, tag) =>
  full.startsWith(tag) && (full === tag || full[tag.length] === '-');
const FULL_TITLE_SLUG =
  'Trump-again-limits-US-birthright-citizenship-with-new-executive-orders';
check('a long title is cut at a hyphen, not mid-word',
  !/-$/.test(longTag) && longTag.length <= 48
    && endsAtAWord(FULL_TITLE_SLUG, longTag),
  `got ${JSON.stringify(longTag)}`);

// ---- THE TEACHER'S OWN TAG -------------------------------------------------
//
// The shaping came out of `tagFor` and became `slugTag` on
// the day a second caller wanted it, so these are cases on the one function
// rather than on two callers that happen to agree this week.
eq('a space becomes a hyphen, because Anki splits tags on whitespace',
  C.slugTag('Year 9 Autumn'), 'Year-9-Autumn');
eq('and a run of punctuation becomes one hyphen, not several',
  C.slugTag('Year 9 — Autumn'), 'Year-9-Autumn');
// The web app: Anki matches tags without regard
// to case, so each letter keeps the case it was typed in.
eq('the tag keeps its case', C.slugTag('YEAR9 Autumn'), 'YEAR9-Autumn');
eq('leading and trailing punctuation is dropped rather than hyphenated',
  C.slugTag('...Year 9...'), 'Year-9');
// THE FALLBACK IS NOT IN HERE, and that is the whole reason this is its own
// function. An unusable title means the literal `deck`; an unusable teacher tag
// means the article's own slug. One return value cannot serve both, so it
// returns neither and each caller says what its own emptiness means.
eq('a tag that reduces to nothing comes back empty', C.slugTag('!!!'), '');
eq('and so does an absent one', C.slugTag(undefined), '');
// IDEMPOTENT, which is load-bearing here and not tidiness. settings-core stores
// what the teacher typed and this file shapes it on the way out, so a value
// that has already been through here — every tag a teacher saves twice — goes
// through a second time. A rule that ate a hyphen on the second pass would
// shorten the same tag a little more every time they pressed Save.
eq('shaping an already-shaped tag changes nothing',
  C.slugTag(C.slugTag('Year 9 — Autumn')), 'Year-9-Autumn');

// The web app: letters in any script are kept,
// and a space still never is.
eq('an accented letter stays in the tag', C.slugTag('Café owners'), 'Café-owners');
eq('and so does a diaeresis', C.slugTag('Naïve art'), 'Naïve-art');
eq('a capital İ survives intact, one letter and not an i with a dot',
  C.slugTag('İstanbul'), 'İstanbul');
eq('a decomposed accent is composed first, not cut off',
  C.slugTag('Cafe\u0301'), 'Café');
check('no Unicode tag holds whitespace',
  ['Café owners', 'naïve\u00a0art', 'İstanbul\u2003notes', 'a\u3000b']
    .every((t) => !/\s/u.test(C.slugTag(t))));
eq('a long accented title is cut at a hyphen, counted in letters',
  C.slugTag('é'.repeat(30) + ' ' + 'é'.repeat(30)), 'é'.repeat(30));
eq('a deck titled with accents is tagged with them',
  C.build([{ word: 'w', sentence: { text: 'x y z' } }], { title: 'Café, naïve, İstanbul' }, {})
    .split('\r\n').find((l) => l.startsWith('#tags:')),
  '#tags:ascham Café-naïve-İstanbul');

const ONE_CARD = [{ word: 'w', sentence: { text: 'x y z' } }];
const REPORT = { title: 'A Report on Boundaries' };
const tagsOf = (csv) => csv.split('\r\n').find((l) => l.startsWith('#tags:'));

const tagged = C.build(ONE_CARD, REPORT, { html: true, tag: 'Year 9 Autumn' });
eq('a paid deck carries the tag the teacher typed, shaped',
  tagsOf(tagged), '#tags:ascham Year-9-Autumn');
// `ascham` is the provenance tag and is not the one on offer. A deck that
// could drop it is a deck that cannot be found again by the one name that is
// true of every deck this product has ever written.
check('and ascham is still first — it is not the tag being replaced',
  tagsOf(tagged).startsWith('#tags:ascham '));
check('no tag on a paid deck contains a space either',
  tagsOf(tagged).slice('#tags:'.length).split(' ').every((t) => t.length > 0));

// The floor for THIS field is the article's slug, not the literal `deck`: a
// teacher whose tag shapes away to nothing gets what they would have had if
// they had never typed in the box.
check('a tag that shapes away falls back to the article, not to deck',
  tagsOf(C.build(ONE_CARD, REPORT, { html: true, tag: '!!!' }))
    === '#tags:ascham A-Report-on-Boundaries');

// `String({})` is `[object Object]`, which shapes to a perfectly plausible
// `object-object` and would tag a teacher's collection with it. The type is
// tested rather than coerced, in the file that writes the line, because a
// caller is not obliged to have come through settings-core to get here.
for (const bad of [{}, 42, ['year-9'], null, true]) {
  check(`a ${JSON.stringify(bad)} tag is refused rather than stringified`,
    tagsOf(C.build(ONE_CARD, REPORT, { html: true, tag: bad }))
      === '#tags:ascham A-Report-on-Boundaries');
}

// Cut at a word boundary by the same rule the headline is, so a teacher
// scanning their tag list never meets a stub that reads as corrupted. Asserted
// with `endsAtAWord` and not against a named fragment, for the reason written
// over that helper.
const FULL_TYPED_SLUG =
  'Year-9-Autumn-Term-Reading-Comprehension-And-Vocabulary-Development';
const typedTag = tagsOf(C.build(ONE_CARD, REPORT, { html: true,
  tag: 'Year 9 Autumn Term Reading Comprehension And Vocabulary Development' }))
  .split(' ')[1];
check('a long typed tag is cut at a hyphen, not mid-word',
  !/-$/.test(typedTag) && typedTag.length <= 48
    && endsAtAWord(FULL_TYPED_SLUG, typedTag),
  `got ${JSON.stringify(typedTag)}`);

// guardFormula and escapeField in isolation.
eq('guard leaves ordinary text alone', C.guardFormula('hello'), 'hello');
eq('guard prefixes an equals', C.guardFormula('=1+1'), "'=1+1");
eq('guard handles null', C.guardFormula(null), '');
eq('escape doubles internal quotes', C.escapeField('a"b', ','), '"a""b"');
eq('escape quotes a padded field', C.escapeField(' a ', ','), '" a "');
eq('escape leaves a plain field bare', C.escapeField('abc', ','), 'abc');

// Tab separator, because a teacher whose text is full of commas may prefer it.
const tsv = C.build([{ word: 'w', sentence: { text: 'a, b, c' } }], {}, { separator: 'tab' });
check('tab separator declared', tsv.includes('#separator:tab'));
check('tab file leaves commas unquoted', tsv.includes('a, b, c'));

// Filenames.
eq('filename from a title', C.filename({ title: 'Test, Article "X"' }, Date.parse('2026-08-07')),
  'ascham_test-article-x_2026-08-07.csv');
eq('filename falls back when a title reduces to punctuation',
  C.filename({ title: '— — —' }, Date.parse('2026-08-07')),
  'ascham_deck_2026-08-07.csv');
eq('filename falls back with no source',
  C.filename(null, Date.parse('2026-08-07')), 'ascham_deck_2026-08-07.csv');

// ============================================================================
// The whole pipeline, once, as a caller would drive it.
// ============================================================================
group('end to end');

const e2e = C.build(
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards,
  { title: 'A Report on Boundaries', url: 'https://example.org/report' }
);
const e2eRows = parseCsv(e2e, ',').filter((r) => !r[0].startsWith('#'));
check('end to end produces rows', e2eRows.length > 0);
check('every row has two columns', e2eRows.every((r) => r.length === 2));
check('every row carries a non-empty word', e2eRows.every((r) => r[0].length > 0));
check('every row carries a sentence', e2eRows.every((r) => r[1].length > 0));

// ---- what a field is, read back --------------------------------------------
// Previously the Back field WAS the sentence, so every check below could
// hold the column against the article directly. The Pro path wraps the target
// word in `<b>` and escapes BOTH columns to suit, which makes each a RENDERING
// of the text rather than the text. So everything that wants the teacher's
// words asks `plain` for them first, on the front as well as the back — a face
// is escaped under `#html:true` too, and a check that unwrapped one column and
// not the other would be comparing two different alphabets.
//
// IT IS A SECOND IMPLEMENTATION ON PURPOSE, exactly like the RFC4180 parser
// above. Running csv-core's own escaper backwards would make this gate agree
// with the builder by construction, and a gate that cannot disagree with the
// code it checks is decoration.
//
// ORDER IS THE WHOLE OF IT, AND IT IS TAGS FIRST. An article discussing markup
// can legitimately contain the characters `<b>`, which the builder escapes to
// `&lt;b&gt;`. Unescape first and that becomes a tag this then strips — the
// article's own words silently deleted by the reader, and a card back that
// passes a verbatim check only because both sides lost the same text.
// Stripping first cannot make that mistake: a real tag was never escaped.
// `&amp;` comes last for the same reason in miniature.
//
// Free-tier output holds no tags and no entities, so this is the identity
// function on everything shipped today. It is written before the path that
// needs it, and the cases below are what prove it changed nothing.
// WHAT THE CARD SAYS, WITH HOW IT IS WRITTEN TAKEN OFF. Every invariant about
// the sentence — verbatim against the article, the face inside it, the
// terminator — is about the card's TEXT, and the paid renderings put markup
// through it. This is the one function that makes the three decks comparable,
// which is why the cloze deletion is stripped here rather than in a second
// reader beside it: the gates promise 4 rests on then hold the cloze deck by
// inheritance instead of being rewritten to know about it.
//
// The two brace entities are undone AFTER the marks come off and BEFORE
// `&amp;`, which is the same ordering rule the other three obey. A sentence
// that genuinely contained `&#123;` reaches the field as `&amp;#123;`, and
// only the `&amp;` pass may touch it — the brace pass looks for an `&`
// followed directly by `#123;` and finds none there.
const plain = (field) => field
  .replace(/<\/?b>/g, '')
  .replace(/\{\{c1::/g, '')
  .replace(/\}\}/g, '')
  .replace(/&#123;/g, '{')
  .replace(/&#125;/g, '}')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

check('every sentence ends in a terminator',
  e2eRows.every((r) => /[.!?][)"”’]?$/.test(plain(r[1]))),
  e2eRows.map((r) => plain(r[1]).slice(-12)).join(' | '));

// ---- the authenticity promise, as a gate -----------------------------------
// The point of the card is that its back is the sentence the class actually
// read, not a dictionary example. Until this ran,
// nothing in 299 cases asserted it: the checks above prove a sentence is
// present, non-empty and terminated, all of which a fabricated string passes.
//
// Read off the CSV rather than off `cards`, because the CSV is what the
// teacher receives — this covers the escaping and the formula guard too, so a
// mangled quote or a stripped leading character fails here rather than in a
// classroom. The comparison is against the source text the harvest was given.
const notInArticle = e2eRows.filter((r) => !ARTICLE.includes(plain(r[1])));
check('every sentence on a card back occurs verbatim in the article',
  notInArticle.length === 0,
  notInArticle.map((r) => `${r[0]}: ${plain(r[1])}`).join(' | '));

// And the front, per the rule that the word displayed is the one that
// appeared in the text: deduplication happens on the lemma, so this is the
// check that a lemma never reaches the card face in place of the word read.
//
// IT READS THE PLAIN BACK, AND THAT IS NOT TIDINESS. Held against the raw
// column, a face could be satisfied by text the article never contained — the
// `b` of a `<b>` tag, or the `amp` of an escaped ampersand — so the one check
// standing between a lemma and the card face would start accepting the
// markup's own letters as evidence. It weakens without failing, which is the
// hazard item 6 was told to watch for and is already live under item 5.
const facesOutsideTheirSentence = (rows) =>
  rows.filter((r) =>
    !plain(r[1]).toLowerCase().includes(plain(r[0]).toLowerCase()));

const wordNotInSentence = facesOutsideTheirSentence(e2eRows);
check('every word on a card face occurs in its own sentence',
  wordNotInSentence.length === 0,
  wordNotInSentence.map((r) => `${r[0]}: ${r[1]}`).join(' | '));

// ---- the same invariant, over a passage built to break it ------------------
// The check above passed while the defect was live, because ARTICLE holds no
// lemma group whose two surfaces sit in DIFFERENTLY RANKED sentences — and
// that, not the invariant, is what was missing. Found on a real
// article: 1 of 29 cards, against 0 of 74 across the four decks before it.
//
// The two choices were never tied together. Occurrences group by lemma, so
// `transitioned` and `transition` share one group; the face takes the
// commonest surface, which at one each ties and keeps the earlier;
// `chooseSentence` then ranks every sentence in the group and takes the
// shorter, later one — which holds the other surface and not the face.
//
// The passage below is the found case with the two sentences given lengths
// that make the ranking bite: the face's own sentence is the longer of the
// two, so novelty and length both argue for the sentence that does not hold
// it. Written as its own passage, per the note above ARTICLE's PAST_TENSE.
const SURFACES =
  'The country transitioned slowly over the following decade, and the ' +
  'process was watched closely by observers who had predicted otherwise. ' +
  'Several military interventions interfered with the transition.';

const surfaceRows = parseCsv(
  C.build(V.harvest(SURFACES, 0, SURFACES.length, opts).cards,
    { title: 'Two Surfaces', url: 'https://example.org/surfaces' }),
  ',').filter((r) => !r[0].startsWith('#'));
const surfaceStrays = facesOutsideTheirSentence(surfaceRows);
check('a face and its sentence come from the same occurrence',
  surfaceStrays.length === 0,
  surfaceStrays.map((r) => `${r[0]}: ${r[1]}`).join(' | '));

// THE TRAP HAS TO STAY SET, and asserting the outcome does not assert that.
// A passage that quietly stops holding two surfaces, or stops making the rival
// sentence the more attractive one, leaves the case above sweeping nothing and
// reporting PASS — which is the one failure a green line cannot show. Both
// were mutations here, and both went unnoticed until this case existed.
//
// So the SHAPE is what is checked. The face is the inflected surface, which on
// a one-each tie is the earlier one — the vote's documented rule, and nothing
// held it to that before. Its sentence is the LONGER of the two, which is the
// whole point: the shorter sentence is what the ranking prefers, what the
// defect took, and it still has to be sitting there holding the other surface.
const trap = surfaceRows.find((r) => /^transitioned$/i.test(r[0]));
const rival = 'Several military interventions interfered with the transition.';
check('the planted passage still sets its trap',
  !!trap && SURFACES.includes(rival) && V.wordCount(trap[1]) > V.wordCount(rival),
  trap ? `face ${trap[0]} on ${V.wordCount(trap[1])} words, rival ${V.wordCount(rival)}`
    : `no inflected face among: ${surfaceRows.map((r) => r[0]).join(' ')}`);

// ============================================================================
// THE PRO DECK — the same cards, rendered with the target word marked
//
// The tier is a FEATURE and not a quota, so the thing these
// cases have to establish is not that Pro gets more cards — it gets exactly
// the same ones — but that the marking is put where the word actually is, and
// that nothing the free tier promises is spent to do it.
// ============================================================================
group('pro deck');

const proDeck = C.build(
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards,
  { title: 'A Report on Boundaries', url: 'https://example.org/report' },
  { html: true }
);
const proRows = parseCsv(proDeck, ',').filter((r) => !r[0].startsWith('#'));

check('the free deck declares #html:false', e2e.includes('#html:false'));
check('the pro deck declares #html:true', proDeck.includes('#html:true'));

// THE TIER CHANGES THE RENDERING AND NOT THE DECK. This is the whole free-tier
// promise in one line: same cards, same order, same words, same sentences.
// Read through `plain`, so it is comparing what the two decks SAY rather than
// how they are written.
const asPlain = (rows) => rows.map((r) => `${plain(r[0])} ${plain(r[1])}`);
eq('pro changes how the deck is written, never what is on it',
  asPlain(proRows).join('\n'), asPlain(e2eRows).join('\n'));

// The two invariants promise 4 rests on, re-run over the marked deck. They are
// not inherited from the block above: the field they read is a different
// string, and `plain` is the only thing making them comparable.
const proNotInArticle = proRows.filter((r) => !ARTICLE.includes(plain(r[1])));
check('every marked sentence still occurs verbatim in the article',
  proNotInArticle.length === 0,
  proNotInArticle.map((r) => `${r[0]}: ${r[1]}`).join(' | '));

const proStrays = facesOutsideTheirSentence(proRows);
check('every marked face still occurs in its own sentence',
  proStrays.length === 0, proStrays.map((r) => `${r[0]}: ${r[1]}`).join(' | '));

// ---- the mark is on the right word, which is the point of the offset -------
// Everything above would pass with the tags wrapped around the wrong word, or
// around nothing. This reads what is INSIDE the mark and holds it to the card
// face — the check the "never by string replace" clause was written for.
const marked = (field) => {
  const m = /<b>([^<]*)<\/b>/.exec(field);
  return m ? m[1] : null;
};
const misMarked = proRows.filter((r) => {
  const inside = marked(r[1]);
  return inside === null
    || plain(inside).toLowerCase() !== plain(r[0]).toLowerCase();
});
check('the marked text is the card face, on every card',
  misMarked.length === 0,
  misMarked.map((r) => `${r[0]}: ${marked(r[1])}`).join(' | '));

check('exactly one mark per card',
  proRows.every((r) => (r[1].match(/<b>/g) || []).length === 1
    && (r[1].match(/<\/b>/g) || []).length === 1),
  proRows.filter((r) => (r[1].match(/<b>/g) || []).length !== 1)
    .map((r) => r[1]).join(' | '));

check('nothing is marked on the free deck',
  e2eRows.every((r) => !/<b>/.test(r[1]) && !/&(amp|lt|gt);/.test(r[1])));

// ---- the escaping, which is the entire risk in this item -------------------
// One card, built by hand, carrying all three characters that must not reach
// Anki raw. The target sits AFTER them, so a builder that escaped the whole
// string and then indexed into it would open its mark inside an entity — the
// failure the three-piece cut exists to make impossible.
const AMPERSAND = 'Trade & tariffs rose, and the ministry issued a rebuttal.';
const ampRow = parseCsv(C.build(
  [{ word: 'rebuttal',
    sentence: { text: AMPERSAND },
    target: { at: AMPERSAND.indexOf('rebuttal'), length: 8 } }],
  {}, { html: true }), ',').filter((r) => !r[0].startsWith('#'))[0];
check('an ampersand in the sentence is escaped',
  ampRow[1].includes('Trade &amp; tariffs'), ampRow[1]);
check('the mark still lands on the word after it',
  marked(ampRow[1]) === 'rebuttal', ampRow[1]);
eq('and the sentence reads back exactly', plain(ampRow[1]), AMPERSAND);

const ANGLED = 'The paper used <b> to mean bold, which readers found "odd".';
const angledRow = parseCsv(C.build(
  [{ word: 'readers',
    sentence: { text: ANGLED },
    target: { at: ANGLED.indexOf('readers'), length: 7 } }],
  {}, { html: true }), ',').filter((r) => !r[0].startsWith('#'))[0];
check('an angle bracket in the sentence is escaped',
  angledRow[1].includes('&lt;b&gt;'), angledRow[1]);
eq('an article that writes about markup reads back unharmed',
  plain(angledRow[1]), ANGLED);
check('a quote is left alone, being text content and not an attribute',
  angledRow[1].includes('"odd"'), angledRow[1]);

// ---- the two placements the clause named -----------------------------------
const TWICE = 'The tariff was raised, and the tariff was later withdrawn.';
const twiceRow = parseCsv(C.build(
  [{ word: 'tariff',
    sentence: { text: TWICE },
    target: { at: TWICE.indexOf('tariff'), length: 6 } }],
  {}, { html: true }), ',').filter((r) => !r[0].startsWith('#'))[0];
check('a word appearing twice is marked once, at the offset given',
  twiceRow[1]
    === 'The <b>tariff</b> was raised, and the tariff was later withdrawn.',
  twiceRow[1]);

const SENTENCE_START = 'Tariffs were raised again in the third quarter.';
const initialRow = parseCsv(C.build(
  [{ word: 'Tariffs', sentence: { text: SENTENCE_START },
    target: { at: 0, length: 7 } }],
  {}, { html: true }), ',').filter((r) => !r[0].startsWith('#'))[0];
check('a sentence-initial target marks from character zero',
  initialRow[1].startsWith('<b>Tariffs</b> were'), initialRow[1]);

// ---- and what it does when the offset cannot be trusted ---------------------
// The offset crosses a file boundary, so the case that matters is the one
// where it is wrong. Marking the wrong span silently is worse than not marking
// at all, and "worse" here means a card that teaches the wrong word.
const markedWith = (target) => parseCsv(C.build(
  [{ word: 'quarter', sentence: { text: SENTENCE_START }, target }],
  {}, { html: true }), ',').filter((r) => !r[0].startsWith('#'))[0][1];
check('an offset past the end of the sentence marks nothing',
  markedWith({ at: 40, length: 20 }) === SENTENCE_START,
  markedWith({ at: 40, length: 20 }));
check('a negative offset marks nothing',
  markedWith({ at: -1, length: 7 }) === SENTENCE_START,
  markedWith({ at: -1, length: 7 }));
check('a zero-length target marks nothing',
  markedWith({ at: 3, length: 0 }) === SENTENCE_START,
  markedWith({ at: 3, length: 0 }));
check('a card with no target renders unmarked',
  markedWith(null) === SENTENCE_START);

// WHICH of two identical occurrences gets the mark, driven through `harvest`
// rather than through a hand-built target. `targetIn` re-derives the choice
// `chooseSentence` made instead of being told it, on the argument that equal
// keys do not beat the incumbent — so the first occurrence inside the winning
// sentence is the one that won. That argument was written in a comment and
// held by nothing: reversing the scan stayed green through every case above,
// because both occurrences are the same word and the mark still lands on the
// face. Only the POSITION separates them, so the position is what is checked.
const DOUBLED =
  'Ministers said the tariff would rise, and the tariff would then be ' +
  'reviewed by an independent panel appointed for the purpose.';
const doubledCard = V.harvest(DOUBLED, 0, DOUBLED.length, opts).cards
  .find((c) => c.word === 'tariff');
const doubledRow = parseCsv(C.build([doubledCard], {}, { html: true }), ',')
  .filter((r) => !r[0].startsWith('#'))[0];
check('the passage still holds the face twice in one sentence',
  !!doubledCard && DOUBLED.split('tariff').length - 1 === 2
    && doubledCard.sentence.text.split('tariff').length - 1 === 2,
  doubledCard ? doubledCard.sentence.text : 'no tariff card');
check('of two identical occurrences the mark takes the first',
  !!doubledRow && doubledRow[1].startsWith(
    'Ministers said the <b>tariff</b> would rise, and the tariff'),
  doubledRow ? doubledRow[1] : 'no row');

// The possessive is off the face, so it must be outside the mark — the same
// disagreement between front and back closed twice before, arriving this
// time through the markup.
const OWNED = 'The auditor\'s report was published in full that afternoon.';
const ownedCards = V.harvest(OWNED, 0, OWNED.length, opts).cards;
const auditor = ownedCards.find((c) => c.word === 'auditor');
const ownedRow = parseCsv(C.build([auditor], {}, { html: true }), ',')
  .filter((r) => !r[0].startsWith('#'))[0];
check('the possessive stays outside the mark',
  !!auditor && ownedRow[1].includes("<b>auditor</b>'s"),
  auditor ? ownedRow[1]
    : `no auditor card among ${ownedCards.map((c) => c.word)}`);

// The formula guard runs on what reaches the cell, so it has to still fire
// once the HTML work has been done to the field ahead of it.
const proGuarded = C.build(
  [{ word: 'w', sentence: { text: '=cmd()|calc' }, target: null }],
  {}, { html: true });
check('the formula guard still fires under #html:true',
  proGuarded.includes("'=cmd()|calc"), proGuarded.split('\r\n').pop());

// ============================================================================
// THE CLOZE DECK — the same cards again, with the word cut out of the sentence
//
// The third rendering of one harvest, and the
// cases below are the pro deck's cases asked of a different pair of tags plus
// the four things a deletion can do that a bold cannot: swallow the rest of
// the sentence, be forged by the article, disappear entirely, and take the
// columns in the other order.
//
// WHAT IS NOT RE-ASSERTED HERE is anything about which word was chosen or
// which sentence it came from. That is `harvest`'s work, it is held by the
// blocks above, and repeating it against a second rendering would grow the
// count without growing the coverage.
// ============================================================================
group('cloze deck');

const CLOZE_SOURCE =
  { title: 'A Report on Boundaries', url: 'https://example.org/report' };
const clozeDeck = C.build(
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards,
  CLOZE_SOURCE, { html: true, cloze: true });
const clozeRows = parseCsv(clozeDeck, ',').filter((r) => !r[0].startsWith('#'));

// ---- what the file tells Anki it is ----------------------------------------
// The note type and the column list are derived from one flag, so the pair
// that could disagree is checked as a pair. Anki's Cloze note type has exactly
// these two fields, in this order, and the four-column afternoon is what a
// mismatch between a column count and a field count costs.
check('the cloze deck pins the Cloze note type',
  clozeDeck.includes('#notetype:Cloze'), clozeDeck.split('\r\n')[2]);
check('and names Cloze’s own two fields',
  clozeDeck.includes('#columns:Text,Back Extra'),
  clozeDeck.split('\r\n')[3]);
check('the basic pro deck is untouched by any of it',
  proDeck.includes('#notetype:Basic')
    && proDeck.includes('#columns:Front,Back')
    && !proDeck.includes('{{c1::'), proDeck.split('\r\n')[2]);

// ---- THE FLAG CANNOT REACH THE FREE DECK -----------------------------------
// `cloze` is ANDed with `html` in build(), so this is not a test of a caller's
// good manners: it is the same shape as effective() asking the licence before
// it asks the store, and it is the case that would catch someone "simplifying"
// the conjunction away. A free deck carrying a deletion would be the paid
// rendering given away, and — worse — a free deck that stopped being byte for
// byte what it has always been.
const clozeWithoutHtml = C.build(
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards, CLOZE_SOURCE,
  { cloze: true });
check('cloze alone does not switch the deck out of the free format',
  clozeWithoutHtml.includes('#html:false')
    && clozeWithoutHtml.includes('#notetype:Basic')
    && clozeWithoutHtml.includes('#columns:Front,Back'),
  clozeWithoutHtml.split('\r\n').slice(0, 4).join(' | '));
check('and puts no deletion anywhere in it',
  !clozeWithoutHtml.includes('{{c1::') && !clozeWithoutHtml.includes('}}'),
  clozeWithoutHtml.split('\r\n')[5]);
// BYTE FOR BYTE against the free deck built at the top of this file, which is
// the strongest form the free-tier promise takes anywhere in this harness: not
// "no deletion appeared" but "the file is the same file".
eq('the free deck is the same file with or without the flag',
  clozeWithoutHtml, e2e);

// ---- AND NEITHER CAN THE TAG -----------------------------------------------
// The tag is ANDed with `html` for ONE of cloze's two reasons
// and not both: a deletion is markup and could not have been written on the
// free path anyway, whereas nothing technical stands between a tag and a free
// deck. The guarantee above is the entire reason, which makes this the case
// that would catch a reader "simplifying" the conjunction away after noticing,
// correctly, that a tag is not markup.
const tagWithoutHtml = C.build(
  V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards, CLOZE_SOURCE,
  { tag: 'year-9-autumn' });
check('a tag alone does not reach a free deck',
  !tagWithoutHtml.includes('year-9-autumn'),
  tagWithoutHtml.split('\r\n')[4]);
eq('and that deck too is the file it has always been', tagWithoutHtml, e2e);

// BOTH PAID FLAGS AT ONCE, because they are two separate conjunctions and the
// two cases above prove each one alone. A caller holding everything except the
// licence answer gets the free deck entire.
eq('every paid flag together still builds the free deck byte for byte',
  C.build(V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards, CLOZE_SOURCE,
    { cloze: true, tag: 'year-9-autumn' }), e2e);

// ---- the same cards, in the other order ------------------------------------
// The tier changes the rendering and never the deck, which for cloze means
// this AND the column swap: Cloze reads its first field as the one carrying
// the deletion, so the sentence leads and the word follows. Read through
// `plain` and put back into the free deck's order, the two files say the same
// thing card for card.
const asPlainCloze = (rows) => rows.map((r) => `${plain(r[1])} ${plain(r[0])}`);
eq('cloze changes how the deck is written, never what is on it',
  asPlainCloze(clozeRows).join('\n'), asPlain(e2eRows).join('\n'));

// Promise 4's two invariants, inherited rather than rewritten — see the note
// over `plain`. The field they read is a third string, and stripping the
// deletion is the only thing that makes it comparable to the other two.
const clozeNotInArticle =
  clozeRows.filter((r) => !ARTICLE.includes(plain(r[0])));
check('every clozed sentence still occurs verbatim in the article',
  clozeNotInArticle.length === 0,
  clozeNotInArticle.map((r) => `${r[1]}: ${r[0]}`).join(' | '));

const clozeStrays = clozeRows.filter((r) =>
  !plain(r[0]).toLowerCase().includes(plain(r[1]).toLowerCase()));
check('every clozed face still occurs in its own sentence',
  clozeStrays.length === 0,
  clozeStrays.map((r) => `${r[1]}: ${r[0]}`).join(' | '));

// ---- the deletion is on the right word, which is the point of the offset ----
const deleted = (field) => {
  const m = /\{\{c1::([\s\S]*?)\}\}/.exec(field);
  return m ? m[1] : null;
};
const misDeleted = clozeRows.filter((r) => {
  const inside = deleted(r[0]);
  return inside === null
    || plain(inside).toLowerCase() !== plain(r[1]).toLowerCase();
});
check('the deleted text is the card face, on every card',
  misDeleted.length === 0,
  misDeleted.map((r) => `${r[1]}: ${deleted(r[0])}`).join(' | '));

// EXACTLY ONE, AND COUNTED ON BOTH HALVES. A second `{{c1::` makes a second
// card from the same sentence; a second `}}` closes the deletion early and
// spills the rest of the sentence onto the front. Counting only the opener
// would miss the half that the brace escaping exists for.
check('exactly one deletion per card, opened and closed once',
  clozeRows.every((r) => (r[0].match(/\{\{c1::/g) || []).length === 1
    && (r[0].match(/\}\}/g) || []).length === 1),
  clozeRows.filter((r) => (r[0].match(/\}\}/g) || []).length !== 1)
    .map((r) => r[0]).join(' | '));

check('the word rides along in Back Extra',
  clozeRows.every((r) => r[1] && !r[1].includes('{{')),
  clozeRows.map((r) => r[1]).join(' | '));

// ---- the escaping, over the same three hazards the bold met ----------------
const clozeOf = (text, target, word) => parseCsv(C.build(
  [{ word: word || 'x', sentence: { text }, target }],
  {}, { html: true, cloze: true }), ',')
  .filter((r) => !r[0].startsWith('#'))[0][0];

const ampCloze = clozeOf(AMPERSAND,
  { at: AMPERSAND.indexOf('rebuttal'), length: 8 }, 'rebuttal');
check('an ampersand in a clozed sentence is escaped',
  ampCloze.includes('Trade &amp; tariffs'), ampCloze);
eq('and the sentence reads back exactly', plain(ampCloze), AMPERSAND);
eq('with the deletion on the word after it', deleted(ampCloze), 'rebuttal');

const angledCloze = clozeOf(ANGLED,
  { at: ANGLED.indexOf('readers'), length: 7 }, 'readers');
check('an angle bracket in a clozed sentence is escaped',
  angledCloze.includes('&lt;b&gt;'), angledCloze);
check('and a quote is still left alone',
  angledCloze.includes('"odd"'), angledCloze);
eq('an article about markup reads back unharmed',
  plain(angledCloze), ANGLED);

// ---- THE HAZARD THAT IS THIS RENDERING'S ALONE -----------------------------
// A page that writes Anki's own syntax into its prose. Under the bold this is
// four harmless characters; under a deletion it is a forged one, and the
// stray `}}` in it closes OURS early — which is why both braces are escaped
// and not only the opener.
//
// Rare and not impossible: zero of 112 cards across the three fixtures carry a
// brace at all, measured, which is the measurement that decided
// this gets escaping rather than a warning.
const FORGED = 'The manual says {{c1::this}} is a deletion, and }} closes it.';
const forgedCloze = clozeOf(FORGED,
  { at: FORGED.indexOf('deletion'), length: 8 }, 'deletion');
check('a forged deletion in the article is disarmed',
  !forgedCloze.includes('{{c1::this'), forgedCloze);
check('and so is a stray closer that would end ours early',
  (forgedCloze.match(/\}\}/g) || []).length === 1, forgedCloze);
eq('exactly one deletion survives, and it is the real one',
  deleted(forgedCloze), 'deletion');
eq('and the sentence still reads back character for character',
  plain(forgedCloze), FORGED);

// ---- the two placements, again ---------------------------------------------
const twiceCloze = clozeOf(TWICE,
  { at: TWICE.indexOf('tariff'), length: 6 }, 'tariff');
eq('a word appearing twice is deleted once, at the offset given', twiceCloze,
  'The {{c1::tariff}} was raised, and the tariff was later withdrawn.');

const initialCloze = clozeOf(SENTENCE_START, { at: 0, length: 7 }, 'Tariffs');
check('a sentence-initial target deletes from character zero',
  initialCloze.startsWith('{{c1::Tariffs}} were'), initialCloze);

// ---- and what it does when the offset cannot be trusted ---------------------
// HERE THE TWO RENDERINGS PART COMPANY, and the reason is in csv-core.js: an
// unmarked bold is a good card missing its emphasis, whereas a cloze note with
// no deletion generates NO CARD and says nothing about it. So the sentence
// itself becomes the deletion — a visibly poor card in place of an invisibly
// absent one.
const clozeWith = (target) => clozeOf(SENTENCE_START, target, 'quarter');
const WHOLE = `{{c1::${SENTENCE_START}}}`;
eq('an offset past the end of the sentence deletes the whole of it',
  clozeWith({ at: 40, length: 20 }), WHOLE);
eq('a negative offset deletes the whole of it', clozeWith({ at: -1, length: 7 }),
  WHOLE);
eq('a zero-length target deletes the whole of it',
  clozeWith({ at: 3, length: 0 }), WHOLE);
eq('and a card with no target at all does the same', clozeWith(null), WHOLE);
check('which is still one deletion, and still a card',
  (WHOLE.match(/\{\{c1::/g) || []).length === 1
    && deleted(clozeWith(null)) === SENTENCE_START);

// An empty sentence is the one place the fallback declines: `{{c1::}}` is a
// deletion of nothing, which claims to be a card and is not.
eq('an empty sentence gets an empty field and not an empty deletion',
  clozeOf('', null, 'w'), '');

// ---- the formula guard, which this rendering moves the ground under --------
//
// THE FIRST VERSION OF THIS CASE WAS WRONG, and it is worth the paragraph.
// It was written as the pro deck's guard case with `cloze: true` added — a
// sentence of `=cmd()|calc` and no target — and it failed. Correctly: the
// fallback wraps the whole sentence, so the field now begins with `{`, and `{`
// is not one of the four characters a spreadsheet evaluates. The guard did not
// fire because there was nothing left to guard.
//
// So the case had been asserting the guard's OUTPUT where it should have been
// asserting the guard's JOB, and under cloze those come apart on exactly one
// input. Both halves are now checked, and neither is checked by restating
// DANGEROUS_LEAD here: the shipped predicate is asked, which is the only
// reading that cannot drift from the one that ships.
const DANGEROUS = '-20% was the fall the ministry issued a rebuttal about.';
const dangerRow = C.build(
  [{ word: 'rebuttal', sentence: { text: DANGEROUS },
    target: { at: DANGEROUS.indexOf('rebuttal'), length: 8 } }],
  {}, { html: true, cloze: true }).split('\r\n')[5];
check('a sentence that leads with a formula character is still guarded',
  dangerRow.startsWith("'-20% was the fall"), dangerRow);
check('and the deletion is where it was asked for',
  deleted(dangerRow) === 'rebuttal', dangerRow);

const wrapped = clozeOf('=cmd()|calc', null, 'w');
eq('the fallback wraps the danger rather than escaping it',
  wrapped, '{{c1::=cmd()|calc}}');
check('and the guard, asked, finds nothing a spreadsheet would evaluate',
  C.guardFormula(wrapped) === wrapped, C.guardFormula(wrapped));

// ============================================================================
// THE MIXED DECK — a card that disagrees with the deck it is in
//
// Added after the first hour a real teacher spent in the paid tier.
// Until today the note type was a property of the deck, so a teacher who wanted
// most cards plain and three of them gapped had exactly one move: import as
// Cloze and change the note type in Anki afterwards. That move destroys the
// notes — `{{c1::word}}` is markup to a Cloze note and literal text to a Basic
// one, and a converted note keeps its braces in the field.
//
// THE RISK THIS GROUP HOLDS IS NOT THE NEW SHAPE. It is that the new shape
// leaks into decks nobody asked to change. A free deck is byte for byte what it
// was at 0.1.0 and this file says so in four places; a paid deck whose teacher
// never touched the control has asked for nothing either. So the first cases
// here are regression locks written as literal bytes, and the mixed form is
// only reached by a deck that cannot be described without it.
// ============================================================================
group('mixed deck');

const noFeed = (csv) => csv.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '');
const headLine = (csv, key) => noFeed(csv).find((l) => l.startsWith(key));
const cardRows = (csv) => noFeed(csv).filter((l) => !l.startsWith('#'));

const MIXABLE = [
  { word: 'resilient', band: 5, target: { at: 16, length: 9 },
    sentence: { text: 'The city proved resilient after the flood.' } },
  { word: 'mitigate', band: 5, target: { at: 17, length: 8 },
    sentence: { text: 'Planners hope to mitigate future damage.' } }
];
// A copy of the deck with one card's mind changed, made per case so no case can
// leave a `cloze` field behind on a fixture the next one reads.
const asking = (i, want) => MIXABLE.map((c, n) =>
  (n === i ? Object.assign({}, c, { cloze: want }) : Object.assign({}, c)));

// ---- the regression locks, as literal bytes --------------------------------
// Not "still contains #notetype:Basic" — the whole row, because the defect this
// guards against is a stray column appearing in a deck that did not ask, and a
// containment test passes straight through one.
eq('a paid deck nobody overruled writes the Basic rows it wrote yesterday',
  cardRows(C.build(MIXABLE, REPORT, { html: true })).join(' // '),
  'resilient,The city proved <b>resilient</b> after the flood. // '
  + 'mitigate,Planners hope to <b>mitigate</b> future damage.');

eq('and the Cloze rows, when the deck default is the one being kept',
  cardRows(C.build(MIXABLE, REPORT, { html: true, cloze: true })).join(' // '),
  'The city proved {{c1::resilient}} after the flood.,resilient // '
  + 'Planners hope to {{c1::mitigate}} future damage.,mitigate');

check('an untouched deck still pins one note type in the header',
  headLine(C.build(MIXABLE, REPORT, { html: true }), '#notetype') === '#notetype:Basic'
  && headLine(C.build(MIXABLE, REPORT, { html: true, cloze: true }), '#notetype')
     === '#notetype:Cloze',
  headLine(C.build(MIXABLE, REPORT, { html: true, cloze: true }), '#notetype'));

check('and still names its columns, because in one mind there is a name to give',
  headLine(C.build(MIXABLE, REPORT, { html: true }), '#columns') === '#columns:Front,Back',
  headLine(C.build(MIXABLE, REPORT, { html: true }), '#columns'));

// ---- the mixed header ------------------------------------------------------
const mixedUp = C.build(asking(1, true), REPORT, { html: true });
const mixedDown = C.build(asking(0, false), REPORT, { html: true, cloze: true });

eq('one card disagreeing moves the deck to a note type column',
  headLine(mixedUp, '#notetype'), '#notetype column:1');

check('reached from either direction — a cloze deck with one plain card too',
  headLine(mixedDown, '#notetype') === '#notetype column:1', headLine(mixedDown, '#notetype'));

check('and the column names come off, because none of them is true of both rows',
  headLine(mixedUp, '#columns') === undefined, String(headLine(mixedUp, '#columns')));

check('the directives Anki reads before it are untouched',
  headLine(mixedUp, '#separator') === '#separator:comma'
  && headLine(mixedUp, '#html') === '#html:true'
  && headLine(mixedUp, '#tags').startsWith('#tags:ascham '),
  noFeed(mixedUp).filter((l) => l.startsWith('#')).join(' | '));

// ---- the mixed rows --------------------------------------------------------
eq('each row names its own type, and the cards keep their order',
  cardRows(mixedUp).join(' // '),
  'Basic,resilient,The city proved <b>resilient</b> after the flood. // '
  + 'Cloze,Planners hope to {{c1::mitigate}} future damage.,mitigate');

check('a type column adds a cell and never a row',
  cardRows(mixedUp).length === MIXABLE.length
  && cardRows(mixedUp).every((r) => r.split(',').length === 3)
  && cardRows(C.build(MIXABLE, REPORT, { html: true }))
       .every((r) => r.split(',').length === 2),
  cardRows(mixedUp).map((r) => r.split(',').length).join(','));

check('nothing but the two names ever reaches that cell',
  cardRows(mixedUp).concat(cardRows(mixedDown))
    .every((r) => r.split(',')[0] === 'Basic' || r.split(',')[0] === 'Cloze'),
  cardRows(mixedUp).concat(cardRows(mixedDown)).map((r) => r.split(',')[0]).join(','));

check('the Basic row carries the bold and no deletion, in the same file',
  /<b>resilient<\/b>/.test(cardRows(mixedUp)[0]) && !/\{\{c1::/.test(cardRows(mixedUp)[0]),
  cardRows(mixedUp)[0]);

check('and the Cloze row carries the deletion and no bold, in the same file',
  /\{\{c1::mitigate\}\}/.test(cardRows(mixedUp)[1]) && !/<b>/.test(cardRows(mixedUp)[1]),
  cardRows(mixedUp)[1]);

// ---- homogeneity is read off the cards, not off the deck's opinion ----------
// A deck whose default is Basic and whose every card asked for Cloze is not
// mixed, and writing a type column into it would be carrying a question nobody
// is still asking.
check('every card overruling the same way pins rather than mixes',
  headLine(C.build(MIXABLE.map((c) => Object.assign({}, c, { cloze: true })),
    REPORT, { html: true }), '#notetype') === '#notetype:Cloze',
  headLine(C.build(MIXABLE.map((c) => Object.assign({}, c, { cloze: true })),
    REPORT, { html: true }), '#notetype'));

check('an empty deck keeps the note type it was going to pin',
  headLine(C.build([], REPORT, { html: true, cloze: true }), '#notetype') === '#notetype:Cloze',
  headLine(C.build([], REPORT, { html: true, cloze: true }), '#notetype'));

// ---- THE GUARANTEE, ASKED AGAIN FROM THE NEW DIRECTION ----------------------
// `cloze` has always been anded with `html` so that no argument to build() puts
// a deletion in a free deck. `card.cloze` is a second door into the same room
// and it is tested as one — not because the code looks wrong, but because the
// old case cannot see the new door.
const freeAsking = C.build(MIXABLE.map((c) => Object.assign({}, c, { cloze: true })), REPORT, {});
check('a free deck refuses a card asking for cloze, and does not go mixed either',
  headLine(freeAsking, '#notetype') === '#notetype:Basic'
  && headLine(freeAsking, '#html') === '#html:false'
  && !/\{\{c1::/.test(freeAsking) && !/<b>/.test(freeAsking),
  cardRows(freeAsking).join(' // '));

// ---- three states, and the third one is anything at all ---------------------
// `=== true` and `=== false` are the only two answers; everything else means
// THIS CARD DID NOT ASK. A truthiness test here would let a `1`, a `'no'` or a
// stray object decide a teacher's note type, which is the failure the deck-level
// flag was written `=== true` to avoid in the first place.
const notAnAnswer = ['yes', 1, 0, null, undefined, {}, ''];
check('a card whose cloze field is not a boolean follows the deck instead',
  notAnAnswer.every((v) => headLine(C.build(
    MIXABLE.map((c) => Object.assign({}, c, { cloze: v })), REPORT,
    { html: true }), '#notetype') === '#notetype:Basic'),
  notAnAnswer.map((v) => String(v) + '=' + headLine(C.build(
    MIXABLE.map((c) => Object.assign({}, c, { cloze: v })), REPORT,
    { html: true }), '#notetype')).join(' | '));

check('and follows it the other way too, rather than defaulting to plain',
  notAnAnswer.every((v) => headLine(C.build(
    MIXABLE.map((c) => Object.assign({}, c, { cloze: v })), REPORT,
    { html: true, cloze: true }), '#notetype') === '#notetype:Cloze'),
  notAnAnswer.map(String).join(','));

// ============================================================================
// THE COUNT ON THE DECK — what the settings took out, written into the file
//
// The code shipped alongside the Pro path with
// no case of any kind behind it. The panel that says what was set aside is
// closed by the time anybody opens the deck, so the number is carried in the
// file the teacher keeps.
//
// THE WHOLE RISK IS IN ONE WORD OF THE CLAUSE: it is NOT A CARD. Promise 4's
// gate reads cards off the built CSV and asks each one for the sentence it came
// from; a line arriving there as a row would arrive carrying no sentence at
// all, and promise 4 would fail on a line that is not part
// of the product. The clause said to keep it clear of that gate rather than
// teach the gate the difference. This group is where that is held.
// ============================================================================
group('the count on the deck');

// ---- what the number counts, and what it does not ---------------------------
//
// It answers "what did MY settings do", so it counts the two refusals a teacher
// configures and none of the pipeline's own. A count that moved when the band
// lists declined a word would answer a different question in the same words —
// and a teacher who configured two terms, reading that thirty-one words were
// set aside by their settings, would be right to distrust the whole file.
//
// THE BLOCKLIST FLOOR IS A THIRD REFUSAL AND IS NOT IN IT, by ruling.
// It is on for everybody and nobody sets it, so counting it against
// the teacher's settings was the defect in the paragraph above arriving one
// door along. The cases below assert the refusal and the silence in the SAME
// run, because `filtered` reading 0 is also what a passage with nothing to
// refuse reads, and a case that cannot tell those apart is not a case.
const plainRun = V.harvest(ARTICLE, 0, ARTICLE.length, opts).stats;
eq('a passage nobody configured against counts nothing', plainRun.filtered, 0);
check('and the pipeline declined plenty in the same run',
  plainRun.rejected.band1 > 0 && plainRun.rejected.name > 0,
  JSON.stringify(plainRun.rejected));

// The two that do move it, one at a time and over the same carrier, so what
// changed between two runs is the setting and nothing else.
const countOf = (word, extra) => {
  const t = carrier(word);
  return V.harvest(t, 0, t.length, { ...opts, ...extra }).stats.filtered;
};
const statsOf = (word, extra) => {
  const t = carrier(word);
  return V.harvest(t, 0, t.length, { ...opts, ...extra }).stats;
};

// THE FLOOR TAKES THE WORD AND THE NUMBER SAYS NOTHING — the ruling
// in one run, and both halves are needed to state it.
const floorRun = statsOf(TABOO_WORDS[0]);
eq('the free floor still refuses the word', floorRun.rejected.taboo, 1);
eq('and the teacher\'s count does not move for it', floorRun.filtered, 0);
eq('and the same carrier with an innocent word refuses nothing',
  statsOf('gerrymandering').rejected.taboo, 0);
eq('a teacher\'s own term moves it',
  countOf('gerrymandering', { also: ['gerrymandering'] }), 1);

// The young-learner tier, taken from taboo.js's own list rather than from a
// fixture — the discipline the blocklist group runs on, so this follows the
// list as it grows and puts no second copy of these words in the repository.
const borderWord = [...T.BORDERLINE].sort()
  .find((w) => !T.blocks(w, lem(w)) && deck(w).cards.some((c) => c.word === w));
check('the borderline list holds a word that cards at the standard tier',
  Boolean(borderWord),
  'nothing on BORDERLINE is a candidate here, so the tier cases are vacuous');
eq('the young-learner tier moves it', countOf(borderWord, { strict: true }), 1);
eq('and the same word at the standard tier does not', countOf(borderWord), 0);

// ONE NUMBER OUT OF TWO COUNTERS OF THREE, summed in the file that knows what
// they mean rather than in the file that prints it. The line says how many and
// never why: the tier's refusals ARE the borderline words, so "2 set aside as
// offensive" in a deck about the Second World War is the blocklist ruling
// broken by a different door even with the floor out of the sum, and a file
// e-mailed to thirty students is the last place to start breaking it.
const three = `The witness said the ${TABOO_WORDS[0]} remark was repeated `
  + `at the hearing, and the ${borderWord} report named gerrymandering.`;
const threeRun = V.harvest(three, 0, three.length,
  { ...opts, strict: true, also: ['gerrymandering'] }).stats;
eq('three words go out of the deck and the teacher is told about two',
  threeRun.filtered, 2);
// The three counters against the one number, so a later hand adding a counter
// back into the sum has to come through this line to do it.
eq('and the third is the floor, refused and uncounted',
  [threeRun.rejected.taboo, threeRun.rejected.tier, threeRun.rejected.yours]
    .join(' '), '1 1 1');
// AND THE CONTROL. Three counters reading 1 is also what this prints when one
// of the three words was never a candidate in this passage and something else
// was refused in its place.
check('and all three would have carded with nothing configured',
  unfiltered(() => {
    const got = harvestNow(three, 0, three.length, opts)
      .cards.map((c) => c.word);
    return [TABOO_WORDS[0], borderWord, 'gerrymandering']
      .every((w) => got.includes(w));
  }), 'one of the three was never a candidate in this passage');

// ---- the line itself --------------------------------------------------------
const CARD = [{ word: 'tariff', sentence: { text: 'The tariff was raised.' } }];
const built = (filtered, more) =>
  C.build(CARD, { title: 'A Test' }, { filtered, ...more });
// The directives are `#key:value` with no space after the hash; the sentence
// has one. That is what tells the two apart here, and it is the same thing that
// tells them apart in a reader.
//
// AND THE BYTE ORDER MARK COMES OFF FIRST. It sits in front of `#separator`,
// so a sweep for leading-# lines that does not strip it finds four directives
// where there are five — which is what this helper did on its first run, and
// what any reader scanning this file's own header for directives would do.
// Anki strips the mark; the parser above strips it; this now strips it too.
const hashLines = (csv) => csv.replace(/^﻿/, '').split('\r\n')
  .filter((l) => l.startsWith('#'));
const countLine = (csv) => hashLines(csv).filter((l) => l.startsWith('# '));

eq('no count, no line', countLine(built(undefined)).length, 0);
// Zero prints nothing, because a line announcing that a filter did nothing is a
// line every deck carries and nobody reads.
eq('a count of nothing prints nothing', countLine(built(0)).length, 0);
eq('one word reads as one word', countLine(built(1))[0],
  '# 1 word was set aside by your Ascham settings and is not in this deck');
eq('and more than one reads as more', countLine(built(3))[0],
  '# 3 words were set aside by your Ascham settings and are not in '
  + 'this deck');

// A POSITIVE INTEGER OR NOTHING — not a truthiness test and not a cast. Every
// value below is one a caller could plausibly be holding: a string off a form,
// a NaN out of arithmetic on an undefined, an object it had to hand. None of
// them may reach the file. `# undefined words were set aside` is a deck a
// teacher cannot explain and a support mail nobody can answer.
const JUNK = [
  ['a string', '3'], ['a fraction', 3.5], ['a NaN', NaN],
  ['a negative', -1], ['a boolean', true], ['an object', {}],
  ['an array', [3]], ['an infinity', Infinity], ['a null', null],
  ['an empty string', ''], ['exponential notation', '1e3'],
];
for (const [label, junk] of JUNK) {
  eq(`${label} prints no line`, countLine(built(junk)).length, 0);
}

// LAST OF THE # LINES, DELIBERATELY: a reader that stops scanning for
// directives at the first line it does not recognise has already read every
// directive Anki actually reads.
const withCount = built(4);
eq('the count is the last of the hash lines',
  hashLines(withCount).pop(), countLine(withCount)[0]);
eq('and every directive sits above it', hashLines(withCount).length, 6);

// Anki's directives are `#key:value`, so a sentence with a colon in it is a
// sentence that can be mistaken for one.
check('the line carries no colon', !countLine(withCount)[0].includes(':'));

// And no separator, in any of the three this file offers, so a reader that
// takes it as data gets ONE CELL rather than a ragged row.
for (const name of Object.keys(C.SEPARATORS)) {
  const line = countLine(
    C.build(CARD, {}, { filtered: 4, separator: name }))[0];
  check(`the line holds no ${name}`, !line.includes(C.SEPARATORS[name]), line);
}
eq('so a reader that takes it as data gets one cell',
  parseCsv(withCount, ',').find((r) => r[0].startsWith('# ')).length, 1);

// ---- and it is not a card ---------------------------------------------------
//
// THE CLAUSE'S OWN WORDING: keep it clear of promise 4's gate, which reads
// cards and would have to be taught the difference. It was never taught, and
// the reason is that the five directives above already forced every reading of
// a built deck in this file to drop leading-# rows. The line arrives at a
// filter that was already standing there — the cheapest way to add a line to a
// file four gates read, and the only one that puts nothing at risk.
const SOURCE =
  { title: 'A Report on Boundaries', url: 'https://example.org/r' };
const e2eCards = V.harvest(ARTICLE, 0, ARTICLE.length, opts).cards;
const deckNoCount = C.build(e2eCards, SOURCE, { html: true });
const deckCounted = C.build(e2eCards, SOURCE, { html: true, filtered: 4 });
const rowsOf = (csv) => parseCsv(csv, ',').filter((r) => !r[0].startsWith('#'));
eq('the deck a teacher receives is the same deck, card for card',
  JSON.stringify(rowsOf(deckCounted)), JSON.stringify(rowsOf(deckNoCount)));
// AND THE CONTROL, because the case above passes just as well against a build
// that never wrote the line at all. Read WITHOUT the filter, the counted deck
// has exactly one row the other does not — so what is asserted above is that a
// filter caught something, not that there was nothing to catch.
eq('and unfiltered, the counted deck has exactly one row more',
  parseCsv(deckCounted, ',').length - parseCsv(deckNoCount, ',').length, 1);

// Promise 4's two invariants, re-run over a deck carrying the line. "The rows
// are identical" is a statement about this build; these two are the statements
// promise 4 rests on, and they are cheap.
const countedStrays = rowsOf(deckCounted)
  .filter((r) => !ARTICLE.includes(plain(r[1])));
check('every sentence on the counted deck still occurs in the article',
  countedStrays.length === 0,
  countedStrays.map((r) => `${r[0]}: ${plain(r[1])}`).join(' | '));
const countedFaces = facesOutsideTheirSentence(rowsOf(deckCounted));
check('and every face still occurs in its own sentence',
  countedFaces.length === 0, countedFaces.map((r) => r[0]).join(' '));

// The decks the rest of this file reads carry no such line, which is the other
// half of it: the free deck is byte for byte what it was before this existed.
check('no deck built without a count carries the line',
  countLine(e2e).length === 0 && countLine(proDeck).length === 0);

// ---- and the tier gate is not in this file ---------------------------------
//
// `build` prints the count whenever it is handed one, on a free-format deck as
// readily as on a marked one — exactly like `html`, and for the same reason: a
// builder cannot ask the licence, because the answer is a promise and this
// function is not async. The gate belongs to the caller — in the extension
// one line of the popup, `filtered: paid ? state.filtered : undefined`, held
// by a browser driver at the real origin with a real key. Asserted here so
// a reader looking for the tier decision in this file learns it is somewhere
// else rather than concluding there is not one.
eq('the builder has no opinion about who paid',
  countLine(built(2, { html: false })).length, 1);

// ============================================================================
// THE FILE IT ARRIVES AS
//
// One naming convention for everything this extension writes, stated in
// csv-core.js and asked of it here rather than assembled a second time.
//
// THE THIRD ARGUMENT OUTLIVED ITS ONLY CALLER, and that is why these four
// cases are still here after the worksheet went in 1.1.0. `filename` takes an
// extension because the sheet needed one, and nothing in the shipped
// extension passes it now. What the function does when handed something it
// does not recognise is a rule about a value that reaches a filesystem, and a
// rule with no case under it is a parameter nobody has ever run. If a second
// file type comes back, it comes back to a guard that was kept warm rather
// than to one written in a hurry beside it.
// ============================================================================
group('the file it arrives as');
const WHEN = Date.parse('2026-08-14');
eq('a declared extension replaces the .csv and changes nothing else',
  C.filename(REPORT, WHEN, 'html'),
  C.filename(REPORT, WHEN).replace(/\.csv$/, '.html'));
eq('and the deck is named exactly as it always was',
  C.filename(REPORT, WHEN), 'ascham_a-report-on-boundaries_2026-08-14.csv');
// A named type or the floor, which is the rule this codebase applies to every
// value that arrives from somewhere else. This one reaches a filesystem.
eq('an extension nobody declared is a deck',
  C.filename(REPORT, WHEN, '../../etc/passwd'),
  'ascham_a-report-on-boundaries_2026-08-14.csv');
eq('and so is an object', C.filename(REPORT, WHEN, {}),
  'ascham_a-report-on-boundaries_2026-08-14.csv');

// ---- the two files that are handed a store ---------------------------------
//
// settings-core.js and licence-core.js both take `store` as an argument for the
// same reason — they answer in a harness, in a service worker, and in a private
// window where the setter throws — so they share one stub rather than keeping a
// stub each. A second copy of this is a second definition of what a store does,
// and the two would drift in the direction of whichever file was edited last.
const stubStore = () => {
  const held = new Map();
  return {
    getItem: (k) => (held.has(k) ? held.get(k) : null),
    setItem: (k, v) => held.set(k, String(v)),
    removeItem: (k) => held.delete(k),
    size: () => held.size,
  };
};

const hostileStore = {
  getItem() { throw new Error('storage is disabled'); },
  setItem() { throw new Error('storage is disabled'); },
  removeItem() { throw new Error('storage is disabled'); },
};

// ============================================================================
group('settings: the free floor');
// ============================================================================

// THE PAID TIER RESTS ON THIS FILE AND PREVIOUSLY NOTHING DROVE IT. Its
// header calls one sentence THE WHOLE GUARANTEE — `effective()` asks the
// licence before it reads the store — and that sentence was asserted by the
// comment making it. Everything below drives the SAME stored blob from both
// answers, because comparing them is the only way the guarantee is visible: an
// unpaid copy that honours `{"tier":"off"}` looks, from inside itself, exactly
// like a paid one that was asked politely.
//
// This is the one direction in the product that a bug must never take on its
// own. Every other control adds words to the blocklist; this one takes the
// blocklist away, and the deck it produces goes to a classroom.
const BOUGHT = {
  tier: ST.TIERS.OFF, terms: ['ministry'], cloze: true, tag: 'year-9-autumn'
};

eq('a paid copy gets the tier that was stored',
  ST.effective(BOUGHT, true).tier, ST.TIERS.OFF);
eq('and the terms that were stored',
  ST.effective(BOUGHT, true).terms.join(' '), 'ministry');
eq('and the card style that was stored',
  ST.effective(BOUGHT, true).cloze, true);
eq('an unpaid copy gets the free floor out of the same blob',
  ST.effective(BOUGHT, false).tier, ST.TIERS.STANDARD);
eq('and none of the terms in it',
  ST.effective(BOUGHT, false).terms.length, 0);
eq('and the free card style, whatever the blob says',
  ST.effective(BOUGHT, false).cloze, false);
eq('and the deck tag that was stored',
  ST.effective(BOUGHT, true).tag, 'year-9-autumn');
// The floor here is an absence and not a value, which is the only spelling
// that leaves the free deck tagged with the article exactly as it has been
// since before this field existed.
eq('and no deck tag at all on the free floor',
  ST.effective(BOUGHT, false).tag, '');

// THE SHAPE IS THE SAME ON BOTH PATHS, which is a claim about the object and
// not about any one field. A free answer missing a key that the paid answer
// has would still build the right deck today — `undefined === true` is false —
// and would be one spread or one Object.keys away from not doing.
eq('both answers have the same fields',
  Object.keys(ST.effective(BOUGHT, false)).sort().join(' '),
  Object.keys(ST.effective(BOUGHT, true)).sort().join(' '));

// A STORE THE TEACHER CAN EDIT, ASKED FOR A BOOLEAN. `Boolean(from.cloze)`
// would take all four of these, and JSON.parse hands back every one of them
// without complaint.
for (const [what, written] of [
  ['the string "true"', 'true'],
  ['the string "false"', 'false'],
  ['the number 1', 1],
  ['an object', {}],
  ['an array holding true', [true]],
]) {
  eq(`a card style stored as ${what} is not a card style`,
    ST.coerce({ cloze: written }).cloze, false);
}
eq('and the one value that is', ST.coerce({ cloze: true }).cloze, true);

// THE SAME STORE, ASKED FOR A STRING. Added with the deck tag. The
// rule is the same shape — a named type or the floor — and the floor is the
// empty string, which csv-core reads as "tag it with the article".
for (const [what, written] of [
  ['a number', 42],
  ['an array', ['year-9']],
  ['an object', {}],
  ['null', null],
  ['true', true],
]) {
  eq(`a deck tag stored as ${what} is not a deck tag`,
    ST.coerce({ tag: written }).tag, '');
}
eq('a string survives', ST.coerce({ tag: 'year-9-autumn' }).tag,
  'year-9-autumn');
eq('and is trimmed, because a trailing space is invisible in the box',
  ST.coerce({ tag: '  year-9-autumn  ' }).tag, 'year-9-autumn');

// WHAT THIS DELIBERATELY DOES NOT REJECT, and it is the interesting half. A
// coercion refusing anything with a space in it would refuse the thing a
// teacher most naturally types, store the empty string, and hand them the
// article's slug — which looks exactly like the setting failing to save.
// Shaping happens where the tag is written; this file's job is that the store
// cannot hand anybody a surprise.
eq('a tag with spaces is kept, not refused — shaping is not this file\'s job',
  ST.coerce({ tag: 'Year 9 Autumn' }).tag, 'Year 9 Autumn');

// The cap is the store's, not the tag's: it exists so a hand-edited blob
// cannot put an unbounded string on the page or into a deck, and it sits above
// csv-core's shaping cut so a teacher's overlong tag is shortened at a hyphen
// by the rule that knows what a tag is rather than truncated by this one.
const longStored = ST.coerce({ tag: 'y'.repeat(500) }).tag;
eq('an unbounded tag is cut to the store\'s cap',
  longStored.length, ST.MAX_TAG_LENGTH);
check('and that cap is above the shaping cut, never below it',
  ST.MAX_TAG_LENGTH > 48, `got ${ST.MAX_TAG_LENGTH}`);

// `paid !== true`, WHICH IS NOT A TRUTHINESS TEST, AND THE DIFFERENCE IS ONE
// KEYSTROKE WIDE. The caller is an async check: `harvestOptions(read(), pro())`
// without the `await` hands this function a pending promise, and a pending
// promise is truthy. Written loosely, that typo unlocks every copy of the
// product and no test above would have noticed, because the tier it returns is
// the tier that was stored — which for a teacher who never opened the options
// page is the free floor anyway.
for (const [what, answer] of [
  ['no answer at all', undefined],
  ['a null answer', null],
  ['an unawaited promise', Promise.resolve(true)],
  ['a promise that would have resolved false', Promise.resolve(false)],
  ['the string "true"', 'true'],
  ['a result object nobody unwrapped', { ok: true }],
  ['the number 1', 1],
  ['a non-empty reason string', 'ceiling'],
]) {
  eq(`${what} buys nothing`,
    ST.effective(BOUGHT, answer).tier, ST.TIERS.STANDARD);
}
eq('and the answer that does buy something is exactly one value',
  ST.effective(BOUGHT, true).tier, ST.TIERS.OFF);

// THE STORE IS NOT READ AT ALL ON THE FREE PATH. That is a stronger claim than
// "the free path returns the defaults", and it is the claim the header makes:
// there is no path through the file where a free copy consults what the store
// says. The difference matters because the weaker version stays true right up
// until someone adds a field that seems harmless to honour for everybody, and
// the store is a place the teacher can write. A blob that throws when it is
// read is the only way to ask the question.
const explosive = {
  get tier() { throw new Error('the store was read'); },
  get terms() { throw new Error('the store was read'); },
};
let readAnyway = '';
try { ST.effective(explosive, false); } catch (e) { readAnyway = e.message; }
eq('the free path does not touch the stored blob', readAnyway, '');
// AND THE CONTROL, because the case above passes just as well against a blob
// whose getters do nothing. A check that cannot fail is decoration.
let readWhenPaid = '';
try { ST.effective(explosive, true); } catch (e) { readWhenPaid = e.message; }
eq('and the blob it did not touch was live the whole time',
  readWhenPaid, 'the store was read');

// The free answer is a NEW list every time. `terms: DEFAULTS.terms` passes
// every case above and hands every caller the same array, so the first one to
// push into what it was given blocks a word for every later harvest on the
// page — a paid feature arriving free, by reference, until the popup closes.
const firstFree = ST.effective(BOUGHT, false);
firstFree.terms.push('ministry');
eq('the free floor is not a shared list',
  ST.effective(BOUGHT, false).terms.length, 0);
eq('and the defaults cannot be edited through it',
  ST.DEFAULTS.terms.length, 0);

// ============================================================================
group('settings: nothing out of the store is trusted');
// ============================================================================

// `coerce` is handed whatever `JSON.parse` returned, which is whatever is in a
// store the teacher can edit — as can any extension with access to this origin,
// and any page that shares it. It is total on purpose: nothing here throws, and
// every value that is not the declared shape lands on the free floor rather
// than on what was written.
const tierOf = (raw) => ST.coerce(raw).tier;
const termsOf = (raw) => ST.coerce(raw).terms.join(' ');

for (const [what, raw] of [
  ['null', null],
  ['nothing', undefined],
  ['a string', 'off'],
  ['a number', 3],
  ['a boolean', true],
  ['an array', [{ tier: 'off' }]],
  ['an empty object', {}],
]) {
  eq(`${what} in the store is the free floor`, tierOf(raw), ST.TIERS.STANDARD);
  eq(`and ${what} carries no terms`, termsOf(raw), '');
}

// WHAT THE LOOP ABOVE DOES NOT HOLD, STATED RATHER THAN LEFT TO BE FOUND.
// `coerce` guards with `!Array.isArray(raw)`, and taking that guard out leaves
// every case in this file green: an array has no `tier` and no `terms`, so it
// falls to the floor by accident instead of by decision. Nothing reachable
// separates the two — a JSON array cannot carry named properties, and the store
// holds JSON. The guard is kept because the reason it is there is legible and
// the reason it could go is a chain of three facts about another language's
// object model, and this notes that the battery found it rather
// than leaving the next reader to rediscover a check with nothing behind it.

// AN UNKNOWN TIER IS STANDARD AND NEVER OFF. The file writes this as a
// membership test against the three declared values rather than as "not young
// and not off", because the negative form makes a fourth position added later
// default to whichever branch happens to be last — and the last branch is the
// one only Pro reaches.
eq('the strict tier survives a round trip',
  tierOf({ tier: 'young' }), ST.TIERS.YOUNG);
eq('so does the free one', tierOf({ tier: 'standard' }), ST.TIERS.STANDARD);
eq('and so does off, or the Pro setting does not work',
  tierOf({ tier: 'off' }), ST.TIERS.OFF);
eq('a tier nobody declared is the floor',
  tierOf({ tier: 'unlimited' }), ST.TIERS.STANDARD);
eq('and so is one in the wrong case',
  tierOf({ tier: 'OFF' }), ST.TIERS.STANDARD);
eq('and one with a space in front of it',
  tierOf({ tier: ' off' }), ST.TIERS.STANDARD);
eq('a tier that is a number is the floor',
  tierOf({ tier: 0 }), ST.TIERS.STANDARD);
eq('a tier that is a boolean is the floor',
  tierOf({ tier: true }), ST.TIERS.STANDARD);
eq('a missing tier is the floor', tierOf({ terms: [] }), ST.TIERS.STANDARD);
eq('a null tier is the floor', tierOf({ tier: null }), ST.TIERS.STANDARD);

// THE SHAPE IS A STRING, AND THIS IS THE CASE THAT SAID SO. `String(x)` on a
// one-element array is that element, so `{"tier":["off"]}` — which `JSON.parse`
// produces without complaint — read back as the paid tier through a coercion
// whose whole job is to refuse things that are not the declared shape. Nothing
// was unlocked by it: `effective` asks the licence first, and that is the guard
// this one sits behind. But a coercion that accepts a shape it does not name is
// a coercion nobody can reason about from the outside, and the next reader
// would have to run it to know.
eq('a tier wrapped in an array is not a tier',
  tierOf({ tier: ['off'] }), ST.TIERS.STANDARD);
eq('and neither is an object that says it is one',
  tierOf({ tier: { toString: () => 'off' } }), ST.TIERS.STANDARD);

// ---- the teacher's own terms ------------------------------------------------
eq('the terms come back lower case and trimmed',
  termsOf({ terms: [' Ministry ', 'TARIFF'] }), 'ministry tariff');
eq('a list that is not a list is no terms', termsOf({ terms: 'ministry' }), '');
eq('and neither is an object pretending to be one',
  termsOf({ terms: { 0: 'ministry', length: 1 } }), '');
eq('an entry that is not a string is skipped, not fatal',
  termsOf({ terms: [42, 'ministry', null, {}, ['tariff']] }), 'ministry');
eq('duplicates are stored once',
  termsOf({ terms: ['ministry', 'Ministry', ' ministry '] }), 'ministry');

// The term must be a WORD, because a term is matched whole against a card's
// surface and its lemma. Anything that cannot match is dropped rather than
// stored to no effect: a teacher who types a phrase and sees it listed back
// has been told the phrase is blocking something.
eq('a hyphenated word is a word',
  termsOf({ terms: ['cross-party'] }), 'cross-party');
eq('and so is a contraction', termsOf({ terms: ["don't"] }), "don't");
eq('a digit in it is not a word', termsOf({ terms: ['tariff9'] }), '');
eq('a phrase is not a word', termsOf({ terms: ['the ministry'] }), '');
eq('an accented spelling is not one this matcher can match',
  termsOf({ terms: ['café'] }), '');
eq('a word cannot start with a hyphen', termsOf({ terms: ['-ministry'] }), '');
eq('nor with an apostrophe', termsOf({ terms: ["'tis"] }), '');
eq('an empty entry is dropped', termsOf({ terms: [''] }), '');
eq('and so is one that is only whitespace', termsOf({ terms: ['   '] }), '');

// ---- the caps, which exist so a corrupted blob cannot make the harvest
// quadratic or the options page unreadable ------------------------------------
const LONGEST = 'a'.repeat(ST.MAX_TERM_LENGTH);
eq('a term at the length cap is kept', termsOf({ terms: [LONGEST] }), LONGEST);
eq('and one character past it is dropped',
  termsOf({ terms: [`${LONGEST}a`] }), '');

const A = 'abcdefghijklmnopqrstuvwxyz';
const nth = (i) => `t${A[Math.floor(i / 26) % 26]}${A[i % 26]}`;
const overfull = ST.coerce({
  terms: Array.from({ length: ST.MAX_TERMS + 20 }, (_, i) => nth(i)),
}).terms;
eq('a list past the cap is cut to it', overfull.length, ST.MAX_TERMS);
eq('and it is cut off the end, not sampled', overfull[0], nth(0));
eq('at the last term the cap allows', overfull[ST.MAX_TERMS - 1],
  nth(ST.MAX_TERMS - 1));

// THE CAP COUNTS WHAT IT KEEPS, NOT WHAT IT READ. Written the other way — a
// cap on the loop rather than on the list — a blob padded with two hundred
// nulls silently discards every real term after them, and the teacher sees an
// options page that has forgotten what they typed with no error anywhere.
eq('junk ahead of a term does not spend the cap',
  termsOf({ terms: [...Array(ST.MAX_TERMS + 50).fill(42), 'ministry'] }),
  'ministry');
eq('and neither do repeats of one that was already kept',
  termsOf({ terms: ['ministry', ...Array(ST.MAX_TERMS + 50).fill('ministry'),
    'tariff'] }), 'ministry tariff');

// ============================================================================
group('settings: from the box to the list');
// ============================================================================

// `parseTerms` reads the textarea. It splits on anything that is not part of a
// word, so a comma-separated line and one term per line both work and neither
// is documented as the right one — a teacher typing into a box at eight in the
// morning should not have to have read anything.
eq('a comma-separated line', ST.parseTerms('ministry, tariff').join(' '),
  'ministry tariff');
eq('one per line', ST.parseTerms('ministry\ntariff').join(' '),
  'ministry tariff');
eq('both at once, with the punctuation people actually type',
  ST.parseTerms(' ministry, tariff;\n  quota \n').join(' '),
  'ministry tariff quota');
eq('an empty box is no terms', ST.parseTerms('').length, 0);
eq('a box of separators is no terms', ST.parseTerms(' ,\n; ').length, 0);
eq('and nothing at all is no terms', ST.parseTerms(null).length, 0);
eq('nor does undefined throw', ST.parseTerms(undefined).length, 0);
eq('the apostrophe and the hyphen stay inside the word',
  ST.parseTerms("don't, cross-party").join(' '), "don't cross-party");
// A digit is a separator here and a refusal one function later, so the same
// typo loses different things depending on where it lands. Recorded rather
// than changed: both readings drop the digit, and neither can cost a teacher a
// word they did not type.
eq('a digit splits the word rather than failing it',
  ST.parseTerms('tariff9quota').join(' '), 'tariff quota');

// THE TWO HALVES HAVE TO AGREE, because the page runs them back to back: what
// `parseTerms` emits is what `coerce` is asked to keep. Anything the box can
// produce that the store then refuses is a term the teacher watched themselves
// type and will never see work.
const TYPED = "ministry, tariff; don't\ncross-party  QUOTA";
eq('everything the box can emit survives the coercion',
  ST.coerce({ terms: ST.parseTerms(TYPED) }).terms.join(' '),
  "ministry tariff don't cross-party quota");

// ============================================================================
group('settings: the store it is allowed to read');
// ============================================================================

// The name is not the licence's, and that is load-bearing rather than tidy:
// an allowance that covers two unrelated things is one nobody can withdraw
// from one of them (store.js allows each key by name, check.sh S1).
check('the settings and the licence live under different names',
  ST.STORE !== L.STORE, `both stored at ${ST.STORE}`);

const s = stubStore();
eq('an empty store is the free floor', ST.read(s).tier, ST.TIERS.STANDARD);
eq('and carries no terms', ST.read(s).terms.length, 0);
check('settings can be kept',
  ST.write({ tier: ST.TIERS.YOUNG, terms: ['ministry'] }, s), 'write refused');
eq('and come back as they went in', ST.read(s).tier, ST.TIERS.YOUNG);
eq('with their terms', ST.read(s).terms.join(' '), 'ministry');

// COERCED ON THE WAY IN AS WELL AS ON THE WAY OUT. The page is the only caller
// today and it builds a clean object, but a store written from one shape and
// read against another is how the two drift, and the drift is invisible until
// something reads the raw string — which is what this case does rather than
// asking the reader to trust the round trip.
ST.write({ tier: ST.TIERS.OFF, terms: [' MINISTRY ', 42, 'ministry'] }, s);
eq('what reaches the store is already coerced',
  s.getItem(ST.STORE),
  '{"tier":"off","terms":["ministry"],"cloze":false,"tag":""}');

// AND NOTHING THAT IS NOT A SETTING IS WRITTEN. The store is allowed for a
// settings blob whose fields are named here. A blob that quietly grows one
// more is how an allowance stops describing the thing it was granted for, and the field this product must
// never persist is the one the teacher highlighted.
//
// THE DECLARED SET GREW and this case is what made that a
// decision rather than a diff: `cloze` arrived, these two lines went red, and
// the declared fields were updated in the same change because a gate asked
// for it. That is the whole design — the blob cannot gain a field in silence.
ST.write({
  tier: ST.TIERS.OFF, terms: ['ministry'],
  passage: 'the paragraph the teacher highlighted',
}, s);
const stored = s.getItem(ST.STORE);
check('a field nobody declared is not written', !stored.includes('passage'),
  stored);
check('and neither is what it was carrying',
  !stored.includes('highlighted'), stored);
eq('the stored blob has exactly the declared fields',
  Object.keys(JSON.parse(stored)).sort().join(' '), 'cloze tag terms tier');

// Each file reads its own name and leaves the other alone. One page, one
// origin, two exemptions: the case that would have caught either file reaching
// for the other's slot.
const shared = stubStore();
shared.setItem(L.STORE, 'a key this file has no business reading');
ST.write({ tier: ST.TIERS.OFF, terms: [] }, shared);
eq('writing settings leaves the licence where it was',
  L.held(shared), 'a key this file has no business reading');
eq('and the store holds one entry each', shared.size(), 2);

// ---- a store that cannot be read is a store with nothing in it --------------
//
// Which is the defaults, which is the free floor. The alternative — throwing —
// puts a private window and a corrupted profile on the same footing as a
// deliberate choice, and both of them would take the popup down with them.
const broken = stubStore();
broken.setItem(ST.STORE, '{"tier":"off", not json at all');
eq('a blob that will not parse is the free floor',
  ST.read(broken).tier, ST.TIERS.STANDARD);
broken.setItem(ST.STORE, 'null');
eq('a stored null is the free floor', ST.read(broken).tier, ST.TIERS.STANDARD);
broken.setItem(ST.STORE, '["off"]');
eq('a stored array is the free floor', ST.read(broken).tier, ST.TIERS.STANDARD);
broken.setItem(ST.STORE, '"off"');
eq('a stored string is the free floor',
  ST.read(broken).tier, ST.TIERS.STANDARD);

eq('a store that throws reads as the free floor',
  ST.read(hostileStore).tier, ST.TIERS.STANDARD);
check('and refuses to write rather than breaking',
  ST.write({ tier: ST.TIERS.OFF, terms: [] }, hostileStore) === false,
  'a throwing store reported a successful write');
eq('with no DOM storage at all, the answer is still the free floor',
  ST.read().tier, ST.TIERS.STANDARD);
check('and nothing can be kept',
  ST.write({ tier: ST.TIERS.OFF, terms: [] }) === false,
  'write succeeded with no store');

// ============================================================================
group('settings: what the harvest is told');
// ============================================================================

// The mapping from a stored tier to a harvest option, which is the part a
// reader has to be able to check at a glance. Three positions of one dial:
// young adds taboo.js's borderline list to the floor, standard is the floor,
// off is the only line in the product that takes the floor away.
const told = (blob, paid) => ST.harvestOptions(blob, paid);

eq('young asks for the strict tier',
  told({ tier: 'young' }, true).strict, true);
eq('and does not ask for an unfiltered deck',
  told({ tier: 'young' }, true).unfiltered, null);
eq('standard asks for neither', told({ tier: 'standard' }, true).strict, false);
eq('and gets no token either',
  told({ tier: 'standard' }, true).unfiltered, null);
eq('off asks for the unfiltered deck by the token vocab-core declares',
  told({ tier: 'off' }, true).unfiltered, V.UNFILTERED);
eq('and does not also ask for the strict tier',
  told({ tier: 'off' }, true).strict, false);
eq('the terms are passed through',
  told(BOUGHT, true).also.join(' '), 'ministry');

// The same three, unpaid. Nothing here reads the tier at all — this is
// `effective` one call down, asserted where a caller would actually see it.
eq('an unpaid copy is never handed the token',
  told({ tier: 'off' }, false).unfiltered, null);
eq('nor the strict tier it did not buy',
  told({ tier: 'young' }, false).strict, false);
eq('nor its own terms', told(BOUGHT, false).also.length, 0);

// THE TOKEN IS SPELLED IN ONE FILE AND THIS IS NOT IT. settings-core.js reads
// it out of vocab-core rather than holding a copy, so there is exactly one
// literal in the tree that turns the blocklist off. A second copy is a second way
// onto the unfiltered path, held by a file that does not decide what it means.
const settingsSrc =
  fs.readFileSync(path.join(CORE, 'settings-core.js'), 'utf8');
check('settings-core.js does not spell the unfilter token',
  !settingsSrc.includes(V.UNFILTERED), 'the token is written out twice');
// The needle has to be able to find something, or the case above passes
// because it was looking for a string that no longer exists anywhere.
check('and the token being looked for is the one vocab-core ships',
  fs.readFileSync(path.join(CORE, 'vocab-core.js'), 'utf8')
    .includes(`= '${V.UNFILTERED}'`), `${V.UNFILTERED} is not declared there`);

// A HALF-LOADED PAGE FILTERS. Reading the token from another file means the
// read can fail, and the direction that failure takes is the whole reason it
// is written this way: no vocab-core, no token, and vocab-core refuses a token
// that is not an exact match anyway. A page that cannot load the blocklist has
// not chosen anything.
// BROWSER PORT: with vocab-core absent, settings-core does not load, so no
// options object exists to carry a token.
const halfLoaded = await graphOf('settings-core.js', 'vocab-core.js');
check('with vocab-core absent there is no token to hand over',
  !halfLoaded.ns && String(halfLoaded.error).includes('vocab-core.js'),
  halfLoaded.ns ? 'settings-core loaded' : String(halfLoaded.error));
eq('and the tree it was restored into hands one over again',
  ST.harvestOptions({ tier: 'off' }, true).unfiltered, V.UNFILTERED);

// ---- and the deck at the end of it -----------------------------------------
//
// EVERYTHING ABOVE IS ABOUT AN OPTIONS OBJECT. This is the chain the page
// actually runs — stored blob, licence answer, harvest options, deck — over one
// passage, twice, changing nothing but the answer. The blob says `off` in both
// runs, which is the blob a teacher can write by hand in a devtools console.
const SLUR = TABOO_WORDS[0];
const twoWays = (paid) => {
  const chosen = ST.harvestOptions({ tier: ST.TIERS.OFF, terms: [] }, paid);
  const t = carrier(SLUR);
  return V.harvest(t, 0, t.length, {
    ...opts, also: chosen.also, strict: chosen.strict,
    unfiltered: chosen.unfiltered,
  });
};
const freeDeck = twoWays(false);
const paidDeck = twoWays(true);

check('an unpaid copy holding {"tier":"off"} still gets a filtered deck',
  !freeDeck.cards.some((c) => c.word === SLUR),
  `${SLUR} reached a free deck`);
eq('and the refusal is counted where the blocklist counts it',
  freeDeck.stats.rejected.taboo, 1);
check('a paid copy holding the same blob gets the word',
  paidDeck.cards.some((c) => c.word === SLUR),
  `the off switch did not turn the list off: ${
    paidDeck.cards.map((c) => c.word).join(' ')}`);
eq('and nothing is counted as blocked', paidDeck.stats.rejected.taboo, 0);
// The switch subtracts and does nothing else. If the two decks differ anywhere
// but the word that was blocked, the tier is changing the deck rather than the
// filter — which is the free tier's promise, arriving from the other side.
eq('the two decks differ by exactly the word the list was holding back',
  paidDeck.cards.filter((c) => c.word !== SLUR).map((c) => c.word).join(' '),
  freeDeck.cards.map((c) => c.word).join(' '));

// The additive control, through the same chain: a paid teacher's own term is
// subtracted from the deck, and an unpaid copy's is not.
const withTerm = (paid) => {
  const chosen = ST.harvestOptions(
    { tier: ST.TIERS.STANDARD, terms: ['witness'] }, paid);
  const t = carrier('gerrymandering');
  return V.harvest(t, 0, t.length, {
    ...opts, also: chosen.also, strict: chosen.strict,
    unfiltered: chosen.unfiltered,
  }).cards.map((c) => c.word);
};
check('a paid teacher\'s own term is kept off the deck',
  !withTerm(true).includes('witness'), withTerm(true).join(' '));
check('and the word is one that cards when nobody blocked it',
  withTerm(false).includes('witness'), withTerm(false).join(' '));

// ---- the licence ------------------------------------------------------------
//
// THE ONLY ASYNCHRONOUS GROUP IN THIS FILE, so the verdict moves inside it.
// WebCrypto's verify returns a promise and there is no synchronous way to ask
// it, which is why everything below this line runs after everything above it.
//
// THE FIXTURES ARE SIGNED BY A TEST-ONLY KEY PAIR, in
// tests/fixtures/licence/ with its private half, and verify() is handed that
// pair's public half. No key here unlocks the product: each is refused under
// the shipped ISSUER, which is asserted below. The extension's harness pasted
// keys signed by the real issuer so that replacing ISSUER would fail every
// case; that job is now one case, the shipped key's fingerprint pinned here.
// The forged fixture is signed by a third key that was never kept.
const LICENCE_FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/licence');
const TEST_ISSUER = JSON.parse(fs.readFileSync(path.join(LICENCE_FIX, 'TEST-ONLY-issuer.json'), 'utf8')).public;
const FIXTURE_KEYS = JSON.parse(fs.readFileSync(path.join(LICENCE_FIX, 'keys.json'), 'utf8'));
const KEYS = {
  VALID: FIXTURE_KEYS.valid1,
  CEILING_ZERO: FIXTURE_KEYS.ceilingZero,
  NAMED_BUYER: FIXTURE_KEYS.namedBuyer,
  FOREIGN: FIXTURE_KEYS.forged,
  WRONG_FORMAT: FIXTURE_KEYS.wrongFormat,
  NO_CEILING: FIXTURE_KEYS.noCeiling,
  MALFORMED: FIXTURE_KEYS.malformed,
};
// sha256 of licence-core.js's ISSUER. Replacing ISSUER invalidates every key
// ever issued; this is the case that says so.
const ISSUER_SHA256 = '967d59a47b8e167bcfa9f21dba7552b5333edab7043d43dfcb21f949a84e7d6b';

const b64url = (text) => Buffer.from(text, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Re-sealing a real key's signature over a payload somebody has edited. This
// is the forgery the whole scheme exists to refuse, and it is the cheapest one
// to attempt: the signature is left untouched and the claim is rewritten.
const sigOf = (key) => key.split('.')[2];
const resealed = (claim, from) =>
  `${L.TAG}.${b64url(JSON.stringify(claim))}.${sigOf(from || KEYS.VALID)}`;

// The same key, spelled the other way. A canonical last character has its four
// padding bits at zero, so the next character up the alphabet carries the same
// two meaningful bits and decodes to the same 64 bytes — which is the whole of
// what the round-trip check exists to refuse.
//
// BY THE ALPHABET AND NOT BY A CHARACTER. This was written
// inline as `replace(/.$/, (c) => (c === 'w' ? 'x' : 'w'))`, which assumes the
// signature ends in `w`; a canonical one ends in `A`, `Q`, `g` or `w` and each
// has its own fifteen siblings. The first key rotation in this product's life
// produced one ending in `A`, and the flip then returned `w` — a DIFFERENT key
// that is still canonical, so parse() said ok and the case failed. It failing
// is the good outcome. The extension's browser driver held the same assumption and did not
// fail: there the edit landed on a signature check that refused it anyway, for
// a reason unrelated to spelling.
const B64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const spelledAgain = (key) =>
  key.slice(0, -1) + B64URL[B64URL.indexOf(key.slice(-1)) + 1];

// A decoder of our own, because licence-core's is not reachable for this: it
// refuses a non-canonical segment before returning any bytes, which is the
// behaviour being checked. Node's is used rather than a hand-rolled one — the
// question here is what the spelling decodes to, not whether we can decode.
const bytesOf = (segment) => Buffer.from(segment, 'base64url');

{
  group('licence: reading a key');

  const reason = (key) => {
    const r = L.parse(key);
    return r.ok ? 'ok' : r.reason;
  };

  eq('nothing pasted is missing, not malformed', reason(''), L.REASONS.MISSING);
  eq('whitespace is nothing pasted', reason('   \n '), L.REASONS.MISSING);
  eq('null is nothing pasted', reason(null), L.REASONS.MISSING);
  eq('another product\'s tag is refused',
    reason(KEYS.VALID.replace(L.TAG, 'ASCH2')), L.REASONS.SHAPE);
  eq('two parts is not a key',
    reason(KEYS.VALID.split('.').slice(0, 2).join('.')), L.REASONS.SHAPE);
  // LICENCE.shape tells the teacher to copy the part before the first full
  // stop, so a key pasted without it must be refused as a shape, which is
  // when that line is shown.
  eq('a key pasted without the part before the first full stop is a shape',
    reason(KEYS.VALID.split('.').slice(1).join('.')), L.REASONS.SHAPE);
  eq('four parts is not a key', reason(`${KEYS.VALID}.extra`), L.REASONS.SHAPE);
  eq('an empty payload segment is not a key',
    reason(`${L.TAG}..${KEYS.VALID.split('.')[2]}`), L.REASONS.SHAPE);
  eq('a character outside base64url is refused',
    reason(KEYS.VALID.replace(/.$/, '*')), L.REASONS.ENCODING);

  // The clause's truncated key. It is refused for its LENGTH before any
  // signature is attempted, so the teacher is told the paste was cut short
  // rather than that their key is a forgery.
  eq('a truncated key is refused as a shape',
    reason(KEYS.VALID.slice(0, -10)), L.REASONS.SHAPE);
  eq('a signature one byte short is still a shape',
    reason(`${L.TAG}.${KEYS.VALID.split('.')[1]}.${'A'.repeat(84)}`),
    L.REASONS.SHAPE);
  eq('a segment whose length cannot be base64 at all is encoding',
    reason(`${L.TAG}.${KEYS.VALID.split('.')[1]}.${'A'.repeat(85)}`),
    L.REASONS.ENCODING);

  // BASE64URL IS NOT CANONICAL AND THIS IS THE CASE THAT FOUND IT. The last
  // character of the signature segment carries two meaningful bits and four
  // the decoder discards, so sixteen spellings of every key decode to the same
  // bytes and all sixteen verified. Nothing was forgeable — the signature was
  // untouched — but a key with sixteen spellings is a key nobody can read back
  // over a phone. parse() now requires the decode to round-trip.
  eq('a key has exactly one spelling',
    reason(spelledAgain(KEYS.VALID)), L.REASONS.ENCODING);
  // And the sibling really is one — the property the line above rests on, held
  // separately so that a spelling which stopped being equivalent could not go
  // on satisfying the round-trip check by being a different key.
  eq('the other spelling decodes to the same signature bytes',
    Buffer.from(L.parse(KEYS.VALID).signature).toString('hex'),
    Buffer.from(bytesOf(spelledAgain(KEYS.VALID).split('.')[2])).toString('hex'));

  eq('a payload that is not JSON is refused',
    reason(`${L.TAG}.${b64url('not json at all')}.${'A'.repeat(86)}`),
    L.REASONS.PAYLOAD);
  eq('a payload that is a JSON array is refused',
    reason(resealed([1, 2, 3])), L.REASONS.PAYLOAD);
  eq('a payload that is a JSON string is refused',
    reason(`${L.TAG}.${b64url('"a key"')}.${'A'.repeat(86)}`),
    L.REASONS.PAYLOAD);
  eq('an unexpected field is refused rather than ignored',
    reason(resealed({ v: 1, max: 1, buyer: '', seats: 30 })),
    L.REASONS.PAYLOAD);
  eq('a missing ceiling is refused', reason(KEYS.NO_CEILING),
    L.REASONS.PAYLOAD);
  eq('a later format version is refused', reason(KEYS.WRONG_FORMAT),
    L.REASONS.PAYLOAD);
  eq('a fractional ceiling is not an integer',
    reason(resealed({ v: 1, max: 1.5, buyer: '' })), L.REASONS.PAYLOAD);
  eq('a ceiling written as a string is refused',
    reason(resealed({ v: 1, max: '1', buyer: '' })), L.REASONS.PAYLOAD);
  eq('a buyer that is not a string is refused',
    reason(resealed({ v: 1, max: 1, buyer: 42 })), L.REASONS.PAYLOAD);

  const good = L.parse(KEYS.VALID);
  check('a real key reads', good.ok, good.reason);
  eq('and carries the ceiling', good.claim.max, 1);
  eq('and carries an empty buyer field', good.claim.buyer, '');
  eq('the buyer field is read when it is filled',
    L.parse(KEYS.NAMED_BUYER).claim.buyer, 'example-buyer');

  // Reading is not deciding: a key signed by nobody at all still PARSES, which
  // is why nothing may read `claim` before verify() has spoken.
  check('a foreign key parses, because parsing is not proof',
    L.parse(KEYS.FOREIGN).ok, 'a foreign key was refused too early');

  group('licence: the running major version');

  eq('a released version is its first number', L.majorOf('1.0.0'), 1);
  eq('the current build is major zero', L.majorOf('0.1.2'), 0);
  eq('two digits are not two majors', L.majorOf('11.2.0'), 11);
  eq('a bare number is a major', L.majorOf('3'), 3);
  check('an empty version is not a number', Number.isNaN(L.majorOf('')),
    'empty parsed as a major');
  check('null is not a number', Number.isNaN(L.majorOf(null)),
    'null parsed as a major');
  check('a v prefix is not a number', Number.isNaN(L.majorOf('v1.0.0')),
    'v1.0.0 parsed as a major');

  group('licence: verifying one');

  const subtle = globalThis.crypto.subtle;
  const said = async (key, running) => {
    const r = await L.verify(key, running, subtle, TEST_ISSUER);
    return r.ok ? 'ok' : r.reason;
  };

  eq('a real key unlocks the version it was bought for',
    await said(KEYS.VALID, '1.0.0'), 'ok');
  eq('and every later point release of it',
    await said(KEYS.VALID, '1.4.7'), 'ok');
  eq('and stops at the next major',
    await said(KEYS.VALID, '2.0.0'), L.REASONS.CEILING);
  // A ceiling ABOVE the running major was proved here against a stored max:2
  // key previously. It is proved in two places that store nothing now —
  // the credulous verifier further down, and the minting group — for the
  // reason written where that fixture used to sit.

  // The reason 1.0.0 is the first paid build rather than 0.2.0: a key minted
  // against this tree's own version carries a ceiling of 0, and every 1.x
  // build would then refuse the people who paid first.
  eq('a major-zero key is refused by 1.0.0',
    await said(KEYS.CEILING_ZERO, '1.0.0'), L.REASONS.CEILING);
  eq('a major-zero key covers only major zero',
    await said(KEYS.CEILING_ZERO, '0.1.2'), 'ok');

  eq('a key signed by somebody else is refused',
    await said(KEYS.FOREIGN, '1.0.0'), L.REASONS.SIGNATURE);
  eq('a raised ceiling on a real signature is refused',
    await said(resealed({ v: 1, max: 9, buyer: '' }), '1.0.0'),
    L.REASONS.SIGNATURE);
  eq('a buyer name written into a real key is refused',
    await said(resealed({ v: 1, max: 1, buyer: 'example-buyer' }), '1.0.0'),
    L.REASONS.SIGNATURE);
  eq('a named key does not verify under the empty one\'s signature',
    await said(resealed({ v: 1, max: 1, buyer: '' }, KEYS.NAMED_BUYER), '1.0.0'),
    L.REASONS.SIGNATURE);
  // Edited in the middle, where every bit of the character reaches the bytes.
  // The trailing character is a different case and is asserted above, in the
  // group that reads keys, because it never gets as far as the signature.
  const sig = KEYS.VALID.split('.')[2];
  // THE SIGNED BYTES ARE THE PASTED BYTES, AND THIS IS THE CASE THAT SAYS SO.
  // A space inside the JSON parses to exactly the claim the real key carries,
  // so a verifier that checked the signature against JSON.stringify(claim)
  // would accept it — and would then accept every whitespace variant of every
  // key ever issued. Found by a mutation doing precisely that and going green:
  // every fixture here is already canonical JSON, so nothing else could tell
  // the two readings apart.
  eq('a payload respaced to the same claim is refused',
    await said(`${L.TAG}.${b64url('{"v":1, "max":1, "buyer":""}')}.${sigOf(KEYS.VALID)}`,
      '1.0.0'), L.REASONS.SIGNATURE);
  eq('and so is one with its fields reordered',
    await said(`${L.TAG}.${b64url('{"max":1,"v":1,"buyer":""}')}.${sigOf(KEYS.VALID)}`,
      '1.0.0'), L.REASONS.SIGNATURE);

  eq('an edited signature is refused',
    await said(KEYS.VALID.replace(sig,
      sig.slice(0, 20) + (sig[20] === 'A' ? 'B' : 'A') + sig.slice(21)),
    '1.0.0'), L.REASONS.SIGNATURE);
  eq('a truncated key never reaches the signature',
    await said(KEYS.VALID.slice(0, -10), '1.0.0'), L.REASONS.SHAPE);

  eq('a named buyer is unlocked like any other',
    await said(KEYS.NAMED_BUYER, '1.0.0'), 'ok');
  eq('and the name comes back for the options page to show',
    (await L.verify(KEYS.NAMED_BUYER, '1.0.0', subtle, TEST_ISSUER)).claim.buyer,
    'example-buyer');

  // ORDER MATTERS AND IS ASSERTED. A forged key with a low ceiling must be
  // refused as a forgery, not as an out-of-date purchase: the second sentence
  // tells whoever is holding it that raising one number is all that stands in
  // the way.
  eq('a foreign key with a low ceiling is refused as a forgery',
    await said(KEYS.FOREIGN.replace(KEYS.FOREIGN.split('.')[1],
      b64url(JSON.stringify({ v: 1, max: 0, buyer: '' }))), '1.0.0'),
    L.REASONS.SIGNATURE);

  const refused = await L.verify(KEYS.FOREIGN, '1.0.0', subtle, TEST_ISSUER);
  eq('a refused signature hands back no claim to read', refused.claim, null);
  const late = await L.verify(KEYS.CEILING_ZERO, '1.0.0', subtle, TEST_ISSUER);
  eq('a genuine key refused on its ceiling hands its claim back', late.claim.max, 0);

  eq('a running version that is not a version unlocks nothing',
    await said(KEYS.VALID, 'nightly'), L.REASONS.CEILING);
  eq('and neither does no version at all',
    await said(KEYS.VALID, ''), L.REASONS.CEILING);

  // WHEN THE CRYPTO ITSELF FAILS. Both of these are branches no malformed key
  // can reach — a wrong signature returns false rather than throwing — so
  // without a verifier that misbehaves on purpose, the two `catch` arms in
  // licence-core.js are code nothing has ever run. Changing either of them to
  // unlock is the cheapest possible backdoor and it would have gone unseen.
  // `subtle` is an argument for exactly this reason.
  const brokenVerify = {
    importKey: (...a) => subtle.importKey(...a),
    verify: async () => { throw new Error('verify exploded'); },
  };
  const brokenImport = {
    importKey: async () => { throw new Error('importKey exploded'); },
    verify: async () => true,
  };
  eq('a verifier that throws refuses rather than unlocks',
    (await L.verify(KEYS.VALID, '1.0.0', brokenVerify, TEST_ISSUER)).reason,
    L.REASONS.SIGNATURE);
  eq('a public key that will not import refuses rather than unlocks',
    (await L.verify(KEYS.VALID, '1.0.0', brokenImport, TEST_ISSUER)).reason,
    L.REASONS.SIGNATURE);
  eq('and hands back no claim either way',
    (await L.verify(KEYS.VALID, '1.0.0', brokenImport, TEST_ISSUER)).claim, null);

  // A verifier that says yes to everything must still not raise a key above
  // the ceiling it carries: the two checks are independent, and only one of
  // them is cryptography.
  const credulous = {
    importKey: (...a) => subtle.importKey(...a),
    verify: async () => true,
  };
  eq('a credulous verifier still cannot lift the ceiling',
    (await L.verify(KEYS.CEILING_ZERO, '1.0.0', credulous, TEST_ISSUER)).reason,
    L.REASONS.CEILING);

  // AND THE SAME INDEPENDENCE READ THE OTHER WAY, which is where the removed
  // max:2 fixture's arithmetic went. The string below is a forgery — a real
  // signature over a payload nobody signed — so `subtle` refuses it and only a
  // verifier that has stopped checking gets as far as the number. That is
  // exactly the isolation wanted: this case is about the comparison and not
  // about cryptography, and it needs no key that would unlock anything.
  eq('and a ceiling of two still covers major two',
    (await L.verify(resealed({ v: 1, max: 2, buyer: '' }), '2.0.0',
      credulous, TEST_ISSUER)).ok, true);
  eq('while the same string is refused by a verifier that checks',
    (await L.verify(resealed({ v: 1, max: 2, buyer: '' }), '2.0.0',
      subtle, TEST_ISSUER)).reason, L.REASONS.SIGNATURE);

  group('licence: the test keys and the shipped key');

  eq('a malformed key is refused as a shape', reason(KEYS.MALFORMED), L.REASONS.SHAPE);
  check('the test public key is not the shipped one', TEST_ISSUER !== L.ISSUER, 'they are the same key');
  for (const [name, key] of Object.entries({ VALID: KEYS.VALID, NAMED_BUYER: KEYS.NAMED_BUYER, CEILING_ZERO: KEYS.CEILING_ZERO })) {
    eq(`a test-signed key is refused under the shipped public key: ${name}`,
      (await L.verify(key, '1.0.0', subtle, L.ISSUER)).reason, L.REASONS.SIGNATURE);
  }
  eq('with no public key handed in, nothing unlocks',
    (await L.verify(KEYS.VALID, '1.0.0', subtle)).reason, L.REASONS.SIGNATURE);
  eq('nor with an empty one',
    (await L.verify(KEYS.VALID, '1.0.0', subtle, '')).reason, L.REASONS.SIGNATURE);
  eq('the shipped public key is the one pinned here',
    createHash('sha256').update(L.ISSUER).digest('hex'), ISSUER_SHA256);

  group('licence: keeping one');

  const store = stubStore();
  check('nothing is held to begin with', L.held(store) === '', L.held(store));
  check('a key can be kept', L.keep(KEYS.VALID, store), 'keep refused');
  eq('and comes back as it went in', L.held(store), KEYS.VALID);
  check('and can be given back', L.keep('', store), 'removal refused');
  eq('leaving nothing held', L.held(store), '');
  eq('and nothing behind it', store.size(), 0);

  eq('a store that throws holds nothing rather than breaking',
    L.held(hostileStore), '');
  check('and refuses to keep rather than breaking',
    L.keep(KEYS.VALID, hostileStore) === false, 'a throwing store reported ok');
  eq('with no DOM storage at all, nothing is held', L.held(), '');
  check('and nothing can be kept', L.keep(KEYS.VALID) === false,
    'keep succeeded without a store');

  group('licence: what this file must not contain');

  // NO GATE READS FOR A CLOCK, so this one does. A key unlocks a major
  // version and the check reads a number — an expiry would be a decision
  // nobody made, arriving as a line of code rather than as a ruling.
  const licenceSrc = fs.readFileSync(path.join(CORE, 'licence-core.js'), 'utf8');
  const code = licenceSrc.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const clock of ['Date', 'now(', 'setTimeout', 'setInterval',
    'performance']) {
    check(`the licence check reads no clock: ${clock}`,
      !code.includes(clock), `${clock} appears in licence-core.js`);
  }
  // P1 covers these over every shipped file. Asserted again here because this
  // is the one file where a network call would be a DESIGN change rather than
  // a mistake, and it should fail in the gate that explains why.
  for (const call of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource',
    'sendBeacon', 'import(']) {
    check(`the licence check cannot want a network: ${call}`,
      !code.includes(call), `${call} appears in licence-core.js`);
  }

}
