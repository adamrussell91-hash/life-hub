# Unified Timeline: Cursor prompts

Paste one prompt per Cursor session, in order. Merge each PR before starting the next.

These must be on `main` first:

- `docs/superpowers/specs/2026-09-24-unified-timeline-design.md` (behaviour and data)
- `docs/superpowers/plans/2026-09-24-unified-timeline.md` (phases)
- `docs/proposals/timeline-reference/` (the look and the motion: prototype, golden images, fixture, Playwright contract, visual spec, prototype source)
- `apps/tasks/src/views/timeline-motion.ts`, `apps/tasks/src/views/timeline-morph.ts`, `apps/tasks/src/domain/school-time.ts`, `apps/tasks/src/domain/apst.ts` and their four test files in `apps/tasks/tests/unit/`

Every prompt repeats the same three guard rails on purpose. Cursor sessions start cold.

---

## Phase 0: Baseline and kit check (short)

```
Read docs/proposals/timeline-reference/VISUAL-SPEC.md in full. Do not write feature code in this session.

1. In apps/tasks run `npx tsc -p tsconfig.json --noEmit` and `npm test`. Write the error count, the failing test files and failing tests to docs/proposals/timeline-reference/BASELINE.md. These are pre-existing on main; later phases may not add to them.
2. Run the four reference unit test files (tests/unit/timeline-motion.test.ts, timeline-morph.test.ts, school-time.test.ts, apst.test.ts). All 43 tests must pass. If any fail, report why; do not edit the tests.
3. Open docs/proposals/timeline-reference/timeline.html in a browser from the repo (so ../../../packages/design-kit resolves). Try every interaction in the VISUAL-SPEC "Motion contract" table. Note anything that does not work as described.
4. Copy docs/proposals/timeline-reference/timeline-visual.spec.mjs to apps/tasks/tests/browser/timeline-visual.spec.mjs unchanged.

Open a PR titled "Unified Timeline: phase 0 baseline" with BASELINE.md and the copied spec only.
```

---

## Phase 1: Term dates

```
Read docs/superpowers/specs/2026-09-24-unified-timeline-design.md section 5 ("Term dates as a setting") and docs/proposals/timeline-reference/VISUAL-SPEC.md. Implement plan Phase 1 only.

src/domain/school-time.ts already exists with tests. Use it; do not write a second term or week helper.
- Add school_terms and marking_default_minutes_per_script to HubPrefs (src/domain/hub-prefs.ts), parseHubPrefs, netlify/functions/hub-prefs.mjs validation and apps/tasks/scripts/mock-api.ts. Seed the NSW 2026 dates exactly as the spec lists; leave 2027 empty.
- Make schoolTerms() in src/domain/maps-layout.ts read prefs first (convert with school-time types), keeping KNOWN_TERMS only as the empty-prefs fallback.
- Tools > Term dates panel: kit inputs and buttons only (read packages/design-kit/AGENTS.md first), saves through /api/hub-prefs.

Guard rails:
- No new tsc errors or failing tests against docs/proposals/timeline-reference/BASELINE.md; files you touch must be error-free.
- Tokens and kit components only. Dates shown as dd/mm/yy via format-display-date.js.
- Prove it through the real path: edit a term in the panel, reload, see Maps move its term boundary. Say in the PR what you did to check.

PR: "Unified Timeline: phase 1 term dates".
```

---

## Phase 2: The unified view

```
This phase is mostly UI and motion. Read, in this order, before writing code:
1. docs/proposals/timeline-reference/VISUAL-SPEC.md, all of it, especially "Rules", "Layout contract", "Motion contract" and "Failure patterns".
2. docs/proposals/timeline-reference/src/timeline-ref.ts. This is the reference implementation of the view. Your view must follow its structure: state -> layout() returning Map<entityId, Props> -> reconcile() -> apply(id, props), which is the only function that writes geometry.
3. apps/tasks/src/views/timeline-motion.ts and its tests. This is the only animation engine you may use.
4. docs/superpowers/specs/2026-09-24-unified-timeline-design.md section 1 (behaviour, scope, navigation, keyboard).
Then open docs/proposals/timeline-reference/timeline.html in a browser and keep it open while you work.

Implement plan Phase 2 only: one Timeline view at #/timeline replacing #/gantt and the old #/timeline, with the hierarchy (Dream > Goal > Project/excursion/program > Milestone/Task > Step), expand in place, five-stop semantic zoom, school-week axis with compressed holidays, today line, undated chips, dependency curves, critical path, drag/resize/link, live updates from anywhere, keyboard, and the phone layout. Walls, shadows, load strip, ghosts, ribbon and Lines come in later phases; leave their layers empty.

Specific instructions:
- Move the TL constants block from timeline-ref.ts into src/domain/timeline-geometry.ts and import it. Move the prototype <style> rules into src/styles/timeline.css with the same tl-* class names.
- Keep every existing Gantt behaviour (see the spec's Non-negotiables list). Reuse src/domain/gantt.ts and chronology.ts; put row building in src/domain/timeline-rows.ts with unit tests.
- Add a POST /api/timeline-visual-seed route to the mock API that seeds docs/proposals/timeline-reference/fixture.json, built like /api/graph-visual-seed and scripts/seed-graph-visual.ts.
- In dev builds only, expose window.__timeline = { engine, state, setZoom, setView, showHammond } exactly as the prototype does; the Playwright contract uses it.
- Add data-part attributes exactly as tests/browser/timeline-visual.spec.mjs expects. Do not edit that spec.
- Wait for document.fonts.ready before the first layout, and measure text through a cache.
- CHARTS.md: add a plan-timeline row pointing at docs/proposals/timeline-reference/ and a Log line.

Loop until it matches:
1. `npx playwright test tests/browser/timeline-visual.spec.mjs -g "phase 2"` must pass (5 tests).
2. Open docs/proposals/timeline-reference/compare.html and compare timeline-1280, timeline-390, week-1280 and critical-1280 side by side and with the difference overlay. Fix anything that differs beyond anti-aliasing.
3. Do each Phase 2 row of the VISUAL-SPEC motion table in the prototype and in your build, side by side. They must feel the same.

Guard rails:
- No new tsc errors or failing tests against BASELINE.md; touched files error-free.
- Tokens only; no new CSS variables; no hard-coded durations (import MOTION).
- If you catch yourself writing a CSS transition on an SVG attribute, innerHTML on update, a per-element timer, or a tween per bar during zoom, stop: VISUAL-SPEC "Failure patterns" says why.

Attach to the PR: the compare screenshots and screen recordings of zooming Month > Week > Year, expanding a project, dragging a task with dependants, and an edit on the Board animating on the Timeline in another tab. PR: "Unified Timeline: phase 2 unified view".
```

---

## Phase 3: Morph to Lines

```
Read docs/proposals/timeline-reference/VISUAL-SPEC.md (Bars/Lines row of the Motion contract, failure patterns 11 and 12), apps/tasks/src/views/timeline-morph.ts and its tests, and the "Bars <-> Lines" and "Lines" sections of docs/proposals/timeline-reference/src/timeline-ref.ts. Then read the spec section 2.

Implement plan Phase 3 only. Use startMorph(); do not write another morph. Lines is the existing view (mountLinesView in src/views/graph-lines.ts, built to docs/proposals/graph-reference); mount it inside the Timeline card with the same scope and selection. Only add data-entity-id, data-morph-shape and data-morph-color to its stations, terminus and a <g> wrapping each line's track paths. Bars and Lines must live in one positioned host (the card).

Loop until it matches:
1. `npx playwright test tests/browser/timeline-visual.spec.mjs -g "phase (2|3)"` must pass (8 tests).
2. Compare lines-1280 and lines-390 in compare.html.
3. Toggle Bars/Lines in the prototype and your build side by side, including pressing L mid-flight. Same feel, same choreography (chrome out by 35 %, in from 60 %, card height springs).

Guard rails: no new tsc errors or failing tests against BASELINE.md; touched files error-free; tokens only; no edits to the Playwright spec.

Attach recordings of Bars > Lines > Bars with one mid-flight reversal, at desktop and 390px. PR: "Unified Timeline: phase 3 morph to Lines".
```

---

## Phase 4: Life walls

```
Read the spec section 3, the "Life wall" row of the VISUAL-SPEC layout contract, and how the prototype builds and applies the 'wall' entity (timeline-ref.ts: buildShape, apply, layout).

Implement plan Phase 4 only. Add the optional life_wall field to Task, Project, Goal and Milestone (existing records must still parse), their create/update schemas, sanitizeTaskPatch / sanitizeProjectPatch, the store, the mock API and the Netlify handlers. Trace each entity's full write path before editing; they do not share one. Add the Life wall toggle to the task editor (covers Someday dreams), project page, goal page and milestone editing. Render walls as in the prototype, behind bars; on Lines as a "no service" band. Dragging into a wall warns but allows; items due inside or within 3 working days before a wall get a "before <label>" chip. Update the fixture seed so p-trip carries the wall.

Tests first for schema, sanitising and wall collection. Then `-g "phase (2|3|4)"` must pass.

Guard rails: no new tsc errors or failing tests against BASELINE.md; touched files error-free; tokens only; no edits to the Playwright spec.

PR: "Unified Timeline: phase 4 life walls".
```

---

## Phase 5: Marking shadows, load strip and drag ripple

```
Read the spec sections 4 and 5 (load strip, drag ripple), the "Marking shadow", "Load strip" and "Ripple" rows of the VISUAL-SPEC layout contract, the Drag and Release rows of its motion table, and the shadow, load and ripple code in timeline-ref.ts (including pool(), curveSnapshot() and followCurves()).

Implement plan Phase 5 only.
- Marking shadows: kind marking_shadow in task-properties-defaults.ts, the marking field on Task, scripts_marked on WorkSessionSchema, due_date and estimated_duration kept in sync, marking added to sanitizeTaskPatch. Rate resolution, daily spread across dayCapacity minus walls, and the 60 % warning in src/domain/marking-shadow.ts with unit tests. The Log marking action writes a WorkSession through the existing client API; trace focus-block.ts first. Say "marking shadow" everywhere in the UI, never "assessment".
- Load strip: committed minutes vs capacity x term-rhythm factor (src/domain/term-rhythm.ts, unit-tested), walls at zero, per school week, legend in the label column.
- Drag ripple: live cascadeForward preview, dashed outlines, slip label placed after the milestone's own label, curves following 1:1, the Drop anyway / Suggest a fix banner (Suggest a fix can stay a stub until phase 6). Escape cancels.

Then `-g "phase (2|3|4|5)"` must pass, and hammond-1280 is still expected to fail.

Guard rails: no new tsc errors or failing tests against BASELINE.md; touched files error-free; tokens only; no per-frame innerHTML (use pool()); no edits to the Playwright spec.

Attach a recording of dragging Book bus with the ripple and releasing it. PR: "Unified Timeline: phase 5 marking shadows and load".
```

---

## Phase 6: Hammond ghost bars

```
Read the spec section 6, .cursor/rules/agent-context-integrity.mdc, the "Ghost bar" and "Hammond tray" rows of the VISUAL-SPEC layout contract, and the ghost code in timeline-ref.ts (showHammond opens every row that holds a proposal).

Implement plan Phase 6 only. Use the existing agent path (POST /api/clare, action "dump", agent_slug "hammond", parseAgentMutations, apply_mutations). Add the timeline_rebalance protocol and src/domain/timeline-digest.ts. Hammond's instructions must say what each input means: walls never move and nothing goes into them, shadows are real work, stay under capacity where possible, flag any hard due_date he wants to move. Prove all four contracts from the rule for Hammond specifically: availability, delivery at the final model request, interpretation, behaviour on a real overloaded week. Make the local mock/stub judge return fixture.json "hammond_proposal" for timeline_rebalance so the visual test is deterministic.

Render ghosts, arrows and the tray exactly as the prototype. Apply all goes through apply_mutations and the settle motion. Wire Ask Hammond and Suggest a fix.

Then all 13 tests in timeline-visual.spec.mjs except "phase 7" must pass.

Guard rails: no new tsc errors or failing tests against BASELINE.md; touched files error-free; tokens only; no silent writes; no edits to the Playwright spec.

PR: "Unified Timeline: phase 6 Hammond ghost bars".
```

---

## Phase 7: Standards ribbon

```
Read the spec section 7, the "Standards ribbon" row of the VISUAL-SPEC layout contract and the ribbon code in timeline-ref.ts (fixed 26px segments, sticky with the bar's left edge; it must never read as a time scale).

Implement plan Phase 7 only: standards_ribbon and submission_date on Project, apst_focus on Task, the project-page toggle, the ribbon, and the 4-school-week warning. Tests first.

apps/tasks/src/domain/apst.ts already exists with tests: the 7 standards and 37 focus areas with their exact AITSL titles and the helpers. Use it for every code, title, group and coverage calculation; do not type any focus-area title yourself. Validate apst_focus with sanitizeApstFocus at every write boundary (schema, sanitizeTaskPatch, Netlify handler), not with a regex. The picker is the kit closed-field popover grouped by focusAreasByStandard(), full labels in the list, code-only chips on the task with the full label as tooltip and aria-label.

All 13 tests in timeline-visual.spec.mjs must pass, and every pair in compare.html must match.

Guard rails: no new tsc errors or failing tests against BASELINE.md; touched files error-free; tokens only; no edits to the Playwright spec.

PR: "Unified Timeline: phase 7 standards ribbon".
```

---

## Phase 8 (optional): Focus lens and forecast tails

```
Read the spec section 8. There is no reference for these two layers yet: before writing code, add them to docs/proposals/timeline-reference/src/timeline-ref.ts, rebuild timeline.html with `node docs/proposals/timeline-reference/src/build-ref.mjs`, add golden images and "phase 8" tests to the visual spec, and open that as its own PR for Adam to approve. Build the app version only after he approves the look.
```
