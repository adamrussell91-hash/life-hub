# Teaching Hub — Schedule Unit & Schedule Editing Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Schedule a Unit onto a Class + basic schedule editing (date, reorder, set current)  
**Depends on:** Classes & Scheduled Lessons browse — shipped

## Goal

Let teachers **schedule a Unit onto a Class** using a meeting pattern and start date, and **edit the Class schedule** (change date, reorder, set current lesson) with durable API writes. Builds on the existing Class hybrid page and curriculum `classes` / `scheduled_lessons` payload.

## Broader roadmap (context only)

1. Classes + Scheduled Lessons browse — done  
2. **This slice** — Schedule unit + basic schedule edits  
3. Class homepage block editor  
4. Student Class page + prev/next from schedule  
5. Scope & Sequence · Resource Library  

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Unit scheduling **and** basic schedule editing |
| Date placement | Start date + **meeting pattern** (weekdays the class meets) |
| Meeting pattern storage | On Class (`meeting_days`); editable in wizard before generate |
| Entry point | Primary control on **Class page** |
| Existing schedule | **Append** (continue after existing rows) |
| Persistence | Full write path — mock API + Netlify |
| UI shape | Multi-step **modal** on Class page; inline row actions on schedule list |
| Edit actions | Change date, reorder (up/down), set current — only |

## Out of scope

- Mark delivered / skipped / planned workflows  
- Remove scheduled lesson; schedule a single lesson without unit flow  
- Calendar view; drag-and-drop reorder  
- Student Class page / prev-next  
- Class homepage announcements/resources editor  
- Create / edit / delete Class  
- Class-specific lesson overrides  
- Wall-clock “today” (keep `schedule_anchor_date`)  

## Data model

### Class — add `meeting_days`

```ts
meeting_days?: number[]; // ISO weekday: 1=Mon … 5=Fri (v1: weekdays only)
```

- Optional on schema; default in UI to `[1,2,3,4,5]` when unset.  
- Seed: set explicitly on `class_2026_12engadv1` (e.g. `[1,2,3,4,5]` to match current daily seed, or `[1,3,5]` if we want a clearer pattern demo — prefer **`[1,2,3,4,5]`** so existing Aug 10–14 seed stays coherent).

### Scheduled Lesson

Unchanged shape. New rows: `delivery_status: 'planned'`.  
`schedule_order` continues after the class’s current max.

### Pure helper

```ts
generateScheduleDates({
  startDate: string;      // YYYY-MM-DD
  meetingDays: number[];  // 1–5
  lessonCount: number;
}): string[]
```

Walk forward from `startDate` (inclusive if that day is a meeting day). Keep only dates whose UTC weekday is in `meetingDays`. Return exactly `lessonCount` dates. Reject empty `meetingDays` at API validation.

Shared by server (authoritative) and unit-tested in isolation. Client may use the same helper for preview only; **server regenerates on confirm** so preview and commit stay consistent if the client helper is skipped.

## APIs

All require teacher auth. Mock + Netlify. Prefer **refetch `GET /api/curriculum`** after success.

### `POST /api/classes/:classId/schedule-unit`

**Body:**
```ts
{
  unit_id: string;
  start_date: string;       // YYYY-MM-DD
  meeting_days?: number[];  // if provided, persist on Class before generate
}
```

**Behavior:**
1. Load Class + Unit; 404 if missing; Unit should belong to Class’s subject (400 if not).  
2. If `meeting_days` provided (non-empty), update Class.  
3. Effective meeting days = body or Class or default `[1,2,3,4,5]`.  
4. Lessons to schedule = unit `lesson_ids` **minus** lesson_ids already scheduled for this class+unit, **preserving unit `lesson_ids` order**. If none left → 400 “Already scheduled”. (Partial re-runs append missing lessons at the **end** of the class schedule — they are not spliced into historical gaps.)  
5. Generate dates from `start_date` + meeting days.  
6. Append Scheduled Lessons with `schedule_order` after max for class; `delivery_status: 'planned'`.  
7. Ensure `unit_id` in `active_unit_ids`. If `current_unit_id` empty, set to this unit. If `current_scheduled_lesson_id` empty, set to first newly created id.  
8. Return `{ class, scheduled_lessons: created[] }` (or 200 + refetch client-side).

**Default start date (UI only):** day after last scheduled lesson for the class, snapped forward to next meeting day; teacher can override.

### `PATCH /api/scheduled-lessons/:id`

**Body (one or both):**
```ts
{ date?: string; direction?: 'up' | 'down' }
```

- `date`: update that field (validate YYYY-MM-DD).  
- `direction`: swap `schedule_order` with adjacent row for the same `class_id` (by order). No-op at ends (200 or 400 — prefer **200 no-op**).

### `PATCH /api/classes/:id`

**Body:**
```ts
{
  meeting_days?: number[];
  current_scheduled_lesson_id?: string | null;
}
```

- `current_scheduled_lesson_id` must reference a scheduled lesson for this class when non-null.  
- Setting current does not auto-change `delivery_status` in this slice.

## UI

### Class page

- Primary **Schedule unit** button above the Schedule section (also when empty).  
- Schedule rows gain: date control, **Up** / **Down**, **Set current** (current row indicated).  
- After any successful write: refetch curriculum; re-render Class page (context bar / current sections update).

### Schedule unit modal (3 steps)

1. **Choose unit** — units for the class subject. Fully scheduled → disabled + “Already scheduled”. Partially scheduled → allowed (append missing lessons only).  
2. **Pattern** — start date + Mon–Fri toggles; prefills `meeting_days`.  
3. **Preview** — read-only proposed rows (date · lesson title · order); Cancel / Confirm. Confirm → `POST schedule-unit`; on success close modal + refetch; on error banner, stay open.

## Error handling

| Case | Response / UI |
|------|----------------|
| Unauthenticated | 401 — existing pattern |
| Unknown class/unit/lesson | 404 |
| Unit wrong subject | 400 |
| Empty meeting_days / bad date | 400 |
| Unit has zero lessons | 400 |
| Nothing left to schedule | 400 “Already scheduled” |
| Write failure | Modal/page error banner; keep prior state |

## Testing

- `generateScheduleDates` unit tests (weekends, sparse Mon/Wed/Fri, inclusive start)  
- API: schedule-unit append + meeting_days persist + already-scheduled  
- API: PATCH date, reorder, set current  
- UI: wizard happy path; row actions; Class page refresh  
- Regression: Home Today/Week, Classes browse, publish/student flows  

## Success criteria

- Teacher can schedule a unit onto a class with a meeting pattern and see appended schedule rows persist.  
- Teacher can change a date, reorder, and set current lesson; Class header/current sections reflect current.  
- No delivery-status, remove, or student-nav work in this slice.

## Follow-ups (not this slice)

- Delivery status; remove; schedule single lesson  
- Drag-and-drop / calendar  
- Student prev/next from schedule_order  
- Class homepage editor  
- Wall-clock today  
