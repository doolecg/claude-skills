# Context

Keeps the facts for the Sidebar footer up to date, and counts test and fix passes. It has no pane and no band of its own: the Sidebar draws what it publishes at the bottom of every tab.

## What it publishes

One value, `context` / `footer`:

- **Hindsight:** `up` when the server answers `/health` with anything below 500, `down` when it does not within 5 seconds, `off` when there is no self-hosted `~/.hindsight/coding-agent.json`. Checked at start, then every 5 minutes.
- **CodeGraph:** `indexed` when there is a `.codegraph/` folder at the git root or the session root.
- **Git:** branch, changed files, commits ahead and behind the upstream. `null` outside a repo. Refreshed at start, when a turn ends and after a shell or edit tool call (at most every 3 seconds).
- **Passes:** how many test and fix rounds this problem has had.

## How passes are counted

A pass is a run of check commands plus the fix that follows.

- A Bash or PowerShell call (the main agent or a subagent) that runs a check command starts a new pass when there is none yet, or when an edit came since the last check. More checks with no edit between are the same pass.
- A call to Edit, Write, MultiEdit or NotebookEdit marks that an edit is waiting.
- A prompt you type resets the count to 0.
- A call that was denied is not counted.

Check commands: `npm`/`pnpm`/`yarn`/`bun` test, typecheck, lint, check, build and verify; `claude plugin test` and `validate`; pytest, tsc, vitest, jest, mocha, ctest; cargo, go, mvn, gradle, dotnet and make test or build commands. Add your own words in the settings.

The mod only counts and shows. It never blocks or changes a tool call or a reply.

## Install

    /plugin install context --marketplace doolecg/dooles-tools

Run that in a terminal; it then loads in every session. While developing, use `claude --plugin-dir <this folder>`.

## Commands

- `/passes` shows "Pass N of LIMIT" and whether an edit is waiting.
- `/passes reset` sets the count back to 0.
- `/doole_context` does the same as `/passes`.

Both work while Claude is busy.

## Settings

- **Enabled** (default on): off stops all counting and publishing; the commands reply that Context is off.
- **Pass limit** (default 3): test and fix rounds before Claude stops to ask you.
- **Extra check commands** (default empty): more command words that count as a test run, separated by commas.
- **Hindsight check interval** (default 5 minutes, 1 to 1440): how often the server is checked.
- **Git refresh gap** (default 3 seconds): the shortest wait between git refreshes after tool calls; 0 means after every call.

## Limits

- The count follows command names, not results. A command that fails still counts as a run.
- A check command it does not know counts only if you add its word in the settings.
- Commands run through a script (`./ci.sh`) are not seen unless the script name is an extra word.
- Without the Sidebar, nothing shows the footer; `/passes` still works.
- Hindsight is only checked when `~/.hindsight/coding-agent.json` is self-hosted.

Tests: `claude plugin test <this folder>`.
