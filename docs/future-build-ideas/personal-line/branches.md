# Personal line: branch lines

Adam, 16 Oct 2026: the builder works, but the Justice line is crowded. Every Justice stop sits on one
blue lane, so names stack up and run off down dotted leaders. The line should **branch**, like T1
splitting into North Shore and Western: Justice · Exams, Justice · Model UN, Justice · Writing, and so on.

The catalogue can't do that yet. An entry only has `subjects`, `types`, `age_groups` and a free-text
`location`, so there is nothing to split a line on. This doc proposes the fields to add.

## What's on Justice now

104 of the 290 catalogue entries reach Justice (Legal, Debating, Public Speaking, Humanities, History,
Geography, Leadership). A rough keyword sort of their names and descriptions by what the student
actually does:

| What the student does | Justice entries |
| --- | --- |
| Model UN, parliament, convention, negotiation | 28 |
| Exam, olympiad, academic marathon | 20 |
| Conference, forum, one-day event | 13 |
| Speaking and debating | 13 |
| Essay or written entry | 11 |
| Course or program | 11 |
| Mock trial, moot, mediation | 3 |
| Didn't sort | 5 |

That's a keyword guess, not data. It still shows the split: no group is more than a quarter of the line.

## Decisions (Adam, 16 Oct 2026)

- **Justice gets split.** Reclassify first, branch second.
- **Classics and Languages are Expression, not Justice.** A Latin reading competition is about speaking
  a classical language, not about justice. Classics and Languages stay as subjects (areas of interest),
  but no Classics or Languages entry should land on Justice. Today 16 entries carry Classics or
  Languages; they reach Justice through `Humanities` or `Public Speaking` (the CANSW and CLTA Latin
  reading competitions are `Classics, Languages, Public Speaking`). The reclassification pass removes
  those Justice-side subjects from them. Classics is **Expression only** (Adam, 16 Oct: they're all
  speaking comps), so it also leaves Reasoning.
- **Format values agreed:** Exam, Written entry, Speaking, Simulation, Project, Creative work, Day event,
  Program. Mock legal (moot, Mock Trial, Mock Mediation) is **Simulation**.
- **Setting is two questions, not one** (see below): who designed it, and where it happens. Some things
  are at school and online at once.
- **Entry (Individual / Team / Either) is in.** Adam's idea: show it on the stop itself, for example a
  solid outline for one and a dashed outline for another. No clash: the "Not on map" tag is dropped
  (Adam, 16 Oct: it's irrelevant again at the start of every year).
- **Civics gets its own branch.** There are enough entries: youth parliaments, constitutional
  conventions, the Youth Advisory Council, Informed Civics, Young Justice, the ALHR human rights forum,
  DMUN Model Parliament, roughly 10. Civics is a topic, not a format, so it's a new Justice subject
  (`Civics`), not a `format` value.
- **Order of work:** reclassify and fill all 290 entries first. Then look at the real counts and
  branch by the largest differentiator first, like a network map. Thresholds wait until then.

**Root cause worth fixing too.** `Humanities` is on 77 entries and is a catch-all. It puts the Latin,
Greek and mythology exams on Justice (Medusa, NLE, NGE in the screenshot), because they carry
`Classics` + `Humanities`. Those belong on Reasoning and Expression via Classics. Either drop
`Humanities` from entries that have a more specific subject, or map `Humanities` to Justice only when
the entry has no other Justice subject.

## Proposed fields

All enums, so they can drive layout and filters. Each is filled by a reviewed extraction pass from
`name`, `description` and `location`, the same way the dates were.

### 1. `format`: what the student does (the branch)

The main axis. This is what Adam's examples are really about: exams line, essay line, programs line.

| Value | Covers |
| --- | --- |
| `Exam` | Exams, olympiads, academic marathons, sat tests (NLE, AHC, Geothon, ICAS-style) |
| `Written entry` | Essays, research papers, short stories, poetry submitted by a due date |
| `Speaking` | Debating, public speaking, philosothons, reading competitions |
| `Simulation` | Model UN, youth parliament, constitutional conventions, negotiation, mock trial, moot, mediation |
| `Project` | Team challenges, problem solving, design, build, pitch, research projects |
| `Creative work` | Art, film, photography, drama and music performance |
| `Day event` | Conferences, forums, summits, one-day workshops |
| `Program` | Courses, leadership and civic programs, camps, councils over weeks or a year |

One value per entry.

### 2. `provider` and `setting`: who runs it, and where

Adam, 16 Oct: the natural split is school-designed vs external, then where it happens, and some
entries are in more than one place (sat at school, online).

**`provider`** (one value):

| Value | Meaning |
| --- | --- |
| `School` | Designed and run by a school: our own programs, a host school's MUN or Toga Day |
| `External` | Designed by an outside organiser, even if the student sits it at school (NLE, AHC, Mock Trial) |

**`setting`** (one or more values):

| Value | Meaning | Now (rough) |
| --- | --- | --- |
| `At school` | Sat or run at the student's school, teacher supervises | 58 |
| `Online` | Online, from school or home | 132 |
| `Away` | Student travels to a venue, campus or another school | 99 |

"Completely online" is `setting = [Online]` alone. "At school and online" is `[At school, Online]`.
`location` stays as free text for the card. The rough counts are from today's free-text `location`
(40+ spellings) and will move once multi-values are allowed.

### 3. `entry`: who enters

| Value | Meaning |
| --- | --- |
| `Individual` | Student enters alone |
| `Team` | Student needs a team (debating, Mock Trial, da Vinci) |
| `Either` | Both allowed |

`cost_basis` hints at this (`Per team` on 34) but isn't the same thing. It matters on the card and for
a teacher building a team.

### 4. `topic`: Civics subject

Add `Civics` to the subject list, on Justice only. It takes parliament, convention, council, rule of
law and human rights entries, which today sit under `Legal` or `Humanities`.

### 5. `entry_route`: how they get in

| Value | Meaning |
| --- | --- |
| `School enters` | A teacher registers the student or school |
| `Student applies` | Student or parent registers directly |
| `Selection` | Invitation, nomination, application with selection (AMO, YAC, RYLA) |

Useful on the card ("ask your teacher" vs "register here") and to flag things that need a nomination
early. Not a branch axis.

## How branching would draw

- **Branch by `format`** by default. A builder option switches to **`setting`** or **Off** (today's
  single lane per line).
- Each chosen line splits into one lane per `format` its stops use, in a fixed order, in the line's
  colour with a short label at the top: `J · Exams`, `J · Model UN`, `J · Writing`.
- **Small branches fold back in.** A branch with fewer than 3 stops for this student stays on the
  trunk. At most 4 branches per line; the rest ride the trunk. This stops a 2-interest student getting
  nine thin lanes.
- **Interchanges still work.** An entry on Justice and Expression bridges the right branch of each.
  It's on one `format`, so it's on the same-named branch on both lines.
- **Names:** each branch's names sit beside that branch, so stacks shrink to the branch's own stops.
- **Phone:** branches draw as thinner parallel lanes on the left, one name column on the right as now.
- **Card:** add `format`, `setting` and `entry` as dark tags beside length and level.

## Slices

0. **Data first.** Add `format`, `provider`, `setting`, `entry`, `entry_route` as optional fields on
   `ProgramObject` in `apps/tasks/src/schemas/program.ts`, add `Civics` to `PROGRAM_SUBJECTS`, and set
   Classics and Languages to Expression only in `personal-line/lines.ts`. Run a reclassification pass
   that proposes values for all 290 entries, including subject fixes (Classics/Languages off Justice,
   `Humanities` trimmed where a narrower subject fits, `Civics` added), for Adam to approve in batches.
0b. **Count, then decide.** Print the real counts per line by format, provider and setting. Branch by
   the largest differentiator first. Set thresholds from those counts.
1. **Snapshot.** Carry `format`, `provider`, `setting`, `entry`, `entry_route` on `LineItem` (`personal-line/model.ts`).
   All four are public-safe.
2. **Branch layout** in `personal-line/render.ts`, behind the builder's Branch by option.
3. **Card tags** and a Setting filter in the builder.

## Status

- **16 Oct:** fields added to the schema, Civics added on Justice, Classics moved to Expression only.
- **Next:** Cursor recatalogues all 290 entries:
  [`docs/proposals/catalogue-classification-cursor-brief.md`](../../proposals/catalogue-classification-cursor-brief.md).
- **Then:** real counts per line, pick the branch order, set thresholds.
- **Separately:** the catalogue database and card restyle.

## Open questions

- Which marks on the stop for Individual / Team / Either?
- Which dimension branches first, and the fold thresholds: decide after the recatalogue counts.
