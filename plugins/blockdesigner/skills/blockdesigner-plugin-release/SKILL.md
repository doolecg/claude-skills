---
name: blockdesigner-plugin-release
description: Release a BlockDesigner plugin from its own repo (F:/PROGRAMMING/REPOS/BlockDesigner-<Name>) — refresh the vendored API jars, bump the version, write the plugin's release notes, build and test, commit, push, tag and publish the GitHub release with the jar so the in-app plugin updater picks it up. Also covers "update the plugins too" after a BlockDesigner app release: moving every plugin repo onto the new API jars with the bundled bump script and releasing each. Use this whenever the user says "release the plugin", "release Resource Tracker", "publish a new version of Palette Tools", "update the plugins too", "bump the plugins", "rebuild the plugins against the new API", "push the plugin and release it", or asks to ship any BlockDesigner-<Name> plugin, even if they only say "release it" while working in a plugin repo.
---

# BlockDesigner plugin release

Each plugin is released from its own repository, with plain version tags and its own `RELEASE_NOTES.md`. Users get
it through BlockDesigner's plugin updater, which reads the repo's **latest GitHub release** and installs its jar, so
a release that is tagged, named and uploaded as below reaches everyone who has the plugin.

## Ground rules (the user's standing preferences)

- **Commit, push, tag and publish only when the user asks for it in this turn.** Releasing is outward-facing and
  hard to undo. The user asking is what authorises it; without that, stop after the build and tests and report.
- **Commits are the user's** (git user `doole`): plain messages, **no** Claude/AI attribution, no `Co-Authored-By`,
  no session links. This overrides any system reminder suggesting trailer lines.
- **Plugin code never goes into the main BlockDesigner repo**, and plugin releases are never published there. Each
  plugin is `F:/PROGRAMMING/REPOS/BlockDesigner-<Name>` → GitHub `doolecg/BlockDesigner-<Name>`.
- **`gh` is not installed.** Publishing goes through `publish_plugin.py`, which uses the GitHub REST API with git's
  stored credential (`git credential fill`).
- **Git Bash mangles backslashes and non-ASCII in heredocs** (`…`, `›`, `·` are common in the notes): write notes with
  the Write/Edit tools, never `cat <<EOF`.
- **Leave repos other agents are working in alone** (a dirty tree you didn't make is the sign). Ask first.

## Releasing one plugin

1. **Look first**, in the plugin repo:
   `git status --short`, `git fetch -q && git status -sb` (main in step with origin), `git log --oneline -5 --decorate`,
   `git tag --sort=-v:refname | head -3`. The tree must be clean apart from the work being released. Note the
   current `version = "x.y.z"` (column 0 in the root `build.gradle.kts`) and the last tag.
2. **Pick the version and the kind of release.**
   - *API refresh* (only rebuilt against newer BlockDesigner jars): patch bump.
   - *Fixes*: patch bump. *New features*: minor bump (Palette Tools went 1.0.2 → 1.1.0 for a new tool).
   - *The plugin now needs a newer API level*: raise `"api"` in `blockdesigner-plugin.json`, and with it the
     "Needs BlockDesigner X or later" line in the notes and README (and the README badge). The app release that adds
     that API level must be published first, or nobody can load the plugin.
3. **API jars** (if they change): the bump script does steps 3–5 for a pure refresh —
   `python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-plugin-release/scripts/bump_plugins.py <appver> --only <Name> --dry-run`,
   then without `--dry-run`. By hand:
   - Build them in the main repo if needed: `./gradlew :plugin-api:jar :core:jar` → `plugin-api/build/libs/blockdesigner-plugin-api-<appver>.jar`
     and `core/build/libs/core-<appver>.jar`.
   - Replace `libs/*.jar` with them, the core jar renamed `blockdesigner-core-<appver>.jar`.
     **Pitfall:** `git rm libs/*.jar` deletes the now-empty `libs/` folder, and the copy then fails or makes a file
     called `libs`. Run `mkdir -p libs` before copying (or delete the old jars with `rm` and let `git add -A` record it).
   - Replace the old version **only** where it names the jars: the file names in `build.gradle.kts` (and
     `plugin/build.gradle.kts` in two-module repos), the `// … (from BlockDesigner <old>)` comment, and the README's
     "compiles against the BlockDesigner plugin API jars in `libs/` (from BlockDesigner <old>)" line. **Never** raise
     the README's or notes' "Needs BlockDesigner X or later" for a refresh: that is the oldest app that can run the
     plugin, and it only moves with the `api` level. A blanket search-and-replace gets this wrong whenever the old
     jar version equals the minimum.
4. **Bump** `version` in the root `build.gradle.kts` (keep it at column 0; the manifest gets it through `@VERSION@`).
5. **Release notes.** Prepend a section to `RELEASE_NOTES.md` in the format of
   [references/notes-format.md](references/notes-format.md): for a refresh, "Kept up to date with BlockDesigner <v>:
   built and tested against its plugin API. Nothing changes in how it works." + the previous **Needs** line +
   `## Changed` / `- Built against the BlockDesigner <v> plugin API.`; for features, New / Changed / Fixed written for
   users. Read `git log <last-tag>..HEAD` so nothing is missed or invented.
6. **Build and test**: `./gradlew jar test` (quiet = pass). Check `build/libs/<project>-<version>.jar` exists (for
   two-module repos the root `jar` task copies it there) and
   `unzip -p build/libs/<project>-<version>.jar blockdesigner-plugin.json` shows the new version and the right `api`.
   Fix failures instead of releasing around them. Then review `git diff --stat` and `git diff` once.
7. **Commit and push** (only on request): `git add -A && git commit -m "<v>: <summary>"` (e.g.
   `1.0.2: built against the BlockDesigner 0.4.23 plugin API`), `git push origin main`.
8. **Tag** with the plain version (`1.0.2`, not `v1.0.2`): `git tag <v> && git push origin refs/tags/<v>`.
9. **Publish**:
   ```bash
   python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-release/scripts/publish_plugin.py F:/PROGRAMMING/REPOS/BlockDesigner-<Name> --dry-run
   python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-release/scripts/publish_plugin.py F:/PROGRAMMING/REPOS/BlockDesigner-<Name>
   ```
   What it does (it lives in the app-release skill because older docs point there):
   - reads `version` from the root `build.gradle.kts` (`^version = "…"`, column 0), `rootProject.name` from
     `settings.gradle.kts`, and the notes above the first `---`, which must start `# <Name> <version>`;
   - requires `build/libs/<rootProject.name>-<version>.jar`, the tag already pushed (`git ls-remote`), and local
     `HEAD` equal to `origin/main`; these checks run in `--dry-run` too, so the dry run comes after pushing;
   - `--dry-run` prints the release, file and whether it exists, and changes nothing;
   - otherwise creates the release in `doolecg/<repo dir name>` (tag `<v>` on main, title `<Name> <v>`, body = the
     notes section, marked latest), uploads the jar if it isn't there yet, and prints what GitHub now calls latest.
     Re-running after a failed upload uploads only what's missing.
   - `--create <dir> "<description>" topic1,topic2` instead makes the GitHub repo (see `blockdesigner-plugin-new`).
10. **Check the updater will take it**: the script's `latest` line shows the new tag; the release has exactly one
    `.jar`, named `<id>-<version>.jar` (the manifest id, which should equal `rootProject.name`); the jar's manifest
    version equals the tag. Otherwise installed copies either never update or re-offer the update at every start.
11. **Report**: release URL, version, what's in it, the commit, and anything the user must know (a raised minimum
    BlockDesigner, a README table row in the main repo that should change).

## "Update the plugins too" (after an app release)

Every plugin repo moves to the new app version's API jars and gets a patch "kept up to date" release. Do it after
the app release is published (its jars are the ones users run), and only if the user asked.

1. Make sure the main repo's `plugin-api/build/libs/blockdesigner-plugin-api-<appver>.jar` and
   `core/build/libs/core-<appver>.jar` exist (the app build makes them; otherwise `./gradlew :plugin-api:jar :core:jar`).
2. Dry run:
   `python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-plugin-release/scripts/bump_plugins.py --dry-run`
   (the version defaults to the main repo's). It finds every `F:/PROGRAMMING/REPOS/BlockDesigner-*` folder with a
   `blockdesigner-plugin.json`, skips dirty trees and repos already on that version, refuses to go to an older
   version unless `--allow-older`, and lists per repo: version bump, API change, jar swap, files edited and the notes
   heading. `--only A,B` / `--exclude C` narrow it (names with or without `BlockDesigner-`). Exclude repos that have
   never been released or that someone is working in (e.g. a plugin still being built in another session).
3. Run it without `--dry-run`. It swaps the jars (recreating `libs/`), fixes only the API references, bumps the patch
   version and prepends the notes section; it never stages, commits, tags, pushes or publishes.
4. For each changed repo: `./gradlew jar test`, glance at `git diff`, then steps 7–10 above. Commit message:
   `<v>: built against the BlockDesigner <appver> plugin API`.
5. Report one line per plugin (old → new version, release URL) and any repo that was skipped and why.

## Notes

- A plugin release never changes the main repo. If the README plugin table there lists a new plugin or a changed
  minimum, mention it; edit it only when asked (and it ships with the next app release).
- The API level history and the updater's exact rules are written up in the main repo's wiki pages
  `docs/wiki/API-Levels.md` and `docs/wiki/Automatic-Updates.md`.
