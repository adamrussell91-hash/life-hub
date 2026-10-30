# Student progress and feedback: design

Date: 30 October 2026
Mockup: `docs/mockups/student-progress/student-progress.html` (v5, approved). All people, tasks and codes in it are invented.

## Why

Students are now handing in written work and viva practice for feedback. The teacher wants three things from this build:

1. **Fast, high-quality feedback.** The teacher annotates a student's own writing with feedback codes (TS and so on), the same way viva transcripts are marked today. Every code tells the student a concrete next action.
2. **Patterns over time.** Is this student holding at one step on an outcome? Have they reached the standard and stalled there? Which codes keep coming back? The point of the data is to tell that story and point to what happens next.
3. **One place for the student** to see all of this, on any piece of work, measured against the same outcomes, skills and concepts every time.

## Decisions made with the teacher

| Question | Decision |
|---|---|
| How students reach their page | The existing initials claim on their device (`class-claims`). If they change device, the teacher releases the claim and they claim again. No new codes or logins. |
| Which feedback appears | Annotated written work, viva returns, quiz feedback and feedback documents. |
| Marks on the student page | No marks, totals or percentages. Steps, codes and comments only. |
| Student response | Read only. Opening an item records that it was seen. |
| What sets a student's level | The teacher's rubric placement, criterion by criterion. Codes never move a level. |
| What codes are for | Fast feedback, "See how" links, and patterns. They don't link to outcomes or skills. |
| Step words for outcomes and concepts | **Starting · Building · Secure · Extending.** They describe how secure the learning is, not the student. Secure is the standard. |
| Skills | Their own scale: the HSC skills continuum rungs **Capable · Skilled · Accomplished · Excellent**, drawn differently from outcomes so the two are never confused. |
| Piece names | The task's real title, or a short name the teacher sets. A viva practice set is one piece (for example "Viva practice · 8 Qs"). |
| Teacher view name | **Analysis** (not "story"). |

## What the student sees

Route: `/s/classes/:id/profile` on `class.adam-russell.com`, now with two tabs: **My progress** and **Returned work**. The Returned work tab shows a count of unseen items.

### My progress (top to bottom)

1. **Your next steps.** Up to two growth cards and one strength card, built from codes (see Pattern rules).
   - Each growth card shows the code's action sentence, the evidence ("TS on 4 of your last 5 pieces") and a **See how →** link when the code has a resource.
2. **Where your learning is.** Two groups, **Outcomes** and **Concepts**, each with one row per outcome or concept the student has been placed on. Each row has:
   - its name and a one-line plain description
   - a "Now: Building" pill
   - a story sentence ("Holding at Building for your last 5 pieces. Next step to Secure: …"), with the code that blocks the next step
   - a "Secure looks like: …" line, taken from the rubric descriptor for the next step
   - a labelled step chart: one column per piece, oldest to newest, each column filled up to its step, with step names on the y axis and piece name and week under each column. The newest column is outlined. A piece that didn't assess this outcome shows a dashed, empty column.
   - A row that is holding gets a gold edge and "Your next step is here".
3. **Your skills.** One card per strand (Composing, Arguing, Speaking and so on) and one row per sub-skill. Each row has:
   - a horizontal path through the four rungs, with a "You are here" dot and a dashed "Next" on the rung above
   - under each rung, "N pieces": how many of the student's pieces landed on it
   - the current rung's **"I can…"** statement and the continuum's **next move** for the rung above, with **See how →**
   - a gold edge when the sub-skill is holding
   - Marks below the Capable threshold show as **"On the way to Capable"**.
4. **What your feedback keeps saying.** A grid with codes as rows and annotated pieces as columns. Rows are grouped into **Working on** (growth codes) and **Doing well** (strength codes).
   - **Cells:** a number when that code appears on that piece (darker for more), a small grey dot when it doesn't, and **n/a** when the code doesn't apply to that kind of piece.
   - **Summary column:** "4 of 5 pieces · 5 in all", plus "none in 3 pieces" when a code has dropped away.
   - **On a phone:** the summary column folds into a line under the grid.
5. **Your unit.** The existing progress map, as it is today. Lessons with a marked piece carry a tag ("Paragraph", "Viva · 8 Qs", "Essay").

The current four bars (Understanding, Responding, Concepts, Skills) are removed. They are replaced by sections 2 and 3, which read Markbook outcomes and skills directly. This also fixes today's bug where assessment outcomes never reached the Understanding and Responding bars, because `profile.mjs` passes empty labels and an empty outcome map.

### Returned work

- A list of every returned item, newest first, grouped into This week and Earlier.
- **Card tags:** Paragraph or Essay (annotated written work), Viva, Quiz, Note.
- **Unseen items:** they carry "New" until opened.

**A returned written piece** (mockup screen 2):

- The student's text with the teacher's highlights. Each highlight carries its code.
- Tapping a highlight shows the code's label, its action sentence, the teacher's note if there is one, and **See how →**.
- Beside the text (below it on a phone):
  - the teacher's comment
  - "Where this piece sits": one step ladder per criterion, with "same as last time" or "up from Starting"

**A viva** shows the comment, the code tags on the transcript, the recording (while it exists, 28 days) and the transcript. A viva set opens as one piece with each question listed.

**A quiz** shows the codes per question as sentences and "See your answers in the lesson". Marks stay in the lesson.

**A note** (feedback document) shows its text and audio.

## What the teacher does

### Mark written work (mockup screen 3)

This is the viva marking tool pointed at typed text, with no audio.

- **Codes:** a code palette across the top. Tap a code, then tap or drag across the words. An optional note can be added per highlight.
- **Paging:** "3 of 24", with ← → to move through the class.
- **Rubric panel:** one row per criterion. Each row shows its outcome, concept or skill and four step buttons. Skill criteria show the four continuum rungs instead.
- **Codes on this piece:** a tally, plus a warning when a growth code has appeared on the student's last three or more pieces.
- **Comment:** a box for the comment the student will see.
- **Buttons:** Save (draft) and **Return to [first name]**. A returned piece shows **Take back**.

### To mark (mockup screen 5)

A list across all classes of pieces that were handed in and not yet returned, grouped by task:

- **Waiting:** handed in and not returned, oldest first.
- **Coming in:** the task is still open.

Each task row shows the class, the lesson or block it came through, when it was handed in, how many are left, and an age badge. The badge turns peach after 7 days.

Opening a task starts marking at the first unmarked student. The list appears on Teaching home and in the Markbook.

### Analysis (mockup screen 4)

In the Markbook student panel:

- the same outcome, concept and skill rows the student sees
- a **What the data says** list, written for the teacher: "Holding at Building on Analysis for 5 pieces. TS each time. Try: model a topic sentence, then have them rewrite one." Real names come from the roster at runtime only.
- **Class patterns:** students holding on the same outcome and step, with their most common code. For example: "7 students holding at Building on Analysis; top code TS", with **Make a group** (opens group sets with them selected).

### Other wiring

- **Viva marking:** gets a **This is** student picker, prefilled from the student's class claim. New submissions save `student_id` and `class_id` from the claim when the device has one.
- **Feedback documents:** get a **For** picker (class, then student). The one-off link still works.
- **Code library:** each code gets an optional **See how** resource and a growth or strength flag. The existing `positive` field and the annotation `positive` field already carry the second.

## Data

All data stays in the `teaching-blobs` store. Nothing stores a student name outside the class record.

### Hand-in and marking switch

- Written work blocks that save through `work-sync` get a teacher switch, **Set to be marked**, and an optional short name for the piece.
  - When it's on, the student sees **Hand in**. Handing in writes a frozen copy of the text, so later edits don't move the highlights.
- `work_handins/{lesson}/{block}/{student}` = `{ class_id, text: {part: {field: text}}, handed_in_at }`. A student can hand in again until the piece is returned; each hand-in replaces the last.
- Quiz written answers already have attempts. A quiz with marking switched on appears in To mark once an attempt is submitted.

### Feedback on a piece

`piece_feedback/{class}/{student}/{piece}`, where `piece` is `w:{lesson}:{block}` for written work or `v:{lesson}` for a viva set:

```text
{
  kind: 'written' | 'viva',
  title, short?, lesson_id, block_id?,
  tags: [{ id, code_id, field, start, end, quote, note? }],   // written: character range in the frozen text
  comment?,
  placements: { [criterionId]: 'starting'|'building'|'secure'|'extending' | 'capable'|'skilled'|'accomplished'|'excellent' },
  column_id?,          // the Markbook assessment column whose criteria it uses
  status: 'draft' | 'returned',
  returned_at?, seen_at?, updated_at
}
```

- Viva tags stay where they are (`voice_submissions`). The viva piece record holds the comment, the placements and the returned status for the whole set.
- **Rubric source:** a markable task links to a Markbook assessment column, either picked or created when **Set to be marked** is switched on. Its criteria (`outcomes[]`, `skill?`, and a new `concepts[]`) are the rubric.
- **New on a criterion:** `concepts[]` (concept keys from the syllabus alignment) and `steps?: { starting, building, secure, extending }`, the one-line "looks like" text for each step.

### Turning a numeric mark into a step

Existing Markbook assessments that hold numbers keep working, using the mark as a share of the criterion's maximum:

- **Outcomes and concepts:** Starting below 0.5, Building from 0.5 to below 0.8, Secure from 0.8 to below 0.9, Extending from 0.9. The 0.5 and 0.8 boundaries match the existing evidence constants.
- **Skills:** the existing `rungForMark` thresholds (0.65, 0.75, 0.85, 0.95). Below 0.65 is "On the way to Capable".
- **Placement wins:** if a piece has a step placed directly, the placement is used instead of the number.

### Outcome labels

Outcome rows need a plain name. Outcome records get an optional `short` field (for example "Analysis"), edited in the Outcomes manager. Without it, the row shows the outcome code and the first clause of its description.

**More than one criterion on the same outcome:** if two or more criteria on one piece link to the same outcome, the outcome takes the lower step for that piece.

### Seen

When a student opens a returned item, `seen_at` is written: on `piece_feedback` for written work and vivas, and in `profile/{class}/{student}/seen/{item}` for quizzes and notes. The teacher sees an eye mark in the Markbook cell and the student panel.

## Pattern rules (pure module, unit-tested)

`patterns.mjs` takes a student's pieces in date order and returns rows, stories and next steps. The teacher's Analysis panel and the student page both use it.

- **Piece order:** by returned date, oldest first. The charts show at most the last 8 pieces, and older pieces fold into "Earlier".
- **Holding:** the same step on 3 or more pieces in a row that assessed this outcome, concept or skill, below the top step (Extending, or Excellent for skills).
- **Moved up:** the step rose between two pieces in a row: "Moved up from Starting to Building in Week 4". If the step fell, the story describes the current step only ("Now at Building"). It never says "dropped".
- **Few pieces:** fewer than 3 gives "N pieces so far. More pieces will show the pattern."
- **Code applies to a piece:** the code's `group` (composition, viva, speaking) matches the piece kind. Otherwise the cell is n/a and the piece doesn't count in that code's totals.
- **Next steps:**
  - Growth codes are ranked by the number of pieces they appear on among the last 5 pieces where they apply. A code needs at least 2 to qualify, and the more recent code wins a tie. The top 2 become cards.
  - The top strength code by the same rule becomes the third card.
  - A holding row names the growth code that most often appears on the pieces it holds across.
- **Dropped away:** a growth code with 2 or more earlier hits and none on the last 3 pieces where it applies gets "none in 3 pieces".
- **Class patterns:** group students by (outcome, step) where they are holding, and show groups of 3 or more with their most common growth code.
- **Wording:** every sentence describes what the work does or the next action. No deficit words ("weak", "struggling", "not", "never", "lacks"). This follows the house rule of stating what students can do.

## Server

- `profile-feedback.mjs` builds the student payload for the claimed student only:
  - piece rows (title, short name, week, kind)
  - outcome, concept and skill rows with steps per piece
  - code counts per piece
  - next steps
  - returned items
  - for skills: the "I can" line for the current rung and the next move for the rung above only
- **Never sent to the student:** marks, totals, teacher notes, other students, or full continuum text.
- **Routes:** the existing `published-profile` handler takes new actions `progress`, `returned`, `piece` and `seen`.
- **Teacher routes:**
  - `POST /api/classes/:id/pieces`: list, load, save, return and take back
  - `GET /api/to-mark`: the queue
  - the Markbook load includes Analysis rows for the open student and class patterns
- **Skills continuum:** it stays teacher-side. The student payload carries only the two lines it needs, so the full continuum is never published.

## Testing

- **Unit tests for `patterns.mjs`:**
  - holding, moved up, few pieces
  - n/a codes, ranking, ties and dropped-away
  - lower step wins
  - mark-to-step thresholds and the "On the way to Capable" rung
  - wording contains no deficit words
- **Unit tests for `profile-feedback`:**
  - nothing appears before it is returned
  - no marks, notes or other students in the payload
  - only two continuum lines per skill row
  - a released claim stops access
- **Route tests:** hand-in, save, return, take back and seen.
- **Browser walk** at desktop and 390px, with invented students in the dev mock:
  - set a task to be marked, hand in as a student, mark it with codes and placements, return it
  - see it on Returned work, then on My progress after three pieces show a holding pattern
  - check the To mark queue and Analysis, including class patterns
- **Before the PR:** `npm run pre-pr-check`.

## Delivery

One PR, with phases as commits:

1. Data and schemas: hand-in, `piece_feedback`, criterion `concepts` and `steps`, outcome `short`, code resource, viva `student_id`, feedback-document student.
2. Teacher marking screen, To mark, Return and Take back.
3. `patterns.mjs` with its tests.
4. Student page: My progress sections, Returned work, and the opened-piece views.
5. Analysis panel and class patterns, plus the viva, quiz and feedback-document wiring.

## Out of scope for this build

- Uploads of handwritten or document work. Typed work only.
- Student replies to feedback.
- Ann suggesting codes or drafting comments.
- NESA A–E reporting; that stays in the Markbook as it is.
