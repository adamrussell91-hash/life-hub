# Bloods dashboard visual restyle

**Date:** 2026-08-16  
**Status:** Implemented in the hub; chart rules copied into the Life Hub Design overview (Charts).  
**Does not replace:** `2026-08-13-bloods-dashboard-design.md` (data model, import, hidden Body subpage). This spec is the **read surface** only. Chart language for the whole app: `2026-07-31-life-hub-design.md` → Charts.  
**Approach:** Restyle in place. Keep the category stack and two-column marker grid. Do not introduce masonry.

## Goal

Make Bloods look like Life Hub Clinical Glass instead of a maroon lab dump. Every marker is on the page with a plain-language line, labelled reference limits, and an honest chart (ghost + arrow on the range track, or a line with dots in the sage band).

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Whole Bloods page, not a flags-only or bugs-only pass |
| Layout | Clinical stack: summary row → toolbar → category cards → 2-col marker tiles |
| Completeness | **Every marker in every category renders.** Categories **start expanded**. Collapse remains optional. Filter is the only hide |
| Colour | Kit semantics: `--success` in range, `--danger` High, `--high-sea-ink` Low. Chrome is marine / Wave like Body. No `--bloods-pulse` maroon theme. “Normal” is never maroon |
| Sparse chart | Range track: sage in-range segment, shore overflow, solid latest dot, ghost previous, Wave arrow for direction |
| Series chart | Body-style line in a sage reference band, **a marker (dot) on every point**. Latest out-of-range dot uses danger / High Sea |
| Meaning on tile | One-line “what this is” on **every** numeric tile, plus ref numbers, previous value, date |
| Language | Never “stool”. Never “faecal” / “fecal”. Gut / mucosal / Crohn’s as appropriate |
| Implementation | CSS + targeted `render-bloods.js` / `bloods-charts.js` / explainer copy. No new layout packer |

## Out of scope

- New data import or Notion mapping (unless a field is already on the record and simply not drawn)
- Masonry / Mind board packing
- Agent write / chat logging of new panels
- Changing Body scale / composition / tape
- Adding Bloods to the rail

## Page chrome

When `showSection('body-bloods')` is active, the page header is **Labs / Bloods**, not Scale, composition, tape.

- Back control: kit `.btn` ghost, Wave/marine text, min-height 44px. Not maroon underlined text.
- Range pills: same `.body-range` as Body; **active fill is `--wave`**, white type.
- Appointment summary link stays, muted, not a second primary.

### Summary card (one card, not three)

**One** card, one tile tall, that never grows with content — anything list-shaped goes below it. No ring: a circular gauge boxed in a rectangle is not the language here, and the collection date does not earn a card of its own.

- Header row: label `Markers in range` on the left, quiet `Collected DD/MM/YY · lab` caption on the right. Stale (>90 days) is a second caption in `--high-sea-ink`.
- Value: `N` in `--text-2xl` with `of M in range` beside it.
- **Horizontal bar** (~8px, pill radius, `--shore` remainder) split into three proportional segments: in range `--success`, High `--danger`, Low `--high-sea`.
- Legend under the bar: dot + `N in range` / `N high` / `N low`. Nothing flagged reads “Everything in range”.

### Flag strip (full width, under the summary card)

One chip per currently High/Low marker, wrapping across the **full page width** so a long flag list is two or three rows, not a tall third-width column. Chips keep the centred pill styling below. Empty state is a single quiet caption line; the strip collapses when there is nothing to say.

Toolbar: Expand all / Collapse all / filter use `.btn` and a labelled search field (not unstyled native buttons). Default visual state matches **expanded**.

## Flag chips (must fix)

Today `.bloods-flag` reuses `.body-tape-chip` with `align-items: baseline` and tight padding, so **label + value sit off-centre in the pill**.

**Required:**

- Flag chips are `inline-flex; align-items: center; justify-content: center;`
- Vertical and horizontal centring of the full string (name, value, High/Low)
- Even padding (`--space-1` / `--space-2` on the 4px grid), `min-height` at least 32px, `border-radius: var(--radius-full)`
- Type: `--text-xs` or `--text-sm`, `--weight-semibold`, no baseline-aligned child mismatch
- High: `--danger` on `--danger-surface`. Low: `--high-sea-ink` on `--warning-surface`
- Do not use `--high-sea` orange as chip text (contrast). Do not invent new chip hex
- Chip text must not clip or sit optically high/low relative to the capsule

If Body tape chips must keep baseline alignment, **do not share that rule** with Bloods flags — override on `.bloods-flag` or give flags their own class.

## Marker tile

Every numeric marker tile, in order:

1. Name (marine, semibold). `i` still opens the explainer sheet (no native `title` URLs).
2. **One-line what** — from `explainerFor(key).what`, one sentence, always visible.
3. Latest value + unit (tabular nums).
4. Status pill: “In range” / “High” / “Low” / “First reading” using kit semantic colours (sage / danger / High Sea ink / muted). Prefer “In range” over maroon “Normal”.
5. Chart (range track or line — see below).
6. Meta row: labelled refs (`In range <50` or `Band 0–20`), previous (`Was 242 · Oct 2025`) when a prior numeric exists, collection date.

Qualitative markers: status line + one-liner, no chart.

Wide/combined charts (iron, liver enzymes) stay as they are structurally; restyle strokes to Wave/kit, not maroon.

## Charts

### Range track (sparse / `chartKind === 'range-bar'`)

Replace the fat black bar.

- Full track: `--shore`, height ~8px, full pill radius
- In-range segment: `--pastel-sage` between `ref_low` and `ref_high` (open-ended high or low still labelled)
- **Latest:** solid dot, `--success` if in range, `--danger` / `--high-sea-ink` if High/Low
- **Previous:** ghost dot (`marine` at ~20% opacity), same scale
- **Arrow:** Wave, between ghost and latest, direction of travel on the track
- If only one point: no ghost, no arrow
- Overflow High/Low: dot sits at/ beyond the sage end; do not clamp so hard that High looks in-range

### Geometry (must match the stylesheet)

The SVG `viewBox` and the CSS `aspect-ratio` must describe the same box. When they disagree, `preserveAspectRatio="xMidYMid meet"` draws the chart at 1:1 inside a wider box and centres it, so the line and the sage band float in the middle of the tile with dead space either side. Line and zoned charts are `320 × 120`; the range track is `320 × 56`. Anything hard-coded off the old 168 height is a bug.

### Line + band (two or more points)

- Sage rectangle = current reference band, spanning the **full plot width** and clamped to the plot box so it never bleeds past the axis
- A reference limit joins the y-scale **only when it sits near the readings** (`nearbyRefs`). Vitamin D’s upper limit of 150 against readings in the 40s would otherwise flatten the line into a straight edge; the band simply runs off the top instead
- Line stroke `--wave` when in range; last point (and status-coloured line if the latest is flagged) uses semantic status
- **Dot on every vertex** (not only endpoints). Latest slightly larger
- No empty 168px hole with a 12px black slab

Glucose zoned charts keep zones; restyle zone fills to kit pastels, not maroon.

## Explainers and language

`explainerFor` must not leave clinical markers on the generic fallback (“a laboratory marker from your bloods history”).

**Required new/filled copy** (at least): calprotectin, and any other keys that currently hit `FALLBACK` in live data. Calprotectin: protein from gut white cells; raised means mucosal inflammation; Crohn’s signal even when CRP is calm. **Forbidden words:** stool, faecal, fecal.

The explainer sheet (tap `i`) keeps what / why / high / low + disclaimer. Never put a NotebookLM or other URL in `title`, `aria-label`, or visible tooltip text.

## Tokens

Delete Bloods-only `--bloods-pulse`, `--bloods-normal` maroon, and hex copies of them. Map:

| Old | New |
|---|---|
| Maroon links / active range | `--wave` / `--marine` |
| Normal status | `--success` / `--success-surface` |
| High | `--danger` / `--danger-surface` |
| Low | `--high-sea-ink` / `--warning-surface` |
| In-range ring | `--success` |
| Ref band | `--pastel-sage` |
| Track remainder | `--shore` |

Nearest kit token only. Domain CSS stays in `css/app.css`.

## Files (expected)

- `css/app.css` — Bloods theme, flag chip centring, tile caption, range-bar, status pills, toolbar
- `js/app/render-bloods.js` — header already via controller; tile caption, ref/previous meta; default expanded
- `js/app/app-controller.js` — confirm `body-bloods` eyebrow/title Labs / Bloods
- `js/app/bloods-model.js` — `collapsed: false` (or equivalent) so categories start open
- `js/app/bloods-charts.js` / `bloods-charts-layout.js` — ghost, arrow, dots, range-bar geometry
- `js/app/bloods-explainers.js` — calprotectin + FALLBACK gaps; language ban
- Tests: `tests/unit/render-bloods.test.js`, `bloods-charts.test.js`, `bloods-explainers.test.js`, `bloods-model.test.js` (default expanded)

## Testing notes

- Flag chip styles: assert `.bloods-flag` (or successor) uses centred flex, not baseline, in the stylesheet or via a small DOM test if you already query computed classes
- Calprotectin explainer does not match `/stool|faecal|fecal/i`
- Range-bar with two values exposes previous + latest positions and overflow flag
- Line chart with ≥2 points includes one circle per point
- Model: categories not collapsed by default
- Existing bloods unit tests stay green; update snapshots/DOM class names as needed

## Success

Adam can open Bloods and see the full marker set, read what Calprotectin is without a mystery `i`, see flags as centred pills, and read High vs in-range without maroon “Normal”.
