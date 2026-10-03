# Critique dimensions

Seven checklists. For each, note what you see, what breaks and why, then the fix. Report only problems. Quick mode
uses sections 1, 5 and 6 only.

## 1. Visual hierarchy

- Entry point: what does the eye hit first? Is it the most important thing for this screen's task? One dominant
  element, not scattered attention.
- Eye flow: is the reading path deliberate (F-pattern for lists and forms, Z for landing-style layouts), ending at the
  primary action? No dead ends or jumps.
- Weight: levels differ clearly (size step of about 1.5x between levels, or clear weight/colour contrast). Bold is
  used sparingly so it still signals. Backgrounds, strokes and icons support the hierarchy rather than fight it.
- Emphasis: exactly one primary emphasis zone. Colour, contrast and motion not overused so they cancel out.
- Failures: multiple competing primaries; everything the same size and weight; decoration louder than function; the
  main action quieter than its surroundings.

## 2. Composition, whitespace, gestalt grouping

- Balance: weight spread sensibly; no unintended top-heavy or one-sided layout; a clear centre of gravity.
- Whitespace: macro gaps between sections, micro gaps between label and control; consistent, from one spacing scale;
  not fragmenting the layout, not cramped in one area and empty in another.
- Rhythm: repeated items (rows, cards, buttons) share size and gap. Padding values come from a scale (4/8/12/16),
  not 15, 17, 22.
- Proximity: related things closer than unrelated things. Check that the gap between groups is clearly larger than
  the gap inside a group.
- Similarity: same function, same look. Different function, different look.
- Common region: a box, panel or background tint groups items; borders not multiplying without purpose.
- Figure/ground: content clearly separates from its background.
- Continuity: shared left edges and baselines lead the eye; misaligned edges by 1-3 px are visible defects.
- Failures: orphan elements floating away from their group; stacked dividers; equal two-column layout with no
  primary side.

## 3. Typography

- Scale: only defined steps used (caption, body, subheading, heading). No stray sizes nudged by 1-2 px. Adjacent
  levels differ visibly (about 1.25x or more).
- Readability: body at least 14 px on desktop (16 px for HTML reading text); line height about 1.4-1.6 for body,
  1.1-1.3 for headings; body line length 45-75 characters; no cramped or over-tracked text.
- Consistency: same role, same style (all section titles, all field labels). Alignment chosen, not mixed. At most
  two weights in regular use; over-bold dilutes contrast.
- Tokens: sizes and fonts come from theme variables or constants, not literals scattered around.
- Minecraft: the pixel font is the font; do not mix in other fonts. Size is fixed (9 px line height at GUI scale 1),
  so build hierarchy with colour, shadow, spacing and panels instead of size. Check that text fits its widget at
  GUI scale 2 and 3 without clipping.

## 4. Colour and contrast

Measure; do not guess. Contrast ratio = (L1 + 0.05) / (L2 + 0.05) from relative luminance, or use a checker script.

- Text: body 4.5:1 minimum, large text (18 px+, or 14 px+ bold) 3:1.
- UI parts (button edges, input borders, focus rings, icons that carry meaning): 3:1 against neighbours.
- Placeholder, disabled and secondary text: low contrast is fine only when the information is not needed to act.
- Palette coherence: a small set of defined colours; neutrals, accent and status colours each used for their role;
  no vibrating pairs (saturated red on blue); warm/cool register fits the app.
- Semantic use: red, green, amber used consistently for error, success, warning. Colour is never the only signal:
  add an icon, label or shape. Interactive colour differs from decorative colour.
- Colour-blind check: red/green pairs without another cue are a defect.
- Dark themes: off-white text rather than pure white, desaturated accents, surfaces separated by lightness steps.
- Failures: link colour under 4.5:1 once the underline is gone; error shown in red only; 40% opacity placeholders;
  one-off hex values outside the theme.

## 5. Affordance, clickability, state visibility

- Clickability: buttons, links and controls look different from static content (fill, border, underline, elevation).
  Flag false affordances (looks clickable, is not) and missing ones (clickable, looks flat).
- Target size: comfortable to hit with a mouse; at least 24 px high on desktop, larger for frequent actions. Minecraft:
  vanilla buttons are 20 px high, icon buttons 20x20.
- States: default, hover, pressed, focus, disabled and selected are each distinct. Focus is visible and high contrast
  (no `outline: none` with no replacement). Disabled is clear without relying on colour alone. Loading and empty
  states exist where content arrives late.
- Primary action: one dominant button per view, filled; secondary actions are outlined or text. Labels are specific
  ("Save changes", not "OK"). Placed where users expect it (bottom right of dialogs and forms).
- Discoverability: key actions are visible, not only on hover; destructive actions look different from constructive
  ones and are separated from them; empty states say what to do next.
- Failures: ghost buttons whose border vanishes on the background; two filled primaries; edit/delete hidden until
  hover; toggles with no visible on/off state.

## 6. Information density and cognitive load

- Load: how many decisions or items must the user take in to finish the task? Elements that do not serve this task
  (decoration, metadata, rarely used options) are clutter.
- Priority: the information needed to act is the most visible; supporting detail is visually quieter. Equal weight for
  unequal importance is a defect. Critical info is not buried in tooltips, collapsed groups or faint text.
- Scanning: labels aligned and consistent, numbers and dates aligned and formatted the same, content chunked with
  headings and short groups rather than dense blocks.
- Progressive disclosure: advanced and edge-case options are tucked behind sections, tabs or an "Advanced" group, but
  primary actions are never hidden.
- Settings pages: group by topic, put the common options first, give each group a heading, avoid a flat list of 20+
  controls.
- Failures: every metric shown instead of the actionable ones; tables with 10 columns where 3 matter; long forms with
  no grouping; explanation front-loaded before the user can do anything.

## 7. Consistency with the app's existing style

Compare against the app's other screens and its theme tokens (CSS variables, JavaFX stylesheet, constants file,
vanilla widget look in a Minecraft mod). If there is nothing to compare, skip this dimension.

- Colour, spacing, radius, border, shadow and type values match the theme tokens. List each off-token value with the
  token it should use.
- Same component, same look across screens: buttons, toggles, inputs, headers, dialogs, icons (one icon set and
  stroke weight).
- Copy: label capitalisation, wording of actions and error messages match the rest of the app.
- Minecraft: widgets match vanilla size, spacing (20 px buttons, 4 px gaps) and texture style unless the mod
  deliberately has its own look that is already used elsewhere.
- Failures: hardcoded values drifting from tokens; a new screen with its own radius or button style; mixed
  capitalisation.
