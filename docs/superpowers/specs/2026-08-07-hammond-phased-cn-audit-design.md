# Hammond phased Central Node audit

**Date:** 2026-08-07  
**Status:** Approved for planning (pending Adam review of this file)  
**Goal:** Run weekly/monthly Central Node audits as a multi-turn Hammond session so each Netlify `/api/chat` call stays short, intake answers shape later phases, and compact CN signals land in chat without one mega-reply stalling out.

## Problem

A single “Hammond, audit the Central Node” turn asks for triage + stale + drift + open loops + non-negotiable in one Anthropic completion. Even with adaptive thinking disabled, a full audit can approach Netlify’s function wall-clock budget (~10–26s). Long turns surface as stalled “Thinking…” / cut-off empty replies. Hammond’s operating manual already prefers triage as a gateway and Direction Session as one question at a time; the product was collapsing that into one dump.

## Decision

**Structured audit session state (approach C)** with protocol wording as the soft layer:

1. Glance Central Node  
2. Compact Session Triage  
3. Intake questions (concerns / how Adam feels / goals & thinking) — cap 3  
4. Remaining protocol phases in separate turns, shaped by intake  
5. Lock with one non-negotiable + compact CN write-back lines in chat  

v1 does **not** auto-chain turns, does **not** add Continue chips, and does **not** patch `central-node.md` without a future Confirm path. Hammond states compact CN lines in chat only.

## Trigger

Start (or resume) a CN audit session when the routed agent is `hammond` and the user message matches audit intent, for example:

- “Central Node audit” / “CN audit”  
- “weekly review” / “weekly audit”  
- “monthly audit” / “goal audit”  

Exact matcher lives in shared code (case-insensitive substring / light phrase list). Non-matching Hammond chats behave as today (no phase contract).

If Adam is already mid-session (`auditSession` present and sticky Hammond), continue that session even if the new message is a short answer (“worried about work”, “feeling flat”) rather than re-triggering triage.

## Phases

One Netlify turn = one phase. Server injects a hard **phase contract** into the Hammond system prompt for that turn.

| Phase id | Hammond may produce | Hard stop |
|----------|---------------------|-----------|
| `triage` | Glance CN; Session Triage (presenting issue, domains, stakes, cross-domain tension, drift signals, decision weight, follow-on protocols) — compact; then **exactly one** intake question | No stale inventory, drift essay, open-loop list, or lock yet |
| `intake` | Acknowledge answer; store meaning in reply; ask next intake question **or** advance when intake complete | Max **3** intake questions total across `triage` + `intake` (concerns, feeling, goals/thinking). No full audit dump |
| `stale_drift` | What’s stale + what’s drifting, using CN + intake | Compact; at most one clarifying ask if blocked |
| `open_loops` | What matters this week/month | Compact |
| `lock` | One non-negotiable objective; compact CN write-back lines (Flags / Cross-Agent / Recent Actions wording) | End session |

### Intake topics (order preferred)

1. Open concerns  
2. How Adam is feeling / capacity  
3. Current goals or thinkings that should colour the audit  

Hammond may skip a topic if Adam already covered it unprompted. Cap remains 3 questions, not 3 mandatory empties.

### Phase advancement

- Client owns `auditSession` and advances `phase` after a successful turn completes (`done`, no stream error), using rules below.  
- Server may also echo `auditPhase` / suggested `nextPhase` in a small SSE event so client and prompt stay aligned; if omitted, client advances from local rules only.

Advancement rules:

- After `triage` → `intake` (unless intake already satisfied in the triage turn’s single question and Adam’s next message is clearly “skip intake / go on” — then jump to `stale_drift`).  
- After each `intake` turn: if intake question count &lt; 3 and Hammond asked another question → stay `intake`; if Hammond signals intake complete or count hits 3 → `stale_drift`.  
- After `stale_drift` → `open_loops`.  
- After `open_loops` → `lock`.  
- After `lock` → clear `auditSession`.

Adam can abort by changing agent, starting a non-audit Hammond ask (“just tell me the protein target”), or an explicit “cancel audit” / “stop audit”. Clear session in those cases.

## Session state shape

Held in the chat client (in-memory for the open chat thread; not required to persist across full page reload in v1):

```ts
{
  agent: 'hammond',
  kind: 'cn_audit',
  phase: 'triage' | 'intake' | 'stale_drift' | 'open_loops' | 'lock',
  intakeCount: number,      // questions asked so far (0–3)
  startedAt: number
}
```

Each `/api/chat` request that is part of the session includes:

```json
{
  "message": "…",
  "priorAgentSlug": "hammond",
  "history": [ /* existing transcript window */ ],
  "auditSession": { "kind": "cn_audit", "phase": "intake", "intakeCount": 1 }
}
```

Server validates: only accepted when routed slug is `hammond` and `kind === 'cn_audit'` and `phase` is a known id. Invalid/missing session → no phase contract (normal Hammond).

## Prompt contract

When `auditSession` is valid, append a short block to the Hammond system prompt, e.g.:

- You are mid Central Node audit.  
- **This turn’s only job:** `<phase instructions>`.  
- Do not run later phases in this reply.  
- Prefer under ~400 words unless Adam asked for more detail.  
- Intake answers already in history must shape interpretation; do not ignore them.  
- On `lock`, emit compact CN lines Adam could paste/confirm later; do not invent a fake database write.

Also update `config/hammond-protocol.md` with a **Central Node audit (phased)** section describing the same sequence for soft compliance when session state is absent but Adam clearly asked for an audit (first turn should still prefer triage + one question).

## Timeout / latency

- Keep Anthropic `thinking: { type: 'disabled' }` (already shipped).  
- Phase contract must forbid mega-replies.  
- Soft target: complete each phase turn well under Netlify’s configured function timeout (prefer &lt;15s wall clock).  
- Empty-turn / cut-off recovery remains as today if a single phase still fails.

## Central Node write-back (v1)

- **In scope:** Hammond speaks compact Flags / Cross-Agent / Recent Actions lines in the `lock` turn.  
- **Out of scope:** Automated `central-node.md` mutation, Confirm card for CN patch, Clare Morning Sweep changes.

## Out of scope (v1)

- Auto-chaining the next phase without Adam sending a message  
- Continue chips / structured answer buttons  
- Persisting `auditSession` across reload / devices  
- Non-Hammond agents using phase sessions  
- Raising Netlify timeout via invalid `netlify.toml` keys  

## Testing

- Unit: trigger detection; phase contract text per phase; request validation rejects auditSession for non-Hammond.  
- Unit/integration: chat handler includes phase block only when session valid.  
- Live smoke (optional): start audit → answer 1–2 intake turns → stale_drift → open_loops → lock; assert each turn has text, `done`, no error, and triage turn does not contain a full open-loops dump.  
- Protocol load test: Hammond protocol markdown includes phased audit section.

## Success criteria

1. A CN audit never requires a single function call to produce the full weekly/monthly report.  
2. Intake answers visibly influence `stale_drift` / `open_loops` / `lock` wording.  
3. Adam can cancel or divert without a stuck session.  
4. No new Confirm/CN write path in v1 — chat lines only on lock.
