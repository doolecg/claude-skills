"""Publish a GitHub release for any repo: tag on main, body from the top section of RELEASE_NOTES.md, asset uploads.

    python publish_release.py 1.2.1 --dry-run                      # check everything, print the plan, change nothing
    python publish_release.py 1.2.1 --assets "dist/*.msi" "build/libs/app-1.2.1.jar"
    python publish_release.py 1.2.1 --repo owner/name --app "My App" --notes path/RELEASE_NOTES.md

Run it from inside the repo (or pass --dir). It uses the GitHub REST API with the token git already stores
(git credential fill), so it works with or without the `gh` CLI. A dry run makes no network call at all: it checks
the notes heading, the asset globs and that main is pushed, then prints what it would do.

A real run creates the release (GitHub makes the tag on main) unless one for the tag exists, uploads the assets that
are missing, and checks GitHub lists it as latest. Re-running after a half-failed upload only uploads what is missing.
"""
import argparse
import glob
import json
import mimetypes
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def git(*args, cwd, check=True):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def repo_from_remote(root):
    url = git("remote", "get-url", "origin", cwd=root)
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?/?$", url)
    if not m:
        sys.exit(f"origin ({url}) is not a GitHub remote; pass --repo owner/name.")
    return m.group(1)


def token(root):
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, cwd=root).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    sys.exit("No GitHub credential stored for git (push something once so git's credential manager saves one).")


def call(method, url, tok, body=None, data=None, ctype="application/json", missing_ok=False):
    payload = data if data is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, method=method, data=payload)
    req.add_header("Authorization", "Bearer " + tok)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "repo-release")
    if payload is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if missing_ok and e.code == 404:
            return None
        sys.exit(f"{method} {url} -> {e.code}: {e.read().decode(errors='replace')[:500]}")


def notes_section(path, version, app):
    """Top section of the notes file (up to the first line that is only ---), heading included."""
    if not os.path.isfile(path):
        sys.exit(f"{path} not found.")
    text = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    section = text.split("\n---\n", 1)[0].strip()
    first = section.splitlines()[0].strip() if section else ""
    m = re.fullmatch(r"# (.+) " + re.escape(version), first)
    if not m or (app and m.group(1) != app):
        sys.exit(f"{os.path.basename(path)} starts with {first!r}, expected '# {app or '<App>'} {version}'. "
                 "Write the notes first.")
    return first[2:], section + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version", help="plain version, also the tag (1.2.1, no leading v)")
    ap.add_argument("--dir", default=os.getcwd(), help="repo directory (default: current)")
    ap.add_argument("--repo", help="owner/name (default: from the origin remote)")
    ap.add_argument("--app", help="name in the notes heading (default: whatever the heading says)")
    ap.add_argument("--notes", default="RELEASE_NOTES.md", help="notes file, relative to the repo")
    ap.add_argument("--assets", nargs="*", default=[], help="files or globs to upload, relative to the repo")
    ap.add_argument("--branch", default="main", help="branch the tag is made on")
    ap.add_argument("--dry-run", action="store_true", help="check and print the plan; no network, no writes")
    a = ap.parse_args()
    v = a.version
    if v.startswith("v"):
        sys.exit("Plain tags only: use 1.2.1, not v1.2.1.")

    root = git("rev-parse", "--show-toplevel", cwd=a.dir)
    repo = a.repo or repo_from_remote(root)
    title, body = notes_section(os.path.join(root, a.notes), v, a.app)

    files = []
    for pat in a.assets:
        hits = sorted(glob.glob(os.path.join(root, pat)))
        if not hits:
            sys.exit(f"Asset {pat!r} matches no file. Build first.")
        files += [h for h in hits if os.path.isfile(h)]
    names = [os.path.basename(f) for f in files]
    if len(set(names)) != len(names):
        sys.exit("Two assets share a file name; GitHub would reject the second.")

    head = git("rev-parse", "HEAD", cwd=root)
    cur = git("rev-parse", "--abbrev-ref", "HEAD", cwd=root)
    remote_head = git("rev-parse", f"origin/{a.branch}", cwd=root, check=False)
    problems = []
    if cur != a.branch:
        problems.append(f"on {cur}, not {a.branch}")
    if head != remote_head:
        problems.append(f"HEAD is not origin/{a.branch} (push first)")
    if git("status", "--porcelain", "--untracked-files=no", cwd=root):
        problems.append("tracked files are modified (uncommitted)")

    print(f"repo      : {repo}")
    print(f"release   : {title} (tag {v} on {a.branch} @ {head[:7]})")
    print(f"notes     : {len(body.splitlines())} lines from {a.notes}")
    for f in files:
        print(f"asset     : {os.path.relpath(f, root)} ({os.path.getsize(f) / 1e6:.1f} MB)")
    if not files:
        print("asset     : (none)")
    for p in problems:
        print("PROBLEM   :", p)

    if a.dry_run:
        print("dry run: nothing changed" + ("; fix the problems above before the real run" if problems else ""))
        return
    if problems:
        sys.exit("Fix the problems above first.")

    tok = token(root)
    api = f"https://api.github.com/repos/{repo}"
    rel = call("GET", f"{api}/releases/tags/{v}", tok, missing_ok=True)
    if rel is None:
        rel = call("POST", f"{api}/releases", tok, {"tag_name": v, "target_commitish": a.branch, "name": title,
                                                    "body": body, "draft": False, "prerelease": False,
                                                    "make_latest": "true"})
        print("created", rel["html_url"])
    have = {x["name"] for x in rel.get("assets", [])}
    upload = rel["upload_url"].split("{")[0]
    for f, n in zip(files, names):
        if n in have:
            print("already there", n)
            continue
        ctype = mimetypes.guess_type(n)[0] or "application/octet-stream"
        with open(f, "rb") as fh:
            got = call("POST", f"{upload}?name={urllib.parse.quote(n)}", tok, data=fh.read(), ctype=ctype)
        print("uploaded", got["name"], got["size"], got["state"])

    latest = call("GET", f"{api}/releases/latest", tok)
    print(f"latest    : {latest['tag_name']} {sorted(x['name'] for x in latest['assets'])}")
    if latest["tag_name"] != v:
        sys.exit(f"GitHub's latest release is {latest['tag_name']}, not {v}.")
    print(rel["html_url"])


if __name__ == "__main__":
    main()
