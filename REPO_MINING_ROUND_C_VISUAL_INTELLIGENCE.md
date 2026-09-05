# REPO MINING ROUND C — Visual Intelligence

**Date:** 2026-09-05 (revised same day after multi-representation challenge)  
**Scope:** Sigma.js, Graphology, Apache ECharts, Schedule-X, vis-timeline, Frappe Gantt  
**Umbrella:** Life Hub (`apps/life`, `apps/knowledge`, `apps/tasks`, `apps/teaching`, `packages/design-kit`, `capabilities/`)  
**Git policy:** Adam approved full implementation after the revised audit — ship on a feature branch with commit / push / PR.

---

## Executive summary

The real Round C question is not “which chart library should we install?”

It is:

> Can Life Hub turn the **same underlying objects** into coherent visual representations — list, board, calendar, Gantt, timeline, graph, trend — and can personalities operate over those representations via Round A Tool UI patterns?

### First-pass mistake (corrected here)

The first draft rejected Schedule-X, vis-timeline, and Frappe largely because “custom equivalents exist.” That was too thin.

**Engines exist. Multi-representation coherence does not.**

| What exists | What fails |
|-------------|------------|
| Tasks list, board, calendar, Gantt | Selection dies on view switch; calendar ids are `task:${id}` vs raw id; undated tasks vanish from calendar/Gantt; no general chronology timeline |
| Teaching class calendar + scope timeline | Schema links exist; UI hops between lesson calendar ↔ scope unit are missing |
| Life calendar + medical spine + charts | Same `record.id` in places; selection is siloed; diary→chart→calendar loop breaks at sheets |
| Knowledge graph + search | Separate query state; archive idea chronology was **deliberately removed** |
| Tasks Gantt (stronger than Frappe) | Agents cannot edit deps; confirm cards cannot show proposed calendar/Gantt state |

### Revised dependency stance

Still **do not install** Schedule-X / Frappe / ECharts / Sigma as production deps — they duplicate engines without creating the glue.

**Upgrade vis-timeline** from “reject” to **B — PROTOTYPE** (mechanism + optional thin integration spike) for the missing **chronology** job: Tasks general timeline, Life history unfold, Knowledge idea development. Mine heavily even if the dep is later declined.

**Elevate architecture work above library choice:**

1. **Focus contract** — `focus({ hub, type, id })` survives list↔board↔calendar↔Gantt↔timeline↔graph.
2. **View projections** that do not drop objects (undated / unscheduled lanes).
3. **Teaching calendar ↔ scope** deep links.
4. **Agent `schedule_diff` / highlight payloads** → ghost calendar/Gantt on confirm-card path (Round A Tool UI).
5. Thin **visual grammar** (time / state / selection) so the same task feels related across views.
6. Catalog-validated chart/graph evidence for Chadwick/Clare — not charts inside chat chrome.

Round A/B constraints (recovered from sibling agents):

| Round | Constraint for Round C |
|-------|-------------------------|
| A | Tool UI React rejected. Structure via typed SSE + kit. Charts/timelines stay **domain-owned surfaces**; agents name catalog payloads / patches — they do not embed ECharts/Schedule-X in chat. Confirm-card owns writes. |
| B | Motion/MiniSearch/DnD: kit owns motion; MiniSearch feeds entity search → can feed graph/calendar highlight; DnD persist+reload remains the bar. |

---

## REVISION — Multi-representation coherence

### The opportunity (accepted)

Same object, many honest views:

```
Tasks:     list → board → calendar → Gantt → timeline
Teaching:  unit → lessons → scope-and-sequence → assessment calendar → progress
Knowledge: notes → search → graph → chronological idea development
Life:      diary/events → timeline → trends → correlations → calendar
```

Personalities over those views:

- Chadwick: “volume dropped here” → catalog chart + highlight range → open workout
- Clare: related cluster → `graphFocus` / diary neighbourhood
- Tasks agent: propose reschedule of three tasks → **ghost calendar state** on confirm-card, not prose alone

This is Round A Tool UI done right: **typed structure → trusted Life Hub renderer**.

### What the codebase actually has

#### Tasks — identity without coherence

| View | Identity | Gap |
|------|----------|-----|
| Board/list | `task.id` | Fine |
| Calendar | `task:${task.id}` (`domain/calendar.ts`) | Namespaced; selection not shared |
| Gantt | raw `task.id` (`domain/gantt.ts`) | Local `previewId` only |
| Excursion timeline | task id / placeholders | Excursion-only — **not** a general Tasks timeline |
| Dashboard “timeline” | due buckets | List chronology, not zoomable history |

Route remounts wipe selection (`isSoftViewChange` only soft-switches week↔month). Tasks **without `due_date` disappear** from calendar and Gantt. Gantt invents span from due − estimate; calendar is a point — same task, different geometry.

Dependency editing is **Gantt-only**; `sanitizeTaskPatch` omits `depends_on` / `dependency_links` — agents cannot operate on Gantt semantics.

**Frappe Gantt** would not fix this. Tasks Gantt already beats Frappe on FS/SS/FF, offsets, critical path, cascade. The missing piece is **timeline as a fifth representation** + **focus glue**, not a prettier bar library.

#### Teaching — linked data, unlinked surfaces

`ScheduledLesson` carries `lesson_id` / `unit_id` / `date`. Scope `timeline_items` carry `unit_id`. Progress helpers exist (`unit-progress.ts`).

But: class calendar chip → lesson page; scope bar → unit page; **neither jumps to the other with shared selection**. Class calendar “timeline” mode is a day list of scheduled lessons — not the scope Gantt. Assessment calendar is not first-class.

Schedule-X would replace the calendar chrome; it would not create calendar↔scope coherence.

#### Life — shared records, siloed selection

Calendar and medical spine both use `record.id` in models. Mind charts bind marks to thread sheets (text), not calendar/diary editor. Medical `selectedId` and calendar `calendarSelectedEventId` do not bridge.

vis-timeline’s continuous years→days camera is the closest library match to “how did this unfold?” — medical spine has density steps (weeks/months/years) but not that camera UX, and not the cross-section drill path.

#### Knowledge — graph without chronology axis

Archive Timeline was **removed** (`docs/superpowers/specs/2026-08-17-remove-timeline-design.md`). University timeline remains for degree structure only. List `query` and graph `graphSearch` are separate — opening Graph does not carry hits into `searchCluster`.

The Knowledge multi-rep vision’s chronology leg is **absent by product decision**, not pending a library. Restoring idea chronology is a product call; vis-timeline is a candidate engine **if** that call is remade.

### Library reassessment under this lens

| Library | First draft | Revised | Why |
|---------|-------------|---------|-----|
| **Frappe Gantt** | F reject | **F reject** (unchanged) | Does not create multi-view; weaker than Tasks Gantt |
| **Schedule-X** | F reject | **F reject / D reference** | Does not create Teaching↔Life identity; hub calendar already multi-source |
| **vis-timeline** | C mine / F dep | **B PROTOTYPE** (chronology) + **C mine** | Only Round C lib that targets a **missing representation** (general timeline), not a duplicate engine |
| **ECharts** | C mine / F dep | **C mine / F dep** (unchanged) | Brush/link ideas for chart-kit; still conflicts CHARTS.md |
| **Sigma** | F | **F** (unchanged) | Rendering not the coherence problem |
| **Graphology** | C mine | **C mine** (unchanged) | Metrics for graph question modes |

### vis-timeline — why the upgrade

Calendar answers: *what happens on this date?*  
Gantt answers: *what depends on what, and how long?*  
Timeline answers: *how does this unfold across scales?*

Life Hub has strong calendar + strong Tasks Gantt + strong Teaching scope. It does **not** have a general timeline representation for:

- Tasks project history without forcing dependency semantics  
- Life personal/medical unfold with continuous zoom  
- Knowledge idea development over years→days (if product restores it)

That is the Schedule-X vs vis-timeline vs Frappe matrix done properly: **three jobs, not three libraries**. Two jobs are owned. The third is thin.

**Prototype permission:** spike vis-timeline on **one** real surface (prefer Life medical spine or a Tasks project chronology) with domain adapter `toTimelineItem(record)` — verify zoom, select → open record, mobile pinch. If kit-native camera can match in similar code, decline the dep and keep the UX.

### Agent + Tool UI (Round A) — concrete path

Round A: no React Tool UI; no charts-in-chat; confirm-card owns writes; typed SSE segments.

Round C multi-rep plugs in as:

```
Agent emits typed payload
  → validate (catalog / schema allowlist)
  → either:
      (a) inform: hub surface / kit renderer (chart-kit, graphFocus, calendar highlight)
      (b) write: confirm-card with optional ghost calendar/Gantt preview
  → apply → focus(ids) across views
```

Highest-value new payload shapes (not libraries):

1. `highlight_range` — `{ catalogId, dataRef, from, to }` for Chadwick  
2. `focus_cluster` — `{ pageIds[] }` for Clare / Knowledge graph  
3. `schedule_diff` — `{ items: [{ id, from, to }] }` → ghost events on existing calendar → confirm apply  

Extend `publish.surface-widget` allowlist only for durable hub-tab evidence widgets — same discipline as challenge-progress / meal-plan-week.

### Revised top six (multi-rep first)

1. **Focus / selection contract across views** (Tasks first: board↔calendar↔Gantt)  
2. **Chronology representation** — prototype vis-timeline **or** native spine camera; Tasks general timeline + Life unfold  
3. **Agent `schedule_diff` + ghost calendar** on confirm-card (Tool UI path)  
4. **Teaching calendar ↔ scope deep link**  
5. **Knowledge search → graphFocus** (+ decide whether idea chronology returns)  
6. **Chart-kit interactive board + visual grammar** (Life trends; de-radialise)

Dependencies still worth adding from Round C: **none required**; vis-timeline only after prototype wins on a real surface.

---

## Current Life Hub visualisation baseline

### Authority

- `packages/design-kit/CHARTS.md` — closed catalog. Explicit rule: **do not start a second chart library**.
- Charts implementation root: `apps/life/js/app/chart-kit/` (~25 modules, SVG + vendored d3-shape/sankey/chord/force).
- Graphs implementation root: `apps/knowledge/src/archive/`.

### Inventory (meaningful visuals)

| Surface | Implementation | Data | Useful? |
|---------|----------------|------|---------|
| Life Home macros | `ring` | meals / targets | Yes — simple progress |
| Nutrition | rings, pies, area-line, CSS heatmap | meal events | Yes; heatmap is tile CSS |
| Fitness | ~18 catalog forms (polar, orbit, chord, bump, stream, sankey, constellation, …) | workouts | Mixed — rich but **dashboard-dense / circular-heavy** |
| Mind | mood radial/mix, stream, chord, bump, watchlist, masonry | diary themes | Yes; honest empties via `paintChartOrEmpty` |
| Bloods / Body | custom SVG + range-bar, area-line | labs / weight | Yes — clinical slots |
| Central Node | horizon, radial-year, stream, chord, watchlist-heat | board model | Improved after retiring protein line + heatmaps |
| Tasks board | ring/columns copies, portfolio chart, sparklines, heat days | tasks/projects | Adequate |
| Tasks page blocks | `chart-svg` bar/line/pie/scatter | `page_blocks` | Teaching/Tasks lesson viz |
| Teaching blocks | same + `graph-maker` mind/concept editor | blocks | Strong interactive editor |
| Agent widgets | challenge-progress, meal-plan-week only | capabilities templates | Narrow, typed — good pattern |

**No** Chart.js, ECharts, Recharts, Plotly, or uPlot in the tree.

### User-visible pain (already known in product history)

- Fitness / Mind can feel like **many disconnected circular widgets**.
- Prefer cohesive interactive views with selection, zoom, filter, drill-down.
- Honest empties matter (`paintChartOrEmpty`, `cn-honest-empty`) — do not chart missing as zero.

---

## Current temporal-interface baseline

| Surface | Hub | Capabilities | Persistence |
|---------|-----|--------------|-------------|
| `.hub-calendar` + `time-grid.js` | Shared chrome; Life primary | Day / week / month, timegrid 6–22h, 15-min snap, now-line, drop targets, pinch overload tints | Life compose writes; Tasks/Teaching schedule writes |
| Life multi-source calendar | Life umbrella | Sources: life, teaching, knowledge, tasks (`calendar-sources.js`) | Cross-hub event chips with type tints |
| Tasks calendar | Tasks | Day/week/month, filters, pinch, drag schedule | Board/API |
| Teaching class calendar | Teaching | Day/week/month/**timeline**, schedule lessons | scheduled-lesson schema |
| Tasks Gantt | Tasks | week/month/term zoom, FS/SS/FF deps, critical path, drag resize/shift, cascade, cycle checks | `depends_on` / `dependency_links` |
| Teaching scope-and-sequence | Teaching | Month/year zoom, unit/note bands, drag/resize weeks, term jump | `scope-sequence` / Netlify functions |
| Life medical spine | Life | weeks/months/years density, visits, episode bands, bloods chips | medical model |
| Tasks excursion timeline | Tasks | Vertical key-date timeline | excursion domain |
| Knowledge university timeline | Knowledge | Degree/unit/assessment HTML timeline, camera/zoom, GPA | university module |
| Knowledge archive Timeline rail | Knowledge | **Removed** (docs under remove-timeline plans) | — |

**Verdict:** temporal coverage is already strong and domain-specific. A third-party calendar or Gantt would fight Cotton Glass + existing write paths.

---

## Current Knowledge graph baseline

### Model

- Notes: `Page` / manifest — `id`, `title`, `tags[]`, `connected[]` (explicit forward links), timestamps, Notion origins.
- Graph edges are **not** raw wiki backlinks. Primary geography = closed topic vocabulary hubs + spokes + capped note–note overlap (`GRAPH_LAYOUT_BRIEF.md`).
- `connected[]` in seed is often empty; Show All builds similarity/tag edges with **degree ≤ 3**.

### Rendering

- `mountForceGraph` — canvas 2d + `d3-force`.
- Variants: constellation (hub preview/expand) and show-all.
- Focus: `graphFocus.ts` — search cluster, selection neighbourhood, dimming.
- Preview card: `graphPreview.ts`.
- Communities: **already implemented** Louvain-style in `showAllCommunities.ts` (no Graphology).
- Measured production vault: **20 hubs, 4240 notes, 5051 note–note links, 9787 spokes, ~0.6s build** (`GRAPH_LAYOUT_METRICS.md`).

### What is / isn’t the problem

| Concern | Status |
|---------|--------|
| Rendering engine | Sufficient at current ~4k scale with LOD / edge budgets / settle-then-lock |
| Data modelling | Policy is deliberate anti-hairball — the win |
| Interaction | Search + select + preview exist; analytical modes (orphans, bridges, path) underdeveloped as **product UX** |
| Discoverability | Question-answering layers missing more than WebGL |
| Scale to 10k | Canvas may strain; WebGL (Sigma) only becomes relevant then — not today’s failure |

---

## Sigma.js findings

| Aspect | Finding |
|--------|---------|
| Role | WebGL graph **renderer**; requires Graphology as data backend |
| Version | npm `sigma@3.0.3` (~971 KB unpacked); v4 alpha exists |
| Strengths | Thousands–tens of thousands of nodes, camera, reducers, hover/select, custom programs |
| Mobile | WebGL + pinch/pan OK; still GPU/memory cost on PWA phones |
| Fit | Would replace `forceGraph.ts` draw path, not the geography policy |
| Bundle | Must be route-lazy; must not load on Life chat |

**Classification: F — REJECT (now).** Revisit only if Show All measurably fails above ~8–10k nodes after LOD exhaustion.

**Scores (0–5):** value 2 · clarity 3 · analytical 1 · functional 2 · UX 2 · cross-hub 1 · arch fit 1 · data fit 2 · interaction 4 · a11y 1 · mobile 2 · perf ceiling 5 · cost 1 · maintenance 2 · verification 3 · duplication 1

---

## Graphology findings

| Aspect | Finding |
|--------|---------|
| Role | Graph data structure + evented API; ecosystem: metrics, Louvain, ForceAtlas2, shortest path, components |
| Version | `graphology@0.26` (~2.7 MB unpacked) + optional metrics/communities packages |
| Useful algorithms for Knowledge | betweenness/bridge detection, connected components, orphan listing, shortest path between notes, degree centrality |
| Already in-hub | Louvain-style communities, degree caps, search/selection clusters, constellation expand |

**Which computations would create real product value?**

| User question | Need Graphology? |
|---------------|------------------|
| What notes are isolated / orphan? | No — count spokes/degree locally |
| Which notes bridge topics? | No — multi-hub tag membership already in model |
| Path between two notes? | Small BFS on capped graph — stdlib |
| Community clusters? | Already `assignCommunities` |
| ForceAtlas2 layout? | Conflicts with hub-seeded geography policy |

**Classification: C — MINE MECHANISM** (algorithms/ideas). **F as dependency** unless a specific metric UI needs a battle-tested package later.

**Scores:** value 3 · clarity 4 · analytical 4 · functional 3 · UX 2 · cross-hub 2 · arch fit 2 · data fit 3 · interaction 2 · a11y 3 · mobile 5 · perf 4 · cost 3 · maintenance 3 · verification 4 · duplication 2

---

## Sigma + Graphology combined verdict

Treat as a pair: **Sigma renders Graphology graphs**.

| Question | Answer |
|----------|--------|
| Do they complement each other? | Yes, by design |
| Should Life Hub adopt the pair? | **No** — would fork the locked graph library and fight the geography brief |
| When reconsider? | Vault ≫ 10k interactive nodes **and** canvas profiling proves the bottleneck is draw, not model policy |
| Near-term alternative | Keep d3-force + deepen **question UX** (orphans, bridges, 1-hop/2-hop, search→highlight, agent cite→neighbourhood) |

**Combined classification: F (integrate) / C (mine graph-analysis UX patterns) / E (Sigma WebGL at extreme scale).**

---

## ECharts findings

| Aspect | Finding |
|--------|---------|
| Capability | Extremely broad: line/bar/scatter/heatmap/calendar/radar/treemap/sunburst/graph/sankey/gauge, dataZoom, brush, dataset transforms, linked charts |
| Size | `echarts@6` ~**60 MB** unpacked; tree-shakeable `echarts/core` + charts still large vs chart-kit |
| Interaction | Best-in-class brush/zoom/link — the part worth studying |
| A11y | Partial ARIA; still needs data tables / summaries for hub standard |
| Conflict | **CHARTS.md forbids a second chart library** |

**Would ECharts answer useful questions Life already asks?** Mostly already answered by area-line, horizon, bump, stream, chord, sankey, radial-year, heatmap tiles — with kit tokens and honest empties.

**Where ECharts would tempt:** Fitness dashboard “linked brush across series,” calendar heatmap of workload, large interactive zoom. Those should be **mined into chart-kit** (one interactive board), not by importing ECharts.

**Classification: C — MINE MECHANISM** (brush, dataZoom, linked selection, calendar-heatmap *ideas*). **F as dependency.**

**Scores:** value 3 · clarity 4 · analytical 4 · functional 3 · UX 3 · cross-hub 3 · arch fit **0** · data fit 3 · interaction 5 · a11y 2 · mobile 3 · perf 2 · cost 1 · maintenance 1 · verification 3 · duplication **0**

---

## Schedule-X findings

| Aspect | Finding |
|--------|---------|
| Role | Modern event calendar (FullCalendar alternative); day/week/month/agenda; plugins; drag/resize; Preact signals core; framework adapters |
| Size | `@schedule-x/calendar@4` ~1 MB + theme |
| Fit | Vite/vanilla possible, but **replaces** `.hub-calendar` chrome, tokens, multi-source umbrella, compose UX |
| Recurrence / TZ | Stronger than some custom calendars — Life currently Sydney-oriented with own date rules |

**Existing hub calendar already has:** day/week/month, timegrid, now-line, drag targets, multi-hub sources, type tints, mobile rules in `calendar.css`.

**Classification: F — REJECT.** Mine only if a specific gap appears (e.g. true recurrence engine) — then prefer a small domain utility, not a full calendar skin.

**Scores:** value 2 · clarity 3 · arch fit 1 · duplication 1 · cost 1 · maintenance 2

---

## vis-timeline findings (revised)

| Aspect | Finding |
|--------|---------|
| Role | Zoomable chronology (ms→years), groups, ranges, points, edit, cluster |
| Size | `vis-timeline@8` ~**78 MB** unpacked — heavy; must be route-lazy if ever used |
| Distinct job vs calendar | “How did this unfold?” not “What’s on Tuesday?” |
| Distinct job vs Gantt | Chronology ≠ dependency structure |
| Hub coverage of that job | **Thin.** Medical spine has density steps; university timeline is degree-only; excursion timeline is niche; Knowledge archive chronology was **removed**; Tasks has **no** general timeline |

**First-draft error:** treating medical/scope/university as “timeline solved.” Those are domain spines. They do not give Tasks `list→…→timeline`, Life diary unfold, or Knowledge idea development as first-class multi-rep legs.

**Revised classification: B — PROTOTYPE** one real surface with `domain → toTimelineItem` adapter; **C — MINE** camera/grouping regardless of outcome. Promote to A only if prototype beats a kit-native camera on select→record, zoom years→days, and mobile. Otherwise keep mined UX, decline dep (**E/F**).

**Scores (revised):** value **4** · clarity 4 · analytical 3 · multi-rep fit **5** · arch fit 3 · cost 1 · maintenance 2 · mobile 2 · a11y 2

---

## Frappe Gantt findings (revised)

| Aspect | Finding |
|--------|---------|
| Role | Attractive project Gantt: bars, progress, deps arrows, drag/resize, view modes |
| Size | `frappe-gantt@1.2` ~250 KB — small |
| Gap vs Tasks Gantt | Tasks already has FS/SS/FF, offsets, critical path, cascade, cycle detection, project grouping, kit styling |
| Multi-rep contribution | **None.** Does not wire board↔calendar↔Gantt focus; does not create a timeline representation |

**Classification: F — REJECT** (unchanged, but for the right reason: **not** “we have a Gantt,” rather “Frappe does not unlock the multi-rep vision”).

**Scores:** value 1 · multi-rep fit 0 · arch fit 1 · duplication 1 · cost 2 · functional improvement 1

---

## Temporal-library comparison (revised)

| Capability | Schedule-X | vis-timeline | Frappe Gantt | **Life Hub today** |
|---|---|---|---|---|
| Daily schedule | Strong | Weak | Weak | **Hub calendar — adequate engine** |
| Week / month planning | Strong | Weak–Med | Med | **Hub calendar — adequate engine** |
| Long chronology | Weak | **Strong** | Medium | **Thin / fragmented** |
| Zoom years→days | Weak | **Strong** | Medium | Density steps only; no continuous camera |
| Project dependencies | Weak | Weak | Medium | **Tasks Gantt — stronger than Frappe** |
| Milestones / phases | Weak | Medium | Strong | Tasks Gantt + Teaching scope |
| Multi-view focus | None | None | None | **Missing (architecture)** |
| Agent proposed state | None | None | None | **Missing (Tool UI payload)** |
| Best Life use | Redundant calendar | **History unfold (gap)** | Rare | Calendar strong; chronology weak |
| Best Tasks use | Redundant calendar | **General project timeline (gap)** | Redundant Gantt | Board/cal/Gantt exist; timeline missing; focus missing |
| Best Teaching use | Redundant calendar | Optional unit chronology | Redundant scope | Calendar + scope exist; **deep links missing** |
| Best Knowledge use | Weak | **Idea chronology (removed)** | None | Graph strong; chronology absent by decision |

**Decision (revised):**

| Job | Owner | External lib? |
|-----|-------|---------------|
| **Calendar** (when?) | Hub calendar | **No** Schedule-X |
| **Gantt / scope** (depends / structure?) | Tasks Gantt + Teaching scope | **No** Frappe |
| **Chronology** (unfold across scales?) | Underbuilt | **Prototype vis-timeline** (or native camera mining it) |
| **Cross-view focus + agent ghosts** | Not a library | **Architecture + Round A SSE** |

---

## ECharts vs Sigma graph comparison

| | ECharts `graph` series | Sigma.js |
|--|------------------------|----------|
| Purpose | Chart suite bonus graph | Dedicated WebGL graph |
| Scale | Hundreds–low thousands comfortable | Thousands–tens of thousands |
| Layout control | Limited vs geography policy | High, still needs Graphology |
| Theming | ECharts skin | Custom programs |
| Hub fit | Worse — pulls entire chart engine | Better as graph-only, still fights CHARTS graphs root |

**Neither should replace Knowledge `forceGraph`.** If graph rendering ever needs WebGL, prefer Sigma over ECharts-graph. Until then, neither.

---

## Visual grammar opportunities

Do **not** invent a universal schema. Do align **presentation conventions** across existing surfaces:

| Axis | Proposed shared meaning | Apply on |
|------|-------------------------|----------|
| Time | Past = muted; today = Wave focus; future = default ink | Calendar chips, Gantt bars, timelines, area-line markers |
| State | Planned / Active / Completed / Blocked | Tasks Gantt + board + calendar task tint |
| Relationship | Direct (solid) / Inferred (dashed/soft) / Hierarchical | Knowledge spokes vs overlap; Tasks deps |
| Importance | Primary / Secondary / Context opacity | Graph LOD, chart series |
| Selection | Selected / Related / Filtered-out | `graphFocus` + chart hover + calendar selected day |

Same task in Gantt and calendar should share **tint + state encoding**, not identical chrome.

---

## Cross-view opportunities

Current architecture: per-hub SPA state, URL hashes, session keys — **no global event bus** (correct).

High-value links that fit existing mechanisms:

| Link | Mechanism | Priority |
|------|-----------|----------|
| Knowledge search → graph highlight | Already `searchCluster`; wire Cmd+K / MiniSearch hits into `graphFocus` | High |
| Agent cites note → neighbourhood | Pass page ids into `selectionCluster` | High |
| Calendar day select → Tasks/Teaching rail detail | Exists partially in Life calendar rail | Medium |
| Chart brush range → filter list | **Missing** in chart-kit; mine from ECharts | Medium |
| Gantt select ↔ board card | Same task id; highlight without new bus | Medium |

Do not build a cross-hub visualisation bus.

---

## Agent + visual intelligence opportunities

Align with Round A Tool UI mining: **typed structure → kit renderer**, never arbitrary viz JSON.

| Agent | Instead of prose-only | Structured payload → renderer |
|-------|----------------------|-------------------------------|
| Chadwick | “Training declined…” | `{ catalog: "area-line", seriesRef: "fitness.volume", highlightRange }` → chart-kit |
| Clare (Knowledge) | “You’ve written about this…” | `{ focusPageIds, mode: "neighbourhood" }` → graphFocus |
| Teaching agent | Proposed unit plan | Scope-sequence item patches (already persist path) |
| Tasks agent | Workload / reschedule | Existing confirm-card mutations + optional columns/spark from catalog |

**Trust rules (already culturally present via honest empties):**

- Missing ≠ zero  
- Partial windows must declare coverage  
- Inferred edges labelled inferred  
- Agents cannot invent catalog ids outside `CHARTS.md` / approved widget templates  

Extend `publish.surface-widget` pattern rather than freeform ECharts options.

---

## Life opportunities

| User question | Approach | Library? |
|---------------|----------|----------|
| How is training trending, and what day should I open? | One interactive area-line/horizon board with click→diary/workout | chart-kit deepen |
| When am I overloaded this week? | Calendar pinch + Tasks heat (exists) | No |
| How has medical history unfolded? | Medical spine zoom polish | Mine vis-timeline camera ideas |
| Stop circular dashboard clutter | Prefer ring/columns/area-line; retire decorative radials from default Fitness | Catalog discipline |

---

## Knowledge opportunities

| User question | Approach | Library? |
|---------------|----------|----------|
| What is strongly connected to this note? | 1-hop/2-hop isolate (partially exists) | No |
| What is orphaned / isolated? | Analytical rail: degree 0 note–note | Local metrics |
| What bridges topics? | Multi-hub notes list + highlight | Local |
| Search hits on the map? | MiniSearch/Cmd+K → `searchCluster` | Round B MiniSearch + existing focus |
| Pretty force hairball? | **Rejected by GRAPH_LAYOUT_BRIEF** | — |

**Best Knowledge transformation:** analytical graph modes on the **existing** canvas, not Sigma.

---

## Tasks opportunities

| User question | Approach |
|---------------|----------|
| What blocks this project and when does it finish? | Existing Gantt + critical path — improve mobile + persistence demos |
| What’s due when? | Calendar, not Gantt |
| Throughput / overdue trend? | columns + area-line from chart-kit copies |

**Do not** add Frappe.

---

## Teaching opportunities

| User question | Approach |
|---------------|----------|
| How does the year sequence units? | Scope timeline (exists) |
| What’s on the timetable this week? | Class calendar (exists) |
| Concept relationships in a lesson? | `graph-maker` (exists) |

**Do not** add Schedule-X. Chronology (vis-timeline prototype) is a Life/Tasks/Knowledge gap — Teaching’s need is **calendar↔scope glue**, not another timeline engine.

---

## Mobile findings

| View | Mobile reality |
|------|----------------|
| Hub calendar | CSS breakpoints; timegrid cramped but intentional; bottom bar via kit |
| Knowledge graph | Touch pan/zoom custom; labels LOD helps; still dense on phone — list/preview fallback needed |
| Tasks Gantt | Horizontal scroll heavy; acceptable as desktop-primary with simplified mobile summary |
| Fitness chart pack | Many SVGs = scroll fatigue on PWA |
| External libs | Schedule-X better mobile calendar; still not worth replacing kit. vis-timeline/Frappe/Sigma pinch conflicts common |

**Acceptable:** desktop-primary Gantt/graph; mobile gets filtered list + preview.

---

## Accessibility findings

| Area | Status |
|------|--------|
| Charts | Visual-first; some `aria-live` tooltips (Mind); need systematic **text summary + data table** option |
| Graphs | Canvas = weak SR access; preview card + searchable list is the real fallback |
| Calendar | Semantic buttons/days better than canvas |
| Gantt | SVG pointer-driven; keyboard incomplete |
| External libs | None are a free a11y win |

Any future viz work must ship a non-visual twin (summary list/table).

---

## Performance / bundle findings

| Package | Unpacked (approx) | Lazy? | Verdict |
|---------|-------------------|-------|---------|
| `d3-force` (present) | ~90 KB | Hub graph routes | Keep |
| chart-kit (present) | small modular SVG | Per-tab | Keep |
| `sigma` | ~1 MB | Would need lazy | Reject now |
| `graphology` (+metrics) | ~3 MB+ | Lazy | Reject now |
| `echarts` | ~60 MB | Lazy still heavy | Reject |
| `@schedule-x/calendar` | ~1 MB | — | Reject |
| `vis-timeline` | ~78 MB | Route-lazy only | **Prototype candidate** (chronology gap); default mine-then-native |
| `frappe-gantt` | ~250 KB | — | Reject (no multi-rep unlock) |

**Rule:** graph/Gantt/chart engines only on their routes. Never on chat bootstrap.

---

## Data-contract implications

Prefer adapters at the view boundary:

```
Task → toGanttRow(task)        // already in domain/gantt.ts
PageManifest → buildArchiveGraph(entries)  // keywordGraph.ts
Metric events → buildAreaLine(series)      // chart-kit
Calendar sources → event chips             // shell/*-calendar.js
```

**Do not** persist Sigma/Graphology/ECharts/Schedule-X/vis/Frappe shapes in life-hub-data.

Agent payloads should reference **catalog ids + domain refs**, not library option trees.

---

## Prototypes performed

1. **Umbrella inventory** — charts, calendars, Gantt, timelines, graph stack, agent widgets (full tree).  
2. **External package sizing** — npm unpacked sizes for all six candidates + `d3-force`.  
3. **Knowledge analytics sketch** on `fixtures/seed.json` (4 notes) — confirmed seed lacks `connected[]`; production metrics taken from `GRAPH_LAYOUT_METRICS.md` (4240 notes).  
4. **Round A/B constraint recovery** from sibling agent transcripts (reports not in this checkout).  
5. **Community detection check** — Louvain-style already in `showAllCommunities.ts`.

No production code changes. No dependency installs for candidates.

---

## Changes made

**None** to application code or `package.json`.  
**Added:** this report file only (`REPO_MINING_ROUND_C_VISUAL_INTELLIGENCE.md`).

---

## Verification results

| Check | Result |
|-------|--------|
| CHARTS.md locks single chart + graph library | Confirmed |
| `d3-force` present; no ECharts/Sigma/Schedule-X/vis/Frappe deps | Confirmed via root/app package.json + grep |
| Knowledge graph scale metrics documented | 4240 notes / degree ≤ 3 |
| Tasks Gantt owns FS/SS/FF + critical path | Confirmed in `domain/gantt.ts` |
| Life calendar multi-source live | Confirmed `calendar-sources.js` |
| Honest empty pattern exists | `paintChartOrEmpty` in Mind / Central Node |
| Candidate npm sizes | Measured 2026-09-05 |
| Interactive browser prototype of Sigma/ECharts | **Not run** — rejected on architecture/size before UI demo |
| Persist/reload calendar drag with Schedule-X | N/A — not integrated |

---

## Final candidate table

| Candidate | Repo | Hub(s) | User Question Answered | Capability | Classification | Value | Cost | Risk | Verdict |
|-----------|------|--------|------------------------|------------|----------------|-------|------|------|---------|
| Sigma.js | jacomyal/sigma.js | Knowledge | Render 10k+ nodes smoothly | WebGL graph render | **F** (E later) | 2 | High | High fork | Reject now |
| Graphology | graphology/graphology | Knowledge | Centrality / path / components | Graph data + algos | **C** / F dep | 3 | Med | Medium | Mine algos; no dep |
| Sigma+Graphology pair | both | Knowledge | Obsidian-scale interactive map | Render+data | **F** | 2 | High | High | Reject pair |
| Apache ECharts | apache/echarts | Life/Tasks/Teaching | Interactive trends / brush | Chart suite | **C** / F dep | 3 | High | **Conflicts CHARTS.md** | Mine interactions |
| Schedule-X | schedule-x/schedule-x | Life/Tasks/Teaching | What’s on my week? | Calendar engine | **F** | 2 | High | Dup calendar | Reject |
| vis-timeline | visjs/vis-timeline | Life/Tasks/Knowledge | How did this unfold over years→days? | Chronology (missing rep) | **B** prototype / C mine | **4** | High bundle | Multi-rep gap | Prototype one surface |
| Frappe Gantt | frappe/gantt | Tasks/Teaching | What depends on what? | Gantt UI | **F** | 1 | Med | No multi-rep unlock | Reject (right reason) |
| Focus contract | in-house | Tasks→umbrella | Same object selected across views | Selection glue | **A** | 5 | Low | Low | **Top priority** |
| Chronology adapter | in-house ± vis | Life/Tasks | Unfold history without Gantt semantics | Timeline leg | **B** | 5 | Med | Product | Prototype |
| Agent schedule_diff | SSE + calendar | Tasks/Life | Show proposed reschedule | Ghost calendar | **B** | 5 | Med | ACI | Prototype (Tool UI) |
| chart-kit deepen | in-house | Life+ | Cohesive interactive trends | Existing SVG catalog | **A** (internal) | 5 | Low | Low | Priority |
| Graph question UX | in-house | Knowledge | Orphans/bridges/neighbourhood | Existing canvas | **A**/B | 5 | Low | Low | Priority |
| Visual grammar tokens | design-kit | Umbrella | Same object feels related across views | Conventions | **A** (thin) | 4 | Low | Low | Priority |
| Teaching cal↔scope | in-house | Teaching | Lesson in year sequence | Deep link | **A** | 4 | Low | Low | Integrate |
| Agent catalog viz | capabilities + kit | Agents | Show evidence not just prose | Structured render | **B** | 4 | Med | ACI | Prototype |
| Hub calendar polish | in-house | Umbrella | Cross-hub “My Time” without flattening meaning | Existing calendar | **B** | 4 | Med | Identity | Prototype carefully |

---

# DEPENDENCIES ACTUALLY WORTH ADDING

**None required to start.** Multi-rep coherence is mostly glue.

**Conditional only:** `vis-timeline` (or a much smaller chronological engine) **after** a successful route-lazy prototype on one real surface proves continuous zoom + select→record + mobile are worth the bundle. Default bias remains mine-then-native.

Keep using: `d3-force`, vendored d3 layout modules in chart-kit, design-kit calendar/time-grid/motion.

---

# MECHANISMS WORTH MINING

1. **vis-timeline:** continuous zoom camera, groups, clustering — the chronology representation Life Hub underbuilt.  
2. **ECharts:** brush selection, dataZoom, linked charts — into chart-kit interactive boards.  
3. **Graphology:** orphan/bridge/path metrics (implement locally).  
4. **Sigma:** reducers + camera LOD for Show All (canvas until scale forces WebGL).  
5. **Schedule-X:** recurrence / resource views — reference only if hub calendar hits a hard wall.  
6. **Frappe:** ignore-period / holiday UX ideas for Teaching terms — not the Gantt engine.

---

# PROTOTYPES WORTH PURSUING

1. **Focus contract** — Tasks board ↔ calendar ↔ Gantt share highlight for one `task.id` across route changes.  
2. **Chronology spike** — vis-timeline **or** native camera on Life medical spine / one Tasks project; `toTimelineItem` adapter; select→open record.  
3. **Agent `schedule_diff`** — ghost events on existing calendar inside confirm-card; apply → persist → reload → focus.  
4. **Teaching** — calendar lesson ↔ scope unit deep link both directions.  
5. **Knowledge** — search hits → `searchCluster`; product decision on idea chronology return.  
6. **Life** — one Fitness interactive board + chart brush → day filter; visual grammar tints.

---

# REJECTED IDEAS

- Install ECharts as shared chart layer  
- Replace Knowledge graph with Sigma+Graphology  
- Replace hub calendar with Schedule-X  
- Replace Tasks Gantt with Frappe (**correct reject; wrong original reason was too thin**)  
- Treat “medical spine / scope / university exist” as “timeline job done”  
- Universal temporal object / universal graph model / cross-hub viz event bus  
- Charts / Gantt / Schedule-X embedded **in chat** (Round A forbids)  
- Agent-emitted raw ECharts / vis / Frappe option JSON  
- Decorative force hairballs without question modes  

---

# If Life Hub can take ONLY SIX improvements from Round C

1. **Cross-view focus contract (Tasks first)** — source: multi-rep analysis (not a Round C repo) — Tasks — “I selected this on the board; show it on calendar and Gantt” — **integrate** — beats any library because without it every new view is another silo.  
2. **Chronology representation prototype (vis-timeline or native)** — source: **vis-timeline** — Life + Tasks — “How did this unfold from years to days?” — **prototype** — beats Schedule-X/Frappe because it fills the **missing** third temporal job.  
3. **Agent `schedule_diff` + ghost calendar on confirm-card** — source: Round A Tool UI pattern — Tasks/Life — “Show the proposed reschedule, don’t only describe it” — **prototype** — beats chat-embedded calendars.  
4. **Teaching calendar ↔ scope deep links** — source: in-house glue — Teaching — “Open this lesson’s place in the year sequence” — **integrate** — Schedule-X cannot do this.  
5. **Knowledge search → graphFocus (+ chronology product call)** — source: MiniSearch Round B + graphFocus; chronology ↔ vis-timeline if restored — Knowledge — “Where do these hits live, and how did the idea develop?” — **prototype/integrate**.  
6. **Chart-kit interactive board + thin visual grammar** — source: ECharts *ideas* + kit — Life/umbrella — “What changed, and does this object feel related across views?” — **integrate**.

---

### One improvement per hub / layer

| Focus | One improvement |
|-------|-----------------|
| **Knowledge** | Search→graph focus; decide whether idea chronology returns (timeline job) |
| **Life** | Chronology unfold (medical/life history) + interactive trend board with click-through |
| **Tasks** | Focus across list/board/calendar/Gantt; add chronology leg; agent schedule_diff ghosts |
| **Teaching** | Wire class calendar ↔ scope-and-sequence as two views of the same units/lessons |
| **Umbrella** | Focus contract + visual grammar (time/state/selection) — not a viz framework |
| **Agents** | Typed highlight / schedule_diff / catalog viz → kit surfaces (Round A path) |

---

## Architecture recommendation

> Should Life Hub develop a thin shared “visual intelligence” layer?

### YES, but only for X

**X = multi-representation glue + conventions + agent payloads — not a chart/timeline framework.**

Minimum contents:

1. **Focus contract** — shared `{ type, id }` highlight/scroll across views (start in Tasks; pattern per hub)  
2. **Catalog authority** (`CHARTS.md`) — exclusive chart types  
3. **Visual grammar** — time / state / selection / importance encodings  
4. **Honest empty / coverage helpers**  
5. **Domain→view adapters** beside domain (`toCalendarItem`, `toGanttRow`, `toTimelineItem`, `toGraphNode`) — no universal ORM  
6. **Agent allowlist** — `highlight_range` | `focus_cluster` | `schedule_diff` | catalog viz — confirm-card for writes  
7. **Route-level lazy loading** for any heavy chronology engine  

**Do not** create: mega `visual-intelligence` package, universal scene graph, or cross-hub event bus.

**Libraries:** stay out unless the chronology prototype proves vis-timeline uniquely earns its weight. Calendar and Gantt engines stay in-house.

---

## Round A/B build-on notes

- **Tool UI:** multi-rep is the payoff — agents name views/payloads; kit/hub render; confirm-card for mutations; no React Tool UI; no charts-in-chat.  
- Motion: kit owns motion; chronology/chart libs must honour reduced motion.  
- MiniSearch: feed graph/calendar highlight; do not replace hybrid retrieve.  
- Floating UI: popover positioning only.  
- DnD: calendar/Gantt already custom; ghost preview ≠ applied until confirm; persist + reload remains the bar.
