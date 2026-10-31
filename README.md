# Ascham

A static web app for English-language teachers. Paste a text, highlight a
passage, and Ascham picks the vocabulary worth teaching, attaches the exact
sentence each word came from, estimates a level (always written `~B2`: an
estimate, not a CEFR measurement) and exports an Anki CSV.

What the app promises about your text and your privacy is in
`PROMISES.md`.

The current version, whether it is released yet, and what it changes are in
`CHANGELOG.md`; what is free and what is Pro is in `PROMISES.md`.

## Run locally

Requires Node.js (no packages to install).

```bash
node scripts/serve.mjs
```

Then open http://localhost:8000/. ES modules do not load from `file://`.
`bash scripts/build.sh` assembles the deployable site in `dist/` (a copy, not
a transform) with `dist/SHA256SUMS`.

## Checks

Every promise in `PROMISES.md` names the check that enforces it. All of them
run locally, from this repository, with the tools in `DEPENDENCIES.md`.

```bash
bash scripts/gates.sh             # every gate below, browser test in Chrome
bash scripts/gates.sh --release   # the same, browser test in Chrome and Firefox
```

`gates.sh` runs these in order and stops at the first failure:

1. `bash scripts/test.sh`: every `node --test` suite in `tests/`. It also
   fails if the number of cases differs from `tests/EXPECTED`, so a suite
   that silently stops loading is caught.
2. `bash scripts/check.sh`: the static rules over `src/` and `public/`, each
   named (N1, C1, …) and cited in `PROMISES.md`: no network API, no URL, no
   navigation, no HTML sink, storage through one module with two keys, the
   exact Content Security Policy in every page and in `public/_headers`, and
   the rest.
3. `bash scripts/check-mutations.sh`: breaks each rule once, in a scratch
   copy, and confirms the check that owns it notices. A check that cannot
   fail proves nothing.
4. `bash scripts/build.sh`: copies the site into `dist/`, proves that every
   file is its source unchanged (apart from one path rewrite in the HTML),
   and writes `dist/SHA256SUMS`.
5. `bash scripts/check.sh dist`: the same static rules over what ships.
6. `node --experimental-websocket scripts/browser-test.mjs chrome` (`all`
   for both): a full session in headless Chrome (and Firefox ESR), recording
   every request, then checking that each one stayed on the origin and that
   no browser storage holds the text. It prints, downloads and reads the
   files back; it needs Google Chrome or Chromium, Firefox ESR and
   `pdftotext`. It runs `/usr/bin/google-chrome` and `/usr/bin/firefox-esr`
   unless `CHROME_BIN` or `FIREFOX_BIN` names another binary. On Debian,
   Chromium's binary is `/usr/lib/chromium/chromium`. `/usr/bin/chromium` is
   a wrapper that loads the system's browser extensions, and their requests
   fail the origin check.

`bash scripts/verify-live.sh https://ascham.app` checks the live site
against a build: see `VERIFY.md`. Checks only a person can do are in
`MANUAL-CHECKS.md`.

## Licence

Open source under the GNU AGPL, version 3: anyone can read, build, verify and
change the code, and share changes under the same licence. The terms are in
`LICENSE` (AGPL-3.0-only); the name is covered by `TRADEMARKS.md`, and
third-party notices are in `NOTICE`.

Ascham is independent and not affiliated with any school, publisher or
institution.

Enquiries: hello@ascham.app. Security reports: see `SECURITY.md`.
