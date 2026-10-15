# Task View

Was called Clean View. Its plugin id is still `clean-view`, so installs, settings and `/simple` keep working.

A Claude Code mod that restyles Claude's own to-do list. When Claude writes its to-do list, the row in the transcript is redrawn as a header, one pixel progress bar for the whole list, and a line with its own small pixel bar for each to-do. Nothing sits above the prompt and no other rows are hidden.

```
To-do                                              1 of 4 done · 25%
⠶⠶⠶⠶⠶⠶⠶⠶⠖⠶⠶⠦⠶⠲⠶⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀
✓ Read your brand notes          ⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶
▶ Build the pricing section      ⠀⠀⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠀⠀⠐⠀
○ Add the contact form           ⠀⠂⠀⠀⠠⠀⠀⠐⠀⠀⠠⠀⠀⠐⠀⠀
○ Polish the footer              ⠄⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠂⠀⠀
```

## Install

```
/plugin install clean-view --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Turning it on and off

- It starts on.
- With the Bottom Bar mod, the toolbox's Mods list shows Task View with an On/Off switch; one click flips it.
- Or type `/simple off`. `/simple on` turns it back on, and `/simple` on its own flips it. `/doole_task-view` does the same as `/simple`.
- When it's off, the to-do rows are Claude Code's normal ones. Your choice is remembered after a restart.

## What it draws

- **Header:** "To-do" and how far along: "2 of 4 done · 50%". When every item is done it says "All done · 4 of 4".
- **Main bar:** done items out of all items. It flickers while an item is in progress.
- **Each item:** a line with a marker and a small bar. Done items are dim with a green, still bar and a ✓. The item in progress is bold with a ▶ and a flickering accent bar that sweeps along, because Claude gives no percent for it. Pending items are dim with an empty bar and a ○.
- **Done:** every bar turns green and stays still.
- **Colour:** the accent follows the Bottom Bar's Colour setting (Coral, Amber, Sage, Sky, Lilac or Rose).
- **Bars:** in the terminal they are pixel bars made of braille dots. In the desktop app they are small dots on a dark rounded track drawn as SVG, 360 pixels wide for the main bar and 160 for each item.

## How it works

- It redraws the `ToolUse` row of Claude's `TodoWrite` tool from the list in that call, and blanks the matching result row so the list shows once. Older to-do rows in the transcript keep their own list, with no moving bars.
- The `TaskCreate`, `TaskUpdate` and `TaskList` tools change one running list, so Task View keeps that list itself and the latest of those rows draws it; the earlier ones are hidden.
- The 250ms frame clock runs only while the latest list has an item in progress and Claude's turn is running. It stops when everything is done, when Claude waits for you, and when you press Esc.
- The list is kept in plugin state under `clean-view` (`cleanViewEnabled`, `checklist`, `tick`, `todoUse`, and `modes` for the Bottom Bar), typed in `types/index.d.ts`. The Sidebar's Task View tab reads `checklist`.

Works in the terminal and in the desktop app.

## In the desktop app

In the Code tab Claude keeps the app's own working list (its `update_plan` tool) instead of `TodoWrite`. Task View follows that list as well: `items` sets it, `advance`, `done` and `start` move it, and `wrap_up` checks everything off. With the Bottom Bar mod installed, the list is drawn with pixel bars in the band above the prompt while Claude works, with the bar underneath. A finished list stays green and still for two minutes.

## Limits

- The app's own pinned task list still shows; mods can't hide or restyle it, so in the app the steps appear twice.
- In the app the list above the prompt needs the Bottom Bar mod, and shows only while Claude works (the app hides that band when idle).
- It only restyles rows for the to-do tools above. Claude has to be using its to-do list; Task View no longer asks Claude to plan, and nothing is drawn above the prompt.
- The in-progress item has no real percent, so its bar moves instead of filling.
- The Task tools' running list starts from the calls Task View sees, so a list made before the mod loaded shows only what changes afterwards (a `TaskList` call fills it in again).
- Item names are Claude's own words, cut to 120 characters. On a narrow terminal long names are cut with an ellipsis.
- The terminal bars are a fixed size (36 cells for the main bar, 16 for each item), shrunk only when the row is narrower than that.
- Restart Claude Code after updating so the new version loads.

## Development

```
claude plugin validate .
claude plugin test .
```
