# Gear Shifter Plan 5: The App

> Tasks 1 to 7 run in order. Each is test-first, leaves every suite green and ends with one commit.

**Goal:** Gear Shifter gets its pages in the Tasks hub at `#/gear-shifter`, in the design Adam approved on 22 Oct (`docs/mockups/gear-shifter/landing.html`, `session.html`, `set.html`). After this plan:

- **Nav:** a "Gear Shifter" entry in the Tools group, after Decision Maker, with the lighter rail icon (the gear inside the two return arrows, as outline strokes), routed to `apps/tasks/src/views/get-things-done/view.ts`.
- **Landing page** (mirrors Decision Maker's, in the Gear Shifter palette):
  - the hero: the book emblem and the wordmark title, one line, the **New** box ("What do you need to get moving?") and the **Quick start** card, which says it is coming until Plan 6 builds the route;
  - the shape board (4×3, the twelve tiles the spec names);
  - **Your work**, one card per session: the medal and a meta line (stage, technique or question, date);
  - **How a session builds** (Frame, Explore, Commit, Review);
  - **the five sections in route order**, each opening its shelf of technique emblems with its "use it when" line; **Start from this** opens a session that is on that technique once it is framed;
  - **Thinking skills you have used**, the shared ribbon split three ways (Gear Shifter, Decision Maker, Problem Solver).
- **Session page:**
  - the **track**: Frame, Explore, Commit and Review on a dotted line;
  - the **route** above the canvas: the five section emblems on a loop, lit stations ringed, the rest faded;
  - the **canvas**: `createGearChartForRun`, the experiment's basis, live task statuses, a strip for looking back at earlier techniques, and on Getting a Project Done each station's techniques as links;
  - the **medal card**, built as the session moves;
  - the **shelf** of techniques (`toolsForPlanStep('gear_shifter', 'explore')`), grouped by section, which asks the coach for a technique;
  - Problem Solver's coach panel, skill tray, review panel and task cards, with Gear Shifter's look, origin and paper.
- **Charts** for `gt_commit` (family `commit`) and `gt_review` (family `review`), drawn by `createGearChartForTool`.
- **The record on a page:** the record card reads `actionOffer(session)` and writes through `link_case_file` with `graphic`; the provenance image is the technique's emblem inside its section's, with the caption under the text. The next action's card is the proposal flow; the check-back is the review card (`set_review_task`, `dismiss_review`); Review now is `start_review`.
- **Server:** Tasks knows the `gear_shifter` task source, and the shelf's suggestion speaks of a technique; the mock API serves `/api/get-things-done` on the scripted coach.

**Not in this plan (Plan 6):** Quick start (`quick.mjs`, `quick-view.ts`, the `start` kind on the endpoint), the live coach evaluation, the Playwright walks, the PR marked ready.

**Spec:** `docs/superpowers/specs/2026-10-22-get-things-done-design.md` ("Experience", "Design language", "Diagrams", "Architecture").
**Plans 1 to 4:** done (Plan 4 HEAD `be6716af`).
**Model:** Decision Maker's Plan 6 (`2026-10-21-decision-maker-plan-6-app.md`) and its code in `apps/tasks/src/views/decision-book/`. Gear Shifter reuses Problem Solver's client pieces exactly as Decision Maker does; Problem Solver gained every option it needs for Decision Maker, so this plan adds no new option to those components except the ribbon's third share.
**Branch:** `claude/tender-mccarthy-a298ad`; PR #1047 stays draft.

**Rules kept:**
- **Public repo:** no book text. Section lines, step text, station copy and the coach look's prompts are our own words. Tests use invented examples.
- **Problem Solver and Decision Maker are unchanged for their users:** their views, their tests and their ribbons stay as they are. The ribbon takes several other tools, but Problem Solver's and Decision Maker's call sites still pass one, so their pages draw the same two-way bar. Giving their ribbons Gear Shifter's share is a choice for Adam (see Notes for Plan 6).
- **Palette:** paper `#fefdf6`, ink `#2a3340`, cobalt `#2b7de9`, vermilion `#ea4f2a`, amber `#f5a623` (sparingly: the centre gear, a done state); small text in `#2670d1`, `#cd4524`, `#976615` or the deep shades. No green: Problem Solver's tokens are remapped under `.gt-scope` as Decision Maker remaps them under `.dm-scope`.
- **UI failure register** (`docs/CURSOR-UI-FAILURES.md`): each UI task names the entries it checks.

**Design notes:**
- **One structure, three looks.** The session page wires the same parts in the same order as Decision Maker's `renderSession`; only the canvas, route, track, medal card, shelf and options differ.
- **The provenance image is a static file** in the Tasks build (`apps/tasks/public/get-things-done/provenance/<id>.svg`), made by a generator with a drift test, for Decision Maker's reason: an image block keeps the http(s) address it was written with. The Kanban and 5 Whys variants have no emblem of their own; their image is the book's emblem inside the section (Problem Solver's glyphs are in its own palette).
- **Picking a technique is a message to the coach**, not a new action. The shelf and a station's links send "Let's try <technique>." through `say`, so the coach's discernment and its gatekeeping still apply; the engine gains nothing. Starting from a technique on the landing uses the server's existing `startModel`.
- **Station links are added by Gear Shifter's canvas**, after the path renderer draws Getting a Project Done, so Decision Maker's renderer is untouched.

---

### Task 1: Server, API and shared pieces

**Files:**
- Modify: `netlify/functions/_shared/task-properties.mjs`, `apps/tasks/src/domain/task-properties-defaults.ts` (task source `gear_shifter`, label "gear shifter").
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`: the shelf suggestion's reason says "technique" for a shift ("You started from this technique on the shelf."); a decision keeps "model".
- Modify: `apps/tasks/scripts/mock-api.ts`: `'/api/get-things-done': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['shift'] })`.
- Modify: `apps/tasks/src/views/problem-solver/api.ts`: `gearShifterApi = createSessionApi('/api/get-things-done')`; `create` accepts `kind: 'shift'`.
- Modify: `apps/tasks/src/views/problem-solver/link-chips.ts` and `.css`: `gearShifterChips` (hash `#/gear-shifter`, review step `review`, tone `gt`: cobalt, vermilion and amber dots); `apps/tasks/src/views/page-editor.ts` shows it beside the other two.
- Modify: `apps/tasks/src/views/problem-solver/skills-ribbon.ts`: `other` may be one side or a list; each other tool gets its own grey or tinted share and legend key. One side draws exactly as before.

**Tests first:**
- `tests/unit/get-things-done-app-server.test.js` (root): the `gear_shifter` source is in the server list; a shift started from `gt_pomodoro` opens on it once framed with a technique reason; a decision's shelf reason is unchanged.
- `apps/tasks/tests/unit/get-things-done-app.test.ts` (new, grows through the plan): the client defaults list `gear_shifter`; the Gear Shifter chip opens `#/gear-shifter?id=…` and a review chip `&step=review`; the ribbon with two others sums three tools and draws three shares, and with one other draws what it drew before.

**Check:** `npm run test:unit`; `cd apps/tasks && npx vitest run tests/unit/decision-book-app.test.ts tests/unit/get-things-done-app.test.ts`.
**Commit:** "Gear Shifter: the gear_shifter task source, its API, chip and a three-way ribbon".

### Task 2: Charts for the experiment and its review

**Files:**
- Create: `packages/get-things-done/render/commit.ts`: the experiment chart, after the cover. The result as the headline inside a target ring; "Rests on" with each node's basis (`setBasis`, as the decision record's); the next action on the dart; how it starts; the check-back on the return arrows, as a date in words; "Change course if" as a vermilion band. Built on `decision-book/render/core.ts` `createChart`, family `commit`. Phone: one column, same order.
- Create: `packages/get-things-done/render/review.ts`: the experiment review: Changed, Cost and Keep as three stations on the return loop, each with its answer; family `review`.
- Modify: `packages/get-things-done/render/charts.ts`: `commit` and `review` families draw these; everything else is as before.
- Modify: `packages/get-things-done/get-things-done.css`: `.gt-commit` and `.gt-review` styles under `.gt-scope`; labels never below 11px.
- Modify: `packages/get-things-done/contact-sheet.ts`, `fixtures.mjs`: the two charts join the sheet's first rows.

**Tests first** (`apps/tasks/tests/unit/get-things-done-charts.test.ts`): each tool gets a chart; the parts come in slot order (result, rests on, next action, start, check back, change course; changed, cost, keep); the check-back reads as a date in words; a basis shows under its node; empty, partial and complete states say Empty, In progress and Completed.

**UI register:** label size floor, phone reflow, text-labelled states.
**Commit:** "Gear Shifter: the experiment and review charts".

### Task 3: The provenance images

**Files:**
- Create: `scripts/generate-get-things-done-provenance.mjs`: for every catalogue entry, its emblem (or, for the two variants, the book's emblem) on a paper disc with a cobalt ring, and its section's emblem as a badge at the lower right; `--check` exits 1 on drift. Written to `apps/tasks/public/get-things-done/provenance/<id>.svg` (37 files).
- Create: `tests/unit/get-things-done-provenance.test.js`: one file per catalogue entry, each labelled "<technique>, from <section>", only palette colours, and `--check` passes.

**Commit:** "Gear Shifter: the provenance images a record shows".

### Task 4: Decor

**Files:**
- Create: `apps/tasks/src/views/get-things-done/decor.ts`:
  - the shape helpers from the approved mockups: `gear`, `arrowArc`, `returns`, `cycle`, `target`, `dart`, `dots`;
  - `toolNamed`, `plainName` (a technique's name without a leading "The");
  - `createShapeBoard()`: the 4×3 board with the spec's twelve tiles, dealt once in order, then one tile changing about every two seconds (pop, flip or turn), still under reduced motion; `nudge()` on typing;
  - `gearMedal({ frame, route, section, technique, commit, done })`: the red ring when framed, the blue return arrows (with the section badge) when placed on the route, the technique's emblem in the middle, the dart at Commit, an amber tick when reviewed; `medalState(row | session)` reads it from a list row (`frame`, `phase`, `main`, route) or a session;
  - `trackStations(session)` and `createTrack()`: Frame, Explore, Commit and Review with notes ("Question 2 of 3", the technique, "The experiment", "Check back 5 Nov");
  - `createRoute()`: the five section emblems on a dotted loop in route order, lit ones ringed, the rest faded, with the lit stations' labels and a line each in our words; hidden until the route is answered;
  - `gtAvatar()` and `GT_LOOK` (avatar, emblem, frame prompts "What needs to move?", "Where is it stuck?", "What do you already know?", noun "Session", escalate wording).

**Tests first** (`get-things-done-app.test.ts`): the track moves Frame → Explore → Commit → Review and shows the check-back; the route lights one or two stations and stays hidden before the route answer; the medal adds ring, arrows and badge, technique and dart in turn; the coach look frames Gear Shifter's three questions.

**UI register:** decorative SVGs `aria-hidden`; the route has an accessible name naming the lit stations; no colour-only state (labels say "Lit"/the station name).
**Commit:** "Gear Shifter: board, medal, track, route and coach look".

### Task 5: Canvas and record blocks

**Files:**
- Create: `apps/tasks/src/views/get-things-done/canvas.ts`: as Decision Maker's canvas, over `createGearChartForRun`; step order explore, commit, review; the experiment chart gets `basisOf(session)`; Getting a Project Done's stations get their techniques as link buttons (`onTechnique`), each with its emblem; the empty state shows the book emblem and a line.
- Create: `apps/tasks/src/views/get-things-done/record-blocks.ts`: block ids `gt-rec-<session>-v<version>-<n>`; `provenanceUrl(id)` under `get-things-done/provenance/`; `recordBlocks` (heading, one rich text block per section, caption and "Open this session in Gear Shifter"); `recordGraphic` from `provenance.technique`.

**Tests first:** the canvas shows the empty state, then the technique, a strip once there are two runs, and the experiment's basis line; Getting a Project Done's stations carry their techniques and a click names the technique; record blocks are fixed, an update carries only changed sections, the image is the technique's file and absent without a technique.
**Commit:** "Gear Shifter: the session canvas and the record's page blocks".

### Task 6: The pages

**Files:**
- Create: `apps/tasks/src/views/get-things-done/view.ts`: `renderGearShifterView`, `unmountGearShifterView`, `reviewEntry`, `latestRecordWriter`. Landing and session as the Goal lists; every action goes through `createSessionSync`; the bridges get Gear Shifter's `ORIGIN` (`source: 'gear_shifter'`, tag `gear-shifter`, noun `session`), paper (`actionOffer`, noun "action record") and the record's blocks and graphic.
- Create: `apps/tasks/src/views/get-things-done/get-things-done-view.css`: page layout under `.gt-scope` with Problem Solver's tokens remapped (no green, no yellow), after the mockups; 390px layout single column.
- Modify: `apps/tasks/src/shell/shell.ts` (view id and nav item), `icons.ts` (rail icon), `apps/tasks/src/app/main.ts` (route, unmount).

**Tests first:** `reviewEntry` enters only with `step=review`; the record writer refuses an offer that moved on; the landing renders the hero, a card per session with its medal and meta, five sections in route order with every explore technique once, and a three-way ribbon (against a stubbed API); Start from this shows "Starting from …" and creates the shift with `startModel`.

**UI register:** focus rings on every control; 44px touch targets at 390px; no horizontal scroll at 390px; long titles wrap; loading and error states.
**Commit:** "Gear Shifter: the landing and session pages".

### Task 7: Browser check, fixes and As run

- Run the Tasks app on the mock API (`cd apps/tasks && npx vite`), with Chromium at 1280px and 390px:
  - the landing against `landing.html`: hero, board, cards, five sections, ribbon;
  - a whole session: framed, a technique worked, Commit, both confirm cards, the record written to a new project page with its image, and Review now;
  - Getting a Project Done's station links; the shelf; Problem Solver and Decision Maker landings unchanged.
- Fix what the walk finds, each fix with a test, then `npm run pre-pr-check` and the copy check.
- Add "As run" here; the plan set's table reads Plan 5 Done and Plan 6 Next.

---

## Notes for Plan 6

(Filled in when Plan 5 is done.)
