# Plain-English Claude Code

Keeps Claude's replies short and easy to read, and tells you when a long reply breaks the style.

## What it does

- Adds one short section to the end of the system prompt: simple words and short sentences, little narration while it works, all prose in one final block headed "Summary", and a "Next steps" section at the end.
- Shows a status line under the prompt while Claude works: `Working on: <first words of your prompt>`, with `(running <tool>)` while a tool runs. It is cleared when the turn ends. Only the main agent's turns count, not subagents.
- After a main-agent turn with a finished reply of at least 400 characters (not interrupted, not an error), it asks `claude-haiku-5-5` one cheap question (low effort, 40 tokens out, 15 second limit): does the reply keep the four rules? The answer shows in the band above the prompt as `Plain-English: ok` or `Plain-English: missed: <rule>` (the band is hidden until you switch it on, see below), and a miss always raises a toast. The check runs after the turn has finished, so it never holds up the reply and never edits it.
- Caps per session: 25 checks or 150k tokens (counted from the model's usage), then the last verdict stays on screen.

Works in the Claude desktop app's Code tab and in the terminal.

## The band: on and off

The band starts hidden. The style section, status line, check and miss toast work the same either way. Switch the band on or off with any of these (the choice is remembered):

- The setting "Show the band above the prompt" (`showBand`) in the `/config` menu.
- `/plain-english band on` or `/plain-english band off`. It runs at once, without starting a turn.
- The small "Off" button on the band itself.

## Install

Type this in a terminal `claude` session (answer `y` to add the marketplace, pick user scope). It then loads in every desktop Code tab session too. The Code tab cannot run `/plugin` itself.

```
/plugin install plain-english --marketplace doolecg/claude-skills
```

## Developing

```
claude --plugin-dir <folder>
claude plugin validate <folder>
claude plugin test <folder>
```

## Limits

- The style section asks Claude for the style; it cannot force it. The check only reports a miss.
- The check is a judgement by a small model, so it can be wrong in either direction. Junk or a timed-out answer leaves the last verdict as it was.
- Replies under 400 characters, interrupted or failed turns, and subagent turns are never checked.
- Only the check on the most recent long reply is shown, and the band appears after the first check.
- Very long replies are shortened (head and tail) before the check, so a miss in the middle can go unseen.
- The style section is added to every system prompt the session sends, so it also reaches subagents; it cannot be limited to the main agent.
- The check uses model calls on your account, up to the caps above.
- The band's switch is a plugin setting changed through `$.config.set`; if a session refuses that change, you get a toast saying so and the setting stays as it was.
- The status line shows the raw tool name, so MCP tools appear as `mcp__server__tool`.
