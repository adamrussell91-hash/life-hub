# Gear Shifter: a coached getting-unstuck tool beside Problem Solver and Decision Maker

Date: 22 October 2026. Status: the pack's ten questions were settled with Adam on 22 Oct (see Decisions); awaiting written-spec review.
Builds on: `docs/superpowers/specs/2026-10-21-decision-book-design.md` (Decision Maker, on `main`) and Problem Solver v2.

## Goal

**Gear Shifter** is a third coach tool in the Tasks hub, built from *The Get Things Done Book* (Krogerus and Tschäppeler, the authors of *The Decision Book*: 41 techniques in five sections). It is for getting unstuck. Its nav label is "Gear Shifter", after the pattern of its siblings (the thing worked on, then the one who does it) and after the gear at the heart of its graphics. In code it goes by `get-things-done`, after its source, as Decision Maker's code goes by `decision-book`; its tool ids start with `gt_`.

It looks and works like its two siblings. You name something you need to move: a project to start, a stuck task, work with other people, a change of direction or something finished. The coach frames it, finds where it is stuck, recommends one technique, and builds that technique's chart with you one answer at a time. It then helps you commit to a small, dated experiment, and writes an action record onto a linked Tasks page. A short "Quick start" route covers a single stalled task. All three tools share the twelve thinking skills and one skills tally.

Not in scope:
- timers, notifications, recurring reminders and habit tracking. Pomodoro, routines and journalling are prepared and committed to as experiments, not run by the app (decision 7);
- A New Map of Life (cut as a standalone tool);
- Teaching blocks and a student-safe coach.

## Sources and the public-repo rule

- **Primary:** the private book pack at `life-hub-data/book-packs/get-things-done/`, prepared by Codex to `docs/book-packs/CODEX-BOOK-PREP.md` and checked by `scripts/book-pack/check.mjs` (0 errors against `main` at `456f8e6e`). This is the first tool built from a pack. Builders read the pack's entries, not the book. They go back to the pack's page files only when an entry is unclear, and they never copy page text.
- **What the pack gives per entry:** section, chapter pages, verdict, tier, family and structure (labels, axes, stages, regions); checked facts, each citing a page; `when`, `failureModes`, `steps` and `exercise` in Codex's own words, already checked for copied runs of eight words; `seeAlso` (the book's cross-references) and `pairsWell` (Codex's own suggestions).
- **Graphics:** the pack's `graphics/` folder is original artwork made for this project: 35 entry emblems, 5 section emblems, the book emblem (colour and mono) and a wordmark, built to the pack's `LANGUAGE.md`, over three review rounds. It can be committed.
- **Public repo:** life-hub is public. Into the repo go only the structure labels (the book's own short names for stages, axes and columns), the pack's own-words coaching fields and our own rewrites. The facts' `anchor` quotes, page text, figure crops, renders and the PDF stay in the private repo. Tests and fixtures use invented examples.
- **Pagination:** the supplied PDF has no printed folios. Chapter ranges in the printed book are verified; internal page boundaries are not. The catalogue stores each entry's verified printed chapter range as `chapter: [first, last]` and never claims an exact page. The pack's PDF page numbers stay in the private repo (decision 9).

## Decisions taken with Adam (22 Oct)

The pack's `questions.md` asked ten questions. Adam accepted the recommendations below.

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Scope | All 37 kept entries: 30 worksheets and 7 lenses. New Work merges into Rapid Prototyping, The Myth of Achievement into Project Evaluation, and The Matthew Effect into Motivation, each as a step or watch-for in our own words. A New Map of Life is cut |
| 2 | Kanban and 5 Whys | Reuse Problem Solver's `kanban` and `five_whys` as variants that keep the book's differences: Kanban with To do, Doing and Done (no Review column), a suggested limit of three cards in progress, and effort, help and urgency on each card; 5 Whys that stops at a root cause the evidence supports, with five as a guide rather than a minimum. Problem Solver's own tools are unchanged |
| 3 | Group evaluation | Built in full: each rater's scores per idea and criterion kept separately, the spread shown beside every mean, independent rankings, and one named decision owner. No weighted average and no automatic winner |
| 4 | Spread | Sample standard deviation, labelled as such, with the number of raters beside it |
| 5 | Rater weights | Equal. Unequal weights are a later, deliberate choice |
| 6 | Needs profile | Extend the existing scales family's `axes` mode with a minimum of 0 for this entry. No separate `radar_zero` family |
| 7 | Timers and reminders | None. Daily practices are framed as experiments with a check-back date |
| 8 | Placement and palette | The Tasks hub's Tools group, beside Problem Solver and Decision Maker (where both actually live; the pack said "Mind"). A brighter palette than the pack's (see Design language) |
| 9 | Page citations | Printed chapter ranges only, labelled as chapters |
| 10 | Edition | *The Get Things Done Book*, Profile Books 2023, translated by Gesche Ipsen |

## Experience

### Landing (`#/gear-shifter`)

The landing page mirrors Decision Maker's, in the Gear Shifter palette:

- **Hero:** the book emblem, one line, a **New** box ("What do you need to get moving?") and a **Quick start** card.
- **Your work:** one card per session. The medal is the section emblem with the main technique's emblem at its centre. The meta line shows the stage, the technique and the date.
- **The five sections:** the section emblems, each opening its shelf of technique emblems with a one-line "use it when". Starting from a technique here opens a session already on it.
- **Thinking skills you have used:** the shared ribbon, now split three ways.

### Full session

1. **Frame (three questions, one at a time):**
   - What needs to move? One sentence.
   - Where is it stuck? This places the work on the **route**: the book's five sections drawn as five stations on a loop, in the order a piece of work lives through them (before you start, doing it, with others, changing course, after it is done). The route draws above the canvas and lights one station, or two.
   - What do you already know? Deadline, people, what has been tried and what is at stake.
2. **Discern:** the coach names the obstacle in a few words (no clear priority, an avoided start, broken attention, too little capacity, other people, worn-out energy). It recommends one technique with one sentence on why, and names a sibling it passed over. If the whole project needs attention rather than one obstacle, it recommends **Getting a Project Done**, the book's seven-stage overview, whose stations link to the techniques the book points to at each stage. The person can accept or pick from the shelf.
3. **Work the technique:** slot by slot, exactly as in Decision Maker. Lenses are short: two sentences, one marker or one answer.
4. **Another angle:** at the technique's minimum, the coach offers one follow-up from `seeAlso` or `pairsWell`, or goes straight to Commit. One technique per session is the default; the book's advice is to try one thing, not to stack exercises.
5. **Commit:** the experiment tool (`gt_commit`, `step: 'commit'`, so no other book's settle tool joins Commit). Its slots are:
   - the result that matters;
   - the technique it rests on, with the chart nodes it uses;
   - the next action, small and visible;
   - when it starts: a cue or a protected time, which is text, not a timer;
   - the check-back date;
   - what would tell you to change course.

   The next action and the check-back date become confirm cards, so tasks are created only when you confirm.
6. **Record:** the action record composes from the session, never from coach free text, as Decision Maker's does. A confirm card writes it to the linked task or project page. It has a provenance graphic (the technique's and the section's emblems, captioned "Worked with The Get Things Done Book · <technique> · <date>"), a heading, rich-text sections and a link back. Later changes offer a dated update.
7. **Review:** on the check-back date, or with Review now, the session reopens on a short review of the experiment: what changed, what it cost and what to keep. For a finished project it opens **Project Evaluation** instead (fun, money and impact, for both the result and the way the work felt), including the luck-and-support question merged in from The Myth of Achievement. Live task statuses are the evidence. This reuses `reviewState` and `review.mjs`.

At each boundary the coach asks the one-shot learning question in its action form: "what did you learn about how you get things done?"

### Quick start

For a single stalled task. The flow is fixed data in `quick.mjs`, as in Decision Maker:

1. What needs to move?
2. The first small, safe action.
3. How it starts: a countdown cue (after The 5-Second Rule) or one protected interval (after Pomodoro). The person picks one.
4. The check-back point, optionally as a dated task.
5. Close with "What happened?" and "What next?".

The chart is a short route in the tool's style, with the chosen start drawn as the dart into the target. **It came back** adds a round. **Go deeper** moves to a full session, carrying the task and the first action. The quick run stays on that session's record. This route is our design, not the book's, and the coach never says otherwise.

## Catalogue

Chapter ranges are the printed book's. **W** is a worksheet, **L** a lens. Family is the shared renderer.

### Doing things (pp.5–49)

| Entry | Chapter | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Procrastination | 6–9 | list (checklist) | W | |
| The Pomodoro Technique | 10–11 | path (stages) | W | Three or four rounds, not a fixed four; no timer |
| Compartmentalisation | 12–15 | path (stages) | W | |
| Rapid Prototyping | 16–19 | path (stages) | W | Takes New Work's sprint and user-feedback steps |
| Bursty Communication | 20–23 | path (stages) | W | |
| Inbox Management | 24–27 | path (stages) | W | |
| Kanban | 28–31 | — | W | **Variant** of PS `kanban` (decision 2) |
| The 5 Whys Method | 32–33 | — | W | **Variant** of PS `five_whys` (decision 2) |
| The 5-Second Rule | 34–37 | quadrant | W | |
| Triage | 38–41 | path (flow) | W | |
| Paralysis by Analysis | 42–45 | list (checklist) | L | |
| The Book of Books | 46–50 | path (stages) | W | |

### What to do before you do anything (pp.51–85)

| Entry | Chapter | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Getting a Project Done | 52–55 | path (stages) | W | Seven stages; the route into the rest of the book |
| Budgeting | 56–57 | list | W | |
| Batching | 58–61 | list (routes) | W | |
| The Delphi Method | 62–65 | path (stages) | W | |
| The To-Do List | 66–69 | list | W | |
| Motivation | 70–71 | curve | L | Takes The Matthew Effect's small-wins step |
| Deep Work | 72–75 | list (checklist) | W | |
| Tactics Versus Strategies | 76–79 | quadrant | W | |
| Routines | 84–86 | list | W | Experiment with a review date; no tracking |

### How to get others to do things (pp.87–117)

| Entry | Chapter | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Appreciation | 88–91 | list | L | |
| Radical Transparency | 92–95 | list (checklist) | W | |
| Sandwich Feedback | 96–99 | list (routes) | L | The book questions the sandwich; the lens says so |
| Likeability | 100–103 | quadrant | W | |
| The Theory of Small Gifts | 104–107 | list (roles) | L | |
| Brainstorming | 108–113 | path (stages) | W | |
| Structured Evaluation | 114–118 | **ratings** (new) | W | Decisions 3–5 |

### Doing things differently (pp.119–143)

| Entry | Chapter | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| The Circle of Competence | 120–123 | list | W | |
| The 5/25 Rule | 124–127 | list | W | The twenty are dropped, not queued |
| The Circle of Influence | 128–131 | list | W | |
| Disruptive Innovation | 132–135 | list | L | |
| Kotter's 8-Step Model of Change | 136–139 | path (stages) | W | |

### What to do with the things you have done (pp.145–163)

| Entry | Chapter | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Project Evaluation | 146–149 | list (checklist) | W | Takes The Myth of Achievement's luck-and-support question; also powers Review |
| The Transactional Model | 154–157 | scales (axes, minimum 0) | W | Decision 6; dated snapshots |
| Journalling | 158–159 | path (stages) | W | |
| The Law of Reversed Effort | 160–164 | path (stages) | L | |

That makes 37 entries plus the Commit tool: 13 path, 16 list, 3 quadrant, 1 curve, 1 scales, 1 ratings and 2 Problem Solver variants.

## Design language

Gear Shifter is the third member of the set. It shares the grid, type, motion, cards, chips, coach panel, tray and skills ribbon through Problem Solver's components, as Decision Maker does. It brings its own tokens (`.gt-scope`) and shapes (`decor.ts`).

- **Palette (chosen by Adam on 22 Oct):** brighter than the pack's sampled cover colours, which read as muted. Paper `#fefdf6`, ink `#2a3340`, cobalt blue `#2b7de9`, vermilion `#ea4f2a`, and one accent, amber `#f5a623`, used sparingly (the centre gear, a done state, the odd highlight). The bright colours draw shapes, rings and gears; small text uses darker label shades that pass 4.5:1 on paper: blue `#2670d1`, red `#cd4524`, amber `#976615`. Tints: blue `#e4eefb`, red `#fbe9e4`, amber `#fcf3e3`. No green. The pack's emblems are recoloured to this set; their shapes are unchanged.
- **Geometry, after the book's cover:** a red gear held inside two blue circular arrows, a red-and-blue target with a slate dart, and a dotted divider. Blue carries process and routes; red marks the chosen work or goal. Strokes are 4, 6 and 9 units, with round joins and solid chunky arrowheads.
- **Telling it apart from Problem Solver:** both use red and blue, so shape does most of the work. Problem Solver is Bauhaus: saturated primaries with yellow, in squares, triangles and broken circles. Gear Shifter is concentric: whole rings, targets, gears, circular arrows and the dart, in a brighter cobalt and vermilion with an amber accent. Plan 1's mockups put all three tools side by side on the rail for Adam to check.
- **Shape board (landing hero):** a 4×3 board in the same place as its siblings'. Its tiles are a gear, a gear inside the return arrows, the target, the dart, the target with the dart in it, a blue cycle, a dotted divider with a forward arrow, four blocks in a row, a stack, a ring of five stations, a single red station on a blue route, and the book emblem.
- **Medal:** the cover, built as the session moves. The target fills with the frame answer, the cycle arrives with the route, the dart lands at Commit, and the main technique's emblem sits in the middle.
- **Track:** stations for Frame, Explore, Commit and Review, joined by a dotted line.
- **Route:** the five section emblems on a loop above the canvas, in place of Decision Maker's compass. The lit station is ringed and the rest are faded.
- **Coach avatar:** the gear inside the return arrows.
- **Emblems:** the pack's 35 entry emblems, 5 section emblems and identity marks, copied as they are into `packages/get-things-done/glyphs/`. Kanban and 5 Whys keep Problem Solver's glyphs. There is no emblem review round; any change goes on one contact sheet.

## Diagrams

The charts reuse Decision Maker's family factories and renderers. They move to a shared place, or Gear Shifter imports them from `packages/decision-book/`, whichever Plan 1 finds cleaner. They are re-skinned under `.gt-scope`. Each pack entry's `structure` becomes its config, which the checker has already built through the real factories.

Two changes:

- **scales:** the `axes` mode takes an optional `min` (default 1, so every existing tool is unchanged). The Transactional Model sets it to 0, with three axes in the book's arrangement and dated snapshots.
- **ratings (new family):** a factory and a renderer for Structured Evaluation. Up to seven ideas, the raters, and two or three criteria; each rater scores each idea on each criterion from 1 to 10. It shows the mean and the sample SD per idea and criterion and pooled, each rater's mean, each rater's own ranking, a written recommendation, and the decision owner. It never draws a winner. On a phone it reflows into one card per idea.

Kanban and 5 Whys keep Problem Solver's renderers. Those tools gain options (columns and the card fields for Kanban; the minimum and the stopping rule for 5 Whys) with defaults that leave Problem Solver unchanged.

The shared rules are Decision Maker's: render from session data, never shrink labels below 11px, reflow on phones, use text-labelled entry states, keyboard controls for every region, animate with `details.ts`, and assert each structure's order and positions in tests.

## Coach knowledge

The rubric reuses `prompts-shared.mjs` (voice, gatekeeping, output). Gear Shifter adds:

- **The book's stance, in our words:** these are tools to try, not rules; pick one, experiment, and keep what works. Getting more done is not the goal for its own sake.
- **The route**, and how to place a piece of work on it.
- **The obstacle names**, used in Discern.
- **Catalogue lines:** one line per entry (id, "use it when", `seeAlso`, `pairsWell`), all in the cached layer.
- **Traps to challenge:** planning as a way to avoid starting; a next action too big to start today; stacking techniques instead of trying one; mistaking busyness or hours for output; a check-back that never comes; blaming a person; expecting the app to run a timer or habit for you.
- **Per-technique notes,** sent only for the active technique: steps, slots, minimum, watch-fors and the exercise, from the pack's own-words fields, with the merged entries folded in.

Schema additions:
- `frame` keys `need`, `route` (`before | doing | others | differently | after`, up to two) and `known`;
- a `next_technique` suggestion kind, an alias of `next_tool` limited to Gear Shifter tools;
- a `quick` payload for Quick start.

## Architecture

The engine stays single, exactly as in Decision Maker:

| Unit | Change |
| --- | --- |
| `packages/get-things-done/` (new) | `catalogue.mjs`, `route.mjs`, `quick.mjs`, `record.mjs`, `model.mjs` (the plan: explore, commit, review), `tools/*.mjs` (configs plus notes, built through the family factories), `glyphs/`, `get-things-done.css` |
| `packages/problem-solver/tools/index.mjs` | Also registers the `gt_` tools, with steps that keep them off Problem Solver's and Decision Maker's shelves |
| `packages/problem-solver/tools/kanban.mjs`, `five-whys.mjs` | Gain options for the variants; defaults unchanged |
| `packages/decision-book/families/scales.mjs` | The optional `min` |
| `packages/decision-book/families/ratings.mjs` and its renderer (new) | Structured Evaluation |
| `session.mjs` | Two new kinds with their frame keys |
| `netlify/functions/get-things-done.mjs`, `get-things-done-run.mjs` | Thin wrappers over the shared factories, store prefix `get-things-done/v1` |
| `apps/tasks/src/views/get-things-done/` (new) | `view.ts`, `canvas.ts`, `decor.ts`, `route.ts`, `quick-view.ts`, `record-blocks.ts`, reusing Problem Solver's client pieces as Decision Maker does. Nav entry "Gear Shifter" in Tools; route `#/gear-shifter`; `gear_shifter` task source |
| `scripts/book-pack/` | A small importer that turns a pack's entries into tool configs, so the next book costs less again. It reads the private pack and writes code with no `anchor` text. It runs locally, never in CI |

Tasks hub writes, errors and confirm cards are Decision Maker's rules unchanged.

## Testing

- **Package:** the ratings factory (bounds, seven-idea cap, sample SD, rankings, no winner); scales with `min: 0`, while existing scale tools still reject 0; the Kanban and 5 Whys variants, with Problem Solver's tests unchanged; one config test per entry asserting its stage order, axes and regions; catalogue integrity (37 entries, every `seeAlso` and `pairsWell` resolves, every non-variant entry has an emblem); `quick.mjs` transitions; the record composer.
- **Copy check:** a test that fails if any shipped string shares eight words in a row with the pack's anchor quotes. It runs locally against the private pack, since CI cannot see it.
- **Server:** create, actions and frame keys for both kinds; parse refusing tools from other books; Problem Solver and Decision Maker behaviour unchanged.
- **Playwright,** desktop and 390px, on the mock API: a full session from frame through route, a recommended technique, Commit with both confirm cards, the record on a linked page and Review; a Quick start to done and to Go deeper; the three-way skills ribbon.
- **Live coach evaluation** with invented situations in each section.
- `npm run pre-pr-check` before the PR.

## Plans and build order

As with Decision Maker: one plan set, each plan written in full only once the one before has landed, and **one PR** at the end with auto-merge.

1. **Foundations:** engine seams, package scaffolding, catalogue, route, tokens, glyphs, the new kinds and `/api/get-things-done`, and mockups of the landing, session and three-tool rail. **Adam approves the design language before Plan 2.**
2. **Charts:** the scales `min`, the ratings family, the Kanban and 5 Whys variants, the `.gt-scope` re-skin, and one contact sheet.
3. **The techniques:** the importer, then configs and notes for all 37 entries, one section per commit (these can run in parallel).
4. **Coach, Commit, Record and Review:** rubric, catalogue lines, discernment, the Commit tool, the action record and Review.
5. **The app:** landing, session, route, medal, track and shelf; the record on a page; the mock API route.
6. **Quick start and checks:** the quick route, live coach evaluation, Playwright at both widths, `pre-pr-check` and the PR.

## Rough cost

Lower than Decision Maker's. The engine, server, bridges, coach pipeline and six of the eight chart families already exist. The pack has already done the reading, the structure checks and the emblems. The only new chart is the ratings family. Running cost per turn matches the other two tools.

## Open points for Adam

1. ~~The name~~: **Gear Shifter**, chosen by Adam on 22 Oct.
2. ~~Palette~~: cobalt, vermilion and an amber accent, chosen by Adam on 22 Oct. The side-by-side check with Problem Solver happens at the Plan 1 mockups.
