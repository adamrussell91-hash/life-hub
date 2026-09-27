# Network Ecology: tie inference agent brief

## Outcome

Ecology should show who Adam's people actually know, not just where they work.

The Notion People database has no People→People relations. Communications
does link people to records (recipients, people a comm is about, meeting and
event attendees), but nothing anywhere says outright "A knows B". Ties have to
be **inferred** from everything the hub holds, and a person confirms each one
before it becomes a link.

This brief builds one **tie inference agent** that runs two ways:

1. **Kick-off run (one-off, holistic):** a local CLI reads **every source**
   (see "Sources" below). It builds one evidence file per pair of people, and
   classifies each candidate pair once, using all of that pair's evidence
   together. It fills the proposal queue.
2. **Update automation (nightly):** a scheduled function re-reads the sources,
   classifies only pairs that are new or have new evidence, and adds or
   refreshes proposals.

Both runs use the same pure code. Inferred ties are never written as links
directly. They go into the **link proposal queue that already exists**
(`link-proposal-*.mjs`, `/api/people/link-proposals`). Adam accepts or
declines each one, and accepting writes a real `professional_relationship`
Universal Link. Ecology already draws that link type
(`network-graph.mjs` `TRAVERSABLE_LINK_TYPES`), so nothing in the renderer has
to change for confirmed ties to appear.

**Acceptance case (live, real data; D3, P3):**

> Adam opens Professional → People → **Ties to confirm**. He sees a list
> ranked by evidence. The top row reads, for example, "Colleague? · Sam and
> Ollie were in 6 meetings together, Feb–Aug 2026", with two quoted lines
> and links to the meetings. He presses Accept on 10 rows and Decline on 2.
> He opens Network Ecology → World View: those 10 people pairs are joined by
> lines, and at least one person who was an open-sea hermit is now on an
> island. He runs the nightly function by hand: the 2 declined pairs are not
> proposed again.

## Dependencies

- **The Communications import (Plan 5) is the richest source.** The kick-off
  run works on whatever is in the hub when it runs. If Phase 0 shows few
  comms, meetings or events, run Plan 5 first. Rerunning the kick-off later is
  safe and only adds what's new.
- An active self person (`is_self: true`). `runLinkInferencePass` already
  refuses to run without one; this agent does the same.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Proposal record, dedupe hash, accept/decline | `netlify/functions/_shared/link-proposal-schema.mjs`, `link-proposal-repository.mjs`, `link-proposal-service.mjs` |
| Proposal API + client | `netlify/functions/people-link-proposals.mjs`, `apps/professional/src/api/people-directory.ts` |
| Deterministic rules (name in task/project/event text, shared employer) | `netlify/functions/_shared/link-inference-rules.mjs` |
| Allowed roles for `professional_relationship` | `relationship-registry.mjs`: `colleague`, `former_colleague`, `mentor`, `mentee`, `academic_contact`, `research_collaborator`, `recruiter`, `referee`, `conference_contact`, `introduction`, `other` |
| Record → person links | `recipient`, `about_person` (comms), `attendee` (meetings and events) in `universal-link-content` |
| Adults-only people list (students excluded) | `listGithubPersonCandidates` via `loadAllPeopleWithRelationships` |
| Scheduled function pattern | `netlify/functions/people-remember-tick-scheduled.mjs` |
| Claude client | `netlify/functions/_shared/anthropic-client.mjs` |

## Design

### Sources

Each source adapter lives in `scripts/lib/tie-inference/sources/` and is pure
over the records it's given. Each one yields **evidence items**:
`{ people: [ref…], how, record_ref, date, text }`. Here `text` is the passage
where the people appear, and `how` names the pattern.

| Source | Store / module | Evidence it yields (`how`) |
|---|---|---|
| Comms | `communication-repository.mjs` + `recipient` / `about_person` links | `co_recipient` (both people on one comm), `recipient_about` (a comm to A about B), `named` (a roster name in the subject or body) |
| Meetings | `meeting-repository.mjs` + `attendee` links | `co_attendee`, `named` (in purpose, blocks or decisions) |
| Events | `event-repository.mjs` + `attendee` links | `co_attendee` (presenters and facilitators count double), `named` |
| Threads | `thread-repository.mjs` + `in_thread` links | `co_thread` (both people linked to comms in one thread) |
| Promises (People ledger) | `ledger-repository.mjs` | `named` (a promise to A that names B, e.g. "introduce A to B") |
| Person profiles | GitHub People (`professional_profile.summary`, `body_markdown`, Notion `properties`) | `profile_mentions`: A's profile names B. One mention is enough to make a candidate. This is where "met through Sam" or "Ollie's mentor" usually sits |
| Organisations | existing `employee_at` / `member_of` links | `shared_org` (with role text). **Context only:** it helps pick a role but never creates a candidate on its own |
| Applications | `application-repository.mjs` `referee` / `application_contact` links | `co_referee` (both are contacts on one application) |
| Tasks and projects | tasks store (same reads as `runLinkInferencePass`) | `named` (both people named in one task or project) |
| Knowledge pages | `knowledge-data.mjs` | `named` (both named in one page) |

"Named" uses the same name and alias rules as `link-inference-rules.mjs`
(`nameMatches`, min 3 characters). A name that matches more than one roster
person is **ambiguous and ignored**, not guessed. Adapters that fail (missing
store, missing token) are listed in the report as skipped, and the run
continues with the rest.

### Stage 1: candidate pairs (deterministic, no AI)

`scripts/lib/tie-inference/candidates.mjs` (pure). Input: every evidence item
from every source, plus the visible people roster (ref, display name,
aliases, current organisations and roles).

Adam's own ref (self) is removed from each item's people. Every unordered pair
in an item is one piece of evidence. Aggregate by pair **across all
sources**:

```
{ pair: [refA, refB] (sorted), records: [{ ref, kind, date, how }], count,
  first_date, last_date, shared_org_refs }
```

A pair becomes a **candidate** when **any** of these is true:
- `count >= 2` distinct records, from any mix of sources;
- one record names both people in the **same sentence**. This catches "Sam
  introduced me to Ollie";
- one person's profile names the other (`profile_mentions`).

`shared_org` alone never makes a candidate: that is the workplace link Ecology
already draws.

Skip a pair if:
- either person isn't in the visible roster (so students are excluded, as
  Ecology already does);
- a current `professional_relationship` link already exists between them, in
  either direction;
- a proposal for the pair was **declined**, whatever its role. Store declined
  pairs in `_ties/declined-pairs.json` so a new role guess can't re-propose
  them. Re-propose only if the evidence count has at least tripled since the
  decline.

Records with more than **12** people present, such as all-staff emails and
whole-school events, add no pairs. They say nothing about who knows whom. The
cap is a named constant.

### Stage 2: classify each candidate (AI)

`scripts/lib/tie-inference/classify.mjs`. One Claude call per candidate pair,
using `anthropic-client.mjs` and its default model. The prompt holds:
- the two people's names, roles and current organisations;
- a one-line evidence summary by source, e.g. "4 meetings, 3 comms, 1 profile
  mention, same organisation";
- up to **10** evidence excerpts, each ≤ 400 characters and centred on where
  the pair appears, each tagged with its source and date. Pick at least one
  from every source the pair appears in, then fill with the most recent;
- the allowed role list above.

The call returns strict JSON, which is validated before use:

```json
{
  "tie": true,
  "role": "colleague",
  "direction": null,
  "confidence": "high",
  "valid_from": null,
  "reason": "In 6 department meetings together, Feb–Aug 2026, and Ollie's profile names Sam as his mentor",
  "quotes": [{ "record_ref": "professional:meeting:…", "text": "…" }]
}
```

Rules the prompt and the validator both enforce:
- `tie: false` when the only evidence is being on the same list of recipients
  or attendees, with nothing that shows the two dealt with each other. This
  outcome is recorded (see state below) and **no proposal is made**.
- `role` must come from the allowed list. If unsure, use `colleague` when
  they share a current organisation, otherwise `other`.
- `direction` is only for `mentor`/`mentee`: which person is the mentor.
- `valid_from` is a date **only if a quote states when they started working
  together**. Otherwise it is `null`. Never the first record date, and never
  today (D1).
- Every quote must be an exact substring of the excerpt it cites. The
  validator drops quotes that aren't, and drops the whole result if no quotes
  are left.
- `reason` is ≤ 120 characters and reads like a sentence a person would
  write. No ids, no confidence words (D5).

### Stage 3: write proposals

For each `tie: true` result, call `proposalRepo.createProposal` with:
- `proposer: 'ties'`. Add `'ties'` to `LINK_PROPOSAL_PROPOSERS` and update the
  error message in `validateLinkProposalCreateInput`.
- `proposed_link`: `professional_relationship`, source and target from the
  sorted pair (or mentor → mentee), `role`, `valid_from`.
- `reason`: from the model.
- `sources`: the validated quotes as `{ ref, excerpt }`.
- `person_ref`: the pair member with fewer existing links, so the proposal
  shows on the less-connected person's page first.

If the pair already has a **pending** proposal, update its `reason` and
`sources` instead of adding a second one. Pending proposals never pile up per
pair.

### Run state

Stored in the `professional-hub-content` store:
- `_ties/state.json`: `{ last_run_at, watermark, pairs: { "<refA>|<refB>": {
  count, last_classified_count, last_result: 'tie'|'no_tie'|'error',
  classified_at } } }`
- `_ties/declined-pairs.json`: as above.

A pair is re-classified only when its evidence count has grown by at least 2,
or 50%, since `last_classified_count`. This keeps nightly runs cheap. The
kick-off and the nightly run both read and write this same state.

## Phase 0: health report (read-only; do first)

`scripts/tie-inference-health.mjs` prints, without writing anything:
- counts of comms, meetings and events, and how many have ≥ 2 linked people;
- how many roster names are found in record bodies, and how many name matches
  were ambiguous (with the ambiguous names only, never record text);
- evidence items per source, and which adapters were skipped and why;
- the number of candidate pairs at each rule, and how many pairs draw on 1, 2
  or 3+ sources;
- how many would be skipped (already linked, declined, record too large);
- whether a proposal accepted for a GitHub-imported person (derived id)
  resolves on both people's pages. **If it doesn't, stop and report it.** Every
  confirmed tie depends on this.

Paste the output (counts only) into the PR.

## Phase 1: kick-off CLI

`scripts/infer-ties.mjs`:
- **Previews by default:** runs stages 1 and 2 and prints a report, but writes
  no proposals. `--apply` writes them.
- `--limit N` caps the Claude calls (default 400). Pairs are classified
  strongest evidence first, so a capped run still covers the best pairs.
- `--sources comms,meetings,…` limits the adapters (default: all). `--since YYYY-MM-DD`
  limits records by date.
- Opens the stores the way `scripts/copy-hub-blobs.mjs` does. Never prints the
  token.
- The report goes to `os.tmpdir()` or a `--report` path outside the repo. It
  holds counts, pair names, reasons and record refs. It **never holds record
  text**.
- Safe to run twice: the second run with no new records makes no Claude calls
  and no new proposals.

## Phase 2: nightly maintenance

`netlify/functions/ties-infer-tick-scheduled.mjs`, `schedule: '20 3 * * *'`
(UTC ≈ 13:20–14:20 Sydney time; off the hour):
- every source adapter, then stage 1 over **all** evidence (it's cheap), then
  stage 2 only for new pairs and pairs whose evidence grew, capped at **40**
  Claude calls per run;
- writes proposals, updates state, and returns `{ candidates, classified,
  proposed, updated, skipped }`;
- when a proposal is **declined** through the existing API, it also appends
  the pair to `_ties/declined-pairs.json`. Hook this in `declineLinkProposal`
  when `proposer === 'ties'`.

## Phase 3: review surface

Proposals already show as chips on person pages. That doesn't work for a
kick-off run of hundreds, so add a **Ties to confirm** view on People:
- a list of pending `proposer: 'ties'` proposals, sorted by evidence count
  (descending), then last record date;
- each row: both names (linked), the proposed role as an editable select, the
  reason, up to 2 quotes each linked to its record, and **Accept** /
  **Decline**. Pressing `a` / `d` acts on the focused row;
- changing the role before accepting accepts the proposal with that role.
  Extend `acceptLinkProposal` to take an optional `role` override, validated
  against the registry;
- the list updates in place after each action. The header count and the list
  come from the same response (V4);
- when nothing is pending, the empty state says "No ties waiting." No
  mention of the agent or future runs (P4).

## Tests (node:test, invented people only)

Use invented fixtures only ("Sam K.", "Ollie P.", "Ms Lee").
- each source adapter: yields the right `how` and people from a tiny fixture.
  A missing store is reported as skipped and doesn't throw.
- `candidates`: merges one pair's evidence across sources into one entry;
  ignores records over the cap; ignores ambiguous names; applies the
  same-sentence and profile-mention rules; `shared_org` alone is not a
  candidate; skips linked, declined and student pairs.
- `classify` validator: rejects roles outside the list; drops quotes that
  aren't exact substrings; `valid_from` is null unless a quote states it.
  Stub Claude.
- Proposal write: a second run updates the pending proposal and doesn't add a
  new one. A decline stops re-proposal until the evidence triples.
- Scheduled handler: it goes through the real handler entry point (W2) with
  stubbed stores and Claude, and respects the 40-call cap.
- Review view: accepting with a changed role writes that role. The count
  matches the list length.

Run `npm run pre-pr-check` before pushing.

## Privacy rules

- Record text goes to Claude only as the short excerpts described above. It
  is never logged, committed, written to a report, or put in a PR.
- Students never appear as a pair member (roster filter). A record that
  mentions a student can still be evidence for two adults, but the excerpt
  sent to Claude replaces every roster-excluded name with "[student]".
- Test fixtures and PR text use invented people only.

## Out of scope

- Writing links without Adam's confirmation. The only automatic outcome is a
  proposal.
- Adam ↔ person ties. Those are derived from his comms and meetings for
  warmth and dormancy, which is a separate change.
- Gmail, Google Calendar and LinkedIn sources outside the hub stores. Each
  could be added later as another source adapter.
- Changing habitat thresholds or the Ecology renderer.

## Failure modes to check (`docs/CURSOR-UI-FAILURES.md`)

- **D1 Made-up precision:** check that no accepted link has `valid_from` equal
  to the run date or the first record date unless a quote states it (fixture
  test).
- **D3 Screenshots on demo data:** the acceptance case runs on the live
  umbrella after the kick-off `--apply`. The screenshot names a real pair.
- **D5 Ugly derived text:** read 20 real `reason` strings aloud in the PR
  (names redacted to initials). None contains an id, a score, or "confidence".
- **D6 Partial input:** the evidence count in a row matches the number of
  records the pair appears in, including named mentions. Test it against
  `candidates` for the same fixture.
- **V1 `[hidden]`:** the empty state and the list toggle with
  `[hidden]{display:none}`. Check `offsetHeight === 0`.
- **V4 Parts disagree:** the header count equals the number of rows after
  every accept or decline.
- **W1 / W2 Wiring:** the review view uses `apiGet`/`apiPost`. One test goes
  through the real scheduled handler.
- **P3 Silent half-fix:** run the acceptance case live and paste the
  before/after hermit count from `/api/network-ecology/world`.
- **P4 Roadmap talk:** `grep -rnE "Phase [0-9]|arrives in|coming soon"` over the
  new view strings returns nothing.
- **P5 Partial build:** phases 0–3 ship in one PR, or the title says `PARTIAL`.
