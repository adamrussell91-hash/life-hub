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

Desktop retains the locked 15rem rail. At the shared phone breakpoint retain the warm translucent white four slot bottom navigation and More sheet. Reuse current Travel navigation configuration. Add is a content control, never a fifth navigation slot.

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


## Binding UI and interaction contract, revision 2

This section overrides vague visual guidance above. Values tied to kit classes come from actual checked in CSS. Generated images are reference mood only. No implementation is accepted from screenshot resemblance alone.

### Authority and explicit corrections

Use the current shared CSS unchanged. The actual mobile.css bar is warm translucent white with muted icons and a pale blue selected surface. It is NOT navy. Its glyphs are 20px, not the desktop rail's 18px. Preserve its four destinations as currently configured by Travel. Never copy the mockup's navy bar or white plus on orange.

Kit chrome has a 42px desktop title, 32px phone title, 13px desktop eyebrow and 11px phone eyebrow. Use those rules. Refresh-only utilities remain on the title row.

A product component may use responsive aspect ratios, grid tracks, measured offsets and layout constraints below. These are layout geometry, not permission to introduce a new token palette or type scale. Reuse kit tokens for padding, gaps, radii and elevation. Do not change shared kit files to make the journal look different.

### Route and reading structure

Use the existing app router and shell. Proposed journal route: existing trip route plus a journal view, with an optional moment identifier. Confirm final route names from source before implementation. Browser Back closes an opened overlay before leaving the journal. Opening an overlay must not add repeated duplicate history entries.

DOM order: page header, trip toolbar, leg section, day section, moment articles, optional connection fragment, next moment, leg transition, next leg. Headers use a logical heading hierarchy. Do not create a second app shell.

There is one main reading scroll. No scroll container around each leg, day, map preview or photo group. Editors and media viewers have their own internal scroll only while open. Keep stable IDs and restore the nearest visible moment with its relative offset after mutations or new imports.

Persist the last viewed moment per trip locally. First visit during travel goes to the leg and day matching the trip timezone and available itinerary evidence. If today has no entry, show a short empty day with Add moment, followed by earlier memories. Never fabricate a moment. Outside travel, open the first chapter on first visit. A saved deep link overrides these defaults.

### Geometry and sizing matrix

| Element | Phone, viewport below 720px | Desktop, viewport above 720px |
| --- | --- | --- |
| Shell | Existing shared mobile shell | Existing locked 15rem rail |
| Canvas inset | space-4, 16px on each side | Shared canvas space-8 top, space-6 sides |
| Story column | Available width, no minimum forcing overflow | Centred in remaining canvas, maximum 48rem |
| At 390px | Canvas content 358px | Not applicable |
| Timeline gutter | 16px, followed by 8px gap | 24px, followed by 16px gap |
| Moment content at 390px | 334px after gutter and gap | Remaining story width |
| Leg title | text-lg, 21px, weight 700 | text-xl, 32px, weight 700 |
| Day date | text-sm, 13px, weight 600 | Same |
| Moment metadata | text-sm, 13px, leading-normal | Same |
| Reflection | text-md, 17px, leading-normal | Same, measure capped at 68ch |
| Moment separation | space-6, 24px | space-8, 32px |
| Gap within moment | space-2, 8px | space-2, 8px |
| Photo frame radius | radius-xs, 6px | Same |
| Leg header spacing | space-8 above, space-4 below | space-12 above, space-6 below |
| Audio control row | Minimum 48px | Minimum 48px |
| Map preview | Content width, 96px tall | Content width, 128px tall |
| Transition | Auto height, minimum 96px | Auto height, minimum 128px |

The timeline is a 2px Wave line centred within its gutter. Each moment has an 8px node aligned with the first metadata baseline. Use decorative SVG, pointer-events none, aria-hidden true. The thread must never cross photographs, text or buttons. Day gaps retain continuity. Leg transitions introduce a mode glyph node. Do not claim the visual thread represents measured movement.

All measurements are CSS logical pixels. At increased text size, fixed minima expand. Do not set fixed article height. Test 320px, 390px, 430px, 768px and 1440px with no horizontal page overflow. The exact 720px boundary follows current kit media queries.

### Header, toolbar and capture placement

The page header scrolls naturally and is not collapsed or hidden by journal code. Refresh stays available on return to top. Use the shared header markup.

Below it, place the trip title at left and a Chapter button at right. This toolbar has a minimum 48px height, 8px gap and wraps into two rows when labels no longer fit. No text truncation hides the chosen trip. Chapter opens a searchable list of legs and days with 48px rows. Selecting one closes the list, scrolls to the section and moves focus to its heading.

One Add moment button belongs to the toolbar. On small widths it goes into a second toolbar row, not a floating navigation slot. Each day heading also has a shared icon button labelled Add moment to this day, with a 44px touch box. Do not render an orange plus beside every photo or repeat capture actions in every article.

More actions includes Import photos, Search journal, Pattern appearance, Export and Trash. Keep these reachable in no more than two taps from the journal. Never replace global More destinations with journal actions.

### Moment arrangement and media layouts

Reading order within a moment: media group, metadata row, optional writing, optional audio, optional attached object. Metadata includes local time and place. Ellipsis sits at the trailing edge with a 44px hit box. On text-only moments, metadata comes first.

Long place names wrap. Metadata grid uses minmax(0,1fr) and a fixed action hit box. Dates remain dd/mm/yy. Times use 24 hour HH:mm. Unknown time is omitted, not replaced with midnight. Unknown place reads Location not added only in the editor. Reading view omits the missing field.

One photo uses the full moment width, aspect ratio 3:2 in the story. Default object-fit cover with stored crop position. Portrait photos use a 4:5 contain frame when the crop would discard most of the original. The editor lets the user choose Fit or Fill and reposition the crop. Never distort an image.

Two photos use equal columns separated by space-2. Each tile is square. At 390px, 334px content yields two 163px tiles. At 320px or increased text scale, tiles remain images; labels live below, not squeezed inside. Three photos use a full width lead plus two squares. Four or more show one lead and two squares with a labelled View all N photos control. Do not download hidden originals.

Do not overlap, rotate or tear photographs. No Polaroid simulation, sticker shadows or floating decorative caption strips in the default journal. A caption is readable text below its image in the viewer; the story shows the moment's reflection once, not repeated per photograph.

Story text initially shows up to six lines using a labelled Read more disclosure. Expansion stays in place without moving the reader to another screen. Expanded content is never truncated in export or editing. Links open safely with a clear destination. Rendering user text must not execute HTML.

Photo tap opens a viewer using the shared morph primitive. Viewer shows the entire image using contain, never the story crop only. Next and Previous have explicit buttons. Swiping is optional, not the only method. Captions and media controls have opaque surfaces. Pinch zoom is confined to the viewer. Closing restores focus and exact reading position.

### Pattern artwork placement

Patterns are background assets associated with the leg, not a wallpaper on body, header, navigation or dialogs. Two consecutive legs use separate clipped decorative layers. Kuala Lumpur ends at its transition. Istanbul begins at its section.

At phone size use a single sparse motif cluster in the leg header's trailing 40 percent and narrow motifs along the outer margin. At desktop allow motifs outside the story column within the canvas. Never paint inside photographs, waveform controls, map previews or form fields.

Use Wave, sand and muted kit tokens through SVG currentColor or CSS colour mapping. Initial artwork opacity is 0.06 to 0.10, with a hard maximum of 0.12. If contrast fails, lower artwork opacity or mask it, rather than darkening all text.

Place a solid paper backing beneath text clusters, with a soft mask beyond the backing, so motifs disappear under glyphs. No enormous flowers above the app title. No texture downloads from a remote service. Pattern off is saved as a journal preference and leaves all spacing unchanged.

At a transition the old pattern ends, whitespace separates the chapters, then the new pattern starts. No full page crossfade driven by scroll. A manual Pattern preview affects only the targeted leg. Store pattern version so a future asset replacement does not silently redesign old journals.

### Connection fragments and leg transitions

Render at most one map preview per day by default, after the first located moment or before a meaningful change to another cluster. Additional connections remain visible in expanded map view. Zero located moments means no map. One located moment means one labelled stop, no connection.

Preview uses a saved lightweight static map or a simple schematic. Do not mount a separate WebGL map for every moment. One expanded interactive map instance is created on demand and destroyed or reused on close. Attribution remains visible and readable when map data requires it.

The full preview is an accessible button with label Open photo stops for this day. Keyboard Enter opens it. Expanded map defaults to cooperative gestures, so scrolling the page does not become map zoom. Full screen map explicitly enables map interaction.

Transition contains date, transport mode, departure label, straight connector and arrival label. Labels wrap rather than collide. Airport codes appear only if verified in linked itinerary data; otherwise use destination names. A transition appears once. Do not show both a world map connection and an identical ticket graphic stacked together. Price, booking code and baggage stay behind View journey details.

A corrected transition label is a journal override, not an itinerary mutation. Editing a booking requires entering the existing itinerary workflow.

### Motion contract

Use motion.css and shared helpers. No new animation framework. No autonomous looping aircraft, moving wallpaper, floating photos, ambient particle effects, scroll hijacking or autoplay audio.

| Trigger | Behaviour | Exact constraint |
| --- | --- | --- |
| First visible content load | Reveal newly mounted section heading and first moment | Shared 420ms duration, 8px lift, shared ease |
| Small imported group appears | Stagger the first four new visible moments | 45ms stagger, no delay beyond 135ms |
| Ordinary scrolling | Content stays visible | No repeated entrance animation |
| Chapter jump | Native smooth scroll only on explicit selection | Reduced motion uses immediate scroll; user input interrupts |
| Open editor or photo | Shared spring FLIP | Stiffness 200, damping 24, mass 1; shared maximum 900ms |
| Close overlay | Return toward trigger if trigger still exists | Missing trigger closes cleanly without travel across page |
| Note or field popover | Shared morphing popover | Existing 250ms ease-out behaviour |
| Saved map coordinate changes | Recompute line immediately, reveal updated preview | Shared 420ms opacity, no spinning or camera flight |
| Delete accepted | Remove article and preserve reading anchor | Shared in-place morph where feasible; no theatrical collapse |
| Undo accepted | Restore at original order | One shared reveal; restore focus |
| Upload progress | Update actual progress | No decorative fake progress or number count up |
| Leg transition enters viewport | Reveal its mode icon and labels once | Shared reveal, no motion across route |
| Audio playing | Playhead follows actual currentTime | No waveform movement when paused |

On reduced motion all nonessential transforms, fades, smooth scrolling and spring effects are disabled. Content appears immediately. Audio progress remains factual. Do not initially hide content unless motion JS is confirmed active. A failed script must leave the entire journal visible.

Only animate opacity and transforms for entry effects. Do not animate layout height across dozens of photos. Remove will-change after completion. Route geometry and media processing run outside the animation frame critical path. No animation delays a Save or changes a persisted value.

### Capture sheet and realistic phone use

Add opens an opaque shared dialog with title Add moment, three choices Photos, Voice and Text, each at least 48px tall. Context shows target leg and day and allows changing them.

Text opens a labelled textarea with date, optional time and optional place. Do not require title, coordinates or a recording before save. Save becomes enabled after nonempty text or an accepted attachment. Cancel retains a recoverable local draft after an explicit Keep draft choice.

Voice requests microphone permission only after Record. Denial shows Record unavailable and keeps Photos and Text working. Recording view shows elapsed time, Stop and Cancel. Stop opens playback, Retake and Attach. Attachment is not final server backup. A phone lock or interruption preserves successfully captured chunks where possible and labels an incomplete recording. No promise of background recording.

Photo selection is user initiated. Do not request access to the entire phone library or claim passive photo synchronisation. Import offers originals from the system picker. Metadata missing from a selected file is a normal case.

Editor phone layout is header, independently scrolling body, docked Cancel and Save footer. Use the shared visual viewport inset helper. The journal dialog covers the app navigation while open; do not stack its footer atop a live global nav. Restore nav on close. Keep actions within the visible viewport above the keyboard, with safe area padding. No doubled keyboard inset.

Each button minimum 48px height using space-12, 8px gap and equal columns. Footer opaque paper, 16px inset, top divider. At 390px the two buttons fit without clipping. Desktop uses the shared dialog width cap of 32rem and internal footer. Dialog max height follows shared CSS and the visual viewport.

Focus the editor heading on open, not the textarea, unless Text was explicitly selected. Escape, close, backdrop and browser Back funnel through the same dirty check. Dirty dialog offers Keep editing and Discard changes. Do not silently save on backdrop dismissal. Save validation focuses the first invalid field with a specific message. Failed save leaves the entered content intact.

### Edit, reorder, split and merge screens

Moment ellipsis opens Edit moment, Reorder, Split, Merge, Move and Delete. Disable unavailable actions with a short explanation. Split requires at least two attachments or explicit selection of divisible text blocks. Do not split arbitrary prose automatically.

Edit body: photo selection and order, writing, audio attachments, date and time, leg and day, place, then advanced crop and metadata details. Basic editing never exposes storage keys or provenance JSON. Place offers Search, Choose on map and Remove location.

Pin editor has an interactive map, 44px zoom controls, a fixed centre crosshair and Use this location. Dragging the map previews coordinates. Commit happens only on Use this location then Save. Cancel returns to the prior coordinates. Provide numeric latitude and longitude under an advanced disclosure with valid bounds and finite number checks.

Reorder opens an ordered list with thumbnail, time and short place. Provide Move up and Move down buttons as well as pointer drag handles. Save shows changed order. A manual order badge is quiet and optional; Reset to time order is explicit and preserves original times.

Split opens selectable attachment rows. User names or accepts two resulting moments and confirms time and place for each. Preserve every attachment exactly once. Empty resulting moments are forbidden.

Merge opens candidates from the same day by default. Cross day selection explicitly previews the resulting day. Show combined attachment order, writing paragraphs, recordings and location choice before Merge. Preserve distinct recordings. Never overwrite one reflection with another.

Move requires leg then day selection. Default timezone handling preserves the actual instant when known and recomputes displayed local time, with a preview. If only wall time is known, ask whether to keep that time or enter a corrected one. Do not invent an instant.

Delete moment gives timed undo for 10 seconds and permanent access via Trash. Deleting a day, leg or trip requires an explicit impact summary confirmation. Toast does not cover Save, navigation or captions and uses the shared feedback helper. Restore is idempotent. Permanent deletion requires a separate action in Trash.

### Import review state machine

States: selected, inspecting, proposed, uploading, partially complete, complete, cancelled and failed. Each file has its own state. Do not represent a partially successful batch as wholly failed or wholly saved.

Inspection operates with two files concurrently by default. Network upload uses two concurrent originals. Release decoded bitmap memory after derivative production. Large batches render rows progressively.

Review header states photo count and proposed moment count. A compact disclosure lists duplicates and files needing date, leg or location review. Default location gaps do not block import. Missing date requires a date choice or the current selected day explicitly marked Assigned by you.

Users edit grouping before upload through Split group and Merge groups. Save the reviewed proposal locally so app reload does not require reselecting files still available in local storage. If original blobs were not retained, ask to reselect the missing files and match by checksum.

Include maximum supported file size and batch size in the implementation configuration and display them in the picker help. Initial target is 100 files per batch and 50MB per image, subject to verified infrastructure limits. Larger selections are split into batches rather than crashing or discarding the selection. Do not advertise those limits until upload signing and storage actually accept them.

Orientation, timezone offsets, photos spanning midnight, zero coordinate values, missing capture dates and EXIF removed by sharing are mandatory fixtures. Local metadata parsing works without a geocoding service. Place lookup failure retains coordinates and an editable label.

### Audio, media failures and empty states

Only one recording plays at once. Starting another pauses the first. Leaving the trip pauses playback. Open map or editor pauses playback unless the editor is specifically editing that recording. Never autoplay after import or chapter jump.

Audio row contains 48px play button, flexible waveform or plain progress slider and 13px tabular duration. Waveform missing does not prevent playback. Error presents Retry and Download recording when authorised. Transcripts are editable derived text, separate from original audio.

Missing image retains its known aspect ratio, filename or caption and Retry, avoiding layout jumps. Failed original processing keeps original downloadable and offers Replace display image. Unsupported HEIC shows a clear conversion action or export guidance; never a blank successful photo tile.

Empty trip: title and Add photos plus Add moment, no invented travel media. Empty leg: destination heading and Add to this leg. Text only: normal story typography, no empty image rectangle. Offline: quiet status row with pending count, not a blocking modal. Search with no results retains query and offers clear search.

### Performance and persistence boundaries

Store image width and height with derivatives so layout is reserved before download. Use responsive srcset sizes appropriate to 390px screens and high density displays. Thumbnail targets 320px long edge, story derivatives 960px and 1600px, originals unchanged. Select actual derivative based on rendered width and device pixel ratio.

Lazy load below viewport, prefetch the next two moments, and never fetch all originals on page open. Use native image loading and decoding. Mount no more than one live WebGL map. Paginate moments in groups of 30 with stable anchors, a Load earlier or Load more fallback and no inaccessible endless trap.

Target a cached journal shell visible within one second on a contemporary phone. Target interactive reading before images complete. Measure actual import responsiveness, layout shift and memory on iPhone Safari. Do not call a performance target passed without measurement. Metadata work must not block tap response.

Drafts persist locally after 500ms idle and on input blur. UI reports Draft saved on this device only after successful IndexedDB write. Server backed up status follows acknowledgement plus media verification. A crash between media upload and record commit creates a retryable attachment, not an invisible orphan forever. Cleanup never removes assets belonging to pending valid uploads.

Refresh does not discard drafts, rerecord audio, move scroll to top or replace the whole app with a spinner. It reconciles current records and pending operations, with conflicts surfaced.

### Concrete walkthroughs and acceptance evidence

Scenario A: Adam takes 18 photos across three Istanbul stops. Import proposes three moments. Two images lack GPS and remain in their time group without invented pins. Adam changes one place and adds a recording. Reload preserves corrections. The day displays integrated photos and writing, one small route preview and one editable continuous sequence.

Scenario B: 65 Kuala Lumpur photos include a duplicate and a portrait. Duplicate is skipped with explanation. Portrait shows without distortion. Two failed uploads remain retryable. Adam closes and reopens the app. Uploaded media stays committed and pending files are clearly identified.

Scenario C: Adam scrolls from final Kuala Lumpur moment to flight transition and first Istanbul moment. Background artwork changes only at chapter boundary. There is one transition. Header and navigation remain kit components. No date, booking or route is invented.

Scenario D: Adam edits a long reflection on a 390px iPhone with keyboard open. Save and Cancel remain visible. Back prompts about unsaved changes. After Save, the journal returns to the same moment without resetting scroll. Larger text does not cause horizontal scrolling.

Scenario E: Adam deletes a middle stop, then undoes. Routes recalculate twice. No deleted copy appears in search or shared pages. Restore does not revive an attachment deleted before the parent.

Implementation PR evidence must include actual rendered screenshots at 390x844 and 1440x900, keyboard open editing, both leg patterns, long place name, text only moment, portrait media, import partial failure and reduced motion. Include a short screen recording of chapter jump, editor morph, deletion and undo. Generated images do not satisfy this requirement.

Pass criteria include no clipped controls, no screenshot only custom navbar, no hidden content from disabled animation JS, no repeated reveals during ordinary scroll, no autonomous sound, no external network requirement for exported basic reading and no alteration of unrelated itinerary records.

## Revised execution checklist

1. Extract kit tokens and actual current Travel shell before UI coding. Record reused component paths and current API/storage adapters in implementation notes.
2. Build renderer and chapter artwork using fixture records. Validate the sizing matrix and realistic phone viewport before attaching storage.
3. Implement metadata, review, media and draft state machines with meaningful failure tests.
4. Implement editing, split, merge, movement, liveness and version conflict behaviour.
5. Add shared motion only after the static interface works. Verify reduced motion and animation JS failure.
6. Implement map preview, transition links, search, offline reconciliation and complete export.
7. Complete the scenario walkthroughs with real browser evidence, then required repository checks.
8. Optional enhancements must meet this same contract. No feature is finished solely because its happy path renders.
