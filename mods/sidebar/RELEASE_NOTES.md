# Sidebar 1.5.0

## New
- A proper Claude desktop app version: the tabs are a row of native buttons, cards are rounded boxes, and meters are smooth bars instead of text. The terminal looks the same as before.

---

# Sidebar 1.4.0

## Changed
- The sidebar has no settings pages or ⚙ buttons any more. Every mod's options are in /plugin › Installed › <mod> › Configure; a tab that only had options says so in one line.
- The ⋯ page keeps which tabs show and their order.
- Cards and bars sit on the terminal's own background, like the Bottom Bar.
- The Context footer shows Hindsight, CodeGraph, git and test passes; the context-used row is gone.
- Folder Tracker, Design Picker and Plain English tabs are gone (those mods were removed).

---

# Sidebar 1.3.0

## New
- With the Context mod installed, every tab has a footer at the bottom: how much context is used, whether Hindsight answers and the repo has a CodeGraph index, the git branch with its changed files, and the test passes against your limit. Its ⚙ opens Context's settings.
- A Rule Guard tab (⊘ Rules): the tool calls it stopped this session, and each of its rules as a switch.
- The ⋯ page has a Footer section with Context's settings.

## Changed
- With every mod installed the tab strip takes three rows.

---

# Sidebar 1.2.0

## Changed
- Each tab shows a symbol and a word (Flightdeck, Improve, Steps, Ideas, Folders, Enhance, Design, Plain, Bar), and the tabs spread across the full width in as few rows as fit.
- The open tab is filled in the one accent colour. Counts on tabs use the same colour.
- Clean View's overall progress bar has an outline, and each step's small bar has edge lines.

---

# Sidebar 1.1.0

## Changed
- Tabs switch at once, even while Claude is working. Switching no longer runs commands, so nothing is added to the chat and Claude's turn is left alone.
- The open tab is a rounded pill. The other tabs are evenly spaced icons with a small count when they need you (◇⁵).
- The Bottom Bar tab's icon is now ▭.

## Fixed
- The tab buttons inside the Sidebar's own pane did nothing and printed "no command.run hook answered it".

---

# Sidebar 1.0.0

## New
- One sidebar with a tab for each of your mods: Flightdeck, Self Improve, Clean View, Idea Shelf, Folder Tracker, Prompt Enhancer, Design Picker, Plain English and Bottom Bar.
- `/sidebar` opens and closes it. `/sidebar <mod>` jumps to a tab, and `/sidebar settings <mod>` opens that mod's settings page.
- Flightdeck, Self Improve, Idea Shelf and Folder Tracker draw their own tab. The sidebar draws the rest, with each mod's on/off modes and options.
- Clean View's tab mirrors the job running now, with its steps and pixel bars.
- The ⋯ page shows or hides each tab, changes their order and sets the Bottom Bar's colour.
- It follows your theme and the Bottom Bar's colour. If you leave it open, it opens again next session.
