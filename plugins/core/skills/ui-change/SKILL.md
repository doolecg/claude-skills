---
name: ui-change
description: The fixed workflow for any request to fix or change something in a UI - screenshot before, make the change, screenshot after, send both to the user, say what was and wasn't verified. Use when the user says "fix the UI", "change the button", "move this panel", "the layout is wrong", "make the window look...", "tweak the screen", "this text is cut off", "align this", or any other UI tweak in a desktop app (JavaFX, Electron), a Minecraft mod screen or HUD, or an HTML page. For judging how good a screen looks use ui-critique; for designing from scratch use ui-foundations.
---

# UI change: before, change, after, send

## Checklist

1. **Before shot.** Capture the current state of the exact screen (method per app below). Look at it yourself with Read.
   Capture the state that is wrong (hover, error, long text, small window), not just the default view.
2. **Make the change.** Only what was asked. No extra features, options or refactors; mention an idea in one line.
3. **Build and run.** Rebuild and relaunch the app, then capture the same screen, same size, same state.
4. **After shot.** Read it. Compare with the before shot yourself (the main model does this, not a worker). If it is not
   right, go back to step 2.
5. **Send both** with SendUserFile (before first, then after). The user is often remote on a phone. Name them
   `before-<screen>.png` / `after-<screen>.png` in the scratchpad, never the repo.
6. **Say plainly what was verified**: built, ran, looked at the after shot, which states were checked, and what was not
   (other themes, other window sizes, other platforms). Do not say "done" before steps 3 and 4.

Visual quality questions ("does this look right", "polish it") go to `ui-critique`; do not duplicate its dimensions here.

## Never take focus

Test runs open behind the user's active windows. Never `SetForegroundWindow`, Alt+Tab, click or type into the app window.
Stop only processes you started, by PID, never by name (`Stop-Process -Id`). Do not close the user's own app instances
(their real Operant, BlockDesigner, Minecraft): launch a separate test copy.

## Capture per app type

| App | Before/after capture |
|---|---|
| Any Windows window | `scripts/capture-window.ps1`: PrintWindow with PW_RENDERFULLCONTENT, DPI aware, no focus. `-List` shows windows; `-ProcessId <pid>` or `-Title <substring>`; `-Out x.png`. Works for JavaFX and Electron windows, including ones behind others. Not minimised windows (they render blank). |
| Operant (`F:/PROGRAMMING/REPOS/Operant`) | Launch the test copy with env `OPERANT_BACKGROUND=1` (in `main.js` this creates the window hidden and calls `showInactive()`; `test/smoke.mjs` also sets `OPERANT_USER_DATA=<temp profile>` so the test copy does not touch the user's data). Capture with `capture-window.ps1 -ProcessId <the pid you started>`. The `operant shot` CLI exists too (downscaled JPEG, `--selector`, `--region`, `--full`) but captures the running Operant instance; check `operant shot --help` before using it on a test copy. |
| Other Electron | Create the window with `show:false` then `showInactive()`. In-app: `win.webContents.capturePage()` then `image.toPNG()` to a file, behind an env flag (for example `APP_SHOT=<path>`) that screenshots and quits. Otherwise `capture-window.ps1`. |
| JavaFX (BlockDesigner etc.) | Best: in-app `node.snapshot(null, null)` (or `scene.snapshot`) on the FX thread, `SwingFXUtils.fromFXImage` then `ImageIO.write(..., "png", file)`. BlockDesigner already has this as env-gated JUnit ITs (see below). For the live window use `capture-window.ps1`. |
| Minecraft mod screen/HUD | Use the `minecraft-test-setup` skill: env-gated in-mod driver that opens the screen/steps the camera, waits ~60 ticks, calls `Screenshot.grab`, then `mc.stop()`. No F2, no clicking. If the window pops to the front, run `scripts/background.ps1` before launching. |
| HTML page | Playwright MCP: `browser_navigate`, `browser_resize` to the target size, `browser_take_screenshot` (headless, takes no focus). Same URL and size for before and after. |

### BlockDesigner snapshots (from its wiki, `build-test-snapshots.md`)

JUnit ITs in `app/src/test/java/io/blockdesigner/app/ui/` open real windows and write PNGs, gated by env vars:
`UI_SNAPSHOTS=1` (`UiSnapshotsIT`, `PluginUiSnapshotsIT`: dialogs, Settings, Keybinds, UI kit gallery, dark and light) to
`app/build/ui-snapshots/`; `MODE_SHOTS=1` (`ModeShotsIT`, whole-window shots per mode, optional `MODE_SHOTS_PLUGINS=<jar>`)
to `app/build/mode-shots/`; `PROMO_PROJECT=<path.bdproj>` (`PromoShotsIT`) to `app/build/promo/`.
Example: `UI_SNAPSHOTS=1 ./gradlew :app:test --tests "*UiSnapshotsIT*"`, then Read the PNGs.
Its `tools/gui.ps1 shot` maximises and focuses the window and uses `CopyFromScreen`, which breaks the no-focus rule:
prefer these ITs, in-app snapshots or `capture-window.ps1`. Wiki last noted the UI_SNAPSHOTS tests were not re-run
after the 0.4.24 overhaul, so expect they may need fixing.

## Scripts

- `scripts/capture-window.ps1`: `powershell -ExecutionPolicy Bypass -File capture-window.ps1 -Out shot.png -ProcessId 1234`
  (or `-Title "BlockDesigner"`, or `-List`). Tested on a live window; saves a full-size PNG.
- `scripts/background.ps1`: focus guard. Start it first (background), then launch the app. It watches for a window of the given
  process names whose title matches, pushes it to the bottom without activating it and restores the previous foreground
  window. `-TitleLike 'Minecraft*' -Process java,javaw -Minutes 6` (defaults shown). Stop it by the PID you started.

## Delegation

Running the build, launching the app and taking the shots can go to a cheap worker (Haiku; say what screen, size and state,
and where to save the PNGs). Reading the before and after shots, deciding whether the change is right, and the report stay
with the main model.

## Pitfalls

- Different window size, theme, scale or state between the two shots makes the comparison useless; fix them first.
- Capture after the UI has settled (animations, async loads, 60 Minecraft ticks), not at the first frame.
- Windows with GPU content (JavaFX 3D, Minecraft) may come out black via PrintWindow: use the in-app grab instead.
- Minimised or off-screen windows capture blank; restore without focus (`ShowWindow SW_SHOWNOACTIVATE`) or use in-app capture.
- Env vars must reach the app: `operant run` tiles are PowerShell, so use `$env:NAME='1'; cmd`, not `NAME=1 cmd`.
- A launched game can still grab focus at startup; if stray input might have opened a screen, check the shot and rerun.
- Do not call it fixed from the code diff: the after shot is the evidence.
- Respect the app's existing look (theme tokens, CSS) rather than inventing new styling.
