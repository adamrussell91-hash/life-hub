# Timeline baseline

Recorded 24 Sep 2026 in `apps/tasks` on `main` at `830835cf`, with the four reference modules already in the tree. These failures are pre-existing. Later phases must not add to either count. None of them are in `timeline-motion.ts`, `timeline-morph.ts`, `school-time.ts`, or `apst.ts`.

## TypeScript

`npx tsc -p tsconfig.json --noEmit` exits 2 with **33** `error TS` lines. None name the four reference modules.

## Unit tests

`npm test` (`vitest run`): **3 failed files, 4 failed tests, 859 passed** (120 files).

Failed suite:

- `tests/unit/auth.test.ts` — cannot resolve `../../netlify/functions/_shared/auth-security.mts`

Failed tests:

- `tests/unit/page-editor.test.ts` > turns a timeline key date into a task and opens the editor (looks for `[aria-label="Due date"]`; the editor label is Deadline)
- `tests/unit/page-editor.test.ts` > edits an existing timeline task from the card menu
- `tests/unit/page-editor.test.ts` > shifts sibling dates when the event task due date changes
- `tests/unit/task-relationships.test.ts` > labels saved contact/collaborator actions Remove and suppresses rather than ending

## Reference modules

`npx vitest run tests/unit/timeline-motion.test.ts tests/unit/timeline-morph.test.ts tests/unit/school-time.test.ts tests/unit/apst.test.ts`: **43 passed**.

`apps/tasks/tests/browser/timeline-visual.spec.mjs` is a byte copy of `docs/proposals/timeline-reference/timeline-visual.spec.mjs`.

## Prototype walk

Opened `docs/proposals/timeline-reference/timeline.html` from a local server so the design-kit CSS resolved. Week → Year eased and the Today line stayed put. Bars ↔ Lines morphed, and pressing L mid-flight reversed without a leftover overlay. At 390px the page did not scroll sideways. Console: favicon 404 only.

The project chevron on the Week zoom did not hide child tasks. Week zoom is specified to show every dated row, so that may be the semantic rule rather than a dead control. Phase 2 should confirm a click still toggles `expanded` and that Year/Term hide tasks until the project is opened.
