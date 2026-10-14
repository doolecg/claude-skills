# Clean View

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
/plugin install clean-view --marketplace doolecg/claude-skills
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Turning it on and off

- It starts on.
- With the Bottom Bar mod, add `/simple` as a pill in `✎ choose pills`: it shows ● Clean View when on and ○ when off, and one click flips it.
- Or type `/simple off`. `/simple on` turns it back on, and `/simple` on its own flips it.
- When it's off, every hidden row comes back and the band goes away. Your choice is remembered after a restart.
- The band only shows while there is a job; nothing sits above the prompt otherwise.

## What the band shows

- **Working:** the job's name and how long it has been running, an overall bar, then one row per step. Done steps get a green check, the current step a ▶ and a meter that fills as Claude reports progress (a moving sweep until the first report), upcoming steps are dim with an empty meter. The border and highlights follow the Bottom Bar's Colour setting.
- **Meters:** thin lines of pixels with a gap between rows. They rise through scattered random pixels behind a glowing edge, build up smoothly to each new percent, and twinkle softly; the empty track keeps a faint scatter of dim pixels. A finished bar is solid.
- **Needs you:** a highlighted badge and the reason, when Claude needs your OK or has a question.
- **Questions:** when Claude asks you something, the band splits: the checklist on the left, a question panel on the right (the question on top, a column of question tabs, the options beside them, and an Other row to type your own). Press an option's number or click it; multi-select questions tick options and finish with Done (`d`); Skip dismisses. Under 110 columns the panel stacks under the checklist. Claude's own question dialog is not shown while the band asks, and your answer goes back as your next message. With no job on screen the panel still opens. A ✕ at the top right clears a stale band.
- **Helpers:** while background subagents keep running after Claude's turn ends, the header adds Waiting for N helpers and the job only finishes when they are done. A helper's own question still uses Claude's normal dialog.
- **Stuck:** one plain sentence, when you said no to a step, a step keeps failing, or Claude's servers, your usage limit or the connection got in the way.
- **Stopped:** when you press Esc.
- **All done:** with how long it took. After 5 seconds it shrinks to one line.

## How it works

- Claude gets two tools, `plan_steps` and `report_progress`, and is told to plan every request in plain English first. Other tools wait until a plan exists (subagents are never held up). A to-do list from TodoWrite or TaskCreate counts as the plan too.
- Haiku names each job in a few words in the background.
- The checklist is kept in plugin state under `clean-view` (`cleanViewEnabled`, `checklist`, `tick`, and `modes` for the Bottom Bar), typed in `types/index.d.ts`, so other mods can read it.

Works in the terminal and in the desktop app.

## Development

```
claude plugin validate .
claude plugin test .
```
