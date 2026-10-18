# Discern: a qualifier for testing your own position

A removable qualifier, like the Kaplan qualifiers, that attaches to an existing teaching block. It takes Ignatian discernment and turns it into four short steps a student works through before answering, plus a Confirm card later in the lesson. Each step records a few words and a dot showing how settled the student feels. The dots make a small line graph, the "tail", which students copy into their books.

**Status: concept, mockup only.** Open [`mockup.html`](mockup.html) in a browser. Use the Student / Teacher toggle and the "Try" picker to see the same qualifier tailored to five kinds of question. All class data in the mockup is invented.

## Where it comes from

Ignatius of Loyola's *Spiritual Exercises* (1548). Discernment reads inner movements, being drawn towards or pulled away, as evidence, and makes a choice in steps:

- **Freedom first.** Notice what you already want the answer to be before weighing anything.
- **Weigh both sides**, against as well as for.
- **Step outside yourself.** Judge as if the choice were not yours.
- **Confirm.** Live with the choice for a while and notice whether it stays settled.
- **The serpent's tail.** Judge a line of thought by where it ends up, not by how good it felt at the start.
- **The 1539 deliberation.** The first Jesuits argued only against a proposal in one round and only for it in the next, so no one took a side early.

All religious language is dropped. Students see drawn towards / pulled away, settled / uneasy.

## How it differs from Kaplan

Kaplan's icons look at the **content**: patterns, ethics, multiple perspectives in the material. Discern looks at the **student**: what is pulling on them, whether their judgement is free, and whether it holds up after they have written the answer. Features that keep it distinct:

1. Naming the pull behind the initial answer before any evidence
2. Arguing against before arguing for, on the student's own position
3. Stepping back to judge the two arguments as if neither were theirs
4. Feelings recorded as data (the settled scale)
5. A Confirm step after the task, not beside it: the qualifier wraps around the activity

## The steps

| Step | What the student does | Dot label |
|---|---|---|
| **Initial** | Taps (or writes) an initial answer, then names what is pulling them towards it | The pull, e.g. "Endings should be hopeful" |
| **Against** | Strongest case the initial answer is wrong, using one piece of evidence | The case against |
| **For** | Strongest case it is right, using different evidence | The case for |
| **Step back** | Sees their Against and For notes side by side; judges them as if neither were theirs | Where they now stand |
| **Confirm** | On the linked Confirm card, after writing the answer: is the pull still holding the answer up, or is the evidence? | Final position |

Each step: a jot box (32 characters, which becomes the dot label) and a five-point uneasy to settled scale. After Step back the student sees the tail with four dots and copies it into their book. Confirm adds the fifth dot and a reading of the shape: tested and came back, against stuck, rose, ended lower, flat, wandered. The reading points at where to look, never at whether the answer is right.

## Confirm card

Attaching Discern adds a Confirm card straight after the block, linked back with the same `target` mechanism extension callouts use (`apps/teaching/src/blocks/callout-reference.ts`). The teacher drags it later in the lesson, usually to the end. Student writing does not survive closing the tab, so Confirm must happen in the same lesson. If the earlier dots are lost, the card tells the student to add the last dot in their book.

## Teacher tailoring

- **Whose position:** the student's own answer, or **someone else's choice** (a character or historical figure). In the second mode the prompts flip to "their choice", the initial jot is what pulled *them*, and Confirm asks whether the student judged the choice or their feelings about the person. The settled scale stays the student's own confidence, so graphs and class spread work the same in both modes.
- **Focus:** what is being judged. It fills every default prompt.
- **Evidence source:** optional ("the poems", "Source B"). Against and For ask for one moment from it.
- **Initial answer type:** Scale (presets Agree, Extent, Effectiveness, Verdict, all editable), Choose (two to five teacher options) or Write. Suggested from the question wording ("to what extent" gives Extent, "which" gives Choose).
- **Step prompts:** defaults, each editable.

## Teacher class spread

Anonymous: no names, ever. Every tail drawn faintly on one graph.

- **Dot labels:** the teacher also sees the students' anonymised dot labels, so a dip at Against comes with the reasons ("Anger is louder than hope"), not just the drop. For example, tap a step to list that step's labels for the highlighted tails.

- **By shape:** chips with counts that highlight those tails; which step shook the most students; how many barely moved; how many finished uneasy.
- **By initial answer** (Scale and Choose only): tails coloured by initial answer, with a table of students per answer, how many were shaken by Against, how many finished uneasy and the most common shape.
- The Confirm card shows where the class's final dots landed.

This needs a small anonymous submission of five dots, five labels and the initial answer per device. Block pulse (`apps/teaching/src/blocks/block-pulse.ts`) and question drop already do anonymous per-device submission and can be the pattern.

## Decisions (18 October 2026)

- **Blocks:** the same blocks as Kaplan for now (`canHaveKaplanQualifier`).
- **Kaplan and Discern together:** a block can carry both. Keep it to a few attachments per block so it does not get busy; this is the teacher's call, not a hard limit.
- **Dot labels in the class spread:** yes (see above).
- **Print mode:** not needed for now.
- **Character's own tail:** yes, as an optional setting the teacher turns on (see below).

## Character's own tail (optional setting)

Available in "someone else's choice" mode. Instead of plotting the student's own settledness across the four steps, the x-axis becomes key moments in the text and the student plots how settled **the character** is at each one, with a few words of evidence as each dot's label. Macbeth's wavering, from the witches to the dagger soliloquy to after the murder, becomes a line.

- The teacher sets the moments (three to six), e.g. "Act 1 Scene 3", "Dagger soliloquy", "After the murder".
- Same graph, same "copy into your book" step, same anonymous class spread, so the teacher can see where the class reads the character as most and least settled.
- Not just different wording: the x-axis and the teacher-set moments are new, so this is its own slice.
- Open: does it replace the four steps for that block, or follow them as an extra?

## Related thought: Ignatian Pedagogical Paradigm as a lesson shape

Jesuit schools turned the Exercises into a lesson shape: **context, experience, reflection, action, evaluation**. It could become a lesson shape or template in the teaching hub, separate from the Discern qualifier. Keep in mind; nothing decided.

## History

- 18 October 2026: concept and mockup.
- 18 October 2026: decisions on blocks, Kaplan pairing, dot labels and print mode; character's own tail added as an optional setting; Ignatian Pedagogical Paradigm noted as a possible lesson shape.
