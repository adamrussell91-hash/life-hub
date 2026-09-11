# Comms Hub + unified People model — proposal

> Status: **draft for discussion**, not adopted. This is not a consolidation checkpoint (see `docs/consolidation/`) — it's new content-architecture work, written up so it can be pasted into `docs/consolidation/plan.md` as a new slice if Adam wants Cursor to build it.
>
> Origin: Adam asked Claude Code to look at the Notion Comms Hub, the People/professional-relationship setup, and the Career/Professional Development Hub, and say what a from-scratch, non-Notion version should look like in `life-hub`.

## 1. What's actually in Notion today

- **People lives under "Professional Relationship Management"** (`People` database, reached from the Career/Professional Development Hub) — colleagues, mentors, providers. Each person page carries an `AI summary`, `Communications` relation, `Current Workplace` relation, `LinkedIn`, etc.
- **Students are a completely separate, disconnected thing** — a `Student Database` last touched in 2023 (archived under "Gradebook 2023"). There is no relation between it and `People`.
- **The `Communications` database already shows the exact fragmentation Adam described**, inside a single table:
  - `Attendees` — a real relation to the `People` data source. This is the *only* field that correctly links to a person record.
  - `Person` — a Notion **user-mention** field (an account, not a page in `People`). Structurally different from `Attendees` despite meaning the same thing.
  - `Student Name` — plain text. Because students aren't in `People`, there's no way to relate a communication to a student — so it degrades to a string that can typo, can't be queried, and can't roll up.
  - `Meeting Type` includes both `Professional Development` and `Student Meeting` as *values of the same select field* — Notion is already trying to tell you these are the same kind of object (a logged interaction) with different subjects, but the schema doesn't reinforce it.
- **The Professional Development Events database has the identical bug**: its `Person` field is also a Notion user-mention, not a relation to `People`. So PD events, meetings, and communications each invented their own ad hoc way of pointing at a person, and none of the three agree with each other.
- **Professional Development Hub embeds the People database via a Notion synced block** — a UI trick (mirror the same block on two pages) that looks like integration but isn't: there's no query, no rollup across hub boundaries, just a copy-visible-here hack. This is Notion's ceiling, not a design choice Adam made on purpose.
- **The same fragmentation exists one level up, for organizations, not just people.** Career Overview (job history) relates to a `Companies` database. The Professional Network section has a separate `Workplaces` database. `People`'s own `Current Workplace` field relates to yet another workplace page. `Dream Universities`, `Education Institutions`, `Australian University Opportunities`, and `Potential Uni Options` are four more flat lists that are all, structurally, the same shape (name / city / country / website). At least 6–7 places independently model "an institution," none aware of the others — this needs solving alongside Person, not after it.
- **The rest of the Career/PD Hub decomposes cleanly once Person + Organization exist**, rather than needing its own database per concept:

  | Notion piece | What it actually is | Where it goes |
  |---|---|---|
  | Career Overview | Adam's own job history: role, status, dates, org, linked PD events | Not a new entity — Adam is a `Person` too; this becomes that Person's own position-history sub-record against `Organization`. |
  | PD Events & Opportunities | Provider, date, notes, tasks | `ProfessionalDevelopmentEvent` (§4) |
  | Jobs to Apply For | Status + multi-stage result (interview/rejected/successful/rounds) | A pipeline, not career history — folds into **Tasks Hub** as a `Project` type (`type: 'job_application'`), same bolt-on pattern excursions already use |
  | Presentations and Publications | Title, category, date, venue, topics — content Adam produced | **Knowledge Hub** content type (new `origins` kind alongside the existing `degree`/`unit`/`notebook`/`book`/`pd`) |
  | Book Ideas | Small backlog list | Knowledge Hub tagged notes — doesn't need its own table |
  | Dream Universities / Education Institutions / Australian University Opportunities / Potential Uni Options | Four overlapping "institutions I'm interested in" lists | Collapse into `Organization` with a `relationship_type`/`interest_level` tag (aspirational employer / PD provider / current employer / study option) |
  | Future Intel (Weekly Opportunities Scout agent output) | Freeform toggle text: recurring conferences + predicted announcement windows | Worth structuring (`predicted_window`, `priority`, `review_at`) so it can surface as a calendar reminder instead of living in a toggle nobody re-reads |
  | Dormant Resources (Education Networks, Content Opportunities) | Notion's own label says it — inactive | Don't migrate structure; data-dump into Organization/Knowledge if anything's worth keeping, no UI |

  **Net effect: the Career Hub doesn't become its own app.** Once Person + Organization exist, it's a dashboard/view over Professional Hub + Tasks Hub + Knowledge Hub, not a sixth data silo.

## 2. What's actually in the codebase today

Checked every app under `apps/` (`life`, `teaching`, `knowledge`, `tasks`) and `docs/consolidation/plan.md`.

- **There is no Person/Contact entity anywhere.** Not duplicated — simply absent. `Task.contexts` has a `kind: 'person'` option, but it's a free-text label for GTD context-matching ("call @Sarah"), not a foreign key to anything. Teaching's `ClassSchema` models a class as a group; there's no student roster as individual records. Real people (Adam's dietician, psychologist, PD contacts) exist only as prose inside `central-node.md`.
- **Everything really is a `Task`.** `apps/tasks/src/schemas/task.ts` is one shape used for admin follow-ups, excursion sub-items, and anything else that needs a checkbox. `kind` and `domain` are free strings (`z.string().min(1)`), not enums — Adam's "everything counts as a task" complaint is architecturally exact. Excursions hang off `Project.type === 'excursion'` with bolt-on optional fields (`compliance_modules`, `permission_notes`, `student_group_reference: string | null` — again, a free-text reference, not a link).
- **One good precedent already exists, and it's worth naming**: Teaching lessons are *not* crammed into `Task`. `ScheduledLessonSchema` (`apps/teaching/src/schemas/scheduled-lesson.ts`) is its own entity with `delivery_status: 'planned' | 'current' | 'delivered' | 'skipped' | 'rescheduled'` instead of a `completed` boolean — because a lesson isn't ticked off, it's *delivered or not*. This is exactly the immovable/non-completable pattern the rest of the system needs for Events and PD sessions. Adam already built the right shape once; the job is to generalize it, not invent it.
- **A real cross-hub linking primitive already exists, and it's the piece to extend**: `apps/knowledge/src/domain/hub-ref.ts` defines a typed `HubRef` union (`{hub: 'knowledge'|'teaching'|'tasks'|'life', kind, id}`), stored as `"hub:kind:id"` strings in `Page.connected: string[]`, with `netlify/functions/_shared/inverse-links.mjs` computing backlinks ("what points at this ref"). That inverse-index is exactly the query a Person page needs ("everything that points at Mr Smith"). Two caveats to fix, not reasons to avoid it: (a) it's currently Knowledge-only — `connected` doesn't exist on `Task`/`Project`/`Class`; (b) `inverse-links.mjs` scans all pages at request time with a hardcoded `SMALL_ARCHIVE = 24` fallback — fine for Knowledge's current size, not fine as the backbone of a People graph that every hub writes into.
- **Calendar is a client-side merge, not a schema.** `apps/life/js/shell/calendar-sources.js` just tags four heterogeneous per-hub feeds (`logged-days`, `scheduled-lessons`, `archive`, `board`) and merges them for display. There's no shared `CalendarEvent` type. `OVERSEER.md` already names "consolidated calendar" as a **shell-level capability** — i.e. something no single hub owns — which is the same architectural category this new work falls into.
- `docs/consolidation/plan.md` is exclusively infra (one repo, one Netlify site, one auth) — the hub-API fold is done (checkpoint-10, PASS WITH NITS). It says nothing about People or Comms. That's good news: the repo is in a quiet, stable state, which is the right moment to start this as a new slice rather than fighting an in-flight migration.

## 3. Patterns worth stealing (external research)

- **Unified Person via a relation/join table, not embedded fields.** HubSpot's "engagements" (its umbrella term for email/call/meeting/note/task) each carry an `associations` object linking to any number of contacts — the activity doesn't belong to a person, it's joined to one or more. Monica (open-source personal CRM) does the plain version: one `contacts` table, everything else (`activities`, `reminders`, `life_events`) foreign-keys to `contact_id`, with a pivot table when more than one person is involved. Notion's own relation+rollup mechanic proves the same idea works with zero custom code. Attio/Folk generalize this further — Person and Company are first-class *objects* that any other object can point at.
  - **Concrete recommendation:** extend the `HubRef` pattern that already exists, and add a `people_links` table (`entity_ref`, `person_id`, `role`) for multi-person cases (meeting attendees, cc'd comms). Single-person cases (a PD event's provider) can use a plain `HubRef` field.
- **Immovable-fact vs completable-item is Google Calendar's own split.** Calendar Events have a time slot and no completion concept; Tasks have a due date and a `completed` boolean and no fixed slot. Sunsama/Akiflow layer scheduling on top of that same split rather than merging it. The generalizable primitive is two independent fields on any schedulable entity: `occurs_at` (nullable start/end) and `completable` (boolean).
- **A polymorphic Activity/Interaction log is the Comms log, verbatim.** HubSpot's engagement types (call/email/meeting/note) and Monica's `activities` table are one log table with a `type` enum and generic person-links, rather than a separate table per channel. Communications-as-tasks ("email this person") should be a `Communication` row that can *optionally* spawn or link to a `Task`, not a `Task` that happens to be about a person.

## 4. Recommended shape

Two new shared entities, and five schedulable/loggable entity types replacing the single `Task` shape for anything that isn't genuinely GTD work:

| Entity | `occurs_at` | `completable` | `movable` | Notes |
|---|---|---|---|---|
| **Person** | — | — | — | `id, name, category (student \| colleague \| provider \| family \| external), tags, workplace_ref, contact info`. One row whether Mr Smith is an excursion chaperone, a meeting attendee, or a PD provider. Adam himself is a `Person` row too — his own career history is just his position-history sub-record. |
| **Organization** | — | — | — | `id, name, type, relationship_type (employer \| PD provider \| study option \| aspirational), city/country, website`. Collapses the Companies/Workplaces/Dream-Universities/Institutions sprawl (§1) into one table. |
| **Event** | fixed | no | no | "Tournament of Minds State Final." Calendar fact. Can hang off an Excursion/Project as its anchor date without itself being a task. |
| **Lesson** | fixed (timetable) | no (`delivery_status`) | no | Generalizes `ScheduledLessonSchema` — already correct, stays owned by Teaching. |
| **Meeting** | fixed, reschedulable | yes | yes | Notes (→ Knowledge), people (→ Person, multi), calendar presence. Most of what's in Notion's `Communications` database today under `Meeting Type`. |
| **Task / Project / Excursion / Program / sub-task** | optional (due date only) | yes | yes | Keep the existing Tasks Hub system as-is — it already works. |
| **Communication** | timestamp of contact | yes (done/follow-up) | n/a | "Called Mr Smith," "need to email the excursion coordinator." Logged fact first, task-like behaviour second. May link to a `Task` rather than being one. |
| **ProfessionalDevelopmentEvent** | fixed | usually no (attended or not) | sometimes | Provider `Person`/`Organization`, optional other attendees, Knowledge notes taken during/about it. |

Every entity links to `Person`/`Organization` via the extended `HubRef`/`people_links` mechanism, and to Knowledge notes via the existing `connected[]` mechanism, generalized past Knowledge-only.

## 5. Where this lives in the repo

**Naming decision:** the section holding Person, Organization, Communications, and PD is called **Professional Hub** — matching the existing Teaching Hub / Knowledge Hub / Tasks Hub convention, and staying plain/work-vocabulary rather than a metaphor (Relationships/Network/Orbit/Ecosystem were all considered and rejected — either too CRM-generic, too poetic, or not concrete enough). `Person`/`Organization`/`Communication` stay as the underlying entity names regardless of the hub label.

**Career Hub does not become its own app** (§1) — it's a view inside Professional Hub (your own Person's career tab, Organization filtered by `relationship_type`) plus links out to Tasks Hub (job applications) and Knowledge Hub (presentations/publications, book ideas).

| Piece | Placement | Why |
|---|---|---|
| `Person`, `Organization`, `Communication`, `ProfessionalDevelopmentEvent` | **New `apps/professional/`**, mounted at `/professional/` in the Life rail, same fold-in pattern as Teaching/Knowledge/Tasks | New first-class hub; these are the entities nothing else should own |
| `Event`, `Meeting` | **New entity types inside Tasks Hub**, siblings to `Task`/`Project` (same pattern as `ScheduledLesson` sitting beside `Task` in Teaching) | Tasks Hub already owns all the schedulable/calendar-fact machinery (`domain/calendar.ts`, due-date/status pattern, the excursion bolt-on precedent) — don't build a second calendar system inside Professional Hub. They link *out* to `Person`/`Organization` via `HubRef`; Professional Hub doesn't need to own them to be what they point at. |
| `Lesson` / `ScheduledLesson` | Stays in Teaching, unchanged | Already correctly separated from `Task` |
| Presentations/Publications, Book Ideas | Fold into Knowledge Hub's existing `Page` schema (`origins` gains `presentation`/`publication` kinds) | Content Adam produced belongs with the rest of his notes/content, not a Career-only list |
| Jobs to Apply For | Fold into Tasks Hub as `Project.type === 'job_application'` | Pipeline-shaped, same bolt-on-fields pattern excursions use |
| Shared schema/link code | **New `packages/professional-core`**, sibling to `packages/design-kit` — the one existing precedent for "code every app imports" | Contains the `Person`/`Organization` zod schemas, the extended `HubRef` union (adding `professional:person` / `professional:organization` to the existing `knowledge`/`teaching`/`tasks`/`life` kinds in `apps/knowledge/src/domain/hub-ref.ts`), and the generalized relations/backlink helper (the uncapped version of `inverse-links.mjs`). `apps/tasks` (Meeting/Event → Person), `apps/knowledge` (Page → Person/Organization), and `apps/professional` itself all import from here. |
| API + storage | New handlers on the **existing `life-hub2` Netlify site** — `/api/people`, `/api/organizations`, `/api/communications`, `/api/pd-events`, plus `/api/events` and `/api/meetings` added to the Tasks handlers. New Blobs store (e.g. `professional-hub-content`), following the exact `tasks-hub-content`/`teaching-hub-content` precedent | `plan.md`'s standing rule: prefer one Netlify site absorbing folded sections, no new passphrase. `life-hub-data`'s schema stays frozen/untouched per the consolidation non-goals. |
| Shell | Life rail gets a "Professional" mount alongside Teaching/Knowledge/Tasks. `calendar-sources.js` gains Meeting/Event (from Tasks' feed) and PD events (from Professional Hub's feed) | Same additive pattern used when Teaching's scheduled lessons were wired in |

## 6. Suggested build order (small slices, matching how the rest of this repo has been built)

1. **`Person` + `Organization` schemas and minimal CRUD** in `packages/professional-core` + `apps/professional/`, no UI polish — the thing everything else needs to exist first.
2. **Widen `HubRef`** to include `professional:person` / `professional:organization`, and give `Task`/`Project`/`Meeting`/`Event` their own `connected`/`people_links` fields the way `Page` already has one. Fix the `inverse-links.mjs` `SMALL_ARCHIVE = 24` scan cap in the same slice — it will be load-bearing for the People graph, not a Knowledge-only nicety anymore.
3. **`Communication` entity + basic log UI** in Professional Hub — the actual comms log — linked to Person (multi) and optionally a Task.
4. **`Event` and `Meeting` entities** in Tasks Hub with the `occurs_at`/`completable`/`movable` fields, feeding the existing calendar merge as new sources.
5. **`ProfessionalDevelopmentEvent`** linking Person (provider) + Organization + Knowledge notes — turns the Career/PD hub from a Notion synced-block hack into a real cross-hub view.
6. **Fold Jobs to Apply For into Tasks**, and Presentations/Publications + Book Ideas into Knowledge, per the §1 table.
7. Backfill: pull real people out of Notion's `People` database (colleagues) and `Student Database` (students, however stale) into the new `Person` table, and organizations out of `Companies`/`Workplaces`/`Dream Universities`/etc. into `Organization`, so day one isn't empty.

This is intentionally not a rewrite — Tasks Hub's GTD system stays, Teaching's lesson content model stays, Knowledge stays the notes system. The new work is the Person/Organization spine and the entity types that were missing.
