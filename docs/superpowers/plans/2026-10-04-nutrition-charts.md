# Nutrition charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Nutrition page's macro split, single-number tiles, pie, four 7-day area charts and square heatmap with nested rings, a protein climb, a week grid (inside Meal history) and a 30-day consistency strip. Spec: `docs/superpowers/specs/2026-10-04-nutrition-charts-design.md`.

**Architecture:**
- Four pure geometry modules in `chart-kit/`, each unit-tested with no DOM.
- `render-nutrition-today.js` paints the Today card (rings, climb, Brisket note).
- `render-nutrition.js` paints the strip and calls both renderers.
- `render-meal-history.js` keeps owning the selected day and week navigation, and swaps its day strip for the HTML week grid.

**Motion approach:**
- Every mark's natural CSS state is its **final geometry**.
- Animations are keyframes that run only while the card carries `.is-playing`. The class is added only when `motionIsQuiet` says motion is allowed.
- So quiet refreshes, reduced motion and interrupted animations can never leave a half-drawn chart.

**HTML vs SVG:**
- The week grid and the strip are HTML: real buttons, real CSS text sizes, and height transitions for week morphs.
- The rings and the climb are SVG. The climb sizes its viewBox to the container width so its text renders 1:1. A `ResizeObserver` repaints it quietly when that width changes.

**Tech Stack:** Vanilla ES modules, node:test, Playwright browser specs, CSS with design-kit tokens.

---

## File map

| File | Responsibility |
|---|---|
| `apps/life/js/app/chart-kit/nested-rings.js` | `buildNestedRings(rings, opts)` → per-ring radius, circumference, first-lap offset, overflow-lap offset |
| `apps/life/js/app/chart-kit/protein-climb.js` | `buildProteinClimb(input)` → x/y scales, step path, area path, merged markers, now/projection, usual path, goal band |
| `apps/life/js/app/chart-kit/week-grid.js` | `buildWeekGrid(days, opts)` → rows × columns of `{ value, pct, state, logged }`, target pct per row, summaries |
| `apps/life/js/app/chart-kit/consistency-strip.js` | `buildConsistencyStrip(month)` → bars, goal pct, hit count, best run, week-label indexes |
| `apps/life/js/app/chart-kit/animate.js` | export `motionIsQuiet`, add `playCardMotion(card, options)` and `countUp(el, to, options)` |
| `apps/life/js/app/nutrition-model.js` | `mealMinutes()`, `mealsToday[].minutes/timeKnown`, `mealHistory.days[].targets`, `usualClimb` |
| `apps/life/js/app/render-nutrition-today.js` | Today card DOM |
| `apps/life/js/app/render-nutrition.js` | Orchestrates. Strip DOM. Cut renderers removed |
| `apps/life/js/app/render-meal-history.js` | Grid replaces strip. Two hosts. No expand toggle |
| `apps/life/index.html`, `apps/life/css/app.css` | New markup/CSS. Dead blocks removed |
| `apps/life/service-worker.js` | Precache list: add the new files, drop `pie.js` |
| `tests/unit/chart-kit-nested-rings.test.js`, `…-protein-climb…`, `…-week-grid…`, `…-consistency-strip…` | Geometry tests |
| `tests/unit/nutrition-model.test.js` | Model additions |
| `tests/unit/nutrition-layout.test.js` | Rewritten for the new structure |
| `tests/browser/nutrition.spec.mjs` | Rewritten assertions; 390/1440; no pageerror |

## Tasks

### Task 1: nested-rings geometry
Test cases:
- 4 rings with stroke 11, gap 2 and size 200 give radii 84.5, 71.5, 58.5, 45.5.
- At 25% fill, the offset is 0.75 × the circumference.
- At 140%, the first-lap offset is 0, the overflow is 0.4, and the overflow offset is 0.6 × the circumference.
- At 300%, the overflow caps at 1.
- A target of 0 gives fraction 0, `hasTarget` false and no overflow.

Implementation: a pure function. Commit.

### Task 2: protein-climb geometry
Inputs:
- `meals[{ minutes, protein_g, label, timeKnown }]`, `goal`
- `nowMinutes` (null for a past day), `usual[{ minutes, protein_g }]` or null
- `width`, `height`

Test cases:
- **x domain:** 360–1380 by default, widened when a meal falls outside it.
- **C2:** the step path ends at the y of the cumulative total.
- **C5:** the same meals at different times produce different paths.
- Meals under 30 minutes apart merge, with summed grams and a combined label.
- **Projection:** present only when `nowMinutes` is set and the total is under the goal. It runs from (now, total) to (1380, goal).
- When the goal is hit, `goalHitMinutes` is the time of the meal that crossed the goal.
- **Empty meals:** `empty: true`, with the goal band still returned.
- The y max is the max of goal × 1.12 and total × 1.05.

Commit.

### Task 3: week-grid geometry
Inputs:
- `days`: 7 entries of `{ date, logged, totals: { protein_g, fat_g, calories, carbs_g }, targets: { protein_g, fat_ceiling_g, calories } }`

Test cases:
- **Protein** is `hit` when ≥ its target, otherwise `under`.
- **Fat** is `over` when > its ceiling, otherwise `ok`.
- **Energy** is `ok` within ±10%, otherwise `off`.
- **Carbs** is `neutral`.
- Unlogged days get state `none` and pct 0, and are excluded from the summaries ("hit 2/7" counts only logged days but keeps /7).
- Each row's max includes the target. `targetPct` is target / max.

Commit.

### Task 4: consistency-strip geometry
Test cases:
- 30 bars.
- `hit` follows `hitProtein`.
- Protein of 0 gives a `none` stub.
- The best run is the longest stretch of consecutive hits.
- The hit count is correct.
- Label indexes are 0, 7, 14, 21 and 29.
- `goalPct` uses the max of the goal and the largest bar.

Commit.

### Task 5: model additions
- **`mealMinutes(meal)`:** parse `HH:MM` and set `timeKnown` to true. Otherwise use the default slot for the meal type: breakfast 480, lunch 750, snack 930, dinner 1140, dessert 1230, anything else 720.
- **`mealsToday[]`:** gains `minutes`, `timeKnown` and `carbs_g`.
- **`mealHistory.days[].targets`:** computed from `getDayTargets` (the same call `dailyNutrition` makes).
- **`usualClimb`:**
  - Take the 7 most recent dates with meals before `date`, within 28 days.
  - When there are fewer than 3, it is null.
  - Otherwise it is the average cumulative protein at every 30 minutes from 360 to 1380.

Tests in `nutrition-model.test.js`. Commit.

### Task 6: motion helpers
In `animate.js`:
- Export `motionIsQuiet`.
- **`playCardMotion(card, options)`:**
  1. Remove `is-playing`.
  2. If quiet, stop there.
  3. Otherwise force a reflow, add `is-playing`, and remove it after the longest animation (2600 ms) with a timer kept in a WeakMap.
- **`countUp(el, to, options)`:**
  - A `requestAnimationFrame` count-up with a 300 ms delay and 1100 ms ease-out cubic.
  - The elapsed time is clamped to 0 or more (C7).
  - When quiet, it sets the text immediately.

Unit test with stubbed rAF/matchMedia. Commit.

### Task 7: Today card + strip renderers, markup, CSS
- **`index.html`:** replace everything from the macro split card down to the heatmap. The new order is:
  1. The Today card.
  2. The meal plan widgets card (unchanged).
  3. The week row: grid card plus day card.
  4. The challenges (unchanged).
  5. The strip card.
- **`render-nutrition-today.js`:** draws the rings SVG and legend, the chips, and the climb SVG sized to its container, plus the subtitle, the empty sentence and the Brisket note.
- **`render-nutrition.js`:** remove the macro split, the macro rings, the pie, the named area charts and the heatmap. Add `renderConsistencyStrip`. Call `playCardMotion` on the Today and strip cards when not quiet.
- **CSS:** add the new blocks and keyframes. Delete `.macro-split*`, `.nutrition-grid*`, `.meal-protein-*`, `.nutrition-week-charts*`, `.heatmap-tile--protein`, `#nutrition-heatmap` and the `.nutrition--fat-over` selectors for removed nodes.
- Delete `pie.js` and its test, and the pie test in `render-nutrition-meals.test.js`. Update the service worker list.

Commit.

### Task 8: Meal history → week grid + day card
- `mountHistory` takes two hosts: `#nutrition-meal-history` (grid card) and `#nutrition-meal-day` (day card).
- The strip `div` becomes `.week-grid`:
  - A label column, then 7 column buttons.
  - Each button holds a header plus 4 cells, and keeps the same dataset and aria attributes as the old strip buttons.
- The bars reuse their nodes between paints, so height changes transition (the morph).
- `view.expanded` is removed. The panel is always shown, and clicking a column just selects that day.

Commit.

### Task 9: tests
- Rewrite `nutrition-layout.test.js` and the browser assertions:
  - The ring legend has 4 items.
  - The climb path exists.
  - The grid has 7 columns × 4 rows.
  - The strip has 30 bars.
  - No horizontal scroll at 390.
  - No pageerror.
  - Quiet sync leaves nothing animating.
  - Meal history flows through grid columns.
- Run `npm test` and the nutrition browser spec. Commit.

### Task 10: verify + PR
- Run `npm run pre-pr-check`.
- Preview locally at 1440 and 390 and compare with the mockup (P1).
- Update the Charts table in `2026-07-31-life-hub-design.md`.
- Open one PR.
