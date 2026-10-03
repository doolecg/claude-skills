---
name: minecraft-test-setup
description: Set up and drive Minecraft dev clients and servers for the user's mods (Fabric, NeoForge, Architectury, Paper; 1.21.x and 26.x) the way they want, and test or screenshot without stealing window focus. Use for "run the mod", "test client", "dev server", "runClient", "runServer", "screenshot the mod", "set up a test world", "self-test", "demo scene", "install shaders for screenshots".
---

# Minecraft test setup

The user's standing rules for every dev run (also in their global CLAUDE.md). Do all of this BEFORE launching and
keep it in place. Scripts are in `scripts/` next to this file (`<skill>` = this folder). Python 3 and Git Bash.

## Setup checklist

1. **Find the run folder** (`<module>/run`, e.g. `fabric/run`, `paper/run`) and the MC version
   (`minecraft_version` in gradle.properties).
2. **Client options:** `python <skill>/scripts/seed_config.py client <run>` sets every `soundCategory_*` to 0.5,
   `guiScale:2`, `pauseOnLostFocus:false`, `tutorialStep:none`. Other lines are kept.
3. **Server properties:** `python <skill>/scripts/seed_config.py server <run>` sets `difficulty=peaceful`,
   `gamemode=creative`, `force-gamemode=true`, `white-list=false`, `enforce-whitelist=false`. For a headless server
   also `... eula <run>`.
4. **Window 1920x1080:** loom `programArgs '--width','1920','--height','1080'` in the client run config (or pass
   `--args="--width 1920 --height 1080"`). Every test run.
5. **Make it permanent in the build** so the IDE and `./gradlew` runs get it too: paste
   `templates/dev-run-seeding.gradle` into the root build.gradle if the project lacks it (seeds before
   runServer/runClient and after ideaSyncTask). If the project has no such seeding, add it and say so.
6. **Test world:** peaceful, creative, commands allowed. For a new or copied save close the game, then
   `python <skill>/scripts/nbt.py set-test-world <run>/saves/<world> [LevelName]`. It sets `GameType 1`,
   `allowCommands 1` and peaceful (old `Difficulty` byte, or `difficulty_settings.difficulty` on 26.x). Read back
   with `python <skill>/scripts/nbt.py show <level.dat>`. New worlds created in the game UI: creative, commands on,
   peaceful, or copy a prepared save.
7. **Screen grabs only:** install the look into the run folder (never the mod build):
   `python <skill>/scripts/install_visuals.py <run> <mc version> fabric|neoforge`.
8. **Focus guard:** start `scripts/background.ps1` as a background process before the game (see Focus below).
9. **Launch** (record the PID), then check the log: `Loading N mods` with the expected N, no mod-load errors.
   Fabric/NeoForge: `./gradlew :<module>:runClient` / `runServer`. Paper: `./gradlew :paper:runServer`.
   In Operant use `operant run "<cmd>"` then `operant wait <id> --errors`; set `OPERANT_BACKGROUND=1`.
10. **Clean up:** stop only the PIDs you started; remove temp files you made. Do not touch another run folder.

Never modify a run folder the user did not ask about; test scripts on a scratchpad copy first.

## Focus (never steal the user's window)

Run `powershell -NoProfile -ExecutionPolicy Bypass -File "<skill>/scripts/background.ps1"` in the background before
launching. It sends a new `Minecraft*` window to the bottom and gives focus back; it exits after 6 minutes. Details
in `references/screenshots.md`. Even so, the game can briefly take focus at launch, so stray input can open
screens: do not rely on simulated keys without logging the open screen. `pauseOnLostFocus:false` is already seeded.

## Screenshots

Use the env-gated in-mod driver, not F2 or clicking: copy `templates/ClientShots.java` into the mod, call its
`tick` from the client tick, set the shots list (a `tp` per shot, optional `setScreen`), run with
`MODID_CLIENT_SHOTS=1 ./gradlew :fabric:runClient --args="--quickPlaySingleplayer <world>"`, and wait for the
"done" log line. Shots land in `<run>/screenshots/`. Always: Bare Bones + Complementary Reimagined (step 7), 1920x1080,
GUI scale 2. Build a repeatable scene with a datapack:
`python <skill>/scripts/make_datapack.py <save dir> <pack name> <commands.mcfunction> <mc jar>` (rebuilds on every
world load via the `minecraft:load` tag; pack format taken from the jar's version.json). Then Read the PNGs to check
them and send them to the user with SendUserFile (they are often remote). When fixing a UI, shoot before and after.
Full detail: `references/screenshots.md`.

## Self-tests

For logic that needs a running world, write an env-gated server self-test (`templates/ServerSelfTest.java`):
`MODID_SELFTEST=<mode>` starts it, `MODID_SELFTEST_QUIT=1` stops the server afterwards, results to a file plus the log.
Drive steps from the mod's server tick, one pass per tick. Never re-queue a step on the server thread with
`server.execute` (starves chunk and light loading). Headless run: seed eula and server.properties, then
`./gradlew :<module>:runServer`. Detail: `references/self-tests.md`.

## Shader and pack install

`scripts/install_visuals.py` queries the Modrinth API for the exact MC version and loader: Iris, the exact Sodium
version Iris lists as a required dependency, Complementary Reimagined (shaderpacks/), Bare Bones (resourcepacks/,
latest build if none is tagged for the version, listed in options.txt `resourcePacks` and
`incompatibleResourcePacks`), and `config/iris.properties` with `enableShaders=true` and `shaderPack=<zip>`. All
in the run folder only; never add them to the mod's dependencies or jar. Rerun-safe. Paper has no client, skip it.
If Iris has no build for the version, shots use Bare Bones without shaders; say so.

## Pitfalls (short list; full list in `references/pitfalls.md`)

- Loom `runClient` finishing with exit code 1 / "BUILD FAILED, exit -8" after you close the game is the shutdown
  watchdog, not a crash. Check the game log.
- `mv x mods` into an existing `mods/` nests it; use `cp file mods/`. Confirm `Loading N mods` in the log.
- 26.3 servers default the whitelist on; seed it off.
- Operant tiles run PowerShell: set env inline, `$env:VAR='1'; ./gradlew ...`.
- Stop processes by PID, never by name (`java` belongs to other things too).
- Reading 26.x APIs: `javap` from `~/.jdks/temurin-26.0.2.1/bin` on the Loom merged jar, NeoForge sources jar in the
  Gradle cache (`references/reading-apis.md`).
- IntelliJ run configs (module name with underscores, JDK) need fix-ups after ideaSyncTask: `references/pitfalls.md`.
- The project's two IntelliJ run configurations (Main Run, Dev Run in `.run/*.run.xml`) must keep working after any
  change to how the app starts.

## Files

- `scripts/seed_config.py` options.txt, server.properties, eula.txt seeding (extra `key=value` args override).
- `scripts/nbt.py` gzip NBT read/write, `set-test-world`, `show`.
- `scripts/install_visuals.py` Iris, Sodium, Complementary, Bare Bones into a run folder.
- `scripts/make_datapack.py` load-time demo scene datapack.
- `scripts/background.ps1` focus guard.
- `templates/ClientShots.java`, `templates/ServerSelfTest.java`, `templates/dev-run-seeding.gradle`.
- `references/screenshots.md`, `self-tests.md`, `pitfalls.md`, `reading-apis.md`.
