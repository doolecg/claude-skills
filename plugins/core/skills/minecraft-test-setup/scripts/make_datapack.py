#!/usr/bin/env python3
"""Create a demo-scene datapack that runs a .mcfunction when the world loads.

  make_datapack.py <save dir> <pack name> <commands.mcfunction> <minecraft jar or version.json> [description]

The pack lands in <save dir>/datapacks/<pack name>/ and runs <pack name>:build via the minecraft:load function tag.
pack.mcmeta min_format/max_format come from the jar's version.json pack_version.data_major (26.x and later); for an
older jar with a plain integer pack_version it writes pack_format instead. Rerun to rebuild; the scene rebuilds on
every world load, so keep it idempotent (fill/setblock only).
"""
import json, os, sys, zipfile


def pack_version(src):
    raw = zipfile.ZipFile(src).read('version.json') if src.endswith(('.jar', '.zip')) else open(src, 'rb').read()
    pv = json.loads(raw)['pack_version']
    return pv if isinstance(pv, int) else pv.get('data_major', pv.get('data'))


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    save, name, funcs, src = sys.argv[1:5]
    desc = sys.argv[5] if len(sys.argv) > 5 else name
    v = pack_version(src)
    root = os.path.join(save, 'datapacks', name)
    fdir = os.path.join(root, 'data', name, 'function')
    tdir = os.path.join(root, 'data', 'minecraft', 'tags', 'function')
    os.makedirs(fdir, exist_ok=True)
    os.makedirs(tdir, exist_ok=True)
    with open(funcs, encoding='utf-8') as f:
        body = f.read()
    with open(os.path.join(fdir, 'build.mcfunction'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(body)
    with open(os.path.join(tdir, 'load.json'), 'w') as f:
        json.dump({'values': [name + ':build']}, f)
    pack = {'description': desc}
    # 26.x uses min_format/max_format; very old jars (1.21.x) use pack_format.
    pack.update({'min_format': v, 'max_format': v} if v >= 100 else {'pack_format': v})
    with open(os.path.join(root, 'pack.mcmeta'), 'w') as f:
        json.dump({'pack': pack}, f)
    print('pack at', root, 'format', v)


main()
