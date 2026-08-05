# Layout & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Densify Nutrition macros (split + Na/Ca/Poly only), hide empty protein-by-meal slots, make Central Node protein chart-first, and add a Skincare consistency strip with a stronger current-routine card.

**Architecture:** Surgical HTML/CSS/render/model changes per surface. Reuse Fitness week-dots pattern for Skincare. Enable existing `buildAreaLine` rolling average on the CN week chart without rebuilding the full Nutrition chart suite.

**Tech Stack:** Vanilla JS PWA, SVG chart-kit, node:test.

**Spec:** `docs/superpowers/specs/2026-08-06-layout-polish-design.md`

**Deploy:** Local commits only; do not push unless Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `index.html` | Remove E/P/F nutrition tiles; reorder CN protein card; skincare strip host; meal breakdown shell |
| `js/app/render-nutrition.js` | Filter meal breakdown; stop requiring removed ring tiles |
| `js/app/render-central-node.js` | Chart before prose; rolling + caption; omit empty week prose |
| `js/app/nutrition-charts.js` | Pass `rollingAverage: 3` from CN chart builder (or call site) |
| `js/app/skincare-model.js` | `weekDots` (+ optional streak) from last 7 days of skincare events |
| `js/app/render-skincare.js` | Strip, Now chip, current-card emphasis, compact procedure list |
| `css/app.css` | 3-tile grid, CN caption, skincare strip / current / procedures |
| `tests/unit/*` | Cover each surface |
| `tests/browser/*` | Update Nutrition assertions if they target removed tiles |
| `service-worker.js` | `v34` → `v35` |

---

### Task 1: Nutrition macro packing (Na/Ca/Poly only)

**Files:**
- Modify: `index.html` (remove Energy, Protein, Fat articles inside `.nutrition-grid`)
- Modify: `js/app/render-nutrition.js` (`renderMacroRings` — only sodium/calcium; keep setText for calories/protein/fat on macro-split only — remove setText targeting removed grid nodes OR leave no-ops)
- Modify: `css/app.css` if needed (`.nutrition-grid` stays 3-col)
- Test: `tests/unit/render-nutrition.test.js` (create if missing) and/or update `tests/browser/nutrition.spec.mjs`

- [ ] **Step 1: Write failing test**

Prefer a focused unit render test with a minimal FakeDocument containing `#nutrition-dashboard`, macro-split nodes, and a `.nutrition-grid` with only Na/Ca/Poly after the HTML change — or assert via string/DOM fixture:

```js
test('nutrition grid no longer includes energy/protein/fat tile rings', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  // Within nutrition-dashboard … nutrition-grid section:
  assert.equal((html.match(/data-nutrition-ring="calories"/g) ?? []).length, 0);
  assert.equal((html.match(/data-nutrition-ring="protein"/g) ?? []).length, 0);
  assert.equal((html.match(/data-nutrition-ring="fat"/g) ?? []).length, 0);
  assert.match(html, /data-nutrition-ring="sodium"/);
  assert.match(html, /data-nutrition-ring="calcium"/);
  assert.match(html, /data-nutrition="polyphenol"/);
  assert.match(html, /id="nutrition-macro-split"/); // split remains
});
```

Put this in `tests/unit/web-assets.test.js` or a new `tests/unit/nutrition-layout.test.js`.

**Required browser fix in this task:** `tests/browser/nutrition.spec.mjs` currently asserts `[data-nutrition="calories"]` / protein / fat on the **grid**. Those nodes are removed. Update to:

- Macro split: `[data-split="protein"]`, `[data-split="fat"]`, `[data-split="energy"]` (or keep chart assertions only)
- Keep `[data-meal-protein="breakfast"]` etc. until Task 2 changes meal rendering
- Keep sodium/calcium/polyphenol if useful

- [ ] **Step 2: Run — expect FAIL** (tiles still in HTML)

```bash
node --test tests/unit/nutrition-layout.test.js
```

- [ ] **Step 3: Implement**

In `index.html`, delete the three `<article>` blocks for Energy, Protein, and Fat inside `.nutrition-grid` (keep Sodium, Calcium, Polyphenols).

In `render-nutrition.js`:
- Remove `setText` calls for `[data-nutrition="calories|protein|fat"]` and matching `[data-target="nutrition-*"]` **if** those nodes no longer exist (macro-split uses `data-split=*`).
- Slim `renderMacroRings` to only `sodium` and `calcium`.

Optional CSS: `.nutrition-grid { grid-template-columns: repeat(3, 1fr); }` already correct; on mobile `@media` 2-col may leave one orphan — acceptable.

- [ ] **Step 4: Run tests — PASS** (unit + adjust browser suite locally if needed)

```bash
node --test tests/unit/nutrition-layout.test.js
# if browser nutrition.spec fails on removed nodes, fix assertions in same commit
```

- [ ] **Step 5: Commit**

```bash
git add index.html js/app/render-nutrition.js css/app.css tests/unit/nutrition-layout.test.js tests/browser/nutrition.spec.mjs
git commit -m "$(cat <<'EOF'
feat: pack Nutrition macros to split plus micronutrient row

EOF
)"
```

---

### Task 2: Hide empty protein-by-meal slots

**Files:**
- Modify: `js/app/render-nutrition.js`
- Modify: `index.html` (meal breakdown `dl` can start empty; label stays)
- Test: `tests/unit/render-nutrition-meals.test.js` or extend nutrition-layout / new render test

- [ ] **Step 1: Write failing test**

```js
test('protein by meal lists only slots with protein_g > 0', () => {
  const root = fakeNutritionRoot(); // includes .meal-breakdown dl
  renderNutrition(root, modelWithBreakfastAndLunchOnly);
  const dl = root.querySelector('.meal-breakdown');
  const text = dl.textContent;
  assert.match(text, /Breakfast/);
  assert.match(text, /Lunch/);
  assert.equal(text.includes('Dinner'), false);
  assert.equal(text.includes('Snack'), false);
  assert.equal(text.includes('0 g'), false);
});

test('protein by meal shows empty state when no meals', () => {
  renderNutrition(root, modelWithZeroMeals);
  assert.match(root.querySelector('.meal-breakdown').textContent, /No meals logged yet/);
});
```

Build a minimal FakeDocument patterned after other render tests, or extract `renderMealBreakdown(root, meals)` for easier testing.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Replace the static setText loop with:

```js
function renderMealBreakdown(root, meals) {
  const dl = root.querySelector('.meal-breakdown');
  if (!dl) return;
  const labels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  const entries = Object.entries(meals ?? {}).filter(([, v]) => Number(v?.protein_g) > 0);
  dl.replaceChildren();
  if (entries.length === 0) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No meals logged yet.';
    dl.append(empty); // or replace dl's parent content — if p-in-dl is awkward, clear dt/dd and put empty on the card:
    return;
  }
  for (const [meal, values] of entries) {
    const dt = root.createElement('dt');
    dt.textContent = labels[meal] ?? meal;
    const dd = root.createElement('dd');
    dd.dataset.mealProtein = meal;
    dd.textContent = `${values.protein_g} g`;
    dl.append(dt, dd);
  }
}
```

Prefer putting the empty state **outside** the `dl` if validators complain — e.g. `[data-meal-breakdown-empty]` sibling, hide `dl` when empty:

```html
<p data-meal-breakdown-empty class="metric-caption" hidden>No meals logged yet.</p>
<dl class="meal-breakdown"></dl>
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add index.html js/app/render-nutrition.js tests/unit/*.js
git commit -m "$(cat <<'EOF'
feat: hide empty Nutrition protein-by-meal slots

EOF
)"
```

---

### Task 3: Central Node protein chart-first

**Files:**
- Modify: `index.html` — reorder: label → svg (+ rolling path) → caption → prose div
- Modify: `js/app/render-central-node.js` — `renderWeekChart` with rolling; omit empty `thisWeek` prose
- Modify: `js/app/nutrition-charts.js` — default or accept `rollingAverage: 3`
- Test: `tests/unit/render-central-node.test.js` (create) or extend existing

- [ ] **Step 1: Write failing tests**

```js
test('protein this week markup places chart before this-week prose', () => {
  const html = readFileSync(...index.html...);
  const weekCard = html.slice(html.indexOf('central-node-week-label'), html.indexOf('central-node-month-label'));
  assert.ok(weekCard.indexOf('central-node-week-chart') < weekCard.indexOf('data-central-node="this-week"'));
  assert.match(weekCard, /Dotted = 3-day average/);
  assert.match(weekCard, /data-role="rolling"/);
});

test('renderCentralNode omits empty this-week prose and draws rolling path', () => {
  // Fake root with week card structure; model.sections.thisWeek = ''; model.week = seven days
  renderCentralNode(root, model);
  const prose = root.querySelector('[data-central-node="this-week"]');
  assert.equal(prose.hidden || prose.textContent.trim() === '', true);
  const rolling = root.querySelector('#central-node-week-chart [data-role="rolling"]');
  assert.ok(rolling.getAttribute('d')); // or not hidden
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`index.html` protein card:

```html
<article class="metric-card chart-card" aria-labelledby="central-node-week-label">
  <p class="metric-label" id="central-node-week-label">Protein this week</p>
  <svg id="central-node-week-chart" class="line-chart" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Protein grams over the last 7 days">
    <path data-role="area" d=""></path>
    <path data-role="line" d=""></path>
    <path data-role="rolling" d="" hidden></path>
    <g data-role="day-labels"></g>
  </svg>
  <p class="metric-caption" data-central-node="rolling-caption">Dotted = 3-day average</p>
  <div data-central-node="this-week" class="prose-section"></div>
</article>
```

`renderWeekChart`: call `buildProteinLineChart(week, { rollingAverage: 3 })` and wire rolling path like Nutrition’s `renderNamedAreaChart`.

In `renderCentralNode` loop for `thisWeek`: if `!model.sections.thisWeek?.trim()`, clear prose and `hidden = true` (or skip markdown); else show and render markdown. Do **not** write “No agent notes yet.” on this card (Status hybrid keeps that).

Update `buildProteinLineChart` to forward `rollingAverage` via `...rest` into `buildAreaLine` (already spreads rest — verify `rollingAverage` isn’t stripped).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add index.html js/app/render-central-node.js js/app/nutrition-charts.js tests/unit/
git commit -m "$(cat <<'EOF'
feat: chart-first Central Node protein week card

EOF
)"
```

---

### Task 4: Skincare consistency strip + current card

**Files:**
- Modify: `js/app/skincare-model.js`
- Modify: `js/app/render-skincare.js`
- Modify: `index.html` — strip host under heading
- Modify: `css/app.css`
- Test: `tests/unit/skincare-model.test.js` (extend) + render test

- [ ] **Step 1: Write failing tests**

```js
test('buildSkincareModel exposes weekDots for last 7 days', () => {
  const model = buildSkincareModel({
    events: [
      { record: { type: 'skincare', date: '2026-07-30', routine: 'am' }, body: '' },
      { record: { type: 'skincare', date: '2026-07-28', routine: 'pm' }, body: '' }
    ],
    date: '2026-07-30',
    routines: SKINCARE_ROUTINES,
    nowHourKey: 'am'
  });
  assert.equal(model.weekDots.length, 7);
  assert.equal(model.weekDots.at(-1).date, '2026-07-30');
  assert.equal(model.weekDots.at(-1).logged, true);
  assert.equal(model.weekDots.find(d => d.date === '2026-07-29').logged, false);
  assert.equal(model.weekDots.find(d => d.date === '2026-07-28').logged, true);
});

test('renderSkincare marks current card and shows Now chip', () => {
  // assert [data-current=true] has .skincare-card--current and a Now chip
});
```

Use `addCalendarDays` / `enumerateDateKeys` from `js/core/time.js` like other models.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Model — any skincare event that day counts as logged (AM/PM/procedure):

```js
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

// inside buildSkincareModel, after date validated:
const weekStart = addCalendarDays(date, -6);
const weekKeys = enumerateDateKeys(weekStart, date);
const loggedDates = new Set(
  (events ?? [])
    .filter(e => e.record?.type === 'skincare')
    .map(e => e.record.date)
);
const weekDots = weekKeys.map(day => ({
  date: day,
  logged: loggedDates.has(day),
  isToday: day === date
}));
```

HTML:

```html
<div id="skincare-week-dots" class="skincare-week-dots" aria-label="Skincare logged last 7 days"></div>
```

Render strip like Fitness:

```js
const dots = root.querySelector('#skincare-week-dots');
if (dots) {
  dots.replaceChildren();
  for (const day of model.weekDots ?? []) {
    const el = root.createElement('span');
    el.dataset.hit = String(day.logged);
    if (day.isToday) el.dataset.today = 'true';
    el.title = day.date;
    dots.append(el);
  }
}
```

Current card:

```js
card.className = 'metric-card skincare-card';
if (model.currentRoutine === key) {
  card.dataset.current = 'true';
  card.classList?.add?.('skincare-card--current');
  const chip = root.createElement('span');
  chip.className = 'skincare-now-chip';
  chip.textContent = 'Now';
  heading.append(' ', chip);
}
```

Procedures — use a `ul.skincare-procedure-list` with `li` rows (`notes` truncated one line).

CSS — mirror `.fitness-week-dots` spacing; accent border on `.skincare-card--current`; quieter non-current optional `opacity: 0.92`.

- [ ] **Step 4: Run — PASS**

```bash
node --test tests/unit/skincare-model.test.js tests/unit/render-skincare.test.js
```

- [ ] **Step 5: Commit**

```bash
git add index.html js/app/skincare-model.js js/app/render-skincare.js css/app.css tests/unit/
git commit -m "$(cat <<'EOF'
feat: skincare consistency strip and stronger current routine

EOF
)"
```

---

### Task 5: SW bump + full verify

**Files:**
- Modify: `service-worker.js` (`life-hub-shell-v34` → `v35`)

- [ ] **Step 1: Bump cache name**

- [ ] **Step 2: Full suites**

```bash
npm test
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm run test:browser
```

Expected: all pass. Use full permissions if browser sandbox SIGSEGV; `npm install` in worktree if `js-yaml` missing.

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "$(cat <<'EOF'
chore: bump shell cache after layout polish

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Macro-split + Na/Ca/Poly only | 1 |
| Hide empty meal slots / empty state | 2 |
| CN chart-first, caption, omit empty prose | 3 |
| Skincare dots + Now + procedures | 4 |
| SW bump | 5 |

## Out of scope

CN full Nutrition chart-kit parity beyond rolling+caption; skincare rings/charts; Chadwick builder.
