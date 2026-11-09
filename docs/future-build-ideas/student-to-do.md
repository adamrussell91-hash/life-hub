# Student to do list (beside the unit map)

Mockup: [`student-to-do/mockup.html`](student-to-do/mockup.html) (invented student and class)

## The idea

On the student progress page (`/s/classes/:id/profile`, My progress tab), the unit map only fills the left third of the page at desktop width. Put a **To do** panel in the empty space to its right. It answers "what do I need to do next?" in one place, so the student does not have to piece it together from the class page, the organiser and Returned work.

Ticks come from what the student has actually done. The student never ticks a box by hand.

## What the panel shows (top to bottom)

1. **Assessment countdown.** The next assessment task for the class, with days, hours and minutes left, the due date and time, and a bar showing time gone since it was set. It is hidden when no assessment is due.
2. **From your teacher.** Announcements the teacher posts on the class page, newest first, each with its day.
3. **Today.** Organiser practice for today ("8 cards · about 3 minutes"). It shows a tick once today's set is done.
4. **Back to you.** Feedback states:
   - **New**: feedback has come back and the student hasn't opened it.
   - **Have another go**: the teacher asked for a redraft.
   - **With your teacher**: handed in, feedback not back yet.
5. **Keep going.** Lessons the student has opened or started but not finished. Each shows how many of its activities are done, with the unfinished ones listed and a "Carry on →" link.
6. **Still to do.** Lessons in the unit not yet done, in route order. Recently finished ones show ticked and struck through, then drop off.

On a phone the panel sits above the map rather than beside it.

## Where the data comes from

| Item | Exists today | New work |
|---|---|---|
| Countdown | `countdown` block (`due_date`, `due_time`, `set_date`) on assessment pages. Markbook assessment columns also have a `date`. | Choose which source counts as "the" due date, then add it to the profile payload. The renderer already exists (`blocks/classroom-tools/render.ts`). |
| Announcements | `homepage.announcements` on the class, shown on the student class page | Send the newest few in the profile payload. Possibly add a posted-at date to each so "Today" and "Monday" can show. |
| Organiser today | Organiser practice already returns `today` (cards due) | Read "done today" from the review log. |
| Feedback new | `unseen` count plus Returned work items with `new` | None. List the items rather than only counting them. |
| Have another go | Redraft records (`work_redraft/...`) and `redraft: 'asked'` on returned items | None beyond listing them. |
| With your teacher | Hand-ins (`work_handins/...`) | Check for hand-ins with no mark yet. |
| Started lesson + activities | Work saves per block (`work/{lesson}/{owner}`) show which written activities have text | **No "opened" event exists.** Either count a lesson as started once any work is saved, or add a light `opened` record. Work out which blocks count as activities: written ones are trackable, reading-only ones are not. |
| Still to do | `map.lessons[].done` and `map.next` already in the payload | None. |

Most of this is a new read in the `progress` action plus a renderer. The two genuinely new pieces are an "opened" signal and choosing the countdown's source.

## Open questions

- Should "Keep going" count reading-only blocks (videos, texts) as activities? They leave no trace today.
- When the teacher looks at a student's page, should they see the same panel? It would be useful in a meeting, but this page currently keeps teacher extras on their own tab.
- How long should done items stay ticked before they drop off? One day, or until the next lesson?
- Should an announcement show only on the class page and here, or also on each lesson page?
- Should the countdown cover more than one assessment if two overlap?
- Should the student be able to hide a finished item?

## History

- 9 November 2026: first draft and mockup.
