# Bottom Bar

A Claude Code mod that puts one compact, rounded bar at the bottom of the terminal, with a Doole's Tools pill locked to its right end.

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ◆ Opus 5.5 · 1M │ effort xhigh │ ctx ▰▱▱▱▱▱▱▱▱▱ 5% │ 5h 7% │ ◇ 0 agents   ◖ ✻ Doole's Tools ▲ ◗ │
╰─────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install bottom-bar --marketplace doolecg/claude-skills
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

The bar replaces a `statusLine` script. If you have one in `~/.claude/settings.json`, remove it, or you get both.

## What the bar shows

- The model and its context size, the effort level, a 10-cell context meter, your 5-hour usage and how many agents are running.
- Click the model name or the effort level to open a small picker above it and switch. It floats over the prompt; while Claude is working it sits above the bar instead, so the spinner can't draw over it. Both are saved, the same as `/model` and `/effort`.
- On a narrow terminal the items on the right drop off first. The pill always stays.

## Doole's Tools

- The mods you pick sit as filled, round-ended pills at the right end of the bar. Click one to run it. When its reply says it is on (`Diff panel shown`, `Guard is on`), the pill shows a ✓ until a reply says it is off.
- The Doole's Tools pill opens a small box with `✎ choose pills`, which picks them. Mods' own commands are listed first; type in the search box to find any other command.
- Your picks are saved and come back in every session.

Terminal only: the desktop app keeps its own footer.

## Development

```
claude plugin validate .
claude plugin test .
```
