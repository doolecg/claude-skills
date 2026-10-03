# Type and spacing

## Type scale

Pick a ratio (1.2 minor third for dense apps, 1.25 major third general, 1.333 for roomy pages) and a base. Use four
or five steps in regular use.

| Step | Typical desktop / HTML size | Use |
|---|---|---|
| Caption | 12 px | helper text, timestamps |
| Body small | 13-14 px | dense lists, secondary labels |
| Body | 14 px desktop app, 16 px HTML reading text | default text, field labels |
| Subheading | 18-20 px | section titles |
| Heading | 24-32 px | screen or dialog title |
| Display | 40 px+ | landing pages only |

- Weights: regular 400 and semibold 600 cover most screens; add medium 500 only if needed. Two weights per screen.
- Line height: 1.2 tight for headings, 1.4 to 1.5 for UI text, 1.5 to 1.75 for long reading text.
- Letter spacing: slight negative on large headings (-0.02em), 0 on body, +0.05em on small uppercase labels. Avoid
  all-caps for sentences.
- Families: one UI family; a mono family for code and values. Use the system font stack unless the app already ships
  a font. No new font without asking.
- Hierarchy through size, weight and colour (text vs muted) together; do not use size alone.
- Test with real strings, including the longest label and translated or user-entered text.

## Readable measure

- Body copy: 45 to 75 characters per line, ideal about 66. UI descriptions 45 to 65, captions 40 to 60.
- Set `max-width` on the text block (about `65ch`); do not let paragraphs stretch to the window edge.
- Wider column, slightly more line height. Short UI strings and headings are exempt.
- In desktop windows, cap description text width and let controls, not prose, fill the space.

## Spacing scale

Base unit 4 px.

| Token | px | Use |
|---|---|---|
| 2xs | 2 | hairline gaps, icon to text in tight rows |
| xs | 4 | label to its control, inside chips |
| sm | 8 | between related controls, button padding vertical |
| md | 12-16 | padding inside panels, between groups of fields |
| lg | 24 | between sections |
| xl | 32 | page margins, major sections |
| 2xl | 48 | top-level separation |

- Never use a value off the scale. If 12 or 20 appears, make it a named step.
- Types of space: inset (padding inside a box), stack (vertical gap), inline (horizontal gap), grid gap.
- Related items get smaller gaps, unrelated items larger. The gap between groups should be at least about twice the
  gap inside a group; if the two look the same, grouping is lost.
- Panel padding: same on all sides unless there is a reason (smaller vertical for compact rows).
- Density modes: compact is one step down (tables, tool panels), comfortable is the default, spacious one step up
  (reading and onboarding). Pick one per screen.
- Row height: pick one and repeat it (for example 32 px desktop list rows, 40 px settings rows).

## Game GUIs (Minecraft)

- Everything is in GUI pixels. Design at scale 1, verify at scale 2 (1920x1080 test setup shows a 960x540 GUI) and
  scale 3 if the mod supports it.
- Font: fixed pixel font, 9 px line height at scale 1 (8 px glyph plus 1). Text width is measured in GUI pixels with
  the font; do not assume a fixed character count.
- Hierarchy without size: use white vs grey text, a panel heading band, spacing, and bold or underline sparingly.
- Spacing: use multiples of 2 or 4 GUI px. Typical: 4 between buttons, 6 to 8 panel padding, 10 to 12 between
  sections. Vanilla row pitch is 24 (20 button plus 4 gap).
- Keep text away from panel edges by at least 4 px; clip or ellipsise long strings instead of overflowing.
