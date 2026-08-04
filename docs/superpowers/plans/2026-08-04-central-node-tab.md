# Central Node Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Central Node tab: a read-only coordination-hub dashboard with seven cards (Today's Status with a logging-completion ring, This Week with the Nutrition tab's protein sparkline reused, This Month with a logging-density heatmap, Long-Term Trends with exercise/eating consistency heatmaps, Cross-Agent Coordination, Recent Agent Actions, and a collapsed Constraints & Priorities panel) plus an embedded chat panel that opens themed in Hammond's colour and defaults to him when nothing else is already sticky.

**Architecture:** Extends the same "load once, build model, render" pattern the Nutrition tab established: a third model/render pair (`central-node-model.js`/`render-central-node.js`) fed from the exact same already-loaded `events`/`targetsConfig`/`centralNodeMarkdown`/`agentsConfig` (no new fetch). Reuses Nutrition's `buildProteinLineChart` directly for the week sparkline and the existing `.heatmap-grid`/`.heatmap-tile` CSS pattern for all three new heatmaps, rather than duplicating chart code. Adds one new small geometry helper (`central-node-charts.js`) for the one genuinely new chart shape, a donut completion ring. Extends `js/core/constraints.js` with one more section extractor and `render-chat.js`'s `renderInlineMarkdown` with bullet-list support, both additive and backward-compatible with their existing callers.

**Tech Stack:** Vanilla JS (ES modules, no framework, no build step), `node:test` + `node:assert/strict`, hand-rolled SVG (one new chart) — no charting library, keeping the app's zero-runtime-dependency, offline-safe architecture intact.

**Full context:** `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md` (design — see the "Central Node tab" and "App wiring" sections), `docs/superpowers/plans/2026-08-04-nutrition-tab.md` (the Nutrition tab plan this one mirrors structurally), `docs/IMPLEMENTATION_STATUS.md` (Phase 6 entry documents the Nutrition tab's shipped state and the offline-reload precache bug this plan's Task 10 must not repeat). Run `npm test` before starting to confirm a clean baseline (324 tests passing per Phase 6).

**Deliberate scope decisions (read before starting):**
- **All seven card bodies render through the (extended) `renderInlineMarkdown`**, not just Constraints. The design spec calls out Constraints specifically because it's "heavily list-structured," but nothing in the spec excludes the other six sections from the same safe renderer — and rendering all of them through it means `**bold**` markers in the source markdown (e.g. `**Health:** Stable.`) actually render as bold instead of showing literal asterisks as plain text. One render helper, reused seven times, is simpler than two different text-rendering paths.
- **Long-Term Trends caption is a single shared block**, not two separately-parsed captions "under each" chart as the mockup literally describes. The underlying `## 📈 Long-Term Trends & Patterns` markdown section is one blob combining both a Nutrition and an Exercise note (see the real `central-node.md` fixture) — splitting that prose apart by sub-heading would be brittle text-parsing this design doesn't otherwise ask for anywhere else. The whole extracted section renders once, above the two heatmaps it describes.
- **"Eating target consistency" heatmap = hit protein target AND stayed under the fat ceiling**, computed per day directly from the same core primitives Nutrition's tab uses (`aggregateNutrition`, `resolveDayType`, `hasRecoveryBonus`, `getDayTargets`) rather than by importing Nutrition's `buildNutritionModel` output. This avoids adding a new field to Nutrition's already-shipped, already-reviewed day-object shape (which has exact `deepEqual` tests keyed to its current fields) purely for Central Node's benefit — a small (~15 line) duplication of the day-loop pattern is a safer trade than touching merged code for a single new field.
- **"This Month" logging-density heatmap and "colour intensity by closeness"**: the mockup describes intensity-graded colour; this build reuses the existing binary `heatmap-tile[data-hit]` component as-is (a day counts as a hit when all 5 logging categories were logged that day). A gradient-intensity variant is future work, not this plan's scope — documented here the same way Nutrition's plan documented its own dashed-target-line simplification.

---

## File Structure

| File | Change |
|---|---|
| `js/core/constraints.js` | **Modify.** Add `extractLongTermTrends`, the one section this file doesn't yet cover. |
| `tests/unit/constraints.test.js` | **Modify.** |
| `js/app/central-node-model.js` | **Create.** Pure model builder: markdown sections, logging completeness, 7-day protein series (for the reused sparkline), and three 30-day boolean series (logging-density, exercise-consistency, eating-target-consistency). |
| `tests/unit/central-node-model.test.js` | **Create.** |
| `js/app/central-node-charts.js` | **Create.** Pure SVG-geometry builder for the logging-completion donut ring. |
| `tests/unit/central-node-charts.test.js` | **Create.** |
| `js/app/render-chat.js` | **Modify.** `renderInlineMarkdown` gains multi-line and `- ` bullet-list support, fully backward-compatible with its existing single-line streaming-chat callers. |
| `tests/unit/render-chat.test.js` | **Modify.** |
| `js/app/render-central-node.js` | **Create.** DOM rendering — no dedicated unit test, matching the existing convention for `render-home.js`/`render-nutrition.js` (covered by browser tests instead). |
| `css/app.css` | **Modify.** New rules for the completion ring, prose sections, the two-up trend-pair heatmap row, and the collapsed Constraints `<details>` card. |
| `index.html` | **Modify.** Add the `#central-node-dashboard` section (seven cards) and its floating chat button. |
| `js/app/app-controller.js` | **Modify.** Add `CENTRAL_NODE_AGENT_SLUG`; stop routing `central-node` to the generic "coming later" handler; show/hide and build/render the Central Node section; wire its floating button to `chat-panel.js` + `agent-colour.js`. |
| `tests/unit/app-controller.test.js` | **Modify.** |
| `js/app/main.js` | **Modify.** Pass the new dependencies into `createAppController`; generalize the `getDefaultAgentSlug` closure to cover both Nutrition and Central Node. |
| `service-worker.js` | **Modify.** Add the 4 new client modules plus the newly-live `js/core/constraints.js` to `SHELL_FILES`; bump `CACHE_NAME`. |
| `tests/browser/central-node.spec.mjs` | **Create.** Browser acceptance test: real fixture values render, the floating button opens the panel themed in Hammond's colour. |

---

### Task 1: Extend `js/core/constraints.js` with `extractLongTermTrends`

**Files:**
- Modify: `js/core/constraints.js`
- Modify: `tests/unit/constraints.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/unit/constraints.test.js`, add `extractLongTermTrends` to the import list:

```js
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractLongTermTrends,
  extractRecentAgentActions,
  extractThisMonth,
  extractThisWeek,
  extractTodaysStatus
} from '../../js/core/constraints.js';
```

Insert a new section into the `sample` markdown, between `## 📊 This Month` and `## 🤝 Cross-Agent Coordination` (matching the real `central-node.md` fixture's own section order):

```js
const sample = `# Purpose
Intro text.
---
## 🔴 Current Constraints & Priorities
### Medical Status
- Line one
- Line two
---
## ⚡ Today's Status (Friday 19 June 2026)
**Health:** Flare-up confirmed today.
---
## 📅 This Week (16 – 22 June 2026)
**Key Events:**
- Thu 19: Dietician appointment.
---
## 📊 This Month (June 2026)
**Active Goals:**
- Crohn's remission (Critical)
---
## 📈 Long-Term Trends & Patterns
**Nutrition:** Protein target consistency improving month over month.
**Exercise:** Workout streak holding steady since early July.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 31 Jul session completed. Set Day Type to 45 to 60 min Workout.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged.
`;
```

Add the new test, right after the existing `extractThisMonth` test:

```js
test('extractLongTermTrends matches the heading and stops at the next section', () => {
  const result = extractLongTermTrends(sample);
  assert.match(result, /Workout streak holding steady/);
  assert.doesNotMatch(result, /Cross-Agent Coordination/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="extractLongTermTrends"`
Expected: FAIL — `extractLongTermTrends is not a function` (or a similar "not exported" error).

- [ ] **Step 3: Update `js/core/constraints.js`**

Change the heading constants block from:

```js
const CONSTRAINTS_HEADING = '## 🔴 Current Constraints & Priorities';
const TODAYS_STATUS_HEADING = "## ⚡ Today's Status";
const THIS_WEEK_HEADING = '## 📅 This Week';
const THIS_MONTH_HEADING = '## 📊 This Month';
const CROSS_AGENT_HEADING = '## 🤝 Cross-Agent Coordination';
const RECENT_ACTIONS_HEADING = '## 📝 Recent Agent Actions';
```

to:

```js
const CONSTRAINTS_HEADING = '## 🔴 Current Constraints & Priorities';
const TODAYS_STATUS_HEADING = "## ⚡ Today's Status";
const THIS_WEEK_HEADING = '## 📅 This Week';
const THIS_MONTH_HEADING = '## 📊 This Month';
const LONG_TERM_TRENDS_HEADING = '## 📈 Long-Term Trends & Patterns';
const CROSS_AGENT_HEADING = '## 🤝 Cross-Agent Coordination';
const RECENT_ACTIONS_HEADING = '## 📝 Recent Agent Actions';
```

Add the new extractor function, right after `extractThisMonth`:

```js
export function extractLongTermTrends(markdown) {
  return extractSection(markdown, LONG_TERM_TRENDS_HEADING);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="extractLongTermTrends"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 325 (324 baseline + 1 new test).

- [ ] **Step 6: Commit**

```bash
git add js/core/constraints.js tests/unit/constraints.test.js
git commit -m "feat: add extractLongTermTrends to js/core/constraints.js

The only Central Node section this module didn't already cover --
the real central-node.md fixture has a '## 📈 Long-Term Trends &
Patterns' heading between This Month and Cross-Agent Coordination."
```

---

### Task 2: Central Node data model

**Files:**
- Create: `js/app/central-node-model.js`
- Create: `tests/unit/central-node-model.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCentralNodeModel } from '../../js/app/central-node-model.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'workout_30', recovery_flag_next_day: false },
  { type: 'diary', date: '2026-07-30', mood_score: 7 },
  { type: 'meal', date: '2026-07-24', meal: 'breakfast', calories: 300, protein_g: 140, fat_g: 10, sodium_mg: 100, calcium_mg: 50, polyphenol_score: 1 },
  { type: 'workout', date: '2026-07-24', status: 'completed', day_type: 'movement', recovery_flag_next_day: false },
  { type: 'diary', date: '2026-07-24', mood_score: 8 },
  { type: 'weight', date: '2026-07-24', weight_kg: 80 },
  { type: 'skincare', date: '2026-07-24', routine: 'am' },
  { type: 'workout', date: '2026-07-29', status: 'completed', day_type: 'movement', recovery_flag_next_day: false }
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

const markdown = `# Purpose
Intro text.
---
## 🔴 Current Constraints & Priorities
- Constraint line
---
## ⚡ Today's Status (Thursday 30 July 2026)
**Health:** Stable today.
---
## 📅 This Week (27 Jul – 2 Aug 2026)
**Key Events:**
- Thu 30: Chest and Curls session logged.
---
## 📊 This Month (July 2026)
**Active Goals:**
- Maintain workout streak (High)
---
## 📈 Long-Term Trends & Patterns
**Nutrition:** Protein target consistency improving.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 30 Jul session completed.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged.
`;

test('builds the seven markdown sections from central-node.md via js/core/constraints.js, unmodified', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.match(model.sections.constraints, /Constraint line/);
  assert.match(model.sections.todaysStatus, /Stable today/);
  assert.match(model.sections.thisWeek, /Chest and Curls session logged/);
  assert.match(model.sections.thisMonth, /Maintain workout streak/);
  assert.match(model.sections.longTermTrends, /Protein target consistency improving/);
  assert.match(model.sections.crossAgentCoordination, /Chadwick→Brisket/);
  assert.match(model.sections.recentAgentActions, /Chest and Curls session completed and logged/);
});

test('builds today\'s logging completeness the same way Home does', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.deepEqual(model.completeness, {
    nutrition: true,
    fitness: true,
    diary: true,
    body: false,
    skincare: false,
    complete: 3,
    total: 5
  });
});

test('builds a 7-day protein series ending on the display date, for the reused sparkline component', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.deepEqual(model.week, [
    { date: '2026-07-24', protein_g: 140 },
    { date: '2026-07-25', protein_g: 0 },
    { date: '2026-07-26', protein_g: 0 },
    { date: '2026-07-27', protein_g: 0 },
    { date: '2026-07-28', protein_g: 0 },
    { date: '2026-07-29', protein_g: 0 },
    { date: '2026-07-30', protein_g: 80 }
  ]);
});

test('builds a 30-day logging-density series where a day only hits when all 5 categories were logged', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.equal(model.loggingMonth.length, 30);
  assert.equal(model.loggingMonth[0].date, '2026-07-01');
  assert.equal(model.loggingMonth.at(-1).date, '2026-07-30');
  assert.deepEqual(model.loggingMonth.find(day => day.date === '2026-07-24'), { date: '2026-07-24', complete: true });
  assert.deepEqual(model.loggingMonth.find(day => day.date === '2026-07-30'), { date: '2026-07-30', complete: false });
  assert.equal(model.loggingMonth.filter(day => day.complete).length, 1);
});

test('builds a 30-day exercise-consistency series from completed workout records', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  assert.equal(model.exerciseMonth.length, 30);
  const completedDates = model.exerciseMonth.filter(day => day.completed).map(day => day.date);
  assert.deepEqual(completedDates, ['2026-07-24', '2026-07-29', '2026-07-30']);
});

test('builds a 30-day eating-target-consistency series requiring both the protein target and the fat ceiling to be met', () => {
  const model = buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown: markdown, date: '2026-07-30' });

  // 07-24: protein 140 >= 120 (movement target) and fat 10 <= 50 -- a hit.
  // 07-30: protein 80 < 120 (workout_30 target) -- not a hit, despite fat 27 <= 50.
  // 07-29: a completed workout day with no meals logged at all -- not a hit.
  assert.equal(model.eatingMonth.length, 30);
  const hitDates = model.eatingMonth.filter(day => day.hitEatingTargets).map(day => day.date);
  assert.deepEqual(hitDates, ['2026-07-24']);
});

test('rejects a Central Node model without a display date', () => {
  assert.throws(
    () => buildCentralNodeModel({ events: [], targetsConfig, centralNodeMarkdown: '', date: null }),
    /display date/i
  );
});

test('a repository with no central-node.md or config/targets.yml yet renders empty sections and all-false consistency series instead of crashing', () => {
  const model = buildCentralNodeModel({ events: [], targetsConfig: null, centralNodeMarkdown: null, date: '2026-08-03' });

  assert.deepEqual(model.sections, {
    constraints: '',
    todaysStatus: '',
    thisWeek: '',
    thisMonth: '',
    longTermTrends: '',
    crossAgentCoordination: '',
    recentAgentActions: ''
  });
  assert.equal(model.loggingMonth.every(day => day.complete === false), true);
  assert.equal(model.exerciseMonth.every(day => day.completed === false), true);
  assert.equal(model.eatingMonth.every(day => day.hitEatingTargets === false), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="Central Node"`
Expected: FAIL — `Cannot find module '../../js/app/central-node-model.js'`.

- [ ] **Step 3: Create `js/app/central-node-model.js`**

```js
import { aggregateNutrition, getLoggingCompleteness, hasRecoveryBonus, resolveDayType } from '../core/aggregate.js';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractLongTermTrends,
  extractRecentAgentActions,
  extractThisMonth,
  extractThisWeek,
  extractTodaysStatus
} from '../core/constraints.js';
import { getDayTargets } from '../core/targets.js';
import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function workoutCompleted(events, date) {
  return events.some(({ record }) => (
    record.type === 'workout' && record.date === date && record.status === 'completed'
  ));
}

function eatingTargetsForDay(events, date, targetsConfig) {
  const nutrition = aggregateNutrition(events, date);
  const dayType = resolveDayType(events, date);
  const recovery = hasRecoveryBonus(events, date);
  const targets = targetsConfig ? getDayTargets(targetsConfig, date, dayType, recovery) : null;
  const proteinTarget = targets?.protein_g ?? 0;
  const fatCeiling = targets?.fat_ceiling_g ?? 0;
  const hitProtein = proteinTarget > 0 && nutrition.protein_g >= proteinTarget;
  const underFatCeiling = fatCeiling > 0 && nutrition.fat_g <= fatCeiling;

  return { date, hitEatingTargets: hitProtein && underFatCeiling };
}

export function buildCentralNodeModel({ events, targetsConfig, centralNodeMarkdown, date }) {
  if (!date) throw new RangeError('Central Node display date is unavailable');
  const markdown = centralNodeMarkdown ?? '';

  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);

  const week = weekDates.map(day => ({ date: day, protein_g: aggregateNutrition(events, day).protein_g }));
  const loggingMonth = monthDates.map(day => {
    const completeness = getLoggingCompleteness(events, day);
    return { date: day, complete: completeness.complete === completeness.total };
  });
  const exerciseMonth = monthDates.map(day => ({ date: day, completed: workoutCompleted(events, day) }));
  const eatingMonth = monthDates.map(day => eatingTargetsForDay(events, day, targetsConfig));

  return {
    date,
    sections: {
      constraints: extractConstraints(markdown),
      todaysStatus: extractTodaysStatus(markdown),
      thisWeek: extractThisWeek(markdown),
      thisMonth: extractThisMonth(markdown),
      longTermTrends: extractLongTermTrends(markdown),
      crossAgentCoordination: extractCrossAgentCoordination(markdown),
      recentAgentActions: extractRecentAgentActions(markdown)
    },
    completeness: getLoggingCompleteness(events, date),
    week,
    loggingMonth,
    exerciseMonth,
    eatingMonth
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="Central Node"`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 333 (325 + 8 new tests).

- [ ] **Step 6: Commit**

```bash
git add js/app/central-node-model.js tests/unit/central-node-model.test.js
git commit -m "feat: add the Central Node tab's data model

Computes its own eating-target-consistency series directly from the
same core primitives Nutrition's tab uses (aggregateNutrition,
resolveDayType, hasRecoveryBonus, getDayTargets) instead of importing
buildNutritionModel's output, so Nutrition's already-shipped, exact
deepEqual-tested day-object shape doesn't need a new field added
purely for Central Node's benefit."
```

---

### Task 3: Logging-completion ring chart geometry

**Files:**
- Create: `js/app/central-node-charts.js`
- Create: `tests/unit/central-node-charts.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletionRing } from '../../js/app/central-node-charts.js';

test('computes stroke-dasharray geometry for a partial ring using default dimensions', () => {
  const ring = buildCompletionRing({ complete: 3, total: 5 });

  assert.equal(ring.size, 64);
  assert.equal(ring.strokeWidth, 8);
  assert.equal(ring.center, 32);
  assert.equal(ring.radius, 28);
  assert.equal(Math.round(ring.circumference * 100) / 100, 175.93);
  assert.equal(Math.round(ring.dashoffset * 100) / 100, 70.37);
});

test('a full ring (complete === total) has a zero dashoffset', () => {
  const ring = buildCompletionRing({ complete: 5, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('an empty ring (total is zero) does not divide by zero and renders as fully unfilled', () => {
  const ring = buildCompletionRing({ complete: 0, total: 0 });
  assert.equal(ring.dashoffset, ring.circumference);
});

test('a complete value exceeding total is clamped to a full ring instead of overshooting', () => {
  const ring = buildCompletionRing({ complete: 7, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('custom dimensions override the defaults', () => {
  const ring = buildCompletionRing({ complete: 1, total: 2 }, { size: 100, strokeWidth: 10 });
  assert.equal(ring.size, 100);
  assert.equal(ring.center, 50);
  assert.equal(ring.radius, 45);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="ring"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `js/app/central-node-charts.js`**

```js
const DEFAULT_SIZE = 64;
const DEFAULT_STROKE_WIDTH = 8;

export function buildCompletionRing({ complete, total }, { size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE_WIDTH } = {}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, complete / total)) : 0;

  return {
    size,
    strokeWidth,
    center,
    radius,
    circumference,
    dashoffset: circumference * (1 - fraction)
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="ring"`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 338 (333 + 5 new tests).

- [ ] **Step 6: Commit**

```bash
git add js/app/central-node-charts.js tests/unit/central-node-charts.test.js
git commit -m "feat: add pure SVG-geometry builder for the logging-completion ring

The one genuinely new chart shape Central Node needs -- the week
sparkline and all three heatmaps reuse Nutrition's existing chart/CSS
components instead of duplicating geometry code."
```

---

### Task 4: Extend `renderInlineMarkdown` with multi-line and bullet-list support

**Files:**
- Modify: `js/app/render-chat.js`
- Modify: `tests/unit/render-chat.test.js`

**Why this is safe to change:** every existing caller of `renderInlineMarkdown` (the streaming chat renderer in `chat-controller.js`) always passes single-paragraph text with no `\n` in it — `chat-controller.js` itself splits on paragraph breaks before ever calling it. The extension below keeps a fast path that reproduces today's exact output (flat `span`/`strong` children, no wrapping `p`) whenever the input has no newline, so none of chat's existing behavior or tests change. Multi-line/bullet structure only appears for the new multi-paragraph markdown blocks Central Node's cards pass in.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/render-chat.test.js`, after the existing `renderInlineMarkdown` tests (do not remove or modify those three — they must keep passing unchanged, proving backward compatibility):

```js
test('renderInlineMarkdown groups consecutive "- " lines into a single bulleted list', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Notes:\n- First point\n- Second point with **bold**');

  assert.equal(container.children.length, 2);
  const [paragraph, list] = container.children;
  assert.equal(paragraph.tagName, 'p');
  assert.equal(paragraph.children[0].textContent, 'Notes:');
  assert.equal(list.tagName, 'ul');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].tagName, 'li');
  assert.equal(list.children[0].children[0].textContent, 'First point');
  assert.equal(list.children[1].children[0].textContent, 'Second point with ');
  assert.equal(list.children[1].children[1].tagName, 'strong');
  assert.equal(list.children[1].children[1].textContent, 'bold');
});

test('renderInlineMarkdown starts a fresh list when bullet lines are interrupted by a paragraph', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two\nInterruption.\n- Three');

  assert.equal(container.children.length, 3);
  assert.equal(container.children[0].tagName, 'ul');
  assert.equal(container.children[0].children.length, 2);
  assert.equal(container.children[1].tagName, 'p');
  assert.equal(container.children[1].children[0].textContent, 'Interruption.');
  assert.equal(container.children[2].tagName, 'ul');
  assert.equal(container.children[2].children.length, 1);
});

test('renderInlineMarkdown skips blank lines between paragraphs', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'First.\n\nSecond.');

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].children[0].textContent, 'First.');
  assert.equal(container.children[1].children[0].textContent, 'Second.');
});

test('renderInlineMarkdown re-renders cleanly when switching from multi-line to single-line output', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two');
  renderInlineMarkdown(root, container, 'Plain text.');

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'span');
  assert.equal(container.children[0].textContent, 'Plain text.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="renderInlineMarkdown"`
Expected: 3 existing tests PASS, the 4 new ones FAIL (bullet lines and paragraph breaks render as one flat run of spans instead of `ul`/`li`/`p` structure).

- [ ] **Step 3: Update `js/app/render-chat.js`**

Replace the existing `renderInlineMarkdown` function:

```js
// Renders a safe subset of markdown (currently just **bold**) as real DOM nodes --
// never innerHTML, so model output can never be interpreted as markup. Caller is
// responsible for scrolling the list into view afterwards.
export function renderInlineMarkdown(root, container, text) {
  container.replaceChildren();
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean);
  for (const segment of segments) {
    const isBold = segment.startsWith('**') && segment.endsWith('**') && segment.length > 4;
    const node = root.createElement(isBold ? 'strong' : 'span');
    node.textContent = isBold ? segment.slice(2, -2) : segment;
    container.append(node);
  }
}
```

with:

```js
// Renders a safe subset of markdown (**bold** and "- " bullet lists) as real DOM
// nodes -- never innerHTML, so model output can never be interpreted as markup.
// Single-line input (every existing streaming-chat caller) takes a fast path that
// reproduces the original flat span/strong output exactly, so chat bubbles are
// unaffected by the multi-line/bullet support added for Central Node's cards.
// Caller is responsible for scrolling the list into view afterwards.
export function renderInlineMarkdown(root, container, text) {
  container.replaceChildren();
  const lines = text.split('\n');
  if (lines.length === 1) {
    appendInlineSegments(root, container, text);
    return;
  }

  let currentList = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('- ')) {
      if (!currentList) {
        currentList = root.createElement('ul');
        container.append(currentList);
      }
      const item = root.createElement('li');
      appendInlineSegments(root, item, line.slice(2));
      currentList.append(item);
    } else {
      currentList = null;
      if (line === '') continue;
      const paragraph = root.createElement('p');
      appendInlineSegments(root, paragraph, line);
      container.append(paragraph);
    }
  }
}

function appendInlineSegments(root, container, text) {
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean);
  for (const segment of segments) {
    const isBold = segment.startsWith('**') && segment.endsWith('**') && segment.length > 4;
    const node = root.createElement(isBold ? 'strong' : 'span');
    node.textContent = isBold ? segment.slice(2, -2) : segment;
    container.append(node);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="renderInlineMarkdown"`
Expected: PASS, all 7 tests green (3 original + 4 new).

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: PASS, 342 (338 + 4 new tests).

- [ ] **Step 6: Commit**

```bash
git add js/app/render-chat.js tests/unit/render-chat.test.js
git commit -m "feat: extend renderInlineMarkdown with multi-line and bullet-list support

Backward-compatible: single-line input (every existing streaming-chat
caller) still takes the original flat span/strong fast path unchanged.
Multi-line/bullet structure only appears for the new markdown blocks
Central Node's cards pass in."
```

---

### Task 5: Central Node rendering

**Files:**
- Create: `js/app/render-central-node.js`

No dedicated unit test for this file — `render-home.js`/`render-nutrition.js` (the equivalent Home/Nutrition renderers) have none either; DOM output is exercised by the browser acceptance test in Task 11.

- [ ] **Step 1: Create `js/app/render-central-node.js`**

```js
import { buildCompletionRing } from './central-node-charts.js';
import { buildProteinLineChart } from './nutrition-charts.js';
import { renderInlineMarkdown } from './render-chat.js';

const SECTION_SELECTORS = {
  todaysStatus: '[data-central-node="todays-status"]',
  thisWeek: '[data-central-node="this-week"]',
  thisMonth: '[data-central-node="this-month"]',
  longTermTrends: '[data-central-node="long-term-trends"]',
  crossAgentCoordination: '[data-central-node="cross-agent"]',
  recentAgentActions: '[data-central-node="recent-actions"]',
  constraints: '[data-central-node="constraints"]'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

export function renderCentralNode(root, model) {
  for (const [key, selector] of Object.entries(SECTION_SELECTORS)) {
    const container = root.querySelector(selector);
    if (container) renderInlineMarkdown(root, container, model.sections[key]);
  }

  renderCompletionRing(root, model.completeness);
  renderWeekChart(root, model.week);
  renderHeatmap(root, '#central-node-logging-heatmap', model.loggingMonth, day => day.complete);
  renderHeatmap(root, '#central-node-exercise-heatmap', model.exerciseMonth, day => day.completed);
  renderHeatmap(root, '#central-node-eating-heatmap', model.eatingMonth, day => day.hitEatingTargets);

  root.querySelector('#central-node-dashboard')?.removeAttribute('hidden');
}

function renderCompletionRing(root, completeness) {
  const svg = root.querySelector('#central-node-completion-ring');
  if (!svg) return;
  const ring = buildCompletionRing(completeness);

  for (const role of ['track', 'fill']) {
    const circle = svg.querySelector(`[data-role="${role}"]`);
    if (!circle) continue;
    circle.setAttribute('cx', ring.center);
    circle.setAttribute('cy', ring.center);
    circle.setAttribute('r', ring.radius);
    circle.setAttribute('stroke-width', ring.strokeWidth);
  }

  const fill = svg.querySelector('[data-role="fill"]');
  if (fill) {
    fill.setAttribute('stroke-dasharray', ring.circumference);
    fill.setAttribute('stroke-dashoffset', ring.dashoffset);
  }

  setText(root, '[data-value="completion-ring-label"]', `${completeness.complete} of ${completeness.total}`);
}

function renderWeekChart(root, week) {
  const svg = root.querySelector('#central-node-week-chart');
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

function renderHeatmap(root, selector, series, hit) {
  const grid = root.querySelector(selector);
  if (!grid) return;
  grid.replaceChildren();
  for (const day of series) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(hit(day));
    tile.title = day.date;
    grid.append(tile);
  }
}
```

- [ ] **Step 2: Confirm it imports cleanly**

```bash
node -e "import('./js/app/render-central-node.js').then(() => console.log('ok'))"
```
Expected: `ok`.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 342 (this file has no dedicated tests yet — Task 11's browser test covers it).

- [ ] **Step 4: Commit**

```bash
git add js/app/render-central-node.js
git commit -m "feat: add Central Node tab DOM rendering

No dedicated unit test, matching render-home.js/render-nutrition.js's
existing convention -- DOM output is exercised by the browser
acceptance test. Reuses Nutrition's buildProteinLineChart for the week
sparkline and the shared heatmap-tile component for all three
heatmaps; the completion ring is the only new chart shape."
```

---

### Task 6: CSS for the Central Node dashboard

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: Append these rules to `css/app.css`**

```css
.prose-section { margin: 0.85rem 0 0; color: var(--ink); font-size: 0.82rem; line-height: 1.6; }
.prose-section p { margin: 0 0 0.6rem; }
.prose-section p:last-child { margin-bottom: 0; }
.prose-section ul { margin: 0 0 0.6rem; padding-left: 1.1rem; }
.prose-section ul:last-child { margin-bottom: 0; }
.prose-section strong { color: var(--depth); }

.completion-ring-wrap { display: flex; align-items: center; gap: 0.85rem; margin-top: 0.75rem; }
.completion-ring { width: 4rem; height: 4rem; flex: 0 0 auto; transform: rotate(-90deg); }
.completion-ring-track { stroke: rgba(20,43,81,0.08); }
.completion-ring-fill { stroke: var(--wave); stroke-linecap: round; transition: stroke-dashoffset 520ms cubic-bezier(.2,.8,.2,1); }
.completion-ring-label { color: var(--depth); font-weight: 800; font-size: 0.95rem; }

.trend-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.85rem; }
.trend-pair > div { display: grid; gap: 0.4rem; }
.trend-pair h3 { margin: 0; color: var(--muted); font-size: 0.7rem; font-weight: 750; text-transform: uppercase; letter-spacing: 0.06em; }

.constraints-card { padding: 1.1rem 1.35rem; cursor: pointer; }
.constraints-card summary { list-style: none; color: var(--depth); font-size: 0.82rem; font-weight: 800; }
.constraints-card summary::-webkit-details-marker { display: none; }
.constraints-card summary::after { content: '+'; float: right; color: var(--muted); }
.constraints-card[open] summary::after { content: '−'; }
.constraints-card .prose-section { cursor: auto; }

@media (max-width: 48rem) {
  .trend-pair { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Confirm the stylesheet still parses and the existing style-scan test still passes**

```bash
npm test -- --test-name-pattern="stylesheet"
```
Expected: PASS.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 342 (CSS has no tests of its own beyond the existing scan).

- [ ] **Step 4: Commit**

```bash
git add css/app.css
git commit -m "feat: add Central Node dashboard styles (completion ring, prose sections, trend-pair heatmap row, collapsed Constraints card)"
```

---

### Task 7: HTML markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the `#central-node-dashboard` section**

Find the closing `</section>` of `#nutrition-dashboard` in `index.html` (immediately before `</main>`), and insert this new section as its sibling, right after it:

```html
        <section id="central-node-dashboard" class="dashboard" aria-labelledby="central-node-heading" hidden>
          <div class="section-heading">
            <div>
              <p class="section-kicker">Central Node</p>
              <h2 id="central-node-heading">Coordination hub</h2>
            </div>
          </div>

          <article class="metric-card" aria-labelledby="todays-status-label">
            <p class="metric-label" id="todays-status-label">Today's Status</p>
            <div data-central-node="todays-status" class="prose-section"></div>
            <div class="completion-ring-wrap">
              <svg id="central-node-completion-ring" class="completion-ring" viewBox="0 0 64 64" role="img" aria-label="Logging completeness ring">
                <circle data-role="track" class="completion-ring-track" fill="none"></circle>
                <circle data-role="fill" class="completion-ring-fill" fill="none"></circle>
              </svg>
              <span data-value="completion-ring-label" class="completion-ring-label">— of —</span>
            </div>
          </article>

          <article class="metric-card chart-card" aria-labelledby="central-node-week-label">
            <p class="metric-label" id="central-node-week-label">This Week</p>
            <div data-central-node="this-week" class="prose-section"></div>
            <svg id="central-node-week-chart" class="line-chart" viewBox="0 0 320 120" preserveAspectRatio="none" role="img" aria-label="Protein trend over the last 7 days">
              <polygon data-role="area" points=""></polygon>
              <polyline data-role="line" points=""></polyline>
              <circle data-role="last-point" r="4" hidden></circle>
            </svg>
          </article>

          <article class="metric-card chart-card" aria-labelledby="central-node-month-label">
            <p class="metric-label" id="central-node-month-label">This Month</p>
            <div data-central-node="this-month" class="prose-section"></div>
            <div id="central-node-logging-heatmap" class="heatmap-grid" aria-label="Whether all 5 categories were logged, last 30 days"></div>
          </article>

          <article class="metric-card chart-card" aria-labelledby="central-node-trends-label">
            <p class="metric-label" id="central-node-trends-label">Long-Term Trends</p>
            <div data-central-node="long-term-trends" class="prose-section"></div>
            <div class="trend-pair">
              <div>
                <h3>Exercise consistency</h3>
                <div id="central-node-exercise-heatmap" class="heatmap-grid" aria-label="Whether a workout was completed, last 30 days"></div>
              </div>
              <div>
                <h3>Eating target consistency</h3>
                <div id="central-node-eating-heatmap" class="heatmap-grid" aria-label="Whether the protein target and fat ceiling were both met, last 30 days"></div>
              </div>
            </div>
          </article>

          <article class="metric-card" aria-labelledby="central-node-cross-agent-label">
            <p class="metric-label" id="central-node-cross-agent-label">Cross-Agent Coordination</p>
            <div data-central-node="cross-agent" class="prose-section"></div>
          </article>

          <article class="metric-card" aria-labelledby="central-node-recent-actions-label">
            <p class="metric-label" id="central-node-recent-actions-label">Recent Agent Actions</p>
            <div data-central-node="recent-actions" class="prose-section"></div>
          </article>

          <details class="metric-card constraints-card">
            <summary>Constraints &amp; Priorities</summary>
            <div data-central-node="constraints" class="prose-section"></div>
          </details>

          <button id="central-node-chat-button" class="floating-chat-button" type="button" aria-label="Chat with Hammond">💬</button>
        </section>
```

- [ ] **Step 2: Confirm the HTML still parses and existing structure tests pass**

```bash
npm test -- --test-name-pattern="shell\|landmarks"
```
Expected: PASS (existing Home/Nutrition structural tests are unaffected since their ids/content are untouched).

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 342.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Central Node dashboard markup (seven cards + floating chat button)"
```

---

### Task 8: Wire the Central Node section and floating chat button into `app-controller.js`

**Files:**
- Modify: `js/app/app-controller.js`
- Modify: `tests/unit/app-controller.test.js`

- [ ] **Step 1: Add `CENTRAL_NODE_AGENT_SLUG` and the new dependencies**

Change:

```js
export const NUTRITION_AGENT_SLUG = 'brisket';
```

to:

```js
export const NUTRITION_AGENT_SLUG = 'brisket';
export const CENTRAL_NODE_AGENT_SLUG = 'hammond';
```

Change the destructured dependencies from:

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
    buildCentralNodeModel,
    renderCentralNode,
    agentColour,
    chatPanel,
    windowTarget = window,
```

- [ ] **Step 2: Update the nav-binding loop and add Central Node's bindings**

Change:

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
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, NUTRITION_AGENT_SLUG));
  });
```

to:

```js
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    const target = button.dataset.section;
    if (target === 'home' || target === 'chat' || target === 'nutrition' || target === 'central-node') continue;
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
  for (const button of root.querySelectorAll?.('[data-section="central-node"]') ?? []) {
    bind(button, 'click', () => showSection('central-node'));
  }
  bind(root.querySelector('#nutrition-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#nutrition-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, NUTRITION_AGENT_SLUG));
  });
  bind(root.querySelector('#central-node-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#central-node-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, CENTRAL_NODE_AGENT_SLUG));
  });
```

- [ ] **Step 3: Add a `SECTION_TITLES` entry**

Change:

```js
  const SECTION_TITLES = {
    home: { eyebrow: 'Your day at a glance', title: 'Home' },
    chat: { eyebrow: 'Life Hub', title: 'Chat' },
    nutrition: { eyebrow: 'Nutrition', title: 'Nutrition' }
  };
```

to:

```js
  const SECTION_TITLES = {
    home: { eyebrow: 'Your day at a glance', title: 'Home' },
    chat: { eyebrow: 'Life Hub', title: 'Chat' },
    nutrition: { eyebrow: 'Nutrition', title: 'Nutrition' },
    'central-node': { eyebrow: 'Central Node', title: 'Central Node' }
  };
```

- [ ] **Step 4: Update `showSection` and add `renderCentralNodeSection`**

Change:

```js
  function showSection(name) {
    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    const nutrition = root.querySelector('#nutrition-dashboard');
    if (home) home.hidden = name !== 'home';
    if (nutrition) nutrition.hidden = name !== 'nutrition';
    // #chat-view's own `hidden` attribute is owned by chatPanel while the panel is
    // open as an overlay elsewhere (its hosting section's hidden-cascade controls
    // visibility instead) -- only manage it here when the panel isn't currently open,
    // to avoid fighting chatPanel's own state.
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
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, NUTRITION_AGENT_SLUG));
  }
```

to:

```js
  function showSection(name) {
    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    const nutrition = root.querySelector('#nutrition-dashboard');
    const centralNode = root.querySelector('#central-node-dashboard');
    if (home) home.hidden = name !== 'home';
    if (nutrition) nutrition.hidden = name !== 'nutrition';
    if (centralNode) centralNode.hidden = name !== 'central-node';
    // #chat-view's own `hidden` attribute is owned by chatPanel while the panel is
    // open as an overlay elsewhere (its hosting section's hidden-cascade controls
    // visibility instead) -- only manage it here when the panel isn't currently open,
    // to avoid fighting chatPanel's own state.
    if (name === 'chat') {
      if (chatPanel?.isOpen()) chatPanel.close();
      if (chat) chat.hidden = false;
    } else if (chat && !chatPanel?.isOpen()) {
      chat.hidden = true;
    }
    currentSection = name;
    if (name === 'nutrition') renderNutritionSection();
    if (name === 'central-node') renderCentralNodeSection();
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
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, NUTRITION_AGENT_SLUG));
  }

  function renderCentralNodeSection() {
    if (!latestResult || !buildCentralNodeModel || !renderCentralNode) return;
    renderCentralNode(root, buildCentralNodeModel(latestResult));
    const button = root.querySelector('#central-node-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, CENTRAL_NODE_AGENT_SLUG));
  }
```

- [ ] **Step 5: Re-render Central Node on a completed refresh while it's the current section**

Change:

```js
      latestResult = { ...result, date };
      if (!rendered || result.changed === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
        if (currentSection === 'nutrition') renderNutritionSection();
      }
```

to:

```js
      latestResult = { ...result, date };
      if (!rendered || result.changed === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
        if (currentSection === 'nutrition') renderNutritionSection();
        if (currentSection === 'central-node') renderCentralNodeSection();
      }
```

- [ ] **Step 6: Update the existing app-controller test harness**

In `tests/unit/app-controller.test.js`, add `'#central-node-dashboard'` and `'#central-node-chat-button'` to `FakeDocument`'s `this.elements` map, right after the existing `'#nutrition-chat-button'` entry:

```js
      ['#nutrition-dashboard', new FakeElement({ hidden: true })],
      ['#nutrition-chat-button', new FakeElement()],
      ['#central-node-dashboard', new FakeElement({ hidden: true })],
      ['#central-node-chat-button', new FakeElement()],
```

Add a `centralNodeNavigation` fixture right after the existing `nutritionNavigation` one, and extend `querySelectorAll`'s `[data-section]` list and add a `[data-section="central-node"]` branch:

```js
    this.nutritionNavigation = new FakeElement();
    this.nutritionNavigation.dataset.section = 'nutrition';
    this.centralNodeNavigation = new FakeElement();
    this.centralNodeNavigation.dataset.section = 'central-node';
    this.chatNavigation = new FakeElement();
    this.chatNavigation.dataset.section = 'chat';
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-section]') return [this.futureNavigation, this.nutritionNavigation, this.centralNodeNavigation, this.chatNavigation];
    if (selector === '[data-section="nutrition"]') return [this.nutritionNavigation];
    if (selector === '[data-section="central-node"]') return [this.centralNodeNavigation];
    if (selector === '[data-section="chat"]') return [this.chatNavigation];
    return [];
  }
```

Add `buildCentralNodeModel`/`renderCentralNode` fakes to `harness()`'s `dependencies` object, right after the existing `renderNutrition` fake:

```js
    buildNutritionModel: input => ({ date: input.date, source: input, kind: 'nutrition' }),
    renderNutrition(documentRoot, model) {
      calls.nutritionRenders = (calls.nutritionRenders ?? 0) + 1;
      documentRoot.querySelector('#nutrition-dashboard').hidden = false;
    },
    buildCentralNodeModel: input => ({ date: input.date, source: input, kind: 'central-node' }),
    renderCentralNode(documentRoot, model) {
      calls.centralNodeRenders = (calls.centralNodeRenders ?? 0) + 1;
      documentRoot.querySelector('#central-node-dashboard').hidden = false;
    },
```

- [ ] **Step 7: Add the new failing tests**

Append to `tests/unit/app-controller.test.js`, after the existing `'a completed refresh while viewing Nutrition re-renders the dashboard and re-themes the chat button'` test:

```js
test('clicking the Central Node nav item shows the dashboard and builds/renders it from the latest loaded sync data', async () => {
  const state = harness();
  await state.controller.start();

  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.root.querySelector('#central-node-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.calls.centralNodeRenders, 1);
  assert.equal(state.controller.getCurrentSection(), 'central-node');
});

test('the Central Node floating chat button opens the chat panel into its section, themed with Hammond\'s colour', async () => {
  const state = harness();
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#central-node-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.opens[0].slot, state.root.querySelector('#central-node-dashboard'));
  assert.equal(state.chatPanelCalls.opens[0].accentColour, '#colour-for-hammond');
});

test('clicking the Central Node floating chat button again closes an already-open panel', async () => {
  const state = harness();
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));
  const button = state.root.querySelector('#central-node-chat-button');
  button.dispatchEvent(new Event('click'));

  button.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.closes, 1);
});

test('a completed refresh while viewing Central Node re-renders the dashboard and re-themes the chat button', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: true, freshness: 'confirmed', agentsConfig: { agents: [{ slug: 'hammond', colour: '#UPDATED' }] } })
    ]
  });
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.calls.centralNodeRenders, 1);

  await state.controller.refresh();

  assert.equal(state.calls.centralNodeRenders, 2);
});
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npm test -- --test-name-pattern="Central Node"
```
Expected: PASS, all 4 new tests.

- [ ] **Step 9: Run the full suite**

```bash
npm test
```
Expected: PASS, 346 (342 + 4 new tests).

- [ ] **Step 10: Commit**

```bash
git add js/app/app-controller.js tests/unit/app-controller.test.js
git commit -m "feat: wire the Central Node section and its floating chat button into app-controller.js

Mirrors the Nutrition tab's wiring exactly: builds/renders on demand
from the already-loaded latestResult, re-renders on a completed
refresh while it's the current section, and themes its floating chat
button with Hammond's accent via agent-colour.js."
```

---

### Task 9: Wire `main.js`

**Files:**
- Modify: `js/app/main.js`

- [ ] **Step 1: Update `js/app/main.js`**

Add two imports alongside the existing ones:

```js
import { buildCentralNodeModel } from './central-node-model.js';
import { renderCentralNode } from './render-central-node.js';
```

Change the `app-controller.js` import to also pull in `CENTRAL_NODE_AGENT_SLUG`:

```js
import { createAppController, CENTRAL_NODE_AGENT_SLUG, NUTRITION_AGENT_SLUG } from './app-controller.js';
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
  getDefaultAgentSlug: () => (controller.getCurrentSection() === 'nutrition' ? NUTRITION_AGENT_SLUG : undefined)
});
```

to:

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
  buildNutritionModel,
  renderNutrition,
  buildCentralNodeModel,
  renderCentralNode,
  agentColour,
  chatPanel,
  sessionStorage,
  localStorage
});

controller.start();

const DEFAULT_AGENT_BY_SECTION = {
  nutrition: NUTRITION_AGENT_SLUG,
  'central-node': CENTRAL_NODE_AGENT_SLUG
};

const chatApi = createChatApi(fetchImpl);
createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true }),
  getDefaultAgentSlug: () => DEFAULT_AGENT_BY_SECTION[controller.getCurrentSection()]
});
```

- [ ] **Step 2: Confirm it imports cleanly**

```bash
node -e "import('./js/app/main.js')" 2>&1 | head -5
```
Expected: fails only on a browser-global `ReferenceError` (e.g. `document is not defined`), never on module resolution or syntax. (As documented in `docs/IMPLEMENTATION_STATUS.md`'s Phase 6 entry, this exact command also needs `vendor/js-yaml.mjs` to exist at the project root to fully resolve, which is a separate, pre-existing, unrelated build-artifact-path quirk — confirm there is no NEW resolution error introduced by this task's own two new imports.)

- [ ] **Step 3: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 346 (`main.js` itself has no dedicated unit test; it's covered by the browser acceptance suite).

- [ ] **Step 4: Commit**

```bash
git add js/app/main.js
git commit -m "feat: wire the Central Node model/renderer into main.js

Generalizes the default-agent-hint closure from a single nutrition
check into a small section-to-slug lookup covering both Nutrition
(Brisket) and Central Node (Hammond)."
```

---

### Task 10: Service worker precache

**Files:**
- Modify: `service-worker.js`

**Before writing the diff, verify the complete new dependency graph.** This is the exact class of bug that broke offline reload during the Nutrition tab's own final verification (see `docs/IMPLEMENTATION_STATUS.md`'s Phase 6 entry: `js/core/trends.js` was missed because nothing on `main` imported it directly until Nutrition's model file did). Walk every file this plan created or modified and list every relative import target:

- `central-node-model.js` imports `../core/aggregate.js` (already precached), `../core/constraints.js` (**not yet precached — Task 1 made this file newly-live for the first time, exactly like `trends.js` was for Nutrition**), `../core/targets.js` (already precached), `../core/time.js` (already precached).
- `central-node-charts.js` has no imports.
- `render-central-node.js` imports `./central-node-charts.js` (new, must be added), `./nutrition-charts.js` (already precached), `./render-chat.js` (already precached).

So this task must add exactly 4 new entries: `js/core/constraints.js` plus the 3 new `js/app/*.js` files.

- [ ] **Step 1: Bump the cache name and add the 4 new entries**

Change:

```js
const CACHE_NAME = 'life-hub-shell-v16';
```

to:

```js
const CACHE_NAME = 'life-hub-shell-v17';
```

Change the `SHELL_FILES` array from:

```js
const SHELL_FILES = [
  '',
  'index.html',
  'css/app.css',
  'js/app/main.js',
  'js/app/api-session.js',
  'js/app/app-controller.js',
  'js/app/agent-colour.js',
  'js/app/chat-api.js',
  'js/app/chat-controller.js',
  'js/app/chat-panel.js',
  'js/app/config.js',
  'js/app/home-model.js',
  'js/app/load-live-events.js',
  'js/app/nutrition-charts.js',
  'js/app/nutrition-model.js',
  'js/app/render-chat.js',
  'js/app/render-home.js',
  'js/app/render-nutrition.js',
  'js/app/repository-cache.js',
  'js/app/sync-repository.js',
  'js/core/aggregate.js',
  'js/core/records.js',
  'js/core/targets.js',
  'js/core/time.js',
  'js/core/trends.js',
  'js/core/validate.js',
  'vendor/js-yaml.mjs',
  'manifest.webmanifest',
  'assets/icons/life-hub-192.png',
  'assets/icons/life-hub-512.png'
];
```

to:

```js
const SHELL_FILES = [
  '',
  'index.html',
  'css/app.css',
  'js/app/main.js',
  'js/app/api-session.js',
  'js/app/app-controller.js',
  'js/app/agent-colour.js',
  'js/app/central-node-charts.js',
  'js/app/central-node-model.js',
  'js/app/chat-api.js',
  'js/app/chat-controller.js',
  'js/app/chat-panel.js',
  'js/app/config.js',
  'js/app/home-model.js',
  'js/app/load-live-events.js',
  'js/app/nutrition-charts.js',
  'js/app/nutrition-model.js',
  'js/app/render-central-node.js',
  'js/app/render-chat.js',
  'js/app/render-home.js',
  'js/app/render-nutrition.js',
  'js/app/repository-cache.js',
  'js/app/sync-repository.js',
  'js/core/aggregate.js',
  'js/core/constraints.js',
  'js/core/records.js',
  'js/core/targets.js',
  'js/core/time.js',
  'js/core/trends.js',
  'js/core/validate.js',
  'vendor/js-yaml.mjs',
  'manifest.webmanifest',
  'assets/icons/life-hub-192.png',
  'assets/icons/life-hub-512.png'
];
```

- [ ] **Step 2: Run the full suite**

```bash
npm test
```
Expected: PASS, unchanged at 346 (no test currently asserts on `PRECACHE_URLS`/`SHELL_FILES` contents directly — Task 11's browser test, particularly its offline-reload coverage if included, is what would actually exercise this).

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "chore: precache the Central Node tab's client modules and js/core/constraints.js, bump shell cache to v17

js/core/constraints.js becomes a live client-side dependency for the
first time via central-node-model.js (previously server-only) --
precached now rather than discovered missing later via a broken
offline reload, the way js/core/trends.js was for the Nutrition tab."
```

---

### Task 11: Browser acceptance test

**Files:**
- Create: `tests/browser/central-node.spec.mjs`

- [ ] **Step 1: Write the test**

Model this on `tests/browser/nutrition.spec.mjs`'s setup (same `before`/`after` server lifecycle, same sign-in helper, `browser.newContext()`/`context.close()` pattern). The local fixture repository the dev/test server serves (`scripts/mock-api.mjs`) backs `central-node.md` with `tests/fixtures/valid/central-node.md`, and provides one workout (`2026-07-30`, completed, `day_type: workout_30`), one diary entry, and two meals (breakfast 38g protein, lunch 42g protein) — all on `2026-07-30`, the fixed sign-in date. No body or skincare record exists in the fixture set, so today's logging completeness is 3 of 5 (nutrition, fitness, diary).

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

test('the Central Node tab renders its markdown sections and logging-completion ring from the fixture repository', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.match(await page.locator('[data-central-node="todays-status"]').textContent(), /streak 1/);
    assert.match(await page.locator('[data-central-node="cross-agent"]').textContent(), /Chadwick.*Brisket/);
    assert.equal(await page.locator('[data-value="completion-ring-label"]').textContent(), '3 of 5');

    const constraintsPanel = page.locator('.constraints-card');
    assert.equal(await constraintsPanel.getAttribute('open'), null);
    assert.match(await page.locator('[data-central-node="constraints"] li').first().textContent(), /Test condition/);

    const loggingHeatmap = page.locator('#central-node-logging-heatmap .heatmap-tile');
    assert.equal(await loggingHeatmap.count(), 30);
    const exerciseHeatmap = page.locator('#central-node-exercise-heatmap .heatmap-tile');
    assert.equal(await exerciseHeatmap.count(), 30);
    assert.equal(await page.locator('#central-node-exercise-heatmap .heatmap-tile[data-hit="true"]').count(), 1);
    const eatingHeatmap = page.locator('#central-node-eating-heatmap .heatmap-tile');
    assert.equal(await eatingHeatmap.count(), 30);
  } finally {
    await context.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Hammond\'s colour', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });

    await page.locator('#central-node-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#3A3A42');

    await page.locator('#central-node-chat-button').click();
    await page.locator('#chat-view').waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});
```

- [ ] **Step 2: Register the new spec in the browser test script**

In `package.json`, change:

```json
    "test:browser": "node --test --test-concurrency=1 tests/browser/home.spec.mjs tests/browser/chat.spec.mjs tests/browser/nutrition.spec.mjs",
```

to:

```json
    "test:browser": "node --test --test-concurrency=1 tests/browser/home.spec.mjs tests/browser/chat.spec.mjs tests/browser/nutrition.spec.mjs tests/browser/central-node.spec.mjs",
```

- [ ] **Step 3: Run the browser suite**

```bash
npx playwright install chromium
npm run test:browser
```
Expected: PASS, all 18 browser tests (16 existing + 2 new). If the `[data-central-node="todays-status"]` or `[data-central-node="cross-agent"]` substring assertions don't match, read the real `tests/fixtures/valid/central-node.md` content directly and adjust the regex to a real, distinctive substring from it — do not weaken the assertion to something meaningless just to make it pass.

- [ ] **Step 4: Run the full unit/integration suite one more time**

```bash
npm test
```
Expected: PASS, 346.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/central-node.spec.mjs package.json
git commit -m "test: add browser acceptance coverage for the Central Node tab and its chat panel"
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

Expected: 346 unit/integration tests passing, 4 valid fixtures, 0 vulnerabilities, 18 browser tests passing, clean working tree.

- [ ] **Update `docs/IMPLEMENTATION_STATUS.md`** with a dated "Phase 7: Central Node Tab — Complete" entry following the existing format (see Phase 6's entry for the Nutrition tab branch as a template), recording the final test counts above. This is the last planned Life Hub dashboard tab in the current roadmap — check with the user for what (if anything) comes next before writing a "Next Phase" line, rather than guessing.
