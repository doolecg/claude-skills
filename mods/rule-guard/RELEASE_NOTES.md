# Rule Guard 1.0.1

## Changed
- Each rule's help in /plugin › Installed › Rule Guard › Configure says it is on by default. The sidebar no longer shows the rules as switches.

---

# Rule Guard 1.0.0

## New

- Stops tool calls that break your standing rules, and tells Claude what to do instead. You see a short message each time: "Rule Guard stopped: <rule>".
- Six rules, each with its own switch in the settings, all on by default: no AI credit in commits, plain version tags, ask before push or release, no killing by name, never skip git hooks, and stop at the pass limit.
- Works for the main agent and for subagents. It checks the Bash and PowerShell tools and the git commit tool.
- Publishes the last 10 stops and a stop count for the Sidebar.
