# Prompt Enhancer

Rewrites a rough prompt into a clear one before it is sent. You see the rewrite above the prompt and choose what happens. Nothing is sent without your say-so.

## What it does

- `/enhance <rough prompt>` rewrites the text you give it. It runs without a model turn of its own.
- A prompt you type that starts with `++ ` (two plus signs and a space) is held when you press Enter and rewritten instead of sent.
- The rewrite has four parts:
  - the cleaned-up task;
  - `Load these skills:` (picked from the skills list below);
  - `Ask me first about:` (the big decisions);
  - `Done when:` (what finished looks like).
- The rewrite shows in the band above the prompt with three buttons:
  - **Use** sends it as your prompt.
  - **Edit** puts it in the prompt box so you can change it.
  - **Cancel** puts the text you typed back in the box.
- While the model works, the band shows "Rewriting your prompt..." with a Cancel button.
- The skills list is every skill the session can use: `~/.claude/skills`, `~/.claude/operant-hub/skills`, the project's `.claude/skills` and the skills of installed plugins. Skills the model names that are not on the list are dropped. If the skills cannot be read, the "Load these skills:" part says so and the rewrite carries on.
- Model: `claude-haiku-5-5`, a 900-token reply cap, a 30 second limit.
- Caps per session: 20 rewrites or 120k tokens (counted from the model's usage). After that, new requests are refused with a plain message and your text is put back.
- If a rewrite fails, your text is put back in the prompt box (as you typed it, including the `++ `) and a toast says whether that worked. If the box cannot take it, the toast shows the text.

Works in the Claude desktop app's Code tab and in the terminal. It has no settings.

## Install

Type this in a terminal `claude` session (answer `y` to add the marketplace, pick user scope). It then loads in every desktop Code tab session too. The Code tab cannot run `/plugin` itself.

```
/plugin install prompt-enhancer --marketplace doolecg/claude-skills
```

## Developing

```
claude --plugin-dir <folder>
claude plugin validate <folder>
claude plugin test <folder>
```

`hooks/lib/` is a copy of `mods/_shared/lib`; refresh it with `python mods/sync_shared.py`.

## Limits

- Only prompts typed by you are held. A `++ ` prompt sent by a script, an SDK host or another plugin goes through unchanged.
- The prompt is dropped when you press Enter, so the engine may clear the box first. The mod puts text back with a fill right after; if a dialog is open or the surface has no prompt box, that fails and the toast shows your text instead.
- The held prompt is not kept anywhere except in memory: if the session closes while a rewrite is on screen, it is gone.
- One rewrite at a time. A new `/enhance` or `++ ` while one is working or waiting is refused and your text is put back.
- Attachments and pasted images on a `++ ` prompt are not carried into the rewrite.
- The rewrite is a judgement by a small model and can be wrong; the skills it picks are only those on the list it was given. A long skills list is shortened (descriptions to 160 characters, about 24k characters in all).
- Tokens from a call you cancel while it runs still count toward the cap.
- Each rewrite uses a model call on your account, up to the caps above.
- On the mobile app the band buttons work, but you edit the result in the box after Edit as usual.
