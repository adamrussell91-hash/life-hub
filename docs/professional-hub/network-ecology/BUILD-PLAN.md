# Network Ecology miniworld: build plan

## Outcome

Replace the force-graph Network Ecology page (`#/network-ecology`) with a
zoomable **miniworld**: an archipelago seen from above.
- Each **community** is a landform whose habitat describes how that group is
  connected.
- Each **person** is a small hermit crab that lives on their community's land
  and walks around it.
- Where people belong to two communities, a mangrove **sandbar** joins them,
  and a plant grows on it, with a badge showing how many people cross.
- A **timeline** replays how the world formed from 2015 to now.

The purpose is the one in `people-experience/SOURCE-BRIEF.md` sections 26–44:
- show Adam's professional world, his communities, and who bridges them;
- show what is growing and what has gone quiet;
- show how it changed over time.

What changes is the form: it becomes a calm, living world, not a graph.

The design reference is `mockups/miniworld.html`. Open it in a browser; it is
interactive and runs on 33 made-up people. **Where the mockup and this plan
disagree, this plan wins.** Known differences:
- The mockup has no **key**, no **open sea** and no **sandbank**. This plan
  adds all three.
- In the mockup, bridge shells show at most two colours. Here a person in N
  communities gets an N-segment shell.
- The mockup hand-places the islands. Here the layout is computed (Phase 2).
- The mockup's names, schools and numbers are placeholders.

**Depends on:** `DATA-FIX-BRIEF.md`, merged and live. Without it there is
almost nothing to draw.

**Acceptance case (run live on real data, D3/P3):**

> Adam opens Network Ecology. The whole archipelago fits the frame: his
> largest organisation communities are islands, and unlinked contacts drift on
> driftwood in the open sea around them. He scrolls to zoom into his current
> school's island. First names appear, then full names; hovering any crab
> shows its name at every zoom. A crab with a two-colour shell walks down a
> sandbar to another island, and the plant on that sandbar has a badge "3".
> He clicks the plant; the panel lists the three bridge people.
>
> He opens the key ("What do the places mean?") and reads what a Forest and
> an Island are. He clicks a community label. The panel says *why* it is that
> habitat in plain numbers, and those numbers match the label, the key count
> and the Communities cards.
>
> He presses Play. Islands grow from 2015. Crabs with a known start date
> appear in the year they joined. A note says how many people have no start
> date and so only appear at Now. At Now he turns on Dormancy: people he hasn't
> contacted in over a year are asleep in their shells, and their islands look
> paler. On his phone the same page shows community cards and a timeline, with
> no map.

**Read first:**
- `mockups/miniworld.html` (the reference) and `DATA-FIX-BRIEF.md`
- `people-experience/SOURCE-BRIEF.md` sections 26–44
- `docs/CURSOR-UI-FAILURES.md` and `.cursor/rules/ui-failure-register.mdc`
- `.cursor/rules/first-pass-correctness.mdc` and `.cursor/rules/hub-design-kit.mdc`
- Current code: `apps/professional/src/views/network-ecology.ts`,
  `components/network-graph-canvas.ts`,
  `netlify/functions/_shared/network-ecology-world.mjs`,
  `habitat-classification.mjs`, `network-ecology-history.mjs`

## Decisions already made (do not reopen)

- **Creatures:** hermit crabs.
  - Shell colour = home community.
  - A person in 2+ communities gets a shell split into one segment per
    community, and walks between them. About 45% of their trips end at the
    sandbar between two of their homes.
- **Kinds of place** (the key text is in "The key" below):
  - Forest, Coral Reef (an atoll: reef ring, lagoon and sand cay), Savannah,
    Wetland (a tidal marsh sitting in water between islands), and Island
    (ringed by fringing reef);
  - **Sandbank** (a new community);
  - **Open sea** (people who belong to no community yet).
- **Routes between places:**
  - **Mangrove sandbar:** at least one person belongs to both communities.
    This is the ecotone. It carries the plant and badge, and is labelled
    "Emerging ecotone" when its count rose in the last 2 years.
  - **Stepping stones:** links cross between the two communities but nobody
    belongs to both.
- **Habitat precedence**, when a community qualifies for more than one:
  1. Wetland (an event within ±30 days);
  2. Sandbank;
  3. Island;
  4. Forest, Reef and Savannah by the existing classifier order.

  Adam approved this order.
- **Dormancy is a state, not a place.** Quiet crabs tuck into their shell and
  show a small "z". The Dormancy layer pales each community in proportion to
  how many of its people are quiet.
- **Names:**
  - Hovering shows a name at any zoom.
  - First names show from zoom 1.6, full names from 2.2, and "You" from 0.55.
  - A **Names** toggle forces them on.
- **Calm motion:**
  - Walk speed is 9–15 world units per second, with a 2–7 second pause between
    trips.
  - The loop stops when the tab is hidden.
  - With `prefers-reduced-motion`, crabs stand still, plants don't sway and
    the timeline jumps.
- **Phones (< 720px)** get community cards, the timeline and insights. No map.
- **Visual language:** everything is seen from above, lit from the top left
  with shadows falling to the bottom right, in muted natural colours. Port the
  mockup's terrain functions (`drawForest`, `drawSavannah`, `drawReef`,
  `drawWetland`, `drawIsland`, `drawSandbar`, `drawShoal`, `drawSea`, `crowns`,
  `palms`) and its crab, plant and cairn drawing as they are, then tune.

## The key

A collapsed button in the map's bottom-left corner reads **"What do the places
mean?"** and expands into a panel (`var(--paper)`, S3). Hovering a
community's label on the map shows its one-line meaning as a tooltip. The same
text feeds the Communities cards.

| Place | Meaning (UI copy) |
|---|---|
| Forest | A close-knit group you've known for years, where most people know each other. |
| Coral Reef | Lots of different roles and organisations overlapping and mixing. |
| Savannah | A big, spread-out network where people know you but not really each other. |
| Wetland | A temporary gathering that swells around an event, then recedes. |
| Island | A small specialist group, mostly talking to itself, with few routes out. |
| Sandbank | A new community that has only just started forming. |
| Open sea | People who don't belong to any community yet. |
| Mangrove sandbar | People who belong to both communities and link them. |
| Stepping stones | Links between two communities, but nobody who belongs to both. |

Below the places, the creature states: Active, Quiet, Bridge (segmented shell),
New this year (small, with a sparkle), Landmark (an organisation).

## Data contract (server)

Extend `GET /api/network-ecology/world`. Keep every existing field; add these:

- **`links`:** every visible link, **current and ended**, as
  `{ source_ref, target_ref, relationship_type, role, valid_from, valid_to, status }`.
  This covers `employee_at`, `member_of` and `professional_relationship`. With
  it the client can replay any year without refetching. The privacy rules in
  `network-ecology-world.mjs` apply unchanged.
- **Per node:** `last_contacted` (`YYYY-MM-DD` or `null`) and `is_self`.
- **`timeline`:** `{ [year]: { clusters, bridge_people } }` for every year from
  the earliest known `valid_from` year (floor 2015) to the current year.
  - Each year is computed with the **existing** point-in-time rules in
    `network-ecology-history.mjs` plus the classifier, so classification stays
    in one place, on the server.
  - The current year equals today's `clusters`.
- **Clusters:**
  - Every node in `member_refs` keeps **all** its clusters. Remove
    `buildHabitatByRef`'s "first habitat wins" from the view; the model reads
    membership directly.
  - Add a `since` year to each cluster, and `event_date` for event clusters.
  - `habitat` is always one of the 6 kinds (forest, reef, savannah, wetland,
    island, sandbank). It is never `null`, because every community needs a
    landform. See **Open decision 1** for unclassified clusters.
- **Sandbank rule** (new, in `habitat-classification.mjs`): an organisation
  cluster of at most 4 people where every member's link to it has a known
  `valid_from` within the last 365 days. Apply it in the precedence order
  above.
- **Upcoming events:** `upcoming_events: [{ ref, title, date, attendee_refs }]`
  for the next 60 days, attendees filtered to visible people. This drives the
  Opportunity layer. When it is empty, the layer button still works and shows
  "No upcoming events with people you know" (I3).

Leave `/ego` and `/history` in place, but the new view doesn't call them.
Removing them is separate cleanup.

## Truthfulness rules (D1)

- **Start year of a person** = the earliest known `valid_from` over their
  links.
  - If none is known, they appear **only at Now**.
  - In any earlier year, a quiet note under the timeline reads
    "N people have no start date, so they only appear at Now."
  - Never place them in 2015 or at the import date.
- **Quiet** = `last_contacted` more than 365 days before today. `null` means
  not quiet; count those people in the key as "last contact unknown".
  - Dormancy is only shown at **Now**. In past years the Dormancy toggle is
    disabled, with a note: "Dormancy uses your last contact date, so it only
    shows at Now."
- **Communities in past years** come from `timeline[year]` only. The client
  never reclassifies.

## Architecture (client)

Create `apps/professional/src/components/miniworld/`:

| File | Job |
|---|---|
| `model.ts` | **Pure.** `buildWorldModel(api, year, today)` returns communities (habitat, members, stats, why-sentence), ecotones, stepping-stone pairs, people (homes, start year, state: active, quiet, new or unknown), landmarks, open sea, upcoming events and insights. **Every count on the page comes from this one object (V4).** |
| `layout.ts` | **Pure and deterministic.** Positions every community that exists in **any** year, so scrubbing never moves an island. |
| `terrain.ts` | Habitat, sea, sandbar and shoal drawing, ported from the mockup. |
| `creatures.ts` | Crab drawing (N-segment shells), motion, level of detail. |
| `camera.ts` | Pan, wheel zoom, pinch, keyboard (+ − 0 arrows Esc), zoom buttons, focus animation. |
| `world-canvas.ts` | Mount, render loop, hit-testing, hover tooltip, visibility pause, reduced motion, resize. |
| `panel.ts`, `key.ts`, `cards.ts`, `timeline.ts`, `insights.ts` | DOM around the canvas. |

`views/network-ecology.ts` is rewritten to host these parts. The mode pills go:
- **World View** is the page.
- **Your Network** becomes a **"Find me"** button. It moves the camera to You
  and dims everyone more than 2 hops away, computed from `links` in the model.
- **History** is the timeline under the map.
- Selecting a person gives a **"Show their world"** button with the same
  two-hop dim.

**Layout** (`layout.ts`):
- Communities are nodes. Each pair is weighted by 3 × shared people +
  cross links.
- Run a seeded force layout synchronously to convergence:
  - collide on each landform's outer radius (reef ring and island reef
    included), plus 40 units;
  - add extra outward push for Island;
  - start wetlands at the centroid of the communities their people come from,
    so they sit in the water between them;
  - start sandbanks near their best-linked community.
- The seed comes from sorted community ids, so the same data gives the same
  world. Radius = `62 + 26·√(largest member count across years)`, capped at
  260.
- **Open sea:**
  - Drifters sit on driftwood in a loose ring outside the archipelago's
    bounds.
  - An organisation with exactly one known person becomes a **buoy** landmark
    next to that drifter.
  - At zoom below 0.6, open sea shows as small dots with one label,
    "Open sea · N people".

**Performance:** the target is 60fps on Adam's Mac with 400 people.
- Cache static terrain to an offscreen canvas per zoom tier. Redraw it when
  zoom changes by more than 25% or while landforms are animating.
- Below zoom 0.6, draw crabs as simple shells.
- Animate only crabs on screen.
- Test with a 400-person fixture.

## Phases

### Phase 0: real-data check (after the data fix is live)

Log the live `/world` response shape. Report to Adam in the PR:
- people;
- communities by habitat;
- open sea size;
- sandbars;
- people with no start date;
- people with no last contact.

This is the checkpoint for Open decisions 1–2.

### Phase 1: server contract

Build every item in "Data contract", with tests in the existing
`tests/integration/network-ecology-*.test.js` style:
- sandbank rule and precedence;
- a person in two clusters keeps both;
- timeline years;
- ended links carry dates;
- the privacy fixture still hides the archived person in every new field;
- `upcoming_events` filtering.

### Phase 2: model and layout (pure)

`model.ts` and `layout.ts`, with unit tests:
- counts per community match the members;
- ecotone count equals the number of shared people;
- no-start-date people are absent before Now;
- quiet only at Now;
- the same input gives the same positions;
- an island's position is identical in 2018 and 2026.

### Phase 3: renderer

Terrain, creatures, landmarks, sandbars and plants, hit-testing, panel, hover
names and the key.
- The panel's "why they live here" text is built from real data, as in the
  mockup.
- Use `apiGet` for the fetch (W1).

### Phase 4: timeline, layers, insights

- Play and scrub (1.4 s per year). Year readout "Now" or "History" (V2).
- Layers: Names, Mycelium, Opportunity, Dormancy.
- Insights are plain sentences from the model, and each is clickable to focus
  its subject. The mockup's six are the pattern; skip any whose data is
  missing.

### Phase 5: open sea, sandbank, phone, accessibility

- Open sea drifters and buoys, and sandbank visuals (pale sand, seedlings).
- The Communities cards view, which is the phone layout.
- The canvas gets an `aria-label`; the cards view is the text alternative.
- Everything is reachable by keyboard.
- Safari pinch (`gesturestart`/`gesturechange`) plus the zoom buttons (C4).

### Phase 6: live acceptance

Run the acceptance case above on the live umbrella at 1440 and 390. Put
screenshots next to the mockup in the ledger (P1).

## Open decisions (ask Adam at Phase 0; don't guess)

1. **Clusters that match no rule.** Today `classifyHabitat` can return `null`.
   The recommendation is to make them **Savannah** (the loose catch-all) and
   report how many that is. Adam may prefer a new habitat.
2. **Very large organisations.** A current employer with 60 or more people
   could dwarf everything else. The recommendation is the radius cap above,
   with that island's density shown honestly. Revisit if it still dominates.

## Failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

- **L1:** the map stage is full width. Check: its right edge matches the
  timeline's ±1px at 1440.
- **L5:** the toolbar is at most 2 rows at 390.
- **S3:** the panel and key are opaque (`var(--paper)`). Check: no map shows
  through them.
- **V1:** the panel, key, notes and tooltips each have a `[hidden]` rule.
  Check: `offsetHeight === 0` when closed.
- **V2:** layer buttons, year readout and Communities/World toggle follow state
  changed by keyboard and by insight clicks.
- **V4:** community labels, panel stats, key counts, cards and insights all
  read from `buildWorldModel`. Check: one test asserts each figure against the
  model.
- **R1:** 390 → 1440 → 390 without reloading switches cards to map to cards.
- **R2 / R3:** no horizontal scroll at 390. Screenshot the cards, timeline and
  insights at 390.
- **C1:** community labels and name tags don't collide. At each zoom tier, run
  a collision pass that hides the lower-priority label (hover still shows it).
- **C4:** pinch in Safari, pinch in Chrome, and the buttons all work.
- **D1:** the start-date and dormancy rules above. Check: a fixture person
  with no `valid_from` is absent in 2020 and present at Now.
- **D2:** cards are sorted by member count descending, chips by display name,
  and insights in the mockup's order.
- **D3:** acceptance screenshots use live data and name real communities.
- **D4:** the habitat rules are tested on the Phase 0 real cluster stats, not
  invented ones.
- **D5:** read every generated sentence (why-text, insights, notes) aloud; it
  reads as something a person would write.
- **I2 / I3:** every chip and insight is a `<button>`. With an empty store the
  page says "No communities yet" and the timeline is disabled.
- **W1 / W2:** `apiGet` only. One test goes through the real view entry with a
  stubbed API.
- **P1 / P2 / P3:** mockup diff in the ledger, a fresh branch from `main`, and
  the live acceptance case as the definition of done.
