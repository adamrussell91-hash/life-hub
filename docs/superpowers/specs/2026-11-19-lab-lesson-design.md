# Lab lesson — design

Date: 19 November 2026
Mock: `.mockups/lab-lesson.html` (local, not in the repo). It runs all three
levels end to end with invented data and is the reference for layout and copy.

## Purpose

A Lab is a lesson where students **test one claim about language against
readers and find out whether it holds**. The class changes one thing in a
text, predicts what the change will do, collects blind judgements from each
other, and reads the result.

It is the only lesson type where a student can be wrong about a prediction and
that is the point. Workshop learns a technique, Design Sprint makes something,
Case Study reaches a decision; Lab finds something out.

`lab` already exists in `PEDAGOGICAL_MODES` but behaves as a plain lesson. This
gives it its own structure, player and board.

## What the evidence says

Summarised from the research pass on 18 November. Most sources were read as
abstracts, and nearly all the hard evidence is from science classrooms.

- Open exploration loses to guided work: unassisted discovery d = −0.38
  against explicit teaching, guided discovery d = +0.30 (Alfieri et al. 2011).
  So the teacher sets the question and the frame.
- Recipe labs add nothing measurable (Holmes et al. 2017). What works is
  students making decisions and running a second pass (Holmes, Wieman & Bonn
  2015). So students choose the change, and Run it again exists.
- A lab tests knowledge already taught; it does not introduce it (Ofsted
  2021). So a Lab sits after the lessons that teach the feature.
- Committing to a prediction with a reason, then a teacher-led debrief, carry
  the learning (Predict-Observe-Explain; Sinha & Kapur 2021).
- In English, Hillocks found an inquiry focus (.56) and a structured problem
  worked in small groups (.44) the strongest modes for writing.

## Adam's calls

- A Lab is paced by the teacher from the board, one step at a time, like a
  peer feedback round.
- One job per screen. The same step names in the same order every time.
- Lilac marks the one thing that changed, everywhere it appears. Everything
  kept the same stays plain.
- It has to feel like a lab: students handle the text against a control, and
  ratings show as dots, never only as a finished bar.
- It has to scale to Year 12 Advanced: pairs design their own trial on a set
  text and test a claim they would write in an essay.
- Readers judge six texts each.
- Lab notes are a feature the teacher turns on or off. When on, a short note
  is required at every step, so students gather evidence the whole way.
- Students are told why they are doing the lab, at the start and again when
  they write.
- After the result, students name the language feature they changed. There is
  no "what could have skewed your result" step.
- No emojis.

## Out of scope

- A Lab block inside an ordinary lesson. Lab is a lesson type first.
- The third level, where students pose the question themselves.
- Counting labs (tallying a pattern across a text, cloze hit rates).
- Ann drafting a lab. No AI runs in a Lab at any point.
- Statistics beyond an average, a shift and a threshold.
- Live sockets. Board and devices poll.

## 1. The three levels

One setting, **Who decides the change**, picks the level. It sets which steps
the lab has.

| Level | Teacher sets | Students decide | Steps |
|---|---|---|---|
| **You supply it** | Question, the change, one text per option | Their prediction | Question, Predict, Test, Result, Explain |
| **Students write it** | Question, the change | Their prediction and their writing | Question, Predict, Make, Test, Result, Explain |
| **Pairs design it** | Question, claim, control text | The change, their hypothesis | Question, Design, Predict, Test, Result, Name it, Explain |

Examples, as in the mock:

- You supply it: "Does the passive voice shrink the blame?" Two versions of a
  news paragraph. Half the class reads each and rates the blame on a line.
- Students write it: "Which sense makes a storm feel most real?" Each student
  writes the same moment three ways. Readers pick the one that feels most
  real.
- Pairs design it: "What makes this speaker sound hesitant?" The claim to
  test is "The line breaks create the hesitation." Each pair changes one
  thing in the stanza and readers rate each version.

## 2. Plan: the Lab card

A Lab lesson has one card to fill in. The steps build themselves from it.

| Line | Notes |
|---|---|
| Question | One sentence. Becomes the lesson's headline on every screen. |
| Claim to test | Pairs design it only. |
| Why we are doing this | One or two sentences tying the lab to the essay or the unit. Shown to students at Question and reflected in the Explain prompt. |
| Kept the same / Changed | The two supplied levels. Changed is two to five options. |
| Control text | Pairs design it only. Any length; line breaks are kept. |
| Who decides the change | The level. |
| How readers judge | **Pick one** or **Rate on a line**, with the question readers answer and the two end labels. |
| Lab notes | Required at each step, or Off. Default on for Pairs design it, off for the other two. |
| Features to name | Pairs design it only. A list of feature names, each tagged Form, Sentence or Word. Ships with a default list the teacher can edit. |
| Counts as a win / a change | The threshold, set before any data. Defaults: ahead by 8 choices (pick), 1 point out of 10 (rate). |
| My debrief notes | Teacher only. Shown under the board at the last step. |

Default feature list: Line break (enjambment), Hedging (modality), Sentence
type, Punctuation (caesura), Repetition, Word choice (connotation).

## 3. Running it

### Steps, student and board

**Question.** Student: the question, the claim, the why, and the text with
numbered lines. Board: the same, large.

**Design** (Pairs design it). The bench: the control on the left, the pair's
version on the right. Tap a word to replace it, cut it, or move the line
break after it. Changes show in lilac and are named in plain words ("One
change: joined lines 5 and 6"). More than one change is allowed, with the
line "One change gives a cleaner result." The pair sends it with **Put it on
the bench**. Board: the control, and how many pairs are ready.

**Predict.** Supplied levels: tap the option that will win. Pairs: "If we
[the change], the speaker will sound…" less, about as, or more. It locks on
send. Board: a count, then a chart of predictions when the teacher reveals
it.

**Make** (Students write it). One box per option, one at a time. Board: the
task and how many have finished.

**Test.** One text per screen.

- Pick one: one anonymous writer's versions, shuffled, with the option labels
  hidden. Tap one. Six writers.
- Rate on a line, supplied: one version, rated once. Half the class gets each.
- Rate on a line, pairs: six versions, each rated, with the changes unmarked
  and the control mixed in.

Board: progress only. Results stay hidden until the teacher moves on.

**Result.**

- Supplied levels: one headline ("Sound won. Most of us predicted sight."),
  bars, and whether the lead counts as a win. The student also sees how their
  own prediction and their own writing went.
- Pairs: the student sees the control's ratings as dots above their own
  version's dots, both averages, the shift, and whether their prediction
  held. The board shows the **findings chart**: one row per pair, a bar
  running left for less and right for more from a centre line. Tapping a row
  opens that pair's version with its change marked, beside its dots.

**Name it** (Pairs design it). The pair picks the feature they changed from
the list and writes what it does to the voice. The board regroups every trial
by **level of language** and compares the average shift for Form, Sentence
and Word, with a headline ("The sentence level moved readers most").

**Explain.** One written answer. Supplied levels: "Why did sound win?" Pairs:
"Does the evidence support the claim?", asking for one analytical paragraph
that names the feature, quotes the text and uses a finding as evidence. The
student's lab notes and the key numbers sit above the box. Board: the most
chosen piece or the findings chart, with the teacher's debrief notes.

**After class.** The teacher's page for a finished lab: the class finding,
how many predictions held, the level-of-language comparison, and each
explanation ready to mark with its lab notes beside it. **Run it again**
starts a fresh round on the same lab.

### Lab notes

When on, each step shows one dashed "Lab note" box with a prompt for that
step, and the step's main button will not go through until the note has
text. A calm line appears under the box: "Write your lab note to carry on."

| Step | Prompt |
|---|---|
| Question | Where do you hear it? Quote it. |
| Design | Why this change? What is it doing in the original? |
| Predict | Because… |
| Test | Which version sounded most different? What had changed in it? |
| Result | What do the dots show? Look at the spread and the overlap. |
| Name it | What does this feature do to the voice of the speaker? |

Prompts are defaults the teacher can edit per lab. A one-line strip above the
student's card also records the facts as they happen: the change, the
prediction, the shift, the feature.

### Who reads what

- A reader never gets their own writing or their own pair's version.
- Texts are dealt so every version gets as close to the same number of
  readers as the class allows.
- Pairs: each reader's six are two controls and four other pairs' versions.
  With fewer than four other versions, the reader gets all of them plus two
  controls.
- Pick one: one writer's versions always arrive together, so the writer is
  held constant and only the option differs.
- Supplied, rate: the class is split at random into equal groups, one per
  version.

### Look

All in the hub's existing tokens and card style.

- Lilac (`--pastel-lilac`, `--pastel-lilac-ink`) means "changed": chips,
  marked words, a small bar where a line break moved, the lead bar.
- Poems and stanzas show numbered lines in the hub's monospace.
- Lab notes use monospace in a dashed lilac box.
- Dots drop in one at a time; bars grow. Both stop under reduced motion.
- At 390px the bench stacks, control above the pair's version.

Student-facing copy says what the student does. No deficit wording, no
emojis.

## 4. Data, marking, markbook

Storage follows the live class activities (`activity-rounds.mjs`,
`peer-feedback.mjs`) and Tutorial. The plan confirms exact keys.

- **Lab settings** live on the lesson, as Tutorial's do: the Plan card's
  lines, validated by a schema shared by the client and the function.
- **One live round per lab**, with Past rounds and bring back. The round
  holds the current step, whether predictions are revealed, and the dealt
  reading lists.
- **Per student:** prediction and reason, writing (Students write it),
  ratings or picks, lab notes keyed by step, the explanation.
- **Per pair** (Pairs design it): the version as a list of edits against the
  control (cut, replace, break moved), the hypothesis, the feature named.
  Either partner can edit; the last save wins.
- **Pairs** are set on the Plan card with Make pairs. A leftover student
  joins a group of three.
- **Moderation:** student writing goes through the peer feedback filter
  before any other student sees it. Flagged pieces are held for the teacher,
  as in a peer feedback round.
- **Anonymity:** readers never see who wrote a piece. The teacher sees
  initials.
- **Marking:** the Explain answer is written work. It joins To mark and gets
  a markbook column like any handed-in question, and the marking view shows
  the student's lab notes and their trial beside it.
- **Quiz questions** do not run inside a Lab; `lab` joins the lesson types
  that play through their own player.
- **Polling:** the board polls counts while a step is open. A student device
  polls for the step. No AI calls.

## 5. Edge cases

- **Joins late:** the student enters at the current step. If Make or Design
  has passed, they take part as a reader and still predict, note and explain.
- **Absent partner:** the pair's version and hypothesis stand; the present
  student carries on alone.
- **A pair makes no change:** Put it on the bench stays off. If the teacher
  moves on, that pair has no trial, reads as normal, and their Result screen
  shows the class findings.
- **Two pairs make the same change:** both rows show. It is a useful repeat.
- **Too few readers for a version:** the row shows its reader count, and
  under four readers it is drawn pale and left out of the level comparison.
- **Too close to call:** a lead under the threshold is reported in those
  words, on the board and to students. Nobody's prediction is marked as held.
- **Lab notes off:** no note boxes, no blocking, and the notes panel is
  absent from Explain and from marking.
- **Teacher moves on early:** unfinished students stop where they are and
  join the next step. Their partial ratings count.

## 6. Testing

- Unit: step list per level; reading-list dealing (never own work, balanced
  counts, controls mixed in, small classes); edit list applied to a control
  and described in words; shift, threshold and verdict; level-of-language
  grouping; lab-note gating on and off.
- Fixture: an invented class of 17 in eight pairs, with invented writing.
- Walk in preview at desktop and 390px, each level from Plan to After class,
  as teacher and as two students in different pairs.
- Not covered by tests: a real class, Safari, and whether the default
  thresholds suit real ratings.

## Phases (commits in one PR)

1. `lab` settings schema, the Plan card, the step engine, and the Question
   and Predict steps on board and student.
2. You supply it: split-class reading, rate on a line, Result, Explain.
3. Students write it: Make, anonymous sets, pick one, moderation.
4. Pairs design it: the bench and edit list, control mixing, dots, the
   findings chart.
5. Lab notes with the on/off setting, Name it, the level comparison.
6. After class, marking with notes beside the answer, markbook column, Past
   rounds and Run it again.

## Settled in the plan

- Pairs live in the lab's own settings, with a Make pairs button that
  shuffles the class list into pairs the teacher can edit. Saved groups in
  the markbook are evidence groups and do not fit; Tutorial and Sprint keep
  their own groups the same way.
- In Pairs design it, lab notes and ratings are each student's own, while
  the change, hypothesis and feature are the pair's.
- Lab notes default on for Pairs design it only.
- The Explain answer is a seeded written-question block, so it reaches To
  mark and the markbook with no changes to marking.
