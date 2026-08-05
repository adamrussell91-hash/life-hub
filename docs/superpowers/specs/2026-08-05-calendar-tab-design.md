# Calendar Tab (Read-only Month + Week)

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Calendar is a nav stub (“later phase”). Life Hub already has `buildCalendarMarkers` over logged events; the tab should surface week + month views and a day detail list without a new appointment schema.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Month grid + week strip + tap-day detail |
| Data | Existing events via `buildCalendarMarkers` |
| Write | None on this tab |
| Search / appointments / Clare | Out of v1 |

## Behaviour

1. Calendar nav opens `#calendar-dashboard` (desktop rail + mobile bar).
2. **Week strip:** current Sydney week (Mon–Sun or locale week matching Home if already used); dots for categories present that day; highlight today.
3. **Month grid:** view month (default: current Sydney month); weekday headers; cells with date number + category dots; selected day highlighted; prev/next month buttons.
4. **Day detail:** list events for selected date — category/type, title-ish label, optional snippet from body/notes. Empty state if none.
5. Selecting a day updates detail; selecting today from week/month stays in sync.
6. Days with no loaded events are empty cells (no lazy history fetch in v1).

## Labels

| Type | Detail title |
|------|----------------|
| meal | meal name (breakfast…) |
| workout | title |
| diary | Diary / mood |
| skincare | AM/PM / procedure from notes |
| weight / composition / measurements | Body |
| sleep | Sleep |

Categories for dots: nutrition, fitness, diary, body, skincare, sleep (from `js/core/search.js`).

## Out of scope

AND search, CN appointment parse, appointment record type, Clare agent, lazy month extension beyond synced events.

## Verification

- Unit: model builds week/month cells + day events from fixtures.
- Manual: open Calendar, navigate months, tap days with meals/workouts/skincare.
