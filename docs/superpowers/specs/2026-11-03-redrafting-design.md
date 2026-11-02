# Redrafting: design

Date: 3 November 2026
Mockup: `docs/mockups/redrafting/redrafting.html` (approved in principle). All people, tasks and codes in it are invented.
Source: WalkThrus Book 2, Redrafting (Q&F 106) and Selective marking (Q&F 108). Book wording stays private; this doc holds names and page numbers only.

## Why

A returned written piece is a dead end. The student can read the feedback but can't act on it, and the teacher can't see whether they did. Both techniques depend on a feedback, rewrite, feedback loop that the app doesn't have.

Today, handing in overwrites the only frozen copy of the text, and the feedback's codes are character offsets into that copy. Once a piece is returned, handing in is refused. So the loop needs drafts that keep their own text and codes.

## Decisions made with the teacher

| Question | Decision |
|---|---|
| Who decides a student redrafts | The teacher, per student, when returning |
| What can be redrafted | The whole piece, or one section the teacher drags across |
| How much marking a redraft asks for | It opens on what changed, beside the earlier feedback. Codes are optional and one tap returns it |
| Which rubric step counts | The latest. The first stays visible: "Building, then Secure after redraft" |
| Where the student rewrites | On the returned piece, in Returned work. The lesson stays as it was |

Decisions made in the design review and open to change:

| Question | Decision |
|---|---|
| Do codes on earlier drafts count in patterns | Yes. A code counts on a piece if it appeared on any draft |
| Is there a due date | No. A quiet waiting list only |
| Is there a limit on rounds | No. The teacher decides each time |

## Scope

In: written work handed in through a block linked to a Markbook task (`w:{lesson}:{block}` pieces).

Out:

- Quiz written answers, which have their own attempts.
- Sprint reflections, which have their own marking.
- Viva and Voice pieces, which keep their takes.
- Due dates, reminders and push notifications.
- More than one section per ask.
- Typing checks on the redraft box. `watchWriting` can be added later.
- Any automatic AI run. The existing AI read button stays manual and reads the latest draft.

## The flow

1. **Hand in.** As today. This is Draft 1.
2. **Ask.** The marking page's side panel gains "When you return it": Return, finished (the default) · Return for a redraft: this section · Return for a redraft: the whole piece. Choosing "this section" arms the next drag on the text to mark the section instead of opening the code sheet. The section snaps to whole words with the existing `wholeWords`. It shows in gold and can be dragged again to replace it. The button can't send until a section exists.
3. **Rewrite.** The student sees "Your teacher asked for a redraft" on the returned piece. For a section, the surrounding text stays visible and locked. For the whole piece, every written field is editable under its prompt. The comment, codes and Draft 1 sit beside it. Work saves as they type. They press Send my redraft.
4. **To mark.** The task's row counts the redraft as waiting. Its row is labelled "Redraft 2" with "one section" or "whole piece". Under the task, a quiet line lists students who have been asked and haven't sent it, with how long.
5. **Second look.** Marking opens on a Changes tab (words removed and added), with Draft 2 and Draft 1 tabs. Codes can only be placed on the latest draft's text. The side panel shows what the teacher said on the previous draft. The rubric starts on the previous placement, with that step shown pale blue. The comment starts empty. The buttons are Return, finished and Ask for another redraft (the same section or whole choice).
6. **Finished.** The student's piece has Draft tabs, newest first. "Where this piece sits" shows "Building, then Secure after redraft" when the step moved, and the existing ladder when it didn't.

Book 2's fifth selective marking step, applying the feedback to the rest of the piece, is a whole-piece ask after a section ask. It needs no separate feature.

## Data

The current records stay the latest draft, so To mark, Markbook and My progress keep reading one piece. Older drafts sit beside them.

```text
work_handins/{lesson}/{block}/{student}        latest sent text; gains draft: n (absent means 1)
piece_feedback/{class}/{student}/{piece}       latest feedback; gains draft and redraft (below)
work_drafts/{lesson}/{block}/{student}/{n}     an earlier draft, frozen when the next one is sent
work_redraft/{lesson}/{block}/{student}        the student's working copy, saved as they type
```

```text
piece_feedback.draft    n (absent means 1)
piece_feedback.redraft  { scope: 'whole' | { part, field, start, end }, asked_at }   present only while asked
piece_feedback.first    { rubric, returned_at }   Draft 1's placement, copied at the first send
work_drafts row         { text, tags, comment, rubric, handed_in_at, returned_at, seen_at, scope }
```

Rejected: a new piece id per draft, which double-counts in every chart; and one record holding every draft, which has to keep hand-in and feedback in step on each save.

### Actions

**Teacher, in `piecesAction`:** `return` takes an optional `redraft` of `{ scope }`.

- The section range is validated against the frozen text with the same bounds as `cleanTags`, and it's snapped server-side to word edges.
- `take_back` clears `redraft`.
- `list` adds `draft` and a new status, `redraft_asked`. That status is excluded from To mark's waiting count and listed in the quiet line instead.
- `load` adds `drafts` (the earlier rows) and `redraft`.

**Student, in a new `_shared/redraft.mjs`, using the same claimed-student identity as Returned work:**

- `redraft_load` returns the frozen text, the scope, the working copy if any, and the feedback the student can already see.
- `redraft_save` replaces the working copy. It's capped at `WORK_LIMITS.text` per field and accepts only fields within the scope.
- `redraft_send` builds the new text and:
  1. Rejects with 409 `not_asked` if `redraft` is gone. This covers a take-back and a double send.
  2. For a section, splices the new words into the frozen text, so nothing outside the section can change. For the whole piece, replaces the writing fields and keeps the part and field names.
  3. Rejects with 400 `empty` if the new text is blank, or if the spliced field passes the cap.
  4. Writes `work_drafts/.../{n}` from the current hand-in and feedback.
  5. Writes the hand-in with `draft: n + 1` and a new `handed_in_at`.
  6. Writes the feedback with `draft: n + 1`, no tags, an empty comment, `status: 'draft'`, the same rubric, no `redraft` and no `seen_at`, and sets `first` if unset.
  7. Deletes the working copy.

### Things that must keep working

- **Hand in from the lesson.** `workAction`'s `handin` refuses when the feedback's `status` is `returned`. It must also refuse when `draft > 1`, because otherwise the lesson's old text overwrites a redraft being marked. The Hand in bar and the footer's "Hand in and finish" should both then say the work is with the teacher, or link to the redraft. Today's "Hand in again" before a return is unchanged.
- **Rubric.** The carried rubric must pass the Return check. A one-tap return must not trip "a step stayed practice". Saving keeps going through `recordRubric`, so the ledger and class deep progress take the latest placement, as decided.
- **Patterns.** `profile-feedback.mjs` builds each piece's `tags` for `progress-patterns.mjs` from all its drafts: for each code and sign, the largest count on any draft, so a repeated code isn't counted twice. The displayed tags stay per draft. `recentCodes`, which drives the "come up again" warning, uses the same union.
- **Returned work.** A piece stays listed while its latest draft is with the teacher. It shows the last returned draft plus "Sent. Your teacher has it." It reappears as New when returned, because `seen_at` is cleared. A piece with an ask shows "Redraft asked" until it's sent. The initials token counts a new ask through the existing unseen rule.
- **To mark flow.** `to-mark-flow.mjs` carries `draft` on the row, and the flow's screen opens on Changes for `draft > 1`.
- **Next-step picks.** `step.N` parts are copied unchanged for answers the redraft didn't touch and dropped for answers it changed, since their offsets would no longer hold. The student doesn't re-pick in this view.

### Edge cases

| Case | Behaviour |
|---|---|
| Teacher takes back after asking, before the send | The ask clears and the student's next send gets `not_asked`. The working copy stays, and a later ask of the same scope resumes it. A different scope starts from the frozen text |
| Task unlinked from the lesson | The student's load and send say "This task has changed. Ask your teacher." Earlier drafts stay readable |
| Lesson republished and the block changed | Text is frozen, so the redraft still works. Prompts that have gone show as "Your answer" |
| Student removed from the class list | Nothing can be sent, as with other student actions |
| Blank or unchanged redraft | Blank is refused. Unchanged is allowed, and the Changes tab says "No changes" |
| Save or send fails | The box keeps the words and shows a retry, like the lesson's work sync |

## Wording

Student-facing text says what the student can do next and never gives marks. "Your teacher asked for a redraft of one section." "Send my redraft." "Sent. Your teacher has it." The first-draft line only appears when the step moved.

## Files

| Area | Files |
|---|---|
| Server | new `_shared/redraft.mjs`; `_shared/piece-feedback.mjs`, `lesson-work.mjs`, `profile-feedback.mjs`, `to-mark.mjs`, `to-mark-flow.mjs`; the student route that serves Returned work |
| Marking | `marking/mark-piece.ts` (return choice, section drag, draft tabs); new `marking/draft-diff.ts` (word diff, since `quiz/writing.ts`'s `diffText` finds a single edit only); `marking/to-mark-view.ts`, `to-mark-items.ts` |
| Student | `student/returned-view.ts` (draft tabs, ask banner, first-step line); new `student/redraft-editor.ts`; `student/work-sync.ts` (hand-in bar states) |
| Dev | mock API and the `to-mark-flow` preview gain a redraft case with invented data |

## Tests

- `redraft_send`: section splice keeps text outside the range; whole-piece replace; `not_asked` after take-back and on a double send; empty and over-cap refusals; archive contents; field values only from the scope.
- Lesson hand-in refused while `draft > 1`, and the footer path too.
- `list` status `redraft_asked` leaves the To mark waiting count.
- Pattern union: a code on Draft 1 still counts, and a code on both drafts counts once.
- Next-step picks kept for untouched answers and dropped for changed ones.
- One-tap return of a carried rubric succeeds.
- Word diff: added, removed, no change, punctuation.
- Student copy: `redraft_load` never exposes anything the student couldn't already see, and marks stay out.

## To walk before calling it done

Desktop and 390px, in the dev mock first, then live: section ask, student rewrite, To mark row, Changes tab, one-tap return, second ask, finished piece, and take-back mid-way. Also check Safari and touch for the section drag, and real text on the marking page, whose side panel is already full. If the choice doesn't fit there, it can move next to the Return button without changing anything else in this design.
