"""Publish a plugin release in the plugin's own GitHub repository (plugins never live in the main BlockDesigner repo).

    python publish_plugin.py <plugin repo dir> [--dry-run]
    python publish_plugin.py --create <plugin repo dir> "<description>" topic1,topic2   # first time: make the repo

Run it from the plugin repository's checkout (e.g. F:/PROGRAMMING/REPOS/BlockDesigner-ReferencePlanes). It reads the
version from build.gradle.kts, the notes from the top section of RELEASE_NOTES.md (above the first ---), and uploads
build/libs/<project>-<version>.jar to a release tagged with the plain version (1.0.0), titled "<Name> <version>".
The tag must be pushed and main pushed first. Re-running uploads only what's missing. Uses git's stored credential.
"""
import argparse
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publish_release import call, token  # noqa: E402

OWNER = "doolecg"


def git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def create(d, description, topics):
    tok = token(d)
    name = os.path.basename(os.path.abspath(d))
    got = call("GET", f"https://api.github.com/repos/{OWNER}/{name}", tok, missing_ok=True)
    if got is None:
        got = call("POST", "https://api.github.com/user/repos", tok,
                   {"name": name, "description": description, "homepage": f"https://github.com/{OWNER}/{name}/releases/latest",
                    "private": False, "has_wiki": False, "has_projects": False, "auto_init": False})
        print("created", got["html_url"])
    else:
        print("exists ", got["html_url"])
    call("PUT", f"https://api.github.com/repos/{OWNER}/{name}/topics", tok, {"names": topics})
    print("topics ", ", ".join(topics))


def publish(d, dry):
    tok = token(d)
    name = os.path.basename(os.path.abspath(d))
    repo = f"{OWNER}/{name}"
    gradle = open(os.path.join(d, "build.gradle.kts"), encoding="utf-8").read()
    v = re.search(r'(?m)^version\s*=\s*"([^"]+)"', gradle).group(1)
    project = re.search(r'rootProject\.name\s*=\s*"([^"]+)"', open(os.path.join(d, "settings.gradle.kts"), encoding="utf-8").read()).group(1)
    notes = open(os.path.join(d, "RELEASE_NOTES.md"), encoding="utf-8").read().replace("\r\n", "\n")
    body = notes.split("\n---\n", 1)[0].strip()
    m = re.match(r"# (.+?) " + re.escape(v) + r"\n", body)
    if not m:
        sys.exit(f"RELEASE_NOTES.md must start with '# <Name> {v}'.")
    title = f"{m.group(1)} {v}"
    jar = os.path.join(d, "build", "libs", f"{project}-{v}.jar")
    if not os.path.isfile(jar):
        sys.exit(f"Missing {jar}: run ./gradlew jar first.")
    if git("ls-remote", "--tags", "origin", f"refs/tags/{v}", cwd=d) == "":
        sys.exit(f"Tag {v} isn't pushed (git tag {v} && git push origin refs/tags/{v}).")
    if git("rev-parse", "HEAD", cwd=d) != git("rev-parse", "origin/main", cwd=d):
        sys.exit("main isn't pushed.")
    print(f"release   : {title} in {repo} (tag {v})")
    print(f"file      : {os.path.basename(jar)} ({os.path.getsize(jar) / 1024:.0f} KB)")
    existing = call("GET", f"https://api.github.com/repos/{repo}/releases/tags/{v}", tok, missing_ok=True)
    have = {x["name"] for x in existing["assets"]} if existing else set()
    print("status    :", "exists" if existing else "will be created")
    if dry:
        print("dry run: nothing changed")
        return
    if existing is None:
        existing = call("POST", f"https://api.github.com/repos/{repo}/releases", tok,
                        {"tag_name": v, "target_commitish": "main", "name": title, "body": body,
                         "draft": False, "prerelease": False, "make_latest": "true"})
        print("created", existing["html_url"])
    if os.path.basename(jar) not in have:
        upload = existing["upload_url"].split("{")[0]
        with open(jar, "rb") as f:
            got = call("POST", f"{upload}?name={os.path.basename(jar)}", tok, data=f.read(), ctype="application/java-archive")
        print("uploaded", got["name"], got["size"], got["state"])
    latest = call("GET", f"https://api.github.com/repos/{repo}/releases/latest", tok)
    print(f"latest    : {latest['tag_name']}")
    print(existing["html_url"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--create", action="store_true")
    ap.add_argument("dir")
    ap.add_argument("rest", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.create:
        create(a.dir, a.rest[0], a.rest[1].split(","))
    else:
        publish(a.dir, a.dry_run)


if __name__ == "__main__":
    main()
