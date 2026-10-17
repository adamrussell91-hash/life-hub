# Peer annotation: feedback as annotation layers

A stripped-back version of the annotation block for peer feedback. Every student hands in a short piece of writing. They then annotate two classmates' pieces, one simple layer each, using the teacher's feedback buttons. In return they get their own writing back in an annotation view with two layers, one per reviewer.

It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice. Mockup: [peer-annotation/mockup.html](peer-annotation/mockup.html).

## Adam's asks

- Same flow as the peer feedback block: write, swap, give, get back. But each piece goes to **two** students, and each student reviews **two** pieces.
- Giving feedback is a **really simple, one-layer annotation view**: highlight or underline part of their writing, then attach feedback.
- Feedback is mostly **preset buttons** the teacher sets up. Example: the writer calls something a simile when it is a metaphor. The reviewer selects it, taps **Wrong technique**, and types "metaphor".
- The writer gets back an **annotation view with two layers**, each layer being one reviewer's feedback.
- **Resources stay with the teacher.** Students never add links or videos. In the block's setup, Adam decides what each feedback button links to (a video, a website, a technique card). That resource is attached automatically in the writer's view whenever a reviewer uses that button.

## What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Peer feedback block: join with code and symbol, swap, write-once, hand back, device drafts | `apps/teaching/src/blocks/peer-feedback.ts`, `netlify/functions/_shared/peer-feedback.mjs` | The whole classroom flow. This becomes an **Annotate** mode of the same block, not a new block |
| Annotation layers, each with a colour and symbol, plus the layer toggles | `annotation-layers.ts`, `annotation-view.ts` | The receiver's view is this viewer with two layers |
| Anchors to a stanza, a line or a character range, with a quote selector | `AnnotationAnchorSchema` | Each highlight is one anchor |
| Video (with start time) and link attachments on a note | `AnnotationAttachmentSchema` | The resource Adam attaches to each button |
| Literary elements table and the interactive technique card | `literary-elements.ts`, `technique-card.ts` | "Wrong technique → metaphor" can open the metaphor card |

## The flow

1. **Write.** Type the code, press Join (a symbol is assigned silently), write, hand it in.
2. **Swap.** Each piece goes to the next two people round a shuffled ring. Everyone gives two and gets two, and never their own. It needs at least three pieces in the swap.
3. **Give (twice).** The student sees one piece at a time ("1 of 2"):
   - Tap a sentence to highlight it. Phones make drag-selecting miserable, so tapping is the default and dragging only fine-tunes it.
   - Tap a feedback button. Some buttons ask for a short word or phrase ("Should be: ___").
   - Optionally add a short comment.
   - **Send**, then the second piece.
4. **Hand back.** The teacher sees every piece with both layers, by symbol, before releasing them.
5. **Get back.** The writer sees their writing with two coloured layers, labelled **Reviewer 1** and **Reviewer 2**, with a toggle for each. A one-line summary sits on top, e.g. "2 × Needs evidence · 1 × Great quote". Tapping a highlight opens the note, including any resource Adam attached to that button.

## Feedback buttons (teacher setup)

Each button has:

- a **label** and **colour**: *Wrong technique*, *Needs evidence*, *Great quote*, *Unclear*, *Explain the effect*;
- an optional **prompt for a short answer**, e.g. "Should be: ___";
- an optional **resource**, set by the teacher only: a video URL with start time, a link, or "technique card from the answer". In that last case the reviewer's typed answer ("metaphor") is matched against the literary elements table and the matching card opens.

Students can only press buttons and type into the boxes the button asks for. They never paste links.

## Data sketch

- Block content gains `mode: 'comments' | 'annotate'` and `codes: [{ id, label, colour, ask?, resource? }]`.
- The swap freezes `assignments: { reviewer: [writerA, writerB] }`.
- One create-only review blob per reviewer and writer pair:
  `reviews/{reviewer}/{writer}` → `{ notes: [{ anchor, code_id, answer?, comment? }] }`.
- The writer's view builds one layer per reviewer. Resources are attached **at read time** from the block's codes, so a fixed video URL updates everywhere, including feedback already handed back.
- Activity state gains `show_symbols: boolean`. Only the teacher writes it; the student status returns the student's own symbol only while it is true.
- Writing is split into paragraphs, then sentences. Paragraphs act as the annotation block's stanzas and sentences as tap targets.

## Decided

- **2026-10-17:** Resources on feedback buttons are set by Adam in the block setup. Students never add links or videos.
- **2026-10-17:** **One bank of feedback buttons**, standard in the block and reused across lessons. They are not rebuilt per lesson.
- **2026-10-17:** **Prose only.** Students will not write poetry here, so paragraphs and sentences are the only structure needed.
- **2026-10-17:** **Plain comments are allowed.** A highlight doesn't need a button.
- **2026-10-17:** **Only students who hand in writing are in the swap.** Absent students are never part of it. If a student hands in but doesn't finish their reviews, their two writers get whatever came in (one layer or none). No reassigning.
- **2026-10-17:** **Cap of 20 notes per reviewer on one piece**, so up to 40 across both layers.
- **2026-10-17:** **No teacher layer.**
- **2026-10-17:** **Students never see symbols by default**, their own or anyone else's. Reviewers show as **Reviewer 1** and **Reviewer 2**, so nobody can work out who said what. That means students don't pick a symbol when joining. They type the code and press Join, and the server quietly assigns a free symbol.
- **2026-10-17:** **The teacher sees everything, by symbol.** In the block's teacher view Adam can pick a symbol (or flick between them) to see that student's writing, both layers on it, and every note that student gave on other pieces.
- **2026-10-17:** **"Show student symbols" switch** in the block's teacher options, for behaviour issues. When it's on, every student's screen shows their own symbol small in the top right of the block, within one refresh (a few seconds). It's for everyone, which is fine. Adam can then walk the room, or ask a student to scroll back to the block, and match a symbol to a student. Turning it off hides them again. Example: Blue diamond writes something abusive in a note. Adam sees it in the teacher view under Blue diamond, turns the switch on, walks around and finds Blue diamond.

## Open questions

- **Does the hidden-symbol rule also apply to the simple two-box version** (PR 896)? It uses the same join flow, so it probably should.
- **Moderation before hand-back:** should Adam be able to delete a single abusive note before releasing feedback, so the writer never sees it?
- **Cap per reviewer or per piece:** 20 per reviewer is assumed above. Adam said "20 on a piece of writing", so confirm.
- **Small groups:** with only two pieces in the swap, each student can only get one reviewer. Fall back to one each.

## History

- **2026-10-17:** Recorded Adam's answers: one button bank, prose only, plain comments allowed, swap only includes those who hand in, 20-note cap, no teacher layer, symbols hidden from students with a teacher "Show student symbols" switch. Moved the resolved open questions into Decided.
- **2026-10-17:** Created from Adam's idea while reviewing the peer feedback block (PR 896). Resources-by-teacher decision recorded.
