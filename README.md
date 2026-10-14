# dooles-tools

My Claude Code mods as a plugin marketplace: the sidebar, the bottom bar and the rest. Install them on any PC in one go, and browse, update or turn them off from Claude Code's `/plugin` screen like any other plugin. My skills live in [Dooles_Skills](https://github.com/doolecg/Dooles_Skills).

## Install
**One click:** clone or download this repo and double-click `install.cmd`. It adds the marketplace and installs every mod. To pick some: `.\install.ps1 sidebar,bottom-bar`.

**From inside Claude Code:**
```
/plugin marketplace add doolecg/dooles-tools
/plugin install sidebar@dooles-tools
```
**From a terminal:** `claude plugin marketplace add doolecg/dooles-tools`, then `claude plugin install <name>@dooles-tools`.

## Check and manage them
- `/plugin` in Claude Code lists the marketplace and its mods. From there you can install, enable, disable, uninstall and update them.
- Every mod's options are in `/plugin` › Installed › <mod> › Configure.
- `claude plugin marketplace update dooles-tools` pulls the latest from this repo. Turn on auto-update for the marketplace in `/plugin` › Marketplaces to have it happen at startup.

## What's in it
| Mod | What it does |
|---|---|
| `sidebar` | One sidebar with a tab for each mod |
| `flightdeck` | The main session and every subagent working now, each with its own pixel critter; idea from [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) (MIT) |
| `bottom-bar` | The bar at the bottom of the terminal and the Doole's Tools pill |
| `clean-view` | A plain-English checklist above the prompt, with the technical rows hidden |
| `self-improve` | Learns from finished sessions, keeps soul.md and a Soul Bank in step, drafts and tunes skills for your approval |
| `prompt-enhancer` | An Enhance Prompt button that rewrites the prompt in the box with context from Hindsight, CodeGraph, the session, soul.md and your skills |
| `idea-shelf` | Park ideas with `/idea` while Claude works |
| `context` | The Sidebar footer: Hindsight, CodeGraph, git and test passes |
| `rule-guard` | Stops tool calls that break your standing rules |

Each mod is in `mods/<name>`, with its own README and RELEASE_NOTES.md. Mods that draw a sidebar tab share `hooks/sidebar-kit.tsx`: edit it in `mods/sidebar/hooks` and run `python mods/sidebar/copy-kit.py`.
