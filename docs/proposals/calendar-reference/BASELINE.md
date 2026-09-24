# Calendar baseline

Recorded 24 Sep 2026 on `main` at `8d74fde3`, with the Tideline reference, `calendar-bands.js`, `capacity-model.js` and `ghost-writes.js` already in the tree. Later phases must not add to the failure counts below. None of these failures are in those three modules or in `apps/tasks/src/views/timeline-motion.ts`.

## Root tests

`npm test` (`node --test tests/unit/*.test.js tests/integration/*.test.js`) exited 0.

**4108 passed, 0 failed** (45 suites). No failing test files. No failing tests.

## TypeScript

`npx tsc -p tsconfig.json --noEmit` in `apps/tasks` exited 2 with **33** `error TS` lines.

| File | Errors |
|---|---|
| `apps/life/js/app/chart-kit/orbit-radar.js` | TS6059 `scene.js` is outside `rootDir` |
| `apps/tasks/src/blocks/whiteboard-runtime.ts` | TS6059 `blocksuite-adapter.ts`; TS6059 `document-client.ts` |
| `apps/tasks/src/domain/clarify.ts` | TS2322 waiting-on prompt is not `null` |
| `apps/tasks/src/domain/gantt.ts` | TS2740 project object is missing review fields |
| `apps/tasks/src/domain/graph-branch-layout.ts` | TS6059 `flowchart-lanes.js` is outside `rootDir` |
| `apps/tasks/src/domain/graph-insights.ts` | TS2322 `string \| null` is not `string \| undefined` |
| `apps/tasks/src/domain/graph-model.ts` | TS6059 `orbit-radar.js` is outside `rootDir`; TS18048 `dep` is possibly undefined |
| `apps/tasks/src/domain/schedule-compose.ts` | TS2353 `complete` is unknown; TS2339 `complete` (twice); TS2345 day-window `start` is not the `"08:00"` literal |
| `apps/tasks/src/shell/shell.ts` | TS6059 `hub-switcher.js` is outside `rootDir`; TS2367 `"constellation"`; TS2367 `"backlog"` |
| `apps/tasks/src/teacher/lesson-canvas/palette-catalog.ts` | TS2741 `whiteboard` missing from the insert-menu map |
| `apps/tasks/src/views/card-menu.ts` | TS6059 `hub-floating.js` is outside `rootDir`; TS2305 `findTypeaheadMatch` is not exported |
| `apps/tasks/src/views/dashboard-overview.ts` | TS2532 object is possibly undefined (twice) |
| `apps/tasks/src/views/graph-branch.ts` | TS2339 `from` missing on `GraphInsightAnchor`; TS2339 `to` missing |
| `apps/tasks/src/views/graph-lines.ts` | TS6059 `transit-lines.js` is outside `rootDir` |
| `apps/tasks/src/views/graph-orbit.ts` | TS2322 `string \| number` is not `string \| null` |
| `apps/tasks/src/views/graph.ts` | TS2345 lines input; TS2345 branch input; TS2345 orbit input |
| `apps/tasks/src/views/someday.ts` | TS2322 status; TS2322 link kind; TS2322 jar kind |
| `packages/design-kit/js/hub-floating.js` | TS6059 `dom.browser.mjs` is outside `rootDir` |
| `packages/design-kit/js/vendor/floating-ui/dom.browser.mjs` | TS6059 `core.browser.mjs` is outside `rootDir` |

## Reference modules

`node --test tests/unit/calendar-bands.test.js tests/unit/capacity-model.test.js tests/unit/ghost-writes.test.js`: **25 passed**, 0 failed.

`node docs/proposals/calendar-reference/src/build-ref.mjs`, then `node --test docs/proposals/calendar-reference/tideline-visual.spec.mjs`: **9 passed**, 0 failed, against the reference (not the Life app).

`tests/browser/tideline-visual.spec.mjs` is a byte copy of `docs/proposals/calendar-reference/tideline-visual.spec.mjs`. It is not on `test:browser`.

## Prototype walk

Opened `docs/proposals/calendar-reference/tideline.html` from the repo and stepped through every Motion contract row at normal speed and with Slow motion ×5.

These matched the contract:

- First mount: columns rise 8px and fade in, about 320ms each, about 30ms stagger left to right (about 1600ms and 150ms at ×5). Opening a band does not replay it.
- Band expand / fold: School goes 158 → 462 and the others go to 30 over one tween. The stack stays 552. Chips follow, and density goes line → card. ×5 stretches the same tween.
- Retarget: School, then Yours mid-flight, continues into Yours at 462. The stack stays 552. At ×5 no frame jumped.
- Popover open: opacity 0 → 1 and y 4 → 0, about 180ms (about 900ms at ×5).
- Accept on the Saturday ghost: the button reads "Saving…" for about 350ms, then `--solid` tweens 0 → 1 (stretched at ×5).
- Accept on Thursday's workout: after "Saving…", the suggestion, avatar and outline go, the title is struck through, and the meta reads "Skipped · Sara". That swap is instant at both speeds.
- Apply all: the four ghosts accept about 90ms apart (wall clock, including at ×5). The toast reads "4 changes written." and the Central Node receipts line. It rises 6px and fades in over about 220ms (stretched at ×5), stays about 5.2s of wall clock, then fades out.
- Reduced motion: School snaps (two heights, not a tween) at normal speed and at ×5. Reset fades the columns in without the 8px rise. ×5 still stretches that opacity fade.

Two rows do not match:

1. **Dismiss does not scale.** The good-night chip fades out over about 160ms (about 800ms at ×5) and is then removed. `--s` stays `1` the whole time, so it does not go 1 → 0.96. `exit()` drops every non-opacity tween, which cancels the scale tween started on the line before.
2. **Popover close is cut off at ×5.** The fade is an engine tween, so at ×5 it should last about 900ms. `hidden` is set with `setTimeout(180)`, which stays on the wall clock. At ×5 the popover is hidden at about 186ms while opacity is still about 0.36. At normal speed the hide lines up with the end of the fade.
