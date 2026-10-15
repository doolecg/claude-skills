# Bottom Bar 1.9.0

## New
- `/doole_bottom-bar` opens the toolbox, the same as the old command, which still works.

## Changed
- The to-do list above the bar is now one pixel bar across the width of the prompt, with the step count at its end ("2 of 5", or "All done · 5 of 5" in green). The steps themselves are no longer repeated, since Claude's chat already lists them.
- While steps are open, a faint wave of pixels rolls along the empty part of the bar.
- The "ctx 33% · 327K/1M" line under the model switcher is gone; the same figures are in the bar above the prompt.

## Fixed
- The to-do bar's pixels now animate: the bar keeps its own frame clock while steps are open.
- In the toolbox, long mod names, descriptions and Quick Launch labels stay inside the panel.

---

