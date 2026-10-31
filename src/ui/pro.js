// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Pro: the licence key, the teacher's settings, and every action
// Pro unlocks. No DOM, so the harness calls exactly what the page calls.
//
// WHAT IS FREE AND WHAT IS PRO is PROMISES.md § What is free. The gate is
// here, where each action runs, and not in the page's controls: every Pro
// action below asks the licence itself, from the key store.js holds, and does
// the free thing on any answer but a key that verifies for this major
// version. The page disables Pro controls only so a teacher is not offered
// what will not happen; nothing depends on it.
//
//   readText     the harvest: the filter level and own blocked words are Pro
//   csvFile      the deck: bold target word, cloze, mixed and deck tag are Pro
//   sheet        the worksheet on screen: whole with a key, a sample without
//   printSheet   printing the worksheet is Pro
//   saveSettings the settings themselves are all Pro
//
// `env` is { subtle, issuer }: WebCrypto, and the public key to check
// against. The page passes crypto.subtle and nothing else, so `issuer` is the
// shipped Licence.ISSUER; the tests pass the test-only pair's public half.

import * as Licence from '../core/licence-core.js';
import * as Settings from '../core/settings-core.js';
import { store } from '../core/store.js';
import { VERSION } from '../core/version.js';
import { analyse } from './pipeline.js';
import * as Files from './files.js';
import * as Sheet from './worksheet.js';

const issuerOf = (env) => (env && typeof env.issuer === 'string' ? env.issuer : Licence.ISSUER);

// The licence's verdict on `key`, or on the key this browser holds. Fails
// closed: no WebCrypto (an insecure page) is its own reason, 'environment',
// and any error refuses.
async function verdict(env, key = Licence.held(store)) {
  if (!String(key || '').trim()) return { ok: false, reason: Licence.REASONS.MISSING };
  const subtle = env && env.subtle;
  if (!subtle) return { ok: false, reason: 'environment' };
  try {
    return await Licence.verify(key, VERSION, subtle, issuerOf(env));
  } catch (e) {
    return { ok: false, reason: 'environment' };
  }
}

// Whether Pro is unlocked, asked afresh: nothing caches a yes.
async function paid(env) {
  return (await verdict(env)).ok === true;
}

// ---- the key ------------------------------------------------------------------

// Checks a pasted key and keeps it only if it unlocks Pro here. Returns the
// verdict, with `kept` false when the browser would not store it.
async function enterKey(text, env) {
  const key = String(text == null ? '' : text).trim();
  const said = await verdict(env, key);
  if (said.ok !== true) return said;
  return { ...said, kept: Licence.keep(key, store) };
}

function removeKey() {
  return Licence.keep('', store);
}

// ---- the settings -------------------------------------------------------------

// What the settings panel shows: the stored settings with a key, the free
// floor without one (settings-core's effective()).
async function settingsShown(env) {
  return Settings.effective(Settings.read(store), await paid(env));
}

async function saveSettings(settings, env) {
  if (!(await paid(env))) return 'pro';
  return Settings.write(settings, store) ? 'saved' : 'failed';
}

// ---- the actions ----------------------------------------------------------------

// pipeline.analyse with the licence's answer, which settings-core needs before
// it will read the filter level or the teacher's blocked words.
async function readText(input, env) {
  return analyse({ ...input, paid: await paid(env) });
}

// The Anki CSV. Free: the Basic deck, whatever the settings or the cards ask.
async function csvFile(deck, env, when = Date.now()) {
  const yes = await paid(env);
  return Files.csvFile(deck, when, { paid: yes, settings: Settings.effective(Settings.read(store), yes) });
}

// The worksheet for the screen, from worksheet.build's input. With a key, the
// whole sheet. Without, the sample: the first SAMPLE_ITEMS items, only their
// words in the bank, and no full text, questions or answer key, marked
// `sample`. The rest is never built, so it never reaches a free page.
const SAMPLE_ITEMS = 3;
async function sheet(input, env) {
  if (await paid(env)) return Sheet.build(input);
  const sample = Sheet.build({ ...input, questions: undefined, options: { fullText: false, answerKey: false }, limit: SAMPLE_ITEMS });
  return { ...sample, sample: true };
}

// Prints the worksheet: 'printed', or 'pro' without a key, or 'no-worksheet'
// when nothing on the sheet can be gapped. The whole sheet is built here,
// after the licence says yes, and handed to `print` to put on the page.
async function printSheet({ input, print }, env) {
  if (!(await paid(env))) return 'pro';
  const model = Sheet.build(input);
  if (!model.items.length) return 'no-worksheet';
  print(model);
  return 'printed';
}

export { verdict, paid, enterKey, removeKey, settingsShown, saveSettings, readText, csvFile, sheet, printSheet, SAMPLE_ITEMS };
