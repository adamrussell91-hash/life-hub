# Versioning, Archive & Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can recover from major edit mistakes (version history for lessons, units, class homepages) and from soft-deletes (archive / trash / restore / dependency-aware permanent delete).

**Architecture:** Separate Blob version snapshots + per-parent index (max 10); shared recovery helpers used by Netlify functions and mock-api; lifecycle via existing `status` plus `trashed_at` / `previous_status`; restore rewrites draft/source only.

**Tech Stack:** TypeScript, Zod, Vitest, Netlify Functions + Blobs, vanilla teacher UI (Clinical Glass)

**Spec:** `docs/superpowers/specs/2026-08-11-versioning-archive-recovery-design.md`

**Precondition:** Finish the in-flight build (linked composition templates / related WIP) before starting Task 1, or implement on a clean branch that does not fight unfinished schema/editor work.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/version.ts` | Version record, index, reasons, kinds |
| `src/schemas/common.ts` | Optional trash fields on shared shape helpers |
| `src/storage/keys.ts` | `versionKey`, `versionIndexKey`, `versionsPrefix` |
| `src/recovery/versions.ts` | Pure checkpoint/index/prune helpers (testable without Blobs) |
| `src/recovery/dependencies.ts` | Pure dependency scan over in-memory object maps |
| `src/recovery/lifecycle.ts` | Pure status transition helpers (archive/trash/restore) |
| `netlify/functions/_shared/blobs.mts` | Re-export version keys; optional `listJSON` helper if needed |
| `netlify/functions/_shared/versions.mts` | Async Blob adapters: writeCheckpoint, list, get, restore, purge |
| `netlify/functions/_shared/lifecycle.mts` | Async status transition + permanent delete + dependency loaders |
| `netlify/functions/lesson-versions.mts` | `GET/POST /api/lessons/:id/versions` |
| `netlify/functions/lesson-version.mts` | `GET …/versions/:revision` + `POST …/restore` |
| `netlify/functions/unit-versions.mts` | Unit list/create checkpoints |
| `netlify/functions/unit-version.mts` | Unit get/restore |
| `netlify/functions/class-versions.mts` | Class homepage list/create |
| `netlify/functions/class-version.mts` | Class homepage get/restore |
| `netlify/functions/trash.mts` | `GET /api/trash` |
| `netlify/functions/entity-delete.mts` or per-type DELETE handlers | Permanent delete + restore-from-trash routes |
| `netlify/functions/publish.mts` | Checkpoint pre-publish draft |
| `netlify/functions/lesson.mts` | Optional `checkpoint_reason` on PUT |
| `netlify/functions/unit.mts` / `class.mts` | Meaningful PATCH → checkpoint; status + trash fields |
| `scripts/mock-api.ts` | Full mock parity |
| `src/teacher/version-api.ts` | Client fetch helpers |
| `src/teacher/history-panel.ts` | History list / preview / restore / save checkpoint |
| `src/teacher/sections/trash.ts` | Trash UI |
| `src/teacher/lesson-editor.ts` (+ unit / homepage editors) | Mount history panel; AI accept checkpoint |
| List sections (`lessons`, `units`, `classes`, `resources`, `templates`) | Archive / Trash actions; active-only default filter |
| `src/app/main.ts` + router/nav | Trash route |
| `tests/unit/schemas-version.test.ts` | Schema tests |
| `tests/unit/recovery-versions.test.ts` | Pure version helpers |
| `tests/unit/recovery-lifecycle.test.ts` | Lifecycle + deps |
| `tests/unit/versions-api-mock.test.ts` | Mock HTTP flows |
| `docs/BUILD.md` | Projection → History |

---

### Task 1: Version schemas + storage keys

**Files:**
- Create: `src/schemas/version.ts`
- Modify: `src/schemas/index.ts`, `src/storage/keys.ts`, `netlify/functions/_shared/blobs.mts`
- Test: `tests/unit/schemas-version.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/schemas-version.test.ts
import { describe, expect, it } from 'vitest';
import {
  VersionKindSchema,
  VersionReasonSchema,
  VersionRecordSchema,
  VersionIndexSchema
} from '@/schemas/version';

describe('version schemas', () => {
  it('parses a lesson version record and index', () => {
    const record = VersionRecordSchema.parse({
      id: 'version_lesson_1_1',
      type: 'lesson_version',
      kind: 'lesson',
      parent_id: 'lesson_1',
      revision: 1,
      created_at: '2026-08-11T00:00:00.000Z',
      reason: 'manual_checkpoint',
      label: 'Before rewrite',
      snapshot: { id: 'lesson_1', type: 'lesson' }
    });
    expect(record.revision).toBe(1);
    expect(VersionKindSchema.parse('class_homepage')).toBe('class_homepage');
    expect(VersionReasonSchema.parse('ai_accepted')).toBe('ai_accepted');

    const index = VersionIndexSchema.parse({
      parent_id: 'lesson_1',
      kind: 'lesson',
      latest_revision: 1,
      entries: [
        {
          id: record.id,
          revision: 1,
          created_at: record.created_at,
          reason: 'manual_checkpoint',
          label: 'Before rewrite'
        }
      ]
    });
    expect(index.entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/schemas-version.test.ts`  
Expected: FAIL — module `@/schemas/version` not found

- [ ] **Step 3: Implement schemas + keys**

```ts
// src/schemas/version.ts
import { z } from 'zod';
import { IsoDateSchema } from './common';

export const VersionKindSchema = z.enum(['lesson', 'unit', 'class_homepage']);
export const VersionReasonSchema = z.enum([
  'save',
  'publish',
  'restore',
  'ai_accepted',
  'manual_checkpoint'
]);

export const VersionIndexEntrySchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: IsoDateSchema,
  reason: VersionReasonSchema,
  label: z.string().min(1).optional()
});

export const VersionIndexSchema = z.object({
  parent_id: z.string().min(1),
  kind: VersionKindSchema,
  latest_revision: z.number().int().nonnegative(),
  entries: z.array(VersionIndexEntrySchema)
});

export const VersionRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['lesson_version', 'unit_version', 'class_homepage_version']),
  kind: VersionKindSchema,
  parent_id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: IsoDateSchema,
  reason: VersionReasonSchema,
  label: z.string().min(1).nullable().optional(),
  snapshot: z.unknown()
});

export type VersionKind = z.infer<typeof VersionKindSchema>;
export type VersionReason = z.infer<typeof VersionReasonSchema>;
export type VersionIndex = z.infer<typeof VersionIndexSchema>;
export type VersionIndexEntry = z.infer<typeof VersionIndexEntrySchema>;
export type VersionRecord = z.infer<typeof VersionRecordSchema>;
```

```ts
// src/storage/keys.ts — add:
export function versionKey(kind: string, parentId: string, revision: number): string {
  return `versions/${kind}/${parentId}/${revision}`;
}

export function versionIndexKey(kind: string, parentId: string): string {
  return `versions/${kind}/${parentId}/_index`;
}

export function versionsPrefix(kind: string, parentId: string): string {
  return `versions/${kind}/${parentId}/`;
}
```

Re-export the three helpers from `netlify/functions/_shared/blobs.mts` (import + export list). Export version schemas from `src/schemas/index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm run test:unit -- tests/unit/schemas-version.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/schemas/version.ts src/schemas/index.ts src/storage/keys.ts netlify/functions/_shared/blobs.mts tests/unit/schemas-version.test.ts
git commit -m "feat(recovery): version schemas and blob keys"
```

---

### Task 2: Pure version helpers (checkpoint / prune / restore plan)

**Files:**
- Create: `src/recovery/versions.ts`
- Test: `tests/unit/recovery-versions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/recovery-versions.test.ts
import { describe, expect, it } from 'vitest';
import {
  emptyVersionIndex,
  nextRevision,
  appendCheckpointToIndex,
  pruneIndexEntries,
  VERSION_RETENTION
} from '@/recovery/versions';

describe('version index helpers', () => {
  it('appends checkpoints and prunes to retention', () => {
    let index = emptyVersionIndex('lesson', 'lesson_1');
    expect(VERSION_RETENTION).toBe(10);

    for (let i = 0; i < 11; i++) {
      const revision = nextRevision(index);
      const created_at = `2026-08-11T00:00:${String(i).padStart(2, '0')}.000Z`;
      const built = appendCheckpointToIndex(index, {
        id: `version_lesson_1_${revision}`,
        revision,
        created_at,
        reason: 'manual_checkpoint'
      });
      index = pruneIndexEntries(built, VERSION_RETENTION);
    }

    expect(index.entries).toHaveLength(10);
    expect(index.latest_revision).toBe(11);
    expect(index.entries[0]?.revision).toBe(11); // newest first
    expect(index.entries.at(-1)?.revision).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement**

```ts
// src/recovery/versions.ts
import type { VersionIndex, VersionIndexEntry, VersionKind } from '@/schemas/version';

export const VERSION_RETENTION = 10;

export function emptyVersionIndex(kind: VersionKind, parentId: string): VersionIndex {
  return { parent_id: parentId, kind, latest_revision: 0, entries: [] };
}

export function nextRevision(index: VersionIndex): number {
  return index.latest_revision + 1;
}

export function appendCheckpointToIndex(
  index: VersionIndex,
  entry: VersionIndexEntry
): VersionIndex {
  return {
    ...index,
    latest_revision: Math.max(index.latest_revision, entry.revision),
    entries: [entry, ...index.entries.filter((e) => e.revision !== entry.revision)]
  };
}

/** Keep newest `limit` entries (assumes entries newest-first). Returns pruned index + dropped revisions. */
export function pruneIndexEntries(
  index: VersionIndex,
  limit: number = VERSION_RETENTION
): VersionIndex {
  const entries = index.entries
    .slice()
    .sort((a, b) => b.revision - a.revision)
    .slice(0, limit);
  return { ...index, entries };
}

export function revisionsToDelete(indexBeforePrune: VersionIndex, limit: number = VERSION_RETENTION): number[] {
  const sorted = indexBeforePrune.entries.slice().sort((a, b) => b.revision - a.revision);
  return sorted.slice(limit).map((e) => e.revision);
}

export function versionTypeForKind(
  kind: VersionKind
): 'lesson_version' | 'unit_version' | 'class_homepage_version' {
  if (kind === 'lesson') return 'lesson_version';
  if (kind === 'unit') return 'unit_version';
  return 'class_homepage_version';
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm run test:unit -- tests/unit/recovery-versions.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/recovery/versions.ts tests/unit/recovery-versions.test.ts
git commit -m "feat(recovery): version index checkpoint and prune helpers"
```

---

### Task 3: Lifecycle + dependency pure helpers

**Files:**
- Create: `src/recovery/lifecycle.ts`, `src/recovery/dependencies.ts`
- Modify: `src/schemas/common.ts` (optional trash field schemas)
- Test: `tests/unit/recovery-lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/recovery-lifecycle.test.ts
import { describe, expect, it } from 'vitest';
import { applyTrash, applyRestoreFromTrash, applyArchive } from '@/recovery/lifecycle';
import { scanLessonDependencies, scanUnitDependencies } from '@/recovery/dependencies';

describe('lifecycle transitions', () => {
  it('trashes and restores previous_status', () => {
    const archived = { status: 'archived' as const };
    const trashed = applyTrash(archived, '2026-08-11T00:00:00.000Z');
    expect(trashed.status).toBe('trashed');
    expect(trashed.previous_status).toBe('archived');
    expect(trashed.trashed_at).toBe('2026-08-11T00:00:00.000Z');
    const restored = applyRestoreFromTrash(trashed);
    expect(restored.status).toBe('archived');
    expect(restored.trashed_at).toBeUndefined();
    expect(restored.previous_status).toBeUndefined();
  });

  it('archives active content', () => {
    expect(applyArchive({ status: 'active' }).status).toBe('archived');
  });
});

describe('dependency scan', () => {
  it('finds class and schedule refs for units/lessons', () => {
    const unitDeps = scanUnitDependencies('unit_1', {
      classes: [{ id: 'class_1', title: '12ENG', active_unit_ids: ['unit_1'], current_unit_id: 'unit_1' }]
    });
    expect(unitDeps.some((d) => d.type === 'class' && d.id === 'class_1')).toBe(true);

    const lessonDeps = scanLessonDependencies('lesson_1', {
      units: [{ id: 'unit_1', title: 'Unit', lesson_ids: ['lesson_1'] }],
      scheduled_lessons: [{ id: 'sched_1', lesson_id: 'lesson_1', class_id: 'class_1' }]
    });
    expect(lessonDeps.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/recovery/lifecycle.ts
export type EntityStatus = 'active' | 'archived' | 'trashed';

export type LifecycleFields = {
  status: EntityStatus;
  trashed_at?: string;
  previous_status?: Exclude<EntityStatus, 'trashed'>;
  trash_reason?: string;
};

export function applyArchive<T extends { status: EntityStatus }>(obj: T): T {
  return { ...obj, status: 'archived' };
}

export function applyTrash<T extends LifecycleFields>(
  obj: T,
  trashedAt: string,
  reason?: string
): T {
  const previous =
    obj.status === 'trashed' ? obj.previous_status ?? 'active' : (obj.status as 'active' | 'archived');
  return {
    ...obj,
    previous_status: previous,
    trashed_at: trashedAt,
    status: 'trashed',
    ...(reason ? { trash_reason: reason } : {})
  };
}

export function applyRestoreFromTrash<T extends LifecycleFields>(obj: T): T {
  const nextStatus = obj.previous_status ?? 'active';
  const { trashed_at: _t, previous_status: _p, trash_reason: _r, ...rest } = obj;
  return { ...rest, status: nextStatus } as T;
}
```

```ts
// src/recovery/dependencies.ts
export type DependencyHit = {
  type: 'class' | 'unit' | 'scheduled_lesson' | 'lesson' | 'media_ref';
  id: string;
  title?: string;
  detail: string;
};

export function scanUnitDependencies(
  unitId: string,
  world: {
    classes: Array<{
      id: string;
      title: string;
      active_unit_ids?: string[];
      current_unit_id?: string;
    }>;
  }
): DependencyHit[] {
  const hits: DependencyHit[] = [];
  for (const c of world.classes) {
    if (c.active_unit_ids?.includes(unitId) || c.current_unit_id === unitId) {
      hits.push({
        type: 'class',
        id: c.id,
        title: c.title,
        detail: 'Class references this unit'
      });
    }
  }
  return hits;
}

export function scanLessonDependencies(
  lessonId: string,
  world: {
    units: Array<{ id: string; title: string; lesson_ids: string[] }>;
    scheduled_lessons: Array<{ id: string; lesson_id: string; class_id: string }>;
  }
): DependencyHit[] {
  const hits: DependencyHit[] = [];
  for (const u of world.units) {
    if (u.lesson_ids.includes(lessonId)) {
      hits.push({ type: 'unit', id: u.id, title: u.title, detail: 'Unit lesson_ids includes lesson' });
    }
  }
  for (const s of world.scheduled_lessons) {
    if (s.lesson_id === lessonId) {
      hits.push({
        type: 'scheduled_lesson',
        id: s.id,
        detail: `Scheduled on class ${s.class_id}`
      });
    }
  }
  return hits;
}

export function scanClassDependencies(
  classId: string,
  world: { scheduled_lessons: Array<{ id: string; class_id: string }> }
): DependencyHit[] {
  return world.scheduled_lessons
    .filter((s) => s.class_id === classId)
    .map((s) => ({
      type: 'scheduled_lesson' as const,
      id: s.id,
      detail: 'Scheduled lesson belongs to class'
    }));
}

/** Walk block trees for media_id references — implement against Block type in repo. */
export function scanMediaDependencies(
  mediaId: string,
  world: { documents: Array<{ type: string; id: string; title?: string; mediaIds: string[] }> }
): DependencyHit[] {
  return world.documents
    .filter((d) => d.mediaIds.includes(mediaId))
    .map((d) => ({
      type: 'media_ref' as const,
      id: d.id,
      title: d.title,
      detail: `Referenced from ${d.type}`
    }));
}
```

Add optional Zod fields for trash metadata (do **not** put them inside `CommonFields` if that breaks every object parse — prefer a `TrashFields` partial merged only where PATCH accepts status):

```ts
// src/schemas/common.ts — add export:
export const TrashFieldsSchema = z.object({
  trashed_at: IsoDateSchema.optional(),
  previous_status: z.enum(['active', 'archived']).optional(),
  trash_reason: z.string().min(1).optional()
});
```

Extend Lesson/Unit/Class/Media/template schemas with `.merge(TrashFieldsSchema.partial())` **or** `.extend({...})` so stored trashed objects round-trip. Keep `status` as today.

Also add `collectMediaIdsFromBlocks(blocks: Block[]): string[]` in `src/recovery/dependencies.ts` (walk nested section/columns/tabs/gallery etc. for `media_id` fields — mirror existing block walkers if any).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/recovery/lifecycle.ts src/recovery/dependencies.ts src/schemas/common.ts src/schemas/*.ts tests/unit/recovery-lifecycle.test.ts
git commit -m "feat(recovery): lifecycle transitions and dependency scan"
```

---

### Task 4: Blob adapters + Netlify version APIs + publish/PUT hooks

**Files:**
- Create: `netlify/functions/_shared/versions.mts`, version function files listed in file map
- Modify: `publish.mts`, `lesson.mts`, `unit.mts`, `class.mts`
- Test: `tests/unit/versions-api-mock.test.ts` (after Task 5 mock — write adapter unit tests here first if pure; otherwise implement Netlify + mock together in Task 5)

Prefer implementing Blob adapter with an injected store interface so mock and Netlify share logic:

```ts
// Conceptual store port used by _shared/versions.mts
export type JsonStore = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys?(prefix: string): Promise<string[]>;
};
```

- [ ] **Step 1: Write failing mock/API test skeleton** (will fully pass after Task 5)

```ts
// tests/unit/versions-api-mock.test.ts — first assertion once mock exists:
// POST /api/lessons/:id/versions → 200, GET list length 1, GET revision returns snapshot
```

- [ ] **Step 2: Implement `writeCheckpoint` / `restoreVersion` in `_shared/versions.mts`**

Behaviour (must match spec):

1. Load or create index via `versionIndexKey`
2. `revision = nextRevision(index)`
3. Build `VersionRecord` with `versionTypeForKind`, store at `versionKey`
4. Append + prune; `delete` pruned revision blobs
5. Save index

`restoreVersion(kind, parentId, revision)`:

1. Load version record
2. Load live parent; checkpoint current live snapshot with `reason: 'restore'`
3. Write historical snapshot to live key (lesson full / unit full / class `homepage` only)
4. Return updated live object

- [ ] **Step 3: Wire functions**

`lesson-versions.mts`:

```ts
export const config = { path: '/api/lessons/:id/versions' };
// GET → list index entries
// POST → manual checkpoint of current draft (reason manual_checkpoint, optional label)
```

`lesson-version.mts`:

```ts
export const config = { path: '/api/lessons/:id/versions/:revision' };
// GET → full record
// For restore use path '/api/lessons/:id/versions/:revision/restore' as separate file if Netlify path nesting requires it:
```

If Netlify static path config cannot do both `…/:revision` and `…/:revision/restore`, use:

- `lesson-version.mts` → `GET /api/lessons/:id/versions/:revision`
- `lesson-version-restore.mts` → `POST /api/lessons/:id/versions/:revision/restore`

Same pattern for units and classes (`kind: 'class_homepage'`, snapshot `{ homepage }`).

- [ ] **Step 4: Hook publish + lesson PUT**

In `publish.mts`, **before** writing published snapshot:

```ts
await writeCheckpoint(storeAdapter, {
  kind: 'lesson',
  parentId: id,
  snapshot: draft,
  reason: 'publish'
});
```

In `lesson.mts` PUT, after successful validate+setJSON:

```ts
const reason = bodyRecord.checkpoint_reason;
if (reason === 'ai_accepted' || reason === 'manual_checkpoint') {
  await writeCheckpoint(..., { reason, snapshot: validated.data });
}
```

In `unit.mts` / `class.mts`, after meaningful content PATCH (not status-only), `writeCheckpoint` with `reason: 'save'`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(recovery): version blob adapters and lesson/unit/class version APIs"
```

---

### Task 5: Mock-api parity + integration tests

**Files:**
- Modify: `scripts/mock-api.ts`, `scripts/mock-store.ts` (if delete/list needed)
- Test: `tests/unit/versions-api-mock.test.ts`

- [ ] **Step 1: Expand failing tests**

Cover:

1. Auth required on version routes  
2. Manual checkpoint + list + get  
3. Publish creates `publish` version; published GET unchanged after restore  
4. Restore checkpoints current then applies old draft  
5. 11th checkpoint leaves 10 entries; oldest blob gone  
6. PUT with `checkpoint_reason: 'ai_accepted'` creates version  

- [ ] **Step 2: Implement mock routes** mirroring Netlify paths; reuse `src/recovery/*` pure helpers with `MockStore` adapter (`getJSON`/`setJSON`/`delete`/`listKeys`).

- [ ] **Step 3: Run**

Run: `npm run test:unit -- tests/unit/versions-api-mock.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "test(recovery): mock version API parity"
```

---

### Task 6: Lifecycle APIs (trash list, restore-from-trash, DELETE, status PATCH)

**Files:**
- Create: `netlify/functions/trash.mts`, restore/delete handlers (or extend existing `*-item` / `class.mts` / `unit.mts` / `lesson.mts`)
- Modify: entity PATCH handlers to set trash fields via `applyTrash` / `applyArchive` / `applyRestoreFromTrash`
- Mock parity + tests: `tests/unit/lifecycle-api-mock.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// Trash lesson → status trashed + trashed_at
// GET /api/trash includes it
// restore-from-trash → previous status
// Permanent DELETE while unit still lists lesson_id → 409 dependencies
// Remove from unit lesson_ids, trash, DELETE → 200; draft + published + versions gone
// Archive class → status archived; still GET-able
```

- [ ] **Step 2: Implement**

`GET /api/trash` — scan prefixes `lessons/`, `units/`, `classes/`, `media/`, `templates/lessons/`, `templates/units/`, `templates/compositions/`; return summaries `{ type, id, title, trashed_at, previous_status }`.

`POST /api/lessons/:id/restore-from-trash` (and peers) — applyRestoreFromTrash + save.

`DELETE /api/lessons/:id` — require `status === 'trashed'`; `scanLessonDependencies` with live world; if hits.length → 409 `{ dependencies }`; else delete draft, published, all `versions/lesson/{id}/*`.

Status PATCH: when setting `trashed`, call `applyTrash`; when `archived`, `applyArchive`; when `active` from archived, plain status set (not trash restore).

Preflight: `GET /api/lessons/:id/dependencies` (optional but recommended) returning `{ dependencies: DependencyHit[] }`.

- [ ] **Step 3: Run lifecycle mock tests — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(recovery): trash, restore-from-trash, and permanent delete APIs"
```

---

### Task 7: Teacher client — version API + history panel

**Files:**
- Create: `src/teacher/version-api.ts`, `src/teacher/history-panel.ts`
- Modify: `src/teacher/lesson-editor.ts`, unit editor surface, `src/teacher/sections/homepage-editor.ts`
- Modify AI accept path to send `checkpoint_reason: 'ai_accepted'` on the PUT that saves the accepted proposal
- CSS: minimal classes in `src/styles/app.css` matching existing panel patterns

- [ ] **Step 1: Client API**

```ts
// src/teacher/version-api.ts
import { apiGet, apiPost } from '@/api/client';

export function listLessonVersions(id: string) {
  return apiGet(`/api/lessons/${id}/versions`);
}
export function getLessonVersion(id: string, revision: number) {
  return apiGet(`/api/lessons/${id}/versions/${revision}`);
}
export function createLessonCheckpoint(id: string, label?: string) {
  return apiPost(`/api/lessons/${id}/versions`, { label });
}
export function restoreLessonVersion(id: string, revision: number) {
  return apiPost(`/api/lessons/${id}/versions/${revision}/restore`, {});
}
// Mirror for units + classes
```

- [ ] **Step 2: History panel UI**

`mountHistoryPanel({ kind, parentId, onRestored })`:

- Load list on open
- Rows: relative/absolute time, reason badge, label
- Preview button → fetch revision → render read-only (reuse student block renderer or simple title+block count fallback for v1)
- Restore → `confirm('Restores editable content only. Students keep the current published version until you republish.')` → restore → `onRestored(live)`
- Save checkpoint button → POST versions

Mount in lesson editor chrome (near Publish / A4), unit page tools, homepage editor toolbar.

- [ ] **Step 3: Manual browser smoke** (dev server): checkpoint → edit → restore → publish still old until republish

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(recovery): history panel and version client API"
```

---

### Task 8: Teacher UI — Archive/Trash actions + Trash section

**Files:**
- Create: `src/teacher/sections/trash.ts`, `src/teacher/lifecycle-api.ts`
- Modify: list sections + `main.ts` + router + primary nav
- Filter curriculum/list renders to `status === 'active'` by default

- [ ] **Step 1: Lifecycle client**

```ts
export function patchStatus(path: string, status: 'active' | 'archived' | 'trashed') { ... }
export function listTrash() { return apiGet('/api/trash'); }
export function restoreFromTrash(type, id) { ... }
export function permanentDelete(type, id) { ... }
export function getDependencies(type, id) { ... }
```

- [ ] **Step 2: Row actions**

On Lessons / Units / Classes / Resources / Templates rows: **Archive** (existing where present) + **Trash**. Before trash, `getDependencies` → if any, confirm with list (“Still referenced by …”). Always allow trash after confirm.

- [ ] **Step 3: Trash section**

Route e.g. `teacher-trash` / `#/trash` following existing section routing in `main.ts`. Table: type, title, trashed_at, Restore, Delete permanently. Delete calls deps again; if 409, show blockers and keep row.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(recovery): archive/trash actions and trash section"
```

---

### Task 9: BUILD.md + full verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD**

Move Versioning / archive / recovery from Projection / Next up into History with link to this plan + design. Set Next up to whatever remains (e.g. export/backup follow-up or production hardening).

- [ ] **Step 2: Run full unit suite**

Run: `npm run test:unit`  
Expected: PASS (fix any breakage from schema trash fields)

- [ ] **Step 3: Typecheck / build if repo has script**

Run: `npm run build` (or project’s typecheck script from `package.json`)  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/BUILD.md
git commit -m "docs: record versioning archive recovery slice in BUILD"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Separate version blobs + index, retention 10 | 1–2, 4–5 |
| Lessons / Units / Class homepages versioned | 4–5, 7 |
| Triggers: manual, publish, restore, AI accept, meaningful unit/homepage save | 4–5, 7 |
| Restore draft only; publish unchanged | 4–5 |
| Restore checkpoints current before overwrite | 4–5 |
| Archive vs trash semantics + trash fields | 3, 6, 8 |
| Lifecycle objects incl. media/templates | 6, 8 |
| Dependency warn on trash; block permanent delete | 3, 6, 8 |
| History panel + Save checkpoint | 7 |
| Trash section UI | 8 |
| Mock parity + acceptance-aligned tests | 5–6, 9 |
| Export / GitHub backup out of scope | — (not scheduled) |

---

## Self-review notes

- No export/backup tasks (YAGNI per spec).
- Netlify path nesting for restore may need a dedicated `*-restore.mts` file — called out in Task 4.
- Trash fields must not break existing seeds: keep optional; fixtures without trash metadata still parse.
- AI accept checkpoint prefers `checkpoint_reason` on lesson PUT (server-enforced when client sends it).
