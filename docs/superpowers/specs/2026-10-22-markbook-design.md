# Class markbook — design

Date: 22 October 2026
Status: approved in chat, awaiting spec review

## Problem

Quiz attempts now carry `class_id` and `student_id` (PR 1044), but the only
place to see them is one quiz's Results tab. Assessment tasks, homework and
hand-ins live nowhere in Teaching, so there is no single view of how a class
or a student is going, and no link from marks back to syllabus outcomes.

## Goal

Each class gets a teacher-only markbook. Quiz scores fill themselves in,
the teacher adds assessment, hand-in and check columns, and an overall mark
is worked out from weighted assessments. Two views go beyond a plain grid:
an outcomes view that shows each student's evidence per syllabus outcome,
and quiz insight that turns stored attempt data into reteaching and
student flags.

## Decisions (from chat, 22 Oct)

- **Four column types:** quiz, assessment, hand-in, check.
- **Only assessments carry weight.** The overall mark is the weighted
  assessment average. Quizzes, hand-ins and checks are evidence, never part
  of the grade. This matches NSW assessment schedules.
- **Assessments are marked by criterion in the app.** The teacher types a
  mark per criterion from paper scripts. Students don't submit in the app.
- **Quiz columns use each student's first attempt.** It is the honest
  evidence; later attempts are practice.
- **Teacher only.** Students see nothing new. Their quiz feedback stays as
  it is now.
- **First build includes** the outcomes view and quiz insight.
- **Later, not this build:** at-risk and N-award flags, Ann's report
  comment drafts, ranks and moderation, any student-facing view.

## Data

### Markbook record

One record per class in the teaching Blobs store: `markbook/{classId}`.

```ts
type Markbook = {
  columns: Column[];          // teacher-made columns, in the order added
  hidden_quizzes: string[];   // lesson ids of quiz columns the teacher hid
  marks: Record<string, Record<string, Mark>>; // column id → student id → mark
  updated_at: string;
};
```

Teacher-made columns:

- **Assessment** `{ id, kind: 'assessment', title, date, weight, criteria }`
  - `weight`: 0–100, a percentage of the course mark.
  - `criteria`: 1–12 of `{ id, label, max, outcomes: string[], bands?: { label, min }[] }`.
    `outcomes` holds ids from the outcome catalogue
    (`apps/teaching/src/curriculum/outcome-catalog.ts`). `bands` are the
    marking-guideline bands for that criterion, highest `min` first.
  - Mark: `{ criteria: { [criterionId]: number }, feedback?: string, exempt?: boolean, note?: string }`.
    A student with `exempt: true` has no marks for the task. `note` records
    the reason or the provision given ("misadventure", "extra time").
- **Hand-in** `{ id, kind: 'handin', title, due }`
  - Mark: `{ status: 'submitted' | 'late' | 'missing' | 'exempt', at?: string }`.
- **Check** `{ id, kind: 'check', title, date, scale: 'tick' | 'four' }`
  - Mark: `true | false` for tick, `1 | 2 | 3 | 4` for four.

Column ids are random, never reused, and survive renames. Marks key on the
stable `student_id` from the class list, so editing a name or initials
loses nothing.

### Quiz columns

Quiz columns are not stored. When the markbook loads, the server finds
every quiz lesson in the class's units (`active_unit_ids`) that has at
least one attempt from a student on this class list, and builds a column
for it. The column's date is the class's earliest hand-in for that quiz.
A hidden quiz stays in `hidden_quizzes` and can be shown again.

For each student the server takes their first attempt that was handed in
and not cleared by the teacher, scored with the same `scoreAttempt` the
Results tab uses (hint costs and teacher marks included). Because the
markbook reads attempts live, a question marked later in the Results tab
updates the markbook on the next load.

### Question outcomes

`QuizQuestionBlockSchema` gains an optional `outcomes: string[]` (outcome
catalogue ids, max 6). A question with no outcomes of its own takes its
lesson's `syllabus_outcomes`. The quiz question editor gets a small
outcome picker, collapsed by default.

## Server

A teacher-only function, `netlify/functions/markbook.mjs`, behind the same
teacher check as the quiz teacher actions, with the logic in
`netlify/functions/_shared/markbook.mjs`. One POST endpoint with an
`action`:

- `load` `{ class_id }` → the record, the class list, the quiz columns
  with each student's first-attempt score and per-question rows, and the
  outcome labels used.
- `save_column` `{ class_id, column }` → adds or replaces a teacher column.
  Validated with zod; criteria `max` must be positive, bands must sit
  inside `0..max`.
- `delete_column` `{ class_id, column_id }` → removes the column and its
  marks.
- `set_mark` `{ class_id, column_id, student_id, mark }` → one cell. A
  criterion mark above `max` or below 0 is refused. `mark: null` clears it.
- `hide_quiz` `{ class_id, lesson_id, hidden }`.

Writes read the record with its etag and write with `onlyIfMatch`. On a
clash the server retries once, then returns `409` and the page says
"The markbook changed in another tab. Reload to see it."

Work that only shapes data (overall mark, outcome evidence, trends,
calibration) lives in pure functions in `apps/teaching/src/markbook/`, so
the client and unit tests share them. The server only gathers and scores.

## Teacher page

A **Markbook** section on the teacher class page, next to Students
(`teacher/sections/markbook.ts`, wired into `teacher/sections/classes.ts`).

### Grid

- Rows: students on the class list, by surname, showing initials and name.
  Students removed from the list are hidden, with a "Show removed students"
  toggle. Their marks are kept.
- Columns in date order. Each header shows a kind icon, the title, the date
  and, for assessments, the weight.
- Cells:
  - Quiz: a percentage. A dot marks questions still waiting for the
    teacher's marks. Blank if the student never handed in.
  - Assessment: the total out of the sum of criteria `max`, and a
    percentage. "Exempt" if exempt.
  - Hand-in: a coloured chip: Submitted, Late, Missing, Exempt.
  - Check: a tick or the 1–4 value.
- **Overall** column, pinned on the right: the weighted assessment mark.
- An **Add column** button opens a short form for the kind chosen.

### Entering marks

- Hand-in and check cells change with one tap, cycling through the values.
  A long press or right-click clears.
- An assessment cell opens a side panel for that student and task: one
  number box per criterion with its band shown beside it, a feedback box,
  and an Exempt switch with a note. Enter moves to the next student, so a
  pile of scripts can be entered without leaving the keyboard.
- A quiz cell opens that student's attempt in the existing quiz Results
  view.

### Overall mark

For each student: `Σ(weight × percent) / Σ(weight)` over assessments that
are marked and not exempt. An exempt task drops out, so its weight spreads
over the rest in proportion. While some tasks are unmarked the cell reads
"so far". If the class's assessment weights don't add to 100, a warning
above the grid says so and shows the total.

### Outcomes view

A toggle above the grid switches to students × outcomes. Outcomes come
from every assessment criterion and quiz question in the markbook, grouped
and labelled from the outcome catalogue.

Each piece of evidence is a percentage: a criterion mark over its `max`, or
a quiz question's awarded marks over its marks. Questions still waiting for
teacher marks are left out. A cell shows the mean of its evidence and how
many pieces it rests on, coloured in four bands: below 50, 50–69, 70–84,
85 and above. An empty cell reads "No evidence". Clicking a cell lists its
evidence with the task, the item and the percentage.

### Quiz insight

- **Question heatmap.** From a quiz column's header menu. Rows are
  questions, columns are students, each cell coloured by the share of marks
  awarded, grey while pending. Above it, a **reteach** list: questions where
  the class average is below 50%, lowest first.
- **Trend.** A small sparkline beside each student's name, from their quiz
  percentages in date order. A student is flagged "dropping" when they have
  at least five quizzes and the average of the last three is 15 points or
  more below the average of the ones before.
- **Calibration.** Using the confidence ratings stored with answers. A
  student is flagged "confident and wrong" when, across their first
  attempts, at least three answers rated most confident scored zero and
  those make up at least 40% of their most-confident answers. Quizzes
  without confidence switched on are ignored.

Flags show as small labelled marks next to the name, with the reason on
hover or tap.

### Phone (390px)

The grid gives way to one student card at a time, with next and previous
buttons and a student picker. The card lists every column as a row, with
the same tap-to-cycle controls for hand-ins and checks. Assessment entry
uses the same panel, full screen.

### CSV export

A button downloads `markbook-{class name}-{date}.csv`: one row per student
with initials, name, each column (percent for quiz and assessment, status
for hand-in, value for check) and the overall mark.

## Errors and edge cases

- A class with no list: the markbook says "Add students to this class to
  start a markbook." Anonymous quiz attempts never appear.
- A quiz republished mid-term: each attempt is scored against the key
  version it was taken on, as Results already does.
- A teacher clears a student's attempts: the first remaining handed-in
  attempt counts.
- A criterion is deleted after marking: its marks are dropped from the
  student's marks on save, and the total is recalculated.
- An outcome id no longer in the catalogue: shown under its raw id in an
  "Other outcomes" group.
- Weight of 0 is allowed (a practice task). It shows in the grid and in the
  outcomes view but doesn't change the overall mark.

## Build

One PR, `claude/markbook`, phases as commits:

1. Data and server: schemas, `_shared/markbook.mjs`, the function, mock API
   routes, question `outcomes` field.
2. Grid with the four column types, mark entry and the overall column.
3. Assessment panel: criteria, bands, feedback, exempt and notes.
4. Outcomes view and the question outcome picker.
5. Quiz insight: heatmap and reteach list, trend, calibration.
6. Phone layout and CSV export.

## Testing

- Unit: overall mark with and without exemptions and unmarked tasks;
  weights not adding to 100; first-attempt choice with cleared attempts;
  outcome evidence including inherited lesson outcomes and pending
  questions; trend and calibration thresholds at their edges; band lookup;
  CSV rows.
- Server: each action accepts good input and refuses bad (marks above
  `max`, unknown column, unknown student, bad bands); etag clash returns
  409; quiz columns only include students on the list.
- Browser: walk the grid on the mock API at desktop and 390px: add each
  column kind, enter marks, toggle the outcomes view, open a heatmap,
  export a CSV.
- Fixtures use invented names only, because the repository is public.
