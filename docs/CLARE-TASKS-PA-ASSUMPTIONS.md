# Clare / Tasks PA assumptions — audit brief

**Date:** 29 Sep 2026 (updated same day after Claude Code fact-check)  
**Status:** Assumptions tested; corrections applied; **detailed build plan below — not yet implemented**.  
**Audience:** Claude Code (and Cursor) when asked to **audit**, **critique**, **scope**, or **review the proposed build** for Clare / completed-task Done pile / proactive PA automation.

**Related (read with this, do not replace):**

| File | Role |
|------|------|
| [`docs/AGENT_AUTOMATION_AUDIT.md`](AGENT_AUTOMATION_AUDIT.md) | Canonical inventory of what already runs, what’s broken, recommended cheap loop |
| [`life-hub-data/config/automations/README.md`](https://github.com/adamrussell91-hash/life-hub-data/blob/main/config/automations/README.md) | Live Cursor Automations on the private vault (~47 runs/month; verify in that repo) |
| [`apps/tasks/config/clare-protocol.md`](../apps/tasks/config/clare-protocol.md) | Clare’s operating protocol |
| [`docs/agent-audit-playbook.md`](agent-audit-playbook.md) | How to audit a single agent personality |

---

## Adam’s original framing (verbatim intent)

Two goals:

1. **Correctly archiving completed tasks** — the completed list is getting increasingly long.
2. **Pre-emptive intelligent personal-assistant work** — forward forecasting, organising, suggesting, etc., holistically across all hubs. “Actually useful and intelligent PA.”

Assumption: this requires some form of **automation**, often enough to be useful, but not so often or huge that it costs dollars a day in reading / intuiting / producing.

Named agent of interest: **Clare DeMind** (predominantly).

---

## Verdict (for auditors)

Adam’s **symptom** and **cost ceiling** are right. The **packaging is off**:

- These are **two different problems** (task Done-column hygiene vs proactive PA loop), not one Clare component.
- Clare is the right **Tasks operator**, not the sole **holistic PA**.
- “More automation that thinks” is the expensive failure mode. Most useful prep already exists as **deterministic** code that isn’t scheduled or finished.

Do **not** treat a daily full-agent Sonnet morning as the default design.

---

## How to audit (Claude Code)

When Adam asks you to audit this topic **or the build plan in this file**:

1. Read **this file** end to end, especially **Corrections (29 Sep)** and **Build plan**.
2. Re-verify claims against current `main` (grep / read; do not assert from chat memory alone). Key seams:
   - Board Done: `apps/tasks/src/views/board.ts`, `apps/tasks/src/domain/board.ts`
   - Completion stamp: `netlify/functions/tasks.mjs` (`mergeTask`), `apps/tasks/src/domain/dashboard-overview.ts` (completion date fallback)
   - Archive = projects: `apps/tasks/src/views/archive.ts`
   - Clare mutate: `netlify/functions/_shared/clare-work.mjs` (`complete_task` / `trash_task`)
   - Morning Sweep: `netlify/functions/_shared/clare-desk.mjs` (`buildMorningSweep` — deterministic)
   - Blob list cost: `netlify/functions/_shared/tasks-blobs.mjs` (`listJSON`)
   - Project close divergence: `netlify/functions/reviews.mjs` vs `apps/tasks/src/services/store.ts` `closeProject`
   - Schedules: `netlify/functions/*-scheduled.mjs`, `life-hub-data/config/automations/`
3. Check whether any assumption or build step has been **invalidated** by later code.
4. For the **build plan**: challenge file choices, missing callers, regressions (especially metrics that need historical `done`), cost, and Confirm-queue contracts. Prefer concrete counter-evidence over vibes.
5. Write findings under `docs/` only if Adam asks — preferred name: `docs/CLARE-TASKS-PA-AUDIT-REPORT.md` (or append a dated section here).
6. **Do not implement** from this brief alone unless Adam explicitly asks for a named step (Docs / Slice A / Slice B item).

---

## Assumption tests

### 1. “Clare is the agent for tasks / this work”

| | |
|---|---|
| **Accurate** | Clare owns Tasks capture, desk, dump, complete/trash, Productivity OS tools, Morning Sweep. |
| **Weak** | “Archive” and weekly life governance are not Clare’s. `#/archive` is **projects**, not completed tasks. Hammond owns Central Node sweeps, Weekly Review prep, Confirm queue. Vault Cursor Automations are Hammond/Sara/Chadwick/Hyaluronica. |
| **Correction** | Clare = Tasks operator + morning organiser. Hammond = cross-hub conductor. Do not bolt “holistic PA” onto Clare alone. |

### 2. “Completed list grows → we need correct archiving (probably via Clare)”

| | |
|---|---|
| **Accurate** | Done tasks accumulate forever on the Board Done column. `listTasks` returns the full index; no retention/prune job. |
| **Weak** | Product vocabulary already uses “archive” for something else (project graveyard; Backlog “Archive” → `status: dead`). Framing this as Clare “archiving” invites an AI Confirm loop for a hygiene problem. |
| **Code facts** | Marking done sets `status: 'done'` + usually `completed_at`. Board filters `dead` only, not old `done`. Clare has `complete_task` / `trash_task`, no clear-done tool. Closing a project does not cascade to children. |
| **Correction** | Fix the **Board Done column** (and siblings that literally show “Done” as an active work surface). **Do not** filter done out of the default tasks API — dashboard trend, weekly review, goal runway, project pulse, and goal-page progress all need historical done from the same list. Clare is not the archivist of record. |

### 3. “Useful PA = pre-emptive forecasting / organising / suggesting across hubs → needs automation”

| | |
|---|---|
| **Accurate** | Without scheduled or event-driven work, the system stays reactive. |
| **Weak** | Equating that with “an intelligent agent turn on a cron” is the dollars-a-day failure mode. |
| **Protocol debt (corrected 29 Sep)** | Network tab + `intuitive-scan` / `stress-flags` / intuitive-* domain files were **deleted** (retire-network plan). Protocol/`AGENTS.md`/automation audit previously claimed “existing code” — that was stale. Any future flags pass is a **new build**, and should land in Confirm cards (or CN Status), not a resurrected Network flags page. |
| **Correction** | Automation yes; **LLM automation sparingly**. Intelligence = rules + deltas + Confirm cards. |

### 4. “Often enough to be useful, not so often it costs dollars/day”

| | |
|---|---|
| **Accurate / strength** | Best constraint in the brief. Prepare and queue; never nag. |
| **Already partly true** | Caps exist (ties ≤40, tidy ≤20 pages, career 1×/week). Vault automations ~47/month. Deterministic ghosts/Remember/nudges are free. |
| **Weakness** | Missed value (sweep outage with no heartbeat) hurts more than Clare token spend today. |
| **Correction** | Optimise for **missed value and stale truth** first. |

### 5. “This is one component”

| | |
|---|---|
| **Weak** | Archive hygiene and holistic PA are different owners, data planes, and success metrics. |
| **Correction** | **Docs → Slice A → Slice B (cheapest first)**. Ship A without waiting on B. |

### 6. “Holistically across all hubs”

| | |
|---|---|
| **Strength** | One mailbox (CN + Confirm + Cross-Agent). |
| **Weak** | Clementine CN-isolated; Teaching lesson AI jobs have no runner; Clare rarely touches CN. |
| **Correction** | Hammond conducts; Clare runs Tasks; specialists stay specialists. |

---

## SWOT (compressed) — updated 29 Sep

- **Strengths:** Real Done-column pain; real desire for proactive help; hard cost ceiling; Clare as Tasks face is right for *tasks* UX.
- **Weaknesses:** Over-attributes to Clare; conflates UI retention with “archiving”; assumes intelligence ⇒ LLM cron; early brief wrongly proposed API-level done filtering and “restore” of deleted flags code.
- **Opportunities:** Board Done retention filter; docs cleanup of dead Network promises; sweep heartbeat; deadline runway ghosts; waiting-on follow-ups (reuse promise-nudges pattern). Later: cold-store old done to fix `listJSON` I/O.
- **Threats:** Daily Sonnet “PA”; silent automations; Confirm queue empty; more protocol promises that don’t run; filtering done at the API and breaking metrics.

---

## Corrections (29 Sep — Claude Code fact-check, Cursor agreed)

Verified against `main` / PR #590 tip. **Fix the brief and related docs before any product build.**

| # | Correction | Why |
|---|------------|-----|
| C1 | **Weekly Haiku / intuitive flags code is deleted**, not “test-only.” Files gone with Network tab (`intuitive-scan`, `intuitive-judge`, `intuitive-digest`, `stress-flags.mjs`). Docs that still promise it are lies. | “Restore” is a new build; prefer delete promise now; future surface = Confirm cards / Status, not Network. |
| C2 | **Do not prioritise Morning Sweep cache at 06:45.** `buildMorningSweep` / `buildClareBriefing` are deterministic, already free. Haiku briefing judge is local/dev polish only. | Cache doesn’t buy cost savings; desk slowness (if any) is more likely full `listJSON` I/O than briefing compute. |
| C3 | **Slice A must not filter completed tasks out of the default API.** Dashboard weekly completion trend, weekly review, goal runway, project pulse, goal-page progress all read done from `listTasks()`. | Filter **only** the Board Done column (and any UI that is explicitly “active Done”), not GET `/api/tasks`. |
| C4 | **Retention date = `completed_at` else `updated_at` when status is done.** Dashboard already does this (`dashboard-overview.ts`). | Older done may lack `completed_at`; without fallback they stick forever or vanish incorrectly. |
| C5 | **Hiding Done ≠ fixing load cost.** `listJSON` still fetches every task blob (done + dead). | Note as later cold-storage step once metrics no longer need hot full history. |
| C6 | **Pick one meaning for project close** before any cascade-to-tasks work. Live `reviews.mjs` → `archived_dead`; mock `store.closeProject` → `completed`. | Cascading children on the wrong semantics is worse than no cascade. |
| C7 | **Done-column UX details:** dragging out of Done already reopens (`open`); add **“Show older”** so history is one tap away. | Retention without escape hatch feels like data loss. |

**Unaudited here (honest gaps):** ~47 vault runs/month live in `life-hub-data` (separate repo). Clementine/Teaching-runner gaps inherited from 27 Sep automation audit; Teaching `runTeachingAnnTurn` still unwired (spot-check).

---

## Corrections to accept before any product build

1. Done pile ≠ Clare failure → **Board column retention**, not agent archive.
2. Proactive PA ≠ more Clare thinking → **deterministic prep + rare bounded AI + Confirm**.
3. Holistic ≠ one agent → **Hammond conducts**.
4. Success metrics: Done column stays short; Confirm cards when truth is stale; monthly AI spend flat — **not** “agent wrote a brilliant essay.”
5. Never silently hard-delete completed tasks as part of Slice A.

---

# Build plan (for Claude to audit)

Ordered. Each step has Must / Must-not / Verify / Files / Tests. **Do not skip Docs before Slice A.**

**29 Sep evening tightenings (Claude #2):** locked decisions below — build agent must not re-pick windows, date helpers, ghost pipelines, or waiting age fields.

---

## Step 0 — Docs only

**Goal:** Stop promising deleted Network / intuitive-scan behaviour; stop stress-test / live-test scripts from treating `#/stress` and `/api/stress-flags` as live.

**Status:** Core protocol/`AGENTS.md`/automation-audit cleanup landed earlier on #590. **Remaining in this revision:** stress-test + Tasks live-test / understand-anything references (0.1b).

### 0.1 Remove dead Network / flags promises

| | |
|---|---|
| **Must** | `clare-protocol.md` no longer promises a scheduled Haiku `intuitive` flags pass or StressFlags Network behaviour. |
| **Must** | `apps/tasks/AGENTS.md` no longer documents `POST /api/stress-flags`, hourly `intuitive-scan`, or Network “Look with judgment.” |
| **Must** | `AGENT_AUTOMATION_AUDIT.md` §2.4 matches “code deleted”; Morning Sweep cache / “restore flags” deprioritised. |
| **Must (0.1b)** | Living runbooks no longer instruct testers to open Network / call `/api/stress-flags` as a required pass: `docs/STRESS-TEST.md` (§4.15 + Tasks hash list), `apps/tasks/docs/chatgpt-live-site-test.md`, `apps/tasks/docs/chatgpt-live-redeploy.md`, `apps/tasks/docs/understand-anything.md`. Also strip required Network checks from `apps/tasks/docs/chatgpt-live-regression-test.md` if still present. |
| **Must-not** | Rewrite historical *reports* (`claude-code-ux-ui-design-report.md`, etc.) as if the pages still exist — leave past findings; only fix docs that drive *future* runs. |
| **Must-not** | Reintroduce Network tab, stress-flag store, or fake cron stubs. |
| **Files** | Protocol / AGENTS / automation audit / this file / STRESS-TEST / the chatgpt + understand-anything docs named above. |
| **Verify** | `rg -n "intuitive-scan|/api/stress-flags|#/stress|Look with judgment" apps/tasks docs/STRESS-TEST.md docs/CLAUDE.md` — only historical plans (`docs/superpowers/plans/2026-09-26-retire-network-tab.md`), explicit “deleted/retired” notes, or past-tense report archives. |

### 0.2 Optional future flags (design note only — not built)

If Adam later wants weekly Clare “judgment”:

- **New** Haiku (or Haiku-class) job, capped, weekly.
- Output: Confirm cards and/or one CN Status / Cross-Agent line — **not** a resurrected `#/stress` flags page.
- Input: compact digest of open tasks + week calendar, not full blob dump every hour.
- Out of scope until Slice A and Tier‑0 Slice B land.

---

## Step 1 — Slice A: Board Done retention (no API filter, no AI)

**Goal:** Active Board Done column shows recent completions only; older done remain in storage and all metrics paths.

**Rough size:** ~two product files (`domain` helper + `views/board.ts`) + extend existing tests. Timeline unchanged.

### 1.1 Product contract (locked)

| Field | Decision |
|-------|----------|
| Retention window | **Rolling 7×24h from `now`** (not “since Monday”). Cutoff = `now - 7 days`. |
| Completion instant | **Export and reuse** existing `completionStamp` from `apps/tasks/src/domain/dashboard-overview.ts` (today it is file-private — **export it**; do **not** copy the rule into a second function). Same rule: `completed_at` else `updated_at` when `status === 'done'`. |
| In Done column if | column is done **and** (`showOlder` **or** `completionStamp(task) >= cutoff`). Missing stamp → treat as not recent (hidden unless Show older). |
| Out of Done column if | done, stamp older than cutoff, Show older off. Status stays `done` in Blobs. |
| Show older control | Label **with count**, e.g. `Show 23 older` / `Hide older`. Session-local state for v1. |
| Reopen | Drag / toggle out of Done → `open` (already implemented). Works for recent and revealed-older cards. |
| Dead tasks | Filtered out of Board as today (`status !== 'dead'`). |
| Timeline | **Leave alone** in v1. |
| API | **Unchanged.** `GET /api/tasks` / `listTasks()` still return all tasks. |
| Project close | **Out of Slice A.** No child cascade until Adam picks live `archived_dead` vs mock `completed`. |

### 1.2 Implementation sketch

1. Export `completionStamp` from `dashboard-overview.ts`.
2. Add board helpers in `domain/board.ts` (or thin `domain/done-retention.ts` that **imports** `completionStamp` — no duplicate date logic):
   - `DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000`
   - `isRecentDone(task, now)`
   - `countOlderDone(tasks, now)` / `filterDoneColumnTasks(tasks, { now, showOlder })`
3. `views/board.ts`: when painting the `done` column only, apply the filter; render the counted Show/Hide control; empty copy “Nothing done in the last 7 days” when filtered empty but older exist.
4. Do **not** change `mergeTask`, Clare tools, dashboard math (other than the export), weekly review, goals.

### 1.3 Must / Must-not / Verify

| | |
|---|---|
| **Must** | Done column with Show older off shows only done with `completionStamp >= now - 7d`. |
| **Must** | Button shows older count (`Show N older`). |
| **Must** | Dashboard weekly completion still sees old done (API unchanged; same `completionStamp`). |
| **Must** | Reopen from Done still sets `open`. |
| **Must-not** | Second copy of the completion-date rule. |
| **Must-not** | Filter GET `/api/tasks`. Hard-delete / auto-`dead`. Touch Clare tools. Change Timeline. |
| **Verify** | Extend **`apps/tasks/tests/unit/board.test.ts`** and **`apps/tasks/tests/unit/board-view.test.ts`** (do not invent a parallel suite). Cases: stamp fallback; in/out at 7d boundary; showOlder bypass; count label. Manual: desktop + 390 Board. |
| **Files** | `apps/tasks/src/domain/dashboard-overview.ts` (export), `apps/tasks/src/domain/board.ts` and/or `done-retention.ts`, `apps/tasks/src/views/board.ts`, the two test files above. |
| **UI** | Design kit; touch target ≥44px; `docs/CURSOR-UI-FAILURES.md` checks that apply. |

### 1.4 Later (not Slice A) — cold storage note

`listJSON` still loads every task blob. UI hide ≠ perf fix. Cold-store only after metrics have another source.

---

## Step 2 — Slice B: cheap proactive loop (deterministic first)

**Order inside B (locked):** **B2 → B3 → B1**.  
B2/B3 extend already-running Netlify paths. B1 is Life UI over an existing governance file — specified below, but scheduled after the Tasks PA wins.

**Explicitly deferred:** Morning Sweep cache; weekly Haiku flags; Ann teaching forecast; Teaching job runner; Clementine CN.

### B2 — Deadline runway → calendar ghost (first)

| | |
|---|---|
| **Goal** | Open task with hard due ≤48h and insufficient runway / no work coverage → one **calendar ghost** proposal. Adam accepts or dismisses. |
| **Queue** | Ghosts live in **`life-hub-data`** file `pending-calendar-ghosts.json` (not Tasks Blobs). Writes go through `enqueueCalendarGhost` / `appendPendingCalendarGhost` (`netlify/functions/_shared/calendar-ghost-queue.mjs`, `netlify/functions/calendar-ghosts.mjs`). Each *new* id is a git commit today — **stable ghost `id` + existing `alreadyQueued` / semantic-key de-dupe** so the same task does **not** mint a new proposal every morning. |
| **Logic** | Reuse **`computeDeadlineRunway`** in `netlify/functions/_shared/productivity-os.mjs` (~line 1025). Do not rewrite runway math. Map `risk` / missing coverage → ghost entry shape used by the existing propose pipeline. |
| **Schedule** | **Extend the existing morning ghost-propose run** (`calendar-ghosts-propose-scheduled.mjs` → `calendar-ghosts-propose.mjs`). **No new cron.** Add a Tasks runway section inside that pass. |
| **Must** | Never move `due_date`. Never auto-accept. Idempotent per task/day (or stronger) via ghost id / semantic key. |
| **Must-not** | Anthropic. Nested agent turns. Second scheduled function. |
| **Verify** | Unit: due tomorrow + insufficient runway → one enqueue with `added: true`; second pass → `added: false`. Already-covered task → no enqueue. |
| **Cost** | $0 model; at most one commit per *new* ghost. |

### B3 — Waiting-on follow-ups (second)

| | |
|---|---|
| **Goal** | Open task with `waiting_on` and **`waiting_since` age ≥ 5 days** → follow-up **draft** on the calendar ghost queue. Never auto-send. |
| **Age field** | **`waiting_since` only** (`productivity-os.mjs` `listWaitingItems` / `apps/tasks/src/domain/waiting.ts`). **Do not** fall back to `updated_at` (changes on every edit). |
| **Missing `waiting_since`** | **Stamp in `mergeTask`** (`netlify/functions/tasks.mjs`) when `waiting_on` transitions from empty → set and `waiting_since` is absent (mirror Clare `set_waiting_on` which already stamps). Until that lands, **skip** tasks that still lack `waiting_since` rather than guessing age. |
| **Reuse** | `listWaitingItems` / waiting helpers in `productivity-os.mjs`; enqueue via same ghost queue as promise-nudges (`runPromiseNudges` pattern in `promise-nudges.mjs`). |
| **Cap / commits** | Prefer **one batched write** to `pending-calendar-ghosts.json` per run (append all new drafts, single commit). If forced to reuse one-entry `enqueueCalendarGhost`, cap **≤10** new drafts/run (≤10 commits) — acceptable but batch is better. |
| **Schedule** | Daily. While touching this path, **DST-gate `promise-nudges-scheduled`** on Sydney hour so it stays ~07:00 after AEDT (bundle with B3). Waiting-on can ride the same gate or the morning ghost pass if batching is cleaner — pick one pipeline, document it in the PR; do not add a third cron. |
| **Must** | Draft only; de-dupe like ghosts; N=5 days from `waiting_since`. |
| **Must-not** | Auto-send; LLM rewrite; age from `updated_at`. |
| **Verify** | Unit: `waiting_since` 6d ago → draft; 2d ago → none; missing `waiting_since` → none (and after mergeTask stamp, new waits get a stamp). Batch write → one commit for multiple drafts if implemented. |
| **Cost** | $0 model. |

### B1 — Missed-sweep heartbeat (third; fully named — no open-ended search)

| | |
|---|---|
| **Goal** | If newest Hammond **Daily Sweep** is older than **36h**, fail-visible warning on Life Home + Central Node. |
| **Data source** | `life-hub-data` path **`data/governance/governance-log.md`**. Sweep headings written by Cursor Automation as `## {YYYY-MM-DD} — Daily Sweep` (`life-hub-data/config/hammond-daily-sweep.md`). |
| **Parse** | Existing `parseGovernanceEntries` in `apps/life/js/core/governance-log.js` (already used by Home / CN). Add a tiny helper next to `latestHammondReview`, e.g. `latestDailySweep(markdown)` → newest entry with `entryType === 'Daily Sweep'`, then compare `dateKey` (and/or entry time if present) to Sydney now. Note: `"Daily Sweep"` is **not** in `GOVERNANCE_ENTRY_TYPES` (write allowlist) but **is** parseable from headings — do not require adding it to the write allowlist for this read-only check. |
| **Surfaces** | **Home** via `apps/life/js/app/home-model.js` (same family as Hammond review line). **Central Node** via `apps/life/js/app/central-node-model.js` / CN Status or Needs-you chrome (fail-visible, not a nag toast loop). |
| **Must** | Warning when stale; absent/soft when a sweep from the last ~36h exists; works offline against fixture markdown in unit tests. |
| **Must-not** | Trigger an emergency model sweep. Open-ended “find the log” exploration at build time — paths are named here. |
| **Verify** | Unit: fixture log with yesterday’s Daily Sweep → OK; with entry 3 days ago → warning; empty log → warning. |
| **Cost** | $0 model. |

### B — Explicit non-goals for first pass

- Morning Sweep Blobs cache.
- Resurrecting intuitive-scan / stress-flags / `#/stress`.
- Daily Clare or Hammond Sonnet “be useful” turn.
- Cascading task archive on project close.
- Filtering done at the API.
- Putting Tasks blobs into `life-hub-data`.
- New cron solely for runway (must extend morning ghost propose).

---

## Suggested Cursor execution order

1. Finish **Step 0** (including 0.1b stress-test / live-test docs) on this PR.
2. **Slice A** — own PR; export `completionStamp`; extend `board.test.ts` + `board-view.test.ts`; Board screenshots desktop + 390.
3. **B2** then **B3** (extend existing schedules; batch ghost writes if practical).
4. **B1** heartbeat on Life Home + CN.
5. Only then revisit weekly judgment flags / Ann forecast / Teaching runner from `AGENT_AUTOMATION_AUDIT.md`.

---

## Cost tiers (reference — updated)

```text
Tier 0 — Deterministic (build these)
  existing ghosts · Remember · promise nudges ·
  Board Done retention (Slice A) ·
  deadline runway ghosts (B2) · waiting-on follow-up drafts (B3) ·
  sweep heartbeat (B1)

Tier 1 — Bounded Haiku (later, only if Adam asks)
  Knowledge tidy · NEW weekly Clare judgment → Confirm/Status
  Ann teaching-load one-liner

Tier 2 — Bounded Sonnet (keep rare)
  ties · career scan · person-brief on demand

Tier 3 — Cursor Automations on life-hub-data
  Hammond sweep / Weekly prep / Sara / Chadwick / monthly → Confirm

Tier 4 — Interactive chat only
  Full Clare / Hammond / specialists + Confirm cards
```

---

## What this brief is not

- Not a licence to implement without Adam naming a step.
- Not a replacement for `AGENT_AUTOMATION_AUDIT.md` full inventory.
- Not a personality rewrite of Clare.
- Not permission to put task blobs in git data repos.
- Not a performance redesign of Blobs (noted only as later cold storage).
