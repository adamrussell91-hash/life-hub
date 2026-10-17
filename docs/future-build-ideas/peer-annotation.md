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

1. **Write.** As now: code, symbol, write, hand it in.
2. **Swap.** Each piece goes to the next two people round a shuffled ring. Everyone gives two and gets two, and never their own. It needs at least three pieces in the swap.
3. **Give (twice).** The student sees one piece at a time ("1 of 2"):
   - Tap a sentence to highlight it. Phones make drag-selecting miserable, so tapping is the default and dragging only fine-tunes it.
   - Tap a feedback button. Some buttons ask for a short word or phrase ("Should be: ___").
   - Optionally add a short comment.
   - **Send**, then the second piece.
4. **Hand back.** The teacher sees every piece with both layers before releasing them, the same as now.
5. **Get back.** The writer sees their writing with two coloured layers (each in the reviewer's symbol colour) and a toggle for each. A one-line summary sits on top, e.g. "2 × Needs evidence · 1 × Great quote". Tapping a highlight opens the note, including any resource Adam attached to that button.

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
- Writing is split into paragraphs, then sentences. Paragraphs act as the annotation block's stanzas and sentences as tap targets.

## Decided

- **2026-10-17:** Resources on feedback buttons are set by Adam in the block setup. Students never add links or videos.

## Open questions

- **Codes per block or a bank?** One bank reused across lessons, with each block choosing which buttons to show, avoids rebuilding the same buttons every lesson.
- **Prose only, or poems as well?** Prose is the main case. Poems already fit the stanza and line model.
- **Must every highlight carry a code?** Code-first keeps feedback useful and kind. A free comment without a code is the escape hatch.
- **Absences.** If a reviewer is away, the writer gets one layer. Can the teacher reassign the missing review, or review it themselves as a third layer?
- **Odd small groups.** With fewer than three pieces, fall back to one reviewer each.
- **Limits.** A cap on highlights per piece (say 6) stops a reviewer from painting the whole thing.
- **Teacher layer.** Should the teacher be able to add a third layer before handing back?

## History

- **2026-10-17:** Created from Adam's idea while reviewing the peer feedback block (PR 896). Resources-by-teacher decision recorded.
