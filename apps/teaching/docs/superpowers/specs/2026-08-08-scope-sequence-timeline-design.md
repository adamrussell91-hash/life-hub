# Teaching Hub — Scope & Sequence Timeline Editor Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Teacher Scope & Sequence annual timeline (Units + notes, drag/resize)  
**Depends on:** Teacher rail Scope subject list + stub; curriculum API; Unit model

## Goal

Replace the per-subject Scope stub with a **teacher timeline editor**: week grid with term bands, **Units and note markers**, **drag to move/resize**, toolbar to add items, and a **right inspector**. Persist planning metadata on a `ScopeSequence` blob. No document view and no student Scope in this slice.

## Broader roadmap (context only)

1. Classes + schedule + homepage + student prev/next — done  
2. **This slice** — Scope & Sequence timeline editor  
3. Resource Library  
4. Ops (push, re-seed, wall-clock today, multi-class seed)  

## Decisions

| Topic | Choice |
|-------|--------|
| Product shape | Timeline-first (document later) |
| Editability | Drag move + resize |
| Item kinds | Units **and** notes/milestones |
| Time axis | Week grid; terms as label bands |
| Week storage | 1-based week indices (`start_week` / `end_week`) as source of truth |
| Click | Select + inspector; Open unit / edit note; double-click Unit → unit page |
| Audience | Teachers only |
| Add UX | Toolbar: Add Unit (picker) + Add note |
| Canvas layout | Timeline + right inspector |
| Architecture | `ScopeSequence` blob linked from `Subject.scope_id`; PATCH timeline_items |

## Out of scope

- Document / rich-text Scope view  
- Student-facing Scope page  
- Drag-from-library rail  
- Calendar date fields / Class schedule sync  
- Outcome coverage overlays  
- Creating new Units from the timeline (place existing Units only)  
- Drag engine libraries (use pointer events + CSS grid)  

## Routes

| Path | Behavior |
|------|----------|
| `/scope-sequences` | Unchanged — subject list |
| `/scope-sequences/:subjectId` | Timeline editor (replaces stub) |
| `/units/:unitId` | Existing unit page — Open / double-click target |

## Data model

### ScopeSequence

```ts
{
  id: string;
  type: 'scope_sequence';
  title: string;
  subject_id: string;
  academic_year: number;
  week_count: number; // e.g. 40
  terms: Array<{
    id: string;
    title: string;       // "Term 1"
    term_number: number; // 1–4
    start_week: number;  // inclusive, 1-based
    end_week: number;    // inclusive
  }>;
  timeline_items: TimelineItem[];
  status: 'active' | 'archived' | 'trashed';
  created_at: string;
  updated_at: string;
  schema_version: 1;
}

type TimelineItem =
  | {
      id: string;
      kind: 'unit';
      unit_id: string;
      start_week: number;
      end_week: number;
      order: number;
    }
  | {
      id: string;
      kind: 'note';
      title: string;
      start_week: number;
      end_week: number; // may equal start_week for a point marker
      order: number;
    };
```

### Subject link

Use existing optional `Subject.scope_id` → ScopeSequence id. Seed sets it for `subject_y12_engadv`.

### Constraints

- Weeks clamped to `1…week_count`; `end_week >= start_week`  
- A Unit may appear **at most once** on a given ScopeSequence  
- Notes: thin markers (title + week span only)  
- Terms in v1: seeded/immutable via PATCH of `timeline_items` only (terms not teacher-edited this slice)

## APIs

### `GET /api/curriculum`

Include `scope_sequences: ScopeSequence[]` (or the scopes referenced by subjects). Client resolves scope for a subject via `subject.scope_id`.

### `PATCH /api/scope-sequences/:id`

Auth required. Body:

```ts
{
  timeline_items?: TimelineItem[];
}
```

- Full replace of `timeline_items` when provided  
- Validate kinds, week bounds, unique `unit_id` among unit items, unknown unit_id → 400  
- Update `updated_at`; return updated ScopeSequence  
- Mock-api + Netlify parity  

No public/student Scope endpoint this slice.

## Seed

For English Advanced subject:

- One ScopeSequence (`academic_year: 2026`, `week_count: 40`, four terms spanning the year)  
- At least one unit item (e.g. AoTFW spanning a Term 2 week range)  
- At least one sample note  
- `subject.scope_id` set  

## Teacher UI

### Layout (Approach A)

1. **Context / heading** — subject title  
2. **Toolbar** — Add Unit · Add note  
3. **Main** — term band headers + week columns; item blocks on a track (Units vs notes visually distinct)  
4. **Right inspector** — selection details  

### Interactions

| Action | Behavior |
|--------|----------|
| Click item | Select; populate inspector |
| Double-click Unit | `navigate(/units/:unitId)` |
| Drag body | Move; snap to weeks; clamp |
| Drag edge handles | Resize; min 1 week |
| Pointer-up after drag | Optimistic update → PATCH; on failure revert + banner |
| Add Unit | Picker of subject units **not** already on timeline; default span **4 weeks** (Unit schema has no duration field today); place at first free week (or week 1) |
| Add note | Create with title “Note” at week 1 (or current selection week if any) |
| Inspector — Open unit | Navigate to unit page |
| Inspector — note title | Inline edit; PATCH on blur/Save |
| Inspector — Delete note | Remove item; PATCH |
| Delete Unit from timeline | Allowed (removes timeline item only, not the Unit) |

### Persistence UX

- Local state mirrors `timeline_items`  
- Drag commits on pointer-up (not continuous PATCH)  
- Title edits commit on blur or explicit Save  

## Errors

| Case | Behavior |
|------|----------|
| Subject missing | Canvas “Subject not found.” |
| Subject has no `scope_id` / scope missing | Canvas “Scope & Sequence not found.” (or create empty in seed only — no auto-create in UI this slice) |
| PATCH validation / network | Banner; revert optimistic state |
| Unit blob missing for `unit_id` | Show “Unknown unit” label; item still movable |

## Testing

- Schema: ScopeSequence + timeline item variants; invalid weeks / duplicate unit rejected  
- PATCH persists; curriculum includes scopes  
- UI: render terms/weeks; add unit/note; select inspector; drag move/resize updates weeks (unit tests with synthetic pointer where practical)  
- Regression: scope index list, unit pages, Class/Home/student flows  

## Success criteria

- Teacher opens `/scope-sequences/:subjectId` and sees a week/term timeline for the seeded Scope  
- Can add Unit and note, drag/resize, and have changes persist after reload  
- Inspector supports Open unit and note edit/delete  
- Scope index and non-Scope product areas unchanged  

## Follow-ups

- Document view  
- Student read-only Scope  
- Date-backed weeks / school calendar  
- Outcome coverage  
- Resource Library  
- Ops: push origin; re-seed; wall-clock today; multi-class seed  
