# Agent behaviour acceptance

**Date:** 2026-09-06  
**Branch:** `cursor/agent-retrieval-behaviour-542f`  
**Status vocabulary (only):** Demonstrated | Failed | Blocked | Not started  

**Rule:** A capability counts only when the agent independently recognises applicability, retrieves required context, uses the correct tool or server pack, interprets the result, states missing evidence honestly, and completes the task without Adam pasting data already stored in Life Hub. Registration / schema attachment alone is not evidence.

---

## Live demonstration matrix (this environment)

| Agent | Ordinary prompt | Pack active | Tools executed (server) | Answerable | Conversational turn via `chat.mjs` | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Chadwick | How has my training been going lately? | yes | 7 fitness/body tools | yes | Blocked — `ANTHROPIC_API_KEY` unset | Pack **Demonstrated**; conversation **Blocked** |
| Brisket | How's my nutrition looking this week? | yes | 5 nutrition tools | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Sara | Is my weight change unusual lately? | yes | body + weight + medical | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Penelope | Have I been feeling like this often? | yes | diary search/range/themes | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Vera | What patterns across recent sessions? | yes | mind search + compare | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Hyaluronica | Is my routine actually helping? | yes | adherence + response evidence | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Clare | What should I focus on today? | yes | tasks focus + open loops | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Ann | Help me improve tomorrow's Year 10 lesson | yes | teaching search/context/diagnosis | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Clementine | What do I already know about cognitive load? | yes | knowledge search + synthesis | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |
| Hammond | What is slipping across my life? | yes | hub inspect + attention pack | yes | Blocked — same | Pack **Demonstrated**; conversation **Blocked** |

**Store used for pack demos:** `/agent/repos/life-hub-data/data` (local functioning Life Hub data clone) via `scripts/agent-evidence-live-demo.mjs`. Artifacts: `/opt/cursor/artifacts/agent-evidence-live/`.

**Exact conversational blocker:** `ANTHROPIC_API_KEY` is not present in this Cloud Agent environment (`printenv` length 0). Without it, `chat.mjs` cannot run a genuine model turn. Pack assembly does not require the model and was run against the real store.

---

## What changed (runtime)

1. **Server-side evidence packs** (`netlify/functions/_shared/evidence-packs.mjs`) — on domain intents the runtime retrieves evidence *before* the model runs. Tool schemas are no longer the only activation path.
2. **Domain analysis helpers** (`domain-analysis.mjs`) — remaining day macros, period compares, diary themes, mind multi-session compare, skincare response windows, tasks open loops, teaching diagnosis, knowledge synthesis, Hammond attention pack.
3. **Activation policy** broadened (incl. hyaluronica “actually helping”).
4. **`chat.mjs`** injects `evidencePackBlock` into the system prompt; forces `tool_choice: any` only when the pack is not yet answerable.
5. **Surface unification** — `assembleClareEvidence` / `assembleAnnEvidence` / `assembleClementineEvidence` reused from Clare desk and Knowledge chat turn (same read competence as Life chat).

---

## Automated proof

| Suite | Result |
| --- | --- |
| `tests/unit/agent-evidence-packs.test.js` | 32/32 pass — broad retrieval, empty store honesty, small-talk negative control, weight conflict, surface adapters |
| `tests/unit/agent-retrieval-behaviour.test.js` + orchestration acceptance | 31/31 pass (combined with evidence packs: 63/63) |

These tests do **not** mock model tool selection as proof of activation. They assert server pack assembly from ordinary wording.

---

## Traceability (mechanism → behaviour)

| Mechanism | Runtime effect | Status |
| --- | --- | --- |
| ECC iterative retrieval | Pack + continuationTools when truncated/missing | Demonstrated (pack layer) |
| Evidence proof gates | Sections kind-tagged record/calculation/missing/truncated/conflict | Demonstrated |
| Visible truncation | truncated kind + continuation candidates | Demonstrated |
| User evidence > inference | Pack instructions + conflict flags | Demonstrated |
| Deterministic calculations | Fitness/nutrition/tasks math via existing models | Demonstrated |
| Surface unification Clare/Ann/Clementine | Shared pack adapters on desk / knowledge chat | Demonstrated (read path) |
| Live conversational E2E | Requires Anthropic | **Blocked** |

---

## Honest completion line

**Not complete for Adam’s full bar** until each agent has a genuine conversational turn through its user-facing route with the model present. Pack retrieval against a functioning store is **Demonstrated** for all ten; conversation is **Blocked** on missing `ANTHROPIC_API_KEY`.
