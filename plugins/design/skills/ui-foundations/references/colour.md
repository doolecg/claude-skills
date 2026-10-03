# Colour

## Layers

1. **Neutral scale**: grey (tint it slightly toward the accent hue) from near-white to near-black, 10 to 12 steps. It
   carries surfaces, text and borders, which is most of the screen.
2. **Accent scale**: one brand or action hue, tonal steps 50 to 950. Used for the primary button, selection, links,
   focus ring. A second accent only if the app truly needs one.
3. **Status colours**: success (green), warning (amber), error (red), info (blue). Each needs a foreground, a
   background tint, a border and an icon colour.
4. **Roles** (what the UI code refers to): `surface`, `surface-raised`, `surface-overlay`, `text`, `text-muted`,
   `text-disabled`, `border`, `accent`, `accent-hover`, `on-accent`, `focus`, `success`, `warning`, `error`. Map
   roles to scale steps in one theme file; light and dark themes swap the mapping only.

## Building a scale

- Fix the hue, then step lightness evenly; reduce saturation toward the very light and very dark ends so they do not
  look neon or muddy.
- Check that the steps are distinguishable side by side. Name them 50, 100, 200 ... 900, 950.
- Pick the accent's button fill from a step that gives 4.5:1 with white (or dark) label text.

## Contrast

Ratio = (L1 + 0.05) / (L2 + 0.05), L from relative luminance (sRGB linearised: 0.2126 R + 0.7152 G + 0.0722 B).
Check with a small script rather than guessing.

| Pair | Minimum |
|---|---|
| Body text on its background | 4.5:1 |
| Large text (18 px+, or 14 px+ bold) | 3:1 |
| Button edge, input border, focus ring, meaningful icon vs neighbour | 3:1 |
| Muted or helper text | 4.5:1 if the user needs it; placeholders still about 3:1 or better |

Never rely on colour alone for state: pair with an icon, label or shape. Check red/green pairs for colour-blind users.

## Usage rules

- Accent for one thing per view (the primary action) plus selection state. Used everywhere, it signals nothing.
- Status colours only for status.
- 60-30-10 is a fair split: neutrals, secondary surfaces, accent.
- Avoid saturated colours side by side (vibration) and large saturated areas.
- Text on coloured fills: pick light or dark text by contrast, not by habit.

## Dark mode

- Background darkest (about `#121212` to `#1A1A1A`, not pure black). Raise elevation by lightening the surface
  (surface-1, surface-2, surface-3 each a few percent lighter); shadows carry little weight on dark.
- Text off-white (about `#E0E0E0`), not `#FFFFFF`; muted text still 4.5:1.
- Desaturate and lighten accents by about 10 to 20 percent so they do not glare; re-check button label contrast.
- Borders: low-opacity white, subtle.
- Dim bright images slightly; supply light-on-dark logos where needed.
- Re-check every state (hover, focus, disabled, error) in dark, not only the base look.
- Desktop and HTML: follow the system setting (`prefers-color-scheme`, or the OS theme query) and offer a manual
  override in settings, applied live.

## Game GUIs (Minecraft)

- Vanilla text colours: white `#FFFFFF`, light grey `#A0A0A0` for muted, dark grey `#404040` on light inventory
  panels, with the drop shadow on light-on-dark text. Prefer these over inventing a palette.
- Panels: vanilla tooltip look (about `#100010` at high opacity, purple-blue border) or inventory grey (`#C6C6C6`
  with bevel). Match whichever the screen sits beside.
- The scene behind the GUI is arbitrary (world, shaders, Bare Bones pack), so give every panel an opaque or
  near-opaque background; do not draw text straight onto the world.
- Keep the accent to one colour, used for the selected or primary element. Status: green, yellow, red as in vanilla
  chat and tooltips, always with text or an icon too.
