# Reasoning lens and Reasoning chart Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students build a deductive, inductive or abductive chart one scaffolded step at a time, then write the answer in their books, as a lens or as a question set Format, at three levels.

**Architecture:** One shared module, `src/blocks/reasoning/`, holds the step data, the chart renderer and a self-contained walk (chart, step tabs, step panel, Write it down). The lens plugs the walk into the stepped-lens engine through one new optional `walk` hook; the Format renders one walk per question. Styles are `block-reasoning*` rules in `app.css`, so the generated `packages/block-styles/blocks.css` carries them to Tasks and Professional.

**Tech Stack:** TypeScript, DOM rendering (no framework), zod schemas, vitest + happy-dom, Playwright.

Spec: `apps/teaching/docs/superpowers/specs/2026-10-21-reasoning-lens-design.md`.

Run all commands from `apps/teaching` unless noted.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/blocks/reasoning/content.ts` | Logic ids, step data per type and level, Hunger Games examples, Write it down frames and checklists, choice cards. Data and pure functions only. |
| `src/blocks/reasoning/chart.ts` | Draws a chart (columns of nodes, SVG connectors, axis label) from steps and answers, for screen and print. |
| `src/blocks/reasoning/walk.ts` | The interactive walk: choice cards, tabs, step panel (text, fit ticks, test grid, sure pills), Next refusal, Write it down. Also the print sheet. |
| `src/blocks/lenses/reasoning.ts` | The `reasoning` stepped-lens entry and its setup fields. |
| `src/blocks/lenses/types.ts` | Adds optional `walk` and `print` hooks to `SteppedLens`. |
| `src/blocks/lenses/stepped-view.ts` | Delegates to `walk` / `print` when a lens provides them. |
| `src/blocks/lenses/registry.ts` | Adds `REASONING` to `STEPPED_LENSES`. |
| `src/schemas/lens.ts` | `LogicSchema`, `ReasoningConfigSchema`. |
| `src/schemas/block.ts` | `reasoning_chart` format, `logic` on questions, `reasoning` settings on question sets. |
| `src/blocks/formats/reasoning-chart.ts` | Format renderer: one walk per question. |
| `src/blocks/formats/registry.ts` | Format entry. |
| `src/blocks/render.ts` | Dispatch to the Format renderer. |
| `src/blocks/editors.ts` | Logic pills per question and one level control for this format; keep `logic` on save. |
| `src/styles/app.css` | `block-reasoning*` styles. |
| `../../packages/block-styles/blocks.css` | Regenerated. |
| `tests/unit/reasoning.test.ts` | Content, chart, walk, lens, Format, schema tests. |
| `tests/browser/reasoning.spec.ts` | Desktop and 390px walks, print. |

## Task 1: Content data

**Files:** Create `src/blocks/reasoning/content.ts`; test `tests/unit/reasoning.test.ts`.

Interfaces:

```ts
export type Logic = 'deductive' | 'inductive' | 'abductive';
export type LogicSetting = Logic | 'all_three' | 'choice';
export type StepKind = 'text' | 'fit' | 'test' | 'sure';
export type ReasoningStep = {
  id: string;            // 'e1', 'pt'… ; prefixed 'inductive.e1' inside All three
  logic: Logic;
  column: number;        // chart column the node sits in
  title: string;         // node and tab name
  question: string;
  hint: string;
  example?: string;      // Hunger Games
  starter?: string;      // sentence starter
  kind: StepKind;
  checks?: string[];     // step ids a 'fit' step ticks against
};
export function reasoningSteps(logic: Logic | 'all_three', level: LensLevel): ReasoningStep[];
export function reasoningWrite(logic: Logic | 'all_three', level: LensLevel): WriteItDown;
export const LOGIC_CARDS: Array<{ value: Logic; label: string; detail: string; example: string }>;
export const LOGIC_LABELS: Record<LogicSetting, string>;
```

- [ ] Write failing tests: step ids per type and level match the spec (inductive support `e1 e2 pt so`; core `e1 e2 e3 pt so`; extend adds `br`; abductive support `c1 c2 m1 be`; core `c1 c2 c3 m1 m2 ts be`; extend adds `wr`; deductive core `r cs sm`, extend adds `hp`); every step at support has an example and every text step a starter; `all_three` at core is inductive then abductive then deductive with prefixed ids; Write it down gives a frame at support/core and a challenge at extend, never containing "Case".
- [ ] Run `npx vitest run tests/unit/reasoning.test.ts`: FAIL (module missing).
- [ ] Implement the data from the spec tables.
- [ ] Run tests: PASS. Commit "Teaching: Reasoning step data".

## Task 2: Chart renderer

**Files:** Create `src/blocks/reasoning/chart.ts`; extend the test file.

```ts
export function renderReasoningChart(options: {
  logic: Logic; steps: ReasoningStep[]; answers: Record<string, string>;
  current?: string; fits?: Record<string, boolean>; print?: boolean;
}): HTMLElement; // .block-reasoning-chart[data-logic]
```

Columns come from `step.column`; `sure` and `test` steps add no node. Each node: `.block-reasoning-chart__node` with modifiers `--done` (answered), `--now` (current), `--ghost` (empty). Fit ticks show "✓ fits" on the node. Between columns, an `svg.block-reasoning-chart__links` with `viewBox="0 0 40 100"` and `preserveAspectRatio="none"`; a path from each left node centre `(i + 0.5) / n * 100` to each right node centre (abductive clue→maybe is many-to-many, everything else joins to the right column's nodes in order). Axis label: Specific → General, General → Specific, Clues → Best guess. Print: every node empty with two ruled lines.

- [ ] Failing tests: node count and order per column; `--now` on the current step; answered text shown; abductive draws clue × maybe links; print has no answers and ruled lines.
- [ ] Implement. Tests PASS. Commit "Teaching: Reasoning chart".

## Task 3: The walk

**Files:** Create `src/blocks/reasoning/walk.ts`; extend tests.

```ts
export type WalkState = {
  step: number; choice?: Logic; answers: Record<string, string>;
  ticks: Record<string, boolean>; sure?: 'certainly' | 'probably' | 'possibly';
  answer?: string; done?: boolean;
};
export function createReasoningWalk(options: {
  logic: LogicSetting; level: LensLevel; state: WalkState; persist: () => void;
  preview: boolean;                    // teacher preview: caption says nothing is saved
  examples?: Partial<Record<LensLevel, string>>;
  onDone?: () => void;
}): HTMLElement;
export function renderReasoningPrint(logic: LogicSetting, level: LensLevel): HTMLElement;
```

Behaviour: `choice` with no `state.choice` shows the three `LOGIC_CARDS` on the analytical-to-creative line; picking one starts the walk. Chart on top, `nav.kaplan-progress` tabs (later tabs disabled until earlier text steps are answered), step title, question, hint, example (support: shown; core: `details` "Show me an example"; extend: none), the input by kind, Back / "Next: <title>". Text steps: textarea pre-filled with the starter at support, starter as placeholder plus `.block-reasoning__starter` caption at core, nothing at extend; Next refuses empty or untouched-starter answers with `p.block-reasoning__error` "Write your answer first". Fit: a checkbox per checked step's answer, saved in `ticks['fit.<id>']`. Test: a table of clue rows × maybe columns, saved in `ticks['test.<clue>.<maybe>']`. Sure: three pills. Last tab is Write it down: the chart (complete), frame or challenge, answer box, checklist, handover, Copy and "I’ve written it down" (sets `done`, calls `onDone`).

- [ ] Failing tests: Next refused when empty and when the starter is untouched; answering fills the chart node; fit ticks and test grid persist through `persist`; choice cards lead into the chosen walk; support shows the example, extend hides it; Write it down shows the frame and handover text.
- [ ] Implement. Tests PASS. Commit "Teaching: Reasoning walk".

## Task 4: Lens

**Files:** Modify `src/schemas/lens.ts`, `src/blocks/lenses/types.ts`, `src/blocks/lenses/stepped-view.ts`, `src/blocks/lenses/registry.ts`; create `src/blocks/lenses/reasoning.ts`.

```ts
export const LogicSchema = z.enum(['deductive', 'inductive', 'abductive', 'all_three', 'choice']);
export const ReasoningConfigSchema = z.object({
  focus: z.string().trim().max(200).default(''),
  logic: LogicSchema.default('choice'),
  level: LensLevelSchema.default('core'),
  student_level: z.boolean().default(true),
  mode: z.enum(['notes', 'discussion']).default('notes'),
  examples: z.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});
```

`SteppedLens` gains:

```ts
walk?: (args: { config: LensConfig; ctx: StepContext; storageKey?: string; preview: boolean; onDone: () => void }) => HTMLElement;
print?: (config: LensConfig, ctx: StepContext) => HTMLElement;
```

`showStep` draws heading and level pills, then, when `lens.walk` exists, appends the walk and returns. `printLens` uses `lens.print` when present. The lens: id `reasoning`, label Reasoning, group Thinking, `steps` maps `reasoningSteps` to `LensStep`s (for teacher review), `writeItDown` from `reasoningWrite`, `setupFields` with the Logic pills. Peer feedback blocks get reviewer steps (name the logic, find evidence and conclusion, judge the step between).

- [ ] Failing tests: config defaults; attaching and reading round-trips; student view opens the walk from the chip; level switch redraws; print uses the chart; Kaplan and Windows & Mirrors tests unchanged.
- [ ] Implement. `npx vitest run tests/unit/reasoning.test.ts tests/unit/lenses.test.ts tests/unit/windows-mirrors.test.ts tests/unit/kaplan.test.ts`: PASS. Commit "Teaching: Reasoning lens".

## Task 5: Format

**Files:** Modify `src/schemas/block.ts`, `src/blocks/formats/registry.ts`, `src/blocks/render.ts`, `src/blocks/editors.ts`; create `src/blocks/formats/reasoning-chart.ts`.

Schema: `format` enum adds `'reasoning_chart'`; `QuestionItemSchema` adds `logic: LogicSchema.optional()`; question set content adds `reasoning: z.object({ level: LensLevelSchema.default('core'), student_level: z.boolean().default(true) }).optional()`. Renderer: title, a level pill row (when allowed), then per question the prompt and a walk keyed `${storageKey(lesson, block)}.format.reasoning_chart.${question.id}`; one walk open at a time, the others collapsed to their chart with an "Open" button. Print: prompt plus `renderReasoningPrint`. Editor: when the format is `reasoning_chart`, each question shows a Logic choice and the block shows a Level choice; `emitChange` keeps `logic`.

- [ ] Failing tests: schema accepts and round-trips `logic` and `reasoning`; switching format away and back keeps them; student view renders one chart per question with the teacher's logic; editor saves a picked logic.
- [ ] Implement. Tests PASS. Commit "Teaching: Reasoning chart format".

## Task 6: Styles

**Files:** Modify `src/styles/app.css`; run `node scripts/generate-block-css.mjs` from the repo root.

Cotton glass, matching `kaplan.css`: nodes white with `--line` border and 14px radius, `--now` pastel blue with wave border, `--ghost` dashed; abductive nodes use `--pastel-peach`; connectors wave blue; under 40rem the chart stacks vertically and the link SVGs become a small down arrow. Next button navy.

- [ ] Implement, regenerate blocks.css, check `node scripts/generate-block-css.mjs --check` exits 0. Commit "Teaching: Reasoning styles".

## Task 7: Browser check and PR

- [ ] `tests/browser/reasoning.spec.ts`: inductive at Standard walked to Write it down at 1280px and 390px; abductive test grid ticks; print emulation shows ruled nodes.
- [ ] Preview in the dev server, screenshots at desktop and 390px, check `docs/CURSOR-UI-FAILURES.md`.
- [ ] `npm run pre-pr-check` from the repo root exits 0. Push, open the PR ready for review, enable auto-merge (merge commit).
