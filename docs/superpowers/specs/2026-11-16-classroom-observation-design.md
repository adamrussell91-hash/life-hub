# Classroom observation guide and meeting page layout: design

16 November 2026. Professional hub, meeting page. Mockup: `docs/mockups/classroom-observation/set.html`.

## Why

Adam supervises teachers working toward Proficient Teacher accreditation. NESA requires a written observation report done in three phases (Planning, Observing, Reflecting) within two weeks. Its June 2026 template is a Word table. Adam wants the same content run from his meeting pages: plan with the teacher, log what he sees during the lesson with quick keys, then have the reflection drafted from the evidence and exported as the report.

These guides are wide, so the meeting page layout changes at the same time.

## Decisions (Adam, 16 Nov)

- **A third guide button** beside Run a guide and Coaching sheet: "◉ Classroom observation". It opens a shelf of observation types. Proficient Teacher (NESA) is the only live one; Maintenance, Highly Accomplished / Lead and Informal walkthrough show as "Later".
- **Three phases, three meetings.** Each phase runs in its own meeting, on its own day. The meetings link to one observation.
- **Follow the template's content exactly.** Every NESA question and field is there, with its wording. How the fields are laid out and filled in is ours.
- **Adam is the Accreditation Supervisor.** He types everything, including the teacher's answers in Planning and the teacher's reflection, during the meetings. There is no teacher link and no outside writing.
- **Export is a print page.** "Export NESA report" opens a page laid out as the four template pages; Adam saves it as a PDF from the browser's print dialog. No server-built PDF.
- **One observation record**, shared by the three meetings. Each meeting holds a link to it and the phase it is for.
- **The decision is human.** The tally suggests Observed / Partially observed / Not observed; Adam sets it.
- **Phase names are NESA's**: Planning, Observing, Reflecting. They are kept apart from the meeting page's own Before / During / After switch.

## Meeting page layout

Applies to every meeting, not just observations.

- **Right column: unchanged.** The room, task links (preparation, follow-up), tags.
- **Left column:** Minutes, Actions, Who said what. In Before it also holds Clare's brief and open promises; in After, Did you get what you came for and Wrap-up. Order per phase:
  - Before: brief, open promises, Minutes.
  - During: live strip, Minutes, Actions, Who said what.
  - After: Minutes, purpose check (when there is a purpose), Wrap-up, Actions, Who said what.
- **Full width, under both columns: Notes.** The guide buttons (Run a guide, Coaching sheet, Classroom observation) move into the Notes header. Guides stop being their own card. Under the notes, a "Guides in this meeting" divider holds check-ins, coaching sheets, guide runs (as a grid of cards) and the observation workspace.
- **Before** keeps its "Agenda and notes" heading and hint; Notes now shows in Before with the guides under it.
- **Below 900px** it stacks: left column, right column, Notes.
- The notes annotation workspace may now use its side-by-side layout, since Notes is full width. The CSS rule that forced it to one column applies only below 900px.

## The observation record

Stored in its own Netlify Blobs store, `professional-observations`, through `/api/observations` (teacher only, `no-store`): get one, list (by person, or open ones), save, delete. Not sealed: it holds professional observation notes, not wellbeing content.

```
Observation {
  id, kind: 'nesa_proficient', status: 'open' | 'done',
  teacher: { person_ref, name, nesa_number, email, school },
  supervisor: { name, nesa_number },
  planned_on,                         // date of the Planning meeting; starts the two-week clock
  meetings: { planning?, observing?, reflecting? },   // meeting ids
  lesson: { lesson_id?, title, syllabus_link },        // whole-lesson answers
  plan_all_students, plan_measure,
  descriptors: [ {                    // 2 to 4, in the order picked
    code,                             // e.g. '3.5.2'
    why, practice, demonstrate, planned_impact, how_know,
    look_fors: [ { id, label, key } ]
  } ],
  log: [ { id, at, clock, descriptor?, look_for?, kind: 'strength'|'next'|'ask'|'said'|'transition', text } ],
  write_up: { [code]: { practice, strengths, decision: 'observed'|'partial'|'not'|null, comments } },
  reflection: { [code]: { teacher, feedback } },
  signatures: { teacher: { name, date }, supervisor: { name, date } },
  updated_at
}
```

- The meeting record gains `observation: { id, phase }`. It is a link only; the content lives in the observation store. Meeting readers (Clare, briefs, search, sync) see that an observation is linked, not its notes.
- Teacher name, email and school prefill from the People profile of the person picked. The NESA number is typed once and saved to that profile. All of this is runtime data in the private store, never in code, tests or fixtures.
- The Proficient Standard Descriptors (codes, short labels, full text for all 37) live in code as a constant. They are public AITSL/NESA text.

## Flow

### Start

Classroom observation → shelf → Proficient Teacher → "Who is being observed?" (people in the room first) → "Which part is this meeting?" (Planning, Observing, Reflecting).

- **Planning** with no open observation for that person makes a new one, `planned_on` = the meeting date.
- **Observing or Reflecting** looks for open observations for that person and offers them ("Open observation · name · started 16 Nov"). Picking one links it. If there is none, it offers to start one here (Planning fields then fill in at the top).
- **Book the next part.** A date field and "Make linked meeting" create the next meeting with the same people and tags, already linked and set to the next phase. Linking an existing meeting works the same way from that meeting.
- A meeting links to at most one observation.

### Series strip

At the top of the workspace in every phase: Planning · Observing · Reflecting, each with its date or "Not booked", done ones ticked, this one highlighted, each a link to its meeting. Under it: "Planning to reflecting within two weeks: day N of 14" (amber from day 12, rose past 14). Nothing blocks after 14 days.

### Planning (Phase 1)

- **Details**: teacher (name, NESA number, email, school), supervisor (name, NESA number).
- **Descriptor picker**: all seven standards, folded by standard; 6 and 7 folded by default; descriptors that are hard to see in one lesson faded but pickable. Two to four can be picked; a fifth is refused with a line saying why.
- **Per descriptor**, under the template's three column heads: Standard Descriptors (why this one, what practice it describes), Teaching and learning strategies (what will you do to show it), Impact of practice (planned impact, how will you know).
- **Look-fors** per descriptor: short observable behaviours, added, renamed and reordered here. Each gets a key (row Q W E for the first descriptor, A S D for the second, Z X C for the third, R T Y for the fourth).
- **Whole lesson**: lesson observed (link to a Teaching lesson, or free text), syllabus link (prefilled from the linked lesson's Syllabus card, editable), planning for all students, assessment / feedback / measurement.

Every template question appears with its wording as the field label or hint. Export puts the per-descriptor and whole-lesson answers back into NESA's three columns.

### Observing (Phase 2)

- **Lesson clock**: Start, Pause, End lesson. Log lines carry the clock time.
- **Quick-key dock**: descriptor keys (1–4), look-for keys for the chosen descriptor, kind keys (+ strength, > next step, ? ask about, " student said), ⏱ transition, a note box, Log. Keyboard: numbers pick the descriptor, letters the look-for, + > ? " the kind, Enter focuses the note box and Enter again logs. Keys are ignored while typing in a field. "Student said" lines carry no descriptor unless one is chosen.
- **Log**: newest first, each line editable and deletable. Saves after each line, so a closed tab loses nothing.
- **Against each descriptor**: count of strengths and next steps, a bar, look-fors seen (×n) and not yet seen (struck through), and the Observed / Partially / Not control. A suggestion is shown (next steps logged → Partially, none → Observed, nothing logged → none); Adam's choice replaces it.
- **Planned impact** from Planning, shown for reference.
- **Write-up** (the Phase 2 table): one row per descriptor with Teaching practice, Observation strengths, Record of decision + Other comments, each with the template's prompts as headings. Teaching practice and Strengths start gathered from that descriptor's log lines (plain gathering, no AI). "Gather from log again" refills only untouched cells; edited cells are kept. "Clare tidies the wording" is optional, per row, and shows its A$ cost before running.

### Reflecting (Phase 3)

- One row per descriptor: **From the observation** (decision pill, strengths and next steps, link to its log lines), **Teacher's reflection** (the template's two prompts, typed by Adam with the teacher), **Supervisor's feedback**.
- Feedback is drafted from the write-up: strengths for Observed; strengths plus a "to develop" line from next steps for Partially and Not observed. Plain text assembly, no AI; the optional Clare tidy is available here too.
- **Signatures**: typed name and date for teacher and supervisor.
- **Export NESA report** opens the print page. **Mark observation done** sets `status: 'done'`, which stops it being offered to new meetings.

### Export page

A print-styled page: page 1 details and the template's phase descriptions; page 2 Planning in three columns; page 3 Observing table; page 4 Reflecting table and signatures. A4 landscape for pages 2–4 as in the template. It reads only the observation record. Empty fields print as blank cells, not placeholders.

## Phone (390px)

The dock sticks to the bottom of the screen with short key labels; the log scrolls above; tally and write-up follow. Planning and Reflecting rows stack their columns.

## Out of scope

Other observation types, teacher-facing links, a built PDF, AI-written observations, sending anything to NESA.

## Tests

- Layout: each phase puts the right cards in the left column, Notes full width under the grid, guide buttons in the Notes header; nothing left in a separate Guides card.
- Store: save/get/list/delete round trip; list by person and open; meeting link written on start and on "Make linked meeting".
- Planning: 2–4 descriptor limit; look-for keys assigned per descriptor row; syllabus prefill from a linked lesson.
- Observing: keyboard and click logging produce the right tags and clock time; keys ignored inside fields; tally counts and suggestion; gather fills untouched cells only.
- Reflecting: feedback drafts follow the decision; export page shows every template field once, in the right table.
- Privacy guard: fixtures use invented people only.
