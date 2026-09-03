# Class Page Clinical Glass Refresh — Implementation Plan

> Status: **Done** (uncommitted WIP verified 2026-08-10). Spec: [`../specs/2026-08-10-class-page-clinical-glass-refresh-design.md`](../specs/2026-08-10-class-page-clinical-glass-refresh-design.md)

**Goal:** Fix create/list refresh, add covers, redesign class page, replace unit stub with plan overview + lessons.

## Tasks (completed)

- [x] Fix curriculum invalidation + remount after create (`src/app/curriculum-cache.ts`, `src/app/main.ts`)
- [x] Add `CoverSchema` + optional cover on class/unit/lesson; unit `blocks`; Netlify/mock PATCH (`src/schemas/cover.ts`, `netlify/functions/unit.mts`, …)
- [x] Shared cover picker — URL + media library (`src/teacher/cover-picker.ts`); wire class/unit/lesson
- [x] Class page redesign — cover hero, announcements first, gallery unit cards, Clinical Glass
- [x] Unit plan page — cover + block overview editor + lesson list; student parity
- [x] Index cover thumbs + tests (`tests/unit/schemas-cover.test.ts`, `curriculum-cache.test.ts`, section tests)

## Key files

| Area | Files |
|------|--------|
| Cache | `src/app/curriculum-cache.ts`, `src/app/main.ts` |
| Schema | `src/schemas/cover.ts`, class/unit/lesson/published-* |
| API | `netlify/functions/unit.mts`, `class.mts`, `published-unit.mts`, `scripts/mock-api.ts` |
| UI | `src/teacher/cover-picker.ts`, `sections/classes.ts`, `sections/units.ts`, `lesson-editor.ts`, `src/student/class-view.ts`, `unit-view.ts`, `src/styles/app.css` |

## Verification

- `npm run test:unit` — 719 passed (2026-08-10)
- Manual: create entity without hard reload; set/clear covers; announcements order; unit blocks save
