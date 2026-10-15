# Mod Settings

A side panel in the Claude desktop app with every installed mod's settings in one place. Each mod is a card; open one to see its settings and change them right there.

## Install

```
/plugin install mod-settings --marketplace doolecg/dooles-tools
```

## Use

- Type `/doole_settings` in the Code tab to open the panel.
- Each mod with settings is a card, in name order, with how many settings it has. Press a mod's name to open its card; press it again to close it.
- On/off settings are On and Off buttons. Choices are a drop-down. Text and number settings are a field with a Save button; a number field refuses anything that isn't a number.
- A line under the header says what changed, or why a change was refused.
- Refresh reads the settings again, for changes made elsewhere (such as `/config`).

With the Main Menu (the `sidebar` plugin) installed and open, Mod Settings is its last tab: `/doole_settings` switches the menu to that tab, and the panel opens at the menu's width with the menu's tab strip above the settings. Without the Main Menu it is the plain panel.

Changes go through Claude Code's own settings, the same as `/config`, so they are saved and other mods see them.

## Limits

- Desktop app only. In the terminal the panel just points you to `/config`.
- It lists every installed plugin that has settings, not only Doole's mods. Claude Code's own settings are left out.
- A setting a managed policy owns shows its value and "locked", and can't be changed.
- On the phone there are no drop-downs or fields, so only on/off settings can be changed there; the rest show their value.
- The panel doesn't notice changes made elsewhere until you press Refresh or reopen it.
- Restart Claude Code after installing or updating so it loads.
