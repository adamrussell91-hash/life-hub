# Calendar A · Tideline: Cursor prompts

Paste one prompt per Cursor session, in order. Merge each PR before starting the next. After each PR, Claude Code reviews it against the goldens before merge (see "Review loop" at the end).

These must be on `main` first (this branch):

- `docs/superpowers/specs/2026-09-24-calendar-design.md` (behaviour, data, server contract)
- `docs/proposals/calendar-reference/` (the look, motion and wiring: prototype, goldens, fixture, spec, VISUAL-SPEC)
- `packages/design-kit/js/calendar-bands.js` (+ `.d.ts`), `apps/life/js/app/capacity-model.js`, `apps/life/js/app/ghost-writes.js`, and their tests in `tests/unit/`

Every prompt repeats the same guard rails on purpose. Cursor sessions start cold.

---

## Phase 0: Baseline (short, no feature code)

```
Read docs/proposals/calendar-reference/VISUAL-SPEC.md in full. Do not write feature code in this session.

1. Run `npm test` at the repo root and `npx tsc -p tsconfig.json --noEmit` in apps/tasks. Write the counts, failing test files and failing tests to docs/proposals/calendar-reference/BASELINE.md. These already fail on main; later phases may not add to them.
2. Run tests/unit/calendar-bands.test.js, capacity-model.test.js and ghost-writes.test.js. All 25 must pass. If any fail, report why. Do not edit the tests.
3. Run `node docs/proposals/calendar-reference/src/build-ref.mjs`, then `node --test docs/proposals/calendar-reference/tideline-visual.spec.mjs`. All 9 must pass against the reference.
4. Open docs/proposals/calendar-reference/tideline.html in a browser from the repo. Try every row of the VISUAL-SPEC "Motion contract", once normally and once with "Slow motion ×5". Note anything that doesn't behave as described.
5. Copy docs/proposals/calendar-reference/tideline-visual.spec.mjs to tests/browser/tideline-visual.spec.mjs unchanged. Don't add it to test:browser yet.

Open a PR titled "Calendar: phase 0 baseline" with BASELINE.md and the copied spec only.
```

---

## Phase 1: Server and data (no UI)

```
Read docs/superpowers/specs/2026-09-24-calendar-design.md, sections "Ghosts and wiring" and "New record type: calendar_block". Implement phase 1 only. No UI changes.

apps/life/js/app/ghost-writes.js already exists with tests. It decides what every Accept writes. Use it; do not write a second mapping.

1. calendar_block record type: add it to VALIDATORS in apps/life/js/core/validate.js (kinds corey|rest|protected|wall|focus, status tentative|confirmed, time and end_time HH:MM with end > start, protected boolean). Add it to the canonical record paths, and to SOURCE_BY_TYPE, eventDetailTitle and eventBrief in apps/life/js/app/calendar-model.js. Add the optional diary field `symptoms: string[]`.
2. netlify/functions/calendar-ghosts.mjs:
   - GET ?from=&to= returns pending ghosts from pending-calendar-ghosts.json (data repo).
   - POST { id, decision, reason? }. Load the stored ghost, then run validateGhost and acceptPlan(ghost, { today }) or dismissPlan. Execute exactly as the spec's "Execution order" says: one GitHub commit (Central Node patches via applyCentralNodePatch on one read, life records validated, queue entry marked), then tasks steps via the tasks store code, 207 partial with retry: 'tasks' if step 2 fails, and never re-apply step 1.
   - Dismiss writes no Life, Central Node or Tasks data. It marks the queue entry and appends to calendar-ghost-decisions.jsonl.
   - Same auth, origin guard and private cache headers as chat-confirm.mjs. Add a comment explaining why auto-class patches are allowed here (Accept is the confirmation).
3. Mock API (scripts/serve.mjs mock path): the same GET and POST against fixtures, plus POST /api/calendar-visual-seed, which loads docs/proposals/calendar-reference/fixture.json (LOGS, ITEMS, DUE, GHOSTS, WALLS, FREE) and freezes "now" at 2026-09-24T18:05+10:00. Build it like the other visual seeds.
4. Tests in tests/unit/: accept for each of the four fixture ghosts writes exactly the acceptPlan steps (assert the final central-node.md text and the record files); dismiss writes nothing; replaying an accepted id is a no-op 409; partial failure returns 207 and a retry only does tasks.

Guard rails:
- No new failing tests or tsc errors against docs/proposals/calendar-reference/BASELINE.md. Files you touch must be error-free.
- Never let the client send writes. The only POST body is { id, decision, reason? }.
- Prove it through the real path. Run the mock server, POST accept for g-skip, then read central-node.md from the mock data and paste the new Cross-Agent line into the PR.

PR: "Calendar: phase 1 ghosts endpoint and calendar_block".
```

---

## Phase 2: Tideline layout (static bands)

```
This phase is mostly UI. Read, in this order, before writing code:
1. docs/proposals/calendar-reference/VISUAL-SPEC.md, all of it: "Rules", "Layout contract", "Failure patterns".
2. docs/proposals/calendar-reference/src/tideline-ref.ts. This is the reference implementation. Your view follows its structure: mount creates DOM once; layout(heights) is pure and returns Map<entityId, Props>; apply(id, props) is the only function that writes geometry.
3. docs/superpowers/specs/2026-09-24-calendar-design.md, "A · Tideline".
Then open docs/proposals/calendar-reference/tideline.html in a browser and keep it open while you work.

Implement phase 2:
- Move apps/tasks/src/views/timeline-motion.ts to packages/design-kit/js/hub-motion-engine.js (+ .d.ts), unchanged in behaviour, with its tests moved to tests/unit/hub-motion-engine.test.js. timeline-motion.ts becomes a re-export. The apps/tasks tests must still pass.
- Move the CAL constants block verbatim to packages/design-kit/js/calendar-tideline-geometry.js.
- Move the reference <style> rules (from `.cal{` down) verbatim to packages/design-kit/calendar-tideline.css, with the same class names. Load it in the Life shell.
- In apps/life/js/app/render-calendar.js, Week view renders the Tideline from real data: bands from bandsFromProfile(planning profile day_profile), capacity from capacityForDates, logs only in vitals/ambient, medical duplicates merged, calendar_block chips, walls, free evenings, now line, due row, source pills that count grid items. Bands stay at rest in this phase (no expand yet). Phone (< 720px) shows one day and the week strip.
- data-part attributes exactly as tests/browser/tideline-visual.spec.mjs expects. Expose window.__tideline in dev builds as VISUAL-SPEC "Test hooks" describes.

Guard rails:
- One motion engine (hub-motion-engine.js). No CSS transitions on top/height/transform. No hex colours: tokens and the named --cal-* surfaces only. Dates dd/mm/yy.
- Capacity is computed by capacity-model.js, never typed. Logs never take a slot.
- No new failing tests or tsc errors against BASELINE.md.
- Loop until it matches: `npm run build && TIDELINE_APP=1 node --test --test-name-pattern="phase 2" tests/browser/tideline-visual.spec.mjs`, then open docs/proposals/calendar-reference/compare.html and check tideline-1280 and tideline-390 side by side and as a difference overlay. Attach both compare screenshots to the PR.

PR: "Calendar: phase 2 Tideline layout".
```

---

## Phase 3: Band motion

```
Read docs/proposals/calendar-reference/VISUAL-SPEC.md "Rules" 1–5 and "Motion contract", and tideline-ref.ts sections 4–6. Open tideline.html and use "Slow motion ×5" on every band interaction before you write code.

Implement phase 3:
- Band heights are ONE engine entity, __bands (props h0..h3). setBand(i) calls engine.to('__bands', targets, { duration: CAL.bandMs, easing: EASE }). Its apply re-runs layout(heights) and engine.place()s every entity. Copy setBand, layout and apply from the reference.
- Density fades by height through CSS variables (--t, --m, --a, --lines, --py, data-density) on the same nodes. Never swap markup mid-tween.
- Band labels, the Focus pills (kit .hub-pills with the sliding thumb via applyHubPillsThumb), a click on a band wash, keys 1–4 / 0 / Escape, the aria-live announcement, and the session-remembered band.
- The column entrance on first mount (MOTION.enter, 30ms stagger, 8px rise).

Guard rails:
- The stack's total height never changes. The spec samples every frame and checks it.
- Retargeting mid-flight (click School, then Yours at 200ms) must continue smoothly. The engine guarantees this if you use one entity.
- prefers-reduced-motion: geometry snaps. The engine handles it; don't special-case it.
- No new failing tests or tsc errors against BASELINE.md.
- Loop: `TIDELINE_APP=1 node --test --test-name-pattern="phase (2|3)" tests/browser/tideline-visual.spec.mjs`, compare school-1280 and yours-1280, then do the motion contract rows on the reference and on your build side by side, at normal speed and ×5. Attach screen recording (a) from VISUAL-SPEC "Loop until it matches".

PR: "Calendar: phase 3 band motion".
```

---

## Phase 4: Ghosts, proposals and wiring

```
Read docs/proposals/calendar-reference/VISUAL-SPEC.md ("Ghost chip", "Proposal on an item", "Chip popover", "Toast", "Motion contract", rules 11–12) and tideline-ref.ts functions mountChip, openPop, accept, dismiss and applyAll. Read the "Ghosts and wiring" section of the design spec.

Implement phase 4:
- Draw pending ghosts from GET /api/calendar-ghosts. A ghost with overItem decorates that item (dashed outline, agent avatar, "Sara suggests: …") instead of adding a chip. move_task ghosts sit on the due chip with a Move button.
- Every chip opens the popover (click, Enter, Space). For a proposal it shows "ACCEPT WRITES" and the receipt text. For the preview, call acceptPlan() from ghost-writes.js on the ghost from GET. It is display only; nothing is sent.
- Accept and Move: disable the buttons, show "Saving…", then POST { id, decision: 'accept' }. On 200, animate as the motion contract says and show the server's receipt in the toast. On 207, show the receipt with "Tasks will retry" and keep a retry button. On error, restore the buttons and show the error. Never optimistic.
- Dismiss: POST { id, decision: 'dismiss' }, then scale and fade out. Apply all: accept each pending ghost in turn, 90ms stagger, one summary toast.
- After a successful accept, refresh the affected sources (Life records, Tasks through onTasksChanged) so the week reflects the real data, not local guesses.

Guard rails:
- The client never builds writes. Only { id, decision, reason? } leaves the browser. The spec checks the request body.
- One motion engine for solid/opacity/scale/popover/toast. Timers only for how long the toast stays.
- No new failing tests or tsc errors against BASELINE.md.
- Prove it through the real path. In the mock app, accept Sara's proposal, then open Central Node in the app and screenshot the new Cross-Agent line. Accept Hammond's Move and show the task's new due date in Tasks. Attach screen recording (b).
- Loop: `TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs` (all 9), compare popover-1280 and accepted-1280.

PR: "Calendar: phase 4 ghosts and wiring".
```

---

## Phase 5 (outline; prompts written after phase 4 merges)

- `propose_calendar_ghost` tool for Hammond, Sara and Clare, validated with `validateGhost` and appended to the queue. Sara proposes only on `soften: true` days. Hammond proposes protect_block for free evenings and good nights. Agents read `calendar-ghost-decisions.jsonl`.
- Rewrite `packages/design-kit/CALENDAR.md` as the new lock (four zoom stops, the Tideline object, bands per hub). Teaching fills the School band with periods, Professional adds meetings, Tasks adds work windows to After bell.
- Reference folders for B, C and D, built like this one, before their prompts.

---

## Review loop (after every PR, before merge)

Ask Claude Code: "Review calendar PR #N against the reference." It will:

1. Check out the branch and build it.
2. Run the unit tests and `TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`.
3. Open compare.html and diff each golden pair.
4. Open the reference and the build side by side and step through the motion contract at ×5.
5. Write a numbered fix list you can paste straight back into Cursor, or say "merge".
