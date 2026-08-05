# Chadwick Workout Builder Reliability

**Date:** 2026-08-06  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Adam’s symptoms:

1. Chadwick returns a full workout as **chat text only** — no Confirm / Save card — so nothing lands on Fitness as an editable planned session (sets/reps logger).
2. Or he “thinks” / researches / builds mid-turn and goes quiet until Adam re-prompts — often after exercise-library tool use.

Root causes:

| Cause | Detail |
|-------|--------|
| Fire-and-forget `save_exercise_library_entry` | Same class as the old Brisket food-library bug: `executeTools` returns `null` → Anthropic turn stops before `log_entry`. |
| Protocol / persona conflict | Job says “stay in chat until lock onto Fitness”; Logging says design/build → `planned` `log_entry`. Model often narrates instead of proposing. |
| Confirm is mandatory | Chat markdown has no path to Fitness; only a confirmed `planned` file mounts the logger. |

Fitness hero / logger / post-confirm `force` refresh are **not** the primary bug once a planned file exists.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Approach | **1** — continue after exercise-library save + align prompts so design/build ends in `planned` proposal |
| Safety net | **2 as flow clause** — if a turn ends after library activity with no `record_proposal`, show a short chat nudge |
| Central Node | Strengthen: Chadwick must **read and visibly use** relevant CN context when building (not silent acknowledgment) |
| Confirm gate | Keep Confirm — do **not** auto-write without Adam confirming |
| Out of scope | Auto-skip Confirm; Finish-button races; raising `MAX_TOOL_ROUNDS` unless tests prove exhaustion |

## Design

### 1. Continue anthropic rounds after exercise library save

Mirror `save_food_library_entry`:

- Handle `save_exercise_library_entry` inside `executeTools` in `chat.mjs`.
- On success: write GitHub file, emit `exercise_library_saved`, return JSON tool result so the client continues a second Anthropic round.
- On invalid / write failure: return JSON `{ ok: false, error }` without throwing.
- Remove the fire-and-forget `else if` branch from the stream loop (or fold emit into `executeTools` only).

Integration test: multi-round mock `search_exercise_library` → `save_exercise_library_entry` → `log_entry` (planned) → assert `record_proposal` (and/or follow-up text) arrives after `exercise_library_saved`.

### 2. Prompt / protocol: design → Confirm card

**`config/chadwick-protocol.md`**

- Fix Job §1 / “stay in chat” so it does **not** block proposing when Adam asked to design/build today’s session.
- Logging rule becomes the source of truth: when the plan is ready in that turn, call `log_entry` with `status: planned` (full exercise list, `cable_type` on every strength set). Chat hype/cues stay in the message; the record is what mounts Fitness after Confirm.
- Keep: no mid-session / in-progress writes; completed/skipped only when logging actuals.

**`persona.mjs` (Chadwick blocks)**

- Hard line: designing/building today’s session **must** end with a `planned` `log_entry` in that turn when the prescription is ready. Chat-only workout lists do **not** appear on Fitness.
- Clarify vs shared “only propose what Adam clearly described”: for **planned** sessions Chadwick is allowed (and required) to propose the prescription he just designed with Adam, including library-backed defaults — not invent completed actuals.

### 3. Flow clause (approach 2) — client nudge

In `chat-controller.js`, for a turn that:

- saw at least one `exercise_library_saved` (or Chadwick agent + long assistant text without proposal — keep the signal tight: prefer **library-saved without proposal**), and
- never received `record_proposal`,

append a short assistant/system-style ephemeral or sticky-ish chat line, e.g.:

> “That stayed in chat only — ask me to lock it onto Fitness so you get a Confirm card.”

Or Chadwick-voiced one-liner if easier. Clear with normal chat flow. Session-only; no persistence.

Do **not** invent a fake proposal card from markdown.

### 4. Central Node — read and use

Already injected into the prompt; strengthen so building uses it:

- Protocol **Before designing**: keep hard rules; add that the **planned** `log_entry` / chat pitch must reflect at least one concrete CN-derived adjustment when Status or Cross-Agent has a relevant flag (nutrition rough day, Sara pain, recent training, EP tomorrow) — or briefly state why CN did not change the plan (“CN clear — normal load”).
- Persona Chadwick CN line: upgrade from “explicitly use” to **must shape the prescription** (exercise choice, volume, or Day Type intensity) and **mention that influence in the chat reply** when proposing.

No new CN fetch path required if `centralNodeLog` is already non-empty for Chadwick turns.

## Edge cases

| Case | Behavior |
|------|----------|
| Design still iterative (“what about swapping X?”) | Stay conversational; propose `planned` when Adam accepts a concrete plan or asks to build/lock today’s session |
| `log_entry` fails validation (`cable_type`, etc.) | Existing `record_rejected` banner; Chadwick should fix and re-propose (continuation already available after library save) |
| Confirm discarded | Fitness unchanged (today) |
| No exercise library tools used, text-only plan | Prompt rules still require `log_entry`; nudge may not fire (library-gated) — acceptable if P0/P1 prompts work |

## Testing

- Integration: exercise save continuation + eventual `record_proposal`.
- Unit: persona / protocol strings include must-propose + CN-use language (existing persona tests).
- Unit: chat-controller nudge when `exercise_library_saved` without proposal.
- Full `npm test`; SW bump only if client JS changes (`chat-controller.js`).

## Success criteria

- After “build today’s workout,” Adam gets a **Confirm** card in the same turn (or after library tools), not only markdown.
- Mid-research silence after exercise-library save is gone (turn continues).
- Confirming mounts the Fitness planned logger with sets/reps.
- Chadwick’s build visibly accounts for Central Node context when relevant.
