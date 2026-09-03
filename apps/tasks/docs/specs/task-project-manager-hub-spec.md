# Task and Project Manager Hub - Technical Design Doc

Prepared for handoff to Cursor. This spec captures the outcome of a brainstorming session and should be treated as a build brief, not a finished architecture. Sections marked "Open Question" need a decision before Cursor starts, ideally answered inline in this doc before the first commit.

## 1. Purpose and Context

This hub is the task and project management layer of Adam's personal ecosystem, sitting alongside the existing Teaching Day Book, Life Hub, and Knowledge Hub. It replaces Notion for this function due to cost and because Notion cannot natively support the multi-role, AI-negotiated, cross-hub behaviour described below.

The hub is not a simple to-do list. It has two tiers.

- Day to day task management, driven by the AI persona Clare DeMind
- Larger project and program management, including a dedicated excursions and competitions module

Both tiers need to talk to the other hubs and to the wider AI agent network (Chadwick Flexington for exercise, Brisket Lasso for food, Penelope Rose Quillian for daily diary, Dr Vera Lenz for longer term mental health patterns, General Hammond for big picture trend coaching).

## 2. Reference Material for Cursor

Clare DeMind's existing persona and protocols are documented here, read this before building any of the negotiation, framework selection, or briefing logic in section 4.

- Clare DeMind persona page (Notion, reference only, this hub will not connect to Notion at runtime) - https://app.notion.com/p/327f794f847680cfb958c6a6aed55359?pvs=204

This page defines her existing voice, morning briefing trigger pattern, brain dump processing behaviour and scheduling conflict flagging. The new hub should preserve this personality and these behaviours in code rather than reinventing them, this is a rebuild of her function on new infrastructure, not a new persona. Treat the Notion page as the source of truth for tone and existing logic only. No live Notion API calls, webhooks, or sync of any kind should be built against this page or any other Notion page, this hub is deliberately Notion-free once built.

## 3. Architecture Assumptions

Mimic the existing architecture of Adam's other personal hubs (Life Hub, the Teaching Day Book, the Knowledge Hub) rather than introducing new tooling or a new pattern. Cursor should inspect those repos directly and replicate their structure, this hub should feel like a sibling site, not a one-off.

- Frontend built in Cursor, hosted via Cloudflare, same setup as the other hubs
- Repo on GitHub, same conventions (folder structure, build process, deployment pattern) as the existing hub repos
- AI functionality (Claude and OpenAI API calls) routed through the same Netlify serverless function proxy already in use (`jade-melomakarona-ea20fe.netlify.app/.netlify/functions/openai-proxy`), reuse this rather than standing up a second proxy
- Data persistence should follow whatever pattern the other hubs already use for their own data, whatever that is (flat files, a database, or otherwise), rather than Cursor picking something new. If the other hubs genuinely have no persistence layer suited to this hub's needs (tasks, projects, excursions, review logs are more relational and higher-write than a content site), flag that as a decision point rather than silently choosing a new tool
- No dependency on Notion for this hub's core data

**Open Question - Cross-hub communication.** Decide whether hubs talk to each other via a shared database, a small internal API each hub exposes, or a lightweight event or webhook layer (for example, an excursion created here fires a webhook that Life Hub or the Teaching Day Book listens for). This decision affects almost everything below and should be made first, and should follow whatever pattern (if any) the existing hubs already use to talk to each other.

> **Decision (see `docs/DECISIONS.md`):** Netlify Blobs + Pages/Netlify sibling hosting like Teaching Hub. Cross-hub via server-side shared-secret HTTP, not webhooks. Spec's openai-proxy URL is not present in sibling repos; AI goes through this hub's Netlify Functions (Anthropic) like Teaching Hub.

## 4. Core Data Model

Draft entities. Field lists are a starting point, not exhaustive.

### Task
- id, title, description
- domain (teaching, life, wedding, health, other), used to drive the adaptive interface
- framework_used (nullable, references Framework Library entry)
- estimated_duration, actual_duration (for the negotiation learning loop)
- due_date, created_at, completed_at
- status (open, in_progress, done, deferred, dead)
- priority (low, medium, high, urgent)
- parent_project_id (nullable)
- parent_task_id (nullable, for subtasks or checklist items under a task)
- depends_on (array of Task ids this task is blocked by, drives the Gantt view and smarter pinch point detection)
- tags (array of free text labels, distinct from domain, for cross-cutting filtering)
- recurrence_rule (nullable, for example weekly on Monday, drives auto-generation of the next instance on completion)
- attachments (array of file references)
- source (manual, auto_generated_from_excursion, suggested_by_agent)

### Project
- id, title, description, arc_summary
- type (standard, excursion, academic_program)
- milestones (array of Milestone)
- status (active, stalled, revived, archived_dead)
- baseline_end_date (captured at project creation, kept fixed) and current_end_date (recalculated as tasks shift, the gap between the two is the planned-vs-actual signal)
- review_summary (nullable, populated on closure)
- stall_flagged_at (nullable, see section 5.11)

### Milestone
- id, project_id, title, due_date, status

### Excursion (extends Project, or a related table depending on whichever persistence pattern the existing hubs use)
- competition_or_event_type (references Excursion Template)
- key_dates (permission note due, staff notification due, payment due, risk assessment due)
- student_group_reference
- generated_admin_tasks (array of Task ids, auto-created)
- drafted_documents (permission note draft, staff absence email draft, stored as text or linked doc)

### Excursion Template
- one generic template (`excursion template`) with default lead times and checklist
- default_lead_times (for example permission note minus 21 days, staff email minus 21 days, risk assessment minus 42 days)
- checklist_items

### Framework Library entry
- name (for example Eat the Frog, timeboxing, Eisenhower matrix)
- best_suited_task_pattern (short descriptor used by Clare's selection logic)
- reasoning_template (the one-line "why" shown to Adam when selected)

### Task Template
- id, name, domain
- default_fields (pre-filled title pattern, default framework, default estimated_duration)
- created_from (nullable, if generated by saving an existing task as a template)

### Project Template
- id, name, type (standard or excursion, links to Excursion Template where relevant)
- default_milestones
- created_from (nullable, if generated by saving an existing project as a template)

### CapacitySignal
- date
- source (Chadwick sleep or exercise data, self-reported, inferred from task completion rate)
- capacity_level (low, medium, high)

### StressFlag
- id, source_project_or_task_id
- pattern_description (specific, for example "Ethics Olympiad and Da Vinci Decathlon overlapping in the same fortnight")
- raised_by (Clare DeMind)
- routed_to (General Hammond, then Penelope Rose Quillian and Dr Vera Lenz)
- recurrence_note (nullable, populated once Hammond identifies a year on year pattern)

### ReviewLog
- project_id
- outcome (revived, frankensteined, buried)
- reason
- created_at

## 5. Feature Specification

### 5.1 Adaptive interface
The dashboard's default view changes based on day of week and possibly time of day, surfacing teaching-domain tasks on school days and personal-domain tasks (wedding, fragrance research, life admin) on weekends, without Adam manually toggling a mode. Implementation approach, a simple rules engine keyed off day of week and domain tags to start, with room to make it smarter later using the CapacitySignal data once that exists.

### 5.2 Predictive pinch point detection
The system scans upcoming due dates and task density per day, and flags days that look overloaded, especially relevant given the ADHD lens Adam described. Each flag ships with a one-tap "shrink this" action that suggests specific tasks to defer, delegate, or delete, rather than just surfacing a warning with no next step.

### 5.3 Framework library with visible reasoning
Clare DeMind selects a framework from the Framework Library based on task type, and displays a short one-line reasoning alongside the suggestion (for example "Eat the Frog, because this has been sitting untouched for six days and keeps getting deprioritised"). Over time this should let Adam absorb which framework suits which kind of task without needing the explanation every time, so the UI should support a "just show the framework, skip the reasoning" toggle for power-user mode later.

### 5.4 Negotiated task creation, not passive logging
Clare should not simply create a card from input. When Adam gives her a task, she engages in a short back and forth, particularly around time estimates, and tracks her own accuracy against Adam's corrections. If Adam consistently overrides her estimate in a particular direction, she should adjust her defaults accordingly rather than requiring the same correction indefinitely. This needs a small internal accuracy-tracking table, comparing her estimate to actual_duration on Task, and a periodic recalibration step.

### 5.5 Large project and program management
Distinct from single tasks, this view shows the full arc of multi-term initiatives (MindWorks, the Master's degrees) with milestones plotted against time, so Adam can see the shape of the whole thing rather than only the next action.

### 5.6 Dedicated excursions and competitions module
Excursions get their own template engine rather than a generic project template. Creating a new excursion from `excursion template` automatically generates the standard admin checklist and lead times (permission note, staff email, risk assessment, payment). The excursion’s name and date are edited on the page after create.

### 5.7 Automatic scheduling and document drafting
When an excursion is created, the system should automatically generate and schedule the standard admin tasks at their correct lead times (permission notes, staff absence notifications, risk assessments, payment deadlines) without Adam needing to prompt for each one. Beyond scheduling, it should pre-draft the actual documents, a permission note and a staff notification email, and place them somewhere Adam can review and send, rather than leaving him to write them from a blank page when the deadline arrives.

### 5.8 Cross-agent stress flagging
When Clare detects building pressure (overlapping excursions, dense pinch points, a run of overridden or missed deadlines), she raises a StressFlag with specific texture, not a generic "things are busy" note, describing the actual pattern. This routes to General Hammond, who can build longitudinal, year on year pattern recognition (for example, noting that October reliably brings this exact collision), and from there to Penelope Rose Quillian for the daily diary layer and Dr Vera Lenz for the longer term mental health layer. This likely means an internal messaging or event table between agents rather than a user-facing feature, since Adam should not need to manually relay this information between his own AI personas.

### 5.9 Review and closure loop
Every project and excursion needs a lightweight closure step once it ends, a short retrospective captured in ReviewLog, feeding back into Ann O'Tation or Hammond's pattern analysis so lessons are retained across cycles rather than lost.

### 5.10 Capacity as a first class input
Alongside deadline-driven prioritisation, the system should account for Adam's actual capacity on a given day, potentially informed by Chadwick Flexington's sleep or exercise data, or inferred from recent task completion rates. On a flagged low-capacity day, the interface should adjust what it surfaces, showing less and prioritising only what genuinely needs to happen.

### 5.11 Graceful project lifecycle for stalled work
If a project has not moved in a defined window (suggest six weeks as a default, configurable), it gets flagged as stalled rather than silently accumulating in the backlog. Adam is prompted to choose one of three outcomes, revive, Frankenstein (merge or repurpose into something else), or bury, with a short reason captured in ReviewLog either way. This keeps the system honest and avoids the guilt-ghost backlog problem.

### 5.12 Corey-facing capacity view
A live, shareable read-only URL that shows Adam's availability and rough workload level, not task content or detail, so Corey can see something like "slammed until Thursday" or "free Saturday afternoon" without needing task-level visibility into Adam's work.

## 6. Usability and Interaction Requirements

These need to be built in from the first working version, not bolted on later.

### 6.1 View layouts
The hub needs multiple ways to look at the same underlying data, switchable from one dashboard rather than separate tools. Research into other project management tools (Wrike, ProjectManager, TeamGantt, GanttPRO) confirms that offering several views over one shared dataset, rather than forcing everything into a single layout, is treated as a baseline requirement, not a nice to have, so this is worth building properly from the start.

- Day view, today's tasks in priority order, current pinch point flags if any
- Week view, the working shape of the week, useful for spotting the pinch points this spec already covers
- Month view, mainly for seeing project milestones and excursion key dates against each other
- List or backlog view, everything not yet scheduled, filterable by domain, tag, or priority
- Kanban board view, status-based columns (for example to do, in progress, blocked, done), most useful scoped to a single project or excursion rather than the whole hub at once, since an all-tasks board would get noisy
- Gantt view, showing tasks and milestones plotted against time with dependency lines drawn between blocked and blocking tasks, primarily useful at the project or excursion level rather than across the whole hub. This depends on the depends_on field on Task (see section 4), so dependency support needs to exist before the Gantt view is meaningful
- Project or board view, for a single project or excursion, showing its tasks and milestones together rather than mixed in with everything else
- Search, a simple text search across task and project titles and descriptions, easy to deprioritise but becomes essential once volume builds up, worth including from an early build rather than retrofitting

The view layer should read from the same Task, Project, and Milestone tables. No separate data paths per view, the views are just different queries and layouts over the same core data.

### 6.2 Templates for tasks and projects
Both Task Template and Project Template (see section 4) need to be usable from the interface, not just present in the schema.

- Creating a task or project should offer "start from template" alongside "start from scratch"
- Adam should be able to save any existing task or project as a new template directly from its page, this is how the template library grows organically rather than needing to be hand-built up front
- Excursion Templates (already specced in section 4) are a specific case of Project Template, and should appear in the same template picker rather than a separate flow

### 6.3 Clare's system-wide edit authority
Clare DeMind should be able to create, edit, reassign, or delete any task, project, milestone, or template anywhere in the hub, not just the items she originally created. This authority should be consistent across every view and every module, day view, week view, the Kanban board, the Gantt view, the excursions module, and templates all behave the same way when Clare acts on them.

Practically, this means Clare's actions should go through the same underlying API or service layer that the UI itself uses for create, edit, and delete, rather than a separate privileged path. If a human editing a task calls `updateTask`, Clare calling the same function should have identical effect and identical validation. This keeps her behaviour predictable and stops the system developing two different sets of rules for who can change what.

Any destructive action Clare takes, deleting a task or project rather than just editing it, should be logged (what, when, why, in her own words) so Adam can see a short trail if something disappears unexpectedly. This does not need to block the action or ask for confirmation every time, the goal is transparency after the fact, not friction.

### 6.4 Reminders and notifications
Distinct from the predictive pinch point flagging in section 5.2, which looks ahead at overload, this is a simpler layer, a straightforward nudge when something specific is due soon (for example, tomorrow, or in one hour if a time is set). Common across every PM tool reviewed and currently missing from this spec. Delivery mechanism (in-app only, versus push or email) is a build decision rather than something to lock in here.

### 6.5 Experimental views, stretch phase

These are genuinely novel rather than borrowed from standard project management tools, and research into current productivity apps confirms the direction is sound, spatial and metaphor-driven visualisation is an active and well-liked trend (infinite canvas tools like Storyflow and AFFiNE's Edgeless Mode, radial mind-map views in Taskade, and gamified visual metaphors like Exocus and Forest, which are specifically called out as effective for ADHD focus and motivation). Flagged as a later phase because the underlying interaction and rendering work (physics or layout engines, custom canvas code) is considerably heavier than the standard views in section 6.1, and the core hub should be solid and usable before this gets built. All three read from the same Task, Project, and Milestone data as every other view, no separate data model.

**Orbit view.** Adam sits at the centre. Tasks and projects render as planets, with orbital distance driven by urgency (a function of due_date and priority, the same fields already driving the pinch point detection in section 5.2), so the most pressing items sit closest and everything else drifts further out as urgency drops. Size could reflect estimated effort, colour could reflect domain, consistent with the palette already used for the AI persona icons. Clicking a planet opens the task or project as normal. Worth prototyping cheaply first, a static layout with items positioned by urgency, before investing in any orbital animation.

**Branch or decision tree view.** A radial or hierarchical flowchart, similar in spirit to Taskade's Mind Map view, built directly off the depends_on and parent_task_id or parent_project_id relationships already in the data model (see section 4). Most useful for a single complex project or excursion with many interlocking sub-tasks and decision points, MindWorks or a large excursion are good candidates, rather than as a whole-of-hub view, which would get unreadable fast for the same reason a hub-wide Kanban board would.

**Capacity constellation, optional.** A gamified, ADHD-friendly companion visualisation rather than a task view in its own right, some kind of visual metaphor (a constellation filling in, a garden growing, similar in spirit to Exocus and Forest) that responds to completed tasks and respected capacity limits, giving a quick emotional payoff distinct from a plain streak counter or completion percentage. This is the most speculative item in the whole spec and should be treated as optional polish, not a commitment.

## 7. Cross-Hub Integration Points

- Teaching Day Book, source of lesson and marking deadlines feeding the adaptive interface and pinch point detection
- Life Hub, source of personal domain tasks and possibly the Chadwick and Brisket data feeding CapacitySignal
- Knowledge Hub, likely not a direct data dependency for this hub, low priority for integration
- AI persona network, Clare DeMind as the primary interface, General Hammond, Penelope Rose Quillian and Dr Vera Lenz as downstream recipients of StressFlag data

## 8. Suggested Build Sequence

1. Data model and backend scaffolding (Task, Project, Excursion, Framework Library, Task Template, Project Template, including the depends_on, tags, priority, and recurrence_rule fields on Task), built on whatever persistence and cross-hub pattern the existing hubs use, confirm this suits the higher-write relational needs of this hub before proceeding
2. Core task CRUD through a single shared service layer, this is what Clare will also call in step 6, so build it once and correctly
3. Day, week, month, list, and search views over that same core data, and the template picker and save-as-template flow
4. Task dependencies, then the Kanban and Gantt views on top of them, since both depend on dependency data being real before they're worth building
5. Excursion module with one `excursion template` that generates dated admin tasks
6. Automatic scheduling logic for excursion admin tasks, before attempting document drafting
7. Clare DeMind negotiation layer and framework selection, wired into the same shared service layer from step 2 so her edit authority is consistent everywhere from the start
8. Pinch point detection, the "shrink this" action, and simple due-soon reminders and notifications
9. Stalled project detection and the revive, Frankenstein, bury flow
10. StressFlag cross-agent routing
11. Corey-facing capacity view
12. Review and closure loop, including the baseline versus current_end_date planned-vs-actual comparison on Project

Stretch phase, after the above is stable and in daily use, the orbit view, branch or decision tree view, and (optional) capacity constellation from section 6.5.

## 9. Open Questions Summary

**Closed — see [`docs/DECISIONS.md`](../DECISIONS.md).**

| Topic | Locked answer |
|-------|----------------|
| Persistence | Netlify Blobs `tasks-hub-content` |
| Cross-hub communication | Server-side HTTP + shared-secret headers |
| Framework Library | Seed JSON → Blobs; Templates UI |
| StressFlag timing | Write-on-create; consumers poll |
| Reminders | In-app due-soon / pinch strips; push/email later |

Still deferred (product, not blockers): Teaching Day Book deadline feed, Life Hub capacity signals, push/email delivery.
