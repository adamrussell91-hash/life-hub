# Travel: log a meal from a food stop, and edit a moment's photos and sound

Date: 14/11/26. Approved in chat: the short Meal sheet, and tidying the safe-mark photo picker.

## Problem

While travelling, three things are slower or impossible than they should be:

1. **No meal from a food stop.** A food stop on the itinerary only offers Edit and directions. Logging what you ate means opening the Journal, adding a moment, then editing it and switching on "This was a meal". That is two sheets and about ten taps.
2. **Saved moments are frozen.** The Edit moment sheet cannot add sound or photos, or remove them. It shows "N photos attached — reorder and crop in a later update." and "Voice notes — editing attachments comes in a later update." Both break register entry P4: no promises about future builds in the product.
3. **The safe-mark photo picker is a bare browser control.** It shows "Choose File · camera-photo.jpg" (register I18).

Constraint from the owner: quick to use, without making screens crowded or ugly.

## Design

### 1. "Log meal" on food stops

- **Where it shows.** A food stop (`kind: 'food'`) on the owner's itinerary, from that stop's day onwards. It never shows on the public link, on future days or on other kinds of stop. It is one quiet text button next to the existing meta row, sized like the safe-mark "Photo" mini button.
- **After logging.** The button is replaced by a "Meal logged" chip with a tick. Tapping the chip reopens the same sheet to edit the meal.
- **Link.** The journal moment carries an optional `item_id`, the stop's `itm_` id. The trip page reads the journal once, after the day list renders, and does not block the render. It marks the stops that have a live moment with that `item_id`.
- **The Meal sheet** (`journal/quick-meal-sheet.ts`):
  - Heading: the stop's title. Under it, a muted line with the place name and the day.
  - One meal-type select for the whole meal. It is inferred from the stop's title first: breakfast or brunch gives Breakfast, lunch gives Lunch, dinner gives Dinner, coffee or drinks gives Drinks. Otherwise it comes from the time: before 10:30 Breakfast, before 15:00 Lunch, before 17:00 Snack, then Dinner.
  - Dish rows: "What did you have?" text input plus five star buttons. Tapping the selected star clears the rating. "Add another dish" adds a row, and each row except the first has a Remove.
  - "Add photo": one `accept="image/*"` input, so iOS offers camera or library. Chosen photos show as small thumbnails with ×.
  - "More" (`<details>`, closed): Who with, Mood and Vibe. Who with is prefilled from a trailing "with X" in the stop title.
  - Actions: Cancel and Save. Save needs at least one dish name.
- **Save path.** It reuses the journal's own pieces:
  1. `ensureJournal`, then pick the leg: a live leg covering the stop's date, else the capture context, else bootstrap.
  2. Photos are queued in the device outbox (`queueJournalMedia`) as media rows.
  3. A new moment is created with `local_date` set to the stop's date. `local_time` is now when that date is today, otherwise the stop's time. It also gets `place`, `coordinates` and `location_source: 'manual'` from the stop, `media_ids`, `item_id` and the chronological `display_order`. It is saved with `persistJournalPatch`.
  4. If there are photos, `flushJournalOutbox()` runs and the latest version is re-read, so the Food Journal can copy the photos on the first save.
  5. `putTravelMeal` writes the visit to the Food Journal with the dishes, meal type, ratings and extras.
- **Edit path.** `getTravelMeal` loads the visit and the sheet opens prefilled. Save edits the moment's media if photos were added, then calls `putTravelMeal`.
- **Offline.** If the moment save is queued, the toast reads `MEAL_MESSAGES.queued`, as it does today. The meal needs a connection. Errors use `saveErrorMessage` from `meal-section`.

### 2. Attachments in Edit moment

- The two "later update" lines are replaced by one **Attachments** row: photo thumbnails, sound chips ("▶ Sound · 0:42") that play in place, and two small buttons at the end, "Add photo" and "Record".
- Each attachment has a × that removes it from the moment on Save. A removed media row is soft-deleted only when no other live moment uses it, which is the rule the delete flow already follows.
- **Record** uses the same ambient recorder as New moment. It is extracted to `journal/ambient-recorder.ts`, and New moment is switched to use it. While recording, the button reads "Stop · 0:12" with the red dot.
- **Save.** New files are queued in the outbox first, then the moment's `media_ids` and the journal's `media` are patched and saved through the existing `persistJournalPatch`, then the outbox is flushed. Adding or removing an attachment counts as a change, for both dirty tracking and the Save condition.
- Nothing else in the sheet moves.

### 3. Safe-mark photo picker

- The bare file input is hidden. Instead there is a "Choose photo" button with a camera icon. Once a photo is chosen, the preview shows with the photo's name and "Remove".

### Server

- `travel-journal-schema.mjs` accepts an optional `item_id` on a moment and checks it with the `itm_` id pattern.

### Mock API (local dev honesty)

- `PUT /api/travel-meal` stores the visit, sets `moment.meal` and bumps the journal version. `GET` returns the stored visit.
- `/api/travel-journal-media-sign` sign and verify, plus a mock PUT target, so the outbox upload path runs locally.

## Testing

- Unit (vitest + happy-dom):
  - meal-type inference and the "with X" prefill
  - stars set and clear
  - Save disabled until a dish has a name
  - the save path builds a moment with `item_id`, place and coordinates, then calls `putTravelMeal`, using injected API deps
  - the edit sheet's Attachments row adds and removes media and saves them
  - the ambient recorder with a fake MediaRecorder
  - the picker shows the name and Remove
  - day list: "Log meal" only on food stops from their day onwards and never on the public view; "Meal logged" when a linked moment exists
- Browser: the dev server in an iPhone profile. Log a meal from a food stop with a photo, see "Meal logged", reopen it. Edit a moment: record (fake mic), add a photo, remove one, save. Screenshot each sheet at 390px.
- Gates: Travel vitest, typecheck, build, and `pre-pr-check`.

## Out of scope

- Reordering or cropping photos.
- Transcripts.
- A meal from non-food stops.
- Maccas runs from the quick sheet. Those stay in Edit moment.
