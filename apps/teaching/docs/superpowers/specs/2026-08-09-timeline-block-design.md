# Teaching Hub — Timeline Block Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Content block — `timeline` (in-lesson chronology)  
**Depends on:** Existing leaf-block patterns (`accordion`, image/link URL safety); section nesting rules from Layout Phase A  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §14 Timeline  
**Not this slice:** Scope & Sequence annual timeline (`docs/superpowers/specs/2026-08-08-scope-sequence-timeline-design.md`)

## Goal

Let teachers place an ordered chronology of events inside a lesson (dates/stages with labels and optional media/links), with a stacked editor and a student view that is vertical on narrow screens and horizontal on wide screens.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Accordion-parity leaf block — structured `events[]`, not nested `Block[]` |
| Event fields | Free-text `when`, `label`, `description`; optional image URL + alt; optional link URL + label |
| Chronology / sort | Manual event order only; no structured date; no auto-sort in v1 |
| Create / limits | Create with **3** events; **min 1**, **max 12** |
| Placement | Lesson root + inside **section**; **not** inside columns or tabs panels |
| Layout | One DOM (`ol`/`li`); CSS vertical default → horizontal from ~48rem+; overflow-x auto if needed |
| Editor UX | All events stacked/expanded; add / remove / reorder; no live horizontal preview |
| Publish | Every event **label** + **when** required; description may be empty; image/link rules below |
| Print / current marker | No print work; no “current position” marker; no URL deep-link |

## Out of scope

- Structured / ISO `sort_date` (add later if auto-sort is needed)
- Nested blocks per event
- Timeline inside columns or tabs
- JS layout switch, scroll-snap, focus/current markers
- A4 print sequential layout
- Coupling to Scope & Sequence timeline
- Drag-and-drop event reorder (use explicit reorder controls)

## Data model

```ts
{
  block_type: 'timeline',
  variant: 'medium',
  visibility: 'student_teacher' | 'teacher_only',
  content: {
    events: Array<{
      id: string;            // stable event id
      when: string;          // free-text chronology (“1788”, “Week 3”)
      label: string;
      description: string;   // plain text; may be empty in draft
      image_url?: string;
      image_alt?: string;
      link_url?: string;
      link_label?: string;
    }>  // length 1–12
  }
}
```

### Nesting matrix

| Parent | Timeline allowed? |
|--------|-------------------|
| lesson root | yes |
| `section` | yes |
| `columns` cell | **no** |
| `tabs` panel | **no** |

Timeline is a leaf: it has no nested `blocks`. Schema / child-type lists forbid placing `timeline` in columns or tabs (same discipline as forbidding `tabs` in columns).

## Editor

- Add **Timeline** under the **Teaching** optgroup (with accordion / table / question_set)
- Canvas: all events stacked — inputs for `when`, label, description (textarea), optional image URL + alt, optional link URL + label
- Event chrome: add / remove / reorder (remove disabled at 1; add disabled at 12)
- Block-level Delete / Duplicate / up-down like other blocks
- No nested block editors

## Student render

- Semantic ordered list of events
- Vertical (default): left rail + markers; `when` → label → description → optional image → optional link
- Wide (~48rem+): horizontal row along a rail; horizontal scroll if content overflows — CSS only, no JS layout mode
- Image uses `image_alt`; link opens in a new tab with `rel="noopener noreferrer"`; empty `link_label` displays as “Open link”
- `teacher_only` filtered like other leaf blocks

## Publish

- Each event: trimmed non-empty `label` and `when`
- Empty `description` allowed
- If `image_url` present: must be valid http(s); `image_alt` trimmed non-empty
- If `link_url` present: must be valid http(s)
- Schema rejects event count outside 1–12 and timeline nested in columns/tabs

## Testing

- Schema: parse timeline; enforce 1–12; reject as column/tab child
- Editor: create with 3; add/remove within limits; reorder
- Publish: missing label or `when` fails; image without alt / bad URL fails; empty description OK
- Render: vertical list markup; horizontal styles apply at wide breakpoint (smoke); image/link when set

## Success criteria

1. Teacher inserts Timeline, edits events, reorders within 1–12  
2. Student sees chronology (vertical on narrow, horizontal on wide)  
3. Timeline works inside a section; cannot be placed in a column or tabs panel  
4. Publish enforces label + `when` and media/link URL rules  
