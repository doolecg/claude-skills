# Rule Guard

Stops tool calls that break your standing rules. Claude is told which rule it broke and what to do instead, and you get a short message: "Rule Guard stopped: <rule>". It has no pane, band or commands. Everything else passes through untouched. It works for the main agent and for subagents.

## Install

    /plugin install rule-guard --marketplace doolecg/dooles-tools

Run that in a terminal; it then loads in every session, including the desktop app's Code tab. While developing, use `claude --plugin-dir <this folder>`.

## Rules

It looks at the Bash and PowerShell tools (the command) and at any git MCP tool whose name ends in `git_commit` (the message). Chained commands (`&&`, `;`, `|`, new lines) are checked part by part. Text inside quotes, such as a commit message that mentions "git push", is not read as a command.

1. **No AI credit in commits.** Stops a `git commit`, `gh pr create` or `gh release create` whose text holds `Co-Authored-By`, `Generated with`, `claude.ai/code`, `noreply@anthropic.com`, or a line crediting Claude or AI.
2. **Plain version tags.** Stops `git tag v1.2.3`, `git tag -a v1.2.3`, `gh release create v1.2.3` and `git push origin v1.2.3`. Use `1.2.3`.
3. **Ask before push or release.** Stops `git push`, creating a tag, `gh release create|upload|edit`, `npm publish` (also pnpm and yarn) and `gh pr merge`, unless your latest message holds one of the words push, publish, release, tag, ship, deploy or merge (whole word, any case). Only your own prompts count.
4. **No killing by name.** Stops `Stop-Process -Name`, `taskkill /IM`, `pkill` and `killall`. Claude should stop only what it started, by process ID.
5. **Never skip git hooks.** Stops `--no-verify`, `--no-gpg-sign` and `-c commit.gpgsign=false` on git commands.
6. **Stop at the pass limit.** Reads the pass counter the Context mod publishes. When a test, build or check command would start a pass past the limit, and files changed since the last pass, it is stopped and Claude is told to ask you how to go on. Without the Context mod this rule does nothing.

## Settings

**Enabled** (default on) is the master switch: off, Rule Guard stops nothing. Each rule is a yes/no option, all on by default: No AI credit in commits, Plain version tags, Ask before push or release, No killing by name, Never skip git hooks, Stop at the pass limit. Also: **Words that allow a push or release** (default empty, meaning push, publish, release, tag, ship, deploy, merge; comma separated), **Show a message when it stops something** (default on) and **Stops to remember** (default 10, 1 to 100). Change them in the plugin's settings; the mod reloads with the new values.

State for other mods: `rule-guard.blocks` (the last 10 stops, newest first, with time, rule, title and the command clipped to 80 characters), `rule-guard.sidebarBadge` (stops this session) and `rule-guard.lastPrompt`.

## Limits

- It reads the command text only. A message in a file (`git commit -F file`, `--notes-file`), a script, or a command built from variables is not seen.
- Version tags in `git push` are only caught when written like `v1.2.3` (a `v` and a number, then a dot), so a branch called `v2-fix` is left alone.
- Killing by name through `Get-Process <name> | Stop-Process` is not caught.
- Quoted scripts given to `bash -c`, `sh -c`, `powershell -Command` or `cmd /c` are read, two levels deep.
- The push rule is word based: "pushing" or "released" in your message does not count, "push" and "release" do.
- A pass limit of 0 means no limit.
- If the mod itself fails on a call, the call goes through.

Tests: `claude plugin test <this folder>`.
