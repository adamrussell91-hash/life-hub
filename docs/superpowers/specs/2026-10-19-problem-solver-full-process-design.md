# Problem Solver: the full process and Lightning (v2)

Date: 19 October 2026. Status: design approved section by section in brainstorm; awaiting written-spec review.
Builds on: `docs/superpowers/specs/2026-10-16-problem-solver-design.md` (v1: Frame and Define, on `main`).

## Goal

Finish the Problem Solver so a problem can be taken through every step of the toolkit's process (Define, Analyse, Devise, Decide, Implement, Improve, Document), with a coach that knows the whole book deeply, a well-designed animated chart for every tool, the book's Final words woven through every step, and a black-and-white **Lightning problem solving** flowchart on the landing page.

Not in scope: Tasks and Teaching blocks, the student-safe coach, the toolkit badge swap (all still later phases).

## Sources and the public-repo rule

- Primary: the toolkit book. v1 used pp.12–61. This spec adds pp.63–163 (scanned 19 Oct 2026): the six step chapters, Lightning problem solving (pp.155–159), Final words (pp.160–162) and the emblem sheet (p.163).
- Supporting: only the primary sources the book itself cites, used to sharpen challenge triggers and failure modes: Kahneman (fast and slow thinking), Lewin (force field), Argyris and Schön (double-loop), Zwicky (morphological box, cross-consistency assessment), Newell and Simon (problem reduction), Holyoak and Thagard (analogical reasoning loop), Matsumura (lotus blossom), Duncker (functional fixedness), Morrison and Meliza (after action review), Pareto, Doran (SMART), Polya.
- life-hub is a public repository. All book knowledge in code is written **in our own words**, with at most short attributed quotes. No transcribed book text in the repo, tests, fixtures or prompts.
- **Open dependency:** the process layer of the coach's knowledge (see Coach knowledge) is written from pp.12–61, which must be rescanned and supplied before that commit. Everything else in this spec stands without it.

## Decisions taken in brainstorm

| Topic | Decision |
| --- | --- |
| Lightning location | Problem Solver landing page, beside "New problem" |
| Lightning mode | Coach-led; the chart builds as you answer; saved |
| Lightning chart | Ghost map: the whole book flowchart faint, your path inked solid black |
| Lightning close | Add "What can I learn?" and "What next?" nodes after Relax / cannot-solve (the book's p.157 questions) |
| Lightning escalation | Coach may offer a full session; goal and strategies tried carry over; the lightning chart is kept on the record |
| Implement and Tasks | Propose real Tasks hub tasks through confirm cards, linked back to the problem; Kanban reflects live status |
| Time gaps | End of Implement proposes a dated "Review: <problem>" task; opening it resumes at Improve |
| Document output | Case file on the linked project or task's page (confirm card); if nothing is linked, offer to create a project for the problem |
| Polya and TRIZ | Map onto the book's tools (below). No 40-principles matrix |
| Step strictness | Coach recommends a tool per step; "move on" any time; one recorded objection, never blocks; skipped steps show faint |
| Final words | "Problem solving as a skill" at every step boundary; otherwise the coach picks whichever Final-words idea suits the moment |
| Coach sources | Book plus its cited originals |
| Book text | Own words in the public repo |
| Engine | Generalise Define into a step engine; migrate v1 sessions on read; Lightning is its own session kind |

## Experience

### Full session

1. **Frame and Model:** unchanged from v1.
2. **Step orientation.** Entering a step, the coach gives a one-message orientation in the book's terms (see chapter knowledge) and recommends one tool on a suggestion card, saying why and naming the sibling it passed over.
3. **Inside a tool:** v1 gatekeeping holds in every step: accept, challenge, keep anyway (contested node with pinned objection), switch after two challenges on a slot or when the tool no longer fits.
4. **Moving on.** A finished tool yields a suggestion: another tool in this step, or the next step. "Move on" is always available; the coach may object once (recorded as the step's `objection`); it never blocks. A skipped step is `skipped` and shows faint on the record.
5. **Carry-forward** (seeds, not copies; the coach confirms each):
   - Define's root cause / problem statement seeds the problem node of Analyse tools.
   - Devise ideas (lotus petals, solution-tree branches, Duncker solutions) become Decide options.
   - The chosen Decide option becomes the Implement aim.
   - SMART measures seed DMAIC's Measure and the after action review's "what did we set out to achieve".
6. **Implement:** Kanban, Eisenhower "Do first" and 15% "Go" items can be proposed as tasks via confirm cards. The Kanban columns reflect those tasks' live status. At the end of the step the coach proposes a dated "Review: <problem>" task; its page carries a Problem Solver chip that opens the session at Improve.
7. **Improve:** if double-loop learning finds a governing assumption is wrong, the coach may offer to reopen Define or Analyse (the book's "if not successful, feedback" loop). Reopening adds a new run to that step; earlier runs stay.
8. **Document:** 5 Cs composes the case file; knowledge management records tacit and explicit learning. A confirm card writes the case file as blocks to the linked project or task page; if nothing is linked, the coach offers to create a project named by the Correspond rules and links it.
9. **Final words throughout:**
   - At every step boundary: one short "what did you learn about how you solve problems?" turn, stored in `learnings`.
   - Elsewhere, the coach chooses what fits: Polya's determination, hope and success when you are discouraged or stuck; beliefs and emotions as legitimate metacognitive material; naming curiosity, an open mind or persistence when you show them.
10. **Record:** the model's black-and-white diagram lights step by step (done solid, current outlined, skipped and future faint). Each step has a filmstrip of its runs; any card morphs into its coloured chart (v1 morph).

### Model mapping

| Model | Book step → tools |
| --- | --- |
| seven_step | Each step uses its own chapter's tools |
| polya | Identify = Define tools. Devise = Devise tools, then Decide tools. Implement = Implement tools. Evaluate = Improve tools; Document is offered after Evaluate as an optional extra |
| triz | Specific problem = Define tools. General problem = one coach-stated contradiction node (`contradiction` slot: "improving X worsens Y"), accepted like any node. General solution = Devise tools. Specific solution = Decide tools, then Implement, Improve and Document are offered as optional extras |

### Lightning

- Entry: a Lightning card on the landing page ("A quick route for everyday snags").
- You describe the snag. The coach walks the flowchart: it asks each black-box question, and at each strategy box applies that strategy to your snag in one or two sentences, then asks whether it worked.
- The four p.157 questions run as a strip across the top (Can I fix this? / What can I do? / What can I learn? / What next?), lighting as you progress.
- Chart: the whole flowchart ghosted; your path draws in solid black, node by node, with arrows drawing along. Black and white only (ink, paper). The two added closing nodes sit after Relax and after "cannot be solved".
- Escalation: at any node the coach may offer "This needs the full process" on a suggestion card; accepting creates a full session (frame `goal` = the defined goal, `whatIsTrue` seeded with strategies tried and their outcomes), links the two, and shows the lightning chart on the full session's record.
- Inside an escalated session, strategy boxes link to the matching full tools: Draw a diagram → Causal map or Concept map; Analogy → Analogical reasoning; Reframing → Perspective shift; Make a list → Lotus blossom.

#### Flowchart graph (book pp.158–159, as data)

Node kinds: `check` (black rounded), `choice` (white rounded with a yes/no question), `strategy` (white rounded), `end` (black circle), `close` (added).

```
start: check "Could you accept or accommodate the status quo?"  yes→relax  no→goal
goal: check "Define the goal" → subtract
subtract: choice "Is it possible to subtract from the situation?"  yes→via_negativa  no→one_step
via_negativa: strategy → solved_1
one_step: choice "Can it be solved in one step?"  yes→guess_check  no→diagram
guess_check: strategy → solved_1
diagram: strategy → solved_1
solved_1: check "Is the problem solved?"  yes→relax  no→work_backwards
work_backwards: strategy → solved_2   solved_2: yes→relax no→make_list
make_list: strategy → solved_3        solved_3: yes→relax no→take_break
take_break: strategy → solved_4       solved_4: yes→relax no→analogy
analogy: strategy → solved_5          solved_5: yes→relax no→reframing
reframing: choice "Can the constraints, the problem or the resources change?"  yes→goal  no→cannot
cannot: strategy "Under current constraints it cannot be solved; try another problem, or go for a walk" → learn
relax: end → learn
learn: close "What can I learn?" → next
next: close "What next?" → (finished)
```

Reframing → goal is a loop: the second pass appends to the path (the chart shows the loop arrow inked and a pass count).

## Tool catalogue

Every tool has: `id`, `name`, `step`, `kind`, `when`, `steps` (our words), `slots`, `edgeKinds`, `nextSlots`, `complete`, `failureModes` (strings for the coach), `emblem`. Numeric data never comes from the coach; it comes from a score form the renderer exposes (`onScore`), stored as snapshots like the radar.

Slot notation: `name` single, `name:N` indexed (max in brackets).

### Analyse

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| causal_map | problem; cause:N [12]; influence:N [8]; edges cause/influence→cause/problem with `sign` +/− and `strength` 1–3 | problem, ≥3 causes, every cause linked | no |
| perspective_shift | stakeholder:N [8]; input:N (per stakeholder); viewpoint:N; insight:N ("It helps when…" / "I can't do … when …"); reframe | ≥2 stakeholders each with an insight, and reframe | no |
| radial_tree | root; node:N [40] with `parent` edge (hierarchical) giving levels; review | root, ≥2 levels, review | no |
| force_field | current; goal; for:N [6]; against:N [6] | current, goal, ≥1 each side, one score snapshot | scores 1–5 per force |
| from_to | aspect:N [6]; per aspect trend (with direction growing/stable/declining), from, to; insight | ≥2 full rows and insight | no (direction is an enum on the trend node) |
| intent_statement | problem; stakeholders; failures; approach; opportunity; risk | all six | no |

### Devise

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| problem_reduction | problem; sub:N [6]; priority order (payload on subs); solution:N (one per sub); integrated | problem, ≥2 subs each solved, integrated | ordering only |
| analogical_reasoning | source; target:N [3] (each analogy; extras parked); rule:N [8]; filtered (selected rules); assess (solved yes/no); retain | source, target, ≥2 rules, filtered, assess; a "no" reopens target | no |
| solution_tree | aim; how:N with parent edges (levels: high-level, sub, twig) [30] | aim, ≥3 hows, ≥1 with an alternative | no |
| lotus_blossom | problem; solution:1–8; idea:S.N (8 per solution) [64]; preferred (links/circles) | problem, 8 solutions, ≥3 ideas on ≥3 solutions, ≥1 preferred | no |
| duncker | problem; desired; pathway:N [4] (≥1 flagged `opposite`); solution:P.N; evaluation | problem, desired, ≥2 pathways incl. one opposite, ≥1 solution each, evaluation | no |

### Decide

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| decision_matrix | criterion:N [8]; option:N [6] (seeded from Devise) | ≥2 criteria, ≥2 options, one score snapshot | weights (percent summing to 100, or rank 1–n) and ratings 1–10; totals computed |
| swot | goal; option:N; per option strength:N, weakness:N, opportunity:N, threat:N; synthesis (four questions) | ≥1 option with an item in every quadrant, synthesis | no |
| morphological | problem; subject:N [6]; attribute:S.N [8 per subject]; scenario:N (one attribute per subject); contradiction:N (incompatible pairs); evaluation | ≥3 subjects with ≥2 attributes, ≥1 consistent scenario, evaluation | no |
| pareto | target; item:N [12] | ≥3 items and one data snapshot | counts per item; percent, cumulative, 80% cut computed |

### Implement

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| dmaic | define; measure (KPIs, baseline); analyse; improve; control | all five; "repeat" starts a new pass | no |
| fifteen_percent | reflect; action:N [8]; chosen:N | reflect, ≥2 actions, ≥1 chosen | no |
| kanban | column:N (defaults To do, Doing, Review, Done; editable); card:N (task text, or linked task id) ; wip limit | ≥3 cards | no; live status from linked tasks |
| eisenhower | item:N with `quadrant` do/schedule/delegate/eliminate | ≥1 item in ≥2 quadrants | no |

### Improve

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| double_loop | problem; single (correction within the system); recurs (yes/no); governing:N (assumptions and norms challenged); reframe; strategy:N; test; monitor | problem, single; if recurs: ≥1 governing, reframe, strategy, test | no |
| feedback_matrix | suggestion:N, compliment:N, change:N, question:N; theme:N (part two) with why:N and how:N; action:N | ≥1 in ≥3 quadrants, ≥1 theme with how, ≥1 action | no |
| after_action_review | intended; achieved; differences; learned | all four; `learned` must be the longest answer or the coach asks for more | no |

### Document

| Tool | Slots | Complete when | Numeric |
| --- | --- | --- | --- |
| five_cs | contextualise (purpose); categorise (where and how filed); condense (key items kept); correct (corrections, who/what/when/why); correspond (name and date) | all five; correspond checked against the naming rules (below) | no |
| knowledge_management | consider; explicit:N; tacit:N; share; review | consider, ≥1 explicit, ≥1 tacit, review | no |

Correspond naming rules (enforced by a pure validator, shown as a ticking checklist): meaningful short name; no private abbreviations (coach judgement); `YYYYMMDD` date; version `v1`, `v2`…; "Final" on the final version; at most 280 characters; letters, digits and spaces only.

## Diagrams

All renderers keep the v1 contract (`createXView(doc): { el, update(run), onScore? }`, idempotent update diffing by node id, identity stable, shapes only for accepted nodes, details cards, contested tag, `role="list"` and text outline, works at 390px, text ≥12px). Motion: Web Animations API, 300–520ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, numeric changes morph from the previous snapshot over 600ms, nothing animates under reduced motion. Palette tokens as v1 (`--ps-red`, `--ps-yellow`, `--ps-blue`, `--ps-on-yellow`). Each chart matches its book page's composition:

| Tool | Composition and build |
| --- | --- |
| Causal map (p.67) | Red problem circle left; yellow half-circle causes in a column; blue chevron influence band across the top. Links draw in (stroke-dashoffset) with a +/− badge; stroke weight shows strength. Legend "+ positive, − negative". |
| Perspective shift (p.71) | Square cut by an X into four triangles: top yellow "I think…", right blue "Why is…", bottom yellow "I wish…", left blue "What about…"; one stakeholder per triangle (more stakeholders page through); insight statements fill the triangle; the red centre dot pulses once when the reframe is accepted. |
| Radial tree (p.75) | Yellow disc with concentric rings; level 1 red at centre, level 2 red, deeper levels blue and smaller; spokes grow outward; even angular spacing recomputed on update with nodes gliding to new angles. Toggle to the vertical tree variant (p.73). |
| Force field (p.77) | Blue goal bar top; red current-state bar centre; blue up arrows left, yellow down arrows right, length by score; blue and yellow score totals; a "driving outweighs restraining" marker when true. |
| From…To (p.79) | Blue field; red header circles Aspect, Trend, From, To; rows of yellow circles fill left to right; the trend arrow rotates to its direction. |
| Intent statement (p.81) | Six right-pointing chevron bands with zig-zag lower edges (red Problem, yellow Stakeholders, blue Failures, red Approach, yellow Opportunity, blue Risk) unfurl left to right as each is accepted. |
| Problem reduction (p.87) | Red problem circle → yellow sub-problem circles (numbered by priority) → blue solution circles → large blue integrated solution; yellow chevrons between. |
| Analogical reasoning (p.91) | Red Source → yellow Target ⇄ Expand → Match → Filter → blue "Solved?" circle; No runs Revise → Search → Target with a travelling token; Yes lands on blue Retain. |
| Solution tree (p.93) | Large blue aim triangle at the base; red "how" triangles fan from its apex, yellow next level, blue twigs outermost; alternatives appear as sibling twigs. |
| Lotus blossom (p.95) | Red problem centre in eight yellow solution petals, ringed by eight blue flowers each with a yellow centre and eight blue idea petals. Tapping a flower zooms (transform) into it; preferred ideas get an ink ring and link lines. |
| Duncker (p.99) | Red Problem top; two yellow "what to do" boxes ("Path to desired state", "Make it OK not to reach it"); paths below; solutions below those; yellow "New problem definition" and blue "Desired state" across the bottom. Connectors draw down. |
| Decision matrix (p.105) | Red scalloped Criteria and Weight header; yellow arched option heads each over red Rating and Score sub-heads; yellow rows with red tabs; blue TOTAL tags count up; the leading option lifts slightly. |
| SWOT (p.107) | Blue Goal and Option header rows; Internal and External side labels; yellow Strengths and Opportunities, red Weaknesses and Threats; one grid per option, swipe between. |
| Morphological (p.111) | Red subject headers; yellow attribute columns (alternating tints); a scenario is a blue line through one blue oval per column, drawn in; contradictory pairs struck through. |
| Pareto (p.115, summary p.113) | Red field with paper gridlines; yellow bars sorted descending with value labels; blue cumulative line with dots drawing left to right; dashed 80% line across and down to the cut; a small 80/20 square summarises the vital few. |
| DMAIC (p.121) | Five blue bands with red letter discs and yellow pointers, filling D, M, A, I, C; dashed yellow loop from Improve to Define lights on a repeat pass. |
| 15% solutions (p.123) | Three stacked circles What, Now, Go in the book's quartering; actions gather around Now; a chosen action rolls into Go. |
| Kanban (p.127) | Red To do, blue Doing with a Review sub-lane, yellow Done; pill cards; linked tasks move columns on live status; WIP limit badge on To do. |
| Eisenhower (p.129) | Urgent / Not urgent across the top, Important / Not important down the side; blue Do first ✓, yellow Schedule pie, yellow Delegate ▲, red Eliminate ✕; items drop into quadrants. |
| Double-loop (p.135) | Two blue loops: inner single loop (Problem → Action strategy → Consequences → match/mismatch), outer double loop through Governing variables; the travelling marker shows where you are; the outer loop draws only when `recurs` is yes. |
| Feedback matrix (pp.137, 139) | Part one 2×2 (yellow Suggestions +, blue Compliments ✓, red Changes ✕, yellow Questions ?); part two bubble clusters (Do more, Question, Change) with why and how satellites. |
| After action review (p.143) | Four horizontal bars with their shapes (red square, blue triangle, yellow triangle, yellow equals); the learned bar is visibly the largest. |
| 5 Cs (pp.147, 149) | Five-slice pie with a red rim, filling slice by slice; the Correspond card with yellow (do) and red (don't) dots ticking as the name passes each rule; then the composed case file card. |
| Knowledge management (p.151) | Yellow stack: Consider (blue triangle), Capture (red bar), Share (blue square outline), Review (red circle), filling top to bottom; tacit and explicit items listed under Capture. |
| Lightning (pp.158–159) | Black and white only. Ghost of the whole graph at low opacity; inked path; check nodes black with paper text, strategy and choice nodes paper with ink outline, ends black circles; current node has a heavier outline; arrows draw along the path; loop pass count on the Reframing→goal arrow. 390px: the chart scales and the current node scrolls into view. |

### Emblems

All 25 new tool emblems redrawn as SVG from p.163 (viewBox 0 0 100 100, book colours, no ids), each checked against its tool page's corner emblem. A contact sheet (preview harness) is shown to Adam and approved before renderers land. Lightning has no book emblem: it uses a black-and-white lightning glyph in the landing card only.

## Coach knowledge

Prompt layers (all in our own words):

1. **Rubric and voice** (v1, cached).
2. **Process layer** (cached): the seven-step process and its feedback loops; how to use the toolkit; thinking skills; metacognition and Lester's stages; D'Zurilla and Nezu orientation; algorithms, heuristics and trial and error; Polya and TRIZ. **Written from pp.12–61; blocked until the rescan arrives.**
3. **Chapter layer** (cached): one paragraph per step.
   - Analyse: go beneath assumptions and symptoms; granular understanding avoids generic fixes; gather enough relevant information but not duplicates; question presumptions and biases.
   - Devise: divergent and creative thinking; adopt a different frame from your habit; generate alone before pooling; debate and scrutiny improve ideas; combining disparate ideas; solutions carry trade-offs.
   - Decide: rarely one right answer; fast intuitive versus slow analytical thinking; simple targeted information beats too much; biases affect both; switching well between modes is expertise.
   - Implement: the hardest part; status quo bias, loss and regret aversion; break the goal into small actionable items; resources, realistic deadlines, stakeholders, hurdles; measurable indicators; pilot while revision is still possible.
   - Improve: continuous improvement; informal checks; review both process and solution at any stage; Kaizen's small increments; reflective practice builds skill regardless of outcome.
   - Document: knowledge is lost to memory; capture so it can be found, reused and built on.
4. **Final words layer** (cached): problem solving as a skill; beliefs, emotions, temperament and self-regulation matter; Polya's determination, hope and success; curiosity, an open mind and persistence. With guidance on when each applies.
5. **Tool layer** (per request, only the tools of the current step plus any active run): `when`, steps, slots, chart meaning and `failureModes`, plus a **selection guide** per step keyed to problem shape.
6. **Session state, carry-forward seeds, recent turns, rolling summary** (v1).

Step-specific challenge triggers added to v1's:

- Analyse: a cause with no evidence; a single viewpoint presented as everyone's; forces scored without reason; trends asserted with no source.
- Devise: converging before diverging; evaluating ideas while generating; only "obvious" pathways (no functionally opposite path in Duncker); group ideas pooled before individual generation.
- Decide: criteria that are vague or unmeasurable; weights not summing or all equal without reason; ratings inconsistent with stated evidence; a Pareto ranking without data.
- Implement: tasks too large to start; no owner or date; status quo or loss-aversion talk unexamined; no measure of success; no pilot where one is cheap.
- Improve: blaming people rather than processes; skipping "what did we learn"; single-loop fixes for a recurring problem.
- Document: names only you would understand; no date or version; keeping everything rather than condensing.

Lightning uses a separate, smaller prompt: the flowchart graph, each strategy's intent, the four questions, the escalation criteria (multiple stakeholders, recurring problem, large stakes, three or more strategies failed) and the same voice rules.

## Architecture

### Package (`packages/problem-solver/`)

| Unit | Change |
| --- | --- |
| `steps.mjs` (new) | `STEPS` per model: ordered step ids, names, which tool `step` values each model step uses (the mapping table above), optional flags |
| `tools/*.mjs` | 25 new definitions; every tool (v1 included) gains `step` and `failureModes` |
| `tools/index.mjs` | registers all 32 tools; `toolsForStep(stepId)` |
| `machine.mjs` | unchanged contract; adds `applyScores(run, payload)` delegating to the tool's `validateScores` |
| `lightning.mjs` (new) | the flowchart graph as data; `nextNode(path, answer)`; pure |
| `naming.mjs` (new) | Correspond naming validator |
| `render/*.ts` | 25 renderers, `lightning.ts`, `record.ts` extended for per-step states and filmstrips |
| `glyphs/tools/*.svg` | 25 new emblems |

### Session model

```ts
type StepState = { runs: PsToolRun[]; status: 'open' | 'done' | 'skipped'; objection: string | null };
type PsSession = {
  // v1 fields unchanged except `define`, replaced by:
  kind: 'full' | 'lightning';
  phase: 'frame' | StepId | 'finished';
  steps: Partial<Record<StepId, StepState>>;
  learnings: { step: StepId; text: string; at: string }[];
  proposedTasks: { id: string; title: string; status: 'proposed' | 'confirmed' | 'dismissed'; taskId?: string; source: { runId: string; nodeId: string } }[];
  reviewTaskId: string | null;
  caseFile: null | { title: string; blocks: unknown[]; target?: { kind: 'project' | 'task'; id: string }; writtenAt?: string };
  lightning: null | { path: { node: string; answer?: 'yes' | 'no'; note?: string; at: string }[]; passes: number; escalatedTo?: string };
  escalatedFrom?: string;
};
```

Migration on read: a v1 session (`define` present, no `steps`) becomes `steps.define = { runs: define.runs, status: phase === 'defined' ? 'done' : 'open', objection: define.exitObjection }`, `phase: 'defined'` maps to the next model step with `steps.define.status = 'done'`, `kind: 'full'`. Nothing is written back until the next save. A v1 fixture test guards this.

### Server

- `prompts.mjs` split into `knowledge/process.mjs`, `knowledge/chapters.mjs`, `knowledge/final-words.mjs`, `knowledge/selection.mjs`, and per-tool knowledge read from the tool definitions. Cached layers sent as cached system blocks.
- Coach schema additions: suggestions `next_step`, `move_on`, `escalate`, `reopen_step`; `proposeTasks: string[]`; `learning: string`; `lightning: { node, answer, note }`; `caseFile` (Document only).
- New actions: `move_on`, `lightning_answer`, `escalate`, `reopen_step`, `confirm_task`, `dismiss_task`, `set_review_task`, `link_case_file`, `score` (generic; `rescore_radar` stays as an alias).
- Create accepts `{ kind: 'lightning', text }`.
- Store, revision checks, request replay, queued runner, size limits: unchanged.

### Tasks hub writes (client-side, behind confirm cards)

- The Problem Solver page shows a confirm card per proposed task. On confirm it creates the task through the existing `tasksApi` (as the hub already does), then posts `confirm_task` with the new id. The server never writes Tasks.
- Review task: confirm card at the end of Implement with a date picker; created through `tasksApi` with a link chip back to the session; `set_review_task` stores its id.
- Case file: on confirm, blocks are appended to the linked item's page through the same page/block API the page editor uses; `link_case_file` records target and time. If nothing is linked, the confirm card offers "Create project" first.
- Kanban live status: the renderer receives linked tasks' statuses from the page (a fetch via `tasksApi`), not from the server.
- Linked items show a Problem Solver chip (v1's planned link chip, built now).

### Errors (additions to v1's table)

| Failure | Behaviour |
| --- | --- |
| Task create fails on confirm | Card stays, shows the error, retry; session unchanged |
| Linked page write fails | Case file remains on the session; retry from the card |
| Linked task deleted | Kanban card shows "task removed"; proposal reverts to `dismissed` |
| Score payload invalid | 400 with the tool's validation message; chart unchanged |
| Lightning answer on a stale node | 409, refetch |

## Testing

- Unit, package: every new tool machine (open slots, order, completion, indexed limits, scores validation), `lightning.mjs` transitions including the reframing loop, `naming.mjs`, step mapping per model, renderer output for fixed inputs (empty, partial, full, contested, score morph).
- Unit, server: migration from a v1 fixture; every new action; schema validation of new fields; Lightning create and answer; escalation seeding.
- Playwright on the Tasks mock API, desktop and 390px: a full session through at least one tool per step with move-on and a skip; confirm a task and see it on the Kanban; the review task; the case file on a linked page; the record lighting each step and morphing; a Lightning run to Relax and to escalation.
- Live evaluation script (not CI), invented problems per step: the coach challenges premature convergence in Devise, unweighted criteria in Decide, status quo bias in Implement and blame in Improve; accepts strong answers without flattery; uses a Final-words move when the user is discouraged; stays within word limits.
- `npm run pre-pr-check` before the PR.

## Build order (one PR, commits in order)

1. Step engine, session migration, `steps.mjs`; Define behaviour unchanged (v1 tests green).
2. Coach knowledge layers and selection guides (process layer waits on the pp.12–61 scan).
3. Emblem contact sheet; Adam approves.
4. Analyse tools and renderers.
5. Devise tools and renderers.
6. Decide tools, renderers and score forms.
7. Implement tools and renderers; task confirm cards, live Kanban, review task, link chips.
8. Improve tools and renderers; reopen-step loop.
9. Document tools and renderers; naming validator; case file to linked page.
10. Record and filmstrips for every step and model.
11. Lightning: graph, renderer, coach prompt, landing card, escalation.
12. Final-words pass and the extended live evaluation.
13. Playwright walks at both widths, `pre-pr-check`, PR ready with auto-merge.

## Book reference (our words)

Kept here so the build does not depend on the scans. Page numbers are the book's.

- **Causal map (pp.64–67):** maps how factors cause and influence a problem; deeper than 5 Whys; benefits from brainstorming and interviews. Steps: state the problem; identify all potential causes (park them in a list); map relationships with direction, positive or negative influence and strength, asking what leads to what.
- **Perspective shift (pp.68–71):** look at the problem from other viewpoints to build empathy and reduce conflict. Steps: list stakeholders; gather their input (motivations, concerns, values); analyse their viewpoints and challenge your own assumptions; synthesise an insight statement per stakeholder type; reframe the problem or goal. Pull quote: "If the only tool you have is a hammer, everything begins to look like a nail."
- **Radial tree (pp.72–75):** a hierarchy drawn outward from a central node; good for spotting clusters and outliers; a vertical tree reads faster when speed matters. Steps: define the hierarchy (a quick concept map helps); draw nodes outward from the centre; review for balance and even spacing.
- **Force field analysis (pp.76–77):** Lewin's forces for and against change. If restraining forces dominate and cannot be shifted, reframe. Steps: define current state and goal; uncover forces (personal, social, cultural, political, environmental, economic; internal and external); score them; strengthen drivers and weaken restrainers until drivers win.
- **From…To exploration (pp.78–79):** move from the current state to a desired future in light of trends. Steps: list problem aspects; identify a trend per aspect and whether it is growing, stable or declining; write the "from" (now) and a speculative "to"; draw out the forces to use or accommodate.
- **Intent statement (pp.80–81):** a strategic guide that communicates the problem and the way forward. Steps: problem in context; stakeholders; past or likely failures; why this approach will work; the opportunity; risks and mitigations.
- **Problem reduction (pp.84–87):** break a problem into simpler sub-problems (Newell and Simon). Steps: define; decompose (elements, who is affected, root causes, consequences, where, when); prioritise by impact and feasibility; solve each; integrate.
- **Analogical reasoning (pp.88–91):** borrow solutions from problems solved elsewhere (the Wright brothers and birds). In the book's terms the key problem is the *source* and the solved analogue is the *target*. Steps: define the source; find targets with shared characteristics (park extras); match rules that hold for both; filter to the most relevant; assess, and if unsolved, revise and search again. Pull quote: Getzels, "There are three kinds of problems: those that are presented, those that are discovered, and those that are created."
- **Solution tree (pp.92–93):** means–ends map; an issue tree asks why, a solution tree asks how; aim to be exhaustive. Steps: state the aim at the base; branch high-level hows into actions; add alternative twigs.
- **Lotus blossom (pp.94–95):** Matsumura's 3×3 expansion. Steps: eight solutions around the problem; eight ideas around each (64); review viability, overlap, impacts, and circle and link the best.
- **Duncker diagram (pp.96–99):** two families of pathway from problem to desired state, including a functionally opposite one (make it acceptable not to reach the state, or redefine the problem); counters functional fixedness. Steps: define both ends; establish at least two pathways; generate solutions under each; evaluate feasibility, effectiveness and consequences.
- **Decision matrix (pp.102–105):** multiple-criteria decision analysis. Steps: specific, measurable criteria; weights (percent to 100, or ranks); rate each option 1–10 per criterion; weighted totals.
- **SWOT (pp.106–107):** internal strengths and weaknesses, external opportunities and threats, per option against a goal. Then ask how to maximise strengths and opportunities, minimise weaknesses and threats, use strengths against threats, and turn weaknesses into opportunities.
- **Morphological analysis (pp.108–111):** Zwicky's box for ill-defined problems. Steps: define; grid of subjects and their attribute options; explore combinations; remove inconsistent pairs (cross-consistency assessment); evaluate feasible scenarios. Pull quote: van Merriënboer, "Problem solving is a goal, a method and a skill."
- **Pareto analysis (pp.112–115):** the vital few. Steps: list components; collect data (frequency, cost, time); rank with percentages; cumulative percentages; chart and draw the 80% line.
- **DMAIC (pp.118–121):** Define (problem, objectives, scope, stakeholders); Measure (KPIs, baseline, tracking); Analyse (patterns and root causes); Improve (prioritise, pilot, implement, repeat); Control (monitor, sustain, revise).
- **15% solutions (pp.122–123):** what you can do now within your own discretion, with no new resources or approvals. Steps: reflect on the problem; ask "what is my 15%?"; pick the most impactful and act now.
- **Kanban (pp.124–127):** visual workflow board. Steps: columns for stages; specific tasks with due dates (optional colour by complexity, progress bars); limit work in progress; update regularly. Pull quote: Michelangelo on aiming too low.
- **Eisenhower matrix (pp.128–129):** urgent and important. Do first (important and pressing), Schedule (important, not yet due), Delegate (others can do it, does not advance your goal), Eliminate (distractions).
- **Double-loop learning (pp.132–135):** Argyris and Schön. Single loop corrects within existing rules; double loop questions the rules and assumptions. Steps: define; correct within the system; if it recurs, challenge the norms; reframe with root-cause tools; new strategies; test small; monitor and reflect.
- **Feedback matrix (pp.136–139):** suggestions, compliments, changes, questions. Steps: define categories; collect feedback from yourself and others; pick high-impact themes and ask why and how; act; reflect and iterate.
- **After action review (pp.140–143):** US Army practice, also for individuals. Soon after the activity (and at milestones): what did we set out to achieve, what did we achieve, why the difference, what did we learn. Spend about half the time on learning; keep it non-hierarchical.
- **5 Cs documentation (pp.146–149):** contextualise (purpose), categorise (logical structure and access), condense (keep the essentials), correct (fix errors, note significant changes), correspond (consistent naming with dates).
- **Knowledge management (pp.150–153):** consider what needs capturing; capture explicit knowledge in documents and tacit knowledge through after action reviews and sharing; share and reward sharing; review and prune.
- **Lightning problem solving (pp.155–159):** for everyday snags that need a fast answer. Ask: can I fix this (if not, stop worrying); what can I do (the flowchart, an iterative trial-and-error algorithm); what can I learn; what next (prevention and readiness).
- **Final words (pp.160–162):** education's shift from knowledge to skills; problem solving links to job and life satisfaction and career progress; it is not purely intellectual: beliefs, emotions, temperament and self-regulation matter; Polya's determination, hope and success; curiosity, an open mind and persistence make a better problem solver.
