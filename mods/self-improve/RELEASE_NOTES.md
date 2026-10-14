# Self Improve 2.2.3

## Changed
- With the Context mod installed, the Sidebar tab has a footer at the bottom: context used, Hindsight and CodeGraph, the git branch and changes, and test passes.

---

# Self Improve 2.2.2

## Fixed
- Lessons for one project no longer wait forever when Hindsight cannot save to another project's bank. Each bank is tried on its own, and the run notes name the bank that failed.
- Learning from a long session (a transcript over 4 MB) no longer fails with "still running after 20000ms" on Windows. The end of the transcript is now read in about a second instead of over a minute.

---

# Self Improve 2.2.1

## Changed
- The Sidebar's tab strip on top shows each tab as a symbol and a word, spread across the full width, with the open tab filled in one accent colour.

---

# Self Improve 2.2.0

## Changed
- Opens and closes itself when you pick or leave its Sidebar tab, straight away, even while Claude is working.
- The Sidebar's tab strip on top uses the new rounded pill and count badges.

## Fixed
- Leaving its Sidebar tab printed "no command.run hook answered it" and left the pane open.
