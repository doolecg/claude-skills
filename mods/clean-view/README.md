# Clean View

A calm, plain-English view of what Claude is doing, plus an Agent Dock that splits every request across a team of helper agents. Works in the terminal and in the Claude desktop app.

## Install

```
/plugin install clean-view --marketplace doolecg/clean-view
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Clean View

- Hides tool calls, results and progress hints while it is on. Claude's written replies stay visible.
- A checklist above the prompt: job name and time, one row per step with a 10-cell meter (Done, percent, Working, Next, Up next).
- Header states: Needs you, Stuck, Stopped, All done (collapses to one line after 5 seconds).
- The ON/OFF button sits at the right of the header row. `/simple on`, `/simple off`, or `/simple` to flip it.
- Claude is told to call `plan_steps` before anything else. Other tools are denied until a plan exists (ToolSearch, TodoWrite, TaskCreate, TaskUpdate and AskUserQuestion are always allowed). Subagents are never gated.

## Agent Dock

- Open the dock with the Dock button above the prompt or `/dock`. Pick a Team Size of 1, 3, 5, 10, 20, 50, 100 or Custom (1 to 100). Sizes above 20 ask you to confirm and reset to 1 in the next session.
- With a size above 1, each request is split across exactly that many helpers, run in parallel. The 6th helper at size 5 is refused, and a request that used fewer helpers than the size gets one follow-up asking Claude to use the rest.
- Cards show a coloured two-letter badge, task name, timer and meter. More than 12 helpers switch to small tiles.
- `/dock` folds to a status-line badge such as `12 working · 8 queued · 30 done`; run it again to reopen. `/dock 10` sets the size.
- Helper agents can be "Fast & Cheap" (Haiku) or "Same as me", set in the dock.
- Live helper count is written to `~/.claude/ai-employee-kit-data/agents-now/<session_id>.json`.
- Real headshots from `~/.claude/employee-headshots` are not drawn yet; the coloured badge is always used.

### Settings to raise the helper limit

Claude Code refuses Agent calls past `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), and runs `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` tool calls at a time (default 10). The dock queues extra helpers itself, but to run waves of 20 add both to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "20",
    "CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY": "20"
  }
}
```

## Development

```
claude plugin validate .
claude plugin test .
```
