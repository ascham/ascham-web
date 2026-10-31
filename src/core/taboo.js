// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The words that never become a card.
// ============================================================
// A list of offensive words, shipped by an education product, on purpose.
//
// WHY THIS FILE EXISTS, WHICH IS NOT THE REASON A READER WILL ASSUME
// The obvious guess is that it keeps this repository's own word lists clean.
// It does that, but that is the small half. The measurement that produced this
// file runs the other way:
//
//   band 5 is defined by ABSENCE from every list, and BAND_WEIGHT puts it at
//   3.0, the top of the deck.
//
// So a slur in the article a teacher highlighted is not a word that might slip
// onto a card. It is the FIRST card, ranked above every word that was banded
// correctly, because nothing holds it and nothing holding it is exactly what
// scores highest. Six mild profanities run through the shipped pipeline all
// came back band 5, `C1+`, `isKnown: false`.
//
// Adding these words to a band would make that WORSE in one sense and better
// in none: band 3 weighs 2.0, so filing a slur as upper-intermediate vocabulary
// demotes it from first card to third and still cards it. There is no band that
// means "never". This file is that band.
//
// TWO CALLERS
//   1. The band-candidate script — a pre-filter on the SCOWL import, so no
//      candidate on this list is ever offered for review.
//   2. `harvest()` in `vocab-core.js` — no card from a word on this list, even
//      when the article carries one. It does not fail
//      soft: `harvest` throws if this file is not loaded rather than
//      build a deck that looks filtered and is not.
//
// AND A READER WHO OPENS THIS FILE IN THE SHIPPED SITE. A data file that
// nothing reads is a question a reviewer is right to ask; this is the list of
// words the page will not put on a flashcard, and it ships because the code
// that reads it does. The paragraphs above are written for that reader first.
//
// MATCHED WHOLE, AGAINST THE SURFACE FORM AND THE LEMMA, AND NEVER AS A
// SUBSTRING. `assassin` holds one of these, `classic` holds another, `cockpit`
// and `shiitake` and `Scunthorpe` hold more. Substring matching is how every
// naive profanity filter becomes a joke with the product's name in it, and the
// joke is the cheap part — the expensive part is a teacher losing `analysis`
// off a card and never learning why. Whole words only.
//
// Both forms are checked because neither alone is enough. The lemma catches the
// inflections `lemmatise` folds — -s, -ed, -ing — though NOT for free, which is
// what this paragraph said previously and is the correction worth reading
// twice: `keys()` below now folds each entry in each of those shapes and stores
// every answer, because six forms across five entries were not reachable from
// the entry's own lemma and went out unblocked. The surface catches what the
// lemmatiser does not fold at all: -er and -est are left alone by design, which
// is the same gap that lets `mushiest` through the import filter. Hence
// `blocks()` — one function, so the rule lives in one place rather than at each
// call site.
//
// AND THE ENTRIES BELOW ARE NOT THE KEYS. Measuring the first draft of this
// file against the shipped pipeline found 18 of the 66 entries that do not
// lemmatise to themselves, because the silent-e fold takes `whore` to `whor`,
// `dyke` to `dyk` and `asshole` to `asshol`. `harvest` groups by that key, so
// the plural `whores` arrives with surface `whores` and lemma `whor` and
// matches NEITHER the written entry nor itself. The filter would have shipped
// with a hole exactly the width of an -s, in the entries most worth blocking.
//
// So each entry is folded through the SHIPPED lemmatiser — never a copy of it,
// on the same reasoning as everywhere else in this repository — and both
// branches of the fold are stored, since `foldSilentE` keeps the -e when the
// base is held and drops it when it is not, and this file cannot know which
// predicate its caller will be holding. Built on first use, not at load. In the
// extension that kept the order of the script tags free; as an ES module it is
// what makes the import cycle with vocab-core.js safe (see the imports above).
//
// WHAT IS ON THE LIST, AND THE ASYMMETRY THAT DECIDES IT
// A false positive costs one missing card, out of thirty, from a word we would
// rather not have carded anyway. A false negative puts a slur on a flashcard in
// a classroom. Those are not comparable costs, so a genuinely borderline word
// goes ON the list — but "borderline offensive" is the test, not "borderline
// useful", and the section below is where the words that failed the other test
// are recorded by name.
//
// THIS IS NOT A POLITENESS FILTER. `idiot`, `moron`, `imbecile`, `bastard`,
// `damn` and `hell` are insults or oaths, not slurs, and a teacher reading a
// news article can handle a card for any of them. A list that grows to cover
// rudeness stops being auditable and starts producing the false positives
// above. The bar is: a word a teacher could not put in front of a class.
//
// DELIBERATELY SMALL. This is a floor, not a coverage attempt, and it cannot
// become one: offensiveness is contextual, English borrows freely, `BANDABLE`
// admits any `^[a-z]+$` so a slur in another language passes an English list,
// and NO CHECK CAN PROVE A BLOCKLIST COMPLETE — completeness has no oracle, and
// a check that cannot fail is decoration. That is why no public claim ships
// with this file. A procedural claim ("the product carries a written list and
// makes no card from any word on it") is holdable but not made. An absolute
// one would be a claim no check can hold, made on purpose.
//
// PROVENANCE, which matters for licensing for the same reason `wordlist.js`'s
// does. Written by hand for this project from the published categories of slur
// and obscenity, and read line by line. It is NOT a copy of any distributed
// blocklist: SCOWL's own `misc/` taboo list is not in the Debian package and
// no version of it will bring one, the community lists carry their own licences
// and their own errors, and a blocklist nobody has audited is the wrong thing
// to trust with this job. Do not paste one in.
//
// HOW TO ADD A WORD. Put it in the group it belongs to, alphabetically, and
// re-run the import — the refusals file names what it caught, and that file is
// how this list grows. Removing a word is the move that needs a reason written
// down: record it in NOT ON THIS LIST below, so the next reader does not add it
// back.
//
// COMPOUNDS ARE ALREADY REFUSED AND ARE NOT MISSING. `harvest` tests `BANDABLE`
// before anything else, so a hyphenated or spaced slur cannot reach a card by
// any route. Single `a-z` words only, which is a fact about the pipeline rather
// than a gap in the list.
//
// NEVER A CSV COLUMN. `csv-core.js` does not see this file and must not: a
// blocklist exported into a classroom deck is precisely the failure it exists
// to prevent. It is not vocabulary, it is not a band, and it is not levelled.
//
// An ES module (the web app). The extension loaded it as a classic script and
// published it on `globalThis`; the logic below is unchanged by the move.
// ============================================================

'use strict';

// vocab-core imports this file and this file imports vocab-core. The cycle is
// safe because neither reads the other at load: `fold` runs on first lookup.
import * as Vocab from './vocab-core.js';
import * as Words from './wordlist.js';

// ------------------------------------------------------------
// RACIAL, ETHNIC AND RELIGIOUS SLURS
//
// The category this file was written for. Every entry here is a word whose
// only current use is contempt for a group of people.
//
// `coon` has an innocent homograph — an animal. It is on the list anyway, by
// the asymmetry above: that reading is a word we would card reluctantly at
// best, and the other reading is unrecoverable. `spade` is NOT here — see NOT
// ON THIS LIST. `jap` and `spic` are not here either, but for a different
// reason entirely — see SURFACE-ONLY ENTRIES below.
// ------------------------------------------------------------
const SLURS_ETHNIC = `
  chink coon dago darkie gook gyppo halfcaste jigaboo kike
  nigga nigger paki pickaninny raghead redskin sambo squaw
  towelhead wetback wog wop
`;

// ------------------------------------------------------------
// SLURS FOR SEXUAL ORIENTATION AND GENDER IDENTITY
//
// `fag` is a cigarette in British English and this list blocks it regardless.
// That is a known, accepted false positive: it costs a British teacher one card
// for a word their students already know from context, and the alternative is
// the slur reading reaching a deck because the innocent one exists.
//
// `queer` and `fairy` are NOT here — see NOT ON THIS LIST.
// ------------------------------------------------------------
const SLURS_IDENTITY = `
  bulldyke dyke fag faggot homo poof poofter shemale tranny trannie
`;

// ------------------------------------------------------------
// DISABILITY SLURS
//
// `spastic` is a live clinical term in `spastic paralysis` and a playground
// slur in British English, and the pipeline cannot tell which article it came
// from. Blocked, on the asymmetry.
//
// `cripple` is NOT here — see NOT ON THIS LIST.
// ------------------------------------------------------------
const SLURS_DISABILITY = `
  mongoloid retard retarded spastic spaz
`;

// ------------------------------------------------------------
// OBSCENITY
//
// The words a teacher could not read aloud to a class, as opposed to the words
// they would rather not. The line is drawn at the top of this file and these
// are the ones above it.
// ------------------------------------------------------------
const OBSCENITY = `
  arsehole asshole bollocks bullshit cocksucker cunt fuck fucker
  fucking motherfucker shit shite twat wanker
`;

// ------------------------------------------------------------
// EXPLICIT SEXUAL VOCABULARY
//
// Narrower than it looks, and deliberately. Sex education is a subject taught
// in English and its vocabulary is not on this list; what is here is the
// pornographic register, which no reading task needs.
//
// `cock`, `dick`, `pussy` and `hooker` are NOT here — see below.
// ------------------------------------------------------------
const SEXUAL = `
  blowjob creampie cumshot dildo felching gangbang handjob jizz
  rimjob slut titfuck whore
`;

// ------------------------------------------------------------
// SURFACE-ONLY ENTRIES, AND THE MEASUREMENT THAT PRODUCED THEM
//
// Two entries are matched against the written word alone and never against the
// lemma key, because their key belongs to an innocent word as well.
//
// The silent-e fold takes `spice` to `spic` and `jape` to `jap` — the fold is
// correct, that is its job, and the two words genuinely collapse together. A
// key match on `spic` therefore blocks `spice`, `spiced`, `spices` and
// `spicing`, which is a food article losing its subject; on `jap` it blocks
// `jape`, `japed`, `japes` and `japing`.
//
// FOUND BY RUNNING IT, NOT BY READING IT. The first draft of this file shipped
// both collisions. The band-candidate script refused `spice` on its first
// real run and wrote it to the refusals file, which is precisely the reason
// that file exists — the whole SCOWL corpus was then swept against this filter
// and 103 dictionary words came back blocked, of which exactly these eight were
// innocent. The other 95 are the slurs and their inflections.
//
// The cost of the fix is that inflections must be written out by hand for these
// two, since the lemma key is what caught inflections for free everywhere else.
// Each is paired with the word it collides with, so the pairing can be checked
// rather than believed: if `lemmatise` ever stops folding these together, the
// exemption is dead and a check can say so. An exemption that outlives what it
// excused is a hole nobody re-reads.
// ------------------------------------------------------------
const SURFACE_ONLY = new Map([
  ['jap', 'jape'],
  ['japs', 'jape'],
  ['spic', 'spice'],
  ['spics', 'spice']
]);

// ------------------------------------------------------------
// NOT ON THIS LIST, AND WHY
//
// The half of a blocklist nobody writes down, which is why every blocklist
// acquires the same arguments twice. A word leaves this file by being added
// here with a reason, never by being quietly deleted.
//
//   queer      standard academic register — `queer theory`, `queer history` —
//              and reclaimed in ordinary use. An article about LGBT rights is
//              exactly the kind of text a teacher brings to a class, and losing
//              its central term would be a visible defect
//   fairy      `fairy tale` is in every graded reader ever printed, and this
//              is an ELT product. The homophobic sense is dated and the
//              collision is not — the same shape as `cripple` below, and the
//              one entry the first draft got wrong
//   spade      a garden tool, a suit of cards, and an idiom about calling one.
//              Named in the ethnic-slur note above as a homograph and then not
//              listed, which was an inconsistency between a comment and its
//              data; resolved here, in favour of the tool
//   cripple    an ordinary verb in news English: `crippled the economy`,
//              `crippling debt`. The noun is offensive and the verb is
//              unremarkable, and blocking the lemma blocks both
//   cock       a rooster, a tap, and a verb meaning to tilt. Three innocent
//              readings against one vulgar noun that is not a slur
//   dick       a given name before anything else, and `PROPER_NOUNS` is the
//              wrong list for it too. The vulgar reading is an insult, not a
//              slur
//   pussy      a cat, and a word children's books use. The vulgar reading is
//              vulgar; it is not what this file is for
//   hooker     a rugby position and a surname. `whore` carries the sense that
//              matters without the collisions
//   ass        a donkey, and a whole-word block would still be right if that
//              were all — but `arse` and `asshole` carry the abusive senses and
//              `ass` alone is the one that reads as squeamishness
//   idiot      insults, not slurs — see the bar set at the top of this file
//   moron      "
//   imbecile   "
//   bastard    "
//   damn       oaths, not slurs. `damn` and `hell` are band-1 vocabulary in any
//              case and were never going to be carded
//   hell       "
//   negro      historical register rather than current abuse, and it appears in
//              the primary texts an English class reads — the Civil Rights
//              speeches most of all. Kept off deliberately; revisit if a real
//              deck ever surfaces it
//   bitch      a female dog, an ordinary verb, and a common insult. Sits on the
//              line; kept off because the innocent readings are frequent and
//              the abusive one is an insult rather than a slur
//
// ELEVEN OF THOSE ARE NOW ALSO ON A SECOND LIST, AND ARE STILL OFF THIS ONE.
// `BORDERLINE` below is the young-learner tier. It does not
// move a single word onto the floor and is not consulted unless a teacher asks
// for it: every argument above is still the reason the FREE deck keeps these
// words. What the tier says is narrower — that a class of nine-year-olds does
// not need `cocked` badly enough to risk the other reading — and it is a
// teacher's call about their own room, which is why it is a switch and not an
// edit to the list above.
//
// FOUR ARE DELIBERATELY NOT ON IT EITHER. `fairy` and `spade` are exactly the
// vocabulary a young class is reading — fairy tales and garden tools — so a
// tier aimed at that class is the last place either belongs. `cripple` is an
// ordinary verb whose noun is offensive at every age, which makes it a floor
// question or nothing. `queer` is the one that is a judgement rather than a
// measurement: the academic and reclaimed senses are the current ones, and a
// tier that hides the central word of an article about LGBT rights from a
// young class has not protected them from anything, it has taught them
// something else. `damn` and `hell` are absent for a duller reason — both are
// band 1, no band-1 word has ever reached a card, and a list entry that cannot
// fire is decoration.
// ------------------------------------------------------------

// `splitEntries` and not `splitWords`, which is what it was called previously
// and is what wordlist.js calls its own identical copy. In the
// extension both loaded on the popup as top-level function declarations in
// one shared scope, so the second silently replaced the first and every caller
// in wordlist.js was resolving to this file's copy. It happened to be harmless
// — the two bodies are the same line — but that was luck rather than design,
// and it went unnoticed for two days. ES modules do not share a scope, so the
// two copies can no longer collide; the distinct name stays.
function splitEntries(blob) {
  return blob.split(/\s+/).filter(Boolean);
}

// Every written word, in one set, matched against the surface form. The groups
// are for the reader; nothing downstream knows which group a word came from,
// and nothing should — a word blocked for one reason is blocked.
const TABOO = new Set([
  ...splitEntries([
    SLURS_ETHNIC, SLURS_IDENTITY, SLURS_DISABILITY, OBSCENITY, SEXUAL
  ].join(' ')),
  ...SURFACE_ONLY.keys()
]);

// ------------------------------------------------------------
// THE YOUNG-LEARNER TIER — a second list, above the floor, off by default
//
// Everything here is argued OFF the floor in the section above, and stays off
// it. The floor is what every free copy applies and it does not
// move; this is what a teacher can add on top for a young class, and the whole
// difference between the two is who is in the room.
//
// IT IS AN ADDITION AND CAN ONLY EVER BE ONE. `borderline()` is a separate
// predicate from `blocks()` rather than a mode inside it, so there is no
// argument, no falsy default and no misread setting that can make this file
// block LESS than it blocks today. A tier that could subtract would be a
// blocklist with a difficulty setting, which this is not.
//
// WHY EACH ONE, WHERE IT DIFFERS FROM THE ARGUMENT ABOVE
//   ass        a donkey — and a nine-year-old reading `asses` aloud is the
//              whole of the objection. The floor's reason ("reads as
//              squeamishness") is an argument about adults
//   bastard    an insult and not a slur, which is the floor's bar. A primary
//              classroom has a lower one
//   bitch      a female dog. The innocent reading is frequent, and the class
//              that meets it here is the class least able to keep the two apart
//   cock       a rooster, a tap, a verb meaning to tilt. Three innocent
//              readings that a young deck can afford to lose
//   dick       a given name. Costs the class nothing to lose
//   hooker     a rugby position and a surname. Same
//   idiot      playground insults. The floor declines them because they are not
//              slurs; a young-learner deck declines them because teaching a
//              child the word is the opposite of the point
//   imbecile   "
//   moron      "
//   negro      historical register that a young class meets without the history
//              that explains it. The floor keeps it for the Civil Rights texts
//              an older class reads, which is exactly the class this is not
//   pussy      a cat, and a word children's books use. That is the argument for
//              keeping it on the floor and against keeping it here: the
//              children's book is not the risk, the other reading is
// ------------------------------------------------------------
const BORDERLINE_ENTRIES = `
  bastard bitch cock dick idiot imbecile moron negro pussy
`;

// MEASURED, NOT REASONED ABOUT, and the measurement changed the list. Both of
// these were written as ordinary entries first; sweeping the candidate keys
// against the 111,593 lower-case words in SCOWL — the same corpus and the same
// question that refused `spice` on the floor — brought back six innocent words.
//
//   ass     lemmatises to `as`, by the -s stripper. `as` is one of the
//           commonest words in English
//   hooker  lemmatises to `hook`, taking `hooks`, `hooked` and `hooking` with
//           it. A fishing article loses its subject, which is the `spice`
//           failure exactly, one list down
//
// So both are matched against the written word alone, and their inflections are
// written out by hand — the same trade the floor makes for `jap` and `spic`,
// and for the same reason: the key is what caught inflections for free
// everywhere else. Each is paired with the word it collides with so the pairing
// can be checked rather than believed. Re-swept after the fix: 25 words
// blocked, every one an entry or an inflection of one, and `as`, `hook`,
// `hooked`, `hooking` and `hooks` all free.
const BORDERLINE_SURFACE_ONLY = new Map([
  ['ass', 'as'],
  ['asses', 'as'],
  ['hooker', 'hook'],
  ['hookers', 'hook']
]);

const BORDERLINE = new Set([
  ...splitEntries(BORDERLINE_ENTRIES),
  ...BORDERLINE_SURFACE_ONLY.keys()
]);

// THE KEYS, which are the entries plus what the lemmatiser does to them, less
// the two that would take an innocent word with them.
//
// See the note at the top: `whore` files as `whor`, so a set of the written
// entries alone lets every -e slur through in the plural. Both fold branches
// are stored because `foldSilentE` answers differently depending on the
// caller's `isHeld`, and a filter that is only correct for one of two callers
// is a filter nobody can reason about.
//
// It THROWS rather than falling back to the literal entries. A blocklist that
// quietly degrades when its dependency is missing is worse than no blocklist:
// the product would keep running, the cards would keep coming, and the one
// thing this file exists to prevent would be back with nothing to notice it.
// Since the port the imports are static, so a missing wordlist.js or
// vocab-core.js stops the page at load and this guard is not reached; it stays.
//
// ONE BUILDER, TWO LISTS. The floor and the young-learner
// tier fold identically and must keep folding identically — a tier built by a
// second copy of this loop would drift the day one of them learns something,
// and the thing it would learn is the -ie hole below, which took a measurement
// to find once already.
function fold(words, exempt) {
  const V = Vocab;
  const W = Words;
  if (!V || !W) {
    throw new Error(
      'taboo.js: wordlist.js and vocab-core.js must be loaded first. ' +
      'This filter folds its own entries through the shipped lemmatiser and ' +
      'refuses to answer from a half-loaded page.');
  }
  const never = () => false;
  const built = new Set();
  for (const w of words) {
    if (exempt.has(w)) continue;
    built.add(w);
    // THE INFLECTIONS ARE FOLDED, NOT ASSUMED. The note above says the lemma
    // catches -s, -ed and -ing "for free"; the harvest gate
    // measured that claim for the first time and found five forms it does not.
    // `darkie` and `creampie` end in -ie, so `lemmatise` reads the plural under
    // the -ies → -y rule and files `darkies` as `darky`, which is not this
    // entry, not its fold, and not on this list. `pakis` folds to itself
    // because the -s stripper declines after a vowel. `jizzed` and `jizzing`
    // survive the same way past a doubled consonant. That is the -e hole this
    // file was built to close, one letter over, and it was invisible until a
    // check ran the words through `harvest` instead of reasoning about them.
    //
    // So each entry is put through the lemmatiser in each of its inflected
    // shapes and every answer is stored. Six keys are added, none of which is
    // an innocent English word — the three SCOWL knows (`darky`, `jiz`,
    // `pakis`) are spelling variants of the slurs themselves, and no band list
    // holds any of the six. Generated rather than written out by hand, so an
    // entry added tomorrow gets the same treatment without anybody remembering.
    //
    // SURFACE_ONLY is skipped above and must stay skipped: `japed` and `spiced`
    // fold to `jape` and `spice`, so an inflection loop over those entries would
    // block two ordinary verbs. That exemption is checked from both sides in
    // tests/logic.test.js § the blocklist.
    for (const form of [w, `${w}s`, `${w}ed`, `${w}ing`]) {
      built.add(V.lemmatise(form, W.isKnown, W.isKnown));
      built.add(V.lemmatise(form, never, never));
    }
  }
  return built;
}

let KEYS = null;
function keys() {
  if (!KEYS) KEYS = fold(TABOO, SURFACE_ONLY);
  return KEYS;
}

let BORDERLINE_KEYS = null;
function borderlineKeys() {
  if (!BORDERLINE_KEYS) {
    BORDERLINE_KEYS = fold(BORDERLINE, BORDERLINE_SURFACE_ONLY);
  }
  return BORDERLINE_KEYS;
}

// THE ONE ENTRY POINT, and the only predicate exported.
//
// Both forms, in one place, for the reason given at the top: the lemma catches
// the folded inflections and the surface catches what the fold does not — the
// -er/-est forms, and the two collisions above. There is deliberately no
// exported "is this word taboo?" taking a single argument. A call site holding
// only half of the test is a hole invisible from the call site, and the half
// that would get used is whichever one is shorter to type.
//
// Case is folded here rather than at the call sites, because the two callers
// hold their words at different stages: the import reads raw list lines and
// `harvest` holds tokens straight off the page. A filter with a capital letter
// as its bypass is not a filter.
function blocks(surface, lemma) {
  const s = typeof surface === 'string' && TABOO.has(surface.toLowerCase());
  const l = typeof lemma === 'string' && keys().has(lemma.toLowerCase());
  return s || l;
}

// THE TIER'S PREDICATE, and it answers about the tier ALONE.
//
// It does not fall through to `blocks()` and must not. A caller asking this
// question is asking "would a young-learner class also refuse this word", and a
// caller that needs the whole answer asks both — which is the shape `harvest`
// uses, in that order, so the floor is consulted whatever the tier says. Wiring
// the floor in here would read as convenience and would mean the tier's
// predicate could be swapped for the floor's by a caller who wanted one call
// instead of two. Two questions, two functions, and the floor is never the one
// that can be left out.
function borderline(surface, lemma) {
  const s = typeof surface === 'string' && BORDERLINE.has(surface.toLowerCase());
  const l = typeof lemma === 'string'
    && borderlineKeys().has(lemma.toLowerCase());
  return s || l;
}

// `TABOO` is exported for the gate, which synthesises its own input by
// iterating this set — so the check covers every entry, follows the list as it
// grows, and puts no fixture of slurs anywhere else in the repository.
// `SURFACE_ONLY` is exported so the same gate can assert both halves of each
// pair: the innocent word is not blocked, and the collision that justified the
// exemption is still real.
//
// `BORDERLINE` and `BORDERLINE_SURFACE_ONLY` are exported on the same terms as
// the two above them, and the gate uses them for a third thing neither of those
// needs: asserting that the tier and the floor do not overlap. A word on both
// lists would be a word every copy already refuses, offered again as Pro.
export {
  TABOO, SURFACE_ONLY, blocks,
  BORDERLINE, BORDERLINE_SURFACE_ONLY, borderline
};
