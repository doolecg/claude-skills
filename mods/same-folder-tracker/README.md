# Same-Folder Tracker

Tells you when another Claude Code session is working in the same folder.

- **Band above the prompt** (hidden until you turn it on): one line per other live session, up to three:
  `Other session: working — editing app.ts (3 files)`. The phase is working, waiting on permission, or idle. A fourth or later session is counted on a last line.
- **A toast, once per file per session**, when you are about to edit a file another live session already edited. The edit is never blocked or changed.
- Works the same in the terminal and in the Code tab of the desktop app.

Each session writes only its own small entry to the plugin store: its phase, the time of its last update and up to 50 paths it edited through Edit, Write or NotebookEdit. File contents are never stored.

## Install

```
/plugin install same-folder-tracker --marketplace doolecg/claude-skills
```

Type it in a terminal `claude` session, answer `y` to add the marketplace, and pick the user scope. It then loads in every Code tab session too (the Code tab cannot run `/plugin` itself).

## Turning the band on and off

The band starts hidden. The toast works either way.

- `/folder-tracker band on` and `/folder-tracker band off` (also works in the Code tab prompt, and while Claude is busy).
- The small Off button on the band.
- The "Show the band above the prompt" row in the config menu (`showBand`).

`/folder-tracker` with nothing after it says whether the band is on.

## How sessions are matched

- Sessions match on their working folder, ignoring case and slash style (`F:\Proj` and `f:/proj/` are the same). A subfolder is a separate folder.
- A session that says it ended is dropped at once. One that never says (a crash) drops out 30 minutes after its last update. A session that is busy refreshes its entry now and then, so a long turn does not drop out.
- Other sessions' changes appear within about 20 seconds.

## Developing

```
claude --plugin-dir <path to this folder>
```

Checks: `claude plugin validate <folder>` and `claude plugin test <folder>`.

## Limits

- It only knows what the hook events say. Waiting on permission comes from the permission-request and permission-prompt events; once you answer, the phase goes back to working when that tool finishes, so it can show "waiting" a little long after a slow tool you approved.
- Only Edit, Write and NotebookEdit count as edits. Files changed through Bash, MultiEdit or another tool are not tracked, so they cause no toast.
- A path is recorded after the edit succeeds, so two sessions editing the same file in the same second may not warn each other.
- The warning is by exact file path (case-insensitive). A file reached through a symlink or a different relative spelling may not match.
- A session sitting idle for 30 minutes disappears from the band even if it is still open, until it does something again.
- Sessions on different machines, or with different Claude Code configuration folders, cannot see each other. The plugin store is one file per user.
- The plugin store is shared by all your sessions without locking. Each session writes only its own key and rewrites it on its next event, so a lost write heals itself, but a very busy moment could briefly hide a session.
- Housekeeping: at start, a session removes entries that no session has touched for a day (dead sessions). That is the only time it touches another session's entry.
- The command name `/folder-tracker` may already be taken by another mod; then the config menu row and the band's Off button still work.
- The toast depends on the app showing plugin toasts. I checked the entries and phases with two real `claude -p` sessions, but not the toast or band by eye in the desktop app.
