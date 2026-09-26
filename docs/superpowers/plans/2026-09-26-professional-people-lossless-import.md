# Professional People lossless import — implementation plan

> **For implementation:** Execute this plan test-first. The approved design is
> `docs/superpowers/specs/2026-09-26-professional-people-lossless-import-design.md`.

**Goal:** Backfill every supplied Notion People property and Markdown profile
into private Professional data, preserve it through the existing GitHub bridge,
and display it safely in Person Profile without additional per-person requests.

**Architecture:** `people.json` keeps each existing identity and adds a
validated `professional_profile` extension. The GitHub bridge normalises that
extension only for a selected person's entity overview; search and relationship
endpoints continue to expose their small identity projections. A deterministic
CLI builds the extension from the export's CSV and Markdown entries and writes
only an explicitly named private-data output file.

**Tech stack:** Node 22 ESM, `node:test`, `vitest`, TypeScript DOM rendering,
the existing Netlify GitHub-content client. ZIP extraction uses macOS/BSD
`bsdtar`, which is tolerant of the one malformed archive filename that blocked
`unzip` during discovery.

---

### Task 1: Add a defensive professional-profile parser

**Files:**
- Create: `netlify/functions/_shared/professional-profile.mjs`
- Modify: `netlify/functions/_shared/github-professional-data.mjs`
- Test: `tests/unit/github-professional-data.test.js`

1. Write failing tests for a populated profile, a profile containing an
   unknown source property, malformed URLs, missing optional values, and an
   identity-only record.
2. Run `node --test tests/unit/github-professional-data.test.js` and verify
   the new assertions fail.
3. Implement `parseProfessionalProfile(raw)`:
   - accepts only a finite versioned object;
   - copies every string-keyed `source.properties` value without treating it
     as HTML;
   - projects safe `https:` profile URLs and rejects all other schemes;
   - normalises reference arrays to `{ label, source_url, hub_href }` and
     allows `hub_href` only for an app-local absolute-path/hash route;
   - bounds body/source string sizes before they can reach a response;
   - returns `null` for an absent/invalid extension rather than failing an
     entire directory.
4. Make `normalizePeople` attach the parsed extension as
   `professional_profile` after identity validation. Do not alter existing
   ids, identity fields, cache semantics, or search candidate APIs.
5. Re-run the focused test and `npm test -- --test-name-pattern` only if the
   project runner supports it; otherwise run the focused Node test again.
6. Commit: `feat(professional): preserve imported people profiles`.

### Task 2: Return profiles only in entity overview responses

**Files:**
- Modify: `netlify/functions/_shared/entity-overview.mjs`
- Modify: `apps/professional/src/domain/types.ts`
- Test: `tests/unit/entity-overview-github-merge.test.js`
- Test: `tests/integration/entity-search.test.js`

1. Add failing assertions that a GitHub-only Person overview returns the
   parsed `professional_profile`, while an entity-search result contains none
   of its contact/source fields.
2. Run `node --test tests/unit/entity-overview-github-merge.test.js
   tests/integration/entity-search.test.js`; verify failures.
3. Introduce explicit response shaping in `entity-overview.mjs`: identity
   fields plus `professional_profile` for Person overviews only. Never rely on
   a broad object spread to decide whether private source fields leave the
   server. Preserve deletion/deidentification redaction by omitting the
   extension for redacted records.
4. Add matching optional TypeScript interfaces for `ProfessionalProfile` and
   `ProfessionalProfileReference`; do not add it to generic search or
   relationship endpoint types.
5. Run both focused tests and the Professional typecheck.
6. Commit: `feat(api): expose imported profile on person overview`.

### Task 3: Build the deterministic export importer

**Files:**
- Create: `scripts/lib/professional-people-import.mjs`
- Create: `scripts/import-professional-people.mjs`
- Test: `tests/unit/professional-people-import.test.js`
- Modify: `package.json`
- Add synthetic fixtures only: `tests/fixtures/professional-people-import/`

1. Write failing unit tests from synthetic CSV/Markdown fixtures covering:
   every observed People column, an arbitrary future column, blank values,
   invalid LinkedIn content, a normalised-name match, ambiguous/missing
   matches, Markdown body preservation, and deterministic output.
2. Run `node --test tests/unit/professional-people-import.test.js`; verify
   failure.
3. Implement pure helpers to parse quoted CSV, normalise/display-name match
   keys, project known fields, parse source-reference lists without inventing
   URLs, and generate a deterministic report.
4. Implement the CLI with required `--people`, `--csv`, `--pages-dir`, and
   `--out` paths, `--dry-run` as default, and `--write` required to alter the
   named output. It must retain untouched existing person objects and reject
   unmatched/ambiguous source rows in write mode.
5. Add optional `--zip` support using `bsdtar` into a temporary directory, so
   the supplied archive can be consumed even if one filename has malformed
   UTF-8. The CLI must clean up only its own explicit temporary directory.
6. Add `npm run import:professional-people --` as a transparent wrapper.
7. Run the unit test and a dry run against the supplied archive; capture only
   aggregate counts in terminal output, not profile contents.
8. Commit: `feat(import): add lossless professional people importer`.

### Task 4: Render contact facts and the Profile tab safely

**Files:**
- Create: `apps/professional/src/components/professional-profile.ts`
- Modify: `apps/professional/src/components/person-tabs.ts`
- Modify: `apps/professional/src/views/person-page.ts`
- Modify: `apps/professional/src/styles/hub.css`
- Test: `apps/professional/tests/unit/entity-detail.test.ts`

1. Add failing Vitest cases for:
   - contact actions, summary, current workplace, and last-contacted context
     in the rendered person view;
   - a Profile tab with summary, notes, references, original body, and a
     collapsed source-details disclosure;
   - no blank labels for absent fields;
   - a `javascript:` link rendered as text rather than an anchor;
   - source body that resembles HTML rendered as text, not live markup.
2. Run `npm --prefix apps/professional test -- entity-detail` and verify the
   new assertions fail.
3. Implement DOM-only rendering with `textContent`. Add source links only for
   validated `https:` URLs or verified internal `hub_href` values. Keep source
   details closed by default and preserve all property labels/values there.
4. Add compact token-based styles that fit the current entity-detail layout;
   do not change rail/mobile chrome or invent profile-specific palette tokens.
5. Update the existing tab-count tests from seven to eight and ensure the
   tab order is Overview → Profile → Timeline → Shared Work → Network →
   History → Observations → Evidence.
6. Run focused Vitest, `npm --prefix apps/professional run typecheck`, and
   `npm --prefix apps/professional run build`.
7. Commit: `feat(professional): render imported people profiles`.

### Task 5: Backfill private data and verify end to end

**Files:**
- Private only: `life-hub-data/data/professional/people.json`
- Private only: import report generated outside both repositories

1. Obtain an authenticated local checkout of `life-hub-data` without placing
   the private data in the public app repository.
2. Run the importer in dry-run mode against the supplied ZIP and current
   `people.json`. Review counts for all CSV records and all Markdown pages;
   resolve reported ambiguities through an explicit mapping file, never a
   guessed match.
3. Run the importer with `--write` to a branch-local output, inspect the
   JSON diff for identity preservation and profile coverage, then run the
   private repo's relevant validation.
4. Commit the private data change separately from public code.
5. Point the public function test harness at the updated file (or an
   equivalent fixture) and run:
   - `node --test tests/unit/github-professional-data.test.js
     tests/unit/entity-overview-github-merge.test.js
     tests/unit/professional-people-import.test.js`
   - `npm --prefix apps/professional test -- entity-detail`
   - `npm --prefix apps/professional run build`
   - `npm test`
6. Open representative populated profiles in the authenticated Professional
   Hub: one with contact links, one with Markdown/profile notes, and one
   identity-only person. Confirm links, source disclosure, and empty states.
7. Commit public verification/doc updates if needed. Do not push either repo
   without the user's instruction.

---

## Completion criteria

- Every People CSV property and all matched Markdown bodies are present in
  the private data import, including future/unknown columns.
- No profile view causes an extra browser API call or per-person GitHub read.
- Search/relationship projections do not leak rich profile fields.
- The Profile tab renders all imported content safely and does not create
  empty visual scaffolding for absent values.
- All focused tests, Professional build/typecheck, and the root suite pass.
