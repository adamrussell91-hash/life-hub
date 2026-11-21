# Food Journal map redesign — design

Date: 21 November 2026
Hub: Life (Food Journal)
Status: built
Mockup: `docs/mockups/food-journal-map.html` (option B, "Bottom sheet")

## Purpose

The Map tab is for reliving and browsing where the owner has eaten. Today it is a square map in the middle of a scrolling page: a drag either pans the map or scrolls the page, a pin tap fills a text list below the map and off screen, no photo is shown, and the pins are flat dots on a basemap of grey 3D buildings. The redesign makes the map the whole screen, makes pins photos, and answers a pin tap with a bottom sheet that shows the place.

## Decisions

| Question | Answer |
|---|---|
| What the map is for | Relive and browse. No "near me", no rating or cuisine filters. |
| Pattern | Full-screen map with photo pins; a pin tap opens a bottom sheet (mockup option B). |
| Add visit row | Add visit and the import, backup and restore menu are hidden in Map mode, so the map gets the height. They stay on every other tab. |
| Heading and count | The "World map" heading and "N mapped visits" line become one chip on the map: "401 visits · 212 places". The canvas keeps its accessible name. |
| Finding a venue | The native "Find a venue" select goes. A search button on the map opens a type-to-filter venue list in the same sheet. |
| Basemap | OpenFreeMap `positron`, flat: pitch and rotation off, no building extrusion layer. |
| Opening view | Framed on the most recent mapped visit (zoom 14). A "Show all" button fits every venue. |
| Pins | Clusters stay as accent count bubbles. An unclustered venue is a round photo pin (44px) of its best dish photo; a venue with no photo is a styled dot of the same size. |
| Best photo | First photo of the venue's highest-rated dish that has one, newest visit breaking ties; else the first photo of the newest visit. |
| Out of scope | Other Food Journal tabs, the shared `mountHubPlacesMap`, filters, directions, editing from the sheet. |

## Layout

In Map mode the map panel fills from under the tab bar to the top of the bottom nav. Its height is measured, not guessed: `100dvh` less the panel's top offset and the nav's height, re-measured on resize and orientation change. The page does not scroll in Map mode. Because the map is the screen, it pans with one finger (`cooperativeGestures` off).

Controls on the map, each at least 44px: zoom in/out (top right), search and "Show all" (top left, beside the count chip). The sheet covers the lower part of the map only while a venue or the search list is open.

## Pin tap and sheet

1. The tapped pin scales up and takes an accent ring. Any other pin loses it.
2. The map eases so the pin sits in the part of the map the sheet does not cover, using a per-move `offset` measured from the sheet's height at that moment.
3. The sheet slides up from above the bottom nav.

Sheet contents, top to bottom:

- Drag handle and a close button.
- Photo strip: every dish photo for the venue, best first, swipeable, capped at 12. Omitted when the venue has no photos; the sheet then starts at the name.
- Venue name (serif), address, average rating across rated dishes to one decimal (omitted when nothing is rated), visit count.
- Visits, newest first: title and display date. Tapping one opens the entry through `ctx.openEntry`.

On a phone the sheet has two heights, about 56% and 86% of the map panel (from 900px wide it is a card down the map's left side); dragging the handle or tapping it moves between them, and dragging down from the lower one closes it. Close, a tap on empty map, Escape and Back all dismiss it and clear the selected pin. Opening the sheet pushes one history entry; Back closes it without leaving the page.

The search list uses the same sheet at the tall height: a text input (16px, so iOS does not zoom) and the venues filtered by name or address. Choosing one selects that venue as a pin tap would and flies the map to it at zoom 15.

## Components

- `world-map.js` keeps `mappedVenues` and `paintWorldMap`, and stays the only map entry point for the tab. It owns the map, the sources and layers, and selection state.
- New `world-map-sheet.js`: builds and controls the sheet (open with a venue, open with the search list, close, height changes, drag). It knows nothing about MapLibre; it takes a venue and callbacks.
- New `world-map-pins.js`: photo pins and count bubbles as MapLibre DOM markers, regrouped as the map moves. `groupPins` is pure and unit-tested.
- `model.js` gains `venuePhotos(venue, limit)` (best first) and `venueRating(venue)`, pure and unit-tested.
- `view.js` already offers `ctx.photoNode`, so the map uses the same signed-URL cache and retry path as every other photo. It leaves Add visit and the import menu out of the toolbar when the mode is `map`.
- `hub-places-map.js` exports a `QUIET_MAP_STYLE` constant for `positron`. `DEFAULT_MAP_STYLE` and its other users are untouched.

## Data flow

`liveVisits(journal)` → `mappedVenues` (unchanged grouping by name and rounded coordinates). Pins and count bubbles are DOM markers: on every map move, `groupPins` merges venues whose pins would overlap on screen (closer than a pin's width; from zoom 17 in, only pins on the same spot). The selected venue always stands alone. A bubble zooms to its venues; a bubble that cannot split opens them as a list in the sheet. Photo keys come from `visit.dishes[].photos`; URLs come from the existing batched signer through `ctx.photoNode`, so only pins on screen and the open sheet's strip are signed.

The map's centre, zoom and open venue are remembered for the page's lifetime, so a journal repaint or a trip into an entry and back returns to the same place.

## Failure and empty states

- No mapped visits: the current message, "Visits with saved coordinates will appear here."
- Map library or style fails to load: the map is hidden and the venue search list is shown in place, with "Map unavailable." above it; choosing a venue opens the same sheet.
- A photo fails to sign or load: the pin falls back to the styled dot; in the strip the image is removed.
- Leaving the tab disposes the map, the markers and the sheet, and pops the sheet's history entry if it is open.

## Failure modes to check

From `docs/CURSOR-UI-FAILURES.md`:

- **S7** The map container is sized with a selector that outranks MapLibre's classes; at 390 its height equals the panel's.
- **R8** At 390 a one-finger drag moves the map centre.
- **R2 / R3** At 390, `scrollWidth` is 390 and the page does not scroll vertically in Map mode.
- **R6** With the sheet open at 390, its bottom edge is at or above the bottom nav's top.
- **R7** With the sheet open, `history.back()` closes it and the hash is unchanged.
- **R4** The search input is 16px and the sheet's last row is tappable above the nav.
- **R5** Hiding Add visit in Map mode removes nothing else; the tab bar and overflow menu still work.
- **W15** With the sheet up, the selected pin's box is above the sheet's top.
- **S3 / V12 / V13** The sheet is opaque, visible on first open, and mounted inside the map panel.
- **V1** `hidden` on the sheet, the strip and the fallback list really hides them.
- **V7** A journal repaint while the sheet is open keeps the selected venue and the map position.
- **C12** Colours handed to MapLibre are resolved with `getComputedStyle`, never `var(--…)`.
- **C10** The basemap is quieter than the pins: no extrusions, pins and clusters read first.
- **C4** Pinch zoom and sheet drag are checked in WebKit as well as Chromium.
- **I3** Search with no match says so; a venue with no photos still opens a useful sheet.
- **I5** No native select for the venue list.
- **W14** The `positron` style and marker assets load in the built site, not only in dev.
- **D3** Screenshots for review use the test fixture's invented venues.
- **M1** Motion is selection only: pin scale, map ease, sheet slide. Reduced motion turns all three off.
- **P1** The built screen is compared with the mockup at 390 before the work is called done.

## Testing

- Unit: `venuePhotos`, `venueRating`, `latestVenue`, `groupPins`, and the existing `mappedVenues` case.
- Browser (`tests/browser/food-journal.spec.mjs`), replacing "world map opens a mapped venue's visits at phone width" at 390: Map tab shows the chip count and no Add visit; no horizontal overflow; tapping the map at a seeded venue opens the sheet with its visits; a visit row opens the entry; Back closes the sheet; search finds a venue by name; with the style request aborted, "Map unavailable." shows and the list still opens the sheet. No page errors.
- `npm run pre-pr-check` passes before the PR.
