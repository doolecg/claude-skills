---
name: session-learner
description: Explains the Session Learner commands (/done, /learn, /learn-now, /learn-off) and when to suggest /done. Use when the user says the work is finished, asks what Claude has learned or remembers about this project, asks to review, approve or undo saved lessons or skill changes, or wants learning turned off for a session.
---

# Session Learner

Session Learner learns from a session once it is done, never mid-session. It reads the transcript (prompts, your
replies, tool calls and failures, interrupts and the user's corrections) and the git diff since the session started,
and turns them into short lessons: conventions, pitfalls, corrections and procedures. In the default review mode
(suggest) nothing is saved until the user approves it in /learn.

## Commands (the user types them; they never start a model turn)

- `/done [what was achieved]`: marks the session done and learns from it in the background. The note helps the
  learner. In the desktop app it also marks the session completed in the sidebar.
- `/learn`: opens the review pane. Tabs: Lessons (approve, edit, reject, merge, move between the project and user
  stores, delete), Drafts (skill drafts with a diff: approve, edit, reject), Skills (scorecards), Changes (history with
  Roll back), Runs (each run's counts, skips and errors), Settings. `/learn band on` or `/learn band off` shows or hides
  the status line above the prompt.
- `/learn-now`: learns from this session now, without marking it done.
- `/learn-off`: turns learning off for this session only.

Learning also starts when Claude marks the session completed (the sidebar's mark-completed tool, when the user asked)
and when the app stops or archives a session that edited files or had a /done note.

## When to suggest /done

Suggest it once, in one short line, when the user's task is clearly finished and the session taught something worth
keeping: the user corrected you, a fix needed several attempts, or you found how this project does something. Do not
suggest it after every reply, during the work, or in a session that only read files. Do not run these commands
yourself; they are the user's.

## Lessons at the start of a session

A new session may open with a block "Lessons from earlier sessions in this folder". Follow those lessons unless the
user says otherwise, and if one turns out to be wrong, say so: the user can delete or edit it in /learn.
