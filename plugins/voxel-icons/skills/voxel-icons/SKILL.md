---
name: voxel-icons
description: Draw app icons, plugin logos and mod icons as isometric voxel art in the BlockDesigner house style (three-tone faces, navy edges, an orange voxel hovering as if being placed), and write every size a project needs (PNG sizes, Windows .ico, macOS .icns) from one small icon file kept in the project. Use this whenever the user wants an icon or logo made, redrawn, resized or regenerated for any project (a desktop app, a BlockDesigner plugin, a Minecraft mod's icon.png, a README logo), says "make an icon", "draw a logo", "new logo for X", "regenerate the icons", "the icon maker", or asks to change the BlockDesigner icon or a plugin's logo.
---

# Voxel icons

Icons here are small isometric voxel scenes, drawn large and downscaled so every size is crisp. The drawing code lives
in this skill; each project keeps only an **icon file** that says what its icons look like and where they go. Run
everything with the `scripts/` folder of this skill's base directory (shown when the skill loads); below it's
`<skill>/scripts`. Needs Python with Pillow (`pip install pillow`).

```bash
python <skill>/scripts/draw.py <icon file>                      # write every icon it lists
python <skill>/scripts/draw.py <icon file> --only app            # just some (comma-separated names)
python <skill>/scripts/draw.py <icon file> --preview <scratch>   # <name>.png at 256 px, project untouched
```

## The icon file

A Python file in the project, next to what it draws (`packaging/icon.py` for an app, `docs/images/logo.py` for a repo
logo, `tools/icon.py` for a mod). It imports from `voxel` (draw.py puts it on the path) and defines `ICONS`:

```python
"""<Project>'s icon, drawn by the voxel-icons skill: python <skill>/scripts/draw.py packaging/icon.py"""
from voxel import BLUE, ORANGE, by_depth, voxel

def scene():
    cells = [voxel(x, y, z, BLUE) for x in range(3) for y in range(3) for z in range(3) if (x, y, z) != (2, 2, 2)]
    return by_depth(cells) + [voxel(2, 2.9, 2, ORANGE)]

ICONS = [
    {"name": "app", "drawing": scene(),
     "png": {"src/main/resources/icon-256.png": 256, "docs/images/logo.png": 160},
     "ico": "packaging/app.ico"},
]
```

Keys of each entry (paths are relative to the icon file's folder):

| key | meaning |
|---|---|
| `name` | for `--only` and `--preview` |
| `drawing` | boxes back to front, or a function of the size in px returning them (a simpler shape at small sizes) |
| `png` | `{path: size}` |
| `ico` / `icns` | a Windows .ico (16–256 px) / macOS .icns path |
| `edge` | edge width divisor, default 90 (about 55 for a 2×2×2 block); may be a function of the size |
| `from_big` | shrink every size from the 1024 px drawing (default: sizes under 256 are drawn at 4×, crisper edges when small) |
| `requires` | a folder that must exist or the entry is skipped (another repo's checkout) |

## The `voxel` library (`scripts/voxel.py`)

- Coordinates: +x goes right-down, +z left-down, +y up. `voxel(x, y, z, colours)` is a 1×1×1 box;
  `Box(x, y, z, w, h, d, colours, picture=None)` any size (thin plates, water at 0.75 high, prongs).
- `colours` are the three visible faces (top, left/+z, right/+x). Ready-made: `BLUE` (the BlockDesigner accent),
  `ORANGE`, `VIOLET`, `PINK`, `GREEN`, `WATER`, `PAPER`. `faces((r, g, b))` makes a set from one colour and
  `mix(a, b, t)` blends two sets.
- `picture(draw, at, edge_w)` paints on a box's +z face: `at(u, v)` maps face coordinates (0..1 along x, 0..1 up) to the image.
- `by_depth(boxes)` sorts grid boxes back to front. Put things that must be on top (the hovering voxel) after it.
- The drawing is fitted to its own bounds with a 4% margin. `space(x, y, z, w, h, d)` is an invisible box that keeps
  extra room (the BlockDesigner icon keeps its whole height with the hovering voxel).
- `render`, `sized` and `save_all` are there for one-off scripts.

## Designing one

1. **Look at the family first.** The references are BlockDesigner's `packaging/icon.py` (the app icon) and
   `packaging/plugin_logos.py` (every plugin's logo) in `F:/PROGRAMMING/REPOS/BlockDesigner`. Keep what makes them
   one family: the same palette and edges, a few voxels (a 3×3×3 block or less of detail), and one idea the icon
   shows about what the project does (a bar chart of blocks for Resource Tracker, hills with water for Terrain
   Generator). The orange voxel arriving from above marks BlockDesigner things; another project may use its own accent.
2. **Write the icon file** with the scene as a function and a docstring saying what it shows.
3. **Preview** with `--preview <scratchpad dir>` and look at the PNG (the Read tool shows images). Check it at small
   sizes too: make a 32 px one with a temporary `png` entry pointed at the scratchpad, or give `drawing` a simpler
   shape below 48 px.
4. **Write the real files** with `draw.py <icon file>`, then check `git status` / `git diff --stat` in every repo it
   wrote to: unchanged drawings come out byte-identical, so only the icons you changed should show.
5. Where a project names its icon source (README, build notes, a code comment), point it at the icon file and this skill.

## Where BlockDesigner's go

- `packaging/icon.py` → the window icons (`app/src/main/resources/io/blockdesigner/app/icons/icon-<size>.png`), the
  installer's `packaging/windows/blockdesigner.ico` and `packaging/icon-1024.png`.
- `packaging/plugin_logos.py` → `docs/images/logo.png` (160 px) and `logo-1024.png` in each plugin checkout next to
  the main repo (`../BlockDesigner-<Name>`), plus the generic `docs/images/plugin-logo.png` for plugins without one.
  A new plugin gets `plugin_logo("<Name>", <scene function>)` added to `ICONS`.

Icons written into a repo are ordinary changes: commit them only when the user asks, with the rest of that repo's work.
