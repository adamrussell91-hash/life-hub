# Postcards as journal keepsakes — design

Date: 21 November 2026
Hub: Travel
Status: built
Builds on: `docs/superpowers/specs/2026-11-18-travel-postcard-design.md` (its "Second build" section) and the keepsakes of `docs/superpowers/specs/2026-11-14-travel-journal-redesign-design.md`.

## Purpose

Every postcard the owner posts from a stop is already a small finished thing: a photo, the words, a voice, an address and a postmark. The journal should keep it without any work, the way it keeps booked tickets and arrival stamps. A postcard turns up in the story on the day and at the time it was posted, on the Keepsakes board under its city, and in the counts. Tapping it opens the postcard itself, exactly as followers saw it.

## Decisions

| Question | Answer |
|---|---|
| Where it comes from | The trip's check-ins, through `listPostcards(trip)`. Nothing is copied into the journal document. |
| What it is | A new keepsake type, `postcard`, beside `photo`, `booking` and `stamp`. |
| Which city | The live journal leg for the postcard's city. When a city has more than one leg, the leg whose dates hold the posted date; else the first. A postcard whose city has no leg goes under "Not filed under a city". |
| Which day and time | The posted instant in the leg's time zone (the city's when the leg has none). |
| How it looks | The front of the card: the photo in a white border, 3:2 or 2:3, with the trip's ink postmark stamped across the top corner. |
| Tapping it | Opens the postcard view (`openPostcardViewer`) at that card, with Older and Newer moving through every postcard on the trip. The card turns over and plays as it does for followers. |
| Removing it | Not from the journal. A postcard leaves the journal when it is removed from its stop on the trip page. The view in the journal has no Remove. |
| Opened state | Not tracked. "Unopened" belongs to followers on the public link. |

## Where it shows

- **Story.** On the posted day, in time order among the moments, as a taped-down keepsake like any other. Beside it: "Kept: Postcard from Jalan Alor, Kuala Lumpur" and the local time and the stop it was posted from, "9:40 pm · Night market". It joins the day's loose keepsakes, which already sit in time order.
- **Keepsakes board.** Under its city with the photographed and booked keepsakes, in story order.
- **Counts.** It counts as a keepsake on the cover, the chapter, the day and the Relive ending. The board's count line names postcards when there are some: "5 kept, 2 from your bookings, 1 postcard".
- **Relive.** Counted at the end; not given its own scene in this build.

## Data

```ts
interface PostcardKeepsake {
  type: 'postcard';
  id: string;          // `postcard_${checkin id}`
  card: PostcardView;  // straight from listPostcards
  legId: string;       // empty when no leg matches
  localDate: string;   // posted date in the leg's time zone
  localTime: string;   // "21:40"
  placeName: string;   // placeLine(trip, card)
}
```

`listKeepsakes(journal, trip)` adds one per postcard. In story order a postcard sorts with the photographed keepsakes of its leg, by date then time.

`keepsakesForDay` returns photographed keepsakes and postcards. A postcard has no moment, so it is always one of the day's loose keepsakes.

## Drawing

`drawKeepsake` gains a postcard branch, given a photo URL from `travelPhotoUrl(card.photoId)`:

- `keepsake keepsake--postcard` with `data-orient`, sized in em like every keepsake: 18em by 12em landscape, 12em by 18em portrait, a 0.6em white border.
- The photo covers the inside. The postmark (`postmarkSvg(postcardFacts(trip, card))`) sits over the top right corner in the city's ink, at about half opacity, so the photo still reads.
- It is a picture: `aria-hidden`, with the same facts written beside it as text, as all keepsakes are.
- A photo from before postcards has no orientation: it draws landscape and switches when the image loads, as the stop's small card does.

## Opening

`openKeepsake` sends a postcard to `openPostcardViewer({ trip, cards, startId, label: 'Postcards' })` through the journal's overlay swap. `cards` is every postcard keepsake's card in posted order. No `onRemove`, no `trackSeen`, no share token (the owner's session loads the photo and clip).

## Not in this build

- Hiding a postcard from the keepsakes while it stays on the link.
- A Relive scene for a postcard.
- Linking a postcard to a moment.
- Postcards in a shared journal (there is no shared journal yet).

## Failure modes checked (docs/CURSOR-UI-FAILURES.md)

- **V8** two renderers for the same data: the journal opens the same `openPostcardViewer`, which draws through `card.ts`; the list comes only from `listPostcards`. Check: grep finds one place that builds `.postcard__back`.
- **D2** item placed by the wrong date: the day and time use the leg's time zone. Check: a model test with a post at 23:30 local that is the next day in UTC.
- **W13** API media with no origin: the keepsake's photo goes through `setApiImageSrc`. Check: a DOM test reads `crossOrigin`.
- **V6** an async close removes the next sheet: the view goes through `swap('keepsake', …)`, and its close only clears its own slot. Check: a unit test opens a postcard, closes it, and the journal is still there.
- **R2 / R3** phone: no horizontal scroll at 390 on the story and the board with a portrait and a landscape postcard. Check: `scrollWidth` equals `clientWidth`.
- **R7** Back leaves the page: Back closes the view. Inherited from the overlay host. Check: in the running app.
- **P1** compare with the mockup: the postcard view is the existing one; the keepsake is checked at 390 and 1280 beside the other keepsakes.

## Verify

- Model tests: a postcard keepsake per postcard, its leg, local date and time across midnight, the fallback when no leg matches, the order among photographed keepsakes, counts.
- Journal tests: the postcard sits in time order on its day, the board shows it under its city, the count line names it, tapping it opens the postcard view at that card, and the view has no Remove.
- In the running app against the mock API at 390 and 1280: post a postcard on a stop, open the journal, find it in the story and on the board, open it, turn it over, go Older and Newer, close it.
- Walked on 21 November 2026 against the mock API at 390 and 1280: two postcards posted through the API (one landscape, one portrait), found in the story in time order and on the board under their cities, opened at the right card with no Remove, Back closed the view, no horizontal scroll and no page errors.
- Not testable here: the owner's real postcards on a phone. The first one posted on the trip is that test.
