# Agent Capability Layer — Design

**Date:** 2026-08-31  
**Status:** Phase 0–4 on main; Phase 5 in progress (surface widget renderer)  
**Scope:** Open generation / closed execution for Life Hub agents (`os.propose-action`), per-agent path allowlists, capability registry, migrate existing chat tools as shortcuts, Remember/Track/Coordinate loans, research + widgets, intuition packs, intent router, shortcut promotion + promoted-shortcut catalog runner, hub rendering for approved widget templates  
**Out of scope (not started):** Additional widget templates beyond `challenge-progress`; writing live capability defs into `capabilities/` from Confirm; separate cheap intent-router model if same-call keyword narrow proves insufficient

## Thesis

Agents previously only knew how to talk (plus a closed list of tools). A finite verb catalog only moves the wall. The fix is **open generation, closed execution**: any agent can draft an arbitrary durable action at runtime, but nothing executes until Adam confirms the concrete diff. `os.propose-action` is the default path; named shortcuts are fast lanes for frequent actions.

Safety comes from:
- per-agent **path allowlists** (not per-verb approval weeks in advance)
- proposals as **inert declarative data** (no shell, network, or code)
- **Confirm shows the real diff**
- every executed/rejected proposal lands in the **Governance Log**

Persona voice is unchanged.

## Glossary (keep separate)

| Term | Means |
|------|--------|
| Capacity | Ability to make a durable change (`os.propose-action` + shortcuts) |
| Skill | How well an agent performs inside a capacity (persona / training) |
| Built intuition | Standing priors (`/intuition/` in Phase 3) — judgment, not availability |
| Resourcing | Read-only reach (search, libraries, digests) |
| Surfaces | Where output lands (Confirm, CN, tabs, Governance Log) |

## Phase 0 deliverables

1. `/capabilities` tree: schema, registry, `propose-action.json`, migrated shortcuts, per-agent allowlists
2. Runtime loader (`buildAgentTools`) replaces hardcoded tool lists in `chat.mjs`
3. `os_propose_action` tool: allowlist check → pending queue → Confirm card with diffs → confirm writes + Governance Log
4. Protocol + persona line: agents never claim they lack the ability to act
5. Existing shortcuts keep verbatim behaviour (`log_entry`, CN patch, governance append, food/exercise library saves)

## Layout

```
/capabilities
  schema.json
  registry.json
  propose-action.json
  allowlists/{agent}.json
  log/log-entry.json
  publish/cn-patch.json
  publish/governance-log-entry.json
  lookup/save-food-library.json
  lookup/save-exercise-library.json
```

Handlers live under `netlify/functions/_shared/capabilities/`.

## Acceptance (Phase 0)

- Ask any agent for something with no matching shortcut → Confirm card with visible path diffs (not a refusal)
- Existing meal/workout logging still works via `log_entry`
- Write paths outside the agent allowlist never reach Confirm

## Locked decisions (Adam, 2026-08-31)

1. **Capability loans / Confirm** — Loan inherits the lower risk class. If Brisket's ask is auto-risk, Hammond does not re-Confirm.
2. **Capability scoreboard** — Surfaced when useful (agent would otherwise refuse, or Adam asks what they can do). Not a standing always-on command.
3. **Expiring research TTL** — Per-domain defaults (clinical vs retail pricing decay at different rates), not a flat 30 days.
4. **Intuition edits** — Agents may edit intuition files directly (e.g. Sara updates flare rules after a bad week).
5. **Widget templates** — Add one at a time as needed; Adam approves each template before any agent can publish with it.
6. **Intent router** — Prefer a first pass inside the same Anthropic call before persona voice (one round-trip, lower latency/cost) unless measuring shows a separate cheap call is clearly better.
7. **Challenge close disputes** — When auto-judge ≠ Adam's sense of the week, the owning agent proposes a revised verdict for Confirm (Adam does not own the rewrite himself).

## Phases 1–3

**Implemented:** Remember/Track/Coordinate loans, research + surface widgets, intuition packs + intent router + shortcut promotion (`os.promote-shortcut` drafts for Confirm; `intuition.edit-pack` auto for owners).

See the full thesis in the originating brief: Remember/Track/Publish P0 shortcuts + capability loans; research artifacts + surface widgets; intuition packs + intent router + shortcut promotion.

## Phase 4

**Implemented (PR #45):** Promoted-shortcut catalog runner.

- `os.promote-shortcut` — Confirm writes a draft under `data/os/promoted-shortcuts/`
- `os.list-promoted-shortcuts` — auto list of catalogued drafts
- `os.run-promoted-shortcut` — replay draft `example_writes` as a Confirm propose-action
- Scoreboard (`os.capability-scoreboard`, detail on) surfaces catalogued promoted shortcuts

Live `capabilities/registry.json` stays PR-only. No runtime handler codegen.

## Phase 5

**In progress:** Hub renderer for Adam-approved surface widgets.

- `GET /api/surface/widgets` — list published instances under `data/widgets/` for approved templates only
- Fitness tab renders `challenge-progress` as a progress bar card (design-kit tokens / existing `.progress-track`)
- Unknown or unapproved templates stay invisible until a template def + renderer lands in a PR

