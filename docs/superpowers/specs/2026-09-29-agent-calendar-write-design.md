# Agent calendar write (all agents) — design

**Date:** 2026-09-29  
**Repo:** `life-hub`  
**Status:** Approved direction (Adam). Spec for review before implementation.  
**Related:** `docs/superpowers/specs/2026-09-24-calendar-design.md` (ghosts + confirm-first).  
**Project notes:** store `docs/agent-calendar-all-write.md`

## Problem

Adam tells agents about real plans (breakfast place with Clare, food with Brisket, workout time with Chadwick) and gets refused. Only Hammond / Sara / Clare have `propose_calendar_ghost`, and the chat kinds are framed as skip-workout / bedtime / protect / move-or-create-task — not “put this on my calendar.” There is no chat Confirm binding for calendar ghosts, and no edit/cancel ghost kinds for existing Life calendar blocks.

## Outcome

Every personality agent can **propose** Life calendar creates and edits. Nothing writes until Adam confirms. Confirm happens **where he is**:

| Surface | Confirmation |
|---------|----------------|
| Chat | Confirm card |
| Calendar (pre-proposed or browsing) | Dashed ghost Accept (unchanged UX) |

A chat proposal **also** queues a dashed ghost so Tideline stays in sync. Confirm in chat **or** Accept on the calendar runs the **same** write plan and clears the pending ghost.

## Non-negotiables

- **Keep calendar ghosts exactly as they are** as the calendar surface (dashed chip, Accept/Dismiss, `acceptPlan`, queue file). No parallel “write to calendar” tool family.
- **One propose tool:** `propose_calendar_ghost` + `kind`. New abilities = new kinds, not new tools.
- **Confirm-first always** (create and edit). No silent calendar writes.
- **Hub calendars only** — no Google Calendar write in this work.
- Professional Meeting / Event create stays out of scope unless a later kind explicitly calls those repositories.
- Personas must **call the tool**, not say they cannot.

## Approach (chosen)

**A — One ghost tool, dual confirm surfaces.** Rejected: separate chat calendar tool (drift); silent writes (policy break).

---

## 1. Who gets the tool

Register `publish.calendar-ghost` / `propose_calendar_ghost` for **all** personality agents in `config/agents.yml`:

`brisket`, `chadwick`, `hyaluronica`, `penelope`, `sara`, `vera`, `hammond`, `ann`, `clementine`, `clare`

(Protocol / council voices stay out unless they already share a host agent’s tools.)

Capability JSON `agents` list and registry wiring (`capabilities/registry.mjs`) must match — no slug hard-gate that drops Brisket/Chadwick.

Allowlists: agents that may Accept-write Life `calendar_block` paths need the corresponding write globs (or Accept continues to run server-side under calendar-ghosts auth, same as today — prefer **server Accept path remains the writer**; agents only enqueue).

## 2. Kinds

### Keep (unchanged behaviour)

`skip_workout`, `bedtime`, `protect_block`, `move_task`, `create_task`, plus Almanac/comms kinds already in `GHOST_KINDS` (`draft_message`, `split_task`, `goal_rest_weeks`, `book_comm`) — do not redesign.

### Add (create)

| Kind | Meaning | Accept writes |
|------|---------|----------------|
| `outing` | Named Life plan with time (breakfast, dinner out, errand) | Life `calendar_block`: `kind: protected` or `corey` if `with: corey`; `status: tentative`; title + date + start/end; optional place in title or `notes` field on ghost |
| `schedule_workout` | Chadwick (any agent) books training time | Life `calendar_block` (`kind: focus` or dedicated workout-friendly kind already used on calendar) **or** update/create workout record path when `workoutPath` supplied — prefer block first; link workout in reason/title. Exact record shape: reuse existing Life validators. |
| `meal_block` | Brisket/Sara meal time on calendar | Life `calendar_block` titled for the meal (not a nutrition `meal` log — logging food remains `log_entry`) |

`outing` is the Clare breakfast case. `protect_block` remains for “keep this clear / Good night” Hammond semantics; agents should prefer `outing` for named social plans.

### Add (edit)

| Kind | Meaning | Accept writes |
|------|---------|----------------|
| `reschedule_block` | Move/resize an existing Life `calendar_block` | `life_record` update: path + new date/time/end_time/title as provided |
| `cancel_block` | Remove or mark cancelled | `life_record` update/delete per existing Life record conventions (prefer status/cancelled over silent delete if schema has it; else delete path used by Life today) |

Requires ghost fields: `path` (Life record path), plus for reschedule: `date`, `start`, `end`, optional `title`.

Task due moves stay `move_task`. Workout skip stays `skip_workout`.

## 3. Dual confirm

### Propose (chat tool)

1. Validate with `validateGhost` / `calendarGhostFromToolInput`.
2. Append to `pending-calendar-ghosts.json` (dashed ghost — **unchanged**).
3. Emit a **chat Confirm card** bound to the same ghost `id` (new binding: confirm payload references `calendar_ghost:<id>` or reuses propose-action shape that chat-confirm resolves by calling the same executor as `POST /api/calendar-ghosts` Accept).

### Confirm (chat)

`POST /api/chat/confirm` (or thin wrapper) loads the pending ghost by id → `acceptPlan` → same execution order as calendar Accept → mark ghost `accepted`. Discard → dismiss ghost (same as calendar Dismiss).

### Accept (calendar)

Existing `POST /api/calendar-ghosts` — unchanged behaviour. If chat already confirmed, Accept is idempotent (ghost already accepted → 200/no double write).

### Sync rule

Chat propose ⇒ ghost always. Calendar-only proposers (Almanac, Tideline ghost-proposer) ⇒ ghost only, no chat card.

## 4. Prompt / persona

- Capability one-liner: “Propose something on Adam’s calendar (outing, meal time, workout time, protect, tasks, reschedule/cancel). Queues a dashed ghost; Confirm in chat or Accept on the calendar.”
- Clare / Brisket / Chadwick / etc. system lines: when Adam states a plan with when/where, **call the tool** — do not refuse.
- Do not invent Professional meetings for Life outings.

## 5. Out of scope (this design)

- Google Calendar
- Silent auto-write
- Freeform “write arbitrary JSON to calendar”
- Professional `createMeeting` / `createEvent` kinds (separate product decision)
- Teaching lesson create
- Changing dashed-ghost visual language

## 6. Phased delivery

| Phase | Ships |
|-------|--------|
| **0** | Spec + tests inventory (this doc) |
| **1** | Tool for all agents; schema enum + prompts for `outing`; Accept plan for `outing`; chat Confirm binding for any pending ghost id |
| **2** | `meal_block`, `schedule_workout`; persona recipes |
| **3** | `reschedule_block`, `cancel_block`; list/resolve existing block path helpers for agents |
| **4** | Hardening: idempotent confirm/accept, decision log, refusal regression smokes per agent |

## 7. Verification

- Unit: `validateGhost` / `acceptPlan` for each new kind; chat-confirm applies same plan as calendar Accept; double confirm does not double-write.
- Integration: Clare “breakfast at X on date” → tool → pending ghost + confirm card → confirm → Life `calendar_block` present; calendar Accept path still works alone.
- Behaviour: Brisket / Chadwick / Clare prompts include tool; golden “must not refuse when plan has date/time.”
- UI: Confirm card in chat; dashed ghost on Tideline; both clear after either confirm surface.

## 8. Open implementation details (resolve in plan, not blockers)

- Exact `calendar_block.kind` values for `outing` / `meal_block` / `schedule_workout` (reuse `protected` / `focus` vs new enum values in `core/validate.js`).
- Whether cancel is soft-status or file delete.
- Confirm card wire format (extend propose-action vs dedicated `calendar_ghost` confirm kind).

---

**Adam approved approach A (2026-09-29).** Review this spec before implementation plans or code.
