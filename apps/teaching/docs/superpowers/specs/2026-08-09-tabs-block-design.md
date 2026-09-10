# Teaching Hub — Tabs Block Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Structure block — `tabs` (labelled panels of nested content)  
**Depends on:** Layout Phase A recursive block model (`columns` / `section` / `spacer`)  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §13 Tabs

## Goal

Let teachers organise closely related content into labelled tab panels that each hold nested blocks (including columns), with a tabbed student view and a stacked all-panels editor.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Nested container (mirror columns/section), not accordion-style strings |
| Panel content | Nested `Block[]` per tab |
| Tab children | Allow `columns` + leaf types; **forbid** nested `tabs` and `section` |
| Tabs placement | Lesson root + inside **section**; **not** inside a column |
| Column children | Unchanged plus forbid `tabs` (no columns / section / tabs) |
| Editor UX | All panels stacked/expanded; student view remains tabbed |
| Create / limits | Create with **3** panels; **min 2**, **max 8** |
| Publish | Every tab **label** required (trimmed non-empty); empty panel bodies OK |
| Student default | First tab selected; client-only switch; no URL/hash sync in v1 |
| Print | Spec says sequential sections when print exists; **no print work in this slice** |

## Out of scope

- Accordion → nested-blocks upgrade  
- URL / hash deep-link to a tab  
- A4 print renderer  
- Drag-and-drop between panels  
- Tabs inside columns  
- Nested tabs or section-inside-tab  

## Data model

```ts
{
  block_type: 'tabs',
  variant: 'medium',
  visibility: 'student_teacher' | 'teacher_only',
  content: {
    tabs: Array<{
      id: string;       // stable panel id
      label: string;
      blocks: Block[];  // nested children
    }>  // length 2–8
  }
}
```

### Nesting matrix

| Parent | Allowed children (relevant) |
|--------|-----------------------------|
| `tabs` panel | leaf types + `columns` + `spacer`; **not** `tabs`, **not** `section` |
| `section` | previous rules + **`tabs`** |
| `columns` cell | previous rules + **not** `tabs` |
| lesson root | all types including `tabs` |

Schema enforces panel count 2–8 and forbidden nesting via child schemas / refinements (same discipline as Phase A).

## Editor

- Add **Tabs** under **Layout** optgroup  
- Canvas: all panels stacked — label input, nested block list (“Add in tab”), reorder/delete/duplicate children within panel  
- Panel chrome: add / remove / reorder panels (remove disabled at 2; add disabled at 8)  
- Container Delete / Duplicate / up-down like other blocks  
- Recursive nested editors with nested `getLatest` (same pattern as columns/section)

## Student render

- `role="tablist"` / `tab` / `tabpanel`; first tab selected by default  
- Arrow keys move between tabs  
- One panel visible at a time  
- Narrow screens: keep tab chrome (horizontal scroll if needed); do not auto-convert to accordion  
- `teacher_only` filtered recursively  

## Publish

- Every tab label trimmed non-empty  
- Empty `blocks` arrays allowed  
- Recursive `publishBlockIssues` on children (columns inside a tab included)  
- Schema rejects forbidden nesting and count outside 2–8  

## Testing

- Schema: parse tabs; reject nested tabs/section in panel; reject tabs in columns; enforce 2–8  
- Editor: create with 3; add/remove within limits; add block (incl. columns) inside a tab  
- Render: switching tabs shows matching panel; recursive student visibility  
- Publish: blank label fails; empty panel OK  

## Success criteria

1. Teacher inserts Tabs, edits labels, adds nested content (including columns) in a panel  
2. Student sees tabbed UI and can switch panels  
3. Tabs work inside a section; cannot be placed in a column  
4. Forbidden nesting fails schema validation  
