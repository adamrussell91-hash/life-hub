# PR 304 implementation programme

## Purpose

This document converts PR 304, `Proposal: Universal Links, unified identity, and Professional Hub`, into executable coding instructions for Claude Code and Codex.

Source proposal: https://github.com/adamrussell91-hash/life-hub/pull/304

Proposal head reviewed: `aa3fb00b4a119f81b38d205cf87ffc9c2aba84e8`

Repository: `adamrussell91-hash/life-hub`

This is an implementation programme, not permission to build every phase in one pull request. Execute one slice at a time. Stop after every slice for independent review.

## Execution contract and resolved decisions

This section is authoritative when any later sentence appears ambiguous. Claude Code must not turn the decisions below into questions for Adam.

1. Slice 0 is documentation and repository verification only. It contains no schemas, storage code, read functions, API handlers or UI.
2. Slice 1 contains all three foundation elements: type and shape contracts, pure indexed read and query functions, and read only Netlify Blobs store wiring. It contains no write path, HTTP endpoint or UI.
3. The first user interface lives in a new `apps/professional` SPA mounted at `/professional/`. Do not place Person pages or relationship timelines inside `apps/tasks`.
4. Tasks receives only its workflow integration in Slice 6: the shared picker, relationship chips and Task to Person links.
5. PR 304 has two planning documents, not three: `docs/proposals/comms-hub-people-unification.md` and this file. There is no separate supplied implementation programme outside Git.
6. Slice 0 compares current `origin/main` with those two files at PR 304's pinned planning commit. It does not require either planning file to exist on `main`.
7. Repository reconciliation means verifying each asserted path and architectural assumption, recording `confirmed`, `moved`, `missing` or `contradicted`, and naming the exact replacement path or required decision. It does not mean rewriting consolidation documents.
8. Do not land, merge or copy the proposal into `main` during Slice 0.
9. Every implementation slice begins only after its predecessor has been reviewed and merged. Do not stack slices unless Adam explicitly directs a stacked branch.
10. No slice is permission to merge. Open a draft pull request and stop.

### Source retrieval

PR 304 planning head for this revision is `7fd44087e5d88d8e7dff1e224b7d7c278712fcef`.

Claude Code must retrieve the planning documents without asking Adam to paste them:

```bash
git fetch origin pull/304/head:refs/remotes/origin/pr-304-plan
git show origin/pr-304-plan:docs/proposals/comms-hub-people-unification.md
git show origin/pr-304-plan:docs/universal-links/implementation-programme.md
```

If PR 304 advances, use the head SHA Adam names. Do not silently substitute a later revision.

### Question gate

Proceed without asking Adam when the answer exists in this document, the proposal, current repository code or an applicable `AGENTS.md` file. Record ordinary repository drift in the Slice 0 map.

Stop and ask only when one of these conditions applies:

1. GitHub or repository access is unavailable.
2. The requested base commit no longer exists.
3. A required action would expose real student data or weaken authentication.
4. A migration would delete or overwrite production data.
5. Current code proves two explicit instructions mutually exclusive and no safe non runtime documentation result is possible.

Do not ask Adam to choose slice boundaries, UI location, included foundation components, planning sources, file naming or whether to merge. Those decisions are fixed here.

## Agent responsibilities

Claude Code owns repository reconnaissance, implementation, migrations, broad mechanical changes and complete local verification.

Codex owns architecture, scope gates, acceptance criteria, independent review, privacy review and correction instructions.

Never let both agents edit the same branch at the same time.

## Required outcome

Build one shared identity and relationship spine across the umbrella application.

The finished architecture must provide:

1. Shared Person and Organisation entities.
2. A protected self identity for Adam.
3. Universal Links between registered entity types.
4. One canonical Universal Link write service.
5. Indexed lookup from source and target.
6. A declared relationship registry.
7. Multiple concurrent, contextual and dated roles.
8. Functional Person and Organisation timelines.
9. A shared `@` picker and linked entity chips.
10. Professional Communications, Meetings, Events and Applications.
11. A separate, protected StudentReference entity owned by Teaching.
12. Migration from Knowledge `connected` links.
13. Explicit lifecycle, privacy, recovery and audit behaviour.

## Repository facts which must remain true

The implementation must respect the current repository rather than rebuilding the platform.

1. The umbrella site is served from `life-hub.adam-russell.com`.
2. Life is mounted at `/`.
3. Teaching is mounted at `/teaching/`.
4. Knowledge is mounted at `/knowledge/`.
5. Tasks is mounted at `/tasks/`.
6. The umbrella API is hosted through root `netlify/functions/`.
7. All private operator APIs use `createOperatorHandler` or `createSessionOriginHandler`.
8. Authentication uses `LIFE_HUB_PASSPHRASE_HASH`, `SESSION_SECRET` and `life_hub_session`.
9. Do not create a second passphrase, cookie or authentication flow.
10. Tasks data stays in `tasks-hub-content`.
11. Knowledge notes stay in the separate private GitHub repository `adamrussell91-hash/knowledge-hub-data` through `netlify/functions/_shared/knowledge-data.mjs`. Do not move them into Netlify Blobs.
12. Teaching records stay in `teaching-hub-content`.
13. Root `netlify.toml` remains the only Functions deployment configuration.
14. New hub interfaces must use `packages/design-kit` and `packages/hub-switcher.js`.
15. The frontend remains vanilla TypeScript and DOM APIs. Do not add React, Vue, Svelte or another framework.
16. Node 22 remains the supported runtime.
17. Existing domain ownership fields remain authoritative. Examples include `Task.parent_project_id` and Teaching lesson to unit ownership.

## Absolute exclusions

Do not:

1. Replace authoritative domain ownership or containment fields with Universal Links.
2. Store copied arrays of links inside Person, Organisation, Task or Communication records.
3. create a second cross hub link system.
4. store real student names, student emails, school identifiers, dates of birth, family information, medical information, wellbeing information or official permission forms.
5. place real student initials, codes, class lists, production exports, production logs or secrets in GitHub.
6. expose StudentReference through general search, Life, Knowledge, Professional, logs, analytics, notifications, URLs or AI context.
7. create a new deployment, hostname, database vendor or authentication system.
8. change the existing Life, Tasks, Teaching or Knowledge data ownership boundary.
9. redesign unrelated screens.
10. introduce a general graph database.
11. add speculative entity types before a real workflow uses them.
12. import the stale Notion Student Database.
13. silently repair or discard a failed multi record write.
14. claim full atomicity across several Blob keys.

## Delivery rules

Each pull request must:

1. implement one numbered slice from this document;
2. start from current `main`;
3. use a branch named `claude/universal-links-slice-N-<short-name>`;
4. list every changed file in the PR body;
5. state migrations, storage keys, new endpoints and new environment variables;
6. contain no real user or student data;
7. include automated tests for success, rejection and partial failure;
8. run root `npm test` and `npm run build`;
9. run every affected app test suite;
10. remain unmerged until Codex reviews the actual diff.

Do not stack a new slice on an unmerged slice unless Adam explicitly approves a stacked branch.

## Naming decisions

Use these product names consistently:

| Concept | Required name |
| --- | --- |
| Shared link model | Universal Link |
| Shared link collection | Universal Links |
| Protected teaching identity | StudentReference |
| Shared professional identity | Person |
| Shared institutional identity | Organisation |
| Professional interaction record | Communication |
| Shared relationship creation interface | `@` picker |
| Human history display | Relationship timeline |

Use snake case for stored JSON keys and lower case canonical enum values.

## Architecture overview

The architecture has six layers.

1. Entity references identify records without copying them.
2. Entity resolvers verify an entity exists and return a safe display projection.
3. The relationship registry defines permitted relationships.
4. The Universal Link repository stores links and directional indexes.
5. Domain APIs own Person, Organisation, Communication and existing hub records.
6. Shared UI primitives search entities and create links through the canonical API.

### Domain ownership

| Record | Owner | Runtime storage |
| --- | --- | --- |
| Person | shared identity service | `universal-link-content` |
| Organisation | shared identity service | `universal-link-content` |
| Universal Link | shared link service | `universal-link-content` |
| Relationship operation journal | shared link service | `universal-link-content` |
| Communication | Professional Hub | `professional-hub-content` |
| Meeting | Professional Hub | `professional-hub-content` |
| Professional Event | Professional Hub | `professional-hub-content` |
| Job Application | Professional Hub | `professional-hub-content` |
| Task and Project | Tasks Hub | existing `tasks-hub-content` |
| Lesson, Unit, Class and StudentReference | Teaching Hub | existing `teaching-hub-content` |
| Page and Publication | Knowledge Hub | existing private GitHub repository `adamrussell91-hash/knowledge-hub-data` through `_shared/knowledge-data.mjs` |
| Life records | Life Hub | existing Life stores |

`universal-link-content` and `professional-hub-content` are named stores inside the existing umbrella Netlify deployment. They require no new site, hostname or authentication secret.

## Canonical entity references

Create one server implementation at:

`netlify/functions/_shared/entity-ref.mjs`

Add tests at:

`tests/unit/entity-ref.test.js`

An EntityRef contains:

```js
{
  namespace: 'shared' | 'professional' | 'tasks' | 'teaching' | 'knowledge' | 'life',
  kind: string,
  id: string
}
```

Canonical string format:

```text
namespace:kind:id
```

Initial registered references:

```text
shared:person:<id>
shared:organisation:<id>
professional:communication:<id>
tasks:task:<id>
tasks:project:<id>
```

Register other references only in the slice which supplies their resolver.

Requirements:

1. IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$`.
2. Generated identity IDs must use `crypto.randomUUID()` with a non semantic prefix.
3. Never embed a name, email, year group, class, date of birth or school identifier in an ID.
4. Parsing must reject unknown namespace and kind pairs.
5. Formatting followed by parsing must round trip exactly.
6. Existing Knowledge HubRef parsing must remain operational until migration completes.
7. Do not extend `hub-ref.mjs` into the new canonical implementation. Treat HubRef as the legacy adapter.

## Entity records

Create server validation at:

`netlify/functions/_shared/identity-schema.mjs`

Do not introduce a new validation framework. Follow current server validation patterns. Client TypeScript types live in the consuming app.

### Person

```js
{
  schema_version: 1,
  id: 'person_<uuid>',
  kind: 'person',
  display_name: 'Seth Dunn',
  sort_name: 'Dunn, Seth',
  aliases: [],
  lifecycle_status: 'active' | 'inactive' | 'archived' | 'retained' | 'deidentified' | 'deleted',
  is_self: false,
  retention_reason: null,
  retention_review_at: null,
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

Rules:

1. `display_name` is required for ordinary professional contacts.
2. Exactly one active record may have `is_self: true`.
3. `is_self` becomes immutable after creation.
4. A self record cannot be merged, archived, retained, deidentified or deleted through ordinary endpoints.
5. Deidentification replaces identifying labels with a non identifying tombstone label.
6. Deleted identity responses never return the former name or aliases.

### Organisation

```js
{
  schema_version: 1,
  id: 'organisation_<uuid>',
  kind: 'organisation',
  display_name: 'UNSW',
  legal_name: null,
  aliases: [],
  lifecycle_status: 'active' | 'inactive' | 'archived' | 'retained' | 'deleted',
  retention_reason: null,
  retention_review_at: null,
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

Do not store one permanent organisation type. Study institution, venue, employer and provider are contextual relationships.

### StudentReference

Do not implement real StudentReference writes before the College approval gate in Slice 8.

The reserved shape is:

```js
{
  schema_version: 1,
  id: 'student_ref_<uuid>',
  kind: 'student_reference',
  display_code: 'AR1',
  lifecycle_status: 'active' | 'inactive' | 'archived' | 'deleted',
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

StudentReference is not a Person subtype. No Person API, Person search or Person page may return one.

## Relationship registry

Create:

`netlify/functions/_shared/relationship-registry.mjs`

Add tests:

`tests/unit/relationship-registry.test.js`

Each declaration must define:

```js
{
  key: 'employee_at',
  source_kinds: ['shared:person'],
  target_kinds: ['shared:organisation'],
  inverse_label: 'employs',
  cardinality: 'many_to_many',
  temporal_mode: 'period',
  role_mode: 'optional_text',
  metadata_keys: [],
  allowed_visibility: ['operator'],
  duplicate_fields: [
    'source_ref',
    'target_ref',
    'relationship_type',
    'context_key',
    'context_ref',
    'role',
    'valid_from',
    'occurred_at'
  ]
}
```

First slice declarations:

| Key | Source | Target | Inverse | Time |
| --- | --- | --- | --- | --- |
| `employee_at` | Person | Organisation | `employs` | period |
| `member_of` | Person | Organisation | `has_member` | period |
| `collaborator` | Task | Person | `collaborates_on` | timeless |
| `contact` | Task | Person | `contacted_for_task` | timeless |
| `recipient` | Communication | Person | `received_communication` | point |
| `about_person` | Communication | Person | `communication_about` | point |
| `follows_from` | Communication | Task | `prompted_communication` | timeless |
| `follow_up` | Task | Communication | `has_follow_up` | timeless |

Do not use `role` to repeat the relationship type. For `employee_at`, role contains a title such as `Gifted Education Teacher`. For `recipient`, role is null.

Registry validation must reject:

1. reversed source and target types;
2. unknown relationship keys;
3. dates on timeless relationships;
4. `occurred_at` on period relationships;
5. `valid_from` or `valid_to` on point relationships;
6. `valid_to` before `valid_from`;
7. metadata keys not declared by the relationship;
8. protected visibility not allowed by the relationship;
9. role text for a relationship with `role_mode: 'none'`.

Expose a read only projection through `GET /api/relationship-registry`. Do not expose internal repair or storage fields.

## Universal Link record

Create:

`netlify/functions/_shared/universal-link-schema.mjs`

Record shape:

```js
{
  schema_version: 1,
  id: 'ul_<equivalence hash>',
  source_ref: 'tasks:task:task_123',
  target_ref: 'shared:person:person_456',
  relationship_type: 'collaborator',
  role: null,
  context_key: 'tasks',
  context_ref: null,
  temporal_mode: 'timeless',
  valid_from: null,
  valid_to: null,
  occurred_at: null,
  status: 'current' | 'ended' | 'suppressed' | 'deleted',
  visibility: 'operator' | 'teaching_protected',
  metadata: {},
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

Use a deterministic ID derived from the registry's duplicate fields. Use Node `crypto.createHash('sha256')`. Sort object keys and normalise nulls before hashing. Repeating an equivalent create returns the existing link with `created: false`.

Do not include `valid_to`, `status`, display labels or audit timestamps in the equivalence hash.

## Storage layout

Create:

`netlify/functions/_shared/universal-link-blobs.mjs`

Use store name:

`universal-link-content`

Use strong consistency where supported by the installed `@netlify/blobs` version.

Keys:

```text
entities/person/<person_id>
entities/organisation/<organisation_id>
entities/index/person/<entity_id>
entities/index/organisation/<entity_id>
entities/events/<entity_ref_hash>/<event_id>

universal-links/links/<link_id>
universal-links/by-source/<source_ref_hash>/<link_id>
universal-links/by-target/<target_ref_hash>/<link_id>
universal-links/by-type/<relationship_type>/<link_id>
universal-links/operations/<operation_id>
universal-links/schema
```

Index membership records contain only `link_id`, `canonical_ref`, `created_at` and `schema_version`.

Use one membership Blob per link rather than a shared array. This prevents concurrent writers from replacing each other's index additions.

Hash canonical refs for key safety with SHA 256 and retain the canonical ref inside the membership record for collision verification.

## Canonical write service

Create:

`netlify/functions/_shared/universal-link-repository.mjs`

No handler or domain service may write Universal Link keys directly.

The repository exposes:

```js
createLink(input, accessContext)
getLink(id, accessContext)
listOutgoing(sourceRef, accessContext)
listIncoming(targetRef, accessContext)
listForEntity(ref, accessContext)
endLink(id, validTo, accessContext)
suppressLink(id, reason, accessContext)
deleteLink(id, reason, accessContext)
repairOperation(operationId, accessContext)
rebuildIndexes(accessContext)
```

### Create protocol

`createLink` performs these steps in order:

1. Parse both refs.
2. Resolve both endpoint records.
3. Derive endpoint visibility.
4. Validate source, target, relationship type, role, time and metadata against the registry.
5. Derive link visibility as the strictest endpoint and workflow visibility.
6. Reject a client request which attempts weaker visibility.
7. Compute the deterministic equivalence ID.
8. Return the existing record when an equivalent link exists.
9. Write an operation journal record with `status: 'prepared'`.
10. Write the authoritative link record.
11. Write source membership.
12. Write target membership.
13. Write relationship type membership.
14. Mark the operation `committed`.
15. Return the committed link.

If steps 10 to 13 fail, mark the operation `repair_needed` where possible and return a fail visible `503 link_write_incomplete`. A retry with the same input must repair the same deterministic link rather than create another link.

### Recovery

`repairOperation` replays missing idempotent writes from the journal.

`rebuildIndexes`:

1. is available only through an authenticated operator POST action;
2. lists authoritative link records;
3. verifies every link against its current registry declaration;
4. rewrites missing membership records;
5. reports invalid links without deleting them;
6. records counts for inspected, repaired, invalid and failed records;
7. never logs endpoint display labels;
8. has a dry run mode;
9. has deterministic unit tests.

## Entity resolvers

Create:

`netlify/functions/_shared/entity-resolvers.mjs`

Each resolver returns only:

```js
{
  ref,
  kind,
  display_label,
  supporting_label,
  href,
  lifecycle_status,
  visibility
}
```

Initial resolvers:

1. Person from `universal-link-content`.
2. Organisation from `universal-link-content`.
3. Task from existing `tasks-hub-content` using `taskKey` and `getJSON`.
4. Communication from `professional-hub-content`.

Resolution rules:

1. A missing endpoint produces `404 endpoint_not_found`.
2. An inaccessible endpoint behaves as absent and also produces `404 endpoint_not_found`.
3. Deleted endpoints never expose former labels.
4. Archived endpoints resolve only for deliberate overview and archive workflows.
5. StudentReference has no general resolver. Slice 8 adds a Teaching scoped resolver unavailable to generic APIs.

## Authorisation model

Create:

`netlify/functions/_shared/entity-access.mjs`

The current application has one authenticated operator. Preserve this model while making workflow scope explicit.

```js
{
  actor: 'operator',
  workflow: 'professional' | 'tasks' | 'teaching' | 'knowledge' | 'life' | 'administration',
  allowed_visibility: ['operator'],
  allowed_entity_kinds: []
}
```

Rules:

1. Build AccessContext on the server from the handler, route and verified session.
2. Never accept actor, workflow or allowed visibility from request JSON.
3. Every link read checks access to the link and both endpoints.
4. Every search result checks entity lifecycle and workflow scope before projection.
5. Protected targets contribute nothing to result counts or pagination totals.
6. Generic `@` search excludes StudentReference even when a matching code exists.
7. Errors and logs contain generic codes, link IDs and operation IDs only. Do not include protected labels.

## API contracts

All handlers use the existing umbrella session and CORS helpers.

### Identities

Create:

`netlify/functions/entities.mjs`

Route:

`/api/entities`

Supported operations:

1. `GET ?ref=<canonical_ref>` returns one safe projection plus lifecycle metadata.
2. `POST` creates Person or Organisation.
3. `PATCH ?ref=<canonical_ref>` updates allowed fields or lifecycle state.
4. No hard delete in the first slice.

Create:

`netlify/functions/entity-search.mjs`

Route:

`/api/entities/search?q=<query>&kinds=person,organisation,task&include_archived=false`

Requirements:

1. minimum query length is two characters;
2. maximum query length is 100 characters;
3. maximum results is 20;
4. group results by entity kind;
5. exclude inactive and archived by default;
6. sort exact prefix matches before token matches;
7. return only resolver projections;
8. never return StudentReference;
9. use `cache-control: no-store`.

### Universal Links

Create:

`netlify/functions/universal-links.mjs`

Route:

`/api/universal-links`

Operations:

1. `GET ?source_ref=` lists outgoing links.
2. `GET ?target_ref=` lists incoming links.
3. `GET ?entity_ref=` lists both directions with resolved safe projections.
4. `GET ?id=` returns one link.
5. `POST` creates one link.
6. `PATCH ?id=` supports actions `end` and `suppress`.
7. `DELETE ?id=` is unavailable until lifecycle tests pass.

Create:

`netlify/functions/universal-links-admin.mjs`

Route:

`/api/universal-links/admin`

Actions:

1. `repair_operation`;
2. `rebuild_indexes`;
3. `dry_run_rebuild`.

### Entity overview and timeline

Create:

`netlify/functions/entity-overview.mjs`

Route:

`/api/entities/overview?ref=<canonical_ref>`

Return:

```js
{
  entity: {},
  current_relationships: [],
  historical_relationships: [],
  timeline: [],
  linked_records: {
    tasks: [],
    communications: [],
    organisations: [],
    people: []
  }
}
```

Timeline items use:

```js
{
  id,
  kind: 'period' | 'point' | 'change',
  date,
  end_date,
  label,
  context_key,
  source_ref,
  href
}
```

The API, not the browser, assembles and authorises the overview.

## Professional Hub

Professional Hub is a new SPA mounted at `/professional/`. It is a workflow and viewing layer. It does not own the meaning of Person or Organisation.

Create:

```text
apps/professional/
  AGENTS.md
  README.md
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/app/main.ts
  src/api/client.ts
  src/api/config.ts
  src/auth/gate.ts
  src/domain/types.ts
  src/shell/shell.ts
  src/views/people.ts
  src/views/person-page.ts
  src/views/organisations.ts
  src/views/organisation-page.ts
  src/views/communications.ts
  src/views/communication-editor.ts
  src/components/entity-picker.ts
  src/components/relationship-timeline.ts
  src/styles/hub.css
  tests/unit/
```

Reuse Tasks or Teaching shell patterns. Follow `packages/design-kit/AGENTS.md`.

Required initial routes:

```text
#/people
#/person/<id>
#/organisations
#/organisation/<id>
#/communications
#/communication/<id>
```

Required navigation:

1. People.
2. Organisations.
3. Communications.
4. Relationships.

Do not add Meetings, Events, Applications or Career until their slices.

Update:

1. root `package.json` with `build:professional` and inclusion in `build:apps`;
2. `scripts/build-spa.mjs` allowed app list;
3. `scripts/prepare-web.mjs` SPA list;
4. `scripts/pages-spa-fallback.html` route recognition;
5. `packages/hub-switcher.js`;
6. `apps/life/js/shell/hub-sections.js`;
7. `apps/life/index.html` hub row;
8. relevant service worker asset and navigation rules;
9. `tests/unit/apps-spa-remount.test.js`;
10. hub switcher tests and static server tests.

Do not add a hub logo, new palette, rail width or custom sign in layout.

## Communications

Create store helper:

`netlify/functions/_shared/professional-blobs.mjs`

Store name:

`professional-hub-content`

Create schema:

`netlify/functions/_shared/communication-schema.mjs`

Record:

```js
{
  schema_version: 1,
  id: 'communication_<uuid>',
  direction: 'outbound' | 'inbound',
  channel: 'email' | 'phone' | 'message' | 'in_person' | 'video' | 'other',
  occurred_at: '<ISO timestamp>',
  subject: '',
  summary: '',
  status: 'completed' | 'received',
  created_at: '<ISO timestamp>',
  updated_at: '<ISO timestamp>'
}
```

Do not store recipient IDs inside the Communication. Recipient relationships are Universal Links.

Create:

`netlify/functions/communications.mjs`

Route:

`/api/communications`

Operations:

1. list;
2. get by ID;
3. create;
4. update summary and subject;
5. no ordinary hard delete in the first slice.

Communication creation accepts a `links` request field for orchestration, but the stored Communication record must exclude it. The handler creates the Communication, then calls the canonical Universal Link repository for every requested link.

If a link write fails after the Communication is stored:

1. return `503 communication_links_incomplete`;
2. return the Communication ID and failed operation IDs;
3. keep the Communication visible in an incomplete state projection;
4. offer retry;
5. never silently discard the Communication or claim complete success.

## Shared `@` picker

Create generic UI primitives in the design kit:

```text
packages/design-kit/entity-links.css
packages/design-kit/js/entity-picker.js
packages/design-kit/js/entity-chips.js
```

The design kit components accept callbacks. They do not know API URLs or domain schemas.

`createEntityPicker` interface:

```js
createEntityPicker({
  input,
  search,
  allowedKinds,
  onSelect,
  onCreate,
  emptyText
})
```

Required behaviour:

1. Typing `@` opens the picker.
2. Further text filters results.
3. Results are grouped by kind.
4. Each result shows display label, type and supporting context.
5. Arrow keys move through results.
6. Enter selects.
7. Escape closes without changing data.
8. Mouse and touch selection work.
9. Selected entities render as keyboard accessible chips.
10. Removing a chip removes the pending relationship before save.
11. Existing saved links require an explicit end or delete action rather than disappearing silently.
12. Empty results offer creation only for entity kinds permitted by the current workflow.
13. The picker never searches on every keystroke without a debounce and cancellation guard.
14. Use a 150 to 250 ms debounce.
15. Ignore stale search responses.
16. Never show StudentReference in the generic component's data source.

The visible text is presentation. The selected chip retains the canonical target ref. The Universal Link remains the stored relationship.

## Tasks integration

Relevant current files:

```text
apps/tasks/src/schemas/task.ts
apps/tasks/src/views/task-editor.ts
apps/tasks/src/views/page-editor.ts
apps/tasks/src/services/client-api.ts
netlify/functions/tasks.mjs
netlify/functions/_shared/tasks-blobs.mjs
tests/integration/tasks-list.test.js
```

Do not replace:

1. `parent_project_id`;
2. `parent_task_id`;
3. dependency fields;
4. Task contexts for place, device or other non entity action filtering.

Deprecate only free text `contexts[kind='person']` after migration tooling exists.

Add a Relationships section to the task editor. The first supported relationship is Task `collaborator` Person.

On task create or update:

1. save the Task through the existing Tasks API;
2. create pending Universal Links through the canonical link API;
3. render saved links from `GET /api/universal-links?entity_ref=tasks:task:<id>`;
4. show any incomplete link operation and Retry;
5. do not copy Person IDs into Task JSON;
6. do not write link IDs into Task JSON;
7. keep Task list and cache behaviour unchanged.

For the sentence `Email @Seth about the proposal`, the stored Task title stays readable plain text. The selected Person chip is a separate structured relationship editor value. The UI must render the chip adjacent to the title or relationship field. Do not add brittle string offsets to Task titles.

## Relationship timeline

Create server assembler:

`netlify/functions/_shared/entity-overview.mjs`

Create shared renderer:

`packages/design-kit/js/relationship-timeline.js`

Create style:

`packages/design-kit/relationship-timeline.css`

Timeline requirements:

1. Point events render as dots at `occurred_at`.
2. Period relationships render with start and end dates.
3. Current periods have no end date and show Current.
4. Concurrent periods appear as separate rows.
5. Filters include Professional, Tasks, Teaching, Knowledge, Life and Organisation.
6. Every rendered source has a safe link back when a resolver supplies `href`.
7. No source link is invented in the browser.
8. Ordering is descending by effective date by default.
9. Missing dates render in an Undated section.
10. The timeline is accessible without colour.
11. The phone view becomes a single vertical sequence.
12. Display dates use the shared `dd/mm/yy` formatter.

## Lifecycle services

Entity lifecycle and relationship lifecycle remain independent.

Create:

`netlify/functions/_shared/entity-lifecycle.mjs`

Entity transitions:

```text
active -> inactive
inactive -> active
active -> archived
inactive -> archived
archived -> active
active|inactive|archived -> retained
retained -> archived|deidentified|deleted
active|inactive|archived -> deidentified
deidentified -> deleted
```

Rules:

1. Retained requires `retention_reason` and `retention_review_at`.
2. Deleted removes identifying values and preserves only an integrity tombstone where required.
3. Lifecycle events are written to `entities/events/`.
4. Lifecycle transitions never alter historical Universal Link dates.
5. Archiving hides an entity from ordinary suggestions.
6. Deliberate archive search returns archived professional identities.
7. The self identity rejects protected transitions.

Relationship transitions:

```text
current -> ended
current|ended -> suppressed
suppressed -> current|ended
current|ended|suppressed -> deleted
```

Ending a period relationship sets `valid_to` and status `ended`. Changing a role ends the previous relationship and creates the next relationship through one journalled service operation.

## Knowledge migration

Existing source files:

```text
netlify/functions/_shared/hub-ref.mjs
netlify/functions/_shared/inverse-links.mjs
netlify/functions/_shared/knowledge-data.mjs
apps/knowledge/src/domain/hub-ref.ts
apps/knowledge/src/wiki/connectedHtml.ts
tests/unit/hub-ref.test.js
tests/integration/knowledge-pages.test.js
```

Do not migrate Knowledge links in the first implementation slice.

Migration sequence:

1. Add Knowledge Page resolver.
2. Add registered refs for Knowledge Page, Teaching Unit, Tasks Project and Life Decision.
3. Add relationship declaration `related_to` with an explicit symmetric display rule.
4. Write a dry run migration script which reads Knowledge manifests and page JSON.
5. Convert every valid `connected` value into one Universal Link.
6. Preserve provenance in link metadata as `migration_source: 'knowledge_connected_v1'`.
7. Report invalid and unresolved refs without dropping them.
8. Run migration in dual read mode.
9. Change Knowledge backlinks and connected rendering to read Universal Links.
10. Disable old `connected` writes.
11. Verify parity counts and sampled pages.
12. Remove scanning based inverse link behaviour only after parity passes.
13. Retain a rollback report and do not delete original values during the first migration release.

Do not maintain dual write. Dual read is temporary. Universal Links becomes the only write path once enabled.

## StudentReference privacy gate

Slice 8 starts only after Adam records College approval for the limited hosting use.

Before code accepts real StudentReference data, document:

1. operational purpose;
2. permitted fields;
3. hosting provider;
4. authorised users;
5. retention period;
6. deletion period;
7. incident responsibility;
8. official school system serving as source of truth.

Technical requirements:

1. StudentReference storage stays in Teaching's existing protected store.
2. No StudentReference appears in a canonical browser URL.
3. Generic entity search excludes the kind at the resolver level.
4. Teaching protected search uses a separate handler and server supplied Teaching workflow context.
5. Responses use `cache-control: no-store`.
6. Logs contain operation IDs and generic failure codes only.
7. AI retrieval adapters reject StudentReference by default.
8. Analytics receive no StudentReference ID, code, class, link or count.
9. Duplicate display codes receive neutral suffixes such as AR1 and AR2.
10. Codes must not contain a student number, date of birth, year group, class or school identifier.
11. Permission tracking stores status only.
12. No uploaded permission form enters this system.
13. Archive and deletion have integration tests.
14. Test fixtures use names such as `STUDENT_A1` and are marked synthetic.

## Implementation slices

### Slice 0. Repository reconciliation and test harness

Outcome: one evidence based repository map committed on a branch from current `origin/main`. This slice resolves repository facts before runtime design becomes code.

This slice is documentation only. Do not include any foundation code.

#### Required branch and source state

1. Fetch `origin/main` and PR 304.
2. Record the current `origin/main` SHA as `BASE_SHA`.
3. Record PR 304 planning SHA `7fd44087e5d88d8e7dff1e224b7d7c278712fcef` as `PLAN_SHA`.
4. Create `claude/universal-links-slice-0-repository-map` from `BASE_SHA`, not from PR 304.
5. Read both planning files with `git show origin/pr-304-plan:<path>`.
6. Do not copy either planning file into the Slice 0 branch.

#### Files to inspect

Read the complete contents of:

```text
CLAUDE.md
docs/consolidation/plan.md
package.json
netlify.toml
scripts/build-spa.mjs
scripts/prepare-web.mjs
packages/design-kit/AGENTS.md
packages/hub-switcher.js
packages/design-kit/js/hub-entity-search.js
apps/tasks/AGENTS.md
apps/tasks/package.json
apps/tasks/src/schemas/task.ts
apps/tasks/src/services/client-api.ts
apps/tasks/src/views/task-editor.ts
apps/tasks/src/app/main.ts
apps/knowledge/AGENTS.md
apps/knowledge/package.json
apps/knowledge/src/domain/hub-ref.ts
apps/knowledge/src/domain/page.ts
apps/knowledge/src/wiki/connectedHtml.ts
netlify/functions/_shared/operator-gate.mjs
netlify/functions/_shared/tasks-blobs.mjs
netlify/functions/_shared/teaching-blobs.mjs
netlify/functions/_shared/knowledge-data.mjs
netlify/functions/_shared/hub-ref.mjs
netlify/functions/_shared/inverse-links.mjs
netlify/functions/tasks.mjs
tests/integration/tasks-list.test.js
tests/integration/knowledge-pages.test.js
tests/unit/hub-ref.test.js
tests/unit/inverse-links.test.js
```

Also locate every nested `AGENTS.md` governing those paths and read it before writing.

#### Only file to create

Create:

`docs/universal-links/repository-map.md`

Use these exact headings:

```text
# Universal Links repository map
## Source revisions
## Build and deployment topology
## Authentication and origin boundary
## Runtime data ownership
## Current entity and relationship mechanisms
## Existing helpers to reuse
## Confirmed implementation paths for Slices 1 to 6
## Planning assertions which are false, stale or unverified
## Baseline verification
## Slice 1 exact file contract
```

#### Required evidence tables

The map must include:

1. A source revision table with `BASE_SHA`, `PLAN_SHA`, branch name and inspection date.
2. A build table covering each root script, each app build command, output directory and umbrella mount.
3. An API table covering handler factory, session cookie, origin validation helper, Function directory and route mapping source.
4. A data ownership table for Tasks, Teaching, Knowledge, Life, proposed shared identities and proposed Professional records. State storage technology and existing adapter path. Mark proposed stores as `not implemented`.
5. A relationship mechanism table covering Task contexts, Knowledge `connected`, `HubRef`, inverse links, Teaching student references and domain ownership fields. State whether each remains, migrates or is out of scope.
6. A file status table for every path named in this implementation programme. Use only `confirmed`, `moved`, `missing` or `contradicted`. Every non confirmed row needs evidence and a replacement action.
7. A Slice 1 file contract listing every file to create or edit and one sentence describing the required export or test responsibility.

#### Fixed reconciliation answers

1. Do not edit `docs/consolidation/plan.md`, `docs/consolidation/OVERSEER.md`, or any checkpoint.
2. Do not write a separate slice roadmap. This document already defines the roadmap.
3. Do not land the proposal document on `main`.
4. Do not add cross references from consolidation documents.
5. Do identify contradictions in the repository map.
6. Do not resolve contradictions with runtime code in this slice.
7. The expected Knowledge storage fact is a separate private GitHub repository accessed through `_shared/knowledge-data.mjs`, not a Netlify Blobs store. Verify and record this.
8. The expected Professional UI location is a future `apps/professional` SPA at `/professional/`, not `apps/tasks`. Verify the umbrella build changes required and record them.

#### Verification

Run from the repository root:

```bash
npm test
npm run build
git diff --check
```

Do not repair unrelated baseline failures. Record the exact command, exit code and failing test or build stage.

#### Slice 0 completion gate

Slice 0 is complete only when:

1. `git diff --name-only BASE_SHA...HEAD` contains only `docs/universal-links/repository-map.md`.
2. Every required heading and table exists.
3. Every planning path has a status.
4. The map gives Slice 1 an exact file list.
5. A draft PR is open against `main`.
6. The PR remains unmerged.

Stop after reporting the draft PR URL, base SHA, head SHA, changed file, command results and contradictions found.

### Slice 1. Shared contracts, registry and read only repository

Prerequisite: Slice 0 has been reviewed and merged. Begin from the resulting current `origin/main`.

Outcome: all shared contracts plus a read only repository backed by the proposed `universal-link-content` Netlify Blobs store. This slice includes contracts, pure indexed queries and read only store wiring. It excludes every write operation and every interface.

#### Files to create

```text
netlify/functions/_shared/entity-ref.mjs
netlify/functions/_shared/entity-access.mjs
netlify/functions/_shared/entity-resolvers.mjs
netlify/functions/_shared/relationship-registry.mjs
netlify/functions/_shared/universal-link-schema.mjs
netlify/functions/_shared/universal-link-blobs.mjs
netlify/functions/_shared/universal-link-read-repository.mjs
tests/unit/entity-ref.test.js
tests/unit/entity-access.test.js
tests/unit/entity-resolvers.test.js
tests/unit/relationship-registry.test.js
tests/unit/universal-link-schema.test.js
tests/unit/universal-link-blobs.test.js
tests/unit/universal-link-read-repository.test.js
```

Change a path only if the merged Slice 0 map proves the path conflicts with repository conventions. In that case, follow the mapped replacement and cite the map in the PR body.

#### Required exports

`entity-ref.mjs` exports `parseEntityRef`, `formatEntityRef`, `assertRegisteredEntityRef`, `hashEntityRef` and the registered namespace and kind table.

`entity-access.mjs` exports `createAccessContext`, `isVisibilityAllowed`, `strictestVisibility` and `assertEntityKindAllowed`. `createAccessContext` accepts server supplied actor and workflow values. No request body field sets access.

`relationship-registry.mjs` exports the frozen declarations, `getRelationshipDeclaration`, `validateRelationshipInput` and `projectRelationshipRegistry`. Add only the eight declarations listed earlier in this document.

`universal-link-schema.mjs` exports `parseUniversalLink`, `validateUniversalLinkRecord` and `equivalenceInput`. This slice validates existing records. It does not generate IDs or timestamps.

`universal-link-blobs.mjs` exports the store name, key builders, membership parser and `defaultGetUniversalLinkStore`. Reuse `listBlobKeys` and the same `getJSON` conventions as `_shared/tasks-blobs.mjs`. Do not add `set`, `setJSON`, `delete` or index rebuild exports.

`entity-resolvers.mjs` defines a resolver registry interface and injectable resolvers. In Slice 1, implement Task resolution only against the existing Tasks adapter. Define Person, Organisation and Communication resolver slots, but return a named unavailable result because those entity stores do not exist yet. Do not create empty identity stores.

`universal-link-read-repository.mjs` exports `createUniversalLinkReadRepository({ store, resolveEntity })` with these methods only:

```text
getLink(id, accessContext)
listOutgoing(sourceRef, accessContext)
listIncoming(targetRef, accessContext)
listForEntity(ref, accessContext)
```

#### Read algorithm

For each list call:

1. Parse and validate the requested EntityRef.
2. Hash the canonical ref with SHA 256.
3. List only the relevant membership prefix.
4. Parse every membership record and reject hash collisions by comparing its stored canonical ref.
5. Load the authoritative link for each surviving membership.
6. Validate each link against the schema and registry.
7. Resolve both endpoints.
8. Apply link visibility and both endpoint visibility before adding a result.
9. Return no label, count contribution or error detail for an inaccessible endpoint.
10. Sort by `updated_at` descending, then `id` ascending for deterministic ties.
11. Bound hydration to batches of ten.
12. Return an empty array for a valid ref with no memberships.

Do not scan `universal-links/links/` during an ordinary read.

#### Test fixtures

Use in memory fake stores. Include:

1. one visible Task to Person link;
2. one hidden endpoint;
3. one missing authoritative link referenced by membership;
4. one membership hash collision with a mismatched canonical ref;
5. one malformed link record;
6. one duplicate membership seen from both directions;
7. eleven visible links to prove bounded hydration continues beyond one batch.

Tests must prove:

1. EntityRef round trips and rejects unknown pairs and unsafe IDs.
2. Every registry source, target, role and temporal rule rejects invalid input.
3. Store key builders produce the exact key layout in this document.
4. Read methods use membership prefixes and never list the authoritative link root.
5. `listForEntity` deduplicates the same link.
6. Hidden and missing endpoints are indistinguishable in returned data.
7. Hidden records do not affect returned counts.
8. No read method writes to the fake store.

#### Explicit exclusions

Do not create:

1. `netlify/functions/universal-links.mjs`;
2. any POST, PATCH or DELETE handler;
3. deterministic link ID generation;
4. operation journals;
5. index writes or rebuilds;
6. Person or Organisation records;
7. `apps/professional`;
8. picker or timeline components;
9. Task editor changes;
10. Knowledge migration code;
11. StudentReference code.

#### Verification and completion gate

Run root `npm test`, root `npm run build`, every new unit test file directly with `node --test`, and `git diff --check`.

Open a draft PR against `main`. The PR must show all three Slice 1 foundation elements, no HTTP routes, no UI and no writes. Stop and do not merge.

### Slice 2. Canonical link writes and recovery

Outcome: deterministic link creation, operation journal, membership writes, retries, repair and dry run index rebuild.

Add `/api/universal-links`, `/api/universal-links/admin` and `/api/relationship-registry`.

Tests must inject failure after every write step and prove retry repairs one link without duplication.

Stop after PR creation.

### Slice 3. Person, Organisation and role history

Outcome: identity APIs, self protection, entity search, entity overview, current and historical role periods.

Seed tests with synthetic Person `Seth Example` and Organisation `Example University`. Do not commit real contacts.

Acceptance path:

1. create Person;
2. create Organisation;
3. create two concurrent dated relationships;
4. end one relationship;
5. overview shows both periods and the ended history;
6. archive Person;
7. ordinary search hides Person;
8. archive search finds Person;
9. self identity refuses archive.

Stop after PR creation.

### Slice 4. Professional Hub shell and relationship pages

Outcome: new `/professional/` SPA, shared hub navigation, People, Organisations, Person page, Organisation page and timeline rendering.

No Communications yet.

Test desktop and 390 px layouts. Use existing design kit only.

Stop after PR creation.

### Slice 5. Communications and shared `@` picker

Outcome: Communication storage and API, shared picker primitives, Professional Communication editor and Person activity timeline.

Acceptance path:

1. compose outbound email;
2. type `@Set`;
3. choose synthetic Person;
4. save Communication;
5. Communication has no copied recipient field;
6. Universal Link has relationship `recipient` and point time;
7. Person overview shows the Communication dot;
8. hidden or archived Person does not appear in ordinary picker results.

Stop after PR creation.

### Slice 6. Tasks integration and complete first vertical slice

Outcome: Relationships section in Task editor, Person picker, Task to Person links, Communication to Task link and follow up Task action.

Complete vertical acceptance path:

1. create synthetic Seth Person;
2. link Seth to synthetic Organisation;
3. add two concurrent dated roles;
4. render the roles on Seth's timeline;
5. create Task `Email Seth about the proposal`;
6. select Seth through the `@` picker with relationship `contact`. Use `collaborator` only when the selected Person helps perform the Task;
7. log the completed Communication;
8. link Communication to Task and Seth;
9. create a follow up Task linked to Seth and Communication;
10. open Seth and see Organisation, roles, Tasks, Communication and timeline;
11. end one relationship without deleting history;
12. archive Seth and verify normal suggestions hide the record while deliberate archive search finds it.

Do not invent a relationship key during implementation. `contact` is the fixed relationship for a Task whose action is directed to a Person.

Stop after PR creation.

### Slice 7. Knowledge Universal Link migration

Outcome: adapters, dry run migration, dual read, parity report, Universal Link write cutover and retirement plan for scan based inverse links.

Do not delete old fields in this slice.

Stop after PR creation.

### Slice 8. StudentReference protected implementation

Blocked until the approval gate is recorded.

Outcome: narrow Teaching workflows for class, program, excursion, coaching and permission status only.

Stop after PR creation.

### Slice 9. Meetings and Events

Outcome: Professional Meeting records with scheduled, completed, cancelled, rescheduled and no show states. Add Event foundation with `professional_development` subtype. Preparation and follow up remain Tasks.

Scheduling publishes projections to the existing shell calendar. Do not transfer ownership to Tasks.

Stop after PR creation.

### Slice 10. Applications and career view

Outcome: Job Application entity with organisation, position, advertisement, closing date, pipeline status, documents, selection criteria, contacts, referees, interview rounds, outcome and reflection.

Tasks represent application actions. Applications do not become large Tasks.

Stop after PR creation.

### Slice 11. Remaining registered entity adapters

Add adapters only for active product workflows. Candidate types include Program, Excursion, Lesson, Class, Note, Publication and Life records.

Each adapter requires existence resolution, safe label projection, canonical href, lifecycle treatment, search scope, privacy tests and relationship declarations.

## Test matrix

### Unit tests

1. EntityRef parsing and formatting.
2. Unknown kinds rejected.
3. Registry source and target validation.
4. Inverse labels.
5. Temporal validation.
6. Role validation.
7. Deterministic equivalence hashing.
8. Duplicate create behaviour.
9. Visibility intersection.
10. Endpoint non disclosure.
11. Index membership key generation.
12. Operation repair.
13. Lifecycle transitions.
14. Self identity protections.
15. Timeline ordering and grouping.
16. Archive search filtering.

### Integration tests

1. Every API rejects unauthenticated requests with `401`.
2. Every API rejects disallowed origins.
3. Missing shared store returns a named `503`, not a generic `500`.
4. Shared link handlers do not load Teaching storage unless a Teaching scoped resolver requires it.
5. Task records remain in Tasks storage.
6. Knowledge records remain in Knowledge storage.
7. Communication records remain in Professional storage.
8. Universal Links remain in shared link storage.
9. Link create failure is fail visible and retryable.
10. Backlinks return the same authoritative link.
11. Archived identities disappear from ordinary suggestions.
12. Protected endpoints do not affect counts.
13. Rebuild repairs missing memberships.
14. Rebuild does not delete invalid records.
15. Communication creation with failed links reports incomplete state.

### UI tests

1. `@` opens the picker.
2. Keyboard navigation and selection work.
3. Escape closes without mutation.
4. Stale search results are ignored.
5. Chips expose remove labels.
6. Saved relationship removal requires an explicit lifecycle action.
7. Person page shows concurrent roles.
8. Organisation page groups several contexts.
9. Timeline is usable at 390 px.
10. Hub switcher includes Professional in every hub.
11. Sign in uses the existing shared gate.
12. No protected record appears in general search.

### Security tests

1. Client supplied workflow is ignored.
2. Client supplied visibility cannot weaken derived visibility.
3. Unknown metadata keys are rejected.
4. Ref injection and path traversal are rejected.
5. Deleted entity labels are absent from responses.
6. Hidden endpoints return the same outward response as missing endpoints.
7. StudentReference is absent from generic search and resolver registries.
8. Logs produced by injected failures contain no endpoint label.

## Observability

Use structured server logs with:

```js
{
  event,
  operation_id,
  link_id,
  relationship_type,
  outcome,
  duration_ms
}
```

Do not log request bodies, display names, aliases, summaries, student codes, source titles or target titles.

Expose administrative counts, not sensitive labels.

## Performance boundaries

1. Entity search returns at most 20 results.
2. Timeline endpoints support a default limit and cursor before production data grows.
3. Normal backlinks read endpoint membership prefixes. They never scan every link.
4. Full link scans are permitted only for authenticated administrative rebuild and migration operations.
5. Resolver hydration must be bounded and avoid unbounded `Promise.all` calls.
6. Use small concurrency batches for overview hydration.
7. The initial target is correctness for one operator, not speculative enterprise scale.

## Pull request reporting template

Every Claude Code implementation PR body must contain:

```text
Slice:
Base SHA:
Head SHA:

Outcome delivered:

Files changed and why:

Storage keys added or changed:

API routes added or changed:

Authentication and privacy impact:

Migration impact:

Automated checks run:

Manual checks run:

Known limitations:

Explicitly out of scope:

Rollback path:
```

## First Claude Code prompt

Copy only this section to Claude Code for the next action.

```text
Work in adamrussell91-hash/life-hub. Execute Slice 0 only. Slice 0 is repository verification and one documentation file. It contains no foundation code, schemas, storage adapters, query functions, API handlers or UI.

Fixed decisions. Do not ask Adam to choose among them:
1. Slice 0 is documentation only.
2. Slice 1 later includes contracts, indexed read functions and read only Netlify Blobs wiring together.
3. The future Person interface lives in new apps/professional at /professional/. It does not live in apps/tasks.
4. PR 304 has exactly two planning sources: docs/proposals/comms-hub-people-unification.md and docs/universal-links/implementation-programme.md.
5. There is no third supplied programme to request.
6. Do not merge anything.

Retrieve the pinned planning source:
git fetch origin main
git fetch origin pull/304/head:refs/remotes/origin/pr-304-plan
git rev-parse origin/main
git rev-parse origin/pr-304-plan

The expected planning SHA is 7fd44087e5d88d8e7dff1e224b7d7c278712fcef. Stop only if the fetched PR ref does not contain this commit. Read the planning files with git show. Do not expect them on main and do not copy them into the Slice 0 branch.

Create claude/universal-links-slice-0-repository-map from the fetched origin/main SHA.

Read the complete Slice 0 section of docs/universal-links/implementation-programme.md from origin/pr-304-plan. Follow its exact file inspection list, evidence tables, fixed reconciliation answers, verification commands and completion gate.

Repository reconciliation has one meaning here. For every asserted path and platform fact, record confirmed, moved, missing or contradicted. For every non confirmed item, name the evidence, correct location and required action. Do not rewrite consolidation documents and do not implement corrections.

Create one file only:
docs/universal-links/repository-map.md

The file must use the exact headings and tables required by Slice 0. Its Slice 1 file contract must list each proposed file and its export or test responsibility. Mark proposed stores and apps as not implemented.

Important expected correction to verify: Knowledge production data uses a separate private GitHub repository through netlify/functions/_shared/knowledge-data.mjs. Do not describe it as a Netlify Blobs knowledge-hub-data store.

Run from the root:
npm test
npm run build
git diff --check

Do not fix unrelated failures. Record exact commands, exit codes and failures.

Before committing, verify git diff --name-only contains only docs/universal-links/repository-map.md. Commit, push and open a draft PR against main. Do not merge. Report the PR URL, base SHA, head SHA, changed file, test and build results, plus every contradiction found. Do not start Slice 1.
```

## Completion definition

The programme is complete only when:

1. all active links use the canonical repository;
2. no ordinary request scans all entities for backlinks;
3. Person and Organisation pages assemble rather than copy history;
4. concurrent roles and dated changes render correctly;
5. Tasks and Communications share the same picker primitive;
6. Knowledge old writes are retired after migration parity;
7. lifecycle states behave independently;
8. index repair is tested;
9. hidden entities do not leak;
10. StudentReference remains blocked until approval, then remains Teaching scoped;
11. all affected tests and builds pass;
12. Codex has independently reviewed each slice;
13. Adam has explicitly approved every merge.
