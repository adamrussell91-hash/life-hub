# Thinking Toolkit blocks

Lesson blocks for the Newington College Critical Thinking Framework (Jensen, Howe, Timillero, Costantino, Van Arkkels, Marokakis & Parker, 2025) and the Philosophical Community of Inquiry approach. Source: APS NSW *Introductory Workshop handbook* (2026), scanned copy with handwritten notes.

## The set

| Block | Picker group | What it does |
|---|---|---|
| Thinking intentions | Thinking Toolkit | Content intention, thinking intention (1–2 skills, tools, values), community skills, success criteria (handbook p13) |
| Toolkit skill | Thinking Toolkit | One of the 16 skills: item card, numbered steps, partner Test step, reveals, link chips |
| Toolkit tool | Thinking Toolkit | One of the 12 tools, each with its own frame: distinction fork + pair bank, closed→open converter, generalisation stress test, or steps |
| Toolkit value | Thinking Toolkit | One of the 9 values: nine-value row, claim or options, probe-question reveals, model, "In discussion, ask" |
| Thinking move | Thinking Toolkit | One skill + 1–5 tools in order + one value, written as the handbook phrase ("Justifying using reasons, judged for relevance.") |
| Question Quadrant | Thinking Toolkit | Quadrant, "What do I need to do to respond?", questions to sort, closed→open; Procedure 1 or 2 (p17–19) |
| Features of a Concept | Thinking Toolkit | Central / contestable / common, concept grid, analogy warm-up, one concept game, criteria we found (p20–24) |
| Thinking reflection | Thinking Toolkit | Progress and process boxes (p25); tool, value and community chips filled from the page |
| Teacher note | Basic | Private rich-text note. Always teacher-only; no visibility picker |

Every toolkit block except Thinking intentions carries a **Teacher note** (What it is, How to run it, Say it, Watch for, an item-specific section, time and source) and **My notes for this class**.

## Decisions taken

- **Only the Newington framework page (p10).** 16 skills, 12 tools, 9 values. Thought experiment, hypothesise and synthesise are not in the set. Thinking move presets are only the pairings printed in the handbook (p9, p11 and the p9 margin note); a preset sets the skill and tools, and the value stays the teacher's choice.
- **Class notes are per class.** A lesson belongs to a unit and every class running that unit shares it, so notes are stored as `teacher_jots[classId]`; the empty key is "All classes". The editor shows a class picker for classes running the unit.
- **Thinking move compact steps.** One numbered step per tool: the tool's one-line prompt, its sentence frame, and an example to reveal. A final check step lists the value's probe questions.
- **Changing a move after editing its note.** Steps for tools still in the chain keep their edits. The note rebuilds automatically until you edit it; after that your note is kept and a "Rebuild note from library" button appears.
- **Sort highlights persist per device**, the same as reveals.
- **Teacher callout** now uses the same dashed orange frame as teacher notes. Every teacher-only block gets that frame in the teacher view, which fixes the old "teacher-only looks identical" gap.
- **Library content is copied in.** Each section has "Reset to library version".

## Where teacher content is removed

- Client: `filterBlocksForStudent` (`src/blocks/visibility.ts`), used by print and the unit page.
- Server: `filterBlocksForStudent` (`netlify/functions/_shared/teaching-student.mjs`), used by `lesson-publish` and `published-unit`.
- Both drop `teacher_note` blocks (even a stale draft set to students) and remove `teacher_note` / `teacher_jots` from toolkit blocks. Shared fixture: `fixtures/toolkit-teacher-strip.json`.
- Search (`search-text.ts`) never indexes teacher notes or class notes.

## Source rule

Every word in the library (`src/toolkit/library.ts`) and the block defaults (`src/toolkit/content.ts`) comes from one of two places:

- the APS NSW *Introductory Workshop handbook* (2026), including Adam's handwritten notes on the scan;
- the Notion page "Philosophical Community of Inquiry Workshop" (typed workshop notes).

Nothing is drafted, and nothing is taken from NESA, Paul & Elder, Ellerton's wider work or any other source. Where the sources say nothing, the field is left empty for the teacher to fill on the block. Do not fill gaps with outside wording.

What the sources give:

- **Definitions:** only Cam's eight tool definitions (p9): Question, Suggestion, Reasons, Distinction, Example, Counterexample, Generalisation, Criteria. Skills, values, and Analogy, Argument, Counterargument and Implication have no definition, so their cards show the name only. The framework page (p10) lists items without defining them.
- **Skill–tool pairings:** p9 "Tools in Use", the p9 margin notes (reasons → justifying, distinctions → comparing) and p11 (classify, then divide).
- **Golden Tetrad:** p12.
- **Classify steps:** the Notion notes (Classification and Division).
- **Analogy steps:** the Notion notes ("Is a leader more like a compass or a map?") and the p20 frame.
- **Distinction:** the p11 procedure and pair bank.
- **Question:** the p17 Pooh and Piglet converter pairs and the Notion closed/open notes.
- **Question Quadrant:** p17–19, quoted.
- **Features of a Concept:** p20–24, quoted.
- **Reflection:** p4 and p25.
- **Community skills:** p12.
- **Values:** the p10 handwritten "To judge quality of thinking" and "Use for tailored feedback", the p11 question and the p25 question.
- **Teacher notes:** only these quotes and handwritten notes. There are no invented timings, stems or "I do / We do / You do" steps.

Blocks inserted before this change keep the text they were created with (library text is copied in). Use "Reset to library version" on a section to replace it with the source-only text.

## Icons

`public/assets/blocks/`: 256px line art in the house stroke, with an orange griffin badge baked in (the picker takes one image). The handbook scans were too low resolution to trace the crest, so the griffin is redrawn as a simple vector in the same pose (wings raised, striped torse). Replace `badge-griffin.png` and re-bake the eight icons if a cleaner crest file is available. Check College brand guidance before any student page is made public.
