# Flightdeck 1.4.2

## Changed
- Cards, bars and the agent critters sit on the terminal's own background, like the Bottom Bar.
- The Settings button on its sidebar tab is gone, and the footer no longer shows context used.

---

# Flightdeck 1.4.1

## Changed
- With the Context mod installed, the Sidebar tab has a footer at the bottom: context used, Hindsight and CodeGraph, the git branch and changes, and test passes. The agent lists make room for it.

---

# Flightdeck 1.4.0

## Changed
- Each running agent has its pixel critter again, a small one beside its outlined bar, bobbing while it works.

---

# Flightdeck 1.3.0

## New
- A stop button on each running agent, and Stop all in the Running heading.
- An ✕ on each finished agent to clear it, and Clear in the Done heading. Cleared agents stay hidden for the rest of the session.
- The Running and Done lists scroll on their own: the mouse wheel scrolls the list it is over, and each shows a scrollbar when it has more than fits.

## Changed
- Agents take much less room: a running agent is a 3-row outlined bar with its task, time and stop button on the top edge and its nickname, model and context on the bottom edge. A finished agent is one line.
- Every bar has an outline: context, the 5-hour and 7-day limits, and each agent.
- The Done list keeps every finished agent instead of the last 5.
- The totals are one line, and the pixel critter picture is gone from the agent rows (the nickname stays).
- The Sidebar's tab strip on top shows each tab as a symbol and a word, spread across the full width, with the open tab filled in one accent colour.

---

# Flightdeck 1.2.0

## Changed
- Opens and closes itself when you pick or leave its Sidebar tab, straight away, even while Claude is working.
- The Sidebar's tab strip on top uses the new rounded pill and count badges.

---

# Flightdeck 1.1.0

## New
- Works as a tab in the Sidebar mod: it draws under the Sidebar's tab strip with a title row and a Settings button, and tells the Sidebar when you close it.

## Changed
- Opens at 56 columns wide, the Sidebar's width, instead of 60.
- The bars are now the Sidebar's dense dot-matrix meters, in the Sidebar and on their own.

---

# Flightdeck 1.0.0

## New
- A sidebar beside the transcript showing the main session and every subagent working right now. `/flightdeck` opens and closes it.
- A main session card: model, effort, working or idle, a context meter with the session's cost, 5-hour and 7-day usage meters, and the turn's time and request count.
- A card for each subagent with its own pixel critter and nickname, the task, the model, a pixel progress bar, and its context, tokens, estimated cost and time. Finished ones move to a Finished list.
- Totals for the subagents' cost, tokens and time.
- Rounded cards in the Bottom Bar's colours, light or dark to match your theme, and pixel bars like Clean View's.
- Shows as an on/off mode in the Bottom Bar's toolbox. If you leave it open, it opens again next session.
