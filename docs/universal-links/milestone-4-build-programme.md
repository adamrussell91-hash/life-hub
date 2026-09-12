# Milestone 4 Claude Code build programme

## Outcome

Complete both jobs in one Claude Code session:

1. repair the remaining confirmed self-pointer defect on PR 313;
2. build the complete Slice 4 Professional Hub shell and relationship pages on a stacked branch.

Do not stop between the two jobs. Do not ask Adam to restate decisions already resolved here. Stop only after both draft pull requests are updated, verified and ready for one combined review.

## Repository and source state

Repository: `adamrussell91-hash/life-hub`

PR 313 branch: `claude/slice-2-3-corrections-iwefiu`

Reviewed PR 313 head before this programme: `def0dc5c162e4023d3059aeeb217c0e9fc2a15fd`

Planning sources:

1. `docs/proposals/comms-hub-people-unification.md`
2. `docs/universal-links/implementation-programme.md`
3. `docs/universal-links/repository-map.md`
4. this programme

This programme resolves the execution order and Slice 4 decisions. Do not turn those decisions into questions.

## Branch and pull request sequence

### Job A. Correct PR 313 in place

1. Fetch the remote state.
2. Check out `claude/slice-2-3-corrections-iwefiu`.
3. Confirm its head contains `def0dc5` or a later commit on the same branch.
4. Implement Job A below.
5. Commit and push directly to the same branch.
6. Update PR 313's body with the new correction, tests, exact head SHA and unchanged draft status.
7. Do not merge PR 313.

### Job B. Build Slice 4 without pausing

After Job A is pushed:

1. Create `claude/universal-links-slice-4-professional-shell` from the corrected PR 313 head.
2. Build all of Job B below.
3. Push the branch.
4. Open one draft stacked pull request whose base is `claude/slice-2-3-corrections-iwefiu`.
5. State prominently in its body: `STACKED ON PR 313. DO NOT MERGE BEFORE PR 313.`
6. Do not target `main` while PR 313 remains unmerged.
7. Do not merge either pull request.

This stacked branch is explicitly authorised for this milestone. Once PR 313 is reviewed and merged, its base may be changed to `main` during a later review action.

## Job A. Repair malformed self-pointer reconciliation

### Confirmed defect

`inspectSelfPointer()` parses stored pointer fields, then passes `pointer.person_id` to `personKey()` and `pointer.operation_id` to `identityOperationKey()` before proving either identifier is safe.

Two deterministic reproductions against `def0dc5` are:

```js
{
  schema_version: 2,
  person_id: '../../escape',
  operation_id: 'op_11111111111111111111111111111111'
}
```

This throws `400 invalid_person_id`.

```js
{
  schema_version: 2,
  person_id: 'person_00000000-0000-4000-8000-000000000000',
  operation_id: '../../escape'
}
```

This throws `400 invalid_operation_id`.

The administration reconciliation route therefore cannot repair the pointer. Ordinary self creation remains blocked, leaving no supported recovery path.

### Required correction

Work primarily in:

1. `netlify/functions/_shared/identity-repository.mjs`
2. `tests/unit/identity-repository.test.js`
3. `tests/integration/entities-admin.test.js`

Use existing validators from `identity-schema.mjs` and `universal-link-schema.mjs`. Do not duplicate their regular expressions.

Create one internal pointer parser or classifier with these outcomes:

1. `empty`: a missing pointer, or the canonical empty pointer with supported schema version and both identifiers `null`;
2. `candidate`: a supported nonempty pointer with valid `person_id` and either a valid `operation_id` or `null` for a legacy stale pointer;
3. `malformed`: every other stored value, including arrays, primitives, unsupported schema versions, unsafe identifiers, partial empty shapes and extra incompatible field types.

Never construct a Person key or operation key from a malformed pointer.

`inspectSelfPointer()` must classify every malformed nonempty stored pointer as `stale`. It must not throw an identifier validation error sourced from stored pointer content.

Ordinary create and activation requests remain conservative. Any nonempty stale pointer blocks a different ordinary operation until explicit administration reconciliation resolves it.

A journal qualifies as a genuine pending self reservation only when all conditions below hold:

1. the journal passes the existing identity operation schema validation;
2. its `operation_id` equals the pointer operation ID;
3. its `entity_id` equals the pointer Person ID;
4. its `kind` is `person`;
5. its status is `prepared` or `repair_needed`;
6. its operation type is `create_identity` or `lifecycle_identity`;
7. `payload.self_pointer_action` is `claim`;
8. `payload.entity.id` equals the pointer Person ID;
9. the intended entity is a Person with `is_self: true` and `lifecycle_status: 'active'`.

Missing, malformed, unsupported, mismatched, committed or nonclaiming journals are stale.

Preserve reconciliation rules:

1. zero authoritative active-self Persons plus stale pointer: write the canonical empty pointer;
2. one authoritative active-self Person plus absent or stale pointer: point to the authoritative Person and repair its derived index when needed;
3. one authoritative active-self Person plus a different genuine pending reservation: report conflict without choosing a winner;
4. more than one authoritative active-self Person: report conflict and perform no writes;
5. genuine pending reservation with zero active-self Persons: leave the reservation untouched;
6. repeated reconciliation: stable and idempotent.

Do not redesign the separately documented true simultaneous write boundary in this job.

### Required Job A tests

Add deterministic tests for:

1. path-unsafe pointer Person ID;
2. valid Person ID with path-unsafe pointer operation ID;
3. unsupported pointer schema version;
4. primitive and array pointer values;
5. partial empty pointer shapes;
6. prepared nonself journal;
7. prepared journal with no `claim` action;
8. lifecycle journal whose intended Person is inactive;
9. mismatched pointer and journal entity IDs;
10. valid pending create reservation preserved;
11. valid pending activation reservation preserved;
12. stale malformed pointer cleared when no active self exists;
13. stale malformed pointer replaced when one authoritative active self exists;
14. no write when multiple authoritative active selfs exist;
15. repeated reconciliation after repair;
16. the administration HTTP route returns a successful reconciliation response instead of `400` for malformed stored pointer data;
17. unsafe stored identifiers never reach a Blob key lookup.

## Job B. Slice 4 Professional Hub shell and relationship pages

### Scope

Build a new vanilla TypeScript SPA at `/professional/` using the existing umbrella authentication, root Functions, design kit and hub switcher.

Slice 4 is read-only apart from authentication. It contains:

1. Professional Hub shell;
2. People search and results;
3. Organisations search and results;
4. Person page;
5. Organisation page;
6. local relationship timeline rendering;
7. a Relationships landing page which searches for a Person or Organisation before opening its timeline;
8. umbrella build, routing, hub switcher and mobile navigation integration.

Do not add Communication storage, Communication APIs, a Communication editor, the shared `@` picker, Tasks integration, Meetings, Events, Applications, Career, Knowledge migration or StudentReference.

### Mandatory source reading

Before writing UI code, read:

1. root `CLAUDE.md`;
2. `packages/design-kit/AGENTS.md`;
3. `packages/design-kit/RAIL.md`;
4. `packages/design-kit/MOBILE.md`;
5. `packages/design-kit/ICONS.md`;
6. `packages/design-kit/snippets/shell.html`;
7. `packages/design-kit/snippets/rail.html`;
8. `packages/design-kit/snippets/sign-in.html`;
9. the Tasks Hub API client, authentication gate and shell only as implementation patterns;
10. the current `entities.mjs`, `entity-search.mjs` and `entity-overview.mjs` contracts.

Do not copy the Tasks Hub product density or unrelated domain features.

### Application files

Create at minimum:

```text
apps/professional/
  AGENTS.md
  README.md
  package.json
  package-lock.json
  vite.config.ts
  tsconfig.json
  index.html
  design-kit -> ../../packages/design-kit
  fixtures/seed.json
  scripts/mock-api.ts
  src/app/main.ts
  src/app/router.ts
  src/api/client.ts
  src/api/config.ts
  src/auth/gate.ts
  src/domain/types.ts
  src/shell/shell.ts
  src/views/people.ts
  src/views/person-page.ts
  src/views/organisations.ts
  src/views/organisation-page.ts
  src/views/relationships.ts
  src/views/communications.ts
  src/components/entity-search.ts
  src/components/relationship-timeline.ts
  src/styles/hub.css
  tests/unit/
```

Do not create `communication-editor.ts`, `entity-picker.ts`, professional Blob helpers or Communication schemas in Slice 4.

`communications.ts` contains one honest empty state only. It must state Communications are not available in this slice. It must make no Communication API call and expose no create control.

### Routes

Support these hash routes:

```text
#/people
#/person/<person_id>
#/organisations
#/organisation/<organisation_id>
#/relationships
#/communications
```

Default `/professional/` to `#/people`.

Unknown routes show a local not-found state with a button back to People. Do not redirect unknown routes silently.

Validate decoded route identifiers before making an API request. Use the same identifier shapes as the server contracts. Do not allow a path separator or encoded path traversal to reach a request URL.

### Navigation

Desktop rail destinations:

1. People;
2. Organisations;
3. Relationships;
4. Communications.

Communications opens its scoped empty state. Do not label a nonexistent feature as functional.

Use the canonical rail brand `Professional Hub`, linked to `#/people`. Use standard outline icons from the established shell pattern. Do not add a logo, favicon, custom rail width, new palette or alternate button style.

Use the standard mobile bottom bar and More sheet below 720 px. Include the same four Professional destinations. Provide refresh and sign-out utilities at the canvas top right.

### Authentication and API client

Reuse the umbrella endpoints:

```text
GET  /api/session
POST /api/auth
POST /api/logout
```

Use `credentials: 'include'`, `cache: 'no-store'` and the established `{ ok, data | error }` envelope.

Use the locked design kit sign-in markup and behaviour. The only Professional-specific sign-in text is `Professional Hub` as the brand eyebrow.

Do not add a passphrase, cookie, environment secret, hostname or authentication function.

For the umbrella mount, API requests are same origin. Preserve optional `VITE_API_BASE_URL` support for local or preview use without hard-coding a new production API hostname.

### People and Organisation indexes

The current backend deliberately supplies search rather than a list-all identity endpoint. Do not add a broad directory API in Slice 4.

People and Organisations are search-first pages:

1. visible labelled search input;
2. minimum two trimmed characters before request;
3. debounced request with prior request cancellation;
4. People request: `/api/entities/search?q=<encoded>&kinds=person`;
5. Organisations request: `/api/entities/search?q=<encoded>&kinds=organisation`;
6. empty initial state explaining what to search;
7. loading, no-results, authentication, network and server-error states;
8. each result opens its correct detail route;
9. no archived results in ordinary search;
10. no client-side full-store scan.

Ignore stale responses whose query no longer matches the current input.

Use text content assignment for API values. Do not inject labels through `innerHTML`.

### Person and Organisation pages

Fetch:

```text
GET /api/entities/overview?ref=<encoded canonical ref>
```

Canonical references are:

```text
shared:person:<person_id>
shared:organisation:<organisation_id>
```

Render from the server response. Do not assemble or authorise relationships in the browser.

Both detail pages show:

1. entity display name;
2. kind and lifecycle status;
3. current relationship section;
4. relationship timeline;
5. historical relationship section;
6. clear empty states;
7. retry on recoverable load failure;
8. back link to the matching search page.

Person pages also show sort name when present and a quiet `Self` indicator when `is_self` is true.

Organisation pages show legal name when present.

Do not add edit, archive, delete, create-link or lifecycle controls in Slice 4.

### Relationship rendering

Implement the renderer locally at `apps/professional/src/components/relationship-timeline.ts`.

Do not add shared design kit relationship files yet. Shared extraction belongs to Slice 5.

The renderer consumes only the authorised `timeline` array returned by `entity-overview.mjs`.

For each timeline item, display:

1. label;
2. point date or period start date;
3. period end date when present;
4. context key when present;
5. a link only when the server supplies a safe `href`.

Use `formatDisplayDate` from the design kit for calendar dates. Never show raw ISO dates or use `toLocaleDateString`.

Group items by year without changing server order inside a year. Current open periods must remain visually distinct from ended periods through existing tokens, text and shape. Do not rely on colour alone.

At 390 px, keep every label and date readable without horizontal page scrolling.

### Relationships landing page

`#/relationships` explains relationships are viewed through a Person or Organisation. Supply one search control covering `person,organisation` and open the selected entity's detail page.

Do not add a global link listing endpoint. Do not duplicate relationship data in the frontend.

### Synthetic local fixture

The Vite development server must work without production secrets or real data.

Use a small in-memory mock API with only:

1. session check;
2. sign in and sign out;
3. entity search;
4. entity overview.

Seed only synthetic records:

1. Person `Seth Example`;
2. Organisation `Example University`;
3. two concurrent role periods in different contexts;
4. one ended relationship so current and historical rendering are both visible.

Mark the fixture as synthetic. Do not include real contacts, students, employers or organisations.

### Umbrella integration

Update:

1. root `package.json` with `build:professional` and inclusion in `build:apps`;
2. `scripts/build-spa.mjs` allow list and usage text;
3. `scripts/prepare-web.mjs` SPA list;
4. `scripts/pages-spa-fallback.html` prefix recognition;
5. `packages/hub-switcher.js` with Professional title, `/professional/` origin and a simple outline people icon;
6. `apps/life/js/shell/hub-sections.js`;
7. `apps/life/index.html` desktop hub switcher and mobile More sheet;
8. relevant service worker navigation and asset rules only where existing code enumerates hub paths;
9. `tests/unit/apps-spa-remount.test.js`;
10. hub switcher tests;
11. `tests/integration/static-server.test.js`.

Do not add a Professional pulse card to the Life dashboard. Hub navigation inclusion is sufficient for Slice 4.

`build:professional` must run a TypeScript no-emit check before the Vite build. Root `npm run build` must therefore fail on Professional TypeScript errors.

### Required Slice 4 tests

Professional unit tests must cover:

1. route parsing and unsafe identifier rejection;
2. default route;
3. API envelope parsing;
4. API request encoding;
5. sign-in form submission by Enter;
6. People search minimum length;
7. Organisation search minimum length;
8. stale search response suppression;
9. result route selection;
10. Person overview rendering;
11. Organisation overview rendering;
12. current and historical relationship separation;
13. timeline order and year grouping;
14. open and ended period labels;
15. safe handling of API labels as text;
16. no Communication API request from the empty state;
17. no mutation controls on detail pages.

Root tests must prove:

1. Professional exists in the umbrella build list;
2. `/professional` and `/professional/` restore correctly;
3. deep paths dispatch back to the Professional SPA;
4. the static server serves `/professional/` and a Professional deep path;
5. every hub switcher includes Professional exactly once;
6. Life desktop and mobile hub navigation include Professional;
7. root Functions remain under `netlify/functions`;
8. no separate deployment configuration exists under `apps/professional`.

Browser verification must cover desktop and a 390 px viewport:

1. sign in through the local mock;
2. search for `Seth`;
3. open Seth's Person page;
4. see two concurrent current roles;
5. see the ended relationship in history and timeline;
6. navigate back to People;
7. search for `Example`;
8. open Example University's Organisation page;
9. open Relationships and search across both kinds;
10. open Communications and see the honest Slice 5 empty state;
11. confirm no horizontal document overflow at 390 px;
12. use mobile navigation and sign out.

Prefer automated browser coverage. If repository browser infrastructure makes a focused Professional spec disproportionate, run and record a deterministic Playwright script against the local Vite mock. Do not claim visual verification from unit tests alone.

### Verification commands

Install dependencies through the repository's existing lockfiles. Do not upgrade unrelated packages.

Run at minimum:

```bash
node --test tests/unit/identity-repository.test.js tests/integration/entities-admin.test.js tests/unit/universal-link-repository.test.js
npm --prefix apps/professional test
npm --prefix apps/professional run typecheck
npm run build:professional
npm test
npm run build
git diff --check
```

Run any new focused browser check and report its exact command.

If a pre-existing unrelated test fails, prove the failure on the relevant base commit before labelling it pre-existing. Do not omit failures from the pull request body.

## Completion report

Return one concise report after both jobs finish. Include:

1. PR 313 URL, final SHA, tests and draft state;
2. Slice 4 stacked PR URL, base branch, head SHA, changed-file summary, tests and draft state;
3. the exact local route for testing Professional Hub;
4. any genuine blocker;
5. explicit confirmation neither pull request was merged.

Do not paste this programme back to Adam. Adam only needs the completion report.
