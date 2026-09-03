# Teaching Hub — Teacher Rail & Section Shells Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Teacher left-rail primary navigation + light section canvases  
**Depends on:** First slice (lesson draft → publish → student view) — shipped

## Goal

Give the teacher workspace a navigable map: primary section destinations in the left rail, with the existing curriculum tree retained underneath, and light but useful browse/stub pages for each section. Do not deepen block types, student chrome, or the home dashboard in this slice.

## Broader roadmap (context only)

Agreed build order after this slice:

1. **This slice** — Teacher rail + section shells  
2. Builder blocks (video, image, HTML, etc.)  
3. Published student nav (return to unit, class homepage, etc.)  
4. Teacher home dashboard (today / week calendar)

This document specifies **item 1 only**.

## Decisions

| Topic | Choice |
|-------|--------|
| Rail shape | Primary sections on top + Year → Subject → Unit → Lesson tree below |
| Section depth | Light useful shells (lists from seed/curriculum where possible; placeholders where models don’t exist yet) |
| Scope & Sequence list | One row per Subject; detail is a stub for that subject |
| Implementation approach | Extend current shell/router/nav — no nav-controller rewrite |
| Home canvas | Keep current lesson list; calendar dashboard deferred |
| Lesson editor / publish | Unchanged |
| New APIs / entities | None — reuse `GET /curriculum` only |
| Classes / Resource Library | Placeholder canvases only |

## Out of scope

- New block types (video, image, HTML, …)
- Student published-view navigation buttons
- Teacher home calendar / weekly overview dashboard
- Class, Scheduled Lesson, Media, Resource Library data models
- Editable Scope & Sequence document or timeline
- Compact/icon-only rail mode
- Right context panel content
- Search, Trash, Templates, Settings destinations (may appear later; not in this rail list)

## Architecture

### Rail layout

```
┌─────────────────────────────┐
│ Teaching Hub        [Sign out]
├─────────────────────────────┤
│ Home                        │  ← primary sections
│ Classes                     │
│ Scope & Sequences           │
│ Units                       │
│ Lessons                     │
│ Resource Library            │
├─────────────────────────────┤
│ ▸ Year 12                   │  ← existing curriculum tree
│   ▸ English Advanced        │
│     ▸ Artist of the Floating World
│       Lesson 08 …           │
└─────────────────────────────┘
```

- Primary section links use client-side `navigate()` (same as today).
- Curriculum tree behaviour (expand/collapse, local persistence, lesson deep-link) stays as implemented in `renderCurriculumNav`.
- Rail is rebuilt on authenticated teacher route renders (same pattern as `main.ts` today): primary nav + tree into `refs.railNav`.

### Routing

Extend `RouteName` / `match()` with section routes. All teacher section routes require auth.

| Route | Name | Canvas |
|-------|------|--------|
| `/` | `teacher-home` | Existing home lesson list |
| `/classes` | `teacher-classes` | Placeholder: Classes coming next |
| `/scope-sequences` | `teacher-scope-sequences` | Subject list (one row per subject) |
| `/scope-sequences/:subjectId` | `teacher-scope-sequence` | Stub S&S for that subject |
| `/units` | `teacher-units` | Unit list from curriculum |
| `/units/:unitId` | `teacher-unit` | Unit stub: title + linked lessons |
| `/lessons` | `teacher-lessons` | Flat lesson list (Open → editor) |
| `/lessons/:id` | `teacher-lesson` | Existing lesson editor (unchanged) |
| `/resources` | `teacher-resources` | Placeholder: Resource Library coming next |

Student routes (`/s/lessons/:id`) and `/sign-in` unchanged.

Unknown `:subjectId` / `:unitId` values that are not in the loaded curriculum render a not-found status in the canvas (not a hard crash).

### Active state

- **Section highlight** follows route prefix:
  - `/` → Home
  - `/classes` → Classes
  - `/scope-sequences` and `/scope-sequences/:subjectId` → Scope & Sequences
  - `/units` and `/units/:unitId` → Units
  - `/lessons` and `/lessons/:id` → Lessons
  - `/resources` → Resource Library
- **Tree lesson highlight** still follows `activeLessonId` when the open route is `teacher-lesson`.
- Section + lesson leaf may both appear active at once when editing a lesson under Lessons.

### Data

- Single source: existing curriculum payload (`years`, `subjects`, `units`, `lessons`) via `fetchCurriculum()` → `GET /api/curriculum`.
- No Blob schema changes, no new mock-API endpoints for this slice.
- Scope & Sequence “rows” are derived: each `Subject` is one list entry (Year title resolved via `year_id`).
- Unit detail lesson list: filter `lessons` where `unit_id` matches.

### Components / modules

| Module | Responsibility |
|--------|----------------|
| `src/app/router.ts` | Add section route names, params, and `match()` branches |
| `src/app/main.ts` | Dispatch new routes; mount shell; render primary nav then curriculum tree into `railNav`; pass `activeSection` + `activeLessonId` |
| `src/teacher/nav.ts` | Curriculum tree only (unchanged responsibility). Callers compose primary nav above it. |
| `src/teacher/primary-nav.ts` (new) | Render primary section links + active section state |
| `src/teacher/home.ts` | Unchanged behaviour (still used for `/`) |
| `src/teacher/sections/*.ts` (new, small) | Canvas renderers: classes placeholder, resources placeholder, scope list + stub, units list + unit stub, lessons list |
| `src/teacher/shell.ts` | Context bar titles per section; no structural chrome change required beyond what callers already do |
| Tests | Router matches; primary nav active state; section list rendering; unit/subject not-found |

Prefer small section renderers over one mega-file. Extract a shared lesson-list helper if Home and Lessons index would otherwise duplicate the same DOM builder.

### Canvas behaviour (detail)

**Home (`/`)**  
Existing flat lesson list with Open → `/lessons/:id`.

**Classes / Resource Library**  
Single status/empty-style message stating the feature is coming next. No fake rows.

**Scope & Sequences index**  
List subjects with Year + Subject title. Open → `/scope-sequences/:subjectId`.

**Scope & Sequence stub**  
Context bar / heading names the subject. Body: short “Scope & Sequence for this subject is coming next” copy. No editor.

**Units index**  
List units with enough context to distinguish them (unit title + subject/year labels from curriculum). Open → `/units/:unitId`.

**Unit stub**  
Unit title; list of lessons in sequence; each Open → `/lessons/:id` (existing editor).

**Lessons index**  
Same practical shape as Home’s list (may share helper). Exists so “Lessons” is a first-class section destination, not only a tree target.

### Error handling

- Curriculum fetch failure: same as today (rail + canvas error statuses; unauthorized → sign-in).
- Missing subject/unit id: canvas not-found message; rail still renders with primary nav + tree.
- Section renderers must be synchronous DOM builders from already-loaded curriculum (no per-section fetches in this slice).

### Testing

- **Router unit tests:** each new path matches expected `RouteName` / params; unknown paths still null/unmatched as today.
- **Primary nav unit tests:** active section class/aria for representative routes (home, nested unit, lesson editor, scope stub).
- **Section canvas unit tests:** subject list row count from fixture curriculum; unit stub lists only that unit’s lessons; unknown id shows not-found.
- **No new Playwright flow required** for this slice unless an existing browser test breaks on rail markup — fix selectors if so.
- Lesson editor / publish tests remain green without behaviour change.

## Non-goals for “done”

Done means: teacher can click every primary section, see a sensible canvas, use the tree to open lessons, and edit/publish as before. It does not mean Classes, Resources, or Scope & Sequence are real products yet.

## Open follow-ups (explicitly deferred)

- Wire Classes once Class + Scheduled Lesson models exist (feeds dashboard slice).
- Real Scope & Sequence document/timeline.
- Resource Library + media references.
- Compact rail mode from UX spec.
- Home dashboard (today / week) as its own design slice.
