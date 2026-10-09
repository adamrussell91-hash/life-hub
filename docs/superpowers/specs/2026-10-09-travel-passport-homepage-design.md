# Travel passport homepage

**Date:** 2026-10-09  
**Status:** Approved for planning  
**Approach:** A — Passport homepage (SVG countries map + timeline cards)

## Problem

Travel’s `#/` page is a plain trip card list. There is no sense of “where I’ve been.” The interactive world map only exists inside a single trip, and it draws land + route arcs, not filled countries.

Adam wants the Travel homepage to feel like a living passport: countries fill in as trips finish, and a beautiful trip timeline sits under an interactive map.

## Decisions (locked)

1. **Visited fill = past only.** A country fills when at least one trip that includes that country has `end_date` before today (UTC date). Upcoming and in-progress trips do not fill countries.
2. **One timeline for all trips.** Upcoming and finished trips share one card list under the map. New trip create/import stays on the page.
3. **Map → cards.** Tapping a filled country highlights matching timeline cards and scrolls to the first match. It does not auto-open a trip.
4. **Card → trip.** Tapping a card opens `#/trip/<id>` as today.
5. **Per-trip route map stays on the trip page.** This homepage does not draw flight arcs.

## Goals

- Homepage reads as one composition: map first, then timeline, then New trip.
- Finished travel is visible on the map without loading every full trip document in the client beyond the list summary.
- Desktop (~1280) and phone (390) both work: map tappable, no horizontal page scroll, cards full-width on phone.
- Design kit fidelity: tokens, type, radii, buttons from the hub kit; Travel overlay only via `data-hub` as today.

## Non-goals (this pass)

- Time-scrubber / animate fill “over years”
- Editing country names from the map
- Showing planned/upcoming fills in a second style
- Merging this map with the per-trip route map component into one abstraction
- MapLibre / raster basemap

## Layout

### Desktop

1. Page title block (“Trips” + short subcopy, e.g. count of trips / countries visited)
2. Full-width interactive countries map
3. Vertical timeline of trip cards (newest leave-date first)
4. New trip card (existing create + JSON import)

### Phone (390)

Same vertical stack. Map height is `min(42vh, 280px)` so it stays a hero without eating the viewport. Timeline cards stack full width. New trip uses existing docked `addform__actions` (R4).

## Map behaviour

- Projection: Natural Earth (same family as the trip route map), using `world-atlas/countries-110m`.
- Visited countries: filled with a Travel accent (kit success / navy soft — no invented palette). Unvisited: quiet outline / land wash.
- Interactions: pan + zoom (reuse existing `zoomable` pattern where practical). Tap filled country → set “active country” filter. Tap empty / ocean / clear control → clear filter.
- When a filter is active: matching cards get a strong selected treatment; non-matching cards stay visible but muted. Scroll the first match into view.
- Home country (Australia) fills only if a finished trip lists it as a city country — no special always-on home fill.
- Countries with no atlas match (after aliasing) do not fill. No silent wrong fill.

## Timeline cards

Each card shows:

- Title
- Date range (existing display date format)
- Status: `Leaves in N days` | `On now` | `Finished` (same rules as today’s list)
- City chips (names)

Visual: kit paper card with clear title → dates/status → city chips hierarchy (no per-city accent on the list summary — accents stay on the trip page). Finished trips may use a quieter status treatment than upcoming. Whole card is the hit target / link.

Sort: `start_date` descending (upcoming first, then recent past).

Empty state: map with no fills + “No trips yet” + New trip form (existing empty copy, tightened to match the passport framing).

## Data

### Trip list summary

Extend `TripSummary` (and `tripSummary()` in `travel-schema.mjs`, mock API, client types) with:

```ts
countries: string[]; // unique city.country values, stable order of first appearance
```

City **names** remain on `cities: string[]` for chips. Countries are only for map fill / filter matching.

No change to full trip documents or to the public redact path beyond what list already exposes.

### Country → atlas matching

Client helper maps free-text `city.country` to Natural Earth `properties.name`:

- Exact case-insensitive match first
- Small alias table for common variants (`UK` / `United Kingdom`, `USA` / `United States of America`, `South Korea` / `Korea`, etc.)
- Unmatched → omitted from fill set (logged only in tests / dev assert, not in production UI)

Visited set = countries from summaries where `end_date < today`.

## Components (ownership)

| Unit | Responsibility |
|------|----------------|
| `views/trips-list.ts` (or renamed passport view) | Page composition: title, map host, timeline, new trip |
| `components/passport-map.ts` | Countries SVG map, visited fill, tap → country id/name |
| `lib/visited-countries.ts` | Pure: summaries → visited country set; alias match; filter trips by country |
| `travel-schema` / list API | Emit `countries` on summary |
| Existing trip `world-map.ts` | Unchanged (route map on trip page) |

## Error / edge cases

- Trip with cities but empty/missing `country`: no map contribution; chips still show city names.
- Trip finished with countries that don’t alias: cards show; map does not invent a fill.
- Multiple finished trips share a country: one fill; tap highlights all matching cards.
- In-progress trip (`start ≤ today ≤ end`): appears on timeline as “On now”; does **not** fill countries until `end_date` is past.

## Testing

- Unit: visited-country set from fixtures (past fills, future does not, in-progress does not).
- Unit: alias table hits for UK/USA/Korea-style names; unknown string → no match.
- Unit: filter trips by country name from summaries.
- Manual: desktop + 390 homepage — tap filled country highlights cards; tap card opens trip; New trip still works; R4 on New trip form at 390.
- `pre-pr-check` before PR.

## Success criteria

- Opening Travel `#/` shows map + timeline, not the old plain list alone.
- After a finished Portugal trip exists, Portugal is filled; an upcoming Malaysia-only trip does not fill Malaysia.
- Tapping Portugal highlights that trip’s card and scrolls to it.
- Tapping the card opens the trip.
- Phone at 390: no horizontal page scroll; New trip actions docked ≥44px (R4).
