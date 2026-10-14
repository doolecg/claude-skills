# Bottom Bar 1.8.2

## New
- In the desktop app, Task View's to-do list shows above the bar while Claude works: a main pixel bar, then a line and a bar for each step. The step in progress has a moving pixel run. When every step is done the bars turn green and stop, and the list stays for two minutes.

## Changed
- In the desktop app the bar never disappears: while Claude is idle (when the app hides the band above the prompt) a short bar shows under the prompt, with context, tokens used and the 5-hour and 7-day usage. Click it to open the toolbox.

## Fixed
- In the desktop app the bar above the prompt shows again while Claude works.

---

# Bottom Bar 1.8.1

## Fixed
- In the desktop app, while Task View shows a job, the bar now sits under Task View's checklist instead of one hiding the other.

---

# Bottom Bar 1.8.0

## Changed
- Other mods' buttons, like Enhance Prompt, come first on the left of the bar, with the name in a filled chip.
- In the desktop app, Enhance Prompt is a filled button. While Claude is idle the app hides the bar above the prompt, so Prompt Enhancer's own button shows under the prompt instead.
- In the desktop app the context meter is a moving pixel bar, like Task View's: scattered dots in the level's colour, twinkling, with bright pulsing pixels at the front.

---

# Bottom Bar 1.7.0

## New
- The context figure shows the tokens used as well as the percentage, like `5% · 50K/1M`.
- In the desktop app the bar sits just above the prompt: Enhance Prompt, the context meter, 5h and 7d usage, agents, and Doole's Tools at the right end. The model and effort are left to the app's own footer.

## Changed
- The bar's only buttons are now other mods' segments (like Enhance Prompt) and Doole's Tools. The commands you pick go at the front of the toolbox's Quick Launch instead of being pills in the bar.
- The toolbox's Launch section is now called Quick Launch.
- In the desktop app the toolbox is one panel with Model, Effort, Mods and Quick Launch, instead of four separate cards.

## Fixed
- The bar and the toolbox never showed in the desktop app: the app's own Claude Code refused their spacing.

---

# Bottom Bar 1.6.0

## New
- The bar now shows in the Claude desktop app too: model, effort, a context meter, 5h, 7d and agents, your pills as buttons, and a Doole's Tools button that opens the toolbox as a panel. The terminal looks the same as before.

---

# Bottom Bar 1.5.0

## New
- The bar shows your 7-day usage (7d %) after the 5-hour figure, yellow from 60% and red from 80%.

## Changed
- The Doole's Tools box has no settings page any more. The pill name and colour are set in /plugin › Installed › Bottom Bar › Configure, with plain labels and help.

---

# Bottom Bar 1.4.0

## New
- Other mods can add their own segment to the bar, right after the agents segment: a name, a short detail and up to three small buttons (like Undo). Clicking it runs the mod's command. See "Segments from other mods" in the README.
- On a narrow terminal those segments give way first, before the bar's own segments and the pills.

---

# Bottom Bar 1.3.0

## New
- The toolbox has a Mods list: every mod you have installed, each with an On/Off switch.
- A Settings page in the toolbox (⚙ Settings): change the name and the colour, and every other mod's options.
- A `Colour` option for the accent colour: Coral, Amber, Sage, Sky, Lilac or Rose.
- A ✕ to close the toolbox.

## Changed
- In fullscreen the toolbox opens as a panel down the right of the screen, so the prompt and the bar no longer move when it opens.
- A tidier toolbox: clear section headings, launchers three to a row, and the mods' options moved to the Settings page.

---

# Bottom Bar 1.2.0

## New
- The Doole's Tools pill opens a toolbox right above it: switch the model and effort, turn mods on and off, change every mod's options, and launch mods' commands.
- A `Tools name` option renames the pill and the toolbox ("Doole's Tools" by default). Change it in the toolbox, `/config` or `/plugin`.
- `/choose-pills` opens the pill picker. It is also in the toolbox, under Launch.

## Fixed
- A mod's on/off pill now follows the mode when something else flips it (the toolbox, or the command typed out).

---

# Bottom Bar 1.1.0

## New
- Mods with an on/off mode show it in their pill: a green ● when on, a grey ○ when off. It follows the mod live, whether you press the pill, type the command or use the mod's own button.
- Those pills use the mod's own name (Clean View, not Simple).
- In `✎ choose pills`, a mod's on/off command says so, with whether it is on now.

---

# Bottom Bar 1.0.0

## New
- A compact bar with a rounded border at the bottom of the terminal: model and context size, effort, a context meter, 5-hour usage and running agents.
- Click the model or the effort in the bar to switch it from a small picker.
- A pill bar locked to the bottom right: the mods you pick each get a filled, round-ended pill, and clicking one runs it. A ✓ shows while a mod is on.
- The Doole's Tools pill opens a small box with `✎ choose pills`, a picker that lists mods' commands first and searches every other command. Picks are saved across sessions.
- Soft Claude colours, with a light version when Claude Code uses a light theme.
