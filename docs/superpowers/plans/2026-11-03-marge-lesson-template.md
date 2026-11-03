# MARGE lesson template — implementation plan

**Goal.** One click gives a lesson built on Shimamura's MARGE model (Motivate, Attend, Relate, Generate, Evaluate): five titled sections, pre-filled with the right blocks and the right settings on. The pieces it needs that the hub lacks are built first, and each one is useful in any lesson.

MARGE is a model of how learning happens, not a fixed lesson order. The template gives the five headings as a planning frame; teachers move, cut or repeat sections freely.

Copyright: the WalkThrus book's wording never enters the repo. Every prompt, label and placeholder here is original. The template names its source as "Shimamura's MARGE model".

## Slices

### 1. Continuum line: predict mode

Today the line is opinion only: no right answer, the reason is the product.

- **Schema** (`continuum_line.content`): `mode: 'opinion' | 'predict'` (default opinion). Each statement gains optional `answer: number` (0–1, where the true value sits on the line).
- **Publish** strips `answer` (teaching-student.mjs), like the hinge's right answer.
- **Server** (`_shared/continuum-line.mjs`): teacher action `show_answer` on a revealed statement sets `answer_shown`. Teacher status always carries the answer; students get `answer` for a statement only once it is shown.
- **Teacher view**: a "Show answer" button after reveal in predict mode; the projector marks the answer on the line.
- **Student view**: once shown, the answer marker appears on the line with "What surprised you?" wording, never right/wrong scoring.
- **Editor**: mode toggle; in predict mode each statement gets an answer slider (snap statements snap their answer to the stops).
- **Verify**: student status before show has no `answer`; after show it does; publish output has no `answer`; opinion lines behave as before.

### 2. Return card (continuum `returns_to`)

The big question comes back at the end: "Where would you put it now? What moved you?"

- **Schema**: `continuum_line.content.returns_to?: string` (id of an earlier continuum line in the same lesson). A return line takes its stimulus, scale and statements from the source line at run time.
- **Server**: `settings()` resolves the source block when `returns_to` is set (same lesson, published, not itself a return line).
- **Student view**: shows their earlier placement on the source line as a ghost dot (read from the device's own source-line token, so no accounts are needed), then they place again.
- **Cloning**: `cloneBlocksWithNewIds` and composition insert rewrite `returns_to` to the source's new id, so a template or composition copy keeps the link.
- **Editor**: a "Returns to" picker listing the lesson's other continuum lines; the statements editor is hidden for a return line.
- **Verify**: clone remaps `returns_to`; a dangling `returns_to` shows an editor warning and the server rejects the round with a clear message.

### 3. Hinge question: independent mode

The live hinge needs the teacher to hold the class. Independent mode runs alone, like the lecture solo mode, with a reasoning loop.

- **Schema**: `hinge_question.content.pace: 'live' | 'independent'` (default live). Each option gains `tier: 'right' | 'close' | 'mixup'` (default derived: the right answer is right, others mixup) and the misconception note doubles as the kind nudge.
- **Flow**: pick → "Why do you think that?" (short reason) → feedback by tier: right ("Locked in"), close (nudge), mix-up (names the common mix-up kindly) → if not right, the back-up question as a fresh retry → move on regardless; still stuck is flagged to the teacher.
- **Confidence**: optional sure/unsure before feedback; feedback wording follows the supportive grid (sure+right, unsure+right "you know more than you think", sure+wrong "this one's sneaky", unsure+wrong "good call flagging it"). No class comparison is shown to students.
- **Server**: tier, notes and the back-up stay off the published copy; the independent check is graded server-side and returns only the student's own feedback.
- **Teacher**: the block's teacher panel lists students' first try, retry and the "sure and wrong" count.

### 4. Whiteboard 3 Cs starters

The 3 Cs (categorise, compare, contrast) give attention a job. Built-in starting layouts for the whiteboard: Sort into groups, Venn (compare and contrast), Same / Different / So what. Chosen when adding a whiteboard; no new block type.

### 5. MARGE template and phase kits

- **Built-in lesson template** "MARGE lesson" in the From template picker (beside saved templates), building five sections:
  - Motivate: big-question callout, continuum line in predict mode (video stimulus, re-place on).
  - Attend: thinking intentions, a one-question "what matters most" check.
  - Relate: concept map.
  - Generate: a note naming the think it / say it / teach it options (teacher-only), and an own-words note cue.
  - Evaluate: return card pointing at the Motivate line, independent hinge, and the lesson's end questions.
- **Built-in compositions**: "Big question opener" (Motivate) and "Evaluate close", inserted as copies, never linked.

## Out of scope (later)

- Concept map "Pull from GO": waits for the unit graphic knowledge organiser build.
- Calibration panel (confidence vs accuracy over time, teacher only): first confirm confidence is stored with correctness across attempts.
- Ann reading students' "why" answers live.

## Gates

`npm run pre-pr-check` exit 0; regenerate `teaching-block-schema.mjs` and block CSS after schema changes; privacy guard clean (all fixtures synthetic).
