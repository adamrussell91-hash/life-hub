# Teaching Hub — Student Published Nav Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Public student chrome — Back to unit + published unit page  
**Depends on:** First slice (publish → `/s/lessons/:id`) — shipped; builder blocks — shipped

## Goal

Let students leave a published lesson and land on a real unit page that lists that unit’s published lessons, using a public API that never touches drafts.

## Broader roadmap (context only)

1. Teacher rail + section shells — done  
2. Builder blocks (video, image, embed, HTML) — done  
3. **This slice** — published student nav  
4. Teacher home dashboard  

## Decisions

| Topic | Choice |
|-------|--------|
| Destinations this slice | Unit only (no Class homepage) |
| Unit destination | New public page `/s/units/:unitId` |
| Unit lesson list | Published lessons only |
| Lesson chrome | Header: brand + “Back to unit” link |
| Prev / Next lesson | Out of scope |
| Architecture | New public `GET /api/published/units/:unitId` + student unit view; reuse `unit_id` already on published lesson snapshots |
| Teaching Hub brand in header | Brand text only this slice (not a nav target) |

## Out of scope

- Class homepage / Class model links  
- Previous / next lesson within a unit  
- Student “home” or dashboard  
- Teacher rail, curriculum API, or editor changes  
- Showing unpublished lessons (even as locked)  
- Making the Teaching Hub brand a clickable home  

## Routes

| Path | Surface |
|------|---------|
| `/s/lessons/:lessonId` | Existing student lesson view + header **Back to unit** → `/s/units/{unit_id}` |
| `/s/units/:unitId` | New student unit view: unit title + published lesson list |

Router gains a `student-unit` match for `/s/units/:unitId`. Teacher routes unchanged.

## Public API

### `GET /api/published/units/:unitId`

- **Auth:** none (same posture as `GET /api/published/lessons/:id`)
- **404** if the unit blob is missing
- Load the unit record from content blobs (title, `lesson_ids`)
- List published lesson snapshots; keep entries whose `unit_id` matches
- Order lessons by the unit’s `lesson_ids` sequence when possible; otherwise stable title order
- **Never** read draft lesson keys

Response shape:

```ts
{
  unit_id: string;
  title: string;
  lessons: Array<{
    lesson_id: string;
    title: string;
  }>;
}
```

Mock-api implements the same route for local/dev parity.

## Student UI

### Lesson view (`/s/lessons/:id`)

- Keep existing `student-surface` header bar
- Left/brand: **Teaching Hub** (text only)
- Right (or trailing): link **Back to unit** → `/s/units/{unit_id}`
- `unit_id` comes from the published lesson snapshot already returned by the existing endpoint — no extra fetch required for the link href
- Link label is the fixed string “Back to unit” (unit title is shown on the unit page)

### Unit view (`/s/units/:id`)

- Same student surface chrome family
- Heading: unit `title`
- Body: list of published lessons; each row opens `/s/lessons/:lessonId`
- Empty list: “No published lessons in this unit yet.”
- Missing unit / API 404: “Unit not found.” (same calm tone as lesson not-found)

## Data & safety

- Published lesson snapshots already include `unit_id` — required for Back to unit without enriching publish payload
- Unit endpoint may read the **unit** curriculum blob (metadata only) plus **published** lesson snapshots
- Draft lesson content, teacher-only blocks, and unpublished titles must not appear in the unit response
- No session cookie required; CORS/public headers follow the existing published-lesson function pattern

## Implementation touchpoints

| Area | Change |
|------|--------|
| `src/app/router.ts` | Match `/s/units/:unitId` → `student-unit` |
| `src/app/main.ts` | Mount unit view on that route |
| `src/student/lesson-view.ts` | Header Back to unit from snapshot `unit_id` |
| `src/student/unit-view.ts` | New: fetch + render published unit |
| `src/schemas/` | Zod schema for published-unit response |
| `netlify/functions/` | New published-unit handler |
| `scripts/mock-api.ts` | Same public route |
| `src/styles/app.css` | Light styles for header link + unit list |

## Testing

- Router: `/s/units/:id` matches `student-unit`
- Lesson view: Back to unit href is `/s/units/{unit_id}` when snapshot loads
- Unit view: empty state, list rows, not-found
- API (Netlify + mock): 404 missing unit; only published lessons; order follows `lesson_ids` when present; drafts never included
- Integration: publish → open student lesson → Back to unit → lesson appears in list
- Playwright: only if an existing browser flow breaks or a thin happy-path is cheap; not required to block the slice

## Success criteria

- From a published lesson, student can reach the unit page in one click
- Unit page lists only published lessons for that unit, in curriculum order when available
- No draft leakage via the new endpoint
- Existing publish → student lesson flow remains green

## Follow-ups (not this slice)

- Class homepage links once Class models exist  
- Prev / Next among published neighbours  
- Clickable student home / hub landing  
- Teacher home dashboard (roadmap item 4)  
