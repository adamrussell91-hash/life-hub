# Calendar C · Day Dial: one Cursor prompt

Paste this into one Cursor session after `docs/proposals/calendar-reference/day-dial/` is on `main`. It is one PR: baseline, layout, motion and wiring. The server side (ghosts, capacity, Life records) already exists; this is client work plus one small server efficiency fix.

```text
Calendar C · Day Dial: build the Day zoom stop from its reference. One PR.

Read, in order, before writing code:
1. docs/proposals/calendar-reference/day-dial/VISUAL-SPEC.md, all of it.
2. docs/proposals/calendar-reference/day-dial/src/dial-ref.ts. This is the reference implementation. Follow its structure: mount once; the __sweep entity's apply re-draws arcs through visibleSpan; apply() is the only function that writes geometry.
3. packages/design-kit/js/dial-geometry.js and apps/life/js/app/day-brief.js (finished, tested: use them, don't rewrite them).
Open docs/proposals/calendar-reference/day-dial/day-dial.html from the repo and keep it open while you work.

STEP 0: Baseline
- Run the unit suite and apps/tasks tsc. Record the counts in the PR description (main is at 40 tsc errors). Run tests/unit/dial-geometry.test.js and day-brief.test.js: all must pass.
- Build the reference and run `node --test docs/proposals/calendar-reference/day-dial/dial-visual.spec.mjs`: 9 pass and 1 is skipped (app-only).
- Copy dial-visual.spec.mjs to tests/browser/dial-visual.spec.mjs unchanged.

STEP 1: Layout (dial phase 2)
- Move the DD constants block verbatim to packages/design-kit/js/day-dial-geometry.js. Move the `.dd{` styles down verbatim to packages/design-kit/calendar-day-dial.css. Render the dd-hatch pattern def once in the Life shell.
- The Day zoom pill (route #/calendar/day) renders the Day Dial from real data: capacity from capacityForDates over Life logs; chips from the same model the Tideline uses (tideline-model.js), including skipped workouts and calendar_blocks; ghosts from GET /api/calendar-ghosts; Tonight and Tomorrow from day-brief.js; bands from bandsFromProfile(day_profile). "Linear" switches to the Tideline one-day view (the existing phone/one-day layout), not a new design.
- Laid out at the cell's real width, never scaled (VISUAL-SPEC rule 2). Callouts fitted with the measured-text cache (rule 3). Centre text spaced by real boxes (rule 4).
- data-part attributes exactly as the spec expects. Expose window.__dayDial in dev builds.

STEP 2: Motion (dial phase 3)
- The entrance (sweep, hand, gauge, week stagger), choosing a day (faster sweep, focus stays on the chosen day, ← → keys), and resize re-layout without replaying the entrance. All through packages/design-kit/js/hub-motion-engine.js.

STEP 3: Wiring (dial phase 4)
- Arc popover with the acceptPlan() receipt preview (display only). Tonight/Tomorrow buttons (Skip/Keep, Accept, Move/Dismiss): disable, "Saving…", POST /api/calendar-ghosts { id, decision }, then re-lay out from the server's data and show the server's receipt. Never optimistic. An accepted bedtime stays as a solid arc and a plain row.

STEP 4: A small server fix (from the 5b review)
- In netlify/functions/calendar-ghosts.mjs GET, decide whether a refresh is due (shouldRefreshPropose on last_run and today's newest record) BEFORE loading school terms, lessons and professional events. Load them only when a refresh will actually run. Add a unit test that a fresh GET does not call the loaders.

Guard rails
- Only { id, decision } leaves the browser. The Tideline (11) and Almanac (8) browser contracts must still pass.
- Tokens and the named --dd-* surfaces only. Dates dd/mm/yy. No new failing tests; tsc no higher than main's count.
- Prove it through the real path, on the mock: open #/calendar/day on the seeded Thursday, Skip the workout, Accept lights out, reload, and screenshot the struck workout and the solid wind-down. Attach it, plus a recording of the entrance.
- Loop: `npm run build && DIAL_APP=1 node --test tests/browser/dial-visual.spec.mjs` (all 10), then check dial-1280, dial-960 and dial-390 in docs/proposals/calendar-reference/day-dial/compare.html.

PR: "Calendar: Day Dial (the Day stop)".
```
