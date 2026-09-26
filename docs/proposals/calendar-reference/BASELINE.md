# Calendar baseline (hub migration)

Recorded 26 Sep 2026 on `origin/main` at `48dffc49` (includes Term River routing #474). Branch: `cursor/hub-calendar-migration-2e03`.

Later steps must not raise the TypeScript error count or add failing tests.

## Root tests

Command: `npm test` (`node --test tests/unit/*.test.js tests/integration/*.test.js`)

```text
# tests 4247
# suites 45
# pass 4247
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 16946.964568
exit_code: 0
```

## TypeScript (`apps/tasks`)

Command: `cd apps/tasks && npx tsc --noEmit`

```text
ERROR_COUNT: 33
exit: 2 (expected — pre-existing)
```

| Count | File |
|---|---|
| 4 | `apps/tasks/src/domain/schedule-compose.ts` |
| 3 | `apps/tasks/src/shell/shell.ts` |
| 3 | `apps/tasks/src/views/graph.ts` |
| 3 | `apps/tasks/src/views/someday.ts` |
| 2 | `apps/tasks/src/blocks/whiteboard-runtime.ts` |
| 2 | `apps/tasks/src/domain/graph-model.ts` |
| 2 | `apps/tasks/src/views/card-menu.ts` |
| 2 | `apps/tasks/src/views/dashboard-overview.ts` |
| 2 | `apps/tasks/src/views/graph-branch.ts` |
| 1 | `apps/life/js/app/chart-kit/orbit-radar.js` |
| 1 | `apps/tasks/src/domain/clarify.ts` |
| 1 | `apps/tasks/src/domain/gantt.ts` |
| 1 | `apps/tasks/src/domain/graph-branch-layout.ts` |
| 1 | `apps/tasks/src/domain/graph-insights.ts` |
| 1 | `apps/tasks/src/teacher/lesson-canvas/palette-catalog.ts` |
| 1 | `apps/tasks/src/views/graph-lines.ts` |
| 1 | `apps/tasks/src/views/graph-orbit.ts` |
| 1 | `packages/design-kit/js/hub-floating.js` |
| 1 | `packages/design-kit/js/vendor/floating-ui/dom.browser.mjs` |

None of these errors are in calendar renderers, capacity, ghosts, or kit calendar modules.

## Migration gates (unchanged contracts)

Visual contracts under `tests/browser/*-visual.spec.mjs` must keep passing after Step 1+. Do not edit those specs.

| Suite | Env | Role |
|---|---|---|
| `tideline-visual.spec.mjs` | `TIDELINE_APP=1` | Week look/motion |
| `almanac-visual.spec.mjs` | `ALMANAC_APP=1` | Almanac look/motion |
| `dial-visual.spec.mjs` | `DIAL_APP=1` | Day Dial look/motion |
| `river-visual.spec.mjs` | `RIVER_APP=1` | Term River look/motion |

## Precondition

Term River routing fixes from the #468 review are on this baseline via #474 (`48dffc49`).
