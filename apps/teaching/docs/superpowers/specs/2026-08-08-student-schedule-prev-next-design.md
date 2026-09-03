# Teaching Hub — Student Schedule Prev/Next Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Class-scoped student lesson route with schedule Prev/Next  
**Depends on:** Student Class page + published class DTO (homepage slice); existing published lesson view

## Goal

When a student opens a lesson from a Class schedule, they get a **class-scoped** lesson URL with **footer Prev/Next** along that class’s **published** schedule, plus **Back to class** and **Back to unit**. Bare `/s/lessons/:lessonId` stays unchanged (no schedule nav).

## Broader roadmap (context only)

1. Classes browse + schedule tools — done  
2. Class homepage editor + student Class page — done  
3. **This slice** — Student prev/next from schedule  
4. Scope & Sequence · Resource Library  

## Decisions

| Topic | Choice |
|-------|--------|
| Class context | Nested route `/s/classes/:classId/lessons/:lessonId` |
| Bare `/s/lessons/:lessonId` | Keep — no Prev/Next; Back to unit only |
| Neighbor chain | **Published** scheduled lessons only (`published === true`) |
| Back links | Both: Back to class (primary) + Back to unit |
| Prev/Next placement | Footer under lesson content |
| Architecture | Class-scoped lesson view; neighbors from published-class schedule via client helper; no new API |
| Missing end | Omit that control (no disabled buttons) |

## Out of scope

- Prev/Next on bare `/s/lessons/:id` or unit-ordered navigation  
- New public API for neighbors  
- Teacher lesson chrome changes  
- Scope & Sequence; Resource Library  
- Marking lessons “viewed” / progress  

## Routes

| Path | Behavior |
|------|----------|
| `/s/classes/:classId/lessons/:lessonId` | Class-scoped student lesson: content + footer Prev/Next + Back to class + Back to unit |
| `/s/lessons/:lessonId` | Unchanged: published lesson + Back to unit only |
| `/s/classes/:classId` | Student Class page: **Open** links use class-scoped lesson URL when published |

Router gains `student-class-lesson` with params `{ classId, lessonId }`, `requiresAuth: false`.

Teacher routes unchanged.

## Neighbor resolution

Pure helper (e.g. `scheduleNeighbors`):

```ts
function scheduleNeighbors(
  schedule: Array<{ lesson_id: string; published: boolean; schedule_order: number; title: string }>,
  lessonId: string
): { prev?: { lesson_id: string; title: string }; next?: { lesson_id: string; title: string } }
```

1. Take schedule ordered by `schedule_order` (as returned by published class DTO).  
2. Filter to rows with `published === true`.  
3. Find index of `lessonId`.  
4. Return adjacent published neighbors (or omit if none).

Reuse existing `GET /api/published/classes/:classId` (includes `published` on schedule rows) and `GET /api/published/lessons/:lessonId` for content. No new endpoints.

## Access / 404 rules (class-scoped route)

Treat as not found (same student copy posture as today) when:

- Class missing / not loadable via published class API  
- Lesson missing / unpublished via published lesson API  
- Lesson not on this class’s schedule, **or** schedule row exists but `published === false`

Do not render draft content for “on schedule but unpublished.”

## Student UI

### Class-scoped lesson (`/s/classes/:classId/lessons/:lessonId`)

1. Load published class + published lesson (parallel OK).  
2. Validate lesson is on class schedule and published (above).  
3. **Header (left → right):** brand, then **Back to class** → `/s/classes/:classId`, then **Back to unit** → `/s/units/{unit_id}` from the published lesson.  
4. **Body:** existing lesson title + student blocks (same as bare lesson view).  
5. **Footer:** Prev / Next (omit missing end). Control label: neighbor **title** when the viewport is wide enough; otherwise “Previous” / “Next”. Links use the app router (`navigate`) to `/s/classes/:classId/lessons/:neighborLessonId` (not a full document navigation).

### Bare lesson (`/s/lessons/:lessonId`)

Unchanged: no class fetch, no footer schedule nav, Back to unit only.

### Student Class page Open

When `row.published` (and current lesson Open when published), href becomes:

`/s/classes/${classId}/lessons/${lesson_id}`

instead of `/s/lessons/...`.

Unit page lesson links may stay bare `/s/lessons/:id` (no class context) — out of scope to change unless trivially shared.

## Architecture notes

- Prefer extending / parameterizing `mountStudentLessonView` (optional `classId`) over a fully separate mount, as long as bare route behavior stays identical.  
- Client-side neighbor helper keeps API surface small; published class DTO already has what we need.  
- Deep-link to class-scoped URL without going through Class page still works if validation passes.

## Errors

| Case | Behavior |
|------|----------|
| Class or lesson API 404 / network | Status message as today (“… not found” / unable to load) |
| Lesson not on class schedule / unpublished on schedule | Treat as not found |
| First / last published in chain | Omit Prev or Next |
| Bare lesson URL | No schedule nav |

## Testing

- Helper: published-only chain; skip unpublished mid-list; first/last omit ends; unknown `lessonId` → no neighbors  
- Router: match `student-class-lesson`; bare lesson still matches  
- Class page Open → class-scoped href when published  
- Class-scoped mount: footer neighbors; header both backs; 404 when lesson not on schedule  
- Regression: bare `/s/lessons/:id`, unit page, student class homepage, publish flow  

## Success criteria

- Open from class → class-scoped URL → footer Prev/Next walks published schedule only.  
- Back to class and Back to unit both work.  
- Bare `/s/lessons/:id` unchanged (no Prev/Next).  
- No new public API required.

## Follow-ups

- Scope & Sequence (stub)  
- Resource Library (stub)  
- Ops: push origin; re-seed; wall-clock today; multi-class seed  

