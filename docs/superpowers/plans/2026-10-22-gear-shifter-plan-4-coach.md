# Gear Shifter Plan 4: Coach, Commit, Record and Review

> Steps use checkbox (`- [ ]`) syntax. Tasks run in order; each is test-first and ends with one commit. Run from the life-hub root. In a fresh container run `npm ci` at the root and in `apps/tasks` first, and clone the private `life-hub-data` beside this repo so the copy check can run.

**Goal:** give a `shift` session its own coach and the rest of its server-side flow. Until now a live `shift` turn has been coached with Problem Solver's full prompt. After this plan:

- **The Gear Shifter rubric** (cached, the same for every turn) reuses `prompts-shared.mjs` (voice, thinking skills, gatekeeping, output) and adds the book's stance in our words, the route and how to place work on it, the obstacle names, the session shape (frame, discern, work the technique, another angle, Commit, Record, Review), the traps to challenge, and one catalogue line per technique.
- **Catalogue lines:** id, name, section and station, worksheet or lens, "use it when", the book's see also and our pairs well, kept apart.
- **Per-technique notes** form a third cached layer sent only for the active technique: steps, slot meanings (with tags), link kinds, the minimum, watch-fors, the exercise, the merged entries it carries, the variant's own columns or stopping rule, and Getting a Project Done's station tools.
- **Discernment:** on the last frame answer the coach names the obstacle (one of six names) and recommends one technique with `next_technique`, one sentence on why, naming a sibling it passed over; Getting a Project Done when the whole project needs attention. At the minimum it offers **another angle** (the book's see also first, then ours, Gear Shifter techniques only) or Commit.
- **Schema:** `next_technique` is an alias of `next_tool`, limited to Gear Shifter tools. The frame keys `need`, `route` and `known` exist since Plan 1. The `quick` payload moves to Plan 6, with Quick start.
- **`gt_commit`** (step `'commit'`, not `'settle'`): the result that matters; the technique it rests on, with the chart nodes it uses (kept on the session as `basis`, as a Decision Maker reason's are); the next action; when it starts (a cue or protected time, as text); the check-back date; what would tell you to change course. The next action becomes a task card and the check-back date the review card.
- **The action record** composes from the session, never from coach free text: sections, a provenance (main technique, its section, the caption "Worked with The Get Things Done Book · <technique> · <date>") and write, update and graphic-retry offers. The page writes it through Decision Maker's `link_case_file` action.
- **Review:** moving on from Commit waits for the check-back date; Review now starts it early. It works **`gt_review`** (what changed, what it cost, what to keep), or **Project Evaluation** for a finished project, on `reviewState` and `review.mjs` unchanged. What happened joins the record and offers a dated update.
- **Scripted coach:** a `shift` session's own turns (discern, another angle, Commit, the check-back date, Review); its Kanban placement reads the variant's own `nodeTags.card`.

**Not in this plan:** the client (landing, session, route, medal, track, shelf, the commit and review charts, the provenance graphic on the page, the confirm cards and the mock API route) is Plan 5. Quick start and its `quick` payload are Plan 6.

**Spec:** `docs/superpowers/specs/2026-10-22-get-things-done-design.md` ("Experience" steps 2 and 4 to 7, "Coach knowledge", "Architecture"). The spec's "`gt_commit`, `step: 'settle'`" is corrected to `'commit'` (Task 9), as Plan 1 planned Commit by its own step.
**Model followed:** Decision Maker Plans 4 and 5 (`decision-prompts.mjs`, `knowledge/decision-book.mjs`, `packages/decision-book/record.mjs`, `tools/record.mjs`).

## Decisions taken against the real code

1. **One register for the record tool.** `session.mjs` and `coach.mjs` test `run.tool === RECORD_ID` for a reason's basis and the review date. `books.mjs` gains a `record` entry per book: `{ tool, basisSlot, dateSlot, dateReason }` (Decision Maker: `dm_record`, `reason`, `review`; Gear Shifter: `gt_commit`, `rests_on`, `check_back`). The engine reads it. Decision Maker's behaviour is unchanged (its tests stay green as written).
2. **The basis helpers are shared.** `basisCandidates`, `resolveBasis`, `basisOf` and `mainModel` in `packages/decision-book/record.mjs` already read only the Explore step, which both books have, so Gear Shifter imports them. The offer logic (write, update, graphic retry) moves into an exported `offerFor(session, file, provenance)` that both `recordOffer` and Gear Shifter's `actionOffer` call.
3. **Review has two tools.** `gt_review` (new, step `'review'`, three slots in order) is the default experiment review; `gt_project_evaluation` stays `REVIEW_TOOL` for a finished project. The plan's Review step names both, so it has no default and the coach chooses. Neither is a catalogue entry, so neither is on the shelf.
4. **`gt_commit` and `gt_review` are registered beside the techniques**, after `GEAR_TOOLS` in `problem-solver/tools/index.mjs`, but not in `GEAR_TOOLS` (the shelf and the technique render tests read `GEAR_TOOLS`). Their steps, `commit` and `review`, are not toolkit steps, so Problem Solver never lists them; Decision Maker's steps name their own tools.
5. **Technique `kind`.** Family-built techniques keep the factories' default `kind: 'decision'`. The engine reads a tool's `kind` only inside Problem Solver's Define (`followOn`), which a `shift` session never enters, so Gear Shifter does not need its own. `gt_commit` is `kind: 'record'` like `dm_record`; `gt_review` is `kind: 'review'`.
6. **`next_technique` accepts any registered `gt_` tool** (techniques, `gt_commit`, `gt_review`); the step check in `coach.mjs` then keeps a suggestion to the current step's tools. `next_model` stays Decision Maker's, and refuses `gt_` ids.
7. **Another angle stays in Gear Shifter.** Some `seeAlso`/`pairsWell` links name Problem Solver or Decision Maker tools (`smart`, `kanban`, `dm_rumsfeld` …). The catalogue lines show them as written, but another angle offers only Gear Shifter techniques, the only ones a `shift` Explore can open.
8. **The obstacle is named in the message only.** The spec has the coach name it in a few words; nothing reads it back, so it is not stored. The six names are fixed in the rubric.
9. **The record's date** is the day the experiment was set: when the check-back date was accepted (else the session's last change). The caption names the main technique (the one the rests-on basis cites most, else the first worked), as the spec words it.

## Files

| File | Change |
| --- | --- |
| `netlify/functions/_shared/problem-solver/knowledge/get-things-done.mjs` | New: stance, route guide, obstacles, traps, catalogue lines, technique notes, another angle |
| `netlify/functions/_shared/problem-solver/get-things-done-prompts.mjs` | New: `GEAR_RUBRIC`, the step layers and `buildGearPrompt` |
| `netlify/functions/_shared/problem-solver/coach.mjs` | `shift` routes to `buildGearPrompt`; the basis rule reads the book's record entry |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `next_technique` |
| `packages/get-things-done/commit-slots.mjs` | New: `COMMIT_ID`, `COMMIT_SLOTS`, `EXPERIMENT_REVIEW_ID`, `EXPERIMENT_REVIEW_SLOTS` |
| `packages/get-things-done/tools/commit.mjs`, `tools/review.mjs` | New: `gt_commit`, `gt_review` |
| `packages/problem-solver/tools/index.mjs` | Registers both |
| `packages/problem-solver/steps.mjs` | Review names `gt_review` and Project Evaluation |
| `packages/problem-solver/books.mjs` | The `record` entry per book |
| `packages/decision-book/record.mjs` | `offerFor` exported; `recordOffer` uses it (unchanged behaviour) |
| `packages/get-things-done/record.mjs` | New: `commitSource`, `composeActionRecord`, `actionProvenance`, `actionOffer` |
| `netlify/functions/_shared/problem-solver/session.mjs` | Record placement, `keepsRecord`, the graphic flag and the row's `main` read the register |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | `shiftTurn`; Kanban reads `nodeTags.card` |
| `scripts/book-pack/copy-check.mjs` | The coach knowledge and the two new tools join the shipped strings |
| Tests | `tests/unit/get-things-done-prompts.test.js`, `get-things-done-commit.test.js`, `get-things-done-record.test.js`, `get-things-done-scripted.test.js` (new); `get-things-done-steps.test.js`, `get-things-done-copy.test.js` (extended) |

---

### Task 1: Coach knowledge

**Files:** create `knowledge/get-things-done.mjs`; test `tests/unit/get-things-done-prompts.test.js`.

- [ ] **Step 1: Write the failing tests**
  - `STANCE`, `ROUTE_GUIDE` (every `ROUTE` id and label, "one id, or two joined with +"), `OBSTACLES` (six: `no_priority`, `avoided_start`, `broken_attention`, `too_little_capacity`, `other_people`, `worn_out_energy`, each with a name and the stations and techniques to look at first, every technique a catalogue id) and `GEAR_TRAPS` (the spec's seven traps, each naming a thinking skill id).
  - `catalogueLines()` has one line per catalogue entry, in order; each starts `- <id> (<name>) [<station>, <tier>]: <when>`; the book's see also and our pairs well are labelled apart and never merged.
  - `techniqueNote(id)` for every catalogue entry: name and id, the lens or worksheet rule, `Use it when`, every step title, every slot (with tags), `Watch for`, the minimum line, and the exercise when there is one. Rapid Prototyping's, Motivation's and Project Evaluation's notes name the entry they carry (New Work, The Matthew Effect, The Myth of Achievement). Kanban's note names its columns To do, Doing and Done and its suggested limit of three; 5 Whys' says five is a guide. Getting a Project Done's note lists each station with its tools. Unknown ids return null.
  - `anotherAngle(id, done)`: see also first, then ours, without repeats, the technique itself or ones done, and only Gear Shifter techniques (Getting a Project Done's `pairsWell: ['smart']` gives nothing from ours).
- [ ] **Step 2: Run** `node --test tests/unit/get-things-done-prompts.test.js`; expect failures (no module).
- [ ] **Step 3: Write the module.** Everything in our own words; lines built from `CATALOGUE`, `SECTIONS`, `ROUTE` and the registered tools. The minimum line reads the chart config (`minEntries`, `minGroups`, `minItems`, `minCells`, `minRounds`, every stage of a path), the variants' own options (`suggestedWip`, `minWhys`), and always ends "the state says MINIMUM MET when it is reached".
- [ ] **Step 4: Run** the test; expect PASS.
- [ ] **Step 5: Commit** "Gear Shifter: the coach's knowledge".

### Task 2: The prompt and its routing

**Files:** create `get-things-done-prompts.mjs`; modify `coach.mjs`; extend the prompts test.

- [ ] **Step 1: Failing tests**
  - `GEAR_RUBRIC` contains `VOICE`, `THINKING_SKILLS` and `GATEKEEPING` verbatim, the stance, route guide, obstacles, traps, a session shape naming Discern, Another angle, Commit and Review, every catalogue line, and an output block whose frame keys are `need`, `route` and `known` and whose suggestion kinds are `next_technique|switch_tool|next_step`.
  - Problem Solver's `RUBRIC` keeps its hash; neither Problem Solver's rubric nor `DECISION_RUBRIC` names a `gt_` id.
  - Framing: two cached layers, the missing frame answers in the turn, no technique note. A shelf pick names its technique.
  - In a technique: a third cached layer with its note; the turn names the active technique, placed nodes, open slots and progress. At the minimum the turn carries `ANOTHER ANGLE` from `anotherAngle` "or next_step to Commit".
  - In Commit: the step layer names `gt_commit`, its slots in order and the rules (rests on placed nodes; next action small enough to start; start as a cue or protected time, never a timer; check-back after today; a change-course sign someone could notice). The turn lists `RESTS ON CAN USE` from the Explore nodes.
  - In Review: the waiting line; in a review, the layer names `gt_review` and Project Evaluation and when each fits.
  - `createModelCoach` sends a `shift` session's prompt through `buildGearPrompt` (its first system layer is `GEAR_RUBRIC`), a `decision` session's through `buildDecisionPrompt` and a full one's through `buildCoachPrompt`.
- [ ] **Step 2: Run**; expect failures.
- [ ] **Step 3: Write `get-things-done-prompts.mjs`** after `decision-prompts.mjs`: the same three layers and turn state, with the route labels in place of the compass, `RESTS ON CAN USE` in place of reasons, the action record's lines, and the boundary line asking "what did you learn about how you get things done?". Add `shift: { build: buildGearPrompt, read: parse }` to `PROMPTS` in `coach.mjs`.
- [ ] **Step 4: Run** the prompts tests plus `problem-solver-prompts`, `decision-book-prompts` and `problem-solver-coach`; expect PASS.
- [ ] **Step 5: Commit** "Gear Shifter: its own coach prompt".

### Task 3: `next_technique`

**Files:** `coach-schema.mjs`; test in the prompts file.

- [ ] **Step 1: Failing test:** `next_technique` with `gt_pomodoro` validates to `{ kind: 'next_tool', tool: 'gt_pomodoro' }`; with `dm_eisenhower`, `kanban` or an unknown id it fails; `next_model` with `gt_pomodoro` still fails.
- [ ] **Step 2: Run**; expect failure.
- [ ] **Step 3:** in `suggestionOf`, `next_technique` accepts a registered tool whose id starts `gt_`.
- [ ] **Step 4: Run** with `problem-solver-coach-schema`; PASS.
- [ ] **Step 5: Commit** "Gear Shifter: next_technique".

### Task 4: `gt_commit`, `gt_review` and the Review step

**Files:** create `commit-slots.mjs`, `tools/commit.mjs`, `tools/review.mjs`; modify `tools/index.mjs`, `steps.mjs`, `books.mjs`, `session.mjs`, `coach.mjs`; test `tests/unit/get-things-done-commit.test.js`; extend `get-things-done-steps.test.js`.

- [ ] **Step 1: Failing tests**
  - Commit lists only `gt_commit`, its default; Review lists `gt_review` and `gt_project_evaluation` with no default; Explore lists neither; no toolkit step and no Decision Maker step lists them; `gt_commit.step === 'commit'`.
  - `gt_commit` takes its slots in order (`result`, `rests_on`, `next_action`, `start`, `check_back`, `change_course`), refuses a check-back that is not a real `YYYY-MM-DD` date, completes with all six, and lets only `next_action` become a task.
  - `gt_review` takes `changed`, `cost`, `keep` in order and completes with all three.
  - `BOOK_KINDS.decision.record` and `BOOK_KINDS.shift.record` name their tool, basis slot and date slot.
  - Session: an accepted `rests_on` keeps the Explore nodes it names as `basis`; an accepted check-back after today becomes the review proposal ("The check-back date set in the experiment."); one not after today proposes nothing; a next action proposed with `proposeTasks` becomes a task card.
  - Coach: an accepted `rests_on` with no basis, when Explore placed something, is sent back for repair; a basis on any other slot is dropped.
- [ ] **Step 2: Run**; expect failures.
- [ ] **Step 3: Implement.** `gt_commit` follows `dmRecord` (`kind: 'record'`, `family: 'commit'`, `tier: 'worksheet'`, `validateNode` with `isRecordDate`, `taskSlots: { next_action }`). `gt_review` is the same shape with `family: 'review'`. Register both after `...GEAR_TOOLS`. Review's plan step names `[EXPERIMENT_REVIEW_ID, REVIEW_TOOL]`. `recordPlaced` and `withBasis` read `bookOf(session.kind)?.record`.
- [ ] **Step 4: Run** the new tests and every `decision-book-*`, `get-things-done-*` and `problem-solver-*` unit test; PASS.
- [ ] **Step 5: Commit** "Gear Shifter: Commit and the experiment review".

### Task 5: The action record

**Files:** create `packages/get-things-done/record.mjs`; modify `packages/decision-book/record.mjs`, `session.mjs`; test `tests/unit/get-things-done-record.test.js`.

- [ ] **Step 1: Failing tests**
  - `commitSource` is the latest complete, kept `gt_commit`; null before.
  - `composeActionRecord` is built from nodes and the frame only (a coach message's words never appear): title `Action record: <session title>`, sections in order `result`, `rests_on` (the technique and the nodes its basis names), `next_action`, `start`, `check_back` (in words: "5 November 2026"), `change_course`, `need`, `known`, `techniques` (part done marked), `outcome` (from `gt_review` or Project Evaluation once Review has one), `learnings`; empty sections left out.
  - `actionProvenance`: the main technique, its section key, the techniques worked, the date the check-back was accepted, and the caption `Worked with The Get Things Done Book · <technique> · <date in words>`.
  - `actionOffer`: write, then nothing once linked, a graphic retry when the graphic failed, a dated update once Review adds what happened; nothing during a review or for another kind.
  - `recordOffer` behaves as before for a decision (the existing Decision Maker tests), and returns null for a `shift`.
  - `linkCaseFile` accepts a `shift` record with its `graphic` flag; `summaryRow` of a `shift` carries `main`.
- [ ] **Step 2: Run**; expect failures.
- [ ] **Step 3: Implement.** Export `offerFor` from Decision Maker's record module; `keepsRecord`, the graphic flag and the row's `main` read `bookOf(kind)?.record`.
- [ ] **Step 4: Run** with `decision-book-decide`; PASS.
- [ ] **Step 5: Commit** "Gear Shifter: the action record".

### Task 6: Record and Review in the prompt

**Files:** `get-things-done-prompts.mjs`; extend the prompts test.

- [ ] **Step 1: Failing tests:** with a complete commit the turn says `ACTION RECORD: ready to write` and never claims it is written; once linked, `ACTION RECORD: v1 written <date>`, and after Review `Changed since: What happened … update v2`. `TASKS FROM THIS EXPERIMENT` shows the next action's status and `CHECK-BACK` its card. `REVIEW IS WAITING` while it waits, with no technique suggested.
- [ ] **Step 2–4:** add the lines (from `actionOffer`, `session.caseFile`, `taskLines`, `reviewLines`); run; PASS.
- [ ] **Step 5: Commit** "Gear Shifter: the record and Review in the coach's view".

### Task 7: The scripted coach

**Files:** `scripted-coach.mjs`; test `tests/unit/get-things-done-scripted.test.js`.

- [ ] **Step 1: Failing tests**
  - A `shift` session framed through the scripted coach is offered a technique as `next_tool` (read through the schema from `next_technique`).
  - Explore with no technique open suggests one; `another angle` at the minimum suggests the book's see also, then ours, from Gear Shifter only, else Commit; before the minimum it says to finish first; `commit` suggests moving on.
  - On Gear Shifter's Kanban, `doing: Draft the methods section` places a card tagged `doing`; `review: …` is not a column there, so it is not placed as a card. Problem Solver's Kanban still takes `review:`.
  - Commit: the answers fill the slots in order; `rests_on` carries a basis; a check-back without a date is asked again; a dated one completes the review card.
  - Moving on from Commit waits for the check-back; Review now opens on `gt_review` with the task counts; an answer naming a finished project opens Project Evaluation instead.
  - One scripted walk from frame to a reviewed experiment, ending with an `update` offer.
- [ ] **Step 2: Run**; expect failures.
- [ ] **Step 3: Implement** `shiftTurn` after `decisionTurn`, and the Kanban placement through `TOOLS[run.tool].nodeTags?.card`. Problem Solver's and Decision Maker's scripted tests stay as they are.
- [ ] **Step 4: Run** with `problem-solver-scripted` and `decision-book-scripted`; PASS.
- [ ] **Step 5: Commit** "Gear Shifter: the scripted coach".

### Task 8: The copy check covers the coach

**Files:** `scripts/book-pack/copy-check.mjs`; extend `get-things-done-copy.test.js`.

- [ ] **Step 1:** the shipped strings also include `knowledge` (stance, route guide, obstacles, traps), `rubric`, `gt_commit` and `gt_review`. Test that those sources are present.
- [ ] **Step 2:** run `node scripts/book-pack/copy-check.mjs ../life-hub-data/book-packs/get-things-done`; expect "No copied runs."
- [ ] **Step 3: Commit** "Gear Shifter: the copy check covers the coach".

### Task 9: As run

- [ ] The spec's Commit line says `step: 'commit'`.
- [ ] Add "As run" below, and set the plan set's row for Plan 4 to **Done**, Plan 5 **Next**.
- [ ] `npm run pre-pr-check` exits 0; push; stop for Adam before Plan 5.

## Notes for Plan 5

- The canvas map needs charts for `gt_commit` (`family: 'commit'`) and `gt_review` (`family: 'review'`); `createGearChartForTool` does not draw them yet.
- The record card reads `actionOffer(session)` and writes through `link_case_file` with `graphic`; the provenance graphic draws `actionProvenance(session)` (the technique's emblem inside its section's) with its caption.
- The next action's task card is the proposal flow; the check-back is the review card (`set_review_task`, `dismiss_review`); Review now is `start_review`.
- The medal reads the row's `main`.
