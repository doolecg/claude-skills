# Self Improve

A self-learning loop for Claude Code (terminal and desktop app). It remembers what is worth keeping, proposes reusable skills for your approval, improves them from use, and lets Claude look up past sessions.

## Install

```
/plugin install self-improve --marketplace doolecg/self-improve
```

Answer `y` to add the marketplace, then pick a scope. Set options in `/config` under the plugin.

## What it does

- **Memory nudges.** Every N main-agent turns, a small model reads the recent conversation in the background and keeps durable facts, preferences and decisions. They go to a local store and to Hindsight.
- **Skill creation.** After a task with enough tool calls, or one you corrected, a skill is drafted and queued. Approve, edit or reject it in the pane. Only approved skills are written to `~/.claude/skills/<name>/SKILL.md`. With `approvalMode: auto` they are written at once.
- **Skills improve with use.** Use and corrections of learner-created skills are counted. Often corrected skills get a rewrite or merge proposal; skills unused for 30 days get a prune proposal. Same approval flow. Only skills this plugin created are ever changed.
- **Recall tool.** `mcp__self-improve__recall` (query, optional `why`, optional `docs`) searches Hindsight, then the local index.
- **User model.** Standing preferences are injected as one short system-prompt section, capped by `maxInjectTokens`.
- **Safety.** Obvious keys, tokens and passwords are removed before anything is saved or sent. Writes go only to the skills folder and the plugin store. The learner never learns from its own calls and runs only for the main agent.

Use `/learn` for status, `pause`, `resume`, `pending`, `config`, `approve N` and `reject N`. `/learn` and `/learn pending` also open the pane.

## Config

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | true | Turn the learner on or off |
| `nudgeModel`, `skillModel` | haiku | Models for memory and skill jobs |
| `nudgeEveryTurns` | 6 | Memory nudge interval (1 to 200) |
| `minToolCallsForSkill` | 8 | Tool calls that make a task "complex" (1 to 200) |
| `approvalMode` | ask | `ask` queues proposals, `auto` writes them |
| `maxInjectTokens` | 600 | Cap for the injected section (50 to 4000) |
| `dailyTokenCap` | 200000 | Hard stop for the learner per day; 0 means none |
| `nudge/skill/rewrite` `MaxInputTokens`, `MaxOutputTokens` | 4000/500, 6000/1200, 6000/1200 | Per-job limits |
| `hindsightEnabled` | true | Use Hindsight |
| `hindsightBaseUrl` | empty | Your Hindsight server, for example `https://hindsight.example.com` |
| `hindsightApiKeyEnv` | HINDSIGHT_API_KEY | Name of the environment variable holding the key |
| `hindsightBank` | self-improve | Memory bank id |
| `codegraphEnabled` | true | Ground learning with CodeGraph when the repo has `.codegraph` |

## Hindsight

Calls use the Hindsight HTTP API through `curl` (the mod has no Node). The key is never stored or read by the mod: curl imports the variable named in `hindsightApiKeyEnv` itself (`--variable` and `--expand-header`, curl 8.3 or newer).

- **Retain:** `POST /v1/default/banks/{bank}/memories` with tags `project:<repo>`, `kind:<fact|preference|decision|skill>` and `source:self-improve`. Approved skills are retained as documents (`skill:<name>`).
- **Recall:** `POST .../memories/recall`, at session start and each prompt, results fed to the injected section within the token budget.
- **Reflect:** `POST .../reflect` for the recall tool's `why` mode; falls back to the connected Hindsight MCP `reflect` tool if present.
- **Documents:** `GET .../documents` for the recall tool's `docs` mode.

If Hindsight is unreachable, the learner keeps working on the local store and shows one status line. A turn never fails because of it.

## CodeGraph

Only in a repo that already has a `.codegraph/` folder (and `codegraph.enabled`): `codegraph explore "<query>"` grounds the learner prompts so facts and skills name real symbols and paths, and the injected section says to use `codegraph_explore` first. Without `.codegraph/` nothing runs, and `codegraph init` is never called.
