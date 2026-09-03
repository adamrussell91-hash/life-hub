# Class Homepage Editor + Student Class Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist editable Class homepage regions (all lesson block types) on the Class record; teacher whole-page Edit/Save; student read-only `/s/classes/:classId` with generated sections + blocks.

**Architecture:** Extend `ClassSchema` with `homepage`; extend `PATCH /api/classes/:id`; add public `GET /api/published/classes/:id`; teacher Class page edit mode reuses `createBlockEditor` / `renderBlock`; student view mirrors unit-view patterns.

**Tech Stack:** TypeScript, Zod, Vite, Vitest, existing blocks registry, mock-api + Netlify Functions

**Spec:** `docs/superpowers/specs/2026-08-08-class-homepage-editor-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/class.ts` | `ClassHomepageSchema` + `homepage?` on Class |
| `src/schemas/index.ts` | Re-exports |
| `src/teacher/schedule-api.ts` | Extend `patchClass` body with `homepage?` |
| `netlify/functions/class.mts` | Accept/validate `homepage` on PATCH |
| `scripts/mock-api.ts` | Same PATCH behavior |
| `netlify/functions/published-class.mts` | `GET /api/published/classes/:id` |
| `scripts/mock-api.ts` | Public GET published class |
| `src/teacher/sections/homepage-editor.ts` | Edit-mode UI for three regions |
| `src/teacher/sections/classes.ts` | View/edit toggle; render homepage regions |
| `src/student/class-view.ts` | Student Class page mount |
| `src/app/router.ts` | `student-class` route |
| `src/app/main.ts` | Wire student + teacher |
| `src/styles/app.css` | Homepage edit + student class styles |
| Tests | schemas, class PATCH, published-class, homepage editor, class-view, router |

---

### Task 1: Class homepage schema

**Files:**
- Modify: `src/schemas/class.ts`
- Modify: `src/schemas/index.ts`
- Modify: `tests/unit/schemas-class.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { BlockSchema } from '@/schemas/block';
// or from '@/schemas'

it('accepts homepage with block regions', () => {
  const cls = ClassSchema.parse({
    /* valid class fields */,
    homepage: {
      announcements: [
        {
          id: 'b1',
          type: 'block',
          block_type: 'heading',
          variant: 'h2',
          text: 'Hello',
          visibility: 'all'
        }
      ],
      resources: [],
      custom: []
    }
  });
  expect(cls.homepage?.announcements).toHaveLength(1);
});

it('rejects invalid homepage blocks', () => {
  expect(() =>
    ClassSchema.parse({
      /* valid class */,
      homepage: {
        announcements: [{ id: 'x', type: 'block', block_type: 'heading' }],
        resources: [],
        custom: []
      }
    })
  ).toThrow();
});
```

Use a real valid block fixture matching existing lesson block tests.

- [ ] **Step 2: Implement**

```ts
import { BlockSchema } from './block';

export const ClassHomepageSchema = z.object({
  announcements: z.array(BlockSchema),
  resources: z.array(BlockSchema),
  custom: z.array(BlockSchema)
});

// on ClassSchema:
homepage: ClassHomepageSchema.optional(),
```

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat: add Class homepage schema"
```

---

### Task 2: Extend PATCH class for homepage

**Files:**
- Modify: `netlify/functions/class.mts`
- Modify: `scripts/mock-api.ts` (`handlePatchClass`)
- Modify: `src/teacher/schedule-api.ts`
- Modify: `tests/unit/class-api.test.ts`
- Modify: `tests/unit/netlify-content-routes.test.ts` (or class-api only)

- [ ] **Step 1: Update `patchClass` client type**

```ts
import type { Class, Block } from '@/schemas';

export type ClassHomepage = {
  announcements: Block[];
  resources: Block[];
  custom: Block[];
};

export function patchClass(
  id: string,
  body: {
    meeting_days?: number[];
    current_scheduled_lesson_id?: string | null;
    homepage?: ClassHomepage;
  }
): Promise<Class> {
  return apiPatch(`/api/classes/${id}`, body);
}
```

- [ ] **Step 2: Failing API test**

```ts
it('persists homepage on PATCH', async () => {
  // seed class; PATCH with homepage.announcements = [valid heading]
  // GET class from store / response → expect announcements length 1
});

it('rejects invalid homepage blocks with 400', async () => { ... });
```

- [ ] **Step 3: Implement Netlify + mock**

Update `parseBody` / handler so at least one of `meeting_days`, `current_scheduled_lesson_id`, `homepage` is required.

When `homepage` present:
```ts
const parsed = ClassHomepageSchema.safeParse(record.homepage);
if (!parsed.success) return 400 validation_error;
candidate.homepage = parsed.data;
```

Then `ClassSchema.parse` / existing merge + persist.

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: persist Class homepage via PATCH"
```

---

### Task 3: `GET /api/published/classes/:id`

**Files:**
- Create: `netlify/functions/published-class.mts`
- Modify: `scripts/mock-api.ts`
- Create: `tests/unit/published-class-api.test.ts` (and/or netlify tests)
- Create: `src/student/published-class.ts` (DTO type + optional fetch helper)

- [ ] **Step 1: Define DTO type**

```ts
// src/student/published-class.ts
import type { Block } from '@/schemas';

export interface PublishedClassScheduleRow {
  id: string;
  date: string;
  schedule_order: number;
  lesson_id: string;
  title: string;
}

export interface PublishedClass {
  id: string;
  code: string;
  title: string;
  display_name?: string;
  homepage: {
    announcements: Block[];
    resources: Block[];
    custom: Block[];
  };
  current_unit?: { id: string; title: string };
  current_lesson?: { id: string; title: string; lesson_id: string };
  schedule: PublishedClassScheduleRow[];
  active_units: Array<{ id: string; title: string }>;
}

export function fetchPublishedClass(classId: string): Promise<PublishedClass> {
  return apiGet(`/api/published/classes/${classId}`);
}
```

- [ ] **Step 2: Failing tests** — 404 missing; happy path returns schedule ordered, homepage arrays, titles; no auth required

- [ ] **Step 3: Implement builder** (shared pure helper preferred)

```ts
// src/schedule/build-published-class.ts
export function buildPublishedClass(input: {
  cls: Class;
  units: Unit[];
  lessons: Array<{ id: string; title: string }>;
  scheduled: ScheduledLesson[];
  publishedLessonIds: Set<string>; // optional for Open links later
}): PublishedClass
```

Normalize homepage empties; resolve current unit/lesson; sort schedule; map titles.

Wire Netlify `published-class.mts` (`config.path = '/api/published/classes/:id'`) and mock-api GET (no session).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add published class API"
```

---

### Task 4: Teacher homepage view + edit mode

**Files:**
- Create: `src/teacher/sections/homepage-editor.ts`
- Modify: `src/teacher/sections/classes.ts`
- Modify: `tests/unit/sections-classes.test.ts`
- Create: `tests/unit/homepage-editor.test.ts`
- Modify: `src/styles/app.css`
- Modify: `src/app/main.ts` if options needed

- [ ] **Step 1: Failing UI tests**

```ts
it('shows Edit homepage and renders announcement blocks in view mode', () => { ... });
it('enters edit mode and Save calls patchClass with homepage', async () => { ... });
it('Cancel restores prior homepage without PATCH', () => { ... });
```

Mock `@/teacher/schedule-api` `patchClass`.

- [ ] **Step 2: Implement `homepage-editor.ts`**

```ts
export function renderHomepageRegionsView(
  container: HTMLElement,
  homepage: ClassHomepage
): void // renderBlock(block, 'teacher') per region; omit empty regions or show empty copy

export function mountHomepageEditor(
  container: HTMLElement,
  initial: ClassHomepage,
  options: {
    onSave: (homepage: ClassHomepage) => Promise<void>;
    onCancel: () => void;
  }
): { destroy(): void }
```

Editor: local copy of three arrays; per region Add block (type select all `block_type`s — create defaults like lesson editor), Up/Down/Delete, `createBlockEditor` for each; Save/Cancel toolbar.

Default new blocks: copy patterns from `lesson-editor.ts` / registry defaults.

- [ ] **Step 3: Wire `classes.ts`**

Replace placeholder sections with:
- View: `renderHomepageRegionsView`
- Button **Edit homepage** → replace manual sections area with `mountHomepageEditor`
- On save: `patchClass(id, { homepage })` then `onScheduleMutated`-style refetch (reuse `ClassPageOptions.onScheduleMutated` or add `onHomepageSaved`)
- **View as student** link → `navigate('/s/classes/' + id)` (route lands in Task 5; href OK early)

Keep generated sections + schedule tools unchanged.

- [ ] **Step 4: CSS** for `.homepage-editor`, region headers, toolbar

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add Class homepage edit mode"
```

---

### Task 5: Student Class route + view

**Files:**
- Create: `src/student/class-view.ts`
- Modify: `src/app/router.ts` — `student-class` + `/s/classes/:classId`
- Modify: `src/app/main.ts`
- Modify: `tests/unit/router.test.ts`
- Create: `tests/unit/class-view.test.ts`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Router failing test**

```ts
expect(match('/s/classes/class_2026_12engadv1')).toEqual({
  name: 'student-class',
  params: { classId: 'class_2026_12engadv1' },
  requiresAuth: false,
  path: '/s/classes/class_2026_12engadv1'
});
```

- [ ] **Step 2: Implement `mountStudentClassView`**

Pattern like `mountStudentUnitView`:
- Fetch `fetchPublishedClass(classId)`
- Render header, current unit/lesson, schedule (Open → `/s/lessons/:id` only if you pass published set — **simplest v1:** always link to `/s/lessons/:lessonId`; student lesson view already 404s if unpublished — **prefer:** include `published: boolean` on schedule rows from API builder using published lesson keys)
- Spec says prefer Open only when published — extend Task 3 DTO:

```ts
schedule: Array<{ ..., published: boolean }>
```

Only render Open when `published`.

- Render homepage regions with `renderBlock(block, 'student')`
- Not found / error states

- [ ] **Step 3: Wire main.ts** `case 'student-class':`

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "feat: add student Class page"
```

---

### Task 6: Full verification

- [ ] **Step 1:** `npm test`  
- [ ] **Step 2:** `npm run build`  
- [ ] **Step 3:** Grep placeholders “Coming next” on Class page path — should be gone for the three regions  
- [ ] **Step 4:** Commit polish only if needed  

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Class.homepage schema | 1 |
| PATCH homepage | 2 |
| GET published class | 3 |
| Teacher edit mode | 4 |
| Student `/s/classes/:id` | 5 |
| Verify | 6 |

## Notes

- Sanitize HTML blocks on write if lesson save does; reuse the same path.  
- Do not implement prev/next.  
- `classes.ts` is large — keep edit chrome in `homepage-editor.ts`.  
- Extending `patchClass` must remain backward compatible with meeting_days / current_scheduled_lesson_id-only patches.
