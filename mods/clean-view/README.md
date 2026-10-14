# Task View

Was called Clean View. Its plugin id is still `clean-view`, so installs, settings and `/simple` keep working.

A Claude Code mod that makes Claude feel calm and friendly for people who aren't technical. While Claude works, the tool calls, file diffs and command output are hidden, and one plain checklist sits above the prompt: the plan, what is happening now and how far along it is.

```
╭──────────────────────────────────────────────────────────────────────────────────╮
│ ✶ Build my landing page                                                   1m 12s │
│ Step 2 of 4 ⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠖⠶⠶⠶⠶⠶⠶⠶⠶⠦⠶⠲⠶⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠄⠀⠀⠀⠀⠂   40% │
│ ✓ Read your brand notes       ⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶  done                                   │
│ ▶ Build the pricing section   ⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄  60%                                    │
│ ○ Add the contact form        ⠀⠂⠀⠀⠠⠀⠀⠐⠀⠀                                         │
│ ○ Polish the footer           ⠄⠀⠀⠂⠀⠀⠠⠀⠀⠀                                         │
╰──────────────────────────────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install clean-view --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Turning it on and off

- It starts on.
- With the Bottom Bar mod, the toolbox's Mods list shows Task View with an On/Off switch (● on, ○ off); one click flips it.
- Or type `/simple off`. `/simple on` turns it back on, and `/simple` on its own flips it.
- When it's off, every hidden row comes back and the band goes away. Your choice is remembered after a restart.
- The band only shows while there is a job; nothing sits above the prompt otherwise.

## Style

Set it in `/plugin` (Task View, Style). Default: Clean.

- **Clean:** the full checklist band above the prompt, with tool calls, diffs and command output hidden.
- **Steps only:** a smaller checklist, one compact line per step under a short header, and everything else in the transcript (tool calls, code, diffs, command output, reasoning) shows as normal. Claude still plans with `plan_steps` and `report_progress`, and questions still open in the band.

## What the band shows

- **Working:** drawn like Flightdeck: the job is an outlined bar with its name and running time in the top edge and Step N of M and the percent in the bottom edge, then every step is its own outlined bar, side by side, wrapping onto more rows on a narrow terminal. Done steps get a green check, the current step a ▶, an accent outline and a meter that fills as Claude reports progress (a moving sweep until the first report), upcoming steps are faint with an empty meter. The job's outline turns amber for Needs you, red for Stuck and green for All done; highlights follow the Bottom Bar's Colour setting.
- **Meters:** pixel bars in your accent colour (the Colour setting, shared with Bottom Bar: Coral, Amber, Sage, Sky, Lilac or Rose). The lit pixels are scattered at random and fade in from the tail; the pixels at the front are bright and glow. They build up smoothly to each new percent and twinkle; the empty track keeps a faint scatter of dim pixels. A finished bar is solid. The desktop app draws the same look as an SVG: small dots on a dark rounded track.
- **Needs you:** a highlighted badge and the reason, when Claude needs your OK or has a question.
- **Questions:** when Claude asks you something, the question takes the whole band in the same outlined look, and the steps come back once it is answered. The question and each option's description wrap in full; the options are numbered, an Other row lets you type your own, and the question tabs sit in the bottom edge. Press an option's number or click it; multi-select questions tick options and finish with Done (`d`); Skip dismisses. Claude's own question dialog is not shown while the band asks, and your answer goes back as your next message. With no job on screen the panel still opens. A ✕ at the top right clears a stale band.
- **Helpers:** while background subagents keep running after Claude's turn ends, the header adds Waiting for N helpers and the job only finishes when they are done. A helper's own question still uses Claude's normal dialog.
- **Stuck:** one plain sentence, when you said no to a step, a step keeps failing, or Claude's servers, your usage limit or the connection got in the way.
- **Stopped:** when you press Esc.
- **All done:** with how long it took. After 5 seconds it shrinks to one line.

## How it works

- Claude gets two tools, `plan_steps` and `report_progress`, and is told to plan every request in plain English first. Other tools wait until a plan exists (subagents are never held up). A to-do list from TodoWrite or TaskCreate counts as the plan too.
- Haiku names each job in a few words in the background.
- The checklist is kept in plugin state under `clean-view` (`cleanViewEnabled`, `checklist`, `tick`, and `modes` for the Bottom Bar), typed in `types/index.d.ts`, so other mods can read it.

Works in the terminal and in the desktop app. The desktop app gets its own drawing: a rounded card, native buttons for the questions and an Other field, and pixel bars drawn as SVG, with no box-drawing.

## Development

```
claude plugin validate .
claude plugin test .
```
