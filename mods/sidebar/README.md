# Sidebar

A Claude Code mod that gathers your mods into one sidebar beside the transcript. Each mod gets a tab, with its settings a click away, in the Bottom Bar's colours (light or dark to match your theme).

```
╭──────────────────────────────────────────────────────────╮
│ ◆ DOOLE'S SIDEBAR                                    ⋯  ✕ │
│  ✈ Flightdeck  ✶  ✎  ▁                                    │
╰──────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install sidebar --marketplace doolecg/claude-skills
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere. Install the mods you want tabs for as well; the sidebar shows a tab for each one it finds.

## Commands

- `/sidebar` opens it, and again closes it. `/sidebar open` and `/sidebar close` do just that.
- `/sidebar <mod>` opens that mod's tab, for example `/sidebar flightdeck`. `/sidebar tab <id>` does the same.
- `/sidebar settings <id>` opens that mod's settings page.
- If you leave it open, it opens again in your next session.

## Which tabs

- **Drawn by the mod itself:** Flightdeck, Self Improve, Idea Shelf and Folder Tracker. The sidebar opens the mod's pane (`flightdeck open`, `learn open`, `ideas open`, `folders open`) and closes it again when you leave the tab.
- **Drawn by the sidebar:** Clean View (the job running now), Prompt Enhancer, Design Picker, Plain English and Bottom Bar. Each shows what the mod does, its on/off modes and its options.
- The ⚙ Settings button on a mod's own tab opens its settings page, with a Back button.

## The ⋯ page

The sidebar's own settings: show or hide each tab, move them up and down, see which mods are not installed, and pick the Bottom Bar's colour.

## For mod authors

To add a tab for your mod, add it to `CATALOG` in `hooks/logic.ts` and follow this protocol:

- Read the sidebar's `strip` state in your Pane render (`{ plugin: 'sidebar', key: 'strip' }`). Draw as a tab when `isSidebarTab(strip, yourPaneId)` is true.
- Copy `hooks/sidebar-kit.tsx` into your hooks folder (`python copy-kit.py` does it for the listed mods). Draw with `sbFrame` (the strip on top), `sbTitle` (your title row, with a Settings button) and `sbActions` (the strip's buttons).
- Give your mod open and close commands, and list them as `pane` in the catalog. The sidebar runs them when you enter and leave your tab.
- When the person closes your pane, run `/sidebar closed <id>` so the sidebar switches off with it.
- Publish `sidebarBadge` (a number) in your state to show a count on your tab icon. Publish `modes` to show on/off modes on your settings page.

## Development

```
claude plugin validate .
claude plugin test .
python copy-kit.py
```
