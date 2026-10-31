# Known issues

Logged for the owner's decision; not fixed.

- **A photo credit can become a card.** A name such as "Reuters" that appears
  only where a block starts (a caption's credit) is never seen capitalised
  mid-sentence, so the name filter lets it through. Seen in an earlier news
  capture. The one credit in the current fixtures, NASA/Johns Hopkins
  APL/Steve Gribben in `nasa`, makes no card. Open: change the name list or
  the heuristic.
- **A first name that opens a sentence can become a card.** Ascham sets
  aside a word it sees capitalised mid-sentence and never in lower case, so
  "Musk" in "Elon Musk" is a name. "Elon" opens the sentence, where every
  word is capitalised, so only the given-names list can catch it, and that
  list doesn't hold it: "elon" and "xavier" were carded from a Guardian
  article. The teacher can untick such a card. No fix is planned: a rule
  strong enough to catch these also drops real words. Measured 2026-10-31
  on 16 texts (that article, 10 Wikipedia articles, the 5 Chrome paste
  fixtures) and 16 adjective-and-place pairs, a rule setting aside an
  unlisted capitalised word before a name caught Elon, Xavier and Dev, but
  also set aside metropolitan, coastal, neolithic, colonial, postwar,
  precolonial, mainland and equatorial ("Metropolitan France"), and
  "anthropologist" and "madame" in the texts. The word list can't separate
  them: names and rare words are both outside it. Exempting words with
  adjective endings (-al, -ic, -ous, -ive, -ary, -ern, -ese) still dropped
  metropolitan, postwar and mainland, and let Mary and Rous through. A
  larger names list (Wikidata's given names) was rejected too: it would
  hold real words as names.
- **Per-card style choices last only for the tab.** The Basic/Cloze control
  on each card is not saved in the project file; saving it needs project
  format 3. Deferred by the owner.
- **"Save project" counts as saved even if no file was written.** The page
  hands the file to the browser and can't know whether the browser wrote it.
  If the teacher cancels a Save As dialog, the work still counts as saved:
  leaving the page and "Start again" don't ask, and opening a project over
  that text doesn't ask either ("Keep my text"). No fix is planned; the
  page has no way to see the download.
- **Firefox's leaving dialog is not seen by the browser test.** Driven by
  Marionette, Firefox leaves a page without its dialog, so the test shows
  only that the page asks (a cancelable `beforeunload` event, checked in
  Chrome and Firefox). Chrome's own dialog is counted; Firefox's is
  covered by manual check 8 (`MANUAL-CHECKS.md`), re-run whenever that
  code changes.
- **The paste fixtures are government or historical public-domain text and
  one invented email,** set in page furniture written for them, so they don't
  exercise real commercial-news markup. The hard cases they lack are planted
  as short written lines (`tests/fixtures/paste/README.md`).
- **`autocomplete="off"` is not held by a check.** Every text field carries
  it, asking the browser's form autofill not to remember what is typed there.
  H3 holds the page's `translate="no"`, each text field's
  `spellcheck="false"`, and that no editable surface is added in the HTML
  or in JS (but for the review table's tick box, which is a checkbox), but
  not `autocomplete`, so a field without it would pass. It isn't a promise
  today. Open: add it to H3, or decide not to
  promise it.
- **The CSV is not yet checked in Excel or Google Sheets.** Manual check 2
  ran in LibreOffice Calc with formula evaluation on. The formula guard held:
  no cell computed a value. `café` also read correctly. The guard is a
  leading apostrophe written into the file, so it doesn't depend on which
  spreadsheet opens it. The file starts with a UTF-8 byte-order mark, which
  Excel needs to read accented letters. That mark is written by `csv-core.js`
  and held by a test (`tests/files.test.js`), but not yet seen in Excel. How
  Google Sheets imports the file isn't seen yet either. Open: run check 2 in
  Excel and in Google Sheets.
- **Chrome on Windows is not yet checked.** Manual check 3 (paste a PDF) ran
  in Chromium on Linux; check 4 (print the vocabulary list) ran there and in
  Firefox. Neither has run in Chrome on Windows. Open: run checks 3 and 4 on
  a Windows machine.
- **Firefox's print preview hides the worksheet's lines.** In Firefox
  153.5.0esr (manual check 5, 2026-10-20) the preview drew no blanks and no
  Name and Date lines at normal size; the saved PDF has them, and the 1px
  line shows at 200%. Open: draw those lines at 1pt.
- **Page translation staying off is not yet seen in a browser.** Every page
  carries `translate="no"` (check.sh H3), but manual check 7, which checks
  that Chrome or Chromium honours it, has not been run. Open: run check 7.
- **Chromium's PDF copy drops a hyphen at a line end.** Copied from Chromium
  155's PDF viewer, `third-party`, wrapped after its hyphen, reaches the
  clipboard as `thirdparty` (`tests/fixtures/paste/pdf.chrome.txt`, line 2).
  Ascham never removes a hyphen, but this one never arrives, so the teacher
  can get a card for a word that doesn't exist. Firefox's copy keeps the
  hyphen. Ascham can't tell a dropped hyphen from a real word; the hard-wrap
  hint warns of it. Chrome is not checked yet.
- **Pro's boundary is the licence key, not the code.** Ascham runs entirely
  in the teacher's browser, with no server, and its source is public so its
  privacy promises can be checked. The licence check refuses a forged or
  altered key. It can't stop someone who changes the code itself, in the
  browser's developer tools or in a local copy, from turning Pro features on.
  The licence (AGPL) permits that; anyone who shares such a copy, or lets
  people use it over a network, must offer them its source under the same
  licence.
  Closing that would take a server that sees the teacher's text, which would
  break those promises. The trade is deliberate; no fix is planned.
