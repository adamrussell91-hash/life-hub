# Brief 2b-fix · Make the glance prototype readable (Cursor)

**Follows:** [brief-2b-glance-prototype.md](brief-2b-glance-prototype.md) and PR #740.
**Status:** Built by Claude Code in PR #741 (8 October 2026), at Adam's request, using a live browser loop. See "As built" at the end.
**Why:** Claude Code reviewed #740 on 8 October 2026 by loading `#/city` in a real browser on every golden day. The plumbing is right: the snapshot, layout, legend, text overlay, catch-up data and model loading all work, with no console errors. But the picture does not communicate. **If Adam sat the glance test now, it would fail because of how the city is drawn, not because the idea is wrong.** Fix that before the test.

## What the review found

1. **The scenery buries the signals (C10).** Every empty tile in a district gets a full-size building, at the same scale as the vehicles. The route, stops, buses, barrier, ring and halo are lost in a carpet of near-identical blocks. Sunday 16:30 and No check-in morning look the same at a glance; only the corner labels differ.
2. **The camera doesn't fit the city (C9, repeat).** The east blocks and the harbour run off the right edge at 1440 on every day.
3. **Water and the night sky are the same navy (C11).** At night the city floats in a void; by day the water reads as a hole.
4. **The labels give the test away (V10).** The caption reads "Suspended service", "Deleted yesterday" and "No check-in morning", which are the answers Adam is asked to give. The sky badge names the weather in words. The hub's reminder strip and chat bubble sit over the stage.
5. **The catch-up is invisible.** On Sunday 16:30 the screenshots at 1.2 s and 5.7 s are near-identical. The one change, "Mark set A" finishing, can't be seen happening.
6. **Signals are too small to read** at the default zoom. The barrier on "Enter results" isn't visible at all, and the buses are a few pixels.

Claude Code has already fixed one of its own problems in this PR: the "Suspended service" golden day now defaults to 15 October, inside the wall, so the suspension shows. Before, it showed 13 October, before the wall started.

## Must

1. **A clear corridor.** No scenery within 2 tiles of any route path, stop, station, tram loop, landmark or service vehicle. Scenery fills **at most 35 %** of the remaining district tiles, chosen deterministically per tile (keep the current hash), never moving between visits.
2. **Quiet scenery.** Scenery uses the low models first (Suburban, the low-detail Commercial models). Skyscrapers appear only at a block's far corner, never between the camera and a route. Tint scenery lighter and lower-contrast (desaturate about 40 %) so it reads as background.
3. **Toy-scale signals.** Buses, trams, service vehicles, stops, barriers, rings and the halo are drawn **2.5×** their real-world scale, or larger. The halo is the most salient object on screen: the biggest and brightest shape, with a soft glow. It stays still (motion is momentum only).
4. **Camera fit.** On first paint, fit the bounds of the used blocks plus the water margins into the stage, below the HUD, with a 6 % margin. No later snap (C9).
5. **Figure and ground.** Land, water and sky each keep their own value band, day and night (C11). Suggested starting values: water a mid blue (#6FA3C8 by day), land a warm light grey, sky from the forecast family. At night all three darken, keeping their steps apart.
6. **A catch-up you can see.** During the replay, everything not in `catchUp.changes` dims to about 60 %. Each change plays in place in turn: a stop finishing fades its light off with a short expanding ring, a new route's road draws in, a new line draws along its path. Then everything returns to full brightness. About 3 seconds in total; one click skips. With reduced motion, skip straight to Now.
7. **Test mode (V10).** `#/city?golden=<day>&test=1`:
   - full screen over the hub shell, with no rail, reminder strip, chat bubble or page title;
   - the day caption reads "Day A" to "Day F" (assign letters from a fixed shuffle, not in list order);
   - the sky badge shows no words, just a small swatch;
   - no "Quiet since" text, unless the day really is quiet;
   - hover cards, click panels and the legend still work.

   Outside test mode, the page keeps its current labels.
8. **Show the barrier.** A blocked stop shows a barrier model across the road at that stop, at toy scale, and visible at default zoom.

## Must not

- Change `snapshot.ts`, `layout.ts`, the rules or the fixtures. Claude Code owns them; ask in the PR if data is missing.
- Add motion to scenery, water or sky.
- Use colour for status. The dimming during the catch-up is the one exception, and it ends when the replay ends.
- Remove the legend, the hover cards or the text overlay. They work; keep them.

## UI failure register checks

| ID | City-specific check |
|----|---------------------|
| **C10** | For each of the four known days, take a greyscale screenshot blurred by 8 px. Every barrier, ring, halo and vehicle is still a distinct blob. Put Sunday 16:30 and No check-in morning side by side: they are clearly different without reading any text |
| **C9** | Screenshots at 300 ms, 1.2 s and 3.5 s after opening each day show the whole used city inside the stage, below the HUD, with no camera jump between them |
| **C11** | Sample land, water and sky in the Sunday 16:30 (day) and Unseen 1 (night) screenshots: each pair differs by at least 15 in L\* |
| **V10** | With `&test=1`, `document.body.innerText` contains none of: the six golden day names, the sky state names, any route or task title, or "Clare". Hovering a bus then shows its card |
| **C2** | Every moving object still maps to a snapshot vehicle, a tram loop or a catch-up change. The new dimming and expanding rings exist only during the replay |
| **P1, P3** | The PR shows before and after screenshots for each day, and ticks each Must against the after screenshot |

## Verify

1. `cd apps/tasks && npx vitest run tests/unit/city-` passes.
2. `npm run pre-pr-check` exits 0.
3. Screenshots at 1440 × 900 of the four known days in test mode, plus Sunday 16:30 mid-replay. **Don't attach screenshots of `unseen-1` or `unseen-2` to the PR, and don't describe them.** Adam reads PRs. Check them yourself, then write only "unseen days checked".
4. The C10 greyscale blur pair (Sunday 16:30 and No check-in morning) attached to the PR.

## Files

`apps/tasks/src/views/city/plan.ts` (scenery corridor and fill), `scene.ts` (scale, colours, catch-up dimming, barrier), `view.ts` and `city.css` (test mode, camera fit, labels), and `camera.ts`.

## As built (PR #741)

- **Scenery:** a 2-tile corridor around every road, stop, station, landmark, tram loop, service, gate and the depot. 35 % fill, low buildings first, washed lighter. Unit tests cover the corridor and the cap.
- **Signals at 2.5×.** The halo is a large gold ring facing the camera. Finished stops drop to a low dark stub, so they never read as a barrier.
- **Camera:** fits the board and its water below the HUD, per turn and stage size, with no snap.
- **Board:** a diorama slab with a dark rim, plus mid-blue water by day and night. Measured lightness (L\*): day sky, land and water are 91, 68 and 41; night sky, land and water are 18, 67 and 44. Every pair of land, water and sky differs by at least 21 in the measured day and night views. On cloud-sky days, land and sky are within 3 of each other, and the rim separates them.
- **Catch-up:** the lights dim to about 55 % during the replay, and a gold pulse ring plays at each change in turn.
- **Test mode:** `&test=1` is full screen, labelled "Day A" to "Day F" from a fixed shuffle, with a swatch sky, a hidden keyboard mirror with neutral labels, and no hint. A Chromium check of `document.body.innerText` on all six days found none of the banned words.
- **The life wall:** a striped gate (no words) across the start of the closed route. The legend calls it "Striped gate".
- **Not done:** a frame rate on real hardware (the cloud browser uses software rendering), and the C10 greyscale-blur pair was judged by eye, not measured.
