# Life Hub Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the framework-free, browser-compatible data engine that turns canonical Life Hub Markdown events into validated records, targets, aggregates, trends, calendar/search models, and deterministic fixture results.

**Architecture:** Pure ECMAScript modules under `js/core/` contain all domain logic and depend on no browser globals. YAML parsing is injected so the browser can use js-yaml from the pinned CDN while Node tests use the same parser package. Configuration and hand-writable Markdown remain the durable source format; generated view models never become stored records. Phase 2 browser/CDN integration must use exact js-yaml 4.3.0; no browser/CDN file exists in Phase 1.

**Tech Stack:** HTML/CSS/vanilla JavaScript modules, Node.js 22+, Node's built-in test runner, js-yaml 4.3.0 for tests, npm only for development tooling, Markdown with YAML frontmatter.

## Global Constraints

- Production application code has no framework, compilation step, or client-side secret.
- Every date, week boundary, and timestamp rule uses `Australia/Sydney`; never hard-code `+10`, `+11`, UTC, or a `Z` suffix for stored timestamps.
- Canonical event paths are `data/<domain>[/<subdomain>]/YYYY/MM/YYYY-MM-DD-<slug>[-HHMMSS].md`.
- Every new event requires `schema_version`, `id`, `type`, `date`, `time`, `created_at`, `updated_at`, and `source`.
- Missing observations are `null`; empty additive values are `0`.
- Historical records missing common metadata are parsed as `legacy: true` without invented measurements.
- Weeks begin Monday. Multiple completed workouts on one day count as one streak day.
- Daily polyphenols are the sum of meal scores and may exceed 10.
- Effective-dated target sets are append-only and resolve to the greatest `valid_from` on or before the requested Sydney date.
- Source events are append-oriented; this phase does not build correction, deletion, or browser editing.
- All tests use fixtures and never access production GitHub, Anthropic, Resend, or Day One.

---

## File map

- `package.json` — test and fixture-validation commands; no production bundling.
- `.gitignore` — isolated worktrees, local dependencies, environment files, test output, and operating-system noise.
- `config/targets.yml` — effective-dated targets and trend thresholds.
- `config/agents.yml` — approved v1 launch roster, route index, domain, tab, six confirmed colours, and Hammond's explicitly provisional colour.
- `js/core/time.js` — Sydney date keys, offsets, Monday week starts, ranges, and date arithmetic.
- `js/core/targets.js` — target-set parsing, resolution, and daily calorie/protein rules.
- `js/core/records.js` — frontmatter splitting, canonical path parsing, common metadata normalization, and event construction.
- `js/core/validate.js` — common and domain-specific schema checks.
- `js/core/aggregate.js` — day type, daily nutrition, streak, top-set, and completeness calculations.
- `js/core/trends.js` — observation trends, comparison chips, and weekly downsampling.
- `js/core/search.js` — local AND-term event search and calendar marker models.
- `central-node.md` — verbatim migration of the current Notion Central Node.
- `tests/fixtures/` — one complete sample day, sparse observations, malformed records, DST boundaries, and target-boundary records.
- `tests/unit/*.test.js` — focused Node tests for each pure module.
- `scripts/validate-fixtures.mjs` — validates every fixture and prints deterministic Home totals.
- `docs/IMPLEMENTATION_STATUS.md` — verified commands, completed phase, and known limitations.
- `docs/REVIEW.md` — review findings and resolution ledger initialized with its operating rules.

### Task 1: Establish the testable static-project baseline

**Files:**
- Create: `package.json`
- Modify: `.gitignore`
- Create: `docs/IMPLEMENTATION_STATUS.md`
- Create: `docs/REVIEW.md`

**Interfaces:**
- Consumes: the approved design at `docs/superpowers/specs/2026-07-31-life-hub-design.md`.
- Produces: `npm test`, `npm run test:unit`, and `npm run validate:fixtures` commands used by every later task. This configuration-only task uses the user-approved TDD exception; behavior tests begin before the first production module in Task 2.

- [ ] **Step 1: Confirm the baseline commands are absent**

Run: `npm test`  
Expected: FAIL because `package.json` does not exist.

- [ ] **Step 2: Add the project manifest and extend the ignore rules**

```json
{
  "name": "life-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "test:unit": "node --test",
    "validate:fixtures": "node scripts/validate-fixtures.mjs"
  },
  "devDependencies": {
    "js-yaml": "4.3.0"
  },
  "engines": {
    "node": ">=22"
  }
}
```

```gitignore
.worktrees/
node_modules/
.env
.env.*
!.env.example
coverage/
test-results/
playwright-report/
.DS_Store
```

Preserve the existing `.worktrees/` entry. Create `docs/IMPLEMENTATION_STATUS.md` with the phase name, the three commands above, and the statement that production providers are intentionally disconnected. Create `docs/REVIEW.md` with columns for severity, finding, reproduction, fix commit, and verification, followed by “No findings recorded.”

- [ ] **Step 3: Install and verify the baseline commands**

Run: `npm install`  
Run: `npm test`  
Run: `npm run test:unit`  
Expected: both test commands exit successfully with zero tests because behavior modules begin in Task 2.

- [ ] **Step 4: Commit the baseline**

```bash
git add package.json package-lock.json .gitignore docs/IMPLEMENTATION_STATUS.md docs/REVIEW.md
git commit -m "chore: establish Life Hub test baseline"
```

### Task 2: Implement Sydney calendar arithmetic

**Files:**
- Create: `js/core/time.js`
- Create: `tests/unit/time.test.js`

**Interfaces:**
- Consumes: JavaScript `Date` instants and `YYYY-MM-DD` calendar keys.
- Produces: `getSydneyDateKey(instant)`, `getSydneyTimestamp(instant)`, `addCalendarDays(dateKey, count)`, `getSydneyWeekStart(dateKey)`, `daysBetween(a, b)`, and `enumerateDateKeys(start, end)`.

- [ ] **Step 1: Write failing DST and calendar-key tests**

```js
// tests/unit/time.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays, daysBetween, enumerateDateKeys,
  getSydneyDateKey, getSydneyTimestamp, getSydneyWeekStart
} from '../../js/core/time.js';

test('Sydney date key crosses the spring DST boundary by calendar date', () => {
  assert.equal(getSydneyDateKey(new Date('2026-10-03T15:30:00Z')), '2026-10-04');
  assert.equal(getSydneyTimestamp(new Date('2026-10-03T16:30:00Z')).endsWith('+11:00'), true);
});

test('Sydney timestamp uses standard time in July', () => {
  assert.equal(getSydneyTimestamp(new Date('2026-07-31T08:00:00Z')), '2026-07-31T18:00:00+10:00');
});

test('calendar arithmetic never passes through the device timezone', () => {
  assert.equal(addCalendarDays('2026-10-04', 1), '2026-10-05');
  assert.equal(getSydneyWeekStart('2026-07-31'), '2026-07-27');
  assert.equal(daysBetween('2026-07-27', '2026-07-31'), 4);
  assert.deepEqual(enumerateDateKeys('2026-07-30', '2026-08-01'), [
    '2026-07-30', '2026-07-31', '2026-08-01'
  ]);
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `node --test tests/unit/time.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement calendar-component arithmetic and offset formatting**

```js
// js/core/time.js
export const SYDNEY_TZ = 'Australia/Sydney';

function parts(instant, options) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ, ...options
  }).formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new TypeError(`Invalid calendar date: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function utcDate(key) {
  const { year, month, day } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getSydneyDateKey(instant = new Date()) {
  const p = parts(instant, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

export function getSydneyTimestamp(instant = new Date()) {
  const p = parts(instant, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset'
  });
  const offset = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

export function addCalendarDays(key, count) {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function getSydneyWeekStart(key) {
  const day = utcDate(key).getUTCDay();
  return addCalendarDays(key, -((day + 6) % 7));
}

export const daysBetween = (a, b) => Math.round((utcDate(b) - utcDate(a)) / 86400000);

export function enumerateDateKeys(start, end) {
  const keys = [];
  for (let key = start; key <= end; key = addCalendarDays(key, 1)) keys.push(key);
  return keys;
}
```

- [ ] **Step 4: Run the time tests**

Run: `node --test tests/unit/time.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit Sydney time support**

```bash
git add js/core/time.js tests/unit/time.test.js
git commit -m "feat: add Sydney calendar helpers"
```

### Task 3: Add effective-dated targets and agent registry

**Files:**
- Create: `config/targets.yml`
- Create: `config/agents.yml`
- Create: `js/core/targets.js`
- Create: `tests/unit/targets.test.js`

**Interfaces:**
- Consumes: parsed `targets.yml`, Sydney date key, resolved day type, and next-day recovery flag.
- Produces: `resolveTargetSet(config, dateKey)`, `getDayTargets(config, dateKey, dayType, recovery)`, and stable configuration fields used by trends and later UI.

- [ ] **Step 1: Write failing target-boundary tests**

```js
// tests/unit/targets.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import { getDayTargets, resolveTargetSet } from '../../js/core/targets.js';

const config = load(await readFile(new URL('../../config/targets.yml', import.meta.url), 'utf8'));

test('resolves the greatest valid_from not after the date', () => {
  assert.equal(resolveTargetSet(config, '2026-07-31').valid_from, '2020-01-01');
  assert.throws(() => resolveTargetSet(config, '2019-12-31'), /No target set/);
});

test('applies recovery to the following day targets without changing day type', () => {
  assert.deepEqual(getDayTargets(config, '2026-07-31', 'workout_45_60', true), {
    calories: 2400, protein_g: 140, fat_ceiling_g: 50,
    sodium_ceiling_mg: 2000, calcium_target_mg: 1000,
    polyphenol_daily_aim: 10,
    meal_protein_g: { breakfast: 30, lunch: 30, dinner: 40, snack: 20, minimum: 25 }
  });
});
```

- [ ] **Step 2: Run the tests and verify configuration is absent**

Run: `node --test tests/unit/targets.test.js`  
Expected: FAIL because target configuration and module do not exist.

- [ ] **Step 3: Add exact initial configuration**

```yaml
# config/targets.yml
target_sets:
  - valid_from: '2020-01-01'
    calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 }
    protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 }
    fat_ceiling_g: 50
    sodium_ceiling_mg: 2000
    calcium_target_mg: 1000
    polyphenol_daily_aim: 10
trend_thresholds:
  weight_kg: [0.2, 0.5, 1.0]
  body_fat_pct: [0.2, 0.5, 1.0]
  skeletal_muscle_kg: [0.1, 0.3, 0.6]
  measurement_cm: [0.3, 0.8, 1.5]
  mood_score: [1, 2, 3]
```

Create `config/agents.yml` with the approved seven-agent v1 roster, slugs, domains, tabs, and exact name triggers from the Notion spec. Record the confirmed mappings Brisket `#F0B843`, Chadwick `#2E7BD6`, Hyaluronica `#B99EE0`, Penelope `#C85A64`, Sara `#BBD9B4`, and Vera `#37598A` with `colour_source: confirmed`. Hammond alone remains `#142B51` with `colour_source: provisional_until_cover_migration`. Sterling `#4E7A48` is known but excluded from the approved v1 roster.

```js
// js/core/targets.js
export function resolveTargetSet(config, dateKey) {
  const sets = [...config.target_sets].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const found = sets.filter(set => set.valid_from <= dateKey).at(-1);
  if (!found) throw new RangeError(`No target set covers ${dateKey}`);
  return found;
}

export function getDayTargets(config, dateKey, dayType = 'movement', recovery = false) {
  const set = resolveTargetSet(config, dateKey);
  return {
    calories: set.calories[dayType] + (recovery ? set.calories.recovery_bonus : 0),
    protein_g: recovery ? set.protein.recovery_daily : set.protein.daily,
    fat_ceiling_g: set.fat_ceiling_g,
    sodium_ceiling_mg: set.sodium_ceiling_mg,
    calcium_target_mg: set.calcium_target_mg,
    polyphenol_daily_aim: set.polyphenol_daily_aim,
    meal_protein_g: {
      breakfast: set.protein.breakfast, lunch: set.protein.lunch,
      dinner: set.protein.dinner, snack: set.protein.snack,
      minimum: set.protein.min_per_meal
    }
  };
}
```

- [ ] **Step 4: Run target tests**

Run: `node --test tests/unit/targets.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit configuration and target resolution**

```bash
git add config/targets.yml config/agents.yml js/core/targets.js tests/unit/targets.test.js
git commit -m "feat: add effective-dated Life Hub targets"
```

### Task 4: Parse and validate canonical event records

**Files:**
- Create: `js/core/records.js`
- Create: `js/core/validate.js`
- Create: `tests/unit/records.test.js`
- Create: `tests/fixtures/valid/meal.md`
- Create: `tests/fixtures/invalid/negative-meal.md`

**Interfaces:**
- Consumes: `(text: string, path: string, loadYaml: (yaml: string) => object)`.
- Produces: `parseEventDocument(text, path, loadYaml) -> { record, body, path, legacy }`, `parseCanonicalPath(path)`, and `validateRecord(record) -> string[]`.

- [ ] **Step 1: Write failing canonical, legacy, and invalid-value tests**

```js
// tests/unit/records.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { parseEventDocument } from '../../js/core/records.js';

const valid = `---\nschema_version: 1\nid: meal-1\ntype: meal\ndate: 2026-07-30\ntime: "07:45"\ncreated_at: 2026-07-30T07:45:00+10:00\nupdated_at: 2026-07-30T07:45:00+10:00\nsource: test_fixture\nmeal: breakfast\ncalories: 520\nprotein_g: 38\nfat_g: 12\npolyphenol_score: 6\n---\nProtein smoothie.`;

test('parses a canonical meal and body', () => {
  const event = parseEventDocument(valid, 'data/nutrition/2026/07/2026-07-30-breakfast.md', load);
  assert.equal(event.record.id, 'meal-1');
  assert.equal(event.body, 'Protein smoothie.');
  assert.equal(event.legacy, false);
});

test('marks missing historical common metadata as legacy', () => {
  const event = parseEventDocument('---\ntype: weight\ndate: 2020-01-02\nweight_kg: 90\n---', 'data/body/weight/2020/01/2020-01-02-weight.md', load);
  assert.equal(event.legacy, true);
  assert.equal(event.record.weight_kg, 90);
});

test('rejects negative nutrition and path/date disagreement', () => {
  assert.throws(() => parseEventDocument(valid.replace('calories: 520', 'calories: -1'), 'data/nutrition/2026/07/2026-07-31-breakfast.md', load), /calories|date/);
});
```

- [ ] **Step 2: Run tests and verify parser modules are missing**

Run: `node --test tests/unit/records.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement frontmatter, path, and domain validation**

```js
// js/core/records.js
import { validateRecord } from './validate.js';

const PATH = /^data\/(nutrition|fitness|mind|sleep|heart|skincare|fragrance|body\/(?:weight|composition|measurements))\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

export function parseCanonicalPath(path) {
  const match = PATH.exec(path);
  if (!match) throw new TypeError(`Non-canonical event path: ${path}`);
  return { domain: match[1], year: match[2], month: match[3], date: match[4] };
}

export function parseEventDocument(text, path, loadYaml) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
  if (!match) throw new TypeError(`Missing YAML frontmatter: ${path}`);
  const record = loadYaml(match[1]);
  const location = parseCanonicalPath(path);
  const legacy = ['schema_version', 'id', 'time', 'created_at', 'updated_at', 'source']
    .some(key => record[key] == null);
  const errors = validateRecord(record, { allowLegacy: legacy });
  if (record.date !== location.date) errors.push('record date does not match path date');
  if (errors.length) throw new TypeError(`${path}: ${errors.join('; ')}`);
  return { record, body: match[2].trim(), path, legacy };
}
```

Implement `validateRecord` with a common required-field check for non-legacy records and a validator map for `meal`, `workout`, `diary`, `weight`, `composition`, `measurements`, `sleep`, `heart`, `skincare`, and `fragrance`. Use finite-number helpers with minimums, enumerations for meal/mood/energy/day type/status/routine, `null` allowance for optional observations, and nested workout checks requiring finite non-negative reps and weights. Unknown record types return an error.

- [ ] **Step 4: Add fixture files and run record tests**

Copy the exact full-metadata breakfast event from Notion specification section 15.4 to `tests/fixtures/valid/meal.md`. Create `negative-meal.md` from the same record with `calories: -1`.

Run: `node --test tests/unit/records.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit the canonical record boundary**

```bash
git add js/core/records.js js/core/validate.js tests/unit/records.test.js tests/fixtures
git commit -m "feat: validate canonical Life Hub events"
```

### Task 5: Calculate daily nutrition, day type, streaks, strength, and completeness

**Files:**
- Create: `js/core/aggregate.js`
- Create: `tests/unit/aggregate.test.js`
- Create: `tests/fixtures/valid/lunch.md`
- Create: `tests/fixtures/valid/workout.md`
- Create: `tests/fixtures/valid/diary.md`

**Interfaces:**
- Consumes: parsed event objects `{ record, body, path, legacy }` and a Sydney date key.
- Produces: `aggregateNutrition`, `resolveDayType`, `hasRecoveryBonus`, `calculateWorkoutStreak`, `getTopSets`, and `getLoggingCompleteness`.

- [ ] **Step 1: Write failing fixture-output tests**

```js
// tests/unit/aggregate.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateNutrition, calculateWorkoutStreak, getLoggingCompleteness,
  getTopSets, hasRecoveryBonus, resolveDayType
} from '../../js/core/aggregate.js';

const records = [
  { type: 'meal', date: '2026-07-30', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12, sodium_mg: 420, calcium_mg: 380, polyphenol_score: 6 },
  { type: 'meal', date: '2026-07-30', meal: 'lunch', calories: 610, protein_g: 42, fat_g: 15, sodium_mg: 680, calcium_mg: 210, polyphenol_score: 3 },
  { type: 'workout', date: '2026-07-30', status: 'completed', day_type: 'workout_30', recovery_flag_next_day: false, exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32 }, { reps: 8, weight_kg: 34 }] }] },
  { type: 'diary', date: '2026-07-30' }
];

test('matches the approved sample Home totals', () => {
  assert.deepEqual(aggregateNutrition(records, '2026-07-30'), {
    calories: 1130, protein_g: 80, fat_g: 27, sodium_mg: 1100,
    calcium_mg: 590, polyphenol_score: 9,
    meals: { breakfast: { protein_g: 38 }, lunch: { protein_g: 42 }, dinner: { protein_g: 0 }, snack: { protein_g: 0 } }
  });
  assert.equal(resolveDayType(records, '2026-07-30'), 'workout_30');
  assert.deepEqual(getTopSets(records[2]), { 'Chest Press': { weight_kg: 34, reps: 8 } });
});

test('empty additive values are zero and optional observations are absent', () => {
  assert.equal(aggregateNutrition([], '2026-07-31').calories, 0);
  assert.equal(hasRecoveryBonus(records, '2026-07-31'), false);
});

test('streak deduplicates dates and ignores planned or skipped sessions', () => {
  const workouts = [
    { type: 'workout', date: '2026-07-31', status: 'completed' },
    { type: 'workout', date: '2026-07-31', status: 'completed' },
    { type: 'workout', date: '2026-07-30', status: 'completed' },
    { type: 'workout', date: '2026-07-29', status: 'skipped' }
  ];
  assert.equal(calculateWorkoutStreak(workouts, '2026-07-31'), 2);
});

test('completeness uses five categories and a 48-hour body window', () => {
  const result = getLoggingCompleteness(records, '2026-07-30');
  assert.deepEqual(result, { nutrition: true, fitness: true, diary: true, body: false, skincare: false, complete: 3, total: 5 });
});
```

- [ ] **Step 2: Run the tests and verify aggregation is missing**

Run: `node --test tests/unit/aggregate.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement pure aggregation functions**

```js
// js/core/aggregate.js
import { addCalendarDays } from './time.js';

const sum = (items, field) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);

export function aggregateNutrition(records, date) {
  const meals = records.filter(r => r.type === 'meal' && r.date === date);
  const distribution = Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(name => [name, {
    protein_g: sum(meals.filter(meal => meal.meal === name), 'protein_g')
  }]));
  return {
    calories: sum(meals, 'calories'), protein_g: sum(meals, 'protein_g'),
    fat_g: sum(meals, 'fat_g'), sodium_mg: sum(meals, 'sodium_mg'),
    calcium_mg: sum(meals, 'calcium_mg'), polyphenol_score: sum(meals, 'polyphenol_score'),
    meals: distribution
  };
}

export function resolveDayType(records, date) {
  const rank = { movement: 0, workout_30: 1, workout_45_60: 2 };
  return records.filter(r => r.type === 'workout' && r.date === date && r.status === 'completed')
    .reduce((best, r) => rank[r.day_type] > rank[best] ? r.day_type : best, 'movement');
}

export function hasRecoveryBonus(records, date) {
  const previous = addCalendarDays(date, -1);
  return records.some(r => r.type === 'workout' && r.date === previous && r.status === 'completed' && r.recovery_flag_next_day === true);
}
```

Add `calculateWorkoutStreak` using unique completed date keys walking backward from the most recent completed day at or before `asOfDate`. Add `getTopSets` by choosing the greatest `weight_kg`, breaking ties by reps. Add `getLoggingCompleteness` with nutrition, fitness, diary, body within `[date-1, date]`, and skincare; sleep and heart never count.

- [ ] **Step 4: Add the remaining approved sample fixtures and run tests**

Copy the full-metadata lunch, workout, and diary examples from specification section 15.4 into the exact canonical fixture paths under `tests/fixtures/valid/data/`.

Run: `node --test tests/unit/aggregate.test.js`  
Expected: PASS with `1130`, `80`, `27`, streak behavior, and completeness behavior verified.

- [ ] **Step 5: Commit core aggregation**

```bash
git add js/core/aggregate.js tests/unit/aggregate.test.js tests/fixtures/valid
git commit -m "feat: calculate Life Hub daily signals"
```

### Task 6: Implement sparse-data trends, comparisons, and downsampling

**Files:**
- Create: `js/core/trends.js`
- Create: `tests/unit/trends.test.js`

**Interfaces:**
- Consumes: current/previous observations, metric configuration, daily series, and period ranges.
- Produces: `getTrend(current, previous, config)`, `comparePeriods(current, previous, config)`, and `downsampleWeekly(points, valueField)`.

- [ ] **Step 1: Write failing first-reading, stale-gap, and weekly-gap tests**

```js
// tests/unit/trends.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePeriods, downsampleWeekly, getTrend } from '../../js/core/trends.js';

const weight = { field: 'weight_kg', unit: 'kg', good: 'down', thresholds: [0.2, 0.5, 1.0] };

test('first observation is neutral', () => {
  assert.deepEqual(getTrend({ date: '2026-07-31', weight_kg: 86.3 }, null, weight), {
    direction: 'neutral', colour: 'neutral', intensity: 'none', label: 'First reading', delta: null
  });
});

test('old comparison includes its date and correct good direction', () => {
  const trend = getTrend(
    { date: '2026-07-31', weight_kg: 86.3 },
    { date: '2026-05-21', weight_kg: 87.5 }, weight
  );
  assert.equal(trend.colour, 'green');
  assert.equal(trend.intensity, 'strong');
  assert.match(trend.label, /−1.2 kg since 21 May/);
});

test('weeks without observations remain null gaps', () => {
  const weekly = downsampleWeekly([
    { date: '2026-07-01', value: 80 },
    { date: '2026-07-03', value: 82 },
    { date: '2026-07-20', value: 79 }
  ], 'value');
  assert.equal(weekly[0].value, 81);
  assert.equal(weekly.some(point => point.value === null), true);
});

test('comparison with no previous data is neutral', () => {
  assert.equal(comparePeriods(120, null, weight).label, 'no prior data');
});
```

- [ ] **Step 2: Run tests and verify the trend module is missing**

Run: `node --test tests/unit/trends.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement explicit trend semantics**

```js
// js/core/trends.js
import { daysBetween, enumerateDateKeys, getSydneyWeekStart } from './time.js';

const intensityFor = (magnitude, [light, medium, strong]) =>
  magnitude >= strong ? 'strong' : magnitude >= medium ? 'medium' : magnitude >= light ? 'light' : 'none';

export function getTrend(current, previous, config) {
  if (!previous || previous[config.field] == null) {
    return { direction: 'neutral', colour: 'neutral', intensity: 'none', label: 'First reading', delta: null };
  }
  const delta = current[config.field] - previous[config.field];
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = delta === 0 ? null : config.good === direction;
  const old = daysBetween(previous.date, current.date) > 60;
  const sign = delta < 0 ? '−' : delta > 0 ? '+' : '';
  const dateLabel = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${previous.date}T00:00:00Z`));
  return {
    direction, colour: good == null ? 'neutral' : good ? 'green' : 'red',
    intensity: intensityFor(Math.abs(delta), config.thresholds),
    label: `${sign}${Math.abs(delta).toFixed(1)} ${config.unit}${old ? ` since ${dateLabel}` : ''}`,
    delta
  };
}
```

Implement `comparePeriods` by returning a neutral result when the previous value is `null`, otherwise delegating to the same direction/intensity rules without observation dates. Implement `downsampleWeekly` by spanning every Monday between the first and last points, calculating the mean of non-null observations per week, inserting `{ date: weekStart, value: null }` for empty weeks, and rejecting output over 120 points.

- [ ] **Step 4: Run trend tests**

Run: `node --test tests/unit/trends.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit trends and downsampling**

```bash
git add js/core/trends.js tests/unit/trends.test.js
git commit -m "feat: add sparse-data trend semantics"
```

### Task 7: Build calendar markers and private local search

**Files:**
- Create: `js/core/search.js`
- Create: `tests/unit/search.test.js`

**Interfaces:**
- Consumes: parsed events in the already-loaded client range and a raw search string.
- Produces: `searchEvents(events, query)`, `buildCalendarMarkers(events)`, and `getSearchExtension(currentStart) -> newStart`.

- [ ] **Step 1: Write failing AND-search and marker tests**

```js
// tests/unit/search.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarMarkers, getSearchExtension, searchEvents } from '../../js/core/search.js';

const events = [
  { record: { id: 'm1', type: 'meal', date: '2026-07-30', meal: 'lunch' }, body: 'Marley Spoon chicken bowl.' },
  { record: { id: 'd1', type: 'diary', date: '2026-07-30', tags: ['evening'], highlights: 'Solid workout' }, body: 'Private prose.' },
  { record: { id: 'w1', type: 'workout', date: '2026-07-29', title: 'Chest and Curls' }, body: 'Good session.' }
];

test('search terms are case-insensitive and ANDed', () => {
  assert.deepEqual(searchEvents(events, 'chicken bowl').map(result => result.id), ['m1']);
  assert.deepEqual(searchEvents(events, 'chicken workout'), []);
});

test('results are newest first and contain bounded snippets', () => {
  const [result] = searchEvents(events, 'solid');
  assert.equal(result.id, 'd1');
  assert.match(result.snippet, /Solid workout/);
});

test('calendar markers map canonical types to specified categories', () => {
  assert.deepEqual(buildCalendarMarkers(events)['2026-07-30'], ['nutrition', 'diary']);
});

test('search extension moves exactly three calendar months backward', () => {
  assert.equal(getSearchExtension('2026-07-01'), '2026-04-01');
});
```

- [ ] **Step 2: Run tests and verify search is missing**

Run: `node --test tests/unit/search.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement in-memory search and calendar categories**

```js
// js/core/search.js
const CATEGORY = {
  meal: 'nutrition', workout: 'fitness', diary: 'diary', skincare: 'skincare',
  weight: 'body', composition: 'body', measurements: 'body', sleep: 'sleep'
};

export function searchEvents(events, query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return events.map(event => {
    const r = event.record;
    const raw = [event.body, r.title, r.meal, r.highlights, r.challenges, ...(r.tags || [])]
      .filter(Boolean).join(' ');
    return { event, raw, text: raw.toLocaleLowerCase() };
  }).filter(({ text }) => terms.every(term => text.includes(term)))
    .sort((a, b) => b.event.record.date.localeCompare(a.event.record.date))
    .map(({ event, raw }) => ({
      id: event.record.id, date: event.record.date, type: event.record.type,
      snippet: raw.slice(0, 160)
    }));
}

export function buildCalendarMarkers(events) {
  const days = {};
  for (const { record } of events) {
    const category = CATEGORY[record.type];
    if (!category) continue;
    days[record.date] ||= [];
    if (!days[record.date].includes(category)) days[record.date].push(category);
  }
  return days;
}
```

Implement `getSearchExtension` with integer year/month arithmetic so January rolls into the prior year and the result is always the first day of the month. Search stays pure and never sends or logs the query.

- [ ] **Step 4: Run search tests**

Run: `node --test tests/unit/search.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit search and calendar models**

```bash
git add js/core/search.js tests/unit/search.test.js
git commit -m "feat: add private event search and calendar markers"
```

### Task 8: Validate the complete fixture corpus and migrate the Central Node

**Files:**
- Create: `scripts/validate-fixtures.mjs`
- Create: `tests/unit/fixtures.test.js`
- Create: `tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-breakfast.md`
- Create: `tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md`
- Create: `tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md`
- Create: `tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md`
- Create: `central-node.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`

**Interfaces:**
- Consumes: every `.md` event under `tests/fixtures/valid/data/` and the live Notion page `305f794f-8476-802b-882d-c22e3e4b4e3b`.
- Produces: a deterministic fixture validation command, the approved Home totals, and the verbatim launch Central Node.

- [ ] **Step 1: Write the failing fixture-corpus test**

```js
// tests/unit/fixtures.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('fixture validator reports the approved Home sample', async () => {
  const { stdout } = await exec(process.execPath, ['scripts/validate-fixtures.mjs']);
  const result = JSON.parse(stdout);
  assert.deepEqual(result, {
    files: 4, valid: 4, invalid: 0,
    home: { calories: 1130, protein_g: 80, fat_g: 27, day_type: 'workout_30', workout_streak: 1 }
  });
});
```

- [ ] **Step 2: Run the corpus test and verify the script is missing**

Run: `node --test tests/unit/fixtures.test.js`  
Expected: FAIL because `scripts/validate-fixtures.mjs` does not exist.

- [ ] **Step 3: Implement recursive fixture validation**

```js
// scripts/validate-fixtures.mjs
import { readdir, readFile } from 'node:fs/promises';
import { load } from 'js-yaml';
import { parseEventDocument } from '../js/core/records.js';
import { aggregateNutrition, calculateWorkoutStreak, resolveDayType } from '../js/core/aggregate.js';

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(`${dir}/${entry.name}`)
    : [`${dir}/${entry.name}`]))).flat();
}

const root = 'tests/fixtures/valid/';
const paths = (await files(`${root}data`)).filter(path => path.endsWith('.md'));
const events = paths.map(async path => parseEventDocument(
  await readFile(path, 'utf8'), path.slice(root.length), load
));
const parsed = await Promise.all(events);
const records = parsed.map(event => event.record);
const nutrition = aggregateNutrition(records, '2026-07-30');
console.log(JSON.stringify({
  files: paths.length, valid: parsed.length, invalid: 0,
  home: {
    calories: nutrition.calories, protein_g: nutrition.protein_g, fat_g: nutrition.fat_g,
    day_type: resolveDayType(records, '2026-07-30'),
    workout_streak: calculateWorkoutStreak(records, '2026-07-30')
  }
}));
```

- [ ] **Step 4: Migrate the Central Node safely and verify the phase**

Fetch Notion page `305f794f-8476-802b-882d-c22e3e4b4e3b` immediately before writing. Copy its ten writing rules and seven canonical sections verbatim into `central-node.md`; preserve all current constraints, dates, and directives. Do not include Notion block markup, page properties, or credentials. Compare every heading and rule against a second fetch before committing.

Run: `npm test`  
Run: `npm run validate:fixtures`  
Expected: all tests PASS and JSON exactly matches the corpus test above.

Update `docs/IMPLEMENTATION_STATUS.md` with Phase 1 complete, the passing command output, production providers disconnected, and the next phase “Read-only PWA.”

- [ ] **Step 5: Commit the verified foundation**

```bash
git add scripts/validate-fixtures.mjs tests/unit/fixtures.test.js tests/fixtures/valid/data central-node.md docs/IMPLEMENTATION_STATUS.md
git commit -m "feat: complete Life Hub data foundation"
```

### Task 9: Review and publish the foundation branch

**Files:**
- Modify only if findings exist: `docs/REVIEW.md`
- Modify only for verified fixes: files named by the finding

**Interfaces:**
- Consumes: all Phase 1 commits and test output.
- Produces: a review-ready branch with no unresolved high-severity findings and a draft pull request targeting `main`.

- [ ] **Step 1: Run the complete verification gate**

```bash
npm test
npm run validate:fixtures
git diff --check main...HEAD
git status --short
```

Expected: tests pass, fixture JSON matches, diff check is silent, and the worktree is clean.

- [ ] **Step 2: Audit the global constraints**

Check that stored fixture timestamps contain `+10:00` or `+11:00`, no event uses a `Z` suffix, no missing observation is converted to zero, no unknown event type passes validation, no production URL or credential appears, and every core module is browser-compatible ESM without Node imports.

- [ ] **Step 3: Record and fix review findings**

For each finding, add one row to `docs/REVIEW.md` containing severity, exact reproduction, fix commit, and verification result. Fix high-severity findings before publication and commit fixes separately with `fix: <concise finding>`.

- [ ] **Step 4: Re-run the gate after fixes**

Run the four commands from Step 1.  
Expected: the same clean results.

- [ ] **Step 5: Push and open a draft pull request**

```bash
git push -u origin agent/life-hub-foundation
```

Open a draft pull request titled `Build Life Hub data foundation`. Its body lists the pure-core interfaces, the exact fixture result, the test commands, the intentionally disconnected production providers, and the next planned phase.
