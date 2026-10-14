# Bottom Bar

A Claude Code mod that puts one compact, rounded bar at the bottom of the terminal and the desktop app, with a Doole's Tools button locked to its right end.

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ✦ Enhance Prompt │ ◆ Opus 5.5 · 1M │ effort xhigh │ ctx ▰▱▱▱▱▱▱▱▱▱ 5% · 50K/1M │ 5h 7% │ ◇ 0 agents   ◖ ✻ Doole's Tools ▲ ◗ │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install bottom-bar --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

The bar replaces a `statusLine` script. If you have one in `~/.claude/settings.json`, remove it, or you get both.

## What the bar shows

- The model and its context size, the effort level, a 10-cell context meter with the tokens used (`5% · 50K/1M`), your 5-hour and 7-day usage and how many agents are running.
- The only buttons are other mods' segments (like Prompt Enhancer's Enhance Prompt), first on the left, and Doole's Tools on the right.
- Click the model name or the effort level to open a small picker above it and switch. It floats over the prompt; while Claude is working it sits above the bar instead, so the spinner can't draw over it. Both are saved, the same as `/model` and `/effort`.
- On a narrow terminal the items on the right drop off first. The Doole's Tools pill always stays.
- In the desktop app the bar sits just above the prompt (the app's footer below it only has room for two items): Enhance Prompt first, then the context meter with tokens used, 5h and 7d usage and agents, and Doole's Tools at the right end. The model and effort stay in the app's own footer. The app shows that band only while Claude is working; the rest of the time a mod with its own fallback button (Prompt Enhancer) draws it in the footer.

## Doole's Tools

- The commands you pick go at the front of the toolbox's Quick Launch. They are no longer pills in the bar.
- `✎ Choose pills` in the toolbox (or `/choose-pills`) picks them. Mods' own commands are listed first; type in the search box to find any other command.
- Your picks are saved and come back in every session.
- The pill's name is the `Pill name` option ("Doole's Tools" by default). Change it in `/plugin` > Installed > Bottom Bar > Configure.

## The toolbox

The Doole's Tools pill opens the toolbox, one panel with Model, Effort, Mods and Quick Launch. In fullscreen it opens as a panel down the right of the screen, so the prompt and the bar stay where they are; on the main screen (no fullscreen) it opens right above the pill. Click the pill again, press Esc or click ✕ to close it.

```
╭──────────────────────────────────────────────────────────────╮
│ ◆ D O O L E ' S   T O O L S                              ✕ │
│ Model      Sonnet  Opus 5.5  Haiku  Fable                    │
│ Effort     Low  Medium  High  XHigh  Max                     │
│ MODS ─────────────────────────────────────────────────────── │
│ ● Clean View        A calm, plain-English checkli…    ● On   │
│ ○ Road Trip         A small driving game in a pan…    ○ Off  │
│ QUICK LAUNCH ─────────────────────────────────────────────── │
│ ✎ Choose pills      ✦ Guard             ◆ Diff               │
╰──────────────────────────────────────────────────────────────╯
```

- **Model** and **Effort**: click one to switch. The toolbox stays open.
- **Mods**: every mod you have installed, with an On/Off switch. For a mod with an on/off mode (below), the switch flips the mode. For any other mod it turns the mod itself on or off (`claude plugin enable` / `disable`) and reloads the plugins.
- **Quick Launch**: `Choose pills`, then the commands you picked, then every other command a mod adds. Clicking one closes the toolbox and runs it.
The bar's options (`Pill name` and `Colour`) are not in the toolbox. Set them in `/plugin` > Installed > Bottom Bar > Configure.

## On/off modes

A mod that can be turned on and off shows its state in the toolbox's Mods list: a green ● when on, a grey ○ when off, live. Clean View does this for `/simple`.

To make another mod do it, keep a `modes` value in its plugin state, keyed by the command that flips it, and write it at session start and whenever it changes:

```ts
await $.state.set({ plugin: 'my-mod', key: 'modes' }, { 'my-command': { label: 'My Mod', isOn: true } })
```

Declare it in the mod's `types/index.d.ts` (`modes: Record<string, { label: string; isOn: boolean }>`). The command should flip the mode when run with no argument, and reply with words like `My Mod is on.` A mod that only replies that way still gets a ● once it has been run from the toolbox.

## Segments from other mods

Another mod can put its own segment in the bar, first on the left, its name in a filled chip, with the same `│` divider after it. Clicking the segment runs a command. Prompt Enhancer uses this for its Enhance Prompt button.

```
✦ Enhance Prompt · 9 recalls · Undo │ ◆ Opus 5.5 · 1M │ effort high │ ctx ▰▱▱▱▱▱▱▱▱▱ 13% │ 5h 53% │ ◆ 1 agent
```

To add one, keep a `segments` value in your mod's plugin state, keyed by an id you choose. Write it at session start and whenever it changes:

```ts
await $.state.set({ plugin: 'my-mod', key: 'segments' }, {
  main: {
    label: 'My Mod',               // the segment's name, in a filled chip (40 characters at most)
    detail: '3 found',             // optional, dim, after a "·" (60 at most)
    command: 'my-command',         // run on click: a command name, then any arguments, no slash
    state: 'done',                 // optional: idle, working (amber), done or error (red)
    actions: [{ label: 'Undo', command: 'my-command undo' }], // optional, up to 3 smaller clicks
  },
})
```

Declare it in your mod's `types/index.d.ts` (`segments: Record<string, { label: string; detail?: string; command: string; state?: 'idle' | 'working' | 'done' | 'error'; actions?: { label: string; command: string }[] }>`).

- Each mod gets up to 4 segments. Anything malformed is left out.
- Segments are ordered by mod name, then by the order of your ids, so a rewrite never moves one.
- Writing the value again replaces all of your mod's segments. Write `{}` to remove them.
- On a narrow terminal, segments from other mods give way first: they are cut off from the right, before the bar's own segments. The Doole's Tools pill always stays.
- The bar draws each segment as a button keyed `seg:<your mod>:<id>`, and each action as `seg:<your mod>:<id>:<n>`, counting from 0.
- The bar's row carries the key `bottom-bar-segments`. A mod that draws its own fallback button in that row can look for it and stay out of the way. In the desktop app the footer carries it only while Claude works, when the bar above the prompt shows.
- A command the bar runs writes its state under the bar's own call, where the bar cannot see it. The bar picks up those writes when the command returns. To show progress while the command runs (say, "working"), handle the click yourself: hook `ui.press` on your segment's key and answer `{ element }` without calling `next`. Your writes then reach the bar as they happen.

In the desktop app each segment is a button at the start of the bar, with its detail after it and its actions as smaller buttons.

## Development

```
claude plugin validate .
claude plugin test .
```
