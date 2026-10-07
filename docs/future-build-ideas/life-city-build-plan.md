# Life City build plan

**Status:** Draft plan. Not a build brief. Nothing builds until Adam names a slice.
**Written:** 7 October 2026
**Governs from:** the critical review at the top of [life-city.md](life-city.md). Where this plan and a verdict there disagree, the verdict wins.
**Inputs:** the critical review, a check of `main`, and the resource catalogue in [life-city-resources.md](life-city-resources.md).

---

## 0. Assumptions

These are the review's five open decisions. Adam answered four of them on 7 October 2026; D2 still stands on the review's lean.

| # | Decision | Assumed | If Adam says otherwise |
|---|----------|---------|------------------------|
| D1 | Glance or visit? | **Adam: visit, in the SimCity and Cities: Skylines sense.** Not rooms, walks or activities. A city you move around, zoom into and inspect. Glance still matters, but a moving train must explain itself without guesswork | See §1a. Slice 2b gains inspection. Info views move up to Slice 3 |
| D2 | Phone | Wide-screen city plus a Home tile. No new phone board | A board must name the Tasks view it replaces (F8) and becomes its own slice |
| D3 | Event log | **Adam: yes.** Built in Slice 4 | — |
| D4 | Split out governance | **Adam: yes.** Its own doc, which still needs thinking through. Not in this plan | — |
| D5 | Glance test | **Adam: yes.** Sat at the end of Slice 2, now with an inspection half (see Slice 2) | Without it, Slice 3 does not start |

## 1a. What "visit" means here

Adam's complaint with a glance-only city: "a train is moving, and I need to click on it to figure out what it means." The Cities: Skylines answer is that everything on screen explains itself the moment you ask, and the city has map modes for each question. That fits the review: it is the "info views only on request" Keep (P11) moved earlier, not a return of the cut rooms.

- **Free camera.** Pan, zoom and rotate (the models are 3D, so every angle exists). Zooming in brings up labels: line names, route names, district names.
- **Hover to know, click to inspect.** Every vehicle, stop, building, barrier and service has a hover card in plain words ("Year 10 marking: 3 of 7 stops done, moving this week") and a click panel: what it is, why it is there (the record and the rule that put it there), and a button that opens the owning hub page. No editing in the panel (F4).
- **Info views** (Skylines' map modes): a toolbar that recolours the city for one question at a time, such as Capacity, Blocked and waiting, Due dates, Teaching load and Momentum. While an info view is on, the channel budget is suspended for that question and a legend explains the colours. Turning it off returns the calm street.
- **A legend** that is always one tap away, listing every vehicle and shape and what it means.
- **Glance stays.** The default view is still the calm street with the channel budget, and the Home tile is still the glance surface. Visit is what happens when Adam leans in.
- **Not included:** zoning, money, building placement for records, or any simulation that invents activity. Records place themselves. Adam places only his own landmarks, keepsakes and the ground (Track B).
- **The city grows on its own.** Adam's call: he does not want to place districts or routes. He wants to see how the city and its surrounds grow from his life. The one condition is that routes are long enough to show real movement and make sense (Slice 2a).

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

## 2. Stack, taken from the resource catalogue

The catalogue's recommendation is adopted with the changes marked **Changed**. Versions are the npm `latest` on 7 October 2026. Each is pinned when it is first installed.

| Use | Choice | Notes |
|-----|--------|-------|
| Renderer | `three` (Three.js, MIT) with a fixed orthographic camera at the isometric angle | **Changed 7 Oct:** the Kenney upload is 3D models (GLB), so they load as they are. No sprite conversion. Lazy-loaded on `/tasks/city` only (W4). The Home tile must not pull it into Home's bundle |
| Camera | Three.js `OrbitControls`, locked to orthographic | Glance: camera still. Explore: pan, zoom, rotate in 90 degree steps |
| Ground and roads | City Kit Roads and 3D Road Tiles models on the layout grid, instanced | Many copies of one model are drawn as one (`InstancedMesh`) to stay fast |
| Halo and night | Three.js lighting and one emissive halo mesh | Night is the scene lights dimming plus lit window materials |
| Movement | Tween.js | Driven by the city clock, not wall time, so a replay gives the same frames |
| Particles | Three.js `Points` | Slice 5 only |
| Pet paths | EasyStar.js | Slice 5 only. Never used for routes: a suspension is dates, not a detour |
| Asset pipeline | The GLB files, copied at build time from `assets/kenney/` for the models in use, compressed with `gltf-transform` if needed | Three load groups: `core`, `pets`, `festival`. The Home tile loads a pre-rendered image |
| Map composition | Tiled, driven by Codex on Adam's Mac if Adam wants to shape it by hand | **Changed.** Tiled holds the fixed ground only: terrain, the named corner, the public edge and scenery lots (Track B). Routes, stops and buildings tied to records come from the layout engine. Hand-editing a Tiled map for every new project would break never-reflow and turn Adam into the map's maintainer |
| Scenery variation | seedrandom | Scenery variants only. Record placements are stored slots, never seeds |
| Whole-city reference | IsoCity (MIT) | Reference only for route following. Its depth sorting is not needed in 3D |

**Not adopted:** PixiJS and its plugins, Tiled's isometric 2D maps for anything but the optional ground sketch, the Blender sprite rig, Phaser, Excalibur, Godot, Pogicity art (its README limits the art to prototyping), Buggy Studio and Tibayan assets (no clear reuse licence), Howler.js (the existing chimes preference covers sound), the legacy particle emitter, TexturePacker and Aseprite. **Asset Forge** (about AUD 29) is the first purchase, for the missing bus, school bus, crane and food truck. It exports GLB.

### Licences: the repo is public

`adamrussell91-hash/life-hub` is a public repository. Every asset committed to it is redistributed. That makes three rules:

1. **CC0 only in the repo by default.** Kenney, Screaming Brain Studios, Kenney Particle Pack and Kenney audio qualify.
2. **CC BY (the Poly Pizza balloons)** may be committed with creator, licence, source URL and a note of modifications in `apps/tasks/public/city/CREDITS.md`, shown on an in-app credits line.
3. **Quaternius (QAL) source files must not be committed.** QAL prohibits standalone redistribution, including modified assets. If a Quaternius animal is used, only the model inside the built product ships, and the source stays on Adam's machine. If in doubt, use Kenney Cube Pets instead.

Every asset gets a line in `apps/tasks/public/city/assets.json`: file, source pack, URL, licence, date fetched and modifications. A test fails if a file in the city asset folder has no line there.

## 3. Slices

Each slice has one builder, end to end (F9). Each code slice is its own PR through `npm run pre-pr-check`. Code slices are not idea docs, so they never go straight to `main`.

Track A runs beside Slice 1, because neither needs the other.

### Slice 1 · City snapshot and golden days (no picture)

**Status:** Built in PR #730 (draft). As built:
- 13 rules, adding `vehicle_without_momentum` (motion is momentum only).
- Barriers and late rings are flags on each stop, not separate lists.
- Vacant lots move to Slice 5 with the gap-map data file.
- Interchanges are stops that depend on a task in another project (`depends_on`, as Tasks Lines already draws them). `linked_project_ids` and `linked_goal_ids` turned out to be Someday promotion links, not shared tasks.
- Tasks inside a removed project count as deleted.
- The timestamp catch-up (`cityCatchUp`) is in this slice, since it is pure data.
- Live adapters for appointments, meals, decisions and the sky are Slice 3. The snapshot takes them as typed inputs.

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

### Track A · Art check (Adam and Chat, beside Slice 1)

This is the catalogue's §7 point: the packs remove drawing work, but not mismatched angles, shading and anchors. Fix those once, before any city code draws a model.

- **Base family:** the Kenney 3D city kits already in `assets/kenney/` (City Kit Roads, Commercial, Suburban, Industrial, Car Kit, Train Kit, Watercraft Pack, Nature Kit). They share one style, so no conversion rig is needed. Inventory: [life-city-assets.md](life-city-assets.md).
- **Model spec** (`apps/tasks/public/city/MODEL-SPEC.md`): tile size in metres, camera angle, light direction, palette and model scale. Keepsakes and pets use the same spec.
- **Proof scene:** one road, one building, a tram, a bus stand-in and a boat in a Three.js scene at the locked camera. If they don't sit together, fix the light and scale before going further.
- **Vehicle gaps:** bus, school bus, crane, food truck and passenger ferry are missing. Stand-ins for the glance test; Asset Forge for the real build.
- **Sky:** decide how the 30 capacity weather states show over the city. The catalogue does not cover this. Suggested: a sky gradient plus the existing weather icon in a corner badge, with no new art for each state.
- **Credits and `assets.json`** started, per the licence rules above.

**Done when** the proof scene looks like one city to Adam.

### Track B · The ground (Adam, beside Slice 1)

Adam has ideas for the physical space. They go in [life-city-ground.md](life-city-ground.md) before the layout engine is written, because the ground decides where the slots can go.

- The public edge is water: a harbour or a river. No route or life wall may close it.
- The corner is one named public place that belongs to no hub.
- Water, hills and parks exist because Adam wants them, not to copy a real city (Metropolis ruling).
- Output: a ground map (Tiled JSON, or generated in code from the brief) that Slice 2a reads as fixed obstacles.

### Slice 2 · Layout engine and the glance prototype

**Builder:** Claude Code builds the layout engine. Cursor builds the static street, because it needs live preview. Two PRs, in strict order, each one whole. 2b needs Track A done.

**2a · Layout engine (Claude Code)**

**Status:** Built in PR #732 (draft, stacked on #730). Pins wait for keepsakes in Slice 5, since Adam does not place records by hand. A full district spreads into the nearest free block. Metro lines hop between stations in L-shapes and may cross other districts.

- A grid of reserved slots per district. Lines at 0, 45 and 90 degrees (Beck). Fixed slot order keyed by record id.
- Never reflow: adding a record only fills a free slot or grows the map at its edge.
- The Tiled ground map is an input: its scenery lots, corner and public edge are fixed obstacles that no slot may use.
- Pins store tile and footprint only.
- **Routes long enough to move along.** A route has a minimum length in tiles, even with one or two stops, with stops spaced so a bus visibly travels between them. A short project gets a longer, quieter route, not a stub.
- Tests: `layout_reflow` (add a project; every other position is unchanged), `pin_moved_by_layout`, `public_edge_closed`, and determinism (same input gives the same output twice, and in shuffled input order).

**2b · Prototype: glance and inspect (Cursor)**
- One page at `/tasks/city?golden=<day>` rendering each golden day snapshot as a static isometric street from the Kenney models.
- Route following written for our snapshot (IsoCity is a reference only).
- Channel budget enforced (P10): hue is identity only, motion is momentum only, light is open or finished, sky is the capacity forecast, line style is the lifecycle, shape is the exceptions (barrier, halo, late ring).
- "Since you were last here" built from timestamps only (created, completed, trashed). Quiet days say "Quiet since …" and play nothing. One tap skips. Reduced motion jumps straight to Now.
- Building fade only when a barrier, halo or service vehicle sits behind it (plan the layout first, fade second).
- Hover cards, click panels, zoom labels and the legend from §1a, on the golden days. Info views wait for Slice 3.
- No live data and no Home tile yet.
- UI failure register: **W4** (Three.js out of the entry bundle; check the built entry chunk size is unchanged), **C2** (no decorative band or motion standing in for data; check that every moving model maps to a snapshot vehicle id), **C9** (no settle then snap; check that the first frame is the final layout), **V7** (a repaint keeps the camera; check that the camera holds after a data refresh), **D3** (screenshots on golden days are labelled as fixtures), **P5** (a prototype is not the city).
- **Measure:** first load and frame rate on desktop and on Adam's iPhone (catalogue §6.2).
- Review checklist (the picture rules from F7 that cannot be unit tested): building hides alert, scenery read as signal, quiet read as failure. Claude Code reviews against it.

**The glance test (Adam).** Four golden days, plus two Adam has not seen. Each is shown for three seconds as a catch-up replay. Adam then says what changed and what needs him.
**Pass:** he names the main change and the decision correctly on at least five of six, without reading a label.
**Inspect half:** on the same days, Adam picks any five moving or marked things and says what each means after one hover. **Pass:** five of five, with no guessing.
**Fail:** stop. Record the result in the concept doc's History. Do not start Slice 3.

### Slice 3 · Live city and Home tile

**Builder:** Cursor. **Starts only after a passed glance test.**

- Feed `citySnapshot` from the live Tasks store and the capacity and term data. Desktop and tablet only.
- Real clock day and night, idle by default, dims at night.
- Every door opens the owning hub page (F4). No editors in the city.
- **Info views** from §1a, each with its own legend and a test that the overlay colours come from the snapshot, not from new logic.
- Home tile: a new approved surface widget template showing a pre-rendered image of the city with the sky. It opens `/tasks/city`. No Three.js on Home.
- Station clock mode: full screen, dimmed, no controls until touched.
- Tap a bus to open the project and a stop to open the task (concept §8 open question, answered).
- **Accessibility:** the halo, barriers and depot count have keyboard focus and a plain-text equivalent in an HTML overlay. The canvas alone is not the control.
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

In order, each its own small PR:

1. **Adam's pets.** Kenney Cube Pets (3D, animated) as the movement base, then each pet's own look from his photos. EasyStar on footpaths in Explore. A fixed resting spot in Glance.
2. **Almanac.** Palette and model swaps from Adam's chosen dates.
3. **Vacant lots, personal landmarks, keepsake slots.** Keepsakes import against the model spec and are listed in `assets.json`.
4. **Balloon Gathering.** One CC BY Poly Pizza balloon, credited, loaded as a model and recoloured per dream. Explore only, labelled.
5. **Winter snow** (catalogue §6.6). Three.js `Points`, density cap, reduced motion, stops when the tab is hidden, torn down when leaving the city.
6. **Whale watching.** No whale art exists in the catalogue. Needs a custom silhouette, which Adam draws or commissions.

### Later, not planned here

Rewind and Forecast scrubbers (after a term of log), term replay, Ask the stationmaster. Governance, the dam and the heritage register go in their own doc.

### Where this plan departs from the catalogue's first evaluation (§6)

- §6.1 composes a whole street in Tiled. Here Tiled composes the ground only, and the layout engine places everything tied to a record (see Stack).
- §6.5 tests the golden days in the renderer. Here they are written first, as data tests in Slice 1, before any renderer exists.
- §6.6 adds snow in the first evaluation. Here it waits for Slice 5. The glance test decides whether there is a city to snow on.

## 4. What is needed, and from whom

### From Adam

| # | What | Needed by | How |
|---|------|-----------|-----|
| A1 | Confirm or overrule D1 to D5 | Before Slice 1 | One line each |
| A2 | ~~Kenney packs~~ | Done | Uploaded to `assets/kenney/` (PR #731). The four 2D Isometric Tiles packs are not needed now |
| A3 | Asset Forge, for the missing bus and school bus | Before the big build | Optional for the glance test, where stand-ins work |
| A4 | ~~Blender and Tiled~~ | Not needed | The 3D route drops the conversion rig |
| A5 | Line colour per goal domain, or "reuse the Lines colours" | Slice 2b | Default: reuse `lineColour` from Lines |
| A6 | Approve the proof scene | End of Track A | One look |
| A7 | Sit the glance test, with the iPhone to hand | End of Slice 2 | About ten minutes |
| A8 | **Ground brief**: the physical space, the corner and the public edge (harbour or river) | Slice 2a | Fill in [life-city-ground.md](life-city-ground.md) |
| A9 | Pets: names, a few photos each, and a resting spot | Slice 5 | Later |
| A10 | Almanac entries, including whale months, and a whale silhouette | Slice 5 | Later |
| A11 | Keepsake pieces made to the model spec | Slice 5 | Later, at Adam's pace |
| A12 | Asset Forge (about AUD 29), only if Track A's vehicle audit finds a gap | When asked | Optional |

### From Chat

| # | What |
|---|------|
| C1 | Write the **model spec** from the Kenney 3D kits: tile size, camera angle, light direction, palette and scale |
| C2 | One **locked style reference** for any AI-assisted hero piece and for the pet likenesses |
| C3 | A palette check: line hues must not clash with the sky gradients, or with the barrier, halo and late ring shapes |
| C4 | The **sky** treatment for the 30 capacity states (Track A suggests a gradient plus the existing icon) |
| C5 | Correct the catalogue's licence note: the repo is public, so Quaternius source files cannot be committed |

### From Cursor

| # | What |
|---|------|
| K1 | Confirm that a new approved surface widget template showing a pre-rendered image is the right route for the Home tile |
| K2 | Confirm that Three.js can lazy-load on `/tasks/city` in the Tasks Vite build without touching the entry chunk |
| K3 | Run the IsoCity spike and build Slices 2b and 3 to the briefs above, once Slice 1 and Track A are done |

## 5. History

- **2026-10-07:** Draft written from the critical review and a check of `main`.
- **2026-10-07:** Resource catalogue folded in. Added the Stack section, licence rules for a public repo, Track A (art rig), the IsoCity spike, an accessibility requirement and the Slice 5 asset sources. The Kenney pack list now names the Isometric Tiles family. Tiled is limited to the fixed ground.
- **2026-10-07:** Adam's answers: visit in the SimCity and Cities: Skylines sense (free camera, hover and click to inspect, info views, legend), the event log approved, governance split out, glance test approved with an inspection half. Added §1a, Track B (the ground) and the ground brief. Codex runs Blender and Tiled on Adam's Mac.
- **2026-10-07:** Adam: no hand placement of districts or routes; the city grows on its own, with routes long enough for real movement. Slice 1 built (PR #730) with the deviations noted under Slice 1.
- **2026-10-07:** Renderer switched to Three.js after the Kenney upload turned out to be 3D models. No sprite conversion, rotation for free, Blender and Tiled no longer needed. Unused packs are deleted once the build is complete and we know which are used.
- **2026-10-07:** Slice 2a (layout engine) built in PR #732.
