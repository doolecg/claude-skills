# Sidebar

A Claude Code mod that gathers your mods into one sidebar beside the transcript. Each mod gets a tab, in the Bottom Bar's colours (light or dark to match your theme).

```
╭──────────────────────────────────────────────────────────╮
│ ◆ DOOLE'S SIDEBAR                                    ⋯  ✕ │
│  ✈ Flightdeck       ✺ Improve       ✶ Steps     ◇ Ideas   │
│  ✎ Enhance    ▭ Bar    ⊘ Rules                        │
╰──────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install sidebar --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere. Install the mods you want tabs for as well; the sidebar shows a tab for each one it finds.

## Commands

- `/sidebar` opens it, and again closes it. `/sidebar open` and `/sidebar close` do just that.
- `/doole_sidebar` does the same as `/sidebar`.
- `/sidebar <mod>` opens that mod's tab, for example `/sidebar flightdeck`. `/sidebar tab <id>` does the same.
- If you leave it open, it opens again in your next session.

## Which tabs

- **Drawn by the mod itself:** Flightdeck, Self Improve and Idea Shelf. Each mod opens its own pane when the sidebar's strip names its tab and closes it when you leave the tab. Switching tabs never runs a command, so it works while Claude is busy.
- **Drawn by the sidebar:** Clean View (the job running now), Prompt Enhancer, Bottom Bar and Rule Guard (the calls it stopped this session). Each shows what the mod does and points to `/plugin` › Installed › the mod › Configure, where all mod options live.

## The footer

With the Context mod installed, every tab has a footer at the bottom: whether Hindsight answers and the repo has a CodeGraph index, the git branch with its changed files, and the test passes against your limit.

## The ⋯ page

The sidebar's own page: show or hide each tab, move them up and down, and see which mods are not installed.

## Settings

Set in Mod Settings (`/doole_settings`) in the desktop app, or in `/config` in the terminal.

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | on | Off stops the Sidebar opening or drawing; `/sidebar` then says it is off. |
| Tab it opens on | last used | The tab shown when the Sidebar opens: last used, the Sidebar's own tab, or a particular mod (falls back to the first tab if that mod's tab is not showing). |
| Reopen at session start | on | Reopen the Sidebar in a new session if it was left open. |
| Show the footer | on | Context's footer at the bottom of every tab. |
| Show tab badges | on | The number badges other mods put on their tabs. |

## For mod authors

To add a tab for your mod, add it to `CATALOG` in `hooks/logic.ts` and follow this protocol:

- Read the sidebar's `strip` state in your Pane render (`{ plugin: 'sidebar', key: 'strip' }`). Draw as a tab when `isSidebarTab(strip, yourPaneId)` is true.
- Copy `hooks/sidebar-kit.tsx` into your hooks folder (`python copy-kit.py` does it for the listed mods). Draw with `sbFrame` (the strip on top), `sbTitle` (your title row) and `sbActions` (the strip's buttons).
- Register a command for your mod and list it as `pane` in the catalog (it shows the sidebar your mod is loaded). Follow the strip: on `state.set` of `{ plugin: 'sidebar', key: 'strip' }`, call `sbPaneMove(id, e.value, e.previous)` and open your pane on `open`, close it on `close`.
- Ask the sidebar for things by writing your own `sidebarAsk` state (`{ args, n }`, `n` counting up), never with `$.command.run`. `sbAsker` wires the strip's presses to it and closes your pane first when a press leaves your tab.
- When the person closes your pane, write `sidebarAsk` with `closed <id>` so the sidebar switches off with it.
- Publish `sidebarBadge` (a number) in your state to show a count on your tab icon.
- Pass `sbRows(e.props)` as `sbKit`'s last argument so the footer sits at the bottom of a docked pane. A tab that fills the pane's height itself takes `sbFooterRows(strip)` off what it fills.

## Development

```
claude plugin validate .
claude plugin test .
python copy-kit.py
```
