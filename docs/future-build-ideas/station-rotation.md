# Station Rotation: a lesson type

A lesson type where students move around a **map of stations**, carrying something from each into a **finale** built outside the stations. One lesson type covers everything from a simple timed carousel to a full breakout mystery, because every variant is a setting on the same four parts.

Concept doc only. Nothing builds from here until Adam names a slice. Mockup: [station-rotation/mockup.html](station-rotation/mockup.html).

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

## The four parts

| Part | What it is | Settings |
|---|---|---|
| **Map** | The stations and how they link | Station cards, links (unlocks), capacity, time, location (room spot or QR) |
| **Path rules** | Which routes are allowed | Fixed order · free order, all · choose N of M · must-do plus may-do · unlocks (C opens after A) · teacher-assigned from an entry check |
| **Collector** | What students carry out of each station | A **piece** (content the finale uses) and, optionally, a **token** (a code or key for the story) |
| **Finale** | The build outside the stations | Final lock (breakout only), the build, debrief, calibration |

**Pace** sits alongside the path rules: **bell** (everyone moves on a timer, with a generated rotation grid) or **self-paced**.

### Presets

Presets fill in the settings; the teacher can change anything afterwards.

| Preset | Path | Pace | Collector | Finale |
|---|---|---|---|---|
| Carousel | Fixed order, all | Bell | Pieces | Debrief |
| Choice board | Must-do plus may-do | Self-paced | Pieces | Build |
| Teacher-led rotation | Teacher-assigned from entry check | Bell | Pieces | Debrief |
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

## Informed choice, not free choice

Novices choose badly. They pick whatever feels fluent and easy, so they avoid the desirable difficulty they most need. Choice helps motivation, but the gains peak at about three to five meaningful options and fade with more (Patall, Cooper & Robinson, 2008).

- The map shows a **recommended** station and level for each student, based on the entry check or past results.
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

1. **Arrival recall**: one question from the station the student has just left (spaced retrieval inside the lesson).
2. **Goal**: one line.
3. **Steps**: built from existing blocks (a station is a section).
4. **Levels**: Support · Core · Extend, the same three words the Lens blocks use.
5. **Hint ladder**: graduated hints, opened one at a time. Every opened hint is logged.
6. **Done when**: the success criteria.
7. **Exit check**: one or two questions, scored. This is individual even in group work.
8. **Collect**: the piece (and token) this station produces.

**Station settings:** knowledge type, skill strand, outcomes, minutes, capacity, location (room spot, QR code or online), and whether it can be marked done offline (teacher tick or code entry).

**Station library:** stations are saved on their own and can be reused across rotations.

### The teacher station (v1)

- Counts as a station on the map, in the same card layout, using the `with_teacher` block.
- **Routing:** the entry check (or an earlier quiz) puts students into the teacher station's groups. Students who need reteaching come first, and extension students come last.
- **Bell mode:** the rotation grid builds the teacher station's groups into the schedule.
- **Self-paced mode:** the teacher **calls** a group. The called students see "Come to the teacher station" on the map, with a gentle pulse, and their current station is paused, not lost.
- **Teacher's station view:** who is in this group, why they were routed here (which entry-check items they missed), a short script or misconception list, and quick ticks for "got it" or "needs more". A "needs more" tick can add a follow-up to their passport.

## Collector: pieces and tokens

- A **piece** is content the finale actually uses: a finding, a worked answer, a sketch, a claim with evidence. Pieces live in a per-student **passport**.
- A **token** (a code, a key) is for motivation and drama only.
- **The token is earned by the learning.** The code shows only after the Core-level exit check passes, so it can't be guessed or shortcut.
- **The final lock needs the stations combined.** It is a question that can only be answered by integrating the pieces ("which factor started the chain?"), not a cipher made from letter counts.
- **Keep the story thin.** Vivid but irrelevant story detail can pull attention away from the content (the seductive details effect, Harp & Mayer, 1998). The story frames the stations and the reveal; it does not compete with them.
- **Rewards should tell students how they're doing, not control them.** Points or badges felt as controlling can undermine intrinsic motivation (Deci, Koestner & Ryan, 1999). Tokens mark progress; nothing is ranked.

## Planning and reflection

Plan, monitor, evaluate (Zimmerman's cycle of self-regulated learning), built into the lesson type:

- **Plan (start):** the student drags out a route and rates confidence for each station (1 to 4).
- **Monitor (during):** the passport shows progress against the plan; hints opened and exit-check results show per station.
- **Evaluate (finale):** confidence compared with exit-check results (calibration), plus "why did you choose that order, and would you choose it again?".

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

- **Bell mode in v1**, or self-paced only (with the teacher station's "call group")?
- **Finale**: its own build inside this lesson type, or a handoff to the Design Sprint or Case Study?
- **Routing source**: an entry check built into the lesson, earlier quiz data, or both?
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
- Patall, E. A., Cooper, H. & Robinson, J. C. (2008). The effects of choice on intrinsic motivation and related outcomes: a meta-analysis. *Psychological Bulletin*.
- Roediger, H. L. & Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*.
- Rohrer, D. & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science*.
- Zimmerman, B. J. (2002). Becoming a self-regulated learner: an overview. *Theory Into Practice*.

## History

- 9 Nov 2026: first draft from the brainstorm round, with the mockup.
