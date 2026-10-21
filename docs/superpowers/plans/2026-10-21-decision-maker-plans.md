# Decision Maker: plan set

Spec: `docs/superpowers/specs/2026-10-21-decision-book-design.md`.
Branch: `claude/decision-book`, worktree `/Users/adamrussell/Projects/life-hub-decision-book`.

There are five plans and **one PR**, opened at the end of Plan 5 with auto-merge, following the "Minimise PRs" rule. Each plan is written in full, with exact code, only once the plan before it has landed. Each one builds on real code rather than guesses, which is how Problem Solver's Plans 1–9 were run.

| Plan | Phase | Status | Ends with |
| --- | --- | --- | --- |
| 1 | Foundations | **Done** (`2026-10-21-decision-maker-plan-1-foundations.md`); design approved 21 Oct | Catalogue, compass, glyphs, tokens, the `decision` session kind, `/api/decision-book`, and mockups. **Adam approves the design language before Plan 2** |
| 2 | Charts | **Done** (`2026-10-21-decision-maker-plan-2-charts.md`) | Eight family renderers and the four re-skinned Problem Solver renderers, each tested on fixed inputs and checked once on a contact sheet |
| 3 | The models | **Written:** `2026-10-21-decision-maker-plan-3-models.md` (code drafted and run green, then removed) | Tool configs and coaching notes for all 52 entries, one section per commit (sections can run as parallel subagents) |
| 4 | The coach and the app | To write after Plan 3 | Decision Maker prompt and discernment, Decide and Review, the landing and session pages, decision record with provenance, and the shared skill tally |
| 5 | Quick decision and checks | To write after Plan 4 | Quick route and Go deeper; light source check; live coach evaluation; Playwright walks at desktop and 390px; `pre-pr-check`; the PR |

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

**Plan 4: The coach and the app**
- Move voice, gatekeeping and output out of `prompts.mjs` into `prompts-shared.mjs`, with Problem Solver's prompt text unchanged and checked by a snapshot test.
- The Decision Maker rubric, with catalogue lines (all 52) in the cached layer and only the active model's note per turn.
- Compass placement and discernment (recommend one model, name a sibling); "another angle"; the decision traps.
- The Decide step's decision record tool (`step: 'settle'`, with the stop-rule trigger and action, first step and review date).
- Review via the feedback analysis on `reviewState`.
- The client in `apps/tasks/src/views/decision-book/`: nav "Decision Maker" at `#/decision-maker`. It reuses Problem Solver's coach panel, task cards, review panel, bridges, link chips and API client, given a base path.
- The new client pieces: compass, square medal, square track, shape board and the decision record with a provenance image block.
- The shared skill tally ribbon on both landing pages.

**Plan 5: Quick decision and checks**
- `packages/decision-book/quick.mjs` as data: decision, then three yes/no questions, then proceed or not, then a Stop Rule, then learn and next.
- A `quick` session kind on `/api/decision-book`, with its chart, It came back, and Go deeper (which carries the decision and criteria into a full session).
- The light check of Drexler/Sibbet, Hersey–Blanchard, Belbin, Whitmore and de Bono against their sources.
- The live coach evaluation script.
- Playwright walks at both widths, then `npm run pre-pr-check`.
- The PR, marked ready with auto-merge.
