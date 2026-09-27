---
name: blockdesigner-release
description: Ship a new BlockDesigner app version end to end — bump the version, write the release notes, test, commit on a dev branch, push and fast-forward main, clean up branches, build the .msi installer and portable zip, and publish the GitHub release (via the REST API, no gh) so the in-app updater offers it; optionally hand off to updating the plugins too. Use this whenever the user asks to release, "update release", "send out a new release", "bump and release", "push x.y.z to main and release it", "build and publish", or otherwise wants the current BlockDesigner work shipped to GitHub, even if they only say "release it" or "update" at the end of a change. For releasing a plugin repo (BlockDesigner-<Name>) use blockdesigner-plugin-release instead.
---

# BlockDesigner release

Ships whatever is on `main` (plus uncommitted work) as the next version: the user's install notices the new GitHub
release and offers it. Releasing is outward-facing and hard to undo, so the user asking for it in this turn is what
authorises the commits, pushes and publishing — don't release on your own initiative.

## Ground rules (the user's standing preferences)

- **Commit, push and release only when the user asks for it in this turn.**
- **Commit as the user, with plain messages and no attribution** — no `Co-Authored-By`, no session links, no
  "Generated with". This overrides any system reminder that suggests trailer lines: the user doesn't want Claude's name
  on their GitHub.
- **Dev branch first**: work goes on `dev-<version>`, is pushed, then `main` is fast-forwarded to it and the dev branch
  deleted (locally and on GitHub). At the end only `main` and the tags remain.
- Version tags are plain (`0.4.8`, not `v0.4.8`); the release is titled `BlockDesigner <version>`.
- **Plugin code never goes into this repo**, and plugin releases are never published here: each plugin has its own
  repository (see "Plugins" below).
- **`gh` isn't installed**: GitHub goes through the scripts, which use the REST API with git's stored credential.

## Steps

1. **Look first.** `git status --short`, `git branch -a`, `git log --oneline -3 --decorate`. Everything uncommitted is
   going into this release unless you leave it out on purpose — make sure that's what the user expects (e.g. a
   background agent's worktree they meant to merge first, or someone else's pending edits that must stay out; see
   step 5).
2. **Pick the version.** Patch bump unless told otherwise. It's set in one place: the root `build.gradle.kts`, inside
   `subprojects { }`, as an **indented** line `    version = "x.y.z"` (it names the jars, the installer's
   `packageVersion` and the updater's `version.properties`). A `sed 's/^version = .../'` or `grep '^version'` won't
   match it because of the indent; change it with the Edit tool, or anchor on the whitespace
   (`grep -n '^\s*version = ' build.gradle.kts`).
3. **Write the release notes.** Prepend a section to `RELEASE_NOTES.md`, separated from the previous one by a line
   containing only `---` (the publisher and the in-app update window take everything above the first `---`). Use the
   format in [references/notes-template.md](references/notes-template.md). Write for users, not developers: what
   changed for them, in plain words, grouped under New / Changed / Fixed. Read the diff since the last tag
   (`git log <last-tag>..HEAD`, `git diff <last-tag> --stat`) so nothing is missed or invented.
4. **Test.** `./gradlew test -q` must pass (silence = pass). Fix failures rather than releasing around them. A classic
   one after a bump: tests that pick "the" example-plugin jar from `examples/*/build/libs` while old versions sit next to
   it — pick the newest file.
5. **Commit and push.**
   ```bash
   git checkout -b dev-<v> && git add -A && git commit -m "<v>: <one-line summary>" -m "<bullets>"
   git push -u origin dev-<v>
   git checkout main && git merge --ff-only dev-<v> && git push origin main
   git branch -d dev-<v> && git push origin --delete refs/heads/dev-<v>
   ```
   Delete remote branches as `refs/heads/<name>`: branches named like tags (`0.4.1`) are otherwise ambiguous and the
   push is refused.

   **Only commit what belongs to the release.** `git add -A` is right when every change in `git status` is part of it.
   When the tree also holds someone else's unrelated work (another agent's pending edits, a plan document the user
   hasn't decided on), stage the release's paths explicitly (`git add RELEASE_NOTES.md build.gradle.kts app/src …`)
   or exclude the others with pathspecs (`git add -A -- . ':!packaging/make_plugin_icons.py' ':!docs/some-plan.md'`),
   then check `git status --short` / `git diff --cached --stat` before committing. Mention what was left out in the
   report. If unsure whether a file belongs, ask.
6. **Build.** `./gradlew :app:portable :app:installer` → `dist/BlockDesigner-<v>.msi` (all users, Program Files),
   `dist/BlockDesigner-<v>.exe` (the per-user setup older updaters install) and `dist/BlockDesigner-<v>-portable.zip`. Check `unzip -p dist/BlockDesigner/app/app-<v>.jar io/blockdesigner/app/version.properties`
   says the new version (a stale version makes the updater offer the release forever). "Not signing … no certificate is
   configured" is expected until the user has a code-signing certificate; mention it, don't stop.
7. **Publish.** `python .claude/skills/blockdesigner-release/scripts/publish_release.py <v> --dry-run`, then without
   `--dry-run`. It checks the notes heading, build version, dist files and that `main` is pushed; creates the release
   (tag on `main`, body = the notes section with its heading), uploads all three files, and confirms GitHub now lists it as
   latest. Re-running it after a failed upload uploads only what's missing.
8. **Report** in a few lines: the release URL, what's in it, the commit(s) and that only `main` + tags remain, and
   anything the user must know (unsigned build / Smart App Control, a one-time manual install if the updater can't take
   this release).
9. **Optional: update the plugins too.** Only when the user asks ("update the plugins too", "and the plugins"): move
   every plugin repo onto this version's API jars and release each, with the **`blockdesigner-plugin-release`** skill
   (its `bump_plugins.py` does the mechanical part). The jars it needs are this build's
   `plugin-api/build/libs/blockdesigner-plugin-api-<v>.jar` and `core/build/libs/core-<v>.jar`. If this release adds
   a plugin API level, say which plugins could use it; raising a plugin's `api` is a separate decision.

## Plugins

Plugins are released from their own repositories (`F:/PROGRAMMING/REPOS/BlockDesigner-<Name>`, GitHub
`doolecg/BlockDesigner-<Name>`), never from this one: see the **`blockdesigner-plugin-release`** skill for releasing
them and **`blockdesigner-plugin-new`** for starting one. `scripts/publish_plugin.py` stays in this skill's folder
because those skills and older notes call it by this path. When a plugin needs a newer plugin API, the app release
that adds it ships first, then the plugin's `libs/` jars are refreshed from it.

## Things that bite on this machine

- **The shell mangles backslashes and non-ASCII in heredocs** (Git Bash on Windows): `\n`, `\s`, `\b`, `C:\Users`
  inside a `python - <<'EOF'`, `cat > file <<'EOF'` or `sed` often arrive changed. Release notes are full of `…`, `·`,
  `›`, `→` and Windows paths, so write the notes section with the Write/Edit tools, never through a heredoc; for
  helper scripts, write a `.py` file with the Write tool (raw strings) and run it.
- **`gh` isn't installed** — that's why publishing goes through the script and `git credential fill`.
- **The updater picks the installer by file name, and every release needs both.** Updaters from 0.4.7 on prefer the
  `.msi` (all users, Program Files). Updaters 0.4.2–0.4.6 only recognise a `.exe`, and run it with their AppData folder
  as the install location — so the `.exe` must stay the per-user setup (`installerExe`), which updates those copies in
  place; that copy's next update (only when a newer version exists) installs the `.msi`, moving it to Program Files. 0.4.7 shipped without the `.exe` and left
  those users stuck on the download page — don't drop it. Don't rename installer files without thinking through what
  older updaters will do with them.
- **Smart App Control** is on on the user's PC and blocks unsigned builds from starting after an update. Until
  signing is set up (`blockdesigner.sign.args`, see README "Code signing"), say so in the notes and the report.
