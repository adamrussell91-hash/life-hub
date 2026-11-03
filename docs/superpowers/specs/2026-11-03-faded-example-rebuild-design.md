# Faded example rebuild: design

Date: 3 November 2026
Status: for Adam's review. Nothing is built.
Mockup: private canvas, https://claude.ai/artifact/4KuACiv76hp9x2dmPTJKhL

## Why

The `faded_example` block is called a faded example, but one block holds one step. Used alone, it is a fill-in-the-gap with a self-rating. Nothing in the block fades.

| What the research supports | What the block does now |
|---|---|
| A sequence, from a full example to the student doing it all | One block holds one step. Stacked blocks are drawn as a run, and only Ann's tutorial recipe describes a progression. |
| Fading from the last step backward | Nothing suggests or checks an order. |
| Prompting students to explain the steps they are given | Given parts are only there to read. |
| Responding to how the student is doing | "Got it" and "Not quite" both move on, and the answer locks. |
| Comparing against a standard broken into its elements | One model paragraph, then a self-rating. Any text passes Check. |

## Goal

One block teaches one skill across several new extracts, and hands over one more part at each step until the student writes the whole answer. Students judge their own writing against named criteria, and can improve it, before they see the model.

## Evidence and its limits

- **Sequence and backward fading:** Renkl and Atkinson; Atkinson, Renkl and Merrill 2003. The fade order rests on a secondary summary, so check the paper if the order is ever disputed.
- **Prompts for transfer:** Atkinson et al. 2003, also through a secondary summary. Fading alone mainly helped near transfer, and prompts added far transfer.
- **Adaptive fading:** Salden et al. 2009, as reported by Otieno et al. 2011 (d = .49 immediate, .59 delayed). This is why a second pass is planned.
- **Standards broken into elements:** Nederhand et al. 2018. It tested definitions with university students, so a checklist may do less for interpretive writing.
- **The subject gap:** most of this comes from structured subjects. Worked examples have helped with English literature essays (Kyun, Kalyuga and Sweller 2013) and legal reasoning (Nievelstein et al. 2013), but those studies did not test fading. Applying fading to What/How/Why is an inference.

## What students do

### Step types

**A worked step** has no blanks. All parts show, with one question about why the example works. The student taps an answer and can try again until it is right, then moves on. In the mockup the question is "What is the Why doing that the How is not?"

**A writing step** has one or more blanks and runs in this order:

1. **Write.** Shown parts sit beside empty boxes for the blank parts.
2. **Check.** This needs a real attempt (see below). The boxes lock.
3. **Tick.** The student ticks what their answer does against the criteria for each part they wrote. The model stays hidden.
4. **Improve or reveal.** "Improve mine" reopens the boxes and returns to Write. "See the model" is always available after Check. The primary button is "Improve mine" until everything is ticked, then "See the model".
5. **Model.** The model shows under each answer. The boxes and ticks lock, and the student moves on.

### The sequence

- A rail shows each step and what the student does in it.
- One step is open at a time. Later steps stay locked until the earlier ones are finished, so the fade can't be skipped. Finished steps reopen read-only.
- The block ends by showing the student's final answer and saying they wrote it themselves.
- A block with one step shows no rail, and the editor recommends adding steps.

### A real attempt

Check needs at least five words in each box. A keyboard mash with fewer words gets "Write a full sentence in each box, then check it."

A longer mash is harder to catch. Two cheap signs prompt "Is that what you meant to write?": a run of four or more of the same letter, or a very high average word length. A second press of Check goes through, because a false block on real writing is worse than a mash getting through. The tick stage and the teacher's board are the real check.

## What the teacher does

One editor builds the whole block:

- **Question** and **part labels**, for example What, How, Why. The default labels stay Technique, Where, Effect. Parts can now be added, removed and renamed, up to the existing limit of four. The current editor can't do this.
- **Steps**, each with its own extract and a model answer for every part. New blocks start with four steps.
- **Which parts are blank.** Filled in automatically from the last part backward, one more per step. Pills per step show "shown" or "student writes", and the teacher can override them.
- **Worked step question:** a prompt and answer choices with one marked correct.
- **Criteria:** one short list per part, used on every step.

The editor warns, without blocking, when:

- a later step asks for less than an earlier one
- two steps use the same extract
- the first step is not fully worked
- a worked step has no question

Publishing is blocked when a step has no extract, a part has no model answer, or a blank part has no criteria.

## Data

Same `block_type`, new content shape:

```ts
content: {
  prompt: string;                 // max 300
  part_labels: string[];          // 1 to 4
  steps: Array<{                  // 1 to 6
    id?: string;                  // absent only on converted old blocks
    prompt?: string;              // only if this step's wording differs
    extract: string;              // max 2000
    answers: string[];            // one per label, each max 600
    blanks: number[];             // indexes into part_labels
    question?: {                  // worked steps only
      prompt: string;
      choices: string[];          // 2 to 4
      correct: number;
    };
  }>;
  criteria: Record<string, string[]>;  // by part label, 1 to 4 items
  gate?: boolean;
}
```

### Existing blocks

The schema reads the old shape (`extract`, `parts`, `blanks`) and converts it to the new one, so nothing breaks and published lessons keep working:

- The old block becomes a one-step block whose step has no id, and **a step with no id uses its block's id as its key**. Saved answers in tutorial storage and the browser are keyed by that id, so they still resolve. Every reader goes through one helper, because the tutorial player renders stored lessons without parsing them.
- Blank parts get generic criteria the teacher can edit: "Answers the question", "Uses words from the extract", "Says what those words show".

A one-off back-fix then folds runs of adjacent old blocks into one block, setting each step's id to its old block id and keeping any differing prompt on that step. It reports a dry run first and needs Adam's go-ahead before it writes. Blocks separated by a side path or With teacher are not adjacent, so they stay separate. `groupFadedRuns` and its rail code go once the back-fix has run.

## How it connects to the rest of the app

**Saving.** Each step saves its stage, text, ticks and chosen answer under `storageKey('local', step.id)`, as blocks do now. Outside tutorials, work stays on the student's device.

**Lecture player.** The whole block is one gate, and it fires `emitAnswered` once, when the last writing step finishes. The result is `right` if everything on that step is ticked, otherwise `wrong`. An If wrong side path therefore plays at the end of the block rather than after each step. A block with no writing steps is not a gate, as now.

**Tutorials.**

- `FADED_EVENT` fires when a writing step reaches its model, and carries the step id. The rating sent is `right` if all ticked, otherwise `wrong`, so stored answers keep their shape.
- `tutorial.mjs` accepts step ids as well as block ids in its own-group check (`ownIds`) and stores answers by step id.
- The live board's `fadedColumns` lists writing steps rather than blocks, with one column per blank part. Text and the wrong-answer tint work as now.
- Ann's recipe changes. We do becomes one faded example (full, one blank, two blanks) followed by its "A second look" side path and With teacher. You do is a second, one-step block on a new extract. The worked question and criteria become required output.

**Class display.** It keeps showing the student view (`STUDENT_VIEW_ON_DISPLAY`), so models stay hidden until revealed. The rail is unlocked there so the teacher can move through steps.

**Other block code to update:**

- `create-block.ts` (default content)
- `search-text.ts` (all steps)
- `publish-block-issues.ts`
- print view: all steps, with empty space for blanks
- generated bundles: `scripts/generate-alchemy-schema.mjs` and `scripts/generate-teaching-ai-runtime.mjs`
- the block-text baseline, regenerated

**Small fix.** The box inherits the app's font. It shows a typewriter font today because `.block-faded__input` sets no font.

## Not in this build

Second pass, once this has been used with a class:

- **Adaptive steps:** another extract at the same level when a student leaves criteria unticked, and a way past a level for students who show they have it. This is the strongest evidence not yet used, but it means writing extra material per block.
- **AI checking of written answers:** the marking from PR 1270 could read these. It costs money per answer, so it would need its own cost estimate and approval.

Also left out: sending this work to the markbook or To mark queue.

## Decisions for Adam

Each has a default, which the build uses unless changed.

1. **Tick stage before the model.** Default: yes, as in the mockup. The alternative is showing the model and criteria together, which is quicker but makes improving your answer closer to copying it.
2. **Locked later steps.** Default: locked for students, unlocked on the class display. The alternative is free movement, which lets students skip the fade.
3. **Work outside tutorials.** Default: stays on the student's device, as now, so the teacher can't see it. The alternative is saving it to the server for teachers to read, which is a larger build.

## Build order

One PR, with each phase a commit, from a new worktree off `main`.

1. Schema, conversion of old content, generated bundles, default content and publish checks.
2. Student view: worked and writing steps, rail, saving, final screen, attempt check.
3. Editor.
4. Lecture gate, tutorial events, server, live board, Ann's recipe.
5. Dry-run back-fix. The real run waits for Adam's go-ahead.

Before phase 5 is written, count the real faded example blocks and side paths in the private data, so the back-fix matches what exists.

## Testing

- **Schema:** the old shape converts with step ids kept; limits and blank indexes are enforced.
- **Student view:**
  - The wrong worked answer retries, and the right one moves on.
  - Check refuses a short answer. The mash prompt lets a second press through.
  - The model stays hidden until revealed.
  - Improve keeps the text and returns to Write.
  - A restored step returns to its saved stage.
- **Later steps:** locked for students, unlocked on the display.
- **Lecture:** the gate fires once, with the right result, and the side path plays on `wrong`.
- **Tutorial:** answers from an old block and a new step both show on the board; another group's step id is rejected.
- **Publish:** each blocking rule; the warnings don't block.
- **Run only:** the affected teaching tests and `tests/unit/tutorial-publish.test.js`. This change shouldn't trigger grove or the full Tasks suite.
- **Walk on the live site after merge:** student, editor, lecture, tutorial and display, at desktop and 390px, plus Safari.
