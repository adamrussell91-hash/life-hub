# Travel quick meal and moment attachments: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log a meal straight from a food stop, add or remove sound and photos on a saved moment, and replace the bare photo picker. Spec: `docs/superpowers/specs/2026-11-14-travel-quick-meal-and-attachments-design.md`.

**Architecture:** Small focused modules in `apps/travel/src/journal/` that reuse the existing journal save path (`persistJournalPatch`), device outbox (`queueJournalMedia` and `flushJournalOutbox`) and meal API (`getTravelMeal` and `putTravelMeal`). Pure helpers carry the logic, so happy-dom tests cover them. Sheets take injectable API deps.

**Tech Stack:** TypeScript, vanilla DOM, Vite, vitest + happy-dom, Netlify functions (`.mjs`), Playwright for the browser check.

Executed inline in the authoring session, so each task lists files, interfaces and tests rather than full code.

---

### Task 1: Moments can point at an itinerary stop

**Files:**
- Modify: `netlify/functions/_shared/travel-journal-schema.mjs` (`validateMoment`)
- Modify: `apps/travel/src/journal/types.ts` (`JournalMoment.item_id?: string`)
- Test: `tests/unit/travel-journal-schema.test.js`

- [ ] Failing tests: a moment with `item_id: 'itm_abcd1234'` validates, and `item_id: 'nope'` throws at `moments[0].item_id`.
- [ ] Implement: when present, `item_id` must be a string matching `/^itm_[a-z0-9_]{4,64}$/i`.
- [ ] Run `node --test tests/unit/travel-journal-schema.test.js`. It passes.

### Task 2: Ambient recorder module

**Files:**
- Create: `apps/travel/src/journal/ambient-recorder.ts`
- Modify: `apps/travel/src/journal/capture-sheet.ts` (`startAmbient` uses it)
- Test: `apps/travel/tests/unit/ambient-recorder.test.ts`

Interface:

```ts
export interface AmbientClip { blob: Blob; seconds: number }
export interface AmbientRecording { readonly startedAt: number; stop(): Promise<AmbientClip | null> }
export class AmbientRecorderError extends Error {} // message is the user-facing sentence
export async function startAmbientRecording(deps?: { now?: () => number }): Promise<AmbientRecording>
```

- [ ] Failing tests with fake `navigator.mediaDevices.getUserMedia` and `MediaRecorder`:
  - stop() resolves a clip with the recorder mimeType and stops the tracks
  - a refused ambient constraint falls back to `{ audio: true }`
  - both refused throws "Microphone access was not allowed."
  - no MediaRecorder throws "Sound recording is not available in this browser."
- [ ] Implement, then switch capture-sheet's `startAmbient` and `stopAmbient` to the module, keeping its UI code.
- [ ] Run the travel vitest suite. The capture-sheet tests stay green.

### Task 3: Attachments in Edit moment

**Files:**
- Create: `apps/travel/src/journal/moment-attachments.ts` (pure patch, plus the row component)
- Modify: `apps/travel/src/journal/edit-moment-sheet.ts` (replace the two "later update" hints, then dirty, save and media patch)
- Modify: `apps/travel/src/styles/journal.css` (or the stylesheet that holds `.journal-edit-moment__*`)
- Test: `apps/travel/tests/unit/moment-attachments.test.ts`

Interfaces:

```ts
export interface NewAttachment { mediaId: string; row: JournalMedia; blob: Blob }
export function applyAttachmentEdits(journal: JournalDocument, momentId: string, added: NewAttachment[], removedIds: string[]): JournalDocument
export function mountMomentAttachments(host: HTMLElement, opts: { tripId: string; journal: JournalDocument; moment: JournalMoment; onChange(): void }): MomentAttachmentsHandle
export interface MomentAttachmentsHandle { changed(): boolean; added(): NewAttachment[]; removed(): string[]; busy(): boolean; stop(): Promise<void>; destroy(): void }
```

- [ ] Failing tests:
  - `applyAttachmentEdits` appends media rows and ids, drops removed ids, and soft-deletes an orphaned removed media row but keeps one another live moment uses
  - the row lists photo thumbs and sound chips from the journal
  - × removes one and sets `changed()`
  - "Add photo" picks a file and appends a pending thumb
- [ ] Implement. Edit sheet: on Save, await `stop()`, queue each added blob with `queueJournalMedia({ flush: false })`, patch with `applyAttachmentEdits`, `persistJournalPatch`, then `rememberLocalJournalMedia` and `flushJournalOutbox()`. On failure, `dropQueuedJournalMedia`.
- [ ] Remove both "later update" strings. `grep -rn "later update" apps/travel/src` returns nothing.

### Task 4: Quick meal sheet

**Files:**
- Create: `apps/travel/src/journal/quick-meal.ts` (pure helpers)
- Create: `apps/travel/src/journal/quick-meal-sheet.ts` (sheet)
- Test: `apps/travel/tests/unit/quick-meal.test.ts`

Interfaces:

```ts
export function inferMealType(title: string, time: string | null): MealType
export function withFromTitle(title: string): string
export function buildMealMoment(journal: JournalDocument, item: Item, opts: { now: Date; timeZone: string; mediaIds: string[]; momentId: string }): { journal: JournalDocument; moment: JournalMoment }
export function openQuickMealSheet(opts: { tripId: string; item: Item; timeZone: string; momentId?: string; deps?: QuickMealDeps; onSaved?(momentId: string): void; onClose?(): void }): { destroy(): void }
```

- [ ] Failing tests:
  - "Brunch at the mall with Sam" gives Breakfast and "Sam"
  - "Dinner in town" gives Dinner
  - a plain title at 13:00 gives Lunch
  - `buildMealMoment` sets `item_id`, place, coordinates, `location_source: 'manual'`, today's time when the date is today and the stop time otherwise, and a leg covering the date (bootstrapping when the journal is empty)
  - the sheet's Save stays disabled until a dish has a name
  - stars set and clear the rating
  - Save calls deps.persist, then deps.putMeal with the dishes, meal type and extras, then onSaved
  - edit mode prefills from deps.getMeal
- [ ] Implement. Photos use the outbox. When there are photos, flush and re-read the journal before `putTravelMeal`.

### Task 5: Food stops show "Log meal" or "Meal logged"

**Files:**
- Modify: `apps/travel/src/views/day-list.ts` (options `mealMomentByItem?: Map<string, string>` and `onLogMeal?: (item, momentId?) => void`, and a quiet row under meta)
- Modify: `apps/travel/src/views/trip-page.ts` (read the journal after render, build the map, open the sheet, refresh after save)
- Modify: `apps/travel/src/lib/icons.ts` (`food` icon)
- Test: `apps/travel/tests/unit/day-list-meal.test.ts`

- [ ] Failing tests:
  - a food stop today shows "Log meal"
  - a food stop tomorrow shows nothing
  - a `do` stop shows nothing
  - the public view shows nothing
  - a linked stop shows "Meal logged", and clicking it passes the moment id
- [ ] Implement.

### Task 6: Safe-mark photo picker

**Files:**
- Modify: `apps/travel/src/components/safe-photo-sheet.ts`
- Test: `apps/travel/tests/unit/safe-photo.test.ts`

- [ ] Failing test: the sheet has no visible `input[type=file]` and has a "Choose photo" button. After picking, it shows the file name and a "Remove", and Remove clears the photo.
- [ ] Implement. Keep the existing submit tests green.

### Task 7: Mock API

**Files:** `apps/travel/scripts/mock-api.ts`

- [ ] `PUT /api/travel-meal` stores the visit per moment, sets `moment.meal.food_visit_id` and bumps the journal version. `GET` returns it.
- [ ] `POST /api/travel-journal-media-sign`: sign returns an `upload_url` to `/api/mock-upload`, and verify marks the media `backed_up` with `derivative_keys`. Add a `PUT /api/mock-upload` route.

### Task 8: Verify, register, ship

- [ ] Browser (iPhone 13 profile, dev server): log a meal with a photo from a food stop, see "Meal logged", reopen it. Edit a moment: fake-mic record, add a photo, remove one, save. Screenshot each sheet.
- [ ] Register: extend P4's Seen line with the Edit moment "later update" copy.
- [ ] Gates: travel vitest, typecheck and build, then `node scripts/pre-pr-check.mjs`. Commit, push, open the PR (ready) and enable auto-merge.
