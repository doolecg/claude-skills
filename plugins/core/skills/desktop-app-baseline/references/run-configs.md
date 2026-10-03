# Run configurations and test runs

## Rules

- Exactly two files in `.run/`, committed: `Main Run.run.xml` and `Dev Run.run.xml`. No sandbox, lab or extra configs. Check both still work after any change to how the app starts.
- **Main Run** builds and runs the code committed on `main`: delete `build/main-run`, export with `git archive main | tar -x -C build/main-run`, then build and run inside it. The working tree is untouched. It needs a git repo with a `main` branch and at least one commit. `build/` must be git-ignored.
- **Dev Run** builds and runs the working tree.
- Test runs open behind the active window and never take focus. Stop only processes you started, by PID.
- Minecraft mod projects also have run-folder rules in the user's CLAUDE.md; they still use these two configs.

## Gradle (JavaFX, mods, servers)

Reference: `F:/PROGRAMMING/REPOS/HyQol/build.gradle.kts` (~132-157) and `HyQol/.run/*.run.xml`. Groovy version: `F:/PROGRAMMING/REPOS/Exposed/build.gradle` (~99-125). Also `Techtale` and `Bloc_game`.

```kotlin
tasks.register("runDev") { dependsOn(":app:run") }   // whatever runs the working tree

val exportMain = tasks.register<Exec>("exportMain") {
    val out = layout.buildDirectory.dir("main-run").get().asFile
    doFirst { delete(out); out.mkdirs() }
    commandLine("cmd", "/c", "git archive main | tar -x -C \"${out.absolutePath}\"")
}
tasks.register<Exec>("runMain") {
    dependsOn(exportMain)
    workingDir = layout.buildDirectory.dir("main-run").get().asFile
    commandLine("cmd", "/c", "gradlew.bat", ":app:run", "--console=plain")
    standardInput = System.`in`
}
```

Groovy is the same with `tasks.register('exportMain', Exec)`. The `cmd /c` form is Windows only; for a cross-platform app branch on `OperatingSystem.current().isWindows` and use `sh -c` and `./gradlew` otherwise.

The two run configs just call the tasks: copy `templates/gradle-Main Run.run.xml` and `templates/gradle-Dev Run.run.xml` (identical to HyQol's; only `taskNames` differ: `runMain`, `runDev`). Save as `.run/Main Run.run.xml` and `.run/Dev Run.run.xml`.

BlockDesigner (multi-module, `:app:run`) has no `.run` folder yet. When adding: `runDev` depends on `:app:run`; `runMain` runs `gradlew.bat :app:run` in `build/main-run`. Keep `build/main-run` out of the parent's Gradle project discovery and IntelliJ indexing.

## Electron / npm

Operant and Operant2 have no `.run` configs today. Use npm scripts and IntelliJ npm run configs:

- `package.json`: `"run:dev": "electron ."` (Vite apps: their dev script) and `"run:main": "node scripts/run-main.mjs"`.
- `scripts/run-main.mjs` (template `templates/run-main.mjs`): deletes `build/main-run`, runs `git archive main` into it, `npm ci`, the build script if there is one, then `npm start`, forwarding the exit code.
- Run configs: `templates/npm-Main Run.run.xml` and `templates/npm-Dev Run.run.xml` (IntelliJ type `js.build_tools.npm`, one script each). Save as `.run/Main Run.run.xml` and `.run/Dev Run.run.xml`.
- Add `build/` to `.gitignore`. Keep `build/main-run` out of the electron-builder `files`. If `build/` also holds icons (Operant does), that is fine, just ignore only `build/main-run`.
- `npm ci` in `main-run` reinstalls every time; for speed, junction the parent `node_modules` instead, if native modules allow it. Note it in the script.

## No focus steal

- Electron: read an env flag (this user's apps use `OPERANT_BACKGROUND=1`). Create the window with `show: false`; on `ready-to-show` call `win.showInactive()` when the flag is set, `win.show()` otherwise. Skip every later `focus()` or `moveTop()` while it is set. Reference: `F:/PROGRAMMING/REPOS/Operant/main.js` ~499-502, ~1515-1518, ~2616, ~2638; `F:/PROGRAMMING/REPOS/Operant2/main/index.ts` 17-18 and 54. Set the flag when an agent does a test run; do not force it on the user's own manual runs.
- JavaFX: there is no built-in "show inactive". Add a `-D<app>.background=true` property: `stage.show()` then `stage.toBack()`, and skip `requestFocus()`. Check on Windows that it does not steal focus; if it still does, tell the user.
- Other toolkits: use the no-activate show flag (Win32 `SW_SHOWNOACTIVATE`).
