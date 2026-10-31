#!/usr/bin/env bash
# The checks a tree must pass before it is ever published.
# Not a gate: it fails on this repository by design until the licence is
# active and the name final.
#
#   bash scripts/pre-publish.sh DIR --domain DOMAIN
#
#   DIR       the tree to publish (an export, not this working copy)
#   DOMAIN    the brand's mail domain; every address in the tree, and every
#             author, committer and tagger if DIR is a git repository, must
#             be at it
#
# Exit 0 ready, 1 not ready (each reason listed), 2 broken.
set -u
cd "$(dirname "$0")/.." || exit 2
HERE=$PWD

dir='' domain=''
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain=${2:-}; shift 2 ;;
    *) dir=$1; shift ;;
  esac
done
[ -n "$dir" ] && [ -d "$dir" ] && [ -n "$domain" ] \
  || { echo "usage: pre-publish.sh DIR --domain DOMAIN"; exit 2; }
dir=$(cd "$dir" && pwd)

fail=0
bad() { echo "NOT READY $1: $2"; fail=1; }
tree() { grep -rIn --exclude-dir=.git "$@" "$dir"; }

# ---- The history, when DIR is a git repository ------------------------------
# Publishing a repository publishes its history: every commit and annotated
# tag reachable from any ref, their messages, names and addresses, and the
# ref names. P2, P5 and P-AI read all of it, raw, one line each, as
# `commit <id>: <line>`, `tag <name>: <line>` and `ref: <name>`. Object ids
# (tree, parent and object lines) and signature blocks are left out: hex and
# base64 are no one's words. Notes' contents and unreachable objects are not
# read; a push of the release's refs sends neither.
meta='' history='none (not a git repository)'
if [ -e "$dir/.git" ]; then
  commits=$(git -C "$dir" rev-list --all 2>&1) \
    || { echo "BROKEN: reading DIR's commits: $commits"; exit 2; }
  refs=$(git -C "$dir" for-each-ref --format='%(objectname) %(objecttype) %(refname)' 2>&1) \
    || { echo "BROKEN: reading DIR's refs: $refs"; exit 2; }
  meta=$(for c in $commits; do
      git -C "$dir" cat-file commit "$c" | sed '/^gpgsig[^ ]* /,/^ -----END/d' | sed "s#^#commit ${c:0:12}: #"
    done
    while read -r o t r; do
      [ -n "$r" ] || continue
      echo "ref: $r"
      [ "$t" = tag ] && git -C "$dir" cat-file tag "$o" \
        | sed '/^-----BEGIN [A-Z ]*SIGNATURE-----$/,/^-----END [A-Z ]*SIGNATURE-----$/d' | sed "s#^#tag ${r#refs/tags/}: #"
    done <<<"$refs")
  meta=$(grep -vE '^(commit|tag) [^:]+: (tree|parent|object) [0-9a-f]{40,64}$' <<<"$meta")
  history="$(grep -c . <<<"$commits") commits, $(grep -c '^[0-9a-f]* tag ' <<<"$refs") tags"
fi
ident='^(commit|tag) [^:]+: (author|committer|tagger) '

# ---- P1: no real-issuer key, and none of the issuer's private files ---------
out=$(node "$HERE/scripts/lib/real-keys.mjs" "$dir"); code=$?
[ $code -eq 2 ] && { echo "BROKEN: real-keys.mjs: $out"; exit 2; }
[ -n "$out" ] && bad P1 "issuer material in the tree:
$out"

# ---- P2: no personal email: every address is at the brand's domain ---------
# In files and in the history's messages, an address at a domain reserved for
# examples (RFC 2606: example.com, .net, .org and the .example, .test and
# .invalid names) is no one's and passes; authors, committers and taggers
# must be at the brand's domain.
d=$(sed 's/\./\\./g' <<<"$domain")
addr='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
reserved='@(example\.(com|net|org)|([A-Za-z0-9-]+\.)+(example|test|invalid))$'
hits=$(tree -oE "$addr" | grep -viE "@$d\$" | grep -viE "$reserved"
  grep -vE "$ident" <<<"$meta" | grep -E "$addr" | while IFS= read -r l; do
    grep -oE "$addr" <<<"$l" | grep -viE "@$d\$" | grep -viE "$reserved" | sed "s#^#${l%%: *}: #"
  done)
[ -n "$hits" ] && bad P2 "address not at $domain:
$hits"
hits=$(grep -E "$ident" <<<"$meta" | grep -vE "<[^>]*@$d> [0-9]+ [-+][0-9]{4}\$")
[ -n "$hits" ] && bad P2 "author, committer or tagger not at $domain:
$hits"

# ---- P3: no third-party fixtures --------------------------------------------
# Every paste fixture is listed in index.json with rights "public-domain" or
# "original".
fx=$dir/tests/fixtures/paste
if [ -d "$fx" ]; then
  out=$(node -e '
    const fs = require("fs"), path = require("path"), d = process.argv[1];
    let index = [];
    try { index = JSON.parse(fs.readFileSync(path.join(d, "index.json"), "utf8")); } catch (e) { console.log("index.json: unreadable"); }
    const ok = new Map(index.map((e) => [e.file, e.rights]));
    for (const f of fs.readdirSync(d)) {
      if (f === "index.json" || f === "README.md") continue;
      const r = ok.get(f);
      if (r !== "public-domain" && r !== "original") console.log(`${f}: rights ${r === undefined ? "not listed" : JSON.stringify(r)}`);
    }' "$fx")
  [ -n "$out" ] && bad P3 "fixtures not public-domain or original (tests/fixtures/paste/index.json):
$out"
fi

# ---- P4: the licence is active ---------------------------------------------
# The AGPL's title lines, as the FSF text sets them (centred with spaces).
title=$(head -2 "$dir/LICENSE" 2>/dev/null | sed 's/^ *//')
if [ "$title" != $'GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007' ]; then
  bad P4 "LICENSE is not the GNU AGPL v3"
fi
[ -e "$dir/LICENSE.FCL-DRAFT" ] && bad P4 "LICENSE.FCL-DRAFT is still in the tree"
hits=$(tree -E '(^|[^$])\{[A-Z][A-Z_]{2,}\}')
[ -n "$hits" ] && bad P4 "placeholders left:
$hits"
# The old header's phrases, split so this line is not itself a hit.
old='Proprietary; see'' LICENSE|reuse is'' not'
hits=$(tree -iE "$old")
[ -n "$hits" ] && bad P4 "headers that still state the proprietary licence:
$hits"

# ---- P5: the name is final ---------------------------------------------------
# No retired term, in any case, in any file or file name, or in the history,
# with no exemption:
# the same terms as check.sh R2, read from the private list in the checkout
# this script runs from (scripts/lib/retired.sh), never from DIR. Run from
# the owner's checkout, a missing list is broken; run from anywhere else,
# there is nothing to check, and the READY line omits P5.
. "$HERE/scripts/lib/retired.sh"
retired_pattern "$HERE" || { echo "BROKEN: P5: $RETIRED_ERR"; exit 2; }
RULE_P5=''
if [ -n "$RETIRED" ]; then
  RULE_P5=' P5'
  hits=$(tree -iE -- "$RETIRED"
    find "$dir" -mindepth 1 -path "$dir/.git" -prune -o -print | sed "s#^$dir/##" | grep -iE "$RETIRED"
    grep -iE -- "$RETIRED" <<<"$meta")
  [ -n "$hits" ] && bad P5 "a retired term is still in the tree:
$(head -40 <<<"$hits")
  ($(grep -c . <<<"$hits") in all)"
else
  echo "P5 not run: no retired-term list here (not the owner's checkout)"
fi

# ---- P-AI: no trace of AI tooling ---------------------------------------
# No file names an AI tool or vendor, uses the initials of a large language
# model as a word, carries a co-author trailer, or uses one of two phrasings:
# "AI", a hyphen or space, then "assisted", "generated" or "written"; or
# "written", "generated", "drafted" or "assisted", then "by" or "with", then
# "AI", "language model", "chatbot" or those initials, with or without "a" or
# "an". Any case, in any file or file name, or in the history (no exemption
# there); other phrasings are not matched.
# The terms are split so this file is not itself a hit. The tool's two-letter
# short name is a whole word in capitals only, and not before " BY" or "0"
# (licences); a lower-case "Cc" is Firefox's Components.classes in the
# browser drivers.
#
# NAMED EXEMPTIONS, each one exact line, listed in the report every time
# they apply:
#   src/core/wordlist.js, the given-names line holding "clau""de" (a first
#   name the proper-noun filter keeps off cards; behaviour, not tooling).
AI='cla''ude|anthro''pic|co-?auth''ored|\bai[- ](assisted|generated|written)|(written|generated|drafted|assisted) (by|with) (an? )?(ai|l''lm|langu''age model|chat''bot)\b|\bll''m\b|chat''gpt|open''ai|copi''lot'
AI_EXEMPT=(
  'src/core/wordlist.js:clara clarence cla''ude claudia clifford clive colin connor conor cormac craig'
)
hits=$( { tree -iE -- "$AI"; tree -E -- '\bC''C\b' | grep -vE '\bC''C (BY|0)\b|\bC''C0\b'
  find "$dir" -mindepth 1 -path "$dir/.git" -prune -o -print | sed "s#^$dir/##" | grep -iE "$AI" | sed 's/$/ (file name)/'
  grep -iE -- "$AI" <<<"$meta"; grep -E -- '\bC''C\b' <<<"$meta" | grep -vE '\bC''C (BY|0)\b|\bC''C0\b'; } \
  | sed "s#^$dir/##")
exempt=''
for e in "${AI_EXEMPT[@]}"; do
  f=${e%%:*} l=${e#*:}
  m=$(grep -E "^$f:[0-9]+:$l\$" <<<"$hits")
  [ -n "$m" ] && exempt+="$m"$'\n'
  hits=$(grep -vE "^$f:[0-9]+:$l\$" <<<"$hits")
done
[ -n "$exempt" ] && echo "P-AI exempt (named in pre-publish.sh):
${exempt%$'\n'}"
[ -n "$hits" ] && bad P-AI "AI tooling named or described:
$hits"

if [ $fail -eq 0 ]; then
  echo "pre-publish: READY ($dir; rules P1 P2 P3 P4${RULE_P5} P-AI; history: $history)"
  exit 0
fi
exit 1
