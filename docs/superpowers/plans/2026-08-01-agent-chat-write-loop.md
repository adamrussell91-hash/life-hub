# Agent Chat and Write Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Chat view where Adam converses with his Life Hub agents, gets a schema-validated record proposal, confirms it, and has it written to the private `life-hub` repository through the existing authenticated Netlify Function boundary — with the affected domain view refreshing immediately.

**Architecture:** Two new authenticated Netlify Functions (`/api/chat` streaming, `/api/chat/confirm` writing) sit alongside the existing session/repo functions and reuse their shared modules (`auth-security.mjs`, `http.mjs`, `github-client.mjs`, `repo-policy.mjs`) plus the existing pure core modules (`js/core/records.js`, `validate.js`, `aggregate.js`, `targets.js`, `time.js`). New `_shared` modules add deterministic routing, a tool schema, a recent-history digest, and a thin Anthropic streaming client. The browser gets a new Chat view driven by a small controller mirroring the existing `app-controller.js` pattern.

**Tech Stack:** Node 22 built-in test runner, Netlify Functions v2 (Fetch `Request`/`Response`), Anthropic Messages API (streaming, tool use), GitHub Contents API, Playwright for browser acceptance.

**Reference spec:** `docs/superpowers/specs/2026-08-01-agent-chat-write-loop-design.md`

---

## Known pre-existing bug this plan fixes first

`js/core/records.js`'s canonical path grammar expects nested `data/body/weight/…`, `data/body/composition/…`, `data/body/measurements/…` paths, but `netlify/functions/_shared/repo-policy.mjs`'s allowlist (and its own passing test) only ever accepts flat `data/body/YYYY/MM/…` paths — the two have never been exercised together because no real body-domain file exists in the repository yet. Task 1 fixes `records.js` to match the flat form `repo-policy.mjs` already allows, since every other domain (nutrition/fitness/mind/skincare) uses the flat form and `aggregate.js`'s completeness check is already type-based, not path-based. This is required for Dr Sara Tonin's body-domain writes in this phase to round-trip back through the existing read/sync path.

---

### Task 1: Fix the body-domain canonical path grammar

**Files:**
- Modify: `js/core/records.js:4,10-12`
- Test: `tests/unit/records.test.js:46,79-81`

- [ ] **Step 1: Update the two existing tests to express the flat body-domain path**

In `tests/unit/records.test.js`, change line 46 from:
```js
    'data/body/weight/2020/01/2020-01-02-weight.md',
```
to:
```js
    'data/body/2020/01/2020-01-02-weight.md',
```

And change lines 79-81 from:
```js
  assert.deepEqual(parseCanonicalPath('data/body/composition/2024/02/2024-02-29-aeke.md'), {
    domain: 'body/composition', year: '2024', month: '02', date: '2024-02-29'
  });
```
to:
```js
  assert.deepEqual(parseCanonicalPath('data/body/2024/02/2024-02-29-aeke.md'), {
    domain: 'body', year: '2024', month: '02', date: '2024-02-29'
  });
```

- [ ] **Step 2: Run the suite and confirm these two tests fail**

Run: `npm run test:unit`
Expected: FAIL — 2 failures in `records.test.js`, both a `TypeError: Non-canonical event path` thrown instead of the expected return value.

- [ ] **Step 3: Fix the path grammar and type-to-domain mapping**

In `js/core/records.js`, replace:
```js
const PATH = /^data\/(nutrition|fitness|mind|sleep|heart|skincare|fragrance|body\/(?:weight|composition|measurements))\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

const TYPE_DOMAINS = {
  meal: 'nutrition',
  workout: 'fitness',
  diary: 'mind',
  weight: 'body/weight',
  composition: 'body/composition',
  measurements: 'body/measurements',
  sleep: 'sleep',
  heart: 'heart',
  skincare: 'skincare',
  fragrance: 'fragrance'
};
```
with:
```js
const PATH = /^data\/(nutrition|fitness|mind|sleep|heart|skincare|fragrance|body)\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

export const TYPE_DOMAINS = {
  meal: 'nutrition',
  workout: 'fitness',
  diary: 'mind',
  weight: 'body',
  composition: 'body',
  measurements: 'body',
  sleep: 'sleep',
  heart: 'heart',
  skincare: 'skincare',
  fragrance: 'fragrance'
};
```
(`TYPE_DOMAINS` is now exported — Task 5 imports it to keep the write path's type-to-domain mapping single-sourced.)

- [ ] **Step 4: Run the suite and confirm it passes**

Run: `npm run test:unit`
Expected: PASS — all `records.test.js` tests green.

- [ ] **Step 5: Commit**

```bash
git add js/core/records.js tests/unit/records.test.js
git commit -m "fix: align body-domain canonical paths with the repository allowlist"
```

---

### Task 2: Server-side agent directory and routing

**Files:**
- Create: `netlify/functions/_shared/agent-directory.mjs`
- Test: `tests/unit/agent-directory.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/agent-directory.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { AGENTS, ROUTER_SLUG, findAgent, routeAgent } from '../../netlify/functions/_shared/agent-directory.mjs';

test('agent directory slugs, names, and triggers mirror config/agents.yml exactly', () => {
  const configured = load(readFileSync(new URL('../../config/agents.yml', import.meta.url), 'utf8'));
  assert.deepEqual(
    AGENTS.map(agent => ({ slug: agent.slug, name: agent.name, nameTriggers: agent.nameTriggers })),
    configured.agents.map(agent => ({ slug: agent.slug, name: agent.name, nameTriggers: agent.name_triggers }))
  );
});

test('routes to the agent whose trigger appears in the message', () => {
  assert.equal(routeAgent('Log a chest and curls session for Chadwick'), 'chadwick');
  assert.equal(routeAgent('what should I eat, brisket?'), 'brisket');
});

test('an earlier-listed agent wins when two triggers both appear', () => {
  assert.equal(routeAgent('brisket and sara should both weigh in'), 'brisket');
});

test('falls back to the router when no agent is named', () => {
  assert.equal(routeAgent('log today'), ROUTER_SLUG);
});

test('routeAgent requires a string message', () => {
  assert.throws(() => routeAgent(null), TypeError);
});

test('findAgent returns the matching agent or null', () => {
  assert.equal(findAgent('nope'), null);
  assert.deepEqual(findAgent('sara')?.recordTypes, ['weight', 'composition', 'measurements']);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/agent-directory.test.js`
Expected: FAIL with a module-not-found error for `agent-directory.mjs`.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/agent-directory.mjs`:
```js
export const AGENTS = [
  { slug: 'brisket', name: 'Brisket Lasso', domain: 'nutrition', recordTypes: ['meal'], nameTriggers: ['brisket lasso', 'brisket'] },
  { slug: 'chadwick', name: 'Chadwick Flexington', domain: 'fitness', recordTypes: ['workout'], nameTriggers: ['chadwick flexington', 'chadwick', 'chad'] },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', domain: 'skincare', recordTypes: ['skincare'], nameTriggers: ['hyaluronica st. claire', 'hyaluronica'] },
  { slug: 'penelope', name: 'Penelope Rose Quillian', domain: 'mind', recordTypes: ['diary'], nameTriggers: ['penelope rose quillian', 'penelope'] },
  { slug: 'sara', name: 'Dr Sara Tonin', domain: 'body', recordTypes: ['weight', 'composition', 'measurements'], nameTriggers: ['dr sara tonin', 'sara tonin', 'sara'] },
  { slug: 'vera', name: 'Dr Vera Lenz', domain: null, recordTypes: [], nameTriggers: ['dr vera lenz', 'vera lenz', 'vera'] },
  { slug: 'hammond', name: 'General Hammond', domain: null, recordTypes: [], nameTriggers: ['general hammond', 'hammond'] }
];

export const ROUTER_SLUG = 'router';

export function routeAgent(message) {
  if (typeof message !== 'string') throw new TypeError('message must be a string');
  const normalized = message.toLowerCase();
  for (const agent of AGENTS) {
    if (agent.nameTriggers.some(trigger => normalized.includes(trigger))) return agent.slug;
  }
  return ROUTER_SLUG;
}

export function findAgent(slug) {
  return AGENTS.find(agent => agent.slug === slug) ?? null;
}
```

Note: `AGENTS` intentionally maps each agent's `domain` to the writable-record-type vocabulary used by `js/core/validate.js` (`meal`, `workout`, `diary`, `weight`/`composition`/`measurements`, `skincare`), not the free-text `domain`/`tab` strings in `config/agents.yml`. Vera (psychology) and Hammond (life_coaching) have no corresponding record type today, so their `recordTypes` is empty — they are conversational-only agents in this phase.

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/agent-directory.test.js`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/agent-directory.mjs tests/unit/agent-directory.test.js
git commit -m "feat: add server-side agent directory and deterministic routing"
```

---

### Task 3: Server-side target-set mirror

**Files:**
- Create: `netlify/functions/_shared/targets-config.mjs`
- Test: `tests/unit/targets-config.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/targets-config.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { TARGETS_CONFIG } from '../../netlify/functions/_shared/targets-config.mjs';

test('the server target-set mirror matches config/targets.yml exactly', () => {
  const configured = load(readFileSync(new URL('../../config/targets.yml', import.meta.url), 'utf8'));
  assert.deepEqual(TARGETS_CONFIG, configured);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/targets-config.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/targets-config.mjs`:
```js
export const TARGETS_CONFIG = {
  target_sets: [
    {
      valid_from: '2020-01-01',
      calories: { movement: 1660, workout_30: 1900, workout_45_60: 2200, recovery_bonus: 200 },
      protein: { daily: 120, recovery_daily: 140, breakfast: 30, lunch: 30, dinner: 40, snack: 20, min_per_meal: 25 },
      fat_ceiling_g: 50,
      sodium_ceiling_mg: 2000,
      calcium_target_mg: 1000,
      polyphenol_daily_aim: 10
    }
  ]
};
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/targets-config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/targets-config.mjs tests/unit/targets-config.test.js
git commit -m "feat: add server-side target-set mirror for chat digests"
```

---

### Task 4: Constraints extraction from `central-node.md`

**Files:**
- Create: `netlify/functions/_shared/constraints.mjs`
- Test: `tests/unit/constraints.test.js`

This pulls the "Constraints & Priorities" section out of the live `central-node.md` content fetched at chat time (Task 10) — it never hardcodes Adam's medical data, so it can never go stale relative to the checked-in file.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/constraints.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractConstraints } from '../../netlify/functions/_shared/constraints.mjs';

const sample = `# Purpose
Intro text.
---
## \u{1F534} Current Constraints & Priorities
### Medical Status
- Line one
- Line two
---
## ⚡ Today's Status (Friday 19 June 2026)
Should not appear.
`;

test('extracts only the Constraints & Priorities section', () => {
  const result = extractConstraints(sample);
  assert.match(result, /Medical Status/);
  assert.match(result, /Line two/);
  assert.doesNotMatch(result, /Today's Status/);
});

test('returns an empty string when the heading is missing', () => {
  assert.equal(extractConstraints('# Purpose\nNo constraints here.'), '');
});

test('rejects non-string input', () => {
  assert.throws(() => extractConstraints(null), TypeError);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/constraints.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/constraints.mjs`:
```js
const HEADING = '## \u{1F534} Current Constraints & Priorities';

export function extractConstraints(centralNodeMarkdown) {
  if (typeof centralNodeMarkdown !== 'string') throw new TypeError('centralNodeMarkdown must be a string');
  const start = centralNodeMarkdown.indexOf(HEADING);
  if (start === -1) return '';
  const rest = centralNodeMarkdown.slice(start + HEADING.length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/constraints.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/constraints.mjs tests/unit/constraints.test.js
git commit -m "feat: extract live constraints section from central-node.md"
```

---

### Task 5: The `log_entry` tool schema and canonical-path builder

**Files:**
- Create: `netlify/functions/_shared/chat-schema.mjs`
- Test: `tests/unit/chat-schema.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat-schema.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalPath, logEntryToolSchema, validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';

test('builds the canonical path for each writable record type', () => {
  assert.equal(buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'breakfast' }), 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(buildCanonicalPath({ type: 'weight', date: '2026-08-01', slug: 'weight' }), 'data/body/2026/08/2026-08-01-weight.md');
});

test('rejects an unknown type, invalid date, or invalid slug', () => {
  assert.throws(() => buildCanonicalPath({ type: 'nope', date: '2026-08-01', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-13-40', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'Bad Slug' }), TypeError);
});

test('the tool schema restricts type to the allowed list when supplied', () => {
  const schema = logEntryToolSchema(['meal']);
  assert.equal(schema.name, 'log_entry');
  assert.deepEqual(schema.input_schema.properties.type.enum, ['meal']);
});

test('validates a well-formed meal log entry into a canonical record', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true);
  assert.equal(result.record.calories, 520);
  assert.equal(result.record.source, 'chat');
});

test('rejects a log entry with semantically invalid fields', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { meal: 'brunch', calories: 520, protein_g: 38, fat_g: 12 }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('meal')));
});

test('rejects an unknown record type before touching field validation', () => {
  assert.deepEqual(
    validateLogEntry({ type: 'sleep', date: '2026-08-01', fields: {} }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }),
    { valid: false, errors: ['Unknown record type: sleep'] }
  );
});

test('rejects a payload whose fields is missing or not an object', () => {
  assert.equal(
    validateLogEntry({ type: 'meal', date: '2026-08-01' }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }).valid,
    false
  );
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/chat-schema.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/chat-schema.mjs`:
```js
import { TYPE_DOMAINS } from '../../../js/core/records.js';
import { validateRecord } from '../../../js/core/validate.js';

const RECORD_TYPES = ['meal', 'workout', 'diary', 'weight', 'composition', 'measurements', 'skincare'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const DOMAIN_PROPERTIES = {
  meal: {
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
    calories: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    sodium_mg: { type: 'number' },
    calcium_mg: { type: 'number' },
    polyphenol_score: { type: 'number' }
  },
  workout: {
    title: { type: 'string' },
    day_type: { type: 'string', enum: ['movement', 'workout_30', 'workout_45_60'] },
    status: { type: 'string', enum: ['planned', 'completed', 'skipped'] },
    duration_min: { type: 'number' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: { reps: { type: 'number' }, weight_kg: { type: 'number' } },
              required: ['reps', 'weight_kg']
            }
          }
        },
        required: ['name', 'sets']
      }
    }
  },
  diary: {
    mood_score: { type: 'number' },
    mood: { type: 'string', enum: ['great', 'good', 'neutral', 'low', 'bad'] },
    energy: { type: 'string', enum: ['high', 'medium', 'low'] },
    highlights: { type: 'string' },
    challenges: { type: 'string' }
  },
  weight: { weight_kg: { type: 'number' } },
  composition: {
    weight_kg: { type: 'number' },
    body_fat_pct: { type: 'number' },
    skeletal_muscle_kg: { type: 'number' },
    visceral_fat_level: { type: 'number' },
    body_age: { type: 'number' }
  },
  measurements: {
    chest: { type: 'number' }, waist: { type: 'number' }, hips: { type: 'number' },
    right_arm: { type: 'number' }, left_arm: { type: 'number' },
    right_thigh: { type: 'number' }, left_thigh: { type: 'number' },
    calves: { type: 'number' }, neck: { type: 'number' }, shoulders: { type: 'number' }
  },
  skincare: {
    routine: { type: 'string', enum: ['am', 'pm'] },
    completed: { type: 'boolean' },
    products: { type: 'array', items: { type: 'string' } },
    skin_note: { type: 'string' }
  }
};

export function logEntryToolSchema(allowedTypes = RECORD_TYPES) {
  return {
    name: 'log_entry',
    description: 'Propose one Life Hub record for Adam to review and confirm before it is saved. Never call this unless Adam has clearly described a specific record.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: allowedTypes },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, optional' },
        fields: { type: 'object', description: 'Domain-specific fields for the chosen type.' }
      },
      required: ['type', 'date', 'fields']
    }
  };
}

export function buildCanonicalPath({ type, date, slug }) {
  const domain = TYPE_DOMAINS[type];
  if (!domain) throw new TypeError(`Unknown record type: ${type}`);
  if (!DATE.test(date)) throw new TypeError(`Invalid date: ${date}`);
  if (!SLUG.test(slug)) throw new TypeError(`Invalid slug: ${slug}`);
  const [year, month] = date.split('-');
  return `data/${domain}/${year}/${month}/${date}-${slug}.md`;
}

export function validateLogEntry(candidate, { id, now, source = 'chat' } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['log_entry payload must be an object'] };
  }
  const { type, date, time, fields } = candidate;
  if (!RECORD_TYPES.includes(type)) return { valid: false, errors: [`Unknown record type: ${type}`] };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { valid: false, errors: ['fields must be an object'] };
  }

  const record = {
    schema_version: 1,
    id,
    type,
    date,
    ...(time ? { time } : {}),
    created_at: now,
    updated_at: now,
    source,
    ...fields
  };
  const errors = validateRecord(record);
  return errors.length ? { valid: false, errors } : { valid: true, record };
}

export { DOMAIN_PROPERTIES };
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/chat-schema.test.js`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/chat-schema.mjs tests/unit/chat-schema.test.js
git commit -m "feat: add the log_entry tool schema and canonical-path builder"
```

---

### Task 6: Recent-history digest

**Files:**
- Create: `netlify/functions/_shared/digest.mjs`
- Test: `tests/unit/digest.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/digest.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecentHistory } from '../../netlify/functions/_shared/digest.mjs';

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

const meal = `---
schema_version: 1
id: meal-1
type: meal
date: 2026-08-01
time: "07:45"
created_at: 2026-08-01T07:45:00+10:00
updated_at: 2026-08-01T07:45:00+10:00
source: test
meal: breakfast
calories: 520
protein_g: 38
fat_g: 12
---
`;

test("summarizes today's totals, streak, and logging coverage", () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', content: meal }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /520 of 1660 kcal/);
  assert.match(summary, /Logged today: nutrition/);
  assert.match(summary, /Nothing was logged yesterday/);
});

test('skips a file that fails validation instead of throwing', () => {
  const summary = summarizeRecentHistory(
    [{ path: 'data/nutrition/2026/08/2026-08-01-broken.md', content: '---\ntype: meal\n---' }],
    targetsConfig,
    '2026-08-01'
  );
  assert.match(summary, /0 of 1660 kcal/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/digest.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/digest.mjs`:
```js
import { load } from 'js-yaml';
import { parseEventDocument } from '../../../js/core/records.js';
import {
  aggregateNutrition,
  calculateWorkoutStreak,
  getLoggingCompleteness,
  hasRecoveryBonus,
  resolveDayType
} from '../../../js/core/aggregate.js';
import { getDayTargets } from '../../../js/core/targets.js';
import { addCalendarDays } from '../../../js/core/time.js';

export function summarizeRecentHistory(files, targetsConfig, today) {
  const events = [];
  for (const file of files) {
    try {
      events.push(parseEventDocument(file.content, file.path, load));
    } catch {
      // A file that fails validation is skipped: the digest is best-effort chat context, not the record of truth.
    }
  }

  const nutrition = aggregateNutrition(events, today);
  const dayType = resolveDayType(events, today);
  const recovery = hasRecoveryBonus(events, today);
  const targets = getDayTargets(targetsConfig, today, dayType, recovery);
  const completeness = getLoggingCompleteness(events, today);
  const streak = calculateWorkoutStreak(events, today);
  const yesterday = addCalendarDays(today, -1);
  const loggedYesterday = events.some(event => event.record.date === yesterday);
  const loggedToday = ['nutrition', 'fitness', 'diary', 'body', 'skincare'].filter(key => completeness[key]);

  return [
    `Today (${today}) so far: ${nutrition.calories} of ${targets.calories} kcal, ${nutrition.protein_g} of ${targets.protein_g} g protein, ${nutrition.fat_g} of ${targets.fat_ceiling_g} g fat ceiling.`,
    `Day type: ${dayType}. Workout streak: ${streak} day(s).`,
    `Logged today: ${loggedToday.length ? loggedToday.join(', ') : 'nothing yet'}.`,
    loggedYesterday ? 'Yesterday has at least one logged record.' : 'Nothing was logged yesterday.'
  ].join('\n');
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/digest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/digest.mjs tests/unit/digest.test.js
git commit -m "feat: add recent-history digest for chat system context"
```

---

### Task 7: Persona system-prompt assembly

**Files:**
- Create: `netlify/functions/_shared/persona.mjs`
- Test: `tests/unit/persona.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/persona.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

test('builds a named agent prompt naming its writable record types', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', digest: 'Streak: 2', constraints: 'Fat < 50g' });
  assert.match(prompt, /You are Chadwick Flexington/);
  assert.match(prompt, /workout/);
  assert.match(prompt, /Streak: 2/);
  assert.match(prompt, /Fat < 50g/);
});

test('a conversational-only agent is told it cannot log records', () => {
  const prompt = buildSystemPrompt({ slug: 'vera', digest: '', constraints: '' });
  assert.match(prompt, /do not log structured records/);
});

test('the router lists every agent and is told to infer rather than guess silently', () => {
  const prompt = buildSystemPrompt({ slug: 'router', digest: '', constraints: '' });
  assert.match(prompt, /Life Hub router/);
  assert.match(prompt, /Brisket Lasso/);
  assert.match(prompt, /infer/i);
});

test('rejects an unknown slug', () => {
  assert.throws(() => buildSystemPrompt({ slug: 'nope' }), TypeError);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/persona.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/persona.mjs`:
```js
import { AGENTS, ROUTER_SLUG, findAgent } from './agent-directory.mjs';

export function buildSystemPrompt({ slug, digest = '', constraints = '' }) {
  const agent = findAgent(slug);
  if (!agent && slug !== ROUTER_SLUG) throw new TypeError(`Unknown agent slug: ${slug}`);

  const shared = [
    "You are part of Life Hub, Adam's private personal dashboard.",
    'Only propose a log_entry tool call for a record Adam has clearly described. Never invent values.',
    'Every proposed record is shown to Adam for confirmation before anything is saved — nothing is written automatically.',
    digest ? `Recent context:\n${digest}` : '',
    constraints ? `Standing medical and dietary constraints:\n${constraints}` : ''
  ].filter(Boolean).join('\n\n');

  if (slug === ROUTER_SLUG) {
    const roster = AGENTS.map(candidate => `- ${candidate.name} (${candidate.domain ?? 'general'})`).join('\n');
    return [
      shared,
      'You are the Life Hub router. No specific agent was named in this message.',
      `Available agents:\n${roster}`,
      'Infer the right domain from what Adam describes (for example a workout implies Chadwick) rather than guessing silently, or ask one brief clarifying question.'
    ].join('\n\n');
  }

  const capability = agent.recordTypes.length
    ? `You may propose a log_entry tool call for these record types: ${agent.recordTypes.join(', ')}.`
    : 'You do not log structured records. Respond conversationally only.';

  return [shared, `You are ${agent.name}, Adam's ${agent.domain ?? 'general'} agent.`, capability].join('\n\n');
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/persona.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/persona.mjs tests/unit/persona.test.js
git commit -m "feat: assemble per-agent chat system prompts"
```

---

### Task 8: GitHub client `writeFile`

**Files:**
- Modify: `netlify/functions/_shared/github-client.mjs`
- Test: `tests/unit/github-client.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/github-client.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';

const env = {
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const CONTENT_SHA = 'a'.repeat(40);
const COMMIT_SHA = 'b'.repeat(40);

function fetchStub({ status = 200, body = { content: { sha: CONTENT_SHA }, commit: { sha: COMMIT_SHA } } } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json(body, { status });
  };
  return { calls, fetchImpl };
}

test('writeFile PUTs base64 content without a sha when creating', async () => {
  const { calls, fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });

  const result = await client.writeFile({
    path: 'data/nutrition/2026/08/2026-08-01-breakfast.md',
    content: '---\ntype: meal\n---\n',
    message: 'feat: log breakfast'
  });

  assert.equal(result.sha, CONTENT_SHA);
  assert.equal(result.commitSha, COMMIT_SHA);
  assert.equal(calls[0].options.method, 'PUT');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.sha, undefined);
  assert.equal(Buffer.from(sentBody.content, 'base64').toString('utf8'), '---\ntype: meal\n---\n');
  assert.equal(sentBody.branch, 'main');
});

test('writeFile includes sha as an update precondition when overwriting', async () => {
  const { calls, fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });
  await client.writeFile({ path: 'x.md', content: 'y', sha: 'c'.repeat(40), message: 'fix: update' });
  assert.equal(JSON.parse(calls[0].options.body).sha, 'c'.repeat(40));
});

for (const status of [409, 422]) {
  test(`writeFile maps a ${status} response to a retryable write_conflict error`, async () => {
    const { fetchImpl } = fetchStub({ status, body: { message: 'sha mismatch' } });
    const client = createGitHubClient({ env, fetchImpl });
    await assert.rejects(
      client.writeFile({ path: 'x.md', content: 'y', message: 'fix: update' }),
      error => error instanceof GitHubClientError && error.code === 'write_conflict' && error.retryable === true
    );
  });
}

test('writeFile rejects an invalid path, content, sha, or missing message', async () => {
  const { fetchImpl } = fetchStub();
  const client = createGitHubClient({ env, fetchImpl });
  await assert.rejects(client.writeFile({ path: '', content: 'y', message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 1, message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 'y', sha: 'bad', message: 'm' }), TypeError);
  await assert.rejects(client.writeFile({ path: 'x.md', content: 'y' }), TypeError);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/github-client.test.js`
Expected: FAIL — `client.writeFile is not a function`.

- [ ] **Step 3: Add `writeFile` to the client**

In `netlify/functions/_shared/github-client.mjs`, add `writeFile` inside the object returned from `createGitHubClient` (alongside `resolveTree` and `readBlob`):
```js
    async writeFile({ path, content, sha, message }) {
      if (typeof path !== 'string' || path.length === 0) throw new TypeError('A file path is required.');
      if (typeof content !== 'string') throw new TypeError('File content must be a string.');
      if (sha != null && !SHA.test(sha)) throw new TypeError('Invalid blob SHA.');
      if (typeof message !== 'string' || message.length === 0) throw new TypeError('A commit message is required.');

      const body = {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: config.branch,
        ...(sha ? { sha } : {})
      };

      let response;
      try {
        response = await fetchImpl(`${GITHUB_ORIGIN}${repositoryPath}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'PUT',
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
            'user-agent': 'life-hub',
            'x-github-api-version': API_VERSION
          },
          body: JSON.stringify(body)
        });
      } catch {
        throw new GitHubClientError('github_unavailable', true);
      }
      if (response.status === 409 || response.status === 422) throw new GitHubClientError('write_conflict', true);
      if (!response.ok) throw mapGitHubFailure(response);

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new GitHubClientError('github_invalid_response', true);
      }
      if (!SHA.test(payload?.content?.sha) || !SHA.test(payload?.commit?.sha)) {
        throw new GitHubClientError('github_invalid_response', true);
      }
      return { sha: payload.content.sha, commitSha: payload.commit.sha };
    }
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/github-client.test.js`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Run the full unit suite to confirm nothing else broke**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/github-client.mjs tests/unit/github-client.test.js
git commit -m "feat: add idempotent GitHub content writes to the shared client"
```

---

### Task 9: Anthropic streaming client

**Files:**
- Create: `netlify/functions/_shared/anthropic-client.mjs`
- Test: `tests/unit/anthropic-client.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/anthropic-client.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicClient, AnthropicClientError } from '../../netlify/functions/_shared/anthropic-client.mjs';

function frame(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sseResponse(frames, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of frames) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status });
}

test('streams text deltas and a completed tool call from a mocked response', async () => {
  const frames = [
    frame('content_block_start', { index: 0, content_block: { type: 'text' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Logging that ' } }),
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'now.' } }),
    frame('content_block_stop', { index: 0 }),
    frame('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'log_entry' } }),
    frame('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"type":"meal",' } }),
    frame('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '"date":"2026-08-01","fields":{}}' } }),
    frame('content_block_stop', { index: 1 }),
    frame('message_stop', {})
  ];
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => sseResponse(frames) });

  const events = [];
  for await (const event of client.streamMessage({ system: 's', messages: [], tools: [] })) events.push(event);

  assert.deepEqual(events, [
    { type: 'text', delta: 'Logging that ' },
    { type: 'text', delta: 'now.' },
    { type: 'tool_call', id: 'call_1', name: 'log_entry', input: { type: 'meal', date: '2026-08-01', fields: {} } },
    { type: 'done' }
  ]);
});

test('maps a 429 response to a retryable error before reading a body', async () => {
  const client = createAnthropicClient({ apiKey: 'k', fetchImpl: async () => new Response(null, { status: 429 }) });
  await assert.rejects(
    (async () => {
      for await (const event of client.streamMessage({ system: '', messages: [], tools: [] })) void event;
    })(),
    error => error instanceof AnthropicClientError && error.code === 'anthropic_unavailable' && error.retryable === true
  );
});

test('requires a non-empty API key', () => {
  assert.throws(() => createAnthropicClient({ apiKey: '' }), TypeError);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/anthropic-client.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `netlify/functions/_shared/anthropic-client.mjs`:
```js
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';

export class AnthropicClientError extends Error {
  constructor(code, retryable) {
    super('Anthropic request failed.');
    this.name = 'AnthropicClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function createAnthropicClient({ apiKey, fetchImpl = fetch } = {}) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new TypeError('An Anthropic API key is required.');
  }

  return {
    async *streamMessage({ system, messages, tools, signal }) {
      let response;
      try {
        response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': API_VERSION
          },
          body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages, tools, stream: true }),
          signal
        });
      } catch {
        throw new AnthropicClientError('anthropic_unavailable', true);
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new AnthropicClientError(retryable ? 'anthropic_unavailable' : 'anthropic_request_failed', retryable);
      }
      if (!response.body) throw new AnthropicClientError('anthropic_invalid_response', true);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const toolBuffers = new Map();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = parseFrame(frame);
            if (event) yield* interpretEvent(event, toolBuffers);
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AnthropicClientError('anthropic_unavailable', true);
      }
    }
  };
}

function parseFrame(frame) {
  let eventName = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { name: eventName, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

function* interpretEvent(event, toolBuffers) {
  if (event.name === 'content_block_start' && event.payload.content_block?.type === 'tool_use') {
    toolBuffers.set(event.payload.index, {
      name: event.payload.content_block.name,
      id: event.payload.content_block.id,
      json: ''
    });
    return;
  }
  if (event.name === 'content_block_delta') {
    const delta = event.payload.delta;
    if (delta?.type === 'text_delta') {
      yield { type: 'text', delta: delta.text };
    } else if (delta?.type === 'input_json_delta') {
      const buffered = toolBuffers.get(event.payload.index);
      if (buffered) buffered.json += delta.partial_json;
    }
    return;
  }
  if (event.name === 'content_block_stop') {
    const buffered = toolBuffers.get(event.payload.index);
    if (buffered) {
      toolBuffers.delete(event.payload.index);
      let input;
      try {
        input = JSON.parse(buffered.json || '{}');
      } catch {
        input = null;
      }
      yield { type: 'tool_call', id: buffered.id, name: buffered.name, input };
    }
    return;
  }
  if (event.name === 'message_stop') yield { type: 'done' };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/anthropic-client.test.js`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/anthropic-client.mjs tests/unit/anthropic-client.test.js
git commit -m "feat: add a streaming Anthropic Messages API client"
```

---

### Task 10: `POST /api/chat` function

**Files:**
- Create: `netlify/functions/chat.mjs`
- Test: `tests/integration/chat-function.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/chat-function.test.js`:
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub() {
  return async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) return Response.json({ tree: [] });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

async function* mockedStream(events) {
  for (const event of events) yield event;
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

test('streams an agent event, text, and a validated record proposal for a routed message', async () => {
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-01T20:00:00+10:00'),
    fetchImpl: githubFetchStub(),
    createAnthropicClient: () => ({
      streamMessage: () => mockedStream([
        { type: 'text', delta: 'Logging it now.' },
        { type: 'tool_call', id: 'call_1', name: 'log_entry', input: {
          type: 'workout', date: '2026-08-01', fields: { day_type: 'workout_30', status: 'completed', duration_min: 30, exercises: [] }
        } },
        { type: 'done' }
      ])
    })
  });

  const response = await handler(request({ message: 'Chadwick, log a 30 minute workout' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');

  const events = await readSse(response);
  assert.deepEqual(events[0], { type: 'agent', slug: 'chadwick' });
  assert.deepEqual(events[1], { type: 'text', delta: 'Logging it now.' });
  assert.equal(events[2].type, 'record_proposal');
  assert.equal(events[2].record.type, 'workout');
  assert.equal(events[2].path, 'data/fitness/2026/08/2026-08-01-workout.md');
  assert.deepEqual(events[3], { type: 'done' });
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hi' })
  }));
  assert.equal(response.status, 401);
});

test('rejects an empty or oversized message', async () => {
  const handler = createChatHandler({ env: validEnv, fetchImpl: githubFetchStub() });
  assert.equal((await handler(request({ message: '' }))).status, 400);
  assert.equal((await handler(request({ message: 'x'.repeat(5000) }))).status, 400);
});

test('reports misconfiguration when ANTHROPIC_API_KEY is absent', async () => {
  const { ANTHROPIC_API_KEY, ...withoutKey } = validEnv;
  const handler = createChatHandler({ env: withoutKey });
  const response = await handler(request({ message: 'hi' }));
  assert.equal(response.status, 503);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/integration/chat-function.test.js`
Expected: FAIL with a module-not-found error for `chat.mjs`.

- [ ] **Step 3: Create the function**

Create `netlify/functions/chat.mjs`:
```js
import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';
import { createGitHubClient, GitHubConfigurationError } from './_shared/github-client.mjs';
import { selectManifestEntries } from './_shared/repo-policy.mjs';
import { routeAgent, findAgent, ROUTER_SLUG } from './_shared/agent-directory.mjs';
import { buildSystemPrompt } from './_shared/persona.mjs';
import { extractConstraints } from './_shared/constraints.mjs';
import { summarizeRecentHistory } from './_shared/digest.mjs';
import { TARGETS_CONFIG } from './_shared/targets-config.mjs';
import { logEntryToolSchema, validateLogEntry, buildCanonicalPath } from './_shared/chat-schema.mjs';
import { createAnthropicClient, AnthropicClientError } from './_shared/anthropic-client.mjs';
import { getSydneyDateKey, getSydneyTimestamp, addCalendarDays } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 8 * 1024;
const MAX_MESSAGE_LENGTH = 4000;

export const config = { path: '/api/chat' };

export function createChatHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  createAnthropicClient: createAnthropic = createAnthropicClient,
  now = Date.now
} = {}) {
  return async function chatHandler(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env) || typeof env.ANTHROPIC_API_KEY !== 'string' || env.ANTHROPIC_API_KEY.length === 0) {
      return withPrivateCache(misconfiguredResponse());
    }

    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    const parsed = await parseRequest(request);
    if (parsed.error) return parsed.error;

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError();
    }

    const slug = routeAgent(parsed.message);
    const agent = slug === ROUTER_SLUG ? null : findAgent(slug);
    const today = getSydneyDateKey(new Date(now()));
    const from = addCalendarDays(today, -6);

    let digest = '';
    let constraints = '';
    try {
      const current = await client.resolveTree();
      const manifest = selectManifestEntries(current.tree, { from, to: today });
      const files = [];
      for (const entry of manifest) {
        if (!entry.path.startsWith('data/')) continue;
        const decoded = decodeBlob(await client.readBlob(entry.sha));
        if (decoded !== null) files.push({ path: entry.path, content: decoded });
      }
      digest = summarizeRecentHistory(files, TARGETS_CONFIG, today);

      const centralNodeEntry = current.tree.find(entry => entry.path === 'central-node.md' && entry.type === 'blob');
      if (centralNodeEntry) {
        const decoded = decodeBlob(await client.readBlob(centralNodeEntry.sha));
        if (decoded !== null) constraints = extractConstraints(decoded);
      }
    } catch {
      digest = '';
      constraints = '';
    }

    const system = buildSystemPrompt({ slug, digest, constraints });
    const allowedTypes = agent?.recordTypes.length ? agent.recordTypes : undefined;
    const tools = allowedTypes ? [logEntryToolSchema(allowedTypes)] : [];

    let anthropic;
    try {
      anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, fetchImpl });
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }

    const nowInstant = new Date(now());
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = event => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        send({ type: 'agent', slug });
        try {
          for await (const event of anthropic.streamMessage({
            system,
            messages: [{ role: 'user', content: parsed.message }],
            tools,
            signal: request.signal
          })) {
            if (event.type === 'tool_call' && event.name === 'log_entry') {
              const validation = validateLogEntry(event.input, {
                id: `${event.input?.type ?? 'entry'}-${today}-${randomBytes(3).toString('hex')}`,
                now: getSydneyTimestamp(nowInstant)
              });
              if (validation.valid) {
                send({
                  type: 'record_proposal',
                  record: validation.record,
                  path: buildCanonicalPath({
                    type: validation.record.type,
                    date: validation.record.date,
                    slug: slugFor(validation.record)
                  })
                });
              } else {
                send({ type: 'record_rejected', errors: validation.errors });
              }
            } else {
              send(event);
            }
          }
        } catch (error) {
          send({ type: 'error', code: error instanceof AnthropicClientError ? error.code : 'anthropic_unavailable' });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', ...PRIVATE_CACHE, connection: 'keep-alive' }
    });
  };
}

function slugFor(record) {
  if (record.type === 'meal') return record.meal;
  if (record.type === 'skincare') return record.routine;
  return record.type;
}

function decodeBlob(blob) {
  if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string') return null;
  const content = blob.content.replace(/\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(content, 'base64'));
  } catch {
    return null;
  }
}

async function parseRequest(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { error: errorResponse(415, 'unsupported_media_type', 'This endpoint accepts JSON requests only.', false, PRIVATE_CACHE) };
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body.message !== 'string' || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH) {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid chat message.', false, PRIVATE_CACHE) };
  }
  return { message: body.message };
}

function repositoryError() {
  return errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatHandler();
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/integration/chat-function.test.js`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/chat.mjs tests/integration/chat-function.test.js
git commit -m "feat: add the streaming /api/chat function"
```

---

### Task 11: `POST /api/chat/confirm` function

**Files:**
- Create: `netlify/functions/chat-confirm.mjs`
- Test: `tests/integration/chat-confirm-function.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/chat-confirm-function.test.js`:
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const candidate = { type: 'meal', date: '2026-08-01', fields: { meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 } };

function request(body, headers = {}) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function githubFetchStub({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options?.method === 'PUT') {
      return status === 200
        ? Response.json({ content: { sha: 'a'.repeat(40) }, commit: { sha: 'b'.repeat(40) } })
        : Response.json({ message: 'conflict' }, { status });
    }
    return Response.json({ message: 'not used' }, { status: 404 });
  };
  return { calls, fetchImpl };
}

test('validates, writes, and returns the canonical path for a new record', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl, now: () => Date.parse('2026-08-01T20:00:00+10:00') });

  const response = await handler(request({ candidate, slug: 'breakfast' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.path, 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).sha, undefined);
});

test('reports a validation failure without contacting GitHub', async () => {
  const { calls, fetchImpl } = githubFetchStub();
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl });
  const invalid = { type: 'meal', date: '2026-08-01', fields: { meal: 'brunch', calories: 1, protein_g: 1, fat_g: 1 } };

  const response = await handler(request({ candidate: invalid, slug: 'breakfast' }));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('maps a write conflict to 409 for the client to prompt an overwrite', async () => {
  const { fetchImpl } = githubFetchStub({ status: 422 });
  const handler = createChatConfirmHandler({ env: validEnv, fetchImpl });
  const response = await handler(request({ candidate, slug: 'breakfast' }));
  assert.equal(response.status, 409);
});

test('rejects an unauthenticated request', async () => {
  const handler = createChatConfirmHandler({ env: validEnv });
  const response = await handler(new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidate, slug: 'breakfast' })
  }));
  assert.equal(response.status, 401);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/integration/chat-confirm-function.test.js`
Expected: FAIL with a module-not-found error for `chat-confirm.mjs`.

- [ ] **Step 3: Create the function**

Create `netlify/functions/chat-confirm.mjs`:
```js
import { randomBytes } from 'node:crypto';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  readCookie
} from './_shared/http.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { buildCanonicalPath, validateLogEntry } from './_shared/chat-schema.mjs';
import { getSydneyTimestamp } from '../../js/core/time.js';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const config = { path: '/api/chat/confirm' };

export function createChatConfirmHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now
} = {}) {
  return async function chatConfirmHandler(request) {
    if (request.method !== 'POST') return withPrivateCache(methodNotAllowed('POST'));
    const originError = guardRequestOrigin(request);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env)) return withPrivateCache(misconfiguredResponse());

    let session;
    try {
      session = verify(readCookie(request, 'life_hub_session'), env.SESSION_SECRET, now());
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    const parsed = await parseRequest(request);
    if (parsed.error) return parsed.error;

    const validation = validateLogEntry(parsed.candidate, {
      id: `${parsed.candidate.type}-${parsed.candidate.date}-${randomBytes(3).toString('hex')}`,
      now: getSydneyTimestamp(new Date(now()))
    });
    if (!validation.valid) {
      return errorResponse(400, 'invalid_record', 'This record could not be validated.', false, PRIVATE_CACHE);
    }

    let path;
    try {
      path = buildCanonicalPath({ type: validation.record.type, date: validation.record.date, slug: parsed.slug });
    } catch {
      return errorResponse(400, 'invalid_record', 'This record could not be validated.', false, PRIVATE_CACHE);
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return repositoryError('github_unavailable', true);
    }

    let existingSha;
    if (parsed.overwrite) {
      try {
        const current = await client.resolveTree();
        existingSha = current.tree.find(entry => entry.path === path && entry.type === 'blob')?.sha;
      } catch (error) {
        return mapRepositoryError(error);
      }
    }

    try {
      const result = await client.writeFile({
        path,
        content: renderMarkdown(validation.record),
        ...(existingSha ? { sha: existingSha } : {}),
        message: `feat(chat): log ${validation.record.type} for ${validation.record.date}`
      });
      return jsonResponse(200, { ok: true, data: { path, sha: result.sha, commitSha: result.commitSha } }, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict') {
        return errorResponse(409, 'write_conflict', 'A record already exists at this path.', true, PRIVATE_CACHE);
      }
      return mapRepositoryError(error);
    }
  };
}

function renderMarkdown(record) {
  const frontmatter = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n`;
}

async function parseRequest(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: errorResponse(413, 'request_too_large', 'The request body is too large.', false, PRIVATE_CACHE) };
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.slug !== 'string' ||
      !SLUG.test(body.slug) || !body.candidate || typeof body.candidate !== 'object') {
    return { error: errorResponse(400, 'invalid_request', 'Provide a valid confirmation request.', false, PRIVATE_CACHE) };
  }
  return { candidate: body.candidate, slug: body.slug, overwrite: body.overwrite === true };
}

function mapRepositoryError(error) {
  if (error instanceof GitHubClientError) return repositoryError(error.code, error.retryable);
  return repositoryError('github_unavailable', true);
}

function repositoryError(code, retryable) {
  return errorResponse(503, code, 'The repository is temporarily unavailable.', retryable, PRIVATE_CACHE);
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export default createChatConfirmHandler();
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/integration/chat-confirm-function.test.js`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every unit and integration test green.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/chat-confirm.mjs tests/integration/chat-confirm-function.test.js
git commit -m "feat: add the /api/chat/confirm write function"
```

---

### Task 12: Local mock chat adapter

**Files:**
- Modify: `scripts/mock-api.mjs`

This lets `npm run dev` and the browser acceptance tests (Task 16) exercise the full chat and confirm round trip without a live Anthropic key or a real GitHub write, matching how `/api/repo/*` is already mocked.

- [ ] **Step 1: Add the two routes**

In `scripts/mock-api.mjs`, inside `handleMockApi`, add before the final `error(response, 404, ...)` fallback (i.e. after the existing `/api/repo/files` block):
```js
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
        error(response, 400, 'invalid_request', 'Provide a valid chat message.', false);
        return true;
      }
      streamMockChat(response, body.message);
      return true;
    }

    if (url.pathname === '/api/chat/confirm') {
      if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
      if (!readSession(request)) return unauthenticated(response);
      const body = await readJson(request);
      if (!body || typeof body.slug !== 'string' || !body.candidate) {
        error(response, 400, 'invalid_request', 'Provide a valid confirmation request.', false);
        return true;
      }
      json(response, 200, {
        ok: true,
        data: {
          path: `data/fitness/mock/${body.slug}.md`,
          sha: hash(body.slug).slice(0, 40),
          commitSha: hash('mock-commit').slice(0, 40)
        }
      });
      return true;
    }
```

- [ ] **Step 2: Add the streaming helper**

Add this function near the bottom of `scripts/mock-api.mjs`, alongside the other helpers:
```js
function streamMockChat(response, message) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    ...PRIVATE_HEADERS,
    Connection: 'keep-alive'
  });
  const isWorkout = /chad|chadwick|workout/i.test(message);
  const send = event => response.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: 'agent', slug: isWorkout ? 'chadwick' : 'router' });
  send({ type: 'text', delta: isWorkout ? 'Logging that session now.' : 'Got it — who should I route this to?' });
  if (isWorkout) {
    send({
      type: 'record_proposal',
      path: 'data/fitness/2026/08/2026-08-01-workout.md',
      record: {
        schema_version: 1, id: 'mock-workout-1', type: 'workout', date: '2026-08-01',
        day_type: 'workout_30', status: 'completed', duration_min: 30, exercises: [],
        created_at: '2026-08-01T18:00:00+10:00', updated_at: '2026-08-01T18:00:00+10:00', source: 'chat'
      }
    });
  }
  send({ type: 'done' });
  response.end();
}
```

- [ ] **Step 3: Manually verify against the dev server**

Run: `npm run dev`
In a second terminal: `curl -s -c /tmp/life-hub-cookies -X POST http://127.0.0.1:4173/api/auth -H 'content-type: application/json' -d '{"passphrase":"life-hub-local"}' >/dev/null && curl -s -b /tmp/life-hub-cookies -X POST http://127.0.0.1:4173/api/chat -H 'content-type: application/json' -d '{"message":"Chadwick, log a session"}'`
Expected: a stream of `data: {...}` frames ending with `data: {"type":"done"}`, including one `record_proposal` frame.

- [ ] **Step 4: Commit**

```bash
git add scripts/mock-api.mjs
git commit -m "feat: add a fixture-backed local mock for chat and confirm"
```

---

### Task 13: Client chat API module

**Files:**
- Create: `js/app/chat-api.js`
- Test: `tests/unit/chat-api.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat-api.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../../js/app/chat-api.js';

function sseResponse(frames) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of frames) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

test('send yields each parsed SSE frame in order', async () => {
  const frames = [
    'data: {"type":"agent","slug":"chadwick"}\n\n',
    'data: {"type":"text","delta":"hi"}\n\n',
    'data: {"type":"done"}\n\n'
  ];
  const chatApi = createChatApi(async () => sseResponse(frames));

  const events = [];
  for await (const event of chatApi.send('hello')) events.push(event);
  assert.deepEqual(events, [
    { type: 'agent', slug: 'chadwick' },
    { type: 'text', delta: 'hi' },
    { type: 'done' }
  ]);
});

test('send throws a structured error for a non-OK response', async () => {
  const chatApi = createChatApi(async () => Response.json({ ok: false, error: { code: 'misconfigured' } }, { status: 503 }));
  await assert.rejects(
    (async () => { for await (const event of chatApi.send('hi')) void event; })(),
    error => error.status === 503 && error.code === 'misconfigured'
  );
});

test('confirm posts the candidate and returns the written path', async () => {
  const chatApi = createChatApi(async (url, init) => {
    assert.equal(url, '/api/chat/confirm');
    assert.equal(JSON.parse(init.body).slug, 'breakfast');
    return Response.json({ ok: true, data: { path: 'data/nutrition/x.md', sha: 'a', commitSha: 'b' } });
  });
  const result = await chatApi.confirm({ candidate: { type: 'meal' }, slug: 'breakfast' });
  assert.equal(result.path, 'data/nutrition/x.md');
});

test('confirm throws a structured error when the write fails', async () => {
  const chatApi = createChatApi(async () => Response.json({ ok: false, error: { code: 'write_conflict' } }, { status: 409 }));
  await assert.rejects(
    chatApi.confirm({ candidate: {}, slug: 'x' }),
    error => error.status === 409 && error.code === 'write_conflict'
  );
});

test('createChatApi requires a fetch implementation', () => {
  assert.throws(() => createChatApi(null), TypeError);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/unit/chat-api.test.js`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Create the module**

Create `js/app/chat-api.js`:
```js
export function createChatApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  return {
    async *send(message, { signal } = {}) {
      const response = await fetchImpl('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
        signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw Object.assign(new Error('Chat request failed'), {
          status: response.status,
          code: payload?.error?.code ?? 'request_failed'
        });
      }
      if (!response.body) throw new Error('Chat response has no body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = frame.split('\n').find(candidate => candidate.startsWith('data:'));
          if (!line) continue;
          try {
            yield JSON.parse(line.slice(5).trim());
          } catch {
            // A malformed frame is skipped rather than breaking the stream.
          }
        }
      }
    },

    async confirm({ candidate, slug, overwrite = false }) {
      const response = await fetchImpl('/api/chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidate, slug, overwrite })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        throw Object.assign(new Error('Confirm request failed'), {
          status: response.status,
          code: payload?.error?.code ?? 'request_failed'
        });
      }
      return payload.data;
    }
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node --test tests/unit/chat-api.test.js`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add js/app/chat-api.js tests/unit/chat-api.test.js
git commit -m "feat: add the client chat API module"
```

---

### Task 14: Chat rendering and controller

**Files:**
- Create: `js/app/render-chat.js`
- Create: `js/app/chat-controller.js`

The rest of the app's DOM-facing modules (`render-home.js`, `app-controller.js`) are validated through integration/browser tests rather than isolated unit tests, since they need a real DOM — Task 16 covers this pair the same way.

- [ ] **Step 1: Create the rendering module**

Create `js/app/render-chat.js`:
```js
const HIDDEN_FIELDS = new Set(['schema_version', 'id', 'type', 'date', 'created_at', 'updated_at', 'source']);

export function appendMessage(root, { role, agentSlug, text = '' }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const item = root.createElement('li');
  item.className = `chat-message chat-message--${role}`;
  if (agentSlug) item.dataset.agent = agentSlug;
  item.textContent = text;
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

export function appendRecordProposal(root, { path, record }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const card = root.createElement('li');
  card.className = 'record-proposal';
  card.dataset.path = path;

  const summary = root.createElement('p');
  summary.textContent = `Proposed ${record.type} record for ${record.date}`;
  card.append(summary);

  const fields = root.createElement('dl');
  fields.className = 'record-proposal__fields';
  const inputs = {};
  for (const [key, value] of Object.entries(record)) {
    if (HIDDEN_FIELDS.has(key) || (typeof value === 'object' && value !== null)) continue;
    const dt = root.createElement('dt');
    dt.textContent = key;
    const dd = root.createElement('dd');
    const input = root.createElement('input');
    input.value = String(value ?? '');
    input.dataset.field = key;
    dd.append(input);
    fields.append(dt, dd);
    inputs[key] = input;
  }
  card.append(fields);

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'record-proposal__confirm';
  confirm.textContent = 'Confirm';
  card.append(confirm);

  const discard = root.createElement('button');
  discard.type = 'button';
  discard.className = 'record-proposal__discard';
  discard.textContent = 'Discard';
  card.append(discard);

  list.append(card);
  list.scrollTop = list.scrollHeight;
  return { card, confirm, discard, inputs };
}

export function setChatBusy(root, busy) {
  const input = root.querySelector('#chat-input');
  const button = root.querySelector('#chat-send');
  if (input) input.disabled = busy;
  if (button) button.disabled = busy;
}

export function showChatError(root, message) {
  const banner = root.querySelector('#chat-error');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = !message;
}
```

Note: array-valued fields (for example a workout's `exercises`) are shown read-only in this pass — they are excluded from the inline-editable field list, matching the "single-record, forward-only" scope in the design.

- [ ] **Step 2: Create the controller**

Create `js/app/chat-controller.js`:
```js
import { appendMessage, appendRecordProposal, setChatBusy, showChatError } from './render-chat.js';

export function createChatController({ root, chatApi, onRecordWritten }) {
  if (!root || !chatApi) throw new TypeError('Chat controller dependencies are unavailable');

  let sending = false;

  function bindForm() {
    const form = root.querySelector('#chat-form');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const input = root.querySelector('#chat-input');
      const message = input?.value.trim();
      if (!message || sending) return;
      input.value = '';
      void send(message);
    });
  }

  async function send(message) {
    sending = true;
    setChatBusy(root, true);
    showChatError(root, '');
    appendMessage(root, { role: 'user', text: message });
    let assistantBubble = null;

    try {
      for await (const event of chatApi.send(message)) {
        if (event.type === 'agent') {
          assistantBubble = appendMessage(root, { role: 'assistant', agentSlug: event.slug });
        } else if (event.type === 'text' && assistantBubble) {
          assistantBubble.textContent += event.delta;
        } else if (event.type === 'record_proposal') {
          const proposal = appendRecordProposal(root, event);
          bindProposal(proposal, event);
        } else if (event.type === 'record_rejected' || event.type === 'error') {
          showChatError(root, 'Life Hub could not prepare that record. Try rephrasing it.');
        }
      }
    } catch {
      showChatError(root, 'Chat is unavailable right now. Please try again.');
    } finally {
      sending = false;
      setChatBusy(root, false);
    }
  }

  function bindProposal(proposal, event) {
    if (!proposal) return;
    proposal.confirm.addEventListener('click', () => void confirmProposal(proposal, event, false));
    proposal.discard.addEventListener('click', () => proposal.card.remove());
  }

  async function confirmProposal(proposal, event, overwrite) {
    proposal.confirm.disabled = true;
    try {
      const edited = collectEdits(event.record, proposal.inputs);
      const slug = slugFromPath(event.path);
      const result = await chatApi.confirm({ candidate: toCandidate(edited), slug, overwrite });
      proposal.card.replaceChildren(Object.assign(root.createElement('p'), { textContent: 'Saved.' }));
      onRecordWritten?.(result);
    } catch (error) {
      proposal.confirm.disabled = false;
      if (error.code === 'write_conflict' && !overwrite) {
        showChatError(root, 'A record already exists for that day. Confirm again to overwrite it.');
        proposal.confirm.addEventListener('click', () => void confirmProposal(proposal, event, true), { once: true });
      } else {
        showChatError(root, 'Saving that record failed. You can try again.');
      }
    }
  }

  bindForm();
  return { send };
}

function collectEdits(record, inputs) {
  const edited = { ...record };
  for (const [key, input] of Object.entries(inputs ?? {})) {
    const original = record[key];
    edited[key] = typeof original === 'number' ? Number(input.value) : input.value;
  }
  return edited;
}

function toCandidate(record) {
  const { schema_version, id, created_at, updated_at, source, type, date, time, ...fields } = record;
  return { type, date, ...(time ? { time } : {}), fields };
}

function slugFromPath(path) {
  return path.split('/').at(-1).replace(/\.md$/, '').split('-').slice(3).join('-');
}
```

- [ ] **Step 3: Commit**

```bash
git add js/app/render-chat.js js/app/chat-controller.js
git commit -m "feat: add chat rendering and controller with inline-editable proposals"
```

---

### Task 15: Wire the Chat view into the shell

**Files:**
- Modify: `index.html`
- Modify: `js/app/main.js`
- Modify: `js/app/app-controller.js`
- Modify: `css/app.css`

- [ ] **Step 1: Add the Chat view markup**

In `index.html`, add a new `<section>` immediately after the closing `</section>` of `#home-dashboard` (still inside `<main id="main-content">`):
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

- [ ] **Step 2: Special-case the Chat nav button in `app-controller.js`**

Replace the existing loop:
```js
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    if (button.dataset.section === 'home') continue;
    bind(button, 'click', () => setStatus('This section arrives in a later Life Hub phase.'));
  }
```
with:
```js
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    const target = button.dataset.section;
    if (target === 'home' || target === 'chat') continue;
    bind(button, 'click', () => setStatus('This section arrives in a later Life Hub phase.'));
  }
  for (const button of root.querySelectorAll?.('[data-section="chat"]') ?? []) {
    bind(button, 'click', () => showSection('chat'));
  }
  for (const button of root.querySelectorAll?.('[data-section="home"]') ?? []) {
    bind(button, 'click', () => showSection('home'));
  }
```

Add the `showSection` function near `showAuthenticated` in the same file:
```js
  function showSection(name) {
    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    if (home) home.hidden = name !== 'home';
    if (chat) chat.hidden = name !== 'chat';
    for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
      const active = button.dataset.section === name;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }
```

And call it from `showAuthenticated` so returning to a fresh sign-in always resets to Home:
```js
  function showAuthenticated() {
    const signInView = root.querySelector('#sign-in-view');
    const shell = root.querySelector('#app-shell');
    if (signInView) signInView.hidden = true;
    if (shell) shell.hidden = false;
    showSection('home');
  }
```

- [ ] **Step 3: Wire the chat controller into `main.js`**

In `js/app/main.js`, add the imports:
```js
import { createChatApi } from './chat-api.js';
import { createChatController } from './chat-controller.js';
```
and after `controller.start();`, add:
```js
const chatApi = createChatApi(fetchImpl);
createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true })
});
```

- [ ] **Step 4: Add chat styles**

Append to `css/app.css`:
```css
.chat-view { display: flex; flex-direction: column; gap: 1rem; max-width: 42rem; }

.chat-error { color: #B3261E; font-weight: 600; }

.chat-messages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 32rem;
  overflow-y: auto;
}

.chat-message {
  padding: 0.85rem 1.1rem;
  border-radius: var(--radius-md);
  background: var(--glass);
  box-shadow: var(--shadow);
  max-width: 32rem;
}

.chat-message--user { align-self: flex-end; background: var(--marine); color: white; }
.chat-message--assistant[data-agent] { border-left: 0.3rem solid var(--wave); }

.record-proposal {
  padding: 1rem 1.2rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--warm-white);
}

.record-proposal__fields { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; margin: 0.75rem 0; }
.record-proposal__fields dt { color: var(--muted); font-size: 0.85rem; }
.record-proposal__fields input { width: 100%; padding: 0.4rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--line); }

.record-proposal__confirm, .record-proposal__discard {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  border: none;
  font-weight: 600;
}

.record-proposal__confirm { background: var(--high-sea); color: white; margin-right: 0.5rem; }
.record-proposal__discard { background: transparent; color: var(--muted); }

.chat-form { display: flex; gap: 0.5rem; }
#chat-input { flex: 1; min-height: 44px; padding: 0.6rem 0.9rem; border-radius: 0.75rem; border: 1px solid var(--line); }
#chat-send { min-height: 44px; padding: 0 1.25rem; border-radius: 0.75rem; border: none; background: var(--depth); color: white; font-weight: 600; }
```

- [ ] **Step 5: Run the full unit and integration suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html js/app/main.js js/app/app-controller.js css/app.css
git commit -m "feat: wire the Chat view into the app shell"
```

---

### Task 16: Browser acceptance tests for Chat

**Files:**
- Create: `tests/browser/chat.spec.mjs`
- Modify: `tests/browser/home.spec.mjs:181-185`
- Modify: `package.json:14`

- [ ] **Step 1: Update the now-outdated Home browser test**

In `tests/browser/home.spec.mjs`, Chat is no longer a "later phase" stub, so redirect that assertion at an unbuilt section. Replace:
```js
  await page.locator('.mobile-nav [data-section="chat"]').click();
  assert.equal(
    await page.locator('#app-status').textContent(),
    'This section arrives in a later Life Hub phase.'
  );
```
with:
```js
  await page.locator('.mobile-nav [data-section="calendar"]').click();
  assert.equal(
    await page.locator('#app-status').textContent(),
    'This section arrives in a later Life Hub phase.'
  );
```

- [ ] **Step 2: Write the new Chat browser test**

Create `tests/browser/chat.spec.mjs`:
```js
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';
let browser, server, baseUrl;

before(async () => {
  server = createStaticServer({ root: new URL('../../dist/', import.meta.url), apiRoot: new URL('../..', import.meta.url) });
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

test('sending a message routes to the mocked agent and renders a confirmable record', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);

  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#home-dashboard').isHidden(), true);

  await page.locator('#chat-input').fill('Chadwick, log a 30 minute workout');
  await page.locator('#chat-send').click();

  const assistantBubble = page.locator('.chat-message--assistant').first();
  await assistantBubble.waitFor();
  assert.equal(await assistantBubble.getAttribute('data-agent'), 'chadwick');

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  await proposal.locator('.record-proposal__confirm').click();
  await page.locator('.record-proposal >> text=Saved.').waitFor();
  await context.close();
});

test('discarding a proposal removes it without confirming', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-input').fill('Chadwick, log a session');
  await page.locator('#chat-send').click();

  const proposal = page.locator('.record-proposal');
  await proposal.waitFor();
  await proposal.locator('.record-proposal__discard').click();
  await assert.rejects(proposal.waitFor({ timeout: 500 }));
  await context.close();
});

test('navigating back to Home hides the chat view again', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  await page.locator('.desktop-rail [data-section="chat"]').click();
  await page.locator('#chat-view').waitFor({ state: 'visible' });
  await page.locator('.desktop-rail [data-section="home"]').click();
  await page.locator('#chat-view').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#home-dashboard').isVisible(), true);
  await context.close();
});
```

- [ ] **Step 3: Include the new spec in the browser test script**

In `package.json`, change:
```json
    "test:browser": "node --test tests/browser/home.spec.mjs",
```
to:
```json
    "test:browser": "node --test tests/browser/home.spec.mjs tests/browser/chat.spec.mjs",
```

- [ ] **Step 4: Run the browser suite**

Run: `npx playwright install chromium` (only if not already installed), then `npm run test:browser`
Expected: PASS — all Home and Chat browser tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/chat.spec.mjs tests/browser/home.spec.mjs package.json
git commit -m "test: add Chat browser acceptance coverage"
```

---

### Task 17: Environment contract and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Document the new environment variable**

In `.env.example`, add:
```
ANTHROPIC_API_KEY=replace-in-netlify
```

- [ ] **Step 2: Document local chat behavior and live setup in `README.md`**

Add a new section after "## Configure a Netlify preview" and before "## Verify":
```markdown
## Chat

Local development and the browser acceptance suite use a small scripted mock at `/api/chat` and `/api/chat/confirm` (see `scripts/mock-api.mjs`) — no Anthropic key is required to run `npm run dev` or `npm test`.

To manually verify against the real Anthropic API, add `ANTHROPIC_API_KEY=<your key>` to a local `.env.local` (already gitignored, never commit it) and run the dev server with that variable loaded into the environment. Set the same variable in Netlify for a deployed preview or production.

Routing is re-evaluated independently for each message rather than pinned for a whole conversation: name an agent (for example "Chadwick") to route directly to them, or leave a message unaddressed to reach the general router, which infers the right domain or asks a brief clarifying question. Only Brisket (nutrition), Chadwick (fitness), Hyaluronica (skincare), Penelope (diary), and Dr Sara Tonin (body: weight, composition, measurements) can propose a `log_entry`; Dr Vera Lenz and General Hammond are conversational only in this phase. Every proposed record is shown for confirmation, with inline-editable scalar fields, before anything is written — nothing is saved automatically.
```

- [ ] **Step 3: Run the full suite and record real verification numbers**

Run: `npm ci --ignore-scripts && npm test && npm run validate:fixtures && npm audit --audit-level=high && npx playwright install chromium && npm run test:browser`
Record the actual pass counts and audit result from this run — do not reuse the Phase 3 numbers.

- [ ] **Step 4: Append the Phase 4 status entry**

In `docs/IMPLEMENTATION_STATUS.md`, replace the final line (`## Next Phase: Agent chat and write loop`) with:
```markdown
## Phase 4: Agent Chat and Write Loop — Complete

Verified on <today's date>:

- `npm test`: <N> unit and integration tests passed, 0 failed.
- `npm run test:browser`: <N> Chromium acceptance tests passed, 0 failed, covering routed chat replies, record-proposal confirmation and discard, and Chat/Home navigation.
- `npm run validate:fixtures`: 4 valid files, 0 invalid files.
- `npm audit --audit-level=high`: <result>.
- Routing is deterministic per message (not pinned across a whole conversation); Dr Vera Lenz and General Hammond are conversational-only pending a record type for psychology/life-coaching domains.
- Persona system prompts are assembled from `config/agents.yml`, `config/targets.yml`, and the live `central-node.md` Constraints section — not a verbatim migration of Notion-authored agent instructions, which remains a follow-up once Notion access is available.

Production credentials (including `ANTHROPIC_API_KEY`) remain deliberately absent from this repository; local verification against the live Anthropic API uses a gitignored `.env.local`.

## Next Phase: Day One diary delivery
```

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: complete agent chat and write loop phase"
```

---

## Plan self-review notes

- **Spec coverage:** deterministic routing (Task 2), `log_entry` schema + confirm-before-save (Tasks 5, 14), idempotent GitHub writes with collision handling (Tasks 8, 11, 14), recent-history digest (Task 6), persona construction from `agents.yml`/`targets.yml`/live `central-node.md` (Tasks 2, 3, 4, 7), streaming Anthropic client (Task 9), failure recovery for model/validation/write/session errors (Tasks 10, 11, 14), immediate domain refresh (`onRecordWritten` in Tasks 14-15), fixture-backed local dev (Task 12), and environment documentation (Task 17) are each covered.
- **Known, disclosed simplifications** (not silent gaps): routing re-evaluates per message rather than persisting across a whole conversation; inline editing covers scalar fields only (array fields like a workout's exercise list render read-only); Vera and Hammond cannot log structured records yet, matching the absence of a psychology/life-coaching record type in `js/core/validate.js`. All three are called out in the Task 17 documentation step so they're visible, not discovered later.
