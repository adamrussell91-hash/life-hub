# Student Schedule Prev/Next Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Class-scoped student lesson route with footer Prev/Next along the class’s published schedule, plus Back to class and Back to unit; bare `/s/lessons/:id` unchanged.

**Architecture:** Add router match `student-class-lesson` for `/s/classes/:classId/lessons/:lessonId`. Extend `mountStudentLessonView` with optional `classId`: when set, load published class + lesson, validate membership/published, render dual back links and footer neighbors from a pure `scheduleNeighbors` helper. Class page Open hrefs point at the class-scoped URL. No new APIs.

**Tech Stack:** TypeScript, Vite, Vitest, existing `fetchPublishedClass` / published lesson APIs, app router `navigate`

**Spec:** `docs/superpowers/specs/2026-08-08-student-schedule-prev-next-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schedule/schedule-neighbors.ts` | Pure published-chain prev/next helper |
| `tests/unit/schedule-neighbors.test.ts` | Helper unit tests |
| `src/app/router.ts` | `student-class-lesson` route match (before bare class) |
| `tests/unit/router.test.ts` | Route matching + auth matrix |
| `src/student/lesson-view.ts` | Optional `classId`; dual backs; footer nav via `navigate` |
| `tests/unit/lesson-view.test.ts` | Bare + class-scoped behaviors |
| `src/student/class-view.ts` | Open → class-scoped lesson URLs |
| `tests/unit/class-view.test.ts` | Assert new hrefs |
| `src/app/main.ts` | Wire `student-class-lesson` |
| `src/styles/app.css` | Footer nav + multi-back header layout |

---

### Task 1: `scheduleNeighbors` helper

**Files:**
- Create: `src/schedule/schedule-neighbors.ts`
- Create: `tests/unit/schedule-neighbors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { scheduleNeighbors } from '@/schedule/schedule-neighbors';

type Row = {
  lesson_id: string;
  published: boolean;
  schedule_order: number;
  title: string;
};

function rows(partial: Array<Partial<Row> & Pick<Row, 'lesson_id' | 'published' | 'schedule_order'>>): Row[] {
  return partial.map((r) => ({ title: r.title ?? r.lesson_id, ...r }));
}

describe('scheduleNeighbors', () => {
  it('returns adjacent published neighbors and skips unpublished', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: false, schedule_order: 2, title: 'B' },
      { lesson_id: 'c', published: true, schedule_order: 3, title: 'C' },
      { lesson_id: 'd', published: true, schedule_order: 4, title: 'D' }
    ]);

    expect(scheduleNeighbors(schedule, 'c')).toEqual({
      prev: { lesson_id: 'a', title: 'A' },
      next: { lesson_id: 'd', title: 'D' }
    });
  });

  it('omits prev on first published and next on last', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: true, schedule_order: 2, title: 'B' }
    ]);

    expect(scheduleNeighbors(schedule, 'a')).toEqual({
      next: { lesson_id: 'b', title: 'B' }
    });
    expect(scheduleNeighbors(schedule, 'b')).toEqual({
      prev: { lesson_id: 'a', title: 'A' }
    });
  });

  it('returns empty object when lessonId missing from published chain', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1 },
      { lesson_id: 'draft', published: false, schedule_order: 2 }
    ]);
    expect(scheduleNeighbors(schedule, 'draft')).toEqual({});
    expect(scheduleNeighbors(schedule, 'missing')).toEqual({});
  });

  it('sorts by schedule_order before filtering', () => {
    const schedule = rows([
      { lesson_id: 'c', published: true, schedule_order: 3, title: 'C' },
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: true, schedule_order: 2, title: 'B' }
    ]);
    expect(scheduleNeighbors(schedule, 'b')).toEqual({
      prev: { lesson_id: 'a', title: 'A' },
      next: { lesson_id: 'c', title: 'C' }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/schedule-neighbors.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/schedule/schedule-neighbors.ts
export type ScheduleNeighborRow = {
  lesson_id: string;
  published: boolean;
  schedule_order: number;
  title: string;
};

export type ScheduleNeighbor = {
  lesson_id: string;
  title: string;
};

export function scheduleNeighbors(
  schedule: ScheduleNeighborRow[],
  lessonId: string
): { prev?: ScheduleNeighbor; next?: ScheduleNeighbor } {
  const published = [...schedule]
    .filter((row) => row.published)
    .sort((a, b) => a.schedule_order - b.schedule_order);

  const index = published.findIndex((row) => row.lesson_id === lessonId);
  if (index < 0) return {};

  const result: { prev?: ScheduleNeighbor; next?: ScheduleNeighbor } = {};
  const prev = published[index - 1];
  const next = published[index + 1];
  if (prev) result.prev = { lesson_id: prev.lesson_id, title: prev.title };
  if (next) result.next = { lesson_id: next.lesson_id, title: next.title };
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/schedule-neighbors.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schedule/schedule-neighbors.ts tests/unit/schedule-neighbors.test.ts
git commit -m "feat: add scheduleNeighbors helper for published chain"
```

---

### Task 2: Router — `student-class-lesson`

**Files:**
- Modify: `src/app/router.ts`
- Modify: `tests/unit/router.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/router.test.ts`, add:

```ts
it('matches public student class-scoped lesson view', () => {
  expect(match('/s/classes/class_2026_12engadv1/lessons/lesson_aotfw_008')).toEqual({
    name: 'student-class-lesson',
    params: {
      classId: 'class_2026_12engadv1',
      lessonId: 'lesson_aotfw_008'
    },
    requiresAuth: false,
    path: '/s/classes/class_2026_12engadv1/lessons/lesson_aotfw_008'
  });
});

it('still matches bare student class and bare lesson', () => {
  expect(match('/s/classes/class_2026_12engadv1')?.name).toBe('student-class');
  expect(match('/s/lessons/lesson_aotfw_008')?.name).toBe('student-lesson');
});
```

Also extend any auth/requiresAuth table that lists student routes to include the new path with `false`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/router.test.ts`

Expected: FAIL (`student-class-lesson` not matched / wrong name)

- [ ] **Step 3: Implement route**

In `src/app/router.ts`:

1. Add `'student-class-lesson'` to `RouteName`.
2. Add to `RouteParams`:
   `'student-class-lesson': { classId: string; lessonId: string };`
3. In `match()`, **before** the bare `/s/classes/:id` matcher, add:

```ts
const studentClassLesson = path.match(/^\/s\/classes\/([^/]+)\/lessons\/([^/]+)$/);
if (studentClassLesson) {
  return {
    name: 'student-class-lesson',
    params: { classId: studentClassLesson[1], lessonId: studentClassLesson[2] },
    requiresAuth: false,
    path
  };
}
```

Keep existing bare `student-class` and `student-lesson` matchers unchanged.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- tests/unit/router.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/router.ts tests/unit/router.test.ts
git commit -m "feat: add student-class-lesson route"
```

---

### Task 3: Class page Open → class-scoped URLs

**Files:**
- Modify: `src/student/class-view.ts`
- Modify: `tests/unit/class-view.test.ts`

- [ ] **Step 1: Update failing expectations**

Change Open href assertions from `/s/lessons/...` to:

`/s/classes/${CLASS_ID}/lessons/...`

Cover both schedule Open and current-lesson Open cases.

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test:unit -- tests/unit/class-view.test.ts`

Expected: FAIL on href mismatch

- [ ] **Step 3: Implement**

In `src/student/class-view.ts`, wherever Open links are built (current lesson + schedule rows), set:

```ts
open.href = `/s/classes/${cls.id}/lessons/${lessonId}`;
```

Use `cls.id` (already on `PublishedClass`), not a closed-over mount `classId` alone — same value in practice.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- tests/unit/class-view.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/student/class-view.ts tests/unit/class-view.test.ts
git commit -m "feat: point student Class Open at class-scoped lesson URLs"
```

---

### Task 4: Class-scoped lesson view (chrome + validation + footer)

**Files:**
- Modify: `src/student/lesson-view.ts`
- Modify: `tests/unit/lesson-view.test.ts`
- Modify: `src/styles/app.css`
- Modify: `src/app/main.ts` (wire route — can be same commit if tests need it; prefer wiring in Task 5 if lesson-view tests mount directly)

Lesson-view tests call `mountStudentLessonView` directly — wire main in Task 5.

- [ ] **Step 1: Write failing tests** (append to `tests/unit/lesson-view.test.ts`)

Mock both `/api/published/lessons/:id` and `/api/published/classes/:id`. Pattern:

```ts
import { navigate } from '@/app/router';

vi.mock('@/app/router', async () => {
  const actual = await vi.importActual<typeof import('@/app/router')>('@/app/router');
  return { ...actual, navigate: vi.fn() };
});

const CLASS_ID = 'class_2026_12engadv1';

function publishedLesson() {
  return {
    lesson_id: 'lesson_aotfw_008',
    title: 'Memory',
    unit_id: 'unit_aotfw',
    blocks: [],
    published_at: '2026-02-01T12:00:00.000Z',
    schema_version: 1
  };
}

function publishedClass() {
  return {
    id: CLASS_ID,
    code: '12ENGADV1',
    title: 'Year 12 English Advanced',
    homepage: { announcements: [], resources: [], custom: [] },
    schedule: [
      {
        id: 's1',
        date: '2026-08-11',
        schedule_order: 1,
        lesson_id: 'lesson_aotfw_007',
        title: 'Earlier',
        published: true
      },
      {
        id: 's2',
        date: '2026-08-12',
        schedule_order: 2,
        lesson_id: 'lesson_aotfw_008',
        title: 'Memory',
        published: true
      },
      {
        id: 's3',
        date: '2026-08-13',
        schedule_order: 3,
        lesson_id: 'lesson_aotfw_009',
        title: 'Later',
        published: true
      }
    ],
    active_units: []
  };
}

it('bare mount still has only Back to unit and no footer nav', async () => {
  vi.mocked(apiGet).mockResolvedValue(publishedLesson());
  const root = document.createElement('div');
  document.body.append(root);
  mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

  await vi.waitFor(() => {
    expect(root.querySelector('a.student-surface__back')?.textContent).toBe('Back to unit');
  });
  expect(root.querySelector('.student-lesson__nav')).toBeNull();
  expect(root.querySelector('a.student-surface__back-class')).toBeNull();
});

it('class-scoped mount shows Back to class, Back to unit, and footer neighbors', async () => {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.includes('/published/classes/')) return publishedClass();
    if (path.includes('/published/lessons/')) return publishedLesson();
    throw new Error(path);
  });

  const root = document.createElement('div');
  document.body.append(root);
  mountStudentLessonView({
    root,
    lessonId: 'lesson_aotfw_008',
    classId: CLASS_ID
  });

  await vi.waitFor(() => {
    expect(root.querySelector('a.student-surface__back-class')?.getAttribute('href')).toBe(
      `/s/classes/${CLASS_ID}`
    );
    expect(root.querySelector('a.student-surface__back-unit')?.getAttribute('href')).toBe(
      '/s/units/unit_aotfw'
    );
  });

  const prev = root.querySelector('a.student-lesson__nav-prev') as HTMLAnchorElement;
  const next = root.querySelector('a.student-lesson__nav-next') as HTMLAnchorElement;
  expect(prev.getAttribute('href')).toBe(
    `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_007`
  );
  expect(next.getAttribute('href')).toBe(
    `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_009`
  );

  prev.click();
  expect(navigate).toHaveBeenCalledWith(
    `/s/classes/${CLASS_ID}/lessons/lesson_aotfw_007`
  );
});

it('class-scoped shows not found when lesson not on schedule', async () => {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.includes('/published/classes/')) {
      return { ...publishedClass(), schedule: [] };
    }
    if (path.includes('/published/lessons/')) return publishedLesson();
    throw new Error(path);
  });

  const root = document.createElement('div');
  document.body.append(root);
  mountStudentLessonView({
    root,
    lessonId: 'lesson_aotfw_008',
    classId: CLASS_ID
  });

  await vi.waitFor(() => {
    expect(root.textContent).toContain('Lesson not found');
  });
});

it('class-scoped shows not found when schedule row is unpublished', async () => {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path.includes('/published/classes/')) {
      return {
        ...publishedClass(),
        schedule: [
          {
            id: 's2',
            date: '2026-08-12',
            schedule_order: 2,
            lesson_id: 'lesson_aotfw_008',
            title: 'Memory',
            published: false
          }
        ]
      };
    }
    if (path.includes('/published/lessons/')) return publishedLesson();
    throw new Error(path);
  });

  const root = document.createElement('div');
  document.body.append(root);
  mountStudentLessonView({
    root,
    lessonId: 'lesson_aotfw_008',
    classId: CLASS_ID
  });

  await vi.waitFor(() => {
    expect(root.textContent).toContain('Lesson not found');
  });
});
```

Keep existing bare-route tests green (Back to unit class may stay `student-surface__back` for bare; class-scoped uses `back-class` / `back-unit` — update bare test selectors only if you change bare class names; prefer leaving bare class as `student-surface__back`).

- [ ] **Step 2: Run tests — expect fail**

Run: `npm run test:unit -- tests/unit/lesson-view.test.ts`

Expected: FAIL (`classId` unsupported / missing nav)

- [ ] **Step 3: Implement `mountStudentLessonView`**

Extend options:

```ts
export interface MountStudentLessonViewOptions {
  root: HTMLElement;
  lessonId: string;
  classId?: string;
  isStale?: () => boolean;
}
```

Behavior:

1. **No `classId`:** current behavior (single lesson fetch; header Back to unit with class `student-surface__back`; no footer).
2. **With `classId`:**
   - `Promise.all` of `apiGet` lesson + `fetchPublishedClass(classId)` (or `apiGet` for both).
   - If either fails with not_found → “Lesson not found.” / “Class not found.” as appropriate (class 404 → “Class not found.”; lesson 404 → “Lesson not found.”).
   - Find schedule row where `lesson_id === lessonId`. If missing or `published === false` → “Lesson not found.”
   - Header: brand; nav group with:
     - `a.student-surface__back.student-surface__back-class` → `/s/classes/${classId}` text “Back to class”
     - `a.student-surface__back.student-surface__back-unit` → `/s/units/${lesson.unit_id}` text “Back to unit”
   - Body: existing title + blocks.
   - Footer `nav.student-lesson__nav`:
     - Compute `scheduleNeighbors(cls.schedule, lessonId)`.
     - If `prev`: `a.student-lesson__nav-prev` with `href` class-scoped URL; label = neighbor title when `window.matchMedia('(min-width: 40rem)').matches`, else `"Previous"` (prefix `← ` optional).
     - If `next`: similarly `student-lesson__nav-next`.
     - On click: `event.preventDefault(); navigate(href)`.
   - Omit missing end controls entirely.

CSS (`app.css`):

```css
.student-surface__header-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  justify-content: flex-end;
}

.student-lesson__nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(28, 25, 23, 0.12);
}

.student-lesson__nav a {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  color: var(--depth);
  text-decoration: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.student-lesson__nav a:hover {
  text-decoration: underline;
}

.student-lesson__nav-next {
  margin-left: auto;
  text-align: right;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- tests/unit/lesson-view.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/student/lesson-view.ts tests/unit/lesson-view.test.ts src/styles/app.css
git commit -m "feat: class-scoped student lesson with schedule prev/next"
```

---

### Task 5: Wire `main.ts`

**Files:**
- Modify: `src/app/main.ts`

- [ ] **Step 1: Wire route**

In `renderRoute` switch, add:

```ts
case 'student-class-lesson':
  renderStudentLessonRoute(match.params.lessonId, token, match.params.classId);
  break;
```

Update helper:

```ts
function renderStudentLessonRoute(
  lessonId: string,
  token: number,
  classId?: string
): void {
  studentLessonViewHandle = mountStudentLessonView({
    root: appRoot,
    lessonId,
    classId,
    isStale: () => token !== renderToken
  });
}
```

Ensure dispose path already clears `studentLessonViewHandle` for student-lesson (reuse same handle for class-scoped).

No new unit test required if router + lesson-view cover behavior; optionally add a one-line smoke in router test already done.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`

Expected: no errors (switch exhaustiveness if any)

- [ ] **Step 3: Commit**

```bash
git add src/app/main.ts
git commit -m "feat: wire student-class-lesson in app shell"
```

---

### Task 6: Full regression

- [ ] **Step 1: Run unit suite**

Run: `npm run test:unit`

Expected: all pass (count ≥ prior green baseline; ~326+)

- [ ] **Step 2: Fix any fallout** (e.g. selector changes in bare lesson tests)

- [ ] **Step 3: Commit only if fixes needed**

```bash
git add -A
git commit -m "fix: student prev/next regression follow-ups"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Route `/s/classes/:classId/lessons/:lessonId` | 2, 5 |
| Bare `/s/lessons/:id` unchanged | 4 |
| Published-only neighbor chain | 1, 4 |
| Back to class + Back to unit | 4 |
| Footer Prev/Next; omit ends | 4 |
| Client helper; no new API | 1, 4 |
| 404 not on schedule / unpublished | 4 |
| Class Open → class-scoped URL | 3 |
| `navigate` for neighbors | 4 |

---

## Execution notes

- Prefer worktree under `.worktrees/` if using subagent-driven development (project convention).
- Do not push to origin unless asked.
- Merge locally when Adam picks finishing option 1.
