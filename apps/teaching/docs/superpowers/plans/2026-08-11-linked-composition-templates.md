# Linked Composition Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert compositions as live-linked top-level sections (Edit Source modal / Detach), resolve links to independent trees on publish, and PATCH compositions for source edits.

**Architecture:** Thin `section` stubs with `content.link`; drafts resolve live from composition store; publish expands via `resolveLinkedSectionsForPublish` before `toPublishedLesson`. Independent insert path unchanged.

**Tech Stack:** TypeScript, Zod, Vitest, Netlify Functions, existing mock-api + lesson-editor patterns

**Spec:** `docs/superpowers/specs/2026-08-11-linked-composition-templates-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `SectionLinkSchema`; `content.link`; refine linked ⇒ empty `blocks` |
| `src/schemas/index.ts` | Re-export link helpers if needed |
| `src/blocks/composition-link.ts` | `createLinkedSectionStub`, `isLinkedSection`, `isCompositionUsable` |
| `src/blocks/resolve-linked-sections.ts` | `resolveLinkedSectionsForPublish` + `LinkedResolveError` |
| `src/blocks/composition-insert.ts` | Keep independent insert; optionally re-export stub helper |
| `netlify/functions/composition.mts` | Add `PATCH` |
| `scripts/mock-api.ts` | `PATCH` composition + publish resolve |
| `netlify/functions/publish.mts` | Resolve links before snapshot |
| `src/teacher/lesson-editor.ts` | Insert copy/linked, linked row UI, Detach, Edit Source modal |
| `src/styles/app.css` | Linked indicator + modal styles (match existing editor) |
| `tests/unit/composition-link.test.ts` | Stub + usability |
| `tests/unit/resolve-linked-sections.test.ts` | Publish resolve |
| `tests/unit/compositions-api.test.ts` | PATCH cases |
| `tests/unit/publish-linked.test.ts` (or extend existing publish tests) | Publish expand / fail |
| `tests/unit/lesson-editor.test.ts` | Insert linked / Detach / Edit Source |
| `docs/BUILD.md` | Move linked reuse into History |

---

### Task 1: Section link schema

**Files:**
- Modify: `src/schemas/block.ts` (SectionBlockSchema)
- Modify: `tests/unit/composition-template.test.ts` (or new `tests/unit/section-link-schema.test.ts`)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';

const ISO = '2026-01-01T00:00:00.000Z';

function baseSection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block_1',
    type: 'block',
    block_type: 'section',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { title: 'Hint', blocks: [] },
    layout: {},
    print: {},
    settings: {},
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...overrides
  };
}

describe('linked section schema', () => {
  it('accepts linked stub with empty blocks', () => {
    const parsed = BlockSchema.safeParse(
      baseSection({
        content: {
          title: 'Hint',
          blocks: [],
          link: { mode: 'linked', source_composition_id: 'composition_1' }
        }
      })
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects linked stub with non-empty blocks', () => {
    const child = {
      id: 'block_child',
      type: 'block',
      block_type: 'rich_text',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { html: '<p>x</p>' },
      layout: {},
      print: {},
      settings: {},
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    const parsed = BlockSchema.safeParse(
      baseSection({
        content: {
          title: 'Hint',
          blocks: [child],
          link: { mode: 'linked', source_composition_id: 'composition_1' }
        }
      })
    );
    expect(parsed.success).toBe(false);
  });

  it('still accepts independent sections without link', () => {
    expect(BlockSchema.safeParse(baseSection()).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/section-link-schema.test.ts
```

- [ ] **Step 3: Implement schema**

In `src/schemas/block.ts`, near `SectionBlockSchema`:

```ts
export const SectionLinkSchema = z.object({
  mode: z.literal('linked'),
  source_composition_id: z.string().min(1)
});

export const SectionBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('block'),
    block_type: z.literal('section'),
    variant: z.string().default('medium'),
    visibility: VisibilitySchema,
    content: z.object({
      title: z.string(),
      collapsed_in_editor: z.boolean().optional(),
      blocks: z.array(SectionChildBlockSchema),
      link: SectionLinkSchema.optional()
    }),
    ...blockLayout,
    ...blockTimestamps
  })
  .superRefine((section, ctx) => {
    if (section.content.link && section.content.blocks.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Linked sections must have empty content.blocks',
        path: ['content', 'blocks']
      });
    }
  });
```

Export `SectionLinkSchema` from `src/schemas/index.ts` if other schemas are re-exported there.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/section-link-schema.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/schemas/block.ts src/schemas/index.ts tests/unit/section-link-schema.test.ts
git commit -m "feat(schema): linked composition section stubs"
```

---

### Task 2: Link helpers

**Files:**
- Create: `src/blocks/composition-link.ts`
- Create: `tests/unit/composition-link.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  createLinkedSectionStub,
  isLinkedSection,
  isCompositionUsable
} from '@/blocks/composition-link';
import type { CompositionTemplate } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';

describe('composition-link', () => {
  it('createLinkedSectionStub builds empty linked section', () => {
    const stub = createLinkedSectionStub({
      id: 'block_linked_1',
      sourceCompositionId: 'composition_1',
      titleHint: 'Reading pack'
    });
    expect(isLinkedSection(stub)).toBe(true);
    expect(stub.content.blocks).toEqual([]);
    expect(stub.content.link).toEqual({
      mode: 'linked',
      source_composition_id: 'composition_1'
    });
    expect(stub.content.title).toBe('Reading pack');
  });

  it('isCompositionUsable requires active status', () => {
    const root = createBlock('section', 'block_root');
    const base = {
      id: 'composition_1',
      type: 'composition_template' as const,
      title: 'T',
      slug: 't',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1 as const
    };
    expect(isCompositionUsable({ ...base, status: 'active' })).toBe(true);
    expect(isCompositionUsable({ ...base, status: 'archived' })).toBe(false);
    expect(isCompositionUsable({ ...base, status: 'trashed' })).toBe(false);
    expect(isCompositionUsable(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/composition-link.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/blocks/composition-link.ts
import type { Block } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';

type SectionBlock = Extract<Block, { block_type: 'section' }>;

export function isLinkedSection(block: Block): block is SectionBlock & {
  content: SectionBlock['content'] & {
    link: { mode: 'linked'; source_composition_id: string };
  };
} {
  return (
    block.block_type === 'section' &&
    block.content.link?.mode === 'linked' &&
    typeof block.content.link.source_composition_id === 'string'
  );
}

export function createLinkedSectionStub(options: {
  id: string;
  sourceCompositionId: string;
  titleHint: string;
  now?: () => string;
}): SectionBlock {
  const section = createBlock('section', options.id, options.now) as SectionBlock;
  section.content.title = options.titleHint;
  section.content.blocks = [];
  section.content.link = {
    mode: 'linked',
    source_composition_id: options.sourceCompositionId
  };
  return section;
}

export function isCompositionUsable(
  composition: CompositionTemplate | null | undefined
): composition is CompositionTemplate {
  return !!composition && composition.status === 'active';
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/composition-link.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/composition-link.ts tests/unit/composition-link.test.ts
git commit -m "feat(blocks): linked composition stub helpers"
```

---

### Task 3: Publish resolve helper

**Files:**
- Create: `src/blocks/resolve-linked-sections.ts`
- Create: `tests/unit/resolve-linked-sections.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createLinkedSectionStub } from '@/blocks/composition-link';
import {
  LinkedResolveError,
  resolveLinkedSectionsForPublish
} from '@/blocks/resolve-linked-sections';
import type { CompositionTemplate } from '@/schemas/composition';

function makeComposition(id: string, title: string): CompositionTemplate {
  const root = createBlock('section', `${id}_root`) as Extract<
    ReturnType<typeof createBlock>,
    { block_type: 'section' }
  >;
  root.content.title = title;
  root.content.blocks = [createBlock('rich_text', `${id}_rt`)];
  return {
    id,
    type: 'composition_template',
    title,
    slug: 'x',
    status: 'active',
    root,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  };
}

describe('resolveLinkedSectionsForPublish', () => {
  it('expands linked stubs to independent sections without link', () => {
    const comp = makeComposition('composition_1', 'Reading');
    const stub = createLinkedSectionStub({
      id: 'block_stub',
      sourceCompositionId: 'composition_1',
      titleHint: 'Hint'
    });
    let n = 0;
    const out = resolveLinkedSectionsForPublish(
      [stub],
      (id) => (id === 'composition_1' ? comp : null),
      () => `block_pub_${++n}`
    );
    expect(out).toHaveLength(1);
    const section = out[0]!;
    expect(section.block_type).toBe('section');
    if (section.block_type !== 'section') throw new Error('expected section');
    expect(section.content.link).toBeUndefined();
    expect(section.content.title).toBe('Reading');
    expect(section.content.blocks.length).toBe(1);
    expect(section.id).toBe('block_pub_1');
  });

  it('throws LinkedResolveError when source missing', () => {
    const stub = createLinkedSectionStub({
      id: 'block_stub',
      sourceCompositionId: 'composition_missing',
      titleHint: 'Hint'
    });
    expect(() =>
      resolveLinkedSectionsForPublish([stub], () => null, () => 'block_x')
    ).toThrow(LinkedResolveError);
  });

  it('passes through non-linked blocks unchanged (same reference ok)', () => {
    const plain = createBlock('heading', 'block_h');
    const out = resolveLinkedSectionsForPublish([plain], () => null, () => 'block_x');
    expect(out[0]).toBe(plain);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/resolve-linked-sections.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/blocks/resolve-linked-sections.ts
import type { Block } from '@/schemas/block';
import type { CompositionTemplate } from '@/schemas/composition';
import { cloneBlockWithNewIds } from '@/blocks/create-block';
import { isCompositionUsable, isLinkedSection } from '@/blocks/composition-link';

export class LinkedResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedResolveError';
  }
}

export function resolveLinkedSectionsForPublish(
  blocks: Block[],
  getComposition: (id: string) => CompositionTemplate | null,
  nextId: () => string
): Block[] {
  return blocks.map((block) => {
    if (!isLinkedSection(block)) return block;
    const composition = getComposition(block.content.link.source_composition_id);
    if (!isCompositionUsable(composition)) {
      throw new LinkedResolveError(
        `Linked composition ${block.content.link.source_composition_id} is missing or not active`
      );
    }
    const cloned = cloneBlockWithNewIds(composition.root, nextId) as Extract<
      Block,
      { block_type: 'section' }
    >;
    if (cloned.content.link) {
      const { link: _link, ...content } = cloned.content;
      return { ...cloned, content };
    }
    return cloned;
  });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/resolve-linked-sections.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/resolve-linked-sections.ts tests/unit/resolve-linked-sections.test.ts
git commit -m "feat(blocks): resolve linked compositions for publish"
```

---

### Task 4: PATCH `/api/compositions/:id`

**Files:**
- Modify: `netlify/functions/composition.mts`
- Modify: `scripts/mock-api.ts`
- Modify: `tests/unit/compositions-api.test.ts`

- [ ] **Step 1: Write failing API tests** (extend `tests/unit/compositions-api.test.ts`)

```ts
it('PATCH /api/compositions/:id updates title and root', async () => {
  const cookie = await login(api);
  const root = /* createBlock('section', ...) */;
  const createRes = await api.request('POST', '/api/compositions', {
    cookie,
    body: { title: 'Original', root }
  });
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as { id: string };

  const newRoot = createBlock('section', 'block_new_root');
  if (newRoot.block_type === 'section') newRoot.content.title = 'Updated root';

  const patchRes = await api.request('PATCH', `/api/compositions/${created.id}`, {
    cookie,
    body: { title: 'Renamed', root: newRoot }
  });
  expect(patchRes.status).toBe(200);
  const patched = (await patchRes.json()) as { title: string; root: { content: { title: string } } };
  expect(patched.title).toBe('Renamed');
  expect(patched.root.content.title).toBe('Updated root');
});

it('PATCH rejects empty body', async () => {
  // create then PATCH {} → 400
});

it('PATCH returns 404 for missing id', async () => {
  const cookie = await login(api);
  const res = await api.request('PATCH', '/api/compositions/composition_missing', {
    cookie,
    body: { title: 'X' }
  });
  expect(res.status).toBe(404);
});
```

Mirror existing test helpers (`login`, `api.request`) already in that file.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/compositions-api.test.ts
```

- [ ] **Step 3: Implement mock + Netlify PATCH**

Follow `handlePatchLessonTemplate` / `lesson-template.mts` patterns:

- Allow `GET` and `PATCH`
- Body must include at least one of `title` | `root`
- Trim title; `slugify(title)` when title changes
- Validate `root` with `SectionBlockSchema` (composition root is a full section, **not** a linked stub — reject if `root.content.link` present)
- Set `updated_at`
- Return full `CompositionTemplate`

Wire mock router: composition by-id path currently GET-only — add PATCH beside GET (search `handleGetComposition` / `/api/compositions/`).

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/compositions-api.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/composition.mts scripts/mock-api.ts tests/unit/compositions-api.test.ts
git commit -m "feat(api): PATCH composition title and root"
```

---

### Task 5: Wire publish resolve (mock + Netlify)

**Files:**
- Modify: `scripts/mock-api.ts` (`handlePublishLesson`)
- Modify: `netlify/functions/publish.mts`
- Create or extend: `tests/unit/publish-linked.test.ts` (prefer mock-api integration style used by compositions-api)

- [ ] **Step 1: Write failing publish tests**

```ts
it('publish expands linked composition into independent section', async () => {
  // login → POST composition → create/save lesson with linked stub → POST publish
  // GET published lesson → section has children, no content.link
});

it('publish fails when linked composition is missing', async () => {
  // lesson with stub pointing at missing id → publish → 400
});
```

Use the same mock API harness as other API tests. For Netlify, mock coverage via `scripts/mock-api.ts` is enough if publish path is shared logic — call `resolveLinkedSectionsForPublish` in both handlers.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/publish-linked.test.ts
```

- [ ] **Step 3: Implement**

In both `handlePublishLesson` and `netlify/functions/publish.mts`, after draft load / publishable validate, **before** `toPublishedLesson`:

```ts
import { resolveLinkedSectionsForPublish, LinkedResolveError } from '../../src/blocks/resolve-linked-sections';
import { compositionKey } from /* existing keys */;
import { CompositionTemplateSchema } from '../../src/schemas';

function loadComposition(id: string): CompositionTemplate | null {
  const raw = store.getJSON(/* compositionKey(id) */);
  const parsed = CompositionTemplateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

let resolvedBlocks;
try {
  let n = 0;
  resolvedBlocks = resolveLinkedSectionsForPublish(
    validated.data.blocks,
    loadComposition,
    () => `block_pub_${validated.data.id}_${++n}`
  );
} catch (err) {
  if (err instanceof LinkedResolveError) {
    return errorResponse(400, 'validation_error', err.message);
  }
  throw err;
}

const lessonForPublish = { ...validated.data, blocks: resolvedBlocks };
const fullSnapshot = toPublishedLesson(lessonForPublish, publishedAt);
```

Netlify: `await getJSON` inside `loadComposition` — make an async wrapper:

```ts
async function resolveForPublish(lesson: Lesson): Promise<Lesson> {
  const blocks = resolveLinkedSectionsForPublish(
    lesson.blocks,
    (id) => {
      // Prefer prefetch: gather linked ids, await getJSON for each, build Map, then sync resolve.
    },
    () => `block_pub_${lesson.id}_${++n}`
  );
  return { ...lesson, blocks };
}
```

**Prefetch pattern (required for Netlify async store):**

1. Collect `source_composition_id` from top-level linked sections  
2. `await` load each into `Map<string, CompositionTemplate | null>`  
3. Call sync `resolveLinkedSectionsForPublish(blocks, (id) => map.get(id) ?? null, nextId)`

Keep draft stored **with** linked stubs (do not write resolved tree back to draft on publish). Only the published snapshot is expanded.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/publish-linked.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add scripts/mock-api.ts netlify/functions/publish.mts tests/unit/publish-linked.test.ts
git commit -m "feat(publish): expand linked compositions at publish"
```

---

### Task 6: Lesson editor — insert copy / linked + Detach

**Files:**
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/lesson-editor.test.ts`

- [ ] **Step 1: Write failing editor tests**

```ts
it('Insert linked appends a linked section stub', async () => {
  // mock GET /api/compositions list + GET /api/compositions/:id
  // click .lesson-editor__insert-composition-linked
  // expect lesson.blocks last item has content.link.source_composition_id
});

it('Detach expands linked stub into independent section', async () => {
  // mount editor with linked stub; mock GET composition
  // click Detach; expect no link and non-empty blocks (or title from root)
});

it('linked row has no Save as composition control', async () => {
  // mount with linked stub; expect no .lesson-editor__save-composition in that row
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/lesson-editor.test.ts
```

- [ ] **Step 3: Implement UI**

1. Replace single `Insert composition` button with:
   - `Insert copy` → class `lesson-editor__insert-composition-copy` (existing insert behavior)
   - `Insert linked` → class `lesson-editor__insert-composition-linked`

2. `insertLinkedComposition()`:

```ts
const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
if (!isCompositionUsable(full)) {
  setCompositionStatus('Composition is not available to link.');
  return;
}
blockCounter += 1;
const stub = createLinkedSectionStub({
  id: `block_${lesson.id}_${blockCounter}`,
  sourceCompositionId: full.id,
  titleHint: full.title
});
lesson.blocks.push(stub);
markDirty();
renderBlocksList();
```

3. In `renderBlocksList`, when `isLinkedSection(block)`:
   - Add badge/span `.lesson-editor__linked-badge` text `Linked`
   - Skip `createBlockEditor` for children; show read-only preview:
     - Maintain `Map<string, CompositionTemplate | 'missing'>` cache; fetch on render if needed
     - On success: show composition title + simple list of child `block_type`s (or mount disabled/read-only preview — keep v1 simple: title + “N blocks from composition”)
     - On missing: `.lesson-editor__linked-broken` message
   - Controls: Edit Source (Task 7), Detach, Delete (existing), Up/Down; **no** Duplicate that would clone a second live link without thinking — either disable Duplicate for linked rows or allow duplicate stub (same source). **Disable Duplicate** for linked rows in v1.
   - No Save as composition

4. `detachLinkedSection(index)`:

```ts
const block = lesson.blocks[index];
if (!block || !isLinkedSection(block)) return;
try {
  const full = await apiGet<CompositionTemplate>(
    `/api/compositions/${block.content.link.source_composition_id}`
  );
  if (!isCompositionUsable(full)) {
    setCompositionStatus('Unable to detach — composition missing or archived.');
    return;
  }
  const independent = insertCompositionRoot(full.root, () => {
    blockCounter += 1;
    return `block_${lesson.id}_${blockCounter}`;
  });
  lesson.blocks[index] = independent;
  markDirty();
  renderBlocksList();
  setCompositionStatus('Detached composition into this lesson.');
} catch {
  setCompositionStatus('Unable to detach composition.');
}
```

5. Minimal CSS for badge + broken state (match existing `.lesson-editor__*` tokens — no new purple theme).

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/lesson-editor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/teacher/lesson-editor.ts src/styles/app.css tests/unit/lesson-editor.test.ts
git commit -m "feat(editor): insert linked compositions and detach"
```

---

### Task 7: Edit Source modal

**Files:**
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/lesson-editor.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('Edit Source saves composition via PATCH and refreshes preview', async () => {
  // linked stub in lesson; click Edit Source
  // expect dialog/modal in document
  // change title input; click Save
  // expect apiPatch('/api/compositions/composition_1', expect.objectContaining({ title: ... }))
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/lesson-editor.test.ts -t "Edit Source"
```

- [ ] **Step 3: Implement modal**

- Use `<dialog class="lesson-editor__composition-modal">` (native dialog)
- On Edit Source: `GET` composition; if unusable, status error and return
- Working copy: `structuredClone(full)` 
- Fields: title `<input>`; host div for `createBlockEditor(working.root, onUpdate, getBlock, { media })` — editing the **root section** as a block (same as lesson section editor). When root updates, assign `working.root = updated`.
- Buttons: **Save** → `apiPatch(`/api/compositions/${id}`, { title, root })` then close, update cache, `renderBlocksList()`; **Cancel** → `dialog.close()` without PATCH
- `dialog.showModal()`; on Cancel/backdrop close discard

```ts
import { apiPatch } from '@/api/client';
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/lesson-editor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/teacher/lesson-editor.ts src/styles/app.css tests/unit/lesson-editor.test.ts
git commit -m "feat(editor): Edit Source modal for linked compositions"
```

---

### Task 8: BUILD.md + full verify

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**

- Move **Linked template reuse** from Next up → History (2026-08-11), link design + plan  
- Next up becomes **Versioning, archive, recovery**  
- Tick/adjust Phase 11 note: compositions v1 + linked reuse done; favourites etc. still later  
- Update Latest note

- [ ] **Step 2: Run full unit tests + typecheck**

```bash
npm run test:unit
npx tsc -p tsconfig.json --noEmit
```

Expected: all PASS / no errors. Fix any fallout (Lesson schema parse of linked stubs in fixtures, AI panel selection, etc.).

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md
git commit -m "docs: record linked composition templates slice"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `content.link` + empty blocks refine | 1 |
| Linked stub helper / usable composition | 2 |
| Publish resolve + missing fail | 3, 5 |
| PATCH composition | 4 |
| Insert copy + Insert linked | 6 |
| Linked indicator, no save-as, Detach | 6 |
| Edit Source modal | 7 |
| BUILD.md | 8 |

## Out of scope (do not implement)

Lesson/unit linked templates, `block_type: 'linked'`, student live links, used-by references, composition delete.
