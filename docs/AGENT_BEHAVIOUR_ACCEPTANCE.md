# Agent behaviour acceptance

**Date:** 2026-09-07  
**Strategy:** `docs/AGENT_CAPABILITY_STRATEGY.md`  
**Status vocabulary (only):** Demonstrated | Failed | Blocked | Not started  

**Rule:** A capability counts only when the agent independently recognises applicability, retrieves required context, uses the correct tool or server pack, interprets the result, states missing evidence honestly, and completes the task without Adam pasting data already stored in Life Hub. Registration / schema attachment alone is not evidence.

**Honesty rule:** pack assembly, helper output, and deterministic claim compose are pack/function tests. They are not conversational behaviour tests. Do not describe them as agent behaviour proof.

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

**Store used for pack demos:** `/agent/repos/life-hub-data/data` (local functioning Life Hub data clone) via `scripts/agent-evidence-live-demo.mjs` for fitness, nutrition, body, mind, and skincare. Clare / Ann / Clementine / Hammond hub slices in that script are **synthetic** (Tasks, Teaching, and Knowledge live in blob stores, not that markdown tree). Artifacts: `/opt/cursor/artifacts/agent-evidence-live/`.

**Exact conversational blocker:** `ANTHROPIC_API_KEY` is not present in this Cloud Agent environment (`printenv` length 0). Without it, `chat.mjs` cannot run a genuine model turn. Pack assembly does not require the model and was run against the local markdown store plus labelled synthetic hub records.

---

## Clare workbench (observed 2026-09-07)

Clare is no longer a thin read adapter. Life chat loads Tasks and Projects. `clare-work.mjs` exposes 15 named tools covering 40 jobs. Full tool attach is 37; a focus-today intent trim still leaves 24, including the workbench.

Remaining weakness is orchestration quality: 08:00 time-block, untimed tasks default to 45 minutes, Teaching lesson times are counted but not reserved, energy ranking does not read current energy, duplicate detection is exact-title, forced activation covers a subset of requests. See strategy Phase 0 adversarial cases in `tests/unit/clare-adversarial.test.js`.

---

## What changed (runtime)

1. **Server-side evidence packs** (`netlify/functions/_shared/evidence-packs.mjs`) — on domain intents the runtime retrieves evidence *before* the model runs. Tool schemas are no longer the only activation path.
2. **Domain analysis helpers** (`domain-analysis.mjs`) — remaining day macros, period compares, diary themes, mind multi-session compare, skincare response windows, tasks open loops, teaching diagnosis, knowledge synthesis, Hammond attention pack.
3. **Activation policy** broadened (incl. hyaluronica “actually helping”).
4. **`chat.mjs`** injects `evidencePackBlock` into the system prompt; forces `tool_choice: any` only when the pack is not yet answerable.
5. **Surface unification** — `assembleClareEvidence` / `assembleAnnEvidence` / `assembleClementineEvidence` reused from Clare desk and Knowledge chat turn (same read competence as Life chat).
6. **Deterministic claim compose** — `composeEvidenceClaims` maps retrieved evidence to claims and limitations. This is pack-layer compose, not a conversational answer. Incomplete / truncated / conflicted evidence cannot compose as complete.
7. **Phase 1 kernel (flagged)** — `agent-kernel.mjs` plans, retrieves, assesses sufficiency, composes claims, and traces Chadwick training review and Clare daily focus. Off unless `LIFE_HUB_AGENT_KERNEL=1` or `agentKernel: true`. Regex activation remains the default path.

---

## Automated proof (pack/function layer)

| Suite | What it proves | What it does not prove |
| --- | --- | --- |
| `tests/unit/agent-evidence-packs.test.js` | Server pack assembly from ordinary wording, empty-store honesty, small-talk negative control, weight conflict, surface adapters | Conversational behaviour |
| `tests/unit/agent-retrieval-behaviour.test.js` | Activation rules and deterministic domain helpers | Conversational behaviour |
| `tests/unit/agent-orchestration-acceptance.test.js` | 14 scenarios: activation → required tools executed → evidence present → composed claims / limitations | Conversational behaviour |
| `tests/unit/clare-work.test.js` | Workbench schemas, writes, SSRF, selected helpers | Live multi-step Clare conversations |
| `tests/unit/clare-adversarial.test.js` | Corrections, long lists, missing times, collisions, stale projects, partial tool failure | Live Clare planning quality |
| `tests/unit/agent-kernel.test.js` | Phase 1 plan/retrieve/assess/compose/recovery + prompt Delivery for Chadwick and Clare | Live conversational behaviour |

These tests do **not** mock model tool selection as proof of activation. They also do **not** count as agent behaviour proof.

---

## Traceability (mechanism → pack layer)

| Mechanism | Runtime effect | Status |
| --- | --- | --- |
| ECC iterative retrieval | Pack + continuationTools when truncated/missing | Demonstrated (pack layer) |
| Evidence proof gates | Sections kind-tagged record/calculation/missing/truncated/conflict | Demonstrated |
| Visible truncation | truncated kind + continuation candidates | Demonstrated |
| User evidence > inference | Pack instructions + conflict flags | Demonstrated |
| Deterministic calculations | Fitness/nutrition/tasks math via existing models | Demonstrated |
| Surface unification Clare/Ann/Clementine | Shared pack adapters on desk / knowledge chat | Demonstrated (read path) |
| Claim compose from retrieved evidence | `composeEvidenceClaims` on the 14 scenarios | Demonstrated (pack layer) |
| Live conversational E2E | Requires Anthropic | **Blocked** |

---

## Honest completion line

**Not complete for Adam’s full bar** until each agent has a genuine conversational turn through its user-facing route with the model present. Pack retrieval against a functioning markdown store is **Demonstrated** for Life domains; Clare / Ann / Clementine / Hammond hub demos remain **synthetic** unless a blob fixture is used. Conversation is **Blocked** on missing `ANTHROPIC_API_KEY`.
