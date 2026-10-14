# Context 1.0.0

## New

- Publishes the facts the Sidebar shows in its footer on every tab: how much of the context window is used, whether the Hindsight server answers, whether the project is indexed by CodeGraph, the git branch with changed, ahead and behind counts, and the test and fix pass count.
- Counts test and fix passes against a limit (3 by default), so the footer shows when Claude should stop and ask.
- `/passes` shows the count, `/passes reset` starts it again. It works while Claude is busy.
- Two options: the pass limit, and extra command words that count as a test run.
