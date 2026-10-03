#!/usr/bin/env python3
"""Install the screenshot look into a run folder only: Iris + its Sodium, Complementary Reimagined, Bare Bones.

  install_visuals.py <run dir> <mc version> [fabric|neoforge]

Puts jars in <run>/mods, the shader zip in <run>/shaderpacks, the pack in <run>/resourcepacks; writes
config/iris.properties (enableShaders=true, shaderPack=<zip>) and the options.txt resourcePacks and
incompatibleResourcePacks lines. Safe to rerun. Iris is Fabric (and NeoForge) only; Paper has no client.
Nothing here is ever added to the mod's own build or jar.
"""
import json, os, re, sys, urllib.parse, urllib.request

API = 'https://api.modrinth.com/v2'
UA = {'User-Agent': 'minecraft-test-setup/1.0 (local dev run folder setup)'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def versions(slug, mc, loaders):
    q = urllib.parse.urlencode({'game_versions': json.dumps([mc]), 'loaders': json.dumps(loaders)})
    return json.loads(get(f'{API}/project/{slug}/version?{q}'))


def download(version, dest_dir):
    f = next((x for x in version['files'] if x.get('primary')), version['files'][0])
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, f['filename'])
    if not os.path.exists(path):
        with open(path, 'wb') as out:
            out.write(get(f['url']))
    print('got', path)
    return f['filename']


def set_lines(path, wanted, sep):
    lines = open(path, encoding='utf-8').read().splitlines() if os.path.exists(path) else []
    out = []
    for line in lines:
        k = line.split(sep, 1)[0].strip() if sep in line else None
        out.append(f'{k}{sep}{wanted.pop(k)}' if k in wanted else line)
    out += [f'{k}{sep}{v}' for k, v in wanted.items()]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    run, mc = sys.argv[1], sys.argv[2]
    loader = sys.argv[3] if len(sys.argv) > 3 else 'fabric'

    iris = versions('iris', mc, [loader])
    if not iris:
        sys.exit(f'no Iris build for {mc} on {loader}')
    iris = iris[0]
    download(iris, os.path.join(run, 'mods'))
    # Iris names the exact Sodium version it needs in its dependencies.
    dep = next((d for d in iris['dependencies'] if d['dependency_type'] == 'required' and d.get('version_id')), None)
    if dep:
        sodium = json.loads(get(f"{API}/version/{dep['version_id']}"))
    else:
        sodium = versions('sodium', mc, [loader])[0]
    download(sodium, os.path.join(run, 'mods'))

    shader = versions('complementary-reimagined', mc, ['iris']) or versions('complementary-reimagined', mc, ['optifine'])
    if not shader:
        shader = json.loads(get(f'{API}/project/complementary-reimagined/version'))  # not tagged for this MC: latest
        print('Complementary has no build tagged for', mc, '- using latest')
    shader_zip = download(shader[0], os.path.join(run, 'shaderpacks'))

    # Bare Bones often lags new Minecraft versions: take the exact match, else the latest, and mark it compatible.
    bb = versions('bare-bones', mc, ['minecraft'])
    if not bb:
        bb = json.loads(get(f'{API}/project/bare-bones/version'))
        print('Bare Bones has no build tagged for', mc, '- using latest')
    pack_zip = download(bb[0], os.path.join(run, 'resourcepacks'))

    set_lines(os.path.join(run, 'config', 'iris.properties'),
              {'enableShaders': 'true', 'shaderPack': shader_zip}, '=')
    opts = os.path.join(run, 'options.txt')
    current = {}
    if os.path.exists(opts):
        for line in open(opts, encoding='utf-8').read().splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                current[k] = v
    def merged(key, entry):
        items = [i for i in re.findall(r'"([^"]*)"', current.get(key, '[]'))]
        for e in (entry,):
            if e not in items:
                items.append(e)
        return '[' + ','.join(json.dumps(i) for i in items) + ']'
    entry = 'file/' + pack_zip
    set_lines(opts, {'resourcePacks': merged('resourcePacks', entry),
                     'incompatibleResourcePacks': merged('incompatibleResourcePacks', entry)}, ':')
    print('done; check the log for "Loading N mods" and that mods/ is not nested')


main()
