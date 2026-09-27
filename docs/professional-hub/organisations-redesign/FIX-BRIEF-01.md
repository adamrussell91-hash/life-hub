# Organisations: fix brief 01 (Phase 1 defects, then finish the build)

Written 27/09/26 after Adam opened the live umbrella and found the Organisations
build broken. Diagnosed from the live screenshots (desktop, St. Aloysius wall and
page) and the code on `main` after
[PR 508](https://github.com/adamrussell91-hash/life-hub/pull/508).

## What went wrong in the process

- `BUILD-PLAN.md` said **one PR, marked ready only once every phase in scope is
  ticked**. PR 508 was marked ready and merged with **only Phase 1** done. In
  `PROGRESS.md`, Phases 2, 3, 4, 5 and 7 still say "Pending" (P5).
- `PROGRESS.md` ticks C1, C2, D4 and P3. On real data, C1 and C2 fail on
  every tile, and the P3 acceptance case (St. Aloysius) fails. The checks were
  named, not run (P1).
- The mockup diff lists only "kit surfaces, no Compare, opportunities empty host,
  mock seed". It doesn't mention that the tile chart and the timeline look
  nothing like `01-crest-wall.png` and `02-organisation.png` (P1).

## Scope and delivery

This is **one PR**: `cursor/organisations-fix-01`, branched from fresh `main` (P2).
Open it as a draft once and push everything to it. Mark it ready once, when both parts
are ticked.

- **Part A: Phase 1 repair.** Commits titled `fix(orgs): Phase 1R — …`.
  Everything in the defect list below.
- **Part B: finish the build.** `BUILD-PLAN.md` Phases 2 → 3 → 4 → 5 → 7, as
  written there, on the same branch. Phases 6 and 8 are still out (People PRs).

Don't open a separate PR for Part B, and don't split Part A into fix PRs.

## Acceptance case (run live, D3 / P3)

> Adam opens Organisations.
> - The St. Aloysius tile's small chart is a line on a 2019→now axis that steps
>   up when he actually got to know people there. It has no number labels.
> - The tile's warmth bar shows warm and cooling people in colour.
> - Trinity's tile chart has a different shape from St. Aloysius's.
>
> He opens St. Aloysius.
> - His current role is a **bar from 2025 to now**, labelled clear of every other
>   label.
> - The people line rises behind the lanes, and no dot stack sits on "now".
> - Every button on the page does something.
> - No text anywhere mentions a phase or something that "arrives" or "is built"
>   later.
>
> After Part B, the St. Aloysius scenario in `BUILD-PLAN.md` → Outcome also holds.

## Phase 0: confirm with real numbers before changing code

Write the answers into `PROGRESS.md` under a new `## Fix 01: Phase 0` heading.

1. For St. Aloysius and Trinity, list every person's `first_link_at` as the
   directory builds it (`organisations-directory.mjs`), and which field it came
   from: `valid_from`, `occurred_at` or `created_at`. If most come from
   `created_at`, they're import timestamps, not "when Adam got to know them".
2. Give the warmth band counts (warm / cooling / cold) for St. Aloysius, as the
   directory computes them today and as `warmthFor()` computes them on the People
   page for the same people. If they differ, that's defect A2.
3. Count the links of each relationship type across all 112 organisations:
   `employee_at`, `member_of`, `venue`, `provider`, `applies_to`, `presenter`,
   `studied_at` and `placement_at`. Then explain the chip counts on the wall:
   Events & PD 0, Study & placement 0, Prospects 0.
4. List Adam's own links to St. Aloysius, each with its role text,
   `valid_from` and `valid_to`.

## Part A: defects

Each item names the register IDs that apply. Tick an item only once its **Check**
has been run and its screenshot sits next to the mockup (P1).

### A1. Tile chart plots by list position, not by date (C5, C1, C2, D1)

**Seen.**
- Every tile draws the same straight diagonal. St. Aloysius has 56 overlapping
  number labels ("1 2 3 … 56").

**Cause.**
- `views/organisations.ts:215` reuses People's `renderRelationshipArcSvg`.
- `domain/relationship-arc.ts:51` places each point's x **and** y by its
  position in the list, and every point carries a label.
- `organisations-directory.mjs:299` sets each label to the running count.

**Fix.**
- Build a separate `renderOrganisationSparkSvg`. Don't bend the People arc,
  because People uses it correctly for its own purpose.
  - x = `first_link_at` on a **shared 2019→now scale**, the same scale on every
    tile (BUILD-PLAN 1.3).
  - y = cumulative count, drawn as a **step** line.
  - Axis labels "2019" and "now" only. No per-point labels, and no dots except
    the last point.
  - Add the mockup's small marks for events and Adam's own work periods if the
    data exists. Otherwise leave them out; don't fake them.
- Delete `label` from `arc_points`, or stop sending it.
- A `created_at` import timestamp is **not** a first-link date (D1). Use
  `valid_from` or `occurred_at`, then the earliest meeting, event or comm with
  that person at this organisation. Never use the import time. Leave a person
  with no real date out of the line, and state the count in the tile's
  `aria-label` ("12 people with no known start").

**Check.**
- Unit test: two organisations whose people have different dates produce
  different `path` d-strings.
- Unit test: the x of a point dated 01/01/2023 equals the same x on another tile.
- A `getBBox` test at 390 and 1440 finds no text node inside the spark except
  the two axis labels.
- A live screenshot of St. Aloysius and Trinity tiles sits beside
  `01-crest-wall.png`.

### A2. Warmth bar is all grey; everyone is "cold" (D6, V4)

**Seen.**
- Every tile's bar is a same-width grey pill. The mockup shows warm (orange) and
  cooling (blue) segments.

**Cause.**
- `organisations-directory.mjs` (~line 253) calls `warmthFor()` with
  `touchpoints` built from **only the single person→organisation link**, and
  `timeline: []`.
- Meetings, comms and events never reach it, so nearly everyone is banded cold.
- This is a second warmth computation that disagrees with People's.

**Fix.**
- Warmth comes from the **same source People uses** for that person (V4: one
  model).
- Either read the band People's model already computes, or pass the same
  touchpoints People passes.
- No second warmth number.

**Check.**
- Test: the St. Aloysius spread built by the directory equals the per-person
  bands People's model gives for the same ids (Phase 0 item 2 as a test).
- A live screenshot shows coloured segments on St. Aloysius.
- If the real spread is all cold even so, write that into the ledger with the
  numbers. Don't restyle it to look warmer.

### A3. Ongoing role drawn as a dot (C6)

**Seen.**
- "Your time with St. Aloysius" shows Adam's current role, Gifted Education
  Teacher, 2025–now, as a single dot at 2025.

**Cause.**
- `domain/organisation-timeline.ts:60`:
  `if (kind === 'events' || !item.end)` turns every open-ended period into a
  point.

**Fix.**
- In the Work & study and Roles lanes, `end: null` means **runs to now**. Draw a
  bar from `start` to the "now" x.
- Only the events lane uses points.

**Check.**
- Unit test: a lane item `{ kind: 'work_study', start: 2025-01-28, end: null }`
  produces a bar whose right edge is the now x.
- Live screenshot.

### A4. Timeline labels clipped and colliding (C1, C3)

**Seen.**
- "Gifted Education Teacher" is clipped at the SVG top and sits on the WORK lane
  label.
- The dashed people line runs through "2025".
- A stack of dark dots sits on top of "now".

**Fix.**
- Bar labels go **inside** the bar, as in the mockup ("HSIE teacher · since
  Term 1 2025"). When the bar is too short, the label goes to the right of it,
  within the lane row. It never goes above the lane.
- Axis labels get their own row below the chart (C1 rule). The people line and
  its area stay above that row.
- The people line is a stepped area behind the lanes, as in the mockup, with a
  count label ("82 people") at its right end. Draw no dot per person.
- If A1 finds that most first-link dates are import timestamps, the line uses the
  same real-date rule as A1.

**Check.**
- A `getBBox` test at 390 and 1440 finds no text box intersecting another text
  box, a lane label or the SVG edge.
- Height = `rows × 32 + 24`, measured.
- Live screenshot next to `02-organisation.png`.

### A5. Dead buttons and roadmap copy (I3, P4)

**Seen.** The live page shows five controls that do nothing and text that talks
about the build:

| Control / text | Where | Now |
|---|---|---|
| "Compare with…" | page header | disabled, title "Compare arrives in Phase 7" |
| "Edit" | page header | disabled, title "Structure editor arrives in Phase 2" |
| "Add structure" | How it is run | disabled, title "Structure editor arrives in Phase 2" |
| "Run now" | Ann's read | disabled, title "Ann's read arrives in Phase 5" |
| "…or they'll arrive once the sweep is built" | Opportunities, wall and page | text; no Add button, although the text says "Add one" |

**Fix.**
- In this PR, Part B builds Phases 2, 4, 5 and 7, so each control is wired to the
  real thing.
- Until the phase that wires it lands in a commit, **don't render the control**.
  A disabled button with a tooltip is not an empty state.
- Opportunities empty copy: **"No opportunities yet."** plus a live **Add
  opportunity** button (Phase 4).
  - `BUILD-PLAN.md` I3 has been corrected. The old wording leaked the roadmap
    into the product, and that was our plan's mistake.
- Ann's read before a first run: "Ann hasn't read St. Aloysius yet." plus a
  working **Run now** (BUILD-PLAN Phase 5 I3).

**Check.**
- `grep -rnE "Phase [0-9]|arrives in|is built|coming soon" apps/professional/src/views`
  returns nothing in user-visible strings.
- In the live DOM, `querySelectorAll('button[disabled]')` on the organisation
  page is empty unless a form is mid-submit.

### A6. Long chip wraps inside the pill (L6)

**Seen.**
- The NSW HALT Association tile's "Member · HALT Association NSW Professional
  Development Committee" wraps to 3 centred lines inside a rounded pill.

**Fix.**
- A chip is one line: `white-space: nowrap`.
- The detail truncates with an ellipsis at the chip's `max-width: 100%`, and the
  full text goes in `title`.
- Put the committee name on the page header's chip, not in full on the tile.
- Left-align chip text.

**Check.**
- Every `.orgs-rchip` on the wall at 390 and 1440 has
  `getClientRects().length === 1` and a height equal to a one-line chip.

### A7. Filter counts don't match reality (D4, V4)

**Seen.**
- 112 organisations, but Events & PD 0, Study & placement 0, Prospects 0.
- St. Aloysius has no **Event venue** chip, although the build plan's acceptance
  case expects one.

**Fix.**
- Take this from Phase 0 item 3.
- If the links exist and the chip derivation misses them, fix the derivation and
  test it against the **real** links (D4).
- If the links don't exist, say so in the ledger with the counts. Don't invent
  chips.
- The data backfill is a separate item for Adam to decide.

**Check.**
- A model test on real St. Aloysius links asserts the chip list.
- The segment counts and the chip counts come from one `buildOrganisationModel()`
  pass (V4).

### A8. The header's first date and the people count

**Seen.**
- The header says "56 people · first Jan 2025". The build plan's acceptance case
  says 82 people.

**Fix.**
- Report both numbers with their source in Phase 0: who is counted, and which
  date "first" came from.
- If "first" is Adam's own `valid_from`, label it "you started Jan 2025". If it
  is the organisation's first touch, use the earliest **real** date (A1 rule).

**Check.**
- Read the header aloud (D5). It says what the number and the date are.

## Part B: finish the build

Follow `BUILD-PLAN.md` Phases 2, 3, 4, 5 and 7 exactly, including each phase's
failure-mode table. Two additions from this review:

- **Phase 3:** the flowchart's C1 `getBBox` test runs on **real** St. Aloysius
  structure at 1440 and in the 390 flow box. It doesn't run on a fixture.
- **Phase 7:** the "Compare with…" button in the page header opens Compare
  with the current organisation preselected.

## Failure modes for this brief

`L1 L2 L5 L6 S2 S3 S4 V2 V4 R1 R2 C1 C2 C3 C5 C6 D1 D3 D4 D5 D6 I2 I3 W1 W2 P1 P2 P3 P4 P5`

The new entries from this review are L6, C5, C6, D6, P4 and P5
(`docs/CURSOR-UI-FAILURES.md`). C1, P1 and P3 have their **Seen** lines
extended. Run every check before ticking anything.

## Before marking ready

- `npm run pre-pr-check` at the repo root exits 0.
- `cd apps/professional && npm test && npm run typecheck && npm run build`.
- Take live 1440 and 390 screenshots on real data of the wall, St. Aloysius and
  Trinity. Put them in `screens/fix-01/`, each with a written diff against
  `mockups/01` and `02`.
- `PROGRESS.md` has every Part A item and every Part B phase ticked, each with:
  - the IDs checked;
  - the named real-entry-point test (W2);
  - "diff vs mockup: none", or the listed deviations.
- `git diff --stat origin/main...HEAD` touches only the files named here and in
  `BUILD-PLAN.md`, plus tests, docs and screenshots.
