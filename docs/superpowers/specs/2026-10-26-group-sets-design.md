# Group sets: personalised questions for markbook groups

26 October 2026. Teaching hub.

## Why

The markbook already tracks each student against techniques, families, outcomes and skills, and Next steps suggests small groups ("cannot identify repetitive techniques"). Support has been built around those groups (tutorials, follow-up quizzes). The next step is to test them inside ordinary work: when Adam or Ann writes the Week 3 review, they add questions aimed at one or more groups, written from the same content. Each student gets the shared questions plus the sets for the groups they are in. The answers feed back into the markbook, so it shows whether each student in the group is improving, and a dated record of support given is kept for parent–teacher interviews.

## Decisions (Adam, 26 Oct)

1. **Several groups per quiz.** A quiz can hold a set for each of several groups at once. A student in two groups gets both sets.
2. **Members fixed when the set is added**, with a small Refresh button. If a student tests out between planning and sitting, the set does no harm and adds evidence.
3. **Groups are saved.** Students leave one at a time as evidence shows they are secure. When the last member leaves, the group retires: it is off the active views but kept.
4. **History, not just support history.** A dated, written record of joining, what was received, results and leaving, which can be filtered by technique, family, outcome or skill. It is general enough for stretch work later.
5. **Who writes:** both ways, as now. Ann drafts from a brief (plan and A$ cost first), or Adam writes the cards himself.
6. **Score:** targeted questions sit outside the quiz score. The score covers the shared questions only, so the class compares on the same thing. Targeted questions show as their own line ("Group: 3/5") and feed evidence as normal.
7. **Later, not now:** stretch sets for students who are secure.

## How it fits what exists

- **Groups today** are worked out live by `nextMoves()` (`apps/teaching/src/evidence/next-moves.ts`), and nothing is stored. A `group` move has `parts` (tag + students) and `students`.
- **Per-student questions** already work for tutorial exit checks: the quiz record carries `groups` (student id → question ids), and `narrow(record, studentId)` in `netlify/functions/_shared/quiz.mjs` drops every other question before a student sees it. Group sets extend this.
- **Containers:** quiz questions inside a section, column or tab already show as a deck (PR 1122). A Group set is another container of quiz questions.
- **Evidence** comes from each question's tags through `quiz/evidence.ts` (shared with `quiz-evidence.mjs`). Targeted questions are tagged the same way, so the markbook reads them with no new adapter.
- **Students** sign in with initials before any question is shown, so the server knows who is asking.

## Saved groups

Stored in the class's markbook record (`markbook.mjs`, `MarkbookSchema`) as `groups`:

```ts
type SavedGroup = {
  id: string;                 // markbook id
  name: string;               // "Repetitive techniques"; editable
  tags: string[];             // the need, e.g. ['fam:repetition'] or ['tech:anaphora','tech:epistrophe']
  started: string;            // day
  retired: string | null;     // day the last member left
  members: Array<{ student: string; joined: string; left: string | null; why_joined: string; why_left: string | null }>;
};
```

- **Saving a group:** a Next steps group card gets **Save group**. The Group set picker also lists suggestions; picking one saves it. The name comes from the tag labels, and members come from the move's students.
- **Leaving:** a member leaves when the markbook next loads with them **secure on every one of the group's tags**, counting only evidence dated on or after they joined. Secure uses the existing `BANDS` rules. `left` is the date of the source that made them secure. `why_left` reads, e.g., "Week 4 quiz: 2/2 on repetition".
- **Retiring:** when no members are left, set `retired`. The group is hidden from Next steps, the picker and active lists, but stays in History.
- **Adding people:** Refresh on a set (or **Add** on the group) brings in students the live move now flags. They join with today's date. Nobody is removed by a refresh. Leaving only happens through evidence (or **Remove** by hand, which is recorded as "removed by teacher").
- Suggested groups that overlap a saved group (by the existing `sameGroup` share) are not suggested again. Their new students show as "2 more flagged, add?" on the saved group.

## Group set block

A group set is a **section** with a `group_set` field, the same way tutorial tabs are sections marked with `tutorial_group`. So the editor, the canvas, Ann's section replace and the deck all work unchanged. It is allowed at the top level of a quiz-mode lesson only (not inside another section, column or tab):

```ts
section.content.group_set = { group_id: string, class_id: string, name: string, tags: string[], students: string[], target: number /* 1–10 questions wanted */ }
// section.content.blocks: the set's quiz_question cards
```

**Teacher view (editor):**

- The header reads "For **Repetitive techniques** · 4 students" with the member initials, a **Refresh** button and a note when the group has changed ("1 left, 2 flagged since").
- The group picker lists this class's saved groups first, then live suggestions. It shows the tags and the member count. A retired group can't be picked.
- Children are ordinary quiz question cards, edited as now. New cards inherit the group's tags as outcomes, techniques or skills where the kind allows.
- **Write it myself** adds `target` blank cards. **Ann drafts** sends a brief to the existing lesson job ("write N questions for students who …, on this lesson's content, testing tags …"). Ann's plan-first step quotes the cost before she builds. Accepting puts her cards inside this set.
- On the lesson, the set shows as a soft-tinted panel so it is clear these cards are not for everyone.

**Publish:** `prepareQuizPublish` puts the set's questions into the record with `sets: { [setId]: { group_id, name, tags, students, questions: string[] } }`. `order` stays the shared questions only. Each question key gets `set: setId`.

**Student view:** `narrow(record, studentId)` returns the shared order with the questions of each set the student is in **interleaved**: spread evenly through the shared questions in a fixed order (seeded by student id, so a reload doesn't reshuffle). If shuffle is on, the whole list is shuffled instead. Each targeted card shows a small **interleaved** icon (a two-strand mark) with the label "Practice for you". The student never sees the group's name.

A student outside every set sees the quiz exactly as now. A quiz with no sets behaves exactly as now. Tutorial `groups` keeps working alongside.

## Scoring and results

- `scoreAttempt` scores every row, then splits the totals: `score`/`max` cover rows without `set`, and `sets: { [setId]: { score, max, pending } }` covers the rest.
- The student's end screen shows the quiz score, then "Practice for you: 3/5".
- The teacher's quiz Results show the quiz score column as now, plus a column per set (blank for students outside it). The Patterns and insight views read every row's evidence as now, so targeted answers count toward tag bands.
- In the markbook quiz column, the cell shows the shared score. A small mark opens the set line.

## History

Written events, kept in the class markbook record as `history`, appended and never recomputed:

```ts
type HistoryEvent =
  | { kind: 'joined'; group: string; student: string; day: string; why: string }
  | { kind: 'received'; group: string; student: string; day: string; source: string; questions: number }
  | { kind: 'result'; group: string; student: string; day: string; source: string; score: number; max: number }
  | { kind: 'left'; group: string; student: string; day: string; why: string }
  | { kind: 'retired'; group: string; day: string };
```

- **joined:** when a student is first added to a saved group (by save, refresh or Add).
- **received:** when a published quiz holds a set naming the student (written at publish, using the quiz's close date or publish day).
- **result:** when that quiz is closed and fully marked (the same point the quiz saves its evidence copy).
- **left / retired:** as above.

Each event also stores the group's name and tags at the time, so the record reads the same if the group is renamed.

**Markbook History view** (a new tab beside Patterns and Next steps):
- It has a tag-kind switch (technique, family, outcome, skill), matching the Patterns view, and an Active / Retired / All filter.
- Each group is a row: its name, tags, dates and "4 joined · 3 left". Expanding a row shows each member's timeline.

**Student profile** (`student-panel.ts`): a **History** section with that student's timeline across groups, newest first, in the same wording as the example below. It is the page to show at an interview.

> **Repetitive techniques**: joined 14 Oct (Week 2 pre-test, 1/4 on repetition)
> Week 3 review, 24 Oct: 5 practice questions, 3/5
> Week 4 quiz, 31 Oct: 2 practice questions, 2/2
> **Left 31 Oct** (secure on repetition)

## Edge cases

- **A student removed from the class list** keeps their history. They are shown as "Removed student", as in quiz results.
- **A group retires while a quiz with its set is open:** the set still runs. The results are recorded, and the group does not reopen.
- **A student has already started an attempt when Refresh adds them:** they keep the questions they began with (the same rule as `setStudentExitQuestions`).
- **A class without a class list** can't be targeted (no initials, so no way to know who is asking). The picker says so.
- **A quiz used by several classes:** each set belongs to one class's group. Students in other classes see none of it.
- **Limits:** at most 6 sets per quiz and 10 questions per set.

## Not in this build

- Stretch sets for students who are secure.
- Group sets in writing tasks or feedback (the History event shape leaves room: `source` can be any markbook column).
- Automatic set writing with no teacher step.

## Testing

- Unit tests: `narrow` with sets (membership, interleave spread, stable order, shuffle, no sets, tutorial groups untouched); `scoreAttempt` split; group leave and retire rules (evidence before joining ignored, all tags needed); history event writing (no duplicates on reload); publish of `group_set` (schema, limits, key `set`).
- Contract test that `group_set` passes the block schema and the student strip filters (there are two of them).
- Browser walk on the dev mock at desktop and 390px: save a group from Next steps, add a set to a Finn review, sit it as a group student and as a non-group student, then check Results, the markbook and History.
