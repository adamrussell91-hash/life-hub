# Cursor brief: recatalogue the Programs catalogue for branch lines

**Status:** ready. Data only. No UI work, so the UI failure register doesn't apply.
**Written:** 16/10/26 by Claude Code, alongside the classification fields and the Platforms /
Timetable views in [#873](https://github.com/adamrussell91-hash/life-hub/pull/873). Start from `main`
after #873 merges.
**Builder:** Cursor. Read this whole file before editing anything. Where this brief says STOP, stop and report; do not improvise.

---

## 1. Why

The personal line builder draws a student's year as a train line per MindWorks strand. The Justice
line is too crowded to read: 104 of 290 entries land on it. The plan
([`docs/future-build-ideas/personal-line/branches.md`](../future-build-ideas/personal-line/branches.md))
is to split each line into branches, the way a network map splits by its biggest differences first.
Nothing in the catalogue says what kind of thing an entry is, so it can't split yet. **Your job is to
classify all 290 entries and fix their subjects.** Adam will pick the branch order from the counts
you report. The Programs page (Platforms and Timetable views) and the personal line card already
read these fields, so you'll see your work there as you go: run `npm run dev` in `apps/tasks`, sign in
with the mock passphrase, open Programs, and check that the format mix bar on each line has no grey
"Not classified yet" left.

## 2. The fields (already in the schema; don't change it)

In `apps/tasks/fixtures/competitions.json`. All values are exact strings from these lists.

| Field | Type | Values |
|---|---|---|
| `format` | one | `Exam`, `Written entry`, `Speaking`, `Simulation`, `Project`, `Creative work`, `Day event`, `Program` |
| `provider` | one | `School`, `External` |
| `settings` | list, 1 or more | `At school`, `Online`, `Away` |
| `entry` | one | `Individual`, `Team`, `Either` |
| `entry_route` | one | `School enters`, `Student applies`, `Selection` |

Every entry gets all five. When you're not sure, **still fill in your best guess** and ask about it
in the PR body (section 6). Use `null` (or `[]` for `settings`) only when you have no basis for a guess
at all.

### What each value means

**`format`: what the student actually does.** Pick the main activity, one value.

| Value | Covers | Examples |
|---|---|---|
| `Exam` | A paper or online test, olympiad, academic marathon, quiz | National Latin Exam, Australian History Competition, Geothon, ICAS-style |
| `Written entry` | Essays, research papers, stories, poems submitted by a deadline | Simpson Prize, Yale essay contests, What Matters? |
| `Speaking` | Debating, public speaking, philosothons, reading aloud | Premier's Debating, Rostrum, Sydney Philosothon, CANSW Latin and Greek Reading |
| `Simulation` | Role-play of a real institution | Model UN, youth parliament, constitutional conventions, negotiation, **Mock Trial, moot, Mock Mediation** |
| `Project` | Team or solo challenge that builds or solves something over time | Future Problem Solving, Global Impact, robotics, pitch, research projects |
| `Creative work` | Art, film, photography, drama or music made or performed | art competitions, drama festivals, film prizes |
| `Day event` | A conference, forum, summit or one-day workshop you attend | Ethical Explorations Day, Junior Thinkers Conference, UN Youth NSW State Conference |
| `Program` | A course, leadership or civic program, council or camp over weeks or a year | NSW Youth Advisory Council, RYLA, UN Youth Workshops |

**`provider`:** `School` = designed and run by a school (a school's own MUN, Toga Day, a host school's
forum). `External` = designed by an outside organiser, **even when it's sat at school** (NLE, AHC,
Mock Trial).

**`settings`:** where the student is while doing it. Several are allowed.
- `At school`: sat or run at the student's own school.
- `Online`: done online (from school or home).
- `Away`: the student travels to a venue, campus or another school.
- "Sat online at school" is `["At school", "Online"]`. "Completely online" is `["Online"]`. Online
  rounds then a finals venue is `["Online", "Away"]`.

**`entry`:** `Individual`, `Team` (a team is required), `Either` (both allowed).

**`entry_route`:** `School enters` (a teacher registers the student or school), `Student applies`
(student or parent registers directly), `Selection` (invitation, nomination, or an application that
is selected).

## 3. Subject fixes (same pass)

| # | Rule |
|---|---|
| S1 | **Classics and Languages are Expression only.** An entry with `Classics` or `Languages` must not keep a Justice subject (`Humanities`, `History`, `Public Speaking`, `Legal`, `Debating`, `Geography`, `Leadership`) unless the entry is genuinely also about that subject. A Latin reading competition is `Classics, Languages`. A mythology exam is `Classics`. |
| S2 | **`Humanities` is a catch-all.** Remove it from an entry that already has a narrower subject saying the same thing. Keep it only where nothing narrower fits. |
| S3 | **Add `Civics`** to entries about government, parliament, law-making, rule of law or rights: youth parliaments, constitutional conventions, the NSW Youth Advisory Council, Informed Civics, Young Justice, the ALHR human rights forum, DMUN Model Parliament. Remove `Humanities` or `Legal` from them only if S2 applies. |
| S4 | Never invent a subject outside `PROGRAM_SUBJECTS` in `apps/tasks/src/schemas/program.ts`. |

## 4. Decisions (do not re-open these)

| # | Decision |
|---|---|
| D1 | `apps/tasks/fixtures/competitions.json` is the only source file. Never Notion, never Blobs, never a second file. Production picks up your classification and subject changes through `withCatalogueClasses` (`netlify/functions/_shared/catalogue-dates.mjs` and `apps/tasks/src/domain/programs-seed.ts`), but only for entries with a `format`. |
| D2 | **An entry with `format` set carries its `subjects` to production too.** So never set `format` without also checking S1 to S3 on that entry. |
| D3 | Classify from the entry's own `name`, `description`, `location` and `cost_basis` first. Open `registration_link` only when those don't decide it. |
| D4 | Change only the five new fields and `subjects`. If you find `location`, `types` or anything else wrong, **don't edit it**. List it in the PR body. |
| D5 | Never delete entries. Leave `not_available_nsw` entries in; classify them too. |

## 5. Rules

- **R1 · Keep the file's shape.** Edit in place, two-space indent. Add the five keys straight after
  `registration_window`, in the order of the table in section 2. Don't reorder entries or other keys.
  Leave `updated_at` alone.
- **R2 · Batches of about 50 entries**, in file order, one commit per batch.
- **R3 · Unsure means ask, not stop.** Fill in your best guess and add a question (section 6). That
  includes an entry that is two things at once (an exam stream and an essay stream): pick the main one
  and ask.
- **R4 · Add a test** in `apps/tasks/tests/unit/programs.test.ts`: every catalogue entry has a `format`,
  a `provider` and at least one setting, or is on an explicit allow-list of the ones you left null;
  and no entry has `Classics` or `Languages` together with a Justice-only subject unless allow-listed.

## 5b. Verify before each push

From `apps/tasks`:

```bash
npx vitest run tests/unit/programs.test.ts tests/unit/personal-line.test.ts
```

The schema rejects any value not in the lists above, so a typo fails here.

Then, from the repo root:

```bash
npm run pre-pr-check
```

Exit 0 is required.

## 6. Questions for Adam (the quick-decision format)

Adam decides on his phone, in a few seconds per question. Put every question in the **PR description**
(not a file and not a comment), because GitHub lets him tick checkboxes in a PR description with one tap.

**Rules**

- **Ask only when you are genuinely unsure.** Aim for 40 questions or fewer across all 290 entries.
- **One question per group, not per entry, wherever you can.** "All 13 DMUN events: Simulation or Day
  event?" is one question. Group by organiser, by name pattern, or by the same doubt.
- **Your best guess is already in the data** and is the ticked box. If Adam ticks nothing, the guess
  stands. He only acts when he disagrees.
- **Two to four options.** Real values from the lists in section 2, never "Other".
- **One line of evidence**, quoted from the entry or its page, so he doesn't need to open anything.
- **Number every question** (Q1, Q2, …) so he can also answer in chat as `Q4 b, Q9 c`.

**Format** (copy exactly):

```markdown
## Decisions (tick to change; the ticked box is already applied)

**Q1 · Format · 13 DMUN events** (DMUN Debate Forum, DMUN CRISIS, DMUN Championship, …)
> "One-day online conference where delegates debate resolutions in committee"
- [x] a. Simulation (best guess)
- [ ] b. Day event

**Q2 · Subjects · Medusa Mythology Exam**
> Classics, Humanities → S1 says drop Humanities. Mythology could be read as History.
- [x] a. Classics (best guess)
- [ ] b. Classics, History

**Q3 · Where · National History Challenge**
> "Students research at school and submit online"
- [x] a. At school + Online (best guess)
- [ ] b. Online
```

Order the questions with the biggest groups first, then by field (Format, Subjects, Where, Run by,
Entry, How to enter).

**After Adam answers:** when he says "decisions done" (or answers in chat), apply every box he changed,
remove the answered questions from the PR description, re-run section 5b, and push. Apply only what he
ticked or wrote; don't reinterpret.

## 7. PR body

Put the **Decisions** section (section 6) at the top. Under it:

1. **Counts table:** for each line (Justice, Innovation, Expression, Reasoning, using `SUBJECT_LINES`
   in `apps/tasks/src/personal-line/lines.ts`), the number of entries per `format`, per `provider`, per
   `setting` and per `entry`. Adam picks the branch order from this.
2. Justice before and after: how many entries reach it now vs 104 before.
3. Every subject change, as `name: old → new`.
4. Every entry left null in any field, with the reason (should be rare: see section 2).
5. Every D4 finding (other fields that look wrong).
