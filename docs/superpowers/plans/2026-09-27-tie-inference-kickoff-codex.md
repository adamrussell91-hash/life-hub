# Tie inference kick-off (for Codex): who knows whom

Keep this simple. You're reading JSON and writing JSON, all inside the private
repo `adamrussell91-hash/life-hub-data`. **No Netlify, and no changes to the
public `life-hub` repo.**

## Goal

Network Ecology draws a line between two people when `relationships.json` has
a `professional_relationship` row for them. There are almost none. Use Adam's
comms to find which people really work together, let Adam confirm them, and
add the confirmed ones as rows.

## Inputs (from `life-hub-data` `main`, under `data/professional/`)

- `people.json`: people. Skip anyone with
  `original_category === "Student (Communications database)"` (students) and
  the person with `is_self: true` (Adam).
- `relationships.json`: existing links. Look at an existing row to see its
  exact fields and key order.
- `communications.json`: Adam's 632 Notion comms, with `attendees[].person_legacy_id`
  and `body`.

Work in a scratch folder **outside any repo**: `~/ties-kickoff/`. Any helper
script you write lives there too. Don't commit it.

## Step 1: find candidate pairs (script)

For each comm, the people on it are the attendees with a `person_legacy_id`
(adults only, not Adam). Also count an adult whose `display_name` appears
in the comm's `body`. Skip names shorter than 3 characters and names that
match more than one person.

- Ignore comms with more than 12 such people (all-staff emails and the like).
- A pair is a **candidate** if they're together on 2+ comms, **or** both are
  named in the same sentence of one comm.
- Skip pairs that already have a `professional_relationship` row, in either
  order.

For each candidate, save `~/ties-kickoff/pairs/NNNN.json` (strongest first):
both names and legacy ids, the number of shared comms, first and last date,
and up to 8 short snippets (≤ 300 characters each) showing them together.
Replace any student name in a snippet with `[student]`.

Tell Adam the number of candidate pairs. **If it's over 600, ask him** whether
to do all of them or the top 600.

## Step 2: decide each pair (you)

Read each pair file and decide:

- **tie: yes** if the snippets show they actually work together: co-teaching,
  same small team or committee, mentoring, one referring or introducing the
  other, or repeatedly in small meetings (about 6 people or fewer).
- **tie: no** if they were only on the same big meeting or email list. No is a
  normal answer.
- **role**: one of `colleague`, `former_colleague`, `mentor`, `mentee`,
  `academic_contact`, `research_collaborator`, `recruiter`, `referee`,
  `conference_contact`, `introduction`, `other`. When in doubt, use
  `colleague`. For mentoring, note which person is the mentor.
- **reason**: one plain sentence, ≤ 120 characters. For example, "In 6
  curriculum meetings together, Feb–Aug 2026".

## Step 3: Adam confirms

Write `~/ties-kickoff/review.csv` with only the **yes** pairs, strongest
first:

```
pair,person_a,person_b,role,reason,decision
```

Leave `decision` blank, and tell Adam where the file is. He marks each row
`y` or `n`, and can change `role`. Wait for him.

## Step 4: write the confirmed ties

On a new branch in `life-hub-data`:

- **Each `y` row:** append one row to `data/professional/relationships.json`
  with the **same fields and key order as the existing rows**, and:
  - `relationship_type: "professional_relationship"`;
  - `person_legacy_id`: A (or the mentor, for mentoring ties);
  - `other_person_legacy_id`: B (or the mentee);
  - `role`: the role Adam kept or chose;
  - `valid_from: null`, `valid_to: null`. Never use today's date.

  Skip a pair that already has a row.
- **Each `n` row:** add `{ person_legacy_id, other_person_legacy_id }` to
  `data/professional/declined-ties.json` (create it if it doesn't exist), so
  the pair isn't suggested again.
- Keep 2-space JSON and the existing formatting, so the diff only shows new
  rows.
- Open a PR. The PR text is **counts only**: candidates, yes/no from Step 2,
  and Adam's y/n.

After Adam merges it, the rows show in Ecology automatically. The app already
reads `professional_relationship` rows from `relationships.json`.

## Don't

- Don't write to Netlify or change the public `life-hub` repo.
- Don't create, edit or delete people.
- Don't put names, snippets or comm text in the PR description or commit
  messages.
