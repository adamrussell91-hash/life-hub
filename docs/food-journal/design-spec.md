# Food Journal rebuild specification

Owner: Adam Russell. Author: Codex. Date: 13 October 2026.

## Scope and acceptance contract

The preceding chat retrieval returned the agreed features and seven phase count, but omitted individual phase scopes. This document reconstructs seven implementation scopes from those requirements. It is the implementation contract, not a claim to reproduce the unavailable phase wording.

Food Journal lives inside Life Hub, reachable through the Life rail, mobile More sheet, command search and Nutrition. It records visits and dishes separately from calorie logs. An outing with ten tapas dishes occupies one collapsed visit card. Custom Menu selects food first, then offers Recipe or Restaurant. Photo and menu capture proposes editable fields. No model proposal writes until the person saves.

## Existing design and code reuse

Canonical implementation rules are root AGENTS.md and packages/design-kit/AGENTS.md. The monorepo kit has newer mobile and chrome rules than the standalone kit. The monorepo version wins for this build.

Reuse the existing Life shell, rail, More sheet, sign in, API_BASE_URL session transport, shared formatDisplayDate, .hub-card, .hub-row, .hub-search, .hub-pills, .hub-field, .hub-input, .hub-select, .hub-textarea, .btn, .confirm-card, hub-list repeatable editor, hub feedback, focus trap and morphing dialog. Use Life overlay, Inter, navy titles, Wave focus, existing palette and spacing tokens. No new palette or CSS custom properties. The shell and sign in stay intact. All new UI copy uses Life Hub terminology.

Reuse the authenticated travel operator wrapper, GitHub client and SHA conflict handling for journal storage. Store private journal JSON in the existing runtime data repository, never the public source repository. Reuse existing R2 configuration and signing helpers for private photos. Reuse the Anthropic client with server web search for recipe research. Package the already installed exifr module as a lazy browser dependency. Use EXIF before compression, then strip metadata from uploaded image bytes.

## Layout, sizes and motion

Desktop 1440: full canvas width. Toolbar wraps with 8px token gaps. Card grid uses minmax(0, 1fr), three columns where space permits, two under 1100, one under 720. Card content has min-width:0. Covers use 4:3 aspect ratio and object-fit:cover. No decorative empty media blocks for dishes without a photo. Visit title is text-lg/21px, dish title text-md/17px, metadata text-xs/12px. Primary title remains the existing page header. Collapsed visit cards show cover, title, venue, date, dish count and a preview of up to two dishes, capped to two lines, then expand remaining dishes in place. Cover height follows the 4:3 ratio of the current grid column. Titles and collapsed previews each cap at two lines. Custom Menu notes cap at three lines, with full text in Edit. Content sizes to content with no fixed card height.

Phone 390 and 320: one column, no sideways scrolling, controls wrap. Forms use text-md/17px to prevent Safari zoom. Dialogs fill the available width, sit at the bottom, cap at 92dvh, and split header, independently scrolling fields, and docked actions. Action buttons share row width, are at least 44px tall, and footer includes safe-area-inset-bottom. Actions stay visible after long notes and scroll. The sheet uses the existing --vv-height and --vv-offset-top contract from the attached Life visual viewport helper, so iPhone keyboard shrink is handled even when layout viewport height stays unchanged. Focus stays inside the dialog, Escape closes, and focus returns to trigger.

Motion uses existing morphing dialog spring. List expansion is a native details disclosure. No infinite decorative motion. Reduced motion disables the shared animation. Save feedback appears only after a successful server write.

## Phase 1. Foundation and private storage

Model: journal schema_version=1, visits[], recipes[]. Visit contains stable id, title, date, venue{name,address,lat?,lon?}, notes, menu_text, dishes[], status, optional source_id and import media references. Dish contains id, title, cuisine, meal_type, tags[], rating null or 1..5, notes, photos[]. Recipe contains id, dish_id, title, servings, ingredients[], steps[], sources[], optional research candidates and shortlist.

GET returns live records and SHA version. PUT requires if_version, verifies latest SHA, validates all fields, and preserves tombstones. A competing write returns 409. No unsafe overwrite/retry. Validation limits: 100 dishes per visit, 20 photos per dish, 10,000 visits, 4 MB total, bounded text and unique identifiers. Deleted records never reach normal lists or AI prompts. Import source ids remain reserved after deletion.

## Phase 2. Visit cards and editing

Card view is default. Add visit and edit use the shared repeatable list editor for dishes, including drag, keyboard reorder, hold Delete and Undo. Each dish has independent title, meal type, cuisine, tags, notes, photos and rating. A visit groups venue/date/menu. Title is required. Save holds editor open on failure. Unsaved draft persists per device, with Resume and Discard actions. Ratings support five labelled one touch buttons plus clear rating. Repeated taps cannot overlap writes. Expand visit opens nested dishes. Delete visit requires an explicit confirmation. Restaurant opens original venue/date/menu and shared View on Map.

## Phase 3. Intelligent capture

Choose up to 30 dish photos and a separate menu photo. Decode HEIC through the existing heic-to dependency, loaded only for HEIC selection. Batch extraction into requests of at most six images and 3.5 million encoded characters, retaining menu evidence in each batch. Read EXIF date, offset and GPS before compression. Unknown metadata stays unknown. GPS suggests nearby previously visited venues and place search biased to photo coordinates, with explicit selection. Never silently infer a restaurant from the current device location. Upload compressed JPEG to private R2 with signed PUT. Authenticated read returns a short lived signed URL. The browser renews remote URLs before their five minute lifetime and retries an expired lazy image once. Menu image is sent for OCR only and is not retained by default. Persist plain menu text on visit, linked through its venue. Extraction returns dish candidates, title, cuisine, meal type, tags and optional printed prices, not invented nutrition. Display extracted information in editable fields. Extraction failure leaves manual entry and existing fields usable. Multiple candidates merge by normalized dish title without replacing existing personal notes or ratings. Uploaded dishes show thumbnails, and saving the visit establishes durable references.

## Phase 4. Custom Menu

A second view uses previous dishes, not invented recommendations. Custom Menu search matches dish, cuisine, tags and venue. Journal search also matches saved menu text. Filters: meal type, cuisine, indicator/tag and minimum rating. Options derive from saved records. No restriction to eating at home or restaurants before choosing a dish. Each result shows title prominently, photo if available, cuisine, rating and original venue. Selecting a dish offers Recipe and Restaurant. Restaurant shows the original visit and venue, plus a shared Google Maps search for the selected dish and an optional area. Dishes first eaten at home still offer a usable eating out search. No restaurant availability or menu claim is invented. Search updates without replacing focused controls. Empty filters have a clear reset action.

## Phase 5. Research and cooking cards

Recipe opens an existing saved cooking card. Otherwise research the selected dish using live server web search. Gather ten distinct real recipe sources, evaluate them, shortlist three, then create a custom cooking recipe. Preserve evidence: source title/HTTPS URL, candidate rationale and shortlist. Never fabricate source URLs or present model estimates as measured nutrition. The resulting proposal includes servings, ingredient quantities and ordered steps. Review and edit, then Save recipe to associate with the selected dish. Source links open safely. Cooking card includes adjustable portions and per step checklist, with personal edits stored only through explicit Save. Research failure is retriable and never creates an empty recipe. Recipe generation uses bounded provider calls and authenticated rate limits.

## Phase 6. Day One migration

Accept Day One JSON export. Parse locally, preview entries and select which belong in Food Journal before saving. Default every available entry selected so a dedicated Food Journal export imports with one click; Select all / Select none remain available for mixed diaries. Preserve entry uuid as source_id, date, complete text, location, tags and media filename references. Convert UTC creation timestamps using the entry timeZone so breakfast and late night entries keep their original calendar day. Date only values remain exact. Missing zones use Australia/Sydney and record the owner default assumption in import metadata. Invalid zones are skipped for review. Never turn all diary entries into food records without an Import confirm. Imported tags and titles remain editable after import. Duplicate UUIDs are skipped, including deleted sources. The JSON export references media rather than embedding binaries. Photos are optional: text-only import is the default path; matching exported photo files by filename remains available through the same private pipeline. Report unmatched photo counts honestly without listing hundreds of filenames. Reject malformed or oversize files without writes. Save selected entries as one versioned write. Offline/agent path: `npm run import:dayone-food -- "/path/to/Food Journal.json" --out <life-hub-data journal.json> --write`.

## Phase 7. Reliability and acceptance

Backup JSON embeds photo bytes with private references and retains complete journal structure, source ids, menus, ratings, recipes, source evidence and media references. Download photo bytes through authenticated signing and embed base64 in the backup, with a 100 MB photo budget. Signed URLs are never retained in the backup. Restore validates schema, previews counts and merges identifiers without duplication. Restore cannot resurrect tombstones. No fabricated success offline. Keep pending editor drafts locally, show failed write clearly, retry deliberately after reconnection. On SHA conflict keep draft and require reload/review. Clear private in-memory state and revoke object URLs on sign out. Loading, empty and error are accessible status lines with Retry. Liveness, XSS, malformed imports, conflicts and menu filters have tests. At least one browser check uses the real main/controller route, not only isolated rendering.

## Failure register checks

L1: grid shares right edge and has no overflow at 1440/390/320. L2: no fixed blank card height. R4: long visit and recipe editors, import review and delete confirmation have docked actions at 390 and 320, controls at least 16px. W1: all API calls pass through existing absolute authenticated transport. W2: real app route mounts Food Journal. W4: exifr is loaded only on photo selection. W5/W6: versioned writes and capture merge preserve personal changes. P3/P5: every in scope acceptance scenario is tested and incomplete work is reported honestly. M1: idle page has no repeated decorative motion.
