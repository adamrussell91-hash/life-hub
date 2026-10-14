# Personal line builder

A teacher picks a student's year level and interests. Tasks builds that student's own line for the year,
drawing it top to bottom like a train line. Publish saves a snapshot to a public link a student or
parent can open without the passphrase. Tapping a stop opens a departure-board style card.

Mockup: [`mockup.html`](mockup.html). Open it in a browser. It runs on 50 real catalogue entries
(sample, not the full 290).

## Decisions (Adam, 14 Oct 2026)

- **Year line mapping:** Junior = Years 7–8, Rozelle = Year 9, Senior = Years 10–12.
- **Snapshot, not live.** A link sent to a parent never changes under them. Republish to update.
- **One combined line.** Each chosen interest is its own coloured lane. Lanes **join** at a stop that
  belongs to more than one chosen interest (an interchange capsule), then split again.
- **Cards look like Sydney Trains signage, not hub cards.** References: platform departure boards, the
  Arncliffe boarding-position poster, the network key.

## Data: what exists, what's missing

- The Programs catalogue (`apps/tasks/fixtures/competitions.json`, 290 entries) already has nearly
  everything a card needs:
  - `age_groups` on 288 of 290 entries
  - `description` on all 290
  - `registration_link` on 266
  - also: `month`, `competition_length`, `cost` / `cost_basis`, `registration_window`, `organiser`, `location`
- **Gap 1: map items aren't linked to the catalogue.** Map stations and ticks only have
  `link: project | excursion`. Some names match the catalogue loosely (e.g. "UN Evatt Competition" on the
  map is "UN Youth Evatt Model UN" in the catalogue). Others have no catalogue entry at all
  (Ethics Olympiad, StudioGAT, John Locke).
  - Fix: add an optional `program_id` to map stations and ticks.
  - The item editor gets a "Catalogue entry" picker that suggests the closest name match.
  - Unlinked items still show, with only the map's own name and dates.
- **Gap 2: interests.** Interests are the map's strands (Justice, Innovation, Expression, Reasoning),
  not catalogue subjects. The mockup maps subjects to strands only to have sample data.
- **Year eligibility:** use the linked entry's `age_groups` when it has them. Otherwise use the year line
  the item sits on (via the mapping above).

## How a line is built

1. Take the year's map (the curated MindWorks map, not the whole catalogue).
2. Keep items on the chosen strands that the student's year can enter.
3. Order by date. Group under term headers using the map's term dates (start and end, so holidays show).
4. Lay out one lane per chosen strand. A stop shared by several chosen strands pulls those lanes together
   into a capsule.
5. Programs (year long or long term) draw as a pill on their lane. Competitions draw as stops.

## Animation

- On open, the lanes draw down the page (stroke dash). Each stop pops in as its lane reaches it, and its
  row fades up at the same moment.
- About 0.25 s per stop, capped near 5 s.
- Reduced motion shows the finished line.

## Card (departure board)

Mapping from the platform sign to the card:

| On the platform sign | On the card |
| --- | --- |
| Header bar ("Next service / Time now") | Strand colour bar: type on the left, "Runs Jul" on the right |
| Line badge and destination | Strand roundel(s) and the name, "via Justice + Reasoning" |
| Carriage diagram | Year levels 7–12 as carriages. Eligible ones in the strand tint, the student's year lit green |
| "Departs 3 min" | Entries window (left), cost (right, big) |
| "8 cars", "Limited Stops" tags | Dark tags: length, level, cost detail |
| "Following services" | "Next on your line": the next two stops, tappable |

The card ends with **Register** (the catalogue link). On a phone it becomes a bottom sheet.
The same card style should replace the plain map item card in the hub, so both match.

## Publish and the public page

- Follow the Teaching pattern: `netlify/functions/lesson-publish.mjs` saves a snapshot blob, and
  `published-lesson.mjs` serves it publicly behind `_shared/public-student-gate.mjs`.
- The snapshot holds only public-safe fields: name, dates, strands, card fields from the catalogue.
  Never map notes, linked tasks, projects or `planning`.
- Link: a random, unguessable slug.
- Student identity: first name only, optional. No surname, no school.
- **Unpublish** removes the snapshot. Each snapshot stamps the date it was published.

## Slices

1. **Link the map to the catalogue.** Add `program_id` and the picker with a suggested match. Linked cards
   show catalogue details in the hub.
2. **Builder in Tasks.** A Maps menu item "Personal line". It has year, interests and name fields, and
   shows a live preview with the animation and the new card.
3. **Publish and the public page.** The snapshot function, the public route, Unpublish, and a list of
   published lines.
4. **Restyle the map card in the hub** to the departure-board card.

## Open questions

- Should the builder also offer catalogue entries that aren't on the map yet, shown as "not on the
  MindWorks map"? Or only what's on the map?
- Should the published page carry MindWorks branding (the orange bar in the mockup) or stay neutral?
