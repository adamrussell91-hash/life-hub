# Calendar: comms, meetings and events (Professional Hub)

Status: design approved by Adam, 26/09/26. The mockups are the visual contract.
Mockups: `docs/professional-hub/calendar/mockups/index.html` (published as the "Calendar and Comms" artifact, round 2).

## The idea

Comms, Meetings and Events stop being three separate sections. They become one **Calendar** under Home in the Professional rail. The three kinds share one page shell built around people. The calendar is the existing Tideline object, not a new one.

| Kind | What it is | Example |
|---|---|---|
| **Comm** | You start it, in any channel: in person, email, call, text, chat | Declan's essay feedback, an email to Amy |
| **Meeting** | Someone else's, which you attend. It can be big or small, in person or online, and it has a purpose | HALT board meeting |
| **Event** | Planned in advance. PD is optional | HALT medal ceremony (not PD), Warlight (PD) |

Students, parents and colleagues are all People. No separate "student" field.

## 1. Calendar

- It's the locked Tideline object (`packages/design-kit/CALENDAR.md`). There are no new zoom stops, bands, week shapes or chrome. The Professional adapter stays under 150 lines.
- **Sources.** Add `comms` and `promises` to `FILTER_CHIPS` in `calendar-filter.js`. Reuse the existing `events` id, which moves from the teaching group into the shared list. `meetings` and `pd` already exist. Because the filter is shared, every hub gets the Comms filter. The starting state for each hub:
  - Life: all on.
  - Teaching: Classes, Comms and Promises.
  - Professional: Comms, Meetings, Events, PD and Promises.
  - Tasks: Tasks and Promises.
- **Round dots.** The source pill marker changes from an 8px square to an 8px round dot. This is a change to the locked contract, so update `docs/proposals/calendar-reference/VISUAL-SPEC.md` (Sources row) and the Tideline goldens in the same PR.
- **Tints.** They come from the locked pastel set:
  - Comms: blue fill with a Wave stripe. Classes stay 80% white, so the two remain distinct.
  - Meetings: lilac.
  - Events: gold.
  - PD: peach.
  - Promises: High Sea.
- **Comm with no duration** (email, text, call log). It's drawn as a 22px pin chip on its hour, never as a block.
- **Promises** sit in the **Due** row beside task chips:
  - Promises you owe: dashed High Sea.
  - Promises owed to you: dashed Wave.
  - Overdue: solid High Sea with "N days late".
- **Clare's tray.** Clare's proposals ("book session 8", "wrap up Declan", "Denielle's summary is late") follow the ghost rules. They only go into `pending-calendar-ghosts.json`, and Accept writes on the server through `acceptPlan`. A proposed wrap-up block is a ghost chip.
- Old routes `#/communications`, `#/meetings` and `#/events` redirect to `#/calendar`. Record routes such as `#/meeting/<id>` and `#/event/<id>` stay.

## 2. The shared page shell

Every comm, meeting and event page has:

1. A header with a kind chip, channel or place, time, and tags.
2. A **thread strip**, if the record belongs to a thread.
3. A **phase switch**: Before · During · After.
   - The clock sets it: Before until the start, During until the end or until you tap End, After once it's over. You can switch it by hand.
   - A comm or meeting with no time (for example a logged email) opens in After.
4. A main column, which depends on the phase.
5. A **people rail**: people who were there, people who are "also concerned, not there", and links (thread, class, project, assessment, tasks).

### Body = the existing block engine

- The body is a block page from the Tasks and Lessons engine, with the round "+" (`mountBlockInsert`) and the same palette families. No new toolbar.
- The plan's first step checks how Teaching mounts this engine from `apps/tasks`. If Professional can't import it cleanly, move the engine into `packages/` first. Don't fork it.
- No new block types. Clare adds *actions* to existing blocks:
  - Image: **Read handwriting**. Claude vision turns the photo into text. The text goes under the photo and the photo stays.
  - Audio or attachment: **Transcribe and summarise**. This covers transcripts and pasted email threads too.

### Before · prep

- **Carried promises.** Open promises from the last record in the thread appear as ticks labelled You / name. Ticking one marks it kept.
- **Clare's brief:** three numbered points, each with its source (for example "comm 2" or "Canvas, 13 Oct"), plus a line about any promise owed to someone else in the circle.
- **Agenda:** reorderable items, each tagged with where it came from (Clare, carried, you).

### During · capture

- A live strip at the top: the timer, which agenda item you're on, and End.
- The block page, with focus in it.
- **Inline promises.** Typing `»me` or `»<name>` in any text block creates a promise chip there. No form.
- `@name` tags a line to a person.

### After · wrap-up

- **Clare's summary**, which you can edit.
- **Promise ledger** in two columns:
  - I owe: each promise has a Task switch, which is on by default when it has a due date.
  - They owe: checked at the next record in the thread.
- **Follow-up drafts**, one tab per person. Clare drafts them and Adam sends them himself ("Copy to Outlook", "Mark as sent"). Nothing is ever sent automatically. Mark as sent logs an outbound comm on the thread and ticks the matching promise.
- A suggested next date, with a Book button (as a ghost).

## 3. Threads

- A thread is a chain of records about the same people and purpose.
- New records join a thread automatically when the people and the purpose tag match the last 90 days. Otherwise Clare proposes a thread and Adam confirms it. Adam can move a record into another thread.
- There are two thread kinds:
  - **General** (tab 2): feedback, study, parent and colleague chains.
  - **Case** (tab 3): a case management page with the elements below.
- **Case page elements:**
  - **Goals** with progress. Clare reads numbers Adam types in sessions ("31/50") and proposes an update. Adam confirms it.
  - **The circle:** people and their roles, with one line of Clare's read on each.
  - **The ledger:** old sessions fold to one line each. The next session sits at the bottom with its carried promises. "Open session page" opens the clock page.
  - **Promise stats:** made / kept / open, and per-person keep rate.
  - **Export case summary**, for Learning Support or parent meetings.

## 4. Promises

A promise is its own record:

- `id`
- `source_ref`: the comm, meeting or event it was made in
- `owner`: `me` or a person ref
- `text`
- `due`: optional
- `state`: open / kept / dropped
- `task_id`: set only for promises you own, when you choose to make a task
- `checked_in_ref`: the record where it was ticked

What reads and writes promises:

- The calendar Due row, the thread strip, the walk-in card and Home nudges all read this store.
- Only your own promises can become tasks. Other people's promises never create tasks.

## 5. Meetings

- A **purpose** box ("Why you're there"), set before the meeting. Clare checks the outcome against it afterwards and carries anything unmet into the next meeting of the same series.
- **Agenda and notes are one page.**
  - Each agenda item is a heading in the block page, with its notes, decisions and promises underneath.
  - A pasted invite or agenda email becomes the headings.
  - Space above item 1 holds anything off the agenda.
  - Items you own are marked.
- **Decisions** are marked with `✓ Decision` and logged to the organisation page.
- **The room:** attendees grouped by organisation, with warmth dots (`warmthFor(person)` from People). Unknown attendees get "Add to People".
- **Actions** split three ways: yours (you can make a task), theirs (tracked as promises) and decisions.

## 6. Events and PD

- Every event gets the shell and a block page. Photos are a gallery block, not a panel.
- **Counts as PD** is a switch.
  - Off: no hours, standard, certificate or evidence panel. For example the medal ceremony.
  - On: hours, NESA standard, focus area, accreditation, certificate and the learning task appear.
  - It maps to `event_type` (`professional_development` or not).
- **PD shape**, chosen when PD is on:
  - **One-off:** one event.
  - **Series:** sessions weeks apart (Warlight: 18/09, 30/10, 20/11).
  - **Program:** a multi-day seminar with many talks. **Each day is a separate event** in its own day's bands. A program is never one event spanning several days.
- A series or program is a **PD group** record that groups its events. The group page adds up hours (for example "6/18 series hours") and shows the sessions as a strip with the gaps between them.
- Each event holds **talks and activities**: time, title, presenter, hours. Hours across talks add up to the event's hours.
  - Each talk has "Make note", which creates a Knowledge Hub note linked back to the talk.
  - A made note shows "✓ Knowledge note".
- Certificates are per event (per session).
- **The PD dashboard is not changed.** It keeps reading events with `event_type = professional_development`.

## 7. Linking without the retry button

- Remove the "Retry incomplete Task link" button and its notice from `schedule-relationships.ts`, `events.ts` and `communications.ts`.
- The client retries `incomplete_links` and `*_operation` projections by itself:
  - It calls the existing retry endpoints (`retryMeetingTaskLink`, `retryMeetingLinks` and the event and comm equivalents) with backoff: 5s, 30s, 2m, 10m, then every 30m while the page is open.
  - A server job does the same for records that aren't open.
- What Adam sees:
  - While a link is pending: "Linking…" in muted text.
  - When it succeeds: a green "✓ linked".
  - After an hour of failures: a small amber dot. Tapping it shows the error code in plain words and one "Try now" action.
- The rule against creating a second task while a link is pending stays. It's enforced silently by keeping the task switch disabled.
- The task title is prefilled. Clare suggests one from the record, so there's no blank "Task title" field.

## 8. Phone (390px)

- **Walk-in card.** On Home, ten minutes before any timed comm or meeting, a card shows:
  - who it's with, and the last contact in one line
  - Clare's three points
  - what you owe them
  - **Start** (opens During) and **Open page**
- **10-second log.** A bottom sheet with:
  - recent people first
  - four channel buttons, guessed from where you are (school means in person)
  - one line of text, where `»me` makes a promise
  - **Log it**
  - Clare files the entry into the thread afterwards.

## 9. Clare

| When | Clare does | Writes |
|---|---|---|
| Before | Brief (3 points with sources), agenda suggestions | Proposal only |
| During | Reads handwriting; transcribes and summarises audio and pasted text; spots numbers for case goals | Blocks Adam can edit |
| After | Summary, promise extraction, follow-up drafts, next-date suggestion | Summary and promises on confirm; the date as a ghost |
| Always | Nudges for late promises, threads going quiet, missing wrap-ups | Tray and ghost queue only |

- All calls go through the existing agent path with Adam's Anthropic API key.
- Handwriting uses Claude vision on the image block.
- Clare never sends a message.

## 10. Data changes (additive)

| Record | Add |
|---|---|
| `CommunicationRecord` | `scheduled_start`, `scheduled_end`, `time_zone` (optional, for timed comms); `thread_id`; `agenda`; `blocks`; `purpose_tag` |
| `MeetingRecord` | `purpose`; `thread_id` / series ref; `blocks` (the agenda becomes headings); `decisions[]` |
| `EventRecord` | `pd_group_id`; `talks[]` (`id`, `time`, `title`, `presenter`, `hours`, `knowledge_page_id`); `blocks` |
| New `Thread` | `id`, `kind` (general / case), `people[]`, `purpose_tag`, `goals[]` (case only) |
| New `Promise` | as in section 4 |
| New `PdGroup` | `id`, `shape` (series / program), `title`, `provider`, `event_ids[]` |

- People links keep using universal links and relationships. Existing `agenda` and `notes` strings are migrated into text blocks.

## Out of scope

- The PD dashboard.
- Sending email or texts.
- Student-facing calendars.
- Month view (not a zoom stop).
- An internet sweep for PD.

## Open questions for the plan

1. How Teaching imports the block engine, and whether it moves to `packages/` (section 2).
2. Where students currently live (Teaching roster or People), and how a student joins People without duplicates.
3. The migration of existing Communications from Notion (Meeting Type becomes `purpose_tag`; Parent item and Sub-item become thread links). This may be a separate step.

## Build shape

One PR, phases as commits:

1. Block engine available in Professional.
2. Data additions and the promise store.
3. Calendar sources (shared kit), Due row promises, pin chips, route redirects.
4. Page shell and phases for comms.
5. Threads and the case page.
6. The meeting page.
7. Events, PD shape, talks and Knowledge notes.
8. Linking without the retry button.
9. Clare actions.
10. Phone walk-in card and 10-second log.
