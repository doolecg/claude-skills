# Settings page reference

## Requirements

1. **Every option the app has is on the page.** No option exists only in a config file. A feature that adds an option adds it to the page in the same change.
2. **Applied live.** A control takes effect immediately. If one truly needs a restart, mark it (Operant: `RESTART_KEYS` in `renderer/settings.js`, with a hint) and offer a restart button. Keep those rare.
3. **Saved.** One JSON file in the user data folder (JavaFX: `%APPDATA%/<App>/settings.json`, overridable with a `-D<app>.dataDir` property for portable builds; Electron: `app.getPath('userData')`). Write atomically (temp file, then rename; Operant: `atomic-write.js`). Ignore unknown fields on load, fill missing ones with defaults, migrate explicitly.
4. **Defaults in one place**, so reset has something to reset to.
5. **Reset per section** ("Reset to defaults" in each section header), plus reset-all for keybinds.
6. **Search box** once there are more than about 20 options (Operant and BlockDesigner both have one).
7. **Updates section:** Update automatically, Check every N hours, Check now, current version, link to release notes.
8. **Keybinds section:** see below.
9. Opens from a keybind (BlockDesigner: `Shortcut+Comma`) and from a menu or button.

## Keybinds

- A registry of actions: id, group, label, default combination(s). Up to two combinations per action (BlockDesigner) or a list (Operant).
- Store only the user's changes as strings (BlockDesigner `Settings.keybinds`, e.g. `"Ctrl+Shift+J|Z"`), so defaults can change in later versions.
- UI: one row per action, grouped. A button per slot shows the key. Click it: it reads "Press a key...", capture the next combination, consume the event, save, refresh. Esc cancels; losing focus cancels. A clear (X) button per slot. A reset button per row, disabled when already default. Warn on conflicts (BlockDesigner: `Keybinds.usersOf(combo, except)`).
- Capture must swallow the key (so Alt, F10 or Esc do not trigger the app) and ignore a lone modifier press, unless the action is a held key.
- Dispatch reads the registry at event time, never a hard-coded key, so a rebind applies live.
- Tooltips and menus show the current key from the registry (`Keybinds.keyOf`, `tooltip`).
- Fixed keys (not rebindable, such as Alt+1..9) are listed as read-only chips, not hidden.

## JavaFX reference (BlockDesigner)

- Store: `F:/PROGRAMMING/REPOS/BlockDesigner/app/src/main/java/io/blockdesigner/app/Settings.java`. Public fields with defaults, Jackson `@JsonIgnoreProperties(ignoreUnknown = true)`, `load()` (~196), `save()` (~239). Change the field, call `save()`.
- Page: `.../app/ui/SettingsDialog.java`. Sections; per-section "Reset to defaults" (~168, ~433); keybinds page with search and "Reset all" (~472); per-row reset (~653).
- Keybinds: `.../app/ui/Keybinds.java`. `Group` and `Action` enums with defaults (`"Shortcut+Z"`; `Shortcut` is Ctrl or Cmd), `get/set/reset/resetAll/isDefault/matches/usersOf`, `fromEvent`/`heldFromEvent` (a `KeyEvent` to a `KeyCombination`).
- Capture widget: `SettingsDialog.java` ~690-740. A `Button` with style class `keybind-listening`; a `KEY_PRESSED` event filter that consumes the event and calls `a.set(slot, got)`; a focus listener that cancels; a `KEY_RELEASED` filter that consumes; a clear button.
- Plugin keys: `.../ui/PluginKeys.java` (one key per plugin action, same UI).
- Window bounds, panel widths and last version are kept in `Settings` too, so the app reopens as it was left.

## Electron reference

- Operant (JS): `F:/PROGRAMMING/REPOS/Operant/renderer/settings.js`. A `SECTIONS` array of `{key, label, hint, type}` rows (`toggle`, `number`, ...) drives the page and its search (`settingsIndex`); `RESTART_KEYS`. Keybinds: `GROUPS` (~936) maps action ids to labels; `renderKeys(body, keybinds, recording, {onAdd, onRemove})` renders chips with a `+` chip that turns into "press keys... (Esc cancels)" while recording, and a remove button per chip. The main process holds `config` in `main.js` and reacts to patches (~455 for `updateCheckHours`). Contract test: `test/settings-contract.test.js`.
- Operant2 (TS/React): `F:/PROGRAMMING/REPOS/Operant2/shared/settings.ts` (types and defaults, including `updates.installOnQuit`), `renderer/src/components/settings/sections/GeneralSection.tsx` and `ShortcutsSection.tsx`, `renderer/src/registry.ts`.
- Pattern: settings live in the main process. The renderer sends a patch over IPC; main validates, saves, applies side effects (reschedule the updater, theme), then broadcasts the new settings to every window.
- Add a test that fails when an option exists in the defaults but not on the page (Operant's `settings-contract.test.js`).
