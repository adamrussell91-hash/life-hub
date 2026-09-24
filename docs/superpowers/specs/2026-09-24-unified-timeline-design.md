# Unified Timeline: Gantt and Timeline become one view

**Date:** 2026-09-24
**Repo:** `life-hub` (umbrella) · app `apps/tasks`
**Route:** `#/timeline` (replaces `#/gantt` and the old `#/timeline`)
**Status:** Implement in phases (see `docs/superpowers/plans/2026-09-24-unified-timeline.md`)

## Problem

Tasks Hub has two views that answer the same question at different zoom levels.

- **Gantt** (`src/views/gantt.ts`, `src/domain/gantt.ts`) shows tasks and milestones for one project or all projects, with drag, resize, dependency links (FS/SS/FF) and critical path. It is empty whenever the chosen scope has no dated tasks.
- **Timeline** (`src/views/timeline.ts`, `src/domain/chronology.ts`) shows projects, excursions and programs as long bars, and opens a bar for the full page.

Adam has to pick a view before he knows which altitude he needs. The two views also disagree on axis, zoom and filters.

## Outcome

One view, **Timeline**, where every item in the hierarchy sits on a single time axis and can be opened in place:

```
Dream (Someday, dreams_jar / bucket_list)
  └── Goal
        └── Project (incl. excursion, academic_program)  ·  Program
              ├── Milestone
              └── Task
                    └── Step
```

It is live-wired to the store: any change made anywhere (board, editor, Clare, Hammond, another tab) appears here within one render, animated. Any change made here is written through the existing APIs and reflected everywhere else.

It also carries features that exist only because this is Adam's system:

1. **Semantic zoom with expand in place** (the base view)
2. **Morph to Lines** (bars become the transit-map Lines view and back)
3. **Life walls**
4. **Marking shadows**
5. **School-week axis and term-rhythm load strip**
6. **Agent ghost bars** (Hammond proposes, Adam confirms)
7. **Standards ribbon** (APST coverage on mentoring projects)
8. **Focus lens and forecast tails** (optional layers, last phase)

## Visual and motion contract (read first)

This spec says **what** the Timeline does. **How it looks and moves** is fixed by the reference folder `docs/proposals/timeline-reference/`:

- `VISUAL-SPEC.md`: layout tables, the motion contract, 16 failure patterns to avoid, and "Done when".
- `timeline.html`: a working prototype of every state in this spec, built on the real kit CSS. Open it next to your build.
- `golden/*.png`: target screenshots. `fixture.json`: the data behind them.
- `timeline-visual.spec.mjs`: 13 Playwright tests, each named by the phase that must make it pass. The prototype passes all 13.
- Four finished modules with 43 unit tests, to drop in rather than write: `timeline-motion.ts` (the single animation engine), `timeline-morph.ts` (Bars/Lines morph), `school-time.ts` (terms, "T4 W3" labels, compressed-holiday scale) and `apst.ts` (the 37 APST focus areas with their exact titles, validation and ribbon coverage).

Where this spec and the reference folder disagree on a visual or motion detail, **the reference folder wins**. Where they disagree on behaviour or data, this spec wins; flag it in the PR.

## Non-negotiables

- Read `packages/design-kit/AGENTS.md` and `TASKS.md` before any UI work. Tokens only. Toolbars use `createHubToolbar`, `.hub-pills`, `.hub-filter`, `createPlusButton`. No new colours, radii, type sizes or button styles.
- Every write goes through `tasksApi` (`src/services/client-api.ts`). Agent writes stay confirm-before-write through the existing `apply_mutations` path. No silent writes.
- Works at desktop and 390 px. Works with `prefers-reduced-motion`.
- Existing Gantt behaviour must survive the merge: drag to move, right edge to resize, handle to link, FS/SS/FF curves, cycle guard (`wouldCreateCycle`), cascade (`cascadeForward`), critical path (`criticalPath`, `mergeCriticalAcrossGroups`), `?project=` deep link, focus from hash (`hydrateFocusFromHash`).
- Reuse before inventing: `layoutGantt`, `layoutGanttGroups`, `collectChronologyItems`, `packChronologyLanes`, `runContainerTransform` (`src/views/container-transform.ts`, for opening full pages), `onTasksChanged` / `onTasksDeleted` (`src/services/task-cache.ts`), `schoolTerms` (`src/domain/maps-layout.ts`, to be superseded by prefs), `dayCapacity` (`src/domain/hammond-capacity.ts`), `WorkSession` records.
- All Timeline motion goes through `createMotion()` in `src/views/timeline-motion.ts`. Not `drawIn`/`popIn`, not CSS transitions on SVG, not per-element timers. `EASE` and `OVERSHOOT` there have the same numbers as `graph-svg.ts`.
- `main` already has TypeScript errors in `apps/tasks` (about 30 on 23/09/26, including `src/domain/gantt.ts`) and some unit test files that fail to import after the consolidation. Record the baseline counts at the start of each phase. A phase may not raise either count, and every file it creates or edits must be error-free.

---

## 1. The base view: semantic zoom with expand in place

### Rows

Rows are grouped by hierarchy. A group row can be collapsed or expanded; expansion state is kept per item in the session (same pattern as the Gantt `session`).

| Row | Bar span | Collapsed look | Expanded look |
|-----|----------|----------------|---------------|
| Dream | Diamond marker at `target_date` (or `review_at`); a faint band back to `origin_date` if present | Marker only | Its goals and projects beneath |
| Goal | Union of child project spans | Rounded band with count ("4 projects") | Child projects beneath |
| Project / excursion / program | `projectSpan` from `chronology.ts`; right edge `current_end_date`; a thin baseline tick at `baseline_end_date` when it differs | Bar with progress fill (done ÷ total tasks) and small dots for milestones | Tasks, milestones and steps beneath, full Gantt behaviour |
| Task | `taskSpan` (due date back by estimated duration) | Bar | Steps as thin sub-bars when dated, else a step count chip |
| Milestone | `milestoneSpan` | Diamond | n/a |

Undated children are never hidden silently. A group with undated children shows a dashed chip "+N undated" at the end of its bar. Clicking it opens a small popover listing them with a date picker per row (writes `due_date`).

### Zoom

Replace the Week / Month / Term pills with a zoom control that has five stops: **Year · Term · Month · Week · Day**. Keep pills as the control (kit `.hub-pills`) and add pinch and ctrl/cmd + wheel zoom on the canvas.

Zoom is **semantic**, not just geometric:

- Year and Term: goals and projects visible, tasks hidden unless their project is expanded. Milestones show as dots on the project bar.
- Month: a project opens by default when its next open dated task is due within 14 days; others stay collapsed. Tasks with dated steps open at Week and Day.
- Week and Day: everything dated is visible; task titles move inside bars when they fit.

Changing zoom tweens one value, `dayWidth`, through the motion engine (`MOTION.zoom`, `EASE`) and places every entity at that value each frame. The date under the pointer (wheel/pinch) or the today line (pills, keys) stays at the same screen x throughout. Rows that appear or disappear because of the semantic rules reconcile when the zoom lands. Exact timings: the motion contract in `VISUAL-SPEC.md`.

### Scope and filters

- Scope filter: All · Area · Goal · Project (replaces "This project / All projects"). `?project=` and `?goal=` query params set scope on load.
- Existing collapsible filters stay. Add a Hub filter (Teaching · Life · all) using `domain`.
- Critical path pill stays and works across groups.

### Today

A dashed vertical line with a "Today" label, as now. A "Jump to today" button appears when today is off screen.

### Opening items

Clicking a bar selects it (focus ring) and shows the existing popover. Double-click, or Enter when focused, opens the full page using the same transition the old Timeline used ("Open a bar for the full page"), via `runContainerTransform`.

### Keyboard

Arrow keys move selection between bars; Shift + Left/Right moves a selected task by one day (same write path as drag); `+`/`-` zoom; `L` toggles Lines; `Space` expands or collapses the selected group. All actions announced in an `aria-live="polite"` region.

### Live wiring and motion

- Subscribe to `onTasksChanged` / `onTasksDeleted`. If projects, goals or Someday items have no equivalent event, add `onProjectsChanged` / `onGoalsChanged` in the same file and pattern as `task-cache.ts`, and fire them from the same places tasks fire theirs. Do not poll.
- Every re-layout is keyed by entity id: `layout()` returns a map of entity id to geometry and `reconcile()` enters, tweens or exits each entity. Nothing is torn down and redrawn.
- Drag and resize are 1:1 with the pointer (no easing while dragging); attached curves follow 1:1. Release settles with `OVERSHOOT`; cascaded dependants follow with a stagger.
- `prefers-reduced-motion`: geometry snaps, opacity fades only.
- Exact durations, easings, staggers and interruption rules: the motion contract table in `VISUAL-SPEC.md`. The prototype `src/timeline-ref.ts` shows the pattern end to end.

### Navigation

- Rail: remove **Gantt**; keep a single **Timeline** item (`src/shell/shell.ts`, `NAV_SECTIONS`).
- `#/gantt` (with any query) redirects to `#/timeline` with the same query so old links and agent links keep working (`src/app/main.ts`).
- `renderGanttView` and `renderTimelineView` are replaced by `renderTimelineView` in a new module. Delete dead code once the redirect and tests pass. Keep `src/domain/gantt.ts` and `src/domain/chronology.ts`; extend rather than fork them.

### Mobile (390 px)

Label column collapses to 0. Goal, group, dream and open-project titles ride the canvas as sticky row titles. The toolbar stacks (zoom pills full width, then view pills, then a sideways-scrolling row of toggles). The page never scrolls sideways. Lines uses its vertical layout. Drag requires a 300 ms long-press so scrolling stays reliable. Details: "Layout contract (phone)" in `VISUAL-SPEC.md`.

---

## 2. Morph to Lines

A two-state toggle in the toolbar: **Bars · Lines** (kit `.hub-pills`). Shortcut `L`.

Lines is the existing transit view (`mountLinesView` in `src/views/graph-lines.ts`, fed a `LinesInput`). It is not rebuilt; it is mounted into the Timeline canvas with the same tasks, projects, scope and selection.

### The morph (Bars to Lines)

Use `startMorph()` from `src/views/timeline-morph.ts`; don't write another. It needs:

1. `data-entity-id` on every task bar face, milestone diamond, collapsed project bar and open-project bracket in Bars, and on every station, terminus and track group in Lines (same ids: task, milestone, project).
2. `data-morph-shape` (`bar`, `milestone`, `project`, `track`, `station`, `terminus`) and `data-morph-color` on each of those.
3. Both views mounted inside one positioned host (the card). `startMorph` overlays the incoming view, measures both, flies one clone per shared entity with the kit spring (about 620 ms), fades outgoing chrome over the first 35 % and incoming chrome over the last 40 %, springs the card height, then removes the overlay.

Entities present in only one view fade in place.

Lines to Bars is the exact reverse.

- Selection, scope and focus survive the switch in both directions.
- Interrupting (pressing `L` again mid-morph) reverses from the current frame; it never jumps.
- Reduced motion: 160 ms cross-fade, no flight.
- The choice persists for the session.

---

## 3. Life walls

A Life wall is anything Adam decides cannot move: the late-2026 trip, a conference, a family commitment. It appears as a full-height band across every row and every hub on the timeline.

### Data

Add an optional field to **Task** (covers Someday dreams and bucket-list items), **Project**, **Goal** and **Milestone**:

```ts
life_wall: {
  starts_on: string;      // YYYY-MM-DD
  ends_on: string;        // YYYY-MM-DD, >= starts_on
  label: string | null;   // defaults to the item title
} | null
```

Zod `.nullable().optional()` so existing records parse unchanged. Update the create/update schemas, `sanitizeTaskPatch` / `sanitizeProjectPatch` (so agents can propose walls through the normal confirm flow), the Blobs store, the mock API (`apps/tasks/scripts/mock-api.ts`) and the Netlify function handlers that validate these entities.

### Setting a wall

In the task editor, project page, goal page and milestone editor: a **Life wall** toggle. Turning it on pre-fills `starts_on`/`ends_on` from the item's own dates (target/due, or project span) and lets Adam change them. Items with no dates require the dates before the toggle saves.

### Rendering

- A full-height hatched band (kit neutral tokens, low contrast) with the label at the top of the axis. Sits behind bars, above the grid.
- Dates inside a wall are shaded on the load strip as zero capacity.
- On Lines, a wall renders as a horizontal "no service" band.

### Behaviour

- Dragging a task or milestone into a wall: the bar turns to warning styling while overlapping and a toast explains "Lands inside <wall label>". On release it is allowed (Adam may choose), but the bar keeps a small wall badge until moved out.
- Anything whose due date falls inside or within 3 working days before a wall and is not done shows a subtle "before <label>" chip, so pre-departure work backs up visibly against the wall.
- Hammond sees walls (see section 6) and never proposes moving work into one.

---

## 4. Marking shadows

A marking shadow is the future workload that setting an assessment creates. It is its own item, called a **marking shadow** everywhere in the UI.

### Data

A Task with `kind: 'marking_shadow'` (register it as a kind in Tools → Properties defaults, `task-properties-defaults.ts`) and a new optional field:

```ts
marking: {
  class_label: string;            // e.g. "10ENG2"
  scripts: number;                // count of scripts
  minutes_per_script: number | null; // null = use learned rate
  collected_on: string;           // YYYY-MM-DD, day scripts come in
  return_by: string;              // YYYY-MM-DD, day results are due
  scripts_marked: number;         // progress, default 0
} | null
```

`due_date` mirrors `return_by`; `estimated_duration` is derived (scripts × rate) and kept in sync so every existing view (Week, Today, capacity, Clare) already accounts for it.

### Rate

- `minutes_per_script` when set wins.
- Otherwise the learned rate: from finished `WorkSession`s linked to marking-shadow tasks, minutes ÷ scripts marked in that session. Sessions are created through `src/domain/focus-block.ts`; trace its callers. Add a **Log marking** action on the shadow (popover and task editor) that records minutes and scripts marked as a `WorkSession` (`source: 'manual'`) and bumps `scripts_marked`. If a focus-block finish UI exists for the task, add the same "scripts marked" field there too. Store the count on the session as a new optional `scripts_marked: number | null` field in `WorkSessionSchema`.
- Before any history exists, use `hub_prefs.marking_default_minutes_per_script` (default 10, editable in Tools). The UI labels this "starting guess" until 3 sessions exist.

### Rendering

- A shadow block from `collected_on` to `return_by`, in the task's lane, drawn as a soft translucent fill with a slightly darker leading edge. Its vertical density (opacity steps) reflects minutes per day needed: remaining minutes spread across available capacity (`dayCapacity`) on the days between today (or `collected_on`) and `return_by`, excluding Life walls.
- If the required minutes per day exceed 60 % of available capacity on any day, the shadow's edge turns warning colour and the load strip marks those days.
- Progress: a solid fill grows from the left as `scripts_marked` rises. The label reads "10ENG2 · 18 of 28 · ~2 h left".
- A shadow can hang off an assessment task or milestone with an FS link (the assessment's due date drives `collected_on`). Moving the assessment moves the shadow.

### Creation

- `+` menu on Timeline gets **Marking shadow**.
- In the task editor, any task can be marked "Collect scripts on due date"; saving offers to create the linked shadow.
- Clare and Hammond can propose a shadow through `task_create` with the `marking` field (add it to `sanitizeTaskPatch`).

---

## 5. School-week axis and term-rhythm load strip

### Term dates as a setting

- Add to `HubPrefs` (`src/domain/hub-prefs.ts`, stored at `meta/hub_prefs` via `/api/hub-prefs`):

```ts
school_terms: Array<{
  year: number;
  terms: Array<{ term: 1 | 2 | 3 | 4; starts_on: string; ends_on: string }>;
}>;
marking_default_minutes_per_script: number; // default 10
```

- Seed defaults with NSW government dates for 2026 and 2027, clearly labelled "NSW public dates, edit to match the College calendar". 2026 seeds: T1 2 Feb to 2 Apr, T2 22 Apr to 3 Jul, T3 21 Jul to 25 Sep, T4 13 Oct to 17 Dec (source: nsw.gov.au school holidays page). Leave 2027 empty with a prompt to fill it, rather than guessing.
- A **Term dates** panel under Tools lets Adam edit each term's start and end with the kit date inputs.
- Replace the hard-coded `KNOWN_TERMS` in `src/domain/maps-layout.ts` with a read from prefs (keep the fallback only when prefs are empty) so Maps and Timeline agree.

### Axis

- Term, Month and Week zooms label weeks as **T4 W3**; the date sits under it in muted text.
- Holidays render as compressed bands (25 % of normal width) with the label "Holidays". A toolbar toggle "Holidays: compressed · full" switches. Items inside holidays still render and remain draggable.
- Term bands tint the top axis row (as in mockup 1).

### Load strip

A collapsible strip under the rows, one bar per school week (per day at Week/Day zoom):

- **Committed minutes**: sum of `estimated_duration` for open tasks due that week (tasks spread across their span), plus marking-shadow minutes for that week.
- **Capacity line**: `dayCapacity` minutes across the week from the planning profile, minus Life walls, multiplied by the **term-rhythm factor** for that week of term.
- **Term-rhythm factor**: from completed tasks and `WorkSession` actuals across past terms, the median minutes completed in week N of a term divided by the median across all weeks. Needs 2 completed terms of history; until then it is 1.0 and the strip says "Learning your term rhythm".
- Weeks over capacity use warning styling and show hours ("13 h").
- Hover or focus a week to list what contributes, grouped by project.

### Drag ripple

While dragging a bar, compute `cascadeForward` live (debounced to one frame) and show the ripple: dependants preview their new positions as dashed outlines, milestones that would slip turn danger colour with "would slip to <date>", and the load strip updates in place. On release, if anything lands in a wall or pushes a week over capacity, a kit banner offers **Drop anyway** and **Suggest a fix** (section 6). Escape cancels the drag and restores everything.

---

## 6. Agent ghost bars

Hammond is the planner. When asked, or when Adam presses **Suggest a fix**, Hammond proposes a set of schedule changes. They render on the timeline as ghost bars before anything is written.

### Path

- Use the existing chat agent path: `POST /api/clare` with `{ action: "dump", agent_slug: "hammond", ... }` and mutation proposals parsed by `parseAgentMutations`. Do not add a second agent runtime.
- Add a protocol for Hammond, `timeline_rebalance`, that receives a compact digest: the visible window, open tasks with dates, estimates, dependencies and critical path membership, marking shadows, Life walls, weekly capacity and term-rhythm factors, and the drag that triggered it (if any).
- Follow `.cursor/rules/agent-context-integrity.mdc`: prove walls, shadows and capacity reach Hammond's actual model request, and that his instructions say what they mean (walls are immovable, shadows are real work, never exceed capacity if avoidable, never move hard `due_date`s set by someone else without saying so).

### Rendering

- Each proposed `task_update` / `project_update` renders as a dotted outline at the proposed position, joined to the current bar by a thin curved arrow, with a small "Hammond" chip.
- A tray above the canvas summarises: "Hammond suggests 4 changes · clears T4 W6 · no walls touched", with **Apply all**, **Review** (step through each ghost, accept or skip) and **Dismiss**.
- Applying uses the existing `apply_mutations` confirm path. Accepted ghosts animate into place (the same FLIP as live updates); skipped ghosts fade.
- A toolbar button **Ask Hammond** runs the same protocol over the current window without a drag.

---

## 7. Standards ribbon

For accreditation mentoring (and any project where it is switched on), a thin ribbon under the project bar shows APST coverage.

### Data

- Project: `standards_ribbon: boolean` (optional, default false) plus `submission_date: string | null` (falls back to `current_end_date`).
- Task: `apst_focus: string[]` (optional), focus area codes such as `"3.2"` or `"6.4"`.
- Reference data: `src/domain/apst.ts` (already written, with tests) holds the 7 standards and 37 focus areas with their exact AITSL titles, plus `isFocusArea`, `focusAreaLabel`, `focusAreasByStandard`, `sanitizeApstFocus` and `standardsCoverage`. It is the only source of codes and titles. Validate with `sanitizeApstFocus` at every write boundary (schema transform, `sanitizeTaskPatch`, Netlify handler); never with a pattern, which would accept codes such as 4.9 that don't exist.

### Rendering

- Seven segments, Standard 1 to 7, each coloured by coverage: none, some (at least one linked task open), evidenced (at least one linked task done).
- Hover or focus a segment to list the focus areas covered (`focusAreaLabel`, e.g. "3.2 Plan, structure and sequence learning programs") and the linked tasks. Segment `aria-label`: "Standard 3, Plan for and implement effective teaching and learning: evidenced".
- If any standard is still at "none" within 4 school weeks of `submission_date`, the segment shows a warning dot and the load strip week before submission is flagged.
- Tag picker for `apst_focus` in the task editor: the kit closed-field popover (`createMorphingClosedFieldPopover`), grouped by `focusAreasByStandard()` with each standard's number and title as the group heading and each option shown as its full label. Multiple selection; free text is not allowed. Selected focus areas show on the task as chips with the code only, and the full label as their tooltip and `aria-label`.

---

## 8. Focus lens and forecast tails (last phase, optional layers)

Both are toggles on the toolbar and off by default.

- **Focus lens**: a draggable lens that magnifies a two-week window to day resolution while the rest of the axis compresses (piecewise linear scale: focus at Day width, 3 weeks either side at Week width, the rest at Term width). Bars crossing the boundary stretch continuously. The lens snaps to today on load.
- **Forecast tails**: for each open task and milestone, a hatched tail from the planned end to the P85 finish, computed from Adam's own estimate-to-actual ratios (`estimated_duration` vs `actual_duration` / work sessions) by domain. Needs 20 completed tasks with both values; otherwise the toggle is disabled with the reason in its tooltip.

---

## Acceptance

Each phase in the plan lists its own checks. Across all phases:

- `npm test` in `apps/tasks`: no new failures against the phase's recorded baseline, and every test file the phase adds passes. `npx tsc -p tsconfig.json --noEmit`: no new errors against the baseline, none in touched files.
- The phase's tests in `tests/browser/timeline-visual.spec.mjs` pass, and earlier phases' tests still pass.
- Root `npm test` passes.
- Walk `#/timeline` in `npm run dev` at desktop and 390 px: empty store, seeded store, a project with no dated tasks, a scope with 200+ tasks (no dropped frames when zooming on a laptop; if layout exceeds 8 ms per frame, virtualise rows outside the viewport).
- `#/gantt?project=<id>` lands on the Timeline scoped to that project.
- Every write made on the Timeline is visible on Board and Week without a refresh, and every write made elsewhere appears here animated.
- Reduced motion checked with the OS setting on.

## Out of scope

- Friday Examen replay (parked).
- Syncing marking shadows from the Teaching app. Shadows live in Tasks only for now.
- Any change to `life-hub-data` shape beyond the new optional fields stored in Blobs.
