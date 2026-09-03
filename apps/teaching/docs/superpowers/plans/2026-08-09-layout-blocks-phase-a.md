# Phase A Layout Blocks (Columns / Section / Spacer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nested layout blocks — `columns` (four presets), `section` (labelled group), and `spacer` — so teachers can place content side-by-side and group it, with recursive schema/render/editor/publish support and no forbidden nesting.

**Architecture:** Extend the flat Zod `Block` union into a recursive tree via `z.lazy()`. Column children exclude `columns`/`section`; section children exclude `section`. Extract shared `createBlock` + preset remap helpers. Container editors call `createBlockEditor` recursively with nested `getLatest`. Student visibility filter and HTML sanitise walk the tree on publish.

**Tech Stack:** TypeScript, Zod 3.25, Vite, Vitest (happy-dom), existing Clinical Glass CSS tokens

**Spec:** `docs/superpowers/specs/2026-08-09-layout-blocks-phase-a-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/blocks/column-presets.ts` | Preset → width arrays; `remapColumnsPreset` |
| `src/blocks/create-block.ts` | Shared `NEW_BLOCK_TYPES`, labels, groups, `createBlock`, `cloneBlockWithNewIds` |
| `src/blocks/nested-blocks-editor.ts` | Reusable nested block list UI (add / reorder / delete / duplicate) |
| `src/blocks/sanitize-blocks.ts` | Deep sanitise of `rich_text` / `html` inside containers |
| `src/schemas/block.ts` | Add three types; recursive lazy unions; nesting via child schemas |
| `src/schemas/lesson.ts` | Recursive `publishBlockIssues` + section title rule |
| `src/blocks/visibility.ts` | Recursive `filterBlocksForStudent` |
| `src/blocks/editors.ts` | Spacer / section / columns editors + dispatch cases |
| `src/blocks/render.ts` | Spacer / section / columns renderers + dispatch cases |
| `src/blocks/registry.ts` | Register three types |
| `src/teacher/lesson-editor.ts` | Import shared create-block; Layout menu; deep clone on duplicate |
| `src/teacher/sections/homepage-editor.ts` | Same shared create-block + Layout menu |
| `scripts/mock-api.ts` | Use deep sanitise after filter |
| `netlify/functions/publish.mts` | Use deep sanitise after filter |
| `src/styles/app.css` | Columns grid + stack @720px; section; spacer sizes; nested editor chrome |
| `tests/unit/column-presets.test.ts` | Preset remap |
| `tests/unit/layout-blocks.test.ts` | Schema nesting, render, editor, visibility |
| `tests/unit/schemas-lesson.test.ts` | Publish section title + nested leaf failures |
| `tests/unit/visibility.test.ts` | Nested teacher_only |
| `tests/unit/render-blocks.test.ts` | Registry key list includes new types |
| `tests/unit/new-blocks.test.ts` | Leave as-is (leaf coverage); layout covered in `layout-blocks.test.ts` |

---

### Task 1: Column presets helper

**Files:**
- Create: `src/blocks/column-presets.ts`
- Create: `tests/unit/column-presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  COLUMN_PRESET_WIDTHS,
  remapColumnsPreset,
  type ColumnPreset
} from '@/blocks/column-presets';
import type { Block } from '@/schemas/block';

const leaf = (id: string): Block =>
  ({
    id,
    type: 'block',
    block_type: 'rich_text',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { html: id },
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1
  }) as Block;

describe('COLUMN_PRESET_WIDTHS', () => {
  it('maps four presets to 12-grid widths', () => {
    expect(COLUMN_PRESET_WIDTHS['50-50']).toEqual([6, 6]);
    expect(COLUMN_PRESET_WIDTHS['33-67']).toEqual([4, 8]);
    expect(COLUMN_PRESET_WIDTHS['67-33']).toEqual([8, 4]);
    expect(COLUMN_PRESET_WIDTHS['33-33-33']).toEqual([4, 4, 4]);
  });
});

describe('remapColumnsPreset', () => {
  it('keeps blocks when expanding 50-50 → 33-33-33', () => {
    const columns = [
      { width: 6, blocks: [leaf('a')] },
      { width: 6, blocks: [leaf('b')] }
    ];
    const next = remapColumnsPreset(columns, '33-33-33');
    expect(next.map((c) => c.width)).toEqual([4, 4, 4]);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b']);
    expect(next[2]!.blocks).toEqual([]);
  });

  it('folds surplus column blocks into the last column when shrinking', () => {
    const columns = [
      { width: 4, blocks: [leaf('a')] },
      { width: 4, blocks: [leaf('b')] },
      { width: 4, blocks: [leaf('c'), leaf('d')] }
    ];
    const next = remapColumnsPreset(columns, '50-50');
    expect(next.map((c) => c.width)).toEqual([6, 6]);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b', 'c', 'd']);
  });

  it('is a no-op shape when preset column count matches', () => {
    const columns = [
      { width: 4, blocks: [leaf('a')] },
      { width: 8, blocks: [leaf('b')] }
    ];
    const next = remapColumnsPreset(columns, '33-67' as ColumnPreset);
    expect(next[0]!.blocks.map((b) => b.id)).toEqual(['a']);
    expect(next[1]!.blocks.map((b) => b.id)).toEqual(['b']);
    expect(next.map((c) => c.width)).toEqual([4, 8]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/column-presets.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/blocks/column-presets.ts`**

```ts
import type { Block } from '@/schemas/block';

export const COLUMN_PRESETS = ['50-50', '33-67', '67-33', '33-33-33'] as const;
export type ColumnPreset = (typeof COLUMN_PRESETS)[number];

export const COLUMN_PRESET_WIDTHS: Record<ColumnPreset, number[]> = {
  '50-50': [6, 6],
  '33-67': [4, 8],
  '67-33': [8, 4],
  '33-33-33': [4, 4, 4]
};

export type ColumnSlot = { width: number; blocks: Block[] };

export function remapColumnsPreset(
  columns: ColumnSlot[],
  preset: ColumnPreset
): ColumnSlot[] {
  const widths = COLUMN_PRESET_WIDTHS[preset];
  const next: ColumnSlot[] = widths.map((width, index) => ({
    width,
    blocks: columns[index] ? [...columns[index]!.blocks] : []
  }));

  if (columns.length > widths.length) {
    const last = next[next.length - 1]!;
    for (let i = widths.length; i < columns.length; i += 1) {
      last.blocks.push(...columns[i]!.blocks);
    }
  }

  return next;
}

export function emptyColumnsForPreset(preset: ColumnPreset): ColumnSlot[] {
  return COLUMN_PRESET_WIDTHS[preset].map((width) => ({ width, blocks: [] as Block[] }));
}
```

Note: `Block` import will resolve after Task 2 adds layout types; until then TypeScript may complain if `Block` does not yet include containers — that is fine because Task 2 follows immediately. If implementing Task 1 alone in isolation, temporarily type `blocks` as `unknown[]` then tighten in Task 2 — preferred path: land Tasks 1–2 in one session.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/column-presets.test.ts`

Expected: PASS (once `Block` type exists for `rich_text`; if schema not yet updated, cast leaf as needed).

- [ ] **Step 5: Commit**

```bash
git add src/blocks/column-presets.ts tests/unit/column-presets.test.ts
git commit -m "$(cat <<'EOF'
feat: add column preset width map and remap helper

EOF
)"
```

---

### Task 2: Recursive block schema

**Files:**
- Modify: `src/schemas/block.ts`
- Create: `tests/unit/layout-blocks.test.ts` (schema section only first)

- [ ] **Step 1: Write failing schema tests**

Append to `tests/unit/layout-blocks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

const rich = (id: string, html = '') => ({
  ...base,
  id,
  block_type: 'rich_text' as const,
  content: { html }
});

describe('layout block schemas', () => {
  it('parses spacer, section, and columns', () => {
    expect(
      BlockSchema.parse({
        ...base,
        id: 'sp1',
        block_type: 'spacer',
        content: { size: 'medium' }
      }).block_type
    ).toBe('spacer');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'sec1',
        block_type: 'section',
        content: { title: 'Week 1', blocks: [rich('c1')] }
      }).block_type
    ).toBe('section');

    expect(
      BlockSchema.parse({
        ...base,
        id: 'col1',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            { width: 6, blocks: [rich('l')] },
            { width: 6, blocks: [rich('r')] }
          ]
        }
      }).block_type
    ).toBe('columns');
  });

  it('rejects columns nested inside columns', () => {
    const nestedColumns = {
      ...base,
      id: 'inner',
      block_type: 'columns' as const,
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    };
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 6, blocks: [nestedColumns] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside section', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'outer',
      block_type: 'section',
      content: {
        title: 'Outer',
        blocks: [
          {
            ...base,
            id: 'inner',
            block_type: 'section',
            content: { title: 'Inner', blocks: [] }
          }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('rejects section nested inside a column', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'cols',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          {
            width: 6,
            blocks: [
              {
                ...base,
                id: 'sec',
                block_type: 'section',
                content: { title: 'Nope', blocks: [] }
              }
            ]
          },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });

  it('allows columns inside a section', () => {
    const parsed = BlockSchema.parse({
      ...base,
      id: 'sec',
      block_type: 'section',
      content: {
        title: 'Layout',
        blocks: [
          {
            ...base,
            id: 'cols',
            block_type: 'columns',
            content: {
              preset: '33-67',
              columns: [
                { width: 4, blocks: [rich('a')] },
                { width: 8, blocks: [rich('b')] }
              ]
            }
          }
        ]
      }
    });
    expect(parsed.block_type).toBe('section');
  });

  it('rejects column widths that do not sum to 12', () => {
    const result = BlockSchema.safeParse({
      ...base,
      id: 'bad',
      block_type: 'columns',
      content: {
        preset: '50-50',
        columns: [
          { width: 5, blocks: [] },
          { width: 6, blocks: [] }
        ]
      }
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/layout-blocks.test.ts`

Expected: FAIL — unknown block types / parse errors.

- [ ] **Step 3: Extend `src/schemas/block.ts`**

1. Add to `BlockTypeSchema` enum: `'columns'`, `'section'`, `'spacer'` (alphabetically or at end — match existing end-append style: after `question_set`).

2. Add:

```ts
export const ColumnPresetSchema = z.enum(['50-50', '33-67', '67-33', '33-33-33']);
export const SpacerSizeSchema = z.enum(['small', 'medium', 'large']);
```

3. Keep all existing leaf schemas as today.

4. Replace the flat `BlockSchema` export with recursive construction:

```ts
// After all leaf schemas (through QuestionSetBlockSchema):

const leafBlockSchemas = [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema,
  QuoteBlockSchema,
  DividerBlockSchema,
  DefinitionBlockSchema,
  CodeBlockSchema,
  AudioBlockSchema,
  AttachmentBlockSchema,
  AccordionBlockSchema,
  TableBlockSchema,
  QuestionSetBlockSchema
] as const;

export const SpacerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('spacer'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    size: SpacerSizeSchema
  }),
  ...blockLayout,
  ...blockTimestamps
});

// Forward declaration for recursion
export type Block = z.infer<typeof BlockSchema>;

type ColumnChildBlock = Exclude<Block, { block_type: 'columns' | 'section' }>;
type SectionChildBlock = Exclude<Block, { block_type: 'section' }>;

export const ColumnChildBlockSchema: z.ZodType<ColumnChildBlock> = z.lazy(() =>
  z.discriminatedUnion('block_type', [...leafBlockSchemas, SpacerBlockSchema])
) as z.ZodType<ColumnChildBlock>;

export const ColumnsBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('block'),
    block_type: z.literal('columns'),
    variant: z.string().default('medium'),
    visibility: VisibilitySchema,
    content: z.object({
      preset: ColumnPresetSchema,
      columns: z.array(
        z.object({
          width: z.number().int().min(1).max(12),
          blocks: z.array(ColumnChildBlockSchema)
        })
      )
    }),
    ...blockLayout,
    ...blockTimestamps
  })
  .superRefine((block, ctx) => {
    const sum = block.content.columns.reduce((acc, col) => acc + col.width, 0);
    if (sum !== 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Column widths must sum to 12',
        path: ['content', 'columns']
      });
    }
  });

export const SectionChildBlockSchema: z.ZodType<SectionChildBlock> = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema
  ])
) as z.ZodType<SectionChildBlock>;

export const SectionBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('section'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string(),
    collapsed_in_editor: z.boolean().optional(),
    blocks: z.array(SectionChildBlockSchema)
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('block_type', [
    ...leafBlockSchemas,
    SpacerBlockSchema,
    ColumnsBlockSchema,
    SectionBlockSchema
  ])
) as z.ZodType<Block>;
```

**Important:** Remove the old `export type Block = z.infer<typeof BlockSchema>` that sat after the old union, and the old non-lazy `BlockSchema = z.discriminatedUnion(...)`. TypeScript may need `Block` declared via interface merging if circular inference fails — if `z.infer` on lazy fails, define an explicit `Block` union type manually matching the schemas (acceptable fallback).

5. Update `BlockTypeSchema` to include the three new literals so any code using the enum stays aligned.

- [ ] **Step 4: Run schema tests**

Run: `npx vitest run tests/unit/layout-blocks.test.ts`

Expected: PASS for schema describe block.

- [ ] **Step 5: Commit**

```bash
git add src/schemas/block.ts tests/unit/layout-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: add recursive columns, section, and spacer block schemas

EOF
)"
```

---

### Task 3: Shared createBlock + deep clone

**Files:**
- Create: `src/blocks/create-block.ts`
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/teacher/sections/homepage-editor.ts`
- Add tests in `tests/unit/layout-blocks.test.ts`

- [ ] **Step 1: Write failing clone test**

```ts
import { createBlock, cloneBlockWithNewIds } from '@/blocks/create-block';

describe('createBlock layout defaults', () => {
  it('creates empty columns for 50-50', () => {
    const block = createBlock('columns', 'c1');
    expect(block.block_type).toBe('columns');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    expect(block.content.preset).toBe('50-50');
    expect(block.content.columns).toEqual([
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ]);
  });

  it('creates section and spacer defaults', () => {
    expect(createBlock('section', 's1')).toMatchObject({
      block_type: 'section',
      content: { title: '', blocks: [] }
    });
    expect(createBlock('spacer', 'sp1')).toMatchObject({
      block_type: 'spacer',
      content: { size: 'medium' }
    });
  });
});

describe('cloneBlockWithNewIds', () => {
  it('assigns new ids to nested descendants', () => {
    const original = createBlock('section', 'sec');
    if (original.block_type !== 'section') throw new Error('expected section');
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks.push(createBlock('rich_text', 'rt'));
    original.content.blocks.push(columns);

    const clone = cloneBlockWithNewIds(original, () => 'new_1');
    // Use a counter-based id factory in real impl; test with sequential factory:
  });
});
```

Use a sequential id factory in the real test:

```ts
it('assigns new ids to nested descendants', () => {
  let n = 0;
  const nextId = () => `id_${++n}`;

  const section = createBlock('section', 'sec');
  if (section.block_type !== 'section') throw new Error('expected section');
  const columns = createBlock('columns', 'cols');
  if (columns.block_type !== 'columns') throw new Error('expected columns');
  columns.content.columns[0]!.blocks.push(createBlock('rich_text', 'rt'));
  section.content.blocks = [columns];

  const clone = cloneBlockWithNewIds(section, nextId);
  expect(clone.id).toBe('id_1');
  if (clone.block_type !== 'section') throw new Error('expected section');
  const clonedCols = clone.content.blocks[0]!;
  expect(clonedCols.id).toBe('id_2');
  if (clonedCols.block_type !== 'columns') throw new Error('expected columns');
  expect(clonedCols.content.columns[0]!.blocks[0]!.id).toBe('id_3');
  expect(section.id).toBe('sec'); // original untouched
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/layout-blocks.test.ts -t createBlock`

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/blocks/create-block.ts`**

Move `NEW_BLOCK_TYPES`, `NEW_BLOCK_LABEL`, `BLOCK_GROUPS`, and `createBlock` out of both editors into this module. Extend types:

```ts
export const NEW_BLOCK_TYPES = [
  // existing 16…
  'columns',
  'section',
  'spacer'
] as const;
export type NewBlockType = (typeof NEW_BLOCK_TYPES)[number];

export const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  // existing…
  columns: 'Columns',
  section: 'Section',
  spacer: 'Spacer'
};

export const BLOCK_GROUPS: Array<{ label: string; types: readonly NewBlockType[] }> = [
  { label: 'Basic', types: [/* unchanged */] },
  { label: 'Media', types: [/* unchanged */] },
  { label: 'Teaching', types: ['accordion', 'table', 'question_set'] },
  { label: 'Layout', types: ['section', 'columns', 'spacer'] }
];

/** Block types allowed inside a columns cell */
export const COLUMN_CHILD_TYPES = NEW_BLOCK_TYPES.filter(
  (t) => t !== 'columns' && t !== 'section'
);

/** Block types allowed inside a section */
export const SECTION_CHILD_TYPES = NEW_BLOCK_TYPES.filter((t) => t !== 'section');
```

`createBlock` switch adds:

```ts
case 'columns':
  return {
    ...shared,
    block_type: 'columns',
    variant: 'medium',
    content: {
      preset: '50-50',
      columns: emptyColumnsForPreset('50-50')
    }
  };
case 'section':
  return {
    ...shared,
    block_type: 'section',
    variant: 'medium',
    content: { title: '', blocks: [] }
  };
case 'spacer':
  return {
    ...shared,
    block_type: 'spacer',
    variant: 'medium',
    content: { size: 'medium' }
  };
```

```ts
export function cloneBlockWithNewIds(
  block: Block,
  nextId: () => string,
  now: () => string = () => new Date().toISOString()
): Block {
  const stamp = now();
  const cloned = structuredClone(block) as Block;
  cloned.id = nextId();
  cloned.created_at = stamp;
  cloned.updated_at = stamp;

  if (cloned.block_type === 'columns') {
    cloned.content = {
      ...cloned.content,
      columns: cloned.content.columns.map((col) => ({
        ...col,
        blocks: col.blocks.map((child) => cloneBlockWithNewIds(child, nextId, now))
      }))
    };
  } else if (cloned.block_type === 'section') {
    cloned.content = {
      ...cloned.content,
      blocks: cloned.content.blocks.map((child) => cloneBlockWithNewIds(child, nextId, now))
    };
  }
  return cloned;
}
```

- [ ] **Step 4: Wire lesson + homepage editors**

In both files: delete local type/label/group/`createBlock` definitions; import from `@/blocks/create-block`. Change `duplicateBlock` in lesson-editor to:

```ts
const clone = cloneBlockWithNewIds(source, () => {
  blockCounter += 1;
  return `block_${lesson.id}_${blockCounter}`;
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/layout-blocks.test.ts`

Expected: PASS for create/clone tests; existing editor tests still pass via `npx vitest run tests/unit`.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/create-block.ts src/teacher/lesson-editor.ts src/teacher/sections/homepage-editor.ts tests/unit/layout-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: share createBlock factory and deep-clone nested layout blocks

EOF
)"
```

---

### Task 4: Recursive visibility + deep sanitise

**Files:**
- Modify: `src/blocks/visibility.ts`
- Create: `src/blocks/sanitize-blocks.ts`
- Modify: `tests/unit/visibility.test.ts`
- Modify: `netlify/functions/publish.mts`
- Modify: `scripts/mock-api.ts`
- Add sanitise cases to `tests/unit/layout-blocks.test.ts`

- [ ] **Step 1: Write failing visibility tests**

Replace/extend `tests/unit/visibility.test.ts` to use full `Block` objects where nesting matters:

```ts
import { describe, it, expect } from 'vitest';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

describe('filterBlocksForStudent', () => {
  // keep existing flat Pick<> tests OR migrate them to createBlock

  it('recursively drops teacher_only children inside section and columns', () => {
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    const visible = createBlock('rich_text', 'vis');
    const hidden = createBlock('rich_text', 'hid');
    hidden.visibility = 'teacher_only';
    section.content.blocks = [visible, hidden];

    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    const colHidden = createBlock('rich_text', 'col_hid');
    colHidden.visibility = 'teacher_only';
    columns.content.columns[0]!.blocks = [createBlock('rich_text', 'col_vis'), colHidden];
    section.content.blocks.push(columns);

    const out = filterBlocksForStudent([section]);
    expect(out).toHaveLength(1);
    const s = out[0]!;
    if (s.block_type !== 'section') throw new Error('expected section');
    expect(s.content.blocks.map((b) => b.id)).toEqual(['vis', 'cols']);
    const c = s.content.blocks[1]!;
    if (c.block_type !== 'columns') throw new Error('expected columns');
    expect(c.content.columns[0]!.blocks.map((b) => b.id)).toEqual(['col_vis']);
  });

  it('drops an entire teacher_only section', () => {
    const section = createBlock('section', 'sec');
    section.visibility = 'teacher_only';
    expect(filterBlocksForStudent([section])).toEqual([]);
  });
});
```

Sanitise test:

```ts
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';

it('sanitises rich_text nested under columns', () => {
  const columns = createBlock('columns', 'cols');
  if (columns.block_type !== 'columns') throw new Error('expected columns');
  const rt = createBlock('rich_text', 'rt');
  if (rt.block_type !== 'rich_text') throw new Error('expected rich_text');
  rt.content.html = '<p>Hi<script>alert(1)</script></p>';
  columns.content.columns[0]!.blocks = [rt];

  const [out] = sanitizeBlocksDeep([columns]);
  if (out?.block_type !== 'columns') throw new Error('expected columns');
  const child = out.content.columns[0]!.blocks[0]!;
  if (child.block_type !== 'rich_text') throw new Error('expected rich_text');
  expect(child.content.html).not.toContain('<script>');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/visibility.test.ts tests/unit/layout-blocks.test.ts -t sanitises`

Expected: FAIL on recursive behaviour / missing sanitise helper.

- [ ] **Step 3: Implement recursive visibility**

```ts
import type { Block } from '@/schemas/block';

export function filterBlocksForStudent(blocks: Block[]): Block[] {
  return blocks
    .filter((block) => block.visibility === 'student_teacher')
    .map((block) => {
      if (block.block_type === 'section') {
        return {
          ...block,
          content: {
            ...block.content,
            blocks: filterBlocksForStudent(block.content.blocks)
          }
        };
      }
      if (block.block_type === 'columns') {
        return {
          ...block,
          content: {
            ...block.content,
            columns: block.content.columns.map((col) => ({
              ...col,
              blocks: filterBlocksForStudent(col.blocks)
            }))
          }
        };
      }
      return block;
    });
}
```

Update call sites that used `Pick<Block, 'visibility'>` generics — simplify to `Block[]`. Fix `build-published-class.ts` if types break (homepage regions are `Block[]`).

- [ ] **Step 4: Implement `src/blocks/sanitize-blocks.ts`**

```ts
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import type { Block } from '@/schemas/block';

export function sanitizeBlocksDeep(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.block_type === 'rich_text' || block.block_type === 'html') {
      return {
        ...block,
        content: { html: sanitizeRichTextHtml(block.content.html) }
      };
    }
    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: sanitizeBlocksDeep(block.content.blocks)
        }
      };
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: sanitizeBlocksDeep(col.blocks)
          }))
        }
      };
    }
    return block;
  });
}
```

- [ ] **Step 5: Wire publish paths**

In `netlify/functions/publish.mts` and `scripts/mock-api.ts`, replace:

```ts
const studentBlocks = filterBlocksForStudent(fullSnapshot.blocks).map((block) => {
  if (block.block_type === 'rich_text' || block.block_type === 'html') {
    return { ...block, content: { html: sanitizeRichTextHtml(block.content.html) } };
  }
  return block;
});
```

with:

```ts
const studentBlocks = sanitizeBlocksDeep(filterBlocksForStudent(fullSnapshot.blocks));
```

Import `sanitizeBlocksDeep` from the new module; remove unused `sanitizeRichTextHtml` import if no longer needed at those call sites.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/visibility.test.ts tests/unit/layout-blocks.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/blocks/visibility.ts src/blocks/sanitize-blocks.ts netlify/functions/publish.mts scripts/mock-api.ts tests/unit/visibility.test.ts tests/unit/layout-blocks.test.ts src/schedule/build-published-class.ts
git commit -m "$(cat <<'EOF'
feat: recursively filter and sanitise nested layout blocks on publish

EOF
)"
```

---

### Task 5: Publish validation for section + nested children

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write failing publish tests**

```ts
it('rejects section with empty title on publish', () => {
  const result = PublishableLessonSchema.safeParse({
    ...validLesson,
    blocks: [
      {
        ...baseBlockFields,
        id: 'sec',
        block_type: 'section',
        content: { title: '   ', blocks: [] }
      }
    ]
  });
  expect(result.success).toBe(false);
});

it('rejects nested image missing alt inside columns on publish', () => {
  const result = PublishableLessonSchema.safeParse({
    ...validLesson,
    blocks: [
      {
        ...baseBlockFields,
        id: 'cols',
        block_type: 'columns',
        content: {
          preset: '50-50',
          columns: [
            {
              width: 6,
              blocks: [
                {
                  ...baseBlockFields,
                  id: 'img',
                  block_type: 'image',
                  variant: 'large',
                  content: { url: 'https://example.com/a.png', alt_text: '' }
                }
              ]
            },
            { width: 6, blocks: [] }
          ]
        }
      }
    ]
  });
  expect(result.success).toBe(false);
});
```

(Adapt `baseBlockFields` / `validLesson` to match existing helpers in that file.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/schemas-lesson.test.ts -t 'section with empty|nested image'`

Expected: FAIL (currently ignores section / does not recurse).

- [ ] **Step 3: Update `publishBlockIssues` in `src/schemas/lesson.ts`**

```ts
function publishBlockIssues(blocks: z.infer<typeof BlockSchema>[]): string | null {
  for (const block of blocks) {
    // existing leaf checks unchanged…

    if (block.block_type === 'section') {
      if (block.content.title.trim().length === 0) {
        return 'Section blocks need a title to publish';
      }
      const nested = publishBlockIssues(block.content.blocks);
      if (nested) return nested;
    }
    if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        const nested = publishBlockIssues(col.blocks);
        if (nested) return nested;
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/schemas-lesson.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schemas/lesson.ts tests/unit/schemas-lesson.test.ts
git commit -m "$(cat <<'EOF'
feat: publish-validate section titles and nested layout children

EOF
)"
```

---

### Task 6: Renderers + CSS

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/styles/app.css`
- Extend: `tests/unit/layout-blocks.test.ts`

- [ ] **Step 1: Write failing render tests**

```ts
import {
  renderSpacerBlock,
  renderSectionBlock,
  renderColumnsBlock,
  renderBlock
} from '@/blocks/registry';
import { createBlock } from '@/blocks/create-block';

describe('layout block renderers', () => {
  it('renderSpacerBlock applies size class', () => {
    const block = createBlock('spacer', 'sp');
    if (block.block_type !== 'spacer') throw new Error('expected spacer');
    block.content.size = 'large';
    const el = renderSpacerBlock(block, 'student');
    expect(el.querySelector('.block-spacer')?.classList.contains('block-spacer--large')).toBe(
      true
    );
  });

  it('renderSectionBlock shows title and nested children', () => {
    const section = createBlock('section', 'sec');
    if (section.block_type !== 'section') throw new Error('expected section');
    section.content.title = 'Inquiry';
    section.content.blocks = [createBlock('heading', 'h1')];
    const el = renderSectionBlock(section, 'student');
    expect(el.querySelector('.block-section__title')?.textContent).toBe('Inquiry');
    expect(el.querySelector('[data-block-type="heading"]')).toBeTruthy();
  });

  it('renderColumnsBlock builds grid with width style and children', () => {
    const columns = createBlock('columns', 'cols');
    if (columns.block_type !== 'columns') throw new Error('expected columns');
    columns.content.columns[0]!.blocks = [createBlock('rich_text', 'l')];
    columns.content.columns[1]!.blocks = [createBlock('rich_text', 'r')];
    const el = renderColumnsBlock(columns, 'student');
    const grid = el.querySelector('.block-columns');
    expect(grid).toBeTruthy();
    expect((grid as HTMLElement).style.gridTemplateColumns).toContain('6fr');
    expect(el.querySelectorAll('.block-columns__col').length).toBe(2);
    expect(el.querySelectorAll('[data-block-type="rich_text"]').length).toBe(2);
  });

  it('renderBlock dispatches layout types', () => {
    expect(renderBlock(createBlock('spacer', 'sp'), 'student').dataset.blockType).toBe(
      'spacer'
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/layout-blocks.test.ts -t 'layout block renderers'`

Expected: FAIL — exports missing.

- [ ] **Step 3: Implement renderers in `src/blocks/render.ts`**

```ts
export function renderSpacerBlock(
  block: Extract<Block, { block_type: 'spacer' }>,
  mode: RenderMode
): HTMLElement {
  const el = document.createElement('div');
  el.className = `block-spacer block-spacer--${block.content.size}`;
  el.setAttribute('aria-hidden', 'true');
  return wrapBlock(el, block, mode);
}

export function renderSectionBlock(
  block: Extract<Block, { block_type: 'section' }>,
  mode: RenderMode
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'block-section';

  const title = document.createElement('h2');
  title.className = 'block-section__title';
  title.textContent = block.content.title;

  const body = document.createElement('div');
  body.className = 'block-section__body';
  for (const child of block.content.blocks) {
    body.append(renderBlock(child, mode));
  }

  section.append(title, body);
  return wrapBlock(section, block, mode);
}

export function renderColumnsBlock(
  block: Extract<Block, { block_type: 'columns' }>,
  mode: RenderMode
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'block-columns';
  grid.dataset.preset = block.content.preset;
  grid.style.gridTemplateColumns = block.content.columns
    .map((col) => `${col.width}fr`)
    .join(' ');

  for (const col of block.content.columns) {
    const cell = document.createElement('div');
    cell.className = 'block-columns__col';
    cell.dataset.width = String(col.width);
    for (const child of col.blocks) {
      cell.append(renderBlock(child, mode));
    }
    grid.append(cell);
  }

  return wrapBlock(grid, block, mode);
}
```

Add cases to `renderBlock` switch.

- [ ] **Step 4: Add CSS to `src/styles/app.css`** (near other `.block-*` student styles ~1826+)

```css
.block-spacer--small {
  height: var(--space-3, 0.75rem);
}
.block-spacer--medium {
  height: var(--space-6, 1.5rem);
}
.block-spacer--large {
  height: var(--space-10, 2.5rem);
}

.block-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1rem);
}

.block-section__title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: var(--text-xl, 1.25rem);
}

.block-section__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 1rem);
}

.block-columns {
  display: grid;
  gap: var(--space-4, 1rem);
  align-items: start;
}

.block-columns__col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 0.75rem);
  min-width: 0;
}

@media (max-width: 720px) {
  .block-columns {
    grid-template-columns: 1fr !important;
  }
}

/* Nested editor chrome */
.block-editor__columns,
.block-editor__section-children,
.block-editor__column-pane {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.block-editor__column-panes {
  display: grid;
  gap: 0.75rem;
}

.block-editor__column-pane {
  border: 1px solid var(--border-subtle, #d0d5dd);
  border-radius: 8px;
  padding: 0.75rem;
  background: color-mix(in srgb, var(--surface, #fff) 92%, transparent);
}

.block-editor__nested-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
```

Prefer existing design tokens from `src/design/tokens.css` when names differ — match whatever `--space-*` / border tokens already exist in `app.css`.

- [ ] **Step 5: Run render tests**

Run: `npx vitest run tests/unit/layout-blocks.test.ts -t 'layout block renderers'`

Expected: PASS (registry wiring may still be incomplete — if imports fail, complete Task 7 registry exports first or export renderers directly from `render.ts` in the test temporarily). Prefer finishing Task 7 registry in the same commit if needed for green tests.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/render.ts src/styles/app.css tests/unit/layout-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: render columns, section, and spacer layout blocks

EOF
)"
```

---

### Task 7: Nested blocks editor helper + container editors + registry

**Files:**
- Create: `src/blocks/nested-blocks-editor.ts`
- Modify: `src/blocks/editors.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `tests/unit/render-blocks.test.ts` (registry keys)
- Extend: `tests/unit/layout-blocks.test.ts` (editor behaviours)

- [ ] **Step 1: Write failing editor tests**

```ts
import { createColumnsEditor, createSectionEditor, createSpacerEditor } from '@/blocks/registry';
import { createBlock } from '@/blocks/create-block';
import { vi } from 'vitest';

describe('layout block editors', () => {
  it('spacer size select emits change via getLatest', () => {
    const block = createBlock('spacer', 'sp');
    const onChange = vi.fn();
    let latest = block;
    const el = createSpacerEditor(
      block as Extract<Block, { block_type: 'spacer' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'spacer' }>
    );
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'large';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalled();
    expect(
      (onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'spacer' }>).content.size
    ).toBe('large');
  });

  it('section title input updates content.title', () => {
    const block = createBlock('section', 'sec');
    const onChange = vi.fn();
    let latest = block;
    const el = createSectionEditor(
      block as Extract<Block, { block_type: 'section' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'section' }>
    );
    const input = el.querySelector(
      '.block-editor__section-title'
    ) as HTMLInputElement;
    input.value = 'Module A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      (onChange.mock.calls.at(-1)![0] as Extract<Block, { block_type: 'section' }>).content
        .title
    ).toBe('Module A');
  });

  it('columns preset change remaps widths and folds surplus blocks', () => {
    const block = createBlock('columns', 'cols');
    if (block.block_type !== 'columns') throw new Error('expected columns');
    block.content.preset = '33-33-33';
    block.content.columns = [
      { width: 4, blocks: [createBlock('rich_text', 'a')] },
      { width: 4, blocks: [createBlock('rich_text', 'b')] },
      { width: 4, blocks: [createBlock('rich_text', 'c')] }
    ];
    const onChange = vi.fn();
    let latest = block;
    const el = createColumnsEditor(
      block,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'columns' }>
    );
    const select = el.querySelector(
      '.block-editor__columns-preset'
    ) as HTMLSelectElement;
    select.value = '50-50';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const updated = onChange.mock.calls.at(-1)![0] as Extract<
      Block,
      { block_type: 'columns' }
    >;
    expect(updated.content.preset).toBe('50-50');
    expect(updated.content.columns.map((c) => c.width)).toEqual([6, 6]);
    expect(updated.content.columns[1]!.blocks.map((b) => b.id)).toEqual(['b', 'c']);
  });

  it('adding a block inside a column nests it under that column', () => {
    const block = createBlock('columns', 'cols');
    const onChange = vi.fn();
    let latest = block;
    const el = createColumnsEditor(
      block as Extract<Block, { block_type: 'columns' }>,
      (b) => {
        latest = b;
        onChange(b);
      },
      () => latest as Extract<Block, { block_type: 'columns' }>
    );
    const firstPane = el.querySelectorAll('.block-editor__column-pane')[0]!;
    const addSelect = firstPane.querySelector('select') as HTMLSelectElement;
    const addButton = firstPane.querySelector(
      'button.block-editor__nested-add'
    ) as HTMLButtonElement;
    addSelect.value = 'heading';
    addButton.click();
    const updated = onChange.mock.calls.at(-1)![0] as Extract<
      Block,
      { block_type: 'columns' }
    >;
    expect(updated.content.columns[0]!.blocks[0]!.block_type).toBe('heading');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/unit/layout-blocks.test.ts -t 'layout block editors'`

Expected: FAIL.

- [ ] **Step 3: Implement `src/blocks/nested-blocks-editor.ts`**

```ts
import { createBlockEditor } from '@/blocks/editors';
import {
  BLOCK_GROUPS,
  NEW_BLOCK_LABEL,
  createBlock,
  cloneBlockWithNewIds,
  type NewBlockType
} from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

export interface NestedBlocksEditorOptions {
  blocks: Block[];
  allowedTypes: readonly NewBlockType[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
}

export function createNestedBlocksEditor(options: NestedBlocksEditorOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-editor__nested-list';

  let blocks = [...options.blocks];
  let counter = 0;

  const nextId = () => {
    counter += 1;
    return options.idFactory() + `_n${counter}`;
  };

  function emit(next: Block[]): void {
    blocks = next;
    options.onChange(next);
    render();
  }

  function render(): void {
    root.replaceChildren();

    blocks.forEach((block, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__nested-row';

      const controls = document.createElement('div');
      controls.className = 'block-editor__nested-controls';

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...blocks];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost';
      down.textContent = '↓';
      down.disabled = index === blocks.length - 1;
      down.addEventListener('click', () => {
        if (index >= blocks.length - 1) return;
        const next = [...blocks];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        emit(next);
      });

      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'btn btn--ghost';
      dup.textContent = 'Duplicate';
      dup.addEventListener('click', () => {
        const clone = cloneBlockWithNewIds(blocks[index]!, nextId);
        const next = [...blocks];
        next.splice(index + 1, 0, clone);
        emit(next);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--ghost';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        emit(blocks.filter((_, i) => i !== index));
      });

      controls.append(up, down, dup, del);

      const editor = createBlockEditor(
        block,
        (updated) => {
          const next = [...blocks];
          next[index] = updated;
          blocks = next;
          options.onChange(next);
        },
        () => blocks[index]!
      );

      row.append(controls, editor);
      root.append(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'block-editor__nested-add-row';

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Add nested block type');
    for (const group of BLOCK_GROUPS) {
      const types = group.types.filter((t) => options.allowedTypes.includes(t));
      if (types.length === 0) continue;
      const og = document.createElement('optgroup');
      og.label = group.label;
      for (const type of types) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = NEW_BLOCK_LABEL[type];
        og.append(opt);
      }
      select.append(og);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn--ghost block-editor__nested-add';
    addBtn.textContent = 'Add block';
    addBtn.addEventListener('click', () => {
      const type = select.value as NewBlockType;
      emit([...blocks, createBlock(type, nextId())]);
    });

    addRow.append(select, addBtn);
    root.append(addRow);
  }

  render();
  return root;
}
```

**Circular import note:** `nested-blocks-editor.ts` imports `createBlockEditor` from `editors.ts`, while container editors live in `editors.ts` and import the nested helper. Break the cycle by either:
- defining container editors in a new `src/blocks/layout-editors.ts` that imports both, and having `createBlockEditor` import those; **or**
- keeping `createNestedBlocksEditor` in `editors.ts` below `createBlockEditor` (simplest — preferred if file size is acceptable).

**Preferred:** put `createNestedBlocksEditor` at the bottom of `editors.ts` after `createBlockEditor` is defined, OR move only the layout editors into `layout-editors.ts` and import `createBlockEditor` from editors (registry imports layout editors). Plan implements layout editors in `editors.ts` and places the nested helper in `nested-blocks-editor.ts` importing `createBlockEditor` from `./editors` — if Vitest hits a TDZ cycle, relocate helper into `editors.ts`.

- [ ] **Step 4: Implement spacer / section / columns editors**

```ts
export function createSpacerEditor(
  block: Extract<Block, { block_type: 'spacer' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'spacer' }>>,
  getLatest: () => Extract<Block, { block_type: 'spacer' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const select = document.createElement('select');
  select.className = 'block-editor__spacer-size';
  select.setAttribute('aria-label', 'Spacer size');
  for (const size of ['small', 'medium', 'large'] as const) {
    const opt = document.createElement('option');
    opt.value = size;
    opt.textContent = size[0]!.toUpperCase() + size.slice(1);
    select.append(opt);
  }
  select.value = block.content.size;
  select.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      content: { size: select.value as 'small' | 'medium' | 'large' }
    });
  });

  const preview = document.createElement('div');
  preview.className = `block-spacer block-spacer--${block.content.size}`;
  preview.setAttribute('aria-hidden', 'true');

  fields.append(select, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createSectionEditor(
  block: Extract<Block, { block_type: 'section' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'section' }>>,
  getLatest: () => Extract<Block, { block_type: 'section' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__section-title';
  title.value = block.content.title;
  title.placeholder = 'Section title';
  title.setAttribute('aria-label', 'Section title');
  title.addEventListener('input', () => {
    onChange({
      ...getLatest(),
      content: { ...getLatest().content, title: title.value }
    });
  });

  const collapse = document.createElement('label');
  const collapseInput = document.createElement('input');
  collapseInput.type = 'checkbox';
  collapseInput.checked = Boolean(block.content.collapsed_in_editor);
  collapseInput.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      content: {
        ...getLatest().content,
        collapsed_in_editor: collapseInput.checked
      }
    });
    children.hidden = collapseInput.checked;
  });
  collapse.append(collapseInput, document.createTextNode(' Collapse in editor'));

  const children = createNestedBlocksEditor({
    blocks: block.content.blocks,
    allowedTypes: SECTION_CHILD_TYPES,
    idFactory: () => `${getLatest().id}_child`,
    onChange: (nextBlocks) => {
      onChange({
        ...getLatest(),
        content: { ...getLatest().content, blocks: nextBlocks }
      });
    }
  });
  children.classList.add('block-editor__section-children');
  children.hidden = Boolean(block.content.collapsed_in_editor);

  fields.append(title, collapse, children);
  return editorShell(block, onChange, fields, getLatest);
}

export function createColumnsEditor(
  block: Extract<Block, { block_type: 'columns' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'columns' }>>,
  getLatest: () => Extract<Block, { block_type: 'columns' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__columns';

  const preset = document.createElement('select');
  preset.className = 'block-editor__columns-preset';
  preset.setAttribute('aria-label', 'Column layout');
  for (const value of COLUMN_PRESETS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    preset.append(opt);
  }
  preset.value = block.content.preset;
  preset.addEventListener('change', () => {
    const current = getLatest();
    const nextPreset = preset.value as ColumnPreset;
    onChange({
      ...current,
      content: {
        preset: nextPreset,
        columns: remapColumnsPreset(current.content.columns, nextPreset)
      }
    });
    // Parent lesson editor re-renders on markDirty; for unit tests, recreate by having
    // onChange only. If the shell does not remount, call a local rebuildPanes().
    rebuildPanes();
  });

  const panes = document.createElement('div');
  panes.className = 'block-editor__column-panes';

  function rebuildPanes(): void {
    const current = getLatest();
    panes.replaceChildren();
    panes.style.gridTemplateColumns = current.content.columns
      .map((col) => `${col.width}fr`)
      .join(' ');

    current.content.columns.forEach((col, colIndex) => {
      const pane = document.createElement('div');
      pane.className = 'block-editor__column-pane';
      const label = document.createElement('p');
      label.className = 'block-editor__hint';
      label.textContent = `Column ${colIndex + 1} (${col.width}/12)`;
      const nested = createNestedBlocksEditor({
        blocks: col.blocks,
        allowedTypes: COLUMN_CHILD_TYPES,
        idFactory: () => `${getLatest().id}_c${colIndex}`,
        onChange: (nextBlocks) => {
          const latest = getLatest();
          const columns = latest.content.columns.map((c, i) =>
            i === colIndex ? { ...c, blocks: nextBlocks } : c
          );
          onChange({
            ...latest,
            content: { ...latest.content, columns }
          });
        }
      });
      pane.append(label, nested);
      panes.append(pane);
    });
  }

  rebuildPanes();
  fields.append(preset, panes);
  return editorShell(block, onChange, fields, getLatest);
}
```

Import `COLUMN_PRESETS`, `remapColumnsPreset`, `COLUMN_CHILD_TYPES`, `SECTION_CHILD_TYPES`.

Add switch cases in `createBlockEditor`.

- [ ] **Step 5: Update `registry.ts`**

Register `columns`, `section`, `spacer` with their render/editor pairs; re-export the new helpers.

Update `tests/unit/render-blocks.test.ts` expected keys to include `'columns'`, `'section'`, `'spacer'` in sorted order:

```
'accordion', 'attachment', 'audio', 'callout', 'code', 'columns', 'definition',
'divider', 'embed', 'heading', 'html', 'image', 'question_set', 'quote',
'rich_text', 'section', 'spacer', 'table', 'video'
```

- [ ] **Step 6: Run tests**

Run:

```
npx vitest run tests/unit/layout-blocks.test.ts tests/unit/render-blocks.test.ts tests/unit/new-blocks.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/blocks/nested-blocks-editor.ts src/blocks/editors.ts src/blocks/registry.ts tests/unit/layout-blocks.test.ts tests/unit/render-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: add layout block editors with nested block lists

EOF
)"
```

---

### Task 8: Full suite verification

**Files:** none new — verify integration

- [ ] **Step 1: Run unit tests**

Run: `npm run test:unit`

Expected: all PASS.

- [ ] **Step 2: Run typecheck/build**

Run: `npm run build`

Expected: `tsc` clean + Vite build succeeds.

- [ ] **Step 3: Manual smoke (optional but recommended)**

1. `npm run dev` (+ mock API if used)
2. Open a lesson → Add Block → Layout → Columns / Section / Spacer
3. Put heading + image in two columns; change preset ⅓⅓⅓ → ½½; confirm blocks fold
4. Publish; open student view; resize below 720px and confirm stack

- [ ] **Step 4: Final commit if any CSS/test fixes remain**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: polish layout block edge cases after full suite

EOF
)"
```

(Only if there are leftover fixes; otherwise skip empty commit.)

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Nested `columns` / `section` / `spacer` data model | Task 2 |
| Four presets → 6+6 / 4+8 / 8+4 / 4+4+4 | Task 1 |
| No columns-in-columns; no section-in-column; no section-in-section | Task 2 child schemas |
| Sections may contain columns | Task 2 |
| Preset remap folds surplus into last column | Task 1 + Task 7 |
| Layout Add-block group | Task 3 |
| Nested editors + Add in column/section | Task 7 |
| Recursive render + stack @720px | Task 6 |
| Recursive student filter + sanitise | Task 4 |
| Section title required on publish; recurse children | Task 5 |
| Spacer sizes | Tasks 2, 6, 7 |
| Deep duplicate IDs | Task 3 |
| Homepage parity | Task 3 |

**Placeholder scan:** none intentional.  
**Type consistency:** `ColumnPreset` / `COLUMN_PRESETS` / `remapColumnsPreset` shared; `createBlock` / `cloneBlockWithNewIds` shared; editors always `onChange({ ...getLatest(), ... })`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-09-layout-blocks-phase-a.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  

**2. Inline Execution** — execute tasks in this session with executing-plans, batch checkpoints  

Which approach?
