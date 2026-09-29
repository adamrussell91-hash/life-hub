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

---

## Step 0 — Docs only (landed on PR #590 with this revision)

**Goal:** Stop promising deleted Network / intuitive-scan behaviour; align automation audit with C1–C2.

**Status:** Done in this docs revision (`clare-protocol.md`, `apps/tasks/AGENTS.md`, `AGENT_AUTOMATION_AUDIT.md`, this file, `CLAUDE.md`). Claude should still re-verify with the Step 0.1 Verify grep.

### 0.1 Remove dead Network / flags promises

| | |
|---|---|
| **Must** | `clare-protocol.md` no longer promises a scheduled Haiku `intuitive` flags pass or StressFlags Network behaviour that has no runtime. |
| **Must** | `apps/tasks/AGENTS.md` no longer documents `POST /api/stress-flags`, hourly `intuitive-scan`, or Network “Look with judgment.” |
| **Must** | `AGENT_AUTOMATION_AUDIT.md` §2.4 and “restore existing code” / “Morning Sweep cache” priorities updated to match C1–C2. |
| **Must-not** | Reintroduce Network tab, stress-flag store, or fake cron stubs in docs. |
| **Files** | `apps/tasks/config/clare-protocol.md`, `apps/tasks/AGENTS.md`, `docs/AGENT_AUTOMATION_AUDIT.md`, this file. |
| **Verify** | `rg -n "intuitive-scan|stress-flags|Look with judgment|scheduled Haiku" apps/tasks docs/CLAUDE.md` — only historical plans (`docs/superpowers/plans/2026-09-26-retire-network-tab.md`) or explicit “deleted” notes. |

### 0.2 Optional future flags (design note only — not built)

If Adam later wants weekly Clare “judgment”:

- **New** Haiku (or Haiku-class) job, capped, weekly.
- Output: Confirm cards and/or one CN Status / Cross-Agent line — **not** a resurrected `#/stress` flags page.
- Input: compact digest of open tasks + week calendar, not full blob dump every hour.
- Out of scope until Slice A and Tier‑0 Slice B land.

---

## Step 1 — Slice A: Board Done retention (no API filter, no AI)

**Goal:** Active Board Done column shows recent completions only; older done remain in storage and all metrics paths.

### 1.1 Product contract

| Field | Decision |
|-------|----------|
| Retention window | **7 calendar days** ending today in Australia/Sydney (or “since Monday 00:00 Sydney” — pick one in implementation and document it; default proposal: **rolling 7×24h from `now`** using the same completion-date helper as overview). |
| Completion instant | `parse(completed_at) ?? (status==='done' ? parse(updated_at) : null)` — same spirit as `dashboard-overview.ts`. |
| In Done column if | `status === 'done'` (or column maps to done) **and** completion instant ≥ cutoff **or** user toggled “Show older”. |
| Out of Done column if | done and completion instant &lt; cutoff and “Show older” is off. Task remains `status: 'done'` in Blobs. |
| Reopen | Drag / toggle out of Done → `open` (already implemented). Must keep working for both recent and revealed-older cards. |
| Dead tasks | Stay filtered out of Board (`status !== 'dead'`) as today. |
| API | **Unchanged.** `GET /api/tasks` / `listTasks()` still return all tasks. |

### 1.2 Implementation sketch

1. **Pure helper** (new small domain module or add to `domain/board.ts`):
   - `completionInstant(task): Date | null`
   - `isRecentDone(task, now, windowMs): boolean`
   - `filterBoardDoneColumn(tasks, { now, showOlder, windowMs }): Task[]` — only affects which done tasks appear in the done column list; other columns unchanged.
2. **Board view** (`views/board.ts`):
   - When painting the `done` column, pass tasks through the helper.
   - Add a control under Done: **“Show older”** / **“Hide older”** (session-local state is enough for v1; persist in `meta/hub_prefs` only if trivial).
   - Empty copy when filtered: e.g. “Nothing done in the last 7 days” vs true empty.
3. **Do not** change `mergeTask`, Clare `complete_task`, Timeline (unless Timeline is explicitly an “active Done” surface — default: **leave Timeline alone in v1**; call out if Claude disagrees), dashboard overview, weekly review, goals.
4. **Project close:** **out of Slice A.** Document the live vs mock divergence; do not cascade children until Adam picks `completed` vs `archived_dead` as the intentional close status.

### 1.3 Must / Must-not / Verify

| | |
|---|---|
| **Must** | Board Done with “Show older” off shows ≤7-day done (by completionInstant). |
| **Must** | “Show older” reveals older done without changing stored status. |
| **Must** | Dashboard weekly completion counts still see old done (API unchanged). |
| **Must** | Reopen from Done still sets `open` and clears done semantics as today. |
| **Must-not** | Add `include_completed` default filter on GET `/api/tasks`. |
| **Must-not** | Hard-delete or auto-`dead` old done. |
| **Must-not** | Touch Clare tools for this. |
| **Verify** | Unit tests: completionInstant fallback; filter in/out at boundary; showOlder bypass. Board view test if one exists for column paint. Manual: complete a task → appears in Done; with clock skew / fixture older than 7d → hidden until Show older. |
| **Files** | `apps/tasks/src/domain/board.ts` (or new `domain/done-retention.ts`), `apps/tasks/src/views/board.ts`, tests under `apps/tasks/tests/unit/`. |
| **UI** | Design kit only; both desktop and 390px. Touch target ≥44px for Show older. Failure register checks that apply (read `docs/CURSOR-UI-FAILURES.md`). |

### 1.4 Later (not Slice A) — cold storage note

When/if `listJSON` latency hurts:

- Move done older than e.g. 90d into `tasks_archive/` (or similar) **after** metrics are updated to read a compact completion ledger or week aggregates.
- Until then, Board filter only. Do not pretend UI hide = perf fix.

---

## Step 2 — Slice B: cheap proactive loop (deterministic first)

**Order inside B:** B1 heartbeat → B2 deadline runway ghosts → B3 waiting-on follow-ups.  
**Explicitly deferred:** Morning Sweep cache; weekly Haiku flags; Ann teaching forecast; Teaching job runner; Clementine CN (those stay on the automation audit backlog).

### B1 — Missed-sweep heartbeat (no LLM)

| | |
|---|---|
| **Goal** | If Hammond Daily Sweep hasn’t landed in ~36h, surface a fail-visible flag (CN Status and/or Home), not silence. |
| **Pattern** | Read newest governance `Daily Sweep` entry (or commit stamp the automation already writes). Compare to Sydney now. |
| **Must** | Flag appears when stale; clears or softens when a fresh sweep exists. |
| **Must-not** | Trigger an emergency Sonnet sweep by itself. |
| **Files (expected)** | Life CN / Home surfaces; possibly a tiny helper reading governance log from `life-hub-data` via existing GitHub client paths. Exact files: implementer traces from automation audit §2.6. |
| **Verify** | Unit test with fixture timestamps; no network required. |
| **Cost** | $0 model. |

### B2 — Deadline runway → calendar ghost (deterministic)

| | |
|---|---|
| **Goal** | Task with hard due ≤48h, no work block / insufficient runway → propose a **calendar ghost** (existing ghost queue). Adam accepts or dismisses. |
| **Reuse** | `deadline_runway` / Productivity OS logic where possible; `calendar-ghosts-propose.mjs` + scheduled pattern (`calendar-ghosts-propose-scheduled.mjs` Sydney gate + `last_run`). |
| **Must** | Never move `due_date`. Never auto-accept ghosts. Deduplicate proposals. |
| **Must-not** | Call Anthropic. Nested agent turns. |
| **Schedule** | Daily Sydney morning window (same dual-UTC + gate pattern as ghosts), or extend existing propose pass with a Tasks runway section. Prefer **one** propose pipeline over a second cron if clean. |
| **Verify** | Unit: fixture task due tomorrow, no blocks → one ghost proposal shape. Fixture already blocked → no proposal. Integration against mock store if present. |
| **Cost** | $0 model. |

### B3 — Waiting-on follow-ups (deterministic drafts)

| | |
|---|---|
| **Goal** | Task with `waiting_on` older than N days (propose **N=5** unless Adam chooses otherwise) → follow-up **draft** on the calendar / ghost queue (same spirit as `promise-nudges-scheduled.mjs`). Never auto-send. |
| **Reuse** | `waiting_review` in `productivity-os.mjs`; `runPromiseNudges` pattern for queueing drafts. |
| **Must** | Draft only; Confirm/accept UX unchanged from ghosts/nudges. Cap per run (e.g. ≤10). |
| **Must-not** | Email/SMS send; LLM rewrite of every draft unless template insufficient. |
| **Schedule** | Daily, DST-safe Sydney gate (fix existing promise-nudges DST issue while touching it: gate on Sydney hour so it stays 07:00 after AEDT). |
| **Verify** | Unit: aged waiting_on → one draft; fresh waiting_on → none; cap respected. |
| **Cost** | $0 model (templates). |

### B — Explicit non-goals for first pass

- Morning Sweep Blobs cache.
- Resurrecting intuitive-scan / stress-flags.
- Daily Clare or Hammond Sonnet “be useful” turn.
- Cascading task archive on project close.
- Filtering done at the API.
- Putting Tasks blobs into `life-hub-data`.

---

## Suggested Cursor execution order (after Claude audits this plan)

1. Land **Step 0** docs on this PR (or immediately after).
2. Implement **Slice A** as its own PR with tests + Board screenshots (desktop + 390).
3. Implement **B1 → B2 → B3** as separate small PRs (heartbeat can be Life-only; B2/B3 Netlify scheduled / shared).
4. Only then revisit weekly judgment flags / Ann forecast / Teaching runner from `AGENT_AUTOMATION_AUDIT.md`.

---

## Cost tiers (reference — updated)

```text
Tier 0 — Deterministic (build these)
  existing ghosts · Remember · promise nudges ·
  Board Done retention (Slice A) · sweep heartbeat ·
  deadline runway ghosts · waiting-on follow-up drafts

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
