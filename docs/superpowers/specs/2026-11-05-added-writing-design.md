# Added writing: feedback on work a student hands over outside the app

Date: 5 November 2026
Status: design, approved in chat
Branch: `claude/serene-brahmagupta-ze4lsd`

## What this is

A student emails a draft, hands over paper, or shares a document. Today the only way to give it the usual written feedback (codes on the words, a comment, a rubric) is to make a lesson block, link a Markbook task to it, and have the student hand it in. That is one Markbook column per draft. With HSC drafts (ten from one student, three from another, none from most) the Markbook would fill with columns that belong to one student each.

Added writing lets the teacher paste a student's writing onto that student, mark it on the existing marking screen, and return it. It feeds the unit the teacher picks. It never touches the Markbook and never appears on the unit line as a lesson.

## Decisions (Adam, 5 November 2026)

1. A piece hangs off the student, not a Markbook task. Any number per student.
2. The teacher can add one from To mark and from the teacher's view of a student.
3. Redrafts come later. In this build a new draft is a new added piece.
4. Paste only. No file or photo upload.

## Out of scope

- Redraft on an added piece (a second PR).
- Upload, OCR, Google Docs import.
- Editing the text or the tags after the piece is added. Delete and add again.
- Markbook marks, totals or criteria for added pieces.

## Data

One row per piece, in the same place every other piece's feedback lives:

```
piece_feedback/{class}/{student}/t:{id}      id = aw_ + 8 hex
```

The row keeps its own frozen copy of the text, as quiz answers and sprint reflections already do (`to-mark-flow.mjs`), so Returned work reads it unchanged.

```
{
  kind: 'written', added: true,
  title,                         // "Speech draft 3", up to 120 characters
  unit_id,                       // the unit it counts towards
  settings,                      // deep tags, the same keys a block uses: deep_step, deep_targets, deep_skills
  text: { writing: { text } },   // up to 20,000 characters
  status: 'in' | 'draft' | 'returned',
  added_at, updated_at, returned_at?, seen_at?,
  tags, comment, rubric?
}
```

`in` means added, not marked yet. `draft` and `returned` mean what they do for handed-in writing.

## Server

New module `netlify/functions/_shared/added-writing.mjs` with `addedWritingAction(store, classId, body)`, behind a new operator route `POST /api/classes/:id/writing` (`netlify/functions/class-writing.mjs`).

| Action | Body | Does |
|---|---|---|
| `context` | | Class list (id, initials, name), the class's units (active and current, with titles) and the current unit |
| `add` | student_id, title, unit_id, settings, text | Creates the row with status `in` |
| `list` | | Every added piece in the class that isn't returned |
| `load` | student_id, piece | Text, title, unit, tags, feedback, the written codes, recent codes |
| `save` | student_id, piece, tags, comment, rubric, today | Saves marking. The rubric goes through `recordRubric` with the piece's unit |
| `return` | student_id, piece | Status `returned`. Needs saved marking |
| `take_back` | student_id, piece | Back to `draft` |
| `delete` | student_id, piece | Removes the row and its rubric evidence |

Changes elsewhere:

- `rubric.mjs`: `recordRubric` takes an optional `unit_id`, used when there's no lesson to find the unit through. `rubricForStudent` takes the same.
- `to-mark.mjs`: one queue item per class with added pieces waiting, kind `added`, a row per piece.
- `profile-feedback.mjs`: `pieceFor` accepts `t:` ids and names rubric pieces through the row's unit. `studentPieces` already lists every row under the student, and a row without a Markbook column takes its places from its rubric.

## What it feeds

- **Unit progress:** the rubric goes to that unit's skills ledger, deep-understanding steps and key-piece ticks, as a tagged writing block does. The writing key is the piece id.
- **Patterns:** the codes count, like any returned piece.
- **Returned work and profile:** the piece shows with its title, codes, comment and rubric.
- **Not fed:** the Markbook, and the unit line of lessons.

## Teacher UI

**Add writing dialog** (`apps/teaching/src/marking/add-writing.ts`). Fields:

- Class and student (fixed when opened from a student's page).
- Title.
- Unit, defaulting to the class's current unit.
- "What it's evidence for…", which opens the existing Deep understanding sheet (`askDeepSheet`) for the chosen unit. A unit with no deep understandings hides the button; codes and comment still work.
- The pasted text.

Add saves and opens the piece for marking.

**To mark:** an "Add writing" button in the header. Added pieces join the Writing pill and open on the same marking screen as handed-in writing, with the rubric built from the piece's unit and tags. Return sends it.

**Teacher's student page** (`/classes/:class/students/:student`): an "Add writing" button above the profile.

## Edge cases

- **Student released or removed from the class:** the row stays, but it can't be loaded until they are back on the list, like other pieces.
- **Unit deleted:** the piece still marks and returns. The rubric records nothing to the unit.
- **Empty text or title:** refused with a message.
- **Two pieces with the same title:** allowed. Each has its own id and date.

## Testing

Unit tests for `added-writing.mjs`: add validates and stores, list excludes returned, save feeds `recordRubric` with the unit, return needs marking, take back, delete clears rubric evidence, unknown student refused, and `pieceFor` reads a returned `t:` piece.

Browser walk on the To mark page at desktop and 390px: add, mark with a code and a comment, return, then see the piece on the teacher's student page.
