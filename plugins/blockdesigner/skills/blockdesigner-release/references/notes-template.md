# Release notes section

Prepend this to `RELEASE_NOTES.md` (newest first), followed by a line with only `---` and a blank line before the
previous release's section. The heading must be exactly `# BlockDesigner <version>` — the publisher checks it and the
update window strips it (its own title already says the version).

```markdown
# BlockDesigner 0.4.8

One or two sentences: what this release is about, for someone deciding whether to update.

## Downloads

| File | Use it if… |
|---|---|
| **BlockDesigner-0.4.8.msi** | You want a normal install. It installs for all users into `C:\Program Files\BlockDesigner` (Windows asks for admin); installing over an earlier version upgrades it in place. |
| **BlockDesigner-0.4.8.exe** | Only for updating from 0.4.6 or earlier (their updater installs it for you); new installs should use the `.msi`. |
| **BlockDesigner-0.4.8-portable.zip** | You don't want to install anything. Unzip it anywhere and run `BlockDesigner.exe`. |

0.4.2 and later update to this by themselves (copies in AppData update there; their next update after that installs with the `.msi`, which moves them to Program Files). 0.4.0 and 0.4.1 need a one-time install by hand: download the `.msi` above.

**Windows Smart App Control:** this build isn't code-signed yet, so on PCs with Smart App Control switched on Windows may block BlockDesigner from starting after an install or update.

## New
- **Feature name:** what the user can now do, and where to find it (menu › item, key).

## Changed
- **What's different:** how it behaves now, and what it replaced.

## Fixed
- **What was wrong** and what happens now.

---

```

Notes on writing them:

- Lead each bullet with a short bold phrase, then plain sentences. Name things the way the UI names them
  (Settings › Keybinds, the Brush options bar) and give default keys where they matter — but remember every key is
  rebindable, so "(default Shift+Z)" rather than implying it's fixed.
- Leave out sections with nothing in them; add "## Docs" or "## For builders of BlockDesigner" only when relevant.
- Drop the Smart App Control paragraph once releases are signed. Adjust the "update to this by themselves" line if the
  installer format or updater behaviour changed in this release (and explain the manual step when they did).
- Tables need a blank line before them inside list items to render; nested bullets are fine (the in-app window renders
  headings, bold, code, links, nested lists and tables).
