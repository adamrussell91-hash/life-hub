# Level 2 thinking blocks: Diamond 9, Two-text Venn, Choice board, sentence-level writing

Date: 11 November 2026. Built overnight in one PR; every call below was made without a check-in, so each one names its reason.

"Level 2" means the version shaped by learning science, not the plain classroom routine. Each feature below says which finding it rests on.

## Shared decisions

- **One class-response store for all three new interactive pieces.** `netlify/functions/_shared/thinking-responses.mjs` keeps one record per device per block: `thinking/<lessonId>/<blockId>/<deviceId>`. The Discern store is the model: one blob per device, so a class sending at once never overwrites a shared record. The teacher reads every record (`GET /api/lessons/:id/thinking?block_id=`) and can clear a block before teaching it to another class. Students post (`POST /api/published/thinking/:id`). Nothing beyond the student's typed initials is stored about them.
- **The maths lives in the browser, in pure modules with unit tests** (`diamond-nine/model.ts`, `venn/model.ts`, `choice-board/model.ts`, `formats/sentence-model.ts`). The server stores and caps; it never ranks or scores. The student post for a Diamond 9 returns the class's anonymous first-round layouts once that student has submitted, and the browser works out the consensus with the same code the teacher view uses.
- **Initials, not names.** Students type initials (the same box and memory the Voice block uses), because the teacher's cold-call list needs them. The Display view never shows initials: it is the screen the class can see.
- **No AI calls anywhere.** Everything is computed from what students place and write.
- **Copy** says what students can do and keeps to plain British English.

## 1. Diamond 9 (`diamond_nine`, Thinking Toolkit menu)

Nine cards (text, quotation or picture) ranked in a 1-2-3-2-1 diamond against a criterion the teacher sets.

| Feature | Decision | Research reason |
|---|---|---|
| Rank alone first | The class view stays hidden on the student's screen until they submit. The teacher's own screen shows the class view as diamonds arrive; the Display (which the class can see) shows only the count until the teacher presses Reveal. | Conformity (Asch). Seeing the room's answer first pulls judgements towards it and removes the disagreement the discussion needs. |
| Reasons for the top and bottom card | Required before submitting. Because / But / So is offered as an optional frame (a toggle, off by default). | Elaborative interrogation (Pressley; Dunlosky et al. 2013): asking "why is this true?" improves retention and understanding more than ranking alone. The ends of the diamond are where judgement is sharpest, so that is where the reason is asked. |
| Wildcard | Optional (teacher setting). The student can swap one card for their own and must rank it like any other. | The generation effect (Slamecka & Graf): material a learner produces is remembered better than material they read. |
| Consensus and contested cards | Each card's row (0 = top, 4 = bottom) is averaged; spread is the standard deviation of its rows. The most contested cards are the three with the highest spread among cards placed by at least three students. | Cognitive conflict (Piaget; Limón 2001): discussion pays off where students really disagree, so the board points the teacher at those cards and not the ones everyone agrees on. |
| Outliers for cold calling | For each contested card, the students whose row is furthest from the class mean (two rows or more), with the reason they wrote. Initials on the teacher's screen only. | Targeted questioning: the strongest discussion starts from a reasoned minority view, not a random hand. |
| Re-rank | After submitting, the student can rank again ("After the discussion"). Each card shows how far it moved. A card that moved two rows or more asks "What changed your mind?" before they can finish. | Belief revision and metacognition: naming what changed a judgement consolidates the change (conceptual change research; Chi's self-explanation work). |
| Second criterion | Optional. A second pass ranks the same cards against another criterion, starting from the student's first layout. The teacher view shows both consensus diamonds and the cards that shifted most. | Varying the criterion shows that a ranking depends on it, a step towards evaluative thinking (and a contrasting-cases move). |
| Re-rank gate | No teacher gate: the button sits under the student's submitted diamond and says it is for after the discussion. | A gate needs live server state and polling. The teacher tells the class when, as they do with any re-place round. Recorded as a possible follow-up. |
| Touch and keyboard | Tap a card, then tap a slot (tap-to-place). Pointer drag works for mouse and pen; on touch, tapping places cards so the page still scrolls. Every card and slot is a button, so keyboard works too. | Phones are the student device in class. |
| Print | The empty diamond, the cards lettered A to I, the criterion, and lines for the two reasons. | Paper lessons. |

## 2. Two-text Venn (`venn`, Visualisation menu)

Two circles by default, three as an option. Students add points to each region; a point can carry a quotation per text.

| Feature | Decision | Research reason |
|---|---|---|
| Surface or deep tag | Every point is tagged surface (plot, feature) or deep (idea, concept, purpose). When surface points outnumber deep ones, the board suggests adding an idea, concept or purpose point. | Expert/novice research (Chi, Feltovich & Glaser 1981): novices sort by surface features, experts by deep structure. Asking students to label the level makes them notice which they are doing. |
| Shared points say how each text differs | A point in an overlap must say how each text in that overlap treats it before it counts as complete. | Contrasting cases (Schwartz & Bransford; Gentner's comparison work): the learning is in the difference within the similarity, so "both have…" never ends the thought. |
| Synthesis sentence | The centre holds one sentence built from a frame the teacher can edit: "Both … explore …, but where A …, B …". | Comparison with a stated relation transfers better than a list of matches (Alfieri, Nokes-Girardi & Schunn 2013). |
| Teacher sees every Venn | A list of every student's Venn with counts of deep and surface points. One can be shown on Display, anonymised. | Worked examples from peers, shown without names, give the class something concrete to critique. |
| Preloaded points | The teacher can add points for students to sort into regions, a lower-scaffold start. | Sorting before generating lowers the load for novices (cognitive load theory); students still tag and explain. |
| Layout | A drawn Venn shows the regions and their counts; the points sit in region columns under it, which stack on a phone. | Overlapping circles too small to hold text fail at 390px. |

## 3. Choice board (Panels block, `style: 'choice'`, Learning menu)

A grid of tiles, each holding nested blocks. The teacher sets "pick N".

**Built on Panels, not a new block type.** A choice board is Panels shown as a grid, with each panel a tile. Every path that already understands nested blocks (publishing, the teacher-only filter, sanitising, cloning, the Markbook's search for questions, hand-in) keeps working, so questions inside tiles hand in exactly as they do in Panels. A separate **Choice board** menu entry creates one (`tabs:choice`). Panels allow nine panels so a 3 × 3 board fits.

| Feature | Decision | Research reason |
|---|---|---|
| Tiers and types | Each tile carries a level (Core, Stretch, Challenge) and an optional type (e.g. Write, Analyse, Create). | Structured choice: students choose among known demands, not blind. |
| Constraint rules | None, "one from each column", or "a line" (a full row, column or diagonal, as in noughts and crosses; needs a 3 × 3 board). | Novices tend to choose the easiest task (Kirschner et al. on learner control; self-regulated learning research). A rule keeps choice while guaranteeing range. |
| Reason before it opens | A student writes a one-line reason for each pick before the tile opens. | Choice with a reason is a planning act (self-regulated learning: forethought phase, Zimmerman). |
| Rate and note | After finishing a tile the student rates how hard it was and notes one thing they learned. | Metacognitive monitoring (calibration) and retrieval of the main idea. |
| Choice with structure | Pick N, a rule, a reason. | Self-determination theory (Deci & Ryan): autonomy raises motivation when the structure around it is clear (Jang, Reeve & Deci 2010). |
| Swap until work starts | A pick can be swapped until the student types or answers inside the tile; then it locks. | Low cost of changing a plan, but no shopping between tasks once committed. |
| Teacher view | Who picked what, their reasons, ratings and notes, how many picked each tile, and patterns: a student who took the lowest level every time, or the highest. | The pattern is the teaching signal (who to nudge up, who to check on). |

## 4. Sentence-level writing (four new formats on the Question block)

New written formats on `question_set`, not new blocks, following the Writing Revolution (Hochman & Wexler):

- **Sentence combining**: kernel sentences into one. The teacher can require a joining word (because, although, which, when, but, so, while, unless, whereas).
- **Appositives**: a sentence with a noun to rename; students add an appositive.
- **Sentence expansion**: a kernel plus chosen question words (who, what, when, where, why, how).
- **Note to topic sentence**: fragment notes into one topic sentence.

| Feature | Decision | Research reason |
|---|---|---|
| Content-embedded | Items are written by the teacher from the unit's text; the editor hint says so. | Sentence practice in the content of the unit doubles as retrieval of that content (Hochman; retrieval practice, Roediger & Karpicke). |
| Faded scaffolding | Item 1 shows a worked model to study; middle items give a partial frame; the last items are independent. With one item it is independent; with two, model then independent. Teachers can turn fading off. The frame is the teacher's, or else the first part of the model answer. | Worked-example fading (Renkl & Atkinson 2003): full examples help novices, and removing steps gradually moves them to independence without the expertise-reversal cost. |
| Word limit | Optional, per block. A live count shows words used. | A desirable difficulty (Bjork): a tight limit forces choice of words. |
| Model after writing | Items 2 onwards show "Check against the model" only once the student has written something, as the Question block's model answer does. | Generate first, then compare (write-before-reveal). |
| Joining word check | A live note says when the required joining word is in the sentence. | Immediate, specific feedback on the one feature being practised. |
| Markbook | Answers save as the format's written part (`format.<id>`), which the existing work path sends to the teacher and the Markbook. | Nothing new to mark against. |

## Calls made during the build

- **Diamond 9.** Only the top and bottom reasons are sent, so an outlier's reason shows where they put a contested card at an end. A wildcard is left out of the class consensus. After the first send, both the re-rank and the second criterion are offered, re-rank first. Students have a "See the latest" button, which resends their own diamond to fetch the newest class layouts (there is no student read).
- **Venn.** The Display has no remote control from the teacher's screen: it opens at Student 1 and the teacher steps through with arrows. Student numbers follow arrival order. The synthesis keeps following the teacher's frame until the student edits it. A student can add up to 30 points.
- **Choice board.** A pick that would put the rule out of reach is refused straight away, with what to pick instead. Opened tasks sit under the grid, at full width, and the reason stays in the tile. Finishing a task also locks its pick. Phones show two tiles a row (one at 360px or narrower).
- **Sentence formats.** A frame item's box starts with the frame and counts as written only once it changes. The word limit is per sentence. The teacher view calls the last stage "On their own". The frame field shows on every item, because stages depend on position.
- **Initials** are optional everywhere; a response without them shows "—" to the teacher.

## Out of scope

Jigsaw groups, routing students from a check, AI marking or generation, a teacher gate on the Diamond 9 re-rank, comparative judgement (a separate build).

## Files

- `apps/teaching/src/blocks/diamond-nine/` (model, view, editor, CSS)
- `apps/teaching/src/blocks/venn/` (model, view, editor, CSS)
- `apps/teaching/src/blocks/choice-board/` (model, view, editor section, CSS)
- `apps/teaching/src/blocks/formats/sentence-model.ts`, `sentence-formats.ts`
- `apps/teaching/src/blocks/thinking-client.ts` (student and teacher calls)
- `netlify/functions/_shared/thinking-responses.mjs`, `lesson-thinking.mjs`, `published-thinking.mjs`
- Schema, create-block, registry, render, editors, block meta, icons, visibility, search text, sanitise, clone, fixture, mock API, generated server schema.
