# Scope & Sequence Timeline Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-subject Scope stub with a teacher timeline editor (week/term grid, Units + notes, drag move/resize, inspector, Add Unit/note) backed by a persisted `ScopeSequence` blob.

**Architecture:** New Zod `ScopeSequence` schema and blob keys; curriculum lists scopes; `PATCH /api/scope-sequences/:id` replaces `timeline_items`. Pure helpers clamp weeks and find free placement. Teacher canvas: CSS week grid + pointer drag, right inspector, toolbar modals. Seed one scope for English Advanced (`scope_y12_engadv_2026` already referenced on the subject).

**Tech Stack:** TypeScript, Zod, Vite, Vitest, existing `apiPatch` / curriculum fetch, mock-api + Netlify Functions

**Spec:** `docs/superpowers/specs/2026-08-08-scope-sequence-timeline-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/scope-sequence.ts` | Zod schemas for ScopeSequence + TimelineItem |
| `src/schemas/index.ts` | Re-exports |
| `src/storage/keys.ts` | `scopeSequenceKey` |
| `fixtures/seed.json` | `scope_sequences` array + seed scope object |
| `scripts/mock-store.ts` | Load scopes from seed |
| `scripts/seed-blobs.mjs` | Write scope blobs |
| `scripts/mock-api.ts` | Curriculum includes scopes; PATCH scope |
| `netlify/functions/curriculum.mts` | List `scope_sequences/` |
| `netlify/functions/scope-sequence.mts` | `PATCH /api/scope-sequences/:id` |
| `netlify/functions/_shared/blobs.mts` | Re-export key helper if needed |
| `src/teacher/nav.ts` | `scope_sequences` on `CurriculumResponse` |
| `src/teacher/scope-api.ts` | `patchScopeSequence` |
| `src/scope/timeline-weeks.ts` | Clamp, span, first-free-week helpers |
| `src/teacher/sections/scope-timeline.ts` | Timeline editor UI (grid, drag, inspector, add) |
| `src/teacher/sections/scope-sequences.ts` | Index unchanged; detail calls timeline editor |
| `src/app/main.ts` | Wire detail route to editor |
| `src/styles/app.css` | Timeline + inspector styles |
| Tests | schema, helpers, API, UI |

---

### Task 1: ScopeSequence schema

**Files:**
- Create: `src/schemas/scope-sequence.ts`
- Modify: `src/schemas/index.ts`
- Create: `tests/unit/schemas-scope-sequence.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { ScopeSequenceSchema, TimelineItemSchema } from '@/schemas/scope-sequence';

const base = {
  id: 'scope_y12_engadv_2026',
  type: 'scope_sequence' as const,
  title: 'Year 12 English Advanced 2026',
  slug: 'y12_engadv_2026',
  subject_id: 'subject_y12_engadv',
  academic_year: 2026,
  week_count: 40,
  terms: [
    { id: 'term_t1', title: 'Term 1', term_number: 1, start_week: 1, end_week: 10 },
    { id: 'term_t2', title: 'Term 2', term_number: 2, start_week: 11, end_week: 20 },
    { id: 'term_t3', title: 'Term 3', term_number: 3, start_week: 21, end_week: 30 },
    { id: 'term_t4', title: 'Term 4', term_number: 4, start_week: 31, end_week: 40 }
  ],
  timeline_items: [
    {
      id: 'ti_unit_aotfw',
      kind: 'unit' as const,
      unit_id: 'unit_aotfw',
      start_week: 12,
      end_week: 18,
      order: 1
    },
    {
      id: 'ti_note_1',
      kind: 'note' as const,
      title: 'Assessment week',
      start_week: 19,
      end_week: 19,
      order: 2
    }
  ],
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};

describe('ScopeSequenceSchema', () => {
  it('accepts a valid scope with unit and note items', () => {
    expect(ScopeSequenceSchema.parse(base).timeline_items).toHaveLength(2);
  });

  it('rejects end_week before start_week via refine on items', () => {
    expect(() =>
      TimelineItemSchema.parse({
        id: 'x',
        kind: 'note',
        title: 'Bad',
        start_week: 5,
        end_week: 4,
        order: 1
      })
    ).toThrow();
  });

  it('rejects invalid kind', () => {
    expect(() =>
      TimelineItemSchema.parse({
        id: 'x',
        kind: 'milestone',
        title: 'Nope',
        start_week: 1,
        end_week: 1,
        order: 1
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm run test:unit -- tests/unit/schemas-scope-sequence.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/schemas/scope-sequence.ts
import { z } from 'zod';
import { CommonFields } from './common';

const WeekSchema = z.number().int().positive();

export const ScopeTermSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  term_number: z.number().int().positive(),
  start_week: WeekSchema,
  end_week: WeekSchema
}).refine((t) => t.end_week >= t.start_week, { message: 'term end_week must be >= start_week' });

export const TimelineUnitItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('unit'),
  unit_id: z.string().min(1),
  start_week: WeekSchema,
  end_week: WeekSchema,
  order: z.number().int()
}).refine((i) => i.end_week >= i.start_week, { message: 'end_week must be >= start_week' });

export const TimelineNoteItemSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note'),
  title: z.string().min(1),
  start_week: WeekSchema,
  end_week: WeekSchema,
  order: z.number().int()
}).refine((i) => i.end_week >= i.start_week, { message: 'end_week must be >= start_week' });

export const TimelineItemSchema = z.discriminatedUnion('kind', [
  TimelineUnitItemSchema,
  TimelineNoteItemSchema
]);

export const ScopeSequenceSchema = z.object({
  ...CommonFields,
  type: z.literal('scope_sequence'),
  subject_id: z.string().min(1),
  academic_year: z.number().int(),
  week_count: z.number().int().positive(),
  terms: z.array(ScopeTermSchema),
  timeline_items: z.array(TimelineItemSchema)
});

export type ScopeSequence = z.infer<typeof ScopeSequenceSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
```

Re-export from `src/schemas/index.ts`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git add src/schemas/scope-sequence.ts src/schemas/index.ts tests/unit/schemas-scope-sequence.test.ts
git commit -m "feat: add ScopeSequence schema"
```

---

### Task 2: Storage key, seed, mock-store, seed-blobs

**Files:**
- Modify: `src/storage/keys.ts`
- Modify: `fixtures/seed.json`
- Modify: `scripts/mock-store.ts`
- Modify: `scripts/seed-blobs.mjs`
- Modify: `tests/unit/storage-keys.test.ts` (if present — add key assertion)
- Modify: `tests/unit/seed.test.ts` (assert scope loads)

- [ ] **Step 1: Add key**

```ts
export function scopeSequenceKey(id: string): string {
  return `scope_sequences/${id}`;
}
```

- [ ] **Step 2: Seed object** in `fixtures/seed.json`

Add top-level `"scope_sequences": [ { ... } ]` matching Task 1 `base` (id `scope_y12_engadv_2026`, subject already has `scope_id`). Place AoTFW in Term 2 weeks 12–18; sample note at week 19.

- [ ] **Step 3: mock-store**

Extend `SeedData` with `scope_sequences: unknown[]` and load via `scopeSequenceKey`.

- [ ] **Step 4: seed-blobs.mjs**

Import `scopeSequenceKey`; write `seed.scope_sequences ?? []`.

- [ ] **Step 5: Tests** — storage-keys + seed fixture includes scope; run `npm run test:unit -- tests/unit/storage-keys.test.ts tests/unit/seed.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/storage/keys.ts fixtures/seed.json scripts/mock-store.ts scripts/seed-blobs.mjs tests/unit/storage-keys.test.ts tests/unit/seed.test.ts
git commit -m "feat: seed ScopeSequence blob for English Advanced"
```

---

### Task 3: Curriculum includes `scope_sequences`

**Files:**
- Modify: `src/teacher/nav.ts`
- Modify: `scripts/mock-api.ts`
- Modify: `netlify/functions/curriculum.mts`
- Modify: `netlify/functions/_shared/blobs.mts` (re-export `scopeSequenceKey` if pattern requires)
- Modify: relevant curriculum tests (`tests/unit/netlify-content-routes.test.ts` and/or seed/curriculum tests)

- [ ] **Step 1: Types**

```ts
// CurriculumResponse
import type { ScopeSequence } from '@/schemas';
scope_sequences: ScopeSequence[];
```

- [ ] **Step 2: mock-api curriculum handler**

List `scope_sequences/` keys (or seed ids) → parse with `ScopeSequenceSchema` → include in JSON response.

Track `seedIds.scope_sequences` like classes.

- [ ] **Step 3: Netlify curriculum.mts**

`listEntries` for `scope_sequences/` alongside classes.

- [ ] **Step 4: Test** — GET curriculum returns scope with id `scope_y12_engadv_2026`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: include scope_sequences in curriculum API"
```

---

### Task 4: PATCH `/api/scope-sequences/:id`

**Files:**
- Create: `netlify/functions/scope-sequence.mts`
- Modify: `scripts/mock-api.ts`
- Create: `src/teacher/scope-api.ts`
- Create: `tests/unit/scope-sequence-api.test.ts` (mock and/or netlify pattern like `class-api.test.ts`)

- [ ] **Step 1: Client**

```ts
// src/teacher/scope-api.ts
import { apiPatch } from '@/api/client';
import type { ScopeSequence, TimelineItem } from '@/schemas';

export function patchScopeSequence(
  id: string,
  body: { timeline_items: TimelineItem[] }
): Promise<ScopeSequence> {
  return apiPatch(`/api/scope-sequences/${id}`, body);
}
```

- [ ] **Step 2: Validation rules (shared logic inline or helper)**

When `timeline_items` provided:
1. Parse each item with `TimelineItemSchema`
2. Every week in `1…scope.week_count`
3. Among `kind === 'unit'`, unique `unit_id`
4. Full replace array; bump `updated_at` to now ISO
5. Auth required; missing id → 404

- [ ] **Step 3: Netlify handler** — mirror `class.mts` PATCH pattern; `config.path = '/api/scope-sequences/:id'`

- [ ] **Step 4: mock-api** — same behavior

- [ ] **Step 5: Tests** — happy path persist; reject duplicate unit; reject out-of-range week; 401 without session

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add PATCH scope-sequences timeline_items API"
```

---

### Task 5: Week helpers (pure)

**Files:**
- Create: `src/scope/timeline-weeks.ts`
- Create: `tests/unit/timeline-weeks.test.ts`

- [ ] **Step 1: Tests + implement**

```ts
export function clampWeek(week: number, weekCount: number): number {
  return Math.min(weekCount, Math.max(1, Math.round(week)));
}

export function clampSpan(
  start: number,
  end: number,
  weekCount: number
): { start_week: number; end_week: number } {
  let start_week = clampWeek(start, weekCount);
  let end_week = clampWeek(end, weekCount);
  if (end_week < start_week) end_week = start_week;
  return { start_week, end_week };
}

/** First week where `[start, start+span-1]` fits and does not overlap any item. */
export function findFirstFreeStart(
  weekCount: number,
  span: number,
  items: Array<{ start_week: number; end_week: number }>
): number | null {
  const width = Math.max(1, span);
  for (let start = 1; start <= weekCount - width + 1; start++) {
    const end = start + width - 1;
    const overlaps = items.some(
      (i) => !(end < i.start_week || start > i.end_week)
    );
    if (!overlaps) return start;
  }
  return null;
}

export function weeksToLabel(start: number, end: number): string {
  return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add timeline week clamp and placement helpers"
```

---

### Task 6: Timeline editor shell (render + select + inspector, no drag)

**Files:**
- Create: `src/teacher/sections/scope-timeline.ts`
- Modify: `src/teacher/sections/scope-sequences.ts` — export thin wrapper or replace stub
- Modify: `src/app/main.ts` — call editor instead of stub
- Modify: `src/styles/app.css`
- Create: `tests/unit/scope-timeline.test.ts`
- Update: `tests/unit/sections-scope.test.ts` — stub expectations → editor heading / coming-next gone

- [ ] **Step 1: API shape**

```ts
export function renderScopeTimelineEditor(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string,
  options?: {
    onPatched?: (scope: ScopeSequence) => void;
  }
): void
```

Behavior:
1. Find subject; if missing → “Subject not found.”
2. Resolve `scope` via `subject.scope_id` + `curriculum.scope_sequences`; if missing → “Scope & Sequence not found.”
3. Render heading (subject title), toolbar placeholders (Add buttons wired in Task 7), term band row, week track with item blocks positioned by `start_week`/`end_week` / `week_count` (CSS grid `grid-template-columns: repeat(week_count, minmax(0,1fr))` or percentage `left`/`width`).
4. Unit vs note distinct classes: `scope-timeline__item--unit` / `--note`.
5. Click item → selected state + inspector (unit title from curriculum.units; Open unit link → `navigate(/units/:id)`; note shows title).
6. Double-click unit → navigate to unit.
7. Empty inspector: “Select an item…”

Do **not** PATCH yet in this task except Open navigation.

- [ ] **Step 2: CSS** — toolbar, grid, term headers, items, inspector column (~320px), banner slot

- [ ] **Step 3: Wire** `renderTeacherScopeSequenceRoute` to `renderScopeTimelineEditor`

- [ ] **Step 4: Tests** — renders term labels + seeded unit title; click selects inspector; missing subject/scope messages; Open unit calls navigate (mock)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: render Scope timeline editor shell with inspector"
```

---

### Task 7: Add Unit + Add note + note edit/delete

**Files:**
- Modify: `src/teacher/sections/scope-timeline.ts`
- Modify: `tests/unit/scope-timeline.test.ts`

- [ ] **Step 1: Add Unit**

Toolbar button opens a simple modal/list of `curriculum.units` where `unit.subject_id === subject.id` and `unit.id` not already on timeline. On choose:
- `span = 4`
- `start = findFirstFreeStart(week_count, span, items) ?? 1` (if null, place at 1 and allow overlap **or** show banner “No free span” — prefer banner and abort)
- Append unit item with new id (`ti_${crypto.randomUUID()}` or `ti_unit_${unitId}`)
- `await patchScopeSequence` → replace local scope from response / refetch callback

- [ ] **Step 2: Add note**

Create note title `"Note"`, span 1, at selected item’s `start_week` if selection else week 1 (or first free). PATCH.

- [ ] **Step 3: Inspector note**

- ContentEditable or input for title; on blur PATCH  
- Delete button removes item and PATCH  
- Unit inspector: Open unit + “Remove from timeline” (delete item only)

- [ ] **Step 4: Tests** — add unit appears; duplicate unit not listed; add note; delete note; PATCH called (mock `patchScopeSequence`)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add Unit and note actions on Scope timeline"
```

---

### Task 8: Drag move / resize + persist

**Files:**
- Modify: `src/teacher/sections/scope-timeline.ts`
- Optionally Create: `src/scope/timeline-drag.ts` if drag math deserves isolation
- Modify: `tests/unit/scope-timeline.test.ts` (+ drag helper unit tests)

- [ ] **Step 1: Pointer model**

- Item body `pointerdown` → mode `move`; record start week + pointer X  
- Left/right handle elements → mode `resize-start` / `resize-end`  
- `pointermove` on window: convert deltaX / trackWidth * week_count → week delta; apply `clampSpan`; update DOM position optimistically  
- `pointerup`: if weeks changed, PATCH; on failure restore previous items + banner “Unable to save timeline.”

Snap: use `Math.round` on week positions.

- [ ] **Step 2: Tests**

Prefer testing a pure `applyDragDelta(mode, item, deltaWeeks, weekCount)` helper:

```ts
export function applyDragDelta(
  mode: 'move' | 'resize-start' | 'resize-end',
  item: { start_week: number; end_week: number },
  deltaWeeks: number,
  weekCount: number
): { start_week: number; end_week: number }
```

UI test: simulate pointer events if happy-dom allows; otherwise helper + smoke that handles exist in DOM.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: drag move and resize Scope timeline items"
```

---

### Task 9: Full regression

- [ ] **Step 1:** `npm run test:unit` — all pass  
- [ ] **Step 2:** `npx tsc -p tsconfig.json --noEmit`  
- [ ] **Step 3:** Fix fallout; commit only if needed  

```bash
git commit -m "fix: Scope timeline regression follow-ups"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| ScopeSequence model + week indices | 1–2 |
| Curriculum includes scopes | 3 |
| PATCH timeline_items | 4 |
| Week clamp / free placement | 5 |
| Timeline + inspector layout | 6 |
| Add Unit / Add note / delete / edit | 7 |
| Drag move/resize + persist | 8 |
| Teachers only; no document/student | (by omission) |
| Seed Eng Adv scope | 2 |

---

## Execution notes

- Prefer worktree under `.worktrees/` for subagent-driven development  
- Do not push unless asked  
- Drag UX is the riskiest task — keep math in pure helpers tested first  
