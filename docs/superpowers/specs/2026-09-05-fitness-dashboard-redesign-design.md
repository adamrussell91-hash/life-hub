# Fitness dashboard redesign — instructions for Cursor/Chadwick

Date: 2026-09-05
Scope: `apps/life` Fitness tab only. Out of scope: the planned/hero session workout card (`fitness-hero-card` / `renderHero` in `render-fitness.js`), and the templates rail (`renderTemplateRail`) — both already work, leave them alone.

## Why

Live review of `life-hub.adam-russell.com` → Fitness found four concrete problems, all reproducible in code on `origin/main`:

1. **Pies are off-palette.** `apps/life/js/app/fitness-charts-model.js` colours `REGION_COLOURS`, `REP_RANGES[].colour`, and the push/pull and rest/trained pies with `var(--navy-2)` and raw `var(--high-sea)`. It never imports `chart-kit/clinical-slots.js`. Rule being broken (per `packages/design-kit/AGENTS.md`): "Charts use `--high-sea-ink`, not `--high-sea`."
2. **One full-width area chart per lift.** `renderE1rm` in `apps/life/js/app/render-fitness-charts.js` stacks a whole `line-chart` SVG per entry in `charts.e1rmTrends`, with no cap. The 2+-point gate exists in the data layer (`fitness-charts-model.js`'s `seriesIfReady` / `buildE1rmTrends` filter `series.length >= 2`) but nothing gates the *layout* — gating data isn't gating screen space.
3. **Three flat, non-interactive lists.** `renderWorkingWeights` (`#fitness-loads`), `renderComparisons` (`#fitness-comparisons`, the "Vs last time" list), and `renderRecentSessions` (`#fitness-recent`) in `apps/life/js/app/render-fitness.js` all render plain rows with no tap target, no chevron, no expand/collapse. `renderWorkingWeights` and `renderComparisons` overlap heavily in content (both are "this lift, this weight, vs before").
4. **An unrounded float on screen.** `renderRunWidget` in `render-fitness.js` passes `Number(model.longTerm?.workoutsPerWeek) || 0` straight into the shared `createRunWidget` (`packages/design-kit/js/hub-surfaces.js`) with no formatting — this is what renders as `0.115538461538461539 / week` at the top of the page when the last session had no `distance_km`.

## What stays

- Hero/planned session card (`renderHero`, `fitness-hero-card`) — untouched.
- Templates rail (`renderTemplateRail`) — untouched, already interactive.
- The 3 progress rings (week / skip / recovery) — structurally unchanged. Keep `ring.js`/`applyRingTarget`.
- `chart-kit/` itself is not getting new files added for this pass beyond what's listed below — reuse `area-line.js`, `ring.js`, `pie.js`, `columns.js`'s bar-row visual language, and `clinical-slots.js`.

## What changes

### A. Fix the float bug (do this regardless of everything else below)

In `render-fitness.js`'s `renderRunWidget`, round `model.longTerm.workoutsPerWeek` before passing it to `createRunWidget` — one decimal place, e.g. `Math.round(value * 10) / 10`. Same treatment anywhere else a raw computed float reaches a template without `.toFixed()`.

### B. Route every fitness chart through the real palette

`fitness-charts-model.js`: replace `REGION_COLOURS`, `REP_RANGES[].colour`, and the push/pull + rest/trained colour literals with the ordered list from `chart-kit/clinical-slots.js` (`CLINICAL_CHART_SLOTS`: `--wave`, `--marine`, `--success`, `--danger`, `--high-sea-ink`, `--pastel-sage-ink`, `--pastel-peach-ink`, `--muted`). Import it; don't re-declare a parallel colour list. Never use raw `--high-sea` or `--navy-2` on a chart.

### C. Replace the "This week" stat block

Current block (`renderStatus` + `renderVolumeWeeks`, the `#fitness-volume-card` / week-story / month-story / pace-story text) is a wall of separately-worded sentences and `appendKvRow` pairs (Last 30 days, Avg session, Avg duration, Unique lifts, kg/set) plus the buggy header stat. Replace with a compact stat strip:

- Sessions this week vs target (reuse the existing week ring — don't duplicate the "1 / 4" as text elsewhere)
- Current streak · longest streak (numbers, one line)
- This week's kg vs last week's kg, as a single stat pair with a signed delta (`formatSignedKg`/`formatSignedPct` already exist — reuse them), not three separate sentences
- Drop "Avg session", "Avg duration", "Unique lifts", "kg/set", "Last 30 days" as standalone KV rows — they move into the new Strength / Session metrics cards below as proper trend rows, where they mean more with history attached than as a single static number.

### D. Strength card (new)

Replaces: `renderE1rm`'s stacked area charts, `renderRegions` (`#fitness-region-grid`, the Chest/Arms best-set-delta list), and `renderWorkingWeights` (`#fitness-loads`).

- One row per lift with 2+ dated e1RM bests (same `buildE1rmTrends` data, `series.length >= 2` gate unchanged): lift name, current e1RM, a compact inline sparkline (reuse `area-line.js`'s path math at a small fixed size, no axis labels at this size).
- Region-strength deltas (Chest −5kg, Arms +12kg, from the existing `regions`/`renderRegions` model) as a second row-group in the same card, same row shape (name, current best, sparkline of best-set-over-time).
- Tap a row → detail sheet with the full-size `area-line.js` chart (this is where the existing `fillAreaSvg`/`renderE1rm` chart-building code gets reused, just moved from "always on page" to "inside a sheet, on demand").
- `renderWorkingWeights`'s content (name, weight×reps, date) is redundant with this — do not build it as a separate list; if raw set history is still wanted, put it inside the same detail sheet below the chart.

### E. Volume & distribution card (new)

Replaces the 4 pies.

- Region volume, rep-range distribution: stay as donuts (`buildDistributionPie`), genuinely multi-category (4-5 slices). Recolour per section B.
- Push vs pull, trained vs rest: replace the 2-slice pies with a single labeled split-bar per metric (one horizontal bar, two segments, percentage labels each end). A 2-category pie is a weak shape — a split-bar reads faster and costs a third the vertical space. This is a new small helper, not an existing `chart-kit` file — keep it a plain SVG/CSS rect pair, no new dependency, colours from `clinical-slots.js`.

### F. Session metrics card (new)

Replaces: the 4 separate full-width area charts (`fitness-duration-card`, `fitness-distance-card`, `fitness-pace-card`, `fitness-hr-card`) and the efficiency bar block (`fitness-efficiency-card`, `buildColumns`).

- Same sparkline-row treatment as the Strength card: one row each for duration, distance, pace, avg HR, kg/set-per-week — whichever have enough gated data (`seriesIfReady` / the existing `volumePerSetWeeks.length >= 2` gate, unchanged).
- Tap a row → detail sheet with the existing full `buildAreaLine` chart for that metric (duration/distance/pace/hr already build this via `renderAreaCard`; kg/set already has data via `buildVolumePerSetWeeks`, just needs the same area-chart treatment instead of `buildColumns` bars, for row-shape consistency with the rest of this card).

### G. Recent sessions (redesigned) absorbs "Vs last time"

`renderRecentSessions` (`#fitness-recent`) becomes a tappable list: 3 rows shown + "See all", each row gets a real tap affordance (chevron, hover/active state — match whatever the hero card already uses). Tapping a session opens a detail sheet showing that session's full exercise list **and** its vs-previous-occurrence comparison per exercise — this is exactly what `renderComparisons` (`#fitness-comparisons`, "Vs last time") currently computes and shows as a standalone flat list; move that computation into the per-session detail sheet instead of rendering it separately on the main page. Delete the standalone `#fitness-comparisons` card once this lands.

### H. Interaction & motion, applied everywhere above

- Any newly-tappable row/card gets a visible affordance (chevron + hover/active state), consistent with the hero card's existing pattern — don't invent a new tap-affordance style.
- Chart entrance uses `chart-kit/animate.js` (`prefersReducedMotion`-aware), not static instant paint — same as it should already be doing elsewhere in `chart-kit`.
- Every card in B/D/E/F/G stays hidden when its underlying data is empty (existing `setHidden` pattern) — no empty-state chart on the page, ever.

## Chart type count, before vs after

**Before** (current `origin/main`): 4 distinct chart *families* on this page — ring (×3), pie (×4), area-line (×N e1RM lines, one per qualifying lift, currently 3+, plus ×4 metric lines = N+4 full-width charts), column-bar (×1, efficiency). Roughly 12–20+ separately-rendered full-size charts stacked on one page depending on how many lifts qualify that week.

**After**: same 4 chart families, restyled (ring, donut, area-line, plus a new split-bar for 2-category data — column-bar is retired in favour of area-line for kg/set, for row-shape consistency). But only 3 rings + 2 donuts + 2 split-bars render at full/compact size by default — everything else (every lift's e1RM, every session metric, every past session's comparisons) is a compact sparkline row that expands to a full chart only on tap. Zero full-width charts on screen until the user asks for one.
