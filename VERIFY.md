# Verifying the live site

Anyone can confirm that https://ascham.app serves exactly a tagged release,
byte for byte, with the headers its `_headers` lists. You need Bash,
coreutils (`sha256sum`), curl and git; nothing is installed from a package
registry.

## 1. Get the release's source and build it yourself

Each release's source is a download of its own, named by its version, on
the source page (https://ascham.app/source/). Download the one for the
release you are checking, `ascham-1.4.0.bundle` for 1.4.0: the public
repository up to that release, one commit and one tag for each release, in
one file that git can clone.

```bash
git clone ascham-1.4.0.bundle ascham
cd ascham
git checkout v1.4.0          # the release's tag, inside its bundle
bash scripts/build.sh
```

`build.sh` copies `public/` and `src/` into `dist/` unchanged, apart from
one path rewrite in the HTML, proves that every file matches its source,
and writes `dist/SHA256SUMS`: one SHA-256 line per file served.

The same repository is mirrored at https://github.com/ascham/ascham-web,
and `git clone` from there gives the same commits. The bundle is the
reference: each release's tag names the same commit in both. To compare a
tag, run these in the clone above; the two hashes must be the same:

```bash
git rev-parse 'v1.4.0^{commit}'
git ls-remote https://github.com/ascham/ascham-web 'refs/tags/v1.4.0^{}'
```

## 2. Compare with the published sums

`CHANGELOG.md` gives each release's `SHA256SUMS`. Yours must be identical:

```bash
diff dist/SHA256SUMS <(sed -n '/^## 1.4.0/,/^## /p' CHANGELOG.md | grep -E '^[0-9a-f]{64}  ')
```

## 3. Compare with the live site

```bash
bash scripts/verify-live.sh https://ascham.app
```

It fetches every file listed in `dist/SHA256SUMS` from the site (no
compression, no redirects followed) and compares each hash, compares the
site's own `SHA256SUMS` with yours, fetches each page at its folder's
address too (`/app/` as well as `/app/index.html`), and checks that every
response carries each header in `dist/_headers` exactly once, with exactly
that value. That includes the Content Security Policy, which forbids every
connection (`connect-src 'none'`). Any difference is listed, and the script
exits non-zero.

`_headers` itself is not compared: hosts that read it do not serve it. The
headers it lists are checked on every response instead.

## What this shows, and what it does not

A pass shows that the bytes your browser receives are the bytes of the
tagged source, under the headers its `_headers` lists, at the moment you
ran it. What those bytes do is checked by the gates in the same tag
(`README.md` § Checks); what they promise is in `PROMISES.md`.
