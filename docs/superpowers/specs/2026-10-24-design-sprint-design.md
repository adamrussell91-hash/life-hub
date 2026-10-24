# Design Sprint: design

Date: 24 October 2026
Branch: `claude/design-sprint`
Mockups: `docs/superpowers/specs/design-sprint-screens/`

## Purpose

A Design Sprint gives a group a challenge and walks it from the problem to a
tested prototype in five phases. It borrows the logic of the Google Ventures
sprint: ideas are made alone, choices are made together, judging uses
criteria rather than opinion, and the prototype is tested on a real
audience.

In class the sprint is **blended**. Phases switch between class (together)
and home (alone), so every student brings their own thinking before the
group meets. It has to work for any subject, from Year 7 History through
Year 12 English Advanced. The engine stays the same; the subject sits in
three things the teacher writes: the **challenge**, the **criteria** and the
**prototype format**.

Today `design_sprint` is a label only
(`apps/teaching/src/curriculum/pedagogical-mode.ts`). This build makes it a
lesson type that changes behaviour, as Quiz, Lecture and Tutorial already do.

## Adam's calls

- Blended: phases alternate between class and home.
- **Deadlines, not lessons.** Each phase has a due date and time with a
  countdown, so a student who was sick can catch up. A phase is not tied to a
  lesson.
- **Groups are set for each sprint**, separate from tutorial groups. Students
  are placed by their claimed initials.
- **Everyone submits at every phase**, so nobody can freeload. The class
  phases include an individual submission too.
- **Votes are anonymous and stay anonymous.** Students never find out whose
  idea won. Knowing the author adds nothing to the learning.
- **Who decides is a setting:** *top vote goes through* (for example Year 12
  Advanced), or *teacher confirms* (younger classes, so the group doesn't
  pick the silliest idea).
- **No student slide builder.** The prototype is something students make
  themselves and upload (a file or a link). The pitch happens live in class,
  about 2 minutes per group.
- During each pitch the teacher **opens feedback to the rest of the class**,
  and the presenting group gets it.
- **Only the Prototype and the Reflection are marked.** The other phases are
  recorded as in, late or not in.
- **The teacher writes the criteria.** No AI anywhere in the sprint.
- **Class lock.** When the class part of a phase ends, the sprint locks for
  that class for **2 hours** (the default). Students can't keep working on
  the class part after the bell, and can't start the home part straight
  away.
- **3 ideas per person** (the default) in every round that generates ideas.
- **Guides to what a good idea looks like**, with enough scaffolding and
  rigour that the sprint is supportive, challenging and useful for learning.
  See section 3.

## Out of scope

- Student slide or presentation building.
- AI drafting of criteria, challenges or feedback. The sprint makes no AI
  calls.
- Voting across groups. Each group votes only on its own ideas.
- Revealing authors to students, at any point.
- Automatic grouping.
- Live sockets. Boards poll, as Tutorial does.

## 1. The five phases

| # | Phase | Where | Each student submits | The group gets |
|---|---|---|---|---|
| 1 | **Understand** | Class | Their own working-out of the problem (Spot, Audience, Dig, Say it, Limits; see 1a), then a star on one of the group's problem statements | The group brief: the problem (the top-starred statement), one agreed audience, the combined limits and the expert's answers |
| 2 | **Sketch** | Home | **3** idea cards (section 3). Each has a title, the idea, how it answers the group question, the evidence it uses, and an optional picture or file. Students then mark one card as their strongest and say why. | The group's gallery of ideas |
| 3 | **Decide** | Class | A vote on each criterion in the anonymous gallery, each with a one-line reason, then a claim on one prototype part | The chosen idea, the parts list and who builds each part |
| 4 | **Prototype** | Home | Their own part (file, link or text). One member also uploads the group's pitch file. **Marked.** | The prototype and pitch file |
| 5 | **Test** | Class, then home | In class: feedback on every other group's pitch. At home: a reflection on the feedback their group received. **Reflection marked.** | Feedback from the class |

"Where" is the default. The teacher can change it, and a student who missed a
class phase can do their part from home before the deadline.

Phase 1 runs the same route as phase 3 on a small scale: notes are posted
anonymously, students star one, and the decider setting applies. This gives
the class a practice round of the voting before the big decision.

### 1a. Understand (Adam's call, 24 Oct)

Understand is about working out the problem before designing anything:
analyse the brief, find the audience, find the real problem, say it in
your own words, sort the limits, find the gaps, and ask the expert. The
Kit's **Understand** card picks the steps and shows them as **slides** (one
at a time) or **down the page**. Every step can be left out.

| Step | Where | What students do |
|---|---|---|
| Spot | Alone | Tap the words in the brief that stand out |
| Audience | Alone | Who it is for, and why it matters to them |
| Dig | Alone | The surface problem, then "why is that a problem?", up to 5 times |
| Say it | Alone | The problem in their own words (*[Who] needs ___ because ___*) |
| Limits | Alone | Cards in a 2×2: can / can't control × known / unknown |
| Vote | Group | Everyone's statements, no names; star one. The top star (or the teacher, as the decider setting says) sets the group's problem |
| One audience | Group | Everyone's audiences stacked with counts; any member saves the agreed one |
| Our limits | Group | Everyone's cards in one grid, repeats stacked |
| Ask | Group | Questions from the unknowns (the group can add or reword); star up to 3 and send |
| Expert | Group | The teacher answers from the group's board; answers show here |

The submission is the student's own steps plus their star. The group
steps are shared writes any member makes. Sketch and Decide open with the
group brief (problem, audience, expert answers). Understand is recorded as
in, late or not in, never marked.

### 1b. Sketch (Adam's call, 24 Oct)

Alone, at home. Students go wide, then narrow: the group brief at the top,
then **Inspiration** (up to 3 examples and what they'd borrow), **Rapid
ideas** (one line each; the Kit's timer, 8 minutes by default, starts when
the student presses Start and locks the box when it runs out; 0 means no
timer), **Pick** (star their best; the Kit's "each puts forward" number, 2
by default), then **Develop and justify** each starred idea on a card.
Only the cards go to the group's Decide gallery, without names. The
inspiration and rapid ideas stay private.

### 1c. Decide (Adam's call, 24 Oct)

In class. Students read every set (no names), placing **stand-out dots**
(the Kit's number, 3 by default, 0 for none) on the parts of any idea that
stand out: the idea, how it solves the problem, or the evidence, each with
an optional "borrow this because" note. They give each criterion to one
idea with a reason. Dots stay hidden until voting closes; then everyone
sees where they landed, and the most-dotted parts of ideas not chosen show
as **Worth borrowing**, each one tap from becoming a part. Once the idea is
chosen, the group writes the parts and **gives each part to someone by
their initials** (one person a part, two when there are more people than
parts; one part each). Decide is done when every part has someone and
everyone has a part. No discussion step: the reasons do that work.

### 1d. Prototype (Adam's call, 24 Oct)

At home. Each student builds and uploads their own part, as before. In
Decide the group also picks one **assembler** by initials (they still do
their own part). In Prototype everyone in the group sees **Your group's
parts**: each part, who is doing it, whether it is in, and what they have
written, linked or uploaded so far. The assembler puts the parts together
and uploads the finished prototype (or its link); only they can set it, and
it is what the group shows at the pitch. Assembling is not marked: the
finished prototype is judged by the class in Test's peer feedback.

### Phase content

Each phase has a short teacher instruction and may hold normal blocks above
the submission box (for example a source pack in Understand, or the existing
brainstorm or mind map tools in Sketch). The **challenge brief** is a block
area at the top of the sprint and stays visible in every phase.

### Opening and closing

- A phase opens for a group **when the previous phase's deadline passes, or
  when everyone in the group has submitted it, whichever comes first.**
- A student can submit late. The map marks it as late.
- **Sketch:** a sketch submitted before the group's Decide gallery locks
  joins the gallery. After that, it is recorded but not voted on.
- **Decide** locks when everyone in the group has voted or the deadline
  passes. Then the decider rule runs.
- The teacher can **extend** a deadline for the whole class, one group or one
  student.
- **Ideas per person:** 3 by default for Understand and Sketch. The teacher
  can set 1–5 for each round. With 3 each, a group of 4 has 12 ideas in its
  gallery. The gallery groups each student's three ideas together without a
  name ("Set 1, Set 2…"), and each student's chosen strongest idea comes first
  in their set.

### Class lock

Students will try to keep working on the class part after the lesson, or
start the home part early. The class lock stops both.

- On the progress map, the teacher presses **End class part** for a class
  phase. If the teacher sets a lesson end time for that phase, it ends on its
  own at that time.
- Ending does three things for that class:
  1. **It freezes the class part.** Work done in class (notes, stars,
     votes and reasons, part claims, feedback) can no longer be changed.
     Anything not submitted is saved as a draft and submitted automatically.
  2. **It locks the whole sprint for 2 hours.** Students see "Your class
     work is in. The sprint opens again at 3:40 pm" with a countdown.
     Nothing can be opened or edited, including the next phase.
  3. **The next phase opens when the lock lifts** (or later, if its own
     opening time is later).
- The lock length is a sprint setting: 2 hours by default, 0–24 hours. 0
  means no lock.
- **Absent students:** a student who never opened the phase during class
  counts as absent. Once the lock lifts, they can do their class part from
  home until the phase deadline. A student who did open it in class can't
  add to their class work later.
- The teacher can **unlock one student** (for example, a student who left
  early for a reason) from their dot on the map.
- Home phases don't lock. Their deadline closes them as normal.

## 2. Criteria: one list, used three times

The teacher writes the criteria once for each sprint (2–5 short lines, for
example "Uses sources to explain why it matters"). Each criterion can be
linked to an outcome reached by the lesson's dot points (the same menu the
lesson syllabus card uses, `dotPointOutcomes` in
`apps/teaching/src/evidence/syllabus.ts`).

The same list is used three times:

1. **Decide:** students vote on each criterion ("Which idea best uses
   sources?").
2. **Test:** the class gives feedback on each pitch against each criterion.
3. **Marking:** the teacher marks the Prototype against each criterion.

The Reflection has its own short criteria list, by default one line:
"Explains what the test showed and what to change next." The teacher can
edit it and link it to outcomes.

Phases 1–3 and the class part of 5 carry **no marks**. They show up in the
markbook only as in, late or not in.

## 3. Guidance, scaffolding and rigour

A sprint can turn into a fun activity with little learning in it. Three
supports in every phase stop that:

- **A model:** what good looks like.
- **A frame:** a structure to build into.
- **A check:** testing your own work against the criteria before you submit.

Each phase also has a **stretch** for students who finish the class part
early, since the class lock means they can't take it home.

### Support level

This is a sprint setting that changes how much scaffolding students see by
default. Students can always open what is folded away.

| Level | For | Frames and starters | Model | Decider default |
|---|---|---|---|---|
| **Guided** | Years 7–8 | On, inline | Open beside the work | Teacher confirms |
| **Standard** | Years 9–10 | On, folded under "Show starters" | Open | Teacher confirms |
| **Open** | Years 11–12 | Off ("Show starters" if wanted) | Folded | Top vote |

### What a good idea looks like: the idea guide

The idea guide is shown in Sketch and again in Decide. It has two parts.

**1. The good idea checklist.** The sprint ships with a default the teacher
can edit. It uses can-do wording:

1. It answers our group question.
2. It meets the criteria. (This line expands into the sprint's own criteria.)
3. It uses evidence from what we've studied, and names the source, text or
   quote.
4. Our group could build it before the deadline.
5. It does something of its own, rather than repeating the model.

**2. A model idea.** The teacher writes one worked example, **on a different
topic from the challenge** so it can be followed but not copied. Each part is
labelled with the checklist point it meets. The teacher can add a second,
**developing → strong** pair, where the note says what the strong version
does ("names the source and says what it shows").

The editor tells the teacher to choose a different topic, and opens with a
filled-in example to edit, so nothing starts blank.

### The sprint kit: criteria, requirements, guides

Everything the teacher sets up at the start lives in one **Kit** step of the
sprint editor. It then flows into the phases where it is needed, so it is
written once and used throughout:

| Kit item | What it is | Where students meet it |
|---|---|---|
| **Criteria** (section 2) | Quality, judged on Starting · Showing · Strong | Idea cards, votes, Prototype self-check, pitch feedback, marking |
| **Requirements** | Must-haves, yes or no ("Uses at least two sources", "Under 150 words", "Includes one quote"). 0–6 lines. | A checklist on idea cards (Sketch) and on the Prototype. The student ticks each one and says where it is. Requirements can't be ticked without a "where". |
| **Guides** | What helps students think: the idea guide, Thinking Toolkit items, resources (blocks), the exemplar | A **Guides** panel beside the work, showing only the guides attached to the current phase. On a phone it folds into a **Guides** button above the work that opens a sheet. |

Each requirement and guide is attached to one or more phases. A new sprint
comes with sensible defaults attached, so the teacher edits rather than
builds.

### Thinking Toolkit guides

The Thinking Toolkit blocks (`apps/teaching/src/toolkit/`) are the critical
thinking framework the class already knows: 16 skills, 12 tools with
sentence frames, 9 values with check questions, Thinking moves, the Question
Quadrant, Features of a Concept and the Thinking reflection. The sprint uses
them as phase guides. **No new thinking content is written for the sprint;
it reuses the library.**

**Adam's call (24 Oct):** each phase starts empty, and the teacher builds
the phase page. Nothing is added to a phase automatically. A teacher who
wants a Thinking move adds one from the toolkit; the table below is the
suggested move for each phase, not a default:

| Phase | Suggested Thinking move | Other suggested guides |
|---|---|---|
| **Understand** | Examining using questions, judged for **relevance** (`skill:examine`, `tool:question`) | Question Quadrant, for sorting the group's questions |
| **Sketch** | Applying with suggestions and examples, judged for **breadth** (`skill:apply`, `tool:suggestion`, `tool:example`). Breadth suits three different ideas. | The idea guide. Analogy (`tool:analogy`) as an optional stretch. |
| **Decide** | Formulating and applying criteria, justified with reasons, judged for **relevance** (the `apply-criteria` preset plus `tool:reasons`) | The idea guide |
| **Prototype** | Justifying using reasons and examples, judged for **accuracy** (`skill:justify`, `tool:reasons`, `tool:example`) | Exemplar, if uploaded. Features of a Concept when the challenge turns on a concept. |
| **Test (feedback)** | Evaluating with reasons and suggestions, judged for **clarity** (`skill:evaluate`, `tool:reasons`, `tool:suggestion`) | (none) |
| **Test (reflection)** | Thinking reflection, with `tool:implication` ("What this means for our next version"), judged for **significance** | (none) |

How the guide reaches the work:

- **Frames come from the tools.** When a phase's move includes a tool, that
  tool's sentence frame is offered in the submission box under "Use a
  frame" (for example the Reasons frame in vote reasons). The sprint's own
  frames below are the fallback.
- **The value check is the last step before submitting.** The move's value
  check question and hint appear in the check ("Is each idea relevant to our
  question?"), beside the criteria and requirements.
- **Thinking intentions** at the top of each phase are built from its move
  ("We will think by applying criteria, using reasons, judged for
  relevance"), so students hear the same language in every phase. A phase
  with no move shows no intention line.
- Guides are normal toolkit blocks in the phase's section of the lesson body,
  so teacher notes and My notes are stripped for students exactly as now
  (`filterBlocksForStudent`).

### Each phase

| Phase | Model | Frame | Check before submitting | Stretch (class) |
|---|---|---|---|---|
| **Understand** | The challenge brief | The steps in 1a, with the Say it frame *[Who] needs ___ because ___* | One nudge per step that is on (for example "Say it: write the problem in your own words, in a full sentence") | (none) |
| **Sketch** | The idea guide | Idea card: *Our idea is… / It answers our question because… / The evidence it uses is…* and an optional picture | Each idea is linked to at least one criterion, with the line that shows it. The three ideas differ in who they're for, their form or their evidence. One is marked strongest, with a reason. | (Home phase, none) |
| **Decide** | The idea guide again | Vote reason: *It does this best because…*. Parts list: part, what it must show, which criterion it serves. | Votes open once every set of ideas has been opened. Every part links to a criterion. | Write the pitch's first line |
| **Prototype** | The teacher may upload an exemplar (their own, or an anonymous one from a past class) | The part brief from Decide sits at the top of the student's page | Self-check: Starting · Showing · Strong on each criterion their part serves, with one line of evidence. The teacher sees it beside their own mark. | (Home phase, none) |
| **Test** | Feedback frames | *It works because… / Try…*. Each comment names the criterion it's about. | Reflection quotes one piece of feedback received and names one change, linked to a criterion | Feedback on one more group, or a second "Try…" |

### Rigour guards

- Reason and evidence fields need a full sentence, not one word. The check
  is short and kind: "Add a little more: say what it shows."
- Votes need reasons, so the voting is evaluation and not popularity.
- **Spotlight:** during a class phase, the teacher can put one anonymous
  submission up in Focus view as a live model ("Look at how this one names
  its source"), as Tutorial's Show to group does.
- The Prototype self-check against the teacher's mark shows whether students
  judge their own work accurately. A large gap appears on the marking panel
  for the teacher to talk through.
- All student-facing wording says what students do and can do.

## 4. Groups and the decider

- The sprint has its own `groups[]`. Each group has an id, a name the
  students see (for example "Group 3" or a name the teacher picks), and its
  students (claimed initials, as for Quiz and Tutorial).
- A grouping screen lists the class roster. The teacher drags initials into
  groups, or uses **Even groups of N** to place them in order of the roster
  and then adjusts.
- Students see their own group's name and the initials of their teammates.
  For each phase they see a count ("3 of 4 in"), never who is missing.
  The teacher's map shows who.
- **Decider setting:** `top_vote | teacher`.
  - `top_vote`: the idea with the most criterion votes goes through as soon
    as voting locks. A tie goes to the teacher.
  - `teacher`: the group's top idea waits on the teacher's board with the
    vote heat map. The teacher **confirms** it or **picks another** idea from
    the gallery. The group sees "Your teacher is choosing" until then.
- Students only ever see the winning idea and the gallery. They never see
  authors, and they never see vote counts beside other ideas. They see the
  heat map, which shows which ideas did best on which criteria, without
  numbers.

## 5. Prototype parts

After the vote, still in Decide, the group writes a short **parts list**
(2–6 parts, for example "Panel text", "Artefact list", "Opening paragraph").
Each student claims one part. A part can be shared by two students when the
group is bigger than the list. A student who misses the Decide lesson claims
an unclaimed part from home.

In Prototype each student uploads or writes **their part**. One member
uploads the **pitch file**: whatever the group will show during the
2-minute pitch. Any member can replace it until the Prototype deadline.

Uploads accept PDF, images, or a link (Canva, Google Slides, a document).
That covers a PowerPoint saved as PDF and anything made in another tool.

## 6. Test: pitch and feedback

The teacher runs Test from the **Focus view** (`apps/teaching/src/teacher/focus/`):

1. Pick the next group. Focus view shows that group's pitch file and a
   2-minute timer. The timer is a prompt and does not stop the pitch.
2. **Open feedback.** Every student not in the presenting group gets a
   feedback card on their device. For each criterion they pick a level:
   *Starting · Showing · Strong*. Then they write one line on "What worked"
   and one on "One thing to try next".
3. **Close feedback**, then move to the next group.

- Feedback is anonymous to the presenting group. The teacher sees who gave
  it.
- Feedback goes through the hold-and-release moderation used by peer
  feedback (`apps/teaching/src/blocks/peer-feedback.ts`). Flagged feedback is
  held until the teacher releases it.
- Each student's "feedback given" counts as their class submission for
  Test.
- A presenting group sees its feedback when the teacher releases the round:
  levels as a small summary for each criterion, and the written lines as a
  list.

**Reflection (home).** Each student reads their group's feedback and answers
two prompts, editable by the teacher:

- "What did the feedback show your idea does well?"
- "What would you change next, and why?"

## 7. Teacher views

### Progress map

The sprint's teacher page opens on the **progress map**:

- Columns are the five phases. Each header shows the phase, where it
  happens and its countdown.
- Rows are the groups. Each cell holds one dot per student: filled = in,
  outlined = started, empty = not in, a small clock = late.
- A cell turns into a badge when the group is waiting on the teacher:
  "Choose idea" (decider), "Tie".
- Clicking a cell opens the **group board** at that phase: the notes, the
  gallery (authors visible to the teacher), the heat map, the parts and who
  claimed them, the uploads.
- During a class phase, the phase header has **End class part** and shows
  the lock length ("Locks for 2 h"). After that it shows "Locked until 3:40
  pm".
- Clicking one student's dot opens what they submitted. For Prototype and
  Reflection it opens the **marking panel**.

On a phone (390px) the map turns sideways: one group per card, with the five
phases as a row of small cells. A group card opens the board.

### Marking panel

For the selected student's part (Prototype) or reflection, the teacher sees
the group's pitch file beside it. They pick a level for each criterion
(*Starting · Showing · Strong*) and can add a comment. **Next student** moves
through the group.

## 8. Student view

A student opens the published sprint and claims their initials, as for
quizzes. They see:

- **The countdown** (the assessment `countdown` look) for the current phase,
  with the pitch date below it.
- **The phase stepper** (Understand → Test), with the current phase
  highlighted and the class or home badge.
- The challenge brief, which folds away.
- The current phase: the teacher's instruction, any blocks, and their
  submission box. Once they submit: "In. You can change it until [deadline]."
  For a class phase, it says "until your teacher ends the class part".
- **The lock screen** while the class lock runs: "Your class work is in.
  The sprint opens again at 3:40 pm", a countdown, and a read-only view of
  what they submitted.
- **Their group's status line:** group name, teammates' initials, "3 of 4
  in".

All student-facing text says what students do and can do ("Pick the idea
that best uses sources") and never uses deficit phrasing.

## 9. Data, markbook, map

Storage follows the tutorial's pattern (`netlify/functions/_shared/tutorial.mjs`,
`published-tutorial.mjs`, `tutorial-groups.mjs`). The plan sets the exact
keys. Nothing personal goes in the public repo, fixtures or tests (invented
names only).

- **Lesson:** `pedagogical_mode: 'design_sprint'` and a `sprint` settings
  object (`apps/teaching/src/sprint/schema.ts`):
  `class_id`, `decider`, `support_level` (`guided | standard | open`),
  `lock_hours` (default 2), `criteria[] {id, text, outcome?}`,
  `reflection_criteria[]`, `requirements[] {id, text, phases[]}`,
  `idea_guide {checklist[], model {topic, parts[]
  {text, meets}}, pair? {developing, strong, note}}`, `phases[5] {key,
  where, due_date, due_time, ends_at?, instruction, ideas_per_person?,
  model_text?, stretch?}`, `groups[] {id, name, students[]}`. Guides
  (toolkit blocks, resources, the idea guide) live in the lesson body under
  one section marker per phase, as tutorial groups do; a new sprint is
  seeded with one empty section per phase, and a missing one is put back
  empty.
- **Class lock record** (one per sprint per class): `{ phase, ended_at,
  locked_until, present[] }`, plus single-student unlocks. The server
  checks it on every student read and write; the client only shows it.
- **Group record** (one per group): phase opened times, the group question,
  the chosen idea, `awaiting_teacher`, the parts list and claims, and the
  pitch file.
- **Student submission** (one per student per phase), overwritten in place:
  `{ phase, payload, submitted_at, late, frozen }`. Sketch payloads hold the
  idea cards, criterion links, the strongest pick and its reason. Prototype
  payloads hold the self-check. Votes are stored in their own
  record per student and only read on the server to make the heat map. The
  student API never returns authors or raw counts.
- **Feedback round** (one per presenting group): opened and closed times,
  entries `{ from, levels{criterion: 1|2|3}, worked, next, status }` and
  moderation status.
- **Marks:** one per student for Prototype and one for Reflection,
  `{ levels{criterion: 1|2|3}, comment, marked_at }`.

### Student uploads (new)

Media upload today is teacher-only (`/api/media/upload` sits behind the
operator gate). The sprint adds a **student upload** path on the published
sprint endpoint:

- Only students who have claimed initials in this sprint's class, and only
  while the Prototype (or Sketch) phase is open for them.
- PDF and images only, up to 10 MB each (reusing `ALLOWED_MEDIA_MIME` minus
  audio), with a few files per student per sprint. Links are stored as text
  and opened in a new tab, never embedded.
- Files are kept apart from the teacher's media library, under the sprint's
  key, and served only to the teacher and to that student's group.
- The endpoint is rate limited like `published-tutorial.mjs`.

### Markbook

- One column per sprint, with two figures in the cell: Prototype and
  Reflection. Hover shows the levels for each criterion.
- Each marked criterion becomes an evidence item for that student, tagged
  with the criterion's linked outcome (`out:{id}`), with score = level and
  max = 3. The evidence layer, Patterns and Next steps pick them up with no
  special handling, as they do for quiz and tutorial evidence.
- Unmarked phases show in the column's detail as in, late or not in.

### Unit map

One dot at the sprint's first phase date, labelled with progress ("Phase 3
of 5").

## 10. Edge cases

- **Absent for a class phase:** they can submit from home until the
  deadline. Their dot is empty until then, and the group carries on at the
  deadline.
- **Absent for the pitch:** they still give feedback on the groups they can
  (rounds can be opened again later by the teacher for one student) and
  write the reflection at home.
- **Group of one:** they still sketch, vote on their one idea (it passes
  automatically), build every part and pitch.
- **Student moved between groups mid-sprint:** their past submissions stay
  with the old group's record. They pick up the new group at its current
  phase and claim an open part.
- **Nobody in a group sketched by the Decide deadline:** the group waits on
  the teacher ("No ideas in") and the teacher extends the deadline.
- **Class lock while a student is mid-typing:** their draft is saved and
  submitted as it stands, and the lock screen says so.
- **Teacher forgets to end the class part and has set no end time:** nothing
  locks, and the phase deadline closes it as normal. The map reminds the
  teacher with "Class part still open".
- **Fewer than 3 ideas by the deadline:** what's in goes to the gallery, and
  the map marks the student "2 of 3".
- **Whole-group absence on pitch day:** the teacher moves that group to the
  end of the running order or to another day; Test closes when every group
  has pitched.

## 11. Testing

- Unit: class lock (freeze, auto-submit drafts, lock window, next phase
  opening at lift, absent catch-up, single-student unlock, server refusal
  while locked), ideas per person, check-before-submit rules (criterion
  link, full-sentence reasons, votes open after every set is opened),
  phase open rule (deadline or all in), late marks, gallery lock,
  vote tally and tie, decider paths, anonymity (the student API returns no
  author or count fields), part claims, upload rules (mime, size, phase,
  claim), feedback moderation, mark → evidence tags.
- Fixture: an invented Year 8 class of 20 in five groups, at different
  phases.
- Walk in preview at desktop and 390px: create → criteria → groups → publish
  → students through each phase (two devices) → decider confirm → uploads →
  Focus view pitch with feedback → reflection → marking → markbook column and
  evidence.
- Not covered by tests: Safari upload from a phone camera roll.

## Phases (commits in one PR)

1. `sprint` schema, editor (challenge, criteria with outcome links, five
   phases with deadlines, decider, support level, lock length), the Kit
   step (criteria, requirements, idea guide, Thinking Toolkit guides seeded
   per phase), grouping screen.
2. Student player: claim, stepper, countdown, Guides panel, Thinking
   intentions, phase submissions with tool frames, requirement ticks and
   value checks, idea cards (3 per person), group status line, phase open
   rule.
3. Class lock: End class part, end time, freeze, lock screen, absent
   catch-up, unlock one student.
4. Anonymous gallery, criterion voting with reasons, heat map, decider (top vote and
   teacher), parts and claims.
5. Student uploads (endpoint, rules, storage), the pitch file, Prototype
   self-check.
6. Teacher progress map, group board, Spotlight.
7. Test: Focus view pitch, feedback rounds with moderation, reflection.
8. Marking panel (with self-check beside it), markbook column, evidence
   tags, unit map dot.
