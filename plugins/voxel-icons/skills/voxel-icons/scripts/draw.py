"""Renders the icons an icon file describes.

    python draw.py <icon file> [--only NAME[,NAME]] [--preview DIR]

An icon file is a Python file in the project (e.g. packaging/icon.py) that imports from voxel (this folder is put on the
path) and defines ICONS, a list of dicts:

    name     what to call it (for --only and --preview)
    drawing  a list of boxes, back to front, or a function of the size in px returning one
    png      {path: size}, e.g. {"docs/images/logo.png": 160, "docs/images/logo-1024.png": 1024}
    ico      a Windows .ico path (16-256 px)
    icns     a macOS .icns path
    edge     edge width divisor (default 90; about 55 for a 2x2x2 block), or a function of the size in px
    from_big every size shrunk from the 1024 px drawing (default: sizes under 256 are drawn at 4x, which keeps edges
             crisper when small)
    requires a folder that must exist, or the icon is skipped (e.g. "../../BlockDesigner-Foo" for another checkout)

Paths are relative to the icon file's folder unless absolute. --preview writes each icon at 256 px as
DIR/<name>.png instead, and touches nothing in the project.
"""
import argparse
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from voxel import sized, save_all  # noqa: E402


def load(path):
    spec = importlib.util.spec_from_file_location("icon_file", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not isinstance(getattr(mod, "ICONS", None), list):
        sys.exit(f"{path} has no ICONS list")
    return mod.ICONS


def main():
    ap = argparse.ArgumentParser(description="Render the voxel icons an icon file describes.")
    ap.add_argument("icon_file")
    ap.add_argument("--only", help="comma-separated names")
    ap.add_argument("--preview", metavar="DIR", help="write <name>.png at 256 px there instead of the real outputs")
    a = ap.parse_args()

    path = os.path.abspath(a.icon_file)
    base = os.path.dirname(path)
    icons = load(path)
    only = {n.strip() for n in a.only.split(",")} if a.only else None
    if only:
        unknown = only - {i["name"] for i in icons}
        if unknown:
            sys.exit("no icon named " + ", ".join(sorted(unknown)) + "; there are " + ", ".join(i["name"] for i in icons))

    at = lambda p: p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p))
    for icon in icons:
        if only and icon["name"] not in only:
            continue
        edge = icon.get("edge", 90)
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            out = os.path.join(a.preview, icon["name"] + ".png")
            sized(icon["drawing"], 256, edge, icon.get("from_big", False)).save(out)
            print("preview", out)
            continue
        if icon.get("requires") and not os.path.isdir(at(icon["requires"])):
            print("skipped", icon["name"], "(no", at(icon["requires"]) + ")")
            continue
        png = {at(p): px for p, px in icon.get("png", {}).items()}
        ico = at(icon["ico"]) if icon.get("ico") else None
        icns = at(icon["icns"]) if icon.get("icns") else None
        for w in save_all(icon["drawing"], png, ico, icns, edge, icon.get("from_big", False)):
            print("wrote", w)


if __name__ == "__main__":
    main()
