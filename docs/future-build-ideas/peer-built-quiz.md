# Peer-built weekly review: quiz lessons fed by student questions

Break out of the "every page is a plain lesson" box. A lesson in a unit can be set to **Quiz**. Through the week, a special **Question drop** block in ordinary lessons asks students to write a question (short answer, multiple choice, and so on, with a mark value). Each submission feeds into the quiz lesson the block points at. Adam reviews, edits and approves the pool in the teacher view, and the approved questions become the weekly review quiz. Because it is a quiz, it gets real quiz features: timers, hints and the like.

It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice.

## Adam's asks

- A lesson can be a **Quiz** rather than a plain lesson. First use: a **weekly review**.
- A **specialised block** in other lessons lets students **submit a question**: short answer, multiple choice, "whatever", with a **mark value**.
- In that block's setup Adam chooses **which quiz lesson** the questions contribute to.
- Every submitted question lands in Adam's **teacher view of that quiz** to **edit, approve or reject**.
- Approved questions make the quiz. It is **peer built**, teacher checked.
- The quiz has **specialised quiz features**: timers, hints and other good quiz mechanics.

## What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Question kinds `short_answer`, `multiple_choice`, with options and response space | `QuestionItemSchema`, `QuestionKindSchema` in `apps/teaching/src/schemas/block.ts` | Starting shape for a submitted question. Needs an answer key, marks and hint added |
| Question set block | `QuestionSetBlockSchema` | Closest existing "list of questions" block; the quiz body could reuse its renderer for layout |
| Peer feedback: join with code, silent symbol per device, create-only blob per student, teacher moderation and release, word filter | `netlify/functions/_shared/peer-feedback.mjs`, `peer-feedback-filter.mjs` | The whole anonymous-submission and teacher-moderation pattern. Submissions are one create-only blob per symbol; flagged text is held |
| Lesson record with `unit_id` and `sequence` | `apps/teaching/src/schemas/lesson.ts` | Lessons have **no type field today**. A quiz lesson needs one (`lesson_kind: 'lesson' \| 'quiz'`) |
| Self check, flashcards, cloze | `block.ts` | Quiz mechanics to borrow from (reveal, shuffle) |

## The flow

1. **Set up the quiz.** In a unit, create a lesson and set its kind to **Quiz**. Give it a window, e.g. "Week 4 review, closes Friday 9am".
2. **Drop the block.** In Monday's and Wednesday's lessons, add a **Question drop** block. Its setup has one key field: **Feeds into → Week 4 review**. Optional: allowed question types, a mark range (1–3), a topic hint ("a question about today's poem"), max one or two per student.
3. **Students write.** In the block a student picks a type, writes the question, the answer (or options with the correct one ticked), the marks, and optionally a hint. Submit. They see "Sent to Week 4 review" and can't edit after that.
4. **Adam reviews.** The quiz lesson's teacher view gains a **Submitted** tray: every question, grouped by source lesson, with the student's symbol, a word-filter flag where it tripped, and Approve / Edit / Reject. Dragging approved questions into order builds the quiz. Duplicates get grouped so Adam picks the best of five near-identical questions.
5. **Publish.** The quiz publishes like any lesson. Students take it.
6. **After.** Results show per question, and optionally credit the author: "Your question was used: 18 of 24 got it right".

## Quiz features (menu, not a decision)

- **Timer:** whole-quiz countdown, or per-question. Soft (shows time) or hard (locks on zero).
- **Hints:** student-written or teacher-written, revealed on tap, costing a fraction of the marks.
- **Marks:** per question from the block, editable by Adam. Auto-marked for multiple choice; short answer accepts a list of accepted answers, or goes to Adam to mark.
- **Shuffle** question and option order.
- **Attempts:** one shot, or retry wrong ones.
- **Instant vs held feedback:** show right/wrong after each question, or only at the end, or only once Adam releases it.
- **Confidence tap:** "how sure are you?" before submitting. Cheap, and very useful to see which questions the class confidently got wrong.
- **Live mode:** Adam runs it from the front, one question at a time, class answers on devices, results bar after each (Kahoot-style, without the leaderboard pressure unless he wants it).
- **Question author credit:** a small "written by a classmate" tag, or the author's symbol when symbols are shown.

## Data sketch

- `LessonSchema` gains `lesson_kind: 'lesson' | 'quiz'` (default `lesson`) and, for quizzes, `quiz: { opens_at?, closes_at?, timer?, shuffle?, attempts?, feedback: 'instant' | 'end' | 'released' }`.
- New block `question_drop`: `content: { target_quiz_id, prompt?, allowed_kinds, marks: { min, max }, per_student_max }`.
- Submissions, one create-only blob per student per drop:
  `question_drop/{quiz}/{source_lesson}/{block}/{symbol}/{n}` → `{ kind, prompt, options?, answer, accepted?, marks, hint?, flagged }`.
  Keyed by the **quiz**, so the quiz's teacher view lists one prefix to find everything feeding it.
- Teacher review writes `question_drop/{quiz}/review/{submission_id}` → `{ status: approved | rejected, edited?: {…} }`. Approved questions are copied into the quiz lesson as a new `quiz_question` block (so the published quiz is a normal lesson payload, and answer keys are stripped from the student copy).
- Student attempts: `quiz_attempts/{quiz}/{session}/{symbol}` → answers, times, hints used.

## Things to settle

- **Who is "a student"?** The hub has no student logins; peer feedback uses a join code and a silent device symbol per session. A question written on Monday and a quiz taken on Friday are different sessions, so authorship credit across the week does not work as-is. Options: (a) no credit, fully anonymous; (b) a persistent class symbol per device; (c) student logins. **Open question.**
- **Answer keys from students will be wrong sometimes.** Edit must cover the answer, not just the wording, and Approve should show the answer prominently.
- **Spam and cruelty.** Reuse the peer feedback word filter. Flagged submissions sit in a separate pile and never auto-approve.
- **Target link breaks.** If the target quiz is deleted or moved to another unit, the drop block shows "Not feeding anywhere" in teacher view and blocks publish, like other publish block issues.
- **One quiz, many sources.** Should a quiz be able to say "accept from any lesson in this unit" so Adam doesn't set the target on every block? **Open question.**
- **Beyond weekly review.** Same machinery could do an end-of-unit test, an exit-ticket bank, or a class-built flashcard deck. Keep the quiz kind general, the weekly review is the first use.

## Suggested first slice (for discussion)

Quiz lesson kind + Question drop block (multiple choice and short answer only) + teacher Submitted tray with Approve/Edit/Reject + a plain quiz player with marks and shuffle. Timers, hints, live mode and author credit come after.

## History

- **2026-10-17:** Created from Adam's idea: quiz lesson kind, question drop block feeding a weekly review, teacher approval tray, quiz features menu.
