# Gear Shifter Plan 6: Quick Start and Checks

> Tasks 1 to 8 ran in order, then Tasks 9 and 10 (Adam's two decisions, see As run). Each is test-first, leaves every suite green and ends with one commit. Task 8 runs the gate, marks PR #1047 ready and turns on auto-merge.

**Goal:** Gear Shifter gets its quick route, its checks and its PR. After this plan:

- **Quick start**, for one stalled task, from the landing page's card. A fixed flow as data (`packages/get-things-done/quick.mjs`), walked one box at a time by its own small coach:
  1. **What needs to move?** The opening message.
  2. **The first small, safe action.** Something that could be started today and would do no harm if it went nowhere.
  3. **How it starts.** The person picks one: **a countdown cue** (after The 5-Second Rule: the moment, then count down and move) or **one protected interval** (after The Pomodoro Technique: one block of time with a start and an end). Nothing runs a timer; the start is words (spec decision 7).
  4. **The cue, or the interval**, in their words.
  5. **The check-back point:** a date, which a card offers as a dated Tasks task, or a point in words ("after lunch"). There is no "no check": a check-back that never comes is one of the coach's traps.
  6. **What happened?** and **What next?** close the run.
- **The chart:** a short route in Gear Shifter's style. The first action is the target; once the start is picked, the dart (labelled with the countdown or the interval) flies into it. Below, the stations on a dotted cobalt line: the task, the action, how it starts, the cue, the check-back, then the two closing answers. The two ways to start can be picked on the chart.
- **It came back** adds a round at the first action, with the same task (the coach offers last round's action and start).
- **Go deeper** makes a full `shift` session seeded with the task (its opening message, so the need) and a `known` line (the first action, how it started, the check-back and what happened). The coach confirms each seed while framing. The full session shows the quick run, closed until opened, with a link back; its action record gains "Began as a Quick start".
- **The route is ours, not the book's.** The coach prompt says so and the coach never says otherwise; the chart's caption names the two techniques it borrows from.
- **The live coach evaluation:** invented cases in each of the five sections, Commit and Quick start, with a runner, a stub mode and a replay mode; the results go in As run.
- **Playwright** at 1280px and 390px on the mock API: the landing with the three-way skills ribbon; a whole session from frame through the route, a recommended technique, Commit with both confirm cards, the record on a linked page and Review; a Quick start to done; a Quick start to Go deeper.
- **The PR:** `npm run pre-pr-check`, PR #1047 ready for review with the whole build described, auto-merge (merge commit).

**Spec:** `docs/superpowers/specs/2026-10-22-get-things-done-design.md` ("Quick start", "Coach knowledge" (the `quick` payload), "Architecture", "Testing").
**Plans 1 to 5:** done (Plan 5 HEAD `18a37d92`).
**Model:** Decision Maker's Plan 7 (`2026-10-21-decision-maker-plan-7-quick-checks.md`) and its code: `packages/decision-book/quick.mjs`, `render/quick.ts`, `netlify/functions/_shared/problem-solver/quick-session.mjs`, `quick-prompts.mjs`, the service's `FLOWS` table, `apps/tasks/src/views/decision-book/quick-view.ts`, `scripts/decision-book-eval*.mjs` and `apps/tasks/tests/browser/decision-maker.spec.mjs`.
**Branch:** `claude/tender-mccarthy-a298ad`; PR #1047, the one PR for the whole build.

**Rules kept:**
- **Public repo:** no book text. The flow's labels, the coach's prompt, the chart's copy and every test, walk and evaluation case are our own words about invented work. The copy check covers `apps/tasks/src/views/get-things-done/`, so the page's copy is checked too.
- **Problem Solver and Decision Maker are unchanged for their users.** Their suites pass unedited. Decision Maker's `quick` kind, its state under `session.quick`, its `quick_*` actions and its schema checks are untouched: the schema accepts Quick start's boxes beside the quick decision's, and each kind's own check still refuses a box that is not its current one.
- **Palette:** paper `#fefdf6`, ink `#2a3340`, cobalt `#2b7de9`, vermilion `#ea4f2a`, amber `#f5a623` (the check-back and a done run); small text in the label or deep shades. No green.
- **UI failure register** (`docs/CURSOR-UI-FAILURES.md`): each UI task names the entries it checks.

**Design notes:**
- **The state sits under the kind's name.** The service's `FLOWS` table says a flow's state sits under its kind, so a `start` session keeps its run in `session.start` (type `GtStartState`), as a `quick` session keeps its in `session.quick`. The coach's reply carries it as `quick`, the spec's payload name, shared with Decision Maker.
- **Own actions:** `start_answer` (the start picked on the chart), `start_again` (It came back) and `start_check` (the check card). Decision Maker's `quick_*` actions refuse a `start` session and these refuse a `quick` one.
- **The check task is made by the page**, by Problem Solver's rule that the server never writes Tasks: the task is created, then linked with `start_check`; a retry reuses the created task.
- **Go deeper carries seeds, not answers.** `frameSeeds` (`from: 'start'`) holds the need and a `known` line. The opening message of the full session is the task, so the scripted coach records it as the need, as every shift does; the live coach shows the seeds and records only what the person confirms.
- **A start row** on the landing shows the dart-in-target mark instead of the medal, and its label says Quick start, Done or Went deeper.

---

### Task 1: Quick start as data

**Files:**
- Create: `packages/get-things-done/quick.mjs`
- Modify: `packages/problem-solver/types.ts` (`GtStartNodeId`, `GtStartEntry`, `GtStartState`, `GtStartSeeds`; `PsSession.start`; `frameSeeds` gains `GtStartSeeds`; `PsAction` gains the three actions)
- Test: `tests/unit/get-things-done-quick.test.js`

`quick.mjs` holds the flow and its pure transitions, as Decision Maker's does. A run's state is a path of entries; the last entry is the box waiting for an answer.
- **Boxes** (`START_NODES`): `task` (note, filled from the opening message), `action` (note), `how` (a choice: `countdown` or `interval`), `cue` (note; its label follows the choice: "The cue" or "The protected interval"), `check` (a date as `note`, which sets `check: { due, taskId: null, dismissed: false }`, or a point in words), `happened` and `next` (close).
- **`START_WAYS`:** each way's label, line and the technique it is after (`gt_five_second_rule`, `gt_pomodoro`).
- **Readers:** `currentEntry`, `taskOf`, `latestNote(state, node, round?)`, `wayOf(state, round?)`, `checkPointOf(state)`.
- **`applyStep(state, step, at)`** throws `stale_node` or `invalid_answer` as Decision Maker's does; answering What next? finishes the run.
- **`again(state, at)`** on a finished run starts round n+1 at `action`; **`startSeeds(state)`** gives `{ from: 'start', need, known, action, way, cue }`.

**Tests first:** the run opens at `action` with the task filled; a note box refuses no words; `how` refuses anything but the two ways; the cue's label follows the way; a dated check-back sets the check, words do not, and nothing is refused; What next? finishes; a stale box is refused; It came back starts round 2 at the action with the task kept and round 1 readable; the seeds' known line names the action, the way, the cue, the check-back and what happened.

**Commit:** "Gear Shifter: Quick start as data".

### Task 2: Server: the start session, its actions and Go deeper

**Files:**
- Create: `netlify/functions/_shared/problem-solver/start-session.mjs`: `createStartSession` (kind `start`, phase `start`), `applyStartTurn`, `startAnswer` (the way picked on the chart; a moved-on box is a 409), `startAgain`, `startCheck`, `escalateStart` (a full `shift` session with `escalatedFrom` and `frameSeeds`, the run marked gone deeper and finished).
- Modify: `service.mjs`: `start` joins `FLOWS`; `start_answer`, `start_again` and `start_check` join `ACTIONS`.
- Modify: `session.mjs` `summaryRow`: `escalatedTo` also reads `session.start`.
- Modify: `coach-schema.mjs`: a `quick` step may name a Quick start box and carry `countdown` or `interval` as its answer.
- Modify: `scripted-coach.mjs`: `startTurn` walks the flow by rule (`countdown`/`interval` words, a date or a few words at the check-back, `go deeper`).
- Modify: `netlify/functions/get-things-done.mjs` and `apps/tasks/scripts/mock-api.ts`: `kinds: ['shift', 'start']`.

**Tests first** (`tests/unit/get-things-done-start-session.test.js`): create through the service with `kind: 'start'`; a coach turn's step lands and a stale one is dropped with the turn kept; `start_answer` takes a way and refuses a moved-on box; It came back only on a finished run; the check card links a task or is set aside; Go deeper writes a shift session seeded from the run, replays by request id, and refuses a second time; Decision Maker's quick actions refuse a start session; the scripted coach walks a run to done and offers Go deeper on "go deeper"; Decision Maker's endpoint still refuses `start`.

**Commit:** "Gear Shifter: the start session, its actions and Go deeper".

### Task 3: The Quick start coach, seeds and the record

**Files:**
- Create: `netlify/functions/_shared/problem-solver/start-prompts.mjs`: `START_RUBRIC` (voice, how the flow works, the two ways and what each is after, traps: an action too big for today, a start that needs a timer from the app, a vague cue, no check-back; when to offer a full session: a project rather than a task, other people, a second round; **the route is Gear Shifter's own design and the coach never presents it as the book's**), `START_INTENTS`, `buildStartPrompt`, `checkStartTurn` (the step must answer the current box in its own form).
- Modify: `coach.mjs`: `PROMPTS.start`.
- Modify: `get-things-done-prompts.mjs`: a shift carried from a Quick start shows its seeds while framing ("seeds, not answers"), then a line on where it came from.
- Modify: `packages/get-things-done/record.mjs`: "Began as a Quick start" (the first action, how it started) when the session came from one.

**Tests first** (`tests/unit/get-things-done-start-prompts.test.js`): the prompt names the current box, what to do there and next; round 2 offers last round's action; the rubric says the route is not the book's; `checkStartTurn` refuses a step for another box, a choice without a way and a note box without words, and keeps an escalate only while the run has not gone deeper; the model coach reads a start reply; a seeded shift's frame prompt shows the seeds, then the came-from line; the record gains its section only for a seeded session.

**Commit:** "Gear Shifter: the Quick start coach, its seeds and the record line".

### Task 4: The Quick start chart

**Files:**
- Create: `packages/get-things-done/render/quick.ts`: `createStartView(doc, { onPick? })`: the hit (target with the first action; the dart once a way is picked, with five ticks for a countdown or an arc for an interval) and the stations on a dotted line, each with its label and answer; the station waiting for an answer is marked `data-now`; with `onPick`, the `how` station carries two buttons ("Countdown cue", "Protected interval"); earlier rounds are summed up in a line; `checkPointText`.
- Modify: `packages/get-things-done/get-things-done.css`: `.gt-qs` rules under `.gt-scope`; no label under 11px; one column at 390px.

**Tests first** (`apps/tasks/tests/unit/get-things-done-quick.test.ts`): the stations come in flow order with their answers; the dart appears only once a way is picked and its label says which; the pick buttons show only on `how` with `onPick`, are labelled, and lock once pressed; a dated check-back reads in words; round 2 says how round 1 went.

**UI register:** label size floor, text-labelled states (`data-now` has a visible "Now" word), decorative SVG `aria-hidden`, phone reflow.
**Commit:** "Gear Shifter: the Quick start chart".

### Task 5: The Quick start pages

**Files:**
- Create: `apps/tasks/src/views/get-things-done/quick-view.ts`: `mountStartPage` (the chart, the check card, It came back, Go deeper, the coach panel with `GT_LOOK`, the "This went on to a full session" link) and `mountFromStart` (the closed panel on a full session).
- Modify: `view.ts`: `quickCard()` becomes the real card (input "Describe the stalled task", Go → `create({ kind: 'start' })`); a start row's mark and label; `renderStartSession` (every action through the session sync; the check task made by the page); a session with `escalatedFrom` shows `mountFromStart`.
- Modify: `apps/tasks/src/views/problem-solver/api.ts`: `create` accepts `kind: 'start'`.
- Modify: `get-things-done-view.css`: the page layout; GT_LOOK gains the start frame look if the coach panel needs it.

**Tests first** (`get-things-done-quick.test.ts`, `get-things-done-landing.test.ts`): the page shows the chart, hides It came back until the run is done, hides the actions once gone deeper and links the full session; a chart pick calls `onPick`; the check card offers the date and hides once linked or set aside; the landing's card creates a start session, and a start row reads Quick start, Done or Went deeper; the from-panel loads the run once opened and offers a retry on failure.

**UI register:** I2 (picks are buttons), I3 (empty and loading states), V1 (`[hidden]` rules), R2 (no page scroll at 390), D5 (dates in words), P4 (the "not open yet" line is gone).
**Commit:** "Gear Shifter: the Quick start pages".

### Task 6: The live coach evaluation

**Files:**
- Create: `scripts/get-things-done-eval-cases.mjs`: invented situations, each built to the point the coach answers:
  - **Discern, one per section** (before, doing, others, differently, after): a framed shift; the answer is what is known; a good reply accepts, suggests a `gt_` technique and names a sibling it passed over.
  - **Frame:** a vague need is challenged, not accepted.
  - **Commit:** a next action too big for today, and a check-back with no date, are challenged.
  - **Quick start:** a first action is recorded and the start asked; a "set me a timer" start is not taken as a way; a task that is really a project is offered Go deeper; asked whether the route is the book's, the coach says it is not.
- Create: `scripts/get-things-done-eval.mjs`: the runner. `GT_EVAL_STUB=1` swaps in a stub reply; `GT_EVAL_REPLIES=<file>` replays raw replies by case name through the real reply pipeline (parse, repair-free); otherwise it calls the model with `ANTHROPIC_API_KEY`.
- Test: `tests/unit/get-things-done-eval-cases.test.js`: every case builds with the answer last, at the right phase or box; the judge's checks pass and fail as they should.

**Run:** the stub run first; then the live run, which needs `ANTHROPIC_API_KEY`. Record each case's verdict in As run. Failures are prompt work: fix in this plan when small and clear, else list them for Adam.
**Commit:** "Gear Shifter: the live coach evaluation".

### Task 7: Playwright at both widths

**Files:**
- Create: `apps/tasks/tests/browser/gear-shifter.spec.mjs`, at 1280px and 390px on the mock API, with no horizontal scroll checked at every stage:
  - **the landing:** hero, Quick start, the five sections and the three-way skills ribbon (Gear Shifter, Decision Maker, Problem Solver);
  - **a whole session:** the need, a route answer that lights the route, what is known; the recommended technique started from its card and worked to its minimum; Commit: the experiment's six slots, the next action's task card and the check-back's review card both confirmed; the action record written to a new project page (image, heading); the learning question answered; Review now opens the experiment review;
  - **a Quick start to done:** the first action, a start picked on the chart, the cue, a dated check-back made into a task, What happened? and What next?, then It came back;
  - **a Quick start to Go deeper:** the full session opens framed from the task, shows the quick run's panel with a link back, and both rows say so on the landing.

Selectors from Plan 5's walk: `Describe what needs to move`, `Your answer`, `.ps-suggestion`, `.ps-taskcard`, `.ps-reviewcard`, `.ps-casefilecard` ("Write action record"), `.gt-stage-links button`, `.gt-session-shelf__pick`. Plan 5's open question stands: the walk answers the learning question before Review now.

**Check:** `cd apps/tasks && npx playwright test tests/browser/gear-shifter.spec.mjs`, then Decision Maker's and Problem Solver's specs unchanged.
**Commit:** "Gear Shifter: Playwright walks at both widths".

### Task 8: The gate and the PR

- Merge `origin/main` if it has moved; rerun the generators it needs (`node scripts/generate-alchemy-schema.mjs`, `node scripts/generate-block-css.mjs`) when their sources changed.
- `npm run pre-pr-check` (exit 0) and `node scripts/book-pack/copy-check.mjs ../life-hub-data/book-packs/get-things-done`.
- As run here; the plan set's table reads Plan 6 Done.
- Push; PR #1047's description covers the whole build; mark it ready; enable auto-merge (merge commit).

**Adam's two decisions** (22 Oct, after the plan was written; see As run) became Tasks 9 and 10: Review now waits for the learning question, and all three skills ribbons show all three tools.

---

## As run (22 Oct)

- Every task ran test-first and ended with a commit, plus one prompt fix from the evaluation. Tests added: 7 flow tests (`get-things-done-quick.test.js`), 6 server tests (`get-things-done-start-session.test.js`), 7 prompt, seed and record tests (`get-things-done-start-prompts.test.js`), 2 evaluation-case tests (`get-things-done-eval-cases.test.js`), 11 chart and page tests (`apps/tasks/tests/unit/get-things-done-quick.test.ts`), 2 landing tests, and 8 Playwright walks (`gear-shifter.spec.mjs`). One Gear Shifter test was widened: the endpoint's kinds are now `['shift', 'start']`. Problem Solver's and Decision Maker's suites pass unedited, and their Playwright walks pass (22).
- **Shared code touched, behaviour unchanged for the other tools:** the service's `FLOWS` table and actions gain `start`; the handler and the mock API run a Quick start's full session's first turn on Go deeper (`session.start?.escalatedTo`); the coach schema accepts Quick start's boxes beside the quick decision's (a way is kept only at `how`, which is not a Decision Maker box); the coach panel treats `start` as a fixed flow, as it does `lightning` and `quick`; `summaryRow`'s `escalatedTo` also reads `session.start`. Decision Maker's mock path is as it was.
- **The copy check** now also covers the Quick start rubric, its intents, the flow's labels and ways, and the chart's file (`packages/get-things-done/render/quick.ts`). `node scripts/book-pack/copy-check.mjs ../life-hub-data/book-packs/get-things-done`: no copied runs.
- **Browser check** (Playwright on the mock API, Chromium at 1280px and 390px, no horizontal scroll at any stage, with screenshots looked at): the landing (Quick start card, five sections, three-way ribbon); a whole session (framed on "others", Appreciation recommended and worked, Commit's six slots, the task card and the check-back card confirmed, the action record on a new project page with its image and heading, the learning question answered, Review now opening the review); a Quick start (first action, the protected interval picked on the chart, the cue, a dated check-back made into a `gear_shifter` task due 5 Nov, What happened? and What next?, It came back to round 2); Go deeper (the full shift opens with the task as its need and the seeds from `start`, the closed "Began as a Quick start" panel with a link back, both rows on the landing). The walk found two things, fixed in its commit: the mock API did not run the full session's first turn (the real handler does), and the read-only chart on a full session asked the reader to "pick how it starts"; it now says "No start was picked."
- **UI register entries checked:** V1 (every new `[hidden]` part has a `display: none` rule), R2 (no page scroll at 390), I2 (the two ways are `<button>`s with labels naming the way, 44px high), I3 (the read-only panel's loading and failure states, with a retry), D5 (the check-back as a date in words), M1 (the dart's flight eases in once and is still under reduced motion), P4 (the "Not open yet" line is gone).

### The coach evaluation

`ANTHROPIC_API_KEY` was not available in this container during the build, so the live run came after the merge (see The live run, below; run it with `ANTHROPIC_API_KEY=… node scripts/get-things-done-eval.mjs`). The stub run checks the runner (4/12 pass, as a stub should). In its place, a proxy run: each case's real prompt (`GT_EVAL_PROMPTS`) was answered by a separate model instance given only that prompt, and the replies were replayed through the real reply pipeline (`GT_EVAL_REPLIES`: parse, checks, word limit). This tests the prompts and the pipeline, not the production model.

| Case | Result |
| --- | --- |
| Frame: a vague need is challenged | Pass: challenged, asked for the one piece that matters |
| Discern, before you start | Pass: To-Do List, passed over Budgeting |
| Discern, doing it | Pass: The 5-Second Rule, passed over Procrastination |
| Discern, with others | Pass: Radical Transparency, passed over Appreciation |
| Discern, changing course | Pass: Kotter's model, passed over Structured Evaluation |
| Discern, after it is done | Pass: Project Evaluation, passed over the Transactional Model |
| Commit: a next action too big | Pass: challenged, asked for the smallest piece before tonight |
| Commit: a check-back with no date | **Failed first:** the challenge carried a non-date node in `check_back`, which the tool refuses, costing a repair. Fixed: the Commit layer and the repair now say to set node to null and ask for a date. Rerun: pass |
| Quick: records the first action | Pass: `action` recorded, both ways offered |
| Quick: a timer from the app | Pass: said it runs no timer, did not settle `how` |
| Quick: a whole project | Pass: offered Go deeper, with one small piece as the alternative |
| Quick: the route is not the book's | Pass: "this route is Gear Shifter's own, built from two of the book's techniques" |

12/12 after the fix. The stand-in tended to open with a skill compliment ("which shows analysis") on discernment; that is the shared voice's skill-naming rule, not flattery, and the judge does not count it.

### The live run (22 Oct, after the merge)

Adam supplied a short-lived key, so the cases then ran against the production coach (`createModelCoach(anthropicModel(env))`).

- **First live run: 7/12.** Every Quick start case (4), both Commit cases and the vague need passed. **All five discernment cases failed:** the coach accepted the last frame answer but recommended no technique (three), challenged a clear answer (one), or lost the thread (one). The proxy run had missed this.
- **Fix 1** (`get-things-done-prompts.mjs`): when one frame answer is left, the turn now carries a LAST FRAME ANSWER line: settling it is the moment to name the obstacle and recommend one technique with `next_technique`, naming a sibling passed over. The rubric said so; the turn did not. After it, every discernment case recommended a Gear Shifter technique.
- **Fix 2:** the same line now says the message must name both techniques by name, never by id (one reply had written `gt_radical_transparency` in prose, and several left the sibling out because the card shows the recommendation).
- **The judge was too strict twice**, and was loosened with a test each: a name without its trailing "technique" or "model" counts ("Pomodoro"), and Kotter's 8-Step Model of Change counts as "Kotter". The cases' route answers are now a sentence a person might say, not the bare station id.
- **After the fixes, four full runs: 10, 11, 10 and 10 of 12.** Quick start, Commit and the vague need passed every time. What is left is variance in discernment: now and then the message still leaves out the sibling, and once the coach asked one more question about a team meeting instead of discerning, which is defensible coaching. Further prompt work on this is a choice for Adam, not a defect that blocks anything.

### Adam's two decisions (22 Oct), built as Tasks 9 and 10

Plan 5 left two questions for Adam. He left the call to the Plan 5 session ("whatever you think is best"), which decided both and sent them here; each was built test-first with its own commit.

- **Task 9: Review now waits for the learning question.** While `pendingLearning` is set, `start_review` refuses with a 409 ("Answer the coach’s question first, then start the review.") and the review panel holds Review now with that note. It is in the shared engine and panel, so it also fixes Decision Maker's identical bug. Tests: `tests/unit/review-waits-for-learning.test.js` (2) and a panel test in `problem-solver-review-panel.test.ts`; Problem Solver's and Decision Maker's unit tests pass unedited. Decision Maker's Playwright walk pressed Review now with the question pending (the old behaviour), so it now answers first and checks the held button, as Gear Shifter's walk does.
- **Task 10: all three skills ribbons show all three tools.** Problem Solver's and Decision Maker's landings give Gear Shifter its share with the ribbon's list form, each extra list failing soft, and say "One tally across all three tools." Each page keeps its own colour; Gear Shifter's share is drawn in its ink on Problem Solver's page and its cobalt on Decision Maker's. Tests: `apps/tasks/tests/unit/skills-ribbon-three-ways.test.ts` (3). No existing ribbon test changed: the one asserting a two-tool legend calls the component directly, which is unchanged.
