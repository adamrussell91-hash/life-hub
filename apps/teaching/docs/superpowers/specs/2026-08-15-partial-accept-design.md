# Teaching Hub — Partial Accept

**Date:** 2026-08-15  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Let teachers keep some of a structured AI proposal and dump the rest, then apply through the existing Accept path  
**Depends on:** Validated `AiProposal` kinds, `applyProposalToLesson`, AI panel proposal card, draft autosave  
**Parent:** `docs/specs/06_AI_AGENT.md` §35; canvas slice `2026-08-15-lesson-builder-canvas-ai-design.md` (this was out of scope there)  
**Not this slice:** Compare / Keep Both; streaming blocks onto the page; a new model tool; page-canvas overlay pickers; tables, graphs, charts, cloze blanks; nested layout children independent of their parent block

## Goal

When a proposal is a collection or a multi-block plan, the teacher can uncheck the parts they do not want. Accept applies a filtered copy of the same proposal kind. Reject and Regenerate stay all-or-nothing. The model does not need to know about partial accept.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Where filtering happens | Client, after a validated proposal, before `applyProposalToLesson` |
| New AI tool | None |
| Default | Every unit checked (same as today’s Accept-all) |
| Apply | Filter → existing apply → existing autosave. Never publish |
| Empty keep-set | Accept selected disabled; Reject still works |
| Schema mins | Filter must still pass the block schema (gallery ≥2, flashcards ≥1, timeline ≥1, comparison gallery exactly 2). Fail with a message on the card; draft unchanged |
| Single-unit proposals | No checklist. Accept / Reject / Regenerate unchanged |
| `reorder_blocks` / `review_only` | No partial UI |
| Stale snapshot | Same confirm as full Accept, then apply the **filtered** proposal |
| Page preview | None. Selection lives on the proposal card |
| Nested layout | Unchecking a section/columns/tabs block dumps the whole subtree. Collection **items** inside a kept block can still be unchecked |

## Approaches considered

1. **Client filter of existing kinds (chosen).** Pure function + checklist. No transport change. Easy to test. Matches “proposals only.”
2. **New model tool.** Extra invalid output, extra Zod, no teacher benefit.
3. **Checkboxes on the lesson page.** Fights the “page unchanged until Accept” rule from the canvas spec.

## What is a unit

A **unit** is one checkbox. Keys are stable strings derived from the proposal payload (index for accordion rows; item `id` otherwise).

### Lesson / insert / delete

| Proposal | Units |
|----------|--------|
| `insert_blocks` | Each proposed root block |
| `replace_lesson` | Optional `title`, optional `cover`, then each proposed root block |
| `delete_blocks` | Each id in `ids` |
| `replace_section` | Each **child** of the proposed section (the section shell always applies if anything is accepted) |
| `replace_block` | No block-level checkbox (the target is already one block) |

### Collection items (first implementation)

Only when the proposed block is kept (or is the `replace_block` target):

| `block_type` | Field | Identity | Min if the block is kept |
|--------------|--------|----------|--------------------------|
| `question_set` | `content.questions` | `id` | ≥1 |
| `flashcards` | `content.cards` | `id` | ≥1 (schema) |
| `timeline` | `content.events` | `id` | ≥1 (schema) |
| `gallery` | `content.items` | `id` | ≥2; comparison layout exactly 2 |
| `accordion` | `content.items` | index | ≥1 |
| `self_check` | `content.items` | `id` | 0 allowed (items optional) |

Labels: truncated prompt / front / when+label / alt_text / title / label. Prefix with Q1, Card 2, etc. by display order.

Not in v1: `table` rows, `chart` series, `mind_map` / `concept_map` nodes, `cloze` gaps, HTML apps.

## Filter rules

`filterProposal(proposal, selectedKeys)` returns `{ ok, proposal?, message? }`.

- Drop unchecked root blocks / delete ids / section children.
- On a kept collection block, keep only checked items; reindex display order; preserve remaining item ids.
- Unchecked `title` / `cover` are omitted from `replace_lesson` (existing title/cover stay).
- Unchecked section children are omitted from `section.content.blocks`.
- If a kept block would fail schema mins, `{ ok: false, message }`.
- If nothing remains to apply (`insert_blocks` with zero blocks; `delete_blocks` with zero ids; `replace_lesson` with zero blocks and no title/cover; `replace_section` with no children **and** we still require the section to have a valid children array — empty children is allowed if the section schema allows it), `{ ok: false, message: 'Select at least one change' }`.
- `replace_block` of a non-collection type is not filterable; callers must not show a checklist.

Apply always uses the filtered proposal object. The transcript still stores the original proposal; status becomes `accepted` after a successful apply (including partial). The card title: “Proposal accepted” (same as today). Optional subtitle is YAGNI.

## UI

Pending mutating proposal with **two or more units**:

- Checklist under the kind title, grouped under the parent block label when items are nested.
- Buttons: **Accept selected** (primary), Reject, Regenerate.
- Changing checks does not apply anything.
- Accept selected runs stale-snapshot confirm if needed, then `filterProposal`, then `onAcceptProposal(filtered)`. Filter failure: status stays `pending`, error text on the card.

One unit or non-filterable kind: today’s Accept / Reject / Regenerate.

Cotton glass: existing `.ai-panel__proposal` card, checkboxes using current form control styles, no new chrome language.

## Architecture

```
validated AiProposal (unchanged wire format)
        │
        ▼
listPartialAcceptUnits(proposal)     // pure
        │
        ▼
proposal card checklist (ai-panel)
        │
        ▼
filterProposal(proposal, keys)       // pure
        │
        ▼
applyProposalToLesson(lesson, filtered, nextId)
        │
        ▼
draft autosave (existing)
```

Files:

- `src/ai/partial-accept.ts` — list + filter + schema-min checks. No DOM.
- `src/teacher/ai-panel.ts` — checklist + Accept selected.
- `src/styles/app.css` — compact checklist spacing only.
- Tests: `tests/unit/partial-accept.test.ts`, extend `tests/unit/ai-panel.test.ts`.

Palette, canvas, and Netlify AI functions do not change.

## Failure

| Failure | Result |
|---------|--------|
| Zero units selected | Accept selected disabled |
| Filter fails schema min | Message on card; draft unchanged; proposal still pending |
| Apply target missing | Existing apply failure; pending |
| Stale snapshot cancelled | Pending, checks preserved |

## Tests

- `question_set` keep 1,2,5 dump 3,4 → applied block has three questions in that order, same ids.
- `insert_blocks` uncheck middle block → two inserts, ids cloned as today.
- `replace_lesson` uncheck title → blocks apply, lesson title unchanged.
- `delete_blocks` uncheck one id → only checked ids deleted.
- Gallery keep 1 of 3 → filter fails (min 2).
- Flashcards keep 0 → filter fails.
- `reorder_blocks` → zero units; panel shows Accept not Accept selected.
- Single `replace_block` rich_text → no checklist.
- Panel: two insert blocks render two checkboxes; Accept selected calls `onAcceptProposal` with filtered payload.
- Reject still discards the original proposal without apply.

## Acceptance

1. Teacher can accept questions 1, 2 and 5 from a proposed question set and never see 3 and 4 in the draft.
2. Teacher can dump some proposed root blocks from insert / replace_lesson.
3. All-checked Accept selected equals today’s Accept.
4. Invalid leftovers never hit the draft.
5. AI down / Reject / Regenerate behaviour unchanged.
