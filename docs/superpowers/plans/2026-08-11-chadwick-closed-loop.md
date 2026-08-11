# Chadwick Closed-Loop Coaching — Implementation Plan

**Date:** 2026-08-11
**Repo:** `/Users/adamrussell/Documents/Claude/Projects/life-hub` (branch off `main`)
**Deploy rule:** Local commits only. **Never `git push`.** Adam pushes himself.
**Scope:** Phases 1–6 below. Hammond arc-ownership is explicitly **out of scope**.

---

## Context for a fresh session

Chadwick Flexington is the fitness agent in Life Hub (a private PWA: static client + Netlify Functions + GitHub-as-database). His voice lives in `netlify/functions/_shared/agent-directory.mjs`; his operating rules live in `config/chadwick-protocol.md` (injected into his system prompt).

**Adam's goal:** Tom Holland physique — ~8% body fat, high shoulder-to-waist taper. Currently 86.3kg / 19.5% BF / 39.9kg skeletal muscle.

**The core diagnosis driving this work:** Chadwick is an *open loop*. He programs sessions and logs them, but:
- **No body data reaches his prompt** — he optimises an aesthetic outcome he cannot observe.
- **No per-exercise history reaches his prompt** — he coaches progressive overload while blind to last session's weights.
- **Exercise library progress fields are never auto-updated** on confirm, so any rule depending on them is fiction.
- **Templates reach the prompt as one line** (title/kind/date), so "let's do X again" makes him confabulate the exercises.
- **He is silent during the workout** — the phone is propped on the K1 for 25 min and he says nothing between sets.

Fix those and he stops being a session generator and becomes a coach with feedback.

### Key facts already verified (do not re-derive)

| Fact | Value |
|---|---|
| Test baseline | **780 passing** (`npm test`), 0 failing |
| Test runner | `node --test`, no framework. `tests/unit/*.test.js`, `tests/integration/*.test.js` |
| Browser tests | `npm run test:browser` (Playwright-style specs, `--test-concurrency=1`) |
| Fixture check | `npm run validate:fixtures` |
| SW cache | `service-worker.js` line 1, currently `life-hub-shell-v61` |
| Measurement schema | `js/core/validate.js:25` — **already includes `shoulders` and `waist`** |
| Composition schema | `js/core/validate.js:22` — `weight_kg`, `body_fat_pct`, `skeletal_muscle_kg`, `visceral_fat_level`, `body_age` |
| Prompt builder | `netlify/functions/_shared/persona.mjs` → `buildSystemPrompt({...})`, Chadwick block starts line ~61 |
| Chat digest window | `netlify/functions/chat.mjs:167` — **today + yesterday only**, deliberately (Netlify budget) |
| Template prompt format | `netlify/functions/_shared/workout-templates.mjs:76` — one line per template |
| Confirm path | `netlify/functions/chat-confirm.mjs` |
| Exercise library | `netlify/functions/_shared/exercise-library.mjs`, data at `data/exercise-library.json` (private data repo) |

### Hard constraints — read before writing code

1. **Netlify function budget is the binding constraint.** `chat.mjs:166` carries an explicit comment: a full week of blob reads "routinely ate the Netlify budget before Anthropic produced a reply." **Never add an unbounded GitHub blob read to the chat path.** Prefer: derive from already-fetched data, read a single pre-aggregated file, or extend an existing fetch — never a new per-request loop over many blobs.
2. **`netlify.toml` `included_files`** — any *new* config/markdown file the functions read at runtime **must** be added to that array or it will not exist in the deployed bundle.
3. **Service worker precache** — if you add or newly import a client-side `js/` module, add it to `service-worker.js`'s precache list **and bump `CACHE_NAME`**. This repo has broken offline reload twice this way (see `docs/IMPLEMENTATION_STATUS.md` Phases 6 and 7). Walk the transitive import graph.
4. **Never invent YAML fields** outside the record schema. Schema changes are deliberate edits to `js/core/validate.js` + tests.
5. **Confirm gate stays.** Agents never silently auto-save structured records; Adam confirms every card.
6. Zero runtime dependencies in the client. Hand-rolled SVG/geometry, no chart libraries.
7. Document each completed phase in `docs/IMPLEMENTATION_STATUS.md` in the existing style (verified test counts, deviations, gotchas).

---

## Phase 1 — Close the progression loop *(highest leverage; do first)*

**Problem:** `last_performed`, `times_performed`, `working_weight_kg`, `best_weight_kg` in `data/exercise-library.json` are never written on confirm. Everything downstream depends on them.

**Build:** In `chat-confirm.mjs`, when a `workout` record with `status: completed` is confirmed, upsert each logged exercise back into the library:
- `last_performed` = session date
- `times_performed` += 1
- `working_weight_kg` = heaviest working set this session
- `best_weight_kg` = `max(existing, this session)` — **capture whether this beat the old best; return it in the confirm response** (Phase 4 needs it)

**Notes:**
- Match exercises by the same identity/normalisation `upsertExerciseLibraryEntry` already uses. Do not create duplicate rows for case/whitespace variants.
- Only `completed` triggers this. Never `planned` or `skipped`.
- **Must not break confirm.** Wrap in try/catch — a library-write failure logs a warning and still returns success for the record write. Follow the existing Central Node best-effort pattern in the same file.
- Single read + single write of the library JSON. No per-exercise round trips.

**Tests:** unit for the upsert/PB math (new best, tied best, first-ever, bodyweight `0`); integration that a completed confirm updates the library and a failed library write still returns confirm success.

---

## Phase 2 — Give Chadwick eyes: body state + per-exercise history + real templates

Three prompt-injection additions. All must respect the Netlify budget.

**2a. Body state block.** Inject latest `composition` + `measurements` into Chadwick's prompt (`persona.mjs` chadwickBlocks): current weight, body fat %, skeletal muscle, latest tape, and the deltas vs the previous reading. Also compute and inject the **shoulder-to-waist ratio** (`shoulders / waist`) with its trend and the gap to target (see Phase 3).
- Source it from data already loaded for the request where possible. If a bounded extra read is unavoidable, read only the most recent 1–2 body records — never a full history scan.
- Add a protocol rule: Chadwick must reference body trend when it's relevant to what he's programming, and must not claim training alone drives fat loss (that's Brisket's constraint to own).

**2b. Per-exercise recent actuals.** For exercises Chadwick is likely to program, inject the last ~3 actuals (date, weight, reps). Prefer deriving from library fields written in Phase 1 plus the existing highlights, rather than reading session blobs. If richer history is needed, extend `search_exercise_library`'s tool result to include recent actuals — tool results are cheap because they're pull-based, not injected into every prompt.

**2c. Fix templates.** `formatTemplatesForPrompt` currently emits one line per template. Either (preferred) include the exercise list + last actuals for the **top few** templates, or add a `get_workout_template` tool Chadwick calls when Adam says "do X again." **Do not dump all templates in full** — that's a prompt-size regression. Then update the protocol's Templates section, which currently tells him to recall sessions "from what you remember of it" — a promise he cannot keep today.

**Tests:** persona unit tests that each block appears for `chadwick` and never for other agents; ratio math unit tests (including missing/zero measurements → no crash, omit block).

---

## Phase 3 — The physique objective (shoulder:waist ratio)

Make the goal a tracked number rather than a vibe.

- Add target config (e.g. `config/physique-target.yml`): target ratio (~1.6), target body fat %, and current-vs-target gap. **Add the file to `netlify.toml` `included_files`.**
- Compute current ratio from the latest `measurements` record. No schema change needed — `shoulders` and `waist` already exist.
- Surface the ratio + trend to **Chadwick and Brisket** prompts (Hammond deferred).
- Optional if cheap: show it on the Body tab. If it touches client JS, bump the SW cache.

**Protocol:** Chadwick uses the ratio to name the **binding constraint** — if waist is the limiter, he says so and defers to Brisket rather than prescribing more sets. This is the honesty mechanism that stops him selling volume for a nutrition problem.

---

## Phase 4 — Earned hype + adherence intervention

**4a. PB reaction.** Using Phase 1's returned PB flag, Chadwick must call out a genuine personal best specifically and loudly when one lands ("2.5kg over your best on that move, ever"). Protocol rule + persona line. This is the payoff of Phases 1–2: specific hype instead of generic.

**4b. Adherence.** Adam's documented failure mode (`central-node.md`): *"2 consecutive skips = full motivation reset"*, and his only external accountability anchor (EP with Veronica) is gone.
- Chadwick already receives workout streak via the digest. Add **days since last session** to his prompt.
- Protocol rule: at **2+ missed days**, he leads with it and *lowers the bar hard* — offer a 10-minute single-lift session or a walk, never a guilt trip and never the full programmed session. Getting Adam moving beats getting him optimal.

---

## Phase 5 — Mid-session presence *(the novel one — read carefully)*

**The insight:** the protocol says *"Never write mid-session / in-progress logs."* That was a **data-hygiene** decision (one file per day) that accidentally became a **coaching** decision. Presence and persistence are separable — Chadwick can speak during the session without writing a record.

**Mechanism (do it this way — it costs zero extra API calls during the workout):** when Chadwick proposes the `planned` session, he **also generates per-exercise coaching cues and hype lines**. The Fitness logger (`js/app/fitness-logger-controller.js`, `js/app/render-fitness-logger.js`) displays the right line at the right moment — on starting an exercise, during rest, on the final set ("1–2 reps in the tank, this is the one that counts").

- **Do not** call the chat function per set. Latency and Netlify budget make that a non-starter.
- This requires a **deliberate schema addition** for cue text on the planned exercise (e.g. `coach_cues`) — add it properly to `js/core/validate.js` with tests. It also **contradicts the current protocol line** "cues belong in chat, never as invented fields" — that line must be amended to carve out this one real, schema-backed field. Do not leave the protocol self-contradictory.
- Client JS changes → **precache + `CACHE_NAME` bump** (currently `v61`).
- Keep the no-mid-session-*writes* rule intact. Presence only.

**Tests:** validate.js unit tests for the new field; logger controller unit tests for cue selection/timing; a browser test that a planned session with cues renders them.

---

## Phase 6 — Protocol lint + the two honest flags

**6a. Deterministic lint at confirm.** `config/chadwick-protocol.md` is ~210 lines of rules enforced only by model attention. Add a mechanical check on proposed workouts and surface violations as a **warning on the confirm card** (not a hard rejection — Adam can override):
- `cable_type` present on every strength set
- 5–9 exercises
- ≤2 exercises carrying an intensification tag
- warmup present
- (optional) each focus muscle getting ≥3 hits

**6b. Two protocol corrections (small, do them anyway):**
- **Focus math doesn't close.** 3 focuses × 3 hits = 9 moves inside a 20–30 min window (5 of which is warmup) is ~2 min per exercise — not achievable. Amend `config/chadwick-protocol.md` "How to write a workout": **3 focuses only on `workout_45_60` days; 2 focuses is the default on 30-minute days.**
- **`web_search` is capped at `max_uses: 2`** (`netlify/functions/chat.mjs:185`). The protocol's new "Using evidence and external sources" section asks him to research physique programming; 2 uses is one lookup. Raise it for Chadwick (4–5), keeping other agents unchanged.

---

## Sequencing & verification

Phases are ordered by dependency: **1 → 2 → 3 → 4**, then **5** and **6** independently.

Phase 1 unlocks 2b and 4a. Phase 3 depends on 2a's body plumbing. Phase 5 and 6 can be done any time after 1.

**After every phase:**
```bash
npm test && npm run validate:fixtures
```
Expect ≥780 passing, 0 failing. Run `npm run test:browser` for any phase touching client JS (5, possibly 3). Bump `CACHE_NAME` on any client JS change. Commit locally per phase with a clear message; **do not push**. Update `docs/IMPLEMENTATION_STATUS.md` when a phase completes.

**Ask Adam before:** any change to the confirm gate, deleting/rewriting existing history files, or a schema change beyond the `coach_cues` addition scoped in Phase 5.
