# Hammond Closed-Loop Governance — Design

**Date:** 2026-08-11
**Status:** Approved for planning
**Scope:** Longitudinal digest for Hammond, self-rolling This Week/This Month, computed drift counters, Governance Log enforcement + UI, reused Central Node model in-prompt, Home surface line, CN audit UI + persisted phase, Recent Actions purge, Sterling/Clare/Ann roster cleanup
**Out of scope:** Coach's Notes (weekly-briefing prose synthesis) — deferred until mood/diary data exists (see Follow-ups). Goals database. Mood/diary wiring into Hammond's prompt (data volume too thin to be worth it yet — see Flags).
**Precedent:** Follows the audit method in `docs/agent-audit-playbook.md` (run 2026-08-11 against Hammond) and the build discipline in `docs/superpowers/plans/2026-08-11-chadwick-closed-loop.md`.

---

## Problem

The audit (full findings in the playbook run, summarised here) found Hammond structurally unable to do the one job his own protocol assigns him:

> *"You are the one place in the system that reads that full history."* — `config/hammond-protocol.md:69`

He isn't. `chat.mjs` gives every agent, Hammond included, a `today − 1 day` digest window (`digest.mjs`). His only additional context is `central-node.md` in full — but **This Week is headed 16–22 June and This Month is April**, both frozen since those windows closed, because nothing rolls them over. The Long-Term Trends essay he's meant to distil patterns from is April-vintage and still predicts an AEKE K1 delivery that arrived in May. Specialists (`config/brisket-protocol.md:25`) are explicitly told to wait for a `Hammond→[Agent]` relay rather than infer patterns themselves — so the one contract holding the whole cross-agent pattern system together rests on a document that stopped updating four months ago.

Meanwhile the Central Node *page* computes real 30-day heatmaps and a 7-day protein series client-side (`js/app/central-node-model.js`) from data the chat function already has in its resolved tree. Hammond cannot see the chart on the tab his own chat button sits on.

The Governance Log (`js/core/governance-log.js`) is fully coded — format, append, tail-extraction — and never used. `data/governance/governance-log.md` doesn't exist. Hammond's phased CN audit (`hammond-audit.mjs`) has no page affordance; it only fires if Adam types "central node audit," and its phase state lives in a `chat-controller.js` closure that a reload destroys.

Notion's protocol (fetched during this audit — see correction below) additionally confirms `Sterling Blackwood` should be dropped from the roster entirely, and that `Clare DeMind` / `Ann O'Tation` are real, larger-than-assumed future agents (Ann in particular: a full lesson-reflection coach with her own database and a specified `Ann → Hammond` monthly handoff format already anticipated by a live Cross-Agent line) — not migration debris to clean up.

**The reframe:** Hammond isn't underperforming as a chat coach. He's an open loop. He locks a weekly non-negotiable and has no way to ever learn if it was kept, because nothing persists between sessions except a 20-minute in-memory transcript. The fix is memory and cadence, not more personality.

---

## Goals

- Hammond can read 90 days of real logging/adherence history, derived from the GitHub tree already fetched on every chat turn — **no new unbounded blob reads**.
- This Week / This Month roll over mechanically; Hammond's writes always land under the correct current heading.
- Drift counters (days-unactioned style flags) are computed from a dated open-loop store, not hand-typed strings that rot.
- The Governance Log is actually written to (enforced at audit `lock`) and actually rendered — a real page surface, not write-only.
- Hammond's prompt reuses the same `buildCentralNodeModel` computation the Central Node tab renders, so he sees the same heatmaps and series Adam does.
- Home surfaces Hammond's current lock / oldest open loop in one line.
- The CN audit is reachable from the UI and survives a reload mid-audit.
- Recent Agent Actions actually purges to its declared 48-hour window.
- Sterling is fully removed. Clare/Ann references are preserved as-is (no roster entry added — they remain future work).

## Non-goals

- Coach's Notes. Notion specifies a full weekly-briefing structure (open with what matters → follow up on last briefing's predictions → sweep 8 domains → name what's stuck → 3 direct asks) gated by a Goal Audit cadence and pulling heavily on the Mood/Diary Tracker. Diary/mood data is about to be backfilled but doesn't exist yet in usable volume (`data/mind/` currently holds one entry). Building this now means building against empty input. Revisit once mood backfill lands and moves below are in.
- A Goals database. Goals stay prose under This Month, per the existing (locked) decision in `2026-08-09-hammond-central-node-governance-design.md`.
- Wiring mood/diary into any agent's prompt. Same reasoning — too little data to be worth the plumbing yet. Flagged as a measure-then-decide item.
- Rebuilding Ann O'Tation or Clare DeMind as agents. Out of scope; they stay Notion-only, referenced but unbuilt.
- Injecting Hammond directives into another agent's system prompt directly (still rejected, per the prior design doc — CN Cross-Agent lines remain the only channel).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Sterling Blackwood | Drop completely — remove from Decision Priority Hierarchy rule 5 and any redirect language. No roster shim. |
| Clare DeMind / Ann O'Tation | Preserve existing references (`Hammond→Ann` line shape, teaching-load hierarchy mentions) exactly as-is. Do not build, do not treat as dead links to clean up. |
| Coach's Notes | Deferred (see Non-goals). Documented here so it isn't silently lost again. |
| Governance Log seed | Starts **empty**. On Hammond's first real governance-tool-eligible turn after this ships, he surfaces the two carried-over Notion items (drift: "Build a life worth enjoying" — Still Active as of 9 Jul; escalation: August study load, now past its 15 Aug checkpoint) **once**, in chat, so Adam can close/carry/drop them explicitly. No silent auto-import. |
| Digest source | Tree-derived only (paths + dates already free from `resolveTree()`). One bounded additional read: latest-N fitness blobs in-window, to distinguish `completed`/`planned`/`skipped` — mirrors the existing `body-state.mjs` bounded-read pattern. |
| This Week/Month retirement | Try mechanical roll-over first (this doc). If it still doesn't hold up under use, retiring the prose sections in favour of computed-only cards is the fallback — Adam's explicitly open to it, re-decide after measuring. |
| Mood/diary wiring | Not built now. Ship everything else, let mood backfill land, measure, revisit. |

---

## Architecture

```
Hammond chat turn
  → resolveTree() (already happening)
  → hammond-digest.mjs: derive 90-day path-based logging/adherence skeleton
      + bounded read of in-window fitness blobs (completed vs planned/skipped)
  → central-node-write.js: roll This Week/This Month headings if stale, before read
  → buildCentralNodeModel() reused server-side (mirrors digest.mjs's existing
    reuse of buildHomeModel) → week series, 30-day heatmaps
  → governance-log.mjs: load full log, compute open-loop ages from dated entries
  → system prompt: full central-node.md + rolled Week/Month + 90-day digest
    + CN model heatmaps + governance tail + computed drift ages + protocol
  → tools: propose_central_node_patch | append_governance_log | web_search
  → server classifies patch risk (unchanged from prior design)
```

No new per-request GitHub round trips beyond the one bounded fitness-blob read. Everything else is arithmetic over data already in the resolved tree or already-fetched CN/governance blobs.

---

## Move 1 — Longitudinal digest from the tree

**Problem:** `chat.mjs:174` sets `from = today - 1`. `summarizeRecentHistory` (`digest.mjs`) only ever sees two days.

**Build:** New `netlify/functions/_shared/hammond-digest.mjs`. Input: the full `current.tree` from `resolveTree()` (already fetched at `chat.mjs:256`, no new call), plus `today`.

- Walk `data/**/*.md` tree entries only — no blob reads. Each path already encodes domain and date (`data/nutrition/2026/08/2026-08-07-breakfast.md`, `data/fitness/2026/...`, `data/body/2026/...`, `data/skincare/2026/...`, `data/mind/2026/...`).
- For a 90-day window, compute per domain: which dates have at least one file, current gap length (days since last file), longest gap in the window.
- Fitness needs `completed` vs `planned`/`skipped` to compute a real streak (`calculateWorkoutStreak` in `js/core/aggregate.js` is correct logic, just starved of data) — read only the fitness blobs whose path falls in the 90-day window (bounded: ~10-40 files depending on cadence, same order of magnitude as `body-state.mjs`'s existing bounded reads). Parse `status` from each.
- Nutrition/skincare/body/mind: presence-by-date from paths alone is sufficient for a logging-consistency digest; do not add blob reads for these domains in v1.

**Output shape:** short structured text block, e.g.:
```
Logging last 90 days — nutrition: 41/90 days, current gap 2d, longest gap 9d (14–22 Jun).
Fitness: 18 completed sessions, longest current gap 6d (2–7 Aug), longest gap this window 16d (22 Feb–10 Mar — historical, outside window if >90d back).
Body: last composition reading 21 Jul (21 days ago). Skincare: 1/90 days logged.
```

**Guard:** wrap in the same try/catch the existing digest already has (`chat.mjs:411`); on failure, digest degrades to empty string, not a thrown error.

**Tests:** unit — path-only walk with synthetic tree entries (multi-domain, gaps, boundary dates); fitness completed/planned/skipped classification from parsed blobs; 90-day window boundary (entry exactly 90 days back included, 91 excluded); empty tree → empty-but-valid output, no crash.

---

## Move 2 — Self-rolling This Week / This Month

**Problem:** `central-node-write.js` only auto-writes Today's Status. This Week/Month headings (`## 📅 This Week (16 – 22 June 2026)`, `## 📊 This Month (April 2026)`) never advance. Any `append_line` to `this_week` (already `auto`-risk per `central-node-patch.js:50`) lands under a stale heading.

**Build:** New pure function in `central-node-write.js`, e.g. `rollStaleSections(content, today)`:
- Parse the heading's trailing date range (This Week) or month name (This Month) — reuse the `MONTH_INDEX` map and heading-date parsing already in the file (`central-node-write.js:129+`) rather than writing a second parser.
- If the parsed range/month has fully elapsed relative to `today`, replace the heading with the current week/month and **clear the body** (a stale body describing the wrong period is worse than an empty one).
- Call this once, before any read that will inform patch generation, and also defensively before any `this_week`/`this_month` write — same place `trimCrossAgentSection` is already invoked (`central-node-write.js:201`).

**Decision reflected here:** ship this; it's the primary attempt. If Adam finds after using it that prose Week/Month still isn't earning its keep, the fallback (retire to computed-only cards, per the Decisions table) is a follow-up, not blocked by this move.

**Tests:** unit — heading with elapsed week range rolls to current week and clears body; heading already current is untouched; malformed/missing heading is a no-op (doesn't corrupt the file); month rollover across a year boundary (Dec → Jan).

---

## Move 3 — Computed drift/open-loop ages

**Problem:** Flags like *"MEd Sem 2 decision — 79 days unactioned"* are hand-typed strings that never update — today they're wrong by roughly 50 days.

**Build:** Open loops become dated entries (`opened: 2026-05-20, label: "Goal Audit overdue"`), stored as structured lines Hammond writes via `propose_central_node_patch` (Flags field) or Governance Log entries with a `dateKey`. At prompt-build time, compute `today - opened` and render the age — never store the age as text.

**Depends on:** Move 4 (Governance Log actually holding dated entries is the natural home for this; CN Flags can carry a short-form mirror).

**Tests:** unit — age computation from a dated entry across a range of `today` values; malformed/missing date degrades to showing the entry without an age rather than crashing.

---

## Move 4 — Governance Log: enforce the write, build the read

**Problem:** `append_governance_log` exists and works (`hammond-tools.mjs`, `governance-log.js`) but nothing forces its use, and nothing renders it. It's write-only from Adam's side.

**Build, write side:**
- `hammond-audit.mjs`'s `lock` phase contract already *says* to call `append_governance_log` — make it structurally required: `chat.mjs`'s audit-lock handling checks the tool was actually invoked in that turn's response before treating the audit as closed; if not, the phase contract for `lock` is re-sent rather than silently advancing. (Mirrors the existing pattern where a rejected `log_entry` blocks completion narration — `persona.mjs`'s shared block already establishes this precedent for other agents.)
- Governance Log **starts empty** per the locked decision. First Hammond turn after deploy where a governance-log-eligible protocol would fire (triage identifying cross-domain tension, drift, escalation, etc.) — prompt instructs him to mention, once, that Notion's log carried two open items forward (drift: "Build a life worth enjoying"; escalation: August study load, now past its checkpoint) and ask Adam how to handle them. This is a one-time prompt addition, not a permanent standing instruction — remove after first use is confirmed, or gate it on the log being empty (simpler: gate on empty log, self-expires once he's written to it once).

**Build, read side:**
- New Central Node tab card, "Governance Log" — placed above Cross-Agent Coordination per `index.html`'s existing card order (`central-node-dashboard` section, `index.html:627+`).
- Render the recent tail using the same `recentGovernanceTail` extraction already used for the prompt (`governance-log.js:63`), parsed into per-entry blocks (date, type, status badge, body) client-side — new small render module `js/app/render-governance.js`, following the shape of `render-central-node.js`'s existing section renderers.
- Read path: extend `js/app/load-live-events.js`'s known-path handling (it already special-cases `CENTRAL_NODE_PATH`) to also fetch `data/governance/governance-log.md` when present; absent file renders an empty-state card, not an error.

**Tests:** unit — lock-phase gate blocks advancement without the tool call, allows it with; governance card renderer against fixture log content (multiple entries, status badges, empty log); integration — audit reaching `lock` without calling the tool re-sends the `lock` contract instead of ending the session.

---

## Move 5 — Reuse `buildCentralNodeModel` server-side for Hammond

**Problem:** The Central Node tab computes a 7-day protein series and 30-day exercise/eating/logging heatmaps client-side. Hammond, whose chat button lives on that tab, sees none of it.

**Build:** `digest.mjs` already reuses `js/app/home-model.js`'s `buildHomeModel` server-side (explicit comment at `digest.mjs:3` justifying this as one source of truth). Do the same for `central-node-model.js`'s `buildCentralNodeModel`: call it from `chat.mjs` when `needsHammondTools`, using the same `events` array `summarizeRecentHistory` already builds from the fetched tree (extend that fetch to the 30-day window `buildCentralNodeModel` needs, still bounded and small — same order as the existing template/body bounded reads).
- Format output as a compact text block: 7-day protein trend direction, 30-day logging completeness rate, 30-day exercise completion rate, 30-day eating-target adherence rate. Not the raw per-day arrays — Hammond needs the read, not the chart data.
- Add to `persona.mjs`'s `hammondBlocks`.

**Tests:** unit — text formatter against fixture `buildCentralNodeModel` output (rates render as expected percentages/counts); persona test confirming the block appears only for `hammond`.

---

## Move 6 — Home surface line

**Problem:** Hammond is reachable only via a floating button on the Central Node tab — a tab visited deliberately, not the one Adam opens by default.

**Build:** One line at the top of `home-dashboard` (`index.html:100+`), above or alongside the existing "This week" strip (`index.html:213`) — e.g. "Hammond: \[current lock, or oldest open loop with computed age from Move 3\]." Sourced from the same governance/CN data already loaded for the Home render; if Hammond hasn't locked anything yet, the line is omitted rather than showing a placeholder.
- New small render function alongside `render-home.js`'s existing pattern; no new fetch — Home already loads `central-node.md` for its existing sections.

**Tests:** unit — line renders from a fixture lock/open-loop; omits cleanly when none exists; browser test extending `tests/browser/home.spec.mjs`.

---

## Move 7 — CN audit UI affordance + persisted phase

**Problem:** The five-phase audit (`hammond-audit.mjs`) only starts if Adam types a trigger phrase (`isHammondAuditTrigger`), and `auditSession` is a plain closure variable in `chat-controller.js:57` — a reload destroys it mid-audit.

**Build:**
- Add a "Run audit" control on the Central Node tab (near the existing chat button, `index.html:707`) that sends the trigger phrase programmatically — reuses `maybeStartAuditSession`'s existing logic (`chat-controller.js:68`), no new server-side path.
- Persist `auditSession` the same way `fitness-logger-controller.js` persists its draft state: inject `storage` (defaults to `localStorage`) as a constructor param, read on init, write on every `advanceAuditSession`/`clearAuditSession` call. Key scoped like the existing `LOGOUT_PENDING_KEY`/`LAST_SUCCESS_KEY` pattern in `app-controller.js`.
- On load, if a persisted session exists and its phase isn't `lock`, resume — the phase contract in `hammond-audit.mjs` is already stateless per-turn, so resuming just means re-sending the right `hammondAuditContract` on the next message.

**Tests:** unit — session round-trips through storage; resume picks up the correct phase; a `lock`-phase session doesn't resume (audit already ended). Browser test: start audit, simulate reload, confirm phase persists.

---

## Move 8 — Recent Actions purge + roster cleanup

**Problem:** Recent Agent Actions' own header claims a 48-hour rolling window; nothing enforces it (`central-node-write.js` only caps Cross-Agent, at 12 lines — no equivalent for Recent Actions). Live CN runs back to 20 July.

**Build:**
- Mirror `trimCrossAgentSection`'s approach but **date-based** instead of line-count-based: parse each Recent Actions bullet's leading date, drop entries older than 48h relative to `today`, in the same mechanical-floor spot (`central-node-write.js:201`, alongside the existing `trimCrossAgentSection` call).
- Roster cleanup: remove Sterling entirely — `config/hammond-protocol.md` rule 5 and any redirect text. Leave Clare/Ann references untouched (per Decisions table — they are not roster entries to fix, they're intentional forward references).

**Tests:** unit — date-parsing purge against fixture Recent Actions content (mixed ages, malformed date lines skipped not dropped-silently-wrong); protocol content check (grep-style) that Sterling no longer appears in `hammond-protocol.md`.

---

## Build constraints (unchanged from Chadwick precedent — apply here too)

1. **Netlify function budget is binding.** No new unbounded blob read on the chat path. Moves 1 and 5 add exactly one bounded read each (in-window fitness blobs; 30-day event window for the CN model) — same order of magnitude as the existing `body-state.mjs` bounded reads, not a new class of cost.
2. **`netlify.toml` `included_files`** — this work reads no new static config files, so no addition needed. If Move 3's open-loop store ends up as a separate tracked file rather than living in CN/Governance Log content, it must be added here.
3. **Service worker precache** — any new client-side `js/` module (`render-governance.js`, Home line renderer, audit-control wiring) must be added to `service-worker.js`'s precache list and `CACHE_NAME` bumped (currently `life-hub-shell-v63`). Walk the transitive import graph — this repo has broken offline reload twice from missing this step.
4. **No new record schema fields.** Nothing here touches `js/core/validate.js`.
5. **Confirm gate unchanged.** High-risk CN patches (Constraint removal, Week/Month/Trends rewrite) still queue Confirm per the existing risk classifier in `central-node-patch.js` — Move 2's rollover is a mechanical floor operation, not a Hammond-authored patch, so it runs outside the risk classifier entirely (same category as the existing `trimCrossAgentSection`).
6. Zero new runtime dependencies.
7. Document each completed phase in `docs/IMPLEMENTATION_STATUS.md`, existing style (verified test counts, deviations, gotchas).

**Current baseline:** `npm test` → 880 passing, 0 failing (`node --test tests/unit/*.test.js tests/integration/*.test.js`). `npm run test:browser` and `npm run validate:fixtures` also available. Record actuals before/after each phase.

---

## Phasing

**P1 (foundation, do first):** Move 1 (digest) + Move 2 (rollover). One spec-adjacent PR, shared test fixtures (both need a synthetic multi-domain tree/CN fixture) — natural to build together.

**P2 (memory):** Move 4 (Governance Log enforcement + card) + Move 5 (CN model reuse). Move 4's lock-gate needs Move 1's digest present in the same turn for the "mention carried-over items" instruction to read naturally, so P2 depends on P1.

**P3 (surface + persistence):** Move 3 (computed ages — depends on Move 4's dated entries existing) + Move 6 (Home line — depends on Move 3 or Move 4 having something to show) + Move 7 (audit UI + persisted phase — independent, can parallelize with the rest of P3).

**P4 (cleanup):** Move 8. Independent of the others; can land anytime, including in parallel with P1.

---

## Testing

- Unit coverage per move as listed above.
- Integration: full Hammond chat turn against a fixture tree spanning >90 days, multiple domains, some gaps — confirm digest, rolled CN, governance tail, and CN-model block all appear together without exceeding a sane prompt-size budget (spot-check character count against the existing full-CN-inject baseline from the prior design doc).
- Browser: extend `tests/browser/central-node.spec.mjs` for the Governance Log card and the audit control; extend `tests/browser/home.spec.mjs` for the Hammond line.

## Success criteria

- Hammond's prompt contains real 90-day adherence data, not just today+yesterday.
- This Week/This Month headings match the actual current period after any Hammond turn that touches them.
- The Governance Log has content after the first audit `lock`, and that content is visible on the Central Node tab.
- Hammond can reference the same 30-day heatmap rates the tab displays.
- Home shows a Hammond line when there's something to show.
- Starting a CN audit, reloading mid-audit, and continuing resumes the correct phase.
- Recent Agent Actions never shows entries older than 48 hours after a Hammond turn.
- No Sterling references remain in `config/hammond-protocol.md`. Clare/Ann references are byte-for-byte unchanged.
- `npm test` stays green; new tests added per move, none of the existing 880 regress.

## Follow-ups (later, explicitly not this build)

- Coach's Notes — once mood/diary backfill lands and moves 1–8 are in and measured. Structure to build against is already fully specified in Notion (see Non-goals).
- Mood/diary wiring into Hammond's (or any agent's) prompt — revisit once diary volume is non-trivial.
- Ann O'Tation / Clare DeMind as real agents — separate future scope, not touched here.
- The Horizon Council (long-range scenario-planning agent, quarterly cadence, Notion-only) — noted as a Pass 5 roster lead during the audit, no action needed now.
- `search_governance_log` tool, if the log grows large enough that the capped tail stops being sufficient for Closed Loop Review.
- Retiring This Week/This Month prose to computed-only cards, if Move 2's rollover doesn't hold up under actual use (explicitly re-decidable per the Decisions table).
