# Personal line builder

A teacher picks a student's year level and interests. Tasks builds that student's own line for the year,
drawing it top to bottom like a train line. Publish saves a snapshot to a public link a student or
parent can open without the passphrase. Tapping a stop opens a departure-board style card.

Mockup: [`mockup.html`](mockup.html). Open it in a browser. It runs on the 204 catalogue entries that
have a month, year levels and a subject.

## Decisions (Adam, 14 Oct 2026)

- **Year line mapping:** Junior = Years 7–8, Rozelle = Year 9, Senior = Years 10–12.
- **Snapshot, not live.** A link sent to a parent never changes under them. Republish to update.
- **One combined line.** Each chosen interest is its own coloured lane. Lanes **join** at a stop that
  belongs to more than one chosen interest (an interchange capsule), then split again.
- **Calendar aligned, like the full network map.** Time runs down the page on a real date scale, and
  term bands show the holidays as gaps. A 10-week program is a 10-week pill. Programs running at the
  same time on one line sit on parallel tracks.
- **Catalogue entries not on the map are included**, drawn with a dashed outline and tagged "Not on
  map". A builder option turns them off.
- **Interests are catalogue subjects**, not the four lines. Each subject belongs to one line (mapping
  below), so the student's lines are whichever lines their chosen subjects fall on.
- **The public page carries MindWorks branding.**
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
- **Gap 2: no start or end dates in the catalogue.** It only has `month` and `competition_length`
  (Single Day / Long Term / Year Long / Recurring).
  - Calendar alignment needs `starts_on` / `ends_on` on catalogue entries.
  - Many dates are already written in `registration_window` or `description` (e.g. "Held 21 to 22
    November", "Rounds run late July to mid-August"). A one-off extraction pass can propose dates
    for Adam to approve, the same way the catalogue was filled.
  - Until an entry has dates, it draws as a stop mid-month labelled "long term, dates TBC". It never
    gets an invented length.
- **Subject → line mapping.** A subject can sit on more than one line. Nothing in the code maps
  subjects to lines yet. Adam set Economics (I + R), Business (I), Leadership (J + R), Classics (R),
  Languages (E), Mathematics (I) and Neuroscience (R). The second lines on the rest are a re-scan of which subjects the catalogue tags
  together, still for Adam to confirm:

  | Subject | Lines | Why the second line |
  | --- | --- | --- |
  | Legal, History | J | |
  | Debating | J + R | argument and reasoning |
  | Public Speaking | J + E | tagged with Debating 14×, also communication |
  | Humanities | J + E | tagged with Debating 22×, English 11× |
  | Geography | J + I | tagged with Science |
  | Leadership | J + R | Adam |
  | STEM, Science, Engineering, Mathematics, Coding, Computing, Robotics, Physics, Chemistry, Biology, Astronomy, Business | I | |
  | Economics | I + R | Adam |
  | Website Design, Game Development | I + E | design |
  | English, Creative Writing, Arts, Film, Drama, Music, Languages | E | |
  | Essay Writing | E + R | tagged with Psychology 7×, Philosophy 6× |
  | Classics | R + E | Adam set R; tagged with Languages 9× |
  | Psychology, Philosophy, Neuroscience | R | |

  An entry is on every line its chosen subjects reach. On two of the student's lines, it's an
  interchange: a capsule bridging those lines on its date.
- **Year eligibility:** use the linked entry's `age_groups` when it has them. Otherwise use the year line
  the item sits on (via the mapping above).

## How a line is built

1. Take every catalogue entry the student's year can enter, in at least one chosen subject. Entries on
   the MindWorks map use the map's dates. Others use the catalogue's dates, once it has them.
2. Lay it out like the MindWorks map. Time runs down on a real date scale, with term bands from the
   map's term dates. The lines sit close together and never cross. The first line's names sit on its
   left, and every other line's names on its right.
3. Anything with a start and an end is a pill as long as it runs. A single date is a stop. Pills that
   overlap on one line split it evenly into parallel tracks, which rejoin after.
4. An entry on two of the student's lines is an interchange capsule bridging them on its date (a pill
   on each line if it runs for weeks). Its name goes beside whichever of its lines has room at that
   date. Names hop over a capsule that crosses their column.
5. A name that had to move down keeps a dotted leader to its stop. A busy line gets a taller year so
   names stay near their dates.
6. Phone: two name columns don't fit, so the lines sit together on the left and names share one
   column on the right.

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

0. **Catalogue dates.** Add `starts_on` / `ends_on` to the catalogue schema, and a reviewed extraction
   pass from `registration_window` and `description`.
1. **Link the map to the catalogue.** Add `program_id` and the picker with a suggested match. Linked cards
   show catalogue details in the hub.
2. **Builder in Tasks.** A Maps menu item "Personal line". It has year, interests and name fields, and
   shows a live preview with the animation and the new card.
3. **Publish and the public page.** The snapshot function, the public route, Unpublish, and a list of
   published lines.
4. **Restyle the map card in the hub** to the departure-board card.

## Open questions

- Confirm or correct the subject → line mapping above.
