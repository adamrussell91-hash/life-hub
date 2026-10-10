# Cursor brief: one store for Professional data (retire the Notion JSON reads)

**Status:** ready to build. Phase 1 can be built now. Phase 2 (communications) can be built and dry-run, but not applied until Adam answers Decision D4. Phase 3 starts only after Phases 1 and 2 are live.
**Written:** 10/10/26 by Claude Code, after the @-connections investigation ([#769](https://github.com/adamrussell91-hash/life-hub/pull/769)).
**Builder:** Cursor. Read this whole file before writing any code. Where this brief says STOP, stop and report; do not improvise.

---

## 1. The problem, in one paragraph

Professional Hub data lives in two places. Records made in the app live in **Netlify Blobs**. Records brought over in bulk from Notion live as **JSON files in the private `life-hub-data` repo** (`data/professional/*.json`), and every page that shows them has to read both places and merge them at request time. Every reader that forgets the second place is a bug. Example: the @-connections search could not find the imported "PD — Samuel Wagan Watson (Felicity Plunkett)" event. The fix is to copy every imported record into Blobs once, under the id it already has, then delete the code that reads the JSON files. After this work, **Blobs is the only store the running site reads Professional data from.**

## 2. Decisions (do not re-open these)

| # | Decision |
|---|----------|
| D1 | **Netlify Blobs is the one store.** This reverses the earlier choice recorded at the top of `netlify/functions/_shared/github-professional-data.mjs` ("canonical home is GitHub… chose not to duplicate it into Netlify storage"). Adam reversed it on 10/10/26. Update that comment in Phase 3. |
| D2 | **Ids never change.** Every imported record keeps the id the site already uses for it (`person_<hash>`, `organisation_<hash>`, `event_<hash>` from the existing derive functions). Universal Links, org charts, tags and URLs already point at these ids. Never call `randomUUID`, `generatePersonId`, `generateEventId` or any other random-id generator for an imported record. |
| D3 | **The JSON files become a frozen archive.** Never edit, move or delete anything in `life-hub-data/data/professional/`. Never write to the `life-hub-data` repo at all. |
| D4 | **Communications (Phase 2): needs Adam.** 292 of 632 Notion communication rows name a student (`student_name`). Copying them into Blobs moves student information into the Professional store. Phase 2 builds and dry-runs only. **Do not run Phase 2 `--apply` until Adam has answered the D4 question in the Phase 2 PR.** |
| D5 | **Out of scope:** Knowledge notes (they already live in one place, `knowledge-hub-data`); Life Hub data; the `email`, `phone`, `tags`, `notion_url` and `source_notes` fields in `people.json` (the site doesn't show them today and this work must not start showing them); the tie-inference scripts under `scripts/` that read `people.json` directly. List anything else you find that merges a JSON file with Blobs in the PR body. Do not migrate it. |

## 3. What exists today (verified against `main` at `92cbf0f1`)

| Data | JSON file | Rows (local clone, 06/10/26; re-count live) | Reader that merges it | Copy-into-Blobs path that already exists |
|---|---|---|---|---|
| People (adults) | `people.json` | 211 (210 contacts + Adam's own "self" record) | `people-collection.mjs`, `people-dedupe.mjs`, `entity-search.mjs`, `entity-resolvers.mjs` (`resolvePerson`), `entity-overview.mjs`, `people-agent.mjs`, `person-workplace.mjs`, `entities.mjs` | **Yes:** `identityRepo.adoptImportedIdentity({ kind: 'person', record })` in `identity-repository.mjs:834`. Refuses the self Person. |
| People (students) | `people.json`, rows where `original_category === 'Student (Communications database)'` | 127 | same as above, plus `organisations-collection.mjs`; excluded from every colleague list by `isImportedStudentPerson` | Same adopt path. **See rule R6.** |
| Self Person (Adam) | `people.json`, row with `is_self: true` | 1 | `getGithubActiveSelfPerson` → `schedule-projections.mjs`, `career-overview.mjs` | **No.** Never adopt it. See Phase 1 step 2. |
| Organisations | `organisations.json` | 107 | `organisations-collection.mjs`, `entity-search.mjs`, `entity-resolvers.mjs` (`resolveOrganisation`), `entity-overview.mjs` | **No.** `adoptImportedIdentity` throws `unsupported_adopt_kind` for organisations. Phase 1 extends it. |
| Relationships | `relationships.json` | 327 (244 `employee_at`, 79 `professional_relationship`, 4 `member_of`) | `listGithubRelationshipEntries` → `entity-overview.mjs`, `people-collection.mjs`, `organisations-collection.mjs`, `person-workplace.mjs`, `career-overview.mjs`. Built in memory as fake links with `import_source: 'professional_data'`. | Partly: `person-workplace.mjs` `endWorkplace` writes a native copy that supersedes an imported link. |
| PD events | `pd-events.json` | 28 | `event-repository.mjs` `listEvents` (copies each one into Blobs the first time the list loads, #767); `entity-search.mjs` and `resolveEvent` (fallback added in #769); `schedule-projections.mjs` | **Yes:** `event-repository.mjs` `loadEditableEvent(id, snapshot)`, also migrates `talk_note` links to Knowledge notes. |
| Communications + Notion meetings | `communications.json` | 632 (490 in-person meetings, 63 video calls, 38 emails, 11 phone calls, 30 no method) | `communications.mjs`, `meetings.mjs`, `schedule-projections.mjs`, via `projectNotionCommunicationListRecord` / `projectNotionMeetingListRecord` / `projectNotionCommunicationSchedule` in `schedule-projection.mjs`. Ids are `notion_<32hex>`, **not valid hub ids**, so these rows open Notion, not a hub page, and can't be linked. | **No.** Phase 2. |

The local clone's counts don't match `import-manifest.json` (350 / 18 / 74), so the live repo has moved on. **Never trust the counts in this table. The dry run reads the live files and reports real counts.**

## 4. Rules: every one is a mistake that will otherwise happen

**R1 · Reuse the app's own code for every write.** Copy people with `adoptImportedIdentity`, events with the event repository, links with `createUniversalLinkRepository(...).createLink` / `endLink`, and communications with the communication and meeting repositories (Phase 2 adds an explicit-id path). Do not `setJSON` an entity record, index key or journal by hand anywhere in the script. Hand-written blobs skip the index, the journal and validation; that is how half-copied records happen.

**R2 · Read the import through the existing loaders**, not by parsing the JSON yourself: `getGithubPerson`, `listGithubPersonCandidates`, `listGithubImportedStudentPeople`, `listGithubOrganisationCandidates`, `listGithubRelationshipEntries`, `listGithubPdEvents`, `listGithubCommunications`. Then the copy is exactly what the site shows today, with the same ids, the same normalisation and the same skipped rows.

**R3 · A Blob record always wins. Never overwrite one.** If a Blob record already exists for an id, in **any** state (active, archived, deidentified, deleted, `deleted_at` set), skip it and count it as `already_in_blobs`. A deleted record is a decision Adam made; copying the import over it would bring it back from the dead. Read existence with `{ consistency: 'strong' }` (register W5).

**R4 · Re-check at apply time, not just at dry-run time** (register W6). Adam keeps using the site between your dry run and your `--apply`. Every write re-reads the target with strong consistency immediately before writing, and skips if anything appeared.

**R5 · Idempotent.** Running `--apply` twice must write nothing the second time and report all `already_in_blobs`. Test this.

**R6 · Students stay students.** The colleague lists hide students today in two ways: `record.original_category` (kept by `adoptImportedIdentity`, because `parsePersonRecord` keeps extra keys) **and** an id set built from `listGithubImportedStudentPeople`. Phase 3 deletes the second one. So:
- Phase 1 adds a test: after adopting a student row, the Blob record still has `original_category: 'Student (Communications database)'`.
- Phase 3 makes `people-collection.mjs`, `people-dedupe.mjs`, `organisations-collection.mjs` and `people-directory.mjs` build their student set from Blob records' `original_category` before removing the GitHub list.
- Live check: the People page shows **zero** students before and after (register D6, D9).

**R7 · Never adopt the self Person.** Skip the `is_self: true` row and report it. See Phase 1 step 2.

**R8 · No personal data in git, logs or the PR.** Dry-run and apply reports go to a file **outside the repo** (default `os.tmpdir()`), not to stdout. The PR body may contain counts and ids only, never names, emails or communication text. Never print `GITHUB_TOKEN` or `NETLIFY_BLOBS_TOKEN`. Copy the token handling in `scripts/copy-hub-blobs.mjs`.

**R9 · Dry-run by default.** The script writes nothing unless `--apply` is passed. Copy the flag style of `scripts/copy-hub-blobs.mjs` (`--apply`).

**R10 · Record every key you write**, in a write log outside the repo, so `--rollback <log>` can delete exactly those keys. Rollback deletes a key only if it is unchanged since the script wrote it (compare `updated_at`); it skips and reports anything Adam has edited since. Rollback never touches a key it didn't write.

**R11 · Branch from fresh `main`** (register P2). `git diff --stat origin/main...HEAD` touches only the files each phase names, plus tests.

**R12 · One phase per PR.** Don't start Phase 3 until Adam has confirmed in chat that Phases 1 and 2 were applied live and the checks in §6 passed. A PR that stops early says `PARTIAL:` in its title (register P5).

## 5. Phases

### Phase 1: people, organisations, relationships, PD events (PR A)

Files: `scripts/migrate-professional-imports.mjs` (new), `netlify/functions/_shared/identity-repository.mjs`, tests. **No changes to any reader in this PR.**

1. **Extend `adoptImportedIdentity` to organisations.** Allow `kind: 'organisation'` and validate with `parseOrganisationRecord`. Keep the journal type, the operation-id shape (`deriveOperationId(['adopt_identity', kind, id])`) and the "existing record → return `adopted: false`" behaviour exactly as for people. Tests: adopting an org writes record + index; a second adopt returns `adopted: false`; an existing deleted org is not overwritten.
2. **Self Person.** The dry run reports whether the self pointer (`SELF_POINTER_KEY = 'entities/self-pointer'` in `identity-repository.mjs`) points at a Blob Person with `is_self: true` and `lifecycle_status: 'active'`. Read it the way `identity-repository.mjs` does; don't guess the format. If none exists: **STOP. Do not create one, do not adopt the GitHub self row.** Write it in the report and the PR body; Adam decides.
3. **People:** for each id from `listGithubPersonCandidates` **and** `listGithubImportedStudentPeople`, skip the self row (R7), apply R3, then `adoptImportedIdentity({ kind: 'person', record: await getGithubPerson(id) })`.
4. **Organisations:** for each from `listGithubOrganisationCandidates`, apply R3, then adopt.
5. **Relationships:** for every adopted or already-in-Blobs person, read `listGithubRelationshipEntries('person', id)`. For each imported link:
   - skip it if either end is a student (the same filter `listGithubRelationshipEntries` already applies) and count `skipped_student`;
   - skip it if a native link with the same `source_ref`, `target_ref` and `relationship_type` already exists in **any** status (a native link already supersedes the import; see `person-workplace.mjs`) and count `already_in_blobs`;
   - otherwise `createLink({ source_ref, target_ref, relationship_type, role, valid_from })`, then, if the import had `valid_to`, end it at that `valid_to` with the same calls `endWorkplace` uses.
   - `professional_relationship` links appear under **both** people. Create each one once. The existing `derivePersonPersonLinkId` sorts the pair; dedupe on it.
   - Before writing this step, `grep -rn "ul_" apps/professional/src netlify/functions` for anything that stores an imported link's synthetic `ul_<hash>` id (org-chart holder lines are the likely place). If anything does: **STOP and list it in the PR.** Changing link ids under a stored reference breaks it.
6. **PD events:** call the event repository's own path for every row in `listGithubPdEvents`, the same `loadEditableEvent(imported.id, imported)` that `listEvents` uses, so `talk_note` links move too. Respect tombstones (R3); `loadEditableEvent` already throws 404 for them. Count those as `deleted_in_blobs`.
7. **Report** (outside the repo, R8): per kind, the count of each of `in_import`, `would_copy` / `copied`, `already_in_blobs`, `deleted_in_blobs`, `skipped_self`, `skipped_student` (links only), `failed`, plus the failed ids and error codes. A non-zero `failed` exits with code 1.
8. **Tests** (`tests/unit/migrate-professional-imports.test.js`) use in-memory stores with a **lagging store** that serves stale data to non-strong reads (register W5). Cover: dry run writes nothing; apply copies; second apply copies nothing (R5); an existing deleted record is never revived (R3); a record created between dry run and apply wins (R4); the self row is never adopted; a student keeps `original_category`; an imported ended relationship ends up `ended` with the same `valid_to`; a person-person relationship is written once; rollback deletes only keys it wrote and skips an edited one. At least one test runs the real script entry point against the in-memory stores (register W2).

**Run order once PR A is merged** (Adam runs it, or Cursor with Adam watching):
`node scripts/migrate-professional-imports.mjs` (dry run) → send Adam the counts → Adam says go → `--apply` → re-run the dry run, which must report `would_copy: 0` for every kind.

### Phase 2: communications and Notion meetings (PR B, dry-run only until D4 is answered)

Files: the same script (an `--only=communications` flag), `communication-repository.mjs`, `meeting-repository.mjs`, `schedule-projection.mjs` (shared mapping only), tests.

1. **Deterministic ids.** Add `notionCommunicationId(notionId)` → `communication_<uuid-shaped sha256 of "communication:" + notionId>` and `notionMeetingId(notionId)` → `meeting_<…of "meeting:" + notionId>`, copying the shape of `notionPdEventId` in `notion-pd-events.mjs`. They must match `COMMUNICATION_ID_PATTERN` / `MEETING_ID_PATTERN`. Unit-test the pattern match.
2. **Explicit-id create.** Add an import-only path to each repository that accepts the derived id instead of calling `generateId()`, with the same validation, journal and index writes as the normal create, and refusing if the id exists (R3). It must not be reachable from any HTTP handler. Test that it isn't exported through `communications.mjs` / `meetings.mjs`.
3. **Split by method** exactly as today: `isNotionMeetingMethod(row.method)` rows → meetings; everything else → communications. Map fields with the existing projections (`projectNotionMeetingListRecord`, `projectNotionCommunicationListRecord`), changing only the id, dropping `source`, and keeping only keys the schemas' `STORED_KEYS` allow. If a projected value fails the schema, report `failed` with the field name. Don't massage it.
4. **No new links to students.** Do not turn `student_name` or `attendees` into person links. Their text stays where the projection already puts it.
5. **Dry run only.** Post the counts in the PR and ask Adam the D4 question, word for word:
   > "292 of the Notion communications name a student. Copy them into the Professional store as they are (student names stay in the text, no student links), or leave the student ones in the archive file and copy only the other 340?"
   Build whichever he answers. Run `--apply` only after that.
6. Old `notion_<hex>` URLs: `apps/professional/src/views/communications.ts:41` and `meetings.ts:116` open Notion for `notion_` ids. Leave them alone in this phase; Phase 3 removes them.

### Phase 3: delete the dual reads (PR C, only after Adam confirms Phases 1 and 2 are live)

Every item is a deletion or a simplification. Each numbered item is its own commit, so one can be reverted alone.

1. `entity-search.mjs`: remove `searchGithubIdentityKind`, `mergeNativeFirst` and the imported-PD-event branch in `searchEventKind` (added in #769).
2. `entity-resolvers.mjs`: remove the GitHub fallbacks in `resolvePerson`, `resolveOrganisation` and `resolveEvent` (the last added in #769).
3. `people-collection.mjs`, `people-dedupe.mjs`, `organisations-collection.mjs`, `people-directory.mjs`: read Blobs only, with the student set from `original_category` **first** (R6).
4. `entity-overview.mjs`, `person-workplace.mjs` (`adoptIfImported`, `endWorkplace`'s imported branch, `isImported`), `career-overview.mjs`, `people-agent.mjs`, `entities.mjs`: remove the GitHub reads and adopt-on-first-edit branches.
5. `schedule-projections.mjs`, `career-overview.mjs`: self Person from Blobs only (Phase 1 step 2 guaranteed it exists).
6. `event-repository.mjs`: remove `loadImportedEvents`, the imported loop in `listEvents`, and the snapshot branch of `loadEditableEvent`. **Keep** `migrateKnowledgeNotes` and the `events/imports/<id>` journal read until a check shows every journal is `complete: true`; list the incomplete ones in the PR.
7. `events.mjs`, `communications.mjs`, `meetings.mjs`, `schedule-projections.mjs`: remove `listGithub*` reads and `mergeBlobAndNotionRecords` callers; delete the Notion projection functions nothing calls any more.
8. `apps/professional/src/views/communications.ts`, `meetings.ts`: remove the `notion_` → Notion-link branches.
9. `github-professional-data.mjs`: move what the migration script still needs to `scripts/lib/`, delete the rest, and replace the header comment with one line pointing at this brief (D1). `derivePersonId` / `deriveOrganisationId` stay importable for `scripts/infer-ties.mjs` and `scripts/tie-inference-health.mjs`.
10. Proof of done: `grep -rn "listGithub\|getGithubPerson\|getGithubOrganisation\|import_source\|professional_data'" netlify/functions apps/*/src` returns nothing except `scripts/lib/`. Paste the output into the PR.

## 6. Checks (Adam-says → sees; every one live on `life-hub.adam-russell.com`, desktop and 390px)

Before Phase 1 `--apply`, record these numbers from the live site in the PR: People page count, Organisations page count, Events list count, Communications list count, Meetings list count. Then after each apply and after Phase 3:

| # | Adam does | Adam sees |
|---|---|---|
| C1 | Opens People | the same count as before; **no students**; no name listed twice (D9) |
| C2 | Opens Organisations | the same count as before; each org's people count unchanged |
| C3 | Opens a person who came from Notion and changes their job title | it saves; the old workplace shows as ended, with no duplicate current workplace |
| C4 | Opens a Teaching unit → Connections → types "wagan watson" | the event "PD — Samuel Wagan Watson (Felicity Plunkett)" appears; tagging it saves and shows on the event page |
| C5 | Opens the Events list | the same count as before; deleted events stay deleted |
| C6 | (after Phase 2) Opens a former Notion meeting from Meetings | it opens a hub meeting page, not Notion, with the same title and date |
| C7 | (after Phase 2) Opens the Communications list | the same count as before (minus any student rows Adam chose to leave behind, D4) |
| C8 | (after Phase 3) Any page above, with `GITHUB_TOKEN` unset in a deploy preview | everything above still works. Proves nothing reads the JSON any more. |

A check that fails means the phase isn't done (register P3). Don't tick it on a unit test.

## 7. Register entries that apply (`docs/CURSOR-UI-FAILURES.md`)

- **D6** (derived value from partial input): the student set must come from the full Blob population once GitHub reads go. Check: R6 test, plus C1.
- **D8** (lookup miss throws away the label): after Phase 3 a relationship whose other end failed to copy must still render the link's label, not "Unknown person". Check: a test with a missing endpoint.
- **D9** (picker rows that can't be told apart): a student adopted alongside an existing Blob copy must not create a second "Rohan" row. Check: C1, plus `people-dedupe` tests stay green.
- **W2** (works in tests, not in production): the script test goes through the real entry point. Check: name the test in the PR.
- **W5** (eventually consistent read-modify-write): every existence check uses `{ consistency: 'strong' }`. Check: the lagging-store test.
- **W6** (batch overwrites a newer value): R4. Check: the "record created between dry run and apply" test.
- **P2, P3, P5**: R11, §6 and R12.

## 8. Rollback

- **Before Phase 3:** run `--rollback <write-log>`. Reads still fall back to the JSON files, so the site goes back to exactly today's behaviour.
- **After Phase 3:** revert the Phase 3 PR first (it's all deletions), then roll back if needed. Never roll back with Phase 3 still live; that would leave records the site can no longer find.
