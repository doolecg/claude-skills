# Clean View 1.2.0

## Changed
- Loading bars use the denser dot-matrix look shared with the Sidebar.

---

# Clean View 1.1.0

## New
- When Claude asks you a question, the band splits in two: the checklist stays on the left and a question panel opens on the right, in Clean View's own look. The question runs across the top, the questions sit in a column of tabs (✓ answered, ▶ current, ○ waiting) and the options are laid out beside them.
- Answer from the band: press an option's number (or click it) to pick it. Multi-select questions tick options and finish with Done (`d`). Type your own answer in the Other row, or press Skip.
- Claude's own question dialog no longer opens over it, so there is only one place to answer.
- On a narrow terminal (under 110 columns) the question panel sits under the checklist instead of beside it.
- A question gets the panel even when no job is on screen; the checklist side then just says Waiting for your answer.
- Your answer goes back to Claude as your next message, and the band goes back to the single checklist.
- A small ✕ at the top right of the band clears it when it is stale (a finished job, Claude waiting for a reply you have already given, a question left up). A question still showing is skipped.

## Fixed
- While background helpers (subagents) are still running after Claude's turn ends, the band says Waiting for N helpers instead of Needs you or All done, and wraps up only when the last one finishes. A helper's own turns never touch your checklist.

---

# Clean View 1.0.0

## New
- A soft, rounded checklist above the prompt while Claude works: the job's name, how long it has run, an overall progress bar and one row per step with a 10-cell meter.
- Pixel progress bars: thin lines of pixels that rise through random scattered pixels behind a glowing edge, build up to each new percent and twinkle softly. A finished bar is solid.
- Tool calls, results, diffs and command output are hidden while Clean View is on. Claude's written replies stay.
- The header shows Needs you, Stuck, Stopped and All done in plain English. All done shrinks to one line after 5 seconds.
- Claude plans every request in plain-English steps first and reports progress as it goes.
- Turn it on and off from a Bottom Bar pill, which shows ● when on and ○ when off, or with `/simple on|off`. The choice is remembered.
- Nothing sits above the prompt while no job is running.
