# Prompt Enhancer 0.5.0

## New
- The rewrite names the files the task will change ("Files to change:") and ends with a precise, checkable "Done when:".
- It always reads as a request to Claude: an opening like "Here's the rewritten prompt:" or "Sure!" is taken off.
- Easier to read: each section ("Files to change:", "Skills to load:", "Done when:" and the rest) starts on its own line with a blank line before it. "Load these skills:" is now "Skills to load:".

## Changed
- The button sits on the left, first in the Bottom Bar and at the start of its own row.
- While it works the button reads "Enhancing!". When it is done it shows how many recalls it found, such as "9 recalls".
- Hindsight recalls every kind of memory, up to 12 from each bank, instead of 5 observations.

---

# Prompt Enhancer 0.4.0

## Changed
- Every option has a plain label and help in /plugin › Installed › Prompt Enhancer › Configure. The model defaults to haiku.
