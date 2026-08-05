# Nutrition Charts Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Nutrition week-chart label squash, label the 3-day average, remove the Meal timing tile, show polyphenol as a score+pill, and mark fat-over-ceiling on today + per-day week markers.

**Architecture:** Extend `buildNutritionModel` with fat-over flags and a polyphenol vs-aim helper; update `render-nutrition.js` + `index.html` + CSS; keep zero-filled daily series; clear line-draw dash styles after animation so the solid stroke stays visible.

**Tech Stack:** Vanilla JS PWA, SVG chart-kit, node:test, Playwright browser specs.

**Spec:** `docs/superpowers/specs/2026-08-05-nutrition-charts-polish-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/app/nutrition-model.js` | `overFatCeiling` on week/month days + today; `polyphenolDelta` / export helper; drop unused `mealTiming` |
| `js/app/render-nutrition.js` | `meet` aspect; rolling caption; polyphenol score UI; fat overage classes + day markers; remove meal-timing render |
| `js/app/chart-kit/animate.js` | Clear inline dash styles when line-draw animation ends |
| `index.html` | SVG aspect + taller viewBox; rolling caption; polyphenol markup; delete meal-timing card; fat marker group |
| `css/app.css` | Polyphenol score/pill; fat overage red; overage day dots |
| `tests/unit/nutrition-model.test.js` | Replace mealTiming test; add fat-over + polyphenol helper tests |
| `tests/browser/nutrition.spec.mjs` | Assert meal-timing gone; polyphenol pill present; charts use `meet` |
| `service-worker.js` | Bump shell cache (`v31` → `v32`) |

---

### Task 1: Model — fat-over flags + polyphenol vs-aim

**Files:**
- Modify: `js/app/nutrition-model.js`
- Test: `tests/unit/nutrition-model.test.js`

- [ ] **Step 1: Write the failing tests**

Add/replace in `tests/unit/nutrition-model.test.js`:

```js
import {
  buildNutritionModel,
  PROTEIN_TREND_CONFIG,
  polyphenolVsAim
} from '../../js/app/nutrition-model.js';

test('polyphenolVsAim labels score against aim without pretending it is a percent', () => {
  assert.deepEqual(polyphenolVsAim(14, 10), { delta: 4, label: '+4 vs aim', colour: 'green' });
  assert.deepEqual(polyphenolVsAim(8, 10), { delta: -2, label: '−2 vs aim', colour: 'muted' });
  assert.deepEqual(polyphenolVsAim(10, 10), { delta: 0, label: 'at aim', colour: 'green' });
  assert.deepEqual(polyphenolVsAim(3, 0), { delta: 0, label: 'at aim', colour: 'muted' });
});

test('marks week days that exceed the fat ceiling', () => {
  const heavy = [
    ...events,
    {
      record: {
        type: 'meal', date: '2026-07-29', meal: 'dinner',
        calories: 900, protein_g: 40, fat_g: 60,
        sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1
      },
      body: '', path: '', legacy: false
    }
  ];
  const model = buildNutritionModel({ events: heavy, targetsConfig, date: '2026-07-30' });
  const over = model.week.find(day => day.date === '2026-07-29');
  assert.equal(over.fat_g, 60);
  assert.equal(over.overFatCeiling, true);
  assert.equal(model.week.find(day => day.date === '2026-07-30').overFatCeiling, false);
  assert.equal(model.overFatCeiling, false);
});

test('today overFatCeiling is true when fat exceeds ceiling', () => {
  const heavyToday = [{
    record: {
      type: 'meal', date: '2026-07-30', meal: 'dinner',
      calories: 800, protein_g: 40, fat_g: 55,
      sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1
    },
    body: '', path: '', legacy: false
  }];
  const model = buildNutritionModel({ events: heavyToday, targetsConfig, date: '2026-07-30' });
  assert.equal(model.nutrition.fat_g, 55);
  assert.equal(model.overFatCeiling, true);
  assert.equal(model.polyphenolVsAim.label, '−9 vs aim'); // score 1, aim 10
});
```

Delete (or rewrite) the existing `exposes mealTiming…` test — `mealTiming` is removed from the model in this task.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/nutrition-model.test.js`

Expected: FAIL — `polyphenolVsAim` / `overFatCeiling` missing.

- [ ] **Step 3: Implement model changes**

In `js/app/nutrition-model.js`:

1. Export helper:

```js
export function polyphenolVsAim(score, aim) {
  const s = Number(score) || 0;
  const a = Number(aim) || 0;
  if (a <= 0) return { delta: 0, label: 'at aim', colour: 'muted' };
  const delta = s - a;
  if (delta === 0) return { delta: 0, label: 'at aim', colour: 'green' };
  if (delta > 0) return { delta, label: `+${delta} vs aim`, colour: 'green' };
  return { delta, label: `−${Math.abs(delta)} vs aim`, colour: 'muted' };
}
```

(Use Unicode minus `−` U+2212 in the under-aim label to match the test.)

2. Extend `dailyNutrition` to include fat ceiling comparison:

```js
const fatCeiling = targets?.fat_ceiling_g ?? 0;
return {
  date,
  calories: nutrition.calories,
  protein_g: nutrition.protein_g,
  fat_g: nutrition.fat_g,
  proteinTarget,
  hitProtein: proteinTarget > 0 && nutrition.protein_g >= proteinTarget,
  overFatCeiling: fatCeiling > 0 && nutrition.fat_g > fatCeiling
};
```

3. On the returned model:
- `overFatCeiling: targets.fat_ceiling_g > 0 && nutrition.fat_g > targets.fat_ceiling_g`
- `polyphenolVsAim: polyphenolVsAim(nutrition.polyphenol_score, targets.polyphenol_daily_aim)`
- **Remove** the `mealTiming` property entirely.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/nutrition-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/nutrition-model.js tests/unit/nutrition-model.test.js
git commit -m "$(cat <<'EOF'
feat: flag fat-over-ceiling days and polyphenol vs-aim on Nutrition model

EOF
)"
```

---

### Task 2: Animate — clear dash styles after line-draw

**Files:**
- Modify: `js/app/chart-kit/animate.js`
- Test: `tests/unit/chart-kit-animate.test.js` (create if missing; else extend)

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { animateAreaReveal } from '../../js/app/chart-kit/animate.js';

test('animateAreaReveal clears stroke dash after animationend so the solid line stays visible', () => {
  const listeners = [];
  const line = {
    style: { strokeDasharray: '', strokeDashoffset: '' },
    getTotalLength: () => 100,
    addEventListener(type, fn) { listeners.push({ type, fn }); }
  };
  const svg = {
    classList: {
      items: new Set(),
      remove(...names) { for (const n of names) this.items.delete(n); },
      add(name) { this.items.add(name); }
    },
    getBoundingClientRect() { return {}; },
    querySelector(sel) { return sel.includes('line') ? line : null; }
  };
  animateAreaReveal(svg, { reducedMotion: false });
  assert.equal(line.style.strokeDasharray, '100');
  assert.equal(line.style.strokeDashoffset, '100');
  const end = listeners.find(l => l.type === 'animationend');
  assert.ok(end);
  end.fn({ target: line, animationName: 'line-draw' });
  assert.equal(line.style.strokeDasharray, '');
  assert.equal(line.style.strokeDashoffset, '');
});
```

- [ ] **Step 2: Run test — expect FAIL** (no `animationend` listener yet)

Run: `node --test tests/unit/chart-kit-animate.test.js`

- [ ] **Step 3: Implement**

In `animateAreaReveal`, after setting dash styles and adding `chart-animating`:

```js
if (line && typeof line.addEventListener === 'function') {
  const onEnd = event => {
    if (event?.animationName && event.animationName !== 'line-draw') return;
    line.style.strokeDasharray = '';
    line.style.strokeDashoffset = '';
    line.removeEventListener?.('animationend', onEnd);
  };
  line.addEventListener('animationend', onEnd);
}
```

For `reducedMotion`, leave dash styles cleared (already cleared at start) and do not attach the listener.

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/animate.js tests/unit/chart-kit-animate.test.js
git commit -m "$(cat <<'EOF'
fix: clear chart line dash styles after reveal animation

EOF
)"
```

---

### Task 3: Markup — aspect ratio, rolling caption, polyphenol, drop meal timing

**Files:**
- Modify: `index.html`
- Test: `tests/browser/nutrition.spec.mjs` (update assertions in Task 5; this task is markup-only + unit-free HTML check via grep in Step 2)

- [ ] **Step 1: Update Nutrition chart SVGs**

For `#nutrition-protein-chart`, `#nutrition-calories-chart`, `#nutrition-fat-chart`:

- `viewBox="0 0 320 140"`
- `preserveAspectRatio="xMidYMid meet"`

On `#nutrition-fat-chart`, add an empty group for markers:

```html
<g data-role="overage-markers"></g>
```

(keep existing `area` / `line` / `day-labels`)

- [ ] **Step 2: Add rolling caption under protein chart**

Immediately after the protein SVG (before `#nutrition-hit-strip`):

```html
<p class="metric-caption" data-nutrition="rolling-caption">Dotted = 3-day average</p>
```

- [ ] **Step 3: Replace polyphenol ring card**

Replace the polyphenol `metric-ring-wrap` block with:

```html
<article class="metric-card" aria-labelledby="nutrition-polyphenol-label">
  <div class="metric-heading">
    <p class="metric-label" id="nutrition-polyphenol-label">Polyphenols</p>
    <span class="metric-icon" aria-hidden="true">◆</span>
  </div>
  <p class="polyphenol-score">
    <strong data-nutrition="polyphenol">—</strong>
  </p>
  <p class="polyphenol-pill" data-nutrition="polyphenol-pill" data-colour="muted">—</p>
  <p class="metric-caption">Polyphenol score</p>
</article>
```

Remove `data-nutrition-ring="polyphenol"` SVG entirely.

- [ ] **Step 4: Delete Meal timing card**

Remove the entire:

```html
<article class="metric-card chart-card" aria-labelledby="meal-timing-label">
  ...
  <div id="nutrition-meal-timing" ...></div>
</article>
```

- [ ] **Step 5: Sanity check**

Run: `rg "nutrition-meal-timing|preserveAspectRatio=\"none\"" index.html`

Expected: no meal-timing id; nutrition week charts no longer use `none` (other pages may still).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat: restructure Nutrition chart markup for readable SVGs and score polyphenol

EOF
)"
```

---

### Task 4: Render + CSS — wire model into UI

**Files:**
- Modify: `js/app/render-nutrition.js`
- Modify: `css/app.css`

- [ ] **Step 1: Stop forcing `preserveAspectRatio="none"`; use taller chart build**

In `renderNamedAreaChart`:

```js
const chart = buildAreaLine(normalized, {
  rollingAverage,
  width: 320,
  height: 140,
  padding: 12,
  paddingBottom: 24
});
svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
```

(Remove the old `'none'` assignment.)

- [ ] **Step 2: Fat overage markers on the fat chart**

Change the fat chart call to pass series days (not just values). Extend `renderNamedAreaChart` options:

```js
renderNamedAreaChart(root, '#nutrition-fat-chart', model.week, 'fat_g', {
  markOverage: true
});
```

Inside `renderNamedAreaChart`, after building paths:

```js
const markers = svg.querySelector('[data-role="overage-markers"]');
if (markers) {
  markers.replaceChildren();
  if (options.markOverage) {
    for (let i = 0; i < series.length; i++) {
      if (!series[i].overFatCeiling) continue;
      const point = chart.points[i];
      if (!point) continue;
      const dot = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', point.x);
      dot.setAttribute('cy', point.y);
      dot.setAttribute('r', '4');
      dot.setAttribute('class', 'chart-overage-dot');
      markers.append(dot);
    }
  }
}
```

- [ ] **Step 3: Today fat overage classes**

In `renderNutrition` / `renderMacroSplit` / macro rings:

```js
const fatOver = Boolean(model.overFatCeiling);
root.querySelector('#nutrition-dashboard')
  ?.classList.toggle('nutrition--fat-over', fatOver);
```

Toggle `is-over` on:
- `[data-nutrition="fat"]` parent `.metric-value` or the fat card
- `#nutrition-macro-split` / fat fill circle (`metric-ring--fat`)

Skip polyphenol in `renderMacroRings` (ring removed). Remove `polyphenol` from the rings map.

- [ ] **Step 4: Polyphenol score + pill**

Replace polyphenol `setText` target span with:

```js
setText(root, '[data-nutrition="polyphenol"]', model.nutrition.polyphenol_score);
const pill = root.querySelector('[data-nutrition="polyphenol-pill"]');
if (pill && model.polyphenolVsAim) {
  pill.textContent = model.polyphenolVsAim.label;
  pill.dataset.colour = model.polyphenolVsAim.colour;
}
```

- [ ] **Step 5: Remove `renderMealTiming` and its call**

Delete `renderMealTiming` function and the `renderMealTiming(root, model.mealTiming)` call.

- [ ] **Step 6: CSS**

Add to `css/app.css`:

```css
.polyphenol-score {
  margin: 0.85rem 0 0.35rem;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
  color: var(--depth);
}
.polyphenol-score strong { font-size: inherit; }
.polyphenol-pill {
  display: inline-flex;
  margin: 0;
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}
.polyphenol-pill[data-colour="green"] {
  color: #1f6b45;
  background: rgba(31, 107, 69, 0.12);
}
.polyphenol-pill[data-colour="muted"] {
  color: var(--muted);
  background: rgba(10, 21, 54, 0.06);
}

.nutrition--fat-over [data-nutrition="fat"],
.nutrition--fat-over [data-split="fat"],
.nutrition--fat-over [data-split="fat-pct"] {
  color: #b3261e;
}
.nutrition--fat-over .metric-ring--fat,
.nutrition--fat-over .metric-ring-fill.metric-ring--fat {
  stroke: #b3261e;
}

.chart-overage-dot {
  fill: #b3261e;
  stroke: #fff;
  stroke-width: 1.5;
}
```

- [ ] **Step 7: Unit smoke (optional render harness)** — skip if no existing FakeDocument for nutrition render; model + browser coverage is enough.

- [ ] **Step 8: Commit**

```bash
git add js/app/render-nutrition.js css/app.css
git commit -m "$(cat <<'EOF'
feat: render Nutrition chart polish, polyphenol score, and fat overage

EOF
)"
```

---

### Task 5: Browser + SW bump + full verify

**Files:**
- Modify: `tests/browser/nutrition.spec.mjs`
- Modify: `service-worker.js`

- [ ] **Step 1: Update browser assertions**

In `tests/browser/nutrition.spec.mjs`, replace the meal-timing assertion:

```js
assert.equal(await page.locator('#nutrition-meal-timing').count(), 0);
assert.equal(await page.locator('[data-nutrition="polyphenol-pill"]').count(), 1);
assert.equal(
  await page.locator('#nutrition-protein-chart').getAttribute('preserveAspectRatio'),
  'xMidYMid meet'
);
assert.match(
  await page.locator('[data-nutrition="rolling-caption"]').textContent(),
  /3-day average/i
);
```

Keep existing calorie/protein/heatmap assertions.

- [ ] **Step 2: Bump service worker**

In `service-worker.js`: `life-hub-shell-v31` → `life-hub-shell-v32`.

- [ ] **Step 3: Run unit + browser suites**

```bash
npm test
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/browser/nutrition.spec.mjs service-worker.js
git commit -m "$(cat <<'EOF'
test: cover Nutrition chart polish; bump shell cache to v32

EOF
)"
```

---

## Spec coverage check

| Spec decision | Task |
|---------------|------|
| Day labels `meet` + readable viewBox | 3, 4 |
| Keep zero-fill; label 3-day avg | 3 (caption), 4 (rolling kept) |
| Clear animation so solid line stays | 2 |
| Remove Meal timing | 3, 4, 5 |
| Polyphenol score + vs-aim pill | 1, 3, 4 |
| Fat today red + per-day week markers | 1, 3, 4 |
| SW bump | 5 |

## Out of scope (do not implement here)

Brisket search/save refresh, CN writes, chat badge/avatars, macro-tile packing, skincare, Chadwick.
