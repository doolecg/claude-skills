#!/usr/bin/env python3
"""Seed the user's test settings into a run folder, keeping every other line.

  seed_config.py client <run dir>   options.txt: sound 0.5, guiScale 2, pauseOnLostFocus false, tutorial off
  seed_config.py server <run dir>   server.properties: peaceful, creative, force-gamemode, whitelist off
  seed_config.py eula <run dir>     eula.txt with eula=true (headless server runs)
Extra key=value pairs after the dir are added or override: seed_config.py client run overrideWidth=1920
"""
import os, sys

SOUND = ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui']
CLIENT = {'guiScale': '2', 'pauseOnLostFocus': 'false', 'tutorialStep': 'none'}
CLIENT.update({'soundCategory_' + s: '0.5' for s in SOUND})
SERVER = {'white-list': 'false', 'enforce-whitelist': 'false', 'difficulty': 'peaceful',
          'gamemode': 'creative', 'force-gamemode': 'true'}


def seed(path, wanted, sep):
    lines = open(path, encoding='utf-8').read().splitlines() if os.path.exists(path) else []
    wanted = dict(wanted)
    out = []
    for line in lines:
        key = line.split(sep, 1)[0].strip() if sep in line and not line.startswith('#') else None
        out.append(f'{key}{sep}{wanted.pop(key)}' if key in wanted else line)
    out += [f'{k}{sep}{v}' for k, v in wanted.items()]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out) + '\n')


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ('client', 'server', 'eula'):
        sys.exit(__doc__)
    kind, run = sys.argv[1], sys.argv[2]
    extra = dict(a.split('=', 1) for a in sys.argv[3:] if '=' in a)
    if kind == 'client':
        seed(os.path.join(run, 'options.txt'), {**CLIENT, **extra}, ':')
    elif kind == 'server':
        seed(os.path.join(run, 'server.properties'), {**SERVER, **extra}, '=')
    else:
        seed(os.path.join(run, 'eula.txt'), {'eula': 'true'}, '=')
    print('seeded', kind, run)


main()
