"""Publish a BlockDesigner GitHub release: the top section of RELEASE_NOTES.md plus the installer and portable zip.

    python publish_release.py 0.4.8 --dry-run   # check everything, change nothing
    python publish_release.py 0.4.8             # create the release (tag on main) and upload both files

Run from anywhere inside the repo. `gh` isn't needed: this uses the GitHub REST API with the token git already
stores (git credential fill). If a release for the version already exists (say an upload failed half way), the
missing files are uploaded to it instead of failing.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "doolecg/BlockDesigner"


def git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def repo_root():
    return git("rev-parse", "--show-toplevel", cwd=os.getcwd())


def token(root):
    out = subprocess.run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, check=True, cwd=root).stdout
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
    req.add_header("User-Agent", "BlockDesigner-release")
    if payload is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if missing_ok and e.code == 404:
            return None
        sys.exit(f"{method} {url} -> {e.code}: {e.read().decode(errors='replace')[:500]}")


def release_notes(root, version):
    """The newest section of RELEASE_NOTES.md (heading included: the release page shows it like earlier ones)."""
    text = open(os.path.join(root, "RELEASE_NOTES.md"), encoding="utf-8").read().replace("\r\n", "\n")
    section = text.split("\n---\n", 1)[0].strip()
    first = section.splitlines()[0] if section else ""
    if first.strip() != f"# BlockDesigner {version}":
        sys.exit(f"RELEASE_NOTES.md starts with {first!r}, expected '# BlockDesigner {version}'. Write the notes first.")
    return f"BlockDesigner {version}", section + "\n"


def build_version(root):
    m = re.search(r'^\s*version\s*=\s*"([^"]+)"', open(os.path.join(root, "build.gradle.kts"), encoding="utf-8").read(), re.M)
    return m.group(1) if m else None


def assets(root, version):
    """
    The files to upload: the .msi (all users, what updaters from 0.4.7 on install), the per-user setup .exe (what
    updaters up to 0.4.6 install; without it they can't update), and the portable zip.
    """
    dist = os.path.join(root, "dist")
    portable = f"BlockDesigner-{version}-portable.zip"
    out = []
    for name, ctype in [(f"BlockDesigner-{version}.msi", "application/x-msi"),
                        (f"BlockDesigner-{version}.exe", "application/vnd.microsoft.portable-executable")]:
        if not os.path.isfile(os.path.join(dist, name)):
            sys.exit(f"No dist/{name}. Build both installers: ./gradlew :app:portable :app:installer")
        out.append((name, ctype))
    if not os.path.isfile(os.path.join(dist, portable)):
        sys.exit(f"No dist/{portable}. Build it: ./gradlew :app:portable :app:installer")
    out.append((portable, "application/zip"))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("version")
    ap.add_argument("--dry-run", action="store_true", help="check everything, change nothing")
    a = ap.parse_args()
    v, root = a.version, repo_root()

    # Checks that don't need the network.
    bv = build_version(root)
    if bv != v:
        sys.exit(f"build.gradle.kts has version {bv!r}, not {v!r}.")
    title, body = release_notes(root, v)
    files = assets(root, v)
    head, remote_main = git("rev-parse", "HEAD", cwd=root), git("rev-parse", "origin/main", cwd=root)
    if git("rev-parse", "--abbrev-ref", "HEAD", cwd=root) != "main" or head != remote_main:
        sys.exit("Be on main, with main pushed (HEAD == origin/main) before publishing: the tag is made on main.")

    tok = token(root)
    existing = call("GET", f"https://api.github.com/repos/{REPO}/releases/tags/{v}", tok, missing_ok=True)
    have = {x["name"] for x in (existing or {}).get("assets", [])}
    todo = [(n, c) for n, c in files if n not in have]

    print(f"release   : {title} (tag {v} on main @ {head[:7]})")
    print(f"notes     : {len(body.splitlines())} lines from RELEASE_NOTES.md")
    for n, _ in files:
        size = os.path.getsize(os.path.join(root, 'dist', n))
        print(f"file      : {n} ({size / 1e6:.1f} MB){'  [already uploaded]' if n in have else ''}")
    print(f"status    : {'exists, will upload what is missing' if existing else 'will be created'}")
    if a.dry_run:
        print("dry run: nothing changed")
        return

    if existing is None:
        existing = call("POST", f"https://api.github.com/repos/{REPO}/releases", tok,
                        {"tag_name": v, "target_commitish": "main", "name": title, "body": body,
                         "draft": False, "prerelease": False, "make_latest": "true"})
        print("created", existing["html_url"])
    upload = existing["upload_url"].split("{")[0]
    for n, ctype in todo:
        with open(os.path.join(root, "dist", n), "rb") as f:
            got = call("POST", f"{upload}?name={n}", tok, data=f.read(), ctype=ctype)
        print("uploaded", got["name"], got["size"], got["state"])

    latest = call("GET", f"https://api.github.com/repos/{REPO}/releases/latest", tok)
    names = sorted(x["name"] for x in latest["assets"])
    print(f"latest    : {latest['tag_name']} {names}")
    if latest["tag_name"] != v:
        sys.exit(f"GitHub's latest release is {latest['tag_name']}, not {v}.")
    print(existing["html_url"])


if __name__ == "__main__":
    main()
