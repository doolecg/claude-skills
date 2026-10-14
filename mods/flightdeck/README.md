# Flightdeck

A Claude Code mod that puts a sidebar beside the transcript showing the main session and every subagent working right now. Each subagent gets its own little pixel critter and nickname, a pixel progress bar like Clean View's, and its model, context, tokens, estimated cost and running time. The cards are rounded and use the Bottom Bar's colours, light or dark to match your theme.

```
✈ FLIGHTDECK · 2 agents working                 ■ main ■ agents
╭──────────────────────────────────────────────────────────╮
│ ◆ Opus 5.5 · 1M  effort high                   ● working │
│ ctx ⠶⠶⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀  23% · $1.42 │
│ 5h ⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀  31%   7d ⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀  12% │
│ turn 0:57 · 14 requests                        2 running │
╰──────────────────────────────────────────────────────────╯
  ╎
╭────────────────╮ ╭────────────────╮ ╭────────────────╮
│ ≈$0.02         │ │ 71.9k          │ │ 0:06           │
│ Cost           │ │ Tokens         │ │ Time           │
╰────────────────╯ ╰────────────────╯ ╰────────────────╯

Working · 2
╭──────────────────────────────────────────────────────────╮
│ (critter)    ✳ Say hi (agent one)                        │
│              Mango · general-purpose                     │
│              Haiku 5.5  working                          │
│              ⠀⠂⠀⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠄⠀⠀⠀⠀       │
│              ctx 4% · 35.9k  ≈$0.01  0:06                │
╰──────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install flightdeck --marketplace doolecg/claude-skills
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
- **Totals:** the subagents' estimated cost, tokens and time.
- **Working:** one card per running subagent, newest first: its critter (which bobs while it works), the task, its nickname and type, the model, a moving pixel bar, and `ctx % · tokens  ≈cost  time`.
- **Finished:** the last 5 that ended, with a solid green bar when done, red when failed, and a dim one when stopped.
- Meters turn amber from 60% and red from 80%.

## Where the numbers come from

- Main session: `turn.step`, `turn.start`, `turn.complete`, `session.measure` and `$.session.usage()`. The cost is the session's own, as `/cost` has it.
- Subagents: `agent.spawn`, each subagent's `turn.step` usage and its `turn.complete`, checked against `$.agent.list()` every 2 seconds while the sidebar is open.
- A subagent's cost is an estimate from list prices (marked ≈) and is left out for a model it has no price for. Its context % uses the model's published window.
- It only watches: it never blocks, rewrites or delays anything, and makes no network requests.

Works in the terminal and in the desktop app (where the critters are drawn as SVG).

## Credits

The idea and layout come from [Flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella (MIT). This is a smaller rewrite focused on subagents. The critters come from my older Agents Panel mod, and the pixel bars from Clean View.

## Development

```
claude plugin validate .
claude plugin test .
```
