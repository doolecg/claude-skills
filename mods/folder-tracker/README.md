# Same-Folder Session Tracker

When two Claude Code sessions work in the same project folder, each one shows what the other is doing, so they don't undo each other's work.

Install (in a terminal; it then loads in every session, including the desktop app's Code tab):

    /plugin install folder-tracker --marketplace doolecg/dooles-tools

What you see:
- A band above the prompt, only while another live session shares this folder: `Other session: <phase> — editing <file> (n files)`. Up to three other sessions are listed.
- A toast when a file you are about to edit was already edited by another session in this folder. It shows once per file per session and never blocks the edit.

- `/folders [open|close]` (no argument flips it) opens a Folder Tracker pane: one card per other live session with its phase, how long ago it was active and the files it edited (up to four, then "+n more"). A warning card lists any file both sessions edited.

In the Sidebar:
- With the Sidebar mod, Folder Tracker is a tab. Its icon shows the number of other live sessions as a badge. The tab's Settings button opens this mod's options.

What is recorded:
- Each session writes only its own entry to the plugin store, keyed by the folder: phase, last update time, and the paths of files it edited (Edit, Write and NotebookEdit). File contents are never stored. Up to 50 paths per session.
- Phases come from events: working on a prompt, turn or tool call; waiting when a tool asks permission; idle when a turn completes; done when the session ends.

Limits:
- Only edits made through Edit, Write and NotebookEdit are seen. Bash commands that change files (for example `sed -i`) are not tracked.
- A session that closes without a session end stays "live" for 30 minutes after its last update, then drops out.
- Folders are matched case-insensitively. A subfolder is a separate folder.
- The band refreshes when this session draws it, so another session's new edit appears on the next redraw of this session.
- The tracker only knows sessions that loaded this mod.
