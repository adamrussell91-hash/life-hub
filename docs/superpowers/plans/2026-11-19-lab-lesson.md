# Lab Lesson Implementation Plan

**Goal:** Give the `lab` lesson type its own Plan card, teacher board and student player, so a class can test one claim about language on readers at three levels: You supply it, Students write it, Pairs design it.

**Architecture:** Lab follows Tutorial's wiring for a player lesson type (settings on the lesson, a generated server schema, a publish branch, an operator function and a public student function, roster identity) and peer feedback's wiring for a live round (`activity-rounds.mjs`, `flagText`, polling). All experiment logic is pure and lives in one client module that is also bundled for the server. No AI calls anywhere.

**Tech stack:** Teaching app (TypeScript, Vite, Vitest + jsdom), Netlify Functions (ESM `.mjs`, `node:test`), Netlify Blobs store `teaching-hub-content`, zod.

**Spec:** `docs/superpowers/specs/2026-11-19-lab-lesson-design.md`.
**Mock:** `docs/superpowers/specs/lab-lesson-screens/lab-lesson.html` (copied in Task 0). It runs all three levels and is the reference for layout, wording and motion. Where the mock and the spec differ, the spec wins.

**Privacy:** every fixture, test and mock uses invented students and invented writing. No real class data in the repo.

**Build mode** (memory: token-saving builds, minimise PRs): one branch, one PR, phases as commits. Three large build chunks (Tasks 1–2, Tasks 3–4, Tasks 5–6). Each task runs only its own test files. The gate runs once, in Task 7. No per-task reviewer agents.

## Settled since the spec

1. **Pairs live in the lab's own settings**, not in a saved group set. Saved groups in the markbook are evidence groups (one subset of a class), and Tutorial and Sprint each keep their own `groups[]` on the lesson. Lab does the same: `lab.pairs[]`, with a **Make pairs** button on the Plan card that shuffles the class list into pairs the teacher can then edit. This replaces "Pairs come from a saved group set" in the spec.
2. **The Explain answer is a real written-question block.** The To mark queue only lists markbook columns linked to a block hand-in (`piece {lesson_id, block_id}`). So the lab seeds one `question_set` block with a fixed id, `lab_explain`, in `lesson.blocks`, and the player renders it at the Explain step with the normal block renderer. Hand-in, To mark, marking and Returned work then need no changes.
3. **Students are identified by the class list**, as in Tutorial (`class_token` + initials claim). Other students never receive a writer's id; the teacher sees initials.
4. **Lab notes and ratings are per student; the version, hypothesis and feature are per pair** (confirmed). Lab notes default on for Pairs design it only (confirmed).

## File map

| File | Change |
|------|--------|
| `apps/teaching/src/lab/schema.ts` | **new** `LabSettingsSchema` and types |
| `apps/teaching/src/lab/model.ts` | **new** pure logic: steps, tokens and edits, dealing, results |
| `apps/teaching/src/lab/api.ts` | **new** `labClient`, `labTeacherApi` |
| `apps/teaching/src/lab/plan-card.ts` | **new** the Plan card in the lesson editor |
| `apps/teaching/src/lab/board.ts` | **new** teacher board, polling |
| `apps/teaching/src/lab/player.ts` | **new** student player, step router |
| `apps/teaching/src/lab/steps-*.ts` | **new** one file per step group: `steps-set.ts` (Predict, Make, Test, Result for the two supplied levels), `steps-pairs.ts` (Design, Predict, Test, Result, Name it) |
| `apps/teaching/src/lab/bench.ts` | **new** the control and the pair's editable version |
| `apps/teaching/src/lab/charts.ts` | **new** bars, dot readings, findings chart, level bars |
| `apps/teaching/src/lab/notes.ts` | **new** note box, gating, notes panel, facts strip |
| `apps/teaching/src/lab/after.ts` | **new** After class page and markbook column |
| `apps/teaching/src/lab/lab.css` | **new** |
| `netlify/functions/_shared/lab-schema.mjs`, `lab-model.mjs` | **generated** from the two TS files above |
| `netlify/functions/_shared/lab-keys.mjs` | **new** `labKeys(lesson)` |
| `netlify/functions/_shared/lab.mjs` | **new** `prepareLabPublish`, `labAction`, `labTeacherAction` |
| `netlify/functions/lab.mjs` | **new** operator, `/api/lessons/:id/lab` |
| `netlify/functions/published-lab.mjs` | **new** public, `/api/published/lab/:id` |
| `scripts/generate-alchemy-schema.mjs` | two new entries beside the tutorial one (:52) |
| `netlify/functions/_shared/public-student-routes.mjs` | add the public route |
| Player-mode touch list | see Task 1 step 4 |
| `apps/teaching/src/marking/mark-piece.ts` | lab notes and trial beside a `lab_explain` answer |
| `tests/unit/lab-*.test.js`, `apps/teaching/tests/unit/lab-*.test.ts` | **new** |
| `tests/unit/helpers/lab-store.js` | **new** in-memory store + an invented class of 17 in eight pairs |

---

### Task 0: Branch and documents

- [ ] Check free disk (`df -h /`), then create a worktree from `origin/main` on `claude/lab-lesson`. Do not build on the branch this plan was written on; it has unrelated changes.
- [ ] Copy the spec, this plan and the mock into the new branch: the mock goes to `docs/superpowers/specs/lab-lesson-screens/lab-lesson.html`.
- [ ] In the spec, replace the "To confirm before the plan" section with the four points under "Settled since the spec" above.
- [ ] Commit: `Lab lesson: spec, plan and mock`.

### Task 1: Settings, pure model, Plan card, publish (commit 1)

**1. Schema** (`lab/schema.ts`). One discriminated shape:

```ts
export const LAB_LEVELS = ['supplied', 'students', 'pairs'] as const;
export const LAB_JUDGE = ['pick', 'rate'] as const;
export const LAB_LANGUAGE_LEVELS = ['Form', 'Sentence', 'Word'] as const;

LabSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  level: z.enum(LAB_LEVELS),
  question: z.string().min(1).max(200),
  why: z.string().max(400).default(''),
  claim: z.string().max(200).optional(),              // pairs
  same: z.string().max(300).optional(),               // supplied, students
  options: z.array(z.string().min(1).max(40)).min(2).max(5).optional(),
  texts: z.array(z.string().max(4000)).max(5).optional(),   // supplied: one per option
  control: z.string().max(4000).optional(),           // pairs
  task: z.string().max(300).optional(),               // students: what to write
  judge: z.enum(LAB_JUDGE),
  judge_question: z.string().min(1).max(200),
  ends: z.tuple([z.string().max(40), z.string().max(40)]).optional(),  // rate
  threshold: z.number().min(0).max(100),
  notes_on: z.boolean(),
  note_prompts: z.record(z.string().max(200)).optional(),
  features: z.array(z.object({ name: z.string().min(1).max(60), level: z.enum(LAB_LANGUAGE_LEVELS) })).max(12).optional(),
  pairs: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), students: z.array(z.string().min(1).max(64)).min(1).max(4) })).max(20).optional(),
  debrief: z.string().max(1200).default(''),
  explain_prompt: z.string().max(400).default('')
});
```

Add `labIssues(settings)` for the cross-field rules: `pairs` level needs `claim`, `control`, `features` and `judge: 'rate'`; `supplied` needs `texts.length === options.length`; `students` needs `task` and `judge: 'pick'`; `rate` needs `ends`. Export `labDefaults(level)` (threshold 8 for pick, 1 for rate; notes on for pairs only; the six default features; the default note prompts from the spec).

**2. Pure model** (`lab/model.ts`). Everything here is deterministic and has no DOM or network. Signatures:

```ts
stepsFor(level): LabStep[]                       // per the spec's table
type Token = { w: string; line: number; br: boolean };
tokenise(text): Token[]                          // split on spaces, keep line breaks as `br` on the last word of a line
type Edit = { cut?: number[]; rep?: Record<number, string>; join?: number[]; brk?: number[] };
applyEdits(tokens, edit): { text: string; lines: string[] }      // what a reader sees
markEdits(tokens, edit): MarkedToken[]           // for the bench and the board: changed, cut, break-moved flags
describeEdits(tokens, edit): string[]            // one phrase per contiguous run: 'cut "I think,"', 'joined lines 5 and 6', 'broke line 3 after "settled"', 'changed "meant" to "wanted"'
deal(input, seed): Record<studentId, ReadingItem[]>
shift(controlRatings, versionRatings): number    // difference of means, 1 dp
verdict(shift, threshold): -1 | 0 | 1
pickResult(counts, threshold): { order, top, lead, win }
levelGroups(trials, features): { level, trials, meanAbsShift }[]   // skips trials with fewer than 4 readers
```

`deal` rules (spec, "Who reads what"): never a student's own writing or own pair's version; counts per version as even as the class allows; pairs level gives each reader two controls and up to four other versions; pick level gives up to six other writers, each writer's versions together in a shuffled order; supplied + rate splits the class into equal random groups. Use a small seeded PRNG so a deal can be tested and re-created.

**3. Generated server copies.** Add `lab/schema.ts` → `_shared/lab-schema.mjs` and `lab/model.ts` → `_shared/lab-model.mjs` to `scripts/generate-alchemy-schema.mjs` beside the tutorial entry, and run it.

**4. Wire the mode.** Each of these is a small edit copying the tutorial line next to it:

- `curriculum/pedagogical-mode.ts:51` add `lab` to `PLAYER_MODES`; server copy `_shared/quiz.mjs:153`.
- `schemas/lesson.ts:76` add `lab: LabSettingsSchema.optional()`, the no-quiz list (:93) and `labIssues` in the superRefine (:106).
- `schemas/published-lesson.ts:23` public subset for lab (question, why, level, judge wording, options, features, notes settings; never `debrief`, never `pairs` member lists, never `texts` or `control`, which reach students only through the round).
- `teacher/lesson-editor.ts:241` `assignLesson`: copy `next.lab`. Without this the settings never save.
- `netlify/functions/lessons.mjs:29` accept `lab` settings on create.
- `netlify/functions/lesson-publish.mjs:199–262` a lab branch calling `prepareLabPublish`, which validates, writes `lab/{lesson}/config` (full settings, teacher only) and seeds or updates the `lab_explain` block's prompt.
- `netlify/functions/published-lesson.mjs:55` add lab to `needsClass`.
- `teacher/lesson-display.ts:43`, `teacher/end-questions.ts:33`, `ai/context.ts:72` (one type line: "Lab: students test a claim on readers"), `student/work-sync.ts:33` (`.lab` root class).
- Then run `node scripts/generate-teaching-ai-runtime.mjs` (a freshness test fails otherwise).

**5. Plan card** (`lab/plan-card.ts`, mounted from `teacher/lesson-canvas/mount-page.ts` with a `syncLabPanel()` beside `syncTutorialPanel()` at :1296, its own host div at :1537, and the same call sites). The card is the mock's Plan view: one row per line of the spec's table, level chips that swap which rows show, the Lab notes switch, the feature list editor, **Make pairs** (shuffle the class list into twos, one three if odd; chips can be dragged between pairs), and the Explain prompt. In lab mode the normal block canvas is hidden; `lab_explain` is seeded into `lesson.blocks` when the mode is first set.

**Tests:** `apps/teaching/tests/unit/lab-schema.test.ts` (each level's valid shape, each cross-field rule), `lab-model.test.ts` (steps per level; tokenise and round-trip; each edit kind applied and described; two adjacent edits read as one change; `deal` for 17 students in eight pairs, for a class of 5, and for one pair alone, asserting no own work and counts within one of each other; shift, verdict at and around the threshold; level grouping with a thin trial left out), `lab-plan-card.test.ts` (level switch shows the right rows; Make pairs covers every student once).

Commit: `Lab lesson: settings, model, Plan card, publish`.

### Task 2: The round, and You supply it end to end (commit 2)

**1. Keys** (`_shared/lab-keys.mjs`), base `lab/{lesson}`:

| Key | Holds |
|---|---|
| `config` | published settings |
| `active`, `{session}/round` | the round, via `saveRound` |
| `{session}/students/{owner}` | `{ student_id, pred, notes: {step: text}, writing?: string[], flagged?: boolean[], picks?: number[], ratings?: number[], done: {step: true} }` |
| `{session}/pairs/{pairId}` | `{ edit, ready, pred, feature }` |
| `{session}/deal` | reading lists, written once when the teacher moves to Test |
| `{session}/held/{owner}` | teacher release or remove of flagged writing |

Round state: `{ session, step, revealed, started, expires }`.

**2. Server** (`_shared/lab.mjs`).

- `labTeacherAction`: `start`, `next`, `reveal`, `board` (counts for the current step, and results once the step is Result or later), `rounds` and `resume` (through `listRounds` and `bringBackRound`), `end`, `release`, `remove`, `student` (one student's record, for marking).
- `labAction` (student): `status` (round step, own record, own pair's record, own reading item for the current position, results once allowed), `claim`, `predict`, `note`, `rate`, `pick`.
- Results are computed on read from the student and pair records with `lab-model.mjs`. They are never returned before the Result step, to students or in the board payload.
- Moving to Test writes `deal` once (create-only), from the students who have a record. A student who joins after that gets a list dealt on first `status`.
- Identity: reuse Tutorial's `identify` path (`quiz.mjs:478`).
- `netlify/functions/lab.mjs` uses `createOperatorHandler`; `published-lab.mjs` uses `createPublicStudentHandler` with the same rate limit and body cap as `published-tutorial.mjs`. Add the public path to `PUBLIC_STUDENT_API_ROUTES`.

**3. Client.** `lab/api.ts` mirrors `tutorial/api.ts`. `lab/player.ts` is mounted from `student/lesson-view.ts` beside the tutorial branch (:155) and polls `status` on a `setTimeout` chain (5 s, paused while hidden, as `blocks/peer-feedback.ts:199`). `lab/board.ts` is mounted by `syncLabPanel()` once the lesson is published; it polls `board` every 4 s and has the step strip, the status line, **Reveal predictions** and **Next**. `lab/charts.ts` gets `bars()`. `lab/steps-set.ts` implements Question, Predict, Test (rate on a line, one version), Result and the Explain step, which renders the `lab_explain` block.

All screens follow the mock's "You supply it" lab.

**Tests:** `tests/unit/lab-actions.test.js` with `helpers/lab-store.js` (start and step order; a student action for the wrong step is refused; predictions lock; no results in any payload before Result; deal written once and stable; split-class counts differ by at most one; stale session gets 409; bring back restores a round), `tests/unit/lab-publish.test.js` (config written, public snapshot has no teacher-only fields, `lab_explain` present), `public-student-routes.test.js` updated, `apps/teaching/tests/unit/lab-player.test.ts` (each step renders from a status payload; waiting state after an action), `lab-board.test.ts` (reveal toggles the chart; Next posts the right step).

Commit: `Lab lesson: live round and the supplied level`.

### Task 3: Students write it (commit 3)

- Student action `write` (one version per option; `flagText` on each; create or overwrite until Make closes).
- Make step in `steps-set.ts`: one box at a time, as the mock.
- Test, pick one: a reading item is one writer's versions in a dealt order with option labels withheld; `pick` stores the chosen option index for that item.
- Flagged writing is left out of the deal until released; the board lists held pieces with **Release** and **Remove**, as peer feedback does.
- Result: `pickResult`, the headline, bars, and for each student how often each of their own versions was chosen. Board: **Show the most chosen piece** (anonymous).

**Tests:** extend `lab-actions.test.js` (flagged writing withheld then released; a reader never gets their own writing; a writer's versions stay together; a reading item never names its option), `lab-player.test.ts` (Make moves through the options; pick advances).

Commit: `Lab lesson: students write it`.

### Task 4: Pairs design it (commit 4)

- `lab/bench.ts`: the control beside the pair's version. Tap a word to select it; a tool row offers Replace, Cut or Put back, and Break line after or Join to next line. State is an `Edit`; rendering comes from `markEdits`; the change line comes from `describeEdits`. Changes are lilac; a moved break is a small lilac bar. At 390px the panes stack.
- Pair actions: `bench` (save the pair's edit; any member; last write wins, as Sprint's `groupWrite`), `ready`, `pair_predict`. A replaced word runs through `flagText`.
- Test, pairs: six items, two controls and up to four other versions, rendered with `applyEdits` and no marks; `rate` stores 0–10 per item.
- `lab/charts.ts`: `reading()` (a dot per rating, stacked where they bunch, a line at the mean; dots drop in one at a time, still under reduced motion) and `findings()` (one row per pair, bar left or right of a centre line, pale when under the threshold or under four readers; a row opens that pair's marked version beside its dots and the control's).
- Result: student sees control and own version readings, the shift and whether the pair's prediction held; the board shows the findings chart.
- A pair with no change has no trial; its members read as normal and see the class findings.

**Tests:** `apps/teaching/tests/unit/lab-bench.test.ts` (each tool produces the expected `Edit` and change line; a second change shows the "cleaner result" line; Put it on the bench is off with no change), `lab-charts.test.ts` (dot counts and mean position; findings rows sorted by shift; thin rows pale), `lab-actions.test.js` (either partner can save; controls mixed in; a reader never gets their own pair's version; per-version reader counts within one).

Commit: `Lab lesson: pairs design it`.

### Task 5: Lab notes and Name it (commit 5)

- `lab/notes.ts`: `noteBox(step)` (dashed box, prompt from settings), gating (a step's main button calls through only when the note has text; otherwise "Write your lab note to carry on" appears and the box takes focus), the facts strip above the card, and the notes panel shown at Explain. Every step in every level calls it; with `notes_on` false nothing renders and nothing blocks.
- The server refuses a step's completing action when notes are on and the note for that step is empty, so the rule holds outside the UI.
- Name it step (pairs): feature chips from settings, the note, **Done**; pair action `feature`.
- Board at Name it: `levelBars()` from `levelGroups`, with the headline.
- Explain prompt for pairs shows the claim, the pair's shift, the biggest shift in the class, and the student's notes.

**Tests:** `apps/teaching/tests/unit/lab-notes.test.ts` (gating on and off for each step; the panel lists notes in step order), `lab-actions.test.js` (server refuses a completing action with an empty note when notes are on; accepts it when off; level grouping in the board payload).

Commit: `Lab lesson: lab notes and Name it`.

### Task 6: After class and marking (commit 6)

- `lab/after.ts`: shown on the board once the last step is passed. The class finding, predictions held, the level comparison (pairs), and the list of explanations. **Run it again** starts a fresh round; Past rounds uses `blocks/past-rounds.ts`.
- On first open it ensures one markbook assessment column for the lesson with `piece { lesson_id, block_id: 'lab_explain' }` (as `sprint/marking.ts` `ensureColumns` → `markbook.saveColumn`), so the answers appear in To mark.
- `marking/mark-piece.ts`: when the piece's block is `lab_explain`, fetch the student's lab record with teacher action `student` and show their notes, prediction and trial beside the answer.

**Tests:** `apps/teaching/tests/unit/lab-after.test.ts` (column created once, with the piece link; the finding text for each level), `tests/unit/to-mark.test.js` gains a lab case.

Commit: `Lab lesson: after class and marking`.

### Task 7: Walk it, gate it, ship it

- [ ] Start the Teaching preview and walk each level from Plan to After class at desktop and 390px, as the teacher and as two students in different pairs: publish, claim initials, every step, the board at every step, hand in, To mark, mark with notes beside the answer, Run it again, bring back a past round.
- [ ] Check the diff for full-suite triggers before the gate (nothing under grove, `packages/`, `apps/tasks`, the gate script or workflows). The generated `_shared/*.mjs` files and `teaching-ai-runtime.mjs` are expected.
- [ ] `npm run pre-pr-check` once. Fix what fails on this branch.
- [ ] Open one PR, ready for review, with invented names only in the title and body. Enable auto-merge (merge commit).
- [ ] After merge, walk the live hub, then remove the worktree.

Not covered by any of this: a real class, Safari, and whether the default thresholds suit real ratings.

## Self-review

- Every spec section maps to a task: levels and Plan card (1), steps and who reads what (2–4), look (2, 4), lab notes and Name it (5), data and marking (2, 6), edge cases (2: late join, early move-on; 3: held writing; 4: no change, thin data, same change twice), testing (each task, 7).
- Out of scope stays out: no Lab block, no student-posed questions, no counting labs, no AI.
- Risk to check first in Task 1: that a `question_set` block renders and hands in normally inside a player-type lesson's published snapshot. If it does not, the fallback is Sprint's route: store the explanation on the student's lab record and write a plain assessment column, and the answers are marked from the After class page with no To mark entry.
