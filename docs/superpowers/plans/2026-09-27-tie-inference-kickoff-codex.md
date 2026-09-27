# Tie inference kick-off (for Codex): who knows whom, from everything in the hub

You're working in the `life-hub` repo. Read this whole file before starting.

## What you're doing

Network Ecology draws a line between two people only when there is a
`professional_relationship` link between them, and almost none exist. The
Notion People database had no person-to-person relations. The evidence of who
knows whom is spread across the hub: comms, meetings, events, threads,
promises, profile notes, applications, tasks and knowledge pages.

This is a **one-off kick-off run**. You:

1. **write deterministic code** that reads every source and builds one
   evidence file per candidate pair of people;
2. **read those evidence files yourself** and decide, pair by pair, whether
   the two people have a real professional tie and what kind. You are the
   classifier. No LLM API is called from code;
3. **write code that validates your verdicts** and produces a review sheet
   for Adam;
4. after Adam marks the sheet, **apply** it. Each accepted row becomes a
   confirmed `professional_relationship` link, and each declined row is
   recorded so it's never proposed again.

The code from steps 1 and 3 is reused later by a nightly job, which is a
separate Cursor build (`docs/professional-hub/network-ecology/TIE-INFERENCE-BRIEF.md`).
So put the pure logic in `netlify/functions/_shared/tie-inference/`, not in
`scripts/`.

## Rule zero: this repo is public, and the data is private

`adamrussell91-hash/life-hub` is public. The data contains colleagues,
parents and students (minors).

- **Everything you generate from real data goes in a working folder outside
  the repo**, default `~/ties-kickoff/`. That covers evidence files, verdicts,
  the review sheet and reports. Add `ties-kickoff*/` to `.gitignore` as a
  guard.
- **Never commit or paste real names, record text or quotes** into code,
  tests, fixtures, commit messages or PR text. Tests use invented people only
  ("Sam K.", "Ollie P.", "Ms Lee").
- **Keep terminal output to counts** unless Adam asks to see something.
- **Students are never a pair member**, and their names are replaced with
  `[student]` in every excerpt before you read it (see Step 1).
- Only the short excerpts in the evidence files are read for classification.
  Don't open full records to "get more context".

## Where things live

| Thing | Where | Code to use |
|---|---|---|
| People (Notion import, the canonical adults list) | private `life-hub-data` repo, `data/professional/people.json` | `github-professional-data.mjs`: `listGithubPersonCandidates` (adults only), `isImportedStudentPerson` |
| People (created in the hub, e.g. by the comms import) | Blobs `universal-link-content` | `people-collection.mjs` `loadAllPeopleWithRelationships` (merges both sets) |
| Self person | either | `career-overview.mjs` `findActiveSelfPerson` |
| Comms, meetings, events, threads | Blobs `professional-hub-content` | `communication-repository.mjs`, `meeting-repository.mjs`, `event-repository.mjs`, `thread-repository.mjs` |
| Record → person links | `universal-link-content` | `recipient`, `about_person`, `attendee`, `in_thread` (see `relationship-registry.mjs`) |
| Promises | People ledger | `ledger-repository.mjs` |
| Applications | Professional store | `application-repository.mjs` (`referee`, `application_contact` links) |
| Tasks and projects | tasks store | same reads as `runLinkInferencePass` in `link-proposal-service.mjs` |
| Knowledge pages | knowledge store | `knowledge-data.mjs` `listKnowledgePages` / `getKnowledgeContent` |
| Proposals (accept / decline) | `professional-hub-content` | `link-proposal-repository.mjs`, `link-proposal-service.mjs` `acceptLinkProposal` / `declineLinkProposal` |

**Opening stores from a local script:** copy `scripts/copy-hub-blobs.mjs`
(`getStore({ name, siteID: UMBRELLA_BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN })`).
Build each repository exactly the way its Netlify function does. Use
`createAccessContext({ workflow: 'professional' })` where one is needed.
Never print tokens.

## Step 0: preconditions and health (read-only)

Write `scripts/ties-kickoff.mjs` with subcommands. Start with
`node scripts/ties-kickoff.mjs health`. It prints counts only:
- people: adults, students excluded, self found (yes/no);
- records per source: comms, meetings, events, threads, promises, profiles
  with text, applications, tasks, projects and knowledge pages. Also how many
  have 2+ linked people;
- sources that couldn't be read, and why (missing token, missing store).

**Stop and tell Adam if:**
- **there is no self person;**
- **comms + meetings + events add up to fewer than 20.** That means the
  Notion Communications import
  (`docs/superpowers/plans/2026-09-27-calendar-comms-plan-5-notion-import-codex.md`)
  hasn't been applied yet. It should run first, because comms is the richest
  source.

## Step 1: who is a student

Comms-imported people are ordinary People with no student flag. Treat a
person as a **student** if any of these is true:
- `isImportedStudentPerson` says so (GitHub import);
- they are the named subject of a thread with kind `case`;
- their only records are case-management records.

`health` prints how many people each rule catches. Show Adam the count and 10
names **in the terminal only** before continuing, and ask him to confirm. If
he names people to add or remove, take them as a `--students-file` (one name
per line, kept in the working folder).

## Step 2: evidence (pure code, test-first)

`netlify/functions/_shared/tie-inference/`:

```
sources/*.mjs     one adapter per source → evidence items
candidates.mjs    evidence items → candidate pairs with merged evidence
excerpts.mjs      pick and cut excerpts; replace student names with [student]
verdict.mjs       validate a verdict (Step 4)
```

**Evidence item:** `{ people: [ref…], how, record_ref, date, text }`

| Source | `how` |
|---|---|
| Comms | `co_recipient` (both on one comm), `recipient_about` (a comm to A about B), `named` |
| Meetings / events | `co_attendee` (chair, presenter and facilitator roles noted), `named` |
| Threads | `co_thread` |
| Promises | `named` (e.g. "introduce A to B") |
| Profiles (`summary`, `body_markdown`, Notion `properties` text) | `profile_mentions` (A's profile names B) |
| Applications | `co_referee` |
| Tasks, projects, knowledge pages | `named` |
| Current `employee_at` / `member_of` | `shared_org`: **context only**, never a candidate on its own |

**Name matching:** use `nameMatches` from `link-inference-rules.mjs` (min 3
characters, display name and aliases). A name that matches 2+ roster people
is **ambiguous and ignored**. Count ambiguous names in the report.

**Candidates.** Remove self from every item. Every unordered pair of adults
in an item is one piece of evidence. Merge by pair across all sources. A pair
is a candidate when **any** of these is true:
- it appears in 2+ distinct records;
- both names are in one sentence of one record;
- one person's profile names the other.

**Skip** a pair when:
- a current `professional_relationship` link already exists between them;
- a proposal for the pair already exists (any status);
- either person is a student.

Records with **more than 12 people** add no pairs.

**Evidence file**, one per candidate, at `~/ties-kickoff/pairs/<nnnn>.json`
(numbered, strongest evidence first):

```json
{
  "pair_id": "0001",
  "a": { "ref": "…", "name": "…", "orgs": ["…"], "role": "…" },
  "b": { "ref": "…", "name": "…", "orgs": ["…"], "role": "…" },
  "summary": "4 meetings, 3 comms, 1 profile mention, same organisation",
  "first_date": "2025-02-10",
  "last_date": "2026-08-21",
  "excerpts": [
    { "record_ref": "professional:meeting:…", "source": "meeting", "date": "2026-08-21", "text": "…" }
  ]
}
```

Excerpt rules:
- at most **10** excerpts per pair, each ≤ 400 characters and centred on
  where the pair appears;
- at least one excerpt from every source the pair appears in, then the most
  recent;
- student names replaced with `[student]`.

`node scripts/ties-kickoff.mjs gather` writes these files. It also writes
`~/ties-kickoff/gather-report.md`, with counts only: pairs per rule, pairs by
number of sources, skipped pairs by reason, and ambiguous names.

## Step 3: classify (you, reading the files)

Work through the pair files in order, in chunks of about 25. For each one,
append one line to `~/ties-kickoff/verdicts.jsonl`:

```json
{"pair_id":"0001","tie":true,"role":"colleague","mentor":null,"valid_from":null,"reason":"In 6 department meetings together, Feb–Aug 2026","quotes":[{"record_ref":"professional:meeting:…","text":"exact text from the excerpt"}]}
```

**How to decide:**
- **`tie: true`** only when the excerpts show the two people dealt with each
  other directly. Examples: they worked on something together, one mentored
  or referred the other, one introduced the other, or they are discussed as
  collaborators. Also true when they repeatedly met in **small** groups (up to
  about 6 people).
- **`tie: false`** when they were only on the same distribution list or in
  the same large meeting, or when only a shared workplace links them. False
  is a normal answer, not a failure.
- **`role`** must be one of `colleague`, `former_colleague`, `mentor`,
  `mentee`, `academic_contact`, `research_collaborator`, `recruiter`,
  `referee`, `conference_contact`, `introduction`, `other`. Use `mentor` for
  a mentoring tie and set `mentor` to the ref of the person who mentors. If
  they share a current organisation and nothing is more specific, use
  `colleague`; otherwise, if unsure, use `other`.
- **`valid_from`** is a `YYYY-MM-DD` date **only when a quote states when the
  tie started with a full day, e.g. "started mentoring on 3 March 2025".
  "Since Term 1" or "last year" → `null`. Never the first record date, and
  never today.
- **`reason`** is ≤ 120 characters, reads like a sentence a person would
  write, and has no ids, scores or "confidence".
- **`quotes`** are 1–2 **exact** substrings of the excerpts you were given.
- If an excerpt suggests one of the pair is a student or a parent of a
  student, answer `tie: false` with reason `"not an adult professional contact"`.

Don't edit earlier lines. If you want to change a verdict, append a new line
for the same `pair_id`; the last one wins.

## Step 4: validate and build the review sheet (pure code, test-first)

`verdict.mjs` validates every verdict line against its pair file. It rejects:
- an unknown `pair_id`, or a missing or extra field;
- a role outside the list, or `mentor` set when the role isn't mentor or
  mentee;
- a quote that isn't an exact substring of that pair's excerpts;
- a `valid_from` that isn't a real date, or that is on or after the run date.

`node scripts/ties-kickoff.mjs review` prints how many verdicts passed and
how many were rejected (with reasons), and asks you to fix the rejected ones.
It then writes `~/ties-kickoff/review.csv`, one row per `tie: true` verdict,
strongest evidence first:

```
pair_id,person_a,person_b,role,reason,quote_1,quote_2,evidence,decision,role_override
```

`decision` and `role_override` are left blank for Adam. `evidence` is the
pair's `summary`.

Tell Adam how to fill it:
- `decision`: `y` (accept), `n` (decline), or blank (leave pending; it shows
  as a chip on the person's page);
- `role_override`: optional, one role from the list.

## Step 5: apply

First, a small repo change (with tests): add `'ties'` to
`LINK_PROPOSAL_PROPOSERS` in `link-proposal-schema.mjs`, and update the error
message in `validateLinkProposalCreateInput`. Commit this on its own. The
proposals won't parse without it, so the deployed app needs this change
before you run `--apply`. Tell Adam it has to be merged and deployed first.

`node scripts/ties-kickoff.mjs apply --review ~/ties-kickoff/review.csv`:
- **Previews by default:** prints counts of accept, decline and pending, plus
  role overrides. `--apply` writes.
- For every row, create a proposal through `proposalRepo.createProposal`:
  - `proposer: 'ties'`;
  - `proposed_link`: `professional_relationship`. Source and target are
    `a`/`b`, or mentor → mentee for mentoring ties;
  - `role`: the override if given, otherwise the verdict's role;
  - `valid_from` from the verdict;
  - `reason`, and `sources` = the quotes as `{ ref, excerpt }`;
  - `person_ref`: whichever of the two people has fewer existing links.
- Then act on the decision:
  - `y` → `acceptLinkProposal(id, deps)`, which writes the real Universal
    Link;
  - `n` → `declineLinkProposal(id, deps)`. The equivalence hash stops the
    same proposal coming back;
  - blank → leave it pending.
- **Safe to run twice:** `createProposal` dedupes on the equivalence hash.
  Skip rows whose proposal is already accepted or declined.
- Also write `~/ties-kickoff/declined-pairs.json` (the pair refs of every `n`
  row) and upload it to `professional-hub-content` at
  `_ties/declined-pairs.json`. The nightly job uses it to suppress declined
  pairs whatever the role.
- Print the final counts. Then fetch `/api/network-ecology/world` (or build
  it locally with `assembleWorldGraph`), and print person↔person edge counts
  and open-sea hermit counts **before and after**.

## Step 6: tests (invented data only)

`tests/unit/tie-inference-*.test.js`, `node:test`, with fixtures in
`tests/fixtures/tie-inference/`:
- each source adapter yields the right `how` and people. A missing store is
  reported as skipped and doesn't throw;
- candidates: merges one pair across sources; applies the 12-person cap;
  ignores ambiguous names; applies the same-sentence and profile rules;
  `shared_org` alone is not a candidate; skips existing links, existing
  proposals and students;
- excerpts: ≤ 10 per pair, ≤ 400 characters each, one per source; student
  names are replaced;
- verdict validation: each rejection rule above, plus the "last line wins"
  rule;
- apply: `y`, `n` and blank each do the right thing against in-memory
  repositories, and a second run changes nothing;
- the `'ties'` proposer parses and projects a chip label.

Run `npm run pre-pr-check` before pushing. Exit 0 is required.

## Step 7: run it with Adam

1. `health`: confirm the preconditions and the students list.
2. `gather`: report the pair count. **If it's over 600, ask Adam** whether to
   classify all of them or the strongest 600 first.
3. Classify (Step 3), then run `review` until nothing is rejected.
4. Adam fills in `review.csv`.
5. Merge and deploy the `'ties'` proposer change, then `apply`, then
   `apply --apply`.
6. Adam opens Network Ecology and checks that three accepted pairs he knows
   are joined by a line.

## Git

- Branch `codex/ties-kickoff` from fresh `main`, and open a PR into `main`.
- The PR description holds counts only: pairs, verdicts, accepted, declined,
  pending, and the before/after edge counts. No names.

## Out of scope

- The nightly job and the "Ties to confirm" view. Those are the Cursor build
  in `TIE-INFERENCE-BRIEF.md`, which reuses the `_shared/tie-inference/` code.
- Any LLM API call from code.
- Adam ↔ person ties (derived from his own comms for warmth and dormancy).
- Editing or deleting existing links, people or records.

## Done means

- `pre-pr-check` passes and the PR is open.
- The kick-off has been applied with Adam: accepted pairs are real links,
  declined pairs are recorded, and the before/after counts are in the PR.
- Nothing from real data is in the repo: `git grep` for three accepted names
  returns nothing.
