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
| `Simulation` | Model UN, youth parliament, constitutional conventions, negotiation |
| `Mock legal` | Mock trial, moot, mediation |
| `Project` | Team challenges, problem solving, design, build, pitch, research projects |
| `Creative work` | Art, film, photography, drama and music performance |
| `Day event` | Conferences, forums, summits, one-day workshops |
| `Program` | Courses, leadership and civic programs, camps, councils over weeks or a year |

One value per entry. `Mock legal` is small (3) but is the clearest Justice-only branch, so keep it; the
layout folds small branches back in (below).

### 2. `setting`: where it happens

`location` is free text with 40+ spellings ("Online (global)", "At school (paper or online)",
"Bond University, Gold Coast QLD"). Normalise to:

| Value | Meaning | Now (rough) |
| --- | --- | --- |
| `At school` | Sat or run at the student's school, teacher supervises | 58 |
| `Online` | From home or anywhere, no venue | 132 |
| `Away` | Student travels to a venue, campus or another school | 99 |

Keep `location` for the card. This gives Adam's "school based" vs "external" split, and a teacher
filter ("only things we run here").

### 3. `entry`: who enters

| Value | Meaning |
| --- | --- |
| `Individual` | Student enters alone |
| `Team` | Student needs a team (debating, Mock Trial, da Vinci) |
| `Either` | Both allowed |

`cost_basis` hints at this (`Per team` on 34) but isn't the same thing. It matters on the card and for
a teacher building a team.

### 4. `entry_route`: how they get in

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

0. **Data.** Add the four optional enum fields to `ProgramObject` in
   `apps/tasks/src/schemas/program.ts` and to the catalogue item editor. Run an extraction pass that
   proposes values for all 290 entries, for Adam to approve in batches. Fix the `Humanities` over-tag
   in the same pass.
1. **Snapshot.** Carry `format`, `setting`, `entry`, `entry_route` on `LineItem` (`personal-line/model.ts`).
   All four are public-safe.
2. **Branch layout** in `personal-line/render.ts`, behind the builder's Branch by option.
3. **Card tags** and a Setting filter in the builder.

## Open questions

- Is `format` the right default branch, or does Adam want `setting` (school vs external) first?
- Should Classics exams leave Justice entirely, i.e. drop `Humanities` from them?
- Branch thresholds: fold under 3 stops, max 4 branches per line. Right numbers?
- Are there Justice-specific branches beyond these (for example a "Civics" branch for parliament and
  convention programs, split from Model UN)?
