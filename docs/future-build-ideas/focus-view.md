# Focus view: one step of the lesson at a time on the board

A **Focus** mode inside the teacher's Display view (`apps/teaching/src/teacher/lesson-display.ts`). Today Display renders every block in one long scrolling column, so on a projector the text is small, the teacher scrolls in front of the class and students read ahead. Focus mode walks the lesson one step at a time, each step scaled up to fill the screen, like a slideshow, Prezi or Pear Deck.

**Status: built (22 October 2026).** Code: `apps/teaching/src/teacher/focus/`, the hinge back-up in `netlify/functions/_shared/hinge.mjs` and `hinge-backup.mjs`. Mockup: [focus-view/mockup.html](focus-view/mockup.html); every count, delay and generated question in it is simulated.

## Adam's asks

- Go through the lesson one block or part at a time, the current part the biggest thing on screen.
- Classroom tools (timer, groups and the rest) need a place in it.
- One design feature that makes it look amazing, and one learning feature that makes it a great mode.
- A hinge question that goes badly should lead to a fresh, similar question, not the same one again, even when no back-up was written.

## How steps are cut

- A **heading** starts a new step; everything after it up to the next heading belongs to that step.
- A **section** block is one step.
- A step holds **one main block** (an activity, a toolkit block, an image, a chart, a column row). A second main block starts a new step and takes the text leading into it. Text, quotes, callouts and dividers ride along with the main block beside them. (Added after Adam saw three tools land in one step because none had a heading.)
- A **multi-column row** always stays together. Adam uses columns to show two related things side by side; splitting them would be silly.
- The lesson hero (title, outcomes, cover) is step 1.

The teacher controls the grouping through how the lesson is built. There is no separate slide editor.

## Navigation

- A **Page / Focus** toggle next to Full screen. Same blocks, same live controls (join codes, open and close, reveal), just staged differently.
- Arrow keys, space, Page Up and Page Down. A presenter clicker sends these, so it works with one for free.
- A progress strip along the bottom: previous, a pill per step, next, and a count.

## Classroom tools

Tools today hang off a divider (the faint gear) or sit in a Tools block, which ties them to a place on the page. In Focus mode:

- **One tools button, always bottom left**, opening the existing tray.
- **Saved timers keep their place.** A divider's saved timer stack marks the step after it with a gold dot on the tools button: one tap to start, never forced onto the screen.
- **Running tools persist across steps.** The timer floats top right and keeps running through step changes and the lesson map. Groups opens as a side drawer that squeezes the stage rather than covering it; with both open, the timer docks at the top of the drawer.
- While a timer runs, a thin bar drains along the top edge of the stage so the back row can read time left without reading the clock. (Mockup only: not built, the toolbox's own timer card shows the time.)

## Design feature: the lesson map

**M** or the **Lesson map** button zooms the current step out into a map of the whole lesson, finished steps ticked, current step outlined. Clicking a card zooms it back up to fill the stage. Built on the browser's View Transitions, so the zoom is cheap. It gives students a sense of the journey and gives the teacher a jump-anywhere view.

## Learning feature: the checkpoint and auto back-up

When a hinge question is revealed under the bar (65% in the mockup, a setting), the next arrow stops at a checkpoint instead of moving on:

- The score and the most common wrong answer, with a one-line reading of the misconception.
- **Explain why C is tempting:** a talking point for the teacher to voice the misconception to the whole class. **No names.** Responses on the board stay anonymous; picking out students who got it wrong makes them stop answering honestly. (An earlier "Ask a C to explain" option was cut for exactly this reason.)
- **Back-up question.** Re-asking the same question tests memory of the answer, not understanding, so the back-up is a **parallel question**: same concept, new wording, same trap.
  - Order: the teacher's own saved back-up first; otherwise Ann drafts one.
  - Ann starts drafting **the moment the reveal comes in under the bar**, in the background, from the original question, the right answer and the vote counts, so it targets the actual misconception. It is ready by the time the re-teach is done.
  - **Generated automatically, shown on the teacher's click.** The teacher previews it in the checkpoint and either shows it on the board or skips it.
  - The preview is on the projected screen, so it **never marks the right answer**.
  - Once used, Ann's question is **saved into the lesson** as that block's back-up, so the next class already has a checked one.
- **Move on:** the teacher's deliberate call.

Cost: one small Ann call, only when a hinge comes in under the bar and no saved back-up exists. Nothing else in Focus mode uses AI.

## Decided when building (22 October 2026)

- **The bar is the hinge block's existing move-on mark** ("Move on at or above", default 80%), set in the hinge settings when building the lesson. Quiz lessons get the same setting in quiz Settings.
- **No private second-screen preview.** Adam pauses the projector, so the back-up preview marks the right answer.
- **Quiz questions and spot the technique get the checkpoint too.** A quiz lesson runs live from focus view, one question at a time, and a question revealed under the mark stops. Quiz questions have no back-up question yet (Ann's back-up writer is hinge-only).

## Not now

- **Students follow the teacher.** Pear Deck's headline feature: students' devices advance with the board. It needs live sync between devices (hosting and build time, not AI cost). Parked; maybe later.

## Open questions

- Which blocks need their own "stage" styling to scale up well? Steps scale with CSS zoom from an 820px layout; charts, whiteboards and annotation are the likely ones to check on a real projector.
- A back-up question for quiz questions, drafted by Ann like the hinge one?

## History

- **2026-10-22:** Built. Adam's calls: build it; no second-screen preview (he pauses the projector); checkpoint for quiz questions and spot the technique too; the bar is set in the hinge settings.

- **2026-10-22:** Concept and mockup. Step rules (heading or section starts a step, column rows stay together), tools dock with persistent timer and groups drawer, lesson map zoom, hinge checkpoint with no-names talking point and Ann's auto back-up (parallel question, previewed before showing, answer hidden in the preview, saved to the lesson). Student follow-along parked.
