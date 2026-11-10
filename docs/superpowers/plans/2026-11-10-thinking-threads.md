# Thinking threads: implementation plan

> **For agentic workers:** run this plan as 3 large subagent chunks plus a finish step done by the lead session. This replaces per-task TDD loops and per-task reviewers, at Adam's standing instruction (token-saving builds). Agents write code and tests but **do not commit**; the lead commits each phase. Run only the tests you wrote, plus the existing tests for any file you touch, using `node --import ./scripts/test-network-guard.mjs --test <files>`. **Never** run the full suite or grove: `pre-pr-check` runs once at the end.

**Goal:** One thread layer that links the eight Tasks thinking tools and the eight Knowledge protocols, through triage, check-ins at natural points, detours that return, and protocols run inside Tasks.

**Spec:** `docs/superpowers/specs/2026-11-10-thinking-threads-design.md`. Read it in full before starting a chunk.

**Architecture:**
- A pure-data map (`packages/thinking-map`).
- An encrypted thread store and API (`/api/thinking-threads`).
- A Haiku guide module for triage and check-ins.
- Per-tool brief → frame and result → packet adapters.
- A `detour` flag on engine sessions.
- Tasks UI pieces: front door, thread view, strip, cards.
- A protocol screen shared between Knowledge and Tasks.

**Tech:** Node ESM `.mjs` functions on Netlify, TypeScript views in `apps/tasks` and `apps/knowledge`, `node:test`, the encrypted R2 cognitive store, and the Anthropic client (`netlify/functions/_shared/anthropic-client.mjs`).

**Size:** a bit smaller than the original Problem Solver build. That build also designed a whole engine and its renderers. This one adds a thin layer, adapters and about seven small views, over engines that already exist. No A$ figure is given.

**Branch / worktree:** `claude/thinking-threads-spec` at `/Users/adamrussell/Projects/life-hub-thinking-threads`. Ships as one PR, with the phases as commits.

## Rules for every chunk
- **Public repo.** Fixtures, tests and comments use invented situations only, for example "choosing between two community garden plots" or "a flatmate who never does the dishes". Code names roles, never people.
- **Never quote Question Book text.** Its question texts are read at run time from the private repo. Refer to questions by id only.
- **Follow existing patterns:**
  - handlers are wrapped in `createSessionOriginHandler`, with `withCors` and `okResponse`
  - each function file has `export const config = { path: '/api/...' }`
  - storage goes through `defaultGetCognitiveStore` with a prefix, and owner from `owner(env)` (see `netlify/functions/problem-solver.mjs` and `_shared/problem-solver/store.mjs`)
- **IDs stay as they are.** Store prefixes, catalogue ids (`rb_`, `ch_`, `cb_`, `cm_`, `qb_`) and package folder names do not change.
- **Tool ids** (the store prefix without `/v1`): `problem-solver`, `decision-book`, `get-things-done`, `rules-book`, `change-book`, `collaboration-book`, `communication-book`, `question-book`. Protocols use `knowledge-protocols`.

## Shared contracts (all chunks code to these)

### `packages/thinking-map/index.mjs`
```js
export const SIGNALS; // frozen: ['choice','person','group','values','stuck','change_over_time','message','getting_started','argument','future','ethics','self_knowledge']
export const TOOLS;   // frozen [{ id: 'problem-solver', name: 'Problem Solver', route: '#/problem-solver' }, ... 8 tools, display names below]
export const PROTOCOLS; // frozen [{ id: 'fates', name: 'The Three Fates' }, ... 8]
/** Option: { id, tool, kind: 'tool'|'model'|'chapter'|'protocol', title, when, signals: string[], links: string[] } */
export function allOptions();                 // every Option, built once and frozen
export function getOption(id);                // Option | null
export function shortlist({ signals = [], fromOptionId = null, exclude = [], limit = 8 }); // Option[], ranked by signal overlap + link from fromOptionId; never includes excluded ids
export function signalsFromText(text);        // keyword rules → signal[] (fallback when the guide fails)
export function mapProblems();                // string[] of integrity problems ([] when sound)
```
- **Option ids:**
  - tool level: `tool:<toolId>`
  - protocols: `protocol:<protocolId>`
  - catalogue models and Thought Starter chapters: their existing ids (`dm_record`, `rb_pareto`, `qb_career`…)
  - Problem Solver process models: `ps:<modelId>`
- **Display names** (from Phase 0):
  - Problem Solver
  - Decision Maker
  - Gear Shifter
  - Wayfinder (`rules-book`)
  - Change Navigator (`change-book`)
  - Team Builder (`collaboration-book`)
  - Conversation Guide (`communication-book`)
  - Thought Starter (`question-book`)

### Thread, Brief, Packet
These follow the spec, sections 1 and 4, exactly. Pure functions live in `netlify/functions/_shared/thinking-threads/thread.mjs`:

```js
export function createThread({ situation, title, homeSession = null, now });
export function addSession(thread, { kind, tool, sessionId, role, from = null, question = null, now });
export function setSessionState(thread, sessionId, state, now);
export function landPacket(thread, sessionId, packet, now);      // state 'returned', packet set, landing null
export function setLanding(thread, sessionId, landing, now);     // 'answer'|'note'|'dismissed'
export function handOver(thread, detourSessionId, now);          // detour → home, old home → handed_on
export function recordRoute(thread, { joint, optionId, reason, outcome, now });
export function patchThread(thread, { title, status, restUntil }, now);
export function isListed(thread);                                // false when one session and no detours
export function wasDeclined(thread, { optionId, fromStepId });   // true if outcome 'not_now' for that option at that step
```

### API `/api/thinking-threads` (`netlify/functions/thinking-threads.mjs`)

**GET**
- `?list=1` → `{ threads }`. Listed threads only: open and resting, newest first.
- `?id=` → `{ thread }`

**POST** body `{ create: { situation, title?, home? } }` or `{ id, revision, action, ... }`. The actions are:
- `add_session`
- `land` (with `{ sessionId }`; the server builds the packet itself by loading that session and calling `packetFrom`)
- `set_landing`
- `hand_over`
- `route`
- `patch`
- `detour` (with `{ fromSessionId, fromStepId, optionId, question }`)
  1. It creates the target session through that tool's service, using `frameFromBrief` and `detour: {...}`.
  2. It adds that session to the thread.
  3. It returns `{ thread, open: { tool, sessionId, route } }`.

  For a protocol option, the session is created through the protocol service, with the intake from `intakeFromBrief`.

**Revision conflict.** The API responds 409 with `{ thread }` (the current one). The client reapplies once.

### Guide `POST /api/thinking-threads/guide`
- **Triage:** `{ triage: { situation, answer? } }` → `{ question }` or `{ start: {optionId, reason}, likely: [optionId], alternative: {optionId, reason}, fallback?: true }`.
- **Check-in:** `{ checkIn: { threadId, joint, sessionId, stepId?, latestStep } }` → `{ verdict: 'carry_on'|'suggest'|'hand_over', optionId?, reason?, why?, fallback?: true }`. `hand_over` is valid only when `sessionId` is a detour session. It means "make this the home tool".
- `joint` is one of `framed`, `step_done`, `before_commit`, `returned`, `resumed`, `recorded`, `asked`. `asked` is the "Where next?" button.
- **Spend:** `GET /api/thinking-threads/guide?spend=1` → `{ month, aud, calls }`.

### Engine hooks
- Engine sessions accept an optional `threadId` and an optional `detour: { threadId, fromSessionId, fromStepId, question }`.
- A detour session skips Review. When its last step (Decide, Act, Agree, Commit or Shift) is recorded:
  - the service calls `landDetour(env, session)`
  - that function loads the thread and lands `packetFrom(tool, session)`
  - the record is **not** written to a Tasks page; the home record gains a "Detours" section instead

## Chunk 1: server logic (Phase 0 + Phase 1 server + Phase 2 server)

One agent (Opus). It owns `packages/thinking-map/**`, `netlify/functions/_shared/thinking-threads/**`, `netlify/functions/_shared/thinking-guide/**`, `netlify/functions/thinking-threads*.mjs`, the engine hook edits, the rename strings, and the related tests.

**Steps**
1. **Phase 0, renames.** Change the display names everywhere a person sees them:
   - nav labels in `apps/tasks/src/shell/shell.ts:130-137`
   - page and section titles in each tool's views
   - record captions and coach prompt self-references (for example "You are the Rules Book coach" becomes "You are Wayfinder's coach")
   - `books.mjs` labels

   Where a string cites the **source book** (for example "Worked with The Rules Book" or "works from The Rules Book"), keep the book title, because it is attribution. Grep `"Rules Book|Change Book|Collaboration Book|Communication Book|Question Book"` across `apps packages netlify` and decide each hit. Update any tests that assert old display strings.
2. **`packages/thinking-map`** to the contract.
   - Build options from:
     - each catalogue (`packages/decision-book`, `rules-book`, `change-book`, `collaboration-book`, `communication-book`, `question-book/catalogue.mjs`)
     - the Problem Solver models
     - Gear Shifter
     - the protocols (`config/knowledge/cognitive/definitions.mjs`)
   - Import `pairsWell` and `seeAlso` as links.
   - Put signals and missing `when` lines in `packages/thinking-map/signals.mjs`, keyed by option id. Every option needs at least one signal.
   - Put the new links in `packages/thinking-map/links.mjs`:
     - **links between the tools that were Books:** at least 3 per tool pair where it makes sense
     - **links from tool steps to protocols**, as listed in spec section 3, with every protocol reachable from 2 or more tools
   - Add `scripts/print-thinking-map-links.mjs`, which prints the new links as a markdown table (from, to, why). Each link entry carries a one-line `why`.
3. **Thread pure functions, store and API** to the contract.
   - Prefix `thinking-threads/v1`.
   - Writes are conditional on `revision`.
4. **Briefs and adapters** in `netlify/functions/_shared/thinking-threads/`:
   - `briefs.mjs`: `frameFromBrief(tool, brief)` for each engine tool. Find the frame field names in each tool's `model.mjs` and in `packages/problem-solver/books.mjs`. Draft the fields from the situation, the question and the digest, as plain strings; no AI.
   - `briefs.mjs` also: `questionsFromBrief(brief, optionId)`, which returns `{ chapterId, questionIds }` (2–4 ids) for Thought Starter, and `intakeFromBrief(protocolId, brief)`, which uses the field list in `netlify/functions/_shared/thinking-protocol-recommend.mjs` and `docs/cognitive-protocol-api.md`.
   - `adapters.mjs`: `packetFrom(tool, sessionOrRecord)` for all eight tools plus `knowledge-protocols`, as described in spec section 4.
5. **Engine hooks.**
   - Add `threadId` and `detour` to session creation in `_shared/problem-solver` (start-session and the service create path, for all kinds).
   - Skip Review for detour sessions in each book's `model.mjs`, or in the shared step builder in `packages/problem-solver/steps.mjs` if it's centralised there.
   - Call `landDetour` on recording the last step, and skip the Tasks-page write for detours.
   - Extend `?linked=` support to the four book stores and Question Book, so `link-chips.ts` can query them.
   - Starting any tool without `threadId` creates a quiet thread (`createThread` with `homeSession`), and saves `threadId` on the session.
6. **Guide** in `netlify/functions/_shared/thinking-guide/`:
   - **`prompt.mjs`:** builds the triage and check-in prompts from the shortlist (id, title, when, signals), the digest, the latest step and the declined routes. It asks for JSON only.
   - **`guide.mjs`:**
     - `triage()` and `checkIn()` call model `claude-haiku-5-5` through the existing Anthropic client, with a 12s timeout.
     - Validate the output: if the `optionId` is not in the shortlist, or `wasDeclined`, treat it as `carry_on`.
     - Add `fallback` behaviour (`signalsFromText` + `shortlist`, top 3, no reasons).
     - After each `returned` landing, rewrite the digest in the same call: the facts, choices, restsOn and openQuestions arrays, under about 150 words.
   - **`spend.mjs`:**
     - Log token usage per call to the store at `thinking-threads/v1/{owner}/_ops/guide-spend-YYYY-MM.json`.
     - Calculate AUD from per-token prices in `pricing.mjs`. **Load the `claude-api` skill to get the real Haiku 5.5 prices. Do not guess.** Use a USD→AUD constant with a dated comment.
   - Serve it at `netlify/functions/thinking-threads-guide.mjs` (`/api/thinking-threads/guide`).
7. **Tests**, in `tests/unit/thinking-*.test.js`:
   - `mapProblems()` returns `[]`, and the integrity cases from spec section 6 hold
   - `shortlist` ranking and exclusion
   - the thread functions, including `handOver`, `wasDeclined` and `isListed`
   - store revision conflict (409)
   - `frameFromBrief` for each tool
   - `packetFrom` for each tool, using invented records
   - the guide with a mocked model: valid output, invalid JSON, an option outside the shortlist, a declined option, timeout → fallback
   - detour landing end to end, with an in-memory store, as in the existing problem-solver tests

**Done when** all the new and touched tests pass and `node scripts/print-thinking-map-links.mjs` prints the table. The lead then commits: "Phase 0: rename…", "Phase 1: map, threads, detours (server)", "Phase 2: guide (server)".

## Chunk 2: Tasks UI (Phase 1 UI + Phase 2 UI)

One agent (Sonnet). It starts after chunk 1 lands. It owns `apps/tasks/src/views/thinking/**`, `apps/tasks/src/views/problem-solver/link-chips.ts`, the `apps/tasks/src/app/main.ts` routes, the `shell.ts` nav, and small hook edits in each tool's session view.

**New views** in `apps/tasks/src/views/thinking/`:
- **`api.ts`:** typed fetch wrappers for the contracts above. Handle a 409 by reapplying once.
- **`front-door.ts`** (route `#/think`, nav item "Think it through", first in the thinking group):
  - lists listed threads (open first, then resting with their date)
  - a situation box
  - the triage flow: one question at most, then a suggestion card with start / "likely, will check as we go" / or-instead, each with its reason
  - starting creates the thread and the session, then routes to the tool
  - the spend line at the foot
- **`thread-view.ts`** (route `#/think/<id>`):
  - title (editable)
  - digest
  - a timeline of session cards, with detours indented under their home step, showing state and the packet answer
  - status controls: close, rest until a date
  - the `recorded` end card
- **`thread-strip.ts`:** `mountThreadStrip(el, { threadId, sessionId })` shows the title, a check-in tick, **Where next?**, **Back to thread** and a **Detour to…** menu (options from the shortlist for this step, with no AI call). It is hidden unless the thread `isListed`.
- **`checkin-card.ts`:** `fireJoint({ threadId, sessionId, joint, stepId, latestStep })` calls the guide.
  - A `suggest` result shows one card with **Detour** and **Not now**, plus a folded "why".
  - **Not now** records the route outcome.
  - A protocol option shows the mode, time and `Run (≈ A$x)` from chunk 3's `protocolCost(protocolId, mode)`.
  - A `hand_over` verdict shows **Make this the home tool** / **Not now**. Accepting calls the `hand_over` action.
  - Errors stay silent, except after **Where next?**, where they show "Couldn't check, try again".
- **`landing-block.ts`:** in the home step, "Came back from {tool}", showing the answer, detail and open questions, with three buttons: **Use as this step's answer** (writes into the step through the tool's existing step-edit action), **Add to notes**, **Not useful**.
- **`question-detour.ts`:** shows Thought Starter's chosen questions, loading their text the way the Question Book view does. You answer them, tick the lines to send back, and **Send back**.

**Hooks in each tool's session view** (Problem Solver, Decision Maker, Gear Shifter and the four book views):
- mount the strip
- call `fireJoint` at `framed`, `step_done`, `before_commit` and `recorded`
- call `resumed` when a thread is opened after 3 or more days, or once `restUntil` has passed
- show `landing-block` on steps that have returned detours
- show a "waiting on detour" line for open ones

**Other**
- Extend `link-chips.ts` to all eight tools, plus a thread chip.
- Use the Tasks design kit tokens and the existing card styles. Check against `docs/CURSOR-UI-FAILURES.md`, which covers long text overflow, 390px layout, and dark mode tokens.
- **Tests:** unit tests for any pure helpers you add (ordering the timeline, the resume rule).

**Done when** the Tasks build (`npm run build -w apps/tasks`, or whatever its package script is) passes and the new tests pass. The lead commits: "Phase 1–2: Tasks thread UI".

## Chunk 3: protocols in Tasks (Phase 3)

One agent (Sonnet). It can run **in parallel with chunk 2**, because its files don't overlap. It owns `packages/protocol-view/**`, `apps/knowledge/src/protocols/**`, `netlify/functions/knowledge-protocols*.mjs`, `netlify/functions/_shared/cognitive-*.mjs` (only the small additions listed below), `config/knowledge/cognitive/cost-estimates.json`, and `apps/tasks/src/views/thinking/protocol-detour.ts`.

**Steps**
1. **Move the protocol screen** out of `apps/knowledge/src/protocols/view.ts` (and what it imports) into `packages/protocol-view/`. Export `mountProtocolSession(el, { sessionId, onDone })` and `mountProtocolIntake(el, { protocolId, mode, intake, origin, onStarted })`. Knowledge re-imports them, and its behaviour must stay the same.
2. **Origin.** Add an optional `origin: { threadId, sessionId, stepId }` and an optional `userContext` thread digest to session create, in `knowledge-protocols.mjs` and `cognitive-controller.mjs` `createSession`. Saved, and returned in the list rows.
3. **On completion:** if `origin` is set, call `landDetour` from chunk 1 with tool `knowledge-protocols`.
4. **Knowledge Past runs** shows a "From thread: {title}" tag linking to `/tasks#/think/<threadId>`. Use the umbrella's cross-hub link pattern; search for how Food links into Travel.
5. **Cost data.**
   - Check whether protocol runs log token usage (`_ops`, `cognitive-store.mjs`).
   - If they don't, add per-run usage logging: input and output tokens per model call, summed on the session as `usage`.
   - Export `protocolCost(protocolId, mode)` from `packages/protocol-view/cost.mjs`. It returns `{ aud, runs }`, the median of logged runs for that protocol and mode, or `null` when there are fewer than 3 runs.
   - Prices come from the same `pricing.mjs` as chunk 1.
   - `config/knowledge/cognitive/cost-estimates.json` holds only numbers, if you seed it from existing logs.
6. **`protocol-detour.ts`.**
   - Mount the intake pre-filled from the `detour` API response.
   - Then mount the session in a panel inside the thread view, with a "Running, you can leave this page" note.
   - Add **Witness at close**: when the thread's `recorded` end card offers it, the intake is drafted from the thread's route log and digest.
7. **Tests:**
   - `origin` round-trips
   - completion with `origin` lands a packet (mocked `landDetour`)
   - `protocolCost` median and the null case
   - the Knowledge view still mounts. Reuse the existing protocol view tests where there are any.

**Done when** the new and touched tests pass and both the Knowledge and Tasks builds pass. The lead commits: "Phase 3: protocols in Tasks".

## Finish (lead session)
1. Run `node scripts/print-thinking-map-links.mjs`. Publish the table as an Artifact so Adam can review the new links.
2. Check the diff for stray files and full-suite triggers. This build touches `apps/tasks`, so the full Tasks suite is expected. Then run `npm run pre-pr-check` once and fix what fails.
3. Browser walk, desktop and 390px, on the deploy preview:
   - front door → triage → tool → **Detour to…** → return → landing
   - a protocol detour card shows a cost or "no cost data yet"
   - close a thread
4. Open one ready PR with the 4 phase commits, run the privacy guard on the title and body, and turn on auto-merge.
