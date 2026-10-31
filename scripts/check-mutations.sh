#!/usr/bin/env bash
# Breaks each rule once, in a scratch copy, and confirms the gate that owns it
# notices: check.sh (per rule), build.sh (copy-only proof), test.sh (ledger),
# and the test suites that guard promises the static rules cannot see. The
# working tree is never touched.
#
#   bash scripts/check-mutations.sh       exit 0 if every mutation was caught
set -u
cd "$(dirname "$0")/.." || exit 2
ORIG=$PWD
missed=0

# The root documents the gates read: build.sh ships three, check.sh L1 and C1
# and the tests read the rest.
DOCS=(LICENSE NOTICE TRADEMARKS.md README.md CONTRIBUTING.md SECURITY.md PROMISES.md CHANGELOG.md)
scratch() {
  local d; d=$(mktemp -d "${TMPDIR:-/tmp}/ascham-mut-XXXXXX")
  cp -r "$ORIG/src" "$ORIG/public" "$ORIG/scripts" "$ORIG/tests" "${DOCS[@]/#/$ORIG/}" "$d/"
  echo "$d"
}
unchanged() {
  local d=$1 f
  for f in src public scripts tests "${DOCS[@]}"; do
    diff -rq "$ORIG/$f" "$d/$f" >/dev/null || return 1
  done
}

# mutate NAME WANT_EXIT PATTERN COMMAND [GATE]
# COMMAND runs inside the copy; then GATE (default: check.sh) runs there and
# must exit WANT_EXIT with PATTERN in its output ('-' for no pattern).
mutate() {
  local name=$1 want=$2 pat=$3 cmd=$4 gate=${5:-bash scripts/check.sh} d out code
  d=$(scratch)
  (cd "$d" && eval "$cmd") >/dev/null 2>&1
  # A mutation whose edit no longer applies would pass for the wrong reason.
  if [ "$cmd" != true ] && unchanged "$d"; then
    rm -rf "$d"
    echo "MISSED  $name  (the edit changed nothing)"
    missed=1
    return
  fi
  out=$(cd "$d" && eval "$gate" 2>&1); code=$?
  rm -rf "$d"
  if [ "$code" -eq "$want" ] && { [ "$pat" = - ] || grep -qE -- "$pat" <<<"$out"; }; then
    echo "caught  $name"
  else
    echo "MISSED  $name  (exit $code)"; echo "$out" | tail -20 | sed 's/^/        /'
    missed=1
  fi
}

APP=src/ui/main.js
# check.sh R1, R2 and R3 and pre-publish.sh P5 run only in the owner's
# checkout, which holds two private lists (scripts/lib/retired.sh) and the
# pre-push hook. OWNER makes a copy into one, with made-up lists, so no real
# retired term is spelt here. The made-up terms are spelt in pieces, or the
# copy of this file is a hit.
RNAME='quux''wort'
RTAG='QX''W1'
OWNER="git init -q && printf 'NOTES.md\nnotes/\n' > .git/info/exclude && printf 'name %s\ntag %s\n' $RNAME $RTAG > .git/info/retired && install -m 755 scripts/hooks/pre-push .git/hooks/pre-push"
PIPE=src/ui/pipeline.js
STORE=src/core/store.js
DOWN=src/ui/download.js
REVIEW=src/ui/review.js
PAGE=public/app/index.html
DIST='bash scripts/build.sh'
TESTS='bash scripts/test.sh'

# ---- check.sh, source tree ----
mutate 'control: the unmodified copy passes'      0 'PASS' 'true'
mutate 'N1 fetch() call'                          1 'FAIL N1:' "echo \"fetch('/x');\" >> $APP"
mutate 'N1 new WebSocket'                         1 'FAIL N1:' "echo \"new WebSocket('/x');\" >> $APP"
mutate 'N1 new WebSocketStream'                   1 'FAIL N1:' "echo \"new WebSocketStream('/x');\" >> $APP"
mutate 'N1 fetchLater() call'                     1 'FAIL N1:' "echo \"fetchLater('/x');\" >> $APP"
mutate 'N2 URL literal'                           1 'FAIL N2:' "echo \"const u = 'https://example.com/a';\" >> $APP"
mutate 'N3 location.href assignment'              1 'FAIL N3:' "echo \"location.href = '/elsewhere';\" >> $APP"
mutate "N3 creating an <a>"                       1 'FAIL N3:' "echo \"document.createElement('a');\" >> $APP"
mutate 'N3 a blob: URL outside download.js'       1 'FAIL N3:' "echo \"const u = URL.createObjectURL(new Blob(['x']));\" >> $APP"
mutate 'N3 an anchor click outside download.js'   1 'FAIL N3:' "echo \"els.read.click();\" >> $APP"
mutate 'N3 a blob: literal outside download.js'   1 'FAIL N3:' "echo \"const u = 'blob:' + x;\" >> $PIPE"
mutate 'N3 a synthetic click outside download.js' 1 'FAIL N3:' "echo \"x.dispatchEvent(new MouseEvent('click'));\" >> $REVIEW"
mutate 'N3 download.js: href not the blob URL'    1 'FAIL N3:' "sed -i 's#  a.href = url;#  a.href = name;#' $DOWN"
mutate 'N3 download.js: a second href'            1 'FAIL N3:' "sed -i 's#  a.href = url;#  a.href = url;\\n  a.href = text;#' $DOWN"
mutate 'N3 download.js: a navigation'             1 'FAIL N3:' "echo \"location.assign(url);\" >> $DOWN"
mutate 'N3 download.js: never revoked'            1 'FAIL N3:' "sed -i '/revokeObjectURL/d' $DOWN"
mutate 'N3 download.js: no download attribute'    1 'FAIL N3:' "sed -i '/a.download = /d' $DOWN"
mutate 'N3 download.js: blob from elsewhere'      1 'FAIL N3:' "sed -i 's#new Blob(\\[text\\], { type })#new Blob([document.body.textContent], { type })#' $DOWN"
mutate 'N3 a navigation after a block comment'    1 'FAIL N3:' "echo \"/* x */ location.href = u;\" >> $APP"
mutate 'N3 the Navigation API'                    1 'FAIL N3:' "echo \"navigation.navigate(u);\" >> $APP"
mutate 'N3 location aliased'                      1 'FAIL N3:' "echo \"const l = location; l.assign(u);\" >> $APP"
mutate 'N3 a global indexed by a computed name'   1 'FAIL N3:' "echo \"window['loc' + 'ation'].assign(u);\" >> $APP"
mutate 'N3 window.open aliased'                   1 'FAIL N3:' "echo \"const o = window.open; o(u);\" >> $APP"
mutate 'N3 Reflect'                               1 'FAIL N3:' "echo \"Reflect.get(x, k);\" >> $APP"
mutate 'N3 an address as an object key'           1 'FAIL N3:' "echo \"Object.assign(x, { href: u });\" >> $APP"
mutate 'N3 an anchor made by el()'                1 'FAIL N3:' "echo \"el('a', t);\" >> $REVIEW"
mutate 'N3 an anchor made by createElementNS'     1 'FAIL N3:' "echo \"document.createElementNS(ns, 'a');\" >> $APP"
mutate 'N3 an event dispatched'                   1 'FAIL N3:' "echo \"x.dispatchEvent(e);\" >> $APP"
mutate 'N3 a synthetic PointerEvent'              1 'FAIL N3:' "echo \"const e = new PointerEvent('click');\" >> $APP"
# check.sh N4: each way JS could send the text to our own host, or put it in
# the address, while every request stays on the origin.
mutate 'N4 a style background url()'              1 'FAIL N4:' "echo \"document.body.style.backgroundImage = 'url(/x?' + t + ')';\" >> $APP"
mutate 'N4 a FontFace'                            1 'FAIL N4:' "echo \"new FontFace('f', u).load();\" >> $APP"
mutate 'N4 a worklet module'                      1 'FAIL N4:' "echo \"CSS.paintWorklet.addModule('/w.js?' + t);\" >> $APP"
mutate 'N4 a rule inserted into a sheet'          1 'FAIL N4:' "echo \"sheet.insertRule(rule);\" >> $APP"
mutate 'N4 setProperty'                           1 'FAIL N4:' "echo \"decl.setProperty('--x', t);\" >> $APP"
mutate 'N4 a constructed sheet'                   1 'FAIL N4:' "echo \"const s = new CSSStyleSheet(); s.replaceSync(t);\" >> $APP"
mutate 'N4 cssText'                               1 'FAIL N4:' "echo \"decl.cssText = t;\" >> $APP"
mutate 'N4 typed OM'                              1 'FAIL N4:' "echo \"x.attributeStyleMap.set('color', t);\" >> $APP"
mutate 'N4 a <style> element'                     1 'FAIL N4:' "echo \"const s = document.createElement('style');\" >> $APP"
mutate 'N4 a notification icon'                   1 'FAIL N4:' "echo \"new Notification(t, { icon: u });\" >> $APP"
mutate 'N4 the address changed in place'          1 'FAIL N4:' "echo \"history.pushState(null, '', '?' + t);\" >> $APP"
mutate 'N4 URL( in capitals in a string'          1 'FAIL N4:' "echo \"const css = 'background: URL(/x?' + t + ')';\" >> $APP"
mutate 'X1 innerHTML sink'                        1 'FAIL X1:' "echo \"document.body.innerHTML = 'x';\" >> $APP"
mutate 'X1 a sink after a block comment'          1 'FAIL X1:' "echo \"/* x */ document.body.innerHTML = 'x';\" >> $APP"
mutate 'X1 a sink in a line comment'              1 'FAIL X1:' "echo \"// document.body.innerHTML = t;\" >> $APP"
mutate 'X1 insertAdjacentHTML'                    1 'FAIL X1:' "echo \"document.body.insertAdjacentHTML('beforeend', t);\" >> $APP"
mutate 'X1 eval'                                  1 'FAIL X1:' "echo \"eval(t);\" >> $APP"
mutate 'X1 new Function'                          1 'FAIL X1:' "echo \"new Function(t)();\" >> $APP"
mutate 'X1 a timer given a string variable'       1 'FAIL X1:' "echo \"const s = 'x'; setTimeout(s);\" >> $APP"
mutate 'X1 a handler attribute set from JS'       1 'FAIL X1:' "echo \"document.body.setAttribute('onclick', t);\" >> $APP"
mutate 'S1 sessionStorage in the pipeline'        1 'FAIL S1:' "echo \"sessionStorage.setItem('last', 'x');\" >> $PIPE"
mutate 'S1 storage after a block comment'         1 'FAIL S1:' "echo \"/* x */ sessionStorage.setItem('k', t);\" >> $PIPE"
mutate 'S1 localStorage outside store.js'         1 'FAIL S1:' "echo \"localStorage.setItem('ascham.settings', '{}');\" >> $APP"
mutate 'S1 document.cookie'                       1 'FAIL S1:' "echo \"document.cookie = 'a=b';\" >> $APP"
mutate 'S1 indexedDB inside store.js'             1 'FAIL S1:' "echo \"indexedDB.open('x');\" >> $STORE"
mutate 'S1 a third key in the allowlist'          1 'FAIL S1:' "sed -i \"s/new Set(\\[SETTINGS_KEY, LICENCE_KEY\\])/new Set([SETTINGS_KEY, LICENCE_KEY, 'ascham.passage'])/\" $STORE"
mutate 'S1 the allowlist grown at run time'       1 'FAIL S1:' "echo \"ALLOWED.add('ascham.passage');\" >> $STORE"
mutate 'S1 store.js missing'                      1 'FAIL S1:' "rm $STORE"
mutate 'U1 a sentence in main.js'                 1 'FAIL U1:' "echo \"const m = 'Saved your project.';\" >> $APP"
mutate 'U1 a sentence after a block comment'      1 'FAIL U1:' "echo \"/* x */ const m = 'Saved your project.';\" >> $APP"
mutate 'U1 a text sink after a block comment'     1 'FAIL U1:' "echo \"/* x */ els.read.textContent = 'Go';\" >> $APP"
mutate 'U1 a single word to a text sink'          1 'FAIL U1:' "echo \"els.read.textContent = 'Go';\" >> $APP"
mutate 'U1 a lowercase word to el()'              1 'FAIL U1:' "sed -i \"s#el('span', S.ACADEMIC, 'kind')#el('span', 'academic', 'kind')#\" $REVIEW"
mutate 'U1 a capitalised word'                    1 'FAIL U1:' "echo \"const label = 'Download';\" >> $APP"
mutate 'U1 a template literal sentence'           1 'FAIL U1:' "echo \"const t = \\\`\\\${n} words saved\\\`;\" >> $APP"
mutate 'U1 non-ASCII in a literal'                1 'FAIL U1:' "echo \"const d = '—';\" >> $APP"
mutate 'U1 an aria-label literal'                 1 'FAIL U1:' "echo \"box.setAttribute('aria-label', 'tick');\" >> $REVIEW"
mutate 'U1 text in index.html'                    1 'FAIL U1:' "sed -i 's#<h1 data-s=\"appName\"></h1>#<h1>Ascham</h1>#' $PAGE"
mutate 'U1 a title attribute in index.html'       1 'FAIL U1:' "sed -i 's#<button type=\"button\" id=\"print-list\"#<button title=\"Print\" type=\"button\" id=\"print-list\"#' $PAGE"
mutate 'U1 strings.js missing'                    1 'FAIL U1:' "rm src/ui/strings.js"
mutate 'F1 the whole sheet built in main.js'      1 'FAIL F1:' "echo \"const m = Sheet.build(input);\" >> $APP"
mutate 'F1 build imported by name'                1 'FAIL F1:' "echo \"import { build } from './worksheet.js';\" >> $REVIEW"
mutate 'F1 the CSV made around the gate'          1 'FAIL F1:' "echo \"const f = Files.csvFile(deck, 0, { paid: true });\" >> $APP"
mutate 'F1 the harvest read around the gate'      1 'FAIL F1:' "echo \"import { analyse } from './pipeline.js';\" >> $APP"
mutate 'F1 csv-core imported by page code'        1 'FAIL F1:' "echo \"import * as Csv from '../core/csv-core.js';\" >> $APP"
mutate 'B1 the name in a JS comment'              1 'FAIL B1:' "echo '// Ascham was here.' >> $APP"
mutate 'B1 a storage key spelt out'               1 'FAIL B1:' "sed -i 's#const SETTINGS_STORE = .*#const SETTINGS_STORE = \x27ascham.settings\x27;#' src/core/settings-core.js"
mutate 'B1 the <title> exemption is exact'        1 'FAIL B1:' "sed -i 's#<title>Ascham</title>#<title>Ascham tools</title>#' $PAGE"
mutate 'B1 the name elsewhere in the head'         1 'FAIL B1:' "sed -i 's#<title>Ascham</title>#&\\n  <meta name=\"author\" content=\"Ascham\">#' $PAGE"
mutate 'B1 the name in a CSS comment'             1 'FAIL B1:' "echo '/* ASCHAM */' >> public/app/print.css"
mutate 'B1 brand.js: the name in a comment'       1 'FAIL B1:.*brand.js' "sed -i '1i // Ascham' src/core/brand.js"
mutate 'B1 brand.js missing'                      1 'FAIL B1:' "rm src/core/brand.js"
mutate 'R2 control: runs, and the clean tree passes' 0 'C1 R1 R2 R3\)' 'true' "$OWNER && bash scripts/check.sh"
mutate 'R2 a retired name in a JS comment'       1 'FAIL R2:' 'true' "$OWNER && echo '// ${RNAME^} was here.' >> $APP && bash scripts/check.sh"
mutate 'R2 a retired name in README'            1 'FAIL R2:' 'true' "$OWNER && echo 'Once called ${RNAME^}.' >> README.md && bash scripts/check.sh"
mutate 'R2 a retired tag in a test'             1 'FAIL R2:' 'true' "$OWNER && echo '// $RTAG.x.y' >> tests/pro.test.js && bash scripts/check.sh"
mutate 'R2 a tag is a word: a longer word passes' 0 'R2 R3\)' 'true' "$OWNER && echo '// ${RTAG%1}z' >> $APP && bash scripts/check.sh"
mutate 'R2 brand.js: a retired name as the slug' 1 'FAIL R2:' 'true' "$OWNER && sed -i \"s#^const SLUG = .*#const SLUG = '$RNAME';#\" src/core/brand.js && bash scripts/check.sh"
mutate 'R2 a retired name as a file name'       1 'notes.txt \(file name\)' 'true' "$OWNER && touch tests/$RNAME-notes.txt && bash scripts/check.sh"
mutate 'R2 the list missing in the checkout'    2 'BROKEN: R2:.*missing' 'true' "$OWNER && rm .git/info/retired && bash scripts/check.sh"
mutate 'R2 a list with no term'                 2 'BROKEN: R2:.*no term' 'true' "$OWNER && echo '# none' > .git/info/retired && bash scripts/check.sh"
mutate 'R2 a line that is not a term'           2 'BROKEN: R2:.*not a term' 'true' "$OWNER && echo 'word $RNAME' >> .git/info/retired && bash scripts/check.sh"
mutate 'L1 open source in README'                 1 'FAIL L1:.*README' "echo 'Ascham is open source.' >> README.md"
mutate 'L1 open-source in CONTRIBUTING'           1 'FAIL L1:.*CONTRIBUTING' "echo 'An open-source project.' >> CONTRIBUTING.md"
mutate 'L1 Open Source in SECURITY'               1 'FAIL L1:.*SECURITY' "echo 'Open Source security.' >> SECURITY.md"
mutate 'L1 split across a line break'             1 'FAIL L1:.*README' "printf 'It is open\\nsource.\\n' >> README.md"
mutate 'L1 the sentence reworded'                 1 'FAIL L1:.*README' "sed -i 's#version 3: anyone#version 3 or later: anyone#' README.md"
mutate 'L1 in the page wording'                   1 'FAIL L1:.*strings.js' "sed -i \"s#  keyRemove: 'Remove key',#  osLine: 'Open source.',\\n&#\" src/ui/strings.js"
mutate 'L1 in LICENSE'                            1 'FAIL L1:.*LICENSE' "echo 'This is open source.' >> LICENSE"
mutate 'L1 in TRADEMARKS'                         1 'FAIL L1:.*TRADEMARKS' "echo 'An open source name.' >> TRADEMARKS.md"
mutate 'H1 CDN script tag'                        1 'FAIL H1:' "sed -i 's#</head>#<script type=\"module\" src=\"https://cdn.example.com/x.js\"></script></head>#' $PAGE"
mutate 'H1 remote font in CSS'                    1 'FAIL H1:' "echo '@import url(https://fonts.example.com/a.css);' >> public/app/style.css"
mutate 'H1 a <style> element in a page'           1 'FAIL H1:.*<style> element' "sed -i 's#</head>#<style>p { color: red; }</style></head>#' $PAGE"
mutate 'H1 image-set with a bare address'         1 'FAIL H1:.*in CSS' "echo '.x { background-image: image-set(\"https://img.example.com/a.png\" 1x); }' >> public/app/style.css"
mutate 'H1 an <object data=>'                     1 'FAIL H1:.*in HTML' "sed -i 's#</body>#<object data=\"https://cdn.example.com/a.svg\"></object></body>#' $PAGE"
mutate 'H1 a preload imagesrcset'                 1 'FAIL H1:.*in HTML' "sed -i 's#</head>#<link rel=\"preload\" as=\"image\" imagesrcset=\"https://img.example.com/a.png 1x\"></head>#' $PAGE"
mutate 'H1 a mirror link to another GitHub path'  1 'FAIL H1:.*in HTML' "sed -i 's#\"https://github.com/ascham/ascham-web\"#\"https://github.com/ascham/ascham-web/issues\"#' public/source/index.html"
mutate 'H1 the mirror link on another page'       1 'FAIL H1:.*in HTML' "sed -i 's#</main>#<p><a href=\"https://github.com/ascham/ascham-web\">x</a></p></main>#' public/licence/index.html"
mutate 'H1 the mirror address loaded, not linked' 1 'FAIL H1:.*other than as' "sed -i 's#</head>#<link rel=\"prefetch\" href=\"https://github.com/ascham/ascham-web\"></head>#' public/source/index.html"
mutate 'H2 inline script'                         1 'FAIL H2:' "sed -i 's#</body>#<script>console.log(1)</script></body>#' $PAGE"
mutate 'H2 an inline handler'                     1 'FAIL H2:' "sed -i 's#<body>#<body onload=\"x()\">#' $PAGE"
mutate 'H2 an inline style'                       1 'FAIL H2:' "sed -i 's#<body>#<body style=\"color: red\">#' $PAGE"
mutate 'H2 a script that is not a module'         1 'FAIL H2:.*not an external module' "sed -i 's#<script type=\"module\" #<script #' $PAGE"
mutate 'H3 spell check left on the textarea'      1 'FAIL H3:' "sed -i 's#<textarea id=\"paste\" rows=\"12\" autocomplete=\"off\" spellcheck=\"false\"#<textarea id=\"paste\" rows=\"12\" autocomplete=\"off\"#' $PAGE"
mutate 'H3 translation allowed'                   1 'FAIL H3:' "sed -i 's# translate=\"no\"##' $PAGE"
mutate 'H3 contentEditable in JS'                 1 'FAIL H3:' "echo \"document.body.contentEditable = 'true';\" >> $APP"
mutate 'H3 contentEditable after a block comment' 1 'FAIL H3:' "echo \"/* x */ document.body.contentEditable = 'true';\" >> $APP"
mutate 'H3 an input made in JS'                   1 'FAIL H3:' "echo \"document.createElement('input');\" >> $APP"
mutate 'H3 a textarea made by el()'               1 'FAIL H3:' "echo \"el('textarea');\" >> $REVIEW"
mutate 'H3 the tick box retyped as text'          1 'FAIL H3:' "sed -i \"s#box.type = 'checkbox';#box.type = 'text';#\" $REVIEW"
mutate 'H3 the tick box line copied'              1 'FAIL H3:' "echo \"const box = el('input');\" >> $REVIEW"
mutate 'H4 a link to /buy in the app'             1 'FAIL H4:' "sed -i 's#</main>#<a href=\"/buy\" data-s=\"upgrade\"></a></main>#' $PAGE"
mutate 'H4 an image-map area in the app'          1 'FAIL H4:' "sed -i 's#</main>#<AREA HREF=\"/buy\"></main>#' $PAGE"
mutate 'H4 a meta refresh in the app'             1 'FAIL H4:' "sed -i 's#</head>#<META content=\"0;url=/buy\" HTTP-EQUIV=Refresh></head>#' $PAGE"
mutate 'H4 a Refresh header'                      1 'FAIL H4:.*Refresh header' "echo '  Refresh: 0;url=/buy' >> public/_headers"
mutate 'H4 a Set-Cookie header'                   1 'FAIL H4:.*Set-Cookie header' "echo '  set-cookie: id=1; Path=/' >> public/_headers"
mutate 'H5 a buy file at the root'                1 'FAIL H5:' "echo x > public/buy"
mutate 'H5 a buy folder at the root'              1 'FAIL H5:' "mkdir public/buy && echo x > public/buy/index.html"
mutate 'H5 a buy.html at the root'                1 'FAIL H5:' "echo x > public/buy.html"
mutate 'A1 a password field in the app'           1 'FAIL A1:' "sed -i 's#</main>#<input type=\"password\" spellcheck=\"false\"></main>#' $PAGE"
mutate 'A1 an email field in the app'             1 'FAIL A1:' "sed -i 's#</main>#<INPUT TYPE=email spellcheck=\"false\"></main>#' $PAGE"
mutate 'A1 a username autocomplete hint'          1 'FAIL A1:' "sed -i '0,/autocomplete=\"off\"/s##autocomplete=\"username\"#' $PAGE"
mutate 'A1 a password field made in JS'           1 'FAIL A1:' "echo \"document.getElementById('key').type = 'password';\" >> $APP"
mutate 'A1 navigator.credentials'                 1 'FAIL A1:' "echo \"navigator.credentials.get({ password: true });\" >> $APP"
mutate 'A1 a PasswordCredential'                  1 'FAIL A1:' "echo \"if (window.PasswordCredential) document.title = '';\" >> $APP"
mutate 'C1 CSP meta loosened'                     1 'FAIL C1:' "sed -i \"s#connect-src 'none'#connect-src 'self'#\" $PAGE"
mutate 'C1 CSP meta removed'                      1 'FAIL C1:' "sed -i '/Content-Security-Policy/d' $PAGE"
mutate 'C1 a stylesheet before the CSP meta'      1 'FAIL C1:.*before its CSP' "sed -i 's#<meta charset=\"utf-8\">#&<link rel=\"stylesheet\" href=\"style.css\">#' $PAGE"
mutate 'C1 CSP header loosened'                   1 'FAIL C1:' "sed -i \"s#frame-ancestors 'none'#frame-ancestors *#\" public/_headers"
mutate 'C1 headers scoped to the app alone'       1 'FAIL C1:.*one block' "sed -i 's#^/\\*\$#/app/*#' public/_headers"
mutate 'C1 a second headers block'                1 'FAIL C1:.*one block' "printf '/licence/*\\n  X-Frame-Options: DENY\\n' >> public/_headers"
mutate 'C1 the CSP header detached'               1 'FAIL C1:.*detached' "echo '  ! Content-Security-Policy' >> public/_headers"
mutate 'C1 PROMISES quotes another CSP'           1 'FAIL C1:.*PROMISES' "sed -i \"s#^    default-src 'none'; script-src 'self'#    default-src 'none'; script-src *#\" PROMISES.md"
mutate 'C1 HSTS header removed'                   1 'FAIL C1:.*HSTS' "sed -i '/Strict-Transport-Security/d' public/_headers"
mutate 'C1 HSTS jumped to preload'                1 'FAIL C1:.*HSTS' "sed -i 's#Strict-Transport-Security: max-age=86400#Strict-Transport-Security: max-age=63072000; includeSubDomains; preload#' public/_headers"
mutate 'C1 HSTS header twice'                     1 'FAIL C1:.*HSTS' "sed -i 's#^  Strict-Transport-Security: .*#&\\n&#' public/_headers"
# pre-publish.sh P4: a file still carrying the old header is listed; the
# script itself is not. The header is split here as P4 splits it.
OLD_HEADER="// Ascham — © 2026. All rights reserved. Proprietary; see"" LICENSE. Inspection permitted, reuse is"" not."
P4="bash scripts/pre-publish.sh . --domain ascham.app | sed -n '/^NOT READY P4: headers/,/^NOT READY P5/p'"
mutate 'P4 control: no hit on itself'             0 - 'true' "! { $P4 | grep -q .; }"
mutate 'P4 the old header in shipped code'        0 - "echo '$OLD_HEADER' >> $APP" "$P4 | grep -q '^.*/src/ui/main.js:[0-9]*:// '"
P5="bash scripts/pre-publish.sh . --domain ascham.app | grep '^NOT READY P5'"
mutate 'P5 control: runs, and the clean tree has no hit' 0 - 'true' "$OWNER && ! $P5 && ! bash scripts/pre-publish.sh . --domain ascham.app | grep -q '^P5 not run'"
mutate 'P5 a retired tag in a fixture note'      0 - "echo 'See $RTAG.' >> tests/fixtures/paste/README.md" "$OWNER && $P5"
mutate 'P5 a retired name as a file name'        0 - "touch scripts/${RNAME^}.md" "$OWNER && $P5"
mutate 'P5 the list missing in the checkout'     0 - 'true' "$OWNER && rm .git/info/retired && bash scripts/pre-publish.sh . --domain ascham.app | grep -q '^BROKEN: P5:.*missing'"
mutate 'P5 a copy without the lists skips P5'    0 - 'true' "bash scripts/pre-publish.sh . --domain ascham.app | grep -q '^P5 not run'"
# pre-publish.sh P2: a personal address is listed; one at a reserved example
# domain is not.
P2="bash scripts/pre-publish.sh . --domain ascham.app | sed -n '/^NOT READY P2:/,/^NOT READY P[^2]/p'"
mutate 'P2 control: no address hit'               0 - 'true' "! { $P2 | grep -q .; }"
mutate 'P2 a personal address in a fixture'       0 - "echo 'jo''@mail.co.uk' >> tests/fixtures/paste/README.md" "$P2 | grep -q 'jo.mail[.]co'"
mutate 'P2 a reserved example address passes'     0 - "echo 'jo@example.org, jo@x.test' >> tests/fixtures/paste/README.md" "! { $P2 | grep -q .; }"
# pre-publish.sh P-AI. The terms are spelt in pieces, as in pre-publish.sh.
PAI="bash scripts/pre-publish.sh . --domain ascham.app | grep '^NOT READY P-AI'"
TOOL='Cla''ude'
mutate 'P-AI control: the clean tree has no hit'  0 - 'true' "! $PAI"
mutate 'P-AI the tool named in a comment'         0 - "echo '// Written with $TOOL Code.' >> $APP" "$PAI"
mutate 'P-AI a co-author trailer in README'       0 - "echo 'Co-Auth''ored-By: x' >> README.md" "$PAI"
mutate 'P-AI the short name in a test'            0 - "echo '// C''C wrote this' >> tests/pro.test.js" "$PAI"
mutate 'P-AI described as machine-written'        0 - "echo 'AI''-assisted docs.' >> SECURITY.md" "$PAI"
mutate 'P-AI the vendor as a file name'           0 - "touch scripts/anthro''pic.txt" "$PAI"
mutate 'P-AI the exemption is one line only'      0 - "echo '// ${TOOL,,}' >> src/core/wordlist.js" "$PAI"
# P5 and P-AI read names inside the tree, not the folder it sits in: an
# export into a folder whose path holds a banned term is not a hit.
ROOTED="$OWNER && d=\$(mktemp -d) && e=\$d/anthro''pic-$RNAME && mkdir \"\$e\" && cp -r . \"\$e\" && { bash scripts/pre-publish.sh \"\$e\" --domain ascham.app | grep -E '^NOT READY P(5|-AI)'; c=\$?; rm -rf \"\$d\"; [ \$c -ne 0 ]; }"
mutate 'P5 and P-AI control: the folder name is not a hit' 0 - 'true' "$ROOTED"
mutate 'P5 and P-AI: the root path read as a name'  1 - "sed -i 's#find \"\\\$dir\" -mindepth 1 #find \"\\\$dir\" #g' scripts/pre-publish.sh" "$ROOTED"
# pre-publish.sh, DIR a git repository: P2, P5 and P-AI read every ref's
# commits and annotated tags, their messages, names and addresses, and the ref
# names. HIST makes the copy one: a commit as the brand, tagged v1.4.0.
GIT='git -c user.name=Ascham -c user.email=dev@ascham.app'
HIST="git init -q && git add -A && $GIT commit -qm 'Release 1.4.0' && $GIT tag -a v1.4.0 -m 'Ascham 1.4.0'"
PAIH="bash scripts/pre-publish.sh . --domain ascham.app | sed -n '/^NOT READY P-AI:/,\$p'"
P5H="bash scripts/pre-publish.sh . --domain ascham.app | sed -n '/^NOT READY P5:/,/^NOT READY P[^5]/p'"
mutate 'history control: read, and no hit'        0 - 'true' "$HIST && ! { $P2 | grep -q .; } && ! $PAI && bash scripts/pre-publish.sh . --domain ascham.app | grep -q 'history: 1 commits, 1 tags)\$'"
mutate 'history P-AI a co-author trailer in a commit' 0 - 'true' "$HIST && $GIT commit -q --allow-empty -m x -m 'Co-Auth''ored-By: x' && $PAIH | grep -qE '^commit [0-9a-f]{12}: Co-Auth'"
mutate 'history P-AI the tool named in a tag message' 0 - 'true' "$HIST && $GIT tag -a v1.4.1 -m 'Made with $TOOL Code.' && $PAIH | grep -q '^tag v1.4.1: Made'"
mutate 'history P-AI a commit on another branch only' 0 - 'true' "$HIST && git checkout -q -b side && $GIT commit -q --allow-empty -m 'AI''-generated notes' && git checkout -q - && $PAIH | grep -qE '^commit [0-9a-f]{12}: AI'"
mutate 'history P5 a retired name in a commit'    0 - 'true' "$OWNER && $HIST && $GIT commit -q --allow-empty -m 'Once ${RNAME^}.' && $P5H | grep -qE '^commit [0-9a-f]{12}: Once'"
mutate 'history P5 a retired tag as a tag name'   0 - 'true' "$OWNER && $HIST && $GIT tag $RTAG && $P5H | grep -q '^ref: refs/tags/'"
mutate 'history P2 a personal author'             0 - 'true' "$HIST && git -c user.name=Jo -c user.email=jo''@mail.co.uk commit -q --allow-empty -m x && $P2 | grep -qE '^commit [0-9a-f]{12}: author Jo'"
mutate 'history P2 a personal tagger'             0 - 'true' "$HIST && git -c user.name=Jo -c user.email=jo''@mail.co.uk tag -a v1.4.1 -m x && $P2 | grep -q '^tag v1.4.1: tagger Jo'"
mutate 'history P2 a personal address in a message, not an example one' 0 - 'true' "$HIST && $GIT commit -q --allow-empty -m 'From jo''@mail.co.uk and jo@example.org' && $P2 | grep -qE '^commit [0-9a-f]{12}: jo.mail[.]co' && ! { $P2 | grep -q 'example'; }"
mutate 'history not read: a plain copy says none' 0 - 'true' "bash scripts/pre-publish.sh . --domain ascham.app | grep -q 'history: none (not a git repository))\$'"
# export-public.sh: an allowlist. A new file outside it, at the root or in a
# new folder, committed, never reaches the export.
EXPORT='git init -q && git add -A && git -c user.name=t -c user.email=t@ascham.app commit -qm a && echo x > NOTES.md && mkdir notes && echo x > notes/a.md && git add -A && git -c user.name=t -c user.email=t@ascham.app commit -qm b && o=$(mktemp -d) && { bash scripts/export-public.sh "$o/x" >/dev/null 2>&1; test -f "$o/x/src/ui/main.js" && test ! -e "$o/x/NOTES.md" && test ! -e "$o/x/notes"; c=$?; rm -rf "$o"; exit $c; }'
mutate 'export control: an unlisted file stays out' 0 - 'true' "$EXPORT"
mutate 'export: the allowlist dropped'            1 - "sed -i 's#HEAD -- \"\${present\[@\]}\"#HEAD#' scripts/export-public.sh" "$EXPORT"
# release-public.sh: the public repository's commit holds the export's tree,
# made in a scratch copy and only then brought into REPO; the two files come
# from its tag; nothing is pushed. rel_init makes the copy a committed
# development repository, with the four documents the export also carries,
# and $r the folder for REPO (pub), FILES (files) and a bare origin.
rel_init() {
  cp "$ORIG/KNOWN-ISSUES.md" "$ORIG/DEPENDENCIES.md" "$ORIG/VERIFY.md" "$ORIG/MANUAL-CHECKS.md" . \
    && git init -q && git add -A && $GIT commit -qm a && r=$(mktemp -d) && trap 'rm -rf "$r"' EXIT
}
rel() { bash scripts/release-public.sh "$r/pub" "$r/files"; }
bump() { sed -i "s/^export const VERSION = '.*';\$/export const VERSION = '$1';/" src/core/version.js && $GIT commit -qam "$1"; }
# refuses PATTERN: the release exits 2 saying PATTERN.
refuses() { local o; o=$(rel 2>&1); [ $? -eq 2 ] && grep -q -- "$1" <<<"$o" || { echo "$o" | tail -5; return 1; }; }
# REPO absent or empty and FILES absent, as before the release.
untouched() { [ -z "$(ls -A "$r/pub" 2>/dev/null)" ] && [ ! -e "$r/files" ] || { echo 'REPO or FILES touched'; return 9; }; }
rel_refused() { rel; local c=$?; untouched || return 9; return $c; }
# rel_is VERSION N: REPO holds N releases, chained, the last VERSION's tree
# the export's, every author, committer and tagger the brand; and its bundle
# and tar.gz give the same files.
rel_is() {
  local p=$r/pub e=$r/e$1 t=$r/t$1
  bash scripts/export-public.sh "$e" >/dev/null || return 1
  [ "$(git -C "$p" rev-list --count main)" = "$2" ] && [ "$(git -C "$p" tag | grep -c .)" = "$2" ] \
    && [ "$(git -C "$p" rev-parse main)" = "$(git -C "$p" rev-parse "v$1^{commit}")" ] \
    && [ "$(git -C "$p" log -1 --format=%s main)" = "Ascham $1" ] || { echo "control: v$1 not the release's commit"; return 1; }
  [ -z "$(git -C "$p" for-each-ref --format='%(objecttype)' refs/tags | grep -vx tag)" ] || { echo 'control: a tag not annotated'; return 1; }
  [ -z "$(git -C "$p" log --format='%an <%ae> %cn <%ce>' | grep -vx 'Ascham <dev@ascham.app> Ascham <dev@ascham.app>')" ] \
    && [ -z "$(git -C "$p" for-each-ref --format='%(taggername) %(taggeremail)' refs/tags | grep -vx 'Ascham <dev@ascham.app>')" ] \
    || { echo 'control: an identity not the brand'; return 1; }
  diff -r -x .git "$e" "$p" && [ -z "$(git -C "$p" status --porcelain --ignored)" ] || { echo "control: REPO not the export"; return 1; }
  git clone -q "$r/files/ascham-$1.bundle" "$r/c$1" 2>/dev/null && git -C "$r/c$1" checkout -q "v$1" \
    && diff -r -x .git "$e" "$r/c$1" || { echo 'control: the bundle not the export'; return 1; }
  mkdir "$t" && tar -xzf "$r/files/ascham-$1.tar.gz" -C "$t" && diff -r "$e" "$t/ascham-$1" || { echo 'control: the tar.gz not the export'; return 1; }
}
# The control: a first release into no REPO, then a second chained to it,
# with an origin that must stay empty.
rel_control() {
  rel_init && rel >/dev/null && rel_is 1.4.0 1 || return 1
  git init -q --bare "$r/origin.git" && git -C "$r/pub" remote add origin "$r/origin.git" \
    && bump 1.4.1 && rel >/dev/null && rel_is 1.4.1 2 || return 1
  [ "$(git -C "$r/pub" rev-parse 'v1.4.1^{commit}^')" = "$(git -C "$r/pub" rev-parse 'v1.4.0^{commit}')" ] || { echo 'control: not chained'; return 1; }
  [ -z "$(git -C "$r/origin.git" for-each-ref)" ] || { echo 'control: pushed to origin'; return 1; }
  echo 'release control: two releases, chained, as the export, nothing pushed'
}
# A first release into a clone of an empty origin: into that clone, its
# origin and main's upstream kept, the origin left empty.
rel_clone() { git init -q --bare -b main "$r/origin.git" && git clone -q "$r/origin.git" "$r/pub" 2>/dev/null; }
rel_into_clone() {
  rel_init && rel_clone && rel >/dev/null && rel_is 1.4.0 1 || return 1
  [ "$(git -C "$r/pub" remote get-url origin)" = "$r/origin.git" ] \
    && [ "$(git -C "$r/pub" config branch.main.remote)" = origin ] || { echo 'control: the clone not kept'; return 1; }
  [ -z "$(git -C "$r/origin.git" for-each-ref)" ] || { echo 'control: pushed to origin'; return 1; }
  echo 'release control: into a clone of an empty origin, kept, nothing pushed'
}
# After a first release into a clone and its push, a second release: origin
# as pushed, and the bundle main and the tags only.
rel_pushed() {
  rel_init && rel_clone && rel >/dev/null && git -C "$r/pub" push -q origin main v1.4.0 2>/dev/null \
    && git -C "$r/pub" remote set-head origin main >/dev/null && bump 1.4.1
}
rel_after_push() {
  rel_pushed && rel >/dev/null && rel_is 1.4.1 2 || return 1
  [ "$(git -C "$r/origin.git" for-each-ref --format='%(refname) %(objectname)')" = "refs/heads/main $(git -C "$r/pub" rev-parse 'v1.4.0^{commit}')
refs/tags/v1.4.0 $(git -C "$r/pub" rev-parse v1.4.0)" ] || { echo 'control: pushed to origin'; return 1; }
  [ "$(git bundle list-heads "$r/files/ascham-1.4.1.bundle" | cut -d' ' -f2)" = "refs/heads/main
refs/tags/v1.4.0
refs/tags/v1.4.1" ] || { echo 'control: the bundle holds another ref'; return 1; }
  echo 'release control: a second release after a push, origin as pushed'
}
# Beside origin's main and HEAD, any other ref is refused: another remote's,
# another of origin's, a tag not a release's, a stash, notes, and origin/main
# where no release is.
rel_remote_guards() {
  rel_pushed || return 9
  local p=$r/pub m c; m=$(git -C "$p" rev-parse main)
  git -C "$p" update-ref refs/remotes/upstream/main "$m" && refuses 'not main, an annotated' || { echo 'guard: another remote released'; return 1; }
  git -C "$p" update-ref -d refs/remotes/upstream/main && git -C "$p" update-ref refs/remotes/origin/wip "$m" \
    && refuses 'not main, an annotated' || { echo 'guard: a foreign ref under origin released'; return 1; }
  git -C "$p" update-ref -d refs/remotes/origin/wip && $GIT -C "$p" tag -a x -m x main \
    && refuses 'not main, an annotated' || { echo 'guard: a tag not a release released'; return 1; }
  git -C "$p" tag -d x >/dev/null && git -C "$p" update-ref refs/stash "$m" \
    && refuses 'not main, an annotated' || { echo 'guard: a stash released'; return 1; }
  git -C "$p" update-ref -d refs/stash && git -C "$p" update-ref refs/notes/commits "$m" \
    && refuses 'not main, an annotated' || { echo 'guard: notes released'; return 1; }
  git -C "$p" update-ref -d refs/notes/commits && c=$($GIT -C "$p" commit-tree "main^{tree}" -p main -m x) \
    && git -C "$p" update-ref refs/remotes/origin/main "$c" && refuses 'origin/main is not one of its releases' \
    || { echo 'guard: origin/main past its releases'; return 1; }
  echo 'remote guards: each refused'
}
# rel_undone: the release fails once REPO may hold it, and the undo it prints
# puts REPO and FILES back exactly as they were.
state() {
  if [ -e "$r/pub/.git" ]; then
    git -C "$r/pub" for-each-ref; git -C "$r/pub" rev-parse HEAD; git -C "$r/pub" status --porcelain --ignored
    git -C "$r/pub" config --get-regexp '^(remote|branch)\.'
  elif [ -d "$r/pub" ]; then echo "folder: $(ls -A "$r/pub")"; else echo absent; fi
  ls "$r/files" 2>/dev/null
}
rel_undone() {
  local before o; before=$(state); o=$(rel 2>&1)
  [ $? -eq 2 ] && grep -q 'Undo before anything else: ' <<<"$o" || { echo "$o" | tail -5; return 1; }
  echo "$o" | grep 'Undo before anything else: ' | tail -1
  eval "$(echo "$o" | sed -n 's/.*Undo before anything else: //p' | tail -1)" \
    && [ "$(state)" = "$before" ] || { echo 'undo: REPO not as it was'; return 1; }
}
rel_guards() {
  rel_init || return 9
  echo x >> README.md && refuses 'uncommitted changes' && untouched || { echo 'guard: a dirty tree released'; return 1; }
  git checkout -q README.md && rel >/dev/null && bump 1.4.1 || return 9
  git -C "$r/pub" branch wip && refuses 'not main, an annotated' || { echo 'guard: an extra ref released'; return 1; }
  git -C "$r/pub" branch -qD wip && $GIT -C "$r/pub" commit -q --allow-empty -m x && $GIT -C "$r/pub" tag -a v1.3.9 -m x \
    && refuses 'not its latest release' || { echo 'guard: main past its latest release'; return 1; }
  echo 'guards: each refused'
}
RS=scripts/release-public.sh
mutate 'release control: two releases, chained'    0 'release control' 'true' 'rel_control'
mutate 'release control: into an empty clone'      0 'into a clone of an empty origin' 'true' 'rel_into_clone'
mutate 'release control: a second, after a push'   0 'origin as pushed' 'true' 'rel_after_push'
mutate 'release: the tree from REPO, not the export' 2 "not the export's \(" 'sed -i "s#^tree=\$(cd \"\$exp\" \&\&#tree=\$(cd \"\$repo\" \&\&#" '$RS 'rel_init && mkdir "$r/pub" && rel_refused'
mutate 'release: the tree from the development tree' 2 "not the export's \(" 'sed -i "s#^tree=\$(cd \"\$exp\" \&\&#tree=\$(cd \"\$HERE\" \&\&#" '$RS 'rel_init && echo x > NOTES.md && git add NOTES.md && $GIT commit -qm n && rel_refused'
mutate 'release: that, and the tree hash unchecked' 2 "checkout is not the export's files" 'sed -i "s#^tree=\$(cd \"\$exp\" \&\&#tree=\$(cd \"\$HERE\" \&\&#; /^\[ \"\$tree\" = \"\$want\" \]/d" '$RS 'rel_init && echo x > NOTES.md && git add NOTES.md && $GIT commit -qm n && rel_refused'
mutate 'release: the export not ready, ignored'    1 'NOT READY P2' 'sed -i "s#^\[ \$code -eq 0 \] || { echo \"release: stopped, the export#true || { echo \"release: stopped, the export#" '$RS 'rel_init && echo "Write to jo""@mail.co.uk." >> README.md && $GIT commit -qam p && rel_refused'
mutate 'release: the identity not fixed'           1 'author, committer or tagger not at' 'sed -i "s# \"\${ID\[@\]}\"##g" '$RS 'rel_init && printf "[user]\n\tname = Jo\n\temail = jo""@mail.co.uk\n" > "$r/gc" && GIT_CONFIG_GLOBAL=$r/gc rel_refused'
mutate 'release: a push'                           1 'pushed to origin' 'sed -i "s#^echo \"push, not run:#git -C \"\$repo\" push -q --atomic origin main \"\$tag\"; &#" '$RS 'rel_control'
mutate 'release: not chained, refused and undone'  0 'not a fast-forward' 'sed -i "s# \"\${parent\[@\]}\"##" '$RS 'rel_init && rel >/dev/null && bump 1.4.1 && rel_undone'
mutate 'release: a first release failing, undone'  0 'fetching it failed.*rm -rf' 'sed -i "s#\"refs/tags/\$tag:refs/tags/\$tag\"#\"refs/tags/nope:refs/tags/\$tag\"#" '$RS 'rel_init && rel_undone && mkdir "$r/pub" && rel_undone'
mutate 'release: into an empty clone failing, undone' 0 'fetching it failed.*update-ref -d' 'sed -i "s#\"refs/tags/\$tag:refs/tags/\$tag\"#\"refs/tags/nope:refs/tags/\$tag\"#" '$RS 'rel_init && rel_clone && rel_undone'
mutate 'release: the tar.gz from the folder'       2 'the tar.gz is not' 'sed -i "s#git -C \"\$repo\" archive .*#(cd \"\$repo\" \&\& tar -czf \"\$tgz\" --transform \"s|^[.]|ascham-\$VERSION|\" .) || broken archive#" '$RS 'rel_init && rel'
mutate 'release: a lightweight tag'                2 'not annotated' 'sed -i "s#tag -a \"\$tag\" -m \"\$msg\"#tag \"\$tag\"#" '$RS 'rel_init && rel_refused'
mutate 'release: the bundle of every ref'          1 'the bundle holds another ref' 'sed -i "s#bundle create -q \"\$bundle\" refs/heads/main --tags#bundle create -q \"\$bundle\" --all#" '$RS 'rel_after_push'
mutate 'release guards control: each refused'      0 'guards: each refused' 'true' 'rel_guards'
mutate 'release guard: a dirty tree released'      1 'guard: a dirty tree' 'sed -i "/uncommitted changes\"\$/d" '$RS 'rel_guards'
mutate 'release guard: an extra ref in REPO'       1 'guard: an extra ref' 'sed -i "s#\[ -z \"\$other\" \] ||#true ||#" '$RS 'rel_guards'
mutate 'release guard: main past its latest release' 1 'guard: main past' 'sed -i "s#|| broken \(.*main is not its latest\)#|| true \1#" '$RS 'rel_guards'
mutate 'release remote guards control: each refused' 0 'remote guards: each refused' 'true' 'rel_remote_guards'
mutate 'release guard: any remote allowed'         1 'guard: another remote' 'sed -i "s#|refs/remotes/origin/main commit |#|refs/remotes/[^ ]*/main commit |#" '$RS 'rel_remote_guards'
mutate 'release guard: all of origin allowed'      1 'guard: a foreign ref under origin' 'sed -i "s#|refs/remotes/origin/main commit |#|refs/remotes/origin/[^ ]* commit |#" '$RS 'rel_remote_guards'
mutate 'release guard: any tag allowed'            1 'guard: a tag not a release' 'sed -i "s#|refs/tags/v\[0-9\]+\\\\.\[0-9\]+\\\\.\[0-9\]+ tag |#|refs/tags/[^ ]* tag |#" '$RS 'rel_remote_guards'
mutate 'release guard: origin/main not checked'    1 'guard: origin/main past' 'sed -i "/^    \[ -z \"\$pushed\" \] ||/,+1d" '$RS 'rel_remote_guards'
# check.sh R1: in a git checkout, a file the exclude list matches fails, at
# the root, in a folder, or force-added. The list here is made up.
R1=$OWNER
mutate 'R1 control: runs, and the clean tree passes' 0 'H4 H5 A1 C1 R1 R2 R3\)' 'true' "$R1 && bash scripts/check.sh"
mutate 'R1 a private note at the root'            1 '^NOTES[.]md$' 'true' "$R1 && echo x > NOTES.md && bash scripts/check.sh"
mutate 'R1 a private folder'                      1 '^notes/a[.]md$' 'true' "$R1 && mkdir notes && echo x > notes/a.md && bash scripts/check.sh"
mutate 'R1 a private note force-added'            1 '^NOTES[.]md$' 'true' "$R1 && echo x > NOTES.md && git add -f NOTES.md && bash scripts/check.sh"
mutate 'R1, R2 and R3: a copy without the lists skips all three' 0 'H4 H5 A1 C1\)' 'true' 'bash scripts/check.sh'
# check.sh R3: the owner's checkout has no remote and nothing set to push to
# an address, and its pre-push hook is scripts/hooks/pre-push, installed and
# executable where git looks for it. The addresses are made up.
mutate 'R3 a remote added'                        1 '^remote[.]origin[.]url ' 'true' "$OWNER && git remote add origin https://example.com/x.git && bash scripts/check.sh"
mutate 'R3 a branch pushing to an address'        1 '^branch[.]main[.]pushremote ' 'true' "$OWNER && git config branch.main.pushRemote https://example.com/x.git && bash scripts/check.sh"
mutate 'R3 the hook missing'                      1 'FAIL R3: .*pre-push' 'true' "$OWNER && rm .git/hooks/pre-push && bash scripts/check.sh"
mutate 'R3 the hook changed'                      1 'FAIL R3: .*pre-push' 'true' "$OWNER && echo 'exit 0' >> .git/hooks/pre-push && bash scripts/check.sh"
mutate 'R3 the hook not executable'               1 'FAIL R3: .*pre-push' 'true' "$OWNER && chmod -x .git/hooks/pre-push && bash scripts/check.sh"
mutate 'R3 the hooks folder moved by core.hooksPath' 1 'FAIL R3: elsewhere/pre-push' 'true' "$OWNER && git config core.hooksPath elsewhere && bash scripts/check.sh"
mutate 'R3 the hook refuses a real push'          0 'pre-push: refused' 'true' "$OWNER && git add -A && $GIT commit -qm a && b=\$(mktemp -d) && git init -q --bare \"\$b\" && { git push \"\$b\" HEAD:refs/heads/x; c=\$?; git -C \"\$b\" rev-parse -q --verify refs/heads/x; v=\$?; rm -rf \"\$b\"; [ \$c -ne 0 ] && [ \$v -ne 0 ]; }"
mutate 'nothing to sweep'                       2 'BROKEN' "rm -f src/*/*.js public/*.js"

# ---- build.sh and check.sh dist ----
mutate 'build control: builds and passes'         0 'check dist: PASS' 'true' "$DIST"
mutate 'build: a copied file transformed'         1 'differs from' "sed -i 's|^# The proof:|echo // >> dist/src/ui/pipeline.js\\n&|' scripts/build.sh" "$DIST"
mutate 'build: a stray file in dist'              1 'source files' "sed -i 's|^# The proof:|echo x > dist/extra.txt\\n&|' scripts/build.sh" "$DIST"
mutate 'D1 a reference out of dist'               1 'FAIL D1:' "sed -i 's#href=\"style.css\"#href=\"../style.css\"#' $PAGE" "$DIST"
mutate 'D1 an import of a missing file'           1 'FAIL D1:' "sed -i \"s#from './review.js'#from './gone.js'#\" $APP" "$DIST"
mutate 'D1 a source download of another version' 1 'FAIL D1:' "sed -i 's#href=\"ascham-1.4.0.bundle\"#href=\"ascham-1.3.9.bundle\"#' public/source/index.html" "$DIST"
mutate 'D1 a source download outside source/'     1 'FAIL D1:' "sed -i 's#href=\"ascham-1.4.0.tar.gz\"#href=\"../ascham-1.4.0.tar.gz\"#' public/source/index.html" "$DIST"
mutate 'D1 the mirror link on another page'       1 'FAIL D1:' "sed -i 's#</main>#<p><a href=\"https://github.com/ascham/ascham-web\">x</a></p></main>#' public/licence/index.html" "$DIST"
mutate 'H5 caught in dist too'                    1 'FAIL H5:' "echo x > public/buy.html" "$DIST"
mutate 'B1 caught in dist too'                    1 'FAIL B1:' "echo '// ascham' >> $PIPE" "$DIST"
mutate 'R2 a retired tag caught in dist'         1 'FAIL R2:' "echo '// $RTAG' >> $PIPE" "$OWNER && $DIST"
mutate 'L1 caught in dist too'                    1 'FAIL L1:.*dist/NOTICE' "echo 'open source' >> NOTICE" "$DIST"
mutate 'S1 caught in dist too'                    1 'FAIL S1:' "echo \"sessionStorage.setItem('x', 'y');\" >> $PIPE" "$DIST"

# ---- test.sh: the ledger, and promises only a run can see ----
mutate 'tests control: suite passes at the ledger' 0 'test: PASS' 'true' "$TESTS"
mutate 'ledger: EXPECTED moved'                   1 'tests/EXPECTED says' "echo \$((\$(cat tests/EXPECTED) + 1)) > tests/EXPECTED" "$TESTS"
mutate 'ledger: a suite deleted'                  1 'tests/EXPECTED says' "rm tests/review.test.js" "$TESTS"
mutate 'marker: the pipeline writes the passage'  1 'never puts the passage' "sed -i 's#^  const chosen = Settings.harvestOptions#  try { store.setItem(Settings.STORE, JSON.stringify({ last: raw })); } catch (e) {}\\n&#' $PIPE" "$TESTS"
mutate 'marker: a third key accepted at run time' 1 'two keys|any other key' "sed -i 's#new Set(\\[SETTINGS_KEY, LICENCE_KEY\\])#new Set([SETTINGS_KEY, LICENCE_KEY, \"ascham.passage\"])#' $STORE" "$TESTS"
mutate 'mapping: off by one'                      1 'mapping holds|selection maps' "sed -i 's#  const to = map\\[e\\];#  const to = map[e] + 1;#' src/core/paste.js" "$TESTS"
mutate 'alone: a heading-only word carded'        1 'only on a line of its own is not carded' "sed -i 's#      rejected.alone++;#      rejected.alone++; if (0)#' src/core/vocab-core.js" "$TESTS"
mutate 'alone: a heading wins the fallback'       1 'never wins the fallback' "sed -i 's#    if (standsAlone(sentence, text)) continue;##' src/core/vocab-core.js" "$TESTS"
mutate 'yours: a term matched by spelling only'   1 'catches every form first' "sed -i 's#(yours.has(g.lemma.toLowerCase())#(false#' src/core/vocab-core.js" "$TESTS"
mutate 'yours: terms skipped with the filter off' 1 'still does with the filter off' "sed -i 's#} else if (yours.size \&\& (#} else if (!unfiltered \&\& yours.size \&\& (#' src/core/vocab-core.js" "$TESTS"
mutate 'licence: a key missing its tag accepted'  1 'without the part before the first full stop' "sed -i 's#^  const parts = text.split(.\\..);#&\\n  if (parts.length === 2 \&\& parts[0] !== TAG) parts.unshift(TAG);#' src/core/licence-core.js" "$TESTS"
mutate 'set-aside: a heading reworded'            1 'word for word' "sed -i \"s#heading: 'already common'#heading: 'already known'#\" src/ui/strings.js" "$TESTS"
mutate 'strings: a data-s key with no string'     1 'has a string' "sed -i 's#data-s=\"printList\"#data-s=\"printIt\"#' $PAGE" "$TESTS"
mutate 'strings: <title> not the app name'        1 'app name' "sed -i 's#<title>Ascham</title>#<title>Word</title>#' $PAGE" "$TESTS"
mutate 'strings: the footer licence line missing' 1 'footer' "sed -i '/data-s=\"licenceLine\"/d' $PAGE" "$TESTS"
mutate 'strings: appName not from brand.js'       1 'app name' "sed -i 's#  appName: NAME,#  appName: \x27Word\x27,#' src/ui/strings.js" "$TESTS"
mutate 'project: an extra key accepted'           1 'extra or missing keys' "sed -i 's#  if (!sameKeys(p, p.version === 1 ? KEYS_V1 : KEYS)) return { ok: false, code: .bad-shape. };##' src/ui/project.js" "$TESTS"
mutate 'project: version 1 no longer opens'       1 'version 1 file still opens' "sed -i 's#p.version !== 1 \&\& p.version !== FORMAT_VERSION#p.version !== FORMAT_VERSION#' src/ui/project.js" "$TESTS"
mutate 'project: version 3 taken for damaged'     1 'newer format' "sed -i 's#p.version > FORMAT_VERSION) return { ok: false, code: .newer. }#p.version > FORMAT_VERSION) return { ok: false, code: \x27bad-shape\x27 }#' src/ui/project.js" "$TESTS"
mutate 'project: a seventh question accepted'     1 'wrong types' "sed -i 's#p.questions\[s\].length <= MAX_QUESTIONS \&\&##' src/ui/project.js" "$TESTS"
mutate 'project: offsets past the text accepted'  1 'outside the text' "sed -i 's# || to > p.text.length##' src/ui/project.js" "$TESTS"
mutate 'project: a card saved in the file'        1 'exactly the format' "sed -i 's#    unticked: \\[...unticked\\]#    unticked: [...unticked],\\n    cards: []#' src/ui/project.js" "$TESTS"
mutate 'csv: unticked cards exported'             1 'only ticked cards' "sed -i 's#if (keep\\[i\\] !== true) return;#if (false) return;#' src/ui/files.js" "$TESTS"
mutate 'csv: the BOM dropped'                     1 'with the BOM' "sed -i 's# : {})\$# : { bom: false })#' src/ui/files.js" "$TESTS"
mutate 'csv: the formula guard removed'           1 'formula guard survives into the file' "sed -i 's#DANGEROUS_LEAD.test(s) ?#false ?#' src/core/csv-core.js" "$TESTS"
mutate 'hyphen: a line-end hyphen removed'        1 'hyphen' "sed -i 's#    if (breaks === 1 \\&\\& !keep \\&\\& WORD_HYPHEN#    if (breaks === 1 \\&\\& !keep \\&\\& (out = out.slice(0, -1), true) \\&\\& WORD_HYPHEN#' src/core/paste.js" "$TESTS"
mutate 'join: a heading glued to its sentence'    1 'heading-like line|not carded' "sed -i 's#(keep || headingBreak(#(keep || false \\&\\& headingBreak(#' src/core/paste.js" "$TESTS"
mutate 'join: no length guard on a heading'       1 'joins whole' "sed -i 's#line.length <= HEADING_SHARE \\* median#true#' src/core/paste.js" "$TESTS"
mutate 'join: a line ending in "of" kept apart'   1 'joins whole' "sed -i 's#CARRIES_SENTENCE = new Set((#CARRIES_SENTENCE = new Set([] || (#' src/core/paste.js" "$TESTS"
mutate 'marker: the CSV carries the passage'      1 'project file is the only place' "sed -i 's# : {})\$# : {}) + (arguments[0].text || \\x27\\x27)#' src/ui/files.js" "$TESTS"
mutate 'marker: saving writes a store'            1 'project file is the only' "sed -i 's#^function projectFile(.*#\\0\\n  try { globalThis.localStorage.setItem(\\x27ascham.settings\\x27, arguments[0].text); } catch (e) {}#' src/ui/files.js" "$TESTS"
mutate 'version: CHANGELOG ahead of VERSION'      1 'CHANGELOG.md starts with this version' "sed -i 's|^## 1.4.0 — |## 1.5.0 — |' CHANGELOG.md" "$TESTS"
mutate 'version: a second version literal'        1 'version literal' "echo \"export const V2 = '1.4.0';\" >> $APP" "$TESTS"

# ---- the worksheet: test.sh, and the browser for what only paper shows ----
SHEET=src/ui/worksheet.js
BROWSER='bash scripts/build.sh >/dev/null && node --experimental-websocket scripts/browser-test.mjs chrome evidence'
mutate 'sheet: an answer left un-blanked'         1 'no leaks' "sed -i 's#      if (!ranges.some((m) => overlaps(m, occ))) {#      if (false) {#' $SHEET" "$TESTS"
mutate 'sheet: a shared sentence asked twice'     1 'one item per sentence' "sed -i 's#    const key = card.sentence.start;#    const key = rank;#' $SHEET" "$TESTS"
mutate 'sheet: cut left to right'                 1 'cutMany|verbatim' "perl -0pi -e 's/  let head = String\(text\);.*?  parts\.unshift\(head\);\n/  let tail = String(text);\n  for (const r of sorted) {\n    const cut = cutAt(tail, r);\n    if (!cut) return null;\n    parts.push(cut[0], { ...r, answer: cut[1] });\n    tail = cut[2];\n  }\n  parts.push(tail);\n/s' $SHEET" "$TESTS"
mutate 'sheet: an unticked word in the bank'      1 'subset' "sed -i 's#filter((i) => keep\[i\] === true);#filter(() => true);#' $SHEET" "$TESTS"
mutate 'sheet: the gap cap ignored'               1 'the caps|four gaps' "sed -i 's#if (kept.length === MAX_GAPS) leave#if (false) leave#; s#if (!crowded \\&\\& all.length > MAX_GAPS)#if (false)#' $SHEET" "$TESTS"
mutate 'sheet: the item cap ignored'              1 'the caps|fifteen' "sed -i 's#.slice(0, MAX_ITEMS);#;#' $SHEET" "$TESTS"
mutate 'sheet: the bank not sorted'               1 'alphabetical' "sed -i 's#.sort(alphabetical),#,#' $SHEET" "$TESTS"
mutate 'sheet: the item order not by the text'    1 'text order' "sed -i 's#.sort((a, b) => a.sentence.start - b.sentence.start);#.sort((a, b) => b.sentence.start - a.sentence.start);#' $SHEET" "$TESTS"
mutate 'sheet: a fragment kept as an item'        1 'real sentences|news fixture' "sed -i 's#rangeOf(cards\\[i\\]) \\&\\& realSentence(cards\\[i\\], lines)#rangeOf(cards[i])#' $SHEET" "$TESTS"
mutate 'sheet: the pasted line not checked'       1 'pasted line|news fixture' "sed -i 's#ENDS.test(line.trimEnd()) \\&\\& ##' $SHEET" "$TESTS"
mutate 'sheet: short sentences kept'              1 'six words' "sed -i 's#wordCount(text) >= MIN_WORDS#wordCount(text) >= 0#' $SHEET" "$TESTS"
mutate 'sheet: two gaps side by side'             1 'side by side' "sed -i 's#const sideBySide = (text, a, b) => #const sideBySide = (text, a, b) => false \\&\\& #' $SHEET" "$TESTS"
mutate 'sheet: side by side, the later kept'      1 'earlier is kept' "sed -i 's#for (const m of \\[...clear\\].sort((a, b) => a.at - b.at))#for (const m of [...clear].sort((a, b) => b.at - a.at))#' $SHEET" "$TESTS"
mutate 'sheet: a repeat beside a gap kept'        1 'side by side' "sed -i 's#if (!sideBySide(g.sentence.text, all\\[i - 1\\], all\\[i\\])) continue;#continue;#' $SHEET" "$TESTS"
mutate 'sheet: repeated answers not flagged'      1 'repeated answers' "sed -i 's#e.count > 1#e.count > 2#' $SHEET" "$TESTS"
mutate 'sheet: the bank not merged across case'   1 'the bank' "sed -i 's#    const lower = g.answer.toLowerCase();#    const lower = g.answer;#' $SHEET" "$TESTS"
mutate 'sheet: the bank keeps a capital'          1 'lower case unless' "sed -i 's#if (capitalised(e.form) \\&\\& !capitalised(g.answer)) e.form = g.answer;##' $SHEET" "$TESTS"
mutate 'sheet: several gaps share a bare number'  1 'seven targets become four gaps' "sed -i 's#gap.label = gaps.length === 1 ? String(number) :#gap.label = true ? String(number) :#' $SHEET" "$TESTS"
# The static rules (N4, X1) stop the build first; this runs the browser on the
# dist/ build.sh assembled anyway, so the runtime check is shown to stand alone.
BROWSER_PAST_CHECK='bash scripts/build.sh >/dev/null 2>&1; node --experimental-websocket scripts/browser-test.mjs chrome evidence'
mutate 'browser: a request to our own host carries the text' 1 'FAIL.*no request carries the passage' "echo \"document.getElementById('read').addEventListener('click', () => { document.body.style.backgroundImage = 'url(/leak?' + escape(document.getElementById('paste').value) + ')'; });\" >> $APP" "$BROWSER_PAST_CHECK"
mutate 'browser: a request carries the licence key' 1 'FAIL.*no request carries the licence key' "echo \"document.getElementById('key-save').addEventListener('click', () => { document.body.style.backgroundImage = 'url(/k?' + escape(document.getElementById('key').value) + ')'; });\" >> $APP" "$BROWSER_PAST_CHECK"
mutate 'browser: checking a key fetches a module' 1 'FAIL.*no request while four keys are checked' "echo \"document.getElementById('key-save').addEventListener('click', () => { import('./files.js?checked'); });\" >> $APP" "$BROWSER_PAST_CHECK"
mutate 'browser: a sentence rendered as markup'  1 'FAIL.*no element came from the paste' "sed -i 's#  if (text !== undefined) e.textContent = text;#  if (text !== undefined) e.innerHTML = text;#' $REVIEW" "$BROWSER_PAST_CHECK"
mutate 'browser: the title rendered as markup'   1 'FAIL.*the title is shown as text' "sed -i 's#  node.textContent = text || .*;#  node.innerHTML = text || \"\";#' $APP" "$BROWSER_PAST_CHECK"
mutate 'browser: the key left in its field'      1 'FAIL.*key field is empty once the key is saved' "sed -i \"s#  if (said.ok === true) els.key.value = '';##\" $APP" "$BROWSER"
mutate 'browser: leaving with unsaved work never asks' 1 'FAIL.*leaving with unsaved text asks first' "sed -i 's#  if (unsaved()) e.preventDefault();#  if (false) e.preventDefault();#' $APP" "$BROWSER"
mutate 'browser: leaving always asks'             1 'FAIL.*an empty page does not ask before it is left' "sed -i 's#  if (unsaved()) e.preventDefault();#  e.preventDefault();#' $APP" "$BROWSER"
mutate 'browser: "Start again" never asks'        1 'FAIL.*"Start again" over unsaved work asks first' "sed -i 's#  if (!unsaved()) return clearPage();#  return clearPage();#' $APP" "$BROWSER"
mutate 'browser: "Start again" leaves the text'   1 'FAIL.*"Clear the page" empties the page' "sed -i 's#\\[els.paste, els.title, els.sourceField#[els.title, els.sourceField#' $APP" "$BROWSER"
mutate 'sheet: the repeats line not printed (browser)' 1 'FAIL.*used more than once' "sed -i '/S.SHEET.repeats/d' $REVIEW" "$BROWSER"
# A leftover server or browser on a test port: the run stops rather than test
# its site or drive it.
held() { echo 'node -e "require(\"net\").createServer().listen('"$1"', \"127.0.0.1\")" & h=$!; '"$2"'; c=$?; kill $h; exit $c'; }
FIREFOX_RUN=${BROWSER/ chrome / firefox }
mutate 'browser: the test port already taken'     2 'BROKEN: the test server' 'true' "$(held 8761 "$BROWSER")"
mutate 'browser: the Chrome port already taken'   2 'BROKEN: port 9361 is taken' 'true' "$(held 9361 "$BROWSER")"
mutate 'browser: the Firefox port already taken'  2 'BROKEN: port 2861 is taken' 'true' "$(held 2861 "$FIREFOX_RUN")"
# With the port check gone, a real leftover browser answers: still refused.
OLD_CHROME='p=$(mktemp -d -t ascham-leftover-XXXXXX); "${CHROME_BIN:-/usr/bin/google-chrome}" --headless=new --remote-debugging-port=9361 --user-data-dir=$p about:blank >/dev/null 2>&1 & h=$!; for i in $(seq 100); do curl -s -o /dev/null http://127.0.0.1:9361/json/version && break; sleep 0.1; done; '"$BROWSER"'; c=$?; kill $h; sleep 1; rm -rf $p; exit $c'
OLD_FIREFOX='p=$(mktemp -d -t ascham-leftover-XXXXXX); echo "user_pref(\"marionette.port\", 2861);" > $p/user.js; "${FIREFOX_BIN:-/usr/bin/firefox-esr}" --headless --marionette --no-remote --profile $p >/dev/null 2>&1 & h=$!; for i in $(seq 100); do [ -s $p/MarionetteActivePort ] && break; sleep 0.2; done; '"$FIREFOX_RUN"'; c=$?; kill $h; sleep 1; rm -rf $p; exit $c'
mutate 'browser: a leftover Chrome driven'        2 'BROKEN: the browser on port 9361 is not the one just started' "sed -i '/portFree(port)/d' scripts/lib/cdp.mjs" "$OLD_CHROME"
mutate 'browser: a leftover Firefox driven'       2 'BROKEN: firefox .* did not start Marionette on port 2861' "sed -i '/portFree(port)/d' scripts/lib/marionette.mjs" "$OLD_FIREFOX"
# A run that fails or is stopped leaves nothing: run in a TMPDIR of its own,
# which must hold no ascham- folder but evidence after, with no test port held.
alone() { echo 't=$(mktemp -d); export TMPDIR=$t; '"$1"'; c=$?; left=$(ls -A $t | grep "^ascham-" | grep -v "^ascham-evidence-" | tr "\n" " "); ss -ltn | grep -qE ":(8761|9361|2861)\b" && left="$left a port"; rm -rf $t; [ -z "$left" ] || { echo "LEFT: $left"; exit 1; }; exit $c'; }
stopped() { echo 'bash scripts/build.sh >/dev/null && { node --experimental-websocket scripts/browser-test.mjs '"$1"' evidence & n=$!; for i in $(seq 300); do '"$2"' && break; sleep 0.1; done; sleep 3; kill -TERM $n; wait $n; }'; }
mutate 'browser: Chrome setup fails after launch' 2 'BROKEN: the browser did not start: Browser.noSuchMethod' "sed -i 's#Browser.setDownloadBehavior#Browser.noSuchMethod#' scripts/lib/drivers.mjs" "$(alone "$BROWSER")"
mutate 'browser: Firefox setup fails after launch' 2 'BROKEN: firefox on port 2861: WebDriver:NoSuchCommand' "sed -i 's#WebDriver:NewSession#WebDriver:NoSuchCommand#' scripts/lib/marionette.mjs" "$(alone "$FIREFOX_RUN")"
mutate 'browser: a Chrome run stopped mid-way'    2 'BROKEN: stopped by SIGTERM' 'true' "$(alone "$(stopped chrome 'curl -s -o /dev/null http://127.0.0.1:9361/json/version')")"
mutate 'browser: a Firefox run stopped mid-way'   2 'BROKEN: stopped by SIGTERM' 'true' "$(alone "$(stopped firefox '[ -s $TMPDIR/ascham-firefox-*/MarionetteActivePort ]')")"
# Default evidence folders: the newest five kept, this run's among them.
ROTATE='t=$(mktemp -d); for i in 1 2 3 4 5 6 7; do mkdir $t/ascham-evidence-old$i; touch -d "$((8 - i)) days ago" $t/ascham-evidence-old$i; done; TMPDIR=$t node scripts/browser-test.mjs no-such-browser >/dev/null; kept=$(ls $t | grep -c "^ascham-evidence-"); gone=$(ls $t | grep -cE "^ascham-evidence-old[123]$"); rm -rf $t; echo "evidence: $kept kept, $gone of the three oldest"; [ "$kept" = 5 ] && [ "$gone" = 0 ]'
mutate 'browser: evidence kept to the newest five' 0 'evidence: 5 kept, 0 of the three oldest' 'true' "$ROTATE"
# ---- verify-live.sh, against the built site on the local dev server ----
LIVE='bash scripts/build.sh >/dev/null && p=$((20000 + RANDOM % 20000)) && { node scripts/serve.mjs $p --dist >/dev/null 2>&1 & s=$!; for i in $(seq 50); do curl -s -o /dev/null http://127.0.0.1:$p/ && break; sleep 0.1; done; bash scripts/verify-live.sh http://127.0.0.1:$p; c=$?; kill $s; exit $c; }'
mutate 'verify-live control: the local site matches' 0 'verify-live: PASS' 'true' "$LIVE"
mutate 'verify-live: one served byte changed'     1 'DIFF /src/ui/main.js: bytes differ' "sed -i 's|^echo \"build: dist/ assembled|printf x >> dist/src/ui/main.js\\n&|' scripts/build.sh" "$LIVE"
mutate 'verify-live: a header value changed'      1 'got:  strict-transport-security: max-age=1$' "sed -i 's#^    ...HEADERS,#    ...HEADERS, \"Strict-Transport-Security\": \"max-age=1\",#' scripts/serve.mjs" "$LIVE"
# ---- Pro: each gate, removed in turn (tests/pro.test.js calls each action) ----
PRO=src/ui/pro.js
mutate 'pro: the licence always says yes'         1 'the licence says no' "sed -i 's#  return (await verdict(env)).ok === true;#  return true;#' $PRO" "$TESTS"
mutate 'pro: reading the text unlocks the filter' 1 'ignores the filter level' "sed -i 's#analyse({ ...input, paid: await paid(env) })#analyse({ ...input, paid: true })#' $PRO" "$TESTS"
mutate 'pro: the CSV unlocked without a key'      1 'free Basic deck' "sed -i 's#  const yes = await paid(env);#  const yes = true;#' $PRO" "$TESTS"
mutate 'pro: printing the worksheet ungated'      1 'refuses and never prints' "sed -i '/^async function printSheet/{n;d}' $PRO" "$TESTS"
mutate 'pro: the whole sheet shown without a key' 1 'the sheet on screen is the sample' "sed -i 's#  const sample = Sheet.build({ ...input, questions: undefined, options: { fullText: false, answerKey: false }, limit: SAMPLE_ITEMS });#  const sample = Sheet.build(input);#' $PRO" "$TESTS"
mutate 'pro: saving settings ungated'             1 'saving settings refuses' "sed -i '/^async function saveSettings/{n;d}' $PRO" "$TESTS"
mutate 'pro: a refused key is kept'               1 'never kept' "sed -i 's#  if (said.ok !== true) return said;##' $PRO" "$TESTS"
mutate 'pro: the held key written into the CSV'   1 'neither file carries any part of it' "sed -i 's#^async function csvFile(#async function csvFileReal(#' $PRO && echo 'async function csvFile(d, e, w) { const f = await csvFileReal(d, e, w); return { ...f, text: f.text + Licence.held(store) }; }' >> $PRO" "$TESTS"
mutate 'files: Pro deck options without a key'    1 'free Basic deck' "sed -i 's#  const paid = pro.paid === true;#  const paid = true;#' src/ui/files.js" "$TESTS"
mutate 'settings-core: stored settings read free' 1 'ignores the filter level' "sed -i 's#  if (paid !== true) {#  if (false) {#' src/core/settings-core.js" "$TESTS"
mutate 'licence: the shipped public key replaced'  1 'pinned here' "sed -i 's#^const ISSUER = .BF3M#const ISSUER = \x27BA3M#' src/core/licence-core.js" "$TESTS"
mutate 'pro: Print worksheet enabled free (browser)' 1 'FAIL.*every Pro control is disabled' "sed -i 's#  els.printSheet.setAttribute(.aria-disabled., String(!proShown));#  els.printSheet.setAttribute(\x27aria-disabled\x27, \x27false\x27);#' $APP" "$BROWSER"
mutate 'pro: the whole sheet shown without a key (browser)' 1 'FAIL.*free: the sheet is the sample' "sed -i 's#  const sample = Sheet.build({ ...input, questions: undefined, options: { fullText: false, answerKey: false }, limit: SAMPLE_ITEMS });#  const sample = Sheet.build(input);#' $PRO" "$BROWSER"
mutate 'pro: Print worksheet out of the Tab order (browser)' 1 'FAIL.*Print worksheet is reached by Tab' "sed -i 's#  els.printSheet.setAttribute(.aria-disabled., String(!proShown));#  els.printSheet.disabled = !proShown;#' $APP" "$BROWSER"
mutate 'strings: a slug unsafe as a tag'          1 'safe as a file name' "sed -i \"s#^const SLUG = .*#const SLUG = 'Ascham web';#\" src/core/brand.js" "$TESTS"
mutate 'licence: any tag of four capitals and 1 accepted' 1 'a key under any other tag is refused' "sed -i 's#parts\\[0\\] !== TAG#!/^[A-Z]{4}1\$/.test(parts[0])#' src/core/licence-core.js" "$TESTS"
mutate "licence: the old key tag accepted (owner's checkout)" 1 'tag used before the rename is refused' "sed -i 's#parts\\[0\\] !== TAG#parts[0] !== TAG \\&\\& parts[0] !== \\x27$RTAG\\x27#' src/core/licence-core.js" "$OWNER && $TESTS"
mutate 'pages: a sentence not in PROMISES'        1 'quoted in PROMISES.md' "sed -i 's#Our site sets no cookies.#Our site sets almost no cookies.#' public/privacy/index.html" "$TESTS"
mutate 'pages: a script on a page'                 1 'carries a script' "sed -i 's#</head>#<script type=\"module\" src=\"x.js\"></script></head>#' public/privacy/index.html" "$TESTS"
mutate 'strings: the footer line missing'         1 'independent, in the same words' "sed -i '/data-s=\"independent\"/d' $PAGE" "$TESTS"
mutate 'strings: README not independent'         1 'independent, in the same words' "sed -i 's#^Ascham is independent#Ascham is#' README.md" "$TESTS"
mutate 'strings: free Basic style says bold'      1 'never says the word is bold' "sed -i 's#const basicWhy = (paid) => (paid === true#const basicWhy = (paid) => (true#' src/ui/strings.js" "$TESTS"
mutate 'sheet: the key on the same page (browser)' 1 'FAIL.*answer key starts a page' "sed -i 's#.sheet .key { break-before: page;#.sheet .key {#' public/app/print.css" "$BROWSER"
mutate 'sheet: a heading-like line left loose (browser)' 1 'FAIL.*heading-like line of the text is kept' "sed -i 's#      if (pairs.has(i)) text.append#      if (false) text.append#' $REVIEW" "$BROWSER"
mutate 'sheet: a section heading left loose (browser)' 1 'FAIL.*each section heading is kept' "sed -i 's#bank.append(together(el(.h2., S.SHEET.wordBank), words));#bank.append(el(\x27h2\x27, S.SHEET.wordBank), words);#' $REVIEW" "$BROWSER"
mutate 'deck: the tally counts every card (browser)' 1 'FAIL.*updates the tally' "sed -i 's#S.tally(n, deck.cards.length)#S.tally(deck.cards.length, deck.cards.length)#' $APP" "$BROWSER"
mutate 'sheet: an empty section printed (browser)' 1 'FAIL.*not the empty sections' "sed -i 's#    if (!list.length) continue;##' $REVIEW" "$BROWSER"

exit $missed
