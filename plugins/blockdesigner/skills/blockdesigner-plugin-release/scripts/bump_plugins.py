"""Move BlockDesigner plugin repos onto a new app version's API jars: the mechanical part of "update the plugins too".

    python bump_plugins.py --dry-run                   # show what would change in every plugin repo
    python bump_plugins.py                             # do it, for the main repo's current version
    python bump_plugins.py 0.4.23 --only ResourceTracker,PaletteTools --dry-run
    python bump_plugins.py --exclude AIBuilder

For each repo F:/PROGRAMMING/REPOS/BlockDesigner-* that contains a blockdesigner-plugin.json (outside build/):
  1. skips it if its working tree isn't clean (git status --porcelain), or if it already compiles against <appver>;
  2. reads the old API version from its *.kts files (blockdesigner-plugin-api-<old>.jar);
  3. deletes libs/*.jar and copies in the new blockdesigner-plugin-api-<appver>.jar and blockdesigner-core-<appver>.jar
     (from the main repo's plugin-api/build/libs and core/build/libs), recreating libs/ if it went missing;
  4. replaces the old version only where it names the API: the jar file names and "(from BlockDesigner <old>)" in
     *.kts / *.properties / *.toml, and "(from BlockDesigner <old>)" in README.md. The README's
     "Needs BlockDesigner X or later" line is never touched: the minimum only moves when the API level does;
  5. bumps the patch version in the root build.gradle.kts (a column-0 version = "x.y.z" line);
  6. prepends a "kept up to date" section to RELEASE_NOTES.md, repeating the previous section's **Needs** line.

It never stages, commits, tags, pushes or publishes: those stay explicit steps (see SKILL.md). Files are written with
LF line endings unless the file already used CRLF.
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAIN = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))  # .claude/skills/<skill>/scripts -> repo root
SKIP_DIRS = {".git", "build", ".gradle", "libs", "out", ".idea", "node_modules"}
V = r"\d+\.\d+\.\d+"


def read(p):
    with io.open(p, encoding="utf-8", newline="") as f:
        return f.read()


def write(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def git(d, *args):
    return subprocess.run(["git", *args], cwd=d, capture_output=True, text=True, check=True).stdout


def main_version():
    m = re.search(r'(?m)^\s*version\s*=\s*"(' + V + r')"', read(os.path.join(MAIN, "build.gradle.kts")))
    if not m:
        sys.exit("Can't read the version from the main repo's build.gradle.kts")
    return m.group(1)


def walk(d, keep):
    for dirpath, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if keep(f):
                yield os.path.join(dirpath, f)


def discover(root, only, exclude):
    out = []
    for name in sorted(os.listdir(root)):
        d = os.path.join(root, name)
        if not name.startswith("BlockDesigner-") or not os.path.isdir(d):
            continue
        short = name[len("BlockDesigner-"):]
        if only and short not in only and name not in only:
            continue
        if short in exclude or name in exclude:
            continue
        if any(True for _ in walk(d, lambda f: f == "blockdesigner-plugin.json")):
            out.append(d)
    return out


def replace_api_refs(text, old, new, readme):
    """Old -> new only where it names the API jars / the BlockDesigner version they come from."""
    pats = [(r"\(from BlockDesigner " + re.escape(old) + r"\)", "(from BlockDesigner " + new + ")")]
    if not readme:
        pats += [(r"blockdesigner-plugin-api-" + re.escape(old) + r"\.jar", "blockdesigner-plugin-api-" + new + ".jar"),
                 (r"blockdesigner-core-" + re.escape(old) + r"\.jar", "blockdesigner-core-" + new + ".jar")]
    n = 0
    for pat, rep in pats:
        text, k = re.subn(pat, rep, text)
        n += k
    return text, n


def bump(d, app, api_jar, core_jar, dry, allow_older=False):
    name = os.path.basename(d)
    tag = "[dry run] " if dry else ""
    dirty = git(d, "status", "--porcelain").strip()
    if dirty:
        print(f"{name}: SKIPPED, working tree not clean:\n    " + "\n    ".join(dirty.splitlines()[:10]))
        return False
    kts = list(walk(d, lambda f: f.endswith(".kts")))
    refs = "".join(read(p) for p in kts)
    found = sorted(set(re.findall(r"blockdesigner-plugin-api-(" + V + r")\.jar", refs)))
    if len(found) != 1:
        print(f"{name}: SKIPPED, expected one blockdesigner-plugin-api-<version>.jar reference in *.kts, found {found or 'none'}")
        return False
    old = found[0]
    if old == app:
        print(f"{name}: already on the {app} API jars, nothing to do")
        return True
    if tuple(map(int, app.split("."))) < tuple(map(int, old.split("."))) and not allow_older:
        print(f"{name}: SKIPPED, it is on {old}, newer than {app} (pass --allow-older to go back)")
        return False

    root_build = os.path.join(d, "build.gradle.kts")
    b = read(root_build)
    m = re.search(r'(?m)^version = "(\d+)\.(\d+)\.(\d+)"', b)
    if not m:
        print(f"{name}: SKIPPED, no column-0 version = \"x.y.z\" in build.gradle.kts")
        return False
    cur = "%s.%s.%s" % m.groups()
    new = "%s.%s.%d" % (m.group(1), m.group(2), int(m.group(3)) + 1)

    notes_path = os.path.join(d, "RELEASE_NOTES.md")
    notes = read(notes_path)
    nl = "\r\n" if "\r\n" in notes else "\n"
    top = notes.replace("\r\n", "\n").split("\n---", 1)[0]
    head = re.match(r"# (.+) (" + V + r")\s*$", top.splitlines()[0]) if top else None
    if not head:
        print(f"{name}: SKIPPED, RELEASE_NOTES.md doesn't start with '# <Name> <version>'")
        return False
    if head.group(2) != cur:
        print(f"{name}: WARNING, notes start at {head.group(2)} but build.gradle.kts says {cur}")
    title = head.group(1)
    needs = next((l for l in top.splitlines() if l.startswith("**Needs")), None)

    # Which files change.
    edits = []
    for p in walk(d, lambda f: f.endswith((".kts", ".properties", ".toml")) or f == "README.md"):
        s = read(p)
        s2, n = replace_api_refs(s, old, app, os.path.basename(p) == "README.md")
        if p == root_build:
            s2 = re.sub(r'(?m)^version = "' + re.escape(cur) + '"', 'version = "%s"' % new, s2, count=1)
        if s2 != s:
            edits.append((p, s2, n))
    if os.path.join(d, "README.md") not in [e[0] for e in edits]:
        print(f"{name}: note, README.md has no '(from BlockDesigner {old})' to update")

    section = ["# %s %s" % (title, new), "",
               "Kept up to date with BlockDesigner %s: built and tested against its plugin API. Nothing changes in how it works." % app, ""]
    if needs:
        section += [needs, ""]
    else:
        print(f"{name}: note, the previous notes have no **Needs** line; add one by hand")
    section += ["## Changed", "- Built against the BlockDesigner %s plugin API." % app, "", "---", "", ""]

    libs = os.path.join(d, "libs")
    old_jars = sorted(f for f in (os.listdir(libs) if os.path.isdir(libs) else []) if f.endswith(".jar"))
    print(f"{tag}{name}: {cur} -> {new}, API {old} -> {app}")
    print(f"    libs/: remove {', '.join(old_jars) or '(none)'}; add blockdesigner-plugin-api-{app}.jar, blockdesigner-core-{app}.jar")
    for p, _, n in edits:
        print(f"    edit {os.path.relpath(p, d)}" + (f" ({n} API reference{'s' if n != 1 else ''})" if n else " (version)"))
    print(f"    RELEASE_NOTES.md: new section '# {title} {new}'" + (f", {needs.split(')')[0]})" if needs else ""))
    if dry:
        return True

    for f in old_jars:
        os.remove(os.path.join(libs, f))
    os.makedirs(libs, exist_ok=True)  # a git rm of the last jar would have removed the folder; copying needs it
    shutil.copyfile(api_jar, os.path.join(libs, f"blockdesigner-plugin-api-{app}.jar"))
    shutil.copyfile(core_jar, os.path.join(libs, f"blockdesigner-core-{app}.jar"))
    for p, s2, _ in edits:
        write(p, s2)
    write(notes_path, nl.join(section) + notes)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("app_version", nargs="?", help="BlockDesigner version whose API jars to use (default: the main repo's)")
    ap.add_argument("--repos-dir", default=os.path.dirname(MAIN))
    ap.add_argument("--only", default="", help="comma-separated repo names (with or without BlockDesigner-)")
    ap.add_argument("--exclude", default="", help="comma-separated repo names to leave alone")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--allow-older", action="store_true", help="allow moving a repo to an older API version")
    a = ap.parse_args()

    app =a.app_version or main_version()
    if not re.fullmatch(V, app):
        sys.exit(f"'{app}' isn't an x.y.z version")
    api_jar = os.path.join(MAIN, "plugin-api", "build", "libs", f"blockdesigner-plugin-api-{app}.jar")
    core_jar = os.path.join(MAIN, "core", "build", "libs", f"core-{app}.jar")
    for j in (api_jar, core_jar):
        if not os.path.isfile(j):
            sys.exit(f"Missing {j}: build it in the main repo (./gradlew :plugin-api:jar :core:jar) at version {app}")

    split = lambda s: {x.strip() for x in s.split(",") if x.strip()}
    repos = discover(a.repos_dir, split(a.only), split(a.exclude))
    if not repos:
        sys.exit("No plugin repos found")
    print(f"API jars from BlockDesigner {app}; repos: {', '.join(os.path.basename(r) for r in repos)}\n")
    ok = [bump(d, app, api_jar, core_jar, a.dry_run, a.allow_older) for d in repos]
    print()
    if a.dry_run:
        print("dry run: nothing changed")
    else:
        print("Next, in each changed repo: ./gradlew jar test, review git diff, then commit / tag / push / publish "
              "only when the user asked (see SKILL.md).")
    if not all(ok):
        sys.exit(1)


if __name__ == "__main__":
    main()
