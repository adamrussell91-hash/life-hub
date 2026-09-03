# Teaching Hub — Lesson & Unit Templates Design

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Slice:** Lesson + unit templates (independent copy) + Templates library  
**Parent roadmap:** `docs/BUILD.md` Next up; Phase 11 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Compositions v1 pattern, create lesson/unit APIs, teacher auth, lesson editor, unit page  
**Not this slice:** Linked templates; block templates; favourites; starter pack; composition changes

## Goal

Teachers can save a Lesson or Unit as a named template, manage templates on a dedicated library page, and create a **new** independent Lesson or Unit from a template.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Scope | Lesson + unit templates |
| Copy mode | Independent only (no linked / edit-source / detach) |
| Insert | Always create a **new** entity (never replace current) |
| UX | Dedicated `/templates` library + save hooks on editors |
| Architecture | Parallel to compositions (separate schemas/APIs/keys) |
| Unit template payload | Title, optional description/cover, plan `blocks[]`; `lesson_ids` empty on create |
| Curriculum | Templates **not** in `GET /api/curriculum` |

## Data model

```ts
LessonTemplateSchema = CommonFields & {
  type: 'lesson_template'
  blocks: Block[]
}

UnitTemplateSchema = CommonFields & {
  type: 'unit_template'
  description?: string
  cover?: Cover  // optional; omit if CoverSchema not present on branch
  blocks?: Block[]
}
```

Storage: `templates/lessons/{id}`, `templates/units/{id}`

## APIs (teacher auth)

List / create / get / patch (title, archive) for `/api/lesson-templates` and `/api/unit-templates` (+ `/:id`). Mock parity.

## Save / Use / Library

- Save from lesson editor and unit page (title prompt)
- Use → pick parent → create new entity with cloned blocks → navigate
- `/templates` page: Lessons | Units tabs; Use / Rename / Archive

## Out of scope

Linked templates, block templates, favourites, starter pack.
