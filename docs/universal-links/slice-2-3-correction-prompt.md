# Claude Code Prompt: Repair Universal Links Slices 2 and 3

You are working in `adamrussell91-hash/life-hub`.

Your task is to repair confirmed defects introduced by merged PR 307 and PR 308. Do not begin Slice 4. Do not add interface work. Do not merge any pull request.

## Read first

Before editing, read:

1. `CLAUDE.md` and every applicable `AGENTS.md`.
2. `docs/universal-links/implementation-programme.md`.
3. `docs/universal-links/repository-map.md`.
4. The complete diffs and review conversations for PR 307 and PR 308.
5. The current implementations and tests for Universal Links, identities, entity search and entity overview.

Treat the implementation programme as the product contract. Treat the defects below as confirmed reproduction cases, not suggestions.

## Repository gate

Fetch `origin/main` and record its full SHA as `BASE_SHA`.

Confirm PR 307 and PR 308 are merged into that commit. Confirm current main contains:

```text
netlify/functions/_shared/universal-link-repository.mjs
netlify/functions/_shared/identity-schema.mjs
netlify/functions/_shared/entity-lifecycle.mjs
netlify/functions/entities.mjs
netlify/functions/entity-search.mjs
netlify/functions/entity-overview.mjs
```

Create a fresh branch from current `origin/main` named with the prefix:

```text
claude/universal-links-slice-2-3-corrections-
```

If either merged slice is absent, stop and report the missing prerequisite.

## Required outcome

Repair all confirmed Slice 2 and Slice 3 defects. Add regression tests for every reproduction. Preserve all existing routes and valid response shapes unless this prompt explicitly requires a change.

No accepted defect may be moved into a known limitations section.

## Part A: Slice 2 corrections

### A1. Validate membership contents during create, retry and rebuild

Current code treats any non-null value at a source, target or type membership key as valid. This is wrong.

Add strict parsers or equality checks for both membership record shapes.

A source or target membership is valid only when all fields match the expected values:

```text
schema_version
link_id
canonical_ref
created_at, where appropriate for an existing valid membership
```

A relationship type membership is valid only when all fields match the expected values:

```text
schema_version
link_id
relationship_type
created_at, where appropriate for an existing valid membership
```

At minimum, a record with the wrong schema version, link ID, canonical ref or relationship type must be treated as invalid.

During `createLink`, retry and `repairOperation`, replace an invalid membership at the expected key with the correct membership.

During `rebuildIndexes`, count an invalid membership as missing and repair it in live mode. Dry run must report it without writing.

After repair, ordinary `listOutgoing`, `listIncoming` and `listForEntity` reads must return the link.

### A2. Keep rebuild running after membership read failures

Wrap each source, target and relationship type membership read in per-link error handling.

A failed membership read must:

1. Increment the failed count.
2. Preserve all safe counts already collected.
3. Continue processing later authoritative links.
4. Avoid writing a membership whose existing state was not established.
5. Never reject the entire rebuild solely because one membership read failed.

Return the normal rebuild report after processing all possible links.

Add failure injection for each of the three membership reads and prove a later link still gets inspected and repaired.

### A3. Repair the original operation after a committed journal update failure

Current behaviour leaves the original operation in `repair_needed` when the final committed journal write fails. A retry with the same create input returns early because the link and memberships exist. The original operation is never committed.

Change retry behaviour so the original operation reaches `committed`.

Use a deterministic way to find or resume the incomplete create operation for the deterministic link. Do not generate an endless sequence of journals for the same incomplete link.

The regression test must capture the original `operation_id`, inject failure at the final commit update, retry the same create input, then load the original operation and assert:

```text
status === committed
completed_steps contains all four create steps
last_error_code === null
```

Also prove the link and each membership exist exactly once.

### A4. Make lifecycle journalling fail visible and recoverable

`endLink`, `suppressLink` and `deleteLink` currently mutate the authoritative link and silently swallow a failed journal write. This breaks the journalled service contract.

Replace best effort lifecycle audit writes with a recoverable operation protocol.

For each lifecycle method:

1. Write a prepared operation before mutating the link.
2. Store the validated intended transition without endpoint display data.
3. Write the authoritative link idempotently.
4. Mark the operation committed.
5. Return `503 link_write_incomplete` with safe `operation_id` and `link_id` when a post-preparation step fails.
6. Allow `repairOperation` to complete the lifecycle operation.
7. Ensure a retry does not reject merely because the first attempt already changed the link status.

Inject failure at the prepared journal write, authoritative link write and committed journal update for each lifecycle operation. Prove retry or `repairOperation` reaches one committed result without duplicating operations or changing historical fields.

Do not expose HTTP DELETE. Preserve the current route restriction.

## Part B: Slice 3 corrections

### B1. Enforce one active self identity across creation and activation

Confirmed reproduction:

1. Create self Person A.
2. Deactivate A.
3. Create active self Person B.
4. Activate A.
5. Current code returns 200 and leaves two active self records.

The corrected implementation must reject step 4 with `409 self_identity_exists`, or perform another explicitly documented transition which still leaves exactly one active self. Silent replacement is not allowed.

Run the same uniqueness check for self activation as for self creation.

Do not rely only on listing search index records. Introduce one authoritative singleton self pointer or equivalent invariant record in `universal-link-content`. Search indexes remain derived data, not authority.

Netlify Blobs does not provide a database transaction or a compare-and-set primitive. Do not claim transactional uniqueness. Design for the current single operator system using strong reads, one authoritative singleton key, idempotent writes and reconciliation. Add controlled interleaving tests which prove the externally observable state never returns two active self identities.

Document the exact concurrency boundary honestly in the pull request.

### B2. Validate the normalised search query

Confirmed reproduction:

```text
GET /api/entities/search?q=%20%20
```

Current code returns 200 and lists active identities because length is checked before trimming.

Normalise once before validation and matching. Apply the 2 to 100 character limit to the trimmed query.

Whitespace-only queries must return `400 invalid_query_length` and must perform no index listing or Blob reads.

Add tests for two spaces, surrounding spaces, tabs, newlines, one visible character surrounded by spaces, and a valid two character query surrounded by spaces.

### B3. Block identifying field updates after deidentification or deletion

Confirmed reproduction:

1. Create a Person.
2. Deidentify the Person.
3. Send `PATCH action=update` with a new `display_name` and aliases.
4. Current code writes those identifying values into the authoritative deidentified record and returns 200.

Reject ordinary field updates when lifecycle status is `deidentified` or `deleted`.

Use `409 invalid_lifecycle_transition` or a more specific stable code. Apply the same terminal-state rule to every identifying field for Person and Organisation.

Add tests which inspect the stored authoritative record after the rejected update. The tombstone label and empty aliases must remain intact.

### B4. Make identity record, index and lifecycle event writes recoverable

Identity writes currently span several Blobs without a recovery protocol:

```text
authoritative entity
identity search index
lifecycle event
self pointer where applicable
```

This produces confirmed unsafe states:

1. A create can write the entity, fail the index, return 500, then create a duplicate on retry.
2. Delete or deidentify can redact the entity, fail the index, and leave the former active name searchable.
3. A lifecycle transition can update the entity and index, fail the event write, then reject a retry because the status already changed.

Create a canonical identity repository or equivalent service layer. Handlers must not coordinate these writes themselves.

Use a versioned identity operation journal under a path-safe key family in `universal-link-content`. Write the prepared operation before any entity mutation. Record only the data required for idempotent replay. Do not record discarded names after deidentification or deletion.

The repository must support create, field update and lifecycle transition recovery. A failed operation must return a named retryable 503 with safe operation and entity identifiers. Retry or repair must finish missing writes without generating a second identity.

Search must never trust an index display label as authority. Hydrate and validate the authoritative entity before returning any result. This rule protects privacy if a stale index survives a partial failure.

Add failure injection after every identity write boundary. Prove:

1. Former labels never appear in search after deidentification or deletion, even with a stale index.
2. Create retry returns the original entity ID.
3. Lifecycle retry writes the missing event and does not reject the already-applied transition.
4. Index repair restores ordinary search.
5. Error payloads and journals contain no forbidden identifying labels.

### B5. Preserve archived relationship history in entity overview

Current overview loads the archived identity directly, then calls `listForEntity` with the ordinary resolver. The resolver hides the requested archived endpoint, so the read repository returns empty arrays.

Create a deliberate overview resolver mode which permits the requested archived Person or Organisation while preserving ordinary access checks for every other endpoint.

Do not make archived identities visible to ordinary Universal Link reads or ordinary suggestions.

Add a regression test which:

1. Creates a Person and Organisation.
2. Creates current and ended relationships.
3. Archives the Person.
4. Loads the Person overview.
5. Asserts the current relationship, ended relationship, linked Organisation and timeline entries remain present.
6. Asserts ordinary entity search and ordinary Universal Link reads still hide the archived Person.

### B6. Implement Task results in entity search

The agreed API contract includes:

```text
GET /api/entities/search?q=<query>&kinds=person,organisation,task&include_archived=false
```

Implement `task` search using the existing Tasks storage and safe Task resolver projection. Do not copy Tasks into `universal-link-content`. Do not create a new Task index unless the existing Tasks adapter requires one and the repository map supports it.

Return grouped Person, Organisation and Task results. Keep the combined maximum at 20. Apply exact prefix ranking before token ranking across all groups.

Do not silently discard unsupported requested kinds. Validate the `kinds` parameter and return a stable 400 response for unknown values.

Add integration tests proving Task search, mixed-kind ranking, the combined cap, unsupported kind rejection and no StudentReference result.

## Security and privacy requirements

Preserve all existing operator authentication, origin checks and `cache-control: no-store` behaviour.

AccessContext must remain server derived.

Never write or return endpoint labels in Universal Link operation journals.

Never place former deidentified or deleted identity labels in indexes, lifecycle events, operation journals, errors or logs.

Never weaken archived or protected endpoint non-disclosure in ordinary reads.

Validate every ID before incorporating it into a Blob key.

Bound every list hydration and rebuild operation to at most ten concurrent Blob operations.

## Scope exclusions

Do not begin Slice 4.

Do not create `apps/professional`.

Do not add UI, picker or relationship timeline components.

Do not implement Communication.

Do not change Tasks editing interfaces.

Do not add Knowledge migration code.

Do not add StudentReference code or real student data.

Do not edit `docs/consolidation/**`.

Do not modify the Stars or Universe graph work.

Do not refactor unrelated modules.

## Required tests

Keep all existing Slice 1, Slice 2 and Slice 3 tests.

Add regression tests for every item in Parts A and B. Tests must fail against the merged PR 307 and PR 308 implementation before the fix.

Run:

1. Every changed or added test file directly with `node --test`.
2. All Universal Links and entity unit and integration tests together.
3. Root `npm test`.
4. Root `npm run build`.
5. `git diff --check BASE_SHA...HEAD`.
6. A changed-file scope audit.
7. Searches proving only the canonical Universal Link repository writes Universal Link records and only the canonical identity repository writes identity records, indexes, events and identity operation journals.

Do not label a failure as pre-existing without reproducing it on `BASE_SHA` with the same command.

## Pull request requirements

Commit and push the correction on the fresh branch. Open one draft pull request against `main`.

Do not merge.

The pull request body must include:

1. `BASE_SHA` and `HEAD_SHA`.
2. Every confirmed reproduction and its corrected result.
3. The membership validation rules.
4. The Universal Link journal recovery design.
5. The identity operation recovery design.
6. The active self invariant and honest concurrency boundary.
7. Storage keys added or changed.
8. API behaviour changed.
9. Privacy impact.
10. Failure injection matrix for Universal Link and identity operations.
11. Exact test and build results.
12. Changed files and why.
13. Known limitations which are outside this correction only.
14. Rollback path.
15. Confirmation the pull request is draft and unmerged.

## Completion gate

Stop after opening the draft correction pull request.

Report its URL, branch, `BASE_SHA`, `HEAD_SHA`, changed files, tests, build result, failure injection result and any unresolved contradiction.

Do not merge. Do not begin Slice 4.
