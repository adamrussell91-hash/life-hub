# Agent behaviour acceptance

**Date:** 2026-09-06  
**Branch:** `cursor/agent-retrieval-behaviour-542f`  
**Status vocabulary (only):** Demonstrated | Failed | Blocked | Not started  

**Rule:** A capability counts only when the agent independently recognises applicability, retrieves required context, uses the correct tool or server pack, interprets the result, states missing evidence honestly, and completes the task without Adam pasting data already stored in Life Hub. Registration / schema attachment alone is not evidence.

---

## Honest status (this Cloud Agent environment)

| Layer | Status | Evidence |
| --- | --- | --- |
| Life evidence packs vs real Life files | **Demonstrated** | Chadwick, Brisket, Sara, Penelope, Vera, Hyaluronica — `scripts/agent-evidence-live-demo.mjs` against `/agent/repos/life-hub-data/data` |
| Hub packs vs real Tasks/Teaching/Knowledge stores | **Blocked** | Clare, Ann, Clementine, Hammond — blob stores not mounted here; demo no longer invents rows |
| Conversational turn via `chat.mjs` | **Blocked** | `ANTHROPIC_API_KEY` unset |
| Model interpretation / competing evidence / continuation | **Not started** (not proven) | Unit tests deliberately do **not** mock model tool choice as proof of behaviour |

Artifacts: `/opt/cursor/artifacts/agent-evidence-live/summary.json`.

---

## What this corrective pass fixed

1. **Activation is no longer regex-only.** Specialists pack their domain on substantive turns via `domain_default` (`activation-policy.mjs`). Regex intents still refine tool sets. Paraphrases like “give me a read on gym progress…” now pack for Chadwick. Small-talk still does not.
2. **Clare projects load in Life chat.** `chat.mjs` loads `PROJECT_PREFIX` (`projects/`) alongside tasks so open-loop / stall / overlapping-excursion analysis is not permanently blind.
3. **Search is ranked OR, not brittle AND.** Nutrition / skincare / tasks search no longer require every query token to match; natural questions no longer false-empty as easily. Query extraction drops stopwords.
4. **Ann Teaching surface contract.** `buildAiSystemPrompt` accepts `evidencePackBlock`; `ann-teaching-surface.mjs` exposes `buildAnnTeachingEvidence` / `loadAnnTeachingEvidence` for production Teaching AI routes. Production `apps/teaching/netlify/functions/ai-chat.mts` is still **missing from the tree** — adapter + prompt contract are Demonstrated in unit tests; live Teaching route wiring remains **Blocked** until that function exists and calls the adapter.
5. **Live demo honesty.** Hub agents report **Blocked** with exact missing-store reasons. No synthetic Clare/Ann/Clementine/Hammond rows.

---

## What remains unproven (do not over-claim)

- Model reading the pack and answering usefully (requires Anthropic).
- Model retrieving an omitted slice or handling competing evidence.
- Clare/Ann/Clementine/Hammond packs against **production** Tasks/Teaching/Knowledge blob stores in this environment.
- Ann’s production Teaching `/api/ai/chat` route calling `loadAnnTeachingEvidence` (function file absent).
- Shared competence across all three surfaces as a finished product claim — Clare desk + Knowledge turn are wired; Ann Teaching production route is not yet.

---

## Automated proof (what it is / is not)

| Suite | Result | Proves | Does not prove |
| --- | --- | --- | --- |
| `tests/unit/agent-evidence-packs.test.js` | 38 pass | Pack activation, domain_default paraphrase, ranked search, Clare projects in pack, Ann Teaching adapter, empty-store honesty | Model behaviour |
| Teaching `ai-agent` evidencePackBlock case | unit | Prompt includes Teaching evidence section when provided | Live Teaching route |

---

## Traceability

| Mechanism | Effect | Status |
| --- | --- | --- |
| Domain-default packing | Substantive specialist turns retrieve without magic wording | Demonstrated (pack) |
| Clare `hubProjects` load | Project-level open-loop analysis receives projects | Demonstrated (code + unit); live Tasks store Blocked here |
| Ranked search | Natural questions less likely to false-empty | Demonstrated (unit) |
| Ann Teaching adapter | Same pack competence callable outside Life chat | Demonstrated (unit); production route Blocked |
| Live conversational E2E | Requires Anthropic | **Blocked** |

---

## Completion line

**Not complete for Adam’s full bar.** Pack-layer competence is Demonstrated for the six Life agents against a real Life store. Hub agents are honestly **Blocked** here without invented data. Conversation remains **Blocked** without `ANTHROPIC_API_KEY`. Tests still do not prove agent behaviour at the model layer — that admission stands.
