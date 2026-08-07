# Notion Import Schema Repair

**Date:** 2026-08-07  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push. Data changes live in `life-hub-data` (separate repo).  
**Slice:** Import / `invalid_event` repair (approach A — in-place patch + importer guards).

## Problem

Home load reports many `invalid_event` paths. A full scan of `life-hub-data` (2026-08-07) found ~348 valid event files and ~375 rejected paths. Real failure buckets:

1. **253** nutrition files with spaces in the filename (`… 2.md`, etc.) — Mac duplicate names; each is **byte-identical** to a canonical sibling → safe to delete.
2. **~109** body/fitness events with `schema_version: 1` but **missing `time`**, and many also using a **wrong Sydney offset** (`+10:00` during AEDT when `+11:00` is required).
3. **~19** completed strength workouts with **empty `exercises`** (and often the same time/offset issues).
4. **13** files under `data/fitness/templates/` — templates, not events; noise in a naïve path walk, not part of this repair’s content rewrite.

Root cause: Notion importers wrote incomplete or DST-incorrect common metadata, and a nutrition import/copy produced spaced duplicate filenames.

## Out of scope

- Sodium / food-library prompt accuracy (slice D — separate uncommitted work)
- Re-import from Notion exports (approach B — optional later)
- Changing event validation rules to accept broken imports
- Moving or rewriting fitness templates
- Netlify deploy (client/app code may get a tiny repair script only; data repo is the payload)

## Decisions

### 1. Approach A — repair existing data + fix importers

Adam choice: **A**.

1. Add `scripts/repair-notion-import.mjs` targeting `--out` / default `../life-hub-data`.
2. Support `--dry-run` (default or required first pass in the plan) that prints counts without writing.
3. Apply mutations only with an explicit `--apply` (or equivalent) flag.

### 2. Duplicate spaced filenames

- Match basenames like `… N.md` (space + digits before `.md`).
- If a canonical sibling exists (`foo.md` or `foo-N.md`) and content is **byte-identical**, delete the spaced file.
- If content differs (should be zero today): leave in place and report — do not overwrite or merge silently.

### 3. Missing `time` and timestamps

- If `time` is missing: set **`12:00`** for body types (`weight`, `composition`, `measurements`); **`07:00`** for workouts.
- Rebuild `created_at` / `updated_at` as Sydney-local stamps for `date` + `time` using the same offset logic as nutrition import (`getSydneyTimestamp` / try `+10:00` and `+11:00` until the stamp round-trips). Prefer sharing a small helper rather than duplicating ad hoc `T12:00:00+10:00` strings in importers.
- Do not invent new `id`s or change domain fields beyond status (below).

### 4. Empty completed strength workouts

- If `status === 'completed'`, strength-like `session_kind`, and `exercises` is empty (or every exercise has empty `sets` such that validation still fails): set **`status: 'planned'`**.
- Keep title, notes, and any partial exercise shells. Do **not** invent placeholder sets.

### 5. Importer guards (prevent recurrence)

- **`scripts/import-notion-history.mjs`:** always emit `time`; use shared Sydney stamp helper for `created_at` / `updated_at`.
- **`scripts/import-nutrition-notion.mjs`:** slot collisions already use `meal-2` style; ensure write paths never contain spaces; refuse or rewrite any spaced slug.
- Optional: document one-line runbook in the repair script header for re-running dry-run → apply on `life-hub-data`.

### 6. Verification

After `--apply` on `life-hub-data`:

- Re-scan with the same parse/validate path the app uses (`parseEventDocument` / canonical paths).
- Success criteria: **0** remaining failures from buckets 1–3 above (spaced identical dupes gone; body/fitness schema_v1 events parse; no completed empty-strength invalids).
- Templates may still be non-canonical if walked; they must not appear in the app’s event load list as user-facing `invalid_event`s for real logs (if the app already skips non-event paths, no change; if not, only fix loader exclusion if a scan shows templates in Home warnings — prefer not expanding scope unless needed).

## Non-goals / explicit non-actions

- No force-push; commits in `life-hub-data` only when Adam asks.
- No deletion of non-identical spaced files without reporting.
- No changing meal macro requirements for historical nutrition files.

## Implementation notes

- Repair script lives in the **life-hub** app repo; it mutates the **life-hub-data** tree.
- Unit-test repair helpers where pure (slug/sibling resolution, stamp rebuild, status demotion rules) with fixture files under `tests/`.
- Keep the script idempotent: second `--apply` is a no-op when data is already clean.
