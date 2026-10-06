# Nutrition charts redesign

**Date:** 2026-10-04
**Status:** Approved design (Adam, 04/10/26). Not built.
**Mockup:** [`docs/mockups/nutrition-charts-2026-10-04.html`](../../mockups/nutrition-charts-2026-10-04.html). Open it and press ↻ Replay to see the motion. It is the visual target (P1).
**Chart language:** `2026-07-31-life-hub-design.md` → Charts (Clinical Glass). Closed tokens only.
**Base:** current `main` (includes `render-meal-history.js`).

## Goal

Nutrition charts lag behind the rest of Life Hub, and the page wastes space: four half-empty 7-day cards, three small single-number tiles, a pie with two slices and a 30-square heatmap. Replace them with four strong charts that answer two equal questions: **what's left today** and **how the week is going**.

## Locked decisions

| Topic | Choice |
|---|---|
| Emphasis | Today and the week get equal weight (Adam picked "C, both") |
| Today, left | **Nested rings**: Protein, Energy, Fat, Sodium (outer → inner) |
| Today, right | **Protein climb**: running total across the clock |
| Week | **Week grid**: four macro rows × 7 day columns, replacing all four 7-day area charts |
| Month | **30-day consistency strip** of protein bars, replacing the square heatmap |
| Calcium, polyphenols | Small chips under the ring legend, not rings (six rings get too thin) |
| Energy colour | Green when within **±10%** of target. Over isn't a "hit" |
| Fat, sodium | Ceilings: green when at or under, `--danger` when over |
| Motion | Plays once per load or date change. Respects `quiet` / `data-sync-quiet` and reduced motion. Nothing loops |

## Page layout (desktop ≥ 1024)

```
┌──────────────────────── Today · Sun 4 Oct (full width) ────────────────────────┐
│ [nested rings] [legend + Ca/polyphenol chips]  │  Protein climb                   │
│ Brisket note strip (full width of card)                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
┌──── Week grid (7fr) ── ‹ range › Today ──┐ ┌──── Selected day: what you ate (5fr) ┐
└──────────────────────────────────────────┘ └──────────────────────────────────────┘
┌──────────────────────── 30-day protein consistency (full width) ─────────────────┐
└──────────────────────────────────────────────────────────────────────────────────┘
Meal plan widgets (unchanged, if shown) · Challenge trackers (unchanged, if any)
```

At 390px, every card stacks in that order. In the Today card, the rings and legend sit side by side (rings 150px), with the climb below them at full width.

## Cuts (must unmount; delete markup, CSS and renderer code)

1. The macro split card (`.macro-split-card`, `#nutrition-macro-split`, `renderMacroSplit` ring drawing). Its numbers move into the ring legend, and its Brisket note moves into the Today card.
2. The `.nutrition-grid` tiles: Sodium, Calcium, Polyphenols and Protein by meal (`renderMacroRings`, `renderMealProteinPie`). `chart-kit/pie.js` stays: it is a catalogued kit primitive (CHART-CATALOG), so only Nutrition's use of it is removed.
3. Both `.nutrition-week-charts` rows (the protein, fat, energy and carbs area charts, and `renderNamedAreaChart`).
4. The `#nutrition-heatmap` square grid and `renderHeatmap`.
5. Meal history's **day strip** (`.meal-history__strip`) and its "View meals" expand toggle. The week grid's columns take over the strip's job (see below).

**Keep:** the meal plan widgets card, the challenge trackers, the chat button and the protein trend badge text (it moves onto the week grid's Protein row label as "↓ −12.7 g vs last week", colour plus arrow plus words).

## 1. Today card

### Nested rings

- SVG `viewBox 0 0 200 200`, four rings, stroke 11, gap 2, rounded caps, starting at 12 o'clock.
- Colours: Protein `--wave`, Energy `--success`, Fat `--high-sea-ink`, Sodium `--danger`. Each track is the same colour at about 14% opacity.
- **Over 100%:** the ring completes its lap, then a second lap draws on top in a darker shade of the same colour, to `(value/target − 1)` of a turn and capped at one extra lap. A drop-shadow filter on the second lap makes the overlap read. A legend chip says "over 40%".
- **Centre:** the protein still to go, as a big number ("90") with the label "g protein / to go". When the protein target is met, it shows "✓" and "protein hit".
- **Legend** (HTML, not SVG text): a swatch, then the name, then `value / target unit`. Fat and sodium say "ceiling".
- **Chips:** "Calcium 89/1,000 mg" and "Polyphenols 6 · −4 vs aim" (existing `polyphenolVsAim` label).
- When there's no target (targets missing), that ring draws its track only, and the legend shows the value with "no target".

### Protein climb

- The x axis is the clock, 6 am to 11 pm. Meals earlier or later stretch the axis to fit. The y axis runs from 0 to max(goal × 1.12, total × 1.05).
- **Step line:** it stays flat between meals and steps up by each meal's `protein_g` at its time. A soft area fill sits under it.
- **Meal markers:** a dot under the axis at each meal's time, with area proportional to its protein, labelled "Lunch · 22 g". When several meals are under 30 minutes apart, they merge into one marker labelled with the combined grams, and the `title` lists each meal.
- **Missing time:** use the default slot for that meal: breakfast 08:00, lunch 12:30, snack 15:30, dinner 19:00, dessert 20:30, anything else 12:00. Draw the marker hollow and add "time not logged" to its `title` (D1: don't fake precision silently).
- **Goal band:** a `--pastel-sage` band from the goal upward, labelled "120 g goal".
- **"Your usual":** a faint dotted line showing the average running total at each time of day across the previous 7 logged days. Days with no meals are excluded. It is hidden when there are fewer than 3 logged days.
- **Viewing today** (`model.date` is Sydney today): show a "now" rule labelled "now · 8:06 pm", a dot at the current total, and a dashed line from that dot to the goal at 23:00 with the label "90 g to go before bed". When the goal is already met, the dashed line is hidden and the label reads "goal hit at 7:40 pm".
- **Viewing a past day:** show the whole day. No "now" rule, no projection. The subtitle reads "112 g across 4 meals".
- **Subtitle:** "30 g by 8 pm · usually ~75 g by now", or the past-day text above.
- **No meals:** keep the axes and the goal band. Show one sentence instead of the line: "No meals logged yet today." (I3).

### Brisket note

Same source as today (`model.advice`) and the same empty text. It is rendered as a full-width strip at the bottom of the Today card.

## 2. Week grid + selected day (absorbs Meal history)

The week grid becomes the top half of Meal history. `render-meal-history.js` keeps ownership of `view.selected`, week navigation, the date picker, lookback loading, status and the day panel. It is **one renderer for this data** (V8).

- **Grid card (left):**
  - The header reads "This week · 28/09 – 04/10", followed by the existing ‹, date picker, › and Today controls.
  - Then the grid. The existing status line goes under it.
- **Day card (right):**
  - The heading reads "Today · Sun 04/10/26", then the totals `dl`, then the meal list with its disclosures.
  - The list is always expanded. The "View meals" toggle is removed.
  - The empty and loading copy is unchanged.

### The grid

- Rows are Protein (target), Fat (ceiling), Energy (±10% band) and Carbs (no target, drawn neutral at 45% opacity).
- Columns are Monday to Sunday of the selected week.
- Each row has a label column with the name plus a summary: "hit 2/7", "over 4/7", "on target 2/7" or "no target". Protein also shows the trend text. Only days with meals logged count toward the summary.
- Each cell has a bar scaled to that row's max over the week (including the target), the value above it, and a dashed target line across the row. Colours follow the locked decisions.
- **Columns are buttons.** The whole column is the hit area. Each keeps today's strip semantics: `data-date`, `aria-pressed`, an `aria-label` like "Sun 04/10/26, today, 2 meals", and the same loading, unavailable and future states, with future columns inert. The selected column gets a `--pastel-blue` rounded highlight. Clicking a column calls the existing `select(date)`, which runs the morph and repaints the day card.
- **No meals:** a 2px stub instead of a bar, and the value reads "—". It never draws 0 as if it were data.
- **Data:** `nutrition-model.js` adds per-day targets to each `mealHistory.days[]` entry: `targets: { protein_g, fat_ceiling_g, calories }`, using the same `getDayTargets(targetsConfig, date, resolveDayType, hasRecoveryBonus)` call `dailyNutrition` uses (D6: one function). The grid reads only `mealHistory.days`.

## 3. 30-day consistency strip

- Thirty protein bars from `model.month`, oldest on the left.
- Bars that hit the target are `--success` at full opacity. The rest are `--wave` at 45%. Days with no meals are a 2px stub.
- A dashed goal line runs across the strip. The current week (the last 7 bars) gets a `--pastel-blue` bracket labelled "this week".
- Date labels sit under the bars every 7 days, plus the final day, using `formatDisplayDate`'s short form (dd/mm).
- The header shows the title and, on the right, "**13** of 30 days hit · best run 5". The best run is the longest stretch of consecutive hit days in the window.
- Each bar's `title` reads like today's heatmap tile: "Fri 02/10/26: 112 g / 120 g".

## Motion

Use the existing `chart-kit/animate.js` gate (`motionIsQuiet`: `quiet`, `data-sync-quiet`, reduced motion). When the gate says quiet, everything **snaps to final geometry**, with no partial states left behind (see the `chart-animating` lesson in `animate.js`). The easing is `cubic-bezier(.2,.8,.2,1)` unless noted.

| t (ms) | What happens |
|---|---|
| 0 | The card shells are already painted. Nothing on the page moves its layout. |
| 0–1300 | **Rings** sweep from 12 o'clock, outer first, 110 ms apart. Each takes 900 + 300 × fill ms. An over-ceiling ring's second lap starts when its first finishes and takes 600 ms. |
| 300–1400 | The **centre number** counts up from 0 (ease-out cubic, using `requestAnimationFrame` with a clamped elapsed time, C7). Legend rows rise 6px and fade in, 110 ms apart. |
| 250–1550 | The **climb line** draws (dash offset). Each meal marker pops (scale 0 → 1, `cubic-bezier(.34,1.56,.64,1)`) when the line reaches its x position, along with its vertical tick. |
| 1300 | The area under the climb fades in. |
| 1500–1850 | The **now** rule and dot appear, the dot glows once, then the dashed projection and its label fade in. |
| 1900 | The **Brisket** strip rises in. |
| 0–900 | **Grid** bars grow from the baseline, delayed by `col × 45 + row × 70` ms. Values fade in 350 ms after each bar. Target lines wipe left to right after their row starts. |
| 0–1350 | **Strip** bars rise in a wave, 22 ms apart. The goal line wipes across at 700 ms, and the hit count ticks up. |

- **Changing the week or day in the grid:** the bars morph from their old heights to the new ones over 450 ms instead of replaying from zero. The selected highlight slides to the new column.
- **Changing the page date:** the Today card and the strip replay.
- **Sync refresh** (`quiet`): nothing moves.

## Accessibility and words (C8)

- Every chart has a visible one-line key or caption built from the data, plus `role="img"` and an `aria-label` summary, for example "Protein 30 of 120 grams, energy 1,024 of 2,200 kilocalories, fat 31 of 50 gram ceiling, sodium 2,795 of 2,000 milligram ceiling, 40 percent over".
- Each mark has a `<title>` tooltip.
- Colour never carries meaning on its own: summaries say "hit", "over" or "on target", and the over chip says "over 40%".

## Files

| File | Change |
|---|---|
| `apps/life/index.html` | Replace the nutrition section markup per the layout. Remove the cut cards. |
| `apps/life/css/app.css` | New `.nutrition-today`, `.nutrition-rings`, `.protein-climb`, `.week-grid`, `.consistency-strip` blocks. Delete dead nutrition CSS. Kit tokens and text sizes only (T1). |
| `apps/life/js/app/chart-kit/nested-rings.js` (new) | Pure geometry: rings → arcs and overflow laps. |
| `apps/life/js/app/chart-kit/protein-climb.js` (new) | Pure geometry: meals, now, goal, usual → step path, markers, projection, merged markers. |
| `apps/life/js/app/chart-kit/week-grid.js` (new) | Pure geometry: days × rows → bars, target lines, summaries. |
| `apps/life/js/app/chart-kit/consistency-strip.js` (new) | Pure geometry: month → bars, goal line, best run. |
| `apps/life/js/app/render-nutrition.js` | Render the Today card and the strip. Drop the cut renderers. |
| `apps/life/js/app/render-meal-history.js` | Swap the strip for the grid. Two-card split. Drop the expand toggle. |
| `apps/life/js/app/nutrition-model.js` | Add `mealHistory.days[].targets`, `usualClimb` (the per-time-of-day average) and `mealsToday[].timeKnown`. |
| `apps/life/js/app/chart-kit/pie.js` | Kept (catalogued primitive). Only the Nutrition pie test is removed. |
| `tests/unit/*` | New geometry tests per kit file. Rewrite `nutrition-layout.test.js` for the new structure. Update `render-nutrition-meals.test.js`. |
| `tests/browser/nutrition.spec.mjs` | Update the meal history spec: grid columns replace the strip, the day card is always open. Add checks at 390 and 1440. |
| `docs/superpowers/specs/2026-07-31-life-hub-design.md` | Charts table: Nutrition now uses nested rings, climb, week grid and strip. Remove the "Nutrition 7-day protein" row. |

## Failure modes to check (`docs/CURSOR-UI-FAILURES.md`)

- **P1:** compare the screenshots side by side with the mockup at 1440 and 390 before claiming done.
- **P2:** branch from current `main`. This branch starts at `origin/main` 849d9f09.
- **C1:**
  - Climb meal labels collide when meals are close. That's why they merge. Test with three meals 20 minutes apart.
  - The "now" label must not clip at 23:00. Anchor it `end` near the right edge.
  - Grid values sit above bars and must stay below the day header.
  - `getBBox` test at 390 and 1440.
- **C2:** the climb's step line must pass through the real cumulative totals. The goal band is secondary. Assert the final y equals the total's y.
- **C5:** the climb's x position is placed by meal **time**, not list order. A test where two inputs differ only in meal times must produce different paths.
- **C7:** clamp the elapsed time in the count-up `requestAnimationFrame`. No `pageerror` across three cold loads.
- **C8:** each chart has visible words (see Accessibility).
- **D1:** meals without a logged time are hollow and say "time not logged".
- **D3:** acceptance screenshots on the live umbrella with real data. Name today's real meals in the PR.
- **D6:** grid targets come from `getDayTargets` through the model, not a second calculation.
- **I3:** every empty state is a sentence: no meals today, fewer than 3 days for "your usual", history unavailable.
- **L2:** no card with dead space. The week grid and day card share a row and stretch to the same height. The day card scrolls its list internally past about 8 meals.
- **R2 / R3:** no horizontal scroll at 390. The grid fits 7 columns at 390 (label column 56px, bars at least 14px wide). SVG text sizes are bumped at 390 so they render at 11px or more.
- **S4:** every SVG shape sets an explicit fill or stroke, so nothing falls back to black.
- **T1:** kit text tokens only.
- **V1:** cut elements are removed, not `hidden`. Any `[hidden]` used must actually hide.
- **V7:** a sync repaint keeps the selected grid day and the open meal disclosures (meal history already tracks these, so preserve them).
- **V8:** the grid and the day card are one meal history renderer.

## Out of scope

- New nutrition fields, or changes to how meals are logged.
- Changing targets or how day types resolve.
- Meal plan widgets and challenge trackers (unchanged apart from their position).
- Other hubs' charts.
