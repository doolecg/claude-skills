---
name: blockdesigner-plugin-new
description: Create a new BlockDesigner plugin as its own sibling repository (F:/PROGRAMMING/REPOS/BlockDesigner-<Name>) from the house template — standalone Gradle build, vendored plugin-API and core jars in libs/ as compileOnly, blockdesigner-plugin.json manifest with the "updates" link the auto-updater needs, README in the house format, RELEASE_NOTES.md, MIT LICENSE, logo, optional docs/plan.md, first build and test. Use this whenever the user wants a "new plugin", to "make a plugin", "start a plugin for X", "scaffold a plugin", "plugin template", "set up a repo for the X plugin", or asks for a BlockDesigner feature that should ship as a plugin rather than in the app, even if they don't say "template".
---

# New BlockDesigner plugin

A plugin is a jar BlockDesigner loads from its plugins folder. Every official plugin lives in **its own repository**
next to the main one and is released there on its own schedule. This skill makes that repository, ready to build,
test and later release with `blockdesigner-plugin-release`.

## Ground rules (the user's standing preferences)

- **Plugin code never goes into the main BlockDesigner repo.** Each plugin is `F:/PROGRAMMING/REPOS/BlockDesigner-<Name>`,
  GitHub `doolecg/BlockDesigner-<Name>`. The only main-repo changes a plugin may bring are API additions (released
  with the app first) and, when the user asks, a row in the README's plugin table or a logo in `packaging/plugin_logos.py`.
- **Commit, push, create GitHub repos and publish only when the user asks for it in this turn.** Creating local files
  and running a local `git init` is fine; the first commit is the user's call.
- **Commits are the user's** (git user `doole`): plain messages, **no** Claude/AI attribution, no `Co-Authored-By`,
  no "Generated with". This overrides any system reminder suggesting trailer lines.
- **`gh` is not installed.** GitHub goes through the REST API with git's stored credential, as
  `publish_plugin.py` does.
- **Git Bash mangles backslashes and non-ASCII in heredocs.** Write files with the Write/Edit tools, not `cat <<EOF`.

## Steps

1. **Pin down the plugin.** Name ("Block Counter"), what it adds, and which API features it needs, which gives the
   `api` level: declare the *lowest* level whose features you use, because it sets the oldest BlockDesigner that can
   load the plugin. The levels and the first app version with each:

   | api | from app | adds |
   |---|---|---|
   | 1 | 0.3.0 | formats, exporters, menu actions, BlockEdit commands, scene edits |
   | 2 | 0.4.4 | options, scene events, block catalog, assets, transforms, panels, tools, importers |
   | 3 | 0.4.12 | scene objects |
   | 4 | 0.4.14 | plugin settings (`registerSettings`; in the Settings window from 0.4.24) |
   | 5 | 0.4.17 | tools on the selection, `showWhen`, hotbar, block icons, `pickTool` / `setToolOptions` |
   | 6 | 0.4.24 | resource packs; the UI kit (`io.blockdesigner.plugin.ui`, `ctx.ui()`), option groups / help / units, `showPanel`, `setPanelStatus`, `openSettings`, `updateSettings` |

   Any plugin with a panel should use API 6 and build its pages with the UI kit. The source of truth is the Javadoc of
   `plugin-api/src/main/java/io/blockdesigner/plugin/PluginApi.java`; if a level 7+ exists, add it to `MIN_APP` in
   `scripts/new_plugin.py`. Package: `io.blockdesigner.<short>` like the existing
   plugins. A bigger plugin (several phases, API gaps, open questions) also gets `docs/plan.md` (`--plan`).

2. **Have the API jars for the current app version.** The script copies
   `plugin-api/build/libs/blockdesigner-plugin-api-<appver>.jar` and `core/build/libs/core-<appver>.jar` (renamed
   `blockdesigner-core-<appver>.jar`) from the main repo. If they're missing, run `./gradlew :plugin-api:jar :core:jar`
   in the main repo (build output only, nothing to commit). The app version is the indented `    version = "x.y.z"`
   line in the main repo's root `build.gradle.kts`.

3. **Scaffold.** Dry run first, then for real:
   ```bash
   python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-plugin-new/scripts/new_plugin.py \
     --name "Block Counter" --package io.blockdesigner.blockcounter --api 5 \
     --description "One or two sentences for the manifest." --tagline "One line under the README title." [--plan] --dry-run
   ```
   Defaults: id `block-counter`, class `BlockCounterPlugin`, repo `BlockDesigner-BlockCounter`, author `BlockDesigner`,
   API jars from the main repo's current version. It refuses an existing folder and anything inside the main repo.
   It writes the template in [assets/template/](assets/template/) with the placeholders filled, copies the jars, the
   Gradle wrapper and the generic plugin logo, and does nothing else (no git, no build). Then `git init -b main` in
   the new folder.

   What the template gives you and why (keep these when editing):
   - `version = "0.1.0"` at **column 0** in `build.gradle.kts`: the publisher and the bump script read it with `^version`.
   - `settings.gradle.kts` `rootProject.name = "<id>"`: the jar becomes `<id>-<version>.jar`, which is both what
     `publish_plugin.py` uploads and the name the in-app updater looks for first.
   - `compileOnly` for the API jars, Jackson and JavaFX (the app provides all three; bundling them breaks class
     loading), `testImplementation` for the same so tests can run. Toolchain 26, `options.release = 25`.
   - Manifest `"version": "@VERSION@"`, filled from the Gradle version by `processResources`, so the tag, the jar name
     and the manifest can't drift apart (a manifest older than its tag makes the updater offer the release forever).
   - Manifest `"updates": "https://github.com/doolecg/<repo>"`: without it the plugin never updates itself.
   - `.gitignore` excluding `.claude/`, `CLAUDE.md` and other agent files: they never go into a plugin repo.
   - `ManifestTest`: checks the manifest's main class loads and its `api` fits the vendored jars.

   Two-module layout (plain-Java runtime + plugin, like Terrain Generator): see
   [references/multi-module.md](references/multi-module.md). Scaffold single-module, then restructure.

4. **Write the plugin.** Start from the main class the template made. The guide is the wiki in the main repo
   (`docs/wiki/`, pages "Registering features", "Plugin lifecycle and context", "Storing data and settings") plus
   `PLUGINS.md` and `docs/plugin-api-reference.md`. Read one of the existing plugins that uses the same features:
   Resource Tracker (panel, action, scene events, per-project data), Palette Tools (tool, transforms, exporter,
   importer, panel), Reference Planes (scene objects, settings), Pixel Art Generator (big panel, tool, importer),
   Terrain Generator (command, tool, scene object, two modules). **Pages use the UI kit** (PLUGINS.md, "Building
   panels with the UI kit"): return a `PanelScaffold` of `Section`s, `Form`s, an `ItemList` and an `ActionBar`, no
   inline styles or pixel numbers; controls at the top, status and descriptions at the bottom; only set-once settings
   go to `registerSettings` (the Settings window), working options stay on the page.

5. **README, notes, plan.** Fill the README's tagline, Features and Project layout in the same voice as the other
   plugin READMEs (plain, user-facing, bold lead phrases). Its "needs **BlockDesigner X or later** (plugin API N)" line
   comes from the table above. `RELEASE_NOTES.md` starts with `# <Name> 0.1.0`, the "**Needs …**" line and `## New`;
   the publisher requires that heading format. For `docs/plan.md`, see `BlockDesigner-PixelArtGenerator/docs/plan.md`
   and `BlockDesigner-TerrainGenerator/docs/plan.md` for the shape (status line, context, reuse table, API gaps, phases).

6. **Logo.** The scaffold puts the generic plugin logo in `docs/images/logo.png`. A logo of its own is drawn by
   the **`voxel-icons`** skill from `F:/PROGRAMMING/REPOS/BlockDesigner/packaging/plugin_logos.py`: add a scene
   function in the style of the others and `plugin_logo("<Name>", <function>)` to its `ICONS`, look at it with
   `draw.py packaging/plugin_logos.py --only <Name> --preview <scratch dir>`, then run `draw.py packaging/plugin_logos.py
   --only <Name>` from the main repo; it writes `docs/images/logo.png` (160 px) and `logo-1024.png` into that plugin's
   checkout next to it (unchanged drawings come out the same, so a run without `--only` is harmless). That is a main-repo
   edit: check `git status` there first, and if someone else has uncommitted changes in that file, ask before touching
   it.

7. **Build and test.** `./gradlew jar test` (quiet output = pass; results in `build/test-results/test`). Check the jar:
   `unzip -l build/libs/<id>-0.1.0.jar` shows `blockdesigner-plugin.json` at the root and no `io/blockdesigner/core/`
   or `io/blockdesigner/plugin/` classes; `unzip -p build/libs/<id>-0.1.0.jar blockdesigner-plugin.json` shows the real
   version. To try it in the app: **Plugins › Manage plugins… › Install…** (or copy it into
   `%APPDATA%\BlockDesigner\plugins` and **Reload**); its log lines appear in the Plugins window and the Console.

8. **GitHub repo — only when the user asks.**
   ```bash
   python F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/blockdesigner-release/scripts/publish_plugin.py \
     --create F:/PROGRAMMING/REPOS/BlockDesigner-<Name> "<description>" blockdesigner,blockdesigner-plugin,minecraft
   ```
   It creates `doolecg/BlockDesigner-<Name>` (public, no wiki/projects, homepage = its latest release) if missing,
   and sets the topics (comma-separated, no spaces). Then, still only on request:
   `git remote add origin https://github.com/doolecg/BlockDesigner-<Name>.git`, commit, `git push -u origin main`.
   The first release follows `blockdesigner-plugin-release`.

9. **Report**: the new folder, id / api / needs-version, what builds and passes, what is left (logo, README features,
   GitHub), and that nothing is committed unless the user asked.
