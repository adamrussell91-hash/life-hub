# Learning conditions (Teaching Hub)

Uses Tracey Tokuhama-Espinosa's Mind, Brain and Education (MBE) science, the evidence where psychology, education and neuroscience agree, in the Teaching Hub. Her principles are not added as one more framework. They sit underneath the tools that already exist and point out when a lesson, unit or class is missing a condition for learning.

This started as a concept doc. On 10 Nov 2026 Adam asked for all three ideas to be built; see **Built** below for what shipped and the defaults chosen for the open questions.

## Adam's asks (10 Nov 2026)

Out of four options, Adam kept three:

1. **Learning conditions check for each lesson.** A panel that reads the lesson's blocks and shows which learning conditions are present and which are missing. It gives no score.
2. **Spacing across a unit.** Finds outcomes taught once and never returned to, and offers to add retrieval at increasing gaps in later lessons.
3. **Readiness from evidence.** The markbook evidence suggests who gets support, core or extend in the next lesson's lenses. The timetable slot also informs how heavy that lesson should be.

The fourth option, a shared MBE grounding text for the agents with an evidence-level tag and a neuromyth guard, was not chosen. See Open questions.

## The rule behind all three

Tokuhama-Espinosa's Delphi panels sorted claims about learning by strength of evidence: well established, probably so, intelligent speculation, and neuromyth. These features act only on claims in the first two groups. The main ones:

| Principle (paraphrased) | Evidence level | Feature that uses it |
|---|---|---|
| New learning builds on what is already known | Well established | 1 (activation at the start), 2 |
| Without attention and memory, there is no learning | Well established | 1 (chunking, retrieval point), 2 |
| Retrieval spread over time beats one block of teaching | Well established (cognitive psychology) | 2 |
| Each brain is prepared differently to learn | Well established | 3 |
| Fatigue, sleep and stress affect learning | Well established / probably so | 3 (timetable slot) |
| Learning is social | Probably so | 1 (optional condition) |

Check her exact wording and numbering against the books before any of this text appears in the product.

## 1. Learning conditions check (one lesson)

### Sketch

- A teacher-only fold in the lesson editor, perhaps next to the existing coverage panel.
- Five or six conditions, each **present**, **missing** or **not relevant**, read from the blocks themselves:

| Condition | Present when the lesson has… |
|---|---|
| Brings back what students know | A `hinge_question`, `quiz_question`, `flashcards`, `cloze` or `self_check` before the first new-content block |
| New content in small chunks | No run of long `rich_text` / `explainer` blocks without a check (threshold is an open question) |
| A retrieval or check point | `hinge_question`, `question_set`, `quiz_question` or `self_check` in the middle of the lesson |
| A worked example before independent work | `faded_example` before a `question_set` |
| Ends with writing or recall | The last student-facing block is a lens with a Write it down step, `done`, `self_check` or a writing `question_set` |
| Support and extend | At least one lens with a level besides `core` |

- A missing condition shows one line on why it matters and a **Suggest a block** action. That action asks Ann or Clementine for a schema-valid proposal through the existing proposal flow, which the teacher confirms.
- No score, no traffic lights, no percentage. A lesson with three gaps on purpose (a test, an excursion debrief) is fine. Each condition can be marked **not for this lesson**.

### What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Block types | `apps/teaching/src/schemas/block.ts` | The check reads block types and their order. It needs no new data. |
| Lens levels `support` / `core` / `extend` | `apps/teaching/src/schemas/lens.ts` | Support and extend condition |
| "Every lens ends in writing" | Lens registry spec (`apps/teaching/docs/superpowers/specs/2026-10-21-lens-registry-and-formats-design.md`) | Ends with writing or recall condition |
| "Reduce overload" steer | `apps/teaching/src/ai/agent-protocols.ts` | Chunking suggestions |
| Proposal and Confirm flow | `apps/teaching/src/ai/proposals.ts`, `apply-proposal.ts` | Suggest a block, without silently changing the lesson |
| Coverage panel | `apps/teaching/src/alignment/coverage-panel.ts` | A neighbour in the editor, and a visual pattern to follow |

## 2. Spacing across a unit

### Sketch

- On the unit's coverage view, each dot point already lists the lessons that teach it (`CoverageItem.lessons` in `apps/teaching/src/alignment/coverage.ts`). Add the scheduled dates of those lessons.
- Mark a dot point **taught once** when its only lessons fall within a few days of each other, with nothing after them before the unit's assessment.
- For each one, offer a **spacing plan**: short retrieval items placed at about the next lesson, a week later, and the lesson before the assessment. The gaps are a starting suggestion, not a rule.
- Accepting the plan proposes `quiz_question`, `flashcards` or `cloze` blocks in the opening of those later lessons. Each lesson's proposal is confirmed separately in that lesson.
- Retrieval items are drawn from the original lesson's own content (its questions, definitions and examples), so they test what was actually taught.
- Once quiz results exist, the evidence that already says a class is weak on a point (`reteachList` in `markbook/insight.ts`, priorities in `evidence/priorities.ts`) moves that point up the spacing list.

### What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Dot point to lessons map | `alignment/coverage.ts` (`unitCoverage`, `CoverageItem.lessons`) | Find points taught once |
| Lesson dates | `schedule/` (`generate-dates.ts`, `class-calendar-model.ts`, `unit-progress.ts`) | Gaps in days, not lesson count |
| Upcoming lessons with assessment flag | `UpcomingLesson` in `evidence/priorities.ts` | Place the last retrieval before the assessment |
| Class weak points | `markbook/insight.ts` (`reteachList`), `evidence/priorities.ts` | Rank which points to space first |
| Quiz and flashcard blocks | `quiz/`, `flashcards` block | The retrieval items themselves |

## 3. Readiness from evidence

### Sketch

- When a lesson has a lens on a block, the markbook's Next steps evidence suggests groups for it: **support** for students weak on the lens's dot points, **extend** for those secure on them, **core** for everyone else.
- The suggestion is shown on the teacher view only, as a group list the teacher can change. Students never see a label. The student view still shows one lens, and the teacher hands out the level (printed copy, link or verbal) as they do now.
- **Timetable slot.** When the lesson's scheduled period falls late in the day, straight after lunch or at the end of the week, the conditions check (feature 1) adds a gentle note: this lesson may need less new content and more retrieval. The note gives a reason, never a block.

### What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Support / extend groups by outcome | `markbook/next-view.ts`, `evidence/next-moves.ts`, `evidence/groups.ts` | Source of the suggested groups |
| Saved groups | `markbook/schema.ts` (`SavedGroup`) | Reuse a saved group instead of a new one |
| Lens levels | `schemas/lens.ts` | Where the suggestion lands |
| Timetable sessions | `schedule/timetable.d.ts` (`TimetableSession`: date, period, times) | Late-day and end-of-week notes |

## Built (10 Nov 2026)

All three ideas, in `apps/teaching/src/conditions/`:

| Piece | File | Where it shows |
|---|---|---|
| Lesson conditions (pure) | `lesson-conditions.ts` | |
| Spacing plan (pure) | `spacing.ts` | |
| Readiness groups and timetable notes (pure) | `readiness.ts` | |
| Conditions panel | `conditions-panel.ts`, `conditions.css` | **Conditions** chip in the lesson's meta row, beside Feedback; the panel opens above the canvas |
| Unit spacing list | `spacing-panel.ts` | Under the coverage panel on the unit map (teacher view) |
| Page wiring | `page-context.ts` | Lesson editor passes the unit's schedule, classes and markbook loader |

- **Suggest a block** and **Suggest retrieval** send a message to the lesson agent through a new `ask()` on the AI panel. The answer arrives as a normal proposal, so nothing changes without Accept.
- **Not for this lesson** saves to a new teacher-only lesson field, `conditions_off`. It is not copied to published lessons.
- The lesson panel's **Bring back** section lists the dot points the unit's spacing plan places in this lesson.
- **Readiness** loads a class's markbook only when the teacher taps **Groups for …**. Names show only on the teacher page.
- Tests: `apps/teaching/tests/unit/learning-conditions.test.ts`.

### Defaults chosen for the open questions

| Question | Default in the build | Where to change it |
|---|---|---|
| Chunking threshold | More than 3 content blocks in a row, or more than 600 words, with no check between | `MAX_CONTENT_RUN`, `MAX_CONTENT_WORDS` in `lesson-conditions.ts` |
| Spacing gaps | Next dated lesson, the first lesson 7+ days on, the last teaching lesson before the next assessment. Teaching a point again 3+ days later counts as spaced | `WEEK_GAP_DAYS`, `SPACED_AFTER_DAYS` in `spacing.ts` |
| Spacing scope | Within one unit, using the class with the most dated lessons | `unitSchedule` in `teacher/network-context.ts` |
| Weak and secure | The markbook's own bands (`BANDS` in `evidence/constants.ts`): below 50% support, 80%+ extend, at least 2 marked items | `readiness.ts` |
| Tiring slots | Starts at 13:30 or later, starts 12:45–13:29 (after lunch), or a Friday | `LATE_START`, `AFTER_LUNCH` in `readiness.ts` |
| Mobile | The panel stacks into one column on its own width (container query), so it also works beside the open chat | `conditions.css` |
| Quiz and assessment lessons | The lesson conditions do not apply; spacing and readiness still show | `conditionsApply` |

Still open: whether the agent grounding text (evidence levels, neuromyth guard) should follow, and whether retrieval suggestions should rank by the class's weakest points.

## Must not

- No score, ranking or "MBE compliance" number for a lesson, unit or teacher.
- No student-facing labels for support, core or extend. No group names on any published page.
- No claims from the speculation or neuromyth groups (learning styles, left or right brain, brain gyms) in any copy or suggestion.
- No silent changes. Every added block goes through the proposal and Confirm flow.
- Real student names and marks stay in the private data store. Docs, tests, fixtures and screenshots use invented students.

## Open questions

- Should the agent grounding (the evidence-level tag and neuromyth guard) come back as a small slice? It would make Suggest a block in feature 1 more trustworthy.
- Chunking threshold for feature 1: number of blocks, word count, or the teacher's own estimated minutes?
- Spacing gaps for feature 2: fixed (next lesson, one week, pre-assessment) or adjusted to the unit's length?
- Does spacing work within one unit only, or carry key points into the next unit too?
- Feature 3: what counts as "weak" and "secure"? Reuse the markbook's existing bands or set new cut-offs?
- Which timetable slots count as late or tired? Should Adam set them once per school?
- Where does feature 1 live on mobile, where the lesson editor has less room?

## History

- 10 Nov 2026: built all three ideas (see Built); defaults recorded for the open questions.
- 10 Nov 2026: created from a Claude Code conversation about Tokuhama-Espinosa's MBE principles. Adam kept the lesson check, unit spacing and readiness ideas, and set aside the agent grounding text.
