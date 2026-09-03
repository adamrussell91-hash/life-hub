# Lesson Builder Canvas + Whole-Lesson AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lesson-editor form stack with a cotton-glass three-region builder (shelvable family palette, page-first canvas, always-on chat), and let agents — especially Clementine on a long-run Knowledge Hub job — propose whole-lesson edits that apply only on Accept.

**Architecture:** Pure helpers for palette catalog, drop/reorder, chrome prefs, and proposal apply live in small modules. `lesson-editor.ts` becomes a shell that mounts palette + page + chat. Fast AI stays on `/api/ai/chat` SSE; Clementine long-run uses `/api/ai/jobs` (Blobs job record + proxy to the existing Knowledge Hub research worker `/lesson_proposal`). Manual building does not import the AI client.

**Tech Stack:** TypeScript, Vitest + happy-dom, existing HTML5 DnD, Zod, Netlify Functions, Netlify Blobs, existing Anthropic stream helper, existing `archiveKernel`.

**Spec:** `docs/superpowers/specs/2026-08-15-lesson-builder-canvas-ai-design.md`

**Look:** Cotton glass (`src/styles/app.css`). Do not ship brainstorm wireframes.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/teacher/lesson-canvas/kinds.ts` | Text-like vs heavy block sets |
| `src/teacher/lesson-canvas/palette-catalog.ts` | Families, descriptions, icon src, compositions family |
| `src/teacher/lesson-canvas/drop.ts` | Drop parents, validity, insert/move/delete in tree, block count |
| `src/teacher/lesson-canvas/prefs.ts` | Shelve rail/chat in localStorage |
| `src/teacher/lesson-canvas/mount-palette.ts` | Family rail, flyout cards, DnD start, shelve |
| `src/teacher/lesson-canvas/mount-page.ts` | Cover/title, page blocks, gaps, inspector, print icon, ⋯ menu |
| `src/teacher/lesson-editor.ts` | Compose the three regions; save/publish; Accept apply |
| `src/teacher/ai-panel.ts` | No selection gate; optional hint; working pulse; shelve API |
| `src/ai/proposals.ts` | Optional selection; new proposal kinds; insert cap 48 |
| `src/ai/apply-proposal.ts` | Lesson-level apply (title/cover/blocks) |
| `src/ai/context.ts` | Whole-lesson prompt; compact outline for fast path |
| `src/ai/client.ts` | Optional `selected_block_id`; jobs client |
| `src/storage/keys.ts` | `aiJobKey`, `aiTranscriptKey` |
| `netlify/functions/ai-chat.mts` | Optional selection; empty lesson; new tools |
| `netlify/functions/ai-jobs.mts` | Start/poll long-run job |
| `scripts/mock-api.ts` | Jobs + chat without selected block |
| `src/styles/app.css` | Canvas / palette / flyout / shelve / print icon |
| `config/clementine-protocol.md`, `prompts/clementine-school.md`, `config/ann-protocol.md` | Stop “selected block only” |
| `public/assets/blocks/` | Icon files when Adam supplies them; fallback tiles until then |
| Tests | `tests/unit/lesson-canvas-*.test.ts`, `ai-agent.test.ts`, `ai-chat-mock.test.ts`, `ai-jobs-mock.test.ts`, `lesson-editor.test.ts`, `search-actions.test.ts` |

Homepage/unit editors keep the old Add block `<select>`.

---

### Task 1: Palette catalog

**Files:**
- Create: `src/teacher/lesson-canvas/palette-catalog.ts`
- Create: `tests/unit/lesson-canvas-palette.test.ts`
- Modify: none of `create-block.ts` unless a description helper fits better next to `INSERT_MENU_LABEL` — keep descriptions in `palette-catalog.ts` to avoid bloating create-block.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { LESSON_BLOCK_GROUPS } from '@/blocks/create-block';
import {
  INSERT_MENU_DESCRIPTION,
  blockIconSrc,
  lessonPaletteFamilies
} from '@/teacher/lesson-canvas/palette-catalog';

describe('lesson palette catalog', () => {
  it('uses lesson groups, omits collection, and describes every card', () => {
    const families = lessonPaletteFamilies([]);
    expect(families.map((f) => f.id)).toEqual([
      'Basic',
      'Media',
      'Teaching',
      'Learning',
      'Visualisation',
      'Layout',
      'Compositions'
    ]);
    expect(families.find((f) => f.id === 'Layout')?.cards.some((c) => c.kind === 'block' && c.type === 'collection')).toBe(
      false
    );
    for (const group of LESSON_BLOCK_GROUPS) {
      for (const type of group.types) {
        if (type === 'collection') continue;
        expect(INSERT_MENU_DESCRIPTION[type].length).toBeGreaterThan(8);
      }
    }
    expect(blockIconSrc('concept_map')).toBe('/assets/blocks/concept_map.svg');
    expect(blockIconSrc('embed:pdf')).toBe('/assets/blocks/embed-pdf.svg');
  });

  it('hides compositions family when the list is empty', () => {
    const empty = lessonPaletteFamilies([]);
    expect(empty.find((f) => f.id === 'Compositions')?.disabled).toBe(true);
    const withOne = lessonPaletteFamilies([{ id: 'comp_1', title: 'Hook' }]);
    expect(withOne.find((f) => f.id === 'Compositions')?.disabled).toBe(false);
    expect(withOne.find((f) => f.id === 'Compositions')?.cards[0]).toMatchObject({
      kind: 'composition',
      id: 'comp_1',
      title: 'Hook'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lesson-canvas-palette.test.ts`
Expected: FAIL resolving `@/teacher/lesson-canvas/palette-catalog`

- [ ] **Step 3: Write minimal implementation**

`lessonPaletteFamilies(compositions: Array<{ id: string; title: string }>)` returns families from `LESSON_BLOCK_GROUPS` + `expandGroupTypesForMenu`, each card `{ kind: 'block', type, title: INSERT_MENU_LABEL[type], description: INSERT_MENU_DESCRIPTION[type], iconSrc: blockIconSrc(type) }`. Compositions family `disabled: compositions.length === 0`. `blockIconSrc` replaces `:` with `-`. Write a short English description for every `InsertMenuValue` (embed presets included).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lesson-canvas-palette.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/lesson-canvas/palette-catalog.ts tests/unit/lesson-canvas-palette.test.ts
git commit -m "feat: lesson palette catalog with descriptions and composition family"
```

---

### Task 2: Drop / insert / move helpers

**Files:**
- Create: `src/teacher/lesson-canvas/drop.ts`
- Create: `tests/unit/lesson-canvas-drop.test.ts`

Use existing `COLUMN_CHILD_TYPES`, `SECTION_CHILD_TYPES`, `TAB_CHILD_TYPES`, `createBlock`, `createFromInsertMenu`.

```ts
export type DropParent =
  | { kind: 'root' }
  | { kind: 'section'; id: string }
  | { kind: 'column'; id: string; columnIndex: number }
  | { kind: 'tab'; id: string; tabIndex: number };

export function insertTypeForParent(parent: DropParent, type: NewBlockType): string | null;
// null = allowed; string = reason

export function insertAt(
  blocks: Block[],
  parent: DropParent,
  index: number,
  block: Block
): { ok: true; blocks: Block[] } | { ok: false; message: string };

export function moveBlockTo(
  blocks: Block[],
  blockId: string,
  parent: DropParent,
  index: number
): { ok: true; blocks: Block[] } | { ok: false; message: string };

export function deleteBlocksById(blocks: Block[], ids: string[]): Block[];

export function reorderSiblings(
  blocks: Block[],
  parent: DropParent,
  orderedIds: string[]
): { ok: true; blocks: Block[] } | { ok: false; message: string };

export function countBlocksInTree(blocks: Block[]): number;
```

- [ ] **Step 1: Write the failing test**

Cover: insert heading at root index 0; refuse `columns` inside `columns`; refuse `collection` at lesson root via palette type check (`insertTypeForParent({ kind: 'root' }, 'collection')` reason string); move a rich_text between two siblings; `countBlocksInTree` counts nested section children; `deleteBlocksById` removes nested.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lesson-canvas-drop.test.ts`
Expected: FAIL module not found

- [ ] **Step 3: Implement `drop.ts`**

Walk the same tree shapes as `src/ai/block-tree.ts` (section.blocks, columns[].blocks, tabs[].blocks). When moving, remove first then insert (adjust index if moving within the same list). Root parent uses `NEW_BLOCK_TYPES` minus `collection`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/lesson-canvas-drop.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/teacher/lesson-canvas/drop.ts tests/unit/lesson-canvas-drop.test.ts
git commit -m "feat: lesson canvas drop insert move and delete helpers"
```

---

### Task 3: Chrome prefs

**Files:**
- Create: `src/teacher/lesson-canvas/prefs.ts`
- Create: `tests/unit/lesson-canvas-prefs.test.ts`

```ts
export const BUILDER_CHROME_KEY = 'teaching_hub_lesson_builder_chrome';
export type ShelfState = 'open' | 'shelved';
export type BuilderChromePrefs = { rail: ShelfState; chat: ShelfState };
export const DEFAULT_BUILDER_CHROME: BuilderChromePrefs = { rail: 'open', chat: 'open' };
export function readBuilderChromePrefs(): BuilderChromePrefs;
export function writeBuilderChromePrefs(next: BuilderChromePrefs): void;
```

- [ ] **Step 1: Failing test** — default when storage empty; round-trip `{ rail: 'shelved', chat: 'open' }`; corrupt JSON falls back to default.

- [ ] **Step 2: Run** `npx vitest run tests/unit/lesson-canvas-prefs.test.ts` — FAIL

- [ ] **Step 3: Implement** try/catch around `localStorage`.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat: persist lesson builder shelf prefs`

---

### Task 4: Proposal schema + apply (whole lesson)

**Files:**
- Modify: `src/ai/proposals.ts`
- Modify: `src/ai/apply-proposal.ts`
- Modify: `src/ai/capabilities.ts`
- Modify: `tests/unit/ai-agent.test.ts`

- [ ] **Step 1: Extend `tests/unit/ai-agent.test.ts`**

```ts
it('parses replace_lesson and applies title cover and blocks', () => {
  const heading = createBlock('heading', 'h1');
  const parsed = parseToolProposal('propose_replace_lesson', {
    title: 'Artist of the Floating World',
    cover: undefined,
    blocks: [heading]
  });
  expect('kind' in parsed && parsed.kind === 'replace_lesson').toBe(true);
  if (!('kind' in parsed) || parsed.kind !== 'replace_lesson') return;
  const applied = applyProposalToLesson(
    {
      id: 'l1',
      type: 'lesson',
      title: 'Old',
      slug: 'old',
      status: 'active',
      unit_id: 'u1',
      sequence: 1,
      blocks: [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    },
    parsed,
    () => 'block_new_1'
  );
  expect(applied.ok).toBe(true);
  expect(applied.lesson.title).toBe('Artist of the Floating World');
  expect(applied.lesson.blocks).toHaveLength(1);
});

it('rejects replace_lesson over 48 blocks', () => {
  const blocks = Array.from({ length: 49 }, (_, i) => createBlock('heading', `h${i}`));
  const parsed = parseToolProposal('propose_replace_lesson', { blocks });
  expect('error' in parsed).toBe(true);
});

it('inserts into an empty lesson without an anchor', () => {
  const parsed = parseToolProposal('propose_insert_blocks', {
    position: 'below',
    blocks: [createBlock('heading', 'h1')]
  });
  expect('kind' in parsed && parsed.kind === 'insert_blocks').toBe(true);
});

it('lists whole-lesson actions when there is no selected type', () => {
  expect(actionsForScope('lesson', null).length).toBeGreaterThan(0);
});
```

Also add tests for `delete_blocks` and `reorder_blocks` using `applyProposalToLesson`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/ai-agent.test.ts` — FAIL on new names

- [ ] **Step 3: Implement**

`AiChatRequestSchema`: `selected_block_id` optional; `scope` enum `block | section | lesson` default `lesson`; optional `lesson_snapshot_at` ISO datetime string.

New Zod + `AiProposal` kinds:

- `replace_lesson`: `{ kind, title?: string, cover?: CoverSchema optional, blocks: BlockSchema[].max` — enforce `countBlocksInTree(blocks) <= 48` in `parseToolProposal` }
- `delete_blocks`: `{ ids: z.array(z.string()).min(1) }`
- `reorder_blocks`: `{ parent: z.object({ kind: z.enum(['root','section','column','tab']), id: z.string().optional(), columnIndex: z.number().optional(), tabIndex: z.number().optional() }), ordered_ids: z.array(z.string()).min(1) }`
- `insert_blocks`: `anchor_block_id` optional; `blocks` max 48

`applyProposalToLesson(lesson, proposal, nextId)` returns `{ ok, message?, lesson }`. Keep `applyProposalToBlocks` as a wrapper that only returns `.blocks` for old tests, delegating to `applyProposalToLesson` with a stub lesson `{ ...minimal, blocks }`.

`actionsForScope`: add `'lesson'` → a short list: `build_lesson`, `reorganise`, `expand`, `condense`. When `scope === 'block' && !blockType` return the lesson list (composer never empty).

Add matching entries to `AI_TOOLS`.

- [ ] **Step 4: PASS** `npx vitest run tests/unit/ai-agent.test.ts`

- [ ] **Step 5: Commit** `feat: whole-lesson AI proposals and apply`

---

### Task 5: Context + protocols (no selected-block gate)

**Files:**
- Modify: `src/ai/context.ts`
- Modify: `tests/unit/ai-agent.test.ts` (context describe)
- Modify: `config/clementine-protocol.md`
- Modify: `config/ann-protocol.md`
- Modify: `prompts/clementine-school.md`
- Modify: `tests/unit/clementine-voice.test.ts` if it asserts selected-block wording

- [ ] **Step 1: Failing test** in `ai-agent.test.ts`:

`buildAiSystemPrompt` with `selectedBlockId: ''` / omitted and empty `lesson.blocks` includes `Scope: lesson`, does **not** say `No focus block found.` as a hard stop, and includes `Lesson outline` JSON (ids + types). Clementine path (`fullLesson: true`) includes `"blocks":` full JSON.

Change `AiContextInput.selectedBlockId` to `string | null` and add `fullLesson?: boolean`.

- [ ] **Step 2: FAIL then implement** — update output rules to list `propose_replace_lesson`, `propose_delete_blocks`, `propose_reorder_blocks`. Protocols: delete “work on the selected block/section only”; say propose schema-valid changes to any part of the lesson; never silent mutate.

- [ ] **Step 3: PASS** `npx vitest run tests/unit/ai-agent.test.ts tests/unit/clementine-voice.test.ts`

- [ ] **Step 4: Commit** `feat: AI context for whole-lesson and empty drafts`

---

### Task 6: Fast chat API without required selection

**Files:**
- Modify: `netlify/functions/ai-chat.mts`
- Modify: `src/ai/client.ts`
- Modify: `scripts/mock-api.ts` (POST `/api/ai/chat` body)
- Modify: `tests/unit/ai-chat-mock.test.ts`

- [ ] **Step 1: Failing test** — POST `/api/ai/chat` with `{ lesson_id, agent: 'ann', message: 'Build a heading' }` and **no** `selected_block_id` returns 200 SSE with `proposal` or `done` (mock may emit `review_only` or a replace_lesson fixture). Still 401 without cookie.

- [ ] **Step 2: FAIL** if mock still requires `selected_block_id`

- [ ] **Step 3: Implement**

`AiChatPayload.selected_block_id?: string`. In `ai-chat.mts`, if `selected_block_id` is missing, skip `findBlockById` 404. Pass `fullLesson: agent.slug === 'clementine'` into `buildAiSystemPrompt`. Empty blocks allowed.

Mock: if no selected block, stream a `propose_replace_lesson` with one heading (or `review_only` if easier) plus `done`.

- [ ] **Step 4: PASS** `npx vitest run tests/unit/ai-chat-mock.test.ts`

- [ ] **Step 5: Commit** `feat: AI chat works with no selected block`

---

### Task 7: Long-run jobs API

**Files:**
- Modify: `src/storage/keys.ts` — `aiJobKey(id)`, `aiTranscriptKey(lessonId, agent)`
- Modify: `netlify/functions/_shared/blobs.mts` re-exports
- Create: `netlify/functions/ai-jobs.mts` (`config.path` not used; two routes via query or two files). Prefer:
  - `netlify/functions/ai-jobs.mts` path `/api/ai/jobs` POST create
  - `netlify/functions/ai-job.mts` path `/api/ai/jobs/:id` GET status
- Create: `src/ai/jobs-client.ts`
- Modify: `scripts/mock-api.ts`
- Create: `tests/unit/ai-jobs-mock.test.ts`

Job record:

```ts
type AiJob = {
  id: string;
  lesson_id: string;
  agent: 'clementine' | 'ann' | 'hammond' | 'clare';
  status: 'working' | 'done' | 'error';
  snapshot_at: string;
  message: string;
  proposal?: AiProposal;
  error?: string;
  created_at: string;
};
```

- [ ] **Step 1: Failing test**

Auth required. POST `/api/ai/jobs` `{ lesson_id, agent: 'clementine', message: 'Build a lesson on X with six block types' }` → 202 `{ id, status: 'working' }`. GET `/api/ai/jobs/:id` eventually `done` with a `replace_lesson` proposal (mock can complete synchronously on GET, or complete on POST for tests). Failed archive still returns a job that can `done` with a proposal (archive failure is a chat note, not a dead job) — if archive is N/A in mock, skip. GET unknown id → 404.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

POST: teacher session, load draft lesson, snapshot, `setJSON` job `working`. Then call kernel:

```
POST ${KERNEL_URL}/lesson_proposal
headers: x-research-kernel-secret, Content-Type application/json
body: { query: message, lesson, transcript, archive already pulled via pullArchive }
```

If kernel URL/secret missing or 404 on `/lesson_proposal`, **fallback**: run the same Anthropic tool loop as `ai-chat.mts` with `fullLesson: true` (document in a comment that production minutes-scale needs the kernel job; mock always uses the in-process fixture). Write `done` + proposal or `error`.

GET returns the job JSON.

`jobs-client.ts`: `startAiJob`, `pollAiJob(id)` fetch JSON.

Transcript: append user/assistant turns to `aiTranscriptKey` (array max 50) on job complete and on fast chat in a later task if easy — **must** persist on job complete.

- [ ] **Step 4: PASS** `npx vitest run tests/unit/ai-jobs-mock.test.ts`

- [ ] **Step 5: Commit** `feat: Clementine long-run AI job start and poll`

---

### Task 8: AI panel — no gate, pulse, shelve, jobs for Clementine

**Files:**
- Modify: `src/teacher/ai-panel.ts`
- Modify: `src/ai/client.ts` if needed
- Create: `tests/unit/ai-panel.test.ts` (mount in happy-dom; if existing tests live only inside lesson-editor, still add a focused panel test)

`AiPanelHandle` add:

```ts
setSelection(...): void; // already
setWorking(working: boolean): void;
setShelved(shelved: boolean): void;
isWorking(): boolean;
```

- [ ] **Step 1: Failing tests**

- Composer enabled with `blockId: null`.
- Send on empty selection does not no-op.
- After send with `agentSlug === 'clementine'`, host has `ai-panel--working` until poll completes (mock `startAiJob` / `pollAiJob`).
- Ann still uses `streamAiChat`.
- Empty copy is **not** `Select a block or section to work with.`
- Scope chip may read `Lesson` or `Looking at: Heading` when selected — never disables send.
- Accept on `replace_lesson` calls `onAcceptProposal`.
- Optional: `onWorkingChange?: (working: boolean) => void` so the shelved strip can pulse.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement**

Remove `input.disabled = !hasSelection`. Pass `lesson_snapshot_at: new Date().toISOString()` on both chat and jobs (editor will supply via `getSnapshotAt: () => string` option).

New mount options:

```ts
getSnapshotAt: () => string;
onWorkingChange?: (working: boolean) => void;
onStaleAccept?: (apply: () => void) => void; // editor shows confirm
```

When Accept and `proposal` is mutating: if `getSnapshotAt()` !== job/chat snapshot stored on the message, call `onStaleAccept` with the apply closure; Cancel leaves `proposalStatus: 'pending'`.

Store `snapshotAt` on the `ChatMessage` when the proposal arrives.

- [ ] **Step 4: PASS** `npx vitest run tests/unit/ai-panel.test.ts`

- [ ] **Step 5: Commit** `feat: AI panel chats without a selected block`

---

### Task 9: Palette + page mount (canvas UI)

**Files:**
- Create: `src/teacher/lesson-canvas/kinds.ts` — `TEXT_LIKE_TYPES` set, `isTextLike(type)`
- Create: `src/teacher/lesson-canvas/mount-palette.ts`
- Create: `src/teacher/lesson-canvas/mount-page.ts`
- Create: `tests/unit/lesson-canvas-palette-mount.test.ts`
- Create: `tests/unit/lesson-canvas-page.test.ts`
- Modify: `src/styles/app.css`

**Look:** reuse `.btn`, paper surfaces, existing radius, navy focus rings. Family buttons are icon tiles, not grey mock squares. Flyout is a cotton card with shadow. Print control is an icon button (`aria-label="Print"`), not a large `.btn` labelled Print.

- [ ] **Step 1: Failing palette mount tests**

`mountLessonPalette(host, { families, onInsert, onDragStart })`:

- Renders family buttons (`data-family="Visualisation"`).
- Click opens flyout with cards (`data-block-type="concept_map"`); description visible.
- Second click / Escape / click-away (on `document`) closes flyout.
- `data-dragging="true"` on host during dragstart (page uses this to hide flyout).
- Click card calls `onInsert({ kind: 'block', type: 'heading' })` without requiring drop.
- `setShelved(true)` adds `lesson-palette--shelved`; edge tab `Blocks` unshelves.
- Disabled compositions family: no drag.

- [ ] **Step 2: FAIL then implement palette**

DnD: `dataTransfer.setData('application/x-teaching-hub-block', JSON.stringify(payload))` and `effectAllowed = 'copy'`.

- [ ] **Step 3: Failing page tests**

`mountLessonPage(host, { lesson, media, onChange, onPrint, onSelect })`:

- Title is a heading/contenteditable or input with class `lesson-page__title`, value = lesson.title; input fires `onChange` with new title. **No** `.lesson-editor__title-label` “Lesson title” stack required — tests in Task 10 will switch selectors; this module uses `lesson-page__*`.
- Cover host exists (reuse `mountCoverPicker`).
- Renders student-like blocks via `renderBlock(block, 'teacher')` for display; text-like blocks use existing `createBlockEditor` inline without up/down towers.
- Drop gap `lesson-page__gap` between blocks; drop of `heading` calls `onChange` with inserted block (use `createFromInsertMenu` + id factory passed in).
- Invalid drop (e.g. simulate drop columns into columns) sets `lesson-page__hint` text, no insert.
- Selecting a `concept_map` shows `.lesson-page__inspector` and toolbar Duplicate/Delete/visibility — **no** `.block-editor__move-up`.
- Print button `aria-label="Print"` calls `onPrint`.
- ⋯ menu contains “Save as lesson template”.
- During `document` drag with palette `data-dragging`, flyout is not required here; page gaps stay `pointer-events: auto`.

Pass `idFactory` and `insertAt` from Task 2.

Heavy blocks: `createBlockEditor` inside inspector only, not as the whole row chrome. Toolbar on the selected page block.

- [ ] **Step 4: CSS** in `app.css` under a `/* Lesson canvas */` section: three-column grid `.lesson-builder`, `.lesson-builder--rail-shelved`, `.lesson-builder--chat-shelved`, flyout `position: absolute` left of page, `z-index` below drag ghost, print icon 2rem, inspector max-height 12rem overflow auto. Match cotton tokens already in the file (`--paper`, `--navy`, etc. — use existing custom properties, do not invent a new palette).

- [ ] **Step 5: PASS** both canvas mount tests + `npx vitest run tests/unit/lesson-canvas-palette.test.ts tests/unit/lesson-canvas-drop.test.ts`

- [ ] **Step 6: Commit** `feat: lesson palette flyout and page canvas`

---

### Task 10: Rewire `lesson-editor.ts` and update its tests

**Files:**
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `tests/unit/lesson-editor.test.ts`
- Modify: `src/teacher/search/actions.ts` — `open-a4` title `Print lesson`, keywords `print`, `a4`
- Modify: `tests/unit/search-actions.test.ts`
- Modify: `tests/unit/a4-print.test.ts` only if editor no longer mounts `mountA4Preview` (keep `mountA4Preview` module for its unit tests; editor print calls `openPrintLesson` directly)

- [ ] **Step 1: Rewrite failing assertions in `lesson-editor.test.ts` first** (TDD against the new DOM):

- No `.lesson-editor__mode-tab` with text `A4`.
- No `.lesson-editor__add-block-select`.
- `.lesson-palette` and `.lesson-page` and `.ai-panel` exist.
- Print control present: `[aria-label="Print"]`.
- Title via `.lesson-page__title` (or input inside it) still saves on change (keep existing debounce/save tests, retarget selectors).
- Add heading: click family Basic → click card heading (or `onInsert` via card click) → a heading block appears.
- Composition tests: open Compositions family when mock returns compositions; click card; confirm copy vs linked (a small `dialog` or two buttons in the flyout footer). Retarget `.lesson-editor__insert-composition-copy` to the confirm control **or** keep those class names on the confirm buttons for less test churn.
- Linked badge / edit source / detach: still on the selected linked section chrome on the page (`lesson-editor__linked-badge` may remain).
- `openA4Preview()` on the handle still calls print (spy `openPrintLesson` or click the print control).

- [ ] **Step 2: Run** `npx vitest run tests/unit/lesson-editor.test.ts` — FAIL old selectors

- [ ] **Step 3: Implement editor shell**

Structure:

```
.lesson-builder
  .lesson-builder__rail    mountLessonPalette
  .lesson-builder__page    mountLessonPage + print
  .lesson-builder__chat    mountAiPanel
    .lesson-builder__chat-strip  (visible when shelved)
```

`[` / `]` keydown on `window` when target is not input/textarea/contenteditable.

`onAcceptProposal`: `applyProposalToLesson`; assign `lesson.title/cover/blocks`; `page.update(lesson)`; `saveNow({ checkpointReason: 'ai_accepted' })`.

Stale confirm: `window.confirm('You edited while the plan was built. Accept replaces the lesson with this plan.')`.

Remove A4 tab, `mountA4Preview`, add-block bar, fat template button from main column (template lives in ⋯).

Default chat **open**; rail **open**; cards closed.

- [ ] **Step 4: PASS** `npx vitest run tests/unit/lesson-editor.test.ts tests/unit/search-actions.test.ts tests/unit/a4-print.test.ts`

- [ ] **Step 5: Commit** `feat: rewire lesson editor to palette page and always-on chat`

---

### Task 11: Flyout-does-not-trap + invalid drop hint (editor-level)

**Files:**
- Modify: `tests/unit/lesson-canvas-palette-mount.test.ts` or `lesson-editor.test.ts`
- Modify: palette/page if gaps fail

- [ ] **Step 1: Test** that while `dragstart` is active on a card, `.lesson-palette__flyout` has `hidden` or class `lesson-palette__flyout--receded`, and a `.lesson-page__gap` can receive `drop`.

- [ ] **Step 2: FAIL if flyout still covers gaps** (`pointer-events: none` on flyout during drag is acceptable)

- [ ] **Step 3: Implement recede on `dragstart` / restore on `dragend`/`drop`**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `fix: recede block flyout while dragging onto the page`

---

### Task 12: Icons + visual pass

**Files:**
- Create: `public/assets/blocks/README.md` listing filenames: one svg per `InsertMenuValue` (`embed-pdf.svg`, etc.)
- Add Adam’s icons when the folder is provided; until then CSS fallback `.palette-card__icon` with the first letter is OK
- Modify: `src/styles/app.css` — spacing, type, no giant print, no mode tabs leftover rules (delete or leave unused `.lesson-editor__mode-tab` styles)

- [ ] **Step 1: Grep** `lesson-editor__mode-tab` and `a4-preview__meta` usage from editor CSS; stop styling a huge Print in the editor column.

- [ ] **Step 2: Manual check list in the plan (no screenshot suite):** rail tiles align; flyout readable; page title looks like a lesson title; chat matches existing `.ai-panel` cotton treatment.

- [ ] **Step 3: Commit** `feat: lesson builder cotton-glass chrome and block icon slots`

---

### Task 13: Regression sweep

- [ ] **Step 1: Run** `npm test`
Expected: all unit tests PASS. If `lesson-editor` composition tests fail, fix selectors — do not skip.

- [ ] **Step 2: Fix any breakage in `tests/unit/primary-nav.test.ts` / search if `open-a4` title changed.**

- [ ] **Step 3: Commit** only if fixes landed: `test: lesson builder canvas regression sweep`

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Three regions, cotton glass, no A4 tab | 9, 10, 12 |
| Shelve rail + chat independently, prefs | 3, 9, 10 |
| Flyout not a fourth column; recedes on drag | 9, 11 |
| Families + descriptions + icons | 1, 12 |
| Compositions family, empty disabled | 1, 10 |
| Drop gaps, nested validity, click-to-insert | 2, 9, 10 |
| Page-first + inspector for heavy | 9 |
| Print icon → existing print | 9, 10 |
| No up/down towers | 9, 10 |
| Whole-lesson tools, 48 cap, empty insert | 4 |
| Optional selection, empty lesson chat | 6, 8 |
| One Accept, never publish, stale warning | 8, 10 |
| Clementine job, full lesson, archive, transcript | 5, 7, 8 |
| Fast path other agents | 6, 8 |
| Protocols | 5 |
| AI down → canvas works | 10 (palette does not import client) |
| Homepage editors unchanged | (no tasks touch them) |
| Tests listed in spec | 1–11, 13 |

## Placeholder scan

No TBD. Kernel `/lesson_proposal` has an explicit Anthropic fallback if the worker route is missing. Icons have an explicit letter fallback until files arrive.
