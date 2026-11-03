# Faded example rebuild: implementation plan

> For agentic workers: run this as four chunks, in order. Agents do not commit, and do not run tests per task. Chunk 4 runs the gate once. Per Adam's token-saving rule, chunks give signatures, behaviour and test cases; only the data layer is written out in full.

**Goal:** One `faded_example` block teaches one skill across several extracts, handing over one more part per step, with criteria ticked before the model shows.

**Spec:** `docs/superpowers/specs/2026-11-03-faded-example-rebuild-design.md`

**Architecture:** Same `block_type`, new content with `steps`. Every reader goes through `fadedContent()`, because the tutorial player renders stored lessons without parsing them. Old content converts on read. A step's storage key is `step.id ?? block.id`, so old answers still resolve.

**Tech:** TypeScript, zod 4, vitest, plain DOM rendering.

**Setup:** New worktree from `origin/main`, branch `claude/faded-example-rebuild`. Copy this plan and the spec across, as they are uncommitted in `life-hub-quiz-initials`. One PR, ready for review, with auto-merge once the gate passes.

**Does not touch:** grove, `packages/`, Tasks. If the gate reports "full suite", stop and find out why.

---

## Chunk 1: Data layer (inline, cheaper model not needed)

**Files:**
- Create: `apps/teaching/src/schemas/faded.ts`
- Modify: `apps/teaching/src/schemas/block.ts:1028-1049`
- Modify: `apps/teaching/src/lecture/scenes.ts:43-46`
- Modify: `apps/teaching/src/schemas/publish-block-issues.ts:406-411`
- Modify: `apps/teaching/src/blocks/search-text.ts:133-136`
- Modify: `apps/teaching/src/blocks/create-block.ts:377,735`
- Test: `apps/teaching/tests/unit/tutorial-blocks-schema.test.ts`

`faded.ts` holds this. It must import only zod, because `lecture/scenes.ts` and the server bundles pull it in.

```ts
import { z } from 'zod';

export const FadedStepSchema = z.object({
  /** Absent only on content converted from the old shape: the key is then the block id. */
  id: z.string().min(1).optional(),
  /** Only when this step needs different wording from the block's question. */
  prompt: z.string().max(300).optional(),
  extract: z.string().max(2000),
  answers: z.array(z.string().max(600)).min(1).max(4),
  blanks: z.array(z.number().int().min(0).max(3)).max(4),
  question: z.object({
    prompt: z.string().max(300),
    choices: z.array(z.string().max(200)).min(2).max(4),
    correct: z.number().int().min(0).max(3)
  }).optional()
});

const FadedShape = z.object({
  prompt: z.string().max(300),
  part_labels: z.array(z.string().min(1).max(40)).min(1).max(4),
  steps: z.array(FadedStepSchema).min(1).max(6),
  criteria: z.record(z.string(), z.array(z.string().max(160)).max(4)),
  gate: z.boolean().optional()
});

export type FadedContent = z.infer<typeof FadedShape>;
export type FadedStep = FadedContent['steps'][number];

const GENERIC_CRITERIA = ['Answers the question', 'Uses words from the extract', 'Says what those words show'];

/** Reads either shape and always returns the new one. Safe on already-new content. */
export function upgradeFaded(raw: unknown): unknown {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.steps)) return raw;
  const parts = Array.isArray(c.parts) ? (c.parts as Array<{ label: string; answer: string }>) : [];
  const blanks = Array.isArray(c.blanks) ? (c.blanks as number[]) : [];
  const labels = parts.map((p) => p.label);
  return {
    prompt: typeof c.prompt === 'string' ? c.prompt : '',
    part_labels: labels,
    steps: [{ extract: typeof c.extract === 'string' ? c.extract : '', answers: parts.map((p) => p.answer), blanks }],
    criteria: Object.fromEntries(blanks.map((i) => [labels[i], GENERIC_CRITERIA])),
    ...(typeof c.gate === 'boolean' ? { gate: c.gate } : {})
  };
}

export const FadedContentSchema = z.preprocess(upgradeFaded, FadedShape.superRefine((c, ctx) => {
  c.steps.forEach((step, s) => {
    const issue = (message: string, key: string) => ctx.addIssue({ code: 'custom', message, path: ['steps', s, key] });
    if (step.answers.length !== c.part_labels.length) issue('Each step needs one answer per part.', 'answers');
    if (new Set(step.blanks).size !== step.blanks.length || step.blanks.some((i) => i >= c.part_labels.length)) {
      issue('Each blank must name a different part of the example.', 'blanks');
    }
    if (step.question && step.question.correct >= step.question.choices.length) issue('The correct choice must be one of the choices.', 'question');
  });
}));

/** Every reader uses this: stored lessons reach the tutorial player unparsed. Empty content gives no steps. */
export function fadedContent(block: { content: unknown }): FadedContent {
  const c = upgradeFaded(block.content) as FadedContent;
  return { ...c, part_labels: c.part_labels ?? [], steps: c.steps ?? [], criteria: c.criteria ?? {} };
}

export const fadedStepKey = (block: { id: string }, step: FadedStep): string => step.id ?? block.id;
export const fadedWritingSteps = (c: FadedContent): FadedStep[] => c.steps.filter((s) => s.blanks.length > 0);

/** Blanks for step `index` of `total`: none first, then one more from the last part backward. */
export function suggestedBlanks(index: number, partCount: number): number[] {
  return Array.from({ length: Math.min(index, partCount) }, (_, i) => partCount - 1 - i).reverse();
}

/** Teacher warnings. They never block publishing. */
export function fadedWarnings(c: FadedContent): string[] {
  const out: string[] = [];
  if (c.steps.length === 1) out.push('One step does not fade. Add steps so students take over part by part.');
  if (c.steps[0] && c.steps[0].blanks.length > 0) out.push('Start with a fully worked step.');
  c.steps.forEach((s, i) => {
    const before = c.steps[i - 1];
    if (before && s.blanks.length < before.blanks.length) out.push(`Step ${i + 1} asks for less than step ${i}.`);
    if (s.blanks.length === 0 && !s.question) out.push(`Step ${i + 1} is worked and has no question about it.`);
  });
  const extracts = c.steps.map((s) => s.extract.trim()).filter(Boolean);
  if (new Set(extracts).size < extracts.length) out.push('Two steps use the same extract.');
  return out;
}
```

`block.ts`: replace the `content` of `FadedExampleBlockSchema` with `content: FadedContentSchema`, and keep it a plain `z.object` at block level, because the leaf list needs ZodObjects.

`scenes.ts` `isGate`:

```ts
const c = fadedContent(block);
return c.gate !== false && fadedWritingSteps(c).length > 0;
```

`publish-block-issues.ts`, replacing the old rule:

```ts
if (block.block_type === 'faded_example') {
  const c = fadedContent(block);
  if (c.steps.some((s) => !s.extract.trim() || s.answers.some((a) => !a.trim()))) {
    return 'Faded example needs an extract and a model answer for every part of every step.';
  }
  const written = new Set(c.steps.flatMap((s) => s.blanks.map((i) => c.part_labels[i]!)));
  if ([...written].some((label) => !c.criteria[label]?.some((t) => t.trim()))) {
    return 'Faded example needs a checklist for every part students write.';
  }
}
```

`search-text.ts`: push `prompt`, then each step's `prompt`, `extract`, `answers`, question prompt and choices, then all criteria.

`create-block.ts` default content, four steps with fresh ids using the id helper already in that file, and `blanks` from `suggestedBlanks(i, 3)`. The worked step gets `question: { prompt: '', choices: ['', ''], correct: 0 }`. `criteria` holds one empty item per default label.

**Tests to add** in `tutorial-blocks-schema.test.ts`:
- Old shape parses to one step with no `id`, with its labels, answers and blanks kept, and generic criteria for blank parts only.
- New shape round-trips unchanged, and `upgradeFaded` run twice gives the same result.
- Rejected: a blank past the last part, a repeated blank, answers not matching labels, seven steps, `correct` past the choices.
- `suggestedBlanks`: `(0,3)` is `[]`, `(1,3)` is `[2]`, `(2,3)` is `[1,2]`, `(3,3)` is `[0,1,2]`, `(5,3)` is `[0,1,2]`.
- `fadedStepKey` uses the block id when `step.id` is missing.
- Each `fadedWarnings` message fires, and a good four-step block gives none.

Update the old-shape expectations in this test file. Regenerate bundles:

```bash
node scripts/generate-alchemy-schema.mjs
```

```bash
node scripts/generate-teaching-ai-runtime.mjs
```

---

## Chunk 2: Student view (subagent, Sonnet)

**Files:**
- Modify: `apps/teaching/src/blocks/faded-example.ts` (replace render; drop `groupFadedRuns`, `buildFadedRun`, `attachFadedCheck`; move the editor out in chunk 3)
- Create: `apps/teaching/src/blocks/faded-attempt.ts`
- Modify: `apps/teaching/src/blocks/render.ts:2827`
- Modify: `apps/teaching/src/styles/app.css:6395-6425` (the `.block-faded*` rules)
- Test: `apps/teaching/tests/unit/faded-example.test.ts`, `learning-activities.test.ts`, `render-blocks.test.ts`, `display-safety.test.ts`

`faded-attempt.ts`:

```ts
export type AttemptVerdict = 'ok' | 'short' | 'odd';

export function checkAttempt(texts: string[]): AttemptVerdict {
  const words = texts.map((t) => t.trim().split(/\s+/).filter(Boolean));
  if (words.some((w) => w.length < 5)) return 'short';
  const all = words.flat();
  const average = all.join('').length / all.length;
  return all.some((w) => /(.)\1{3}/i.test(w)) || average > 12 ? 'odd' : 'ok';
}
```

**Signature:** `renderFadedExample(block, mode, opts: { unlocked?: boolean } = {})`. `render.ts:2827` passes `{ unlocked: !!ctx.display }`.

**Saved state** per step, in `storageKey('local', fadedStepKey(block, step))`:

```ts
type StepWork = { stage: 'write' | 'tick' | 'model'; texts: Record<number, string>; ticks: string[]; picked: number | null };
```

**Old saved shape:** `{ parts, rating }` restores as `stage: 'model'`, `texts: parts`, and all criteria ticked if `rating === 'right'`.

**Render (teacher and print mode):** every step in order with all answers, labelled "Student writes" on blank parts, plus question, correct choice and criteria. Print shows empty space for blanks.

**Render (student mode):** match the mockup's markup order. Rail only with two or more steps. One step open. Later steps are `disabled` unless the earlier ones are done or `opts.unlocked`. Chip text comes from the existing `fadedModeText` logic, taking a step.

**Worked step:** with a question, choice buttons. The right choice gets "Yes." and shows the next button; a wrong choice gets "Look again and choose another." and can be retried. Without a question, the next button shows at once. A worked step counts as done once the student moves past it.

**Writing step:** follow the spec's stages.
- `checkAttempt` result `short`: nudge "Write a full sentence in each box, then check it."
- `odd`: nudge "Is that what you meant to write?" A second press with unchanged text goes through.
- Tick stage: native checkboxes in a `fieldset` per part. The primary button is "Improve mine" until all are ticked, then "See the model". Both stay available.
- Improve keeps text and ticks, and returns to `write`. A later Check clears the ticks.
- On reaching `model`, fire events (below). A restored step fires nothing.

**Events:**

```ts
export type FadedDetail = { blockId: string; stepKey: string; parts: Record<number, string>; rating: 'right' | 'wrong' };
```

- Fired per writing step on reaching the model. `rating` is `right` if all that step's criteria are ticked.
- `emitAnswered(root, block.id, rating)` fires once, from the last writing step only.

**Finish:** after the last step, show the student's texts from the last writing step, under "You wrote the whole answer yourself" when that step has every part blank, otherwise "That's the last step". A one-step block has no finish screen.

**CSS:** `.block-faded__input` gets `font: inherit`. Use flex-wrap rows so 390px stacks. Touch targets are 44px. Remove the `.block-faded-step*` run rules; keep the rail rules.

**Tests** in `faded-example.test.ts`, replacing the run tests:
- A worked wrong choice retries; the right one shows next.
- `checkAttempt`: four words `short`; `mmmmmmm one two three four` `odd`; a real sentence `ok`.
- A short attempt stays in `write`. An `odd` attempt needs a second press.
- The model text is absent from the DOM until `model`.
- Improve keeps text; re-Check clears ticks.
- Later step disabled for students, enabled with `unlocked`.
- `FADED_EVENT` fires per writing step with `stepKey`; `LECTURE_ANSWERED` fires once in a three-writing-step block.
- Restore returns to the saved stage with no events; old saved shape restores.
- A converted old block renders with no rail and keys its storage by block id.

---

## Chunk 3: Editor (subagent, Sonnet)

**Files:**
- Create: `apps/teaching/src/blocks/faded-example-editor.ts` (moves `createFadedExampleEditor` out)
- Modify: `apps/teaching/src/blocks/editors.ts:3`, `apps/teaching/src/blocks/registry.ts:2`
- Modify: `apps/teaching/src/styles/app.css` (`.block-editor__faded*`)
- Test: `apps/teaching/tests/unit/tutorial-blocks.test.ts`

Keep the `editorShell` pattern and `getLatest()` merging from the current editor. `fadedContent(getLatest())` is read at each change, so old blocks upgrade on first edit. Give a converted step an `id` equal to `block.id` when the teacher adds a second step, so saved answers stay attached.

**Controls, top to bottom:**
1. Question (textarea).
2. Parts: label inputs, with add (to 4) and remove (to 1). Removing a part drops its answer from every step, corrects `blanks`, and removes its criteria. Renaming moves its criteria key.
3. Warnings: `fadedWarnings` as a polite live list, updated on change.
4. Steps: `<details>`, first open. Summary shows "Step n" and a pill per part. Inside:
   - extract
   - an answer box per part, labelled "shown to students" or "model, hidden until after checking"
   - a "Students write this" checkbox per part
   - on worked steps, question prompt, choices (2 to 4) and a correct-choice radio
   - remove step, when more than one
5. Add step (to 6): new id, `blanks` from `suggestedBlanks`, or every part once past the end.
6. Criteria: one textarea per part, one item per line, up to 4.

**Tests:**
- Adding a step sets suggested blanks and a fresh id.
- First added step on a converted block sets `steps[0].id` to the block id.
- Removing a part corrects `blanks`, answers and criteria.
- Renaming a part moves its criteria.
- A warning appears and clears.
- `listPublishBlockIssues` blocks missing criteria, and warnings do not block.

---

## Chunk 4: Connections, back-fix and gate (inline)

**Files:**
- Modify: `apps/teaching/src/tutorial/player.ts:57-60`
- Modify: `apps/teaching/src/tutorial/board.ts:17,40-52,281,303,320-323`
- Modify: `netlify/functions/_shared/tutorial.mjs:114-119`
- Modify: `apps/teaching/src/ai/block-recipes.ts:50-51`
- Create: `apps/teaching/src/schemas/faded-fold.ts`, `scripts/migrate-faded-runs.mjs`
- Test: `tutorial-board.test.ts`, `tutorial-model.test.ts`, `tutorial-ann.test.ts`, `tests/unit/tutorial-publish.test.js`, new `apps/teaching/tests/unit/faded-fold.test.ts`

**Player:** `client?.answer(stepKey, parts, rating)`. The existing `block_id` field carries the step key.

**Server `blockIds`:** also add each `b.content?.steps?.[n]?.id`. Answers and `show` then work unchanged. Old blocks still match by block id.

**Board:** `fadedColumns` returns `{ key, labels, blanks }` per writing step across blocks, using `fadedContent`, `fadedWritingSteps` and `fadedStepKey`. Lines 303 and 320-323 use `key` for `s.answers[...]` and `api.show`. Student copies keep model answers as they do now.

**Recipe:** replace the We do and You do wording and the `faded_example` content line with:

> then We do: one faded_example with three steps (blanks: [], then [last part], then [last two parts]), each on a new extract, the worked step carrying a question, followed by a section with side_path: true titled "A second look"; then one with_teacher block; then You do: one faded_example with one step, every part blank, on a new extract.
>
> faded_example: content { prompt, part_labels: ["Technique", "Where", "Effect"] (1–4), steps: [{ id, extract, answers: [one per label], blanks: [0-based], question?: { prompt, choices, correct } }], criteria: { [label]: [short things a strong answer does] } }.

The I do contrast-pair option stays. A knowledge gap's I do is now the worked step, so drop the separate fully worked block. Regenerate with `scripts/generate-teaching-ai-runtime.mjs`.

**Fold:** `faded-fold.ts` exports `foldFadedRuns(blocks): { blocks; folded: number; skipped: string[] }`, recursing through `content.blocks`.
- Adjacent `faded_example` blocks fold when part labels and `visibility` match and no later block carries sleeves or other attachments. Otherwise they are listed in `skipped`.
- Each step's `id` is its old block id.
- The first block's id, layout and `prompt` stay. A later block's differing prompt moves to its `step.prompt`.
- `gate` is `false` if any was. Criteria are the first block's, merged by label.
- Running it twice changes nothing.

**Script:** `scripts/migrate-faded-runs.mjs` follows `scripts/migrate-knowledge-connected.mjs`: dry run by default, `--execute --confirm-execute` to write. It reads `lessons/` and `PUBLISHED_LESSON_PREFIX` through `teaching-blobs.mjs`. The dry run prints counts of faded blocks, runs, skips and side paths, per lesson id with no content.

**Tests:**
- Fold: two adjacent fold with ids kept; a side path between stops it; different labels skip; a nested section folds; idempotent.
- Board: columns come from steps; an old block's answer and a new step's answer both show.
- Server (`tutorial-publish.test.js`): a step id in the student's group is accepted; another group's is rejected with `bad_block`.
- Ann: the recipe test matches the new wording.

**Finish:**

```bash
npx vitest run --root apps/teaching tests/unit/faded-example.test.ts tests/unit/faded-fold.test.ts tests/unit/tutorial-blocks.test.ts tests/unit/tutorial-blocks-schema.test.ts tests/unit/tutorial-board.test.ts tests/unit/tutorial-model.test.ts tests/unit/tutorial-ann.test.ts tests/unit/learning-activities.test.ts tests/unit/render-blocks.test.ts tests/unit/display-safety.test.ts
```

```bash
npm run pre-pr-check
```

Fix what fails, including the block-text baseline. Commit by phase, open one PR with no real names or content, and enable auto-merge. After it is live, run the dry run, send Adam the counts, and wait for his go-ahead before `--execute`. Walk per the spec's last testing item.

---

## Cost

No dollar figure, because there is no per-build usage record to base one on. Sizes below are from merged PRs, excluding generated bundles, docs and JSON.

| Build | Files | Lines added |
|---|---|---|
| Voice oracy (1310) | 15 | 741 |
| Redrafting (1315) | 33 | 1,030 |
| AI answer marking (1270) | 19 | 1,259 |
| **This rebuild (my estimate)** | **about 25** | **about 1,200 to 1,800** |
| Knowledge organiser (1317) | 34 | 4,336 |
| Tutorial mode (1095) | 105 | 5,151 |

**Comparison:** about the size of AI answer marking or a little above, and well under a third of Tutorial mode.

**What drives it:** the converted-content paths and the tutorial board are the risky parts. Rework there and failures at the gate would move it most, and the live walk adds to it.

**Running cost for students and teachers:** none. No AI calls are added. Ann's output for a tutorial grows a little if she is used to draft one.
