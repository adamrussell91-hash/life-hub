# Decision Maker: plan set

Spec: `docs/superpowers/specs/2026-10-21-decision-book-design.md`.
Branch: `claude/decision-book`, worktree `/Users/example/Projects/life-hub-decision-book`.

There are seven plans and **one PR**, opened at the end of Plan 7 with auto-merge, following the "Minimise PRs" rule. Each plan is written in full, with exact code, only once the plan before it has landed. Each one builds on real code rather than guesses, which is how Problem Solver's Plans 1–9 were run.

| Plan | Phase | Status | Ends with |
| --- | --- | --- | --- |
| 1 | Foundations | **Done** (`2026-10-21-decision-maker-plan-1-foundations.md`); design approved 21 Oct | Catalogue, compass, glyphs, tokens, the `decision` session kind, `/api/decision-book`, and mockups. **Adam approves the design language before Plan 2** |
| 2 | Charts | **Done** (`2026-10-21-decision-maker-plan-2-charts.md`) | Eight family renderers and the four re-skinned Problem Solver renderers, each tested on fixed inputs and checked once on a contact sheet |
| 3 | The models | **Done** (`2026-10-21-decision-maker-plan-3-models.md`) | Tool configs and coaching notes for all 52 entries, one section per commit (sections can run as parallel subagents) |
| 4 | The coach | **Written:** `2026-10-21-decision-maker-plan-4-coach.md` (code drafted and run green, then removed) | Shared rubric text, the Decision Maker rubric with catalogue lines, per-model notes, waiting, Eisenhower tasks, another angle, `next_model`, and the canvas map. Split from the old Plan 4 on 21 Oct, because the coach and the app were too much for one plan |
| 5 | Decide, Record and Review | **Done** (`2026-10-21-decision-maker-plan-5-decide-review.md`, HEAD `998e0f148`) | The decision record tool (`dm_record`) and Decide's step layer, reasons resting on model nodes (`basis`), the first step and review date as confirm cards, the record composed from the session with its provenance and update offers, Review on the feedback analysis via `reviewState`, and the scripted coach's whole decision. Split from the old Plan 5 on 21 Oct, because the server work and the app were too much for one plan |
| 6 | The app | **Done** (`2026-10-21-decision-maker-plan-6-app.md`, HEAD `54e9947fc`) | Nav and route; landing (hero, New decision, Quick decision placeholder, decisions with the medal, the four sections with Start from this, the shared skills ribbon); session (track, compass, canvas with strip, coach, tray, review panel, cards); Problem Solver's client taking a tool's API, look, origin, record and chips; the record on a page with its provenance image and graphic retry; the mock API route |
| 7 | Quick decision and checks | **Written:** `2026-10-21-decision-maker-plan-7-quick-checks.md` (code drafted, run green and walked in Playwright at both widths, then removed) | Quick route and Go deeper; light source check; live coach evaluation; Playwright walks at desktop and 390px; `pre-pr-check`; the PR |

## What each later plan must cover (from the spec)

**Plan 2: Charts**
- Family factories that meet the tool contract in `packages/problem-solver/machine.mjs`: `quadrantTool`, `plotTool`, `scalesTool`, `curveTool`, `tensionTool`, `pathTool`, `listTool`.
- Renderers in `packages/decision-book/render/` built on Problem Solver's `render/details.ts` helpers (animation, disclosure, `syncContested`, `destroy()`): quadrant, plot, scales, curve, tension, path, list and decision record.
- The kit's shared entry states (empty, populated, selected, contested, completed), each paired with a text label.
- Phone reflow below 480px; labels at least 11px.
- The re-skin of `swot`, `pareto`, `morphological` and `double_loop` under `.dm-scope`, with a fallback to the matching family renderer where a hard-coded colour breaks.
- The bespoke nine-dot puzzle and black box.
- One contact sheet for Adam.

**Plan 3: The models**
- Builders read each model's pages as images from `.db-book/` (never the OCR text).
- Each model gets a config: axes, labels, slots, minimum, tags, and the order and positions from its `model.json` "logic", turned into test assertions. Eisenhower, the feedback box and the feedback analysis are built to this edition.
- Each model gets a coaching note in our own words: what it is for, "use it when", its steps, and its watch-fors.
- Our own "pairs well with" links are added beside the book's `seeAlso`, marked as ours.
- Lenses are short: one idea, one marker or question.
- The tools are registered in `packages/problem-solver/tools/index.mjs` with `dm_` ids and `step: 'explore'`.

**Plan 4: The coach** (written, plus the canvas map, Eisenhower tasks, waiting and `next_model`)
- Move voice, gatekeeping and output out of `prompts.mjs` into `prompts-shared.mjs`, with Problem Solver's prompt text unchanged and checked by a snapshot test.
- The Decision Maker rubric, with catalogue lines (all 52) in the cached layer and only the active model's note per turn.
- Compass placement and discernment (recommend one model, name a sibling); "another angle"; the decision traps.

**Plan 5: Decide, Record and Review** (written)
- The Decide step's decision record tool (`step: 'settle'`, with the stop-rule trigger and action, first step and review date).
- Review via the feedback analysis on `reviewState`.

**Plan 6: The app** (written)
- The client in `apps/tasks/src/views/decision-book/`: nav "Decision Maker" at `#/decision-maker`. It reuses Problem Solver's coach panel, task cards, review panel, bridges, link chips and API client, given a base path.
- The new client pieces, in the approved circle-and-arrow design: compass, medal, track and shape board.
- The decision record on a linked page: its page blocks with a provenance image block, the bridge with a graphic retry, and the mock API's `/api/decision-book` route.
- The shared skill tally ribbon on both landing pages.

**Plan 7: Quick decision and checks** (written)
- `packages/decision-book/quick.mjs` as data: decision, then three yes/no questions, then proceed or not, then a Stop Rule, then learn and next.
- A `quick` session kind on `/api/decision-book`, with its chart, It came back, and Go deeper (which carries the decision and criteria into a full session).
- The light check of Drexler/Sibbet, Hersey–Blanchard, Belbin, Whitmore and de Bono against their sources.
- The live coach evaluation script.
- Playwright walks at both widths, then `npm run pre-pr-check`.
- The PR, marked ready with auto-merge.
