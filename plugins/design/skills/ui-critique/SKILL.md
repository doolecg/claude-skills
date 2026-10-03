---
name: ui-critique
description: Critique a rendered UI screen from a screenshot and produce a severity-ranked fix list (what, where, why, concrete fix), then optionally apply the fixes with before and after shots. Use when the user says "critique this screen", "why does this UI look off", "review this UI", "what's wrong with this settings page", "audit the design", "does this look right", "quick UX check", or asks to fix or polish how an existing desktop app window (JavaFX, Electron), Minecraft mod GUI or HTML page looks. For designing or restyling from scratch use ui-foundations.
---

# UI critique

Look at a rendered screen, find what is wrong, rank it, and fix what the user picks. Judge the pixels, not the code:
always work from a screenshot, never from source alone.

## Workflow

1. **Get the screenshot** (see below). Look at it yourself with Read. If the user gave an image, use that.
2. **Collect context** in one pass: what the screen is for, the one task the user does here, and the app's existing
   look (other screens, theme tokens, CSS variables, JavaFX `.css`, Minecraft widget style). Read them. Do not ask
   questions you can answer from the repo.
3. **Critique** along the dimensions in `references/dimensions.md` (read it first). Full mode covers all seven;
   quick mode covers three.
4. **Rank and report** in the format below.
5. **Fix loop** if the user asked for fixes (see below).

## Getting the screenshot without stealing focus

The user is often working in other windows or away on a phone. Never raise, focus or activate a window.

| App type | How to capture |
|---|---|
| Operant | Start with `OPERANT_BACKGROUND=1`; use its own screenshot function or the project's capture script. |
| Electron | Window opens with `showInactive()`; capture with `webContents.capturePage()` or Playwright `page.screenshot()`. |
| JavaFX | `Node.snapshot(null, null)` on the scene root, written with `ImageIO`; or Win32 `PrintWindow` on the window handle. |
| Minecraft mod | Run the dev client per the user's test setup (1920x1080, GUI scale 2, `pauseOnLostFocus:false`, Bare Bones pack, Iris + Complementary). Never press F2 or click the window (that takes focus). Use a dev-only, env-gated screenshot mode in the mod: on client tick, run camera/screen steps (`connection.sendCommand("tp ...")`, `mc.gui.setScreen(...)`), wait ~60 ticks, call `net.minecraft.client.Screenshot.grab(mc.gameDirectory, name, mc.gameRenderer.mainRenderTarget(), 1, cb)`, then `mc.stop()` (see `ClientShots.java` in F:/PROGRAMMING/REPOS/Exposed). If the window still pops up front, push it behind with SetWindowPos(HWND_BOTTOM, SWP_NOACTIVATE) and restore the previous foreground window. |
| HTML page | Playwright (`browser_navigate`, `browser_take_screenshot`) at the target size, headless. |
| Other window | `PrintWindow` with `PW_RENDERFULLCONTENT`. Never `SetForegroundWindow`, never `Alt+Tab`. |

Rules: stop only processes you started, by PID, never by name. Capture states that matter (hover, focus, disabled,
empty, error, long text) as extra shots, not just the happy path. Name shots `before-<screen>.png` and
`after-<screen>.png` in the scratchpad or `build/`, not the repo root.

## Modes

**Full** (default): all seven dimensions.

**Quick**: use when the user says "quick", "just check the UX", or wants fast feedback. Cover only
affordance, information density and visual hierarchy: can the user find the action, is there too much, does the
primary thing read first. Skip typography, colour, composition and consistency unless something there blocks the task.

## Severity

- **P1 Critical**: blocks or misleads the task, hides a required action, fails contrast on body text, looks
  broken (clipping, overlap, overflow).
- **P2 Important**: slows the user or confuses them, or clearly clashes with the rest of the app.
- **P3 Polish**: minor refinement.

Only report what you can see in the screenshot or confirm in the code. No invented brand rules: if the app has no
style to compare against, skip the consistency dimension and say so in one line.

## Output format

Lead with a one-sentence verdict. Then one list, grouped P1 / P2 / P3, most damaging first. Each item:

```
N. <What is wrong> (Dimension)
   Where: <element and position, e.g. "Save button, bottom right of the Appearance tab">
   Why: <effect on the user, with the measurement: ratio, px, count>
   Fix: <concrete change: value, token, layout move; code-level when you know the file>
```

Rules for items:
- Be specific: "label contrast 2.8:1, needs 4.5:1; use #B8B8B8 on #1E1E1E" not "improve contrast".
- Measure rather than eyeball: contrast ratios, font sizes, gaps in px, number of equal-weight elements.
- One item per problem. Merge duplicates (the same missing padding on six rows is one item).
- Recommend one fix per problem, not a menu.
- Close with strongest and weakest dimension in one line, and any single-line idea outside scope.

Do not pad with praise. Passing dimensions get a single "ok" mention at most.

## Fix loop

Applies when the user asks to fix, change or polish the UI (or picks items from your list).

1. **Before shot**: already taken in step 1. Keep it.
2. Critique and report the list. If the user asked for fixes in the same message, do not wait: apply the P1 items and
   any other obvious high-severity ones. If they only asked for a critique, stop after the list and ask which to apply
   (recommend: all P1 plus the cheap P2s).
3. **Apply only the chosen fixes.** Smallest change per item. Use existing tokens, theme variables and spacing steps;
   do not add new options, features or redesign what was not flagged. Do not touch unrelated code.
4. Rebuild and relaunch the way the project runs (Dev Run for work in progress), without taking focus.
5. **After shot**: same screen, same size, same state as the before shot.
6. Re-check the changed items against the after shot. If a fix did not land or made something worse, fix it once
   more, then report honestly.
7. **Send both shots with SendUserFile** (before first, then after), with a plain list of what changed, one line
   each, and what was not fixed. Do not just describe the result. Say what was verified (looked at the after shot,
   measured ratios) and what was not.

For delegating: a haiku worker can take the screenshots and rebuild; apply the edits yourself or give a sonnet
worker one file at a time. Do not give two workers the same file.

## Common failure patterns to look for first

- Several filled primary buttons competing; no clear primary action.
- Low-contrast secondary text, placeholders and disabled states.
- Controls that look static (flat label, no border) or static things that look clickable.
- Inconsistent padding and row heights, with no spacing scale.
- Unrelated groups the same distance apart as related ones (proximity wrong).
- Walls of equal-weight options with no grouping or headings.
- Colour as the only state signal (red/green with no icon or text).
- Text clipped or wrapped badly at the real window or GUI scale size.

Adapted from designer-skills by MC Dean (github.com/Owl-Listener/designer-skills, MIT). See `LICENSE-THIRD-PARTY.md`.
