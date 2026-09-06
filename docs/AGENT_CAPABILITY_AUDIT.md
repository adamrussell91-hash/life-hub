# Life Hub agent capability audit

Generated: 2026-09-06T07:54:23.358Z  
**Behaviour update:** 2026-09-06 — server-side evidence packs + domain analysis. See `docs/AGENT_BEHAVIOUR_ACCEPTANCE.md`.

> **Corrective note:** Attached tools ≠ intelligence. Status words allowed: Demonstrated | Failed | Blocked | Not started. Do not use thin / partial / scaffolding / mostly / should work / capability counts as completion language.

## Demonstrated jobs (2026-09-06 evidence packs)

| Agent | Demonstrated job (pack layer) | Conversation E2E |
| --- | --- | --- |
| Chadwick | Broad “how is training going?” → fitness snapshot, window compare, volume, working weights, long-term, sessions, body | Blocked — no `ANTHROPIC_API_KEY` |
| Brisket | Broad nutrition overview → snapshot, adherence, targets, remaining day, period compare | Blocked — same |
| Sara | Weight/body questions → body state, weight trend (conflict-aware), medical search | Blocked — same |
| Penelope | “Feeling like this often?” → diary search, period compare, themes, range | Blocked — same |
| Vera | Cross-session patterns → mind search + multi-session compare + bounded diary | Blocked — same |
| Hyaluronica | “Is my routine helping?” → adherence + response evidence + history search | Blocked — same |
| Clare | “What should I focus on today?” → tasks focus + open loops (also Clare desk) | Blocked — same |
| Ann | Improve tomorrow’s lesson → teaching search + context + diagnosis | Blocked — same |
| Clementine | “What do I already know about X?” → knowledge search + synthesis (+ teaching bridge); Knowledge chat turn shares pack | Blocked — same |
| Hammond | “What is slipping?” → hub inspect + attention/open-loop pack | Blocked — same |

Proof: `tests/unit/agent-evidence-packs.test.js` (32 pass) + `scripts/agent-evidence-live-demo.mjs` against `/agent/repos/life-hub-data`.

Do **not** treat the tool-count snapshot below as proof of the jobs above.

Single-file audit of every roster agent: tools, capabilities, allowlists, intuition packs, protocols, and voices. Built from live `buildAgentTools` + registry/allowlists — not a wishlist.

## How to read this

| Layer | Meaning |
| --- | --- |
| **Tools** | Anthropic tool schemas attached on a chat turn via `buildAgentTools` (executed in `chat.mjs`). |
| **Capabilities** | Named capacity IDs in `capabilities/registry.json` (OS floor + domain exclusives). Shortcuts are capacities that also become tools. |
| **Allowlist** | Path globs the agent may read/write when proposing durable actions. |
| **Intuition** | Standing judgment priors (`intuition/*.json`) — inform behaviour, do not gate tools. |
| **Protocol / voice** | Operating manual + humanizer voice file. |
| **Skills** | Life Hub agents do **not** load Cursor skill packs at runtime. Agent “skill” here = protocol + intuition + tool pack. Repo `.cursor/skills/*` are for coding agents only. |

## OS floor (every agent)

Shared capacity IDs (via `agents: ["*"]`):

- `os.propose-action`
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

Corresponding always-on tools (unless a turn’s intent router trims shortcuts):

- `coordinate_request_cn_write`
- `intuition_edit_pack`
- `os_capability_scoreboard`
- `os_list_promoted_shortcuts`
- `os_promote_shortcut`
- `os_propose_action`
- `os_run_promoted_shortcut`
- `publish_surface_widget`
- `remember_note_context`
- `remember_set_week_flag`
- `research_expiring_brief`
- `research_save_brief`
- `track_close_challenge`
- `track_log_progress`
- `track_open_challenge`
- `web_search`

Plus `log_entry` when the agent has record types for the turn.

## Capability catalogue

- **`os.propose-action`** → tool `os_propose_action` · risk `confirm` · agents: all agents
- **`log.entry`** → tool `log_entry` · risk `confirm` · agents: brisket, chadwick, hyaluronica, penelope, sara, vera
- **`publish.cn-patch`** → tool `propose_central_node_patch` · risk `confirm` · agents: hammond, clare, ann
- **`publish.governance-log-entry`** → tool `append_governance_log` · risk `auto` · agents: hammond
- **`lookup.save-food-library`** → tool `save_food_library_entry` · risk `auto` · agents: brisket
- **`lookup.save-exercise-library`** → tool `save_exercise_library_entry` · risk `auto` · agents: chadwick
- **`remember.set-week-flag`** → tool `remember_set_week_flag` · risk `auto` · agents: all agents
- **`remember.note-context`** → tool `remember_note_context` · risk `auto` · agents: all agents
- **`track.open-challenge`** → tool `track_open_challenge` · risk `confirm` · agents: all agents
- **`track.log-progress`** → tool `track_log_progress` · risk `auto` · agents: all agents
- **`track.close-challenge`** → tool `track_close_challenge` · risk `confirm` · agents: all agents
- **`coordinate.request-cn-write`** → tool `coordinate_request_cn_write` · risk `auto` · agents: all agents
- **`research.save-brief`** → tool `research_save_brief` · risk `confirm` · agents: all agents
- **`research.expiring-brief`** → tool `research_expiring_brief` · risk `confirm` · agents: all agents
- **`publish.surface-widget`** → tool `publish_surface_widget` · risk `confirm` · agents: all agents
- **`plan.week-meals`** → tool `plan_week_meals` · risk `confirm` · agents: brisket
- **`lookup.food-brand-au`** → tool `lookup_food_brand_au` · risk `auto` · agents: brisket
- **`os.capability-scoreboard`** → tool `os_capability_scoreboard` · risk `auto` · agents: all agents
- **`intuition.edit-pack`** → tool `intuition_edit_pack` · risk `auto` · agents: all agents
- **`os.promote-shortcut`** → tool `os_promote_shortcut` · risk `confirm` · agents: all agents
- **`os.list-promoted-shortcuts`** → tool `os_list_promoted_shortcuts` · risk `auto` · agents: all agents
- **`os.run-promoted-shortcut`** → tool `os_run_promoted_shortcut` · risk `confirm` · agents: all agents

## Roster matrix

| Agent | Domain / tab | Record types | Exclusive capabilities | Domain tools (beyond OS floor) | Intuition | Protocol | Voice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Brisket Lasso** (`brisket`) | nutrition / Nutrition | meal | `log.entry`, `lookup.save-food-library`, `plan.week-meals`, `lookup.food-brand-au` | `log_entry`, `save_food_library_entry`, `plan_week_meals`, `lookup_food_brand_au` | `flare-rules`, `marley-spoon-default`, `vyvanse-appetite-window`, `weekend-fat-risk` | `config/brisket-protocol.md` | `brisket.md` |
| **Chadwick Flexington** (`chadwick`) | fitness / Fitness | workout | `log.entry`, `lookup.save-exercise-library` | `log_entry`, `search_exercise_library`, `save_exercise_library_entry`, `get_last_workout`, `search_workout_records`, `compare_workout_windows`, `get_region_strength`, `get_fitness_snapshot`, `get_training_volume`, `get_working_weights`, `get_long_term_fitness`, `get_session_comparisons`, `get_exercise_history`, `get_load_status`, `get_pain_training_summary`, `get_body_state`, `get_workout_template` | `flare-rules` | `config/chadwick-protocol.md` | `chadwick.md` |
| **Hyaluronica St. Claire** (`hyaluronica`) | skincare / Skincare | skincare | `log.entry` | `log_entry`, `list_skincare_routines`, `search_skincare_library`, `save_skincare_library_entry`, `set_skincare_routine_membership` | — | `config/hyaluronica-protocol.md` | `hyaluronica.md` |
| **Penelope Rose Quillian** (`penelope`) | diary / Mind | diary | `log.entry` | `log_entry` | — | `config/penelope-protocol.md` | `penelope.md` |
| **Dr Sara Tonin** (`sara`) | body / Body | weight, composition, measurements, medical | `log.entry` | `log_entry`, `search_medical_records`, `brief_medical_appointment` | `bone-iron-watch`, `flare-rules`, `kate-semple-therapy`, `stelara-cycle` | `config/sara-protocol.md` | `sara.md` |
| **Dr Vera Lenz** (`vera`) | psychology / Mind | mind_session | `log.entry` | `log_entry`, `get_mind_session`, `search_mind_records` | — | `config/vera-protocol.md` | `vera.md` |
| **General Hammond** (`hammond`) | life_coaching / Central Node | — | `publish.cn-patch`, `publish.governance-log-entry` | `propose_central_node_patch`, `append_governance_log` | — | `config/hammond-protocol.md` | `hammond.md` |
| **Ann O'Tation** (`ann`) | teaching / Teaching | — | `publish.cn-patch` | `propose_central_node_patch` | `teaching-diagnosis-first` | `apps/teaching/config/ann-protocol.md` | `ann.md` |
| **Professor Clementine Haig** (`clementine`) | knowledge / Knowledge | — | — | — | `knowledge-claim-spine` | `apps/teaching/config/clementine-protocol.md` | `clementine.md` |
| **Clare DeMind** (`clare`) | tasks / Tasks | — | `publish.cn-patch` | `propose_central_node_patch` | `tasks-smallest-next-move` | `apps/tasks/config/clare-protocol.md` | `clare.md` |

## Tool count snapshot

| Agent | Tools | Exclusive caps | Intuition packs |
| --- | ---: | ---: | ---: |
| Brisket Lasso | 20 | 4 | 4 |
| Chadwick Flexington | 33 | 2 | 1 |
| Hyaluronica St. Claire | 21 | 1 | 0 |
| Penelope Rose Quillian | 17 | 1 | 0 |
| Dr Sara Tonin | 19 | 1 | 4 |
| Dr Vera Lenz | 19 | 1 | 0 |
| General Hammond | 18 | 2 | 0 |
| Ann O'Tation | 17 | 1 | 1 |
| Professor Clementine Haig | 16 | 0 | 1 |
| Clare DeMind | 17 | 1 | 1 |

## Brisket Lasso (`brisket`)

**Role:** nutrition · tab Nutrition · colour #EEB046

**Record / log types:** `meal`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `true`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `true`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (19):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `lookup.save-food-library` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `plan.week-meals` *(exclusive)*
- `lookup.food-brand-au` *(exclusive)*
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (20):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `save_food_library_entry`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `plan_week_meals`
- `lookup_food_brand_au`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/nutrition/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/food-library.json`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/nutrition/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/food-library.json`
- `central-node.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- `flare-rules`: Crohn's flare accommodation: lower fibre intensity, easier foods, training deload coordination.
- `marley-spoon-default`: Marley Spoon is the default dinner most weeknights.
- `vyvanse-appetite-window`: Vyvanse suppresses appetite for hours after the morning dose; realistic first eating window is often afternoon.
- `weekend-fat-risk`: Weekend eating is the main fat/sodium risk window.

**Protocol:** `config/brisket-protocol.md`

**Voice:** `brisket.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Chadwick Flexington (`chadwick`)

**Role:** fitness · tab Fitness · colour #D9683A

**Record / log types:** `workout`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `true`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `true`
- needsWorkoutHistory: `true`
- needsWorkoutTemplates: `true`
- needsMindDigest: `false`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (17):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `lookup.save-exercise-library` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (33):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `search_exercise_library`
- `save_exercise_library_entry`
- `get_last_workout`
- `search_workout_records`
- `compare_workout_windows`
- `get_region_strength`
- `get_fitness_snapshot`
- `get_training_volume`
- `get_working_weights`
- `get_long_term_fitness`
- `get_session_comparisons`
- `get_exercise_history`
- `get_load_status`
- `get_pain_training_summary`
- `get_body_state`
- `get_workout_template`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/fitness/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/exercise-library.json`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/fitness/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/exercise-library.json`
- `central-node.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- `flare-rules`: Crohn's flare accommodation: lower fibre intensity, easier foods, training deload coordination.

**Protocol:** `config/chadwick-protocol.md`

**Voice:** `chadwick.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Hyaluronica St. Claire (`hyaluronica`)

**Role:** skincare · tab Skincare · colour #C7AEEA

**Record / log types:** `skincare`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `true`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (21):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `list_skincare_routines`
- `search_skincare_library`
- `save_skincare_library_entry`
- `set_skincare_routine_membership`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/skincare/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/skincare/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `central-node.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- none

**Protocol:** `config/hyaluronica-protocol.md`

**Voice:** `hyaluronica.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Penelope Rose Quillian (`penelope`)

**Role:** diary · tab Mind · colour #8F373E

**Record / log types:** `diary`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `true`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (17):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/mind/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/mind/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `central-node.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- none

**Protocol:** `config/penelope-protocol.md`

**Voice:** `penelope.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Dr Sara Tonin (`sara`)

**Role:** body · tab Body · colour #BED3BC

**Record / log types:** `weight`, `composition`, `measurements`, `medical`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `true`
- needsBodyState: `true`
- needsWorkoutHistory: `true`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (19):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `search_medical_records`
- `brief_medical_appointment`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/body/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/body/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `central-node.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- `bone-iron-watch`: Crohn's + steroid eras raise osteopenia and iron-repletion monitoring priority.
- `flare-rules`: Crohn's flare accommodation: lower fibre intensity, easier foods, training deload coordination.
- `kate-semple-therapy`: Kate Semple psychology sessions are part of the MHCP / mental-health lane on Medical Overview.
- `stelara-cycle`: Stelara (ustekinumab) maintenance cadence and post-dose monitoring are standing clinical context for Sara.

**Protocol:** `config/sara-protocol.md`

**Voice:** `sara.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Dr Vera Lenz (`vera`)

**Role:** psychology · tab Mind · colour #37598A

**Record / log types:** `mind_session`

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `true`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `true`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `log.entry` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (19):**

- `web_search`
- `os_propose_action`
- `log_entry`
- `get_mind_session`
- `search_mind_records`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/mind/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/mind/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `central-node.md`
- `data/governance/governance-log.md`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Intuition packs:**

- none

**Protocol:** `config/vera-protocol.md`

**Voice:** `vera.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## General Hammond (`hammond`)

**Role:** life_coaching · tab Central Node · colour #2D2D2D

**Record / log types:** _none_

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `true`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `true`
- hasProtocolLoader: `true`

**Capabilities (17):**

- `os.propose-action`
- `publish.cn-patch` *(exclusive)*
- `publish.governance-log-entry` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (18):**

- `web_search`
- `os_propose_action`
- `propose_central_node_patch`
- `append_governance_log`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `central-node.md`
- `data/governance/**`
- `data/hammond/**`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`
- `teaching:unit:*`
- `tasks:project:*`

**Allowlist reads:**

- `central-node.md`
- `data/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`
- `teaching:unit:*`
- `tasks:project:*`

**Intuition packs:**

- none

**Protocol:** `config/hammond-protocol.md`

**Voice:** `hammond.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Ann O'Tation (`ann`)

**Role:** teaching · tab Teaching · colour #5B141A

**Record / log types:** _none_

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `true`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `publish.cn-patch` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (17):**

- `web_search`
- `os_propose_action`
- `propose_central_node_patch`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `central-node.md`
- `data/research/**`
- `data/challenges/**`
- `data/remember/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/research/**`
- `data/challenges/**`
- `data/remember/**`
- `data/widgets/**`
- `data/os/**`
- `central-node.md`
- `intuition/**`

**Intuition packs:**

- `teaching-diagnosis-first`: Diagnose the lesson hinge before rewriting; prefer the smallest classroom-ready repair.

**Protocol:** `apps/teaching/config/ann-protocol.md`

**Voice:** `ann.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Professor Clementine Haig (`clementine`)

**Role:** knowledge · tab Knowledge · colour #3B57A8

**Record / log types:** _none_

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `false`
- hasProtocolLoader: `false`

**Capabilities (15):**

- `os.propose-action`
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (16):**

- `web_search`
- `os_propose_action`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `data/research/**`
- `data/challenges/**`
- `data/remember/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`

**Allowlist reads:**

- `data/research/**`
- `data/challenges/**`
- `data/remember/**`
- `data/widgets/**`
- `data/os/**`
- `central-node.md`
- `intuition/**`

**Intuition packs:**

- `knowledge-claim-spine`: Find the controlling claim first; cut throat-clearing; structure must make the warrant visible.

**Protocol:** `apps/teaching/config/clementine-protocol.md`

**Voice:** `clementine.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Clare DeMind (`clare`)

**Role:** tasks · tab Tasks · colour #F7DD4C

**Record / log types:** _none_

**Chat runtime flags (from `chat.mjs`):**

- needsFoodLibrary: `false`
- needsExerciseLibrary: `false`
- needsSkincareLibrary: `false`
- needsHammondTools: `false`
- needsVeraMindTools: `false`
- needsSaraMedicalTools: `false`
- needsBodyState: `false`
- needsWorkoutHistory: `false`
- needsWorkoutTemplates: `false`
- needsMindDigest: `false`
- needsCentralNodeWrite: `true`
- hasProtocolLoader: `true`

**Capabilities (16):**

- `os.propose-action`
- `publish.cn-patch` *(exclusive)*
- `remember.set-week-flag`
- `remember.note-context`
- `track.open-challenge`
- `track.log-progress`
- `track.close-challenge`
- `coordinate.request-cn-write`
- `research.save-brief`
- `research.expiring-brief`
- `publish.surface-widget`
- `os.capability-scoreboard`
- `intuition.edit-pack`
- `os.promote-shortcut`
- `os.list-promoted-shortcuts`
- `os.run-promoted-shortcut`

**Tools attached by `buildAgentTools` (17):**

- `web_search`
- `os_propose_action`
- `propose_central_node_patch`
- `remember_set_week_flag`
- `remember_note_context`
- `track_open_challenge`
- `track_log_progress`
- `track_close_challenge`
- `coordinate_request_cn_write`
- `research_save_brief`
- `research_expiring_brief`
- `publish_surface_widget`
- `os_capability_scoreboard`
- `intuition_edit_pack`
- `os_promote_shortcut`
- `os_list_promoted_shortcuts`
- `os_run_promoted_shortcut`

**Allowlist writes:**

- `central-node.md`
- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `intuition/**`
- `tasks:project:*`

**Allowlist reads:**

- `data/challenges/**`
- `data/remember/**`
- `data/research/**`
- `data/widgets/**`
- `data/os/**`
- `central-node.md`
- `intuition/**`
- `tasks:project:*`

**Intuition packs:**

- `tasks-smallest-next-move`: ADHD-aware default: shrink to the smallest honest next move; confirm before durable writes.

**Protocol:** `apps/tasks/config/clare-protocol.md`

**Voice:** `clare.md`

**Skill equivalent:** protocol + intuition + tool pack above. No separate skill-runner files for this agent.

## Gaps and scope notes

### Verified alignments

- Roster, agent directory, and allowlists cover the same 10 slugs: brisket, chadwick, hyaluronica, penelope, sara, vera, hammond, ann, clementine, clare.
- Gap check: `{"inYmlNotDirectory":[],"inDirectoryNotYml":[],"inYmlNoAllowlist":[],"allowlistNoYml":[],"nameMismatches":[],"registryIdsNotInFloorOrExclusiveCheck":[]}`

### Behaviour pass (2026-09-06) — closed vs open

**Closed in Life chat runtime:**

1. Retrieval activation policy + source catalogue in system prompt (`activation-policy.mjs`).
2. First-round `tool_choice: any` when evidence is required (web_search stripped that round).
3. Brisket nutrition dashboard tools; Sara body/weight tools; Penelope diary search; Hyaluronica adherence/history; Clare tasks focus; Ann teaching search/context; Clementine knowledge search; Hammond hub inspect.
4. Orchestration acceptance tests for the 14 required scenarios.

**Still open / partial:**

1. Surface parity: Tasks SPA / Teaching SPA / Knowledge SPA still have separate tool spines (Chat audit §3.4).
2. Ledger items 4 (partial accept), 8 (shortcut UI), 10 (page resurfacing), 11–14 as documented in `AGENT_BEHAVIOUR_ACCEPTANCE.md`.
3. Multimodal evidence intake and visual catalogue requests (mining priority two) not in this pass.
4. Live Anthropic behavioural eval not run in CI.

### Scope / asymmetry (historical — superseded where noted above)

1. **Chadwick** remains tool-richest; activation was the missing layer (now added).
2. **Intent narrowing** still trims named shortcuts only; domain tools stay when flags/activation say so.
3. **Cursor skills** remain coding-agent only.

## Sources

- `config/agents.yml`
- `netlify/functions/_shared/agent-directory.mjs`
- `capabilities/registry.json`
- `capabilities/allowlists/*.json`
- `capabilities/**/*.json`
- `netlify/functions/_shared/capabilities/registry.mjs (buildAgentTools)`
- `netlify/functions/chat.mjs (runtime feature flags)`
- `intuition/*.json`
- `config/*-protocol.md / apps/*/config/*-protocol.md`
- `config/humanizer/voices/*.md`
