# Plugin release notes

`RELEASE_NOTES.md` in each plugin repo, newest section first. Sections are separated by a line with only `---`.
`publish_plugin.py` takes everything above the first `---` as the release body and requires the first line to be
exactly `# <Name> <version>` (the Name part becomes the release title, "<Name> <version>").

## "Kept up to date" release (only the API jars changed)

Copy the previous section's **Needs** line unchanged: the minimum BlockDesigner only moves when the plugin's `api`
level moves, not when it is rebuilt against newer jars.

```markdown
# Resource Tracker 1.0.1

Kept up to date with BlockDesigner 0.4.22: built and tested against its plugin API. Nothing changes in how it works.

**Needs BlockDesigner 0.4.17 or later** (plugin API 5).

## Changed
- Built against the BlockDesigner 0.4.22 plugin API.

---

```

Some plugins' Needs line carries a second sentence ("BlockDesigner 0.4.16 and later update to it by themselves.");
keep it as it was. Other small housekeeping in the same release goes as extra `## Changed` bullets
("README in the same format as BlockDesigner's.").

## Feature release

```markdown
# Palette Tools 1.1.0

One or two sentences: what this release is about, for someone deciding whether to update.

**Needs BlockDesigner 0.4.17 or later** (plugin API 5). BlockDesigner 0.4.16 and later update to it automatically once BlockDesigner itself is on 0.4.17; older ones keep 1.0.2.

## New
- **Feature name:** what the user can now do, and where to find it (the plugin's tab, Plugins menu, a tool, a `/command`).

## Changed
- **What's different:** how it behaves now, and what it replaced.

## Fixed
- **What was wrong** and what happens now.

---

```

- Leave out empty sections. Lead bullets with a short bold phrase, then plain sentences, naming things as the UI does.
- **When the `api` level goes up**, the Needs line changes to the first app version with that level (API 1: 0.3.0,
  2: 0.4.4, 3: 0.4.12, 4: 0.4.14, 5: 0.4.17; newer levels: see the main repo's RELEASE_NOTES.md), and it helps to say
  what happens to users on older BlockDesigners: the in-app updater skips a release whose `api` is newer than the
  app's, so they stay on the previous plugin version until they update BlockDesigner. Update the README's
  "needs **BlockDesigner X or later** (plugin API N)" line and badge too, and (on request) the Needs column of the
  main repo README's plugin table.
- The first release of a plugin: `# <Name> 0.1.0` (or `1.0.0`), "The first release: …", the Needs line, `## New`.

## Commit message

Plain, the version first, no attribution lines:

- `1.0.2: built against the BlockDesigner 0.4.23 plugin API`
- `1.1.0: a Palette tool that repaints the selection in the view, preset gradients`
