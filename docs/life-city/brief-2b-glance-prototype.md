# Brief 2b · Life City glance prototype (Cursor)

**Slice:** 2b in [`docs/future-build-ideas/life-city-build-plan.md`](../future-build-ideas/life-city-build-plan.md). Adam approved building it on 7 October 2026.
**Builder:** Cursor, end to end. Claude Code reviews against this brief and the UI failure register.
**Depends on:** PR #730 (city snapshot) and PR #732 (layout engine) merged first.

## What this is for

One question: **can Adam feel the state of his life from the city in a glance, and find out what anything means with one hover?** This page exists only to run that test on fixed, made-up days. If the test fails, the project stops. So build exactly what the test needs, and nothing that only matters if it passes.

## User outcome

Adam opens `#/city?golden=<day>` on a desktop browser. He sees a calm 3D isometric street, built from Kenney models, for that day. A three-second catch-up replay shows what changed since his last visit, then the city settles. Hovering anything shows a plain-words card; clicking opens a panel. A legend is one click away.

## Inputs (already built, do not change their logic)

- `citySnapshot(input, now)` and `cityCatchUp(input, since, now)`: `apps/tasks/src/domain/city/snapshot.ts`
- `layoutCity(snapshot, previous)`: `apps/tasks/src/domain/city/layout.ts`. Whole tiles; x grows **west** from the river, y grows **north** from the harbour. Harbour water at y −4 to −1, river water at x −3 to −1, promenade at x = 0 and y = 0.
- Golden days: `sundayAfternoon`, `suspendedService`, `deletedYesterday` and `noCheckInMorning` in `apps/tasks/tests/fixtures/city/golden-days.ts`; `unseenOne` and `unseenTwo` in `apps/tasks/tests/fixtures/city/unseen-days.ts`. **Do not read the unseen days' answer key aloud or show it to Adam.**
- Models: Kenney 3D kits in `assets/kenney/` (inventory: `docs/future-build-ideas/life-city-assets.md`), plus anything Codex adds under `assets/city-extra/`.

## Must

1. **Route:** a `city` view in the Tasks hub at `#/city`, registered in `HubViewId` and `renderActiveView` (`src/shell/shell.ts`, `src/app/main.ts`). It is not in the rail or the nav yet; only the URL reaches it. `?golden=` picks the day (`sunday`, `suspended`, `deleted`, `no-checkin`, `unseen-1`, `unseen-2`). With no `?golden=`, show a small page that lists the four known days as links (not the unseen ones).
2. **Fixtures in the app:** move `golden-days.ts` and `unseen-days.ts` from `tests/fixtures/city/` to `src/domain/city/fixtures/`, update the test imports, and load them with `import()` from the city view only.
3. **Renderer:** Three.js (`three`, pinned) with a fixed orthographic camera at the classic isometric angle. Lazy-load it with `import()` from the city view, so the Tasks entry chunk does not change (W4).
4. **Models:** copy only the GLB files you use into `apps/tasks/public/city/models/`. Add `apps/tasks/public/city/assets.json` with one entry per file (file, source pack, licence, date, modifications), plus a unit test that fails if a file in that folder has no entry. Load model URLs through `import.meta.env.BASE_URL`, so they work at `/tasks/` on the umbrella (see W1).
5. **Ground:** harbour water to the south, river water to the east, and a sandy promenade along both shores, from the layout's coordinates. District blocks get a light ground tint. The rest is plain land.
6. **What to draw** (every object comes from the snapshot or the layout; nothing else moves or appears):
   - Routes: City Kit Roads pieces along each `layout.routes[].path`, with a stop marker at each `layout.stops[].at`.
   - Buses: one vehicle per `snapshot.vehicles` entry, moving slowly along its route's path. Use Codex's bus if it has landed; otherwise a stand-in from the Car Kit (`van`) and say so in the PR.
   - Metro lines: a raised or dashed line along `layout.lines[].path`, with a station at each `stations[].at`.
   - Trams: a tram model running the loop in `layout.trams[].loop`.
   - Services from `snapshot.services`: ambulance (`ambulance.glb`), mail van (`van.glb`), food truck (`delivery.glb` stand-in), school bus (stand-in until Codex delivers), and a crane (City Kit Roads construction fence as a stand-in), placed beside the record they belong to.
   - Exceptions as shapes: a barrier on each `blocked` stop, a widening ring on each `late` stop, and **one** halo for `snapshot.halo`. Suspended routes (`snapshot.suspensions` with `active`) show their buses parked at a depot with a "not running" sign.
   - Light: a stop is lit while `lit` is true. At night (`clock.isNight`), lit windows on scenery buildings.
   - Sky: a background gradient per `snapshot.sky.family`, plus the forecast icon name in a small corner badge. When `sky.known` is false, show a neutral sky and the words "No data". Never pick a weather for it.
   - Landmarks from `layout.landmarks`.
   - Scenery: buildings from City Kit Commercial, Suburban and Industrial fill empty district tiles, placed deterministically by tile. They never change with data and never move.
7. **Channel budget (P10):** hue means identity only (which district or line). Motion means momentum only (`vehicles`). Light means open or finished. Sky means capacity. Shape means exceptions (barrier, ring, halo). No status colours: nothing is red for blocked or amber for late.
8. **Catch-up:** when the page opens, play `cityCatchUp(input, lastVisitAt, now)` over about three seconds. Each change happens in place: a stop lights off when done, a crane appears on a new route, a new line draws in. Then settle. One click anywhere skips to Now. If `quiet` is true, show "Quiet since <day>" and play nothing. Respect `prefers-reduced-motion` by jumping straight to Now.
9. **Inspect:**
   - Hover card on every vehicle, stop, station, barrier, ring, halo, service, landmark and sky badge. It says what the thing is and why it is there, in plain words drawn from the snapshot, e.g. "Year 10 marking · 2 of 4 stops done · moving this week (2 sessions, 2 done)" or "Medical appointment on 2026-10-15".
   - Click panel with the same text and an **Open** link to the record's `href`. In the prototype these links point at fixture ids, so they open the normal Tasks page (which may say "not found"). That's fine; the link must still be a real `<a href>`.
   - A **Legend** button listing every vehicle, shape and light state and what each means.
   - An HTML overlay mirrors the halo, barriers and depot counts as focusable text, so the canvas is not the only way in.
10. **Camera:** Glance is still. Drag to pan, wheel to zoom, and Q / E to rotate in 90 degree steps. A repaint never resets the camera (V7).
11. **Desktop and tablet only.** Below 768 px wide, show "Metropolis needs a wider screen", with no canvas (R1).

## Must not

- Change `snapshot.ts`, `layout.ts` or their rules. If the picture needs data they don't give, stop and say what's missing in the PR.
- Read live Tasks data, call any API or add a Home tile. That's Slice 3.
- Add the city to the rail, nav or Home.
- Animate anything that is not a snapshot vehicle or a catch-up change: no ambient traffic, no idle ferries, no drifting clouds (C2).
- Use colour to mean status.
- Add sound, festivals, pets, info views or a Rewind scrubber.
- Commit any model that isn't CC0 without a credit line, or anything from Quaternius.
- Ship the unseen days' answer key anywhere visible in the UI.

## UI failure register checks

| ID | City-specific check |
|----|---------------------|
| **W4** | Compare the built Tasks entry chunk size before and after: within 2 KB. `three` appears only in a chunk loaded from the city view |
| **W1** | `grep -rn "'/city/\|\"/city/" apps/tasks/src/views/city` returns nothing. Every model URL is built from `import.meta.env.BASE_URL` |
| **C2** | Every moving object maps to a `snapshot.vehicles` id, a tram loop or a catch-up change. Log the list of moving ids in dev and compare it with the snapshot |
| **C7** | The replay clock uses `Math.max(0, now - start)`. Opening the page in a background tab and switching to it later doesn't throw |
| **C9** | The first painted frame is the final layout. No settling, no camera snap after load |
| **V7** | Pan, zoom and rotate, then trigger a re-render (switch `?golden=` and back): the camera holds |
| **V8** | There is one renderer for the city. Hover cards read from the same snapshot object the scene was drawn from |
| **D1** | Hover cards show what the data knows. A stop with no due date says "No due date", never today |
| **D3** | **Exception for this slice:** screenshots use golden-day fixtures by design. Label every screenshot with its golden day. D3 applies again from Slice 3 |
| **I2** | Every door is an `<a href>`. Tab reaches the legend button, the halo text and every overlay item, and Enter opens them |
| **I3** | No `?golden=` gives the day list, not a blank canvas. An unknown `?golden=` value says so |
| **R1** | Resize 1440 → 700 → 1440 without reloading: the canvas is replaced by the message and comes back |
| **P1, P5** | The PR includes a screenshot of each of the six days with the checklist below ticked against the screenshot, not from memory |
| **P3** | Every Must item is either done or listed in the PR as not done, with the reason |

## Verify

1. `cd apps/tasks && npx vitest run tests/unit/city-` passes, including the new `assets.json` test.
2. `npm run pre-pr-check` exits 0.
3. Screenshots at 1440 × 900 for all six days, each labelled. For Sunday 16:30, also capture mid-replay, plus one hover card and the legend.
4. Checklist per day (tick against the screenshot):
   - The barrier, ring and halo appear exactly where the snapshot says.
   - Buses: exactly `snapshot.vehicles.length` per route.
   - The sky matches `snapshot.sky`; "No check-in morning" says "No data".
   - Suspended service: the affected route's buses sit at the depot from 14 to 16 October.
   - Deleted yesterday: nothing named Draft outline, Old club or Sail the Whitsundays appears anywhere, including hover cards.
5. Note the frame rate on Adam's desktop in the PR.

## Files

- New: `apps/tasks/src/views/city/` (view, scene, inspect overlay, legend), `apps/tasks/src/domain/city/fixtures/` (moved fixtures), `apps/tasks/public/city/models/`, `apps/tasks/public/city/assets.json`, `apps/tasks/tests/unit/city-assets.test.ts`
- Changed: `apps/tasks/src/shell/shell.ts`, `apps/tasks/src/app/main.ts`, `apps/tasks/package.json` (`three`), and the city test imports

## After the PR

Claude Code reviews it. Then Adam sits the glance test, run by someone else, following `docs/future-build-ideas/life-city-build-plan.md` (Slice 2, "The glance test"). The result goes in the concept doc's History, pass or fail.
