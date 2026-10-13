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

## Suggested order if this gets built

1. **Core:** structured poem, word/line/stanza anchors, rich bodies, layers, hint ladder (2), Periodic Table tags with the shared JSON (3).
2. **Students:** commit-before-reveal (1), ballots (9), retrieval cards (12). These need the student-state decision below.
3. **Depth:** threads (6), sound layer (5), zoom (10), paragraph builder (11).
4. **Feedback mode:** (15).

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

- 2026-10-13: Created. Fifteen ideas for a Teaching Hub annotation block (poetry first, feedback later), plus an anchor-model sketch and Periodic Table integration notes.
