# Gear Shifter Plan 3: The Techniques Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [x]`) syntax for tracking. Tasks 2 to 6 (one book section each) depend only on Task 1 and on Task 2's registration, so after Task 2 they can run in parallel.

**Goal:** Turn all 37 catalogue entries into working Gear Shifter techniques:
- a small, reusable **importer** (`scripts/book-pack/import.mjs`) that turns a private book pack's entries into tool code, with no anchor text, page text or PDF page numbers;
- **configs and notes for every entry**, one book section per commit: 35 built through the Decision Book family factories and the two Problem Solver variants (`gt_kanban`, `gt_five_whys`), each with the pack's own-words coaching (`when`, steps, watch-fors, exercise) and our `pairsWell`;
- the three **merged entries** folded in as a step and a watch-for in our own words: New Work into Rapid Prototyping, The Myth of Achievement into Project Evaluation, The Matthew Effect into Motivation;
- **registration** in Problem Solver's one registry with `step: 'explore'`, so the techniques appear on Gear Shifter's Explore shelf only, never on Problem Solver's or Decision Maker's;
- **tests:** one config test per entry (its stage order, axes, regions or groups), integrity tests, a driver that works every technique to completion through the real machine, every technique drawn by its own chart, and a **copy check** that fails if a shipped string shares eight words in a row with the pack's anchors or pages (local only: it skips where the private pack is absent, as in CI).

**Architecture:**
- **Where techniques live.** `packages/get-things-done/tools/` holds one module per section (`doing-things.mjs`, `before-doing.mjs`, `working-with-others.mjs`, `doing-differently.mjs`, `reviewing.mjs`), each exporting its section's tools keyed by id in catalogue order, and `index.mjs` collecting them as `GEAR_TOOLS`. `packages/problem-solver/tools/index.mjs` spreads `GEAR_TOOLS` in after `dm_record`.
- **Why they never leak.** `step: 'explore'` is not a toolkit step, so Problem Solver's shelves and prompts (which list by toolkit step) never show them. Decision Maker's Explore step lists its own catalogue's ids and Gear Shifter's lists its own (`steps.mjs`, Plan 1). The three Problem Solver tests that check every registered tool against toolkit rules (`problem-solver-tools`, `problem-solver-machine`, `problem-solver-glyphs`) already skip `dm_`; they now skip `gt_` too, and Gear Shifter's own tests cover them. A new assertion keeps every `gt_` id off every Problem Solver and Decision Maker shelf.
- **The importer.** A pure function, `importSection(pack, sectionKey, { familiesPath })`, returns the module's source and a report; a thin CLI reads the private pack and writes the file. It reads only `id`, `title`, `section`, `printedChapterPages` (for order), `verdict`, `mergeInto`, `tier`, `family`, `reuse.tool`, `structure`, `when`, `failureModes`, `steps`, `exercise` and `pairsWell`. It never reads `facts`, `pages`, `figures`, `openQuestions`, `structureEvidence` or `reuse.differences` (which carry PDF page numbers). Kept entries with a factory family become factory calls. Variants (`reuse`) and proposed families become a `…Notes` object of their coaching fields with a "finish by hand" comment. Merged entries are named in a closing comment beside their home; cut entries are left out. Before returning, it runs the copy check over every string literal it emitted and throws on a copied run. It runs locally, never in CI; its unit test uses an invented pack.
- **The copy check.** `scripts/book-pack/copy-check.mjs` exports `shinglesOf(texts, n = 8)`, `copiedRun(text, shingles)` and `shippedStrings(value)` (every string inside a tool definition or catalogue entry, recursively), and has a CLI (`node scripts/book-pack/copy-check.mjs <pack-dir>`) that checks every `gt_` tool, the catalogue and the glyph titles against the pack's anchors and page text. `tests/unit/get-things-done-copy.test.js` runs the same check and skips when the pack is not on disk (`GT_BOOK_PACK`, or `../life-hub-data/book-packs/get-things-done` beside the repo).
- **Finishing by hand.** The importer gives a buildable first draft. Each section task then: rewrites lines that speak to the builder rather than the person (the pack's notes about "the prose", editions and attributions); gives each list and quadrant its own `entry` or `item` description (the pack uses one generic line for all); sets each chart's minimum so lenses stay short and worksheets ask for enough; and folds in any merged entry. A test bans the builder-facing words.
- **Getting a Project Done** carries the book's own cross-references per stage as `tools` on each stage (structure, not text): its seventeen `seeAlso` links, split across the seven stages as the book places them. Plan 5 draws them as the stations' links.
- **The driver.** `workThrough` (`packages/decision-book/work-through.mjs`) learns the ratings family: when a ratings chart is waiting, every rater who has not scored gets mid-range scores and a ranking in slot order.
- **Charts.** Each technique is drawn through `createGearChartForTool` (Plan 2). The contact sheet gains a "Techniques" part: every technique worked to completion, at desktop and 390px.

**Tech stack:** Node ESM with `node:test` (root `tests/unit`); TypeScript renderers with vitest and happy-dom (`apps/tasks/tests/unit`); esbuild for the contact sheet.

**Spec:** `docs/superpowers/specs/2026-10-22-get-things-done-design.md` ("Catalogue", "Coach knowledge", "Sources and the public-repo rule", decisions 1, 2, 6 and 7).
**Plan set:** `docs/superpowers/plans/2026-10-22-gear-shifter-plans.md`. Plans 1 and 2 are done; Adam approved Plan 2 on 22 Oct.
**Status:** done, 22 Oct. Every task ran test-first; see "As run" at the end for what changed on the way.
**Branch:** `claude/tender-mccarthy-a298ad`, draft PR adamrussell91-hash/life-hub#1047.
**Before starting:** `npm ci` at the root and in `apps/tasks`. Clone the private pack beside the repo: `life-hub-data` on `main`, `book-packs/get-things-done/`.
**Public repo rule:** into life-hub go structure labels (the book's short names for stages, axes, cells and groups), the pack's own-words coaching fields and our own rewrites. Never `facts`, `anchor` text, `pages/` text, figures, renders or PDF page numbers. Test fixtures are invented.

---

## File structure

| File | Responsibility |
| --- | --- |
| `scripts/book-pack/copy-check.mjs` (new) | Eight-word shingles, `copiedRun`, `shippedStrings`; CLI over the pack |
| `scripts/book-pack/import.mjs` (new) | `importSection` and its CLI |
| `tests/unit/book-pack-import.test.js` (new) | The importer and copy check on an invented pack |
| `tests/unit/get-things-done-copy.test.js` (new) | Every shipped Gear Shifter string against the private pack; skips without it |
| `packages/get-things-done/tools/{doing-things,before-doing,working-with-others,doing-differently,reviewing}.mjs` (new) | One section's techniques each |
| `packages/get-things-done/tools/index.mjs` (new) | `GEAR_TOOLS` |
| `packages/problem-solver/tools/index.mjs` (modify) | Spreads `GEAR_TOOLS` in after `dm_record` |
| `tests/unit/problem-solver-{tools,machine}.test.js`, `apps/tasks/tests/unit/problem-solver-glyphs.test.ts` (modify) | Toolkit checks skip `gt_` as they skip `dm_` |
| `tests/unit/get-things-done-techniques.test.js` (new) | Integrity, one config test per entry, the shelves, the driver |
| `packages/decision-book/work-through.mjs` (modify) | Ratings support |
| `apps/tasks/tests/unit/get-things-done-techniques-render.test.ts` (new) | Every technique drawn empty and complete |
| `packages/get-things-done/contact-sheet.ts` (modify) | The "Techniques" part |

---

### Task 1: The importer and the copy check

**Files:** create `scripts/book-pack/copy-check.mjs`, `scripts/book-pack/import.mjs`, `tests/unit/book-pack-import.test.js`.

- [x] **Step 1: Write the failing tests** on an invented pack (`book.prefix: 'zz'`, two sections, a kept list entry with a `facts` anchor, a kept path entry, a variant, a proposed family, a merged entry and a cut entry; the invented page text holds the anchor's sentence).

```js
test('copy check: eight-word runs, case and apostrophes ignored', () => {
  const s = shinglesOf(['The quick brown fox jumps over the lazy dog today.']);
  assert.equal(copiedRun('so the Quick brown fox jumps over the lazy dog', s), 'the quick brown fox jumps over the lazy');
  assert.equal(copiedRun('the quick brown fox jumps over a lazy dog', s), null);
});

test('shippedStrings walks a tool definition', () => {
  assert.deepEqual(shippedStrings({ a: 'x', b: ['y', { c: 'z' }], f: () => 1, n: 3 }).sort(), ['x', 'y', 'z']);
});

test('importer: kept entries in chapter order as factory calls; no facts, anchors or PDF pages', () => {
  const { source, report } = importSection(PACK, 'first', { familiesPath: '../families/index.mjs' });
  assert.match(source, /^\/\/ Generated by scripts\/book-pack\/import\.mjs/);
  assert.match(source, /import \{ listTool, pathTool \} from '\.\.\/families\/index\.mjs';/);
  assert.ok(source.indexOf("id: 'zz_alpha'") < source.indexOf("id: 'zz_beta'"));
  for (const banned of [PACK.entries.zz_alpha.facts[0].anchor, 'facts', 'anchor', 'PDF', 'pp.']) assert.ok(!source.includes(banned), banned);
  assert.match(source, /export const FIRST = Object\.freeze\(\{\n  zz_alpha: zzAlpha,\n  zz_beta: zzBeta/);
  assert.deepEqual(report.cut, ['zz_gone']);
  assert.deepEqual(report.merged, [['zz_folded', 'zz_alpha']]);
});

test('importer: variants and proposed families become notes to finish by hand', () => {
  const { source, report } = importSection(PACK, 'first', { familiesPath: '../families/index.mjs' });
  assert.match(source, /\/\/ Variant of Problem Solver's `kanban`: finish by hand\.\nexport const zzBoardNotes = \{/);
  assert.match(source, /\/\/ Proposed family `group_ratings`: finish by hand\.\nexport const zzRateNotes = \{/);
  assert.deepEqual(report.byHand, ['zz_board', 'zz_rate']);
});

test('importer: the generated module builds through the real factories', async () => {
  // Written beside the families (a scratch file under packages/decision-book/families/), imported, removed.
});

test('importer refuses to emit a copied run', () => {
  const copied = structuredClone(PACK);
  copied.entries.zz_alpha.when = copied.pages[1];   // the page sentence itself
  assert.throws(() => importSection(copied, 'first', { familiesPath: '../families/index.mjs' }), /copied from the book/);
});
```

- [x] **Step 2: Run, see them fail.** `node --test tests/unit/book-pack-import.test.js`.
- [x] **Step 3: Implement.**
  - `copy-check.mjs`: words as in `check.mjs` (lower case, apostrophes dropped, `[a-z0-9]+`); `shinglesOf`, `copiedRun`, `shippedStrings`; `readPackTexts(dir)` returns every anchor and every page's text; the CLI imports `GEAR_TOOLS`, `CATALOGUE`, `SECTIONS` and the glyph titles and exits 1 naming the first copied run per string.
  - `import.mjs`: `readPack(dir)` → `{ book, entries, pages }` (pages only for the copy check); `importSection` as described above; `toJs(value, indent)` writes single-quoted strings (escaping `\` and `'`, keeping `’`), bare keys where they are identifiers, two-space indents. Steps use a local `step(id, title, prompt)` helper, as Decision Maker's sections do. Export names are camel case of the id. CLI: `node scripts/book-pack/import.mjs <pack-dir> --section <key> --out <file>` refuses to overwrite an existing file without `--force`, and prints the report.
- [x] **Step 4: Run the tests**, then commit: `Gear Shifter: the book-pack importer and copy check`.

### Task 2: Doing things (12), and registration

**Files:** create `packages/get-things-done/tools/doing-things.mjs`, `tools/index.mjs`, `tests/unit/get-things-done-techniques.test.js`; modify `packages/problem-solver/tools/index.mjs`, the three toolkit tests.

- [x] **Step 1: Write the failing tests.** Integrity tests, written once for all sections and scoped to the sections registered so far (`SECTIONS_DONE`, grown by each task, so each task's commit is green):

```js
test('every catalogue entry of a done section has its tool, registered once, in catalogue order', ...);
test('family, tier, step and pairsWell match the catalogue; definitions are frozen', ...);   // variants: variantOf = entry.reuse
test('every technique coaches: when, steps, two or more watch-fors, an exercise; no “choose” step', ...);
test('coaching speaks to the person, not the builder', () => {
  // no "the prose", "edition", "from memory", "Buffett", "the book does not", "explicit correction"
});
test('lenses stay short: a list lens asks for at most two entries before its reflection', ...);
test('techniques sit on Gear Shifter’s Explore shelf only', () => {
  for (const model of MODEL_IDS) for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('gt_')));
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('gt_')));
  assert.ok(!toolsForPlanStep('decision_book', 'explore').some((id) => id.startsWith('gt_')));
  assert.deepEqual(toolsForPlanStep('gear_shifter', 'explore'), CATALOGUE.map((e) => e.id).filter((id) => GEAR_TOOLS[id]));
});
test('every technique works through to completion on the real machine', ...);   // workThrough
```

And one config test per entry of the section (the book's structure as assertions):

| Entry | Built as | Asserts |
| --- | --- | --- |
| `gt_procrastination` | list, checklist | Emotion, Vision, Plan, Progress in that order; all four answered before the reflection |
| `gt_pomodoro` | path, stages | Disconnect, Work 25 minutes, Break 5 minutes, Repeat work and break, Longer break and reconnect; no timer field anywhere in the chart |
| `gt_compartmentalisation` | path, stages | Identify rooms, Prepare, Be present, Review and close |
| `gt_rapid_prototyping` | path, stages, loop | Question, Rough prototype, User test, Review; up to four rounds, one before the reflection; New Work's step (keep the need, change the route) is present |
| `gt_bursty_communication` | path, stages | Set limits, Mix it up, Turn off the camera, Trust, Practice |
| `gt_inbox_management` | path, stages | Collect, Review yesterday, Reply clearly, Decline where needed, Return to work |
| `gt_kanban` | `kanbanTool` variant | To do, Doing, Done (no Review); suggested limit 3; card fields; `variantOf: 'kanban'`; Problem Solver's `kanban` untouched |
| `gt_five_whys` | `fiveWhysTool` variant | a why needs its evidence before the next opens; the root opens after one checked why; `variantOf: 'five_whys'` |
| `gt_five_second_rule` | quadrant | Desire across (want to, do not want to), Obligation up (can do, have to); Get up in the morning top right is where the countdown is for, and its items can become tasks |
| `gt_triage` | path, flow | survives without help → Low priority; fails despite help → Low priority; otherwise Top priority |
| `gt_paralysis_by_analysis` | list, checklist (lens) | Change your rhythm, Trust your abilities; both before the reflection |
| `gt_book_of_books` | path, stages | Mark, Review chapter, Summarise book, Store searchable notes, Record reading |

- [x] **Step 2: Run, see them fail.**
- [x] **Step 3: Import and finish.** `node scripts/book-pack/import.mjs ../life-hub-data/book-packs/get-things-done --section doing_things --out packages/get-things-done/tools/doing-things.mjs`, then by hand:
  - `gt_kanban`: `kanbanTool({ id: 'gt_kanban', name: 'Kanban', kind: 'plan', step: 'explore', columns: ['todo', 'doing', 'done'], suggestedWip: 3, cardFields: true, … })` with the pack's coaching; its steps name To do, Doing and Done.
  - `gt_five_whys`: `fiveWhysTool({ id: 'gt_five_whys', name: 'The 5 Whys Method', kind: 'diagnostic', step: 'explore', minWhys: 1, evidence: true, … })`.
  - `gt_rapid_prototyping`: New Work folded in as a step (keep the need fixed while the route changes, and show each small result to the people it is for before the next) and a watch-for (saving feedback for the finished version).
  - Pomodoro's "four rounds" watch-for and Paralysis by Analysis's "odds" watch-for rewritten for the person.
  - `entry` and `item` descriptions in our own words; minimums: Procrastination 4 groups, Paralysis by Analysis 2.
  - `tools/index.mjs` exports `GEAR_TOOLS = Object.freeze({ ...DOING_THINGS })`; `problem-solver/tools/index.mjs` spreads it after `dm_record`; the three toolkit tests skip `gt_`; `problem-solver-machine.test.js` checks that `TOOL_IDS` ends `dm_record`, then the `gt_` ids.
  - `workThrough` gains ratings support now (Task 4 needs it), with a test on the Plan 2 sample.
- [x] **Step 4: Run** `node --test tests/unit/*.test.js` and the Problem Solver and Decision Maker vitest suites, then commit: `Gear Shifter: Doing things techniques`.

### Task 3: What to do before you do anything (9)

**Files:** create `tools/before-doing.mjs`; modify `tools/index.mjs`, `get-things-done-techniques.test.js`.

| Entry | Built as | Asserts |
| --- | --- | --- |
| `gt_getting_a_project_done` | path, stages | the seven stages in order; each stage's `tools` are catalogue ids, and together they are exactly the entry's `seeAlso` (stage 1: Bursty Communication, Brainstorming, Structured Evaluation; 2: Rapid Prototyping, 5 Whys, Reversed Effort; 3: Budgeting, Small Gifts, Circle of Competence; 4: Compartmentalisation, Deep Work; 5: Pomodoro, 5-Second Rule, Transactional Model; 6: Kanban, Circle of Influence; 7: Project Evaluation) |
| `gt_budgeting` | list, rows | A rough guess, Top-down estimate, Estimate based on experience, Approximation, Bottom-up estimate; two methods before the reflection |
| `gt_batching` | list, routes | Sock: batch, Roof tile: act now, Dummy: wait |
| `gt_delphi_method` | path, stages | Ask separately, Anonymise, Share assessments, Revise judgements, Decide |
| `gt_to_do_list` | list, rows | Ivy Lee priorities, Time blocks; up to nine per group |
| `gt_motivation` | curve (lens) | Task difficulty across, Motivation up, a bell; Too easy, Challenging and achievable, Overwhelming in thirds; The Matthew Effect's small-wins step is present; no number in the labels |
| `gt_deep_work` | list, checklist | Take your time, Learn to be bored, Review social media, Devise rituals |
| `gt_tactics_versus_strategies` | quadrant | Tactics across, Strategy up; Hot air top left, Walking the walk top right, Labyrinth bottom left, Mindless activity bottom right |
| `gt_routines` | list, rows | Helpful, Unhelpful and Desired habits; the exercise sets a date to look back, and nothing tracks |

- [x] Steps as Task 2: tests first, import (`--section before_doing`), finish (Matthew Effect folded into Motivation as a step and a watch-for; Budgeting's formula watch-for, Deep Work's hours watch-for and Routines' tracking exercise rewritten; the stage `tools`), run, commit: `Gear Shifter: What to do before you do anything`.

### Task 4: How to get others to do things (7)

| Entry | Built as | Asserts |
| --- | --- | --- |
| `gt_appreciation` | list, rows (lens) | Acknowledge contribution, Own genuine harm; one entry opens the reflection |
| `gt_radical_transparency` | list, checklist | Agree a trial, Be considerate, Be direct and prompt, Review the trial |
| `gt_sandwich_feedback` | list, routes (lens) | the three orders as routes; the "use it when" questions the classic sandwich |
| `gt_likeability` | quadrant | Likeability across, Competence up; Competent jerk top left, A rainbow-farting unicorn top right, Jerk of the month bottom left, Loveable fool bottom right |
| `gt_small_gifts` | list, roles (lens) | Immediate exchange, Deferred debt, Expected mutual investment, Give because it is right |
| `gt_brainstorming` | path, stages | Analytic stage, Creative stage, Critical stage |
| `gt_structured_evaluation` | ratings | up to seven ideas, two or three criteria, raters named; sample SD; equal weights; no winner |

- [x] Steps as Task 2 (`--section working_with_others`); Structured Evaluation is finished by hand from its notes with `ratingsTool`. Commit: `Gear Shifter: How to get others to do things`.

### Task 5: Doing things differently (5)

| Entry | Built as | Asserts |
| --- | --- | --- |
| `gt_circle_of_competence` | list, rows | I do know this, I do not know this |
| `gt_five_twenty_five_rule` | list, rows | Group A: five priorities (at most five), Group B: twenty distractions; the coaching drops the twenty rather than queuing them |
| `gt_circle_of_influence` | list, rows | Circle of concern, Circle of influence, Circle of control, outside in |
| `gt_disruptive_innovation` | list, rows (lens) | Sustaining innovation, Disruptive innovation |
| `gt_kotter_change` | path, stages | the eight stages in the book's order |

- [x] Steps as Task 2 (`--section doing_differently`); the 5/25 Rule's attribution watch-for and Kotter's edition watch-for rewritten. Commit: `Gear Shifter: Doing things differently`.

### Task 6: What to do with the things you have done (4)

| Entry | Built as | Asserts |
| --- | --- | --- |
| `gt_project_evaluation` | list, checklist | Fun, Money, Impact, all three before the reflection; The Myth of Achievement's luck-and-support step and watch-for are present; it is Review's tool |
| `gt_transactional_model` | scales | axes, `min: 0`, radar, dated; Recognition first (top), then Structure (lower right) and Stimuli (lower left); zero accepted, eleven refused; never a sum |
| `gt_journalling` | path, stages | Review the day, Record three good things, Repeat each evening |
| `gt_reversed_effort` | path, stages (lens) | Notice counterproductive effort, Step away, Reassess later |

- [x] Steps as Task 2 (`--section reviewing`); the Transactional Model is finished by hand with `scalesTool`; Project Evaluation's "the book requires" step rewritten. Commit: `Gear Shifter: What to do with the things you have done`.

### Task 7: Every technique drawn, and the copy check

**Files:** create `apps/tasks/tests/unit/get-things-done-techniques-render.test.ts`, `tests/unit/get-things-done-copy.test.js`; modify `packages/get-things-done/contact-sheet.ts`.

- [x] **Step 1: Write the tests.** For every `gt_` tool: `createGearChartForTool` draws it empty, then a `workThrough` run completed, with every node drawn (Decision Book charts by `.dm-entry[data-node]`; the variants by their own node selectors). The copy test runs `shippedStrings` over `GEAR_TOOLS`, the catalogue and the glyph titles against the pack, skipping without it.
- [x] **Step 2: Run** (the copy check runs here, with the pack present), fix anything they find.
- [x] **Step 3: Contact sheet.** Add a "Techniques" part: each technique by section, worked to completion. Build, screenshot at 1280px and 390px, check no label under 11px and nothing overflowing. Commit: `Gear Shifter: every technique drawn and checked`.

### Task 8: Plan 3 check

- [x] `node --test tests/unit/*.test.js` green; in `apps/tasks`, `npx vitest run` green; no new type errors in these paths.
- [x] `node scripts/book-pack/copy-check.mjs ../life-hub-data/book-packs/get-things-done` exits 0.
- [x] `npm run pre-pr-check` exits 0.
- [x] The plan set's status table says Plan 3 is done; push; the PR stays draft; stop for Adam before Plan 4.

## Notes for later plans

- Plan 4: the per-technique notes for the coach come straight from these definitions (`when`, steps, `failureModes`, `exercise`, slots and minimums); the catalogue lines from `catalogue.mjs`. Review opens `gt_project_evaluation`. Gear Shifter's commit tool uses step `'commit'`.
- Plan 5: Getting a Project Done's stage `tools` become the stations' links; the shelf reads `GEAR_TOOLS` through `toolsForPlanStep('gear_shifter', 'explore')`.

## As run (22 Oct)

- Every task ran test-first and ended with a commit (one per section). Tests added: 8 importer and copy-check tests (`book-pack-import.test.js`), 47 technique tests (`get-things-done-techniques.test.js`: 9 integrity and driver tests, then one per entry and a count), 2 copy tests (`get-things-done-copy.test.js`, the second skipping without the pack), 1 list-family test, and 38 renderer tests (`get-things-done-techniques-render.test.ts`). Problem Solver's and Decision Maker's suites pass, with three toolkit tests now skipping `gt_` as they skip `dm_`.
- `node scripts/book-pack/copy-check.mjs` against the pack: no copied runs.
- **The importer** first named a merged entry in its source section's file (New Work sits in the pack's Before section); it now names it beside its home, whichever section it came from.
- **The list family gained a per-group `max`** (default `perGroup`, so every existing tool is unchanged), so the 5/25 Rule holds Group A to five.
- **Motivation's** pack entry listed the merged Matthew Effect under `pairsWell`; it is dropped, matching the catalogue. The integrity test caught it.
- **Builder-facing lines** rewritten for the person: Pomodoro's "four rounds", Paralysis by Analysis's "odds", Budgeting's formula, Deep Work's hours, the 5/25 Rule's attribution, Disruptive Innovation's examples, Kotter's edition and Project Evaluation's "the book requires"; Kanban's steps name To do, Doing and Done; Routines' exercise sets a date to look back instead of tracking.
- **Every list and quadrant** has its own `entry` or `item` line in place of the pack's generic one, and its own minimum (Procrastination 4 groups, Project Evaluation 3, Budgeting and Paralysis by Analysis 2, the one-entry lenses Appreciation, Sandwich Feedback and Small Gifts).
- **The contact sheet** showed the Transactional Model's dated legend reading "work-through": the driver stamped scores with that word. It now stamps a fixed date. Problem Solver's Kanban and 5 Whys draw nothing for an empty run (unchanged from Problem Solver), so the empty-frame check covers the Decision Book charts only.
- Family-built techniques keep the factories' default `kind` (`'decision'`); Plan 4 decides whether Gear Shifter's coach needs its own.
