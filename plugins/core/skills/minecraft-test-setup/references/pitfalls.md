# Pitfalls and known noise

- **Loom `runClient` ends with exit code 1 / "BUILD FAILED, exit -8" after the game closes.** That is the shutdown
  watchdog, not a crash. Judge by the game log (`run/logs/latest.log`), not the Gradle exit code.
- **`mv x mods` into an existing `mods/` nests it** (`mods/x/...`) and the jars are silently not loaded. Use
  `cp file mods/` or `mv x/* mods/`. After launch the log must say `Loading N mods` with the expected N.
- **Whitelist:** 26.3 defaults `white-list=true`; a fresh dev server locks everyone out. Always seed it.
- **Focus loss pauses singleplayer.** A background client that loses focus opens the pause menu and stalls
  self-tests: `pauseOnLostFocus:false` in options.txt.
- **Stray input.** Even backgrounded, a window can take focus at launch; keys/mouse then open screens (Options, mod
  menus). Log `mc.gui.screen()` (26.x) at each step of key-driven tests and rerun if a screen was open. Simulate a
  key press with `KeyMapping.click(InputConstants.getKey(km.saveString()))` once the key is bound in options.txt.
- **Self-test deadlock:** never re-queue a step with `server.execute` from a server-thread task; it starves the
  chunk/light task loop. Poll a condition once per server tick instead (templates/ServerSelfTest.java).
- **26.x API changes seen:** `Options.hideGui` is gone (toggle F1 via `keyToggleGui`); level time/weather setters are
  gone, so send `time set` / `weather` through the command dispatcher (`connection.sendCommand` on the client,
  `server.getCommands().performPrefixedCommand` on the server); difficulty in level.dat is under
  `difficulty_settings`; datapack `pack.mcmeta` uses `min_format`/`max_format`; the function folder is `function`
  (singular) since 1.21, `functions` before.
- **Operant tiles run PowerShell:** pass env inline, `$env:MODID_CLIENT_SHOTS='1'; ./gradlew ...`. A bash-style
  `VAR=1 cmd` prefix fails there, and env set outside the tile does not reach the game. In Git Bash, `VAR=1 ./gradlew`
  works. Run Operant itself with `OPERANT_BACKGROUND=1`.
- **Stop only what you started, by PID.** Capture the PID when launching (`$!` in bash, `Start-Process -PassThru`).
  Never `taskkill /im java.exe` or `Stop-Process -Name java`.
- **Iris/Sodium need a build for that exact MC version.** If none exists (new snapshot), shots fall back to plain
  Bare Bones without shaders; say so.
- **IntelliJ run configs from Loom** (`.idea/runConfigurations`): Loom writes the Gradle module name
  (`Proj.mc-1.21.1.fabric.main`) but IntelliJ turns dots in `mc-<version>` into underscores, so the config points at a
  missing module; and with no JDK set IntelliJ picks its own (21 for a 26.3 build that needs 25). Fix in an
  `ideaSyncTask` doLast: replace the module name and insert `ALTERNATIVE_JRE_PATH_ENABLED` /
  `ALTERNATIVE_JRE_PATH` from `project.javaToolchains.launcherFor`. Working code: BlockCompanion's root build.gradle.
- level.dat of a world is only read at world load and rewritten when the game closes: run
  `nbt.py set-test-world` while the game is closed.
