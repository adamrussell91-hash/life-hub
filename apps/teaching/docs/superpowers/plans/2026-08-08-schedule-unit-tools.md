# Schedule Unit & Schedule Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers schedule a Unit onto a Class (meeting pattern + start date) and edit the schedule (change date, reorder, set current) with durable mock + Netlify writes.

**Architecture:** Pure `generateScheduleDates` + schedule-unit apply helpers; Class gains `meeting_days`; new POST/PATCH APIs mirrored in mock-api and Netlify; Class page modal wizard + inline schedule row actions; refetch curriculum after writes.

**Tech Stack:** TypeScript, Zod, Vite, Vitest, existing `apiPost`/`apiPut` client (+ new `apiPatch`), Netlify Functions, teacher Class page

**Spec:** `docs/superpowers/specs/2026-08-08-schedule-unit-tools-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schedule/generate-dates.ts` | `generateScheduleDates` |
| `src/schedule/schedule-unit.ts` | Pure apply: missing lessons, append orders, class field updates |
| `src/schedule/reorder.ts` | Swap schedule_order up/down for a class |
| `src/schemas/class.ts` | Add optional `meeting_days` |
| `fixtures/seed.json` | Set `meeting_days` on seed class |
| `src/api/client.ts` | Add `apiPatch` |
| `scripts/mock-api.ts` | Routes for schedule-unit, PATCH scheduled-lesson, PATCH class |
| `netlify/functions/schedule-unit.mts` | `POST /api/classes/:classId/schedule-unit` |
| `netlify/functions/scheduled-lesson.mts` | `PATCH /api/scheduled-lessons/:id` |
| `netlify/functions/class.mts` | `PATCH /api/classes/:id` |
| `src/teacher/sections/classes.ts` | Schedule actions + Schedule unit button |
| `src/teacher/sections/schedule-unit-modal.ts` | Multi-step modal |
| `src/teacher/schedule-api.ts` | Thin client wrappers around new endpoints |
| `src/styles/app.css` | Modal + schedule action styles |
| Tests | generate-dates, schedule-unit, API routes, classes UI, modal |

---

### Task 1: `generateScheduleDates` helper

**Files:**
- Create: `src/schedule/generate-dates.ts`
- Create: `tests/unit/generate-dates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { generateScheduleDates } from '@/schedule/generate-dates';

describe('generateScheduleDates', () => {
  it('includes start date when it is a meeting day', () => {
    // 2026-08-10 is Monday
    expect(
      generateScheduleDates({
        startDate: '2026-08-10',
        meetingDays: [1, 2, 3, 4, 5],
        lessonCount: 3
      })
    ).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('skips weekends for Mon–Fri pattern', () => {
    expect(
      generateScheduleDates({
        startDate: '2026-08-14', // Friday
        meetingDays: [1, 2, 3, 4, 5],
        lessonCount: 2
      })
    ).toEqual(['2026-08-14', '2026-08-17']); // Mon
  });

  it('places only Mon/Wed/Fri', () => {
    expect(
      generateScheduleDates({
        startDate: '2026-08-10',
        meetingDays: [1, 3, 5],
        lessonCount: 4
      })
    ).toEqual(['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17']);
  });

  it('snaps forward when start is not a meeting day', () => {
    // 2026-08-11 is Tuesday; pattern Mon/Wed/Fri
    expect(
      generateScheduleDates({
        startDate: '2026-08-11',
        meetingDays: [1, 3, 5],
        lessonCount: 1
      })
    ).toEqual(['2026-08-12']);
  });

  it('throws on empty meetingDays or non-positive lessonCount', () => {
    expect(() =>
      generateScheduleDates({ startDate: '2026-08-10', meetingDays: [], lessonCount: 1 })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/generate-dates.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

`src/schedule/generate-dates.ts`:

```ts
/** ISO weekday: 1=Mon … 7=Sun. v1 callers use 1–5 only. */
export function utcIsoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

export function generateScheduleDates(input: {
  startDate: string;
  meetingDays: number[];
  lessonCount: number;
}): string[] {
  const days = [...new Set(input.meetingDays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 0 || input.lessonCount < 1) {
    throw new Error('Invalid meetingDays or lessonCount');
  }

  const out: string[] = [];
  let [y, m, d] = input.startDate.split('-').map(Number);
  let cursor = new Date(Date.UTC(y, m - 1, d));

  while (out.length < input.lessonCount) {
    const ymd = formatYmd(cursor);
    if (days.includes(utcIsoWeekday(ymd))) {
      out.push(ymd);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git add src/schedule/generate-dates.ts tests/unit/generate-dates.test.ts
git commit -m "feat: add generateScheduleDates helper"
```

---

### Task 2: Class `meeting_days` + seed

**Files:**
- Modify: `src/schemas/class.ts`
- Modify: `tests/unit/schemas-class.test.ts`
- Modify: `fixtures/seed.json`
- Modify: `tests/unit/seed.test.ts` (if it asserts class shape)

- [ ] **Step 1: Failing schema test**

Add to `schemas-class.test.ts`:

```ts
  it('accepts meeting_days', () => {
    const cls = ClassSchema.parse({
      /* existing valid class fields… */
      meeting_days: [1, 3, 5]
    });
    expect(cls.meeting_days).toEqual([1, 3, 5]);
  });
```

- [ ] **Step 2: Run fail / implement**

```ts
// in ClassSchema:
meeting_days: z.array(z.number().int().min(1).max(7)).optional(),
```

- [ ] **Step 3: Seed** — on `class_2026_12engadv1` add `"meeting_days": [1, 2, 3, 4, 5]` (matches current daily Aug schedule).

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: add Class meeting_days field"
```

---

### Task 3: `apiPatch` client helper

**Files:**
- Modify: `src/api/client.ts`
- Modify: `tests/unit/api-client.test.ts` (add PATCH case if pattern exists)

- [ ] **Step 1: Add**

```ts
export function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>('PATCH', path, { ...options, body });
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add apiPatch client helper"
```

---

### Task 4: Pure schedule-unit apply helper

**Files:**
- Create: `src/schedule/schedule-unit.ts`
- Create: `src/schedule/reorder.ts`
- Create: `tests/unit/schedule-unit.test.ts`

- [ ] **Step 1: Failing tests for apply**

```ts
import { describe, it, expect } from 'vitest';
import { applyScheduleUnit } from '@/schedule/schedule-unit';
import { reorderScheduledLesson } from '@/schedule/reorder';
import type { Class, ScheduledLesson, Unit } from '@/schemas';

// Build minimal Class, Unit with lesson_ids [l1,l2,l3], empty scheduled →
// expect 3 created, orders 1..3, dates from generateScheduleDates

// With l1 already scheduled → expect only l2,l3 appended with orders after max

// Fully scheduled → result.ok false / throw with code already_scheduled
```

- [ ] **Step 2: Implement `applyScheduleUnit`**

Return type:

```ts
export type ScheduleUnitResult =
  | {
      ok: true;
      class: Class;
      created: ScheduledLesson[];
    }
  | { ok: false; code: string; message: string };

export function applyScheduleUnit(input: {
  cls: Class;
  unit: Unit;
  existing: ScheduledLesson[]; // all for this class
  startDate: string;
  meetingDays: number[];
  nowIso: string;
  idFactory: (lessonId: string) => string; // e.g. scheduled_${classShort}_${lessonId}
}): ScheduleUnitResult
```

Logic per spec: filter missing lesson_ids; generate dates; append orders; update class fields (`meeting_days`, `active_unit_ids`, conditional `current_*`).

- [ ] **Step 3: Implement `reorderScheduledLesson`**

```ts
export function reorderScheduledLesson(
  rows: ScheduledLesson[], // same class, sorted by schedule_order
  id: string,
  direction: 'up' | 'down'
): ScheduledLesson[] // new array with swapped schedule_order values; no-op at ends
```

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: add schedule-unit and reorder helpers"
```

---

### Task 5: `POST /api/classes/:classId/schedule-unit` (mock + Netlify)

**Files:**
- Create: `netlify/functions/schedule-unit.mts`
- Modify: `scripts/mock-api.ts`
- Modify: `tests/unit/netlify-content-routes.test.ts` (or new `tests/unit/schedule-unit-api.test.ts`)
- Create: `src/teacher/schedule-api.ts` (client wrapper)

- [ ] **Step 1: Failing API test** (mock-api or Netlify fake store)

Assert:
- Auth required
- Happy path creates blobs / returns created lessons
- Already scheduled → 400
- Persists `meeting_days` on class

- [ ] **Step 2: Mock-api route**

```ts
const SCHEDULE_UNIT_RE = /^\/api\/classes\/([^/]+)\/schedule-unit$/;
// POST → load class + unit from store; applyScheduleUnit; setJSON each created + class
```

- [ ] **Step 3: Netlify function**

`config.path = '/api/classes/:classId/schedule-unit'`  
Same auth/cors pattern as `lesson.mts`. Use `classKey`, `scheduledLessonKey`, `unitKey`, `applyScheduleUnit`, `generateScheduleDates` via meeting days resolution.

Default meeting days if unset: `[1,2,3,4,5]`.

Id factory: `scheduled_${classId.replace(/^class_/, '')}_${lessonId.replace(/^lesson_/, '')}` or simpler `scheduled_${classId}_${lessonId}` — keep unique; prefer readable `scheduled_${lessonId}_${Date.now()}` only if collisions risk — **use** `scheduled_${classId}_${lessonId}` (stable; reject if key exists).

- [ ] **Step 4: Client wrapper**

```ts
// src/teacher/schedule-api.ts
import { apiPost, apiPatch } from '@/api/client';
import type { Class, ScheduledLesson } from '@/schemas';

export function postScheduleUnit(
  classId: string,
  body: { unit_id: string; start_date: string; meeting_days?: number[] }
): Promise<{ class: Class; scheduled_lessons: ScheduledLesson[] }> {
  return apiPost(`/api/classes/${classId}/schedule-unit`, body);
}
```

- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "feat: add schedule-unit API"
```

---

### Task 6: `PATCH /api/scheduled-lessons/:id`

**Files:**
- Create: `netlify/functions/scheduled-lesson.mts`
- Modify: `scripts/mock-api.ts`
- Modify: tests
- Modify: `src/teacher/schedule-api.ts`

- [ ] **Step 1: Failing tests** — patch date; reorder up/down; 404 unknown

- [ ] **Step 2: Implement**

Body: `{ date?: string; direction?: 'up' | 'down' }`  
Load all class scheduled lessons for reorder; write updated rows; return updated lesson (and optionally siblings).

- [ ] **Step 3: Client**

```ts
export function patchScheduledLesson(
  id: string,
  body: { date?: string; direction?: 'up' | 'down' }
): Promise<ScheduledLesson> {
  return apiPatch(`/api/scheduled-lessons/${id}`, body);
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add scheduled-lesson PATCH API"
```

---

### Task 7: `PATCH /api/classes/:id` (meeting_days + current)

**Files:**
- Create: `netlify/functions/class.mts`
- Modify: `scripts/mock-api.ts`
- Modify: tests + `schedule-api.ts`

- [ ] **Step 1: Tests** — set `current_scheduled_lesson_id`; reject id for other class; update `meeting_days`

- [ ] **Step 2: Implement** — validate with `ClassSchema` after merge; persist via `classKey`

- [ ] **Step 3: Client**

```ts
export function patchClass(
  id: string,
  body: { meeting_days?: number[]; current_scheduled_lesson_id?: string | null }
): Promise<Class> {
  return apiPatch(`/api/classes/${id}`, body);
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add class PATCH API"
```

---

### Task 8: Class page schedule row actions

**Files:**
- Modify: `src/teacher/sections/classes.ts`
- Modify: `tests/unit/sections-classes.test.ts`
- Modify: `src/styles/app.css`
- Modify: `src/app/main.ts` (pass refresh callback if needed)

- [ ] **Step 1: Failing UI tests**

```ts
it('exposes date, reorder, and set-current controls on schedule rows', () => {
  renderClassPage(canvas, curriculum, 'class_2026_12engadv1', { onScheduleMutated: vi.fn() });
  expect(canvas.querySelector('[data-schedule-action="set-current"]')).toBeTruthy();
  expect(canvas.querySelector('[data-schedule-action="up"]')).toBeTruthy();
});
```

- [ ] **Step 2: Implement**

Extend `renderClassPage` options:

```ts
export interface ClassPageOptions {
  onScheduleMutated?: () => void | Promise<void>;
}
```

On action: call `patchScheduledLesson` / `patchClass`, then `await onScheduleMutated?.()` (main refetches curriculum + re-renders). Mark current row with class `is-current`. Date: `<input type="date">` blur/change → PATCH.

Show **Schedule unit** button in schedule section header calling `options.onScheduleUnit?.()` (wired in Task 9).

- [ ] **Step 3: Wire main.ts** `renderTeacherClassRoute` to refetch curriculum after mutations (reuse `loadNavAndHandleErrors` / dedicated refresh).

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: add class schedule row edit actions"
```

---

### Task 9: Schedule unit modal

**Files:**
- Create: `src/teacher/sections/schedule-unit-modal.ts`
- Create: `tests/unit/schedule-unit-modal.test.ts`
- Modify: `src/teacher/sections/classes.ts` / `main.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Failing tests** — three steps render; Confirm calls `postScheduleUnit` with unit_id, start_date, meeting_days; disabled unit when fully scheduled

- [ ] **Step 2: Implement modal**

Steps per spec:
1. Unit list (subject units; disable fully scheduled)
2. Start date + Mon–Fri toggles (prefill class.meeting_days or `[1,2,3,4,5]`)
3. Preview via `generateScheduleDates` + missing lesson titles; Confirm → API

Default start: day after last class scheduled date, snapped with a one-day `generateScheduleDates` trick or small `nextMeetingDate` helper in `generate-dates.ts`.

- [ ] **Step 3: Wire** Schedule unit button → open modal; on success close + `onScheduleMutated`

- [ ] **Step 4: CSS** for `.schedule-modal`, backdrop, steps

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add schedule unit modal"
```

---

### Task 10: Full verification

- [ ] **Step 1:** `npm test` — all green  
- [ ] **Step 2:** `npm run build`  
- [ ] **Step 3:** Manual sanity checklist (optional): Class page → Schedule unit → append rows; change date; reorder; set current; Home still shows schedule  
- [ ] **Step 4:** Commit polish only if needed  

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| `generateScheduleDates` | 1 |
| `meeting_days` on Class + seed | 2 |
| `apiPatch` | 3 |
| Pure schedule-unit / reorder | 4 |
| POST schedule-unit | 5 |
| PATCH scheduled-lesson | 6 |
| PATCH class (current / meeting_days) | 7 |
| Inline schedule edits | 8 |
| Modal wizard | 9 |
| Verify | 10 |

## Notes for implementers

- Prefer **refetch curriculum** after writes over merging partial responses into client state.  
- Keep modal logic out of `classes.ts` if the file grows past ~400 lines — `schedule-unit-modal.ts` owns wizard DOM.  
- Do not implement delivery status, remove, or student prev/next.
