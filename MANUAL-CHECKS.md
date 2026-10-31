# Manual checks

What only a person can check. Each needs a fresh `bash scripts/build.sh` and
`node scripts/serve.mjs --dist`, opened at http://localhost:8000/app/. Record
the date, the versions used, the commit built and the result; an unfilled
result means not done. Records made before 2026-10-25 do not name their
commit.
Lines marked *(Windows)* need a Windows machine. Until one is used they stay
open, and `KNOWN-ISSUES.md` lists them.

Test text for 1–2: paste this, give it the title `Year 9: café test`, untick
one card, and download the CSV.

    Ombudsman report

    -20% growth, said the "ombudsman", was =SUM(A1) scrupulous.
    +Critics called the gerrymandering opaque; the café owners called it entrenched.
    @everyone: the extradition, they said, was "scrupulously" argued, with sabotage alleged.

## 1. The CSV imports into Anki

1. Anki (2.1.54 or later): File → Import, choose the CSV.
2. The import screen shows note type Basic, Front and Back mapped, tags
   `ascham Year-9-café-test`, the accent and the capital kept.
3. Import into a fresh deck. The count of notes added equals the ticked
   cards; the unticked word is absent.
4. Open three cards, including the `-20%` one: the front is the word, the
   back is its sentence, accents intact, a leading apostrophe on the guarded
   sentences and nothing else changed.

- Date: 2026-10-18  Anki version: 26.09.3 (29bb700b)  Result: pass

## 2. The CSV in a spreadsheet

1. Open the CSV in each of these:
   - Excel (Windows or Mac): double-click the file.
   - Google Sheets: File → Import → Upload. This needs a Google account.
   - LibreOffice Calc: in the Text Import dialog, tick "Evaluate formulas".
     With it off, Calc never tries to compute and the check proves nothing.
2. In each, no cell shows a computed value: the `=SUM(A1)`, `-20%`,
   `+Critics` and `@everyone` sentences read as text.
3. `café` reads as `café`, not `cafÃ©`.

- Date: 2026-10-18  LibreOffice Calc version: 25.2.3.2  Result: pass, with
  "Evaluate formulas" ticked; free CSV (`#html:false`)
- Date: …  Excel version: …  Result: … *(Windows)*
- Date: …  Google Sheets  Result: …

## 3. Paste a PDF from desktop Chrome or Chromium

1. In desktop Chrome or Chromium, open `tests/fixtures/paste/sample.pdf`,
   select from the title to the end of the third paragraph, copy.
2. Paste into Ascham. The hard-wrap hint appears.
3. Untick "Keep line breaks" and press Find words: sentences read whole, and
   `third-party` keeps its hyphen if the copy kept it (Chromium's does not;
   see its result below).
4. Compare the pasted text with `tests/fixtures/paste/pdf.chrome.txt`, saved
   from this check on 2026-10-18, and note what the browser's copy did with
   line ends.

- Date: 2026-10-18  Chromium version: 155.0.8059.79  Result: steps 1–2 pass.
  Step 3 not exercised: Chromium's copy joined `third-` / `party` into
  `thirdparty` on one line, so no hyphen reached Ascham, which kept it as a
  word. No test holds Chromium's join; `tests/paste.test.js` holds Ascham's
  own, which keeps a hyphen at a line end in join mode, and `pdf.chrome.txt`
  keeps the copy as it came. The copy put one line break per visual line,
  none between paragraphs, and the heading on its own line.
- Date: …  Windows Chrome version: …  Result: … *(Windows)*

## 4. Print to PDF from real Chrome or Chromium, and Firefox

1. Paste any article, untick two cards, press "Print vocabulary list".
2. In the print dialog, the preview shows only the title, source and the
   ticked words with their level and sentence; no buttons, no text box.
3. Save as PDF. Open it: the unticked words are absent, nothing is cut off at
   a page edge, a row never splits across a page.
4. Repeat in Firefox. Also try Ctrl+P instead of the button.

- Date: 2026-10-20  Chromium version: 155.0.8059.79  Result: pass
- Date: 2026-10-20  Firefox version: 153.5.0esr  Result: pass
- Date: …  Windows Chrome version: …  Result: … *(Windows)*

## 5. Print the worksheet from real Chrome or Chromium, and Firefox

1. Without a key, paste the Declaration of Independence fixture
   (`tests/fixtures/paste/wikisource.chrome.txt`), press Find words, tick
   "Include the full text" and type one While reading question. The sheet on
   screen is the sample: at most 3 items, no text, no question section, no
   answer key, and the sample line at the end. Untick "Include the full
   text", then enter the Pro key.
2. The sheet on screen is now whole. Untick `mankind` and press "Print
   worksheet".
3. In the print preview: the header with Name and Date lines, the word
   bank, the numbered items, the one question section; no buttons, no text
   box, no review table.
4. Every blank is the same width and none is cut at a page edge; an item
   never splits across pages. `mankind` is in its sentences, not blanked.
5. The answer key starts on a page of its own and its labels match the
   blanks (2, 3a, 3b…).
6. Save as PDF and print it once on paper: the blanks are long enough to
   write a word in by hand.
7. Tick "Include the full text" and print again: the text comes before the
   word bank; no heading, and no heading-like line of the text such as
   "Grievances", is the last thing on a page, and no page ends in a large
   gap. Untick "Include answer key": no key page.
8. Afterwards press Ctrl+P: it prints the vocabulary list, not the sheet.
9. Remove the key: the sheet on screen is the sample again.
10. Repeat in Firefox.

- Date: 2026-10-19  Chromium version: 155.0.8059.79  Result: steps 3–9
  pass. Step 6: a word fits in a blank, but tightly for large handwriting.
  Printed blanks were widened to 50 mm on 2026-10-20, after this run; that
  width is not yet printed. Step 7: with the full text unticked the sheet
  is the word bank and the items only, as designed. Step 7 run again on
  2026-10-24 in Chromium 156.0.8078.47, with the full text ticked and "Keep
  line breaks" on: "Grievances" stays on the page of the paragraph under it
  ("He has refused…", "He has forbidden…"), not alone at a page bottom.
- Date: 2026-10-20  Firefox version: 153.5.0esr  Result: steps 4, 7, 8
  and 9 pass: no item splits, and "Grievances" stays on the page of the
  paragraph under it. With "Keep line breaks" unticked, "Grievances" is not a
  card. Steps 3, 5 and 6 confirmed from the saved PDF: its contents, the key
  on a page of its own, and the blank width; not printed on paper.
  Known issue, not yet fixed: Firefox's print preview draws no blanks or
  Name and Date lines at normal size, though the saved PDF has them (the 1px
  line shows at 200%). A 1pt line is queued.

## 6. A real licence key unlocks Pro

The tests use a test-only key pair, so only a person can check a key signed
by the real issuer against the shipped page.

1. Use a real 1.x key, issued by Ascham. None is in this repository.
2. Open Settings and licence key, paste it, Save key: the state reads
   "Pro is unlocked for Ascham 1." and every Pro control is enabled.
3. Reload: still unlocked. Print worksheet prints; the CSV has `#html:true`.
4. Remove key: the free version again, Pro controls disabled with their lines.
5. Paste a key from `tests/fixtures/licence/keys.json` (`valid1`): refused,
   "That key was not issued by Ascham…".
6. Change the real key's tag, `ASCH1`, to `ASCH2` and paste it: refused as
   malformed, "That does not look like an Ascham key…".

- Date: 2026-10-20  Browser and version: Firefox 153.5.0esr  Result: steps
  2–4 pass: the real key unlocks Pro and still does after a reload, Print
  worksheet opens, the CSV has `#html:true` (`#html:false` without the key),
  and removing the key locks Pro again. Step 5 run with a key signed by a
  throwaway issuer made for this check (well-formed, valid under its own
  issuer) instead of `valid1`: refused, "That key was not issued by
  Ascham…"; Pro stays locked. A made-up key is refused as malformed: "That
  does not look like an Ascham key…". Step 6 not run: no key under another
  tag was tried live. Shown in code instead: the build ships one issuer
  public key (`licence-core.js` ISSUER, hash pinned in
  `tests/logic.test.js`), and a key under another tag is refused as
  malformed before any signature check (`tests/pro.test.js`).

## 7. Page translation stays off

Every page carries `translate="no"` (check.sh H3), so that a browser's page
translation, which sends the page's text to a vendor, is not offered. Only a
browser shows that it is honoured.

1. In desktop Chrome or Chromium, paste a paragraph of French into Ascham and
   press Find words.
2. No translation offer appears, and the right-click menu offers no
   "Translate to English", or, if it does, the page's text stays unchanged.

- Date: …  Chrome or Chromium version: …  Result: …

## 8. Leaving unsaved work asks first, in Firefox

The browser test checks that the page asks before it is left with unsaved
work, in Chrome and Firefox, but only Chrome's own dialog can be seen there
(`KNOWN-ISSUES.md`). Run this again before any release that changes the
leaving warning or "Start again" in `src/ui/main.js`: no automated check
would catch Firefox's dialog failing.

1. In Firefox, paste any text into the box.
2. Press F5: Firefox's own dialog asks before leaving. "Stay on Page" keeps
   the text.
3. Repeat with the reload button, and with closing the tab.

- Date: 2026-10-31  Firefox version: 153.6.0esr  Commit: 0c96d4a  Result:
  pass: the dialog appeared on F5, the reload button and closing the tab,
  and "Stay on Page" kept the work each time.
