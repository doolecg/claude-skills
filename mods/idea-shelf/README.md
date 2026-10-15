# Idea Shelf

Park ideas while Claude works, without pulling it off the task. Each project has its own shelf. Ideas are saved in the plugin store, so they stay after you close Claude Code.

Install (in a terminal; it then loads in every session, including the desktop app's Code tab):

    /plugin install idea-shelf --marketplace doolecg/dooles-tools

Commands:
- `/idea <text>` parks an idea on the current project's shelf. It does not start a turn and is not sent to the model. It runs during a turn too.
- `/idea edit <n> <text>` replaces idea number n (the order in `/ideas`). The idea keeps its place.
- `/ideas` opens the Idea Shelf pane. Each idea has Send, Edit and Delete buttons. `/doole_idea-shelf` does the same.
- Send submits the idea as your own prompt, as if you had typed it. If Claude is working, the prompt is queued and runs when the session is idle. The idea leaves the shelf once it is submitted.
- Edit shows the idea in a text field with Save and Cancel. Enter also saves. Save with empty text is refused.
- Delete removes the idea.

In the Sidebar:
- With the Sidebar mod installed, `/ideas` opens as the Idea Shelf tab: a field to add an idea, and each idea with its age and Send, Edit and ✕ buttons. `/ideas close` closes it. The tab's badge shows how many ideas this project has.

Settings (Mod Settings, `/doole_settings`, or `/config`):

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | On | Off stops the commands, the pane and the Sidebar badge. Saved ideas are kept. |
| Order of ideas | Oldest first | Oldest first or Newest first. The numbers used by `/idea edit` follow this order. |
| Remove an idea when sent | On | Off keeps an idea on the shelf after you send it. |
| Show how old each idea is | On | The age beside each idea in the Sidebar tab. |
| Show the idea count on the Sidebar tab | On | The badge on the Sidebar tab. |
| Longest idea | 2000 | Ideas longer than this are cut (20 to 10000). |

Limits:
- Ideas are kept per project folder, matched case-insensitively, and a subfolder has its own shelf.
- Ideas are stored in the plugin store, which is shared by all sessions on this machine. The pane refreshes when this session draws it.
- The edit field is not available on mobile surfaces; there Edit is replaced by a note.
- `/idea edit ...` is read as an edit, so an idea whose text begins with "edit <number>" must be parked another way.
- Each idea is up to 2000 characters unless you change the Longest idea setting.
- The age and the badge settings apply to the Sidebar tab only; the plain pane shows no ages.
