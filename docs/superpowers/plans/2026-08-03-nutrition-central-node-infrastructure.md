# Nutrition and Central Node — Shared Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared plumbing both the Nutrition tab and the Central Node tab depend on — central-node.md sync, shared markdown-section extraction, per-agent colour lookup, a default-agent fallback for embedded chat, and a reusable chat-panel reparenting module — so those two tabs (each their own follow-up plan) can be built on top of it without re-deriving any of this.

**Architecture:** Extends the existing read-only sync pipeline (`load-live-events.js` / `repo-policy.mjs`) to also carry `central-node.md` and `config/agents.yml`'s parsed content, exactly the same way `config/targets.yml` already flows through it — no new fetch, no new Netlify function, no Anthropic cost. Relocates the pure markdown-section-extraction logic from a server-only module into `js/core/` so both the Netlify function and the browser share one implementation. Adds a single, framework-agnostic module that moves the existing chat DOM subtree between containers (so the same transcript can appear in multiple tabs), plus a small default-agent fallback in `chat-controller.js`. Every piece here ships fully tested but not yet wired into `main.js`/`index.html` — that wiring is the follow-up Nutrition and Central Node plans, once their markup exists to wire it into.

**Tech Stack:** Vanilla JS (ES modules, no framework, no build step for app code), `node:test` + `node:assert/strict` for unit tests, `js-yaml` for YAML parsing.

**Full context:** See `docs/superpowers/specs/2026-08-03-nutrition-central-node-design.md` for the complete design this plan implements a slice of. Run `npm test` before starting to confirm a clean baseline (287 tests passing per `docs/IMPLEMENTATION_STATUS.md`).

---

## File Structure

| File | Change |
|---|---|
| `js/core/constraints.js` | **Create.** Relocated from `netlify/functions/_shared/constraints.mjs`, plus two new extractors (`extractThisWeek`, `extractThisMonth`). |
| `netlify/functions/_shared/constraints.mjs` | **Delete** once nothing imports it. |
| `netlify/functions/chat.mjs` | **Modify.** Import path only — behaviour unchanged. |
| `netlify/functions/chat-confirm.mjs` | **Modify.** Import path only — behaviour unchanged. |
| `tests/unit/constraints.test.js` | **Modify.** Import path, plus tests for the two new extractors. |
| `netlify/functions/_shared/repo-policy.mjs` | **Modify.** Allowlist `central-node.md`. |
| `tests/unit/repo-policy.test.js` | **Modify.** Move `central-node.md` from the rejected list to the allowed list. |
| `js/app/load-live-events.js` | **Modify.** Parse and expose `agentsConfig` and `centralNodeMarkdown`. |
| `tests/unit/load-live-events.test.js` | **Modify.** Cover the two new fields and their failure paths. |
| `tests/fixtures/valid/central-node.md` | **Create.** Synthetic fixture doc covering every heading the extractors read. |
| `scripts/mock-api.mjs` | **Modify.** Serve the new fixture locally. |
| `js/app/agent-colour.js` | **Create.** Looks up an agent's confirmed colour from parsed `config/agents.yml`, with a safe default. |
| `tests/unit/agent-colour.test.js` | **Create.** |
| `config/agents.yml` | **Modify.** Hammond's colour becomes `#3A3A42`, `colour_source: confirmed` (local fixture only — the production value lives in the private data repo, outside this codebase). |
| `tests/unit/agents-config.test.js` | **Modify.** Updated expectations for Hammond. |
| `js/app/chat-controller.js` | **Modify.** Add an optional `getDefaultAgentSlug` fallback to `stickyAgentSlug()`. |
| `tests/unit/chat-controller.test.js` | **Modify.** Cover the fallback and its interaction with real stickiness. |
| `js/app/chat-panel.js` | **Create.** Moves the existing `#chat-view` subtree between a "home" slot and any other slot, themes it via a CSS custom property. |
| `tests/unit/chat-panel.test.js` | **Create.** |

**Explicitly not in this plan:** any change to `index.html`, `app-controller.js`'s `showSection`, `main.js`'s wiring, or `service-worker.js`'s precache list. Those all depend on markup that doesn't exist yet (the Nutrition/Central Node dashboard sections and their floating chat buttons) and belong to the two follow-up plans.

---

### Task 1: Relocate markdown-section extraction to `js/core/constraints.js`

**Files:**
- Create: `js/core/constraints.js`
- Delete: `netlify/functions/_shared/constraints.mjs`
- Modify: `netlify/functions/chat.mjs:18-23`
- Modify: `netlify/functions/chat-confirm.mjs:18`
- Modify: `tests/unit/constraints.test.js`

- [ ] **Step 1: Write the failing tests for the two new extractors**

Edit `tests/unit/constraints.test.js`: change the import path and add a `This Week`/`This Month` block to the sample fixture, plus two new tests.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractThisMonth,
  extractThisWeek,
  extractTodaysStatus
} from '../../js/core/constraints.js';

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
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 31 Jul session completed. Set Day Type to 45 to 60 min Workout.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged.
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

test('extractTodaysStatus matches the heading even though its date suffix changes daily', () => {
  const result = extractTodaysStatus(sample);
  assert.match(result, /Flare-up confirmed today/);
  assert.doesNotMatch(result, /This Week/);
});

test('extractThisWeek matches the heading even though its date-range suffix changes weekly', () => {
  const result = extractThisWeek(sample);
  assert.match(result, /Dietician appointment/);
  assert.doesNotMatch(result, /This Month/);
});

test('extractThisMonth matches the heading even though its month suffix changes monthly', () => {
  const result = extractThisMonth(sample);
  assert.match(result, /Crohn's remission/);
  assert.doesNotMatch(result, /Cross-Agent Coordination/);
});

test('extractCrossAgentCoordination extracts the directives section', () => {
  const result = extractCrossAgentCoordination(sample);
  assert.match(result, /Chadwick→Brisket/);
  assert.doesNotMatch(result, /Recent Agent Actions/);
});

test('extractRecentAgentActions extracts the rolling action log', () => {
  const result = extractRecentAgentActions(sample);
  assert.match(result, /Chest and Curls session completed/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="constraints"`
Expected: FAIL — `Cannot find module '../../js/core/constraints.js'` (it doesn't exist yet).

- [ ] **Step 3: Create `js/core/constraints.js` with the relocated logic plus the two new extractors**

```js
const CONSTRAINTS_HEADING = '## 🔴 Current Constraints & Priorities';
const TODAYS_STATUS_HEADING = "## ⚡ Today's Status";
const THIS_WEEK_HEADING = '## 📅 This Week';
const THIS_MONTH_HEADING = '## 📊 This Month';
const CROSS_AGENT_HEADING = '## 🤝 Cross-Agent Coordination';
const RECENT_ACTIONS_HEADING = '## 📝 Recent Agent Actions';

export function extractSection(markdown, headingPrefix) {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  if (typeof headingPrefix !== 'string' || headingPrefix.trim() === '') {
    throw new TypeError('headingPrefix must be a non-empty string');
  }
  const escaped = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}.*$`, 'm').exec(markdown);
  if (!match) return '';
  const rest = markdown.slice(match.index + match[0].length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

export function extractConstraints(markdown) {
  return extractSection(markdown, CONSTRAINTS_HEADING);
}

export function extractTodaysStatus(markdown) {
  return extractSection(markdown, TODAYS_STATUS_HEADING);
}

export function extractThisWeek(markdown) {
  return extractSection(markdown, THIS_WEEK_HEADING);
}

export function extractThisMonth(markdown) {
  return extractSection(markdown, THIS_MONTH_HEADING);
}

export function extractCrossAgentCoordination(markdown) {
  return extractSection(markdown, CROSS_AGENT_HEADING);
}

export function extractRecentAgentActions(markdown) {
  return extractSection(markdown, RECENT_ACTIONS_HEADING);
}

export { RECENT_ACTIONS_HEADING };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="constraints"`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Point the two Netlify functions at the new location and delete the old file**

Edit `netlify/functions/chat.mjs` — change:

```js
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractTodaysStatus
} from './_shared/constraints.mjs';
```

to:

```js
import {
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  extractTodaysStatus
} from '../../js/core/constraints.js';
```

Edit `netlify/functions/chat-confirm.mjs` — change:

```js
import { RECENT_ACTIONS_HEADING } from './_shared/constraints.mjs';
```

to:

```js
import { RECENT_ACTIONS_HEADING } from '../../js/core/constraints.js';
```

Then delete the old file:

```bash
rm netlify/functions/_shared/constraints.mjs
```

- [ ] **Step 6: Confirm nothing else still references the old path, then run the full suite**

```bash
grep -rn "_shared/constraints" --include="*.mjs" --include="*.js" .
```

Expected: no output.

```bash
npm test
```

Expected: PASS, same total test count as before this task (the relocated file replaces the old one 1:1, plus the 3 new extractor tests).

- [ ] **Step 7: Commit**

```bash
git add js/core/constraints.js tests/unit/constraints.test.js netlify/functions/chat.mjs netlify/functions/chat-confirm.mjs
git rm netlify/functions/_shared/constraints.mjs
git commit -m "refactor: move markdown-section extraction to js/core so the browser can share it

Adds extractThisWeek/extractThisMonth for the upcoming Central Node tab."
```

---

### Task 2: Allowlist `central-node.md` in the repository sync policy

**Files:**
- Modify: `netlify/functions/_shared/repo-policy.mjs:3`
- Modify: `tests/unit/repo-policy.test.js`

- [ ] **Step 1: Write the failing test**

Edit `tests/unit/repo-policy.test.js` — in the `'repository path policy rejects noncanonical and nonallowlisted paths'` test, remove `'central-node.md',` from the `rejected` array, and add `'central-node.md'` to the allowed-paths array in the same test:

```js
test('repository path policy rejects noncanonical and nonallowlisted paths', () => {
  const rejected = [
    '../data/x.md',
    'https://evil/x.md',
    'data\\nutrition\\x.md',
    'data//nutrition/2026/08/2026-08-01-x.md',
    'data/./nutrition/2026/08/2026-08-01-x.md',
    'data/nutrition/2026/02/2026-02-30-x.md',
    'data/nutrition/2026/08/2026-07-31-x.md',
    'data/sleep/2026/08/2026-08-01-x.md',
    'data/mind/2026/08/2026-08-01-x.yml',
    'config/other.yml',
    'data/mind/2026/08/2026-08-01-x .md'
  ];

  for (const path of rejected) assert.equal(isAllowedRepositoryPath(path), false, path);
  for (const path of [
    'config/agents.yml',
    'config/targets.yml',
    'central-node.md',
    'data/nutrition/2026/08/2026-08-01-breakfast.md',
    'data/fitness/2026/08/2026-08-01-workout.md',
    'data/body/2026/08/2026-08-01-weight.md',
    'data/mind/2026/08/2026-08-01-diary.md',
    'data/skincare/2026/08/2026-08-01-morning.md'
  ]) assert.equal(isAllowedRepositoryPath(path), true, path);
});
```

Also update the first test in the file (`'manifest policy returns sorted config and in-range canonical events'`) to confirm `central-node.md` flows through `selectManifestEntries` alongside the other config paths:

```js
test('manifest policy returns sorted config and in-range canonical events', () => {
  const [MEAL, OLD, TARGETS, AGENTS, CENTRAL_NODE, SECRET] = ['a', 'b', 'c', 'd', 'e', 'f'].map(value => value.repeat(40));
  const tree = [
    blob('data/nutrition/2026/08/2026-08-01-breakfast.md', MEAL, 120),
    blob('data/nutrition/2026/07/2026-07-01-old.md', OLD, 100),
    blob('config/targets.yml', TARGETS, 90),
    blob('config/agents.yml', AGENTS, 80),
    blob('central-node.md', CENTRAL_NODE, 60),
    blob('private/secret.md', SECRET, 20)
  ];

  assert.deepEqual(selectManifestEntries(tree, { from: '2026-07-02', to: '2026-08-01' }), [
    { path: 'central-node.md', sha: CENTRAL_NODE, size: 60 },
    { path: 'config/agents.yml', sha: AGENTS, size: 80 },
    { path: 'config/targets.yml', sha: TARGETS, size: 90 },
    { path: 'data/nutrition/2026/08/2026-08-01-breakfast.md', sha: MEAL, size: 120 }
  ]);
});
```

(Entries are alphabetically sorted by path — `central-node.md` sorts before `config/...` because `-` (0x2D) is less than `/` (0x2F) is irrelevant here; `c-e` < `c-o` lexicographically, so it lands first. Confirm this matches the actual sort order in step 2.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="repo-policy"`
Expected: FAIL — `central-node.md` still returns `false` from `isAllowedRepositoryPath`, and the manifest test's expected array won't match.

- [ ] **Step 3: Add `central-node.md` to the allowlist**

Edit `netlify/functions/_shared/repo-policy.mjs:3`:

```js
const CONFIG_PATHS = new Set(['config/agents.yml', 'config/targets.yml', 'central-node.md']);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="repo-policy"`
Expected: PASS. If the sort-order assertion in Step 1 doesn't match, fix the expected array order to whatever `Array.prototype.sort` with `localeCompare` actually produces — don't change the assertion's intent, just its literal order.

- [ ] **Step 5: Run the full suite to confirm nothing else assumed `central-node.md` was rejected**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/repo-policy.mjs tests/unit/repo-policy.test.js
git commit -m "feat: allowlist central-node.md in the repository sync policy"
```

---

### Task 3: Parse `central-node.md` and `config/agents.yml` content out of the live sync

**Files:**
- Modify: `js/app/load-live-events.js`
- Modify: `tests/unit/load-live-events.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/load-live-events.test.js` (new tests, appended after the existing ones — keep all existing tests unchanged):

```js
test('exposes parsed config/agents.yml and raw central-node.md content when both are present', async () => {
  const agentsYaml = await readFile(new URL('../../config/agents.yml', import.meta.url), 'utf8');
  const centralNodeMarkdown = '# Purpose\n---\n## ⚡ Today\'s Status\nAll clear.\n';
  const files = [
    raw('config/agents.yml', agentsYaml),
    raw('central-node.md', centralNodeMarkdown)
  ];
  const sync = async () => ({
    files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig.agents.find(agent => agent.slug === 'brisket').colour, '#F0B843');
  assert.equal(result.centralNodeMarkdown, centralNodeMarkdown);
});

test('an unparseable config/agents.yml produces a warning instead of throwing, and central-node.md needs no parsing to fail', async () => {
  const files = [
    raw('config/agents.yml', 'agents: [invalid'),
    raw('central-node.md', 'anything at all is valid markdown here')
  ];
  const sync = async () => ({
    files, warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig, null);
  assert.equal(result.centralNodeMarkdown, 'anything at all is valid markdown here');
  assert.deepEqual(
    result.warnings.filter(warning => warning.path === 'config/agents.yml'),
    [{ path: 'config/agents.yml', code: 'invalid_agents' }]
  );
});

test('agentsConfig and centralNodeMarkdown default to null when neither file is present', async () => {
  const sync = async () => ({
    files: [], warnings: [], commitSha: 'c'.repeat(40), manifestId: 'range',
    changed: true, freshness: 'confirmed'
  });

  const result = await loadLiveEvents({ sync, loadYaml: load, date: '2026-08-01' });

  assert.equal(result.agentsConfig, null);
  assert.equal(result.centralNodeMarkdown, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="load-live-events"`
Expected: FAIL — `result.agentsConfig` and `result.centralNodeMarkdown` are `undefined`, not matching the assertions.

- [ ] **Step 3: Extend `createValidator` and `parseFiles` in `js/app/load-live-events.js`**

Full replacement of the file:

```js
import { parseEventDocument } from '../core/records.js';
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';

const TARGETS_PATH = 'config/targets.yml';
const AGENTS_PATH = 'config/agents.yml';
const CENTRAL_NODE_PATH = 'central-node.md';
const EVENT_PATH = /^data\/.+\.md$/;
const INITIAL_LOOKBACK_DAYS = 30;
const EXTENSION_DAYS = 90;

export async function loadLiveEvents({ sync, loadYaml, date }) {
  if (typeof sync !== 'function' || typeof loadYaml !== 'function') {
    throw new TypeError('Live event dependencies are unavailable');
  }
  if (!isCalendarDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);

  let from = addCalendarDays(date, -INITIAL_LOOKBACK_DAYS);
  let to = date;
  let commitSha = null;
  let priorBoundary = null;
  let changed = false;
  let freshness = 'confirmed';
  const filesByPath = new Map();
  const warnings = [];

  while (true) {
    const result = await sync({ from, to, validateFile: createValidator(loadYaml) });
    commitSha = result.commitSha ?? commitSha;
    changed ||= result.changed === true;
    if (result.freshness === 'fallback') freshness = 'fallback';
    warnings.push(...(result.warnings ?? []));

    for (const file of result.files ?? []) {
      filesByPath.set(file.path, file);
    }

    const batch = parseFiles(result.files ?? [], loadYaml);
    const parsed = parseFiles([...filesByPath.values()], loadYaml);
    const returnedOlderEvent = priorBoundary === null || batch.events.some(
      event => event.record.date < priorBoundary
    );
    if (!returnedOlderEvent || !streakReaches(parsed.events, from)) break;

    const nextFrom = addCalendarDays(from, -EXTENSION_DAYS);
    priorBoundary = from;
    if (daysBetween(nextFrom, to) < 366) {
      from = nextFrom;
    } else {
      to = addCalendarDays(from, -1);
      from = nextFrom;
    }
  }

  const parsed = parseFiles([...filesByPath.values()], loadYaml);
  return {
    events: parsed.events,
    targetsConfig: parsed.targetsConfig,
    agentsConfig: parsed.agentsConfig,
    centralNodeMarkdown: parsed.centralNodeMarkdown,
    warnings: [...warnings, ...parsed.warnings],
    commitSha,
    changed,
    freshness
  };
}

function createValidator(loadYaml) {
  return file => {
    try {
      if (file.path === TARGETS_PATH || file.path === AGENTS_PATH) {
        loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH) {
        // Freeform markdown, no schema to violate -- any string content is acceptable.
      } else if (EVENT_PATH.test(file.path)) {
        parseEventDocument(file.content, file.path, loadYaml);
      } else {
        return { valid: false, code: 'invalid_file' };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        code: file.path === TARGETS_PATH ? 'invalid_targets' : 'invalid_event'
      };
    }
  };
}

function parseFiles(files, loadYaml) {
  const events = [];
  const warnings = [];
  let targetsConfig = null;
  let agentsConfig = null;
  let centralNodeMarkdown = null;

  for (const file of files) {
    try {
      if (file.path === TARGETS_PATH) {
        targetsConfig = loadYaml(file.content);
      } else if (file.path === AGENTS_PATH) {
        agentsConfig = loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH) {
        centralNodeMarkdown = file.content;
      } else if (EVENT_PATH.test(file.path)) {
        events.push(parseEventDocument(file.content, file.path, loadYaml));
      }
    } catch {
      warnings.push({
        path: file.path,
        code: file.path === TARGETS_PATH ? 'invalid_targets'
          : file.path === AGENTS_PATH ? 'invalid_agents'
          : 'invalid_event'
      });
    }
  }

  if (!files.some(file => file.path === TARGETS_PATH)) {
    warnings.push({ path: TARGETS_PATH, code: 'missing_targets' });
  }
  return { events, targetsConfig, agentsConfig, centralNodeMarkdown, warnings };
}

function streakReaches(events, boundary) {
  const completed = new Set(events
    .map(item => item.record)
    .filter(record => record.type === 'workout' && record.status === 'completed')
    .map(record => record.date));
  const mostRecent = [...completed].sort().at(-1);
  if (!mostRecent) return false;

  let cursor = mostRecent;
  while (completed.has(cursor) && cursor > boundary) cursor = addCalendarDays(cursor, -1);
  return completed.has(boundary) && cursor === boundary;
}
```

(Only the `TARGETS_PATH`/`AGENTS_PATH`/`CENTRAL_NODE_PATH` constants, `createValidator`, `parseFiles`, and the `loadLiveEvents` return statement changed from the current file — `streakReaches` and the rest of `loadLiveEvents` are unchanged, reproduced here for a clean full-file replacement.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="load-live-events"`
Expected: PASS, all tests including the 5 pre-existing ones.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/app/load-live-events.js tests/unit/load-live-events.test.js
git commit -m "feat: parse central-node.md and config/agents.yml content out of the live sync

Exposes agentsConfig and centralNodeMarkdown on the loadLiveEvents result,
reusing the exact same sync/cache path Home already uses -- no new fetch."
```

---

### Task 4: Add a `central-node.md` fixture for local dev and tests

**Files:**
- Create: `tests/fixtures/valid/central-node.md`
- Modify: `scripts/mock-api.mjs:10-29`

- [ ] **Step 1: Create the fixture**

This is synthetic placeholder content (matching the tone of the existing fixtures, e.g. `tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md`) — not Adam's real data.

```markdown
# Purpose
This page serves as the central coordination hub for all AI agents. Each agent should read this page before making decisions and update it with relevant information that other agents need to know.
---
## 🔴 Current Constraints & Priorities
### Medical Status
- Test condition (confirmed 1 Jan 2026): stable, routine monitoring only.
### Dietary
- No test allergen. Protein target 120g daily.
---
## ⚡ Today's Status (Thursday 30 July 2026)
**Health:** Stable. **Nutrition:** Breakfast logged, 38g protein so far. **Exercise:** Session completed today, streak 1. **Mood:** 7/10 (good).
---
## 📅 This Week (27 Jul – 2 Aug 2026)
**Key Events:**
- Thu 30: Chest and Curls session logged.
**Weekly Averages:** Protein on target 5 of 7 days.
---
## 📊 This Month (July 2026)
**Active Goals:**
- Maintain workout streak (High)
- Hit protein target 5 days a week (Medium)
---
## 📈 Long-Term Trends & Patterns
**Nutrition:** Protein target consistency improving month over month.
**Exercise:** Workout streak holding steady since early July.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: 30 Jul session completed, Chest and Curls, 26 min. Set Day Type to 30-min Workout.
---
## 📝 Recent Agent Actions
**30 Jul:** Chadwick: Chest and Curls session completed and logged (26 min).
```

- [ ] **Step 2: Serve it from the local mock API**

Edit `scripts/mock-api.mjs:10-29` — add one entry to `FIXTURE_FILES`:

```js
const FIXTURE_FILES = [
  { path: 'config/agents.yml', source: 'config/agents.yml' },
  { path: 'config/targets.yml', source: 'config/targets.yml' },
  { path: 'central-node.md', source: 'tests/fixtures/valid/central-node.md' },
  {
    path: 'data/fitness/2026/07/2026-07-30-chest-curls.md',
    source: 'tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md'
  },
  {
    path: 'data/mind/2026/07/2026-07-30-diary.md',
    source: 'tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md'
  },
  {
    path: 'data/nutrition/2026/07/2026-07-30-breakfast.md',
    source: 'tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-breakfast.md'
  },
  {
    path: 'data/nutrition/2026/07/2026-07-30-lunch.md',
    source: 'tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md'
  }
];
```

- [ ] **Step 3: Confirm the local dev server still serves the manifest correctly**

```bash
npm run dev &
sleep 2
curl -s -X POST http://localhost:8080/api/auth -H 'content-type: application/json' -d '{"passphrase":"life-hub-local"}' -c /tmp/life-hub-cookie.txt
curl -s -b /tmp/life-hub-cookie.txt "http://localhost:8080/api/repo/manifest?from=2026-07-01&to=2026-08-01" | grep -o 'central-node.md'
kill %1
```

Expected: `central-node.md` appears in the output (adjust the port to whatever `npm run dev` prints if different from 8080).

- [ ] **Step 4: Run the full suite**

```bash
npm test
npm run validate:fixtures
```

Expected: PASS, 4 valid files still reported by `validate:fixtures` (this new fixture isn't a `data/` event file, so it isn't part of that count — confirm the count is unchanged, not incremented).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/valid/central-node.md scripts/mock-api.mjs
git commit -m "test: add a synthetic central-node.md fixture for local dev and tests"
```

---

### Task 5: Add an `agentColour` lookup helper

**Files:**
- Create: `js/app/agent-colour.js`
- Create: `tests/unit/agent-colour.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentColour, DEFAULT_AGENT_COLOUR } from '../../js/app/agent-colour.js';

const agentsConfig = {
  agents: [
    { slug: 'brisket', colour: '#F0B843' },
    { slug: 'hammond', colour: '#3A3A42' }
  ]
};

test('returns the configured colour for a known agent', () => {
  assert.equal(agentColour(agentsConfig, 'brisket'), '#F0B843');
  assert.equal(agentColour(agentsConfig, 'hammond'), '#3A3A42');
});

test('falls back to the default accent when the config is missing, empty, or the agent is unknown', () => {
  assert.equal(agentColour(null, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour(undefined, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour({ agents: [] }, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour(agentsConfig, 'unknown-agent'), DEFAULT_AGENT_COLOUR);
});

test('falls back to the default accent when a colour value is present but not a string', () => {
  assert.equal(agentColour({ agents: [{ slug: 'brisket', colour: null }] }, 'brisket'), DEFAULT_AGENT_COLOUR);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="agent-colour"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `js/app/agent-colour.js`**

```js
export const DEFAULT_AGENT_COLOUR = '#376FB7';

export function agentColour(agentsConfig, slug) {
  const agent = agentsConfig?.agents?.find(candidate => candidate.slug === slug);
  return typeof agent?.colour === 'string' ? agent.colour : DEFAULT_AGENT_COLOUR;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="agent-colour"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/app/agent-colour.js tests/unit/agent-colour.test.js
git commit -m "feat: add agentColour lookup for per-agent chat panel theming"
```

---

### Task 6: Confirm Hammond's colour in the local `config/agents.yml` fixture

**Files:**
- Modify: `config/agents.yml`
- Modify: `tests/unit/agents-config.test.js`

- [ ] **Step 1: Write the failing test**

Replace `tests/unit/agents-config.test.js` in full:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

const registry = load(await readFile(new URL('../../config/agents.yml', import.meta.url), 'utf8'));

test('agent registry preserves the approved roster and confirmed colours', () => {
  const bySlug = Object.fromEntries(registry.agents.map(agent => [agent.slug, agent]));
  assert.deepEqual(Object.keys(bySlug).sort(), [
    'brisket', 'chadwick', 'hammond', 'hyaluronica', 'penelope', 'sara', 'vera'
  ]);
  assert.deepEqual(Object.fromEntries(
    ['chadwick', 'hyaluronica', 'penelope', 'sara', 'vera', 'brisket', 'hammond']
      .map(slug => [slug, { colour: bySlug[slug].colour, colour_source: bySlug[slug].colour_source }])
  ), {
    chadwick: { colour: '#2E7BD6', colour_source: 'confirmed' },
    hyaluronica: { colour: '#B99EE0', colour_source: 'confirmed' },
    penelope: { colour: '#C85A64', colour_source: 'confirmed' },
    sara: { colour: '#BBD9B4', colour_source: 'confirmed' },
    vera: { colour: '#37598A', colour_source: 'confirmed' },
    brisket: { colour: '#F0B843', colour_source: 'confirmed' },
    hammond: { colour: '#3A3A42', colour_source: 'confirmed' }
  });
  assert.deepEqual(bySlug.hammond, {
    name: 'General Hammond',
    slug: 'hammond',
    domain: 'life_coaching',
    tab: 'Central Node',
    colour: '#3A3A42',
    colour_source: 'confirmed',
    name_triggers: ['general hammond', 'hammond']
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="agents-config"`
Expected: FAIL — `bySlug.hammond.colour` is still `'#142B51'` with `colour_source: 'provisional_until_cover_migration'`.

- [ ] **Step 3: Update the local fixture**

Edit `config/agents.yml` — change Hammond's entry:

```yaml
  - name: General Hammond
    slug: hammond
    domain: life_coaching
    tab: Central Node
    colour: '#3A3A42'
    colour_source: confirmed
    name_triggers: [general hammond, hammond]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="agents-config"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config/agents.yml tests/unit/agents-config.test.js
git commit -m "chore(agents): confirm Hammond's colour as #3A3A42 from his Notion cover

Local fixture only -- the production config/agents.yml lives in the
private data repo and needs updating there separately."
```

---

### Task 7: Add a default-agent fallback to the chat controller's stickiness

**Files:**
- Modify: `js/app/chat-controller.js:8,28-32`
- Modify: `tests/unit/chat-controller.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/chat-controller.test.js` (after the existing tests, same file):

```js
test('a default agent hint is used as priorAgentSlug before any agent has spoken this session', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'hammond' };
      yield { type: 'text', delta: 'Walk me through it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi, getDefaultAgentSlug: () => 'hammond' });

  await controller.send('how is this month looking');

  assert.equal(sendCalls[0].priorAgentSlug, 'hammond');
});

test('a real recent agent reply still wins over the default hint', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logging that now, buddy.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root, chatApi, now: () => clock, getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 60_000;
  await controller.send('actually make that 3 eggs');

  assert.equal(sendCalls[1].priorAgentSlug, 'brisket', 'the real conversation with Brisket must win over the Hammond default hint');
});

test('the default hint returns once the memory window lapses, instead of staying stuck or falling to undefined', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  let clock = Date.parse('2026-08-01T18:00:00Z');
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'brisket' };
      yield { type: 'text', delta: 'Logged.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({
    root, chatApi, now: () => clock, getDefaultAgentSlug: () => 'hammond'
  });

  await controller.send('Brisket, log 2 eggs for breakfast');
  clock += 21 * 60_000;
  await controller.send('how is my week looking');

  assert.equal(sendCalls[1].priorAgentSlug, 'hammond');
});

test('omitting the default hint entirely preserves today\'s existing behaviour (undefined when nothing is sticky)', async () => {
  const root = new FakeDocument();
  const sendCalls = [];
  const chatApi = {
    async *send(message, options) {
      sendCalls.push({ message, ...options });
      yield { type: 'agent', slug: 'router' };
      yield { type: 'text', delta: 'Got it.' };
      yield { type: 'done' };
    }
  };
  const controller = createChatController({ root, chatApi });

  await controller.send('what should I eat');

  assert.equal(sendCalls[0].priorAgentSlug, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="chat-controller"`
Expected: FAIL — `sendCalls[0].priorAgentSlug` is `undefined` in the first new test, not `'hammond'`.

- [ ] **Step 3: Add the fallback in `js/app/chat-controller.js`**

Edit line 8, the function signature:

```js
export function createChatController({ root, chatApi, onRecordWritten, getDefaultAgentSlug, now = () => Date.now() }) {
```

Edit lines 28-32, `stickyAgentSlug`:

```js
  // A name only needs to be said once per topic: if the same agent replied within
  // the memory window, keep talking to them without repeating it -- but never
  // stick to the router itself, since that's not a real persona to continue as.
  // Once that window has lapsed (or no agent has spoken yet this session), fall
  // back to whichever agent the currently-open panel defaults to, if any -- an
  // explicit name in the message still always wins over both, in routeAgent
  // server-side.
  function stickyAgentSlug() {
    if (lastAgentSlug && lastAgentSlug !== 'router' && now() - lastAgentAt <= HISTORY_WINDOW_MS) {
      return lastAgentSlug;
    }
    return getDefaultAgentSlug?.();
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="chat-controller"`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/app/chat-controller.js tests/unit/chat-controller.test.js
git commit -m "feat: add an optional default-agent fallback to chat stickiness

Lets a tab (e.g. Nutrition) hint which agent an unaddressed message should
reach when nothing is already sticky -- a real recent exchange with another
agent still wins."
```

---

### Task 8: Add a reusable chat-panel reparenting module

**Files:**
- Create: `js/app/chat-panel.js`
- Create: `tests/unit/chat-panel.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatPanelController } from '../../js/app/chat-panel.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.parent = null;
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) ?? ''
    };
  }

  append(node) {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
    this.children.push(node);
    node.parent = this;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([
      ['#chat-view', new FakeElement('section')],
      ['#chat-view-home', new FakeElement('div')]
    ]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }
}

test('opening the panel moves it into the given slot, unhides it, and sets the accent colour', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');

  controller.open(nutritionSlot, '#F0B843');

  const panel = root.querySelector('#chat-view');
  assert.equal(panel.parent, nutritionSlot);
  assert.equal(panel.hidden, false);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '#F0B843');
  assert.equal(panel.dataset.panelMode, 'overlay');
  assert.equal(controller.isOpen(), true);
});

test('closing the panel returns it to the home slot, hides it, and clears the accent colour', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');
  controller.open(nutritionSlot, '#F0B843');

  controller.close();

  const panel = root.querySelector('#chat-view');
  const homeSlot = root.querySelector('#chat-view-home');
  assert.equal(panel.parent, homeSlot);
  assert.equal(panel.hidden, true);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '');
  assert.equal(panel.dataset.panelMode, undefined);
  assert.equal(controller.isOpen(), false);
});

test('closing when already closed is a harmless no-op', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });

  controller.close();

  assert.equal(controller.isOpen(), false);
  assert.equal(root.querySelector('#chat-view').parent, null);
});

test('opening a second slot moves the same panel again rather than cloning it', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');
  const centralNodeSlot = new FakeElement('div');

  controller.open(nutritionSlot, '#F0B843');
  controller.open(centralNodeSlot, '#3A3A42');

  const panel = root.querySelector('#chat-view');
  assert.equal(panel.parent, centralNodeSlot);
  assert.equal(nutritionSlot.children.length, 0);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '#3A3A42');
});

test('open requires a slot element', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });

  assert.throws(() => controller.open(null, '#F0B843'), TypeError);
});

test('throws when required DOM elements are unavailable', () => {
  const root = { querySelector: () => null };
  assert.throws(() => createChatPanelController({ root }), TypeError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="chat-panel"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `js/app/chat-panel.js`**

```js
export function createChatPanelController({ root }) {
  const panel = root.querySelector('#chat-view');
  const homeSlot = root.querySelector('#chat-view-home');
  if (!panel || !homeSlot) throw new TypeError('Chat panel dependencies are unavailable');

  let openSlot = null;

  function open(slot, accentColour) {
    if (!slot) throw new TypeError('A slot element is required to open the chat panel');
    slot.append(panel);
    panel.hidden = false;
    panel.dataset.panelMode = 'overlay';
    panel.style.setProperty('--agent-accent', accentColour);
    openSlot = slot;
  }

  function close() {
    if (!openSlot) return;
    homeSlot.append(panel);
    panel.hidden = true;
    delete panel.dataset.panelMode;
    panel.style.removeProperty('--agent-accent');
    openSlot = null;
  }

  function isOpen() {
    return openSlot !== null;
  }

  return { open, close, isOpen };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --test-name-pattern="chat-panel"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/app/chat-panel.js tests/unit/chat-panel.test.js
git commit -m "feat: add a reusable chat-panel module to reparent the chat view between tabs

Not wired into main.js/index.html yet -- the Nutrition and Central Node
plans wire it in once their markup and floating buttons exist."
```

---

## Final verification

- [ ] **Run the complete suite one more time and confirm the total test count only went up (no removals beyond the intentional constraints.test.js relocation, which is a like-for-like move):**

```bash
npm test
npm run validate:fixtures
npm audit --audit-level=high
```

Expected: all green, 0 vulnerabilities.

- [ ] **Confirm `git status` is clean (everything committed) before handing off to the Nutrition tab plan:**

```bash
git status --porcelain
```

Expected: no output (aside from any pre-existing unrelated changes you did not touch).
