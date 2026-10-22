# Gear Shifter Plan 2: Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every chart change Gear Shifter needs, before any technique is configured (Plan 3):
- the scales family's optional `min` for `axes` mode (default 1), and dated snapshots, for The Transactional Model;
- a new `ratings` family (factory and renderer) for Structured Evaluation;
- options on Problem Solver's `kanban` and `five_whys` for the book's variants, with Problem Solver's own tools unchanged;
- the `.gt-scope` re-skin of the shared family renderers and of the two reused Problem Solver charts;
- one contact sheet for Adam to look at once.

**Architecture:**
- **The factory seam.** `checkCommon` (`packages/decision-book/families/common.mjs`) takes ids that start with `dm_` or `gt_`, so Gear Shifter builds its techniques through Decision Maker's factories. Nothing else about the shell changes: `step` stays `'explore'`. Decision Maker's Explore step names its tools from its own catalogue, and Gear Shifter's from its own (`steps.mjs`, Plan 1), so a `gt_` tool never joins Decision Maker's shelf and a `dm_` tool never joins Gear Shifter's.
- **Scales.** `chart.min` is `0` or `1`, axes mode only, default `1`; `validateScores`, the form's `min` and the error message read it. `chart.dated` (axes mode, one series) keeps every save as a dated snapshot. `historyOf(run, series, count)` gives the latest snapshots first, and the renderer overlays up to three of them (solid, outline, dotted), each labelled by its date. Existing scales tools set neither option and are unchanged.
- **Ratings.** The person names the ideas (2 to 7), the criteria (2 or 3, configurable within that range) and the raters (1 to 12). Each rater's scores (1 to 10 for every idea on every criterion) and their own ranking come in as one score snapshot per rater through Problem Solver's scores mechanism (`pickScores`, `validateScores`, `awaiting`, `applyScores`), entered with the chart's own form. The latest snapshot per rater wins. `ratingsOf(run)` computes per idea and criterion the mean, the **sample** SD (n − 1) and n; per idea a pooled mean and SD across raters of each rater's mean for that idea; and each rater's mean. Once every rater has scored, `recommendation` and `owner` open. Equal rater weights. No weighted total, no combined ranking, no winner: ideas always draw in slot order.
- **Variants.** `kanbanTool(options)` and `fiveWhysTool(options)` build the tools; `kanban = kanbanTool()` and `fiveWhys = fiveWhysTool()` are exactly today's definitions. Kanban options: `columns` (To do, Doing, Done without Review), `suggestedWip` (3) and `cardFields` (effort, help and urgency per card, scored through the chart's controls, never required). 5 Whys options: `minWhys` (1, so five is a guide), `maxWhys` and `evidence` (each why needs its evidence before the chain continues, and the root opens only once every why has it). `createKanbanView(doc, options)` takes the same options; the 5 Whys view draws `evidence` nodes under their why whenever a run has them.
- **Re-skin.** Decision Maker's stylesheet gains three tokens for its hard-coded colours (`--dm-muted`, `--dm-contested`, `--dm-band`), with the same values. `.gt-scope` maps every `--dm-*` token to the Gear Shifter palette, so the shared renderers draw in cobalt, vermilion and amber: Decision Maker's green becomes the blue label shade (paper text on it is 4.8:1), its red the vermilion for shapes and the red label shade wherever text sits on it. The four `.dm-scope`-only rules get `.gt-scope` twins. Kanban and 5 Whys remap Problem Solver's `--ps-*` tokens inside `.gt-scope`. A contrast test enforces every text pair.
- **Chart lookup.** `packages/get-things-done/render/charts.ts` picks a run's chart: the ratings renderer, the two variants by `variantOf`, and otherwise Decision Maker's `createChartForTool`.

**Tech stack:** Node ESM with `node:test` (root `tests/unit`); TypeScript renderers with vitest and happy-dom (`apps/tasks/tests/unit`); esbuild from `apps/tasks` for the contact sheet.

**Spec:** `docs/superpowers/specs/2026-10-22-get-things-done-design.md` ("Diagrams", decisions 2 to 6).
**Plan set:** `docs/superpowers/plans/2026-10-22-gear-shifter-plans.md`. Plan 1 is done.
**Status:** done, 22 Oct. Every task ran test-first; see "As run" at the end for what changed on the way.
**Branch:** `claude/tender-mccarthy-a298ad`, draft PR adamrussell91-hash/life-hub#1047.
**Before starting:** `npm ci` at the root and in `apps/tasks`.
**Public repo rule:** fixtures and the contact sheet use invented content only. No book text.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/decision-book/families/common.mjs` (modify) | `dm_` or `gt_` ids |
| `packages/decision-book/families/scales.mjs` (modify) | `min`, `dated`, `historyOf` |
| `packages/decision-book/families/ratings.mjs` (new) | The ratings factory and `ratingsOf`, `sampleSd` |
| `packages/decision-book/families/index.mjs` (modify) | `ratings` joins `FAMILY_FACTORIES` |
| `packages/decision-book/render/scales.ts` (modify) | The form's minimum, dated overlays |
| `packages/decision-book/render/ratings.ts` (new) | The ratings chart |
| `packages/decision-book/decision-book.css` (modify) | Three tokens for hard-coded colours; ratings and dated-scales styles; phone rules |
| `packages/problem-solver/tools/kanban.mjs`, `five-whys.mjs` (modify) | `kanbanTool`, `fiveWhysTool`, `cardFieldsOf` |
| `packages/problem-solver/render/kanban.ts`, `five-whys.ts` (modify) | View options; evidence nodes |
| `packages/problem-solver/problem-solver.css` (modify) | Card fields and the evidence note |
| `packages/get-things-done/fixtures.mjs` (new) | Sample tools and runs: zero-min dated scales, ratings, the Kanban and 5 Whys variants |
| `packages/get-things-done/render/charts.ts` (new) | Which chart draws a Gear Shifter run |
| `packages/get-things-done/get-things-done.css` (modify) | The re-skin |
| `packages/get-things-done/contact-sheet.ts`, `scripts/build-gear-shifter-contact-sheet.mjs`, `docs/mockups/gear-shifter/contact-sheet.html`, `.gitignore` | The contact sheet |
| `tests/unit/get-things-done-families.test.js`, `tests/unit/get-things-done-css.test.js` (new) | Factory, variant and stylesheet tests |
| `apps/tasks/tests/unit/get-things-done-charts.test.ts` (new) | Ratings, dated scales, Kanban and 5 Whys variant renderers, chart lookup |

---

### Task 1: Scales `min` and dated snapshots

**Files:** modify `families/common.mjs`, `families/scales.mjs`, `render/scales.ts`; create `packages/get-things-done/fixtures.mjs` (scales sample only for now); test `tests/unit/get-things-done-families.test.js`.

- [x] **Step 1: Write the failing tests**

```js
// tests/unit/get-things-done-families.test.js (scales part)
import { scalesTool, historyOf, valuesOf } from '../../packages/decision-book/families/scales.mjs';
import { GT_SAMPLE_TOOLS, gtRun } from '../../packages/get-things-done/fixtures.mjs';

test('factories take gt_ ids; other prefixes still fail', () => {
  assert.equal(GT_SAMPLE_TOOLS.needs.id, 'gt_sample_needs');
  assert.throws(() => scalesTool({ ...base, id: 'xx_bad', chart: axes3 }), /ids start with dm_ or gt_/);
});

test('scales: axes take an optional min of 0; the default stays 1', () => {
  const zero = GT_SAMPLE_TOOLS.needs;          // axes, min 0, radar, dated
  assert.equal(zero.chart.min, 0);
  assert.equal(zero.validateScores(gtRun('needs'), { series: 'now', values: { order: 0, novelty: 10, thanks: 4 } }), null);
  assert.match(zero.validateScores(gtRun('needs'), { series: 'now', values: { order: -1, novelty: 10, thanks: 4 } }), /from 0 to 10/);
  const one = scalesTool({ ...base, chart: axes3 });
  assert.match(one.validateScores(sampleRun(one.id), { series: 'now', values: { a: 0, b: 1, c: 1 } }), /from 1 to 10/);
  assert.throws(() => scalesTool({ ...base, chart: { ...axes3, min: 2 } }), /min is 0 or 1/);
  assert.throws(() => scalesTool({ ...base, chart: { ...pairs, min: 0 } }), /min belongs to axes mode/);
});

test('scales: dated keeps every save, latest first', () => {
  let run = gtRun('needs');
  run = applyScores(run, { series: 'now', values: { order: 2, novelty: 5, thanks: 7 } }, '2026-10-01T09:00:00.000Z');
  run = applyScores(run, { series: 'now', values: { order: 6, novelty: 5, thanks: 3 } }, '2026-10-08T09:00:00.000Z');
  assert.deepEqual(historyOf(run, 'now', 3).map((s) => s.at.slice(0, 10)), ['2026-10-08', '2026-10-01']);
  assert.deepEqual(valuesOf(run).now, { order: 6, novelty: 5, thanks: 3 });
  assert.throws(() => scalesTool({ ...base, chart: { ...axes3, dated: true, series: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } }), /dated scales take one series/);
});
```

The existing `decision-book-families.test.js` assertion `/ids start with dm_/` keeps passing (the new message begins the same way).

- [x] **Step 2: Run, see them fail.** `node --test tests/unit/get-things-done-families.test.js`.
- [x] **Step 3: Implement.**
  - `checkCommon`: `/^(dm|gt)_/`, message `ids start with dm_ or gt_`.
  - `scalesTool`: `const min = chart.min ?? 1`; check `chart.min === undefined || chart.mode === 'axes'` ("min belongs to axes mode"), `[0, 1].includes(min)` ("min is 0 or 1"); `chart.dated` needs axes mode and one series; the axes error reads `Scores run from ${min} to 10.`
  - `historyOf(run, series, count = 3)`: snapshots of that series, newest first, `{ at, values }`.
  - Renderer: `input.min = String(chart.mode === 'axes' ? chart.min ?? 1 : 0)`. With `dated`, the overlays are `historyOf(run, 'now', 3)` (solid newest), the legend chips read each snapshot's date (`8 Oct`), and the radar polygons and bars draw from them. The legend says "Not scored yet" before the first save.
  - Fixture `gt_sample_needs`: three invented axes (`order`, `novelty`, `thanks`), `min: 0`, `layout: 'radar'`, `dated: true`.
- [x] **Step 4: Run all scales tests** (`node --test tests/unit/decision-book-families.test.js tests/unit/get-things-done-families.test.js`), then commit: `Gear Shifter: scales take min 0 and dated snapshots`.

### Task 2: The ratings family

**Files:** create `families/ratings.mjs`, `render/ratings.ts`; modify `families/index.mjs`, `get-things-done/fixtures.mjs`, `decision-book.css`; tests in `get-things-done-families.test.js` and `apps/tasks/tests/unit/get-things-done-charts.test.ts`.

Slots, in order: `subject` (optional), then `idea:1..7`, `criterion:1..max` and `rater:1..12`, open together until the first score; then the scores (one snapshot per rater: `{ rater: <rater node id>, scores: { <idea id>: { <criterion id>: n } }, ranking: [<idea ids, best first>] }`); then `recommendation` and `owner`; then `reflection` if configured. Ideas, criteria and raters close once any rater has scored. Complete when every rater's latest snapshot covers every idea and criterion, and both `recommendation` and `owner` are placed.

- [x] **Step 1: Write the failing factory tests**

```js
test('ratings: config bounds', () => {
  assert.throws(() => ratingsTool({ ...base, chart: { idea: 'i', criterion: 'c', rater: 'r', criteria: [1, 3] } }), /criteria run from 2 to 3/);
  assert.throws(() => ratingsTool({ ...base, chart: { idea: 'i', criterion: 'c', rater: 'r', maxIdeas: 8 } }), /at most seven ideas/);
});

test('ratings: ideas, criteria and raters first, then scores, then recommendation and owner', () => {
  const def = GT_SAMPLE_TOOLS.ratings;
  let run = gtRun('ratings');
  assert.deepEqual(nextSlots(run), ['idea:1', 'criterion:1', 'rater:1']);
  run = fill(run, ['idea:1', 'idea:2', 'idea:3', 'criterion:1', 'criterion:2', 'rater:1', 'rater:2']);
  assert.deepEqual(nextSlots(run), ['idea:4', 'criterion:3', 'rater:3']);
  assert.match(def.awaiting(run), /scores every idea/);
  assert.match(def.validateScores(run, { rater: 'rater1', scores: {}, ranking: [] }), /every idea on every criterion/);
  assert.match(def.validateScores(run, scoresFor('rater1', 11)), /from 1 to 10/);
  assert.match(def.validateScores(run, { ...scoresFor('rater1', 5), ranking: ['idea1', 'idea1', 'idea2'] }), /rank every idea once/);
  run = applyScores(run, scoresFor('rater1', 5), AT);
  assert.deepEqual(nextSlots(run), [], 'the set closes once scoring starts; waiting on rater 2');
  run = applyScores(run, scoresFor('rater2', 7), AT);
  assert.deepEqual(nextSlots(run), ['recommendation', 'owner']);
  run = fill(run, ['recommendation', 'owner']);
  assert.equal(isComplete(run), true);
});

test('ratings: means, sample SD with n, pooled and rater means; no winner', () => {
  const r = ratingsOf(GT_SAMPLE_RUNS.ratings.full);
  // invented scores: idea1 / criterion1 rated 4, 6, 8 by three raters
  assert.deepEqual(r.cells.idea1.criterion1, { mean: 6, sd: 2, n: 3 });
  assert.equal(sampleSd([4, 6, 8]), 2);
  assert.equal(sampleSd([5]), null, 'one rater has no sample spread');
  assert.deepEqual(Object.keys(r.pooled), ['idea1', 'idea2', 'idea3']);
  assert.equal(r.pooled.idea1.n, 3);
  assert.equal(typeof r.raterMeans.rater1, 'number');
  assert.deepEqual(r.rankings.rater1, ['idea2', 'idea1', 'idea3']);
  assert.equal('winner' in r, false);
  assert.equal('total' in r, false);
});
```

- [x] **Step 2: Run, see them fail.**
- [x] **Step 3: Implement `ratings.mjs`** (`ratingsTool`, `ratingsOf`, `sampleSd`; rounded to one decimal place for display only, raw in `ratingsOf`) and add `ratings` to `FAMILY_FACTORIES`. Fixtures: `gt_sample_ratings` with invented ideas (three ways to run a book swap), criteria (cost, reach) and raters (three invented first names), and empty, partial and full runs. Update the factory-key assertion in `decision-book-families.test.js` to include `ratings`.
- [x] **Step 4: Write the failing renderer tests** (`get-things-done-charts.test.ts`)

```ts
describe('ratings chart', () => {
  it('draws one row per idea in slot order, never sorted by mean, with no winner mark', ...);
  it('labels every spread as a sample SD with its n', () => expect(cell(view, 'idea1', 'criterion1').textContent).toMatch(/Mean 6\.0.*Sample SD 2\.0.*n = 3/));
  it('shows "n/a" for the spread of a single rater', ...);
  it('lists each rater with their mean and their own ranking', ...);
  it('draws the recommendation and the decision owner, named', ...);
  it('scores through its own form: choose a rater, fill the grid and the ranks, Save emits one snapshot', ...);
  it('prefills the form from a rater\'s latest snapshot', ...);
  it('says Empty, In progress and Completed like every Decision Book chart', ...);
  it('keeps element identity across updates', ...);
});
```

- [x] **Step 5: Implement `render/ratings.ts`** on `createChart` (family `ratings`). The frame is a role-`table` grid: a header row of the criteria (entry pills) and "All criteria"; one row per idea (entry pill as row header), each cell the mean, "Sample SD" and "n = k". Under the table, the raters (entry pills, each with "Mean 6.3" and "Ranks: Swap shelf, Stall, Lunch club"); then the recommendation and owner boxes; then the form (rater select, a 1–10 number input per idea and criterion, a rank input per idea, Save). Styles in `decision-book.css` (`.dm-ratings__*`); at 480px and under each idea row becomes a card with its criterion names written in.
- [x] **Step 6: Run the renderer tests and the Decision Book contract suite**, then commit: `Gear Shifter: the ratings family`.

### Task 3: Kanban and 5 Whys variants

**Files:** modify `problem-solver/tools/kanban.mjs`, `five-whys.mjs`, `render/kanban.ts`, `render/five-whys.ts`, `problem-solver.css`; extend `get-things-done/fixtures.mjs`; tests in both new test files.

- [x] **Step 1: Write the failing tests**

```js
test('kanban: the default build is Problem Solver\'s tool, unchanged', () => {
  assert.equal(kanban, TOOLS.kanban);
  const again = kanbanTool();
  for (const key of ['id', 'name', 'kind', 'step', 'when']) assert.equal(again[key], kanban[key]);
  assert.deepEqual(again.nodeTags, { card: ['todo', 'doing', 'review', 'done'] });
  assert.equal(again.validateScores, undefined, 'no card fields');
});

test('kanban variant: three columns, a suggested limit of three, optional card fields', () => {
  const def = GT_SAMPLE_TOOLS.kanban;
  assert.deepEqual(def.nodeTags.card, ['todo', 'doing', 'done']);
  assert.equal(def.suggestedWip, 3);
  assert.equal(def.variantOf, 'kanban');
  let run = fill(gtRun('kanban'), ['card:1', 'card:2', 'card:3'], { tag: 'todo' });
  assert.equal(isComplete(run), true, 'card fields are never required');
  assert.equal(def.validateScores(run, { card: 'card1', effort: 'small', help: 'needs_help', urgency: 'now' }), null);
  assert.match(def.validateScores(run, { card: 'nope', effort: 'small', help: 'alone', urgency: 'now' }), /one of the cards/);
  run = applyScores(run, { card: 'card1', effort: 'large', help: 'alone', urgency: 'later' }, AT);
  assert.deepEqual(cardFieldsOf(run).card1, { effort: 'large', help: 'alone', urgency: 'later' });
});

test('5 Whys: the default build is unchanged; the variant stops at an evidence-backed root', () => {
  assert.equal(fiveWhys, TOOLS.five_whys);
  const def = GT_SAMPLE_TOOLS.fiveWhys;
  let run = fill(gtRun('fiveWhys'), ['problem', 'why:1']);
  assert.deepEqual(nextSlots(run), ['evidence:1'], 'a why is checked before the chain goes on');
  run = fill(run, ['evidence:1']);
  assert.deepEqual(nextSlots(run), ['why:2', 'root'], 'five is a guide, not a minimum');
  run = fill(run, ['root']);
  assert.equal(isComplete(run), true);
});
```

Renderer tests: the variant board has no Review stop and three regions; before a limit is set the Doing heading reads "Suggested limit 3", and "Over suggested limit (4 of 3)" with four cards in Doing; a card with fields shows "Large · Alone · Later"; the fields form emits `{ card, effort, help, urgency }`; Problem Solver's board still has its Review stop. The 5 Whys view draws `evidence:k` right after `why:k` as an "Evidence" note.

- [x] **Step 2: Run, see them fail.**
- [x] **Step 3: Implement.** `kanbanTool({ id, name, kind, step, when, failureModes, steps, columns, suggestedWip, cardFields })` with today's values as defaults; `kanban = kanbanTool()`. With `cardFields`, `pickScores` / `validateScores` take `{ card, effort: small|medium|large, help: alone|needs_help, urgency: now|soon|later }`; `cardFieldsOf(run)` keeps the latest per card. `fiveWhysTool({ …, minWhys, maxWhys, evidence })`; `fiveWhys = fiveWhysTool()`. `createKanbanView(doc, { columns, suggestedWip, cardFields })` (defaults: today's board) and `onScore`. The 5 Whys view's `kindOf` knows `evidence`.
- [x] **Step 4: Run Problem Solver's Kanban and 5 Whys suites unchanged** (`tests/unit/problem-solver-*.test.js`, `apps/tasks/tests/unit/problem-solver-kanban-render.test.ts`, `problem-solver-five-whys-render.test.ts`) and the new tests. Commit: `Gear Shifter: Kanban and 5 Whys variants`.

### Task 4: The `.gt-scope` re-skin and chart lookup

**Files:** modify `decision-book.css`, `get-things-done.css`; create `get-things-done/render/charts.ts`; test `tests/unit/get-things-done-css.test.js`, plus lookup tests in `get-things-done-charts.test.ts`.

- [x] **Step 1: Write the failing stylesheet test**

```js
test('every Decision Maker token is remapped under .gt-scope', () => {
  const dm = [...dmCss.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]);
  for (const name of dm) assert.match(gtCss, new RegExp(`${name}:\\s*var\\(--gt-`), name);
});
test('Decision Maker draws exactly as before: its hard-coded colours became tokens of the same value', ...);
test('the .dm-scope-only rules have .gt-scope twins', ...);   // details cards
test('text pairs pass 4.5:1', () => {
  // paper on blue label, paper on red label, ink on amber, ink on each tint, muted on paper,
  // and the bright cobalt and vermilion fail for text (they are for shapes only)
});
test('Kanban and 5 Whys take the Gear Shifter palette inside .gt-scope only', ...);
```

- [x] **Step 2: Run, see it fail.**
- [x] **Step 3: Implement.** In `decision-book.css` add `--dm-muted: #66675d`, `--dm-contested: #b8301f`, `--dm-band: #3c7420` and use them for the literals. In `get-things-done.css`, `.gt-scope` sets every `--dm-*` to a `--gt-*` value (`--dm-green: var(--gt-blue-label)`, `--dm-red: var(--gt-red)`, `--dm-red-label: var(--gt-red-label)`, `--dm-green-tint: var(--gt-blue-tint)` …), the details-card twins, the two Quick answer rules where ink sat on red label (paper instead), and the Problem Solver remaps: Kanban `--ps-red: var(--gt-red-label)`, `--ps-blue: var(--gt-blue-label)`, `--ps-yellow: var(--gt-amber)` (Done is the amber done state), `--ps-on-yellow: var(--gt-ink)`, `--ps-kanban-on-red: var(--gt-paper)`; 5 Whys red-label problem, blue-tint whys with ink text, blue-label root. `charts.ts`: `createGearChartForTool(tool)` → ratings by family, the variants by `variantOf`, else `createChartForTool` from Decision Maker.
- [x] **Step 4: Run** the CSS tests of both tools and the lookup tests. Commit: `Gear Shifter: re-skin the shared charts`.

### Task 5: The contact sheet

**Files:** create `packages/get-things-done/contact-sheet.ts`, `scripts/build-gear-shifter-contact-sheet.mjs`, `docs/mockups/gear-shifter/contact-sheet.html`; modify `.gitignore`.

- [x] **Step 1:** Mirror Decision Maker's sheet: inside `.ps-scope .gt-scope`, every shared family (path, list, quadrant, curve, scales from Decision Maker's samples) and the new ones (zero-min dated needs radar, ratings, the Kanban and 5 Whys variants), each empty, partial and full, at desktop width and at 390px.
- [x] **Step 2:** Build it (`node scripts/build-gear-shifter-contact-sheet.mjs`), serve `docs/mockups/gear-shifter/`, and screenshot it at 1280px and 390px with Playwright (Chromium at `/opt/pw-browsers`). Check no label is under 11px, nothing overflows at 390px, and the ratings rows reflow to cards. Commit: `Gear Shifter: contact sheet`.

### Task 6: Plan 2 check

- [x] `node --test tests/unit/*.test.js` green; in `apps/tasks`, `npx vitest run` green for the Problem Solver, Decision Book and Gear Shifter suites; the Tasks type-check shows no new errors in these paths.
- [x] `npm run pre-pr-check` exits 0.
- [x] The plan set's status table says Plan 2 is done; push; the PR stays draft; stop for Adam before Plan 3.

## Notes for later plans

- Plan 3 registers `gt_kanban` and `gt_five_whys` with `kanbanTool({ id: 'gt_kanban', step: 'explore', columns: ['todo', 'doing', 'done'], suggestedWip: 3, cardFields: true, … })` and `fiveWhysTool({ id: 'gt_five_whys', step: 'explore', minWhys: 1, evidence: true, … })`, with the pack's own-words coaching fields, and configures The Transactional Model as `scales` with `mode: 'axes'`, `min: 0`, `layout: 'radar'`, `dated: true` and the book's three labels.
- Plan 4: the scripted coach's Kanban branch reads `KANBAN_COLUMNS`; Gear Shifter's scripted path must read the variant's own `nodeTags.card`.
- Plan 5: the session canvas draws Gear Shifter runs through `createGearChartForTool`.

## As run (22 Oct)

- Every task ran test-first and ended with a commit. Tests added: 21 factory and variant tests (`get-things-done-families.test.js`), 7 stylesheet tests (`get-things-done-css.test.js`) and 20 renderer and lookup tests (`get-things-done-charts.test.ts`). Problem Solver's and Decision Maker's suites pass unchanged, apart from one assertion that now lists `ratings` among the family factories.
- `ratings` also joined Decision Maker's `render/charts.ts` family map, so `createGearChartForTool` falls through to it with no special case.
- The contact sheet showed five things, fixed in the same commit: the zero-min form said "1–10"; `gt_` tools inherited "What this shows about the decision", so their default reflection is now "What this shows about getting it moving"; Problem Solver's 9 and 10px tags break the 11px rule, so `.gt-scope` raises them to 11px; amber covered Doing as well as Done, so Doing's pills and arrow are paper; and the newest scales overlay now draws in cobalt so it stands apart from the older ink outlines.
- Gear Shifter adds three text shades to its tokens: `--gt-muted` (#5b6372), and `--gt-blue-deep` (#1f5fb4) and `--gt-red-deep` (#a8361b) for small text on the tints, where the label shades fall under 4.5:1.
