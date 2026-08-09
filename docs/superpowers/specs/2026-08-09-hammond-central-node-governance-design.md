# Hammond Central Node + Governance Log

**Date:** 2026-08-09  
**Status:** Approved for planning  
**Scope:** Hammond read/write Central Node, Governance Log (incl. Coach’s Notes), protocol→tool wiring, Cross-Agent directives via CN  
**Out of scope:** Goals database product; pushing directives into other agents’ live sessions; Sterling portfolio coaching

## Problem

Hammond’s Notion-era job is life governance: triage, cross-domain tension, major decisions, drift, escalation, closed-loop review, weekly review, goal audit, Direction Session, Coach’s Notes, and principle updates. In Life Hub today he can coach and run a phased CN audit in chat, and he receives a thin CN slice in the prompt — but he **cannot mutate** `central-node.md`. Compact write-back is chat prose only. Specialist logs are the only automated CN writers.

Life Hub is not Notion: there is no Governance Log page or Goals database. Those need a Life Hub–native mapping.

## Goals

- Hammond can read the **full** Central Node every turn (file is already fetched; other agents stay on the thin slice).
- Hammond can propose structured CN patches: upsert fields, append lines, replace/condense/delete sections.
- **Auto-apply** compact low-risk writes; **Confirm card** for high-risk writes.
- Durable **Governance Log** markdown holds protocol reasoning + Coach’s Notes; CN stays compact signals.
- Cross-agent instructions persist as `Hammond→[Agent]: …` in Cross-Agent (specialists pick them up because they already read CN).
- Update `hammond-protocol.md` so protocols end in tools, not “chat signal only.”
- Phased audit **lock** can persist (auto + Confirm as risk class dictates).

## Non-goals

- A full Goals database product (goals remain CN prose under This Month / related sections, editable via Confirm when material).
- Injecting open directives into another agent’s system prompt beyond CN.
- Auto-rewriting Purpose / Writing Rules / Agent Directory without Confirm.
- Changing Netlify timeout architecture (full CN inject must not add GitHub round-trips; file already loaded).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Record keeping | Central Node + Governance Log (not CN-only; not Goals DB) |
| Write UX | Auto compact signals; Confirm for bigger edits |
| Constraints | Auto additive flags; Confirm for removals/rewrites |
| Other agents | CN Cross-Agent lines only |
| Hammond CN prompt | Full `central-node.md` every Hammond turn |
| Coach’s Notes | Inside Governance Log |
| Approach | Confirm-card patches + Governance Log append tools |

## Architecture

```
Hammond chat turn
  → system prompt: full central-node.md + governance log recent tail + protocol
  → tools: propose_central_node_patch | append_governance_log | web_search
  → server classifies patch risk
       ├─ auto → write GitHub blob + SSE toast
       └─ confirm → candidate card → /api/chat/confirm (or dedicated confirm) → write
```

### Stores

| Path | Role |
|------|------|
| `central-node.md` | Live compact coordination hub (existing headings) |
| `data/governance/governance-log.md` | Append-oriented dated protocol + Coach’s Notes notebook |

### Tools

| Tool | Purpose |
|------|---------|
| `propose_central_node_patch` | Structured CN mutation; server assigns risk |
| `append_governance_log` | Append dated typed entry (always auto) |
| `web_search` | Existing |

No `log_entry` for Hammond.

## Central Node patch model

### Patch input (conceptual)

```json
{
  "section": "todays_status | constraints | this_week | this_month | long_term_trends | cross_agent | recent_actions | purpose | writing_rules | agent_directory",
  "op": "upsert_field | append_line | replace_section | delete_lines | condense",
  "payload": {
    "field": "Flags",
    "text": "…",
    "match": "optional existing line/bullet to target",
    "summary": "human-readable one-liner for Confirm / toast"
  }
}
```

Server maps `section` to canonical headings in `constraints.js` / CN writers. Hammond does **not** self-declare auto vs confirm.

### Risk classification (server)

**Auto-apply**

- `todays_status` + `upsert_field` / single-line replace for a known field (Flags, Energy, …)
- `cross_agent` + `append_line` for `Hammond→[Agent]: …`
- `recent_actions` + prepend/append one dated Hammond line
- `constraints` + `append_line` only (additive flag/bullet)
- `this_week` + `append_line` (short bullet, not full rewrite)
- All `append_governance_log` calls

**Confirm required**

- `constraints` + remove / rewrite / `replace_section` / `delete_lines`
- `this_month` material changes (incl. Active Goals notes/status)
- `long_term_trends` rewrite / condense / replace
- Any `replace_section`, multi-paragraph rewrite, or `delete_lines` / `condense` on Status/Week/Month/Trends
- `purpose`, `writing_rules`, `agent_directory` (any op)

### Confirm UX

Reuse chat Confirm card pattern: show `summary` + concise before/after or affected lines. Confirm → write `central-node.md` via GitHub. Dismiss → no write. Auto path emits a small SSE status/toast describing what landed.

### Condense / summarise

`op: "condense"` is first-class so Hammond can shrink Week/Month/Trends/Recent Actions under Writing Rules (e.g. purge stale Recent Actions past ~48h, collapse verbose Week bullets). High-risk → Confirm; if implemented as “append summary + delete matched stale lines,” still Confirm when deletes are involved.

## Governance Log

### Shape

```markdown
# Governance Log

## YYYY-MM-DD — Coach's Notes
…

## YYYY-MM-DD — Drift Detection
**Status:** Still Active | Resolved | Stale | Wrongly Framed | Awaiting Adam
**Domains:** …
**Summary:** …
**Open loop:** …
```

Entry types (align to Notion protocols): Coach's Notes, Session Triage, Cross-Domain Tension, Major Decision, Drift Detection, Escalation, Closed Loop Review, Weekly Review, Goal Audit, Direction Session, Principle Update.

**Append-oriented:** later entries reclassify open loops rather than rewriting prior entries.

### Prompt injection

Hammond receives a **recent tail** of the Governance Log (char/entry capped — exact cap in plan, e.g. last ~8–12 entries or ~8–12k chars) so Closed Loop Review works without loading an unbounded archive. Full-file search of the log is out of v1 unless needed; if needed, add `search_governance_log` later.

### Tool

`append_governance_log({ entry_type, title?, body, status? })` → prepend/append dated heading + body; write blob; return `{ ok, path }`. Always auto.

## Prompt / persona

- When `slug === 'hammond'`: inject **full** decoded `central-node.md` (not only Status/Cross-Agent/Recent Actions/Constraints).
- Other agents: keep today’s thin slice (Constraints + Status + Cross-Agent + Recent Actions).
- Timeout note: CN blob is already fetched each chat turn; full inject must not add GitHub reads. Digest remains today+yesterday only.
- Load Governance Log blob when Hammond; inject capped tail.
- Register Hammond tools when `slug === 'hammond'`.

## Protocol updates (`config/hammond-protocol.md`)

Replace “Life Hub persists CN from confirmed specialist logs today; your job is to make the signal explicit in chat” with:

1. After governance work that changes direction, drift, handoff, or open loops → `append_governance_log` with compact reasoning.
2. Emit compact CN signals via `propose_central_node_patch` (auto or Confirm as classified).
3. Cross-agent instructions → Cross-Agent `Hammond→[Agent]` lines (not private side-channels).
4. Long reasoning never dumped into CN.
5. Principle Update still cannot silently rewrite other agents’ rules or medical Constraints — Confirm + Adam.

Update phased audit lock contract: lock may persist patches + Governance Log entry; drop “do not invent a database write.”

Map all 11 Notion protocols to this tool pattern (reasoning in log, signals in CN). Weekly Review / Goal Audit / Direction Session / Closed Loop explicitly require Governance Log entries.

## Data flow / error handling

- Patch apply uses shared pure helpers (extend `central-node-write.js` or sibling module) so Confirm and auto share one mutator.
- Write conflicts → 409 / retryable toast (same GitHub pattern as skincare/catalog).
- Invalid section/op → tool_result error JSON; continue turn.
- Confirm expired / dismissed → no write; Hammond may repropose.
- Corrupt governance log → refuse overwrite; surface error (mirror catalog_corrupt posture).

## Testing

- Unit: risk classifier; patch ops (upsert field, append Cross-Agent, condense/delete); governance append parser/format; persona full-CN for Hammond vs thin for others.
- Integration: Hammond tool registration; auto write path; Confirm path; non-Hammond lacks tools; audit lock can emit patches.
- Browser/chat: Confirm card for high-risk CN patch; auto toast for low-risk.

## Success criteria

- Hammond chat can add a Cross-Agent directive that appears in `central-node.md` without a specialist log.
- Constraint additive flag auto-applies; Constraint removal requires Confirm.
- Goal Audit / Closed Loop leave a Governance Log entry and, when needed, CN updates.
- Full CN is present in Hammond’s prompt; Brisket/etc. still get the thin slice.
- No new GitHub fetch storm vs today’s chat load path.

## Follow-ups (later)

- Optional `search_governance_log` if the log grows large.
- Goals DB if prose under This Month proves insufficient.
- Direct agent-prompt injection of open directives (explicitly rejected for v1).
