# Retired terms: words the tree must never hold again, read from a private
# list so no published file names them. Sourced by check.sh (R2) and
# pre-publish.sh (P5).
#
# The list is .git/info/retired in the owner's checkout, which is never
# published. One term per line, '#' starts a comment:
#   name WORD    WORD in any case, anywhere, also inside a longer word
#   tag  WORD1   a key tag: its letters in any case as a whole word, so the
#                tag with any version number is a hit and a longer word is not
#
# retired_pattern ROOT sets RETIRED to one extended regex for grep -iE.
# The owner's checkout is the one whose .git/info/exclude lists the private
# notes (R1); there a missing or empty list is broken (return 2, the reason in
# RETIRED_ERR), so the check cannot switch itself off. Anywhere else (an
# export, someone else's clone) RETIRED is empty and the caller says the
# check did not run.
retired_pattern() {
  local root=$1 list=$1/.git/info/retired kind word parts=()
  RETIRED='' RETIRED_ERR=''
  grep -qvE '^[[:space:]]*(#|$)' "$root/.git/info/exclude" 2>/dev/null || return 0
  [ -f "$list" ] || { RETIRED_ERR="$list is missing in this checkout"; return 2; }
  while read -r kind word; do
    case "$kind" in ''|'#'*) continue ;; esac
    case "$kind:$word" in
      name:*) [[ $word =~ ^[A-Za-z]+$ ]] && parts+=("$word") ;;
      tag:*) [[ $word =~ ^([A-Za-z]+)[0-9]+$ ]] && parts+=("(^|[^A-Za-z])${BASH_REMATCH[1]}([^A-Za-z]|\$)") ;;
      *) false ;;
    esac || { RETIRED_ERR="$list: not a term line: $kind $word"; return 2; }
  done < "$list"
  [ ${#parts[@]} -gt 0 ] || { RETIRED_ERR="$list holds no term"; return 2; }
  RETIRED=$(IFS='|'; echo "${parts[*]}")
}
