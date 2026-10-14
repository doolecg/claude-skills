# Sidebar

A Claude Code mod that gathers your mods into one sidebar beside the transcript. Each mod gets a tab, with its settings a click away, in the Bottom Bar's colours (light or dark to match your theme).

```
╭──────────────────────────────────────────────────────────╮
│ ◆ DOOLE'S SIDEBAR                                    ⋯  ✕ │
│  ✈ Flightdeck       ✺ Improve       ✶ Steps     ◇ Ideas   │
│  ⇄ Folders¹    ✎ Enhance    ◐ Design    ¶ Plain    ▭ Bar  │
╰──────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install sidebar --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere. Install the mods you want tabs for as well; the sidebar shows a tab for each one it finds.

## Commands

- `/sidebar` opens it, and again closes it. `/sidebar open` and `/sidebar close` do just that.
- `/sidebar <mod>` opens that mod's tab, for example `/sidebar flightdeck`. `/sidebar tab <id>` does the same.
- `/sidebar settings <id>` opens that mod's settings page.
- If you leave it open, it opens again in your next session.

## Which tabs

- **Drawn by the mod itself:** Flightdeck, Self Improve, Idea Shelf and Folder Tracker. Each mod opens its own pane when the sidebar's strip names its tab and closes it when you leave the tab. Switching tabs never runs a command, so it works while Claude is busy.
- **Drawn by the sidebar:** Clean View (the job running now), Prompt Enhancer, Design Picker, Plain English, Bottom Bar and Rule Guard (the calls it stopped this session, and its rules as switches). Each shows what the mod does, its on/off modes and its options.
- The ⚙ Settings button on a mod's own tab opens its settings page, with a Back button.

## The footer

With the Context mod installed, every tab has a footer at the bottom: how much context is used, whether Hindsight answers and the repo has a CodeGraph index, the git branch with its changed files, and the test passes against your limit. Its ⚙ opens Context's settings.

## The ⋯ page

The sidebar's own settings: show or hide each tab, move them up and down, see which mods are not installed, and pick the Bottom Bar's colour.

## For mod authors

To add a tab for your mod, add it to `CATALOG` in `hooks/logic.ts` and follow this protocol:

- Read the sidebar's `strip` state in your Pane render (`{ plugin: 'sidebar', key: 'strip' }`). Draw as a tab when `isSidebarTab(strip, yourPaneId)` is true.
- Copy `hooks/sidebar-kit.tsx` into your hooks folder (`python copy-kit.py` does it for the listed mods). Draw with `sbFrame` (the strip on top), `sbTitle` (your title row, with a Settings button) and `sbActions` (the strip's buttons).
- Register a command for your mod and list it as `pane` in the catalog (it shows the sidebar your mod is loaded). Follow the strip: on `state.set` of `{ plugin: 'sidebar', key: 'strip' }`, call `sbPaneMove(id, e.value, e.previous)` and open your pane on `open`, close it on `close`.
- Ask the sidebar for things by writing your own `sidebarAsk` state (`{ args, n }`, `n` counting up), never with `$.command.run`. `sbAsker` wires the strip's presses to it and closes your pane first when a press leaves your tab.
- When the person closes your pane, write `sidebarAsk` with `closed <id>` so the sidebar switches off with it.
- Publish `sidebarBadge` (a number) in your state to show a count on your tab icon. Publish `modes` to show on/off modes on your settings page.
- Pass `sbRows(e.props)` as `sbKit`'s last argument so the footer sits at the bottom of a docked pane. A tab that fills the pane's height itself takes `sbFooterRows(strip)` off what it fills.

## Development

```
claude plugin validate .
claude plugin test .
python copy-kit.py
```
