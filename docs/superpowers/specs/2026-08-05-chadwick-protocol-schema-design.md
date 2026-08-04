# Chadwick Protocol + Richer Workout Schema (Slice 1) — Design

**Date:** 2026-08-05  
**Status:** Approved for planning  
**Approach:** B — versioned protocol doc in repo + schema/templates/Central Node wiring  
**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks.

## Context

Notion Chadwick was a full coaching OS (programming rules, K1 modes, EP protocol, library/log/entries). Life Hub today has Chadwick **voice**, a thin `workout` schema (`name` + `sets[{reps, weight_kg}]`), Fitness tab charts, and Central Node Day Type / Status / Recent Actions on confirm.

Slice 1 ports the **protocol + richer logging/template model** without the Exercise Library (slice 2) or research corpus.

Source material (Notion exports): Chadwick personality, Workout Log, Exercise Library (deferred), Body Measurements (out of scope here), Central Node.

## Goals

1. Chadwick operates from an editable **protocol markdown** injected into chat (voice stays in code).
2. Workout records capture K1-relevant actuals: **per-set cable type**, optional bench angle, session HR/calories/distance, inferred `session_kind`.
3. **Complete-only** Life Hub writes — design stays in chat until end-of-session logging.
4. **Templates**: first completion creates a template named from `title`; later completions with the same title **overwrite template defaults** with full actuals; session log remains day history.
5. Central Node: **read before design**; **write Status + Recent Actions + Day Type after finish**.
6. Unknown metrics (e.g. elevation) are **flagged as schema gaps**, never invented as YAML fields.

## Non-goals (slice 1)

- Exercise Library import/search (279 moves) — **slice 2**
- Research corpus for workout design
- Nightly scheduled “plan tomorrow’s workout”
- Mid-session / in-progress Life Hub records
- Live set editor UI on Fitness or full nested editors on the confirm card
- Showing attachment on every exercise (library owns stable setup later)
- Body-measurements migration
- Continuous GitHub push

---

## Architecture (Approach B)

```
config/chadwick-protocol.md     ← operating manual (git-versioned)
agent-directory.mjs voice       ← frat-boy persona only
chat.mjs                        ← load protocol when slug=chadwick; CN already loaded
workout schema + validate       ← rich session YAML
confirm                         ← session write → template upsert → CN sync
data/fitness/YYYY/MM/*.md       ← session history
data/fitness/templates/*.md     ← living prescriptions (private data repo)
```

Fitness tab and chart-kit keep working off weight×reps; richer fields are display/logging first.

---

## Data model

### Session log (`type: workout`)

Path pattern unchanged: `data/fitness/YYYY/MM/YYYY-MM-DD-<slug>.md`.

Written when logging finishes (`status: completed`, or `skipped` when documenting no session for Day Type).

**Session-level**

| Field | Required | Notes |
|---|---|---|
| `title` | yes (for template key) | Chosen in design chat |
| `date`, `day_type`, `status` | yes | Existing |
| `session_kind` | yes | `strength` \| `walk` \| `ep` \| `mobility` \| `other` — **inferred by Chadwick** |
| `focus` | optional | tags |
| `duration_min` | optional | structured when provided |
| `avg_hr` | optional | structured when provided |
| `calories_kcal` | optional | structured when provided |
| `distance_km` | optional | walks/cardio when provided |
| `recovery_flag_next_day` | optional | existing |
| `pain_flags` | optional | existing |
| body markdown | optional | PB / strength-score commentary, enjoyment, free notes |

**Per exercise**

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Matches library name later (slice 2) |
| `bench_angle_deg` | optional | When relevant; K1: `0` or `30`–`90` in 5° steps |
| `sets` | kind-dependent | Strength completed sessions need sets; walks may omit or use empty |
| intensification | optional | e.g. on exercise if logged (`drop_set`, `rest_pause`, `eccentric_overload`, …) |

Attachment / cable height **not required on the session** (stable library metadata in slice 2).

**Per set** (when sets exist)

| Field | Required | Notes |
|---|---|---|
| `reps` | yes | |
| `weight_kg` | yes* | `*`; bodyweight moves may use `0` or a documented convention — prefer `0` for BW |
| `cable_type` | yes | `constant_force` \| `concentric` \| `eccentric` \| `elastic` \| `rowing` \| `none` |

Cable type is **per set** (modes often change mid-exercise). Always present on generated/logged strength sets, even when default `constant_force` or `none`.

**Validation stance**

- Kind-aware: don’t force weighted sets on walks; don’t force `distance_km` on strength.
- Never invent YAML keys for unknown metrics; confirm still succeeds for known fields.

### Template (living prescription)

- Location (private data repo): `data/fitness/templates/<slug>.md` (slug from title; exact slugify rules in implementation plan).
- Payload: same exercise/set shape as a prescription (targets = last completed actuals after upsert).
- **Create** on first completion for that title.
- **Overwrite defaults** on later completions of the same title with **everything actually done** (weights, reps, set count, cable types, bench).
- Session file for that day is immutable history after write (edits via new confirm/overwrite path only if already supported).
- **Rename** via Chadwick chat or a later simple edit control (chat is enough for slice 1).

---

## Lifecycle

### Design (chat only)

1. Chadwick reads Central Node (Status, Cross-Agent, constraints, Recent Actions) before designing.
2. Protocol doc guides programming (warmup, focus, cable types, EP rules, etc.).
3. Adam and Chadwick iterate; title is usually settled in chat.
4. **No workout file** until logging.

### During session

Adam may adjust in AEKE / notes / memory. Life Hub has no in-progress record.

### End-of-session logging

Chadwick proposes `log_entry` from what Adam reported (actuals, duration, HR, calories, distance, notes, pain). Adam confirms.

### On successful confirm

1. Write session under `data/fitness/...`
2. Upsert template by title (create or overwrite defaults)
3. Central Node: Today’s Status (Exercise) + Recent Agent Actions + Cross-Agent Day Type (+ genuine extra flags only when needed)

### “Do X again”

Load template X → adjust in chat for today → train → log → new session history + template refreshed from actuals.

### Schema gaps

If Adam mentions a metric with no field (e.g. elevation), Chadwick states it isn’t in the workout book yet and should be designed later; logs everything that fits.

---

## Protocol doc

### Path

`config/chadwick-protocol.md` in the Life Hub app repo (allowlisted like other config for sync/read).

### Contents (transform from Notion; drop DB mechanics)

Include: core job; aesthetic / knee / back rules; EP coordination; how to write workouts; K1 modes + intensification; logging protocol; template behaviour; Central Node read/write rules; schema-gap behaviour; walk/EP consistency.

Exclude: Notion database/relation instructions; nightly auto-plan (optional “future” note only); Exercise Library rows; research corpus.

### Injection

- Load when active agent is `chadwick` (including after router inference to Chadwick).
- Inject into `buildSystemPrompt` as the operating manual.
- Voice remains in `agent-directory.mjs`.
- Missing file → degraded mode (voice + schema only); do not fail the whole chat hard if avoidable.

### Edits

Revise markdown in git; next Chadwick chat after config sync/deploy picks up changes without rewriting voice code.

---

## Central Node policy

| When | Behaviour |
|---|---|
| Before design | Read Status, Cross-Agent, constraints, Recent Actions (already partially wired; ensure Chadwick prompt stresses using it for programming) |
| After completed session | Write **Today’s Status (Exercise)** + **Recent Agent Actions** + **Chadwick→Brisket Day Type** (existing helpers; keep full sync) |
| Extra flags | Only for real cross-agent needs (repeated pain → Sara, etc.) |

Supersedes the old Notion rule “do not update Today’s Status / Recent Actions.”

---

## UI impact (thin)

### Confirm card

- Nested `exercises` remain non-editable in the card for slice 1.
- Prefer a **read-only summary** of exercises/sets (including cable types) on the proposal card if cheap.
- Corrections via chat re-propose.

### Fitness tab

- Render cable type and bench when present.
- Charts/e1RM continue to use finite weight×reps; walks without weights don’t break volume/PR logic.
- No template browser or live logger in slice 1.

### Schema-gap UX

- Chat reply (required); optional Recent Actions / Cross-Agent line — no admin UI.

---

## Session kinds (one type, inferred kind)

All activity uses `type: workout` with `session_kind`:

- `strength` — AEKE / weighted work  
- `walk` — duration / distance / HR  
- `ep` — Veronica / EP sessions  
- `mobility` — yoga / mobility  
- `other` — fallback  

Logging stays consistent; field presence varies by kind.

---

## Success criteria

1. Chadwick chat loads protocol doc and uses Central Node before design guidance.  
2. Confirm persists rich workout YAML (per-set `cable_type`, optional bench/HR/calories/distance, inferred `session_kind`).  
3. First completion creates template from `title`; same-title later completions refresh template from full actuals.  
4. Central Node gets Status + Recent Actions + Day Type after finish.  
5. Unknown metrics flagged, not invented.  
6. Fitness tab renders without regressions; tests green + new coverage for schema/protocol/template upsert.  
7. Local commits only unless Adam asks to push.

## Risks

- Protocol prompt size — keep trimmed; no library dump.  
- Template identity by title — renames must avoid silent forks.  
- Confirm card limited for nested edits.  
- Kind-aware validation complexity.  
- Don’t port Notion page/relation choreography literally.

## Follow-on

**Slice 2:** Exercise Library import + search for design.  
Later: research corpus, template browser UI, nested confirm editors, nightly planning if desired.

## Decisions log (brainstorm)

| Topic | Decision |
|---|---|
| Schema richness | Structured core + optional extras |
| Cable type | Per set; always stated (incl. `none`) |
| Attachment | Not shown on every session; library later |
| Planned records | None until complete |
| Templates | Auto from completed; upsert by title; overwrite defaults from full actuals |
| First template name | Session title from design chat |
| Session extras | Structure duration, avg_hr, calories_kcal; PB commentary in notes |
| Walks/EP | Same `workout` type; inferred `session_kind` |
| Unknown metrics | Flag for later schema design |
| Central Node writes | Status + Recent Actions + Day Type |
| Central Node reads | Before design |
| Implementation approach | B — protocol markdown + schema |
