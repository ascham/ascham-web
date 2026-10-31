#!/usr/bin/env bash
# Makes one release of the public repository, and its two source files, from
# the export. Never pushes: it prints the push for the owner to run.
#
#   bash scripts/release-public.sh REPO FILES [--domain DOMAIN]
#
#   REPO      the public repository, outside this one. For the first
#             release: absent, an empty folder, or a git repository with no
#             ref at all, on main and clean, such as a clone of an empty
#             repository, used as it is, its remote kept. Else a clean
#             checkout of main whose only refs are main and the earlier
#             releases' annotated tags, main at the latest, and what a push
#             leaves: origin/main at one of those releases, and origin/HEAD
#             naming it
#   FILES     the folder for ascham-VERSION.bundle and ascham-VERSION.tar.gz,
#             outside both repositories; earlier releases' files stay in it
#   DOMAIN    passed to export-public.sh and pre-publish.sh (default
#             ascham.app)
#
# In order: the export (export-public.sh, READY or stop); in a scratch copy
# of REPO, one commit whose tree is the export's, as Ascham
# <dev@ascham.app>, on the previous release's commit, and its annotated tag
# vVERSION; pre-publish.sh on that copy, history included. Only then are the
# commit and tag brought into REPO, by fast-forward, and checked again
# there; then the bundle and the tar.gz, from REPO's refs, never a folder.
#
# Exit 0 released, 1 not ready (REPO untouched), 2 broken.
set -u
cd "$(dirname "$0")/.." || exit 2
HERE=$PWD
# Only the arguments below choose where git reads, writes and signs as.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL \
  GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL EMAIL
ID=(-c user.name=Ascham -c user.email=dev@ascham.app)
# The export's bytes, as they are: no ignore, attribute or line-ending rule.
RAW=(-c core.excludesFile=/dev/null -c core.attributesFile=/dev/null -c core.autocrlf=false)

broken() { echo "BROKEN: $1"; exit 2; }
args=() domain=ascham.app
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain=${2:-}; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
[ ${#args[@]} -eq 2 ] && [ -n "$domain" ] \
  || { echo "usage: release-public.sh REPO FILES [--domain DOMAIN]"; exit 2; }
repo=$(realpath -m -- "${args[0]}") files=$(realpath -m -- "${args[1]}")
for p in "$repo" "$files"; do
  case "$p/" in "$HERE"/*) broken "$p is inside this repository" ;; esac
done
case "$HERE/" in "$repo"/*) broken "this repository is inside $repo" ;; esac
case "$files/" in "$repo"/*) broken "$files is inside $repo" ;; esac
case "$repo/" in "$files"/*) broken "$repo is inside $files" ;; esac

# ---- This repository: the release is HEAD, as gated -------------------------
[ -z "$(git status --porcelain)" ] || broken "this repository has uncommitted changes"
VERSION=$(git show HEAD:src/core/version.js | sed -n "s/^export const VERSION = '\([0-9]*\.[0-9]*\.[0-9]*\)';\$/\1/p")
[ -n "$VERSION" ] || broken "no VERSION in HEAD's src/core/version.js"
tag=v$VERSION msg="Ascham $VERSION"

# ---- REPO: nothing in it but the earlier releases ---------------------------
prev='' fresh=''
if [ -n "$(ls -A "$repo" 2>/dev/null)" ]; then
  [ "$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null)" = "$repo" ] \
    || broken "$repo is not empty and not a git repository"
  [ "$(git -C "$repo" symbolic-ref -q HEAD)" = refs/heads/main ] || broken "$repo is not on main"
  [ -z "$(git -C "$repo" status --porcelain --ignored --untracked-files=all)" ] \
    || broken "$repo is not clean (changes, untracked or ignored files)"
  # No ref at all, so no commit: the first release, into this repository
  # as it is (a clone of an empty repository keeps its origin).
  if [ -z "$(git -C "$repo" for-each-ref)" ]; then
    fresh=1
  else
    other=$(git -C "$repo" for-each-ref --format='%(refname) %(objecttype) %(symref)' \
      | grep -vE '^(refs/heads/main commit |refs/tags/v[0-9]+\.[0-9]+\.[0-9]+ tag |refs/remotes/origin/main commit |refs/remotes/origin/HEAD commit refs/remotes/origin/main)$')
    [ -z "$other" ] || broken "$repo holds a ref that is not main, an annotated release tag or origin's main:
$other"
    pushed=$(git -C "$repo" rev-parse -q --verify refs/remotes/origin/main)
    [ -z "$pushed" ] || [ -n "$(git -C "$repo" tag -l 'v*' --points-at "$pushed")" ] \
      || broken "$repo's origin/main is not one of its releases"
    prev=$(git -C "$repo" tag -l 'v*' --sort=-v:refname | head -1)
    [ -n "$prev" ] || broken "$repo has no release"
    [ "$(git -C "$repo" rev-parse HEAD)" = "$(git -C "$repo" rev-parse "$prev^{commit}")" ] \
      || broken "$repo's main is not its latest release, $prev"
    [ "$(git -C "$repo" rev-list --count HEAD)" = "$(git -C "$repo" tag -l | grep -c .)" ] \
      && [ -z "$(git -C "$repo" tag --no-merged HEAD)" ] \
      || broken "$repo is not one commit and one tag for each release"
    git -C "$repo" rev-parse -q --verify "refs/tags/$tag" >/dev/null && broken "$tag is already in $repo"
    [ "$(printf '%s\n' "${prev#v}" "$VERSION" | sort -V | tail -1)" = "$VERSION" ] \
      || broken "$VERSION is not after ${prev#v}"
  fi
fi
bundle=$files/ascham-$VERSION.bundle tgz=$files/ascham-$VERSION.tar.gz
for f in "$bundle" "$tgz"; do [ -e "$f" ] && broken "$f exists"; done

tmp=$(mktemp -d) || broken "mktemp"
trap 'rm -rf "$tmp"' EXIT
exp=$tmp/export st=$tmp/stage

# ---- The export -------------------------------------------------------------
bash "$HERE/scripts/export-public.sh" "$exp" --domain "$domain"; code=$?
[ $code -eq 0 ] || { echo "release: stopped, the export is not ready; $repo untouched"; exit $code; }

# The export's tree hash, made in a repository of its own.
treeof() {
  git init -q -b main "$1" && (cd "$exp" && GIT_DIR="$1/.git" GIT_WORK_TREE=. GIT_INDEX_FILE="$1/index" \
    git "${RAW[@]}" add -A -f && GIT_DIR="$1/.git" GIT_INDEX_FILE="$1/index" git write-tree)
}
want=$(treeof "$tmp/hash") || broken "hashing the export"

# ---- The release, in a scratch copy of REPO ---------------------------------
git init -q -b main "$st" || broken "git init"
if [ -n "$prev" ]; then
  git -C "$st" fetch -q --no-tags --update-head-ok "$repo" \
    refs/heads/main:refs/heads/main 'refs/tags/*:refs/tags/*' || broken "copying $repo"
fi
tree=$(cd "$exp" && GIT_DIR="$st/.git" GIT_WORK_TREE=. GIT_INDEX_FILE="$tmp/index" \
  git "${RAW[@]}" add -A -f && GIT_DIR="$st/.git" GIT_INDEX_FILE="$tmp/index" git write-tree) \
  || broken "writing the tree"
[ "$tree" = "$want" ] || broken "the release's tree is not the export's ($tree, not $want)"
parent=()
[ -n "$prev" ] && parent=(-p "$(git -C "$st" rev-parse "$prev^{commit}")")
commit=$(git -C "$st" "${ID[@]}" commit-tree "$tree" "${parent[@]}" -m "$msg") || broken "commit-tree"
git -C "$st" update-ref refs/heads/main "$commit" || broken "update-ref"
git -C "$st" "${ID[@]}" tag -a "$tag" -m "$msg" "$commit" || broken "tag"
[ "$(git -C "$st" cat-file -t "$tag")" = tag ] || broken "the tag is not annotated"
git -C "$st" "${RAW[@]}" reset -q --hard main || broken "checkout"
# The checkout is the export, byte for byte, executable bits included.
x() { (cd "$1" && find . -path ./.git -prune -o -type f -perm -u+x -print | sort); }
diff -r -x .git "$exp" "$st" >/dev/null || broken "the release's checkout is not the export's files"
[ "$(x "$exp")" = "$(x "$st")" ] || broken "the release's executable files are not the export's"
bash "$HERE/scripts/pre-publish.sh" "$st" --domain "$domain"; code=$?
[ $code -eq 0 ] || { echo "release: stopped, the release is not ready; $repo untouched"; exit $code; }

# ---- Into REPO, by fast-forward only ----------------------------------------
# From here REPO may hold the release; any failure says how to put REPO back
# as it was.
if [ -n "$prev" ]; then
  undo="git -C $repo tag -d $tag; git -C $repo reset -q --hard $prev"
elif [ -n "$fresh" ]; then
  undo="git -C $repo tag -d $tag; git -C $repo update-ref -d refs/heads/main; git -C $repo read-tree --empty; git -C $repo clean -fdxq"
elif [ -d "$repo" ]; then
  undo="rm -rf $repo && mkdir $repo"
else
  undo="rm -rf $repo"
fi
again() { echo "BROKEN: $repo may now hold $tag, but $1. Undo before anything else: $undo"; exit 2; }
# Only an absent REPO or an empty folder is made a repository.
if [ -z "$prev" ] && [ -z "$fresh" ]; then
  mkdir -p "$repo" && git init -q -b main "$repo" || again "git init failed"
fi
git -C "$repo" fetch -q --no-tags "$st" "refs/tags/$tag:refs/tags/$tag" || again "fetching it failed"
git -C "$repo" "${RAW[@]}" merge -q --ff-only "$commit" || again "it is not a fast-forward"

# ---- REPO, checked again ----------------------------------------------------
[ "$(git -C "$repo" rev-parse HEAD)" = "$commit" ] && [ "$(git -C "$repo" rev-parse "$tag^{commit}")" = "$commit" ] \
  || again "main or the tag is not the release's commit"
[ "$(git -C "$repo" rev-parse "$tag^{tree}")" = "$want" ] || again "its tree is not the export's"
[ "$(git -C "$repo" cat-file -t "$tag")" = tag ] || again "the tag is not annotated"
[ -z "$(git -C "$repo" status --porcelain --ignored --untracked-files=all)" ] || again "it is not clean"
diff -r -x .git "$exp" "$repo" >/dev/null || again "its files are not the export's"
[ "$(x "$exp")" = "$(x "$repo")" ] || again "its executable files are not the export's"
out=$(bash "$HERE/scripts/pre-publish.sh" "$repo" --domain "$domain") || again "pre-publish.sh is not READY there:
$out"

# ---- The two files, from REPO's refs ----------------------------------------
mkdir -p "$files" || broken "cannot create $files"
git -C "$repo" bundle create -q "$bundle" refs/heads/main --tags || broken "bundle"
git -C "$repo" archive --format=tar.gz --prefix="ascham-$VERSION/" -o "$tgz" "$tag" || broken "archive"
git -c init.defaultBranch=main clone -q "$bundle" "$tmp/clone" && git -C "$tmp/clone" checkout -q "$tag" \
  && [ "$(git -C "$tmp/clone" rev-parse "$tag^{commit}")" = "$commit" ] \
  && diff -r -x .git "$exp" "$tmp/clone" >/dev/null || broken "the bundle does not give $tag as released"
[ "$(tar -tzf "$tgz" | grep -v '/$' | sed "s#^ascham-$VERSION/##" | sort)" \
  = "$(git -C "$repo" ls-tree -r --name-only "$tag" | sort)" ] || broken "the tar.gz is not $tag's files"

echo "release: $tag, commit ${commit:0:12}, tree ${tree:0:12}, from $(git rev-parse --short HEAD), in $repo"
(cd "$files" && sha256sum "ascham-$VERSION.bundle" "ascham-$VERSION.tar.gz")
git -C "$repo" remote get-url origin >/dev/null 2>&1 \
  || echo "no remote yet; the owner adds it once: git -C $repo remote add origin <the GitHub repository>"
echo "push, not run: git -C $repo push --atomic origin main $tag"
