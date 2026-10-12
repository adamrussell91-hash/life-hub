# Food Journal completion ledger

Author: Codex. Date: 13 October 2026.

The exact individual phase descriptions were unavailable in the prior chat retrieval. These seven scopes implement its preserved requirements. The design contract and implementation plan document every scope and reused component.

- [x] Phase 1. Validated journal model, authenticated API, private runtime repository, SHA conflicts and deleted source reservation.
- [x] Phase 2. Grouped visit cards, independent dishes and ratings, shared list editing, dish photo management, draft recovery and desktop/mobile routes.
- [x] Phase 3. EXIF before compression, HEIC lazy decoding, private R2 signing, photo batching, dish association including shared platter photos, venue suggestions, editable menu OCR text.
- [x] Phase 4. Custom Menu search and shared meal/cuisine/indicator/rating filters, with Recipe and Restaurant after choosing a dish.
- [x] Phase 5. Background recipe research, ten verified candidates, three shortlisted sources, explicit recipe review/save, existing cooking cards, editable ingredient/step lists and portions.
- [x] Phase 6. Day One JSON review and selection, complete text and source identity, location/tags/date retention, photo matching and duplicate protection.
- [x] Phase 7. Private photo backup/restore, source reservation after deletion, persisted visit drafts, failure/conflict recovery, sign out cleanup and service worker update.

## Visual review against specification

L1/L2: one visit card holds multiple dishes. Custom Menu cards share a full width responsive grid. No fixed empty cover is rendered for missing images. Three desktop tracks, two below 1100, one below 720. Screenshot comparison against the written layout: no deviation.

R4: at 390 and 320, visit, recipe, import, restore and delete sheets use 44px docked actions. Controls are 17px. A reduced 520px viewport and long notes preserve the action row. No horizontal overflow. Shared visual viewport variables also cap the sheet to keyboard height while layout viewport height stays unchanged. Recipe lists inherit the same phone correction as dish lists. Screenshot comparison against the written layout: no deviation.

W1/W2: the browser checks sign in through main.js, use the real controller route and exercise the real Food Journal handlers with injected test storage and provider doubles. UI controls do not rely on an isolated renderer fixture. API transport uses the existing absolute session wrapper. R2 requests use signed URLs without embedding credentials.

W4/M1: EXIF and HEIC modules load only for photo capture. Morphing dialogs use the existing spring and reduced motion. Idle pages have no new looping animation.

W6: extraction fills blanks and preserves personal notes/ratings. Photo metadata does not overwrite a manually edited date or saved venue coordinates. Stale visit drafts expose the current saved visit and require an explicit replacement choice.

## Verification evidence

The focused unit suite exercises schema errors, Custom Menu filters, Day One duplicates/deleted identities, photo association, batch limits, field preservation, private media reads, SHA conflicts, background completion, verified recipe sources and fraction scaling.

The browser suite exercises the real main/controller route at 1440/390/320, long form saves, reduced viewport actions, Custom Menu filtering, cooking cards, import selection, private photo capture, stored menu text, complete photo backup and duplicate safe restore.

Verified release commands:

- npm run build: passed for all five SPA apps and published Life assets.
- Focused unit tests: 17 passed.
- Browser acceptance: six passed, covering desktop, both phone widths, keyboard viewport, import/restore/delete/recipe actions, capture, backup, conflicts and shared list operations.
- Mandatory gate: 5,695 root tests, 1,425 Tasks tests, static guards and Professional typecheck.

 No production journal data is created by these tests. The actual Day One export is not supplied, so migration tooling is ready and existing personal entries have not been imported.
