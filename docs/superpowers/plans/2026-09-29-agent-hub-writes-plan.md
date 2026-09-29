# Agent hub writes (all gaps) — Implementation Plan

> **For agentic workers:** Implement task-by-task. Prefer shared infrastructure over one-off tools.

**Goal:** Every personality agent can propose the hub writes Adam already does in the UI — calendar plans, communications, people notes, meetings/events, tasks, goals, travel, knowledge pages, etc. — via **chat Confirm when directed** and **dashed calendar ghost when time-bound / suggestive**, never silent.

**Architecture:** Keep `propose_calendar_ghost` for timed Life calendar kinds. Add typed propose tools (or kinds) for non-calendar domains that land as Confirm cards and, when they have a date/time, also enqueue a calendar ghost. Chat Confirm and calendar Accept share one executor per kind (idempotent).

**Tech Stack:** Netlify Functions, `ghost-writes.js` / `calendar-ghosts.mjs`, `chat-confirm.mjs`, Professional repositories, Tasks blobs, Life data repo.

## Global Constraints

- Teaching Hub out of scope.
- No silent writes; Confirm card and/or ghost Accept required.
- Ghost UX unchanged; extend kinds + agents only.
- No Google Calendar.
- Prefer one tool family per surface; new ability = new kind/action, not freeform JSON dumps.
- Gap #7 (log communication) is P0.

---

## File map

| Area | Files |
|------|--------|
| Ghost kinds + Accept plans | `packages/design-kit/js/calendar/ghost-writes.js`, tests |
| Ghost tool schema + all agents | `hammond-tools.mjs`, `capabilities/publish/calendar-ghost.json`, `capabilities/registry.mjs` |
| Chat → ghost + Confirm bridge | `chat.mjs`, `chat-confirm.mjs`, `calendar-ghosts.mjs` |
| Log communication | new `capabilities/comms/`, `clare-comms` / new tool handler, `communication-repository.mjs` |
| People notes / observations / orgs | `people-agent.mjs`, propose-changes capability |
| Meetings / events | ghost kinds or propose tools → meeting/event repositories |
| Tasks all agents | `capabilities/tasks/create.json` agents `*` |
| Goals / travel / knowledge / templates / career / almanac / prefs | typed propose tools + confirm executors |

---

## Task 1: Calendar — all agents + outing/edit + chat Confirm bridge

- [ ] Extend `GHOST_KINDS` + `acceptPlan` for `outing`, `meal_block`, `schedule_workout`, `reschedule_block`, `cancel_block`
- [ ] Register `propose_calendar_ghost` for all personality agents; broaden schema enum + description
- [ ] Chat Confirm kind `calendar_ghost` that calls same Accept executor as `POST /api/calendar-ghosts`
- [ ] On chat propose: queue ghost **and** emit Confirm card
- [ ] Tests + commit

## Task 2: P0 — Log communication (#7)

- [ ] Tool `propose_log_communication` (Clare, Hammond, Ann, all agents if directed)
- [ ] Payload: direction, channel, occurred_at/scheduled, subject, summary, people refs
- [ ] Confirm → `createCommunication` + links; if timed, also calendar ghost chip
- [ ] Remove / override persona “cannot edit communications” for **create log**
- [ ] Tests + commit

## Task 3: People depth + observations + organisations

- [ ] Extend `propose_people_changes` (notes, LinkedIn, workplace, profile fields)
- [ ] `propose_observation`
- [ ] `propose_organisation_changes` (create/rename/aliases)
- [ ] Tests + commit

## Task 4: Meetings / events / ties / career

- [ ] Ghost or propose kinds → meeting/event repositories
- [ ] Accept/decline tie proposals from chat Confirm
- [ ] Career application / future propose
- [ ] Tests + commit

## Task 5: Tasks all agents + goals

- [ ] `create_task` agents `*`
- [ ] `propose_goal` / `propose_goal_checkin` / someday→goal
- [ ] Tests + commit

## Task 6: Travel, knowledge, templates, almanac, prefs

- [x] Travel item/check-in propose
- [x] Knowledge page create/patch (Clementine)
- [x] Save workout template (Chadwick)
- [ ] ~~Almanac anchor propose~~ — **out of scope this PR**: alm- ghosts already exist for Goals/Almanac product paths; freeform agent “hold this date” needs Almanac product design (anchor schema + UI Accept) beyond calendar dual-surface. Revisit in a dedicated PR.
- [x] Constraints / hub-prefs narrow patch (`propose_hub_prefs`; bedtime stays ghost; Constraints stay CN patch)
- [x] Tests + commit

## Task 7: Glue + refusal regression

- [x] Persona lines: call tools, don’t refuse when plan has when/where/who (`CALENDAR_WRITE_GUIDANCE`)
- [x] Smokes / unit coverage for top intents
- [ ] `pre-pr-check`, docs update, PR

---

## Verification (global)

- Unit per kind: validate → confirm → record exists; double confirm no double write
- Chat Confirm and calendar Accept both clear the same pending ghost
- Clare breakfast / log email / Chadwick workout time / Brisket meal time smokes
