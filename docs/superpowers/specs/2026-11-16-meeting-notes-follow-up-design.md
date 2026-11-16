# Meeting notes follow-up

16 November 2026. Professional hub, meeting page.

## Problem

Adam forgets to send meeting notes to people after a meeting. He doesn't need to send them after every meeting, but when he does, he needs something that won't let him forget.

## Decisions

- **Ask at the end of the meeting.** The meeting page asks once, after the meeting is completed.
- **Share sheet is how notes go out.** Publishing the meeting's Share sheet counts as sending the notes.

## Behaviour

### The ask

- A bar shows on the meeting page when `state === 'completed'` and the meeting has no `notes_follow_up` answer.
- It shows straight after Complete is pressed and on any later visit, until it is answered.
- The bar reads "Send your notes to {names}?" with up to three names, then "+N". With no attendees it reads "Send your notes from this meeting?".
- The buttons are **Yes, remind me** and **Not this one**.
- The bar doesn't show if the meeting already has a published share sheet. Cancelled, no-show, rescheduled and scheduled meetings never show it.
- Meetings completed before this ships show the bar too, the first time they are opened. That's acceptable: one tap on Not this one clears it.

### Yes, remind me

1. Creates one task, "Send notes: {meeting title}", due the day after the click, linked to the meeting through the existing meeting task link (`linkMeetingTask`).
2. Creates one `you_owe` ledger item per current attendee, with text "Send meeting notes", `comm_ref` set to the meeting ref and `task_ref` set to the new task.
3. Saves `notes_follow_up` on the meeting record: `{ answer: 'yes', task_id, ledger_ids, answered_at, sent_at: null }`.
4. The bar becomes "Notes to send" with a Share sheet button that opens the existing share panel. It stays on the meeting page as a nudge until the sheet is published.

If task creation fails, nothing is saved and the bar shows an error with the buttons still enabled. If a ledger item fails after the task exists, the answer is still saved, keeping the ids that succeeded, so a retry can't create a duplicate task.

### Not this one

Saves `{ answer: 'no', answered_at }`. The bar disappears.

### Publishing the share sheet ticks it off

When a sheet is published for a meeting whose `notes_follow_up.answer === 'yes'` and `sent_at` is null, the share panel:

- sets the task's status to done
- marks each ledger item done
- sets `sent_at`

This runs in the browser, in the share panel, after a publish succeeds. The panel is the only place a sheet gets published. Doing it on the server would mean the meetings function writing to the Tasks store, which pulls the Tasks suite into every change here. Each step is best-effort: a failure never fails the publish, and `sent_at` stops it running twice.

Ticking the task off by hand in Tasks leaves the ledger items open until the sheet is published.

## Out of scope

- Sending email or messages.
- Choosing which attendees to include.
- Nudges for old meetings beyond the bar described above.
- Clare prompts.

## Testing

- Unit tests for the bar-visibility rule: completed and unanswered shows the bar; answered, already shared, or any other state hides it.
- Unit tests for the Yes flow with stubbed APIs: task, ledger and saved answer; the partial-failure path.
- Unit tests that `markNotesSent` ticks the task and ledger items and sets `sent_at` once, and keeps going when one tick fails.
- Schema tests that `notes_follow_up` validates, survives a read and reaches the page.
- A walk in the dev mock at desktop and 390px using invented people.
