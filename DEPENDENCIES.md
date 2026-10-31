# Dependencies

**Runtime:** none. The browser loads only files from this repository.

**Development tools** (nothing is installed from a package registry):

| Tool | Purpose | Maintainer | Origin |
|---|---|---|---|
| Node.js 20.10 or later; the gates run on Debian's 20.19.2, and no other version is run | Runs the tests (`node --test`) and every `.mjs` script: the dev server, the browser drivers, the paste collector, the line-break measure | OpenJS Foundation | United States |
| Bash; GNU coreutils, grep, sed, findutils, diffutils (`cmp`, `diff`), tar | Every shell script in `scripts/` | GNU packages; each tool's `--version` names the copyright holder as Free Software Foundation, Inc. | Not checked |
| awk, POSIX; the gates run mawk, Debian's default | `scripts/check.sh`, `verify-live.sh` | Thomas E. Dickey (mawk, after Mike Brennan) | Not stated on the maintainer's site |
| git | `check.sh` R1, `export-public.sh`, `pre-publish.sh`, `check-mutations.sh` | The Git project, a member project of Software Freedom Conservancy | United States (Software Freedom Conservancy) |
| Perl 5 | one mutant in `check-mutations.sh` | Volunteer developers, with grants from The Perl and Raku Foundation | United States (the Foundation) |
| `ss` (iproute2, Debian package) | `check-mutations.sh`: finds a port left open | Stephen Hemminger (the kernel.org repository) | Not stated |
| Chromium (headless; Debian package), or Google Chrome | `scripts/browser-test.mjs`, `scripts/collect-paste.mjs` | The Chromium Projects (upstream); the Debian Chromium Team (the package the gates run) | Not stated (upstream); international (Debian) |
| Firefox ESR (headless, Marionette) | `scripts/browser-test.mjs`, `scripts/collect-paste.mjs` | Mozilla Corporation, part of the Mozilla Project | United States |
| curl (Debian package) | `scripts/verify-live.sh`, and the local check of it in `check-mutations.sh` | curl project, Daniel Stenberg | Sweden |
| `pdftotext` (poppler-utils, Debian package) | `scripts/browser-test.mjs`: reads the printed PDF back as text | Poppler project, freedesktop.org (based on the Xpdf 3.0 code, whose rights Glyph & Cog holds) | Not stated (Poppler); United States (Glyph & Cog) |

Used for one-off file edits, not needed to build or test: Python 3 (Python
Software Foundation, US). Node 20 needs `--experimental-websocket`, added in
20.10.0, for the two browser scripts.

Data consulted, not a tool: SCOWL 2020.12.07 (Kevin Atkinson), the source of
band 3's `UP_ORDINARY` list in `src/core/wordlist.js` — see `NOTICE`.
