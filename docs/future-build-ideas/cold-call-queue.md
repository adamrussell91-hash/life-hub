# Cold call queue (Teaching Hub)

A teacher-only helper for cold calling. It lines up the class's names like boxes on a factory belt, so Adam always sees who is coming next. He taps the name at the front once that student has answered, gives a quick 1, 2 or 3 for how well they answered, and the box slides off while the next name shuffles in from the edge. Over time those taps build a log on the class page showing who has been asked, in which lesson, and how strong their answers were.

It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice.

## Adam's asks (22 Oct 2026)

- **It lives in a teacher note.** Pretty much part of the teacher note on the teacher view, not a new student-facing block. Students never see it.
- **A belt of names.** Names sit in a row like boxes on a conveyor (for example Jordan, Priya, Sam, Mei). The next few are always visible, so the teacher can glance ahead.
- **Tick and slide.** Tap the front name when that student has answered. It drops off and the next name slides in from the edge of the screen.
- **Cold call questions alongside.** The same area holds Adam's list of cold call questions for the lesson, so the questions and the queue sit together.
- **A quick quality mark.** On the tap, a 1, 2 or 3 for how well they answered. Super quick and simple: one tap for the name, one for the mark.
- **A log on the class.** The class view keeps a running record: how many cold call questions each student has answered, in which lesson, and how well. The point is to spot students who are rarely asked or whose answers are weak, so Adam can change what he does.

## Sketch

**In the lesson (teacher view)**

- A belt along the top of the teacher note: the front box is large, the next three or four get smaller towards the edge.
- Tap the front box: a 1 · 2 · 3 strip pops up under it. Tap a number and the box slides off. A skip or "not here" option lets a name go to the back of the belt with no mark.
- Below the belt: the lesson's cold call questions, one per line. The current question is highlighted and moves on when a name is marked, or the teacher taps any question to jump to it.
- The order is shuffled at the start of the lesson, weighted so students asked least often this term come up earlier.

**On the class page (teacher only)**

- A table with one row per student: questions answered this term, average mark, last asked (lesson and date).
- Light flags for "not asked in the last N lessons" and "mostly 1s".
- Tap a student to see each cold call: lesson, question and mark.

## What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Teacher note block (teacher only) | `teacher_note` in `apps/teaching/src/blocks/create-block.ts` and `block-meta.ts` | Host the belt and question list here, as an optional cold call mode on the note |
| Class Students section, with "skip in picker" | Built for the classroom tools ([classroom-tools.md](classroom-tools.md)) | Source of names. Respect the same skip flag |
| Name picker "don't pick twice" | Classroom tools name picker | Same idea as the belt, but the belt shows the queue ahead instead of a surprise spin |
| Markbook (spec in progress on `claude/markbook`) | Markbook spec | Possible home for the per-student cold call log, next to quiz results |

## Privacy

Real students' names and their marks stay in the hub's private data store only. They never go in the public repo, tests, fixtures, screenshots or build assets. Names in this doc are invented. The log is teacher-only and never reaches a student or published page.

## Open questions

- Does the log sit on the class page, inside the markbook, or both?
- Shuffle order: fully random, weighted towards the least asked, or a fixed seating order?
- Are the cold call questions written ahead in the lesson, or typed live? Can a question be reused across classes?
- What happens to a skipped or absent student: back of the belt, or out for this lesson?
- Should the 1, 2, 3 have fixed meanings (for example 1 = no answer or wrong, 2 = partly there, 3 = strong)?
- Could the class log feed Clare or the student profile later, or should it stay inside Teaching?

## History

- 22 Oct 2026: idea captured.
