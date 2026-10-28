# Thinking Toolkit sleeves: build plan

**Date:** 29 October 2026
**Branch:** `claude/toolkit-sleeves` (worktree `../life-hub-toolkit-sleeves`)
**Mockup:** [`docs/mockups/toolkit-sleeve.html`](../../mockups/toolkit-sleeve.html) (approved direction, 29 Oct)
**Delivery:** one PR. Each phase below is one commit. The gate runs once, at the end.

## The problem

Each toolkit card (16 skills, 12 tools, 9 values) is its own block. A Clarity card has eight separate parts: a banner, a row of all nine values, a "What to do" box, three probe accordions, a task, Show model and In discussion. The task students actually answer comes fourth. The card also sets its own task ("answer this clarity question"), when a value really applies to *any* question.

## The idea

A **sleeve** is a toolkit item laid over a question or activity students are already doing, like a coloured reading overlay. It sets no task of its own. It shows how to do the host task well and how to check it.

- **Closed:** one strip above the host prompt, made of the chip, the goal line, progress ("2/3 checked") and Show how. The host block gets a coloured left edge, and its answer box gets a tint: orange for values, navy for tools, the navy and orange stripe for skills.
- **Open:** three explicit-instruction steps that look the same on every item.
  1. **See it.** One sentence on what good looks like. Show example reveals a weaker version next to a stronger one.
  2. **Do it.** One move, plus tap-to-insert sentence starters.
  3. **Check it.** Three ticks students check against their own work.
- **Levels:** Support and Extend. The steps are the same; the wording asks more at Extend.
- **Stacking:** up to two sleeves on one block. Only one is open at a time.

## Architecture: a sleeve is a lens

The lens system already does what we need: optional thinking attached to any block (`block.lenses`, `src/blocks/lenses/`, attached through `renderBlock`). Adam's rule from PR 1013 holds: **no new block type and no new menu button.** Sleeves are lens registry entries with their own presentation.

| Piece | Where |
|---|---|
| `SleeveLens` type: `kind: 'sleeve'`, `toolkitId`, `levels: ['support','extend']`, `content(level, overrides)` | `src/blocks/lenses/types.ts` |
| `sleeveLens(item)` factory: storage, read/write via `attachments.ts`, `canAttach` = `canHaveKaplanQualifier` minus the toolkit and thinking blocks themselves | `src/blocks/lenses/sleeve-lens.ts` (new) |
| Sleeve content for all 37 items: see / weaker / stronger / do / starters / checks, at each level | `src/toolkit/sleeves/{values,tools,skills}.ts` (new) |
| Sleeve view: strip, three steps, level switch, ticks saved in activity state, print layout | `src/blocks/lenses/sleeve-view.ts` (new) |
| Host tint: `renderBlock` adds `has-sleeve sleeve--value|tool|skill` to the wrapper and puts the sleeve above the prompt (the same spot stepped lenses use for one-question sets) | `src/blocks/render.ts` |
| Styles | `src/styles/sleeve.css` (new), then `node scripts/generate-block-css.mjs` |
| Registry: a `SLEEVE_LENSES` list beside `STEPPED_LENSES`; `attachedSleeves(block)` | `src/blocks/lenses/registry.ts` |
| Picker group **Thinking toolkit** with Values, Tools and Skills subheads, plus a start level and per-block overrides of Do it and the checks | `src/blocks/lenses/lens-editor.ts` |
| Schema: sleeve config `{ level, student_level, do?, checks? }` | `src/schemas/lens.ts` |

The stepped walk (`stepped-view.ts`) stays as it is for Kaplan, Windows & Mirrors and the rest. Sleeves get their own view because they open in place and never walk students through screens.

## Phases (one commit each)

### 1. Sleeve lens and view
- Add the type, factory, registry list, view, host tint and CSS.
- Starters insert at the cursor in the host's answer box. That box is the response textarea of a `short_answer` or a one-question `question_set`. A block with no answer box shows the starters as plain text, with no tap.
- Ticks and the student's level save through `saveActivityState`, keyed `lesson.block.sleeve.<id>`.
- Print: a closed strip plus the three checks as tick boxes.
- Unit tests for read/write/remove, the two-sleeve limit, one-open-at-a-time, and starter insertion into each host type.

### 2. Content for all 37 items
- Written into the data files by Claude during the build. Nothing is generated at runtime, so there is no AI cost.
- Build each item from what `library.ts` already holds: value probes, skill steps and checks, tool prompt, sentence and example.
- Rules from Adam's earlier calls:
  - Examples use texts students already know (Hunger Games), never a set text.
  - Checks say what students *can* do. No "without / not / never / rather than".
  - No meta openers in example sentences.
  - Australian spelling.
- Content test: every item has both levels, one Do it, 2–3 starters and exactly three checks, and passes the deficit-word and meta-opener filters.

### 3. Teacher view
- The picker gets a **Thinking toolkit** group listing all 37 items.
- Setup sets the start level and whether students may switch level (default on, as with lenses). Do it and the three checks are editable per block, and blank falls back to the library text.
- Teacher-mode extras sit in a fold under the sleeve: the definition, In discussion ask, and the library teacher note. Students never see these.

### 4. Retire the old toolkit blocks from authoring
- `toolkit_skill`, `toolkit_tool` and `toolkit_value` leave the insert menu and Ann's insertable list. Existing blocks keep rendering, with no data migration.
- In teacher mode an old toolkit block gets **Turn into a sleeve**, which:
  - attaches the item as a sleeve on the next question or activity block below it
  - carries over the block's model text as the Support example
  - removes the old block after the teacher confirms.
- `thinking_move`, `question_quadrant`, `concept_features` and the analogy blocks are untouched in this build.

### 5. Ann attaches sleeves
- `block-recipes.ts` gets a sleeve recipe: attach `{ id: 'sleeve:value:clarity', config: { level, student_level: true } }` to an existing block, and never insert a toolkit block.
- Regenerate the runtime with `node scripts/generate-teaching-ai-runtime.mjs`.
- No live Ann run in this PR. One would cost money, so Adam gives the go-ahead first.

### 6. Verify and ship
- Regenerate the block CSS and the AI runtime, then run `npm run pre-pr-check`.
- Walk the dev mock at desktop and 390px:
  - Clarity on the Bode short answer
  - Distinction on a question set
  - Justify on a short answer with lines
  - two stacked sleeves
  - starter insertion
  - ticks surviving a reload
  - print preview
  - Turn into a sleeve on an old Clarity block
- Open the PR ready for review with auto-merge (merge commit).

## Decisions made in the mockup (Adam can overturn any)

1. **Two levels, Support and Extend.** Students see *More help* and *Stretch*, matching the lens labels. Stepped lenses have three levels, but a sleeve's job is quick, so Core is dropped.
2. **No Write it down step.** Students write in the host block's answer box. The sleeve only scaffolds and checks.
3. **The row of all nine values and In discussion leave the student view.** They move to the teacher fold.
4. **Old toolkit blocks are not migrated automatically.** The teacher converts them one at a time, because only the teacher knows which question each belongs to.

## Out of scope

- Highlighting the student's own text (for example, underlining vague words under Precision). This could come later as an Extend feature.
- Converting `thinking_move` into stacked sleeves.
- Tasks and Professional menus. They share the engine, so sleeves work there, but neither hub offers them in its picker yet.

## Failure modes to check

- **Sleeve sits under the answer box instead of above the prompt.** The `renderBlock` attachment path puts things *after* content for most blocks. Check every host type puts the sleeve above the prompt.
- **Tint fights host colours.** `callout` and `hinge_question` have their own backgrounds. The tint applies only to the answer area, never the whole block.
- **390px overflow.** The steps stack, the goal line wraps under the chip, and the page never scrolls sideways.
- **Two publish-strip filters** (hinge question gotcha): sleeve teacher notes must be stripped by *both* `netlify/functions/_shared/teaching-student.mjs` and `apps/teaching/src/blocks/visibility.ts`.
