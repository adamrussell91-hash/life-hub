# Thinking Toolkit blocks

Lesson blocks for the Newington College Critical Thinking Framework and the Philosophical Community of Inquiry approach.

## The set

| Block | Picker group | What it does |
|---|---|---|
| Thinking intentions | Thinking Toolkit | We are learning / We will think by / Using / Judged for / Working together by / I can. Every item shows a one-line description for students |
| Skill | Thinking Toolkit | One of the 16 skills: description, "What to do", three steps, optional partner check, related tools |
| Tool | Thinking Toolkit | One of the 12 tools, each with a sentence frame and its own layout: distinction fork + word pairs, closed→open questions, statements to test, or steps |
| Value | Thinking Toolkit | One of the 9 values: description, nine-value row, check question with a hint, optional claim to judge |
| Thinking move | Thinking Toolkit | One skill + 1–5 tools in order + one value ("Justifying using reasons, judged for relevance."), one step per tool with a sentence frame, then a value check |
| Question Quadrant | Thinking Toolkit | The quadrant, "What do I need to do to respond?", your stimulus and questions to sort. Starts empty; "Load the Pooh and Piglet example" fills it |
| Features of a Concept | Thinking Toolkit | Central / contestable / common, your concept grid, an optional concept game. Starts empty; "Load the worked example (responsibility)" fills it |
| Thinking reflection | Thinking Toolkit | Progress and process questions; tool, value and community chips fill in from the page |
| Teacher note | Basic | Private rich-text note. Always teacher-only; no visibility picker |

## How a block is built

- **What to do.** Every block except Thinking intentions opens with a student instruction (`guide`). It has a sensible default and is meant to be rewritten for the lesson.
- **Editor layout.** The everyday fields sit at the top. Reveals, related items, reset buttons and rarely used fields sit under **More options**. The teacher note is folded away under **Teacher note**.
- **My notes.** One notes box per block (`teacher_jots['']`). Notes saved per class by the first release still show, labelled with their class.
- **Teacher note.** Collapsed by default in the teacher view. Sections: About, How to run it, Ask, Watch for (plus "What strong participants do" on the reflection). No page references or source tags; `cleanNote` strips them from blocks saved by the first release.
- **Picker.** Items are named Skill, Tool and Value. The skill picker lists the Golden Tetrad (the core four) first; every option shows its description.
- **Thinking move.** Changing the skill, tools or value keeps edited steps for tools still in the chain. The note rebuilds until you edit it; after that it is kept and "Rebuild the note for this move" appears.
- **Sort highlights and reveals persist per device.**

## Where teacher content is removed

- Client: `filterBlocksForStudent` (`src/blocks/visibility.ts`), used by print and the unit page.
- Server: `filterBlocksForStudent` (`netlify/functions/_shared/teaching-student.mjs`), used by `lesson-publish` and `published-unit`.
- Both drop `teacher_note` blocks (even a stale draft set to students) and remove `teacher_note` / `teacher_jots` from toolkit blocks. Shared fixture: `fixtures/toolkit-teacher-strip.json`.
- Search (`search-text.ts`) never indexes teacher notes or My notes.

## Wording

Item names, the Golden Tetrad, community skills, Cam's eight tool definitions, the Question Quadrant, Features of a Concept, the distinction pair bank, the reflection questions and the procedures come from the Newington framework and the Philosophical Community of Inquiry workshop.

The workshop material names the 16 skills, the 9 values, and the Analogy, Argument, Counterargument and Implication tools without defining them. Their descriptions are plain classroom wording written for these blocks. The same goes for the skill steps, the tool sentence frames, the value check questions and the community-skill one-liners. They are defaults: edit them on the block, or change them here for every new block. No NESA, Paul & Elder or other outside framework wording is used.

Library text is copied into a block when it is inserted; each block can be reset to the current library text.

## Icons

`public/assets/blocks/`: 256px line art in the house stroke, with an orange griffin badge baked in (the picker takes one image). The handbook scans were too low resolution to trace the crest, so the griffin is redrawn as a simple vector in the same pose (wings raised, striped torse). Replace `badge-griffin.png` and re-bake the eight icons if a cleaner crest file is available. Check College brand guidance before any student page is made public.
