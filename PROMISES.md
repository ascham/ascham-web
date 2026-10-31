# Promises

A promise is reworded here *before* any code that would
falsify it ships. Rule names (N1, C1, …) refer to `scripts/check.sh`.

| # | Promise | Literal wording | Enforced by |
|---|---|---|---|
| 1 | Pasted text stays on the device | "The text you paste never leaves your device." | CSP `connect-src 'none'`, `form-action 'none'`, `default-src 'none'` (C1, meta and header, the meta before anything that loads); no network API in shipped JS (N1); no URL literal (N2); no navigation or resource-loading API (N3); no way to put the text in a request to our own site or in the page's address: CSS `url()`, fonts, worklets, notification icons, `pushState` (N4); browser spell check and translation switched off (H3; that browsers honour `translate="no"` is manual check 7). `scripts/browser-test.mjs`: every request in a full session stays on the origin, and none carries the pasted text. See *What CSP cannot stop*. |
| 2 | First-party bytes only | "Every byte ships from our own site: no third-party code, analytics or tracking." | CSP `'self'`-only sources (C1); no external reference and no `<style>` element in HTML, but for the source page's one link to its GitHub mirror, which loads nothing; no `@import` and no external `url()` or quoted address in CSS (H1); scripts are modules loaded by `src`, nothing inline (H2), and every import resolves to a shipped file (D1); zero runtime dependencies (`DEPENDENCIES.md`). `scripts/browser-test.mjs`: every request in a full session stays on the origin. `scripts/verify-live.sh`: the live site serves exactly the build's bytes. |
| 3 | Nothing stored on our servers | "This page stores nothing on our servers. Your work is saved only to files you choose. Your settings and licence key stay in this browser and nowhere else." | Architecture: static host, no backend. Browser storage only through `src/core/store.js`, which uses `localStorage` and holds exactly two keys, settings and licence (S1). `tests/store.test.js`: any other key is refused, and a harvest of a marker passage through the page's own pipeline leaves no trace in localStorage, sessionStorage, cookies, IndexedDB or the Cache API. `scripts/browser-test.mjs` checks the same stores in Chrome and Firefox after a full session. "Files you choose": the only way out of the page is `src/ui/download.js`, a `blob:` URL the teacher's own click hands to the browser's downloads (N3's one named exemption, held to an exact list of lines), and `tests/store.test.js` holds the project file to being the only file the whole passage reaches; the CSV carries card sentences only. The teacher's worksheet questions are held the same way: a marker in a question reaches the project file and no store and no CSV (`tests/store.test.js`; `scripts/browser-test.mjs` asks one in each browser before it checks the stores). A worksheet leaves the page only through the browser's own print dialog. |
| 4 | Verbatim sentences | "Every card sentence is taken word for word from your text. On a worksheet, writing each answer back into its gap gives the sentence word for word." (first sentence: extension promise 6) | `tests/logic.test.js` § end to end: every card back occurs verbatim in the source text. Sentences are never edited, only selected (`sentence-core.js`, `vocab-core.js`). The exported CSV: `tests/files.test.js` and `scripts/browser-test.mjs` (the downloaded file, parsed as strict RFC 4180) hold every sentence to occurring verbatim in the normalised text and every face to occurring in its sentence; csv-core's formula-guard apostrophe is the one byte it may add. The normalised text is the paste with only its whitespace changed: `tests/paste.test.js` holds every other character to surviving, in order, with nothing added, over random pastes. A project file carries no cards, so opening one cannot bring in a sentence that is not in its text. Worksheet: `src/ui/worksheet.js` cuts every gap from its sentence with csv-core's `cutAt`, right to left, and a gap's answer is the text it removed. `tests/worksheet.test.js` holds, on every paste fixture, each item with its answers written back to being its sentence exactly, and `cutMany` to reassembling its text in seeded random cases; `scripts/browser-test.mjs` holds the page's sheet, in each browser, to being worksheet.js's own build. |
| 5 | No account | "No account is needed. Your licence key is checked in this browser and never sent anywhere. It carries none of your text and no name or email: only the version it unlocks and an order reference, which only we can match to a purchase and which the page never shows." | Architecture: no backend and no sign-in code. Nothing in a page asks for an account: no password or email field, no username or password autocomplete hint, no Credential Management API (A1). The key is an offline ECDSA P-256 key, verified against a public key bundled in `licence-core.js` with no network call (C1 `connect-src 'none'`, N1). `scripts/browser-test.mjs`: no request in a full session carries the key, though most of the session runs with it saved, and the key field is empty once the key is saved. It is held only under the licence key in `store.js` (S1), and the project file's fields are a fixed list without it (`src/ui/project.js` `KEYS`); `tests/store.test.js`: with a valid key held, neither the project file nor the CSV carries any part of it. `licence-core.js` refuses a payload with any field but `v`, `max` and `buyer`: `v` is the key format, `max` the version it unlocks, `buyer` the order reference; with the `ASCH1` tag and the signature, that is the whole key. The page shows no part of `buyer` (`strings.js` `unlockedSaid`, `tests/strings.test.js`). What `buyer` holds is set when the key is made, outside this code: the order reference, or empty. |
| 6 | Text is shown, never run | "Your text is only ever shown as text: nothing in it can run on the page." | Pasted text, titles, sources, questions and project files reach the page only as text: as `textContent`, text nodes, form values and attribute values, never as markup. HTML and code sinks (`innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, …), a timer given anything but an arrow function written in place, and an `on…` attribute set from JS are banned in shipped JS, comments included (X1). Code reached by a computed name, which no static check can see, is stopped by the CSP: `script-src 'self'` with no `'unsafe-eval'` or `'unsafe-inline'`, so no string becomes code and no inline script or handler runs (C1); and the pages carry none (H2). `tests/project.test.js`: markup in every field of a project file opens as plain data. `scripts/browser-test.mjs`, in Chrome and Firefox: markup and script in a paste, a title and a project file are shown as text, no element and no event-handler attribute comes from them, and no dialog opens and no CSP violation is reported. |

## The exact Content Security Policy

Every page carries it in a `<meta>` tag and the host sends it as a header
with every file (`public/_headers`; `frame-ancestors` works only as a
header). The one canonical string is `CSP` in `scripts/check.sh`, and C1
holds every page and `_headers` to it character for character, and
`_headers` to one block, for every path, that detaches no header.
`scripts/verify-live.sh` checks that the live site sends it, with every
other header `_headers` lists, on every file of the build:

    default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'

`connect-src 'none'` means the page's scripts cannot open a connection of
their own (`fetch`, `XMLHttpRequest`, WebSocket, `EventSource`, beacons), to
us or anyone. Every other source is our own origin, and images may also be
`data:` URLs, which are carried inside the page and fetch nothing, so no
third-party code, font, style or image can load. Our own origin still serves
the page its scripts, styles, fonts and images: see *What CSP cannot stop*,
Requests to our own site.

## What is free

- **Free:** paste, review and the set-aside view; print the vocabulary list;
  the Basic Anki export; a sample of the worksheet on screen; save and open
  projects. The sample is the worksheet's header and its first 3 gap-fill
  items, with only their words in the word bank. It has no full text, none of
  the teacher's questions and no answer key, and a line says what Pro adds.
- **Pro** (a licence key for Ascham 1): the whole worksheet, on screen and
  printed, with the full text if ticked, the teacher's questions and the
  answer key; cloze and mixed Basic/Cloze decks; the bold target word; the
  teacher's own deck tag; the young/standard/off filter; the teacher's own
  blocked words.

Enforced where each action runs, not by the page's controls: every Pro action
asks the licence itself (`src/ui/pro.js`) and does the free thing on any
answer but a key that verifies for this major version. `tests/pro.test.js`
calls each action directly with no key, a forged key, a malformed key and a
genuine key for an earlier major (nothing unlocks), and with a valid 1.x key
(everything does), all signed by a test-only key pair; `scripts/check-mutations.sh`
removes each gate in turn. No other page code reaches the work behind a gate:
outside `pro.js`, `src/ui` names `analyse`, `build` and `csvFile` only where
each is defined or as Pro's own (`Pro.csvFile`), and only `files.js` and
`worksheet.js` import `csv-core.js` (F1). The free actions work without a
key: `scripts/browser-test.mjs`, before any key is entered, prints the
vocabulary list, exports the CSV and finds the free deck (word and verbatim
sentence, tagged from the title), and saves a project and opens it again.

The sample is built in `src/ui/pro.js` as well, so without a key the page
never receives the rest of the sheet. `tests/pro.test.js` builds the sheet
with no key, a forged key, a malformed key and an earlier major's key, and
holds each to at most 3 items, a word bank of only their answers, and no full
text, questions or answer key. With a valid key it gets the whole sheet.
`scripts/browser-test.mjs` checks the free page itself in each browser: its
sheet holds at most 3 items and no answer key. `scripts/check-mutations.sh`
has `pro.js` build the whole sheet without a key, in place of the sample,
and both checks must then fail.

## The feature list — owner's wording, 2026-10-27

The free and Pro features as the public list gives them. Each line says
only what its check holds. No page carries them yet; the page that does is
held to them as the other pages are (`tests/pages.test.js`).

| Line | Literal | Enforced by |
|---|---|---|
| The tally (free) | "As you tick and untick words, a count shows how many are selected, such as “3 of 7 selected”." | `strings.js` `tally`, held to "3 of 7 selected" by `tests/strings.test.js`. `scripts/browser-test.mjs`, in Chrome and Firefox and before any key is saved: "unticking a card updates the tally". `scripts/check-mutations.sh` has the page count every card as ticked, and that check fails. |
| The Anki file (free) | "The Anki download is a UTF-8 CSV file with a byte order mark, laid out as RFC 4180 sets out. A field that begins with =, +, - or @ gets an apostrophe in front, the standard guard against a spreadsheet reading it as a formula." | The byte order mark: `csv-core.js`; `tests/files.test.js` "csv › only ticked cards, as strict RFC 4180, with the BOM" reads the file as strict RFC 4180, and `scripts/check-mutations.sh` drops the mark and it fails. The guard: `csv-core.js` `guardFormula`; `tests/files.test.js` "csv › the formula guard survives into the file", and `scripts/check-mutations.sh` removes the guard and it fails. `scripts/browser-test.mjs`, in Chrome and Firefox and before any key is saved: "the CSV starts with the UTF-8 byte order mark" and "the formula guard survives the download". The limit, as `csv-core.js` records it: the guard "reliably stops evaluation everywhere and reliably hides itself nowhere", measured in Google Sheets and LibreOffice; Excel is untested, and LibreOffice and Anki show the apostrophe. |
| The answer key (Pro) | "With “Include answer key” ticked, the key starts a page of its own. Gaps are numbered by their sentence: “3” when a sentence has one gap, “3a”, “3b” when it has several. The key gives each answer under the same label." | The page: `print.css` `.sheet .key { break-before: page; }`; `scripts/browser-test.mjs`, in Chrome and Firefox: "the answer key starts a page of its own", on a one-item sheet whose key would otherwise fit page 1; `scripts/check-mutations.sh` removes the break and it fails. The labels: `worksheet.js`; `tests/worksheet.test.js` "worksheet › a sentence shared by several cards is one item; seven targets become four gaps" holds its gaps to "1a" to "1d", and "worksheet › a single-gap sentence is kept, and its gap is labelled by the item alone" its gap to "1", and in the key; `scripts/browser-test.mjs`: "the key holds every gap's answer, by label", in the printed PDF; `scripts/check-mutations.sh` gives every gap its item's bare number and the first fails. |
| Headings (Pro) | "On the printed worksheet, each heading is kept on the same page as the first thing under it, so long as the two fit on one page." | `review.js` puts each heading and the first thing under it in one `.keep`, and `print.css` `.sheet .keep { break-inside: avoid; }` asks the browser not to split it. `scripts/browser-test.mjs`, in Chrome and Firefox: "each section heading is kept with what follows it, the gap fill's with its first item"; and, on the printed PDF, "no page of the PDF ends with a heading or a heading-like line", which in the test's own words is "a guard, not a proof: it bites only where a page break falls at one". `scripts/check-mutations.sh` prints the word bank's heading outside its `.keep`, and the first check fails. "So long as the two fit on one page" is the limit of `break-inside: avoid`; no check tests it. |
| The key's life (Pro) | "The key has no end date: it keeps unlocking every 1.x release." | A key carries only `v`, `max` and `buyer` (promise 5), so no date can ride in it: `licence-core.js` `verify` refuses any other field, and `tests/logic.test.js` "an unexpected field is refused rather than ignored". `tests/pro.test.js` "pro › an ASCH1 key signed now unlocks this major version": one key opens the running version, 1.0.0 and 1.99.99, and is refused on its version at 2.0.0. That nothing in `licence-core.js` or `pro.js` reads the clock is so today; no check holds it. |

## The licence and the name — owner's wording, 2026-10-21

| Wording | Literal | Enforced by |
|---|---|---|
| The licence | "Open source under the GNU AGPL, version 3: anyone can read, build, verify and change the code, and share changes under the same licence." The project is called "open source" in no other words. | L1: "open source" or "open-source", in any case and across a line break, fails on the page, in shipped code and in README, LICENSE, NOTICE, TRADEMARKS, CONTRIBUTING and SECURITY, except inside this exact sentence. The sentence stands in the page's footer (`strings.js` `licenceLine`) and in README; `tests/strings.test.js` holds both to check.sh's. |
| Not affiliated | "Ascham is independent and not affiliated with any school, publisher or institution." In the page's footer and in README. No crests, shields, mottos or school-style imagery anywhere. | `strings.js` `independent`, built from the name; `tests/strings.test.js` holds the footer to that key and README to carrying the same sentence. That Ascham is independent is the owner's statement of fact; no check holds it. The pages ship no image: H1 allows only `data:` and same-origin images, and there are none, though no check holds that. |

## The privacy page — owner's wording, 2026-10-21

The page at /privacy/ says only what is quoted here, in this order. A
sentence quoted from a promise above is enforced as that promise is.
`tests/pages.test.js` holds every line of text on the page to being quoted
in this file, and the page to carrying no script.

| Section | Literal | Enforced by |
|---|---|---|
| Heading | "Privacy" | — |
| Opening | "Ascham is built so that what you teach with stays with you. This page says what we can see, what we cannot, and where our promises stop." | Every sentence below. |
| The app | Promises 1, 2, 3, 5 and 6, word for word, in that order. | As each promise. |
| No cookies | "Our site sets no cookies." | The app: `tests/store.test.js` and `scripts/browser-test.mjs` find no cookie after a full session. The pages: no script (`tests/pages.test.js`). The host: `_headers` sets none (H4); a cookie the host adds itself is beyond our checks (*What CSP cannot stop* § The host). |
| The host | "The server that hosts our site serves our files and does not log your IP address or the kind of browser you use. It never sees your text." | The text half: promise 1. That it keeps no log is StaticHost's stated policy, outside this code; no check holds it. |
| Buying Pro | "You buy a key on Polar's checkout, not on our site, and our site never contacts Polar. Polar handles the sale and payment and needs your email address and payment details to do so; what it does with them is in its own privacy policy. From Polar we receive your order, including your email address, and we use that address only to send your key and to answer you about that purchase. We keep the order reference, your email address and the emails between us, and nothing else about you. We keep the order record for as long as the law requires us to." | From the second sentence to the fifth, word for word from *What these promises cannot cover* § Buying Pro, enforced there. The last, how long we keep the order record: our own practice; no check holds it. The first sentence: `/buy` is a host redirect, and no page carries a Polar URL (the checks in *What these promises cannot cover* § Buying Pro). |
| Writing to us | "If you email us, we keep your message and address until we have answered you, then delete them. Email is not private: see Contact." | Our own practice; no check holds it. The link goes to /contact/ (D1). |
| Limits | "Some things are outside any page's reach. A browser extension you install can read everything on the page. Software that records your clipboard or reads your screen sees your text outside our page. Files you save are kept and protected by your device. A printout goes wherever you send it from your browser's print dialog." | Statements of limits, each the *What these promises cannot cover* item of the same name. |
| Why we use it | "We use your order and email address to carry out your purchase: sending your key and answering you about it. We need them to perform our contract with you (GDPR Article 6(1)(b), KVKK Article 5(2)(c)); without your email address we cannot send your key. We keep the order record for as long as the law requires us to, to meet our accounting and tax obligations (GDPR Article 6(1)(c), KVKK Article 5(2)(ç)). We keep the emails about your purchase for as long as we need them to support it, then delete them. We answer other emails because you wrote to us, in our legitimate interest in replying (GDPR Article 6(1)(f), KVKK Article 5(2)(f))." | Our own practice; no check holds it. The article references were checked against EUR-Lex and mevzuat.gov.tr on 2026-10-26. |
| Who receives it | "Polar, for checkout and payment. StaticHost, in the EU, which serves our site's files. Proton, in Switzerland, which carries and stores our email. We are in Turkey, so your order and our emails come to us there. We share your data with no one else, and we sell it to no one." | The site: promise 2 (no third-party code) and C1 `connect-src 'none'`: the site itself sends nothing anywhere. That no one else receives the order data is our own practice; no check holds it. Where StaticHost and Proton are: the owner's statement; not checked here. |
| Who we are | "This site is run by the creator of Ascham, contactable at hello@ascham.app, who is responsible for your data under Turkey's KVKK and the EU's GDPR." | — |
| Your rights | "You can ask us whether we hold data about you and for a copy of it (your order and our emails); what we use it for and who receives it; to correct or delete it, unless the law makes us keep it, and to tell those who received it that you did; to restrict or object to its use; and to have it in a form you can take elsewhere. Some of these apply only in the cases the law sets. If we process your data unlawfully and it harms you, you can claim compensation. You can object to a decision made about you by automated means alone; we make none. You can also complain to your data protection authority." | Our own practice; no check holds it. These are the rights in GDPR Art. 13(2)(b) and KVKK Art. 11. |
| Changes | "We change this page before we change what it describes. Last changed 2026-10-27." | Rule 6: a promise is reworded here before the code that changes it. |

## The licence page — owner's wording, 2026-10-21

The page at /licence/ says only what is quoted here, in this order
(`tests/pages.test.js`). Its links go to LICENSE, NOTICE and TRADEMARKS.md
as the site serves them, so they resolve inside the site (D1).

| Section | Literal | Enforced by |
|---|---|---|
| Heading | "Licence" | — |
| The licence | "Open source under the GNU AGPL, version 3: anyone can read, build, verify and change the code, and share changes under the same licence." | The licence sentence (L1); `tests/pages.test.js` holds it here as on every page. |
| In short | "In short, you may use Ascham for any purpose, study how it works, change it, and share it, changed or not." | LICENSE (AGPL-3.0-only, the FSF text; pre-publish P4 checks its title lines). |
| Sharing | "If you share a copy, or let people use a changed version over a network, you must offer them its source code under the same licence." | LICENSE §§ 4–6 and 13. |
| Pro | "The licence lets anyone change any part of the code, including the part that checks a Pro key. Buying Pro pays for the work." | What LICENSE permits; `KNOWN-ISSUES.md` says the same. |
| No warranty | "Ascham comes with no warranty, as the licence sets out." | LICENSE §§ 15–16. |
| The terms | "This summary is not the licence: the full terms are in LICENSE." | The link goes to /LICENSE (D1). |
| The source | "The source code: ascham.app/source/" | The link goes to /source/, the source page, inside the site (D1). |
| Notices | "Third-party notices, including for the word list Ascham draws on, are in NOTICE." | NOTICE carries SCOWL's notice (build.sh copies it with every build). The link goes to /NOTICE (D1). |
| The name | "The licence covers the code, not the name. You may say truthfully that your software is based on Ascham, but a changed version must not be called Ascham or presented as ours. The details are in TRADEMARKS.md." | TRADEMARKS.md says the same; no check holds the two together. The link goes to /TRADEMARKS.md (D1). |

## The source page — owner's wording, 2026-10-27, revised 2026-10-31

The page at /source/ says only what is quoted here, in this order
(`tests/pages.test.js`). The licence page links to it. The two files it
offers are not in the build: they are made from the release's export at
deploy and go up beside the page. D1 lets a link to them stand only for the
version in `src/core/version.js`, so a page that offers another version
fails. `verify-live.sh` does not fetch them (they are not in `SHA256SUMS`);
they are checked by hand at deploy. Its link to the GitHub mirror is the
site's one link off the site: H1 and D1 let exactly
`<a href="https://github.com/ascham/ascham-web">` stand on this page and
nowhere else. A link loads nothing, and following it sends no referrer
(`Referrer-Policy: no-referrer`, and the page's own meta).

| Section | Literal | Enforced by |
|---|---|---|
| Heading | "Source" | — |
| What it is | "The source code of each release of Ascham, in two files: a git bundle of the public repository up to that release, with one commit and one tag for each release, and a tar.gz archive of the release's files." | `scripts/release-public.sh` makes both from the export: the release's commit holds exactly the export's tree, and the two files are made from its tag, never a folder, and checked against the export; `scripts/check-mutations.sh` breaks it and sees each break caught. |
| How to check it | "How to build it, and check that it matches the site, is in README.md and VERIFY.md, inside each download." | The export carries both files (`scripts/export-public.sh`). |
| The release | "Ascham 1.4.0: ascham-1.4.0.bundle, ascham-1.4.0.tar.gz" | Each name links to its file; D1 holds the version to `src/core/version.js`. |
| The mirror | "The same repository is mirrored on GitHub, at github.com/ascham/ascham-web. The files here are the reference: each release's tag names the same commit in both." | The link is the named exception in H1 and D1: exactly `https://github.com/ascham/ascham-web`, on this page only. `scripts/release-public.sh` never pushes: it prints the push of the commit and tag the bundle holds, and the owner runs it. No check holds that the mirror exists or matches it; anyone can compare a tag in both (VERIFY.md § 1). |

## The contact page — owner's wording, 2026-10-21

The page at /contact/ says only what is quoted here, in this order
(`tests/pages.test.js`). The privacy page's "see Contact" links to it, and
its "see Privacy" to the privacy page, both inside the site (D1).

| Section | Literal | Enforced by |
|---|---|---|
| Heading | "Contact" | — |
| Email is not private | "Email is not private: it passes through other servers on the way, and we keep what you send to answer you (see Privacy). Never send us students' work, text from a real class, or a licence key." | The keeping: the privacy page, "Writing to us". The rest matches `SECURITY.md`; no check holds the two together. |
| Enquiries | "Questions, help with a purchase, or anything else: hello@ascham.app." | The address matches README and the privacy page; pre-publish P2 holds every address to the domain. |
| Security | "To report a security problem, write privately to security@ascham.app, and give us a reasonable time to fix it before you publish." | `SECURITY.md` says the same. |
| Encryption | "To encrypt a report, use our OpenPGP key, fingerprint 9351 0FD3 9C07 490B 0FC7 A9AF 91FF D6D9 3D2E FB02." | "OpenPGP key" links to /security.asc, the key file, and D1 resolves the link. The fingerprint is the key's, in the groups of four `gpg --show-keys public/security.asc` prints, with one space between each; `SECURITY.md` gives the same; no check holds them together. |

## The landing page — owner's wording, 2026-10-21

The page at / says only what is quoted here, in this order
(`tests/pages.test.js`). Its links go to /app/, /privacy/, /licence/ and
/contact/ inside the site (D1), and Buy to /buy, the host's redirect to
Polar (no page carries a Polar URL: *What these promises cannot cover* §
Buying Pro).

| Section | Literal | Enforced by |
|---|---|---|
| Title | "Ascham" | — |
| Heading | "Ascham" | — |
| Headline | "Vocabulary practice from the texts you already teach." | — |
| The name | "Ascham, named after Roger Ascham, Tudor scholar and tutor to Elizabeth I." | — |
| Pronunciation | "Pronounced ASH-um /ˈæʃ.əm/, our chosen pronunciation." | Ours, stated as ours: never called historical, usual or correct. |
| What it does (heading) | "What it does" | — |
| Step 1 | "Paste a text, or only the passage you are teaching." | The paste box and its selection (`src/core/paste.js`). |
| Step 2 | "Ascham picks the words worth teaching, each with the sentence it came from, word for word, and an estimated level, marked ~B2 because it is an estimate." | Promise 4; the `~` mark on every level. |
| Step 3 | "Tick the words you want, then print a gap-fill worksheet or a word list, or download cards for Anki." | The app's controls; what is Pro is below. |
| Step 4 | "Save your work as a project file on your own computer." | Promise 3 ("Files you choose"). |
| Try it | "Try it free: open Ascham." | The link goes to /app/ (D1). |
| Privacy (heading) | "Your text stays with you" | — |
| Promise 1 | "The text you paste never leaves your device." | Promise 1, word for word. |
| Promise 2 | "Every byte ships from our own site: no third-party code, analytics or tracking." | Promise 2, word for word. |
| No account | "No account is needed." | Promise 5's first sentence. |
| More | "What we can and cannot see is on our Privacy page." | The link goes to /privacy/ (D1). |
| Price (heading) | "Free, and Pro" | — |
| Free | "Free for as long as you use it: paste, review, print the word list, download a basic Anki deck, save projects and see a sample of the worksheet." | *What is free*; no separate trial, as the free version never expires. |
| Pro | "Pro is a one-time $15 for Ascham 1: the whole worksheet, printed, with the full text, your own questions and an answer key; cloze cards for Anki; your own deck tag and blocked words." | *What is free* § Pro; the app's upgrade line (`strings.js` `upgrade`). |
| Buy | "Buy Pro" | The link goes to /buy, a host redirect to the checkout, set up at deploy; a named exception in D1, as it is no file. |
| Licence | "Open source under the GNU AGPL, version 3: anyone can read, build, verify and change the code, and share changes under the same licence." | L1. |
| Not affiliated | "Ascham is independent and not affiliated with any school, publisher or institution." | The *Not affiliated* row. |
| Footer links | "Privacy", "Licence", "Contact" | Each link resolves inside the site (D1). |

## The app's own claims — owner's wording, 2026-10-25

Lines in the app, quoted from `src/ui/strings.js`, that claim something a
check can hold, each with that check. Where part of a line rests on
something outside the code, the row says so.

| Line | Literal | Enforced by |
|---|---|---|
| The licence key (`keyHelp`) | "Paste the key we email you. It is checked on this computer against a signature — Ascham does not contact a server to do it, so once this page is open, checking a key needs no internet connection." | The check: `licence-core.js` `verify`, WebCrypto ECDSA P-256 against the bundled public key (promise 5). No server: C1 `connect-src 'none'` and N1; `licence-core.js` is a static import, loaded with the page; `scripts/browser-test.mjs` records no request from the first key pasted to the last verdict, across a forged, an earlier major's, a malformed and a valid key. "The key we email you" waits on a test purchase. |
| A key that is not a key (`shape`) | "That does not look like an Ascham key. Copy the whole key from the email we sent you, including the part before the first full stop." | `licence-core.js` `parse` refuses as a shape anything but three parts split at full stops, the first `ASCH1`; `tests/logic.test.js`: "a key pasted without the part before the first full stop is a shape", "another product's tag is refused", "two parts is not a key", "four parts is not a key", "a truncated key is refused as a shape"; `scripts/browser-test.mjs` shows this line for a malformed key. "The email we sent you" waits on a test purchase. |
| A key for another major version (`ceilingSaid`) | "That key was bought for Ascham N. This is Ascham M, and a major version is a separate purchase — your key still unlocks every N.x release." N is the major version the key carries, M the one running. | `licence-core.js` `verify` refuses a genuine key on its version only when the version it carries is below the running major, and only once the signature holds. `tests/pro.test.js` "an ASCH1 key signed now unlocks this major version": one key opens the running version, 1.0.0 and 1.99.99, and is refused on its version at 2.0.0; `tests/logic.test.js` "and a ceiling of two still covers major two"; `scripts/browser-test.mjs` shows this line for a genuine key for an earlier major. "A major version is a separate purchase" is the owner's commitment. |
| The standard filter (`tierStandardWhy`) | "Slurs and obscenity never become cards. This is what every copy of Ascham does, paid or not, and it is what you get if these settings are ever unreadable." | `tests/logic.test.js`. Never cards: § the blocklist, every entry would card with the filter off, and none survives harvest. Every copy: § settings: the free floor, an unpaid copy gets the standard filter whatever is stored, and "an unpaid copy holding {"tier":"off"} still gets a filtered deck"; a missing tier is standard. Unreadable: § settings: nothing out of the store is trusted and § the store it is allowed to read, a null, unknown or wrongly typed tier, a stored null and a store that throws all read as standard. |
| Your own words (`termsHelp`) | "Words you never want on a card from your own classroom — one per line, or separated by commas. These are added to whichever filter is chosen above, including when it is off. Enter the plain form of a word: “protest” also covers “protests”, “protested” and “protesting”." | `tests/logic.test.js`. One per line or with commas: § settings: from the box to the list. Protest: "with no term set, each form of protest reaches the band" and "and the term "protest" catches every form first", each form read on its own; `vocab-core.js` matches a term against the word's base form and each spelling, and `scripts/check-mutations.sh` matching by spelling only fails the second. Including when it is off: "and it still does with the filter off", and `tests/pro.test.js` "pro › a valid key: reading the text uses the filter level and own blocked words", where with the filter off "bollocks" becomes a card and the teacher's term "ombudsman" does not. |
| Your own deck tag (`tagHelp`) | "Every deck is tagged “ascham” and the title you gave the text — or its source, if it has no title, or “deck”, if it has neither. This replaces the second one, so a term’s worth of lessons can share a tag: “Year 9 Autumn” on six texts is one search in Anki, where six titles are six searches. Anki separates tags on spaces, so spaces and punctuation become hyphens on the deck: “Year 9 — Autumn” is written into the file as “Year-9-Autumn”, and that is what you search for. Leave it empty to keep that second tag." | `tests/files.test.js` "csv › tags: the title, else the source, else csv-core's floor "deck"". `tests/logic.test.js` § the teacher's own tag: a paid deck carries the tag typed, shaped, with `ascham` still first; "Year 9 — Autumn" gives "Year-9-Autumn"; no tag holds a space; a tag that shapes to nothing falls back to the title's. Anki: manual check 1, where Anki read `ascham Year-9-café-test` as the tags; searching in Anki is not checked here. |
| The hard-wrap hint (`WRAPPED_HINT`) | "This text looks hard-wrapped, as PDFs and plain-text emails are. Some browsers drop the hyphen when they copy a word split across two lines of a PDF, so check words like “thirdparty”. Untick “Keep line breaks” to join the lines back into sentences." | `tests/paste.test.js`: `looksWrapped` is true for the pasted PDF and email fixtures and false for the rest, and with line breaks not kept a single line break becomes a space; `scripts/browser-test.mjs` shows the hint for hard-wrapped text and hides it once "Keep line breaks" is unticked. "Some browsers drop the hyphen": manual check 3, where Chromium 155 copied `third-` and `party` as `thirdparty`; one browser seen. |
| Starting again (`confirmReset`) | "This clears the text, the cards and your choices from this page. Anything you have not saved to a project file is lost. Your settings and licence key stay." | `scripts/browser-test.mjs`, in Chrome and Firefox: "Start again" over unsaved work asks first, with "Keep my work" focused; Escape and "Keep my work" leave the page as it was. "Clear the page" empties the paste box, title, source and questions, hides the cards, and puts "Keep line breaks" and the worksheet options back to how the page opens. The saved settings and licence key read the same before and after. "Is lost": promise 3, since nothing holds the passage but the page and the files the teacher saves (S1, `tests/store.test.js`). |

## What CSP cannot stop, and what covers it

- **Top-level navigation.** CSP does not govern navigating the page away
  (`location`, `window.open`, the Navigation API, a clicked `<a>`, a
  submitted form's target). A navigation to `https://x.example/?t=<text>`
  would carry text out. N2's ban on URL literals cannot prevent that, since
  an address can be built from pieces, so the navigation itself is banned.
  Covered statically, comments included: N3 bans the names `location`,
  `navigation` and `navigate` however they are used (but as a word in the
  word list), `open()` and `open` on a global object, indexing a global
  object by a computed name, `Reflect`, giving an element an address by
  assignment, attribute or object key, making `a`/`form`/`img`/`iframe`/
  `script`/… by name, and synthetic clicks, in shipped JS; X1 bans HTML
  sinks, so markup carrying a link cannot be injected; and the app's page
  holds no `<a>` or `<area>` (H4). `form-action 'none'` covers form
  submission. Downloads need an anchor and a `blob:` URL: N3 allows them in
  `src/ui/download.js` alone, where the lines that make, aim, click and
  revoke them must be exactly N3's list, and bans `createObjectURL`,
  `.click()`, `blob:` and synthetic events everywhere else. A navigation
  that reaches its API by a computed name another way (through an alias of
  the global object, say, or an element whose tag and address are passed in
  variables) would pass N3; `scripts/browser-test.mjs` would see it only on
  the paths it drives.
- **Requests to our own site.** `'self'` lets the page load our own images,
  fonts, styles and scripts, so a URL built from the text would reach our
  host while every request stays on the origin. Covered
  statically by N4, which bans every way shipped JS could build one (CSS
  `url()` by any route, `FontFace`, worklets, notification icons) or put the
  text in the address (`pushState`), and at run time by
  `scripts/browser-test.mjs`: no request in a full session carries the
  pasted text. That covers the paths it drives.
- **WebRTC.** `RTCPeerConnection` is not governed by `connect-src`. Covered
  statically by N1.
- **DNS prefetch / preconnect hints** from injected markup. Covered by X1 (no
  sinks) and H1 (no external `href` in HTML).
- **Browser features that send text to a vendor.** Chrome's enhanced spell
  check and page translation send text to Google when the teacher has them
  on, and CSP governs neither. Covered by H3: the page carries
  `translate="no"`, every text field `spellcheck="false"`, and JS may not
  create a new editable surface: no `contentEditable` or `designMode`, and
  no `input` or `textarea` made by name, but for the review table's tick
  box, a checkbox. An element whose tag name is passed in a variable would
  pass H3. That browsers honour `translate="no"` is manual check 7.
- **Storage reached by a computed name.** S1 reads source. N3 bans
  indexing a global object by a computed name, but an alias gets round
  that: `const g = globalThis; g['local' + 'Storage']` would pass both. X1
  bans `eval`/`Function`,
  and `tests/store.test.js` catches any write of the passage made along the
  pipeline's path at run time; a write elsewhere by computed name would not be
  caught.
- **The host.** The static host sees requests for our files (IP, user agent),
  never the text. The promise is about pasted text, not page loads. Our
  `_headers` sets no `Set-Cookie` and no `Refresh` (H4). A header the host
  adds itself is beyond any check here: `verify-live.sh` holds every header
  `_headers` lists to its value but refuses no other.
- **The meta CSP is weaker than the header.** `frame-ancestors` is ignored in
  `<meta>` (Chrome logs a warning) and applies only via `public/_headers`;
  the header must be deployed for clickjacking protection to hold.
- **Static checks read our source, not runtime behaviour.**
  `scripts/browser-test.mjs` is the runtime half: a full session over the
  built site in headless Chrome and again in headless Firefox, recording every
  request. It covers the paths it drives, not every path.

## What these promises cannot cover

- **Browser extensions.** An extension the teacher installs can read
  everything on the page, and nothing our code does can stop it.
- **Clipboard managers and accessibility tools.** Software on the teacher's
  computer that records the clipboard or reads the screen sees the text
  outside our page, where our promises do not reach.
- **The teacher's own device.** Files the teacher saves, and anything else
  on their computer or phone, are kept and protected by that device, not by
  us.
- **Where a printout goes.** Printing hands the vocabulary list or worksheet
  to the browser's own print dialog. From there it goes wherever the teacher
  sends it: a printer on the network, a cloud print service, or a PDF saved to
  the device. That route is the teacher's choice, outside our page.
- **Buying Pro.** In the app, the shop's address, ascham.app/buy, is plain
  text, never a link, so nothing in the app takes you there; the landing
  page's "Buy Pro" links to the same address. That address takes you from our
  site to Polar's checkout. You buy a key there, not on our site, and our site
  never contacts Polar. Polar handles the sale and payment and needs your
  email address and payment details to do so; what it does with them is in
  its own privacy policy. From Polar we receive your order, including your
  email address, and we use that address only to send your key and to answer
  you about that purchase. We keep the order reference, your email address
  and the emails between us, and nothing else about you.
  Enforced by: in the app, the address is plain text in `strings.js`
  `upgrade`, with no URL literal (N2) and no navigation API (N3), and the
  app's HTML holds no link or refresh, not even to our own site, and
  `_headers` sets no Refresh header (H4). The landing page's link goes to
  /buy on our own site, a host redirect (a named exception in D1). No page
  carries a Polar URL: not as a link or other reference (H1), not in shipped
  JS, `strings.js` included (N2), not as text of the app's page, which holds
  none of its own (U1), and not as text of a site page, since
  `tests/pages.test.js` holds every line of each to being quoted in this
  file, which quotes no Polar URL. No page can reach Polar (C1
  `connect-src 'none'`, N1). What we do with an order is our own practice,
  outside this code, and no check holds it.
