# Travel journal slice 1: story view and keepsakes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the phone journal's reading view with the story view from the approved spec, add a photo viewer and the Journal tab, then add keepsakes.

**Architecture:** `render-journal.ts` keeps loading, pagination, reconcile and overlay ownership, and composes small story modules that each build one piece of DOM from journal data. Pure helpers (day numbers, sunset, distance, the keepsake list) hold the logic and carry the unit tests. Everything stays vanilla TypeScript building DOM by hand, styled with kit tokens.

**Tech stack:** TypeScript 5.9, Vite 7, vitest with happy-dom, Playwright for browser checks. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-travel-journal-redesign-design.md`. Read its "Nothing is lost" table and "Checks before it ships" table before starting. They are the acceptance bar.

**Two pull requests.** Tasks 1 to 9 ship as PR A (story view). Tasks 10 to 14 ship as PR B (keepsakes). Each ends with `npm run pre-pr-check` from the repo root.

**Conventions that bite here**

- The journal scrolls the window, not an inner box. Sticky and fixed positioning are relative to the page.
- Every overlay (sheet, viewer) mounts through `presentJournalOverlay` in `src/journal/overlay-host.ts`.
- Fixtures, tests, screenshots and commit text use invented content only.
- Travel commands run from `apps/travel`: `npx vitest run tests/unit/<file>`, `npm run typecheck`, `npm run build`.

---

## File map

| File | Status | Job |
| --- | --- | --- |
| `src/journal/trip-days.ts` | new | Day numbers, trip phase, long dates, 12 hour times |
| `src/lib/sun.ts` | new | Sunset time for a place and date |
| `src/lib/distance.ts` | new | Straight-line distance and the "1.3 km away · 1 h 35 min later" wording |
| `src/journal/fixtures/lisbon-porto.ts`, `fixtures/journal-photos/*.jpg` | new | A rich invented journal with real-shaped photos, for the mock API and browser checks |
| `scripts/mock-api.ts` | change | Seed the test trip's journal from the new fixture and serve its photos |
| `src/journal/story/cover.ts` | new | Cover |
| `src/journal/story/ribbon.ts` | new | Day buttons and view switch |
| `src/journal/story/chapter-opener.ts` | new | City opener with pattern or accent band |
| `src/journal/story/day-header.ts` | new | Day number, date, counts, sunset, day map |
| `src/journal/story/moment-card.ts` | new | One moment. Replaces `render-moment.ts` |
| `src/journal/story/photo-row.ts` | new | One photo, or a swipeable row |
| `src/journal/story/sound-player.ts` | new | Play button, progress bar, length |
| `src/journal/story/stitch.ts` | new | The line between two located moments |
| `src/journal/story/journey-band.ts` | new | The navy band between two cities. Wraps the existing transition actions |
| `src/journal/story/action-sheet.ts` | new | Moment actions as a bottom sheet |
| `src/journal/story/options-sheet.ts` | new | Journal options as a bottom sheet |
| `src/journal/story/dock.ts` | new | Keepsake, Photos, Moment |
| `src/journal/photo-viewer.ts` | new | Full-screen viewer |
| `src/journal/photos-view.ts` | new | Grid of every photo |
| `src/journal/render-journal.ts` | change | Compose the story from the modules above |
| `src/journal/render-moment.ts`, `render-toolbar.ts` | delete | Replaced. Nothing may import them afterwards |
| `src/styles/journal-story.css` | new | Story styles |
| `src/styles/journal.css` | change | Remove the toolbar, timeline gutter, old moment and popover rules |
| `src/shell/shell.ts`, `src/app/main.ts` | change | Journal tab, phone header hidden on the journal route |
| `src/journal/keepsakes/model.ts`, `draw.ts`, `board.ts`, `keep-sheet.ts`, `keepsake-sheet.ts` | new (PR B) | Keepsakes |
| `src/styles/keepsakes.css` | new (PR B) | Keepsake shapes, tickets, stamps, board |
| `netlify/functions/_shared/travel-journal-schema.mjs` | change (PR B) | Accept the new souvenir fields and `cover_media_id` |

---

## PR A: story view

### Task 1: day numbers, dates and times

**Files:** create `src/journal/trip-days.ts`, test `tests/unit/trip-days.test.ts`.

Interface:

```ts
export function dayNumber(tripStart: string, localDate: string): number; // 1 on the first day
export function tripLength(tripStart: string, tripEnd: string): number;
export type TripPhase =
  | { kind: 'before'; daysUntil: number }
  | { kind: 'during'; day: number; of: number }
  | { kind: 'after' };
export function tripPhase(tripStart: string, tripEnd: string, today: string): TripPhase;
export function coverEyebrow(phase: TripPhase): string; // "Journal · Day 4 of 5", "Journal · starts in 12 days", "Journal · starts tomorrow", "Journal"
export function longDate(localDate: string): string;   // "Friday 5 March"
export function shortDateRange(start: string, end: string): string; // "3 – 5 March", "28 February – 2 March"
export function clock12(hhmm: string | undefined): string; // "09:40" -> "9:40 am", "" when missing or malformed
```

- [ ] Write the tests first: `dayNumber('2027-03-03','2027-03-05') === 3`; a date before the start returns 0; `tripPhase` for before, first day, last day and after; `coverEyebrow` for each phase including "starts tomorrow" and "starts today" is never produced (day 1 is `during`); `longDate('2027-03-05') === 'Friday 5 March'`; `shortDateRange` within one month and across two; `clock12('00:05') === '12:05 am'`, `clock12('12:00') === '12:00 pm'`, `clock12('21:50') === '9:50 pm'`, `clock12(undefined) === ''`, `clock12('9am') === ''`.
- [ ] Run them and see them fail.
- [ ] Implement with UTC date maths on the `YYYY-MM-DD` parts (no `new Date(string)` on local time, so the answer does not depend on the machine's zone).
- [ ] Run them and see them pass. Commit.

### Task 2: sunset and distance

**Files:** create `src/lib/sun.ts`, `src/lib/distance.ts`, tests `tests/unit/sun.test.ts`, `tests/unit/distance.test.ts`.

```ts
// sun.ts
/** Local wall-clock sunset as "HH:mm" in the given IANA zone, or null (polar day or night, bad input). */
export function sunsetLocal(lat: number, lon: number, localDate: string, timeZone: string): string | null;

// distance.ts
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number;
export function formatApart(km: number): string;      // "400 m", "1.3 km", "12 km"
export function formatLater(fromHHMM?: string, toHHMM?: string): string; // "35 min later", "1 h 35 min later", "" when unknown or not later
export function stitchLabel(a: Stop, b: Stop): string; // "1.3 km away · 1 h 35 min later", either half alone, or ""
```

- [ ] Tests: Lisbon (38.72, -9.14) on 2027-03-03 in `Europe/Lisbon` gives a sunset between 18:25 and 18:37; Sydney (-33.87, 151.21) on 2027-01-10 in `Australia/Sydney` between 20:00 and 20:15; 80°N in June returns null; `distanceKm` Lisbon to Porto is between 270 and 280; `formatApart(0.04) === '40 m'`, rounds to 10 m under 1 km, one decimal under 10 km, whole km above; `formatLater('09:40','11:15') === '1 h 35 min later'`, `formatLater('11:15','09:40') === ''`.
- [ ] Implement `sunsetLocal` with the NOAA sunrise equation (zenith 90.833°), convert the UTC result with `Intl.DateTimeFormat` in the given zone.
- [ ] Implement the haversine distance and the wording. Commit.

### Task 3: a fixture worth looking at

**Files:** create `fixtures/journal-photos/` (12 JPEGs, each under 120 KB), `src/journal/fixtures/lisbon-porto.ts`; change `scripts/mock-api.ts`; test `tests/unit/lisbon-porto-fixture.test.ts`.

- [ ] The fixture exports `lisbonPortoJournal(tripId: string): JournalFixture` matching `fixtures/test-trip.json`: two legs (`lis`, `opo`), four days with moments and one empty day, moments covering every kind (one photo landscape, one portrait, two photos, a meal, sound only, words only, a partner moment), a train transition linked to the test trip's train item, media rows with `width`, `height` and `url: '/api/mock-photo/<name>.jpg'`.
- [ ] `mock-api.ts`: `seedJournal` returns the fixture. `GET /api/mock-photo/<name>.jpg` streams the file from `fixtures/journal-photos/` with `content-type: image/jpeg`, and 404s for anything that is not a plain `[a-z0-9-]+\.jpg` name.
- [ ] Test: every moment's `media_ids` resolve, every leg and day referenced exists, every photo file named in the fixture exists on disk. Commit.

### Task 4: story pieces

**Files:** create the `src/journal/story/` modules `cover.ts`, `ribbon.ts`, `chapter-opener.ts`, `day-header.ts`, `photo-row.ts`, `sound-player.ts`, `stitch.ts`, `moment-card.ts`, `journey-band.ts`, and `src/styles/journal-story.css`; tests `tests/unit/story-*.test.ts`.

Each module exports one `render…(options): HTMLElement` that takes plain data and callbacks and touches no globals. Class names use the `story-` prefix.

- [ ] `cover.ts`: `renderCover({ title, dates, eyebrow, stats, photo?, accent?, onBack, onSearch, onOptions })`. Test: with no photo it renders the accent field and no `img`; the eyebrow text is the string passed in.
- [ ] `ribbon.ts`: `renderRibbon({ groups: { label, days: { id, number, label, state: 'past' | 'today' | 'future' }[] }[], view, views, onDay, onView })` returning `{ el, setCurrentDay(id), setView(view) }`. Test: future days are disabled; `setCurrentDay` moves `aria-current`; only the views passed in are drawn.
- [ ] `chapter-opener.ts`, `day-header.ts`, `stitch.ts`: tests for the text they produce and that sunset is omitted when null.
- [ ] `photo-row.ts`: one photo keeps its ratio clamped to 4:5 … 3:2 from `media.width / media.height`; two or more render a scroll-snap row with a count that follows scroll. Uses `configureJournalImage`. Each photo is a `button` carrying `data-photo-index`.
- [ ] `sound-player.ts`: a real `audio` element with `preload="none"`, a play and pause button, a `progress` bar driven by `timeupdate`, and the length from `duration_s`. Only one player plays at a time.
- [ ] `moment-card.ts`: order is media, then time, place and ⋯, then meal chip, then words with Read more, then the partner badge where it applies. A moment with words and no photo gets the `story-moment--words` treatment. Test: each kind of fixture moment renders its expected parts, and ⋯ calls `onActions(moment, button)`.
- [ ] `journey-band.ts`: date, mode, "Lisbon to Porto", times and stations when the linked ticket passes `findItineraryTicket`, and the existing journey details and edit actions from `transitions.ts`.
- [ ] `journal-story.css`: port the prototype's story styles onto kit tokens. Phone first; at `min-width: 720px` the pieces sit in the 48rem column with card radius on photos. Commit after each module.

### Task 5: sheets

**Files:** create `src/journal/story/action-sheet.ts`, `options-sheet.ts`; tests `tests/unit/story-sheets.test.ts`.

- [ ] `openMomentActionSheet({ fixture, moment, anchor, onAction })` renders `buildMomentMenuItems` as rows at least 44px tall with icons, the reason under a disabled row, and Delete last in the danger colour. It mounts through `presentJournalOverlay`.
- [ ] `openJournalOptionsSheet({ anchor, title, items })` where items are `{ label, hint?, onSelect }`.
- [ ] Tests: every `MomentMenuAction` appears; a disabled row shows its reason and does not call `onAction`; choosing a row closes the sheet first, then calls back. Commit.

### Task 6: dock

**Files:** create `src/journal/story/dock.ts`; test `tests/unit/story-dock.test.ts`.

- [ ] `mountDock({ onPhotos, onMoment, onKeepsake? })` returns `{ el, destroy() }`. The round middle button is Photos. Keepsake is only drawn when `onKeepsake` is passed (PR B passes it). Fixed above the tab bar: `bottom: calc(4.65rem + env(safe-area-inset-bottom) + var(--space-3))`. It slides away after 90px of downward scroll and returns 650ms after scrolling stops, on upward scroll, and near the top. It is hidden while `journalOverlayOpenCount() > 0`.
- [ ] Tests with fake timers for the hide and return rules. Commit.

### Task 7: viewer and Photos view

**Files:** create `src/journal/photo-viewer.ts`, `src/journal/photos-view.ts`; tests `tests/unit/photo-viewer.test.ts`, `tests/unit/photos-view.test.ts`.

- [ ] `tripPhotos(fixture, orderedMoments)` returns every live photo in story order with its moment and day number. Test it against the fixture.
- [ ] `openPhotoViewer({ photos, index, from?, anchor, tripId, journal, onUseAsCover, onClose })`: scroll-snap track, count, caption, Previous and Next on pointer devices, tap to hide the chrome, drag down to close, pinch through `lib/zoomable.ts`, the photo notes toggle, and "Use as cover". Mounted through `presentJournalOverlay`.
- [ ] `renderPhotosView({ photos, groups, onOpen })`: the three-column grid grouped by day.
- [ ] Tests: opening at index 3 shows "4 of N"; Next and Previous move the count; Escape releases the overlay; the grid has one button per photo. Commit.

### Task 8: compose, and remove the old view

**Files:** change `src/journal/render-journal.ts`, `src/styles/journal.css`, `src/app/main.ts`; delete `src/journal/render-moment.ts`, `src/journal/render-toolbar.ts`; update `tests/unit/journal-render.test.ts`, `tests/unit/journal-layout.test.ts`, `tests/unit/moment-menu.test.ts`.

- [ ] `renderJournal` builds: cover, ribbon, then the active view. Story view loops legs, days and moments as before (same pagination window, same `data-journal-*` attributes and element ids so deep links, last-view restore and reconcile keep working), using the Task 4 modules. The intersection observer that records the last viewed moment also tells the ribbon the current day.
- [ ] Wire every row of the spec's "Nothing is lost" table. Journal options sheet items, in order: Search journal, Show or Hide Partner's lines (only when the journal has any), Print, Export, Share, Trash, Refresh.
- [ ] A rebuild keeps the chosen view and the scroll position.
- [ ] `main.ts`: on the journal route add `page-header--journal` to the shell's page header and remove it on every other route. CSS hides that header under 720px.
- [ ] Remove the old toolbar, timeline gutter, moment, popover and connection rules from `journal.css`. `grep -r "render-moment\|render-toolbar" src tests` returns nothing.
- [ ] Update the three test files to the new structure. Keep the behaviours they pin that still exist: deleted moments are left out, the first photo loads eagerly, pagination at 30, Read more, reduced motion, pattern off, the empty journal. Commit.

### Task 9: Journal tab, browser checks, ship PR A

**Files:** change `src/shell/shell.ts`, `tests/unit/mobile-more-hubs.test.ts`; add `tests/browser/journal-story.spec.mjs` at the repo root beside `travel.spec.mjs`; add entries to `docs/CURSOR-UI-FAILURES.md` for any new failure found.

- [ ] Primary destinations become Trip, Today, Journal. Trips goes first in More. The rail gains Journal. `RailHighlight` gains `'journal'` and the journal route uses it.
- [ ] Browser spec at 390 and 1440 against the mock: each row of the spec's checks table that PR A covers (R2, R3, R4, R5, R6, R7, L13, V8, C2, D1, C4 in WebKit, T1, P4).
- [ ] Save 390 screenshots of every piece for the PR.
- [ ] From `apps/travel`: `npm run typecheck && npx vitest run && npm run build`. From the root: `npm run pre-pr-check`. Open the PR ready for review and enable auto-merge.

---

## PR B: keepsakes

### Task 10: the keepsake list

**Files:** create `src/journal/keepsakes/model.ts`; change `src/journal/souvenirs.ts` (new optional fields on `JournalSouvenir`, parsed and kept); test `tests/unit/keepsakes-model.test.ts`.

```ts
export type KeepsakeKind = 'ticket' | 'poster' | 'round' | 'other';
export type Keepsake =
  | { type: 'photo'; id: string; kind: KeepsakeKind; title: string; note?: string; mediaId?: string; momentId?: string; legId: string; localDate: string; localTime?: string }
  | { type: 'booking'; id: string; itemId: string; mode: 'flight' | 'train'; carrier: string; number: string; fromName: string; toName: string; fromCode: string; toCode: string; date: string; departTime: string; legId: string }
  | { type: 'stamp'; id: string; legId: string; city: string; country: string; date: string };
export function listKeepsakes(journal: JournalDocument, trip?: Trip): Keepsake[]; // story order
export function keepsakesForDay(all: Keepsake[], legId: string, localDate: string): Keepsake[];
export function hideBookingKeepsake(journal: JournalDocument, itemId: string): JournalDocument;
```

- [ ] Tests: an old souvenir with no `kind` reads as `other`; a verified train on the itinerary yields one booking keepsake and an unverified one yields none; `hideBookingKeepsake` removes it from the list and restoring that souvenir row brings it back; one stamp per live leg using the trip city's country; a deleted souvenir is left out; the booking reference never appears on a keepsake. Commit.

### Task 11: drawing them

**Files:** create `src/journal/keepsakes/draw.ts`, `src/styles/keepsakes.css`; test `tests/unit/keepsakes-draw.test.ts`.

- [ ] `drawKeepsake(k, { tripId, media })` returns an element sized in `em`, so one `font-size` scales it: a photo cut to the kind's shape, a drawn ticket, or a stamp. Port the shapes from the prototype. Text set with `textContent`.
- [ ] Tests: each kind renders; a booking keepsake's text holds carrier, number, both place names, date and time and nothing else from the item. Commit.

### Task 12: in the story and on the board

**Files:** create `src/journal/keepsakes/board.ts`, `keepsake-sheet.ts`; change `render-journal.ts`, `story/chapter-opener.ts`, `story/journey-band.ts`, `story/ribbon.ts` callers.

- [ ] Story: photo keepsakes after their moment or in time order within the day; booked tickets under the journey band with "Kept automatically from your booking"; the stamp on the chapter opener; chapter and cover counts include keepsakes.
- [ ] Board as the third view, and the keepsake sheet with "Go to that day" and, for a booking keepsake, "Remove from keepsakes".
- [ ] Tests for placement order and for the board's grouping. Commit.

### Task 13: keeping one

**Files:** create `src/journal/keepsakes/keep-sheet.ts`; change `story/dock.ts` caller, `story/action-sheet.ts` label, `scripts/mock-api.ts`, `netlify/functions/_shared/travel-journal-schema.mjs`, `tests/unit/travel-journal-schema.test.js`.

- [ ] The four-choice sheet, then the photo picker, then save through `queueJournalMedia` and `persistJournalPatch` as the capture sheet does, with the failure message kept in the sheet.
- [ ] "Add souvenir" becomes "Keep as a keepsake" and keeps its behaviour.
- [ ] The server schema accepts `kind`, `source`, `item_id`, `leg_id`, `local_date`, `local_time` and `coordinates` on a souvenir, and `cover_media_id` in preferences, and rejects unknown kinds. Add schema tests.
- [ ] Keepsakes and stamps are left out of `travel-journal-share` and the export bundle. Add a test for each. Commit.

### Task 14: browser checks, ship PR B

- [ ] Extend `tests/browser/journal-story.spec.mjs`: keep a ticket and see it in the story and on the board; remove a booked ticket and restore it from Trash; V7 (the view stays Keepsakes after a save).
- [ ] Screenshots at 390 of the board, each sheet and each keepsake kind.
- [ ] Gates as in Task 9. Open the PR ready for review and enable auto-merge.
