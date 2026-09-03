# Learning Activities Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship thin v1 of three leaf blocks — `flashcards`, `cloze`, `self_check` — with stacked editors, interactive student views (localStorage only), flip/shuffle motion, sized cloze blanks + shuffled word bank, and clear control feedback.

**Architecture:** Three leaf schemas in `leafBlockSchemas` (same nesting as `question_set` / `gallery`). Shared helpers in `src/blocks/learning-activity.ts` for cloze marker parse, Fisher–Yates shuffle, and `localStorage` get/set. Render wires student interactivity in view mode; builder mode shows static/light preview. CSS handles flip, shuffle, blank widths, and `:hover`/`:active`/`:focus-visible` on activity controls.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), Clinical Glass CSS

**Spec:** `docs/superpowers/specs/2026-08-09-learning-activities-pack-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | Types + Zod for three blocks; add to `leafBlockSchemas` |
| `src/schemas/lesson.ts` | Publish rules for each |
| `src/blocks/create-block.ts` | Create defaults, labels, Activity group, clone ids |
| `src/blocks/learning-activity.ts` | Cloze parse, shuffle, localStorage helpers |
| `src/blocks/editors.ts` | Three stacked editors + dispatch |
| `src/blocks/render.ts` | Three renderers + student interactivity + dispatch |
| `src/blocks/registry.ts` | Register all three |
| `src/styles/app.css` | Activity chrome, flip/shuffle, blanks, control feedback |
| `tests/unit/learning-activities.test.ts` | Schema, create, helpers, render, editor smoke |
| `tests/unit/schemas-lesson.test.ts` | Publish rules |
| `tests/unit/render-blocks.test.ts` | Registry includes new types |
| `docs/BUILD.md` | History / Next up / projection |

**No changes needed** for visibility/sanitize recursion beyond leaves already covered (unless a helper path walks blocks — leaves are no-ops in those files today).

---

### Task 1: Schema + createBlock

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/blocks/create-block.ts`
- Create: `tests/unit/learning-activities.test.ts`

- [ ] **Step 1: Failing tests** — parse each type; reject 0 flashcards / >20 cards; reject cloze with no `[[...]]` blanks at schema or publish layer (schema: `text` string ok; publish enforces ≥1 blank — test publish in Task 2); reject self_check empty prompt; `createBlock` defaults: 2 cards; cloze sample with one blank; self_check `mode: 'reveal'`; clone regenerates card/item ids.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/learning-activities.test.ts
```

- [ ] **Step 3: Schema** — add `'flashcards' | 'cloze' | 'self_check'` to `BlockTypeSchema`. Add:

```ts
export const FlashcardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  image_url: z.string().optional(),
  image_alt: z.string().optional()
});

export const FlashcardsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('flashcards'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    cards: z.array(FlashcardItemSchema).min(1).max(20),
    shuffle: z.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const ClozeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('cloze'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    text: z.string(),
    case_sensitive: z.boolean().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const SelfCheckModeSchema = z.enum(['reveal', 'checklist', 'confidence']);

export const SelfCheckItemSchema = z.object({
  id: z.string().min(1),
  label: z.string()
});

export const SelfCheckBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('self_check'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    title: z.string().optional(),
    mode: SelfCheckModeSchema,
    prompt: z.string(),
    answer: z.string().optional(),
    items: z.array(SelfCheckItemSchema).max(12).optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

Append all three to `leafBlockSchemas` (after `QuestionSetBlockSchema` / near gallery peers).

- [ ] **Step 4: create-block** — add types to `NEW_BLOCK_TYPES` + labels; new group `Learning` with `['flashcards', 'cloze', 'self_check']` (keep `question_set` in Activities or move — leave `question_set` where it is). Defaults:

```ts
// flashcards: 2 cards `${id}_c1`, `${id}_c2`, empty front/back, shuffle: false
// cloze: text `The capital of France is [[Paris]].`, case_sensitive: false
// self_check: mode 'reveal', prompt '', answer ''
```

Clone: remap card ids / checklist item ids.

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit** (only if user asked to commit)

---

### Task 2: Publish rules

**Files:**
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Tests**

| Rule | Message (approx) |
|------|------------------|
| Flashcards: every card needs non-empty front **and** back | Flashcards need front and back text on every card |
| Cloze: `parseClozeText(text).blanks.length >= 1` | Cloze blocks need at least one blank |
| Self check: non-empty prompt | Self check blocks need a prompt |
| Self check reveal/confidence: non-empty answer | Self check blocks need an answer |
| Self check checklist: ≥1 item with non-empty label | Self check checklists need at least one item |

- [ ] **Step 2: Implement** in `publishBlockIssues` (import parse helper once Task 3 exists, or inline a minimal `\[\[([^\]]+)\]\]` count for publish until helper lands — prefer implement Task 3 first if parallelising fails).

- [ ] **Step 3: Run `npx vitest run tests/unit/schemas-lesson.test.ts` — PASS**

---

### Task 3: Helpers (`learning-activity.ts`)

**Files:**
- Create: `src/blocks/learning-activity.ts`
- Modify: `tests/unit/learning-activities.test.ts`

- [ ] **Step 1: Tests**

```ts
// parseClozeText('Hello [[world|hint]] and [[foo]].')
// → segments + blanks [{ answer: 'world', hint: 'hint' }, { answer: 'foo' }]
// shuffleArray is pure permutation of same elements; not identity across many seeds when n>1
// storageKey(lessonId, blockId) === `teaching-hub.activity.${lessonId}.${blockId}`
// loadActivityState / saveActivityState round-trip JSON; missing key → null
```

- [ ] **Step 2: Implement**

```ts
export type ClozeBlank = { answer: string; hint?: string };
export type ClozeSegment =
  | { type: 'text'; value: string }
  | { type: 'blank'; blank: ClozeBlank; index: number };

/** Markers: [[answer]] or [[answer|hint]] — first | separates hint. */
export function parseClozeText(text: string): { segments: ClozeSegment[]; blanks: ClozeBlank[] };

export function shuffleArray<T>(items: T[], random?: () => number): T[];

export function storageKey(lessonId: string, blockId: string): string;
export function loadActivityState<T>(key: string): T | null;
export function saveActivityState(key: string, value: unknown): void;
```

Use `crypto.randomUUID` only where ids are created elsewhere; shuffle uses `Math.random` by default. Wrap localStorage in try/catch (match `nav.ts`).

- [ ] **Step 3: Run learning-activities tests — PASS**

---

### Task 4: Editors

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `tests/unit/learning-activities.test.ts`

- [ ] **Step 1: Tests** — flashcards add/remove card (min 1 / max 20); cloze text field updates; self_check mode select switches fields (checklist shows items UI).

- [ ] **Step 2: Implement** stacked editors mirroring timeline/gallery:

- **Flashcards:** shuffle checkbox; per card front/back/image_url/image_alt; Up/Down/Remove; Add card.
- **Cloze:** title; textarea for `text`; case_sensitive checkbox; short hint about `[[answer]]` / `[[answer|hint]]`.
- **Self check:** title; mode select; prompt; answer (if reveal/confidence); checklist items list (if checklist).

Wire `case` arms in `createBlockEditor`.

- [ ] **Step 3: Run tests — PASS**

---

### Task 5: Render + registry + CSS

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/learning-activities.test.ts`
- Modify: `tests/unit/render-blocks.test.ts`

**Render contract**

- Read optional `lessonId` from a data attribute on a parent if already used; else pass via render context **only if** the codebase already has render options — if `renderBlock(block, mode)` is binary, key storage as `teaching-hub.activity.${block.id}` (block id alone) to avoid inventing a lesson context API this slice.
- **Builder (`mode !== 'student'` or equivalent):** static preview (first card face; cloze text with underlined blanks; self_check prompt) — no localStorage writes required.
- **Student:** full interactivity below.

**Flashcards (student)**

- One card; classes `block-flashcards`, `__card`, `__face--front/back`, `--flipped`.
- Buttons: Prev / Flip / Next / Reset (use `btn` + activity-specific class).
- Flip: toggle `--flipped` with CSS `transform: rotateY`; `@media (prefers-reduced-motion: reduce)` disable rotate, instant swap.
- Shuffle: if `content.shuffle`, on mount + Reset reshuffle order with brief CSS animation class (`--shuffling`); reduced-motion skips motion class.
- Persist `{ order: string[]; index: number; flipped: boolean }` via helpers.

**Cloze (student)**

- Render segments; each blank `<input>` with `style.width` / `size` from `Math.max(answer.length, 3)` in `ch` (e.g. `width: ${n}ch`).
- Word bank: list of answers shuffled on mount + Reset; never source order.
- Check / Reveal / Reset; score text `n / total` only.
- Compare trim; case per `case_sensitive`.

**Self check (student)**

- `reveal`: Show/Hide answer.
- `checklist`: checkboxes; persist checked ids.
- `confidence`: 1–5 buttons then reveal answer; persist rating + revealed.

**CSS**

- Flip 3D on card inner; shuffle keyframe (small translate/opacity).
- `.block-flashcards__btn`, cloze/self_check buttons: ensure `:hover`, `:active`, `:focus-visible` (and `:disabled`) are visible — extend existing `.btn` if gaps remain for ghost buttons inside these blocks.
- Word bank chips; blank inputs; checklist/confidence chrome.

**Registry** — register render + editor for all three; export creators.

**Tests** — student render creates controls; cloze bank order ≠ source order (mock random); flashcards Flip toggles class; registry includes types.

- [ ] **Step 1: Failing interaction tests**
- [ ] **Step 2: Implement render + CSS + registry**
- [ ] **Step 3: Run**

```bash
npx vitest run tests/unit/learning-activities.test.ts tests/unit/render-blocks.test.ts
```

Expected: PASS

---

### Task 6: BUILD.md + full unit suite

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1:** History row for Learning activities pack; tick Flashcards/Cloze/Self check; Next up → Visualisation pack; update block count + latest note; phase 5 line.

- [ ] **Step 2:**

```bash
npx vitest run
```

Expected: PASS

- [ ] **Step 3: Commit** (only if user asked)

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Three leaf types + nesting | 1 |
| Flashcards data + motion + localStorage | 1, 3, 5 |
| Cloze markers, sized blanks, shuffled bank | 3, 5 |
| Self check modes | 1, 4, 5 |
| Control hover/active/focus | 5 |
| Publish rules | 2 |
| Editors | 4 |
| BUILD.md | 6 |
| No server progress / no nesting children | enforced by leaf schema |

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-08-09-learning-activities-pack.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — implement in this session with checkpoints  

Which approach?
