# Station Rotation: a lesson type

A lesson type where students move around a **map of stations**, carrying something from each into a **finale** built outside the stations. One lesson type covers everything from a simple timed carousel to a full breakout mystery, because every variant is a setting on the same four parts.

Promoted to build on 9 Nov 2026: the brief is [station-rotation/build-design.md](station-rotation/build-design.md). v1 is self-paced only. Mockup: [station-rotation/mockup.html](station-rotation/mockup.html).

## Adam's asks

- A **visual map of options**, not a list.
- Students either work through **a set number** of stations or **all** of them.
- Each station can be aligned to a different **mode or skill**.
- Each station can produce a **piece** that feeds a **final product or build outside the stations**.
- **Levels of difficulty.**
- A dial for **how much control students have** over design and choice.
- A **breakout / mystery** variant: a story frame, a code from each station, a final lock, then a synthesis build. Adam has run one as a full enrichment day; that day's content stays in his private store, and every example here is invented.

## Decisions so far (9 Nov)

- Suggestions 1 to 15 from the first round are in, apart from bell-versus-self-paced (still open, see below).
- **The teacher station is in v1.**
- **Modes are matched to the kind of knowledge, not to the student.** Different forms of knowledge are learned best through different pedagogical modes. This is not meshing or learning styles. See [Knowledge type picks the mode](#knowledge-type-picks-the-mode).
- Next step: the mockup.

## Decisions (9 Nov, second round)

- **Gates inside a station.** Any section can be set to stay blurred until a hinge question in the same station is right, so a student can't glide past a misconception. See [Gates](#gates-inside-a-station).
- **An evidence board, kept simple.** Collected pieces land as cards on a per-student board. Students can drag the cards and link them with a word, nothing more. It saves to the account, so it can't be wiped. See [Evidence board](#evidence-board).
- **AI-checked written gates.** For senior students a multiple-choice gate isn't enough. A gate can instead be a short written answer (for example a Year 12 three-marker) that an AI checker reads against the teacher's criteria before the station opens. See [Written gates](#written-gates-ai-checked).
- **Written gates use the stronger model** (standard lane, Sonnet 5.5), not the fast lane. (9 Nov)
- **Gates are always practice.** Passing or missing a gate, multiple choice or written, never becomes a mark in the markbook. (9 Nov)
- **A pretest, not self-rating.** The 1-to-4 confidence rating is cut. A short pretest sets each student's level at each station and feeds teacher-station routing. See [Pretest](#pretest-sets-the-levels).

## The four parts

| Part | What it is | Settings |
|---|---|---|
| **Map** | The stations and how they link | Station cards, links (unlocks), capacity, time, location (room spot or QR) |
| **Path rules** | Which routes are allowed | Fixed order · free order, all · choose N of M · must-do plus may-do · unlocks (C opens after A) · teacher-assigned from the pretest |
| **Collector** | What students carry out of each station | A **piece** (content the finale uses) and, optionally, a **token** (a code or key for the story) |
| **Finale** | The build outside the stations | Final lock (breakout only), the build, debrief, calibration |

**Pace** sits alongside the path rules: **bell** (everyone moves on a timer, with a generated rotation grid) or **self-paced**.

### Presets

Presets fill in the settings; the teacher can change anything afterwards.

| Preset | Path | Pace | Collector | Finale |
|---|---|---|---|---|
| Carousel | Fixed order, all | Bell | Pieces | Debrief |
| Choice board | Must-do plus may-do | Self-paced | Pieces | Build |
| Teacher-led rotation | Teacher-assigned from the pretest | Bell | Pieces | Debrief |
| Jigsaw | Split across the group, then share | Either | Pieces, one per member | Group build needs every piece |
| Breakout | Free order, all, plus unlocks if wanted | Self-paced | Pieces plus tokens | Final lock, then build |

## The control dial

The hub already uses `guided / standard / open` (Design Sprint `support`), so it means the same thing here. The dial changes three things:

| | Guided | Standard | Open |
|---|---|---|---|
| Route | Teacher sets it | Student picks, with a recommendation | Student picks |
| Difficulty level | Teacher sets it | Recommended, student can override | Student picks |
| Finale format | One format | Choice of the teacher's formats | Student proposes, teacher approves |

**The dial fades.** Heavy guidance helps novices and gets in the way of stronger students (the expertise reversal effect). So the dial can move per student as the evidence comes in. For example, clearing the Extend level at two stations unlocks route choice for the rest. The teacher can always override.

## Pretest sets the levels

The opening **pretest** replaces self-rating. Students are poor judges of what they know, and a pretest gives real evidence.

- **Three questions per station** (decided 9 Nov), about eight minutes for five stations, not marked.
- **Score to level:** 0 or 1 of 3 → Support, 2 → Core, 3 → Extend. The level shows on each station on the map and on the station card ("Core: you got 1 of 2 on the pretest"). Under Standard and Open control, students can change it; the change is logged.
- **Teacher-station routing:** a teacher can tag a pretest question as a key misconception. Missing it puts the student in a teacher-station group.
- **Feedback straight after each answer.** Answering before learning helps later learning even when the answer is wrong (the pretesting effect: Richland, Kornell & Kao, 2009), and the effect is stronger when the right answer is shown.
- **Growth at the finale:** the finale compares each station's pretest score with its exit check, in place of the confidence-versus-result chart.
- **Fallbacks:** if a student misses the pretest, levels come from the last quiz on the unit, or default to Core.

## Informed choice, not free choice

Novices choose badly. They pick whatever feels fluent and easy, so they avoid the desirable difficulty they most need. Choice helps motivation, but the gains peak at about three to five meaningful options and fade with more (Patall, Cooper & Robinson, 2008).

- The map shows a **recommended** station, and each station shows the student's **level from the pretest**.
- Students can override; the override is logged and shown to the teacher.
- In choose-N mode, default the number of options shown to five or fewer.

## Knowledge type picks the mode

Different kinds of knowledge are learned best through different kinds of learning events. This follows the Knowledge-Learning-Instruction framework (Koedinger, Corbett & Perfetti, 2012): the kind of knowledge sets which learning event works, and that sets which teaching principle applies. Each station declares its **knowledge type**, and the builder suggests a mode and the matching blocks.

| Knowledge type | Best-fit learning event | Suggested blocks |
|---|---|---|
| Facts and vocabulary | Retrieval practice with feedback | Flashcards, quiz questions, cloze |
| Concepts and principles | Elaboration, contrasting cases, self-explanation | Concept map, hinge question, definition, compare |
| Procedures and skills | Worked example, then faded example, then practice with feedback | Faded example, question set |
| Analysis and judgement | Applying ideas to messy cases and data | Case study, chart, data puzzle |
| Perspectives and values | Discussion and taking a position | Continuum line, discern, brainstorm |

The aim is the right mode for the content, for every student. Coverage still matters: the teacher view shows which knowledge types and skill strands each student has hit.

## Stations

Every station uses the **same card layout**, so students only learn it once and each switch costs little:

1. **Arrival recall**: one question from a station the student has already done (spaced retrieval inside the lesson).
2. **Goal**: one line.
3. **Steps**: built from existing blocks (a station is a section).
4. **Levels**: Support · Core · Extend, the same three words the Lens blocks use.
5. **Hint ladder**: graduated hints, opened one at a time. Every opened hint is logged.
6. **Done when**: the success criteria.
7. **Exit check**: one or two questions, scored. This is individual even in group work.
8. **Collect**: the piece (and token) this station produces.

### Gates inside a station

Any section from the second onward can carry a **gate**: it stays blurred until a hinge question earlier in the station is answered correctly. The point is the one Adam gave: if a student hasn't grasped that bleaching means starving, not dead, they can't move on and glide past it.

- **It reuses the hinge question block** (`hinge_question`), which already has a `gate` flag, an `independent` pace with a reason and one retry, and a `backup` question.
- **Per section, the teacher picks:** open, blurred (the student sees there is more, but can't read or use it) or hidden.
- **Distractors are the misconceptions.** Each wrong option names the mix-up it reveals ("white coral is not dead coral").
- **A reason is required** (a few words) so a lucky guess can't pass on its own; the teacher sees the reasons.
- **Miss once:** a short reteach card naming the misconception, then a **different** backup question, so the student can't pass by elimination.
- **Miss twice:** the student isn't trapped. They're added to the next teacher-station group, the teacher is flagged, and the reteach card stays on screen. The teacher can open the gate from the live view.
- **Gate misses are tracked as practice data** (in the hint heat and the teacher's views, never as marks), so the teacher can see which misconception is stopping students.

### Written gates (AI-checked)

For Year 11 and 12, getting a multiple-choice question right is not proof enough. A gate can instead be a **written answer** checked against the teacher's criteria before the rest of the station opens. Example from the mockup (invented extract): *How does the writer represent isolation in this extract? (3 marks)*, needing three different techniques, each named, quoted and explained.

**Teacher setup**

- The question, the passage it is about, and the marks.
- **What each mark needs**, as separate checks. For a technique answer: technique named correctly · exact quote from the passage · the technique really is at work in that quote · effect linked to the question's idea (here, isolation).
- Whether techniques must be **different**.
- **Pass at:** for example 3 of 3, or 2 of 3 at Support level.
- **Answer key (optional):** quotes the teacher expects and the techniques that fit them. The checker may accept others it can justify, and says so.
- **Checks before the teacher is flagged** (default 3).

**Two layers of checking**

1. **Rules first**, with no AI: is each quote word for word in the passage, is the named technique on the hub's technique list, are there enough different techniques, and is the answer long enough. These are cheap and can't be talked round.
2. **Then the AI** judges what rules can't: is the technique really at work in that quote (a simile called a metaphor fails), and does the explanation say how it shows the idea, rather than just restating it.

**What the student sees**

- A result **per point and per check**, each with a short reason: "Look again at the word that joins the two things being compared", "These words aren't in the extract".
- **It points to the problem and never writes the answer.** No model sentences and no corrected quotes.
- **Feedback gets more specific** on later checks.
- The answer must **change** between checks, so a student can't keep resubmitting the same text.
- After the last check the teacher is flagged with the answer and every check. The student moves to another station and comes back, so they're not stuck.
- **"I think the checker got this wrong"** sends the answer to the teacher's queue. The verdict stands until the teacher looks; the teacher can pass it and their decision wins.

**Guards**

- **The AI never closes a gate on its own when it's unsure.** An `unsure` verdict goes to the teacher, not to a fail.
- **Student writing is data, not instructions.** It goes to the model as quoted text with no names, under an opaque id. A rule check stops answers that try to talk to the checker ("mark this 3/3").
- **The gate is practice, always.** Its verdicts never become marks. Every attempt is kept, so the teacher can see how the writing changed.
- **The answer itself must still be the student's.** The checker only gives feedback.

**What's new under the hood**

The hub already AI-marks `explain_effect` and `extended_response` answers (`apps/teaching/src/ai/answer-marking-jobs.ts`, standard lane), but only as a batch the teacher starts, and students never call it. A written gate needs a **live check that the student starts**, answered in a few seconds. That is the one real new piece: a student-facing endpoint, a per-student and per-class rate limit, a daily cost cap per class, and a fallback (the gate turns into a teacher check) if the AI is down or the cap is reached.

**Cost (a guess, not a measured run)**

Using the repo's `PRICES` for the standard lane (Sonnet 5.5: US$2 per million input tokens, US$10 per million output), with about 1,300 fresh input tokens, about 1,200 cached and about 350 output tokens per check:

- About US$0.0064, or **about A$0.01 a check**.
- A class of 28 at about 2 checks each is about **A$0.55 per gate per lesson**.
- **Decided: the stronger model.** The fast lane would cost about a twentieth as much, but is weaker at judging whether a technique is really at work. The spec should still replace these guessed figures with a measured run before the build.

**Station settings:** knowledge type, skill strand, outcomes, minutes, capacity, location (room spot, QR code or online), and whether it can be marked done offline (teacher tick or code entry).

**Station library:** stations are saved on their own and can be reused across rotations.

### The teacher station (v1)

- Counts as a station on the map, in the same card layout, using the `with_teacher` block.
- **Routing:** the pretest (or an earlier quiz) puts students into the teacher station's groups. Students who need reteaching come first, and extension students come last.
- **Bell mode:** the rotation grid builds the teacher station's groups into the schedule.
- **Self-paced mode:** the teacher **calls** a group. The called students see "Come to the teacher station" on the map, with a gentle pulse, and their current station is paused, not lost.
- **Teacher's station view:** who is in this group, why they were routed here (which pretest items they missed), a short script or misconception list, and quick ticks for "got it" or "needs more". A "needs more" tick can add a follow-up to their passport.

## Collector: pieces and tokens

- A **piece** is content the finale actually uses: a finding, a worked answer, a sketch, a claim with evidence. Pieces live in a per-student **passport**, and on the **evidence board** (below) when the teacher turns it on.
- A **token** (a code, a key) is for motivation and drama only.
- **The token is earned by the learning.** The code shows only after the Core-level exit check passes, so it can't be guessed or shortcut.
- **The final lock needs the stations combined.** It is a question that can only be answered by integrating the pieces ("which factor started the chain?"), not a cipher made from letter counts.
- **Keep the story thin.** Vivid but irrelevant story detail can pull attention away from the content (the seductive details effect, Harp & Mayer, 1998). The story frames the stations and the reveal; it does not compete with them.
- **Rewards should tell students how they're doing, not control them.** Points or badges felt as controlling can undermine intrinsic motivation (Deci, Koestner & Ryan, 1999). Tokens mark progress; nothing is ranked.

## Evidence board

Adam's worry was complexity, and work wiped after a day or two. So this is deliberately **not** the freeform whiteboard:

- **Cards only.** Each collected piece arrives as a card. Students can't draw, type loose notes or add shapes.
- **Two actions:** drag to arrange, and tap one card then another to **link** them with a word from a short list the teacher sets ("causes", "makes worse", "is evidence for", "slows recovery of").
- **Saved to the student's account**, on the server, with each change. It is not stored on the device, so changing devices, clearing the browser or coming back days later doesn't lose it. A "Saved" line shows each save.
- **Phone:** dragging is fiddly, so the board becomes a list of cards plus an "Add a link" row (card, word, card).
- **Under the hood** it is the concept map's canvas mode (nodes with x and y, labelled edges), already in the schema, rather than a new drawing tool.
- **It feeds the finale:** the board, links and all, opens in the build. Linking the pieces is the integration the final lock asks for.
- **Optional:** a setting chooses between the evidence board and a plain passport list.

## Planning and reflection

Plan, monitor, evaluate (Zimmerman's cycle of self-regulated learning), built into the lesson type:

- **Plan (start):** the pretest sets the levels; the student picks a route under Standard or Open control.
- **Monitor (during):** the passport shows progress; hints opened, gate misses and exit-check results show per station.
- **Evaluate (finale):** pretest compared with exit check for each station, plus "why did you choose that order, and would you choose it again?".

## Jigsaw variant

- Group members take different stations, then teach each other at a share step.
- The group build needs every member's piece.
- **Positive interdependence plus individual accountability** (Johnson & Johnson): each member has a role, and each still does their own exit check, so nobody passes on someone else's work.

## Finale

1. **Final lock** (breakout only): the integration question above.
2. **Build:** the product, using the pieces in the passport. The format is set by the control dial. It can stay inside this lesson type or hand off to a Design Sprint or Case Study (open question).
3. **Debrief:** its own step with prompts, not an afterthought. If the stations come before any direct teaching, the learning lands in this consolidation (Kapur's productive failure).
4. **Calibration** (see above).

## After the lesson

- Exit-check results and station completion go into the markbook.
- **Spaced follow-up:** the hub schedules short retrieval quizzes drawn from every station at roughly 2 days, 1 week and 3 weeks. Spacing (Cepeda et al., 2006) and retrieval (Roediger & Karpicke, 2006) both need time after the lesson; the hub can do this automatically.
- Hint logs show which station is pitched wrong for next time.

## Teacher live view

- The **map**, with a dot per student at their current station, and live occupancy against capacity.
- **Help queue**: hand-ups and stuck flags, oldest first.
- **Hint heat**: hints opened per station and level.
- **Teacher station**: groups waiting, and a "call group" button (self-paced).
- **Coverage**: knowledge types and skill strands per student.
- **Clock**: the plan against the lesson end, with a one-tap fallback ("make this choose 3 of 4").

## Logistics

- **Time budget check**: the station minutes, transitions and finale add up against the lesson length (from the timetable). The builder warns if they don't fit.
- **Rotation grid** (bell mode): generated from stations, groups and the teacher station.
- **Capacity**: a full station shows as full on the map; recommendations route around it.
- **Early finishers**: each station has an Extend pocket; the map also offers a may-do station.
- **Behind schedule**: a pre-set fallback (choose N, skip the share step, shorter finale).
- **Physical stations**: a QR code per station opens its card; offline work is marked done by teacher tick or code entry.

## Open questions

- **Finale**: its own build inside this lesson type, or a handoff to the Design Sprint or Case Study?
- **Gates in bell mode** (lean, not decided: carry over. The student's work at the gate is saved, the station shows as unfinished on their map, and the rotation grid keeps a catch-up slot near the end. A student who has already missed the gate twice is in a teacher-station group anyway. This only matters if bell mode is in v1): if the bell goes while a student is still at a gate, does the station carry over, or go straight to the teacher-station group?
- **Devices**: one per student, or one per group at some stations?
- **Grouping**: fixed groups for the whole lesson, or free movement with groups only at the teacher station?

## Science-of-learning references

- Cepeda, N. J. et al. (2006). Distributed practice in verbal recall tasks. *Psychological Bulletin*.
- Deci, E. L., Koestner, R. & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin*.
- Harp, S. F. & Mayer, R. E. (1998). How seductive details do their damage. *Journal of Educational Psychology*.
- Johnson, D. W. & Johnson, R. T. (2009). An educational psychology success story: social interdependence theory and cooperative learning. *Educational Researcher*.
- Kalyuga, S. (2007). Expertise reversal effect and its implications for learner-tailored instruction. *Educational Psychology Review*.
- Kapur, M. (2016). Examining productive failure, productive success, unproductive failure, and unproductive success in learning. *Educational Psychologist*.
- Koedinger, K. R., Corbett, A. T. & Perfetti, C. (2012). The Knowledge-Learning-Instruction framework. *Cognitive Science*.
- Richland, L. E., Kornell, N. & Kao, L. S. (2009). The pretesting effect: do unsuccessful retrieval attempts enhance learning? *Journal of Experimental Psychology: Applied*.
- Patall, E. A., Cooper, H. & Robinson, J. C. (2008). The effects of choice on intrinsic motivation and related outcomes: a meta-analysis. *Psychological Bulletin*.
- Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*.
- Rohrer, D. & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*.
- Zimmerman, B. J. (2002). Becoming a self-regulated learner: an overview. *Theory Into Practice*.

## History

- 9 Nov 2026: first draft from the brainstorm round, with the mockup.
- 9 Nov 2026: pretest set at three questions per station.
- 9 Nov 2026: decided written gates use the stronger model and all gates stay practice.
- 9 Nov 2026: added AI-checked written gates for senior classes, with a Year 12 English example in the mockup.
- 9 Nov 2026: added gates inside a station, the evidence board and the pretest; cut the 1-to-4 self-rating. Mockup updated with a pretest view, a working gate (miss, reteach, backup, flag) and a drag-and-link board.
