# Decision Maker: a coached decision tool beside Problem Solver

Date: 21 October 2026. Status: decisions taken with Adam on 21 Oct; awaiting written-spec review.
Builds on: `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md` (Problem Solver v2, on `main`).

## Goal

**Decision Maker** is a second coach tool in the Tasks hub, built from *The Decision Book* (Krogerus and Tschäppeler: 51 models and a closing essay, in four sections). Its nav label is "Decision Maker". In code it goes by `decision-book`, after its source, the same way Problem Solver's code is named after its toolkit. It looks and works like Problem Solver. You name a decision, or something you want to see clearly. The coach frames it, works out which model or models fit, and builds each model's chart with you one answer at a time. It then helps you settle the decision and writes a decision record onto a linked Tasks page. A short "Quick decision" route covers everyday calls. Both tools share the same twelve thinking skills and a single skills tally.

Not in scope:
- the book's "Now it's your turn" model and drawing lessons, and any free-drawing "My models" canvas (cut by Adam on 21 Oct);
- Teaching blocks;
- a student-safe coach.

## Sources and the public-repo rule

- **Primary:** the book's chapter scans in `~/Desktop/Decision Book Graphics/The_Decision_Book_Chapter_PDFs/`, printed pp.10–149, plus "Instructions for use" (p.6). The text layer is OCR and is unreliable on diagram pages. Build agents read the pages as images, rendered with `pdftoppm -r 100` into a git-excluded `.db-book/`, as `.ps-book/` was for Problem Solver.
- **Graphics:** `~/Desktop/Decision Book Graphics/` holds original artwork made for this project, so it can be committed. It contains:
  - four approved section emblems (`decision-book-assets/sections/`);
  - one package per model under `decision-book-section-0N/tools/*/`, with an emblem, blank and sample charts, a summary card, `model.json`, elements, and shared entry states and tokens;
  - the completion kit's identity marks and pictograms.

  Adam is happy with these and invites improvements. The sample text in `chart-example.svg` is illustrative only and never ships as content.
- **Supporting:** for about five models with a fixed published structure, a light check against the original source, so stage names and order are exact: Drexler/Sibbet's seven stages, Hersey–Blanchard's four styles, Belbin's nine roles, Whitmore's criteria (SMART, PURE, CLEAR) and de Bono's six hats. No broad research. The book is the authority for its own models. Many models (the rubber band, gift, energy, unimaginable, making-of, crossroads, result optimisation, expectations and buyer's decision models, and the Stop Rule) exist only in this book.
- **Public repo:** life-hub is public. All book knowledge goes into code in our own words, with at most short attributed quotes. No transcribed book text goes in the repo, tests, fixtures or prompts, and no scans or page renders are committed.
- **Scan gaps (accepted):**
  - the first contents page and the section dividers;
  - pp.150–151;
  - "My models" onward (p.158 on), which is out of scope anyway.

## How much the book gives, and what we write

For each model the book gives about a page of essay and a diagram page. Many models add a short "proceed as follows" exercise and a "see also" pointer to related models. Together with each `model.json` (fields and layout rules), that settles what the model is, its axes and fields, and the book's exercise.

The book does not give the coaching layer: step order, a minimum before a model counts as done, the mistakes the coach challenges, and when-to-use guidance precise enough for choosing between models. We write that layer per model, in our own words. It comes from a close reading of the pages, our own knowledge of well-known models, and the light check above. The "see also" pointers become a graph the coach uses to offer "another angle".

## Decisions taken with Adam (21 Oct)

| Topic | Decision |
| --- | --- |
| Name | "Decision Maker" in the nav (`#/decision-maker`); `decision-book` in code |
| Placement and layout | Same as Problem Solver: its own Tasks hub tab. The landing page has a hero, a start box, a quick-route card and a list of decisions. The session page has the canvas on one side, the coach on the other, a skill tray, a review panel and task cards |
| Session shape | Frame the decision, then the coach discerns the right model or models, works them, offers another angle, then settles the decision. The four sections are for browsing, not stages |
| Scope | All 51 models and the closing essay. 45 are coached worksheets and 7 are lenses (see Catalogue). The builder chose this scope |
| Overlap with Problem Solver | Reuse wherever the book's meaning matches, to minimise build and runtime tokens. See "Reuse" |
| Output | A decision record written to a linked task or project page, behind a confirm card. A graphic block shows where it came from (book, section and model emblems) and links back to the session. A dated review task is also created |
| Graphics | The kit's assets are approved as they are. Improvements are allowed where they help |
| Quick route | Yes, built from the Yes/No rule and the Stop Rule. It can move up to a full session, as Lightning does |
| Thinking skills | The same twelve skills, with one shared tally across Problem Solver and Decision Book. The landing ribbons show a small split of how much came from each tool |
| My models / model lesson | Cut |
| Research | No broad research. Close reading plus a light check of the five structured models |

## Experience

### Landing (`#/decision-maker`)

The landing page mirrors Problem Solver's, in the Decision Book palette (paper `#faf8ef`, ink `#171813`, red `#ef402b`, green `#60aa36`):

- **Hero:** the book emblem, one line, a **New decision** box ("What are you deciding, or trying to see clearly?") and a **Quick decision** card.
- **Decisions:** one card per session. The medal is the section emblem with the main model's emblem at its centre. The meta line shows the phase, the model and the date.
- **The four sections:** the section emblems, each opening its shelf of model emblems with a one-line "use it when". This is the browse view. Starting a decision from a model here opens a session already on that model.
- **Thinking skills you have used:** the shared tally, with a two-tone split for Problem Solver and Decision Book. The same ribbon replaces the one on the Problem Solver landing page.

### Full session

1. **Frame (three questions, one at a time):**
   - What are you deciding, or trying to understand? The answer is one sentence.
   - Who is it about, and what do you want? This places the question on the **section compass**: about me or about others, understand or improve. That is the book's four sections as a 2×2. The compass draws above the canvas and lights one quadrant, or two when the question spans both.
   - What do you already know? Options, facts, the deadline and what is at stake.
2. **Discern:** the coach recommends one model and gives one sentence on why, naming a sibling it passed over (as Problem Solver does with tools). It draws from the compass quadrant, the models' "use it when" lines and the frame. Like any suggestion, the person can accept it, or pick from the shelf instead.
3. **Work the model:** slot by slot, exactly as in a Problem Solver tool, with the same accept, challenge and clarify rules and Keep it anyway. Lenses are short: the coach explains the idea in two sentences, the person places one marker or answers one question, and the lens is done.
4. **Another angle:** when a model meets its minimum, the coach offers one follow-up from the "see also" graph or the compass, or offers to go straight to Decide. Every model run stays on the record. Switching away mid-model marks that run `switched`, as in Problem Solver.
5. **Decide:** the decision record tool. Its slots are:
   - the decision;
   - the reasons, linked to the model nodes they rest on;
   - what would make me rethink, which is a **Stop Rule**: a trigger and a pre-agreed action;
   - the first step;
   - the review date.

   The first step and the review become confirm cards, so real tasks are created only when you confirm.
6. **Record:** the decision record composes from the session, never from coach free text, as Problem Solver's case file does. A confirm card writes it to the linked task or project page, or offers to create a project first. The blocks are:
   - a **provenance graphic**: the main model's emblem and the section emblem, with the caption "Decided with The Decision Book · <models> · <date>";
   - a heading and rich-text sections;
   - a link back.

   Later changes offer a dated update, as the case file does.
7. **Review:** on the review date, or when the person presses Review now, the session reopens on the book's **feedback analysis**. It compares what you expected when you decided with what happened, then records the difference and what you learned. Live task statuses are the evidence. This reuses Problem Solver's `reviewState` and `review.mjs`.

At each boundary (leaving a model and leaving Decide), the coach asks Problem Solver's one-shot learning question in its decision form: "what did you learn about how you decide?"

### Quick decision

This route is for small, everyday calls. Its flow is fixed data in `quick.mjs`, as `lightning.mjs` is for Lightning:

1. State the decision.
2. **Yes/No rule:** the coach helps you set three yes/no questions. The book's are close to: do I want it, can I, and is it worth it? Ask them in order. Any "no" means do not proceed.
3. If you proceed, **Stop Rule:** set one unconditional trigger and the action it forces.
4. Optionally, a dated check task.
5. Close with "What did I learn?" and "What next?".

The chart is the Yes/No flow drawn in Decision Book style, with your path inked and the stop rule as an if/then band underneath. **It came back** adds a round. **Go deeper** moves to a full session, carrying over the decision, the criteria and their answers. The quick run stays on that session's record.

## Catalogue

Page numbers are the book's printed pages. Family is the shared renderer (see Diagrams). **W** means a coached worksheet; **L** means a lens: one idea, one marker or question.

### How to improve yourself (pp.10–49)

| Model | Pages | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Eisenhower matrix | 10–11 | quadrant | W | This book's labels and axes (decide when, do immediately, do later, delegate); "do immediately" items can become tasks |
| SWOT analysis | 12–13 | quadrant | W | **Reuses** PS `swot` |
| BCG box | 14–15 | quadrant | W | Question marks, stars, dogs, cash cows; optional size |
| Project portfolio matrix | 16–19 | plot | W | Two separate plots, never merged axes; bubble size |
| Feedback analysis | 20–21 | tension | W | Expected before acting, actual later. Also powers Review |
| John Whitmore model | 22–23 | list | W | 14 criteria (SMART, PURE, CLEAR), with evidence for each |
| Rubber band model | 24–25 | tension | W | What holds you, what pulls you |
| Feedback box | 26–27 | quadrant | W | Advice, compliment, criticism, suggestion (this edition's meanings) |
| Yes/No rule | 28–29 | path | W | Also the quick route |
| Choice overload | 30–31 | curve | L | U-shaped curve, no magic number |
| Gap-in-the-market model | 32–33 | plot | W | Three dimensions the person defines, shown as pairwise views; an empty space is not proof of demand |
| Morphological box and SCAMPER | 34–37 | table | W | **Reuses** PS `morphological`, with a SCAMPER companion pass |
| Gift model | 38–39 | plot | W | Expense against value to the recipient |
| Thinking outside the box | 40–41 | one-off | L | The nine-dot puzzle: try first, reveal on request |
| Consequences model | 42–43 | curve | L | Knowledge rises over time while the consequences of deciding fall |
| Theory of unconscious thinking | 44–45 | path | W | Decide, step away, return. The "step away" can be a dated nudge, not a timer |
| Stop Rule | 46–47 | path | W | Also used in Decide and the quick route |
| Buyer's decision model | 48–49 | path | W | Bound the research; rank five criteria and keep three; 10 days, 10 months, 10 years; another person's view |

### How to understand yourself better (pp.52–81)

| Model | Pages | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Flow model | 52–53 | plot | W | Challenge against ability, with a flow band |
| Johari window | 54–55 | quadrant | W | Keep the axis orientation; self and others' adjectives |
| Cognitive dissonance | 56–57 | tension | W | Belief against behaviour; change one of them |
| Unimaginable model | 58–59 | quadrant | W | Provable or not, imaginable or not |
| Uffe Elbæk model | 60–61 | scales | W | Four pole pairs, each summing to ten; current and desired lines; four perspectives |
| Energy model | 62–63 | scales | W | Shares of past, present and future summing to 100%; no regional stereotypes |
| Political compass | 64–65 | plot | W | Only positions the person supplies |
| Personal performance model | 66–67 | scales | W | Have to, able to, want to (1–10), dated "sails" |
| Making-of model | 68–71 | list (lanes) | W | Six lanes over a chosen timeframe; luck recorded explicitly |
| Personal potential trap | 72–73 | curve | W | Three series kept distinct; no predictions |
| Hard choice model | 74–75 | quadrant | W | Comparability against consequence |
| Cognitive bias | 76–77 | list | W | Four errors, each with assumption, reality and counter-check |
| Crossroads model | 78–81 | list (routes) | W | Five reflective questions, then six routes |

### How to understand others better (pp.84–123)

| Model | Pages | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Rumsfeld matrix | 84–87 | quadrant | W | This book's row order; unknown unknowns become questions and contingencies |
| Swiss cheese model | 88–91 | path (layers) | W | Four defences, their holes, and whether the path is aligned or blocked |
| Maslow pyramids | 92–93 | list (pyramid) | W | Upright needs paired with inverted wants |
| Sinus Milieu and Bourdieu | 94–97 | plot | L | Two separate maps; place yourself; a simplified historical reference |
| Double-loop learning | 98–101 | path | W | **Reuses** PS `double_loop`, adding espoused theory against theory in use |
| AI (appreciative inquiry) | 102–103 | quadrant | W | AI here means appreciative inquiry; four discussion types |
| Pareto principle | 104–105 | table | W | **Reuses** PS `pareto` |
| Long-tail model | 106–107 | curve | L | Head against tail |
| Conflict resolution | 108–111 | list | W | Six responses; compromise is not consensus |
| Black swan model | 112–113 | curve | W | Assumption, past pattern, surprise and contingency |
| Chasm (diffusion) | 114–117 | curve | W | Where the idea stands, and the evidence needed to cross |
| Black box model | 118–119 | one-off | L | Input, opaque process, output; and how to verify |
| Prisoner's dilemma | 120–123 | quadrant (payoff) | W | This edition's sentences; history of repeated rounds |

### How to improve others (pp.126–149)

| Model | Pages | Family | Tier | Notes |
| --- | --- | --- | --- | --- |
| Team model | 126–127 | scales | W | Skills on 0–10 with critical lines; member profiles; no single team score |
| Hersey–Blanchard | 128–131 | quadrant | W | Four styles placed as in the book; a development path |
| Role-playing (Belbin and de Bono) | 132–135 | list (hats) | W | Six hats as one shared pass; Belbin's nine roles as a companion |
| Result optimisation | 136–137 | path (loops) | W | Three complete gather–consolidate–implement loops |
| Project management triangle | 138–139 | tension (triangle) | W | Pick two; name the cost |
| Drexler/Sibbet team performance | 140–143 | path (stages) | W | Seven stages, resolved and unresolved keys; stages can be revisited |
| Expectations model | 144–145 | curve | W | Find the tipping point; what could be relaxed? |
| How will we decide in the future? | 146–149 | curve | L | Closing essay: human judgement and responsibility |

That makes 52 entries: 45 worksheets and 7 lenses (choice overload, thinking outside the box, consequences, Sinus/Bourdieu, long tail, black box and the closing essay).

### Reuse from Problem Solver

The overlap is narrower than the names suggest:

- **Reuse the PS tool unchanged:** `swot`, `pareto`, `morphological` and `double_loop`. The book's meaning matches, so the slots, rules and coaching notes carry over. Their renderers are re-skinned with Decision Book tokens (red stays red, yellow becomes green, blue becomes ink). That is checked per renderer, with the matching family renderer as the fallback where a hard-coded colour breaks it.
- **Same idea, the book differs, so build to this book:** the **Eisenhower matrix** (this edition labels the quadrants decide when, do immediately, do later and delegate, with urgency rising to the right), the **feedback box** (not PS's feedback matrix) and the **feedback analysis**. These use the quadrant and tension families. Faithfulness to the book wins over reuse.

## Design language: part of a set

Decision Maker should look like Problem Solver's sibling: clearly from the same family, with its own voice. Both draw on Bauhaus: flat colour, pure geometry, no gradients or shadows, a quiet paper ground, and type and ink doing the structural work.

**Shared with Problem Solver (the set):**
- The page grid, the placement of hero, start box, quick card, list, sections, bench and coach, and the section heads (title plus aside).
- The hub's UI font and type scale. The kit's Arial is replaced after line lengths are checked, as its README allows.
- The motion curves (`ease` and `spring`) and timings: shapes drop in on arrival, the board swaps a tile every couple of seconds, reduced motion is respected, and the thinking dots are the same.
- The twelve skill marks, drawn the same way, in ink.
- Confirm cards, chips, the skill tray and the coach panel. Their structure is shared and the tokens are swapped.
- One shared skills ribbon, with the tool split described above.

**Decision Maker's own voice:**
- **Palette:** paper `#faf8ef`, ink `#171813`, red `#ef402b`, green `#60aa36`, with their two tints. No yellow and no blue, so the two tools never blur together on the same rail.
- **Geometry: square-led, where Problem Solver is circle-led.** Problem Solver's shapes are discs, semicircles and arcs, after Kandinsky. Decision Maker's are squares, quarters, halves, diagonals and the fork, after Albers and the Bauhaus grid. The kit's emblems already work this way (the Eisenhower emblem is four squares and a tick).
- **Shape board (landing hero):** a 4×3 board of square tiles, in the same place as Problem Solver's board. The tiles are a 2×2 of quarter squares, a diagonally split square, a square with a quarter-circle cut, a forked Y path, a stepped stair, two opposed triangles in a square, a square with an inset square, and a bar split two ways. The colours are red, green, ink and tint.
- **Medal:** square, where Problem Solver's is round. It is a 2×2 that fills one quarter per framing answer (decision, compass, known), and a fourth quarter once a model is worked. The main model's emblem sits on top once chosen.
- **Track:** square stations for Frame, Explore, Decide and Review, joined by a ruled line, in the same place as Problem Solver's track.
- **Section compass:** the four approved section emblems in a 2×2 above the canvas, with the lit quadrants at full strength and the rest in tint.
- **Coach avatar:** Problem Solver's avatar construction, built from squares.

The shared structure lives once, in Problem Solver's components, which take a token scope and a shape set. Decision Maker supplies `.dm-scope` tokens and `decor.ts` shapes rather than copies of the components.

## Diagrams

### Families, not 50 one-offs

Problem Solver's renderers average about 440 lines each, so 50 bespoke renderers would cost far too much. Instead, eight family renderers in `packages/decision-book/render/` each take a per-model config: axes, labels, quadrant names, scale rules, series and lanes. Every model is a config file plus a short coaching note.

| Family | Draws | Used by |
| --- | --- | --- |
| quadrant | 2×2 with labelled axes; entries as pills sorted into named cells; a payoff-cell variant | Eisenhower, BCG, feedback box, Johari, unimaginable, hard choice, Rumsfeld, AI, Hersey–Blanchard, prisoner's dilemma |
| plot | Two qualitative axes (1–10); entries as markers, optional bubble size, optional band, optional multiple plots | project portfolio, gap in the market, gift, flow, political compass, Sinus/Bourdieu |
| scales | Pole scales and profiles: paired poles summing to ten, independent 1–10 axes (sail or radar), shares summing to 100; dated overlays | Elbæk, energy, personal performance, team model |
| curve | A conceptual curve or curves drawn from config, never from data, with the person's marker or points and notes | choice overload, consequences, potential trap, long tail, black swan, chasm, expectations, closing essay |
| tension | Two or three forces: holds against pulls, belief against action, expected against actual, the pick-two triangle | rubber band, cognitive dissonance, feedback analysis, PM triangle |
| path | Ordered steps, flows and stages, with yes/no branches, layers with holes, repeated loops and revisitable stages | Yes/No rule, Stop Rule, buyer's decision, unconscious thinking, Swiss cheese, result optimisation, Drexler/Sibbet |
| list | Structured lists with layout variants: criteria checklist, bias rows, lanes, routes, pyramid, hats and roles | Whitmore, cognitive bias, conflict resolution, crossroads, making-of, Maslow, Belbin and de Bono |
| decision record | The Decide step's chart: the decision, its reasons tied to their model nodes, the stop-rule band and the review date | Decide |

Two one-offs, the nine-dot puzzle and the black box, are small enough to stay bespoke. The four reused PS tools keep their PS renderers.

### Shared rules (from the kit's README files, kept)

- The SVG masters are references. The charts render from session data, with HTML text and SVG geometry, and no sample coordinates or numbers are hard-coded.
- On phones (up to 480px), the layout reflows into labelled HTML cards or an outline. Desktop charts are never shrunk until their labels are unreadable. Diagram labels are at least 11px.
- Entry states use the kit's shared states: empty, populated, selected, contested (exclamation mark) and completed (tick). Each pairs with a text label, and no meaning depends on colour alone.
- Every interactive region has a keyboard-accessible HTML control.
- Charts animate entries on arrival with the shared `details.ts` helpers. Reduced motion is respected.
- Each renderer keeps its axis meanings and order exactly as in `model.json` "logic". Those lines become test assertions.

### Emblems and identity

The kit's 52 emblems (51 models and the closing essay), the four section emblems, the book emblem and the wordmark are copied as-is into `packages/decision-book/glyphs/`. Because Adam has approved them, there is no emblem review round. Any improvement a builder makes goes on one contact sheet for a single look.

## Coach knowledge

The fixed rubric is cached. **Voice**, **gatekeeping** and the **output schema** are moved out of Problem Solver's `prompts.mjs` into a shared module (`prompts-shared.mjs`), so both tools use one text and one cache entry. Decision Book adds:

- **The book's stance**, in our words: models simplify and ask questions rather than give answers, and answers come from working them.
- **The section compass**, and how to place a question on it.
- **Catalogue lines:** one line per model, giving its id, "use it when" and "see also". These are short, so all 52 fit in the cached layer and the coach can discern without loading full notes.
- **Decision traps to challenge**, alongside Problem Solver's list:
  - deciding before the options are on the table;
  - a single option dressed up as a choice;
  - criteria nobody can check;
  - the sunk-cost pull, status-quo bias and overconfidence;
  - letting availability or an anchor set the answer;
  - blaming a person;
  - a "decision" with no first step and nothing that would make you rethink.
- **Per-model notes**, sent only for the active model as a separately cached block: steps, slots, minimum, watch-fors and the book's exercise. This keeps per-turn tokens near Problem Solver's.

The coach schema is unchanged apart from three additions:

- `frame` keys are `decision`, `compass` (`self_understand | self_improve | others_understand | others_improve`, up to two) and `known`;
- a `next_model` suggestion kind, an alias of `next_tool` limited to Decision Book tools;
- a `quick` payload for the quick route, shaped like `lightning`.

## Architecture

### Engine: one engine, two books

The step engine, machine, service, store, runner and coach pipeline all stay single. Decision Book plugs into them:

| Unit | Change |
| --- | --- |
| `packages/decision-book/` (new) | `catalogue.mjs` (52 entries: id, section, family, tier, pages, when, seeAlso), `compass.mjs`, `quick.mjs`, `record.mjs` (decision record composer plus digests, like `case-file.mjs`), `tools/*.mjs` built with family factories (`quadrantTool`, `plotTool`, …) that meet the existing tool contract (`slots`, `nextSlots`, `complete`, `edgeKinds`, `nodeTags`, `validateNode`, `taskSlots`), `render/*.ts`, `glyphs/`, `decision-book.css` |
| `packages/problem-solver/tools/index.mjs` | Also registers the Decision Book tools. Their ids start with `dm_`, and their `step` values (`explore`, `settle`, `review`) are not toolkit steps. So Problem Solver's shelves, plans and prompts never list them, with no `book` field needed. The four reused tools keep their Problem Solver ids and steps |
| `packages/problem-solver/steps.mjs` | A plan entry can name its tools explicitly. Decision Maker's `decision_book` model, defined in `packages/decision-book/model.mjs` so Problem Solver's `MODELS` and its coach never see it, plans `explore` (every catalogue model registered as a tool), `decide` (the decision record) and `review` (feedback analysis, extra). An explicit list has no default tool, because the coach discerns it |
| `session.mjs` | Frame keys per session kind instead of the constant `FRAME_KEYS`; `kind: 'decision' \| 'quick'` |
| `service.mjs`, `store.mjs`, `problem-solver.mjs` | The handler and service factories take `{ prefix, prompts, kinds }`. `netlify/functions/decision-book.mjs` and `decision-book-run.mjs` are thin wrappers over the same factories, with store prefix `decision-book/v1` |
| `prompts-shared.mjs` (new) | Voice, gatekeeping and output, moved out of `prompts.mjs` unchanged |
| `review.mjs` | Unchanged. Decision Book's review step uses it as Improve does |

### Client (`apps/tasks/src/views/decision-book/`)

- `view.ts` contains the landing and session pages, with nav entry `Decision Maker` at `#/decision-maker`.
- Reused from Problem Solver, given a base path and a renderer map: `api.ts`, `coach-panel.ts`, `task-cards.ts`, `task-bridge.ts`, `review-panel.ts`, `review-sync.ts`, `session-sync.ts`, `case-file-bridge.ts` (with record blocks) and `link-chips.ts` (which gains a Decision Book chip).
- New: `canvas.ts` maps tools to family renderers; also `compass.ts`, `quick-view.ts`, and `record-blocks.ts`, which builds the provenance image block from the shipped emblem assets.
- Shared skill tally: both landing pages fetch both lists and sum `skills`, then draw the split ribbon.

### Tasks hub writes

These are exactly Problem Solver's rules. The page writes through `tasksApi` and the page-block API behind confirm cards; the server never writes Tasks. The provenance graphic is an `image` block whose source is the model emblem served from the Tasks build's static assets. The caption and the link back go in the rich-text block after it.

### Errors

These are Problem Solver's, plus:

| Failure | Behaviour |
| --- | --- |
| Coach suggests a toolkit tool in a decision session (or the reverse) | Refused at parse with the allowed list; one repair, as now |
| Image block write fails | The record still writes as text; the card offers to retry the graphic |
| Quick answer on a stale node | 409, then refetch |

## Testing

- **Unit, package:**
  - each family factory (slots, order, minimums, tags, scale rules such as sums of ten and of 100%);
  - one config test per model, asserting its `model.json` logic (axis direction, quadrant positions, edition labels);
  - catalogue integrity (52 entries; every `seeAlso` resolves; every tool has an emblem);
  - `quick.mjs` transitions;
  - the record composer and its digests;
  - family renderers for fixed inputs (empty, partial, full, contested, phone reflow).
- **Unit, server:**
  - the factories still give Problem Solver identical behaviour (every existing test stays green);
  - Decision Book create, actions and frame keys;
  - parse refusing tools that are not in the session's current plan step;
  - quick create, answer and escalate.
- **Playwright**, on the Tasks mock API at desktop and 390px:
  - a full decision from frame through compass, a recommended model, another angle, Decide with stop rule, record on a linked page and review;
  - a quick decision to "proceed" and to Go deeper;
  - the shared skills ribbon on both landing pages.
- **Live coach evaluation** (not CI), with invented decisions in each section. The coach should:
  - recommend a sensible model and name a sibling;
  - challenge a single option dressed as a choice, sunk cost and uncheckable criteria;
  - accept strong answers without flattery;
  - keep to the word limits.
- `npm run pre-pr-check` before the PR.

## Build order (one PR, commits in order)

1. Engine seams: explicit plan-step tool lists, frame keys per kind, the factories taking prefix and prompts, and `prompts-shared.mjs`. Problem Solver behaviour stays unchanged, with all tests green.
2. `packages/decision-book` scaffolding: catalogue, compass, tokens, glyphs and section emblems.
3. Family factories and family renderers (quadrant, plot, scales, curve, tension, path, list, decision record), plus the re-skin of the four reused Problem Solver renderers.
4. Section 1 configs and coaching notes (18 models; Eisenhower, feedback box and feedback analysis built to this edition).
5. Section 2 configs and notes (13).
6. Section 3 configs and notes (13), with the two one-offs.
7. Section 4 configs and notes (7, plus the closing essay).
8. Server: endpoint, run function, prompts and discernment, the Decide step, and Review via feedback analysis.
9. Client: landing, session page, compass, shelf, decision record with provenance on a linked page, link chips, and the shared skill tally on both landing pages.
10. Quick decision: flow, chart, card, It came back, and Go deeper.
11. Light source check of the five structured models; live coach evaluation; Playwright at both widths; `pre-pr-check`; PR marked ready with auto-merge.

Steps 4–7 are independent once step 3 lands, so they can run as parallel subagents.

## Rough cost

Problem Solver is the yardstick. Its build involved more bespoke work than this one: 38 one-off renderers, the Lightning chart, the step engine and the Tasks bridges. This build reuses that engine, the server, the bridges and the coach pipeline, and draws its charts with about 10 renderers. So it should cost **less to build than Problem Solver did**.

The main things that would raise it are review loops for each model and bespoke charts. The plan avoids both: one review pass per renderer type and one contact-sheet check.

Running costs are the same as Problem Solver's. It uses the same model and pipeline. Each turn sends the cached shared rubric plus one model's notes, so each turn should cost about the same as a Problem Solver turn today.

## Open points for Adam

1. The seven lenses: is it fine that they are short one-marker cards rather than full worksheets?
