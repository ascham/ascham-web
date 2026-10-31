// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Settings core.
// ============================================================
// What the teacher chose, and what the harvest is allowed to do about it.
//
// THE CONTROLS, ENUMERATED HERE AND COUNTED NOWHERE
// The settings offer the teacher's own added terms, a young-learner tier,
// an off-switch for adult classes, a count of what was set aside, and — both
// added — a cloze deck and a deck tag of the teacher's own. Four of
// those are stored: the tier and the off-switch are the SAME DIAL at two of
// its three positions, and the count is a property of the paid deck rather
// than a preference. Two settings that can contradict each other — "strict"
// and "off" at once — is a bug with a user interface on it.
//
// THE LIST IS HERE AND THE NUMBER IS NOWHERE, deliberately. In the
// extension three files each said "the four controls" in their own words,
// so adding one meant a fourth file remembering to change three. That is the gate ledger's failure exactly — three copies, one
// of them right — and the fix is the same one: the fact lives where it is
// declared, and everything else names it without counting it.
//
// THIS FILE CANNOT UNLOCK ANYTHING, WHICH IS THE POINT OF IT BEING SEPARATE
// It reads a store the teacher can edit. So nothing here is trusted: every
// value that comes back is coerced against a shape declared in this file, and
// every coercion that fails lands on the FREE FLOOR rather than on whatever
// was written. A hand-edited blob saying `{"tier":"off"}` gets a deck with the
// blocklist on, because `effective()` below asks the licence before it asks
// the store, and the licence is the only thing that can answer yes.
//
// THAT ORDER IS THE WHOLE GUARANTEE. Pro offers a switch that turns
// the filter OFF, which is the one direction a bug must never take on its own.
// So the unpaid answer is not "the stored settings, minus the paid ones" — it
// is the defaults, entire, with the stored blob unread. There is no path
// through this file where a free copy consults what the store says.
//
// AND IT DOES NOT SPELL THE SENTINEL. `harvestOptions()` reads the unfilter
// token out of vocab-core rather than holding a copy, so the string that turns
// the blocklist off is stated in exactly one file. Where vocab-core is not
// loaded it reads `null`, which vocab-core refuses — a missing dependency
// therefore filters, and cannot be the thing that unfilters.
//
// An ES module (the web app). The extension loaded it as a classic script and
// published it on `globalThis`; the logic below is unchanged by the move.
// ============================================================

'use strict';

import * as Vocab from './vocab-core.js';
import { SLUG } from './brand.js';

// The one name in DOM storage the settings use, and it is NOT the key's: a
// settings blob is not a licence and not passage text, and an allowance that
// covers two unrelated things is one nobody can withdraw from one of them.
// store.js allows exactly this key and the licence's (check.sh S1).
//
// SPELLED LONG BECAUSE THE EXTENSION'S PAGE WAS ONE SCOPE. There every file
// loaded as a classic script, and classic scripts on one page share a single
// top-level lexical scope — so `const STORE` in this file and `const STORE` in
// licence-core.js were a redeclaration, a SyntaxError that stopped the second
// file loading. It shipped exactly that way for an hour, and a
// harness case (§ one page, one scope) was written the next day to hold every
// page's script tags against every file's top-level declarations.
//
// As an ES module this file has a scope of its own and the collision cannot
// happen; the harness case was retired with the shared scope it tested. The
// long name stays because renaming it was not a change the port forced.
const SETTINGS_STORE = `${SLUG}.settings`;

// THE THREE POSITIONS OF THE DIAL, in the order strict → free → off, which is
// the order they appear on the page. `STANDARD` is the free floor and the
// value every failed coercion below returns.
const TIERS = { YOUNG: 'young', STANDARD: 'standard', OFF: 'off' };

// `cloze: false` is the free floor for the export format, and false is what a
// free copy gets for the reason every other default here is what it is —
// `effective()` returns this object entire when the licence says no, so the
// floor is not "the stored value, ignored" but "the value that was never
// read".
//
// `tag: ''` is the free floor for the second deck tag, and the empty string is
// not "no tag" — csv-core.js reads it as "use the article's own slug", which is
// what every deck this product has ever written is tagged with. So the floor
// here is the behaviour that already exists, spelled as an absence, which is
// the only spelling that keeps the free deck byte for byte what it was.
const DEFAULTS = { tier: TIERS.STANDARD, terms: [], cloze: false, tag: '' };

// A teacher's own term is matched the way every other blocked word is —
// whole, against the surface and the lemma — so anything that is not a single
// written word cannot match and is dropped rather than stored to no effect.
// Letters, and the apostrophe and hyphen that English words carry.
const TERM = /^[a-z][a-z'-]*$/;

// Caps, so that a hand-edited or corrupted blob cannot make the harvest
// quadratic or the page unreadable. Both are far above any real use: the
// longest word in the shipped band lists is 20 characters, and a teacher who
// wants 200 terms blocked wants a different product.
const MAX_TERMS = 200;
const MAX_TERM_LENGTH = 40;

// THE STORE'S CAP, AND DELIBERATELY NOT THE TAG'S SHAPE. What a tag may
// contain, and how long it reads in the list a teacher scans, is `slugTag` in
// csv-core.js — which cuts at a word boundary at 48 because a tag ending
// "...with-new-execut" reads as corrupted rather than shortened. This number
// is doing the job the two above do and no other: a hand-edited or corrupted
// blob must not put an unbounded string into the store, onto the page, or into
// a deck.
//
// It sits ABOVE the shaping cut on purpose. A teacher who types fifty
// characters should have them shortened by the rule that knows what a tag is,
// at a hyphen, rather than truncated here by the rule that only knows how to
// say no. Two numbers, two jobs, and the one a reader has to check is the
// smaller one, which lives beside the thing it describes.
const MAX_TAG_LENGTH = 60;

// ------------------------------------------------------------
// COERCION
//
// Total, synchronous, and paranoid on purpose. The input is whatever was in
// the store, which is a place the teacher — or a page they visited that shares
// no origin with this one, or a browser extension that does — can write.
// Nothing here throws and nothing here trusts.
// ------------------------------------------------------------
function coerce(raw) {
  const from = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  // An unknown tier is STANDARD, never OFF. Written as a membership test
  // against the declared values rather than as "not young and not off",
  // because the negative form makes an added fourth position default to
  // whatever the last branch happens to be.
  //
  // AND IT MUST BE A STRING BEFORE IT IS COMPARED. This read
  // `String(from.tier)` previously, and `String(['off'])` is `'off'` —
  // so a stored blob reading `{"tier":["off"]}`, which JSON.parse produces
  // without complaint, came back from this function as the paid tier.
  //
  // Nothing was ever unlocked by it, because `effective()` asks the
  // licence before it asks the store, so the blob is unread on the only path a
  // free copy takes. It is fixed anyway. A coercion that accepts a shape it
  // does not name cannot be checked by reading it, and the next hole of this
  // kind may not have the licence standing in front of it.
  const named = typeof from.tier === 'string' ? from.tier : '';
  const tier = named === TIERS.YOUNG || named === TIERS.OFF
    || named === TIERS.STANDARD ? named : TIERS.STANDARD;

  const terms = [];
  const seen = new Set();
  const list = Array.isArray(from.terms) ? from.terms : [];
  for (const entry of list) {
    if (terms.length >= MAX_TERMS) break;
    if (typeof entry !== 'string') continue;
    const word = entry.trim().toLowerCase();
    if (!word || word.length > MAX_TERM_LENGTH) continue;
    if (!TERM.test(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    terms.push(word);
  }

  // `=== true` AND NOT A CAST, which is the same lesson the tier learned,
  // arriving at a boolean. `Boolean(from.cloze)` accepts the string
  // "false", an empty object and a stray 1, all three of which JSON.parse
  // hands back without complaint from a store the teacher can edit. A named
  // shape or the floor, and nothing in between.
  const cloze = from.cloze === true;

  // A NAMED TYPE OR THE FLOOR, which is the same rule as `cloze` above in the
  // shape a string needs. What it rejects is the wrong TYPE and an unbounded
  // LENGTH, and nothing else.
  //
  // It deliberately does NOT reject an unusable tag. `slugTag` in csv-core.js
  // turns "Year 9 — Autumn" into `year-9-autumn`, and a coercion refusing
  // anything with a space in it would refuse the thing a teacher most
  // naturally types — then store the empty string and silently give them the
  // article's slug, which looks exactly like the setting not saving. Shaping
  // belongs where the tag is written, and this file's job is that the store
  // cannot hand anybody a surprise.
  const tag = typeof from.tag === 'string'
    ? from.tag.trim().slice(0, MAX_TAG_LENGTH) : '';

  return { tier, terms, cloze, tag };
}

// What a teacher typed into the box, to the list `coerce` will keep. Split on
// anything that is not part of a word, so a comma-separated line and one term
// per line both work and neither is documented as the right one.
function parseTerms(text) {
  return String(text == null ? '' : text)
    .split(/[^A-Za-z'-]+/)
    .filter(Boolean);
}

// ------------------------------------------------------------
// THE STORE
//
// `store` is injected for the reason it is injected in licence-core.js: this
// file has to answer in a harness, and in a private window where the setter
// throws. The page passes store.js, the one module allowed to touch browser
// storage (check.sh S1); with no store the answer is the defaults. Both are total. A store that cannot be read
// is the same answer as a store with nothing in it, which is the defaults —
// and the defaults are the free floor.
// ------------------------------------------------------------
// NAMED LONG HERE AND SHORT IN THE EXPORT, for the reason SETTINGS_STORE is
// spelled long: in the extension the popup declared its own top-level `read` in
// the same shared scope, and a function declaration does not throw the way
// `const` does — the later one silently wins. Modules do not share a scope, so
// that can no longer happen; callers import the namespace and call
// `Settings.read`.
function readSettings(store) {
  const s = store || null;
  if (!s) return coerce(null);
  try {
    return coerce(JSON.parse(s.getItem(SETTINGS_STORE)));
  } catch (e) {
    return coerce(null);
  }
}

function writeSettings(settings, store) {
  const s = store || null;
  if (!s) return false;
  try {
    // Coerced on the way IN as well as on the way out. The page is the only
    // caller today and it builds a clean object, but a store written from one
    // shape and read against another is how the two drift, and the read side
    // is the one that has to be right.
    s.setItem(SETTINGS_STORE, JSON.stringify(coerce(settings)));
    return true;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------
// WHAT THE HARVEST IS ALLOWED TO DO
//
// `paid` is the answer from the licence, passed in rather than asked for, so
// that this file holds no opinion about who has paid and the harness can drive
// both answers over the same stored settings. `=== true` and not a truthiness
// test: a pending promise, a non-empty string, an object — every one of those
// is truthy, and the caller here is an async check whose result is easy to
// forget to await. An unawaited promise must buy nothing.
// ------------------------------------------------------------
// Every field of the shape, spelled out, and a fresh `terms` array so no
// caller is handed the one inside DEFAULTS to push onto. Omitting `cloze` here
// would have been SAFE and wrong: `undefined === true` is false, so the deck
// would have come out right, and the free answer would have been a different
// shape from the paid one — which is how a later `Object.keys` or a spread
// starts quietly disagreeing with itself.
function effective(settings, paid) {
  if (paid !== true) {
    return {
      tier: DEFAULTS.tier, terms: [], cloze: DEFAULTS.cloze, tag: DEFAULTS.tag
    };
  }
  return coerce(settings);
}

// The options `harvest` understands, built from the effective settings. Named
// separately from `effective` because the mapping from a tier to a harvest
// option is the part a reader has to be able to check at a glance:
//
//   young     the floor, plus taboo.js's borderline list
//   standard  the floor
//   off       no floor, and only ever from this one line
function harvestOptions(settings, paid) {
  const chosen = effective(settings, paid);
  const V = Vocab;
  // The token, from the file that decides what it means. Null where vocab-core
  // is not loaded, which vocab-core refuses — so a half-loaded page filters.
  const token = (V && V.UNFILTERED) || null;
  return {
    also: chosen.terms,
    strict: chosen.tier === TIERS.YOUNG,
    unfiltered: chosen.tier === TIERS.OFF ? token : null
  };
}

export {
  readSettings as read, writeSettings as write,
  coerce, effective, harvestOptions, parseTerms,
  DEFAULTS, TIERS, SETTINGS_STORE as STORE,
  MAX_TERMS, MAX_TERM_LENGTH, MAX_TAG_LENGTH
};
