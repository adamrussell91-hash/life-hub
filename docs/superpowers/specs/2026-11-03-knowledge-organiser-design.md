# Knowledge Organiser in Teaching

> **Revised 4 November 2026.** The sheet is now written on the unit page before teaching, and each lesson ticks lines from it. This replaces setting a line's lesson on the unit page. Sections have roles: concepts (a sentence for the unit, dot points, key ideas), facts and topics, vocabulary by tier, and optional key lines and story order. A line with no lesson waits, unless it predates this change (`open`). Set for this week and Run with the class moved to the lesson card. Ann suggests ticks and writes no lines. Release timing and practice gaps are unchanged. Where the sections below differ, this note wins.

Design approved in conversation, 3 November 2026. Mockup: [`docs/mockups/knowledge-organiser.html`](../../mockups/knowledge-organiser.html). Examples here and in the mockup are invented. Real unit content stays in Teaching's storage and the private data repo.

The technique is WalkThrus Book 1, Using a knowledge organiser, p.116. Its wording stays in the private book pack.

## The problem

Teaching has no shared sheet of what a unit expects students to know, and no spaced practice. The nearest things don't fit:

- Flashcards pull facts away from their context, keep state on the device and hold 20 cards.
- A table block is too small and sits inside one lesson.
- A block would have to be added to every lesson, is out of sight once the lesson ends, and becomes huge unless it filters by lesson.
- The Anthology block is students' own notes across published lessons. An organiser is the teacher's sheet.

An organiser that students only look at is passive. Direct evidence for organisers themselves is thin, but evidence for retrieval and spacing is strong, and students rarely test themselves without being taught to. So the sheet has to come with self-testing, spaced practice and a routine in class.

## The model

The organiser is part of the unit, not a block. Each unit has one. The teacher writes it and gives it to students, and it grows as lessons are released.

```
Lesson editor: Organiser card ─┐
                               ├─> Unit organiser ─> released lines ─┬─> Organiser tab on the progress page
Unit page: the whole sheet ────┘                                     ├─> Practice (Leitner boxes)
                                                                     ├─> End-of-lesson card
                                                                     └─> Run with the class, Print
```

### Sections and lines

A section is one of three kinds:

| Kind | Holds | Test myself | Practice cards |
|---|---|---|---|
| Table | 2 to 4 named columns | Hide columns, type in cells | Yes |
| List | One line of text per item | Cover everything | No |
| Sequence | Ordered items | Cover everything | No |

A line is one row or item. It may link to one lesson and one knowledge piece.

A knowledge piece is part of a line, never the whole of it. In a table the piece usually sits in "what to know", with a prompt and an example around it. Vocabulary, quotes and other lines carry no piece.

Labelled diagrams wait for the Dual coding work.

### Release

A line is released for a class when both of these are true:

1. Its lesson is published.
2. The lesson's date in that class's schedule has arrived. A lesson with no date in that schedule passes this test.

A line with no lesson is released as soon as the class has the unit. If a lesson is unpublished or deleted, its lines go back to waiting. The teacher still sees them, and a deleted lesson's line is labelled so they can relink it.

The server applies this filter. Unreleased lines never leave it in a student response.

## Teacher

### Lesson editor: Organiser card

A collapsible card next to the Syllabus card, showing "N lines from this lesson". Lines added here link to the lesson automatically.

- **Add a line:** pick the section and fill in the cells.
- **Ann, suggest lines:** see below.

### Ann, suggest lines

One suggestion run, shown in the card. It doesn't open the chat. It uses Teaching's AI job runner.

- She reads the lesson's blocks, its knowledge pieces and the lines already in the organiser.
- She proposes lines, each with a section, cells, and a piece where one applies.
- The teacher ticks what to keep, adds them, and edits them afterwards. Nothing reaches students from the run itself.
- A proposed quote must appear word for word in the lesson. If it doesn't, it is dropped.
- A proposed piece id must belong to the unit. If it doesn't, the line stays and the link is dropped.
- The button shows the cost before she runs. The cost is measured during the build on a synthetic lesson. The figure goes to Adam before any live run, and if a run costs more than cents, the feature comes back to him before it ships.

### Unit page: the whole sheet

- Edit cells, name and reorder sections and lines, and choose a section's kind.
- Each line shows its lesson, a Piece chip if it has one, and Waiting if it isn't released yet. The chip is teacher-only.
- **Usually hide:** per table, which columns are covered by default. These columns also make the practice cards. A table with nothing hidden makes no cards, and the editor says so.
- **Add line, Paste from Word or Sheets:** tabs and new lines become cells and rows.
- **Bring in:** copy chosen items in as lines from Deep understandings, Anthology and the Knowledge plan. A piece keeps its link and takes the first lesson that teaches it (`deep/derive.ts`). These are copies. Later edits on either side stay on that side, apart from the piece link.
- **Set for this week:** section, date and reason. The student tab shows a banner until the day after the date. There is no completion tracking.
- **Print** and **Run with the class**.

### Run with the class

A projector view that needs no block. It opens from the unit page and from Display in a lesson.

- Choose a section, and Last two lessons or Everything so far.
- "Usually hide" columns start covered, with Reveal and Cover again.
- A timer the teacher starts, three minutes by default.
- Only released lines show. A unit in several classes asks which class first; from Display, the class is already known.
- Nothing is recorded.

### The routine

The organiser only does its job with teaching around it. This goes in the unit page help, in plain words and not the book's:

- Model read, cover and check in the first lesson.
- Run a three to five minute starter from it.
- Have pairs test each other.
- Name homework for the coming review.
- Check with review quizzes, and expect the knowledge in writing and vivas.

## Student

### Organiser tab

A third tab on the progress page (`/s/classes/:id/profile`), reached from the initials token in any lesson. It holds:

- The "This week" banner, when set.
- **Practise: N today**, with a Start button. When nothing is due, it says when the next cards are.
- Sections folded, with counts and "N new". Only released lines.
- **Test myself** in each section: Read, Cover, Check. Hide-column pills on tables, typed cells, a tick per row, go again on the rest, and Cover everything. Ticks and typing last for that sitting and are not saved.
- **Print my organiser.**

The tab appears when the student's class has at least one released line. `profile-view.ts` returns early today when no work has been returned, showing only the map, so that branch changes: with released lines, the tabs show, and My progress holds the map and the existing empty message. Returned work appears only when there is some.

The sheet shows the class's current unit, with a small switch to its other units that have organisers.

The teacher's view of a student's progress page has no Organiser tab in this build.

### Practice

- Released lines from table sections with a hidden column become cards. A line's release day is the later of its lesson's publish date and its class date, and it joins practice the day after.
- The cue is the first column that isn't hidden. The answer is the first hidden column. The other columns show on the back.
- A card with a piece shows that deep understanding's claim on the back as "This builds your big idea". Students never see piece ids.
- Typing is optional. There is no score, streak or completion figure, and no marks.
- Cards come from every organiser the class has, because spacing only pays off if old units keep coming back.

**The boxes:**

| Box | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Back after | 1 day | 3 days | 7 days | 14 days | 28 days |

- New cards start in box 1.
- **Got it:** up one box, due after that box's gap. From box 5 it stays in box 5.
- **Again:** back to box 1, and the card repeats in the same session. Got it on that repeat keeps it in box 1, due tomorrow.
- **Daily limit:** 20 cards, oldest due first, then new cards in sheet order. Repeats don't count.
- **Missed days:** cards wait. Nothing moves down for being late.
- **Days** are Sydney calendar days, worked out on the server.

Practice is honest self-rating, so it doesn't feed Monitoring circles, the Markbook or To mark. Review quizzes stay the real check.

### End-of-lesson card

When a lesson has released lines, a card appears after the content with those lines, "They join your practice tomorrow" and Open my organiser. The teacher places nothing. It sits outside the lesson footer, because plain lessons opened by link have no footer. A lesson with no lines shows nothing.

Sprint, case study, tutorial and lecture lessons don't show the card in this build. Their lines still reach the tab.

### Print

Two pages of what is released so far: the full sheet, and a blank copy with "usually hide" columns and sequences left empty. Students get this from the tab. The teacher gets it from the unit page, for a chosen class.

## Data

The organiser has its own blob, not a field on the unit, so a lesson editor saving a line can't race a unit page saving the whole unit.

```
unit_organisers/{unit}
{
  sections: [{
    id, name, kind: 'table' | 'list' | 'sequence',
    columns?: [{ id, label, hide: boolean }],
    lines: [{ id, cells: string[], lesson_id?, piece_id? }]
  }],
  week?: { section_id, due: 'YYYY-MM-DD', reason },
  updated_at
}
```

Limits: 8 sections, 200 lines a unit, 400 characters a cell, 80 characters a reason. Line ids are stable, so edits keep a student's box. Reordering keeps ids too.

A deleted line drops out of practice. A deleted piece leaves the line and drops the link.

Students get nothing from a trashed unit, and the blob goes when the unit is deleted for good. Unit templates don't carry an organiser in this build.

Practice boxes:

```
organiser_practice/{class}/{owner}
{ boxes: { [line_id]: { box: 1..5, due: 'YYYY-MM-DD', last: 'YYYY-MM-DD' } }, at }
```

This sits in Teaching's server storage (Netlify Blobs) with other student work, not in the `life-hub-data` git repo. `owner` is `workOwner(classId, studentId)`, the hash lesson work already uses. The class's strict initials claim says who the student is. Boxes hold no line text.

### Endpoints

- **Teacher:** `/api/units/:id/organiser`. Get the organiser, and apply single changes (add, update, delete and move a line; change a section; set the week). Each change reads, applies and writes, so two open tabs don't overwrite each other's lines.
- **Student:** `/api/published/organiser/:class`, using the same origin, rate limit and claim handling as `published-profile.mjs`.
  - `load` returns the released sheet, the week banner, today's cards and the next due date.
  - `review` takes up to 40 `{ line_id, result }` and moves the boxes on the server.

`load` returns the sheet to anyone with the class link, as the progress page does. Cards and "N today" come back only with a claim.

### Failure and edge cases

- **Class with no list:** the sheet shows, with no practice, since nobody can be told apart.
- **No initials yet:** the Start button leads to the usual initials box.
- **Offline or a failed save:** answers wait in local storage and go with the next `review`. The session carries on.
- **A resent answer:** a card moves up at most once a day. A second Got it for the same line on the same day changes nothing, so a retry can't jump two boxes.
- **Two devices:** the strict per-class claim already prevents this.
- **Line released, then withdrawn:** it keeps its box and isn't served until released again.

## Build

One PR, in commits, with few big subagent chunks and the gate once at the end:

1. Organiser store and teacher endpoint, unit page sheet and lesson card, without Ann.
2. Release filter, Organiser tab and the `profile-view.ts` change, Test myself, Print, Set for this week, Run with the class.
3. Practice: Leitner, student endpoint, boxes and session screen.
4. End-of-lesson card.
5. Ann, suggest lines, with the measured cost.

The change stays in `apps/teaching` and `netlify/functions`, so it doesn't need grove or the full Tasks suite. Check the diff for full-suite triggers before `pre-pr-check`.

### Tests

- **Leitner, as a pure function:** each box move, Again then Got it, top box, late cards, the daily limit and its order, one move a day.
- **Release filter:** published, future date, no date, no lesson, unpublished, deleted. Assert unreleased text is absent from the student response, not only hidden.
- **Student endpoint:** no claim, no list, 40-answer limit, unknown line ids ignored.
- **Teacher endpoint:** two changes in a row keep both lines, limits, stable ids.
- **Ann checks:** a quote not in the lesson is dropped, an unknown piece is unlinked.
- **`profile-view`:** tabs with released lines and nothing returned, the map still shown, no tab for the teacher view.
- **Browser walk** at desktop and 390px with synthetic data, covering each screen in the mockup, then live after deploy. Safari gets its own walk. It matters here because phones are where practice happens.

## Out of scope

- A teacher view of practice. Add it only if Adam wants to see who is practising.
- A practice count on the initials token.
- Practice feeding Monitoring circles.
- Labelled diagrams.
- Coaching rounds and the other items on the list: Dual coding, No Opt Out, Tiered questions, Ladder of difficulty, lesson templates.
- The redrafting build, which this doesn't depend on.
