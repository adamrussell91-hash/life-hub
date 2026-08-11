# Nutrition Dashboard Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Nutrition charts readable and self-explanatory: larger heatmap numbers, a labeled week-vs-prior sparkline, energy+carbs side-by-side, today’s protein pie in the micronutrient row, and on-chart guide labels (no fake hit-strip selector).

**Architecture:** Surgical updates to `aggregateNutrition` / `buildNutritionModel`, `render-nutrition.js`, `index.html`, and CSS. Add a small SVG pie helper; reuse `buildAreaLine` for carbs and the week-compare sparkline. No new interactivity.

**Tech Stack:** Vanilla JS PWA, SVG chart-kit, `node:test`, existing nutrition unit tests.

**Spec:** `docs/superpowers/specs/2026-08-11-nutrition-dashboard-clarity-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/core/aggregate.js` | Add `carbs_g` to daily nutrition totals |
| `js/app/nutrition-model.js` | Pass `carbs_g` through `dailyNutrition` / week series |
| `js/app/chart-kit/pie.js` | Pure helper: pie segment arcs + legend data from meal protein |
| `js/app/render-nutrition.js` | Pie card, carbs chart, week-compare rewrite, hit-strip removal, guide labels |
| `index.html` | 4-up micronutrient row with pie; energy+carbs pair; remove hit strip + old meal card |
| `css/app.css` | 4-col grid, heatmap font, pie styles, week-compare summary, guide label styles |
| `tests/unit/aggregate.test.js` | Assert `carbs_g` in aggregate output |
| `tests/unit/nutrition-layout.test.js` | Assert pie card in grid; no standalone meal-breakdown-card; carbs chart present |
| `tests/unit/render-nutrition-meals.test.js` | Retarget meal breakdown tests to pie renderer |
| `tests/unit/chart-kit-pie.test.js` | Pie geometry + empty-state helper tests |
| `service-worker.js` | Bump `life-hub-shell-v60` → `v61` |

---

### Task 1: Aggregate + model — `carbs_g`

**Files:**
- Modify: `js/core/aggregate.js`
- Modify: `js/app/nutrition-model.js`
- Test: `tests/unit/aggregate.test.js`

- [ ] **Step 1: Write the failing assertions**

In `tests/unit/aggregate.test.js`, add `carbs_g` to both fixture meals and expected totals:

```js
const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, carbs_g: 48, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, carbs_g: 52, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  // ... workouts/diary unchanged
];

assert.deepEqual(aggregateNutrition(events, '2026-07-30'), {
  calories: 1130,
  protein_g: 80,
  fat_g: 27,
  carbs_g: 100,
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
```

And in the sparse empty case:

```js
assert.deepEqual(aggregateNutrition(sparse, '2026-07-31'), {
  calories: 0,
  protein_g: 0,
  fat_g: 0,
  carbs_g: 0,
  sodium_mg: 0,
  calcium_mg: 0,
  polyphenol_score: 0,
  meals: { /* unchanged zeros */ }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/aggregate.test.js`

Expected: FAIL — expected object has `carbs_g`, actual does not.

- [ ] **Step 3: Implement aggregate + model**

In `js/core/aggregate.js` `aggregateNutrition` return object, add:

```js
carbs_g: sum(meals, 'carbs_g'),
```

In `js/app/nutrition-model.js` `dailyNutrition`, add:

```js
carbs_g: nutrition.carbs_g,
```

(next to `calories` / `protein_g` / `fat_g`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/aggregate.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/aggregate.js js/app/nutrition-model.js tests/unit/aggregate.test.js
git commit -m "$(cat <<'EOF'
feat(nutrition): aggregate daily carbs_g for week charts

EOF
)"
```

---

### Task 2: Pie chart helper

**Files:**
- Create: `js/app/chart-kit/pie.js`
- Create: `tests/unit/chart-kit-pie.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/chart-kit-pie.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMealProteinPie } from '../../js/app/chart-kit/pie.js';

test('buildMealProteinPie returns empty when all meal protein is zero', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 0 },
    lunch: { protein_g: 0 },
    dinner: { protein_g: 0 },
    snack: { protein_g: 0 }
  });
  assert.equal(pie.empty, true);
  assert.equal(pie.total, 0);
  assert.equal(pie.slices.length, 0);
});

test('buildMealProteinPie builds slices with paths, colours, and labels', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 30 },
    lunch: { protein_g: 40 },
    dinner: { protein_g: 30 },
    snack: { protein_g: 0 }
  }, { size: 72 });
  assert.equal(pie.empty, false);
  assert.equal(pie.total, 100);
  assert.equal(pie.slices.length, 3);
  assert.equal(pie.slices[0].meal, 'breakfast');
  assert.equal(pie.slices[0].value, 30);
  assert.match(pie.slices[0].path, /^M /);
  assert.ok(pie.slices[0].colour);
  assert.equal(pie.slices[1].meal, 'lunch');
  assert.equal(pie.slices[2].meal, 'dinner');
});

test('single meal becomes a full circle path', () => {
  const pie = buildMealProteinPie({
    breakfast: { protein_g: 0 },
    lunch: { protein_g: 0 },
    dinner: { protein_g: 55 },
    snack: { protein_g: 0 }
  });
  assert.equal(pie.slices.length, 1);
  assert.equal(pie.slices[0].meal, 'dinner');
  assert.equal(pie.total, 55);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chart-kit-pie.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildMealProteinPie`**

Create `js/app/chart-kit/pie.js`:

```js
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLOURS = {
  breakfast: 'color-mix(in srgb, var(--wave) 35%, white)',
  lunch: 'color-mix(in srgb, var(--wave) 55%, white)',
  dinner: 'var(--wave)',
  snack: 'var(--high-sea)'
};
const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};

function polar(cx, cy, r, angleRad) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad)
  };
}

function slicePath(cx, cy, r, startAngle, endAngle) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  // Full circle: SVG arc with identical endpoints collapses — use two semicircles
  if (Math.abs(endAngle - startAngle) >= 2 * Math.PI - 1e-6) {
    const mid = polar(cx, cy, r, startAngle + Math.PI);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y} Z`;
  }
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

/**
 * @param {Record<string, { protein_g?: number }>} meals
 * @param {{ size?: number }} [options]
 */
export function buildMealProteinPie(meals, { size = 72 } = {}) {
  const entries = MEAL_ORDER
    .map(meal => ({
      meal,
      label: MEAL_LABELS[meal],
      value: Number(meals?.[meal]?.protein_g) || 0,
      colour: MEAL_COLOURS[meal]
    }))
    .filter(entry => entry.value > 0);

  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) {
    return { empty: true, total: 0, size, center: size / 2, radius: size / 2 - 4, slices: [] };
  }

  const center = size / 2;
  const radius = size / 2 - 4;
  // Start at 12 o'clock
  let angle = -Math.PI / 2;
  const slices = entries.map(entry => {
    const sweep = (entry.value / total) * 2 * Math.PI;
    const startAngle = angle;
    const endAngle = angle + sweep;
    angle = endAngle;
    return {
      ...entry,
      path: slicePath(center, center, radius, startAngle, endAngle)
    };
  });

  return { empty: false, total, size, center, radius, slices };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/chart-kit-pie.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/pie.js tests/unit/chart-kit-pie.test.js
git commit -m "$(cat <<'EOF'
feat(chart-kit): add meal protein pie geometry helper

EOF
)"
```

---

### Task 3: Markup — 4-up pie card, energy+carbs pair, remove dead UI

**Files:**
- Modify: `index.html` (nutrition dashboard section ~285–390)
- Modify: `tests/unit/nutrition-layout.test.js`

- [ ] **Step 1: Update layout tests first**

Replace `tests/unit/nutrition-layout.test.js` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function nutritionDashboardMarkup() {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="nutrition-dashboard"');
  assert.ok(start >= 0);
  const end = html.indexOf('id="fitness-dashboard"', start);
  assert.ok(end > start);
  return html.slice(start, end);
}

test('nutrition-grid includes Sodium, Calcium, Polyphenols, and Protein by meal pie', async () => {
  const dash = await nutritionDashboardMarkup();
  const gridStart = dash.indexOf('<div class="nutrition-grid">');
  const gridEnd = dash.indexOf('</div>', dash.indexOf('nutrition-polyphenol-label'));
  // Prefer structural asserts on whole dashboard:
  assert.match(dash, /data-nutrition-ring="sodium"/);
  assert.match(dash, /data-nutrition-ring="calcium"/);
  assert.match(dash, /data-nutrition="polyphenol"/);
  assert.match(dash, /id="nutrition-meal-protein-pie"/);
  assert.match(dash, /Protein by meal/);
  assert.doesNotMatch(dash, /class="meal-breakdown-card"/);
  assert.doesNotMatch(dash, /class="meal-breakdown"/);
});

test('protein and fat week charts sit in a pair; energy and carbs sit in a pair', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /id="nutrition-protein-chart"/);
  assert.match(dash, /id="nutrition-fat-chart"/);
  assert.match(dash, /id="nutrition-calories-chart"/);
  assert.match(dash, /id="nutrition-carbs-chart"/);
  assert.doesNotMatch(dash, /id="nutrition-hit-strip"/);
  assert.match(dash, /nutrition-week-charts/);
  assert.match(dash, /class="nutrition-week-charts nutrition-week-charts--macros"/); // protein|fat
  assert.match(dash, /class="nutrition-week-charts nutrition-week-charts--energy"/); // energy|carbs
});

test('week compare exposes summary slots and sparkline host', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /data-value="week-compare-this"/);
  assert.match(dash, /data-value="week-compare-prior"/);
  assert.match(dash, /data-value="week-compare-delta"/);
  assert.match(dash, /id="nutrition-week-compare"/);
  assert.match(dash, /data-role="value-labels"/); // sparkline labels live in SVG
});

test('the macro split hero remains intact', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /id="nutrition-macro-split"/);
  assert.match(dash, /data-split="protein"/);
  assert.match(dash, /data-split="fat"/);
  assert.match(dash, /data-split="energy"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/nutrition-layout.test.js`

Expected: FAIL — pie / carbs / week-compare summary markup missing.

- [ ] **Step 3: Update `index.html`**

Inside `.nutrition-grid`, after the Polyphenols article, add:

```html
<article class="metric-card" aria-labelledby="nutrition-meal-protein-label">
  <div class="metric-heading">
    <p class="metric-label" id="nutrition-meal-protein-label">Protein by meal</p>
  </div>
  <p data-meal-protein-empty class="metric-caption" hidden>No meals logged yet.</p>
  <div class="meal-protein-pie-wrap">
    <svg id="nutrition-meal-protein-pie" class="meal-protein-pie" viewBox="0 0 72 72" role="img" aria-label="Today protein by meal">
      <g data-role="slices"></g>
    </svg>
    <ul class="meal-protein-legend" data-role="meal-protein-legend"></ul>
  </div>
</article>
```

Delete the standalone:

```html
<article class="metric-card meal-breakdown-card" ...>...</article>
```

Change the protein/fat wrapper to:

```html
<div class="nutrition-week-charts nutrition-week-charts--macros">
```

Inside the protein card:

- Remove `#nutrition-hit-strip` entirely.
- Keep the caption for now (guide labels come in Task 5; caption can stay as secondary backup or be shortened later).

Replace the full-width calories article with a second pair:

```html
<div class="nutrition-week-charts nutrition-week-charts--energy">
  <article class="metric-card chart-card" aria-labelledby="calories-trend-label">
    <p class="metric-label" id="calories-trend-label">7-day energy</p>
    <svg id="nutrition-calories-chart" class="line-chart line-chart--dense" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Calorie trend over the last 7 days">
      <path data-role="area" d=""></path>
      <path data-role="line" d=""></path>
      <g data-role="value-labels"></g>
      <g data-role="day-labels"></g>
    </svg>
  </article>

  <article class="metric-card chart-card" aria-labelledby="carbs-trend-label">
    <p class="metric-label" id="carbs-trend-label">7-day carbs</p>
    <svg id="nutrition-carbs-chart" class="line-chart line-chart--dense" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carb trend over the last 7 days">
      <path data-role="area" d=""></path>
      <path data-role="line" d=""></path>
      <g data-role="value-labels"></g>
      <g data-role="day-labels"></g>
    </svg>
  </article>
</div>
```

Replace the week-compare card body with:

```html
<article class="metric-card chart-card" aria-labelledby="week-compare-label">
  <p class="metric-label" id="week-compare-label">This week vs prior</p>
  <div class="week-compare-summary">
    <div>
      <p class="metric-caption">This week avg</p>
      <p class="week-compare-value"><strong data-value="week-compare-this">—</strong> g</p>
    </div>
    <div>
      <p class="metric-caption">Prior week avg</p>
      <p class="week-compare-value"><strong data-value="week-compare-prior">—</strong> g</p>
    </div>
    <span class="trend-badge" data-value="week-compare-delta">—</span>
  </div>
  <svg id="nutrition-week-compare" class="line-chart line-chart--dense" viewBox="0 0 320 72" preserveAspectRatio="xMidYMid meet" role="img" aria-label="This week daily protein">
    <path data-role="area" d=""></path>
    <path data-role="line" d=""></path>
    <g data-role="value-labels"></g>
    <g data-role="day-labels"></g>
  </svg>
</article>
```

- [ ] **Step 4: Run layout tests**

Run: `node --test tests/unit/nutrition-layout.test.js`

Expected: PASS (markup only; render wiring is Task 4–5).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/nutrition-layout.test.js
git commit -m "$(cat <<'EOF'
feat(nutrition): restructure dashboard markup for clarity cards

EOF
)"
```

---

### Task 4: Render — pie card + carbs chart; retire old meal breakdown

**Files:**
- Modify: `js/app/render-nutrition.js`
- Modify: `tests/unit/render-nutrition-meals.test.js`
- Modify: `css/app.css`

- [ ] **Step 1: Rewrite meal render tests for the pie**

Replace `tests/unit/render-nutrition-meals.test.js` contents with tests against a new exported `renderMealProteinPie`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMealProteinPie } from '../../js/app/render-nutrition.js';

function makeRoot() {
  const empty = { hidden: true, removeAttribute(name) { if (name === 'hidden') this.hidden = false; }, setAttribute(name) { if (name === 'hidden') this.hidden = true; } };
  const slices = { replaceChildren(...nodes) { this.children = nodes; }, children: [] };
  const legend = { replaceChildren(...nodes) { this.children = nodes; }, children: [] };
  const svg = {
    querySelector(sel) {
      if (sel === '[data-role="slices"]') return slices;
      return null;
    },
    setAttribute() {}
  };
  const created = [];
  return {
    empty,
    slices,
    legend,
    created,
    querySelector(sel) {
      if (sel === '#nutrition-meal-protein-pie') return svg;
      if (sel === '[data-meal-protein-empty]') return empty;
      if (sel === '[data-role="meal-protein-legend"]') return legend;
      return null;
    },
    createElementNS(_ns, tag) {
      const el = { tag, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
      created.push(el);
      return el;
    },
    createElement(tag) {
      const el = { tag, textContent: '', children: [], append(...nodes) { this.children.push(...nodes); } };
      created.push(el);
      return el;
    }
  };
}

test('renderMealProteinPie shows empty state when no protein', () => {
  const root = makeRoot();
  renderMealProteinPie(root, {
    breakfast: { protein_g: 0 }, lunch: { protein_g: 0 }, dinner: { protein_g: 0 }, snack: { protein_g: 0 }
  });
  assert.equal(root.empty.hidden, false);
  assert.equal(root.slices.children.length, 0);
});

test('renderMealProteinPie draws slices and legend for meals with protein', () => {
  const root = makeRoot();
  renderMealProteinPie(root, {
    breakfast: { protein_g: 30 }, lunch: { protein_g: 40 }, dinner: { protein_g: 0 }, snack: { protein_g: 0 }
  });
  assert.equal(root.empty.hidden, true);
  assert.equal(root.slices.children.length, 2);
  assert.equal(root.legend.children.length, 2);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `node --test tests/unit/render-nutrition-meals.test.js`

Expected: FAIL — `renderMealProteinPie` not exported.

- [ ] **Step 3: Implement render + CSS**

In `js/app/render-nutrition.js`:

1. Import `buildMealProteinPie` from `./chart-kit/pie.js`.
2. Replace `renderMealBreakdown(...)` call with `renderMealProteinPie(root, model.nutrition.meals)`.
3. Add:

```js
export function renderMealProteinPie(root, meals) {
  const svg = root.querySelector('#nutrition-meal-protein-pie');
  const empty = root.querySelector('[data-meal-protein-empty]');
  const legend = root.querySelector('[data-role="meal-protein-legend"]');
  if (!svg) return;

  const pie = buildMealProteinPie(meals, { size: 72 });
  const sliceGroup = svg.querySelector('[data-role="slices"]');
  sliceGroup?.replaceChildren?.();
  legend?.replaceChildren?.();

  if (pie.empty) {
    empty?.removeAttribute?.('hidden');
    svg.setAttribute('hidden', '');
    return;
  }

  empty?.setAttribute?.('hidden', '');
  svg.removeAttribute('hidden');
  svg.setAttribute('viewBox', `0 0 ${pie.size} ${pie.size}`);

  for (const slice of pie.slices) {
    const path = root.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', slice.path);
    path.setAttribute('fill', slice.colour);
    path.setAttribute('data-meal', slice.meal);
    sliceGroup.append(path);

    const li = root.createElement('li');
    const swatch = root.createElement('span');
    swatch.className = 'meal-protein-swatch';
    swatch.style.background = slice.colour;
    const label = root.createElement('span');
    label.textContent = `${slice.label} ${Math.round(slice.value)} g`;
    li.append(swatch, label);
    legend.append(li);
  }
}
```

4. Delete `renderMealBreakdown` (or keep temporarily re-exporting as alias only if something else imports it — currently only tests + renderNutrition; remove export).
5. In `renderNutrition`, after fat chart, add:

```js
renderNamedAreaChart(root, '#nutrition-carbs-chart', model.week, 'carbs_g', {
  valueLabels: true
});
```

6. Remove `renderHitStrip(root, model.week)` and delete `renderHitStrip` function.

CSS in `css/app.css`:

```css
.nutrition-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-grid); }

@media (max-width: 1869px) {
  .nutrition-grid { grid-template-columns: 1fr 1fr; }
}

.meal-protein-pie-wrap {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.5rem;
}
.meal-protein-pie { width: 4.5rem; height: 4.5rem; }
.meal-protein-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--depth);
}
.meal-protein-legend li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.meal-protein-swatch {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 0.15rem;
  flex: 0 0 auto;
}

/* Remove or leave unused .meal-breakdown / .hit-strip rules; prefer delete dead CSS */
```

Also bump heatmap font:

```css
.heatmap-tile--protein {
  /* keep other props */
  font-size: 0.9rem;
}
```

Ensure existing `@media` that set `.nutrition-grid { grid-template-columns: 1fr 1fr; }` still makes sense (4 cards → 2×2).

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/unit/render-nutrition-meals.test.js tests/unit/chart-kit-pie.test.js tests/unit/nutrition-layout.test.js tests/unit/aggregate.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/render-nutrition.js css/app.css tests/unit/render-nutrition-meals.test.js
git commit -m "$(cat <<'EOF'
feat(nutrition): render today protein pie and carbs week chart

EOF
)"
```

---

### Task 5: Guide-line labels + week-vs-prior sparkline

**Files:**
- Modify: `js/app/render-nutrition.js`
- Modify: `css/app.css`
- Modify: `index.html` (optional: add `<g data-role="guide-labels">` to protein/fat SVGs)

- [ ] **Step 1: Add guide label group to protein/fat SVGs in `index.html`**

Inside `#nutrition-protein-chart` and `#nutrition-fat-chart`, after the guide `<line>`, add:

```html
<g data-role="guide-labels"></g>
```

Protein still has rolling path; fat does not.

- [ ] **Step 2: Extend `renderNamedAreaChart` to paint guide + avg labels**

Add options: `guideLabel` (string|null), `rollingLabel` (string|null).

After positioning the guide line, also:

```js
const guideLabels = svg.querySelector('[data-role="guide-labels"]');
if (guideLabels) {
  guideLabels.replaceChildren();
  if (chart.guideY != null && guideLabel) {
    const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String((chart.points.at(-1)?.x ?? 310) - 2));
    text.setAttribute('y', String(Math.max(10, chart.guideY - 3)));
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('class', 'chart-guide-label');
    text.textContent = guideLabel;
    guideLabels.append(text);
  }
  if (rollingLabel && chart.rollingLinePath) {
    // Place near the last rolling mean point
    const last = chart.points.at(-1);
    if (last) {
      const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(last.x));
      // Prefer slightly above last point; if collide with guide, nudge
      text.setAttribute('y', String(Math.max(10, last.y - 12)));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('class', 'chart-guide-label chart-guide-label--avg');
      text.textContent = rollingLabel;
      guideLabels.append(text);
    }
  }
}
```

Call sites:

```js
renderNamedAreaChart(root, '#nutrition-protein-chart', model.week, 'protein_g', {
  rollingAverage: 3,
  guideValue: proteinGuide,
  valueLabels: true,
  guideLabel: 'goal',
  rollingLabel: 'avg'
});
renderNamedAreaChart(root, '#nutrition-fat-chart', model.week, 'fat_g', {
  markOverage: true,
  guideValue: fatGuide,
  valueLabels: true,
  guideLabel: 'ceiling'
});
```

Shorten/remove footer captions once labels exist (prefer remove “Dotted avg · dashed = protein goal” and “Dashed = fat ceiling” to avoid duplication).

- [ ] **Step 3: Rewrite `renderWeekCompare`**

```js
function renderWeekCompare(root, week, previousWeek = [], proteinTrend = null) {
  const avg = days => days.length === 0
    ? 0
    : days.reduce((sum, day) => sum + day.protein_g, 0) / days.length;

  const thisAvg = avg(week);
  const priorAvg = avg(previousWeek);

  setText(root, '[data-value="week-compare-this"]', thisAvg.toFixed(0));
  setText(root, '[data-value="week-compare-prior"]', priorAvg.toFixed(0));

  const badge = root.querySelector('[data-value="week-compare-delta"]');
  if (badge) {
    let label = proteinTrend?.label ?? '—';
    let colour = proteinTrend?.colour ?? 'neutral';
    if (priorAvg > 0) {
      const pct = ((thisAvg - priorAvg) / priorAvg) * 100;
      const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
      label = `${sign}${Math.abs(pct).toFixed(0)}%`;
      colour = pct === 0 ? 'neutral' : pct > 0 ? 'green' : 'red';
    } else if (!previousWeek.length) {
      label = 'no prior data';
      colour = 'neutral';
    }
    badge.textContent = label;
    if (badge.dataset) badge.dataset.colour = colour;
  }

  // Labeled sparkline of this week — reuse area chart renderer
  renderNamedAreaChart(root, '#nutrition-week-compare', week, 'protein_g', {
    valueLabels: true
  });
}
```

Update call site:

```js
renderWeekCompare(root, model.week, model.previousWeek, model.proteinTrend);
```

Remove unused `buildColumns` / `animateColumnGrow` imports if nothing else uses them in this file.

CSS:

```css
.week-compare-summary {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.75rem;
  align-items: end;
  margin: 0.5rem 0 0.75rem;
}
.week-compare-value {
  margin: 0;
  font-size: 1.25rem;
  color: var(--depth);
  font-variant-numeric: tabular-nums;
}
.chart-guide-label {
  fill: var(--muted);
  font-size: 8px;
  font-weight: 650;
}
```

- [ ] **Step 4: Manual sanity checklist (no browser automation required unless already set up)**

Open Nutrition tab locally and confirm:

1. Heatmap numbers larger
2. Pie appears in 4th micronutrient slot; empty day shows caption
3. Energy | carbs pair matches protein | fat sizing
4. Protein/fat show on-chart `avg`/`goal`/`ceiling` text; no hit strip
5. Week vs prior shows two avgs, % badge, labeled sparkline points + day letters

- [ ] **Step 5: Run full unit suite for nutrition-touched tests**

Run:

```bash
node --test tests/unit/aggregate.test.js tests/unit/chart-kit-pie.test.js tests/unit/nutrition-layout.test.js tests/unit/render-nutrition-meals.test.js tests/unit/nutrition-model.test.js
```

Expected: PASS (fix any `nutrition-model` expectations if they deep-equal daily objects without `carbs_g`).

- [ ] **Step 6: Commit**

```bash
git add index.html js/app/render-nutrition.js css/app.css
git commit -m "$(cat <<'EOF'
feat(nutrition): label guide lines and rewrite week-vs-prior sparkline

EOF
)"
```

---

### Task 6: Shell cache bump + final verification

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: Bump cache**

In `service-worker.js` line 1:

```js
const CACHE_NAME = 'life-hub-shell-v61';
```

- [ ] **Step 2: Run the full unit test suite**

Run: `npm test`

Expected: PASS. If any unrelated failures pre-exist, note them; do not expand scope.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache for nutrition dashboard clarity

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Heatmap larger numbers | Task 4 (CSS `0.9rem`) |
| Week vs prior → avgs + % + labeled sparkline | Task 3 markup, Task 5 render |
| Energy + carbs side-by-side | Task 1 data, Task 3 markup, Task 4 render |
| Protein by meal → today pie in 4-up row | Task 2 helper, Task 3 markup, Task 4 render |
| Remove old meal-breakdown card | Task 3 |
| Remove hit strip | Task 3 + Task 4 |
| On-chart guide labels (avg/goal/ceiling) | Task 5 |
| No new interactivity | All tasks |
| Shell cache bump | Task 6 |
