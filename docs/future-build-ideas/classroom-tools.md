# Classroom tools block (Teaching Hub)

A small toolbox for the live lesson: timer, name picker, random number and similar. It lives on a **divider** as a faint gear, or as its own **Tools block**. You tap the gear, the tool chips slide out along the line, you pick one, and the tool opens clearly in that space. On a divider it opens in the gap between the two blocks. As a block it takes the block's slot.

It is a concept doc, not a build brief. Nothing builds from it until Adam names a slice. Mockup: [classroom-tools/mockup.html](classroom-tools/mockup.html).

## Adam's asks

- A **subtle gear or toolbox icon** on the divider that slides out a row of tools.
- Picking a tool **pops it up nice and clear** in that space: between two blocks for a divider, or in its own slot for a block.
- It is its own block as well as a divider option.
- **Timers stack.** For example "Reading time" then "Writing time", running one after the other.
- A **random name picker** and a **random number generator**.
- **Class lists live on the class.** Each class has a section for its student names. The name picker just needs you to choose the class.

## What the mockup shows

| Tool | Behaviour |
|---|---|
| Timer stack | A list of named timers, each with minutes. A segmented bar shows the whole stack, one colour per timer. It moves straight into the next timer with a chime and a flash. Start or pause, Next, Reset, +1 min, add or remove timers |
| Class Students section | Each class has its own list, typed or pasted once (one per line, or a spreadsheet column). Edits show up in the picker straight away |
| Names | Opens on this lesson's class, with a dropdown for any other class. Spins through that class's list and lands on one name. "Don't pick the same person twice" is on by default, with a count of who is left and a "Put everyone back" button |
| Number | From and to, Roll, optional no repeats, a short history |
| Groups | Same class dropdown. Groups of N from that class, each group in its own colour |
| Dice | One to four dice with a total |

Each open tool has a full-screen button for the projector, and a close button that folds the space back.

## What already exists to build on

| Piece | Where | Use here |
|---|---|---|
| Divider block (empty `content`, renders an `<hr>`) | `DividerBlockSchema` in `apps/teaching/src/schemas/block.ts`, `renderDividerBlock` in `blocks/render.ts` | Add an optional `tools` setting to the divider rather than a new block, so existing dividers are unchanged |
| Block registry and meta | `blocks/registry.ts`, `blocks/block-meta.ts` | The standalone Tools block registers here |
| Class record (no student list today) | `ClassSchema` in `apps/teaching/src/schemas/class.ts` | Add an optional `students` list to the class, edited in a Students section of class settings |
| Visibility rules | `blocks/visibility.ts` | Tools show in teacher and present views. Students see the timer and dice only |

## Decisions (17 Oct 2026)

- **Divider and block: both.** The divider carries an optional tools setting, and a separate Tools block reuses the same component.
- **Student names live on the class.** Each class has a Students section. The name picker and groups tool choose a class from a dropdown. These are real students' names, so they stay in the hub's private data store and never go in the public repo, tests, fixtures or build assets. Who was picked is not saved.
- **Timer stacks are saved with the lesson.** The author presets the stack (for example Reading 5, Writing 10) and it is ready when the lesson opens.
- **Students see the timer and dice only.** Names, groups and the number picker are teacher-only. The Students section is teacher-only too. The mockup's "View as" switch shows both views.

## Open questions

- **Just names, or more?** A student list could later hold a preferred name or a "skip in picker" flag (for example, a student away for the term).
- **Student timer:** does a student run their own copy of the saved stack, or follow the teacher's running timer live?
- **Which other tools?** Candidates: traffic light (work, quiet, stop), think-pair-share prompt, coin flip, noise meter (needs the microphone), seating shuffle, "who's next" queue.
- **Sound:** chime on by default, with a mute switch?

## History

- **2026-10-17:** Adam settled four questions: divider and block both, names on the class, timer stacks saved with the lesson, students get timer and dice only. Mockup gains a Teacher/Student view switch.
- **2026-10-17:** Class lists move onto the class: a Students section per class, and the name picker and groups tool choose a class from a dropdown.
- **2026-10-17:** First draft and working mockup: divider and block hosts, stacked timers, names, number, groups, dice.
