# Milestones 5 and 6 Claude Code build programme

## Outcome

Complete the original first vertical slice in one Claude Code session.

The session has two jobs:

1. correct the three review findings on PR 315 in place;
2. build Communications, the shared entity picker, Tasks relationships and the complete Seth workflow on one stacked branch.

Do not pause between jobs. Do not ask Adam to repeat decisions resolved in this document or its named sources. Stop only after PR 315 is corrected and one new stacked draft pull request contains the complete Milestones 5 and 6 implementation, tests and acceptance evidence.

## Repository state

Repository: `adamrussell91-hash/life-hub`

PR 313 branch: `claude/slice-2-3-corrections-iwefiu`

PR 315 branch: `claude/universal-links-slice-4-professional-shell`

Reviewed PR 315 head before this programme: `f02e32bac4427834933f01a59ffb34700183a7fb`

PR 315 is stacked on PR 313. Preserve this stack. Do not merge either pull request.

Authoritative sources, in precedence order:

1. this programme for execution, boundaries and resolved decisions;
2. `docs/universal-links/implementation-programme.md` for the Universal Links architecture;
3. `docs/proposals/comms-hub-people-unification.md` for product and domain ownership;
4. `docs/universal-links/repository-map.md` for existing integration points;
5. current tested code on the PR 315 head for established contracts.

When an older comment conflicts with current tested code or this programme, preserve current tested code and record the discrepancy in the new PR body. Do not silently redesign a shipped contract.

## Branch and pull request sequence

### Job A. Correct PR 315 in place

1. Fetch the remote state.
2. Check out `claude/universal-links-slice-4-professional-shell`.
3. Confirm the branch contains `f02e32b` or a later commit.
4. Implement every Job A correction below.
5. Run the Job A checks.
6. Commit and push directly to the same branch.
7. Keep PR 315 in draft and stacked on `claude/slice-2-3-corrections-iwefiu`.
8. Do not merge.

### Job B. Build Milestones 5 and 6 without pausing

After Job A is pushed:

1. Create `claude/universal-links-milestones-5-6-first-workflow` from the corrected PR 315 head.
2. Build all of Job B below.
3. Push the branch.
4. Open one draft pull request with base `claude/universal-links-slice-4-professional-shell`.
5. Put this at the top of its body: `STACKED ON PR 315, WHICH IS STACKED ON PR 313. DO NOT MERGE OUT OF ORDER.`
6. Include the exact base SHA and head SHA in the body.
7. Include tests and the manual acceptance record in the body.
8. Do not merge any pull request.

Do not split Milestone 5 and Milestone 6 into separate branches or pull requests. The point of this run is to deliver the complete usable workflow rather than another infrastructure fragment.

## Job A. PR 315 corrections

### A1. Prevent stale detail responses from repainting a newer route

`apps/professional/src/app/main.ts` starts asynchronous Person and Organisation renders without a navigation generation guard. A slow response for route A can overwrite route B after the user navigates.

Add one route render generation or equivalent cancellation mechanism. Every asynchronous detail render and `onTitleReady` callback must prove it still belongs to the current route generation before changing the canvas or header. Cover rapid Person to Person, Person to Organisation and detail to landing navigation.

Do not solve this with global sleeps or by disabling navigation.

### A2. Make mixed Person and Organisation search one bounded request

`apps/professional/src/components/entity-search.ts` currently sends separate Person and Organisation requests for `person,organisation`. This doubles store scanning and permits up to 40 displayed results despite the API's global 20 result limit.

Send one request with `kinds=person,organisation`. Preserve grouped response handling and render no more than the server response contains. Keep debounce, abort and stale response protection. Add a test proving mixed search issues one HTTP request and honours the combined result cap.

### A3. Keep Professional domain CSS within the design kit contract

Remove Professional specific raw colour declarations where an existing design token or locked design kit class supplies the same role. Remove redundant `.hub-rail` mobile hiding already owned by `packages/design-kit/rail.css`. Retain only layout rules genuinely local to the Professional canvas. Do not change the locked rail width, markers, mobile breakpoint, sign in chrome or global design kit palette.

### Job A verification

Run:

```text
cd apps/professional && npm test
cd apps/professional && npm run typecheck
cd apps/professional && npm run build
cd ../.. && node --test tests/unit/apps-spa-remount.test.js tests/unit/hub-sections.test.js tests/integration/static-server.test.js
```

Add focused tests for all three corrections. Do not weaken an existing assertion to make the correction pass.

## Job B. Scope and ownership

Build all of the following:

1. Professional Communication persistence and schema;
2. authenticated Communication list, get, create and update API;
3. durable reporting and retry for incomplete relationship writes;
4. real Communication resolver support;
5. shared design kit entity picker and entity chips;
6. Professional Communications list, compose and detail screens;
7. Communication entries in Person and Organisation overviews;
8. Tasks editor Relationships section using the same picker primitive;
9. Task to Person `contact` and `collaborator` links;
10. Communication to Task `follows_from` links;
11. follow up Task creation with Task to Communication `follow_up` and Task to Person `contact` links;
12. local mock APIs and fixtures for the complete workflow;
13. automated and manual proof of the complete Seth acceptance path.

Domain ownership remains fixed:

1. Task records stay in `tasks-hub-content` and continue through the existing Tasks API.
2. Person, Organisation and Universal Link records stay in `universal-link-content`.
3. Communication records live in `professional-hub-content`.
4. Relationships exist only as Universal Links. Do not copy target IDs or link IDs into Task or Communication records.
5. A planned contact remains a Task. A completed or received contact is a Communication.

Do not add Meetings, Events, Applications, Career, Knowledge migration, StudentReference or task context migration in this run.

## Mandatory source reading

Before implementation, read:

1. root `CLAUDE.md`;
2. `packages/design-kit/AGENTS.md`;
3. `packages/design-kit/MOBILE.md`;
4. `packages/design-kit/RAIL.md`;
5. `docs/universal-links/implementation-programme.md`, especially Communications, shared picker, Tasks integration and Slices 5 and 6;
6. `docs/proposals/comms-hub-people-unification.md`, especially domain boundaries and the Seth workflow;
7. current relationship registry, entity refs, entity resolvers, Universal Link repository and handlers;
8. current identity schema, repository, search and overview code;
9. current Tasks schema, editor, page editor, client API, cache and server handler;
10. current Professional routes, API client, views, local mock and tests.

Reuse existing auth, HTTP envelope, validation, operation journal, resolver and Blob adapter patterns. Do not create parallel versions.

## Communication storage contract

Create:

```text
netlify/functions/_shared/professional-blobs.mjs
netlify/functions/_shared/communication-schema.mjs
netlify/functions/communications.mjs
```

Store name: `professional-hub-content`

Authoritative stored Communication:

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

Rules:

1. Generate Communication IDs on the server with a path safe validated shape.
2. Validate every caller input and every loaded stored record.
3. Trim subject and summary consistently. Define bounded lengths and test their boundaries.
4. Require a valid `occurred_at` timestamp.
5. Direction and status must agree: outbound uses completed, inbound uses received.
6. Reject unknown stored or request fields unless current repository conventions require explicit forward compatibility.
7. Store no `links`, recipient IDs, Task IDs, Person IDs, Organisation IDs, display labels or Universal Link IDs in the Communication record.
8. Maintain a deterministic index for list operations using the established Blob helper pattern. Deduplicate index and listed records.
9. Sort list results by `occurred_at` descending, then ID for a stable tie break.
10. Never expose an unrestricted hard delete route in this milestone.

The Blob helper must validate an ID before using it in a key. Add tests proving unsafe IDs never reach a store lookup.

## Communication API contract

Route: `/api/communications`

Use the existing operator gate, CORS policy and `{ ok, data | error }` response envelope.

Supported operations:

```text
GET /api/communications
GET /api/communications?id=<communication_id>
POST /api/communications
PATCH /api/communications?id=<communication_id>
POST /api/communications?id=<communication_id>&action=retry-links
```

List and get return safe Communication projections. PATCH updates only `subject` and `summary`; immutable event facts remain immutable.

Create input contains Communication fields plus an orchestration only `links` array. Each requested link uses the canonical Universal Link create input and must have the new Communication as its source. Permit these initial relationships:

1. `recipient`: Communication to Person, with `occurred_at` matching the Communication;
2. `about_person`: Communication to Person, with `occurred_at` matching the Communication;
3. `follows_from`: Communication to Task, timeless.

Validate the complete request before writing the Communication. Resolve every target through existing server side access rules. Do not trust client supplied actor, workflow, visibility or source refs.

### Partial link failure and retry

A stored Communication must not disappear when one later Universal Link write fails.

Create a durable, path safe orchestration journal in `professional-hub-content` before the first relationship write. It records the Communication ID, the canonical validated link intents, completed link IDs or deterministic equivalence identifiers, bounded failure codes, status and timestamps. It must not copy display labels or free form error messages.

Required behaviour:

1. write and validate the Communication;
2. attempt each link through `createUniversalLinkRepository`, not through an internal HTTP round trip;
3. record each completed intent idempotently;
4. on complete success, return 201 with the Communication and links;
5. on any incomplete relationship write, return 503 `communication_links_incomplete` with the Communication ID, orchestration operation ID, completed link IDs, failed intent identifiers and `retryable: true`;
6. keep the Communication visible with an `incomplete_links` projection derived from its journal;
7. `retry-links` resumes only missing work and is idempotent;
8. repeated create or retry after an ambiguous response must not duplicate the Communication or equivalent Universal Links;
9. never report complete success while a requested link remains incomplete.

Do not put orchestration state inside the authoritative Communication record.

## Communication entity resolution and overview

Implement the existing `professional:communication` resolver slot in `netlify/functions/_shared/entity-resolvers.mjs` against `professional-hub-content`.

Return only the standard resolver projection. Use subject when present, otherwise a safe channel and date label. Supply the canonical Professional Communication hash route. Missing or malformed records behave as absent. Resolver output must never expose the summary.

Extract or create the shared overview assembler named in the repository map at `netlify/functions/_shared/entity-overview.mjs`. Keep the current `/api/entities/overview` response compatible while adding resolved Communication and Task activity. Avoid duplicating authorisation and timeline ordering between the handler and assembler.

Person and Organisation overviews must include linked Communications and Tasks in `linked_records` and timeline entries. Point Communications use the Universal Link occurrence date. Do not infer a browser link when a resolver did not provide one.

## Shared entity picker and chips

Create:

```text
packages/design-kit/entity-links.css
packages/design-kit/js/entity-picker.js
packages/design-kit/js/entity-chips.js
```

The design kit owns interaction and rendering only. It receives callbacks and has no API URL, authentication code, domain schema or relationship key built into it.

Use this public interface unless a small typed extension is required for accessibility:

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

1. `@` opens the picker and text after it filters results.
2. Search is debounced between 150 and 250 ms.
3. Each new search aborts the old request and stale results never repaint.
4. Results are grouped by kind and show display label, type and supporting context.
5. Arrow Down and Arrow Up move the active option.
6. Enter selects the active option.
7. Escape closes without changing selected relationships.
8. Mouse and touch selection work.
9. Focus and active option state use correct combobox and listbox ARIA.
10. Selected entities render as keyboard accessible chips retaining canonical refs.
11. Removing a pending chip removes only the pending relationship.
12. Existing saved links expose explicit End or Remove actions according to the relationship declaration. They never silently vanish.
13. Empty results offer creation only when the host explicitly provides `onCreate` and permits the kind.
14. Duplicate selection is prevented by canonical ref plus relationship type.
15. Archived, deleted, deidentified and StudentReference records never appear in ordinary results.

Use existing design tokens, buttons, focus treatment and display date formatting. Add unit tests at the design kit level so both Professional and Tasks consume the same tested primitive.

## Professional Communications UI

Replace the Slice 4 empty state with working routes:

```text
#/communications
#/communication/new
#/communication/<communication_id>
```

The Communications landing page lists recent Communications and has one Compose action. Provide honest loading, empty, error and incomplete link states.

The composer supports:

1. direction;
2. channel;
3. occurred date and time;
4. subject;
5. summary;
6. recipient Person selection through the shared picker;
7. optional about Person selections;
8. optional originating Task selection;
9. save;
10. retry after incomplete link writes.

Typing `@Set` in the recipient interaction must find the synthetic Seth fixture. Store the readable summary as plain text and the selection as pending relationship data. Do not store string offsets or mention markup in the Communication.

The detail page shows Communication facts plus resolved relationship chips. It provides Edit for subject and summary, Retry when incomplete, and Create follow up Task.

Create follow up Task must:

1. open or submit through the existing Tasks API contract;
2. create the Task first;
3. create `follow_up` from Task to Communication;
4. create `contact` from Task to every selected recipient Person;
5. report and retain incomplete link work for retry;
6. leave Task JSON free of Communication and Person IDs.

Use the same orchestration helper or an explicitly shared browser workflow state for Task plus links. Do not claim atomicity across separate stores.

## Tasks integration

Add a Relationships section to the full Task editor. Do not add it only to quick add.

The section must:

1. load current links with `GET /api/universal-links?entity_ref=tasks:task:<id>`;
2. allow Person selection through the shared picker;
3. make the user choose `contact` or `collaborator` with clear copy;
4. default to `contact` for an action directed at a Person;
5. reserve `collaborator` for a Person helping perform the Task;
6. render pending and saved links distinctly;
7. save the Task through the unchanged Tasks API first;
8. create pending Universal Links through the canonical link API after the Task has an ID;
9. show incomplete link operations and Retry;
10. allow explicit removal of a pending selection;
11. use an explicit lifecycle action for an already saved link;
12. preserve existing Task cache, list, parent project, parent task, dependency, recurrence, reminder and non Person context behaviour.

Do not add Person IDs, Communication IDs, Universal Link IDs or a generic `relationships` array to `TaskSchema` or Task JSON. Do not remove free text `contexts[kind='person']` in this milestone because migration tooling does not exist yet.

The Task title `Email Seth about the proposal` remains plain readable text. Its Seth chip is separate structured relationship state.

## Local development and fixtures

Extend the Professional mock API and shared fixture data to exercise the real response shapes for Communications, retry, Universal Links, Tasks and overview assembly. Do not create a simplified mock contract which the production client would reject.

Provide deterministic synthetic data for:

1. Seth Person;
2. one Organisation;
3. two concurrent roles, one later ended;
4. one Task titled `Email Seth about the proposal`;
5. one outbound email Communication;
6. a follow up Task;
7. complete relationships among those records.

No fixture may contain a real student or private personal record.

## Required tests

Add unit and integration coverage for at least:

1. Communication schema valid and invalid boundaries;
2. path safe Communication and operation IDs;
3. Blob list, get, index deduplication and stable ordering;
4. auth, CORS, method and malformed JSON handling;
5. create and restricted update;
6. stored Communication excludes orchestration `links` and all target IDs;
7. recipient, about Person and follows from links use registry valid shapes;
8. preflight validation performs no writes on an invalid request;
9. every link write failure boundary returns `communication_links_incomplete`;
10. incomplete state survives a new handler instance;
11. retry resumes missing link operations without duplicates;
12. Communication resolver safe projection and missing record behaviour;
13. Person overview contains a Communication point entry and a linked Task;
14. picker debounce, cancellation and stale response protection;
15. picker keyboard, pointer, touch and Escape behaviour;
16. picker ARIA state and chip keyboard removal;
17. archived Person hidden from ordinary picker search;
18. Professional list, compose, detail and retry states;
19. Task editor loads saved links and preserves existing Task fields;
20. new Task saves before link creation;
21. Task JSON contains no relationship IDs;
22. Task `contact` and `collaborator` selection semantics;
23. follow up Task links to Communication and Person;
24. failure after Task save is visible and retryable;
25. rapid Professional detail navigation never paints stale content;
26. desktop and 390 px layouts remain within the locked chrome contract;
27. existing identity, Universal Link, Task and static server suites remain green.

Use deterministic injected clocks, ID generators and in memory stores. Do not use timing sleeps where dependency control provides a deterministic test.

## Complete acceptance path

Prove this path against local development data and record each result in the new PR body:

1. sign into Professional Hub;
2. find synthetic Seth;
3. see Seth linked to the synthetic Organisation;
4. see two concurrent dated roles;
5. create Task `Email Seth about the proposal`;
6. select Seth through the shared picker and save relationship `contact`;
7. compose an outbound email Communication;
8. type `@Set` and choose Seth as recipient;
9. link the Communication to the Task with `follows_from`;
10. save the Communication;
11. inspect stored Communication and confirm it has no recipient, Task or Universal Link ID fields;
12. create a follow up Task from the Communication;
13. inspect stored Task and confirm it has no Person, Communication or Universal Link ID fields;
14. open Seth and see Organisation, both roles, original Task, Communication and follow up Task on the overview and timeline;
15. end one role and confirm history remains;
16. archive Seth and confirm ordinary picker suggestions hide Seth;
17. use deliberate archive search and confirm Seth remains discoverable there;
18. simulate one Communication link failure, see the incomplete state, retry, and confirm exactly one equivalent link exists;
19. test Professional and Tasks at 390 px with keyboard navigation through the picker.

## Verification commands

Run focused suites while developing, then finish with:

```text
npm test
npm run build
cd apps/professional && npm test && npm run typecheck && npm run build
cd ../tasks && npm test && npm run typecheck && npm run build
```

If a named package lacks one command, use its existing equivalent and document the exact command. Do not invent a no op script to satisfy this list.

Review all changed files for secrets, real personal data, copied relationship identifiers, unsafe Blob keys, unbounded scans, stale async UI writes and design kit divergence.

## Stop condition

Stop only when:

1. Job A is pushed to PR 315;
2. one stacked draft PR contains all of Job B;
3. the full automated verification passes, or a genuine unrelated pre existing failure is named with evidence;
4. the complete acceptance path is recorded;
5. both pull requests remain unmerged.

Do not begin Slice 7 or any later domain.
