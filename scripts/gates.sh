#!/usr/bin/env bash
# Every gate, in order, stopping at the first that fails.
#
#   bash scripts/gates.sh             before every commit: Chrome only
#   bash scripts/gates.sh --release   before any tag: Chrome and Firefox
#
# The browser test's evidence (PDFs, downloads, screenshots) goes to EVIDENCE
# when it is set, kept as it is; otherwise to a fresh temporary directory,
# named on the browser test's "# evidence:" line, of which the newest five are kept.
set -u
cd "$(dirname "$0")/.." || exit 2

browsers=chrome
case "${1:-}" in
  '') ;;
  --release) browsers=all ;;
  *) echo "usage: gates.sh [--release]"; exit 2 ;;
esac

run() {
  echo "== $*"
  "$@" || { echo "gates: FAIL at: $*"; exit 1; }
}

run bash scripts/test.sh
run bash scripts/check.sh
run bash scripts/check-mutations.sh
run bash scripts/build.sh
run bash scripts/check.sh dist
run node --experimental-websocket scripts/browser-test.mjs "$browsers" ${EVIDENCE:+"$EVIDENCE"}
echo "gates: PASS (${browsers/all/Chrome and Firefox})"
