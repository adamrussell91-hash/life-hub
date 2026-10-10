# Travel journal Phase 2 — Working capture and import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist real journal records and media: schema + GitHub journal store, R2 signed uploads, EXIF/grouping worker, import review state machine, and Add moment (Photos / Voice / Text) with reload-safe drafts and partial batch retry.

**Architecture:** Journal JSON at `data/travel/journals/{tripId}.json` via a travel-journal repository mirroring `travel-repository.mjs` concurrency (`if_version` / SHA). Binaries to R2 prefix `travel/journal/{tripId}/` using the same `R2_*` env and presign approach as `knowledge-r2.mjs` (new `travel-journal-r2.mjs` — do not alter Knowledge key layouts or unrelated bucket permissions). Client EXIF/grouping in a Worker. Netlify Blobs `travel-photo` remains for check-in photos only.

**Tech Stack:** Existing Netlify functions, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (already used), exifr (pin MIT), Travel Vitest, IndexedDB drafts (Dexie only if vanilla IDB is insufficient — prefer vanilla first).

**Spec:** `docs/superpowers/specs/2026-10-10-travel-journal-design.md`  
**Depends on:** Phase 1 merged (renderer exists; swap fixtures for live data).  
**Product authority:** Codex §§ Photo import, Upload and capture, Data model, Import review state machine.

## Global Constraints

- Journal records separate from itinerary schema v1; link by `trip_id` / optional `city_id`.
- Never silently assign trip city centre as capture position.
- Modification date ≠ capture date; preserve raw metadata + provenance.
- Upload complete only after server verification; originals not in GitHub or base64 in JSON.
- Distinct UI states: Saved on this device / Uploading / Backed up.
- JPEG/PNG first; HEIC only after real iPhone verification (kit `hub-heic.js`).
- Initial limits (advertise only after infra proves them): 100 files/batch, 50MB/image; concurrent inspect=2, upload=2.
- Capture sheet: opaque dialog, Photos/Voice/Text ≥48px; R4 docked Save/Cancel; visual-viewport helper; dirty check on Back/Escape/backdrop.
- Deleted means gone — use shared liveness helpers from the start for write paths.
- `npm run pre-pr-check` before PR updates.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/travel/src/journal/types.ts` | Expand to full v1 write model |
| `netlify/functions/_shared/travel-journal-schema.mjs` | Validate journal documents |
| `netlify/functions/_shared/travel-journal-repository.mjs` | GitHub CRUD `data/travel/journals/{id}.json` |
| `netlify/functions/_shared/travel-journal-r2.mjs` | Namespaced presign PUT/GET/HEAD; key helpers |
| `netlify/functions/travel-journal.mjs` | GET/PATCH journal by trip id + if_version |
| `netlify/functions/travel-journal-media-sign.mjs` | POST sign upload; POST verify complete |
| `netlify/functions/travel-journal-media.mjs` | Authenticated GET derivative/original redirect or proxy |
| `apps/travel/src/api/journal.ts` | Client API wrappers |
| `apps/travel/src/journal/exif-worker.ts` + `exif-worker-entry.ts` | Worker: orientation, capture time, GPS, hash |
| `apps/travel/src/journal/import-group.ts` | Propose legs/days/moments (45min / 250m defaults) |
| `apps/travel/src/journal/import-review.ts` | FSM: selected→…→complete/failed/cancelled |
| `apps/travel/src/journal/upload-queue.ts` | Idempotent upload with stable operation ids |
| `apps/travel/src/journal/drafts.ts` | IndexedDB drafts (500ms idle + blur) |
| `apps/travel/src/journal/capture-sheet.ts` | Add moment Photos/Voice/Text |
| `apps/travel/src/journal/import-sheet.ts` | Import review UI |
| `apps/travel/src/journal/render-journal.ts` | Load live journal; empty states |
| `tests/unit/travel-journal-schema.test.js` | Schema + grouping + FSM |
| `apps/travel/tests/unit/import-group.test.ts` | Grouping edge fixtures |
| `apps/travel/tests/unit/import-review.test.ts` | Per-file states |

---

### Task 1: Journal schema + repository

**Files:**
- Create: `netlify/functions/_shared/travel-journal-schema.mjs`
- Create: `netlify/functions/_shared/travel-journal-repository.mjs`
- Create: `tests/unit/travel-journal-schema.test.js`

**Interfaces:**
- Produces: `validateJournal(doc) → journal`, `emptyJournal(tripId)`, `makeJournalId()` / moment/media/leg ids with prefixes `jrn_`, `leg_`, `mom_`, `med_`, `trn_`, `op_`
- Produces: `createTravelJournalRepository({ env })` with `getJournal(tripId)`, `saveJournal(journal, version, message)`, `createJournal(journal)`
- Path: `data/travel/journals/${tripId}.json`

- [ ] **Step 1: Failing schema tests** — reject missing `schema_version`, reject unknown location_source, accept minimal empty journal linked to trip_id.

- [ ] **Step 2: Implement validate + emptyJournal.**

- [ ] **Step 3: Implement repository** mirroring conflictError / SHA from `travel-repository.mjs`.

- [ ] **Step 4: Unit test conflict path with mock github client.**

- [ ] **Step 5: Commit** `feat(travel): journal schema and GitHub repository`

---

### Task 2: Journal HTTP API

**Files:**
- Create: `netlify/functions/travel-journal.mjs` (`path: '/api/travel-journal'`)
- Create: `apps/travel/src/api/journal.ts`
- Reuse: `travel-http.mjs` operator auth helpers

**Interfaces:**
- `GET /api/travel-journal?trip=` → `{ journal, version }` (404 → client may create empty)
- `PUT /api/travel-journal?trip=` body `{ if_version, journal }` or `{ create: true, journal }`
- Client: `getJournal`, `saveJournal`, `ensureJournal(tripId)`

- [ ] **Step 1: Integration-style unit test with injected repo** (pattern from other travel function tests).

- [ ] **Step 2: Implement handler + client.**

- [ ] **Step 3: Wire renderer to `ensureJournal` when leaving fixture mode** (feature flag or always-on once API green). Keep fixture path behind `?fixture=1` for layout regression.

- [ ] **Step 4: Commit** `feat(travel): travel-journal GET/PUT API`

---

### Task 3: R2 signed upload + verify

**Files:**
- Create: `netlify/functions/_shared/travel-journal-r2.mjs`
- Create: `netlify/functions/travel-journal-media-sign.mjs`
- Create: `netlify/functions/travel-journal-media.mjs`
- Test: `tests/unit/travel-journal-r2.test.js`

**Interfaces:**
- Key: `travel/journal/{tripId}/{mediaId}/original`
- Derivatives: `…/der/320.jpg`, `…/der/960.jpg`, `…/der/1600.jpg` (server or client-produced then signed PUT)
- `POST /api/travel-journal-media-sign` `{ trip_id, media_id, content_type, byte_size, checksum, purpose: 'original'|'derivative' }` → `{ upload_url, headers, key, expires_in }`
- Reject >50MB once configured; return clear error before advertising UI limit
- `POST /api/travel-journal-media-sign` action `verify` — HEAD object, compare size/checksum, mark media `upload_state: 'backed_up'` only on success
- `GET /api/travel-journal-media?id=&trip=` — session-gated redirect/presign GET (no public URLs yet)

Reuse `knowledgeR2Config` pattern; **do not** write under Knowledge attachment key prefixes.

- [ ] **Step 1: Tests for key minting + unbound 503.**

- [ ] **Step 2: Implement presign + verify.**

- [ ] **Step 3: Client `signJournalMedia` + `verifyJournalMedia` + XHR/fetch PUT to upload_url with progress.**

- [ ] **Step 4: Commit** `feat(travel): R2 signed journal media upload`

---

### Task 4: EXIF worker + grouping proposals

**Files:**
- Create: `apps/travel/src/journal/exif-worker.ts` (or `.js` worker module)
- Create: `apps/travel/src/journal/import-group.ts`
- Add dependency only after licence pin: `exifr` in `apps/travel/package.json`
- Tests: `apps/travel/tests/unit/import-group.test.ts` with synthetic metadata fixtures (no real GPS invention)

**Interfaces:**
- `inspectFile(file): Promise<InspectedPhoto>` — checksum (SHA-256 of bytes), mime, width/height, orientation-applied bitmap dims, `capture_wall_time`, `offset_minutes?`, `coordinates?`, `raw_metadata`, `provenance`
- `proposeGroups(photos, ctx: { legs, thresholds: { minutes: 45, metres: 250 } }): ProposedMoment[]`
- Unlocated photos: time-group only; `location_source` absent/unlocated — never city centre
- Instant stored only when timezone evidence supports it; else wall time + flag `needs_timezone`

Mandatory fixtures: orientation, timezone offsets, midnight span, zero coordinates, missing capture date, EXIF-stripped share.

- [ ] **Step 1: Failing grouping tests** (45min/250m merge; no GPS → no invented coords; duplicate checksum flagged).

- [ ] **Step 2: Implement worker + grouping.**

- [ ] **Step 3: Commit** `feat(travel): journal photo inspect and import grouping`

---

### Task 5: Import review FSM + UI

**Files:**
- Create: `apps/travel/src/journal/import-review.ts`
- Create: `apps/travel/src/journal/import-sheet.ts`
- Create: `apps/travel/src/journal/upload-queue.ts`
- Test: `apps/travel/tests/unit/import-review.test.ts`

**Interfaces:**
- File states: `selected | inspecting | proposed | uploading | partially_complete | complete | cancelled | failed`
- Batch must not collapse partial success into all-failed or all-saved
- `Split group` / `Merge groups` before upload
- Persist proposal + retained blobs in IDB; on reload resume or ask reselect by checksum
- Duplicate exact checksum: skip with explanation, do not resurrect deleted without restore
- Header: photo count + proposed moment count; disclosure for duplicates / needs date

- [ ] **Step 1: FSM unit tests for partial failure + retry idempotency (stable operation id).**

- [ ] **Step 2: Implement queue (concurrency 2) + sheet with R4 footer.**

- [ ] **Step 3: Wire More → Import photos.**

- [ ] **Step 4: Manual Scenario B subset (or synthetic 10-file batch with 1 forced fail).**

- [ ] **Step 5: Commit** `feat(travel): journal import review and upload queue`

---

### Task 6: Capture sheet — Photos, Voice, Text

**Files:**
- Create: `apps/travel/src/journal/capture-sheet.ts`
- Create: `apps/travel/src/journal/drafts.ts`
- Reuse: morphing dialog / overlays, `visual-viewport.js`, `hub-capture` patterns, `offerTimedUndo` not required until delete

**Interfaces:**
- `openCaptureSheet({ tripId, legId, localDate, journal, version, onSaved })`
- Photos → system picker → can hand off to import pipeline for multi
- Text: textarea + date + optional time/place; Save enabled when nonempty text or attachment
- Voice: mic permission only after Record; Stop → playback / Retake / Attach; one recording at a time later enforced in Phase 3 reading view
- Drafts: IDB write after 500ms idle + blur; UI “Draft saved on this device” only after successful write
- Dirty discard: Keep editing / Discard; never silent save on backdrop

- [ ] **Step 1: Unit test Save enablement rules.**

- [ ] **Step 2: Implement sheet + drafts.**

- [ ] **Step 3: Measure R4 at 390 with keyboard open (failure register R4) — Save/Cancel ≥44px (target 48px), docked, clear of home indicator.**

- [ ] **Step 4: Commit** `feat(travel): journal Add moment capture sheet`

---

### Task 7: Wire live journal load + empty states + Phase 2 acceptance

- [ ] **Step 1:** `renderJournal` loads API journal; empty trip → title + Add photos + Add moment.
- [ ] **Step 2:** Reload mid-upload → retry without duplicate media rows.
- [ ] **Step 3:** Acceptance: Codex checks 1 (import mixed), 5 (reload failed upload) as far as Phase 2 scope.
- [ ] **Step 4:** Screenshots 390/1440 import review + capture keyboard.
- [ ] **Step 5:** `npm run pre-pr-check` + commit/PR.

**Phase 2 done when:** owner can import JPEG/PNG, add text/voice moments, see Saved/Uploading/Backed up correctly, reload without data loss or duplicate originals, itinerary JSON untouched.

---

## Spec coverage (Phase 2)

| Codex item | Task |
| --- | --- |
| Data model + separate store | 1–2 |
| R2 private media | 3 |
| Photo import / EXIF / grouping | 4–5 |
| Upload states / retry | 5 |
| Capture Photos/Voice/Text | 6 |
| Drafts / empty states | 6–7 |
| Edit/split/Trash/maps/export/share | Phase 3–4 |
