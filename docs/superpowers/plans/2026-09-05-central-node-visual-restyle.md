# Central Node Visual Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `#central-node-dashboard` into a Clinical Glass masonry board that reuses existing chart-kit builders, without changing Hammond/Clare/Ann coordination or adding a sync fetch.

**Architecture:** Keep markdown extracts and the 30-day `loggingMonth` / `exerciseMonth` / `eatingMonth` arrays (Hammond’s `formatCentralNodeModelForPrompt` still reads those). Add derived year / weekly / edge / aging series in `central-node-model.js` from `latestResult.events` already in memory. `central-node-charts.js` holds adapters only — no new chart algorithms. `render-central-node.js` packs `#cn-board` and paints or honest-empties. FABs stay un-packed section children.

**Tech Stack:** Vanilla ESM, existing `chart-kit/*`, node:test, Playwright (`npm run test:browser`).

## Global Constraints

- Read surface only. Do not touch `persona.mjs`, `hammond-audit.mjs`, `hammond-audit.js`, `CROSS_AGENT_AGENT_NAMES`, chat routing, or PR #131 mailbox/audit contracts.
- Do not widen `CN_MODEL_WINDOW_DAYS` / `selectHammondEventEntries`. Year series are client-only filters of `latestResult.events`.
- Reuse existing chart-kit builders. Do not invent a chart type, packer, or palette.
- Colour: `CLINICAL_CHART_SLOTS` only. Override `stream.js` `WATCHLIST_SLOTS` at paint time. No CN-only hex. No `--high-sea` as body text.
- Packer numbers match Mind: gap `16`, columns `width >= 900 ? 3 : width >= 560 ? 2 : 1`. Filter `.cn-tile` only. Never pack `#central-node-audit-button` or `#central-node-chat-button`.
- Honest empty: keep the tile; no SVG blob; `Need ${need} ${unit}. ${have} so far.`
- No `#cn-tile-other-hubs` placeholder. No Tasks/Teaching fetch.
- Keep `loggingMonth` / `exerciseMonth` / `eatingMonth` (30 days) for Hammond prompt math.
- `CACHE_NAME` bump after shell HTML/CSS/JS change.

## File map

| File | Responsibility |
|---|---|
| `apps/life/js/app/central-node-charts.js` | `buildCompletionRing` plus adapters: week horizon metrics, cross-agent edges, domain weekly, year hit maps, governance heat series, trend scan |
| `apps/life/js/app/central-node-model.js` | Existing extracts + 30-day series unchanged; add `loggingYear`, `exerciseYear`, `eatingYear`, `domainWeekly`, `crossAgent`, `governanceOpen`, `governanceHeat` |
| `apps/life/index.html` | `#cn-board` tiles, new SVG hosts, heatmaps and `#central-node-week-chart` removed, FABs remain section children |
| `apps/life/css/app.css` | `#cn-board` / `.cn-tile` by extending Mind + tile-spacing selectors |
| `apps/life/js/app/render-central-node.js` | Pack, paint, honest empty; stop protein line and heatmaps |
| `apps/life/js/app/render-governance.js` | Unchanged list owner |
| `apps/life/js/app/app-controller.js` | No change — `buildCentralNodeModel(latestResult)` already carries `governanceLogMarkdown` |
| `apps/life/service-worker.js` | `CACHE_NAME` bump |
| Tests | `tests/unit/central-node-charts.test.js`, `central-node-model.test.js`, `render-central-node.test.js`, `tests/browser/central-node.spec.mjs` |

---

### Task 1: Chart-kit adapters

**Files:**
- Modify: `apps/life/js/app/central-node-charts.js`
- Test: `tests/unit/central-node-charts.test.js`
- Modify: `docs/superpowers/specs/2026-09-05-central-node-visual-restyle-design.md` (Status → Approved)

**Interfaces:**
- Consumes: `buildHorizonBands` input shape; `buildChordLayout` `{ themeA, themeB, count }`; `buildThemeTopography` `{ weeks, series }`; `buildWatchlistHeat` `{ term, points: [{ date, count }] }`; `buildRadialYear` `{ year, byDate }`; `getSydneyWeekStart` / `enumerateDateKeys` / `addCalendarDays` / `isCalendarDate` from `../core/time.js`
- Produces:
  - `weekHorizonMetrics(week) → [{ key: 'protein', points: [{ date, value }] }]`
  - `parseCrossAgentEdges(markdown) → { edges: [{ themeA, themeB, count }], details: [{ themeA, themeB, lines }] }`
  - `focusCrossAgentEdges(edges, { maxNodes = 8 }) → same edge objects, nodes capped at 8`
  - `recordDomain(type) → 'nutrition'|'fitness'|'diary'|'body'|'skincare'|null`
  - `CN_STREAM_DOMAINS = ['nutrition','fitness','diary','body','skincare']`
  - `buildDomainWeekly(events, date) → { weeks: string[], series: [{ key, values: number[] }] }`
  - `hitMapFromSeries(series, pred) → { [date]: 'hit' }`
  - `buildGovernanceHeatSeries(openEntries, today, { weekCount = 8 } = {}) → [{ term, points: [{ date, count }] }]`
  - `scanTrendBlocks(markdown, { limit = 3 } = {}) → { preview, rest, total }` where each block is `{ label, line }`

- [ ] **Step 1: Write the failing adapter tests**

Append to `tests/unit/central-node-charts.test.js` (keep the existing ring tests):

```js
import {
  buildCompletionRing,
  weekHorizonMetrics,
  parseCrossAgentEdges,
  focusCrossAgentEdges,
  recordDomain,
  buildDomainWeekly,
  hitMapFromSeries,
  buildGovernanceHeatSeries,
  scanTrendBlocks
} from '../../apps/life/js/app/central-node-charts.js';
import { buildHorizonBands } from '../../apps/life/js/app/chart-kit/horizon.js';
import { buildChordLayout } from '../../apps/life/js/app/chart-kit/chord-layout.js';
import { buildThemeTopography } from '../../apps/life/js/app/chart-kit/stream.js';
import { buildWatchlistHeat } from '../../apps/life/js/app/chart-kit/watchlist-heat.js';
import { getSydneyWeekStart } from '../../apps/life/js/core/time.js';

test('weekHorizonMetrics feeds buildHorizonBands from protein_g', () => {
  const metrics = weekHorizonMetrics([
    { date: '2026-07-24', protein_g: 40 },
    { date: '2026-07-25', protein_g: 80 }
  ]);
  assert.deepEqual(metrics, [{
    key: 'protein',
    points: [
      { date: '2026-07-24', value: 40 },
      { date: '2026-07-25', value: 80 }
    ]
  }]);
  const bands = buildHorizonBands(metrics, { width: 320, height: 24 });
  assert.equal(bands.length, 1);
  assert.equal(bands[0].rects.length, 2);
  assert.ok(bands[0].rects[1].opacity > bands[0].rects[0].opacity);
});

test('parseCrossAgentEdges counts Sender→Recipient and drops Clementine and arrowless lines', () => {
  const markdown = [
    '- Chadwick→Sara: AC flag.',
    '- Hammond→Ann: teaching handoff.',
    '- **Vera → Penelope:** weekend framed as escape.',
    '- Chadwick programming: no arrow here.',
    '- Clementine→Hammond: drop me.',
    '- Hammond→Clementine: drop me too.'
  ].join('\n');
  const { edges, details } = parseCrossAgentEdges(markdown);
  assert.equal(edges.length, 3);
  assert.deepEqual(
    edges.map(edge => `${edge.themeA}→${edge.themeB}:${edge.count}`).sort(),
    ['Chadwick→Sara:1', 'Hammond→Ann:1', 'Vera→Penelope:1']
  );
  const vera = details.find(row => row.themeA === 'Vera' && row.themeB === 'Penelope');
  assert.match(vera.lines.join(' '), /weekend framed/);
  const layout = buildChordLayout(edges);
  assert.ok(layout.themes.includes('Hammond'));
  assert.ok(layout.themes.includes('Ann'));
  assert.equal(layout.themes.includes('Clementine'), false);
});

test('focusCrossAgentEdges keeps the busiest nodes up to 8', () => {
  const edges = [];
  for (let i = 0; i < 10; i += 1) {
    edges.push({ themeA: 'Hammond', themeB: `Agent${i}`, count: 10 - i });
  }
  const focused = focusCrossAgentEdges(edges, { maxNodes: 8 });
  const nodes = new Set(focused.flatMap(edge => [edge.themeA, edge.themeB]));
  assert.ok(nodes.size <= 8);
  assert.ok(focused.every(edge => nodes.has(edge.themeA) && nodes.has(edge.themeB)));
});

test('buildDomainWeekly counts Life domains by Sydney week and omits empty keys', () => {
  const events = [
    { record: { type: 'meal', date: '2026-07-24' } },
    { record: { type: 'meal', date: '2026-07-24' } },
    { record: { type: 'workout', date: '2026-07-24' } },
    { record: { type: 'diary', date: '2026-07-30' } },
    { record: { type: 'mind_session', date: '2026-07-30' } },
    { record: { type: 'weight', date: '2026-07-24' } },
    { record: { type: 'skincare', date: '2026-07-24' } },
    { record: { type: 'goal', date: '2026-07-24' } }
  ];
  assert.equal(recordDomain('meal'), 'nutrition');
  assert.equal(recordDomain('mind_session'), 'diary');
  assert.equal(recordDomain('goal'), null);
  const weekly = buildDomainWeekly(events, '2026-07-30');
  assert.equal(weekly.weeks[0], getSydneyWeekStart('2026-01-01'));
  assert.equal(weekly.weeks.at(-1), getSydneyWeekStart('2026-07-30'));
  const byKey = Object.fromEntries(weekly.series.map(item => [item.key, item.values]));
  assert.equal(byKey.nutrition[weekly.weeks.indexOf(getSydneyWeekStart('2026-07-24'))], 2);
  assert.equal(byKey.diary[weekly.weeks.indexOf(getSydneyWeekStart('2026-07-30'))], 2);
  assert.equal(Object.hasOwn(byKey, 'fitness'), true);
  const chart = buildThemeTopography(weekly);
  assert.equal(chart.empty, false);
});

test('hitMapFromSeries keeps only predicate hits', () => {
  const map = hitMapFromSeries(
    [{ date: '2026-07-24', complete: true }, { date: '2026-07-25', complete: false }],
    day => day.complete
  );
  assert.deepEqual(map, { '2026-07-24': 'hit' });
});

test('buildGovernanceHeatSeries marks 1 on every week an item has already been open', () => {
  const series = buildGovernanceHeatSeries([
    { title: 'Sleep goal', entryType: 'Drift Detection', dateKey: '2026-07-13' },
    { title: 'No date', entryType: 'Escalation' }
  ], '2026-07-30', { weekCount: 4 });
  assert.equal(series.length, 2);
  const sleep = series.find(row => row.term === 'Sleep goal');
  assert.equal(sleep.points.length, 4);
  assert.equal(sleep.points.at(-1).date, getSydneyWeekStart('2026-07-30'));
  assert.ok(sleep.points.filter(point => point.count === 1).length >= 2);
  assert.ok(sleep.points[0].count === 0 || sleep.points[0].date >= '2026-07-13');
  const undated = series.find(row => row.term === 'No date');
  assert.equal(undated.points.every(point => point.count === 1), true);
  const heat = buildWatchlistHeat(series);
  assert.equal(heat.empty, false);
  assert.equal(heat.rows.length, 2);
});

test('scanTrendBlocks returns the first three **Label:** blocks', () => {
  const markdown = [
    '**Nutrition:**',
    '- Protein rising.',
    '**Exercise:**',
    '- EP is the anchor.',
    '**Health Trajectory:**',
    '- Entocort taper.',
    '**Work/Energy:**',
    '- Holidays.'
  ].join('\n');
  const scan = scanTrendBlocks(markdown);
  assert.equal(scan.total, 4);
  assert.equal(scan.preview.length, 3);
  assert.equal(scan.preview[0].label, 'Nutrition');
  assert.match(scan.preview[0].line, /Protein rising/);
  assert.equal(scan.rest.length, 1);
  assert.equal(scan.rest[0].label, 'Work/Energy');
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `node --test tests/unit/central-node-charts.test.js`

Expected: FAIL on `weekHorizonMetrics` (or first new import) with `SyntaxError` / `does not provide an export named 'weekHorizonMetrics'`. Existing ring tests still pass.

- [ ] **Step 3: Implement the adapters**

Replace `apps/life/js/app/central-node-charts.js` with:

```js
import { buildRingTarget } from './chart-kit/ring.js';
import { addCalendarDays, enumerateDateKeys, getSydneyWeekStart, isCalendarDate } from '../core/time.js';

export const CN_STREAM_DOMAINS = ['nutrition', 'fitness', 'diary', 'body', 'skincare'];

export function buildCompletionRing({ complete, total }, options = {}) {
  return buildRingTarget({ value: complete, target: total }, options);
}

export function weekHorizonMetrics(week = []) {
  return [{
    key: 'protein',
    points: (week ?? []).map(day => ({ date: day.date, value: Number(day.protein_g) || 0 }))
  }];
}

const EDGE_RE = /(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*→\s*(?:\*\*)?([A-Za-z][A-Za-z .']*?)(?:\*\*)?\s*:/;

function cleanAgent(name) {
  return String(name ?? '').replace(/\*+/g, '').trim();
}

function isClementine(name) {
  return cleanAgent(name).toLowerCase() === 'clementine';
}

export function parseCrossAgentEdges(markdown) {
  const tally = new Map();
  const details = new Map();
  for (const raw of String(markdown ?? '').split('\n')) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim();
    if (!line) continue;
    const match = EDGE_RE.exec(line);
    if (!match) continue;
    const themeA = cleanAgent(match[1]);
    const themeB = cleanAgent(match[2]);
    if (!themeA || !themeB || isClementine(themeA) || isClementine(themeB)) continue;
    const key = `${themeA}\0${themeB}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    const bucket = details.get(key) ?? { themeA, themeB, lines: [] };
    bucket.lines.push(line.replace(/^\*+|\*+$/g, '').trim());
    details.set(key, bucket);
  }
  const edges = [...tally.entries()].map(([key, count]) => {
    const [themeA, themeB] = key.split('\0');
    return { themeA, themeB, count };
  });
  return { edges, details: [...details.values()] };
}

export function focusCrossAgentEdges(edges = [], { maxNodes = 8 } = {}) {
  const ranked = [...edges].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const nodes = new Set();
  for (const edge of ranked) {
    if (nodes.size >= maxNodes) break;
    nodes.add(edge.themeA);
    if (nodes.size >= maxNodes) break;
    nodes.add(edge.themeB);
  }
  return ranked.filter(edge => nodes.has(edge.themeA) && nodes.has(edge.themeB));
}

export function recordDomain(type) {
  if (type === 'meal') return 'nutrition';
  if (type === 'workout') return 'fitness';
  if (type === 'diary' || type === 'mind_session') return 'diary';
  if (type === 'weight' || type === 'composition') return 'body';
  if (type === 'skincare') return 'skincare';
  return null;
}

export function buildDomainWeekly(events, date) {
  if (!isCalendarDate(date)) return { weeks: [], series: [] };
  const year = date.slice(0, 4);
  const from = `${year}-01-01`;
  const days = enumerateDateKeys(from, date);
  const weeks = [];
  for (const day of days) {
    const week = getSydneyWeekStart(day);
    if (weeks.at(-1) !== week) weeks.push(week);
  }
  const indexByWeek = new Map(weeks.map((week, index) => [week, index]));
  const valuesByKey = new Map(CN_STREAM_DOMAINS.map(key => [key, weeks.map(() => 0)]));
  for (const item of events ?? []) {
    const record = item?.record ?? item;
    const domain = recordDomain(record?.type);
    if (!domain || !isCalendarDate(record?.date) || record.date < from || record.date > date) continue;
    const index = indexByWeek.get(getSydneyWeekStart(record.date));
    if (index == null) continue;
    valuesByKey.get(domain)[index] += 1;
  }
  return {
    weeks,
    series: CN_STREAM_DOMAINS
      .map(key => ({ key, values: valuesByKey.get(key) }))
      .filter(item => item.values.some(value => value > 0))
  };
}

export function hitMapFromSeries(series, pred) {
  const byDate = {};
  for (const day of series ?? []) {
    if (day?.date && pred(day)) byDate[day.date] = 'hit';
  }
  return byDate;
}

export function buildGovernanceHeatSeries(openEntries, today, { weekCount = 8 } = {}) {
  if (!isCalendarDate(today)) return [];
  const thisWeek = getSydneyWeekStart(today);
  const weeks = [];
  for (let offset = weekCount - 1; offset >= 0; offset -= 1) {
    weeks.push(addCalendarDays(thisWeek, -offset * 7));
  }
  return (openEntries ?? []).map(entry => {
    const term = entry.title || entry.entryType || 'Open item';
    const opened = isCalendarDate(entry.dateKey) ? entry.dateKey : null;
    return {
      term,
      points: weeks.map(week => {
        const weekEnd = addCalendarDays(week, 6);
        const count = opened == null || opened <= weekEnd ? 1 : 0;
        return { date: week, count };
      })
    };
  });
}

export function scanTrendBlocks(markdown, { limit = 3 } = {}) {
  const blocks = [];
  const source = String(markdown ?? '');
  const re = /\*\*([^*]+):\*\*\s*([\s\S]*?)(?=\n\*\*|$)/g;
  let match = re.exec(source);
  while (match) {
    const body = match[2].trim().split('\n').find(line => line.trim()) ?? '';
    blocks.push({
      label: match[1].trim(),
      line: body.replace(/^[-*]\s*/, '').replace(/\s+/g, ' ').trim()
    });
    match = re.exec(source);
  }
  return {
    preview: blocks.slice(0, limit),
    rest: blocks.slice(limit),
    total: blocks.length
  };
}
```

Set spec header Status to `Approved (planning).`

- [ ] **Step 4: Re-run adapter tests**

Run: `node --test tests/unit/central-node-charts.test.js`

Expected: PASS (existing ring tests + new adapter tests).

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/central-node-charts.js tests/unit/central-node-charts.test.js docs/superpowers/specs/2026-09-05-central-node-visual-restyle-design.md
git commit -m "feat(cn): add chart-kit adapters for the visual restyle"
```

---

### Task 2: Derived model series (keep the 30-day arrays)

**Files:**
- Modify: `apps/life/js/app/central-node-model.js`
- Test: `tests/unit/central-node-model.test.js`

**Interfaces:**
- Consumes: Task 1 adapters; existing `getLoggingCompleteness` / `eatingTargetsForDay` / `workoutCompleted`; `openGovernanceEntries(markdown, today)` from `../core/governance-log.js`
- Produces: `buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown, date, governanceLogMarkdown })` still returns `week`, `loggingMonth`, `exerciseMonth`, `eatingMonth`, `sections`, `completeness`, `liveStatus`, plus:
  - `loggingYear: { date, complete }[]` — `YYYY-01-01` through `date`
  - `exerciseYear: { date, completed }[]`
  - `eatingYear: { date, hitEatingTargets }[]`
  - `domainWeekly: { weeks, series }`
  - `crossAgent: { edges, details }`
  - `governanceOpen: ReturnType<openGovernanceEntries>`
  - `governanceHeat: ReturnType<buildGovernanceHeatSeries>`

- [ ] **Step 1: Write failing model tests**

Append to `tests/unit/central-node-model.test.js`:

```js
import { getSydneyWeekStart } from '../../apps/life/js/core/time.js';
import { formatGovernanceEntry } from '../../apps/life/js/core/governance-log.js';

test('keeps the 30-day heatmap series for Hammond prompt math', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });
  assert.equal(model.loggingMonth.length, 30);
  assert.equal(model.exerciseMonth.length, 30);
  assert.equal(model.eatingMonth.length, 30);
});

test('adds year series from 1 Jan through the display date', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });
  assert.equal(model.loggingYear[0].date, '2026-01-01');
  assert.equal(model.loggingYear.at(-1).date, '2026-07-30');
  assert.equal(model.loggingYear.length, 211);
  assert.equal(model.loggingYear.find(day => day.date === '2026-07-24').complete, true);
  assert.equal(model.exerciseYear.find(day => day.date === '2026-07-29').completed, true);
  assert.equal(model.eatingYear.find(day => day.date === '2026-07-24').hitEatingTargets, true);
});

test('domainWeekly and crossAgent are derived, not fetched', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });
  assert.equal(model.domainWeekly.weeks[0], getSydneyWeekStart('2026-01-01'));
  assert.ok(model.domainWeekly.series.some(item => item.key === 'nutrition'));
  assert.deepEqual(
    model.crossAgent.edges.map(edge => `${edge.themeA}→${edge.themeB}`),
    ['Chadwick→Brisket']
  );
});

test('governanceHeat uses openGovernanceEntries and ignores resolved rows', () => {
  const log = [
    '# Governance Log',
    '',
    formatGovernanceEntry({
      dateKey: '2026-07-01',
      entryType: 'Drift Detection',
      title: 'Open loop',
      status: 'Still Active',
      body: 'Still open.'
    }),
    formatGovernanceEntry({
      dateKey: '2026-07-02',
      entryType: 'Major Decision',
      title: 'Done',
      status: 'Resolved',
      body: 'Closed.'
    })
  ].join('\n');
  const model = buildCentralNodeModel({
    events,
    targetsConfig,
    centralNodeMarkdown: markdown,
    date: '2026-07-30',
    governanceLogMarkdown: log
  });
  assert.equal(model.governanceOpen.length, 1);
  assert.equal(model.governanceOpen[0].title, 'Open loop');
  assert.equal(model.governanceHeat.length, 1);
  assert.equal(model.governanceHeat[0].term, 'Open loop');
  assert.equal(model.governanceHeat[0].points.length, 8);
});
```

If `formatGovernanceEntry` returns a string that already includes a trailing newline, join with `'\n'` as written. Do not invent a second parser.

- [ ] **Step 2: Run the new model tests and confirm they fail**

Run: `node --test tests/unit/central-node-model.test.js`

Expected: FAIL — `model.loggingYear` is `undefined`.

- [ ] **Step 3: Extend `buildCentralNodeModel`**

In `apps/life/js/app/central-node-model.js`:

1. Import adapters and `openGovernanceEntries`:

```js
import {
  buildDomainWeekly,
  buildGovernanceHeatSeries,
  parseCrossAgentEdges
} from './central-node-charts.js';
import { openGovernanceEntries } from '../core/governance-log.js';
```

2. Change the signature to read `governanceLogMarkdown` (already present on `latestResult`; `app-controller.js` does not change):

```js
export function buildCentralNodeModel({
  events,
  targetsConfig,
  centralNodeMarkdown,
  date,
  governanceLogMarkdown
}) {
```

3. After the existing `monthDates` block, add year dates and series. Keep the 30-day arrays exactly as they are.

```js
  const yearStart = `${date.slice(0, 4)}-01-01`;
  const yearDates = enumerateDateKeys(yearStart, date);
  const loggingYear = yearDates.map(day => {
    const completeness = getLoggingCompleteness(events, day);
    return { date: day, complete: completeness.complete === completeness.total };
  });
  const exerciseYear = yearDates.map(day => ({ date: day, completed: workoutCompleted(events, day) }));
  const eatingYear = yearDates.map(day => eatingTargetsForDay(events, day, targetsConfig));
  const domainWeekly = buildDomainWeekly(events, date);
  const crossAgent = parseCrossAgentEdges(extractCrossAgentCoordination(markdown));
  const governanceOpen = openGovernanceEntries(
    typeof governanceLogMarkdown === 'string' ? governanceLogMarkdown : '',
    date
  );
  const governanceHeat = buildGovernanceHeatSeries(governanceOpen, date);
```

4. Return those fields next to the existing ones. Do not remove `loggingMonth` / `exerciseMonth` / `eatingMonth`.

- [ ] **Step 4: Re-run model tests**

Run: `node --test tests/unit/central-node-model.test.js tests/unit/hammond-digest.test.js`

Expected: PASS. Hammond digest still sees 30-day series. `CN_MODEL_WINDOW_DAYS` is still 30.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/central-node-model.js tests/unit/central-node-model.test.js
git commit -m "feat(cn): derive year, stream, chord, and governance series"
```

---

### Task 3: Board markup and chrome CSS

**Files:**
- Modify: `apps/life/index.html` (the `#central-node-dashboard` block only)
- Modify: `apps/life/css/app.css`
- Test: `tests/unit/render-central-node.test.js` (HTML-order assertions)

**Interfaces:**
- Consumes: locked kickers and host ids from the spec
- Produces: `#cn-board` containing `.cn-tile` articles; hosts `#central-node-week-horizon`, `#central-node-radial-year`, `#central-node-stream`, `#central-node-chord`, `#central-node-governance-heat`, `[data-cn="chord-detail"]`, `[data-role="trend-scan"]`; FABs remain direct children of `#central-node-dashboard`, not of `#cn-board`

- [ ] **Step 1: Write the failing markup tests**

Replace the existing `protein this week markup…` test in `tests/unit/render-central-node.test.js` with:

```js
test('central node board markup packs tiles and unmounts the protein line and heatmaps', () => {
  const html = readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="central-node-dashboard"');
  const end = html.indexOf('hub-mobile-nav');
  const block = html.slice(start, end);

  assert.match(block, /id="cn-board"/);
  assert.match(block, /id="cn-tile-status"[\s\S]*cn-tile__question">Has today been logged\?/);
  assert.match(block, /id="cn-tile-week"[\s\S]*How is protein moving\?/);
  assert.match(block, /id="cn-tile-month"[\s\S]*What’s on the month\?/);
  assert.match(block, /id="cn-tile-trends"[\s\S]*Where is attention going\?/);
  assert.match(block, /id="cn-tile-radial"[\s\S]*Who showed up this year\?/);
  assert.match(block, /id="cn-tile-governance"[\s\S]*What’s still open\?/);
  assert.match(block, /id="cn-tile-cross-agent"[\s\S]*Who is handing off to whom\?/);
  assert.match(block, /id="cn-tile-actions"[\s\S]*What just happened\?/);
  assert.match(block, /id="cn-tile-constraints"[\s\S]*What still binds\?/);
  assert.match(block, /id="central-node-week-horizon"/);
  assert.match(block, /id="central-node-radial-year"/);
  assert.match(block, /id="central-node-stream"/);
  assert.match(block, /id="central-node-chord"/);
  assert.match(block, /id="central-node-governance-heat"/);
  assert.equal(block.includes('central-node-week-chart'), false);
  assert.equal(block.includes('central-node-logging-heatmap'), false);
  assert.equal(block.includes('central-node-exercise-heatmap'), false);
  assert.equal(block.includes('central-node-eating-heatmap'), false);
  assert.ok(block.indexOf('id="cn-board"') < block.indexOf('id="central-node-audit-button"'));
  assert.ok(block.indexOf('id="cn-board"') < block.indexOf('id="central-node-chat-button"'));
  assert.match(block, /id="central-node-audit-button"[\s\S]*Run audit/);
  assert.match(block, /id="central-node-chat-button"/);
  const week = block.slice(block.indexOf('id="cn-tile-week"'), block.indexOf('id="cn-tile-month"'));
  assert.ok(week.indexOf('central-node-week-horizon') < week.indexOf('data-central-node="this-week"'));
});
```

- [ ] **Step 2: Run the markup test and confirm it fails**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — `#cn-board` missing. The old “protein this week markup” test is gone, so it must not still assert `#central-node-week-chart`.

- [ ] **Step 3: Replace the dashboard markup**

In `apps/life/index.html`, replace the entire `<section id="central-node-dashboard" …>` through its closing `</section>` (leave `.hub-mobile-nav` untouched) with:

```html
        <section id="central-node-dashboard" class="dashboard" aria-label="Central Node" hidden>
          <div id="cn-board" class="cn-board">
            <article id="cn-tile-status" class="metric-card cn-tile" data-cn-span="2" aria-labelledby="todays-status-label">
              <p class="cn-tile__question">Has today been logged?</p>
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

            <article id="cn-tile-week" class="metric-card cn-tile" aria-labelledby="central-node-week-label">
              <p class="cn-tile__question">How is protein moving?</p>
              <p class="metric-label" id="central-node-week-label">This Week</p>
              <p class="cn-tile__legend">Each cell is a day. Darker is more protein.</p>
              <svg id="central-node-week-horizon" class="cn-horizon" viewBox="0 0 320 24" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Protein grams over the last 7 days"></svg>
              <div data-central-node="this-week" class="prose-section"></div>
            </article>

            <article id="cn-tile-month" class="metric-card cn-tile" aria-labelledby="central-node-month-label">
              <p class="cn-tile__question">What’s on the month?</p>
              <p class="metric-label" id="central-node-month-label">This Month</p>
              <div data-central-node="this-month" class="prose-section"></div>
            </article>

            <article id="cn-tile-trends" class="metric-card cn-tile" data-cn-span="2" aria-labelledby="central-node-trends-label">
              <p class="cn-tile__question">Where is attention going?</p>
              <p class="metric-label" id="central-node-trends-label">Long-Term Trends</p>
              <p class="cn-tile__legend">Ribbon thickness is logging volume that week.</p>
              <svg id="central-node-stream" class="cn-stream" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Weekly logging volume by Life domain"></svg>
              <div data-role="trend-scan"></div>
              <button type="button" data-role="trend-more" hidden>More</button>
              <div data-central-node="long-term-trends" class="prose-section" hidden></div>
            </article>

            <article id="cn-tile-radial" class="metric-card cn-tile" aria-labelledby="central-node-radial-label">
              <p class="cn-tile__question">Who showed up this year?</p>
              <p class="metric-label" id="central-node-radial-label">Year consistency</p>
              <p class="cn-tile__legend">Inner logging · mid exercise · outer eating.</p>
              <svg id="central-node-radial-year" class="cn-radial-year" viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Logging, exercise, and eating hits around the year"></svg>
            </article>

            <article id="cn-tile-governance" class="metric-card cn-tile" aria-labelledby="central-node-governance-label">
              <p class="cn-tile__question">What’s still open?</p>
              <p class="metric-label" id="central-node-governance-label">Governance Log</p>
              <p class="cn-tile__legend">Each row is an open item. Heat runs for every week it has already been open.</p>
              <div id="central-node-governance-heat" class="cn-watchlist-heat" aria-label="Open governance item aging"></div>
              <div data-central-node="governance-log" class="prose-section"></div>
            </article>

            <article id="cn-tile-cross-agent" class="metric-card cn-tile" aria-labelledby="central-node-cross-agent-label">
              <p class="cn-tile__question">Who is handing off to whom?</p>
              <p class="metric-label" id="central-node-cross-agent-label">Cross-Agent Coordination</p>
              <p class="cn-tile__legend">Arc is an agent. Ribbon is a handoff. Focus a mark to read the lines.</p>
              <svg id="central-node-chord" class="cn-chord" viewBox="0 0 360 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Who hands off to whom"></svg>
              <p class="metric-caption" data-cn="chord-detail"></p>
              <div data-central-node="cross-agent" class="prose-section" hidden></div>
            </article>

            <article id="cn-tile-actions" class="metric-card cn-tile" aria-labelledby="central-node-recent-actions-label">
              <p class="cn-tile__question">What just happened?</p>
              <p class="metric-label" id="central-node-recent-actions-label">Recent Agent Actions</p>
              <div data-central-node="recent-actions" class="prose-section"></div>
            </article>

            <details id="cn-tile-constraints" class="metric-card cn-tile constraints-card">
              <summary>
                <span class="cn-tile__question">What still binds?</span>
                <span class="metric-label">Constraints &amp; Priorities</span>
              </summary>
              <div data-central-node="constraints" class="prose-section"></div>
            </details>
          </div>

          <button id="central-node-audit-button" class="cn-audit-button" type="button">Run audit</button>
          <button id="central-node-chat-button" class="floating-chat-button" type="button" aria-label="Chat with Hammond">💬</button>
        </section>
```

- [ ] **Step 4: Extend chrome CSS**

In `apps/life/css/app.css`, next to the existing `.mind-board` / `.mind-tile__question` rules, add (extend, do not fork values):

```css
.cn-board { position: relative; min-height: 12rem; }
.cn-tile {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--radius-card, 12px);
  padding: var(--space-md, 16px);
  box-sizing: border-box;
}
.mind-tile__question,
.cn-tile__question {
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--text-xs, 0.7rem);
  color: var(--wave);
}
.mind-tile__legend,
.cn-tile__legend { color: var(--muted); margin: 0 0 12px; }
.mind-honest-empty,
.cn-honest-empty {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: var(--text-base);
}
#central-node-dashboard .cn-tile { position: relative; }
.cn-horizon,
.cn-stream,
.cn-radial-year,
.cn-chord { display: block; width: 100%; height: auto; }
.cn-horizon { aspect-ratio: 320 / 24; }
.cn-radial-year { aspect-ratio: 1; max-width: 16rem; margin-inline: auto; }
.cn-stream { aspect-ratio: 960 / 480; }
.cn-chord { aspect-ratio: 1; min-height: 16rem; }
.cn-watchlist-heat { display: grid; gap: var(--space-tile); }
.cn-watchlist-heat__row {
  display: grid;
  grid-template-columns: minmax(5rem, 8rem) repeat(8, minmax(0, 1fr)) auto;
  gap: var(--space-tile);
  align-items: center;
}
.cn-watchlist-heat__term { color: var(--marine); font-size: var(--text-xs); font-weight: 600; }
.cn-watchlist-heat__cell {
  aspect-ratio: 1;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--wave) calc(var(--heat, 0) * 1%), rgba(20, 43, 81, 0.08));
}
.cn-watchlist-heat__age { color: var(--muted); font-size: var(--text-xs); }
.constraints-card summary .cn-tile__question { display: block; }
```

Delete only CN-specific rules that exist solely for the three heatmap hosts inside `#central-node-dashboard` if any are orphaned. Do **not** delete the shared `.heatmap-grid` used by Nutrition/Fitness/Skincare.

- [ ] **Step 5: Re-run markup tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: the new markup test PASS. The remaining render tests may still look for `#central-node-week-chart` / heatmaps in the fake root — leave those for Task 4. If they fail because `readFileSync` tests were the only change, they should still pass until the renderer stops painting those hosts.

- [ ] **Step 6: Commit**

```bash
git add apps/life/index.html apps/life/css/app.css tests/unit/render-central-node.test.js
git commit -m "feat(cn): mount masonry board markup and tile chrome"
```

---

### Task 4: Packer, honest empty, prose rules

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`

**Interfaces:**
- Consumes: `packMasonry(items, { columns, gap, columnWidth, flowOffset })` from `./chart-kit/masonry.js`; Task 3 tile ids; `data-cn-span`
- Produces:
  - `packCnBoard(root)` — Mind’s numbers (`gap = 16`, `columns = width >= 900 ? 3 : width >= 560 ? 2 : 1`), tiles with class `cn-tile`, span from `dataset.cnSpan`
  - `paintChartOrEmpty(root, host, svg, { need, have, unit })` — class `cn-honest-empty mind-honest-empty metric-caption`, copy `Need ${need} ${unit}. ${have} so far.`
  - Empty This Week / This Month / Long-Term prose omitted (`hidden` + empty text). Today's Status still shows `No agent notes yet.` when empty
  - Constraints `toggle` listener calls `packCnBoard`
  - No `buildProteinLineChart`. No `renderHeatmap`

- [ ] **Step 1: Rewrite the fake root and add packer / empty-copy tests**

In `tests/unit/render-central-node.test.js`, change `FakeElement.getBoundingClientRect` to return `{ width: this._width ?? 0 }`. Give `#cn-board` `_width = 900` in the fake root. Add tile nodes with `id`, `className = 'cn-tile'`, `dataset.cnSpan`, `offsetHeight = 160`. Remove `#central-node-week-chart` and heatmap hosts. Add the new SVG hosts.

Add tests:

```js
test('packCnBoard uses Mind column breaks and ignores FABs', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 900 });
  renderCentralNode(root, baseModel());
  const board = root._board;
  const tiles = board.children.filter(node => node.className.includes('cn-tile'));
  assert.ok(tiles.length >= 8);
  assert.equal(tiles.every(tile => tile.style.position === 'absolute'), true);
  const status = tiles.find(tile => tile.id === 'cn-tile-status');
  assert.ok(Number.parseFloat(status.style.width) > 400);
  assert.equal(root._auditButton.style.position == null || root._auditButton.style.left == null, true);
});

test('packCnBoard is one column at 390 px', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 390 });
  renderCentralNode(root, baseModel());
  const tiles = root._board.children.filter(node => node.className.includes('cn-tile'));
  for (const tile of tiles) {
    assert.ok(Number.parseFloat(tile.style.width) >= 350);
  }
});

test('renderCentralNode omits empty this-month prose and keeps status fallback', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    sections: { ...baseModel().sections, thisWeek: '', thisMonth: '', todaysStatus: '' }
  }));
  assert.equal(root._sections['this-week'].hidden, true);
  assert.equal(root._sections['this-month'].hidden, true);
  assert.match(root._sections['todays-status'].textContent, /No agent notes yet/);
});
```

Delete `renderCentralNode draws a rolling average path on the week chart`. Keep the this-week prose show/hide tests, pointed at the new hosts.

`fakeCentralNodeRoot` must expose `_board`, `_auditButton`, tile stubs for every `cn-tile` id, and `querySelector` for `#cn-board`, `#cn-tile-status`, the new SVGs, `[data-cn="chord-detail"]`, `[data-role="trend-scan"]`, `[data-role="trend-more"]`, `#central-node-audit-button`.

- [ ] **Step 2: Run render tests and confirm packer tests fail**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — `#cn-board` not packed / `packMasonry` not called.

- [ ] **Step 3: Implement packer and prose rules**

Rewrite `apps/life/js/app/render-central-node.js` to this skeleton (charts in later tasks may no-op if hosts are empty). Do **not** import `nutrition-charts.js`.

```js
import { animateRingFill } from './chart-kit/animate.js';
import { packMasonry } from './chart-kit/masonry.js';
import { buildCompletionRing } from './central-node-charts.js';
import { renderInlineMarkdown } from './render-chat.js';

const TILE_FALLBACK_HEIGHT = 160;
const PACK_GAP = 16;

const SECTION_SELECTORS = {
  todaysStatus: '[data-central-node="todays-status"]',
  thisWeek: '[data-central-node="this-week"]',
  thisMonth: '[data-central-node="this-month"]',
  longTermTrends: '[data-central-node="long-term-trends"]',
  crossAgentCoordination: '[data-central-node="cross-agent"]',
  recentAgentActions: '[data-central-node="recent-actions"]',
  constraints: '[data-central-node="constraints"]'
};

export function renderCentralNode(root, model) {
  for (const [key, selector] of Object.entries(SECTION_SELECTORS)) {
    const container = root.querySelector(selector);
    if (!container) continue;
    const prose = model.sections?.[key]?.trim?.() ?? '';
    if (key === 'todaysStatus') {
      if (prose) renderInlineMarkdown(root, container, prose, { multiline: true });
      else container.textContent = 'No agent notes yet.';
      continue;
    }
    if (key === 'thisWeek' || key === 'thisMonth' || key === 'longTermTrends' || key === 'crossAgentCoordination') {
      if (prose && key !== 'longTermTrends' && key !== 'crossAgentCoordination') {
        renderInlineMarkdown(root, container, prose, { multiline: true });
        container.removeAttribute('hidden');
      } else {
        container.textContent = '';
        container.setAttribute('hidden', '');
      }
      continue;
    }
    renderInlineMarkdown(root, container, model.sections[key], { multiline: true });
  }

  renderLiveStatus(root, model.liveStatus);
  renderCompletionRing(root, model.completeness);
  bindCnBoard(root);
  packCnBoard(root);
  root.querySelector('#central-node-dashboard')?.removeAttribute('hidden');
}

export function packCnBoard(root) {
  const board = root.querySelector('#cn-board');
  if (!board) return;
  const width = board.getBoundingClientRect?.()?.width ?? 0;
  if (width <= 0) return;
  const tiles = [...(board.children ?? [])].filter(node =>
    String(node.className || '').split(/\s+/).includes('cn-tile')
  );
  if (!tiles.length) return;
  const gap = PACK_GAP;
  const columns = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  for (const tile of tiles) {
    if (!tile.style) continue;
    const span = Math.min(Math.max(1, Number(tile.dataset?.cnSpan) || 1), columns);
    tile.style.position = 'absolute';
    tile.style.width = `${columnWidth * span + gap * (span - 1)}px`;
  }
  const items = tiles.map(tile => ({
    id: tile.id,
    span: Number(tile.dataset?.cnSpan) || 1,
    height: tile.offsetHeight || TILE_FALLBACK_HEIGHT
  }));
  const packed = packMasonry(items, { columns, gap, columnWidth, flowOffset: 0 });
  let bottom = 0;
  for (const item of packed) {
    const tile = tiles.find(node => node.id === item.id);
    if (!tile?.style) continue;
    tile.style.left = `${item.x}px`;
    tile.style.top = `${item.y}px`;
    tile.style.width = `${item.width}px`;
    bottom = Math.max(bottom, item.y + item.height);
  }
  if (board.style) board.style.minHeight = `${bottom}px`;
}

function bindCnBoard(root) {
  const constraints = root.querySelector('#cn-tile-constraints');
  if (constraints && !constraints.dataset.boundPack) {
    constraints.dataset.boundPack = '1';
    constraints.addEventListener('toggle', () => packCnBoard(root));
  }
}

export function paintChartOrEmpty(root, host, svg, { need, have, unit }) {
  const count = Number(have) || 0;
  const threshold = Number(need) || 0;
  const qualifies = count >= threshold;
  const children = [...(host?.children ?? [])];
  let empty = children.find(node => String(node.className || '').split(/\s+/).includes('cn-honest-empty'));
  if (svg) {
    svg.hidden = !qualifies;
    if (!qualifies) svg.replaceChildren?.();
    else svg.removeAttribute?.('hidden');
  }
  if (qualifies) {
    if (empty) {
      empty.hidden = true;
      empty.textContent = '';
    }
    return true;
  }
  if (!empty) {
    empty = root.createElement('p');
    empty.className = 'cn-honest-empty mind-honest-empty metric-caption';
    host.append(empty);
  }
  empty.hidden = false;
  empty.textContent = `Need ${threshold} ${unit}. ${count} so far.`;
  return false;
}

function renderLiveStatus(root, liveStatus) {
  if (!liveStatus) return;
  const { completeness, snapshot } = liveStatus;
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const item = root.querySelector(`[data-live-complete="${key}"]`);
    if (item) item.dataset.checked = String(Boolean(completeness[key]));
  }
  const el = root.querySelector('[data-live-snapshot]');
  if (el) {
    el.textContent = `Protein ${snapshot.protein_g} g · Energy ${snapshot.calories.toLocaleString('en-AU')} kcal · Fat ${snapshot.fat_g} g`;
  }
}

function renderCompletionRing(root, completeness) {
  const svg = root.querySelector('#central-node-completion-ring');
  if (!svg) return;
  const ring = buildCompletionRing(completeness, { size: 72, strokeWidth: 8 });
  let fill = null;
  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
    if (role === 'fill') fill = circle;
  }
  if (fill) animateRingFill(fill, ring);
  const label = root.querySelector('[data-value="completion-ring-label"]');
  if (label) label.textContent = `${completeness.complete} of ${completeness.total}`;
}

function createSvg(root, tag) {
  return root.createElementNS?.('http://www.w3.org/2000/svg', tag) ?? root.createElement(tag);
}
```

Export `packCnBoard` and `paintChartOrEmpty` so later tasks and tests can import them. Keep `createSvg` in this file for Tasks 5–9.

The fake root must implement `className` as a string, `dataset.cnSpan`, `offsetHeight`, `style` assignments, and `querySelector` that finds tiles by `#cn-tile-*` and descendants by `data-role`.

- [ ] **Step 4: Re-run render tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: PASS for packer, 390 px, empty prose. Completion ring still paints.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): pack the board and apply honest-empty prose rules"
```

---

### Task 5: This Week horizon

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`

**Interfaces:**
- Consumes: `weekHorizonMetrics(model.week)` from Task 1; `buildHorizonBands(metrics, { width: 320, height: 24 })` from `./chart-kit/horizon.js`; `paintChartOrEmpty` from Task 4
- Produces: `renderWeekHorizon(root, model)` paints `#central-node-week-horizon` rects. Qualifies when `model.week.length >= 1`. Fill `var(--wave)` at each rect’s `opacity`

- [ ] **Step 1: Write the failing paint test**

```js
test('renderCentralNode paints a protein horizon and not a line chart', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel());
  const svg = root.querySelector('#central-node-week-horizon');
  const rects = svg.children.filter(node => node.tagName === 'rect');
  assert.equal(rects.length, 7);
  assert.ok(rects.every(rect => rect.getAttribute('fill') === 'var(--wave)'));
  assert.equal(root.querySelector('#central-node-week-chart'), null);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — 0 rects.

- [ ] **Step 3: Paint the strip**

Add imports:

```js
import { buildHorizonBands } from './chart-kit/horizon.js';
import { weekHorizonMetrics } from './central-node-charts.js';
```

Call `renderWeekHorizon(root, model)` from `renderCentralNode` before `packCnBoard`.

```js
function renderWeekHorizon(root, model) {
  const svg = root.querySelector('#central-node-week-horizon');
  const tile = root.querySelector('#cn-tile-week') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const week = model.week ?? [];
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: week.length, unit: 'protein days' })) return;
  const bands = buildHorizonBands(weekHorizonMetrics(week), { width: 320, height: 24 });
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 320 24');
  for (const band of bands) {
    for (const rect of band.rects) {
      const node = createSvg(root, 'rect');
      node.setAttribute('x', String(rect.x));
      node.setAttribute('y', String(rect.y));
      node.setAttribute('width', String(rect.width));
      node.setAttribute('height', String(rect.height));
      node.setAttribute('fill', 'var(--wave)');
      node.setAttribute('opacity', String(rect.opacity));
      node.setAttribute('title', `${rect.date} · ${rect.value} g`);
      svg.append(node);
    }
  }
}
```

- [ ] **Step 4: Re-run render tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): paint This Week as a horizon strip"
```

---

### Task 6: Year consistency radials

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`

**Interfaces:**
- Consumes: `buildRadialYear({ year, byDate })`; `hitMapFromSeries`; `CLINICAL_CHART_SLOTS`; `model.loggingYear` / `exerciseYear` / `eatingYear`; `paintChartOrEmpty`
- Produces: `renderRadialYear(root, model)` draws three concentric hit rings on `#central-node-radial-year`. Qualifies when total hit days across the three maps `>= 1`. Colours `CLINICAL_CHART_SLOTS[0|1|2]`. Month labels Jan–Dec. No `--mood-*`

Rings (cx 120, cy 120): logging `36–52`, exercise `56–72`, eating `76–92`. Labels at r `110`.

- [ ] **Step 1: Write the failing radial test**

```js
test('renderCentralNode paints three radial rings from year hit maps and honest-empties without hits', () => {
  const root = fakeCentralNodeRoot();
  const loggingYear = [
    { date: '2026-01-01', complete: true },
    { date: '2026-01-02', complete: false }
  ];
  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    loggingYear,
    exerciseYear: [{ date: '2026-01-02', completed: true }],
    eatingYear: [{ date: '2026-01-03', hitEatingTargets: false }]
  }));
  const svg = root.querySelector('#central-node-radial-year');
  const lines = svg.children.filter(node => node.tagName === 'line');
  assert.ok(lines.length >= 2);
  assert.ok(lines.some(line => line.getAttribute('stroke') === 'var(--wave)'));
  assert.equal(svg.hidden, false);

  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    loggingYear: [],
    exerciseYear: [],
    eatingYear: []
  }));
  const empty = root.querySelector('#cn-tile-radial').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 hit days this year/);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — no radial lines.

- [ ] **Step 3: Paint the clock**

```js
import { buildRadialYear } from './chart-kit/radial-year.js';
import { CLINICAL_CHART_SLOTS } from './chart-kit/clinical-slots.js';
import { hitMapFromSeries } from './central-node-charts.js';

function renderRadialYear(root, model) {
  const svg = root.querySelector('#central-node-radial-year');
  const tile = root.querySelector('#cn-tile-radial') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const logging = hitMapFromSeries(model.loggingYear, day => day.complete);
  const exercise = hitMapFromSeries(model.exerciseYear, day => day.completed);
  const eating = hitMapFromSeries(model.eatingYear, day => day.hitEatingTargets);
  const hits = Object.keys(logging).length + Object.keys(exercise).length + Object.keys(eating).length;
  if (!paintChartOrEmpty(root, tile, svg, { need: 1, have: hits, unit: 'hit days this year' })) return;
  svg.replaceChildren();
  const year = Number(String(model.date ?? '').slice(0, 4)) || 2026;
  const rings = [
    { byDate: logging, inner: 36, outer: 52, colour: CLINICAL_CHART_SLOTS[0] },
    { byDate: exercise, inner: 56, outer: 72, colour: CLINICAL_CHART_SLOTS[1] },
    { byDate: eating, inner: 76, outer: 92, colour: CLINICAL_CHART_SLOTS[2] }
  ];
  const cx = 120;
  const cy = 120;
  for (const ring of rings) {
    for (const tick of buildRadialYear({ year, byDate: ring.byDate })) {
      if (tick.mood !== 'hit') continue;
      const line = createSvg(root, 'line');
      line.setAttribute('x1', String(cx + ring.inner * Math.cos(tick.angle)));
      line.setAttribute('y1', String(cy + ring.inner * Math.sin(tick.angle)));
      line.setAttribute('x2', String(cx + ring.outer * Math.cos(tick.angle)));
      line.setAttribute('y2', String(cy + ring.outer * Math.sin(tick.angle)));
      line.setAttribute('stroke', ring.colour);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('title', tick.date);
      svg.append(line);
    }
  }
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((month, index) => {
    const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(cx + 110 * Math.cos(angle)));
    label.setAttribute('y', String(cy + 110 * Math.sin(angle) + 3));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-chart-label');
    label.textContent = month;
    svg.append(label);
  });
}
```

Call it from `renderCentralNode` before `packCnBoard`.

- [ ] **Step 4: Re-run render tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): replace 30-day heatmaps with a year radial"
```

---

### Task 7: Long-Term stream and scan

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`

**Interfaces:**
- Consumes: `buildThemeTopography(model.domainWeekly)`; `scanTrendBlocks(model.sections.longTermTrends)`; `CLINICAL_CHART_SLOTS`; `paintChartOrEmpty`; `packCnBoard`
- Produces: `renderStreamTile` + `renderTrendScan`. Stream qualifies when `chart.bands.length >= 1`. Band `colour` overwritten with `CLINICAL_CHART_SLOTS[index]`. Contour `<path>` nodes omitted when `#cn-board` width `< 560`. Scan shows `preview` (3) then More; More reveals `rest`, unhides, calls `packCnBoard`

- [ ] **Step 1: Write the failing stream/scan tests**

```js
test('renderCentralNode paints a stream with clinical colours and scans three trend blocks', () => {
  const root = fakeCentralNodeRoot({ boardWidth: 900 });
  renderCentralNode(root, baseModel({
    domainWeekly: {
      weeks: ['2026-07-20', '2026-07-27'],
      series: [
        { key: 'nutrition', values: [2, 4] },
        { key: 'fitness', values: [1, 0] }
      ]
    },
    sections: {
      ...baseModel().sections,
      longTermTrends: '**Nutrition:**\n- Protein rising.\n**Exercise:**\n- EP anchor.\n**Health Trajectory:**\n- Taper.\n**Work/Energy:**\n- Holidays.'
    }
  }));
  const svg = root.querySelector('#central-node-stream');
  assert.ok(svg.children.some(node => node.tagName === 'path'));
  assert.ok(svg.children.some(node => node.getAttribute('fill') === 'var(--wave)'));
  const scan = root.querySelector('[data-role="trend-scan"]');
  assert.match(scan.textContent, /Nutrition/);
  assert.match(scan.textContent, /Exercise/);
  assert.equal(scan.textContent.includes('Work/Energy'), false);
  const more = root.querySelector('[data-role="trend-more"]');
  assert.equal(more.hidden, false);
  more.click();
  assert.match(scan.textContent, /Work\/Energy/);
});

test('renderCentralNode honest-empties the stream when there are no weekly bands', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({ domainWeekly: { weeks: [], series: [] } }));
  const empty = root.querySelector('#cn-tile-trends').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 weekly domain bands/);
});
```

`FakeElement` needs a `click()` that fires stored `click` listeners from `addEventListener`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — stream host empty.

- [ ] **Step 3: Paint stream and scan**

```js
import { buildThemeTopography } from './chart-kit/stream.js';
import { scanTrendBlocks } from './central-node-charts.js';

function renderStreamTile(root, model) {
  const svg = root.querySelector('#central-node-stream');
  const tile = root.querySelector('#cn-tile-trends') ?? svg?.parentNode;
  if (!svg || !tile) return;
  const chart = buildThemeTopography(model.domainWeekly ?? { weeks: [], series: [] });
  if (!paintChartOrEmpty(root, tile, svg, {
    need: 1,
    have: chart.bands.length,
    unit: 'weekly domain bands'
  })) return;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`);
  const hideContours = (root.querySelector('#cn-board')?.getBoundingClientRect?.()?.width ?? 900) < 560;
  chart.bands.forEach((band, index) => {
    const colour = CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length];
    const path = createSvg(root, 'path');
    path.setAttribute('d', band.d);
    path.setAttribute('fill', colour);
    path.setAttribute('fill-opacity', '0.55');
    path.setAttribute('stroke', 'none');
    svg.append(path);
    if (hideContours) return;
    for (const contour of band.contours ?? []) {
      const line = createSvg(root, 'path');
      line.setAttribute('d', contour.d);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', colour);
      line.setAttribute('stroke-opacity', '0.35');
      svg.append(line);
    }
  });
}

function renderTrendScan(root, model) {
  const host = root.querySelector('[data-role="trend-scan"]');
  const more = root.querySelector('[data-role="trend-more"]');
  if (!host) return;
  const scan = scanTrendBlocks(model.sections?.longTermTrends ?? '');
  const paint = (blocks) => {
    host.replaceChildren();
    for (const block of blocks) {
      const row = root.createElement('p');
      row.className = 'metric-caption';
      const strong = root.createElement('strong');
      strong.textContent = block.label;
      row.append(strong, root.createTextNode ? root.createTextNode(` · ${block.line}`) : null);
      if (!root.createTextNode) row.append(Object.assign(root.createElement('span'), { textContent: ` · ${block.line}` }));
      host.append(row);
    }
  };
  paint(scan.preview);
  if (more) {
    more.hidden = scan.rest.length === 0;
    if (!more.dataset.bound) {
      more.dataset.bound = '1';
      more.addEventListener('click', () => {
        paint([...scan.preview, ...scan.rest]);
        more.hidden = true;
        packCnBoard(root);
      });
    }
  }
}
```

`FakeElement` must implement `createTextNode` **or** use the `span` fallback as written. Prefer adding `createTextNode` on the fake root:

```js
createTextNode: text => {
  const node = new FakeElement('#text');
  node.textContent = text;
  return node;
}
```

Call both renderers from `renderCentralNode` before `packCnBoard`.

- [ ] **Step 4: Re-run render tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): paint domain stream and clamp trend prose"
```

---

### Task 8: Cross-agent chord

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`

**Interfaces:**
- Consumes: `focusCrossAgentEdges(model.crossAgent.edges)`; `buildChordLayout(focused)`; `model.crossAgent.details`; `paintChartOrEmpty`; `CLINICAL_CHART_SLOTS`
- Produces: `renderChordTile`. Qualifies when focused edge count `>= 3`. Geometry matches Mind (`cx=180`, `cy=180`, `radius=120` on a 360 viewBox — scale the Mind 180-centre by drawing in 360 and translating, or set viewBox `0 0 360 360` with `cx=180`). Arcs and ribbons are `tabindex="0"`. Focus/mouseenter writes matching `details.lines` into `[data-cn="chord-detail"]`. Idle caption is the newest detail line. Once the chord qualifies, `[data-central-node="cross-agent"]` stays `hidden`

- [ ] **Step 1: Write the failing chord tests**

```js
test('renderCentralNode honest-empties a chord with fewer than 3 pairs', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: [{ themeA: 'Chadwick', themeB: 'Sara', count: 4 }],
      details: [{ themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] }]
    }
  }));
  const empty = root.querySelector('#cn-tile-cross-agent').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 3 paired handoffs/);
  assert.match(empty.textContent, /1 so far/);
});

test('renderCentralNode paints a chord and focuses a line into the caption', () => {
  const root = fakeCentralNodeRoot();
  const details = [
    { themeA: 'Chadwick', themeB: 'Sara', lines: ['Chadwick→Sara: AC flag.'] },
    { themeA: 'Hammond', themeB: 'Ann', lines: ['Hammond→Ann: teaching handoff.'] },
    { themeA: 'Vera', themeB: 'Penelope', lines: ['Vera→Penelope: weekend framed as escape.'] }
  ];
  renderCentralNode(root, baseModel({
    crossAgent: {
      edges: details.map(row => ({ themeA: row.themeA, themeB: row.themeB, count: 1 })),
      details
    }
  }));
  const svg = root.querySelector('#central-node-chord');
  assert.ok(svg.children.some(node => node.getAttribute('data-role') === 'arc'));
  assert.ok(svg.children.some(node => node.getAttribute('data-role') === 'ribbon'));
  const caption = root.querySelector('[data-cn="chord-detail"]');
  assert.match(caption.textContent, /→/);
  const arc = svg.children.find(node => node.getAttribute('data-theme') === 'Hammond');
  arc._listeners.focus[0]();
  assert.match(caption.textContent, /Hammond→Ann/);
  assert.equal(root._sections['cross-agent'].hidden, true);
});
```

`FakeElement.addEventListener` must store handlers on `_listeners[type]`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — no chord arcs.

- [ ] **Step 3: Paint the chord**

```js
import { buildChordLayout } from './chart-kit/chord-layout.js';
import { focusCrossAgentEdges } from './central-node-charts.js';

function renderChordTile(root, model) {
  const svg = root.querySelector('#central-node-chord');
  const tile = root.querySelector('#cn-tile-cross-agent') ?? svg?.parentNode;
  const caption = root.querySelector('[data-cn="chord-detail"]');
  if (!svg || !tile) return;
  const focused = focusCrossAgentEdges(model.crossAgent?.edges ?? []);
  if (!paintChartOrEmpty(root, tile, svg, { need: 3, have: focused.length, unit: 'paired handoffs' })) {
    if (caption) caption.textContent = '';
    return;
  }
  const prose = root.querySelector('[data-central-node="cross-agent"]');
  if (prose) {
    prose.textContent = '';
    prose.setAttribute('hidden', '');
  }
  svg.replaceChildren();
  const layout = buildChordLayout(focused);
  const colourByKey = new Map(
    (layout.arcs ?? []).map((arc, index) => [arc.key, CLINICAL_CHART_SLOTS[index % CLINICAL_CHART_SLOTS.length]])
  );
  const details = model.crossAgent?.details ?? [];
  const linesFor = (agent) => details
    .filter(row => row.themeA === agent || row.themeB === agent)
    .flatMap(row => row.lines);
  const show = (text) => { if (caption) caption.textContent = text; };
  show(details.at(-1)?.lines?.[0] ?? '');
  const cx = 180;
  const cy = 180;
  const radius = 120;
  for (const arc of layout.arcs ?? []) {
    const colour = colourByKey.get(arc.key) ?? CLINICAL_CHART_SLOTS[0];
    const path = createSvg(root, 'path');
    const x0 = cx + radius * Math.cos(arc.startAngle - Math.PI / 2);
    const y0 = cy + radius * Math.sin(arc.startAngle - Math.PI / 2);
    const x1 = cx + radius * Math.cos(arc.endAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(arc.endAngle - Math.PI / 2);
    const large = arc.endAngle - arc.startAngle > Math.PI ? 1 : 0;
    path.setAttribute('d', `M${x0},${y0} A${radius},${radius},0,${large},1,${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colour);
    path.setAttribute('stroke-width', '10');
    path.setAttribute('data-role', 'arc');
    path.setAttribute('data-theme', arc.key);
    path.setAttribute('tabindex', '0');
    const focus = () => show(linesFor(arc.key).join(' '));
    path.addEventListener('focus', focus);
    path.addEventListener('mouseenter', focus);
    svg.append(path);
    const mid = (arc.startAngle + arc.endAngle) / 2;
    const label = createSvg(root, 'text');
    label.setAttribute('x', String(cx + (radius + 22) * Math.cos(mid - Math.PI / 2)));
    label.setAttribute('y', String(cy + (radius + 22) * Math.sin(mid - Math.PI / 2) + 4));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'mind-chart-label');
    label.textContent = arc.key;
    svg.append(label);
  }
  for (const ribbon of layout.ribbons ?? []) {
    const source = ribbon.source ?? {};
    const target = ribbon.target ?? {};
    const start = ((source.startAngle ?? 0) + (source.endAngle ?? 0)) / 2;
    const end = ((target.startAngle ?? 0) + (target.endAngle ?? 0)) / 2;
    const x0 = cx + (radius - 10) * Math.cos(start - Math.PI / 2);
    const y0 = cy + (radius - 10) * Math.sin(start - Math.PI / 2);
    const x1 = cx + (radius - 10) * Math.cos(end - Math.PI / 2);
    const y1 = cy + (radius - 10) * Math.sin(end - Math.PI / 2);
    const sourceKey = layout.themes?.[source.index] ?? layout.arcs?.[source.index]?.key;
    const colour = colourByKey.get(sourceKey) ?? CLINICAL_CHART_SLOTS[0];
    const path = createSvg(root, 'path');
    path.setAttribute('d', `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `color-mix(in srgb, ${colour} 55%, transparent)`);
    path.setAttribute('stroke-width', String(Math.max(2, Math.min(14, Number(ribbon.value) || 2))));
    path.setAttribute('data-role', 'ribbon');
    if (sourceKey) path.setAttribute('data-theme', sourceKey);
    path.setAttribute('tabindex', '0');
    const focus = () => show(linesFor(sourceKey).join(' '));
    path.addEventListener('focus', focus);
    path.addEventListener('mouseenter', focus);
    svg.append(path);
  }
}
```

Call `renderChordTile(root, model)` from `renderCentralNode` before `packCnBoard`.

- [ ] **Step 4: Re-run render tests**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): paint cross-agent handoffs as a focusable chord"
```

---

### Task 9: Governance aging heat

**Files:**
- Modify: `apps/life/js/app/render-central-node.js`
- Test: `tests/unit/render-central-node.test.js`
- Do not modify: `apps/life/js/app/render-governance.js` (list owner stays)

**Interfaces:**
- Consumes: `buildWatchlistHeat(model.governanceHeat)`; `model.governanceOpen` (`ageDays`); `paintChartOrEmpty`; `CLINICAL_CHART_SLOTS`
- Produces: `renderGovernanceHeat(root, model)` paints `#central-node-governance-heat`. Qualifies when `model.governanceHeat.length >= 1`. Cap visible rows at 5. Each row: term, 8 cells (`--heat` from `cell.mix`), caption `${ageDays}d open` from `governanceOpen` (not `watchlistDelta`). `renderGovernance` still fills `[data-central-node="governance-log"]`

- [ ] **Step 1: Write the failing heat tests**

```js
test('renderCentralNode paints open-item heat and captions ageDays', () => {
  const root = fakeCentralNodeRoot();
  const points = [
    { date: '2026-06-08', count: 0 },
    { date: '2026-06-15', count: 1 },
    { date: '2026-06-22', count: 1 },
    { date: '2026-06-29', count: 1 },
    { date: '2026-07-06', count: 1 },
    { date: '2026-07-13', count: 1 },
    { date: '2026-07-20', count: 1 },
    { date: '2026-07-27', count: 1 }
  ];
  renderCentralNode(root, baseModel({
    date: '2026-07-30',
    governanceHeat: [{ term: 'Sleep goal', points }],
    governanceOpen: [{ title: 'Sleep goal', entryType: 'Drift Detection', dateKey: '2026-07-01', ageDays: 29 }]
  }));
  const host = root.querySelector('#central-node-governance-heat');
  assert.ok(host.children.length >= 1);
  assert.match(host.textContent, /Sleep goal/);
  assert.match(host.textContent, /29d open/);
});

test('renderCentralNode honest-empties governance heat when nothing is open', () => {
  const root = fakeCentralNodeRoot();
  renderCentralNode(root, baseModel({ governanceHeat: [], governanceOpen: [] }));
  const empty = root.querySelector('#cn-tile-governance').children.find(node =>
    String(node.className).includes('cn-honest-empty')
  );
  assert.match(empty.textContent, /Need 1 open items/);
});

test('renderCentralNode caps visible heat rows at 5', () => {
  const root = fakeCentralNodeRoot();
  const points = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-06-${String(8 + index * 7).padStart(2, '0')}`,
    count: 1
  }));
  const governanceHeat = Array.from({ length: 7 }, (_, index) => ({
    term: `Item ${index + 1}`,
    points
  }));
  renderCentralNode(root, baseModel({
    governanceHeat,
    governanceOpen: governanceHeat.map((row, index) => ({ title: row.term, ageDays: index }))
  }));
  const host = root.querySelector('#central-node-governance-heat');
  const rows = host.children.filter(node => String(node.className).includes('cn-watchlist-heat__row'));
  assert.equal(rows.length, 5);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `node --test tests/unit/render-central-node.test.js`

Expected: FAIL — heat host empty.

- [ ] **Step 3: Paint the heat strip**

```js
import { buildWatchlistHeat } from './chart-kit/watchlist-heat.js';

function renderGovernanceHeat(root, model) {
  const host = root.querySelector('#central-node-governance-heat');
  const tile = root.querySelector('#cn-tile-governance') ?? host;
  if (!host || !tile) return;
  const series = model.governanceHeat ?? [];
  if (!paintChartOrEmpty(root, tile, null, { need: 1, have: series.length, unit: 'open items' })) {
    host.replaceChildren();
    return;
  }
  const chart = buildWatchlistHeat(series);
  const ageByTerm = new Map(
    (model.governanceOpen ?? []).map(entry => [entry.title || entry.entryType || 'Open item', entry.ageDays])
  );
  host.replaceChildren();
  for (const row of (chart.rows ?? []).slice(0, 5)) {
    const wrap = root.createElement('div');
    wrap.className = 'cn-watchlist-heat__row';
    const term = root.createElement('span');
    term.className = 'cn-watchlist-heat__term';
    term.textContent = row.term;
    wrap.append(term);
    for (const cell of row.cells ?? []) {
      const swatch = root.createElement('span');
      swatch.className = 'cn-watchlist-heat__cell';
      if (swatch.style?.setProperty) swatch.style.setProperty('--heat', String(cell.mix ?? 0));
      swatch.setAttribute('title', `${cell.date} · ${cell.count}`);
      wrap.append(swatch);
    }
    const age = ageByTerm.get(row.term);
    const caption = root.createElement('span');
    caption.className = 'cn-watchlist-heat__age';
    caption.textContent = Number.isFinite(age) ? `${age}d open` : '';
    wrap.append(caption);
    host.append(wrap);
  }
}
```

Call `renderGovernanceHeat(root, model)` from `renderCentralNode` before `packCnBoard`. Do not call `renderGovernance` from this file — `app-controller.js` still calls it after `renderCentralNode`.

- [ ] **Step 4: Re-run render tests and governance list tests**

Run: `node --test tests/unit/render-central-node.test.js tests/unit/render-governance.test.js`

Expected: PASS. Governance list copy unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/render-central-node.js tests/unit/render-central-node.test.js
git commit -m "feat(cn): paint governance open-item aging as a heat strip"
```

---

### Task 10: Browser acceptance, service worker, regression

**Files:**
- Modify: `tests/browser/central-node.spec.mjs`
- Modify: `apps/life/service-worker.js` (`CACHE_NAME` `life-hub-shell-v124` → `life-hub-shell-v125`)
- Test: `tests/unit/hammond-digest.test.js` (run only — no edits)

**Interfaces:**
- Consumes: Task 3 markup; Task 4–9 paints; fixture events already used by the browser suite
- Produces: browser assertions that match the new board; Hammond 30-day prompt math still green

- [ ] **Step 1: Rewrite the first browser test’s heatmap/line assertions**

In `tests/browser/central-node.spec.mjs`, keep sign-in, Status `streak 1`, ring `3 of 5`, live snapshot, constraints closed, governance empty-state, and the Hammond FAB test. Replace the three 30-tile heatmap assertions and the `#central-node-week-chart [data-role="last-point"]` assertion with:

```js
    assert.equal(await page.locator('#cn-board').count(), 1);
    assert.equal(await page.locator('#cn-tile-status').count(), 1);
    assert.equal(await page.locator('#central-node-week-chart').count(), 0);
    assert.equal(await page.locator('#central-node-logging-heatmap').count(), 0);
    assert.equal(await page.locator('#central-node-exercise-heatmap').count(), 0);
    assert.equal(await page.locator('#central-node-eating-heatmap').count(), 0);
    assert.equal(await page.locator('#central-node-week-horizon').count(), 1);
    assert.equal(await page.locator('#central-node-radial-year').count(), 1);
    assert.equal(await page.locator('#central-node-audit-button').count(), 1);
    assert.equal(await page.locator('#central-node-chat-button').count(), 1);
```

Add a 390 px overflow check in a new test (same sign-in helper):

```js
test('Central Node board does not overflow at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
    assert.equal(await page.locator('#central-node-audit-button').isVisible(), true);
    assert.equal(await page.locator('#central-node-chat-button').isVisible(), true);
  } finally {
    await context.close();
  }
});
```

- [ ] **Step 2: Run unit + digest regression before the browser suite**

Run: `node --test tests/unit/central-node-charts.test.js tests/unit/central-node-model.test.js tests/unit/render-central-node.test.js tests/unit/render-governance.test.js tests/unit/hammond-digest.test.js`

Expected: PASS. `getCnModelWindowStart is a 30-day inclusive window` still asserts `CN_MODEL_WINDOW_DAYS === 30`.

- [ ] **Step 3: Bump the shell cache**

In `apps/life/service-worker.js` line 1, change:

```js
const CACHE_NAME = 'life-hub-shell-v125';
```

- [ ] **Step 4: Run the Central Node browser file**

Run: `node --test --test-concurrency=1 tests/browser/central-node.spec.mjs`

Expected: PASS — fixture Status/ring/governance empty-state, no old hosts, Hammond FAB still `#2D2D2D`, no 390 px overflow.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/central-node.spec.mjs apps/life/service-worker.js
git commit -m "test(cn): accept the restyled board and bump the shell cache"
```

---

## Self-review

**Spec coverage**

| Spec item | Task |
|---|---|
| Today's Status stays hybrid + `ring.js` | 3, 4 |
| This Week `buildHorizonBands` | 1, 5 |
| This Month stays prose; logging heatmap unmounts | 3, 4, 6 |
| Long-Term `buildThemeTopography` + scan/More | 1, 2, 7 |
| Consistency `buildRadialYear` ×3, year of `model.date` | 2, 6 |
| Year series client-only; no `CN_MODEL_WINDOW_DAYS` widen | 2, 10 |
| Governance `buildWatchlistHeat` + `ageDays` caption | 1, 2, 9 |
| Cross-agent `buildChordLayout`, focus not hover-only, Clare/Ann, drop Clementine | 1, 8 |
| Recent Actions / Constraints stay prose; repack on toggle | 3, 4 |
| No Tasks/Teaching tile | 3 (no `#cn-tile-other-hubs`) |
| Run audit + Hammond FAB unchanged | 3, 10 |
| Masonry 16 / 900 / 560 / 390 | 4, 10 |
| Stream hide contours `< 560` | 7 |
| Honest empty copy | 4–9 |
| `CLINICAL_CHART_SLOTS` | 6, 7, 8 |
| Keep 30-day arrays for Hammond | 2, 10 |
| Cuts: protein line, three heatmaps, stacked column | 3, 4, 5 |
| Files list / no persona / no hammond-audit | all tasks |

**Placeholders:** none. **Types:** `crossAgent.edges` / `details`, `domainWeekly`, `loggingYear`, `governanceHeat` / `governanceOpen` are named the same from Task 1 through Task 9.