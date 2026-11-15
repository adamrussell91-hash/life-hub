# Travel journal slice 3: the map and Relive

Date: 15/11/26. Follows `2026-11-14-travel-journal-redesign-design.md`, which outlined this slice: a Map view with every moment pinned and a slider through the trip, and Relive played on that map, with light that moves from morning to night. Adam asked for it to be built now, after noticing.

It is the last slice. It adds a fourth view and changes nothing in the other three.

## What exists

- MapLibre is already loaded by the journal, through `lib/maplibre.ts`, with the OpenFreeMap "Liberty" style. No key is needed and the page's security policy already allows it.
- The day map inside each day is a small drawn sketch that opens a real map of that day in a sheet. That stays as it is.
- Nothing handles the map failing to load. Abroad on a weak signal that will happen, so this slice has to.

## The Map view

A fourth button in the ribbon's view switch, after Keepsakes.

**The map** fills the screen under the ribbon.

- Every moment of the trip that has a place is a numbered pin, in story order. The numbers run across the whole trip.
- A line joins the pins within a city. A dashed line joins one city to the next.
- The map opens fitted to the whole trip.
- Moments with no place are not on the map. A line under the slider says how many: "3 moments have no place and are not on the map". It is not shown when every moment has one (register D1).

**The slider** sits at the bottom, above the tab bar.

- One step per pin. Dragging it, or tapping Previous and Next, moves through the trip one stop at a time.
- The map moves to that stop, its pin grows, and the route is drawn up to it.
- A card above the slider shows that stop: its photo, "Day 3 · 9:40 am", the place, and the first lines of the words. Tapping the card opens that moment in the story.
- The slider is a real range control, so a keyboard and a screen reader can use it. Its spoken value is "Stop 4 of 23, Day 2, Rua da Bica".

**The light.** As the slider moves, the map's light follows the time of that moment: clear in the day, warm near sunset, deep blue at night.

- It is a tint laid over the map, under the pins. The map's own style is not rebuilt, so it costs nothing and cannot break the tiles.
- The times come from each moment and from the sunset the journal already works out for each day.
- With reduced motion the tint changes at once, with no fade.

**The dock** is hidden in the Map view. The slider is where the dock would be, and nothing is added from a map.

## When the map cannot load

| Case | What happens |
| --- | --- |
| The map's tiles do not arrive in 6 seconds, or its style fails | The pins, the route and the slider still work, on a plain background. One line says "The map could not load. Your route is shown without it." with **Try again** (register V5) |
| The phone cannot draw a map at all | The slider and its card still step through the trip. The same line explains, with no Try again |
| The trip has no moment with a place | No map. One sentence: "Moments need a place to appear on the map. Photos carry theirs when Location is on in your camera." |

## Relive

Started only by a tap on **Relive** in the Map view. Nothing plays by itself.

It is the same map, full screen, playing the trip from the first stop to the last.

- **Arriving in a city.** The map moves to the city and its arrival stamp is pressed onto the screen.
- **Each moment.** The route draws itself to the next pin. That moment's photo lifts off the pin into a card, with its day, time, place and words. The light follows its time of day.
- **Moments with no place** still play, as a card over the map where it stands.
- **Between cities.** The route runs to the next city along the dashed line, with the journey named ("Lisbon to Porto, by train"). A ticket kept from a booking is shown with it.
- **Keepsakes** kept with a moment are shown with that moment.
- **The end.** The map draws back to the whole trip, with the stamps and the counts: days, cities, photos, keepsakes. The days are the trip's full length once it is over. While it is under way they run from the first journaled day to the last, so a day spent travelling with nothing written still counts.
- **The card and the map.** The card covers the lower part of the screen, so each stop is centred in the map that is left above it, never under the photo. The map's credit line moves to the top for the same reason.

**Controls.**

- Tap the right of the screen for the next stop, the left for the one before. Hold to pause.
- Pause, Play and Close buttons, each at least 44px.
- Back and Escape close it.
- It never plays sound. Moments with a sound clip show their words and photo only.
- With reduced motion: no camera flight, no lift and no drawing line. Each stop appears in place and Relive still moves on by itself.

Partner's lines follow the same switch as the story: shown in Relive only when they are shown there.

## Structure

| File | Job |
| --- | --- |
| `journal/map/stops.ts` | The trip as an ordered list of stops, the route within and between cities, and the count of moments with no place. Plain functions |
| `journal/map/light.ts` | The tint for a time of day and that day's sunset. Plain function |
| `journal/map/trip-map.ts` | The MapLibre map: pins, route, moving to a stop, the tint, and the two ways of failing |
| `journal/map/map-view.ts` | The Map view: the map, the slider, the card, the lines of explanation |
| `journal/map/relive.ts` | Relive: the sequence of scenes and its controls, through the journal's overlay host |
| `journal/story/ribbon.ts`, `render-journal.ts` | The fourth view, and tearing the map down when the view changes |
| `styles/journal-map.css` | Styles, kit tokens only |

MapLibre cannot run in the unit test environment, so `trip-map.ts` takes the library as an argument and the tests hand it a stand-in. The browser tests block the tile server, which is also how the "could not load" path is tested.

## Checks before it ships

| Entry | Check for this build |
| --- | --- |
| R2 | At 390, no sideways scroll in the Map view or in Relive |
| R4, R6 | The slider and its card sit above the tab bar and cover nothing. Previous, Next, Relive, Pause and Close are at least 44px |
| R7 | Back closes Relive and leaves the hash unchanged |
| V5 | With the tile server blocked, the pins, route and slider still work and the line of explanation is on screen |
| V7 | Leaving the Map view and returning keeps the stop the slider was on |
| D1 | The count of moments with no place is right, and absent when it is zero |
| C12 | No colour handed to MapLibre is a CSS variable |
| M1, M3 | Relive only moves when it is playing. With reduced motion nothing eases |
| P4 | Relive is not drawn until it is built |
| S7 | Relive's map has a real height in a browser. Its size rule outranks MapLibre's own |
| W15 | With a card up, the current pin is above the card. The last scene shows every pin |

## Order of work

1. The Map view: pins, route, slider, card, light, and the failure paths.
2. Relive.

## Out of scope

Sound in Relive, saving or sharing a Relive as a video, a map style of our own, and any change to the day maps inside the story.
