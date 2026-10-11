# Design Picker

When Claude asks you to choose how something should look, this mod shows you
what the choices look like.

- It watches Claude's multiple-choice questions (the AskUserQuestion tool). A
  question counts as a look question when its text or header says "design",
  "style", "theme", "aesthetic", "visual style", "look and feel", "color scheme"
  or "layout", or when two or more of its options name a known style.
- It writes one self-contained page, `claude-design-picker.html`, to your temp
  folder (overwritten each time) and opens it in your browser. Each option is a
  card. These styles get a sample drawn in CSS: minimal, brutalist,
  glassmorphism, neumorphism, material, flat, skeuomorphic, dark, light, retro,
  editorial, bento, corporate. Any other option gets a plain card with its text.
  The page follows your light or dark setting.
- It lists the options in the band above the prompt, with a "Reopen preview"
  button, until you answer the question.

It never answers, changes or delays the question: it only watches it go by. It
has no commands, no settings and makes no model calls.

Opening uses `cmd /c start` on Windows, `open` on macOS and `xdg-open` on Linux.
If opening fails, a toast gives the file path. If there is no temp folder, a
toast says so.

## Install

Type this in a terminal `claude` session (answer `y` to add the marketplace and
pick user scope). It then loads in every desktop Code tab session too; the Code
tab cannot run `/plugin` itself.

```
/plugin install design-picker --marketplace doolecg/claude-skills
```

## Developing

```
claude --plugin-dir <path to this folder>
```

Tests: `claude plugin test <path to this folder>`. Check: `claude plugin validate <path to this folder>`.

## Limits

- Detection goes by words only. A question about looks that avoids those words
  and does not name two known styles is not picked up. A question that uses
  one of the words in another sense (for example "design pattern") is.
- Only option labels are matched to a known style, not their descriptions. A
  label such as "Modern" gets the plain card.
- The samples are small CSS sketches of each style, not your real design.
- The page is a preview only; you still pick in Claude's own question.
- If you answer before the page is written, it is not opened late.
- The temp folder comes from `TEMP` or `TMP` on Windows, and `TMPDIR` then
  `/tmp` elsewhere. macOS is told from Linux by the presence of
  `/System/Library/CoreServices`, because the mod API has no operating-system
  value.
- Only one band is kept at a time: if two look questions are open at once (for
  example from a subagent), the newest one is shown and clears first.
- It does not open a browser on a remote or headless machine that has no opener.
