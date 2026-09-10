# Student Published Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public student “Back to unit” chrome on published lessons and a `/s/units/:unitId` page that lists that unit’s published lessons via `GET /api/published/units/:unitId`.

**Architecture:** Extend the SPA router with `student-unit`. Keep published lesson snapshots as the source of `unit_id` for the header link. Add a public Netlify (+ mock-api) endpoint that reads the unit blob and published lesson snapshots only (never drafts), ordered by the unit’s `lesson_ids`. New `unit-view` mounts like `lesson-view`.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom + node for Netlify handlers), existing `apiGet` / student-surface CSS

**Spec:** `docs/superpowers/specs/2026-08-08-student-published-nav-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/published-unit.ts` | Zod response schema + `orderLessonsByUnitIds` helper |
| `src/schemas/index.ts` | Re-export published-unit types |
| `src/app/router.ts` | Match `/s/units/:unitId` → `student-unit` |
| `netlify/functions/published-unit.mts` | Public GET handler |
| `scripts/mock-store.ts` | `listKeys(prefix)` for scanning published snapshots |
| `scripts/mock-api.ts` | Same public route for local/dev |
| `src/student/lesson-view.ts` | Header “Back to unit” from snapshot `unit_id` |
| `src/student/unit-view.ts` | Fetch + render published unit list |
| `src/app/main.ts` | Mount/teardown unit view on `student-unit` |
| `src/styles/app.css` | Header link + unit list styles |
| `tests/unit/router.test.ts` | New route match |
| `tests/unit/schemas-published-unit.test.ts` | Schema + ordering helper |
| `tests/unit/netlify-content-routes.test.ts` | Published-unit API cases |
| `tests/unit/lesson-view.test.ts` | Header link (new file) |
| `tests/unit/unit-view.test.ts` | Unit page states (new file) |
| `tests/integration/publish-flow.test.ts` | Publish → unit list includes lesson |

---

### Task 1: Router — `student-unit`

**Files:**
- Modify: `src/app/router.ts`
- Modify: `tests/unit/router.test.ts`

- [ ] **Step 1: Write failing router test**

Add to `tests/unit/router.test.ts` inside `describe('router match')`:

```ts
  it('matches public student unit view', () => {
    expect(match('/s/units/unit_aotfw')).toEqual({
      name: 'student-unit',
      params: { unitId: 'unit_aotfw' },
      requiresAuth: false,
      path: '/s/units/unit_aotfw'
    });
  });
```

Also extend the “unknown paths” case if useful:

```ts
    expect(match('/s/units')).toBeNull();
```

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/router.test.ts
```

Expected: FAIL — `student-unit` not in `RouteName` / match returns null.

- [ ] **Step 3: Implement router match**

In `src/app/router.ts`:

1. Add `'student-unit'` to `RouteName`.
2. Add `'student-unit': { unitId: string }` to `RouteParams`.
3. After the existing `studentLesson` match (before `/classes`), add:

```ts
  const studentUnit = path.match(/^\/s\/units\/([^/]+)$/);
  if (studentUnit) {
    return {
      name: 'student-unit',
      params: { unitId: studentUnit[1] },
      requiresAuth: false,
      path
    };
  }
```

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/router.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/router.ts tests/unit/router.test.ts
git commit -m "feat: match public student unit route"
```

---

### Task 2: Published-unit schema + lesson ordering helper

**Files:**
- Create: `src/schemas/published-unit.ts`
- Modify: `src/schemas/index.ts`
- Create: `tests/unit/schemas-published-unit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/schemas-published-unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PublishedUnitSchema,
  orderLessonsByUnitIds
} from '@/schemas/published-unit';

describe('PublishedUnitSchema', () => {
  it('parses a unit with published lesson summaries', () => {
    const unit = PublishedUnitSchema.parse({
      unit_id: 'unit_aotfw',
      title: 'AOTFW',
      lessons: [
        { lesson_id: 'lesson_aotfw_008', title: 'Memory' },
        { lesson_id: 'lesson_aotfw_001', title: 'Intro' }
      ]
    });
    expect(unit.lessons).toHaveLength(2);
  });

  it('rejects empty unit_id or title', () => {
    expect(() =>
      PublishedUnitSchema.parse({ unit_id: '', title: 'X', lessons: [] })
    ).toThrow();
  });
});

describe('orderLessonsByUnitIds', () => {
  it('orders by lesson_ids and appends unknowns last by title', () => {
    const ordered = orderLessonsByUnitIds(
      ['lesson_b', 'lesson_a'],
      [
        { lesson_id: 'lesson_a', title: 'A' },
        { lesson_id: 'lesson_c', title: 'C' },
        { lesson_id: 'lesson_b', title: 'B' }
      ]
    );
    expect(ordered.map((l) => l.lesson_id)).toEqual([
      'lesson_b',
      'lesson_a',
      'lesson_c'
    ]);
  });

  it('sorts by title when lesson_ids is empty', () => {
    const ordered = orderLessonsByUnitIds(
      [],
      [
        { lesson_id: 'l2', title: 'Zebra' },
        { lesson_id: 'l1', title: 'Alpha' }
      ]
    );
    expect(ordered.map((l) => l.lesson_id)).toEqual(['l1', 'l2']);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/schemas-published-unit.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement schema + helper**

Create `src/schemas/published-unit.ts`:

```ts
import { z } from 'zod';

export const PublishedUnitLessonSummarySchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1)
});

export const PublishedUnitSchema = z.object({
  unit_id: z.string().min(1),
  title: z.string().min(1),
  lessons: z.array(PublishedUnitLessonSummarySchema)
});

export type PublishedUnitLessonSummary = z.infer<
  typeof PublishedUnitLessonSummarySchema
>;
export type PublishedUnit = z.infer<typeof PublishedUnitSchema>;

export function orderLessonsByUnitIds(
  lessonIds: string[],
  lessons: PublishedUnitLessonSummary[]
): PublishedUnitLessonSummary[] {
  const byId = new Map(lessons.map((lesson) => [lesson.lesson_id, lesson]));
  const ordered: PublishedUnitLessonSummary[] = [];

  for (const id of lessonIds) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }

  const rest = [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  return [...ordered, ...rest];
}
```

Re-export from `src/schemas/index.ts`:

```ts
export {
  PublishedUnitSchema,
  PublishedUnitLessonSummarySchema,
  orderLessonsByUnitIds,
  type PublishedUnit,
  type PublishedUnitLessonSummary
} from './published-unit';
```

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/schemas-published-unit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/schemas/published-unit.ts src/schemas/index.ts tests/unit/schemas-published-unit.test.ts
git commit -m "feat: add published unit schema and lesson order helper"
```

---

### Task 3: Public published-unit API (Netlify + tests)

**Files:**
- Create: `netlify/functions/published-unit.mts`
- Modify: `tests/unit/netlify-content-routes.test.ts`

- [ ] **Step 1: Write failing API tests**

In `tests/unit/netlify-content-routes.test.ts`, import the new handler next to `publishedLessonHandler`:

```ts
const publishedUnitHandler = (await import('../../netlify/functions/published-unit.mts')).default;
```

Add:

```ts
describe('GET /api/published/units/:id', () => {
  it('returns 404 when the unit blob is missing', async () => {
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_missing'),
      { params: { id: 'unit_missing' } }
    );
    expect(response.status).toBe(404);
  });

  it('is public and returns only published lessons for that unit, in lesson_ids order', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001', 'lesson_aotfw_008'],
      ...timestamps,
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_aotfw_008'), {
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(publishedLessonKey('lesson_other'), {
      lesson_id: 'lesson_other',
      title: 'Other unit lesson',
      unit_id: 'unit_other',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });
    fakeStore.seed(draftLessonKey('lesson_aotfw_001'), {
      id: 'lesson_aotfw_001',
      title: 'Draft only — must not appear',
      unit_id: 'unit_aotfw'
    });

    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.unit_id).toBe('unit_aotfw');
    expect(body.data.title).toBe('AOTFW Unit');
    expect(body.data.lessons).toEqual([
      { lesson_id: 'lesson_aotfw_008', title: 'Memory' }
    ]);
  });

  it('returns empty lessons array when unit exists but nothing is published', async () => {
    fakeStore.seed(unitKey('unit_aotfw'), {
      id: 'unit_aotfw',
      type: 'unit',
      title: 'AOTFW Unit',
      slug: 'aotfw',
      status: 'active',
      year_id: 'year_12',
      subject_id: 'subject_english',
      lesson_ids: ['lesson_aotfw_001'],
      ...timestamps,
      schema_version: 1
    });
    const response = await publishedUnitHandler(
      request('/api/published/units/unit_aotfw'),
      { params: { id: 'unit_aotfw' } }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.lessons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/netlify-content-routes.test.ts
```

Expected: FAIL — module missing / import error.

- [ ] **Step 3: Implement Netlify handler**

Create `netlify/functions/published-unit.mts`:

```ts
import { getContentStore, getJSON, unitKey } from './_shared/blobs.mts';
import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';
import {
  orderLessonsByUnitIds,
  type PublishedUnitLessonSummary
} from '../../src/schemas/published-unit';

interface FunctionContext {
  params: Record<string, string | undefined>;
}

const PUBLISHED_LESSON_PREFIX = 'published/lessons/';

/**
 * Public route: no session. Returns unit title + published lesson summaries
 * for that unit only. Draft lesson keys are never read.
 */
export default async function handler(
  request: Request,
  context: FunctionContext
): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const id = context.params.id;
  if (!id) {
    return withCors(
      errorResponse(404, 'not_found', 'Unit not found'),
      request,
      env
    );
  }
  if (request.method !== 'GET') {
    return withCors(methodNotAllowed('GET, OPTIONS'), request, env);
  }

  const store = getContentStore();
  const unit = await getJSON<{
    id?: string;
    title?: string;
    lesson_ids?: string[];
  }>(store, unitKey(id));

  if (!unit || typeof unit.title !== 'string' || !unit.title) {
    return withCors(
      errorResponse(404, 'not_found', 'Unit not found'),
      request,
      env
    );
  }

  const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
  const snapshots = await Promise.all(
    blobs.map((blob) =>
      getJSON<{ lesson_id?: string; title?: string; unit_id?: string }>(
        store,
        blob.key
      )
    )
  );

  const matching: PublishedUnitLessonSummary[] = [];
  for (const snapshot of snapshots) {
    if (
      snapshot &&
      snapshot.unit_id === id &&
      typeof snapshot.lesson_id === 'string' &&
      snapshot.lesson_id &&
      typeof snapshot.title === 'string' &&
      snapshot.title
    ) {
      matching.push({
        lesson_id: snapshot.lesson_id,
        title: snapshot.title
      });
    }
  }

  const lessonIds = Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [];
  const lessons = orderLessonsByUnitIds(lessonIds, matching);

  return withCors(
    okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons
    }),
    request,
    env
  );
}

export const config = { path: '/api/published/units/:id' };
```

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/netlify-content-routes.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/published-unit.mts tests/unit/netlify-content-routes.test.ts
git commit -m "feat: add public published-unit API"
```

---

### Task 4: Mock-api published-unit route + integration coverage

**Files:**
- Modify: `scripts/mock-store.ts`
- Modify: `scripts/mock-api.ts`
- Modify: `tests/integration/publish-flow.test.ts`

- [ ] **Step 1: Write failing integration tests**

`tests/integration/publish-flow.test.ts` already uses `LESSON_ID = 'lesson_aotfw_008'` and seed data whose unit is `unit_aotfw`. Add:

```ts
const UNIT_ID = 'unit_aotfw';

  it('published unit endpoint lists the lesson after publish', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const draftRes = await api.request('GET', `/api/lessons/${LESSON_ID}`, {
      cookie
    });
    expect(draftRes.status).toBe(200);
    const lesson = (await draftRes.json()).data;

    const saveRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(saveRes.status).toBe(200);

    const publishRes = await api.request(
      'POST',
      `/api/lessons/${LESSON_ID}/publish`,
      { cookie }
    );
    expect(publishRes.status).toBe(200);

    const unitRes = await api.request('GET', `/api/published/units/${UNIT_ID}`);
    expect(unitRes.status).toBe(200);
    const unitBody = await unitRes.json();
    expect(unitBody.data.unit_id).toBe(UNIT_ID);
    expect(unitBody.data.title).toBeTruthy();
    expect(
      unitBody.data.lessons.some(
        (l: { lesson_id: string }) => l.lesson_id === LESSON_ID
      )
    ).toBe(true);
    expect(
      unitBody.data.lessons.some(
        (l: { lesson_id: string }) => l.lesson_id === 'lesson_aotfw_001'
      )
    ).toBe(false);
  });

  it('returns 404 for an unknown published unit', async () => {
    const api = freshApi();
    const res = await api.request(
      'GET',
      '/api/published/units/unit_does_not_exist'
    );
    expect(res.status).toBe(404);
  });
```

(If the PUT body shape in the first existing test differs slightly, copy that test’s save/publish lines exactly.)

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/integration/publish-flow.test.ts
```

Expected: FAIL — mock-api has no `/api/published/units/...` route (404 / method miss).

- [ ] **Step 3: Add MockStore prefix listing + mock-api handler**

`MockStore` currently has no list API. Add to `scripts/mock-store.ts`:

```ts
  listKeys(prefix = ''): string[] {
    return [...this.blobs.keys()].filter((key) => key.startsWith(prefix));
  }
```

In `scripts/mock-api.ts`:

1. Import `orderLessonsByUnitIds` from `../src/schemas/published-unit`.
2. Ensure `unitKey` is already imported from `../src/storage/keys` (it is).
3. Add handler:

```ts
  function handleGetPublishedUnit(id: string): MockResponse {
    const unit = store.getJSON<{ title?: string; lesson_ids?: string[] }>(
      unitKey(id)
    );
    if (!unit || typeof unit.title !== 'string' || !unit.title) {
      return notFoundResponse('Unit not found');
    }

    const matching: { lesson_id: string; title: string }[] = [];
    for (const key of store.listKeys('published/lessons/')) {
      const snapshot = store.getJSON<{
        lesson_id?: string;
        title?: string;
        unit_id?: string;
      }>(key);
      if (
        snapshot &&
        snapshot.unit_id === id &&
        typeof snapshot.lesson_id === 'string' &&
        snapshot.lesson_id &&
        typeof snapshot.title === 'string' &&
        snapshot.title
      ) {
        matching.push({
          lesson_id: snapshot.lesson_id,
          title: snapshot.title
        });
      }
    }

    const lessons = orderLessonsByUnitIds(
      Array.isArray(unit.lesson_ids) ? unit.lesson_ids : [],
      matching
    );
    return okResponse(200, {
      unit_id: id,
      title: unit.title,
      lessons
    });
  }
```

4. Register next to published lesson:

```ts
  const PUBLISHED_UNIT_RE = /^\/api\/published\/units\/([^/]+)$/;
  // in handle():
  const publishedUnitMatch = PUBLISHED_UNIT_RE.exec(path);
  if (publishedUnitMatch && method === 'GET') {
    return handleGetPublishedUnit(publishedUnitMatch[1]);
  }
```

- [ ] **Step 4: Run integration tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/integration/publish-flow.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scripts/mock-store.ts scripts/mock-api.ts tests/integration/publish-flow.test.ts
git commit -m "feat: mock published-unit route and cover in publish flow"
```

---

### Task 5: Lesson view — Back to unit header

**Files:**
- Modify: `src/student/lesson-view.ts`
- Modify: `src/styles/app.css`
- Create: `tests/unit/lesson-view.test.ts`

- [ ] **Step 1: Write failing lesson-view tests**

Create `tests/unit/lesson-view.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentLessonView } from '@/student/lesson-view';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(opts: { code: string; message: string }) {
      super(opts.message);
      this.code = opts.code;
    }
  }
}));

import { apiGet, ApiClientError } from '@/api/client';

describe('mountStudentLessonView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders Back to unit linking to /s/units/{unit_id}', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory',
      unit_id: 'unit_aotfw',
      blocks: [],
      published_at: '2026-02-01T12:00:00.000Z',
      schema_version: 1
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'lesson_aotfw_008' });

    await vi.waitFor(() => {
      const link = root.querySelector(
        'a.student-surface__back'
      ) as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      expect(link?.textContent).toBe('Back to unit');
      expect(link?.getAttribute('href')).toBe('/s/units/unit_aotfw');
    });
  });

  it('shows not-found without a back link when lesson missing', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentLessonView({ root, lessonId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Lesson not found');
    });
    expect(root.querySelector('a.student-surface__back')).toBeNull();
  });
});
```

Adjust `ApiClientError` mock to match the real constructor if tests complain — inspect `src/api/client.ts` and mirror it.

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/lesson-view.test.ts
```

Expected: FAIL — no `.student-surface__back` link.

- [ ] **Step 3: Update lesson view + CSS**

In `src/student/lesson-view.ts`, change `createShell` so the header can receive a back link later, OR rebuild header contents when the lesson loads:

Recommended approach — keep shell creation, then in `renderPublishedLesson` (or right after fetch success) update the header:

```ts
function renderHeader(header: HTMLElement, unitId: string): void {
  header.replaceChildren();

  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';

  const back = document.createElement('a');
  back.className = 'student-surface__back';
  back.href = `/s/units/${unitId}`;
  back.textContent = 'Back to unit';

  header.append(brand, back);
}
```

- Pass `header` out of `createShell` (return `{ surface, header, content }`).
- On successful load, call `renderHeader(header, lesson.unit_id)` then render content.
- On error / loading, header stays brand-only (set brand on create):

```ts
  header.textContent = ''; // clear
  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';
  header.append(brand);
```

Add CSS to `src/styles/app.css`:

```css
.student-surface__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  /* keep existing padding / colors */
}

.student-surface__brand {
  font-weight: 600;
}

.student-surface__back {
  color: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  font-size: 0.88rem;
}

.student-surface__back:hover {
  text-decoration: underline;
}
```

Merge with the existing `.student-surface__header` rules (do not duplicate the selector — extend the existing block).

- [ ] **Step 4: Run tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/lesson-view.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/student/lesson-view.ts src/styles/app.css tests/unit/lesson-view.test.ts
git commit -m "feat: add Back to unit link on student lesson view"
```

---

### Task 6: Unit view + main wiring

**Files:**
- Create: `src/student/unit-view.ts`
- Create: `tests/unit/unit-view.test.ts`
- Modify: `src/app/main.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Write failing unit-view tests**

Create `tests/unit/unit-view.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountStudentUnitView } from '@/student/unit-view';

vi.mock('@/api/client', () => ({
  apiGet: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(opts: { code: string; message: string }) {
      super(opts.message);
      this.code = opts.code;
    }
  }
}));

import { apiGet, ApiClientError } from '@/api/client';

describe('mountStudentUnitView', () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders unit title and published lesson links', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      unit_id: 'unit_aotfw',
      title: 'AOTFW Unit',
      lessons: [
        { lesson_id: 'lesson_aotfw_008', title: 'Memory' },
        { lesson_id: 'lesson_aotfw_001', title: 'Intro' }
      ]
    });

    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'unit_aotfw' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('AOTFW Unit');
      const links = [...root.querySelectorAll('a.student-unit__lesson-link')];
      expect(links).toHaveLength(2);
      expect(links[0].getAttribute('href')).toBe('/s/lessons/lesson_aotfw_008');
      expect(links[0].textContent).toContain('Memory');
    });
  });

  it('shows empty copy when no published lessons', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      unit_id: 'unit_aotfw',
      title: 'AOTFW Unit',
      lessons: []
    });
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'unit_aotfw' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain(
        'No published lessons in this unit yet.'
      );
    });
  });

  it('shows unit not found on 404', async () => {
    vi.mocked(apiGet).mockRejectedValue(
      new ApiClientError({ code: 'not_found', message: 'missing' })
    );
    const root = document.createElement('div');
    document.body.append(root);
    mountStudentUnitView({ root, unitId: 'missing' });

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Unit not found');
    });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/unit-view.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement unit view**

Create `src/student/unit-view.ts` mirroring `lesson-view.ts` structure:

```ts
import { apiGet, ApiClientError } from '@/api/client';
import type { PublishedUnit } from '@/schemas/published-unit';

export interface MountStudentUnitViewOptions {
  root: HTMLElement;
  unitId: string;
  isStale?: () => boolean;
}

export interface StudentUnitViewHandle {
  dispose(): void;
}

function createShell(): {
  surface: HTMLElement;
  header: HTMLElement;
  content: HTMLElement;
} {
  const surface = document.createElement('div');
  surface.className = 'student-surface';

  const header = document.createElement('header');
  header.className = 'student-surface__header';
  const brand = document.createElement('span');
  brand.className = 'student-surface__brand';
  brand.textContent = 'Teaching Hub';
  header.append(brand);

  const content = document.createElement('div');
  content.className = 'student-surface__content';

  surface.append(header, content);
  return { surface, header, content };
}

function renderStatus(content: HTMLElement, text: string): void {
  content.replaceChildren();
  const status = document.createElement('p');
  status.className = 'teacher-layout__canvas-status';
  status.textContent = text;
  content.append(status);
}

function renderPublishedUnit(content: HTMLElement, unit: PublishedUnit): void {
  content.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'student-surface__title';
  title.textContent = unit.title;
  content.append(title);

  if (unit.lessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'student-unit__empty';
    empty.textContent = 'No published lessons in this unit yet.';
    content.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'student-unit__lesson-list';

  for (const lesson of unit.lessons) {
    const item = document.createElement('li');
    item.className = 'student-unit__lesson-item';

    const link = document.createElement('a');
    link.className = 'student-unit__lesson-link';
    link.href = `/s/lessons/${lesson.lesson_id}`;
    link.textContent = lesson.title;

    item.append(link);
    list.append(item);
  }

  content.append(list);
}

export function mountStudentUnitView(
  options: MountStudentUnitViewOptions
): StudentUnitViewHandle {
  const { root, unitId, isStale = () => false } = options;
  let disposed = false;

  root.replaceChildren();
  const { surface, content } = createShell();
  root.append(surface);

  renderStatus(content, 'Loading unit…');

  void apiGet<PublishedUnit>(`/api/published/units/${unitId}`)
    .then((unit) => {
      if (disposed || isStale()) return;
      renderPublishedUnit(content, unit);
    })
    .catch((error: unknown) => {
      if (disposed || isStale()) return;
      const message =
        error instanceof ApiClientError && error.code === 'not_found'
          ? 'Unit not found.'
          : 'Unable to load unit. Please refresh to try again.';
      renderStatus(content, message);
    });

  return {
    dispose() {
      disposed = true;
    }
  };
}
```

- [ ] **Step 4: Wire `main.ts`**

In `src/app/main.ts`:

1. Import `mountStudentUnitView` / `StudentUnitViewHandle`.
2. Add `let studentUnitViewHandle: StudentUnitViewHandle | null = null;`
3. Add `teardownStudentUnitView()` analogous to lesson teardown.
4. Call it from `handleRoute` alongside lesson teardown.
5. Add `renderStudentUnitRoute(unitId, token)` and case `'student-unit'` in `renderRoute`.

```ts
function renderStudentUnitRoute(unitId: string, token: number): void {
  studentUnitViewHandle = mountStudentUnitView({
    root: appRoot,
    unitId,
    isStale: () => token !== renderToken
  });
}

// in renderRoute:
    case 'student-unit':
      renderStudentUnitRoute(match.params.unitId, token);
      break;
```

TypeScript will force the new `RouteMatch` case to be handled — do not leave it falling through `default`.

- [ ] **Step 5: CSS for unit list**

Append to `src/styles/app.css`:

```css
.student-unit__lesson-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.student-unit__lesson-link {
  display: block;
  padding: 0.75rem 0;
  font-family: var(--font-ui);
  font-size: 1.05rem;
  color: var(--depth);
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.student-unit__lesson-link:hover {
  text-decoration: underline;
}

.student-unit__empty {
  font-family: var(--font-ui);
  color: rgba(0, 0, 0, 0.65);
}
```

- [ ] **Step 6: Run unit-view + related tests — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/unit-view.test.ts tests/unit/lesson-view.test.ts tests/unit/router.test.ts
```

Also run `npx tsc -p tsconfig.json --noEmit` if the project uses it in `npm run build` — fix any exhaustiveness errors in `main.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/student/unit-view.ts src/app/main.ts src/styles/app.css tests/unit/unit-view.test.ts
git commit -m "feat: add public student unit view and route wiring"
```

---

### Task 7: Full verification

**Files:** none new — verify only

- [ ] **Step 1: Run full unit + integration suite**

```
npm test
```

Expected: all pass (including new published-unit / student view tests).

- [ ] **Step 2: Build**

```
npm run build
```

Expected: `tsc` + Vite build succeed.

- [ ] **Step 3: Manual smoke (optional but recommended)**

```
npm run dev
```

1. Sign in → open a lesson → Publish  
2. Open the student path `/s/lessons/:id`  
3. Click **Back to unit** → see unit title + that lesson listed  
4. Click the lesson row → return to student lesson  

- [ ] **Step 4: Final commit if any leftover fixes**

Only if verification produced small fixes:

```bash
git add -A
git commit -m "fix: student published nav verification polish"
```

Otherwise skip.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `/s/units/:unitId` route | Task 1 + 6 |
| `GET /api/published/units/:unitId` public | Task 3 + 4 |
| Published-only lessons, ordered by `lesson_ids` | Task 2 helper + Task 3/4 |
| Never read drafts | Task 3 tests assert draft absent |
| Lesson header Back to unit | Task 5 |
| Unit page empty / not-found copy | Task 6 |
| Integration publish → unit list | Task 4 |
| No Class / prev-next / brand home | Not implemented (YAGNI) |

Task 4 now specifies adding `MockStore.listKeys(prefix)` — no open-ended store API guesses remain.
