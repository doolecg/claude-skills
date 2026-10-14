# Flightdeck

A Claude Code mod that puts a sidebar beside the transcript showing the main session and every subagent working right now. Each running subagent is a small outlined pixel bar, with its pixel critter beside it, showing its task, nickname, model, context, estimated cost, time and a stop button; finished ones take a line each. It uses the Bottom Bar's colours, light or dark to match your theme.

```
✈ FLIGHTDECK · 2 agents working
╭ ◆ Opus 5.5 · 1M · effort high ──────────── ● working ╮
│⠶⠶⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰ ctx 23% · $1.42 ───────────────── turn 0:57 · 14 req ╯
╭ 5h ──────────────── 31% ╮ ╭ 7d ───────────────── 12% ╮
│⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠀⠀⠀│ │⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰─────────────────────────╯ ╰──────────────────────────╯
AGENTS  ≈$0.02 · 71.9k tokens · 0:06
RUNNING · 2 ───────────────────────────────── ■ Stop all
╭ ✳ Say hi (agent one) ─────────────────── 0:06 ■ stop ╮
│⠀⠂⠀⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰ Mango · Haiku 5.5 · gene… ─ ctx 4% · 35.9k ≈$0.01 ╯
DONE · 1 ─────────────────────────────────────── ✕ Clear
✓ Read the config · Pickle                        0:04 ✕
```

## Install

```
/plugin install flightdeck --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Opening and closing it

- Type `/flightdeck` to open it, and again to close it. `/flightdeck open` and `/flightdeck close` do just that.
- With the Bottom Bar mod it shows in the toolbox as an on/off mode, and you can add `/flightdeck` as a pill in `✎ choose pills`: ● when the sidebar is open, ○ when it is closed.
- In a fullscreen terminal it docks beside the transcript from 110 columns wide; otherwise it sits above the prompt.
- If you leave it open, it opens again in your next session.

## In the Sidebar

With the Sidebar mod installed, Flightdeck can be one of its tabs. It then draws under the Sidebar's tab strip, with its name and a Settings button in place of its own header, and closing it tells the Sidebar. Without the Sidebar it looks as it always did.

## What it shows

- **Main session:** the model and its context size, effort, whether Claude is working, a context meter with the session's cost, your 5-hour and 7-day usage meters (when your plan reports them), how long the turn has run and how many requests it made.
- **Totals:** one line with the subagents' estimated cost, tokens and time.
- **Running:** one outlined bar per running subagent, newest first: the task, its time and a **■ stop** button on the top edge, a moving pixel bar inside, and its nickname, model, type and `ctx % · tokens ≈cost` on the bottom edge. **■ Stop all** in the heading stops every one. Stopping goes through Claude Code's TaskStop tool, so it may ask you first; if an agent cannot be stopped, a toast says why.
- **Done:** one line per finished subagent, ✓ done, ✗ failed or ■ stopped, with its time and an **✕** to clear it. **✕ Clear** in the heading clears them all. Cleared agents stay hidden for the rest of the session.
- The two lists share the room left and each scrolls on its own: the mouse wheel scrolls the list it is over, and a list with more than fits shows a scrollbar. The scroll keys move the whole pane.
- Meters turn amber from 60% and red from 80%.

## Where the numbers come from

- Main session: `turn.step`, `turn.start`, `turn.complete`, `session.measure` and `$.session.usage()`. The cost is the session's own, as `/cost` has it.
- Subagents: `agent.spawn`, each subagent's `turn.step` usage and its `turn.complete`, checked against `$.agent.list()` every 2 seconds while the sidebar is open.
- A subagent's cost is an estimate from list prices (marked ≈) and is left out for a model it has no price for. Its context % uses the model's published window.
- It never blocks, rewrites or delays anything and makes no network requests. The only thing it does is stop an agent when you press stop.

Works in the terminal and in the desktop app.

## Credits

The idea and layout come from [Flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella (MIT). This is a smaller rewrite focused on subagents. The critters come from my older Agents Panel mod, and the pixel bars from Clean View.

## Development

```
claude plugin validate .
claude plugin test .
```
