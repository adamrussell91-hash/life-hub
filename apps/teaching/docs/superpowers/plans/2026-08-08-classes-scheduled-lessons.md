# Classes & Scheduled Lessons (Browse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Class + Scheduled Lesson models and seed data; emit them from curriculum; replace demo `home_schedule` so Home Today/Week uses scheduled lessons; ship `/classes` list and hybrid `/classes/:classId` page (generated sections live, manual placeholders).

**Architecture:** Zod schemas + blob keys (`classes/`, `scheduled_lessons/`). Curriculum API returns `classes` and `scheduled_lessons` (drop `schedule` / `meta/home_schedule`). Home-model filters Scheduled Lessons by date; Class lookup supplies class labels. New Classes section UI; router `teacher-class`.

**Tech Stack:** TypeScript, Zod, Vite, Vitest, existing teacher shell / curriculum fetch

**Spec:** `docs/superpowers/specs/2026-08-08-classes-scheduled-lessons-design.md`

**Seed anchor:** `2026-08-12` (unchanged)

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/class.ts` | `ClassSchema` |
| `src/schemas/scheduled-lesson.ts` | `ScheduledLessonSchema` |
| `src/schemas/index.ts` | Re-exports |
| `src/storage/keys.ts` | `classKey`, `scheduledLessonKey`; remove `homeScheduleKey` |
| `fixtures/seed.json` | `classes`, `scheduled_lessons`; remove `home_schedule` |
| `scripts/mock-store.ts` | Load/persist classes + scheduled lessons |
| `scripts/mock-api.ts` | Curriculum emit; drop home schedule |
| `scripts/seed-blobs.mjs` | Write class + scheduled_lesson blobs |
| `netlify/functions/curriculum.mts` | Same emit |
| `netlify/functions/_shared/blobs.mts` | Key re-exports |
| `src/teacher/nav.ts` | CurriculumResponse: classes, scheduled_lessons; remove ScheduleEntry/schedule |
| `src/teacher/home-model.ts` | Today/week over ScheduledLesson |
| `src/teacher/home.ts` | Class label on rows |
| `src/app/router.ts` | `teacher-class` |
| `src/teacher/section.ts` | Map `teacher-class` → `classes` |
| `src/teacher/sections/classes.ts` | List + hybrid page |
| `src/app/main.ts` | Mount Class routes |
| `src/styles/app.css` | Class list / page styles |
| Tests | schemas, keys, curriculum, home-model, home, classes, router |

---

### Task 1: Class + ScheduledLesson schemas

**Files:**
- Create: `src/schemas/class.ts`
- Create: `src/schemas/scheduled-lesson.ts`
- Modify: `src/schemas/index.ts`
- Create: `tests/unit/schemas-class.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { ClassSchema } from '@/schemas/class';
import { ScheduledLessonSchema } from '@/schemas/scheduled-lesson';

const ISO = '2026-01-01T00:00:00.000Z';

describe('ClassSchema', () => {
  it('parses a class', () => {
    const cls = ClassSchema.parse({
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_aotfw'],
      current_unit_id: 'unit_aotfw',
      current_scheduled_lesson_id: 'scheduled_aotfw_008',
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    expect(cls.code).toBe('12ENGADV1');
  });

  it('rejects empty code', () => {
    expect(() =>
      ClassSchema.parse({
        id: 'c1',
        type: 'class',
        code: '',
        title: 'X',
        academic_year: 2026,
        year_id: 'year_12',
        subject_id: 's1',
        active_unit_ids: [],
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      })
    ).toThrow();
  });
});

describe('ScheduledLessonSchema', () => {
  it('parses a scheduled lesson', () => {
    const row = ScheduledLessonSchema.parse({
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      lesson_id: 'lesson_aotfw_008',
      unit_id: 'unit_aotfw',
      date: '2026-08-12',
      schedule_order: 3,
      delivery_status: 'planned',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    expect(row.date).toBe('2026-08-12');
  });

  it('rejects invalid delivery_status', () => {
    expect(() =>
      ScheduledLessonSchema.parse({
        id: 's1',
        type: 'scheduled_lesson',
        class_id: 'c1',
        lesson_id: 'l1',
        unit_id: 'u1',
        date: '2026-08-12',
        schedule_order: 1,
        delivery_status: 'done',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/schemas-class.test.ts
```

- [ ] **Step 3: Implement schemas**

`src/schemas/class.ts`:

```ts
import { z } from 'zod';
import { CommonFields } from './common';

export const ClassSchema = z.object({
  ...CommonFields,
  type: z.literal('class'),
  code: z.string().min(1),
  display_name: z.string().min(1).optional(),
  academic_year: z.number().int(),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  active_unit_ids: z.array(z.string().min(1)),
  current_unit_id: z.string().min(1).optional(),
  current_scheduled_lesson_id: z.string().min(1).optional()
});

export type Class = z.infer<typeof ClassSchema>;
```

`CommonFields` already supplies `id`, `title`, `slug`, `status`, timestamps, `schema_version`. Include `slug: '12engadv1'` in the parse test fixture.

`src/schemas/scheduled-lesson.ts`:

```ts
import { z } from 'zod';
import { IsoDateSchema, StatusSchema } from './common';

export const DeliveryStatusSchema = z.enum([
  'planned',
  'current',
  'delivered',
  'skipped',
  'rescheduled'
]);

export const ScheduledLessonSchema = z.object({
  id: z.string().min(1),
  type: z.literal('scheduled_lesson'),
  class_id: z.string().min(1),
  lesson_id: z.string().min(1),
  unit_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schedule_order: z.number().int(),
  delivery_status: DeliveryStatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
});

export type ScheduledLesson = z.infer<typeof ScheduledLessonSchema>;
```

(Scheduled lessons are not CommonFields entities — no slug/status required.)

Re-export from `src/schemas/index.ts`.

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git add src/schemas/class.ts src/schemas/scheduled-lesson.ts src/schemas/index.ts tests/unit/schemas-class.test.ts
git commit -m "feat: add Class and ScheduledLesson schemas"
```

---

### Task 2: Storage keys + seed data

**Files:**
- Modify: `src/storage/keys.ts`
- Modify: `tests/unit/storage-keys.test.ts`
- Modify: `fixtures/seed.json`

- [ ] **Step 1: Failing key tests**

Replace `homeScheduleKey` test with:

```ts
  it('builds class and scheduled lesson keys', () => {
    expect(classKey('class_2026_12engadv1')).toBe('classes/class_2026_12engadv1');
    expect(scheduledLessonKey('scheduled_aotfw_008')).toBe(
      'scheduled_lessons/scheduled_aotfw_008'
    );
  });
```

Remove `homeScheduleKey` import/assertion.

- [ ] **Step 2: Run fail**
- [ ] **Step 3: Implement keys; remove `homeScheduleKey`**

```ts
export function classKey(id: string): string {
  return `classes/${id}`;
}

export function scheduledLessonKey(id: string): string {
  return `scheduled_lessons/${id}`;
}
```

- [ ] **Step 4: Update seed.json**

1. **Delete** top-level `home_schedule`.
2. **Add** `schedule_anchor_date: "2026-08-12"` at top level (or keep only on curriculum default — prefer top-level on seed for mock-store to read).
3. **Add** `classes` array with one class:

```json
{
  "id": "class_2026_12engadv1",
  "type": "class",
  "code": "12ENGADV1",
  "title": "Year 12 English Advanced",
  "slug": "12engadv1",
  "display_name": "12ENGADV1",
  "academic_year": 2026,
  "year_id": "year_12",
  "subject_id": "subject_y12_engadv",
  "active_unit_ids": ["unit_aotfw"],
  "current_unit_id": "unit_aotfw",
  "current_scheduled_lesson_id": "scheduled_aotfw_008",
  "status": "active",
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "schema_version": 1
}
```

4. **Add** `scheduled_lessons` mirroring former home_schedule dates:

| id | lesson_id | date | schedule_order |
|----|-----------|------|----------------|
| scheduled_aotfw_006 | lesson_aotfw_006 | 2026-08-10 | 1 |
| scheduled_aotfw_007 | lesson_aotfw_007 | 2026-08-11 | 2 |
| scheduled_aotfw_008 | lesson_aotfw_008 | 2026-08-12 | 3 |
| scheduled_aotfw_001 | lesson_aotfw_001 | 2026-08-13 | 4 |
| scheduled_aotfw_002 | lesson_aotfw_002 | 2026-08-14 | 5 |

All: `class_id: class_2026_12engadv1`, `unit_id: unit_aotfw`, `delivery_status: planned` (008 may be `current`).

5. Optionally set subject `class_ids: ["class_2026_12engadv1"]` on English Advanced.

- [ ] **Step 5: Keys tests PASS** (seed JSON validity checked in later tasks)
- [ ] **Step 6: Commit**

```bash
git add src/storage/keys.ts tests/unit/storage-keys.test.ts fixtures/seed.json
git commit -m "feat: add class storage keys and seed scheduled lessons"
```

---

### Task 3: Mock-store, seed-blobs, curriculum API

**Files:**
- Modify: `scripts/mock-store.ts`
- Modify: `scripts/seed-blobs.mjs`
- Modify: `scripts/mock-api.ts`
- Modify: `netlify/functions/curriculum.mts`
- Modify: `netlify/functions/_shared/blobs.mts`
- Modify: `src/teacher/nav.ts` (CurriculumResponse shape)
- Modify: `tests/unit/netlify-content-routes.test.ts` + all CurriculumResponse fixtures

- [ ] **Step 1: Update nav types first** (so API + clients align)

```ts
import type { Year, Subject, Unit, Class, ScheduledLesson } from '@/schemas';

// Remove ScheduleEntry

export interface CurriculumResponse {
  years: Year[];
  subjects: Subject[];
  units: Unit[];
  lessons: CurriculumLessonSummary[];
  classes: Class[];
  scheduled_lessons: ScheduledLesson[];
  schedule_anchor_date: string;
}
```

- [ ] **Step 2: MockStore SeedData**

```ts
export type SeedData = {
  years: unknown[];
  subjects: unknown[];
  units: unknown[];
  lessons: unknown[];
  classes: unknown[];
  scheduled_lessons: unknown[];
  schedule_anchor_date: string;
};
```

`loadSeed`: write each class via `classKey`, each scheduled lesson via `scheduledLessonKey`; store `schedule_anchor_date` at `meta/schedule_anchor_date` **or** always return constant from API. Prefer blob:

```ts
export function scheduleAnchorKey(): string {
  return 'meta/schedule_anchor_date';
}
```

Simplest for this slice: **hardcode default `2026-08-12` in curriculum builders** and also read optional `seed.schedule_anchor_date` in mock from SeedData without a blob. Netlify: constant unless `meta/schedule_anchor_date` JSON `{ "date": "..." }` written by seed-blobs.

Plan choice: seed-blobs + mock-store write `meta/schedule_anchor_date` as `{ date: seed.schedule_anchor_date }`.

- [ ] **Step 3: Curriculum builders**

Mock + Netlify:

- List/load classes and scheduled_lessons (mock: from seed ids arrays like years; Netlify: `store.list({ prefix: 'classes/' })` etc.)
- Return `{ ..., classes, scheduled_lessons, schedule_anchor_date }`
- **Remove** all `homeScheduleKey` / `schedule: entries` code
- Update `_shared/blobs.mts` exports

- [ ] **Step 4: Netlify tests**

Replace home_schedule seeding with class + scheduled_lesson seeds; assert:

```ts
expect(body.data.classes).toEqual(expect.arrayContaining([
  expect.objectContaining({ id: 'class_2026_12engadv1', code: '12ENGADV1' })
]));
expect(body.data.scheduled_lessons.length).toBeGreaterThan(0);
expect(body.data.schedule).toBeUndefined();
expect(body.data.schedule_anchor_date).toBe('2026-08-12');
```

- [ ] **Step 5: Fix all test fixtures** — `schedule: []` → `classes: []`, `scheduled_lessons: []` (or seed-like data in home tests)

- [ ] **Step 6: `npm test` + `npm run build` green** (home-model/home will break until Task 4 — update those in Task 4; for this task keep home compiling by temporary adapters **or** do Task 3+4 in sequence in same worktree without leaving broken main). **Prefer:** Task 3 commit may leave home-model still importing ScheduleEntry — so **Task 3 must include nav type change AND a minimal home-model compile fix** (rename filter field `date` vs `scheduled_date`) **or** combine type migration into Task 4.

**Practical sequencing:** In Task 3, update curriculum/API/seed only; keep exporting a deprecated thin adapter in nav:

```ts
/** @deprecated temporary — remove in Task 4 */
export type ScheduleEntry = { ... derived ...}
```

**Better:** Complete home-model migration in Task 4 immediately after; Task 3 ends with fixtures using `classes: []`, `scheduled_lessons: []`, and home tests temporarily skipped/failing is unacceptable.

**Required:** Task 3 Step 5 updates home-model + home.ts + home tests to compile against ScheduledLesson (full UI polish in Task 4 if needed). Minimum compile-safe home-model:

```ts
export function selectTodaySchedule(
  scheduled: ScheduledLesson[],
  anchorDate: string
): ScheduledLesson[] {
  return scheduled.filter((e) => e.date === anchorDate);
}

export function groupWeekSchedule(
  scheduled: ScheduledLesson[],
  anchorDate: string
): WeekDayGroup[] { /* filter e.date */ }
```

And home.ts resolves class title via `curriculum.classes`.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: emit classes and scheduled lessons from curriculum API"
```

---

### Task 4: Home consumes ScheduledLesson + class labels

**Files:**
- Modify: `src/teacher/home-model.ts`
- Modify: `src/teacher/home.ts`
- Modify: `tests/unit/home-model.test.ts`
- Modify: `tests/unit/teacher-home.test.ts`

- [ ] **Step 1: Update home-model tests** to use `ScheduledLesson` fixtures (`date` field)
- [ ] **Step 2: Fail / implement**
- [ ] **Step 3: Update home.ts**

- Build `classesById` map  
- Schedule row primary text: `${class.code} · ${lesson.title}` or `class.title`  
- Use `selectTodaySchedule(curriculum.scheduled_lessons, anchor)`  

- [ ] **Step 4: Tests PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat: drive home schedule from scheduled lessons"
```

---

### Task 5: Router `teacher-class` + section mapping

**Files:**
- Modify: `src/app/router.ts`
- Modify: `src/teacher/section.ts`
- Modify: `tests/unit/router.test.ts`
- Modify: `tests/unit/section.test.ts` (if exists)

- [ ] **Step 1: Failing router test**

```ts
  it('matches teacher class detail', () => {
    expect(match('/classes/class_2026_12engadv1')).toEqual({
      name: 'teacher-class',
      params: { classId: 'class_2026_12engadv1' },
      requiresAuth: true,
      path: '/classes/class_2026_12engadv1'
    });
  });
```

Match **after** exact `/classes` check:

```ts
  const teacherClass = path.match(/^\/classes\/([^/]+)$/);
  if (teacherClass) {
    return {
      name: 'teacher-class',
      params: { classId: teacherClass[1] },
      requiresAuth: true,
      path
    };
  }
```

- [ ] **Step 2: `sectionFromRoute`** — `case 'teacher-class': return 'classes';`
- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat: add teacher class detail route"
```

---

### Task 6: Classes list + hybrid Class page

**Files:**
- Create: `src/teacher/sections/classes.ts`
- Create: `tests/unit/sections-classes.test.ts`
- Modify: `src/app/main.ts`
- Modify: `src/styles/app.css`
- Modify: `src/teacher/sections/placeholders.ts` (stop using classes placeholder from main)

- [ ] **Step 1: Failing UI tests**

```ts
describe('classes section', () => {
  it('lists classes with Open to class page', () => { ... });
  it('renders hybrid class page generated sections', () => {
    renderClassPage(canvas, curriculum, 'class_2026_12engadv1');
    expect(canvas.textContent).toContain('12ENGADV1');
    expect(canvas.textContent).toMatch(/Schedule/i);
    expect(canvas.textContent).toMatch(/Announcements/i);
    expect(canvas.textContent).toMatch(/Coming next/i);
  });
  it('shows not found for unknown class', () => { ... });
});
```

- [ ] **Step 2: Implement**

`renderClassesIndex(canvas, curriculum)`  
`renderClassPage(canvas, curriculum, classId)`

Generated sections per spec; manual placeholders with “Coming next.”  
Open lesson → `navigate('/lessons/...')` with preventDefault.  
Class list Open → `navigate('/classes/' + id)`.

- [ ] **Step 3: Wire main.ts**

```ts
case 'teacher-classes':
  renderClassesIndex...
case 'teacher-class':
  renderClassPage(..., match.params.classId)
```

Context bar: list → `Classes`; detail → class code or title.

- [ ] **Step 4: CSS** for `.class-list`, `.class-page`, sections
- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "feat: add classes list and hybrid class page"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `npm test` — all green  
- [ ] **Step 2:** `npm run build`  
- [ ] **Step 3:** Grep for `home_schedule` / `homeScheduleKey` / `ScheduleEntry` — should be gone (or only in docs)  
- [ ] **Step 4:** Optional smoke — Home Today shows class code; Classes → class page schedule  
- [ ] **Step 5:** Commit polish only if needed  

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Class / ScheduledLesson schemas | 1 |
| Seed + keys; drop home_schedule | 2–3 |
| Curriculum emit | 3 |
| Home from scheduled lessons | 4 |
| `/classes/:id` route | 5 |
| List + hybrid page | 6 |
| Verify | 7 |

No intentional placeholders beyond grepping fixtures when CurriculumResponse shape changes.
