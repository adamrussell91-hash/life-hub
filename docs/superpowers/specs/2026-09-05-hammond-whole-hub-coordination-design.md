# Hammond whole-hub coordination

**Date:** 2026-09-05  
**Status:** Approved (implementing). Decision (b) revised 2026-09-05: Ann gets the same restricted mailbox as Clare this pass.  
**Does not replace:** `2026-08-09-hammond-central-node-governance-design.md` (CN + Governance Log write contract, Confirm vs auto, thin vs full CN) or `2026-08-07-hammond-phased-cn-audit-design.md` (five-phase audit, one phase per turn).  
**Supersedes, narrowly:**

- `2026-08-11-hammond-closed-loop-design.md` — “Clare / Ann remain unbuilt; preserve references only.” Clare is a live Tasks agent; Ann is a live Teaching agent. Both are already in `agent-directory.mjs`. This spec builds the Clare↔Hammond and Ann↔Hammond mailboxes and lets the audit *read* Tasks + Teaching. It does not rebuild Ann’s full teaching-coach product.
- `2026-08-19-mind-cross-agent-protocol-design.md` — “Never address a relay to Ann or Clare” / `CROSS_AGENT_AGENT_NAMES` excludes them. That was true when they were unreachable. **Hammond↔Clare and Hammond↔Ann are now real hops.** Mind-agent hops (Vera/Penelope → Clare/Ann) stay out of this pass; their protocol sentences can wait.

**Chart / UI language:** none. This is prompt, audit-contract, and mailbox wiring. Central Node heatmaps stay the five Life domains.

**Approach:** Use the mailbox that already exists (`cross_agent` + `propose_central_node_patch`). Do not invent a second coordination channel. Do not widen `DOMAIN_PATH`. Do not call another hub’s 26s AI function from inside a Hammond, Clare, or Ann turn.

---

## Goal

Hammond’s Central Node audit, Clare’s dump triage, and Ann’s teaching turns share one durable mailbox, and the audit’s “what’s stale / what’s an open loop” can see open Tasks and upcoming Teaching lessons — without adding a fetch, a timeout surface, or a new endpoint.

Today the pieces are already half-built and do not meet:

- `hub-agent-context.mjs` already loads capped Tasks + Teaching via `safeList()` + `Promise.all`, but `chat.mjs` only awaits it when `slug === 'hammond'`, and it never reaches CN markdown or the audit phase contracts.
- `persona.mjs` has `chadwickBlocks` / `saraBlocks` / `hammondBlocks` and no `clareBlocks` / `annBlocks`. Clare and Ann are routed and voiced; they are not told to read `Hammond→Clare` / `Hammond→Ann` or to write a Cross-Agent line.
- `central-node.md` Agent Directory still lists only the seven Life agents.
- `hammond-digest.mjs` `DOMAIN_PATH` is hardcoded to `nutrition|fitness|body|mind|skincare`. Tasks and Teaching cannot enter the 90-day digest or CN heatmaps through that regex, and must not be forced through it.
- `config/hammond-protocol.md` still says never to address Clare or Ann.

---

## Locked decisions

| Topic | Choice |
|---|---|
| **(a) Clare persona block** | **`clareBlocks` ships this pass.** Coordination does **not** wait for a writes-only fast-follow. Why: Hammond can already write `Hammond→Clare:` today; Clare will not treat those lines as pre-dump input, and will not write back, without a block. A writes-only ship is one-way. See [Decision (a)](#decision-a--clareblocks-now). |
| **(b) Teaching / Ann** | **Tasks and Teaching ship together on the read and the write.** `loadHubAgentContext` already returns both. Ann gets `annBlocks` + the same restricted `propose_central_node_patch` Clare gets (`cross_agent` + `append_line` + `Ann→` sender). A directory bullet alone would leave Teaching integration hollow. See [Decision (b)](#decision-b--tasks--teaching-together-on-read-and-write). |
| **(c) Knowledge / Clementine** | **Explicitly out of scope.** No `clementineBlocks`, no Knowledge rows in hub-agent-context, no Clementine Agent Directory bullet, no `Hammond→Clementine` hop. Do not silently half-include her. |
| Mailbox | Central Node `cross_agent` via `propose_central_node_patch` `{ section: 'cross_agent', op: 'append_line' }`. Same mailbox Chadwick→Sara already uses. Not a live agent-to-agent session. Not `coordinate_request_cn_write` (that tool writes a loan JSON file and does **not** apply the line to `central-node.md`). |
| Clare / Ann tool | Clare and Ann each get a **restricted** `propose_central_node_patch`: `cross_agent` + `append_line` only, sender must be `Clare` or `Ann` respectively. Neither gets `append_governance_log` or any other CN section. Hammond remains the only full CN mutator. |
| `needsHammondTools` | Stays `slug === 'hammond'` in `chat.mjs`. Do not start `loadHubAgentContext` for Clare or Ann. Do not add a second hub-context fetch on Hammond’s turn. Register the restricted patch tool in `buildAgentTools` when `needsHammondTools` or `slug === 'clare'` or `slug === 'ann'`. |
| Audit data | Reuse the **existing** `hubContext` string already injected into `hammondBlocks`. Update `PHASE_CONTRACTS` for `stale_drift` and `open_loops` (client + server mirrors) so those phases must consider the Other hubs block. Do **not** import or re-call `loadHubAgentContext` from `hammond-audit.mjs`. |
| 90-day digest / CN heatmaps | **Do not extend.** Leave `DOMAIN_PATH` and `selectHammondEventEntries` untouched. No second presence-scan over `tasks-blobs.mjs` / `teaching-blobs.mjs` this pass. Live capped snapshot in the prompt is enough for stale/open-loop judgment. Heatmaps stay health-domain math. |
| Governance entry | `GOVERNANCE_ENTRY_TYPES` already includes `Cross-Domain Tension`. Lock-phase contract tells Hammond to use that type when task load conflicts with a Life constraint. No new enum value. |
| Hammond→Clare / Hammond→Ann duty | Situational, not a standing “post one or record nothing” on every Weekly Review. Write `Hammond→Clare:` when a Life constraint should change task load or scheduling. Write `Hammond→Ann:` when a lesson/load collision is visible in the Other hubs block. Silence is fine when no collision is visible. |
| Chat path | Umbrella `/api/chat` → 202 → `/api/chat-run` (15 min) → poll `/api/chat/events`. Shared by every `agent-directory.mjs` slug, Clare and Ann included. Tasks Hub `/api/clare` stays the dump/desk loop it is today — do not add CN patch writes there. |
| 26s functions | Never call `knowledge-clementine-chat`, `knowledge-tidy`, `knowledge-podcast-path`, `lesson-alchemist`, or `alchemy-lab` from a Hammond, Clare, or Ann turn. |

### Decision (a) — `clareBlocks` now

**Rejected: writes-only first (Hammond patches alone, `clareBlocks` later).**  
Hammond already has the tool and the full CN. Shipping only `Hammond→Clare:` lines would park unread mail. Clare’s dump path has no instruction to look, and no instruction to write `Clare→Hammond:` when a deadline collides with a Life constraint. That is the Chadwick-without-`chadwickBlocks` failure mode.

**Rejected: `coordinate_request_cn_write` as Clare’s write.**  
It is on the OS floor (`agents: ["*"]`) and looks like “not a new mechanism.” Runtime: `handleCoordinateRequestCnWrite` appends to `CN_LOANS_PATH` and returns `loan_auto` without calling `applyCentralNodePatch`. A Clare “write” would not appear in Cross-Agent, so Hammond would not see it. Wrong mailbox.

**Chosen: `clareBlocks` this pass + restricted `propose_central_node_patch`.**  
Mirrors Chadwick→Sara in *shape* (one `Sender→Recipient:` observation line, auto-applied, no new channel) and uses the tool that actually mutates `central-node.md`. Chadwick reaches that mailbox via `log_entry` `pain_flags` / `cross_agent_note` because he has domain records. Clare’s `recordTypes` is `[]`, so the equivalent write is the existing patch tool, locked down.

### Decision (b) — Tasks + Teaching together on read and write

**Rejected: Tasks-only audit this pass.**  
Step 2’s own acceptance line names “open Tasks and upcoming Teaching lessons.” `formatHubAgentContext` already emits both under one `Other hubs` block with `TASK_CAP` / `CLASS_CAP` / `LESSON_CAP`. Dropping Teaching from the contract while leaving it in the prompt is a silent half-include.

**Rejected: directory-only Ann (read together, write Clare-only).**  
A directory bullet plus Hammond mentioning a lesson in audit prose is not Teaching integration. Ann stays exactly as unwired as before: no `annBlocks`, no read-before-respond instruction, no way to persist `Ann→Hammond:`. Decision (a)’s one-way-mailbox failure applies a second time.

**Chosen: mirror every Clare mechanism for Ann this pass.**  
Same restricted shape, same Decision (a) reasoning. `annBlocks` (read `Hammond→Ann` before responding; write `Ann→[Agent]:` via restricted `propose_central_node_patch`). Same tool registration (`slug === 'ann'` next to `slug === 'clare'`). Same `assertAgentMayApplyCentralNodePatch` gate (`Ann→` sender). Same tests. No `hubContext` in Ann’s prompt — she already owns the Teaching store. Knowledge / Clementine stays out.

### Decision (c) — Clementine out

Lower priority, different store, and her named functions (`knowledge-clementine-chat`, tidy, podcast-path) are the exact 26s-capped deploys this spec must not call. A Knowledge row in hub-agent-context would be a new read with no product owner on the audit this pass. Out. Fast-follow only after Clare↔Hammond and Ann↔Hammond are measured.

---

## Approaches considered

**1. Prompt + existing mailbox (chosen).**  
`clareBlocks` + `annBlocks` / extra `hammondBlocks` line covering both / phase-contract prose / Agent Directory / restricted patch registration for Clare and Ann. No new tool name, no digest regex change, no new function.

**2. Second presence-scan in `hammond-digest.mjs`.**  
Mirror `selectHammondEventEntries` over Tasks/Teaching blob keys and fold counts into the 90-day digest and heatmaps. Rejected this pass: stores are a different shape (JSON blobs, not `data/<domain>/YYYY/MM/<date>-<name>.md`); heatmap math (logging completeness, exercise completed, eating targets) has no honest task/lesson analogue; the audit already has a live capped snapshot. Revisit if Adam wants a “tasks closed this week” strip on the CN tab.

**3. Cross-hub AI fan-out.**  
Hammond’s audit turn calls Tasks/Teaching/Knowledge AI functions for a richer brief. Rejected: those functions are 26s-capped separate deploys. Calling one from inside an already-running turn stacks an uncontrolled timeout on the first.

---

## Out of scope

- Knowledge Hub / Professor Clementine Haig (persona, directory, digest, audit rows, Cross-Agent hop)
- Ann dump/lesson protocol rewrite (Teaching Hub `ann-protocol.md` stays what it is; this pass only adds umbrella `annBlocks` + the restricted CN mailbox)
- `clementineBlocks`
- Widening `DOMAIN_PATH` or feeding Tasks/Teaching into `buildCentralNodeModel` heatmaps / This Week / This Month / Trends
- A second 90-day presence-scan over `tasks/` or `scheduled_lessons/`
- New endpoints, new background-job machinery, new record types, new Governance Log entry types
- Injecting open directives into another agent’s system prompt beyond the thin/full CN already loaded (still rejected by the 2026-08-09 governance contract)
- Auto-chaining audit phases
- Repurposing `/api/clare`, `lesson-alchemist`, `alchemy-lab`, or `knowledge-clementine-chat` as general chat
- Vera/Penelope → Clare/Ann hops, or changing Mind dashboard `mindCrossAgentLines` filters
- Goals database
- Coach’s Notes synthesis
- UI restyle of Central Node, Tasks, or Teaching

---

## Cuts (must not land)

1. Any change to `needsHammondTools = slug === 'hammond'` that starts a new blob/store read on Hammond’s turn.  
2. Any import of `knowledge-clementine-chat.mjs`, `lesson-alchemist.mjs`, `alchemy-lab.mjs`, or `knowledge-tidy` from `chat.mjs` / `hammond-audit.mjs` / `hub-agent-context.mjs` / `persona.mjs`.  
3. Any edit to the `DOMAIN_PATH` regex or to `DOMAINS` in `hammond-digest.mjs`.  
4. Giving Clare (or Ann) `append_governance_log` or unrestricted `propose_central_node_patch`.  
5. Calling `loadHubAgentContext` from inside `hammond-audit.mjs` / `apps/life/js/app/hammond-audit.js`. The loader stays in `chat.mjs`; the audit module only gains contract *prose*.

---

## Governance contract (unchanged)

From `2026-08-09-hammond-central-node-governance-design.md`, still binding:

- Hammond reads **full** `central-node.md` every Hammond turn; other agents keep the thin slice (Constraints + Status + Cross-Agent + Recent Actions). Clare and Ann stay on the thin slice.
- Cross-agent instructions persist as `Sender→Recipient:` lines in Cross-Agent. No private side-channel, no live-session injection.
- `propose_central_node_patch` risk classes stay as they are. `cross_agent` + `append_line` is already **auto**.
- `purpose` / `writing_rules` / `agent_directory` remain Confirm-class. Adding Clare/Ann to the live `central-node.md` Agent Directory is a Confirm-class patch **or** a checked-in markdown edit in this repo’s seed/live file — implementers edit the file in git, they do not ask Hammond to `replace_section` the directory as part of a chat turn.
- Governance Log stays append-oriented. `Cross-Domain Tension` is an existing type, not a new one.
- No new GitHub fetch storm vs today’s Hammond load path. Hub-agent-context is already started as a Promise on Hammond turns.

From `2026-08-07-hammond-phased-cn-audit-design.md`, still binding:

- One turn = one phase. Contracts still forbid later-phase dumps.
- Trigger phrases stay in `TRIGGER_PATTERNS` (no new phrases required).
- Lock still ends the session and still requires `append_governance_log` before the client/server will advance off `lock`.

Timeout note from the 2026-08-07 spec (“keep each phase under Netlify’s function wall-clock”) is **historical**. The live path is `/api/chat` → background `/api/chat-run` (15 min) → `/api/chat/events`. Phase contracts stay compact because the product still wants short replies, not because a 26s wall remains on this path.

---

## Architecture

```
Clare dump / triage  (/api/chat, slug=clare)
  → thin CN (already includes Cross-Agent)
  → clareBlocks: read Hammond→Clare before triaging
  → if durable collision: propose_central_node_patch
       { section: 'cross_agent', op: 'append_line',
         payload: { text: 'Clare→Hammond: …' } }
  → server: reject any other section/op; auto-apply the line

Ann teaching turn  (/api/chat, slug=ann)
  → thin CN (already includes Cross-Agent)
  → annBlocks: read Hammond→Ann before responding
  → if durable collision: propose_central_node_patch
       { section: 'cross_agent', op: 'append_line',
         payload: { text: 'Ann→Hammond: …' } }
  → server: reject any other section/op; auto-apply the line

Hammond audit turn  (/api/chat, slug=hammond)
  → needsHammondTools (unchanged)
  → existing hubContextPromise = loadHubAgentContext()   // already Parallel, fail-open
  → existing 90-day Life digest + 30-day CN model (5 domains only)
  → hammondBlocks: full CN + hubContext
       + “read Clare’s and Ann’s lines; write Hammond→Clare / Hammond→Ann when warranted”
  → PHASE_CONTRACTS stale_drift / open_loops: must use Other hubs (Tasks + Teaching)
  → lock: append_governance_log
       entry_type 'Cross-Domain Tension' when task load vs Life constraint
       + propose_central_node_patch Hammond→Clare (and Hammond→Ann if a lesson collision)

Never:
  Hammond turn → knowledge-clementine-chat / lesson-alchemist / /api/clare
  /api/clare (Tasks desk) → propose_central_node_patch   // not this pass
```

### Line format

Observation, not instruction — same rule as the 2026-08-19 Mind spec:

- `Clare→Hammond: 11 open tasks due this week, two collide with the Crohn’s rest flag.`
- `Ann→Hammond: 11PSYCHA double period Thursday sits on the flare rest flag.`
- `Hammond→Clare: flare constraint still active — do not stack evening deep-work after 21:00 this week.`
- `Hammond→Ann: flare constraint still active — do not add a third after-school rehearsal this week.`

Never `Clare→Hammond: tell him to drop the marking.` The receiving agent decides what to do.

Always `Sender→Recipient:` with a real implemented recipient. **Senders** who may use this mailbox this pass: Hammond, Clare, Ann (plus existing Life specialists via their own paths). **Recipients** Clare or Ann may address: Hammond, Sara, Brisket, Chadwick, Vera, Penelope, Hyaluronica, Clare, Ann. Not Clementine. Not themselves.

---

## Step 1 — Clare↔Hammond and Ann↔Hammond coordination (data + prompt)

### `clareBlocks` (`persona.mjs`)

Mirror `chadwickBlocks` in *shape* (slug-gated array spread into `buildSystemPrompt`), not content. When `slug === 'clare'`:

1. Tell Clare to read Central Node Cross-Agent for `Hammond→Clare` (and any other `→Clare`) **before** triaging a dump or proposing task writes.
2. Tell her to call `propose_central_node_patch` with `section: 'cross_agent'` (and `op: 'append_line'`) when something durable must reach Hammond or another agent — task load spiking, a deadline colliding with a Life constraint. Chat-only lines are not memory.
3. One line, observation not instruction, `Clare→[Agent]:` prefix.
4. Do not claim she logged a Cross-Agent line unless the tool returned success / auto-applied.
5. Do not mention Knowledge / Clementine. Do not invent Tasks or Teaching rows that are not in her own tools.

Do **not** inject `hubContext` into Clare’s prompt. She owns the Tasks store; a second umbrella snapshot is redundant and would be a new read.

Spread `...clareBlocks` next to the other agent arrays. Non-Clare slugs must not see this prose (match existing `non-hammond prompts never include …` tests).

### `annBlocks` (`persona.mjs`)

Mirror `clareBlocks` in *shape*, not content. When `slug === 'ann'`:

1. Tell Ann to read Central Node Cross-Agent for `Hammond→Ann` (and any other `→Ann`) **before** responding.
2. Tell her to call `propose_central_node_patch` with `section: 'cross_agent'` (and `op: 'append_line'`) when something durable must reach Hammond or another agent — a lesson/load collision, a teaching deadline hitting a Life constraint. Chat-only lines are not memory.
3. One line, observation not instruction, `Ann→[Agent]:` prefix.
4. Do not claim she logged a Cross-Agent line unless the tool returned success / auto-applied.
5. Do not mention Knowledge / Clementine.

Do **not** inject `hubContext` into Ann’s prompt. She owns the Teaching store; a second umbrella snapshot is a redundant new read.

Spread `...annBlocks` next to the other agent arrays. Non-Ann slugs must not see this prose.

### `hammondBlocks` addition

Add one instruction to the existing `hammondBlocks` array (not a new array). It must cover **both** Clare and Ann — not Clare-only:

- Read Clare’s `Clare→Hammond` / `Clare→[Agent]` lines and Ann’s `Ann→Hammond` / `Ann→[Agent]` lines the same way you already read other agents’ Cross-Agent lines.
- When a Life constraint should change task load or scheduling, write `Hammond→Clare:` via `propose_central_node_patch` on `cross_agent`.
- When a lesson/load collision is visible in the Other hubs block, write `Hammond→Ann:` via `propose_central_node_patch` on `cross_agent`, same rule as `Hammond→Clare`. Do not invent Teaching facts beyond that block.
- Do not address Clementine.

### Agent Directory (`central-node.md`)

Add two bullets in the existing format, after the seven Life agents:

- **Clare DeMind (Tasks Agent):** Dump triage, Now/Later/Trash, confirm-before-write task mutations. Reads `Hammond→Clare` before a dump; writes `Clare→Hammond` (or `Clare→[Agent]`) when task load or a deadline collides with a Life constraint.
- **Ann O'Tation (Teaching Agent):** Lesson diagnosis and classroom-ready repair. Reads `Hammond→Ann` before responding; writes `Ann→Hammond` (or `Ann→[Agent]`) when a lesson/load collision or teaching deadline hits a Life constraint.

Do not add Clementine.

### Restricted patch tool for Clare and Ann

`publish.cn-patch` is currently `agents: ["hammond"]` and `buildAgentTools` only pushes the schema when `needsHammondTools`. That gate is why a prompt-only Clare or Ann would call a tool they do not have.

This pass:

1. Add `'clare'` and `'ann'` to `capabilities/publish/cn-patch.json` `agents`.
2. Add `central-node.md` to `capabilities/allowlists/clare.json` and `capabilities/allowlists/ann.json` `write_globs` (both already have it on `read_globs`).
3. In `buildAgentTools`, register `proposeCentralNodePatchSchema()` when `has('publish.cn-patch') && (needsHammondTools || slug === 'clare' || slug === 'ann')`. **Do not** change `needsHammondTools` in `chat.mjs`. **Do not** register `append_governance_log` for Clare or Ann.
4. In `hammond-tools.mjs`, add `assertAgentMayApplyCentralNodePatch(slug, patch)` and call it from the existing patch-apply site:
   - `slug === 'clare'`: only `{ section: 'cross_agent', op: 'append_line' }` with a `Clare→` sender.
   - `slug === 'ann'`: only `{ section: 'cross_agent', op: 'append_line' }` with an `Ann→` sender.
   - otherwise reject and do not write.
   Hammond’s existing risk classifier is unchanged.

`coordinate.request-cn-write` stays on the OS floor for every agent. Clare’s and Ann’s *new* instruction prefers `propose_central_node_patch` for Cross-Agent so the line lands on CN. They may still use the loan tool for other CN sections (those remain loan-file writes, not this spec’s mailbox).

### Protocol text

`config/hammond-protocol.md` — delete or replace the paragraph **“Never address a relay to Ann O'Tation or Clare DeMind.”** Clare and Ann are situational relay targets as above. Clementine stays unaddressed.

`apps/teaching/config/ann-protocol.md` and `config/knowledge/annotation-voice.md` — checked 2026-09-05; neither has an equivalent “never address a relay” sentence. No edit required there.

`config/vera-protocol.md` / `config/penelope-protocol.md` — leave the “never Ann or Clare” sentences this pass (Mind hops are out of scope).

`validate.js` `CROSS_AGENT_AGENT_NAMES` — add `Clare` and `Ann`. Do **not** add Clementine. The allowlist is “implemented chat agents,” not “who Vera may write to.” `Hammond→Clare`, `Clare→Hammond`, `Hammond→Ann`, `Ann→Hammond`, and `Clare→Ann` / `Ann→Clare` are structurally valid. The 2026-08-19 “Vera→Ann rejected because Ann is not implemented” test is **deleted or inverted** (shape is now valid). Vera/Penelope protocol prose still tells them not to address Clare/Ann this pass — that stays a protocol rule, not a second allowlist matrix.

### Gate reminder

`chat.mjs` `hubContextPromise` stays inside `needsHammondTools`. Clare’s and Ann’s turns do not grow a hub-context fetch. No new synchronous await on Hammond’s turn — the Promise is already started at the top of the Hammond branch and awaited once at prompt-build time.

---

## Step 2 — Audit considers all hubs (the audit itself)

### Phase contracts (both mirrors, keep them aligned)

`netlify/functions/_shared/hammond-audit.mjs` and `apps/life/js/app/hammond-audit.js` `PHASE_CONTRACTS`:

**`stale_drift`** — after the existing “shaped by Central Node and intake” sentence, require: also use the **Other hubs** block already in this prompt (open Tasks, active classes, upcoming lessons). A task that has sat, or a class/lesson window with no matching Life capacity, is in scope for “stale” / “drifting.” Do not invent rows that are not in that block. Do not run open loops or lock yet.

**`open_loops`** — after the existing “name open loops that matter this week/month” sentence, require: include open Tasks and upcoming Teaching lessons from the Other hubs block when they are real loops (due soon, overdue, or colliding with a Constraint / Status flag). Compact. Do not lock yet.

**`lock`** — keep the existing `append_governance_log` + `propose_central_node_patch` requirement. Add: if this audit found a task-load vs Life-constraint collision, the Governance Log entry_type is **`Cross-Domain Tension`** (already in `GOVERNANCE_ENTRY_TYPES`); also emit `Hammond→Clare:` (and `Hammond→Ann:` if the collision is a lesson) on `cross_agent`. If there is no such collision, do not invent one.

`triage` / `intake` stay Life-CN + intake only. They may *glance* Other hubs in Session Triage’s “domains / cross-domain tension” bullets; they must not dump a stale inventory.

Do not add a `hubContext` parameter to `buildHammondAuditContract`. The data is already in `hammondBlocks`. Duplicating it into the contract would tempt a second fetch.

### Digest / heatmaps

**No change** to `hammond-digest.mjs` this pass (`DOMAIN_PATH`, `selectHammondEventEntries`, `selectHammondFitnessEntries`, `summarizeHammondDigest`, `formatCentralNodeModelForPrompt` stay Life-domain only).

If a later spec wants Tasks/Teaching in the persisted 90-day digest, it must add a **second, separate** presence-scan (mirror `selectHammondEventEntries`’s shape) over `tasks-blobs.mjs` / `teaching-blobs.mjs` paths — not widen `DOMAIN_PATH`. That work is not this spec.

### Hub-agent-context reuse

No new loader. Caps stay `TASK_CAP = 12`, `CLASS_CAP = 12`, `LESSON_CAP = 10`, `WINDOW_DAYS = 14`, `safeList()` → `[]`, `Promise.all`. If Step 2 needs extra fields (e.g. overdue vs due), add them inside `formatHubAgentContext` as compact metadata on existing rows — do not add a parallel list function and do not raise caps without a new spec.

---

## Step 3 — Reliability (every new read stays off the 26s path)

### Rule

Any new hub-context read Hammond’s audit needs **must** follow `hub-agent-context.mjs` exactly:

- Direct store/blob reads via `listTasks` / `listClasses` / `listScheduledLessons` (or the existing defaults)
- Wrapped in `safeList()` try/catch → `[]`
- Run in `Promise.all`
- Hard caps (`TASK_CAP` / `CLASS_CAP` / `LESSON_CAP`)

Never have Hammond’s, Clare’s, or Ann’s turn call `knowledge-clementine-chat.mjs`, `lesson-alchemist.mjs`, `alchemy-lab.mjs`, `knowledge-tidy`, `knowledge-podcast-path`, or Tasks Hub `/api/clare`.

### Audit of the live path (verified in source, 2026-09-05)

| Path | What it is | Audit phases? | Timeout |
|---|---|---|---|
| `POST /api/chat` (`createChatStartHandler` in `chat.mjs`) | Enqueues a job, `defaultInvokeChatBackground` → `POST /api/chat-run` | Enters audit only by forwarding the same body | Returns 202 quickly |
| `POST /api/chat-run` (`chat-run.mjs`, `background: true`) | `runStoredChatJob` → `createChatHandler` (the long handler in `chat.mjs`) | **Yes — this is the turn** | 15 min background |
| `GET /api/chat/events` | Poll | No | Short |
| `POST /api/chat/confirm` | Confirm cards | No audit phase | Short |
| Live SSE fallback on `/api/chat` when background kick fails | Existing recovery | Would run the same handler inline | **60s Netlify sync cap** — pre-existing, not introduced here |
| `POST /api/clare` (`clare.mjs`) | Tasks Hub dump/desk / Haiku tool loop | **No** | Not on the chat-run pattern. **Do not use for this work.** |
| `knowledge-clementine-chat`, `knowledge-tidy`, `knowledge-podcast-path`, `lesson-alchemist`, `alchemy-lab` | Separate hub AI | **No** | 26s in `netlify.toml` |

`startAuditSessionFromMessage` / “headless scheduled trigger” comments in `hammond-audit.mjs` and `chat.mjs` are a **caller convention for the same `/api/chat` body**, not a second function. No `/api/hammond-audit` route exists.

**Flag (do not fix in this pass unless one is found during implementation):** if any scheduled job or script invokes `createChatHandler` **without** going through `createChatStartHandler` + `chat-run`, that path is the 26s/60s surface and must move onto `/api/chat` → `/api/chat-run` before more audit context is added to it. A repo search on 2026-09-05 found no such production route.

### Ann / Clare chat routing

Clare and Ann name-triggers in `agent-directory.mjs` already hit `chat.mjs`’s shared router. That is the path `clareBlocks` and `annBlocks` attach to.

- `/api/clare` remains Tasks desk / dump. Do not add `propose_central_node_patch` there.
- `lesson-alchemist` / `alchemy-lab` remain Teaching lesson tools. Do not reuse them as Ann chat.

---

## Step 4 — Verification

### Unit (required)

**Persona** (`tests/unit/persona.test.js`), match existing agent-block tests:

- Clare prompt includes the Cross-Agent read-before-dump instruction and `propose_central_node_patch` / `cross_agent`.
- Clare prompt does not include `hubContext` even if the caller passed one.
- Ann prompt includes the Cross-Agent read-before-respond instruction and `propose_central_node_patch` / `cross_agent` / `Ann→`.
- Ann prompt does not include `hubContext` even if the caller passed one.
- Hammond prompt includes the Clare-relay **and** Ann-relay instruction (`Hammond→Clare` and `Hammond→Ann`).
- Brisket (or any non-Clare) prompt does not include `clareBlocks` prose.
- Non-Ann prompts do not include `annBlocks` prose.
- Clementine prompt (if built with `slug: 'clementine'`) does not gain a Knowledge coordination block from this work.

**Hub-agent-context** (`tests/unit/hub-agent-context.test.js`): keep existing fail-open / cap / open-vs-done tests. If `formatHubAgentContext` grows overdue metadata, add one test; do not rewrite the file’s contract.

**Audit contracts** (`tests/unit/hammond-audit.test.js` + the client mirror if it has its own file; today the client file is a copy):

- `stale_drift` contract mentions Tasks / Teaching / Other hubs.
- `open_loops` contract mentions open Tasks / upcoming lessons.
- `lock` contract mentions `Cross-Domain Tension` and `Hammond→Clare` / `Hammond→Ann`.
- Triage contract still forbids a stale/open-loops dump.

**Restricted Clare / Ann patch:**

- Clare + `{ section: 'cross_agent', op: 'append_line', text: 'Clare→Hammond: …' }` accepted / auto.
- Clare + `{ section: 'constraints', op: 'append_line' }` rejected.
- Clare + `{ section: 'cross_agent', op: 'replace_section' }` rejected.
- Clare + a `Hammond→Clare:` sender line rejected (wrong sender).
- Ann + `{ section: 'cross_agent', op: 'append_line', text: 'Ann→Hammond: …' }` accepted / auto.
- Ann + `{ section: 'constraints', op: 'append_line' }` rejected.
- Ann + `{ section: 'cross_agent', op: 'replace_section' }` rejected.
- Ann + a `Clare→Hammond:` or `Hammond→Ann:` sender line rejected (wrong sender).
- Hammond unrestricted patches unchanged.

**`CROSS_AGENT_AGENT_NAMES`:** Clare is a valid name. Clementine is not. Existing Vera/Penelope format tests still pass.

**Digest regression:** `tests/unit/hammond-digest.test.js` `DOMAIN_PATH matches only the 5 recognised Life Hub domains` still passes; add an explicit `data/tasks/...` / teaching path non-match if not already implied.

### Manual (required after code)

Trigger a Central Node audit (`TRIGGER_PATTERNS`: “Central Node audit”, “CN audit”, “weekly review”, “goal audit”) with a couple of open tasks and an upcoming class in the umbrella stores.

Confirm:

1. `stale_drift` / `open_loops` mention those rows (or honestly say the Other hubs block was empty — do not fail the test on empty stores).
2. A `Clare→Hammond` / `Hammond→Clare` and/or `Ann→Hammond` / `Hammond→Ann` Cross-Agent line appears when a collision is warranted; no invented collision.
3. Network tab: `POST /api/chat` → **202** → polling `GET /api/chat/events`. Not a single long synchronous `/api/chat` 200 SSE, and not `/api/clare` / `lesson-alchemist` / `knowledge-clementine-chat`.
4. Turn completes without a 26s or 60s cut-off.

---

## Files (expected)

- `docs/superpowers/specs/2026-09-05-hammond-whole-hub-coordination-design.md` — this file  
- `netlify/functions/_shared/persona.mjs` — `clareBlocks` + `annBlocks`; one `hammondBlocks` instruction covering both  
- `tests/unit/persona.test.js` — Clare and Ann assembly tests above  
- `config/hammond-protocol.md` — drop “never address Clare/Ann”; Clare and Ann situational relay  
- `central-node.md` — Agent Directory bullets for Clare and Ann (this repo’s seed / `included_files` copy). If live CN in `life-hub-data` has drifted, update that copy in a follow-up commit there — do not block this pass on the data repo.  
- `capabilities/publish/cn-patch.json` — add `clare` and `ann`  
- `capabilities/allowlists/clare.json` — write `central-node.md`  
- `capabilities/allowlists/ann.json` — write `central-node.md`  
- `netlify/functions/_shared/capabilities/registry.mjs` — register patch schema for Clare and Ann without widening `needsHammondTools`  
- `netlify/functions/_shared/hammond-tools.mjs` — export `assertAgentMayApplyCentralNodePatch(slug, patch)` (Clare: `cross_agent` + `append_line` + `Clare→` sender only; Ann: same with `Ann→`; Hammond: unchanged) and call it from the existing patch-apply site so the rule cannot drift from the schema.  
- `apps/life/js/core/validate.js` — `CROSS_AGENT_AGENT_NAMES` += `Clare` and `Ann` (not Clementine)  
- `netlify/functions/_shared/hammond-audit.mjs` — `stale_drift` / `open_loops` / `lock` contract prose  
- `apps/life/js/app/hammond-audit.js` — same prose, stay aligned  
- `tests/unit/hammond-audit.test.js` — contract assertions  
- `tests/unit/hub-agent-context.test.js` — only if formatter metadata changes  
- `tests/unit/hammond-tools.test.js` — Clare and Ann restricted-patch tests (mirror each other)

**Do not expect changes to:** `hammond-digest.mjs`, `chat.mjs` `needsHammondTools` / `hubContextPromise` gating, `netlify.toml` timeouts, `knowledge-clementine-chat.mjs`, `lesson-alchemist.mjs`, `clare.mjs` (`/api/clare`), `chat-run.mjs` / `chat-job-run.mjs` (already the correct path).

---

## Success

- Clare, on an umbrella `/api/chat` turn, reads `Hammond→Clare` before a dump and can persist `Clare→Hammond:` (or `Clare→[Agent]:`) on Cross-Agent without a new endpoint.
- Ann, on an umbrella `/api/chat` turn, can persist `Ann→[Agent]:` on Cross-Agent the same way Clare can.
- Hammond’s `stale_drift` and `open_loops` phases treat open Tasks and upcoming Teaching lessons as first-class, from the existing Other hubs snapshot.
- A task-load vs Life-constraint collision can produce a `Cross-Domain Tension` Governance Log entry and a `Hammond→Clare` line; a lesson/load collision can produce `Hammond→Ann`.
- Knowledge / Clementine is absent from directory, persona, digest, and audit contracts.
- `DOMAIN_PATH` still matches only the five Life domains.
- `needsHammondTools` is still `slug === 'hammond'`; Hammond’s turn has no new synchronous fetch.
- Network for the audit is `/api/chat` 202 + `/api/chat/events`, never a 26s-capped hub AI function.

---

## Follow-ups (later, not this build)

- Clementine / Knowledge umbrella snapshot — only after a dedicated spec, and only via a `hub-agent-context`-style direct store read, never via `knowledge-clementine-chat`.
- Optional second presence-scan for a Tasks/Teaching strip on the CN tab (still not a `DOMAIN_PATH` widen).
- Teaching `/api/clare`-equivalent or Tasks `/api/clare` growing CN writes — only after that loop is on `/api/chat` → `/api/chat-run`.
- Vera/Penelope → Clare hops; Mind strip filters.
- Standing “post or record nothing” duty toward Clare on every Weekly Review — only if situational writes prove too quiet.
- `coordinate_request_cn_write` actually applying auto-risk loans to `central-node.md` (pre-existing gap; not this spec’s mailbox).
