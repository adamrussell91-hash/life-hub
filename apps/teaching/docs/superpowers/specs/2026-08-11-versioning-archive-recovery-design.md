# Teaching Hub — Versioning, Archive & Recovery Design

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Slice:** Core recovery — lesson/unit/class-homepage version history + archive/trash/restore/permanent delete (Phase 14 core)  
**Parent roadmap:** `docs/BUILD.md` Next up; Phase 14 in `docs/specs/09_IMPLEMENTATION_PLAN.md`  
**Depends on:** Existing Blob keys + `StatusSchema` (`active` \| `archived` \| `trashed`); lesson draft/publish; unit + class PATCH; AI accept path; media/templates status patches; teacher auth; mock-api parity  
**Not this slice:** JSON export; Backup Now / GitHub portable backup; op-log / delta history; versioning every autosave; Media file-byte versioning; scheduled-lesson versioning; student-facing history UI

## Goal

Teachers can recover from accidental deletion and major editing mistakes without fear. Version history covers Lessons, Units, and Class homepages. Archive and Trash are distinct. Permanent delete is explicit and dependency-aware. Student published content does not change until the teacher republishes.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Slice scope | Core recovery only (no export / GitHub backup) |
| Versioned objects | Lessons, Units, Class homepages |
| Storage approach | Separate version blobs + small per-parent index (not embedded arrays) |
| Checkpoint triggers | Meaningful only: manual checkpoint, publish, restore, AI accept, meaningful unit/homepage PATCH — **not** plain autosave |
| Retention | Newest **10** versions per parent; prune older blobs + index entries |
| Restore vs publish | Restore rewrites **draft/source only**; published student snapshot unchanged until republish |
| Lifecycle objects | Lessons, Units, Classes, Media, Lesson/Unit templates, Compositions |
| Soft delete | Trash with `trashed_at` + `previous_status` (+ optional `trash_reason`) |
| Archive vs trash | Archive = hide from normal nav, still valid/searchable/reusable; Trash = soft-delete, recoverable |
| Permanent delete | Allowed only when `trashed`; blocked when inbound references exist (no force-break in v1) |
| Dependency checks | Warn on trash; **block** permanent delete while refs remain |

## Architecture

```
Meaningful write / publish / AI accept / manual checkpoint
        │
        ▼
 writeCheckpoint(kind, parentId, snapshot, reason)
        │
        ├─ versions/{kind}/{id}/{revision}   (full snapshot)
        └─ versions/{kind}/{id}/_index       (metadata, max 10)

Restore:
  GET version → validate → checkpoint current (reason: restore)
  → write historical snapshot to live draft/source
  → published keys untouched

Lifecycle:
  PATCH status archived | trashed | active
  Trash list → restore-from-trash | permanent DELETE (deps clear)
```

### Shared server module

One module used by Netlify functions and mirrored in `scripts/mock-api.ts`:

- `writeCheckpoint` / `pruneToLimit(10)`
- `listVersions` / `getVersion`
- `restoreVersion` (draft/source only + new restore checkpoint)
- `transitionStatus` (archive / trash / unarchive / restore-from-trash)
- `scanDependencies` / `permanentDelete` (trashed + no inbound refs; purge version blobs)

### Blob keys

| Purpose | Key |
|---------|-----|
| Live lesson draft | `lessons/{id}` (existing) |
| Published lesson | `published/lessons/{id}` (existing) |
| Live unit | `units/{id}` (existing) |
| Live class | `classes/{id}` (existing) |
| Version snapshot | `versions/{kind}/{id}/{revision}` |
| Version index | `versions/{kind}/{id}/_index` |

`kind` ∈ `lesson` \| `unit` \| `class_homepage`.

Add helpers in `src/storage/keys.ts` (and blobs re-exports) for version keys.

## Version records

```json
{
  "id": "version_lesson_aotfw_008_017",
  "type": "lesson_version",
  "parent_id": "lesson_aotfw_008",
  "kind": "lesson",
  "revision": 17,
  "created_at": "2026-08-11T07:00:00.000Z",
  "reason": "publish",
  "label": null,
  "snapshot": {}
}
```

**Index entry** (no full snapshot): `{ revision, created_at, reason, label?, id }`  
**Index doc:** `{ parent_id, kind, latest_revision, entries: IndexEntry[] }` (newest-first or sorted; prune keeps ≤10).

### Snapshots by kind

| Kind | Snapshot contents |
|------|-------------------|
| `lesson` | Full draft lesson JSON |
| `unit` | Full unit JSON (metadata, `lesson_ids`, optional blocks/cover) |
| `class_homepage` | `{ homepage }` only — not schedule, `active_unit_ids`, or class identity fields |

### Reasons

`save` \| `publish` \| `restore` \| `ai_accepted` \| `manual_checkpoint`

### Triggers

| Event | Kind | Reason |
|-------|------|--------|
| `POST …/versions` (manual) | lesson / unit / class_homepage | `manual_checkpoint` (optional `label`) |
| Publish lesson succeeds | lesson | `publish` — checkpoint **pre-publish draft** before/as part of publish write |
| AI proposal Accept patches draft | lesson | `ai_accepted` — via optional `checkpoint_reason` on the lesson PUT that persists the accept, or an immediate `POST …/versions` from the editor after Accept (prefer PUT flag so the server cannot be skipped) |
| Restore from history succeeds | matching kind | `restore` — checkpoint the **current** live draft/source **before** overwrite, then apply the historical snapshot |
| Meaningful unit PATCH | unit | `save` — title, description, cover, `lesson_ids`, blocks (not no-op / status-only) |
| Meaningful class homepage PATCH | class_homepage | `save` — when `homepage` regions change |

Autosave / routine lesson PUT without the above semantics does **not** create a version. Teachers use **Save checkpoint** when they want an explicit save-point between publishes/AI accepts.

### Restore semantics

1. Load version snapshot; validate with the appropriate Zod schema.
2. Checkpoint the **current** live draft/source with `reason: restore` (preserves the state being overwritten).
3. Write the historical snapshot into live draft/source:
   - Lesson → replace draft lesson
   - Unit → replace unit document
   - Class homepage → patch class `homepage` only
4. Do **not** update `published/lessons/{id}` or other student snapshots.
5. Later history remains; prune still applies to the newest 10 after the pre-restore checkpoint.

### Preview

Teacher-only read of a historical snapshot using existing read-only/student-style renderers where practical (lesson blocks, unit plan blocks, homepage regions). Preview never mutates storage.

## Lifecycle fields

Extend CommonFields / entity schemas as needed:

| Field | When |
|-------|------|
| `status` | Already `active` \| `archived` \| `trashed` |
| `trashed_at` | Set on trash; cleared on restore-from-trash |
| `previous_status` | Status before trash (`active` or `archived`); restore returns here |
| `trash_reason` | Optional string |

### Behaviour matrix

| Action | Result |
|--------|--------|
| Archive | `status → archived`; leave default active lists; remain searchable and reference-valid |
| Trash | Record `previous_status`, `trashed_at`; `status → trashed`; hide from normal nav; keep relationships |
| Restore from trash | `status → previous_status` (fallback `active`); clear trash fields |
| Permanent delete | Only if `trashed` **and** dependency scan reports no inbound refs; delete live key(s), related published lesson key if lesson, and all `versions/{kind}/{id}/*` |

Permanent delete does **not** cascade-delete Media file bytes when deleting a Lesson, or delete Lessons when deleting a Unit. Callers must clear or re-home references first (or trash children separately).

### Dependency scan (v1)

Block permanent delete (and surface warnings on trash) when any of:

| Target | Inbound refs |
|--------|----------------|
| Unit | Class `active_unit_ids` / `current_unit_id`; subject `unit_ids` may remain but class links are the hard gate |
| Lesson | Unit `lesson_ids`; any `scheduled_lessons` pointing at the lesson |
| Class | Any `scheduled_lessons` for that class |
| Media | Referenced by `media_id` (or equivalent) in draft lessons, published lessons, unit blocks, class homepage blocks, compositions |
| Lesson/Unit template or composition | No hard inbound in v1 beyond “in use” if linked templates later require it — for now allow delete when trashed; linked-template slice may tighten |

Trash is always allowed (relationships stay intact while trashed). The UI **preflights** via dependency scan and shows a warning confirm when inbound refs exist; the trash PATCH itself succeeds. Permanent delete with remaining deps returns **409** with structured `dependencies[]` and does not delete (no force flag in v1). Optional `GET /api/{…}/:id/dependencies` supports preflight for both flows.

## APIs

All require teacher auth. Mock parity required.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/lessons/:id/versions` | List index (no snapshots) |
| `GET` | `/api/lessons/:id/versions/:revision` | Full version for preview |
| `POST` | `/api/lessons/:id/versions` | Manual checkpoint `{ label? }` |
| `POST` | `/api/lessons/:id/versions/:revision/restore` | Restore draft |
| `GET` | `/api/units/:id/versions` | List |
| `GET` | `/api/units/:id/versions/:revision` | Preview |
| `POST` | `/api/units/:id/versions` | Manual checkpoint |
| `POST` | `/api/units/:id/versions/:revision/restore` | Restore unit |
| `GET` | `/api/classes/:id/versions` | List class_homepage versions |
| `GET` | `/api/classes/:id/versions/:revision` | Preview homepage snapshot |
| `POST` | `/api/classes/:id/versions` | Manual homepage checkpoint |
| `POST` | `/api/classes/:id/versions/:revision/restore` | Restore `homepage` only |
| `PATCH` | Existing entity endpoints | Accept `status` + trash fields where missing today |
| `GET` | `/api/trash` | Trashed summaries across lessons, units, classes, media, templates, compositions |
| `POST` | `/api/{lessons\|units\|classes\|media\|…}/:id/restore-from-trash` | Soft restore |
| `DELETE` | `/api/{…}/:id` | Permanent delete if trashed and deps clear |

Prefer thin Netlify function files that call the shared recovery module (same pattern as other `_shared` helpers).

### Errors

| Code | When |
|------|------|
| 404 | Parent or revision missing |
| 400 | Invalid status transition / invalid body / snapshot fails validation on restore |
| 409 | Permanent delete while dependencies remain; conflict restoring a missing/invalid parent state |
| 401 | Unauthenticated |

## Teacher UI

1. **History panel** on lesson editor, unit editing surfaces, and class homepage editor:
   - List: time, reason badge, optional label
   - Preview (read-only)
   - Restore with confirm copy: restores editable content only; students unchanged until republish
   - **Save checkpoint** control
2. **Archive / Trash** actions on list rows for Lessons, Units, Classes, Resources (media), Templates — extend existing Archive buttons; add Trash where missing.
3. **Trash** area in the teacher shell (dedicated rail item or section): type filter, Restore, Permanent delete (disabled with explanation while deps remain; show dependency list).
4. **Default lists** show `active` only; archived via explicit filter and search; trashed only in Trash.

Clinical Glass patterns: reuse existing confirm/dialog and list-row action styles; no new visual system.

## Client modules (suggested)

| Area | Location |
|------|----------|
| Version API client | `src/teacher/version-api.ts` (or `src/teacher/recovery/`) |
| History panel UI | `src/teacher/history-panel.ts` |
| Trash section | `src/teacher/sections/trash.ts` |
| Dependency confirm helpers | shared small module used by list actions |
| Schema | `src/schemas/version.ts` + trash fields on common/entity schemas |
| Keys | `src/storage/keys.ts` |

Wire AI Accept and Publish paths to call server-side checkpoint hooks (prefer server after successful write so clients cannot skip).

## Testing

Align with `docs/specs/10_ACCEPTANCE_TESTS.md` AT VERSION scenarios:

- Manual / publish / AI-accept checkpoints created; 11th prunes to 10
- Preview + restore → draft matches historical snapshot; published unchanged
- Restore adds `restore` checkpoint; prior versions still listed (within cap)
- Trash + restore Lesson preserves id and relationships
- Archive Class leaves current-year workflow; still findable via search/archive filter
- Trash/delete referenced Unit/Lesson/Media surfaces dependencies; permanent delete blocked while refs exist
- Permanent delete of clear trashed object removes live + version keys
- Mock-api parity for all new routes

## Exit criteria

Phase 14 **core** is done when:

- Accidental major lesson/unit/homepage edits are recoverable via History
- Accidental soft-deletes are recoverable via Trash
- Permanent delete cannot silently break schedules/classes/media refs
- Teachers need not fear experimenting with Lessons
- JSON export / Backup Now shipped later; GitHub backup still deferred

## Follow-ups (not this slice)

- Lesson / Unit / full-archive JSON export — shipped
- Backup Now (JSON download) — shipped; GitHub portable backup still later
- Optional “Restore and republish” confirm
- Force-delete with explicit cascade policy
- Richer archive browser / year rollover UX
- Autosave-diff checkpoints if retention pressure stays low in production
