"""Create a new BlockDesigner plugin repository from the template (a sibling of the main repo, never inside it).

    python new_plugin.py --name "Block Counter" --package io.blockdesigner.blockcounter --api 5 \
        --description "Counts blocks by kind." --tagline "Counts the blocks in a build by kind." [--dry-run]

Optional: --id block-counter  --class BlockCounterPlugin  --repo BlockDesigner-BlockCounter  --author BlockDesigner
          --app-version 0.4.22  --plan (adds docs/plan.md)  --repos-dir F:/PROGRAMMING/REPOS

What it does (nothing else: no git, no GitHub, no build):
  - makes <repos-dir>/<repo> (refuses if it exists) with the template's files, placeholders filled in;
  - copies the API jars from the main repo's build output into libs/, the core jar renamed
    blockdesigner-core-<appver>.jar (build them first: ./gradlew :plugin-api:jar :core:jar in the main repo);
  - copies the Gradle wrapper (gradlew, gradlew.bat, gradle/wrapper) from the main repo;
  - copies the main repo's generic plugin logo to docs/images/logo.png as a stand-in until the plugin has its own.
"""
import argparse
import datetime
import io
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(os.path.dirname(HERE), "assets", "template")
MAIN = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))  # .claude/skills/<skill>/scripts -> repo root

# The first BlockDesigner version with each plugin API level (from RELEASE_NOTES.md / PluginApi.java).
MIN_APP = {1: "0.3.0", 2: "0.4.4", 3: "0.4.12", 4: "0.4.14", 5: "0.4.17"}

# Template file -> path in the new repo. The main class and test move into the package folder.
RENAMES = {"gitignore": ".gitignore", "gitattributes": ".gitattributes"}


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def app_version():
    s = read(os.path.join(MAIN, "build.gradle.kts"))
    m = re.search(r'(?m)^\s*version\s*=\s*"([^"]+)"', s)  # indented inside subprojects { }
    if not m:
        sys.exit("Can't find version in the main repo's build.gradle.kts")
    return m.group(1)


def pascal(name):
    return "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]+", name) if w)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True, help='Display name, e.g. "Block Counter"')
    ap.add_argument("--package", required=True, help="Java package, e.g. io.blockdesigner.blockcounter")
    ap.add_argument("--api", type=int, required=True, help="Lowest plugin API level whose features it uses (1-5)")
    ap.add_argument("--description", required=True, help="One or two sentences for the manifest")
    ap.add_argument("--tagline", help="One line under the README title (defaults to the description)")
    ap.add_argument("--id")
    ap.add_argument("--class", dest="cls")
    ap.add_argument("--repo")
    ap.add_argument("--author", default="BlockDesigner")
    ap.add_argument("--app-version")
    ap.add_argument("--plan", action="store_true", help="add docs/plan.md (for bigger plugins)")
    ap.add_argument("--repos-dir", default=os.path.dirname(MAIN))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if a.api not in MIN_APP:
        sys.exit(f"--api must be one of {sorted(MIN_APP)}")
    if not re.fullmatch(r"[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+", a.package):
        sys.exit("--package must be a lower-case Java package with at least two parts")
    pid = a.id or re.sub(r"[^a-z0-9]+", "-", a.name.lower()).strip("-")
    if not re.fullmatch(r"[a-z0-9_.-]+", pid):
        sys.exit(f"Plugin id '{pid}' must use a-z, 0-9, _ . -")
    cls = a.cls or pascal(a.name) + "Plugin"
    repo = a.repo or "BlockDesigner-" + pascal(a.name)
    appver = a.app_version or app_version()
    dest = os.path.join(a.repos_dir, repo)
    if os.path.abspath(dest).startswith(MAIN + os.sep) or os.path.abspath(dest) == MAIN:
        sys.exit("Plugins never go inside the main BlockDesigner repository")
    if os.path.exists(dest):
        sys.exit(f"{dest} already exists")

    api_jar = os.path.join(MAIN, "plugin-api", "build", "libs", f"blockdesigner-plugin-api-{appver}.jar")
    core_jar = os.path.join(MAIN, "core", "build", "libs", f"core-{appver}.jar")
    for j in (api_jar, core_jar):
        if not os.path.isfile(j):
            sys.exit(f"Missing {j}: run ./gradlew :plugin-api:jar :core:jar in the main repo first")

    values = {
        "NAME": a.name, "ID": pid, "CLASS": cls, "PACKAGE": a.package, "REPO": repo, "API": str(a.api),
        "MIN_APP": MIN_APP[a.api], "APP_VERSION": appver, "AUTHOR": a.author,
        "DESCRIPTION": a.description, "TAGLINE": a.tagline or a.description,
        "YEAR": str(datetime.date.today().year), "DATE": datetime.date.today().isoformat(),
    }

    def fill(text, json_file):
        def sub(m):
            v = values[m.group(1)]
            return json.dumps(v)[1:-1] if json_file else v  # escape quotes and backslashes inside JSON strings
        out = re.sub(r"\{\{([A-Z_]+)\}\}", sub, text)
        left = re.findall(r"\{\{[A-Z_]+\}\}", out)
        if left:
            sys.exit(f"Unfilled placeholders {left}")
        return out

    pkg_dir = a.package.replace(".", "/")
    plan = []  # (target, content or source path, is_copy)
    for dirpath, _dirs, files in os.walk(TEMPLATE):
        for f in files:
            src = os.path.join(dirpath, f)
            rel = os.path.relpath(src, TEMPLATE).replace(os.sep, "/")
            if rel == "docs/plan.md" and not a.plan:
                continue
            if rel == "src/main/java/Plugin.java.tmpl":
                rel = f"src/main/java/{pkg_dir}/{cls}.java"
            elif rel == "src/test/java/ManifestTest.java.tmpl":
                rel = f"src/test/java/{pkg_dir}/ManifestTest.java"
            rel = RENAMES.get(rel, rel)
            plan.append((rel, fill(read(src), rel.endswith(".json")), False))
    plan.append((f"libs/blockdesigner-plugin-api-{appver}.jar", api_jar, True))
    plan.append((f"libs/blockdesigner-core-{appver}.jar", core_jar, True))
    for w in ("gradlew", "gradlew.bat", "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties"):
        plan.append((w, os.path.join(MAIN, w), True))
    logo = os.path.join(MAIN, "docs", "images", "plugin-logo.png")
    if os.path.isfile(logo):
        plan.append(("docs/images/logo.png", logo, True))

    print(f"repo      : {dest}")
    print(f"plugin    : {a.name} (id {pid}, main {a.package}.{cls}, api {a.api}, needs BlockDesigner {MIN_APP[a.api]})")
    print(f"API jars  : from BlockDesigner {appver}")
    for rel, _, copy in sorted(plan):
        print(("  copy  " if copy else "  write ") + rel)
    if a.dry_run:
        print("dry run: nothing written")
        return
    for rel, content, copy in plan:
        target = os.path.join(dest, rel)
        if copy:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(content, target)
        else:
            write(target, content)
    print("done. Next: git init -b main, ./gradlew jar test, then fill in README / RELEASE_NOTES / the code.")


if __name__ == "__main__":
    main()
