# Travel journal Phase 3 — Complete owner control

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full owner editing: fields, pin moves, reorder, split, merge, move across days/legs, delete with timed undo, Trash/restore, straight map connections, itinerary-linked transitions — and prove manual edits survive reimport.

**Architecture:** Client editors write through `saveJournal` with `if_version`. Map previews stay static/schematic in-story; one on-demand MapLibre instance for expanded “photo stops” and pin editor (destroy/reuse on close). Liveness via shared helpers — deleted records absent from normal UI. Transition display overrides are journal-only.

**Tech Stack:** Existing MapLibre dependency in Travel, `hub-feedback.offerTimedUndo`, morphing overlays, journal API from Phase 2.

**Spec:** `docs/superpowers/specs/2026-10-10-travel-journal-design.md`  
**Depends on:** Phase 2  
**Product authority:** Codex §§ Editing and deletion, Map connections, Edit/reorder/split/merge screens, Connection fragments and leg transitions, Scenarios A/C/E.

## Global Constraints

- Crops never overwrite originals; pin drag changes effective location only.
- Split preserves every attachment exactly once; merge never overwrites one reflection with another.
- Move across day/leg updates both views atomically; timezone: preserve instant when known.
- Delete journal leg ≠ cancel booking. Impact summary for day/leg/trip delete.
- Timed undo 10s → real restore; parent restore does not revive children deleted independently earlier.
- At most one map preview per day by default; zero located → no map; one located → stop, no segment.
- Straight segments only; label “photo stops”; break across unlocated material; handle longitude wrap.
- Manual edits must survive reimport (checksum match updates media bytes only when explicit; never clobber manual place/time/order).
- R4 on every editor sheet. `npm run pre-pr-check` before PR.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/travel/src/journal/edit-moment-sheet.ts` | Full moment editor |
| `apps/travel/src/journal/pin-editor.ts` | Map + crosshair + Use this location |
| `apps/travel/src/journal/reorder-sheet.ts` | Up/down + drag; reset to chronological |
| `apps/travel/src/journal/split-sheet.ts` | Select attachments → two moments |
| `apps/travel/src/journal/merge-sheet.ts` | Candidates + preview |
| `apps/travel/src/journal/move-sheet.ts` | Leg then day + timezone preview |
| `apps/travel/src/journal/delete-flow.ts` | Impact confirm + timed undo + Trash |
| `apps/travel/src/journal/trash-view.ts` | List deleted; restore; permanent delete |
| `apps/travel/src/journal/map-connections.ts` | Pure: stops, segments, dedupe visual, wrap |
| `apps/travel/src/journal/map-preview.ts` | Day preview button + schematic/static |
| `apps/travel/src/journal/map-expanded.ts` | Single MapLibre instance |
| `apps/travel/src/journal/transitions.ts` | Render + edit overrides |
| `apps/travel/src/journal/reimport-guard.ts` | Preserve manual fields on reimport |
| `apps/travel/tests/unit/map-connections.test.ts` | Segments / unlocated breaks / wrap |
| `apps/travel/tests/unit/split-merge.test.ts` | Media accounting |
| `apps/travel/tests/unit/reimport-guard.test.ts` | Manual survival |
| `tests/unit/travel-journal-liveness.test.js` | Deleted filtered from normal reads |

---

### Task 1: Map connection pure logic

**Files:** `map-connections.ts`, `map-connections.test.ts`

**Interfaces:**
- `buildPhotoStops(moments): Stop[]` — located only; keep unlocated in story separately
- `buildSegments(stops, opts): Segment[]` — straight lines; skip gap when unlocated material between; lon wrap
- `visualDedupeKey(lat, lon): string` — cluster identical coords for display without deleting moments

- [ ] **Step 1: Failing tests** — three stops → two segments; middle unlocated break; antimeridian pair.

- [ ] **Step 2: Implement → PASS → commit** `feat(travel): journal straight photo-stop segments`

---

### Task 2: Day map preview + expanded MapLibre

**Files:** `map-preview.ts`, `map-expanded.ts`; wire in `render-journal.ts`

- [ ] **Step 1:** Preview ≤1 per day; accessible button label `Open photo stops for this day`.
- [ ] **Step 2:** Expanded map: cooperative gestures by default; fullscreen enables interaction; attribution visible; single instance.
- [ ] **Step 3:** On delete/move stop, recompute neighbours immediately (420ms opacity, no camera flight).
- [ ] **Step 4: Commit** `feat(travel): journal photo-stops map preview and expanded view`

---

### Task 3: Edit moment + pin editor

**Files:** `edit-moment-sheet.ts`, `pin-editor.ts`

- [ ] **Step 1:** Ellipsis menu: Edit / Reorder / Split / Merge / Move / Delete — disable unavailable with explanation.
- [ ] **Step 2:** Editor body order per Codex; Place: Search (reuse `searchPlaces`), Choose on map, Remove location.
- [ ] **Step 3:** Pin editor: 44px zoom, centre crosshair, commit only on Use this location then Save; advanced lat/lon with bounds checks.
- [ ] **Step 4:** R4 measure at 390 keyboard open.
- [ ] **Step 5: Commit** `feat(travel): journal moment editor and pin location`

---

### Task 4: Reorder, split, merge, move

**Files:** `reorder-sheet.ts`, `split-sheet.ts`, `merge-sheet.ts`, `move-sheet.ts` + unit tests

**Interfaces:**
- `splitMoment(moment, selectedMediaIds): { a, b }` — no empty; each media once
- `mergeMoments(moments, opts): Moment` — combined order, paragraphs preserved, location choice explicit
- `moveMoment(moment, { legId, localDate, timezoneMode })` — preview local time
- Reorder: Move up/down + drag; `Reset to time order` explicit

- [ ] **Step 1: Failing split/merge accounting tests.**

- [ ] **Step 2: Implement sheets + atomic saveJournal patches.**

- [ ] **Step 3: Commit** `feat(travel): journal split merge move and reorder`

---

### Task 5: Delete, timed undo, Trash, restore, permanent delete

**Files:** `delete-flow.ts`, `trash-view.ts`; server filter in `travel-journal-schema` / GET path using `withoutDeleted` / `isDeletedRecord` patterns

- [ ] **Step 1:** Soft-delete sets lifecycle; normal GET strips deleted.
- [ ] **Step 2:** Moment delete → `offerTimedUndo` 10s → restore API.
- [ ] **Step 3:** Day/leg/trip delete → impact counts; journal delete ≠ itinerary delete copy.
- [ ] **Step 4:** Trash view: restore idempotent; permanent delete explains original loss; remove R2 objects only when no live refs.
- [ ] **Step 5:** Parent restore does not revive independently deleted children — unit test.
- [ ] **Step 6: Commit** `feat(travel): journal delete undo trash and restore`

---

### Task 6: Transitions + reimport guard

**Files:** `transitions.ts`, `reimport-guard.ts`, tests

- [ ] **Step 1:** Render transition once; labels wrap; airport codes only if verified itinerary ticket fields exist.
- [ ] **Step 2:** Editable display override stored on transition; View journey details opens existing itinerary UI without mutating bookings from journal save.
- [ ] **Step 3:** `applyReimport(existing, incoming)` preserves manual place/time/order/captions; skips duplicate checksums; does not resurrect deleted.
- [ ] **Step 4: Commit** `feat(travel): journal transitions and reimport-safe manual edits`

---

### Task 7: Phase 3 acceptance

- [ ] Codex checks 2, 3, 4, 7 (owner paths) + Scenarios A, C, E.
- [ ] Screen recording: chapter jump, editor morph, delete, undo.
- [ ] Screenshots 390/1440 including both patterns, long place, portrait, keyboard edit.
- [ ] `npm run pre-pr-check`.

**Phase 3 done when:** owner can fully reshape the journal without touching bookings, maps show straight photo-stop connections, Trash works, reimport keeps manual corrections.

---

## Spec coverage (Phase 3)

| Codex item | Task |
| --- | --- |
| Map connections | 1–2 |
| Editing / pin / crop fields | 3 |
| Reorder split merge move | 4 |
| Deletion undo Trash | 5 |
| Transitions + reimport survival | 6 |
| Offline queues / export / share | Phase 4 |
