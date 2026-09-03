# Teaching Hub — Linked Composition Templates Design

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Linked composition insert — Edit Source / Detach / publish resolve  
**Depends on:** Compositions v1 (save/insert independent copy), `cloneBlockWithNewIds`, lesson publish pipeline  
**Parent roadmap:** `docs/BUILD.md` Phase 11 / Linked template reuse  
**Not this slice:** Linked lesson/unit templates; per-block `linked` block type; favourites; reference “used by N”; composition delete UI; student-side live links

## Goal

Teachers can insert a Composition into a Lesson as a **live-linked** section. Editing the composition source updates every linked draft instance. On publish, links resolve to a frozen independent copy so students see a stable lesson. Teachers can **Edit Source** (modal) or **Detach** (local independent section) without silently mutating shared content from the lesson tree.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Compositions only (section templates) |
| Sync model | Live — draft linked sections always resolve from current composition `root` |
| Publish | Resolve at publish — published lesson stores full independent section tree, no link metadata |
| Insert UX | Two buttons: **Insert copy** (default) and **Insert linked** |
| Edit Source | Modal over the lesson editor; saves composition via API |
| Data shape | Thin top-level `section` stub with `content.link` |
| Missing source | Broken-link UI in editor; **hard-fail publish** |
| Nested sections | Linked stubs are **top-level `lesson.blocks` only** |
| Reference checks / delete source | Out of scope (no composition delete in this slice) |

## Out of scope

- Lesson / unit / block templates as linked entities  
- New top-level `block_type: 'linked'`  
- Live linked content on student/published views  
- Soft refresh / snapshot sync (Approach 2)  
- “Used by” reference listing when editing a composition  
- Archive/trash flows for compositions beyond existing status fields if unused

## Data model

Extend top-level lesson `section` blocks:

```ts
SectionLinkSchema = z.object({
  mode: z.literal('linked'),
  source_composition_id: z.string().min(1)
})

// SectionBlockSchema content becomes:
content: z.object({
  title: z.string(),
  collapsed_in_editor: z.boolean().optional(),
  blocks: z.array(SectionChildBlockSchema), // linked: always []
  link: SectionLinkSchema.optional()
})
```

### Rules

| Situation | Behaviour |
|-----------|-----------|
| Independent section (today) | No `content.link`; full `content.blocks` tree |
| Linked stub | `content.link.mode === 'linked'`; `content.blocks` must be `[]`; `content.title` is display hint only (live title from composition) |
| Placement | Linked sections allowed only as top-level entries in `lesson.blocks` |
| Editor render | Resolve `GET /api/compositions/:id` → use `root` for preview; do not persist resolved children into the lesson draft |
| Detach | `cloneBlockWithNewIds(composition.root)` → replace stub with independent section; drop `link`; mark dirty → autosave |
| Remove from lesson | Deletes the stub from this lesson only; does not modify the composition |
| Edit Source save | `PATCH` composition `title` and/or `root`; other lessons’ linked stubs pick up changes on next resolve |
| Missing / invalid / archived source | Show broken-link state; publish rejected |

Published lessons never contain `content.link`. Student UI unchanged aside from receiving expanded trees.

## API

| Method | Path | Behaviour |
|--------|------|-----------|
| Existing | `GET/POST /api/compositions`, `GET /api/compositions/:id` | Unchanged |
| **New** | `PATCH /api/compositions/:id` | Auth; body `{ title?: string, root?: SectionBlock }`; at least one field required; validate; update `updated_at`; return full template |
| Publish path | Existing lesson publish | Before `toPublishedLesson` / sanitize: resolve all top-level linked sections; fail if any source missing/invalid/archived |

Mock API + Netlify Functions must mirror `PATCH`.

Keys remain `templates/compositions/{id}`.

## Editor UX

1. **Insert:** Composition `<select>` retained. Replace single insert control with **Insert copy** and **Insert linked**. Copy = today’s `insertCompositionRoot`. Linked = append thin stub with `content.link`.
2. **Linked row:** Clear “Linked” indicator + composition title (from resolved template or id fallback). Read-only preview of resolved `root` children (or broken-link message). Actions: **Edit Source**, **Detach**, remove-from-lesson. No child editing; no **Save as composition** on linked rows.
3. **Edit Source:** Modal over lesson editor. Edit composition **title** and the composition **`root` section tree** using the same block-row editor controls used for a normal lesson section (children editable inside the modal only). Save → `PATCH`; discard on close without save. After save, refresh linked preview in the open lesson.
4. **Detach:** One click, no confirm dialog in v1. If source is missing/unusable, show an error and leave the stub linked. On success, expand current source into an independent section in place.

## Publish resolve

```ts
function resolveLinkedSectionsForPublish(
  blocks: Block[],
  getComposition: (id: string) => CompositionTemplate | null,
  nextId: () => string
): Block[]
```

- For each top-level block: if section with `content.link`, load composition; if unusable → throw/return error for publish API  
- Else replace with `cloneBlockWithNewIds(root)` (no `link` on result)  
- Non-linked blocks pass through unchanged (deep structure untouched except that nested linked stubs are not supported / should not exist)

Wire into publish so `PublishedLesson.blocks` contains only independent trees.

## Testing

- Schema: linked stub validates; independent section still validates; linked with non-empty `blocks` **rejected**
- Unit: resolve helper expands; missing source errors  
- Publish: expands links; broken link fails  
- API: `PATCH /api/compositions/:id` updates title/root  
- Editor (unit patterns as elsewhere): Insert linked creates stub; Detach clears link; Edit Source save calls PATCH

## Error handling

| Case | Behaviour |
|------|-----------|
| Composition 404 on resolve | Broken-link UI; publish 4xx with clear message |
| Archived / trashed composition | Treat as unusable for link resolve and publish |
| PATCH empty body | 400 validation_error |
| PATCH invalid root | 400 validation_error |
| Detach with missing source | Error status in editor; stub unchanged |

## Approach rejected (for the record)

- Full nested copy + link metadata (drift / accidental local edits)  
- New `block_type: 'linked'` (heavier than needed for composition-only slice)
