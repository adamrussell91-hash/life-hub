# Design Sprint: teacher notes, phase Gantt and practice run

24 October 2026. Builds on `2026-10-24-design-sprint-design.md`.

## Purpose

Adam set up his first sprint and could not tell when anything opened or
closed, what each Kit section was for, or what students would see. Three
parts fix that, in one PR, one commit each.

## Adam's calls

- Notes are fold-outs on each Kit card plus a "How a sprint runs" fold-out at
  the top. Closed by default. Fixed help text, not editable.
- Phases are a Gantt chart (not a kanban). Click a bar to edit. No dragging.
- The practice run shows Student 1 and Student 2 side by side.
- Skip ahead jumps to the next change, one press at a time.
- When the run waits on the teacher, a "Your move" card says what to do and
  holds the button. The teacher's progress map for the practice group sits
  below.
- Each form in a practice run has "Fill with sample answers".
- The practice run is a separate copy on the server, run by the real sprint
  code, on the current draft Kit, without publishing.

## 1. Teacher notes

`sprint/notes.ts` holds the text: one note per Kit card (Settings, Criteria,
Reflection, Requirements, Idea guide, Phases, Groups) and one "How a sprint
runs". Each note has three short parts: What it's for, What students see,
Setting it up. 60–90 words open. Plain words to the teacher.

`card()` in the Kit editor takes an optional note and adds a
`<details class="kit-note">` with summary "How this works" under the card's
line. The sprint overview sits above the first card.

## 2. Phase Gantt

`sprint/phase-timeline.ts`:

- `phaseSpans(phases, lockHours, now?)` is pure. Each phase gets
  `opens` (Understand: null = "when you start"; others: the previous close),
  `closes` (epoch or null), `lock` (`{ from, until }` for a class phase with a
  lesson end time), and `problems` ("Set a close time", "Closes before
  Sketch", "Lock time is after the close").
- `renderPhaseGantt(host, spans, { now, onPick, note })` draws the chart: a
  day axis from the first open day to the last close day, one row per phase,
  blue bars for class and green for home, a striped lock piece, a red now
  line when `now` is given. Missing closes draw a dashed red bar labelled
  "Set a close time". Same look as the Tasks Gantt (row 46px, bar 30px, 0.5px
  borders); the code is Teaching's own because Tasks' Gantt is day-only and
  tied to Tasks projects.
- At 390px the chart turns on its side: one row per phase stacked, each with
  Opens and Closes as text and a thin bar. No horizontal page scroll.

In the Kit, the Phases card becomes the chart. Clicking a bar opens that
phase's editor under the chart: Class or Home, close date and time, for class
phases a "Lock work when the lesson ends at [time]" tickbox (same day as the
close; writes `ends_at`), and labelled "What students do" and "Stretch
(optional)" boxes. Opens shows as text.

On the progress map the chart sits above the grid, following class deadlines
(with class extensions) and the real now line. A bar adds "Open early for N
groups" when groups have opened that phase before its time.

## 3. Practice run

### Server

`netlify/functions/sprint-practice.mjs`, path
`/api/lessons/:id/sprint-practice`, operator-gated like `sprint.mjs`.

Ops:

- `state`: the whole practice screen in one reply: practice `now`, the next
  change `{ at, label }` or null, the student-shaped lesson, the teacher
  summary and each pretend student's view.
- `student` with `as: 's1' | 's2'` and a student body: runs `sprintAction`.
- `teacher` with a teacher body: runs `sprintTeacherAction`.
- `skip`: moves the practice clock to the next change.
- `reset`: deletes every practice key.

The practice copy:

- Keys live under the lesson id `{id}~practice`, so the real sprint's keys
  are never touched. The markbook and real map read only the real keys.
- Config comes from the saved draft through `prepareSprintPublish`, with one
  group `Practice group` of `practice-s1` and `practice-s2`, class id
  `practice`. Lesson blocks go through `filterBlocksForStudent`.
- `sprint/{id}~practice/clock` holds the practice time. It starts at 9:00 am
  Sydney on the day Understand closes and only moves on `skip`.
- Every phase needs a close time before a practice run starts. If one is
  missing the reply says "Set a close time for every phase first."

Engine change: `sprint.mjs` reads the time, the config, the roster and the
student through an `AsyncLocalStorage` scope (`withSprintScope`). Outside a
scope everything works as now. So a practice run never moves the real
class's clock, and the published lesson is not needed. `setSprintClock`
stays for tests.

Uploads are off in a practice run: the upload box says "Uploads are off in a
practice run. Use a link."

`nextChange(phases, lockRec, now)` in `rules.ts` (generated into
`sprint-rules.mjs`) returns the earliest of: a phase close, a class part's
lesson end time not yet ended, the lock lifting. Labels: "Understand closing
(Mon 3:00 pm)", "Understand lesson ending (Mon 12:30 pm)", "Lock lifting
(Mon 2:30 pm)".

### Teacher screen

A "Try it as a student" button sits beside the sprint tabs. It saves the
draft, then opens the practice screen over the lesson page:

1. Control bar: "Practice time: Mon 26 Oct, 1:10 pm", "Skip to: …", "Start
   over", "Exit".
2. The Gantt with the practice now line.
3. "Your move" card, from `yourMove(summary, lesson, now)`: End class part
   (a class phase is open and not ended), Choose the question or idea
   (awaiting), Run the pitch and the feedback round (Test open). Each says
   what to do and when you'd do it in a real lesson, and holds the button.
4. Student 1 | Student 2: `mountSprintPlayer` with a practice `SprintClient`.
   At 390px they become two tabs.
5. The progress map (`mountSprintMap`) with a practice `SprintTeacherApi`.

"Fill with sample answers" is a `PhaseForm` option: in a practice run each
phase form shows the button, which fills its fields with short sample text
built from the challenge's criteria and requirements.

## Out of scope

Dragging bars. Uploads in practice. More than 2 pretend students.

## Testing

Unit: `phaseSpans` (opens chain, problems, lock), `nextChange`, `yourMove`.
Server: practice keys never touch real keys; the practice clock leaves the
real sprint's time alone; `skip` and `reset`; missing close time. Then one
browser walk of a full practice run, Understand to Test, at desktop and
390px, at the end.
