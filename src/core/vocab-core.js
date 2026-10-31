// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Vocabulary core.
// ============================================================
// A passage in, a ranked list of teachable words out, each carrying the real
// sentence it came from.
//
// ORDER MATTERS HERE, AND IT IS NOT OBVIOUS.
// Sentences must be segmented BEFORE words are judged. The proper-noun test is
// "is this capitalised mid-sentence?", and mid-sentence is not a fact about a
// word — it is a fact about where sentences begin. Run word selection first
// and every sentence-initial word looks like a name.
//
// WHAT COMES FROM WHERE
// The page hands us the full text the teacher highlighted inside, plus the character range they actually selected. Context sentences
// are drawn from the WHOLE block; candidate words only from the SELECTED
// range. That is what stops a highlight ending mid-sentence from putting a
// fragment on the back of a card.
//
// Imports sentence-core.js and taboo.js. wordlist.js reaches it through the
// options its caller passes (`bandOf`, `isKnown`, `isName`), as before.
// ============================================================

'use strict';

import * as Sentences from './sentence-core.js';
import * as Taboo from './taboo.js';

// ------------------------------------------------------------
// IRREGULARS
//
// Surface form -> lemma, for the words no suffix rule reaches. Only forms that
// actually occur in prose; a full irregular-verb table would be mostly dead
// weight. Regular inflections are handled by lemmatise's rules below.
// ------------------------------------------------------------
const IRREGULAR = new Map(Object.entries({
  // nouns
  children: 'child', men: 'man', women: 'woman', people: 'person',
  teeth: 'tooth', feet: 'foot', geese: 'goose', mice: 'mouse',
  lives: 'life', wives: 'wife', knives: 'knife', leaves: 'leaf',
  halves: 'half', shelves: 'shelf', wolves: 'wolf', thieves: 'thief',
  // scarves, selves and stigmata stay HERE and are not folded into the plural
  // rules added, and the reason is a measurement rather than taste.
  // A `-ves` -> `-f`/`-fe` rule has to sit above the plain `-s` rule to be
  // reachable at all — `saves` is answered by `save` long before anything below
  // could see it — and up there it claims `saves` -> `safe`. Both are band
  // entries, so the dictionary guard that makes every other rule in this file
  // safe cannot separate them, and the commoner reading loses. `deaves` -> `deaf`
  // fails the same way. Of the 14 attested `-ves` forms a bare rule would fire
  // on, half are wrong. `-ata` is the opposite problem: safe, and a population
  // of one. `beeves` is deliberately absent — this map's rule is forms that
  // occur in prose, and it does not.
  scarves: 'scarf', selves: 'self', stigmata: 'stigma',
  criteria: 'criterion', phenomena: 'phenomenon',
  // "data" is deliberately NOT mapped to "datum". Modern prose treats it as a
  // mass noun, the bands hold "data", and mapping it would send every
  // occurrence to a lemma no list contains.
  analyses: 'analysis', hypotheses: 'hypothesis', theses: 'thesis',
  crises: 'crisis', bases: 'basis', indices: 'index', matrices: 'matrix',
  media: 'medium', bacteria: 'bacterium', curricula: 'curriculum',
  // verbs
  was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be',
  had: 'have', has: 'have', did: 'do', does: 'do', done: 'do',
  went: 'go', gone: 'go', made: 'make', said: 'say', took: 'take',
  taken: 'take', came: 'come', saw: 'see', seen: 'see', got: 'get',
  gave: 'give', given: 'give', found: 'find', thought: 'think',
  told: 'tell', became: 'become', left: 'leave', felt: 'feel',
  brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep',
  held: 'hold', wrote: 'write', written: 'write', stood: 'stand',
  heard: 'hear', let: 'let', meant: 'mean', met: 'meet', ran: 'run',
  paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak', lay: 'lie',
  led: 'lead', grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall',
  fallen: 'fall', sent: 'send', built: 'build', understood: 'understand',
  drew: 'draw', drawn: 'draw', broke: 'break', broken: 'break',
  spent: 'spend', rose: 'rise', risen: 'rise', driven: 'drive',
  drove: 'drive', bought: 'buy', chose: 'choose', chosen: 'choose',
  sought: 'seek', taught: 'teach', caught: 'catch', dealt: 'deal',
  arose: 'arise', arisen: 'arise', shown: 'show', knew: 'know',
  known: 'know', threw: 'throw', thrown: 'throw',
  // Added after a real article put "fought" on a deck as ~C1+.
  // Every one of these was scoring band 5 — the absence band, which carries
  // the HIGHEST weight — while its base form sits in band 1 or 2. So the
  // strong verbs, which are exactly the commonest verbs in English, were the
  // ones most likely to be offered as advanced vocabulary. Found by asking of
  // a list of ordinary irregular forms what INVARIANT 2 asks of the bands.
  fought: 'fight', won: 'win', fled: 'flee', sold: 'sell',
  rode: 'ride', ridden: 'ride', wore: 'wear', worn: 'wear',
  tore: 'tear', torn: 'tear', swore: 'swear', sworn: 'swear',
  borne: 'bear', struck: 'strike', stuck: 'stick', swung: 'swing',
  hung: 'hang', sang: 'sing', sung: 'sing', rang: 'ring', rung: 'ring',
  drank: 'drink', drunk: 'drink', sank: 'sink', swam: 'swim', swum: 'swim',
  flew: 'fly', flown: 'fly', blew: 'blow', blown: 'blow',
  froze: 'freeze', stole: 'steal', stolen: 'steal',
  slept: 'sleep', wept: 'weep', crept: 'creep', swept: 'sweep',
  burnt: 'burn', learnt: 'learn', dreamt: 'dream', knelt: 'kneel',
  lent: 'lend', bent: 'bend', spun: 'spin', shrank: 'shrink',
  bitten: 'bite', hid: 'hide', hidden: 'hide',
  forgot: 'forget', forgotten: 'forget', forgave: 'forgive',
  withdrew: 'withdraw', withdrawn: 'withdraw', overcame: 'overcome',
  undertook: 'undertake', undertaken: 'undertake',
  // "bit" and "bore" are DELIBERATELY absent. Both are commoner in prose as
  // something other than a past tense — "a bit of", "bore the cost" against
  // "a bore" — and mapping them would misread the frequent sense to rescue
  // the rare one. A wrong lemma is worse here than a missing one, because the
  // missing one merely fails to improve the band.
  // modifiers
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  more: 'much', most: 'much', less: 'little', least: 'little',
  further: 'far', furthest: 'far', farther: 'far'
}));

// Words whose -s or -ing form must not be stripped, because the result is a
// different word. Without this, "news" becomes "new" and "during" becomes
// "dur". Short list on purpose — these are the ones that actually collide.
const NO_STRIP = new Set([
  'news', 'always', 'perhaps', 'series', 'species', 'analysis', 'basis',
  'crisis', 'thesis', 'gas', 'bus', 'plus', 'thus', 'less', 'unless',
  'during', 'nothing', 'something', 'anything', 'everything', 'morning',
  'evening', 'spring', 'string', 'thing', 'king', 'ring', 'wing', 'ceiling',
  'being', 'meaning', 'building', 'feeling', 'finding', 'reading',
  'writing', 'training', 'warning', 'housing', 'funding', 'ranking',
  'this', 'his', 'us', 'its', 'as', 'was', 'has', 'is', 'yes', 'class',
  'process', 'access', 'business', 'address', 'press', 'across', 'loss',
  'glass', 'mass', 'pass', 'cross', 'success', 'illness', 'witness',
  // Singular nouns ending -ics. These CANNOT be handled by a rule, because
  // "topics" and "critics" are genuine plurals of the same shape — only a list
  // separates them. Missing one is not cosmetic: the lemma "politic" matches
  // nothing in the bands, so a band-1 word is scored as though it were rare.
  'politics', 'physics', 'economics', 'statistics', 'mathematics', 'ethics',
  'logistics', 'athletics', 'genetics', 'linguistics', 'electronics',
  'dynamics', 'mechanics', 'aesthetics', 'semantics', 'diabetes',
  // Words the suffix rules mangle into non-words. Found by asserting that
  // every band entry's own lemma is a known word — see logic.test.js. Each of
  // these was scoring a common word as band 5 before it was listed.
  'whereas', 'towards', 'sometimes', 'hundred', 'bias', 'clothes',
  'ourselves', 'yourselves', 'themselves', 'tired',
  // -ing forms that are prepositions or adjectives, not inflections.
  'underlying', 'preceding', 'according', 'regarding', 'concerning',
  'outstanding', 'surrounding', 'remaining', 'existing', 'leading',
  'growing', 'increasing', 'declining', 'emerging',
  // Verbs whose stem simply ends -ee. The -ed rule ate the wrong two letters
  // and turned every one of these into a non-word: "speed" became "spe", so
  // any article about a speed limit scored it band 5 and offered it as
  // vocabulary. Latent since the first build, and invisible until bands 2 and
  // 3 put these words in a list that INVARIANT 2 checks.
  'speed', 'breed', 'succeed', 'exceed', 'proceed', 'indeed', 'sacred',
  // The same class, found when the -ed floor dropped from a
  // three-character stem to two. Three of these were ALREADY broken and had
  // simply never been looked for: "greed" became "gre", "creed" "cre",
  // "bleed" "ble". The other five only became reachable with the lower floor,
  // and they are worse, because a two-letter stem is far likelier to be a real
  // word than a three-letter one — "shed" became "she", "heed" became "he",
  // "weed" became "we". A rule cannot separate these from "used" and "aged",
  // which the same floor exists to fix; only a list can.
  'greed', 'creed', 'bleed', 'deed', 'reed', 'feed', 'seed', 'heed',
  'weed', 'shed',
  // Plural-only nouns, and singulars the -s rule mistakes for plurals.
  'jeans', 'trousers', 'scissors', 'proceeds', 'ethos', 'overseas',
  'upstairs', 'downstairs', 'afterwards', 'onwards', 'upwards',
  // -ing and -ed forms that are the adjective, not an inflection of a verb we
  // would rather match. "boring" is not "bore"; "complicated" is not
  // "complicate" in the sense a reader meets it.
  // `grueling` is the American spelling of the entry beside it, added
  // with the dialect table in wordlist.js. Its partner has been on
  // this line since the list was written, and the American form needed the same
  // protection for the same reason and did not have it: `gruelling` undoubles
  // to `gruel`, and `grueling` reaches the plain stem `gruel` directly, so the
  // one spelling was held and the other was reduced to a word no band holds.
  // A pairing that survives to bandOf is worth nothing if the lemmatiser has
  // already taken the key apart — INVARIANT 9 checks the whole table for this
  // and `grueling` is the one entry of 54 it caught.
  'amazing', 'boring', 'fleeting', 'fluctuating', 'gruelling', 'grueling',
  'impending',
  'pending', 'proceeding', 'reckoning', 'lightning', 'pudding', 'wedding',
  'staggering', 'stunning', 'thrilling', 'overwhelming', 'scathing',
  'belated', 'complicated', 'disabled', 'embarrassed', 'flawed', 'fragmented',
  'outdated', 'sophisticated', 'unprecedented', 'unrelenting', 'unresolved',
  'unwarranted', 'wicked', 'watershed',
  // Nouns that merely END -ing. The rule strips it and leaves half a verb:
  // "wrongdoing" became "wrongdo". Caught by INVARIANT 2 the moment the
  // derived-forms lists put them in a band.
  'wrongdoing', 'building', 'meaning', 'ceiling', 'evening', 'morning',
  // PROPER NOUNS THE SUFFIX RULES MANGLE. Same failure as the block above and
  // a different set, found by asking of the proper-noun list what INVARIANT 2
  // asks of the bands: does the entry survive its own lemmatiser?
  //
  // It did not, for people, since the day that list was written. "Charles"
  // reduced to `charle`, "James" to `jame`, "Thomas" to `thoma` — three of the
  // commonest names in English news, sitting in the list, matching nothing.
  // "Alfred" and "Jared" were eaten by the -ed rule and "Aisling" by -ing.
  //
  // These are strings the rules break, which is precisely what this set holds;
  // that they happen to name people and countries changes nothing about the
  // rule that mishandles them.
  'aisling', 'alfred', 'anders', 'carlos', 'charles', 'dolores', 'douglas',
  'honduras', 'james', 'jared', 'laos', 'lars', 'lucas', 'mathias',
  'mercedes', 'mildred', 'mohamed', 'mohammed', 'nicholas', 'thomas',
  'tobias', 'tomas', 'wilfred', 'winifred'
]);

// ------------------------------------------------------------
// LEMMATISE
//
// THE SILENT-E PROBLEM, AND WHY THERE IS A DICTIONARY ARGUMENT
// English drops a silent 'e' before -ing and -ed, so "increase" becomes
// "increased" and "hope" becomes "hoping". But "gerrymander" becomes
// "gerrymandering" and "offer" becomes "offered", with no 'e' involved. The
// two are orthographically identical — stem ending in vowel+consonant, either
// way — and no spelling rule separates them. Every heuristic I tried was wrong
// in one direction or the other: restore the 'e' and you get "gerrymandere",
// withhold it and you get "increas".
//
// So the ambiguity is resolved by ASKING. `isKnown` is a membership test over
// the word bands; when a candidate lemma is a word we know, it wins.
//
// This is not circular, though it looks it. `isKnown` asks "is this a word at
// all", across both bands at once. bandOf later asks "which band" — a
// different question of the same data.
//
// AND WHEN THE DICTIONARY DOES NOT KNOW, IT DOES NOT MATTER.
// A word absent from both bands is band 5 whatever lemma we settle on, and the
// card FACE shows the word as it appeared, never this key. So the
// lemma's only remaining job is to be stable, so that two occurrences of one
// word deduplicate. The fallback therefore takes the plain stem and stops
// guessing — predictable beats clever when nothing is riding on it.
//
// THAT PARAGRAPH NAMED THE RIGHT GOAL AND THE CODE BELOW IT MISSED.
// Stability was read as "the same input always gives the same output", which
// the fallback does achieve. The goal actually stated is deduplication — two
// occurrences of ONE WORD landing on one key — and the fallback does not
// achieve that, because the base form never enters the suffix loop at all:
//
//   parse -> parse      parsed -> pars      parsing -> pars      parses -> pars
//
// Four forms of one word, two keys, and the grouping key is what harvest
// counts and scores by. A passage using "parse" six times exported TWO cards,
// "parsed" at 4 uses and "parse" at 2. Measured across this repo's own prose:
// 26 words split in two, 87 tokens filed on the wrong side of a split, and 4
// words that clear the 3-use bar only when joined — cards that should exist
// and did not.
//
// It reaches exactly the words the bands decline, because restoration is
// confirmed BY the bands: of 877 in-band bases ending in -e, 9 fail to restore;
// of 5,939 off-list ones, all 5,939 do. Band 5 is precisely the set isKnown
// says no to, so the rule was unreachable for its own subject.
//
// THE FOLD, and why it goes forward rather than back.
// The 'e' cannot be restored — that is the ambiguity above, and it is real.
// But it can be removed from BOTH sides. foldSilentE does that, after every
// rule below has had its say, so the base is reduced the same way its own
// inflections already were. The key gets uglier and correct: "pars" is not a
// word, and nothing requires it to be one, because this key is never shown.
//
// `isKnown` is optional: without it the fallback path is used throughout,
// which keeps this function testable on its own. The fold is skipped in that
// mode — with no lists to consult it cannot tell a foldable word from a name.
// ------------------------------------------------------------
function reduce(word, isKnown) {
  const w = String(word || '').toLowerCase();
  if (w.length < 3) return w;

  const irr = IRREGULAR.get(w);
  if (irr) return irr;
  if (NO_STRIP.has(w)) return w;

  const known = typeof isKnown === 'function' ? isKnown : () => false;

  // THE THREE PLURAL RULES ASK THE DICTIONARY, FOR THE REASON -ing AND -ed DO.
  //
  // They used to strip on the spelling alone, and the spelling does not carry
  // the answer. "boxes" and "cases" end in the same three letters and lose a
  // different number of them; nothing in the string says which. Guessing cost
  // 100 band entries: `case` is band 1 and `cases` scored band 5,
  // `promise` is band 1 and `promises` scored band 5, and the same for
  // `houses`, `causes`, `courses`, `increases`, `senses`, `chooses`.
  //
  // A band-5 lemma is a card at weight 3.0, the top of the deck, so every one
  // of those was not merely mis-levelled — it outranked the words that reduced
  // correctly. And the review table shows the surface form, so a teacher saw
  // "cases" badged ~C1+ and never saw the lemma "cas" that put it there.
  // Nothing looked broken; it looked like bad judgement about vocabulary.
  //
  // The fix is the one already used below: propose the candidates in order and
  // let the bands choose. Where they decline both, the old behaviour stands —
  // for a word no band holds the lemma is unreachable either way, and
  // stability is then the only property that matters.
  //
  // logic.test.js asserts this over every entry, both directions, as the
  // general form of the invariant that was already stated for IRREGULAR.

  // -ies -> -y : studies -> study, policies -> policy. Asked first because
  // "movies" and "calories" are -ie words that took a plain -s, and they came
  // out as "movy" and "calory".
  if (w.endsWith('ies') && w.length > 4) {
    for (const c of [w.slice(0, -1), w.slice(0, -3) + 'y']) if (known(c)) return c;
    return w.slice(0, -3) + 'y';
  }

  // -es after a sibilant : watches -> watch, boxes -> box, gases -> gas — and
  // equally cases -> case, houses -> house, sizes -> size. One suffix, two
  // stems, separable only by asking.
  //
  // THE THIRD CANDIDATE IS THE GREEK -is PLURAL: syntheses -> synthesis. It is
  // asked last, so no ordinary English word can reach it — "cases" and "houses"
  // are answered by the first candidate and never get here. IRREGULAR already
  // carries `analyses`, `hypotheses`, `theses`, `crises` and `bases` by hand,
  // which is the tell that this was a rule wearing a list's clothing; `synthes`
  // is simply the one nobody typed. Added with the -a, -i and -men
  // rules below, which are the same defect in three other endings.
  if (/(ch|sh|ss|x|z|s)es$/.test(w)) {
    for (const c of [w.slice(0, -1), w.slice(0, -2), w.slice(0, -2) + 'is']) {
      if (known(c)) return c;
    }
    return w.slice(0, -2);
  }

  // plain -s : words -> word. Not -ss, already excluded.
  if (w.endsWith('s') && !w.endsWith('ss')) {
    const stem = w.slice(0, -1);
    if (known(stem)) return stem;

    // -oes : goes -> go, heroes -> hero, potatoes -> potato. No sibilant, so
    // the rule above never sees them, and no rule governs them either —
    // "photos" and "pianos" take a plain -s. Only the dictionary separates the
    // two, which is why this is a lookup and not a pattern.
    if (w.endsWith('oes') && known(w.slice(0, -2))) return w.slice(0, -2);

    // -us and -is stay whole unless the bands recognise the stem. The guard
    // exists for "virus" and "basis", where they do not; it was also refusing
    // "menus", "taxis", "flus" and "bureaus", where they plainly do.
    if (!/(us|is)$/.test(w)) return stem;
  }

  // -ied -> -y : studied -> study
  if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';

  // -ing and -ed, which share the doubled-consonant and dropped-e problems.
  for (const suffix of ['ing', 'ed']) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    // Two, not three. The old floor silently excluded the shortest and
    // commonest verbs in the language: "died" leaves the stem "di", so it
    // never entered this loop at all and fell through to band 5 — a real deck
    // labelled "died" as ~C1+. "used" and "aged" failed the same way. Below
    // three characters only a DICTIONARY hit is trusted; the bare-stem
    // fallback at the end of the loop is refused, because a two-letter guess
    // is not a lemma, it is noise that happens to be stable.
    if (stem.length < 2) continue;

    // running -> run, stopped -> stop. Only the consonants English actually
    // doubles before a suffix; ll/ss/ff double in the base word itself.
    const undoubled = /([bcdfgklmnprstvz])\1$/.test(stem)
      ? stem.slice(0, -1)
      : null;

    // Ordered by likelihood, and asked of the dictionary in that order.
    const candidates = [undoubled, stem + 'e', stem].filter(Boolean);
    for (const c of candidates) if (known(c)) return c;

    // Nothing recognised. Take the undoubled stem if there was one, otherwise
    // the plain stem — no 'e' guessed. See the note above: for a word the
    // bands do not hold, stability is the only property that matters.
    if (stem.length < 3) return w;
    return undoubled || stem;
  }

  // ------------------------------------------------------------------------
  // -ly, -er, -est. 
  //
  // Placed last deliberately: any word reaching this point was handled by no
  // rule above, so nothing here can disturb one that was.
  //
  // THE GUARD THAT MAKES THESE SAFE, AND WHY THE OLDER RULES NEEDED LISTS.
  // -ing and -ed disambiguate by asking the dictionary about the STEM, which
  // is why they need NO_STRIP: "according" strips to "accord", a real word,
  // and the rule cannot see that it should not have. These three ask a
  // different question first — is the word ITSELF a band entry? The bands hold
  // lemmas, so a word already in them IS one, and reducing it further can only
  // make its own entry unreachable.
  //
  // That single guard removes every collision a hand-authored list would have
  // had to carry. Measured the day it was written: 131 band entries end in
  // -ly, among them "early", "likely", "friendly", "daily", "apply" (which
  // strips to "apple"), "truly" ("try") and "jolly" ("joy"). The guard returns
  // all 131 untouched, and it is the same guard that keeps "teacher" off
  // "teach" and "forest" off "for".
  //
  // WHY -er IS THE WEAKEST OF THE THREE, STATED RATHER THAN HIDDEN.
  // Comparative -er and agent-noun -er are orthographically identical and the
  // dictionary cannot separate them: "taller" and "teacher" both have a known
  // stem. The guard covers every agent noun the bands hold. One they do not —
  // "campaigner" — still reduces to "campaign", which is a false negative: one
  // card not offered. That is the price, and it is set against the alternative
  // this replaced, where EVERY comparative and superlative in English fell to
  // band 5 and arrived on the deck marked ~C1+.
  if (known(w)) return w;

  // THE PLURALS THAT DO NOT END IN -s, and which therefore never entered a
  // single rule above. `spokesmen`, `maxima`, `stimuli`: nothing in this
  // function had ever looked at them, so each one fell through untouched to
  // band 5 — absence from every list, weight 3.0, the top of the deck. Measured
  // over all 4,427 banded lemmas with SCOWL asked only "is this
  // attested?": NINE such forms exist against the shipped bands and all nine
  // score band 5. Four of the nine have a base in band 1 or band 2, the two
  // bands that SUPPRESS a card — so `spokesman` can never be a card and
  // `spokesmen`, in the same article, is the first one. That is the American-
  // spellings table's defect in a different ending, and `spokesmen` is not a
  // rare word in news English.
  //
  // A RULE AND NOT NINE MAP ENTRIES, and the difference is what happens next.
  // IRREGULAR was already carrying this class one word at a time — `criteria`,
  // `phenomena`, `media`, `bacteria`, `curricula`, and five Greek -es plurals
  // above. Nine more would have closed today's nine and nothing else. Band 3
  // is about to grow from SCOWL, and the corpus offers 79 plurals of exactly
  // this shape whose singular we either already band or are about to: the day
  // `fireman` lands, `firemen` becomes a promotion, and a map would be silent
  // about it. A rule is right in advance.
  //
  // GUARDED BY THE DICTIONARY, LIKE EVERY OTHER RULE HERE, and placed AFTER the
  // guard above rather than beside the -s rules, which is the stricter of the
  // two positions: a word the bands themselves hold is returned before these
  // are consulted at all, so no entry can be reduced out of its own listing.
  // The candidate is proposed and the bands choose; where they decline, the
  // word is returned exactly as it came in. `-women` needs no rule of its own —
  // `spokeswomen` ends in `men` and the substitution lands on `spokeswoman`.
  for (const [re, rep] of [[/men$/, 'man'], [/a$/, 'um'], [/i$/, 'us']]) {
    if (!re.test(w)) continue;
    const c = w.replace(re, rep);
    if (c.length > 3 && known(c)) return c;
  }

  if (w.endsWith('ly') && w.length > 4) {
    const s = w.slice(0, -2);
    // happily -> happy, fully -> full, terribly -> terrible.
    for (const c of [s, s.slice(0, -1) + 'y', s + 'l', s + 'le', s + 'e']) {
      if (c.length > 2 && known(c)) return c;
    }
    return w;
  }

  // -est before -er: the superlative is the less ambiguous of the two.
  for (const suffix of ['est', 'er']) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    if (stem.length < 3) continue;
    const undoubled = /([bcdfgklmnprstvz])\1$/.test(stem) ? stem.slice(0, -1) : null;
    // No bare-stem fallback. Unlike -ing and -ed, an unrecognised comparative
    // is far likelier to be an ordinary noun that happens to end in these
    // letters, so the word is returned untouched rather than guessed at.
    //
    // THE RESTORED 'e' IS ASKED BEFORE THE BARE STEM, and this loop asked them
    // the other way round previously. The -ing and -ed loop above has
    // always had the right order — the comment there calls it "ordered by
    // likelihood" — and these two were reducing the same shape of word to two
    // different answers, in one function, for four days.
    //
    // What the wrong order costs is not a guess: an -e adjective whose stem is
    // ALSO a word loses its own base to that word. "huger" reduced to "hug",
    // "cuter" to "cut", "humaner" to "human", "barer" to "bar", "hater" to
    // "hat", "planer" to "plan", "starer" to "star", "winer" to "win". Asked
    // of every -er and -est form SCOWL attests, 21 change lemma under the
    // swap and 20 of them improve; the exception is "taper", which is a noun
    // and has no business in this loop, and which lands in band 2 either way.
    //
    // The deck barely notices, and that is stated rather than dressed up: of
    // the 21, only "humaner" and "humanest" cross the line that matters,
    // moving out of band 2 — which suppresses a card — into band 3, which
    // offers one. The rest shuffle between bands 1 and 2, and both are
    // suppressed. This is a correctness fix to the lemma, which is also the
    // key cards are deduplicated on, and it is not a visible-defect fix.
    for (const c of [undoubled, stem + 'e', stem, stem.slice(0, -1) + 'y']) {
      if (c && known(c)) return c;
    }
    return w;
  }

  return w;
}

// ------------------------------------------------------------
// THE SILENT-E FOLD
//
// Drop a final 'e' from a lemma no shipped list holds, so that a base form and
// its inflections land on one key. See the LEMMATISE note above for what this
// is repairing and how it was measured.
//
// IT ASKS A DIFFERENT QUESTION FROM THE RULES ABOVE, AND THE DIFFERENCE MATTERS.
// The rules ask isKnown: "do the BANDS hold this?" — because they are choosing
// between candidate lemmas, and only a band entry can be one. This asks "does
// ANY list we ship hold this exact spelling?", bands and proper nouns together,
// because it is not choosing a lemma, it is deciding whether a spelling is
// spoken for. Getting that wrong the obvious way is a visible regression:
// isName() is consulted with the lemma, and 100 of the 886 proper nouns end in
// -e — among them 16 demonyms. Fold "chinese" to "chines" and the name lookup
// misses, and "Chinese" goes out on a flashcard.
//
// BOTH GUARDS ARE LOAD-BEARING AND WERE MEASURED, NOT GUESSED.
//   the word itself held  -> keep. Bands and names are authored spellings.
//   the STEM held         -> keep. 82 off-list -e words sit directly on top of
//                            a banded word: "suite" over "suit", "bathe" over
//                            "bath", "cape" over "cap". Folding those hands a
//                            C1+ word its neighbour's band, and harvest drops
//                            bands 1 and 2 outright — the card vanishes
//                            instead of being mis-levelled, which is worse.
//
// The length floor is 4, not 3, and that is arithmetic rather than taste:
// harvest skips any lemma under 3 characters, so folding a 3-letter word would
// not mis-file it, it would delete it.
function foldSilentE(lemma, isHeld) {
  if (lemma.length < 4 || !lemma.endsWith('e')) return lemma;
  if (isHeld(lemma)) return lemma;
  const stem = lemma.slice(0, -1);
  if (isHeld(stem)) return lemma;
  return stem;
}

// The public reduction: every rule above, then the fold.
//
// `reduce` keeps the many early returns it has always had, and wrapping is what
// lets the fold apply to all of them without touching one. That matters for the
// -s rules in particular, which return a restored base directly: "migrates"
// reduces to "migrate", and only a fold applied AFTER the rules puts it on the
// same key as "migrated".
//
// `isHeld` defaults to `isKnown`, so a two-argument caller gets a fold that
// knows the bands but not the names. harvest never does that — it holds both
// predicates and builds the union — but a test calling this directly might, and
// a default that silently folds names would be a trap.
function lemmatise(word, isKnown, isHeld) {
  const lemma = reduce(word, isKnown);
  if (typeof isKnown !== 'function') return lemma;
  return foldSilentE(lemma, typeof isHeld === 'function' ? isHeld : isKnown);
}

// ------------------------------------------------------------
// TOKENISE
//
// Returns [{ surface, lemma, start, end }] over a range of the text. Offsets
// are absolute into `text`, not relative to the range, so a token can be
// handed straight to sentenceAt.
//
// Internal apostrophes and hyphens stay in the token: "well-being" and
// "o'clock" are single words. A possessive 's is dropped, because "teacher's"
// and "teacher" are the same vocabulary item.
//
// Keeping them whole is right HERE and wrong one stage later: no band list can
// hold a string with punctuation in it, so a token like this can never be
// looked up. harvest declines them — see BANDABLE — and this is the honest
// place to say so, because a reader of this comment alone would conclude
// "well-being" becomes a card, and it does not.
//
// THREE HYPHENS, NOT ONE
// Real pages do not use U+002D exclusively. Wikipedia sets "non-existent" with
// U+2011, the non-breaking hyphen, and one saved article held 61 of them
// against 96 ASCII. Matching only ASCII split those words, and the front half
// is the damage: "non" is in no band, so it scores band 5 at weight 3.0 and is
// promoted ABOVE every word that lemmatised correctly. It reached the deck in
// eight of that article's thirty-three sections.
//
// U+2010 is here on the same footing though that article held none. It is
// Unicode's plain HYPHEN and behaves identically to the two either side of it;
// admitting those two and not it would be a gap with no reason behind it.
//
// The en dash U+2013 is deliberately NOT here, and the distinction is what the
// split leaves behind. Breaking "Anglo–Saxon" yields "Anglo" and "Saxon", two
// whole words that look up correctly. Breaking "non‑existent" yields a prefix
// that is not a word at all. A separator between two words is a separator; a
// hyphen inside one is not.
//
// DIGITS ARE ADMITTED, AND THAT IS A REFUSAL RULE RATHER THAN AN ADMISSION.
// Nothing containing a digit can ever be a card — BANDABLE is
// /^[a-z]+$/ and declines every one of them — so the only question a digit
// raises is whether the tokeniser can SEE the thing it must decline. Without
// \p{N} it could not: the class stopped at the first digit, and the
// trailing-punctuation trim below then removed the hyphen that was the evidence
// for the refusal. What survived was a letter run with nothing left on it to
// decline, band 5, at the highest weight this file assigns.
//
// MEASURED ON A REAL DECK. `mid-14th` was the FOURTH CARD, above every word
// that had lemmatised correctly. Re-measured and it was worse
// than recorded: the string yields TWO band-5 faces, `mid` and `th`, not one.
// `The 1920s` yielded a bare `s` by the same route. Both are gone now, because
// both are seen whole and declined whole.
//
// STARTING AT A DIGIT AS WELL AS A LETTER is the other half and it was not
// optional. `19th-century` starts with a digit, so a class that only STARTED at
// a letter began at the `t` and produced `th-century` — declined, correctly,
// but only by accident of the hyphen surviving, and `century` was silently lost
// out of the deck either way. One token in, one refusal out.
//
// It costs no word count. wordCount() splits on /\S+/ and has never read this.
//
// A DANGLING HYPHEN IS PART OF THE TOKEN, AND THAT IS THE DIGIT RULE AGAIN.
// The article writes "the suffix -er marking the
// comparative, and -est marking the superlative", and a class that can only
// START at a letter began at the `e` and handed back `est` — a bare word
// between spaces, in no band list, and absence is band 5 at weight 3.0. It was
// a card. Measured on the article the U+2011 defect came from: 1
// card in 1125 over eleven sections.
//
// THE TOKENISER WAS RIGHT ABOUT THE LETTERS AND BLIND TO THE EVIDENCE, which
// is word for word the digit paragraph above. Nothing here needs to know what
// a suffix is, or to keep a list of them, or to reason about morphology. It
// needs to SEE the hyphen the article put there, and then BANDABLE declines
// `-est` for the same reason it declines `well-being` — no band list holds a
// string with punctuation in it — and the teacher is told "written with a
// hyphen", which is what is on their page. One token in, one refusal out, and
// no new counter, no new sentence and no new list anywhere.
//
// ONLY WHEN THE HYPHEN DANGLES, and the lookbehind is the whole of it. A
// hyphen with a letter or digit before it is already inside the preceding
// match — `well-being` and `mid-14th` are one token each and always were — so
// the only hyphens this can reach are ones nothing claimed. Requiring
// whitespace or the range boundary before it is what keeps the rule off
// `U.S.-based` and `(2019)-era`, where the hyphen joins two things rather than
// citing one.
//
// It is OPTIONAL INSIDE the match rather than a lookbehind on the whole, and
// that is not a style choice: `(?<!\S)-?` would put the boundary test in front
// of every token, and `(word)` would stop being one.
//
// THE OTHER HALF IS NOT HERE AND IS NOT AN OVERSIGHT. `pre-` cited as a prefix
// already tokenises as `pre-`, and the trailing-punctuation trim below takes
// the hyphen straight back off — so the mirror defect exists. It is not fixed
// because the evidence is not there: the shape occurs ZERO times across the
// tree's 70 corpora and the article's eleven sections, while the sloppy
// trailing dash it would collide with (`unrelenting- until noon`) is a real
// thing people type. That is the standard the `max.` clause is held open
// under, applied to a rule of mine rather than to somebody else's.
//
// The quoted citation — `"-est"` — is the same defect wearing a bracket and is
// also left. `(?<!\S)` refuses it, deliberately: an opening-delimiter set here
// would be a second list obliged to agree with sentence-core's TRAILING
// forever, and it too measures zero on this tree.
//
// BOUNDED BY THE RANGE AND NOT BY THE DOCUMENT, because the match runs on the
// slice. A selection torn off mid-word at a hyphen makes the fragment after it
// look cited, and it is declined instead of carded. That is the better of the
// two answers to a half-word anyway, and it is the only place the two readings
// differ.
// ------------------------------------------------------------
const WORD_RE = /(?:(?<!\S)[‐‑-])?[\p{L}\p{N}][\p{L}\p{N}\p{M}'’‐‑-]*/gu;

// The possessive marker, defined ONCE because three places strip it and they
// have to strip the same thing: the lookup key below, the census key in
// `filedLemma`, and the card face in `harvest`. The first two agreeing was
// always necessary; the third joined them, when a card went out
// reading `commission's`. If they ever disagree, a word is graded as one thing
// and shown as another, which is the class of bug this file has been bitten by
// twice — see `filedLemma`'s note on the census key.
//
// Only `'s` is here. A plural possessive never reaches this point wearing its
// apostrophe: `teachers'` is trimmed to `teachers` by the trailing-punctuation
// rule below, which runs first. `bare` strips one thing more on top of this —
// a leftover apostrophe from a doubled `''s` — and that is a tokenising
// concern, not a face one, so it stays where it is rather than moving in here.
const POSSESSIVE = /['’]s$/i;

// ------------------------------------------------------------
// AN IDENTIFIER IS NOT PROSE, AND THE LETTERS INSIDE ONE ARE NOT WORDS
//
// WORD_RE stops at anything that is not a letter or a digit, so a DOI hands it
// a token every time a letter run appears between the punctuation:
// `10.1017/chol9780521264754.006` is where `chol` came from, and
// `10.5790/hongkong/9789622099470.003.0004` is where `hongkong` came from.
// Eleven cards in the article's two apparatus blocks are fragments of this
// kind, and four more — `https`, `index`, `org`, `php` — are the pieces of the
// permanent-link URL in §11.
//
// THE SIXTEENTH IS THE ONE THAT MOVED THIS OUT OF "TIDINESS". `Wikipedia` was
// going out on a card, capitalised, from a section that names it mid-sentence
// repeatedly — which is the census's clearest possible name verdict. What
// overturned it was `en.wikipedia.org` inside the URL: one lower-case sighting,
// and `lower > 0` vetoes the verdict, exactly as it is meant to when a real
// article uses a real word in lower case. A URL is not an article using a word.
// So this is not only a filter for rubbish faces; it is a name-filter failure
// with a lower-case sighting behind it, and no rule reading capitalisation can
// see it, because the tokeniser had already told the census a lie.
//
// THE TEST IS A SLASH PLUS A DIGIT OR A COLON, and the second half is what
// keeps it off English. A slash between two words is a coordination —
// `and/or`, `input/output`, `km/h` — and dropping both sides of one would be a
// real loss, since the rule takes the whole run. No coordination carries a
// digit or a colon; every URL carries a colon and nearly every DOI a digit.
// A slash alone scored the same 16 on this tree and is refused for the shape it
// would hit on a tree that has one, which is the standard the `max.` clause is
// held open under: a rule written against no evidence needs the evidence first.
//
// Bounded to a run rather than to a character window: `\S+` cannot cross
// whitespace, so nothing here can reach out of the identifier and take a word
// standing next to it.
// ------------------------------------------------------------
const NON_SPACE = /\S+/g;

function identifierSpans(slice) {
  const spans = [];
  NON_SPACE.lastIndex = 0;
  let r;
  while ((r = NON_SPACE.exec(slice)) !== null) {
    const run = r[0];
    if (run.includes('/') && (/\d/.test(run) || run.includes(':'))) {
      spans.push([r.index, r.index + run.length]);
    }
  }
  return spans;
}

function tokenise(text, from, to) {
  const lo = Math.max(0, from == null ? 0 : from);
  const hi = Math.min(text.length, to == null ? text.length : to);
  const slice = text.slice(lo, hi);
  const out = [];

  // Both lists are in document order, so one pointer walks the spans rather
  // than each word searching all of them. A references section is thousands of
  // words against hundreds of DOIs and the quadratic form is felt there.
  const spans = identifierSpans(slice);
  let sp = 0;

  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(slice)) !== null) {
    while (sp < spans.length && spans[sp][1] <= m.index) sp++;
    if (sp < spans.length && spans[sp][0] <= m.index) continue;
    let surface = m[0];
    // Trim trailing punctuation the character class let through: a hyphen or
    // apostrophe is only word-internal if a letter follows it. All three
    // hyphens WORD_RE admits have to be trimmed here, or admitting them merely
    // moves the fragment from the front of the word to the back of it.
    surface = surface.replace(/['’‐‑-]+$/, '');
    if (!surface) continue;
    // Possessive: teacher's -> teacher, teachers' -> teachers.
    const bare = surface.replace(POSSESSIVE, '').replace(/['’]$/, '');
    out.push({
      surface,
      lemma: lemmatise(bare),
      start: lo + m.index,
      end: lo + m.index + surface.length
    });
  }
  return out;
}

// ------------------------------------------------------------
// THE CAPITALISATION CENSUS
//
// "Zelensky", "Sellafield" and "Aduhelm" are all band 5, all rare, and none of
// them is vocabulary. The tell is capitalisation away from a sentence start —
// which is why sentences had to be segmented first. A word capitalised only
// because it opens a sentence carries no information at all.
//
// Evidence is gathered from the WHOLE block, not just the selection: a name
// appearing once in the highlight but four times around it is still a name,
// and the extra occurrences are free.
//
// Verdicts:
//   seen lower-case at least once  -> not a name, whatever else
//   capitalised mid-sentence       -> a name
//   capitalised in an AUTHOR SLOT -> a name (see below)
//   only ever sentence-initial     -> unproven, and therefore ALLOWED through
//
// That last case follows the band tie-break in wordlist.js: let it reach the
// review table, where one click removes it, rather than withhold it silently.
//
// THE THIRD VERDICT IS WRONG WHEREVER A SENTENCE START IS A SLOT RATHER THAN
// A POSITION, AND A REFERENCE LIST IS ENTIRELY MADE OF THOSE. The premise of
// "unproven" is that nothing chose to put the word there: an English sentence
// has to start somewhere and the capital is the orthography's, not the
// author's. That premise fails for `Aitken, A. J.; McArthur, Tom, eds. (1979).`
// Nothing about a citation is positional. The word at the front is at the front
// BECAUSE it is a surname, which is the strongest evidence available anywhere
// in the block, and the census was reading it as the weakest.
//
// The article's bibliography ran 160 cards, of which 112 were third-verdict,
// and reading them found about a hundred surnames, publishers and towns.
// Measured after the `pp.` work put whole citations on the backs of
// those cards and made a bad card longer rather than better.
//
// THE TELL IS THE YEAR, AND IT HAS TO BE THE NEXT BRACKET RATHER THAN ANY
// BRACKET. "A year in brackets later in this sentence" scores identically on
// the apparatus — 73 cards, every one a surname, and not one prose card
// touched — but it also caught `Skirian` in the §11 navbox, which is
// 3,737 characters with no stop in it and holds `(1483)` in a book title 939
// characters further on. Same verdict, and `Skirian` is a name, but on
// reasoning that would fire on any long run of furniture. Requiring the FIRST
// bracket ahead to be a bare year refuses the navbox on `(Irminonic)` and loses
// nothing: the two rules take the same 73 cards.
//
// A character window was tried first and is worse than both. Every clip from 30
// to 200 characters cost no prose card either, but "within 200" scored 110
// rather than 73 by reading past the end of the sentence into the NEXT
// citation's year — a section detector wearing a word rule's clothes, and a
// number with no argument behind it.
//
// WHAT IT DOES NOT REACH, said plainly: 57 of the 130 third-verdict cards
// survive, because `↑ Bammesberger 1992 , pp. 29–30.` brackets nothing and a
// publisher line names no year at all. `routledge` ×13, `crystal` ×5,
// `edinburgh` ×5, `london` ×3 and about forty single sightings are still cards.
// This narrows the verdict where a citation says so; it does not read the
// section, and a SECTION is what the rest of that residue needs. The survivors
// are template vocabulary contributed by the citation machinery rather than by
// the article, publisher lines and publishing towns with no year to anchor
// them, and surnames in the year-less footnote form. Not one of those shapes
// is reachable by a capitalisation or word rule, because each is ordinary
// English in a position no word can see, which is why the residue is left
// standing here rather than chased with another rule that would cost prose
// cards to catch furniture.
// ------------------------------------------------------------
// The key a token is FILED under, used by the census and by harvest's grouping.
//
// It exists because those two disagreed, silently, for every word the
// dictionary argument changes. `tokenise` has no word list, so `tok.lemma` is
// always the dictionary-free fallback: "hoping" files as "hop", "increased" as
// "increas", "predominantly" as "predominantly". harvest, holding the list,
// groups the same tokens under "hope", "increase" and "predominant" — and then
// looked the group up in a census keyed the other way, got `undefined`, and
// skipped the correction below without a word.
//
// "Both callers now derive the key HERE, so the two cannot drift apart again."
// THAT WAS TRUE UNTIL THE KEY TOOK A SECOND ARGUMENT, AND THEN IT WAS NOT.
// Sharing the derivation is not the same as sharing the inputs. Adding `isHeld`
// for the silent-e fold gave the two callers something to disagree about again.
//
// WHAT THAT DISAGREEMENT IS WORTH, MEASURED RATHER THAN ASSUMED. Handing the
// census `isKnown` where the groups get the union was tried as a mutation and
// nothing failed, so it was chased down rather than written up. The two
// predicates differ on exactly one kind of word — a LISTED proper noun, where
// `charlotte` folds to `charlott` under one and stays whole under the other —
// and those are struck out by isProperNoun a few lines later regardless. The
// unlisted names, which are the census's actual job, key identically under
// both. No card changes. It is an inconsistency with no consequence today.
//
// It is closed anyway, and structurally rather than with a check, because "no
// consequence today" is the condition every silent failure is in the day
// before. The census is no longer handed the ingredients; it is handed the KEY
// FUNCTION, built once by the caller that owns the lists. There is now nothing
// for a second caller to get differently, so no check is needed to notice.
function filedLemma(tok, isKnown, isHeld) {
  return isKnown
    ? lemmatise(tok.surface.replace(POSSESSIVE, ''), isKnown, isHeld)
    : tok.lemma;
}

// The author slot: this word OPENS a sentence, and the first bracket the
// sentence goes on to open holds a bare year and nothing else.
//
// `[^()]*` is what makes "first" mean first. A greedy match would run from the
// opening bracket of `(Irminonic)` to the closing bracket of `(1483)` nine
// hundred characters later and read the whole span as one group.
//
// The year range is deliberately narrow. `(2003)` and `(1979)` are years;
// `(1)` and `(16)` are issue and volume numbers, which stand in exactly this
// position — `Language Policy . 5 (2): 141– 160.` — and mean the opposite.
// A trailing letter is admitted because `(2006a)` is how a bibliography
// separates two works by one author in one year. The floor at 1500 is where
// nothing is known to be lost and something is known to be gained: below it a
// four-digit bracket is likelier to be a paragraph or a catalogue number than
// a date, and a citation of an incunable is a card nobody has yet seen.
const BRACKET_GROUP = /\(([^()]*)\)/;
const BARE_YEAR = /^\s*(1[5-9]\d\d|20\d\d)[a-z]?\s*$/;

function opensAnAuthorSlot(text, from, end) {
  if (!(end > from)) return false;
  const m = BRACKET_GROUP.exec(text.slice(from, end));
  return !!m && BARE_YEAR.test(m[1]);
}

function censusCapitals(text, sentences, keyOf) {
  const census = new Map();
  const starts = new Set(sentences.map((s) => s.start));
  // Where each sentence ENDS, keyed by where it starts, so the author-slot test
  // cannot run past its own sentence. Built here rather than searched for at
  // each token: a linear scan per capital is quadratic on a reference list,
  // which is the one input this rule exists for.
  const endAt = new Map();
  for (const s of sentences) endAt.set(s.start, s.end);
  // No key supplied means no word list anywhere, which is tokenise's own
  // dictionary-free lemma — the same fallback filedLemma takes.
  const key0 = typeof keyOf === 'function' ? keyOf : (tok) => tok.lemma;

  for (const tok of tokenise(text)) {
    const key = key0(tok);
    let rec = census.get(key);
    if (!rec) {
      rec = { lower: 0, midCap: 0, slotCap: 0, total: 0 };
      census.set(key, rec);
    }
    rec.total++;
    const capitalised = tok.surface[0] !== tok.surface[0].toLowerCase();
    if (!capitalised) rec.lower++;
    else if (!starts.has(tok.start)) rec.midCap++;
    else if (opensAnAuthorSlot(text, tok.start, endAt.get(tok.start))) {
      rec.slotCap++;
    }
  }
  return census;
}

// `slotCap` is counted apart from `midCap` and not folded into it, because
// `midCap` has a second reader: the face rule in harvest lower-cases a word
// whose capital is positional, and an author slot IS a sentence start. Folding
// would be one line shorter and would put a capital back on the face of any
// word that opens a citation somewhere and is an ordinary word elsewhere —
// `lower > 0` vetoes the name verdict below but would not undo the face.
// Nothing in the tree does that today, which is the condition every silent
// failure is in the day before.
function looksLikeName(rec) {
  if (!rec) return false;
  if (rec.lower > 0) return false;
  return rec.midCap > 0 || rec.slotCap > 0;
}

// ------------------------------------------------------------
// SENTENCE CHOICE
//
// A word may occur several times. The choice must be DETERMINISTIC, or two
// runs over one article disagree and the teacher cannot trust the export.
//
// Preference: the SHORTEST sentence of a usable length. Failing that, the
// first occurrence at all — a card with an awkward sentence still beats no
// card.
//
// This used to return the first sentence within range, and a live article
// showed why that is wrong. "advantage" drew thirty words of executive-order
// prose — "My Administration has guarded against the risks posed by malign
// foreign actors who attempt to swindle American citizens by taking advantage
// of the generosity of our Nation" — while the same article carried the word
// in a far plainer sentence further down. The long one was inside the old
// 35-word ceiling, so it won by being first.
//
// A flashcard back is read in about two seconds. Length is not a tie-break
// here; it is the criterion, and the ceiling came down to 25 to match what a
// card can actually hold.
//
// AND THAT CRITERION, APPLIED PER WORD, RUINED THE DECK.
//
// Measured across the eleven decks exported from real articles: 90 cards
// carrying 30 distinct sentences. The worst was 17 cards on 3 sentences;
// 9 on 2; 4 on 1. Every deck in the set, not one bad article.
//
// The cause is the criterion itself. "Shortest of a usable length" is
// evaluated for each word with no knowledge of any other word, so the single
// shortest sentence in the passage is the answer to every question it is a
// candidate for. It becomes a MAGNET: every word that appears in it takes it,
// and the rest of the passage is never quoted. The 17-card deck had a dozen
// usable sentences and used three. Each card was individually correct — this
// function was doing exactly what it was told — and the deck was nearly
// useless, because a teacher reading seventeen cards wants seventeen contexts.
//
// So the choice now sees what the deck has already spent. `used` counts how
// many cards already carry each sentence, and a sentence nobody has taken wins
// over one that three cards share.
//
// QUALITY IS RANKED ABOVE NOVELTY, DELIBERATELY. Sentences are compared on
// four keys in order: ideal length first, then fewest uses, then shortest,
// then earliest. The first key is what stops the rule trading a good sentence
// for a fresh one — a 50-word back is bad for the card that carries it, and no
// amount of deck variety pays for it. Novelty only ever breaks a tie between
// sentences that were already acceptable.
//
// The fourth key replaces the old "strictly shorter, never equal" rule and
// does the same job more directly: two runs over one article cannot disagree,
// because the tie is broken on a position in the text rather than on the order
// occurrences happened to be visited in.
//
// A WORD WITH ONE OCCURRENCE IS UNAFFECTED, which is most of them. It has one
// sentence, it takes it, and the count it adds is what steers the next word
// away. Nothing here can leave a card without a sentence: `used` reorders
// preferences and rejects nothing, and the fallback is untouched.
// ------------------------------------------------------------
const IDEAL_MIN = 6;
const IDEAL_MAX = 25;
const HARD_MAX = 60;

function wordCount(s) {
  return (s.match(/\S+/g) || []).length;
}

// ---- A HEADLINE IS NOT A SENTENCE ------------------------------------------
//
// Added off a real deck: an Al Jazeera
// card carried *"Israeli forces storm West Bank town of Tammun, Wafa reports"*
// on its back — no final stop, because it is a headline.
//
// SEGMENTATION ALREADY KNOWS. `sentence-core.js` treats a newline as a hard
// boundary precisely so a heading cannot be glued to the paragraph under it,
// and its own comment says *"a heading never does"* have a full stop. So the
// heading arrives correctly isolated, and then wins the card back on LENGTH:
// headlines are short, and short is the third key below. Measured on a planted
// fixture — a 7-word headline beat a 21-word prose sentence carrying the same
// word, twice out of two.
//
// WHY A HEADLINE IS THE WRONG BACK, stated as the promise rather than as
// taste. The sentence is on the card because it shows the word *"in the
// register the writer chose"*. Headline register is not that
// register: it drops articles and auxiliaries — *"Forces storm town"* — so the
// student meets a form of English the article does not otherwise contain, on a
// card claiming to quote the article.
//
// THE TEST IS TERMINAL PUNCTUATION AND NOTHING CLEVERER. No capitalisation
// test, no length test, no word-shape test: prose ends in a stop and headlines
// do not, and every heuristic beyond that would start refusing real sentences.
// The closing characters come from `sentence-core.js`'s own TRAILING set
// rather than being retyped here — that set is what `segment()` pulled INTO
// the sentence, so a quoted sentence ends `…said."` and a rule with its own
// idea of which quotes count would refuse it. Two lists would be one list and
// one rumour.
//
// WHAT IT COSTS, and it is not nothing. An article's LAST line often has no
// stop either, and this demotes it. That cost is bounded by where the key
// sits: it only ever loses to another sentence holding the SAME word, which is
// a better card by this rule's own argument, and when there is no other the
// fallback still returns it. **No word stops becoming a card because of this.**
//
// AND IT DOES NOT TOUCH THE CASE WHERE A WORD IS ONLY EVER IN A HEADLINE.
// Measured on the same fixture: that card still gets the headline, because
// `chooseSentence`'s fallback is the only thing standing between it and no
// sentence at all. Dropping the card instead is a SUBTRACTIVE change — it
// would need to be counted in the set-aside line, since a silent decline is
// the one thing this product has ruled against twice — and that is a decision
// rather than a fix. Left open, with this measurement.
// BUILT ON FIRST USE, NOT AT LOAD, and the first draft of this did the latter
// and was caught by its own test case within the hour. `TRAILING` was not on
// `sentence-core.js`'s export list at all, so the set came back empty, the
// class collapsed to `[]`, and the rule quietly stopped recognising every
// quoted sentence in the article — demoting exactly the well-formed prose it
// exists to prefer. It threw nothing and failed nothing except the one case
// written to pin the closers.
//
// So the lookup is deferred to a moment when the page is certainly assembled,
// and the memo means it still happens once. In the extension that guarded
// against script order. As an ES module there is no script order to depend on:
// sentence-core.js is a static import, evaluated before this module runs, so
// the deferral is now belt and braces and costs nothing.
//
// The escape is applied to every character rather than to the ones that need
// it today: `]` and `-` are what would break a class, and a set edited later
// must not be able to.
let endsProseRe = null;
function endsInAStop(text) {
  if (!endsProseRe) {
    const api = Sentences;
    const trailers = api && api.TRAILING ? [...api.TRAILING] : [];
    endsProseRe = new RegExp('[.!?…]['
      + trailers.map((c) => '\\' + c).join('') + ']*$');
  }
  return endsProseRe.test(text);
}

// Lower wins, compared left to right. Split out because the ORDER of these
// five is the whole design, and it should be readable as five lines rather
// than reconstructed from a chain of &&.
//
// PROSE IS THE FIRST KEY, ahead of length and ahead of variety. Both of those
// are about making a good card out of prose; this one is about whether the
// candidate is prose at all, and a rule that let a short headline outrank a
// long sentence would be answering the second question before the first.
function sentenceKey(sentence, n, used) {
  return [
    endsInAStop(sentence.text) ? 0 : 1,
    n <= IDEAL_MAX ? 0 : 1,
    used ? used.get(sentence.start) || 0 : 0,
    n,
    sentence.start
  ];
}

function keyBeats(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

// ---- A WORD ON A LINE OF ITS OWN IS NOT A SENTENCE --------------------------
//
// The case the headline note above left open, now decided by the owner
// (2026-10-18). A heading of one word — "Grievances", "Constitution", a page's
// "Edit" link — segments as a sentence of one word, and when the word has no
// sentence of usable length it went out on the fallback with itself as its
// back. A card whose back is its front shows the student nothing.
//
// So such a line is never chosen, and a word met ONLY on such lines is not
// carded: the harvest counts it (`rejected.alone`) and the set-aside line says
// so, because a silent decline is ruled out. The test is the line and not the
// word count alone: "Indeed." inside a paragraph is a sentence the writer
// wrote, and the note says "on a line of their own", which must stay true.
//
// `text` is optional for the same reason `used` is: a caller without it gets
// the choice this function made before.
function standsAlone(sentence, text) {
  if (text === undefined || wordCount(sentence.text) !== 1) return false;
  const before = text.lastIndexOf('\n', sentence.start - 1) + 1;
  let after = text.indexOf('\n', sentence.end);
  if (after < 0) after = text.length;
  return !/\S/.test(text.slice(before, sentence.start))
    && !/\S/.test(text.slice(sentence.end, after));
}

// `used` is optional: a caller that passes nothing gets the per-word choice
// this function has always made, since an empty count is the same count for
// every candidate and the remaining three keys are the old rule.
function chooseSentence(occurrences, sentences, used, text) {
  let fallback = null;
  let best = null;
  let bestKey = null;

  for (const occ of occurrences) {
    const idx = sentenceAtSafe(sentences, occ.start);
    if (idx < 0) continue;
    const sentence = sentences[idx];
    if (standsAlone(sentence, text)) continue;
    const n = wordCount(sentence.text);
    if (fallback === null) fallback = sentence;
    if (n < IDEAL_MIN || n > HARD_MAX) continue;
    const key = sentenceKey(sentence, n, used);
    if (bestKey === null || keyBeats(key, bestKey)) {
      best = sentence;
      bestKey = key;
    }
  }
  return best || fallback;
}

// WHERE THE WORD SITS INSIDE THE SENTENCE THAT WAS CHOSEN FOR IT.
//
// Added because the bold target word was planned around "the
// offset `vocab-core.js` already knows" and this file did not hand it to
// anybody. It
// knows the offsets in `occurrences`; `chooseSentence` above is given the
// bearing ones and returns a sentence without saying which of them it used, so
// the Pro path that bolds the target had a prerequisite costed as free.
//
// IT RE-DERIVES RATHER THAN REPORTING, and that is deliberate. Changing
// `chooseSentence` to return a pair would touch five call sites for a fact
// this can recover exactly: `chooseSentence` sets its winner on the FIRST
// occurrence whose sentence wins — equal keys do not beat the incumbent — so
// the first occurrence lying inside the chosen sentence is the same one, in
// the same iteration order over the same array.
//
// The length is the surface's WITHOUT its possessive, so `Teacher's` bolds
// `Teacher` and leaves `'s` outside the mark. That is not a nicety: the face
// has already had the possessive taken off it, and a mark wider than the word
// on the front of the card is a card disagreeing with itself again.
//
// Offsets are relative to the START OF THE SENTENCE and not to the article,
// because the sentence is the only one of the two that ends up on the card.
function targetIn(sentence, occurrences) {
  if (!sentence) return null;
  for (const o of occurrences) {
    if (o.start >= sentence.start && o.end <= sentence.end) {
      return { at: o.start - sentence.start,
        length: o.surface.replace(POSSESSIVE, '').length };
    }
  }
  return null;
}

function sentenceAtSafe(sentences, offset) {
  const api = Sentences;
  return api ? api.sentenceAt(sentences, offset) : -1;
}

// ------------------------------------------------------------
// SCORE
//
// Occurrence count earns a DIMINISHING return. A word used eight times is more
// teachable than one used twice, but nowhere near four times so — and without
// the damping, one repeated word crowds out five better ones.
// ------------------------------------------------------------
// Bands 1 and 2 never reach here. Band 3 sat at 1.2 while it was empty and the
// number never mattered; now that it holds real upper-intermediate vocabulary
// it has to rank above nothing at all, but still below the academic band that
// is the product's reason for existing.
const BAND_WEIGHT = { 5: 3.0, 4: 2.6, 3: 2.0 };

function score(entry) {
  const band = BAND_WEIGHT[entry.band] || 0;
  const repeat = 1 + Math.log2(entry.count);
  let context = 1;
  if (entry.sentence) {
    const n = wordCount(entry.sentence.text);
    if (n >= IDEAL_MIN && n <= IDEAL_MAX) context = 1.25;
    else if (n > HARD_MAX) context = 0.7;
  } else {
    context = 0.5;
  }
  return band * repeat * context;
}

// ------------------------------------------------------------
// WHAT THE LISTS CAN BE ASKED ABOUT
//
// Every one of the 5,183 entries across the four bands and the proper nouns is
// pure a-z — measured, and held there by INVARIANT 7. So a lemma containing a
// hyphen, an apostrophe or a digit matches nothing, and `bandOf` returns 5.
//
// THAT 5 IS A FAILED LOOKUP WEARING THE COSTUME OF A VERDICT. Band 5 means "no
// list claimed this word", which the pipeline reads as "rare, therefore worth
// teaching" — and BAND_WEIGHT gives it 3.0, the top weight in the deck. The
// word was never asked about. It was ranked first for being unaskable.
//
// Measured on a live article: `prima-dani`, `media-savvy`, `hyper-sensitive`,
// `artificial-intelligence`, `thin-skinned` and `so-called` all shipped as
// flashcards. Then the same probe run over ordinary spoken prose, which the
// five news articles never contained: `don't`, `can't`, `won't`, `they've`,
// `she'd` and `o'clock` came out as SIX cards ranked ABOVE `conceded` and
// `assume`. One cause, and the contractions are the worse half of it.
//
// The lemma is garbage too, which is the tell that nothing downstream could
// have recovered this: the -ed and -ing rules eat compounds, so `so-called`
// reduces to `so-cal`, `well-being` to `well-be`, and `left-wing` and
// `right-wing` both lose their tail.
//
// SPLITTING ON THE HYPHEN WAS TRIED AND REJECTED. Band the parts and 21 of 31
// measured compounds are correctly dropped, but what survives is `pre-`,
// `anti-`, `non-`, `co-` and `hyper-` — bound prefixes, band 5 because they
// are not words at all. Making that rule work needs a list of morphemes
// pretending to be vocabulary, and it still keeps `media-savvy`.
//
// THE COST IS REAL AND IS NOT HIDDEN. `well-being`, `self-esteem` and
// `by-product` are teachable and will never be cards. The pipeline cannot tell
// them from `prima-dani` — it has no way to ask — so it declines all of them
// and TELLS THE TEACHER IT DID, which is the only part of this that would be
// dishonest to skip.
// ------------------------------------------------------------
const BANDABLE = /^[a-z]+$/;

// ------------------------------------------------------------
// ABBREVIATIONS ARE NOT VOCABULARY
//
// `etc.` tokenises as `etc`, because a full stop is a separator and the
// tokeniser is right about that. `etc` is then in no band list, and absence
// from every list is band 5 at weight 3.0 — absence is how this pipeline
// recognises a hard word — so the deck does not merely admit it, it opens with
// it. Measured before this rule was written, on the article the defect was
// reported from: 2 such cards in 1125 over eleven sections, both `etc`. Low
// frequency, and the same promotion mechanism the U+2011 split had, wearing a
// different hat.
//
// THE FIRST COUNT SAID THREE, and the third was `est` — which is not the
// abbreviation at all. The article discusses "the suffix -er marking the
// comparative, and -est marking the superlative", and a suffix cited with a
// space after its hyphen tokenises as a bare word. That census matched the list
// against the card FACE and nothing else, which is precisely the rule rejected
// two paragraphs down, and it produced precisely the false positive predicted
// there. The card is real and is a different defect; it is written up as one.
//
// THE LIST IS NOT A NEW ONE, AND THAT IS THE POINT. sentence-core already keeps
// one, because a stop closing an abbreviation is not a sentence end — the same
// question asked from the other side. A second list here would be two lists
// obliged to agree forever with nothing holding them together, which is the
// shape of every drift this file has been bitten by.
//
// BOTH CONDITIONS, AND EACH CARRIES ITS WEIGHT — measured, not assumed. Across
// the tree's 21 corpora and the article's 11 sections, 660 tokens wear a listed
// surface and 16 of them are stop-closed. The other 644 are ordinary words
// doing a word's work: `no`, `in`, `sat`, `sun`. Declining on the list alone
// takes `wed` with them — band 5, teachable, and exactly the kind of word this
// product exists to find. The stop alone is no better: an ordinary word ending
// a sentence is stop-closed too, and that is 55 of the article's 1125 faces
// against the 2 this rule is for.
//
// EVERY OCCURRENCE, NOT ANY. One bare use is the passage saying this is a word
// it also abbreviates, and the word wins — the capitalisation census settles
// its own question the same way, on a single lower-case sighting. Nothing
// measured here distinguishes the two rules: the only mixed groups found
// outside the passage written for this case are `v` and `no`, and neither
// reaches a card. So this half is settled on the argument and pinned by a
// passage built for it, which is worth saying plainly rather than implying a
// measurement that does not exist.
//
// The character after the token is read from the WHOLE text, never the
// selection. A highlight ending on `etc` does not make it a word; the article
// still has the stop, and this is the same asymmetry that puts a whole sentence
// on the back of a card clipped mid-way.
//
// WHAT CAN BE DECLINED AT ALL is a much smaller set than the list, and it was
// worth knowing before the teacher was told anything. 29 of the 96 entries are
// under three letters, and the grouping loop drops a short lemma before this is
// ever consulted — `no`, `in`, `cf`, `al`, `dr` cannot reach here whatever
// follows them. Two more (`e.g`, `i.e`) hold a stop the tokeniser splits on, so
// no token can carry them either. Three more are three letters filing under a
// two-letter lemma — `mrs`, `nos`, `eds` — and the floor is applied to the
// LEMMA, so they do not reach here either. That leaves 62. Measured
// on the article's own citation apparatus, which is where a rule like this
// would be expected to run riot: 50,160 characters of footnotes and
// bibliography, 704 stop-closed words, and NOTHING declined.
//
// THAT FIGURE READ 64 PREVIOUSLY, because it was counted by the letters
// in the entry and the floor tests the letters in the lemma. `mrs` and `nos`
// had been on the wrong side of it since the day the count was written. The
// three entries added — `pp`, `ed`, `eds` — move it by nothing
// whatever: two are too short and the third files under `ed`. That is the whole
// reason the citation apparatus damages card BACKS and can never touch a face.
//
// AND THE REASON IS NOT THAT THE WORDS ARE ABSENT, which is what that number
// looked like it was saying and is not. `Vol.` is written 14 times in the
// bibliography. Every one of the 14 is capitalised, so the capitalisation
// census two filters above calls it a name and this rule is never reached — the
// `Inc.` shape exactly, and the reason the count beside this list is a count of
// cards lost rather than of refusals made.
//
// THE WORST SELECTION MEASURED ON A REAL PAGE DECLINES ONE WORD. Two harness
// passages decline more and are built to: `STARTCAP` holds two, and a gloss
// written in lower case holds three. Nothing on a page has come near either.
//
// THE DECLINED WORDS ARE NAMED to the teacher, and the display form is the
// surface as it was first met, plus the stop that closed it. The stop is not
// decoration: every occurrence of a declined group is stop-closed by
// construction, so `etc` on its own would show the teacher something their page
// does not contain. The surface and not the lemma, for the reason the card face
// is a surface — `Pres.` is what was declined and `pre.` is not a thing anyone
// wrote.
//
// SOFT in the extension, like the segmenter it borrowed from: no sentence-core
// meant no list, and harvest kept running, at the cost of one bad card the
// teacher could see and untick. Since the port sentence-core.js is a static
// import, so a missing segmenter stops the page at load and the `!abbrev`
// branch is not reached from the shipped page. It stays; the blocklist was
// always hard, and says why at its own call site.
// ------------------------------------------------------------
function isAbbreviated(occurrences, text, abbrev) {
  if (!abbrev) return false;
  return occurrences.every(
    (o) => text[o.end] === '.' && abbrev.has(o.surface.toLowerCase()));
}

// ------------------------------------------------------------
// A WORD THAT IS ONLY EVER HALF OF SOMETHING ELSE
//
// `facto` was the FIRST card of the deck built from the English-language
// article, and `due` was on the same deck. Neither is a
// tokenising defect and this is the thing to be clear about before anything
// else: the tokeniser is right both times. `de facto` is two words with a space
// between them, `due to` is two words with a space between them, and no rule
// about hyphens or digits has anything to say about either. The words are
// simply not words on their own.
//
// THE THIRD SHAPE OF ONE FAULT, AND THE FIRST THAT IS NOT THE TOKENISER'S.
// `non` came from a U+2011 split and `mid` from `mid-14th`; both are fragments
// the TOKENISER made. `facto` is a fragment the LANGUAGE made, and it arrives
// whole, well-formed, and indistinguishable from a word. What all three share
// is the band, and the sweep in tests/logic.test.js § phrases makes that a
// measurement rather than a likelihood. The 52 entries below hold 81 distinct
// words. Eight are under the length floor (`a ad by de ex in of to`) and five
// are band 1 or 2 (`and breath force per short`), so 68 can reach this filter
// at all — and 67 of those 68 are band 5. The single exception is `rigor`, at
// band 3.
//
// It could hardly be otherwise. Band 5 means "no shipped list holds this", and
// a wordlist of English does not hold the second half of a Latin tag. Band 5
// weighs 3.0, the heaviest weight there is, so a non-word does not merely reach
// the deck: it is promoted above every word that graded correctly. `facto` was
// card 1 of 15.
//
// TWO KINDS OF ENTRY, AND ONLY ONE OF THEM COULD HAVE BEEN A WORD LIST.
//
//   `facto`, `versa`, `hoc`, `vitro`, `franca`, `behalf`, `shrift` — BOUND.
//   They have no independent existence in English, so declining them is never
//   wrong, and a bare list of words would have done the job.
//
//   `due` — not bound at all. "The essay is due" is a good sentence and `due`
//   is a good card from it. It is wrong HERE, and only here, because "to"
//   follows it. No list of words can say that, and a list of words holding
//   `due` would cost the teacher a real card on every other page.
//
// So the unit is the PHRASE and not the word, both kinds are written the same
// way, and the rule reads a neighbour rather than a spelling. The bound half
// gains nothing from this that a word list would not have given it; the other
// half could not be done any other way, and one mechanism is cheaper than two.
//
// WHAT IS NOT HERE IS THE REST OF THE SECOND KIND, deliberately. `akin to`,
// `pursuant to` and `in spite of` all fit the shape and none is in the list,
// because `akin` and `pursuant` and `spite` are words a teacher might want and
// nothing on any page has yet said they were lost. The bound half is safe by
// construction and needs no evidence; the other half needs the page first, and
// `due to` is the one the page produced. That is the same standard the `max.`
// clause and the slash rule are held to further up this file.
//
// THE GROUP IS DECLINED ONLY IF EVERY OCCURRENCE IS INSIDE A PHRASE, which is
// the whole of the safety and the reason `due` can be on the list at all. A
// passage writing "due to" four times and "the essay is due" once still cards
// `due`, over the sentence that used it as a word. That is `isAbbreviated`'s
// rule exactly and for the same reason: a filter firing on one sighting in five
// would cost cards nobody was defending.
//
// SURFACES, NOT LEMMAS, and this is not a preference. The fold shortens several
// of these — `vice` to `vic`, `fide` to `fid`, `carte` to `cart`, `facie` to
// `faci`, `jure` to `jur` — so a list written in lemmas would be a list of
// strings no article contains, and a third of it would silently never match.
// `isAbbreviated` matches surfaces above for a related reason.
//
// BIGRAMS ONLY. Every phrase witnessed is two words, and a three-word entry
// would need a rule about which of the three the middle word belongs to before
// it could be written down at all. `as well as` and `in spite of` are not here.
// What a bigram list still reaches inside a longer phrase is its adjacent
// pairs, which is why `quid pro quo` is written as `quid pro` and `pro quo`
// rather than left out.
//
// AND `per se` IS NOT HERE BECAUSE IT CANNOT FIRE. `per` is band 1 and `se` is
// under the length floor, so neither half ever reaches this point and the entry
// would decline nothing on any page ever written. It was in the first draft.
// The sweep that produced the "52 entries" figure above is what found it, and
// the test in tests/logic.test.js § phrases is what keeps the next one out —
// an entry that cannot fire is decoration, and decoration in a filter list is
// indistinguishable from coverage.
// ------------------------------------------------------------
const PHRASES = [
  // Latin and French tags, which are where English keeps most of its bound
  // halves and are common in exactly the register a teacher highlights.
  'ad hoc', 'ad hominem', 'ad infinitum', 'ad nauseam',
  'a priori', 'a posteriori',
  'bona fide', 'bona fides',
  'carte blanche',
  'de facto', 'de jure',
  'ex gratia', 'ex officio',
  'fait accompli',
  'force majeure',
  'in absentia', 'in extremis', 'in lieu', 'in memoriam', 'in situ',
  'in vitro', 'in vivo',
  'inter alia',
  'ipso facto',
  'laissez faire',
  'lingua franca',
  'modus operandi', 'modus vivendi',
  'non sequitur',
  'per annum', 'per capita', 'per diem',
  'prima facie',
  'pro bono', 'pro rata',
  'quid pro', 'pro quo',
  'rigor mortis',
  'status quo',
  'sui generis',
  'tabula rasa',
  'terra firma',
  'vice versa',
  'vox populi',
  // English, where the bound half is a word that survives in one phrase and
  // nowhere else at all.
  'behalf of',
  'by dint',
  'and fro',
  'and cranny',
  'kith and',
  'short shrift',
  'bated breath',
  // And the one entry whose word is not bound. See WHAT IS NOT HERE above.
  'due to'
];

// Keyed on the FIRST word, holding every second word that may follow it, so the
// lookup is one Map hit per token rather than a scan of the list. Built from
// the literal above at load, which is the only way the two cannot drift.
const PHRASE_AFTER = new Map();
for (const phrase of PHRASES) {
  const gap = phrase.indexOf(' ');
  const head = phrase.slice(0, gap);
  let after = PHRASE_AFTER.get(head);
  if (!after) { after = new Set(); PHRASE_AFTER.set(head, after); }
  after.add(phrase.slice(gap + 1));
}

// Two tokens are written side by side only if NOTHING but whitespace lies
// between them, and the refusals that buys are the point of the function.
// A full stop refuses "The fee is due. To begin with, ..." — which is the case
// that would otherwise cost a real card on a real page. A bracket, a comma or a
// quotation mark refuses the rest. So does a skipped identifier: `tokenise`
// drops the letter-runs inside a URL or a DOI, so two surviving tokens can sit
// far apart in the text with `10.1017/chol...` between them, and the gap test
// sees the non-space and says no. A phrase is a thing somebody wrote; this asks
// whether they wrote it.
function sideBySide(a, b, text) {
  return b.start > a.end && /^\s+$/.test(text.slice(a.end, b.start));
}

function inPhrase(toks, i, text) {
  const here = toks[i].surface.toLowerCase();
  const next = toks[i + 1];
  if (next && sideBySide(toks[i], next, text)) {
    const after = PHRASE_AFTER.get(here);
    if (after && after.has(next.surface.toLowerCase())) return true;
  }
  const prev = toks[i - 1];
  if (prev && sideBySide(prev, toks[i], text)) {
    const after = PHRASE_AFTER.get(prev.surface.toLowerCase());
    if (after && after.has(here)) return true;
  }
  return false;
}

// Every occurrence, or none of them. See THE GROUP IS DECLINED ONLY IF above —
// this line is where `due` is safe and where the whole rule would otherwise
// take words off pages that were using them properly.
function isAlwaysInAPhrase(g) {
  return g.phrased === g.occurrences.length;
}

// ------------------------------------------------------------
// THE ONE WAY TO TURN THE BLOCKLIST OFF, AND WHY IT IS A WORD
//
// Added for adult and advanced classes, through Pro.
// The comment inside `harvest` below has said that there is
// deliberately no option to turn the filter off, and the argument it gives is
// still right: "an `opts.taboo === false` would be one keystroke from an
// unfiltered deck". What changed is that a legitimate caller now exists, and
// what has not changed is that a keystroke must not be enough.
//
// So the switch is not a boolean. `undefined`, `null`, `false`, `0`, `''`, a
// missing option, a settings blob that failed to parse, a stored value written
// by a hand that guessed — every one of those is not this string, and every one
// of them therefore FILTERS. There is no value a caller reaches by accident
// that unfilters, and the only way to write one is to mean it.
//
// It is also greppable, which is the second half of the design. The token is
// stated HERE and nowhere else in the shipped tree: settings-core.js reads it
// off this file's exports rather than holding a copy, and the page never
// names it at all — it passes whatever settings-core hands back. So a second literal
// occurrence in shipped source is a question worth asking, and the gate asks
// it.
const UNFILTERED = 'ADULT-CLASS-NO-BLOCKLIST';

// Every spelling the article used for one lemma, asked one question. The
// blocklist note inside `harvest` is the argument for why it is every spelling
// and not the one that wins the vote; this exists so the three filters that
// need that behaviour share it rather than each writing the loop again.
function someSurface(group, test) {
  for (const surface of group.surfaces.keys()) {
    if (test(surface)) return true;
  }
  return false;
}

// ------------------------------------------------------------
// HARVEST — the whole pipeline
//
// `text`   full text of the block the teacher highlighted inside
// `from`   start of the selection within it
// `to`     end of the selection
//
// Context sentences come from `text`; candidates only from [from, to). That
// asymmetry IS the product: a highlight ending mid-sentence still yields a
// whole sentence on the back of the card.
// ------------------------------------------------------------
function harvest(text, from, to, options) {
  const opts = options || {};
  const limit = opts.limit || 30;
  const bandOf = opts.bandOf || (() => 5);
  const isKnown = opts.isKnown || null;
  // Defaults to "no list", so a caller that does not pass one gets the old
  // behaviour rather than a crash — the capitalisation heuristic still runs.
  const isName = opts.isName || (() => false);
  // The silent-e fold's predicate, built here rather than asked for, because
  // every caller already passes both halves of it and a third option would be
  // a third thing to forget. Null when there is no band list at all, which is
  // the signal lemmatise reads as "do not fold".
  const isHeld = isKnown ? (w) => isKnown(w) || isName(w) : null;
  // ONE key function, used by the census and by the grouping below. Not two
  // calls that happen to be spelled the same — see filedLemma's note.
  const keyOf = (tok) => filedLemma(tok, isKnown, isHeld);

  // THE BLOCKLIST, resolved once and REQUIRED. taboo.js carries the argument;
  // the short form is that band 5 is defined by absence from every list and
  // BAND_WEIGHT puts absence at the top of the deck, so a slur in the passage
  // is not a word that might slip onto a card, it is the FIRST card.
  //
  // HARD, where the segmenter below was soft in the extension, and the
  // asymmetry was the whole decision. (Since the port both are static imports,
  // so neither can be missing once the page has loaded; the argument and this
  // guard stay.) A missing segmenter costs card quality and the teacher can see
  // what they got. A missing blocklist costs nothing visible: the cards keep
  // coming, the deck looks ordinary, and the one thing the file exists to
  // prevent is back at the top of it with nothing to notice. taboo.js already
  // throws rather than degrade, for that reason and in those words; this is the
  // same rule standing at the call site, where the option to skip would be.
  //
  // There was deliberately no option to turn it off. An `opts.taboo === false`
  // would be one keystroke from an unfiltered deck and would have to be trusted
  // at every call site forever; the harness builds its control from a scratch
  // copy of the module graph whose taboo.js blocks nothing, which is a thing
  // only a harness can do.
  //
  // THAT CHANGED AND THE ARGUMENT DID NOT. An adult class is a
  // real caller, and Pro offers the switch — so `opts.unfiltered`
  // exists and is a string that must match UNFILTERED exactly. The keystroke
  // objection is answered rather than overruled: there is no falsy value, no
  // absent option and no misparsed setting that reaches the unfiltered path.
  // See the block above this function for the whole of it.
  //
  // THE FILE IS STILL REQUIRED, unfiltered or not. `taboo.js` missing is a
  // half-loaded page and not a choice anybody made, and the two must never
  // arrive at the same deck by different roads.
  const taboo = Taboo;
  if (!taboo || typeof taboo.blocks !== 'function'
      || typeof taboo.borderline !== 'function') {
    throw new Error(
      'harvest: taboo.js must be loaded before vocab-core.js can build a deck. ' +
      'Every deck is filtered against the blocklist unless the caller passes ' +
      'the unfiltered token, and a page that cannot load the list has not ' +
      'passed anything — it fails loudly rather than card a slur.');
  }

  // ---- the three classroom controls ----------------------------------------
  //
  // ADDITIVE, ADDITIVE, AND THE ONE THAT IS NOT. The teacher's own terms and
  // the young-learner tier can only ever remove more words than the floor
  // does. `unfiltered` is the single subtractive control in this product, it
  // is a Pro setting, and it is written so that reaching it is
  // deliberate — see UNFILTERED above.
  const unfiltered = opts.unfiltered === UNFILTERED;
  const strict = opts.strict === true && !unfiltered;

  // THE TEACHER'S OWN TERMS ARE MATCHED EXACTLY, AND NOT FOLDED.
  //
  // Every other list in this pipeline is put through the lemmatiser in each of
  // its inflected shapes, and this one deliberately is not. The fold derives a
  // SHORTER key — `whore` to `whor`, `asses` to `as` — and taboo.js pays for
  // two hand-written exemptions because of it. Those were found by sweeping a
  // dictionary; a term typed into a box at eight in the morning gets no sweep,
  // and a teacher who blocks `asses` and loses every sentence containing `as`
  // has been handed a defect by a feature.
  //
  // So the term matches a card's SURFACE or its LEMMA and nothing else. What
  // that covers, stated rather than implied: entering the base form catches
  // the regular inflections, because those group under the base form's lemma —
  // `protest` takes `protests`, `protested` and `protesting` with it. What it
  // does not catch is an irregular whose lemma is not the word typed, and the
  // -er and -est forms the lemmatiser leaves alone. Both are cheap for the
  // teacher to fix by adding the other form, and neither can cost them a word
  // they did not name.
  const yours = new Set(Array.isArray(opts.also) ? opts.also
    .filter((w) => typeof w === 'string')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean) : []);

  const api = Sentences;
  const sentences = api ? api.segment(text) : [];
  // The abbreviation list comes from the same dependency as the sentences, soft
  // in the extension and static now — see ABBREVIATIONS ARE NOT VOCABULARY.
  const abbrev = api ? api.ABBREV : null;
  const census = censusCapitals(text, sentences, keyOf);

  // Group the selected tokens by lemma, keeping every occurrence so that
  // sentence choice has something to choose between.
  //
  // WALKED BY INDEX RATHER THAN BY VALUE, which is the phrase filter's doing.
  // A token's neighbours have to be read from the WHOLE token stream and not
  // from what survives this loop: `de` is two letters and the floor below drops
  // it, `to` is band 1 and is dropped further down, and both of them are the
  // evidence that `facto` and `due` are halves of something. A phrase check
  // reading only the grouped tokens would find no phrases at all.
  const groups = new Map();
  const toks = tokenise(text, from, to);
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const lemma = keyOf(tok);
    if (lemma.length < 3) continue;
    // An all-capitals token is an acronym or a shout, never a headword.
    if (tok.surface.length > 1 && tok.surface === tok.surface.toUpperCase()) continue;
    let g = groups.get(lemma);
    if (!g) {
      g = { lemma, occurrences: [], surfaces: new Map(), phrased: 0 };
      groups.set(lemma, g);
    }
    g.occurrences.push(tok);
    // Counted here, beside the occurrence it belongs to, so the two can never
    // be out of step — the filter below compares them and a count taken
    // anywhere else would be a second traversal obliged to agree forever.
    if (inPhrase(toks, i, text)) g.phrased++;
    g.surfaces.set(tok.surface, (g.surfaces.get(tok.surface) || 0) + 1);
  }

  // `taboo` is counted like every other refusal so the gate has something to
  // measure — a filter whose work leaves no trace is a filter nobody can hold a
  // number against. It is deliberately NOT rendered: the page reads `name`,
  // `band1` and `unbandable` by name and ignores this one, because "1 set aside
  // as offensive" tells the teacher a slur was in their passage and points at
  // the word without naming it. That was the recommendation when this landed and
  // it is now the ruling, with the silence
  // pinned by tests (tests/review.test.js) rather than resting on this comment.
  //
  // `abbrev` is the one refusal that is not merely counted. The words go out
  // beside it, because an abbreviation is the one thing on this list that is
  // safe to say out loud and checkable at a glance when the rule is wrong.
  // The array is the reason the filter sits at
  // the bottom of the loop rather than the top; see its call site.
  //
  // `tier` and `yours` joined it, counted separately from
  // `taboo` and from each other because they are three different sentences to
  // put in front of a teacher. `taboo` stays the silent one — the blocklist
  // ruling is about pointing at a slur in somebody's passage, and neither of
  // the other two points at anything the teacher did not choose.
  //
  // `phrase` joined them and is counted and named, on the
  // abbreviation's reasoning rather than the blocklist's: a teacher looking at
  // their own page can see whether "due to" was really written there, which is
  // the test the abbreviation ruling set for a refusal that is safe to say out loud. It
  // names no word, unlike the abbreviations — the count is a number of cards,
  // and a list would be a list of half-words nobody wrote on purpose.
  const rejected = {
    band1: 0, name: 0, unbandable: 0, taboo: 0, abbrev: 0, tier: 0, yours: 0,
    phrase: 0, alone: 0
  };
  // THE WORDS BEHIND THREE OF THOSE NINE COUNTS, and the six it holds no key
  // for are the rulings rather than an oversight. `taboo` is silent by the
  // blocklist ruling and has no home here to be silent in; `tier` and `yours`
  // are counted and never named, because the tier's refusals are exactly the
  // borderline words and a list of them is the same disclosure the silence was
  // built to prevent; `phrase` is counted and never named by its
  // ruling, because printing `facto` shows the teacher a string their page does
  // not contain as a word; `alone` is counted and never named, by the owner's
  // ruling that a teacher rarely needs the headings back. `abbrev` is missing
  // for the opposite reason — it has been named and its words are already in
  // `abbreviated`
  // below, so a second copy here would be two lists obliged to agree forever.
  //
  // THE COUNTS DO NOT MOVE. Every push below sits beside a `rejected` bump that
  // was already there and changes neither its condition nor its number, so the
  // export line and the panel's note say exactly what they said before. What is
  // new is that three of the numbers can now be opened.
  //
  // THE BANDS ARE SPLIT HERE AND JOINED ON THE SCREEN. `rejected.band1` counts
  // both, because "already common" is one idea and the teacher is told one
  // number; these are two arrays because the panel serves band 2 first, and
  // band 2 is where a teacher who disagrees with the selection will disagree.
  // Nothing about the pipeline treats them differently — see the note over the
  // band branch below, which this must not be read as contradicting.
  const declined = { band1: [], band2: [], name: [], unbandable: [] };
  const abbreviated = [];
  const cards = [];

  // MAY THIS WORD BE WRITTEN DOWN, asked in one place so that no two call sites
  // can answer it differently, and asked ONLY for the branch that runs before
  // the blocklist does.
  //
  // The three loud refusals below are safe to name without asking, and that is a
  // property of the ORDER rather than of this function: the floor, the tier and
  // the teacher's terms are all asked before the band, so a word that reaches
  // the band branch has already been let past every list. The one branch that
  // does not have that protection is `unbandable`, which is deliberately FIRST
  // — before the blocklist is consulted at all.
  //
  // WHICH WAS HARMLESS FOR AS LONG AS IT WAS A COUNT. A blocked word written
  // with a hyphen is counted as unbandable and never carded, and a number
  // discloses nothing. The moment those words are named on a surface, the
  // ordering that was correct for counting becomes the one door in this
  // pipeline that a slur can walk out of, so it is shut here rather than in the
  // caller — a rule the panel had to remember is a rule the next surface
  // forgets.
  //
  // IT STRIPS BEFORE IT ASKS, and that is the whole mechanism. `blocks()` is
  // never given the hyphenated form, because the hyphenated form is not what the
  // list holds and the list answers `false` to it — which is precisely how the
  // word arrived in this branch instead of the taboo one.
  //
  // IT TAKES THE GROUP AND NOT THE LEMMA, for the reason written over the
  // blocklist branch below: a group holding a blocked spelling and an innocent
  // one must be judged on every spelling it holds, or the innocent one carries
  // the other past the question. Same rule, same reason, one branch earlier.
  const nameable = (g) => {
    const forms = [g.lemma, ...g.surfaces.keys()];
    for (const form of forms) {
      const low = form.toLowerCase();
      const letters = low.replace(/[^a-z]/g, '');
      if (!letters) return false;
      if (taboo.blocks(letters, letters)) return false;
      if (strict && taboo.borderline(letters, letters)) return false;
      // The teacher's own terms, matched the way `yours` is matched everywhere
      // else and once more against the stripped form. One ruling holds that a
      // word the teacher typed themselves is not a disclosure TO the teacher,
      // and that ruling is about a count in a file. This is a word on a panel,
      // which is the surface the blocklist ruling was about, so it takes that answer.
      if (yours.has(low) || yours.has(letters)) return false;
    }
    return true;
  };

  // WHAT THE TEACHER SAW, not what the pipeline reduced it to, and the
  // precedent is the abbreviation list twenty lines down: `Inc.` is pushed as
  // its surface because a teacher checking a refusal is checking it against
  // their own page. The lemma is our word for the word. Every note in
  // `setAsideNote` is worded for the page for the same reason, and a list that
  // said `consequence` where the article said `consequences` would be the first
  // surface in this product to answer in the pipeline's vocabulary.
  const asWritten = (g) => g.occurrences[0].surface;

  // How many cards already carry each sentence, keyed on its offset in the
  // block. Read and written by the loop below; see SENTENCE CHOICE for why.
  //
  // WORDS ARE SERVED IN DOCUMENT ORDER, which is the order `groups` was built
  // in, and that is a decision rather than an accident. Serving them in score
  // order would be circular — `score` reads the sentence it is trying to pick
  // — and would leave every entry holding a score computed from a sentence it
  // no longer has. Document order is decided before any of this runs, so the
  // scores below are computed from the sentences the cards actually ship with.
  //
  // The cost, stated rather than hidden: a candidate that ranks below `limit`
  // and never becomes a card still marks its sentence as taken on the way
  // past. On the decks measured so far every candidate fitted inside the
  // limit, so this has never fired; it would take a passage yielding more than
  // 40 cards, and the effect would be a later card preferring a fresher
  // sentence than it strictly had to.
  const used = new Map();

  for (const g of groups.values()) {
    // FIRST, because nothing below this line is meaningful for a lemma the
    // lists cannot hold. Asking bandOf and then reasoning about the answer is
    // exactly the mistake the comment above BANDABLE describes.
    if (!BANDABLE.test(g.lemma)) {
      // THE COUNT IS UNCONDITIONAL AND THE WORD IS NOT, and the gap between
      // those two lines is deliberate. A teacher who is told "6 written with a
      // hyphen or apostrophe" and can open five of them has been told the
      // truth about the sixth by the number; a teacher shown the sixth has
      // been shown something the blocklist exists to keep off this screen.
      rejected.unbandable++;
      if (nameable(g)) declined.unbandable.push(asWritten(g));
      continue;
    }
    // SECOND, and before bandOf is asked anything, because no band means
    // "never". Filing a slur as band 3 weighs it 2.0 instead of 3.0, which
    // demotes it from the first card to the third and still cards it. Asking
    // the band and then reasoning about the answer is the same mistake the line
    // above declines to make, one word over.
    //
    // EVERY SURFACE IN THE GROUP, not the one that wins the vote below. The
    // vote picks the commonest spelling, so a group holding a blocked surface
    // and an innocent one would card on the innocent one and carry the blocked
    // occurrences' sentence onto the back with it — the sentence is verbatim
    // from the article, so that is the slur on the card by the other door.
    // Both halves go to every call, which is the rule taboo.js states and the
    // reason it exports no one-argument predicate.
    //
    // THREE QUESTIONS, IN THIS ORDER, and the order decides which count the
    // word lands in when more than one would take it. The floor is asked
    // first, so a word that is on the floor AND on the teacher's list is
    // counted silently — announcing "1 of your own terms" about a slur would
    // leak by the door the silence was built to shut. The tier is asked before
    // the teacher's terms for the same reason and with less at stake.
    //
    // `unfiltered` skips the floor and the tier together. It cannot skip the
    // teacher's own terms: those are not the thing being switched off, and a
    // teacher who turns the blocklist off for an adult class has not asked to
    // stop blocking the word they typed in themselves this morning.
    // ONE QUESTION AT A TIME, ACROSS EVERY SURFACE, and not one surface at a
    // time across every question. The first draft of this had the loops the
    // other way round, which lets a group whose rarer spelling is on the
    // teacher's list and whose commoner one is on the FLOOR be counted as the
    // teacher's — the silent refusal losing to the loud one on nothing but
    // which spelling `surfaces` happened to yield first.
    let why = '';
    if (!unfiltered && someSurface(g, (s) => taboo.blocks(s, g.lemma))) {
      why = 'taboo';
    } else if (strict && someSurface(g, (s) => taboo.borderline(s, g.lemma))) {
      why = 'tier';
    } else if (yours.size && (yours.has(g.lemma.toLowerCase())
        || someSurface(g, (s) => yours.has(s.toLowerCase())))) {
      why = 'yours';
    }
    if (why) { rejected[why]++; continue; }
    const band = bandOf(g.lemma);
    // Bands 1 and 2 are both "the learner already has this". They are separate
    // lists because they were authored at different times against different
    // questions, not because the pipeline treats them differently — and the
    // teacher is told one number, because "already common" is one idea.
    // NO `nameable` GUARD ON THIS BRANCH OR THE TWO BELOW IT, and the absence
    // is load-bearing rather than an omission. Nothing reaches here that the
    // floor, the tier or the teacher's list would have taken: all three were
    // asked twenty lines up and every one of them `continue`d. Adding the guard
    // would read as prudence and would in fact hide that property, so that a
    // later hand reordering these branches would find the leak silently
    // covered instead of loudly open.
    if (band === 1 || band === 2) {
      rejected.band1++;
      declined[band === 1 ? 'band1' : 'band2'].push(asWritten(g));
      continue;
    }
    if (looksLikeName(census.get(g.lemma))) {
      rejected.name++;
      declined.name.push(asWritten(g));
      continue;
    }
    // The capitalisation heuristic above cannot see a name that only ever
    // opens a sentence — "Donald Trump is trying again" gives it nothing to
    // work with, and "donald" went out on a card. The list is consulted only
    // here, after every band has declined the word, so ordinary words that
    // happen to be names ("mark", "hope", "april") never reach it.
    if (band === 5 && isName(g.lemma)) {
      rejected.name++;
      declined.name.push(asWritten(g));
      continue;
    }
    // LAST, after every other refusal, so that what this leaves behind is a
    // count of CARDS LOST and not of refusals made. That distinction is the
    // whole reason the teacher can be told: `Inc.` in section 11 of the article
    // is declined here and was on its way to the name filter regardless, so a
    // note built on the earlier position announced a loss that had not happened
    // — one firing in four across every corpus in the tree.
    //
    // The ordering this replaces argued that asking `bandOf` about `etc`
    // presumes `etc` is a word. That reads well and did not survive being
    // checked: the outcome is `continue` either way, and moving the filter down
    // changed no card, no count and no sentence in any of 35 corpora. What is
    // mechanical rather than rhetorical is the blocklist above, which must see
    // every surface whatever else is true of one, and therefore stays first.
    if (isAbbreviated(g.occurrences, text, abbrev)) {
      rejected.abbrev++;
      abbreviated.push(g.occurrences[0].surface + '.');
      continue;
    }
    // AND LAST OF ALL, for the reason stated immediately above and with the
    // same kind of measurement behind it. Thirteen of the 81 words the phrase
    // list names never reach this line: eight are under the length floor and
    // five — `and`, `breath`, `force`, `per`, `short` — are band 1 or 2 and
    // were counted as "already common" a few lines up. Announcing those here
    // would report a loss that had not happened, which is the defect the `Inc.`
    // note above describes and the reason both filters sit at the bottom.
    //
    // AFTER THE ABBREVIATION AND NOT BEFORE IT, though nothing can reach both:
    // `isAbbreviated` needs every occurrence stop-closed and `sideBySide` needs
    // a whitespace gap and a word after it, so the two are disjoint by
    // construction rather than by luck. The order is therefore free, and it is
    // written the way it is because the abbreviation rule is the older one and
    // moving it would change nothing but the diff.
    if (isAlwaysInAPhrase(g)) { rejected.phrase++; continue; }

    // The card FACE is the surface form as it appeared in the article — the
    // commonest one where they differ. Showing the lemma instead would quietly
    // break the promise that this is the word as the class will meet it.
    let word = g.occurrences[0].surface;
    let best = 0;
    for (const [surface, n] of g.surfaces) {
      if (n > best) { best = n; word = surface; }
    }

    // THE POSSESSIVE IS NOT PART OF THE WORD. It was graded as `commission`
    // and shown as `commission's` — the lookup strips it, the face did not,
    // and the two had no reason to agree because nothing made them share the
    // rule. They share POSSESSIVE now. Measured before it was written: 1 face
    // in 232 cards over every corpus in the tree, and that one had been
    // sitting inside the passage the harness uses to check possessives.
    //
    // The surface-form rule is what this looks like it contradicts and does
    // not. That rule exists so the class meets `gerrymandering` and not the
    // stem `gerrymander`; a possessive is not a stem, it is a grammatical
    // form the article happened to use, and putting it on the front makes the
    // card teach the apostrophe rather than the word.
    //
    // AFTER the vote, not before it. The vote counts surfaces, and
    // `commission's` and `commission` are separate keys — but both strip to
    // the same face, so a possessive can never change WHICH word is shown,
    // only the margin it wins by. Merging the keys first would be a different
    // change: it would let a singular outvote a plural it currently loses to,
    // which is a ranking decision about inflections and not about apostrophes.
    word = word.replace(POSSESSIVE, '');

    // THE SENTENCE IS CHOSEN FROM THE OCCURRENCES THAT CARRY THAT FACE, and
    // this ordering is the whole of it — the vote used to run after the choice
    // and the two never spoke.
    //
    // Occurrences group by LEMMA, so `transitioned` and `transition` are one
    // group with one card between them. Handed the whole group,
    // `chooseSentence` ranks every sentence either surface appears in and
    // returns the best; the vote, independently, returns the commonest
    // surface. Nothing made those the same occurrence, and a
    // real article proved it: the face tied at one each and kept the earlier,
    // the sentence key preferred the shorter and later, and the card read
    // `transitioned` over a sentence holding only `transition`. 1 of 29 cards.
    //
    // Filtering first is the fix that keeps the face rule intact. Choosing the
    // sentence first and taking its surface would satisfy the invariant just as
    // well and would be wrong: it hands the face to whichever occurrence the
    // ranking happened to like, so an article using `transition` nine times and
    // `transitioned` once could card the once. The face is what the class
    // meets and what deduplication is keyed on; the sentence is a preference
    // order that degrades gracefully. So the more important choice is made
    // first, and the ranking runs on what is left.
    //
    // The match is case-insensitive ON PURPOSE. "Transition" opening a
    // sentence and "transition" inside one are separate keys in the vote — the
    // face rule below exists precisely because they are — and pinning the
    // sentence to the capitalised occurrence would narrow the choice over a
    // difference that is about to be erased. That last clause was true of only
    // part of the population previously, when the erasure stopped being
    // conditional; the fold below is what the two rules now have in common.
    //
    // A group with one surface is unaffected, which is nearly all of them: the
    // filter returns the occurrences it was given, and `used` sees the same
    // counts it always did.
    // The possessive comes off BOTH sides of this match, or the strip above
    // breaks it. A lemma seen only as `auditor's` has a face of `auditor` and
    // not one occurrence whose raw surface equals it, so the pool would be
    // empty and the card would go out with no sentence at all — which is the
    // one thing a card cannot do and still be a card. Stripping both sides
    // also gathers `commission's` and `commission` into one pool, which is
    // what they always were: one group, one card, and now one set of
    // sentences to choose from rather than whichever half won the vote.
    const face = word.toLowerCase();
    const bearing = g.occurrences.filter(
      (o) => o.surface.replace(POSSESSIVE, '').toLowerCase() === face);
    // LAST OF THE REFUSALS, after the face, because the lines it reads are the
    // face's. Only where some occurrence has a sentence and every such one
    // stands alone: a word with no sentence at all keeps the card it had.
    const lines = bearing.map((o) => sentenceAtSafe(sentences, o.start))
      .filter((idx) => idx >= 0).map((idx) => sentences[idx]);
    if (lines.length && lines.every((s) => standsAlone(s, text))) {
      rejected.alone++;
      continue;
    }
    const sentence = chooseSentence(bearing, sentences, used, text);
    if (sentence) used.set(sentence.start, (used.get(sentence.start) || 0) + 1);

    // ...and the face goes out in lower case, always. Not a shrug: it is the
    // only spelling consistent with this word HAVING a card at all.
    //
    // The test was `midCap === 0` previously — keep the capital where the
    // word was seen capitalised away from a sentence start. Read that against
    // the name filter above and it cannot fire on anything else. A card exists
    // only where `looksLikeName` said no, and it says no on `lower > 0`; a
    // capital survives only where `midCap > 0`. Both together are `lower > 0 &&
    // midCap > 0`: the word was met in lower case IN THIS VERY BLOCK, which is
    // the strongest evidence the block has that it is an ordinary word, and the
    // face kept a capital regardless. There is no second route to a capital on
    // a face, so the condition never selected a case — it named one. Measured
    // before it was changed: 41 capitalised faces over fifteen corpora, 41 of
    // them that shape.
    //
    // WHAT A MID-SENTENCE CAPITAL ACTUALLY SAYS, which is why the old rule
    // sounded right. In "the 5th Cavalry Division moved at dawn" the capital is
    // real and is not positional — and it belongs to the DIVISION. The word on
    // the card is `cavalry`; the name it was borrowed into is not the word, and
    // a headword does not inherit a capital from a phrase it appears inside.
    // The page says it 38 times over: `History` from "A History of the English
    // Language", `Maritime` from "International Maritime Organization", `Nasal`
    // from a consonant chart's header row, `Redrawn` from this repository's own
    // fixture headline. It costs `Midlands` and `Wikidata`, which are names the
    // filter should have taken and did not; that is the name filter's bill, and
    // paying it here would mean the face overruling a verdict it cannot see.
    //
    // AND THE CARD ALREADY SAID SO. The sentence beneath the face is matched
    // case-insensitively — deliberately, see above, "about to be erased" — so
    // where the capital was NOT erased the card contradicted itself: 14 of the
    // 41 printed a front their own back refuses, `Redrawn` over "The maps were
    // redrawn without meaningful consultation." That is the defect closed earlier,
    // arriving by the other door, and it is what makes this a fix
    // rather than a preference.
    //
    // The finding stands, and is why `lower === 0` is not a test
    // here either: meeting "nonetheless" mid-sentence is the strongest evidence
    // that the "Nonetheless" opening the sentence before it is positional. That
    // rule and this one now give one answer instead of splitting the field.
    word = word.toLowerCase();

    const entry = {
      word,
      lemma: g.lemma,
      band,
      count: g.occurrences.length,
      sentence: sentence || null,
      // Taken here, AFTER the possessive strip and the lower-casing above,
      // because both of those change `word` and neither changes the text of
      // the sentence — which is what the offset indexes. Null where the
      // sentence came back as a fallback the face does not sit inside; the
      // Pro path renders those unbolded rather than guessing.
      target: targetIn(sentence, bearing)
    };
    entry.score = score(entry);
    cards.push(entry);
  }

  // Rank, then break ties on the LEMMA so two runs never disagree. This line
  // said "document order" previously and the code beneath it has always
  // said `localeCompare`; document order is what the LOOP above uses, and the
  // comment had drifted one step down the file. Alphabetical is the right rule
  // here for the reason the loop's is not: `cards` is rebuilt from a Map whose
  // order is stable, but a tie broken on position would move every tied card
  // when an earlier one is added or filtered out — which is exactly what the
  // blocklist above now does.
  cards.sort((a, b) =>
    b.score - a.score ||
    a.lemma.localeCompare(b.lemma)
  );

  return {
    cards: cards.slice(0, limit),
    stats: {
      sentences: sentences.length,
      candidates: groups.size,
      kept: Math.min(cards.length, limit),
      dropped: cards.length > limit ? cards.length - limit : 0,
      rejected,
      // What the teacher's OWN SETTINGS took, as one number, and it is not a
      // sum of `rejected`. Bands, names and abbreviations are the ordinary
      // pipeline declining words for reasons no teacher configured; this is
      // the answer to "what did my settings do", which is the question the
      // export line exists to answer.
      //
      // THE BLOCKLIST CAME OUT OF IT, by ruling. It was in
      // this sum from the day the sum was written, and the export line has
      // read "set aside by your <NAME> settings" for just as long — so the
      // number answered a question about the teacher's settings with a figure
      // that included the free floor, which is the one refusal here nobody
      // configures. The floor is not a setting. It is on for everybody, and
      // the only control over it takes this count to zero rather than adding
      // to it, because `unfiltered` skips the floor and the tier together
      // above. A number that moves when the teacher changed nothing is the
      // same defect as a number that moves when the band lists decline a word
      // — which the paragraph above already refuses, arriving through the one
      // door that paragraph had left open.
      //
      // NOT BROKEN OUT, and the breakdown is one line away in `rejected` for
      // any caller that has a reason. This number goes into a file a teacher
      // e-mails to thirty students, and the young-learner tier's refusals are
      // exactly the borderline words — so "2 set aside as offensive" in a deck
      // about the Second World War is the blocklist ruling broken by a
      // different door, even with the blocklist out of the sum. The panel
      // prints this same number and names no reason either, which is the whole
      // of what the two surfaces now agree about.
      filtered: rejected.tier + rejected.yours,
      // Counts live in `rejected` and stay counts; this is a different kind of
      // thing and sits beside it rather than inside it. Document order, which
      // is the order the teacher met them in.
      abbreviations: abbreviated,
      // The words, for the three counts that have them. See the block over the
      // declaration for why the other six have none.
      declined,
      // WHAT THE NOTE ANNOUNCES AND THE LIST DOES NOT OPEN, which is the one
      // number that keeps the two surfaces from contradicting each other. A
      // teacher told "3 written as part of a phrase, 2 by your settings" who
      // opens the list and finds neither has caught the product in a lie; this
      // is the size of the difference, so it can be owned on the screen.
      //
      // `taboo` IS NOT IN IT, and that is the blocklist ruling holding at the
      // one place it would most easily be broken. The silence is on both
      // surfaces or it is on neither: a count of "and 1 more" that moves when a
      // slur is in the passage announces the slur by arithmetic, which is the
      // same disclosure the ruling refused, arriving as a subtraction. What
      // this adds up is exactly what `setAsideNote` already says out loud.
      withheld: rejected.phrase + rejected.tier + rejected.yours + rejected.alone
    }
  };
}

export {
  lemmatise, foldSilentE, tokenise, harvest, censusCapitals, looksLikeName,
  opensAnAuthorSlot,
  chooseSentence, score, wordCount, IRREGULAR, NO_STRIP,
  // Exported so the harness can sweep it rather than trust it. The check
  // that matters is that no entry is dead — see § phrases — and a list held
  // privately here would be a list nobody could hold a number against.
  PHRASES,
  // The unfilter token, exported so that settings-core.js can pass it
  // without holding a second copy of the string. One statement of what turns
  // the blocklist off; everything else refers to this one.
  UNFILTERED,
  // Exported for INVARIANT 7 and no runtime caller. The check asserts every
  // list entry matches this, so it has to be THIS one: a copy in the harness
  // would let the two drift apart and still go green.
  BANDABLE
};
