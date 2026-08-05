# Editable Fitness Session (Core Logger)

**Date:** 2026-08-05  
**Status:** Approved  
**Parent:** Planned workout on Fitness; StrengthLog-inspired active logging  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Confirming a planned workout only lands a read-only Fitness hero. During the session Adam needs StrengthLog-style editing (sets, weights, reps, cable, bench, session notes) on the Fitness tab, light autosave, and a finish control — without burning Netlify deploy tokens or writing on every keystroke.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| UI slice | **A · Core logger** (timer, set rows, + Set, notes, finish). No rest timer / warm-up rows / PR chips / anatomy map / instruction sheets. |
| Persistence | **Local-first + debounced planned autosave** (~45s idle and/or `visibilitychange` → hidden), not per-keystroke. |
| Notes | **Session notes only** (markdown body / confirm `notes`). No per-set notes in v1. |
| Entry | If today’s hero is **`planned`**, Fitness **is** the logger (no separate Start). |
| Finish | **Fitness button** writes `completed` **and** Chadwick chat finish still works. |
| Backend | **Reuse `/api/chat/confirm`** with overwrite for planned saves and completed finish. |

## Behaviour

1. **Hero resolution unchanged:** today completed → today planned → last completed → empty.
2. **When hero is `planned`:** render the active logger bound to that session (not the read-only exercise list).
3. **When hero is `completed`:** keep today’s read-only hero (existing display).
4. **Empty:** existing empty copy (ask Chadwick to plan).
5. **Edits:** update an in-memory draft + `localStorage` draft keyed by date + path/title immediately.
6. **Autosave:** after ~45s without edits, or when the document becomes hidden, if the draft differs from last successful sync, call confirm with `status: planned`, same path, `overwrite: true`. Show a quiet “Saving…” / “Saved” affordance — not a blocking modal.
7. **Finish (“Pump finished” / “Cardio finished”):** flush any pending draft, confirm with `status: completed` and current actuals (`overwrite: true`), clear local draft, refresh Home/Fitness. Template + Central Node side effects use existing completed confirm path.
8. **Chadwick finish:** unchanged — propose `completed` → confirm overwrite. After refresh, hero becomes read-only completed.
9. **Netlify:** autosave hits Functions + private GitHub data repo only. It must **not** require or trigger app deploys.

## UI (Fitness tab)

Inspired by StrengthLog’s active log, adapted to Life Hub (Chadwick blue accent, existing soft-medical shell):

- **Header strip:** session title, `session_kind`, elapsed **session timer** (starts when logger mounts for today’s planned; wall-clock from first open is fine for v1 — no need to persist timer across devices).
- **Exercise cards** (one per exercise): name; optional bench angle control when the exercise has / needs `bench_angle_deg`; set table columns: set #, weight (kg), reps, `cable_type` (select from schema enum); **+ Set** appends a set cloning the last row’s cable/weight defaults.
- **Session notes:** single textarea bound to session notes body.
- **Finish CTA:** `session_kind === 'strength'` → **“Pump finished”**; all other kinds → **“Session finished”**.
- No decorative cards beyond exercise rows needed for interaction; follow existing Fitness visual language.

## Data flow

```
planned record (events)
    → buildFitnessModel.heroSession
    → logger draft (memory + localStorage)
    → debounced chatApi.confirm({ candidate, slug, overwrite: true })  // status planned
    → Finish → confirm status completed → onRecordWritten / refresh
```

- Candidate shape matches existing chat confirm schema (nested `exercises` / `sets` must be accepted — confirm card historically skipped nested edits in the UI, but the API already validates full workout records).
- Slug / path: derive from the existing planned file path (same day + title rules as confirm today).
- Collision: overwrite is intentional for same-day planned→planned and planned→completed.

## Error handling

- Autosave failure: keep local draft; show non-blocking “Couldn’t save — will retry”; retry on next debounce / hide / finish.
- Finish failure: keep logger open with draft; surface error; do not clear draft.
- Offline: local edits continue; autosave skips until online; finish blocked with clear message if offline.
- Session expired: existing app session expiry flow.

## Out of scope (v1)

- Rest timer, warm-up sets, PR chips, muscle map, exercise instruction modal, special sets
- Per-set notes (schema add later)
- Mid-session `in_progress` status (stay on `planned` until finish)
- New Netlify endpoints (reuse confirm; extend client candidate builder to send full `exercises` / `sets`)
- Skincare tab

## Verification

- Unit: draft merge, debounce scheduling, candidate build from logger state, finish label by `session_kind`
- Integration: confirm overwrite planned; confirm completed after finish
- Manual: plan with Chadwick → Fitness editable → edit sets → wait/hide → refresh still shows edits → finish → read-only completed + CN/template behaviour

## Follow-ups

- Slice B: rest timer, warm-up rows, PR chips
- Per-set notes schema
- Skincare tab
