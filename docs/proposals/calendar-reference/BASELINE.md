# Calendar baseline

Recorded 24 Sep 2026 on `main` at `dd640258`. These results are pre-existing. Later phases must not add to either count. None of the TypeScript errors are in `calendar-bands.js`, `capacity-model.js`, `ghost-writes.js`, or `timeline-motion.ts`.

## Root tests

`npm test` (`node --test tests/unit/*.test.js tests/integration/*.test.js`) exits 0. **4124 passed, 0 failed** (45 suites). No failing test files. No failing tests.

## TypeScript

`npx tsc -p tsconfig.json --noEmit` in `apps/tasks` exits 2 with **33** `error TS` lines:

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

## Reference modules

`node --test tests/unit/calendar-bands.test.js tests/unit/capacity-model.test.js tests/unit/ghost-writes.test.js`: **28 passed, 0 failed**.

- `calendar-bands.test.js` — 11
- `capacity-model.test.js` — 8
- `ghost-writes.test.js` — 9

`node docs/proposals/calendar-reference/src/build-ref.mjs` rewrote nothing (`tideline.html` and `fixture.json` unchanged). `node --test docs/proposals/calendar-reference/tideline-visual.spec.mjs`: **9 passed** against the reference.

`tests/browser/tideline-visual.spec.mjs` is a byte copy of `docs/proposals/calendar-reference/tideline-visual.spec.mjs`. It is not in `test:browser`.

## Prototype walk

Opened `docs/proposals/calendar-reference/tideline.html` from the repo (kit CSS loaded). Every motion-contract row was run at normal speed on screen, and again with Slow motion ×5 by sampling frames after pressing that control.

Matched the contract:

- First mount: columns start at opacity 0, translated 8px down, and fade up. Later columns start after earlier ones. ×5 stretches the entrance.
- Band expand/fold: School eases open (monotonic, many frames). Stack sum stays 552 and the day body stays 582, so nothing below the body moves. Chips and the now line move on the same frames. Retargeting mid-flight reverses from the current heights.
- Popover open: opacity 0→1 and y 4→0. At normal speed it closes the same way and only then goes `hidden` (opacity already 0).
- Accept (standalone ghost): the button reads "Saving…" and is disabled, then `--solid` runs 0→1. Toast starts "Written."
- Accept (proposal on an item): after Saving…, the suggestion line is gone, the title is struck through, and the meta reads "Skipped · Sara".
- Apply all: one toast, "4 changes written. Receipts are in Central Node › Recent Agent Actions." The starts stay about 90ms apart. That gap is a wall-clock timer, so ×5 does not spread it.
- Toast: rises and fades in. The 5.2s hold is wall-clock; ×5 slows only the fades.
- Reduced motion: band heights snap (one frame). Column entrance has y 0, and only opacity fades. With ×5 that fade stretches (~120ms → ~600ms) and the geometry still snaps.

Two rows do not match:

1. **Dismiss does not scale.** The chip fades out and is removed (~160ms, ~800ms at ×5), but `--s` stays 1 on every sampled frame at both speeds. `exit()` deletes the scale tween that was just started, so the specified 1→0.96 never runs.
2. **Popover close at ×5 hides early.** `hidden` flips at ~180ms wall-clock while opacity is still ~0.35 and y is still ~2.6. The hide uses `setTimeout(popMs)`, which is not on the slowed clock. At normal speed the hide waits until the fade has finished.
