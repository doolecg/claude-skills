# dooles-tools

My Claude Code skills as a plugin marketplace: install them on any PC in one go, and browse, update or turn them off from Claude Code's `/plugin` screen like any other plugin.

## Install
**One click:** clone or download this repo and double-click `install.cmd`. It adds the marketplace and installs every plugin. To pick some: `.\install.ps1 blockdesigner,minecraft-modding`.

**From inside Claude Code:**
```
/plugin marketplace add doolecg/dooles-tools
/plugin install minecraft-modding@dooles-tools
```
**From a terminal:** `claude plugin marketplace add doolecg/dooles-tools`, then `claude plugin install <name>@dooles-tools`.

The repo is private, so git on that PC has to be signed in to GitHub (Git Credential Manager handles it the first time).

## Check and manage them
- `/plugin` in Claude Code lists the marketplace and its plugins. From there you can install, enable, disable, uninstall and update them.
- `claude plugin list` shows what's installed. `claude plugin details <name>@dooles-tools` shows a plugin's skills and how many tokens they cost.
- `claude plugin marketplace update dooles-tools` pulls the latest from this repo. Turn on auto-update for the marketplace in `/plugin` › Marketplaces to have it happen at startup.

Plugin skills are namespaced, like `/blockdesigner:blockdesigner-release`.

## What's in it
| Plugin | Skills | Source |
|---|---|---|
| `blockdesigner` | `blockdesigner-release`, `blockdesigner-plugin-release`, `blockdesigner-plugin-new` | mine |
| `agent-viewer` | `release` (Claude Agent Viewer) | mine; the only copy (its checkout is gone) |
| `operant` | `release` | mine |
| `core` | `team-work`, `ui-change`, `minecraft-test-setup`, `desktop-app-baseline`, `repo-release`, `plain-writing` | mine |
| `design` | `ui-critique`, `ui-foundations` | mine, adapted from [designer-skills](https://github.com/Owl-Listener/designer-skills) (MIT) |
| `minecraft-modding` | `fabric-modding`, `neoforge-modding`, `minecraft-26-1-migration` | [siredvin/minecraft-modding-skills](https://github.com/siredvin/minecraft-modding-skills) (MIT), pinned to a commit |
| `minecraft-multiloader` | `minecraft-multiloader` | [jahrome907/minecraft-agent-skills](https://github.com/jahrome907/minecraft-agent-skills) (MIT), pinned to a commit |
| `minecraft-mod-dev` | `minecraft-mod-dev` | mcpmarket (copy) |
| `bottom-bar` | mod: the bar at the bottom of the terminal and the Doole's Tools pill | mine, in `mods/bottom-bar` (edited here, not synced) |
| `clean-view` | mod: a plain-English checklist above the prompt, with the technical rows hidden | mine, in `mods/clean-view` (edited here, not synced) |
| `flightdeck` | mod: a sidebar with the main session and every subagent working now, each with its own pixel critter | mine, in `mods/flightdeck` (edited here, not synced); idea from [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) (MIT) |
| `prompt-enhancer` | mod: an Enhance Prompt button in the Bottom Bar that rewrites the prompt in the box with context from Hindsight, CodeGraph, the session, soul.md and your skills | mine, in `mods/prompt-enhancer` (edited here, not synced) |
| `self-improve` | mod: learns from finished sessions, keeps soul.md and a Soul Bank in step, drafts and tunes skills for your approval | mine, in `mods/self-improve` (edited here, not synced) |
| `idea-shelf` | mod: park ideas with `/idea` while Claude works | mine, in `mods/idea-shelf` (edited here, not synced) |

Anthropic's built-in skills (pdf, docx, xlsx, ...) and the ones synced to my claude.ai account aren't here: they already follow the account.

The BlockDesigner skills call their scripts by their path in the BlockDesigner checkout (`F:/PROGRAMMING/REPOS/BlockDesigner/.claude/skills/...`), so they're meant for a PC with that checkout.

## Keeping it up to date
My own skills are edited where they're used, next to their projects (often git-ignored there, so this repo is also their backup). To bring the changes here:
```
python sync.py --dry-run     # what changed
python sync.py               # copy it in
python sync.py --upstream    # also move the third-party plugins to their repos' latest commit
claude plugin validate .
git add -A && git commit -m "Sync skills" && git push
```
To add a skill of my own, add its folder to `SOURCES` in `sync.py` (and a plugin entry in `.claude-plugin/marketplace.json` if it's a new plugin), then run the sync.
