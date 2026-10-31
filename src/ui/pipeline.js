// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// From a paste to a deck. No DOM, so the harness runs exactly the
// path the page runs.
//
// The contract is the extension's: harvest gets the whole text and the
// selection's offsets, context sentences come from the whole text, candidates
// only from [from, to). What changed is where the text comes from — the
// textarea through paste.js, instead of the page through the extractor.
//
// THE PASSAGE IS HELD BY THE CALLER AND NOWHERE ELSE. Nothing here writes; the
// only stored thing it reads is the settings, through store.js (promise 3,
// check.sh S1, tests/store.test.js). `paid` is the licence's answer, which
// pro.js asks for.

import * as Words from '../core/wordlist.js';
import * as Vocab from '../core/vocab-core.js';
import * as Settings from '../core/settings-core.js';
import * as Paste from '../core/paste.js';
import { store } from '../core/store.js';

const LIMIT = 40;

// analyse({ raw, start, end, keepLineBreaks, paid }) -> one of
//   { state: 'no-text' }
//   { state: 'no-selection', truncated }   selection held nothing readable
//   { state: 'cards' | 'no-cards', cards, stats, whole, truncated, wrapped }
// `start`/`end` are the textarea's selectionStart/selectionEnd.
function analyse({ raw, start = 0, end = 0, keepLineBreaks, paid = false }) {
  const norm = Paste.normalise(raw, { keepLineBreaks });
  if (!norm.text) return { state: 'no-text' };
  const sel = Paste.selectionOf(norm, start, end);
  if (sel.empty) return { state: 'no-selection', truncated: norm.truncated };

  const chosen = Settings.harvestOptions(Settings.read(store), paid === true);
  const { cards, stats } = Vocab.harvest(norm.text, sel.from, sel.to, {
    bandOf: Words.bandOf,
    isKnown: Words.isKnown,
    isName: Words.isProperNoun,
    limit: LIMIT,
    also: chosen.also,
    strict: chosen.strict,
    unfiltered: chosen.unfiltered
  });
  return {
    state: cards.length ? 'cards' : 'no-cards',
    cards,
    stats,
    whole: sel.whole,
    truncated: norm.truncated,
    wrapped: Paste.looksWrapped(raw)
  };
}

export { analyse, LIMIT };
