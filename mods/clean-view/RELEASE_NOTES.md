# Clean View 1.0.0

## New
- Clean View: while Claude works, tool calls, diffs and command output are hidden. One checklist above the prompt shows the plan, what is happening now and how far along it is.
- Header states for Working, Needs you, Stuck, Stopped and All done, with a Clean View on/off button and `/simple on|off`.
- Claude gets two tools, `plan_steps` and `report_progress`, and is told to plan in plain English first.
- Agent Dock: pick a Team Size (1 to 100) and every request is split across exactly that many helper agents, with a live card for each one (task, timer, progress), a mission bar, and a one-line summary when they finish.
- `/dock` folds the dock to a status-line badge or reopens it, `/dock 10` sets the size, and there is a Dock button above the prompt.
