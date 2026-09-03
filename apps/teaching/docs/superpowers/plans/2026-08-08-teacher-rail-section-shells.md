# Teacher Rail & Section Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add primary teacher-rail sections (Home, Classes, Scope & Sequences, Units, Lessons, Resource Library) above the existing curriculum tree, with light browse/stub canvases wired through the router — without changing lesson edit/publish.

**Architecture:** Extend the Vite TypeScript SPA shell: new routes in `router.ts`, a `primary-nav` renderer composed above `renderCurriculumNav`, small synchronous section canvas modules fed by the existing `GET /api/curriculum` payload. No new APIs or Blob entities.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom), existing Clinical Glass CSS in `src/styles/app.css`

**Spec:** `docs/superpowers/specs/2026-08-08-teacher-rail-section-shells-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/app/router.ts` | New section `RouteName`s + `match()` branches |
| `src/app/main.ts` | Dispatch section routes; compose primary nav + tree; context bar titles |
| `src/teacher/primary-nav.ts` | Primary section links + active section highlight |
| `src/teacher/section.ts` | `TeacherSection` type + `sectionFromRoute()` helper |
| `src/teacher/lesson-list.ts` | Shared flat lesson-list DOM builder (Home + Lessons index) |
| `src/teacher/home.ts` | Thin wrapper around shared lesson list (heading: Home-appropriate) |
| `src/teacher/sections/placeholders.ts` | Classes + Resource Library placeholder canvases |
| `src/teacher/sections/scope-sequences.ts` | Subject list + per-subject S&S stub |
| `src/teacher/sections/units.ts` | Unit list + unit stub with linked lessons |
| `src/teacher/sections/lessons.ts` | Lessons index canvas |
| `src/teacher/nav.ts` | Unchanged tree behaviour (still `replaceChildren` on its own host) |
| `src/styles/app.css` | Primary nav + reuse existing list styles |
| `tests/unit/router.test.ts` | New path matches; update `/lessons` unknown expectation |
| `tests/unit/primary-nav.test.ts` | Active section + navigate on click |
| `tests/unit/section.test.ts` | `sectionFromRoute` mapping |
| `tests/unit/teacher-home.test.ts` | Still pass after home uses shared helper |
| `tests/unit/sections-*.test.ts` | Scope / units / lessons / placeholders canvases |

**Route table (auth required unless noted):**

| Path | `RouteName` | Section |
|------|-------------|---------|
| `/` | `teacher-home` | `home` |
| `/classes` | `teacher-classes` | `classes` |
| `/scope-sequences` | `teacher-scope-sequences` | `scope-sequences` |
| `/scope-sequences/:subjectId` | `teacher-scope-sequence` | `scope-sequences` |
| `/units` | `teacher-units` | `units` |
| `/units/:unitId` | `teacher-unit` | `units` |
| `/lessons` | `teacher-lessons` | `lessons` |
| `/lessons/:lessonId` | `teacher-lesson` | `lessons` |
| `/resources` | `teacher-resources` | `resources` |

Match exact list paths (`/lessons`, `/units`, `/scope-sequences`) **before** param patterns.

---

### Task 1: Router — section routes

**Files:**
- Modify: `src/app/router.ts`
- Modify: `tests/unit/router.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/router.test.ts`, update the unknown-paths case and add section matches:

```ts
  it('returns null for unknown paths', () => {
    expect(match('/unknown')).toBeNull();
    expect(match('/s/lessons')).toBeNull();
  });

  it('matches teacher section list routes', () => {
    expect(match('/lessons')).toEqual({
      name: 'teacher-lessons',
      params: {},
      requiresAuth: true,
      path: '/lessons'
    });
    expect(match('/classes')).toEqual({
      name: 'teacher-classes',
      params: {},
      requiresAuth: true,
      path: '/classes'
    });
    expect(match('/resources')).toEqual({
      name: 'teacher-resources',
      params: {},
      requiresAuth: true,
      path: '/resources'
    });
    expect(match('/units')).toEqual({
      name: 'teacher-units',
      params: {},
      requiresAuth: true,
      path: '/units'
    });
    expect(match('/scope-sequences')).toEqual({
      name: 'teacher-scope-sequences',
      params: {},
      requiresAuth: true,
      path: '/scope-sequences'
    });
  });

  it('matches teacher section detail routes', () => {
    expect(match('/units/unit_aotfw')).toEqual({
      name: 'teacher-unit',
      params: { unitId: 'unit_aotfw' },
      requiresAuth: true,
      path: '/units/unit_aotfw'
    });
    expect(match('/scope-sequences/subject_y12_engadv')).toEqual({
      name: 'teacher-scope-sequence',
      params: { subjectId: 'subject_y12_engadv' },
      requiresAuth: true,
      path: '/scope-sequences/subject_y12_engadv'
    });
  });

  it('does not treat list paths as lesson editor', () => {
    expect(match('/lessons')?.name).toBe('teacher-lessons');
    expect(match('/lessons/lesson_aotfw_008')?.name).toBe('teacher-lesson');
  });
```

Also extend the auth-required cases array to include `/classes`, `/lessons`, `/units/unit_aotfw`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/router.test.ts`

Expected: FAIL — new route names not in `match()`; `/lessons` still null.

- [ ] **Step 3: Implement router changes**

Replace the `RouteName` / `RouteParams` unions and extend `match()` in `src/app/router.ts`:

```ts
export type RouteName =
  | 'teacher-home'
  | 'teacher-classes'
  | 'teacher-scope-sequences'
  | 'teacher-scope-sequence'
  | 'teacher-units'
  | 'teacher-unit'
  | 'teacher-lessons'
  | 'teacher-lesson'
  | 'teacher-resources'
  | 'student-lesson'
  | 'sign-in';

export type RouteParams = {
  'teacher-home': Record<string, never>;
  'teacher-classes': Record<string, never>;
  'teacher-scope-sequences': Record<string, never>;
  'teacher-scope-sequence': { subjectId: string };
  'teacher-units': Record<string, never>;
  'teacher-unit': { unitId: string };
  'teacher-lessons': Record<string, never>;
  'teacher-lesson': { lessonId: string };
  'teacher-resources': Record<string, never>;
  'student-lesson': { lessonId: string };
  'sign-in': Record<string, never>;
};
```

Inside `match()`, after `/sign-in` and student lesson, add exact section paths, then detail patterns, then existing teacher lesson:

```ts
  const exactTeacher: Array<[string, RouteName]> = [
    ['/classes', 'teacher-classes'],
    ['/resources', 'teacher-resources'],
    ['/units', 'teacher-units'],
    ['/lessons', 'teacher-lessons'],
    ['/scope-sequences', 'teacher-scope-sequences']
  ];
  for (const [exact, name] of exactTeacher) {
    if (path === exact) {
      return { name, params: {}, requiresAuth: true, path };
    }
  }

  const scopeSequence = path.match(/^\/scope-sequences\/([^/]+)$/);
  if (scopeSequence) {
    return {
      name: 'teacher-scope-sequence',
      params: { subjectId: scopeSequence[1] },
      requiresAuth: true,
      path
    };
  }

  const teacherUnit = path.match(/^\/units\/([^/]+)$/);
  if (teacherUnit) {
    return {
      name: 'teacher-unit',
      params: { unitId: teacherUnit[1] },
      requiresAuth: true,
      path
    };
  }

  const teacherLesson = path.match(/^\/lessons\/([^/]+)$/);
  if (teacherLesson) {
    return {
      name: 'teacher-lesson',
      params: { lessonId: teacherLesson[1] },
      requiresAuth: true,
      path
    };
  }
```

Keep `/` and `/sign-in` and student matching as today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/router.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/router.ts tests/unit/router.test.ts
git commit -m "$(cat <<'EOF'
feat: add teacher section routes to the SPA router

EOF
)"
```

---

### Task 2: Section helper + primary nav

**Files:**
- Create: `src/teacher/section.ts`
- Create: `src/teacher/primary-nav.ts`
- Create: `tests/unit/section.test.ts`
- Create: `tests/unit/primary-nav.test.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing tests for `sectionFromRoute`**

Create `tests/unit/section.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { match } from '@/app/router';
import { sectionFromRoute } from '@/teacher/section';

describe('sectionFromRoute', () => {
  it('maps teacher routes to primary sections', () => {
    expect(sectionFromRoute(match('/')!)).toBe('home');
    expect(sectionFromRoute(match('/classes')!)).toBe('classes');
    expect(sectionFromRoute(match('/scope-sequences')!)).toBe('scope-sequences');
    expect(sectionFromRoute(match('/scope-sequences/subject_y12_engadv')!)).toBe('scope-sequences');
    expect(sectionFromRoute(match('/units')!)).toBe('units');
    expect(sectionFromRoute(match('/units/unit_aotfw')!)).toBe('units');
    expect(sectionFromRoute(match('/lessons')!)).toBe('lessons');
    expect(sectionFromRoute(match('/lessons/lesson_aotfw_008')!)).toBe('lessons');
    expect(sectionFromRoute(match('/resources')!)).toBe('resources');
  });

  it('returns null for non-teacher workspace routes', () => {
    expect(sectionFromRoute(match('/sign-in')!)).toBeNull();
    expect(sectionFromRoute(match('/s/lessons/lesson_aotfw_008')!)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:unit -- tests/unit/section.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/teacher/section.ts`**

```ts
import type { RouteMatch } from '@/app/router';

export type TeacherSection =
  | 'home'
  | 'classes'
  | 'scope-sequences'
  | 'units'
  | 'lessons'
  | 'resources';

export function sectionFromRoute(match: RouteMatch): TeacherSection | null {
  switch (match.name) {
    case 'teacher-home':
      return 'home';
    case 'teacher-classes':
      return 'classes';
    case 'teacher-scope-sequences':
    case 'teacher-scope-sequence':
      return 'scope-sequences';
    case 'teacher-units':
    case 'teacher-unit':
      return 'units';
    case 'teacher-lessons':
    case 'teacher-lesson':
      return 'lessons';
    case 'teacher-resources':
      return 'resources';
    default:
      return null;
  }
}
```

- [ ] **Step 4: Write failing primary-nav tests**

Create `tests/unit/primary-nav.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/router')>();
  return { ...actual, navigate: vi.fn() };
});

import { navigate } from '@/app/router';
import { renderPrimaryNav } from '@/teacher/primary-nav';

describe('primary nav', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
  });

  it('renders the six section links', () => {
    renderPrimaryNav(container, { activeSection: 'home' });
    const labels = [...container.querySelectorAll('.primary-nav__link')].map((el) => el.textContent);
    expect(labels).toEqual([
      'Home',
      'Classes',
      'Scope & Sequences',
      'Units',
      'Lessons',
      'Resource Library'
    ]);
  });

  it('marks the active section with aria-current', () => {
    renderPrimaryNav(container, { activeSection: 'units' });
    const active = container.querySelector('.primary-nav__link[aria-current="page"]');
    expect(active?.textContent).toBe('Units');
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('navigates on click via the client router', () => {
    renderPrimaryNav(container, { activeSection: 'home' });
    const classes = [...container.querySelectorAll<HTMLAnchorElement>('.primary-nav__link')].find(
      (el) => el.textContent === 'Classes'
    )!;
    classes.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(navigate).toHaveBeenCalledWith('/classes');
  });
});
```

- [ ] **Step 5: Run to verify fail**

Run: `npm run test:unit -- tests/unit/primary-nav.test.ts`

Expected: FAIL — `renderPrimaryNav` missing.

- [ ] **Step 6: Implement `src/teacher/primary-nav.ts`**

```ts
import { navigate } from '@/app/router';
import type { TeacherSection } from '@/teacher/section';

export interface PrimaryNavOptions {
  activeSection: TeacherSection;
}

const SECTIONS: Array<{ id: TeacherSection; label: string; path: string }> = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'classes', label: 'Classes', path: '/classes' },
  { id: 'scope-sequences', label: 'Scope & Sequences', path: '/scope-sequences' },
  { id: 'units', label: 'Units', path: '/units' },
  { id: 'lessons', label: 'Lessons', path: '/lessons' },
  { id: 'resources', label: 'Resource Library', path: '/resources' }
];

export function renderPrimaryNav(container: HTMLElement, options: PrimaryNavOptions): void {
  container.replaceChildren();

  const nav = document.createElement('div');
  nav.className = 'primary-nav';
  nav.setAttribute('aria-label', 'Teacher sections');

  for (const section of SECTIONS) {
    const link = document.createElement('a');
    link.className = 'primary-nav__link';
    link.href = section.path;
    link.textContent = section.label;
    if (section.id === options.activeSection) {
      link.setAttribute('aria-current', 'page');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(section.path);
    });
    nav.append(link);
  }

  container.append(nav);
}
```

- [ ] **Step 7: Add CSS**

In `src/styles/app.css`, before the `.curriculum-nav` block, add:

```css
.primary-nav {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--line);
}

.primary-nav__link {
  display: block;
  padding: 0.45rem 0.55rem;
  font-family: var(--font-ui);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--ink);
  text-decoration: none;
  border-radius: calc(var(--radius-md) * 0.5);
}

.primary-nav__link:hover {
  background: var(--glass);
}

.primary-nav__link[aria-current='page'] {
  background: color-mix(in srgb, var(--marine) 18%, transparent);
  color: var(--depth);
  font-weight: 600;
}
```

If `color-mix` is undesirable in this codebase, use an existing selected nav pattern (mirror `.nav-item` active styles already in `app.css`).

- [ ] **Step 8: Run tests**

Run: `npm run test:unit -- tests/unit/section.test.ts tests/unit/primary-nav.test.ts`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/teacher/section.ts src/teacher/primary-nav.ts src/styles/app.css \
  tests/unit/section.test.ts tests/unit/primary-nav.test.ts
git commit -m "$(cat <<'EOF'
feat: add teacher primary section navigation

EOF
)"
```

---

### Task 3: Shared lesson list + Home / Lessons canvases

**Files:**
- Create: `src/teacher/lesson-list.ts`
- Create: `src/teacher/sections/lessons.ts`
- Create: `tests/unit/sections-lessons.test.ts`
- Modify: `src/teacher/home.ts`
- Modify: `tests/unit/teacher-home.test.ts` (only if headings/assertions need updates)

- [ ] **Step 1: Write failing Lessons index test**

Create `tests/unit/sections-lessons.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Unit } from '@/schemas';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import { renderLessonsIndex } from '@/teacher/sections/lessons';
import type { CurriculumResponse } from '@/teacher/nav';

const ISO = '2026-01-01T00:00:00.000Z';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [
    {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'Artist of the Floating World',
      slug: 'artist_of_the_floating_world',
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: ['lesson_001']
    } satisfies Unit
  ],
  lessons: [
    {
      id: 'lesson_001',
      title: 'Introduction',
      slug: 'introduction',
      unit_id: 'unit_aotfw',
      sequence: 1,
      status: 'active',
      published: false
    }
  ]
};

describe('lessons index', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists lessons and opens the editor', () => {
    renderLessonsIndex(canvas, curriculum);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Lessons');
    expect(canvas.querySelector('.lesson-list__title')?.textContent).toBe('Introduction');
    canvas.querySelector<HTMLAnchorElement>('.lesson-list__open')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/lessons/lesson_001');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:unit -- tests/unit/sections-lessons.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement shared list + canvases**

`src/teacher/lesson-list.ts`:

```ts
import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

export function renderLessonList(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: { heading: string }
): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = options.heading;
  canvas.append(heading);

  if (curriculum.lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons yet.';
    canvas.append(empty);
    return;
  }

  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));
  const sortedLessons = [...curriculum.lessons].sort((a, b) => {
    if (a.unit_id !== b.unit_id) return a.unit_id.localeCompare(b.unit_id);
    return a.sequence - b.sequence;
  });

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const lesson of sortedLessons) {
    const unit = unitsById.get(lesson.unit_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [unit?.title ?? lesson.unit_id, lesson.published ? 'Published' : 'Draft'].join(
      ' · '
    );

    info.append(title, meta);

    const path = `/lessons/${lesson.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(info, open);
    list.append(item);
  }

  canvas.append(list);
}
```

`src/teacher/home.ts` — replace body with:

```ts
import type { CurriculumResponse } from './nav';
import { renderLessonList } from './lesson-list';

export function renderTeacherHome(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  renderLessonList(canvas, curriculum, { heading: 'Lessons' });
}
```

(Keep heading `'Lessons'` for Home this slice per spec — home stays the current lesson list.)

`src/teacher/sections/lessons.ts`:

```ts
import type { CurriculumResponse } from '@/teacher/nav';
import { renderLessonList } from '@/teacher/lesson-list';

export function renderLessonsIndex(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  renderLessonList(canvas, curriculum, { heading: 'Lessons' });
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- tests/unit/sections-lessons.test.ts tests/unit/teacher-home.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/lesson-list.ts src/teacher/home.ts src/teacher/sections/lessons.ts \
  tests/unit/sections-lessons.test.ts tests/unit/teacher-home.test.ts
git commit -m "$(cat <<'EOF'
feat: share lesson list canvas for Home and Lessons

EOF
)"
```

---

### Task 4: Placeholder sections (Classes, Resource Library)

**Files:**
- Create: `src/teacher/sections/placeholders.ts`
- Create: `tests/unit/sections-placeholders.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderClassesPlaceholder,
  renderResourcesPlaceholder
} from '@/teacher/sections/placeholders';

describe('section placeholders', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    canvas = document.createElement('div');
  });

  it('renders Classes coming-next copy', () => {
    renderClassesPlaceholder(canvas);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Classes');
    expect(canvas.textContent).toContain('coming next');
  });

  it('renders Resource Library coming-next copy', () => {
    renderResourcesPlaceholder(canvas);
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('Resource Library');
    expect(canvas.textContent).toContain('coming next');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:unit -- tests/unit/sections-placeholders.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
function renderPlaceholder(canvas: HTMLElement, title: string, message: string): void {
  canvas.replaceChildren();
  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = title;
  const body = document.createElement('p');
  body.className = 'teacher-layout__canvas-status';
  body.textContent = message;
  canvas.append(heading, body);
}

export function renderClassesPlaceholder(canvas: HTMLElement): void {
  renderPlaceholder(canvas, 'Classes', 'Classes are coming next.');
}

export function renderResourcesPlaceholder(canvas: HTMLElement): void {
  renderPlaceholder(canvas, 'Resource Library', 'Resource Library is coming next.');
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/teacher/sections/placeholders.ts tests/unit/sections-placeholders.test.ts
git commit -m "$(cat <<'EOF'
feat: add Classes and Resource Library placeholders

EOF
)"
```

---

### Task 5: Scope & Sequences list + stub

**Files:**
- Create: `src/teacher/sections/scope-sequences.ts`
- Create: `tests/unit/sections-scope.test.ts`

- [ ] **Step 1: Write failing tests**

Use a minimal curriculum with two subjects under Year 12 (ids matching seed style: `subject_y12_engadv`, `subject_y12_engstd`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', () => ({ navigate: vi.fn() }));

import { navigate } from '@/app/router';
import {
  renderScopeSequencesIndex,
  renderScopeSequenceStub
} from '@/teacher/sections/scope-sequences';
import type { CurriculumResponse } from '@/teacher/nav';
import type { Subject, Year } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const year: Year = {
  id: 'year_12',
  type: 'year',
  title: 'Year 12',
  slug: 'year_12',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_level: 12,
  subject_ids: ['subject_y12_engadv', 'subject_y12_engstd']
};

const engAdv: Subject = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1,
  year_id: 'year_12',
  unit_ids: [],
  outcome_ids: [],
  class_ids: []
};

const engStd: Subject = {
  ...engAdv,
  id: 'subject_y12_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard'
};

const curriculum: CurriculumResponse = {
  years: [year],
  subjects: [engAdv, engStd],
  units: [],
  lessons: []
};

describe('scope & sequences', () => {
  let canvas: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement('div');
  });

  it('lists one row per subject with year context', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    const titles = [...canvas.querySelectorAll('.lesson-list__title')].map((el) => el.textContent);
    expect(titles).toEqual(['English Advanced', 'English Standard']);
    const meta = [...canvas.querySelectorAll('.lesson-list__meta')].map((el) => el.textContent);
    expect(meta).toEqual(['Year 12', 'Year 12']);
  });

  it('opens the subject stub route', () => {
    renderScopeSequencesIndex(canvas, curriculum);
    canvas.querySelectorAll<HTMLAnchorElement>('.lesson-list__open')[0].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(navigate).toHaveBeenCalledWith('/scope-sequences/subject_y12_engadv');
  });

  it('renders a stub for a known subject', () => {
    renderScopeSequenceStub(canvas, curriculum, 'subject_y12_engadv');
    expect(canvas.querySelector('.home-heading')?.textContent).toBe('English Advanced');
    expect(canvas.textContent).toMatch(/Scope & Sequence[\s\S]*coming next/i);
  });

  it('renders not-found for an unknown subject', () => {
    renderScopeSequenceStub(canvas, curriculum, 'subject_missing');
    expect(canvas.textContent).toMatch(/not found/i);
  });
});
```

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement `src/teacher/sections/scope-sequences.ts`**

```ts
import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

export function renderScopeSequencesIndex(
  canvas: HTMLElement,
  curriculum: CurriculumResponse
): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Scope & Sequences';
  canvas.append(heading);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjects = [...curriculum.subjects].sort((a, b) => a.title.localeCompare(b.title));

  if (subjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No subjects yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const subject of subjects) {
    const year = yearsById.get(subject.year_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = subject.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = year?.title ?? subject.year_id;

    info.append(title, meta);

    const path = `/scope-sequences/${subject.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(info, open);
    list.append(item);
  }

  canvas.append(list);
}

export function renderScopeSequenceStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string
): void {
  canvas.replaceChildren();
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);

  if (!subject) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Subject not found.';
    canvas.append(status);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = subject.title;

  const body = document.createElement('p');
  body.className = 'teacher-layout__canvas-status';
  body.textContent = `Scope & Sequence for ${subject.title} is coming next.`;

  canvas.append(heading, body);
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/teacher/sections/scope-sequences.ts tests/unit/sections-scope.test.ts
git commit -m "$(cat <<'EOF'
feat: add Scope & Sequences subject list and stubs

EOF
)"
```

---

### Task 6: Units list + unit stub

**Files:**
- Create: `src/teacher/sections/units.ts`
- Create: `tests/unit/sections-units.test.ts`

- [ ] **Step 1: Write failing tests**

Curriculum with one unit, two lessons (sequences 1 and 2), matching year/subject titles for meta. Assert:

- Index lists unit title; meta includes subject or year label; Open → `/units/unit_aotfw`
- Stub lists only that unit’s lessons in sequence; Open lesson → `/lessons/...`
- Unknown `unitId` → not found

Mirror the style of Task 5 tests (mock `navigate`, happy-dom canvas).

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement `src/teacher/sections/units.ts`**

```ts
import { navigate } from '@/app/router';
import type { CurriculumResponse } from '@/teacher/nav';

export function renderUnitsIndex(canvas: HTMLElement, curriculum: CurriculumResponse): void {
  canvas.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = 'Units';
  canvas.append(heading);

  const yearsById = new Map(curriculum.years.map((year) => [year.id, year]));
  const subjectsById = new Map(curriculum.subjects.map((subject) => [subject.id, subject]));
  const units = [...curriculum.units].sort((a, b) => a.title.localeCompare(b.title));

  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No units yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const unit of units) {
    const subject = subjectsById.get(unit.subject_id);
    const year = yearsById.get(unit.year_id);
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = unit.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = [year?.title, subject?.title].filter(Boolean).join(' · ');

    info.append(title, meta);

    const path = `/units/${unit.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(info, open);
    list.append(item);
  }

  canvas.append(list);
}

export function renderUnitStub(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  unitId: string
): void {
  canvas.replaceChildren();
  const unit = curriculum.units.find((entry) => entry.id === unitId);

  if (!unit) {
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Unit not found.';
    canvas.append(status);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'home-heading';
  heading.textContent = unit.title;
  canvas.append(heading);

  const lessons = curriculum.lessons
    .filter((lesson) => lesson.unit_id === unitId)
    .sort((a, b) => a.sequence - b.sequence);

  if (lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No lessons in this unit yet.';
    canvas.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'lesson-list';

  for (const lesson of lessons) {
    const item = document.createElement('li');
    item.className = 'lesson-list__item';

    const info = document.createElement('div');
    info.className = 'lesson-list__info';

    const title = document.createElement('p');
    title.className = 'lesson-list__title';
    title.textContent = lesson.title;

    const meta = document.createElement('p');
    meta.className = 'lesson-list__meta';
    meta.textContent = lesson.published ? 'Published' : 'Draft';

    info.append(title, meta);

    const path = `/lessons/${lesson.id}`;
    const open = document.createElement('a');
    open.className = 'btn btn--secondary lesson-list__open';
    open.href = path;
    open.textContent = 'Open';
    open.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(path);
    });

    item.append(info, open);
    list.append(item);
  }

  canvas.append(list);
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/teacher/sections/units.ts tests/unit/sections-units.test.ts
git commit -m "$(cat <<'EOF'
feat: add Units browse list and unit lesson stubs

EOF
)"
```

---

### Task 7: Wire `main.ts` — rail composition + route dispatch

**Files:**
- Modify: `src/app/main.ts`
- Modify: `tests/unit/teacher-shell.test.ts` or add `tests/unit/teacher-rail-compose.test.ts` only if you extract a helper; otherwise rely on module tests + manual smoke. Prefer extracting a small pure helper for testability:

**Optional extract (recommended):** `src/teacher/rail.ts`

```ts
import type { CurriculumResponse } from '@/teacher/nav';
import { renderCurriculumNav } from '@/teacher/nav';
import { renderPrimaryNav } from '@/teacher/primary-nav';
import type { TeacherSection } from '@/teacher/section';

export function renderTeacherRail(
  railNav: HTMLElement,
  curriculum: CurriculumResponse,
  options: { activeSection: TeacherSection; activeLessonId?: string }
): void {
  railNav.replaceChildren();

  const primaryHost = document.createElement('div');
  primaryHost.className = 'teacher-layout__primary-nav-host';
  const treeHost = document.createElement('div');
  treeHost.className = 'teacher-layout__tree-host';

  railNav.append(primaryHost, treeHost);
  renderPrimaryNav(primaryHost, { activeSection: options.activeSection });
  renderCurriculumNav(treeHost, curriculum, { activeLessonId: options.activeLessonId });
}
```

- [ ] **Step 1: Write failing rail compose test**

Create `tests/unit/teacher-rail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/router')>();
  return { ...actual, navigate: vi.fn() };
});

import { renderTeacherRail } from '@/teacher/rail';
import type { CurriculumResponse } from '@/teacher/nav';

const curriculum: CurriculumResponse = {
  years: [],
  subjects: [],
  units: [],
  lessons: []
};

describe('renderTeacherRail', () => {
  it('renders primary nav above an empty curriculum tree host', () => {
    const railNav = document.createElement('div');
    renderTeacherRail(railNav, curriculum, { activeSection: 'classes' });
    expect(railNav.querySelector('.primary-nav')).not.toBeNull();
    expect(railNav.querySelector('[aria-current="page"]')?.textContent).toBe('Classes');
    expect(railNav.querySelector('.curriculum-nav')).not.toBeNull();
  });
});
```

(If empty curriculum still creates `.curriculum-nav` wrapper — check `nav.ts`; if not, assert `.teacher-layout__tree-host` exists.)

- [ ] **Step 2: Implement `src/teacher/rail.ts` and make test pass**

- [ ] **Step 3: Update `loadNavAndHandleErrors` in `main.ts`**

Change signature to accept `activeSection: TeacherSection` and `activeLessonId?: string`, and call `renderTeacherRail` instead of `renderCurriculumNav` alone.

- [ ] **Step 4: Add section route renderers in `main.ts`**

Import section canvases. For each teacher section route:

1. `mountTeacherShell()`
2. `renderContextBar` with an appropriate title (`Classes`, `Scope & Sequences`, unit title can wait until curriculum loads — use section title first, refine on load for stubs if desired)
3. Loading statuses on rail/canvas
4. `loadNavAndHandleErrors(..., activeSection, activeLessonId, (curriculum) => { /* canvas */ })`

`renderRoute` switch cases:

| `match.name` | Canvas call |
|--------------|-------------|
| `teacher-home` | `renderTeacherHome` (existing) + section `home` |
| `teacher-classes` | `renderClassesPlaceholder` |
| `teacher-resources` | `renderResourcesPlaceholder` |
| `teacher-scope-sequences` | `renderScopeSequencesIndex` |
| `teacher-scope-sequence` | `renderScopeSequenceStub(..., match.params.subjectId)` |
| `teacher-units` | `renderUnitsIndex` |
| `teacher-unit` | `renderUnitStub(..., match.params.unitId)` |
| `teacher-lessons` | `renderLessonsIndex` |
| `teacher-lesson` | existing editor; rail section `lessons`, `activeLessonId` set |

Context bar titles (minimum):

- Home → `Teacher workspace` (keep)
- Classes → `Classes`
- Resources → `Resource Library`
- Scope index → `Scope & Sequences`
- Scope stub → subject title after load, or `Scope & Sequence` while loading
- Units index → `Units`
- Unit stub → unit title after load
- Lessons index → `Lessons`
- Lesson editor → unchanged (editor owns bar)

- [ ] **Step 5: Run unit suite**

Run: `npm run test:unit`

Expected: PASS (fix any broken selectors if shell tests assert rail contents).

- [ ] **Step 6: Commit**

```bash
git add src/teacher/rail.ts src/app/main.ts tests/unit/teacher-rail.test.ts
git commit -m "$(cat <<'EOF'
feat: wire section routes and composed teacher rail

EOF
)"
```

---

### Task 8: Verification + smoke

**Files:** none new (fix only if something fails)

- [ ] **Step 1: Full unit tests**

Run: `npm run test:unit`

Expected: all PASS

- [ ] **Step 2: Typecheck / build**

Run: `npm run build`

Expected: exit 0

- [ ] **Step 3: Manual smoke (local)**

Run: `npm run dev`

Sign in with local passphrase. Confirm:

1. Primary six links visible above curriculum tree  
2. Each section route shows the expected canvas  
3. Scope subject → stub; Units → unit → lesson editor  
4. Tree still opens a lesson; Save/Publish still works  
5. Active section + active lesson both highlight on editor route  

- [ ] **Step 4: Playwright if present**

Run: `npm run test:browser`

Expected: PASS. If a selector breaks on rail markup, update the selector minimally — do not expand browser coverage in this slice.

- [ ] **Step 5: Final commit only if Step 4 required fixes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: keep publish browser flow working with primary nav

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Primary sections above tree | 2, 7 |
| Section routes table | 1, 7 |
| Active section by route prefix | 2, 7 |
| Tree + lesson highlight preserved | 7 |
| Home lesson list unchanged behaviour | 3 |
| Classes / Resources placeholders | 4 |
| S&S one row per subject + stub | 5 |
| Units list + unit stub with lessons | 6 |
| Lessons index | 3 |
| No new APIs | all |
| Not-found subject/unit | 5, 6 |
| Unit tests for router/nav/sections | 1–7 |
| Lesson editor/publish untouched | 7 (editor path only) |

## Self-review notes

- No TBD placeholders; route order pins `/lessons` before `/lessons/:id`.
- `TeacherSection` / `sectionFromRoute` / `renderPrimaryNav` / `renderTeacherRail` names are consistent across tasks.
- Home heading remains `Lessons` this slice (matches current UX + spec).
