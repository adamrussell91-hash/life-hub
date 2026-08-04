# Nutrition Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Nutrition tab: a read-only dashboard (today's full macro breakdown, meal-by-meal protein, day-type targets, a 7-day protein trend chart, a 7-day hit/miss strip, and a 30-day consistency heatmap) plus an embedded chat panel that opens themed in Brisket's colour and defaults to him when nothing else is already sticky.

**Architecture:** Extends Home's existing "load once, build model, render" pattern with a second model/render pair (`nutrition-model.js`/`render-nutrition.js`) fed from the exact same already-loaded `events`/`targetsConfig` — no new fetch. Wires the shared-infrastructure branch's previously-unused building blocks (`js/app/chat-panel.js`, `js/app/agent-colour.js`, `chat-controller.js`'s default-agent fallback) into real markup for the first time. `app-controller.js` gains a `getCurrentSection()` accessor and retains the latest sync result so it can (re)build the Nutrition model on demand, the same way it already does for Home on every refresh.

**Tech Stack:** Vanilla JS (ES modules, no framework, no build step), `node:test` + `node:assert/strict`, hand-rolled SVG (one chart) — no charting library, keeping the app's zero-runtime-dependency, offline-safe architecture intact.

**Full context:** `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md` (design), `docs/superpowers/plans/2026-08-03-nutrition-central-node-infrastructure.md` (the shared-infra plan this builds on, already merged to `main`). Run `npm test` before starting to confirm a clean baseline (306 tests passing per `docs/IMPLEMENTATION_STATUS.md`).

**Known v1 simplification (intentional, not a bug):** the chat panel is reparented into `#nutrition-dashboard` itself as its slot. Since HTML's `hidden` attribute renders as `display:none` and hides all descendants regardless of their own state, navigating away from Nutrition visually hides an open panel along with the section it's nested in. The conversation itself is unaffected — `chat-controller.js`'s transcript lives in a separate closure untouched by DOM visibility — but the panel does not stay floating over other tabs. Reopening it (from Nutrition) shows the same ongoing conversation.

---

## File Structure

| File | Change |
|---|---|
| `js/app/nutrition-model.js` | **Create.** Pure model builder: today's macros/targets, 7-day series, 30-day series, week-over-week protein trend. |
| `tests/unit/nutrition-model.test.js` | **Create.** |
| `js/app/nutrition-charts.js` | **Create.** Pure SVG-geometry builder for the one real chart (protein trend line). |
| `tests/unit/nutrition-charts.test.js` | **Create.** |
| `js/app/render-nutrition.js` | **Create.** DOM rendering — no dedicated unit test, matching the existing convention for `render-home.js` (covered by browser tests instead). |
| `css/app.css` | **Modify.** New rules for the nutrition grid, meal breakdown, chart card, hit strip, heatmap, floating chat button, and the chat view's overlay mode. |
| `index.html` | **Modify.** Wrap `#chat-view` in `id="chat-view-home"` (the DOM contract `chat-panel.js` already documented as needed), add the `#nutrition-dashboard` section and its floating chat button. |
| `js/app/app-controller.js` | **Modify.** Retain the latest sync result; add `getCurrentSection()`; stop routing `nutrition` to the generic "coming later" handler; show/hide and build/render the Nutrition section; wire the floating button to `chat-panel.js` + `agent-colour.js`. |
| `tests/unit/app-controller.test.js` | **Modify.** Update the "future navigation" test to use a still-unbuilt section; add coverage for the new Nutrition wiring. |
| `js/app/main.js` | **Modify.** Instantiate `createChatPanelController`; pass the new dependencies into `createAppController`; give `createChatController` a `getDefaultAgentSlug` closure. |
| `service-worker.js` | **Modify.** Add the 3 new client modules to `SHELL_FILES`; bump `CACHE_NAME`. |
| `tests/browser/nutrition.spec.mjs` | **Create.** Browser acceptance test: real fixture values render, the floating button opens the panel themed in Brisket's colour. |

---

### Task 1: Nutrition data model

**Files:**
- Create: `js/app/nutrition-model.js`
- Create: `tests/unit/nutrition-model.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePeriods } from '../../js/core/trends.js';
import { buildNutritionModel, PROTEIN_TREND_CONFIG } from '../../js/app/nutrition-model.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'meal', date: '2026-07-24', meal: 'breakfast', calories: 300, protein_g: 140, fat_g: 10, sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1 },
  { type: 'meal', date: '2026-07-27', meal: 'lunch', calories: 400, protein_g: 60, fat_g: 12, sodium_mg: 200, calcium_mg: 80, polyphenol_score: 2 },
  { type: 'meal', date: '2026-07-20', meal: 'lunch', calories: 500, protein_g: 210, fat_g: 20, sodium_mg: 300, calcium_mg: 100, polyphenol_score: 4 }
];
const events = records.map(record => ({ record, body: '', path: '', legacy: false }));

const targetsConfig = {
  target_sets: [{
    valid_from: '2020-01-01',
    calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
    protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10
  }]
};

test('builds today\'s macros, day type, and full target profile from the existing core primitives', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.deepEqual(model.nutrition, {
    calories: 1130,
    protein_g: 80,
    fat_g: 27,
    sodium_mg: 1100,
    calcium_mg: 590,
    polyphenol_score: 9,
    meals: {
      breakfast: { protein_g: 38 },
      lunch: { protein_g: 42 },
      dinner: { protein_g: 0 },
      snack: { protein_g: 0 }
    }
  });
  assert.equal(model.dayType, 'movement');
  assert.deepEqual(model.targets, {
    calories: 1660,
    protein_g: 120,
    fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000,
    calcium_target_mg: 1000,
    polyphenol_daily_aim: 10,
    meal_protein_g: { breakfast: 30, lunch: 30, dinner: 40, snack: 20, minimum: 25 }
  });
});

test('builds a 7-day series ending on the display date, with each day\'s own protein target and hit/miss', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.deepEqual(model.week, [
    { date: '2026-07-24', calories: 300, protein_g: 140, fat_g: 10, proteinTarget: 120, hitProtein: true },
    { date: '2026-07-25', calories: 0, protein_g: 0, fat_g: 0, proteinTarget: 120, hitProtein: false },
    { date: '2026-07-26', calories: 0, protein_g: 0, fat_g: 0, proteinTarget: 120, hitProtein: false },
    { date: '2026-07-27', calories: 400, protein_g: 60, fat_g: 12, proteinTarget: 120, hitProtein: false },
    { date: '2026-07-28', calories: 0, protein_g: 0, fat_g: 0, proteinTarget: 120, hitProtein: false },
    { date: '2026-07-29', calories: 0, protein_g: 0, fat_g: 0, proteinTarget: 120, hitProtein: false },
    { date: '2026-07-30', calories: 1130, protein_g: 80, fat_g: 27, proteinTarget: 120, hitProtein: false }
  ]);
});

test('builds a 30-day series ending on the display date, within the same window Home already loads', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  assert.equal(model.month.length, 30);
  assert.equal(model.month[0].date, '2026-07-01');
  assert.equal(model.month.at(-1).date, '2026-07-30');
  assert.deepEqual(model.month.find(day => day.date === '2026-07-24'), {
    date: '2026-07-24', calories: 300, protein_g: 140, fat_g: 10, proteinTarget: 120, hitProtein: true
  });
});

test('compares this week\'s average protein against the previous week\'s using trends.js, not a reimplementation', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });

  // This week: (140 + 0 + 0 + 60 + 0 + 0 + 80) / 7 = 40. Previous week (07-17..07-23): 210 / 7 = 30.
  assert.deepEqual(model.proteinTrend, comparePeriods(40, 30, PROTEIN_TREND_CONFIG));
});

test('rejects a Nutrition model without a display date', () => {
  assert.throws(
    () => buildNutritionModel({ events: [], targetsConfig, date: null }),
    /display date/i
  );
});

test('a repository with no config/targets.yml yet renders zeroed targets and untargeted days instead of crashing', () => {
  const model = buildNutritionModel({ events: [], targetsConfig: null, date: '2026-08-03' });

  assert.deepEqual(model.targets, {
    calories: 0,
    protein_g: 0,
    fat_ceiling_g: 0,
    sodium_ceiling_mg: 0,
    calcium_target_mg: 0,
    polyphenol_daily_aim: 0,
    meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
  });
  assert.equal(model.week.every(day => day.proteinTarget === 0 && day.hitProtein === false), true);
  assert.equal(model.month.every(day => day.proteinTarget === 0 && day.hitProtein === false), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="Nutrition"`
Expected: FAIL — `Cannot find module '../../js/app/nutrition-model.js'`.

- [ ] **Step 3: Create `js/app/nutrition-model.js`**

```js
import { aggregateNutrition, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import { getDayTargets } from '../core/targets.js';
import { comparePeriods } from '../core/trends.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
export const PROTEIN_TREND_CONFIG = { unit: 'g', good: 'up', thresholds: [5, 15, 30] };

const EMPTY_TARGETS = {
  calories: 0,
  protein_g: 0,
  fat_ceiling_g: 0,
  sodium_ceiling_mg: 0,
  calcium_target_mg: 0,
  polyphenol_daily_aim: 0,
  meal_protein_g: { breakfast: 0, lunch: 0, dinner: 0, snack: 0, minimum: 0 }
};

function dailyNutrition(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;

  return {
    date,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    fat_g: nutrition.fat_g,
    proteinTarget,
    hitProtein: proteinTarget > 0 && nutrition.protein_g >= proteinTarget
  };
}

const averageProtein = days => (
  days.length === 0 ? 0 : days.reduce((sum, day) => sum + day.protein_g, 0) / days.length
);

export function buildNutritionModel({ events, targetsConfig, date }) {
  if (!date) throw new RangeError('Nutrition display date is unavailable');

  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : EMPTY_TARGETS;

  const week = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const month = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date)
    .map(day => dailyNutrition(events, day, targetsConfig));
  const previousWeek = enumerateDateKeys(
    addCalendarDays(date, -(2 * WEEK_DAYS - 1)),
    addCalendarDays(date, -WEEK_DAYS)
  ).map(day => dailyNutrition(events, day, targetsConfig));

  return {
    date,
    nutrition,
    dayType,
    targets,
    week,
    month,
    proteinTrend: comparePeriods(averageProtein(week), averageProtein(previousWeek), PROTEIN_TREND_CONFIG)
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="Nutrition"`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 312 (306 baseline + 6 new tests).

- [ ] **Step 6: Commit**

```bash
git add js/app/nutrition-model.js tests/unit/nutrition-model.test.js
git commit -m "feat: add the Nutrition tab's data model

Composes the existing aggregateNutrition/resolveDayType/getDayTargets
primitives Home already uses -- no new fetch, no changes to core
aggregation logic. Week/month windows stay within the 30-day range
loadLiveEvents already guarantees."
```

---

### Task 2: Protein trend chart geometry

**Files:**
- Create: `js/app/nutrition-charts.js`
- Create: `tests/unit/nutrition-charts.test.js`

**Deviation from the design spec's mockup, intentional:** the spec describes this chart as "gradient line + soft area fill, dashed target line, highlighted latest point." The dashed target line is dropped here. `getDayTargets` returns a *day-type-dependent* protein target (a workout day and a movement day have different targets), so a single flat dashed line across a 7-day span spanning mixed day types would misrepresent the actual target on several of those days — the mockup's flat line only reads correctly when every day shares one target. Rather than draw a technically-inaccurate stepped/zigzag reference line for a first version, this task keeps the line chart to the trend itself and relies on the separate hit/miss strip (below the chart, built in Task 3) to carry the "did each day hit its own target" information precisely. This does not need a design spec update beyond this note — the underlying goal ("show trend + show target consistency") is still met by the two visuals together, just not fused into a single chart element.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProteinLineChart } from '../../js/app/nutrition-charts.js';

test('scales a 3-point series into SVG coordinates within the given viewport', () => {
  const week = [
    { date: '2026-07-28', protein_g: 0 },
    { date: '2026-07-29', protein_g: 50 },
    { date: '2026-07-30', protein_g: 100 }
  ];

  const chart = buildProteinLineChart(week, { width: 320, height: 120, padding: 12 });

  assert.equal(chart.width, 320);
  assert.equal(chart.height, 120);
  assert.deepEqual(chart.points, [
    { x: 12, y: 108, date: '2026-07-28', value: 0 },
    { x: 160, y: 60, date: '2026-07-29', value: 50 },
    { x: 308, y: 12, date: '2026-07-30', value: 100 }
  ]);
  assert.equal(chart.linePoints, '12.0,108.0 160.0,60.0 308.0,12.0');
  assert.equal(chart.areaPoints, '12,120 12.0,108.0 160.0,60.0 308.0,12.0 308,120');
  assert.deepEqual(chart.last, { x: 308, y: 12, date: '2026-07-30', value: 100 });
});

test('a single-point series places one point at the left padding without dividing by zero', () => {
  const chart = buildProteinLineChart([{ date: '2026-07-30', protein_g: 80 }], { width: 320, height: 120, padding: 12 });

  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0].x, 12);
  assert.equal(chart.last.date, '2026-07-30');
});

test('an all-zero series does not divide by zero and places every point at the baseline', () => {
  const week = [
    { date: '2026-07-29', protein_g: 0 },
    { date: '2026-07-30', protein_g: 0 }
  ];

  const chart = buildProteinLineChart(week, { width: 320, height: 120, padding: 12 });

  assert.equal(chart.points.every(point => point.y === 108), true);
});

test('an empty series produces no points and a null last point, without throwing', () => {
  const chart = buildProteinLineChart([], { width: 320, height: 120, padding: 12 });

  assert.deepEqual(chart.points, []);
  assert.equal(chart.linePoints, '');
  assert.equal(chart.last, null);
});

test('default dimensions are provided when omitted', () => {
  const chart = buildProteinLineChart([{ date: '2026-07-30', protein_g: 10 }]);

  assert.equal(chart.width, 320);
  assert.equal(chart.height, 120);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="protein line chart\|scales a 3-point\|single-point series\|all-zero series\|empty series\|default dimensions"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `js/app/nutrition-charts.js`**

```js
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 12;

export function buildProteinLineChart(series, { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, padding = DEFAULT_PADDING } = {}) {
  const values = series.map(day => day.protein_g);
  const max = Math.max(1, ...values);
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const scaleY = value => height - padding - (value / max) * (height - padding * 2);

  const points = series.map((day, index) => ({
    x: padding + stepX * index,
    y: scaleY(day.protein_g),
    date: day.date,
    value: day.protein_g
  }));

  const linePoints = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPoints = points.length === 0
    ? ''
    : `${padding},${height} ${linePoints} ${width - padding},${height}`;

  return {
    width,
    height,
    points,
    linePoints,
    areaPoints,
    last: points.at(-1) ?? null
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="protein line chart\|scales a 3-point\|single-point series\|all-zero series\|empty series\|default dimensions"`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 317 (312 + 5 new tests).

- [ ] **Step 6: Commit**

```bash
git add js/app/nutrition-charts.js tests/unit/nutrition-charts.test.js
git commit -m "feat: add pure SVG-geometry builder for the protein trend chart

Hand-rolled, no charting library -- keeps the app's zero-runtime-dependency,
offline-safe architecture intact. The two binary hit/miss visuals (week
strip, month heatmap) don't need geometry math and are plain CSS grids,
built directly in render-nutrition.js."
```

---

### Task 3: Nutrition rendering

**Files:**
- Create: `js/app/render-nutrition.js`

No dedicated unit test for this file — `render-home.js` (the equivalent Home renderer) has none either; DOM output is exercised by the browser acceptance test in Task 9.

- [ ] **Step 1: Create `js/app/render-nutrition.js`**

```js
import { buildProteinLineChart } from './nutrition-charts.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

export function renderNutrition(root, model) {
  setText(root, '[data-nutrition="calories"]', model.nutrition.calories.toLocaleString('en-AU'));
  setText(root, '[data-target="nutrition-calories"]', `of ${model.targets.calories.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-nutrition="protein"]', `${model.nutrition.protein_g} g`);
  setText(root, '[data-target="nutrition-protein"]', `/ ${model.targets.protein_g} g`);
  setText(root, '[data-nutrition="fat"]', `${model.nutrition.fat_g} g`);
  setText(root, '[data-target="nutrition-fat"]', `/ ${model.targets.fat_ceiling_g} g`);
  setText(root, '[data-nutrition="sodium"]', `${model.nutrition.sodium_mg} mg`);
  setText(root, '[data-target="nutrition-sodium"]', `/ ${model.targets.sodium_ceiling_mg} mg`);
  setText(root, '[data-nutrition="calcium"]', `${model.nutrition.calcium_mg} mg`);
  setText(root, '[data-target="nutrition-calcium"]', `/ ${model.targets.calcium_target_mg} mg`);
  setText(root, '[data-nutrition="polyphenol"]', model.nutrition.polyphenol_score);
  setText(root, '[data-target="nutrition-polyphenol"]', `/ ${model.targets.polyphenol_daily_aim}`);

  for (const [meal, values] of Object.entries(model.nutrition.meals)) {
    setText(root, `[data-meal-protein="${meal}"]`, `${values.protein_g} g`);
  }

  renderProteinChart(root, model.week);
  renderHitStrip(root, model.week);
  renderHeatmap(root, model.month);
  renderProteinTrend(root, model.proteinTrend);

  root.querySelector('#nutrition-dashboard')?.removeAttribute('hidden');
}

function renderProteinChart(root, week) {
  const svg = root.querySelector('#nutrition-protein-chart');
  if (!svg) return;
  const chart = buildProteinLineChart(week);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);

  const line = svg.querySelector('[data-role="line"]');
  if (line) line.setAttribute('points', chart.linePoints);

  const area = svg.querySelector('[data-role="area"]');
  if (area) area.setAttribute('points', chart.areaPoints);

  const dot = svg.querySelector('[data-role="last-point"]');
  if (dot) {
    if (chart.last) {
      dot.setAttribute('cx', chart.last.x);
      dot.setAttribute('cy', chart.last.y);
      dot.removeAttribute('hidden');
    } else {
      dot.setAttribute('hidden', '');
    }
  }
}

function renderHitStrip(root, week) {
  const strip = root.querySelector('#nutrition-hit-strip');
  if (!strip) return;
  strip.replaceChildren();
  for (const day of week) {
    const bar = root.createElement('span');
    bar.className = 'hit-bar';
    bar.dataset.hit = String(day.hitProtein);
    bar.title = day.date;
    strip.append(bar);
  }
}

function renderHeatmap(root, month) {
  const grid = root.querySelector('#nutrition-heatmap');
  if (!grid) return;
  grid.replaceChildren();
  for (const day of month) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(day.hitProtein);
    tile.title = day.date;
    grid.append(tile);
  }
}

function renderProteinTrend(root, trend) {
  const badge = root.querySelector('[data-value="protein-trend"]');
  if (!badge) return;
  badge.textContent = trend.label;
  badge.dataset.colour = trend.colour;
}
```

- [ ] **Step 2: Confirm it imports cleanly**

```bash
node -e "import('./js/app/render-nutrition.js').then(() => console.log('ok'))"
```
Expected: `ok`.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 317 (this file has no dedicated tests yet — Task 9's browser test covers it).

- [ ] **Step 4: Commit**

```bash
git add js/app/render-nutrition.js
git commit -m "feat: add Nutrition tab DOM rendering

No dedicated unit test, matching render-home.js's existing convention --
DOM output is exercised by the browser acceptance test."
```

---

### Task 4: CSS for the Nutrition dashboard and the chat overlay

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Append these rules to `css/app.css`**

```css
.nutrition-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.meal-breakdown-card { margin-top: 1rem; }
.meal-breakdown { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 0.75rem 0 0; }
.meal-breakdown dt { color: var(--muted); font-size: 0.78rem; text-transform: capitalize; }
.meal-breakdown dd { margin: 0; color: var(--depth); font-weight: 700; font-variant-numeric: tabular-nums; }

.chart-card { margin-top: 1rem; }
.trend-badge { padding: 0.3rem 0.6rem; border-radius: 999px; font-size: 0.7rem; font-weight: 750; background: rgba(20,43,81,0.06); color: var(--muted); }
.trend-badge[data-colour="green"] { color: #1f7a52; background: rgba(31,122,82,0.1); }
.trend-badge[data-colour="red"] { color: #8d351f; background: rgba(141,53,31,0.1); }

.line-chart { width: 100%; height: 8rem; margin-top: 0.75rem; }
.line-chart [data-role="area"] { fill: rgba(55,111,183,0.22); stroke: none; }
.line-chart [data-role="line"] { fill: none; stroke: var(--wave); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.line-chart [data-role="last-point"] { fill: var(--warm-white); stroke: var(--wave); stroke-width: 2; }

.hit-strip { display: flex; gap: 0.4rem; margin-top: 0.85rem; }
.hit-bar { flex: 1; height: 0.6rem; border-radius: 999px; background: rgba(20,43,81,0.08); }
.hit-bar[data-hit="true"] { background: var(--high-sea); }

.heatmap-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 0.3rem; margin-top: 0.85rem; }
.heatmap-tile { aspect-ratio: 1; border-radius: 0.3rem; background: rgba(20,43,81,0.08); }
.heatmap-tile[data-hit="true"] { background: var(--wave); }

.floating-chat-button {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  z-index: 30;
  width: 3.2rem;
  height: 3.2rem;
  border: 0;
  border-radius: 50%;
  color: white;
  background: var(--agent-accent, var(--wave));
  font-size: 1.3rem;
  box-shadow: 0 0.7rem 1.8rem rgba(10,21,54,0.28);
  cursor: pointer;
}

.chat-view[data-panel-mode="overlay"] {
  position: fixed;
  z-index: 25;
  inset: auto 1.5rem 6rem auto;
  width: min(24rem, calc(100vw - 3rem));
  max-height: min(70vh, 40rem);
  padding: 1rem;
  border-radius: var(--radius-lg);
  background: var(--warm-white);
  border-left: 0.25rem solid var(--agent-accent, var(--wave));
  box-shadow: 0 1.4rem 3.5rem rgba(31,53,91,0.28);
  overflow: hidden;
}

.chat-view[data-panel-mode="overlay"] .chat-messages { max-height: 40vh; }

@media (max-width: 48rem) {
  .nutrition-grid { grid-template-columns: 1fr 1fr; }
  .chat-view[data-panel-mode="overlay"] { inset: auto 1rem 5.5rem auto; width: calc(100vw - 2rem); }
  .floating-chat-button { right: 1rem; bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
}
```

- [ ] **Step 2: Confirm the stylesheet still parses and the existing style-scan test still passes**

```bash
npm test -- --test-name-pattern="stylesheet"
```
Expected: PASS (`tests/unit/web-assets.test.js`'s `'responsive stylesheet contains the approved palette and mobile breakpoint'` test reads the raw CSS text and checks for known tokens — it should be unaffected by pure additions, but run it to confirm).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 317 (CSS has no tests of its own beyond the existing scan).

- [ ] **Step 4: Commit**

```bash
git add css/app.css
git commit -m "feat: add Nutrition dashboard, chart, and chat-overlay styles"
```

---

### Task 5: HTML markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wrap the existing `#chat-view` section in `id="chat-view-home"`**

Find this in `index.html` (inside `<main id="main-content">`, currently the last section before `</main>`):

```html
        <section id="chat-view" class="chat-view" aria-labelledby="chat-heading" hidden>
          <div class="section-heading">
            <div>
              <p class="section-kicker">Talk to your agents</p>
              <h2 id="chat-heading">Chat</h2>
            </div>
          </div>
          <p id="chat-error" class="chat-error" role="alert" hidden></p>
          <ul id="chat-messages" class="chat-messages" aria-live="polite"></ul>
          <form id="chat-form" class="chat-form">
            <label class="sr-only" for="chat-input">Message</label>
            <input id="chat-input" name="message" type="text" autocomplete="off" required>
            <button id="chat-send" type="submit">Send</button>
          </form>
        </section>
```

Replace it with the same markup wrapped in a new `<div id="chat-view-home">`, and add the new `#nutrition-dashboard` section as a sibling right after it (still inside `<main id="main-content">`, before the closing `</main>`):

```html
        <div id="chat-view-home">
          <section id="chat-view" class="chat-view" aria-labelledby="chat-heading" hidden>
            <div class="section-heading">
              <div>
                <p class="section-kicker">Talk to your agents</p>
                <h2 id="chat-heading">Chat</h2>
              </div>
            </div>
            <p id="chat-error" class="chat-error" role="alert" hidden></p>
            <ul id="chat-messages" class="chat-messages" aria-live="polite"></ul>
            <form id="chat-form" class="chat-form">
              <label class="sr-only" for="chat-input">Message</label>
              <input id="chat-input" name="message" type="text" autocomplete="off" required>
              <button id="chat-send" type="submit">Send</button>
            </form>
          </section>
        </div>

        <section id="nutrition-dashboard" class="dashboard" aria-labelledby="nutrition-heading" hidden>
          <div class="section-heading">
            <div>
              <p class="section-kicker">Nutrition</p>
              <h2 id="nutrition-heading">Today's macros</h2>
            </div>
          </div>

          <div class="nutrition-grid">
            <article class="metric-card" aria-labelledby="nutrition-calories-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-calories-label">Energy</p>
                <span class="metric-icon energy" aria-hidden="true">◇</span>
              </div>
              <p class="metric-value"><strong data-nutrition="calories">—</strong><span data-target="nutrition-calories">of — kcal</span></p>
            </article>
            <article class="metric-card" aria-labelledby="nutrition-protein-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-protein-label">Protein</p>
                <span class="metric-icon" aria-hidden="true">P</span>
              </div>
              <p class="metric-value"><strong data-nutrition="protein">—</strong><span data-target="nutrition-protein">/ — g</span></p>
            </article>
            <article class="metric-card" aria-labelledby="nutrition-fat-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-fat-label">Fat</p>
                <span class="metric-icon fat" aria-hidden="true">F</span>
              </div>
              <p class="metric-value"><strong data-nutrition="fat">—</strong><span data-target="nutrition-fat">/ — g</span></p>
            </article>
            <article class="metric-card" aria-labelledby="nutrition-sodium-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-sodium-label">Sodium</p>
                <span class="metric-icon" aria-hidden="true">Na</span>
              </div>
              <p class="metric-value"><strong data-nutrition="sodium">—</strong><span data-target="nutrition-sodium">/ — mg</span></p>
            </article>
            <article class="metric-card" aria-labelledby="nutrition-calcium-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-calcium-label">Calcium</p>
                <span class="metric-icon" aria-hidden="true">Ca</span>
              </div>
              <p class="metric-value"><strong data-nutrition="calcium">—</strong><span data-target="nutrition-calcium">/ — mg</span></p>
            </article>
            <article class="metric-card" aria-labelledby="nutrition-polyphenol-label">
              <div class="metric-heading">
                <p class="metric-label" id="nutrition-polyphenol-label">Polyphenols</p>
                <span class="metric-icon" aria-hidden="true">◆</span>
              </div>
              <p class="metric-value"><strong data-nutrition="polyphenol">—</strong><span data-target="nutrition-polyphenol">/ —</span></p>
            </article>
          </div>

          <article class="metric-card meal-breakdown-card" aria-labelledby="meal-breakdown-label">
            <p class="metric-label" id="meal-breakdown-label">Protein by meal</p>
            <dl class="meal-breakdown">
              <dt>Breakfast</dt><dd data-meal-protein="breakfast">— g</dd>
              <dt>Lunch</dt><dd data-meal-protein="lunch">— g</dd>
              <dt>Dinner</dt><dd data-meal-protein="dinner">— g</dd>
              <dt>Snack</dt><dd data-meal-protein="snack">— g</dd>
            </dl>
          </article>

          <article class="metric-card chart-card" aria-labelledby="protein-trend-label">
            <div class="metric-heading">
              <p class="metric-label" id="protein-trend-label">7-day protein trend</p>
              <span class="trend-badge" data-value="protein-trend">—</span>
            </div>
            <svg id="nutrition-protein-chart" class="line-chart" viewBox="0 0 320 120" preserveAspectRatio="none" role="img" aria-label="Protein trend over the last 7 days">
              <polygon data-role="area" points=""></polygon>
              <polyline data-role="line" points=""></polyline>
              <circle data-role="last-point" r="4" hidden></circle>
            </svg>
            <div id="nutrition-hit-strip" class="hit-strip" aria-label="Whether the protein target was met each day, last 7 days"></div>
          </article>

          <article class="metric-card chart-card" aria-labelledby="month-heatmap-label">
            <p class="metric-label" id="month-heatmap-label">30-day protein target consistency</p>
            <div id="nutrition-heatmap" class="heatmap-grid" aria-label="Whether the protein target was met each day, last 30 days"></div>
          </article>

          <button id="nutrition-chat-button" class="floating-chat-button" type="button" aria-label="Chat with Brisket">💬</button>
        </section>
```

- [ ] **Step 2: Confirm the HTML still parses and existing structure tests pass**

```bash
npm test -- --test-name-pattern="shell\|landmarks"
```
Expected: PASS (`tests/unit/web-assets.test.js`'s Home-shell structural tests should be unaffected since `#home-dashboard`/`#chat-view` still exist with their original ids and content).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 317.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Nutrition dashboard markup and the chat-view-home wrapper

Fulfils the DOM contract js/app/chat-panel.js documented as needed
(id=\"chat-view-home\") back when it was built with no UI to wire into yet."
```

---

### Task 6: Wire the Nutrition section and floating chat button into `app-controller.js`

**Files:**
- Modify: `js/app/app-controller.js`
- Modify: `tests/unit/app-controller.test.js`

- [ ] **Step 1: Update the existing "future navigation" test to use a still-unbuilt section**

`nutrition` is no longer a "future" placeholder after this task, so its test fixture must point at a section that still is. In `tests/unit/app-controller.test.js`, change:

```js
    this.futureNavigation = new FakeElement();
    this.futureNavigation.dataset.section = 'nutrition';
```

to:

```js
    this.futureNavigation = new FakeElement();
    this.futureNavigation.dataset.section = 'fitness';
```

(`fitness` remains a genuine placeholder — only `home`, `chat`, and now `nutrition` are real sections.)

- [ ] **Step 2: Add the new failing tests**

Append to `tests/unit/app-controller.test.js`, after the last existing test. First, extend the `harness()` function's `dependencies` object (around where `buildHomeModel`/`renderHome` are defined) to also supply the new dependencies — add these alongside the existing ones inside the `dependencies` object literal:

```js
    buildNutritionModel: input => ({ date: input.date, source: input, kind: 'nutrition' }),
    renderNutrition(documentRoot, model) {
      calls.nutritionRenders = (calls.nutritionRenders ?? 0) + 1;
      documentRoot.querySelector('#nutrition-dashboard').hidden = false;
    },
    agentColour: (agentsConfig, slug) => `#colour-for-${slug}`,
    chatPanel: {
      opens: [],
      closes: 0,
      open(slot, accentColour) {
        this.opens.push({ slot, accentColour });
      },
      close() {
        this.closes += 1;
      },
      isOpen() {
        return this.opens.length > this.closes;
      }
    }
```

Then add `['#nutrition-dashboard', new FakeElement({ hidden: true })]` and `['#nutrition-chat-button', new FakeElement()]` to `FakeDocument`'s `this.elements` map, alongside the existing entries (e.g. right after `['#home-dashboard', new FakeElement({ hidden: true })],`).

`app-controller.js` binds three distinct nav selectors (`[data-section]` for the generic/placeholder loop, plus `[data-section="chat"]`, `[data-section="home"]`, and now `[data-section="nutrition"]` for their dedicated handlers), so `FakeDocument` needs one fake element per real nav target, not just the existing `futureNavigation` fixture. Replace `FakeDocument`'s constructor and `querySelectorAll` method with this final form:

```js
class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
    this.elements = new Map([
      ['#sign-in-view', new FakeElement()],
      ['#app-shell', new FakeElement({ hidden: true })],
      ['#app', new FakeElement()],
      ['#sign-in-form', new FakeElement()],
      ['#passphrase-input', new FakeElement()],
      ['#sign-in-button', new FakeElement()],
      ['#sign-in-error', new FakeElement({ hidden: true })],
      ['#refresh-button', new FakeElement()],
      ['#sign-out-button', new FakeElement()],
      ['#last-synced', new FakeElement()],
      ['#provider-status', new FakeElement({ hidden: true })],
      ['#network-status', new FakeElement({ hidden: true })],
      ['#app-status', new FakeElement()],
      ['#home-dashboard', new FakeElement({ hidden: true })],
      ['#nutrition-dashboard', new FakeElement({ hidden: true })],
      ['#nutrition-chat-button', new FakeElement()],
      ['#unavailable-panel', new FakeElement({ hidden: true })],
      ['#retry-button', new FakeElement()]
    ]);
    this.futureNavigation = new FakeElement();
    this.futureNavigation.dataset.section = 'fitness';
    this.nutritionNavigation = new FakeElement();
    this.nutritionNavigation.dataset.section = 'nutrition';
    this.chatNavigation = new FakeElement();
    this.chatNavigation.dataset.section = 'chat';
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-section]') return [this.futureNavigation, this.nutritionNavigation, this.chatNavigation];
    if (selector === '[data-section="nutrition"]') return [this.nutritionNavigation];
    if (selector === '[data-section="chat"]') return [this.chatNavigation];
    return [];
  }
}
```

(This changes only the two `FakeDocument` members shown — the rest of the test file, including every other existing test, is unaffected. Note `[data-section="home"]` deliberately returns `[]` here just as it already implicitly did before this change, since no existing test exercises clicking a Home nav element in this harness — `showSection('home')` is already reached indirectly via `showAuthenticated()`.)

Then add `chatPanelCalls` to what `harness()` returns, so tests can reach the fake chat panel's recorded calls — in the `return { root, calls, ... }` object at the end of `harness()`, add `chatPanelCalls: dependencies.chatPanel,`.

Finally, add the tests themselves:

```js
test('clicking the Nutrition nav item shows the dashboard and builds/renders it from the latest loaded sync data', async () => {
  const state = harness();
  await state.controller.start();

  state.root.nutritionNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.root.querySelector('#nutrition-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.calls.nutritionRenders, 1);
});

test('getCurrentSection reflects the most recently shown section', async () => {
  const state = harness();
  await state.controller.start();
  assert.equal(state.controller.getCurrentSection(), 'home');

  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.controller.getCurrentSection(), 'nutrition');
});

test('the floating chat button opens the chat panel into the Nutrition section, themed with Brisket\'s colour', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#nutrition-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.opens[0].slot, state.root.querySelector('#nutrition-dashboard'));
  assert.equal(state.chatPanelCalls.opens[0].accentColour, '#colour-for-brisket');
});

test('clicking the floating chat button again closes an already-open panel', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  const button = state.root.querySelector('#nutrition-chat-button');
  button.dispatchEvent(new Event('click'));

  button.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.closes, 1);
});

test('navigating to Chat closes an open overlay panel and returns the chat view to its home slot', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  state.root.querySelector('#nutrition-chat-button').dispatchEvent(new Event('click'));
  assert.equal(state.chatPanelCalls.opens.length, 1);

  state.root.chatNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.closes, 1);
  assert.equal(state.controller.getCurrentSection(), 'chat');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test -- --test-name-pattern="Nutrition\|nutrition\|getCurrentSection\|floating chat button\|overlay panel"
```
Expected: FAIL — `app-controller.js` doesn't yet accept `buildNutritionModel`/`renderNutrition`/`agentColour`/`chatPanel`, doesn't expose `getCurrentSection`, and still routes `nutrition` clicks to the generic placeholder handler.

- [ ] **Step 4: Update `js/app/app-controller.js`**

Change the destructured dependencies (near the top of `createAppController`) from:

```js
  const {
    root,
    sessionApi,
    cache,
    loadLive,
    loadCached,
    buildHomeModel,
    renderHome,
    renderWarnings,
    renderUnavailable,
    windowTarget = window,
    documentTarget = document,
    navigatorTarget = navigator,
    sessionStorage,
    localStorage,
    now = () => new Date(),
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = dependencies ?? {};
```

to:

```js
  const {
    root,
    sessionApi,
    cache,
    loadLive,
    loadCached,
    buildHomeModel,
    renderHome,
    renderWarnings,
    renderUnavailable,
    buildNutritionModel,
    renderNutrition,
    agentColour,
    chatPanel,
    windowTarget = window,
    documentTarget = document,
    navigatorTarget = navigator,
    sessionStorage,
    localStorage,
    now = () => new Date(),
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = dependencies ?? {};
```

Add two new closure variables right after the existing `let authenticated = false;` block (alongside `rendered`, `activeRefresh`, etc.):

```js
  let latestResult = null;
  let currentSection = 'home';
```

Change the nav-binding loop that currently routes everything except `home`/`chat` to a generic placeholder:

```js
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    const target = button.dataset.section;
    if (target === 'home' || target === 'chat') continue;
    bind(button, 'click', () => {
      setStatus('This section arrives in a later Life Hub phase.');
      showProvider('This section arrives in a later Life Hub phase.', 'info');
    });
  }
  for (const button of root.querySelectorAll?.('[data-section="chat"]') ?? []) {
    bind(button, 'click', () => showSection('chat'));
  }
  for (const button of root.querySelectorAll?.('[data-section="home"]') ?? []) {
    bind(button, 'click', () => showSection('home'));
  }
```

to:

```js
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    const target = button.dataset.section;
    if (target === 'home' || target === 'chat' || target === 'nutrition') continue;
    bind(button, 'click', () => {
      setStatus('This section arrives in a later Life Hub phase.');
      showProvider('This section arrives in a later Life Hub phase.', 'info');
    });
  }
  for (const button of root.querySelectorAll?.('[data-section="chat"]') ?? []) {
    bind(button, 'click', () => showSection('chat'));
  }
  for (const button of root.querySelectorAll?.('[data-section="home"]') ?? []) {
    bind(button, 'click', () => showSection('home'));
  }
  for (const button of root.querySelectorAll?.('[data-section="nutrition"]') ?? []) {
    bind(button, 'click', () => showSection('nutrition'));
  }
  bind(root.querySelector('#nutrition-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#nutrition-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, 'brisket'));
  });
```

**Important CSS-scoping note for this button:** `chatPanel.open()` sets the `--agent-accent` custom property on `#chat-view` itself (per `js/app/chat-panel.js`, already merged). CSS custom properties only inherit to *descendants* of the element they're set on — `#nutrition-chat-button` is a *sibling* of `#chat-view` inside `#nutrition-dashboard`, not a descendant, so it cannot see that value through inheritance. The button must have `--agent-accent` set on itself directly. This is done in `renderNutritionSection()` below (so the button is themed as soon as Nutrition is shown, before it's ever clicked), not in the click handler above.

Add a `SECTION_TITLES` entry (find the existing `const SECTION_TITLES = { home: ..., chat: ... };` block) — change it to:

```js
  const SECTION_TITLES = {
    home: { eyebrow: 'Your day at a glance', title: 'Home' },
    chat: { eyebrow: 'Life Hub', title: 'Chat' },
    nutrition: { eyebrow: 'Nutrition', title: 'Nutrition' }
  };
```

Replace the `showSection` function entirely:

```js
  function showSection(name) {
    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    const nutrition = root.querySelector('#nutrition-dashboard');
    if (home) home.hidden = name !== 'home';
    if (nutrition) nutrition.hidden = name !== 'nutrition';
    if (name === 'chat') {
      if (chatPanel?.isOpen()) chatPanel.close();
      if (chat) chat.hidden = false;
    } else if (chat && !chatPanel?.isOpen()) {
      chat.hidden = true;
    }
    currentSection = name;
    if (name === 'nutrition') renderNutritionSection();
    for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
      const active = button.dataset.section === name;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const titles = SECTION_TITLES[name];
    if (titles) {
      const eyebrow = root.querySelector('#page-eyebrow');
      const title = root.querySelector('#page-title');
      if (eyebrow) eyebrow.textContent = titles.eyebrow;
      if (title) title.textContent = titles.title;
    }
  }

  function renderNutritionSection() {
    if (!latestResult || !buildNutritionModel || !renderNutrition) return;
    renderNutrition(root, buildNutritionModel(latestResult));
    const button = root.querySelector('#nutrition-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, 'brisket'));
  }
```

In `performRefresh`, capture the latest result right after it's fetched. Find:

```js
  async function performRefresh({ signal, version }) {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadLive({ date, signal });
      if (!isCurrentRefresh(version, signal) || !requireUnexpiredSession()) return;
      if (!rendered || result.changed === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
      }
```

and change it to:

```js
  async function performRefresh({ signal, version }) {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadLive({ date, signal });
      if (!isCurrentRefresh(version, signal) || !requireUnexpiredSession()) return;
      latestResult = { ...result, date };
      if (!rendered || result.changed === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
        if (currentSection === 'nutrition') renderNutritionSection();
      }
```

(The rest of `performRefresh` — warnings, freshness handling, the `catch` block — is unchanged.)

Do the same in `showOfflineCache`. Find:

```js
  async function showOfflineCache(version) {
    try {
      if (!requireUnexpiredSession()) return;
      const date = getSydneyDateKey(currentDate());
      const result = await loadCached({ date });
      if (!isCurrentLifecycle(version) || !requireUnexpiredSession()) return;
      const model = buildHomeModel({ ...result, date });
      renderHome(root, model);
```

and change it to:

```js
  async function showOfflineCache(version) {
    try {
      if (!requireUnexpiredSession()) return;
      const date = getSydneyDateKey(currentDate());
      const result = await loadCached({ date });
      if (!isCurrentLifecycle(version) || !requireUnexpiredSession()) return;
      latestResult = { ...result, date };
      const model = buildHomeModel({ ...result, date });
      renderHome(root, model);
```

Finally, expose `getCurrentSection` from the returned object. Find:

```js
  return { start, refresh, signIn, signOut, destroy };
```

and change it to:

```js
  return { start, refresh, signIn, signOut, destroy, getCurrentSection: () => currentSection };
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- --test-name-pattern="Nutrition\|nutrition\|getCurrentSection\|floating chat button\|overlay panel\|future navigation"
```
Expected: PASS, including the updated "future navigation" test and all 5 new tests.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```
Expected: PASS, 322 (317 + 5 new tests; the "future navigation" test was modified, not added).

- [ ] **Step 7: Commit**

```bash
git add js/app/app-controller.js tests/unit/app-controller.test.js
git commit -m "feat: wire the Nutrition section and its floating chat button into app-controller.js

Retains the latest sync result so Nutrition can be built/rendered on
demand without a new fetch. showSection no longer blindly hides #chat-view
when navigating away -- it only manages the chat view's own visibility
when the panel isn't currently open as an overlay elsewhere, since the
panel's hosting section already controls its visibility via the
hidden-attribute cascade."
```

---

### Task 7: Wire `main.js`

**Files:**
- Modify: `js/app/main.js`

- [ ] **Step 1: Update `js/app/main.js`**

Add three imports alongside the existing ones:

```js
import { agentColour } from './agent-colour.js';
import { createChatPanelController } from './chat-panel.js';
import { buildNutritionModel } from './nutrition-model.js';
import { renderNutrition } from './render-nutrition.js';
```

Change the `createAppController` call from:

```js
const controller = createAppController({
  root: document,
  sessionApi,
  cache,
  loadLive,
  loadCached,
  buildHomeModel,
  renderHome,
  renderWarnings,
  renderUnavailable,
  sessionStorage,
  localStorage
});

controller.start();

const chatApi = createChatApi(fetchImpl);
createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true })
});
```

to:

```js
const chatPanel = createChatPanelController({ root: document });

const controller = createAppController({
  root: document,
  sessionApi,
  cache,
  loadLive,
  loadCached,
  buildHomeModel,
  renderHome,
  renderWarnings,
  renderUnavailable,
  buildNutritionModel,
  renderNutrition,
  agentColour,
  chatPanel,
  sessionStorage,
  localStorage
});

controller.start();

const chatApi = createChatApi(fetchImpl);
createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true }),
  getDefaultAgentSlug: () => (controller.getCurrentSection() === 'nutrition' ? 'brisket' : undefined)
});
```

- [ ] **Step 2: Confirm it imports cleanly**

```bash
node -e "import('./js/app/main.js')" 2>&1 | head -5
```
Expected: fails only on `document is not defined` (this module assumes a browser environment) — confirm there is no *import resolution* error (a missing-module or syntax error), which is the thing this check is actually verifying.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 322 (`main.js` itself has no dedicated unit test; it's covered by the browser acceptance suite).

- [ ] **Step 4: Commit**

```bash
git add js/app/main.js
git commit -m "feat: wire chat-panel, agent-colour, and the Nutrition model/renderer into main.js

Nutrition's embedded chat now defaults to Brisket whenever the Nutrition
tab is the current section and nothing is already sticky from a real
recent exchange."
```

---

### Task 8: Service worker precache

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: Add the 3 new client modules and bump the cache name**

In `service-worker.js`, change:

```js
const CACHE_NAME = 'life-hub-shell-v14';
```

to:

```js
const CACHE_NAME = 'life-hub-shell-v15';
```

And in `SHELL_FILES`, add the three new modules (insert them alphabetically among the existing `js/app/...` entries, right after `'js/app/chat-controller.js',` and before `'js/app/render-chat.js',`):

```js
  'js/app/agent-colour.js',
  'js/app/chat-controller.js',
  'js/app/chat-panel.js',
  'js/app/nutrition-charts.js',
  'js/app/nutrition-model.js',
  'js/app/render-chat.js',
  'js/app/render-nutrition.js',
```

(Full context — the relevant slice of `SHELL_FILES` should read, in order: `'js/app/api-session.js', 'js/app/app-controller.js', 'js/app/agent-colour.js', 'js/app/chat-api.js', 'js/app/chat-controller.js', 'js/app/chat-panel.js', 'js/app/config.js', 'js/app/home-model.js', 'js/app/load-live-events.js', 'js/app/nutrition-charts.js', 'js/app/nutrition-model.js', 'js/app/render-chat.js', 'js/app/render-home.js', 'js/app/render-nutrition.js', 'js/app/repository-cache.js', 'js/app/sync-repository.js',` — insert the 4 new entries in alphabetical position among the existing ones rather than only at one spot, matching the file's existing alphabetical-ish ordering within the `js/app/` group.)

- [ ] **Step 2: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 322 (no test currently asserts on `PRECACHE_URLS` contents directly, per `docs/IMPLEMENTATION_STATUS.md`'s Phase 4 note that this exact omission caused an offline-reload regression once already — Task 9's browser test will exercise the real precache behavior).

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "chore: precache the Nutrition tab's client modules, bump shell cache to v15"
```

---

### Task 9: Browser acceptance test

**Files:**
- Create: `tests/browser/nutrition.spec.mjs`

- [ ] **Step 1: Write the test**

Model this on `tests/browser/home.spec.mjs`'s and `tests/browser/chat.spec.mjs`'s existing setup (same `before`/`after` server lifecycle, same sign-in helper pattern):

```js
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';

let browser;
let server;
let baseUrl;

before(async () => {
  server = createStaticServer({
    root: new URL('../../dist/', import.meta.url),
    apiRoot: new URL('../..', import.meta.url)
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function signIn(page) {
  await page.clock.setFixedTime(new Date('2026-07-30T12:00:00+10:00'));
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#passphrase-input').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

test('the Nutrition tab renders today\'s macros from the fixture repository', async () => {
  const page = await browser.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.equal(await page.locator('[data-nutrition="calories"]').textContent(), '1,130');
    assert.equal(await page.locator('[data-nutrition="protein"]').textContent(), '80 g');
    assert.equal(await page.locator('[data-meal-protein="breakfast"]').textContent(), '38 g');
    assert.equal(await page.locator('[data-meal-protein="lunch"]').textContent(), '42 g');

    const heatmapTiles = page.locator('#nutrition-heatmap .heatmap-tile');
    assert.equal(await heatmapTiles.count(), 30);
  } finally {
    await page.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Brisket\'s colour', async () => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#F0B843');

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view').waitFor({ state: 'hidden' });
  } finally {
    await page.close();
  }
});
```

- [ ] **Step 2: Register the new spec in the browser test script**

In `package.json`, change:

```json
    "test:browser": "node --test --test-concurrency=1 tests/browser/home.spec.mjs tests/browser/chat.spec.mjs",
```

to:

```json
    "test:browser": "node --test --test-concurrency=1 tests/browser/home.spec.mjs tests/browser/chat.spec.mjs tests/browser/nutrition.spec.mjs",
```

- [ ] **Step 3: Run the browser suite**

```bash
npx playwright install chromium
npm run test:browser
```
Expected: PASS, all browser tests including the 2 new ones (13 previously documented + 2 new = 15).

- [ ] **Step 4: Run the full unit/integration suite one more time**

```bash
npm test
```
Expected: PASS, 322.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/nutrition.spec.mjs package.json
git commit -m "test: add browser acceptance coverage for the Nutrition tab and its chat panel"
```

---

## Final verification

- [ ] **Run everything one more time and confirm a clean, fully green state:**

```bash
npm test
npm run validate:fixtures
npm audit --audit-level=high
npx playwright install chromium
npm run test:browser
git status --porcelain
```

Expected: 322 unit/integration tests passing, 4 valid fixtures, 0 vulnerabilities, 15 browser tests passing, clean working tree.

- [ ] **Update `docs/IMPLEMENTATION_STATUS.md`** with a dated "Phase 6: Nutrition Tab — Complete" entry following the existing format (see Phase 5's entry for the shared-infrastructure branch as a template), recording the final test counts above, and update the "Next Phase" line to point at Central Node.
