"""Refresh this marketplace from where the skills are actually edited.

    python sync.py              copy my own skills in from their home folders
    python sync.py --upstream   also pin the third-party plugins to their repos' latest commit
    python sync.py --dry-run    show what would change

My own skills live next to the projects they belong to (and are often git-ignored there), so
this repo is also their backup. Third-party skills aren't copied: marketplace.json points at
their original repos, pinned to a commit.
"""
import argparse
import filecmp
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPOS = Path("F:/PROGRAMMING/REPOS")
HOME = Path.home()

# plugin -> [(source folder, skill name in the plugin)]
SOURCES = {
    "blockdesigner": [
        (REPOS / "BlockDesigner/.claude/skills/blockdesigner-release", "blockdesigner-release"),
        (REPOS / "BlockDesigner/.claude/skills/blockdesigner-plugin-release", "blockdesigner-plugin-release"),
        (REPOS / "BlockDesigner/.claude/skills/blockdesigner-plugin-new", "blockdesigner-plugin-new"),
    ],
    "claude-agent-viewer": [
        (REPOS / "Claude Agent Viewer/.claude/skills/release", "release"),
    ],
    "operant": [
        (REPOS / "Operant/.claude/skills/release", "release"),
        (HOME / ".claude/skills/operant", "operant"),
    ],
    "voxel-icons": [
        (HOME / ".claude/skills/voxel-icons", "voxel-icons"),
    ],
    "core": [
        (HOME / ".claude/skills/team-work", "team-work"),
        (HOME / ".claude/skills/ui-change", "ui-change"),
        (HOME / ".claude/skills/minecraft-test-setup", "minecraft-test-setup"),
        (HOME / ".claude/skills/desktop-app-baseline", "desktop-app-baseline"),
        (HOME / ".claude/skills/repo-release", "repo-release"),
        (HOME / ".claude/skills/plain-writing", "plain-writing"),
    ],
    "design": [
        (HOME / ".claude/skills/ui-critique", "ui-critique"),
        (HOME / ".claude/skills/ui-foundations", "ui-foundations"),
    ],
    "minecraft-mod-dev": [
        (HOME / ".claude/skills/Minecraft Mod Dev", "minecraft-mod-dev"),
    ],
}
JUNK = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "Thumbs.db")


def differs(a: Path, b: Path) -> bool:
    if not b.exists():
        return True
    c = filecmp.dircmp(a, b, ignore=["__pycache__"])
    stack = [c]
    while stack:
        d = stack.pop()
        if d.left_only or d.right_only or d.diff_files or d.funny_files:
            return True
        stack.extend(d.subdirs.values())
    return False


def sync_own(dry: bool) -> int:
    changed = 0
    for plugin, skills in SOURCES.items():
        for src, name in skills:
            dest = ROOT / "plugins" / plugin / "skills" / name
            if not (src / "SKILL.md").exists():
                print(f"  skip  {plugin}/{name}: no SKILL.md at {src}")
                continue
            if not differs(src, dest):
                continue
            changed += 1
            print(f"  {'would update' if dry else 'update'}  {plugin}/{name}  <-  {src}")
            if not dry:
                shutil.rmtree(dest, ignore_errors=True)
                shutil.copytree(src, dest, ignore=JUNK)
    return changed


def sync_upstream(dry: bool) -> int:
    path = ROOT / ".claude-plugin/marketplace.json"
    market = json.loads(path.read_text(encoding="utf8"))
    changed = 0
    for p in market["plugins"]:
        src = p.get("source")
        if not isinstance(src, dict) or "url" not in src:
            continue
        out = subprocess.run(["git", "ls-remote", src["url"], src.get("ref", "HEAD")],
                             capture_output=True, text=True, check=True).stdout.split()
        if out and out[0] != src.get("sha"):
            changed += 1
            print(f"  {'would pin' if dry else 'pin'}  {p['name']}  {src.get('sha', '')[:8]} -> {out[0][:8]}")
            src["sha"] = out[0]
    if changed and not dry:
        path.write_text(json.dumps(market, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--upstream", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    n = sync_own(a.dry_run)
    if a.upstream:
        n += sync_upstream(a.dry_run)
    print(f"{n} change(s)" + (" (dry run)" if a.dry_run else ""))
    if n and not a.dry_run:
        print("Now: claude plugin validate . && git add -A && git commit && git push")


if __name__ == "__main__":
    sys.exit(main())
