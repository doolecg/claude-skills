# Context View

A live picture of the context window, drawn the way `/context` draws it. A pane opens with `/ctx`, and a thin meter sits above the prompt.

Read-only: it never compacts or changes anything. Every number comes from `$.session.usage({ breakdown, columns })`; nothing is estimated by the mod.

## What you see

**The meter above the prompt** is off until you turn it on (see "Turning the meter on and off"). It shows `ctx 37% · 73.6k / 200k` and a short bar. It turns amber at 70% and red at 85% of the auto-compact threshold (of the whole window when auto-compact is off). In the red state it suggests `/compact`. It shows one toast the first time it reaches red in a session. It stays hidden until the first response of the live window has reported usage.

**The pane (`/ctx`)**

- The grid: 10 by 10 squares (20 by 10 for a window of a million or more, 5 wide when the pane is narrow). Filled squares take their category's colour, free space is drawn hollow, the auto-compact buffer is hatched.
- Beside it: the model, `73.6k / 200k tokens (37%)`, then one row per category ordered by kind (used categories, free space, auto-compact buffer). Deferred tool schemas get their own muted rows marked "loaded on demand, not in the window".
- Click a category row to highlight its squares in the grid. Click it again to clear.
- Collapsible lists, biggest first: Memory files (click one to see its full path), MCP tools (grouped by server with a server total), Custom agents, Skills (click one to see where it comes from), Slash commands.
- Footer: `Auto-compact at 167k (56% left)` or `Auto-compact off`, and the last response's tokens (input, cache write, cache read, output).
- Before the first response, or right after a compaction until the next response: "No context reported yet" and an empty grid.
- **Count exactly** asks for one `full` breakdown. That sends one token-count request per tool and memory file, so it costs extra calls; the pane says so. The next turn goes back to the free estimate.

## Turning the meter on and off

The meter starts hidden. The pane never opens by itself; only `/ctx` opens it.

- Setting `showBand` (a row in the config menu, and asked at install): "Show the context meter above the prompt". Default off.
- The meter has a small "Off" button. The pane has a "Band: on" / "Band: off" button.
- `/ctx band on`, `/ctx band off`, or `/ctx band` to see the current state, without opening the pane.

The buttons and the command write the `showBand` row with `$.config.set`. If that is refused, the choice is kept in the plugin store instead. The warning toast near the limit shows whether the meter is on or off.

## How it updates

The numbers are pushed, not polled. The mod re-reads the free `summary` breakdown on `session.measure` (when the context moved), on `session.compact`, when `/ctx` opens the pane, and at session start. `/clear` forgets the numbers and lets the toast fire again.

## Commands

- `/ctx` opens the pane; `/ctx band on|off` turns the meter on or off. They work typed in the Code tab prompt and in the terminal, and run at once even while Claude is working.

## Install

```
/plugin install context-view --marketplace doolecg/claude-skills
```

Type it in a terminal `claude` session. Answer `y` to add the marketplace and pick user scope. After that it loads in every desktop Code tab session too. The Code tab cannot run `/plugin` itself.

## Developing

```
claude --plugin-dir F:\PROGRAMMING\REPOS\claude-skills\mods\context-view
claude plugin validate F:\PROGRAMMING\REPOS\claude-skills\mods\context-view
claude plugin test F:\PROGRAMMING\REPOS\claude-skills\mods\context-view
```

`tests/fixture-real.ts` is a breakdown recorded from a real `claude -p` run (paths made generic, long lists cut down). `tests/builder.ts` builds other states from the types.

## Limits

- The grid is one `Raster` on the terminal and one `Svg` on the desktop and other surfaces. Neither can take a theme key, so the grid's colours are mapped from the theme keys to fixed colours for the dark and light themes (read from the `theme` setting). For a theme that is neither plainly dark nor light (such as `auto`) it uses mid tones. The small swatches beside the category rows use the theme keys directly and always follow your theme, so the two can differ slightly.
- A few colour keys in the report are not theme keys (for example `green_FOR_SUBAGENTS_ONLY`). They are mapped to fixed colours.
- Slash commands: the report gives only a count and a token total for the listing, not one entry per command, so that section shows the totals.
- Skills: the report gives each skill's name, source and tokens but no file path, so clicking a skill shows where it comes from, not a path. Memory files do carry their path.
- A narrow pane regroups the squares the engine sent into 5 per row; the engine is also asked for its narrow grid using the width the pane last drew in. A 1M window therefore draws 40 rows when narrow.
- "Percent left" before auto-compact is the share of the threshold not yet used. Row percentages are the row's tokens over the window.
- The meter and pane follow the main conversation only; subagent compactions are ignored.
- The mod cannot read the window while a session has no usage yet (a fresh session, or just after a compaction); that is the "No context reported yet" state, not an error.
- Headless runs (`claude -p`) have no surface, so the pane and meter are not drawn there.
- Not yet checked by hand in the desktop app's Code tab; the tests mount the pane and meter on the terminal and desktop surfaces (and the pane on vscode and mobile).
