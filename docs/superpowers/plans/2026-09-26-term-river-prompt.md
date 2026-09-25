# Calendar B · Term River: one Cursor prompt

Paste this into one Cursor session after `docs/proposals/calendar-reference/term-river/` is on `main`. It is one PR: promote the term-aware scale to the kit, then layout, motion and wiring for the Term and Year stops. The server side (ghosts, capacity, Life records) already exists.

```text
Calendar B · Term River: build the Term and Year zoom stops from their reference. One PR.

Read, in order, before writing code:
1. docs/proposals/calendar-reference/term-river/VISUAL-SPEC.md, all of it.
2. docs/proposals/calendar-reference/term-river/src/river-ref.ts. This is the reference implementation. Follow its structure: mount once; every positioned thing registers a placer; the __zoom entity's apply calls every placer with the blended scale X = A + (B − A) × t; apply() is the only function that writes geometry.
3. apps/life/js/app/term-river.js (finished, tested: use it, don't rewrite it) and apps/tasks/src/domain/school-time.ts.
Open docs/proposals/calendar-reference/term-river/term-river.html from the repo and keep it open while you work. Press + and - to zoom; try Slow motion ×5.

STEP 0: Baseline
- Run the unit suite and apps/tasks tsc. Record the counts in the PR description. tests/unit/term-river.test.js must pass (5).
- Build the reference and run `node --test docs/proposals/calendar-reference/term-river/river-visual.spec.mjs`: 10 pass and 1 is skipped (app-only).
- Copy river-visual.spec.mjs to tests/browser/river-visual.spec.mjs unchanged.

STEP 1: Promote the term-aware scale to the kit
- Port apps/tasks/src/domain/school-time.ts to packages/design-kit/js/school-time.js (plain JS with JSDoc types, same exports, same behaviour). Life is plain JS and cannot import apps/tasks TypeScript.
- apps/tasks/src/domain/school-time.ts becomes a thin re-export of the kit module (keep its exported types). apps/tasks/tests/unit/school-time.test.ts must pass unchanged; add tests/unit/school-time.test.js running the same cases against the kit module.
- apps/life/js/app/tideline-model.js drops its private termAt/weekLabel copy and imports weekLabel from the kit. term-river.js riverWeekLabel uses the kit weekLabel (falling back to dd/mm when it returns null). Every existing Tideline test stays green.

STEP 2: Layout (river phase 2)
- Move the TR constants block verbatim to packages/design-kit/js/term-river-geometry.js. Move the `.tr` styles verbatim to packages/design-kit/calendar-term-river.css. Render the tr-hatch pattern def once in the Life shell.
- Routes #/calendar/term and #/calendar/year (add both to calendarZoomFromHash in app-controller.js). Wire the Term and Year pills on the Day Dial, Tideline and Almanac to them (render-day-dial.js has a "not built yet" comment to replace).
- Real data, one lane per item via byLane: Tasks projects (bars), Professional events, Life calendar_blocks (Corey, protected), Almanac anchors (conferral diamond, the Hammond dream, UOW hum), ghosts from GET /api/calendar-ghosts, the wall from the Korea anchor/trip. Terms from hub prefs. Body line from forecastSeries over Life logs plus the term pattern (as the Almanac does). Load from weeklyLoad over commitments, excluding classes, protected time and ghosts.
- Extend scripts/calendar-visual-seed.mjs so POST /api/calendar-visual-seed also materialises docs/proposals/calendar-reference/term-river/fixture.json (generated from src/fixture.ts by build-ref.mjs): its ITEMS, WALLS, LOGGED, PATTERN and COMMITMENTS as records, and its three ghosts (g-bob, g-newcastle, g-day-trip) in the pending queue. The Tideline fixture must still seed exactly as before.
- Laid out at the card's real width, never scaled; viewBox = width (rule 3). Label budgets, badge height and the badge de-dupe (rule 4). Weeks with the short fallback, measured on a school week (rule 5). Phone lists under 720px (rule 8).
- data-part attributes exactly as the spec expects. Expose window.__termRiver in dev builds.

STEP 3: Motion (river phase 3)
- The reveal (__reveal clip), Term ↔ Year as ONE tween of __zoom.t (never a re-mount), resize re-lays out without replaying, reduced motion lands at once. All through packages/design-kit/js/hub-motion-engine.js. + and - keys zoom.

STEP 4: Wiring (river phase 4)
- Point popover with the acceptPlan() receipt preview (display only). Accept / Dismiss: disable, "Saving…", POST /api/calendar-ghosts { id, decision }, then re-lay out from the server's data (no reveal) and show the server's receipt. Never optimistic. Accepted becomes a held point with no badge; dismissed leaves the river.

Guard rails
- Only { id, decision } leaves the browser. The Tideline, Almanac and Day Dial browser contracts must still pass.
- Tokens and the named --tr-* surfaces only. Dates dd/mm/yy. No new failing tests; tsc no higher than main's count.
- Prove it through the real path, on the mock: open #/calendar/term on the seeded Thursday, zoom to Year and back, Accept Lunch with Bob, reload, and screenshot the held point. Attach it, plus a recording of Term → Year → Term.
- Loop: `npm run build && RIVER_APP=1 node --test tests/browser/river-visual.spec.mjs` (all 11), then check every golden in docs/proposals/calendar-reference/term-river/compare.html.

PR: "Calendar: Term River (the Term and Year stops)".
```
