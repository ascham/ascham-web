#!/usr/bin/env bash
# The web app's static promise-check. Bash and GNU grep only.
#
#   bash scripts/check.sh            the source tree: src/ and public/
#   bash scripts/check.sh dist       the assembled site in dist/ (build.sh)
#
# Exit 0 pass, 1 a rule failed, 2 broken. Each rule is named;
# PROMISES.md cites rules by these names. scripts/check-mutations.sh breaks
# each rule once and confirms this script notices.
set -u
cd "$(dirname "$0")/.." || exit 2

# The canonical CSP. Stated here; pages and _headers are held to it
# character for character, and PROMISES.md quotes it exactly.
CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"

# The one sentence that may say "open source" (L1; PROMISES.md).
LICENCE_LINE="Open source under the GNU AGPL, version 3: anyone can read, build, verify and change the code, and share changes under the same licence."

# The canonical HSTS header, held to the same standard in _headers (C1).
# Staged so a mistake cannot lock anyone out; move one stage at
# a time, and only by changing this line:
#   1 at launch:                 max-age=86400
#   2 after 7 days stable:       max-age=31536000; includeSubDomains
#   3 after 30 more days stable: max-age=63072000; includeSubDomains; preload,
#     then submit to the browser preload list. Hard to undo: an
#     explicit go-ahead first.
# .app is preloaded as a whole already, so ascham.app is HTTPS-only in
# browsers that carry the list whatever this says; the stages still hold for
# the rest, and for the record of what we intend.
HSTS="max-age=86400"

fail=0
bad() { echo "FAIL $1: $2"; fail=1; }

case "${1:-src}" in
  src)  CODE=(src public); PAGES=(public); HEADERS=public/_headers; SRC=src ;;
  dist) CODE=(dist); PAGES=(dist); HEADERS=dist/_headers; SRC=dist/src ;;
  *)    echo "usage: check.sh [src|dist]"; exit 2 ;;
esac
TARGET=${1:-src}
STORE_JS=$SRC/core/store.js
DOWNLOAD_JS=$SRC/ui/download.js
REVIEW_JS=$SRC/ui/review.js
STRINGS_JS=$SRC/ui/strings.js
[ -d "${CODE[0]}" ] || { echo "BROKEN: ${CODE[0]}/ does not exist"; exit 2; }

mapfile -t JS < <(find "${CODE[@]}" -type f \( -name '*.js' -o -name '*.mjs' \) | sort)
mapfile -t HTML < <(find "${PAGES[@]}" -type f -name '*.html' | sort)
mapfile -t CSS < <(find "${CODE[@]}" -type f -name '*.css' | sort)

# A sweep over nothing passes everything, so an empty sweep is a broken run.
if [ ${#JS[@]} -eq 0 ] || [ ${#HTML[@]} -eq 0 ]; then
  echo "BROKEN: found ${#JS[@]} JS and ${#HTML[@]} HTML files to check"
  exit 2
fi

# ---- N1: no network API in shipped JS (comments included) ------------------
hits=$(grep -naE '\bfetch(Later)?\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket|\bEventSource\b|\bimport\s*\(|importScripts|Worker\s*\(|serviceWorker|RTCPeerConnection|WebTransport' "${JS[@]}")
[ -n "$hits" ] && bad N1 "network-capable API in shipped JS:
$hits"

# ---- N2: no URL literal in shipped JS (comments included) ------------------
# The app has no destination, so there is no allowlist.
hits=$(grep -naoE '[A-Za-z][A-Za-z0-9+.-]*://[^ "'"'"'`)]*|javascript:' "${JS[@]}")
[ -n "$hits" ] && bad N2 "URL literal in shipped JS:
$hits"

# ---- N3: no navigation or resource-loading API in shipped JS (comments included)
# CSP does not govern top-level navigation, so a navigation carrying text out
# is stopped here, statically, and nowhere else. See PROMISES.md. The names
# `location`, `navigation` and `navigate` are banned however they are used,
# so an alias such as `const l = location` fails too; ONE EXEMPTION: a line of
# wordlist.js that holds only lowercase words, where "location" is a word to
# teach. `open` is banned as a call and as a property of a global object, a
# global object may not be indexed by a computed name, and `Reflect` is
# banned. A navigating or loading element may not be made by name, through
# createElement, createElementNS or review.js's el(), nor given an address by
# assignment, attribute or object key, nor clicked by a synthetic event.
#
# ONE NAMED EXEMPTION: src/ui/download.js, the only place a blob: URL and an
# anchor click may exist. Everywhere else the download door's own tools are
# banned too. Inside download.js the lines that use them must be exactly
# those below: an object URL made from a Blob, an anchor with `download` set,
# its href that URL and nothing else, one click, and the URL revoked.
tags='a|area|form|iframe|frame|img|image|script|link|meta|base|object|embed|portal|video|audio|source|track'
nav='\blocation\b|\bnavigat(ion|e)\b|\bopen\s*\(|\b(window|self|globalThis|top|parent|opener|frames|document)\s*(\.\s*open\b|\[)|\bReflect\b|\.(href|src|action|formAction|ping|srcset)\s*=[^=]|\b(href|src|action|formAction|ping|srcset)\s*:|setAttribute\s*\(\s*['"'"'"](href|src|srcset|action|formaction|ping|http-equiv)|createElementNS|(createElement|\bel)\s*\(\s*['"'"'"`]('"$tags"')['"'"'"`]'
door='createObjectURL|revokeObjectURL|\bblob:|\.click\s*\(|MouseEvent|PointerEvent|dispatchEvent|\.download\s*=|\bdownload\s*:'
hits=$(grep -naE "$nav|$door" "${JS[@]}" | grep -v "^$DOWNLOAD_JS:" | grep -vE "^$SRC/core/wordlist\.js:[0-9]+:[a-z ]+$")
[ -n "$hits" ] && bad N3 "navigation, resource-loading or download API in shipped JS:
$hits"
if [ -f "$DOWNLOAD_JS" ]; then
  got=$(grep -naE "$nav|$door|\bnew\s+Blob\b" "$DOWNLOAD_JS" /dev/null | cut -d: -f3- | sed -E 's/^\s+//')
  want="const blob = new Blob([text], { type });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.download = safeName(name, ext ? ext[1].toLowerCase() : '');
a.href = url;
a.click();
setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);"
  [ "$got" = "$want" ] || bad N3 "$DOWNLOAD_JS: the download door must be exactly these lines:
$want
  got:
$got"
fi

# ---- N4: no same-origin request or address can carry text (comments included)
# CSP 'self' still lets the page load our own images, fonts, styles and
# scripts, so a URL built from the text would reach our host, and its logs,
# while every request stays on the origin. These are the ways JS can make
# one that N1 and N3 do not name: a CSS url(), however it gets into a style
# (the style object, setProperty, cssText, a sheet, typed OM, a <style>
# element), a font, a worklet, a notification icon; and an address changed
# in place (pushState), which a reload, a bookmark or history sync sends on.
hits=$(grep -naE 'FontFace|addModule|insertRule|setProperty|adoptedStyleSheets|CSSStyleSheet|styleSheets|attributeStyleMap|CSSStyleValue|cssText|\.style\s*(\.|\[|=)|setAttribute\s*\(\s*['"'"'"]style['"'"'"]|createElement\s*\(\s*['"'"'"]style['"'"'"]|\bNotification\b|pushState|replaceState' "${JS[@]}"
  grep -naiE '(^|[^A-Za-z.])url\s*\(' "${JS[@]}")
[ -n "$hits" ] && bad N4 "a same-origin request or address that could carry text, in shipped JS:
$hits"

# ---- X1: no HTML or code sink in shipped JS --------------------------------
# PROMISES.md promise 6. Banned outright rather than traced, comments included:
# pasted text reaches the page only as text, never as markup. A timer takes an
# arrow function written in place, never a string, and JS sets no on…
# attribute. Code reached by a computed name is beyond a grep; the CSP, with
# no 'unsafe-eval' or 'unsafe-inline', stops it (C1).
hits=$(grep -naE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|srcdoc|createContextualFragment|DOMParser|setHTML|parseHTML|\beval\s*\(|new\s+Function\b|set(Timeout|Interval)\s*\(\s*[^([:space:]]|setAttribute\s*\(\s*['"'"'"`][oO][nN]' "${JS[@]}")
[ -n "$hits" ] && bad X1 "HTML or code sink in shipped JS:
$hits"

# ---- S1: browser storage only through store.js, two keys only --------------
# PROMISES.md promise 3. Every storage API named in shipped JS, comments
# included, must be in store.js; store.js may use localStorage and nothing
# else; and its allowlist is exactly the settings key and the licence key,
# imported from their cores.
storage='localStorage|sessionStorage|indexedDB|IDBFactory|\.cookie\b|cookieStore|\bcaches\s*\.|navigator\s*\.\s*storage|openDatabase|requestFileSystem'
if [ ! -f "$STORE_JS" ]; then
  bad S1 "$STORE_JS is missing"
else
  hits=$(grep -naE "$storage" "${JS[@]}" | grep -v "^$STORE_JS:")
  [ -n "$hits" ] && bad S1 "browser storage named outside $STORE_JS:
$hits"
  hits=$(grep -naE "$storage" "$STORE_JS" /dev/null | grep -vE '^[^:]+:[0-9]+:.*\blocalStorage\b' ; grep -naE 'sessionStorage|indexedDB|cookie|caches|navigator' "$STORE_JS" /dev/null)
  [ -n "$hits" ] && bad S1 "$STORE_JS uses storage other than localStorage:
$hits"
  allow=$(grep -naE 'ALLOWED\s*=|ALLOWED\s*\.\s*(add|delete|clear)|^\s*import\b' "$STORE_JS" /dev/null | cut -d: -f3-)
  want="import { STORE as SETTINGS_KEY } from './settings-core.js';
import { STORE as LICENCE_KEY } from './licence-core.js';
const ALLOWED = new Set([SETTINGS_KEY, LICENCE_KEY]);"
  [ "$allow" = "$want" ] || bad S1 "$STORE_JS: the allowlist must be exactly the settings and licence keys:
$allow"
fi

# ---- U1: wording lives in strings.js and nowhere else ----------------------
# Every word the page says is approved, so every word is in one file.
# The other UI modules may not hold a literal a person would read. Each string
# literal in them is lifted out (awk, below) and fails when it holds a space
# or a non-ASCII character (whitespace alone passes), or is one capitalised
# word other than a key name compared with an event's .key; and no literal
# may be handed straight to a text sink. The app's index.html body carries
# data-s keys and no text of its own; its <title> is the name (B1's one
# exemption). The site's other pages are plain HTML whose every line is
# quoted in PROMISES.md instead (tests/pages.test.js), so U1 and B1 read only
# the app's page.
#
# literals FILE... prints FILE:LINE:CONTENT for every string literal in code,
# a template's ${...} shown as ${}. A line comment is skipped, and so is a
# line of a block comment, up to its closing */ when code follows on the
# same line. Regex literals are skipped, so a quote inside one does not open
# a string.
literals() {
  awk -v sq="'" -v dq='"' -v bq='`' '
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*(\*|\/\*)/ { k = index($0, "*/"); if (!k) next; $0 = substr($0, k + 2) }
    {
      line = $0; n = length(line); i = 1; mode = ""; lit = ""; prev = ""
      while (i <= n) {
        c = substr(line, i, 1)
        if (mode == "") {
          if (c == "/" && substr(line, i + 1, 1) == "/") break
          if (c == sq || c == dq || c == bq) { mode = c; lit = ""; i++; continue }
          if (c == "/" && (prev == "" || index("(,=:[!&|?{};", prev) > 0)) {
            i++; cls = 0
            while (i <= n) {
              d = substr(line, i, 1)
              if (d == "\\") { i += 2; continue }
              if (d == "[") cls = 1; else if (d == "]") cls = 0; else if (d == "/" && !cls) break
              i++
            }
            i++; prev = "x"; continue
          }
          if (c != " " && c != "\t") prev = c
          i++; continue
        }
        if (c == "\\") { lit = lit substr(line, i, 2); i += 2; continue }
        if (mode == bq && c == "$" && substr(line, i + 1, 1) == "{") {
          depth = 1; i += 2
          while (i <= n && depth > 0) {
            d = substr(line, i, 1)
            if (d == "{") depth++; else if (d == "}") depth--
            i++
          }
          lit = lit "${}"; continue
        }
        if (c == mode) { print FILENAME ":" FNR ":" lit; mode = ""; prev = "x"; i++; continue }
        lit = lit c; i++
      }
      if (mode != "") print FILENAME ":" FNR ":" lit
    }' "$@"
}
mapfile -t UI_JS < <(printf '%s\n' "${JS[@]}" | grep -E "^$SRC/ui/[^/]+\.m?js$" | grep -vx "$STRINGS_JS")
if [ ! -f "$STRINGS_JS" ]; then
  bad U1 "$STRINGS_JS is missing"
elif [ ${#UI_JS[@]} -gt 0 ]; then
  q="['\"\`]"
  hits=$(literals "${UI_JS[@]}" | grep -E '^[^:]+:[0-9]+:.*[^[:space:]]' | grep -E '^[^:]+:[0-9]+:.*[[:space:]]'
    literals "${UI_JS[@]}" | grep -aP '^[^:]+:[0-9]+:.*[^\x00-\x7F]'
    literals "${UI_JS[@]}" | grep -E '^[^:]+:[0-9]+:[A-Z][a-z]+$' | while IFS=: read -r f l w; do
      sed -n "${l}p" "$f" | grep -qE "\.key\s*[!=]==?\s*'$w'" || echo "$f:$l:$w"
    done
    grep -naE "(textContent|innerText|title|placeholder|alt|label)\s*=\s*$q[^'\"\`]|setAttribute\s*\(\s*$q(aria-label|aria-description|aria-roledescription|aria-valuetext|title|placeholder|alt)$q\s*,\s*$q|\bel\s*\(\s*$q[a-z0-9]+$q\s*,\s*$q|\bshow\s*\(\s*[A-Za-z_.\$]+\s*,\s*$q[^'\"\`]|\.(append|prepend|before|after|replaceWith)\s*\(\s*$q" "${UI_JS[@]}" /dev/null)
  [ -n "$hits" ] && bad U1 "user-facing literal outside $STRINGS_JS:
$hits"
fi
APP_HTML=${PAGES[0]}/app/index.html
[ -f "$APP_HTML" ] || bad U1 "$APP_HTML is missing"
for f in "$APP_HTML"; do
  hits=$(sed -n '/<body\b/,/<\/body>/p' "$f" | sed -E 's/<!--.*-->//g; s/<[^>]*>//g' | grep -n '[^[:space:]]'
    grep -noiE '\s(aria-label|title|placeholder|alt|value)="[^"]+"' "$f")
  [ -n "$hits" ] && bad U1 "$f: text in the page itself rather than a data-s key:
$hits"
done

# ---- F1: Pro's work is reached only through pro.js's gates -----------------
# PROMISES.md § What is free. Each gate is where its action runs, so no other
# page code may reach the work behind it. Outside pro.js, src/ui names
# `analyse`, `build` and `csvFile` (comments included) only where each is
# defined (pipeline.js, worksheet.js, files.js, which also calls csv-core's
# own build) or as Pro's (`Pro.csvFile`); strings.js's wording entries are
# text and are skipped. Only files.js and worksheet.js import csv-core.js.
mapfile -t PAGE_JS < <(printf '%s\n' "${JS[@]}" | grep -E "^$SRC/ui/[^/]+\.m?js$" | grep -vx "$SRC/ui/pro.js")
if [ ${#PAGE_JS[@]} -gt 0 ]; then
  hits=$(grep -naE '\b(analyse|build|csvFile)\b' "${PAGE_JS[@]}" /dev/null \
    | grep -vE "^$STRINGS_JS:[0-9]+:\s*[A-Za-z_]+: '[^']*',( //.*)?$" \
    | while IFS= read -r hit; do
        f=${hit%%:*}; rest=${hit#*:}
        case "$f" in
          */pipeline.js) own='^analyse$' ;;
          */worksheet.js) own='^build$' ;;
          */files.js) own='^(csvFile|Csv\.build)$' ;;
          *) own='^$' ;;
        esac
        grep -oE '([A-Za-z_$]+\s*\.\s*)?\b(analyse|build|csvFile)\b' <<<"${rest#*:}" \
          | grep -vE "$own|^Pro\s*\.\s*csvFile$" | sed "s#^#$f:${rest%%:*}: #"
      done
    grep -nE "['\"]\.\./core/csv-core\.js['\"]" "${PAGE_JS[@]}" /dev/null | grep -vE "^$SRC/ui/(files|worksheet)\.js:")
  [ -n "$hits" ] && bad F1 "Pro's work reached outside pro.js:
$hits"
fi

# ---- B1: the product's name lives in brand.js and nowhere else -------------
# So a rename is one edit. Any case, comments included, in every shipped JS,
# HTML and CSS file and the headers. In brand.js the name may stand only in
# its two constants, NAME and SLUG. ONE EXEMPTION: a page's <title> line,
# exactly `<title>NAME</title>`, so the page has a title before any script
# runs; tests/strings.test.js holds it equal to NAME.
BRAND='[Aa][Ss][Cc][Hh][Aa][Mm]'
BRAND_JS=$SRC/core/brand.js
if [ ! -f "$BRAND_JS" ]; then
  bad B1 "$BRAND_JS is missing"
else
  hits=$(grep -nE "$BRAND" "${JS[@]}" "$APP_HTML" "${CSS[@]}" "$HEADERS" | grep -v "^$BRAND_JS:" \
    | grep -vE "^[^:]+\.html:[0-9]+:\s*<title>$BRAND</title>\s*$")
  [ -n "$hits" ] && bad B1 "the product's name outside $BRAND_JS:
$hits"
  hits=$(grep -nE "$BRAND" "$BRAND_JS" /dev/null | grep -vE "^[^:]+:[0-9]+:const (NAME|SLUG) = '[^']*';$")
  [ -n "$hits" ] && bad B1 "$BRAND_JS: the name outside the NAME and SLUG constants:
$hits"
  grep -qE '^export \{ NAME, SLUG \};$' "$BRAND_JS" || bad B1 "$BRAND_JS does not export NAME and SLUG"
fi

# ---- L1: never "open source", except in the one licence sentence -----------
# The claim is made once, in that sentence, and nowhere else. Any case, a
# hyphen or none, across a line break, on every public surface: shipped code
# and pages, and the documents that ship or face the public. Whitespace is
# folded first, so the exact sentence may wrap; it is then the only thing
# removed.
case "$TARGET" in
  src)  DOCS=(README.md LICENSE NOTICE TRADEMARKS.md CONTRIBUTING.md SECURITY.md) ;;
  dist) DOCS=(dist/LICENSE dist/NOTICE dist/TRADEMARKS.md) ;;
esac
sentence_re=$(sed 's/[].[*^$\\/#]/\\&/g' <<<"$LICENCE_LINE")
for f in "${JS[@]}" "${HTML[@]}" "${CSS[@]}" "$HEADERS" "${DOCS[@]}"; do
  [ -f "$f" ] || { bad L1 "$f is missing"; continue; }
  hits=$(tr -s '[:space:]' ' ' < "$f" | sed "s#$sentence_re##g" \
    | LC_ALL=C.UTF-8 grep -ioP 'open(?:\s|-|\x{2010}|\x{2011})*source')
  [ -n "$hits" ] && bad L1 "$f says \"$(head -1 <<<"$hits")\" outside the source-available sentence (PROMISES.md)"
done

# ---- H1: no external reference in HTML or CSS ------------------------------
# Any scheme other than data:, or a protocol-relative //, is external.
# ONE NAMED EXEMPTION: the source page's link to the GitHub mirror, exactly
# <a href="https://github.com/ascham/ascham-web"> in source/index.html. A
# link loads nothing. That address in any other tag or attribute, any other
# address there, or the address on any other page, fails.
MIRROR=https://github.com/ascham/ascham-web
SOURCE_HTML=${PAGES[0]}/source/index.html
mirror_re=${MIRROR//./\\.}
ext='^["'"'"']?\s*(//|[A-Za-z][A-Za-z0-9+.-]*:)'
hits=$(grep -naoE '\b(src|href|action|formaction|poster|srcset|imagesrcset|data|cite|background|ping|manifest)\s*=\s*("[^"]*"|'"'"'[^'"'"']*'"'"'|[^ >]+)' "${HTML[@]}" \
  | awk -F'=' '{v=$0; sub(/^[^=]*=[ ]*/, "", v); print v "\t" $0}' \
  | grep -E "$ext" | grep -vE '^["'"'"']?\s*data:' | cut -f2 \
  | grep -vxE "${SOURCE_HTML//./\\.}:[0-9]+:href=\"$mirror_re\"")
[ -n "$hits" ] && bad H1 "external reference in HTML:
$hits"
if [ -f "$SOURCE_HTML" ]; then
  hits=$(grep -noE "<[^>]*$mirror_re[^>]*>" "$SOURCE_HTML" | grep -vE "^[0-9]+:<a href=\"$mirror_re\">$")
  [ -n "$hits" ] && bad H1 "$SOURCE_HTML: the mirror's address other than as <a href=\"$MIRROR\">:
$hits"
fi
# CSS lives in .css files only, where the scan below reads it.
hits=$(grep -naoiE '<style\b[^>]*>' "${HTML[@]}")
[ -n "$hits" ] && bad H1 "a <style> element in HTML:
$hits"
# A quoted address loads without url() too, as in image-set("…").
if [ ${#CSS[@]} -gt 0 ]; then
  hits=$(grep -naoE 'url\(\s*["'"'"']?\s*(//|[A-Za-z][A-Za-z0-9+.-]*:)[^)]*\)|@import|["'"'"']\s*(//|[A-Za-z][A-Za-z0-9+.-]*://)[^"'"'"']*' "${CSS[@]}" | grep -vE 'url\(\s*["'"'"']?\s*data:')
  [ -n "$hits" ] && bad H1 "external reference or @import in CSS:
$hits"
fi

# ---- H2: scripts are same-origin modules, nothing inline -------------------
for f in "${HTML[@]}"; do
  hits=$(grep -naoE '<script\b[^>]*>' "$f" | grep -vE 'type="module"' ; grep -naoE '<script\b[^>]*>' "$f" | grep -vE '\bsrc="')
  [ -n "$hits" ] && bad H2 "$f: script that is not an external module:
$hits"
  hits=$(grep -naE '<script\b[^>]*>[^<]' "$f"; grep -naiE '\son[a-z]+\s*=' "$f"; grep -naiE '\sstyle\s*=' "$f")
  [ -n "$hits" ] && bad H2 "$f: inline script, handler or style:
$hits"
done

# ---- H3: no browser feature sends typed text away -------------------------
# Enhanced spell check and page translation send text to a vendor when the
# teacher has them switched on, and CSP governs neither. So the page opts out
# of translation, every text field opts out of spell check, and nothing in JS
# makes a new editable surface that could forget to (comments included): no
# contentEditable or designMode, and no input or textarea made by name through
# createElement or review.js's el() (N3 bans createElementNS outright).
# ONE NAMED EXEMPTION: review.js's tick box, the only such line, which must be
# exactly `const box = el('input');` with `box.type = 'checkbox';` the line
# after it. A tag name passed in a variable is not seen.
for f in "${HTML[@]}"; do
  grep -qiE '<html\b[^>]*\btranslate="no"' "$f" || bad H3 "$f: <html> lacks translate=\"no\""
  hits=$(grep -noiE '<(textarea|input)\b[^>]*>' "$f" \
    | grep -viE 'type="(checkbox|radio|button|submit|reset|file|hidden|range|color)"' \
    | grep -viE 'spellcheck="false"')
  [ -n "$hits" ] && bad H3 "$f: text field without spellcheck=\"false\":
$hits"
  hits=$(grep -noiE 'contenteditable' "$f")
  [ -n "$hits" ] && bad H3 "$f: contenteditable:
$hits"
done
hits=$(grep -naE 'contentEditable|designMode' "${JS[@]}")
[ -n "$hits" ] && bad H3 "editable surface created in JS:
$hits"
hits=$(grep -naE '(createElement|\bel)\s*\(\s*['"'"'"`](input|textarea)['"'"'"`]' "${JS[@]}")
if [ -n "$hits" ]; then
  n=$(cut -d: -f2 <<<"$hits" | head -1)
  got=$(cut -d: -f1,3- <<<"$hits" | sed -E 's/:\s+/:/')
  next=$(sed -n "$((n + 1))p" "$REVIEW_JS" 2>/dev/null | sed -E 's/^\s+//')
  [ "$got" = "$REVIEW_JS:const box = el('input');" ] && [ "$next" = "box.type = 'checkbox';" ] \
    || bad H3 "input or textarea made in JS, other than review.js's tick box (\`const box = el('input');\` then \`box.type = 'checkbox';\`):
$hits"
fi

# ---- H4: nothing in the app's page takes you elsewhere ---------------------
# In the app the shop's address is plain text, never a link (PROMISES.md,
# Buying Pro). H1 stops only external links, so an <a> or <area> to /buy
# would pass it; this stops any, and a meta refresh, which navigates with no
# click. A Refresh header in _headers would do the same to every page. N3
# stops JS from navigating; CSP form-action 'none' stops a form. And
# _headers sets no cookie ("Our site sets no cookies", the privacy page).
hits=$(grep -noiE '<(a|area)\b[^>]*>|<meta\b[^>]*http-equiv\s*=\s*["'"'"']?refresh' "$APP_HTML")
[ -n "$hits" ] && bad H4 "$APP_HTML: a link or refresh in the app's page:
$hits"
hits=$(grep -niE '^\s*refresh\s*:' "$HEADERS")
[ -n "$hits" ] && bad H4 "$HEADERS: a Refresh header:
$hits"
hits=$(grep -niE '^\s*set-cookie\s*:' "$HEADERS")
[ -n "$hits" ] && bad H4 "$HEADERS: a Set-Cookie header:
$hits"

# ---- H5: nothing shadows the /buy redirect --------------------------------
# /buy is no file: _redirects sends it to the checkout. The host serves a
# file before it applies a redirect, so a buy, buy/ or buy.html at the root
# would answer /buy in its place.
hits=$(find "${PAGES[0]}" -maxdepth 1 \( -name buy -o -name buy.html \) -print)
[ -n "$hits" ] && bad H5 "a file or folder that would shadow the /buy redirect:
$hits"

# ---- A1: nothing asks for an account ---------------------------------------
# PROMISES.md promise 5. There is no backend to hold an account, and nothing in
# a page asks for one: no password or email field, in HTML or made in JS, no
# autocomplete hint for a username or password, and no Credential Management
# API (comments included).
hits=$(grep -noiE '<input\b[^>]*\btype\s*=\s*["'"'"']?(password|email)\b|\bautocomplete\s*=\s*["'"'"']?[^"'"'"'>]*\b(username|current-password|new-password)\b' "${HTML[@]}")
[ -n "$hits" ] && bad A1 "a password, email or sign-in field in HTML:
$hits"
hits=$(grep -naE '\bcredentials\b|PasswordCredential|FederatedCredential|['"'"'"`](password|email)['"'"'"`]' "${JS[@]}")
[ -n "$hits" ] && bad A1 "a credential API or a password or email field in shipped JS:
$hits"

# ---- C1: the CSP and HSTS are present, once, and exactly canonical --------
for f in "${HTML[@]}"; do
  metas=$(grep -oiE '<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"' "$f")
  n=$(printf '%s' "$metas" | grep -c . || true)
  if [ "$n" -ne 1 ]; then
    bad C1 "$f: expected one CSP <meta>, found $n"
  else
    got=$(printf '%s' "$metas" | sed -E 's/.*content="([^"]*)"/\1/')
    [ "$got" = "$CSP" ] || bad C1 "$f: CSP differs from the canonical string:
  got:  $got
  want: $CSP"
    # A <meta> CSP governs only what comes after it, so nothing that loads
    # may come before it.
    hits=$(sed -n '1,/Content-Security-Policy/p' "$f" | grep -noiE '<(link|script|style|img|base|iframe|frame|object|embed|video|audio|source|picture|svg|image)\b')
    [ -n "$hits" ] && bad C1 "$f: loads something before its CSP <meta>:
$hits"
  fi
done
hdr=$(grep -E '^\s+Content-Security-Policy:' "$HEADERS" 2>/dev/null | sed -E 's/^\s+Content-Security-Policy:\s*//')
[ "$hdr" = "$CSP" ] || bad C1 "$HEADERS: CSP header missing or differs:
  got:  $hdr
  want: $CSP"
# So every header reaches every page, the site pages and LICENSE included,
# _headers holds one block, for /*, and detaches no header (a `! Name` line).
blocks=$(grep -nE '^[^[:space:]#]' "$HEADERS" 2>/dev/null)
[ "$(cut -d: -f2- <<<"$blocks")" = "/*" ] || bad C1 "$HEADERS: must hold exactly one block, /*:
$blocks"
hits=$(grep -nE '^[[:space:]]*!' "$HEADERS" 2>/dev/null)
[ -n "$hits" ] && bad C1 "$HEADERS: a header detached from some paths:
$hits"
# PROMISES.md quotes the policy for readers; the quote must be this string.
if [ "$TARGET" = src ]; then
  grep -qxF "    $CSP" PROMISES.md 2>/dev/null || bad C1 "PROMISES.md does not quote the canonical CSP (an indented line of its own)"
fi
hdr=$(grep -iE '^\s+Strict-Transport-Security:' "$HEADERS" 2>/dev/null | sed -E 's/^\s+Strict-Transport-Security:\s*//I')
[ "$hdr" = "$HSTS" ] || bad C1 "$HEADERS: HSTS header missing, repeated or differs from the current stage:
  got:  $hdr
  want: $HSTS"

# ---- D1 (dist only): every reference resolves to a file inside dist/ -------
# The deploy root is dist/; a "../" out of it, or an import of a file that was
# not copied, would load nothing or something else.
if [ "$TARGET" = dist ]; then
  DIST_RULES=" D1"
  root=$(realpath dist)
  # The source downloads are no file in the build: they go up beside
  # source/index.html at deploy. Only this version's two may be linked.
  version=$(sed -nE "s/^export const VERSION = '([^']+)';$/\1/p" "$SRC/core/version.js")
  for f in "${HTML[@]}"; do
    while IFS= read -r ref; do
      # The mirror link (H1's named exception) is no file.
      [ "$f" = "$SOURCE_HTML" ] && [ "$ref" = "$MIRROR" ] && continue
      # /buy is no file: _redirects sends it to the checkout (H5).
      case "$ref" in data:*|''|/buy) continue ;; */) ref+=index.html ;; esac  # a folder is served as its index.html
      p=$(realpath -m "$(dirname "$f")/$ref")
      [ -n "$version" ] && case "$p" in "$root/source/ascham-$version.bundle"|"$root/source/ascham-$version.tar.gz") continue ;; esac
      [[ "$p" == "$root"/* && -f "$p" ]] || bad D1 "$f: $ref does not resolve inside dist/"
    done < <(grep -oE '\b(src|href)="[^"]*"' "$f" | sed -E 's/^[a-z]+="(.*)"$/\1/')
  done
  for f in "${JS[@]}"; do
    while IFS= read -r ref; do
      p=$(realpath -m "$(dirname "$f")/$ref")
      [[ "$p" == "$root"/* && -f "$p" ]] || bad D1 "$f: import $ref does not resolve inside dist/"
    done < <(grep -oE "^\s*(import|export)\b[^'\"]*from\s+['\"][^'\"]+['\"]" "$f" | sed -E "s/.*['\"]([^'\"]+)['\"]$/\1/")
  done
fi

# ---- R1 (a git checkout only): no private file inside the repository --------
# The private notes live outside the repository. Their names are listed only
# in .git/info/exclude, which is never published, so this script names none:
# any file that list matches, tracked or not, fails. Without that list (a
# copy, an export) there is nothing to check, and the PASS line omits R1.
if [ "$TARGET" = src ] && [ -f .git/info/exclude ]; then
  REPO_RULES=" R1"
  hits=$(git ls-files --cached --others --ignored --exclude-from=.git/info/exclude 2>&1) \
    || { echo "BROKEN: git ls-files: $hits"; exit 2; }
  [ -n "$hits" ] && bad R1 "a private file inside the repository:
$hits"
fi

# ---- R2 (the owner's checkout only): no retired term ------------------------
# Retired terms stand nowhere: any case, in any file or file name, no
# exemption. In src mode that is the whole tree but .git/, dist/ and
# node_modules/; in dist mode, dist/. The terms are read from a private list
# (scripts/lib/retired.sh), so this script names none. In the owner's
# checkout a missing list is broken; anywhere else there is nothing to check,
# and the PASS line omits R2.
. scripts/lib/retired.sh
retired_pattern . || { echo "BROKEN: R2: $RETIRED_ERR"; exit 2; }
if [ -n "$RETIRED" ]; then
  REPO_RULES="${REPO_RULES:-} R2"
  case "$TARGET" in src) TREE=. ;; dist) TREE=dist ;; esac
  hits=$(grep -rIniE --exclude-dir=.git --exclude-dir=node_modules $([ "$TREE" = . ] && echo --exclude-dir=dist) -- "$RETIRED" "$TREE"
    find "$TREE" \( -name .git -o -name node_modules $([ "$TREE" = . ] && echo -o -path ./dist) \) -prune -o -print \
      | grep -iE "$RETIRED" | sed 's/$/ (file name)/')
  [ -n "$hits" ] && bad R2 "a retired term:
$hits"
fi

# ---- R3 (the owner's checkout only): never pushed ---------------------------
# Only the public repository, made from the export, is ever pushed. This
# repository's history holds the private notes, so it has no remote, no
# branch pushes to an address, and its pre-push hook, scripts/hooks/pre-push,
# refuses every push. The hook is a second layer: `git push --no-verify` to
# an address skips it, and no check can stop that. The owner's checkout is
# the one whose .git/info/exclude lists the private notes, as for R2;
# `--git-path` follows core.hooksPath, so moving the hooks folder fails too.
if [ "$TARGET" = src ] && grep -qvE '^[[:space:]]*(#|$)' .git/info/exclude 2>/dev/null; then
  REPO_RULES="${REPO_RULES:-} R3"
  hits=$(git config --get-regexp '^remote\.|^branch\..*\.(remote|pushremote|merge)$')
  [ -n "$hits" ] && bad R3 "a remote or push target in this repository:
$hits"
  hook=$(git rev-parse --git-path hooks/pre-push)
  [ -x "$hook" ] && cmp -s "$hook" scripts/hooks/pre-push \
    || bad R3 "$hook is not scripts/hooks/pre-push, installed and executable (install -m 755 scripts/hooks/pre-push $hook)"
fi

if [ $fail -eq 0 ]; then
  echo "check $TARGET: PASS (${#JS[@]} JS, ${#HTML[@]} HTML, ${#CSS[@]} CSS files; rules N1 N2 N3 N4 X1 S1 U1 F1 B1 L1 H1 H2 H3 H4 H5 A1 C1${DIST_RULES:-}${REPO_RULES:-})"
  exit 0
fi
exit 1
