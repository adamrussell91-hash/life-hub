# Student page: Over time (teacher only)

Date: 6 November 2026
Mockup: [`docs/mockups/student-over-time.html`](../../mockups/student-over-time.html)

## What Adam asked for

Clicking a student's name should give a personal page that only the teacher sees, tracking the student's progress over time in everything that is tagged.

## Where it lives

The name click already opens the student's own page as the teacher (`/classes/:classId/students/:studentId`, `teacher/student-profile-page.ts`, PR 1258). Adam's rule from 1 Nov 2026 is one profile, the student's, with teacher-only extras on that page and never a separate panel.

So this is a fourth tab on that page, **Over time**, with an "Only you" badge. It appears only when `renderProfile` is given `teacher`. The student's own login never builds the tab, never calls its endpoints, and never receives its data.

The teacher still lands on **My progress**. The URL `?tab=over-time` opens the new tab directly, so a refresh keeps it.

## What the tab shows (top to bottom)

1. **Banner.** "Only you see this tab. [Name] sees the other tabs, never this one."
2. **Range.** Unit, Term or Year. The default is Year. Unit means the unit the class is on today. Term follows the school term dates already in the calendar.
3. **Three cards: Rising, Slipping, Stuck.** Each card names one tag and gives its first and latest score plus a reason in plain words ("Fell on each of the last four tagged questions. Class sits at 64%."). Stuck means three or more pieces staying in a 10-point band under 55%, or the same named mix-up repeating. If nothing qualifies, the card is left out. No card is ever padded.
4. **Everything tagged, week by week.** One line for the student and a dashed line for the class mean, both using the latest attempt for each item. Above the chart, coloured dots mark each event: quiz, returned writing, viva, sprint. Holidays show as a gap line.
5. **Every tag.** One row per tag the student has evidence on:
   - name, kind and number of pieces
   - a small chart of the tag's history with the class line
   - latest score, change from first to latest, and class latest
   - a label: Secure (75% or more), Growing, Needs work (under 55%, or down 8 or more), New (one piece)

   Filter chips show only the kinds present: Syllabus (`dp`), Outcomes (`out`), Thinking skills (`skill`), Families (`fam`), Techniques (`tech`), Deep understandings (`du`/`kp`), Vocabulary (organiser). Sort by Biggest change (default), Weakest now or Most recent. At 390px the change and class columns fold into the row's subtitle.

   Clicking a row opens the dated evidence behind it (date, source, which questions or part, mark) and three buttons:
   - **Make it a next step:** opens the existing personal next-step flow with the tag filled in.
   - **Add to a group:** opens the existing saved-group picker.
   - **Open the tag:** goes to the Markbook pattern for that tag.
6. **Deep understandings.** For each of the unit's deep understandings, a three-step bar (Essential, Strong, Sophisticated) showing the best piece now and, in pale blue, where it started. Each one lists its sources, or "Not tested yet · taught in N lessons".
7. **Writing and speaking.** The marking codes grid from `progressFor` (one square per returned piece, green for strength, orange for next step) with a trend per code. Beside it are returned pieces, vivas and sprint parts, each with its next step and whether the student acted on it.
8. **Habits.** Quizzes done on time, organiser streak and average Leitner box, next steps acted on, and redrafts handed in. Each habit has a small bar chart.
9. **My notes.** Private dated notes, newest first. A note can carry one tag, and a tagged note also shows inside that tag's row detail. Notes can be edited and deleted.

Empty states are plain: "Nothing tagged yet for [Name]. Tagged quiz questions, marked work and vivas will show here."

## Data

Most of the data already exists and is already joined on the client. There is one new store.

| Section | Source | New work |
|---|---|---|
| Trend, cards, Every tag | `httpMarkbookApi.load(classId)` + `loadInsightContext()` → `classEvidence(view, ctx)`, the same call the DU monitor and Next steps make. Filter to `student === id` for the student, keep the rest for class means. | A pure module `evidence/over-time.ts` that buckets by week, works out the change, band, and Rising/Slipping/Stuck |
| Deep understandings | `deepApi.load(classId, unitId)` + `kp:` evidence | Per-student piece history (earliest vs latest best piece) |
| Writing and speaking | `progressFor` → `codes`, `pieces`, `next` (already in the profile payload) | Trend per code; "acted on" read from redraft and next-step records |
| Habits | Markbook view (quiz on time), organiser Leitner state, redraft records | A small teacher read of one student's organiser boxes |
| Vocabulary rows | Organiser Leitner reviews by day | Same read, turned into a weekly share-right series |
| Notes | **New** blob key `teacher-notes/{classId}/{studentId}.json`: `[{ id, at, text, tag? }]` | New operator-only actions `notes`, `note_save`, `note_delete` on `/api/classes/:id/profile` |

Private notes are kept apart from `studentNotes` (feedback docs, which students can see). They use their own key prefix, which no student route reads. A test pins that the student `profileAction` cannot reach them.

## Privacy and safety

- The tab, its data and the notes are teacher only. The operator gate on `/api/classes/:id/profile` already enforces this. The new note actions sit only in `teacherProfileAction`.
- Opening the tab never marks anything as seen.
- Students who have left the class are excluded from class means (same rule as Next steps).
- Mockups, fixtures and tests use invented students only.

## Out of scope

- AI summaries of the student. Confirm cost first if this is ever wanted.
- Printing or exporting the page.
- Comparing two students.
- Showing any of this to the student or parents.

## Open calls for Adam

1. The thresholds (Secure 75%, Needs work under 55% or down 8, Stuck rule) copy the Next steps guesses. Check them against a real class after it ships.
2. Should "Make it a next step" send straight away or open a draft? The plan opens a draft.
