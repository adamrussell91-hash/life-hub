# Body Long-Term Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the full Notion Body Data Record into `life-hub-data` and rebuild the Body tab as a long-term trend view (Month / 6M / Year / 5Y) with accordion aggregation, taller smooth labeled charts, and tape metrics two-up.

**Architecture:** Extract a pure body-log parser under `scripts/lib/` and wire `--body-log` into `import-notion-history.mjs`. Update `body-model.js` ranges + series aggregation. Extend `buildAreaLine` with padded min–max Y scaling. Rebuild `render-body.js` / CSS / HTML for charts and tape grid. Keep quick-log and Sara confirm paths unchanged.

**Tech Stack:** Vanilla JS PWA, SVG chart-kit, Node `scripts/*.mjs`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-11-body-long-term-trends-design.md`

**Deploy:** Local commits only; do not push unless Adam asks. Import writes go to `../life-hub-data` (sibling repo), not the app shell tree.

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/lib/body-log-import.mjs` | Pure parse of Body Data Record prose → weight/composition event specs |
| `scripts/import-notion-history.mjs` | Add `--body-log`; call parser; write events |
| `tests/unit/body-log-import.test.js` | Parser unit tests |
| `js/app/body-model.js` | Ranges Month/6M/Year/5Y; accordion aggregation; range labels |
| `tests/unit/body-model.test.js` | Range windows + aggregation + growth |
| `js/app/chart-kit/area-line.js` | Optional padded min–max Y domain |
| `tests/unit/chart-kit-area-line.test.js` | Assert padded scaling (create if missing) |
| `js/app/render-body.js` | Taller charts, value labels, dots, tape 2-up grid |
| `index.html` | Range buttons Month / 6M / Year / 5Y |
| `css/app.css` | Chart height, tape grid, value-label readability on body charts |
| `js/app/app-controller.js` | Default `bodyRange = 'six_month'` |
| `service-worker.js` | Bump shell cache after UI ships |

---

### Task 1: Body Data Record parser (pure)

**Files:**
- Create: `scripts/lib/body-log-import.mjs`
- Create: `tests/unit/body-log-import.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBodyLogMarkdown, parseBodyLogLine } from '../../scripts/lib/body-log-import.mjs';

test('parseBodyLogLine extracts weight and body fat', () => {
  const events = parseBodyLogLine('19 May 2015: weight 88.5 kg, body fat 21.2%');
  assert.equal(events.length, 1);
  assert.equal(events[0].slug, 'composition');
  assert.equal(events[0].record.type, 'composition');
  assert.equal(events[0].record.date, '2015-05-19');
  assert.equal(events[0].record.weight_kg, 88.5);
  assert.equal(events[0].record.body_fat_pct, 21.2);
  assert.equal(events[0].record.time, '12:00');
  assert.equal(events[0].record.source, 'notion_import');
});

test('parseBodyLogLine weight-only and fat-only', () => {
  const weight = parseBodyLogLine('19 May 2026: weight 88 kg');
  assert.equal(weight[0].slug, 'weight');
  assert.equal(weight[0].record.weight_kg, 88);

  const fat = parseBodyLogLine('6 Nov 2014: body fat 19.8%');
  assert.equal(fat[0].slug, 'composition');
  assert.equal(fat[0].record.body_fat_pct, 19.8);
  assert.equal(fat[0].record.weight_kg, undefined);
});

test('parseBodyLogLine same-day a/b get distinct slugs and ids', () => {
  const a = parseBodyLogLine('26 Dec 2019 (a): body fat 36.1%');
  const b = parseBodyLogLine('26 Dec 2019 (b): body fat 36.5%');
  assert.equal(a[0].record.date, '2019-12-26');
  assert.equal(b[0].record.date, '2019-12-26');
  assert.equal(a[0].slug, 'composition-a');
  assert.equal(b[0].slug, 'composition-b');
  assert.notEqual(a[0].record.id, b[0].record.id);
});

test('parseBodyLogMarkdown skips headings and counts dated lines', () => {
  const md = `# Title

### 2015

19 May 2015: weight 88.5 kg, body fat 21.2%
21 Jul 2015: weight 89.55 kg

## Tape measurements

Chest 99 cm
`;
  const events = parseBodyLogMarkdown(md);
  assert.equal(events.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/body-log-import.test.js`

Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement parser**

Create `scripts/lib/body-log-import.mjs`:

```js
import { sydneyLocalStamp } from '../../js/core/time.js';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const LINE_RE = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*\(([a-z])\))?\s*:\s*(.+)$/i;

export function parseBodyLogDate(prefix) {
  // unused if LINE_RE captures — keep date helper inline in parseBodyLogLine
}

export function parseBodyLogLine(line) {
  const trimmed = String(line || '').trim();
  const match = LINE_RE.exec(trimmed);
  if (!match) return [];
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return [];
  const dateKey = `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  const suffix = match[4] ? match[4].toLowerCase() : '';
  const rest = match[5];
  const notes = rest.includes('(') ? rest.slice(rest.indexOf('(')).replace(/^\(|\)$/g, '').trim() : '';

  const weightMatch = /weight\s+([\d.]+)\s*kg/i.exec(rest);
  const fatMatch = /body\s*fat\s+([\d.]+)\s*%/i.exec(rest);
  const weight = weightMatch ? Number(weightMatch[1]) : null;
  const bodyFat = fatMatch ? Number(fatMatch[1]) : null;
  if (weight == null && bodyFat == null) return [];

  const bodyTime = '12:00';
  const bodyStamp = sydneyLocalStamp(dateKey, bodyTime);
  const idSuffix = suffix ? `-${suffix}` : '';

  if (weight != null && bodyFat != null) {
    return [{
      slug: suffix ? `composition-${suffix}` : 'composition',
      notes,
      record: {
        schema_version: 1,
        id: `notion-composition-${dateKey}${idSuffix}`,
        type: 'composition',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight,
        body_fat_pct: bodyFat
      }
    }];
  }
  if (weight != null) {
    return [{
      slug: suffix ? `weight-${suffix}` : 'weight',
      notes,
      record: {
        schema_version: 1,
        id: `notion-weight-${dateKey}${idSuffix}`,
        type: 'weight',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight
      }
    }];
  }
  return [{
    slug: suffix ? `composition-${suffix}` : 'composition',
    notes,
    record: {
      schema_version: 1,
      id: `notion-composition-${dateKey}${idSuffix}`,
      type: 'composition',
      date: dateKey,
      time: bodyTime,
      created_at: bodyStamp,
      updated_at: bodyStamp,
      source: 'notion_import',
      body_fat_pct: bodyFat
    }
  }];
}

export function parseBodyLogMarkdown(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    // Stop at tape / AEKE section headers so prose measurement blocks are not misread
    if (/^##\s+(Tape measurements|AEKE)/i.test(line.trim())) break;
    events.push(...parseBodyLogLine(line));
  }
  return events;
}
```

Fix notes extraction if needed: prefer capturing trailing parenthetical after values without stripping the whole rest. Keep notes optional; empty string is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unit/body-log-import.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/body-log-import.mjs tests/unit/body-log-import.test.js
git commit -m "$(cat <<'EOF'
feat(import): parse Notion body data record prose

Add a pure parser for dated weight/body-fat lines so long-term Body history can be imported.
EOF
)"
```

---

### Task 2: Wire `--body-log` into import script

**Files:**
- Modify: `scripts/import-notion-history.mjs`

- [ ] **Step 1: Extend CLI args and write loop**

Near the top, after existing arg resolves:

```js
import { parseBodyLogMarkdown } from './lib/body-log-import.mjs';

// in parseArgs:
else if (arg === '--body-log') out.bodyLog = argv[++i];

const bodyLog = args.bodyLog ? resolve(args.bodyLog) : null;

// usage guard:
if (!workoutsDir && !bodyCsv && !bodyDir && !bodyLog) {
  console.error('Provide --workouts and/or --body-csv and/or --body-dir and/or --body-log and --out <life-hub-data>');
  process.exit(1);
}
```

After `bodyDir` block:

```js
if (bodyLog) {
  const text = readFileSync(bodyLog, 'utf8');
  const events = parseBodyLogMarkdown(text);
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}
```

Include `bodyLog` path in the final JSON log for debugging.

- [ ] **Step 2: Dry-run import (no force) against Adam’s file**

Run:

```bash
node scripts/import-notion-history.mjs \
  --body-log "/Users/adamrussell/Downloads/Private & Shared 12/Body Data Record Weight, Body Fat and Measurements 3b9f794f84768016935ce337a1e6c93c.md" \
  --body-csv "/Users/adamrussell/Downloads/Private & Shared 4/Chadwick Flexington/📏 Body Measurements 53f162df8c284691978285e3babbe4c8_all.csv" \
  --body-dir "/Users/adamrussell/Downloads/Private & Shared 4/Chadwick Flexington/📏 Body Measurements" \
  --out "/Users/adamrussell/Documents/Claude/Projects/life-hub-data"
```

Expected: JSON with `bodyCount` roughly ≥ 200 from the log plus CSV/dir events; files under `life-hub-data/data/body/`. Spot-check:

```bash
ls "/Users/adamrussell/Documents/Claude/Projects/life-hub-data/data/body/2015/05/"
ls "/Users/adamrussell/Documents/Claude/Projects/life-hub-data/data/body/2019/12/"
head -20 "/Users/adamrussell/Documents/Claude/Projects/life-hub-data/data/body/2026/07/2026-07-21-"*
```

- [ ] **Step 3: Commit script wiring only (data repo changes are outside this commit)**

```bash
git add scripts/import-notion-history.mjs
git commit -m "$(cat <<'EOF'
feat(import): add --body-log for historical weight and fat

Wire the Body Data Record parser into the Notion history importer.
EOF
)"
```

Note: `life-hub-data` writes are committed in that repo separately if Adam wants them versioned — do not add `life-hub-data` files into the life-hub app commit.

---

### Task 3: Body model — ranges + accordion aggregation

**Files:**
- Modify: `js/app/body-model.js`
- Modify: `tests/unit/body-model.test.js`
- Modify: `js/app/app-controller.js` (default range)

- [ ] **Step 1: Write failing range/aggregation tests**

Replace/extend `tests/unit/body-model.test.js`:

```js
import {
  BODY_RANGES,
  DEFAULT_BODY_RANGE,
  aggregateSeries,
  buildBodyModel,
  formatGrowthPercent,
  observationsFor,
  rangeGrowthPercent,
  rangeWindow,
  seriesInRange
} from '../../js/app/body-model.js';

test('BODY_RANGES are month 6M year 5Y', () => {
  assert.deepEqual(BODY_RANGES, ['monthly', 'six_month', 'year', 'five_year']);
  assert.equal(DEFAULT_BODY_RANGE, 'six_month');
});

test('rangeWindow covers monthly six_month year five_year', () => {
  assert.equal(rangeWindow('2026-08-05', 'monthly').days, 30);
  assert.equal(rangeWindow('2026-08-05', 'six_month').days, 182);
  assert.equal(rangeWindow('2026-08-05', 'year').days, 365);
  assert.equal(rangeWindow('2026-08-05', 'five_year').days, 1826);
  assert.throws(() => rangeWindow('2026-08-05', 'weekly'), /Unknown body range/);
});

test('aggregateSeries monthly means use bucket end date', () => {
  const points = [
    { date: '2026-01-10', value: 90 },
    { date: '2026-01-20', value: 88 },
    { date: '2026-02-05', value: 86 }
  ];
  const monthly = aggregateSeries(points, 'monthly');
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].date, '2026-01-31');
  assert.equal(monthly[0].value, 89);
  assert.equal(monthly[1].date, '2026-02-28');
  assert.equal(monthly[1].value, 86);
});

test('aggregateSeries half_year means', () => {
  const points = [
    { date: '2024-03-01', value: 100 },
    { date: '2024-08-01', value: 90 },
    { date: '2025-02-01', value: 80 }
  ];
  const half = aggregateSeries(points, 'half_year');
  assert.equal(half.length, 3);
  assert.equal(half[0].date, '2024-06-30');
  assert.equal(half[1].date, '2024-12-31');
  assert.equal(half[2].date, '2025-06-30');
});

test('seriesInRange uses raw for monthly and monthly means for six_month', () => {
  const obs = [
    { date: '2026-03-01', value: 92 },
    { date: '2026-03-15', value: 91 },
    { date: '2026-07-01', value: 88 },
    { date: '2026-08-01', value: 86 }
  ];
  const month = seriesInRange(obs, rangeWindow('2026-08-05', 'monthly'));
  assert.ok(month.every(p => ['2026-07-01', '2026-08-01'].includes(p.date) || p.date >= '2026-07-07'));
  const six = seriesInRange(obs, rangeWindow('2026-08-05', 'six_month'));
  assert.ok(six.length >= 2);
  assert.ok(six.every(p => p.date.endsWith('-30') || p.date.endsWith('-31') || p.date.endsWith('-28') || p.date.endsWith('-29')));
});
```

Keep existing growth / `buildBodyModel` tests; update any that pass `weekly`.

- [ ] **Step 2: Run tests — expect fail**

Run: `node --test tests/unit/body-model.test.js`

Expected: FAIL on new ranges / missing `aggregateSeries`.

- [ ] **Step 3: Implement model changes**

In `js/app/body-model.js`:

```js
export const BODY_RANGES = ['monthly', 'six_month', 'year', 'five_year'];
export const DEFAULT_BODY_RANGE = 'six_month';

const RANGE_DAYS = {
  monthly: 30,
  six_month: 182,
  year: 365,
  five_year: 1826
};

const RANGE_LABELS = {
  monthly: 'Month',
  six_month: '6M',
  year: 'Year',
  five_year: '5Y'
};

function lastDayOfMonth(year, month /* 1-12 */) {
  const next = new Date(Date.UTC(year, month, 1));
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

function monthBucketEnd(dateKey) {
  const [y, m] = dateKey.split('-').map(Number);
  return lastDayOfMonth(y, m);
}

function halfYearBucketEnd(dateKey) {
  const [y, m] = dateKey.split('-').map(Number);
  return m <= 6 ? `${y}-06-30` : `${y}-12-31`;
}

export function aggregateSeries(points, mode) {
  if (!points?.length) return [];
  if (mode === 'raw') return points.map(p => ({ date: p.date, value: p.value }));
  const keyFn = mode === 'monthly' ? monthBucketEnd : halfYearBucketEnd;
  const buckets = new Map();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const key = keyFn(point.date);
    const list = buckets.get(key) ?? [];
    list.push(point.value);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value: values.reduce((s, n) => s + n, 0) / values.length
    }));
}

export function seriesInRange(observations, { from, to, days }, rangeKey) {
  const inRange = observations.filter(point => point.date >= from && point.date <= to);
  let mode = 'raw';
  if (rangeKey === 'six_month' || rangeKey === 'year') mode = 'monthly';
  if (rangeKey === 'five_year') mode = 'half_year';
  // legacy: if rangeKey omitted, infer from days
  if (rangeKey == null) {
    if (days > 900) mode = 'half_year';
    else if (days > 90) mode = 'monthly';
  }
  return aggregateSeries(inRange, mode);
}
```

Update `metricModel` to pass `selectedRange` into `seriesInRange`. Update `buildBodyModel` `rangeLabel` via `RANGE_LABELS`. Remove `downsampleWeekly` import if unused.

In `js/app/app-controller.js`:

```js
let bodyRange = 'six_month';
```

- [ ] **Step 4: Run tests — expect pass**

Run: `node --test tests/unit/body-model.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/app/body-model.js tests/unit/body-model.test.js js/app/app-controller.js
git commit -m "$(cat <<'EOF'
feat(body): long-term ranges with accordion series aggregation

Replace weekly view with month/6M/year/5Y and compress points as the window grows.
EOF
)"
```

---

### Task 4: Chart kit — padded min–max Y scale

**Files:**
- Modify: `js/app/chart-kit/area-line.js`
- Create or modify: `tests/unit/chart-kit-area-line.test.js`

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaLine } from '../../js/app/chart-kit/area-line.js';

test('buildAreaLine padded domain does not pin min to zero', () => {
  const chart = buildAreaLine(
    [
      { date: '2026-01-01', value: 88 },
      { date: '2026-02-01', value: 90 },
      { date: '2026-03-01', value: 86 }
    ],
    { yDomain: 'padded', height: 160, width: 320 }
  );
  const ys = chart.points.map(p => p.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  assert.ok(spread > 20, 'padded domain should use vertical range');
  // zero-based would squash 86–90 near the top; padded should separate more
});
```

- [ ] **Step 2: Run — expect fail** (unknown option / no effect)

Run: `node --test tests/unit/chart-kit-area-line.test.js`

- [ ] **Step 3: Implement**

In `buildAreaLine` options add `yDomain = 'zero'` | `'padded'`.

When `yDomain === 'padded'`:

```js
const finite = values.filter(Number.isFinite);
const rawMin = Math.min(...finite);
const rawMax = Math.max(...finite);
const pad = Math.max((rawMax - rawMin) * 0.15, rawMax === rawMin ? 1 : 0);
const min = rawMin - pad;
const max = rawMax + pad;
const scaleY = value => plotBottom - ((value - min) / (max - min)) * (plotBottom - padding);
```

Keep default `'zero'` so Nutrition behaviour is unchanged.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add js/app/chart-kit/area-line.js tests/unit/chart-kit-area-line.test.js
git commit -m "$(cat <<'EOF'
feat(charts): optional padded min-max Y domain for trend lines

Let Body weight/tape charts use the series range instead of pinning to zero.
EOF
)"
```

---

### Task 5: Render Body — tall charts, labels, tape 2-up

**Files:**
- Modify: `js/app/render-body.js`
- Modify: `index.html` (range buttons)
- Modify: `css/app.css`
- Modify: `service-worker.js` (cache bump)

- [ ] **Step 1: Update HTML range control**

In `index.html` `#body-range-control`:

```html
<div id="body-range-control" class="body-range" role="group" aria-label="Body time range">
  <button type="button" data-body-range="monthly" aria-pressed="false">Month</button>
  <button type="button" data-body-range="six_month" class="is-active" aria-pressed="true">6M</button>
  <button type="button" data-body-range="year" aria-pressed="false">Year</button>
  <button type="button" data-body-range="five_year" aria-pressed="false">5Y</button>
</div>
```

- [ ] **Step 2: Rewrite metric chart rendering in `render-body.js`**

For each metric with series:

- SVG `viewBox="0 0 320 168"`, class `line-chart body-chart`
- Paths area + line as today
- Group `data-role="points"` with circles at each `built.points`
- Group `data-role="value-labels"` with text labels (1 decimal for kg/%/cm as appropriate — reuse `formatLatest` number style without unit, or with unit omitted)
- Call `buildAreaLine(series, { height: 168, yDomain: 'padded' })`

Format label helper:

```js
function formatPointLabel(metric, value) {
  if (metric.key === 'body_fat_pct') return value.toFixed(1);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
```

Empty window but latest present: show latest value + caption `No readings in this range.` (do not skip the metric block entirely for scale/composition when `latest` exists).

Tape section structure:

```js
const grid = root.createElement('div');
grid.className = 'body-tape-grid';
for (const metric of section.metrics) {
  if (metric.empty && !metric.latest) continue;
  grid.append(metricBlock(root, metric));
}
article.append(grid);
```

Update `RANGE_LABELS` export to Month / 6M / Year / 5Y.

- [ ] **Step 3: CSS**

```css
.line-chart.body-chart { aspect-ratio: 320 / 168; }
.body-chart { width: 100%; height: auto; min-height: 9.5rem; }
.body-tape-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem 1rem;
}
@media (max-width: 520px) {
  .body-tape-grid { grid-template-columns: 1fr; }
}
.body-tape-grid .body-metric {
  margin-bottom: 0;
  padding-bottom: 0.5rem;
  border-bottom: 0;
}
.body-chart [data-role="points"] circle {
  fill: var(--depth, #1c2a22);
  stroke: #fff;
  stroke-width: 1;
  r: 2.5;
}
.body-section .chart-value-label {
  font-size: 8px;
  fill: var(--muted);
}
```

Tune Scale/Composition accents unchanged.

- [ ] **Step 4: Bump service worker**

In `service-worker.js`: `life-hub-shell-v60` → `life-hub-shell-v61` (or current+1 if already bumped).

- [ ] **Step 5: Manual smoke**

Hard-refresh PWA, open Body: default 6M active; switch Month → 5Y; weight/fat charts show condensed labeled points when history is synced; tape two-up.

- [ ] **Step 6: Commit**

```bash
git add js/app/render-body.js index.html css/app.css service-worker.js
git commit -m "$(cat <<'EOF'
feat(body): long trend charts, point labels, and tape grid

Ship taller smooth Body charts with per-point values and two-up tape metrics.
EOF
)"
```

---

### Task 6: Verification sweep

- [ ] **Step 1: Run unit suites**

```bash
node --test tests/unit/body-log-import.test.js tests/unit/body-model.test.js tests/unit/chart-kit-area-line.test.js
```

Expected: all PASS.

- [ ] **Step 2: Confirm import artefacts**

```bash
find "/Users/adamrussell/Documents/Claude/Projects/life-hub-data/data/body" -name '*.md' | wc -l
```

Expected: well above the prior ~8 files (log alone ≈ 200 events).

- [ ] **Step 3: Final commit only if stray fixes remain**

If only docs/notes: skip empty commit.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Full Body Data Record import | 1–2 |
| Re-run CSV/dir | 2 dry-run command |
| Ranges Month/6M/Year/5Y, default 6M | 3 + HTML in 5 |
| Accordion raw / monthly / half-year | 3 |
| Smooth lines + value labels + taller charts | 4–5 |
| Min–max Y padding | 4 |
| Tape 2-up | 5 |
| Latest outside window still shown | 5 |
| No weekly | 3 + HTML |
| Quick-log / Sara unchanged | (no task — leave alone) |
| SW bump | 5 |
