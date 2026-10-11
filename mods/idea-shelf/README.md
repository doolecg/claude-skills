# Idea Shelf

Park an idea the moment you have it, without starting a turn or interrupting Claude, and come back to it later. Each project folder has its own shelf, kept across sessions.

## Commands

- `/idea <text>` adds an idea to this project's shelf. It runs at once, even while Claude is working, and nothing is sent to the model.
- `/idea edit <n> <text>` replaces idea number n and keeps its place on the shelf.
- `/ideas` opens the shelf in a pane.

In the pane each idea has:

- **Send**: submits the idea as your next prompt (it waits its turn if Claude is busy). The idea leaves the shelf once it has been submitted. If the prompt is refused, the idea stays.
- **Edit**: turns the idea into a text field. Enter or Save keeps the change, Cancel drops it. An empty idea is refused.
- **Delete**: removes the idea.

On a mobile surface the pane has no text field, so Edit is replaced by a note that points to `/idea edit <n> <text>`.

## Rules

- One shelf per project folder. Folders are matched without regard to case or slash style, and a subfolder has its own shelf.
- An idea can be up to 2000 characters. Longer text is refused with a plain message and nothing is saved.
- Ideas are saved in the plugin's own store, so they survive restarts.

## Install

```
/plugin install idea-shelf --marketplace doolecg/claude-skills
```

Type it in a terminal `claude` session, answer `y` to add the marketplace and pick user scope. It then loads in every desktop Code tab session too (the Code tab cannot run `/plugin` itself).

## Developing

`claude --plugin-dir F:\PROGRAMMING\REPOS\claude-skills\mods\idea-shelf`

Check it with `claude plugin validate <folder>` and `claude plugin test <folder>`.

## Limits

- The shelf is keyed by the session's project root (where the session started, or where `/cd` moved it), not by the shell's current directory.
- Commands answer with a short line that is recorded in the transcript like any command output. It does not repeat the idea's text and starts no turn, but the engine decides whether such output is shown to the model on a later turn.
- Two sessions in the same folder share one shelf. Each change re-reads the store first, but an open pane only redraws after its own session changes the shelf, so it can be out of date until you press something or reopen it.
- Send hands the text over as a prompt; it cannot attach files or images, and `@file` mentions in an idea are not expanded.
- If the pane has no room to open (a narrow terminal), `/ideas` prints the numbered ideas as text instead and the buttons are not available.
- There is no undo for Delete or Send.
- The pane has no reordering and no search.
