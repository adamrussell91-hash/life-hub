# Teaching Hub — Collection Block Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Structure block — `collection` (query-driven lesson link lists on class homepage)  
**Depends on:** Class homepage regions; published class DTO + schedule; unit `lesson_ids` / published unit lesson list  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §49; `docs/specs/09_IMPLEMENTATION_PLAN.md` Phase 5E / Phase 6 Collection; AT BLOCK 009  
**Not this slice:** Lesson/unit page placement; tags/resources sources; editable “recent” count; snapshot/copied link lists; async `renderBlock`

## Goal

Ship a thin Navigation Collection leaf that stores a **query** (not copied links), resolves to lesson links when a class homepage mounts, and updates automatically when the unit or schedule changes — without teacher-maintained link lists.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Two sources: `unit_lessons` + `recent_lessons` |
| Placement | **Class homepage regions only** (announcements / resources / custom) |
| Unit filter | Always the class’s `current_unit_id` — no unit picker, no `unit_id` in content |
| Recent | Fixed last **5** schedule rows by `schedule_order` (constant in code; not editable in v1) |
| Resolution | Class page mounter resolves → presentational list renderer (keep `renderBlock` sync) |
| Student recent | Published schedule rows only |
| Teacher preview recent | All scheduled rows (published + unpublished) |
| Publish | Query always publishable; missing context → empty UI, not a publish error |
| Title | Optional `content.title` heading above the list |
| Approach | One primitive `collection`; source is a content enum (not separate block types) |

## Out of scope

- Placement inside lesson builder, unit pages, columns, tabs, or section nesting beyond homepage flat regions
- Sources: resources, tags, “lessons tagged X”, extension materials
- Editable N for recent; teacher-picked unit id / “current” toggle
- Baking/snapshotting resolved links into block JSON at save time
- Changing `renderBlock` to async or requiring page context on every block
- Drag-and-drop; custom link chrome beyond existing class/unit list patterns
- A4 print-specific collection layout

## Data model

```ts
{
  block_type: 'collection',
  variant: 'medium',
  visibility: 'student_teacher' | 'teacher_only',
  content: {
    source: 'unit_lessons' | 'recent_lessons';
    title?: string;
  }
}
```

- Create default: `source: 'unit_lessons'`, empty title.
- No nested ids to remap on clone (leaf with flat content).
- Constant: `RECENT_LESSONS_LIMIT = 5` in resolve helper (not stored on the block).

### Nesting / placement matrix

| Surface | Collection allowed? |
|---------|---------------------|
| Class homepage region | **yes** |
| Lesson root / section / columns / tabs | **no** (v1) |
| Unit page blocks | **no** (unit hybrid editing not in this slice) |

Collection is a leaf: no nested `blocks`. Homepage regions remain flat `Block[]` (no nested layout required for v1).

### Builder menus

- Add under **Layout** (with `section`, `columns`, `spacer`, `tabs`).
- Include in `HOMEPAGE_BLOCK_GROUPS`.
- **Exclude** from the lesson builder Add Block menu (homepage-only placement).

## Resolution

Pure helpers in `src/blocks/collection-resolve.ts` (testable without DOM):

```ts
type CollectionLink = { lesson_id: string; title: string; href: string };

resolveUnitLessons(input): CollectionLink[]
resolveRecentLessons(input, { limit: 5, publishedOnly: boolean }): CollectionLink[]
```

**`unit_lessons`**

1. Read `class.current_unit_id` (or published `current_unit.id`).
2. If missing → `[]` and empty-state copy (“No current unit”).
3. Load that unit’s lessons in unit order (`unit.lesson_ids` / published unit lessons).
4. Student: published lessons only (from extended `current_unit.lessons`). Teacher homepage editor preview: all lessons in the unit’s `lesson_ids` order from curriculum (draft titles fine).

**`recent_lessons`**

1. Sort schedule by `schedule_order` descending (most recent / latest in sequence first).
2. Take up to 5.
3. Student: `published === true` only. Teacher: all rows.
4. Empty schedule → empty-state copy.

**Data path for unit lessons on student class page:** extend published class so `current_unit` includes ordered `lessons: Array<{ id: string; title: string }>` (published only). Avoids a second fetch when multiple Collection blocks appear. Teacher homepage editor resolves from in-memory curriculum / class state already loaded for the editor.

**Mount wiring:** `class-view` (student) and homepage editor/preview (teacher) walk homepage blocks; for `collection`, call resolve helpers with class context, then pass links into the presentational renderer. Other block types keep calling `renderBlock` unchanged.

## Editor

- Fields: source select (`Unit lessons` / `Recent lessons`); optional title input.
- Live preview: resolve against the class being edited; show the same list chrome as student (or a compact preview list).
- Block chrome: visibility, Delete / Duplicate / reorder like other homepage blocks.
- No unit picker; no N control; no manual link add/remove.

## Student / teacher render

- Outer `.block.block-collection` with optional title.
- Ordered list of lesson links (reuse existing student class/unit link patterns / classes where practical).
- Href: `/s/lessons/:lessonId` for student and for teacher homepage preview links (same as student unit lesson list). Teacher “Open” schedule buttons elsewhere may keep their own routes; Collection does not invent a second URL scheme.
- Empty states (non-fatal):
  - `unit_lessons` + no current unit
  - `unit_lessons` + current unit but no lessons
  - `recent_lessons` + no matching schedule rows

## Publish / visibility

- No content completeness checks beyond schema (`source` required).
- `teacher_only` collections omit from student homepage the same way other blocks do.
- Missing/empty resolution never fails publish.

## Security / consistency

- Links only to known lesson ids from unit/schedule data (no free-form URLs in v1).
- Titles come from curriculum/published DTOs (escape as text in DOM, same as other lists).

## Testing (acceptance)

1. Schema accepts `unit_lessons` / `recent_lessons`; rejects unknown source.
2. `createBlock('collection')` defaults; clone works; Layout + homepage menus include it; lesson Add Block excludes it.
3. `resolveUnitLessons`: ordered by unit; empty without current unit; student published-only behaviour covered by helper or mount tests.
4. `resolveRecentLessons`: max 5; `publishedOnly` filters; order by schedule.
5. AT BLOCK 009 spirit: add lesson to current unit → remount/resolve shows new link without editing the Collection block.
6. Registry + render smoke with injected links; empty state smoke.
7. `docs/BUILD.md`: Collection → History; Next up → `html_app` (Builder UX after); projection tick.

## File map (expected)

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `CollectionBlockSchema`; unions / leaf list |
| `src/blocks/create-block.ts` | defaults, Layout group, homepage vs lesson menus |
| `src/blocks/collection-resolve.ts` | Resolve helpers + `RECENT_LESSONS_LIMIT` |
| `src/blocks/render.ts` | Presentational collection list (+ dispatch) |
| `src/blocks/editors.ts` | Source + title + preview |
| `src/blocks/registry.ts` | Register |
| `src/schedule/build-published-class.ts` + student types | `current_unit.lessons` on published class |
| `src/student/class-view.ts` | Resolve then render collections |
| `src/teacher/sections/homepage-editor.ts` | Resolve for preview; ensure Add Block offers collection |
| `src/styles/app.css` | Minimal collection list chrome if needed |
| `tests/unit/collection-block.test.ts` | Schema, resolve, menu, render smoke |
| `docs/BUILD.md` | History / Next up / projection |

## Wiring checklist

schema → create-block (Layout + homepage-only) → resolve helpers → extend published class unit lessons → class-view + homepage mount → registry → render → editors → unit tests → `docs/BUILD.md`
