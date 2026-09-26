# Network Ecology: data fix brief

## Outcome

The Professional Hub's people data should describe Adam's real network:
- every person is linked to the organisations they work at;
- every real person-to-person relationship recorded in Notion is a link;
- every person's last contact is a real date.

Today almost none of that reaches Network Ecology, so World View shows two
unconnected dots.

Cursor has access to Adam's Notion. It reads the People and Organisations
databases directly and writes the missing structure into the private
`life-hub-data` repository, through a pull request Adam reviews.

This brief is **data only**, plus the two small app fixes that let Adam see the
result. The new miniworld view is a separate plan (`BUILD-PLAN.md`), which
depends on this one.

**Acceptance case (run live on real data, D3/P3):**

> Adam opens Professional → Network Ecology → World View. Instead of two dots
> he sees the whole network fitted into the frame: organisation diamonds with
> their people around them, habitat halos on the organisation clusters, and
> unlinked people at the edges. He clicks a person he knows works at a school
> in Notion. The panel shows the person, and that school's diamond is joined to
> them by a line. He opens that person's profile: the organisation appears as a
> linked relationship, not only as text in the Profile tab.

## What is actually wrong

This was diagnosed from the code, not the live data. Phase 0 confirms each
point with real numbers before anything is changed.

1. **Most people have no organisation link.**
   - The bridge (`netlify/functions/_shared/github-professional-data.mjs`) reads
     `people.json`, `organisations.json` and `relationships.json` from
     `life-hub-data/data/professional/`. That is 350 people, 18 organisations
     and 74 relationships.
   - The later People import (`scripts/lib/professional-people-import.mjs`)
     stores Notion's **Current Workplace** only as text in
     `professional_profile.current_workplace`. By design it never creates
     links. The import spec lists "Inventing Universal Links where the export
     contains only a label" as a non-goal.
   - So roughly 280 people have no link at all, and Network Ecology only draws
     links.
2. **There are no person-to-person links.** `normalizeRelationships` in the
   bridge keeps only `employee_at` and `member_of` rows and drops everything
   else. Habitats such as Forest (dense and close-knit) depend on people being
   linked to each other.
3. **"Last Contacted" is free text.** `profile.last_contacted` holds whatever
   the export said. Dormancy (who has gone quiet) needs a real date.
4. **The graph pushes almost everyone off screen.**
   `apps/professional/src/components/network-graph-canvas.ts` draws into a
   fixed canvas with no zoom or fit. A charge of −520 and a centring pull of
   0.05 spread about 368 nodes over roughly 3,800 × 3,800 px.
   - A headless run of that same force setup with 350 people, 18 organisations
     and 74 links left **22 of 368 nodes** inside a 1170 × 664 frame after 300
     ticks.
   - This is why the page shows two dots even though the API returns hundreds.
5. **An empty white box shows on the right** (V1). `.network-ecology__panel`
   has `display: flex`, which beats the `hidden` attribute, so the empty
   selected-node panel is always visible.
6. **Possibly no self person.** "Your Network" needs exactly one person
   marked `is_self: true`. Phase 0 checks this.

## Phase 0: health report (read-only; do this first)

Add `scripts/professional-network-health.mjs`. It takes
`--data-dir <life-hub-data/data/professional>` and prints a JSON report. It
never writes anything.

The report contains:
- counts of people, organisations and relationships, by `relationship_type`;
- people with zero relationships (count, plus the first 20 display names);
- people with `professional_profile.current_workplace` text but no current
  `employee_at`/`member_of` link (count, plus the distinct workplace strings
  with how many people use each);
- workplace strings that exactly match an existing organisation's
  `display_name` or alias (normalised with the same `nameKey` rule as the
  People import), and those that match none;
- relationship rows the bridge would drop, and why (unknown type, unknown
  `legacy_id`, bad date);
- the `is_self` count, and the name if there is exactly one;
- `last_contacted`: how many are empty, how many parse as a date, and how many
  are unparseable (with 10 examples).

Unit-test the report builder with a small fixture (`tests/unit/`). Run it
against Adam's local `life-hub-data` checkout and paste the output into the PR
description. **Never commit private data or its output to this repo.**

## Phase 1: read Notion and build the change set

Use the Notion connector to read the **People** database and whatever
database **Current Workplace** points to (normally an Organisations
database). For each person, collect:
- the Notion page id;
- the title;
- **Current Workplace** as page ids when it is a relation, or as text when it
  isn't;
- any role or position property;
- any start date;
- **Last Contacted** as a date;
- **every other relation property that points at other People pages**
  (colleague, mentor, introduced by, and so on). List these property names in
  the PR before importing them.

Match each Notion person to an existing `people.json` row:
1. First, find out what `legacy_id` holds in `people.json` today. If it is the
   Notion page id, match on it exactly.
2. Otherwise match on the normalised name, as `findCandidates` does in the
   People import. Zero or several candidates means the row is **reported, not
   guessed**.
3. **Never change an existing `legacy_id`.** Person and organisation URLs, and
   every link id, are derived from it.

Build the change set, as files written to a scratch folder outside both repos:
- **Organisations:**
  - Every Notion organisation page that someone's Current Workplace points to
    becomes an `organisations.json` row, unless one already exists (matched by
    the same rules).
  - New rows use the Notion page id as `legacy_id`.
  - Workplace values that are only text, with no Notion relation, are **not**
    turned into organisations automatically. They go into
    `unmatched-workplaces.md` as a table (text, how many people, suggested
    existing organisation if any) for Adam to answer.
- **Employment links:** one `employee_at` row per (person, organisation) from
  Current Workplace:
  - `role` from Notion if present, otherwise `null`;
  - `valid_from` from a Notion start date if present, otherwise `null`. Never
    today and never the import date (D1).
  - Skip any row that already exists, so a re-run adds nothing new.
- **Person-to-person links:** one `professional_relationship` row per pair
  from the relation properties Adam confirms, stored as `person_legacy_id` +
  `other_person_legacy_id`. Keep one row per pair. If Notion has no such
  properties, create none; do not infer colleagues from a shared workplace.
- **Last contacted:** set `professional_profile.last_contacted` to
  `YYYY-MM-DD` from the Notion date. Leave
  `source.properties["Last Contacted"]` exactly as it was.
- **Self:** if no row has `is_self: true`, ask Adam which person is him. Do not
  pick one.

Print a report: rows matched, unmatched, ambiguous, organisations added, links
added by type, last-contacted dates set, and self status.

## Phase 2: write to `life-hub-data` through a pull request

- Open a branch and PR in `adamrussell91-hash/life-hub-data`. Never push to its
  main branch.
- The PR description holds the Phase 1 report, `unmatched-workplaces.md`, and
  the before and after health reports.
- Keep JSON key order and 2-space formatting identical to the existing files,
  so the diff shows only real changes.
- Stop and wait for Adam to merge. Once he answers `unmatched-workplaces.md`,
  a second commit on the same PR can add those organisations and links.

## Phase 3: app-side fixes (this repo, one PR)

1. **Bridge accepts person-to-person links.** Extend `normalizeRelationships`
   in `github-professional-data.mjs`:
   - Accept `relationship_type: 'professional_relationship'` rows with
     `person_legacy_id` + `other_person_legacy_id`.
   - Both ids must resolve to people, and the dates follow the same checks as
     today.
   - Emit a person → person link, indexed under **both** people:
     `outgoing` for the first, `incoming` for the second.
   - Derive the link id from both legacy ids in sorted order, plus type,
     `valid_from` and role, so it stays stable.
   - Tests: accepted pair; unknown person dropped; the same pair written in
     reverse order dedupes to one link id; `employee_at` behaviour unchanged.
2. **Graph fits the frame.**
   - In `network-graph-canvas.ts`, once the simulation settles (and after the
     synchronous settle under reduced motion), compute the bounds of all nodes
     and scale and translate the drawing so everything fits with a 24px margin.
   - Apply the same transform in hit-testing (`handlePointer` → `findNodeAt`).
   - Test: with 300 nodes spread over ±2000px, every node's transformed
     position is inside the canvas, and a click at a transformed node position
     selects that node.
   - This is a stopgap until the miniworld replaces the canvas.
3. **Panel hides properly (V1).** Add
   `.network-ecology__panel[hidden] { display: none; }` in `hub.css`.
   Check: with no selection, `offsetHeight === 0`.

Run `npm test` (or the repo's usual full check) before pushing.

## Out of scope

- The miniworld renderer, habitats, open sea and sandbanks (`BUILD-PLAN.md`).
- Changing habitat thresholds in `habitat-classification.mjs`.
- Live Notion sync. This is a one-off pull that can be re-run.
- Derived "shared context" links (same meeting, same event).

## Failure modes to check (from `docs/CURSOR-UI-FAILURES.md`)

- **D1 Made-up precision:** a missing start date stays `null`, never today.
  Check: grep the new relationship rows for today's date; none.
- **D3 Screenshots on demo data:** acceptance uses the live umbrella after the
  `life-hub-data` PR is merged. Check: the screenshot names a real person and
  a real school.
- **D4 Mapping tables that miss real values:** workplace matching is tested on
  the **real** distinct workplace strings from the Phase 0 report, not invented
  ones. Check: every string is in the matched table or
  `unmatched-workplaces.md`.
- **V1 `[hidden]` doesn't hide:** the panel fix above.
- **W2 Works in tests, not in production:** at least one test goes through
  `createNetworkEcologyWorldHandler` with a stubbed GitHub fetch returning a
  person-to-person row, and asserts the edge is in the response.
- **P2 Stale base:** branch from fresh `main`. The PR touches only the bridge,
  the canvas, `hub.css`, the new script and their tests.
- **P3 Silent half-fixes:** the acceptance case above, run live. "Tests pass"
  is not done.
