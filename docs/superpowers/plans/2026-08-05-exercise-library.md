# Chadwick Exercise Library (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Notion’s Exercise Library into `data/exercise-library.json`, inject Chadwick prompt highlights, and give Chadwick `search_exercise_library` + `save_exercise_library_entry` tools (Food Library pattern + a minimal tool-result loop for search).

**Architecture:** Chat-direct JSON blob (not client sync). Chadwick-only load. Highlights (~20) in system prompt; in-memory search returns via Anthropic `tool_result` continuation; save upserts the whole JSON file like food library. One-shot CSV import script seeds the private data repo; tests use a small fixture array.

**Tech Stack:** Vanilla ES modules, `node:test`, existing GitHub client / chat SSE patterns.

**Spec:** `docs/superpowers/specs/2026-08-05-exercise-library-design.md`

**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks.

**Baseline:** Run `npm test` before Task 1 (expect green on current `main`).

**Platform note:** Today `log_entry` / `save_food_library_entry` are fire-and-forget side effects with **no** `tool_result` round-trip. Search must return data to the model, so Task 4 adds a **minimal** continuation loop only for tools that opt in (search). Save stays fire-and-forget like food.

---

## File Structure

| File | Responsibility |
|---|---|
| `netlify/functions/_shared/exercise-library.mjs` | Path, parse, validate, upsert, search, highlights, prompt format, tool schemas, CSV row mapping |
| `scripts/import-exercise-library.mjs` | CLI: Notion CSV → JSON file |
| `netlify/functions/_shared/persona.mjs` | Chadwick Exercise Library prompt block |
| `netlify/functions/_shared/anthropic-client.mjs` | Optional `executeTools` callback + tool_result continuation (max rounds) |
| `netlify/functions/chat.mjs` | Load library for Chadwick; register tools; handle save write; wire search executor |
| `js/app/chat-controller.js` | SSE `exercise_library_saved` toast line |
| `tests/unit/exercise-library.test.js` | Core library unit tests |
| `tests/unit/persona.test.js` | Chadwick library prompt assertions |
| `tests/unit/anthropic-client.test.js` | Tool-result continuation (extend existing if present) |
| `tests/integration/chat-function.test.js` | Load / search / save / non-Chadwick gating |
| `docs/IMPLEMENTATION_STATUS.md` | Phase 12 note |

No `repo-policy` / client manifest / `service-worker` / Fitness UI changes.

---

### Task 1: Exercise library core module (TDD)

**Files:**
- Create: `netlify/functions/_shared/exercise-library.mjs`
- Create: `tests/unit/exercise-library.test.js`

- [ ] **Step 1: Write failing unit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_LIBRARY_PATH,
  parseExerciseLibrary,
  validateExerciseLibraryEntry,
  upsertExerciseLibraryEntry,
  searchExerciseLibrary,
  selectExerciseHighlights,
  formatExerciseLibraryForPrompt,
  exerciseLibraryEntryFromCsvRow,
  searchExerciseLibrarySchema,
  saveExerciseLibraryEntrySchema
} from '../../netlify/functions/_shared/exercise-library.mjs';

test('EXERCISE_LIBRARY_PATH is the canonical chat-direct blob', () => {
  assert.equal(EXERCISE_LIBRARY_PATH, 'data/exercise-library.json');
});

test('parseExerciseLibrary tolerates bad JSON and non-arrays', () => {
  assert.deepEqual(parseExerciseLibrary(null), []);
  assert.deepEqual(parseExerciseLibrary('{'), []);
  assert.deepEqual(parseExerciseLibrary('{}'), []);
  assert.deepEqual(parseExerciseLibrary('[{"name":"Bar Press","target_area":"Chest"}]').length, 1);
});

test('validateExerciseLibraryEntry requires name and target_area', () => {
  assert.equal(validateExerciseLibraryEntry({ name: 'X' }), null);
  const ok = validateExerciseLibraryEntry({
    name: ' Bar Press ',
    target_area: 'Chest',
    equipment: 'Crossbar, Fitness Bench',
    focus_areas: ['Mid Chest', 'Front Delts'],
    setup_cues: 'Flat bench.',
    in_rotation: true,
    working_weight_kg: 42,
    default_cable_type: 'concentric',
    default_bench_angle_deg: 0,
    attachment: 'bar',
    last_performed: '2026-07-29'
  });
  assert.equal(ok.name, 'Bar Press');
  assert.deepEqual(ok.equipment, ['Crossbar', 'Fitness Bench']);
  assert.equal(ok.in_rotation, true);
  assert.equal(ok.default_cable_type, 'concentric');
  assert.equal(validateExerciseLibraryEntry({
    name: 'X', target_area: 'Chest', default_cable_type: 'nope'
  }), null);
});

test('upsertExerciseLibraryEntry replaces by case-insensitive name', () => {
  const first = upsertExerciseLibraryEntry([], {
    name: 'Bar Press', target_area: 'Chest'
  }, '2026-08-05T00:00:00+10:00');
  assert.equal(first[0].updated_at, '2026-08-05T00:00:00+10:00');
  const second = upsertExerciseLibraryEntry(first, {
    name: 'bar press', target_area: 'Chest', working_weight_kg: 44
  }, '2026-08-06T00:00:00+10:00');
  assert.equal(second.length, 1);
  assert.equal(second[0].working_weight_kg, 44);
});

test('selectExerciseHighlights prefers in_rotation then last_performed', () => {
  const entries = [
    { name: 'A', target_area: 'Chest', in_rotation: false, last_performed: '2026-07-01' },
    { name: 'B', target_area: 'Legs', in_rotation: true, last_performed: '2026-06-01' },
    { name: 'C', target_area: 'Back', in_rotation: false, last_performed: '2026-07-20' },
    { name: 'D', target_area: 'Arms', in_rotation: false }
  ];
  const highlights = selectExerciseHighlights(entries, 3);
  assert.deepEqual(highlights.map(e => e.name), ['B', 'C', 'A']);
});

test('searchExerciseLibrary ANDs query tokens across fields', () => {
  const entries = [
    { name: 'Bar Press', target_area: 'Chest', equipment: ['Crossbar'], focus_areas: ['Mid Chest'], setup_cues: 'Flat zero degrees', in_rotation: false },
    { name: 'Bar Curl', target_area: 'Arms', equipment: ['Crossbar'], focus_areas: ['Biceps'], in_rotation: true }
  ];
  assert.equal(searchExerciseLibrary(entries, { query: 'bar chest' }).length, 1);
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', in_rotation: true })[0].name, 'Bar Curl');
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', target_area: 'Arms' })[0].name, 'Bar Curl');
  assert.equal(searchExerciseLibrary(entries, { query: 'bar', limit: 1 }).length, 1);
});

test('formatExerciseLibraryForPrompt is compact and omits empty libraries', () => {
  assert.equal(formatExerciseLibraryForPrompt([]), '');
  const text = formatExerciseLibraryForPrompt([
    { name: 'Bar Press', target_area: 'Chest', equipment: ['Crossbar'], working_weight_kg: 42, in_rotation: true }
  ]);
  assert.match(text, /Bar Press/);
  assert.match(text, /Chest/);
  assert.match(text, /42/);
  assert.doesNotMatch(text, /Flat zero/); // cues are for search results, not highlights
});

test('exerciseLibraryEntryFromCsvRow maps Notion columns', () => {
  const entry = exerciseLibraryEntryFromCsvRow({
    Exercise: 'Bar Press',
    'Target area': 'Chest',
    Equipment: 'Crossbar, Fitness Bench',
    'Focus areas': 'Mid Chest, Front Delts',
    'Setup & cues': 'Flat bench.',
    'In rotation': 'Yes',
    'Best weight kg': '42',
    'Current working weight kg': '40',
    'Default reps': '8',
    'Default sets': '2',
    'Last performed': '29 Jul 2026',
    'Movement pattern': '',
    'Demo link': ''
  });
  assert.equal(entry.name, 'Bar Press');
  assert.equal(entry.in_rotation, true);
  assert.equal(entry.last_performed, '2026-07-29');
  assert.deepEqual(entry.equipment, ['Crossbar', 'Fitness Bench']);
  assert.equal(entry.best_weight_kg, 42);
});

test('tool schemas expose the expected names', () => {
  assert.equal(searchExerciseLibrarySchema().name, 'search_exercise_library');
  assert.equal(saveExerciseLibraryEntrySchema().name, 'save_exercise_library_entry');
});
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `node --test tests/unit/exercise-library.test.js`  
Expected: FAIL `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Implement `exercise-library.mjs`**

```js
export const EXERCISE_LIBRARY_PATH = 'data/exercise-library.json';

const CABLE_TYPES = ['constant_force', 'concentric', 'eccentric', 'elastic', 'rowing', 'none'];
const MAX_HIGHLIGHTS = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;

export function parseExerciseLibrary(content) {
  if (typeof content !== 'string') return [];
  let parsed;
  try { parsed = JSON.parse(content); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.name === 'string');
}

export function validateExerciseLibraryEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.name !== 'string' || input.name.trim() === '') return null;
  if (typeof input.target_area !== 'string' || input.target_area.trim() === '') return null;

  const entry = {
    name: input.name.trim(),
    target_area: input.target_area.trim()
  };

  const equipment = normalizeStringList(input.equipment);
  if (equipment) entry.equipment = equipment;
  const focus = normalizeStringList(input.focus_areas);
  if (focus) entry.focus_areas = focus;

  if (typeof input.setup_cues === 'string' && input.setup_cues.trim()) entry.setup_cues = input.setup_cues.trim();
  if (typeof input.attachment === 'string' && input.attachment.trim()) entry.attachment = input.attachment.trim();
  if (typeof input.movement_pattern === 'string' && input.movement_pattern.trim()) {
    entry.movement_pattern = input.movement_pattern.trim();
  }
  if (typeof input.demo_link === 'string' && input.demo_link.trim()) entry.demo_link = input.demo_link.trim();

  if (input.in_rotation != null) {
    if (typeof input.in_rotation !== 'boolean') return null;
    entry.in_rotation = input.in_rotation;
  }

  for (const field of ['default_sets', 'default_reps', 'working_weight_kg', 'best_weight_kg', 'default_bench_angle_deg']) {
    if (input[field] == null) continue;
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field])) return null;
    entry[field] = input[field];
  }

  if (input.default_cable_type != null) {
    if (!CABLE_TYPES.includes(input.default_cable_type)) return null;
    entry.default_cable_type = input.default_cable_type;
  }

  if (input.last_performed != null) {
    if (typeof input.last_performed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.last_performed)) return null;
    entry.last_performed = input.last_performed;
  }

  return entry;
}

export function upsertExerciseLibraryEntry(entries, entry, updatedAt) {
  const list = Array.isArray(entries)
    ? entries.filter(existing => libraryKey(existing) !== libraryKey(entry))
    : [];
  list.push({ ...entry, updated_at: updatedAt });
  return list;
}

export function selectExerciseHighlights(entries, limit = MAX_HIGHLIGHTS) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const rotating = entries.filter(e => e.in_rotation === true);
  const rest = entries
    .filter(e => e.in_rotation !== true)
    .slice()
    .sort((a, b) => compareLastPerformedDesc(a, b));
  const seen = new Set(rotating.map(libraryKey));
  const out = [...rotating];
  for (const entry of rest) {
    if (out.length >= limit) break;
    const key = libraryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.slice(0, limit);
}

export function searchExerciseLibrary(entries, {
  query,
  target_area,
  in_rotation,
  limit = DEFAULT_SEARCH_LIMIT
} = {}) {
  if (!Array.isArray(entries) || typeof query !== 'string' || query.trim() === '') return [];
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const capped = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

  return entries.filter(entry => {
    if (target_area != null && String(entry.target_area).toLowerCase() !== String(target_area).toLowerCase()) {
      return false;
    }
    if (in_rotation != null && Boolean(entry.in_rotation) !== Boolean(in_rotation)) return false;
    const haystack = [
      entry.name,
      entry.target_area,
      ...(entry.equipment ?? []),
      ...(entry.focus_areas ?? []),
      entry.setup_cues ?? ''
    ].join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  }).slice(0, capped);
}

export function formatExerciseLibraryForPrompt(entries) {
  const highlights = selectExerciseHighlights(entries);
  if (highlights.length === 0) return '';
  return highlights.map(entry => {
    const equipment = Array.isArray(entry.equipment) ? entry.equipment.join(', ') : '';
    const weight = typeof entry.working_weight_kg === 'number' ? `${entry.working_weight_kg} kg` : '';
    const rotation = entry.in_rotation ? 'in rotation' : '';
    const bits = [entry.target_area, equipment, weight, rotation].filter(Boolean).join(' · ');
    return `- ${entry.name} — ${bits}`;
  }).join('\n');
}

export function exerciseLibraryEntryFromCsvRow(row) {
  if (!row || typeof row !== 'object') return null;
  const get = (...keys) => {
    for (const key of keys) {
      if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
      const bom = `\ufeff${key}`;
      if (row[bom] != null && String(row[bom]).trim() !== '') return String(row[bom]).trim();
    }
    return '';
  };

  const name = get('Exercise');
  const target = get('Target area');
  if (!name || !target) return null;

  const input = {
    name,
    target_area: target,
    equipment: get('Equipment') || undefined,
    focus_areas: get('Focus areas') || undefined,
    setup_cues: get('Setup & cues') || undefined,
    in_rotation: /^yes$/i.test(get('In rotation')),
    movement_pattern: get('Movement pattern') || undefined,
    demo_link: get('Demo link') || undefined
  };

  const best = Number(get('Best weight kg'));
  if (Number.isFinite(best) && get('Best weight kg') !== '') input.best_weight_kg = best;
  const working = Number(get('Current working weight kg'));
  if (Number.isFinite(working) && get('Current working weight kg') !== '') input.working_weight_kg = working;
  const reps = Number(get('Default reps'));
  if (Number.isFinite(reps) && get('Default reps') !== '') input.default_reps = reps;
  const sets = Number(get('Default sets'));
  if (Number.isFinite(sets) && get('Default sets') !== '') input.default_sets = sets;

  const last = parseNotionDate(get('Last performed'));
  if (last) input.last_performed = last;

  return validateExerciseLibraryEntry(input);
}

export function searchExerciseLibrarySchema() {
  return {
    name: 'search_exercise_library',
    description: 'Search Adam\'s Exercise Library by name, target area, equipment, focus muscles, or setup cues. Use before inventing a move or guessing attachment/cable/bench defaults.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; tokens are ANDed' },
        target_area: { type: 'string' },
        in_rotation: { type: 'boolean' },
        limit: { type: 'number', description: 'Max results (default 10, max 25)' }
      },
      required: ['query']
    }
  };
}

export function saveExerciseLibraryEntrySchema() {
  return {
    name: 'save_exercise_library_entry',
    description: 'Create or update an Exercise Library entry (cues, defaults, rotation, weights). Call after refining a move or adding a new one.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        target_area: { type: 'string' },
        equipment: { type: 'array', items: { type: 'string' } },
        focus_areas: { type: 'array', items: { type: 'string' } },
        setup_cues: { type: 'string' },
        in_rotation: { type: 'boolean' },
        default_sets: { type: 'number' },
        default_reps: { type: 'number' },
        working_weight_kg: { type: 'number' },
        best_weight_kg: { type: 'number' },
        attachment: { type: 'string' },
        default_cable_type: { type: 'string', enum: CABLE_TYPES },
        default_bench_angle_deg: { type: 'number' },
        movement_pattern: { type: 'string' },
        demo_link: { type: 'string' },
        last_performed: { type: 'string', description: 'YYYY-MM-DD' }
      },
      required: ['name', 'target_area']
    }
  };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    const list = value.map(v => String(v).trim()).filter(Boolean);
    return list.length ? list : null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(part => part.trim()).filter(Boolean);
  }
  return null;
}

function libraryKey(entry) {
  return String(entry?.name ?? '').trim().toLowerCase();
}

function compareLastPerformedDesc(a, b) {
  const left = a.last_performed || '';
  const right = b.last_performed || '';
  if (left === right) return libraryKey(a).localeCompare(libraryKey(b));
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}

function parseNotionDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const month = months[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test tests/unit/exercise-library.test.js`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/exercise-library.mjs tests/unit/exercise-library.test.js
git commit -m "$(cat <<'EOF'
feat: add Exercise Library parse, search, and save helpers

EOF
)"
```

---

### Task 2: Import script

**Files:**
- Create: `scripts/import-exercise-library.mjs`

- [ ] **Step 1: Implement CLI importer**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exerciseLibraryEntryFromCsvRow } from '../netlify/functions/_shared/exercise-library.mjs';

const csvPath = process.argv[2];
const outPath = process.argv[3] || 'data/exercise-library.json';
if (!csvPath) {
  console.error('Usage: node scripts/import-exercise-library.mjs <notion.csv> [out.json]');
  process.exit(1);
}

const text = readFileSync(resolve(csvPath), 'utf8');
const rows = parseCsv(text);
const entries = [];
const seen = new Set();
for (const row of rows) {
  const entry = exerciseLibraryEntryFromCsvRow(row);
  if (!entry) continue;
  const key = entry.name.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push(entry);
}

entries.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(resolve(outPath), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
console.log(`Wrote ${entries.length} exercises to ${outPath}`);

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}
```

- [ ] **Step 2: Smoke-run against Notion CSV (optional local; do not commit the full 279-file into Life Hub app repo)**

Run:

```bash
node scripts/import-exercise-library.mjs \
  "$HOME/Downloads/Private & Shared 5/Exercise Library 418f0c52b5a54331a7194ea9eedf8357_all.csv" \
  /tmp/exercise-library.json
```

Expected: `Wrote 279 exercises to /tmp/exercise-library.json` (or close; dedupe may drop exact name dupes).

**Ops note for Adam (not automated):** copy `/tmp/exercise-library.json` into the **private data repo** as `data/exercise-library.json` when ready to use in production. Life Hub tests do not need the full file.

- [ ] **Step 3: Commit**

```bash
git add scripts/import-exercise-library.mjs
git commit -m "$(cat <<'EOF'
feat: add Notion Exercise Library CSV import script

EOF
)"
```

---

### Task 3: Chadwick persona prompt block

**Files:**
- Modify: `netlify/functions/_shared/persona.mjs`
- Modify: `tests/unit/persona.test.js`

- [ ] **Step 1: Add failing persona tests**

```js
test('chadwick prompt includes exercise library highlights when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    exerciseLibrary: '- Bar Press — Chest · Crossbar · 42 kg · in rotation'
  });
  assert.match(prompt, /Exercise Library/);
  assert.match(prompt, /search_exercise_library/);
  assert.match(prompt, /save_exercise_library_entry/);
  assert.match(prompt, /Bar Press/);
});

test('chadwick prompt omits exercise library block when empty', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', exerciseLibrary: '' });
  assert.doesNotMatch(prompt, /Exercise Library highlights/);
});

test('non-chadwick agents never receive exercise library instructions', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    exerciseLibrary: '- Bar Press — Chest'
  });
  assert.doesNotMatch(prompt, /search_exercise_library/);
  assert.doesNotMatch(prompt, /Bar Press/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test tests/unit/persona.test.js`  
Expected: FAIL on new assertions

- [ ] **Step 3: Extend `buildSystemPrompt`**

Add param `exerciseLibrary = ''`.

Inside `chadwickBlocks`, after templates block, add:

```js
exerciseLibrary
  ? `Exercise Library highlights (prefer these names; search before inventing moves or guessing attachment/cable/bench defaults). Call search_exercise_library for more; call save_exercise_library_entry after refining cues/defaults or adding a move. Library defaults inform design — session sets still need per-set cable_type.\n\n${exerciseLibrary}`
  : '',
```

Do **not** put `exerciseLibrary` in the shared (all-agents) block.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test tests/unit/persona.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/persona.mjs tests/unit/persona.test.js
git commit -m "$(cat <<'EOF'
feat: inject Exercise Library highlights into Chadwick prompts

EOF
)"
```

---

### Task 4: Anthropic client tool-result continuation

**Files:**
- Modify: `netlify/functions/_shared/anthropic-client.mjs`
- Create or modify: `tests/unit/anthropic-client.test.js` (extend if it already exists)

**Behavior:**
- `streamMessage` accepts optional `executeTools({ name, id, input }) => Promise<unknown|null>`.
- If a `tool_call` arrives and `executeTools` returns non-null, treat it as needing a result: finish collecting the assistant turn’s tool uses, POST a follow-up message with `tool_result` content blocks, stream the next round (max **3** rounds).
- If `executeTools` returns `null` / is omitted, keep today’s fire-and-forget behavior (yield `tool_call` to caller; no continuation).
- Yield `{ type: 'search_library', query, count }` optional SSE-friendly event when search executes (chat may forward or ignore).

- [ ] **Step 1: Write failing continuation test**

Use a fake `fetchImpl` that:
1. First response streams a `tool_use` for `search_exercise_library` then `message_stop`.
2. Second response streams text `Found Bar Press` then `message_stop`.

Assert `executeTools` was called once and the yielded events include the follow-up text.

Keep the test focused — mirror existing anthropic-client test style if present.

- [ ] **Step 2: Implement minimal continuation**

Sketch (adapt to existing parse helpers):

```js
async *streamMessage({ system, messages, tools, signal, executeTools }) {
  let roundMessages = messages;
  for (let round = 0; round < 3; round++) {
    const pendingResults = [];
    for await (const event of this.#streamOnce({ system, messages: roundMessages, tools, signal })) {
      if (event.type === 'tool_call' && typeof executeTools === 'function') {
        const result = await executeTools(event);
        if (result != null) {
          pendingResults.push({ toolCall: event, result });
          continue; // do not yield raw tool_call for search; chat handles save separately
        }
      }
      yield event;
    }
    if (pendingResults.length === 0) return;

    roundMessages = [
      ...roundMessages,
      {
        role: 'assistant',
        content: pendingResults.map(({ toolCall }) => ({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input
        }))
      },
      {
        role: 'user',
        content: pendingResults.map(({ toolCall, result }) => ({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result)
        }))
      }
    ];
  }
}
```

**Important:** Refactor existing single-request body into `#streamOnce` / inner generator so tests for plain streaming still pass. Fire-and-forget tools (`log_entry`, `save_*`) must still be **yielded** to `chat.mjs` — only tools where `executeTools` returns a value are swallowed from the outer yield and continued.

Recommended contract for chat:

```js
executeTools: async (event) => {
  if (event.name !== 'search_exercise_library') return null;
  return searchExerciseLibrary(exerciseLibraryEntries, event.input ?? {});
}
```

- [ ] **Step 3: Run unit tests — expect PASS**

Run: `node --test tests/unit/anthropic-client.test.js tests/unit/food-library.test.js` (and any existing anthropic tests)

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_shared/anthropic-client.mjs tests/unit/anthropic-client.test.js
git commit -m "$(cat <<'EOF'
feat: continue Anthropic streams after search tool results

EOF
)"
```

---

### Task 5: Wire chat.mjs load / tools / save

**Files:**
- Modify: `netlify/functions/chat.mjs`
- Modify: `tests/integration/chat-function.test.js`
- Modify: `js/app/chat-controller.js`

- [ ] **Step 1: Add integration tests**

```js
test('loads exercise library highlights into Chadwick system prompt', async () => {
  // Tree stub includes data/exercise-library.json blob with 1–2 entries
  // Capture system prompt passed to createAnthropicClient().streamMessage
  // Assert system matches /Exercise Library/ and entry name
});

test('search_exercise_library executeTools path returns matches without GitHub PUT', async () => {
  // Prefer testing via executeTools wiring: either spy on anthropic streamMessage options
  // or simulate tool_call + verify no PUT for search-only turn.
  // Minimum: unit coverage of search already exists; integration asserts tools array
  // includes search_exercise_library + save_exercise_library_entry when slug is chadwick.
});

test('save_exercise_library_entry writes data/exercise-library.json and emits exercise_library_saved', async () => {
  // Mirror food library save test; message triggers Chadwick ("Chadwick, …")
  // Assert PUT path data/exercise-library.json and SSE event
});

test('non-chadwick agents do not register exercise library tools', async () => {
  // Brisket message: capture tools arg — no search_exercise_library / save_exercise_library_entry
});
```

Also add chat-controller handling:

```js
} else if (event.type === 'exercise_library_saved') {
  endTextTurn();
  appendMessage(root, { role: 'assistant', text: `Saved "${event.name}" to the Exercise Library.` });
}
```

- [ ] **Step 2: Implement chat wiring**

Imports from `exercise-library.mjs`.

```js
const needsExerciseLibrary = slug === 'chadwick';
let exerciseLibraryEntries = [];
let exerciseLibrary = '';
let exerciseLibrarySha;

// In tree load (alongside food library):
const exerciseLibraryEntry = needsExerciseLibrary
  ? current.tree.find(entry => entry.path === EXERCISE_LIBRARY_PATH && entry.type === 'blob')
  : null;
exerciseLibrarySha = exerciseLibraryEntry?.sha;
// read blob in Promise.all; parseExerciseLibrary; formatExerciseLibraryForPrompt(entries)

// buildSystemPrompt({ ..., exerciseLibrary })

const tools = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 2 },
  ...(allowedTypes ? [logEntryToolSchema(allowedTypes)] : []),
  ...(needsFoodLibrary ? [foodLibraryEntrySchema()] : []),
  ...(needsExerciseLibrary ? [searchExerciseLibrarySchema(), saveExerciseLibraryEntrySchema()] : [])
];

// streamMessage({
//   ...,
//   executeTools: async (event) => {
//     if (event.name !== 'search_exercise_library') return null;
//     return searchExerciseLibrary(exerciseLibraryEntries, event.input ?? {});
//   }
// })

// Handle save like food:
} else if (event.type === 'tool_call' && event.name === 'save_exercise_library_entry') {
  const entry = validateExerciseLibraryEntry(event.input);
  if (entry) {
    try {
      const updatedAt = getSydneyTimestamp(nowInstant); // or ISO from existing helper
      exerciseLibraryEntries = upsertExerciseLibraryEntry(exerciseLibraryEntries, entry, updatedAt);
      const result = await client.writeFile({
        path: EXERCISE_LIBRARY_PATH,
        content: JSON.stringify(exerciseLibraryEntries, null, 2),
        ...(exerciseLibrarySha ? { sha: exerciseLibrarySha } : {}),
        message: `chore(exercise-library): upsert ${entry.name}`
      });
      exerciseLibrarySha = result.sha;
      send({ type: 'exercise_library_saved', name: entry.name });
    } catch { /* best-effort */ }
  }
}
```

Clear library state in the existing `catch` that clears food library.

- [ ] **Step 3: Run tests**

Run: `npm test`  
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/chat.mjs js/app/chat-controller.js tests/integration/chat-function.test.js
git commit -m "$(cat <<'EOF'
feat: wire Chadwick Exercise Library search and save into chat

EOF
)"
```

---

### Task 6: Status doc + final verification

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Append Phase 12**

Document: Exercise Library JSON; Chadwick highlights + search/save tools; import script; no Fitness UI; no confirm-time library mutation; seed private data repo via import script; tool-result loop for search.

Update “Next Phase” line (research corpus / remaining tabs / etc.).

- [ ] **Step 2: Final verification**

Run: `npm test && npm run test:browser`  
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "$(cat <<'EOF'
docs: record Exercise Library phase status

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `data/exercise-library.json` | Task 1 path + Task 5 load/save |
| Parse / validate / upsert / search / highlights | Task 1 |
| CSV import mapping | Task 1 (`exerciseLibraryEntryFromCsvRow`) + Task 2 script |
| Chadwick-only prompt highlights (~20) | Task 1 select/format + Task 3 persona |
| `search_exercise_library` with results to model | Task 4 continuation + Task 5 executeTools |
| `save_exercise_library_entry` GitHub upsert + SSE | Task 5 + chat-controller |
| No Fitness UI / no confirm mutation | No tasks touch those |
| Not in client sync manifest | Chat-direct only (like food) |
| Local commits only | Every commit step |
| Attachment / cable / bench defaults on entries | Task 1 validate + save schema |

**Placeholder scan:** None intentional — Task 4 continuation must be implemented fully (not stubbed).

**Type consistency:** `EXERCISE_LIBRARY_PATH`, `search_exercise_library`, `save_exercise_library_entry`, `exercise_library_saved`, `in_rotation`, `last_performed`, `default_cable_type` used consistently.

---

## Ops checklist (after merge, manual)

1. Run import script against Notion `_all.csv`.
2. Commit `data/exercise-library.json` in the **private data repo**.
3. Deploy Life Hub only when Adam asks to push.
