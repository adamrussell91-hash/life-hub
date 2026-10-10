# Travel journal Phase 4 — Reliability and portable copies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durable offline queues, version conflict recovery, search, lazy media performance, complete export/restore that reads with external network blocked, then revocable sharing of selected derivatives only after privacy checks.

**Architecture:** Audit existing Travel SW durability first; add IndexedDB operation queue (Dexie only if needed). Conflicts: server `409` preserves both versions and surfaces resolution UI. Export builds a versioned bundle (JSON + HTML reader + media + GeoJSON + licences). Sharing extends Travel share tokens with journal ACL scopes — GPS stripped from shared derivatives; originals never on predictable public URLs.

**Tech Stack:** IDB, existing MiniSearch vendor if needed, JSZip or native streaming zip (prefer smallest proven approach already in monorepo — search before adding), R2 presign GET for owner export packaging via function.

**Spec:** `docs/superpowers/specs/2026-10-10-travel-journal-design.md`  
**Depends on:** Phase 3  
**Product authority:** Codex §§ Offline, Search, Preservation and sharing, Performance, Acceptance 5–9, 12.

## Global Constraints

- Do not claim automatic background sync on iPhone.
- Local-only content never labelled Backed up.
- Conflicts preserve both versions — no silent last-write-wins.
- Deleted absent from search, AI context, exports, sharing.
- Export reader: no external scripts/fonts/login/paid APIs for basic reading; MapLibre CDN not required for basic package.
- Sharing only after journal ACL tests pass; select legs/moments explicitly; revoke blocks new access.
- Do not alter unrelated archive R2 permissions or life-hub-data repo shape beyond `data/travel/journals/`.
- `npm run pre-pr-check` before PR.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/travel/src/journal/offline-queue.ts` | Queue ops; flush when online; persist across reload |
| `apps/travel/src/journal/conflict-resolve.ts` | Dual-version UI |
| `apps/travel/src/journal/search-index.ts` | Rebuildable local index |
| `apps/travel/src/journal/search-sheet.ts` | Search UI |
| `apps/travel/src/journal/media-loading.ts` | srcset, lazy, prefetch next 2, pagination 30 |
| `apps/travel/src/journal/export-bundle.ts` | Client orchestration |
| `netlify/functions/travel-journal-export.mjs` | Auth zip or manifest + signed GETs |
| `apps/travel/src/journal/export-reader/` | Static HTML/CSS/JS bundled into export |
| `netlify/functions/travel-journal-share.mjs` | Scoped share create/revoke/public read |
| `apps/travel/src/journal/share-sheet.ts` | Select legs/moments |
| `apps/travel/tests/unit/offline-queue.test.ts` | |
| `apps/travel/tests/unit/conflict-resolve.test.ts` | |
| `apps/travel/tests/unit/search-index.test.ts` | |
| `apps/travel/tests/unit/export-bundle.test.ts` | |
| `tests/unit/travel-journal-share.test.js` | No GPS in shared derivative meta |

---

### Task 1: Audit offline + durable operation queue

**Files:** Read `apps/travel/src/lib/offline.ts`, `apps/travel/public/sw.js`; create `offline-queue.ts`

- [ ] **Step 1:** Document in plan notes (PR body) what SW actually caches today — do not claim tile pre-save.
- [ ] **Step 2:** IDB store `journal_ops` with `{ id, target_id, base_revision, action, payload, ack }`.
- [ ] **Step 3:** Enqueue on edit while offline; flush on `online` + app open; warn before unload if pending.
- [ ] **Step 4:** Quota failure → offer retry/download; never claim backup succeeded.
- [ ] **Step 5:** Unit tests for enqueue/flush/idempotent ack.
- [ ] **Step 6: Commit** `feat(travel): journal offline operation queue`

---

### Task 2: Conflict detection + resolution UI

**Files:** `conflict-resolve.ts`; hook `saveJournal` 409

- [ ] **Step 1:** On conflict, load server journal + keep local draft copy side-by-side.
- [ ] **Step 2:** User chooses field-level or keep-both moment copies with new ids.
- [ ] **Step 3:** Test: two sessions editing same moment → recoverable conflict (Codex check 6).
- [ ] **Step 4: Commit** `feat(travel): journal version conflict resolution`

---

### Task 3: Search

**Files:** `search-index.ts`, `search-sheet.ts`

- [ ] **Step 1:** Index places, titles, captions, text, object notes, transcripts; exclude deleted.
- [ ] **Step 2:** Rebuildable from journal document; persist derived index in IDB.
- [ ] **Step 3:** Use kit MiniSearch only if a simple filter is insufficient — justify in commit body.
- [ ] **Step 4:** Empty results retain query + clear control.
- [ ] **Step 5: Commit** `feat(travel): journal search index and sheet`

---

### Task 4: Lazy media + pagination performance

**Files:** `media-loading.ts`; adjust `render-journal.ts` / `render-moment.ts`

- [ ] **Step 1:** Store width/height on media; reserve aspect before download.
- [ ] **Step 2:** srcset for 320 / 960 / 1600; pick by rendered width × DPR; never fetch all originals on open.
- [ ] **Step 3:** Lazy below fold; prefetch next two moments; paginate 30 with Load earlier/more + stable anchors.
- [ ] **Step 4:** One live WebGL map max (already Phase 3) — regression check.
- [ ] **Step 5: Commit** `feat(travel): journal lazy media and moment pagination`

---

### Task 5: Export + restore

**Files:** `export-bundle.ts`, `export-reader/*`, `travel-journal-export.mjs`

Export contents (Codex):
- versioned JSON, readable text, ordinary HTML reader, originals, derivatives, audio + transcripts if any, GeoJSON, pattern artwork, licence notices, checksums

- [ ] **Step 1:** HTML reader works with external network blocked (fixture test in CI using file:// or local server without CDN).
- [ ] **Step 2:** Restore on another profile/machine imports JSON+media into journal store via signed uploads.
- [ ] **Step 3:** Deleted records excluded from export.
- [ ] **Step 4:** Codex check 9 evidence in PR.
- [ ] **Step 5: Commit** `feat(travel): journal portable export and restore`

---

### Task 6: Sharing (only after privacy tests)

**Files:** `travel-journal-share.mjs`, `share-sheet.ts`, share tests

- [ ] **Step 1:** Write failing tests: shared payload has no original keys, no EXIF GPS, no private itinerary fields, only selected moment ids.
- [ ] **Step 2:** Create revocable token scoped to selection; derivatives served with GPS stripped.
- [ ] **Step 3:** Revoke → subsequent GET 404/401; downloaded copies acknowledged outside revocation.
- [ ] **Step 4:** UI: explicit leg/moment multi-select; never default share-all.
- [ ] **Step 5:** Codex checks 7–8.
- [ ] **Step 6: Commit** `feat(travel): revocable scoped journal sharing`

---

### Task 7: Phase 4 acceptance

- [ ] Checks 5, 6, 7, 8, 9, 12 + storage failure / network interrupt manual notes.
- [ ] Quiet offline status row with pending count (not blocking modal).
- [ ] Refresh reconciles without discarding drafts or resetting scroll.
- [ ] `npm run pre-pr-check`.

**Phase 4 done when:** queues survive reload, conflicts are recoverable, search excludes deleted, export reads offline, sharing is scoped and revocable without leaking originals/GPS.

---

## Spec coverage (Phase 4)

| Codex item | Task |
| --- | --- |
| Offline queues | 1 |
| Conflicts | 2 |
| Search | 3 |
| Performance / lazy media | 4 |
| Export / restore | 5 |
| Sharing after privacy | 6 |
| Optional enrichment | Phase 5 |
