# Unified Timeline implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase by phase. Steps use checkbox (`- [ ]`) syntax for tracking. One phase per PR.

**Goal:** Merge Gantt and Timeline in `apps/tasks` into one live, animated Timeline with Morph to Lines, Life walls, marking shadows, a school-week axis with a term-rhythm load strip, Hammond ghost bars and a standards ribbon.

**Spec:** `docs/superpowers/specs/2026-09-24-unified-timeline-design.md` (behaviour and data; read it in full before each phase).

**Visual and motion contract:** `docs/proposals/timeline-reference/` (`VISUAL-SPEC.md`, the `timeline.html` prototype, golden images, `fixture.json`, and `timeline-visual.spec.mjs`, whose 13 tests are named by the phase that must make them pass). It wins on any visual or motion detail.

**Finished modules (drop in, don't rewrite):** `src/views/timeline-motion.ts`, `src/views/timeline-morph.ts`, `src/domain/school-time.ts`, `src/domain/apst.ts`, with 43 unit tests.

**Prompts:** `docs/superpowers/plans/2026-09-24-unified-timeline-prompts.md`, one per phase.

**Tech stack:** Vite + TypeScript (vanilla DOM, SVG), Zod, Vitest, Netlify Functions + Blobs, `packages/design-kit`.

**Rules in force:** `.cursor/rules/first-pass-correctness.mdc`, `ponytail-project-guardrails.mdc`, `hub-design-kit.mdc`, `life-hub-umbrella.mdc`, `agent-context-integrity.mdc` (phase 6).

**Baseline:** `main` already has TypeScript errors and failing unit test files in `apps/tasks`. Phase 0 records them; no phase may add to them.

---

## Phase 0: Baseline and kit check

- [ ] Record tsc error count and failing tests in `docs/proposals/timeline-reference/BASELINE.md`
- [ ] Confirm the 43 reference unit tests pass
- [ ] Walk the prototype's interactions against the VISUAL-SPEC motion table
- [ ] Copy `timeline-visual.spec.mjs` to `apps/tasks/tests/browser/`

## Phase 1: Foundations (term dates, school-week scale)

Files: `src/domain/hub-prefs.ts`, `netlify/functions/hub-prefs.mjs`, `apps/tasks/scripts/mock-api.ts`, `src/domain/maps-layout.ts`, new Tools panel view. `src/domain/school-time.ts` and its tests already exist.

- [ ] `school_terms` and `marking_default_minutes_per_script` in `HubPrefs` + `parseHubPrefs` + function validation + mock API
- [ ] Seed NSW 2026 dates, leave 2027 empty
- [ ] `schoolTerms()` in `maps-layout.ts` reads prefs first
- [ ] Tools → **Term dates** panel (kit inputs, saves through `/api/hub-prefs`)
- [ ] Verify: edit a term in the panel, reload, Maps and the new scale agree

## Phase 2: The unified view (base)

Files: rewrite `src/views/timeline.ts` following `docs/proposals/timeline-reference/src/timeline-ref.ts`, new `src/domain/timeline-geometry.ts` (the `TL` block), new `src/styles/timeline.css` (the prototype's styles), `src/domain/gantt.ts`, `src/domain/chronology.ts`, new `src/domain/timeline-rows.ts`, `src/services/task-cache.ts`, `src/shell/shell.ts`, `src/app/main.ts`, `scripts/mock-api.ts` + `scripts/seed-timeline-visual.ts`, `packages/design-kit/CHARTS.md`, tests.

- [ ] Failing tests: hierarchy rows (Dream > Goal > Project > Task > Step + milestones), goal span = union of projects, "+N undated" counts, semantic zoom visibility rules per stop, redirect of `#/gantt?project=x`
- [ ] Row builder in `timeline-rows.ts` reusing `buildScopedGanttRows`, `projectSpan`, `collectChronologyItems`
- [ ] Render with existing Gantt drag / resize / link / critical path intact
- [ ] Five-stop zoom with animated `dayWidth`, wheel and pinch anchored on pointer
- [ ] Expand / collapse in place with row animation
- [ ] Live wiring: `onTasksChanged` / `onTasksDeleted`, add project and goal equivalents if missing, keyed FLIP for every change
- [ ] Keyboard map and `aria-live`
- [ ] School-week axis and holiday compression from phase 1
- [ ] Rail: one Timeline item; `#/gantt` redirects; delete dead views once tests pass
- [ ] `timeline-visual.spec.mjs -g "phase 2"` passes (5 tests); compare.html pairs match
- [ ] Verify at desktop and 390 px, empty and seeded stores, reduced motion

## Phase 3: Morph to Lines

Files: timeline view, `src/views/graph-lines.ts` (attributes only), `src/styles/timeline.css`. `src/views/timeline-morph.ts` already exists.

- [ ] `data-entity-id` on bars, diamonds, stations, terminus
- [ ] Bars · Lines pill + `L` shortcut; Lines mounted via `mountLinesView` with the same scope
- [ ] `startMorph()` wired both directions, interruptible mid-flight; `-g "phase (2|3)"` passes
- [ ] Reduced-motion cross-fade
- [ ] Verify: selection and scope survive; 30 rapid toggles leave no orphan overlay nodes

## Phase 4: Life walls

Files: `src/schemas/task.ts`, `project.ts`, `goal.ts` (and milestone), `src/domain/agent-mutations.ts`, store, mock API, functions, editors (`task-editor.ts`, `projects.ts`, `goals.ts`, `someday.ts`), timeline, Lines.

- [ ] Failing tests: schema parse with and without `life_wall`, `ends_on >= starts_on`, sanitize patch keeps it, wall collection across entities
- [ ] Toggle in each editor, pre-filled dates
- [ ] Render band on Timeline and "no service" band on Lines
- [ ] Drag-into-wall warning, "before <label>" chips
- [ ] Verify: flag the trip project as a wall; it appears on every scope and on Lines

## Phase 5: Marking shadows and load strip

Files: `src/schemas/task.ts`, `src/schemas/work-session.ts`, `task-properties-defaults.ts`, new `src/domain/marking-shadow.ts`, new `src/domain/term-rhythm.ts`, `agent-mutations.ts`, editors, timeline, tests.

- [ ] Failing tests: rate resolution order (explicit > learned > default), minutes-per-day spread across `dayCapacity` minus walls, over-60 % warning, `estimated_duration` sync, term-rhythm factor with less than and more than 2 terms of history
- [ ] `marking_shadow` kind, `marking` field, `scripts_marked` on sessions
- [ ] **Log marking** action
- [ ] Shadow rendering with progress and label
- [ ] Load strip (committed vs capacity x rhythm, walls at zero)
- [ ] Live drag ripple with dashed dependants, slip warnings and banner
- [ ] Verify: create a 28-script shadow, log 10, watch the shadow and strip update everywhere

## Phase 6: Hammond ghost bars

Files: Hammond protocol definitions (`src/domain/clare-protocols.ts` / `agent-protocol.ts` and the function behind `/api/clare`), new `src/domain/timeline-digest.ts`, timeline view, tests.

- [ ] Failing tests: digest contains walls, shadows, capacity, rhythm and the triggering drag; mutation parse to ghost geometry
- [ ] `timeline_rebalance` protocol with explicit instructions on what each input means
- [ ] Prove delivery at the final model request boundary for Hammond (not Clare)
- [ ] Ghost rendering, tray with Apply all / Review / Dismiss, apply via `apply_mutations`
- [ ] **Ask Hammond** and **Suggest a fix** entry points
- [ ] Verify with a real overload: Hammond's plan avoids the wall and the over-capacity week

## Phase 7: Standards ribbon

Files: `src/schemas/project.ts`, `src/schemas/task.ts`, `src/domain/agent-mutations.ts`, task editor, project page, timeline, tests. `src/domain/apst.ts` (codes, titles, coverage) and its tests already exist.

- [ ] Failing tests: schema and sanitiser drop unknown codes via `sanitizeApstFocus`, 4-week warning
- [ ] Project toggle + `submission_date`; task `apst_focus` picker by standard
- [ ] Ribbon under the project bar with hover detail
- [ ] Verify on the Accreditation Mentoring project

## Phase 8 (optional): Focus lens and forecast tails

- [ ] Piecewise lens scale with tests (round-trip, continuity at boundaries)
- [ ] Draggable lens, snaps to today
- [ ] P85 tails from estimate-to-actual ratios by domain, disabled below 20 samples

## Every phase ends with

- [ ] `npm test` and `npx tsc -p tsconfig.json --noEmit` in `apps/tasks`, and root `npm test`: nothing new against BASELINE.md
- [ ] That phase's tests in `timeline-visual.spec.mjs` pass, and earlier phases' still do
- [ ] Walk `#/timeline` in `npm run dev` at desktop and 390 px through the real user path for that phase
- [ ] Commit, push, open a PR titled `Unified Timeline: phase N <name>`
