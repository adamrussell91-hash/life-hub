# Travel journal — implementation design

**Date:** 2026-10-10  
**Status:** approved for phased implementation planning  
**Product authority:** [`docs/future-build-ideas/travel-journal-spec-plan.md`](../../future-build-ideas/travel-journal-spec-plan.md) (Codex spec + Binding UI revision 2)  
**This document:** how we build that product inside life-hub. It does not weaken or replace Codex. Where this design and Codex conflict, Codex wins unless Adam revises Codex.

## Outcome

A continuous personal travel journal inside the existing Travel app: destination legs, local days, moments (photos, writing, voice), straight map connections, cultural leg artwork, private by default, portable export. It must feel like travel memories, not a planning dashboard.

## Locked product decisions (from Codex)

1. Extend Travel in life-hub — no separate site, repo, session, or design system.
2. Trip → legs → days → moments hierarchy.
3. Photo metadata suggests chronology/place; no continuous background tracking.
4. Straight lines between photo stops (connections, not observed routes).
5. Every user field/media editable and deletable; manual edits survive reimport.
6. Private by default; sharing explicit.
7. Ordinary media files + documented formats; essential access survives library replacement.
8. Cultural artwork per leg; shared kit chrome/typography unchanged.
9. Hosted infrastructure only; optional downloads never required local Mac files.

## Architecture (Adam approved 2026-10-10)

### Separate journal store + trip links

| Concern | Store | Notes |
| --- | --- | --- |
| Itinerary (bookings, cities, days meta) | Existing `data/travel/trips/{id}.json` in life-hub-data via GitHub | Schema version 1 unchanged |
| Journal records | Separate `data/travel/journals/{tripId}.json` (same GitHub/life-hub-data adapter pattern as trips) | Linked by `trip_id`, optional `city_id`, optional itinerary item ids on transitions |
| Journal binaries | Private R2 under namespace `travel/journal/{tripId}/…` | Short-lived signed PUT/GET; reuse Knowledge R2 env (`R2_*`) and the presign pattern in `netlify/functions/_shared/knowledge-r2.mjs` — do **not** put journal originals in Netlify Blobs or GitHub |
| Safe check-in photos (existing) | Netlify Blobs `life-hub-travel` via `travel-photo` | Leave alone; not the journal media path |

Do not nest journal media or moment arrays inside itinerary trip JSON. Do not delete or mutate bookings when deleting journal legs/moments.

### App surface

- Reuse Travel shell (`apps/travel/src/shell/shell.ts`), kit CSS, four-slot mobile nav, More sheet.
- Journal is a view of an existing trip — proposed route `#/trip/:tripId/journal` with optional `?m=:momentId` or `#…/journal/:momentId` (confirm and lock in Phase 1 against `router.ts`).
- Existing itinerary trip page remains for bookings; journal does not replace it.
- Browser Back closes overlays before leaving the journal; no duplicate history spam.

### Reuse map (inspect before inventing)

| Need | Existing |
| --- | --- |
| Auth / session | Travel gate + umbrella session |
| Optimistic concurrency | `if_version` / blob SHA on trip writes — mirror for journal |
| MapLibre | Travel day/world maps + kit `hub-places-map.js` (bundle MapLibre; do not rely on CDN for essential journal reading) |
| Capture / morph / undo / dates / viewport | `hub-capture`, morphing popover, `hub-feedback` (`offerTimedUndo`), `format-display-date`, `visual-viewport` |
| Search | Kit MiniSearch vendor only if Travel’s own search is insufficient |
| HEIC | Kit `hub-heic.js` — verify on real iPhone before advertising |
| Share | Extend `travel-share` / public paths **after** journal ACL tests (Phase 4) |
| Liveness | `record-liveness.mjs` / Travel equivalents — deleted gone from UI, search, AI, export, share |
| Offline today | SW + banner only — Phase 4 adds IndexedDB queues; audit durability first |

### Candidate libraries (Codex; pin + licence when adopted)

exifr (EXIF), MiniSearch (if needed), Dexie (IndexedDB queues), optional Wavesurfer / Annotorious / pdf-lib / PMTiles later. No transcription service is essential. Bundle essential viewer deps in the app build.

## Data model (v1 journal schema)

Authoritative field list follows Codex Data model. Implementation types live in `apps/travel/src/journal/types.ts` (Phase 2). Summary:

- **Journal:** `id`, `schema_version: 1`, `trip_id`, ordered `leg_ids`, `revision`, lifecycle, preferences (`pattern_off`, last viewed moment).
- **Leg:** `id`, `trip_id`, optional `city_id`, destination, IANA timezone, dates, `pattern_id`, cover media id, order, lifecycle.
- **Moment:** `id`, `leg_id`, local date, capture-time evidence, optional instant, effective timezone, place, coordinates, location source (`exif` \| `inferred` \| `manual`), text, ordered media ids, display order, revision, lifecycle.
- **Media:** `id`, original R2 key, derivative keys, MIME, size, checksum, raw metadata, caption, crop, duration, transcript ref, upload state, lifecycle.
- **Transition:** adjacent leg ids, mode, optional itinerary item id, editable display overrides (journal override ≠ itinerary mutation).
- **Operation:** id, target id, base revision, action, payload, acknowledgement (offline/conflict).

Provenance: EXIF, inferred, and manual recorded separately. Corrected pin location overrides EXIF for display/routing; originals preserved.

## Delivery: five phase plans

| Phase | Plan file | Ships | Does not ship |
| --- | --- | --- | --- |
| 1 | `docs/superpowers/plans/2026-10-10-travel-journal-phase-1-foundation.md` | Fixture renderer, KL/Istanbul patterns, sizing matrix, route stub, 390+desktop evidence | Live schema, uploads, EXIF, edit, maps WebGL, export |
| 2 | `…phase-2-capture-import.md` | Schema API, R2 signed upload, EXIF worker, import review FSM, photo/text/voice persist | Full split/merge/Trash, sharing, export |
| 3 | `…phase-3-owner-control.md` | Edit, pin, order, split, merge, move, delete, undo, Trash/restore, straight connections, transitions | Offline queues, portable export, public share |
| 4 | `…phase-4-reliability-export.md` | Durable queues, conflicts, search, lazy media, export/restore, then sharing after privacy checks | Optional enrichment |
| 5 | `…phase-5-optional-enrichment.md` | Annotations, souvenirs, Corey, transcripts, print — only when asked | Never block Phases 1–4 |

Execute in order. Each phase ends with Codex acceptance checks that apply to that phase, plus `npm run pre-pr-check` before any life-hub PR that touches runtime.

## UI contract (binding)

Implement Binding UI revision 2 from the Codex doc verbatim: geometry matrix, toolbar, moment layouts, pattern placement, motion table, capture sheet, R4 docked actions (≥44px / prefer 48px as Codex capture sheet), pattern-off, reduced motion, no second shell, no navy mockup bar.

Kit tokens only. Do not edit shared kit files to make the journal “look different.”

## Acceptance

Codex acceptance checks 1–12 and Scenarios A–E remain the product bar. Implementation PRs need real 390×844 and 1440×900 screenshots (and Phase 3+ recordings) — generated mockups do not count.

## Out of scope until Phase 5 / later

Photo annotations, souvenir collections, Corey’s perspective, auto transcripts, printable editions, panoramas, immersive exhibitions, film generation.
