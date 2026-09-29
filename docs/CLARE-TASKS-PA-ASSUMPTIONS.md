# Clare / Tasks PA assumptions — audit brief

**Date:** 29 Sep 2026  
**Status:** Assumptions tested; **no implementation yet**. Adam asked Cursor to stress-test the framing before racing ahead.  
**Audience:** Claude Code (and Cursor) when asked to **audit**, **critique**, or **scope** Clare / completed-task archive / proactive personal-assistant automation.

**Related (read with this, do not replace):**

| File | Role |
|------|------|
| [`docs/AGENT_AUTOMATION_AUDIT.md`](AGENT_AUTOMATION_AUDIT.md) | Canonical inventory of what already runs, what’s broken, recommended daily/weekly cheap loop |
| [`life-hub-data/config/automations/README.md`](https://github.com/adamrussell91-hash/life-hub-data/blob/main/config/automations/README.md) | Live Cursor Automations on the private vault (~47 runs/month) |
| [`apps/tasks/config/clare-protocol.md`](../apps/tasks/config/clare-protocol.md) | Clare’s promised behaviour (includes a scheduled Haiku pass that **does not run**) |
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

- These are **two different problems** (task lifecycle vs proactive PA loop), not one Clare component.
- Clare is the right **Tasks operator**, not the sole **holistic PA**.
- “More automation that thinks” is the expensive failure mode. Most useful prep already exists as **deterministic** code that isn’t scheduled or finished.

Do **not** treat a daily full-agent Sonnet morning as the default design. Prefer the tiered loop in `AGENT_AUTOMATION_AUDIT.md` §4–§5 and the corrections below.

---

## How to audit (Claude Code)

When Adam asks you to audit this topic:

1. Read **this file** end to end.
2. Re-verify claims against current `main` (grep / read; do not assert from chat memory alone). Key seams:
   - Completed tasks: `apps/tasks/src/views/board.ts`, `apps/tasks/src/views/archive.ts`, `netlify/functions/tasks.mjs` (`mergeTask`), `netlify/functions/_shared/clare-work.mjs` (`complete_task` / `trash_task`)
   - Clare proactive surfaces: `netlify/functions/_shared/clare-desk.mjs`, `productivity-os.mjs`, `apps/tasks/config/clare-protocol.md`
   - Schedules: `netlify/functions/*-scheduled.mjs`, `life-hub-data/config/automations/`
3. Check whether any assumption below has been **invalidated** by later code (e.g. retention filter shipped, Morning Sweep cache exists).
4. Write findings under `docs/` only if Adam asks for a written report — preferred name: `docs/CLARE-TASKS-PA-AUDIT-REPORT.md` (or append a dated Status section to this file).
5. **Do not implement** archive or new crons from this brief alone unless Adam explicitly chooses a slice (A or B below) and asks for a build.

---

## Assumption tests

### 1. “Clare is the agent for tasks / this work”

| | |
|---|---|
| **Accurate** | Clare owns Tasks capture, desk, dump, complete/trash, Productivity OS tools, Morning Sweep. |
| **Weak** | “Archive” and weekly life governance are not Clare’s. `#/archive` is **projects**, not completed tasks. Hammond owns Central Node sweeps, Weekly Review prep, Confirm queue. Vault Cursor Automations are Hammond/Sara/Chadwick/Hyaluronica — Clare has rarely/never written CN in the automation audit history. |
| **Correction** | Clare = Tasks operator + morning organiser. Hammond = cross-hub conductor. Do not bolt “holistic PA” onto Clare alone. |

### 2. “Completed list grows → we need correct archiving (probably via Clare)”

| | |
|---|---|
| **Accurate** | Done tasks accumulate forever. Board Done keeps them; `listTasks` / GET `/api/tasks` return the full index; there is no retention/prune job. That feels like a lengthening completed list. |
| **Weak** | Product vocabulary already uses “archive” for something else (project graveyard; Backlog “Archive” soft-kills to `status: dead`). Framing this as Clare “archiving” invites an AI Confirm loop for a hygiene problem. |
| **Code facts (verify)** | Marking done sets `status: 'done'` + `completed_at`. Board filters `dead` only, not old `done`. Archive view filters archived **projects**. Clare has `complete_task` / `trash_task`, no archive/prune completed tool. Closing a project does not cascade-complete or hide child tasks. |
| **Correction** | First fix is **product/API filter + retention policy**, not an agent. e.g. Board Done = last 7 days / this week; older done stay stored for metrics but leave the active surface. Optional weekly Confirm batch later. Clare is not the archivist of record. |

### 3. “Useful PA = pre-emptive forecasting / organising / suggesting across hubs → needs automation”

| | |
|---|---|
| **Accurate** | Without scheduled or event-driven work, the system stays reactive (open Clare → she thinks). |
| **Weak** | Equating that with “an intelligent agent turn on a cron” is the dollars-a-day failure mode. Cheap loop already designed: precompute Morning Sweep, deadline/waiting ghosts, Hammond prepare→Confirm, weekly Haiku flags — mostly Tier‑0 deterministic. |
| **Protocol debt** | `clare-protocol.md` promises a scheduled Haiku intuitive pass; code under `apps/tasks/src/{ai/intuitive-judge,domain/intuitive-scan,domain/intuitive-digest}.ts` is test-only; no umbrella cron (see automation audit §2.4). Tasks `AGENTS.md` still mentions hourly `intuitive-scan` — confirm whether that function exists on current `main`. |
| **Correction** | Automation yes; **LLM automation sparingly**. Intelligence = rules + deltas + Confirm cards. Chat/Sonnet when Adam engages. |

### 4. “Often enough to be useful, not so often it costs dollars/day”

| | |
|---|---|
| **Accurate / strength** | Best constraint in the brief. Matches About Me / audit: prepare and queue, never nag. |
| **Already partly true** | Caps exist (ties ≤40, tidy ≤20 pages, career 1×/week). ~47 Cursor Automations/month on the vault. Deterministic ghosts/Remember/nudges are free. |
| **Weakness** | Cost risk today is less “Clare thinks too much” and more: silent miss (Hammond sweep outage days with no heartbeat), protocol lies, stale Constraints if Confirm isn’t fed. Wasted *value*, not only wasted tokens. |
| **Correction** | Optimise for **missed value and stale truth** first; then bound Haiku weekly; keep Sonnet rare. |

### 5. “This is one component”

| | |
|---|---|
| **Weak** | Bundling archive hygiene with holistic PA makes one fuzzy epic. Different owners, data planes (Netlify Blobs vs `life-hub-data`), and success metrics. |
| **Correction** | Split: **(A) Task completion lifecycle** (Tasks hub, mostly no AI). **(B) Cost-aware proactive loop** (tiered schedule in automation audit). Ship A without waiting on B. |

### 6. “Holistically across all hubs”

| | |
|---|---|
| **Strength** | Right end-state: one mailbox (CN + Confirm + Cross-Agent), not N nagging bots. |
| **Weak** | Today: Clementine CN-isolated; Teaching lesson AI jobs have no runner; Clare rarely touches CN; specialists already own domain briefs. “Holistic Clare” fights that architecture. |
| **Correction** | Cross-hub PA = **orchestration + stale detection** (Hammond conducts), not one agent reading everything every morning. |

---

## SWOT (compressed)

- **Strengths of Adam’s framing:** Real pain (Done pile); real desire (proactive help); hard cost ceiling; Clare as Tasks face is directionally right for *tasks* UX.
- **Weaknesses:** Over-attributes to Clare; conflates UI retention with “archiving”; assumes intelligence ⇒ LLM cron; one-component framing.
- **Opportunities:** Cheap wins already designed — filter Done, cache Morning Sweep, restore weekly Haiku flags (or delete the protocol lie), deadline/waiting ghosts, sweep heartbeat.
- **Threats:** Daily Sonnet “PA”; silent automations that fail unnoticed; Confirm queue that never gets proposals; more protocol promises that don’t run.

---

## Corrections to accept before any build

1. Archive growth ≠ Clare failure → **missing task lifecycle / default filters**.
2. Proactive PA ≠ more Clare thinking → **schedule deterministic prep + rare bounded AI + Confirm**.
3. Holistic ≠ one agent → **Hammond conducts; Clare runs Tasks; specialists stay specialists**.
4. Measure success as: Done column stays short; morning desk is ready without a chat; Confirm cards appear when truth is stale; monthly AI spend stays flat — **not** “agent wrote a brilliant essay.”

---

## Recommended slices (when Adam chooses to build)

### Slice A — Task completion lifecycle (mostly no AI)

1. Define contract: open/in_progress → `done` (+ `completed_at`) → off active Board after N days (still in store) → optional history view.
2. Default Board / list consumers: exclude done older than retention window (or `include_completed=recent|all`).
3. Align project-close semantics (prod vs mock) if still diverged; decide cascade for children of closed projects.
4. Optional later: Clare/Productivity OS “Clear Done” Confirm batch — never silent hard-delete.

### Slice B — Cost-aware proactive MVP (from automation audit)

Tier‑0 first: Morning Sweep cache (~06:45), deadline runway ghosts, waiting-on follow-ups, sweep heartbeat.  
Then Tier‑1: weekly Clare Haiku flags **or** remove the protocol promise; Ann→Hammond teaching forecast.  
Do **not** start with a daily full Clare/Hammond Sonnet turn.

---

## Cost tiers (reference)

```text
Tier 0 — Deterministic (cron freely)
  ghosts · Remember · promise nudges · Morning Sweep cache ·
  runway/waiting ghosts · day brief · Productivity OS · CN roll/hygiene

Tier 1 — Bounded Haiku (scheduled, capped)
  Knowledge tidy · Clare intuitive flags (weekly) · Ann teaching-load one-liner

Tier 2 — Bounded Sonnet (weekly / capped nightly)
  ties · career scan · person-brief on demand only

Tier 3 — Cursor Automations on life-hub-data
  Hammond sweep / Weekly prep / Sara / Chadwick / monthly → Confirm queue

Tier 4 — Interactive chat only (chat-run background)
  Full Clare / Hammond / specialists with tools + Confirm cards
```

---

## What this brief is not

- Not a licence to implement without Adam picking slice A or B.
- Not a replacement for `AGENT_AUTOMATION_AUDIT.md` schedule tables.
- Not a personality rewrite of Clare.
- Not permission to put task blobs in `life-hub-data` / `knowledge-hub-data` (Blobs remain source of truth for Tasks).
