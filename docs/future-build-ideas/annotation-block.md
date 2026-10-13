# Annotation block (Teaching Hub)

A Teaching Hub block for showing annotations on a poem first, and later on any text, including student writing as a feedback tool. It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice.

## What it must do (Adam's asks)

- Anchor an annotation to a **word**, a **phrase**, a **line** or a **stanza/paragraph**, and show which one clearly.
- Let an annotation carry rich bodies, not just text: video (with a start time), websites, audio, images, and links to other blocks.
- **Reveal**, so students don't get every answer at once.
- Grow into a general **feedback tool** later.
- Connect to the **Periodic Table of Literary Elements** (`widgets` repo).

## What already exists to build on

| Piece | Where | Why it matters |
|---|---|---|
| 35 block types incl. `cloze`, `flashcards`, `self_check`, `question_set`, `embed`, `video`, `audio`, `timeline`, `concept_map` | `apps/teaching/src/schemas/block.ts` | Several ideas below feed annotations *into* these rather than rebuilding them |
| Image annotations stored as W3C-style JSON (`{id, body, selector}`) via Annotorious | `ImageBlockSchema`, `design-kit/js/hub-image-annotate.js` | Text anchoring should use the same shape. The W3C Web Annotation model already has `TextQuoteSelector` and `TextPositionSelector` for text |
| Safe embed / video URL parsing | `blocks/embed-url.ts`, `video-url.ts`, `url-safety.ts` | Annotation bodies with links reuse these. No new sanitiser |
| Visibility rules (teacher vs student) | `blocks/visibility.ts` | Teacher-only layers and timed reveal sit on this |
| Ann (reflection coach) and Alchemy block reviews | `src/ai/`, `src/alchemy/` | Ann can read reveal data after a lesson (idea 13) |
| Periodic Table: 310 techniques, 5 families, 21 subgroups. Each is `T(name, definition, effect, example, related[])`, with Compare, Bond, Relations, Drill, Flash, Write & Grade, Revise and Scanner panes. No deep links today | `widgets/English/Tools/Widgets/Periodic-Table-of-Literary-Elements.html` | Ready-made technique vocabulary with definitions *and effects* |

**Anchor model (sketch).** The poem is stored as structured text: stanzas, then lines, then tokens. Each annotation has one or more anchors `{stanza, line?, start?, end?}` plus a quote selector so it survives small edits. Granularity is derived from the anchor and drawn differently each time:

- **Word or phrase:** underline.
- **Line:** a margin bar.
- **Stanza:** a bracket down the gutter.
- **Several anchors:** a thread (idea 6).

## The ideas

Each idea names the research it rests on, so they can be judged on the evidence and not only on whether they look clever.

### 1. Commit before you reveal ("earn the margin")

An annotation stays locked until the student commits to something:

- tapping the word they think matters most in the line;
- picking the technique;
- typing a one-line guess.

Only then does the teacher's note open, beside their own attempt, never instead of it.

- **Research:** the *generation effect*, *pretesting*, and Kapur's *productive failure*. A meta-analysis of 53 studies found that an attempt before instruction beats instruction first on conceptual understanding. One caveat: an Instructional Science (2020) study found that *seeing others' failed attempts* may help as much as making your own. That backs idea 9, where students see the class's spread of guesses.
- **Wow:** in teacher view, all the commits become a **heatmap over the poem**. You can see which word the class fixed on before you say anything.

### 2. The hint ladder (reveal in rungs, not all at once)

Each annotation is written as up to five rungs, and the student climbs only as far as they need:

1. **Notice.** The span glows: "something is happening here."
2. **Question.** "What does the line break do to *fall*?"
3. **Name.** "Enjambment." This is a live Periodic Table element (idea 3).
4. **Effect.** How it works on the reader.
5. **Model reading.** One exemplar sentence of analysis.

The rung they stopped at is recorded (if student state is on, see Open questions).

- **Research:** scaffolding and *fading* (Wood, Bruner & Ross; Renkl on fading worked examples), and the expertise-reversal effect. Strong students skip rungs and weaker ones get support, from the same block.
- **Why it beats a plain reveal:** "reveal" stops being a switch and becomes a measure of how much help each part of the poem needed.

### 3. Periodic Table integration: elements, compounds and the poem's fingerprint

Integrate the table's data, don't just link to it. Extract the 310 `T()` entries into a shared `literary-elements.json` in `widgets`, served by GitHub Pages and read by both the table and the hub. Then:

- Tagging an annotation with a technique adds its **element tile** (symbol, family colour). Tapping it shows the definition and *effect* straight from the table.
- Two techniques on the same span form a **compound**, using the table's own "Bond" idea. For example, enjambment plus caesura on one line is a compound worth naming.
- Every poem gets a **fingerprint strip**: the elements it uses, coloured by family. Put the strips of two poems side by side for comparative study. "Owen leans Sound & Rhyme; Dawe leans Syntactic."
- Add **hash deep links to the table** (`#el=enjambment&pane=drill`), so an annotation can send a student to drill that exact technique.
- The table's **Scanner** pane can suggest candidate annotations, *teacher-side only*. You accept or reject each one. Students never see unreviewed AI output.

### 4. Reading lenses (layers that disagree on purpose)

Annotations sit in toggleable layers:

- Sound
- Structure
- Imagery
- Context
- Critical lenses (feminist, ecocritical, postcolonial, Marxist)
- Personal response

The same line can carry a different reading in each layer. A **"split view"** shows two lenses side by side on one stanza.

- **Research:** Rosenblatt's transactional theory, where meaning is made between reader and text and not stored in the text. Appleman's *Critical Encounters* shows that teaching lenses to adolescents makes interpretation visible as a choice. Empson's *Seven Types of Ambiguity* treats ambiguity as the point, not a problem.
- **Wow:** students stop asking "what does it mean?" and start asking "what does it mean *from here*?"

### 5. The sound layer: hear it, see the metre

- A recorded reading with **word-level timing**: tap any word to hear it, and the line lights up as it plays.
- **Several performances** to compare: the poet, an actor, you, a student.
- **Automatic overlays** you can switch on or off: scansion marks (˘ /), caesura ‖, enjambment ↵, rhyme scheme letters at line ends, assonance and alliteration tinting. Rhyme and stress can come from the CMU Pronouncing Dictionary, then the teacher corrects them.
- **Research:** Peskin's (1998) expert–novice think-aloud study found that experts use far more *structural cues* (rhythm, binary oppositions, word play) than novices do, and enjoy the poems more. This layer puts those cues on screen.

### 6. Threads: annotations with more than one anchor

One annotation can join several anchors across the poem. The links are drawn as arcs in the margin:

- **motif chains**: every water word;
- **binary oppositions**: light ↔ dark;
- **the volta**: the turn, with what comes before and after;
- **echo**: a word that returns changed.

Click a thread and the poem dims everything else.

- **Research:** Peskin again, since binary oppositions were a top expert cue, plus Halliday & Hasan's lexical cohesion chains.
- **Why it matters:** single-span annotation teaches students to spot devices. Threads teach the *structure* of a poem, which is where Band 6 analysis lives.

### 7. Ghost words and drafts (the choices the poet didn't make)

Tap a word to see what the poet *might* have written, then decide why this word won. Where real manuscript drafts exist, show them as a **drafts layer** with struck-through variants (genetic criticism). Wilfred Owen's drafts and Keats's revisions are the classic examples.

A student mode reuses the existing `cloze` block: blank the key word, students choose from four options, then reveal the poet's choice and *why*.

- **Research:** I. A. Richards's *Practical Criticism* protocols, and the close-reading tradition that word choice is an argument.
- **Wow:** "diction" turns from a label into a decision students can feel.

### 8. A think-aloud you can replay

Record yourself reading the poem aloud and thinking: "Hm, why 'flickering'? Oh, it was candles in stanza one." Each comment is synced to the line you were on. Students replay your thinking, and the poem highlights itself as you go. Students can record their own later.

- **Research:** cognitive apprenticeship (Collins, Brown & Newman), which says make expert thinking visible, and Elbow's "movies of the reader's mind."
- **Wow:** students see the *process* of an expert reading: the doubts, the wrong turns and the second reading. Normally they only see the polished result.

### 9. Ballots on ambiguous lines

For lines that are truly contested, set up a **ballot** with two or three readings. Students vote and give a confidence level, and the class spread appears *before* your view is revealed. Your view can be "both, and here's why."

- **Research:** Dylan Wiliam's hinge questions (one quick check that decides where the lesson goes), and peer instruction (Mazur): vote, discuss, revote. It also uses the Instructional Science finding from idea 1, that seeing other people's attempts prepares students to learn.

### 10. Zoom levels: word → line → stanza → poem → context

Pinch or slide to change the grain of the reading:

- **zoomed in:** word annotations;
- **mid-zoom:** each line becomes a margin gloss;
- **stanza:** one-sentence stanza summaries, with the poem's argument laid out as a spine;
- **zoomed out:** the poem as a whole, set against context, the poet's other work and the unit's concepts.

A **Says / Does / Means** (or **What / How / Why**) toggle reframes each level.

- **Research:** the novice–expert gap is partly about moving between local detail and global meaning. Novices get stuck at one level. This turns that movement into a physical gesture.

### 11. Annotation → paragraph builder

Select three annotations and drag them into a **TEEL/PEEL scaffold**. The quote is embedded with a line reference, the technique from the Periodic Table fills the "technique" slot, and the effect note becomes a starting point the student has to *rewrite in their own words*. It closes the gap between annotating and writing, which is where most poetry teaching breaks down.

- **Research:** *The Writing Revolution* (Hochman & Wexler), sentence-level scaffolds that fade. It also fits the HSC's analytical paragraph form.
- **Link:** the Periodic Table's "Write & Grade" and "Revise" panes already exist, so the builder can hand off to them.

### 12. Retrieval from your own annotations

Any annotation can become a retrieval card with one tap:

- **Quote → technique and effect.**
- **Technique → find it in the poem** (tap the right word).
- **Line → recall it** (first-letter fading for memorising quotes).

These feed the existing `flashcards` block and come back spaced across the term, ahead of exams.

- **Research:** the testing effect (Roediger & Karpicke) and spacing. It is among the most reliable findings in learning science.

### 13. Teacher-only layer, plus Ann's after-lesson loop

A private layer only you can see:

- what to ask, likely misconceptions, timing, the link you'll put up live;
- a **"lesson mode"** that reveals annotations one by one at your pace on the projector.

After the lesson, Ann (the reflection coach) can read which rungs the class needed (idea 2) and how the ballots split (idea 9). It then coaches from *stored* data: "Stanza 3's enjambment needed rung 4 for most of 9B, so open with it on Thursday." That matches Ann's rule to coach only from stored patterns.

### 14. Cross-poem threads (textual conversations)

Threads (idea 6) that run *across poems in a unit*: Owen's "drowning" here, Dawe's "drowning" there. A **unit-level view** lays out every linked anchor in one constellation, ready for comparative essays and the HSC's textual-conversation modules.

- **Wow:** you build the unit's intertextual map once, and every student essay draws on it.

### 15. Feedback mode: the same engine on student writing

When the block points at a student's draft instead of a poem, the same anchors, layers and reveal become a feedback tool:

- **Comments before the grade.** The mark stays hidden until the student has responded to the comments. **Research:** Butler (1988) found that grades given alongside comments cancelled the comments' effect on learning.
- **Locate the error yourself.** Instead of underlining, the note says "3 missing embedded quotations in this paragraph, find them." The paragraph is anchored and the exact spots are hidden behind reveal. **Research:** Wiliam, "feedback should be more work for the recipient than the donor."
- **Feed up / back / forward.** Every comment is tagged with one of Hattie & Timperley's three questions: where am I going, how am I going, where to next. The block shows if the feedback is lopsided.
- **Required action.** Each comment needs a student reply or revision before it closes. **Research:** Carless & Boud's (2018) feedback literacy framework (appreciating feedback, making judgements, managing affect, taking action), where uptake is the point.
- **Exemplar first.** Before seeing feedback on their own work, students annotate an exemplar against the criteria, then reveal yours. **Research:** Sadler's evaluative judgement, comparative judgement.
- **Comment bank** linked to Periodic Table elements, so "try anaphora here" opens the element.

## Critical review (Adam, 2026-10-13)

These verdicts govern. Numbers are the doc's idea numbers.

| # | Idea | Verdict | Note |
|---|---|---|---|
| 1 | Commit before you reveal | **Keep** | Must work with no student accounts (see A) |
| 2 | Hint ladder | Not yet reviewed | Works with no accounts as-is |
| 3 | Periodic Table integration | Not yet reviewed | |
| 4 | Reading lenses | **Open** | Adam asked for a fuller explanation (see D) |
| 5 | Sound layer | **Cut**, except voice recording | Scansion, rhyme and performance overlays cut. Recording your own voice stays and grows into C |
| 6 | Threads | **Keep, extended** | Add thread focus: fold the rest of the text away (see B) |
| 7 | Ghost words and drafts | **Cut** | Too much effort to author |
| 8 | Replayable think-aloud | **Keep** | Same engine as C |
| 9 | Ballots | Not yet reviewed | |
| 10 | Zoom levels | Not yet reviewed | |
| 11 | Paragraph builder | **Maybe** | "Has promise" |
| 12 | Notes → flashcards | **Keep** | |
| 13 | Teacher layer + Ann | Not yet reviewed | |
| 14 | Cross-poem threads | **Modify** | Too unit-specific. Becomes a general anthology (see E) |
| 15 | Feedback mode | **Modify** | Adam rarely gives marks, so "hide the mark" is moot. Needs evidence the feedback was read (see F). Voice feedback (C) is the core |

### A. Commit before you reveal, with no student accounts

- **The lock and reveal need nothing.** The student taps a word or types a guess, the note opens, and the guess is kept in their browser only.
- **The class heatmap needs one anonymous signal.** Each commit sends `{lesson, annotation, word position, class link}` with no name, like a no-login poll. Student class URLs (`/s/classes/*`) already exist, so taps can be grouped by class.
- **Live lesson mode (optional).** The projector view fills in the heatmap as taps arrive (polling every few seconds is enough). You can also hold every student's reveal until you release it: their page checks a "released" flag. Still no accounts.
- **What you give up without accounts:**
  - who tapped what;
  - stopping one student tapping twice (a random device id in browser storage softens this);
  - any per-student history.

  Accounts are only needed for per-student records.
- **The same anonymous signal covers ballots (9) and hint-ladder rung counts (2).**

### B. Thread focus (the accordion)

Selecting a thread folds every line that isn't in it into a thin bar ("⋯ 4 lines"). The thread's lines then sit one after another, in poem order:

- Line numbers stay.
- The anchored words stay highlighted.
- Tap a fold to open it.

**Options:**
- **±1 line of context:** shows one line either side of each thread line.
- **Step through:** for the projector. The thread reveals one stop at a time, each with its note.
- **Thread order:** for threads you built as an argument (e.g. how the light imagery dims) rather than in poem order.

**Same mechanism elsewhere:**
- prose paragraphs;
- an anthology theme across poems (E);
- the feedback view: "show only the paragraphs I commented on".

Prior art is code folding and the "collapse unchanged lines" view in diffs.

### C. Voice feedback that pins itself to the text (headline idea)

Adam already gives feedback by recording himself reading a draft aloud and commenting as he goes. The block should take that recording and pin each part to the passage it is about.

1. **Record** in the block, with the draft on screen. Optional: tap a paragraph while talking for a free, exact anchor. Tapping is cheaper and more reliable than AI.
2. **Transcribe with timings.** The Knowledge hub already runs Whisper (`@cf/openai/whisper-large-v3-turbo` on Cloudflare Workers AI, `apps/knowledge/src/capture/live.ts`). Check that its output gives word or segment timestamps.
3. **Match quotes, rule-based first.** Find transcript stretches that fuzzy-match the draft's words. This allows for misheard words and the student's own misspellings. When a quote appears twice, prefer the next occurrence after the previous pin, because you read top to bottom.
4. **AI second pass**, only for what step 3 missed: paraphrased references ("your second paragraph", "the bit about the storm"). These anchor to a paragraph rather than to words.
5. **Cut into clips.** Each clip runs from one quote to the next quote or topic change, and pins to its span. Anything left over becomes a general comment.
6. **Teacher check before publishing.** A list of pins with a confidence level. Drag to fix, split or merge clips, then publish.
7. **Student view:**
   - a play button in the margin at each pinned span, with its transcript underneath (for skimming, searching and accessibility);
   - **Play all**, which highlights the draft as your voice moves through it.
8. **Extras you approve before students see them:**
   - a three-point "where to next" drafted from what you said;
   - Periodic Table tags for techniques you named;
   - a class-wide note when the same issue comes up across many drafts.

**One engine, two uses.** Pointed at a poem, this is the replayable think-aloud (8). You read the poem aloud and think, and the quotes you say become anchored annotations.

**Risks:**
- misheard quotes;
- long recordings;
- sending student work and your voice to an AI service. Check school policy, though Workers AI is already in use in Life Hub.

### D. Reading lenses, explained

A lens is a named layer of annotations that asks one question of the poem. Several lenses on the same line show that interpretation is a choice. Example from Owen's "Dulce et Decorum Est" (public domain):

| Lens | The question it asks | On "Bent double, like old beggars under sacks" / "The old Lie" |
|---|---|---|
| Close reading | How does the language work? | The simile turns young soldiers into old beggars. The heavy stresses slow the line to a trudge |
| Context | What was happening when it was written? | Written at Craiglockhart in 1917. An early draft was addressed to Jessie Pope, a pro-war poet, so "My friend" is sarcastic |
| Gender | What does it say about masculinity? | The heroic-manhood myth: the men are "boys" and "children ardent for some desperate glory" |
| Power and class | Who benefits, and who pays? | Those at home make the propaganda and the men in the mud die for it. "The old Lie" is ideology |
| Trauma | What does the mind do with it? | "In all my dreams, before my helpless sight": recurring nightmare, shell shock |
| Ecocritical | What happens to the land and air? | The air itself becomes the weapon. Mud and flares make the landscape an enemy |
| Personal response | What did you feel? | The student's own layer |

**How it works on screen:**
- Lens chips sit across the top, one colour each.
- With one chip on, only that lens's notes show.
- With two on, you get the split view.
- A line read by three or more lenses gets a small stack of coloured ticks in the margin. Those are the poem's hotspots.

**Student tasks:**
- "Which lens is this note?"
- "Write the missing lens for this line."
- Add a personal-response note.

**Effort:** pick two or three lenses per poem, not all seven.

**Why it matters:** Rosenblatt (meaning is made between reader and text) and Appleman's *Critical Encounters* (teaching lenses to adolescents). It matches the HSC's interest in perspectives and readings.

### E. Anthology block (replaces cross-poem threads)

A toggle on any annotation, or on a whole annotated text: **"Add to the unit anthology"**. Tags are theme and concept, plus Periodic Table techniques.

On the unit page, an **Anthology** block gathers everything tagged. It could be a new source on the existing `collection` block (`unit_annotations`), next to `unit_lessons`. Views:

- **By text:** a card per text with its technique fingerprint.
- **By theme:** every note tagged "memory" across texts, folded using thread focus (B).
- **By technique:** where enjambment appears across the anthology.
- **Connections:** cross-text threads.

Each item links back to its lesson. Flashcards (12) can draw a unit revision deck from it.

It is not poetry-specific. It works for any unit with several texts: related texts, a novel and its film, Module A pairs.

### F. Knowing the feedback was read (no marks needed)

- **Who it is for.** Each draft's feedback lives at a private, unguessable link for that student. No account is needed, and the link itself identifies the student.
- **Evidence, weakest to strongest:**
  1. Opened.
  2. Voice clips played (% of each clip heard).
  3. Replied to each comment: "Got it", "Not sure" or "I disagree because…", or one line in their own words.
  4. Revised: a resubmitted draft that changes the commented spans.
- **What you see.** A class panel showing not opened, listened, responded and revised.
- **What reveal does here.** It holds back the *next step*, not a mark. The feed-forward target unlocks once every comment has a reply. "Find it yourself" comments hide the exact spot behind a reveal.
- **Caveat.** Opening and playing prove exposure, not reading. Replies and revisions are the real evidence, which is the "taking action" part of Carless & Boud's framework.

## Suggested order if this gets built

1. **Core:** structured poem, word/line/stanza anchors, rich bodies, threads with thread focus (6 + B), Periodic Table tags and the shared JSON (3).
2. **Voice:** voice recording with self-pinning clips (C). This covers both think-aloud (8) and voice feedback.
3. **Students, no accounts:** commit before you reveal with the anonymous heatmap (1 + A), notes → flashcards (12).
4. **Unit:** anthology block (E), reading lenses (4 + D) if kept.
5. **Feedback mode:** private per-student links and response evidence (15 + F).

## Open questions

- **Student state.** Student lesson URLs are public and unauthenticated. Ideas 1, 2 (recording), 9 and 12 need responses. Options: browser-only with no sharing, an anonymous class code, or real student accounts. Each changes the privacy and storage story.
- **Shared Periodic Table data.** Is the shared JSON owned by `widgets`, with the hub reading it at runtime or vendoring a copy at build time? Should hash deep links be added to the table first, since that is cheap and independent?
- **Poem text storage.** Is it a new block type or a mode of `rich_text`? Line and stanza structure argues for a dedicated block.
- **Copyright.** Contemporary poems on public student pages: does the block need a "teacher-supplied text, not published publicly" setting?
- **Scansion and rhyme automation.** Is it worth it, or should the teacher mark stress by hand at first?
- **Feedback mode route.** Does it live in the Teaching Hub or a separate surface when student work is private?

## Sources

- [Shute (2008), *Focus on Formative Feedback*](https://myweb.fsu.edu/vshute/pdf/shute%202008_b.pdf)
- [Hattie & Timperley feed up / back / forward summary](https://sola.kau.se/keeponteaching/about-feedback-feed-up-feed-back-och-feed-forward/?lang=en)
- [Carless & Boud (2018), student feedback literacy](https://opus.lib.uts.edu.au/bitstream/10453/128791/4/CB%20Feedback%20literacy_AEHE_final%20accepted.pdf)
- [Peskin, expert vs novice poetry reading](https://www.onfiction.ca/2008/11/research-bulletin-by-joan-peskin.html)
- [Rosenblatt and Smith's "deferent" reader](https://wacclearinghouse.org/docs/jbw/v36n2/smith.pdf)
- [Productive failure (Kapur et al., npj Science of Learning 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10185511)
- [Generation vs observing failed attempts (Instructional Science 2020)](https://link.springer.com/doi/10.1007/s11251-020-09528-z)
- [Indiana University social annotation study (Hypothesis)](https://web.hypothes.is/blog/indiana-university-launches-large-scale-research-project-on-social-annotation/)
- [Perusall vs Hypothesis assessment (CU Boulder)](https://oit.colorado.edu/services/consulting-professional-services/academic-technology-initiatives-team/needs-assessments/social-annotation-tools)
- Cited from the literature but not re-fetched for this doc: Butler (1988); Wood, Bruner & Ross (1976); Renkl on faded worked examples; Roediger & Karpicke (2006); Collins, Brown & Newman (1989); Appleman, *Critical Encounters*; Hochman & Wexler, *The Writing Revolution*; Wiliam, *Embedded Formative Assessment*; Halliday & Hasan, *Cohesion in English*; Sadler (1989).

## History

- 2026-10-13: Added the Critical review with Adam's verdicts and sections A to F: no-account reveal, thread focus, self-pinning voice feedback, the reading lenses explained, the anthology block, and feedback read evidence. Cut ghost words and the sound overlays. Reordered the build.
- 2026-10-13: Created. Fifteen ideas for a Teaching Hub annotation block (poetry first, feedback later), plus an anchor-model sketch and Periodic Table integration notes.
