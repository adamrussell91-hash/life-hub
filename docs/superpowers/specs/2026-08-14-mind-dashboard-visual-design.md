# Mind Dashboard — Visual Design Refresh

**Date:** 2026-08-14
**Status:** Approved and implemented
**Slice:** Visual/chart layer only — `render-mind.js`, `css/app.css` (Mind section), `chart-kit/*`
**Depends on:** `js/app/mind-model.js` (`buildMindModel`) — unchanged, no new fields
**Parent references:** `docs/superpowers/specs/2026-08-13-mind-dashboard-design.md` (data model origin), Clinical Glass token system (`css/app.css` `:root`), existing `chart-kit/` primitives
**Not this slice:** New data sources, new Notion fields, new record types, backend/sync changes, the diary/session logging UI itself

## Why this exists

The Mind tab's data model (`buildMindModel`) is already rich — mood score trend, five-way mood distribution, energy level, recurring themes, Vera session log (with **mood-at-open and mood-at-close, currently computed but never rendered**), governance insights, cross-agent coordination lines, and a silence/gap flag. The current render (`render-mind.js`) turns almost all of it into the same shape: one flat-red area/line chart plus three identical grey bar-column charts, all sharing a single hardcoded colour (`#C85A64`) that lives nowhere near the Clinical Glass token system. The silence flag is a text sentence instead of something you can see at a glance.

This doc redesigns the visual layer only — same data, same `buildMindModel` output, no new API/data work — using the chart primitives that already exist elsewhere in Life Hub (`chart-kit/area-line.js`, `pie.js`, `ring.js`, the skincare/fitness heatmap pattern), generalised rather than duplicated.

## Layout

Follows the existing `.dashboard` / `.hero-grid` / `.support-grid` grid pattern already used on Body and Fitness, rather than inventing new grid classes.

1. **Header row** (unchanged): range control (`weekly` / `monthly` / `six_month`), entry count caption, ambient status line.
2. **Hero row** (`.hero-grid`, 1.35fr / 1fr / 1fr): Mood Arc (wide) · Mood Mix donut · Energy Rings.
3. **Cadence row** (`.support-grid`, 1.2fr / 1fr): Diary & Session Heatmap (wide) · Theme Constellation.
4. **Silence banner** — full width, only rendered `if model.silence` (unchanged condition, restyled).
5. **Detail row** (`.support-grid`): Session log (with new mood-shift sparkline per card) · Insight timeline.
6. **Footer strip** (full width, compact): Cross-agent coordination lines (unchanged structurally, restyled).

Empty state (`model.empty`) keeps its existing `#mind-empty` banner, shown in place of the hero/cadence rows.

## Chart design

### 1. Mood Arc (replaces the flat mood line chart)

Still built from `buildAreaLine(moodSeries)` — no data change. Three additions, all layered into the existing `#mind-mood-chart` SVG:

- **Gradient stroke** instead of flat `#C85A64`: an SVG `linearGradient` from `--wave` (top, high mood) through a muted mid-tone to the existing rose `#C85A64` (bottom, low mood). This is decorative reinforcement of the y-axis, not the sole signal — mood_score and axis position still carry the meaning, per Clinical Glass's colour-independence rule.
- **Per-point mood dots**: small circles at each `moodSeries` point, filled from a new 5-step mood token ramp (`--mood-great` → `--mood-bad`, see Colour section) keyed off that entry's categorical `mood`. This ties the continuous `mood_score` line to the categorical `mood` field — both already in the same diary entry, nothing fabricated.
- **Energy backdrop band**: a thin tinted strip along the bottom of the chart, one segment per day, coloured by that day's `energy` level at 3 opacities of `--wave` (reusing the same "band behind a line" technique the Bloods spec already established for reference ranges). Optional — can ship without it if it reads as noisy; flagged as the one item worth a quick visual check before committing.

Animation: keep `animateAreaReveal`'s existing line-draw (900ms `cubic-bezier(.2,.8,.2,1)`, respects `prefers-reduced-motion`). Add a short staggered fade-in on the mood dots (~25ms per point, capped at ~400ms total), same family as the existing `fitness-card-in` stagger.

### 2. Mood Mix donut (replaces `#mind-mood-columns` bar chart)

New `buildDistributionPie(items)` in `chart-kit/pie.js` — a generalisation of the existing `buildMealProteinPie` (same `polar`/`slicePath` geometry, just decoupled from meal-specific naming/colours). Takes `model.byMood` directly (already `{key,label,value}[]`, exactly the shape `buildColumns` uses today). Five slices in `MOOD_ORDER`, coloured by the same mood ramp as the Mood Arc dots, so the two charts read as one system. Centre label shows the dominant mood + entry count, matching the existing `.metric-value` centre-label convention used on nutrition rings.

Animation: per-slice scale+opacity entrance, staggered, ~420ms `cubic-bezier(.2,.8,.2,1)` — same duration family as `fitness-region-card`.

### 3. Energy Rings (replaces `#mind-energy-columns` bar chart)

Three small rings side by side, built with the existing `buildRingTarget`/`applyRingTarget` (unchanged API) — `target` = `entryCount`, `value` = each `energyByLevel` count, so each ring's fill fraction is that level's share of logged days. New tokens: `--ring-mind-high` (Wave — energy is a positive/active signal), `--ring-mind-medium` (Shallow/Orca-derived neutral), `--ring-mind-low` (a muted amber derived from High Sea at low opacity, since it's worth quiet attention but isn't a warning). Mirrors the existing `--ring-energy`/`--ring-protein`/`--ring-fat` pattern on the nutrition tab exactly.

Animation: existing `animateRingFill`, 700ms `cubic-bezier(.2,.8,.2,1)`, unchanged.

### 4. Diary & Session Cadence Heatmap (new — fills a real gap)

The `silence` flag currently renders as one sentence ("7 days since diary · 7 days since a Vera session"). This makes the underlying pattern visible instead of just stated. Two-row calendar heatmap over the selected range, reusing the existing `.heatmap-grid` / `.heatmap-tile[data-hit]` CSS pattern verbatim (already used on Skincare and Fitness — no new geometry needed):

- Row 1 "Diary": one tile per day in range, lit (`data-hit="true"`) if a `diaryEntries` date falls on it — tinted `--wave`.
- Row 2 "Vera": one tile per day, lit if a `sessionEntries` date falls on it — tinted the Vera agent colour (see Colour section).
- Today's tile gets the existing ring highlight (`[data-today="true"]`), same treatment as the Skincare heatmap.

Both rows share tile sizing/gap tokens already defined (`--space-tile`). This is the single highest-value addition in this redesign: it turns the silence flag from something you read into something you see.

Animation: reuse the existing `.skincare-heatmap .heatmap-tile { transition: background 220ms ease, box-shadow 220ms ease }` — no bespoke timing.

### 5. Theme Constellation (replaces `#mind-theme-columns` bar chart)

`model.themes` (already `{key,label,value}[]`, top 8) rendered as a wrapped row of chips/pills — not a literal spatial word-cloud (Clinical Glass's design governance explicitly discourages decorative effects without comprehension value, and randomly-placed word clouds hurt scanability). Chip font-size and background opacity both scale off `value` via a simple linear map against the max in the set, using the existing chip/pill radius token. Colour: neutral `--marine` text on `--glass`, no new hue — themes are metadata, not a status signal, so they shouldn't compete visually with the mood ramp.

Animation: staggered opacity/scale-in, same family as the donut slices, capped at ~6 items animating individually before falling back to a single group fade for the rest.

### 6. Session cards + mood-shift sparkline (extends `#mind-sessions`)

Each `mind_session` entry already carries `moodAtOpen` and `moodAtClose` — computed by the model, never rendered today. Add a small two-point line to each `.mind-session-card`, built via `buildAreaLine` with a 2-point series (no area fill, line only), where the y-value is `MOOD_ORDER.indexOf(mood)` for open/close (categorical → rank, since these are mood labels, not the numeric `mood_score`). Colour: `--wave` if mood improved during the session, the existing rose (`#C85A64`) if it declined, `--muted` if flat — three-state, all still paired with the existing text (no colour-only signal, consistent with Clinical Glass's status rules).

Animation: `animateAreaReveal`'s line-draw, same as the Mood Arc, just on a 2-point line.

### 7. Insight Timeline (replaces the flat `#mind-insights` list)

Governance "Mind Insight" entries (`dateKey`, `entryType`, `title`, `status`, `body`) get a left-hand vertical rail — thin `--line`-coloured connector with a dot per entry — instead of a stack of plain paragraphs. Matches the existing Clinical Glass timeline principle already applied on Teaching Hub's scope-and-sequence view: clear chronology, strong labels, limited colour, current position marked distinctly. Most recent entry gets a filled `--wave` dot (current-state colour, per the locked Clinical Glass rule that Wave — not High Sea — marks "current"); older entries get hollow outline dots.

Animation: staggered dot/line reveal, ~40ms per item, same family as `fitness-region-card`.

### 8. Cross-agent strip (unchanged structurally)

Already colour-codes by agent via hardcoded hex in CSS (`#263450` Vera, `#8F373E` Penelope). Minor cleanup: wire these through the existing `agentColour()` helper (`js/app/agent-colour.js`) instead of hardcoding, so the colour has one source of truth shared with the chat UI's `--agent-accent` pattern. Also worth reconciling: `mind-agent-button--vera` currently uses `#37598A` while `mind-session-card`'s Vera border uses `#263450` — same agent, two different blues. Recommend standardising on whichever `agentColour('vera')` actually resolves to.

## Colour system

Everything below extends the existing Clinical Glass tokens (`--depth`, `--marine`, `--wave`, `--high-sea`, `--warm-white`, `--glass`) — nothing replaces them. New tokens, all derived via `color-mix()` from existing ones so they stay in the same family rather than introducing an unrelated palette:

```css
/* Mood ramp — great (cool/positive) → bad (warm/rose), used by Mood Arc dots + Mood Mix donut */
--mood-great: var(--wave);
--mood-good: color-mix(in srgb, var(--wave) 55%, var(--shallow));
--mood-neutral: var(--orca);
--mood-low: color-mix(in srgb, #C85A64 55%, var(--shallow));
--mood-bad: #C85A64; /* existing colour, formalised as a token */

/* Energy rings */
--ring-mind-high: var(--wave);
--ring-mind-medium: var(--orca);
--ring-mind-low: color-mix(in srgb, var(--high-sea) 45%, var(--warm-white));

/* Cadence heatmap rows */
--heatmap-diary-hit: var(--wave);
--heatmap-vera-hit: var(--depth); /* pending reconciliation with agentColour('vera') above */
```

Semantic guardrail carried over from Clinical Glass: High Sea stays reserved for decisive action/attention (unchanged) — it is only used here at low opacity as the base for `--ring-mind-low`, not as a "bad mood" colour, to avoid diluting its meaning elsewhere in the app.

## Motion

No new animation infrastructure — every chart above reuses one of the three existing `chart-kit/animate.js` primitives (`animateAreaReveal`, `animateRingFill`, `animateColumnGrow`-style scale/opacity) or the existing CSS transition on `.heatmap-tile`. All respect `prefers-reduced-motion` exactly as the current primitives already do (checked once via `prefersReducedMotion()`, not per-component). Per the project's standing "quiet interface" rule: no continuous or looping animation anywhere in this redesign — entrances only, on tab load or range change, nothing idle.

## File map (expected)

| Path | Change |
|------|--------|
| `js/app/chart-kit/pie.js` | Add `buildDistributionPie()` generalised from `buildMealProteinPie()` |
| `js/app/chart-kit/heatmap.js` | New — small shared helper for building a date-range tile grid (currently duplicated inline per tab) |
| `js/app/render-mind.js` | Replace bar-column calls with donut/rings/heatmap/timeline renders; add session mood-shift sparkline |
| `js/app/mind-model.js` | No changes — confirms this is visual-only |
| `css/app.css` | New mood/ring/heatmap tokens; replace `#mind-*-columns` styling with donut/ring/heatmap/timeline/chip styles |
| `index.html` | Swap `#mind-mood-columns` / `#mind-theme-columns` / `#mind-energy-columns` markup for donut/chip/ring hosts; add heatmap + timeline containers |

## Testing (acceptance)

1. `buildDistributionPie` unit tests: empty input, single-category input, five-way split sums to full circle.
2. Heatmap helper: correct tile count for each range (7/30/182 days), correct hit/miss per date, today marker on the right tile.
3. Mood-shift sparkline: rank mapping via `MOOD_ORDER.indexOf` for all five mood values, direction colour matches improved/declined/flat.
4. Visual smoke: all five hero/cadence charts render with zero entries (empty state), one entry, and a full range without throwing.
5. `prefers-reduced-motion`: every new animated element resolves to its final state with no transition when reduced motion is set (extend existing reduced-motion test coverage rather than duplicating it).
6. No `mind-model.js` diff — confirms the data contract didn't move.
