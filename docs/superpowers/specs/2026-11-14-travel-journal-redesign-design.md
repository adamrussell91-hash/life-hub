# Travel journal redesign: story, keepsakes, map and noticing

Date: 14/11/26. Direction approved by Adam in chat on 14/11/26, from a tap-through phone prototype built on the invented Lisbon and Porto test trip.

This document covers the whole redesign in outline and specifies slice 1 in full. Slices 2 to 4 each get their own spec before they are built.

## Problem

Adam rated the journal on a phone 2 out of 10: clunky, slow, basic. Walking the current journal at 390px with the fixture trip showed why.

- Six taps from the trip page to a saved photo, through a form with Cancel and Save.
- The first third of the screen is the page header, the trip title and three navy buttons of equal weight.
- Photos use 73% of the screen width and cannot be opened.
- Days are labelled `01/03/26`. Nothing says which day of the trip it is.
- The moment menu is a popover that opens underneath the tab bar and hides its lower actions.
- Add moment scrolls away with the page.
- Souvenirs are a list behind More. Nothing about the journal is specific to travel.

## Direction

The journal becomes a travel object. Four ideas carry it.

1. **A story.** A cover, chapters per city, days numbered from the start of the trip, photos edge to edge.
2. **Keepsakes.** Tickets, posters, coasters and labels sit in the story where they were picked up, and together on one board. Flight and train bookings become kept tickets without any work. Each city gets an arrival stamp.
3. **The map is the stage.** Each day opens on its route. Relive plays the trip across the map, with the light changing with the time of each moment.
4. **The journal notices things.** During the trip it tells Adam things he would not have gone looking for, drawn from this trip, past trips, the photos themselves and the rest of Life Hub, including the bucket list and dreams jar in Tasks.

### Decisions made on 14/11/26

| Decision | Choice |
| --- | --- |
| Bottom bar | Trip, Today, Journal, More. Trips moves under More. |
| Main dock button | Brings in photos from the camera roll. Adam takes his photos in the Camera app as Live Photos, not in the journal. |
| Bookings | Flights and trains become keepsakes automatically, each removable. |
| Noticing sources | This trip, all past trips, the photos themselves, and the rest of Life Hub. Bucket list and dreams jar are named sources. |
| Noticing wording | Warm and plain. "You have wanted this since 2024", never "You asked for this". |
| Build order | Slice 1 first. |

### Binding UI revision 2: what this replaces

`docs/future-build-ideas/travel-journal-spec-plan.md` holds the earlier binding UI contract. Adam's approval of this direction replaces these parts of it for the journal. Everything else in that contract still holds.

| Earlier rule | Now |
| --- | --- |
| Add moment sits in the toolbar, never floating | A dock floats above the tab bar |
| Dates stay `dd/mm/yy` in the reading view | Day headers read "Day 3" and "Friday 5 March". Stored dates and editors are unchanged |
| Times use 24 hour `HH:mm` | The reading view shows `9:40 am`. Editors are unchanged |
| Timeline gutter and thread beside every moment | No gutter on phone. Photos run edge to edge. A short dotted stitch between moments carries the thread |
| Pattern opacity capped at 0.12 behind text | The pattern runs at full strength in a band above the chapter title, with no text on top of it |
| Page header stays above the journal | On phone the cover replaces the page header on the journal route. Desktop keeps the header |
| No navy bands | The journey between two cities is a navy band |
| Four or more photos show a lead, two squares and "View all" | Two or more photos are one swipeable row with a count |
| Souvenirs are optional enrichment behind More | Keepsakes are a main view |
| No playback | Relive, in slice 3, started only by a tap |

Kit tokens, type and the shared mobile bar stay as they are. No shared kit file changes.

## The four slices

| Slice | Ships | Depends on |
| --- | --- | --- |
| 1. Story and keepsakes | New reading view, photo viewer, keepsakes, Journal tab, dock that opens the existing sheets | Nothing |
| 2. Getting things in | Photos brought in with no form where time and place are clear, notes and sound saved without Save, words edited in place | Slice 1 |
| 3. Map and Relive | Map view with a slider through the trip, Relive on the map | Slice 1 |
| 4. Noticing | The "journal noticed" cards, kept noticings pinned in the story, bucket list and dreams jar ticks | Slice 1 for pinning. The cards could ship alone |

## Slice 1: story view and keepsakes

### Nothing is lost

Every control in the current journal has a named new home (register I6, R5).

| Today | Slice 1 |
| --- | --- |
| Add moment (toolbar) | Dock, "Moment" button. Opens the existing New moment sheet |
| Import photos (More) | Dock, main round button. Opens the existing import sheet |
| Chapter | The ribbon's day numbers |
| Search journal, Print, Export, Share, Trash (More) | Journal options sheet, opened from ⋯ on the cover and on the ribbon |
| Souvenirs (More) | Keepsakes view |
| Partner's lines toggle | Journal options sheet |
| Refresh (page header) | Journal options sheet on phone. Header on desktop |
| Moment ⋯ popover | Bottom action sheet with the same actions and the same reasons on disabled ones |
| Day map preview at the end of a day | Under the day header |
| Add moment on an empty day, Read more, Load earlier and Load more, photo notes toggle, journey details on a transition, pattern off, offline status | Unchanged in behaviour |

### What the phone shows, top to bottom

**Cover.** A full-width photo with the trip title over it.

- Photo: the journal preference `cover_media_id` if set, else the first photo of the trip. With no photos, a field of the first city's accent colour.
- Eyebrow: "Journal · Day 4 of 5" during the trip, "Journal · starts in 12 days" before, "Journal" after.
- Title and dates.
- One stats line: days, cities, photos, keepsakes. No distances (register D1: the journal does not track movement).
- Back to the trip at top left. Search and ⋯ at top right.

**Ribbon.** Sticks to the top once the cover has scrolled away.

- One round button per day, numbered from the trip's first day and grouped under the city name. The day on screen is filled. Today carries a dot. Days after today are dashed and disabled.
- The row scrolls sideways and keeps the current day in view.
- A view switch at the right: Story, Photos, Keepsakes. Map joins in slice 3 and is not drawn before then (register P4).
- Tapping a day scrolls the story to it. In Photos and Keepsakes it returns to Story first.

**Chapter opener**, one per city.

- A band of the city's pattern where one is bundled (`journal/patterns/registry.ts`), else the city's soft accent colour.
- "Chapter 1 · 3 – 5 March", the city name in the display face, and "2 days · 6 moments · 3 keepsakes".
- The arrival stamp, at the right.

**Day header.**

- "Day 3", "Friday 5 March", and a Today tag on the current day.
- Under it: the number of moments and the sunset time. Sunset is worked out from the city's centre and the date, shown in the city's time zone, and left out when the city has no centre.
- The day map (the existing `createDayMapPreview`), 132px tall, with stops numbered in order.

**Moment.**

- Photos first, full width with no radius on phone. One photo keeps its own shape, clamped between 4:5 and 3:2. Two or more sit in one row that swipes sideways, each 88% wide so the next one shows, with "1 / 3" at the corner.
- Then time, place and ⋯ on one row. ⋯ has a 44px target and sits clear of the text (register L13).
- Then the words at 17px, with Read more as now.
- A moment with words and no photo is set larger on a pale blue band.
- A meal shows a "Meal" chip that opens the existing meal sheet.
- Sound: a play button, a plain progress bar and the length. No drawn waveform, because the app has no waveform data (register C2).
- Between two moments that both have a place: "1.3 km away · 1 h 35 min later". The distance is the straight line between the two points and is worded as distance apart, never as distance walked.

**Journey between cities.** A navy band with the date, the mode, "Lisbon to Porto", the two times and station names from the linked booking, and the kept ticket under it. Journey details and label edits stay as they are.

**Dock.** Floats above the tab bar. Three buttons: Keepsake, the round Photos button, Moment. It slides away while the page scrolls down and returns when scrolling stops or reverses. It is hidden while a sheet or the viewer is open.

### Photo viewer

- Opens from any photo in the story or the Photos view, growing from the photo that was tapped.
- Shows the whole photo. Swipe sideways through every photo of the trip in story order. Previous and Next buttons show on devices with a pointer.
- Drag down, the close button, Escape or Back closes it. It mounts through `presentJournalOverlay` so Back never leaves the journal (register R7).
- Caption: "Day 3 · 4:45 pm · Cais da Ribeira" and the moment's words. Tap the photo to hide or show the caption and buttons.
- Pinch to zoom, using `lib/zoomable.ts`, tested in WebKit as well as Chromium (register C4).
- One action: Use as cover.
- The photo notes toggle moves here from the story.

### Photos view

Every photo of the trip in a three-column grid, grouped under "Day 1 · Lisbon". The first photo of each day is double size. Tap opens the viewer.

### Keepsakes

**What one is.** A keepsake extends the existing souvenir record (`preferences.journal_souvenirs_v1`) with optional fields.

| Field | Meaning |
| --- | --- |
| `kind` | `ticket`, `poster`, `round` or `other`. Sets the shape the photo is cut to |
| `source` | `photo` (Adam photographed it) or `booking` (made from the itinerary) |
| `item_id` | The itinerary item, for a booking keepsake |
| `leg_id`, `local_date`, `local_time`, `coordinates` | Where and when, when there is no linked moment |

Existing souvenirs have none of these and read as `kind: other`, `source: photo`.

**From bookings.** Every flight and train on the itinerary that passes `isVerifiedItineraryTicket` shows as a drawn ticket: carrier and number, from and to, date and departure time. The booking reference is never drawn. These are worked out when the journal renders and are not stored. Removing one stores a deleted souvenir row with its `item_id`, which hides it. Trash restores it.

**Arrival stamps.** One per city: country, city, arrival date. Worked out from the leg and the trip city. Shown on the chapter opener and the board. Not removable.

**Keeping one.** The dock's Keepsake button opens a sheet with four choices: ticket or pass, poster or flyer, coaster or label, anything else. Choosing one opens the photo picker with `accept="image/*"`, so the phone offers camera or library. The photo goes through the existing outbox upload. The keepsake is filed under today's day in the current city, with the phone's location when it is available. "Keep as a keepsake" on a moment's action sheet replaces "Add souvenir" and links to that moment.

**In the story.** A keepsake sits after the moment it is linked to, or in time order within its day. It is drawn at a slight angle with a strip of tape, beside "Kept: tram ticket" and its time and place. Booked tickets sit at the journey between cities, marked "Kept automatically from your booking".

**The board.** The Keepsakes view. A heading with the count and a "Keep something" button, then one section per city: the arrival stamp, then that city's keepsakes laid out loosely at small angles. Tap one for a sheet with the keepsake large, its name, day, time, place and note, and "Go to that day".

**Sharing.** Keepsakes and stamps are left out of the public share view and the export in this slice. They join after the same privacy review the journal share had.

### Sheets

The journal options sheet, the moment action sheet, the Keep something sheet and the keepsake sheet are bottom sheets mounted through `presentJournalOverlay`. Each has a drag handle, sits above the tab bar, has an opaque surface, and keeps rows at least 44px tall (register R4, R6, S3). Escape does not close a sheet while a text field in it has focus (register I8).

### Journal tab

`shell.ts` changes the three primary destinations to Trip, Today and Journal. Journal opens the journal of the trip that Today would pick. Trips moves to the top of the More sheet. On desktop the rail gains Journal and keeps Trips.

### Desktop

At 720px and wider the same pieces sit in the existing 48rem story column under the kit page header. Photos get the card radius. The cover is capped at 420px tall. The dock sits at the bottom of the column. Layout rules that depend on the column use container queries (register R9).

### Structure

`render-journal.ts` keeps loading, pagination, reconcile and overlay ownership. The new pieces are small modules with one job each.

| Module | Job |
| --- | --- |
| `journal/story/cover.ts`, `ribbon.ts`, `chapter-opener.ts`, `day-header.ts`, `stitch.ts`, `journey-band.ts` | Build one piece of the story from journal data |
| `journal/story/moment-card.ts`, `photo-row.ts`, `sound-player.ts` | A moment and its media. Replaces the layout in `render-moment.ts`, which is removed, not kept beside it (register V8) |
| `journal/story/dock.ts`, `options-sheet.ts`, `action-sheet.ts` | Controls |
| `journal/photo-viewer.ts`, `journal/photos-view.ts` | Viewer and grid |
| `journal/keepsakes/model.ts` | One ordered list of keepsakes from souvenirs, bookings and legs |
| `journal/keepsakes/draw.ts` | Shapes, drawn tickets, stamps |
| `journal/keepsakes/board.ts`, `keep-sheet.ts`, `keepsake-sheet.ts` | Board and sheets |
| `journal/trip-days.ts` | Day numbers, "Day 4 of 5", long dates, 12 hour times |
| `lib/sun.ts`, `lib/distance.ts` | Sunset time and straight-line distance, as pure functions |
| `styles/journal-story.css`, `styles/keepsakes.css` | Styles, kit tokens only |

Server: `travel-journal-schema.mjs` accepts the new souvenir fields and `cover_media_id`. The mock API serves a journal with keepsakes so local screenshots are honest.

### States and errors

- **Empty journal.** The cover in the city's accent colour, "Your story starts here", and the dock. No invented moments.
- **A day with no moments.** The day header, "Nothing from this day yet", and the dock.
- **Photo still uploading or failed.** The existing media states, drawn inside the edge-to-edge frame.
- **Keepsake photo fails to save.** The sheet stays open and says why, as the capture sheet does (register V5).
- **A rebuild after a save** keeps the view Adam chose and his scroll position (register V7).
- **Reduced motion.** No grow or slide. Sheets and the viewer appear in place.

### Checks before it ships

Each maps to an entry in `docs/CURSOR-UI-FAILURES.md`.

| Entry | Check for this build |
| --- | --- |
| R2 | At 390, `scrollWidth === innerWidth` in Story, Photos and Keepsakes, with a photo row scrolled sideways |
| R3 | A 390 screenshot of each new piece: cover, ribbon, chapter opener, day header, each kind of moment, journey band, board, each sheet, viewer |
| R4, R6 | Every sheet's bottom edge is above the tab bar, and every row and button is at least 44px tall |
| R5, I6 | Every row of the "Nothing is lost" table is reachable by tapping at 390 |
| R7 | With the viewer or a sheet open, `history.back()` closes it and leaves the hash unchanged |
| L13 | The ⋯ button's box does not overlap the time, place or words of any moment |
| V7 | After saving a keepsake from the Keepsakes view, the view is still Keepsakes |
| V8 | `render-moment.ts` no longer exists and nothing imports it |
| C2, D1 | No waveform is drawn. No text says "walked" or "on foot" |
| C4 | Pinch zoom and drag to close pass in WebKit |
| D3 | Screenshots use the invented fixture with real-shaped photos, not grey boxes |
| T1 | Every size comes from a kit type token |
| P4 | No Map tab, Relive button or "noticed" entry appears in this slice |

### Testing

- Unit (vitest and happy-dom): day numbers across cities and before, during and after a trip; long dates and 12 hour times; sunset for a known place and date; distance wording; the keepsake list from souvenirs, bookings and legs, including a removed booking and a restored one; old souvenirs reading as `other`; the cover's photo choice; the ribbon's states; the action sheet carrying every old menu action; the nav change.
- Browser (Playwright, iPhone profile, Chromium and WebKit): the checks in the table above; open, swipe and close the viewer; keep a ticket and see it in the story and on the board; remove a booked ticket and restore it from Trash.
- Updated: `journal-render.test.ts`, `journal-layout.test.ts` and `moment-menu.test.ts`, which pin the old toolbar, photo layouts and popover.
- Gates: Travel typecheck, vitest and build, then `npm run pre-pr-check`.

## Later slices in outline

**Slice 2, getting things in.** The round button brings in the day's photos. Where a photo carries a time and place, it is filed with no review step. Notes and sound save when closed. Words are edited in place. To check before specifying: whether the iPhone photo picker hands a web page the moving part of a Live Photo, or only the still.

**Slice 3, map and Relive.** A Map view on MapLibre with every moment and keepsake pinned, and a slider that moves through the trip one stop at a time. Relive plays the same thing: arrival stamps, the route drawing itself, photos lifting off their place, the journey between cities, and a map style that shifts from morning to night with the time of each moment.

**Slice 4, noticing.** A short set of cards during the trip, one noticing each, with its source and what it is based on.

- Worked out exactly, no AI: this trip (habits, firsts, streaks) and past trips (records and echoes).
- Matched across Life Hub: Someday items in Tasks with `someday_kind` of `bucket_list` or `dreams_jar` and their origin date, the diary, the food journal and the bookshelf.
- Seen in the photos: a server-side model pass each evening of a trip.
- A bucket list or dreams jar match offers "Tick it off in Tasks", and writes to Tasks only after that tap.
- Each card offers "Keep in the story", which pins it beside the moment it is about, and "Not right", which removes it and stops it being suggested again.
- A noticing with no evidence to show is not shown.
- Noticings are for the owner only and never appear in a share or export.

## Out of scope

New city patterns, cropping or straightening keepsake photos, removing the background from a keepsake photo, and any change to the itinerary pages.

## Open questions

1. Which trip this must be ready for, and its departure date.
2. Which hubs the Travel server functions can read today. The diary is the least certain.
3. Live Photos through the web photo picker (see slice 2).
