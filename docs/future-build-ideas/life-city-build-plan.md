# Life City build plan

**Status:** Draft plan. Not a build brief. Nothing builds until Adam names a slice.
**Written:** 7 October 2026
**Governs from:** the critical review at the top of [life-city.md](life-city.md). Where this plan and a verdict there disagree, the verdict wins.
**Missing input:** the resources doc (`life-city-resources.md`) has not reached the repo yet. Each slice below has a **Resources** line saying what it expects that doc to supply. Once the doc lands, those lines get filled in and the plan is revised.

---

## 0. Assumptions

These are the review's five open decisions, answered with the review's own lean. Adam can overrule any of them. Each one changes a named slice.

| # | Decision | Assumed | If Adam says otherwise |
|---|----------|---------|------------------------|
| D1 | Glance or visit? | Glance first. Explore is a free camera over the same city | Slice 3 grows. Slice 2's test becomes a visit test |
| D2 | Phone | Wide-screen city plus a Home tile. No new phone board | A board must name the Tasks view it replaces (F8) and becomes its own slice |
| D3 | Event log | Approved in principle, built in Slice 4, not before | The catch-up stays on timestamps forever, and Time tools are cut |
| D4 | Split out governance | Yes, to its own doc. Not in this plan | — |
| D5 | Glance test | Adam sits it at the end of Slice 2 | Without it, Slice 3 does not start |

## 1. Where the code lives

Checked against `main`, 7 October 2026.

| Need | Existing code | Plan |
|------|---------------|------|
| Routes, stations, state, pace, ghost | `apps/tasks/src/domain/graph-model.ts` (`projectRoute`, `nodeState`, `pace`, `serviceStatus`) | The city reads these. It does not copy them (P2, Modify) |
| Lines' own line model | `buildLines` inside `apps/tasks/src/views/graph-lines.ts`, not exported | Lift to `domain/` only if the city needs the same shape. Otherwise leave Lines alone |
| Blocked, waiting | `domain/blocked-since.ts`, `domain/blockers.ts`, `domain/waiting.ts` | Barrier source, mail van source (`waiting_status: follow_up_due`) |
| Life walls | `domain/life-wall.ts` | Service suspension on those dates (F2) |
| Capacity sky | `packages/design-kit/js/calendar/capacity-model.js` (`capacityForDates`) | Sky state, one of the 30 icons, or the unknown state |
| Terms | `packages/design-kit/js/calendar/school-terms.js` | Term edition, school bus |
| Liveness | `isOpenTask` (`domain/goal-hosting.ts`), `trashed_at` (`schemas/common.ts`) | Deleted means gone |
| Home tile | `apps/life/js/app/render-surface-widgets.js`, `netlify/functions/surface-widgets.mjs` (approved templates only) | A new approved template in Slice 3 |
| Tests | `apps/tasks` uses vitest (`apps/tasks/tests/unit/*.test.ts`) | All city tests go there |

New code sits in one folder: `apps/tasks/src/domain/city/` for logic and `apps/tasks/src/views/city/` for drawing. The city is a lens of the Tasks hub (open question in §8 of the concept doc, answered by P2).

## 2. Slices

Each slice has one builder, end to end (F9). Each slice is its own PR through `npm run pre-pr-check`. Code slices are not idea docs, so they never go straight to `main`.

### Slice 1 · City snapshot and golden days (no picture)

**Builder:** Claude Code. **Size:** one PR.

A pure function `citySnapshot(input, now) → CitySnapshot` and the tests that pin it down. No pixels.

**Must**
- Types in `domain/city/types.ts`: `CitySnapshot` with `clock`, `sky`, `districts`, `lines` (goals), `routes` (projects), `stops` (tasks), `interchanges`, `trams` (capped), `vehicles` (momentum only), `services` (ambulance, school bus, food truck, mail van, crane), `suspensions`, `barriers`, `lateRings`, `halo` (zero or one), `depot` (count), `vacantLots`.
- Vocabulary borrowed from GTFS nouns only (route, stop, trip, calendar exception, alert). No GTFS files.
- Momentum defined: tracked work sessions plus completions in the last seven days (Modify verdict).
- Late is a passed due date only. Never "days untouched".
- Dreams are not on the network (F3).
- Walls become `suspensions` keyed by date range. No detour geometry.
- About twelve data rules as tests in `tests/unit/city-rules.test.ts`:
  `deleted_record_visible`, `stop_order_changed` (against `projectRoute`), `lens_disagreement` (stop state against `nodeState`), `weather_not_from_forecast`, `unknown_shown_as_value`, `finance_in_city`, `single_halo`, `late_from_due_only`, `dream_on_network`, `suspension_not_detour`, `service_without_record`, `signal_without_destination`.
- Four golden days as fixtures plus expected snapshots in `tests/unit/city-golden-days.test.ts`: **Sunday 16:30**, **suspended service**, **deleted yesterday**, **no check-in morning**.
- Golden day fixtures use made-up records, not Adam's real data.

**Must not**
- Touch any Tasks view, store or write path.
- Add an event log (Slice 4).
- Add any picture, sprite, colour or renderer dependency.
- Add rules that judge a picture (F7). Those go to the review checklist in Slice 2.

**Verify**
- `cd apps/tasks && npx vitest run tests/unit/city-` passes.
- Each rule has one test that fails when the rule is broken on purpose.
- `npm run pre-pr-check` exits 0.

**Files:** `apps/tasks/src/domain/city/{types,snapshot,rules,momentum}.ts`, `apps/tasks/tests/unit/city-*.test.ts`, `apps/tasks/tests/fixtures/city/*.json`.

**Resources:** the doc's mapping of life to city, if it differs from the review. Any extra service or vehicle types.

### Slice 2 · Layout engine and the glance prototype

**Builder:** Claude Code builds the layout engine. Cursor builds the static street, because it needs live preview. This is two PRs in strict order, each one whole.

**2a · Layout engine (Claude Code)**
- A grid of reserved slots per district. Lines at 0, 45 and 90 degrees (Beck). Fixed slot order keyed by record id.
- Never reflow: adding a record only fills a free slot or grows the map at its edge.
- Pins store tile and footprint only.
- Tests: `layout_reflow` (add a project; every other position is unchanged), `pin_moved_by_layout`, determinism (same input gives the same output twice).

**2b · Glance prototype (Cursor)**
- One page at `/tasks/city?golden=<day>` rendering each golden day snapshot as a static isometric street using Kenney sprites.
- Channel budget enforced (P10): hue is identity only, motion is momentum only, light is open or finished, sky is the capacity forecast, line style is the lifecycle, shape is the exceptions (barrier, halo, late ring).
- "Since you were last here" built from timestamps only (created, completed, trashed). Quiet days say "Quiet since …" and play nothing. One tap skips.
- No live data and no Home tile yet.
- Renderer: PixiJS 2D, lazy-loaded on the city route only (W4).
- UI failure register: **W4** (Pixi out of the entry bundle; check the built entry chunk size is unchanged), **C2** (no decorative band or motion standing in for data; check that every moving sprite maps to a snapshot vehicle id), **C9** (no settle then snap; check that the first frame is the final layout), **V7** (a repaint keeps the camera; check that the camera holds after a data refresh), **D3** (screenshots on golden days are labelled as fixtures), **P5** (a prototype is not the city).
- Review checklist (the picture rules from F7 that cannot be unit tested): building hides alert, scenery read as signal, quiet read as failure. Claude Code reviews against it.

**The glance test (Adam).** Four golden days, plus two Adam has not seen. Each is shown for three seconds as a catch-up replay. Adam then says what changed and what needs him.
**Pass:** he names the main change and the decision correctly on at least five of six, without reading a label.
**Fail:** stop. Record the result in the concept doc's History. Do not start Slice 3.

**Resources:** the Kenney pack list, the sprite spec (tile size, angle, frame counts), the style reference and the palette mapping of line colours to hub domains.

### Slice 3 · Live city and Home tile

**Builder:** Cursor. **Starts only after a passed glance test.**

- Feed `citySnapshot` from the live Tasks store and the capacity and term data. Desktop and tablet only.
- Real clock day and night, idle by default, dims at night.
- Every door opens the owning hub page (F4). No editors in the city.
- Home tile: a new approved surface widget template showing a small live tile with the sky. It opens `/tasks/city`.
- Station clock mode: full screen, dimmed, no controls until touched.
- Tap a bus to open the project and a stop to open the task (concept §8 open question, answered).
- UI failure register: **W1** (umbrella-relative fetches), **W2** (proven on the deployed umbrella, not only in tests), **R2** and **R3** (the Home tile at 390 with no horizontal scroll), **V4** (the city and Lines agree on the same stop; Slice 1's `lens_disagreement` covers the data), **I3** (empty city: a clear first-run state, not a blank canvas).

**Verify:** the stress test walk of `/tasks/city` and Home at desktop and 390.

### Slice 4 · Event log

**Builder:** Claude Code. **Needs D3 confirmed.**

- Append-only, ids and event names only, at the Tasks write path. No titles, note bodies or photos (`event_log_holds_content`).
- History starts the day it ships. No backfill.
- The catch-up gains blocks, unblocks and suspensions.
- Deleted records are filtered on read, so they vanish from every past day.

### Slice 5 · Delight

**Builder:** Cursor, with Adam's art.

In order: Adam's pets, the almanac, vacant lots (a small data file in the repo), personal landmarks, keepsake slots, then the Balloon Gathering, then whale watching. Each is its own small PR.

**Resources:** pet sprites, the almanac entries, the vacant lot list.

### Later, not planned here

Rewind and Forecast scrubbers (after a term of log), term replay, Ask the stationmaster. Governance, the dam and the heritage register go in their own doc.

## 3. What is needed, and from whom

### From Adam

| # | What | Needed by | How |
|---|------|-----------|-----|
| A1 | **The resources doc** | Now | Commit it to `docs/future-build-ideas/life-city-resources.md`, or paste it into chat |
| A2 | Confirm or overrule D1 to D5 | Before Slice 1 | One line each |
| A3 | **Kenney packs.** Isometric City, Isometric Buildings, Isometric Vehicles #1, Isometric Landscape and Isometric Roads, or whatever the resources doc lists | Slice 2b | The cloud sandbox cannot reach kenney.nl (blocked by the network allowlist). Download the zips and either commit only the sprites used under `apps/tasks/public/city/kenney/` with the CC0 licence file, or put the zips in Drive for Cursor |
| A4 | Line colour per goal domain, or "reuse the Lines colours" | Slice 2b | Default: reuse `lineColour` from Lines |
| A5 | Sit the glance test | End of Slice 2 | About ten minutes |
| A6 | Name the corner and the public edge | Slice 3 | Two names |
| A7 | Pets: names, a few photos each, and a resting spot | Slice 5 | Later |
| A8 | Almanac entries, including whale months | Slice 5 | Later |
| A9 | Keepsake pieces made to the sprite spec | Slice 5 | Later, at Adam's pace |

### From Chat

| # | What |
|---|------|
| C1 | Check the resources doc against the critical review: Metropolis not Sydney, cut items left out, no Notion |
| C2 | The **sprite spec**: isometric angle, tile size in px, anchor point, frame counts for vehicles and pets |
| C3 | One **locked style reference** for any AI-assisted hero piece: angle, palette and outline weight |
| C4 | A palette check: line hues must not clash with the 30 sky states or with the barrier, halo and late ring shapes |

### From Cursor

| # | What |
|---|------|
| K1 | Confirm that a new approved surface widget template is the right route for the Home tile, or name a better one |
| K2 | Confirm that PixiJS can lazy-load on one route in the Tasks Vite build without touching the entry chunk |
| K3 | Build Slice 2b and Slice 3 to the briefs above, once Slice 1 merges |

## 4. History

- **2026-10-07:** Draft written from the critical review and a check of `main`. The resources doc is pending.
