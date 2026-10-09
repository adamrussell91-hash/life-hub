# Travel journal specification and build plan

Author: Codex, written from Adam's requirements and design feedback on 09/10/26.
Status: ready for implementation planning. This document authorises no production deployment. No runtime code changes accompany this document.

## Product outcome

A continuous personal travel journal assembled from imported photographs, with destination chapters, daily moments, short writing, recordings and straight map connections. Capture stays fast. Photos, maps and audio belong within one story. The journal must feel like travel memories rather than a planning dashboard.

The approved visual direction is the final restrained mobile concept with cultural background motifs. Generated mockups express direction, not exact CSS, geographical truth or verified bookings. Implement the actual design kit rather than reproducing image generation errors.

## Locked decisions

1. Extend the existing Travel app inside life-hub. No separate website, repository, session or design system.
2. One trip contains destination legs, local days and moments.
3. Photo capture metadata suggests chronology and places. No continuous background tracking requirement.
4. Straight lines connect located stops in order. They represent connections, never an observed walking or driving route.
5. Every user authored field and media attachment is editable and deletable. Manual changes survive subsequent imports.
6. All journal material starts private. Sharing is explicit.
7. Use ordinary media files and documented data formats. Essential access must survive replacement of specialist libraries.
8. Cultural artwork changes by leg. Shared controls and typography stay consistent.
9. The live product uses existing hosted infrastructure. Downloaded preservation copies are optional exports, never required local Mac files.

## Experience and visual specification

### Continuous trip

Open a trip at the latest viewed moment, or today's chapter on first use during travel. Show the shared title row, chapter jump control and a continuous scroll of legs and days. Deep links identify a trip and moment. Preserve scroll position after editing.

Each leg starts with its destination name and dates. Each day has a quiet local date marker. Moments combine photographs, place and time, writing and optional audio. Use full width photographs or a simple two image grid. An image tap opens a larger viewer with captions and keyboard navigation.

Map fragments appear at meaningful changes of place, not after every photograph. Tap a fragment or place to expand the map. A borderless leg transition joins departure and arrival chapters with transport mode and endpoint labels. Link to existing itinerary details on demand, without putting booking administration into the reading flow.

### Destination artwork

Kuala Lumpur: Malaysian batik inspired botanical motifs.
Istanbul: Ottoman Iznik inspired tulip, carnation and stem motifs.
Other destinations receive researched, locally appropriate original or licensed artwork. Avoid pretending one motif represents an entire culture.

Use lightweight bundled SVG artwork, a documented source and licence, and existing palette tokens. Motifs sit in margins and spare whitespace, fading beneath text and controls. Decorative SVG is hidden from accessibility tools. Provide pattern off and a neutral fallback. Leg pattern changes at the chapter boundary, not midway through a moment.

### Shared kit

Read packages/design-kit/AGENTS.md, MOBILE.md, RAIL.md, ICONS.md, tokens.css, overlays.css and docs/CURSOR-UI-FAILURES.md before implementation. Read the current Travel app instructions and root CLAUDE.md too.

Inter weights 400, 500, 600 and 700 only. Warm white and navy with Wave focus and High Sea decisive accents. Orange fills use dark text. Use kit spacing, radii, shadows, pills, buttons and icons. No new palette or decorative font.

Desktop retains the locked 15rem rail. Below 720px retain the shared four slot bottom navigation and More sheet. Reuse current Travel navigation configuration. Add is a content control, never a fifth navigation slot.

Refresh is a faint icon at the title row's top right. No hub marks. All displayed dates use the shared dd/mm/yy formatter.

Reuse shared capture, inline edit, morphing dialogs, feedback and timed undo helpers where suitable. Editing sheets have docked actions at least 44px tall, clear of navigation, keyboard and safe area. Capture and long pages reserve bottom clearance. No decorative overlap obscures controls.

## Core features and behaviours

### Photo import

Choose original files in a batch. Support JPEG and PNG initially, including images without metadata. Verify HEIC handling on a real iPhone before advertising support. Preserve originals even when a display derivative is needed.

Read capture time, available offset and GPS in a worker. Apply image orientation for display. A file's modification date is not its capture date. Preserve raw metadata and its provenance.

A preview proposes leg, local day and moment grouping. Default grouping proposal: consecutive photos within 45 minutes and 250 metres when both coordinates exist. These are adjustable starting thresholds, not facts about a visit. Photos without GPS use time grouping only and receive an unlocated state. Never silently assign the trip city centre as an actual capture position.

Store an instant only when timezone evidence supports one. Otherwise retain the original wall time and ask for a leg timezone or correction. Airport boundaries, midnight and timezone changes need explicit handling.

Hash file bytes to detect exact duplicates. Reimport does not duplicate existing originals, overwrite edits or resurrect deleted media without an explicit restore. A review step commits the proposed moments and displays upload progress.

### Upload and capture

Add opens Photos, Voice and Text using shared capture patterns. Manual moments need only a date and some content. Place is optional.

Upload originals directly to private object storage using short lived signed requests. Record a media attachment as complete only after server verification. Produce appropriately sized thumbnails and display derivatives. Do not put binaries in the public code repo or base64 encode them into trip JSON.

Support partial batch retry, cancellation and per file failure. Use stable upload and operation identifiers so retries are idempotent. Show Saved on this device, Uploading and Backed up as distinct states.

Record voice only following an explicit action. Preview, retake, title or delete before attaching. Preserve the actual recording format and offer a broadly playable derivative when needed. Plain audio playback is essential. Waveforms are optional presentation.

### Editing and deletion

Edit titles, captions, text, times, dates, timezones, places, coordinates, leg assignment, day assignment, photo order, cover choice, crop and pattern choice. Crops never overwrite originals.

Dragging a pin changes the effective moment location, not original EXIF. Corrected locations take priority over inferred locations.

Split a moment by selecting media. Merge selected moments with a preview of media order, time range and location choice. Moving a moment across a day or leg updates both views atomically. Reorder within a day explicitly, with a reset to chronological order option. Route order follows the visible chosen order.

Delete media, recordings, moments, days, legs or a trip. Show the number of affected records for parent deletion and distinguish journal deletion from itinerary deletion. Deleting a journal leg never cancels or deletes a booking.

Use existing liveness helpers. Deleted records disappear from normal UI, search, AI context, exports and sharing. Only Trash and restore screens read them. Timed undo calls a real restore operation. Parent restores preserve children previously deleted independently. Permanent deletion explicitly explains loss of originals and removes derived assets once no live references remain.

### Map connections

Use the existing MapLibre integration. Located moments become stops. Keep unlocated moments visible in the story. Deduplicate repeated coordinates visually without deleting moments.

Connect stops with straight segments. Label the view as photo stops, with estimated connections explained in map detail. Break a segment across unlocated material rather than implying a complete observed journey. Handle longitude wrap for global journeys.

Deleting or moving a stop recomputes neighbouring segments. No routing API is required. Use a schematic coordinate view if map tiles fail. Export a static map or schematic plus GeoJSON coordinates.

### Search and navigation

Jump to leg or date, return to the current day, and search places, titles, captions, text, object notes and saved transcripts. Exclude deleted records. A local index is derived and rebuildable. Use MiniSearch only if existing search is insufficient.

### Offline

Queue new moments, edits and supported media locally with IndexedDB. Reuse existing offline mechanisms after auditing their actual durability. Do not claim automatic background sync on iPhone.

Retry while the app is open and online. Preserve queues across reloads. Warn before leaving with unsaved work. Handle quota failures and offer download or retry without claiming backup succeeded. Server versions detect concurrent edits. Conflicts preserve both versions and invite resolution.

## Data model

Keep journal records separate from itinerary schema version 1. Link using stable trip, city and item identifiers. Do not force media into the current booking item kinds.

Journal: id, schema version, trip id, ordered leg ids, revision, lifecycle.
Leg: id, trip id, optional city id, destination, IANA timezone, dates, pattern id, cover media id, order, lifecycle.
Moment: id, leg id, local date, capture time evidence, optional instant, effective timezone, place, coordinates, location source, text, ordered media ids, display order, revision, lifecycle.
Media: id, original storage key, derivative keys, MIME type, size, checksum, raw metadata, editable caption, crop, duration, transcript reference, upload state, lifecycle.
Transition: id, adjacent leg ids, mode, optional itinerary item id, source and editable display fields.
Operation: id, target id, base revision, action, payload and acknowledgement.

Record EXIF, inferred and manual provenance separately. Exact endpoint paths and record store selection are implementation choices after inspecting current adapters. Reuse authenticated APIs and optimistic concurrency. Store journal binaries in an appropriately namespaced private R2 location. Do not alter unrelated archive bucket permissions or private repository shape.

## Preservation and sharing

An export contains versioned JSON, readable text, ordinary HTML, original media, display derivatives, audio transcripts when available, GeoJSON, pattern artwork, licence notices and checksums. Include a basic reader without external scripts, fonts, login or paid API calls. Advanced maps remain optional.

Bundle essential viewer dependencies in the application build rather than loading from third party CDNs. Preserve dependency sources, pinned versions, build instructions and licences. Do not promise zero maintenance for twenty years.

A completed trip export must restore on another machine and remain readable with external services blocked. Hosting and storage remain replaceable adapters.

Extend existing revocable sharing only after journal access controls are tested. Select shared legs or moments explicitly. Serve authorised derivatives with embedded GPS removed. Do not leak originals, EXIF, sensitive recordings or private itinerary fields through predictable URLs. Source coordinates remain private unless deliberately shared. A revoked link loses new access. Previously downloaded copies are outside revocation.

## Implementation sequence

### 1. Foundation and realistic layout

Inspect current Travel source, auth, media signing, persistence and shared components. Build the journal renderer using invented fixtures. Verify at 390x844 and desktop with actual kit CSS. Cover two legs, several days, sparse moments, long text and many photos. No live data migration.

### 2. Working capture and import

Implement schema, private media upload, metadata extraction, duplicate detection and import review. Deliver persisted photo, text and voice moments with reload recovery and partial batch retry.

### 3. Complete owner control

Implement edit, pin movement, ordering, split, merge, deletion, undo, Trash and restore. Add straight connections and itinerary linked leg transitions. Ensure manual changes survive reimport.

### 4. Reliability and portable copies

Implement durable queues, version conflicts, search, lazy media loading, export and restoration. Test storage failure and network interruption. Sharing follows privacy checks, not before.

### 5. Optional enrichment

Add photo annotations, souvenir collections, Corey's separate perspective, transcripts and printable editions. Keep ordinary photo, text and audio access for every enhancement. Panoramas, immersive exhibitions and film generation are later options, never prerequisites.

## Candidate reusable code

Exifr, MIT: https://github.com/MikeKovarik/exifr
MiniSearch, MIT: https://github.com/lucaong/minisearch
Dexie core, Apache 2.0: https://github.com/dexie/Dexie.js
Wavesurfer, BSD: https://github.com/katspaugh/wavesurfer.js
Annotorious, BSD: https://github.com/annotorious/annotorious
PDF Lib, MIT: https://github.com/Hopding/pdf-lib
PMTiles mapping files: https://docs.protomaps.com/pmtiles/maplibre

Reuse only where needed. Verify the licence for the exact pinned version, preserve notices and include models or data where a feature requires them. No transcription service is essential.

## Acceptance checks

1. Import mixed original photos with GPS, missing GPS, missing timezone and exact duplicates. Verify day and leg assignment without invented locations.
2. Edit a place, time and order, then reimport. Manual values remain intact.
3. Delete a middle stop. Visible neighbouring connections update. Restore reconstructs the correct order.
4. Split, merge and move moments across legs without lost or duplicated media.
5. Reload during a failed upload. Retry without duplicate records. Local only content is never labelled backed up.
6. Two edits from different sessions preserve a recoverable conflict.
7. Deleted content is absent from normal lists, search, AI context, public sharing and exports.
8. Shared links expose only selected derivatives. Revocation blocks further access.
9. Export and restore on a separate machine with external network blocked. Text, photos, audio and relationships are readable.
10. Verify 390px forms with keyboard open, long content and safe area. Save and Cancel remain tappable, no content is hidden by navigation.
11. Verify keyboard, screen reader names, contrast, reduced motion and a pattern off mode.
12. No remote font or CDN dependency is required for basic journal access.

Before any implementation PR run the root pre PR gate and relevant meaningful tests. This idea document uses the repository's docs/future-build-ideas exception and needs no runtime changes or deployment.
