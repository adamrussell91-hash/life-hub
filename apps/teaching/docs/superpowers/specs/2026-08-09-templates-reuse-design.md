# Teaching Hub — Templates & Reuse Design (Compositions v1)

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Composition templates — save Section → insert independent copy  
**Depends on:** Existing `section` block + `cloneBlockWithNewIds`  
**Parent roadmap:** `docs/BUILD.md` Phase 11 / Templates & reuse  
**Not this slice:** Block templates; lesson/unit templates; linked/shared content; favourites/recent UI; starter pack library; edit/delete template management UI; homepage save/insert; A4/Drive

## Goal

Teachers can save a top-level Lesson `section` as a named Composition and insert that Composition into any Lesson as an independent copy (new block IDs). Editing the insert does not change the stored template or other lessons.

## Decisions

| Topic | Choice |
|-------|--------|
| First template kind | Composition only (Section snapshot) |
| Source surface | Top-level lesson `section` rows only |
| Insert mode | Independent copy via `cloneBlockWithNewIds` |
| Storage key | `templates/compositions/{id}` |
| Identity | `newId('composition')` → `composition_…` |
| Name | Teacher-provided title at save (`window.prompt` v1) |
| Starter pack | None — library grows from practice |
| Linked templates | Out of scope |
| Curriculum payload | Do **not** stuff compositions into `GET /api/curriculum`; dedicated list/create/get |
| Homepage | Out of scope this slice |

## Out of scope

- Block / Lesson / Unit templates  
- Edit Source / Detach / linked composition instances  
- Favourites, recent templates, Command-K  
- Template browser page / rename / archive UI (API may omit delete)  
- Saving non-section blocks or multi-select  
- Nested section save (sections are not nestable today)  
- Seeded example compositions  

## Data model

```ts
CompositionTemplateSchema = z.object({
  id: z.string().min(1),
  type: z.literal('composition_template'),
  title: z.string().min(1),
  slug: z.string().min(1),
  status: StatusSchema, // active | archived | trashed
  root: SectionBlockSchema, // full section block tree snapshot
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
})
```

### Rules

| Situation | Behaviour |
|-----------|-----------|
| Save | Deep-clone current section into `root` (structuredClone); assign new template id; do **not** rewrite lesson block ids |
| Insert | `cloneBlockWithNewIds(root, nextLessonId)` → append (or insert after selection) into `lesson.blocks`; mark dirty → existing autosave |
| Template edit after insert | N/A — copies are independent |
| Empty title | Reject save |
| Non-section row | No Save control |

## API

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/api/compositions` | Auth; list active compositions as `{ id, title, updated_at }[]` |
| `POST` | `/api/compositions` | Auth; body `{ title, root }`; validate; store; return full template |
| `GET` | `/api/compositions/:id` | Auth; return full template or 404 |

Keys: `compositionKey(id)` → `templates/compositions/${id}`.  
Mock API + Netlify Functions mirror the same paths.

## Editor UX

1. **Save:** On each top-level `section` row, add **Save as composition** beside Duplicate. Prompt for title; default suggestion = section `content.title` or `"Composition"`. On success, brief status text (reuse lesson editor status if present).  
2. **Insert:** In the Add block bar, add a **Composition** `<select>` (titles from `GET /api/compositions`) + **Insert composition** button. Load list when editor mounts; refresh list after a successful save. Empty list → select disabled / placeholder “No compositions yet”.  
3. Inserted block is a normal `section` in the lesson — reorder/duplicate/delete unchanged.

## Testing

- Schema accepts valid composition; rejects missing title / non-section root  
- POST creates blob under `templates/compositions/`  
- GET list returns summaries; GET :id returns root  
- Insert helper / editor path uses `cloneBlockWithNewIds` so root id ≠ stored root id  
- Unauthenticated → 401  

## BUILD.md updates (end of slice)

- History: Templates & reuse (compositions v1)  
- Next up: A4 print pipeline (still primary) or Drive  
- Tick Projection → Templates & compositions (or note “compositions v1; lesson/unit later”)  
- Latest note: Composition save/insert shipped  

## Success criteria

1. Teacher saves a section as a named composition and sees it in the insert picker.  
2. Inserting into another lesson adds an independent section copy that autosaves with the lesson.  
3. Changing the copy does not alter the stored template.  
