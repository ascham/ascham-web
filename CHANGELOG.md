# Changelog

One section per release, newest first. Each gives the version and release
date, what changed in plain words, and the `SHA256SUMS` of that release's
`dist/` in a code block, which `VERIFY.md` compares with a build and with
the live site. The version at the top always equals `VERSION` in
`src/core/version.js` (`tests/version.test.js`).

## 1.4.0 — unreleased

The first release of Ascham as a web page.

- **Paste, highlight, review.** Paste a text, highlight a passage, and the
  page lists the words worth teaching. Each comes with the sentence it was
  taken from, word for word, and a level estimate written `~B2`: an
  estimate, not a CEFR measurement. Words it sets aside are counted by
  reason, and those treated as names, already common, or written with a
  hyphen or apostrophe are listed. Words the standard filter removes, slurs
  and obscenity, are neither listed nor counted.
- **Export.** Download the ticked words as a CSV for Anki, print the
  vocabulary list, or print a gap-fill worksheet with a word bank, your own
  before-, while- and after-reading questions and an answer key. Without
  Pro the deck is Basic and the worksheet is a sample on screen.
- **Projects.** Save your text, the passage you highlighted, the words you
  unticked, your questions and the worksheet's options to a `.json` file on
  your own computer, and open it again later. Each card's Basic or Cloze
  choice is not saved yet.
- **Pro.** A licence key, checked in the browser with no server, unlocks
  more features; the list is in `PROMISES.md` § What is free.
- **Promises.** What the page promises about your text, and what holds each
  promise (a check, or a step outside the code), are in `PROMISES.md`.
- **Source.** Each release's source is two downloads on the source page, a
  git bundle and a tar.gz, and the same repository is mirrored on GitHub at
  https://github.com/ascham/ascham-web. The downloads are the reference.

SHA256SUMS: added at release
