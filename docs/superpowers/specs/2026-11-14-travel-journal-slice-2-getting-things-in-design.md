# Travel journal slice 2: getting things in

Date: 14/11/26. Follows `2026-11-14-travel-journal-redesign-design.md`, which outlined this slice and fixed one decision: the dock's round button brings in photos from the camera roll, because Adam takes his photos in the Camera app and will not take them in the journal.

Status: sections 1 and 2 follow that decision and are ready to build. Sections 3 to 5 carry new choices, marked **To confirm**.

## Problem

At the end of a day on a trip, bringing in that day's photos should be the fastest thing the journal does. Today it is not.

Measured from the code on 14/11/26:

| Today | Effect |
| --- | --- |
| The round button opens a sheet. "Choose photos" is a second tap before the iPhone's picker appears | One wasted tap and one wasted screen, every time |
| After the picker closes the sheet reads each photo one after another, then shows a review screen with "Moment 1 · 3 photos · date" cards and no thumbnails | The review cannot be judged by eye, and nothing in it is required, yet "Add N photos" must be tapped |
| Each photo's bytes are hashed three or more times and fully decoded two or three times, all on the main thread, one photo at a time | 30 photos stall the phone |
| Every change to the proposal rewrites every photo to on-device storage | More stalling |
| A photo's place is saved as coordinates only. Nothing ever gives it a name | Moments read "9:40 am" with no place until each one is edited by hand |
| Words can only be changed inside the Edit moment sheet | Fixing one typo is a sheet, a scroll and a Save |
| A new note or sound needs Save tapped, and Save can wait up to 4 seconds for a location fix | Slow, and easy to lose by swiping the sheet away |

## What a web page cannot do

These shape the design, so they are stated first.

- **It cannot see the camera roll.** The journal cannot know there are new photos, show "12 new photos from today", or bring them in by itself. Adam always chooses them in the iPhone's picker.
- **It cannot be a share target on iPhone.** "Share to Life Hub" from the Photos app is not available to a web app on iOS.
- **Live Photos arrive as stills.** The picker hands a web page one image per Live Photo. The moving part does not come with it, and the journal's storage accepts images and sound only, not video. This slice files the still. Motion is a separate piece of work (video storage, size limits, playback) and is not promised here.

## 1. One tap to the picker

The round button opens the iPhone's photo picker directly. No sheet opens first.

- The button clicks a hidden file input inside the same tap, which is what iOS requires.
- The input keeps `accept="image/jpeg,image/png"` and `multiple`. With that, iOS converts HEIC to JPEG as it hands the photos over, with the capture time and location still inside.
- Cancelling the picker leaves the journal exactly as it was.
- The old import sheet stays for one case only: finishing an import that was interrupted (see "When it goes wrong").

## 2. Photos file themselves

When the picker closes, nothing covers the story. A slim status strip sits just above the dock and the journal does the rest.

**The strip, in order:**

1. "Reading 12 photos…" with a thin progress line.
2. "Filed 12 photos into 4 moments" with **Undo**. The story scrolls to the first new moment. New moments settle in with one short fade and rise. With reduced motion they simply appear.
3. The strip leaves after 10 seconds, or when dismissed.

**How a photo is filed.** The rules are today's, without the review:

- Photos are sorted by the time they were taken. Neighbours join one moment when they are within 45 minutes and, where both have a location, within 250 metres.
- The moment takes its date and time from the earliest photo, its city from the leg whose dates contain that date, and its coordinates from the first photo that has them.
- A date outside every city's dates goes to the nearest city by date, not always the first city as it does today.

**What is not filed silently:**

| Case | What happens |
| --- | --- |
| Already in the journal | Skipped. The strip adds "3 were already here" |
| In Trash | Skipped. The strip adds "1 is in Trash" with **Open Trash** |
| No capture time in the photo (screenshots, saved images) | Not filed yet. The strip says "2 photos have no date" with **Choose a day**. That opens a small sheet showing the two thumbnails and the trip's days, today first. One tap files them |
| Not a photo the journal can read | Skipped and named: "1 file could not be read" |

**Undo.** Moves exactly the moments and photos just added to Trash in one save. It is the existing delete, so Trash can bring them back.

**Bytes.** As today: every photo goes into the phone's outbox before the journal is saved, uploads carry on in the background, and the offline status line reports them. Nothing waits for an upload.

### Speed

The work per photo is cut to what is needed once.

- One hash per photo. It is computed when the photo is read and passed along to the media row and the upload, instead of being recomputed at each step.
- One decode per photo, for its pixel size. Where the photo's own metadata gives its width and height, no decode at all.
- Three photos are read at a time instead of one.
- The interrupted-import copy is written once, when reading finishes, not after every step.

Measured before and after on Adam's iPhone with the same 30 photos: time from the picker closing to the new moments being on screen. Both numbers go in the PR. A unit test pins "one hash per photo".

## 3. Places name themselves

**To confirm: look places up automatically, at street and neighbourhood level.**

A moment filed from a photo has coordinates and no name. After filing, the journal asks for a name for each new moment that has coordinates and no place.

- The server's existing place search (`travel-places`, which already uses the Photon geocoder) gains a reverse lookup: coordinates in, a short name out.
- The name is the street or the neighbourhood with the town: "Rua da Bica", "Ribeira, Porto". It is never a shop, restaurant or hotel. The nearest business to a photo is often the wrong one, and a wrong business name in a journal is worse than none (register D1).
- Lookups run in the background after the save, one at a time. The names arrive in the story as they come back. A lookup that fails leaves the moment as it is and is tried again the next time the journal opens, a few moments per visit.
- A looked-up name is marked as such in the data, shows like any other place, and is replaced by whatever Adam types in Edit moment. Typed names are never overwritten.
- Coordinates go from the phone to Life Hub's own server and from there to the geocoder, as typed place searches already do. Nothing else about the moment is sent.

Alternative: no lookup, places stay blank until typed. Faster to build, but most of a day's moments would have no place.

## 4. Words edited in place

**To confirm: tap the words to edit them.**

- Tapping a moment's words turns them into a text field in the same place and type, with the keyboard up. A long entry opens fully first.
- A moment with no words shows a quiet "Add a line" under its time and place. Only the owner sees it.
- Leaving the field saves. A **Done** button sits above the keyboard. Escape puts the old words back.
- A failed save keeps the field open with the new words in it and says why (register V5).
- Partner's lines keep the rule the Edit moment sheet has today.
- Date, time, place, photos, sound and meal stay in Edit moment.

Alternative: a small pencil beside the words instead of tapping them. Safer against accidental taps, one more thing on every moment.

## 5. Notes and sound without Save

**To confirm: closing the sheet keeps what is in it.**

The dock's Moment button opens the same sheet as today, with two changes.

- There is no Save button. **Done**, a swipe down, Back or a tap outside all keep the moment, as long as it has words, a photo or a sound. An empty sheet just closes.
- **Discard** is the one way to throw it away, and asks once.
- After it closes, a toast says "Moment added" with **Undo**.
- Saving no longer waits for a location fix. The moment is saved at once with the fix it has. If a better one arrives within a few seconds it is added in a second save.

The draft autosave stays, so a killed tab still loses nothing.

## When it goes wrong

- **The journal save fails.** The strip turns to "Could not save. Your photos are safe on this phone." with **Try again**. The photos stay in on-device storage, as an interrupted import does today, and the old import sheet can finish the job later (register V5).
- **The phone is out of space.** The strip says so and stops. Nothing is half-filed.
- **Offline.** Photos file as normal and upload later. Place names wait for a connection.
- **The picker returns 100 photos.** Read three at a time with the progress line moving. The dock stays usable. A second import cannot start until the first has finished.
- **Back while the strip is up.** The strip is not an overlay and takes no history entry (register R7 applies to the "Choose a day" sheet only).

## Structure

| File | Change |
| --- | --- |
| `journal/import-run.ts` (new) | Reads, hashes once, groups and commits a set of files with no UI. Returns what was filed, skipped and left undated. The import sheet and the strip both use it |
| `journal/story/import-strip.ts` (new) | The status strip and its states |
| `journal/undated-sheet.ts` (new) | "Choose a day" for photos with no date |
| `journal/import-group.ts` | Nearest city by date |
| `journal/exif-worker.ts`, `media-upload.ts` | Hash once, decode at most once |
| `journal/import-sheet.ts` | Only resumes an interrupted import |
| `journal/story/dock.ts`, `render-journal.ts` | Round button opens the picker; new moments settle in |
| `netlify/functions/travel-places.mjs`, `journal/place-lookup.ts` (new) | Reverse lookup and its queue |
| `journal/story/moment-card.ts`, `journal/inline-words.ts` (new) | Words in place |
| `journal/capture-sheet.ts` | No Save button, no wait for location |

## Checks before it ships

| Entry | Check for this build |
| --- | --- |
| R2 | At 390, no sideways scroll with the strip showing its longest line ("Filed 12 photos into 4 moments · 3 were already here") |
| R4, R6 | The strip sits above the dock and the tab bar and covers neither. Undo, Choose a day and Try again are at least 44px tall |
| R7 | With "Choose a day" open, Back closes it and leaves the hash unchanged |
| V5 | A failed save, a full phone and an unreadable file each name their reason on screen |
| V7 | After filing, the view and scroll position are the new moments in Story, whichever view the button was pressed from |
| D1 | No looked-up place is a business name. A test feeds a restaurant result and expects the street |
| I8 | Escape in the in-place field restores the words and does not close anything else |
| P4 | Nothing on screen mentions Live Photo motion, video or anything else not built |

Tests: unit tests for the import run (grouping, nearest city, duplicates, undated, undo, one hash per photo), the strip's states, the reverse lookup's naming rule, in-place editing and the sheet that saves on close. The browser spec gains: tap the round button, choose three photos, and see them filed with no sheet.

## To check on Adam's iPhone

A browser test cannot stand in for these.

1. Choosing a Live Photo gives one still, with its time and place.
2. HEIC photos arrive as JPEG with time and place. If the picker's Options has Location switched off, photos arrive with no place, and the journal can only file them by time.
3. The before and after timing for 30 photos.
4. The keyboard's Done button and the in-place field sit above the keyboard, not under it.

## Order of work

In order of what matters most on the road.

1. Sections 1 and 2: one tap, self-filing, the strip, undo and the speed work.
2. Section 3: place names.
3. Sections 4 and 5: words in place, and the sheet that keeps what is in it.

## Out of scope

Live Photo motion and any video, bringing photos in without the picker, cropping or reordering photos during import, and changes to the Edit moment sheet beyond what in-place editing replaces.
