#!/usr/bin/env bash
# Assembles the deployable site in dist/. A COPY, never a transform: public/
# goes to the root, src/ to dist/src/, LICENSE, NOTICE and TRADEMARKS.md to
# the root (SCOWL's notice must travel with every copy of wordlist.js, and
# LICENSE points to TRADEMARKS.md), and the only edit is one "../" dropped
# before "src/" in HTML src/href attributes, since public/ is the root in
# dist/ (public/app/'s "../../src/" becomes "../src/"). The script
# then proves that: every file is byte-identical to its source, HTML after
# applying that one rewrite to the source. Then dist/SHA256SUMS, then
# check.sh against dist/.
#
#   bash scripts/build.sh         exit 0 built and checked
set -eu
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/src
cp -R public/. dist/
cp -R src/. dist/src/
cp LICENSE NOTICE TRADEMARKS.md dist/

rewrite() { sed -E 's#\b(src|href)="\.\./((\.\./)*src/)#\1="\2#g' "$1"; }
while IFS= read -r -d '' f; do
  rewrite "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done < <(find dist -path dist/src -prune -o -name '*.html' -print0)

# The proof: dist holds exactly the source files, unchanged but for the rewrite.
mismatch=0
while IFS= read -r -d '' f; do
  rel=${f#dist/}
  case "$rel" in
    src/*|LICENSE|NOTICE|TRADEMARKS.md) srcf=$rel ;;
    *)     srcf=public/$rel ;;
  esac
  if [ ! -f "$srcf" ]; then echo "build: $f has no source"; mismatch=1; continue; fi
  if [[ "$rel" == *.html && "$rel" != src/* ]]; then
    cmp -s <(rewrite "$srcf") "$f" || { echo "build: $f is not $srcf with the path rewrite"; mismatch=1; }
  else
    cmp -s "$srcf" "$f" || { echo "build: $f differs from $srcf"; mismatch=1; }
  fi
done < <(find dist -type f -print0)
n_src=$(( $(find public -type f | wc -l) + $(find src -type f | wc -l) + 3 ))
n_dist=$(find dist -type f | wc -l)
[ "$n_src" -eq "$n_dist" ] || { echo "build: $n_src source files, $n_dist in dist"; mismatch=1; }
[ $mismatch -eq 0 ] || exit 1

sums=$(cd dist && find . -type f | sed 's#^\./##' | LC_ALL=C sort | while IFS= read -r p; do sha256sum -- "$p"; done)
printf '%s\n' "$sums" > dist/SHA256SUMS

echo "build: dist/ assembled ($n_dist files, copied unchanged but for the HTML path rewrite; SHA256SUMS written)"
bash scripts/check.sh dist
