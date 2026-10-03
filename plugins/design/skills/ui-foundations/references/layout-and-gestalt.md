# Layout, hierarchy and gestalt

## Grid and alignment

- Choose a structure and stick to it: a single column for forms and settings, sidebar plus main for apps, a column
  grid for card pages. 12 columns for HTML, 4 or 8 columns for narrower layouts.
- Gutters 16 to 24 px, outer margins 16 to 32 px (use scale steps). Align everything to the grid or to a shared left
  edge; unaligned by 1 to 3 px reads as a bug.
- Fixed-width centred content for reading and forms (about 640 to 960 px); do not stretch forms across a wide
  window.
- Labels either all above their controls or all in a left column of fixed width; never mixed on one screen.
- Align numbers right (or on the decimal), text left. Centre only short headings and empty states.
- Baseline rhythm: heights and gaps in multiples of 4 so rows line up.
- Responsive depth for HTML: single column below about 640 px, two or more columns above; tap targets at least 40 px;
  no horizontal scroll. More only when asked.
- Desktop windows: set a minimum size; let the content region grow and keep control sizes fixed; panels reflow rather
  than clip.

## Visual hierarchy

1. Decide the order: the primary action or key information, then supporting content, then chrome.
2. Make the order visible with size, weight, colour contrast, position (top-left first in LTR) and whitespace. Levels
   should differ by about 1.5x in size or a clear weight and contrast step.
3. One primary action per view, filled. Secondary: outlined or text. Tertiary: plain link. Destructive actions
   separated and styled differently.
4. Emphasis is a budget: one strong accent area per view. Bold, colour and motion everywhere cancel each other.
5. Squint test: blur or shrink the screenshot; the primary element should still stand out and the groups should still
   be visible.

## Settings and form pages

- Group by topic under headings; common options first; advanced options in a collapsed section.
- Each row: label, control, optional one-line help text in muted colour. Same row height and control column width.
- Related toggles sit together; a master toggle sits above the options it governs, which are indented or disabled
  when it is off.
- Save behaviour is obvious: settings applied live need no Save button; otherwise one primary Save, bottom right.
- Search or tabs once there are more than about 15 options.

## Gestalt laws, applied

- **Proximity**: the strongest grouping signal. Label 4 px from its field, field to next field 12 to 16, group to
  group 24 or more. If you need a divider line to separate things, the gaps are probably wrong.
- **Similarity**: same function, same colour, shape and size (all toggles alike, all section headers alike). A
  deviation says "different".
- **Common region**: put a group on a card or tinted panel when proximity is not enough or the group needs a title.
  Do not nest cards in cards; do not box every item.
- **Closure**: viewers complete incomplete shapes, so drop redundant borders, use open lists with spacing, and let
  a partly cut-off row suggest scrolling.
- **Continuity**: items on a line or curve read as related; align edges and keep one flow direction. Use it to lead
  the eye toward the primary action.
- **Figure/ground**: separate content from its background by contrast, elevation or a panel. Overlays and modals
  dim the background; the overlay must read as the figure.
- **Von Restorff (isolation)**: the item that differs gets remembered and noticed. Use it once, for the primary
  action or a critical warning.
- **Aesthetic-usability**: tidy alignment, consistent radius, even spacing and good contrast make users forgive small
  flaws and judge the app easier to use. Polish after the structure is right, never instead of it.

## Game GUIs (Minecraft)

- Draw a panel (tooltip or inventory style) with a clear title row, then content in a grid of vanilla-size widgets:
  buttons 200x20 (or 150x20, 98x20 in two-column layouts), icon buttons 20x20, slots 18x18, 4 px gaps, 24 px row
  pitch.
- Centre the panel horizontally; keep panel size in GUI pixels so it works at every GUI scale; check it fits within
  the scaled screen (at scale 2 on 1080p: 960x540; at scale 3: 640x360) and anchor to edges for HUD elements.
- HUD panels: small, high-contrast, semi-opaque dark background, text with shadow, tucked to a corner, never over
  the crosshair or hotbar.
- Settings screens: scrollable list of rows with vanilla-style widgets, section headers, and Done at the bottom
  centre.
- Group with spacing first, then a header band, then a sub-panel; do not rely on thin borders alone at scale 1 where a
  1 px line may vanish.
- Feedback: widgets show a hover highlight and a distinct disabled look; tooltips explain what a control does.
- Verify by taking the screenshot at the test resolution (1920x1080, GUI scale 2) and looking at it.
