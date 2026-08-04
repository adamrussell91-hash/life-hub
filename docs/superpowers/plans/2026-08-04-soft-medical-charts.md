# Soft-Medical Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared soft-medical SVG chart kit and use it to give Home/Nutrition ring targets with fill-on-load animation, replace the protein trend end-circle with a soft area line, densify Nutrition into a maximal monitor (two slices), and turn Central Node’s Today’s Status into a live+prose hybrid — without changing agent write paths or pushing to GitHub unless Adam asks.

**Architecture:** Add `js/app/chart-kit/` with pure geometry (`ring.js`, `area-line.js`, `columns.js`) plus a tiny DOM helper (`animate.js`) for fill-on-load and `prefers-reduced-motion`. Existing models keep feeding numbers; `render-home.js` / `render-nutrition.js` / `render-central-node.js` switch markup to kit consumers. `nutrition-charts.js` and `central-node-charts.js` become thin re-exports or wrappers so callers migrate without a big-bang rename. Slice 1 is shippable alone; Slice 2 adds maximal Nutrition charts on the same kit.

**Tech Stack:** Vanilla ES modules (no chart library), `node:test` + `node:assert/strict`, Playwright browser specs, hand-rolled SVG + CSS tokens in `css/app.css`.

**Spec:** `docs/superpowers/specs/2026-08-04-soft-medical-charts-design.md`

**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks (Netlify token burn).

**Baseline:** Run `npm test` before Task 1 and keep it green between tasks.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/app/chart-kit/ring.js` | Pure ring geometry (`buildRingTarget`); over-target visual cap |
| `js/app/chart-kit/area-line.js` | Pure area/line geometry (`buildAreaLine`); no end marker; optional rolling-average polyline |
| `js/app/chart-kit/columns.js` | Pure column geometry (`buildColumns`) |
| `js/app/chart-kit/animate.js` | `prefersReducedMotion`, `animateRingFill`, `animateAreaReveal`, `animateColumnGrow` |
| `js/app/chart-kit/apply-ring.js` | DOM apply helper for a ring SVG shell (shared by Home/Nutrition/Central Node) |
| `tests/unit/chart-kit-ring.test.js` | Ring geometry tests |
| `tests/unit/chart-kit-area-line.test.js` | Area-line geometry tests |
| `tests/unit/chart-kit-columns.test.js` | Column geometry tests |
| `js/app/nutrition-charts.js` | Re-export/wrap `buildAreaLine` as `buildProteinLineChart` (compat; drop `last` usage) |
| `js/app/central-node-charts.js` | Re-export/wrap `buildRingTarget` as `buildCompletionRing` |
| `css/app.css` | Soft-medical tokens + ring/area/column/Status hybrid layout |
| `index.html` | Home rings; Nutrition rings + Slice 2 chart shells; Status hybrid markup; remove last-point circles |
| `js/app/render-home.js` | Apply rings + logging bar animation |
| `js/app/render-nutrition.js` | Apply macro rings, area charts, columns, dual-ring |
| `js/app/nutrition-model.js` | Slice 2 series: meal timing already present; week comparison series; rolling avg inputs |
| `js/app/central-node-model.js` | Add `liveStatus` |
| `js/app/render-central-node.js` | Hybrid Status render; week chart without end circle |
| `tests/unit/central-node-model.test.js` | Extend for `liveStatus` |
| `tests/unit/nutrition-model.test.js` | Extend for Slice 2 fields |
| `tests/unit/nutrition-charts.test.js` | Update expectations (no `last` required) |
| `service-worker.js` | Precache new kit modules; bump `CACHE_NAME` to `v18` |
| `tests/browser/home.spec.mjs` | Assert ring SVG present |
| `tests/browser/nutrition.spec.mjs` | Rings + no last-point |
| `tests/browser/central-node.spec.mjs` | Live checklist in Status |

---

## Phase A — Slice 1 (foundation)

### Task 1: Ring geometry kit

**Files:**
- Create: `js/app/chart-kit/ring.js`
- Create: `tests/unit/chart-kit-ring.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRingTarget } from '../../js/app/chart-kit/ring.js';

test('buildRingTarget maps complete/total into circumference and capped dashoffset', () => {
  const ring = buildRingTarget({ value: 1, target: 5 }, { size: 64, strokeWidth: 8 });
  assert.equal(ring.size, 64);
  assert.equal(ring.strokeWidth, 8);
  assert.equal(ring.center, 32);
  assert.equal(ring.radius, 28);
  assert.ok(Math.abs(ring.circumference - (2 * Math.PI * 28)) < 1e-9);
  assert.ok(Math.abs(ring.dashoffset - ring.circumference * 0.8) < 1e-9);
  assert.equal(ring.fraction, 0.2);
});

test('over-target values cap visual fraction at 1 but expose raw value', () => {
  const ring = buildRingTarget({ value: 150, target: 100 }, { size: 72, strokeWidth: 7 });
  assert.equal(ring.fraction, 1);
  assert.equal(ring.dashoffset, 0);
  assert.equal(ring.value, 150);
  assert.equal(ring.target, 100);
});

test('zero or missing target yields fraction 0 without NaN', () => {
  const ring = buildRingTarget({ value: 40, target: 0 }, { size: 64, strokeWidth: 8 });
  assert.equal(ring.fraction, 0);
  assert.equal(Number.isFinite(ring.dashoffset), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/chart-kit-ring.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `buildRingTarget`**

```js
// js/app/chart-kit/ring.js
const DEFAULT_SIZE = 64;
const DEFAULT_STROKE_WIDTH = 8;

export function buildRingTarget(
  { value, target },
  { size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE_WIDTH } = {}
) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const raw = target > 0 ? value / target : 0;
  const fraction = Math.min(1, Math.max(0, raw));

  return {
    size,
    strokeWidth,
    center,
    radius,
    circumference,
    fraction,
    dashoffset: circumference * (1 - fraction),
    value,
    target
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/unit/chart-kit-ring.test.js`

- [ ] **Step 5: Commit locally (no push)**

```bash
git add js/app/chart-kit/ring.js tests/unit/chart-kit-ring.test.js
git commit -m "$(cat <<'EOF'
feat: add soft-medical ring geometry to chart kit

EOF
)"
```

---

### Task 2: Area-line geometry kit (no end marker)

**Files:**
- Create: `js/app/chart-kit/area-line.js`
- Create: `tests/unit/chart-kit-area-line.test.js`
- Modify: `js/app/nutrition-charts.js`
- Modify: `tests/unit/nutrition-charts.test.js`

- [ ] **Step 1: Write failing area-line tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaLine } from '../../js/app/chart-kit/area-line.js';

test('scales a 3-point series and omits any last-point marker field', () => {
  const week = [
    { date: '2026-07-28', value: 0 },
    { date: '2026-07-29', value: 50 },
    { date: '2026-07-30', value: 100 }
  ];
  const chart = buildAreaLine(week, { width: 320, height: 120, padding: 12 });
  assert.equal(chart.linePoints, '12.0,108.0 160.0,60.0 308.0,12.0');
  assert.equal(chart.areaPoints, '12,120 12.0,108.0 160.0,60.0 308.0,12.0 308,120');
  assert.equal('last' in chart, false);
  assert.deepEqual(chart.dayLabels, [
    { date: '2026-07-28', x: 12 },
    { date: '2026-07-29', x: 160 },
    { date: '2026-07-30', x: 308 }
  ]);
});

test('empty series returns empty strings without throwing', () => {
  const chart = buildAreaLine([]);
  assert.deepEqual(chart.points, []);
  assert.equal(chart.linePoints, '');
  assert.equal(chart.areaPoints, '');
});

test('rollingAveragePoints uses trailing window mean when requested', () => {
  const week = [
    { date: '2026-07-28', value: 0 },
    { date: '2026-07-29', value: 60 },
    { date: '2026-07-30', value: 90 }
  ];
  const chart = buildAreaLine(week, { width: 320, height: 120, padding: 12, rollingAverage: 3 });
  assert.equal(typeof chart.rollingLinePoints, 'string');
  assert.ok(chart.rollingLinePoints.length > 0);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/chart-kit-area-line.test.js`

- [ ] **Step 3: Implement `buildAreaLine`**

```js
// js/app/chart-kit/area-line.js
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 120;
const DEFAULT_PADDING = 12;

function rollingMeans(values, window) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, n) => sum + n, 0) / slice.length;
  });
}

export function buildAreaLine(
  series,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    padding = DEFAULT_PADDING,
    valueKey = 'value',
    rollingAverage = 0
  } = {}
) {
  const values = series.map(day => Number(day[valueKey]) || 0);
  const max = Math.max(1, ...values, ...(rollingAverage > 0 ? rollingMeans(values, rollingAverage) : []));
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const scaleY = value => height - padding - (value / max) * (height - padding * 2);

  const points = series.map((day, index) => ({
    x: padding + stepX * index,
    y: scaleY(values[index]),
    date: day.date,
    value: values[index]
  }));

  const linePoints = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPoints = points.length === 0
    ? ''
    : `${padding},${height} ${linePoints} ${width - padding},${height}`;

  const result = {
    width,
    height,
    points,
    linePoints,
    areaPoints,
    dayLabels: points.map(({ date, x }) => ({ date, x }))
  };

  if (rollingAverage > 0 && points.length > 0) {
    const means = rollingMeans(values, rollingAverage);
    result.rollingLinePoints = means
      .map((mean, index) => `${points[index].x.toFixed(1)},${scaleY(mean).toFixed(1)}`)
      .join(' ');
  }

  return result;
}
```

- [ ] **Step 4: Wrap protein chart for compat**

Replace `js/app/nutrition-charts.js` body with:

```js
import { buildAreaLine } from './chart-kit/area-line.js';

export function buildProteinLineChart(series, options = {}) {
  const normalized = series.map(day => ({ date: day.date, value: day.protein_g }));
  const chart = buildAreaLine(normalized, options);
  // Compat for old tests/callers during migration — do not render this in UI.
  return {
    ...chart,
    last: chart.points.at(-1) ?? null
  };
}
```

Update `tests/unit/nutrition-charts.test.js` only if assertions break on new fields; keep `last` compat assertions passing for now.

- [ ] **Step 5: Run**

Run: `node --test tests/unit/chart-kit-area-line.test.js tests/unit/nutrition-charts.test.js`  
Expected: PASS

- [ ] **Step 6: Commit locally (no push)**

```bash
git add js/app/chart-kit/area-line.js tests/unit/chart-kit-area-line.test.js js/app/nutrition-charts.js tests/unit/nutrition-charts.test.js
git commit -m "$(cat <<'EOF'
feat: add area-line chart kit and wrap protein trend builder

EOF
)"
```

---

### Task 3: Columns + animation helpers

**Files:**
- Create: `js/app/chart-kit/columns.js`
- Create: `js/app/chart-kit/animate.js`
- Create: `js/app/chart-kit/apply-ring.js`
- Create: `tests/unit/chart-kit-columns.test.js`

- [ ] **Step 1: Failing column tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildColumns } from '../../js/app/chart-kit/columns.js';

test('buildColumns scales heights to max and preserves labels', () => {
  const chart = buildColumns([
    { key: 'breakfast', value: 10, label: 'B' },
    { key: 'lunch', value: 40, label: 'L' }
  ], { height: 100 });
  assert.equal(chart.bars[0].heightPct, 25);
  assert.equal(chart.bars[1].heightPct, 100);
  assert.equal(chart.bars[0].key, 'breakfast');
});

test('all-zero values yield zero heights without NaN', () => {
  const chart = buildColumns([{ key: 'a', value: 0, label: 'A' }], { height: 80 });
  assert.equal(chart.bars[0].heightPct, 0);
});
```

- [ ] **Step 2: Implement columns + animate + apply-ring**

```js
// js/app/chart-kit/columns.js
export function buildColumns(items, { height = 96 } = {}) {
  const max = Math.max(1, ...items.map(item => Number(item.value) || 0));
  return {
    height,
    bars: items.map(item => {
      const value = Number(item.value) || 0;
      return {
        key: item.key,
        label: item.label,
        value,
        heightPct: (value / max) * 100
      };
    })
  };
}
```

```js
// js/app/chart-kit/animate.js
export function prefersReducedMotion(media = globalThis.matchMedia) {
  return typeof media === 'function' && Boolean(media('(prefers-reduced-motion: reduce)')?.matches);
}

export function animateRingFill(circle, { circumference, dashoffset }, options = {}) {
  if (!circle) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  circle.setAttribute('stroke-dasharray', String(circumference));
  if (reduced) {
    circle.style.transition = 'none';
    circle.setAttribute('stroke-dashoffset', String(dashoffset));
    return;
  }
  circle.style.transition = 'none';
  circle.setAttribute('stroke-dashoffset', String(circumference));
  void circle.getBoundingClientRect();
  circle.style.transition = 'stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)';
  circle.setAttribute('stroke-dashoffset', String(dashoffset));
}

export function animateAreaReveal(svg, options = {}) {
  if (!svg) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  svg.classList.toggle('chart-animating', !reduced);
  if (reduced) svg.classList.add('chart-static');
}

export function animateColumnGrow(element, heightPct, options = {}) {
  if (!element) return;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  if (reduced) {
    element.style.height = `${heightPct}%`;
    return;
  }
  element.style.height = '0%';
  void element.getBoundingClientRect();
  element.style.transition = 'height 600ms cubic-bezier(.2,.8,.2,1)';
  element.style.height = `${heightPct}%`;
}
```

```js
// js/app/chart-kit/apply-ring.js
import { buildRingTarget } from './ring.js';
import { animateRingFill } from './animate.js';

export function applyRingTarget(svg, { value, target }, options = {}) {
  if (!svg) return null;
  const ring = buildRingTarget({ value, target }, options);
  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
    if (role === 'fill') animateRingFill(circle, ring, options);
  }
  return ring;
}
```

- [ ] **Step 3: Run column tests — PASS**

Run: `node --test tests/unit/chart-kit-columns.test.js`

- [ ] **Step 4: Commit locally (no push)**

```bash
git add js/app/chart-kit/columns.js js/app/chart-kit/animate.js js/app/chart-kit/apply-ring.js tests/unit/chart-kit-columns.test.js
git commit -m "$(cat <<'EOF'
feat: add column geometry and chart fill animation helpers

EOF
)"
```

---

### Task 4: Soft-medical CSS tokens + Home ring markup

**Files:**
- Modify: `css/app.css`
- Modify: `index.html` (Home Energy/Protein/Fat cards)
- Modify: `js/app/render-home.js`
- Modify: `js/app/central-node-charts.js` (re-export ring)
- Modify: `service-worker.js` (add kit files, bump to `v18`)
- Modify: `tests/browser/home.spec.mjs`

- [ ] **Step 1: Add CSS tokens** (append to `css/app.css`)

```css
:root {
  --chart-track: #e6ebf2;
  --chart-label: #8a97a8;
  --chart-ink: #15233a;
  --ring-energy: #e08a3c;
  --ring-protein: #3d6df2;
  --ring-fat: #2aa8a0;
  --ring-accent: #3d6df2;
  --area-fill: rgba(61, 109, 242, 0.18);
}

.metric-ring-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.metric-ring {
  width: 72px;
  height: 72px;
  transform: rotate(-90deg);
}

.metric-ring-track { stroke: var(--chart-track); }
.metric-ring-fill { fill: none; stroke-linecap: round; }
.metric-ring--energy .metric-ring-fill { stroke: var(--ring-energy); }
.metric-ring--protein .metric-ring-fill { stroke: var(--ring-protein); }
.metric-ring--fat .metric-ring-fill { stroke: var(--ring-fat); }

.line-chart.chart-animating [data-role="area"] {
  clip-path: inset(0 100% 0 0);
  animation: area-reveal 700ms cubic-bezier(.2,.8,.2,1) forwards;
}
.line-chart.chart-animating [data-role="line"] {
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  animation: line-draw 700ms cubic-bezier(.2,.8,.2,1) forwards;
}
@keyframes area-reveal { to { clip-path: inset(0 0 0 0); } }
@keyframes line-draw { to { stroke-dashoffset: 0; } }

@media (prefers-reduced-motion: reduce) {
  .line-chart.chart-animating [data-role="area"],
  .line-chart.chart-animating [data-role="line"] {
    animation: none;
    clip-path: none;
    stroke-dashoffset: 0;
  }
}
```

- [ ] **Step 2: Replace Home progress tracks with ring SVGs**

For Energy, Protein, and Fat cards in `index.html`, replace each `.progress-track[data-progress="…"]` with:

```html
<div class="metric-ring-wrap">
  <svg class="metric-ring metric-ring--energy" data-ring="calories" viewBox="0 0 72 72" role="img" aria-label="Energy progress">
    <circle data-role="track" class="metric-ring-track" fill="none"></circle>
    <circle data-role="fill" class="metric-ring-fill" fill="none"></circle>
  </svg>
</div>
```

(Use `--protein` / `--fat` and `data-ring="protein"` / `data-ring="fat"` on the other two.) Keep logging `.progress-track` as a bar.

- [ ] **Step 3: Update `render-home.js`**

```js
import { applyRingTarget } from './chart-kit/apply-ring.js';

// inside renderHome, replace the progress loop for calories/protein/fat:
const ringMap = {
  calories: { value: model.nutrition.calories, target: model.targets.calories, size: 72, strokeWidth: 7 },
  protein: { value: model.nutrition.protein_g, target: model.targets.protein_g, size: 72, strokeWidth: 7 },
  fat: { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g, size: 72, strokeWidth: 7 }
};
for (const [name, config] of Object.entries(ringMap)) {
  applyRingTarget(root.querySelector(`[data-ring="${name}"]`), config, { size: config.size, strokeWidth: config.strokeWidth });
  setText(root, `[data-percent="${name}"]`, `${model.progress[name]}%`);
}
setProgress(root, 'logging', model.progress.logging);
```

Keep existing `setText` value/target lines.

- [ ] **Step 4: Point `central-node-charts.js` at kit**

```js
import { buildRingTarget } from './chart-kit/ring.js';

export function buildCompletionRing({ complete, total }, options = {}) {
  return buildRingTarget({ value: complete, target: total }, options);
}
```

Update `render-central-node.js` `renderCompletionRing` to use `animateRingFill` on the fill circle after setting attributes (import from `chart-kit/animate.js`).

- [ ] **Step 5: Precache**

In `service-worker.js`, set `CACHE_NAME = 'life-hub-shell-v18'` and add:

```js
'js/app/chart-kit/ring.js',
'js/app/chart-kit/area-line.js',
'js/app/chart-kit/columns.js',
'js/app/chart-kit/animate.js',
'js/app/chart-kit/apply-ring.js',
```

- [ ] **Step 6: Browser assertion**

In `tests/browser/home.spec.mjs`, assert `document.querySelector('[data-ring="protein"]')` exists and `[data-progress="protein"]` does not.

- [ ] **Step 7: Verify**

Run: `npm run test:unit && npm run test:browser`  
Expected: PASS (fix any selector drift in home browser tests)

- [ ] **Step 8: Commit locally (no push)**

```bash
git add css/app.css index.html js/app/render-home.js js/app/central-node-charts.js js/app/render-central-node.js service-worker.js tests/browser/home.spec.mjs
git commit -m "$(cat <<'EOF'
feat: render Home macro rings with soft-medical chart kit

EOF
)"
```

---

### Task 5: Nutrition macro rings + protein trend without end circle

**Files:**
- Modify: `index.html` (Nutrition metric cards + protein SVG)
- Modify: `js/app/render-nutrition.js`
- Modify: `css/app.css` (nutrition ring grid)
- Modify: `tests/browser/nutrition.spec.mjs`
- Also remove last-point from Central Node week chart SVG in `index.html`

- [ ] **Step 1: Markup**

Replace each Nutrition macro card’s value-only block with a ring wrap + value text (six rings: calories/protein/fat/sodium/calcium/polyphenol), e.g.:

```html
<div class="metric-ring-wrap">
  <svg class="metric-ring metric-ring--protein" data-nutrition-ring="protein" viewBox="0 0 72 72" role="img" aria-label="Protein progress">
    <circle data-role="track" class="metric-ring-track" fill="none"></circle>
    <circle data-role="fill" class="metric-ring-fill" fill="none"></circle>
  </svg>
  <p class="metric-value"><strong data-nutrition="protein">—</strong><span data-target="nutrition-protein">/ — g</span></p>
</div>
```

In `#nutrition-protein-chart` and `#central-node-week-chart`, **delete** the `<circle data-role="last-point" …>` nodes. Add a `<g data-role="day-labels"></g>` if labels are drawn via DOM; otherwise render labels in JS into that group.

- [ ] **Step 2: Render rings + chart without last-point**

```js
import { applyRingTarget } from './chart-kit/apply-ring.js';
import { animateAreaReveal } from './chart-kit/animate.js';
import { buildProteinLineChart } from './nutrition-charts.js';

function renderMacroRings(root, model) {
  const rings = {
    calories: { value: model.nutrition.calories, target: model.targets.calories },
    protein: { value: model.nutrition.protein_g, target: model.targets.protein_g },
    fat: { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g },
    sodium: { value: model.nutrition.sodium_mg, target: model.targets.sodium_ceiling_mg },
    calcium: { value: model.nutrition.calcium_mg, target: model.targets.calcium_target_mg },
    polyphenol: { value: model.nutrition.polyphenol_score, target: model.targets.polyphenol_daily_aim }
  };
  for (const [name, config] of Object.entries(rings)) {
    applyRingTarget(root.querySelector(`[data-nutrition-ring="${name}"]`), config, { size: 72, strokeWidth: 7 });
  }
}

function renderProteinChart(root, week) {
  const svg = root.querySelector('#nutrition-protein-chart');
  if (!svg) return;
  const chart = buildProteinLineChart(week);
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.querySelector('[data-role="line"]')?.setAttribute('points', chart.linePoints);
  svg.querySelector('[data-role="area"]')?.setAttribute('points', chart.areaPoints);
  // intentionally do not touch last-point
  const labels = svg.querySelector('[data-role="day-labels"]');
  if (labels) {
    labels.replaceChildren();
    for (const day of chart.dayLabels) {
      const text = root.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', day.x);
      text.setAttribute('y', chart.height - 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'chart-day-label');
      text.textContent = weekdayLetter(day.date);
      labels.append(text);
    }
  }
  animateAreaReveal(svg);
}

function weekdayLetter(date) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'narrow' }).format(new Date(`${date}T12:00:00+10:00`));
}
```

Call `renderMacroRings` from `renderNutrition` before charts. Mirror last-point removal in `render-central-node.js` `renderWeekChart`.

- [ ] **Step 3: Browser tests**

Assert Nutrition has `[data-nutrition-ring="protein"]` and `#nutrition-protein-chart [data-role="last-point"]` is null.

- [ ] **Step 4: Verify + commit**

Run: `npm run test:unit && npm run test:browser`

```bash
git add index.html css/app.css js/app/render-nutrition.js js/app/render-central-node.js tests/browser/nutrition.spec.mjs tests/browser/central-node.spec.mjs
git commit -m "$(cat <<'EOF'
feat: Nutrition macro rings and protein trend without end marker

EOF
)"
```

---

### Task 6: Central Node Today’s Status hybrid

**Files:**
- Modify: `js/app/central-node-model.js`
- Modify: `tests/unit/central-node-model.test.js`
- Modify: `index.html` (Today’s Status card)
- Modify: `js/app/render-central-node.js`
- Modify: `css/app.css`
- Modify: `tests/browser/central-node.spec.mjs`

- [ ] **Step 1: Failing model test for `liveStatus`**

```js
test('liveStatus exposes checklist flags and macro snapshot from events', () => {
  const model = buildCentralNodeModel({
    events,
    targetsConfig,
    centralNodeMarkdown: '## ✅ Today\'s Status\n\nAgent note here.\n',
    date: '2026-07-30'
  });
  assert.equal(model.liveStatus.completeness.nutrition, true);
  assert.equal(typeof model.liveStatus.snapshot.protein_g, 'number');
  assert.equal(typeof model.liveStatus.snapshot.calories, 'number');
  assert.equal(model.sections.todaysStatus.includes('Agent note'), true);
});
```

(Adapt fixture events already used in `central-node-model.test.js`.)

- [ ] **Step 2: Extend model**

```js
const nutrition = aggregateNutrition(events, date);
const completeness = getLoggingCompleteness(events, date);

return {
  // ...existing fields...
  completeness,
  liveStatus: {
    completeness,
    snapshot: {
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      fat_g: nutrition.fat_g
    }
  },
  // sections unchanged
};
```

- [ ] **Step 3: Markup — fill the Status card**

```html
<article class="metric-card status-card" aria-labelledby="todays-status-label">
  <p class="metric-label" id="todays-status-label">Today's Status</p>
  <div class="status-hybrid">
    <div class="completion-ring-wrap">
      <svg id="central-node-completion-ring" class="completion-ring" viewBox="0 0 72 72" role="img" aria-label="Logging completeness ring">
        <circle data-role="track" class="completion-ring-track" fill="none"></circle>
        <circle data-role="fill" class="completion-ring-fill" fill="none"></circle>
      </svg>
      <span data-value="completion-ring-label" class="completion-ring-label">— of —</span>
    </div>
    <div class="status-live" aria-label="Live logging checklist">
      <ul class="status-checklist">
        <li data-live-complete="nutrition">Nutrition</li>
        <li data-live-complete="fitness">Fitness</li>
        <li data-live-complete="diary">Diary</li>
        <li data-live-complete="body">Body</li>
        <li data-live-complete="skincare">Skincare</li>
      </ul>
      <p class="status-snapshot" data-live-snapshot>—</p>
    </div>
    <div data-central-node="todays-status" class="prose-section status-prose"></div>
  </div>
</article>
```

Add CSS for `.status-hybrid` as a 3-region responsive grid (ring | live | prose) so the card is no longer mostly empty.

- [ ] **Step 4: Render live panel**

```js
function renderLiveStatus(root, liveStatus) {
  if (!liveStatus) return;
  const { completeness, snapshot } = liveStatus;
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const item = root.querySelector(`[data-live-complete="${key}"]`);
    if (item) item.dataset.checked = String(Boolean(completeness[key]));
  }
  setText(
    root,
    '[data-live-snapshot]',
    `Protein ${snapshot.protein_g} g · Energy ${snapshot.calories.toLocaleString('en-AU')} kcal · Fat ${snapshot.fat_g} g`
  );
}
```

Call from `renderCentralNode` after markdown sections. If `model.sections.todaysStatus` is empty/whitespace, set prose container text to `No agent notes yet.` instead of leaving a blank hole (still call `renderInlineMarkdown` only when content exists).

- [ ] **Step 5: Browser test**

Assert `[data-live-complete="nutrition"]` exists and `[data-live-snapshot]` is non-empty after load.

- [ ] **Step 6: Verify + commit**

Run: `node --test tests/unit/central-node-model.test.js && npm run test:browser`

```bash
git add js/app/central-node-model.js js/app/render-central-node.js index.html css/app.css tests/unit/central-node-model.test.js tests/browser/central-node.spec.mjs
git commit -m "$(cat <<'EOF'
feat: hybrid live+prose Today's Status on Central Node

EOF
)"
```

**Phase A done when:** Home rings animate, Nutrition six rings + protein area without end circle, Status hybrid shows live checklist. Brisket prose may still be stale — expected.

---

## Phase B — Slice 2 (maximal Nutrition)

### Task 7: Nutrition model fields for maximal charts

**Files:**
- Modify: `js/app/nutrition-model.js`
- Modify: `tests/unit/nutrition-model.test.js`

- [ ] **Step 1: Failing tests**

```js
test('exposes mealTiming from today\'s meal protein breakdown', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });
  assert.deepEqual(model.mealTiming, [
    { key: 'breakfast', label: 'Breakfast', value: 38 },
    { key: 'lunch', label: 'Lunch', value: 42 },
    { key: 'dinner', label: 'Dinner', value: 0 },
    { key: 'snack', label: 'Snack', value: 0 }
  ]);
});

test('exposes previousWeek series for comparison columns', () => {
  const model = buildNutritionModel({ events, targetsConfig, date: '2026-07-30' });
  assert.equal(model.previousWeek.length, 7);
  assert.equal(typeof model.previousWeek[0].protein_g, 'number');
});
```

(`previousWeek` is already computed internally — export it on the model object.)

- [ ] **Step 2: Implement**

```js
return {
  // existing fields...
  previousWeek,
  mealTiming: ['breakfast', 'lunch', 'dinner', 'snack'].map(key => ({
    key,
    label: key[0].toUpperCase() + key.slice(1),
    value: nutrition.meals[key].protein_g
  }))
};
```

- [ ] **Step 3: Run + commit**

Run: `node --test tests/unit/nutrition-model.test.js`

```bash
git add js/app/nutrition-model.js tests/unit/nutrition-model.test.js
git commit -m "$(cat <<'EOF'
feat: expose meal timing and previous week on nutrition model

EOF
)"
```

---

### Task 8: Maximal Nutrition chart shells + renderers

**Files:**
- Modify: `index.html` — add cards under Nutrition dashboard:
  - `#nutrition-calories-chart` area SVG (no last-point)
  - `#nutrition-fat-chart` area SVG
  - `#nutrition-meal-timing` column host
  - `#nutrition-macro-split` dual-ring SVG (two fill circles: protein + fat, different radii)
  - `#nutrition-week-compare` column host
- Modify: `js/app/render-nutrition.js`
- Modify: `css/app.css`
- Modify: `tests/browser/nutrition.spec.mjs`

- [ ] **Step 1: Add HTML shells** mirroring the protein chart structure (area + line + day-labels group only).

Dual-ring shell:

```html
<svg id="nutrition-macro-split" class="metric-ring metric-ring--split" viewBox="0 0 96 96" role="img" aria-label="Protein and fat progress">
  <circle data-role="protein-track" class="metric-ring-track" fill="none"></circle>
  <circle data-role="protein-fill" class="metric-ring-fill metric-ring--protein" fill="none"></circle>
  <circle data-role="fat-track" class="metric-ring-track" fill="none"></circle>
  <circle data-role="fat-fill" class="metric-ring-fill metric-ring--fat" fill="none"></circle>
</svg>
```

- [ ] **Step 2: Render helpers**

```js
function renderNamedAreaChart(root, selector, series, valueKey, { rollingAverage = 0 } = {}) {
  const svg = root.querySelector(selector);
  if (!svg) return;
  const normalized = series.map(day => ({ date: day.date, value: day[valueKey] }));
  const chart = buildAreaLine(normalized, { rollingAverage });
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  svg.querySelector('[data-role="line"]')?.setAttribute('points', chart.linePoints);
  svg.querySelector('[data-role="area"]')?.setAttribute('points', chart.areaPoints);
  const rolling = svg.querySelector('[data-role="rolling"]');
  if (rolling) {
    if (chart.rollingLinePoints) {
      rolling.setAttribute('points', chart.rollingLinePoints);
      rolling.removeAttribute('hidden');
    } else {
      rolling.setAttribute('hidden', '');
    }
  }
  animateAreaReveal(svg);
}

function renderMealTiming(root, mealTiming) {
  const host = root.querySelector('#nutrition-meal-timing');
  if (!host) return;
  const chart = buildColumns(mealTiming);
  host.replaceChildren();
  for (const bar of chart.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    col.append(fill);
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(label);
    host.append(col);
    animateColumnGrow(fill, bar.heightPct);
  }
}

function renderMacroSplit(root, model) {
  const svg = root.querySelector('#nutrition-macro-split');
  if (!svg) return;
  const protein = buildRingTarget(
    { value: model.nutrition.protein_g, target: model.targets.protein_g },
    { size: 96, strokeWidth: 8 }
  );
  const fat = buildRingTarget(
    { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g },
    { size: 96, strokeWidth: 8 }
  );
  // apply protein on outer radius, fat on inner radius (radius * 0.72)
  // set attrs on protein-* and fat-* circles; animateRingFill each fill
}

function renderWeekCompare(root, week, previousWeek) {
  const host = root.querySelector('#nutrition-week-compare');
  if (!host) return;
  const items = week.map((day, index) => ({
    key: day.date,
    label: weekdayLetter(day.date),
    value: day.protein_g,
    previous: previousWeek[index]?.protein_g ?? 0
  }));
  const chart = buildColumns(items.map(item => ({
    key: item.key,
    label: item.label,
    value: item.value
  })));
  host.replaceChildren();
  for (const bar of chart.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    col.append(fill);
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(label);
    host.append(col);
    animateColumnGrow(fill, bar.heightPct);
  }
  const priorAvg = previousWeek.length === 0
    ? 0
    : previousWeek.reduce((sum, day) => sum + day.protein_g, 0) / previousWeek.length;
  setText(root, '[data-value="week-compare-prior"]', `Prior week avg ${priorAvg.toFixed(0)} g`);
}
```

Wire from `renderNutrition`:

```js
renderNamedAreaChart(root, '#nutrition-protein-chart', model.week, 'protein_g', { rollingAverage: 3 });
renderNamedAreaChart(root, '#nutrition-calories-chart', model.week, 'calories');
renderNamedAreaChart(root, '#nutrition-fat-chart', model.week, 'fat_g');
renderMealTiming(root, model.mealTiming);
renderMacroSplit(root, model);
renderWeekCompare(root, model.week, model.previousWeek);
```

Import `buildAreaLine`, `buildColumns`, `buildRingTarget`, `animateRingFill`, `animateColumnGrow` as needed. Refactor earlier protein renderer to `renderNamedAreaChart` to avoid duplication.

- [ ] **Step 3: Browser smoke**

Assert `#nutrition-calories-chart`, `#nutrition-meal-timing`, `#nutrition-macro-split` exist when Nutrition is shown.

- [ ] **Step 4: Full verify + commit**

Run: `npm test && npm run test:browser`

```bash
git add index.html css/app.css js/app/render-nutrition.js tests/browser/nutrition.spec.mjs
git commit -m "$(cat <<'EOF'
feat: maximal Nutrition monitor charts on soft-medical kit

EOF
)"
```

---

### Task 9: Docs status note

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md` (if present — add Phase note for soft-medical charts Slice 1/2 complete; Brisket Status writes still deferred)

- [ ] **Step 1: Update status file with one short paragraph pointing at this plan + spec.**
- [ ] **Step 2: Commit locally (no push)**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "$(cat <<'EOF'
docs: note soft-medical charts phase completion status

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Shared chart kit | Tasks 1–3 |
| Soft-medical tokens | Task 4 |
| Home rings + logging bar motion | Task 4 |
| Nutrition six rings | Task 5 |
| Protein area, no end circle | Tasks 2, 5 |
| Status hybrid live+prose | Task 6 |
| Maximal: calorie/fat trends, meal timing, dual-ring, week compare, rolling avg | Tasks 7–8 |
| Reduced motion | Task 3 animate helpers + CSS |
| No chart library / no Brisket write path | Explicit throughout; out of scope |
| No continuous push | Header + every commit step |

**Placeholder scan:** none intentional.  
**Type consistency:** `buildRingTarget({ value, target })`, `buildAreaLine` with `valueKey`/`rollingAverage`, `liveStatus.completeness` + `liveStatus.snapshot`, `mealTiming[{key,label,value}]`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-04-soft-medical-charts.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
