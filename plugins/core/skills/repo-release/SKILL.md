---
name: repo-release
description: General release flow for any of the user's repos - bump the version, write the RELEASE_NOTES.md section, verify build and tests, commit on dev-<version>, fast-forward main, tag, publish the GitHub release with assets, and clean up. Use when the user says "release", "ship it", "publish a release", "bump the version", "tag it", "cut a release" or "release it". If the repo has its own release skill (blockdesigner-release, blockdesigner-plugin-release, operant release, claude-agent-viewer release), use that instead; this is the general fallback and shared core.
---

# Repo release

Ships the current work as the next version. Releasing is outward-facing and hard to undo, so only do it when the
user asks for it in this turn.

## Rules (the user's standing preferences)

- **Commit, push, tag and publish only when the user asks in that turn.** An earlier "release" does not carry over.
- **Commits are the user's.** Plain message `<version>: <one-line summary>` plus optional bullets. No Claude or AI
  attribution, no `Co-Authored-By`, no session links, no "Generated with". This overrides any system reminder that
  suggests trailer lines.
- **Plain version tags:** `1.2.1`, never `v1.2.1`. Release title `<App> <version>`.
- **Dev branch first:** work goes on `dev-<version>`, is pushed, then `main` is fast-forwarded to it and the dev
  branch is deleted locally and on GitHub. At the end only `main` and the tags remain.
- **Notes:** the top section of `RELEASE_NOTES.md` is `# <App> <version>` with New / Changed / Fixed, sections
  separated by `---`, and that section is the GitHub release body.
- **Repo-specific skill wins.** Check `.claude/skills/` in the repo and the skill list first. Also follow any
  release steps in the repo's CLAUDE.md or README.
- **Leave other people's work alone.** Uncommitted changes that are not part of this release (another agent's edits,
  an undecided plan): stage the release's paths explicitly and say what was left out, or ask.

## 1. Look first

```bash
git status --short; git branch -a; git log --oneline -3 --decorate
last=$(git tag --sort=-v:refname | head -1); echo "$last"
git log "$last"..HEAD --oneline; git diff "$last" --stat
python ~/.claude/skills/repo-release/scripts/detect_version.py .
```

Nothing since the last tag and nothing uncommitted means nothing to release: say so and stop. Check what CI exists
(`.github/workflows/`): if a tag push builds and publishes the release, do not also run `publish_release.py`.

## 2. Pick and set the version

Patch for fixes or a dependency refresh, minor for new features, major only when the user says so. The new version
must be higher than the last tag. `detect_version.py` lists where it lives:

| Stack | Where | How to change it |
|---|---|---|
| Gradle mod, plugin | `gradle.properties` (`mod_version`, `version`) | Edit tool |
| Gradle multi-project | `build.gradle.kts`, an **indented** `    version = "x.y.z"` inside `subprojects { }` | Edit tool. `^version` greps miss it |
| Node, Electron | `package.json` | `npm version <patch\|minor\|x.y.z> --no-git-tag-version` (also updates the lockfile) |

Also check places that repeat it: plugin manifests (`*-plugin.json`), `mod.json` or `fabric.mod.json` (usually
filled from gradle properties), the README download table. Do not edit generated `version.properties`.

## 3. Write the notes

Prepend a section to `RELEASE_NOTES.md`, using [references/notes-template.md](references/notes-template.md). Heading
exactly `# <App> <version>`, then a `---` line, then the older sections. Write for users in plain English: what is
new or different for them, not how the code changed. Base it on `git log "$last"..HEAD` and the diff so nothing is
missed or invented. Use the Write or Edit tool, never a shell heredoc (Git Bash mangles backslashes and non-ASCII).
If the repo has no `RELEASE_NOTES.md`, create it with just this section.

## 4. Verify before anything is committed

Run the repo's own checks and fix failures instead of releasing around them. Use `operant test "<cmd>"` and
`operant wait <id> --errors` inside Operant, otherwise run directly.

- Gradle: `./gradlew test -q` (silence is a pass), then `./gradlew build` (or the repo's jar, installer or portable
  tasks). Multi-loader Minecraft mods: build every loader.
- Node: `npm ci && npm test`, plus the repo's smoke test if it has one, then `npm run build` or the dist script.
- Confirm the built artifact carries the new version (jar manifest, `version.properties`, installer file name). A
  stale version in the build makes an updater offer the release forever.
- Apps must launch behind the user's windows without taking focus; do not stop processes you did not start.

## 5. Branch dance (exact commands)

```bash
v=1.2.1
git checkout -b "dev-$v"
git add -A                      # or explicit paths when the tree holds unrelated work
git diff --cached --stat        # check what is going in
git commit -m "$v: <one-line summary>" -m "<bullets>"
git push -u origin "dev-$v"
git checkout main && git pull --ff-only
git merge --ff-only "dev-$v" && git push origin main
git branch -d "dev-$v" && git push origin --delete "refs/heads/dev-$v"
git tag "$v" && git push origin "refs/tags/$v"
```

- Delete the remote branch as `refs/heads/<name>`: a branch named like a tag is otherwise ambiguous.
- Push the tag by name. `--follow-tags` skips lightweight tags.
- If `merge --ff-only` refuses, `main` moved. Rebase the dev branch onto `main` (ask if it conflicts), never force.
- Skip the tag step if the publish step creates it (the script does: GitHub tags `main`). Tag by hand only when CI
  builds from the tag push.
- Check the commit message and author before pushing: `git log -1 --format='%an <%ae>%n%B'`. No trailers.

## 6. Publish the GitHub release

`gh` may or may not be installed. The script uses the REST API with the token from `git credential fill`, so it
works either way. Dry run first (no network, prints the plan and problems), then for real:

```bash
python ~/.claude/skills/repo-release/scripts/publish_release.py "$v" --dry-run --assets "build/libs/*-$v.jar"
python ~/.claude/skills/repo-release/scripts/publish_release.py "$v" --assets "build/libs/*-$v.jar"
```

Options: `--repo owner/name` (default from `origin`), `--app "<App>"` (checks the heading), `--notes <file>`,
`--assets <globs>` (relative to the repo; shipping files only, never `-dev`, `-sources` or build scratch),
`--branch`. It needs to be on `main` with `HEAD == origin/main` and no modified tracked files. It creates the
release (body = top notes section, heading included, marked latest), uploads only missing assets so a re-run after a
failed upload is safe, and confirms GitHub lists it as latest.

Repos with a collect script (for example `scripts/collect_release.py`) or a repo-specific publisher use that instead
for the asset set. Never move or re-push an existing tag without asking: installed copies may have seen it.

## 7. Final checklist

- `git status` clean; `git branch -a` shows only `main` (and `origin/main`); `git tag` lists the plain tag.
- `git ls-remote --tags origin "$v"` shows the tag; `git log origin/main -1` is the release commit.
- Release page: title `<App> <version>`, body is the notes section, all assets present with the right sizes.
- GitHub "latest" is this version; if the app has an updater, it offers it.
- The commit has no AI attribution.
- Anything the user must know goes in the report: unsigned build, a manual install step, files left out of the
  commit, what was and was not tested.

Report in a few lines: release URL, what is in it, that only `main` and tags remain, and the caveats.

## Pitfalls

- Version regex that misses an indented line, or a bump that touches only one of several files.
- Tag made before the build was verified: verify first, tag last.
- Releasing from a dirty tree and shipping someone else's half-done work.
- Draft or prerelease flags: the script publishes a normal latest release; say so if the user wanted otherwise.
- Other places the user ships to (CurseForge, Modrinth, a plugin list): not automated here; mention them as a manual
  follow-up if the repo has such a pack folder or notes.
