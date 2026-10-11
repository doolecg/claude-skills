# Agents Panel

A pane that shows what Claude is doing right now, the files it touched, its sub-agents, and the session's MCP servers, skills and start-up messages. Open it with `/agents-panel`.

Observation only: it never starts, stops or changes anything. Everything it shows comes from hook events, transcripts and git. A value it does not know shows as "—" or is left out.

## What you see

**Right now**

- A headline from Claude's own (top-level) tool calls; sub-agent calls do not count:
  - "Waiting for you" and what it asks, while a question or a permission dialog is up.
  - "Claude is reading register.tsx in hooks" (Read, NotebookRead, Grep, Glob, LS).
  - "Claude is editing register.tsx in hooks" (Edit, MultiEdit, Write, NotebookEdit).
  - "Claude is running a command" and the command (Bash, PowerShell).
  - "Claude is working" for any other tool, "Claude is thinking" mid-turn with no tool.
  - After a turn with edits: "Claude edited N files", the last file and green +added / red −removed lines when the tool reported the diff.
  - Otherwise "Claude is idle". Under it: "last: <file>" or "no files touched yet".
- Git: the branch, then "N changed" in amber or "clean, nothing changed". Hidden outside a repo.
- Memory, with a small brain icon:
  - With Session Learner installed: "Learning from this session…" with a spinner while it runs, "Learned N lessons: M saved, K to review" after it, "Memory: <error>" on an error, "Memory: nothing learned yet" before its first run in this folder. It reads `~/.claude/mods-data/session-learner/last-run.json`.
  - Without it: the memory files Claude wrote this session (CLAUDE.md, MEMORY.md and the auto-memory folder `~/.claude/projects/<project>/memory/`), by file name only.
- A colour key (purple "Claude read", orange "Claude edited", yellow "Not committed") and the files list: every file read or edited, most recent first, edited winning over read, a yellow dot on files git shows as changed. Five are shown, then "+N more".

**Summary cards**: Cost, Tokens and Time, summed over the visible sub-agents. Time runs from the first start to now while any agent runs, else to the last end.

**Sub-agents**: "Running · N" and "Finished · N", each collapsible, with Collapse all / Expand all and Clear finished. A finished row shows an X on hover that clears it. Cleared rows stay hidden for this session. Each row has:

- A 12x12 pixel critter, with one of eight hats and three tints picked from the agent id, so it never changes. It bobs while the agent runs.
- The task description in bold with a status mark: a pulsing dot while running, amber dot while waiting, green check when done, red X when failed, grey dot when stopped.
- A friendly name from the same hash, then the agent type.
- The effort word in colour and the short model name ("Haiku 5.5").
- "ctx 18% · 36.8k ≈$0.001 0:02", leaving out what is not known.
- A thin bar: todo progress when the agent made todos, otherwise how full its context is.

Click a row to see that agent's conversation: its prompt, then its replies and tool calls, a context bar, and "< Agents" to go back. It updates live while the agent runs and keeps to the bottom unless you scroll up.

**Status** (collapsible; a red dot on the header when it is collapsed and a server failed):

- MCP: "MCP · 10 connected · 2 needs sign-in" and one tile per server ("claude.ai" above a connector's name). Green connected, amber needs sign-in, red failed. Hover a red tile to see the error.
- Skills: "Skills · N loaded", one tile per skill the Skill tool loaded, newest first. "plugin:skill" names show the plugin above the skill.
- Session: the messages the SessionStart hooks printed, each with where it came from.
- "Nothing to report." when all three are empty.

## The band

A one-line summary above the prompt: headline · branch · memory line. It is off until you turn it on:

- `/agents-panel band on` or `/agents-panel band off`,
- the "Band: on/off" button at the bottom of the pane,
- the "Off" button on the band itself,
- or the "Show the band above the prompt" row in `/config`.

## Commands

- `/agents-panel` opens the pane. It runs at once, even while Claude is working.
- `/agents-panel band on|off` shows or hides the band.

## Install

```
/plugin install agents-panel --marketplace doolecg/claude-skills
```

Type it in a terminal `claude` session. Answer `y` to add the marketplace and pick user scope. After that it loads in every desktop Code tab session too. The Code tab cannot run `/plugin` itself.

## Developing

`claude --plugin-dir F:\PROGRAMMING\REPOS\claude-skills\mods\agents-panel`

Check it with `claude plugin validate <folder>` and `claude plugin test <folder>`.

## Limits

- **Cost** is worked out from each response's token counts and the Claude API list prices built into the mod, so it is marked "≈". A model the mod has no price for shows no cost, and it is not what a subscription bills.
- **Context fill** of a sub-agent is its last response's input and output tokens over its model's window. The window is the session's own when the agent runs the main model, otherwise the model's published window; an unknown model shows no percentage.
- **Tokens** per agent and on the card are the agent's context size after its last response, not every token it was billed for.
- **MCP servers** have no status call in the plugin API. Connected servers come from the context report's tool list; a server whose only tools are the sign-in ones shows as "needs sign-in"; a server shows as failed only after one of its tool calls failed with a connection error. A server that failed to start and was never called does not show. The list refreshes when the pane opens and after each turn while it is open.
- **"Waiting for you"** starts when a question or permission dialog comes up. The API has no event for the moment you answer, so it clears when that tool call finishes, which can be after the approved tool has run.
- **SessionStart messages** are read from the session's transcript file, so they show once it has been written (after the first prompt in a new session).
- The **Clear finished** control is plain text while nothing is finished; the API's Button has no disabled state.
- The **X** to clear one row shows on hover, which needs a mouse (the desktop app, or the terminal's fullscreen mode). Clear finished works without one.
- **Card corners** are the surface's own rounded border; the API cannot set a radius (14px, 12px) or tabular figures.
- The **pulsing dot** pulses on the desktop; the terminal shows a steady dot. The critter bobs on both.
- **Scrolling**: the conversation view keeps to the bottom by watching the pane's scroll events. If a surface scrolls without raising them, the view may not follow.
- The panel follows the session it runs in; agents started before the mod loaded show once the engine lists them, without their earlier numbers.
