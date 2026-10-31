#!/usr/bin/env bash
# Exports the public set: the committed tree (HEAD), allowlisted paths only,
# into a new folder outside this repository, then runs pre-publish.sh on it.
# An allowlist, never a denylist: a file not named below is never exported,
# however new it is.
#
#   bash scripts/export-public.sh OUT [--domain DOMAIN]
#
#   OUT       a folder that does not exist yet, or is empty, outside this repo
#   DOMAIN    passed to pre-publish.sh (default ascham.app)
#
# Exit: pre-publish.sh's (0 ready, 1 not ready), or 2 broken.
set -u
cd "$(dirname "$0")/.." || exit 2
HERE=$PWD

# The public set. Directories are exported whole; everything else is private.
ALLOW=(
  src public tests scripts
  README.md PROMISES.md KNOWN-ISSUES.md DEPENDENCIES.md VERIFY.md SECURITY.md
  LICENSE NOTICE TRADEMARKS.md
  MANUAL-CHECKS.md CONTRIBUTING.md CHANGELOG.md
)

out='' domain=ascham.app
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain=${2:-}; shift 2 ;;
    *) out=$1; shift ;;
  esac
done
[ -n "$out" ] && [ -n "$domain" ] || { echo "usage: export-public.sh OUT [--domain DOMAIN]"; exit 2; }
mkdir -p "$out" && out=$(cd "$out" && pwd) || { echo "BROKEN: cannot create $out"; exit 2; }
case "$out/" in "$HERE"/*) echo "BROKEN: $out is inside the repository"; exit 2 ;; esac
[ -z "$(ls -A "$out")" ] || { echo "BROKEN: $out is not empty"; exit 2; }
git rev-parse --verify -q HEAD >/dev/null || { echo "BROKEN: no commit to export"; exit 2; }

missing=()
present=()
for p in "${ALLOW[@]}"; do
  if git cat-file -e "HEAD:$p" 2>/dev/null; then present+=("$p"); else missing+=("$p"); fi
done
git archive --format=tar HEAD -- "${present[@]}" | tar -x -C "$out" || { echo "BROKEN: git archive"; exit 2; }

echo "export: $(find "$out" -type f | wc -l) files from $(git rev-parse --short HEAD) in $out"
[ ${#missing[@]} -eq 0 ] || echo "export: NOT EXPORTED, missing from HEAD: ${missing[*]}"
bash "$HERE/scripts/pre-publish.sh" "$out" --domain "$domain"; code=$?
[ ${#missing[@]} -eq 0 ] || { [ $code -eq 0 ] && code=1; }
exit $code
