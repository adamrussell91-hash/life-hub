# Teaching Hub — Class Homepage Editor + Student Class Page Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Editable Class homepage regions (all lesson block types) + student read-only Class page  
**Depends on:** Classes browse, schedule unit tools, existing block schemas/renderers

## Goal

Replace Class page “Coming next” placeholders with **editable homepage regions** (Announcements, Resources, Custom), persisted on the Class record, and ship a **student Class page** that shows generated sections plus those blocks. No student prev/next in this slice.

## Broader roadmap (context only)

1. Classes browse + schedule tools — done  
2. **This slice** — Class homepage editor + student Class page  
3. Student prev/next from schedule  
4. Scope & Sequence · Resource Library  

## Decisions

| Topic | Choice |
|-------|--------|
| Audiences | Teacher edit **and** student read-only Class page |
| Edit UX | Whole-page **Edit homepage** mode; single Save |
| Regions | Three: announcements, resources, custom |
| Block types | All current lesson blocks (rich_text, heading, callout, image, video, embed, html) |
| Storage | On Class: `homepage: { announcements, resources, custom }` |
| Student route | `/s/classes/:classId` |
| Prev/next | Out of scope |
| Publish gate | None — Save is live for students |

## Out of scope

- Student prev/next from `schedule_order`  
- Separate draft/publish for homepage  
- Teacher-only / visibility flags on homepage blocks  
- Drag-and-drop reorder (up/down buttons OK)  
- Create/edit/delete Class entity itself  
- Scope & Sequence; Resource Library  

## Data model

### Class.homepage

```ts
homepage?: {
  announcements: Block[];
  resources: Block[];
  custom: Block[];
}
```

- Optional; treat missing as three empty arrays.  
- Blocks use existing `BlockSchema` (all `block_type`s).  
- Seed: leave unset or empty arrays on `class_2026_12engadv1`.

### Validation

On PATCH, parse each region array with the same block validation/sanitization used for lesson drafts (reuse helpers where they exist). Reject invalid blocks with 400.

## APIs

### Teacher — extend `PATCH /api/classes/:id`

Body may include:

```ts
{
  homepage?: {
    announcements: Block[];
    resources: Block[];
    custom: Block[];
  };
  // existing: meeting_days?, current_scheduled_lesson_id?
}
```

- **Full replace** of `homepage` when provided (not deep-merge per block).  
- Auth required.  
- Return updated Class.  
- Curriculum GET already returns Class objects — include `homepage` for teachers.

### Student — `GET /api/published/classes/:classId`

No auth. Soft DTO:

```ts
{
  id: string;
  code: string;
  title: string;
  display_name?: string;
  homepage: {
    announcements: Block[];
    resources: Block[];
    custom: Block[];
  };
  current_unit?: { id: string; title: string };
  current_lesson?: { id: string; title: string; lesson_id: string };
  schedule: Array<{
    id: string;
    date: string;
    schedule_order: number;
    lesson_id: string;
    title: string;
  }>;
  active_units: Array<{ id: string; title: string }>;
}
```

- Resolve titles from unit/lesson blobs.  
- Schedule ordered by `schedule_order`.  
- Unknown / archived / trashed class → 404.  
- Mock-api + Netlify.

## Teacher UI

### View mode (default)

Hybrid Class page as today (generated sections + schedule tools). Manual regions render blocks (or empty copy). Controls:

- **Edit homepage**  
- Optional **View as student** → `/s/classes/:classId`

### Edit mode

- All three regions show block lists with Add (type picker for all block types), Up/Down, Delete, and existing block editors.  
- Generated sections remain visible but not block-editable.  
- **Save homepage** → PATCH → refetch curriculum → exit edit mode.  
- **Cancel** → discard local state → exit edit mode.  
- On save error: stay in edit mode; banner; keep local edits.

Reuse lesson block renderers/editors; do not rebuild the full lesson chrome.

## Student UI

Route: `/s/classes/:classId` (public, like student unit/lesson).

Render:

1. Header (code, title)  
2. Current unit / current lesson (if present)  
3. Schedule list (from DTO; Open → `/s/lessons/:lessonId` if published lesson exists — if lesson not published, omit Open or link only when available)  
4. Active units  
5. Announcements / Resources / Custom — render blocks; omit heading if region empty  

No edit controls. Not found → “Class not found.”

**Published lesson Open rule:** Prefer linking only when a published lesson blob exists for `lesson_id`; otherwise show title without Open (avoid 404 student lesson views).

## Errors

| Case | Behavior |
|------|----------|
| PATCH validation | 400; teacher banner; stay in edit mode |
| PATCH network | Teacher banner; stay in edit mode |
| Student unknown class | 404 page copy |
| Empty regions | Teacher: empty state in edit; Student: omit section |

## Testing

- Schema: homepage with mixed block types; invalid block rejected  
- PATCH homepage persists; GET published class DTO shape  
- Teacher: Edit → add block → Save; Cancel restores  
- Student route renders blocks + schedule; 404 unknown  
- Regression: schedule unit tools, Home, publish/student lesson/unit  

## Success criteria

- Teacher can edit all three homepage regions with the full block set and save to the Class.  
- Student can open `/s/classes/:id` and see generated schedule/unit context plus those blocks.  
- No prev/next or separate homepage publish flow.

## Follow-ups

- Student prev/next from schedule  
- Homepage draft/publish if needed  
- Visibility flags on homepage blocks  
- Drag-and-drop  
