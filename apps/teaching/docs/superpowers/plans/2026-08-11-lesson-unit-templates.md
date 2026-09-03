# Lesson & Unit Templates Implementation Plan

> **For agentic workers:** Execute task-by-task. Prefer inline implementation over multi-subagent review loops when the user requests a lean process.

**Goal:** Lesson + unit templates (independent copy) with Templates library and create-new-from-template.

**Architecture:** Parallel to compositions — separate schemas, Blobs keys, Netlify/mock APIs; library page at `/templates`; save from editors; use creates new entity via existing create + PATCH content.

**Tech Stack:** TypeScript, Vitest, existing create/clone patterns

**Spec:** `docs/superpowers/specs/2026-08-11-lesson-unit-templates-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/lesson-template.ts`, `unit-template.ts` | Zod schemas + summaries |
| `src/storage/keys.ts` | `lessonTemplateKey`, `unitTemplateKey` |
| `src/blocks/clone.ts` (or existing) | Reuse `cloneBlockWithNewIds` |
| `netlify/functions/lesson-templates.mts`, `lesson-template.mts` | List/create + get/patch |
| `netlify/functions/unit-templates.mts`, `unit-template.mts` | Same for units |
| `scripts/mock-api.ts` | Mock parity |
| `src/teacher/template-api.ts` | Client helpers |
| `src/teacher/sections/templates.ts` | Library UI |
| `src/teacher/lesson-editor.ts`, `sections/units.ts` | Save as template |
| `src/app/router.ts`, `main.ts`, `primary-nav.ts`, `section.ts` | Route + nav |
| `docs/BUILD.md` | History |

### Tasks

1. Schemas + storage keys + tests  
2. APIs + mock + tests  
3. Client API + use-template create helpers  
4. Library page UI + nav/route  
5. Save hooks on lesson editor + unit page  
6. BUILD.md + verify  

Commit after each task.
