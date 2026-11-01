# Next step in every writing box: design

Date: 31 October 2026
Mockups: `docs/mockups/next-step/next-step.html` (the student loop) and `docs/mockups/next-step/next-step-bank.html` (builder bank, code ladders, what each student sees). All people, poems and wording in them are invented.

## Why

The teacher already codes students' writing and vivas (TS, AR, E …) and returns it to the student's profile page. That feedback sits on a page the student has to go and visit. This build takes the feedback to where the writing happens: every time a student answers a question in a lesson, the box shows **one next step, just for them**, on the skill that question practises.

The design follows the feedback research:

- **No grade next to the work.** Butler (1988): comments alone improved work; a grade beside the comment cancelled the gain. So the box never shows a rung, a level or a count.
- **"Where to next" is the powerful part.** Hattie & Timperley (2007): feed-forward drives the largest gains and is the feedback teachers give least.
- **Feedback should cause thinking, and be more work for the student than the teacher** (Wiliam, *Embedded Formative Assessment*). The student finds and shows where they took the step.
- **Self-regulation is the strongest level.** The student checks their own work against the step before anyone else does.

## Decisions made with the teacher

| Question | Decision |
|---|---|
| What the box shows | One next step, worded as an action for this question. Never the student's rung, a level, a score or a count. |
| Matching | Like for like, by **skill**. Each question/writing box is tagged with skills in the lesson builder. No lesson-level fallback: an untagged box shows nothing. |
| Visual language | The teacher's code chips (TS, AR …) in their library colours, the same pills as marking and the progress page. |
| What makes it personal | Three inputs: the student's **repeating code** on that skill, their **current rung** on that skill (used, never shown), and **the question itself**. Two students with TS see different steps if they sit on different rungs. |
| Where the words come from | A **code ladder** (one positive step per code per rung, any question) → a **question bank** for each box (the ladder rewritten for this question). Students are served from the bank; nothing is generated while they wait. |
| Teacher review of banks | Visible in the builder as a collapsed "Next steps for this box" panel. Every line is editable. |
| Student's own check | After writing, the student taps the sentence where they took the step. It takes the code's highlight. "Not this time" is a calm skip. |
| Teacher effort | **None extra.** No "nailed it" marking. The student's pick shows on the piece when the teacher marks it as usual. |
| How the step moves on | By itself: once the code stops repeating in the teacher's normal coding, it drops and the next repeating code on that skill takes over. A new rung placement moves the line up the ladder. |
| Wording rule | **All** code wording is positive and additive: descriptors, strength descriptors, ladder lines and bank lines. No "not", "without", "never", "rather than", "don't", "instead of", and no "This is retelling…" style openers. |

This changes one decision from the student progress design (30 Oct): codes **do now link to a skill**. They still never move a student's level; placement stays with the teacher's rubric.

## What the student sees

Mockup: `next-step.html`.

1. **Before writing.** One quiet line directly above the box: the code chip, then **Next step:** and the bank line. Example (invented): `[TS] Next step: Open with a claim about the town's change that a reader could argue with.`
2. **While writing.** The line stays but fades to 70% so it never competes with the writing.
3. **Show me where.** When the student presses **Done** (a small button under every writing box; on a box with no step it just shows the read view with a *Saved* tick), the box turns into a read view of their answer, sentence by sentence, under a tinted prompt that echoes the step as a question: *"Where did you open with your claim? Tap that sentence."* Tapping a sentence gives it the code's highlight and a small code tag. **Save** keeps it; **Not this time** skips with no message. Tapping the read view again reopens editing.
4. **Done.** The line becomes a small tick in the code colour (*"You opened with your claim."*). The pick stays highlighted.

Rules:

- One step per box, never more. If a box's skills match more than one repeating code, the code with the most hits wins; ties go to the most recent.
- No step when the student has no repeating growth code on any of the box's skills, when the box has no bank line for that code, or when the device holds no initials claim. The box then shows no line, only Done.
- Strength codes never become a next step.
- The step for a box is fixed when the box first renders in a session, so it does not change under the student mid-answer.
- Phone (390px): the line wraps above the box at full width; the read view's sentences are at least 44px tall to tap.

## What the teacher sees

### Code library: positive wording and ladders

Mockup: `next-step-bank.html`, view 2.

The feedback codes editor gains, per code:

- **Skill**: one continuum sub-strand (`strand.sub`) picked with the existing `skillSelect`. Speaking/viva codes can link too.
- **Ladder**: five lines, one per placement rung: *Building to Capable, Capable, Skilled, Accomplished, Excellent*. The line at a rung is the step toward the rung above (Excellent: a step that extends further). Each line is one sentence, at most 160 characters.
- A **wording check** on descriptors, strength descriptors and ladder lines that flags the banned words above, inline, before saving.

A one-off **Draft ladders** action has Claude (standard lane) draft every ladder and a positive rewrite of every descriptor from the library and the continuum's `build.next_move` text. The teacher reviews and saves. It runs only on the teacher's go, with a cost estimate first.

### Lesson builder: skill tags and the box's bank

Mockup: `next-step-bank.html`, view 1.

- Every writing question gets **Skills this box practises**: a multi-select chip row of continuum sub-strands, grouped by strand. It reuses the Syllabus card chip look (`.dots-plan__chip`); the picker itself is new because `skillSelect` is single.
- When a box has skills, a collapsed **Next steps for this box** panel appears under it: `3 codes · 15 lines`. Open, it shows one tab per code linked to those skills (chip + name) and the five rung lines for the selected code, each editable in place. Edited lines carry an *edited* tag. **Regenerate TS** redoes that code's unedited lines.
- **Make next steps** fills the bank for a box. It is a teacher action, not automatic on tagging, so no AI call happens by surprise. A lesson-level **Make next steps for all boxes** does every tagged box with an empty or stale bank in one job.
- A bank goes **stale** when the question text, the box's skills, or a source ladder line changes. Stale codes show a small *Ladder changed* note and are refreshed only on Regenerate.

### Marking

Mockup: `next-step.html`, state 5.

When the teacher opens a handed-in piece (`mark-page.ts`) or a quiz written answer, and the student made a pick:

- Above the answer: **Their next step · TS** with the line the student saw.
- The student's sentence is drawn with a dashed outline in the code colour (a separate layer from the teacher's own highlights) and the caption *"Jo's own TS pick."*
- Nothing to press. The teacher codes the piece exactly as now.

## Data

### Feedback code (library blob `feedback_codes/library`)

Adds two optional fields to the code object (`netlify/functions/_shared/feedback-codes.mjs`):

```
skill?: string            // strand.sub, SkillRefSchema
ladder?: string[5]        // [below, capable, skilled, accomplished, excellent]
```

The real department wording and ladders live only in the saved library (Blobs). The repo seed gets short generic placeholder ladders for the default codes, as it does for descriptors now.

### Writing question

- `QuestionItem` (`apps/teaching/src/schemas/block.ts:532`, used by `question_set`): add `skills?: string[]` (max 4) and `next_steps?: NextStepBank`.
- `quiz_question` written kinds (`extended_response`, `explain_effect`): `skills` already exists (`quiz/core.ts:128`); the builder's single `skillSelect` becomes the new chip picker. Add `next_steps?: NextStepBank`.

```
NextStepBank = {
  [code_id]: {
    lines: string[5],          // by placement rung
    edited: boolean[5],
    source: string             // hash of question text + skills + ladder lines it was built from
  }
}
```

Bank lines are generic teaching text written for the question, with no student data, so they travel in the published lesson like any other block content.

### Student pick

- **Question sets** save through lesson work sync. Add a part `step.{questionIndex}` holding `{ code_id, start, end, skipped? }`. Extend `PART` in `netlify/functions/_shared/lesson-work.mjs:22` and the client regex in `apps/teaching/src/student/work-sync.ts:32` together.
- **Quiz written answers** save the same object in the existing `save` / `submit` payload (`_shared/quiz.mjs:616-631`) under `step`.
- When a piece is handed in, the pick is frozen with the hand-in text (`work_handins/…`) so its offsets match what the teacher marks.

## Serving the step

New action on the existing student profile endpoint: `POST /api/published/profile/:classId` with `{ action: 'steps', lesson_id }` (`_shared/profile.mjs`).

- It runs the same claim check as `progress` (`class-claims.mjs` `claimFor`). No claim → `{ need: 'initials' }` and boxes show no step.
- It builds the student's pieces with `studentPieces` and returns, for each skill the student has evidence on:

```
{ skills: { [strand.sub]: { rung: PlaceId | null, code: { id, code, colour, hits } | null } } }
```

- `rung` is the latest placed rung on that skill (`targetRow(...).now`, as used by `progressFor`).
- `code` is the top growth code from `ranked(...)` (`progress-patterns.mjs:94`) **whose `skill` matches**. Same rule as today's next steps: on 2 or more of the last 5 pieces it applies to.

The client picks the box's line: the matched code's bank, at the student's rung. When the student has a repeating code but **no rung yet on that skill**, the box uses the **Capable** line until the teacher places them on that skill.

One `steps` call per lesson load, cached for the page. Rungs and codes stay server-side and are never rendered.

## Generation and cost

- **Bank fill** runs as a Teaching AI job (`apps/teaching/src/ai/jobs-client.ts` → `ai-job-run`) in the **fast lane** (`TEACHING_AI_MODELS.fast`). Input per box: the question text, the box's skills with their continuum `i_can` / `next_move` lines, and each linked code's ladder. Output: five lines per code, checked against the wording rule and the 160-character cap. Any line that fails is regenerated once, then left for the teacher with a flag.
- **Ladder drafting** is a one-off standard-lane job over the whole library.
- Every run goes through `estimateCostUsd` and the `meta/ai_usage_log` blob, as other Teaching jobs do. The **Make next steps** button shows the estimate (A$) from the job's own token count before it runs. The plan anchors that estimate against the real logged cost of comparable fast-lane jobs, not a guess.
- Students never trigger a model call.

## Scope

In:

- Positive rewrite + ladder + skill fields on feedback codes, the wording check, and the one-off Draft ladders job
- Skill chip picker on `question_set` questions and on quiz written questions
- Next steps bank panel, Make next steps (box and lesson), Regenerate, stale marking
- `steps` profile action and the student line, Done, Show me where, Not this time, tick
- Pick saved through work sync and quiz save; frozen at hand-in; shown on the marking page and in quiz written answer marking
- Dev mock data for all of the above (invented class, students and ladders)

Out (later, if wanted):

- `self_check` reveal boxes: their answers stay on the device only (`storageKey('local', …)`). They can show the line, but there is no pick and the teacher never sees it.
- Knowledge Hub book notes and case-study books.
- Colouring the line with the teacher's free-text comment on the last piece. The bank line always stands alone in this build.
- Strength steps ("keep doing this") in boxes.
- Changing the student profile page, which keeps its own next-step cards.

## Testing

- Unit: the code-to-skill match in `ranked` with `skill` filters; rung → bank line choice, including no rung → Capable; one-step-per-box tie rule; the wording check; `PART` accepting `step.*` on server and client; stale-bank hashing.
- Server: `steps` with no claim, with a claim and no evidence, with evidence on two skills.
- Browser walk in the dev mock at desktop and 390px: tag a box, make its bank, edit a line; view as two invented students on different rungs and see different lines; Done → pick a sentence → Save → tick; Not this time; open the piece on the marking page and see the dashed pick.
- Privacy guard and `npm run pre-pr-check` once at the end.

## Settled after review (31 Oct)

1. A student with a repeating code but no placement yet on that skill gets the **Capable** line.
2. **Done** appears on every writing box, so the loop feels the same everywhere.
3. In this build, the Show me where prompt is fixed ("Where did you take this step? Tap that sentence.") and the tick says "Step taken." Step-specific wording, as in the mockup, can come later.
