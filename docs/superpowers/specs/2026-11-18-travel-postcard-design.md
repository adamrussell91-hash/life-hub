# Travel postcards on check-ins — design

Date: 18 November 2026
Hub: Travel
Status: approved, not built
Mockup: `docs/mockups/travel-postcard.html`

## Purpose

A check-in today is a safe tick on a stop, with an optional photo that people on the public link see as a thumbnail. The photo says where the owner is and nothing else.

The photo becomes a postcard. The front is the photo. The card turns itself over, and the back carries a voice clip of up to 30 seconds, the same words in handwriting, the address the photo was taken at, a stamp for the leg of the trip and an ink postmark. The people on the link get something worth opening, and each postcard is a keepsake the journal can pick up later.

## Decisions

| Question | Answer |
|---|---|
| Where it lives | It replaces the "Photo" add-on on a stop that is ticked safe. The tick stays one tap and never waits on a postcard. |
| The words | The clip is transcribed while the owner is on the sheet. The owner reads and corrects the words before posting. |
| Where followers find it | On the stop, and in a stack at the top of the public link that counts the ones this device has not opened. |
| When the handwriting appears | It writes on once, as the card turns over. Playing the voice does not move the words. |
| Storage | The postcard is extra detail on the check-in. No new document. |
| Journal | A second build, straight after. See the last section. |

## Sending a postcard

A stop that is ticked safe and has no postcard shows a **Postcard** button where **Photo** is now. It opens a sheet (a bottom sheet on a phone) with four parts and a docked action row.

1. **Photo.** A labelled **Choose photo** button, then a preview with the file name and **Remove**. On choosing, the phone reads the photo's location, decodes it, notes whether it is portrait or landscape (wider than tall or square is landscape), and makes the 1600px JPEG copy that is uploaded. That copy carries no location, as now. A file the browser cannot decode is refused: "That photo can't be read. Try a different one."
2. **Voice, optional.** **Record** starts the clip and shows "0:07 / 0:30". **Stop** ends it, and it ends itself at 30 seconds. Afterwards: a player, **Record again** and **Remove**. Recording uses the phone's normal voice processing, and asks for `audio/mp4` first so the clip plays on every phone. If the microphone is refused: "Microphone access was not allowed. You can still post the photo and type the words."
3. **Words.** A text box, at most 600 characters, with a count. When a clip stops it is uploaded and sent for transcription, and the box shows "Writing out what you said…" while staying usable. The transcript fills the box only if the owner has not typed in it. If transcription fails: "Couldn't write out the words." with **Try again**; the owner can also type them or leave the box empty.
4. **Sent from.** Up to four short lines, each at most 60 characters, filled in from the photo's location and editable. Blank lines are dropped. If every line is blank, the city and country are used.

Actions: **Preview** (opens the card exactly as followers will see it), **Post postcard**, **Cancel**. Posting needs a photo and nothing else. While it runs the button reads "Posting…". A failure keeps the sheet open and says why.

Everything the owner makes is kept on the phone from the moment it exists: the shrunk photo, the clip, the words and the address. It is removed once the server confirms the postcard. Closing the sheet keeps the draft, and opening Postcard on that stop again restores it. **Discard draft** deletes it.

### The address

1. The photo's own location, looked up to street level: street (never a house number, never a business name), then neighbourhood, then postcode and city, then country.
2. If the photo has no location or the lookup fails: the stop's place name, then the city, then the country.

The coordinates themselves are never stored on the postcard and never sent to followers.

## The card

One component draws the card everywhere it appears: the preview, the owner's view and the public link. It is sized in em from the card's own width, so it scales as one object.

- **Front.** The photo, edge to edge inside a white border. A portrait photo makes a 2:3 card, a landscape photo a 3:2 card.
- **Back.** "Sent from" and the address lines in handwriting; the stamp and postmark top right; the words in handwriting on ruled lines; then the play button, a progress line and the clip length.
- **Stamp.** A perforated stamp showing the city scene of the stop's leg (the scene artwork the city header already uses, cropped to its centre, not animated), "Day N" of the trip and the country. Day 1 is the trip's start date.
- **Postmark.** A round ink mark in the leg's ink colour: the city, the country, and the local date and time the postcard was posted, in the city's time zone. Wavy cancel lines run across the stamp.
- **Layouts.** A landscape card 480px wide or more has the classic divided back: words left, stamp and address right. Narrower cards and all portrait cards stack: address and stamp on top, words below. On a narrow landscape card the address shows as two lines.
- **Fitting the words.** The handwriting steps down from 2em to 1.5em of the card's own em, in steps of 0.1, until the words fit. If they still do not fit at 1.5em, the words scroll inside the card. Nothing is clipped.
- **A picture with words beside it.** The stamp and postmark are drawn, and small. Wherever a card is shown at full size, the same facts sit under it as ordinary text: the first address line and the city, then the local day, date and time.
- **Missing parts.** No voice: no play row. No words: empty ruled lines. An older check-in photo with neither still gets a card, with the fallback address.

Handwriting is set in Caveat, added to the hub's existing Google Fonts link.

### Turning over

The front shows for 2.4 seconds, the card turns in 0.9 seconds, and the words write on, word by word, over about 2.6 seconds. Then it is still. Tapping the card, or **Turn over** under it, turns it either way. With reduced motion on, the card starts on the front and waits for **Turn over**; the turn is instant and the words are simply there.

The voice plays only from the play button. It stops when the card turns back, when another card is shown and when the view closes. If it cannot load: "Couldn't play the voice. Try again." The words stay.

## What followers see

**On the stop.** A small postcard, slightly tilted, where the photo thumbnail sits. It opens the view at that card.

**At the top of the link.** When the trip has at least one postcard, a block under the last check-in line: up to three cards fanned, newest on top, and

- "3 new postcards" (or "1 new postcard") when this device has not opened some of them, otherwise "4 postcards" (or "1 postcard");
- "Latest: Jalan Alor, Kuala Lumpur" (first address line, then the city);
- "21:40 · 28 seconds of voice" (the voice part only when there is a clip).

The whole block is one button.

**The opened view.** One card at a time on a dark ground, with Close and "2 of 4", and under the card its place and time in plain text ("Central Market, Kuala Lumpur" and "Wed 18 Nov, 17:22"). Opened from the stack it starts at the oldest postcard this device has not opened, or the newest if all have been opened. **Older** and **Newer** move through every postcard on the trip, as do a swipe and the arrow keys. A row of small cards along the bottom, oldest first, jumps to any card; the current one is outlined and unopened ones carry a dot. Back, Escape and Close leave the view and stay on the page.

A postcard counts as opened once its back has been shown. That is remembered in the browser, per trip. A new device or cleared browser data shows everything as new again. If the browser refuses storage, nothing is marked new and everything else works.

Postcards are ordered by when they were posted, oldest first, with the check-in id as the tie-break.

**The owner's side.** The same small postcard on the stop and the same view, plus **Remove postcard**. It asks in the view itself: "Remove this postcard? Its photo and voice are deleted for everyone on the link." with **Remove** and **Keep**. The stop keeps its safe tick and offers **Postcard** again. There is no stack on the owner's page.

## Data

A check-in gains one optional field. The check-in that carries it is the stop's latest one at the time of posting; its own time does not change, so the safe time followers see stays the time of the tick.

```ts
interface Postcard {
  photo_id: string;                      // tph_…
  orientation: 'portrait' | 'landscape';
  address: string[];                     // 1 to 4 lines, each at most 60 characters
  posted_at: string;                     // ISO instant
  audio_id?: string;                     // tau_…
  audio_s?: number;                      // whole seconds, 1 to 30; only with audio_id
  text?: string;                         // at most 600 characters
}
```

The check-in's existing `photo_id` is set to the same photo, so a browser still running the old code shows the thumbnail it always did.

For any reader, a stop's postcard is taken from the latest of its check-ins that has `postcard` or `photo_id`. A check-in with only `photo_id` (made before this build) reads as a postcard with the photo, the check-in's time, the fallback address, and an orientation measured when the image loads.

## Server

- **`/api/travel-audio`** (new). `POST ?trip=` with a multipart `file` stores a clip beside the check-in photos and returns `{ audio_id }`. Signed-in owner only; `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/mpeg` or `audio/wav` with any codec suffix ignored; at most 2 MB. `GET ?id=&token=` serves it to a live trip link, or to the owner's session, with byte ranges (`206`, `416`) so iPhones can play it, using `parseByteRange`. `DELETE ?id=` for the owner. Same origin guard and private caching as the photo route.
- **`/api/travel-transcribe`** (new). `POST ?trip=` with `{ audio_id }` reads the clip, sends it to the transcription service the hub already uses (`knowledgeKernelFetch('/transcribe')`) with a 20 second limit, and returns `{ text }`: trimmed, whitespace collapsed, cut to 600 characters. Signed-in owner only, ten calls a minute, function timeout 26 seconds. The service not being connected is a 503, a slow or failed call a 502. The text is never logged.
- **`/api/travel-postcard`** (new). `PUT ?trip=&item=` with `{ if_version, postcard }` checks the fields against the limits above, checks the photo and clip belong to the trip, sets `posted_at`, writes the postcard onto the stop's latest check-in and returns the trip and version. No check-in on the stop: 400, "Tick this stop safe first." A check-in on the stop already has `postcard` or `photo_id`: 409, "This stop already has a postcard. Remove it first." `DELETE ?trip=&item=` with `{ if_version }` removes `postcard` and `photo_id` from every check-in on the stop, saves, then deletes every photo and clip those check-ins named. A failed delete of the files is logged and does not fail the request.
- **`/api/travel-places`**. The reverse lookup also returns `address: { street, district, postcode, city, country }`, built with the same rules as the name it already returns.
- **Public link.** `redactTrip` adds `postcard` to a stop it already shows: the check-in id, the posted time, the photo and clip ids, orientation, address lines, clip length and words. A private or medical stop is still dropped whole, so its postcard goes with it.
- **Share tokens.** The lookup "token to live trip" exists in the photo route and the public route. It moves to one shared helper that the audio route uses too.

## Client

New folder `apps/travel/src/postcard/`:

| File | Job |
|---|---|
| `model.ts` | The types; `listPostcards(trip)` for the owner's trip and the public trip alike; the stamp and postmark facts (city, country, colours, scene, day number, local date and time); the fallback address. |
| `card.ts` | Draws the card and runs the turn and the write-on. |
| `stamp.ts` | Builds the stamp and the postmark. |
| `viewer.ts` | The opened view, mounted through the overlay host the journal uses. |
| `stack.ts` | The block at the top of the public link. |
| `seen.ts` | What this device has opened. |
| `composer.ts`, `composer-state.ts` | The sheet, and its state as a pure function. |
| `draft.ts` | The draft on the phone. |
| `voice-clip.ts` | The 30 second recorder. |
| `photo-place.ts` | The photo's location and the address lines. The EXIF reader loads only when a photo is chosen. |

Changes elsewhere: `api/travel.ts` gains the calls above; `views/day-list.ts` swaps the Photo button and thumbnail for Postcard and the small card; `views/trip-page.ts` opens the composer and handles Remove; `views/public-trip.ts` mounts the stack; `components/safe-photo-sheet.ts` is deleted, while `lib/safe-photo.ts` keeps the photo shrink and the failure wording; `scripts/mock-api.ts` gains the new routes; a new `styles/postcard.css`. Images and audio from the API set `crossOrigin` before `src`.

## Other cases

| Case | What happens |
|---|---|
| No signal while composing | The tick has already been saved. The draft stays on the phone. Posting says "Couldn't reach the server. Check your signal and try again." |
| Someone else changed the trip meanwhile | The post fetches the latest trip and tries once more. |
| The owner types while the transcript is on its way | The typed words win. |
| The stop is made private after posting | The stop and its postcard leave the public link. |
| The public link is turned off | The photo and the clip stop loading with it, as photos do now. |
| A draft is discarded or a clip re-recorded | The uploaded clip is deleted. |

## Not in this build

- The journal keepsake.
- Telling followers a new postcard has arrived.
- A postcard without a stop, or from the "I'm safe" button on Today.
- Editing a postcard after posting. Remove it and send it again.
- More than one postcard on a stop.
- Words that keep time with the voice.

## Failure modes checked (docs/CURSOR-UI-FAILURES.md)

- **I9** a save waits on slow side work: the safe tick is not touched. Posting does not wait on transcription. Check: a unit test whose transcription call never resolves still sees Post resolve.
- **W8** captured work held only in memory: the draft is in IndexedDB from the first photo or clip. Check: record, cut the network, close the sheet, reload, open Postcard on the stop: the photo, clip and words are back.
- **V5** save failure hides the reason: each failure names itself and keeps the sheet open; a version conflict is retried once. Check: unit tests for a 409 then success, a 413, a timeout and a refused field.
- **W9** a save ignores the server's reply: posting and removing adopt the returned trip and version. Check: post on one stop then tick another without reloading; both save.
- **V6** an async close removes the next sheet: Preview opens over the composer and each closes only itself. Check: a unit test opens Preview, closes it, and the composer is still in the page.
- **V8** two renderers for the same data: preview, owner and public all call `card.ts`, and all lists come from `listPostcards`. Check: grep finds one place that builds `.postcard__back`.
- **V1** `[hidden]` doesn't hide: the play row, the transcript notice, the draft notice and the confirm card use `hidden` with a matching rule. Check: computed `display` is `none` in each hiding state.
- **V12 / V13 / S3** sheets: the composer and the view mount inside their backdrops through the overlay host and are opaque. Check: at 390, the centre point of each is inside it and its opacity is 1, with reduced motion off.
- **R4** form sheets on iPhone: the text box and address inputs are 16px or more below 720px; the action row is docked, 44px tall and padded for the home bar. Check: at 390, each field's computed font size is 16px or more, and every action button is 44px tall and inside the viewport with the sheet scrolled to its top and to its bottom.
- **R7** Back leaves the page: Back closes the view or the sheet. Check: open each, `history.back()`, the hash is unchanged and the overlay is gone.
- **R2 / R3** phone: no horizontal scroll at 390 on the public link, in the view or in the sheet. Check: `scrollWidth` equals `clientWidth` in each, for a portrait and a landscape card.
- **I8** Escape while typing: Escape in the words box or an address line does not close the sheet. Check: a unit test.
- **I10** browser dialogs: Remove asks in the view. Check: no `window.confirm` or `window.alert` in `src/postcard/`.
- **I18** raw file input: **Choose photo** is a labelled button. Check: no "Choose File" text at 390 or 1280.
- **I3** dead buttons: **Older** and **Newer** are disabled at the ends; **Post postcard** is disabled with no photo and says so. Check: unit tests.
- **W13** API media with no origin: the photo and the clip set `crossOrigin = 'use-credentials'` before `src`. Check: DOM tests for both, and a server test that a request with no `Origin` and `sec-fetch-site: same-site` gets 403 from the audio route.
- **W4** heavy library in the entry bundle: the EXIF reader is imported on demand. Check: the entry chunk does not grow by its size.
- **W2** works in tests, not wired: one test drives the trip page's own Postcard button through to the saved trip. Check: the implementation plan names that test.
- **W12** class names in use: `postcard` names are grepped in `styles/` before use.
- **T3** SVG text in a scaled viewBox: the postmark's lettering is too small to rely on at phone width, so its facts are also plain text under the card. Check: at 390 the caption under an opened card is 12px or more and names the place, date and time.
- **C7** negative elapsed in rAF: the write-on clamps elapsed to zero. Check: no `pageerror` across three cold loads.
- **C4** gestures only tested in Chrome: swipe uses pointer events with the buttons as the fallback. Check: the owner tries it on an iPhone before the trip.
- **M1** motion that never rests: after the write-on nothing moves. Check: two screenshots three seconds apart are identical.
- **M2** two opacity channels: words are shown and hidden by one class. Check: after the write-on every word has computed opacity 1, and with reduced motion they do from the start.
- **D1** made-up precision: no house number is shown unless the owner types one. Check: a server test with a house-numbered result.
- **D2** item placed by the wrong date: the postmark date and "Day N" use the city's time zone, and the order is `posted_at` then id. Check: a model test with a post at 23:30 local that is the next day in UTC.
- **D8** lookup miss loses the label: a failed lookup falls back to the stop and city. Check: a model test.
- **P1 / P5** compare with the mockup, whole build: every state is checked against the mockup at 1280 and 390, and every section of this spec is ticked or named as left out in the PR.

## Verify

- Server tests: the audio route (types, size, trip, link token, a journal token refused, ranges, origin guard, delete), the transcribe route (text returned, a call that never answers, the service not connected, another trip's clip, the rate limit), the postcard route (each limit, attaches without moving the check-in's time, both refusals, remove, a stale version), the redaction (fields present, no coordinates, private stop, older photo), the address parts.
- Travel unit tests: the model, the card (words and address escaped), the view (order, opened state, reduced motion, ends of the list), the stack's wording, the composer, the draft, the day list.
- In the running app against the mock API at 1280 and 390, with Chromium's stand-in microphone: tick a stop, compose with a portrait photo and a clip, preview, post, open it, remove it; then a landscape photo with typed words and no clip. Open the public link, read the stack, open it, go older and newer, reload and see the count drop.
- Not testable here: a real phone microphone and the real transcription service. The owner's first clip from a phone is that test.

## Second build: journal keepsake

`listKeepsakes(journal, trip)` already derives flight tickets and arrival stamps from the trip. It gains a `postcard` keepsake built from `listPostcards(trip)`, the board draws it with the same small card, and tapping it opens the same view. Nothing is copied into the journal. It gets its own spec when it starts.
