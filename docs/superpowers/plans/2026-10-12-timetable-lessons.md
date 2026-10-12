# Timetable Lessons Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Create calendar-visible blank lessons from saved class cycle timetables.
**Architecture:** Shared pure JavaScript cycle generator consumed by TypeScript composer and production API; authenticated bulk writer persists deterministic lessons and schedule rows. Class schema owns timetable; shared calendar reads saved timing and readiness.
**Tech Stack:** Existing Vite/TypeScript, Netlify Functions/Blobs, Vitest, node:test, Playwright.
**Spec:** docs/superpowers/specs/2026-10-12-timetable-lessons.md

## Global Constraints
- Preserve existing schedule-unit endpoint and shared calendar look.
- Dates dd/mm/yy; slots valid start/end times; bounds one year; strong mutable reads.
- No deletions of user work, no automatic production seeding or publishing.
- R4: 390px fields ≥16px, docked buttons ≥44px above safe area.

## Review Focus
- Weekend and holiday cycle drift; exceptions pause or re-anchor explicitly.
- Repeated or partially failed writes must preserve content and avoid duplicates.
- Deleted parents and subject mismatch must produce no writes.
- Empty units must schedule real drafts and appear immediately after refresh.
- 53-minute and double lessons must use actual duration and editor links.

### Task 1: Cycle generator and schemas
Files: apps/teaching/src/schedule/timetable.js; schemas/class.ts; schemas/scheduled-lesson.ts; tests/unit/teaching-timetable.test.js.
Interface: generateTimetableSessions(timetable,startDate,endDate) returns date,cycle_day,start_time,end_time,period,room; validateTimetable returns normalized configuration.
- [x] Write tests for exact Manresa cycle, weekends, holidays, overrides, malformed dates/times, backwards anchors and bounds; run node --test tests/unit/teaching-timetable.test.js, expect RED.
- [x] Implement generator, preset and optional backwards-compatible schemas; expect same tests GREEN.

### Task 2: Durable scheduling
Files: netlify/functions/schedule-timetable.mjs; _shared/teaching-timetable-write.mjs; apps/teaching/scripts/mock-api.ts; teacher/schedule-api.ts; tests/integration/teaching-timetable.test.js.
Interface: POST /api/classes/:classId/schedule-timetable {unit_id,start_date,end_date,timetable,omitted_slots,use_existing}; response {class,unit,lessons,scheduled_lessons}.
- [x] Tests: blank unit creates drafts + curriculum + calendar events; repeats no duplicates; lagging reads preserve indices; partial retry preserves edited blocks; conflicts/deleted parents/subject mismatch/invalid slots/auth rejected before writes. Run integration test, expect RED.
- [x] Implement and route local mock through same bulk writer. Run integration tests, expect GREEN.

### Task 3: Composer and calendar wiring
Files: teacher/sections/schedule-timetable-modal.ts; app/main.ts; teacher/home.ts; teacher/sections/classes.ts; teacher/sections/units.ts; curriculum/with-scheduled-unit.ts; app/curriculum-state.ts; styles/app.css; packages/design-kit/js/calendar/teaching-calendar.js.
- [x] Write Vitest composer tests: empty units selectable, preset edits, preview omissions, actual payload, refresh merges drafts and schedules, existing flow retained. Expect RED.
- [x] Implement composer on Unit/Class/Calendar/Home; merge new records immediately, refresh calendar source, map blank lesson readiness. Expect GREEN.
- [x] Verify a browser creates this week's blank unit lessons, calendar shows real lesson links and durations; R4 at 390 after scrolling long form. Run teaching suite, root npm test and pre-pr-check. No PR while gate fails.

### Task 4: Review and handover
- [x] Review diff against spec and tests, fix material issues with regressions.
- [x] Commit and create PR only after required gate exit 0; attach PR; report verification and limitations accurately.

## Verification and review record

- Generator/API: 12 node:test cases passed, including exact Manresa timings, non-school days, retries, concurrent ownership, duration retention and physical deletion.
- Teaching: 81 relevant Vitest tests passed in 13 files. The complete legacy Teaching suite includes 28 stale imports of removed app-local Netlify .mts handlers; the required umbrella suite exercises production .mjs handlers.
- Mandatory gate: exit 0; root 5,663 passed, 11 skipped; Tasks 1,425 passed; Professional typecheck passed.
- Teaching production build passed (existing large-chunk warning).
- Browser: four blank sessions visible this week; Day 1 card reports Lesson, 11:50–12:43, A0214 and Not planned yet; its /teaching/lessons link opens the saved blank editor. Phone at 390×844: fields 16px, actions 44px at bottom 827px, document width 390px; actions stay docked after form scrollTop 3064px.
- Independent review found concurrency overwrite, duration loss, stale refresh and orphan calendar rows. Each was reproduced with a failing test and fixed; final covering tests pass.
- Builder calls: weekends/non-school dates pause the cycle; explicit corrections re-anchor a date; preview omissions do not pause the cycle. No school holiday dates inferred. Separate class and unit leases and conditional writes use the repository's existing Blobs SDK. Existing class data is not renamed or automatically seeded; the Manresa preset applies to the selected class after confirmation.
- Handover: all runtime scope complete; commit and pull request creation are the final bookkeeping step. No merge or deployment performed.
