---
name: plain-writing
description: Rewrites user-facing text (store pages, CurseForge/Modrinth descriptions, summaries, README intros, release notes, UI text) so it is easy to read at UK GCSE English level, keeping every useful fact. Use when the user says "simpler", "easier to read", "GCSE", "plain English", "less wordy", "rewrite the description", "store page", "summary", or gives a character limit for a description.
---

# Plain writing for store pages and app text

Make user-facing text easy to read at UK GCSE English level. Use this for CurseForge/Modrinth pages, README intros, release notes, app UI text, and mod descriptions.

## Rules

**Keep these rules when rewriting:**

- **One idea per sentence.** Most sentences under 15–20 words. Short paragraphs (1–3 sentences each).
- **Everyday words.** Use "use", not "utilise". Use "show", not "display". Use "start", not "initialise". Explain or drop jargon and internal names. No implementation details a player/user doesn't need (file formats, versions, algorithms, internal class names).
- **Lead with what it does for the reader.** Then explain how it works.
- **Active voice, second person.** Write "You do X", not "X is done" or "We built X".
- **Use lists for features.** Start each bullet with the thing, then a short plain explanation.
- **Keep every fact the original had.** Unless it is pure internal detail. Keep tables of controls/requirements, links and the licence line.
- **UK spelling.** No marketing fluff, no emojis, no exclamation marks.
- **Count length against limits.** If the user gives a limit (e.g. "256 characters"), aim for 85–100% of it. Use a tool to count (`python -c "print(len(s))"`), never estimate.
- **Offer choices for short texts.** For summaries and taglines, give 2–3 options with your recommendation. For long texts, just rewrite.

## Example

**Before:** "BlockCompanion shows a schematic in your world as ghost blocks so you can build it. It covers what Litematica does for placing and checking a build, with less on screen and simpler controls."

**After:** "BlockCompanion shows a schematic in your world as see-through "ghost" blocks. You build over them, block by block. It does the same job as Litematica, but with less on screen and simpler controls."

**Summary** (248 characters, limit 256): "See schematics in your world and build them block by block. Simple controls, a list of the materials you need, one layer at a time if you like, and AutoBuild to place it for you. Works on Fabric, NeoForge and Paper, and links live to BlockDesigner."

## Steps

1. Find the text (ask only if there is no obvious file). Note any length limit.
2. Rewrite it with the rules above. Re-read it once as a 15-year-old would: any sentence that needs a second read gets split or simplified.
3. Count characters with a tool when there is a limit.
4. Save it to the file it came from.
5. Deliver: if the user is remote, send the file with SendUserFile. If they ask for copyable text, paste it in a fenced `markdown` block; use four backticks for the fence when the text itself contains code fences.
