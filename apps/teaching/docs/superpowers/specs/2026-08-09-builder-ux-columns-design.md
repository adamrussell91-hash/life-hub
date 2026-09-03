# Teaching Hub — Builder UX (Columns) Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Columns editor UX — cross-column move (DnD + Move-to) and free-form 12-grid widths  
**Depends on:** Layout Phase A (`columns` nested model, presets, nested editors)  
**Parent roadmap:** `docs/BUILD.md` Next up #1; Phase A deferred items  
**Not this slice:** SortableJS; drag resize handles; root↔column moves; columns-in-columns; student layout changes

## Goal

Let teachers rearrange nested blocks **between** columns in a columns block, and set **custom** column widths on the 12-grid, without replacing presets or adding a DnD library.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Cross-column move **and** free-form widths |
| Move UX | HTML5 DnD **plus** “Move to column…” select (accessible fallback) |
| Drop behaviour v1 | Append to target column (no mid-list insert required) |
| Width UX | Number inputs when preset is `custom`; named presets unchanged |
| Library | None — native DnD + existing nested editor |
| Surface | Inside a single `columns` block editor only |

## Out of scope

- SortableJS / other DnD libraries  
- Drag-resize handles between columns  
- Moving blocks between different `columns` blocks, or between column and lesson root / section / tabs  
- Columns inside columns; section-inside-column (already forbidden)  
- Student render changes beyond consuming existing `width` values  
- Full lesson-builder canvas DnD  

## Data model

```ts
content: {
  preset: '50-50' | '33-67' | '67-33' | '33-33-33' | 'custom';
  columns: Array<{
    width: number; // 1–11 integer; all columns sum to 12
    blocks: Block[];
  }>;
}
```

### Preset behaviour

| Action | Result |
|--------|--------|
| Create columns | Default `50-50` as today |
| Choose named preset | `remapColumnsPreset` — same column count/width remap rules as Phase A; `preset` = that name |
| Choose **Custom** | Keep current column count and blocks; set `preset: 'custom'`; show width number inputs |
| Edit width (Custom only) | Update that column’s `width`; validate sum === 12 before apply (or clamp/reject invalid) |
| Leave Custom → named preset | Remap via `remapColumnsPreset` as today |

Width inputs are **disabled / hidden** unless `preset === 'custom'`.

### Schema

- Extend `ColumnPresetSchema` with `'custom'`.
- Keep existing refine: column widths sum to 12.
- For named presets, widths should still match the preset map after load/edit (editor enforces via remap). Custom allows any positive widths that sum to 12 (min 1 per column, max 11).

## Editor

### Columns chrome (`createColumnsEditor`)

1. Preset `<select>` includes **Custom** after the four named presets.  
2. When `preset === 'custom'`, render one number input per column (`min=1`, `max=11`, labelled “Column N width”) above or beside the pane label.  
3. On width input change: if new widths sum to 12, emit updated columns; otherwise show a short hint (“Widths must sum to 12”) and do not emit invalid state (keep last valid).  
4. Pane grid `grid-template-columns` continues to use `width` fr units.

### Nested list (`createNestedBlocksEditor`)

Optional context when used from columns:

```ts
columnMove?: {
  columnCount: number;
  columnIndex: number;
  onMoveToColumn: (toColumnIndex: number) => void;
};
```

When `columnMove` is set:

- Each row: **Move to column…** `<select>` with options for every column **except** current (labels “Column 1”, …). On change → `onMoveToColumn(toIndex)` then reset select.  
- Row is `draggable="true"`; `dragstart` stores `fromColumn` + `fromIndex` (or block id).  
- Column pane is a drop target (`dragover` preventDefault; `drop` → move to that column, append).  
- ↑ ↓ Duplicate Delete unchanged (still within-column).

When `columnMove` is omitted (section / tabs nested lists): no Move select, no drag.

### Move helper

Pure function in e.g. `src/blocks/column-move.ts`:

```ts
moveBlockBetweenColumns(
  columns: ColumnSlot[],
  fromCol: number,
  fromIndex: number,
  toCol: number,
  toIndex?: number // default: append
): ColumnSlot[]
```

- Removes block from `fromCol`/`fromIndex`.  
- Inserts at `toIndex` or end of `toCol`.  
- Same column + reorder: support if `toIndex` provided; Move-to UI always uses another column.  
- Invalid indices → return original (or no-op).

`createColumnsEditor` implements `onMoveToColumn` by calling this helper and `onChange`.

## Student / teacher render

No change required: `renderColumnsBlock` already sets `gridTemplateColumns` from `col.width`. Custom widths appear automatically after publish.

## Publish / visibility

- No new publish rules beyond schema (sum 12 already enforced).  
- Empty columns still allowed.

## Testing

- Schema accepts `custom`; rejects width sum ≠ 12.  
- `remapColumnsPreset` still works from custom → named (treat custom columns as input slots).  
- `moveBlockBetweenColumns` unit cases: cross-column append; invalid no-op.  
- Editor smoke: Custom shows width inputs; Move to column moves block; DnD optional smoke if happy-dom supports it (otherwise helper + Move select coverage is enough).

## BUILD.md updates (end of slice)

- History: Builder UX (columns move + custom widths).  
- Next up #1 → **Response space** (if still distinct from `question_set`); otherwise first remaining media item (Map / Slides / Document viewer).  
- Projection: tick “Columns UX: drag between columns; non-preset widths”.  
- Latest note: Builder UX shipped; Response space (or next unchecked) next.

## Approach rejected (record)

- Dedicated columns board rewrite — duplicates nested editor.  
- SortableJS — unnecessary dependency for append-only DnD.  
- Width-only or move-only slices — user chose both in one slice.
