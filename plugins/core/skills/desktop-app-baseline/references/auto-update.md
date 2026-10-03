# Auto-update reference

## Behaviour (both stacks)

1. Startup: wait about 5 s, then check. Then check every N hours (setting `updateCheckHours`, default 3, 1-24, 0 = startup and manual only). Changing the setting reschedules the timer live.
2. Setting `autoUpdate` (default on) turns checks and background download on or off. A manual "Check for updates" button always works.
3. Check: `GET https://api.github.com/repos/<owner>/<repo>/releases/latest` with a `User-Agent` header and `Accept: application/vnd.github+json`. Optional beta channel: `releases?per_page=10`, take the highest non-draft version.
4. Compare versions numerically per part (strip `v`, split on `.` and `-`). Offer only if newer.
5. Pick the asset for this OS and install type (SKILL.md, "Asset naming"). If none: report "this release has no installer for this system yet".
6. Download in the background to `name.part`, show progress, check the byte size, check SHA-256 when GitHub lists a digest, then rename. Reuse a finished download that is ours and the right size. Follow redirects only to GitHub hosts (`github.com`, `objects.githubusercontent.com`, `github-releases.githubusercontent.com`). Check free disk space first (about twice the size).
7. Tell the UI. States: `checking`, `downloading`, `ready`, `current`, `error`, with version and release notes (the release body). The UI offers "Install and restart" and says it also installs on quit.
8. Install: a detached worker waits for the app to exit, runs the installer, relaunches if asked. Windows: PowerShell worker running `msiexec /i "<msi>" /passive /norestart /l*v <log>` (`/qn` when installing on quit). macOS and Linux: a `/bin/sh` worker swaps the app or AppImage. Quit only after the worker has started.
9. Install on quit: on the quit event, if a verified download is ready, start the worker without relaunch.
10. Never install a file that failed the size or hash check. Delete it.
11. Skip-this-version (BlockDesigner: `Settings.skippedVersion`) is optional.

## Minimal outline

```
check():
  if busy: return
  rel = GET releases/latest
  if !newer(rel.tag, current): status = current; return
  asset = pickAsset(rel.assets, os, arch, installKind)
  file  = download(asset.url -> tmp/name.part); verify size and sha256(asset.digest)
  ready = {version, file, notes: rel.body}
  status = ready            // UI shows banner or dialog

start():   setTimeout(check, 5s); setInterval(check, hours)
onQuit():  if ready and autoUpdate: spawnDetachedInstaller(file, relaunch = false)
installNow(): spawnDetachedInstaller(file, relaunch = true); quit()
```

## JavaFX reference (BlockDesigner)

- `F:/PROGRAMMING/REPOS/BlockDesigner/app/src/main/java/io/blockdesigner/app/update/Updater.java`
  - `LATEST` URI (line 38), `compareVersions`, `parseRelease` (asset pick), `download(Asset, Path, DoubleConsumer)` (progress, `.part`, size, SHA-256), `launchInstaller`, `installScript`/`msiScript` (PowerShell calling msiexec), `Mode` (installed MSI vs portable zip), `workDir`.
- `app/.../ui/UpdateDialog.java`: the offer dialog with progress and notes.
- `app/.../ui/MainWindow.java`: `checkForUpdates(boolean manual)` (~874) runs on a virtual thread and stays quiet at startup unless there is a newer version the user has not skipped; startup call (~844) is gated by `Settings.checkForUpdates`.
- `app/.../plugins/PluginUpdater.java`: same pattern for plugin jars, reuses `Updater.download`.
- Missing today: the periodic re-check and install on quit. To add the re-check: a `Timeline` with `KeyFrame(Duration.hours(n), e -> checkForUpdates(false))`, `INDEFINITE`, rebuilt when the setting changes. For install on quit: in the stage close handler, run `Updater.launchInstaller` for a verified ready download.

## Electron reference

- Operant (JS): `F:/PROGRAMMING/REPOS/Operant/updater.js`. No electron-updater (it cannot update MSI installs); it uses `fetch` on the GitHub API.
  - `createUpdater({send, getSettings, ...})`; `check`, `fetchAsset` (size, `sha256:` digest via `verifyDigest`, disk-space check), `installNow`/`installUnix`, `schedule`/`reschedule`/`start` (~440-459: 5 s first check, `setInterval`, `will-quit` hook), `pickAsset`, `newer`, `allowedDownloadUrl`.
  - Wiring in `F:/PROGRAMMING/REPOS/Operant/main.js`: `createUpdater(...)` (~1579), `update:check`, `update:state`, `update:install` IPC (~1629-1639), `updater.start()` when `config.autoUpdate` (~2682), `updater.reschedule()` when `updateCheckHours` changes (~455).
  - Tests: `test/updater.test.js` (fetch, target and downloadDir are injectable).
- Operant2 (TypeScript): `F:/PROGRAMMING/REPOS/Operant2/main/updater.ts`. `createUpdater({send, getSettings})` returns `{status, start, check, reschedule, installNow}`; the `will-quit` install is gated by `getSettings().updates.installOnQuit`. Prefer this shape for new Electron apps.
- For a simple new Electron app shipping NSIS or portable builds, `electron-updater` with `publish: github` is acceptable (free, open source): it gives check, background download and `autoInstallOnAppQuit`. You still add the UI offer, the interval (`setInterval(() => autoUpdater.checkForUpdates(), hours)`) and the settings. Use the custom GitHub-API updater for MSI, DMG or AppImage.
- Renderer: a pill or banner driven by the pushed `update:status`; clicking sends `update:install`. Settings page has: Update automatically (toggle), Check every N hours (number), Check now (button), channel (optional).
- Only run in packaged builds (`app.isPackaged`); keep an env override for tests (Operant: `OPERANT_UPDATE_TEST`).

## Release-side requirements

- Create the release with the REST API (no `gh` needed). Tag = version, body = top section of `RELEASE_NOTES.md`.
- Assets named as in SKILL.md. Not a draft and not a prerelease (that is what `releases/latest` returns).
- The in-app version comes from one place: Gradle `version = "x.y.z"` baked into `version.properties`, or the `package.json` version through `app.getVersion()`.
