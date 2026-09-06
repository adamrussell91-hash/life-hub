# Agent behaviour acceptance

**Date:** 2026-09-06  
**Branch work:** autonomous retrieval / activation policy  
**Inputs:** `CONVERGENCE_LEDGER_FOR_CURSOR.md`, `docs/AGENT_CAPABILITY_AUDIT.md`, ECC rounds 1–4 + consolidation, Matt Pocock skills audit, Ponytail rules, Chat parallel audit (2026-09-06), live runtime (`chat.mjs`, `buildAgentTools`, intent router, context assembly, tool loop).

**Rule:** A capability counts only when the agent independently recognises applicability, retrieves required context, uses the correct tool, interprets the result, states missing evidence honestly, and completes the task without the user pasting data already stored in Life Hub. Tool registration alone is not evidence.

Coding-agent instructions (Ponytail, Matt skills, most ECC Cursor rules) are **development discipline**, not Life Hub runtime capabilities. They appear below only where they produced a runtime effect or are explicitly marked development-only.

---

## 1. Traceability table

| Mechanism | Source | Intended user-facing behaviour | Current implementation | Runtime receives info? | Independently invokes tool? | Behavioural proof | Status | Exact work done / needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Evidence honesty | ECC | Do not treat skipped/empty as success | first-pass rule + fail-visible markers | Yes (markers in prompt) | N/A | `context-delivery`, orchestration scenarios 11–12 | Working | Kept; extended to domain tool `truncated` / `error` fields |
| Visible context failure | ECC / Ledger #5 | Name failed sources | CN unavailable marker; hub unavailable markers | Yes | N/A | hub inspect unavailable | Working | `inspect_hub_signals` + activation sourceMeta UNAVAILABLE lines |
| Visible truncation | ECC / Ledger #5 | Truncation ≠ complete empty set | Cross-Agent HTML comment; hub truncation lines; tool `truncated` | Yes | Continue retrieval when truncated | scenario 12 | Working / Partial | Tool results now carry truncated/kept/omitted; continuation still model-driven |
| Delivery proof | ECC / ACI | Final system string contains intended context | `context-delivery.test.js` + activation blocks in prompt | Yes | N/A | activation catalogue delivery test | Working | Activation catalogue/directive delivered into `buildSystemPrompt` |
| Behavioural fixtures | ECC / AI Mock | Must/must-not against real jobs | Constraint fixtures + new orchestration suite | Yes | Asserted required tools | `agent-orchestration-acceptance.test.js` | Working | 14 required scenarios (+ Brisket) |
| Must / Must-not / Verify | ECC / first-pass | Non-gameable contracts | Activation requiredTools + orchestration asserts | Yes | Forced `tool_choice: any` on retrieval intents | orchestration suite | Working | |
| Silent failure detection | ECC | Empty fallback ≠ empty domain | Source meta + tool errors | Partial | When activation fires | scenarios 11–12 | Partial | Not every soft-fail site rewritten |
| Pseudo-fact / admission | ECC / ACI | Inference ≠ user truth | ACI rule; conflict flag on weight trend | Yes | Conflict object returned | scenario 14 | Partial | Conflict detection for weight; not universal across domains |
| Multi-path verification | ECC | One path ≠ another | Per-agent orchestration scenarios | Yes | Per slug | scenarios 1–10 | Working | Life chat path; Tasks/Teaching SPA paths still separate |
| Explicit completion evidence | ECC | Observable outcome | This document + tests | — | — | commands below | Working | |
| Decision records | Ledger #4 | Chosen option + reasoning | Existing governance log / propose-action | Partial | Existing | existing confirm tests | Partial | Partial accept + stale-base check still open (ledger) |
| Diagnose before changing | Matt | Inspect before prescribe | Ann/Clare activation + protocols | Yes | Required tools | scenarios 3–4 | Working (runtime translation) | Dev skill remains Cursor-only |
| Investigate actual system | Matt | Trace real path | This corrective task | — | — | — | Dev-only | |
| Test behaviour not registration | Matt | Orchestration asserts | New tests | — | — | suite | Working | |
| Focused questions when missing changes outcome | Matt | Ask only when tools fail | Activation: ask after failed retrieval | Yes | Yes | scenario 11 | Partial | Prompt rule; not enforced in code beyond failure objects |
| Challenge weak assumptions | Matt / grilling | Bounded challenge | Hammond / decision path | Partial | Partial | — | Dev / Partial | Not a new always-on runtime grill |
| Smallest complete change | Ponytail | Few files, reuse services | domain-retrieval + activation-policy | — | — | — | Dev-only applied | |
| Shared identity cross-hub | Ledger #3 | Link Teaching↔Knowledge↔Tasks | Knowledge `connected` only | Partial | No new write identity | — | Partial | Honest: retrieval uses existing IDs; no new universal ID scheme this pass |
| Unified proposals / confirm / decisions | Ledger #4 | One confirm system | propose-action + chat-confirm | Yes | Existing | existing | Partial | Gaps a–c from ledger remain |
| Unified attention retrieval | Ledger #6 | Oldest open item across hubs | Home governance oldest + hub inspect | Partial | Hammond `inspect_hub_signals` | scenario 10 | Partial | Home UI widening not this pass |
| Deterministic calculations | Ledger #7 | Code computes, model narrates | Fitness pack + nutrition adherence + compare windows | Yes | Activation forces | scenarios 1–2, nutrition | Working | |
| Shortcut activation | Ledger #8 | Shortcut panel | Backend exists | N/A | N/A | — | Absent UI | Out of scope for intelligence fix |
| Knowledge retrieval / resurfacing | Ledger #10 | Search before synthesis | `search_knowledge` + Clementine activation | Yes | Forced on lookup intents | scenario 5 | Working (search); resurfacing quiz still quiz-only | |
| Document processing states | Ledger #12 | Explicit stages | ai-jobs / chat-job | Partial | — | — | Partial | Not rebuilt this pass |
| Cross-hub tracing | Ledger #13 | Trace idea/decision over time | Needs identity + decisions | No | No | — | Absent | Blocked on #3/#4 |
| Teaching version history | Ledger #1 | Versions API | Exists under teaching-versions | Yes for Teaching SPA | Ann Life chat now searches teaching | scenario 4 | Partial | Life chat retrieves context; version restore UX separate |
| Tasks capacity/stress | Ledger #2 | Capacity + stress available | `tasks-capacity` / `tasks-stress` wired into `get_tasks_focus` | Yes | Clare activation | scenario 3 | Working | |
| Chadwick fitness tools without activation | Prior #214 | Tile parity tools | Tools attached | Yes (preloaded + tools) | Was unreliable | User failure report | Fixed | Activation + `tool_choice: any` |
| Intent router | Existing | Narrow shortcuts | Keyword hints | Can remove shortcuts | Does not remove domain tools | capabilities tests | Working as designed | Domain tools no longer depend on router for retrieval |
| Humanizer voices | Humanizer | Tone | Unchanged | — | — | — | Preserved | Explicitly ignored this task |

---

## 2. Before / after behaviour

| Agent | Before | After |
| --- | --- | --- |
| Chadwick | Fitness tools attached; “how’s training?” could be answered from thin Recent sessions / generic knowledge without calling snapshot/compare | Intent `training_overview` / `training_decline` forces retrieval tools; catalogue in system prompt; first round `tool_choice: any` (web_search stripped that round) |
| Brisket | Meal log + food library; no callable adherence tools | `get_nutrition_snapshot`, `get_nutrition_adherence`, search/targets |
| Sara | Medical tools; body only prompt-loaded | `get_body_state` + `get_weight_trend` with conflict flag |
| Penelope | Diary log only | `search_diary_records`, `get_diary_range` (notes searchable) |
| Vera | Mind search existed | Activation requires search for cross-session pattern questions |
| Hyaluronica | Library/routines | `get_skincare_adherence`, `search_skincare_records` |
| Clare | CN patch only in Life chat | `get_tasks_focus` / `search_tasks` / `get_task` + protocol load |
| Ann | CN patch only in Life chat | `search_teaching` / `get_teaching_context` + protocol load |
| Clementine | OS floor only in Life chat | `search_knowledge` + Teaching protocol load (intentional path) |
| Hammond | Capped hub summary | `inspect_hub_signals` with explicit unavailable hubs |

---

## 3. Acceptance scenarios

Covered in `tests/unit/agent-orchestration-acceptance.test.js`:

1. Chadwick training overview → snapshot + compare  
2. Chadwick decline → load + pain + snapshot + body  
3. Clare focus today → tasks focus  
4. Ann improve Year 10 lesson → teaching search + context  
5. Clementine cognitive load → knowledge search  
6. Sara weight unusual → body + weight trend  
7. Penelope feeling often → diary search  
8. Vera pattern across sessions → mind search  
9. Hyaluronica routine helping → adherence (+ routine/search tools required)  
10. Hammond slipping → inspect hubs  
11. Retrieval failure explicit  
12. Truncation visible  
13. Irrelevant greeting does not force tools  
14. Conflicting weight readings flagged  

Plus Brisket nutrition overview.

---

## 4. Evidence from tests

```text
node --test tests/unit/agent-retrieval-behaviour.test.js
→ 16/16 pass

node --test tests/unit/agent-orchestration-acceptance.test.js
→ 15/15 pass

node --test tests/unit/capabilities.test.js tests/unit/persona.test.js \
  tests/unit/fitness-tools.test.js tests/unit/hub-agent-context.test.js \
  tests/unit/context-delivery.test.js
→ 176/176 pass

node -e "import('./netlify/functions/chat.mjs')"
→ ok
```

Orchestration tests mock only the model’s tool-selection boundary (they assert activation requires tools, tools are attached, and executing those tools returns usable evidence). They do not claim a live Anthropic call occurred.

---

## 5. Remaining gaps

1. **Surface parity:** Tasks SPA Clare / Teaching Ann / Knowledge Clementine still have separate runtimes; Life chat now has domain reads, but one shared capability identity across surfaces is incomplete.  
2. **Ledger #4 partial accept / stale-base / multi-store confirm** not finished.  
3. **Ledger #8 shortcut UI panel** not built.  
4. **Ledger #10 page resurfacing** still quiz-scoped.  
5. **Ledger #11–14** deferred as ledger states.  
6. **Live model Behaviour** still depends on provider; forced first-round tool_choice + activation text close the reported Chadwick hole without guaranteeing perfect multi-tool sequencing every time.  
7. **Multimodal intake / visual catalogue requests** from Chat’s mining audit are priority-two and not in this pass.  
8. **Browser E2E** against a live Anthropic key not run in this environment.

---

## 6. Unsupported claims (none made)

- No claim that capability counts equal intelligence.  
- No claim that Tasks/Teaching SPA paths were unified.  
- No claim that Humanizer voices changed.  
- No claim that all 14 ledger items were newly implemented — statuses verified; only intelligence/retrieval-missing work shipped.  
- No claim of live paid-API behavioural evaluation in CI.
