# One chain: tagging and tracking in Teaching

Design approved in conversation, 2 November 2026. Examples here are invented. Real unit content stays in the private data repository and the live unit.

## The problem

Seven frameworks are tagged separately, and marks reach them by two routes that don't meet:

- The Grid counts every question on a lesson against that lesson's dot points, so a review quiz on a lesson with no dot points reaches none.
- Monitoring counts `kp:` tags on questions and has no link to dot points.
- Outcomes can be typed per question, and old codes linger there.

A teacher has to tag several things on each question, and the progress views still disagree.

## The model

There is one kind of work. Anything a student submits can carry any of these three tags, and one mark can do all of them:

```
Piece    → U → outcome, and the DU the piece sits in
Skill    → R → outcome
DU step  → that DU's step, passed by the teacher
```

Evidence task stops being a type. It is any auto-marked, written or voice item with a DU step on it.

| The work | Piece | Skill | DU step |
|---|---|---|---|
| Auto-marked | One, marked right or wrong | None by default | Optional. Full marks suggests a pass, and the teacher confirms |
| Written or voice | Expected pieces, ticked used or missed | Up to three, each with its own rung on the rubric | Optional. One or more, each passed on the rubric |

Rules:

1. Each knowledge piece names one U.
2. Each English skill names at least one R. Done in private data on 2 November.
3. Each U and R sits in at least one DU, and each DU has at least one U and one R. Flag gaps on the Plan tab, never block.
4. A piece's U must be one of its DU's dot points. Flag it if not.
5. Outcomes are derived, using shared links only (`dotPointOutcomes`). They are editable only on formal assessment tasks.
6. Concepts, processes and thinking skills stay as labels offered by the picked U and R. They never collect marks.

Approved decisions:

- **A skill rung never moves a DU by itself.** A dot point can sit in a different DU from the lesson's pieces, so R to DU is too coarse. DU progress comes from pieces and from step passes. The two still link in two ways: the same mark can record a rung and a step pass, and a DU's R points put their skills first in the chips when a DU step is on the work.
- **A skill counts towards every R it names in the focus area.** No extra tagging.
- **Publish warns on untagged questions and never blocks.**
- **Lesson dot points stay** for planning and maps. They count towards marks only when a question has neither a piece nor a skill.
- **Auto-marked questions take one piece**, because one right or wrong can't tell you which of two pieces was missed.

## Part 1: the chain

**Schema.** Add optional `dot_point` to `KnowledgePieceSchema` (`apps/teaching/src/deep/schema.ts`), using `DotPointRefSchema`. Regenerate the bundled schema copies in `netlify/functions/_shared`.

**Plan tab** (`deep/editor.ts`). Each piece gets a small picker listing the U points of its DU. The DU card shows flags for rules 1, 3 and 4.

**Evidence.** Change `withPointTags` in `apps/teaching/src/evidence/syllabus.ts` and its mirror in `netlify/functions/_shared/profile-evidence.mjs`, for each quiz item:

| Item has | `dp:` tags come from |
|---|---|
| `kp:` tag | That piece's `dot_point`. A piece with none falls through to the next rows. |
| `skill:` tag | Every R the skill names in the unit's focus area |
| Both | Both of the above |
| Neither | The lesson's dot points, as today |

`out:` tags on quiz items come from those `dp:` tags through `dotPointOutcomes`. Stored `key.outcomes` are ignored for quiz items and left in place. Assessment criteria keep their outcomes.

The chain is worked out when marks are read, so past attempts on questions that already carry pieces or skills move at once with no republish. Grid numbers will shift when this ships, and that is intended.

## Part 2: lesson planning

After dot points are ticked in the Syllabus card (`alignment/lesson-dot-points.ts`), a new step offers:

- **Pieces** whose U is ticked.
- **Skills** that name a ticked R, shared links first.

Saved as optional `focus_pieces` and `focus_skills` on the lesson (`schemas/lesson.ts`). They only decide which chips come first. Lines, activities, thinking skills, concepts and processes are unchanged. The picks must be stripped from anything students receive.

The block menu's "Deep understanding…" sheet (`deep/block-menu.ts`) also lists the lesson's picks first.

## Part 3: tagging a question

In `quiz/builder.ts`, the tags leave the "optional" fold and become a visible row under the question: **What does this check?**

The same row appears on every submittable item, including Voice blocks and written tasks outside quizzes:

- **Piece:** on auto-marked kinds, one piece chosen from chips. On written and voice, up to three expected pieces saved as `deep_targets` on the block, never `question.pieces`. The lesson's picks come first, then the rest of the unit grouped by DU, with taught pieces ahead of untaught. A lesson with no picks, such as a review quiz, opens straight on the grouped list.
- **Skill:** on written and voice, up to three. Next steps keep working off `q.skills`.
- **DU step:** on anything, optional. Adding one shows its pass checks, and puts that DU's pieces and its R points' skills first in the chips above.
- **Outcomes field:** removed from the builder.

Schemas are not narrowed. A question with several tags from before keeps counting and shows them all, and picking a new one replaces them.

**Several steps on one item.** `deep_step` holds one `{du, step}` today (`deep/block-tags.ts`). Read it as a list, with an old single value treated as a list of one. Each step keeps its own pass checks. `placements` in `deep/derive.ts` keeps only the first task for a step, so it must list every task for that step, and the Plan tab's "No evidence task" gap reads from that list. The stripping in `blocks/visibility.ts` and `teaching-student.mjs` covers any new setting key.

**Publish.** Before publishing, count questions with no piece and no skill, and show a line that doesn't stop the publish:

- On a lesson with dot points: "2 of 6 questions have no piece or skill, so they only count towards this lesson's dot points."
- On a lesson without: "2 of 6 questions don't reach anything yet."

Each links to the first such question.

**The rubric.** Tag once, and the marking rubric builds itself. There is no separate rubric to write. On the marking screen, everything the work is tagged with sits in one panel beside the student's work:

| Rubric row | The teacher | What it records |
|---|---|---|
| Each skill | Taps a rung: Below, Capable, Skilled, Accomplished or Excellent. The rung's "Look for" indicators show on tap | That skill's own evidence, and through it the R |
| Each expected piece | Taps Used or Missed | The piece's ring |
| Add a piece | Adds a piece the student used unprompted | A "used" ring, so unplanned evidence still counts |
| Each DU step | Ticks the pass checks, presses Pass | The step pass |
| Mark | Keeps or changes the mark suggested from the rungs | The score |
| Next step | Keeps or changes the one suggested from the lowest rung | What the student works on next |

- **Each skill has its own judgement.** This replaces "the same mark counts for both". Written work may carry up to three skills, and three expected pieces (the `deep_targets` limit).
- **Evidence.** `answerEvidence` in `quiz/evidence.ts` gives every skill tag the same share today. A rubric rung produces one evidence item per skill, with the share taken from `RUNG_CUTS` (below Capable counts as 0.2), so `rungOf` reads back the rung the teacher tapped. A skill with no rung tapped falls back to the mark's share. The rungs are stored with the feedback record for that work.
- **The AI read.** Where a read has run, its rungs and ticks show dashed until kept, with one "Keep the AI's read" control. It never passes a step. Adding rungs to the read makes each read a little longer, so measure the cost before relying on it.
- **Where it lives.** One component, mounted in `marking/mark-piece.ts` (written answers, writing and sprint reflections) and in the Voice marking dock, replacing its checklist. Check whether formal assessment criteria use the same host. If so, their criteria become rows here too, keeping their outcomes.
- **What students see.** Their skill rungs, the pieces they used and their next step. Pass checks, missed rings and AI reads stay with the teacher, matching the existing strip of `deep_*` settings.

No tagging while marking, except Add a piece.

**Auto-marked with a DU step.** Full marks puts a "ready to pass" note on the student in that DU's lens. The teacher confirms it, because a pass is always a teacher's call.

## Part 4: Ann

- `questionTagIssues` in `ai/quiz-proposal.ts`: replace "add outcomes" and "add skills" with one requirement: an auto-marked question names one piece, and a written one names one skill.
- `list_question_tags` returns the unit's pieces with the lesson's picks marked.
- Her prompt stops asking for outcomes.

No new AI calls and no new running cost.

## Part 5: one progress view

The Markbook's Grid (`markbook/syllabus-grid.ts`) becomes the single view, with two lenses:

- **By dot point.** U rows open into their pieces, with each student's circle. R rows open into their skills, with each skill's rung shown separately and never averaged across skills. Outcomes and labels stay as they are.
- **By deep understanding.** The Monitoring lanes (`deep/monitor-view.ts`) moved here, not rewritten. Circles and step rules in `deep/track.ts` are unchanged. The DU lists its R points as the skills it needs, and a student's rungs on those skills sit beside their step for reading, with no credit from them.

The old Monitoring entry point opens this view on the second lens. Rows and columns follow the wide-table rule: they scroll inside a page-width box, tested with 50+ columns.

## Back-fix, after the build

This is data work on live units, not part of the build:

1. Save the 36 piece-to-U links onto the unit from the private file `data/teaching/piece-links/`.
2. Add a second question for any piece with only one, because Step 1 needs a right answer on two separate days.
3. Repair skill tags that read `undefined`.
4. Give written answers a skill, then republish.
5. Tag the questions with no piece or skill, then republish.

## Not changing

- Step rules, circles and the two-day rule.
- Assessment criteria and their outcomes.
- The unit map's lines.
- What students see, except that their progress may read differently where marks now reach more dot points.

## Checks

- Unit tests for the chain table, in both the app and the `.mjs` mirror. They must agree.
- Test: a piece with no `dot_point` falls back without losing the mark.
- Test: a skill naming two R points counts on both, and moves no DU by itself.
- Test: one written answer with two skills on different rungs, two expected pieces and two DU steps records all of them from one marking pass, and each skill reads back its own rung.
- Test: an old single `deep_step` reads as a list of one and stays passable.
- Test: a focus-area filter leaves R points from other focus areas out.
- Test: the student payload has no `focus_pieces`, `focus_skills` or piece `dot_point`.
- Walk at desktop and 390px: make a quiz, publish with an untagged question, mark a written answer, read both lenses. Then Safari.
- Fixtures use invented units. This build doesn't touch grove, `packages/` or the Tasks app, so the gate should stay off the full suite.

## Build shape

One PR, five phases as commits, gate once at the end. Parts 1 to 4 can ship without part 5 if the view merge needs its own pass.
