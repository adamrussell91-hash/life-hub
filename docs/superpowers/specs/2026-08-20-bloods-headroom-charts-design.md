# Bloods headroom charts

**Date:** 2026-08-20  
**Status:** Approved for implementation.  
**Does not replace:** `2026-08-13-bloods-dashboard-design.md` (data model, import) or `2026-08-16-bloods-visual-restyle-design.md` (page chrome, tiles, meters). This spec is three category pictures only.

Source mockup: `~/Downloads/bloods-radial.html` (“Bloods, by how much room is left”).

## Goal

Show Full Blood Count, glucose, and lipids as relationship pictures instead of a grid of independent sparks. Every other category, and the FBC tiles under the radial, stay as they are.

## Locked decisions

| Topic | Choice |
|---|---|
| Scope | Three category swaps. Not a new Bloods page. |
| FBC | Headroom radial **plus** existing tiles (trend cards / dense rows) |
| Glucose/Diabetes | Picture only: fasting × HbA1c zone map. No per-marker tiles. Latest insulin as a caption |
| Lipid Studies | Picture only: nested rings with previous→current arrows. No per-marker tiles. No separate Total:HDL banner |
| Shared metric | **Allowance used** (0 = maximum headroom, 1 = touching a reference edge, >1 = out of range) |
| Colour | Kit tokens only. No mockup hex |
| Out of this pass | Phase plot, all-marker trajectories, notes grid, table view, page-level panel chips |

## Allowance used

One number that lets markers share an axis.

| Reference shape | Formula |
|---|---|
| Two-sided band (`ref_low` and `ref_high`) | `abs(2 × ((v − lo) / (hi − lo)) − 1)` — 0 at mid-band, 1 at either edge |
| Ceiling only (`ref_high`) | `v / hi` |
| Floor only (`ref_low`), including favourable-high markers such as HDL | `lo / v` |

Missing value or missing both limits → skip that marker. Lab limits win. Conventional adult ceilings are a fallback only when a lipid ring has no `ref_high`: triglycerides `<1.7`, non-HDL `<4.0`, TC:HDL `<4.5`, total cholesterol `<5.6`, LDL `<3.1`.

Tone from allowance used:

| Used | Tone | Token |
|---|---|---|
| `> 1` | out of range | `--danger` |
| `≥ 0.88` | at the ring | `--warning` / `--pastel-gold-ink` |
| `≥ 0.70` | leaning | `--high-sea` |
| else | comfortable | `--wave` |

## Full Blood Count — radial + tiles

Hero at the top of `Full Blood Count`.

- One spoke per numeric FBC marker that has an allowance. Alphabetical by label.
- Distance from centre = allowance used. A small inner dead zone so a 0% marker is still a visible dot. Values above 1 sit just outside the limit ring.
- Previous draw (second-last series point) is a ghost on the same spoke with a short tail.
- Outer ring is the reference limit. Quarter rings at 25 / 50 / 75%.
- Labels sit outside the ring, rotated along the spoke, with a halo so they stay readable on the card.
- Hover / focus: name, value + unit, reference text, % used, date.
- Tiles underneath stay on the 2026-08-16 rules (3+ points = trend card, 1–2 = dense row).
- Summary jump-strip stays; it still scrolls to a tile.

No panel sectors (this plot is FBC only). No phase plot. No spaghetti of every marker in the file.

## Glucose/Diabetes — zone map only

One 2D map. Axes: fasting glucose (mmol/L) × HbA1c (%).

Zones (same clinical cuts as the mockup / existing `glucoseZones('%')` on the HbA1c axis):

| Zone | Fasting | HbA1c |
|---|---|---|
| Normal | `< 5.5` | `< 5.7%` |
| At risk | `< 7.0` and not normal | `< 6.5%` and not normal |
| Diabetic | `≥ 7.0` **or** `≥ 6.5%` | (either axis) |

Prefer `hba1c` / `hba1c_ngsp` when the unit is `%`. Convert `hba1c_ifcc` (mmol/mol) with NGSP `= 0.09148 × IFCC + 2.152` so the map stays on one y-scale. Pair a fasting draw with HbA1c on the same date; if none, the nearest HbA1c within 14 days.

Each paired draw is a point. The path between them is straight. The last leg has an arrow. Latest point is filled; earlier points are hollow.

Do not render fasting / HbA1c / insulin tiles or the summary jump-strip in this category. Latest insulin (if present) is one caption under the map: `Insulin 7.7 mIU/L · 20/02/26`.

## Lipid Studies — rings only

Three nested rings, same meaning as the mockup:

1. **Outer — total cholesterol.** Arc sweep = value ÷ limit. Split the spent arc into HDL / LDL / other (`other = total − HDL − LDL`, floored at 0).
2. **Middle — non-HDL.** Lab `non_hdl` if present, else `total − HDL`.
3. **Inner — total : HDL.** Lab `tc_hdl_ratio` if present, else `total / HDL`.

Each ring also draws the **previous** allowance as a ghost arc and an **arrow** at the current tip: outward if allowance rose, inward if it fell. Flat = no arrow.

Centre figure is latest total cholesterol. A left-hand key lists each ring’s value, limit, and % spent. Segment colours: HDL `--success`, LDL `--high-sea`, other `--wave`.

No per-marker lipid tiles. No `.bloods-lipid-ratio` banner (the inner ring is that number). No summary jump-strip.

## Unchanged

Page chrome, in-range bar, flags, search, expand/collapse, appointment sheet, Iron / Liver combined strips, Biochemistry instruments, and every other category’s tiles.

Search still filters FBC **tiles**. The radial keeps the full FBC set so the picture does not lose spokes when a name is typed.

## Implementation

- Layout math in `js/app/bloods-charts-layout.js`: `allowanceUsed`, `buildFbcRadial`, `buildGlucoseMap`, `buildLipidRings`.
- SVG in `js/app/bloods-charts.js`. Never assign to SVG `className`.
- `render-bloods.js` branches on category id before the generic tile grid.
- CSS in `css/app.css` under `#body-bloods-dashboard`. ViewBox constants must match `aspect-ratio` (existing geometry test pattern). No hex.

## Tests

- `allowanceUsed` for range / ceiling / floor / missing limits / out of range.
- `buildFbcRadial` spoke count, previous ghost, skip qualitative.
- `buildGlucoseMap` pairing, IFCC conversion, insulin caption, empty when fasting or HbA1c is missing.
- `buildLipidRings` computed non-HDL and ratio, fallback limits, previous used, segment split.
- `renderBloods`: FBC has radial **and** tiles; Glucose has map and no tiles; Lipids has rings and no ratio chip / tiles.
- ViewBox / aspect-ratio for the three new chart classes.

## Out of scope

New import, Notion mapping, appointment-sheet rewrite, Mind-style packing, adding Bloods to the rail.
