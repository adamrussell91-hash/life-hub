# Gallery Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-lesson `gallery` media block — multi-image set with `grid` / `carousel` / `comparison` layouts, stacked URL editor, student lightbox, allowed at lesson root and inside section / columns / tabs.

**Architecture:** Accordion-parity leaf in `leafBlockSchemas` (auto-allowed as section/columns/tabs child). `content.layout` drives student chrome; `items[]` hold `url` / `alt_text` / optional `caption`. Comparison normalizes to exactly 2 items on layout switch. Carousel + lightbox use small client JS in `render.ts` (same spirit as tabs). Publish mirrors image URL/alt rules per item.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-gallery-block-design.md`

**Base:** Prefer a branch where **tabs** already ships (gallery nests in tabs). Layout Phase A (columns/section/spacer) required. Timeline is unrelated; no conflict if present. If starting from unfinished `feat/tabs-block` WIP, finish or stash tabs before implementing gallery so tests stay green.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `gallery` type; GalleryItem + GalleryBlock schemas; add to `leafBlockSchemas` + `BlockTypeSchema` |
| `src/schemas/lesson.ts` | Publish: per-item http(s) URL + alt; layout-aware counts already in Zod |
| `src/blocks/create-block.ts` | Create defaults (3 items, grid), Media group, clone item ids |
| `src/blocks/editors.ts` | `createGalleryEditor` + dispatch |
| `src/blocks/render.ts` | `renderGalleryBlock` (grid/carousel/comparison) + lightbox helper + dispatch |
| `src/blocks/registry.ts` | Register gallery |
| `src/styles/app.css` | Grid / carousel / comparison / lightbox / editor chrome |
| `tests/unit/gallery-block.test.ts` | Schema, create, clone, editor, render, lightbox |
| `tests/unit/schemas-lesson.test.ts` | Publish rules |
| `tests/unit/render-blocks.test.ts` | Registry includes `gallery` |
| `docs/BUILD.md` | History + projection update |

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/gallery-block.test.ts`
- Modify: `tests/unit/render-blocks.test.ts` (registry key list — only after registry wires in Task 4; for Task 1 leave registry until Task 4, or update list when registering)

- [ ] **Step 1: Write failing tests** in `tests/unit/gallery-block.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, cloneBlockWithNewIds, COLUMN_CHILD_TYPES, TAB_CHILD_TYPES } from '@/blocks/create-block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'large',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function item(id: string, overrides: Partial<{ url: string; alt_text: string; caption: string }> = {}) {
  return {
    id,
    url: overrides.url ?? '',
    alt_text: overrides.alt_text ?? '',
    ...(overrides.caption !== undefined ? { caption: overrides.caption } : {})
  };
}

describe('GalleryBlockSchema', () => {
  it('parses gallery with grid layout and items', () => {
    const block = BlockSchema.parse({
      ...baseBlock,
      block_type: 'gallery',
      content: {
        layout: 'grid',
        items: [
          item('i1', {
            url: 'https://example.com/a.png',
            alt_text: 'A',
            caption: 'Caption A'
          }),
          item('i2', { url: 'https://example.com/b.png', alt_text: 'B' })
        ]
      }
    });
    expect(block.block_type).toBe('gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(2);
  });

  it('rejects fewer than 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: { layout: 'grid', items: [item('i1')] }
      })
    ).toThrow();
  });

  it('rejects more than 12 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'carousel',
          items: Array.from({ length: 13 }, (_, i) => item(`i${i}`))
        }
      })
    ).toThrow();
  });

  it('rejects comparison with not exactly 2 items', () => {
    expect(() =>
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'gallery',
        content: {
          layout: 'comparison',
          items: [item('i1'), item('i2'), item('i3')]
        }
      })
    ).toThrow();
  });

  it('allows gallery inside columns, section, and tabs', () => {
    const gallery = {
      ...baseBlock,
      id: 'g1',
      block_type: 'gallery' as const,
      content: { layout: 'grid' as const, items: [item('a'), item('b')] }
    };

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'cols',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            { width: 6, blocks: [gallery] },
            { width: 6, blocks: [] }
          ]
        }
      }).content.columns[0]!.blocks[0]!.block_type
    ).toBe('gallery');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'sec',
        block_type: 'section',
        content: { title: 'Media', blocks: [gallery] }
      }).content.blocks[0]!.block_type
    ).toBe('gallery');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'tabs',
        block_type: 'tabs',
        content: {
          tabs: [
            { id: 't1', label: 'One', blocks: [gallery] },
            { id: 't2', label: 'Two', blocks: [] }
          ]
        }
      }).content.tabs[0]!.blocks[0]!.block_type
    ).toBe('gallery');
  });
});

describe('createBlock gallery', () => {
  it('creates 3 empty items with grid layout', () => {
    const block = createBlock('gallery', 'g1');
    expect(block.block_type).toBe('gallery');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    expect(block.content.layout).toBe('grid');
    expect(block.content.items).toHaveLength(3);
    expect(block.content.items.map((i) => i.id)).toEqual(['g1_i1', 'g1_i2', 'g1_i3']);
    expect(block.variant).toBe('large');
  });

  it('COLUMN_CHILD_TYPES and TAB_CHILD_TYPES include gallery', () => {
    expect(COLUMN_CHILD_TYPES.includes('gallery')).toBe(true);
    expect(TAB_CHILD_TYPES.includes('gallery')).toBe(true);
  });

  it('clone regenerates item ids', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    block.content.items[0]!.alt_text = 'A';
    let n = 0;
    const cloned = cloneBlockWithNewIds(block, () => `id_${++n}`);
    expect(cloned.id).toBe('id_1');
    if (cloned.block_type !== 'gallery') throw new Error('expected gallery');
    expect(cloned.content.items.map((i) => i.id)).toEqual(['id_2', 'id_3', 'id_4']);
    expect(cloned.content.items[0]!.alt_text).toBe('A');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/gallery-block.test.ts
```

Expected: FAIL (gallery type / createBlock missing)

- [ ] **Step 3: Implement schema** in `src/schemas/block.ts`

Add `'gallery'` to `BlockTypeSchema` enum (after `'image'` or near media types).

```ts
export const GalleryLayoutSchema = z.enum(['grid', 'carousel', 'comparison']);

export const GalleryItemSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  alt_text: z.string(),
  caption: z.string().optional()
});

export const GalleryBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('gallery'),
  variant: MediaSizeVariantSchema.default('large'),
  visibility: VisibilitySchema,
  content: z
    .object({
      layout: GalleryLayoutSchema,
      items: z.array(GalleryItemSchema).min(2).max(12)
    })
    .superRefine((content, ctx) => {
      if (content.layout === 'comparison' && content.items.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Comparison galleries need exactly 2 items',
          path: ['items']
        });
      }
    }),
  ...blockLayout,
  ...blockTimestamps
});
```

Insert `GalleryBlockSchema` into `leafBlockSchemas` (after `ImageBlockSchema` is fine).

- [ ] **Step 4: Implement create + clone** in `src/blocks/create-block.ts`

- Add `'gallery'` to `NEW_BLOCK_TYPES`
- Label: `gallery: 'Gallery'`
- Media group: `types: ['image', 'gallery', 'video', 'embed', 'audio', 'attachment']`
- `createBlock` case:

```ts
case 'gallery':
  return {
    ...shared,
    block_type: 'gallery',
    variant: 'large',
    content: {
      layout: 'grid',
      items: [
        { id: `${id}_i1`, url: '', alt_text: '' },
        { id: `${id}_i2`, url: '', alt_text: '' },
        { id: `${id}_i3`, url: '', alt_text: '' }
      ]
    }
  };
```

- In `cloneBlockWithNewIds`, after tabs handling (or before return):

```ts
} else if (cloned.block_type === 'gallery') {
  cloned.content = {
    ...cloned.content,
    items: cloned.content.items.map((entry) => ({
      ...entry,
      id: nextId()
    }))
  };
}
```

`COLUMN_CHILD_TYPES` / `TAB_CHILD_TYPES` already filter only containers out — gallery remains included automatically.

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/unit/gallery-block.test.ts
```

Expected: PASS for schema/create/clone describes (editor/render describes not added yet)

- [ ] **Step 6: Commit**

```bash
git add src/schemas/block.ts src/blocks/create-block.ts tests/unit/gallery-block.test.ts
git commit -m "feat: add gallery block schema and create defaults"
```

---

### Task 2: Publish validation

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write failing publish tests** in `tests/unit/schemas-lesson.test.ts` (near other media publish tests)

```ts
it('rejects gallery item missing alt on publish', () => {
  const result = PublishableLessonSchema.safeParse({
    ...validLesson,
    blocks: [
      {
        ...baseBlock,
        id: 'g1',
        block_type: 'gallery',
        variant: 'large',
        content: {
          layout: 'grid',
          items: [
            { id: 'i1', url: 'https://example.com/a.png', alt_text: 'A' },
            { id: 'i2', url: 'https://example.com/b.png', alt_text: '  ' }
          ]
        }
      }
    ]
  });
  expect(result.success).toBe(false);
});

it('rejects gallery item with non-http url on publish', () => {
  const result = PublishableLessonSchema.safeParse({
    ...validLesson,
    blocks: [
      {
        ...baseBlock,
        id: 'g1',
        block_type: 'gallery',
        variant: 'large',
        content: {
          layout: 'carousel',
          items: [
            { id: 'i1', url: 'javascript:alert(1)', alt_text: 'A' },
            { id: 'i2', url: 'https://example.com/b.png', alt_text: 'B' }
          ]
        }
      }
    ]
  });
  expect(result.success).toBe(false);
});

it('publishes gallery with valid items and empty captions', () => {
  const result = PublishableLessonSchema.safeParse({
    ...validLesson,
    blocks: [
      {
        ...baseBlock,
        id: 'g1',
        block_type: 'gallery',
        variant: 'large',
        content: {
          layout: 'comparison',
          items: [
            { id: 'i1', url: 'https://example.com/a.png', alt_text: 'Before' },
            { id: 'i2', url: 'https://example.com/b.png', alt_text: 'After' }
          ]
        }
      }
    ]
  });
  expect(result.success).toBe(true);
});
```

Use the same `validLesson` / `baseBlock` fixtures already in that file.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/schemas-lesson.test.ts -t "gallery"
```

Expected: FAIL (no gallery branch in `publishBlockIssues`)

- [ ] **Step 3: Implement** in `src/schemas/lesson.ts` inside `publishBlockIssues`, after the `image` branch:

```ts
if (block.block_type === 'gallery') {
  for (const entry of block.content.items) {
    if (!isHttpUrl(entry.url)) {
      return 'Gallery images need a valid http(s) URL to publish';
    }
    if (entry.alt_text.trim().length === 0) {
      return 'Gallery images need alt text to publish';
    }
  }
}
```

(Layout count is already enforced by Zod on parse; publish runs on parsed lessons.)

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/schemas-lesson.test.ts -t "gallery"
```

- [ ] **Step 5: Commit**

```bash
git add src/schemas/lesson.ts tests/unit/schemas-lesson.test.ts
git commit -m "feat: publish-validate gallery image URLs and alt text"
```

---

### Task 3: Gallery editor

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `tests/unit/gallery-block.test.ts`

- [ ] **Step 1: Write failing editor tests** (append to `tests/unit/gallery-block.test.ts`)

```ts
import { createGalleryEditor } from '@/blocks/registry';

describe('createGalleryEditor', () => {
  it('renders layout select and item fields; add disabled at 12', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    const changes: unknown[] = [];
    const el = createGalleryEditor(block, (next) => changes.push(next));

    const layout = el.querySelector('.block-editor__gallery-layout') as HTMLSelectElement;
    expect(layout.value).toBe('grid');

    const rows = el.querySelectorAll('.block-editor__gallery-item');
    expect(rows.length).toBe(3);

    const add = el.querySelector('.block-editor__gallery-add') as HTMLButtonElement;
    expect(add.disabled).toBe(false);

    // Fill to 12 via repeated add
    for (let i = 0; i < 9; i++) add.click();
    expect(el.querySelectorAll('.block-editor__gallery-item').length).toBe(12);
    expect(add.disabled).toBe(true);
  });

  it('switching to comparison keeps first 2 items', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    let latest = block;
    const el = createGalleryEditor(block, (next) => {
      latest = next;
    });

    const layout = el.querySelector('.block-editor__gallery-layout') as HTMLSelectElement;
    layout.value = 'comparison';
    layout.dispatchEvent(new Event('change'));

    expect(latest.content.layout).toBe('comparison');
    expect(latest.content.items).toHaveLength(2);
    expect(latest.content.items.map((i) => i.id)).toEqual(['g1_i1', 'g1_i2']);
    expect(el.querySelector('.block-editor__gallery-add')).toBeNull();
  });

  it('remove disabled at 2 for grid', () => {
    const block = createBlock('gallery', 'g1');
    if (block.block_type !== 'gallery') throw new Error('expected gallery');
    let latest = block;
    const el = createGalleryEditor(block, (next) => {
      latest = next;
    });

    const removes = () =>
      el.querySelectorAll('.block-editor__gallery-remove') as NodeListOf<HTMLButtonElement>;

    removes()[0]!.click();
    expect(latest.content.items).toHaveLength(2);
    expect([...removes()].every((b) => b.disabled)).toBe(true);
  });
});
```

Export `createGalleryEditor` from `registry.ts` the same way `createTabsEditor` is exported (wire in Step 3; test import from registry).

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/gallery-block.test.ts -t "createGalleryEditor"
```

Expected: FAIL (missing export / editor)

- [ ] **Step 3: Implement `createGalleryEditor`** in `src/blocks/editors.ts`

```ts
export function createGalleryEditor(
  block: Extract<Block, { block_type: 'gallery' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'gallery' }>>,
  getLatest: () => Extract<Block, { block_type: 'gallery' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let layout = block.content.layout;
  let items = block.content.items.map((entry) => ({ ...entry }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: sizeSelect.value as typeof block.variant,
      content: {
        layout,
        items: items.map((entry) => ({
          id: entry.id,
          url: entry.url,
          alt_text: entry.alt_text,
          ...(entry.caption ? { caption: entry.caption } : {})
        }))
      }
    });
  };

  const layoutSelect = document.createElement('select');
  layoutSelect.className = 'block-editor__gallery-layout';
  layoutSelect.setAttribute('aria-label', 'Gallery layout');
  for (const [value, label] of [
    ['grid', 'Grid'],
    ['carousel', 'Carousel'],
    ['comparison', 'Comparison']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    layoutSelect.append(opt);
  }
  layoutSelect.value = layout;

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__gallery-items';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__gallery-add';
  addButton.textContent = 'Add image';

  function emptyItem(id: string) {
    return { id, url: '', alt_text: '', caption: undefined as string | undefined };
  }

  function renderItems(): void {
    itemsContainer.replaceChildren();
    const comparison = layout === 'comparison';
    const atMin = items.length <= 2;
    const atMax = items.length >= 12;

    items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__gallery-item';

      const url = document.createElement('input');
      url.type = 'url';
      url.className = 'block-editor__gallery-url';
      url.value = entry.url;
      url.placeholder = 'Image URL (https://…)';
      url.setAttribute('aria-label', `Gallery image ${index + 1} URL`);

      const alt = document.createElement('input');
      alt.type = 'text';
      alt.className = 'block-editor__gallery-alt';
      alt.value = entry.alt_text;
      alt.placeholder = 'Alt text (required to publish)';
      alt.setAttribute('aria-label', `Gallery image ${index + 1} alt text`);

      const caption = document.createElement('input');
      caption.type = 'text';
      caption.className = 'block-editor__gallery-caption';
      caption.value = entry.caption ?? '';
      caption.placeholder = 'Caption (optional)';
      caption.setAttribute('aria-label', `Gallery image ${index + 1} caption`);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__gallery-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...items];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__gallery-down';
      down.textContent = 'Down';
      down.disabled = index === items.length - 1;
      down.addEventListener('click', () => {
        if (index >= items.length - 1) return;
        const next = [...items];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__gallery-remove';
      remove.textContent = 'Remove';
      remove.disabled = comparison || atMin;
      remove.addEventListener('click', () => {
        if (comparison || items.length <= 2) return;
        items = items.filter((_, i) => i !== index);
        emitChange();
        renderItems();
      });

      url.addEventListener('input', () => {
        items[index] = { ...items[index]!, url: url.value };
        emitChange();
      });
      alt.addEventListener('input', () => {
        items[index] = { ...items[index]!, alt_text: alt.value };
        emitChange();
      });
      caption.addEventListener('input', () => {
        items[index] = {
          ...items[index]!,
          caption: caption.value || undefined
        };
        emitChange();
      });

      row.append(url, alt, caption, up, down, remove);
      itemsContainer.append(row);
    });

    if (comparison) {
      addButton.remove();
    } else if (!addButton.isConnected) {
      fields.append(addButton);
    }
    addButton.disabled = atMax;
  }

  layoutSelect.addEventListener('change', () => {
    layout = layoutSelect.value as typeof layout;
    if (layout === 'comparison' && items.length > 2) {
      items = items.slice(0, 2);
    }
    while (layout === 'comparison' && items.length < 2) {
      items = [...items, emptyItem(`${getLatest().id}_i${items.length + 1}`)];
    }
    emitChange();
    renderItems();
  });

  addButton.addEventListener('click', () => {
    if (layout === 'comparison' || items.length >= 12) return;
    const id = `${getLatest().id}_i${Date.now()}`;
    items = [...items, emptyItem(id)];
    emitChange();
    renderItems();
  });

  fields.append(layoutSelect, sizeSelect, itemsContainer, addButton);
  renderItems();
  return editorShell(block, onChange, fields, getLatest);
}
```

Wire into `createBlockEditor` switch (`case 'gallery': return createGalleryEditor(...)`).

Export from `registry.ts`:

```ts
import { createGalleryEditor, /* existing */ } from '@/blocks/editors';
// in blockRegistry:
gallery: {
  render: renderGalleryBlock, // stub throw until Task 4 if needed — prefer implement Task 3 editor-only then Task 4 render in sequence; registry needs both, so add a temporary throw render OR do Task 3+4 together
  createEditor: createGalleryEditor
},
```

**Note:** `blockRegistry` requires both. Either (a) finish Task 3 editor + a minimal stub `renderGalleryBlock` that returns an empty div, then flesh out in Task 4, or (b) implement Task 3 and Task 4 before updating registry and keep editor tests importing `createGalleryEditor` directly from `@/blocks/editors` until registry is wired. Prefer **import from `@/blocks/editors` in tests for Task 3**, then switch/export via registry in Task 4. Adjust the test import in Step 1 to:

```ts
import { createGalleryEditor } from '@/blocks/editors';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/gallery-block.test.ts -t "createGalleryEditor"
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/editors.ts tests/unit/gallery-block.test.ts
git commit -m "feat: add gallery block editor with layout switch"
```

---

### Task 4: Student render + lightbox + CSS + registry

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/gallery-block.test.ts`
- Modify: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: Write failing render/lightbox tests** (append to `tests/unit/gallery-block.test.ts`)

```ts
import { renderGalleryBlock, renderBlock } from '@/blocks/registry';
import { isHttpUrl } from '@/blocks/url-safety';

function sampleGallery(
  layout: 'grid' | 'carousel' | 'comparison',
  count = 2
): Extract<Block, { block_type: 'gallery' }> {
  return {
    ...baseBlock,
    id: 'g1',
    block_type: 'gallery',
    content: {
      layout,
      items: Array.from({ length: count }, (_, i) =>
        item(`i${i + 1}`, {
          url: `https://example.com/${i + 1}.png`,
          alt_text: `Image ${i + 1}`,
          caption: `Cap ${i + 1}`
        })
      )
    }
  };
}

describe('renderGalleryBlock', () => {
  it('renders grid figures', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 3), 'student');
    expect(el.querySelector('.block-gallery--grid')).toBeTruthy();
    expect(el.querySelectorAll('.block-gallery__item').length).toBe(3);
    expect(el.querySelectorAll('img').length).toBe(3);
  });

  it('carousel next advances the active slide', () => {
    const el = renderGalleryBlock(sampleGallery('carousel', 3), 'student');
    const status = el.querySelector('.block-gallery__status') as HTMLElement;
    expect(status.textContent).toMatch(/1\s*\/\s*3/);
    (el.querySelector('.block-gallery__next') as HTMLButtonElement).click();
    expect(status.textContent).toMatch(/2\s*\/\s*3/);
  });

  it('comparison renders two items', () => {
    const el = renderGalleryBlock(sampleGallery('comparison', 2), 'student');
    expect(el.querySelector('.block-gallery--comparison')).toBeTruthy();
    expect(el.querySelectorAll('.block-gallery__item').length).toBe(2);
  });

  it('opens and closes lightbox', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    const imgBtn = el.querySelector('.block-gallery__open') as HTMLButtonElement;
    imgBtn.click();
    const dialog = document.body.querySelector('.block-gallery-lightbox') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    (dialog.querySelector('.block-gallery-lightbox__close') as HTMLButtonElement).click();
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
  });

  it('Escape closes lightbox', () => {
    const el = renderGalleryBlock(sampleGallery('grid', 2), 'student');
    (el.querySelector('.block-gallery__open') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('.block-gallery-lightbox')).toBeNull();
  });
});
```

Also update `tests/unit/render-blocks.test.ts` registry list to include `'gallery'` in sorted order.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/gallery-block.test.ts -t "renderGalleryBlock"
```

- [ ] **Step 3: Implement render + lightbox** in `src/blocks/render.ts`

```ts
function openGalleryLightbox(src: string, alt: string): void {
  const existing = document.body.querySelector('.block-gallery-lightbox');
  existing?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'block-gallery-lightbox';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', alt || 'Enlarged image');

  const img = document.createElement('img');
  img.className = 'block-gallery-lightbox__image';
  img.src = src;
  img.alt = alt;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn block-gallery-lightbox__close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close enlarged image');

  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    close.blur();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  }

  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  document.addEventListener('keydown', onKey);

  backdrop.append(img, close);
  document.body.append(backdrop);
  close.focus();
}

function galleryFigure(
  entry: { url: string; alt_text: string; caption?: string },
  interactive: boolean
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-gallery__item';

  if (isHttpUrl(entry.url)) {
    if (interactive) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-gallery__open';
      button.setAttribute('aria-label', `Enlarge: ${entry.alt_text || 'image'}`);
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      button.append(img);
      button.addEventListener('click', () => openGalleryLightbox(entry.url, entry.alt_text));
      figure.append(button);
    } else {
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      figure.append(img);
    }
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-gallery__unavailable';
    unavailable.textContent = entry.alt_text.trim() || 'Image unavailable.';
    figure.append(unavailable);
  }

  if (entry.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-gallery__caption';
    cap.textContent = entry.caption;
    figure.append(cap);
  }
  return figure;
}

export function renderGalleryBlock(
  block: Extract<Block, { block_type: 'gallery' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-gallery block-gallery--${block.content.layout} block-gallery--${block.variant}`;

  if (block.content.layout === 'carousel') {
    let index = 0;
    const viewport = document.createElement('div');
    viewport.className = 'block-gallery__viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-roledescription', 'carousel');

    const status = document.createElement('p');
    status.className = 'block-gallery__status';
    status.setAttribute('aria-live', 'polite');

    const dots = document.createElement('div');
    dots.className = 'block-gallery__dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Gallery slides');

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn--ghost block-gallery__prev';
    prev.textContent = 'Previous';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--ghost block-gallery__next';
    next.textContent = 'Next';

    function show(i: number): void {
      const len = block.content.items.length;
      index = ((i % len) + len) % len;
      viewport.replaceChildren(galleryFigure(block.content.items[index]!, true));
      status.textContent = `${index + 1} / ${len}`;
      [...dots.children].forEach((dot, di) => {
        (dot as HTMLButtonElement).setAttribute('aria-selected', di === index ? 'true' : 'false');
      });
    }

    block.content.items.forEach((_, di) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'block-gallery__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Slide ${di + 1}`);
      dot.addEventListener('click', () => show(di));
      dots.append(dot);
    });

    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    viewport.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
      }
    });

    const controls = document.createElement('div');
    controls.className = 'block-gallery__controls';
    controls.append(prev, status, next);

    root.append(viewport, controls, dots);
    show(0);
  } else {
    const list = document.createElement('div');
    list.className = 'block-gallery__list';
    for (const entry of block.content.items) {
      list.append(galleryFigure(entry, true));
    }
    root.append(list);
  }

  return wrapBlock(root, block, mode);
}
```

Dispatch in `renderBlock` switch: `case 'gallery': return renderGalleryBlock(block, mode);`

Register in `blockRegistry` with `renderGalleryBlock` + `createGalleryEditor`. Re-export both from `registry.ts` if other tests import from there.

- [ ] **Step 4: CSS** in `src/styles/app.css` (near other `.block-*` styles)

```css
/* Gallery */
.block-gallery__list {
  display: grid;
  gap: var(--space-3, 0.75rem);
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
}

.block-gallery--comparison .block-gallery__list {
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 0.5rem);
}

@media (max-width: 30rem) {
  .block-gallery--comparison .block-gallery__list {
    grid-template-columns: 1fr;
  }
}

.block-gallery__item {
  margin: 0;
}

.block-gallery__open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.block-gallery__open img,
.block-gallery__item > img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm, 4px);
}

.block-gallery__caption {
  margin-top: 0.35rem;
  font-size: 0.875rem;
  color: var(--color-text-muted, inherit);
}

.block-gallery__viewport {
  outline: none;
}

.block-gallery__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.block-gallery__dots {
  display: flex;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
}

.block-gallery__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  border: 1px solid var(--color-border, #ccc);
  background: transparent;
  padding: 0;
}

.block-gallery__dot[aria-selected='true'] {
  background: var(--color-text, #222);
}

.block-gallery-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(10, 20, 30, 0.72);
}

.block-gallery-lightbox__image {
  max-width: min(96vw, 56rem);
  max-height: 85vh;
  object-fit: contain;
}

.block-gallery-lightbox__close {
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.block-editor__gallery-items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.block-editor__gallery-item {
  display: grid;
  gap: 0.35rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: var(--radius-sm, 4px);
}
```

Use existing Clinical Glass tokens already in `app.css` where they exist (prefer matching `.block-image` / accordion editor spacing rather than inventing new purple/glow).

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/unit/gallery-block.test.ts tests/unit/render-blocks.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/blocks/render.ts src/blocks/registry.ts src/styles/app.css tests/unit/gallery-block.test.ts tests/unit/render-blocks.test.ts
git commit -m "feat: render gallery layouts with lightbox"
```

---

### Task 5: BUILD.md + verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**
  - Move **Gallery** from Next up / Projection checkbox → Shipped History (date 2026-08-09, link design/plan)
  - Next up becomes **Learning activities pack** (flashcards, cloze, self_check) — or whatever was #2
  - Update “Block types live today” count (+1 `gallery`)
  - Phase 5 note: gallery done; activities/viz remain
  - Latest note: Gallery shipped (grid/carousel/comparison + lightbox); next Learning activities unless priority shifts
  - If Tabs/Timeline rows are still inaccurate on the branch, only add Gallery facts; do not invent History for other slices

- [ ] **Step 2: Full unit suite**

```bash
npm run test:unit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md
git commit -m "docs: mark Gallery block shipped in BUILD.md"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Leaf `items[]` with url / alt / optional caption | 1, 3, 4 |
| Layouts grid / carousel / comparison | 1, 3, 4 |
| Create 3; grid/carousel 2–12; comparison exactly 2 | 1, 3 |
| Switch to comparison keeps first 2 | 3 |
| Allowed in root, section, columns, tabs | 1 |
| Stacked editor + reorder | 3 |
| Student grid / carousel (prev/next/dots/keys) / comparison | 4 |
| Lightbox open + Escape / backdrop / close | 4 |
| Publish URL + alt | 2 |
| BUILD update | 5 |

## Out of scope (do not implement)

- Drive / `media_id` / media library
- Nested image blocks; Image → Gallery conversion
- Lightbox next/prev through items
- Carousel autoplay
- Crop / focal point / credit
- A4 print gallery layout
- Drag-and-drop item reorder
