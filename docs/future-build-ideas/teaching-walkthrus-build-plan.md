# Teaching WalkThrus build plan

**Status:** Slices 0 to 4 built in one PR (29 October 2026). Slices 5 to 7 are still a plan. Nothing else builds until Adam names a slice.
**Written:** 28 October 2026
**Governs from:** [teaching-walkthrus.md](teaching-walkthrus.md) (the concept doc) and the approved board mockup [teaching-walkthrus-board-mockup.html](teaching-walkthrus-board-mockup.html). Where this plan and the concept doc disagree, the concept doc wins until Adam says otherwise.
**Inputs:** the concept doc, the mockup and a sweep of `main` for code to reuse (§2).

---

## 0. Decisions

Adam answered the concept doc's open questions on 28 October 2026. Three were left open to suggestion; the suggestions are below and stand until he overrules them.

| # | Question | Decision | If Adam says otherwise |
|---|----------|----------|------------------------|
| D1 | Free canvas or auto-layout? | **Adam: auto-layout, as in the mockup.** Series clusters arrange themselves. No pinning | Pins become a Slice 2 add-on, stored as axial cells per tile |
| D2 | Typed or free arrows? | **Adam: both.** Typed arrows with an optional free label (§1d) | Nothing changes |
| D3 | Where do problem-type tags come from? | **Suggested:** no new tagging in lessons. Derived from signals the evidence already holds, plus one optional field on Adam's feedback codes (§1e) | A new tag set means a tag picker in the quiz builder and markbook, which this plan avoids |
| D4 | Does a dismissed goal come back? | **Suggested:** only on new evidence, never on time alone (§1f) | Thresholds are settings: this is a number change |
| D5 | How is a lesson rep logged? | **Suggested:** one tap on the teacher note after the lesson ends, no push by default (§1g) | Push after the lesson becomes a setting that reuses the day-sense notifier |
| D6 | Where does a professional learning goal live? | **Suggested:** it is an ordinary goal (sphere `professional`) with a `walkthru` section, not a new record type (§1c) | A separate store means a second goals engine and a second "keep going" flow |

## 1. The rules the slices build to

### 1a. Copyright and privacy (from the concept doc, restated because every slice touches it)

- The book's wording lives only in private `life-hub-data` at `data/teaching/walkthrus/<set>.json`. It reaches the app through an operator-gated function with `cache-control: no-store`, exactly as the skills continuum does.
- The public repo holds a **catalogue** of ids, set, series code, page, technique name, icon key and the book's own cross-references (ids only). The Decision Book's `packages/decision-book/catalogue.mjs` is the precedent: "No book text lives here."
- The traced SVGs in Adam's Drive (`WalkThrus_SVG_Assets`, see [walkthrus.md](walkthrus.md)) are reference only. They copy the book's artwork. No slice imports them. Icons are custom.
- Lesson blocks store a technique id, step ids and Adam's own notes. Step text is fetched at render time. Book text never lands in stored lessons, versions, exports or prints.
- Students never see the mark, the text or the note. The existing strip of `teacher_note` and `teacher_jots` in `blocks/visibility.ts` and `_shared/teaching-student.mjs` must cover the new fields, with a test.
- Real student names and marks stay in the hub's private stores. Fixtures use invented data.

### 1b. The three layers in data

| Layer | Stored as | Where |
|---|---|---|
| Master | `{ set, id, steps: [{ n, label, text }], footer }` | Private file, cached in blob `walkthrus_text/v1` |
| Adapted | `goal.walkthru.adapted: { [step]: string }` | The goal record |
| On the day | `teacher_note.content.walkthru: { set, id, jots: { [step]: string } }` | The lesson block |

A note with a goal behind it shows the adapted notes under each master step, then the day's jots. A note with no goal shows master steps and empty jots.

### 1c. The goal (D6)

Goals already exist in `netlify/functions/_shared/goal-record.mjs` with `sphere: 'professional'`, `lead_measure`, `week_log` and a `term_history` decision (`carried`, `parked`, `achieved`, `dropped`). A WalkThru goal adds one optional object:

```
walkthru: {
  set, technique_id,
  stage: 'attempt' | 'develop' | 'adapt' | 'practise' | 'test',
  adapted: { [step]: string },
  cycles: [{ started, ended, decision: 'keep' | 'move_on' | null, reps, evidence_before, evidence_after }],
  origin: { kind: 'pattern' | 'manual', suggestion_id? }
}
```

- **One active technique.** At most one professional goal with a `walkthru` that is not ended or parked. Enforced server-side, with the same shape of check as `LANE_CAP` in `apps/tasks/src/domain/goal-hosting.ts` but a cap of 1.
- **Keep going / move on** reuses the term decision picker in `apps/tasks/src/views/goals-plan-next.ts`: "keep" maps to `carried`, "move on" to `achieved` or `dropped`.
- **Test** compares before and after with `compare(before, after, kind)` and `trend()` from `apps/teaching/src/evidence/patterns.ts`. The city piece on the board only appears when the comparison shows a gain on the problem type the goal came from.
- Because it is a normal goal, Clare and the Goals views see it for free. The board is a view onto goals, not the owner of them.

### 1d. Board layout and arrows (D1, D2)

- **Flat-topped axial hexes.** Each series has a cluster origin; tiles fill a spiral out from it in catalogue order (the mockup's `spiral`). Clusters are spaced on a fixed grid with white space between.
- **Never reflow.** A new set (expansion) takes the next free cluster slot at the board's edge. Existing tiles never move. This is the Life City layout rule (`apps/tasks/src/domain/city/layout.ts`), reused as a principle, not as code (that engine is square-grid).
- **Arrow types:**

  | Type | Drawn as | Use |
  |---|---|---|
  | `leads_to` | One arrowhead; chevron knot when tiles touch | Sequence: "then retrieve" |
  | `pairs_with` | Heads at both ends; double chevron when touching | Two techniques run together |
  | `free` | Thin dashed line, one head | Anything else, label required |

  Every type takes an optional short caps label. The book's own cross-references from the catalogue show as faint grey `leads_to` lines only on the opened tile. Adam can tap one to keep it.
- **Routing (the final-version rules).** Arrows leave the nearest clear edge, travel through white space and bend around hexes, tabs, titles, cluster labels and other arrows' labels. Labels sit in white space and slide along the arrow if crowded. Chevron knots sit on the shared edge's midpoint and never cover a tab or title. All of this is pure geometry with tests (Slice 1).

### 1e. Problem types without new tagging (D3)

The six problem types come from what the evidence already records. Each evidence row gains derived `need:` tags at read time; nothing is written back to quizzes or the markbook.

| Problem type | Signal already in the evidence |
|---|---|
| Recall | Low mean on retrieval items (`fam:` and `out:` tags) plus `sure_wrong` flags |
| Fluency | High share of part marks (`half` in `TagRow`) or `guessing` flags on items students get right |
| Recognising what the question asks | Feedback codes Adam marks with this problem type (see below) |
| Dexterity with procedures | Weak `skill:` tags |
| Sophistication of responses | Feedback codes Adam marks with this problem type (e.g. Criterion 3 expression codes) |
| Working under time | Unanswered items at the end of a timed quiz, **if** the quiz result records them. If not, this type waits until it does |

- **The one new field:** `problem_type` (optional) on each `FeedbackCode` in `apps/teaching/src/blocks/feedback-codes.ts`, set once in the existing feedback codes editor. Codes without one contribute nothing.
- The mapping from problem type to series is the concept doc's (habits to Behaviour and relationships, recall and fluency to Practice and retrieval, understanding to Explaining and modelling, quality to independent practice). Which technique in the series is suggested is a short ranked list per problem type in the catalogue, by id.

### 1f. Suggestions and dismissal (D4)

- The pattern monitor's thresholds stay as in the concept doc: the same problem type on 3 or more quizzes within 3 weeks or in 2 or more classes. Settings, not constants.
- **Two ways to dismiss:**
  - **Not now.** The suggestion records the matching evidence count at dismissal. It comes back only when the count reaches **double** that, with at least 3 new pieces. Never on time alone. This is the tie-inference rule (`_shared/tie-inference/`: `recordDeclinedPair`, `TIE_DECLINED_REPROPOSE_FACTOR`), with the factor as a setting.
  - **Not this.** Mutes that problem type for that class until the end of term.
- A suggestion that comes back says why: "Dismissed 4 Nov. Since then, 3 more quizzes show the same problem."
- **Engine reuse:** the count-at-dismissal rule is lifted into one shared helper, `_shared/suggestion-quiet.mjs` that the monitor uses. Three dismissal engines already exist (`ghost-proposer.js` `isThrottled`, `goal-dismissal-learn.mjs`, `graph-insights.ts` `isInsightDismissed`). This plan adds no fourth. Moving tie-inference onto the helper is optional and not part of any slice here.

### 1g. Lesson reps (D5)

- **When:** after the scheduled lesson's `end_time` (from `apps/teaching/src/schemas/scheduled-lesson.ts`) or as soon as Adam marks it delivered, the WalkThru note grows a strip: **Ran it · Partly · Didn't get to it**, plus an optional one-line note.
- **One tap is the whole job.** Ran it and Partly count as reps (Partly shows as a hollow dot on the tile). Didn't get to it is logged but is not a rep. Undo by tapping again.
- **No nagging.** Unlogged lessons collect as "2 lessons to log" on the goal and the board's panel. After 7 days an unlogged lesson lapses quietly and counts as nothing.
- **Push is off by default.** If Adam wants it, the day-sense notifier (`_shared/day-sense-notify.mjs`, with its once-per-key rule and daily cap) adds one prompt within 10 minutes of the lesson's end.
- **Storage:** one small record per rep keyed by lesson and technique, in the same one-record-per-tap shape as `block-pulse` (`_shared/block-pulse.mjs`), linked to the goal.

## 2. What already exists to reuse

Checked against `main` on 28 October 2026. **Copy** means lift the code; **Adapt** means extend it in place or move it to a shared home; **Reference** means borrow the pattern only.

### Board and drawing

| Need | Existing code | Use |
|---|---|---|
| Arrow labels that avoid boxes and each other | `packages/graph-blocks/graph.ts`: `rectExit`, `textWidth`, `boundsOf`, private `placeChips`, `quadAt` (tests: `apps/tasks/tests/unit/graph-blocks.test.ts`) | **Adapt.** Export `placeChips` and `quadAt`; feed hexes, tabs, titles and cluster labels as obstacles |
| Pan, zoom, pinch, keyboard, animated focus | `apps/professional/src/components/miniworld/camera.ts`: `createCamera`, `zoomAt`, `panBy`, `wheelZoom`, `pinchZoom`, `fitTransform`, `animateTo`, `focusOn`, `handleCameraKey` | **Adapt.** Move to a shared home and drive an SVG transform. Add the reduced-motion check it lacks |
| Tile and cluster labels that hide and return with zoom | `miniworld/labels.ts`: `placeLabels`, `wrapLabel` (tests: `miniworld/labels.test.ts`) | **Copy** |
| Pop-in and draw-on animation | `apps/tasks/src/views/graph-svg.ts`: `drawIn`, `popIn`, `EASE`, `OVERSHOOT` | **Copy** |
| Tweens for the strip and zoom | `packages/design-kit/js/hub-motion-engine.js`: `createMotion`, `cubicBezier`; `prefersReducedMotion` from `hub-motion.js` | **Copy** |
| Hover positioning | `packages/design-kit/js/hub-floating.js` (Floating UI, phone padding) | **Copy**, with a small fetch-and-cache layer for the private hover text |
| Click-open detail | `packages/design-kit/js/morphing-popover.js` | **Reference** |
| Side panel that becomes a bottom sheet | `miniworld/panel.ts` `mountPanel`; `.hub-more-sheet` in `packages/design-kit/mobile.css` (720px) | **Adapt** |
| HTML over SVG layering | `org-chart-board.ts`, `discern-graph.ts` | **Reference** |
| Curved arrow shapes | `problem-solver/render/causal-map.ts` | **Reference** |
| Never-reflow layout | `apps/tasks/src/domain/city/layout.ts` | **Reference** (square grid, rule only) |
| Cluster spacing | `miniworld/layout.ts` `layoutCommunities` | **Reference** |
| Custom icon set loaded by name | `packages/decision-book/glyphs.ts` (`MODEL_SVG`, `modelEmblem`) | **Adapt**, see duplicates below |

### Data, goals and blocks

| Need | Existing code | Use |
|---|---|---|
| Public catalogue of a book, no text | `packages/decision-book/catalogue.mjs`; `packages/problem-solver/books.mjs` | **Copy the shape** |
| Private text served safely | `_shared/private-data-file.mjs`; `_shared/skills-continuum.mjs` (blob cache, refresh) wrapped by `netlify/functions/skills-continuum.mjs`; client cache in `apps/teaching/src/skills/api.ts` | **Copy exactly** |
| Steps plus own notes | `TkTeacherNoteSchema` and `TkJotsSchema` in `apps/teaching/src/schemas/toolkit.ts`; `libraryNoteFor` and the reset in `toolkit/editors.ts` (tests: `thinking-toolkit.test.ts`) | **Copy** for the WalkThru note mode |
| Hide teacher-only fields from students | `blocks/visibility.ts`, `_shared/teaching-student.mjs` | **Adapt** |
| Auto-attach to blocks that embody a technique | `blocks/lenses/types.ts` `canAttach` and `registry.ts` | **Reference.** Same idea, teacher-only registry |
| Framework lenses for units | `blocks/lenses/registry.ts` `STEPPED_LENSES` | **Adapt.** Add five entries |
| Goals, spheres, term decision | `_shared/goal-record.mjs`, `_shared/goal-plan-term.mjs`, `views/goals-plan-next.ts` | **Adapt** (D6) |
| Before and after evidence | `apps/teaching/src/evidence/patterns.ts`: `compare`, `trend`, `byTag` | **Copy** |
| Evidence rows for counting | `evidence/markbook-evidence.ts` `markbookEvidence`; bundled to the server via `evidence/server-entry.ts` into `_shared/profile-evidence.mjs` | **Adapt**: add the monitor's pure rules to `server-entry.ts` |
| Run-on-save hooks | `markbookAction` in `_shared/markbook.mjs`; `submit` in `_shared/quiz.mjs` | **Adapt** |
| Move on or reteach rule | `blocks/hinge-question/shared.ts` `nextStep` | **Reference** |
| Quiet until evidence grows | `_shared/tie-inference/` `recordDeclinedPair`, `candidates.mjs` | **Adapt** into `_shared/suggestion-quiet.mjs` |
| Accept or decline record | `_shared/link-proposal-service.mjs` | **Copy the shape** |
| One-tap record | `blocks/block-pulse.ts`, `_shared/block-pulse.mjs` | **Copy the shape** |
| Prompt after a lesson | `_shared/day-sense-notify.mjs` `bookmarkCandidate` | **Adapt**, only if push is turned on |
| Coaching sheets | `apps/professional/src/guides/` (`GuideDefinition`, `GUIDES`, `runs.ts`, `guide-panel.ts`) | **Adapt**: a new guide |
| Link Teaching records to goals | `_shared/entity-ref.mjs` `ENTITY_REF_KINDS`, `_shared/entity-resolvers.mjs`; `apps/professional/src/api/universal-links.ts` | **Adapt**: add a resolver for reps |

### Already duplicated: do not add another copy

| Engine | Copies today | This plan |
|---|---|---|
| Glyph loaders | Near-identical `glyphs.ts` in decision-book, change-book, rules-book and problem-solver | Slice 0 lifts one shared loader into `design-kit`; WalkThrus uses it. Moving the four books onto it is optional |
| Reduced-motion checks | About 21 `prefersReducedMotion` functions | Use `design-kit/js/hub-motion.js` only |
| Cameras | `miniworld/camera.ts`, `travel/lib/zoomable.ts`, `network-graph-canvas.ts`, university timeline gestures | Build on `miniworld/camera.ts`, moved to a shared home |
| Label placers | `graph-blocks` `placeChips`, `miniworld/labels.ts` `placeLabels` | Extend these two |
| Suggestion dismissal | `ghost-proposer.js`, `goal-dismissal-learn.mjs`, `graph-insights.ts`, markbook `focus.dismissed` | One shared helper from the tie-inference rule (§1f) |

### New work (nothing to reuse)

Flat-topped hex geometry (corners, axial maths, hit tests, the shared edge between neighbours), routing arrows around text and tiles and the five-panel step strip.

## 3. Where new code lives

| Piece | Home |
|---|---|
| Catalogue, set registry, problem-type ranking, glyphs | `packages/walkthrus/` (`catalogue.mjs`, `sets.mjs`, `glyphs/`) |
| Board engine (pure, no DOM) | `packages/walkthrus/board/` (`hex.ts`, `layout.ts`, `route.ts`, `labels.ts`) |
| Private text function | `netlify/functions/walkthrus-text.mjs`, `_shared/walkthrus-text.mjs` |
| Board view | `apps/professional/src/views/walkthrus-board.ts`, route `#/learning` |
| Note mode, reps | `apps/teaching/src/blocks/walkthru-note/` |
| Pattern monitor rules | `apps/teaching/src/evidence/walkthru-patterns.ts` (bundled to the server) |
| Shared helpers lifted | `packages/design-kit/js/glyph-set.js`, `packages/design-kit/js/board-camera.js`, `_shared/suggestion-quiet.mjs` |

## 4. Slices

Each slice has one builder end to end and is its own PR through `npm run pre-pr-check`. Code slices never go straight to `main`. Order: Slice 0 first; then Slices 1 and 3 can run side by side; Slice 2 needs 1; Slice 4 needs 3; Slice 5 needs 3 and 4; Slices 6 and 7 need only 0.

### Slice 0 · Catalogue, private text and shared loaders

**Builder:** Claude Code. **Needs:** A1 (the private file) for the live check only; fixtures stand in for tests.

**Must**
- `packages/walkthrus/catalogue.mjs`: set 1's 50 techniques and 5 framework chapters as frozen data: `id`, `set`, `series`, `code` (e.g. `Q&F`), `page`, `name`, `glyph`, `see_also` (ids) and for frameworks `kind: 'framework'`.
- `sets.mjs`: `{ id, name, colour }` per set, with set 1 yellow, set 2 blue, set 3 green as in the mockup. Adding a set is a data entry.
- `problem_type` ranking: six short ordered lists of technique ids.
- Private text: copy the skills continuum pattern. `walkthrus_text/v1` blob, refresh action, operator gate, `no-store`, zod schema for `{ set, techniques: [{ id, steps: [{ n, label, text }] }], frameworks: [...] }`.
- Shared glyph loader in `design-kit`, plus placeholder glyphs for every catalogue entry until Adam's set arrives.

**Must not**
- Put any step text, framework summary or book figure in the repo, a test or a fixture. Fixtures use lorem-style filler.
- Import the traced SVGs from Drive.

**Verify**
- Test: every catalogue id is unique, every `see_also` resolves, every entry has a glyph or placeholder.
- Test: a guard that fails if any file under `packages/walkthrus/` contains a string longer than 120 characters that is not code (catches pasted book text).
- Test: the function rejects without the operator token and returns the fixture shape with it.

**Files:** `packages/walkthrus/*`, `netlify/functions/walkthrus-text.mjs`, `netlify/functions/_shared/walkthrus-text*.mjs`, `packages/design-kit/js/glyph-set.js`, tests beside each.

### Slice 1 · Board engine (no pixels)

**Builder:** Claude Code. Pure functions and tests, in the same spirit as Life City's Slice 1.

**Must**
- `hex.ts`: flat-topped corners, axial to pixel and back, neighbours, shared edge between two neighbours, hit test.
- `layout.ts`: `boardLayout(catalogue, sets, opened) → { tiles, clusters, labels, boxSlots }`. Clusters per series, spiral fill, fixed cluster grid, expansions in the next free slot. Deterministic in shuffled input order. Never reflow.
- `route.ts`: `routeArrows(layout, arrows) → paths`. Touching tiles get a knot at the shared edge's midpoint. Others route through a coarse visibility graph over white space with every tile, tab, title box, cluster label and placed label as an obstacle, then smooth to curves. Endpoints leave from the nearest clear edge.
- Labels via the exported `placeChips`, with the extended obstacle list.
- Five fixture boards ("golden boards"): empty, the mockup's demo, a crowded cluster with eight arrows, set 2 opened, a phone-width viewport.

**Must not**
- Touch the DOM, CSS or any hub.
- Add a graph-layout dependency.

**Verify**
- `arrow_crosses_text`: no routed path intersects any title, tab or label box on any golden board.
- `label_overlaps`: no label box intersects a hex, cluster label or other label.
- `knot_off_edge`: every knot sits on its shared edge and outside every tab and title box.
- `layout_reflow`: opening set 2 leaves every set 1 tile's cell unchanged.
- Determinism: same input gives byte-identical output twice and in shuffled order.

**Files:** `packages/walkthrus/board/*.ts`, `packages/walkthrus/tests/*.test.ts`, `packages/walkthrus/tests/fixtures/boards/*.json`.

### Slice 2 · The board in Professional

**Builder:** Cursor (live preview). **Needs:** Slices 0 and 1.

**Must**
- Route `#/learning` in Professional with a rail entry, rendering the engine's output as SVG in the approved cluster look (concept doc, Use 2, "Look").
- Camera from the shared board camera; animations from `drawIn`, `popIn` and the hub motion engine; reduced motion jumps to the end state.
- Click a hex: the five-step strip rises on a connector, the side panel opens (ADAPT chain with the repeat loop, steps, notes, reps, evidence), other hexes fade except neighbours. Magnifier closes.
- Hover: technique name and series from the catalogue at once; step text from the private endpoint, fetched once per session and cached in memory.
- Draw arrow mode: pick a start hex, pick where it leads, pick a type, optional label. Saved to a board blob in the Professional store (`walkthrus_board/v1`).
- Expansions wait as dashed outlines "still in the box" and turn over when opened.
- Progress pieces, robber and link-out chips render from data, with demo data until Slices 3 and 5 feed them.
- Phone: panel becomes a bottom sheet; the view starts on the active goal's cluster.

**Must not**
- Compute layout or routes in the view. The engine owns geometry.
- Score anything.

**Verify**
- UI failure register ([CURSOR-UI-FAILURES.md](../CURSOR-UI-FAILURES.md)), each with its board check:
  - **R2**, **R3**: at 390px, `scrollWidth === innerWidth`; the board pans inside its own box.
  - **R6**, **R7**, **V12**, **V13**: the phone bottom sheet sits above the tab bar, is visible on open, lives inside its backdrop and swipe-back closes the sheet, not the page.
  - **C1**: no tile title, tab, cluster label or arrow label is clipped or overlapped at any zoom (the Slice 1 tests cover geometry; this checks the rendered text).
  - **C4**: pinch zoom works in Safari macOS, Chrome and on iPhone, with zoom buttons as well.
  - **C9**: the first frame is the final layout. Pop-in animates from the final positions, never a settle then snap.
  - **V7**: a repaint after a save keeps the camera, the opened tile and the open panel.
  - **I2**, **I10**: every hex is a `<button>` reachable by Tab and Enter; arrow types and labels are chosen in an in-app picker, never `window.prompt`.
  - **I3**: an empty board (no goals, no arrows) shows a clear first-run state.
  - **M1**: no idle loops. The robber, pieces and arrows move only when something changes.
- The stress test walk of `#/learning` at desktop and 390px.
- Adam looks at it beside the mockup.

### Slice 3 · Goal life cycle

**Builder:** Claude Code. **Needs:** Slice 0.

**Must**
- The `walkthru` section on goal records (§1c), normalised in `goal-record.mjs`, with a zod mirror on the client.
- One-active rule enforced on create and on stage change.
- Stage moves on the goal page and the board panel; "keep / move on" through the existing term decision picker.
- `evidence_before` captured when the goal starts and `evidence_after` at Test, using `compare` on the goal's problem type and class.
- The board reads goals: pieces (dashed house, house, city) follow the stage and the Test result.

**Verify**
- Tests: second active goal rejected; city piece only after a gain; keep and move on write the right term decision; an old goal without `walkthru` is untouched.

### Slice 4 · WalkThru note mode and lesson reps

**Builder:** Claude Code. **Needs:** Slices 0 and 3.

**Must**
- A WalkThru mode on `teacher_note`: master steps on top, adapted notes (if a goal) and the day's jots under each step, copied from the Thinking Toolkit note pattern.
- Teacher-only auto-attach: hinge question → Check for understanding; quiz deck → Quizzing; faded examples → Worked examples and backward fading; markbook feedback → Whole class feedback. Shown as the technique's icon on the block, opening the note.
- "Walk through it": one step at a time before the lesson, inside Focus view if it is built by then.
- The rep strip and the rules in §1g.
- A resolver so reps link to the goal through universal links.

**Must not**
- Store step text in the block, a version, an export or a print.

**Verify**
- Test: the student view and student API never carry the `walkthru` fields.
- Test: a lesson version saved with a WalkThru note contains ids and jots only.
- Test: rep counting, Partly, undo and the 7-day lapse.

### Slice 5 · Problem types, pattern monitor and suggestions

**Builder:** Claude Code. **Needs:** Slices 3 and 4.

**Must**
- `problem_type` on feedback codes, editable in the existing editor.
- Derived `need:` tags (§1e) in `evidence/walkthru-patterns.ts`, bundled to the server.
- Counting rules run on save from `markbookAction` and quiz `submit`. One-off problems suggest a teacher note on the class's next lesson; repeated patterns suggest a goal.
- `_shared/suggestion-quiet.mjs` and the two dismiss options (§1f).
- Every suggestion carries the technique icon and the chain on hover: evidence → problem type → series → technique. The robber sits on the suggested tile; "Make it a goal" lifts it and places a dashed house.

**Must not**
- Call a model. AI wording of the pattern summary stays optional and needs a plan and A$ cost shown first.

**Verify**
- Golden fixtures for each problem type, each threshold edge (2 quizzes: nothing; 3: suggestion), Not now coming back only at double the count, Not this muted to end of term.

### Slice 6 · Unit planning icons and framework lenses

**Builder:** Claude Code. **Needs:** Slice 0.

- Planning fields from the concept doc's Use 3 carry the technique's icon with hover text from the private endpoint.
- Five framework lenses in `STEPPED_LENSES` (Rosenshine, Willingham, MARGE, Wiliam's five strategies, Berger). Lens prompts are written in Adam's own words, not the book's, because lenses can reach students. The hover names the source as a framework chapter.

### Slice 7 · Coaching guide

**Builder:** Claude Code. **Needs:** Slice 0.

- A new guide in `apps/professional/src/guides/`: the coachee picks the technique, the sheet shows only its five steps, feedback is written against each step and the cycle ends with keep or move on.
- The parked templates (unseen observation, CPD cycle) are not built.

### Later, not planned here

The game layer (resources, trading between sets, expansion boards), set 2 and set 3 content, cold call queue as the first full WalkThru block ([cold-call-queue.md](cold-call-queue.md)) and moving the older books and tie-inference onto the shared helpers.

## 5. What is needed and from whom

### From Adam

| # | What | Needed by | How |
|---|------|-----------|-----|
| A1 | The private text file for set 1 in `life-hub-data/data/teaching/walkthrus/set-1.json` | Slice 0 live check | From the existing text extraction, in the Slice 0 schema. Chat or Codex can convert it on Adam's Mac; it never passes through this repo |
| A2 | The commissioned icon set (50 techniques, 5 frameworks) | Before Slice 2 ships for real | Placeholders until then |
| A3 | Mark which feedback codes signal "recognising the question" and "sophistication" | Slice 5 | Ten minutes in the feedback codes editor |
| A4 | Confirm or overrule D3 to D6 | Before Slices 3 and 5 | One line each |
| A5 | Push after lessons: on or off | Slice 4 | Default off |

### From Cursor

| # | What |
|---|------|
| K1 | Confirm the shared board camera and the `mobile.css` sheet suit an SVG board, before Slice 2 |
| K2 | Build Slice 2 to the brief above once Slices 0 and 1 are merged |

## 6. History

- **2026-10-29:** Adam took the suggested answers to D3 to D6 and said the goal lives on a new Professional page (`#/learning/goal`), with the board at `#/learning`. Cursor is retired, so Claude Code built Slice 2 as well. Slices 0 to 4 shipped as one PR. Deviations from this plan: the board camera is a new shared `design-kit/js/board-camera.js` (the miniworld camera is untouched, so moving it onto the shared one is still open); the board is drawn at tile size 64 with cluster labels sized to read at full zoom out; `keep` and `move_on` write the same `term_history` outcomes as the term picker but through the goal page, using a calendar-month guess for the term label; Test evidence is a class mean and student count Adam enters (derived `need:` tags arrive with Slice 5); the robber is not drawn (Slice 5); markbook feedback has no block to carry the Whole class feedback icon, so it is not in the auto-attach list; the catalogue holds the 52 techniques and page numbers in the approved mockup, not 50, with empty `see_also` until the book’s cross-references are entered.

- **2026-10-28:** Draft written from the concept doc, the approved mockup, Adam's answers (auto-layout; typed and free arrows) and a sweep of `main` for reusable code. Suggested answers recorded for problem-type tags, dismissal, lesson reps and where the goal lives.
