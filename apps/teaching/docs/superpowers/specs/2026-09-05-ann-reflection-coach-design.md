# Ann — Reflection Coach Design

**Date:** 2026-09-05  
**App:** `apps/teaching`  
**Status:** Design only (Band C of `docs/superpowers/plans/2026-09-05-restore-notion-agent-depth.md`)  
**Precedent:** `apps/tasks/docs/superpowers/specs/2026-08-25-clare-supercharge-design.md`

## Why this is not a prompt patch

`apps/teaching/src/ai/context.ts` (`AiContextInput`) is entirely about in-editor lesson-block editing: lesson, scope, selected block, search pack, action. There is no reflection-history field, no multi-turn Q&A shape, and **no chat surface for Ann outside the in-editor quick-action flow**. Restoring Notion-era "ask 3–5 questions one at a time, react, store a reflection" requires a real conversational surface — the same class of work Clare got with `#/clare` + `/api/clare`.

Do not ship prompt-only coaching against the current context builder. It has no hook for any of this.

## Product shape

### Surface

- Primary: `#/ann` desk (Clare analogue) for standalone post-lesson reflection.
- Secondary entry: "Reflect" action from a lesson page that opens the same desk with `lesson_id` prefilled.
- Decide at implementation time whether a reflection is always lesson-linked or may be standalone; Notion's original was standalone with optional lesson link — prefer that.

### Conversation protocol

1. Ann asks 3–5 questions **one at a time**.
2. After each answer: brief reaction, then next question (or close).
3. On close: write a structured reflection record (Confirm if the teaching hub uses Confirm for durable writes; otherwise follow teaching-hub persistence norms).
4. Pre-lesson coaching turn may query prior reflections by subject / year level / unit / pattern tag and coach from **stored** patterns only — never invent patterns.

### Reflection schema (`apps/teaching/src/schemas/`)

Minimum fields:

- `id`, `created_at`, `updated_at`
- `lesson_id` (nullable)
- `date`
- `subject`, `year_level`, `unit` (nullable strings)
- `focus_phrase` (one-line reflection focus)
- `framework` (enum from fixed list — see Research base)
- `strength` + `strength_why`
- `growth` + `growth_why`
- `pattern_tags` (subset of a fixed tag list)
- `notes` (optional free text)

### Storage (`apps/teaching/src/storage/`)

Inspect existing lesson/unit persistence before inventing a new shape. Follow the same store (files / blobs / DB) teaching already uses. Reflections are append-only enough to query; edits allowed; no silent deletes in v1.

### Query surface

Must support:

- by subject, year level, unit, pattern tag
- most-recent-first
- optional lesson_id filter

Without this, any "coach the next lesson using patterns" instruction will confabulate.

### Prompt content (only after surface + schema + storage + query exist)

- Framing: deliberate practice / reflective practice / instructional coaching
- Post-lesson protocol: 3–5 questions, one at a time
- HPGE research base applied selectively, not recited: Gagné DMGT 2.0, VanTassel-Baska ICM, Renzulli Triad, Kaplan Depth and Complexity
- Periodic Synthesis Report shape
- Monthly Hammond Handoff — **additive** to the mailbox already shipped; do not rewire or remove existing Hammond↔Ann coordination

## Non-goals

- Clementine / Knowledge Hub
- Replacing the in-editor `AiContextInput` lesson-edit flow
- Prompt-only restore against `context.ts`
- Hardcoded Notion reflection history

## Implementation slices (later project)

1. Schema + storage + query tests
2. `#/ann` desk shell + API route (mirror Clare dump/brief action shape where it fits)
3. Multi-turn reflection session state
4. Prompt + synthesis + Hammond handoff
5. Lesson-page "Reflect" entry point

## Acceptance for this Band C deliverable

This design doc exists and is linked from the restore plan. No teaching runtime code changes in the restore PR beyond this document.
