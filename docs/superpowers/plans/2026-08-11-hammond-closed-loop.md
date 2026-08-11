# Hammond Closed-Loop Governance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Date:** 2026-08-11
**Repo:** `/Users/adamrussell/Documents/Claude/Projects/life-hub` (branch off `main`)
**Deploy rule:** Local commits only. **Never `git push`.** Adam pushes himself.
**Spec:** `docs/superpowers/specs/2026-08-11-hammond-closed-loop-design.md` — read that first; this plan implements it move-by-move and does not repeat its rationale.
**Precedent:** Build discipline follows `docs/superpowers/plans/2026-08-11-chadwick-closed-loop.md` (all 6 phases shipped 2026-08-11, `docs/IMPLEMENTATION_STATUS.md` Phases 21–26).

---

## Context for a fresh session

Life Hub is a private PWA: static client (`index.html`, `js/app/*`, `js/core/*`) + Netlify Functions (`netlify/functions/*.mjs`) + GitHub-as-database. Hammond is the governance/life-coaching agent; his voice and tools live in `netlify/functions/_shared/persona.mjs` (`hammondBlocks`) and `netlify/functions/_shared/hammond-tools.mjs`; his operating rules live in `config/hammond-protocol.md`.

**The diagnosis:** Hammond is an open loop. `netlify/functions/chat.mjs:174` gives every agent a `today − 1 day` digest window (`addCalendarDays(today, -1)`) — deliberately, to protect the Netlify function budget. This Week / This Month headings in `central-node.md` never roll over. The Governance Log write path works but nothing enforces its use and nothing renders it. Central Node's 30-day heatmaps/7-day protein series are computed client-side only, invisible to Hammond even though his chat button sits on that tab. The CN audit has no UI affordance and its phase state lives in a plain closure variable that a reload destroys.

### Key facts already verified (do not re-derive)

| Fact | Value |
|---|---|
| Test baseline | **880 passing** (`npm test`), 0 failing — re-check with `npm test` before Move 1, numbers drift |
| Test runner | `node --test`, no framework, no mocks (pure-function fixtures). `tests/unit/*.test.js`, `tests/integration/*.test.js` |
| Browser tests | `npm run test:browser` (`node --test --test-concurrency=1` over `tests/browser/*.spec.mjs`, Playwright `chromium`) |
| Fixture check | `npm run validate:fixtures` |
| SW cache | `service-worker.js:1`, currently `life-hub-shell-v63` |
| Chat digest window | `netlify/functions/chat.mjs:174` — `const from = addCalendarDays(today, -1);` |
| Prompt builder | `netlify/functions/_shared/persona.mjs` → `buildSystemPrompt({...})`, `hammondBlocks` at line 135 |
| Governance Log module | `js/core/governance-log.js` — `GOVERNANCE_LOG_PATH = 'data/governance/governance-log.md'`, `appendGovernanceEntry`, `recentGovernanceTail`, `emptyGovernanceLog` — **already wired** into `chat.mjs` read (line 341-349) and write (`append_governance_log` tool, line 618-638) and into the prompt (`governanceLogTail` at `persona.mjs:145`). What's missing is *enforcement* (Move 4 write side) and a *UI card* (Move 4 read side) — the plumbing between server and prompt already exists. |
| Central Node full doc | Hammond already receives the complete `central-node.md` in-prompt (`centralNodeFull`, `chat.mjs:335-338`, `persona.mjs:142-144`) — Move 5 adds the *computed heatmap/series* block, not the raw doc (already there). |
| Central Node write helpers | `js/core/central-node-write.js` — `MONTH_INDEX` (line 132), `parseStatusHeadingDateKey` (line 147, Today's Status heading grammar only), `trimCrossAgentSection` (line 101, `MAX_CROSS_AGENT_LINES = 12`), `applyLogToCentralNode` (line 157, specialist-confirm write path only) |
| Central Node patch risk | `js/core/central-node-patch.js:39-52` `classifyCentralNodePatchRisk` — `this_week` + `append_line` = `'auto'` (line 50); `this_month` is **always** `'confirm'` (line 44) regardless of op |
| Audit phase machine (server) | `netlify/functions/_shared/hammond-audit.mjs` — `AUDIT_PHASES`, `PHASE_CONTRACTS`, `isHammondAuditTrigger`, `normalizeAuditSession`, `buildHammondAuditContract`, `nextAuditPhase` |
| Audit phase machine (client) | `js/app/hammond-audit.js` — **byte-identical duplicate** of the above (explicit `// Keep behaviour aligned with netlify/functions/_shared/hammond-audit.mjs` comment at line 1). Any phase-machine change touches **both** files. |
| Audit session ownership | Fully client-driven and stateless server-side. `js/app/chat-controller.js:57` `let auditSession = null;` (plain closure var); `chat.mjs` never inspects or advances it — it just echoes `buildHammondAuditContract(parsed.auditSession)` back into the prompt each turn (`chat.mjs:168-170`). |
| Sterling reference | Exactly one line: `config/hammond-protocol.md:49` — `5. Financial stability (Sterling owns deep finance — redirect; do not coach portfolios)` |
| Clare/Ann references | Live in `central-node.md` (Agent Directory lines 22/24, `Hammond→Ann` line 187, dated Recent Actions 198-208) — **zero** occurrences in `config/hammond-protocol.md`. They are two disjoint files; touching Sterling in the protocol file cannot touch Clare/Ann in `central-node.md`. |
| Path allow-list (server sync) | `netlify/functions/_shared/repo-policy.mjs:4` — `CONFIG_PATHS = new Set(['config/agents.yml', 'config/targets.yml', 'central-node.md'])`. This governs what `repo-files.mjs`'s sync endpoint will ever return to the client. **`data/governance/governance-log.md` is not in it** — until it's added, the client can never fetch the file no matter what `load-live-events.js` does with it. |
| Path allow-list (client parse) | `js/app/load-live-events.js:6-7` — `CENTRAL_NODE_PATH` special-cased in two places: `createValidator` (line 67-89) and `parseFiles` (line 91-123, returns `centralNodeMarkdown`). |
| Home model → render | `js/app/app-controller.js:298-299` (and again 351-352) — `buildHomeModel({...result, date})` then `renderHome(root, model)`, called on **every** refresh regardless of visible section. `result` already carries `centralNodeMarkdown` (from `loadLiveEvents`), so it reaches `buildHomeModel` today even though `js/app/home-model.js:37` doesn't destructure it yet. |
| CN model → render | `js/app/app-controller.js:697-699` `renderCentralNodeSection()` — `buildCentralNodeModel(latestResult)`, called **only** `if (currentSection === 'central-node')`. |
| `buildCentralNodeModel` signature | `js/app/central-node-model.js:36` — `({ events, targetsConfig, centralNodeMarkdown, date })`, `events` is the same `{record}`-shaped array `digest.mjs` already builds server-side. |
| `calculateWorkoutStreak` | `js/core/aggregate.js:58-72` — already correct, just never fed >2 days of data server-side. |
| Storage-injection precedent | `js/app/fitness-logger-controller.js:16` — `storage = globalThis.localStorage` constructor param; persistence delegated to a sibling pure module `js/app/fitness-logger-draft.js` (`saveDraft`/`loadDraft`/`clearDraft`/`resolveDraft`, JSON via `storage.setItem`/`getItem`). `js/app/chat-controller.js`'s `createChatController` factory (line 38) has **no** `storage` param today — Move 7 adds one. |
| Scoped localStorage keys | `js/app/app-controller.js:6-8` — flat `const` strings, `life-hub:` prefix, e.g. `LOGOUT_PENDING_KEY = 'life-hub:logout-pending'`. |
| Service-worker precache | `service-worker.js` `SHELL_FILES` array — `js/core/governance-log.js`, `js/core/central-node-write.js`, `js/core/central-node-patch.js` are **not in it today** (correct: today only server `.mjs` files import them). The moment a client module imports `js/core/governance-log.js`, it crosses from server-only to shared and needs its **own new** precache entry, not just a `CACHE_NAME` bump. |
| `data/**` domain regex | `netlify/functions/_shared/repo-policy.mjs:5` — `EVENT_PATH` only matches `nutrition\|fitness\|body\|mind\|skincare`. Same-shaped regex is what Move 1's digest walk should mirror for the 5 domains it inspects. |

### Hard constraints — read before writing code

1. **Netlify function budget is binding.** `chat.mjs:172-173` carries the explicit comment: a full week of blob reads "routinely ate the Netlify budget before Anthropic produced a reply." Never add an unbounded GitHub blob read to the chat path. Move 1 and Move 5 each add exactly **one** new bounded read (in-window fitness blobs; 30-day event window), same order of magnitude as the existing `body-state.mjs` bounded reads (`selectLatestBodyEntries`, `chat.mjs:292-294` + `318-319`).
2. **`netlify.toml` `included_files`** — this plan reads no new static config file at runtime, so no addition needed there.
3. **Service worker precache** — any new client-side `js/` module, or any existing `js/core/*` module newly imported by client code for the first time, must be added to `service-worker.js`'s `SHELL_FILES` and `CACHE_NAME` bumped past `v63`. This repo has broken offline reload twice from missing this step (`docs/IMPLEMENTATION_STATUS.md` Phases 6 and 7). Walk the transitive import graph, don't guess.
4. **No new record schema fields.** Nothing in this plan touches `js/core/validate.js`.
5. **Confirm gate unchanged.** High-risk CN patches still queue Confirm per `classifyCentralNodePatchRisk`. Move 2's mechanical roll-over is **not** a Hammond-authored patch and must never go through `applyCentralNodePatch`/the risk classifier — it's a direct content mutation, same category as the existing `trimCrossAgentSection` mechanical floor.
6. Zero new runtime dependencies.
7. Document each completed move in `docs/IMPLEMENTATION_STATUS.md`, existing style (see Phases 21-26 for the exact format: `## Phase N: <title> — Complete`, verified-on line, bullets, **Deviation:** callouts, closing test-count line).
8. **Two hammond-audit files must stay in sync.** Any phase-contract or state-machine change touches both `netlify/functions/_shared/hammond-audit.mjs` and `js/app/hammond-audit.js`. Change one, then immediately diff the other and port the same edit.

**Ask Adam before:** any change to the Confirm gate itself, deleting/rewriting existing history files, or anything outside this plan's file list.

---

## Phase P1 — Foundation: Move 1 (digest) + Move 2 (rollover)

Independent of each other in code, but natural to build together — both need a synthetic multi-domain fixture tree, and both are prerequisites for P2.

### Move 1 — Longitudinal digest from the tree

**Problem:** `chat.mjs:174` sets `from = addCalendarDays(today, -1)`. `summarizeRecentHistory` (`digest.mjs`) only ever sees today+yesterday. Hammond's own protocol (`config/hammond-protocol.md:69`) claims he's "the one place in the system that reads that full history" — he structurally cannot.

**Build:**
- New file `netlify/functions/_shared/hammond-digest.mjs`, exporting `summarizeHammondDigest({ tree, fitnessRecords, today })`:
  - `tree` is `current.tree` from the `resolveTree()` call `chat.mjs` already makes at line 256 — **no new GitHub call** for the path walk itself.
  - Regex-match `data/**/*.md` tree entries against the 5 domains `repo-policy.mjs:5`'s `EVENT_PATH` already recognises (`nutrition|fitness|body|mind|skincare`), mirroring that pattern rather than inventing a new one — a domain outside those 5 isn't a real Life Hub data path.
  - Compute a 90-day window (`addCalendarDays(today, -89)` through `today`, inclusive both ends). For each domain: dates with ≥1 file, current gap (days since most recent in-window file), longest gap in-window.
  - Fitness alone needs `completed`/`planned`/`skipped` classification to compute a real streak via `calculateWorkoutStreak` (`js/core/aggregate.js:58`), which needs parsed records, not just paths. `fitnessRecords` is a small, already-parsed array the caller builds (see chat.mjs wiring below) — `hammond-digest.mjs` itself does no blob reading, keeping it a pure, easily-tested function like `digest.mjs`'s `summarizeRecentHistory`.
  - Nutrition/skincare/body/mind: presence-by-date from paths alone. No blob reads for these domains, ever, in this move.
  - Output: a short structured text block (see the design doc's Move 1 for the exact example shape — `Logging last 90 days — nutrition: 41/90 days, current gap 2d, longest gap 9d (14–22 Jun).` etc). Keep the per-line format close to `digest.mjs`'s existing template-literal style for consistency.
- In `chat.mjs`, inside the existing `needsHammondTools` branch (the file already has this boolean at line 180):
  - Add a new selector, e.g. `selectHammondFitnessEntries(tree, { from, to })` — put it in `hammond-digest.mjs` alongside the summarizer, following the exact shape of `body-state.mjs:16` `selectLatestBodyEntries` (pure function over `current.tree`, regex-matches `data/fitness/YYYY/MM/YYYY-MM-DD-*.md`, no `limit` cap needed here since 90 days of fitness entries is already small — same order of magnitude as the existing bounded reads).
  - Compute a **separate, wider** manifest window for Hammond only — do **not** widen the existing `manifest`/`dataEntries`/`from` used by `digest.mjs` at lines 257-258 and 322-325, since those still legitimately serve every other agent's thin 2-day digest and widening them would blow the "no unbounded blob read" constraint for every agent, not just Hammond. Something like: `const hammondFrom = needsHammondTools ? addCalendarDays(today, -89) : null;` then a path-only tree filter scoped to `needsHammondTools`.
  - Read only the in-window fitness blobs (bounded, same `Promise.all(entries.map(entry => client.readBlob(entry.sha)))` pattern as the existing body-state reads at lines 318-319), parse each with `parseEventDocument` (already imported, used at line 830 in `parseBodyRecords` — mirror that function's per-entry try/catch-skip-on-failure behaviour for `parseHammondFitnessRecords`).
  - Call `summarizeHammondDigest` and store the result in a new `hammondDigest` variable, included in the `catch` block's reset list (mirror lines 411-438's existing degrade-to-empty-string pattern for every other digest field).
- Add `hammondDigest` as a new `buildSystemPrompt` parameter, injected into `hammondBlocks` (`persona.mjs:135-150`) — a new entry in that array, e.g. right after `centralNodeFull`, before `governanceLogTail`.
- **Guard:** same try/catch discipline as the rest of the block (`chat.mjs:411` already wraps everything in `needsHammondTools` scope) — on failure, `hammondDigest` degrades to `''`, never throws.

**Tests:**
- New `tests/unit/hammond-digest.test.js`, mirroring `tests/unit/digest.test.js`'s conventions exactly: `node:test` + `node:assert/strict`, no mocks, flat `test('sentence', ...)` calls (no `describe`), happy-path → domain-detail → format-edge → empty-input → malformed-input ordering.
  - Multi-domain synthetic tree with gaps, boundary dates (entry exactly 90 days back **included**, 91 days back **excluded**).
  - Fitness completed/planned/skipped classification from parsed records.
  - Empty tree → valid empty-ish output, no crash.
- Persona unit test: `hammondDigest` block appears only for `slug === 'hammond'`, never for other agents (extend the existing persona test file's pattern — grep `tests/unit/persona.test.js` for how `bodyState`/`centralNodeFull` presence is asserted per-slug and add a matching case).

---

### Move 2 — Self-rolling This Week / This Month

**Problem:** `central-node-write.js` only auto-writes Today's Status (`replaceTodaysStatus`). This Week (`## 📅 This Week (16 – 22 June 2026)`) and This Month (`## 📊 This Month (April 2026)`) headings never advance — any `append_line` patch to `this_week` (already `'auto'`-risk, `central-node-patch.js:50`) lands under a stale heading.

**Build:**
- New pure function in `js/core/central-node-write.js`: `rollStaleSections(content, today)`.
  - **This Week** heading grammar is a date *range* (`16 – 22 June 2026`), **This Month** is a bare month (`April 2026`) — these are different grammars from Today's Status's single-date heading that `parseStatusHeadingDateKey` (line 147) already parses. Write two small new regex parsers, reusing the existing `MONTH_INDEX` map (line 132) for month-name lookup in both, but do not try to force-fit `parseStatusHeadingDateKey` onto either — it's shaped for a different heading.
  - This Week: parse the trailing end-date of the range; if `today` is after it, the week has fully elapsed. Replace the heading with the current Mon–Sun (or whatever cadence the existing heading uses — check a handful of historical `central-node.md` This Week headings via `git log -p -- central-node.md` if the week boundary convention isn't obvious from the current heading alone) week range and **clear the body**.
  - This Month: parse the month/year; if `today`'s month/year is later, replace with the current month name/year and **clear the body**.
  - Malformed or missing heading → no-op, return `content` unchanged (never corrupt the file).
  - A stale body describing the wrong period is explicitly worse than an empty one per the design doc — always clear on roll, never try to carry old body text forward.
- **Call site:** the design doc says "before any read that will inform patch generation, and also defensively before any `this_week`/`this_month` write — same place `trimCrossAgentSection` is already invoked." But `trimCrossAgentSection` only runs inside `applyLogToCentralNode` (`central-node-write.js:201`), which fires on **specialist confirm writes only** — it is never on Hammond's own `propose_central_node_patch` path, which calls `applyCentralNodePatch` directly from `chat.mjs:658`. If `rollStaleSections` only ran inside `applyLogToCentralNode`, a Hammond-authored `this_week` append this turn would still land under a stale heading. Call `rollStaleSections` from **both** places:
  - Inside `applyLogToCentralNode` (`central-node-write.js`), right alongside the existing `trimCrossAgentSection(next)` call at line 201, so specialist-triggered writes also get a fresh heading.
  - In `chat.mjs`, right after the Central Node blob is decoded for `needsHammondTools` (around line 335-338, where `centralNodeFull`/`centralNodeMarkdown` are set from `decodedCentralNode`) — run `centralNodeMarkdown = rollStaleSections(centralNodeMarkdown, today)` there, before it's used to build the prompt or as the base for any `applyCentralNodePatch` call. This is a **read-time** roll (in-memory only) unless something actually writes; if nothing writes this turn, the rolled heading is never persisted, which is fine — the next turn (or the next specialist write, or the next Hammond patch) rolls it again idempotently. If Adam finds stale headings persist too long between actual writes, a future move can add an explicit best-effort write-back; out of scope here per the design doc's own "try mechanical roll-over first" framing.
- Bypasses `classifyCentralNodePatchRisk`/`applyCentralNodePatch` entirely — it's a mechanical floor operation on raw markdown, not a Hammond-authored patch (Hard constraint 5).

**Tests:**
- Unit (`tests/unit/central-node-write.test.js`, extend existing file): This Week heading with an elapsed range rolls to the current week and clears body; already-current heading untouched; malformed/missing heading is a no-op; This Month rollover across a year boundary (Dec → Jan).
- Unit: `applyLogToCentralNode` still calls `rollStaleSections` (extend existing tests in the same file with a fixture that has both a stale heading and a specialist write, assert the heading rolled).
- Integration (`tests/integration/*.test.js`, find the existing chat-turn integration test covering Hammond, likely named around `chat-hammond` or similar — grep first): a Hammond turn against a fixture `central-node.md` with a stale This Week heading; assert the prompt-time `centralNodeMarkdown` passed to `buildSystemPrompt` has the rolled heading.

---

## Phase P2 — Memory: Move 4 (Governance Log enforcement + card) + Move 5 (CN model reuse)

Move 4's lock-gate instruction (surfacing the two carried-over Notion items) needs Move 1's 90-day digest present in the same turn to read naturally alongside it, so P2 depends on P1 being merged/committed first.

### Move 4 — Governance Log: enforce the write, build the read

**Problem:** `append_governance_log` exists and works end-to-end already (`hammond-tools.mjs` validates, `chat.mjs:618-638` writes, `governance-log.js` formats/appends/tails, `persona.mjs:145-147` injects the tail into the prompt). Nothing **forces** the `lock` phase to actually call it, and nothing **renders** it — it's write-only from Adam's side today.

**Build, write-side enforcement (client-driven, since the audit session itself is 100% client-owned — see Key Facts table):**
- `chat.mjs`'s `append_governance_log` tool handler (line 618-638) currently returns `JSON.stringify({ ok: true, path: GOVERNANCE_LOG_PATH })` on success but never `send()`s an SSE event — so the client has no visibility into whether the call happened this turn. Add `send({ type: 'governance_log_appended', entryType: dated.entryType })` right after `governanceLogSha = result.sha;` (mirror the existing `send({ type: 'exercise_library_saved', name: entry.name })` pattern at line 502).
- In `js/app/chat-controller.js`'s `send()` function: add a `let sawGovernanceLogAppended = false;` alongside the existing `sawExerciseLibrarySaved`/`sawRecordProposal` flags (lines 220-221), set it `true` in a new `else if (event.type === 'governance_log_appended')` branch (alongside the existing `exercise_library_saved` handling at line 379-384).
- `advanceAuditSession(message)` (line 75-90) currently has no way to know the tool fired. Change its signature to `advanceAuditSession(message, { governanceLogAppended = false } = {})`. Inside, when `phase === 'lock'`: if `!governanceLogAppended`, **do not** call `nextAuditPhase` (which would return `null` and silently end the audit) — instead leave `auditSession` unchanged (still `{ phase: 'lock', ... }`) so the next turn re-sends the `lock` phase contract via `buildHammondAuditContract`. If `governanceLogAppended` is true, proceed as today.
- Update the call site at line 403 (`if (gotUsefulOutput) advanceAuditSession(message);`) to `advanceAuditSession(message, { governanceLogAppended: sawGovernanceLogAppended });`.
- This is genuinely the **first** mechanical (not just prompt-instructed) enforcement of a required-tool-call pattern in this codebase — the `persona.mjs` "never narrate a completed day log after a rejection" language cited in the design doc's own Move 4 write-up is an LLM instruction, not code. Say so plainly in the `IMPLEMENTATION_STATUS.md` entry rather than implying there was prior structural art to extend.
- **One-time carried-over-items prompt**, gated on the log being empty (self-expiring, per the design doc's locked decision): in the `hammondBlocks` array (`persona.mjs:135-150`), add a conditional block: when `governanceLogTail` is empty/absent (`governanceLog === emptyGovernanceLog()` — check this server-side in `chat.mjs` where `governanceLog` is already tracked, pass a boolean `governanceLogIsEmpty` into `buildSystemPrompt`) **and** the current turn is governance-log-eligible (triage identifying cross-domain tension, drift, escalation — i.e., not gated further than "log is empty", since the protocol itself decides when those protocols fire), instruct Hammond to mention once that Notion's log carried two open items forward (drift: "Build a life worth enjoying" — Still Active as of 9 Jul; escalation: August study load, past its 15 Aug checkpoint) and ask Adam how to handle them. Once he calls `append_governance_log` for the first time, `governanceLog` is no longer `emptyGovernanceLog()` and the instruction naturally stops firing — no separate flag or cleanup needed.

**Build, read-side (client + server allow-list):**
- **`netlify/functions/_shared/repo-policy.mjs:4`** — add `GOVERNANCE_LOG_PATH` (imported from `js/core/governance-log.js`) to `CONFIG_PATHS`. Without this, `repo-files.mjs`'s sync endpoint will never return the file to the client no matter what `load-live-events.js` does — this is the single easiest step in this move to silently skip and have the whole read side fail with no error, since `isAllowedRepositoryPath` just filters it out of the manifest.
- **`js/app/load-live-events.js`** — add the same two-place special-case treatment `CENTRAL_NODE_PATH` already gets:
  - `createValidator` (line 67-89): a new `else if (file.path === GOVERNANCE_LOG_PATH)` branch treating it as freeform markdown (no schema), same as the `CENTRAL_NODE_PATH` branch at line 72-73.
  - `parseFiles` (line 91-123): a new branch capturing it into a new returned field, e.g. `governanceLogMarkdown` (mirror `centralNodeMarkdown`, lines 104-105 and the return shape at line 59/122).
  - Import `GOVERNANCE_LOG_PATH` from `js/core/governance-log.js` rather than re-declaring the string.
- **New Central Node tab card** — "Governance Log", `index.html`, inserted between the existing "Long-Term Trends" `chart-card` (ends line 690) and "Cross-Agent Coordination" `metric-card` (starts line 692), same `metric-card` shape as its neighbours: `<article class="metric-card" aria-labelledby="central-node-governance-label"><p class="metric-label" id="central-node-governance-label">Governance Log</p><div data-central-node="governance-log" class="prose-section"></div></article>` — actual per-entry rendering (date/type/status badge/body) happens in JS, not raw `renderInlineMarkdown` of the whole tail, since Move 4 wants structured entry blocks, not one markdown blob (contrast with `render-central-node.js`'s other sections which do use plain `renderInlineMarkdown`).
- New file `js/app/render-governance.js`, exporting `renderGovernance(root, governanceLogMarkdown)`:
  - Reuse `recentGovernanceTail` from `js/core/governance-log.js` to get the tail (same call the server already makes for the prompt), then a new small parser (or a shared one added to `js/core/governance-log.js` and exported, e.g. `parseGovernanceEntries(tail)` returning `[{ dateKey, entryType, status, title, body }]` by splitting on the same `## ` heading pattern `splitGovernanceEntries` already uses internally — expose it, don't duplicate the regex) to turn the tail into entry objects.
  - Render pattern: mirror `render-central-node.js`'s `renderHeatmap` — query the container by `data-central-node="governance-log"`, `container.replaceChildren()`, then build one child block per entry (date/type/status-badge/body), matching the `root.createElement`/`replaceChildren` style used throughout `render-home.js`/`render-central-node.js` rather than innerHTML.
  - Empty log (no entries) → a small empty-state text node, not an error — matches the design doc's "absent file renders an empty-state card, not an error."
- Wire into `js/app/app-controller.js`'s `renderCentralNodeSection()` (line 697-702): call `renderGovernance(root, latestResult.governanceLogMarkdown)` alongside the existing `renderCentralNode(root, buildCentralNodeModel(latestResult))` call.
- **Service worker:** `render-governance.js` is new and imports `js/core/governance-log.js`, which is the **first** time that module crosses from server-only to shared. Add both `js/app/render-governance.js` (alphabetically near the other `render-*.js` entries, service-worker.js around line 44-45) and `js/core/governance-log.js` (check whether a `js/core/*.js` precache cluster already exists in `SHELL_FILES` and add it there) to `SHELL_FILES`, bump `CACHE_NAME` past whatever P1 left it at.

**Tests:**
- Unit (`tests/unit/chat-controller.test.js` or wherever `advanceAuditSession`/`sawExerciseLibrarySaved`-style state is already tested — grep first): lock-phase gate blocks advancement without `governanceLogAppended: true`, allows it with.
- Unit: `js/core/governance-log.js`'s new `parseGovernanceEntries` — multiple entries, status badges present/absent, empty log.
- Unit: `render-governance.js` against fixture log content (reuse the FakeElement/DOM test harness pattern already used for `render-central-node.test.js`/`render-home.test.js` — grep for `classList?.add` fallback pattern from `chat-controller.js:27` to find it).
- Integration: a Hammond turn reaching `lock` phase without the tool call re-sends the `lock` contract on the next turn instead of ending the session (extend whatever integration test already covers `buildHammondAuditContract` round-tripping).
- Persona unit test: the one-time carried-over-items instruction appears only when `governanceLogIsEmpty` is true and slug is `hammond`.
- Browser: extend `tests/browser/central-node.spec.mjs` for the Governance Log card rendering real fixture entries.

---

### Move 5 — Reuse `buildCentralNodeModel` server-side for Hammond

**Problem:** `buildCentralNodeModel` (`js/app/central-node-model.js:36`) computes the 7-day protein series and 30-day logging/exercise/eating heatmaps — client-side only. Hammond's chat button lives on the Central Node tab; he sees none of this.

**Build:**
- `digest.mjs:3-5` already has the precedent comment for exactly this pattern (`buildHomeModel` reused server-side). Do the same for `buildCentralNodeModel`.
- `chat.mjs` needs a 30-day `events` array for Hammond specifically — same shape `summarizeRecentHistory` already builds internally from `files` (array of `{path, content}` decoded from `dataBlobs`). Extend the Hammond-only wider-window fetch introduced in Move 1 (the `hammondFrom`/90-day manifest) — since 30 days ⊂ 90 days, **reuse the same 90-day manifest and blob set already being read for Move 1's digest**, don't fetch a second overlapping window. Parse the 30-day-relevant subset of those files with `parseEventDocument` the same way `digest.mjs:8-16`'s loop does, producing an `events` array scoped to `needsHammondTools`.
  - Note: Move 1 deliberately does **not** blob-read most domains (path presence only) — only fitness gets bounded blob reads. `buildCentralNodeModel`'s heatmaps need actual record content (`aggregateNutrition`, `getLoggingCompleteness`, `workoutCompleted` all read record fields, not just presence). This means Move 5 needs blob reads Move 1 doesn't — specifically the 30-day (not 90-day) window's nutrition/fitness/body/skincare/mind blobs. Bound it to 30 days explicitly (not 90) to keep the added read cost to "same order of magnitude as the existing body-state bounded reads," per Hard constraint 1. Reuse `dataEntries`/`dataBlobs` from the *existing* narrow (yesterday+today) fetch is not enough — this is a genuinely new bounded read, scoped to `needsHammondTools`, 30 days, all 5 domains, blobs read via `Promise.all(entries.map(entry => client.readBlob(entry.sha)))` exactly like the existing `dataBlobs` fetch at line 309, just parameterized to a different date range and gated on `needsHammondTools`.
- Call `buildCentralNodeModel({ events, targetsConfig: TARGETS_CONFIG, centralNodeMarkdown, date: today })` — `centralNodeMarkdown` is already available (line 337).
- Format output as a compact **text** block, not raw arrays: 7-day protein trend direction (compare first-half vs second-half average, or first vs last day — pick whichever `render-central-node.js`'s chart implies visually and describe it in words), 30-day logging completeness rate (`loggingMonth.filter(d => d.complete).length / 30`), 30-day exercise completion rate (`exerciseMonth`), 30-day eating-target adherence rate (`eatingMonth`). New small formatter function, e.g. `formatCentralNodeModelForPrompt(model)` — put it in `js/app/central-node-model.js` itself (client-safe pure function, importable from `chat.mjs` the same way `digest.mjs` imports `buildHomeModel`) or a new sibling file if `central-node-model.js` shouldn't grow a text-formatting responsibility — prefer the sibling file (`netlify/functions/_shared/hammond-cn-summary.mjs` or fold into `hammond-digest.mjs` from Move 1 as a second export) since `central-node-model.js` is otherwise pure numeric/structural aggregation and text formatting is a different responsibility (matches this repo's existing file-per-responsibility convention, e.g. `body-state.mjs` keeps `formatBodyStateForPrompt` separate from `aggregate.js`).
- Add the formatted block to `hammondBlocks` in `persona.mjs`, alongside `hammondDigest` from Move 1.

**Tests:**
- Unit: the new formatter against fixture `buildCentralNodeModel` output — rates render as expected percentages/counts, trend direction correct for rising/falling/flat fixtures.
- Persona unit test: the block appears only for `hammond`.
- Integration: confirm the added 30-day bounded read doesn't fire for non-Hammond agents (assert `client.readBlob` call count for a Chadwick/Brisket turn is unchanged from baseline).

---

## Phase P3 — Surface + persistence: Move 3 (drift ages) + Move 6 (Home line) + Move 7 (audit UI + persisted phase)

Move 3 depends on Move 4's dated Governance Log entries existing. Move 6 depends on Move 3 or Move 4 having something to show. Move 7 is independent — can be built in parallel with the rest of P3.

### Move 3 — Computed drift/open-loop ages

**Problem:** Flags like "MEd Sem 2 decision — 79 days unactioned" are hand-typed strings that never update.

**Build:**
- Open loops are dated Governance Log entries (Move 4's `formatGovernanceEntry`/`appendGovernanceEntry` already store a `dateKey` per entry via the `## {dateKey} — {entryType}` heading format, `js/core/governance-log.js:29`). No new storage format needed — Move 3 is purely a **computation + rendering** move over data Move 4 already persists.
- New pure function, e.g. `js/core/governance-log.js`'s `openGovernanceEntries(markdown, today)` (or alongside `parseGovernanceEntries` from Move 4 if that's where entry-splitting already lives) — returns entries not marked `Status: Resolved`, each annotated with `ageDays = daysBetween(dateKey, today)` (reuse `daysBetween` from `js/core/time.js`, already used elsewhere e.g. `repo-policy.mjs:1`). Malformed/missing `dateKey` on an entry → include it without an age rather than crash or drop it (per the design doc's Move 3 test requirement).
- Where this renders: the Governance Log card itself (Move 4) can show age per entry as part of its per-entry block; the CN Flags short-form mirror (design doc's "CN Flags can carry a short-form mirror") stays exactly that — a short-form **mirror** Hammond writes himself via `propose_central_node_patch`, not a second computed system. Do not build a parallel CN-Flags age-computation path; Flags text is Hammond's own prose, informed by (not generated from) this function when he chooses to reference it.
- Also feed the **oldest unresolved entry** into Move 5/6's summary surfaces: export `oldestOpenGovernanceEntry(markdown, today)` (first item of `openGovernanceEntries` sorted oldest-first) for Move 6's Home line to consume.

**Tests:**
- Unit: age computation from a dated entry across a range of `today` values (same day, 1 day, 79 days, crossing a month/year boundary).
- Unit: malformed/missing `dateKey` degrades to showing the entry without an age, doesn't throw.
- Unit: `oldestOpenGovernanceEntry` picks the correct entry from a fixture with a mix of resolved/unresolved, correctly ignores `Status: Resolved` entries.

---

### Move 6 — Home surface line

**Problem:** Hammond is reachable only via a floating button on the Central Node tab, not the default Home view.

**Build:**
- `js/app/home-model.js:37` `buildHomeModel({ events, targetsConfig, date })` — extend the destructure to accept `centralNodeMarkdown` and `governanceLogMarkdown` (both already flow into the call site today via the `{...result, date}` spread at `app-controller.js:298`/`351`, per the Key Facts table — this is purely a destructure + compute addition, no call-site change needed for those two params to arrive).
- Compute `hammondLine` inside `buildHomeModel`: prefer a "current lock" if one exists — there's no explicit "current lock" storage today (the audit's `lock` phase is a conversational turn, not a persisted field), so in practice this resolves to `oldestOpenGovernanceEntry(governanceLogMarkdown, date)` from Move 3, formatted as e.g. `"Hammond: {title or entryType} — {ageDays}d open."`. If there's nothing open, `hammondLine = null`.
- Add `hammondLine` to `buildHomeModel`'s returned object.
- `js/app/render-home.js`: add a line at the top of `home-dashboard`. In `index.html`, add a new element inside the `section-heading` block (lines 100-110) or immediately above the `week-card` (line 211) — e.g. `<p class="hammond-line" data-value="hammond-line" hidden></p>`. In `renderHome` (`render-home.js:27-89`), add: if `model.hammondLine`, `setText(root, '[data-value="hammond-line"]', model.hammondLine)` and remove `hidden`; else set `hidden` — mirror the exact hide/show-on-empty pattern `render-central-node.js:31-40` already uses for `thisWeek` (`container.setAttribute('hidden', '')` when nothing to show, matching Move 6's own test requirement to "omit cleanly... rather than showing a placeholder").
- `home-model.js` will need to import from `js/core/governance-log.js` for `oldestOpenGovernanceEntry` — this is a **second** new client-side import of that module (Move 4 already added it for `render-governance.js`), so no additional service-worker change needed here as long as Move 4's precache entry lands first (P2 before P3, per phase ordering).

**Tests:**
- Unit: `buildHomeModel` — `hammondLine` renders from a fixture with an open governance entry; is `null`/omitted when none exists.
- Unit: `renderHome` — line renders from a fixture; `hidden` attribute set/cleared correctly.
- Browser: extend `tests/browser/home.spec.mjs` — read the new `[data-value="hammond-line"]` locator (mirror the `readHome()` helper's `assert.deepEqual` pattern around lines 149-158) against the shared mock fixture tree (`scripts/mock-api.mjs` `FIXTURE_FILES`), asserting presence/absence per fixture state. Check whether the shared fixture tree already has a `data/governance/governance-log.md` entry — if not, this may need a small, careful fixture addition (same caution the Chadwick plan's Phase 25 deviation flagged: editing the shared fixture tree risks breaking unrelated assertions in other browser specs — prefer a targeted unit-level check over a browser-level one if the fixture risk looks real, and say so as a deviation if you take that path).

---

### Move 7 — CN audit UI affordance + persisted phase

**Problem:** The audit only starts via a typed trigger phrase; `auditSession` is a plain closure variable (`chat-controller.js:57`) destroyed on reload.

**Build:**
- **UI control:** a "Run audit" button on the Central Node tab, `index.html`, immediately adjacent to `#central-node-chat-button` (line 707), inside `#central-node-dashboard` before its closing `</section>` (line 708). Wire it in `app-controller.js`/wherever `#central-node-chat-button`'s click handler already opens the chat panel (grep for that binding) — on click, open the chat panel to Hammond and call `maybeStartAuditSession('central node audit')` (or send that literal trigger phrase through the same `send()` path a typed message would take) — reuses `maybeStartAuditSession`'s existing logic (`chat-controller.js:68-73`), no new server-side path.
- **Persistence:** add a `storage = globalThis.localStorage` param to `createChatController`'s factory (`chat-controller.js:38`), following the exact injection pattern `fitness-logger-controller.js:16` already establishes. Add a new scoped key in the `app-controller.js:6-8` style, e.g. `AUDIT_SESSION_KEY = 'life-hub:hammond-audit-session'` — but since `chat-controller.js` doesn't currently import from `app-controller.js` (avoid introducing that coupling), declare it locally in `chat-controller.js` following the same naming convention.
  - Since `auditSession` is a JSON-shaped object (`{ kind, phase, intakeCount }`), not a primitive like the three existing `app-controller.js` keys, store via `storage.setItem(AUDIT_SESSION_KEY, JSON.stringify(auditSession))` / read via `JSON.parse(storage.getItem(AUDIT_SESSION_KEY))` — closer in shape to `fitness-logger-draft.js`'s `saveDraft`/`loadDraft` (`JSON.parse`/`JSON.stringify`, try/catch around parse) than to `app-controller.js`'s bare-string keys. Add a small sibling pure module (e.g. `js/app/hammond-audit-session-storage.js`) exporting `saveStoredAuditSession(storage, session)` / `loadStoredAuditSession(storage)` / `removeStoredAuditSession(storage)`, mirroring `fitness-logger-draft.js`'s `saveDraft`/`loadDraft`/`clearDraft` trio — **name these distinctly from `chat-controller.js`'s existing internal `clearAuditSession()` closure function (line 59-61, `auditSession = null` only, no storage)** to avoid a same-name/different-signature collision between the in-memory clear and the new storage-clear; the internal `clearAuditSession()` should call `removeStoredAuditSession(storage)` as one of its steps, not be renamed itself. Validate the loaded value through `normalizeAuditSession` (already imported from `js/app/hammond-audit.js`) before trusting it, same defensive parse-and-validate discipline `fitness-logger-draft.js:75-84`'s `loadDraft` uses.
  - Call `saveStoredAuditSession` on every `auditSession` mutation (inside `maybeStartAuditSession`, `advanceAuditSession`, and `clearAuditSession` — which now also calls `removeStoredAuditSession` — same call-site density `fitness-logger-controller.js`'s `persistLocal()` uses on every meaningful draft mutation).
  - On `createChatController`'s init (mirror `fitness-logger-controller.js:281`'s `mount()`-time `resolveDraft` call), read any persisted session: `auditSession = loadStoredAuditSession(storage);` — but only resume if `auditSession.phase !== 'lock'` (a `lock`-phase session means the audit already reached its final turn; per the design doc, "a `lock`-phase session doesn't resume — audit already ended"). If phase is `lock`, call `removeStoredAuditSession(storage)` and leave `auditSession` as `null` instead.
- Client and server audit-phase machines stay unchanged by this move (Move 7 is pure UI + persistence, not a phase-machine change) — Hard constraint 8's dual-file-sync concern doesn't apply here, but double-check nothing in this move edited `hammond-audit.mjs`/`hammond-audit.js` before considering it done.

**Tests:**
- Unit: `saveStoredAuditSession`/`loadStoredAuditSession`/`removeStoredAuditSession` round-trip through a fake storage; invalid/corrupt stored JSON degrades to `null` (no throw); a `lock`-phase stored session does not resume (returns `null` or is cleared on load).
- Unit: `createChatController` resumes the correct phase from an injected fake `storage` pre-populated with a non-`lock` session.
- Browser: extend `tests/browser/central-node.spec.mjs` — click "Run audit", assert the audit starts (triage phase contract behaviour visible in the mocked response); a second test that simulates a reload (new `createChatController` instance against the same `storage`) and confirms the phase persists.

---

## Phase P4 — Cleanup: Move 8

Independent of everything else — can land anytime, including in parallel with P1.

### Move 8 — Recent Actions purge + roster cleanup

**Problem:** Recent Agent Actions claims a 48-hour rolling window in its own header text; nothing enforces it. Live CN currently has entries back to 20 July. Sterling Blackwood should be fully removed from the protocol; Clare/Ann references must stay byte-for-byte unchanged (they're real, larger-than-assumed future agents per the design doc's Notion-fetch correction, not migration debris).

**Build:**
- New function in `js/core/central-node-write.js`, e.g. `purgeStaleRecentActions(content, today, { windowHours = 48 } = {})` — mirrors `trimCrossAgentSection`'s (line 101) heading-scoped-body-extraction shape but purges by **parsed leading date** instead of line count. Recent Actions bullets are dated (`formatLogDate`, line 23, produces `"11 Aug"`-style prefixes used when appending — check the actual live bullet format via `grep -A2 "Recent Agent Actions" central-node.md` before finalizing the parse regex, since `formatLogDate`'s day-month-only format has no year and this move needs to reason about a 48-**hour**, not 48-day, window — decide whether a same-day-only-date bullet format is precise enough for an hour-level cutoff, or whether Recent Actions bullets actually carry a full date/time already; read a handful of real entries first). Malformed/unparseable date lines are **skipped** (kept, not silently dropped) per the design doc's explicit test requirement — this differs from `trimCrossAgentSection`'s pure line-count drop, so don't copy that function's body wholesale.
- Call site: same mechanical-floor spot as `trimCrossAgentSection` — `central-node-write.js:201`, inside `applyLogToCentralNode`, alongside the existing call. This only covers the specialist-confirm write path; per Move 2's finding, Hammond's own patch path doesn't run through `applyLogToCentralNode` either — decide whether Recent Actions purge needs the same dual call-site treatment Move 2 required. Since Hammond's own `propose_central_node_patch` on `recent_actions` is also `'auto'`-risk `append_line` (`central-node-patch.js:48`), it can also leave stale entries unpurged if only wired at `applyLogToCentralNode` — for consistency with Move 2's reasoning, call `purgeStaleRecentActions` from the same `chat.mjs` read-time location Move 2 added (`rollStaleSections`), right after `centralNodeMarkdown` is decoded.
- **Roster cleanup:** remove `config/hammond-protocol.md:49` entirely (`5. Financial stability (Sterling owns deep finance — redirect; do not coach portfolios)`) — decide whether the Decision Priority Hierarchy renumbers (6→5, 7→6) or the line is simply deleted leaving a gap; renumbering reads better and nothing else in the repo references these numbers by position (verify with `grep -rn "Decision Priority" config/ central-node.md js/ netlify/` before renumbering, to be sure). Leave every other line in the file untouched. **Do not touch `central-node.md` at all** in this move — Clare/Ann references live there, and the design doc's success criterion is "byte-for-byte unchanged."

**Tests:**
- Unit: `purgeStaleRecentActions` against fixture Recent Actions content — mixed ages (some within 48h, some outside), malformed date lines kept not dropped, all-current content is a no-op.
- Unit: protocol content check — grep-style assertion (`assert.doesNotMatch` or similar) that `"Sterling"` no longer appears anywhere in `config/hammond-protocol.md` after the edit, and a companion assertion (in the same or a sibling test) that `central-node.md`'s content hash/byte length is unchanged by this move (guards the "byte-for-byte unchanged" success criterion mechanically, not just by inspection).

---

## Sequencing & verification

Dependency order: **P1 → P2 → P3**, with **P4 independent** (can land anytime, including first).

Within P1, Move 1 and Move 2 can be built in either order or interleaved (share fixture setup). Within P2, Move 4 must land before Move 5 only in the sense that both touch `hammondBlocks` in `persona.mjs` — build Move 4 first to avoid rebasing the `hammondBlocks` array insertion point twice. Within P3, build Move 7 first or in parallel (fully independent); Move 3 before Move 6 (Move 6 consumes Move 3's `oldestOpenGovernanceEntry`).

**After every move:**
```bash
npm test && npm run validate:fixtures
```
Expect ≥880 passing (re-verify the live number before starting — it drifts), 0 failing. Run `npm run test:browser` for any move touching client JS (Move 4, 6, 7, and Move 8 if `purgeStaleRecentActions` ends up called from a client-visible path). Bump `CACHE_NAME` in `service-worker.js` on any client JS change, and re-check the transitive import graph each time — Move 4 in particular introduces the first-ever client-side import of `js/core/governance-log.js`, which is easy to miss since that file "already exists" and doesn't look new.

Commit locally per move with a clear message; **do not push**. Update `docs/IMPLEMENTATION_STATUS.md` after each move completes, continuing the existing numbering from Phase 26 (i.e. this plan's Move 1 = Phase 27, etc., assuming nothing else lands first — check the file's tail before assigning the number, don't assume).

**Ask Adam before:** any change to the Confirm gate, deleting/rewriting existing history files, renumbering the Decision Priority Hierarchy in a way that could read as a substantive priority change rather than a cosmetic renumber (Move 8), or any schema change (none are planned in this build).
