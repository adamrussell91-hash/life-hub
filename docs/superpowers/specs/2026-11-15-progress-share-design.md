# Progress share — design

Date: 15 November 2026
Hub: Teaching
Status: built (see `docs/superpowers/plans/2026-11-15-progress-share.md`)

## Purpose

An adult who supports one student (a pastoral teacher, a parent, a tutor) needs a simple read of how that student is doing in English. They should not see everything the teacher sees. They need:

- what the student has to do next
- what the student has ticked off, and **when**, so a pile of ticks made the night before a meeting shows up as exactly that
- how consistently the student practises, and today's organiser
- upcoming assessments, feedback waiting to be acted on, and progress through the unit
- the lessons themselves, read-only, so they can help a confused student understand a task

The teacher creates the access. The viewer cannot change anything.

## Non-goals

- No marks, rubric scores, feedback text, written work, teacher notes, the student's code, class announcements or skill rungs.
- No messaging, comments or notifications.
- No account system. One link is one viewer for one student.
- No answers or teacher-only lesson content.

## Access

### Teacher side

In the class student list (`apps/teaching/src/teacher/sections/class-students.ts`) each student row gets a **Progress share** button. It opens a small panel listing that student's shares. For each one:

- **Add**: the teacher types the viewer's initials (same `normaliseInitials` rules as students, 1–4 letters plus an optional digit). The server makes a share and replies with the link and a fresh PIN.
- The link is `https://life-hub.adam-russell.com/teaching/s/share/<token>`. The token is 24 random URL-safe characters (`crypto.randomBytes`), not derived from anything.
- The PIN is 6 random digits. It shows in the panel until it is used, then reads "Used <date>".
- **New PIN** makes a fresh PIN for another browser. The old unused PIN stops working. Browsers already in stay in.
- **Remove** deletes the share. The link stops working at once and every browser is signed out.
- Each row shows the viewer's initials, when it was made, and when it was last opened.

A student can have several shares, for example a pastoral teacher and a parent.

### Viewer side

1. The viewer opens the link. If this browser is already in for this share, the page loads.
2. Otherwise the page asks for **your initials** and **the PIN**.
3. The initials must match the share and the PIN must match its current unused PIN. On success the PIN is spent and this browser's device token is recorded on the share.
4. Later visits from that browser need only the link.

All three parts are needed: the URL (unguessable), the initials and the one-off PIN. Without the URL nothing can be reached; the share routes do not list or enumerate.

### Limits and errors

- Wrong initials or PIN: 5 tries per share per Sydney day, then "Too many tries today. Ask the teacher for a new PIN." The counter covers both fields so the reply never says which one was wrong.
- PIN already used: "That PIN has been used. Ask the teacher for a new one."
- Removed or unknown token: one 404 page, "This link doesn't work any more." Same reply for both, so a guess learns nothing.
- Up to 6 browsers per share; a seventh drops the oldest (same rule as students, `MAX_DEVICES_PER_STUDENT`).
- The class or student is gone: the same 404 page.

### Storage

```
progress_share/{token}                  { class_id, student_id, initials, pin_hash, pin_plain?, pin_made_at, pin_used_at?, devices: [hash], made_at, opened_at? }
progress_share_by_class/{class}/{token} { student_id, initials, made_at }   index for the teacher panel
progress_share_tries/{day}/{token}      { count }
```

- Sign-in checks `pin_hash`, the SHA-256 of `token + ':' + pin`.
- `pin_plain` holds the unused PIN so the teacher panel can show it again later (the teacher may make it at school and hand it over at a meeting). Only the operator route returns it. It is deleted the moment the PIN is used or replaced, so a used PIN exists nowhere in plain form.
- Device hashes use the existing `deviceHash` from `class-claims.mjs`. The browser's token comes from the existing `deviceToken('share:<token>')`.
- No names are stored on a share. The viewer is only ever their initials.

## What the page shows

Mobile first, one column, top to bottom. The header names the student (first name from the roster, at runtime) and the class title. Viewer initials sit in the corner with a **Sign out of this browser** link.

1. **Up next**: the items in the Do now and Do next boxes from `todoFor`, as titles only. Each lesson title links to the read-only lesson.
2. **Unit progress**: core lessons done out of core total in the current unit, as a bar with "7 of 12 core lessons".
3. **Coming up**: assessment countdowns from `todoFor.countdowns`, soonest first ("Essay assessment · in 6 days").
4. **Ticked off**: the student's done records, newest first, grouped by Sydney day. Each row shows:
   - the lesson title (links to the lesson)
   - the **time** it was done, e.g. "Tue 11 Nov, 9:42pm"
   - how: *Ticked*, *Quiz submitted* or *Marked by teacher*
   - when the class calendar has the lesson, its planned date, e.g. "planned Mon 3 Nov"
   - **Tick record**: when a lesson has been ticked more than once, or unticked and ticked again, the row says "Ticked 3 times" and opens to its full record, oldest first: "Ticked Tue 4 Nov, 10:02am · Unticked Mon 10 Nov, 9:40pm · Ticked Mon 10 Nov, 9:41pm". The row's main time is the first tick, so ticking again later never hides when it was first done.
   - **Burst flag**: when 3 or more tick events on different lessons fall within 10 minutes of each other, the group gets one label: "5 ticked within 4 minutes". Every tick in the record counts, re-ticks included. Quiz submissions and teacher marks are not counted in bursts.
   - Shows the whole current unit, with a "Show earlier" button after the first 20 rows.
5. **Practice**: current streak in days; a 4-week grid (Mon–Sun rows) with a filled square for each day the student practised; weekly accuracy as "18 of 24 right" per week for the last 4 weeks.
6. **Today's organiser**: cards left today and cards answered today (`practiceToday`).
7. **Feedback to act on**: count and lesson titles of returned pieces to read or redraft, and a count of pieces handed in but not returned yet. Titles only, no text or marks.

Empty states use plain sentences: "Nothing ticked off in this unit yet." "No practice in the last 4 weeks."

## Explainer tour

A guided tour of the progress page, shown once per new browser, then always available from a small Help button.

### When it runs

- On the first load of the progress page in a browser, after the page has rendered (not over the sign-in form).
- "Seen" is a `localStorage` flag, `progress-share-tour:v1`, set when the tour finishes or is skipped. It is per browser, not per share: a parent who has two children's links sees it once. Reads and writes are wrapped in try/catch; if storage throws, the tour does not auto-run (better to miss it than repeat it every visit) and the Help button still works.
- Bumping the key to `v2` re-shows it after a meaningful change to the page.

### How it looks

- A dimmed backdrop with a spotlight cut out around the current section (rounded rectangle, 8px padding). The spotlight glides between sections (transform and size, 300ms ease-out); the page scrolls the section into view first (`scrollIntoView({ block: 'center', behavior: 'smooth' })`).
- An explainer card beside the spotlight: a step title, one or two sentences, step dots ("3 of 10"), and **Back**, **Next** (**Done** on the last step) and **Skip tour**. Positioned by the tour itself: below the section, else above it, clamped to the screen.
- At 390px the card docks to the bottom of the screen at full width, with the spotlight above it, so it never covers the section it describes. While it is open the page gets bottom room so the last sections can scroll above the card, and every section has a `scroll-margin-top` that clears the class site's sticky header.
- Keyboard: focus moves into the card; Right/Enter = Next, Left = Back, Esc = Skip. Focus is trapped in the card while it is open and returns to the Help button afterwards. The card is `role="dialog"` with `aria-modal="true"`, labelled by its title; step changes are announced via its live region.
- The page underneath is `inert` while the tour runs.

### Steps

Steps whose section is not on the page (for example no assessments coming up) are left out, and the dots count only the steps shown. The student's first name fills `{name}`.

1. **Welcome** (centred, no spotlight): "This page shows how {name} is getting on in English. You can look at anything, but nothing here can be changed."
2. **Up next**: "What {name} should work on now and next."
3. **Unit progress**: "How far through the current unit {name} is, counting the core lessons."
4. **Coming up**: "Assessments on the way, soonest first."
5. **Ticked off**: "Everything {name} has finished, with the time it was done. When lots are ticked within a few minutes, you'll see a label saying so."
6. **Practice**: "Each square is a day {name} practised with their organiser. The weeks show how many cards they got right."
7. **Today's organiser**: "Cards left to practise today, and how many are done."
8. **Feedback to act on**: "Work handed back that {name} still needs to read or redraft, and work waiting to be marked."
9. **Lessons** (spotlights the first lesson link on the page): "Tap any lesson to read it as {name} sees it. It opens locked, so you can help without changing anything."
10. **Help**: no separate step. Finishing or skipping triggers the shrink.

### The shrink

When the tour ends (Done, Skip tour or Esc):

1. The spotlight and backdrop fade out (200ms).
2. The explainer card animates into the Help button: a FLIP transition from the card's rect to the button's rect (scale, translate, border-radius to a circle), 450ms `cubic-bezier(0.2, 0.8, 0.2, 1)`. Its text fades out in the first 120ms so only the shape travels.
3. The Help button then appears in its place with a single soft pulse (one ring, 600ms), and stays.

The **Help button** sits fixed at top right (16px inset, below the share header on mobile): a 32px circle with a "?" glyph, muted colour, `aria-label="Show the tour again"`. Clicking it replays the tour from step 1. Replays end with the same shrink.

With `prefers-reduced-motion: reduce`, the spotlight jumps instead of gliding and the card cross-fades into the button instead of flying.

### Code

- `apps/teaching/src/app/tour.ts` + `tour.css`: a generic `mountTour({ steps, helpButton, storageKey })` where each step is `{ target?: () => HTMLElement | null, title, body }`. It returns `{ start(), dispose() }`. Nothing in it knows about progress shares, so other pages can reuse it.
- `share-view.ts` builds the steps (`mountShareTour`).

## Read-only lessons

A lesson link from the share page opens `/teaching/s/share/<token>/lessons/<lessonId>`.

- The page payload carries `lesson_ids` (the student's own `lessonsForStudent` list). The lesson view opens only those, and otherwise says the lesson isn't on the student's list. Published lessons are already public at `/s/lessons/<id>`, so a separate server check would add no protection.
- It shows the **published student content**: the same `renderPublishedLesson` output a student sees. Teacher notes, Teacher callouts and teacher-only blocks stay out, because the published copy already strips them. No answer keys are added.
- It is locked:
  - the lesson content root gets the `inert` attribute, so nothing in it can be clicked, typed in or focused
  - the lesson renders through `renderLockedLesson` (`share-lesson.ts`), which passes no class id to the blocks and mounts none of the student page's extras (work sync, footer tick, initials token, organiser end card, class examples, live quiz, pulses), so nothing saves or claims
  - a banner across the top: "Viewing only. Nothing here can be changed." with a **Back to progress** link
- Long lessons still scroll; collapsed sections and every tab panel render open so nothing is hidden behind a control the viewer can't press.
- Lecture and quiz-mode lessons render their content as a plain block list (no player).

## Server

New and changed files in `netlify/functions/`:

| File | Job |
|---|---|
| `_shared/progress-share.mjs` | Make, list, re-PIN and remove shares; check initials + PIN; record devices; read a share for a device |
| `_shared/progress-share-page.mjs` | Build the viewer payload from existing helpers, through a strict allowlist |
| `published-progress-share.mjs` | Public route `/api/published/share/:token`, actions `status`, `sign_in`, `page`, `lesson`, `sign_out` |
| `class-progress-share.mjs` | Operator route `/api/classes/:id/shares`, actions `list`, `add`, `new_pin`, `remove` |
| `_shared/public-student-routes.mjs` | Allow the new public route |
| `_shared/organiser.mjs` | `organiserHabits` also returns `days` (sorted practice days, last 28) for the grid |

### Tick record

Done records are create-only and an untick deletes them, so today a re-tick replaces the original time. A new append-only log keeps every event:

```
profile/{class}/{student}/ticks/{lesson}   { events: [{ at, kind: 'tick' | 'untick' | 'quiz' }] }
```

- `recordDone` appends `tick` (or `quiz`) and `undoTick` appends `untick`, in `_shared/profile-done.mjs`. The append uses the store's etag (`onlyIfMatch` / `onlyIfNew`) with up to 5 retries, like `writeTeacherMark`.
- The log is written after the done record. If the append still fails, the tick itself stands and the failure is logged; a student's tick never fails because of the record.
- A repeat `done` for a lesson that is already ticked writes no event (nothing changed).
- At most 50 events per lesson; beyond that the oldest drop, keeping the first event.
- Ticks made before this ships have no log. Their done record's `at` stands in as a single `tick` event, so the page reads the same either way.
- Nothing else reads or shows the log. The student's own page and the teacher's views are unchanged, though the teacher's Over time view could use it later.

`progress-share-page.mjs` calls `unitState`, `todoFor`, `organiserHabits`, `practiceToday`, `returnedRows` and `listDone`, then copies only these fields:

```
{ student: { first_name }, class_title, viewer_initials, lesson_ids,
  next: [{ title, lesson_id? }],
  unit: { title, core_done, core_total },
  countdowns: [{ title, due }],
  ticks: [{ lesson_id, title, at, via, planned?, record: [{ at, kind }] }],
  bursts: [{ from, to, count }],
  practice: { streak, days: [date], weekly: [{ week_start, right, seen }], today: { left, answered } },
  feedback: { to_act: [{ title, redraft }], waiting: number } }
```

`unitState` in `profile.mjs` is exported so the share page reuses it without copying.

Rate limit on the public route matches `published-profile.mjs`. Bodies over 4000 bytes are refused.

## Front end

| File | Job |
|---|---|
| `apps/teaching/src/student/share-view.ts` + `share-view.css` | Sign-in form and the progress page |
| `apps/teaching/src/student/share-lesson.ts` | Read-only lesson wrapper |
| `apps/teaching/src/student/share-format.ts`, `share-api.ts` | Sydney times, burst labels; the client calls |
| `apps/teaching/src/app/tour.ts` + `tour.css` | The explainer tour |
| `apps/teaching/src/app/router.ts`, `main.ts`, `class-site.ts` | Routes `share` and `share-lesson` under `/s/` |
| `apps/teaching/src/teacher/sections/class-students.ts` | Progress share button and panel |

The share pages use the student shell styles (design kit tokens, light and dark). At 390px nothing scrolls sideways; the practice grid fits seven 32px squares with gaps.

## Privacy

- Code, fixtures, tests, screenshots and this doc use invented students and viewers only.
- The allowlist test is the guard: if a field outside the list above appears in the payload, the test fails.
- `scripts/privacy-guard.mjs` must pass unchanged.

## Testing

Unit (`tests/unit/progress-share.test.js`, in-memory store):

- add returns a token and a 6-digit PIN; the stored record holds only the hash
- correct initials and PIN sign in once; the same PIN fails afterwards
- wrong initials and wrong PIN count toward the same 5-a-day cap; the reply text is the same for both
- new PIN invalidates the unused one and keeps signed-in devices
- remove makes the link 404 for a signed-in device
- a seventh device drops the oldest
- lesson outside the student's unit returns 404

Unit (`tests/unit/progress-share-page.test.js`):

- payload keys exactly match the allowlist; no `feedback`, `rubric`, `score`, `code`, `text`, `name` (other than `first_name`) at any depth
- burst detection: 5 ticks in 4 minutes → one burst label; 2 ticks → none; quiz and teacher marks excluded; re-ticks count
- tick record: tick → untick → tick gives three events and the row keeps the first tick's time; a pre-existing done record with no log reads as one tick; a repeat `done` adds no event; a failed log write leaves the tick in place
- the student's own `progress` payload is unchanged (snapshot of keys)
- planned date appears when the calendar has the lesson

Browser (`tests/browser/progress-share.spec.mjs`, desktop and 390px):

- sign-in form → page renders every section with fixture data
- clicking a lesson opens the locked view; typing in a writing box does nothing; the banner shows; Back returns
- no horizontal scroll at 390px
- tour: first load shows step 1; Next walks every present step; Skip ends it and the Help button is visible top right; reload does not show the tour again; Help replays it; Esc ends it; at 390px the card docks at the bottom and doesn't cover the spotlit section

Unit (`tests/unit/tour.test.js`, jsdom): steps with a missing target are dropped; the seen flag is written on finish and skip; a throwing `localStorage` neither auto-runs the tour nor breaks Help; focus returns to the Help button.

## Failure modes to check (UI register)

Before review, check the relevant entries in `docs/CURSOR-UI-FAILURES.md`. The build brief cites their IDs: horizontal overflow at phone width, controls that look live but do nothing (the locked lesson must look locked), and empty states.
