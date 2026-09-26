# Calendar comms · Plan 1: Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the groundwork the Calendar comms pages stand on:
- the Tasks block engine is usable from Professional
- the shared calendar filter knows Comms, Events and Promises, and draws round dots
- the People ledger becomes the promise store (due dates plus a due-range query)
- the stuck "Retry incomplete Task link" button is replaced by quiet automatic retries

**Architecture:** No new stores and no files move.
- Professional gets a Vite resolver so it can import `apps/tasks/src` as it is. TypeScript sees a small typed facade.
- The calendar change lives in the shared kit module `calendar-filter.js`, so every hub gets it.
- The ledger schema goes to v2 and still reads v1.
- A small `createAutoRetry` helper drives the existing retry endpoints with backoff.

**Tech Stack:** plain ES modules on Netlify Functions (`node --test`); Professional SPA in TypeScript + Vite 7 + Vitest 3 (happy-dom); shared calendar kit in `packages/design-kit`.

**Spec:** `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`. This plan covers spec sections 1 (the sources and dots), 2 (the engine import only), 4 and 7.

**Later plans on this branch:**
- Plan 2: calendar Due row, pins and redirects; the comm page; threads and the case page. Plan 3: meetings, events and PD.
- Plan 4: Clare actions and the phone.
- Plan 5: the Notion import.

**Where to run things:** the repo root, unless a step says `apps/professional`. Branch: `claude/calendar-comms`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/professional/vite.config.ts` | Modify | Resolve `@/` by importer, so Tasks files resolve inside `apps/tasks/src`; add the `@tasks/` alias |
| `apps/professional/tsconfig.json` | Modify | Map `@tasks/*` to the typed facade |
| `apps/professional/src/types/tasks-engine.d.ts` | Create | Types for the Tasks exports Professional uses |
| `apps/professional/tests/unit/tasks-engine-import.test.ts` | Create | Proves the engine mounts in Professional |
| `packages/design-kit/js/calendar/calendar-filter.js` | Modify | New chips, hub defaults, item → chip mapping |
| `tests/unit/calendar-filter.test.js` | Modify | Tests for the above |
| `netlify/functions/_shared/schedule-projection.mjs` | Modify | Carry `event_type` on event projections |
| `packages/design-kit/js/calendar/professional-calendar.js` | Modify | Carry `event_type` into calendar rows |
| `tests/unit/professional-calendar.test.js` | Modify | Test for the above |
| `packages/design-kit/calendar-tideline.css`, `docs/proposals/calendar-reference/src/tideline.template.html`, `docs/proposals/calendar-reference/VISUAL-SPEC.md` | Modify | Round source dots |
| `netlify/functions/_shared/ledger-schema.mjs` | Modify | v2: `due`, `checked_in_ref`, `parseDueRangeQuery` |
| `netlify/functions/_shared/ledger-repository.mjs` | Modify | Write v2 records; `listDueBetween` |
| `netlify/functions/people-ledger.mjs` | Modify | `GET ?due_from=&due_to=` |
| `tests/unit/ledger-promises.test.js` | Create | Ledger v2 tests |
| `apps/professional/src/lib/auto-retry.ts` | Create | Backoff loop with linking / linked / stuck states |
| `apps/professional/tests/unit/auto-retry.test.ts` | Create | Tests for the above |
| `apps/professional/src/components/schedule-relationships.ts` | Modify | Remove the retry button; auto-retry with a state line |
| `apps/professional/src/views/events.ts` | Modify | Drop the "Retry the existing link" message |
| `apps/professional/src/views/communications.ts` | Modify | Follow-up auto-retries instead of a Retry button |
| `apps/professional/tests/unit/task-link-auto-retry.test.ts` | Create | Panel behaviour tests |

---

### Task 1: Tasks block engine importable from Professional

**Files:**
- Modify: `apps/professional/vite.config.ts`
- Modify: `apps/professional/tsconfig.json`
- Create: `apps/professional/src/types/tasks-engine.d.ts`
- Test: `apps/professional/tests/unit/tasks-engine-import.test.ts`

Why this is needed: files under `apps/tasks/src` import each other as `@/blocks/...`. In Professional, the `@` alias points at `apps/professional/src`, so a plain import of a Tasks file breaks. The fix is to resolve `@/` by *who is importing*.

- [ ] **Step 1: Write the failing test**

`apps/professional/tests/unit/tasks-engine-import.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mountBlockInsert } from '@tasks/views/block-insert';

describe('Tasks block engine inside Professional', () => {
  it('mounts the round + and opens the block palette', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const inserted: string[] = [];
    const handle = mountBlockInsert(host, { onInsert: (type) => inserted.push(type) });

    const plus = host.querySelector<HTMLButtonElement>('.page-editor__add-btn');
    expect(plus?.getAttribute('aria-label')).toBe('Add a block');
    plus!.click();

    const menu = host.querySelector('.page-editor__insert');
    expect(menu).not.toBeNull();
    const text = menu!.querySelector<HTMLButtonElement>('[data-block-type="rich_text"]');
    expect(text).not.toBeNull();
    text!.click();
    expect(inserted).toEqual(['rich_text']);
    expect(host.querySelector('.page-editor__insert')).toBeNull();
    handle.dispose();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/tasks-engine-import.test.ts`
Expected: FAIL. You'll see a resolve error for `@tasks/views/block-insert`.

- [ ] **Step 3: Replace the `@` alias with an importer-aware resolver**

In `apps/professional/vite.config.ts`, add this below `const __dirname = ...`:

```ts
const PRO_SRC = path.resolve(__dirname, 'src');
const TASKS_SRC = path.resolve(__dirname, '../tasks/src');

/**
 * `@/x` means "this app's src". Tasks files imported into Professional keep
 * resolving `@/x` inside apps/tasks/src, so the Tasks block engine is used
 * as it is, with no copy.
 */
function importerAwareAtAlias(): Plugin {
  return {
    name: 'professional-importer-aware-at-alias',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.startsWith('@/')) return null;
      const fromTasks = Boolean(importer) && path.normalize(importer!).startsWith(TASKS_SRC + path.sep);
      const root = fromTasks ? TASKS_SRC : PRO_SRC;
      return this.resolve(path.join(root, source.slice(2)), importer, { ...options, skipSelf: true });
    }
  };
}
```

Then change the config block to this:

```ts
  resolve: { alias: { '@tasks': TASKS_SRC } },
  plugins: [importerAwareAtAlias(), mockApiPlugin()],
```

The old `'@': path.resolve(__dirname, 'src')` alias is removed. The plugin now handles `@/` for both apps.

- [ ] **Step 4: Check Tasks has no other aliases to mirror**

Run: `grep -n "alias" apps/tasks/vite.config.ts`
Expected: only `alias: { '@': path.resolve(__dirname, 'src') }`. If a second alias appears, add the same key to Professional's `resolve.alias`, pointing at the same absolute folder.

- [ ] **Step 5: Add the TypeScript facade**

`apps/professional/src/types/tasks-engine.d.ts`:

```ts
/**
 * Types for the Tasks block engine modules Professional imports through
 * `@tasks/*`. Vite resolves these to apps/tasks/src (see vite.config.ts).
 * TypeScript reads this file instead, so Professional's typecheck never walks
 * Tasks' own `@/` imports. Add an export here when Professional needs one.
 */
export type InsertMenuValue = string;

export type BlockInsertHandle = {
  open(): void;
  close(): void;
  dispose(): void;
};

export function mountBlockInsert(
  host: HTMLElement,
  options: { onInsert: (type: InsertMenuValue) => void }
): BlockInsertHandle;
```

In `apps/professional/tsconfig.json`, change `"paths"` to this:

```json
    "paths": { "@/*": ["src/*"], "@tasks/*": ["src/types/tasks-engine.d.ts"] }
```

- [ ] **Step 6: Run the test and the typecheck, and confirm both pass**

Run: `cd apps/professional && npx vitest run tests/unit/tasks-engine-import.test.ts && npx tsc --noEmit`
Expected: 1 test passed, and tsc exits 0 with no output.

- [ ] **Step 7: Run the whole Professional suite (the alias change touches every import)**

Run: `cd apps/professional && npx vitest run`
Expected: every test passes, with the same count as before plus 1.

- [ ] **Step 8: Commit**

```bash
git add apps/professional/vite.config.ts apps/professional/tsconfig.json apps/professional/src/types/tasks-engine.d.ts apps/professional/tests/unit/tasks-engine-import.test.ts
git commit -m "feat(professional): import the Tasks block engine as it is

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Calendar filter knows Comms, Events and Promises

**Files:**
- Modify: `packages/design-kit/js/calendar/calendar-filter.js:6-33` (`FILTER_CHIPS`, `defaultFilterForHub`) and `:70-88` (`filterKeyForItem`)
- Test: `tests/unit/calendar-filter.test.js`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/calendar-filter.test.js`; `FILTER_CHIPS` must be added to that file's import list)

```js
import { FILTER_CHIPS } from '../../packages/design-kit/js/calendar/calendar-filter.js';

test('chips include Comms, Events and Promises for every hub', () => {
  const ids = FILTER_CHIPS.map((chip) => chip.id);
  assert.deepEqual(ids, [
    'classes', 'comms', 'meetings', 'events', 'pd', 'promises', 'tasks', 'health', 'fitness', 'corey'
  ]);
  for (const id of ['comms', 'events', 'promises']) {
    assert.equal(FILTER_CHIPS.find((chip) => chip.id === id).group, 'shared');
  }
});

test('hub defaults: Teaching, Professional and Tasks start with their comms-era chips on', () => {
  const on = (hub) => Object.entries(defaultFilterForHub(hub)).filter(([, v]) => v).map(([k]) => k).sort();
  assert.deepEqual(on('teaching'), ['classes', 'comms', 'promises']);
  assert.deepEqual(on('professional'), ['comms', 'events', 'meetings', 'pd', 'promises']);
  assert.deepEqual(on('tasks'), ['promises', 'tasks']);
  assert.equal(on('life').length, FILTER_CHIPS.length);
});

test('filterKeyForItem maps comms, promises and non-PD events', () => {
  assert.equal(filterKeyForItem({ source: 'professional_communication' }), 'comms');
  assert.equal(filterKeyForItem({ kind: 'comm' }), 'comms');
  assert.equal(filterKeyForItem({ source: 'ledger_item' }), 'promises');
  assert.equal(filterKeyForItem({ kind: 'promise' }), 'promises');
  assert.equal(
    filterKeyForItem({ record: { type: 'professional_event', event_type: 'ceremony' } }),
    'events'
  );
  assert.equal(
    filterKeyForItem({ record: { type: 'professional_event', event_type: 'professional_development' } }),
    'pd'
  );
  // Old projections without event_type stay PD, as today.
  assert.equal(filterKeyForItem({ kind: 'professional', source: 'professional_event' }), 'pd');
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/calendar-filter.test.js`
Expected: FAIL. The ids list lacks `comms`, the Teaching defaults are `['classes']`, and `comms` comes back as `null`.

- [ ] **Step 3: Update chips and defaults**

In `calendar-filter.js`, replace the `FILTER_CHIPS` array and `defaultFilterForHub` with this:

```js
export const FILTER_CHIPS = Object.freeze([
  Object.freeze({ id: 'classes', label: 'Classes', group: 'teaching' }),
  Object.freeze({ id: 'comms', label: 'Comms', group: 'shared' }),
  Object.freeze({ id: 'meetings', label: 'Meetings', group: 'professional' }),
  Object.freeze({ id: 'events', label: 'Events', group: 'shared' }),
  Object.freeze({ id: 'pd', label: 'PD', group: 'professional' }),
  Object.freeze({ id: 'promises', label: 'Promises', group: 'shared' }),
  Object.freeze({ id: 'tasks', label: 'Tasks', group: 'tasks' }),
  Object.freeze({ id: 'health', label: 'Health', group: 'life' }),
  Object.freeze({ id: 'fitness', label: 'Fitness', group: 'life' }),
  Object.freeze({ id: 'corey', label: 'Corey', group: 'life' })
]);

const ALL_IDS = FILTER_CHIPS.map((chip) => chip.id);

const HUB_DEFAULTS = Object.freeze({
  teaching: ['classes', 'comms', 'promises'],
  professional: ['comms', 'meetings', 'events', 'pd', 'promises'],
  tasks: ['tasks', 'promises']
});

/** @param {string} hub */
export function defaultFilterForHub(hub = 'life') {
  const onIds = HUB_DEFAULTS[hub] ?? ALL_IDS;
  return Object.fromEntries(ALL_IDS.map((id) => [id, onIds.includes(id)]));
}
```

- [ ] **Step 4: Update `filterKeyForItem`**

Replace the professional line and add the two new mappings just before it. The function body becomes this:

```js
export function filterKeyForItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.filterKey && ALL_IDS.includes(item.filterKey)) return item.filterKey;
  const kind = item.kind || item.chip?.kind;
  const source = item.source || item.type || item.record?.type || item.chip?.source;
  const isClass = item.isClass === true || item.chip?.isClass === true || source === 'scheduled_lesson';
  if (kind === 'teaching' || source === 'scheduled_lesson' || isClass) {
    return isClass || source === 'scheduled_lesson' ? 'classes' : 'events';
  }
  if (kind === 'comm' || source === 'professional_communication') return 'comms';
  if (kind === 'promise' || source === 'ledger_item') return 'promises';
  if (kind === 'professional' || source === 'professional_meeting' || source === 'professional_event') {
    if (source === 'professional_meeting') return 'meetings';
    const eventType = item.event_type ?? item.record?.event_type ?? item.chip?.event_type ?? null;
    return eventType && eventType !== 'professional_development' ? 'events' : 'pd';
  }
  if (kind === 'task' || source === 'task' || source === 'work_block' || source === 'deadline') return 'tasks';
  if (kind === 'health' || source === 'medical') return 'health';
  if (kind === 'fitness' || source === 'workout') return 'fitness';
  if (kind === 'corey') return 'corey';
  if (item.ghost && item.chip) return filterKeyForItem(item.chip);
  return null;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/calendar-filter.test.js`
Expected: all tests pass, old ones included. (Teaching `events` is still `false`, as the first test expects.)

- [ ] **Step 6: Check nothing else hard-codes the chip list**

Run: `grep -rn "'corey'\]\|chips.length\|FILTER_CHIPS.length" packages apps tests --include=*.js --include=*.ts --include=*.mjs | grep -v node_modules`
Expected: only the new test. If a browser spec asserts a chip count of 8, update it to 10.

- [ ] **Step 7: Commit**

```bash
git add packages/design-kit/js/calendar/calendar-filter.js tests/unit/calendar-filter.test.js
git commit -m "feat(calendar): Comms, Events and Promises chips for every hub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Event projections carry `event_type`

A non-PD event (for example the medal ceremony) must land on the Events chip, not the PD chip. Task 2 reads `event_type`, and this task supplies it.

**Files:**
- Modify: `netlify/functions/_shared/schedule-projection.mjs:61-75` and the record block in `lifeCalendarEventFromProjection` (around line 135)
- Modify: `packages/design-kit/js/calendar/professional-calendar.js` (the `record: { ... }` block in `lifeEventFromProjection`)
- Test: `tests/unit/professional-calendar.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/unit/professional-calendar.test.js`, adding these imports if they're missing)

```js
import { projectEventSchedule } from '../../netlify/functions/_shared/schedule-projection.mjs';
import { professionalEventsFromProjections } from '../../packages/design-kit/js/calendar/professional-calendar.js';
import { filterKeyForItem } from '../../packages/design-kit/js/calendar/calendar-filter.js';

test('non-PD events project event_type and filter to Events', () => {
  const projection = projectEventSchedule({
    id: 'event_00000000-0000-4000-8000-000000000001',
    title: 'HALT medal ceremony',
    event_type: 'ceremony',
    start: '2026-09-25T08:00:00.000Z',
    end: '2026-09-25T09:45:00.000Z',
    time_zone: 'Australia/Sydney',
    all_day: false,
    occurrence_state: 'completed'
  });
  assert.equal(projection.event_type, 'ceremony');
  const [row] = professionalEventsFromProjections([projection]);
  assert.equal(row.record.event_type, 'ceremony');
  assert.equal(filterKeyForItem(row), 'events');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/professional-calendar.test.js`
Expected: FAIL, because `projection.event_type` is `undefined`.

If the event id pattern is rejected, check it with `grep -n "EVENT_ID_PATTERN" netlify/functions/_shared/event-schema.mjs` and use a matching id. `projectEventSchedule` itself doesn't validate ids.

- [ ] **Step 3: Add `event_type` in both places**

In `schedule-projection.mjs` `projectEventSchedule`, add this after `status: record.occurrence_state,`:

```js
    event_type: typeof record.event_type === 'string' ? record.event_type : null,
```

In the same file, in `lifeCalendarEventFromProjection`, add this to the returned `record: { ... }` object:

```js
      event_type: projection.event_type ?? null,
```

In `professional-calendar.js` `lifeEventFromProjection`, add the same line to its `record: { ... }` object:

```js
      event_type: projection.event_type ?? null,
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/professional-calendar.test.js tests/unit/calendar-filter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/schedule-projection.mjs packages/design-kit/js/calendar/professional-calendar.js tests/unit/professional-calendar.test.js
git commit -m "feat(calendar): non-PD events filter to Events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Round source dots (a change to the locked contract)

**Files:**
- Modify: `packages/design-kit/calendar-tideline.css:58`
- Modify: `docs/proposals/calendar-reference/src/tideline.template.html:75`
- Modify: `docs/proposals/calendar-reference/VISUAL-SPEC.md:50`

- [ ] **Step 1: Change the marker radius in both CSS sources**

In `calendar-tideline.css`, change line 58 to this:

```css
.cal-src i{width:8px;height:8px;border-radius:50%;background:var(--k-stripe);flex:none;box-sizing:border-box}
```

In `tideline.template.html`, change line 75 to this:

```css
.cal-src i{width:8px;height:8px;border-radius:50%;background:var(--k-stripe)}
```

- [ ] **Step 2: Update the contract text**

In `VISUAL-SPEC.md`, change the Sources row to this:

```markdown
| Sources | Pills 12px/500, 8px round dot in the source stripe colour (changed 26/09/26 for Comms: see `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`). Corey uses the two-ring mark and peach ink. Ambient pill: dashed border, muted, counts of logs (never records). |
```

- [ ] **Step 3: Rebuild the reference and run the visual spec**

Run: `node docs/proposals/calendar-reference/src/build-ref.mjs && npm run build && TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`
Expected: PASS. If a golden-image comparison fails only on the source pills row, regenerate the goldens the way that spec's header comment describes. Then check `docs/proposals/calendar-reference/compare.html`: the pairs should differ only in the dots.

- [ ] **Step 4: Commit**

```bash
git add packages/design-kit/calendar-tideline.css docs/proposals/calendar-reference
git commit -m "feat(calendar): round source dots across every hub calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ledger v2 — promises get a due date and a check-in

**Files:**
- Modify: `netlify/functions/_shared/ledger-schema.mjs`
- Modify: `netlify/functions/_shared/ledger-repository.mjs` (`createItem` record literal)
- Test: `tests/unit/ledger-promises.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/unit/ledger-promises.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_SCHEMA_VERSION,
  isValidDueDate,
  parseDueRangeQuery,
  parseLedgerItemRecord,
  projectLedgerItem,
  validateLedgerItemCreateInput,
  validateLedgerItemPatchInput
} from '../../netlify/functions/_shared/ledger-schema.mjs';
import { createLedgerItemRepository } from '../../netlify/functions/_shared/ledger-repository.mjs';

const PERSON = 'shared:person:person_denielle';
const COMM = 'professional:communication:communication_00000000-0000-4000-8000-000000000001';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

const v1Record = {
  schema_version: 1,
  id: 'ledger_00000000-0000-4000-8000-000000000001',
  person_ref: PERSON,
  direction: 'you_owe',
  text: 'Email the summary',
  sources: [],
  task_ref: null,
  comm_ref: null,
  author: 'adam',
  status: 'open',
  source_key: 'abc',
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z'
};

test('schema version is 2 and v1 records still parse with due and checked_in_ref as null', () => {
  assert.equal(LEDGER_SCHEMA_VERSION, 2);
  const parsed = parseLedgerItemRecord(v1Record);
  assert.equal(parsed.due, null);
  assert.equal(parsed.checked_in_ref, null);
  assert.equal(projectLedgerItem(parsed).due, null);
});

test('v2 records keep due and checked_in_ref; bad due is rejected', () => {
  const v2 = { ...v1Record, schema_version: 2, due: '2026-09-22', checked_in_ref: COMM };
  assert.equal(parseLedgerItemRecord(v2).due, '2026-09-22');
  assert.equal(parseLedgerItemRecord({ ...v2, due: '22/09/2026' }), null);
  assert.equal(parseLedgerItemRecord({ ...v2, due: '2026-02-30' }), null);
});

test('isValidDueDate accepts real calendar dates only', () => {
  assert.equal(isValidDueDate('2026-10-13'), true);
  assert.equal(isValidDueDate('2026-02-29'), false);
  assert.equal(isValidDueDate(''), false);
  assert.equal(isValidDueDate(null), false);
});

test('create and patch accept due; patch accepts checked_in_ref', () => {
  const created = validateLedgerItemCreateInput({
    person_ref: PERSON, direction: 'you_owe', text: 'Email the summary', author: 'adam', comm_ref: COMM, due: '2026-09-22'
  });
  assert.equal(created.due, '2026-09-22');
  assert.throws(
    () => validateLedgerItemCreateInput({ person_ref: PERSON, direction: 'you_owe', text: 'x', due: 'soon' }),
    { code: 'invalid_due' }
  );
  const patch = validateLedgerItemPatchInput({ due: null, checked_in_ref: COMM, status: 'done' });
  assert.deepEqual(patch, { due: null, checked_in_ref: COMM, status: 'done' });
});

test('parseDueRangeQuery reads due_from/due_to and rejects bad ranges', () => {
  assert.deepEqual(parseDueRangeQuery(new URLSearchParams('due_from=2026-09-21&due_to=2026-09-27')), {
    from: '2026-09-21', to: '2026-09-27'
  });
  assert.deepEqual(parseDueRangeQuery(new URLSearchParams('due_from=2026-09-21')), {
    from: '2026-09-21', to: '2026-09-21'
  });
  assert.throws(() => parseDueRangeQuery(new URLSearchParams('due_from=2026-09-27&due_to=2026-09-21')), {
    code: 'invalid_due_range'
  });
});

test('repository writes v2 records with due', async () => {
  const store = memoryStore();
  let n = 0;
  const repo = createLedgerItemRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => `ledger_00000000-0000-4000-8000-00000000000${++n}`
  });
  const { item } = await repo.createItem({
    person_ref: PERSON, direction: 'you_owe', text: 'Email the summary', author: 'adam', comm_ref: COMM, due: '2026-09-22'
  });
  assert.equal(item.due, '2026-09-22');
  const stored = store._map.get(`ledger-items/records/${item.id}`);
  assert.equal(stored.schema_version, 2);
  assert.equal(stored.checked_in_ref, null);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/ledger-promises.test.js`
Expected: FAIL. `isValidDueDate` is not exported, and `LEDGER_SCHEMA_VERSION` is 1.

- [ ] **Step 3: Implement the schema changes in `ledger-schema.mjs`**

Change the version constant and add the date helpers under `isIsoTimestamp`:

```js
export const LEDGER_SCHEMA_VERSION = 2;
const READABLE_SCHEMA_VERSIONS = new Set([1, 2]);

/** YYYY-MM-DD that names a real calendar day. */
export function isValidDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function readDue(value, code = 'invalid_due') {
  if (value === undefined || value === null) return null;
  if (!isValidDueDate(value)) throw validationError(code, 'due must be a YYYY-MM-DD date.');
  return value;
}

export function parseDueRangeQuery(params) {
  const from = params.get('due_from');
  const to = params.get('due_to') ?? from;
  if (!isValidDueDate(from) || !isValidDueDate(to)) {
    throw validationError('invalid_due_range', 'due_from and due_to must be YYYY-MM-DD dates.');
  }
  if (to < from) throw validationError('invalid_due_range', 'due_to must not be before due_from.');
  return { from, to };
}
```

Add `'due'` and `'checked_in_ref'` to `STORED_KEYS`.

In `parseLedgerItemRecord`, replace the version check and the final `return`:

```js
  if (!READABLE_SCHEMA_VERSIONS.has(raw.schema_version)) return null;
```

```js
  const due = raw.due ?? null;
  if (due !== null && !isValidDueDate(due)) return null;
  const checked_in_ref = raw.checked_in_ref ?? null;
  if (checked_in_ref !== null && (typeof checked_in_ref !== 'string' || !parseEntityRef(checked_in_ref))) return null;
  return { ...raw, due, checked_in_ref, sources: parseSources(raw.sources) };
```

In `validateLedgerItemCreateInput`, add `const due = readDue(input.due);` next to `const sources = ...`, and add `due,` to the returned object after `comm_ref,`.

In `validateLedgerItemPatchInput`, add these before `return patch;`:

```js
  if (input.due !== undefined) patch.due = readDue(input.due);
  if (input.checked_in_ref !== undefined) {
    if (input.checked_in_ref !== null && !parseEntityRef(input.checked_in_ref)) {
      throw validationError('invalid_checked_in_ref', 'checked_in_ref must be a well-formed entity reference.');
    }
    patch.checked_in_ref = input.checked_in_ref;
  }
```

In `projectLedgerItem`, add these after `comm_ref: record.comm_ref,`:

```js
    due: record.due ?? null,
    checked_in_ref: record.checked_in_ref ?? null,
```

- [ ] **Step 4: Write v2 records in `ledger-repository.mjs`**

In `createItem`'s `record` literal, add these after `comm_ref: validated.comm_ref,`:

```js
      due: validated.due ?? null,
      checked_in_ref: null,
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/ledger-promises.test.js tests/unit/people-redesign-phases-2-4.test.js`
Expected: PASS. The People ledger tests stay green.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/ledger-schema.mjs netlify/functions/_shared/ledger-repository.mjs tests/unit/ledger-promises.test.js
git commit -m "feat(ledger): v2 promises with due dates and check-ins

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `listDueBetween` for the calendar Due row

**Files:**
- Modify: `netlify/functions/_shared/ledger-repository.mjs`
- Test: `tests/unit/ledger-promises.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
test('listDueBetween returns open items due in range, ordered by due date', async () => {
  const store = memoryStore();
  let n = 0;
  const repo = createLedgerItemRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => `ledger_00000000-0000-4000-8000-00000000001${++n}`
  });
  const make = (text, due, person = PERSON) =>
    repo.createItem({ person_ref: person, direction: 'you_owe', text, author: 'adam', due });
  await make('Thursday thing', '2026-09-24');
  await make('Monday thing', '2026-09-21');
  await make('Next week', '2026-09-29');
  await make('No date', undefined);
  const { item: done } = await make('Already done', '2026-09-22', 'shared:person:person_amy');
  await repo.patchItem(done.id, { status: 'done' });

  const items = await repo.listDueBetween('2026-09-21', '2026-09-27');
  assert.deepEqual(items.map((item) => item.text), ['Monday thing', 'Thursday thing']);

  const withDone = await repo.listDueBetween('2026-09-21', '2026-09-27', { status: null });
  assert.equal(withDone.length, 3);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/ledger-promises.test.js`
Expected: FAIL with `repo.listDueBetween is not a function`.

- [ ] **Step 3: Implement**

In `ledger-repository.mjs`, add these imports:

```js
import { isIndexKey, listBlobKeys } from './blobs-list.mjs';
```

and add `LEDGER_ITEM_PREFIX` to the existing `./professional-blobs.mjs` import list.

Add this inside `createLedgerItemRepository`, before `return {`:

```js
  /**
   * Open promises due between two YYYY-MM-DD dates, inclusive, for the
   * calendar Due row. Scans records: a few hundred items at most. Add a by-due
   * index only if this shows up in timings.
   */
  async function listDueBetween(from, to, { status = 'open' } = {}) {
    const keys = (await listBlobKeys(store, LEDGER_ITEM_PREFIX)).filter((key) => !isIndexKey(key));
    const records = [];
    for (const key of keys) {
      const record = parseLedgerItemRecord(await getJSON(store, key));
      if (!record || !record.due) continue;
      if (record.due < from || record.due > to) continue;
      if (status && record.status !== status) continue;
      records.push(record);
    }
    records.sort((a, b) => a.due.localeCompare(b.due) || Date.parse(a.created_at) - Date.parse(b.created_at));
    return records.map(projectLedgerItem);
  }
```

Then add `listDueBetween` to the returned object.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/ledger-promises.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/ledger-repository.mjs tests/unit/ledger-promises.test.js
git commit -m "feat(ledger): list open promises due in a date range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `GET /api/people/ledger?due_from=&due_to=`

**Files:**
- Modify: `netlify/functions/people-ledger.mjs` (the `GET` branch at line 55)
- Test: `tests/integration/people-ledger-due.test.js`

- [ ] **Step 1: Look at how the integration tests sign in**

Run: `sed -n 1,120p tests/integration/communications.test.js`
Note the `env` object, the session cookie helper and the `request(...)` helper. The new test copies them.

- [ ] **Step 2: Write the failing test**

`tests/integration/people-ledger-due.test.js`:
- Copy the `env`, session and request helpers from `tests/integration/communications.test.js` exactly. They're the lines that build `life_hub_session=` and call the handler.
- Then add this:

```js
import { createPeopleLedgerHandler } from '../../netlify/functions/people-ledger.mjs';

test('GET ?due_from&due_to returns the repository range', async () => {
  const calls = [];
  const handler = createPeopleLedgerHandler({
    professionalStore: {},
    ledgerRepo: {
      async listDueBetween(from, to) {
        calls.push([from, to]);
        return [{ id: 'ledger_x', text: 'Email Denielle', due: '2026-09-23', direction: 'you_owe' }];
      }
    }
  });
  const response = await callHandler(handler, 'GET', '/api/people/ledger?due_from=2026-09-21&due_to=2026-09-27');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [['2026-09-21', '2026-09-27']]);
  assert.equal(body.data.items[0].text, 'Email Denielle');
});

test('GET with a bad range is a 400 invalid_due_range', async () => {
  const handler = createPeopleLedgerHandler({ professionalStore: {}, ledgerRepo: { async listDueBetween() { return []; } } });
  const response = await callHandler(handler, 'GET', '/api/people/ledger?due_from=2026-09-27&due_to=2026-09-21');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'invalid_due_range');
});
```

`callHandler` is the name of the copied request helper. Rename it if the source file calls it something else. Check the body shape (`body.data`, `body.error.code`) against how the copied file reads `okResponse` / `errorResponse` bodies, and match it.

- [ ] **Step 3: Run the test and confirm it fails**

Run: `node --test tests/integration/people-ledger-due.test.js`
Expected: FAIL with 400 `missing_person_ref`.

- [ ] **Step 4: Implement**

In `people-ledger.mjs`, add `parseDueRangeQuery` to the imports:

```js
import { parseDueRangeQuery } from './_shared/ledger-schema.mjs';
```

Add this as the first lines inside `if (request.method === 'GET') {`:

```js
          if (url.searchParams.has('due_from')) {
            const { from, to } = parseDueRangeQuery(url.searchParams);
            const items = await ledgerRepo.listDueBetween(from, to);
            return withCors(okResponse(200, { items }), request, env);
          }
```

The handler's existing `catch` turns the thrown `invalid_due_range` error into a 400.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/integration/people-ledger-due.test.js tests/unit/ledger-promises.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/people-ledger.mjs tests/integration/people-ledger-due.test.js
git commit -m "feat(ledger): due-range endpoint for the calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `createAutoRetry` helper

**Files:**
- Create: `apps/professional/src/lib/auto-retry.ts`
- Test: `apps/professional/tests/unit/auto-retry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoRetry, type AutoRetryState } from '@/lib/auto-retry';

describe('createAutoRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('first try runs after the first delay; success reports linked and stops', async () => {
    const states: AutoRetryState[] = [];
    const run = vi.fn().mockResolvedValue(undefined);
    createAutoRetry({ run, onState: (s) => states.push(s), delays: [5000, 30000] });
    expect(states).toEqual(['linking']);
    await vi.advanceTimersByTimeAsync(4999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('linked');
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('backs off through the delays, then the steady interval', async () => {
    const run = vi.fn().mockRejectedValue(new Error('down'));
    createAutoRetry({ run, onState: () => {}, delays: [1000, 2000], steadyMs: 5000, stuckAfterMs: 1e9 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('reports stuck once failures pass stuckAfterMs, with the error', async () => {
    const states: Array<[AutoRetryState, unknown]> = [];
    const err = new Error('professional_task_link_incomplete');
    createAutoRetry({
      run: vi.fn().mockRejectedValue(err),
      onState: (s, e) => states.push([s, e]),
      delays: [1000],
      steadyMs: 1000,
      stuckAfterMs: 3000
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(states.at(-1)?.[0]).toBe('linking');
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toEqual(['stuck', err]);
  });

  it('tryNow runs at once and cancels the pending timer; stop ends everything', async () => {
    const run = vi.fn().mockRejectedValue(new Error('down'));
    const retry = createAutoRetry({ run, onState: () => {}, delays: [10000], steadyMs: 10000 });
    await retry.tryNow();
    expect(run).toHaveBeenCalledTimes(1);
    retry.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/auto-retry.test.ts`
Expected: FAIL, because `@/lib/auto-retry` can't be resolved.

- [ ] **Step 3: Implement** `apps/professional/src/lib/auto-retry.ts`

```ts
/**
 * Keeps retrying a link operation quietly, so nobody has to press "Retry".
 * linking → (success) linked, or → stuck once failures have lasted
 * stuckAfterMs. Stuck keeps retrying; it only changes what the page shows.
 */
export type AutoRetryState = 'linking' | 'linked' | 'stuck';

export const AUTO_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];
export const AUTO_RETRY_STEADY_MS = 1_800_000;
export const AUTO_RETRY_STUCK_AFTER_MS = 3_600_000;

export type AutoRetryHandle = {
  tryNow(): Promise<void>;
  stop(): void;
};

export function createAutoRetry(options: {
  run: () => Promise<void>;
  onState: (state: AutoRetryState, error?: unknown) => void;
  delays?: number[];
  steadyMs?: number;
  stuckAfterMs?: number;
}): AutoRetryHandle {
  const delays = options.delays ?? AUTO_RETRY_DELAYS_MS;
  const steadyMs = options.steadyMs ?? AUTO_RETRY_STEADY_MS;
  const stuckAfterMs = options.stuckAfterMs ?? AUTO_RETRY_STUCK_AFTER_MS;
  const startedAt = Date.now();
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    if (stopped) return;
    const ms = attempt < delays.length ? delays[attempt] : steadyMs;
    timer = setTimeout(() => {
      timer = null;
      void tryNow();
    }, ms);
  }

  async function tryNow(): Promise<void> {
    if (stopped || running) return;
    clearTimer();
    running = true;
    try {
      await options.run();
      if (stopped) return;
      stopped = true;
      options.onState('linked');
    } catch (error) {
      attempt += 1;
      options.onState(Date.now() - startedAt >= stuckAfterMs ? 'stuck' : 'linking', error);
      schedule();
    } finally {
      running = false;
    }
  }

  options.onState('linking');
  schedule();

  return {
    tryNow,
    stop() {
      stopped = true;
      clearTimer();
    }
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/auto-retry.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/auto-retry.ts apps/professional/tests/unit/auto-retry.test.ts
git commit -m "feat(professional): quiet auto-retry for link operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Task link panel retries by itself

**Files:**
- Modify: `apps/professional/src/components/schedule-relationships.ts:175-190` (the retry block in `mountTaskLinkPanel`)
- Modify: `apps/professional/src/views/events.ts:1111-1116` (the `statusMessage` ternary)
- Modify: the stylesheet that defines `.task-link-panel` (find it in Step 5)
- Test: `apps/professional/tests/unit/task-link-auto-retry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTaskLinkPanel } from '@/components/schedule-relationships';

function mount(onRetry: (id: string) => Promise<void>) {
  const host = document.createElement('div');
  document.body.append(host);
  mountTaskLinkPanel({
    host,
    heading: 'Learning task',
    relationshipType: 'learning_for',
    incompleteOperationId: 'op_1',
    onRetry,
    onSubmit: async () => {}
  });
  return host;
}

describe('Task link panel with an incomplete link', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('has no Retry button and says Linking…', () => {
    const host = mount(vi.fn().mockResolvedValue(undefined));
    expect(host.textContent).not.toMatch(/Retry incomplete/);
    const state = host.querySelector<HTMLElement>('[data-link-state]');
    expect(state?.dataset.linkState).toBe('linking');
    expect(state?.textContent).toBe('Linking…');
    expect(host.querySelector<HTMLButtonElement>('[data-task-link-submit]')?.disabled).toBe(true);
  });

  it('retries by itself and shows ✓ linked', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const host = mount(onRetry);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onRetry).toHaveBeenCalledWith('op_1');
    expect(host.querySelector('[data-link-state]')?.textContent).toBe('✓ linked');
  });

  it('after an hour of failures shows the amber state and a Try now button', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('Tasks did not answer.'));
    const host = mount(onRetry);
    await vi.advanceTimersByTimeAsync(3_600_000 + 1_800_000);
    const state = host.querySelector<HTMLElement>('[data-link-state]');
    expect(state?.dataset.linkState).toBe('stuck');
    expect(state?.textContent).toContain('Tasks did not answer.');
    const tryNow = host.querySelector<HTMLButtonElement>('.task-link-panel__try');
    expect(tryNow?.hidden).toBe(false);
  });

  it('stops retrying once the panel is gone', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('down'));
    const host = mount(onRetry);
    host.remove();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(30000);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/task-link-auto-retry.test.ts`
Expected: FAIL. The "Retry incomplete Task link" text is present, and there's no `[data-link-state]`.

- [ ] **Step 3: Replace the retry block in `mountTaskLinkPanel`**

Add this import at the top of `schedule-relationships.ts`:

```ts
import { createAutoRetry } from '@/lib/auto-retry';
```

Replace the whole `if (options.incompleteOperationId && options.onRetry) { ... }` block with this:

```ts
  if (options.incompleteOperationId && options.onRetry) {
    const operationId = options.incompleteOperationId;
    const onRetry = options.onRetry;
    // One link at a time: no second task while this one is still landing.
    submit.disabled = true;
    mode.disabled = true;
    title.disabled = true;

    const linkState = el('p', 'task-link-panel__state', 'Linking…');
    linkState.dataset.linkState = 'linking';
    const tryNowBtn = el('button', 'btn btn--ghost task-link-panel__try', 'Try now') as HTMLButtonElement;
    tryNowBtn.type = 'button';
    tryNowBtn.hidden = true;

    const retry = createAutoRetry({
      run: async () => {
        if (!root.isConnected) {
          retry.stop();
          return;
        }
        await onRetry(operationId);
      },
      onState: (state, error) => {
        linkState.dataset.linkState = state;
        tryNowBtn.hidden = state !== 'stuck';
        if (state === 'linked') linkState.textContent = '✓ linked';
        else if (state === 'stuck') {
          const reason = error instanceof Error && error.message ? error.message : 'Tasks did not answer.';
          linkState.textContent = `● Still linking. ${reason} It keeps trying.`;
        } else linkState.textContent = 'Linking…';
      }
    });
    tryNowBtn.addEventListener('click', () => void retry.tryNow());
    root.append(linkState, tryNowBtn);
  }
```

`root` is only attached to the page after this block (`options.host.append(root)`). The first retry fires 5 seconds later, so `root.isConnected` is true by then unless the view has replaced it.

- [ ] **Step 4: Drop the old message in `events.ts`**

Replace the `statusMessage` ternary with this:

```ts
      statusMessage:
        record.learning_operation?.status === 'committed'
          ? `Learning Task ${record.learning_operation.task_id}`
          : null,
```

- [ ] **Step 5: Style the states**

Run: `grep -rln "task-link-panel" apps/professional/src/styles`
Append this to the file it prints:

```css
.task-link-panel__state{margin:0;font-size:var(--text-sm);color:var(--muted)}
.task-link-panel__state[data-link-state="linked"]{color:var(--success)}
.task-link-panel__state[data-link-state="stuck"]{color:var(--high-sea-ink)}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/task-link-auto-retry.test.ts tests/unit/meetings-events.test.ts tests/unit/schedule-relationships.test.ts`
Expected: PASS. If `meetings-events.test.ts` asserted the old message or button, change it to assert `[data-link-state="linking"]`.

- [ ] **Step 7: Commit**

```bash
git add apps/professional/src/components/schedule-relationships.ts apps/professional/src/views/events.ts apps/professional/src/styles apps/professional/tests/unit/task-link-auto-retry.test.ts apps/professional/tests/unit/meetings-events.test.ts
git commit -m "fix(professional): links retry by themselves, no stuck Retry button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The comm follow-up retries by itself

**Files:**
- Modify: `apps/professional/src/views/communications.ts:347-395`
- Test: `apps/professional/tests/unit/communications.test.ts`

- [ ] **Step 1: Read how the existing comm tests stub the API**

Run: `sed -n 1,80p apps/professional/tests/unit/communications.test.ts`
Note how `retryFollowUpTask` / `getCommunication` are mocked (for example `vi.mock('@/api/communications', ...)`).

- [ ] **Step 2: Write the failing test** (append, using that file's mocks and render helper)

```ts
it('an incomplete follow up retries by itself and never shows a Retry button', async () => {
  vi.useFakeTimers();
  // Arrange: using this file's mock pattern, have getCommunication return a record
  // whose follow_up_operation is { status: 'incomplete', operation_id: 'op_9', task_id: 'task_1',
  // failed_relationships: [], completed_intent_ids: [], completed_link_ids: [],
  // failed_intent_ids: [], pending_intent_ids: [], title: 'Follow up' },
  // and have retryFollowUpTask resolve with { communication: <same record, follow_up_operation.status 'committed'> }.
  const canvas = await renderCommunicationDetailForTest('communication_1');
  expect(canvas.textContent).not.toMatch(/Retry incomplete follow up/);
  expect(canvas.textContent).toContain('Linking follow up…');
  await vi.advanceTimersByTimeAsync(5000);
  expect(retryFollowUpTaskMock).toHaveBeenCalledWith('communication_1');
  vi.useRealTimers();
});
```

Replace `renderCommunicationDetailForTest` and `retryFollowUpTaskMock` with the render function and the mocked `retryFollowUpTask` the file already uses. Fill the Arrange comment with that file's own mock calls, so the test data matches its fixtures.

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/communications.test.ts`
Expected: FAIL, because the text contains "Retry incomplete follow up".

- [ ] **Step 4: Implement**

Add `import { createAutoRetry, type AutoRetryHandle } from '@/lib/auto-retry';` to `communications.ts`.

Above `function paintFollowUpFromOperation`, add this:

```ts
    let followUpRetry: AutoRetryHandle | null = null;
```

Replace the non-committed half of `paintFollowUpFromOperation` (everything after the `if (operation.status === 'committed') { ... return; }` block) with this:

```ts
      followUpBtn.hidden = true;
      followUpBtn.disabled = true;
      followUpStatus.textContent = 'Linking follow up…';
      followUpRetry?.stop();
      followUpRetry = createAutoRetry({
        run: async () => {
          if (!followUp.isConnected) {
            followUpRetry?.stop();
            return;
          }
          const result = await retryFollowUpTask(record.id);
          paint(result.communication);
        },
        onState: (state, error) => {
          if (state === 'stuck') {
            const reason = error instanceof Error && error.message ? error.message : 'Tasks did not answer.';
            followUpStatus.textContent = `● Follow up still linking. ${reason} It keeps trying.`;
          }
        }
      });
```

In the click handler, the `existing && existing.status !== 'committed' ? await retryFollowUpTask(...)` branch is now unreachable, because the button is hidden while incomplete. Simplify it to this:

```ts
        const result = await createFollowUpTask(record.id, {
          title: `Follow up: ${labelFor(record)}`
        });
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/communications.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/professional/src/views/communications.ts apps/professional/tests/unit/communications.test.ts
git commit -m "fix(professional): comm follow up links retry by themselves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full check

- [ ] **Step 1: Root tests**

Run: `npm test`
Expected: every unit and integration test passes.

- [ ] **Step 2: Professional tests, types and build**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit && cd ../.. && npm run build:professional`
Expected: all pass, and the build writes `apps/professional/dist`. A failure here in the build, but not in vitest, points at the Task 1 resolver running in `vite build`. Check that the plugin comes first in `plugins`.

- [ ] **Step 3: Calendar browser specs**

Run: `node --test --test-concurrency=1 tests/browser/calendar-filter.spec.mjs tests/browser/professional-calendar-hub.spec.mjs tests/browser/teaching-calendar-hub.spec.mjs tests/browser/tasks-calendar-hub.spec.mjs`
Expected: PASS. Every hub shows 10 source pills with round dots, and the Comms pill is on in Teaching and Professional.

- [ ] **Step 4: Look at it**

Start the Professional dev server (`cd apps/professional && npx vite`) and open `/#/calendar`. Confirm the Comms, Events and Promises pills and the round dots. Open an event with an incomplete learning link: it says "Linking…" with no Retry button.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-review

**Spec coverage for Plan 1:**

| Spec item | Where it's handled |
|---|---|
| §1 sources: comms, events, promises chips | Task 2 |
| §1 sources: hub defaults | Task 2 |
| §1 sources: round dots and contract update | Task 4 |
| §1 non-PD events on Events | Task 3 |
| §2 block engine import | Task 1 |
| §4 promises = ledger v2 | Tasks 5–7 |
| §7 retry button removed | Tasks 9–10 |
| §7 auto-retry backoff (5s, 30s, 2m, 10m, then 30m) | Task 8 |
| §7 amber state after 1h | Task 8 |
| §7 Try now | Task 9 |
| §7 no second task while pending | Task 9 (disabled submit) |

**Deferred to Plan 2, as intended:**
- §1: the Due row drawing promises, comm pin chips and route redirects.
- §7: the server retry job, and the Clare-suggested task title.
- Everything in §2–§6 beyond the engine import.

**Types:**
- `AutoRetryState` and `AutoRetryHandle` are defined in Task 8 and used in Tasks 9–10.
- `listDueBetween(from, to, { status })` is defined in Task 6 and used in Task 7.
- `isValidDueDate` and `parseDueRangeQuery` are defined in Task 5 and used in Tasks 5 and 7.
