# Templates & Reuse (Compositions v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can save a top-level lesson `section` as a Composition template and insert it into any lesson as an independent copy.

**Architecture:** Store composition snapshots under Netlify Blobs `templates/compositions/{id}`. Dedicated GET/POST list+create and GET-by-id APIs (auth). Lesson editor adds Save on section rows and an Insert composition control; insert uses existing `cloneBlockWithNewIds` then lesson autosave.

**Tech Stack:** TypeScript, Zod, Netlify Functions, Vitest, existing lesson editor patterns

**Spec:** `docs/superpowers/specs/2026-08-09-templates-reuse-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/composition.ts` | `CompositionTemplateSchema` + types |
| `src/schemas/index.ts` | Re-export composition |
| `src/storage/keys.ts` | `compositionKey(id)` |
| `netlify/functions/_shared/blobs.mts` | Re-export `compositionKey` |
| `scripts/mock-store.ts` | Mirror `compositionKey` if keys are duplicated there |
| `netlify/functions/compositions.mts` | `GET` list + `POST` create → `/api/compositions` |
| `netlify/functions/composition.mts` | `GET` by id → `/api/compositions/:id` |
| `scripts/mock-api.ts` | Mirror handlers |
| `src/teacher/lesson-editor.ts` | Save + Insert UI |
| `src/styles/app.css` | Minimal add-bar / button spacing if needed |
| `tests/unit/composition-template.test.ts` | Schema + clone-on-insert helper behaviour |
| `tests/unit/compositions-api.test.ts` | API auth/CRUD via handlers or mock-api |
| `docs/BUILD.md` | History / projection / latest note |

---

### Task 1: Schema + storage key

**Files:**
- Create: `src/schemas/composition.ts`
- Modify: `src/schemas/index.ts`
- Modify: `src/storage/keys.ts`
- Modify: `netlify/functions/_shared/blobs.mts`
- Create: `tests/unit/composition-template.test.ts`

- [ ] **Step 1: Failing test — schema**

```ts
import { describe, it, expect } from 'vitest';
import { CompositionTemplateSchema } from '@/schemas/composition';
import { createBlock } from '@/blocks/create-block';

describe('CompositionTemplateSchema', () => {
  it('accepts a composition with a section root', () => {
    const root = createBlock('section', 'block_sec_1');
    const parsed = CompositionTemplateSchema.safeParse({
      id: 'composition_1',
      type: 'composition_template',
      title: 'Reading pack',
      slug: 'reading-pack',
      status: 'active',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty title', () => {
    const root = createBlock('section', 'block_sec_1');
    const parsed = CompositionTemplateSchema.safeParse({
      id: 'composition_1',
      type: 'composition_template',
      title: '',
      slug: 'x',
      status: 'active',
      root,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect fail (module missing)**

Run: `npx vitest run tests/unit/composition-template.test.ts`

- [ ] **Step 3: Implement schema + key**

`src/schemas/composition.ts`:

```ts
import { z } from 'zod';
import { CommonFields } from './common';
import { SectionBlockSchema } from './block';

export const CompositionTemplateSchema = z.object({
  ...CommonFields,
  type: z.literal('composition_template'),
  root: SectionBlockSchema
});

export type CompositionTemplate = z.infer<typeof CompositionTemplateSchema>;

export const CompositionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updated_at: z.string().datetime()
});

export type CompositionSummary = z.infer<typeof CompositionSummarySchema>;
```

Add to `src/storage/keys.ts`:

```ts
export function compositionKey(id: string): string {
  return `templates/compositions/${id}`;
}
```

Re-export from `blobs.mts` and `schemas/index.ts`.

**Note:** `SectionBlockSchema` must be imported from `block.ts`. If circular import issues arise with `BlockSchema` lazy, import `SectionBlockSchema` only (it should already be a concrete export).

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add src/schemas/composition.ts src/schemas/index.ts src/storage/keys.ts netlify/functions/_shared/blobs.mts tests/unit/composition-template.test.ts
git commit -m "feat(templates): add composition schema and storage key"
```

---

### Task 2: Insert helper (clone independence)

**Files:**
- Create: `src/blocks/composition-insert.ts` (optional thin helper)
- Modify: `tests/unit/composition-template.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { cloneBlockWithNewIds, createBlock } from '@/blocks/create-block';
import { insertCompositionRoot } from '@/blocks/composition-insert';

it('insertCompositionRoot returns a new section id independent of template root', () => {
  const root = createBlock('section', 'block_template_root');
  root.content.title = 'Saved section';
  let n = 0;
  const inserted = insertCompositionRoot(root, () => {
    n += 1;
    return `block_lesson_${n}`;
  });
  expect(inserted.block_type).toBe('section');
  expect(inserted.id).toBe('block_lesson_1');
  expect(inserted.id).not.toBe(root.id);
  expect(inserted.content.title).toBe('Saved section');
});
```

- [ ] **Step 2: Implement**

```ts
import type { Block } from '@/schemas/block';
import { cloneBlockWithNewIds } from '@/blocks/create-block';

type SectionBlock = Extract<Block, { block_type: 'section' }>;

export function insertCompositionRoot(
  root: SectionBlock,
  nextId: () => string,
  now?: () => string
): SectionBlock {
  return cloneBlockWithNewIds(root, nextId, now) as SectionBlock;
}
```

- [ ] **Step 3: Tests pass + commit**

```bash
git commit -m "feat(templates): add composition insert helper"
```

---

### Task 3: Netlify API — list + create + get

**Files:**
- Create: `netlify/functions/compositions.mts`
- Create: `netlify/functions/composition.mts`
- Create: `tests/unit/compositions-api.test.ts`
- Modify: `scripts/mock-api.ts`
- Modify: `scripts/mock-store.ts` if it duplicates key helpers

Follow patterns in `units.mts` / `lesson.mts` / `curriculum.mts` `listEntries`.

- [ ] **Step 1: Failing API tests** (use real handlers with test blob store pattern from `netlify-content-routes.test.ts`, or `createMockApi`)

```ts
it('POST /api/compositions requires auth', async () => { /* 401 */ });
it('POST /api/compositions stores a composition', async () => { /* 201 + get */ });
it('GET /api/compositions lists summaries', async () => { /* includes title */ });
it('GET /api/compositions/:id returns root', async () => { /* section */ });
```

- [ ] **Step 2: Implement `compositions.mts`**

```ts
// GET: list prefix templates/compositions/
// POST: { title, root } → slugify(title), newId('composition'), validate CompositionTemplateSchema, setJSON
export const config = { path: '/api/compositions' };
```

- [ ] **Step 3: Implement `composition.mts`**

```ts
// GET :id → getJSON(compositionKey(id)) or 404
export const config = { path: '/api/compositions/:id' };
```

- [ ] **Step 4: Mirror in `scripts/mock-api.ts`**

Wire:
- `GET /api/compositions`
- `POST /api/compositions`
- `GET /api/compositions/:id`

Use same validation and `compositionKey`.

- [ ] **Step 5: Tests pass + commit**

```bash
git commit -m "feat(templates): add compositions API"
```

---

### Task 4: Lesson editor UI

**Files:**
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/styles/app.css` (only if spacing breaks)
- Modify: `tests/unit/lesson-editor.test.ts` (smoke: Save button on section; insert calls API)

- [ ] **Step 1: Failing editor test** (mock `apiGet`/`apiPost`)

Expect section rows to include a control with text `Save as composition`.  
Expect add-bar to include Insert composition control.  
On save click with mocked prompt → `apiPost('/api/compositions', …)`.  
On insert → lesson gains a section with new id.

- [ ] **Step 2: Wire editor**

On mount: `apiGet<{ compositions: CompositionSummary[] }>('/api/compositions')` (or bare array — match API shape; prefer `{ compositions: [...] }` for consistency with other list payloads, **or** bare array if simpler — pick **`{ compositions: CompositionSummary[] }`** and stick to it).

Save handler:
```ts
const title = window.prompt('Composition name', block.content.title || 'Composition');
if (!title?.trim()) return;
await apiPost('/api/compositions', { title: title.trim(), root: block });
// refresh select options
```

Insert handler:
```ts
const full = await apiGet<CompositionTemplate>(`/api/compositions/${id}`);
const clone = insertCompositionRoot(full.root, () => { blockCounter += 1; return `block_${lesson.id}_${blockCounter}`; });
lesson.blocks.push(clone);
markDirty();
renderBlocksList();
```

Only show Save on `block.block_type === 'section'`.

- [ ] **Step 3: Tests pass + commit**

```bash
git commit -m "feat(templates): save and insert compositions in lesson editor"
```

---

### Task 5: BUILD.md + verify

**Files:**
- Modify: `docs/BUILD.md`
- Ensure design/plan paths are linked from History

- [ ] **Step 1: Update BUILD.md** History, Projection (Templates), Latest note, Phase 11 status note (compositions v1)

- [ ] **Step 2: Run full unit suite**

Run: `npm test`

- [ ] **Step 3: Commit docs**

```bash
git commit -m "docs: mark compositions v1 shipped in BUILD"
```

---

## Self-review

1. **Spec coverage:** Save section, insert independent copy, API list/create/get, storage key, BUILD updates — all tasked.  
2. **No linked templates / lesson templates** — correctly omitted.  
3. **API list shape:** `{ compositions: [...] }` locked in Task 3–4.  
4. **SectionBlockSchema import:** verify no circular import; if needed, duplicate a minimal section check with `BlockSchema` parse + `block_type === 'section'`.  
