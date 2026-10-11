# Session Learner

Learns from a session once it is done, saves the lessons after your review, and tunes your skills from how they do over time. Ships as a mod plus a skill that tells Claude what the commands do.

## When it learns

Never mid-session, never on idle. Once per session, when it is marked done:

- `/done` (optionally `/done <what was achieved>`) marks the session completed and learns.
- When Claude marks the session completed through the sidebar tool, after it succeeds.
- When the app stops or archives the session (any end reason except `clear` and `resume`), but only if the session had an edit or a `/done` note. The session end only writes a small job file and starts a hidden background process; the real work happens there.
- A job left unfinished (machine slept, process died) is picked up at the next session start and run once.
- `/learn-now` learns from the current session by hand. `/learn-off` turns learning off for this session.

## What it does

- Gate: skips sessions with fewer than 2 user turns, under about 2000 tokens of transcript, or no git diff and no corrections. The reason is recorded in the run.
- Reads the transcript, the git diff since the session's starting HEAD, CodeGraph (only if `.codegraph/` exists) and Hindsight recall for the same files and symbols. Secrets are scrubbed before any model call.
- One `claude-haiku-5-5` call returns up to 8 lessons (convention, pitfall, correction, procedure). Malformed ones and ones naming files or symbols that are not in the evidence are dropped.
- Merges repeats of known lessons (local and Hindsight) and flags contradictions.
- Writes approved lessons to Hindsight (project bank, or the global user bank), and to the project's auto-memory folder with a pointer in `MEMORY.md`. A store that fails is skipped and named in the run record.
- Marks lessons stale when their files are gone or their symbols no longer exist, and removes them from memory.
- Skill optimising: a scorecard per skill, new-skill drafts from procedures seen in 2 or more sessions, fix drafts from corrections that name a skill, and Sonnet rewrite drafts when the correction rate reaches 30% over the last 5 loads. Drafts are validated (frontmatter, unique name, no secrets, description under 1024 characters, no rule dropped unless contradicted). After a change, the next 5 loads are compared with the 5 before, and `/learn` shows "Skill X got worse after the change — roll back?".
- Next session: a brief of under 1500 characters with up to 6 lessons for the folder plus skills that changed.

## Review modes (`reviewMode`, default suggest)

off: nothing runs. suggest: everything waits in `/learn`. controlled: low-risk lessons apply themselves; anything naming a command, a URL, "always" or "never" waits. advanced: skill drafts that pass validation apply too. Every automatic change is recorded with before and after text and can be rolled back in `/learn`.

Budgets (settings): `maxModelCalls` 4, `maxTokens` 60000, `maxChanges` 5, `dailySpendUsd` 0.5 (0 means no cap). A run stops at the first one it hits and records which.

## /learn

A pane with tabs Lessons, Drafts, Skills, Changes, Runs and Settings, a Test button (one tiny call to the learn model, stores nothing) and a "Band: on/off" toggle. Deletes ask first and give counts. Works in the Code tab and in the terminal.

## The band

Hidden by default. When on it shows `Learned 3 lessons: 2 saved, 1 to review`, `Memory: nothing learned yet`, or the last error, plus "Learning from this session..." while a run is going. Turn it on or off with `/learn band on|off`, the "Band: on/off" button in `/learn`, the small Off button on the band, or the "Show the band above the prompt" config row.

The last run is also written to `~/.claude/mods-data/session-learner/last-run.json` (`{ state, found, saved, review, error?, at, cwd }`) so other tools can read it.

## Install

```
/plugin install session-learner --marketplace doolecg/claude-skills
```

Type it in a terminal `claude` session, answer `y` to add the marketplace, and pick the user scope. It then loads in every Code tab session too (the Code tab cannot run `/plugin` itself).

## Developing

```
claude --plugin-dir <path to this folder>
```

Checks: `claude plugin validate <folder>` and `claude plugin test <folder>`.

## Limits

- The API has no event for the sidebar's "Mark as completed" or archive, so done is caught by `/done`, the mark-completed tool call (only when Claude makes that call) and `session.end`. Marking completed by hand in the sidebar with no session end does not learn.
- CodeGraph has no notes feature, so lessons are not tagged on symbols; the run record says so.
- Skills from plugins or marketplaces are never edited; a local override copy is offered instead.
- `claude -p` does not recognise plugin slash commands, so `/done`, `/learn` and friends only work in the terminal and the Code tab.
- Lesson file names are matched case-insensitively and may be stored in lower case.
- The background process needs `claude` on the PATH.
