# Prompt Enhancer

An **Enhance Prompt** button in the row under the prompt box. Type a rough prompt, press the button, and the text in the box is replaced with a clearer prompt that carries what the task needs: the files and code symbols to start with, past decisions from memory, facts about how you like to work, what the conversation was about, and the skills to load. Nothing is sent. Read it, change it if you like, and press Enter.

Works in the terminal and in the Claude desktop app's Code tab.

## Install

```
/plugin install prompt-enhancer --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads in every session (the desktop app's Code tab included).

## Use

- Type your prompt, then press **Enhance Prompt** in the row under the prompt box (see "Where the button is" below).
- While it works it reads **Enhance Prompt · gathering…**, then **Enhance Prompt · enhancing…**, with **Cancel** beside it.
- When it is done the box holds the rewrite. Beside the button you see what each source gave this run, such as `Hindsight 6 · CodeGraph 3`, and **Undo**, which puts your text back. Undo stays until you send a prompt.
- A source that was not used says why instead of a number: `Hindsight off` (not set up), `Hindsight timed out`, `Hindsight unavailable`, `CodeGraph off` (not installed), `CodeGraph not indexed`, `CodeGraph timed out`.
- If you type in the box while it works, your text is kept, and **Use rewrite** and **Discard** let you take the rewrite or drop it.
- `/enhance-prompt <your prompt>` rewrites the text you give it. `/enhance-prompt` alone rewrites what is in the box. `/enhance-prompt undo`, `cancel`, `use` and `discard` do what the buttons do.

The rewrite has this shape (lines with nothing to say are left out):

```
<the task, cleaned up, in your own intent>

Start with: <files and symbols from the code index>
Context: <what "it" or "this" refers to, the branch, files already changed>
Keep in mind: <past decisions and your preferences that bear on this task>
Load these skills: <installed skills that fit>
Ask me first about: <the big decisions to settle before work starts>
Done when: <what finished looks like>
```

## What it reads

- **The prompt box**: the text you typed.
- **The session**: the project folder, the git branch and changed files, and the last few messages of the conversation.
- **Skills**: every skill and command the session can use (from the `/` list), the skills in `~/.claude/skills` and the project's `.claude/skills`, each enabled plugin's `skills` folder, and any extra folders you name in the settings. The ones that share words with your prompt are listed first, 60 at most.
- **Hindsight** (optional): if `~/.hindsight/coding-agent.json` names a self-hosted server (`serverMode: self-hosted`, `apiUrl`, optional `apiToken`), it recalls from the project's bank `coding-agent::<repo folder name>` and from your Soul Bank (a setting, `soul` by default).
- **Memory files**: `soul.md` in your Claude config folder (`~/.claude`, or `CLAUDE_CONFIG_DIR`) always. When Hindsight is not set up or does not answer in time, the project's auto-memory `MEMORY.md` and the files it links to are used instead.
- **CodeGraph** (optional): if the `codegraph` command is installed and the repo has a `.codegraph/` folder, it searches the existing index for symbols that match your prompt. It never builds an index.

After each rewrite a short note says what was used and what was skipped, for example `used 3 memories · 2 facts about you · CodeGraph: not indexed · session context · 60 skills`.

## Settings

Change them in `/config` or `/plugin`.

| Setting | Default | What it does |
| --- | --- | --- |
| Model (`model`) | `haiku` | The model that rewrites: an alias (`haiku`, `sonnet`, `opus`), a full model id, or `session` for this session's model. |
| Effort (`effort`) | `default` | `default` lets the model decide; `low` to `max` set it; `session` follows this session's effort. |
| Hindsight time limit (`hindsightSeconds`) | `5` | Seconds to wait for Hindsight before going on without it. |
| About-you memory bank (`soulBank`) | empty | Name of a Hindsight bank with facts about you. Empty skips it; `soul.md` is still read. |
| Extra skill folders (`skillFolders`) | empty | More skill folders, separated by commas or semicolons. |

## Where the button is

- **With Bottom Bar 1.4.0 or later** (terminal): Enhance Prompt is a segment inside the bar, right after the agents count, for example `◆ 1 agent │ Enhance Prompt · Hindsight 6 · CodeGraph 3 · Undo`. Prompt Enhancer publishes it through Bottom Bar's `segments` state. Click the name to enhance, and click **Undo**, **Cancel** or **Use rewrite** after it. On a narrow terminal the bar cuts this segment off before its own segments and pills; `/enhance-prompt` still works.
- **Anywhere else** (no Bottom Bar, an older Bottom Bar, or the desktop app's Code tab): the button gets its own place at the right end of the row under the prompt, with the same counts, Cancel and Undo.
- Only one of the two is ever drawn. The own button stays out of the way when the row holds Bottom Bar's `bottom-bar-segments` key.

The segment, as published (`segments` in this mod's plugin state, id `enhance`):

```ts
{ label: 'Enhance Prompt', detail: 'Hindsight 6 · CodeGraph 3', command: 'enhance-prompt', state: 'done',
  actions: [{ label: 'Undo', command: 'enhance-prompt undo' }] }
```

Clicks on the segment are taken by this mod's `ui.press` hook, so the bar shows "gathering…" while the run goes on.

## Limits

- One model call per press, up to 2,000 tokens back, 90 seconds at most. There is no daily cap.
- Hindsight is skipped after the time limit (5 seconds by default) and the note says so; it is tried again on the next press. A large project bank can take longer than 5 seconds to answer: raise the limit if your memories never show up.
- CodeGraph is given 8 seconds and git 5 seconds. A missing or slow one is skipped and named in the note.
- Context is capped: 12 memories, 8 facts about you, 40 code symbols, 14 session lines, 60 skills, 8,000 characters of your prompt, 6,000 characters of rewrite.
- What comes from memory, the code index and the conversation is passed to the model as reference data, marked as not instructions.
- The box is only replaced when it still holds the text that was enhanced. If it changed, or a dialog holds it, the rewrite waits behind **Use rewrite**.
- Undo puts back the text from before the rewrite, over anything typed since.
- The counts are from the last run only, and count what each source sent back (CodeGraph up to 40 symbols, Hindsight up to 5 per bank), before the caps above.
- Mods that draw the row under the prompt run in an order the engine picks. If another mod draws that row without passing it on, the own button can be hidden; use `/enhance-prompt`.
- The terminal's own prompt box and the Code tab's are both written through the mod API; in a headless run (`claude -p`) there is no box and the button does nothing.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
