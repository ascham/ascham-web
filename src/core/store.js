// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The one door to browser storage.
// ============================================================
// Promise 3 (PROMISES.md): we store nothing; the teacher's settings and
// licence key stay in this browser and nowhere else. This module is the only
// file allowed to name a browser storage API (check.sh S1), it uses
// localStorage and nothing else, and it holds exactly two keys: the settings
// blob and the licence key. Any other key throws, so a write of anything else
// — passage text above all — fails loudly in the harness instead of landing.
//
// Settings and licence code take this as their injected `store`; with storage
// blocked (a private window, a disabled setting) reads come back empty and
// writes throw, which both callers already treat as "nothing kept".
// ============================================================

import { STORE as SETTINGS_KEY } from './settings-core.js';
import { STORE as LICENCE_KEY } from './licence-core.js';

const ALLOWED = new Set([SETTINGS_KEY, LICENCE_KEY]);
const KEYS = Object.freeze([...ALLOWED]);

// Reading the property itself can throw where storage is blocked.
function backing() {
  try {
    return globalThis.localStorage || null;
  } catch (e) {
    return null;
  }
}

function allow(key) {
  if (!ALLOWED.has(key)) {
    throw new Error(`store: "${key}" is not a key this app keeps`);
  }
}

const store = Object.freeze({
  getItem(key) {
    allow(key);
    const s = backing();
    return s ? s.getItem(key) : null;
  },
  setItem(key, value) {
    allow(key);
    const s = backing();
    if (!s) throw new Error('store: browser storage is unavailable');
    s.setItem(key, String(value));
  },
  removeItem(key) {
    allow(key);
    const s = backing();
    if (s) s.removeItem(key);
  }
});

export { store, KEYS };
