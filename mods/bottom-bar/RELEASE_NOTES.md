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
