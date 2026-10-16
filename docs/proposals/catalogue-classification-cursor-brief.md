# Cursor brief: recatalogue the Programs catalogue for branch lines

**Status:** ready. Data only. No UI work, so the UI failure register doesn't apply.
**Written:** 16/10/26 by Claude Code, alongside the classification fields added on branch
`claude/catalogue-classification-fields`.
**Builder:** Cursor. Read this whole file before editing anything. Where this brief says STOP, stop and report; do not improvise.

---

## 1. Why

The personal line builder draws a student's year as a train line per MindWorks strand. The Justice
line is too crowded to read: 104 of 290 entries land on it. The plan
([`docs/future-build-ideas/personal-line/branches.md`](../future-build-ideas/personal-line/branches.md))
is to split each line into branches, the way a network map splits by its biggest differences first.
Nothing in the catalogue says what kind of thing an entry is, so it can't split yet. **Your job is to
classify all 290 entries and fix their subjects.** Adam will pick the branch order from the counts
you report.

## 2. The fields (already in the schema; don't change it)

In `apps/tasks/fixtures/competitions.json`. All values are exact strings from these lists.

| Field | Type | Values |
|---|---|---|
| `format` | one | `Exam`, `Written entry`, `Speaking`, `Simulation`, `Project`, `Creative work`, `Day event`, `Program` |
| `provider` | one | `School`, `External` |
| `settings` | list, 1 or more | `At school`, `Online`, `Away` |
| `entry` | one | `Individual`, `Team`, `Either` |
| `entry_route` | one | `School enters`, `Student applies`, `Selection` |

Every entry gets all five. Use `null` (or `[]` for `settings`) only when the organiser's own page
truly doesn't say, and list it in the PR body.

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
- **R3 · STOP** if an entry is two different things (for example a program with an exam stream and a
  separate essay stream). Leave its `format` null, list it with both parts. Don't pick one.
- **R4 · Add a test** in `apps/tasks/tests/unit/programs.test.ts`: every catalogue entry has a `format`,
  a `provider` and at least one setting, or is on an explicit allow-list of the ones you left null;
  and no entry has `Classics` or `Languages` together with a Justice-only subject unless allow-listed.

## 6. Verify before each push

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

## 7. PR body

1. **Counts table:** for each line (Justice, Innovation, Expression, Reasoning, using `SUBJECT_LINES`
   in `apps/tasks/src/personal-line/lines.ts`), the number of entries per `format`, per `provider`, per
   `setting` and per `entry`. Adam picks the branch order from this.
2. Justice before and after: how many entries reach it now vs 104 before.
3. Every subject change, as `name: old → new`.
4. Every entry left null in any field, with the reason.
5. Every D4 finding (other fields that look wrong).
