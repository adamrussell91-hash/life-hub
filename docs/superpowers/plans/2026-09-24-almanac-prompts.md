# Calendar D · The Almanac: Cursor prompts

**Start after Tideline phase 1 has merged.** The Almanac reuses its `/api/calendar-ghosts` endpoint, the `calendar_block` type and the ghost-writes wiring. It can run alongside Tideline phases 2–4, in separate Cursor sessions and separate PRs.

These must be on `main`:

- `docs/proposals/calendar-reference/almanac/` (reference, goldens, fixture, spec, VISUAL-SPEC)
- `packages/design-kit/js/lead-lines.js`, `packages/design-kit/js/openings.js`, `apps/life/js/app/almanac-rules.js`, `forecastSeries` in `capacity-model.js`, and `create_task` / `draft_message` in `ghost-writes.js`, with their tests
- The "D · The Almanac" section of `docs/superpowers/specs/2026-09-24-calendar-design.md`

Every prompt repeats the guard rails. Cursor sessions start cold.

---

## Almanac phase 0: Baseline (no feature code)

```
Read docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md in full. Do not write feature code in this session.

1. Run tests/unit/lead-lines.test.js, openings.test.js, capacity-model.test.js and ghost-writes.test.js. All must pass. If any fail, report why. Do not edit the tests.
2. Run `node docs/proposals/calendar-reference/almanac/src/build-ref.mjs`, then `node --test docs/proposals/calendar-reference/almanac/almanac-visual.spec.mjs`. All 7 must pass against the reference.
3. Open docs/proposals/calendar-reference/almanac/almanac.html from the repo. Walk the "Motion contract" normally and at Slow motion ×5. Click every bead and every opening button. Note anything that doesn't behave as described.
4. Copy almanac-visual.spec.mjs to tests/browser/almanac-visual.spec.mjs unchanged.

PR: "Almanac: phase 0 baseline" (the copied spec and your notes only).
```

---

## Almanac phase 1: Data and server (no UI)

```
Read docs/superpowers/specs/2026-09-24-calendar-design.md, "D · The Almanac", and docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md, "Wiring". Implement phase 1 only. No UI.

lead-lines.js, openings.js, almanac-rules.js, forecastSeries and ghost-writes.js already exist with tests. Use them. Do not re-implement any of that logic.

1. Data repo files: almanac-anchors.yml (seed it with the six anchors in docs/proposals/calendar-reference/almanac/fixture.json ANCHORS, from About Me and Constraints) and almanac-done.json. Loaders validate shape and ignore bad rows with a logged warning.
2. netlify/functions/almanac.mjs:
   - GET ?from=&to= returns { lines, summary, series, openings, world } computed with the modules. Anchors come from the file, plus term anchors from hub-prefs school_terms and calendar_block/Professional events with anchor: true. The series is forecastSeries over capacityForDates of the latest Life logs, with the term pattern (term time −12, first week back −6, until two terms of history exist). Openings are findOpenings over days built as the spec says, with free hours from Life calendar_blocks, Teaching lessons and Professional events. Every action gets its id (alm-<stepId>, alm-hold-<wantId>, alm-draft-<wantId>).
   - POST /api/almanac/done { stepId } appends to almanac-done.json.
3. /api/calendar-ghosts: resolve alm-… ids by recomputing the Almanac and building the ghost (create_task | protect_block | draft_message), then the same acceptPlan execution as other ghosts. Drafts write nothing and return the text.
4. Mock API: the same GET and POST routes, plus POST /api/almanac-visual-seed (loads almanac/fixture.json and freezes today at 2026-09-24).
5. Tests: GET on the seed returns summary { unbooked: 2, lastSafeSoon: 7, openings: 4 } and the same openings as the reference. Accepting alm-korea:pet-sitter creates exactly one task due 2026-10-28. Accepting alm-draft-bob writes nothing. Done removes the step from "unbooked".

Guard rails:
- No new failing tests or tsc errors against docs/proposals/calendar-reference/BASELINE.md.
- The client never builds writes. Only { id, decision } or { stepId } leaves the browser.
- Prove it through the real path: curl GET /api/almanac on the mock and paste the summary into the PR.

PR: "Almanac: phase 1 data and server".
```

---

## Almanac phase 2: Layout

```
Read, in order: docs/proposals/calendar-reference/almanac/VISUAL-SPEC.md (all of it), then almanac-ref.ts sections 1–5. Keep almanac.html open while you work.

Implement phase 2:
- Move ALM verbatim to packages/design-kit/js/almanac-geometry.js. Move the .alm styles verbatim to packages/design-kit/calendar-almanac.css, and render the alm-hatch / alm-area defs once in the Life shell.
- In the Life calendar, the Almanac zoom pill (the fifth stop) renders the Almanac from GET /api/almanac: summary, chart (world, anchors, tide, lead lines, today), openings. On phone (< 720px), the list layout. Structure as in almanac-ref.ts: mount once, apply() is the only function writing geometry.
- data-part attributes exactly as tests/browser/almanac-visual.spec.mjs expects. Expose window.__almanac in dev builds.
- The chart is LAID OUT at the card's real width, never scaled: port setWidth, the SVG width attribute and the ResizeObserver re-layout from almanac-ref.ts, plus .alm { min-width:0; contain:inline-size }. Port textW/fitText and the label budgets (VISUAL-SPEC rule 5) verbatim.

Guard rails:
- Every number is computed (VISUAL-SPEC rule 2). Bead looks per status exactly as rule 5 says. "example" stays on non-live world data.
- Tokens and the named --alm-* surfaces only. Dates dd/mm/yy.
- No new failing tests or tsc errors against BASELINE.md.
- First copy docs/proposals/calendar-reference/almanac/almanac-visual.spec.mjs over tests/browser/almanac-visual.spec.mjs unchanged (it gained a real-width test). Loop: `npm run build && ALMANAC_APP=1 node --test --test-name-pattern="almanac phase 2" tests/browser/almanac-visual.spec.mjs`. Check almanac-1280 and almanac-390 in compare.html (the goldens include the rail, so they should match your build closely). Attach both.

PR: "Almanac: phase 2 layout".
```

---

## Almanac phase 3: Motion

```
Read VISUAL-SPEC "Rules" 1 and "Motion contract", and entrance() in almanac-ref.ts. Watch the reference entrance at ×5 before writing code.

Implement the entrance (tide reveal, lead lines drawing back from their anchors, beads popping in), the popover motion and the held tint, all through the one motion engine (packages/design-kit/js/hub-motion-engine.js after Tideline phase 2, else apps/tasks timeline-motion.ts).

Guard rails:
- No CSS transitions on SVG attributes. No setTimeout chains for motion.
- Reduced motion lands everything at once.
- Loop: `ALMANAC_APP=1 node --test --test-name-pattern="almanac phase (2|3)" tests/browser/almanac-visual.spec.mjs`, then the motion contract side by side at ×5. Attach a recording of the entrance.

PR: "Almanac: phase 3 motion".
```

---

## Almanac phase 4: Wiring

```
Read VISUAL-SPEC "Wiring" and almanac-ref.ts functions openPop, addTask, markDone and openingAction.

Implement:
- The bead popover: last safe day, days left, the rule's why, and "ADD AS TASK WRITES" with the exact receipt. For the preview only, run acceptPlan on the ghost from GET /api/almanac.
- Add as task: disable, POST /api/calendar-ghosts { id, decision: 'accept' }, then the tasked halo and the server's receipt in the toast. Already done: POST /api/almanac/done, then the status pulse and the counted-down summary.
- Openings: Hold / Wall / Hold both days through the same endpoint, then the held state. Draft a message shows the server's draft text with Copy. There is never a send button. "Plan it with Hammond" only shows its toast.
- After any write, refetch GET /api/almanac so everything reflects the server.

Guard rails:
- Only { id, decision } or { stepId } leaves the browser. The spec checks it.
- Prove it through the real path: accept the pet-sitter task on the mock, then show it in Tasks with due 28/10/26. Hold the good night, then show it on the Tideline week as a Corey block.
- Loop: `ALMANAC_APP=1 node --test tests/browser/almanac-visual.spec.mjs` (all 7). Check almanac-popover-1280 and almanac-held-1280.

PR: "Almanac: phase 4 wiring".
```

---

## Almanac phase 5 (outline): the world

Cached Netlify Functions, one per feed:
- `world-weather` (BOM, 7 days)
- `world-nsw` (public holidays and daylight saving, a yearly table)
- `world-nesa` (HSC timetable, yearly)
- `world-listings` (later: shows and talks near East Ryde, for the good-night opening)

Each entry drops "example" once live. Prompts will be written after phase 4 merges.

---

## Review loop

After each PR, ask Claude Code: "Review Almanac PR #N against the reference." It will run the tests, compare the goldens, step through the motion at ×5, and give you a numbered fix list or "merge".
