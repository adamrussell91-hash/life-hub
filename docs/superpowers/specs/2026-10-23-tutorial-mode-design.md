# Tutorial mode — design

Date: 23 October 2026
Branch: `claude/tutorial-mode`

## Purpose

A Tutorial is the small-group reteach for students the markbook flags as
behind on a technique (first use: structural techniques). Lecture is solo and
self-paced with no teacher; a Tutorial is the opposite. The teacher sits with
3–8 students, and the app helps the teacher see each student's thinking live
and unstick it.

The key idea: the groups are formed around **why** students are getting it
wrong, not just **what** they got wrong. One tutorial holds several groups,
each tuned to its why.

## Adam's calls

- One Tutorial lesson and **one dot on the map**. Groups are tabs inside it,
  never separate lessons.
- Ann drafts the tutorial and Adam edits it before publishing.
- Ann reads students' actual wrong answers to name each group's why.
- Every student is on their own device; the teacher sees the group's answers
  live and talks through them.
- Groups self-run while the teacher rotates. The teacher may reach one group
  today and another on a later day, and that must work.
- Some parts are **common** to all groups (for example the demo), some are
  **specific to a group**, and each group gets an **exit check aimed at its
  exact gap**.
- Framework: gradual release (I do → We do → You do), with faded worked
  examples, and contrast pairs for groups whose why is a mix-up.
- Narration is recorded by Adam (no AI voice), as with Lecture.
- Talking points and anything shown to the group are anonymous (Focus view
  rule). Goals are written as what students will do, never as a deficit
  ("Today: explaining the effect").

## Out of scope

- Students in more than one group at once.
- Automatic re-grouping after the exit check (this goes back through the
  markbook's Next steps as normal).
- Group work between students (shared answers, peer chat).
- AI voice for the demo.
- Live sockets. The live board polls.

## 1. Structure

A Tutorial is a lesson with `pedagogical_mode === 'tutorial'`. Its body has
three layers:

```
Tutorial: Structural techniques — 7B
├── COMMON (every student in the tutorial)
│     I do: teacher demo on a shared extract
│     (Lecture scenes: narration, tap to reveal)
├── GROUP TABS (one per why)
│     I do    worked example aimed at the why
│             (a contrast pair when the gap is a mix-up)
│     We do   faded examples in the app: full → one blank → two blanks,
│             with If wrong paths for likely slips
│     We do   With teacher (locked until the teacher sits with the group)
│     You do  blank tries on a new extract
└── EXIT CHECK (one per group)
      2–3 questions aimed at that group's exact gap
```

- Common parts sit at the start by default. The teacher may place a common
  part at the end too (for example a whole-class wrap-up).
- A student sees Common, their own group's tab and their own exit check. They
  never see other groups or any group label.
- Students not in any group cannot open the tutorial ("This one isn't for you
  today").
- You do stays locked until the teacher has been with the group. A group the
  teacher doesn't reach today stops at the With teacher screen.

### Gap types

Each group has a gap type that sets how Ann drafts its I do:

- **Missing knowledge** (for example: can't name the technique) gets a
  worked example.
- **Mix-up** (for example: calls a metaphor a structural technique) gets a
  contrast pair: two short examples side by side, and the student says which
  is which and why.

### Faded example block

New block `faded_example`. It holds one full worked example split into named
parts (for structural techniques: technique, where, effect) and a list of
steps, each naming which parts are blank. The student fills the blanks; each
blank can carry an If wrong path, as Lecture gates do. Answers are stored as
normal block answers.

## 2. Ann: grouping and drafting

1. **Plan a tutorial** button on the markbook's Small group card (Next steps,
   `apps/teaching/src/markbook/next-view.ts`), beside the existing Ann
   follow-up. It passes the tag, the flagged students and their evidence.
2. Ann shows the plan and a rough cost before running (confirm before costly
   AI).
3. **Grouping job.** Ann reads each flagged student's wrong answers (written
   responses, chosen options, feedback-code chips) and returns 3–5 groups.
   Each group has: a plain name, the why, the gap type, its students, and one
   or two quotes per student from that student's own answers as evidence.
4. **Grouping screen.** The teacher drags students between groups, renames,
   merges or splits groups, removes a student from the tutorial, or marks a
   student *unsure* (Ann places them in the closest group; the exit check
   confirms it). Nothing is drafted until **Draft tutorial**.
5. **Drafting job.** Ann drafts:
   - Common demo: script and tap-to-reveal steps (Adam records narration).
   - Each group tab: goal line, worked example or contrast pair, faded steps
     with If wrong paths, With teacher talking points, You do tries.
   - Each exit check: 2–3 questions tagged with the same technique and outcome
     as the flagging quiz.
   - Extracts come from the unit's own texts where possible. Otherwise Ann
     writes a short one and marks it *Ann-written*.
6. The draft opens in the normal lesson editor with Common and each group as
   tabs. The teacher edits, then publishes. Only grouped students receive it.

Both jobs run on the existing Teaching AI job runner
(`netlify/functions/ai-jobs.mjs`), reusing the lesson-job path that the quiz
follow-up uses (`apps/teaching/src/evidence/follow-up.ts`). If drafting fails
partway, finished tabs stay and missing ones show **Draft again**. A tab is
never left half-written.

## 3. Running it

### Teacher: tutorial board

A strip of group cards at the top of the tutorial's class view. Each card
shows the group name, a dot per student (progress), status, and ✋ hand-up
count.

Group status: `not_started | working | waiting | seen | done`. `waiting` means
the whole group has reached With teacher. `seen` shows the date.

- **Common demo** runs from the front in Focus view
  (`apps/teaching/src/teacher/focus/`). It can be skipped on later days.
- **Sit with group** unlocks With teacher for that group and opens the
  **live board**:
  - one row per student, with their faded-step answers as they arrive and any
    If wrong paths they took;
  - Ann's talking points for this group (anonymous);
  - **Show to group**: put one chosen answer up, without a name, on the
    group's screens to discuss;
  - **Done with this group**: unlocks You do and the exit check, sets status
    to `seen`, returns to the strip.
- Hand-ups go to the teacher queue, as in Lecture.

### Student

1. Common demo (when it's running), then their group tab.
2. Goal line → worked example or contrast pair → faded steps.
3. At With teacher: "Your teacher will join you here." Nothing more until
   unlocked.
4. Then You do on a new extract, then the exit check.
5. Progress saves on every step. A group can pick up on another day exactly
   where it stopped.

Students claim their initials as for quizzes and Lecture. The student player
reuses the Lecture player (`apps/teaching/src/lecture/player.ts`).

### Phone (390px)

The teacher strip stacks the group cards. The live board shows one student at
a time, with swipe. The student player behaves as Lecture on a phone.

## 4. Data, markbook, map

Storage follows the existing student-answer storage in
`netlify/functions/_shared/teaching-blobs.mjs`. The plan confirms exact keys.
Nothing personal goes in the public repo, fixtures or tests (invented names
only).

- **Lesson body:** `common` (scenes), `groups[]`
  (`id, name, why, gap_type, students[], evidence_quotes[]`), and per group
  `tab` (scenes) and `exit_check` (questions). Scenes reuse Lecture's scene
  model.
- **Group status record:** one per group per tutorial:
  `{ status, seen_at?, unlocked_students[] }`. Sit with group and Done with
  this group write it; it is what unlocks steps on student devices.
- **Student progress:** as Lecture's replay record, one per student,
  overwritten in place: `{ reached, last_step, finished }`.
- **Answers:** faded steps, You do and exit check are normal answers. Nothing
  is stored twice.

### Live board polling

While the live board is open, the teacher's screen polls that group's answers
every few seconds. It stops when the board closes. A student device polls the
group status only while on the With teacher screen. No AI calls while the
tutorial runs.

### Markbook

- One column per tutorial.
- A student's cell shows their exit check result, with their group's why on
  hover.
- Exit check questions carry the same technique and outcome tags as the
  flagging quiz, so the evidence layer, Patterns and Next steps update with no
  special handling. A student who still shows the gap stays on the Small group
  card, noted as having had this tutorial.

### Map

One dot at the tutorial's date, labelled with progress ("3 of 5 groups
seen").

## 5. Edge cases

- **Absent when the teacher sits with their group:** their With teacher stays
  locked. The board marks them *missed you*, and the teacher can unlock that
  student alone later.
- **Wrong group:** the teacher moves the student on the board at any time.
  Common progress is kept; they start the new group's tab.
- **Group of one:** works the same.
- **No flagged students:** Plan a tutorial does not show.
- **Draft fails partway:** see section 2.

## 6. Testing

- Unit: group visibility (a student only resolves Common, their tab and their
  exit check); lock rules (With teacher, You do); status transitions; faded
  example blank resolution and marking; evidence tags on exit checks.
- Fixture: an invented class of 16 in four groups for the board and live board.
- Walk in preview at desktop and 390px: plan → group → draft → edit →
  publish → student run to With teacher → Sit with group → Done → exit check
  → markbook column and Next steps update.
- Not covered by tests: the live Ann grouping and drafting runs (Adam's go,
  with cost shown first), Safari narration.

## Phases (commits in one PR)

1. `tutorial` mode body (Common, groups, tabs, exit checks), editor tabs, and
   student visibility rules.
2. `faded_example` block, with If wrong paths.
3. Student player: group routing, With teacher lock, resume.
4. Teacher board, group status, live board, Show to group.
5. Ann grouping job, grouping screen, drafting job, Plan a tutorial button.
6. Markbook column, evidence tags, map dot label.
