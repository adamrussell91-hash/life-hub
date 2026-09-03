# Teaching Hub — Phase A Layout Blocks Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Layout structure — `columns`, `section`, `spacer` (nested container model)  
**Depends on:** Existing block registry / lesson editor / recursive-ready render path  
**Parent roadmap:** Block system spec `docs/specs/03_BLOCK_SYSTEM.md` — Phase A of remaining primitives

## Goal

Let teachers place content side-by-side (½½, ⅓⅔, ⅔⅓, ⅓⅓⅓), group content under labelled sections, and insert vertical spacers — matching the layout chapter of the block system without columns-inside-columns.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Nested container blocks (Approach 1) |
| Column content | Nested `Block[]` per column |
| Presets | `50-50`, `33-67`, `67-33`, `33-33-33` → widths 6+6, 4+8, 8+4, 4+4+4 |
| Nested columns | **Forbidden** |
| Section | Labelled group with nested children (may include Columns) |
| Section inside column | **Forbidden** (sections wrap columns, not vice versa) |
| Spacer | `small` \| `medium` \| `large` |
| Mobile | Columns stack left→right as top→bottom below ~720px |
| Preset change | Remap column count; surplus column blocks append into last remaining column |

## Out of scope

- Columns inside columns  
- Section inside a column  
- Free-form 12-grid drag resize beyond presets  
- Tabs / timeline / gallery / other remaining primitives  
- Drag-and-drop between columns (v1: Add + reorder buttons only)

## Data model

### columns

```ts
{
  block_type: 'columns',
  variant: 'medium',
  content: {
    preset: '50-50' | '33-67' | '67-33' | '33-33-33',
    columns: Array<{
      width: number; // 12-grid units; must sum to 12
      blocks: Block[]
    }>
  }
}
```

### section

```ts
{
  block_type: 'section',
  variant: 'medium',
  content: {
    title: string,
    collapsed_in_editor?: boolean,
    blocks: Block[]
  }
}
```

### spacer

```ts
{
  block_type: 'spacer',
  variant: 'medium', // unused; size lives in content
  content: {
    size: 'small' | 'medium' | 'large'
  }
}
```

### Recursion

`BlockSchema` becomes recursive via `z.lazy()`. Validators enforce:

- No `columns` (or `section`) as a descendant of `columns`
- `section` may contain `columns`, `spacer`, and all leaf types

## Editor

- Add Block **Layout** optgroup: Section, Columns, Spacer  
- Columns editor: preset `<select>`; one pane per column with nested editors + “Add in column” (block types excluding `columns` and `section`)  
- Section editor: title; collapse toggle for editor chrome; “Add in section” (all types including Columns, excluding nesting Section inside Section in v1 — **sections may nest sections?** → **No**: section children exclude `section` to keep depth simple)  
- Spacer: size select + visual gap preview  
- Delete / Duplicate / up-down on containers; children reorder within parent only  
- Changing preset rebuilds column array: keep existing columns in order; if fewer columns, concatenate leftover `blocks` onto the last column; if more columns, append empty columns

**Section nesting clarification:** Section children may **not** include another `section` in v1 (same discipline as columns).

## Render

- `renderBlock` recursive  
- Columns → CSS grid `grid-template-columns` from widths; media query stacks  
- Section → `section` landmark + title heading + children  
- Spacer → vertical space via CSS size tokens  
- Student filter for `teacher_only` applied recursively  

## Publish

- Section title required (non-empty) on publish  
- Columns / spacer have no extra required fields beyond schema  
- Children validated with existing `publishBlockIssues` recursively  
- Empty columns allowed  
- Empty section body allowed (title still required)

## Testing

- Schema: presets, forbidden nesting rejected  
- Render: grid class / stacked class; section title; spacer class  
- Editor: add in column, preset remap preserves blocks  
- Existing lessons without containers still load  

## Success criteria

1. Teacher can insert Columns with all four presets and add blocks into each column  
2. Section groups blocks (including a Columns block) under a title  
3. Spacer inserts visible vertical gap  
4. Student view shows side-by-side columns on desktop and stacked on narrow  
5. No columns/section nesting violations slip through schema validation  
