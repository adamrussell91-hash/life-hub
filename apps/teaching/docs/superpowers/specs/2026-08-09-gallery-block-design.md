# Teaching Hub — Gallery Block Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Media block — `gallery` (multi-image set)  
**Depends on:** Existing leaf-block patterns (`image` URL/alt/caption; accordion-style item lists); layout nesting (section / columns / tabs)  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §17 Gallery; `docs/specs/05_DESIGN_SYSTEM.md` §82  
**Not this slice:** Drive / `media_id` library; Image→Gallery conversion; A4 print grid; crop / focal point

## Goal

Let teachers place a multi-image set in a lesson with three layouts (grid, carousel, comparison), a stacked URL-based editor, and a student view that includes a simple lightbox enlarge.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Accordion-parity leaf block — structured `items[]`, not nested `image` blocks |
| Layouts | `grid` \| `carousel` \| `comparison` (all three in v1) |
| Item fields | `url`, `alt_text`, optional `caption` (same spirit as `image`) |
| Create / limits | Create with **3** items, `layout: 'grid'`; grid/carousel **min 2**, **max 12**; comparison **exactly 2** |
| Layout switch → comparison | Keep first 2 items; drop extras (no confirm dialog) |
| Placement | Lesson root, `section`, `columns` cells, and `tabs` panels |
| Interaction | Click/tap image opens lightbox (enlarge only; no in-lightbox swipe) |
| Editor UX | Stacked items; layout select; no live student-layout preview |
| Publish | Every item: valid http(s) `url` + non-empty `alt_text`; caption optional; comparison length 2 |
| Variant | Media size (`large` default), same family as `image` |

## Out of scope

- Google Drive / media library / `media_id` references
- Nested `image` blocks inside gallery
- Converting single Image → Gallery
- Lightbox gallery swipe / next-prev through items
- Carousel autoplay
- Crop, focal point, credit fields
- A4 print-specific gallery layout
- Drag-and-drop item reorder (use explicit reorder controls)

## Data model

```ts
{
  block_type: 'gallery',
  variant: 'large',
  visibility: 'student_teacher' | 'teacher_only',
  content: {
    layout: 'grid' | 'carousel' | 'comparison',
    items: Array<{
      id: string;       // stable item id
      url: string;
      alt_text: string;
      caption?: string;
    }>
  }
}
```

### Count rules

| Layout | Allowed length |
|--------|----------------|
| `grid` | 2–12 |
| `carousel` | 2–12 |
| `comparison` | exactly 2 |

Schema enforces layout-aware length (comparison ≠ 2 fails validation). The editor normalizes immediately when switching to Comparison (keep first 2; drop extras)—no interim invalid comparison drafts.

### Nesting matrix

| Parent | Gallery allowed? |
|--------|------------------|
| lesson root | yes |
| `section` | yes |
| `columns` cell | yes |
| `tabs` panel | yes |

Gallery is a leaf: it has no nested `blocks`.

## Editor

- Add **Gallery** under the **Media** optgroup (with image / video / audio / attachment / embed)
- Block chrome: layout select (Grid / Carousel / Comparison), media size variant, visibility, Delete / Duplicate / up-down like other blocks
- Canvas: all items stacked — URL, alt text, optional caption
- Item chrome: add / remove / reorder
  - Grid / carousel: remove disabled at 2; add disabled at 12
  - Comparison: add hidden/disabled; remove disabled; always 2 slots
- Switching layout to Comparison: keep first 2 items; drop the rest
- Switching away from Comparison: keep both items; teacher may add up to 12
- No nested block editors; no live grid/carousel preview in the canvas

## Student render

### Grid
- Responsive CSS grid favouring visual comparison (tight gaps; ~2–3 columns desktop, 1–2 on phone)
- Caption under each image when present

### Carousel
- One primary slide visible; prev/next controls and dots for slide position
- Keyboard left/right when the carousel is focused
- Small client JS in the render path (same interaction spirit as tabs)

### Comparison
- Exactly two equal-width images side by side
- Stack to a single column on very narrow viewports if needed for readability

### Lightbox (all layouts)
- Click/tap an image opens an overlay with a larger image
- Accessible name from `alt_text`
- Close via Escape, backdrop click, and an explicit close control
- Light focus management (move focus into dialog / close control; restore on close)
- v1 shows only the clicked image (no next/prev inside the lightbox)

### Visibility
- `teacher_only` filtered like other leaf blocks

## Publish

- Each item: trimmed non-empty `url` that is valid http(s); trimmed non-empty `alt_text`
- Empty / omitted `caption` allowed
- `layout: 'comparison'` requires exactly 2 items
- `layout: 'grid' | 'carousel'` requires 2–12 items
- Schema rejects invalid layout enum and out-of-range counts

## Testing

- Schema: parse gallery; layout enum; grid/carousel 2–12; comparison exactly 2; allowed as section / columns / tabs child
- Editor: create with 3 + grid; add/remove within limits; switch to comparison keeps first 2
- Publish: missing/invalid URL or empty alt fails; comparison ≠2 fails; empty caption OK
- Render: grid markup; carousel controls change slide; comparison pair; lightbox open/close (Escape + backdrop)

## Success criteria

1. Teacher inserts Gallery, picks layout, edits items within rules  
2. Students see grid / carousel / comparison correctly  
3. Gallery works in root, section, columns, and tabs  
4. Lightbox enlarges a clicked image and closes cleanly  
5. Publish enforces URL + alt and layout-aware item counts  
