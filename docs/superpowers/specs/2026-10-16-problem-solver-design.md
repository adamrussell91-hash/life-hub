# Problem Solver — design (v1: Define)

Date: 16 October 2026. Status: approved in brainstorm, awaiting spec review.

## Goal

A new **Tasks Hub › Tools › Problem Solver** page. A chat coach walks Adam through a real problem using the *Problem Solver* toolkit book's process, picks the right Define tool for the problem, and builds that tool's diagram live, node by node, as answers survive scrutiny. Each problem is saved as a session whose black-and-white process diagram is the permanent record; clicking a step morphs it into the coloured tool chart.

v1 covers Frame, model choice and the whole Define step. Analyse → Document follow when the rest of the book is scanned.

Later phases (not v1, but the architecture must serve them): every tool as a block in Tasks pages (tasks, projects, goals) and in Teaching lessons, rendering identically from one shared package.

## Sources

Primary: the scanned book chapters (pp. 12–61): thinking skills (p.13), metacognition and self-regulation (pp.14–16), Lester's cognitive/metacognitive abilities (p.15), D'Zurilla and Nezu problem solving and self-regulation (p.16), strategies: algorithms, heuristics, trial and error (pp.17–19), Polya 4-step (pp.20–21), TRIZ (p.23), the 7-step Problem Solving Process (p.37), how to use the toolkit (p.39), Define chapter: three questions, 5 Whys, Concept Mapping, Problem Tree, Gap Analysis (basic and advanced), Problem Statement, SMART Objectives (pp.43–61).

Supporting research, used to sharpen the rubric, not to replace the book:

- Polya, *How to Solve It* (1945): understand, plan, carry out, look back; heuristics such as decomposing, generalising, working backwards, solving a related problem.
- Garofalo and Lester (1985): orientation, organisation, execution, verification as the cognitive frame; person, task and strategy knowledge as the metacognitive frame. Metacognitive failure is most often a missing verification step, or carrying on with a plan that has already failed.
- D'Zurilla and Nezu, social problem-solving: problem orientation (positive or negative, avoidant, impulsive-careless styles) shapes outcomes as much as skill. Impulsive-careless maps to "jumping to a fix".
- 5 Whys practice (Ohno, Toyota): known failure modes are stopping at a symptom, a single chain when causes branch, blaming people rather than process, and answers not checked against evidence.
- Problem tree (GOPP/ZOPP): a single focal problem as trunk, causes as roots, effects as branches; it converts into an objectives tree (useful later for Devise).
- Gap analysis: current state versus target per dimension; the radar form needs a consistent scale and dated snapshots to show progress.
- SMART (Doran, 1981): each criterion is testable; "Attainable" and "Relevant" are the ones most often hand-waved.

Notion is not a source and nothing reads it. Adam's thinking-skill notes, if used, are folded into the rubric once, by hand.

## Experience

### Session flow

1. **Frame.** Adam describes the problem, optionally linking it to a task, project or goal. The coach works through the book's three questions: *What is the goal? What is true? What can be done?*
2. **Model.** The coach picks the process model and says why in one or two sentences:
   - **7-step Problem Solving Process** (p.37) by default.
   - **Polya 4-step** for a bounded problem with a clear right answer.
   - **TRIZ** when the problem is a contradiction (improving one thing worsens another).
3. **Define.** The coach recommends a diagnostic tool:
   - **5 Whys:** one clear symptom, likely one root cause.
   - **Problem Tree:** several causes and effects to sort.
   - **Concept Mapping:** many interacting factors, a messy system.
   - **Gap Analysis:** clear present and desired state (radar variant when several dimensions can be scored 1–10).

   Then it chains to **Problem Statement**, then **SMART Objectives**. Adam can say "I've defined it" at any point; the coach may object once and the objection is recorded, but it never blocks.
4. The session is then **defined**: the record shows Define solid and the later steps faint, ready for Analyse when it exists.

### Coach behaviour

- Voice: a coach. Usually two or three sentences, roughly 25–60 words, at most one question. Warm, direct, never flattering. Over-length replies are rewritten once, then trimmed to the last full sentence, keeping the question.
- Gatekeeper: a node is drawn only when the coach accepts the answer. On a challenge, nothing is drawn. Adam can revise, argue back (the coach may change its verdict), or press **Keep it anyway**, which commits the node as **contested**, with the coach's objection pinned as a small note.
- Challenges name the skill and give one reason. Triggers:
  - symptom offered as a cause (analysis);
  - perception or opinion stated as fact ("What is true?", critical thinking);
  - generic answers ("not enough time/budget"; the book's "Be specific");
  - solutions offered during Define (p.57's premature-fix warning; impulsive-careless orientation);
  - circular whys, blaming a person rather than a process;
  - goals that cannot be measured;
  - thin metacognition: unexamined assumption, confidence beyond evidence, no verification.
- Good answers are acknowledged briefly, naming the skill used.
- Switching: after two challenges on the same slot, or when causes start branching, the coach proposes another tool on a suggestion card. The abandoned run stays in the record as "tried, switched because…".
- Metacognitive check-in at each tool boundary: one question tied to Lester's stage (orientation, organisation, execution, verification).
- Protocol suggestions: at tool ends and check-ins the coach may offer one of the eight thinking protocols (catalogue in `config/knowledge/cognitive/definitions.mjs`, triggers in `netlify/functions/_shared/thinking-protocol-recommend.mjs`).
- Close of Define: the coach may propose tasks; nothing is created without a confirm card.

### Visual language

- **Tool emblems:** the book's small stylised circle per tool (5 Whys, Concept Mapping, Problem Tree, Gap Analysis, Problem Statement, SMART), redrawn as SVG. Used on the tool picker, suggestion cards, filmstrip, record and, later, block headers.
- **Thinking-skill glyphs:** the twelve glyphs from p.13, supplied by Adam as single-colour SVG in `packages/problem-solver/glyphs/skills/`. Shown as chips on coach messages (skill used well), outlined on challenges (skill missing), and in the thinking profile.
- **Palette:** the book's red, yellow and blue as tokens scoped to the package (`--ps-red`, `--ps-yellow`, `--ps-blue`, plus ink and paper for the record). Everything else uses design-kit tokens.

### Diagrams (SVG, Web Animations API, reduced-motion respected)

| Tool | Builds as nodes are accepted |
| --- | --- |
| 5 Whys | Red "Problem" half-circle with the statement. Each accepted why drops a yellow chevron triangle with the answer. Extends past five to seven or eight. Blue "Root cause" half-circle closes only when the coach accepts the last why as specific. |
| Problem Tree | Red trunk first. Causes grow downward as blue roots (stroke draw). Effects rise into the yellow canopy. Step 3 links cards; lines draw in. |
| Concept Mapping | `packages/graph-blocks` canvas. Central theme, then concepts and linkages (association, hierarchical, cross-link) added as accepted. |
| Gap Analysis (basic) | Red Current state and blue Objective circles; Known and Done fill the red petals, Must know and Must do the blue; the yellow Actions bridge grows as gaps are determined. |
| Gap Analysis (radar) | Shortfall topics become axes that sweep in; yellow current and blue objective polygons grow to their 1–10 scores. Rescoring later morphs from the previous snapshot. |
| Problem Statement | Red Problem, yellow Impacts and blue Benefits blocks fill, then compose the final statement. |
| SMART | Five columns S M A R T; each accepted criterion drops its shape into its column. |

Contested nodes: dashed outline and a speech-bubble badge; tap for the objection.

**Record:** the chosen model's process diagram in black and white. Done steps solid ink and clickable; future steps faint outlines. Clicking a step expands it to fill the canvas, colour floods in, and the tool chart fades up. A filmstrip under it shows the Define chain, including greyed switched runs and protocol badges.

**Layout:** desktop, canvas left and coach right. 390px, canvas on top and coach as a bottom sheet. Every diagram has an accessible text outline.

## Architecture

### Units

| Unit | Path | Purpose |
| --- | --- | --- |
| Shared package | `packages/problem-solver/` | Tool definitions, session types, state machines, renderers, glyphs and emblems. No network, no app imports. Used by Tasks now and by Tasks/Teaching blocks later. |
| Tool definitions | `packages/problem-solver/tools/*.mjs` | One file per tool: steps from "Get it done", slots, legal transitions, emblem, rubric notes. |
| State machine | `packages/problem-solver/machine.mjs` | Pure: given a tool run and a proposed node, accept or reject the slot. Shared by server and client. |
| Renderers | `packages/problem-solver/render/*.ts` | One per diagram plus the three records. Input: tool run data. Output: SVG element plus an `animateTo(next)` method. |
| Glyphs | `packages/problem-solver/glyphs/` | SVG for twelve skills and six tool emblems. |
| Server | `netlify/functions/problem-solver.mjs`, `netlify/functions/problem-solver-run.mjs`, `netlify/functions/_shared/problem-solver/*.mjs` | API, queued coach runner, rubric and prompts, store, context pack. |
| Page | `apps/tasks/src/views/problem-solver/*.ts` | Session list, coach panel, canvas host, record. Nav entry in `apps/tasks/src/shell/shell.ts` Tools section. |
| Link chips | Tasks task/project/goal views | A "Problem Solver" chip on linked items that opens the session. |

The server must validate nodes with the same rules the client uses. The tool definitions and state machine are therefore written as plain JavaScript modules with JSDoc types (`machine.mjs`, `tools/*.mjs`), importable by Netlify functions and by the Vite apps, the same way `apps/life/js/core/constraints.js` is shared today. Renderers stay TypeScript.

### Data model

```ts
type ModelId = 'seven_step' | 'polya' | 'triz';
type ToolId = 'five_whys' | 'problem_tree' | 'concept_map' | 'gap_basic' | 'gap_radar' | 'problem_statement' | 'smart';
type SkillId = 'abstract' | 'searching' | 'learning' | 'decision' | 'inference' | 'reflective' | 'synthesis' | 'analysis' | 'logical' | 'critical' | 'metacognition' | 'creative';

type Session = {
  id: string; title: string; revision: number;
  status: 'active' | 'paused' | 'defined' | 'archived';
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string };
  model: null | { id: ModelId; reason: string };
  links: { kind: 'task' | 'project' | 'goal'; id: string }[];
  define: { runs: ToolRun[]; finishedEarly: boolean; exitObjection?: string };
  turns: Turn[];
  summary: string;               // rolling, rewritten every few turns
  protocols: { protocolId: string; sessionId: string; stepId: string; summary?: { keyFinding: string; openQuestions: string[] } }[];
  proposedTasks: { title: string; confirmed: boolean; taskId?: string }[];
  pending: null | { suggestion: Suggestion };
  runner: { status: 'idle' | 'queued' | 'running' | 'failed'; error?: string };
  createdAt: string; updatedAt: string;
};

type ToolRun = {
  id: string; tool: ToolId; status: 'active' | 'done' | 'switched'; switchReason?: string;
  nodes: Node[]; edges: { from: string; to: string; kind?: 'association' | 'hierarchical' | 'cross' | 'relates' }[];
  radar?: { axes: string[]; snapshots: { at: string; current: number[]; objective: number[] }[] };
};

type Node = { id: string; slot: string; text: string; state: 'accepted' | 'contested'; objection?: string; skills: SkillId[]; turnId: string };

type Turn = { id: string; role: 'user' | 'coach'; text: string; verdict?: 'accept' | 'challenge' | 'clarify'; skillsSeen?: SkillId[]; skillsMissing?: SkillId[]; lookups?: { hub: string; label: string; ok: boolean }[]; createdAt: string };

type Suggestion =
  | { kind: 'switch_tool' | 'next_tool'; tool: ToolId; reason: string }
  | { kind: 'protocol'; protocolId: string; mode: string; reason: string; link: string }
  | { kind: 'finish_define'; reason: string }
  | { kind: 'propose_tasks'; titles: string[] };

type Profile = { lines: { id: string; kind: 'strength' | 'gap' | 'habit' | 'tool_fit'; text: string; evidence: string[]; updatedAt: string }[] };
```

Limits follow the cognitive protocol store: text fields 12000 characters, session 1 MB, 500 turns.

### Coach turn

Model output is one JSON object, validated with a schema:

```ts
type CoachTurn = {
  verdict: 'accept' | 'challenge' | 'clarify';
  message: string;                    // 25–60 words, one question max
  node?: { slot: string; text: string; edges?: { to: string; kind?: string }[] };
  skillsSeen: SkillId[]; skillsMissing: SkillId[];
  frame?: Partial<Session['frame']>;  // during Frame
  model?: { id: ModelId; reason: string };
  suggestion?: Suggestion;
  lookups?: { hub: 'tasks' | 'teaching' | 'professional' | 'knowledge'; query: string }[]; // max 3
  profileNotes?: { kind: 'strength' | 'gap' | 'habit' | 'tool_fit'; text: string }[];
};
```

Prompt layers: (1) rubric and voice rules, stable and prompt-cached; (2) compact session state (current model, tool, step, nodes, last few turns, rolling summary); (3) context pack (linked item and its project, Central Node summary through the existing sectioned reader with clinical and constraints stripped, any lookup results); (4) profile summary.

Server rules:

- A node is committed only if `verdict === 'accept'` and `machine.mjs` accepts the slot. Otherwise the turn is shown and the diagram is unchanged.
- `keep_anyway` commits the last challenged answer as contested, with the challenge message as the objection.
- Lookups run through the existing retrieval helpers in `netlify/functions/_shared/domain-retrieval.mjs`, then the model runs a second pass with results. Failures become `ok: false` chips.
- Malformed JSON or illegal slot: one repair retry, then a visible "Coach lost the thread, try again" turn with no state change.
- Model: the repo default from `netlify/functions/_shared/anthropic-client.mjs`. `ANTHROPIC_API_KEY` missing means sessions stay readable and the composer explains why it is disabled.
- Turns run on a queued runner (create/action returns 202; the client polls about every 400 ms while queued or running), mirroring `docs/cognitive-protocol-api.md`.

### API

`/api/problem-solver`, umbrella session cookie and origin guard, same error envelope as the cognitive protocol API.

- `GET ?list=1` session summaries; `GET ?id=` one session; `GET ?profile=1` profile.
- `POST { create: { title, links?, text, requestId } }`.
- `POST { id, revision, requestId, action, text?, payload? }` with actions `say`, `keep_anyway`, `accept_suggestion`, `dismiss_suggestion`, `finish_define`, `rescore_radar`, `link`, `unlink`, `link_protocol`, `rename`, `archive`, `confirm_task`. `link_protocol` carries no revision check (it only appends to `protocols`).
- `POST { profile: { op: 'edit' | 'delete', id, text? } }`.
- Stale revision returns 409; the client refetches and nothing is lost. Identical `requestId` replays safely.
- Linked-item lookup for chips: `GET ?linked=task:<id>` returns session ids and titles.

### Storage

Encrypted at rest using the cognitive protocol pattern (AES-256-GCM keyed from `SESSION_SECRET`, conditional writes), under `problem-solver/v1/sessions/<id>` and `problem-solver/v1/profile`. Reuse `cognitive-store.mjs` helpers where they generalise rather than copying them. Nothing personal goes into the repo, tests or fixtures; tests use synthetic problems.

### Protocol link-back

The protocol card opens a new tab at the link from `thinkingProtocolDeepLink`, with intake fields filled from the problem plus `problemId` and `stepId` in the query. One small hook in `apps/knowledge/src/protocols/view.ts`: when the view creates a protocol session and the URL carried `problemId`, it posts `{ id: problemId, action: 'link_protocol', payload: { protocolId, sessionId, stepId } }` to `/api/problem-solver`. The protocol server and runner are not changed. On reopening the problem, the Problem Solver server fetches the summary of each linked protocol session and stores `keyFinding` and `openQuestions`; the coach reads them on its next turn. A protocol still running shows as a pending badge.

## Errors

| Failure | Behaviour |
| --- | --- |
| Bad model JSON / illegal slot | One repair retry, then a visible retry turn; diagram unchanged |
| No API key or provider down | Read-only session and record; composer disabled with reason |
| Over-length reply | One rewrite, then trim to last sentence keeping the question |
| Lookup failure | Coach continues; chip shows "couldn't reach <hub>" |
| Revision conflict | 409, refetch, no loss |
| Leaving mid-tool | Session saved after every committed turn |
| Runner lease expiry | Turn becomes retryable, as in the protocol runner |

## Testing

- Unit (package): every tool machine (legal slots, order, extension past five whys, root-cause close, contested path, switch, finish early), radar maths and snapshot morph data, renderer output for fixed inputs.
- Unit (server): schema validation, repair retry, keep-anyway, suggestion handling, revision conflicts, request replay, profile edits, encrypted store round trip. Model mocked.
- Playwright on the Tasks mock API at desktop and 390px: start a problem, watch 5 Whys build one triangle per accepted answer, keep a contested node and open its objection, switch to Problem Tree, finish Define, open the record and click Define to morph to colour, reload and confirm everything is intact.
- Live evaluation script with synthetic problems, not run in CI: the coach must challenge a vague cause, a perception stated as fact and a premature solution, and must accept a strong answer without flattery. Word counts checked.
- `npm run pre-pr-check` before every PR.

## Scope

In v1:

- Tasks › Tools › Problem Solver page and session list.
- Frame, model choice, the whole Define step with all seven tool variants, chaining, switching and finish-early.
- Gatekeeper coach with keep-anyway and objection notes.
- Black-and-white record with morph to colour and the Define filmstrip.
- Skill glyphs (supplied) and tool emblems (drawn from the scans).
- Thinking profile, scoped context with lookup chips, protocol cards with link-back, Problem Solver chips on linked items, proposed tasks via confirm cards.

Not in v1:

- Analyse, Devise, Decide, Implement, Improve, Document (await scans).
- Tasks and Teaching blocks (phase 2, reusing the package renderers).
- Student-safe coach mode for Teaching.
- Toolkit badge swap (separate task): replace the "sad chicken" `badge-griffin.png` with the supplied dragon (`packages/problem-solver/glyphs/brand/dragon.svg`, actually a dragon, not a griffin), bump the toolkit eyebrow to about 22px because the art is too detailed for 16px, and re-composite the eight badged Teaching block icons.

## Build order

1. Package skeleton, tool definitions and state machines with tests.
2. Store, API and queued runner with a mocked coach.
3. Rubric, prompts and live coach; the evaluation script.
4. Page shell, coach panel and the 5 Whys renderer end to end (first usable slice).
5. Remaining renderers: Problem Tree, Gap basic, Gap radar, Problem Statement, SMART, Concept Map on graph-blocks.
6. Record diagrams and the morph.
7. Profile, context pack and lookup chips, protocol cards and link-back, link chips, proposed tasks.
8. Glyph and emblem pass, polish, Playwright walk at both widths, pre-pr-check.

## Existing work this replaces or reuses

- `problem solver/*.html` (ChatGPT drafts of 5 Whys, Gap Analysis, Problem Statement, Problem Tree): reference only. Not ported; superseded by the package renderers.
- Reused: `packages/graph-blocks`, `anthropic-client.mjs`, `domain-retrieval.mjs`, `cognitive-context.mjs` section reader, `thinking-protocol-recommend.mjs`, cognitive protocol store and runner patterns, Clare-style confirm cards for tasks.
