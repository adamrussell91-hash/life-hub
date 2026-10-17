# Peer-built weekly review: quiz lessons fed by student questions

Break out of the "every page is a plain lesson" box. A lesson in a unit can be set to **Quiz**. Through the week, a special **Question drop** block in ordinary lessons asks students to write a question (short answer, multiple choice, and so on, with a mark value). Each submission feeds into the quiz lesson the block points at. Adam reviews, edits and approves the pool in the teacher view, and the approved questions become the weekly review quiz. Because it is a quiz, it gets real quiz features: timers, hints and the like.

**Status: built (17 October 2026).** Adam asked for the whole thing. Everything below shipped, including every question type, timers, hints, attempts, held results, confidence, teacher marking and live mode. Code: `apps/teaching/src/quiz/`, `apps/teaching/src/blocks/question-drop.ts`, `apps/teaching/src/blocks/quiz-question.ts`, `netlify/functions/_shared/quiz.mjs`, `netlify/functions/_shared/question-drop.mjs`.

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
| Lesson types (`pedagogical_mode`): Lab, Workshop, Lesson (default), Lecture, Tutorial, Seminar, Project, Case Study, Game, Station Rotation, Design Sprint, Assessment | `apps/teaching/src/curriculum/pedagogical-mode.ts`, picker in the lesson canvas and create modal, filter and column in the lessons library | Today these are **labels only**: they change nothing about how a lesson behaves for students. Add **Quiz** as a 13th type; it is the first type that changes behaviour |
| Self check, flashcards, cloze | `block.ts` | Quiz mechanics to borrow from (reveal, shuffle) |

## The flow

1. **Set up the quiz.** In a unit, create a lesson and set its kind to **Quiz**. Give it a window, e.g. "Week 4 review, closes Friday 9am".
2. **Drop the block.** In Monday's and Wednesday's lessons, add a **Question drop** block. Its setup has one key field: **Feeds into**, a drop-down listing only the lessons in this unit set to Quiz. Adam picks the target on every block so the questions stay tied to what was taught that week. Optional: allowed question types, a mark range (1–3), a topic hint ("a question about today's poem"), max one or two per student.
3. **Students write.** In the block a student picks a type, writes the question, the answer (or options with the correct one ticked), the marks, and optionally a hint. Submit. They see "Sent to Week 4 review" and can't edit after that.
4. **Adam reviews.** The quiz lesson's teacher view gains a **Submitted** tray: every question, grouped by source lesson, with the student's symbol, a word-filter flag where it tripped, and Approve / Edit / Reject. Dragging approved questions into order builds the quiz. Duplicates get grouped so Adam picks the best of five near-identical questions.
5. **Publish.** The quiz publishes like any lesson. Students take it.
6. **After.** Results show per question. Authors are never credited or shown.

## Question types

Students build these on a phone, so each type needs a builder that is quick to fill in, not just a player. The tiers below are a proposal, not a decision.

### Tier 1: simple builders, auto-marked

| Type | Student builds | Taker does | Marking |
|---|---|---|---|
| Multiple choice | Question, 2–5 options, tick one | Picks one | Auto |
| Multi-select | Question, options, tick several | Picks all that apply | Auto, part marks per correct pick |
| True / false | Statement, true or false, optional "why" | Taps true or false | Auto |
| Short answer | Question, one or more accepted answers | Types a word or phrase | Auto against accepted answers, unsure matches go to Adam |
| Fill the gap | Sentence or quote, tap words to blank them out | Fills each gap, typed or from a word bank | Auto per gap |
| Odd one out | Four items, mark the odd one, say why | Picks it | Auto, the "why" is shown as the explanation |

### Tier 2: richer builders, still auto-marked

| Type | Student builds | Taker does | Marking |
|---|---|---|---|
| Matching pairs | 3–6 pairs (term ↔ definition, quote ↔ technique, character ↔ quote) | Drags or taps to pair | Auto per pair |
| Put in order | 3–6 items in the right order (plot events, essay paragraph, timeline) | Drags into order | Auto, part marks for items in place |
| Sort into groups | 2–3 group names, items in each (metaphor vs simile, protagonist vs antagonist) | Drops items into groups | Auto per item |
| Quote → technique | A quote, the technique it uses from the literary elements list | Picks the technique | Auto. Ties into the existing technique cards and flashcard kinds |
| Find it in the text | A short passage, tap the line or words that answer the question | Taps the line or words | Auto on the anchored range, reusing annotation anchors |
| Label the image | Upload or pick an image, drop numbered pins, name each | Names each pin, or matches labels to pins | Auto per pin |

### Tier 3: teacher marked

| Type | Student builds | Taker does | Marking |
|---|---|---|---|
| Extended response | Question, a model answer, a simple marking guide | Writes a paragraph | Adam marks, with the model answer beside it |
| Explain the effect | A quote and its technique | Explains the effect on the reader | Adam marks |

### Shared by every type

- **Marks** set by the student within the block's range, editable by Adam.
- **Hint** (optional) and **explanation** shown after answering (optional).
- **Image** on the question (optional).
- Adam's block setup can limit which types are allowed, e.g. only Quote → technique after a poetry lesson.

## Quiz features (menu, not a decision)

- **Timer:** whole-quiz countdown, or per-question. Soft (shows time) or hard (locks on zero).
- **Hints:** student-written or teacher-written, revealed on tap, costing a fraction of the marks.
- **Marks:** per question from the block, editable by Adam. Auto-marked for multiple choice; short answer accepts a list of accepted answers, or goes to Adam to mark.
- **Shuffle** question and option order.
- **Attempts:** one shot, or retry wrong ones.
- **Instant vs held feedback:** show right/wrong after each question, or only at the end, or only once Adam releases it.
- **Confidence tap:** "how sure are you?" before submitting. Cheap, and very useful to see which questions the class confidently got wrong.
- **Live mode:** Adam runs it from the front, one question at a time, class answers on devices, results bar after each (Kahoot-style, without the leaderboard pressure unless he wants it).

## Data sketch

- `PEDAGOGICAL_MODES` gains `'quiz'` (label **Quiz**). No new lesson field for the type itself. `LessonSchema` gains, for quizzes only, `quiz: { opens_at?, closes_at?, timer?, shuffle?, attempts?, feedback: 'instant' | 'end' | 'released' }`.
- New block `question_drop`: `content: { target_quiz_id /* must be a quiz lesson in the same unit */, prompt?, allowed_kinds, marks: { min, max }, per_student_max }`.
- Submissions, one create-only blob per student per drop:
  `question_drop/{quiz}/{source_lesson}/{block}/{symbol}/{n}` → `{ kind, prompt, body, marks, hint?, explanation?, image?, flagged }`, where `body` is a per-type union (options and correct ids, pairs, ordered items, groups, gap positions, anchor range, pins, model answer).
  Keyed by the **quiz**, so the quiz's teacher view lists one prefix to find everything feeding it.
- Teacher review writes `question_drop/{quiz}/review/{submission_id}` → `{ status: approved | rejected, edited?: {…} }`. Approved questions are copied into the quiz lesson as a new `quiz_question` block (so the published quiz is a normal lesson payload, and answer keys are stripped from the student copy).
- Student attempts: `quiz_attempts/{quiz}/{session}/{symbol}` → answers, times, hints used.

## Things to settle

- **Identity.** No author credit, so the per-session device symbol from peer feedback is enough: it only needs to cap submissions per student and let Adam see that five questions came from one person.
- **Answer keys from students will be wrong sometimes.** Edit must cover the answer, not just the wording, and Approve should show the answer prominently.
- **Spam and cruelty.** Reuse the peer feedback word filter. Flagged submissions sit in a separate pile and never auto-approve.
- **Target link breaks.** If the target quiz is deleted or moved to another unit, the drop block shows "Not feeding anywhere" in teacher view and blocks publish, like other publish block issues.
- **Beyond weekly review.** Same machinery could do an end-of-unit test, an exit-ticket bank, or a class-built flashcard deck. Keep the quiz kind general, the weekly review is the first use.

## Suggested first slice (for discussion)

Quiz lesson kind + Question drop block with the **Feeds into** drop-down + teacher Submitted tray with Approve/Edit/Reject + a quiz player with marks and shuffle, carrying **all of Tier 1 and Matching pairs, Put in order and Quote → technique** from Tier 2. Remaining Tier 2 types, Tier 3, timers, hints and live mode follow.

## Decided

- **2026-10-17:** Quiz is a new lesson type alongside the existing twelve (`pedagogical_mode: 'quiz'`), not a separate field. **Assessment** stays as is: it is a label for formal assessment tasks, and a peer-built weekly review is not one. The **Feeds into** drop-down lists lessons in the unit whose type is Quiz.
- **2026-10-17:** No author credit anywhere. It is not needed and has no educational value.
- **2026-10-17:** Adam picks the target quiz on each Question drop block, from a drop-down of the unit's lessons set to Quiz, so questions stay tied to that week's teaching. No "accept from any lesson" option.
- **2026-10-17:** Multiple choice and short answer are the floor, not the ceiling. The block offers a wide range of question types.

## History

- **2026-10-17:** Created from Adam's idea: quiz lesson kind, question drop block feeding a weekly review, teacher approval tray, quiz features menu.
- **2026-10-17:** Recorded decisions (no author credit, per-block target from a quiz-only drop-down). Added the question types section in three tiers and widened the first slice.
- **2026-10-17:** Corrected the claim that lessons have no type: twelve label-only types already exist. Quiz becomes the thirteenth, and the first that changes behaviour.
- **2026-10-17:** Built in full. Quiz lessons, Question drop, all 14 question types, approval tray, settings, results with marking and release, and live mode with a join code and board view.
