// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// Licence core.
// ============================================================
// A key in, a yes or no out, without asking anybody.
//
// WHY THE PAYLOAD CARRIES A CEILING
// A key unlocks a MAJOR VERSION, so the payload carries a ceiling — an
// integer — and the check compares it to the major version that is running.
// THERE IS NO CLOCK IN THIS FILE. A key cannot go stale on a date, so there is
// no expiry to age out, and the machine's own idea of the time cannot switch a
// feature off.
//
// WHY IT CANNOT WANT A NETWORK
// Promise 1 says the page makes no network request, and `connect-src 'none'`
// would refuse a call outright, so a phone-home validator does not run here.
// A key checked against a public half bundled in this file is never handed to
// anybody.
//
// ECDSA P-256 AND NOT ED25519
// Ed25519 is the smaller, nicer signature, but ECDSA P-256 with SHA-256 has
// been in WebCrypto in every engine for years, and Ed25519 reached it much
// later. The scheme does not move, so no key ever issued is affected; raising
// the supported browsers is what would make the choice reviewable again.
//
// WHAT THIS IS NOT
// It is a lock on an honest door. The public key is in this file, the code
// ships unminified, and anyone willing to edit their own copy can turn Pro on.
// That is true of every check that runs on the teacher's machine, and the
// alternative — a server that says yes — is the thing promise 1 forbids. What
// this stops is one key being passed around a staffroom.
//
// THERE IS NO "VERIFIED" FLAG, DELIBERATELY.
// A flag in storage would be a second answer to a question the key already
// answers, and the second one is the one an attacker would edit — set
// `verified: true` and the signature never runs. So the key is stored, and it
// is re-verified on load. One ECDSA verify is well under a millisecond, which
// is not a cost worth a cache that can lie.
//
// ============================================================

import { SLUG } from './brand.js';

'use strict';

// The PUBLIC half of the issuing key, raw P-256, base64url. Replacing this
// constant invalidates every key ever issued, which is the only reason it
// would ever be replaced.
const ISSUER = 'BF3MHQ1AT9IndcJfsJb7JRgl3MGqy8LOfwlFBgXpm12c'
  + '18je38_L_ieuE6gD_mf-CveK0hGN0lJhYqYiIVUW33g';

const CURVE = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' };

// The format tag is part of the signed string's shape but NOT part of the
// signed bytes, so a key cannot be rewritten into another format by editing
// the tag: the payload it carries would then verify under a reading it was
// never signed for. Bumping this is how a future format refuses old keys
// loudly instead of misreading them.
//
// ASCH1 is the only tag. A key with any other tag is refused
// (tests/pro.test.js).
const TAG = 'ASCH1';

// The licence's one name in DOM storage (store.js allows it and the settings
// key, and nothing else).
const STORE = `${SLUG}.licence`;

// Every reason a key can be refused. They are returned rather than thrown
// because the page shows the teacher which one it is, and "that key is for a
// later version" and "that key has been edited" are different sentences.
const REASONS = {
  MISSING: 'missing',        // nothing was pasted
  SHAPE: 'shape',            // not three dot-separated parts under our tag
  ENCODING: 'encoding',      // a part is not base64url
  PAYLOAD: 'payload',        // the payload is not the JSON object we sign
  SIGNATURE: 'signature',    // the bytes are not what the issuer signed
  CEILING: 'ceiling',        // genuine, and bought for an earlier major
};

function bytesFrom(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '==='.slice((padded.length + 3) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function textFrom(bytes) {
  let raw = '';
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A dotted version string to the integer the ceiling is compared against.
// "1.4.2" is major 1; so is "1". Anything else is not a version and the caller
// gets NaN rather than a 0 that would quietly satisfy every ceiling.
function majorOf(version) {
  const first = String(version == null ? '' : version).split('.')[0];
  return /^\d+$/.test(first) ? Number(first) : NaN;
}

// ------------------------------------------------------------
// READING A KEY, WITHOUT DECIDING ANYTHING
//
// Split from verification on purpose. This half is synchronous and total — it
// never throws on a teacher's typo — so the page can say "that is not
// one of our keys" the moment focus leaves the box, and the harness can drive
// every malformed shape without a crypto call. Nothing here is evidence: a
// parsed key is a well-formed claim and no more, and `claim` must not be read
// by anything until verify() has said yes.
// ------------------------------------------------------------
function parse(key) {
  const text = String(key == null ? '' : key).trim();
  if (!text) return { ok: false, reason: REASONS.MISSING };

  const parts = text.split('.');
  if (parts.length !== 3 || parts[0] !== TAG || !parts[1] || !parts[2]) {
    return { ok: false, reason: REASONS.SHAPE };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1] + parts[2])) {
    return { ok: false, reason: REASONS.ENCODING };
  }

  let payload;
  let signature;
  try {
    payload = bytesFrom(parts[1]);
    signature = bytesFrom(parts[2]);
  } catch (e) {
    return { ok: false, reason: REASONS.ENCODING };
  }

  // BASE64URL IS NOT CANONICAL, AND A KEY MUST HAVE ONE SPELLING.
  // The last character of an 86-character signature segment carries only two
  // bits that mean anything; the other four are padding the decoder throws
  // away. So sixteen different strings decode to the same 64 bytes and every
  // one of them verifies: a case that edits the final character can expect a
  // refusal and get a pass, because the edit never reaches the signature.
  //
  // Nothing is forgeable through this: the decoded bytes are identical, which
  // is exactly why the signature still holds. What it costs is the ability to
  // say what a key IS. A teacher reads back a key that differs from the one
  // that was issued and both work; a support desk cannot tell an edit from a
  // typo from the real thing. So the decode is required to round-trip, and a
  // key has one spelling again.
  if (textFrom(payload) !== parts[1] || textFrom(signature) !== parts[2]) {
    return { ok: false, reason: REASONS.ENCODING };
  }

  // P-256 signatures are r and s, 32 bytes each, and WebCrypto's raw format is
  // exactly that. Checking the length here means a truncated key is refused as
  // the wrong SHAPE rather than reaching subtle.verify, which rejects it as a
  // bad SIGNATURE — the same verdict by a worse route, and a worse sentence to
  // show somebody whose paste dropped a character.
  if (signature.length !== 64) return { ok: false, reason: REASONS.SHAPE };

  let claim;
  try {
    claim = JSON.parse(new TextDecoder().decode(payload));
  } catch (e) {
    return { ok: false, reason: REASONS.PAYLOAD };
  }

  // The shape is checked exactly, not loosely. A key carrying an unexpected
  // field is a key from a format this build does not understand, and reading
  // the fields it recognises out of it is how a later scheme gets silently
  // downgraded into this one.
  const named = claim && typeof claim === 'object' && !Array.isArray(claim)
    ? Object.keys(claim).sort().join(',') : '';
  if (named !== 'buyer,max,v' || claim.v !== 1
      || !Number.isInteger(claim.max) || typeof claim.buyer !== 'string') {
    return { ok: false, reason: REASONS.PAYLOAD };
  }

  // The signed bytes are the ones that were pasted, never a re-serialisation
  // of `claim`. JSON.stringify would reorder nothing today and could reorder
  // something tomorrow, and a signature checked against a rebuilt string is a
  // signature checked against this file's opinion of the payload.
  return { ok: true, payload, signature, claim };
}

// ------------------------------------------------------------
// VERIFYING ONE
//
// `subtle` is injected rather than reached for, so the harness can drive a
// verifier that is not this machine's and the page passes crypto.subtle.
// `running` is the version string the caller is running — VERSION from
// version.js at the only call site —
// because a file that reads the version itself is a file that cannot be tested
// against a version it is not running under.
//
// `issuer`, the public key to verify against, is injected too and has no
// default. The page passes ISSUER above; the tests
// pass a test-only key (tests/fixtures/licence/), so no key that unlocks the
// product is ever written into the tests, and a key signed by the test pair
// is refused under ISSUER (tests/logic.test.js holds both). Anything but a
// string is refused, so a caller that forgets it unlocks nothing.
// ------------------------------------------------------------
async function verify(key, running, subtle, issuer) {
  const read = parse(key);
  if (!read.ok) return read;
  if (typeof issuer !== 'string' || !issuer) {
    return { ok: false, reason: REASONS.SIGNATURE, claim: null };
  }

  const major = majorOf(running);
  if (!Number.isInteger(major)) {
    return { ok: false, reason: REASONS.CEILING, claim: null };
  }

  let publicKey;
  try {
    publicKey = await subtle.importKey('raw', bytesFrom(issuer), CURVE,
      false, ['verify']);
  } catch (e) {
    // The public key failed to import: this build cannot check anything.
    // Refusing is the only answer that is not a guess.
    return { ok: false, reason: REASONS.SIGNATURE, claim: null };
  }

  let signed = false;
  try {
    signed = await subtle.verify(SIGNATURE, publicKey, read.signature,
      read.payload);
  } catch (e) {
    signed = false;
  }
  if (!signed) return { ok: false, reason: REASONS.SIGNATURE, claim: null };

  // The ceiling is checked AFTER the signature, so that "this key is for a
  // later version" is only ever said about a key that is genuinely ours. Said
  // about an unsigned key it would be a hint at what to forge.
  if (read.claim.max < major) {
    return { ok: false, reason: REASONS.CEILING, claim: read.claim };
  }

  return { ok: true, claim: read.claim };
}

// ------------------------------------------------------------
// KEEPING ONE
//
// `store` is injected for the same reason `subtle` is. The page passes store.js, the
// one module allowed to touch browser storage (check.sh S1), and no store
// means nothing is held. Both functions are total: a browser with DOM storage disabled, or a private
// window that throws on write, must leave the product working and unpaid
// rather than broken.
// ------------------------------------------------------------
function held(store) {
  const s = store || null;
  if (!s) return '';
  try {
    return s.getItem(STORE) || '';
  } catch (e) {
    return '';
  }
}

function keep(key, store) {
  const s = store || null;
  if (!s) return false;
  try {
    if (key) s.setItem(STORE, String(key));
    else s.removeItem(STORE);
    return true;
  } catch (e) {
    return false;
  }
}

export {
  parse, verify, held, keep, majorOf, REASONS, TAG, STORE, ISSUER
};
