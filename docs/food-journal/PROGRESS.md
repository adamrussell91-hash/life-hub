# Food Journal completion ledger

Author: Codex. Date: 13 October 2026.

The exact individual phase descriptions were unavailable in the prior chat retrieval. These seven scopes implement its preserved requirements. The design contract and implementation plan document every scope and reused component.

- [x] Phase 1. Validated journal model, authenticated API, private runtime repository, SHA conflicts and deleted source reservation.
- [x] Phase 2. Grouped visit cards, independent dishes and ratings, shared list editing, dish photo management, draft recovery and desktop/mobile routes.
- [x] Phase 3. EXIF before compression, HEIC lazy decoding, private R2 signing, photo batching, dish association including shared platter photos, venue suggestions, editable menu OCR text.
- [x] Phase 4. Custom Menu search and shared meal/cuisine/indicator/rating filters, with Recipe and Restaurant after choosing a dish.
- [x] Phase 5. Background recipe research, ten verified candidates, three shortlisted sources, explicit recipe review/save, existing cooking cards, editable ingredient/step lists and portions.
- [x] Phase 6. Day One JSON review and selection, complete text and source identity, location/tags/date retention, photo matching and duplicate protection. Bulk path: default select-all, one Import click, photos optional; CLI `npm run import:dayone-food` for agent/offline text-only import. Large photo exports: Mac CLI `npm run import:dayone-photos` — see `docs/food-journal/photo-import-cli.md`.
- [x] Phase 7. Private photo backup/restore, source reservation after deletion, persisted visit drafts, failure/conflict recovery, sign out cleanup and service worker update.

## Visual review against specification

L1/L2: one visit card holds multiple dishes. Custom Menu cards share a full width responsive grid. No fixed empty cover is rendered for missing images. Three desktop tracks, two below 1100, one below 720. Screenshot comparison against the written layout: no deviation.

R4: at 390 and 320, visit, recipe, import, restore and delete sheets use 44px docked actions. Controls are 17px. A reduced 520px viewport and long notes preserve the action row. No horizontal overflow. Shared visual viewport variables also cap the sheet to keyboard height while layout viewport height stays unchanged. Recipe lists inherit the same phone correction as dish lists. Screenshot comparison against the written layout: no deviation.

W1/W2: the browser checks sign in through main.js, use the real controller route and exercise the real Food Journal handlers with injected test storage and provider doubles. UI controls do not rely on an isolated renderer fixture. API transport uses the existing absolute session wrapper. R2 requests use signed URLs without embedding credentials.

W4/M1: EXIF and HEIC modules load only for photo capture. Morphing dialogs use the existing spring and reduced motion. Idle pages have no new looping animation.

W6: extraction fills blanks and preserves personal notes/ratings. Photo metadata does not overwrite a manually edited date or saved venue coordinates. Stale visit drafts expose the current saved visit and require an explicit replacement choice.

## Verification evidence

The focused unit suite exercises schema errors, Custom Menu filters, Day One duplicates/deleted identities, photo association, batch limits, field preservation, private media reads, SHA conflicts, background completion, verified recipe sources and fraction and range scaling, including compact units.

The browser suite exercises the real main/controller route at 1440/390/320, long form saves, reduced viewport actions, Custom Menu filtering, cooking cards, import selection, private photo capture, stored menu text, complete photo backup and duplicate safe restore.

Verified release commands:

- npm run build: passed for all five SPA apps and published Life assets.
- Focused unit tests: 18 passed.
- Browser acceptance: nine passed, covering desktop, both phone widths, keyboard viewport, import/restore/delete/recipe actions, capture, backup, conflicts, shared list operations, successful background cooking card creation, cancelled research and failed initial loads.
- Mandatory gate: 5,696 root tests, 1,425 Tasks tests, static guards and Professional typecheck.

 No production journal data is created by these tests. The actual Day One export is not supplied, so migration tooling is ready and existing personal entries have not been imported.

## Mobile date field — 24 October 2026

Address and Date now stack on phones instead of squeezing the native date
control into a fixed 10.5rem column. Field grid tracks can shrink to their
container, and the date input is bounded by its field. Desktop retains the
paired layout; Venue and Find venue retain their compact phone row.

Checked R4, L1 and P2: browser checks at 390 and 320 fill and save the date,
measure the date inside its field and viewport, and exercise long notes,
reduced viewport height, scrolling and reachable 44px actions with 16px+
controls. Visual review at 1440 and 390: difference from the supplied phone
screenshot is the intended full-width Address and Date rows. Screenshots use
the existing browser test journal, not personal production data; production
iPhone verification remains unperformed. WebKit could not run because this
environment lacks its system libraries and root installation access.

Food Journal browser suite: 27/28 passed on the first run; the recipe-book
phone case timed out waiting for app startup before reaching the feature.
It passed on a focused rerun alongside both mobile date/action cases (3/3).
Mandatory `npm run pre-pr-check`: exit 0; root tests report 7,204 passed,
zero failed, 12 skipped; static guards, affected Tasks/Teaching test selection
and Professional typecheck passed.

## iPhone date overflow follow-up — 25 October 2026

The 24 October layout change did not fix the reported iPhone rendering. The
follow-up screenshot shows the native date field still painting beyond the
other inputs even after Address and Date stack. The earlier Chromium-only
geometry checks were insufficient evidence for this Safari complaint.

The visible date is now painted by a normal, clipped `.food-date` field.
A transparent, absolutely positioned `input[type=date]` fills that field,
retaining its label, focus, native picker and date value without contributing
native control paint or intrinsic width to the layout. The displayed value
uses the shared `dd/mm/yy` formatter and follows input/change events.

Checked R2/R3/R4, L1, P1/P3: WebKit phone emulation at 390 and 320 and desktop
at 1440 verifies the visible field bounds, both-edge hit targets, native date
input, focus, displayed date changes, draft reopening and saved date. Visual
review against the reported screenshot: date now shares the Address right
edge on phones; intended difference is left-aligned `dd/mm/yy` display. Test
screenshots use synthetic journal data, never personal production content.
WebKit runs with temporary user-space libraries; this is browser-engine
coverage with iPhone emulation, not a physical iPhone test.

Verification: full Chromium Food Journal suite passed 31/31. WebKit date
regressions passed 3/3 after checking both `input` and native-picker `change`
commits; WebKit long-form/R4 checks passed at 390 and 320. Its broader photo
capture case timed out before the second thumbnail; the same failure and
"Choose a photo under 4 MB" status reproduce with the pre-fix `view.js`.
That existing photo path is outside this date-field change.

Final native-picker change-event checks passed 3/3 in Chromium as well.
`npm run pre-pr-check` passed: 7,247 root tests passed, 12 skipped, zero
failed; static guards, affected Tasks/Teaching test selection and Professional
typecheck passed. Run the WebKit cases with
`PLAYWRIGHT_BROWSER=webkit node --test --test-name-pattern='date control|phone (390|320)' tests/browser/food-journal.spec.mjs`
after installing Playwright WebKit and its host libraries.

## 27/10/26 · Quick entry in three steps, Brisket straight after saving

Adam found Add visit a long form that took too long on the phone, the venue
picker inaccurate, and tags drifting into moods rather than foods.

- Add and edit visit are now three steps on the same page: Where and when,
  The food, Check and save. A step bar under the title reaches any step; an
  existing visit can be saved from any step. New visits open on Where, edits
  on The food, and Check venues' Edit visit on Where.
- Where: Snap the dish and Photo the menu first. The venue is typed; places
  logged before match as you type. Nearby places are suggestions only, marked
  as possibly off. Meal buttons set every dish's meal, defaulting to the time
  of day in Sydney. Visit notes cover the venue and the visit.
- Food: tags are foods (Burger, Sandwich, Ramen…), offered as buttons with the
  person's own food tags first, plus find-or-add. A food tag fills the cuisine
  while it is empty. Ingredients and dish notes are always shown; menu
  ingredients carry a "From the menu" badge, and a dish typed by a menu name
  picks up that item's ingredients. "Would order again" is a dish field
  (`order_again`, yes or no). Cuisine and meal type sit under More.
- Check: a summary of the venue and each dish, tap to edit, then visit title,
  menu text and "Count in Brisket after saving" (on by default).
- After saving, uncounted or re-count dishes are offered to Brisket with a
  portion each; Send hands them off one dish per message, as before.
- Capture and fix-up prompts now ask for food tags, never moods.

Verification: Chromium Food Journal suite 35/35 (four new quick-entry cases at
1440 and 390, including the post-save Brisket hand-off, Not now, and turning
it off). New unit tests in `tests/unit/food-journal-quick-entry.test.js`.
WebKit was not available in this environment; run the phone cases there with
`PLAYWRIGHT_BROWSER=webkit node --test --test-name-pattern='quick entry|phone (390|320)' tests/browser/food-journal.spec.mjs`.
