# Thinking threads: connecting the Tasks thinking tools and the Knowledge protocols

Date: 10 November 2026
Status: design approved; spec for review

## Problem

Tasks has eight thinking tools: Problem Solver, Decision Maker, Gear Shifter, and the five tools renamed from Books (Wayfinder, Change Navigator, Team Builder, Conversation Guide and Thought Starter). Knowledge has eight thinking protocols (Fates, Horizon, Refinery, Cartographers, Mirror, Consilium, Witness, Tribunal). Each one works on its own:

- **No handoff between tools.** The only escalation stays inside one tool: lightning → full, quick → decision, start → shift.
- **69 links to other tools exist but can't be used.** The Books' catalogues hold 69 `pairsWell` links into other tools. The coach can only mention them, and `coach.mjs` rejects any `next_tool` outside the current book.
- **The Books don't link to each other**, and Thought Starter has no `pairsWell` field at all.
- **Page chips are incomplete.** They cover only Problem Solver, Decision Maker and Gear Shifter.
- **Tasks and the protocols don't connect in either direction.** The Problem Solver spec planned a protocol card (`2026-10-16-problem-solver-design.md`, lines 62 and 196), but it was deferred and never built.

No single route suits every situation. The aim is a light layer that suggests the best path at the start, checks in as the work moves, and carries what has been learnt between tools and protocols.

## Decisions (from the brainstorm)

1. **One front door, and direct starts still work.** A "Think it through" page triages a described situation. Every tool stays in the nav. A direct start still makes a thread.
2. **The guide suggests and Adam chooses.** It never switches tool or starts a run by itself.
3. **Check-ins happen at natural points, and stay quiet unless there is a reason to change course.**
4. **Moves between tools are detours that return.** The home tool stays home. Handing over to another tool is a deliberate choice, offered by a check-in.
5. **Protocols run inside the Tasks thread** as detours, with the A$ cost shown before they start. They still appear in Knowledge's Past runs.
6. **Approach A: a thread layer on top of the tools.** There is no merged engine. The tools keep their identity, sessions and records.

## Words used here

- **Thread:** one situation moving through tools and protocols.
- **Home:** the session the thread mainly works in.
- **Detour:** a focused session or run sent from a home step to answer one question.
- **Brief:** what goes out to a detour.
- **Packet:** what comes back from a detour.
- **Guide:** the cheap-model router that does triage and check-ins.
- **Map:** the shared data registry of options, signals and links.
- **Joint:** a natural point where a check-in can happen.

## 1. The thread

Stored in the encrypted cognitive store under the prefix `thinking-threads/v1/{owner}/{id}.json`, through `defaultGetCognitiveStore`, using the same owner as the tools.

```js
{
  id, revision, createdAt, updatedAt,
  title,                // drafted from the situation, editable
  situation,            // Adam's words from the front door, or drawn from a tool's frame
  status,               // 'open' | 'resting' | 'closed'
  restUntil,            // ISO date, when status is 'resting'
  digest: {             // "what we know"; the guide rewrites it; under about 150 words in all
    facts: [], choices: [], restsOn: [], openQuestions: []
  },
  sessions: [{
    kind,               // 'tool' | 'protocol'
    tool,               // store prefix id, e.g. 'decision-book', 'rules-book', 'knowledge-protocols'
    sessionId,
    role,               // 'home' | 'detour' | 'handed_on'
    from: { sessionId, stepId } | null,   // the home step a detour left from
    question,           // the one question this detour answers
    state,              // 'open' | 'running' | 'returned' | 'failed' | 'removed'
    packet | null,
    landing             // 'answer' | 'note' | 'dismissed' | null
  }],
  route: [{             // every suggestion, whether taken or not
    at, joint, optionId, reason, outcome   // outcome: 'taken' | 'not_now' | 'shown'
  }],
  links: [{ kind: 'page' | 'project', id }],
  lastCheckAt
}
```

- Every tool session and protocol session gets an optional `threadId`.
- **Starting from a tool in the nav** creates a thread quietly. A thread holding only one session, with no detours, is hidden from the thread lists.
- **Writes are conditional on `revision`**, so two tabs can't overwrite each other.
- **Privacy.** The situation, digest and packets are personal. They live only in the encrypted store. Tests, fixtures and docs use invented situations.

**Server.** A new `netlify/functions/thinking-threads.mjs` at `/api/thinking-threads` supports:
- list (open and resting threads)
- get
- create
- patch: title, status, restUntil
- add a session
- record a route outcome
- land a packet

**Interface (apps/tasks)**
- **Front door page.** Lists open and resting threads above the situation box.
- **Thread view.** A timeline: the situation, then the digest, then a card per session in order, with detours indented under their home step.
- **Thread strip.** A thin bar at the top of any tool session that belongs to a thread with more than one session. It shows the title, the check-in tick, **Where next?** and **Back to thread**.
- **Page chips.** `link-chips.ts` is extended to all eight tools plus a thread chip.

## 2. Triage and check-ins (the guide)

**Model.** `claude-haiku-5-5`, called through the existing Anthropic client. The guide is a new shared module, `netlify/functions/_shared/thinking-guide/`, served at `/api/thinking-threads/guide`.

### Triage
1. **Input:** the situation text.
2. **Signals:** the guide maps the situation to signals, then the map builds a shortlist of about 8 options.
3. **One question if it's thin.** If the situation is too thin to judge, the guide may ask a single clarifying question, at most once per triage.
4. **Output:** `{ start: {optionId, reason}, likely: [optionId ≤ 2], alternative: {optionId, reason} }`.
5. **Display.** "Likely after that" is labelled "likely, will check as we go".
6. **Starting.** Tapping an option creates the session, with its frame drafted from the situation (see section 4) for Adam to edit.

### Joints (natural points)

| Joint | When |
|---|---|
| `framed` | a tool's frame is completed |
| `step_done` | an Explore model or Problem Solver step is finished |
| `before_commit` | just before Decide, Act, Agree or Commit |
| `returned` | a packet has landed |
| `resumed` | Adam opens a thread after 3 or more days away, or when `restUntil` arrives |
| `recorded` | the home tool writes its record; this is the end of the session |

**At each joint** the guide gets the digest, the latest step and the shortlist. It returns `{ verdict: 'carry_on' | 'suggest', optionId?, reason?, why? }`.

The signals that point to `suggest`:
- a step that is really a choice
- a person or relationship at the centre of things
- a values clash
- going in circles
- drift from the situation
- answers getting thin

**What appears**
- **`carry_on`:** only the tick on the strip.
- **`suggest`:** one card with **Detour** and **Not now**, plus a folded "why".
- **`recorded`:** always shows a card offering close the thread, rest it with a date, or a next tool.

**Rules**
- **No repeats.** After **Not now**, the same option is not offered again for that step. Every outcome goes into `route`, and the guide reads `route`.
- **One card at a time.** Only one suggestion card is ever on screen.
- **On demand.** **Where next?** runs a check-in whenever Adam asks.

## 3. The map

The map is a new pure-data package, `packages/thinking-map/`. It has no AI.

**Options.** Every tool, every model in their catalogues (Problem Solver process models, Decision Maker, `rb_`, `ch_`, `cb_`, `cm_`, Gear Shifter, the Thought Starter chapters) and the 8 protocols. Each option has:
- `id`
- `tool`
- `title`
- `when` (a "use this when" line; reuse the existing line where there is one, write it where there isn't)
- `signals[]`
- `links[]`

**Signals.** A fixed list of about 12:

`choice`, `person`, `group`, `values`, `stuck`, `change_over_time`, `message`, `getting_started`, `argument`, `future`, `ethics`, `self_knowledge`

**Links**
- **Existing links** are imported automatically from every catalogue's `pairsWell`, including the 69 that cross tools.
- **New links** are written as data:
  - **Between the tools that were Books.** For example, Team Builder's conflict models ↔ Conversation Guide's Nonviolent Communication, and Change Navigator ↔ Wayfinder's habit rules.
  - **From tool steps to protocols:**
    - Decision Maker's values compass → Mirror
    - a choice resting on one argument → Refinery
    - a Problem Solver frame stuck on its second rewrite → Tribunal
    - Change Navigator → Horizon
    - an ethical choice → Consilium
    - a step that needs reading → Cartographers
    - an open "what could we even do" step → Fates
    - a closed thread → Witness
- **Review gate.** The new links are drafted, then shown to Adam as a readable table for review before PR 2 starts.

**Shortlist.** Built from the signals plus the current step's links, about 8 options. The guide may only choose from the shortlist. Anything else is dropped.

**Coach boundary.** Each tool's coach keeps suggesting within its own tool, and the `coach.mjs` boundary stays. All moves between tools go through the guide as detours.

## 4. Detours and returns

### Brief (what goes out)

```js
{ threadId, situation, digest, from: { sessionId, stepId, stepTitle, workSoFar }, question }
```

The guide writes `question`, for example "Choose between A, B and C for step 3".

**Brief → frame.** Each tool gets a function that drafts its frame from the brief:
- **Problem Solver:** goal, whatIsTrue, whatCanBeDone
- **Decision Maker:** decision, compass, known
- **The Book-engine tools (Wayfinder, Change Navigator, Team Builder, Conversation Guide):** their three frame questions in `packages/problem-solver/books.mjs`
- **Gear Shifter:** its start frame
- **Thought Starter:** a chapter plus 2 to 4 question ids
- **Protocols:** intake fields, using the deep-link field mapping in `thinking-protocol-recommend.mjs`

### Focused detour mode
- **Engine tools:** a session with `detour: true` runs frame → the suggested model → the tool's last step → return. Review is skipped; it belongs to home. Adam can work more models before finishing.
- **Thought Starter:** shows the chosen questions. Adam answers, then ticks the lines to send back.

### Packet (what comes back, the same shape for every tool)

```js
{ answer /* one line */, detail /* short */, restsOn: [], openQuestions: [], actions: [] /* suggestions only */, source: { tool, sessionId } }
```

**Adapters:** one per tool, turning its result into a packet.
- **Decision Maker:** choice and basis.
- **Book commit slots:** `result` → answer, `rests_on` → restsOn, `next_action` → actions.
- **Problem Solver:** the step outcome.
- **Thought Starter:** the ticked lines.
- **Protocols:** `keyFinding` → answer, `summary` → detail, `openQuestions`.

### Landing
- The home step shows a "Came back from X" block with three choices: **Use as this step's answer**, **Add to notes**, **Not useful**.
- The digest then updates and the `returned` check-in runs.
- Actions become tasks only at the home tool's commit step, after Adam confirms them.

### Rules
- **One level only.** A detour can't start its own detour.
- **Hand-over.** A detour's check-in may offer **Make this the home tool**. If taken, the old home becomes `handed_on` and its work carries into the digest.
- **Unfinished detours don't block.** They stay `open`. The home step shows "waiting on detour" and Adam can carry on.
- **No extra pages.** Detours write no Tasks-page record of their own. The home record gains a **Detours** section listing each packet.

## 5. Protocols inside Tasks

- **Shared screen.** Move `apps/knowledge/src/protocols/view.ts`, and what it needs, into a shared package, so Knowledge and Tasks mount the same screen. The server stays the same (`/api/knowledge/protocols`), as do the background runner and the voices.
- **Suggestion card.** It adds the mode (for example "Fates: sprint, 3 cycles"), a time estimate, and the cost on the button: **Run (≈ A$x)**. Nothing runs until Adam taps it.
- **Cost figures.** Each protocol and mode's cost comes from measured past runs (`_ops` data or logged usage). Where there isn't enough data, the card says so instead of showing a number.
- **Intake.** Drafted from the brief, and editable.
- **Thread context.** The thread digest is passed as `userContext`, alongside the existing Central Node, archive and web context.
- **Origin.** A new optional field, `origin: { threadId, sessionId, stepId }`, is saved on the protocol session.
- **Long runs.** These carry on in the background. The thread session shows `running`. On completion the packet lands, and the `returned` check-in waits for Adam's next visit.
- **Return.** Protocols never suggest actions. The rule in `shared.md` against voices doing hub handoffs stands, because the adapter does the handoff.
- **Knowledge.** Past runs shows a "From thread: …" tag linking to the Tasks thread. Central Node write-back is unchanged.
- **Witness at close.** When a thread closes, the end card may offer Witness to review how the thinking went across the thread (the route, the detours, and suggestions not taken). It's optional and priced like any other run.
- **Not in this build:** a protocol run started in Knowledge opening a new thread.

## 6. Costs, errors, tests, build order

### Running costs
- **Guide.** Each triage or check-in is one small Haiku call. The real per-call cost is measured in PR 1 before the guide ships. The target is under A$0.01 per check-in.
- **Protocols.** These are unchanged and shown before every run.
- **Spend line.** The front door shows a "guide spend this month" line.

### Errors

| Failure | Behaviour |
|---|---|
| The guide fails or times out at a joint | Nothing appears, and the tool is never blocked. **Where next?** says it couldn't check and offers Retry. |
| Triage fails | A shortlist from the map alone (the top 3 for the detected signals), without reasons. |
| The guide returns an option outside the shortlist | Dropped and logged. Treated as `carry_on`. |
| A detour session is deleted | That thread session becomes `removed`, and the home step stops waiting. |
| A protocol run fails | The thread session becomes `failed`, with Retry. |
| A revision conflict on a thread write | Reload, then reapply the change once. If it fails again, show "updated elsewhere, refresh". |

### Tests (unit, using invented situations)
- **Map integrity:**
  - every link points at a real option
  - every option has `when` and at least one signal
  - every protocol can be reached from at least two tools
  - no tool is left with no links in or out
- **Brief → frame:** one test per tool.
- **Packet adapters:** one test per tool, using invented records.
- **Thread store:** creating, patching, landing a packet, and a revision conflict.
- **Guide:** a mocked model returning a valid answer, invalid JSON, and an option outside the shortlist.
- **Browser walk** at desktop and 390px: front door → tool → detour → return → protocol → close.

This touches `apps/tasks`, so the full Tasks suite runs at `pre-pr-check`.

### Build order
- **PR 0: rename the five Book tools** to Wayfinder, Change Navigator, Team Builder, Conversation Guide and Thought Starter. Only the names on screen change. The ids, prefixes and package folders stay the same.
- **PR 1: map, threads and detours.**
  - measure the guide and protocol costs
  - the `thinking-map` package, plus the table of new links for Adam to review
  - the thread store and API
  - thread view and strip
  - chips for all eight tools
  - the brief → frame functions
  - focused detour mode
  - the packet adapters
  - the Thought Starter detour
  - a manual **Detour to…** menu, so detours work before the guide exists
- **PR 2: the guide.**
  - triage and the front door page
  - joint check-ins
  - **Where next?**
  - route logging
  - the spend line
- **PR 3: protocols.**
  - the shared protocol screen
  - protocol detours with the cost on the button
  - the `origin` field
  - the Past runs tag
  - Witness at close

A build cost estimate in A$, anchored to past builds of similar size, comes with the implementation plan.

## Out of scope
- A merged single engine, or rewriting the copied Book-engine commit and review code.
- The guide switching tools or starting runs without Adam's tap.
- Nested detours.
- Protocol-started threads.
- A daily or background guide run. The guide runs only when Adam acts or opens a thread.
