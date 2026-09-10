# Builder UX (Columns) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `custom` column widths (12-grid number inputs) and cross-column block moves (Move-to select + HTML5 DnD append) in the columns editor.

**Architecture:** Extend `ColumnPresetSchema` with `custom`. Pure `moveBlockBetweenColumns` helper. Width inputs only when preset is custom. Optional `columnMove` on `createNestedBlocksEditor` for Move-to + drag; `createColumnsEditor` wires panes as drop targets and remaps presets as today.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), native HTML5 DnD

**Spec:** `docs/superpowers/specs/2026-08-09-builder-ux-columns-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | Add `'custom'` to `ColumnPresetSchema` |
| `src/blocks/column-presets.ts` | Export type still works; no widths map for custom |
| `src/blocks/column-move.ts` | `moveBlockBetweenColumns` |
| `src/blocks/column-widths.ts` | `trySetColumnWidth` / validate sum === 12 |
| `src/blocks/nested-blocks-editor.ts` | Optional `columnMove`; Move select + draggable rows |
| `src/blocks/layout-editors.ts` | Custom option, width inputs, drop targets, wire move |
| `src/styles/app.css` | Minimal drop-target / width row styles |
| `tests/unit/builder-ux-columns.test.ts` | Schema, move, widths, editor smoke |
| `docs/BUILD.md` | History / Next up / projection |

---

### Task 1: Schema `custom` + width helper

**Files:**
- Modify: `src/schemas/block.ts`
- Create: `src/blocks/column-widths.ts`
- Create: `tests/unit/builder-ux-columns.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { trySetColumnWidths } from '@/blocks/column-widths';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};
const base = {
  id: 'c1',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('custom columns schema', () => {
  it('accepts custom widths summing to 12', () => {
    const block = BlockSchema.parse({
      ...base,
      block_type: 'columns',
      content: {
        preset: 'custom',
        columns: [
          { width: 3, blocks: [] },
          { width: 9, blocks: [] }
        ]
      }
    });
    expect(block.block_type).toBe('columns');
    if (block.block_type !== 'columns') return;
    expect(block.content.preset).toBe('custom');
  });

  it('rejects custom widths that do not sum to 12', () => {
    expect(() =>
      BlockSchema.parse({
        ...base,
        block_type: 'columns',
        content: {
          preset: 'custom',
          columns: [
            { width: 5, blocks: [] },
            { width: 5, blocks: [] }
          ]
        }
      })
    ).toThrow();
  });
});

describe('trySetColumnWidths', () => {
  it('returns next columns when sum is 12', () => {
    const cols = [
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ];
    expect(trySetColumnWidths(cols, [4, 8])).toEqual([
      { width: 4, blocks: [] },
      { width: 8, blocks: [] }
    ]);
  });

  it('returns null when sum is not 12', () => {
    const cols = [
      { width: 6, blocks: [] },
      { width: 6, blocks: [] }
    ];
    expect(trySetColumnWidths(cols, [5, 5])).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`npm run test:unit -- tests/unit/builder-ux-columns.test.ts`

- [ ] **Step 3: Implement**

In `src/schemas/block.ts`:

```ts
export const ColumnPresetSchema = z.enum(['50-50', '33-67', '67-33', '33-33-33', 'custom']);
```

In `src/blocks/column-widths.ts`:

```ts
import type { ColumnSlot } from '@/blocks/column-presets';

export function trySetColumnWidths(
  columns: ColumnSlot[],
  widths: number[]
): ColumnSlot[] | null {
  if (widths.length !== columns.length) return null;
  if (!widths.every((w) => Number.isInteger(w) && w >= 1 && w <= 11)) return null;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== 12) return null;
  return columns.map((col, i) => ({ ...col, width: widths[i]! }));
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/schemas/block.ts src/blocks/column-widths.ts tests/unit/builder-ux-columns.test.ts
git commit -m "feat: allow custom column width preset in schema"
```

---

### Task 2: `moveBlockBetweenColumns`

**Files:**
- Create: `src/blocks/column-move.ts`
- Modify: `tests/unit/builder-ux-columns.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { moveBlockBetweenColumns } from '@/blocks/column-move';
import { createBlock } from '@/blocks/create-block';

describe('moveBlockBetweenColumns', () => {
  it('appends block to another column', () => {
    const a = createBlock('heading', 'h1');
    const b = createBlock('callout', 'c1');
    const columns = [
      { width: 6, blocks: [a, b] },
      { width: 6, blocks: [] }
    ];
    const next = moveBlockBetweenColumns(columns, 0, 1, 1);
    expect(next[0]!.blocks.map((x) => x.id)).toEqual(['h1']);
    expect(next[1]!.blocks.map((x) => x.id)).toEqual(['c1']);
  });

  it('no-ops on invalid indices', () => {
    const columns = [
      { width: 6, blocks: [createBlock('heading', 'h1')] },
      { width: 6, blocks: [] }
    ];
    expect(moveBlockBetweenColumns(columns, 0, 5, 1)).toBe(columns);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { ColumnSlot } from '@/blocks/column-presets';

export function moveBlockBetweenColumns(
  columns: ColumnSlot[],
  fromCol: number,
  fromIndex: number,
  toCol: number,
  toIndex?: number
): ColumnSlot[] {
  if (
    fromCol < 0 ||
    toCol < 0 ||
    fromCol >= columns.length ||
    toCol >= columns.length
  ) {
    return columns;
  }
  const source = columns[fromCol]!;
  if (fromIndex < 0 || fromIndex >= source.blocks.length) return columns;

  const block = source.blocks[fromIndex]!;
  const next = columns.map((col, i) => ({
    ...col,
    blocks: [...col.blocks]
  }));

  next[fromCol]!.blocks.splice(fromIndex, 1);

  let insertAt = toIndex;
  if (insertAt === undefined || insertAt < 0 || insertAt > next[toCol]!.blocks.length) {
    insertAt = next[toCol]!.blocks.length;
  }
  // If moving within same column and removing shifted indices:
  if (fromCol === toCol && fromIndex < insertAt) insertAt -= 1;

  next[toCol]!.blocks.splice(insertAt, 0, block);
  return next;
}
```

- [ ] **Step 3: Run — expect PASS; commit**

```bash
git add src/blocks/column-move.ts tests/unit/builder-ux-columns.test.ts
git commit -m "feat: add moveBlockBetweenColumns helper"
```

---

### Task 3: Nested editor Move-to + drag

**Files:**
- Modify: `src/blocks/nested-blocks-editor.ts`
- Modify: `tests/unit/builder-ux-columns.test.ts`

- [ ] **Step 1: Extend options**

```ts
export interface NestedBlocksEditorOptions {
  blocks: Block[];
  allowedTypes: readonly NewBlockType[];
  onChange: (blocks: Block[]) => void;
  idFactory: () => string;
  columnMove?: {
    columnCount: number;
    columnIndex: number;
    onMoveToColumn: (toColumnIndex: number) => void;
  };
}
```

- [ ] **Step 2: UI**

When `columnMove` set and `columnCount > 1`:
- Add `<select class="block-editor__nested-move-column" aria-label="Move to column">` with empty first option “Move to column…”, then other column indices.
- On `change`: parse value, call `onMoveToColumn`, reset select to `''`.
- Set `row.draggable = true`; on `dragstart` set `application/x-th-col-move` data: `${columnIndex}:${index}` (or JSON).
- On `dragstart`, `event.dataTransfer.effectAllowed = 'move'`.

(Drop handling lives on column panes in Task 4.)

- [ ] **Step 3: Test Move select**

```ts
import { createNestedBlocksEditor } from '@/blocks/nested-blocks-editor';
import { COLUMN_CHILD_TYPES, createBlock } from '@/blocks/create-block';

it('Move to column select calls onMoveToColumn', () => {
  const block = createBlock('heading', 'h1');
  const moves: number[] = [];
  const el = createNestedBlocksEditor({
    blocks: [block],
    allowedTypes: COLUMN_CHILD_TYPES,
    idFactory: () => 'id',
    onChange: () => {},
    columnMove: {
      columnCount: 2,
      columnIndex: 0,
      onMoveToColumn: (to) => moves.push(to)
    }
  });
  const select = el.querySelector('select.block-editor__nested-move-column') as HTMLSelectElement;
  expect(select).toBeTruthy();
  select.value = '1';
  select.dispatchEvent(new Event('change'));
  expect(moves).toEqual([1]);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/blocks/nested-blocks-editor.ts tests/unit/builder-ux-columns.test.ts
git commit -m "feat: add Move to column control on nested column editors"
```

---

### Task 4: Columns editor Custom + DnD drop

**Files:**
- Modify: `src/blocks/layout-editors.ts`
- Modify: `src/blocks/column-presets.ts` (ensure `ColumnPreset` includes custom via schema re-export or update `COLUMN_PRESETS` for named only)

**Important:** `COLUMN_PRESETS` stays the four named presets for remap. Custom is **not** in `COLUMN_PRESET_WIDTHS`. Preset `<select>` lists `...COLUMN_PRESETS, 'custom'`.

- [ ] **Step 1: Preset select**

```ts
for (const value of [...COLUMN_PRESETS, 'custom'] as const) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = value === 'custom' ? 'Custom' : value;
  preset.append(opt);
}
```

On change:
- If next is `custom`: keep columns as-is, set `preset: 'custom'`.
- If next is named: `remapColumnsPreset` as today.

- [ ] **Step 2: Width row when custom**

In `rebuildPanes`, if `preset === 'custom'`, before panes (or above each pane): render width inputs. On input:

```ts
const widths = inputs.map((el) => Number.parseInt(el.value, 10));
const nextCols = trySetColumnWidths(getLatest().content.columns, widths);
if (nextCols) {
  onChange({ ...getLatest(), content: { preset: 'custom', columns: nextCols as ... } });
  hint.textContent = '';
  rebuildPanes(); // or update grid only
} else {
  hint.textContent = 'Widths must sum to 12';
}
```

- [ ] **Step 3: Wire columnMove + drop**

Pass `columnMove` into `createNestedBlocksEditor`.

On each pane:
```ts
pane.addEventListener('dragover', (e) => {
  e.preventDefault();
  pane.classList.add('block-editor__column-pane--drop');
});
pane.addEventListener('dragleave', () => pane.classList.remove('block-editor__column-pane--drop'));
pane.addEventListener('drop', (e) => {
  e.preventDefault();
  pane.classList.remove('block-editor__column-pane--drop');
  const raw = e.dataTransfer?.getData('application/x-th-col-move');
  if (!raw) return;
  const [fromColS, fromIndexS] = raw.split(':');
  const fromCol = Number(fromColS);
  const fromIndex = Number(fromIndexS);
  const latest = getLatest();
  const moved = moveBlockBetweenColumns(
    latest.content.columns as ColumnSlot[],
    fromCol,
    fromIndex,
    colIndex
  );
  onChange({
    ...latest,
    content: { ...latest.content, columns: moved as typeof latest.content.columns }
  });
  rebuildPanes();
});
```

`onMoveToColumn(toCol)` same helper with append.

- [ ] **Step 4: CSS**

```css
.block-editor__column-pane--drop {
  outline: 2px dashed var(--wave);
}
.block-editor__columns-widths {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
```

- [ ] **Step 5: Editor smoke test for Custom + move**

```ts
import { createColumnsEditor } from '@/blocks/layout-editors';

it('Custom unlocks width inputs and Move moves blocks', () => {
  const block = createBlock('columns', 'cols');
  if (block.block_type !== 'columns') return;
  block.content.columns[0]!.blocks = [createBlock('heading', 'h1')];
  let latest = block;
  const el = createColumnsEditor(block, (n) => { latest = n; }, () => latest);

  const preset = el.querySelector('select.block-editor__columns-preset') as HTMLSelectElement;
  preset.value = 'custom';
  preset.dispatchEvent(new Event('change'));
  expect(latest.content.preset).toBe('custom');
  expect(el.querySelectorAll('input.block-editor__columns-width').length).toBe(2);

  const move = el.querySelector('select.block-editor__nested-move-column') as HTMLSelectElement;
  move.value = '1';
  move.dispatchEvent(new Event('change'));
  expect(latest.content.columns[0]!.blocks).toHaveLength(0);
  expect(latest.content.columns[1]!.blocks[0]?.id).toBe('h1');
});
```

- [ ] **Step 6: Commit**

```bash
git add src/blocks/layout-editors.ts src/styles/app.css tests/unit/builder-ux-columns.test.ts
git commit -m "feat: custom column widths and cross-column move in editor"
```

---

### Task 5: BUILD.md + verify

- [ ] Update `docs/BUILD.md`: History Builder UX; Next up → **Response space**; tick Columns UX; latest note.
- [ ] `npm run test:unit` and `npx tsc -p tsconfig.json --noEmit`
- [ ] Commit BUILD

```bash
git add docs/BUILD.md
git commit -m "docs: mark Builder UX columns shipped in BUILD roadmap"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| `custom` preset + sum 12 | 1 |
| move helper | 2 |
| Move-to select + draggable | 3 |
| Width inputs + drop panes | 4 |
| BUILD | 5 |

## Out of scope

SortableJS, resize handles, root↔column moves, mid-list drop insert
