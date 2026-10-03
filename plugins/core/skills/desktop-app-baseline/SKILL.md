---
description: Baseline every desktop app (JavaFX, Electron or other) must ship with - auto-update from GitHub releases, an in-app settings page with rebindable keybinds, exactly two IntelliJ run configurations (Main Run and Dev Run), an open-source licence (MIT for new apps), README and RELEASE_NOTES.md. Use when starting a "new app" or "new desktop app", when asked to "add auto update", "add a settings page", set up "run configurations", "Main Run" or "Dev Run", or when working in an existing desktop app and checking it meets the baseline.
---

# Desktop app baseline

Every desktop app Dayle builds ships with the items below. Two modes:

- **Create mode** (new app): set up everything in this skill before the first release.
- **Audit mode** (existing app): check each item, then flag what is missing in one line each. Do not add a missing item unasked. Example: "Missing: no in-app keybind rebinding, no periodic update re-check. Want me to add them?"

## The baseline

1. **Auto-update from GitHub releases.** Check the repo's latest release at startup and every few hours (default 3, user-settable, 0 = startup only). Download the installer in the background. Offer it in the UI: install on click, or on quit. See [references/auto-update.md](references/auto-update.md).
2. **In-app settings page.** Every option the app has is on it, applied live and saved. Keybinds are rebindable in the app (capture widget), not only in a config file. Reset per section. See [references/settings-page.md](references/settings-page.md).
3. **Exactly two IntelliJ run configurations**, committed in `.run/*.run.xml`: `Main Run` (builds and runs the code committed on `main`, exported to `build/main-run`, working tree untouched) and `Dev Run` (builds and runs the working tree). No sandbox, lab or other configs. See [references/run-configs.md](references/run-configs.md).
4. **Test runs never take focus.** Windows open behind the active window (Electron: `OPERANT_BACKGROUND=1` and `showInactive()`). See [references/run-configs.md](references/run-configs.md).
5. **Free and open source only.** No paid services, closed-source libraries or proprietary APIs. No dependency added without asking.
6. **Repo files.** MIT `LICENSE` (`Copyright (c) <year> doole`, as in BlockDesigner), `README.md`, and `RELEASE_NOTES.md`, newest release first: `# <App> <version>`, then New / Changed / Fixed, sections separated by `---`. That top section is the GitHub release body. Templates are in `templates/`. Existing apps keep their own open-source licence (Operant is Apache-2.0, which is fine); only closed or missing licences are a gap.
7. **Release flow** follows the global rules in CLAUDE.md: commit, push, tag and publish only when asked; no AI attribution in commits; plain tags (`1.2.1`); work on `dev-<version>`, fast-forward `main`, delete the dev branch. The release must attach the asset the updater looks for (see Asset naming). If the repo has a release skill, use it.

## Create mode: order of work

1. Pick the stack: JavaFX/Gradle or Electron/npm. For anything else, apply the same checklist by analogy and say so.
2. `git init`, make a first commit, make sure a `main` branch exists (Main Run needs it). Git-ignore `build/`.
3. Add `LICENSE`, `README.md`, `RELEASE_NOTES.md` from `templates/`.
4. Build the settings store first (one object of defaults, persisted JSON, change events), then the settings page, then the keybind registry and its capture widget. Every feature that adds an option adds it to the page in the same change.
5. Add the updater and wire its settings (`autoUpdate`, `updateCheckHours`) into the page.
6. Add Main Run and Dev Run (copy from `templates/`), run both once, confirm each starts and opens without taking focus.
7. Add the packaging task that produces the installer named as the updater expects.

## Audit mode: checklist

For each line, find the evidence (file and symbol) or flag it missing.

| Item | JavaFX/Gradle evidence | Electron/npm evidence |
|---|---|---|
| Checks `releases/latest` at startup | class calling `api.github.com/repos/<owner>/<repo>/releases/latest` | `fetch` of that URL in the main process |
| Re-checks every few hours | `Timeline` or scheduled executor | `setInterval` driven by a setting |
| Background download, size and hash check | `.part` file, size, SHA-256 | `.part` file, size, `sha256:` digest |
| UI offer, install on click or quit | update dialog or banner; installer script run on exit | status pushed to renderer; `will-quit` hook |
| Settings page covers every option | no option lives only in a JSON file | same |
| Live apply and save | change listeners, `save()` | settings IPC, broadcast to windows |
| Keybinds rebindable in the UI | capture button, `Keybinds.fromEvent` | recording chip, keydown handler |
| Two run configs only | `ls .run` shows `Dev Run` and `Main Run` | same, npm type |
| Main Run uses `git archive main` into `build/main-run` | Gradle `exportMain`/`runMain` | `scripts/run-main.mjs` |
| No focus steal in test runs | flag respected | `OPERANT_BACKGROUND`, `showInactive()` |
| Open-source LICENSE (MIT for new apps), README, RELEASE_NOTES.md | files exist, format matches | same |
| Free and open source | no paid or closed dependency | same |

## Asset naming the updaters expect

The updater picks the asset by file name, so the release must match.

- BlockDesigner: `F:/PROGRAMMING/REPOS/BlockDesigner/app/src/main/java/io/blockdesigner/app/update/Updater.java`, `parseRelease` (~line 150). `*-portable.zip` for portable copies, `*.msi` for installed copies, `.exe` only as a legacy fallback. Names: `BlockDesigner-<v>.msi`, `BlockDesigner-<v>-portable.zip`.
- Operant: `F:/PROGRAMMING/REPOS/Operant/updater.js`, `pickAsset`. Windows takes the first `.msi` (`Operant-<v>-windows-x64.msi`); macOS a `.dmg` containing `-mac-<arch>` (`Operant-<v>-mac-arm64.dmg`); Linux an `.AppImage` containing `x86_64`/`arm64`, or a `.deb` containing `amd64`/`arm64`. Set `artifactName` in the electron-builder config to match.
- The tag is the version (`1.2.1`); updaters strip a leading `v` anyway. Versions are numeric `major.minor.patch`.
- GitHub shows `digest: "sha256:<hex>"` on each uploaded asset. Operant refuses to auto-install an asset without one, so upload through the REST API.

## Reference implementations (read before writing new code)

| Stack | Repo | What to copy |
|---|---|---|
| JavaFX | `F:/PROGRAMMING/REPOS/BlockDesigner` | `app/.../update/Updater.java`, `ui/UpdateDialog.java`, `Settings.java`, `ui/SettingsDialog.java`, `ui/Keybinds.java` |
| Electron (JS) | `F:/PROGRAMMING/REPOS/Operant` | `updater.js`, `main.js` (updater wiring ~1579-1640, `OPERANT_BACKGROUND`), `renderer/settings.js` |
| Electron (TS, Vite) | `F:/PROGRAMMING/REPOS/Operant2` | `main/updater.ts`, `main/index.ts`, `renderer/src/components/settings/sections/` |
| Run configs (Gradle) | `HyQol`, `Exposed`, `Techtale`, `Bloc_game` under `F:/PROGRAMMING/REPOS` | `.run/*.run.xml`, `runDev`/`exportMain`/`runMain` tasks |

The Claude Agent Viewer repo was not under `F:/PROGRAMMING/REPOS` when this skill was written (only its app-data folder exists). If it lives elsewhere, read it and add it here.

## Known gaps in the user's own apps (flag when working in them)

- BlockDesigner: no periodic re-check while running (startup and manual only); no install on quit; no `.run` folder.
- Operant2: no `.run` configs.
