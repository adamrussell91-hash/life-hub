# Clinical Glass Dashboard & Create Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Clinical Glass teacher Home (hero clock, signal tiles, dated week calendar, class tiles), class-list rail, spacious overall Scope year timeline with click-through, and full contextual Create (POST + navigate) for class/unit/lesson/scope.

**Architecture:** Extend design tokens/CSS; add `POST` create handlers in mock-api + Netlify; shared `src/teacher/create/` client + modal; replace curriculum tree rail with class list; rewrite `renderTeacherHome` and Scope index; keep per-subject scope editor.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom), Zod schemas, existing teacher shell / curriculum fetch, Netlify Blobs functions

**Spec:** `docs/superpowers/specs/2026-08-09-clinical-glass-dashboard-create-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/design/tokens.css` | Larger type tokens, UI font defaults |
| `src/styles/app.css` | Glass tiles, Wave tabs, Home/Scope/Create modal, type bumps |
| `src/teacher/create/types.ts` | Create kind + request/response types |
| `src/teacher/create/api.ts` | `postClass`, `postUnit`, `postLesson`, `postScopeSequence` |
| `src/teacher/create/modal.ts` | Glass create modal DOM + submit |
| `src/teacher/create/control.ts` | Contextual Create button/menu |
| `src/teacher/create/slug.ts` | `slugifyTitle` helper |
| `src/teacher/nav.ts` | Replace tree with `renderClassesNav` (or new file) |
| `src/teacher/rail.ts` | Wire classes list + activeClassId |
| `src/teacher/home.ts` | Clinical Glass Home renderer |
| `src/teacher/home-clock.ts` | Live hero clock mount/dispose |
| `src/teacher/sections/classes.ts` | Glass index + Create class |
| `src/teacher/sections/scope-sequences.ts` | Overall year timeline landing |
| `src/teacher/sections/scope-overview.ts` | Pure layout helpers + DOM for overall Gantt |
| `src/teacher/sections/units.ts` / `lessons.ts` | Section Create controls |
| `src/teacher/schedule-api.ts` or create api module | Already covered by create/api |
| `scripts/mock-api.ts` | POST create handlers |
| `scripts/mock-store.ts` | Persist new entities if needed |
| `netlify/functions/class.mts` | POST create class (extend) |
| `netlify/functions/unit-create.mts` (or `unit.mts`) | POST create unit |
| `netlify/functions/lesson.mts` | POST create lesson (no id → create) |
| `netlify/functions/scope-sequence.mts` | POST create scope |
| `src/app/main.ts` | Pass activeClassId; refresh after create |
| `tests/unit/create-api.test.ts` | Mock POST create |
| `tests/unit/create-modal.test.ts` | Modal + control |
| `tests/unit/teacher-home.test.ts` | Home structure |
| `tests/unit/teacher-rail.test.ts` / `teacher-nav.test.ts` | Classes list |
| `tests/unit/sections-scope.test.ts` | Overall timeline |
| `tests/unit/netlify-content-routes.test.ts` | Netlify POST create |

---

### Task 1: Tokens + Wave tabs + type scale CSS

**Files:**
- Modify: `src/design/tokens.css`
- Modify: `src/styles/app.css`
- Test: visual via existing unit tests that assert class names (add smoke in Task 5); this task adds CSS only — verify with a tiny token assertion test optional

- [ ] **Step 1: Extend tokens**

In `src/design/tokens.css`, add:

```css
:root {
  /* existing tokens remain */
  --font-size-hero: 2.25rem;
  --font-size-page: 1.75rem;
  --font-size-section: 1.35rem;
  --font-size-tile-value: 2rem;
  --font-size-body: 1.05rem;
  --font-size-card: 1rem;
  --font-size-meta: 0.8125rem;
  --tab-radius: 0.65rem;
}
```

Set `font-family` on `:root` to prefer `--font-ui` for chrome (keep serif only where content needs it), matching Clinical Glass sans for dashboard chrome:

```css
:root {
  font-family: var(--font-ui);
}
```

- [ ] **Step 2: Add shared CSS utilities**

Append to `src/styles/app.css`:

```css
.glass-tile {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 1.15rem 1.25rem;
}

.section-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.section-tabs__tab {
  font-family: var(--font-ui);
  font-size: var(--font-size-card);
  font-weight: 600;
  padding: 0.5rem 0.9rem;
  border-radius: var(--tab-radius);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.62);
  color: var(--orca);
  cursor: pointer;
}

.section-tabs__tab[aria-selected='true'],
.section-tabs__tab.is-selected {
  background: var(--wave);
  border-color: var(--wave);
  color: #fff;
}

.create-control__menu {
  position: absolute;
  z-index: 20;
  margin-top: 0.35rem;
  min-width: 14rem;
  padding: 0.4rem;
  display: grid;
  gap: 0.2rem;
}

.create-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 21, 54, 0.35);
  display: grid;
  place-items: center;
  z-index: 40;
  padding: 1.25rem;
}

.create-modal {
  width: min(100%, 28rem);
  padding: 1.5rem;
  display: grid;
  gap: 1rem;
}

.home-dashboard__hero-time {
  font-size: var(--font-size-hero);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  color: var(--depth);
}

.home-dashboard__hero-date {
  font-size: var(--font-size-body);
  color: var(--muted);
  margin-top: 0.25rem;
}

.scope-overview__row {
  display: grid;
  grid-template-columns: 11.25rem 1fr;
  gap: 1rem;
  align-items: center;
  min-height: 4rem;
  margin-bottom: 1.25rem;
}

.scope-overview__track {
  position: relative;
  min-height: 4rem;
  border-radius: var(--radius-md);
  background: var(--warm-white);
}

.scope-overview__bar {
  position: absolute;
  top: 0.5rem;
  bottom: 0.5rem;
  border-radius: 0.75rem;
  padding: 0.65rem 0.75rem;
  font-size: var(--font-size-card);
  font-weight: 600;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--line);
}
```

Also bump `.home-dashboard__heading`, `.btn`, `.primary-nav__link`, `.lesson-list__title` font sizes toward the new tokens (at least +2–4px / rem bump).

- [ ] **Step 3: Commit**

```bash
git add src/design/tokens.css src/styles/app.css
git commit -m "style: enlarge Clinical Glass type scale and shared chrome"
```

---

### Task 2: Create POST APIs (mock)

**Files:**
- Modify: `scripts/mock-api.ts`
- Create: `tests/unit/create-api.test.ts`
- Modify: `src/storage/keys.ts` if unit/subject keys missing helpers

- [ ] **Step 1: Write failing tests**

Create `tests/unit/create-api.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockApi, loadSeedFile } from '../../scripts/mock-api';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seed = loadSeedFile(path.join(root, 'fixtures/seed.json'));

function cookieFor(api: ReturnType<typeof createMockApi>): string {
  // reuse pattern from other mock tests — auth then read set-cookie
  return ''; // fill using existing auth helper from schedule/class tests
}

describe('POST create endpoints (mock)', () => {
  let api: ReturnType<typeof createMockApi>;
  let cookie: string;

  beforeEach(async () => {
    api = createMockApi({ seed: structuredClone(seed) });
    const auth = await api.request('POST', '/api/auth', {
      body: { password: process.env.TEACHING_HUB_PASSWORD ?? 'test' }
    });
    // extract cookie from auth response headers the same way as class-api tests
    cookie = /* from auth */ '';
  });

  it('POST /api/classes creates a class', async () => {
    const res = await api.request('POST', '/api/classes', {
      cookie,
      body: {
        title: '12 Eng Std',
        code: '12ENGSTD1',
        academic_year: 2026,
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv'
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('class');
    expect(body.data.code).toBe('12ENGSTD1');
  });

  it('POST /api/units creates a unit', async () => {
    const res = await api.request('POST', '/api/units', {
      cookie,
      body: {
        title: 'New Unit',
        year_id: 'year_12',
        subject_id: 'subject_y12_engadv'
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('unit');
    expect(body.data.lesson_ids).toEqual([]);
  });

  it('POST /api/lessons creates a draft lesson', async () => {
    const res = await api.request('POST', '/api/lessons', {
      cookie,
      body: { title: 'New Lesson', unit_id: 'unit_y12_engadv_modc' }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('lesson');
    expect(body.data.blocks).toEqual([]);
  });

  it('POST /api/scope-sequences creates scope and links subject', async () => {
    const res = await api.request('POST', '/api/scope-sequences', {
      cookie,
      body: {
        title: 'Y12 Eng Adv 2027',
        subject_id: 'subject_y12_engadv',
        academic_year: 2027
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.type).toBe('scope_sequence');
    expect(body.data.timeline_items).toEqual([]);
  });
});
```

Copy the auth/cookie extraction pattern from `tests/unit/class-api.test.ts` or `scope-sequence-api.test.ts` exactly — do not leave `cookie = ''`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm run test:unit -- tests/unit/create-api.test.ts
```

Expected: 404 or method not allowed on POSTs.

- [ ] **Step 3: Implement mock handlers**

In `scripts/mock-api.ts`, add helpers:

```ts
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'item';
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
```

`handlePostClass`: auth → validate body (`title`/`code`, `academic_year`, `year_id`, `subject_id`) → build Class with empty `active_unit_ids`, empty homepage regions, `status: 'active'`, `schema_version: 1` → `store.setJSON(classKey(id), cls)` → `okResponse(201, cls)`.

`handlePostUnit`: validate `title`, `year_id`, `subject_id` → Unit with `lesson_ids: []` → persist → also append `unit.id` to subject's `unit_ids` if subject exists → 201.

`handlePostLesson`: validate `title`, `unit_id` → Lesson draft `blocks: []`, `sequence` = max+1 in unit → persist draft → append to unit `lesson_ids` → 201.

`handlePostScopeSequence`: validate `title`, `subject_id`, `academic_year` → default `week_count: 40`, four equal terms, `timeline_items: []` → persist → set subject `scope_id` → 201.

Wire in `handle()`:

```ts
if (method === 'POST' && path === '/api/classes') return handlePostClass(cookie, body);
if (method === 'POST' && path === '/api/units') return handlePostUnit(cookie, body);
if (method === 'POST' && path === '/api/lessons') return handlePostLesson(cookie, body);
if (method === 'POST' && path === '/api/scope-sequences') return handlePostScopeSequence(cookie, body);
```

Use real seed ids from `fixtures/seed.json` in tests (inspect file for `year_12`, subject, unit ids).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:unit -- tests/unit/create-api.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scripts/mock-api.ts tests/unit/create-api.test.ts
git commit -m "feat: add mock POST create for class unit lesson scope"
```

---

### Task 3: Netlify create parity

**Files:**
- Modify: `netlify/functions/class.mts` — accept POST without `:id` **or** add `netlify/functions/classes.mts` with `config.path = '/api/classes'`
- Create/modify unit + lesson + scope-sequence functions similarly
- Modify: `tests/unit/netlify-content-routes.test.ts`

- [ ] **Step 1: Write failing Netlify tests** mirroring mock create cases (auth cookie, POST, expect 201 + blob written).

- [ ] **Step 2: Implement handlers** using same validation/defaults as mock; `setJSON` via blobs helpers; update subject/unit relations.

For lessons: if current `lesson.mts` is only `/api/lessons/:id`, add `netlify/functions/lessons-create.mts` with `path: '/api/lessons'` for POST, keep `:id` for GET/PUT.

- [ ] **Step 3: Pass tests + commit**

```bash
git commit -m "feat: Netlify POST create for class unit lesson scope"
```

---

### Task 4: Create client + modal + contextual control

**Files:**
- Create: `src/teacher/create/slug.ts`
- Create: `src/teacher/create/api.ts`
- Create: `src/teacher/create/modal.ts`
- Create: `src/teacher/create/control.ts`
- Create: `tests/unit/create-modal.test.ts`

- [ ] **Step 1: Failing tests** for `mountCreateControl` — Home shows menu with 4 items; Classes shows single button; choosing Class opens modal; submit calls `postClass` and `onCreated`.

- [ ] **Step 2: Implement**

`api.ts`:

```ts
import { apiPost } from '@/api/client';
import type { Class, Lesson, ScopeSequence, Unit } from '@/schemas';

export function postClass(body: {
  title: string;
  code: string;
  academic_year: number;
  year_id: string;
  subject_id: string;
}): Promise<Class> {
  return apiPost('/api/classes', body);
}

export function postUnit(body: {
  title: string;
  year_id: string;
  subject_id: string;
}): Promise<Unit> {
  return apiPost('/api/units', body);
}

export function postLesson(body: { title: string; unit_id: string }): Promise<Lesson> {
  return apiPost('/api/lessons', body);
}

export function postScopeSequence(body: {
  title: string;
  subject_id: string;
  academic_year: number;
}): Promise<ScopeSequence> {
  return apiPost('/api/scope-sequences', body);
}
```

`control.ts` — `CreateContext = 'home' | 'classes' | 'scope-sequences' | 'units' | 'lessons'`.

`modal.ts` — fields depend on kind; for class: title, code, year select, subject select (from curriculum prop); Save uses High Sea `btn btn--decisive`.

- [ ] **Step 3: Pass tests + commit**

```bash
git commit -m "feat: add contextual Create control and modal"
```

---

### Task 5: Rail — Your classes list

**Files:**
- Modify: `src/teacher/nav.ts` (replace `renderCurriculumNav` body or add `renderClassesNav` and switch callers)
- Modify: `src/teacher/rail.ts`
- Modify: `src/app/main.ts` — pass `activeClassId` from route
- Modify: `tests/unit/teacher-nav.test.ts`, `tests/unit/teacher-rail.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('lists classes and navigates to class page on click', () => {
  // render with one class; click row; expect navigate('/classes/class_…')
});

it('does not render year/subject expand tree', () => {
  expect(container.querySelector('.nav-item--toggle')).toBeNull();
});
```

- [ ] **Step 2: Implement `renderClassesNav`**

```ts
export function renderClassesNav(
  container: HTMLElement,
  curriculum: CurriculumResponse,
  options: { activeClassId?: string; onCreateClass?: () => void } = {}
): void {
  container.replaceChildren();
  const label = document.createElement('p');
  label.className = 'rail-classes__label';
  label.textContent = 'Your classes';
  container.append(label);

  const list = document.createElement('div');
  list.className = 'rail-classes';
  for (const cls of [...curriculum.classes].sort((a, b) => a.code.localeCompare(b.code))) {
    const link = document.createElement('a');
    link.className = 'nav-item rail-classes__item';
    const path = `/classes/${cls.id}`;
    link.href = path;
    link.textContent = cls.code || cls.title;
    if (cls.id === options.activeClassId) link.classList.add('nav-item--selected');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(path);
    });
    list.append(link);
  }
  container.append(list);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--ghost rail-classes__new';
  add.textContent = '+ New class';
  add.addEventListener('click', () => options.onCreateClass?.());
  container.append(add);
}
```

Update `renderTeacherRail` to call `renderClassesNav` instead of `renderCurriculumNav`.

Update tests that expected curriculum tree.

- [ ] **Step 3: Pass + commit**

```bash
git commit -m "feat: open class pages from rail class list"
```

---

### Task 6: Home Clinical Glass dashboard

**Files:**
- Create: `src/teacher/home-clock.ts`
- Modify: `src/teacher/home.ts`
- Modify: `src/styles/app.css` (home layout grid)
- Modify: `tests/unit/teacher-home.test.ts`

- [ ] **Step 1: Rewrite failing home tests** for structure:

```ts
expect(root.querySelector('[data-home-hero-clock]')).not.toBeNull();
expect(root.querySelector('[data-home-panel="signals"]')).not.toBeNull();
expect(root.querySelector('[data-home-panel="week"]')).not.toBeNull();
expect(root.querySelector('[data-home-panel="classes"]')).not.toBeNull();
// week column shows day number
expect(root.textContent).toMatch(/\b\d{1,2}\b/);
// lesson card is a link to /lessons/
```

- [ ] **Step 2: Implement hero clock**

```ts
export function mountHomeClock(el: HTMLElement): () => void {
  const timeEl = document.createElement('div');
  timeEl.className = 'home-dashboard__hero-time';
  timeEl.dataset.homeHeroClock = '';
  const dateEl = document.createElement('div');
  dateEl.className = 'home-dashboard__hero-date';
  const tick = () => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit'
    });
    dateEl.textContent = now.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };
  tick();
  const id = window.setInterval(tick, 30_000);
  el.append(timeEl, dateEl);
  return () => window.clearInterval(id);
}
```

- [ ] **Step 3: Implement `renderTeacherHome`**

Layout per spec:
1. Header: clock mount + `h1.home-dashboard__title` “Teaching Dashboard” + Create control host (`data-create-host`)
2. Signal tiles row
3. Week glass panel: month label, Today/prev/next (shift week offset state in closure), Wave Week tab selected, Mon–Fri columns with **weekday + date number**, cards linking to lessons
4. Class tiles linking to `/classes/:id`

Use `groupWeekSchedule` / `selectTodaySchedule` / unpublished counts from `home-model.ts`. Week navigation adjusts a `weekOffset` and re-renders week section.

Wire Create via `mountCreateControl(host, { context: 'home', curriculum, onCreated })` — `onCreated` provided by main route refresh+navigate (pass callback through options).

Extend signature:

```ts
export interface TeacherHomeOptions {
  onCreated?: (kind: 'class' | 'unit' | 'lesson' | 'scope_sequence', id: string) => void | Promise<void>;
}
export function renderTeacherHome(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  options: TeacherHomeOptions = {}
): { dispose: () => void }
```

Dispose clears clock interval.

- [ ] **Step 4: Update `main.ts` home route** to use dispose + onCreated refresh.

- [ ] **Step 5: Pass tests + commit**

```bash
git commit -m "feat: Clinical Glass Home with clock and week calendar"
```

---

### Task 7: Overall Scope year timeline

**Files:**
- Create: `src/teacher/sections/scope-overview.ts`
- Modify: `src/teacher/sections/scope-sequences.ts`
- Modify: `tests/unit/sections-scope.test.ts`
- Modify: `src/styles/app.css` (if more overview rules needed)

- [ ] **Step 1: Failing tests**

```ts
it('renders overall timeline with subject rows and clickable unit bars', () => {
  renderScopeSequencesIndex(canvas, curriculum);
  expect(canvas.querySelector('.scope-overview')).not.toBeNull();
  const bar = canvas.querySelector('[data-scope-bar-kind="unit"]') as HTMLAnchorElement;
  expect(bar.href).toContain('/units/');
});
```

- [ ] **Step 2: Implement overview**

For each subject with a `scope_id`, resolve scope; draw term band header from first scope’s terms (or union); each row: label button → `/scope-sequences/${subject.id}`; for each timeline item, absolutely position bar:

```ts
left = ((start_week - 1) / week_count) * 100%;
width = ((end_week - start_week + 1) / week_count) * 100%;
```

Unit bars → `<a href="/units/...">`; notes → `<a href="/scope-sequences/${subjectId}?note=${item.id}">` or button that navigates with hash `#note-${id}` — prefer query `?selectNote=` and teach editor to read it in a small follow-up in same task.

Minimal note deep-link: navigate to subject editor; if `options.selectedNoteId` passed from router, select note — extend `renderScopeTimelineEditor` to accept `selectedNoteId` from `main.ts` reading `URLSearchParams`.

- [ ] **Step 3: Spacious CSS** already in Task 1 — verify row min-height 64px.

- [ ] **Step 4: Create scope control** on landing via `mountCreateControl(..., { context: 'scope-sequences' })`.

- [ ] **Step 5: Pass + commit**

```bash
git commit -m "feat: overall Scope year timeline with click-through"
```

---

### Task 8: Wire Create on Classes / Units / Lessons + glass class index

**Files:**
- Modify: `src/teacher/sections/classes.ts`
- Modify: `src/teacher/sections/units.ts`
- Modify: `src/teacher/sections/lessons.ts`
- Modify: `src/app/main.ts`
- Tests: `tests/unit/sections-classes.test.ts`, units/lessons tests

- [ ] **Step 1: Classes index** — glass tiles + `mountCreateControl` context `classes`; onCreated → refresh → `/classes/:id`.

- [ ] **Step 2: Units / Lessons indexes** — section Create only; navigate to new entity.

- [ ] **Step 3: Rail `onCreateClass`** opens class modal (same as Classes).

- [ ] **Step 4: Pass relevant unit tests + commit**

```bash
git commit -m "feat: wire section Create flows and glass class tiles"
```

---

### Task 9: Verification sweep

- [ ] **Step 1: Run full unit suite**

```bash
npm run test:unit
```

Fix failures from renamed nav / home selectors.

- [ ] **Step 2: Manual smoke** (`npm run dev` + mock api if used) — Home clock, week dates, create class, rail open class, scope overview clicks.

- [ ] **Step 3: Final commit** only if fixes needed

```bash
git commit -m "fix: align tests with Clinical Glass dashboard"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Type scale, Wave tabs, glass tiles, High Sea Create | 1, 4 |
| Hero clock + dated week + signal + class tiles | 6 |
| Month/Timeline placeholders only | 6 (Week selected; other tabs idle) |
| Contextual Create matrix | 4, 6, 7, 8 |
| POST create APIs mock + Netlify | 2, 3 |
| Rail Your classes → class page | 5 |
| Overall spacious Scope timeline + clicks | 7 |
| Click-through calendar/timeline | 6, 7 |
| Class page polish | 8 (index + light class page type classes) |

## Placeholder / consistency notes

- Seed IDs in create-api tests must be read from `fixtures/seed.json` during implementation (do not invent `year_12` if seed differs).
- `renderTeacherHome` return `dispose` for clock — update all call sites.
- Auth password in tests: match existing `class-api.test.ts` / env used by the repo.
