# REPO MINING ROUND D — Files, Media, Capture, Maps & Device-Native Experience

**Date:** 2026-09-05  
**Scope:** Uppy · MapLibre GL JS · FilePond · PhotoSwipe · Media Chrome · browser-image-compression · discovered adjacent repos  
**Philosophy:** Creative criticality — ENABLE counts; capability chains; product workflows over package installs  
**Constraint:** Local audit + prototypes only. **No push / PR / merge / commit** (per Round D §67).  
**Prior rounds read:** Round A (`REPO_MINING_ROUND_A_UI_AGENT_INTERACTIONS.md`), Round B (`REPO_MINING_ROUND_B_CAPABILITIES.md`), Round C conclusions from concurrent agent transcript (`REPO_MINING_ROUND_C_VISUAL_INTELLIGENCE.md` not yet on `main`).

---

## Executive Summary

Life Hub already **captures** in Knowledge (voice → Whisper, photo → OCR, PDF → markdown) and **stores media** in Teaching (Netlify Blobs) and Knowledge (R2). What it does **not** do is treat the phone, clipboard, share sheet, map, gallery, and player as a coherent **ingestion + representation** surface.

Round D’s strongest finding is not “install Uppy.” It is:

> **Life Hub needs a Capture → Object → Representation system:** anything the user can drop, paste, share, speak, photograph, or locate becomes a typed hub object that can be viewed (gallery / PDF / player / map), searched, and — with ACI proof — handed to personalities.

### Strongest opportunities (preview of Top 12)

1. **Rich paste + drag/drop ingest** (mine native + tiny kit helpers) — ENABLE  
2. **Client image pipeline** (canvas compress now; browser-image-compression if needed) — ENHANCE  
3. **PhotoSwipe shared media viewer** — ENHANCE / ENABLE  
4. **Media Chrome for podcast + Teaching audio** — ENHANCE  
5. **Uppy core (headless) for multi-file Teaching/Knowledge ingestion** — ENABLE  
6. **MapLibre + place objects** (Life travel/medical → spatial diary) — ENABLE  
7. **Web Share Target + navigator.share** (PWA share-in, not offline) — ENABLE  
8. **Voice capture beyond Knowledge** (Life/Tasks/agents) — ENABLE  
9. **PDF.js viewer + highlight→note** (Hypothesis later) — ENABLE  
10. **Annotorious Teaching image regions** — ENABLE  
11. **Agent multimodal attachments with ACI provenance** — ENABLE  
12. **wavesurfer Record + timestamped notes** — ENABLE  

### What Round D deliberately does **not** do

- Offline-first / SW sync / CRDTs (out of scope)  
- Universal DAM / media backend rewrite  
- React migration for Uppy headless hooks  
- Replacing Teaching Google Drive picker or Knowledge R2 capture kernel  
- Rejecting high-upside ideas solely because they cost medium effort  

### Dependencies worth adding **soon** (not all at once)

| Package | Why |
|---------|-----|
| `photoswipe` | Shared touch gallery |
| `media-chrome` | Design-owned A/V controls |
| `@uppy/core` + `@uppy/aws-s3` (or xhr) | Multi-file queue against existing R2/Blobs — **custom UI**, not Dashboard look |
| `maplibre-gl` (route-lazy) | Place / trip / agent map payloads |
| `browser-image-compression` *or* keep kit canvas helper | Phone photo size |

FilePond: **mine patterns / PARK as dep** — Uppy covers complex; native+kit covers simple.

---

## Current Life Hub Files/Media Baseline

### Two real upload stacks

| Hub | Mechanism | Object shape |
|-----|-----------|--------------|
| **Knowledge** | Presign → R2 PUT → `page.attachments[]` | `{ id, kind, r2_key, filename, content_type, label?, source_path? }` |
| **Teaching** | Multipart → Netlify Blobs `media_files/{id}` | `{ id, type:"media", provider, media_type, mime_type?, file_name?, preview_url?, download_url?, thumbnail_url?, … }` |
| **Tasks** | Local `URL.createObjectURL` stub | Schema mirrors Teaching; **not persisted** |
| **Life** | None | Markdown/JSON in life-hub-data; no file bytes |

Knowledge attachments are **richer than a bare URL** but still thin: no size, thumbnail, extraction status, caption, tags, provenance, or derivative/original pair. Teaching has `thumbnail_url` as optional metadata with **no generator**.

### Capture that already works (Knowledge only)

`apps/knowledge/src/capture/compose.ts` + Worker `live.ts`:

- Voice: `MediaRecorder` → R2 → Whisper `@cf/openai/whisper-large-v3-turbo`  
- Photo: `<input capture="environment">` → R2 → Claude vision OCR  
- PDF: file picker → R2 → Workers AI `toMarkdown`  
- Paste: **text only** via `clipboard.readText`

Extracted text is appended as markdown on the page. Agents later see **text in body**, not raw multimodal bytes in chat.

### Viewers / players today

| Surface | Reality |
|---------|---------|
| Teaching gallery | Carousel + **single-image** lightbox (Escape/close; no swipe/zoom/captions gallery) |
| Teaching audio | Native `<audio controls>` |
| Teaching video | YouTube/Vimeo iframe only |
| Knowledge podcast | Custom player + `<audio>`; turn audio from R2; **no Media Session** |
| Knowledge attachments | Download list — **no** inline image/PDF viewer |
| PDF | Embed/card/download — **no** pdf.js annotation |

### Design-kit stubs

`hub-capture.js`: voice toggle is **label theatre** (no MediaRecorder). Paste is text-only. `view-on-map.js`: Google Maps **search embed iframe** morph dialog — address string only, no lat/lng, no MapLibre.

### Dependencies absent

No pdf.js, Uppy, FilePond, PhotoSwipe, Media Chrome, MapLibre, wavesurfer, Annotorious, image-compression, HEIC converters, RecordRTC, tesseract in app `package.json` trees.

---

## Current Capture Baseline

| Capability | Status |
|------------|--------|
| Knowledge compose capture (voice/photo/PDF/paste text) | **Live** |
| Design-kit capture chrome | Stub styling |
| Drag/drop files onto hubs | **Missing** (`dataTransfer.files` unused) |
| Clipboard images / HTML | **Missing** |
| Web Share / Share Target | **Missing** (Life has installable `manifest.webmanifest` without `share_target`) |
| Cross-hub capture sheet | **Missing** |
| Unsorted capture inbox | **Missing** |
| Document scan / perspective crop | **Missing** |
| HEIC handling | **Missing** |
| Image compression before upload | **Missing** |

---

## Current Map/Location Baseline

| Capability | Status |
|------------|--------|
| `createViewOnMap({ address })` Google embed | Live (medical visits, program venues) |
| String `location` + `location_kind` | Life medical |
| Lat/lng place objects | **Missing** |
| Trips / itineraries / travel domain | **Missing** as geo model (Round C chronology can host travel *time*, not space) |
| Geolocation API | **Unused** |
| MapLibre / Leaflet / Mapbox GL | **Absent** |
| Agent map payloads | **Absent** (Round A rejected in-chat media; Round C wants **trusted renderers** for structured viz — maps fit that pattern) |
| Tasks “maps” | Conceptual **transit diagrams**, not geography |

---

## Uppy

**Repo:** https://github.com/transloadit/uppy · MIT · **v6.0.0** (Aug 2026) · ~31k★ · very active  

### What it actually is

Not “a nicer file input.” It is an **upload state machine**: file objects, restrictions, progress, retry, preview, processing plugins, S3/tus/XHR destinations, optional remote sources (Companion), webcam, image editor, compressor.

Uppy 6: rewritten `@uppy/aws-s3` for **any S3-compatible store including Cloudflare R2**; Companion optional when using own backend; headless UI primarily via **React/Vue/Svelte hooks** — Life Hub is vanilla DOM.

### Life Hub fit

| Path | Fit |
|------|-----|
| `@uppy/core` + custom DOM listening to Uppy events | **Excellent** — design kit owns chrome |
| `@uppy/aws-s3` against Knowledge presign / R2 | **Strong** — matches existing architecture |
| `@uppy/dashboard` default skin | **Poor** — fights Cotton Glass |
| Companion + Google Drive | Teaching already has Drive picker — **don’t duplicate** |
| React headless hooks | **Reject** without React migration |

### Capability chain (Teaching)

Drop 15 files → queue + preview → caption/rename → upload to Blobs → create media records → suggest lesson blocks (PDF→embed, image→image/gallery, audio→audio).

### Capability chain (Knowledge)

Drop PDF/images → queue → compress images → R2 → existing capture extract → attachments + searchable body.

### Capability chain (Agents)

Attach file to chat → Uppy progress → store object with provenance → **provider content blocks** (not JSON-only) → ACI proof model received bytes/text.

### Classification: **B PROTOTYPE → A BUILD** for complex multi-file surfaces; **native + kit for single-file**.

**Upside: 5/5** for making Life Hub “easy to feed.”

---

## MapLibre

**Repo:** https://github.com/maplibre/maplibre-gl-js · BSD-3-Clause · **v6.7.0** · ~11.5k★ · ~20 MB unpacked — **must route-lazy load**

### Critical separation

| Layer | Choice |
|-------|--------|
| **Renderer** | MapLibre (free, open) |
| **Tiles** | OpenFreeMap (no key, attribution) *or* MapTiler/Stadia free tiers *or* Protomaps/PMTiles self-host on R2 |
| **Geocoding** | Nominatim via **proxied** Netlify Function (SSRF-safe) + `@maplibre/maplibre-gl-geocoder` adapter; Photon later |

Do **not** assume “MapLibre = free maps forever.” Public OpenFreeMap is viable for personal hubs; production SLA may later need a paid tier or PMTiles on R2.

### What becomes possible

Location as a **first-class visual dimension** (parallel to Round C’s chronology):

- Life: trip → places → photos → diary → timeline (C) → agent context  
- Knowledge: geo-tagged research notes / historical clusters (opt-in, not forced)  
- Teaching: annotated geography / excursion / literature-setting map **block**  
- Agents: emit `{ type: "map_places", places: [...] }` → trusted MapLibre renderer (Round A/C pattern)

### vs current Google embed

`view-on-map` is perfect for **one address peek**. MapLibre is for **collections, routes, agent place picks, trip overviews**. Keep both: pill for single place; MapLibre view for spatial sets.

### Classification: **B PROTOTYPE** (Life places + agent payload) → **A** when place schema exists.  
**Upside: 5/5**.

---

## FilePond

**Repo:** https://github.com/pqina/filepond · MIT · 4.32.x stable / 5.0 beta · ~16k★  

Beautiful vanilla drop UI. Advanced image/video plugins often **premium**. Opinionated look fights design kit unless heavily restyled.

### Classification: **D MINE** (idle→busy→complete animation, inline progress, graceful errors) / **F PARK as dependency**.  
Do not run FilePond + Uppy. Prefer Uppy core for complex; native drop for simple.

---

## PhotoSwipe

**Repo:** https://github.com/dimsemenov/PhotoSwipe · MIT · **v5.4.4** · ~25k★ · quiet but mature  

Teaching lightbox is Escape/close only — no swipe, pinch-zoom, multi-image nav, or caption chrome. PhotoSwipe is the smallest path to a **shared hub media viewer** for Teaching galleries, Knowledge images, Life photo memories, agent image artefacts.

### Classification: **A BUILD** on Teaching gallery first; extract to design-kit `openHubMediaViewer`.  
**Upside: 4/5**.

---

## Media Chrome

**Repo:** https://github.com/muxinc/media-chrome · MIT · **v4.19.x** · Web Components  

Composable controls over native `<audio>`/`<video>`. Life Hub skins via CSS vars — best design-ownership story of the media candidates. Natural homes: Knowledge podcast player, Teaching audio blocks, later personality voice playback. Timestamp → note is nearly free (`currentTime` + deep link).

### Classification: **A BUILD** for podcast + Teaching audio.  
**Upside: 4/5**.

---

## Browser Image Compression

**Repo:** https://github.com/Donaldcwl/browser-image-compression · MIT · **2.0.2** (2023, stale) · Web Workers  

Phone JPEGs routinely blow 20MB Knowledge limits / Teaching 10MB. Pipeline:

`capture → orient → resize → compress → upload derivative`  
(optional: keep original behind explicit toggle)

**Round D prototype:** design-kit `hub-image-pipeline.js` uses `createImageBitmap` + canvas (also strips EXIF when re-encoding). Escalate to `browser-image-compression` or Squish if quality/memory needs workers.

### Classification: **A BUILD** kit helper now; **E EXPERIMENT** Squish; dep optional.  
**Upside: 3/5** utility, **5/5** as chain enabler with camera/Uppy.

---

## Additional Repositories Discovered

| Repo | Licence | Status | Why interesting | Life Hub possibility | Class |
|------|---------|--------|-----------------|----------------------|-------|
| [annotorious/annotorious](https://github.com/annotorious/annotorious) | BSD-3 | Active 3.8.x | Image region + W3C annotations, vanilla | Teaching artwork/diagram critique | **B / E** |
| [katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | BSD-3 | Active 7.12 | Waveform + **Record** plugin | Voice UX, clip regions, Knowledge notes | **A / B** |
| [puffinsoft/jscanify](https://github.com/puffinsoft/jscanify) | MIT | Active | Doc edge detect + warp (OpenCV.js) | Phone → worksheet/receipt scan | **E** |
| [fengyuanchen/cropperjs](https://github.com/fengyuanchen/cropperjs) | MIT | Active 2.x | Crop/rotate | Post-scan / avatar / Teaching image tidy | **A** |
| [mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode) + [soldair/node-qrcode](https://github.com/soldair/node-qrcode) | Apache / MIT | Active | Scan + generate | Teaching resource QR; share codes | **B / C** |
| [hoppergee/heic-to](https://github.com/hoppergee/heic-to) | **LGPL-3** | Active | HEIC→JPEG WASM | iPhone photos | **C ENABLE LATER** (legal) |
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Apache-2 | Active | Viewer baseline | Knowledge/Teaching inline PDF | **A** |
| [hypothesis/client](https://github.com/hypothesis/client) + pdf.js-hypothes.is | BSD-ish | Active | Production PDF/HTML annotation | Highlight → Knowledge note | **C ENABLE LATER** |
| [thegruber/linkpeek](https://github.com/thegruber/linkpeek) / ogs / metascraper | MIT | Mixed | OG metadata | URL → Knowledge source card | **C** (server-side) |
| [sindresorhus/file-type](https://github.com/sindresorhus/file-type) | MIT | Active | Magic-byte sniff | Upload trust boundary | **A** |
| [maplibre/maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder) | ISC | Active | Search control | Place picker | **B** |
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2 | Active | Client OCR | Offline-ish scan text (heavy) | **C / E** |
| paste-rich / mined pattern | MIT | Tiny | Clipboard normalize | **Shipped as kit helper this round** | **A** |
| RecordRTC | MIT | Aging | MediaRecorder wrapper | Prefer native + wavesurfer | **F PARK** |
| marker.js 3 | Linkware | — | Image markup | **G REJECT** (license) |
| PSPDFKit / Apryse | Commercial | — | Feature ceiling | **G REJECT** |

**Best additional find:** **Annotorious** (Teaching) and **wavesurfer Record** (voice UX) — neither was in the original six; both unlock ENABLE-class workflows with vanilla-friendly APIs.

---

## PDF / Document Findings

Knowledge already extracts PDF → markdown. Teaching embeds PDFs. Neither offers **read → highlight → cite**.

**Near-term:** pdf.js viewer (page nav, text select, deep link `page=N`).  
**Later:** Hypothesis-style annotation → Knowledge highlight objects → agent-accessible citations (ACI: highlight id + page + quote in model context).

**Workflow value:** Drop paper → source object → highlight → Clementine cites the highlight, not a hallucinated page.

Classification: **pdf.js A**; **Hypothesis C ENABLE LATER**.

---

## Image / Camera Findings

- Camera today = file input `capture="environment"` (good enough start).  
- Missing: live preview, multi-shot, crop, document scan, HEIC, compression.  
- **jscanify + Cropper.js** = compelling “whiteboard / worksheet → Knowledge” chain.  
- **Annotorious** = Teaching visual analysis.  
- Gallery: PhotoSwipe.

Classification: compress **A**; Cropper **A**; jscanify **E**; Annotorious **B**; HEIC **C**.

---

## Audio / Voice Findings

Knowledge voice capture is real but UX-bare (no waveform, trim, or playback-before-save). Design-kit voice is fake.

**wavesurfer.js Record** + existing Whisper path = delightful mobile capture.  
**Media Chrome** = podcast/Teaching playback + rate + timestamps.  
Extend voice capture to Life (“remember that…”), Tasks (“remind me…”), agent voice messages — with **confirmation**, not silent auto-routing.

Classification: wavesurfer **A/B**; Media Chrome **A**; cross-hub voice routing **B**.

---

## Clipboard / Rich Paste Findings

Paste today: text into Knowledge compose / kit quick-paste.

**ENABLE:** paste screenshot → image capture; paste URL → link/source; paste table HTML → structured note; paste Maps URL → place.

**Prototype shipped:** `packages/design-kit/js/hub-rich-paste.js` + unit tests + `docs/demos/round-d-capture.html`.

Classification: **A BUILD** wire into Knowledge compose + Teaching canvas paste; Tasks attachments later.

---

## Share Findings

Life `manifest.webmanifest` is installable **without** `share_target`. No `navigator.share`.

**Share Target** (PWA) = Photos/Files/Safari → Life Hub capture endpoint → classify → hub. This is **not** offline architecture.

**navigator.share** = share lesson public link, Knowledge page, map place, podcast timestamp.

Classification: Share Target **B PROTOTYPE** (high mobile leverage); `navigator.share` **A** (tiny).

---

## URL Ingestion Findings

No OG preview pipeline. Teaching accepts media URLs; Knowledge paste is raw text.

**Server-side** linkpeek/ogs behind Netlify Function with SSRF guards → Knowledge source cards / Teaching link blocks. Browser-only fetch is unsafe.

Classification: **C ENABLE LATER** (security design first) — high product value.

---

## Map / Spatial Findings

See MapLibre section. Round C chronology + Round D places = **spatiotemporal diary** without forcing a mega “travel app.”

Start schema: `{ id, name, address?, lat, lng, kind, hub_refs[] }`. Geocode lazily. Keep Google pill for one-off addresses.

---

## Agent Multimodal Findings

| Path | Multimodal? |
|------|-------------|
| Life `chat.mjs` | **JSON only** — `415 unsupported_media_type` |
| Knowledge Clementine chat | Text (+ archive markdown) |
| Knowledge **capture** | Vision / Whisper / PDF — **not chat** |
| Tasks Clare | Text + tools |

Round A explicitly deferred chat attachments/media. Round D reopens them as **ENABLE**, with ACI:

1. Availability — object in storage  
2. Delivery — bytes/text in **actual** provider request  
3. Interpretation — personality instructions for attachments  
4. Behaviour — response reflects content  
5. Continuity — survives tool rounds  

Do not fake success with “attachment chip visible.” Prefer: upload → extract when useful → pass text + optional image blocks → log delivery proof in tests.

Classification: **B PROTOTYPE** after capture/ingest primitives exist; **highest ACI risk area**.

---

## Cross-Repo Combinations

| Combo | Becomes |
|-------|---------|
| Uppy + image pipeline | Phone photos survive size limits |
| Uppy + camera + Cropper | Capture → tidy → attach |
| Uppy + PDF.js | Multi-PDF Teaching resource ingest |
| Uppy + wavesurfer | Voice note with preview before upload |
| MapLibre + Round C timeline | Trip as space × time |
| MapLibre + Tool UI (Round A) | Agent place cards on trusted map |
| PhotoSwipe + Teaching galleries | Touch-native lesson media |
| PhotoSwipe + Life memories | Day/trip photo spine |
| Media Chrome + podcast | Skinned player + timestamps → notes |
| Media Chrome + personality voice | Consistent voice message playback |
| Rich paste + TipTap (Round B) | Paste HTML into `rich_text` sanely |
| Annotorious + Teaching | Artwork analysis block |
| jscanify + Knowledge capture | Document → OCR chain |
| Share Target + ingest classifier | OS share sheet → hub object |
| file-type + all uploads | MIME spoof defense |
| Ingest + MiniSearch (Round B) | Captured titles/filenames in Cmd+K |
| PDF highlights + agents | Citation-grade RAG |

**Invented combo:** **Capture Inbox + agent classify later** — dump now, Chadwick/Clementine proposes hub+type on confirm-card (Round A write discipline).

---

## Device-Native Opportunities

Camera, mic, share target, clipboard, file drag/drop, geolocation (explicit), fullscreen gallery, Media Session for podcast lock-screen controls, native file pickers. Skip Contacts API. Notifications only if product asks.

Goal: feel like a **personal operating environment**, not a brochure site — without offline-first.

---

## Mobile Opportunities

Capture is mobile-first: one-handed `+` sheet; ≤2 taps to photo/voice; progress at drop target; compression before upload; Share Target from Camera Roll; MapLibre touch; PhotoSwipe swipe.

Desktop-perfect Uppy Dashboard with terrible mobile capture = failure.

---

## Life Hub Opportunities

- Voice diary / “remember that”  
- Travel / medical **place objects** + map spine  
- Receipt/document photo → attach to day  
- Trip = map + chronology (C) + photos (PhotoSwipe)  

## Knowledge Hub Opportunities

- Rich paste / drop → source  
- PDF view + later highlight  
- Podcast Media Chrome + timestamp notes  
- URL → preview source  
- Extend capture UX (waveform, compress)  

## Tasks Hub Opportunities

- File drop → real attachment (kill blob-URL stub)  
- Speak task → confirm-card  
- Program venues already map-ready → MapLibre collection later  

## Teaching Hub Opportunities

- Multi-file resource ingest (Uppy)  
- PhotoSwipe galleries  
- Annotorious image critique  
- Map lesson block  
- QR to student resources  
- Audio via Media Chrome  

## Personality Agent Opportunities

- Multimodal in (image/PDF/audio/place/URL)  
- Multimodal out via **trusted renderers** (map_places, media_gallery, pdf_ref, audio_clip) — never raw MapLibre/ECharts config from the model (Round C grammar)  
- ACI provenance fields on every attachment  

---

## THAT WOULD BE COOL AS HELL

1. **Spatiotemporal diary** — every trip is a map + Round C timeline + PhotoSwipe memories + documents, and Chadwick can answer “what did I do in Lane Cove in May?” from structured place+time+media.  
2. **Speak once, confirm the shape** — hold Capture, talk; Life Hub proposes task vs diary vs Knowledge vs Teaching idea on a confirm-card.  
3. **PDF highlight graph** — highlights become first-class Knowledge nodes; Clementine cites quote+page; graph (Round C) shows which papers share themes.  
4. **Lesson drop alchemy** — drop a folder of PDFs/images/audio onto a lesson; blocks auto-propose; teacher confirms.  
5. **Agent returns a map, not a paragraph** — “five gastroenterologists near me” → validated `map_places` payload → MapLibre; user picks; details open.  
6. **Podcast scrub → note** — drag playhead, tap “Note here”, Knowledge page with `t=1432` deep link.  
7. **Whiteboard to unit plan** — photo whiteboard → jscanify → OCR → Teaching outline draft.  
8. **Share sheet is a door** — from Safari/Photos, “Add to Life Hub” lands in Capture Inbox; classify walking to the kettle.  
9. **Artwork critique layer** — Annotorious regions on a painting image block; students see teacher pins; export annotations.  
10. **Voice message to Chadwick** — waveform preview, send, model receives transcript **and** knows audio provenance; reply can be voice via existing TTS path.  
11. **Medical place constellation** — all visits on one MapLibre view; tap → record; density matches medical spine.  
12. **Clipboard as scanner** — paste anything; Life Hub tells you what it thinks it is before filing.  

---

## SMALL BUT BRILLIANT

1. Paste screenshot straight into Knowledge compose.  
2. Auto-resize giant phone photos before upload.  
3. Swipe Teaching gallery full-screen (PhotoSwipe).  
4. Copy podcast timestamp deep link.  
5. `navigator.share` on Teaching public lesson link.  
6. Show upload progress on the drop target (not a remote toast).  
7. Drag image onto Teaching lesson canvas → image block.  
8. Strip EXIF GPS by default on personal photos.  
9. Magic-byte `file-type` check at sign boundary.  
10. One-tap “View on Map” collection for all medical places (even before full trips).  

---

## Future-State User Journeys

### Journey 1 — Research source from phone
1. Share PDF from Files to Life Hub (Share Target).  
2. Capture Inbox previews.  
3. User chooses Knowledge.  
4. Uppy/R2 upload + extract.  
5. pdf.js opens; user highlights.  
6. Highlight → linked note.  
7. MiniSearch indexes title.  
8. Clementine cites highlight with ACI delivery proof.

### Journey 2 — Trip memory
1. Drop 40 travel photos onto a Life trip.  
2. Image pipeline compresses.  
3. Optional EXIF lat → place suggestions (privacy prompt).  
4. MapLibre shows photo cluster.  
5. Chronology (Round C) shows days.  
6. PhotoSwipe browses memories.  
7. Agent can answer place-time questions.

### Journey 3 — Teaching resource burst
1. Teacher drops 12 files on lesson.  
2. Uppy queue + captions.  
3. PDFs→embed, images→gallery, audio→Media Chrome block.  
4. Confirm-card applies block tree.  
5. QR generated for student pack.

### Journey 4 — Voice task on the walk
1. Mobile `+` → Voice.  
2. wavesurfer records.  
3. Whisper (or Knowledge worker path generalized).  
4. “Remind me to email Mary-anne” → Tasks confirm-card.  
5. Clare can later reference the task; audio kept as provenance.

### Journey 5 — Agent place pick
1. User asks Chadwick for nearby clinics.  
2. Tool returns structured places (validated).  
3. UI renders MapLibre `map_places`.  
4. User selects marker.  
5. Medical visit draft confirm-card with location fields.

---

## Architecture Implications

**Do not build a universal DAM.** Build:

1. **Ingest classifier** (kind, hub hint) — kit  
2. **Upload adapters** per existing stores (R2, Blobs) — Uppy core optional  
3. **Object metadata increments** (size, status, thumbnail, provenance) — evolve schemas carefully  
4. **Representation renderers** (gallery, pdf, audio, map) — lazy per route  
5. **Agent payload allowlist** — Round C grammar extended  

Capture Inbox can be a **thin queue of unclassified objects**, not a new product silo.

Offline: out of scope.

---

## Security / Privacy

| Risk | Mitigation |
|------|------------|
| MIME spoof | `file-type` magic bytes at sign/upload |
| Huge files | Existing size caps + client compress |
| SVG XSS | Keep SVG out of allowlist / sanitize |
| SSRF on URL previews | Server proxy allowlist + block private IPs |
| EXIF GPS | Strip by default; opt-in keep |
| Agent file exfil | Provenance + size limits + no silent send |
| Nominatim abuse | Proxy, cache, identifiable UA |
| HEIC LGPL | Legal review before `heic-to` |
| Malicious PDF | pdf.js sandbox; don’t eval; server extract already isolated in Worker |

---

## Performance

- Route-level dynamic import for MapLibre, pdf.js, PhotoSwipe, wavesurfer, Annotorious, OpenCV (jscanify).  
- Thumbnails before full images.  
- Compress before upload.  
- Podcast: Media Chrome does not require Mux hosting.  
- Do not load map stack on Tasks board or Fitness.

---

## Accessibility

- PhotoSwipe: keyboard + focus return (Teaching lightbox already restores focus — keep that contract).  
- Media Chrome: uses real media elements; verify labels.  
- MapLibre: provide list/table twin for places (Round C multi-representation).  
- Capture sheet: large targets, one-handed.  
- Don’t rely on color alone for upload error/retry.

---

## Prototypes

| Artifact | What it proves |
|----------|----------------|
| `packages/design-kit/js/hub-rich-paste.js` | Clipboard/drop classification + soft hub routing |
| `packages/design-kit/js/hub-image-pipeline.js` | Canvas compress + EXIF-strip path |
| `tests/unit/hub-rich-paste.test.js` | 7/7 pass |
| `docs/demos/round-d-capture.html` | Capture sheet + paste/drop UX |
| `docs/demos/round-d-map.html` | MapLibre + OpenFreeMap + domain place payload |
| `docs/demos/round-d-media.html` | PhotoSwipe gallery + Media Chrome + timestamp copy |

---

## Changes Made

Local only (not committed):

- Design-kit rich paste + image pipeline helpers + typings  
- Unit tests for classifier / `fitWithin`  
- Three Round D demos under `docs/demos/`  
- This report  

No production hub wiring yet (Knowledge compose still text-paste only). No dependency installs.

---

## Verification

```text
node --test tests/unit/hub-rich-paste.test.js
→ 7/7 pass

curl -sI https://tiles.openfreemap.org/styles/liberty → 200
curl -sI https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js → 200
```

**Browser demos (manual, local http://127.0.0.1:8765):**
- Capture: paste Maps URL → classified `url/maps` → suggest Life `place`
- MapLibre: OpenFreeMap tiles load; focus North Shore Private Hospital flyTo + popup
- PhotoSwipe: gallery opens lightbox with full image (local assets; remote Unsplash hotlink failed earlier)
- Media Chrome: Copy timestamp link → `?t=0` confirmation

Artifacts: `/opt/cursor/artifacts/round_d_*`

**Not verified:** live R2 upload with compression; agent multimodal delivery; Share Target (needs manifest + HTTPS install); Knowledge compose wiring (helpers not yet bound in app).

---

## Opportunity Table

| Opportunity | Repo/Technology | Hub(s) | User Can Now... | Type | Class | Effort | Upside | Recommendation |
|-------------|-----------------|--------|-----------------|------|-------|--------|--------|----------------|
| Rich paste / drop ingest | kit `hub-rich-paste` | All | Paste screenshot/URL/file into the right shape | Enable | **A** | S | 5 | Wire Knowledge + Teaching next |
| Image compress pipeline | kit / browser-image-compression | K, T, Life | Upload phone photos without hitting caps | Enhance | **A** | S | 4 | Hook Knowledge photo capture |
| PhotoSwipe media viewer | photoswipe | T, K, Life | Swipe/zoom galleries with captions | Enhance | **A** | S | 4 | Replace Teaching lightbox |
| Media Chrome players | media-chrome | K, T | Skinned audio + timestamp notes | Enhance | **A** | S | 4 | Podcast + Teaching audio |
| Uppy multi-file ingest | @uppy/core + aws-s3 | T, K | Queue many resources with progress/retry | Enable | **B→A** | M | 5 | Prototype Teaching resources |
| MapLibre place spine | maplibre-gl + OpenFreeMap | Life, T, Agents | See collections of places; agent maps | Enable | **B** | M | 5 | Place schema + Life medical map |
| Web Share Target | PWA manifest | All | Share from phone into Hub | Enable | **B** | M | 5 | After ingest classifier |
| Cross-hub voice capture | wavesurfer + Whisper path | Life, Tasks, K | Speak a thought on mobile | Enable | **B** | M | 5 | wavesurfer on Knowledge first |
| PDF.js viewer | pdf.js | K, T | Read PDFs in-hub with page deep links | Enable | **A** | M | 4 | Knowledge attachment open |
| PDF highlight→note | Hypothesis later | K | Cite exact passages | Enable | **C** | L | 5 | After pdf.js |
| Annotorious regions | annotorious | Teaching | Annotate artwork/diagrams | Enable | **B** | M | 4 | Teaching image block spike |
| Agent multimodal + ACI | Anthropic image blocks + provenance | Life agents | Attach file and prove model saw it | Enable | **B** | L | 5 | After ingest objects |
| Document scan | jscanify + Cropper | K, Life | Photo paper → straight scan | Enable | **E** | M | 4 | Spike quality on device |
| URL link previews | linkpeek/ogs server | K, T | Paste URL → rich source card | Enable | **C** | M | 4 | SSRF design first |
| QR generate/scan | qrcode + html5-qrcode | Teaching | Student opens resource via QR | Enhance | **C** | S | 2 | Optional Teaching nicety |
| HEIC convert | heic-to | All | iPhone photos just work | Fix | **C** | M | 3 | Legal review |
| Capture Inbox | thin object queue | All | Capture now, classify later | Enable | **B** | M | 5 | Product concept spike |
| FilePond | filepond | — | — | — | **F/D** | — | 2 | Mine motion; don’t install |
| Uppy Dashboard skin | @uppy/dashboard | — | — | — | **G** | — | 1 | Reject default skin |
| Offline sync engine | — | — | — | — | **G** | — | — | Out of scope |
| Commercial PDF SDK | PSPDFKit/Apryse | — | — | — | **G** | — | — | Cost/lock-in |
| marker.js | linkware | — | — | — | **G** | — | — | License |

---

## TOP 12 OPPORTUNITIES

1. **Rich paste + drag/drop ingest** — kit classifier → wire Knowledge/Teaching — Effort S — Upside 5 — **Next:** bind compose + lesson canvas  
2. **Client image pipeline** — compress phone photos — S — 4 — **Next:** Knowledge `ingestCaptureFile`  
3. **PhotoSwipe shared viewer** — Teaching gallery → kit helper — S — 4 — **Next:** replace `openGalleryLightbox`  
4. **Media Chrome** — podcast + Teaching audio — S — 4 — **Next:** wrap Knowledge player  
5. **Uppy core multi-file** — Teaching resources / Knowledge batch — M — 5 — **Next:** headless core + Blobs/R2 adapter spike  
6. **MapLibre + place objects** — Life spatial spine — M — 5 — **Next:** schema + medical constellation prototype  
7. **Share Target** — OS → Capture — M — 5 — **Next:** manifest + ingest route  
8. **wavesurfer voice UX** — waveform record/trim — M — 5 — **Next:** Knowledge voice button  
9. **pdf.js inline viewer** — open attachments in-hub — M — 4 — **Next:** Knowledge attachment click  
10. **Agent multimodal ACI** — file→model proof — L — 5 — **Next:** one personality path spike with delivery test  
11. **Annotorious Teaching** — region notes on images — M — 4 — **Next:** optional image-block mode  
12. **Capture Inbox** — unsorted capture — M — 5 — **Next:** product spike with confirm-card classify  

---

## Forced Prioritisation

### Three to implement soon
1. Rich paste / drop ingest wiring (classifier already exists)  
2. Image compression on Knowledge photo capture  
3. PhotoSwipe on Teaching galleries  

### Three high-upside prototypes
1. Uppy core → Teaching multi-file resource ingest  
2. MapLibre medical/trip place constellation + `map_places` agent payload  
3. Share Target → Capture Inbox  

### Three preserve for later (not reject)
1. Hypothesis / PDF highlight graph  
2. jscanify document scanner  
3. HEIC conversion (post legal)  

### Genuine rejects
1. **FilePond as parallel upload dep** (with Uppy)  
2. **Uppy Dashboard default visual identity**  
3. **Offline-first / CRDT / SW sync architecture** (out of scope)  
4. **Commercial PDF SDKs** as default  
5. **marker.js** (linkware)  
6. **RecordRTC** (aging; native+wavesurfer better)  
7. **React-only Uppy headless** without React migration  
8. **Universal DAM / media monolith** before ingest primitives  

---

## The Surprise

**Not obvious from the brief:** Life Hub already has a **serious Knowledge capture kernel** (Whisper + OCR + PDF→MD on R2) while the design-kit “capture” UI is still theatre — and Life/Tasks/agents are almost entirely cut off from it. The highest leverage is not greenfield recording; it is **generalising an existing Worker capture chain** behind a cross-hub ingest/UX layer, plus **Share Target** as the real mobile door.  

Second surprise: **Uppy’s best Life Hub path is vanilla `@uppy/core` events**, not the marketed React headless hooks — and FilePond’s beauty is a trap against the design kit.

Third: **OpenFreeMap + MapLibre** removes the “maps mean Mapbox bills” objection for a personal hub prototype, while still forcing an honest tile strategy.

---

## The Big Idea

**Capture OS for Life Hub**

A coherent product capability:

> Anything from the user’s world (file, photo, voice, URL, place, share sheet) enters through one **ingest** grammar, becomes a **typed object** with provenance, gains a **representation** (viewer / player / map / note), and can be handed to **personalities** with ACI-proof delivery — without becoming an offline sync product or a generic cloud DAM.

Subsystems: Ingest · Objects · Representations · Agent payloads.  
Round A supplies interaction cards; Round B search indexes objects; Round C gives time/focus grammar; Round D adds space, media, and the door from the physical world.

Do **not** implement the whole OS at once. Implement the doors and the first representations.

---

## Scoring notes (summary)

| Candidate | Imm. use | New cap | UX | Delight | Cross-hub | Agents | Mobile | Arch fit | Feasible | Maint | A11y | Perf | Compose w/ A–C | Future | **Upside** |
|-----------|----------|---------|----|---------|-----------|--------|--------|----------|----------|-------|------|------|----------------|--------|------------|
| Rich paste | 5 | 5 | 5 | 4 | 5 | 3 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 5 | **5** |
| Image pipeline | 5 | 2 | 4 | 3 | 4 | 2 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 4 | **4** |
| PhotoSwipe | 4 | 3 | 5 | 5 | 4 | 3 | 5 | 5 | 5 | 5 | 4 | 4 | 3 | 4 | **4** |
| Media Chrome | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 | 4 | 4 | 4 | 5 | **4** |
| Uppy core | 4 | 5 | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 4 | 3 | 3 | 4 | 5 | **5** |
| MapLibre | 3 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 3 | 4 | 3 | 3 | 5 | 5 | **5** |
| Share Target | 4 | 5 | 5 | 5 | 5 | 3 | 5 | 4 | 3 | 4 | 4 | 5 | 3 | 5 | **5** |
| wavesurfer | 4 | 4 | 5 | 5 | 4 | 4 | 5 | 4 | 4 | 4 | 3 | 3 | 3 | 5 | **5** |
| pdf.js | 4 | 4 | 4 | 3 | 4 | 4 | 3 | 4 | 4 | 5 | 4 | 3 | 4 | 5 | **4** |
| Annotorious | 3 | 5 | 4 | 5 | 2 | 3 | 3 | 4 | 4 | 4 | 3 | 3 | 3 | 4 | **4** |

---

*End of Round D. Do not proceed to Round E.*
