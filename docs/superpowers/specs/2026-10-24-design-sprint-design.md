# Design Sprint: design

Date: 24 October 2026
Branch: `claude/design-sprint`
Mockups: `docs/superpowers/specs/design-sprint-screens/`

## Purpose

A Design Sprint gives a group a challenge and walks it from the problem to a
tested prototype in five phases. It borrows the logic of the Google Ventures
sprint: ideas are made alone, choices are made together, judging uses
criteria rather than opinion, and the prototype is tested on a real
audience.

In class the sprint is **blended**. Phases switch between class (together)
and home (alone), so every student brings their own thinking before the
group meets. It has to work for any subject, from Year 7 History through
Year 12 English Advanced. The engine stays the same; the subject sits in
three things the teacher writes: the **challenge**, the **criteria** and the
**prototype format**.

Today `design_sprint` is a label only
(`apps/teaching/src/curriculum/pedagogical-mode.ts`). This build makes it a
lesson type that changes behaviour, as Quiz, Lecture and Tutorial already do.

## Adam's calls

- Blended: phases alternate between class and home.
- **Deadlines, not lessons.** Each phase has a due date and time with a
  countdown, so a student who was sick can catch up. A phase is not tied to a
  lesson.
- **Groups are set for each sprint**, separate from tutorial groups. Students
  are placed by their claimed initials.
- **Everyone submits at every phase**, so nobody can freeload. The class
  phases include an individual submission too.
- **Votes are anonymous and stay anonymous.** Students never find out whose
  idea won. Knowing the author adds nothing to the learning.
- **Who decides is a setting:** *top vote goes through* (for example Year 12
  Advanced), or *teacher confirms* (younger classes, so the group doesn't
  pick the silliest idea).
- **No student slide builder.** The prototype is something students make
  themselves and upload (a file or a link). The pitch happens live in class,
  about 2 minutes per group.
- During each pitch the teacher **opens feedback to the rest of the class**,
  and the presenting group gets it.
- **Only the Prototype and the Reflection are marked.** The other phases are
  recorded as in, late or not in.
- **The teacher writes the criteria.** No AI anywhere in the sprint.

## Out of scope

- Student slide or presentation building.
- AI drafting of criteria, challenges or feedback. The sprint makes no AI
  calls.
- Voting across groups. Each group votes only on its own ideas.
- Revealing authors to students, at any point.
- Automatic grouping.
- Live sockets. Boards poll, as Tutorial does.

## 1. The five phases

| # | Phase | Where | Each student submits | The group gets |
|---|---|---|---|---|
| 1 | **Understand** | Class | 1–5 "How might we…" notes, then one star on the group's notes | The group question (the top-starred note) |
| 2 | **Sketch** | Home | One solution sketch: a title, a short explanation and an optional picture or file. Crazy 8s or the mind map tool comes first if the teacher adds it. | The group's gallery of ideas |
| 3 | **Decide** | Class | A vote on each criterion in the anonymous gallery, then a claim on one prototype part | The chosen idea, the parts list and who builds each part |
| 4 | **Prototype** | Home | Their own part (file, link or text). One member also uploads the group's pitch file. **Marked.** | The prototype and pitch file |
| 5 | **Test** | Class, then home | In class: feedback on every other group's pitch. At home: a reflection on the feedback their group received. **Reflection marked.** | Feedback from the class |

"Where" is the default. The teacher can change it, and a student who missed a
class phase can do their part from home before the deadline.

Phase 1 runs the same route as phase 3 on a small scale: notes are posted
anonymously, students star one, and the decider setting applies. This gives
the class a practice round of the voting before the big decision.

### Phase content

Each phase has a short teacher instruction and may hold normal blocks above
the submission box (for example a source pack in Understand, or the existing
brainstorm or mind map tools in Sketch). The **challenge brief** is a block
area at the top of the sprint and stays visible in every phase.

### Opening and closing

- A phase opens for a group **when the previous phase's deadline passes, or
  when everyone in the group has submitted it, whichever comes first.**
- A student can submit late. The map marks it as late.
- **Sketch:** a sketch submitted before the group's Decide gallery locks
  joins the gallery. After that, it is recorded but not voted on.
- **Decide** locks when everyone in the group has voted or the deadline
  passes. Then the decider rule runs.
- The teacher can **extend** a deadline for the whole class, one group or one
  student.

## 2. Criteria: one list, used three times

The teacher writes the criteria once for each sprint (2–5 short lines, for
example "Uses sources to explain why it matters"). Each criterion can be
linked to an outcome reached by the lesson's dot points (the same menu the
lesson syllabus card uses, `dotPointOutcomes` in
`apps/teaching/src/evidence/syllabus.ts`).

The same list is used three times:

1. **Decide:** students vote on each criterion ("Which idea best uses
   sources?").
2. **Test:** the class gives feedback on each pitch against each criterion.
3. **Marking:** the teacher marks the Prototype against each criterion.

The Reflection has its own short criteria list, by default one line:
"Explains what the test showed and what to change next." The teacher can
edit it and link it to outcomes.

Phases 1–3 and the class part of 5 carry **no marks**. They show up in the
markbook only as in, late or not in.

## 3. Groups and the decider

- The sprint has its own `groups[]`. Each group has an id, a name the
  students see (for example "Group 3" or a name the teacher picks), and its
  students (claimed initials, as for Quiz and Tutorial).
- A grouping screen lists the class roster. The teacher drags initials into
  groups, or uses **Even groups of N** to place them in order of the roster
  and then adjusts.
- Students see their own group's name and the initials of their teammates.
  For each phase they see a count ("3 of 4 in"), never who is missing.
  The teacher's map shows who.
- **Decider setting:** `top_vote | teacher`.
  - `top_vote`: the idea with the most criterion votes goes through as soon
    as voting locks. A tie goes to the teacher.
  - `teacher`: the group's top idea waits on the teacher's board with the
    vote heat map. The teacher **confirms** it or **picks another** idea from
    the gallery. The group sees "Your teacher is choosing" until then.
- Students only ever see the winning idea and the gallery. They never see
  authors, and they never see vote counts beside other ideas. They see the
  heat map, which shows which ideas did best on which criteria, without
  numbers.

## 4. Prototype parts

After the vote, still in Decide, the group writes a short **parts list**
(2–6 parts, for example "Panel text", "Artefact list", "Opening paragraph").
Each student claims one part. A part can be shared by two students when the
group is bigger than the list. A student who misses the Decide lesson claims
an unclaimed part from home.

In Prototype each student uploads or writes **their part**. One member
uploads the **pitch file**: whatever the group will show during the
2-minute pitch. Any member can replace it until the Prototype deadline.

Uploads accept PDF, images, or a link (Canva, Google Slides, a document).
That covers a PowerPoint saved as PDF and anything made in another tool.

## 5. Test: pitch and feedback

The teacher runs Test from the **Focus view** (`apps/teaching/src/teacher/focus/`):

1. Pick the next group. Focus view shows that group's pitch file and a
   2-minute timer. The timer is a prompt and does not stop the pitch.
2. **Open feedback.** Every student not in the presenting group gets a
   feedback card on their device. For each criterion they pick a level:
   *Starting · Showing · Strong*. Then they write one line on "What worked"
   and one on "One thing to try next".
3. **Close feedback**, then move to the next group.

- Feedback is anonymous to the presenting group. The teacher sees who gave
  it.
- Feedback goes through the hold-and-release moderation used by peer
  feedback (`apps/teaching/src/blocks/peer-feedback.ts`). Flagged feedback is
  held until the teacher releases it.
- Each student's "feedback given" counts as their class submission for
  Test.
- A presenting group sees its feedback when the teacher releases the round:
  levels as a small summary for each criterion, and the written lines as a
  list.

**Reflection (home).** Each student reads their group's feedback and answers
two prompts, editable by the teacher:

- "What did the feedback show your idea does well?"
- "What would you change next, and why?"

## 6. Teacher views

### Progress map

The sprint's teacher page opens on the **progress map**:

- Columns are the five phases. Each header shows the phase, where it
  happens and its countdown.
- Rows are the groups. Each cell holds one dot per student: filled = in,
  outlined = started, empty = not in, a small clock = late.
- A cell turns into a badge when the group is waiting on the teacher:
  "Choose idea" (decider), "Tie".
- Clicking a cell opens the **group board** at that phase: the notes, the
  gallery (authors visible to the teacher), the heat map, the parts and who
  claimed them, the uploads.
- Clicking one student's dot opens what they submitted. For Prototype and
  Reflection it opens the **marking panel**.

On a phone (390px) the map turns sideways: one group per card, with the five
phases as a row of small cells. A group card opens the board.

### Marking panel

For the selected student's part (Prototype) or reflection, the teacher sees
the group's pitch file beside it. They pick a level for each criterion
(*Starting · Showing · Strong*) and can add a comment. **Next student** moves
through the group.

## 7. Student view

A student opens the published sprint and claims their initials, as for
quizzes. They see:

- **The countdown** (the assessment `countdown` look) for the current phase,
  with the pitch date below it.
- **The phase stepper** (Understand → Test), with the current phase
  highlighted and the class or home badge.
- The challenge brief, which folds away.
- The current phase: the teacher's instruction, any blocks, and their
  submission box. Once they submit: "In. You can change it until [deadline]."
- **Their group's status line:** group name, teammates' initials, "3 of 4
  in".

All student-facing text says what students do and can do ("Pick the idea
that best uses sources") and never uses deficit phrasing.

## 8. Data, markbook, map

Storage follows the tutorial's pattern (`netlify/functions/_shared/tutorial.mjs`,
`published-tutorial.mjs`, `tutorial-groups.mjs`). The plan sets the exact
keys. Nothing personal goes in the public repo, fixtures or tests (invented
names only).

- **Lesson:** `pedagogical_mode: 'design_sprint'` and a `sprint` settings
  object (`apps/teaching/src/sprint/schema.ts`):
  `class_id`, `decider`, `criteria[] {id, text, outcome?}`,
  `reflection_criteria[]`, `phases[5] {key, where, due_date, due_time,
  instruction}`, `groups[] {id, name, students[]}`. Phase blocks live in the
  lesson body under one section marker per phase, as tutorial groups do.
- **Group record** (one per group): phase opened times, the group question,
  the chosen idea, `awaiting_teacher`, the parts list and claims, and the
  pitch file.
- **Student submission** (one per student per phase), overwritten in place:
  `{ phase, payload, submitted_at, late }`. Votes are stored in their own
  record per student and only read on the server to make the heat map. The
  student API never returns authors or raw counts.
- **Feedback round** (one per presenting group): opened and closed times,
  entries `{ from, levels{criterion: 1|2|3}, worked, next, status }` and
  moderation status.
- **Marks:** one per student for Prototype and one for Reflection,
  `{ levels{criterion: 1|2|3}, comment, marked_at }`.

### Student uploads (new)

Media upload today is teacher-only (`/api/media/upload` sits behind the
operator gate). The sprint adds a **student upload** path on the published
sprint endpoint:

- Only students who have claimed initials in this sprint's class, and only
  while the Prototype (or Sketch) phase is open for them.
- PDF and images only, up to 10 MB each (reusing `ALLOWED_MEDIA_MIME` minus
  audio), with a few files per student per sprint. Links are stored as text
  and opened in a new tab, never embedded.
- Files are kept apart from the teacher's media library, under the sprint's
  key, and served only to the teacher and to that student's group.
- The endpoint is rate limited like `published-tutorial.mjs`.

### Markbook

- One column per sprint, with two figures in the cell: Prototype and
  Reflection. Hover shows the levels for each criterion.
- Each marked criterion becomes an evidence item for that student, tagged
  with the criterion's linked outcome (`out:{id}`), with score = level and
  max = 3. The evidence layer, Patterns and Next steps pick them up with no
  special handling, as they do for quiz and tutorial evidence.
- Unmarked phases show in the column's detail as in, late or not in.

### Unit map

One dot at the sprint's first phase date, labelled with progress ("Phase 3
of 5").

## 9. Edge cases

- **Absent for a class phase:** they can submit from home until the
  deadline. Their dot is empty until then, and the group carries on at the
  deadline.
- **Absent for the pitch:** they still give feedback on the groups they can
  (rounds can be opened again later by the teacher for one student) and
  write the reflection at home.
- **Group of one:** they still sketch, vote on their one idea (it passes
  automatically), build every part and pitch.
- **Student moved between groups mid-sprint:** their past submissions stay
  with the old group's record. They pick up the new group at its current
  phase and claim an open part.
- **Nobody in a group sketched by the Decide deadline:** the group waits on
  the teacher ("No ideas in") and the teacher extends the deadline.
- **Whole-group absence on pitch day:** the teacher moves that group to the
  end of the running order or to another day; Test closes when every group
  has pitched.

## 10. Testing

- Unit: phase open rule (deadline or all in), late marks, gallery lock,
  vote tally and tie, decider paths, anonymity (the student API returns no
  author or count fields), part claims, upload rules (mime, size, phase,
  claim), feedback moderation, mark → evidence tags.
- Fixture: an invented Year 8 class of 20 in five groups, at different
  phases.
- Walk in preview at desktop and 390px: create → criteria → groups → publish
  → students through each phase (two devices) → decider confirm → uploads →
  Focus view pitch with feedback → reflection → marking → markbook column and
  evidence.
- Not covered by tests: Safari upload from a phone camera roll.

## Phases (commits in one PR)

1. `sprint` schema, editor (challenge, criteria with outcome links, five
   phases with deadlines, decider), grouping screen.
2. Student player: claim, stepper, countdown, phase submissions, group
   status line, phase open rule.
3. Anonymous gallery, criterion voting, heat map, decider (top vote and
   teacher), parts and claims.
4. Student uploads (endpoint, rules, storage) and the pitch file.
5. Teacher progress map and group board.
6. Test: Focus view pitch, feedback rounds with moderation, reflection.
7. Marking panel, markbook column, evidence tags, unit map dot.
