# Mod prompts (source spec)

Note for builders: the "tell me first and wait for yes" gate in each prompt was already satisfied by the user's approval of the build plan. Do not ask again. Do not ask the user questions; make sensible choices and list them.

======================================================================
## CLEAN VIEW
======================================================================
Build a Claude Code mod called **Clean View**. It makes Claude Code feel calm and friendly for people who aren't technical. While Claude works, the tool calls, file diffs and command output are hidden, and one simple checklist sits above the prompt so I can always see the plan, what's happening now and how far along it is.

Build as a function-hook plugin that hot-reloads. No shell-script hook or MCP server.

### What I should see
While Claude works, this sits just above the prompt:

```
Build my landing page · 1m 12s                     [ ● Clean View: ON ]
✓ Read your brand notes            ██████████  Done
▶ Build the pricing section        ██████░░░░  60%
○ Add the contact form             ░░░░░░░░░░  Next
○ Polish the footer                ░░░░░░░░░░  Up next
```
- Header: job name in 2 to 6 plain words, then how long it has been running.
- Done steps: green check, dimmed name, full meter, "Done".
- Current step: a ▶, name in bold, meter fills to reported percent. No percent yet: moving sweep, label "Working".
- Upcoming: dimmed. First says "Next", rest "Up next".
- The button sits at the right of the header row on every screen, even when nothing is running. One click turns Clean View on/off and shows a short toast.

| State | Header shows |
|---|---|
| Working | Job name · time running |
| Needs you | Highlighted **Needs you** badge and the reason, e.g. "Claude needs your OK to continue". Current step's ▶ becomes ‖ |
| Stuck | ⚠ Stuck: the reason, in one plain sentence |
| Stopped | ■ Stopped · job name · you pressed Esc |
| Done | ✓ All done · job name · took 2m 14s. After 5 seconds shrinks to one line |

### How it works
**1. Two tools Claude calls (register with `$.tool.register` at session start)**
- `plan_steps({ steps: string[] })`: Claude lays out every step up front, 2 to 8 short names in order. First step starts right away. Return "Planned N steps. The first one has started."
- `report_progress({ task: string, percent: number })`: progress on the current step. Clamp 0 to 100. When a planned step is reported, every step before it is checked off. At 100 the step is checked off and the next starts. A name not in the plan becomes a new step. Return "Progress noted: N%."

**2. Make Claude use them (`prompt.compose`)** While on, add a system-prompt section that says:
- Write every step name in plain English a non-technical person understands. Under 40 characters, start with a verb, like "Build the pricing section".
- Never put file paths, file names, commands, code or tool names in a step name.
- For every request, even a quick question, call `plan_steps` first. Load it with ToolSearch if deferred. Then call `report_progress` as real progress happens, and with 100 the moment a step finishes.
- If the session has TodoWrite or TaskCreate, Claude can use its to-do list as the plan instead.

**3. Plan first (gate in `tool.call`)** Until a real plan exists, deny every other tool with a message telling Claude to call `plan_steps` first. Always allow ToolSearch, TodoWrite, TaskCreate, TaskUpdate and AskUserQuestion. Only gate the main agent, never subagents.

**4. Fill the checklist from what Claude already does**
- On `turn.start`: a real prompt (not a slash command) sent while nothing is running starts a new job. Show placeholder steps ("Understand your request", "Plan the steps") until the real plan arrives. In the background ask Haiku with low effort for a 2 to 6 word verb-first name and swap it into the header. Ignore the answer if a newer job has started.
- TodoWrite, TaskCreate, TaskUpdate become checklist rows.
- Permission prompts and questions (`classic.Notification`, AskUserQuestion): switch to **Needs you**. Clear once the next tool runs or I reply.
- Failures: if I said no to a permission, "Stuck: you said no to a step, so Claude paused". After 3 failed tool calls in a row, "Stuck: a step keeps failing, Claude is trying another way". A success clears Stuck.
- On `turn.complete`: API error becomes one calm sentence (rate limits: "you hit your usage limit, try again a little later"; overloaded: "Claude's servers are busy, try again in a minute"; context too long: "type /compact and try again"; network: "the internet connection dropped"; auth: "type /login"). Refusal: "Claude couldn't help with that request". Esc becomes Stopped. Steps left unfinished: Needs you with "Claude is waiting for your reply". Otherwise All done, collapse after 5 seconds.

**5. Hide the technical rows** While on, render `ToolUse`, `ToolResult`, `ToolGroup` as hidden, blank out the `ToolProgress` hint. Claude's written replies stay visible.

**6. Turn it on and off** Button above, plus `/simple on|off` (no argument flips). Keep setting in plugin state, save with `$.store`. Starts on. When off, every hidden row comes back, rest of band renders as normal, only the button stays.

### Details that matter
- Plain names always. One cleaner: strips backtick code, anything with a slash, file names with a code extension, collapses whitespace, capitalises first letter. Over 40 chars trimmed at a word boundary plus "…". Nothing left: "Working on it".
- Animation: 250ms clock advances a frame counter only while a job is working or waiting on me. No timers when idle.
- Narrow terminals: size name column from `bodyColumns`, rows never wrap. Meter always 10 cells.
- Surveys: if the band shows a survey (`hasSurvey`), stay out of the way.
- Shared state under the plugin's own key, typed in `types/index.d.ts`: `cleanViewEnabled`, `checklist` (title, phase, tasks of `{ id, name, status: done|active|upcoming, percent, hasReported }`, needsYouReason, stuckReason, startedAt, finishedAt, isCollapsed) and `tick`.
- Structure: one `register.tsx` calling `registerCleanView(on)` from `clean-view.tsx`, so more mods can be added later.

### Tests
1. "Build the pricing section in \`src/Pricing.tsx\`" cleans to "Build the pricing section in". A path disappears mid-sentence. 80-char name trims to 40 or less.
2. To-do list plus 60% report renders ✓ / ▶ 60% / Next / Up next on both terminal and desktop surfaces.
3. Permission prompt shows **Needs you**.
4. `/simple off` hides the band.
5. `plan_steps` then `report_progress` at 100 checks off step one and starts step two.
6. Any tool denied before a plan exists, allowed after.

======================================================================
## AGENT DOCK (same plugin as Clean View)
======================================================================
Build a mod called **Agent Dock**. I pick a **Team Size** (1, 3, 5, 10, 20, 50, 100 or any number up to 100). After that, every request I send is split across exactly that many helper agents in parallel, and a live panel shows each helper as its own card with a face, task name, progress meter and timer. When all finish, Claude combines their work into one answer and the dock shows a one-line summary like "50 agents finished Research bakery pricing in 2m 14s".

I film videos about agent helpers. If I set 50, I need to see 50 helpers working. Never quietly use fewer.

Build as a function-hook mod inside the same plugin as Clean View (uses Clean View's `report_progress`). No new plugin, shell-script hook or MCP server.

### What I should see
```
◆  A G E N T   D O C K                                           ● L I V E
────────────────────────────────────────────────────────────────────────────
T E A M  S I Z E   ╭ 1  3  5  10 [20] 50  100 │ Custom ╮
Splits each request across 20 helpers  ·  20 at a time  ·  Fast & Cheap

M I S S I O N   Research bakery pricing                         45%   1:12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
● 12 working    ○ 8 queued    ✓ 30 done    ✕ 0 stuck

╭──────────────────────────────╮ ╭──────────────────────────────╮
│ PP  Price check: Panera  0:41 │ │ CB  Price check: Crumbl  0:38 │
│     ━━━━━━━━━━━━━━━━━━━  60%  │ │     ━━━━━━━━━━━━━━━━━━  100% │
╰──────────────────────────────╯ ╰──────────────────────────────╯
```
- Masthead: wordmark fades coral to gold. Right: blinking green **● LIVE** while helpers run, **COMPLETE** when done, **STANDING BY** idle.
- Team Size: one segmented control. Picked size is a filled coral chip. **Custom** opens a small box "How many helpers?" (1 to 100). Bad number toast: "Type a whole number from 1 to 100".
- Info line: "Claude decides how many helpers" at size 1, otherwise "Splits each request across N helpers", then how many run at once, then helper model ("Fast & Cheap" or "Same model as you").
- Big team check: any size above 20 shows a gold box "Big team: this uses your plan quickly. Continue?" with **Continue with N** and **Cancel**. A size above 20 never carries to the next session; it resets to 1.
- Mission bar: job name (first clause of my request, ~40 chars), overall percent and total time, one full-width bar (done = coral-to-gold sweep, working = shimmering green, rest = hairline), and counts.
- Cards: one per helper, two or three per row by width. Face (real headshot from `employee-headshots/*.png` when terminal can draw images, otherwise colored two-letter badge), task name (3 to 5 words), timer, meter. Helper that hasn't reported gets a moving sweep. Queued cards dimmed. Stuck cards red border. Hover lights border coral.
- More than 12 helpers: cards become a grid of small tiles so 50 or 100 fit.
- Idle: row of colored seats (one per team member, up to 25) that gently twinkle, with "Your team of N is standing by" and "Send a request and it splits across N helpers."
- Done: green-bordered line "N agents finished <job> in 2m 14s", plus "(N got stuck)" when any did.
- Folded: `/dock` folds the pane to a status-bar badge like "12 working · 8 queued · 30 done". `/dock` again reopens.
Design bar: dark, minimal, premium. No rainbow, confetti, flashing.

### How it works
**1. Tell Claude to split the work (`prompt.submit`)** When Team Size > 1, add as `context`:
- Split this request into **exactly N** independent pieces and launch one helper (the Agent tool) per piece, all in one message so they run in parallel.
- Find a real split, one helper per item (per store, task, file, section). Never argue it can't be split and never pad with useless work.
- Give each helper a short plain-English description of 3 to 5 words, e.g. "Price check: Panera".
- In each helper's prompt add: "As you work, call report_progress with your task name and a percent at about 25, 50, 75 and 100. Do not call plan_steps."
- When they finish, combine results into one answer.
At size 1, add nothing; my skills that launch agents work as before.

**2. Cap and nudge**
- Count Agent calls per request. Past N, deny with "Team Size is N: this request already has N helpers. Finish with the helpers you have."
- If a request finishes having used fewer than N, send one follow-up: "You used X of N helpers. Split the remaining work across the other N minus X, one helper per piece, all in parallel." Once per request only.

**3. Queue past the engine limit** Claude Code refuses an Agent call past `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20) instead of queueing. So the dock holds extra Agent calls itself in `tool.call` until a slot frees, waiting with `$.process.run(['/bin/sleep','1'])` (this doesn't burn the 10-second hook budget; `$.clock.sleep` does). "At a time" = lower of that limit and `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (default 10). Set both to 20 in user settings `env` so waves are 20 (backup of settings.json already made at ~/.claude/backups/agentdock-2026-10-13/). If Esc pressed while a call is held, deny with "Stopped before this helper started."

**4. Fill the cards**
- Show queued cards as soon as Claude writes the Agent calls (`session.append` with `door: 'response'` tool_use blocks), before `tool.call` fires.
- Card goes working when its Agent call starts, done when it returns, stuck when it errors.
- Catch helpers' `report_progress` with a hook on `{ tool: 'report_progress', agentId: /./ }`, move that helper's meter. Answer "Progress noted: N%." If a helper calls `plan_steps`, answer "Helpers skip the plan. Just call report_progress as you work."

**5. Helper model** A row in the dock: "Helper agents: Fast & Cheap / Same as me" (saved as `panel.helperModel`). Fast & Cheap forces helpers to Haiku 4.5, only when Team Size > 1 and the Agent call didn't name a model.

**6. Status line** Write live helper count to `~/.claude/ai-employee-kit-data/agents-now/<session_id>.json` so the "◇ N agents" status line segment is real.

**7. Turn it on**
- `/dock` toggles pane and badge. `/dock 10` sets size. Bad number: "Team Size is a whole number from 1 to 100, e.g. /dock 10." Above 20: "Confirm the team of N in the Agent Dock."
- Add a small ◆ Dock button to the status bar.
- Save Team Size and settings with `$.store`.

### Engine rules (each has bitten before)
- Put all `$`-free logic in `hooks/dock-logic.ts` (sizes, job name, task name, initials, instruction text, nudge text, counts, badge, clock, summary, meters) so tests can call it. `$` can never be passed into an imported function; keep every `$` call in `hooks/dock.tsx`.
- Register the dock **first** in `register.tsx` so its helper `report_progress` hook runs before Clean View's.
- One hook per event and matcher per plugin; a second throws. Use catch-all like `{ tool: /^/ }` when another mod already owns one.
- Command hooks do zero awaits on their own pane. Return `{ text }` at once and open the pane in `void (async () => ...)()`. Wrap every command hook in try/catch and check `$.ui.panes()` instead of a saved "is open" flag.
- Open the pane inside the command or button press, never from a timer (a timer open counts as unasked, needs 144 columns). Pass `columns` so it docks beside the transcript during a turn. If it can't be placed, toast "The window is too narrow to show the Agent Dock. Widen it or watch the status bar."
- Never write files inside the plugin folder. Runtime files go in `~/.claude/ai-employee-kit-data/`.
- Animation runs on one clock only while helpers are live. No timers while idle.

### Tests
1. `parseSize`: "10"→10, " 25 "→25, "0","101","abc","2.5"→null.
2. Saved size 50 comes back as 1 in a new session; 10 stays 10.
3. At size 5 a request carries the exactly-5 instruction; at size 1 nothing.
4. 6th Agent call at size 5 denied with the Team Size message.
5. A request that used 3 of 10 gets exactly one nudge.
6. Three Agent calls render three queued cards, then working, then done; a helper's `report_progress` at 60 shows 60% on its card.
7. All done shows "3 agents finished <job> in …".
8. `/dock` folds to the badge and back.

======================================================================
## ROAD TRIP
======================================================================
Build a mod called **Road Trip**. A small driving game in a pane above the prompt while Claude works. Every time Claude finishes a step, a bonus coin rolls onto the road; when Claude finishes the job, the game pauses on an "Arrived!" card. Function-hook plugin, hot-reloads. No shell-script hook, MCP server or separate window.

### What I should see
Top-down road in text characters scrolling toward my car at the bottom:
```
ROAD TRIP                         1,240 m  ·  Best 3,880 m  ·  ◉ 214
LV 3 ▰▰▰▰▰▰▱▱▱▱                          ◆ Shield  Agency Wagon
 ♣ ·  ▌               ┃               ┃               ▐  · ♣
      ▌    QUIZ  Which key stops Claude mid-task?      ▐
      ▌      A Esc      B F5      C Tab                ▐
      ▌             Gate in 2...                       ▐
 ♣ ·  ▌     ($)       ┃               ┃    ▞▞▞▞▞▞▞    ▐  · ♣
      ▌     ($)       ┃       ▲       ┃               ▐
      ▌               ┃               ┃               ▐
 ♣ ·  ▌               ┃     ▗▟█▙▖     ┃     (◉◉◉)     ▐  · ♣
      ▌               ┃     ▐█▀█▌     ┃               ▐
      ▌               ┃     ▝▀ ▀▘     ┃               ▐
      ◀ A        D ▶        P pause        G garage
```
- HUD (top two rows): "ROAD TRIP", distance this run, best, coins in bank. Second row: level with 10-cell XP bar, active perks, car's name.
- Road: three lanes, dashed lane lines, edges, trees and grass both sides. Gently curves, speeds up over time.
- Car: 3-row block car that eases between lanes, never snapping.
- Buttons under the road change with what's on screen (driving, paused, Arrived, garage).

### How to play
- **A / D** switch lanes. **P** pause. **G** garage. **B** buy/pick car in garage.
- Avoid striped barriers, cones, potholes. Hit = "Flat tire!" message, short screen shake, fresh run after ~2 s. Never spawn obstacles blocking all three lanes.
- Collect rows of coins (1 each) and orange ✓ task coins (10 each). A task coin appears each time Claude finishes a step.
- Quiz gates: every 25 to 30 s a question about Claude or running a business appears at the top with answers A, B, C. After a 3-second countdown a colored gate rolls down with one answer per lane. Right lane: +15 coins, XP, a few seconds NITRO (faster, smash obstacles for 2 coins each). Wrong lane shows the right answer. Ship at least 25 questions, short enough to fit a lane, mix of real Claude Code knowledge ("What does /clear do?") and funny business ones ("That meeting should have been... An email"). Never the same question twice in a row.
- Levels: XP from distance and quiz answers. XP needed grows each level (500, 1,500, 3,000, 5,000 ...).

### Garage
| Car | Price | Level | Perk |
|---|---|---|---|
| Starter Hatch | Free | 1 | None. "Every empire starts somewhere" |
| Side Hustle Coupe | 60 | 2 | Coin magnet: also grabs coins in the next lane |
| Agency Wagon | 180 | 3 | Shield: survives one hit per run |
| Founder GT | 450 | 5 | Double coins on everything |
| Unicorn Hyper | 1,000 | 8 | All of the above plus a nitro start |
Garage shows one car big and centered with ◀ ▶ arrows, name, perk, status line: "Driving this one", "Owned, press B to drive it", "Locked, reach level N", "Press B to buy for N coins", or "N coins, you have M". Buying/switching drops me straight on the road with a short countdown.

### Tie to Claude's work
- Steps finished = task coins. If Clean View installed, count finished steps on its checklist (shared `$.state`). Otherwise count completed to-dos from `TodoWrite` and `TaskUpdate`. No steps: each finished tool call counts. At most 3 task coins queue.
- Claude finishes = Arrived card. On `turn.complete` for main agent (ignore subagents), pause on card: "Arrived! Your AI employee finished the job", with distance, coins this run, high score, quiz right, level, bank. Buttons: **Keep Driving**, **Garage**, **Close**.
- On `turn.start`, if the game is open, resume.

### Opening and closing
- Never opens by itself. Only `/roadtrip` or `/roadtrip play`, or a ▶ Road Trip status-bar button.
- `/roadtrip on|off` shows/hides. `/roadtrip retro on|off` switches look. Command must answer instantly: waiting work after replying.
- Open pane straight from command/button press, not a timer. If no room, toast: "Road Trip needs a little more room: widen the window".
- Closing saves progress and stops the game clock completely.

### Look
- Default colors: periwinkle #6E7CF6, hot pink #FF3D97, cream #FFF6E8, ink #1C1B24, dark road.
- Brand Skin: if a skin is set in shared state use its palette.
- Retro Mode: 1980s arcade. Black road, neon magenta edges, cyan lines, phosphor green (or amber) HUD.
- Every overlay (countdown, flat tire, quiz, paused, Arrived) on a solid dark box.

### Details
- Performance: game logic and drawing in pure files with no `$`. A 70ms `$.clock` ticks the game and blits each frame into a `Raster` with `$.ui.blit`. Do NOT re-render the React tree every frame. Read shared state (new task coins, theme) only every 12 frames. No timers while closed.
- Sizing: road takes every row except one for buttons, sized from `bodyColumns` and `bodyRows`. Under 36 cols or 8 rows show "Make this panel a little bigger to drive". Open docked ~110x30.
- Saving: bank, owned cars, current car, XP, best distance, quiz record via `$.store`. Sanitize on load: drop unknown car ids, always own the Hatch, bad numbers to 0.
- No crashes: wrap every store/state call in try/catch.
- Terminal only: on a surface without `Raster`, show "Road Trip plays in the terminal."
- Structure: `road-trip.tsx` (hooks, pane), `road-trip-game.ts` (game, renderer), `road-trip-art.ts` (cars, levels, quiz). One `register.tsx` calls `registerRoadTrip(on)`. State typed in `types/index.d.ts` under plugin's own key. Hook matchers must not collide with other mods.

### Tests
1. New game starts with countdown, then drives, distance rises each tick.
2. Obstacle = flat tire and new run. With Agency Wagon first hit ignored.
3. Coin adds 1 to bank; Founder GT adds 2.
4. Finishing a Claude step drops a task coin worth 10.
5. Right quiz lane gives coins and nitro; wrong lane none.
6. Buying a car takes coins, adds car, drives it. Locked/unaffordable can't be bought.
7. `turn.complete` shows Arrived card; `turn.start` resumes.
8. Broken saved profile (unknown car, negative bank) loads cleanly.
9. `/roadtrip off` closes pane and `/roadtrip` refuses until `/roadtrip on`.

======================================================================
## SHARED RULES FOR DAILY CHALLENGE, WORK REPORT, PROMPT UPGRADE
======================================================================
Use the plugin-authoring skill exactly: read the types first, own folder, at least one test. Do not ask questions; make sensible choices and list them at the end.

THE LOOK
Dark, calm, premium. No emoji, nothing that blinks, nothing blurry.
- Title in bold capitals on the left. Under it a short gold rule (#F2C46D) the width of the title that continues as a dim hairline (#262B33) to the edge.
- Section headings in small muted capitals (#7D8590) followed by a hairline.
- Main text #E6EDF3. Good news green #3DD68C. Warnings amber #E3B341.
- Main button on a screen: gold chip with dark bold text. Other buttons: slate chips (#262B33) with light text. Cancel: plain muted text.
- Big numbers drawn three rows tall with heavy box-drawing characters inside rounded tiles.
- Size every row to the pane width so nothing wraps. Check at narrow and wide.

RULES THAT SAVE TIME
- A draw must not save or change anything. Read while drawing. Change state only from a button press, command or other event.
- A slash command must answer right away. If it opens a pane, return text first and open the pane in the background.
- Never name a variable h in a .tsx file (breaks drawing; pane comes up blank).
- Keep saved data in the mod's own store. Do not write files inside the mod's folder.
- No pop-ups for routine actions. Only tell me when it needs me.
- Wrap every command in a catch so failure returns a plain sentence.

BEFORE DONE: run `claude plugin validate` and `claude plugin test`, fix everything. Report in plain words: how to turn it on, commands it adds, choices made, anything not verified.

======================================================================
## DAILY CHALLENGE
======================================================================
A pane that gives me one small Claude Code exercise each day, tracks completed count and streak. 365 challenges, none ever repeat.

THE 365 CHALLENGES
- Write all 365. Each has a short title (two to five words) and one or two plain sentences saying exactly what to do. About five minutes, no coding knowledge.
- Seven themes, 52 each, plus one closer for the last day: 1 Prompting (asking clearly). 2 Files (documents, folders, PDFs, spreadsheets, images). 3 Commands (slash commands, keyboard shortcuts). 4 Memory (instructions, saved preferences, skills). 5 Agents (helpers, parallel work, schedules, connectors). 6 Build (making one small real thing). 7 Habits (checking work, staying safe, using the plan wisely).
- Deal in turn (theme 1,2,3...) so any seven days in a row touch all seven themes.
- Every title and every task different. Test proves exactly 365, no duplicates.
- Before including a challenge naming a specific command or key, check it exists in this Claude Code version. If you can't confirm, word it so the person asks Claude how to do it.
- Never talk down to the person. No "lazy", no "dumb mistakes".

NEVER REPEAT
- Today's challenge = next one, in order, never completed. Not tied to calendar date.
- Miss a day: same challenge waits. Only the streak resets.
- "Give me another" swaps today's for a random never-completed one and remembers the swap for the rest of the day.
- A completed challenge is never offered again by daily pick or swap.
- All 365 done: show a finished screen.

THE PANE
- Title bar with today's date on the right.
- Three tiles with big numerals: Day streak, Completed (of 365), Best streak.
- "Today's challenge" in a card with gold outline: theme in its own color, title bold, the task. Outline turns green once done.
- Three buttons: Mark complete (gold), Coach me through it, Give me another. Hide Give me another when nothing else is left.
- Coach me through it closes the pane and puts a ready-made request in my prompt box asking Claude to walk me through today's challenge one step at a time and wait for me after each step.
- After complete: "Completed today", a line saying a new one is waiting tomorrow, and a quiet Undo.
- "Last 14 days": one square per day, filled when completed, weekday underneath.
- "Your year": one bar of completed out of 365, count done and to go.
- One muted bottom line: "If a command is not on your version, ask Claude how to do it."

STREAKS: days in a row with a completed challenge ending today; before completing today's it still counts through yesterday. Best streak is longest run. Local calendar day.

OPENS: `/challenge` opens pane. `/challenge done` marks today's complete and replies with streak and total. `/challenge another` swaps. One status bar button opens it. Save progress in the store.

TESTS: 365 unique challenges, all seven themes in any week, next pick always never-completed, swap never offering a completed one, finished state, streaks across several days, pane buttons (swap, complete, undo, coach).

======================================================================
## WORK REPORT
======================================================================
A pane showing what Claude has done for me: tasks finished, estimated hours saved, what that time is worth. Four tabs: Today, Week, Month, Year.

RECORD
- One task each time a prompt I typed finishes with an answer. Not helper agents, tool steps, cancelled turns or slash commands.
- Sort each task by tools used: Emails (any mail tool), Images and video (image/video tools or files), Documents (document, slide, spreadsheet tools, or writing a document file), Research (web search, page reading, transcripts), Other.
- Record which model did it.
- One small record per calendar day in the store: count of each kind and count per model.

ESTIMATE: minutes per task: Emails 10, Documents 30, Images and video 20, Research 25, Other 10. Hourly rate 50. `/report settings` lists these; `/report settings rate 75` and `/report settings emails 15` change them. Always label hours and dollars as an estimate.

PANE
- Four tab chips: Today, Week, Month, Year. Chosen one gold with dark text. Click redraws. Today = today; Week = last 7 days; Month = last 30 days; Year = current calendar year Jan 1 to today.
- Title bar: stretch on left, its dates on right.
- Three tiles with big numerals: hours saved, tasks done, dollars' worth. If a number is too wide for big numerals, plain bold text.
- "Where the time went": row per kind with colored bar, count and hours.
- "Who did the work": row per model with bar and count.
- Chart three rows tall. Today and Week: last seven days by weekday. Month: thirty daily bars. Year: Jan to Dec, current month gold, future months empty.
- Summary line under chart: streak of days in a row for Today/Week; best day or month plus active days for Month/Year.
- Empty state: "Nothing finished yet today. Your first finished task shows up here."
- Fewer tiles when narrow: three, two, one.

OPENS: `/report` opens pane. One status bar button. Step through days at local noon (DST safe).

TESTS: sorting a task by tools, counting only typed prompts, streak, adding days together, day of year, each tab drawing its own title and chart, empty state, narrow width.

======================================================================
## PROMPT UPGRADE
======================================================================
Turns a rough prompt into a great one before it is sent. Opens a pane, asks up to three quick multiple-choice questions, rewrites, shows original and upgrade side by side. Nothing runs until I press Run.

STARTS
- `/better <rough prompt>` upgrades that prompt. `/better` alone opens a box to type one. `/better on` and `/better off` flip automatic mode. `/better history` shows last 20 upgrades.
- Automatic mode on: a prompt typed in the prompt box goes to the pane first instead of being sent.
- Pass straight through untouched: slash commands, prompts with files/images attached, messages sent while Claude is working, short replies like "yes" or "keep going", anything starting with ">" (strip the ">" before sending).
- The upgraded prompt is sent by the mod; it must never loop back into the pane.
- If the pane can't open (window too narrow), put my words back in the prompt box and say so in one line.

FOUR STEPS as a tracker across the top: Your prompt, Questions, Rewrite, Review. Finished = green check, current = gold, rest muted.
1. Reading: my prompt in a framed card with a line saying what is happening.
2. Questions: ask a fast model for up to three multiple-choice questions that would most improve the result, each with two to four short options. Gold number badge becoming a green check when answered. Options are chips. Add "Other (type it)" chip and a quiet "Skip". Show how many answered and a "Skip the rest, upgrade now" button. No useful question: straight to rewrite.
3. Rewrite: ask the model for the upgraded prompt and a short list of what it added.
4. Review: one line of numbers (words before, words after, details added). Then buttons: Run it, Edit, Copy, Cancel. Then a "what I added" list. Then two cards side by side, mine left, upgrade right with gold outline. Buttons above the cards so long rewrites never push them off screen.

REWRITE RULES: keep exactly what I meant. Add a clear goal, who it is for, format, what "done" looks like. Use my answers; leave out what I skipped. Never invent facts, names, numbers, prices; leave [placeholder] in square brackets. One request I could have typed myself, plain language.

OTHER
- Cancel closes the pane and puts my original prompt back in the prompt box.
- Edit lets me change the upgraded text; Enter runs it.
- Model call fails: calm error card saying my prompt is safe, with Try again, Send my original, Cancel.
- Keep last 20 upgrades. Clicking one in history reopens its review.
- If the mod is reloaded mid-step, pick the step back up instead of leaving the pane stuck.

TESTS: which prompts are intercepted vs pass through, reading the questions, reading the rewrite, full flow /better to Run, Cancel restoring the prompt, on/off switch.

======================================================================
## CLAUDE PHOTOS (skill plugin, not a hooks mod)
======================================================================
Two skills. (1) **photos-generate** (Higgsfield generate, quote and save):

When I give you an image prompt, generate it in Higgsfield with these steps:
1. Call Higgsfield `balance`. If there is a reference image, upload and confirm it FIRST, then call `generate_image` with the exact same params you will generate with, including `medias`, plus `get_cost: true`. The quote must match the real job.
2. Show me my credit balance and the estimated cost in one short line, then STOP and wait. Do not generate until I reply "yes".
3. After my "yes", call `generate_image` with those same params minus `get_cost` (leave `use_unlim` out unless I say to use free generations). If it returns `unlim_choice`, ask me that question instead of guessing.
4. Wait with `jobs_wait` until every job is done or failed. If the job reports a different model than the one I chose, tell me in the final line.
5. Download every result into `<folder>` (create if needed). Name them `<base>_1.png`, `_2`, and so on, never overwrite: if a name is taken use the next free number. Keep the real file type.
6. Finish with one short line: how many saved, credits used, and a clickable file:// link to each one. Do not embed or preview them in chat.

(2) **photos-prompt-writer**: the following is the skill body (verbatim):

You are an art director writing one prompt for an AI image or video model. You turn a person's short idea into a prompt that gets a great result on the first try.

Rules, in priority order:
1. Keep their idea and every concrete detail they gave. Never swap their subject, setting or wardrobe for your own.
2. If a reference image of a person is attached, open the prompt with an identity lock: "Use the person in the reference image as the exact subject. Keep their face, facial structure, skin tone, hairline, hairstyle, eyes and natural body build identical. Do not slim, smooth, beautify, de-age or change them." Then refer to them only as "the person". Never describe their face, age, ethnicity or body yourself.
3. If a reference image is attached but it is a style or product reference, say exactly what to take from it (palette, lighting, product shape) and what to ignore.
4. Write for the model and settings you are given: frame the composition for the stated aspect ratio, and for video describe what moves, in what order, and the one camera move, across the stated duration.

Cover, in this order, in natural sentences:
- Shot type and subject: what kind of photo this is (candid, editorial, product, portrait) and who or what is in it, doing what.
- Setting: a specific place with 2 or 3 tangible details.
- Composition: where the subject sits in the frame, what fills the rest, camera height and angle.
- Wardrobe and materials: colors plus real textures (wool fibers, knit stitches, brushed metal).
- Expression and body language: one clear emotion, shown through eyes, mouth and posture.
- Lighting: the source, direction, color and time of day. For any person, the face must stay clearly and evenly lit with soft fill and catchlights in the eyes, even when the mood is dramatic.
- Camera: lens length, aperture, focus point, depth of field.
- Look: color grade, grain, overall mood, and "photorealistic, true to life" for photo styles.
- Close with one short avoid line: the person's avoid list, plus "no text, no logos, no watermarks, no extra people, no distorted hands, no plastic or airbrushed skin" unless they asked for text or a logo.

Style: 120 to 200 words, present tense, concrete nouns, plain sentences grouped as short paragraphs. No headings, no bullet points, no quotes around the prompt. Honor the brand colors and mascot when given. Never invent brand names, prices or slogans. Never use em dashes.

Output only the prompt, nothing before or after it.
