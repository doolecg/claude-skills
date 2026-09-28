"""Isometric voxel icons in the BlockDesigner style: three-tone faces, navy edges, drawn large and downscaled.

A drawing is a list of boxes in back-to-front order (see by_depth). Coordinates: +x goes right-down, +z goes left-down,
+y goes up; a voxel is a 1x1x1 box. Face colours are (top, left (+z), right (+x)) RGB triples.

    from voxel import BLUE, ORANGE, voxel, by_depth, save_all
    cells = [voxel(x, y, z, BLUE) for x in range(3) for y in range(3) for z in range(3)]
    save_all(by_depth(cells), png={"logo.png": 160}, ico="app.ico")

Needs Pillow.
"""
import math
import os

from PIL import Image, ImageDraw

BIG = 1024

# Face colours: top, left (+z), right (+x). BLUE is BlockDesigner's accent (#7c9cff) family.
BLUE = ((178, 196, 255), (124, 156, 255), (84, 108, 214))
ORANGE = ((255, 206, 128), (255, 159, 46), (214, 118, 20))
VIOLET = ((208, 184, 255), (160, 128, 250), (118, 88, 208))
PINK = ((255, 186, 222), (246, 128, 186), (204, 86, 146))
GREEN = ((178, 234, 156), (116, 196, 100), (74, 150, 64))
WATER = ((150, 214, 255), (96, 172, 240), (60, 128, 200))
PAPER = ((246, 247, 255), (226, 230, 250), (180, 188, 226))
EDGE = (28, 38, 84, 255)


def faces(rgb, light=0.45, dark=0.16):
    """Three face colours from one base colour (the left face): a lighter top, a darker right."""
    top = tuple(round(c + (255 - c) * light) for c in rgb)
    right = tuple(round(c * (1 - dark)) for c in rgb)
    return top, tuple(rgb), right


def mix(a, b, t):
    """Face colours between a and b, t from 0 to 1."""
    return tuple(tuple(round(ca + (cb - ca) * t) for ca, cb in zip(fa, fb)) for fa, fb in zip(a, b))


def project(x, y, z, s, ox, oy):
    """Isometric: +x goes right-down, +z goes left-down, +y goes up."""
    c, k = math.cos(math.radians(30)), math.sin(math.radians(30))
    return ox + (x - z) * c * s, oy + (x + z) * k * s - y * s


class Box:
    """A box from (x, y, z) of size (w, h, d), with its three visible faces' colours and, optionally, a picture drawn
    on its +z (left) face: a function (draw, at, edge_w) where at(u, v) maps face coordinates (u 0..1 along x, v 0..1
    up) to the image."""

    def __init__(self, x, y, z, w, h, d, colours, picture=None):
        self.x, self.y, self.z, self.w, self.h, self.d = x, y, z, w, h, d
        self.colours, self.picture = colours, picture


def voxel(x, y, z, colours):
    return Box(x, y, z, 1, 1, 1, colours)


def space(x, y, z, w, h, d):
    """An invisible box: drawn as nothing, but the drawing is fitted to include it (room around a shape)."""
    return Box(x, y, z, w, h, d, None)


def by_depth(boxes):
    """Back to front for boxes on a grid."""
    return sorted(boxes, key=lambda b: (b.x + b.y + b.z, b.y))


def draw_box(draw, b, s, ox, oy, edge_w):
    if b.colours is None:
        return
    p = lambda a, c, e: project(a, c, e, s, ox, oy)
    x0, y0, z0, x1, y1, z1 = b.x, b.y, b.z, b.x + b.w, b.y + b.h, b.z + b.d
    top = [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)]
    left = [p(x0, y1, z1), p(x1, y1, z1), p(x1, y0, z1), p(x0, y0, z1)]
    right = [p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1), p(x1, y0, z0)]
    for poly, col in ((top, b.colours[0]), (left, b.colours[1]), (right, b.colours[2])):
        draw.polygon(poly, fill=col + (255,))
    if b.picture:
        b.picture(draw, lambda u, v: p(x0 + u * b.w, y0 + v * b.h, z1), edge_w)
    for poly in (top, left, right):
        draw.line(poly + [poly[0]], fill=EDGE, width=edge_w, joint="curve")


def render(boxes, size_px=BIG, edge=90):
    """Draws the boxes (already back to front) on a transparent square, fitted to the drawing's own bounds with a 4%
    margin. Edges are size_px / edge wide (at least 2 px): 90 suits a 3x3x3 block, about 55 a 2x2x2 one."""
    pts = [project(x, y, z, 1, 0, 0) for b in boxes
           for x in (b.x, b.x + b.w) for y in (b.y, b.y + b.h) for z in (b.z, b.z + b.d)]
    minx, maxx = min(q[0] for q in pts), max(q[0] for q in pts)
    miny, maxy = min(q[1] for q in pts), max(q[1] for q in pts)
    margin = 0.04 * size_px
    s = (size_px - 2 * margin) / max(maxx - minx, maxy - miny)
    ox = size_px / 2 - (minx + maxx) / 2 * s
    oy = size_px / 2 - (miny + maxy) / 2 * s
    img = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w = max(2, round(size_px / edge))
    for b in boxes:
        draw_box(d, b, s, ox, oy, w)
    return img


def sized(drawing, target, edge=90, from_big=False):
    """The drawing at target px: drawn 4x (or at 1024 from 256 up, or always with from_big) and downscaled. drawing is a list of boxes, or a
    function of the target size returning one (to draw a simpler shape at small sizes); edge may be one too."""
    boxes = drawing(target) if callable(drawing) else drawing
    big = render(boxes, target * 4 if target < 256 and not from_big else BIG, edge(target) if callable(edge) else edge)
    return big if big.width == target else big.resize((target, target), Image.LANCZOS)


ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def save_all(drawing, png=None, ico=None, icns=None, edge=90, from_big=False):
    """Writes the drawing: png maps a path to its size ({"logo.png": 160, "logo-1024.png": 1024}), ico is a Windows
    .ico path (16-256 px), icns a macOS .icns path. Folders are created; returns the paths written."""
    written = []
    for path, px in (png or {}).items():
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        sized(drawing, px, edge, from_big).save(path)
        written.append(path)
    if ico:
        os.makedirs(os.path.dirname(os.path.abspath(ico)), exist_ok=True)
        frames = [sized(drawing, px, edge, from_big) for px in ICO_SIZES]
        frames[-1].save(ico, sizes=[(px, px) for px in ICO_SIZES], append_images=frames[:-1])
        written.append(ico)
    if icns:
        os.makedirs(os.path.dirname(os.path.abspath(icns)), exist_ok=True)
        sized(drawing, 1024, edge, from_big).save(icns)
        written.append(icns)
    return written
