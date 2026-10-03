---
name: ui-foundations
description: Design or restyle a UI screen from sound fundamentals - colour system (tonal scales, semantic roles, contrast, dark mode), type scale and readable measure, spacing scale, layout grid and alignment, visual hierarchy and the gestalt laws. Use when the user says "design a screen", "make the settings page look better", "pick colours", "build a palette", "restyle this window", "make a dark theme", "lay out this GUI", or is building a new JavaFX/Electron window, Minecraft mod GUI or HTML page and needs it to look right. For reviewing an existing screen and ranking its flaws use ui-critique.
---

# UI foundations

Rules for designing and restyling screens. Decide the system first (colour, type, spacing), then lay out, then check.
Details are in `references/`; read only the file you need.

- `references/colour.md`: tonal scales, semantic roles, contrast, dark mode.
- `references/type-and-spacing.md`: type scale, measure, spacing scale, density.
- `references/layout-and-gestalt.md`: grid, alignment, hierarchy, gestalt laws, game GUI layout.

## When to use

New screen, restyle, "looks off" polish, palette or theme choice, dark mode. For a critique of a rendered screen,
use `ui-critique`. Charts and data viz belong to the `dataviz` skill.

## Workflow

1. **Find the existing system.** Read the app's theme: CSS variables, JavaFX stylesheet, constants, other screens. Reuse
   its tokens. Only define new ones when none exist, and keep them in one place (a theme file), not inline.
2. **State the screen's job** in one line: the one task the user does here and its primary action.
3. **Choose the system** if missing: neutrals plus one accent (`colour.md`), a four or five step type scale and a
   spacing scale on a 4 px base (`type-and-spacing.md`).
4. **Lay out**: group related items, set the hierarchy, align to a grid (`layout-and-gestalt.md`).
5. **Check**: contrast ratios measured, every state present (hover, focus, disabled, empty, error), long text and
   small window sizes, and, for a game GUI, the real GUI scale.
6. **Look at it.** Take a screenshot of the result (see `ui-critique` for capturing without stealing focus) and send
   it with SendUserFile. When restyling an existing screen, take a before shot first and send both.

## Essential rules

**Colour**
- Neutrals do most of the work; one accent for the primary action and selection; status colours (success, warning,
  error, info) only for status.
- Build each hue as a tonal scale (about 50 to 950), then name roles (surface, text, border, accent), not hex values,
  in the UI code.
- Body text 4.5:1 against its background, large text and UI parts 3:1. Never use colour alone for meaning.
- Dark mode: lighter surfaces for higher elevation, off-white text, desaturated accents. Do not just invert.

**Type**
- One family for UI, optionally one mono. Four or five sizes from a ratio (1.2 to 1.333). Two weights.
- Body at least 14 px on desktop, 16 px for HTML reading text. Line height 1.4 to 1.6 body, 1.1 to 1.3 headings.
- Body line length 45 to 75 characters: set `max-width` (about `65ch`).

**Spacing**
- 4 px base: 4, 8, 12, 16, 24, 32, 48. No values off the scale.
- Space between groups clearly larger than space inside a group.

**Layout**
- Align to shared edges. Same-role items share size and gap. Pick a fixed content width or a grid and keep to it.
- One primary action per view, filled; secondary actions outlined or text. Primary sits bottom right of forms and
  dialogs.
- Group settings by topic with headings, common options first, advanced options folded away.

**Hierarchy**
- One dominant element. Rank the rest by size, weight, contrast and position. Strong emphasis is rare, or it stops
  working.

**Gestalt, applied**
- Proximity: put related things close and unrelated things apart; it is the cheapest grouping tool.
- Similarity: same function, same look; different function, different look.
- Common region: a panel or tint groups items; do not draw a box around everything.
- Closure: do not draw complete borders where alignment and spacing already group items.
- Continuity: shared edges and baselines carry the eye down a column.
- Figure/ground: content must stand clear of its background (contrast, elevation, a panel).
- Von Restorff: the one different item gets noticed; use it for the primary action only.
- Aesthetic-usability: polish (alignment, consistent radius, even spacing) makes a UI feel easier to use; do it last,
  after structure.

## Surfaces

**Desktop windows (JavaFX, Electron):** a minimum window size that still lays out cleanly; panels that grow without
breaking alignment; real focus rings; keyboard order that matches the visual order; settings applied live. Keep
the platform's own title bar and basic controls unless the app already restyles them.

**Minecraft GUIs:** see "Game GUIs" in `references/layout-and-gestalt.md`. Short version: the pixel font is fixed,
build hierarchy with colour, panels and spacing, design in GUI pixels at scale 1 and check at scale 2 (the 1920x1080
test setup), use vanilla widget sizes and gaps, keep panels in the tooltip or inventory style of the surrounding game.

**HTML pages and artifacts:** colours as CSS custom properties on `:root`, dark variant under
`prefers-color-scheme`; a spacing scale as variables; `max-width` on text; a few lines for narrow screens: one
column below about 640 px, tap targets at least 40 px, no horizontal scroll. Do not build a full breakpoint system
unless asked.

## Do not

- Add options, features or screens that were not asked for. Mention an idea in one line instead.
- Introduce a new font, icon set or dependency without asking.
- Redesign parts of the screen the user did not mention.
- Hardcode a colour or size inline when a token exists.

Adapted from designer-skills by MC Dean (github.com/Owl-Listener/designer-skills, MIT). See `LICENSE-THIRD-PARTY.md`.
