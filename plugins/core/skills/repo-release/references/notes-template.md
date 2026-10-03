# Release notes section

Prepend to `RELEASE_NOTES.md` (newest first), then a line containing only `---` and a blank line before the previous
section. The heading must be exactly `# <App> <version>`; the publisher checks it and takes everything above the
first `---` as the GitHub release body.

```markdown
# My App 1.2.1

One or two sentences: what this release is about, for someone deciding whether to update.

## New
- **Feature name:** what you can now do, and where to find it (Settings > Section, default key).

## Changed
- **What is different:** how it behaves now, and what it replaced.

## Fixed
- **What was wrong** and what happens now.

---

```

Writing it:

- Write for users, not developers. Read `git log <last-tag>..HEAD` and `git diff <last-tag> --stat` so nothing is
  missed or invented. Skip internal refactors, test changes and build tweaks.
- Lead each bullet with a short bold phrase, then plain sentences. Name things the way the UI names them. Keys are
  rebindable, so write "(default Shift+Z)".
- Leave out sections with nothing in them. If the app is unsigned, installers changed, or old copies cannot update
  themselves, say what the user has to do.
- Add an install or downloads paragraph only when the repo's earlier sections have one; copy their format.
- Write the file with the Write or Edit tool, never a shell heredoc (Git Bash on Windows mangles backslashes and
  characters like the ellipsis and arrows).
- A dependency-refresh release can be one line: "Kept up to date with X <version>".
