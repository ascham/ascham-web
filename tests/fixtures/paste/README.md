# Paste fixtures

Real clipboard text (`text/plain`). The web pages and the email were copied
on 2026-10-11 in Google Chrome 155 and Firefox ESR 153; `index.json` gives
each version as the file records it. How they were selected and copied is
not recorded: `scripts/collect-paste.mjs` lists only the PDF and the pages
these files replaced. The email is the whole message body. The PDF was
copied from `sample.pdf`, which has one page: in Firefox's viewer by
`collect-paste.mjs`, the whole page; in Chromium 155's viewer by hand on
2026-10-18 (manual check 3), from the title to the end of the third
paragraph. The first NASA caption's credit, five places in the Austen files
and "In CONGRESS" in the Wikisource files were corrected by hand on
2026-10-25 to match their sources; the line breaks are as copied.

The web files hold public-domain text inside page furniture modelled on a
news release (`nasa`), a magazine (`gutenberg`) and a wiki (`wikisource`):
headlines, bylines, captions, image descriptions, and footnote markers
mid-sentence. The pages they and the email were copied from are not in the
repository, and how those pages were made is not recorded. The furniture,
and the short lines that plant the hard cases a text lacked (abbreviations,
a decimal and a currency figure, a contraction), were written for the
fixtures. The email is an invented message from a sender at a reserved
example domain.
`index.json` gives each file's source, browser and rights. `sample.pdf` is
printed by Google Chrome 155 from `pdf-source.html` (public-domain text,
Mark Twain), and `collect-paste.mjs` strips its metadata as it prints it.

## What a single line break means

- **Web pages, both browsers:** a boundary between blocks (headline, date,
  byline, caption, heading, paragraph, menu item). No single line break in
  these files falls inside a sentence. Many blocks end without a full stop
  (headlines, captions, headings), so turning the break into a space glues
  them onto the next sentence.
- **PDF (Firefox pdf.js):** one break per visual line, and none extra between
  paragraphs. Most fall mid-sentence. The heading and the line under it arrive
  with no break at all.
- **PDF (Chromium's viewer):** one break per visual line too, but the heading
  has its own line, and a word hyphenated at a line end arrives joined with
  its hyphen dropped (`third-party` → `thirdparty`).
- **Plain-text email:** hard-wrapped at 70 columns or fewer, paragraphs
  separated by a blank line. Most single breaks fall mid-sentence.
- **The browsers differ in detail, not in kind:** which blocks get a blank
  line, whether list items are indented, and whether a byline name and role
  are separated at all (Firefox runs them together).

Hence `KEEP_LINE_BREAKS_DEFAULT = true` in `src/core/paste.js`, with
`looksWrapped()` telling the teacher when a paste looks like a PDF or email.
`node scripts/measure-breaks.mjs` re-checks this when the fixtures change: it
counts the card sentences each mode damages.

Join mode keeps one kind of single break: the one after a heading-like line
(`HEADING_BREAK` in `paste.js`), so a heading such as "Grievances" is not
glued to the sentence under it. Measured 2026-10-19: across the ten files it
keeps breaks only after headings, titles, bylines and page clutter, and in
the wrapped files only after the PDF's title. Their prose re-wrapped at 25,
30, 35, 45 and 70 characters keeps none (`tests/paste.test.js`). Without the
function-word guard, the Declaration at 25 characters broke after "pursuit
of".
