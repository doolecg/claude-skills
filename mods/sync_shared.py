"""Copy the shared services library into the mods that use it.

    python mods/sync_shared.py            copy _shared/lib/*.ts into mods/<mod>/hooks/lib/
    python mods/sync_shared.py --check    report mods whose copy has drifted (exit 1), change nothing

Mods are independent, so each carries its own copy; edit it here, never in a mod.
"""
import argparse
import filecmp
import shutil
import sys
from pathlib import Path

MODS = Path(__file__).resolve().parent
SOURCE = MODS / "_shared" / "lib"
CONSUMERS = ["prompt-enhancer", "agents-panel", "session-learner"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report drift, copy nothing")
    check = parser.parse_args().check

    drifted = 0
    for mod in CONSUMERS:
        target = MODS / mod / "hooks" / "lib"
        for source in sorted(SOURCE.glob("*.ts")):
            copy = target / source.name
            if copy.exists() and filecmp.cmp(source, copy, shallow=False):
                continue
            drifted += 1
            state = "missing" if not copy.exists() else "differs"
            if check:
                print(f"{mod}/hooks/lib/{source.name}: {state}")
            else:
                target.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, copy)
                print(f"{mod}/hooks/lib/{source.name}: copied ({state})")
    if not drifted:
        print("all copies match")
    return 1 if check and drifted else 0


if __name__ == "__main__":
    sys.exit(main())
