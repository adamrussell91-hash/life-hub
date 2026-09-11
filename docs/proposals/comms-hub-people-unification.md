# Comms Hub + unified People model — proposal

> Status: **draft for discussion**, not adopted. This is not a consolidation checkpoint (see `docs/consolidation/`) — it's new content-architecture work, written up so it can be pasted into `docs/consolidation/plan.md` as a new slice if Adam wants Cursor to build it.
>
> Origin: Adam asked Claude Code to look at the Notion Comms Hub, the People/professional-relationship setup, and the existing `life-hub` codebase, and say what a from-scratch, non-Notion version should look like.

## 1. What's actually in Notion today

- **People lives under "Professional Relationship Management"** (`People` database, `Career/Professional Development Hub`) — colleagues, mentors, providers. Each person page carries an `AI summary`, `Communications` relation, `Current Workplace` relation, `LinkedIn`, etc.
- **Students are a completely separate, disconnected thing** — a `Student Database` last touched in 2023 (archived under "Gradebook 2023"). There is no relation between it and `People`.
- **The `Communications` database already shows the exact fragmentation Adam described**, inside a single table:
  - `Attendees` — a real relation to the `People` data source. This is the *only* field that correctly links to a person record.
  - `Person` — a Notion **user-mention** field (an account, not a page in `People`). Structurally different from `Attendees` despite meaning the same thing.
  - `Student Name` — plain text. Because students aren't in `People`, there's no way to relate a communication to a student — so it degrades to a string that can typo, can't be queried, and can't roll up.
  - `Meeting Type` includes both `Professional Development` and `Student Meeting` as *values of the same select field* — i.e. Notion is already trying to tell you these are the same kind of object (a logged interaction) with different subjects, but the schema doesn't reinforce it.
- **The Professional Development Events database has the identical bug**: its `Person` field is also a Notion user-mention, not a relation to `People`. So PD events, meetings, and communications each invented their own ad hoc way of pointing at a person, and none of the three agree with each other.
- **Professional Development Hub embeds the People database via a Notion synced block** — a UI trick (mirror the same block on two pages) that looks like integration but isn't: there's no query, no rollup across hub boundaries, just a copy-visible-here hack. This is Notion's ceiling, not a design choice Adam made on purpose.

Net: Adam's read is correct. There are at least **three incompatible "who is this about" representations** already in use (`Attendees` relation, `Person` user-mention, `Student Name` text) across just two databases, and students were never brought into the graph at all. This isn't a two-list merge (students vs professionals) — it's an n-way fragmentation that happened because Notion has no way to force one canonical identity.

## 2. What's actually in the codebase today

Checked every app under `apps/` (`life`, `teaching`, `knowledge`, `tasks`) and `docs/consolidation/plan.md`.

- **There is no Person/Contact entity anywhere.** Not duplicated — simply absent. `Task.contexts` has a `kind: 'person'` option, but it's a free-text label for GTD context-matching ("call @Sarah"), not a foreign key to anything. Teaching's `ClassSchema` models a class as a group; there's no student roster as individual records. Real people (Adam's dietician, psychologist, PD contacts) exist only as prose inside `central-node.md`.
- **Everything really is a `Task`.** `apps/tasks/src/schemas/task.ts` is one shape used for admin follow-ups, excursion sub-items, and anything else that needs a checkbox. `kind` and `domain` are free strings (`z.string().min(1)`), not enums — Adam's "everything counts as a task" complaint is architecturally exact. Excursions hang off `Project.type === 'excursion'` with bolt-on optional fields (`compliance_modules`, `permission_notes`, `student_group_reference: string | null` — again, a free-text reference, not a link).
- **One good precedent already exists, and it's worth naming**: Teaching lessons are *not* crammed into `Task`. `ScheduledLessonSchema` (`apps/teaching/src/schemas/scheduled-lesson.ts`) is its own entity with `delivery_status: 'planned' | 'current' | 'delivered' | 'skipped' | 'rescheduled'` instead of a `completed` boolean — because a lesson isn't ticked off, it's *delivered or not*. This is exactly the immovable/non-completable pattern the rest of the system needs for Events and PD sessions. Adam already built the right shape once; the job is to generalize it, not invent it.
- **A real cross-hub linking primitive already exists, and it's the piece to extend**: `apps/knowledge/src/domain/hub-ref.ts` defines a typed `HubRef` union (`{hub: 'knowledge'|'teaching'|'tasks'|'life', kind, id}`), stored as `"hub:kind:id"` strings in `Page.connected: string[]`, with `netlify/functions/_shared/inverse-links.mjs` computing backlinks ("what points at this ref"). That inverse-index is exactly the query a Person page needs ("everything that points at Mr Smith"). Two caveats to fix, not reasons to avoid it: (a) it's currently Knowledge-only — `connected` doesn't exist on `Task`/`Project`/`Class`; (b) `inverse-links.mjs` scans all pages at request time with a hardcoded `SMALL_ARCHIVE = 24` fallback — fine for Knowledge's current size, not fine as the backbone of a People graph that every hub writes into.
- **Calendar is a client-side merge, not a schema.** `apps/life/js/shell/calendar-sources.js` just tags four heterogeneous per-hub feeds (`logged-days`, `scheduled-lessons`, `archive`, `board`) and merges them for display. There's no shared `CalendarEvent` type. That's fine for now but means "immovable event" can't be a first-class concept until something upstream of the calendar view defines it.
- `docs/consolidation/plan.md` is exclusively infra (one repo, one Netlify site, one auth) — the hub-API fold is done (checkpoint-10, PASS WITH NITS). It says nothing about People or Comms. That's good news: the repo is in a quiet, stable state, which is the right moment to start this as a new slice rather than fighting an in-flight migration.

## 3. Patterns worth stealing (external research)

- **Unified Person via a relation/join table, not embedded fields.** HubSpot's "engagements" (its umbrella term for email/call/meeting/note/task) each carry an `associations` object linking to any number of contacts — the activity doesn't belong to a person, it's joined to one or more. Monica (open-source personal CRM) does the plain version: one `contacts` table, everything else (`activities`, `reminders`, `life_events`) foreign-keys to `contact_id`, with a pivot table when more than one person is involved. Notion's own relation+rollup mechanic proves the same idea works with zero custom code: every entity gets a `Person` relation, the Person page rolls up "last contacted," "open items," etc. automatically. Attio/Folk generalize this further — Person and Company are first-class *objects* that any other object can point at, and the person page auto-builds its timeline from every incoming link.
  - **Concrete recommendation:** don't embed a `person_id` on every entity by convention — extend the `HubRef` pattern that already exists, and add a `people_links` table (`entity_ref`, `person_id`, `role`) for the multi-person cases (meeting attendees, cc'd comms). Single-person cases (a PD event's provider) can use a plain `HubRef` field. This is the direct generalization of what `Page.connected[]` + `inverse-links.mjs` already do — just widened past Knowledge.
- **Immovable-fact vs completable-item is Google Calendar's own split, not a hypothetical.** Calendar Events have a time slot and no completion concept; Tasks have a due date and a `completed` boolean and no fixed slot. Sunsama/Akiflow layer scheduling on top of that same split (a task gets time-blocked without becoming an "event"); they don't merge the concepts. The generalizable primitive is two independent flags/fields on any schedulable entity: `occurs_at` (nullable start/end) and `completable` (boolean) — a Lesson or Event has `occurs_at` set and `completable = false`; a Meeting has both; a Task has `completable = true` and `occurs_at` usually null.
- **A polymorphic Activity/Interaction log is the Comms Hub, verbatim.** HubSpot's engagement types (call/email/meeting/note) and Monica's `activities` table are the same idea: one log table with a `type` enum and generic person-links, rather than a separate table per channel. Communications-as-tasks ("email this person") should be a `Communication` row that can *optionally* spawn or link to a `Task`, not a `Task` that happens to be about a person.

## 4. Recommended shape

Five entity types instead of one `Task`, all sharing the same person-linking mechanism:

| Entity | `occurs_at` | `completable` | `movable` | Notes |
|---|---|---|---|---|
| **Event** | fixed | no | no | "Tournament of Minds State Final." Calendar fact. Can still hang off an Excursion/Project as its anchor date, but it is not a task and nothing marks it done. |
| **Lesson** | fixed (timetable) | no (`delivery_status`) | no | Generalizes `ScheduledLessonSchema` — already correct, just needs to stop being Teaching-only in concept even if it stays Teaching-owned in data. |
| **Meeting** | fixed, reschedulable | yes | yes | Has notes (→ Knowledge), people (→ People, multi), and calendar presence. This is most of what's in Notion's `Communications` database today under `Meeting Type`. |
| **Task / Project / Excursion / Program / sub-task** | optional (due date only) | yes | yes | Keep the existing Tasks Hub system basically as-is — it already works and Adam isn't complaining about this part. |
| **Communication** | timestamp of contact | yes (done/follow-up) | n/a | "Called Mr Smith," "need to email the excursion coordinator." Logged fact first, task-like behaviour (follow-up due, marked done) second. May link to a `Task` for the "still need to send this" case rather than being one. |
| **Professional Development Event** | fixed | usually no (attended or not) | sometimes | Links to a provider `Person`, optionally other attendee `Person`s, and to Knowledge notes taken during/about it. |

**Person** is a new, hub-owned-by-nobody entity: `id, name, category (student | colleague | provider | family | external), tags, workplace, contact info`. Category is a facet, not a separate table — the whole point is Mr Smith is one row whether he's an excursion chaperone, a meeting attendee, or a PD provider.

Every other entity above links to Person via the extended `HubRef`/`people_links` mechanism (§3), and to Knowledge notes via the existing `connected[]` mechanism, generalized past Knowledge-only. That's what makes "log a meeting with Mr Smith → he's on the excursion → calendar shows both → his page shows the whole timeline" fall out for free instead of being hand-wired per feature.

## 5. Suggested build order (small slices, matching how the rest of this repo has been built)

1. **`Person` schema + minimal CRUD**, no UI polish — the thing everything else needs to exist first.
2. **Widen `HubRef`** to include `{hub: 'people', kind: 'person', id}`, and give `Task`/`Project`/`Meeting`/`Event` their own `connected`/`people_links` fields the way `Page` already has one. Fix the `inverse-links.mjs` `SMALL_ARCHIVE = 24` scan cap in the same slice — it will be load-bearing for the People graph, not a Knowledge-only nicety anymore.
3. **`Communication` entity + basic log UI** — the actual "Comms Hub" — linked to Person (multi) and optionally a Task.
4. **`Event` and `Meeting` entities** with the `occurs_at`/`completable`/`movable` fields, feeding the existing calendar merge as new sources.
5. **`ProfessionalDevelopmentEvent`** linking Person (provider) + Knowledge notes — this is the piece that turns the Career/PD hub from a Notion synced-block hack into a real cross-hub view.
6. Backfill: pull the real people out of Notion's `People` database (colleagues) and `Student Database` (students, however stale) into the new `Person` table as the seed data, so day one isn't empty.

This is intentionally not a rewrite — Tasks Hub's GTD system stays, Teaching's lesson content model stays, Knowledge stays the notes system. The new work is the Person spine and the four schedulable/loggable types that were missing.
