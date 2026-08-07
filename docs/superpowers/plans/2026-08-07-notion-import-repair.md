# Notion Import Schema Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear Home `invalid_event` noise by repairing `life-hub-data` in place (delete identical spaced dupes, add `time`, fix Sydney offsets, demote empty completed strength sessions) and hardening Notion importers so re-runs do not recreate the bugs.

**Architecture:** Share a `sydneyLocalStamp(dateKey, time)` helper in `js/core/time.js`. Put pure repair decisions in `scripts/lib/repair-notion-import.mjs` (unit-tested). Drive mutations from `scripts/repair-notion-import.mjs` with `--dry-run` (default) and `--apply`. Patch `import-notion-history.mjs` and `import-nutrition-notion.mjs` to emit correct metadata and never write spaced paths.

**Tech Stack:** Node ESM scripts, `js-yaml` for parse, `node:test`, existing `validateRecord` / `parseEventDocument`.

**Spec:** `docs/superpowers/specs/2026-08-07-notion-import-repair-design.md`

**Deploy:** Local commits only; do not push unless Adam asks. Data mutations are in `~/Documents/Claude/Projects/life-hub-data` (separate git repo) — commit there only if Adam asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `js/core/time.js` | Export `sydneyLocalStamp(dateKey, time)` (+10/+11 round-trip) |
| `tests/unit/time.test.js` | Stamp tests across DST |
| `scripts/lib/repair-notion-import.mjs` | Pure helpers: spaced-dupe resolution, default time, record repair, demotion |
| `tests/unit/repair-notion-import.test.js` | Unit tests for helpers |
| `scripts/repair-notion-import.mjs` | CLI: walk tree, dry-run / apply, print summary |
| `scripts/import-notion-history.mjs` | Always emit `time` + `sydneyLocalStamp` |
| `scripts/import-nutrition-notion.mjs` | Use shared stamp; assert slug has no spaces |

**Defaults (canonical):** body types → `time: "12:00"`; workouts → `time: "07:00"`.

---

### Task 1: Shared `sydneyLocalStamp`

**Files:**
- Modify: `js/core/time.js`
- Modify: `tests/unit/time.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/time.test.js`:

```js
import { sydneyLocalStamp } from '../../js/core/time.js';

test('sydneyLocalStamp picks AEDT (+11) in late March', () => {
  assert.equal(sydneyLocalStamp('2026-03-29', '12:00'), '2026-03-29T12:00:00+11:00');
});

test('sydneyLocalStamp picks AEST (+10) in July', () => {
  assert.equal(sydneyLocalStamp('2026-07-30', '07:00'), '2026-07-30T07:00:00+10:00');
});

test('sydneyLocalStamp picks AEST after the autumn changeover', () => {
  assert.equal(sydneyLocalStamp('2026-04-08', '12:00'), '2026-04-08T12:00:00+10:00');
});
```

(Adjust expected offsets if `getSydneyTimestamp` round-trip disagrees on a boundary day — the helper must match what `validateRecord` accepts.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/time.test.js`

Expected: FAIL — `sydneyLocalStamp` is not exported.

- [ ] **Step 3: Implement**

In `js/core/time.js`, add (move logic from `scripts/import-nutrition-notion.mjs`):

```js
/** Build a Sydney-valid (+10/+11) ISO stamp for a calendar date + HH:MM. */
export function sydneyLocalStamp(dateKey, time) {
  if (!isCalendarDate(dateKey)) throw new TypeError(`Invalid calendar date: ${dateKey}`);
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError(`Invalid time: ${time}`);
  }
  for (const offset of ['+11:00', '+10:00']) {
    const candidate = `${dateKey}T${time}:00${offset}`;
    const rebuilt = getSydneyTimestamp(new Date(candidate));
    if (rebuilt.startsWith(`${dateKey}T${time}:`)) return rebuilt;
  }
  return getSydneyTimestamp(new Date(`${dateKey}T${time}:00Z`));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/time.test.js`

Expected: PASS.

- [ ] **Step 5: Commit** (only if Adam asked to commit)

```bash
git add js/core/time.js tests/unit/time.test.js
git commit -m "$(cat <<'EOF'
Add sydneyLocalStamp helper for import and repair scripts.

EOF
)"
```

---

### Task 2: Pure repair helpers + tests

**Files:**
- Create: `scripts/lib/repair-notion-import.mjs`
- Create: `tests/unit/repair-notion-import.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/repair-notion-import.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spacedDuplicateCandidates,
  defaultTimeForRecord,
  shouldDemoteEmptyStrength,
  repairRecordFrontmatter
} from '../../scripts/lib/repair-notion-import.mjs';

test('spacedDuplicateCandidates maps Mac " 2" dupes to canonical siblings', () => {
  assert.deepEqual(
    spacedDuplicateCandidates('2026-02-11-breakfast 2.md'),
    ['2026-02-11-breakfast.md', '2026-02-11-breakfast-2.md']
  );
  assert.equal(spacedDuplicateCandidates('2026-02-11-breakfast.md'), null);
});

test('defaultTimeForRecord uses 12:00 for body and 07:00 for workouts', () => {
  assert.equal(defaultTimeForRecord({ type: 'measurements' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'composition' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'weight' }), '12:00');
  assert.equal(defaultTimeForRecord({ type: 'workout' }), '07:00');
});

test('shouldDemoteEmptyStrength only for completed strength-like with no usable sets', () => {
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength', exercises: []
  }), true);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength',
    exercises: [{ name: 'Bench', sets: [] }]
  }), true);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'strength',
    exercises: [{ name: 'Bench', sets: [{ reps: 8, weight_kg: 40, cable_type: 'none' }] }]
  }), false);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'planned', session_kind: 'strength', exercises: []
  }), false);
  assert.equal(shouldDemoteEmptyStrength({
    type: 'workout', status: 'completed', session_kind: 'walk',
    exercises: [], duration_min: 30
  }), false);
});

test('repairRecordFrontmatter adds time, fixes stamps, and demotes empty strength', () => {
  const { record, changed } = repairRecordFrontmatter({
    schema_version: 1,
    id: 'notion-x',
    type: 'workout',
    date: '2026-03-29',
    created_at: '2026-03-29T12:00:00+10:00',
    updated_at: '2026-03-29T12:00:00+10:00',
    source: 'notion_import',
    title: 'Empty session',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [],
    pain_flags: []
  });
  assert.equal(changed, true);
  assert.equal(record.time, '07:00');
  assert.equal(record.created_at, '2026-03-29T07:00:00+11:00');
  assert.equal(record.updated_at, '2026-03-29T07:00:00+11:00');
  assert.equal(record.status, 'planned');
});

test('repairRecordFrontmatter is a no-op when already valid shape', () => {
  const input = {
    schema_version: 1,
    id: 'notion-y',
    type: 'measurements',
    date: '2026-04-08',
    time: '12:00',
    created_at: '2026-04-08T12:00:00+10:00',
    updated_at: '2026-04-08T12:00:00+10:00',
    source: 'notion_import',
    chest: 99
  };
  const { changed } = repairRecordFrontmatter(input);
  assert.equal(changed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/repair-notion-import.test.js`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement helpers**

Create `scripts/lib/repair-notion-import.mjs`:

```js
import { sydneyLocalStamp } from '../../js/core/time.js';

const BODY_TYPES = new Set(['weight', 'composition', 'measurements']);

export function spacedDuplicateCandidates(basename) {
  const match = /^(.+) (\d+)\.md$/.exec(basename);
  if (!match) return null;
  const [, stem, n] = match;
  return [`${stem}.md`, `${stem}-${n}.md`];
}

export function defaultTimeForRecord(record) {
  if (BODY_TYPES.has(record?.type)) return '12:00';
  if (record?.type === 'workout') return '07:00';
  return '12:00';
}

export function shouldDemoteEmptyStrength(record) {
  if (!record || record.type !== 'workout') return false;
  if (record.status !== 'completed') return false;
  const kind = record.session_kind;
  const strengthLike = kind === 'strength' || kind == null;
  if (!strengthLike) return false;
  const exercises = record.exercises;
  if (!Array.isArray(exercises) || exercises.length === 0) return true;
  return exercises.every(ex => !Array.isArray(ex?.sets) || ex.sets.length === 0);
}

/**
 * Returns { record, changed }. Does not mutate the input object.
 */
export function repairRecordFrontmatter(input) {
  if (!input || typeof input !== 'object') return { record: input, changed: false };
  const record = { ...input };
  let changed = false;

  if (record.schema_version === 1) {
    if (record.time == null || record.time === '') {
      record.time = defaultTimeForRecord(record);
      changed = true;
    }
    if (typeof record.date === 'string' && typeof record.time === 'string') {
      const stamp = sydneyLocalStamp(record.date, record.time);
      if (record.created_at !== stamp) {
        record.created_at = stamp;
        changed = true;
      }
      if (record.updated_at !== stamp) {
        record.updated_at = stamp;
        changed = true;
      }
    }
  }

  if (shouldDemoteEmptyStrength(record)) {
    record.status = 'planned';
    changed = true;
  }

  return { record, changed };
}

export function renderFrontmatter(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

export function rebuildEventFile(record, body) {
  const trimmed = typeof body === 'string' && body.trim() ? `${body.trim()}\n` : '';
  return `---\n${renderFrontmatter(record)}---\n${trimmed}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/repair-notion-import.test.js tests/unit/time.test.js`

Expected: PASS.

- [ ] **Step 5: Commit** (only if Adam asked)

```bash
git add scripts/lib/repair-notion-import.mjs tests/unit/repair-notion-import.test.js
git commit -m "$(cat <<'EOF'
Add pure helpers for Notion import repair.

EOF
)"
```

---

### Task 3: CLI repair script

**Files:**
- Create: `scripts/repair-notion-import.mjs`

- [ ] **Step 1: Implement CLI**

```js
#!/usr/bin/env node
/**
 * Repair Notion-imported events in life-hub-data.
 *
 * Usage:
 *   node scripts/repair-notion-import.mjs --out ../life-hub-data           # dry-run (default)
 *   node scripts/repair-notion-import.mjs --out ../life-hub-data --apply
 */
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { parseCanonicalPath, parseEventDocument } from '../js/core/records.js';
import {
  spacedDuplicateCandidates,
  repairRecordFrontmatter,
  rebuildEventFile
} from './lib/repair-notion-import.mjs';

const args = parseArgs(process.argv.slice(2));
const outRoot = resolve(args.out || '../life-hub-data');
const apply = args.apply === true;

const summary = {
  scanned: 0,
  deletedDupes: 0,
  repaired: 0,
  skippedTemplates: 0,
  stillInvalid: 0,
  differingDupes: 0,
  samples: []
};

walk(join(outRoot, 'data'));

if (apply) {
  // second pass: recount still-invalid after mutations
  summary.stillInvalid = 0;
  recountInvalid(join(outRoot, 'data'));
}

console.log(JSON.stringify({ outRoot, apply, ...summary }, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') out.out = argv[++i];
    else if (arg === '--apply') out.apply = true;
  }
  return out;
}

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.md')) continue;
    const rel = full.slice(outRoot.length + 1).replaceAll('\\', '/');
    if (!rel.startsWith('data/')) continue;
    if (rel.includes('/templates/')) {
      summary.skippedTemplates += 1;
      continue;
    }
    if (rel.includes('library') || basename(rel) === 'central-node.md') continue;
    summary.scanned += 1;

    if (/\s/.test(name)) {
      handleSpaced(full, rel, name);
      continue;
    }

    try {
      parseCanonicalPath(rel);
    } catch {
      continue;
    }

    const text = readFileSync(full, 'utf8');
    let record;
    let body = '';
    try {
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
      if (!match) continue;
      record = load(match[1]);
      body = match[2] ?? '';
    } catch {
      continue;
    }
    if (!record || typeof record !== 'object') continue;

    const { record: next, changed } = repairRecordFrontmatter(record);
    if (!changed) continue;

    summary.repaired += 1;
    if (summary.samples.length < 8) {
      summary.samples.push({ action: 'repair', path: rel });
    }
    if (apply) {
      writeFileSync(full, rebuildEventFile(next, body), 'utf8');
    }
  }
}

function handleSpaced(full, rel, name) {
  const candidates = spacedDuplicateCandidates(name);
  if (!candidates) return;
  const dir = dirname(full);
  let sibling = null;
  for (const candidate of candidates) {
    const path = join(dir, candidate);
    if (existsSync(path)) {
      sibling = path;
      break;
    }
  }
  if (!sibling) {
    summary.differingDupes += 1;
    summary.samples.push({ action: 'orphan-space', path: rel });
    return;
  }
  const a = readFileSync(full);
  const b = readFileSync(sibling);
  if (!a.equals(b)) {
    summary.differingDupes += 1;
    summary.samples.push({ action: 'differing-space', path: rel, sibling: basename(sibling) });
    return;
  }
  summary.deletedDupes += 1;
  if (summary.samples.length < 8) {
    summary.samples.push({ action: 'delete-dupe', path: rel });
  }
  if (apply) unlinkSync(full);
}

function recountInvalid(dir) {
  // same walk; count parseEventDocument failures for non-template event paths
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      recountInvalid(full);
      continue;
    }
    if (!name.endsWith('.md') || /\s/.test(name)) continue;
    const rel = full.slice(outRoot.length + 1).replaceAll('\\', '/');
    if (!rel.startsWith('data/') || rel.includes('/templates/') || rel.includes('library')) continue;
    try {
      parseCanonicalPath(rel);
      parseEventDocument(readFileSync(full, 'utf8'), rel, load);
    } catch {
      summary.stillInvalid += 1;
      if (summary.samples.length < 15) {
        summary.samples.push({ action: 'still-invalid', path: rel });
      }
    }
  }
}
```

Keep the script focused; if `recountInvalid` is awkward inline, a second dry walk after apply is fine.

- [ ] **Step 2: Dry-run against life-hub-data**

Run:

```bash
node scripts/repair-notion-import.mjs --out /Users/adamrussell/Documents/Claude/Projects/life-hub-data
```

Expected JSON roughly: `deletedDupes` ≈ 253, `repaired` ≈ 109+, `differingDupes` ≈ 0, `apply: false`.

- [ ] **Step 3: Commit script** (only if Adam asked)

```bash
git add scripts/repair-notion-import.mjs
git commit -m "$(cat <<'EOF'
Add Notion import repair CLI with dry-run default.

EOF
)"
```

---

### Task 4: Harden `import-notion-history.mjs`

**Files:**
- Modify: `scripts/import-notion-history.mjs`

- [ ] **Step 1: Use shared stamp + always set `time`**

At top:

```js
import { sydneyLocalStamp } from '../js/core/time.js';
```

In `parseWorkoutMarkdown`, when building `record`, add `time: '07:00'` (or a parsed time if one already exists in props) and replace hardcoded stamps:

```js
const time = '07:00';
const stamp = sydneyLocalStamp(dateKey, time);
const record = {
  schema_version: 1,
  id: `notion-${dateKey}-${slugify(title).slice(0, 40)}`,
  type: 'workout',
  date: dateKey,
  time,
  created_at: stamp,
  updated_at: stamp,
  // ...rest unchanged
};
```

In `bodyEventsFromRow` / `bodyEventsFromMarkdown` record builders, add `time: '12:00'` and `sydneyLocalStamp(dateKey, '12:00')` for `created_at` / `updated_at` (every composition / weight / measurements object).

- [ ] **Step 2: Smoke-check by reading one generated shape**

Optional: run importer only if Notion export paths exist; otherwise rely on unit coverage of `sydneyLocalStamp` + code review that no `T12:00:00+10:00` literals remain:

Run: `rg "T12:00:00\\+10:00" scripts/import-notion-history.mjs`

Expected: no matches.

- [ ] **Step 3: Commit** (only if Adam asked)

```bash
git add scripts/import-notion-history.mjs
git commit -m "$(cat <<'EOF'
Emit time and DST-correct stamps from Notion history import.

EOF
)"
```

---

### Task 5: Harden `import-nutrition-notion.mjs`

**Files:**
- Modify: `scripts/import-nutrition-notion.mjs`

- [ ] **Step 1: Switch to shared stamp; guard slugs**

Replace local `sydneyLocalStamp` with:

```js
import { getSydneyTimestamp, sydneyLocalStamp } from '../js/core/time.js';
```

(Remove the local function; keep `getSydneyTimestamp` import only if still used elsewhere in the file — if not, drop it.)

In the meal write loop, after computing `slug`:

```js
if (/\s/.test(slug)) {
  skipped.push(`spaced-slug:${file}`);
  continue;
}
```

- [ ] **Step 2: Confirm no local duplicate helper**

Run: `rg "function sydneyLocalStamp" scripts/import-nutrition-notion.mjs`

Expected: no matches (uses `js/core/time.js`).

- [ ] **Step 3: Commit** (only if Adam asked)

```bash
git add scripts/import-nutrition-notion.mjs
git commit -m "$(cat <<'EOF'
Share sydneyLocalStamp and reject spaced nutrition slugs.

EOF
)"
```

---

### Task 6: Apply repair + verify

**Files:**
- Mutate: `/Users/adamrussell/Documents/Claude/Projects/life-hub-data/data/**` (separate repo)

- [ ] **Step 1: Re-run dry-run and confirm counts**

```bash
node scripts/repair-notion-import.mjs --out /Users/adamrussell/Documents/Claude/Projects/life-hub-data
```

- [ ] **Step 2: Apply**

```bash
node scripts/repair-notion-import.mjs --out /Users/adamrussell/Documents/Claude/Projects/life-hub-data --apply
```

Expected: `stillInvalid` ≈ 0 for event paths (templates excluded). `deletedDupes` ≈ 253, `repaired` covering the missing-time / demotion set.

- [ ] **Step 3: Independent verification scan**

From life-hub:

```bash
node --input-type=module <<'EOF'
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { load } from 'js-yaml';
import { parseEventDocument, parseCanonicalPath } from './js/core/records.js';
const root = '/Users/adamrussell/Documents/Claude/Projects/life-hub-data';
let valid = 0, invalid = 0, spaced = 0;
const samples = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.md')) continue;
    const rel = p.slice(root.length + 1);
    if (!rel.startsWith('data/') || rel.includes('/templates/') || rel.includes('library')) continue;
    if (/\s/.test(name)) { spaced++; samples.push(rel); continue; }
    try {
      parseCanonicalPath(rel);
      parseEventDocument(readFileSync(p, 'utf8'), rel, load);
      valid++;
    } catch (e) {
      invalid++;
      if (samples.length < 10) samples.push(`${rel}: ${e.message}`);
    }
  }
}
walk(join(root, 'data'));
console.log(JSON.stringify({ valid, invalid, spaced, samples }, null, 2));
EOF
```

Expected: `spaced: 0`, `invalid: 0`.

- [ ] **Step 4: Idempotence check**

```bash
node scripts/repair-notion-import.mjs --out /Users/adamrussell/Documents/Claude/Projects/life-hub-data --apply
```

Expected: `deletedDupes: 0`, `repaired: 0`.

- [ ] **Step 5: Commit data repo** (only if Adam asked)

In `life-hub-data`:

```bash
git status -sb
git add -A
git commit -m "$(cat <<'EOF'
Repair Notion import schema: times, DST stamps, drop spaced dupes.

EOF
)"
```

Do **not** push unless Adam asks.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Delete identical spaced dupes | Task 2 + 3 + 6 |
| Leave differing/orphan spaced files reported | Task 3 `differingDupes` |
| Default times body 12:00 / workout 07:00 | Task 2 |
| Fix Sydney offsets via shared stamp | Task 1 + 2 + 4 + 5 |
| Demote empty completed strength → planned | Task 2 |
| Importer always emits time + stamp | Task 4 |
| Nutrition never writes spaced slugs | Task 5 |
| dry-run / apply | Task 3 |
| Idempotent second apply | Task 6 |
| Templates out of scope | Task 3 skip |
| Verify 0 invalid event paths | Task 6 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-notion-import-repair.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — run tasks in this session with checkpoints  

Which approach?
