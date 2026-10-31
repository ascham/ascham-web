#!/usr/bin/env bash
# Runs every node --test suite and holds the number of cases to the ledger.
#
#   bash scripts/test.sh          exit 0 pass, 1 a case failed or the count moved
#
# tests/EXPECTED is the one place the case count is written. A case added or
# retired on purpose changes it in the same commit; a count that moves on its
# own means a suite stopped loading or a loop stopped registering cases.
set -u
cd "$(dirname "$0")/.." || exit 2

expected=$(tr -d '[:space:]' < tests/EXPECTED 2>/dev/null)
[[ "$expected" =~ ^[0-9]+$ ]] || { echo "BROKEN: tests/EXPECTED must hold one number"; exit 2; }

out=$(node --test tests/ 2>&1); code=$?
tests=$(sed -nE 's/^# tests ([0-9]+)$/\1/p' <<<"$out")
fail=$(sed -nE 's/^# fail ([0-9]+)$/\1/p' <<<"$out")

if [ "$code" -ne 0 ] || [ "${fail:-x}" != 0 ]; then
  grep -E '^not ok|^# (tests|pass|fail)' <<<"$out"
  echo "test: FAIL (${fail:-?} failing)"
  exit 1
fi
if [ "$tests" != "$expected" ]; then
  echo "test: FAIL (node --test ran $tests cases; tests/EXPECTED says $expected)"
  exit 1
fi
echo "test: PASS ($tests cases, as tests/EXPECTED records)"
