# Chadwick Exercise Library (Slice 2) — Design

**Date:** 2026-08-05  
**Status:** Approved for planning  
**Approach:** 1 — Mirror Food Library (single JSON + Chadwick search/save tools)  
**Deploy rule:** Local commits only. Do **not** `git push` unless Adam explicitly asks.

## Context

Slice 1 shipped Chadwick’s protocol, rich workout schema (per-set `cable_type`, bench, session extras), complete-only logging, and workout templates. Session exercise `name` is free text; attachment / stable setup was deferred to the library.

Notion export: **279** Exercise Library rows (CSV + per-page markdown) under `~/Downloads/Private & Shared 5/`. Useful fields are dense for name / equipment / target / focus; setup cues and weights are sparse. Only two moves are flagged `In rotation: Yes`.

Closest existing pattern: Food Library (`data/food-library.json`, prompt injection, `save_food_library_entry`).

## Goals

1. Import the Notion Exercise Library into Life Hub as a durable, searchable catalogue Chadwick uses when designing sessions.
2. Keep a short **highlight** list in Chadwick’s system prompt; expose the full catalogue via a **search** tool.
3. Let Chadwick **add/update** library entries via a save tool (same spirit as Food Library).
4. Give library-owned setup defaults a home: `attachment`, `default_cable_type`, optional `default_bench_angle_deg`.
5. Prefer library names when logging so session `exercise.name` stays aligned over time (soft convention, not a hard FK).

## Non-goals

- Fitness-tab library browser or editors
- Auto-updating library stats (`last_performed`, working weight) on workout confirm
- Research corpus / nightly auto-plan
- Hard validation requiring every logged exercise name to exist in the library
- Dumping all 279 full records into every Chadwick prompt
- Continuous GitHub push

---

## Architecture

```
Notion CSV (one-shot)
        │
        ▼
scripts/import-exercise-library.mjs  →  data/exercise-library.json  (private data repo)
                                              │
                    chat.mjs (Chadwick only) ─┤
                                              ├─ load JSON once per request
                                              ├─ inject ~20 highlights into system prompt
                                              ├─ tool: search_exercise_library (in-memory filter)
                                              └─ tool: save_exercise_library_entry → GitHub upsert
```

| Piece | Role |
|---|---|
| `netlify/functions/_shared/exercise-library.mjs` | Path constant, parse, validate, upsert, search, highlight selection, prompt formatting, tool schemas |
| `netlify/functions/chat.mjs` | Load library for Chadwick; register tools; handle save writes |
| `netlify/functions/_shared/persona.mjs` (or Chadwick prompt builder) | Inject highlights + usage instructions for Chadwick only |
| `scripts/import-exercise-library.mjs` | CSV → validated JSON |
| Private data repo `data/exercise-library.json` | Canonical live library |
| Test fixtures | Small representative JSON (+ CSV row mapping tests) |

**Path policy:** Chat-direct load/write (same class as `data/food-library.json` and workout templates). **Not** included in the dated client sync manifest. No Fitness UI or `service-worker` shell changes required unless a new client module is added (none expected).

---

## Data model

**File:** `data/exercise-library.json` — JSON **array** of objects.

**Identity / upsert key:** case-insensitive trimmed `name` (unique).

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Canonical move name |
| `target_area` | yes | Prefer Arms / Back / Chest / Core / Full Body / Glutes / Legs / Shoulders; unknown strings allowed on save so Chadwick can extend |
| `equipment` | optional | Normalized to `string[]` |
| `focus_areas` | optional | `string[]` (muscles) |
| `setup_cues` | optional | Free text |
| `in_rotation` | optional | Boolean; default `false` when absent |
| `default_sets` | optional | Number |
| `default_reps` | optional | Number |
| `working_weight_kg` | optional | Number |
| `best_weight_kg` | optional | Number |
| `attachment` | optional | Stable setup (e.g. bar, smart_handle) — library-owned, not required on session logs |
| `default_cable_type` | optional | Same enum as session sets: `constant_force` \| `concentric` \| `eccentric` \| `elastic` \| `rowing` \| `none` |
| `default_bench_angle_deg` | optional | Number |
| `movement_pattern` | optional | Sparse from Notion |
| `demo_link` | optional | URL string |
| `last_performed` | optional | ISO calendar date `YYYY-MM-DD` |
| `updated_at` | set on save | ISO timestamp |

### Import mapping (Notion CSV → JSON)

| Notion column | Field |
|---|---|
| Exercise | `name` |
| Target area | `target_area` |
| Equipment | `equipment` (split on commas, trim) |
| Focus areas | `focus_areas` (split on commas, trim) |
| Setup & cues | `setup_cues` |
| In rotation | `in_rotation` (`Yes` → true, else false) |
| Default sets / Default reps | `default_sets` / `default_reps` |
| Current working weight kg | `working_weight_kg` |
| Best weight kg | `best_weight_kg` |
| Movement pattern | `movement_pattern` |
| Demo link | `demo_link` |
| Last performed | `last_performed` (parse to `YYYY-MM-DD` when possible; omit if unparseable) |

Empty cells omitted. Attachment / cable / bench defaults are **not** in the CSV; Chadwick (or a later curated edit) fills those via save.

### Highlights

1. Include every entry with `in_rotation: true`.
2. Fill remaining slots up to **20** by `last_performed` descending (missing dates sort last).
3. Prompt lines are compact: name, target, equipment, working weight, rotation flag — not full cues.

---

## Chadwick tools & prompt

### Prompt block (Chadwick only)

Injected after protocol + templates when the library is non-empty (or always with an empty-library note if preferred — prefer omit block when empty).

Instructions:

- Prefer Exercise Library names when designing and when calling `log_entry`.
- Check highlights first; call `search_exercise_library` before inventing a move or guessing cues / attachment / cable defaults.
- After refining cues, defaults, or adding a new move, call `save_exercise_library_entry`.
- Do not invent YAML fields outside the workout schema; library defaults inform design, session sets still carry per-set `cable_type`.

### `search_exercise_library`

| Input | Required | Notes |
|---|---|---|
| `query` | yes | String; case-insensitive |
| `target_area` | no | Filter |
| `in_rotation` | no | Boolean filter |
| `limit` | no | Default 10, max 25 |

**Match:** AND semantics — `query` tokens match across name / target_area / equipment / focus_areas / setup_cues. Additional filters narrow the set.

**Return:** Compact objects including name, target, equipment, focus, cues, defaults, rotation, weights when present. Uses the library already loaded for the request (no extra GitHub round-trip per search).

### `save_exercise_library_entry`

- Input schema mirrors the data model; required: `name`, `target_area`.
- Validate → upsert by name key → set `updated_at` → write entire JSON blob to GitHub at `data/exercise-library.json` (create-or-update with sha, same as food library).
- On success, emit a small SSE/client event (parity with `food_library_saved`).
- Invalid input or write failure: soft-skip; do not break the streamed reply.

### Agent scoping

Only Chadwick receives the library prompt block and these two tools. Other agents unchanged.

---

## Import & operations

1. Run `scripts/import-exercise-library.mjs` against the Notion `_all.csv` (path via CLI arg).
2. Write/commit the resulting JSON into the **private data repo** as `data/exercise-library.json`.
3. Keep a **small** fixture library in the Life Hub test tree for unit/integration tests.
4. Re-import is allowed later for recovery; day-to-day updates go through Chadwick’s save tool.
5. Workout confirm does **not** mutate the library.

---

## Error handling

| Case | Behavior |
|---|---|
| Missing library blob | Empty array; omit highlights; search returns []; Chadwick still chats |
| Corrupt JSON | Treat as empty (same spirit as food library parse) |
| Invalid save payload | Skip write; continue stream |
| GitHub save failure | Soft fail; continue stream |
| Empty search | Return empty list |

---

## Testing

- **Unit:** parse, validate, upsert identity, search filters, highlight ordering (rotation first then recency), prompt formatting, CSV row → entry mapping.
- **Integration:** Chadwick chat loads library; search tool returns matches; save upserts blob; non-Chadwick agents do not get tools/prompt.
- **No new browser UI tests** (no UI in this slice).

---

## Relationship to Slice 1

- Session schema unchanged: per-set `cable_type` remains on the log; library `default_cable_type` / `attachment` / bench defaults guide design only unless Chadwick copies them into the logged session.
- Templates and protocol stay as-is; library is an additional Chadwick context source.
- Protocol may later mention “search the Exercise Library” in a small follow-up edit if needed for voice consistency — optional in implementation plan if prompt instructions already cover it.

---

## Decisions locked

| Topic | Choice |
|---|---|
| Primary job | Chadwick design aid (no Fitness library UI) |
| Access | Hybrid: ~20 highlights in prompt + search tool |
| Writes | `save_exercise_library_entry` (and one-shot import) |
| Storage | Single `data/exercise-library.json` |
| Entry fields | Core coaching + attachment / cable / bench defaults |
| Highlights | `in_rotation` first, fill to 20 by `last_performed` |
| Confirm path | No automatic library updates |
| Implementation approach | Mirror Food Library |

---

## Follow-on (out of scope)

- Fitness browse UI
- Confirm-time last-performed / working-weight sync
- Research corpus
- Nightly planner
- Stricter session name ↔ library matching (optional later)
