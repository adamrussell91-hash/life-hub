# Teacher Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home canvas lesson list with a stacked teaching dashboard: Today + This week (seeded schedule), Unpublished changes, and Recently edited — while keeping the full lesson list on `/lessons`.

**Architecture:** Extend `GET /api/curriculum` with `schedule` plus `updated_at` / `published_at` on lesson summaries. Pure client helpers partition schedule and attention lists; `renderTeacherHome` builds the stacked UI. Demo schedule lives in `fixtures/seed.json` and a `meta/home_schedule` blob for Netlify parity.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom), existing teacher shell / curriculum fetch

**Spec:** `docs/superpowers/specs/2026-08-08-teacher-home-dashboard-design.md`

**Seed anchor date (fixed “today”):** `2026-08-12` (Wednesday)

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/storage/keys.ts` | `homeScheduleKey()` → `meta/home_schedule` |
| `src/teacher/nav.ts` | Extended `CurriculumLessonSummary` + `schedule` on `CurriculumResponse`; export `ScheduleEntry` |
| `src/teacher/home-model.ts` | Pure helpers: unpublished, recently edited, today rows, week day groups |
| `src/teacher/home.ts` | Dashboard DOM renderer |
| `src/styles/app.css` | Home dashboard styles |
| `src/app/main.ts` | Context bar title `Home`; loading copy |
| `fixtures/seed.json` | `home_schedule` object + lesson `published_at` where needed for demos |
| `scripts/mock-store.ts` | `SeedData` includes schedule; persist on loadSeed |
| `scripts/mock-api.ts` | Emit richer summaries + schedule |
| `scripts/seed-blobs.mjs` | Write `meta/home_schedule` |
| `netlify/functions/curriculum.mts` | Emit richer summaries + schedule from blob |
| `netlify/functions/_shared/blobs.mts` | Re-export `homeScheduleKey` |
| `tests/unit/home-model.test.ts` | Pure helper tests |
| `tests/unit/teacher-home.test.ts` | Rewrite for dashboard UI |
| `tests/unit/netlify-content-routes.test.ts` | Curriculum payload fields |
| `tests/unit/sections-lessons.test.ts` | Still full list (smoke if needed) |

---

### Task 1: Types + pure home-model helpers

**Files:**
- Modify: `src/teacher/nav.ts`
- Create: `src/teacher/home-model.ts`
- Create: `tests/unit/home-model.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/unit/home-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  selectUnpublishedChanges,
  selectRecentlyEdited,
  selectTodaySchedule,
  groupWeekSchedule,
  HOME_ATTENTION_LIMIT
} from '@/teacher/home-model';
import type { CurriculumLessonSummary, ScheduleEntry } from '@/teacher/nav';

const lessons: CurriculumLessonSummary[] = [
  {
    id: 'l1',
    title: 'One',
    slug: 'one',
    unit_id: 'u',
    sequence: 1,
    status: 'active',
    published: true,
    updated_at: '2026-08-12T15:00:00.000Z',
    published_at: '2026-08-10T10:00:00.000Z'
  },
  {
    id: 'l2',
    title: 'Two',
    slug: 'two',
    unit_id: 'u',
    sequence: 2,
    status: 'active',
    published: true,
    updated_at: '2026-08-11T12:00:00.000Z',
    published_at: '2026-08-11T12:00:00.000Z'
  },
  {
    id: 'l3',
    title: 'Three',
    slug: 'three',
    unit_id: 'u',
    sequence: 3,
    status: 'active',
    published: false,
    updated_at: '2026-08-13T09:00:00.000Z'
  }
];

const schedule: ScheduleEntry[] = [
  {
    class_id: 'class_demo',
    class_title: '12 Eng Adv — Period 3',
    lesson_id: 'l1',
    scheduled_date: '2026-08-12'
  },
  {
    class_id: 'class_demo',
    class_title: '12 Eng Adv — Period 3',
    lesson_id: 'l2',
    scheduled_date: '2026-08-13'
  },
  {
    class_id: 'class_demo',
    class_title: '12 Eng Adv — Period 3',
    lesson_id: 'l3',
    scheduled_date: '2026-08-10'
  }
];

describe('selectUnpublishedChanges', () => {
  it('includes only lessons edited after publish', () => {
    const rows = selectUnpublishedChanges(lessons);
    expect(rows.map((l) => l.id)).toEqual(['l1']);
  });
});

describe('selectRecentlyEdited', () => {
  it('orders by updated_at desc and respects limit', () => {
    const rows = selectRecentlyEdited(lessons, 2);
    expect(rows.map((l) => l.id)).toEqual(['l3', 'l1']);
    expect(HOME_ATTENTION_LIMIT).toBe(8);
  });
});

describe('selectTodaySchedule', () => {
  it('filters schedule to the anchor date', () => {
    const rows = selectTodaySchedule(schedule, '2026-08-12');
    expect(rows).toHaveLength(1);
    expect(rows[0].lesson_id).toBe('l1');
  });
});

describe('groupWeekSchedule', () => {
  it('groups Mon–Sun for the week containing the anchor and omits empty days', () => {
    // 2026-08-12 is Wednesday; week Mon 10 – Sun 16
    const groups = groupWeekSchedule(schedule, '2026-08-12');
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-12', '2026-08-13']);
    expect(groups[0].entries.map((e) => e.lesson_id)).toEqual(['l3']);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/home-model.test.ts
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Extend nav types**

In `src/teacher/nav.ts`, update:

```ts
export interface ScheduleEntry {
  class_id: string;
  class_title: string;
  lesson_id: string;
  scheduled_date: string; // YYYY-MM-DD
}

export interface CurriculumLessonSummary {
  id: string;
  title: string;
  slug: string;
  unit_id: string;
  sequence: number;
  status: string;
  published: boolean;
  updated_at: string;
  published_at?: string;
}

export interface CurriculumResponse {
  years: Year[];
  subjects: Subject[];
  units: Unit[];
  lessons: CurriculumLessonSummary[];
  schedule: ScheduleEntry[];
  schedule_anchor_date: string; // YYYY-MM-DD — demo “today”
}
```

- [ ] **Step 4: Implement `src/teacher/home-model.ts`**

```ts
import type { CurriculumLessonSummary, ScheduleEntry } from '@/teacher/nav';

export const HOME_ATTENTION_LIMIT = 8;

export function selectUnpublishedChanges(
  lessons: CurriculumLessonSummary[],
  limit = HOME_ATTENTION_LIMIT
): CurriculumLessonSummary[] {
  return lessons
    .filter(
      (lesson) =>
        Boolean(lesson.published_at) &&
        lesson.updated_at > (lesson.published_at as string)
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function selectRecentlyEdited(
  lessons: CurriculumLessonSummary[],
  limit = HOME_ATTENTION_LIMIT
): CurriculumLessonSummary[] {
  return [...lessons]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}

export function selectTodaySchedule(
  schedule: ScheduleEntry[],
  anchorDate: string
): ScheduleEntry[] {
  return schedule.filter((entry) => entry.scheduled_date === anchorDate);
}

export interface WeekDayGroup {
  date: string;
  entries: ScheduleEntry[];
}

/** Monday-start week containing `anchorDate` (YYYY-MM-DD). Omits empty days. */
export function groupWeekSchedule(
  schedule: ScheduleEntry[],
  anchorDate: string
): WeekDayGroup[] {
  const anchor = parseYmd(anchorDate);
  const monday = startOfWeekMonday(anchor);
  const days: WeekDayGroup[] = [];

  for (let i = 0; i < 7; i += 1) {
    const d = addDays(monday, i);
    const ymd = formatYmd(d);
    const entries = schedule.filter((e) => e.scheduled_date === ymd);
    if (entries.length > 0) {
      days.push({ date: ymd, entries });
    }
  }

  return days;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
```

- [ ] **Step 5: Run tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/home-model.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/teacher/nav.ts src/teacher/home-model.ts tests/unit/home-model.test.ts
git commit -m "feat: add home dashboard model helpers and curriculum types"
```

---

### Task 2: Seed schedule + storage key + mock-store

**Files:**
- Modify: `src/storage/keys.ts`
- Modify: `fixtures/seed.json`
- Modify: `scripts/mock-store.ts`
- Modify: `tests/unit/storage-keys.test.ts` (add one assertion)

- [ ] **Step 1: Failing storage-keys test**

Add to `tests/unit/storage-keys.test.ts`:

```ts
import { homeScheduleKey } from '@/storage/keys';

  it('builds home schedule meta key', () => {
    expect(homeScheduleKey()).toBe('meta/home_schedule');
  });
```

- [ ] **Step 2: Run fail — expect missing export**

- [ ] **Step 3: Implement key**

```ts
export function homeScheduleKey(): string {
  return 'meta/home_schedule';
}
```

- [ ] **Step 4: Extend seed fixture**

In `fixtures/seed.json`, add top-level (sibling of `years`):

```json
"home_schedule": {
  "anchor_date": "2026-08-12",
  "entries": [
    {
      "class_id": "class_demo_12engadv_p3",
      "class_title": "12 Eng Adv — Period 3",
      "lesson_id": "lesson_aotfw_006",
      "scheduled_date": "2026-08-10"
    },
    {
      "class_id": "class_demo_12engadv_p3",
      "class_title": "12 Eng Adv — Period 3",
      "lesson_id": "lesson_aotfw_007",
      "scheduled_date": "2026-08-11"
    },
    {
      "class_id": "class_demo_12engadv_p3",
      "class_title": "12 Eng Adv — Period 3",
      "lesson_id": "lesson_aotfw_008",
      "scheduled_date": "2026-08-12"
    },
    {
      "class_id": "class_demo_12engadv_p3",
      "class_title": "12 Eng Adv — Period 3",
      "lesson_id": "lesson_aotfw_001",
      "scheduled_date": "2026-08-13"
    },
    {
      "class_id": "class_demo_12engadv_p3",
      "class_title": "12 Eng Adv — Period 3",
      "lesson_id": "lesson_aotfw_002",
      "scheduled_date": "2026-08-14"
    }
  ]
}
```

Also set on `lesson_aotfw_008` (draft object):

```json
"published_at": "2026-02-01T12:00:00.000Z",
"updated_at": "2026-08-01T09:00:00.000Z"
```

(so `updated_at` > `published_at` for Unpublished panel demos even before a live publish). Keep other lessons’ existing `updated_at` values.

- [ ] **Step 5: Extend MockStore**

```ts
export type HomeScheduleSeed = {
  anchor_date: string;
  entries: Array<{
    class_id: string;
    class_title: string;
    lesson_id: string;
    scheduled_date: string;
  }>;
};

export type SeedData = {
  years: unknown[];
  subjects: unknown[];
  units: unknown[];
  lessons: unknown[];
  home_schedule: HomeScheduleSeed;
};
```

Import `homeScheduleKey`. In `loadSeed`:

```ts
    this.setJSON(homeScheduleKey(), seed.home_schedule);
```

- [ ] **Step 6: Fix any SeedData call sites** that construct seeds without `home_schedule` (integration tests using `freshSeed()` from fixture are fine once JSON is updated; hand-built seeds in unit tests need `schedule: []` / `home_schedule` as applicable).

- [ ] **Step 7: Run storage-keys + mock-related tests — expect PASS** (fix compile breakages)

```
npx vitest run --config "./vite.config.ts" tests/unit/storage-keys.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/storage/keys.ts fixtures/seed.json scripts/mock-store.ts tests/unit/storage-keys.test.ts
git commit -m "feat: seed home schedule and meta storage key"
```

---

### Task 3: Mock-api + Netlify curriculum emit schedule & timestamps

**Files:**
- Modify: `scripts/mock-api.ts`
- Modify: `netlify/functions/curriculum.mts`
- Modify: `netlify/functions/_shared/blobs.mts` (re-export key)
- Modify: `scripts/seed-blobs.mjs`
- Modify: `tests/unit/netlify-content-routes.test.ts`

- [ ] **Step 1: Write failing Netlify curriculum assertions**

In the existing curriculum describe (or new `it`s), after seeding unit/year/subject/lesson as existing tests do, also:

```ts
  fakeStore.seed(homeScheduleKey(), {
    anchor_date: '2026-08-12',
    entries: [
      {
        class_id: 'class_demo',
        class_title: '12 Eng Adv — Period 3',
        lesson_id: 'lesson_aotfw_008',
        scheduled_date: '2026-08-12'
      }
    ]
  });
```

Assert authenticated curriculum response:

```ts
    expect(body.data.schedule).toEqual([
      expect.objectContaining({ lesson_id: 'lesson_aotfw_008', scheduled_date: '2026-08-12' })
    ]);
    const lesson = body.data.lessons.find((l: { id: string }) => l.id === 'lesson_aotfw_008');
    expect(lesson.updated_at).toBeTruthy();
```

Import `homeScheduleKey` from blobs helper in the test file.

- [ ] **Step 2: Run fail**

- [ ] **Step 3: Update mock-api `buildCurriculum`**

Extend local `CurriculumLessonSummary` interface with `updated_at` / `published_at?`.

When mapping lessons:

```ts
        published: store.get(publishedLessonKey(lesson.id)) !== undefined,
        updated_at: lesson.updated_at,
        ...(lesson.published_at ? { published_at: lesson.published_at } : {})
```

Load schedule:

```ts
    const homeSchedule = store.getJSON<{
      anchor_date: string;
      entries: ScheduleEntry[];
    }>(homeScheduleKey());
    const schedule = homeSchedule?.entries ?? [];
```

Return:

```ts
    return {
      years,
      subjects,
      units,
      lessons,
      schedule,
      schedule_anchor_date: homeSchedule?.anchor_date ?? '2026-08-12'
    };
```

- [ ] **Step 4: Netlify curriculum.mts**

Same summary fields from draft `Lesson` objects. List/get `homeScheduleKey()` JSON. Return `schedule` + `schedule_anchor_date`. Re-export key from `_shared/blobs.mts`.

- [ ] **Step 5: seed-blobs.mjs**

```js
import { ..., homeScheduleKey } from '../src/storage/keys.ts';
// in seedStore, after lessons:
  if (seed.home_schedule) {
    await store.setJSON(homeScheduleKey(), seed.home_schedule);
    written += 1;
  }
```

- [ ] **Step 6: Fix all test fixtures** constructing `CurriculumResponse` — add `schedule: []`, `schedule_anchor_date: '2026-08-12'`, and `updated_at` on each lesson summary (use `ISO` constant). Grep for `CurriculumResponse` / `lessons: [` in tests and update.

- [ ] **Step 7: Run**

```
npx vitest run --config "./vite.config.ts" tests/unit/netlify-content-routes.test.ts tests/unit/teacher-home.test.ts tests/unit/teacher-rail.test.ts tests/unit/sections-lessons.test.ts
```

Expect teacher-home may still fail on old assertions until Task 4 — that’s OK if other suites pass. Prefer fixing type-only breakages in teacher-home by temporarily adding required fields to the fixture object without changing behaviour assertions yet.

- [ ] **Step 8: Commit**

```bash
git add scripts/mock-api.ts netlify/functions/curriculum.mts netlify/functions/_shared/blobs.mts scripts/seed-blobs.mjs tests/unit/netlify-content-routes.test.ts tests src/teacher/nav.ts
git commit -m "feat: emit home schedule and lesson timestamps from curriculum API"
```

---

### Task 4: Home dashboard UI + CSS + context bar

**Files:**
- Modify: `src/teacher/home.ts`
- Modify: `src/styles/app.css`
- Modify: `src/app/main.ts`
- Rewrite: `tests/unit/teacher-home.test.ts`

- [ ] **Step 1: Rewrite failing home tests**

Replace `tests/unit/teacher-home.test.ts` with dashboard-focused cases (include required curriculum fields):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderTeacherHome } from '@/teacher/home';
import type { CurriculumResponse } from '@/teacher/nav';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  schedule_anchor_date: '2026-08-12',
  schedule: [
    {
      class_id: 'class_demo',
      class_title: '12 Eng Adv — Period 3',
      lesson_id: 'lesson_aotfw_008',
      scheduled_date: '2026-08-12'
    },
    {
      class_id: 'class_demo',
      class_title: '12 Eng Adv — Period 3',
      lesson_id: 'lesson_aotfw_001',
      scheduled_date: '2026-08-13'
    }
  ],
  lessons: [
    {
      id: 'lesson_aotfw_008',
      title: 'Memory',
      slug: 'memory',
      unit_id: 'unit_aotfw',
      sequence: 8,
      status: 'active',
      published: true,
      updated_at: '2026-08-01T09:00:00.000Z',
      published_at: '2026-02-01T12:00:00.000Z'
    },
    {
      id: 'lesson_aotfw_001',
      title: 'Intro',
      slug: 'intro',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false,
      updated_at: '2026-07-01T00:00:00.000Z'
    }
  ]
};

describe('teacher home dashboard', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('renders Today and This week from the seed schedule', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.textContent).toContain('Today');
    expect(canvas.textContent).toContain('2026-08-12');
    expect(canvas.textContent).toContain('This week');
    expect(canvas.textContent).toContain('Memory');
    expect(canvas.textContent).toContain('Intro');
  });

  it('lists unpublished changes and recently edited', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.textContent).toContain('Unpublished changes');
    expect(canvas.textContent).toContain('Recently edited');
    const unpublished = canvas.querySelector('[data-home-panel="unpublished"]');
    expect(unpublished?.textContent).toContain('Memory');
  });

  it('opens a scheduled lesson via the client-side router', () => {
    renderTeacherHome(canvas, curriculum);
    const open = canvas.querySelector<HTMLAnchorElement>(
      '[data-home-panel="today"] .home-schedule__open'
    );
    expect(open?.getAttribute('href')).toBe('/lessons/lesson_aotfw_008');
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_aotfw_008');
  });

  it('does not render the old flat all-lessons list', () => {
    renderTeacherHome(canvas, curriculum);
    expect(canvas.querySelector('.lesson-list')).toBeNull();
  });
});
```

- [ ] **Step 2: Run fail**

- [ ] **Step 3: Implement `renderTeacherHome`**

Rewrite `src/teacher/home.ts` to:

1. Read `curriculum.schedule_anchor_date`, `schedule`, `lessons`
2. Build today / week / unpublished / recent via home-model helpers
3. Render sections with headings and empty copy from the spec
4. Schedule rows: class_title · lesson title · Draft/Published · Open link (`preventDefault` + `navigate` like lesson-list)
5. Attention rows: title + Open
6. Root class `home-dashboard`; panels use `data-home-panel="today|week|unpublished|recent"`

Day headers in week: show human-readable weekday + date (e.g. format from `YYYY-MM-DD` with `UTC` weekday names).

Today heading: include anchor date label — e.g. `Today · 2026-08-12` (simple ISO is fine for this slice).

- [ ] **Step 4: CSS**

Append home-dashboard styles: section gaps, schedule rows, two-column attention grid that stacks under ~720px.

- [ ] **Step 5: main.ts**

```ts
  renderContextBar(refs, { title: 'Home' });
  renderCanvasStatus(refs.canvas, 'Loading home…');
```

- [ ] **Step 6: Tests PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/teacher-home.test.ts tests/unit/home-model.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/teacher/home.ts src/styles/app.css src/app/main.ts tests/unit/teacher-home.test.ts
git commit -m "feat: render teacher home dashboard with schedule and attention panels"
```

---

### Task 5: Lessons section still lists all + full verification

**Files:**
- Verify: `src/teacher/sections/lessons.ts` (unchanged behaviour)
- Touch tests only if CurriculumResponse fixture breakages remain

- [ ] **Step 1: Confirm lessons index test still expects full list**

Run:

```
npx vitest run --config "./vite.config.ts" tests/unit/sections-lessons.test.ts
```

Update fixture fields only if types require `updated_at` / `schedule`.

- [ ] **Step 2: Full suite + build**

```
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 3: Manual smoke (optional)**

`npm run dev` → Home shows Today (12 Aug) + week days + unpublished Memory + recent; Lessons nav still full list.

- [ ] **Step 4: Commit only if verification fixes were needed**

```bash
git commit -m "fix: home dashboard verification polish"
```

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| Stacked Today / week / unpublished / recent | Task 4 |
| No all-lessons on Home | Task 4 test |
| Seed schedule + anchor date | Task 2 |
| Curriculum `schedule` + timestamps | Task 3 |
| Unpublished / recent rules | Task 1 helpers + Task 4 |
| Open → `/lessons/:id` | Task 4 |
| Lessons section unchanged | Task 5 |
| Mock + Netlify + seed-blobs | Task 3 |

No intentional placeholders remain for implementers beyond grepping test fixtures for `CurriculumResponse` shape updates in Task 3 Step 6.
