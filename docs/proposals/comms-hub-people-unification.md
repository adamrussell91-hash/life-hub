# Comms Hub, unified identity, and Universal Links proposal

> Status: draft for discussion, not adopted.
>
> This proposal records the agreed product and architecture direction. It does not amend the consolidation checkpoints and contains no application code.
>
> Core decision: Person and Organisation are shared identities. Universal Links is the single relationship architecture across all hubs. The @ picker is the standard interface for creating those links.

## 1. Problem observed in Notion

The current Notion setup fragments the same people, organisations, activities, and career material across unrelated databases.

- People contains professional contacts but excludes students.
- Student Database is separate, stale, and disconnected from People.
- Communications uses three incompatible identity fields: an Attendees relation, a Person user mention, and a free text Student Name.
- Professional Development Events uses another Person user mention rather than a relation to People.
- Companies, Workplaces, Dream Universities, Education Institutions, Australian University Opportunities, and Potential Uni Options repeatedly model the same underlying concept: an organisation.
- Career history, job applications, professional development, presentations, publications, opportunities, and contacts sit beside one another without a common identity or relationship model.
- Synced blocks make records visible in several locations but do not create reliable cross system relationships.

The replacement should not reproduce these databases under new names. It should create one shared identity and relationship foundation, then let each hub present the records relevant to its work.

## 2. Existing repository position

The current repository has useful precedents but no shared identity layer.

- There is no first class Person or Organisation entity.
- Task contexts with kind person are free text labels, not identity references.
- Student group references are free text rather than links.
- Knowledge has HubRef, Page.connected, and inverse link behaviour, but these are local to Knowledge and rely on scanning records.
- Teaching correctly keeps ScheduledLesson separate from Task and gives it delivery states rather than a completed boolean.
- The Life calendar merges several domain feeds for display. It is a projection, not a shared source of truth.
- Tasks, projects, lessons, notes, events, meetings, communications, applications, programs, excursions, people, and organisations do not yet share one linking mechanism.

The existing Knowledge link implementation is a useful prototype. It should be migrated into the shared model, not preserved as a second relationship system.

## 3. Agreed architecture

### 3.1 Shared identity, domain owned records

Person and Organisation are shared entities. No product hub owns their meaning.

Shared packages and services own:

- Person identity
- Organisation identity
- Universal Links
- relationship history
- link indexing
- identity lifecycle
- privacy and access rules
- common entity references
- common scheduling projections

Professional Hub owns the interface and workflows for:

- professional contacts
- communications
- meetings
- professional development
- career history
- job applications
- professional relationship views

Other hubs continue to own their domain records:

- Teaching owns classes, lessons, units, programs, and teaching records.
- Tasks owns tasks and projects.
- Knowledge owns notes, pages, publications, and reference material.
- Life owns personal domain records.
- The shell calendar assembles projections from domain owned records.

Professional Hub is therefore a view and workflow layer over shared identity plus linked domain records. It is not the technical owner of every Person or Organisation.

### 3.2 Universal Links

Universal Links replaces Page.connected, people_links, free text student references, isolated foreign keys used for cross hub relationships, and any new hub specific link mechanism.

Every Universal Link records:

| Field | Purpose |
|---|---|
| id | Stable link identity |
| source_ref | The record where the relationship was created |
| target_ref | The linked record |
| relationship_type | The meaning of the connection |
| role | The target's role in this context |
| context | The domain or workflow where the link applies |
| valid_from | When an ongoing relationship began |
| valid_to | When an ongoing relationship ended |
| occurred_at | Date of a point in time interaction or event |
| status | Active, inactive, archived, retained, or deleted |
| visibility | Access scope, including protected student scope |
| metadata | Small type specific details which do not justify a new entity |
| created_at | Audit timestamp |
| updated_at | Audit timestamp |

Examples:

| Source | Relationship | Target |
|---|---|---|
| Task | collaborator | Person |
| Communication | recipient | Person |
| Meeting | attendee | Person |
| Note | author | Person |
| Person | employee at | Organisation |
| Student | participant in | Program |
| Event | part of | Excursion |
| Event | venue | Organisation |
| Job application | target organisation | Organisation |
| Lesson | belongs to | Unit |
| Project | contains | Task |

There must be one canonical write path. A link is never copied into both records. Source and target pages read the same link through indexed lookup.

Universal Links must support links between every registered entity type, not only links to people.

### 3.3 Relationship history and timeline

A Person or Organisation does not have one permanent category. Roles are multiple, contextual, and dated.

Examples for one Person:

- colleague at St Aloysius' College from February 2025 to present
- NORTH+ participant from June 2025 to present
- Tournament of Minds collaborator from July 2025 to August 2025
- Everyday Magis coach from March 2026 to present

When a relationship changes, the system closes the previous dated relationship and creates the next one. It does not overwrite the past.

The unified page renders:

- dots for point in time interactions and changes
- dated periods for ongoing roles
- filters for professional, teaching, personal, program, and organisation contexts
- all concurrent roles rather than one category
- source links back to the task, meeting, event, note, program, or project which established the relationship

The timeline is functional history. It supports search, filtering, reporting, and AI context. It is not a decorative activity feed.

### 3.4 Unified Organisation view

Organisation also has multiple contextual and dated relationships.

UNSW might simultaneously or historically be:

- a study institution
- a professional development provider
- an event venue
- an employer
- an aspirational employer
- a research source
- the organisation connected to several people

Opening UNSW should assemble one cohesive view containing all of these relationships, grouped by context and ordered through a unified timeline. Organisation type and relationship type must not be a single permanent field.

### 3.5 Self identity

Adam is represented by a protected self identity, not an ordinary external contact.

The self identity supports:

- position history linked to organisations
- qualifications
- presentations and publications
- professional development
- job applications
- authored notes
- roles and relationship periods

The self record has an explicit protected identity flag and separate mutation rules so it cannot be merged, archived, or treated as an external contact accidentally.

## 4. Correct entity boundaries

### 4.1 Tasks remain actions

A Task represents work which needs to be done.

Examples:

- email Seth
- draft selection criteria
- return permission forms
- prepare meeting agenda

Tasks may link to any Person, Organisation, Project, Event, Meeting, Program, Excursion, Note, or Application through Universal Links.

### 4.2 Communications remain interaction records

A Communication records contact which occurred or was sent.

Examples:

- emailed Seth
- called the excursion coordinator
- received advice from a provider
- sent a follow up message

Planned contact is a Task. Completed or received contact is a Communication. A Communication may create or link to a follow up Task, but it does not carry task completion behaviour itself.

### 4.3 Meetings use occurrence states

A Meeting is a scheduled interaction. It uses states such as:

- scheduled
- completed
- cancelled
- rescheduled
- no show

Preparation and follow up are linked Tasks. The Meeting itself is not treated as a completable task.

### 4.4 Professional development is an Event subtype

Professional development does not require a separate top level entity.

It is an Event with event_type professional_development and optional extension fields for:

- provider
- accreditation category
- hours
- attendance state
- certificate
- linked notes
- linked learning actions

The same Event foundation supports excursions, conferences, ceremonies, deadlines, performances, and other calendar facts without making Tasks Hub their owner.

### 4.5 Scheduling is shared infrastructure

Events and Meetings do not belong to Tasks Hub merely because Tasks already has date handling.

Each domain owns its source records. A shared scheduling package defines common time, recurrence, status, and calendar projection contracts. The Life shell calendar merges these projections.

Examples:

- Teaching owns a lesson and publishes its schedule projection.
- Professional owns a professional meeting and publishes its schedule projection.
- A professional development Event belongs to Professional and publishes its schedule projection.
- An excursion event remains linked to its owning excursion or project and publishes its schedule projection.
- Tasks owns due work and publishes task due date projections.

### 4.6 Job applications have a dedicated workflow

A job application is not one Task. Professional Hub provides a dedicated application record containing:

- organisation
- position
- advertisement
- closing date
- pipeline status
- application documents
- selection criteria
- contacts and referees
- interview rounds
- outcome
- reflection

Tasks represent the actions required to progress the application. The career view assembles applications, employment history, professional development, publications, presentations, people, and organisations without copying their records.

## 5. The @ linking experience

The @ picker is the standard interface for creating a Universal Link.

Examples:

- Email @Seth about the proposal.
- Complete this task with @Seth.
- Add @UNSW as the venue.
- Link this lesson to @Year 10 English.
- Attach this task to @Tournament of Minds.
- Professional development notes on reading by @Seth.

Search results are grouped by entity type and show enough context to prevent mistakes:

- Seth Dunn, Person, colleague, St Aloysius' College
- UNSW, Organisation, study institution and event venue
- Tournament of Minds, Program
- State Final, Event
- Year 10 English, Class

Selecting a result creates a visible, clickable chip backed by the target's stable identifier. The visible label is not the stored relationship.

The editor infers a sensible relationship from the record type and language:

- Email @Seth defaults to recipient.
- Meeting with @Seth defaults to attendee.
- Notes by @Seth defaults to author.
- Complete this with @Seth defaults to collaborator.
- Event at @UNSW defaults to venue.
- Task for @Tournament of Minds defaults to related program.

The user may change the inferred role, remove the link, add more links, or create a new permitted entity when no match exists.

Clicking a chip opens the target's unified page. The same behaviour appears in Tasks, Projects, Events, Meetings, Communications, Programs, Excursions, Lessons, Notes, Publications, and Applications.

Student references use initials or neutral codes rather than full names. They appear only inside authorised teaching contexts. General search, Life search, Knowledge search, URLs, analytics, notifications, and logs must not expose student references by default.

## 6. Student references and privacy boundary

### 6.1 Purpose and scope

The application does not become a student information system. Student references exist only to support narrow operational needs such as:

- who is in a class
- who participates in a program
- who attends an excursion
- who receives coaching
- whether a permission note is pending, submitted, approved, or declined
- when participation began or ended

A student reference uses:

- a stable random internal ID
- initials or a neutral code as the display label
- class, program, excursion, or coaching membership
- permission status
- relevant participation dates
- lifecycle status

Duplicate initials use a neutral suffix such as AR1 and AR2. Codes must not contain a student number, date of birth, year group, initials plus class, or another embedded identifier.

The system does not need a separate full identity database because full student names are outside scope.

### 6.2 Information excluded

Do not store:

- full student names
- student email addresses
- school identifiers
- parent or family information
- permission forms or uploaded permission documents
- medical, disability, counselling, wellbeing, or behaviour information
- personal contact information
- school reports
- free text profiles or private notes
- dates of birth
- production exports or production logs containing student references

Permission tracking records status only. The approved school system remains the source for submitted forms, contacts, medical requirements, consent details, and other official student information.

### 6.3 Repository rule

No real student reference data enters GitHub.

The repository may contain:

- schemas
- access control code
- migration code
- synthetic fixtures
- fake initials and codes clearly marked as synthetic

The repository must not contain real class lists, real initials paired with classes or activities, production exports, production logs, access secrets, or encryption keys.

A GitHub breach should expose source code and synthetic data only. It should not reveal a real student reference or credentials used to reach runtime data.

### 6.4 Runtime protection

Initials are not treated as anonymous. A class, school, program, or excursion context might make a student identifiable.

Runtime student references therefore require:

- the existing authenticated server path
- deny by default access
- storage outside GitHub
- no student references in URLs, telemetry, analytics, error messages, or logs
- short sessions and rate limits
- encrypted transport
- protected backups
- tested archive, deidentification, and deletion
- dependency, code, and secret scanning
- a documented purpose and retention period

The @ picker shows student codes only inside authorised teaching workflows. Other hubs do not return student results unless the current workflow explicitly permits them.

### 6.5 Review before live use

Before real initials or codes are entered, confirm the College permits this limited use with the selected hosting provider.

The review should record:

- the operational purpose
- the exact permitted fields
- the hosting provider
- who has access
- retention and deletion periods
- incident response responsibility
- the approved school system which remains the source of truth

This is a smaller approval question than operating a full student identity database, but initials linked to classes or activities still require deliberate handling.

## 7. Lifecycle and retention

Status terms must have defined behaviour.

| Status | Behaviour |
|---|---|
| active | Appears in current search, suggestions, dashboards, and work |
| inactive | Historical relationship remains available but is excluded from current defaults |
| archived | Read only, hidden from ordinary suggestions, available through deliberate archive search |
| retained | Hidden from normal use and held for a documented reason until a defined review or deletion date |
| deidentified | Identity removed while approved anonymous activity history remains |
| deleted | Personal information irretrievably removed; only a non identifying tombstone remains where needed for link integrity |

Stored is not a status because it says nothing about access, purpose, or deletion.

Archive must not mean forgotten permanent retention. Every retained identity requires a retention reason, review date, and final action.

## 8. Link storage, integrity, and performance

Universal Links must not depend on scanning every Page, Task, Person, or Project at request time.

The storage layer must support indexed lookup in both directions:

- all outgoing links for source_ref
- all incoming links for target_ref
- links by relationship_type
- links active on a given date
- links within a visibility scope

Required integrity behaviour:

- validate source and target entity types
- prevent duplicate equivalent links
- preserve history when roles change
- stop deletion when protected references require review
- deidentify or tombstone deleted identities without silently breaking history
- update both lookup indexes atomically or recover safely
- record audit history for protected changes
- rebuild indexes through a tested administrative operation
- migrate existing Knowledge connected links into Universal Links
- retire old write paths after migration

The implementation plan must define storage shape, index keys, consistency rules, migration, backup, and recovery before Universal Links becomes load bearing.

## 9. First vertical slice

Do not begin with several disconnected schema and CRUD slices.

The first slice should deliver one complete workflow:

1. Create Seth as a Person.
2. Link Seth to an Organisation.
3. Add two concurrent dated roles in different contexts.
4. Render the roles and changes on Seth's relationship timeline.
5. Write Email @Seth in a Task.
6. Resolve the @ mention into a Universal Link with role recipient.
7. Log the completed Communication.
8. Link the Communication to the Task and Seth.
9. Create a follow up Task linked to Seth.
10. Open Seth and see the Organisation, roles, Task, Communication, and timeline together.
11. Mark one relationship inactive without deleting its history.
12. Archive Seth and verify normal suggestions hide the record while deliberate archive search finds it.

Acceptance criteria:

- one canonical Universal Link write path
- indexed lookup from source and target
- no duplicate relationship storage
- shared @ picker used by at least Task and Communication
- relationship role inference remains editable
- unified Person page reads links rather than copied fields
- relationship timeline shows concurrent roles and dated changes
- lifecycle states behave as defined
- tests cover link creation, backlinks, role history, archive filtering, and duplicate prevention
- only synthetic data appears in repository fixtures and tests

## 10. Later slices

After the first slice proves the model:

1. Extend the @ picker and Universal Links to Projects, Events, Meetings, Programs, Excursions, Lessons, Notes, Publications, and Applications.
2. Add the unified Organisation page and timeline.
3. Add shared scheduling projections without transferring domain ownership to Tasks.
4. Add Meeting workflows and linked preparation or follow up Tasks.
5. Add Event subtypes, including professional development.
6. Add the dedicated job application pipeline and career dashboard.
7. Migrate existing Knowledge connected links.
8. Add identity duplicate detection and merge tooling.
9. Complete the limited student reference review before entering real initials or codes.
10. Import approved professional contacts and organisations with deduplication and provenance.
11. Add only current, purpose bound student references needed for classes, programs, excursions, coaching, or permission status. Do not import the stale Student Database and do not import full student identities.

## 11. Explicit non goals

- Do not turn every scheduled record into a Task.
- Do not place all Events and Meetings inside Tasks Hub.
- Do not maintain both connected fields and a second people_links system.
- Do not give Person or Organisation one permanent category.
- Do not treat a planned communication and a completed communication as the same record.
- Do not make Professional Hub the technical owner of shared identities.
- Do not copy linked records into Person or Organisation pages.
- Do not create a separate top level ProfessionalDevelopmentEvent entity before an Event subtype proves insufficient.
- Do not turn the application into a student information system.
- Do not store full student identities, official forms, sensitive student information, or unrestricted student notes.
- Do not place secrets, production data, real initials, class lists, or identifiable student fixtures in GitHub.

The intended result is one identity and relationship spine across the umbrella application. Each hub keeps its domain responsibilities. Universal Links connects their records. The @ picker makes those connections simple to create. Unified Person and Organisation pages make the complete history coherent to use.
