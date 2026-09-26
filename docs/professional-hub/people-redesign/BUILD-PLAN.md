# People page rebuild: build plan

## Outcome

Replace `#/people`, `#/people/<id>` and the separate Person Brief with one page:
a directory on the left and the selected person on the right, as in
`mockups/04-directory-plus.png`. The page must know what the hub already
knows. Henry McLennan is the acceptance case:

> Adam opens People → Henry. The page says **Your mentee · Accreditation
> Mentor** and **Colleague · St. Aloysius**. It shows the open "set up
> mentoring meeting" task under **You owe Henry**, and each fact names its source.

Today none of that shows. The brief reads only explicit Universal Links, and
nothing links Henry to his task, his project or his school.

Read first: `DECISIONS.md` (who owns what), `mockups/04-directory-plus.html`,
and `docs/CURSOR-UI-FAILURES.md` (the UI failure register, currently on
branch `claude/confident-cannon-ud1cod`. Merge it to `main` before Phase 1
starts, or copy it in with Phase 1).

## Ground rules

- Branch every phase from fresh `main` (P2). A PR touches only the files its phase names, plus tests and docs.
- Every phase ships alone and leaves the page working. Agent features must degrade to a
  visible empty state with a manual trigger, never a blank area (I3).
- Screenshots at 1440 and 390 on **real data** (D3). They must show Henry
  McLennan, St. Aloysius College and Trinity Catholic College. Put them in
  `docs/professional-hub/people-redesign/screens/phase-N/` with a written diff
  against the mockup (P1).
- The progress ledger records, for each ticked item, the failure-register IDs
  checked, the named real-entry-point test (W2), and "diff vs mockup: none" or
  the listed deviations.
- No work email. No Message button. Communications records; it never sends.
- Dates use `formatDisplayDate` (dd/mm/yy) or relative text (D5).

## Existing code this builds on (verified 26/09/26)

| Need | Already exists |
|---|---|
| People, organisations | `_shared/identity-schema.mjs` (no logo field) |
| Relationship types | `_shared/relationship-registry.mjs`: `employee_at`, `member_of`, `professional_relationship` (roles include `mentor`, `mentee`, `colleague`, `former_colleague`), `collaborator` (task/project → person), `contact` (task → person), `attendee` |
| Brief model | `_shared/person-brief.mjs`: open loops from linked tasks, mutual connections, next meeting/event |
| Relationship state | `_shared/relationship-state.mjs`: `new / reactivated / active / cooling / dormant` |
| Notes | `_shared/observation-schema.mjs` (Observations about a person or organisation, sources `meeting / communication / manual / imported`) |
| "They owe you" seed | Tasks carry `waiting_on` (free-text name, parsed in `_shared/productivity-os.mjs`) |
| Clare | `_shared/clare-work.mjs` jobs (create/update task, set waiting-on…), `clare-protocols.mjs` Morning sweep, confirm path in `_shared/agent-confirm.mjs` |
| Ann | `_shared/agent-directory.mjs` slug `ann`, teaching-only voice; `persona.mjs` `annBlocks` (Hammond spec 2026-09-05) |
| Hammond | Whole-hub coordination spec `docs/superpowers/specs/2026-09-05-hammond-whole-hub-coordination-design.md`; cross-agent `Hammond→Clare` / `Hammond→Ann` lines |
| Scheduled work | `ai-jobs-tick-scheduled.mjs` (cron pattern; `schedule` and `path` can't share a function) |
| NL search | `_shared/relational-search-nl.mjs` (plans into org/role/text filters only) |
| APST | `_shared/apst-focus.mjs` |
| Media | R2 only (`.cursor/rules/no-documents-storage.mdc`) |

Current views to replace: `apps/professional/src/views/people-home.ts` (573
lines), `person-page.ts`, `person-brief.ts`, `components/person-tabs.ts`.

---

## Phase 1: The page (no agents)

The whole layout on data that exists now. Everything later only fills slots.

**1.1 One page, one person view.**
- `#/people` renders the split: directory at `minmax(0, 440px)`, person pane at `minmax(0, 1fr)`.
- `#/people/<id>` is the same page with that person selected.
- The brief route redirects to `#/people/<id>`. Delete `person-brief.ts` and `person-tabs.ts` once nothing imports them.
- One `h1`: "People", with the count beside it. No second heading.
- Person pane sections, in order: header (avatar, name, relationship chips, Edit), Next card, the ledger, Remember, Your relationship so far.
- The old tabs are gone. Timeline becomes the arc (1.5); Evidence/History move behind a "Full record" disclosure at the bottom.

**1.2 Directory, filter, sort, group.**
- Rows: avatar with warmth ring, name, one-line role, and a right-aligned signal.
- Filters: relationship role, organisation (current/former), warmth band, "has open items".
- Sorts: Needs attention (open items, then warmth ascending), Seeing soon (next meeting/event), Going cold, Recently in touch, Newest, A–Z, Organisation.
- Group: organisation (default) / relationship / none.
- Filter/sort/group state lives in the URL query, and one state object drives both the list and the control labels (V2).
- Search box: plain name/org search in this phase. It becomes Ask in Phase 6.

**1.3 Crests.**
- Add `logo_key: string | null` to Organisation (schema bump, parser + validator, PATCH allowed).
- Upload goes to R2 via a signed URL, following the knowledge attachment pattern.
- Accept PNG/SVG, square, ≤ 512 KB.
- Render the crest in the group header, as a badge on avatars, and in chips.
- Fallback: shield monogram in the org's colour (as mocked).

**1.4 Live patching.** The page renders its skeleton once. Each section fetches
independently and replaces only its own node. Nothing re-renders the whole
page on data arrival, so there's no flash. Each section has its own loading,
empty and error state (I3). Later agent writes use the same patch path.

**1.5 Relationship arc.** An SVG line of touchpoints over time, built from
dated communications, meetings, events, observations and task completions
already linked to the person. Height is fixed at 86px (C3). Labels must pass a
collision check (C1), and the line is drawn from real points (C2).

**1.6 Phone (390).**
- The directory is full width. Tapping a person pushes the person view, which has a back button. Re-render through a `matchMedia` listener (R1).
- Toolbar: search, **Filters** button (opens a sheet with filter, sort and group), and an icon Add button (L5).
- Warmth ring and crest badge stay on the avatar.

**Failure modes: Phase 1**

| ID | Feature-specific check |
|---|---|
| L1 | Directory card, person pane and Today strip share the right edge ±1px at 1440 |
| L2 | Directory row ≤ 60px; ledger item ≤ 56px; Remember line ≤ 28px; no `min-height` on cards |
| L3 | No sticky columns; scroll full page at 1440 and 390 |
| L4 | Rail full height at the bottom of a long directory |
| L5 | Toolbar ≤ 2 rows at 390 |
| S2/S3 | Sort menu and Filters sheet are opaque `var(--paper)` |
| S4 | Warmth ring SVG and arc have explicit fills; no `#000` |
| V1 | Collapsed "Full record" has `offsetHeight === 0` |
| V2 | Change sort via URL; the Sort button label follows |
| V3 | One sort control and one group control on screen |
| V4 | Directory row signal and person pane come from one `buildPersonModel()`; a test asserts the open-item count is equal in both |
| R1 | Resize 390 → 1440 → 390 without reload; the selected person survives |
| R2 | `scrollWidth === innerWidth` at 390 |
| C1/C2/C3 | Arc: `getBBox` test, no label overlap at 390/1440; line passes real points; 86px |
| D5 | Read every label aloud; dates dd/mm/yy |
| I2 | Rows are `<a href="#/people/<id>">`; Tab + Enter selects |
| W1 | `grep -n "fetch('/"` on changed files is empty |
| W2 | One test drives the real `people` route controller |
| P3 | Brief route redirects; the "People / People" double heading is gone at 1440 and 390 |

---

## Phase 2: Relationships the hub infers (link proposals)

Fixes the Henry problem. There are two sources: a deterministic pass now, and
Clare's sweep once it runs (Phase 8). Both write to the same store.

**2.1 Proposal store.** Add `_shared/link-proposal-schema.mjs` and `-repository.mjs`, one Blob per proposal:
- `{ id, proposed_link (a valid Universal Link input), reason, sources: [{ref, excerpt}], proposer: 'rules' | 'clare' | 'ann', status: pending | accepted | declined, created_at }`
- Accepting writes the Universal Link through the existing link repository.
- A declined proposal is never re-proposed with the same equivalence hash.

**2.2 Deterministic pass** (`_shared/link-inference-rules.mjs`, pure):
- A person's display name or alias appears in a task, project or event title or body → propose `contact` (task), `collaborator` (project) or `attendee` (event).
- Adam and the person share a current `employer` → propose `professional_relationship` role `colleague`.
- A project whose name contains "Mentor" (case-insensitive) and that has a collaborator person → propose `mentor`/`mentee`. Adam as source.
- The pass runs on task/project/event save and from a "Check for links" action.

**2.3 UI.**
- Pending proposals show as dashed chips in the person header: "Mentee? · from Project: Accreditation Mentor ✓ ✕".
- They're also counted in the directory under the **Needs you** filter.
- Accept and decline patch in place (1.4).

**Failure modes: Phase 2:** V4 (the chip count, directory badge and
Needs-you filter count come from one proposals query), D4 (the rules are
tested against **real** task/project titles, including Henry's task and
Project: Accreditation Mentor), D5 (proposal text reads as a sentence), I3
(no proposals shows "Nothing to confirm"), P3 (**acceptance: the Henry
scenario in Outcome, run live**).

---

## Phase 3: Warmth score

One score drives the ring, the "cooling/cold" text, the Going-cold sort, and
the existing `relationship-state.mjs` bands. Never two numbers (V4): extend
`relationship-state.mjs` to derive state from the score.

**Score** (0–100, recomputed on read and cached per person per day):

```
touch_value = Σ weight(type) · 0.5 ^ (age_days / half_life(person))
warmth      = round(100 · (1 − e^(−touch_value / 1.5)))
```

| Touchpoint | Weight |
|---|---|
| Meeting / event attended together | 1.0 |
| Communication in person, video or phone | 0.9 |
| Communication by message or email (logged) | 0.6 |
| Task with them completed | 0.5 |
| Observation written about them | 0.3 |
| Link created (e.g. new connection) | 0.2 |

**Half-life by closeness.** Closer goes cold faster, per `DECISIONS.md`. Take
the tightest tier that applies:

| Tier | Rule | Half-life |
|---|---|---|
| Inner | Current mentor/mentee; leader at current workplace; collaborator on an active project | 10 days |
| Current | Colleague at a current employer; member of a current professional body | 30 days |
| Former | Former colleague; employer link has ended | 90 days |
| Wider | Everyone else | 180 days |

**Bands:** ≥ 60 warm · 30–59 cooling · < 30 cold. New = connected in the last
14 days. Reactivated = warm now after being cold within 90 days.

Communications (being built) is the main feed. Until it lands, the score runs
on meetings, events, tasks and observations, and the page says "Based on
meetings, tasks and notes" under the ring tooltip.

**Failure modes: Phase 3:** V4 (ring, row text, sort and state from one
`warmthFor(person)`; test asserts all four), D1 (no fake precision: show the
band word, and put the number only in the tooltip), D4 (tiers tested against
real links: Henry is Inner, Bianca Gambrill is Former), C2 (the ring arc equals
the score; no decorative ring).

---

## Phase 4: The ledger (Clare)

**Model.** A `LedgerItem` is `{ id, person_ref, direction: 'you_owe' | 'they_owe', text, sources[], task_ref | null, comm_ref | null, author: 'clare' | 'adam', status: open | done | dismissed }`. Items come from:
- Open tasks linked to the person via `contact`/`collaborator` → `you_owe`, derived and not stored.
- Tasks whose `waiting_on` matches the person's name or alias → `they_owe`, derived.
- Stored items Clare writes from the text of tasks, observations and communications, e.g. a promise noted in a meeting ("I'll send it over").

**4.1 Clare button.** Clare's avatar sits in the ledger header. Pressing it runs
a Clare job (`clare-work.mjs`, a new job id) scoped to one person. She reads
their linked tasks, events, observations and comms, and returns ledger items
one by one. Each one appears in the ledger as it arrives (1.4 patch path; a
subtle "Clare is reading…" line, no spinner overlay, no reflow of other
sections).

**4.2 Editing.** Every item is editable inline: text, direction, done, dismiss.
A dismissed Clare item isn't re-proposed from the same source.

**4.3 Conversions.**
- Ledger item → task: creates it through Clare's existing create-task path and links it with `contact`. The ledger item then becomes the derived one.
- Task → comms item: records a Communication with `follow_up` back to the task.
- The comms side waits for the Communications build. Ship the button disabled with a "Needs Communications" tooltip until then (I3).

**Failure modes: Phase 4:** V4 (the directory "You owe 2" and the pane's two
columns come from one ledger query), L2 (item ≤ 56px), I4 (item actions are
icon buttons on hover/focus, not squeezing the text), D5, P3 (acceptance:
Henry's mentoring task appears under You owe Henry with its source).

---

## Phase 5: Remember (Ann)

- **Facts store.** `{ id, person_ref, text, sources[], author: 'ann' | 'adam', status }`, short lines (≤ 120 chars).
- **Scheduled job.** Runs twice daily (07:00 and 16:00 Sydney), using the `ai-jobs` scheduled pattern. It covers only people with new observations, comms or tasks since the last run.
- **Ann's role.** Widen her `agent-directory.mjs` voice and `annBlocks` from lesson coach to teaching *and* professional practice (mentoring, APST, colleagues). Remember is her first professional job.
- **Editing.** Facts are editable, dismissable and re-orderable. Ann never overwrites an Adam-authored fact.
- **Sources.** Each line shows its source label (note · dd/mm/yy, task, project).
- **Failure modes:** D5, I1 (no kinetic text on editable facts), I3 (no facts shows "Ann hasn't found anything yet. Run now").

---

## Phase 6: Ask (Ann)

- The search box gets an **Ask** mode: a question switches it from name search to an Ann turn.
- The turn is backed by a new tool set: people graph (links, orgs, roles), linked tasks/projects, observations, Remember facts, and APST (`apst-focus.mjs`).
- **Answer.** An answer card over the directory: a short answer plus up to 5 people, each with a one-line reason and a source.
- **Filtering.** "Show these in the list" applies the result as a filter (the one filter state from 1.2, V2).
- `relational-search-nl.mjs` remains the fast path for questions that reduce to org/role/text filters.
- **Failure modes:** S3 (answer card opaque), V3 (one search box, not a second Ask field), I3 (no confident answer shows "I don't know enough about who knows X yet", not an empty card).

---

## Phase 7: Today strip (your availability only)

- It shows the next school day's slots from your own sources: meetings/events with attendees, scheduled lessons with `start_time`, work blocks, and free periods (gaps in your teaching day).
- **Faces.** Each slot shows the people you'll see; for a meeting or event, that's its attendees.
- **Suggested time.** For a person with an open "meet" item, the strip highlights your free slot that best matches **when past meetings with them happened** (weekday + time-of-day histogram).
- **Wording.** It reads "You usually meet Henry after lunch", never "Henry is free".
- **Next card.** The person pane's Next card uses the same suggestion, from one model (V4).
- **Failure modes:** R2 (the strip scrolls inside its own box at 390), L2 (slot ≤ 96px), D1 (no suggested time when there's no meeting history; say "No pattern yet"), D2 (slots sorted by start time).

---

## Phase 8: Agent coordination (Hammond and Clare's sweep)

Depends on the Hammond daily sweep and Clare's Morning sweep running reliably.

- **Clare's sweep.** Add a People step: run 2.2's deterministic pass over new tasks and events, plus a Clare read for links the rules miss. Write to the Phase 2 store with `proposer: 'clare'`, and refresh ledger items for people touched since the last sweep.
- **Hammond's daily sweep.** Writes `Hammond→Clare` for People work arising outside Tasks and Events, and `Hammond→Ann` for Remember or relationship meaning.
- **Hammond's flags.** Hammond flags a relationship crossing into *cooling* only when that person is Inner tier or linked to an active goal or project.
- **Adam confirms.** Nothing is written as a link without Adam's confirm. Ledger and Remember items are written directly but stay editable.

---

## Order and dependencies

| Phase | Depends on | Can ship before Communications? |
|---|---|---|
| 1 Page | Failure register on `main` | Yes |
| 2 Link proposals | 1 | Yes |
| 3 Warmth | 1, 2 (tiers need links) | Yes, reduced feed |
| 4 Ledger | 1, 2 | Yes; the task → comms conversion waits |
| 5 Remember | 1; Ann's widened role | Yes |
| 6 Ask | 5 | Yes |
| 7 Today | 1 | Yes |
| 8 Sweeps | 2, 4, 5; sweeps live | n/a |

## Verification per phase

```bash
cd apps/professional && npm test && npm run typecheck && npm run build
npm test   # repo root: netlify function unit tests
```

Then take the live 1440 and 390 screenshots on real data, write the mockup
diff, and list the failure-register IDs checked in the progress ledger.
