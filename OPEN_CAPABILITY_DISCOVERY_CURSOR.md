# OPEN CAPABILITY DISCOVERY — Cursor

**Date:** 2026-09-05  
**Mode:** Divergent discovery only. No production implementation. No commit / push / PR / merge.  
**Advantage used:** Full umbrella codebase inspection (`apps/*`, `capabilities/`, `netlify/functions/`, `packages/design-kit/`, Central Node, intuition packs, Rounds A–B, ECC audits, consolidation plan).  
**Round C / Round D mining reports:** Not present in this checkout. Round A–B reports and partial Round A kit mines (`hub-floating`, `hub-focus-trap`, `agent-choice-card`, `agent-sources-card`) are present. Do not assume Round C/D proposals were implemented.

---

# Executive Summary

Life Hub is already past “personal dashboard.” It is becoming a **longitudinal, multi-domain, confirm-gated operator OS** with named personalities, a Central Node coordination spine, a typed capability registry, cross-hub calendar projections, Teaching version history, Knowledge semantic research, and Tasks proactive stress scanning.

What it has **not** seriously become yet:

1. A system that **detects and explains change** in Adam’s own baselines without waiting to be asked.
2. A system that can **fork reality** (schedules, plans, sequences) and compare consequences before writing.
3. A system with **typed cross-hub references** strong enough that objects cite each other the way Gramps primary objects cite people/places/events/sources.
4. A system where **command / shortcut / confirm / undo** are one architecture rather than adjacent features.
5. A system that treats five years of diary, medical, teaching, knowledge, and task history as a **memory archaeology surface**, not only a search index.

This pass found **30 distinct capability discoveries**, **10 emergent combinations**, and ranked **15 keepers** / **5 transformative**. The single strongest investigation to commission next is **Confirmable Branching Reality** — temporary alternate states for Life/Tasks/Teaching with consequence preview, partial accept, and RollbackKit-style reversibility — because it multiplies every existing agent and confirm surface without becoming another chatbot feature.

---

# What Life Hub Already Is

## Product shape

- **Umbrella:** Life (vanilla JS PWA) + Knowledge / Tasks / Teaching (Vite+TS) under one design kit and one Netlify API site (`api.adam-russell.com`), private data in `life-hub-data`.
- **Operator contract:** single Adam session; confirm-before-write for durable mutations; public Teaching student routes stay unauthenticated.
- **Intelligence:** ten named personalities; Central Node markdown as shared coordination/constraints memory; intuition JSON packs as standing priors; capability registry v0.5 (`os.propose-action`, log/publish/remember/track/research/plan/lookup/shortcuts).
- **Persistence:** Life markdown records by domain path; Knowledge pages + R2 archive + research Worker; Tasks/Teaching Netlify Blobs with rich schemas; Teaching real version history.

## What it actually does today (verified in code, not assumed from mining docs)

| Area | Reality |
|------|---------|
| Life domains | Nutrition, fitness, body, mind, skincare, chat, calendar, central-node — **live**. `sleep` / `heart` / `fragrance` types validated — **latent** (no product tabs). |
| Agents | Brisket, Chadwick, Penelope, Sara, Hyaluronica, Vera, Hammond (+ Clare, Ann, Clementine). Confirm cards; Vera/Sara special write paths. |
| Knowledge | Archive, graph, university timeline, capture, tidy, curator, podcast, quiz, research (lexical+vector RRF), Clementine chat — **live**. Clementine primary path **does not** load Central Node. |
| Tasks | Board, calendar, Gantt, Clare Now/Later/Trash, projects, maps/universe/branch viz, stress flags + hourly intuitive-scan — **live**. |
| Teaching | ~30 block types, Ann diagnosis, alchemy, publish, student `/s/...`, version history/restore — **live**. |
| Shared chrome | Cmd+K (`openHubCommandSearch` + MiniSearch), morphing dialogs, timed undo, floating/focus-trap mines, agent choice/sources cards. |
| Capabilities OS | `os.propose-action`, promote/list/run shortcuts, surface widgets (2 templates), week-meal plan, challenges — **runtime present, thin operator UX**. |

## What previous rounds already covered (do not rediscover as “add X”)

Floating positioning, accessible state machines, AI chat UX, structured tool UI, AI mocking, FTS/MiniSearch, motion, DnD, rich-text, graphs, charts, calendars, timelines, Gantt, uploads, maps, media, image processing, capture, PDFs, audio, clipboard/share — **as capability classes**. New discoveries below may *combine* those, but must not merely improve them.

---

# Existing / Emerging / Latent / Absent Capability Map

## EXISTING

- Authenticated sync of allowlisted Life markdown; offline PWA shell.
- Personality chat with routing, protocols, Central Node slices, confirm cards.
- Domain dashboards (nutrition/fitness/body/mind/skincare) with libraries and charts.
- Multi-source calendar (Life + Knowledge + Tasks + Teaching projections).
- Knowledge archive/graph/research/podcast/quiz/capture/tidy/curator.
- Tasks Clare dumps, board/calendar/Gantt, stress scanning.
- Teaching block canvas, scheduling, publish, student views, **version history**.
- Capability registry + governance log + intuition packs + surface widgets.
- Design-kit interaction primitives and hub switcher.

## EMERGING

- Structured agent UI segments (choice/sources cards in kit; still unevenly wired).
- Promoted shortcuts as macro layer (`os.promote-shortcut` / `run-promoted-shortcut`).
- Cross-hub Hammond context (`hub-agent-context.mjs` — capped tasks/classes/lessons).
- Surface widgets beyond the two templates.
- Round A chat scroll / confirm-receipt polish (partially shipped via #165).

## LATENT (A + B ≈ D)

1. **Validated `sleep`/`heart`/`fragrance` record paths** + calendar colours + `log_entry` → first-class domains without new storage model.
2. **Capabilities + Cmd+K + confirm cards** → full action OS (not navigation-only palette).
3. **Teaching versions + Life CN patches + Knowledge pages** → umbrella reversible history (only Teaching has the UI today).
4. **Calendar projections + three graph families** (Knowledge force, Tasks maps/universe, Teaching concept/mind maps) → typed cross-hub object fabric.
5. **Intuition packs + `intuition.edit-pack` + week flags** → operator-visible prior observatory.
6. **Tasks intuitive-scan + Life governance open loops + CN Flags** → selective ambient surfacing for Life.
7. **`os.propose-action` writes/diffs** → preview/compare/branch without inventing a new write path.
8. **Research briefs + claim-spine + Clementine** → expiring knowledge intelligence that still respects CN constraints (path gap today).
9. **Capture + Teaching media + hub-capture** → one capture grammar, three backends (almost unified UX).
10. **Home model completeness + CN staleness rules** → Clare Morning Sweep–style proactive rewrite already described in CN writing rules.

## ABSENT (new mechanisms required)

- True what-if / fork of live state with consequence comparison.
- Typed universal references (`life://`, `task://`, `lesson://`, person/place/event handles).
- Deterministic personal baseline / anomaly layer feeding agents.
- Computational / reactive documents as first-class objects.
- Memory archaeology (“when did this idea first appear?”).
- Schema-constrained ephemeral workspaces generated per intent.
- Umbrella event/undo model beyond timed undo + Teaching versions.
- Signal-vs-noise proactive policy for Life (Tasks has a slice).
- End-user automation beyond promoted shortcuts.
- Passage-level citation between Knowledge and Teaching blocks.

---

# 30 Capability Discoveries

> Scored later. Discovery first.

### 1. Personal Baseline Drift Engine

**Inspiration / source domain:** Quantified-self / remote patient monitoring (deterministic detectors, not LLM math).  
**Relevant open-source:** [Deekshith-Dade/fettle](https://github.com/Deekshith-Dade/fettle), [HawaleShailesh004/nadi](https://github.com/HawaleShailesh004/nadi), [KamitKoul/Sanjivani](https://github.com/KamitKoul/Sanjivani).  
**Mechanism:** Rolling personal baselines + z-score / % drift; multi-signal gate before alert; LLM narrates evidence packs it did not invent.  
**Inside Life Hub:** Nutrition, workouts, mood, calprotectin/flare proxies, sleep (when surfaced) get “vs *your* 28-day baseline” detectors that feed Sara/Brisket/Chadwick as tools, not vibes.  
**Hubs:** Life (+ agent leverage).  
**Combines with:** Records, home model, intuition (`flare-rules`, `weekend-fat-risk`), Central Node Flags.  
**Why new:** Rounds A–D never proposed non-LLM intelligence that *owns the math*.  
**UX:** Home subtle “two vitals drifting together” amber; open → evidence strip → optional agent brief.  
**Plausibility:** High — data already time-series markdown.  
**Upside:** Trust + proactive value without chat.  
**Complication:** Medical overclaim risk; must stay non-diagnostic.

### 2. Constraint Automation Lanes

**Inspiration:** DAW automation lanes (Ardour).  
**Projects:** Ardour automation model (manual as mechanism quarry).  
**Mechanism:** Parameter curves over time attached to a parent “track,” modes Play/Write/Touch.  
**Inside Life Hub:** Temporary planned constraints (fat ceiling, exercise cap, protein floor, teaching load) drawn as lanes on the Life/Tasks calendar week — agents “play” them; Adam can touch-edit.  
**Hubs:** Life, Tasks, Teaching.  
**Combines with:** CN Constraints, flare protocol, Clare scheduling, meal plan capability.  
**Why new:** Not “better calendar” — temporal *control surfaces* for constraints.  
**UX:** Scrub week → see fat-limit lane dip on restaurant day → Brisket proposals respect lane.  
**Plausibility:** Medium — needs time-indexed constraint store.  
**Upside:** Makes clinical rules *operable*, not only prose.  
**Complication:** Conflict with static CN Constraints section.

### 3. Confirmable Branching Reality (“What-If Forks”)

**Inspiration:** Game save/fork (Lisien, linked-chain, hypertoken).  
**Projects:** [TacticalMetaphysics/Lisien](https://github.com/TacticalMetaphysics/Lisien), [david-chiabouri/linked-chain](https://github.com/david-chiabouri/linked-chain), [makkenzo/rollbackkit](https://github.com/makkenzo/rollbackkit).  
**Mechanism:** Snapshot → mutate on branch → compare → accept/reject/partial; undo via explicit handlers.  
**Inside Life Hub:** Fork schedule, task set, meal week, or Teaching unit sequence; show consequences; Confirm merges selected writes.  
**Hubs:** Life, Tasks, Teaching (+ Hammond).  
**Combines with:** `os.propose-action`, Teaching versions, Clare mutations, meal-plan capability.  
**Why new:** Teaching has history; nothing offers *alternate futures*.  
**UX:** “What if I move Pathways to next week?” → side-by-side deltas → Accept some.  
**Plausibility:** Medium-high for Tasks/Teaching; harder for Life markdown blobs.  
**Upside:** Changes product category toward decision OS.  
**Complication:** Cross-hub consistency + irreversible externals.

### 4. Action Preview / Undo Kit (Reversible Capability Runtime)

**Inspiration:** SaaS reversible actions.  
**Projects:** RollbackKit; root-core event invert.  
**Mechanism:** defineAction → preview impact → execute → snapshot → undo within window; refuse unsafe undo.  
**Inside Life Hub:** Formalise every confirm capability with preview payload + undo handler; timed undo becomes durable where safe.  
**Hubs:** All.  
**Combines with:** Confirm cards, governance log, propose-action.  
**Why new:** Confirm exists; *reversibility contract* does not.  
**UX:** After Confirm: “Undo until 22:00” with honest “CN patch irreversible without new proposal.”  
**Plausibility:** High for Blobs entities; medium for git-backed Life files.  
**Upside:** Trust at scale for agent writes.  
**Complication:** External side effects (Day One, email) honesty.

### 5. Gramps-Style Primary Object Fabric

**Inspiration:** Genealogy / archival PIM.  
**Projects:** [Gramps](https://github.com/gramps-project/gramps) data model (Person/Event/Place/Source/Citation + backlinks).  
**Mechanism:** Primary objects linked by handles; `find_backlink_handles`; citations as first-class.  
**Inside Life Hub:** Shared Person / Place / Event / Project / Concept handles referenced from diary, tasks, lessons, notes, CN — without forcing a graph DB.  
**Hubs:** All.  
**Combines with:** Calendar projections, Knowledge `connected[]`, Tasks projects, Teaching classes.  
**Why new:** Cross-hub today is projection + prose mail, not typed references.  
**UX:** Open “Corey” → every diary/trip/task/lesson mention with provenance.  
**Plausibility:** Medium — entity resolution is the hard part.  
**Upside:** Umbrella coherence.  
**Complication:** Identity merge conflicts; privacy of people entities.

### 6. Memory Archaeology

**Inspiration:** Digital humanities annotation + versioned meaning.  
**Projects:** Recogito / Recogito Studio; Tropy; Teaching `history-panel` as internal precedent.  
**Mechanism:** Time-indexed claims with sources; “first appearance,” “changed mind,” “what I knew then.”  
**Inside Life Hub:** Query across diary, CN patches, Knowledge pages, Vera sessions, Hammond goals for idea/decision genealogy.  
**Hubs:** Life, Knowledge, Personality Agents.  
**Combines with:** CN trends, research retrieval, chat history.  
**Why new:** Search finds strings; archaeology finds *evolution*.  
**UX:** “When did ‘finish MEd and be free’ appear?” → Apr 8 Hammond session + CN goal refresh.  
**Plausibility:** Medium — needs claim extraction + timestamps.  
**Upside:** Five-year compounding value.  
**Complication:** False “firsts”; agent prose ≠ user truth (admission rules).

### 7. Contextual Serendipity (Decay-Aware Resurfacing)

**Inspiration:** Spaced repetition / Remembrance Agent class systems.  
**Projects:** [Zijian-Ni/agent-memory](https://github.com/Zijian-Ni/agent-memory), Vestige (FSRS-6), SuperMemo concepts.  
**Mechanism:** Importance × recency × contextual similarity; decay unused; boost on retrieval.  
**Inside Life Hub:** Surface forgotten notes/diary/claims when context matches *and* item has decayed — not random note roulette.  
**Hubs:** Knowledge, Life, Teaching (revision).  
**Combines with:** Research RRF, quiz harvest, Clementine.  
**Why new:** Quiz is deliberate recall; serendipity is unsolicited-but-earned.  
**UX:** Quiet rail card: “You last touched this claim 11 months ago; today’s lesson tags overlap.”  
**Plausibility:** High on Knowledge embeddings; medium on Life.  
**Upside:** Delight + utility from archive depth.  
**Complication:** Noise; needs inhibition rules.

### 8. Selective Ambient Attention (Inhibit / Group / Silence)

**Inspiration:** Observability Alertmanager.  
**Projects:** Prometheus Alertmanager grouping + inhibition; Grafana notification policies.  
**Mechanism:** Group related signals; inhibit low-severity when root cause fires; repeat intervals.  
**Inside Life Hub:** Replace toast storms with a single ambient attention model for CN Flags, Tasks stress, stale Status, agent completions.  
**Hubs:** Life shell, Tasks.  
**Combines with:** Intuitive-scan, governance loops, home flags.  
**Why new:** Tasks scans exist; Life lacks a *policy* for worth-surfacing.  
**UX:** Rail pulse (grouped); open → one card explaining root signal + suppressed dependents.  
**Plausibility:** High conceptually; needs signal taxonomy.  
**Upside:** Proactivity without annoyance.  
**Complication:** Mis-inhibition hides real risk.

### 9. Schema-Constrained Ephemeral Interfaces

**Inspiration:** Generative UI with catalogs.  
**Projects:** [vercel-labs/json-render](https://github.com/vercel-labs/json-render) (mechanism; not React install).  
**Mechanism:** Model emits JSON constrained to trusted component catalog; host renders primitives.  
**Inside Life Hub:** Agents emit `compare | rank | schedule | approve | categorise` specs rendered with design-kit cards/sliders — temporary UIs that dissolve after Confirm.  
**Hubs:** All agents.  
**Combines with:** Round A choice/sources cards, confirm cards, propose-action.  
**Why new:** Round A stopped at structured segments; this is *workflow surfaces on demand*.  
**UX:** Hammond: “Rank these three Sem 2 options” → ephemeral ranking strip → Confirm decision ledger entry.  
**Plausibility:** High if catalog stays tiny and vanilla.  
**Upside:** Infinite workflows without infinite screens.  
**Complication:** Must forbid arbitrary HTML; React catalogs don’t match kit.

### 10. Command Registry Architecture (Actions, Not Search)

**Inspiration:** IDE/launcher command systems.  
**Projects:** acture parameterized command palette research; Raycast arguments; VS Code QuickInput.  
**Mechanism:** Registry of id/schema/run; palette is one consumer among agents/macros/tests.  
**Inside Life Hub:** Map `capabilities/registry.json` + hub mutations into one command ontology; Cmd+K becomes navigate **and** act.  
**Hubs:** All.  
**Combines with:** MiniSearch, promoted shortcuts, Clare mutations.  
**Why new:** Cmd+K today is retrieval/nav; shortcuts exist only as agent tools.  
**UX:** “Move unfinished Pathways to next week” as stepped command, not chat.  
**Plausibility:** High — registry already SSOT-shaped.  
**Upside:** Operability leap.  
**Complication:** Parameter UX without React form libs.

### 11. Reactive Computational Documents

**Inspiration:** Marimo / Observable / Quarto.  
**Projects:** [marimo-team/marimo](https://github.com/marimo-team/marimo), Observable Framework, Quarto OJS.  
**Mechanism:** Cells with data dependencies recompute; documents are apps.  
**Inside Life Hub:** Knowledge/Teaching objects with live query + calc + viz + optional agent gloss — not Python notebooks in-browser wholesale.  
**Hubs:** Knowledge, Teaching, Life (health briefings).  
**Combines with:** Teaching `html_app`, chart blocks, research, surface widgets.  
**Why new:** `html_app` is sandboxed HTML; reactivity + Life data binding is different.  
**UX:** “Protein adherence this term” page updates when meals sync.  
**Plausibility:** Medium — sandbox + data ACL hard.  
**Upside:** Personal computation environment.  
**Complication:** Security of live queries against private data.

### 12. Deterministic Decision Workbench

**Inspiration:** Constraint programming + decision analysis.  
**Projects:** Google OR-Tools, MiniZinc, Timefold/OptaPlanner (mechanism quarry).  
**Mechanism:** Hard/soft constraints → solver explores; human pins preferences; agent interprets.  
**Inside Life Hub:** Week meal/workout/task load under Crohn’s + school bells + deadlines.  
**Hubs:** Life, Tasks, Teaching.  
**Combines with:** Targets, CN Constraints, Clare, Ann sequencing.  
**Why new:** Agents advise; solvers *search*.  
**UX:** Adjust protein target slider → schedule reflows → Brisket narrates trade-offs.  
**Plausibility:** Medium — start tiny (meals or periods).  
**Upside:** Concrete “show me if.”  
**Complication:** Modelling cost vs benefit.

### 13. Structured Personality Disagreement

**Inspiration:** Deliberative / second-opinion patterns (not agent swarms).  
**Projects:** Research on debate protocols; product pattern from clinical second opinion — no single OS framework required.  
**Mechanism:** Explicit solicit of alternate personality; show points of agreement/conflict with shared evidence pack.  
**Inside Life Hub:** Hammond asks Chadwick *and* Sara about training during flare; UI shows conflict on exercise volume with shared calprotectin/CN rules.  
**Hubs:** Personality Agents, Life.  
**Combines with:** CN Constraints, hub-agent-context, evidence packs from #1.  
**Why new:** Cross-agent mail exists; *comparative deliberation UI* does not.  
**UX:** Split pane: recommendations + shared Must/Must-not from Constraints.  
**Plausibility:** High on prompt/UI; medium on fair evidence packing.  
**Upside:** Preserves personality identity with new value.  
**Complication:** Avoid fake debate theatre.

### 14. Decision Ledger with Assumption Watch

**Inspiration:** Finance risk / trading thesis journals; scientific lab notebooks.  
**Projects:** Lab notebook provenance patterns; Cyoda entity lifecycle (mechanism: state+history+transitions).  
**Mechanism:** Decision object: options, chosen, assumptions, revisit triggers.  
**Inside Life Hub:** MEd Sem 2, salary sacrifice, biologics chase become ledger entries agents can watch.  
**Hubs:** Life, Tasks, Hammond.  
**Combines with:** CN Flags, governance log, Clare deadlines.  
**Why new:** Goals exist; *assumption-triggered revisit* does not.  
**UX:** When “biologics awaiting script” flips, Hammond surfaces the linked decision.  
**Plausibility:** High.  
**Upside:** Longitudinal gold.  
**Complication:** Discipline to log decisions.

### 15. Live Cross-Hub Queries in Documents

**Inspiration:** Spreadsheet/live query / Notion rollups — but mine Observable dataflow.  
**Projects:** Observable reactive dataflow; DuckDB-WASM (optional later).  
**Mechanism:** Document embeds typed query against allowlisted collections.  
**Inside Life Hub:** Teaching unit page lists linked Knowledge sources with freshness; Life medical overview embeds latest bloods query.  
**Hubs:** Knowledge, Teaching, Life.  
**Combines with:** #11, calendar, attachments.  
**Why new:** Manual linking exists; *live* embedding does not.  
**UX:** Stale badge when underlying record newer than page.  
**Plausibility:** Medium.  
**Upside:** Documents stay true.  
**Complication:** Cache invalidation; offline.

### 16. Teaching Sequence Simulator

**Inspiration:** School timetabling solvers + game timeline branches.  
**Projects:** OptaPlanner school examples; Lisien multiverse time.  
**Mechanism:** Alternate unit sequences; compare load, outcome coverage, schedule collisions.  
**Inside Life Hub:** Ann proposes two sequences; Adam scrubs; Accept writes versioned lesson order.  
**Hubs:** Teaching.  
**Combines with:** Version history, schedule, outcomes, Ann diagnosis.  
**Why new:** Versions restore past; simulator explores *futures*.  
**UX:** Gantt-like sequence compare with outcome coverage bars.  
**Plausibility:** High — Teaching already richest structured model.  
**Upside:** Pedagogy planning leap.  
**Complication:** Outcome metrics may be thin.

### 17. Open-Loop Fabric

**Inspiration:** CRM activity / helpdesk queues / SRE incident boards.  
**Projects:** Mechanism from Alertmanager + CRM open activities — not a CRM product.  
**Mechanism:** Unified open loops: CN cross-agent lines, governance loops, Clare Later, stale Flags, expiring research briefs.  
**Hubs:** Life (home), all.  
**Combines with:** Hammond hubContext, `track` challenges, research expiring briefs.  
**Why new:** Pieces exist separately; no single operable fabric.  
**UX:** Home “Open loops (7)” with owners and age; close requires Confirm where durable.  
**Plausibility:** High.  
**Upside:** Operator clarity.  
**Complication:** Taxonomy design.

### 18. Promoted Shortcut Runtime (Visible Automation)

**Inspiration:** Raycast scripts / shell aliases / IFTTT-lite.  
**Projects:** Existing `os.promote-shortcut` + Raycast script commands as UX quarry.  
**Mechanism:** Detect repeated propose-action patterns → promote → run with Confirm.  
**Inside Life Hub:** First-class Shortcuts view; agents suggest promotion; Adam runs from Cmd+K.  
**Hubs:** All.  
**Combines with:** #10, governance log.  
**Why new:** Capability exists; product surface almost absent.  
**UX:** “Weekend flare meal plan” shortcut with last-run receipt.  
**Plausibility:** Very high.  
**Upside:** Small/transformative.  
**Complication:** Shortcut drift vs live constraints.

### 19. Entity Resolution Across Domains

**Inspiration:** CRM dedupe + genealogy merge + DH NER.  
**Projects:** Recogito NER; Gramps person merge patterns.  
**Mechanism:** Extract candidate entities; propose merges with evidence; human Confirm.  
**Inside Life Hub:** “Mary-anne Chamoun” across diary, CN, appointments, tasks.  
**Hubs:** Life, Knowledge, Tasks.  
**Combines with:** #5, calendar, capture tidy.  
**Why new:** Names are strings today.  
**UX:** Curator-like “entity tidy” pass.  
**Plausibility:** Medium.  
**Upside:** Enables fabric + archaeology.  
**Complication:** Ambiguous names; false merges.

### 20. Personal History Scrubber

**Inspiration:** Video editor / DAW transport.  
**Projects:** Ardour audition/scrub; NLEs conceptually.  
**Mechanism:** Continuous scrub across multi-track personal history with linked detail panes.  
**Inside Life Hub:** Scrub 2026 → meals/workouts/mood/CN Status/Teaching load move together.  
**Hubs:** Life (+ Teaching/Tasks overlays).  
**Combines with:** Calendar, charts, #2 lanes.  
**Why new:** Calendars show days; scrubbers show *continuous state*.  
**UX:** Hold-drag timeline; CN Status text updates to that day’s stamp.  
**Plausibility:** Medium-high for read-only.  
**Upside:** Delight + archaeology entry.  
**Complication:** Performance over years of markdown.

### 21. Evidence-Chain Explainability Surface

**Inspiration:** Clinical AI evidence chains (Nadi); SRE “why firing.”  
**Projects:** Nadi evidence-required outputs; agent-context-integrity rules (internal).  
**Mechanism:** Every proactive card / agent claim cites retrieval path: record SHA, CN section, intuition pack id, tool result.  
**Inside Life Hub:** “Why am I seeing this?” on ambient cards and confirm proposals.  
**Hubs:** All.  
**Combines with:** ACI Delivery proofs, governance log, #1 detectors.  
**Why new:** Debug instrumentation ≠ user trust UX.  
**UX:** Expand receipt under confirm card.  
**Plausibility:** High.  
**Upside:** Trust + debugging in one.  
**Complication:** Must not leak secrets; volume of evidence.

### 22. Constraint-Native Week Composer

**Inspiration:** Logistics / rostering.  
**Projects:** Timefold/OR-Tools; personalise with Life hard rules.  
**Mechanism:** Compose week under hard clinical + school-bell constraints; soft prefer spicy/Marley Spoon/etc.  
**Hubs:** Life, Tasks.  
**Combines with:** `plan.week-meals`, school bells in CN, AEKE sessions.  
**Why new:** Meal plan capability exists; *multi-domain constrained composition* does not.  
**UX:** One composer: meals + workouts + marking load.  
**Plausibility:** Medium.  
**Upside:** Real “Life OS” feeling.  
**Complication:** Overlap with #12; keep one investigation.

### 23. Intuition Observatory

**Inspiration:** Feature flags / rules engines / expert systems ops UIs.  
**Projects:** Internal `intuition/*.json` + `intuition.edit-pack`; Drools-like rule visibility as metaphor.  
**Mechanism:** List priors, which agents load them, last edit, conflict markers, fail-visible unload.  
**Hubs:** Operator / Life central.  
**Combines with:** ACI, week flags, flare rules.  
**Why new:** Packs are invisible infrastructure.  
**UX:** Toggle preview “without weekend-fat-risk” for negative control.  
**Plausibility:** Very high.  
**Upside:** Operability + ACI honesty.  
**Complication:** Editing priors is governance-sensitive.

### 24. Passage ↔ Block Provenance Links

**Inspiration:** TEI/citation scholarship; code “go to definition.”  
**Projects:** Recogito annotations; IDE symbol references metaphor.  
**Mechanism:** Span-level links from Teaching blocks to Knowledge passages and reverse backlinks.  
**Hubs:** Teaching, Knowledge.  
**Combines with:** Research retrieval, lesson blocks, attachments.  
**Why new:** Unit-level linking ≠ passage citation.  
**UX:** Click quote in lesson → jumps to note span; “used in 3 lessons.”  
**Plausibility:** Medium.  
**Upside:** Teaching authenticity.  
**Complication:** Offset stability when notes tidy.

### 25. Multi-Scale Information Architecture

**Inspiration:** GIS / strategy games / code navigation.  
**Projects:** Knowledge solar/show-all graph (internal); GIS semantic zoom concepts.  
**Mechanism:** Overview → cluster → object → detail with stable identity across scales (not only zoom animation).  
**Hubs:** Knowledge, Tasks (universe), Life history, Teaching scope.  
**Combines with:** Graphs, timelines, #20 scrubber.  
**Why new:** Round C absent; graphs exist but scales are separate apps.  
**UX:** Pinch from Life year → month → day → meal record.  
**Plausibility:** Medium.  
**Upside:** Cognitive map of a life.  
**Complication:** Design-kit fidelity; performance.

### 26. Dissolving Spatial Workspaces

**Inspiration:** Whiteboards / node editors — but ephemeral.  
**Projects:** tldraw (mechanism quarry); Excalidraw; Teaching graph-maker.  
**Mechanism:** Temporary spatial board for synthesis; export selected objects; discard board.  
**Inside Life Hub:** Ann/Clementine/Hammond co-layout a planning board that is not a permanent second PKM.  
**Hubs:** Teaching, Knowledge, Tasks.  
**Combines with:** #9 ephemeral UI, agent collaboration.  
**Why new:** Permanent whiteboard was rejected as default; *dissolving* boards are different.  
**UX:** “Open synthesis board” → arrange → “Commit 2 links + 1 task” → board gone.  
**Plausibility:** Medium.  
**Upside:** Thinking without archive debt.  
**Complication:** Accidental loss; export quality.

### 27. Partial-Accept Diff Review for Agent Writes

**Inspiration:** Git partial stage; Google Docs suggest mode; Teaching ai_accept.  
**Projects:** Teaching version/ai_accept (internal precedent); RollbackKit preview.  
**Mechanism:** Multi-hunk proposal; accept subset; rest discarded or deferred.  
**Hubs:** Life, Knowledge, Tasks (extend Teaching pattern).  
**Combines with:** Confirm cards, CN patches, Clare apply_mutations.  
**Why new:** Confirm is all-or-nothing per card today.  
**UX:** Checkboxes on fields/hunks inside confirm.  
**Plausibility:** High.  
**Upside:** Safer agent power.  
**Complication:** Dependent fields.

### 28. Longitudinal Pattern Miners (Non-LLM)

**Inspiration:** Scientific change detection; Fettle Spearman correlations.  
**Projects:** Fettle insights engine; classic time-series utilities.  
**Mechanism:** Deterministic miners: weekday/weekend split, streak breaks, flare correlates, marking-load vs workout gaps.  
**Hubs:** Life, Sara/Hammond tools.  
**Combines with:** #1, CN Long-Term Trends (today hand-written).  
**Why new:** Trends section is authored prose; miners would *propose* trend candidates for Confirm.  
**UX:** “Candidate pattern: workouts drop in weeks with 3+ late CN Flags.”  
**Plausibility:** High.  
**Upside:** Scales with data years.  
**Complication:** Spurious correlations; framing honesty.

### 29. Staged Delegation Chains

**Inspiration:** Workflow engines / approval pipelines.  
**Projects:** Emmett workflow proposal; Cyoda entity transitions; existing CN `Hammond→Clare` mail.  
**Mechanism:** Explicit multi-step delegation with states proposed → specialist draft → Adam Confirm → done; observable and reversible where possible.  
**Hubs:** Agents.  
**Combines with:** Cross-agent CN, Clare desk, Ann diagnosis.  
**Why new:** Mail lines exist; *staged pipeline UX* does not.  
**UX:** Pipeline chip on Home: “Hammond → Clare → awaiting Confirm (Pathways).”  
**Plausibility:** High.  
**Upside:** Multi-personality value without swarms.  
**Complication:** Abandoned pipelines clutter.

### 30. Personal Transform Pipelines

**Inspiration:** Unix pipes / Jupyter light / ETL micro.  
**Projects:** Observable; jq-like; internal tidy/retag flows.  
**Mechanism:** Input object(s) → named transform → new object with provenance.  
**Inside Life Hub:** Diary → entity extract → person cards; lesson → quiz harvest (exists) generalised; meals → weekly brief document.  
**Hubs:** Knowledge, Life, Teaching.  
**Combines with:** Capture tidy, quiz, research briefs, #11.  
**Why new:** One-off features exist; *reusable transform grammar* does not.  
**UX:** “Run transform: Week nutrition → CN Trends draft” → Confirm.  
**Plausibility:** Medium-high.  
**Upside:** Computational without full notebooks.  
**Complication:** Transform registry governance.

---

# 10 Emergent Combinations

1. **Baseline Drift (#1) + Ambient Attention (#8) + Evidence Chains (#21)** → Proactive Life that only speaks when multi-signal drift clears inhibition, and always shows why.  
2. **Branching Reality (#3) + Partial Accept (#27) + RollbackKit (#4)** → Safe alternate futures that can merge incompletely and undo.  
3. **Object Fabric (#5) + Entity Resolution (#19) + Memory Archaeology (#6)** → People/places/events become navigable history, not strings.  
4. **Command Registry (#10) + Promoted Shortcuts (#18) + Ephemeral UI (#9)** → Operator OS: find → parameterise → temporary UI → Confirm.  
5. **Constraint Lanes (#2) + Week Composer (#12/#22) + Agents** → Time-varying clinical constraints drive solvable week plans agents narrate.  
6. **Open-Loop Fabric (#17) + Staged Delegation (#29) + CN mail** → Visible cross-personality work without swarm frameworks.  
7. **Computational Docs (#11) + Live Queries (#15) + Passage Links (#24)** → Teaching/Knowledge as living scholarly layer over Life data.  
8. **Serendipity (#7) + Quiz + Claim Spine** → Spaced resurfacing that feeds practice and Clementine.  
9. **History Scrubber (#20) + Pattern Miners (#28) + Decision Ledger (#14)** → Scrub to a date, see patterns and decisions active *then*.  
10. **Intuition Observatory (#23) + Disagreement (#13) + ACI** → Operators can see which priors shaped which personality’s stance.

---

# Life Hub Is Already Closer To This Than It Looks

| Resulting capability | Existing pieces | Missing piece |
|----------------------|-----------------|---------------|
| Action OS | `capabilities/registry.json`, propose-action, Cmd+K, confirm cards, promoted shortcuts | Unified command consumers + operator Shortcuts UI |
| Selective proactivity | Tasks intuitive-scan/stress; CN Flags; Home open governance loop; CN staleness rules | Attention policy (group/inhibit) + Life ambient surface |
| Reversible agent power | Teaching versions; timed undo; confirm cards; governance log | Preview/undo contracts + partial accept on Life/Tasks |
| Cross-hub timeline | Calendar sources for Knowledge/Tasks/Teaching; hub-agent-context | Typed deep links + backlinks |
| Constraint-aware planning | CN Constraints; flare intuition; `plan.week-meals`; school bells | Time-indexed lanes + solver/composer |
| Prior transparency | `intuition/*.json`, `intuition.edit-pack`, week flags | Observatory UI + negative-control preview |
| Sleep/heart domains | `TYPE_DOMAINS` + validators + calendar colours | Tabs, agents hooks, home metrics |
| Ephemeral agent UI | choice/sources cards, confirm cards, surface widgets | Catalog + dissolve lifecycle |
| Pattern intelligence | Hand-authored CN Long-Term Trends; weekend-fat-risk pack | Deterministic miners proposing Confirmable trends |
| Open loops | Cross-agent lines, Clare Later, challenges, expiring briefs | Single fabric taxonomy + Home UX |

---

# Things Worth Stealing From Unrelated Software

### DAW (Ardour)
**Mechanism:** Automation lanes + Play/Write/Touch.  
**Reinterpretation:** Time-varying personal constraints and planned load.

### Genealogy (Gramps)
**Mechanism:** Primary objects + handle backlinks + citations.  
**Reinterpretation:** Cross-hub Person/Place/Event fabric.

### Game engines (Lisien / linked-chain)
**Mechanism:** Branching timelines / save forks.  
**Reinterpretation:** What-if schedules and Teaching sequences.

### Observability (Alertmanager)
**Mechanism:** Grouping + inhibition + repeat intervals.  
**Reinterpretation:** Worth-surfacing policy for Life attention.

### Digital humanities (Recogito / Tropy)
**Mechanism:** Semantic annotation + provenance + research photo metadata.  
**Reinterpretation:** Passage citations; capture provenance; memory archaeology.

### Quantified-self detectors (Fettle)
**Mechanism:** Deterministic insights; LLM only narrates.  
**Reinterpretation:** Sara/Brisket tool layer that cannot invent maths.

### IDE command architecture (VS Code / acture)
**Mechanism:** Command registry with schemas; palette is a view.  
**Reinterpretation:** Capabilities become operable commands.

### Generative UI catalogs (json-render)
**Mechanism:** Constrained component JSON.  
**Reinterpretation:** Ephemeral design-kit workflows (vanilla catalog).

### Constraint solvers (OR-Tools / Timefold)
**Mechanism:** Hard/soft constraint search.  
**Reinterpretation:** Week composition under Crohn’s + bells + deadlines.

### Video/NLE transport
**Mechanism:** Scrubbing continuous media.  
**Reinterpretation:** Scrub continuous personal state.

### RollbackKit
**Mechanism:** Preview → execute → undo with honesty about irreversibles.  
**Reinterpretation:** Confirm-card evolution.

### Spreadsheet/reactive notebooks (Observable/marimo)
**Mechanism:** Dependent recomputation.  
**Reinterpretation:** Live Life/Knowledge documents.

---

# Weird But Plausible

1. **Personality “ghost tracks”** — scrub history and hear/see what Chadwick would have said given *that day’s* CN Constraints (replay with frozen context).  
2. **Flare weather map** — GIS-like heat overlay of GI risk across calendar using fat/sodium/restaurant markers (not a real map of Sydney).  
3. **Teaching load as audio metering** — DAW-style meters for cognitive load per period; clip = overload.  
4. **Save-scumming marking week** — fork Tasks+Teaching Friday plan; keep the branch that cleared outcomes.  
5. **Contradiction cricket** — Knowledge claim-spine vs diary mood vs CN Status; ambient only when contradictions persist ≥N days.  
6. **Agent receipt tattoos** — every durable write leaves a small provenance glyph on the record forever (museum accession mark).  
7. **Dissolving war rooms** — 25-minute spatial board with auto-export and auto-destroy (Pomodoro × whiteboard).  
8. **Constraint karaoke** — Touch-write a fat-limit lane while scrubbing last weekend’s actual intake as ghost waveform.  
9. **Second-brain archaeology dig sites** — mark a “dig” around a date range; agents only retrieve within the trench.  
10. **Negative-space Home** — render what *didn’t* get logged (sleep gap, diary gap) as first-class ambient structure (CN already notes gaps).

---

# Small But Transformative

1. **Shortcuts operator view** for existing promote/list/run tools.  
2. **Partial-accept checkboxes** on confirm cards.  
3. **“Why this?” evidence footer** on ambient/proactive cards.  
4. **Open-loops Home strip** aggregating existing CN/Clare/governance signals.  
5. **Intuition Observatory read-only** list of loaded packs per agent.  
6. **Sleep domain tab** on existing record plumbing.  
7. **Typed deep link** from calendar event → originating hub object (one direction first).  
8. **Confirm receipts** that stay as past-tense cards (Round A gap).  
9. **Disagreement button** “Ask Sara too” with shared Constraints pack.  
10. **Expiring research brief badges** already capability-backed.

---

# If This System Contains Five Years Of My Life

Unusually valuable only with longitudinal depth:

- Memory archaeology (#6) and decision ledger (#14).  
- Baseline drift + pattern miners (#1, #28).  
- Serendipitous resurfacing of forgotten Knowledge (#7).  
- History scrubber across eras (#20).  
- Entity fabric for recurring people/places (#5/#19).  
- Assumption watches that fire years later (#14).  
- Teaching passage provenance as a career archive (#24).  
- Constraint-lane archaeology: how clinical rules evolved (#2 + CN history).

Prioritise foundations that *accumulate*: provenance, entity handles, decision objects, deterministic series, version/branch metadata — even if UX is thin at first.

---

# What This Could Do To The Personalities

| Dimension | Shift |
|-----------|-------|
| Situational awareness | Detectors + open-loop fabric feed facts before chat. |
| Temporal awareness | Scrubber + archaeology + assumption watches. |
| Reversible proposals | Branch + partial accept + undo contracts. |
| Temporary tools | Ephemeral schema UIs instead of long prose. |
| Selective insight | Inhibition policy; silence as a feature. |
| Provenance | Evidence chains on every claim/action. |
| Cross-hub reasoning | Typed references + live queries beat pasted summaries. |
| Computational assistance | Solvers/miners; personalities interpret, don’t invent maths. |
| Identity-preserving collaboration | Disagreement + staged delegation, not swarms. |
| Honesty under failure | Intuition observatory + fail-visible pack/CN load (ACI). |

Net: personalities become **operators of instruments**, not only conversationalists.

---

# Life — Future Capabilities

1. Baseline drift engine + ambient inhibition.  
2. Constraint automation lanes on the week.  
3. History scrubber across domains.  
4. Open-loop fabric on Home.  
5. Sleep/heart first-class domains (latent unlock).

# Knowledge — Future Capabilities

1. Memory archaeology over notes + claims.  
2. Contextual serendipity with decay.  
3. Passage-level links to Teaching.  
4. Reactive/live query documents.  
5. Entity-resolved people/places across notes.

# Tasks — Future Capabilities

1. What-if forks of schedules/boards.  
2. Command-registry actions for bulk moves.  
3. Constraint-aware week composer with Life rules.  
4. Staged delegation pipelines with Clare.  
5. Stress signals feeding umbrella attention policy.

# Teaching — Future Capabilities

1. Sequence simulator with compare/accept.  
2. Passage ↔ Knowledge provenance.  
3. Dissolving synthesis boards for unit planning.  
4. Computational lesson blocks bound to live data.  
5. Partial-accept already native — export pattern to umbrella.

# Personality Agents — Future Capabilities

1. Structured disagreement with shared evidence.  
2. Ephemeral tool UIs from trusted catalog.  
3. Detector tools (drift/patterns) under ACI Delivery proof.  
4. Branch proposals instead of immediate confirm-all.  
5. Intuition observatory transparency + negative controls.

---

# Second-Pass Evaluation

Scale 0–5. Effort: S / M / L / XL. Arch: low / med / high. OSS maturity: thin / mixed / strong.

| # | Cap | Nov | Use | Xform | Delight | XHub | Agent | Fit | Tech | Comp | Long | Effort | Arch | OSS |
|---|-----|-----|-----|-------|---------|------|-------|-----|------|------|------|--------|------|-----|
| 1 | Baseline drift | 4 | 5 | 4 | 3 | 2 | 5 | 5 | 4 | 4 | 5 | M | med | strong |
| 2 | Constraint lanes | 5 | 4 | 4 | 4 | 4 | 4 | 5 | 3 | 4 | 4 | L | high | mixed |
| 3 | Branching reality | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 3 | 5 | 5 | XL | high | mixed |
| 4 | Preview/undo kit | 3 | 5 | 4 | 3 | 5 | 5 | 5 | 4 | 5 | 5 | M | med | strong |
| 5 | Object fabric | 4 | 5 | 5 | 3 | 5 | 4 | 5 | 3 | 5 | 5 | XL | high | strong |
| 6 | Archaeology | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 5 | L | med | mixed |
| 7 | Serendipity | 3 | 4 | 3 | 5 | 3 | 3 | 4 | 4 | 3 | 5 | M | low | mixed |
| 8 | Ambient attention | 4 | 5 | 4 | 3 | 4 | 3 | 5 | 4 | 4 | 4 | M | med | strong |
| 9 | Ephemeral UI | 4 | 4 | 4 | 4 | 5 | 5 | 4 | 3 | 5 | 4 | L | med | strong* |
| 10 | Command registry | 3 | 5 | 4 | 3 | 5 | 4 | 5 | 5 | 5 | 4 | M | med | strong |
| 11 | Computational docs | 4 | 3 | 4 | 4 | 4 | 3 | 3 | 2 | 4 | 4 | XL | high | strong |
| 12 | Decision workbench | 4 | 4 | 4 | 3 | 4 | 4 | 4 | 3 | 4 | 4 | L | med | strong |
| 13 | Disagreement | 4 | 4 | 3 | 4 | 3 | 5 | 5 | 4 | 3 | 3 | S | low | thin |
| 14 | Decision ledger | 3 | 5 | 4 | 2 | 4 | 4 | 5 | 5 | 4 | 5 | S | low | thin |
| 15 | Live queries | 3 | 4 | 3 | 3 | 5 | 2 | 4 | 3 | 4 | 4 | L | med | mixed |
| 16 | Sequence sim | 4 | 4 | 4 | 3 | 2 | 4 | 5 | 4 | 3 | 4 | M | med | mixed |
| 17 | Open-loop fabric | 3 | 5 | 3 | 2 | 5 | 4 | 5 | 5 | 4 | 4 | S | low | thin |
| 18 | Shortcuts runtime | 2 | 5 | 3 | 3 | 5 | 4 | 5 | 5 | 4 | 3 | S | low | mixed |
| 19 | Entity resolution | 3 | 4 | 4 | 2 | 5 | 3 | 4 | 3 | 4 | 5 | L | med | mixed |
| 20 | History scrubber | 4 | 4 | 3 | 5 | 4 | 2 | 4 | 3 | 3 | 5 | L | med | thin |
| 21 | Evidence chains | 3 | 5 | 3 | 2 | 4 | 5 | 5 | 5 | 4 | 4 | S | low | thin |
| 22 | Week composer | 3 | 4 | 4 | 3 | 4 | 4 | 4 | 3 | 4 | 4 | L | med | strong |
| 23 | Intuition observatory | 3 | 4 | 2 | 2 | 3 | 5 | 5 | 5 | 3 | 3 | S | low | thin |
| 24 | Passage links | 4 | 4 | 3 | 3 | 4 | 3 | 5 | 3 | 3 | 5 | M | med | mixed |
| 25 | Multi-scale IA | 3 | 3 | 3 | 4 | 4 | 1 | 3 | 3 | 3 | 4 | L | med | mixed |
| 26 | Dissolving boards | 4 | 3 | 3 | 5 | 4 | 4 | 3 | 3 | 3 | 3 | L | med | strong |
| 27 | Partial accept | 2 | 5 | 3 | 3 | 5 | 5 | 5 | 4 | 4 | 4 | S | low | thin |
| 28 | Pattern miners | 3 | 4 | 3 | 2 | 2 | 4 | 5 | 4 | 3 | 5 | M | low | strong |
| 29 | Delegation chains | 3 | 4 | 3 | 3 | 4 | 5 | 5 | 4 | 3 | 3 | M | med | mixed |
| 30 | Transform pipelines | 3 | 4 | 3 | 3 | 4 | 3 | 4 | 3 | 4 | 4 | M | med | mixed |

\*json-render is React-heavy; steal mechanism, not stack.

### Classification

| Class | Items |
|-------|-------|
| **EXPLORE NOW** | 3 Branching Reality; 5 Object Fabric; 1 Baseline Drift; 10 Command Registry |
| **HIGH-UPSIDE** | 2 Constraint Lanes; 6 Archaeology; 9 Ephemeral UI; 11 Computational Docs; 12/22 Composer |
| **QUICK CAPABILITY** | 18 Shortcuts; 17 Open loops; 27 Partial accept; 21 Evidence; 23 Observatory; 13 Disagreement; 14 Ledger |
| **LONG-TERM BET** | 6 Archaeology; 7 Serendipity; 5 Fabric; 20 Scrubber; 24 Passage links; 28 Miners |
| **PRESERVE** | 4 Undo kit; 8 Ambient attention; 16 Sequence sim; 19 Entity resolution; 29 Delegation; 30 Transforms |
| **INTERESTING BUT WEAK** | 25 Multi-scale (as standalone); 26 Dissolving boards (until use case pinned); 15 Live queries alone |
| **GENUINELY REJECT** | Embed n8n wholesale; agent swarm frameworks; arbitrary model HTML; random-note gimmicks; “add another chart/calendar/editor”; full event sourcing for its own sake |

---

# The 15 Worth Keeping

1. **Confirmable Branching Reality** — changes product class; Teaching versions + propose-action are runway. Next: scope one Tasks schedule fork MVP.  
2. **Personal Baseline Drift Engine** — deterministic intelligence Life uniquely needs. Next: define signal list + multi-signal gate.  
3. **Gramps-Style Object Fabric** — unlocks archaeology, calendar depth, agent reasoning. Next: Person handle prototype across diary+tasks.  
4. **Command Registry Architecture** — capabilities already want this. Next: map registry → Cmd+K actions.  
5. **Selective Ambient Attention** — makes proactivity safe. Next: signal taxonomy + inhibition rules.  
6. **Action Preview/Undo Kit** — trust layer for all agent power. Next: invent undo contract for one Blobs entity.  
7. **Schema-Constrained Ephemeral UI** — workflows without permanent screens. Next: vanilla catalog of 6 primitives.  
8. **Open-Loop Fabric** — operator clarity from existing pieces. Next: Home aggregation spec.  
9. **Memory Archaeology** — five-year payoff. Next: claim extraction design without promoting agent inference to truth.  
10. **Constraint Automation Lanes** — operable clinical rules. Next: week-scoped fat-limit lane prototype on fixtures.  
11. **Promoted Shortcuts Runtime** — smallest automation that fits. Next: operator UI only.  
12. **Partial-Accept Diff Review** — immediate agent UX win. Next: confirm-card hunk UI.  
13. **Structured Personality Disagreement** — multi-agent value without swarms. Next: shared evidence pack format.  
14. **Teaching Sequence Simulator** — best Teaching-native transformative bet. Next: compare two unit orders.  
15. **Decision Ledger + Assumption Watch** — cheap, compounds. Next: schema + CN Flag triggers.

---

# The Five That Could Change What Life Hub Is

### 1. Confirmable Branching Reality
**Today:** Propose → confirm → live truth.  
**Future:** Explore alternate weeks/sequences; merge chosen deltas.  
**Why:** Moves from log+chat to **decision instrument**.  
**Foundations:** propose-action, Teaching versions, Clare mutations, RollbackKit patterns.  
**Inspiration:** Lisien / linked-chain / game forks.  
**Biggest unknown:** Cross-hub consistency semantics.

### 2. Cross-Hub Object Fabric
**Today:** Hubs share calendar projections and prose coordination.  
**Future:** Objects cite people/places/events/projects with backlinks.  
**Why:** Umbrella becomes one world, not four apps.  
**Foundations:** `connected[]`, projects, classes, calendar IDs.  
**Inspiration:** Gramps primary objects.  
**Biggest unknown:** Entity resolution quality.

### 3. Deterministic Personal Intelligence Layer
**Today:** Agents infer; CN Trends hand-authored.  
**Future:** Detectors own maths; agents narrate and act under confirm.  
**Why:** Trustworthy proactivity + ACI-friendly tools.  
**Foundations:** time-series records, intuition packs, home model.  
**Inspiration:** Fettle / Nadi.  
**Biggest unknown:** Which signals are worth detecting first.

### 4. Operator Action OS (Commands + Shortcuts + Ephemeral UI)
**Today:** Chat-heavy mutation; Cmd+K navigates; shortcuts hidden.  
**Future:** Keyboard/agent/macro shared command ontology with temporary UIs.  
**Why:** Life Hub becomes operable like an IDE/OS, not only browsable.  
**Foundations:** capabilities registry, MiniSearch, design-kit cards.  
**Inspiration:** acture / Raycast / json-render mechanisms.  
**Biggest unknown:** How small the trusted catalog can stay.

### 5. Longitudinal Memory Archaeology
**Today:** Search and graphs find items.  
**Future:** Ask how ideas/decisions/constraints evolved.  
**Why:** Unique value of *years* of private data.  
**Foundations:** dated records, CN history, Vera sessions, Knowledge archive.  
**Inspiration:** DH annotation + versioned meaning.  
**Biggest unknown:** Claim extraction without fake certainty.

---

# The One

**Commission:** Confirmable Branching Reality (temporary alternate Life/Tasks/Teaching state with consequence compare, partial accept, and explicit undo).

**Why this one:** Highest joint score of usefulness, originality, fit, leverage, and long-term potential. It reuses the sacred confirm-before-write ethic instead of bypassing it. It multiplies agents (they propose branches), Teaching (versions become futures), Tasks (schedule forks), and Life (meal/constraint scenarios). It is not another chat feature, not Round A–D redux, and it directly answers “what kinds of SOFTWARE could Life Hub become?” — a **personal simulation/decision OS**.

---

# The Sleeper

**Selective Ambient Attention (Alertmanager-style inhibition) + Open-Loop Fabric.**

Easy to underestimate as “notification polish.” Actually determines whether *any* proactive intelligence is livable. Without it, baseline drift, stress scans, and agent completions degrade into noise and get ignored. With it, smaller detectors become precious.

---

# The Wildcard

**Constraint Automation Lanes borrowed from DAWs.**

Surprising: music production as the model for clinical/personal constraint over time. Technically plausible as week-scoped curves feeding planners and agents. If it works, Life Hub looks like nothing else in personal productivity — a mix of EHR constraints, calendar, and mixer automation.

---

# Repositories Worth A Dedicated Future Audit

| Repository | Capability | Why It Matters | Role | Suggested Future Focus |
|------------|------------|----------------|------|------------------------|
| makkenzo/rollbackkit | Reversible actions | Confirm/undo contracts | Quarry / candidate patterns | Action OS |
| TacticalMetaphysics/Lisien | Branching time | What-if semantics | Research reference | Branching Reality |
| david-chiabouri/linked-chain | Forkable history structs | TS-friendly branch model | Quarry | Branching Reality |
| gramps-project/gramps | Primary object model | Cross-hub fabric | Research reference | Object Fabric |
| Deekshith-Dade/fettle | Deterministic health insights | LLM-narrates-only pattern | Quarry | Baseline Drift |
| HawaleShailesh004/nadi | Evidence-required alerts | Trust UX | Research reference | Evidence + Drift |
| vercel-labs/json-render | Constrained gen UI | Ephemeral workflows | Mechanism quarry (not React adopt) | Ephemeral UI |
| marimo-team/marimo | Reactive docs | Computational Knowledge | Research reference | Computational Docs |
| google/or-tools | Constraint solving | Week composition | Candidate / quarry | Decision Workbench |
| TimefoldAI/timefold-solver | Scheduling heuristics | Teaching/Life rostering | Research reference | Sequence / week |
| tropy/tropy | Research capture metadata | Provenance for capture | Quarry | Archaeology / capture |
| recogito / Recogito Studio | Semantic annotation | Passage provenance | Research reference | Passage links |
| Zijian-Ni/agent-memory | Decay-aware memory | Serendipity mechanics | Quarry | Serendipity |
| prometheus/alertmanager | Group/inhibit | Attention policy | Research reference | Ambient Attention |
| i2mint/acture (docs) | Command registry architecture | Palette-as-view | Research reference | Command OS |
| flammafex/hypertoken | Forkable CRDT state | Extreme branch inspiration | Research reference | Wildcard branching |
| observablehq/framework | Reactive JS docs | Live documents on static hosts | Quarry | Computational Docs |
| root-core (minamorl) | Algebraic undo events | Event invert ideas | Research reference | Undo kit |

---

# Genuine Rejects

- Wholesale n8n/Zapier embed as “automation strategy.”  
- Multi-agent swarm frameworks as the collaboration model.  
- Arbitrary model-generated HTML/JS.  
- Random note of the day without decay/context.  
- Full event sourcing of Life markdown “because architecture.”  
- Replacing design-kit with React generative UI stacks.  
- Another chart/calendar/editor/uploader/graph library as a discovery.  
- Medical diagnosis claims from detectors.  
- Permanent infinite whiteboard as default Knowledge UI.

---

# Major Questions Raised

1. What is the smallest **branch** that is still useful — Tasks only, Teaching only, or cross-hub from day one?  
2. Should **Central Node** become versioned/branch-aware, or remain linear with patches?  
3. How do we encode **attention policy** without recreating notification settings hell?  
4. Where does **entity truth** live if `life-hub-data` shape is frozen — sidecar index, or allowlisted new paths?  
5. Can computational documents stay inside **security/CORS/session** invariants?  
6. Which deterministic detectors are **ACI-Delivery-tested** first (pain/flare/fat)?  
7. How much of json-render’s catalog idea can be done with **vanilla design-kit** primitives?  
8. Is Clementine’s CN bypass still correct once fabric/archaeology exist?  
9. What is the operator UX for **intuition packs** without inviting reckless prior edits?  
10. After five years, is the primary interface a **scrubber**, a **command OS**, or still chat-first?

---

*End of discovery report. No production code changes. No commit, push, PR, or merge performed for this work.*
