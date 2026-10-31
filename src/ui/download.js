// SPDX-License-Identifier: AGPL-3.0-only. Copyright and licence: see NOTICE and LICENSE.
// The one way out: a file the teacher chose to save.
//
// THE ONLY PLACE AN OBJECT URL AND AN ANCHOR CLICK EXIST (check.sh N3, by name).
// The URL is made here from a Blob of bytes already in the page, so the
// anchor can lead nowhere but into the teacher's downloads: `download` is
// set, the href is the object URL and nothing else, and the URL is revoked
// once the browser has taken the file. N3 holds the lines that do this to an
// exact list, so a second href, a change of page, or any other URL fails the
// check.

import { SLUG } from '../core/brand.js';

// Characters no filesystem the teacher might use accepts in a name, plus the
// controls; and the names Windows reserves whatever the extension.
const UNSAFE = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;
const MAX_NAME = 120;
const FALLBACK = SLUG;

// A name that is safe on every filesystem: no separators, no controls, no
// leading dot or trailing dot or space, not a reserved device, not too long,
// and keeping its extension when it has to be shortened.
function safeName(name, ext) {
  let n = String(name || '').normalize('NFC').replace(UNSAFE, '-')
    .replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.]+$/g, '');
  const dot = ext ? `.${ext}` : '';
  if (dot && n.toLowerCase().endsWith(dot)) n = n.slice(0, -dot.length);
  n = n.slice(0, MAX_NAME - dot.length).replace(/[\s.]+$/g, '');
  if (!n || RESERVED.test(n)) n = n ? `${FALLBACK}-${n}` : FALLBACK;
  return n + dot;
}

// How long the object URL lives after the click. The browser resolves it
// asynchronously, so revoking in the same task can cancel the download.
const REVOKE_AFTER_MS = 2000;

// save({ name, type, text }) — hands the file to the browser's downloads.
function save({ name, type, text }) {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = safeName(name, ext ? ext[1].toLowerCase() : '');
  a.href = url;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

export { save, safeName, REVOKE_AFTER_MS };
