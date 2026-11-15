# Travel journal: keepsakes everywhere

Date: 15/11/26. Follows `2026-11-14-travel-journal-redesign-design.md` (keepsakes, slice 1) and `2026-11-15-travel-journal-slice-3-map-relive-design.md` (Map and Relive).

## Why

Adam said keepsakes "don't really come into anything". Their photos were broken until PR #1523, but even working they stop at two places: the day they were kept, and the Keepsakes board. The Map view, Relive (except for keepsakes kept from a moment), the Photos grid and the print edition leave them out. The redesign spec promised a Map "with every moment and keepsake pinned"; only moments were built.

Adam also wants keepsakes to do more. That is three later pieces, each with its own spec, in this order:

1. **This spec.** Keepsakes appear on the Map, in Relive, in Photos and in the print edition.
2. Each keepsake has its story: a line or a voice note about it, and the journal brings it back later.
3. A lifetime keepsake box on the Travel home, across every trip.
4. Smarter keeping: photos that look like a ticket or a coaster offered as keepsakes, cut out cleanly, read for date and place.

## What exists

- A photographed keepsake is a souvenir row (`preferences.journal_souvenirs_v1`). Kept from a moment, it stores `moment_id`. Kept from the dock, it stores `leg_id`, `local_date`, `local_time`, and `coordinates` when the phone already allows location (the sheet never asks).
- `keepsakes/model.ts` turns souvenirs, bookings and legs into one ordered list. `PhotoKeepsake` carries the moment, leg, date, time and place name, but drops the stored `coordinates`.
- Booked tickets are not stored. They are worked out from the itinerary and sit at the journey between cities.
- Relive already shows keepsakes kept from a moment, up to two, in that moment's scene.

## Where a keepsake sits

One rule, used by every surface. Applied to live photographed keepsakes, in this order:

| The keepsake | Where it sits |
| --- | --- |
| Kept from a moment that is live | With that moment |
| Kept on its own, with a place | Its own stop, in time order within its day |
| Kept on its own, no place, and its day has located moments | With the located moment nearest in time that day. A tie goes to the earlier moment. No time on the keepsake: the day's first located moment |
| Kept on its own, no place, and its day has no located moment | Its day only: in the story and the print edition, not on the Map or in Relive |
| Kept from a moment that was deleted | As if kept on its own, from the keepsake's own day, time and place if it has them; otherwise its day only |

Booked tickets keep their place at the journey between cities. Arrival stamps are unchanged.

A keepsake that sits with a moment goes wherever that moment goes: if the moment has no place, neither does the keepsake on the Map, while in Relive it shows with the moment's card.

"Located" means the moment has coordinates the map accepts (`isPlaced` in `map/stops.ts`). "Nearest in time" compares `local_time` as minutes after midnight; a moment with no time is never nearest unless it is the only one.

## What each surface shows

### Map view

- A keepsake that is its own stop has its own pin: a small drawn ticket, not a number. It joins the slider's walk in time order, so the slider can stop on it.
- Its card shows the keepsake drawn, "Kept: tram ticket", the day, time and place, and **Go to that day**, which opens the story at the keepsake.
- Moment pins keep their numbers, which count moments only. The slider's spoken value counts the same way: a moment is still "Stop 4 of 23, Day 2, Rua da Bica", and a keepsake stop, which has no number, is "Day 2, kept: tram ticket".
- A moment's card shows the keepsakes that sit with it beside its photo: up to two drawn small, then "+1".
- Keepsake stops do not change the line counting moments with no place.

### Relive

- A keepsake that is its own stop gets a short scene: the map moves to its pin, and the keepsake lifts off as a card with its name, time and place. It stays for the same time as a moment scene.
- Keepsakes that sit with a moment show in that moment's scene, up to two, as they already do for keepsakes kept from a moment.
- The end card's counts are unchanged.

### Photos grid

- Every keepsake with a live photo sits in its day, in time order among the moments' photos, with a small ticket mark in a corner.
- In the photo viewer its caption is "Kept: tram ticket". The viewer's way back to the story lands on the keepsake.
- A keepsake whose photo is also a moment's photo (kept from a moment, using its photo) shows once, as the moment's photo, with the ticket mark added.
- Keepsakes kept with a name and no photo are not in Photos.

### Print edition

- Keepsakes print where the story shows them: after their moment, or in time order within their day. Each is its cut-out shape with "Kept: tram ticket" and its time and place.
- Booked tickets print at the journey between cities, as drawn tickets.
- A keepsake with a name and no photo prints as a paper tag.
- The booking reference is never printed, as it is never drawn.

### Unchanged

- The counts in the cover, chapter and day headers.
- The shared link: keepsakes stay out of it until their own privacy review.
- Export already keeps keepsakes as data.

## Structure

| File | Job |
| --- | --- |
| `journal/keepsakes/placement.ts` (new) | The rule above. Plain function: from the journal, the keepsake list and the moments in story order, returns the keepsakes by moment, the keepsake stops, and the keepsakes by day |
| `journal/keepsakes/model.ts` | `PhotoKeepsake` carries its stored `coordinates` |
| `journal/map/stops.ts` | Stops gain a `kind` (`moment` or `keepsake`); keepsake stops join in time order. The route passes through them |
| `journal/map/trip-map.ts`, `map/map-view.ts` | The keepsake pin and its card; the moment card's keepsakes |
| `journal/map/relive-scenes.ts`, `map/relive.ts` | The keepsake scene; keepsakes with their moment from the placement |
| `journal/photo-viewer.ts`, `photos-view.ts` | Keepsake photos in the trip's photo list, the ticket mark, the caption |
| `journal/print-edition.ts` | Keepsakes in the day and at the journey |
| `render-journal.ts` | Builds the placement once per paint and hands it to each surface |

Nothing stored changes, and the server is untouched.

## When things go wrong

- **The map cannot load.** Keepsake pins follow the moment pins onto the plain background (slice 3).
- **A keepsake's photo cannot load.** It is drawn as its paper tag, in Photos, on the Map card and in print (register D: data shown truthfully).
- **A keepsake's moment is moved to another day.** The placement is worked out on every paint, so it follows.

## Checks

Unit (vitest, happy-dom, stand-in map):

- Placement: each row of the rule; the tie; no time on the keepsake; a day with no located moments; a deleted moment; a deleted keepsake left out; a name-only keepsake.
- Stops: keepsake stops in time order between moment stops; moment numbers unchanged; the unplaced count unchanged; the spoken slider value.
- Relive: a keepsake scene; keepsakes riding with the nearest moment.
- Photos: keepsake photos in time order with the mark and caption; a shared photo listed once.
- Print: keepsakes after their moment and in time order; booked tickets at the journey; no booking reference in the HTML.
- Share: the public view still has no keepsakes.

Browser (Playwright, 390 and 1280, invented journal):

- The keepsake pin is on the map and its card opens; the Photos grid shows the ticket mark; no sideways scroll (register R2).
- A keepsake pin is clear of the slider card when selected (register W15).
- Map colours are resolved values, not CSS variables (register C12), and the map host keeps its size (register S7).

## Not in this spec

Keepsake stories, the lifetime box and smarter keeping (pieces 2 to 4). Keepsakes in the shared link. Changing how keepsakes are kept.
