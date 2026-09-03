# Collection Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a homepage-only `collection` leaf that stores a query (`unit_lessons` | `recent_lessons`), resolves to lesson links when a class page mounts, and updates automatically when the unit or schedule changes.

**Architecture:** Block JSON holds only `source` + optional `title`. Pure helpers in `collection-resolve.ts` build link lists. Presentational renderer draws links (or empty copy). Student `class-view` and teacher homepage view/edit resolve from class + unit/schedule data, then call the collection renderer. Keep `renderBlock` sync; do not bake links into saved JSON.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-collection-block-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `CollectionBlockSchema`; `BlockTypeSchema`; top-level `BlockSchema` only (not leaf/columns/section/tabs children) |
| `src/schemas/lesson.ts` | Reject `collection` if present in a lesson publish walk |
| `src/blocks/create-block.ts` | Defaults; Layout group; `LESSON_BLOCK_GROUPS` excludes collection |
| `src/blocks/collection-resolve.ts` | `RECENT_LESSONS_LIMIT`, link type, resolve helpers, empty messages |
| `src/blocks/render.ts` | `renderCollectionBlock(block, mode, resolved?)` + dispatch |
| `src/blocks/editors.ts` | Collection editor + optional editor context for preview |
| `src/blocks/registry.ts` | Register collection |
| `src/student/published-class.ts` | `current_unit.lessons` on DTO |
| `src/schedule/build-published-class.ts` | Fill `current_unit.lessons` (published only, unit order) |
| `src/student/class-view.ts` | Resolve collections when rendering homepage regions |
| `src/teacher/sections/homepage-editor.ts` | Resolve context for view + edit preview |
| `src/teacher/sections/classes.ts` | Pass curriculum into homepage section for resolve |
| `src/teacher/lesson-editor.ts` | Use `LESSON_BLOCK_GROUPS` instead of `BLOCK_GROUPS` |
| `src/styles/app.css` | Minimal collection chrome |
| `tests/unit/collection-block.test.ts` | Schema, menus, resolve, render, editor smoke |
| `tests/unit/build-published-class.test.ts` | `current_unit.lessons` |
| `tests/unit/render-blocks.test.ts` | Registry key `collection` |
| `docs/BUILD.md` | History / Next up / projection |

---

### Task 1: Schema + createBlock + lesson menu split

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/schemas/lesson.ts`
- Create: `tests/unit/collection-block.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  BLOCK_GROUPS,
  HOMEPAGE_BLOCK_GROUPS,
  LESSON_BLOCK_GROUPS,
  NEW_BLOCK_TYPES,
  COLUMN_CHILD_TYPES,
  SECTION_CHILD_TYPES,
  TAB_CHILD_TYPES,
  createBlock
} from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('Collection schema', () => {
  it('parses unit_lessons and recent_lessons', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'unit_lessons' }
      }).block_type
    ).toBe('collection');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'recent_lessons', title: 'Recent' }
      }).content
    ).toMatchObject({ source: 'recent_lessons', title: 'Recent' });
  });

  it('rejects unknown source', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'collection',
        content: { source: 'resources' }
      })
    ).toThrow();
  });
});

describe('createBlock collection menus', () => {
  it('creates unit_lessons default', () => {
    const block = createBlock('collection', 'c1');
    expect(block.block_type).toBe('collection');
    if (block.block_type !== 'collection') return;
    expect(block.content.source).toBe('unit_lessons');
  });

  it('lists collection on homepage Layout but not lesson menu or nest children', () => {
    expect(NEW_BLOCK_TYPES).toContain('collection');
    const layout = BLOCK_GROUPS.find((g) => g.label === 'Layout');
    expect(layout?.types).toContain('collection');
    expect(
      HOMEPAGE_BLOCK_GROUPS.find((g) => g.label === 'Layout')?.types
    ).toContain('collection');
    expect(
      LESSON_BLOCK_GROUPS.find((g) => g.label === 'Layout')?.types
    ).not.toContain('collection');
    expect(COLUMN_CHILD_TYPES).not.toContain('collection');
    expect(SECTION_CHILD_TYPES).not.toContain('collection');
    expect(TAB_CHILD_TYPES).not.toContain('collection');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/collection-block.test.ts
```

- [ ] **Step 3: Schema** — In `src/schemas/block.ts`, add `'collection'` to `BlockTypeSchema`.

Add (near other structure leaves; keep **out** of `leafBlockSchemas`):

```ts
export const CollectionSourceSchema = z.enum(['unit_lessons', 'recent_lessons']);

export const CollectionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('collection'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    source: CollectionSourceSchema,
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

Append `CollectionBlockSchema` to the **top-level** `BlockSchema` discriminated union only (same idea as `TimelineBlockSchema` / not a columns child). Do **not** add to `leafBlockSchemas`, `ColumnChildBlockSchema`, `SectionChildBlockSchema`, or `TabChildBlockSchema`.

- [ ] **Step 4: create-block** — Add `'collection'` to `NEW_BLOCK_TYPES`, `NEW_BLOCK_LABEL` (`Collection`), and Layout `types`:

```ts
{
  label: 'Layout',
  types: ['section', 'columns', 'spacer', 'tabs', 'collection']
}
```

```ts
export const LESSON_BLOCK_GROUPS = BLOCK_GROUPS.map((group) =>
  group.label === 'Layout'
    ? {
        ...group,
        types: group.types.filter((t) => t !== 'collection')
      }
    : group
);
```

Keep `HOMEPAGE_BLOCK_GROUPS = BLOCK_GROUPS.filter((g) => g.label !== 'Learning')` (includes collection).

Exclude `collection` from `COLUMN_CHILD_TYPES`, `SECTION_CHILD_TYPES`, `TAB_CHILD_TYPES` (add `&& t !== 'collection'` alongside existing filters).

`createBlock` case:

```ts
case 'collection':
  return {
    ...shared,
    block_type: 'collection',
    variant: 'medium',
    content: { source: 'unit_lessons', title: '' }
  };
```

- [ ] **Step 5: Lesson editor** — In `src/teacher/lesson-editor.ts`, import and use `LESSON_BLOCK_GROUPS` instead of `BLOCK_GROUPS` for the Add block `<select>`.

- [ ] **Step 6: Publish reject in lessons** — In `publishBlockIssues` (`src/schemas/lesson.ts`), early in the per-block checks:

```ts
if (block.block_type === 'collection') {
  return 'Collection blocks can only be used on class homepages';
}
```

Add a focused case in `tests/unit/schemas-lesson.test.ts` (or collection test file using the same publish helper the lesson tests use) that a lesson containing a collection fails publish.

- [ ] **Step 7: Run — expect PASS** for Task 1 tests

```bash
npx vitest run tests/unit/collection-block.test.ts
```

- [ ] **Step 8: Commit** (only if user requested commits in this session; otherwise skip)

```bash
git add src/schemas/block.ts src/schemas/lesson.ts src/blocks/create-block.ts src/teacher/lesson-editor.ts tests/unit/collection-block.test.ts tests/unit/schemas-lesson.test.ts
git commit -m "$(cat <<'EOF'
feat: add collection block schema and homepage-only menus

EOF
)"
```

---

### Task 2: Resolve helpers

**Files:**
- Create: `src/blocks/collection-resolve.ts`
- Modify: `tests/unit/collection-block.test.ts`

- [ ] **Step 1: Failing resolve tests**

```ts
import {
  RECENT_LESSONS_LIMIT,
  resolveCollection,
  emptyMessageForCollection
} from '@/blocks/collection-resolve';

describe('collection-resolve', () => {
  it('resolves unit lessons in unit order', () => {
    const links = resolveCollection(
      { source: 'unit_lessons' },
      {
        currentUnitId: 'unit_1',
        unitLessons: [
          { lesson_id: 'l2', title: 'B' },
          { lesson_id: 'l1', title: 'A' }
        ],
        schedule: []
      }
    );
    expect(links.map((l) => l.lesson_id)).toEqual(['l2', 'l1']);
    expect(links[0]?.href).toBe('/s/lessons/l2');
  });

  it('returns empty when no current unit', () => {
    expect(
      resolveCollection(
        { source: 'unit_lessons' },
        { currentUnitId: undefined, unitLessons: [{ lesson_id: 'l1', title: 'A' }], schedule: [] }
      )
    ).toEqual([]);
    expect(emptyMessageForCollection('unit_lessons', { hasCurrentUnit: false, linkCount: 0 })).toMatch(
      /current unit/i
    );
  });

  it('resolves recent lessons newest first, capped, publishedOnly', () => {
    const schedule = [
      { lesson_id: 'a', title: 'A', schedule_order: 1, published: true },
      { lesson_id: 'b', title: 'B', schedule_order: 3, published: false },
      { lesson_id: 'c', title: 'C', schedule_order: 2, published: true },
      { lesson_id: 'd', title: 'D', schedule_order: 4, published: true },
      { lesson_id: 'e', title: 'E', schedule_order: 5, published: true },
      { lesson_id: 'f', title: 'F', schedule_order: 6, published: true }
    ];
    const student = resolveCollection(
      { source: 'recent_lessons' },
      { schedule },
      { publishedOnly: true }
    );
    expect(student).toHaveLength(RECENT_LESSONS_LIMIT);
    expect(student.map((l) => l.lesson_id)).toEqual(['f', 'e', 'd', 'c', 'a']);

    const teacher = resolveCollection(
      { source: 'recent_lessons' },
      { schedule },
      { publishedOnly: false }
    );
    expect(teacher[0]?.lesson_id).toBe('f');
    expect(teacher.map((l) => l.lesson_id)).toContain('b');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/collection-block.test.ts
```

- [ ] **Step 3: Implement `collection-resolve.ts`**

```ts
export const RECENT_LESSONS_LIMIT = 5;

export type CollectionLink = {
  lesson_id: string;
  title: string;
  href: string;
};

export type CollectionScheduleRow = {
  lesson_id: string;
  title: string;
  schedule_order: number;
  published: boolean;
};

export type CollectionResolveContext = {
  currentUnitId?: string;
  /** Already ordered for the current unit (caller builds this list). */
  unitLessons?: Array<{ lesson_id: string; title: string }>;
  schedule?: CollectionScheduleRow[];
};

export function lessonCollectionHref(lessonId: string): string {
  return `/s/lessons/${lessonId}`;
}

export function resolveCollection(
  content: { source: 'unit_lessons' | 'recent_lessons' },
  ctx: CollectionResolveContext,
  options: { publishedOnly?: boolean } = {}
): CollectionLink[] {
  if (content.source === 'unit_lessons') {
    if (!ctx.currentUnitId) return [];
    return (ctx.unitLessons ?? []).map((lesson) => ({
      lesson_id: lesson.lesson_id,
      title: lesson.title,
      href: lessonCollectionHref(lesson.lesson_id)
    }));
  }

  const publishedOnly = options.publishedOnly ?? false;
  const rows = [...(ctx.schedule ?? [])]
    .filter((row) => (publishedOnly ? row.published : true))
    .sort((a, b) => b.schedule_order - a.schedule_order)
    .slice(0, RECENT_LESSONS_LIMIT);

  return rows.map((row) => ({
    lesson_id: row.lesson_id,
    title: row.title,
    href: lessonCollectionHref(row.lesson_id)
  }));
}

export function emptyMessageForCollection(
  source: 'unit_lessons' | 'recent_lessons',
  state: { hasCurrentUnit: boolean; linkCount: number }
): string | undefined {
  if (state.linkCount > 0) return undefined;
  if (source === 'unit_lessons') {
    return state.hasCurrentUnit ? 'No lessons in the current unit.' : 'No current unit.';
  }
  return 'No recent lessons.';
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/collection-block.test.ts
```

- [ ] **Step 5: Commit** (if requested)

---

### Task 3: Presentational render + registry + CSS

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/collection-block.test.ts`
- Modify: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: Failing render smoke**

```ts
import { renderCollectionBlock } from '@/blocks/render';
import { createBlock } from '@/blocks/create-block';

it('renders links and empty state', () => {
  const block = createBlock('collection', 'c1');
  if (block.block_type !== 'collection') return;

  const withLinks = renderCollectionBlock(block, 'student', {
    links: [{ lesson_id: 'l1', title: 'Lesson 1', href: '/s/lessons/l1' }]
  });
  expect(withLinks.classList.contains('block-collection')).toBe(true);
  expect(withLinks.querySelector('a')?.getAttribute('href')).toBe('/s/lessons/l1');

  const empty = renderCollectionBlock(block, 'student', {
    links: [],
    emptyMessage: 'No current unit.'
  });
  expect(empty.textContent).toMatch(/No current unit/);
});
```

- [ ] **Step 2: Implement renderer**

```ts
export function renderCollectionBlock(
  block: Extract<Block, { block_type: 'collection' }>,
  _mode: RenderMode,
  resolved: { links: CollectionLink[]; emptyMessage?: string } = { links: [] }
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block block-collection';
  root.dataset.blockId = block.id;
  root.dataset.collectionSource = block.content.source;

  const titleText = block.content.title?.trim();
  if (titleText) {
    const title = document.createElement('h3');
    title.className = 'block-collection__title';
    title.textContent = titleText;
    root.append(title);
  }

  if (resolved.links.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-collection__empty';
    empty.textContent = resolved.emptyMessage ?? 'No items.';
    root.append(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'block-collection__list';
  for (const link of resolved.links) {
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.className = 'block-collection__link student-class__link';
    anchor.href = link.href;
    anchor.textContent = link.title;
    item.append(anchor);
    list.append(item);
  }
  root.append(list);
  return root;
}
```

Wire `case 'collection': return renderCollectionBlock(block, mode);` in `renderBlock` (defaults to empty links — mount paths pass resolved data via direct `renderCollectionBlock` calls).

Register in `registry.ts` like other leaves (`render: renderCollectionBlock`, editor stub can be added in Task 5 — for this task register a temporary editor that throws or a minimal shell if TypeScript requires it; prefer implementing editor in Task 5 and registering both together if cleaner — **do registry + editor together in Task 5 if Task 3 would leave registry incomplete**. Preferred: Task 3 adds render export + CSS; Task 5 registers + editor. Then Task 3 tests call `renderCollectionBlock` directly.)

**CSS** append:

```css
.block-collection {
  margin: 0 0 var(--space-4, 1rem);
}

.block-collection__title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.block-collection__list {
  margin: 0;
  padding-left: 1.25rem;
}

.block-collection__empty {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.875rem;
}
```

- [ ] **Step 3: Run collection render tests — expect PASS**

```bash
npx vitest run tests/unit/collection-block.test.ts
```

- [ ] **Step 4: Commit** (if requested)

---

### Task 4: Extend published class DTO

**Files:**
- Modify: `src/student/published-class.ts`
- Modify: `src/schedule/build-published-class.ts`
- Modify: `tests/unit/build-published-class.test.ts`

- [ ] **Step 1: Failing test** — extend existing `buildPublishedClass` fixtures so current unit returns ordered published lessons only:

```ts
it('includes ordered published lessons on current_unit', () => {
  const dto = buildPublishedClass({
    cls: baseClass,
    units,
    lessons: [
      { id: 'lesson_a', title: 'Lesson A' },
      { id: 'lesson_b', title: 'Lesson B' },
      { id: 'lesson_c', title: 'Lesson C' }
    ],
    scheduled,
    publishedLessonIds: new Set(['lesson_a', 'lesson_b'])
  });
  // Ensure unit.lesson_ids includes lesson_c unpublished for this assertion —
  // adjust fixture unit.lesson_ids to ['lesson_a', 'lesson_c', 'lesson_b'] if needed.
  expect(dto.current_unit?.lessons.map((l) => l.id)).toEqual(['lesson_a', 'lesson_b']);
});
```

(Adjust fixture `units[0].lesson_ids` to `['lesson_a', 'lesson_c', 'lesson_b']` and published set `{lesson_a, lesson_b}` → expect `['lesson_a', 'lesson_b']`.)

- [ ] **Step 2: Types**

```ts
current_unit?: {
  id: string;
  title: string;
  lessons: Array<{ id: string; title: string }>;
};
```

- [ ] **Step 3: `buildPublishedClass`** — when building `current_unit`:

```ts
const lessonsForUnit = unit.lesson_ids
  .map((lessonId) => {
    if (!publishedLessonIds.has(lessonId)) return null;
    const lesson = lessonById.get(lessonId);
    return lesson ? { id: lesson.id, title: lesson.title } : null;
  })
  .filter((entry): entry is { id: string; title: string } => entry !== null);

return { id: unit.id, title: unit.title, lessons: lessonsForUnit };
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/build-published-class.test.ts
```

- [ ] **Step 5: Commit** (if requested)

---

### Task 5: Editors + mount wiring

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/student/class-view.ts`
- Modify: `src/teacher/sections/homepage-editor.ts`
- Modify: `src/teacher/sections/classes.ts`
- Modify: `tests/unit/collection-block.test.ts`
- Modify: `tests/unit/class-view.test.ts` (if homepage region assertions exist / add one)

- [ ] **Step 1: Editor context type** — in `editors.ts` (or `collection-resolve.ts` re-export):

```ts
export type BlockEditorContext = {
  resolveCollection?: (
    block: Extract<Block, { block_type: 'collection' }>
  ) => { links: CollectionLink[]; emptyMessage?: string };
};
```

Extend `createBlockEditor(block, onChange, getLatest?, context?: BlockEditorContext)`.

- [ ] **Step 2: `createCollectionEditor`**

```ts
export function createCollectionEditor(
  block: Extract<Block, { block_type: 'collection' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'collection' }>>,
  getLatest: () => Extract<Block, { block_type: 'collection' }> = () => block,
  context: BlockEditorContext = {}
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const source = document.createElement('select');
  source.className = 'block-editor__collection-source';
  source.setAttribute('aria-label', 'Collection source');
  for (const [value, label] of [
    ['unit_lessons', 'Unit lessons'],
    ['recent_lessons', 'Recent lessons']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = block.content.source === value;
    source.append(opt);
  }

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__collection-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Collection title');

  const preview = document.createElement('div');
  preview.className = 'block-editor__collection-preview';
  preview.setAttribute('aria-label', 'Collection preview');

  const refreshPreview = () => {
    const latest = getLatest();
    const resolved = context.resolveCollection?.(latest) ?? {
      links: [],
      emptyMessage: 'Preview needs class context.'
    };
    preview.replaceChildren(renderCollectionBlock(latest, 'teacher', resolved));
  };

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        source: source.value as 'unit_lessons' | 'recent_lessons',
        title: title.value.trim() || undefined
      }
    });
    // getLatest may lag one tick — prefer building content inline for preview:
    const draft = {
      ...getLatest(),
      content: {
        source: source.value as 'unit_lessons' | 'recent_lessons',
        title: title.value.trim() || undefined
      }
    };
    const resolved = context.resolveCollection?.(draft) ?? {
      links: [],
      emptyMessage: 'Preview needs class context.'
    };
    preview.replaceChildren(renderCollectionBlock(draft, 'teacher', resolved));
  };

  source.addEventListener('change', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(source, title, preview);
  emitChange();
  return editorShell(block, onChange, fields, getLatest);
}
```

(Import `renderCollectionBlock` carefully to avoid cycles — if cycle appears, put a tiny `renderCollectionListDom` in `collection-resolve.ts` or a `collection-view.ts`. Prefer extracting presentational DOM to `src/blocks/collection-view.ts` if `editors ↔ render` cycle bites.)

Wire switch case + registry entry.

- [ ] **Step 3: Student class-view** — replace homepage region loop:

```ts
for (const block of blocks) {
  if (block.block_type === 'collection') {
    const ctx = {
      currentUnitId: cls.current_unit?.id,
      unitLessons: (cls.current_unit?.lessons ?? []).map((l) => ({
        lesson_id: l.id,
        title: l.title
      })),
      schedule: cls.schedule.map((row) => ({
        lesson_id: row.lesson_id,
        title: row.title,
        schedule_order: row.schedule_order,
        published: row.published
      }))
    };
    const links = resolveCollection(block.content, ctx, { publishedOnly: true });
    const emptyMessage = emptyMessageForCollection(block.content.source, {
      hasCurrentUnit: Boolean(cls.current_unit?.id),
      linkCount: links.length
    });
    list.append(renderCollectionBlock(block, 'student', { links, emptyMessage }));
  } else {
    list.append(renderBlock(block, 'student'));
  }
}
```

Use `navigate` on collection link clicks if other student class links prevent default — match `student-class__link` behaviour in the same file (add click handlers when appending, or delegate). Prefer matching existing unit-list pattern in `class-view.ts`.

- [ ] **Step 4: Teacher homepage** — change signatures:

```ts
export function renderHomepageRegionsView(
  container: HTMLElement,
  homepage: ClassHomepage,
  resolveContext?: CollectionResolveContext
): void

export function mountHomepageEditor(
  container: HTMLElement,
  initial: ClassHomepage,
  options: {
    onSave: (homepage: ClassHomepage) => Promise<void>;
    onCancel: () => void;
    resolveContext?: CollectionResolveContext;
  }
): HomepageEditorHandle
```

When rendering a collection block (view or editor preview), resolve with `publishedOnly: false` and `resolveContext` from options.

Helper in `classes.ts`:

```ts
function collectionContextForClass(
  cls: Class,
  curriculum: CurriculumResponse
): CollectionResolveContext {
  const unit = cls.current_unit_id
    ? curriculum.units.find((u) => u.id === cls.current_unit_id)
    : undefined;
  const lessonsById = new Map(curriculum.lessons.map((l) => [l.id, l]));
  const unitLessons = (unit?.lesson_ids ?? [])
    .map((id) => {
      const lesson = lessonsById.get(id);
      return lesson ? { lesson_id: lesson.id, title: lesson.title } : null;
    })
    .filter((x): x is { lesson_id: string; title: string } => x !== null);

  const schedule = curriculum.scheduled_lessons
    .filter((row) => row.class_id === cls.id)
    .map((row) => ({
      lesson_id: row.lesson_id,
      title: lessonsById.get(row.lesson_id)?.title ?? row.lesson_id,
      schedule_order: row.schedule_order,
      published: true // teacher preview treats scheduled rows as listable
    }));

  return {
    currentUnitId: cls.current_unit_id,
    unitLessons,
    schedule
  };
}
```

Update `buildHomepageSection(cls, curriculum, options)` and both view/edit calls to pass `collectionContextForClass(cls, curriculum)`.

Pass `resolveCollection` into `createBlockEditor` context from homepage editor.

- [ ] **Step 5: Editor smoke test** — mount editor with a fake `resolveCollection` returning one link; change source select; expect `onChange` + preview link.

- [ ] **Step 6: Run**

```bash
npx vitest run tests/unit/collection-block.test.ts tests/unit/class-view.test.ts tests/unit/render-blocks.test.ts
```

- [ ] **Step 7: Commit** (if requested)

---

### Task 6: BUILD + registry list + full unit pass

**Files:**
- Modify: `docs/BUILD.md`
- Modify: `tests/unit/render-blocks.test.ts` (add `'collection'` to expected registry keys, sorted)

- [ ] **Step 1: Update `docs/BUILD.md`**

- Next up #1 → **html_app** (Builder UX remains after)
- History row: Collection block shipped (unit lessons + recent on class homepage)
- Block types live: add `collection` (30 → 31)
- Projection: tick Collection
- Phase 5 note: Collection done
- Latest note: Collection next → html_app

- [ ] **Step 2: Full unit pass**

```bash
npx vitest run tests/unit
```

- [ ] **Step 3: Commit** (if requested)

```bash
git add docs/BUILD.md tests/unit/render-blocks.test.ts src/blocks/registry.ts
git commit -m "$(cat <<'EOF'
feat: register collection block and update BUILD roadmap

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| `unit_lessons` + `recent_lessons` sources | 1–2 |
| Homepage only; exclude lesson menu | 1 |
| Always current unit; no unit_id in content | 1–2 |
| Recent fixed last 5 | 2 |
| Mount-time resolve; no snapshot links | 2, 5 |
| Presentational render + empty states | 3, 5 |
| Extend published `current_unit.lessons` | 4 |
| Teacher curriculum resolve + editor preview | 5 |
| Student publishedOnly recent / unit lessons | 4–5 |
| Publish: no content completeness; reject in lessons | 1 |
| AT 009 spirit (auto-update via resolve) | 2, 5 |
| BUILD update | 6 |
| Not in columns/section/tabs schema | 1 |

No TBD placeholders. `RECENT_LESSONS_LIMIT = 5` locked. Href `/s/lessons/:id` locked.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-collection-block.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
