#!/usr/bin/env bash
# Proves a live site serves exactly the build: every file in dist/SHA256SUMS,
# fetched from the site, hashes to the line that lists it; the site's own
# SHA256SUMS is byte for byte the local one; and every response carries each
# header in dist/_headers exactly once with exactly that value.
#
#   bash scripts/verify-live.sh URL [DIR]    DIR defaults to dist/
#
# Exit 0 the site matches, 1 a difference (each one listed), 2 broken.
# `_headers` and `_redirects` are not compared: hosts that read them do not
# serve them, and the headers `_headers` lists are checked on every response
# instead. Each page named index.html is fetched at its folder's address too
# (/app/ as well as /app/index.html). No redirect is followed: a host that
# moves a file elsewhere is serving something other than the build.
set -u
cd "$(dirname "$0")/.." || exit 2
LC_ALL=C

[ $# -ge 1 ] || { echo "usage: verify-live.sh URL [DIR]"; exit 2; }
base=${1%/}
dir=${2:-dist}
[ -f "$dir/SHA256SUMS" ] && [ -f "$dir/_headers" ] || { echo "BROKEN: $dir/SHA256SUMS or $dir/_headers is missing (run scripts/build.sh)"; exit 2; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/verify-live-XXXXXX") || exit 2
trap 'rm -rf "$tmp"' EXIT

# The "/*" block of _headers, as "Name: value" lines, names lower-cased.
want=$(awk '/^[^ \t#]/ { inb = ($1 == "/*"); next }
  inb && /^[ \t]+[^ \t#][^:]*:/ { sub(/^[ \t]+/, ""); i = index($0, ":");
    n = tolower(substr($0, 1, i - 1)); v = substr($0, i + 1); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v);
    print n ": " v }' "$dir/_headers")
[ -n "$want" ] || { echo "BROKEN: no headers under /* in $dir/_headers"; exit 2; }

fail=0
bad() { echo "DIFF $1"; fail=1; }
n=0

# fetch PATH: body to $tmp/body, headers to $tmp/head; prints the status.
fetch() {
  curl -sS --max-redirs 0 --connect-timeout 10 --max-time 60 -H 'Accept-Encoding: identity' \
    -D "$tmp/head" -o "$tmp/body" -w '%{http_code}' -- "$base/$1" 2>"$tmp/err" || echo "000"
}

# headers PATH: every header in _headers present once, value exact.
headers() {
  local got name line count
  got=$(tr -d '\r' < "$tmp/head" | awk 'NR > 1 && /:/ { i = index($0, ":");
    n = tolower(substr($0, 1, i - 1)); v = substr($0, i + 1); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v);
    print n ": " v }')
  while IFS= read -r line; do
    name=${line%%:*}
    count=$(grep -c "^$name: " <<<"$got")
    if [ "$count" -ne 1 ]; then
      bad "/$1: header $name sent $count times, want once"
    elif ! grep -qxF -- "$line" <<<"$got"; then
      bad "/$1: header differs:
  got:  $(grep "^$name: " <<<"$got")
  want: $line"
    fi
  done <<<"$want"
}

# check PATH HASH
check() {
  local status
  status=$(fetch "$1")
  n=$((n + 1))
  if [ "$status" != 200 ]; then
    bad "/$1: HTTP $status $(head -c 200 "$tmp/err")"
    return
  fi
  [ "$(sha256sum < "$tmp/body" | cut -d' ' -f1)" = "$2" ] || bad "/$1: bytes differ from $dir/$3"
  headers "$1"
}

while read -r hash path; do
  [ -n "$path" ] || continue
  case "$path" in _headers|_redirects) continue ;; esac
  check "$path" "$hash" "$path"
  case "$path" in index.html|*/index.html) check "${path%index.html}" "$hash" "$path" ;; esac
done < "$dir/SHA256SUMS"
check SHA256SUMS "$(sha256sum < "$dir/SHA256SUMS" | cut -d' ' -f1)" SHA256SUMS

if [ $fail -eq 0 ]; then
  echo "verify-live: PASS ($n responses from $base match $dir/SHA256SUMS and $dir/_headers)"
  exit 0
fi
exit 1
