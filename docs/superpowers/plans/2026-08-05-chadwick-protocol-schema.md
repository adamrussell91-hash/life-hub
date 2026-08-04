# Chadwick Protocol + Richer Workout Schema (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Chadwick’s editable operating protocol, richer workout YAML (per-set cable type, session extras, inferred `session_kind`), complete-only logging with auto template upsert, and protocol/Central Node injection for Chadwick chat — without Exercise Library (slice 2).

**Architecture:** Approach B — `config/chadwick-protocol.md` loaded into Chadwick system prompts; expand `validate.js` + `chat-schema.mjs`; on workout confirm, best-effort upsert `data/fitness/templates/<slug>.md` then existing Central Node sync; Fitness render shows cable/bench when present.

**Tech Stack:** Vanilla ES modules, `node:test`, Playwright, existing chat confirm / GitHub client patterns (mirror food-library load/write).

**Spec:** `docs/superpowers/specs/2026-08-05-chadwick-protocol-schema-design.md`

**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks.

**Baseline:** Run `npm test` before Task 1 (expect green on current `main`).

---

## File Structure

| File | Responsibility |
|---|---|
| `config/chadwick-protocol.md` | Chadwick operating manual (Life Hub rules, not Notion DB choreography) |
| `netlify.toml` | `included_files` so Netlify functions can read the protocol at runtime |
| `netlify/functions/_shared/load-chadwick-protocol.mjs` | Read protocol from disk; empty string if missing |
| `netlify/functions/_shared/persona.mjs` | Inject protocol + template digest into Chadwick prompts |
| `netlify/functions/chat.mjs` | Load protocol + template list when agent is Chadwick |
| `js/core/validate.js` | Kind-aware workout validation; cable_type; new session fields |
| `netlify/functions/_shared/chat-schema.mjs` | Tool schema properties for rich workouts |
| `netlify/functions/_shared/workout-templates.mjs` | slugify, path, serialize/parse, build-from-session, format-for-prompt |
| `netlify/functions/_shared/repo-policy.mjs` | Allow `data/fitness/templates/*.md` (+ keep existing rules) |
| `netlify/functions/chat-confirm.mjs` | After session write, best-effort template upsert |
| `js/app/render-fitness.js` | Show cable type + bench in hero exercise list |
| `js/app/render-chat.js` | Optional read-only exercises summary on proposal card |
| `tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md` | Rich fields so browser/unit stay valid |
| `tests/unit/*` / `tests/integration/*` | Coverage for schema, protocol, templates, confirm |
| `docs/IMPLEMENTATION_STATUS.md` | Phase note |
| `service-worker.js` | Bump cache if any new client module is imported (likely none for protocol) |

---

### Task 1: Rich workout validation + tool schema (TDD)

**Files:**
- Modify: `js/core/validate.js`
- Modify: `netlify/functions/_shared/chat-schema.mjs`
- Modify: `tests/unit/records.test.js`
- Modify: `tests/unit/chat-schema.test.js` (if workout field assertions exist; else extend)
- Modify: `tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md`

- [ ] **Step 1: Extend failing validation tests in `tests/unit/records.test.js`**

Add constants near the workout tests:

```js
const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const SESSION_KINDS = ['strength', 'walk', 'ep', 'mobility', 'other'];
```

Add tests:

```js
test('completed strength workouts require session_kind, title, and per-set cable_type', () => {
  const base = {
    ...common,
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    status: 'completed',
    recovery_flag_next_day: false,
    exercises: [{
      name: 'Bar Press',
      bench_angle_deg: 0,
      sets: [{ reps: 12, weight_kg: 42, cable_type: 'concentric' }]
    }]
  };
  assert.deepEqual(validateRecord(base), []);

  assert.match(validateRecord({ ...base, title: '' }).join('; '), /title/);
  assert.match(validateRecord({ ...base, session_kind: 'nope' }).join('; '), /session_kind/);
  assert.match(validateRecord({
    ...base,
    exercises: [{ name: 'Bar Press', sets: [{ reps: 12, weight_kg: 42 }] }]
  }).join('; '), /cable_type/);
});

test('completed walk workouts may omit exercises when duration or distance is present', () => {
  const walk = {
    ...common,
    type: 'workout',
    title: 'East Ryde Stroll',
    session_kind: 'walk',
    day_type: 'movement',
    status: 'completed',
    duration_min: 40,
    distance_km: 3.2,
    avg_hr: 118,
    calories_kcal: 180,
    recovery_flag_next_day: false,
    exercises: []
  };
  assert.deepEqual(validateRecord(walk), []);
});

test('legacy workouts without session_kind still validate when allowLegacy is used by parse path only', () => {
  // Keep existing thin fixture shape valid under allowLegacy:true if the project already uses it;
  // for strict validateRecord (default), update the fixture instead (Step 5).
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/records.test.js`  
Expected: FAIL on new assertions (unknown fields ignored today / cable_type not required).

- [ ] **Step 3: Implement validation in `js/core/validate.js`**

Add near top:

```js
const SESSION_KINDS = ['strength', 'walk', 'ep', 'mobility', 'other'];
const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const INTENSIFICATIONS = ['drop_set', 'rest_pause', 'eccentric_overload', 'elastic_finisher', 'superset', 'other'];
```

Replace `validateWorkout` with kind-aware logic:

```js
function validateWorkout(record, errors) {
  requireString(record, 'title', errors); // non-empty for all workouts going forward
  stringArray(record, 'focus', errors);
  finiteNumber(record, 'duration_min', errors);
  finiteNumber(record, 'avg_hr', errors);
  finiteNumber(record, 'calories_kcal', errors);
  finiteNumber(record, 'distance_km', errors);
  enumeration(record, 'day_type', DAY_TYPES, errors, true);
  enumeration(record, 'status', WORKOUT_STATUSES, errors, true);
  enumeration(record, 'session_kind', SESSION_KINDS, errors, true);
  booleanField(record, 'recovery_flag_next_day', errors);

  const kind = record.session_kind;
  const strengthLike = kind === 'strength' || kind == null;

  if (!Array.isArray(record.exercises)) {
    errors.push('exercises must be an array');
  } else if (record.status === 'completed' && strengthLike && record.exercises.length === 0) {
    errors.push('completed strength workout exercises must not be empty');
  } else if (record.status === 'completed' && kind === 'walk' && record.exercises.length === 0) {
    if (record.duration_min == null && record.distance_km == null) {
      errors.push('completed walk workouts need duration_min or distance_km when exercises are empty');
    }
  } else {
    record.exercises.forEach((exercise, exerciseIndex) => {
      const prefix = `exercises[${exerciseIndex}]`;
      if (!isObject(exercise)) {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (typeof exercise.name !== 'string' || exercise.name.trim() === '') {
        errors.push(`${prefix}.name must be a non-empty string`);
      }
      optionalString(exercise, 'equipment', errors);
      finiteNumber(exercise, 'bench_angle_deg', errors, { minimum: 0, maximum: 90 });
      if (exercise.intensification != null) {
        enumeration(exercise, 'intensification', INTENSIFICATIONS, errors);
      }
      if (exercise.sets == null) {
        if (strengthLike && record.status === 'completed') {
          errors.push(`${prefix}.sets must be an array`);
        }
        return;
      }
      if (!Array.isArray(exercise.sets)) {
        errors.push(`${prefix}.sets must be an array`);
        return;
      }
      if (exercise.sets.length === 0 && strengthLike && record.status === 'completed') {
        errors.push(`${prefix}.sets must not be empty`);
      }
      exercise.sets.forEach((set, setIndex) => {
        const setPrefix = `${prefix}.sets[${setIndex}]`;
        if (!isObject(set)) {
          errors.push(`${setPrefix} must be an object`);
          return;
        }
        finiteNumber(set, 'reps', errors, { required: true });
        finiteNumber(set, 'weight_kg', errors, { required: true, minimum: 0 });
        enumeration(set, 'cable_type', CABLE_TYPES, errors, true);
      });
    });
  }

  // pain_flags block unchanged from current file
}
```

Ensure `requireString` exists (or use the same pattern as other validators). If `title` was previously optional, update any tests that relied on missing titles.

- [ ] **Step 4: Update `chat-schema.mjs` DOMAIN_PROPERTIES.workout**

```js
  workout: {
    title: { type: 'string' },
    session_kind: { type: 'string', enum: ['strength', 'walk', 'ep', 'mobility', 'other'] },
    day_type: { type: 'string', enum: ['movement', 'workout_30', 'workout_45_60'] },
    status: { type: 'string', enum: ['planned', 'completed', 'skipped'] },
    duration_min: { type: 'number' },
    avg_hr: { type: 'number' },
    calories_kcal: { type: 'number' },
    distance_km: { type: 'number' },
    focus: { type: 'array', items: { type: 'string' } },
    recovery_flag_next_day: { type: 'boolean' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          bench_angle_deg: { type: 'number' },
          intensification: {
            type: 'string',
            enum: ['drop_set', 'rest_pause', 'eccentric_overload', 'elastic_finisher', 'superset', 'other']
          },
          equipment: { type: 'string' },
          sets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                reps: { type: 'number' },
                weight_kg: { type: 'number' },
                cable_type: {
                  type: 'string',
                  enum: ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none']
                }
              },
              required: ['reps', 'weight_kg', 'cable_type']
            }
          }
        },
        required: ['name']
      }
    },
    pain_flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: { site: { type: 'string' }, note: { type: 'string' } },
        required: ['site']
      }
    }
  },
```

- [ ] **Step 5: Update fixture `2026-07-30-chest-curls.md`**

Add `session_kind: strength` and per-set `cable_type` (and optional bench). Keep title `Chest and Curls`.

- [ ] **Step 6: Fix any cascading unit fixtures** that build thin completed strength workouts without `session_kind` / `cable_type` / `title` (search tests for `type: 'workout'` and `status: 'completed'`).

- [ ] **Step 7: Run tests**

Run: `node --test tests/unit/records.test.js tests/unit/chat-schema.test.js tests/unit/fitness-model.test.js`  
Expected: PASS

- [ ] **Step 8: Commit locally (no push)**

```bash
git add js/core/validate.js netlify/functions/_shared/chat-schema.mjs tests/unit/records.test.js tests/unit/chat-schema.test.js tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md
# plus any other fixtures/tests touched
git commit -m "$(cat <<'EOF'
feat: enrich workout schema with cable type and session kind

EOF
)"
```

---

### Task 2: Chadwick protocol markdown + prompt injection

**Files:**
- Create: `config/chadwick-protocol.md`
- Create: `netlify/functions/_shared/load-chadwick-protocol.mjs`
- Modify: `netlify.toml`
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `netlify/functions/chat.mjs`
- Modify: `tests/unit/persona.test.js`
- Create: `tests/unit/load-chadwick-protocol.test.js`

- [ ] **Step 1: Write `config/chadwick-protocol.md`** (Life Hub version — condensed from Notion; no DB page instructions)

Include these H2 sections with concrete rules (full prose, not stubs):

1. `# Chadwick Flexington — Operating Manual`
2. `## Job` — program + log AEKE K1 training; complete-only Life Hub writes
3. `## Before designing` — read Central Node (Status, Cross-Agent, constraints, Recent Actions); let Brisket/Sara flags shape the plan
4. `## How to write a workout` — 5–9 moves, 2–3 focuses, ≥3 hits/muscle, mandatory 5‑min specific warmup, traditional strength default, 20–30 min window
5. `## Every exercise must state` — name; target sets×reps×weight; **cable_type every set**; bench angle when relevant (0 or 30–90); cues + physique hype in chat (not as invented YAML keys)
6. `## K1 modes` — Constant Force default; Concentric / Eccentric / Elastic / Rowing when to use; signature intensification caps
7. `## Logging protocol` — only propose `log_entry` when session is done; capture actuals, duration, avg_hr, calories_kcal, distance_km; infer `session_kind`; put PB/strength-score commentary in `notes`
8. `## Templates` — title is the template key; first complete creates; later same title overwrites template defaults from full actuals
9. `## Central Node after finish` — Status Exercise + Recent Actions + Chadwick→Brisket Day Type (mandatory)
10. `## Schema gaps` — never invent fields (e.g. elevation); tell Adam it needs a workout-book design later
11. `## Safety` — knees (no burpees/jumps); lower back; AC curl override; EP day-before = movement only
12. `## Voice` — defer to system voice block; never flat “workout logged”

Keep under ~4–6k words so prompts stay healthy.

- [ ] **Step 2: Loader**

Create `netlify/functions/_shared/load-chadwick-protocol.mjs`:

```js
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTOCOL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config/chadwick-protocol.md'
);

export function loadChadwickProtocol({ readFileSyncImpl = readFileSync } = {}) {
  try {
    const text = readFileSyncImpl(PROTOCOL_PATH, 'utf8');
    return typeof text === 'string' ? text.trim() : '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 3: `netlify.toml`**

```toml
[build]
publish = "netlify/public"

[functions]
directory = "netlify/functions"
included_files = ["config/chadwick-protocol.md"]
```

- [ ] **Step 4: Persona injection**

In `buildSystemPrompt`, add parameter `chadwickProtocol = ''` and `workoutTemplates = ''`.

For `slug === 'chadwick'`, append:

```js
chadwickProtocol
  ? `Chadwick operating manual (follow these Life Hub rules; ignore any Notion database mechanics):\n${chadwickProtocol}`
  : '',
workoutTemplates
  ? `Saved workout templates (living prescriptions — use when Adam says do X again):\n${workoutTemplates}`
  : '',
`Design sessions in chat only. Do not propose a workout log_entry until Adam has finished the session and is logging actuals (unless status skipped / no session).`,
`Infer session_kind from what was done. Always include cable_type on every strength set (use none when not on cables). Never invent YAML fields that are not in the log_entry schema; if Adam mentions an unsupported metric, say it needs to be added to the workout book later.`
```

Also strengthen Central Node line already present: when designing, explicitly use Status/Cross-Agent for programming decisions.

- [ ] **Step 5: Wire `chat.mjs`**

```js
import { loadChadwickProtocol } from './_shared/load-chadwick-protocol.mjs';
import { formatTemplatesForPrompt, listTemplateEntries } from './_shared/workout-templates.mjs';
```

After resolving agent slug:

```js
const needsWorkoutTemplates = slug === 'chadwick' || allowedTypes?.includes('workout');
let chadwickProtocol = slug === 'chadwick' ? loadChadwickProtocol() : '';
let workoutTemplates = '';
// When resolving GitHub tree (same try block as food library):
if (needsWorkoutTemplates) {
  const templateBlobs = await loadTemplateSummaries(client, current.tree); // implement in Task 3 helpers
  workoutTemplates = formatTemplatesForPrompt(templateBlobs);
}
const system = buildSystemPrompt({ slug, digest, constraints, centralNodeLog, foodLibrary, chadwickProtocol, workoutTemplates });
```

Note: if Task 3 is not yet merged, temporarily pass `workoutTemplates: ''` and add the load in Task 3 — prefer implementing Task 3 template **format/list helpers** first with empty tree support so this compiles.

- [ ] **Step 6: Tests**

```js
// tests/unit/load-chadwick-protocol.test.js
test('loads the checked-in Chadwick protocol markdown', () => {
  const text = loadChadwickProtocol();
  assert.match(text, /Operating Manual|Logging protocol|Central Node/i);
});

// persona.test.js
test('chadwick prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    chadwickProtocol: '## Logging protocol\nComplete-only writes.'
  });
  assert.match(prompt, /Complete-only writes/);
  assert.match(prompt, /operating manual/i);
});
```

- [ ] **Step 7: Run**

Run: `node --test tests/unit/persona.test.js tests/unit/load-chadwick-protocol.test.js`  
Expected: PASS

- [ ] **Step 8: Commit locally (no push)**

```bash
git add config/chadwick-protocol.md netlify.toml netlify/functions/_shared/load-chadwick-protocol.mjs netlify/functions/_shared/persona.mjs netlify/functions/chat.mjs tests/unit/persona.test.js tests/unit/load-chadwick-protocol.test.js
git commit -m "$(cat <<'EOF'
feat: inject Chadwick operating protocol into chat prompts

EOF
)"
```

---

### Task 3: Workout templates module + confirm upsert

**Files:**
- Create: `netlify/functions/_shared/workout-templates.mjs`
- Create: `tests/unit/workout-templates.test.js`
- Modify: `netlify/functions/_shared/repo-policy.mjs`
- Modify: `tests/unit/repo-policy.test.js`
- Modify: `netlify/functions/chat-confirm.mjs`
- Modify: `tests/integration/chat-confirm-function.test.js`
- Modify: `netlify/functions/chat.mjs` (template list load)

- [ ] **Step 1: Failing unit tests for templates**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyWorkoutTitle,
  templatePathForTitle,
  buildTemplateRecord,
  renderTemplateMarkdown,
  parseTemplateMarkdown,
  formatTemplatesForPrompt
} from '../../netlify/functions/_shared/workout-templates.mjs';

test('slugifyWorkoutTitle lowercases and kebab-cases', () => {
  assert.equal(slugifyWorkoutTitle('Chest and Curls'), 'chest-and-curls');
  assert.equal(slugifyWorkoutTitle('  Sexy Titties!! '), 'sexy-titties');
});

test('buildTemplateRecord copies prescription fields from a completed session', () => {
  const session = {
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    focus: ['chest', 'arms'],
    exercises: [{
      name: 'Bar Press',
      bench_angle_deg: 0,
      sets: [{ reps: 12, weight_kg: 42, cable_type: 'concentric' }]
    }]
  };
  const template = buildTemplateRecord(session, '2026-07-30');
  assert.equal(template.title, 'Chest and Curls');
  assert.equal(template.source_session_date, '2026-07-30');
  assert.equal(template.exercises[0].sets[0].cable_type, 'concentric');
});

test('render/parse template markdown round-trips', () => {
  const template = buildTemplateRecord({
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    focus: ['chest'],
    exercises: [{ name: 'Curl', sets: [{ reps: 10, weight_kg: 12, cable_type: 'constant_force' }] }]
  }, '2026-07-30');
  const md = renderTemplateMarkdown(template);
  const parsed = parseTemplateMarkdown(md);
  assert.equal(parsed.title, 'Chest and Curls');
  assert.equal(parsed.exercises.length, 1);
});

test('formatTemplatesForPrompt lists titles for Chadwick', () => {
  const text = formatTemplatesForPrompt([
    { title: 'Chest and Curls', source_session_date: '2026-07-30', session_kind: 'strength' }
  ]);
  assert.match(text, /Chest and Curls/);
  assert.match(text, /2026-07-30/);
});
```

- [ ] **Step 2: Implement `workout-templates.mjs`**

```js
import { load } from 'js-yaml'; // only if parse needs yaml — prefer JSON frontmatter via same --- pattern as events, parsing with js-yaml like records

export const TEMPLATES_PREFIX = 'data/fitness/templates/';

export function slugifyWorkoutTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workout';
}

export function templatePathForTitle(title) {
  return `${TEMPLATES_PREFIX}${slugifyWorkoutTitle(title)}.md`;
}

export function buildTemplateRecord(session, sourceSessionDate) {
  return {
    schema_version: 1,
    type: 'workout_template',
    title: session.title,
    session_kind: session.session_kind,
    day_type: session.day_type,
    focus: session.focus ?? [],
    source_session_date: sourceSessionDate,
    exercises: (session.exercises ?? []).map(ex => ({
      name: ex.name,
      ...(ex.bench_angle_deg != null ? { bench_angle_deg: ex.bench_angle_deg } : {}),
      ...(ex.intensification != null ? { intensification: ex.intensification } : {}),
      sets: (ex.sets ?? []).map(set => ({
        reps: set.reps,
        weight_kg: set.weight_kg,
        cable_type: set.cable_type
      }))
    }))
  };
}

export function renderTemplateMarkdown(template) {
  const { exercises, ...rest } = template;
  // Use JSON.stringify per key like chat-confirm renderMarkdown, or dump yaml — match confirm style for consistency
  const frontmatter = Object.entries({ ...rest, exercises })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n`;
}

export function parseTemplateMarkdown(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? '').trim());
  if (!match) return null;
  // Parse JSON-per-line frontmatter: safest is to reconstruct YAML-compatible JSON document
  // Implementation: use js-yaml load on match[1] if values are JSON literals — OR parse line by line JSON.parse
  const record = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    record[key] = JSON.parse(raw);
  }
  return record;
}

export function formatTemplatesForPrompt(templates) {
  if (!templates?.length) return '';
  return templates.map(t => (
    `- ${t.title} (${t.session_kind ?? 'unknown'}, last actuals from ${t.source_session_date ?? 'n/a'})`
  )).join('\n');
}

export function isTemplatePath(path) {
  return typeof path === 'string' && path.startsWith(TEMPLATES_PREFIX) && path.endsWith('.md');
}
```

- [ ] **Step 3: Allow template paths in `repo-policy.mjs`**

```js
const TEMPLATE_PATH = /^data\/fitness\/templates\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export function isAllowedRepositoryPath(path) {
  // existing checks...
  if (CONFIG_PATHS.has(path)) return true;
  if (TEMPLATE_PATH.test(path)) return true;
  // existing EVENT_PATH match...
}
```

Update `selectManifestEntries` **not** to include all templates in the date-window client sync by default (templates are not dated events). Confirm/chat load them via direct tree scan. Only `isAllowedRepositoryPath` needs to accept them for `repo-files` if ever requested.

Add repo-policy unit assertions that `data/fitness/templates/chest-and-curls.md` is allowed and `data/fitness/templates/../x.md` is not.

- [ ] **Step 4: Confirm upsert (best-effort)**

In `chat-confirm.mjs` after successful session `writeFile`, before/after CN sync:

```js
try {
  if (validation.record.type === 'workout' && validation.record.status === 'completed') {
    await upsertWorkoutTemplate(client, validation.record);
  }
} catch {
  // best-effort — never fail confirm
}
```

```js
async function upsertWorkoutTemplate(client, record) {
  const path = templatePathForTitle(record.title);
  const template = buildTemplateRecord(record, record.date);
  const content = renderTemplateMarkdown(template);
  const current = await client.resolveTree();
  const existingSha = current.tree.find(item => item.path === path && item.type === 'blob')?.sha;
  await client.writeFile({
    path,
    content,
    ...(existingSha ? { sha: existingSha } : {}),
    message: `chore(fitness-templates): upsert ${record.title}`
  });
}
```

- [ ] **Step 5: Integration test**

Extend workout confirm test (or add sibling): after confirm, assert a PUT URL includes `data/fitness/templates/chest-and-curls.md` and body decodes to include `cable_type`.

Stub tree/blobs like existing central-node test.

- [ ] **Step 6: Chat loads template titles**

In `chat.mjs` tree resolve:

```js
const templateEntries = current.tree.filter(e => e.type === 'blob' && isTemplatePath(e.path));
// read up to e.g. 50 templates; parse; formatTemplatesForPrompt
```

Keep prompt short — titles + dates only (full exercise bodies not required in slice 1; Chadwick can ask to open one later / slice 2 can deepen).

- [ ] **Step 7: Run**

Run: `node --test tests/unit/workout-templates.test.js tests/unit/repo-policy.test.js tests/integration/chat-confirm-function.test.js`  
Expected: PASS

- [ ] **Step 8: Commit locally (no push)**

```bash
git add netlify/functions/_shared/workout-templates.mjs netlify/functions/_shared/repo-policy.mjs netlify/functions/chat-confirm.mjs netlify/functions/chat.mjs tests/unit/workout-templates.test.js tests/unit/repo-policy.test.js tests/integration/chat-confirm-function.test.js
git commit -m "$(cat <<'EOF'
feat: upsert fitness templates on completed workout confirm

EOF
)"
```

---

### Task 4: Fitness render + confirm card summary

**Files:**
- Modify: `js/app/render-fitness.js`
- Modify: `js/app/render-chat.js`
- Modify: `tests/unit/render-chat.test.js` (if present; else light browser coverage)
- Modify: `tests/browser/fitness.spec.mjs` (assert cable text visible if fixture includes it)

- [ ] **Step 1: Fitness hero exercise lines**

In `renderHero`, format each set as:

```js
const cable = set.cable_type ? ` · ${String(set.cable_type).replaceAll('_', ' ')}` : '';
const weight = set.weight_kg != null ? `${set.weight_kg} kg` : 'BW';
return `${weight} × ${reps}${cable}`;
```

If `exercise.bench_angle_deg != null`, append to the exercise title line: ` @ ${exercise.bench_angle_deg}°`.

- [ ] **Step 2: Confirm card read-only summary**

In `render-chat.js` `renderRecordProposal`, after flat fields, if `record.exercises` is a non-empty array, append a `<pre>` or `<ul>` built with `createElement` + `textContent` only summarizing name + sets (no inputs). Do not attempt nested editors.

- [ ] **Step 3: Browser assertion**

In fitness browser spec, after opening Fitness:

```js
assert.match(await page.locator('#fitness-exercise-list').textContent(), /kg/i);
// If fixture has cable_type:
assert.match(await page.locator('#fitness-exercise-list').textContent(), /constant force|concentric|eccentric|elastic|rowing|none/i);
```

- [ ] **Step 4: Run**

Run: `npm test && npm run test:browser`  
Expected: PASS

- [ ] **Step 5: Commit locally (no push)**

```bash
git add js/app/render-fitness.js js/app/render-chat.js tests/browser/fitness.spec.mjs tests/unit/render-chat.test.js
git commit -m "$(cat <<'EOF'
feat: show cable type and bench details in Fitness and chat proposals

EOF
)"
```

---

### Task 5: Status doc + cache bump if needed

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`
- Modify: `service-worker.js` only if new client-side modules were added (none expected beyond edits to existing files — bump to `v20` if `render-fitness`/`render-chat` changed meaningfully so clients refresh)

- [ ] **Step 1: Append Phase 11 note**

Document: Chadwick protocol doc; rich workout schema; templates on confirm; complete-only logging; CN read/write policy; slice 2 = Exercise Library.

- [ ] **Step 2: Bump SW to `life-hub-shell-v20`** if any shell-cached JS changed.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run test:browser`  
Expected: all PASS

- [ ] **Step 4: Commit locally (no push)**

```bash
git add docs/IMPLEMENTATION_STATUS.md service-worker.js
git commit -m "$(cat <<'EOF'
docs: record Chadwick protocol schema phase status

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Protocol markdown + inject for Chadwick | Task 2 |
| Rich schema: cable per set, bench, HR/calories/distance, session_kind | Task 1 |
| Kind-aware walk vs strength validation | Task 1 |
| Complete-only (prompt rules; no planned write path added) | Task 2 |
| Template create/overwrite on completed confirm | Task 3 |
| CN Status + Recent Actions + Day Type (already present; keep) | Task 3 (no regression) |
| Schema gap behaviour (prompt) | Task 2 |
| Fitness shows cable/bench | Task 4 |
| Confirm card read-only exercise summary | Task 4 |
| No library / research / nightly plan | Out of scope |
| Local commits only | Every commit step |

**Placeholder scan:** Protocol file contents are specified by section list — implementer must write real prose in Task 2 Step 1 (not “TBD”). Template parse uses JSON-per-line frontmatter matching confirm writer.

**Type consistency:** `cable_type`, `session_kind`, `calories_kcal`, `avg_hr`, `distance_km`, `bench_angle_deg`, `TEMPLATES_PREFIX` used consistently across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-chadwick-protocol-schema.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
