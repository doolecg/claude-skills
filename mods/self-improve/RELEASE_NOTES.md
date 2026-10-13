# Self Improve 1.0.0

## New

- Memory nudges: every few turns a small model picks durable facts, preferences and decisions and saves them locally and to Hindsight.
- Skill proposals after complex or corrected tasks, with an approve, edit or reject pane. Nothing is written to your skills folder until you approve (or you switch to auto).
- Skills improve with use: usage and corrections are tracked, and weak or unused learner skills get a rewrite, merge or prune proposal.
- A `recall` tool that searches Hindsight first and a local index second, with a "why" mode that uses Hindsight reflect.
- A short learned-context section in the system prompt, capped by a token budget.
- CodeGraph grounding in repos that already have a `.codegraph` folder.
- The `/learn` command and a pane with pending skills, recent learnings and today's token use against the daily cap.
