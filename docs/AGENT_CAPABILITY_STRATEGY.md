# Life Hub agent capability strategy

Independent technical strategy. Prepared for Adam Russell. Current Life Hub main branch reviewed 7 September 2026.

**Status:** adopted as the implementation reference for agent capability work. Phases 0–5 are implemented in this repository. Live conversational E2E remains Blocked (no `ANTHROPIC_API_KEY`).

Life Hub should not replace its current runtime with any single upstream framework. The target is a Life Hub native agent kernel.

| Source | Job |
| --- | --- |
| Mastra | Primary implementation reference |
| LangGraph | Evidence and recovery state model |
| Letta | Memory architecture |
| Mem0 | Semantic recall layer |

Keep existing domain stores, deterministic calculations, safety rules, personalities, and confirmation-based writes. Replace regex-led activation with a stateful evidence loop. Add bounded conversational memory as a separate layer. Add trace-based behavioural evaluation before calling any capability complete.

## Executive decision

Mastra is the best implementation reference because it is TypeScript-native and combines agents, tools, workflows, memory, processors, evaluation, tracing, and persistent storage. LangGraph provides the strongest model for explicit evidence seeking, state transitions, retries, interruption, and recovery. Letta provides the strongest patterns for persistent identity, shared memory, archival recall, and background reflection. Mem0 provides the smallest practical semantic memory layer, with scoped retrieval, updates, history, and filtering.

Do not install all four frameworks. Do not migrate domain records into an agent memory database. Do not count schemas, prompts, or shared tools as delivered capabilities.

## Scope and baseline

This report compares the current `adamrussell91-hash/life-hub` main branch with Mastra, LangGraph JS, Letta, and Mem0. The assessment focuses on behaviour delivered to the user. Cursor productivity, repository popularity, and raw tool counts are secondary.

Life Hub currently has ten named agents: Brisket, Chadwick, Hyaluronica, Penelope, Sara, Vera, Hammond, Ann, Clementine, and Clare. Every agent receives a common capability floor. Domain access remains uneven. The current chat runtime uses one large server function, per-agent flags, tool schemas, deterministic domain helpers, server-assembled evidence packs, and regex-based intent activation.

Recent patches improved data delivery. Clare received a much larger operational workbench on 6 September 2026. Behaviour still depends on prompt interpretation and narrow activation patterns. Cross-surface parity and genuine live behavioural evaluation remain incomplete.

## What each upstream repository contributes

### Mastra

Closest architectural fit. TypeScript framework for Node applications. Agents choose tools and iterate until a final answer or stop condition. Workflows support typed steps, sequential and parallel execution, conditional branches, loops, suspension, resumption, and persistent state. Tools use schemas. Input and output processors provide explicit points for context assembly, validation, and response control. Memory includes recent history, working memory, semantic recall, and observational memory. Evaluation supports datasets, experiments, scorers, and scoring of historical traces.

Best uses in Life Hub:

- A typed agent turn contract.
- A shared evidence loop with deterministic and model-led stages.
- Domain workflows for repeatable high-stakes tasks.
- Input processors for source selection and memory retrieval.
- Output processors for evidence citation, safety, and action validation.
- Persistent run state for interrupted or long tasks.
- Datasets and scorers for behavioural regression testing.
- Traces exposing which tools, stores, and claims produced each answer.

Do not adopt the deprecated Mastra agent network interface. Hammond should follow the current supervisor pattern: a supervisor calling other agents, tools, or workflows.

Fit: high. Main risk is bundling a broad framework into Netlify functions before proving the value of individual patterns.

### LangGraph JS

Lower-level orchestration runtime. Central ideas are state, nodes, and edges. Checkpointers persist state after graph steps. Stores hold information across conversation threads. Interrupts pause execution for human approval and resume from saved state. Subgraphs allow specialist workflows. Retry policies distinguish transient failures from model-recoverable errors, user-fixable problems, and unexpected faults.

Best uses in Life Hub:

- Replace regex activation with a graph-based turn state.
- Track requested outcome, selected sources, coverage, retrieved evidence, conflicts, missing evidence, proposed actions, and final claims.
- Route incomplete evidence back to retrieval.
- Retry store failures without restarting the whole turn.
- Pause at confirmation boundaries and resume from saved state.
- Give Hammond specialist subgraphs and observable handoffs.
- Test the complete path, including tool choices and final answer quality.

Fit: high as a pattern source, medium as a direct dependency. A small internal graph with the same semantics would prove value with less migration risk.

### Letta

Treats an agent as a persistent stateful entity. Memory blocks remain in context and are editable. Archival memory stays outside the context window and is searched when needed. Shared memory blocks let several agents see the same maintained state. Background reflection reviews recent conversations and consolidates useful lessons.

Best uses in Life Hub:

- Separate identity, user preferences, active goals, unresolved commitments, and domain observations.
- Give each agent a small persistent working memory rather than a giant prompt.
- Give all agents a shared user and governance memory.
- Store episodic conversation summaries outside the permanent source of truth.
- Run background consolidation after meaningful sessions.
- Evaluate memory writes, not merely the text response.

Fit: high as a memory architecture source, low to medium as a full runtime replacement. Life Hub already owns structured records in GitHub and hub stores. Those records must remain authoritative.

### Mem0

Focuses on extracting and retrieving useful memory from conversations. Operations include add, search, get, update, delete, and per-memory history. Memories are scoped through user, agent, application, and run identifiers.

Best uses in Life Hub:

- Semantic recall of prior conversations.
- Remember stable preferences and corrected facts.
- Retrieve unresolved conversational commitments.
- Separate memories by user, agent, domain, and confidence.
- Keep an audit history of memory changes.
- Expire temporary context.

Fit: high for a narrow memory service. The chief risk is false memory. Mem0 must never overwrite medical, fitness, nutrition, task, teaching, or knowledge records. A memory result should guide source selection or personalise delivery. It should not become evidence for factual domain claims unless linked to an authoritative record.

## Shared capability kernel

### 1. Semantic intent and source planning

Current weakness: a small regex library decides whether server retrieval occurs. Paraphrases and compound questions fall outside those patterns.

Target: every turn begins with a typed plan containing user goal, domain, relevant stores, required evidence, optional evidence, risk level, write intent, and completion criteria. A schema validator rejects incomplete plans.

Acceptance: at least fifty varied paraphrases per domain. Ninety-five per cent of relevant turns select the correct source family. Greetings and pure creative requests avoid unnecessary retrieval.

### 2. Evidence sufficiency loop

Current weakness: an evidence pack is considered answerable when any section looks like a record or calculation. The runtime does not ask whether the evidence answers the user’s question.

Target: plan, retrieve, assess coverage, retrieve another slice if needed, reconcile conflicts, calculate, answer. The assessor records missing periods, failed stores, truncation, and unresolved conflicts. The agent stops only when completion criteria are met or limitations are explicit.

Acceptance: tests with empty, partial, truncated, conflicting, and unavailable sources. The final answer must name material limitations and avoid clean-sounding conclusions from incomplete data.

### 3. Layered memory

Current weakness: durable records and generic remember tools exist, but there is no coherent split between stable preferences, active context, episodic history, and authoritative domain evidence.

Target:

- User memory stores stable preferences and standing constraints.
- Agent memory stores domain working context and interaction style refinements.
- Shared memory stores active goals, unresolved commitments, and cross-agent decisions.
- Episodic memory stores summaries and pointers to source records.
- Authoritative stores retain health, fitness, nutrition, diary, task, teaching, and knowledge facts.

Acceptance: agents recall corrected preferences across sessions, forget expired temporary details, never replace records with conversational memory, and show the source behind high-impact claims.

### 4. Durable turn state

Current weakness: a long streaming turn can fail after retrieval or before confirmation. Recovery depends on client state and bespoke queues.

Target: save turn state after planning, retrieval, analysis, and proposed action. Resume from the last safe stage. Give each state transition an idempotency key so retries do not duplicate writes.

Acceptance: forced failure after every stage. The resumed turn neither loses evidence nor repeats side effects.

### 5. Confirmation as a resumable state

Current weakness: confirmation is implemented across several bespoke proposal paths.

Target: all durable writes enter one pending action state with proposed diff, source evidence, risk, expiry, and confirmation status. The workflow pauses and resumes after user approval.

Acceptance: reload, reconnect, and next-day confirmation tests. Stale underlying data invalidates the proposal and triggers reassessment.

### 6. Cross-agent handoff contract

Current weakness: generic coordination tools exist, but no universal proof that the receiving specialist inspected the source and returned a result.

Target: a handoff contains objective, question, evidence pointers, constraints, expected output, and return status. The specialist returns findings, confidence, limitations, and proposed action. Hammond verifies completion before synthesis.

Acceptance: handoff trace shows request, specialist evidence, result, and Hammond’s reconciliation. Missing responses remain open rather than appearing completed.

### 7. Context budgeting

Current weakness: the system prompt contains voice, protocols, catalogues, digests, evidence packs, and shared capabilities. More context may reduce attention and increase cost.

Target: build context in layers. Always include identity and critical safety. Retrieve working memory and only relevant protocol fragments. Load evidence progressively. Summarise old conversation into observations. Record every included block and its token cost.

Acceptance: prompt composition snapshots show why each block entered context. Quality stays stable while median context size falls.

### 8. Trace-based behavioural evaluation

Current weakness: tests exercise functions and simulated tool execution. They do not judge complete conversations.

Target: record routing, retrieval, tool arguments, store results, calculations, memory reads, memory writes, final claims, citations, latency, and cost. Evaluate both trajectory and response.

Acceptance: live model evaluation for every agent, including paraphrases and adversarial incomplete data. A capability ships only when trajectory and answer thresholds pass.

### 9. Reflection with governance

Current weakness: intuition editing and promoted shortcuts exist, but there is no disciplined learning loop from failures.

Target: collect repeated failures, corrections, and successful paths. A background process proposes a memory update, protocol change, new deterministic tool, or new evaluation case. Human confirmation remains mandatory for high-impact changes.

Acceptance: every learned change cites the failures which motivated it and adds a regression case. The agent never edits its own safety or write permissions.

### 10. Tool portfolio control

Current weakness: agents receive a large common tool floor, which inflates capability counts and makes selection harder.

Target: each turn receives a small tool set selected from the plan. Shared actions remain available through a single action gateway. Domain tools expose clear input, output, failure, and continuation schemas.

Acceptance: fewer irrelevant tool calls, lower prompt overhead, and no loss of required functionality.

## Agent-specific strategy

### Chadwick Flexington — priority first

Primary outcome: autonomous longitudinal fitness interpretation and safe training decisions.

New Life Hub capabilities: training coverage inspector; exercise progression analyser; programme adherence interpreter; recovery and pain gate; session recommendation with rationale; programme change proposal; counterfactual explanation of why one option fits better than another.

Chadwick has the richest deterministic foundation and offers the fastest proof of the shared kernel.

### Clare DeMind — priority first, alongside Chadwick

Primary outcome: produce a realistic next action from complete task, project, capacity, and deadline state.

Clare is no longer a thin read adapter. Life chat loads both Tasks and Projects. Her workbench exposes fifteen named tools covering forty jobs: task and project writes behind confirmation, dump parsing, project inspection, stale and blocked task views, simple duplicate detection, day planning, weekly load, Teaching calendar reads, protocol runs, protocol updates, public page fetching, source comparison, and communication drafts.

Remaining weakness is orchestration quality, not missing basic task tools. Time blocking starts at a fixed 08:00 workday and lays tasks in sequence. Teaching lessons are counted but their times do not reserve calendar space. The energy view ranks urgency, overdue state, short duration, and a comms tag. It does not read current energy or cognitive load. Duplicate detection requires exact title matches. The project view links child tasks, but does not reason across goals, milestones, dependencies, or project health. Forced activation covers only a small subset of likely requests. Current tests prove schemas, helper outputs, write routing, and selected activation rules. They do not prove the model completes varied multi-step conversations or produces a sound final plan.

New Life Hub capabilities: timed calendar-aware scheduling; goal, milestone, and dependency reasoning; real capacity and energy input; semantic duplicate detection; project health and next-action coverage; interruption recovery; commitment capture from other agents; deferred-task rationale; completion feedback loop; dynamic tool selection; trace-based evaluation of final plans.

### Dr Sara Tonin — first wave after the shared kernel

Primary outcome: longitudinal health context with uncertainty, provenance, and safe escalation.

New capabilities: clinical timeline builder; medication and treatment cycle context; laboratory trend normaliser; contradiction detector; appointment brief; evidence-graded explanation; escalation gate.

### Ann O’Tation — first wave after Clare

Primary outcome: diagnose teaching material from real class, unit, lesson, and learner context before suggesting a precise repair.

New capabilities: lesson hinge diagnosis; sequence position analysis; class context retrieval; smallest repair generator; curriculum evidence bridge; post-lesson outcome capture; reuse search across prior successful lessons.

### Professor Clementine Haig — first wave after the shared kernel

Primary outcome: inspect the knowledge corpus, form a source-grounded synthesis, and expose gaps or contradictions.

New capabilities: query decomposition; multi-pass retrieval; claim and source graph; contradiction register; coverage scoring; research continuation; Knowledge-to-Teaching bridge; note proposal with provenance.

### Brisket Lasso — second wave

Primary outcome: distinguish logged intake, missing logging, adherence, and likely behavioural patterns.

New capabilities: logging completeness estimator; adherence confidence rating; meal pattern search; target version history; day remaining planner; challenge progress interpreter; nutrition and symptom handoff to Sara.

### Penelope Rose Quillian — second wave

Primary outcome: retrieve relevant diary history and support reflection without inventing patterns.

New capabilities: semantic diary search; recurrence estimator; event and feeling linkage; contradictory evidence display; diary voice preservation; consent-controlled sharing with Vera or Hammond.

### Dr Vera Lenz — second wave, after memory governance is proven

Primary outcome: longitudinal psychological reflection with strict boundaries and evidence discipline.

New capabilities: session thread continuity; evidence threshold for patterns; interpretation correction history; safety escalation; consent boundary manager; session note proposal.

### Hyaluronica St. Claire — second wave

Primary outcome: assess routines and treatments across versions, adherence, timing, and observed response.

New capabilities: routine version timeline; exposure and response alignment; product interaction checker; treatment evidence confidence; image comparison intake; routine change proposal.

### General Hammond — third wave

Primary outcome: maintain a verified cross-hub picture, delegate analysis, and turn priorities into coordinated action.

New capabilities: verified delegation; specialist return contracts; cross-hub conflict reconciliation; goal dependency map; decision record with assumptions; open-loop monitoring; completion verification; evidence-bounded prioritisation.

Hammond depends on specialists becoming reliable first. Building the supervisor before specialist competence would amplify weak outputs.

## Recommended architecture

### Keep

- Existing domain stores as sources of truth.
- Existing deterministic fitness, nutrition, task, teaching, medical, and knowledge functions.
- Current persona voices and domain protocols.
- Confirmation-based writes and path allowlists.
- Existing streaming interface where stable.

### Replace

- Regex activation as the main evidence trigger.
- The rule where any nonempty evidence section makes a turn answerable.
- Large static tool menus on every turn.
- Simulated orchestration tests presented as behaviour proof.
- Separate interpretations of the same agent across Life, Tasks, Teaching, and Knowledge surfaces.

### Add

- `AgentTurnState` with typed fields for plan, evidence, coverage, conflicts, memory, actions, and answer.
- `planTurn` to select domains, sources, tools, and completion criteria.
- `retrieveEvidence` with bounded pagination and provenance.
- `assessEvidence` to determine sufficiency rather than mere presence.
- `resolveConflict` for discrepant records.
- `composeAnswer` with claim-to-evidence mapping.
- `proposeAction` as one resumable confirmation interface.
- `recordTrace` for every stage.
- Layered memory with explicit authority and expiry.
- Live behavioural datasets for each agent.

## Implementation sequence

### Phase 0 — Correct the current claims and defects

- Update capability documents to recognise Clare’s current workbench and project loading.
- Replace synthetic Clare, Ann, Clementine, and Hammond demo records with genuine store fixtures, or label them synthetic.
- Stop describing function tests as agent behaviour tests.
- Add final-answer assertions to the existing fourteen scenarios.
- Add adversarial Clare cases for corrections, long lists, missing times, calendar collisions, stale projects, and partial tool failure.

Exit: documentation matches observed evidence.

### Phase 1 — Shared kernel pilot with Chadwick and Clare

**Status (2026-09-07):** implemented beside the existing path. Off unless `LIFE_HUB_AGENT_KERNEL=1` or the chat body sets `agentKernel: true`. Pilot slugs: Chadwick and Clare only.

- `AgentTurnState` and the evidence loop live in `netlify/functions/_shared/agent-kernel.mjs`.
- Chadwick `training_review` and Clare `daily_focus` are token-planned workflows (not one regex per paraphrase).
- Traces record plan, retrieve, assess, resolve, compose, and idempotent actions.
- Sufficiency replaces “any evidence section is answerable” on the flagged path.
- Live conversational turns still need `ANTHROPIC_API_KEY`.

Exit: both agents pass varied paraphrases, missing data, conflicting data, truncation, and recovery tests.

### Phase 2 — Memory foundation

**Status (2026-09-07):** self-owned layered memory beside the existing remember store. No Mem0 install. Pilot write tool is Chadwick + Clare only.

- Classes: `user`, `agent`, `shared`, `episodic` in `netlify/functions/_shared/agent-memory.mjs`.
- Persist path: `data/remember/layered-memories.json` (already under `data/remember/**` allowlists).
- Recall is token overlap with expiry, correction history, and agent visibility. Kernel compose labels memory as recall, never as a domain record.
- `remember_write_memory` adds or corrects memories (auto) and proposes reflections (Confirm). Safety / permission reflections cannot apply.
- Authoritative fitness, nutrition, medical, task, teaching, and knowledge stores remain source of truth.

Exit: agents recall approved context, respect expiry, and never substitute memory for source records.

### Phase 3 — Remaining specialist workflows

**Status (2026-09-07):** flagged kernel workflows for the remaining specialists, beside Chadwick and Clare. Pack-layer paraphrases, named gaps, and Delivery are Demonstrated. Live conversational E2E remains Blocked (no `ANTHROPIC_API_KEY`). Hammond stays Phase 4.

- Sara `health_timeline`, Ann `lesson_diagnosis`, Clementine `knowledge_research`, Brisket `nutrition_adherence`, Hyaluronica `routine_response`, Penelope `diary_recurrence`, Vera `mind_reflection`.
- Same plan → retrieve → assess → compose loop. Empty stores and conflicts are named gaps.
- Delivery forbids invented visits, lessons, archive pages, complete adherence, routine improvement, diary patterns, and longitudinal mind claims.

Exit: each specialist passes domain-specific live datasets and end-to-end tests. Pack-layer exit is met. Live conversational exit is still Blocked.

### Phase 4 — Hammond supervisor

**Status (2026-09-07):** flagged kernel workflow `cross_hub_supervision`. Pack-layer handoffs, verification, unavailable hubs, and Confirm-pending writes are Demonstrated. Live conversational E2E remains Blocked.

- Hammond plans, retrieves hub signals + attention pack, then delegates canned specialist questions.
- Each handoff has objective, question, evidence pointers, constraints, expected output, and return status.
- Specialists return findings, confidence, limitations, and proposed action. Missing returns stay `open`.
- Delivery forbids inventing specialist rows and treating a drafted decision record as user truth before Confirm.

Exit: Hammond completes cross-hub scenarios using verified specialist evidence, names unavailable domains, and preserves confirmation boundaries. Pack-layer exit is met. Live conversational exit is still Blocked.

### Phase 5 — Surface unification and optimisation

**Status (2026-09-07):** Life, Tasks, Teaching, and Knowledge call `runSurfaceAgentTurn` in `netlify/functions/_shared/agent-surface.mjs`. Presentation stays on each surface.

- Life chat (`chat.mjs`) uses surface `life`.
- Tasks Clare briefing (`clare-desk.mjs` / `/api/clare` brief) uses surface `tasks` and the same kernel + memory as Life Clare.
- Knowledge Clementine chat uses surface `knowledge`.
- Teaching Ann uses `runTeachingAnnTurn` (`teaching-ann-turn.mjs`) — same runner with surface `teaching`.
- Surface-specific hats, briefings, and Confirm cards stay. Retrieval and layered memory do not fork.

Exit: the same agent demonstrates the same read competence and memory across every surface.

## Priority matrix

**Critical now**

- Shared evidence sufficiency loop.
- Live trajectory and answer evaluation.
- Clare orchestration and calendar accuracy beyond her new workbench plumbing.
- Genuine store-based demonstrations.
- Typed source and claim provenance.

**High value next**

- Layered memory.
- Chadwick and Clare workflow pilots.
- Sara safety and provenance workflow.
- Ann and Clementine iterative retrieval.
- Resumable confirmation state.

**Later**

- Hammond supervisor.
- Background reflection.
- Multimodal skincare and document evidence.
- Automated memory decay and consolidation.
- Full surface unification.

**Avoid**

- Installing all four frameworks.
- Migrating domain records into an agent memory database.
- Counting schemas, prompts, or shared tools as delivered capabilities.
- Adding more regexes for each failed paraphrase.
- Letting agents rewrite their own safety, permissions, or authoritative facts.
- Building Hammond before specialist reliability exists.

## Success measures

| Measure | Meaning |
| --- | --- |
| Recognition | Relevant source family selected across varied natural language |
| Retrieval | Required stores inspected without the user naming tools |
| Coverage | Missing periods, truncation, and failed stores identified |
| Interpretation | Deterministic figures agree with source calculators |
| Memory | Approved facts persist, corrections supersede prior memories, expired context fades |
| Action | Recommendations follow evidence and respect domain constraints |
| Safety | High-impact claims show provenance, uncertainty, and confirmation boundaries |
| Recovery | Interrupted turns resume without duplicated writes |
| Coordination | Handoffs return verified specialist results |
| Quality | Final responses meet domain rubrics and remain in character |
| Operational | Latency, token cost, and failure rates stay within agreed budgets |

## Final recommendation

Use Mastra as the main implementation reference, not as an immediate replacement framework. Use LangGraph to define the shared evidence and recovery state machine. Use Letta to define memory boundaries, shared memory, and reflection. Use Mem0 behind a narrow memory interface for semantic conversational recall if a small pilot proves accuracy and privacy.

Start with Chadwick and Clare. They expose the two most important failure types: domain evidence retrieval and operational planning across incomplete state. Add Sara next for provenance and safety. Add Ann and Clementine for iterative retrieval. Only then give Hammond supervisory control.

The required shift is from installed tools to verified cognitive work. Every claimed capability needs a real user request, a visible execution trace, authoritative evidence, a useful final answer, and a regression test.

## Material limitations

This assessment is based on public documentation and repositories accessed on 6 September 2026, plus a Clare rescan of the public Life Hub main branch on 7 September 2026. No production secrets or private `life-hub-data` records were accessed for the original assessment. No live model conversations were run in that review. Recommendations involving managed Mem0 features should be checked against current privacy, hosting, and pricing requirements before adoption.

## Sources

- Life Hub agent directory: `netlify/functions/_shared/agent-directory.mjs`
- Life Hub capability audit: `docs/AGENT_CAPABILITY_AUDIT.md`
- Life Hub Clare workbench: `netlify/functions/_shared/clare-work.mjs`
- Life Hub Clare workbench tests: `tests/unit/clare-work.test.js`
- Give Clare DeMind a forty-job chat workbench: commit `8c6afae`
- Fix Clare treating wording corrections as new tasks: commit `837d0fa`
- [Mastra agents](https://mastra.ai/docs/agents/overview)
- [Mastra workflows](https://mastra.ai/docs/workflows/overview)
- [Mastra memory](https://mastra.ai/docs/memory/overview)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Letta memory](https://docs.letta.com/agent-sdk/memory/)
- [Mem0 open source](https://docs.mem0.ai/open-source/overview)
