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

## Fluid analogy blocks

Fluid analogising from the 2025 ETA NSW workshop *Stretch Without Stress*: seven types of analogy, each at three levels, as lesson blocks. They sit in their own picker group, **Analogous Thinking**, after the Thinking Toolkit. They use the toolkit frame (What to do, reveals, teacher note, My notes) in marine, with no griffin: they are not part of the Newington framework.

| # | Type | Operation | Deck card |
|---|---|---|---|
| 1 | Analogical Close Reading | Basic relational mapping | Leaflink |
| 2 | Pattern Translation | Cross-domain structure recognition | Sparkweave |
| 3 | Reverse Analogising | Evaluative monitoring | Mindmirror |
| 4 | Analogical Problem Solving | Cross-domain solution transfer | Ironroute |
| 5 | Metaphorical Analysis | Conceptual mapping and implication tracing | Glimmsprite |
| 6 | Conceptual Transfer | Rule-based generalisation | Flowstride |
| 7 | Analogical Chains | Multi-step relational integration | Scalepath |

### The three levels

The prompt-card deck was designed with three levels per card; only Level 1 was printed. Levels 2 and 3 are written here from the teacher guide's ways to differentiate (depth of mapping, distance of the comparison, evaluating the limit, use in formal writing) and its rubric.

| Level | Name | Asks for |
|---|---|---|
| 1 | Make it | One comparison and one reason. The card's own task |
| 2 | Explain it | How the two work alike (at least two links), where the comparison stops, and what that shows. The *Seven Ways to Build Strong Analogies* lesson |
| 3 | Use it | A more distant comparison turned into a point about the text, with its limit weighed. Examples are the extended responses in the Fluid Analogising protocol |

### The blocks

| Block | What it does |
|---|---|
| Fluid analogy | One type. A level switch (Level 1 · Make it, Level 2 · Explain it, Level 3 · Use it), then the level's task, two or three numbered steps each with its sentence frame, and two buttons: **Show an example** and **Check your analogy**. Optional "Working with" focus. About half a printed page |
| Analogy types | The seven types, the three levels, a weak and a strong analogy, the five-step process and the check. The teacher marks the types in play this lesson. For introducing fluid analogising |

- **Levels.** The teacher sets the starting level. By default students can move between levels themselves (same task, different depth); untick "Students can move between levels" to lock it. A student's choice is remembered on their device. Print shows the starting level only.
- **Editing.** "Wording for each level" edits one level at a time. Changing type keeps the focus, level settings, check settings, My notes and an edited teacher note; the three levels take the new type's wording.
- **No right answers.** There is no right analogy, only more and less productive ones. Nothing in these blocks marks an answer; the check asks students to judge their own.
- **Card names** show only when "Show the prompt-card name" is ticked, for classes using the printed deck.
- **Teacher content** is stripped exactly like the toolkit's: `fluid_analogy` and `analogy_types` are in the teacher-field sets in `src/blocks/visibility.ts` and `netlify/functions/_shared/teaching-student.mjs`, and in the shared fixture.
- Library: `src/toolkit/analogy.ts`.
