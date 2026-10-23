# Lecture Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Teaching lesson's type is Lecture, students get a narrated, one-scene-at-a-time player with tap to reveal, gates, side paths, book note cues, hand-ups and a recap; the teacher gets narration recording in the editor, a hand-up queue and a small replay strip.

**Architecture:** The lecture reads the existing block tree. A pure `lectureScenes()` cuts it into scenes, and a pure state machine drives the player's main button. The player is a student render mode chosen in `lesson-view.ts`. Editor controls ride on the canvas's existing `decorateRow` hook, the same way block pulse attaches, so no block editor is rewritten. A new `lecture.mjs` server module stores hand-ups and one progress record per student, reusing the quiz's class-initials identity.

**Tech Stack:** TypeScript, plain DOM, Zod 3, Vitest + happy-dom (`apps/teaching`), Node `node:test` (root `tests/unit`), Netlify Functions + Blobs.

**Spec:** `docs/superpowers/specs/2026-10-23-lecture-player-design.md`

---

## Changes from the spec (found while mapping the code)

1. **Published lessons drop the lecture type.** `PublishedLessonSchema.pedagogical_mode` is `z.literal('quiz')` and `lesson-publish.mjs` only writes it for quizzes. Task 3 carries `'lecture'` through.
2. **Quiz questions can't be gates.** `prepareQuizPublish` deletes `quiz_question` blocks from every non-quiz lesson, so their answers never ship. Gates are **hinge question, cloze, self-check**. The hinge covers multiple choice.
3. **The hinge question is teacher-run.** It needs a session that the teacher opens. Task 10 adds a `solo` action: in a published lecture, a student answers alone, the server checks it against the draft and replies right or wrong. The answer still never ships in the published copy.
4. **A side path is a section placed right after its gate**, marked `side_path: true`, not blocks nested inside the gate. Every walker, filter, sanitiser and editor already handles sections. Linking by position (not by id) also survives lesson copying. The editor's **+ If wrong path** button inserts that section.
5. **Resume is per device** (`localStorage`). `continue.ts` picks a class's next lesson; it isn't a resume store.
6. **The progress record also keeps `missed` gate ids.** Cloze and self-check results live only on the device, so the replay strip needs this to show ✗ marks. That's a few ids per student.
7. **"Back to the lecture" continues right after the gate,** which is the scene after the gate when the gate is last. A gate can sit mid-scene when reveal is on.
8. **Identity.** Hand-ups and progress need the class link and the student's class initials, the same claim the quiz uses. Both share the device's class token, so a student who claimed for a quiz is already known. Opened without a class, the lecture plays fully but hides ✋ and sends nothing.
9. **Play as student opens from the lecture panel at the start.** In preview, the progress strip is clickable to jump to any scene. Opening at "the scene being edited" would need the canvas's selection, which the panel can't see; leave that for later.
10. **Finish is saved in the progress record** (`finished: true`, shown on the teacher strip). Adding a lecture column to the markbook is a separate build.

---

## File structure

**New: `apps/teaching/src/lecture/`**
| File | One job |
|---|---|
| `scenes.ts` | Pure cut of a block tree into scenes and beats; gate and side-path rules; takeaway cue |
| `state.ts` | Pure player state: main button action, reveal/next/tick/detour/return, back, answer, persistence |
| `answered.ts` | The `lecture:answered` DOM event that gate blocks fire |
| `narration.ts` | One `<audio>` for scene narration: play/pause, speed, progress, captions text |
| `api.ts` | Student calls to `/api/published/lecture/:id` |
| `player.ts` | Player DOM: title card, top strip, stage, bottom bar, hint, ✋ sheet, recap |
| `preview.ts` | Draft blocks for teacher preview (drops teacher-only, keeps hinge answers) |
| `tree.ts` | `insertAfter` and `nextSibling` in a block tree |
| `narration-field.ts` | Editor: record/upload/remove a narration clip, measure its length |
| `editor-tools.ts` | Editor decorator: narration pills, reveal toggle, takeaway, gate toggle, side path |
| `teacher-panel.ts` | Lecture panel above the canvas: Play as student, replay strip, hand-ups |
| `lecture.css` | Player and panel styles |

**New: other**
- `apps/teaching/src/blocks/note-cue.ts`: render and editor for the `note_cue` block
- `apps/teaching/src/blocks/hinge-question/solo.ts`: self-paced hinge for lectures
- `apps/teaching/public/assets/blocks/note_cue.svg`: insert-menu icon
- `netlify/functions/_shared/lecture.mjs`, `netlify/functions/published-lecture.mjs`, `netlify/functions/lecture.mjs`
- Tests: `apps/teaching/tests/unit/lecture-{schema,scenes,state,answered,player,editor-tools}.test.ts`, `note-cue-block.test.ts`; `tests/unit/lecture.test.js`, `tests/unit/hinge-solo.test.js`

**Modified**
- `apps/teaching/src/schemas/block.ts`: narration, reveal, takeaway, side_path, gate fields; `NoteCueBlockSchema`
- `apps/teaching/src/schemas/published-lesson.ts`: `pedagogical_mode` quiz|lecture
- `apps/teaching/src/blocks/{create-block,block-meta,registry,render,editors,search-text}.ts`, `src/schemas/publish-block-issues.ts`, `src/styles/app.css`
- `apps/teaching/src/blocks/hinge-question/index.ts`
- `apps/teaching/src/student/lesson-view.ts`
- `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`
- `netlify/functions/lesson-publish.mjs`, `netlify/functions/_shared/hinge.mjs`, `netlify/functions/_shared/quiz.mjs` (export `identify`), `netlify/functions/_shared/public-student-routes.mjs`
- Generated: `netlify/functions/_shared/teaching-block-schema.mjs`, `packages/block-styles/blocks.css`

**Commands used throughout**
- Teaching unit test: `cd apps/teaching && npx vitest run tests/unit/<file>`
- Teaching typecheck: `cd apps/teaching && npx tsc --noEmit`
- Server test: `node --test tests/unit/<file>` (from repo root)
- Regenerate: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs`

---

## Phase 1: data, scenes, player

### Task 1: Schema fields and the note cue block schema

**Files:**
- Modify: `apps/teaching/src/schemas/block.ts` (HeadingBlockSchema ~153, SectionBlockObjectSchema ~1728, HingeQuestionBlockSchema ~543, ClozeBlockSchema ~861, SelfCheckBlockSchema ~883, `BlockTypeSchema` ~24, `leafBlockSchemas` ~1569)
- Modify: `apps/teaching/src/schemas/published-lesson.ts:21`
- Modify: `apps/teaching/src/blocks/editors.ts:387-393` (heading editor drops new fields)
- Test: `apps/teaching/tests/unit/lecture-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { PublishedLessonSchema } from '@/schemas/published-lesson';
import { createHeadingEditor } from '@/blocks/editors';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium' } as const;
const narration = { url: '/api/media/m1/file', duration_s: 42, transcript: 'Today we look at tone.' };

describe('lecture schema fields', () => {
  it('keeps narration and reveal on a heading', () => {
    const parsed = BlockSchema.parse({ ...base, id: 'h1', block_type: 'heading', variant: 'section', content: { text: 'Tone', narration, reveal: 'all' } });
    expect(parsed.block_type === 'heading' && parsed.content).toEqual({ text: 'Tone', narration, reveal: 'all' });
  });

  it('keeps narration, takeaway and side_path on a section', () => {
    const parsed = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'Imagery', blocks: [], narration, takeaway: { enabled: false, prompt: 'One line' }, side_path: true } });
    expect(parsed.block_type === 'section' && parsed.content).toMatchObject({ narration, takeaway: { enabled: false, prompt: 'One line' }, side_path: true });
  });

  it('keeps the gate switch on hinge, cloze and self-check', () => {
    const cloze = BlockSchema.parse({ ...base, id: 'c1', block_type: 'cloze', content: { text: 'A [[b]] c', gate: false } });
    expect(cloze.block_type === 'cloze' && cloze.content.gate).toBe(false);
    const check = BlockSchema.parse({ ...base, id: 'k1', block_type: 'self_check', content: { mode: 'reveal', prompt: 'Why?', gate: true } });
    expect(check.block_type === 'self_check' && check.content.gate).toBe(true);
  });

  it('parses a note cue and rejects an unknown kind', () => {
    const cue = BlockSchema.parse({ ...base, id: 'n1', block_type: 'note_cue', content: { kind: 'copy', prompt: 'Write: juxtaposition' } });
    expect(cue.block_type).toBe('note_cue');
    expect(() => BlockSchema.parse({ ...base, id: 'n2', block_type: 'note_cue', content: { kind: 'essay', prompt: 'x' } })).toThrow();
  });

  it('allows a note cue inside a section', () => {
    const cue = { ...base, id: 'n1', block_type: 'note_cue', content: { kind: 'draw', prompt: 'Sketch it' } };
    expect(() => BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'A', blocks: [cue] } })).not.toThrow();
  });

  it('lets a published lesson say it is a lecture', () => {
    const lesson = { lesson_id: 'l1', title: 'T', unit_id: 'u1', blocks: [], published_at: '2026-10-23T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'lecture' };
    expect(PublishedLessonSchema.parse(lesson).pedagogical_mode).toBe('lecture');
  });

  it('the heading editor keeps narration when the text changes', () => {
    const block = BlockSchema.parse({ ...base, id: 'h1', block_type: 'heading', variant: 'section', content: { text: 'Tone', narration } }) as Extract<ReturnType<typeof BlockSchema.parse>, { block_type: 'heading' }>;
    let latest = block;
    const editor = createHeadingEditor(block, (next) => { latest = next; }, () => latest);
    const input = editor.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    input.value = 'Tone and mood';
    input.dispatchEvent(new Event('input'));
    expect(latest.content).toEqual({ text: 'Tone and mood', narration });
  });
});
```

- [ ] **Step 2: Run the test and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-schema.test.ts`
Expected: FAIL. The new fields are stripped by `z.object` and `note_cue` is an unknown discriminator.

- [ ] **Step 3: Add the schema fields**

In `block.ts`, above `HeadingBlockSchema`, add:

```ts
/** A scene's voiceover in a lecture: one short clip the teacher records. */
export const NarrationSchema = z.object({
  url: z.string().min(1),
  duration_s: z.number().min(0).max(900),
  transcript: z.string().max(8000).optional()
});
export type Narration = z.infer<typeof NarrationSchema>;

/** Lecture: a heading starts a scene. `one` reveals its blocks one tap at a time. */
export const RevealSchema = z.enum(['all', 'one']);
```

Change the heading content to:

```ts
  content: z.object({
    text: z.string(),
    narration: NarrationSchema.optional(),
    reveal: RevealSchema.optional()
  }),
```

In `SectionBlockObjectSchema.content`, after `link`, add:

```ts
    /** Lecture: the chapter intro clip. */
    narration: NarrationSchema.optional(),
    /** Lecture: a "write it in your book" cue at the chapter's end. On unless `enabled: false`. */
    takeaway: z.object({ enabled: z.boolean(), prompt: z.string().max(300).optional() }).optional(),
    /** Lecture: plays only after a wrong answer on the gate just above it. */
    side_path: z.boolean().optional()
```

In the `content` of `HingeQuestionBlockSchema`, `ClozeBlockSchema` and `SelfCheckBlockSchema`, add the last field:

```ts
    /** Lecture: students must answer before moving on. On unless false. */
    gate: z.boolean().optional()
```

After `SelfCheckBlockSchema`, add the note cue:

```ts
export const NOTE_CUE_KINDS = ['copy', 'own_words', 'draw', 'question'] as const;
export const NoteCueKindSchema = z.enum(NOTE_CUE_KINDS);

/** A prompt to write in their book. In a lecture it pauses until they tick Done. */
export const NoteCueBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('note_cue'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    kind: NoteCueKindSchema,
    prompt: z.string().max(500)
  }),
  ...blockLayout,
  ...blockTimestamps
});
```

Add `'note_cue',` to `BlockTypeSchema` after `'self_check'`, and `NoteCueBlockSchema,` to `leafBlockSchemas` after `SelfCheckBlockSchema`.

In `published-lesson.ts` line 21:

```ts
  /** Quiz lessons carry their settings; lectures play in the lecture player. */
  pedagogical_mode: z.enum(['quiz', 'lecture']).optional(),
```

In `editors.ts` `createHeadingEditor` `emitChange`, keep the other content fields:

```ts
  const emitChange = () => {
    const latest = getLatest();
    onChange({
      ...latest,
      variant: variantSelect.getValue() as typeof block.variant,
      content: { ...latest.content, text: textInput.value }
    });
  };
```

- [ ] **Step 4: Run the test and the typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-schema.test.ts && npx tsc --noEmit`
Expected: the tests PASS. `tsc` may report exhaustive `Record<Block['block_type'], …>` maps that now lack `note_cue`. Note each one; Task 2 fills them. If `tsc` fails only on those, carry on.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/schemas/block.ts apps/teaching/src/schemas/published-lesson.ts apps/teaching/src/blocks/editors.ts apps/teaching/tests/unit/lecture-schema.test.ts
git commit -m "Teaching lecture: schema for narration, reveal, takeaway, side paths, gates, note cue"
```

### Task 2: Note cue block (render, editor, menu, search, publish check)

**Files:**
- Create: `apps/teaching/src/blocks/note-cue.ts`, `apps/teaching/public/assets/blocks/note_cue.svg`
- Modify: `create-block.ts` (NEW_BLOCK_TYPES, NEW_BLOCK_LABEL, Learning group, UNIT_PLAN filter list, HOMEPAGE_EXCLUDED, `createBlock` switch), `block-meta.ts` (INSERT_MENU_DESCRIPTION, VECTOR_BLOCK_ICONS), `registry.ts`, `render.ts` (`renderBlockContent` switch), `editors.ts` (`createBlockEditorFields` switch), `search-text.ts`, `src/schemas/publish-block-issues.ts`, `src/styles/app.css`
- Test: `apps/teaching/tests/unit/note-cue-block.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/note-cue-block.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { publishBlockIssues } from '@/schemas/publish-block-issues';

describe('Note cue block', () => {
  it('is a lesson-only Learning block that round-trips', () => {
    const block = createBlock('note_cue', 'n1');
    expect(BlockSchema.parse(block)).toMatchObject({ block_type: 'note_cue', content: { kind: 'own_words', prompt: '' } });
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('note_cue');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('note_cue');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('note_cue');
    expect(blockRegistry.note_cue).toBeDefined();
  });

  it('renders the prompt under an "In your book" label', () => {
    const block = { ...createBlock('note_cue', 'n1'), content: { kind: 'copy', prompt: 'Write: juxtaposition' } } as ReturnType<typeof createBlock>;
    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-note-cue__label')?.textContent).toBe('In your book');
    expect(el.querySelector('.block-note-cue__kind')?.textContent).toBe('Copy this');
    expect(el.querySelector('.block-note-cue__prompt')?.textContent).toBe('Write: juxtaposition');
  });

  it('edits kind and prompt', () => {
    let latest = createBlock('note_cue', 'n1') as Extract<ReturnType<typeof createBlock>, { block_type: 'note_cue' }>;
    const editor = createBlockEditor(latest, (next) => { latest = next as typeof latest; }, () => latest);
    const prompt = editor.querySelector<HTMLTextAreaElement>('.block-editor__note-cue-prompt')!;
    prompt.value = 'Sketch the cycle';
    prompt.dispatchEvent(new Event('input'));
    const draw = editor.querySelector<HTMLButtonElement>('[data-kind="draw"]')!;
    draw.click();
    expect(latest.content).toEqual({ kind: 'draw', prompt: 'Sketch the cycle' });
  });

  it('blocks publishing an empty prompt', () => {
    const issues = publishBlockIssues([createBlock('note_cue', 'n1')]);
    expect(issues.map((i) => i.message)).toContain('Write the prompt for this note cue');
  });
});
```

(Check what `publish-block-issues.ts` exports with `grep -n "^export" apps/teaching/src/schemas/publish-block-issues.ts`, and use that name and return shape if it differs from `publishBlockIssues(blocks) → { blockId, message }[]`.)

- [ ] **Step 2: Run the test and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/note-cue-block.test.ts`
Expected: FAIL. `createBlock('note_cue')` isn't a known type.

- [ ] **Step 3: Write `note-cue.ts`**

```ts
// apps/teaching/src/blocks/note-cue.ts
import type { Block } from '@/schemas/block';
import { NOTE_CUE_KINDS } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';

type NoteCueBlock = Extract<Block, { block_type: 'note_cue' }>;
type Kind = NoteCueBlock['content']['kind'];

export const NOTE_CUE_KIND_LABEL: Record<Kind, string> = {
  copy: 'Copy this',
  own_words: 'Your own words',
  draw: 'Draw it',
  question: 'Question'
};

const PLACEHOLDER: Record<Kind, string> = {
  copy: 'Write: Juxtaposition — placing two contrasting things side by side.',
  own_words: 'In one sentence, why does the speaker change tone here?',
  draw: 'Sketch the cycle with all four stages labelled.',
  question: 'Write one thing you’re unsure about.'
};

/**
 * A prompt to write in their book. Notes always go in books, never the app.
 * A lecture stops on it until the student ticks Done (lecture/player.ts);
 * anywhere else it reads as a plain card.
 */
export function renderNoteCue(block: NoteCueBlock, _mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-note-cue block-note-cue--${block.content.kind}`;
  const head = document.createElement('p');
  head.className = 'block-note-cue__head';
  const icon = document.createElement('span');
  icon.className = 'block-note-cue__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📓';
  const label = document.createElement('span');
  label.className = 'block-note-cue__label';
  label.textContent = 'In your book';
  const kind = document.createElement('span');
  kind.className = 'block-note-cue__kind';
  kind.textContent = NOTE_CUE_KIND_LABEL[block.content.kind];
  head.append(icon, label, kind);
  const prompt = document.createElement('p');
  prompt.className = 'block-note-cue__prompt block-body';
  prompt.textContent = block.content.prompt;
  root.append(head, prompt);
  return root;
}

export function createNoteCueEditor(
  block: NoteCueBlock,
  onChange: BlockChangeHandler<NoteCueBlock>,
  getLatest: () => NoteCueBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';
  const kinds = document.createElement('div');
  kinds.className = 'block-editor__pills';
  kinds.setAttribute('role', 'radiogroup');
  kinds.setAttribute('aria-label', 'Kind of note');
  const prompt = document.createElement('textarea');
  prompt.className = 'block-editor__note-cue-prompt';
  prompt.rows = 2;
  prompt.value = block.content.prompt;
  prompt.setAttribute('aria-label', 'What should they write?');

  const emit = (patch: Partial<NoteCueBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const paint = () => {
    const current = getLatest().content.kind;
    prompt.placeholder = PLACEHOLDER[current];
    for (const pill of kinds.querySelectorAll<HTMLButtonElement>('button')) {
      pill.setAttribute('aria-checked', String(pill.dataset.kind === current));
    }
  };
  for (const kind of NOTE_CUE_KINDS) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'block-editor__pill';
    pill.dataset.kind = kind;
    pill.setAttribute('role', 'radio');
    pill.textContent = NOTE_CUE_KIND_LABEL[kind];
    pill.addEventListener('click', () => {
      emit({ kind });
      paint();
    });
    kinds.append(pill);
  }
  prompt.addEventListener('input', () => emit({ prompt: prompt.value }));
  fields.append(kinds, prompt);
  paint();
  return editorShell(block, onChange, fields, getLatest);
}
```

(Check that `editorShell` and `BlockChangeHandler` are exported from `editors.ts`: `grep -n "export function editorShell\|export type BlockChangeHandler" apps/teaching/src/blocks/*.ts`. If they live in another module, import from there. Kit pills use the `block-editor__pill` classes; check the class with `grep -n "block-editor__pill" apps/teaching/src/styles/app.css | head -3` and use the existing pill class if it's named differently.)

- [ ] **Step 4: Wire it in**

- `create-block.ts`: add `'note_cue'` to `NEW_BLOCK_TYPES` after `'self_check'`; `note_cue: 'Note cue'` to `NEW_BLOCK_LABEL`; add `'note_cue'` to the Learning group's `types` after `'self_check'`; add `'note_cue'` to the UNIT_PLAN filter array and to `HOMEPAGE_EXCLUDED`; in `createBlock`:

```ts
    case 'note_cue':
      return { ...shared, block_type: 'note_cue', variant: 'medium', content: { kind: 'own_words', prompt: '' } };
```

- `block-meta.ts`: `note_cue: 'Tell students to write something in their book: copy a term, put it in their own words, draw it, or note a question.',` and add `"note_cue"` to `VECTOR_BLOCK_ICONS`.
- `registry.ts`: `import { renderNoteCue, createNoteCueEditor } from '@/blocks/note-cue';` and `note_cue: { render: renderNoteCue, createEditor: createNoteCueEditor },`
- `render.ts` `renderBlockContent`: `case 'note_cue': return wrapBlock(renderNoteCue(block, mode), block, mode);`
- `editors.ts` `createBlockEditorFields`: `case 'note_cue': return createNoteCueEditor(block, onChange, latest as () => Extract<Block, { block_type: 'note_cue' }>);`
- `search-text.ts` `extractBlock`: `case 'note_cue': push(parts, c.prompt); break;`
- `publish-block-issues.ts`: `note_cue: 'Note cue',` in `KIND_LABEL`, and in `ownIssue`:

```ts
  if (block.block_type === 'note_cue' && !block.content.prompt.trim()) {
    return 'Write the prompt for this note cue';
  }
```

- `public/assets/blocks/note_cue.svg`, matching the line-art style of the others (check one, e.g. `hinge_question.svg`, for stroke width and viewBox):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h22a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H12z"/><path d="M12 6v36"/><path d="M18 16h14M18 22h14M18 28h8"/><path d="M34 30l6-6 3 3-6 6h-3z"/></svg>
```

- `app.css`, next to the self-check rules:

```css
.block-note-cue { border-radius: var(--radius-md); background: color-mix(in srgb, var(--marine) 7%, var(--paper)); border: 1px solid color-mix(in srgb, var(--marine) 22%, transparent); padding: var(--space-3) var(--space-4); }
.block-note-cue__head { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-1); font-size: var(--text-sm); }
.block-note-cue__label { font-weight: var(--weight-semibold); color: var(--ink); }
.block-note-cue__kind { color: var(--muted); }
.block-note-cue__kind::before { content: '·'; margin-right: var(--space-2); }
.block-note-cue__prompt { margin: 0; font-size: var(--text-lg, 1.125rem); }
```

- [ ] **Step 5: Run the tests, typecheck and regenerate**

Run: `cd apps/teaching && npx vitest run tests/unit/note-cue-block.test.ts tests/unit/lecture-schema.test.ts && npx tsc --noEmit && cd ../.. && node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs`
Expected: tests PASS, `tsc` clean (fill in any remaining `Record<block_type>` gaps it names), and the generated files update.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching netlify/functions/_shared/teaching-block-schema.mjs packages/block-styles/blocks.css
git commit -m "Teaching lecture: note cue block"
```

### Task 3: Publishing keeps the lecture type

**Files:**
- Modify: `netlify/functions/lesson-publish.mjs:216`
- Modify: `apps/teaching/src/schemas/published-lesson.ts` (`toPublishedLesson`)
- Test: `tests/integration/teaching-lecture-publish.test.js`

- [ ] **Step 1: Write the failing test.** First read the top of `tests/integration/teaching-versions.test.js` to copy how it builds a store, the operator request and the handler (the helpers vary). Then write:

```js
// tests/integration/teaching-lecture-publish.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonPublishHandler } from '../../netlify/functions/lesson-publish.mjs';
// Copy the store / request / seed helpers from teaching-versions.test.js here.

test('a lecture publishes with its type so students get the player', async () => {
  const { store, publish } = await setupWithLesson({ pedagogical_mode: 'lecture', blocks: [
    { id: 'h1', type: 'block', block_type: 'heading', variant: 'section', visibility: 'student_teacher', content: { text: 'Tone', narration: { url: '/api/media/m1/file', duration_s: 30 } } }
  ] });
  const res = await publish();
  assert.equal(res.status, 200);
  const snapshot = await store.get('published/lessons/lesson1', { type: 'json' });
  assert.equal(snapshot.pedagogical_mode, 'lecture');
  assert.equal(snapshot.blocks[0].content.narration.duration_s, 30);
});

test('an ordinary lesson publishes with no type', async () => {
  const { store, publish } = await setupWithLesson({ pedagogical_mode: 'lesson', blocks: [] });
  await publish();
  const snapshot = await store.get('published/lessons/lesson1', { type: 'json' });
  assert.equal(snapshot.pedagogical_mode, undefined);
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `node --test tests/integration/teaching-lecture-publish.test.js`
Expected: the first test FAILS (`pedagogical_mode` is undefined).

- [ ] **Step 3: Implement.** In `lesson-publish.mjs` replace the last spread of `snapshot`:

```js
      ...(quizPublish.quiz ? { pedagogical_mode: 'quiz', quiz: quizPublish.quiz.snapshot } : {}),
      ...(!quizPublish.quiz && draft.pedagogical_mode === 'lecture' ? { pedagogical_mode: 'lecture' } : {})
```

In `toPublishedLesson` (mock publish), after the `feedback_off` spread:

```ts
    ...(lesson.pedagogical_mode === 'lecture' ? { pedagogical_mode: 'lecture' as const } : {})
```

- [ ] **Step 4: Run it and check that it passes**

Run: `node --test tests/integration/teaching-lecture-publish.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lesson-publish.mjs apps/teaching/src/schemas/published-lesson.ts tests/integration/teaching-lecture-publish.test.js
git commit -m "Teaching lecture: publish keeps the lecture type"
```

### Task 4: Cutting a lecture into scenes

**Files:**
- Create: `apps/teaching/src/lecture/scenes.ts`
- Test: `apps/teaching/tests/unit/lecture-scenes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-scenes.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { lectureScenes, isGate, DEFAULT_TAKEAWAY } from '@/lecture/scenes';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}, variant = 'medium') =>
  ({ id, type: 'block', block_type, variant, visibility: 'student_teacher', content }) as unknown as Block;
const text = (id: string) => b(id, 'rich_text', { html: `<p>${id}</p>` });
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: `Heading ${id}`, ...extra }, 'section');
const section = (id: string, blocks: Block[], extra: Record<string, unknown> = {}) => b(id, 'section', { title: `Chapter ${id}`, blocks, ...extra });
const ids = (scene: { beats: Array<{ block: Block }> }) => scene.beats.map((x) => x.block.id);

describe('lectureScenes', () => {
  it('starts a scene at each heading and keeps the blocks after it', () => {
    const scenes = lectureScenes([heading('h1'), text('t1'), b('i1', 'image', { url: 'x' }), heading('h2'), text('t2')]);
    expect(scenes.map((s) => s.id)).toEqual(['h1', 'h2']);
    expect(ids(scenes[0]!)).toEqual(['t1', 'i1']);
    expect(scenes[0]!.label).toBe('Heading h1');
    expect(scenes[0]!.reveal).toBe('one');
  });

  it('puts blocks before the first heading in an opening scene', () => {
    const scenes = lectureScenes([text('t0'), heading('h1')]);
    expect(scenes[0]).toMatchObject({ id: 't0', label: 'Opening', heading: null });
  });

  it('keeps a column row as one beat', () => {
    const cols = b('c1', 'columns', { columns: [{ id: 'a', blocks: [text('x')] }, { id: 'b', blocks: [text('y')] }] });
    expect(ids(lectureScenes([heading('h1'), cols])[0]!)).toEqual(['c1']);
  });

  it('makes a section a chapter, with an intro scene when it has narration', () => {
    const narration = { url: 'u', duration_s: 10 };
    const scenes = lectureScenes([section('s1', [heading('h1'), text('t1')], { narration })]);
    expect(scenes.map((s) => s.id)).toEqual(['s1', 'h1']);
    expect(scenes[0]).toMatchObject({ intro: true, narration, chapter: { id: 's1', label: 'Chapter s1' } });
    expect(scenes[1]!.chapter?.id).toBe('s1');
  });

  it('skips the intro when a silent section starts with a heading', () => {
    expect(lectureScenes([section('s1', [heading('h1')])]).map((s) => s.id)).toEqual(['h1']);
  });

  it('ends a chapter with a takeaway cue unless switched off', () => {
    const on = lectureScenes([section('s1', [heading('h1'), text('t1')])]);
    const cue = on.at(-1)!.beats.at(-1)!.block;
    expect(cue).toMatchObject({ id: 's1__takeaway', block_type: 'note_cue', content: { kind: 'own_words', prompt: DEFAULT_TAKEAWAY('Chapter s1') } });
    const off = lectureScenes([section('s1', [heading('h1'), text('t1')], { takeaway: { enabled: false } })]);
    expect(ids(off.at(-1)!)).toEqual(['t1']);
  });

  it('uses the teacher’s takeaway wording', () => {
    const scenes = lectureScenes([section('s1', [text('t1')], { takeaway: { enabled: true, prompt: 'Your best line' } })]);
    expect(scenes[0]!.beats.at(-1)!.block).toMatchObject({ content: { prompt: 'Your best line' } });
  });

  it('marks gates and attaches the side path that follows a hinge or cloze', () => {
    const hinge = b('q1', 'hinge_question', { prompt: 'p', options: [] });
    const path = section('p1', [text('again')], { side_path: true });
    const scenes = lectureScenes([heading('h1'), hinge, path, text('after')]);
    expect(scenes).toHaveLength(1);
    expect(ids(scenes[0]!)).toEqual(['q1', 'after']);
    expect(scenes[0]!.beats[0]).toMatchObject({ gate: true, sidePath: { id: 'p1' } });
  });

  it('gives self-check no side path and respects gate: false', () => {
    const check = b('k1', 'self_check', { mode: 'reveal', prompt: 'p' });
    const off = b('k2', 'self_check', { mode: 'reveal', prompt: 'p', gate: false });
    const path = section('p1', [text('x')], { side_path: true });
    const [scene] = lectureScenes([heading('h1'), check, path, off]);
    expect(scene!.beats.map((x) => [x.block.id, x.gate, x.sidePath?.id ?? null])).toEqual([['k1', true, null], ['k2', false, null]]);
    expect(isGate(off)).toBe(false);
  });

  it('leaves out spacers, dividers and teacher notes', () => {
    const [scene] = lectureScenes([heading('h1'), b('sp', 'spacer'), b('d', 'divider'), b('tn', 'teacher_note', { html: '' }), text('t1')]);
    expect(ids(scene!)).toEqual(['t1']);
  });

  it('reads narration and reveal from the heading', () => {
    const [scene] = lectureScenes([heading('h1', { narration: { url: 'u', duration_s: 5 }, reveal: 'all' })]);
    expect(scene).toMatchObject({ narration: { url: 'u', duration_s: 5 }, reveal: 'all' });
  });
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-scenes.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `scenes.ts`**

```ts
// apps/teaching/src/lecture/scenes.ts
import type { Block, Narration } from '@/schemas/block';
import { shortLabel } from '@/teacher/focus/steps';

/**
 * A lecture plays one scene at a time. The teacher controls the cut through
 * how the lesson is built:
 *
 * - a section is a chapter; it gets an intro scene when it has narration or
 *   when blocks come before its first heading;
 * - a heading starts a scene, and everything up to the next heading belongs
 *   to it (unlike focus view, a second main block does not split a scene:
 *   tap to reveal handles long scenes);
 * - each block is one beat, and a column row is one block;
 * - hinge, cloze and self-check are gates unless switched off; a section
 *   marked `side_path` right after a hinge or cloze is that gate's second
 *   look, played only after a wrong answer;
 * - a chapter ends with a takeaway note cue unless switched off.
 */

type SectionBlock = Extract<Block, { block_type: 'section' }>;
export type GateBlock = Extract<Block, { block_type: 'hinge_question' | 'cloze' | 'self_check' }>;

export type Beat = { block: Block; gate: boolean; sidePath: SectionBlock | null };

export type LectureScene = {
  id: string;
  label: string;
  chapter: { id: string; label: string } | null;
  /** The heading that starts the scene; null for openings and chapter intros. */
  heading: Block | null;
  intro: boolean;
  narration: Narration | null;
  reveal: 'all' | 'one';
  beats: Beat[];
};

const GATE_TYPES = new Set<Block['block_type']>(['hinge_question', 'cloze', 'self_check']);
const SKIPPED = new Set<Block['block_type']>(['spacer', 'divider', 'teacher_note']);

export function isGate(block: Block): block is GateBlock {
  return GATE_TYPES.has(block.block_type) && (block.content as { gate?: boolean }).gate !== false;
}

export function takesSidePath(block: Block): boolean {
  return block.block_type === 'hinge_question' || block.block_type === 'cloze';
}

export function isSidePath(block: Block): block is SectionBlock {
  return block.block_type === 'section' && block.content.side_path === true;
}

export const DEFAULT_TAKEAWAY = (chapter: string): string =>
  `In your book: the one idea from ${chapter} you’d tell a friend.`;

export function takeawayCue(section: SectionBlock): Block | null {
  const takeaway = section.content.takeaway;
  if (takeaway?.enabled === false) return null;
  const chapter = section.content.title.trim() || 'this chapter';
  return {
    id: `${section.id}__takeaway`,
    type: 'block',
    block_type: 'note_cue',
    variant: 'medium',
    visibility: 'student_teacher',
    content: { kind: 'own_words', prompt: takeaway?.prompt?.trim() || DEFAULT_TAKEAWAY(chapter) }
  } as Block;
}

export function lectureScenes(blocks: readonly Block[]): LectureScene[] {
  const scenes: LectureScene[] = [];
  let open: LectureScene | null = null;

  const start = (scene: Omit<LectureScene, 'beats'>): LectureScene => {
    const next = { ...scene, beats: [] };
    scenes.push(next);
    open = next;
    return next;
  };

  function walk(list: readonly Block[], chapter: LectureScene['chapter']): void {
    list.forEach((block, i) => {
      if (isSidePath(block) || SKIPPED.has(block.block_type)) return;
      if (block.block_type === 'section') return chapterOf(block);
      if (block.block_type === 'heading') {
        start({
          id: block.id,
          label: shortLabel(block.content.text, `Part ${scenes.length + 1}`),
          chapter,
          heading: block,
          intro: false,
          narration: block.content.narration ?? null,
          reveal: block.content.reveal ?? 'one'
        });
        return;
      }
      const scene: LectureScene =
        open ??
        start({
          id: block.id,
          label: chapter?.label ?? (scenes.length === 0 ? 'Opening' : `Part ${scenes.length + 1}`),
          chapter,
          heading: null,
          intro: false,
          narration: null,
          reveal: 'one'
        });
      const gate = isGate(block);
      const next = list[i + 1];
      scene.beats.push({ block, gate, sidePath: gate && takesSidePath(block) && next && isSidePath(next) ? next : null });
    });
  }

  function chapterOf(section: SectionBlock): void {
    const chapter = { id: section.id, label: shortLabel(section.content.title, `Chapter ${scenes.length + 1}`) };
    open = null;
    const children = section.content.blocks as Block[];
    if (section.content.narration || children[0]?.block_type !== 'heading') {
      start({ id: section.id, label: chapter.label, chapter, heading: null, intro: true, narration: section.content.narration ?? null, reveal: 'one' });
    }
    walk(children, chapter);
    const cue = takeawayCue(section);
    const last: LectureScene | null = open;
    if (cue && last) last.beats.push({ block: cue, gate: false, sidePath: null });
    open = null;
  }

  walk(blocks, null);
  return scenes;
}

/** Every note cue in play order, takeaways included, for the recap. */
export function noteCues(scenes: readonly LectureScene[]): Array<{ block: Block; scene: LectureScene }> {
  return scenes.flatMap((scene) => scene.beats.filter((beat) => beat.block.block_type === 'note_cue').map((beat) => ({ block: beat.block, scene })));
}
```

(`shortLabel` is exported from `src/teacher/focus/steps.ts`. If Narration's import from `@/schemas/block` fails because Task 1 named it differently, use `z.infer<typeof NarrationSchema>`.)

- [ ] **Step 4: Run it and check that it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-scenes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/lecture/scenes.ts apps/teaching/tests/unit/lecture-scenes.test.ts
git commit -m "Teaching lecture: cut a lesson into scenes, gates and side paths"
```

### Task 5: Player state machine

**Files:**
- Create: `apps/teaching/src/lecture/state.ts`
- Test: `apps/teaching/tests/unit/lecture-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-state.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { lectureScenes } from '@/lecture/scenes';
import { act, answer, goTo, mainAction, restoreState, startState } from '@/lecture/state';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: id, ...extra });
const text = (id: string) => b(id, 'rich_text', { html: id });

const scenes = lectureScenes([
  heading('h1'), text('t1'), text('t2'),
  heading('h2'), b('q1', 'hinge_question', { prompt: 'p', options: [] }), b('p1', 'section', { title: 'again', blocks: [text('x')], side_path: true }), b('n1', 'note_cue', { kind: 'copy', prompt: 'w' }),
  heading('h3', { reveal: 'all' }), text('t3')
]);

describe('lecture state', () => {
  it('shows the first beat and offers Reveal with a count', () => {
    const s = startState(scenes);
    expect(s).toMatchObject({ scene: 0, shown: 1, reached: ['h1'] });
    expect(mainAction(s, scenes)).toEqual({ kind: 'reveal', label: 'Reveal · 2 of 2' });
  });

  it('moves to Next scene once everything is showing', () => {
    const s = act(startState(scenes), scenes, mainAction(startState(scenes), scenes));
    expect(s.shown).toBe(2);
    expect(mainAction(s, scenes)).toEqual({ kind: 'next', label: 'Next scene →' });
  });

  it('waits at a gate, then detours on a wrong answer, then returns', () => {
    let s = goTo(startState(scenes), scenes, 1);
    expect(mainAction(s, scenes)).toEqual({ kind: 'wait', label: 'Answer to continue' });
    s = answer(s, 'q1', 'wrong');
    expect(s.missed).toEqual(['q1']);
    expect(mainAction(s, scenes)).toEqual({ kind: 'detour', label: 'Let’s look again →', gateId: 'q1' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.detour).toBe('q1');
    expect(mainAction(s, scenes)).toEqual({ kind: 'return', label: 'Back to the lecture →' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.detour).toBeNull();
    expect(mainAction(s, scenes)).toEqual({ kind: 'reveal', label: 'Reveal · 2 of 2' });
  });

  it('carries on straight away after a right answer', () => {
    const s = answer(goTo(startState(scenes), scenes, 1), 'q1', 'right');
    expect(s.missed).toEqual([]);
    expect(mainAction(s, scenes).kind).toBe('reveal');
  });

  it('stops on a note cue until it is ticked', () => {
    let s = answer(goTo(startState(scenes), scenes, 1), 'q1', 'right');
    s = act(s, scenes, mainAction(s, scenes));
    expect(mainAction(s, scenes)).toEqual({ kind: 'tick', label: 'Done · I wrote it', noteId: 'n1' });
    s = act(s, scenes, mainAction(s, scenes));
    expect(s.ticked).toEqual(['n1']);
    expect(mainAction(s, scenes).kind).toBe('next');
  });

  it('shows everything at once in a Show all scene and ends on the recap', () => {
    const s = goTo(startState(scenes), scenes, 2);
    expect(s.shown).toBe(1);
    expect(mainAction(s, scenes)).toEqual({ kind: 'finish', label: 'See your recap →' });
    expect(act(s, scenes, mainAction(s, scenes)).finished).toBe(true);
  });

  it('counts a replay when going back to a scene already reached, and shows it whole', () => {
    let s = goTo(startState(scenes), scenes, 1);
    s = goTo(s, scenes, 0);
    expect(s.replays).toEqual({ h1: 1 });
    expect(s.shown).toBe(2);
  });

  it('restores a saved state and clamps it to the current scenes', () => {
    const saved = JSON.parse(JSON.stringify({ ...goTo(startState(scenes), scenes, 2), scene: 9 }));
    const s = restoreState(saved, scenes);
    expect(s.scene).toBe(2);
    expect(restoreState({ nonsense: true }, scenes)).toEqual(startState(scenes));
  });
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-state.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `state.ts`**

```ts
// apps/teaching/src/lecture/state.ts
import type { LectureScene } from './scenes';

export type GateResult = 'right' | 'wrong' | 'done';

export type LectureState = {
  scene: number;
  /** How many of the scene's beats are showing. */
  shown: number;
  /** The gate whose side path is playing, or null. */
  detour: string | null;
  answered: Record<string, GateResult>;
  ticked: string[];
  detoured: string[];
  missed: string[];
  reached: string[];
  replays: Record<string, number>;
  finished: boolean;
};

export type MainAction =
  | { kind: 'reveal'; label: string }
  | { kind: 'next'; label: string }
  | { kind: 'finish'; label: string }
  | { kind: 'wait'; label: string }
  | { kind: 'tick'; label: string; noteId: string }
  | { kind: 'detour'; label: string; gateId: string }
  | { kind: 'return'; label: string };

const add = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

function firstShown(scene: LectureScene | undefined): number {
  if (!scene) return 0;
  return scene.reveal === 'all' ? scene.beats.length : Math.min(1, scene.beats.length);
}

export function startState(scenes: readonly LectureScene[]): LectureState {
  return {
    scene: 0,
    shown: firstShown(scenes[0]),
    detour: null,
    answered: {},
    ticked: [],
    detoured: [],
    missed: [],
    reached: scenes[0] ? [scenes[0].id] : [],
    replays: {},
    finished: false
  };
}

/** What the big button does now. Gates and note cues hold it until they are done. */
export function mainAction(state: LectureState, scenes: readonly LectureScene[]): MainAction {
  if (state.detour) return { kind: 'return', label: 'Back to the lecture →' };
  const scene = scenes[state.scene];
  if (!scene) return { kind: 'finish', label: 'See your recap →' };
  for (const beat of scene.beats.slice(0, state.shown)) {
    const id = beat.block.id;
    if (beat.gate && !state.answered[id]) return { kind: 'wait', label: 'Answer to continue' };
    if (beat.gate && state.answered[id] === 'wrong' && beat.sidePath && !state.detoured.includes(id)) {
      return { kind: 'detour', label: 'Let’s look again →', gateId: id };
    }
    if (beat.block.block_type === 'note_cue' && !state.ticked.includes(id)) {
      return { kind: 'tick', label: 'Done · I wrote it', noteId: id };
    }
  }
  if (state.shown < scene.beats.length) return { kind: 'reveal', label: `Reveal · ${state.shown + 1} of ${scene.beats.length}` };
  if (state.scene < scenes.length - 1) return { kind: 'next', label: 'Next scene →' };
  return { kind: 'finish', label: 'See your recap →' };
}

export function act(state: LectureState, scenes: readonly LectureScene[], action: MainAction): LectureState {
  switch (action.kind) {
    case 'reveal':
      return { ...state, shown: state.shown + 1 };
    case 'next':
      return goTo(state, scenes, state.scene + 1);
    case 'finish':
      return { ...state, finished: true };
    case 'tick':
      return { ...state, ticked: add(state.ticked, action.noteId) };
    case 'detour':
      return { ...state, detour: action.gateId, detoured: add(state.detoured, action.gateId) };
    case 'return':
      return { ...state, detour: null };
    case 'wait':
      return state;
  }
}

/** A gate block reported its result. A miss is kept for the recap, even if they fix it later. */
export function answer(state: LectureState, gateId: string, result: GateResult): LectureState {
  return {
    ...state,
    answered: { ...state.answered, [gateId]: state.answered[gateId] === 'wrong' && result === 'right' ? 'right' : result },
    missed: result === 'wrong' ? add(state.missed, gateId) : state.missed
  };
}

/** Back, Next and preview jumps. A scene already reached opens whole and counts as a replay. */
export function goTo(state: LectureState, scenes: readonly LectureScene[], index: number): LectureState {
  const target = Math.max(0, Math.min(index, scenes.length - 1));
  const scene = scenes[target];
  if (!scene) return state;
  const seen = state.reached.includes(scene.id);
  return {
    ...state,
    scene: target,
    detour: null,
    shown: seen ? scene.beats.length : firstShown(scene),
    reached: add(state.reached, scene.id),
    replays: seen && target !== state.scene ? { ...state.replays, [scene.id]: (state.replays[scene.id] ?? 0) + 1 } : state.replays
  };
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);

/** A state read back from the device; anything odd starts fresh. */
export function restoreState(raw: unknown, scenes: readonly LectureScene[]): LectureState {
  const fresh = startState(scenes);
  if (!raw || typeof raw !== 'object' || typeof (raw as LectureState).scene !== 'number') return fresh;
  const r = raw as Partial<LectureState>;
  const scene = Math.max(0, Math.min(Math.floor(r.scene ?? 0), scenes.length - 1));
  const beats = scenes[scene]?.beats.length ?? 0;
  const results = Object.entries(r.answered ?? {}).filter(([, v]) => v === 'right' || v === 'wrong' || v === 'done');
  const replays = Object.entries(r.replays ?? {}).filter(([, v]) => typeof v === 'number' && v >= 0);
  return {
    scene,
    shown: Math.max(firstShown(scenes[scene]), Math.min(Math.floor(r.shown ?? 0), beats)),
    detour: null,
    answered: Object.fromEntries(results) as Record<string, GateResult>,
    ticked: strings(r.ticked),
    detoured: strings(r.detoured),
    missed: strings(r.missed),
    reached: strings(r.reached).length ? strings(r.reached) : fresh.reached,
    replays: Object.fromEntries(replays) as Record<string, number>,
    finished: r.finished === true
  };
}
```

- [ ] **Step 4: Run it and check that it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/lecture/state.ts apps/teaching/tests/unit/lecture-state.test.ts
git commit -m "Teaching lecture: player state for reveal, gates, side paths and note cues"
```

### Task 6: Gate blocks report their answers

**Files:**
- Create: `apps/teaching/src/lecture/answered.ts`
- Modify: `apps/teaching/src/blocks/render.ts` (`RenderContext` ~73; cloze check/reveal ~1786-1806; self-check checklist click ~1938, reveal toggle ~1970, confidence click ~1990)
- Test: `apps/teaching/tests/unit/lecture-answered.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-answered.test.ts
import { describe, it, expect } from 'vitest';
import { renderBlock } from '@/blocks/render';
import { LECTURE_ANSWERED, type AnsweredDetail } from '@/lecture/answered';
import type { Block } from '@/schemas/block';

const b = (id: string, block_type: string, content: Record<string, unknown>) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;

function listen(host: HTMLElement): AnsweredDetail[] {
  const got: AnsweredDetail[] = [];
  host.addEventListener(LECTURE_ANSWERED, (e) => got.push((e as CustomEvent<AnsweredDetail>).detail));
  return got;
}

describe('gate answers', () => {
  it('cloze reports right when every blank is right, wrong otherwise', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const el = renderBlock(b('c1', 'cloze', { text: 'The sky is [[blue]] and grass is [[green]].' }), 'student');
    host.append(el);
    const [a, c] = el.querySelectorAll<HTMLInputElement>('.block-cloze__blank');
    a!.value = 'blue';
    c!.value = 'red';
    el.querySelector<HTMLButtonElement>('.block-cloze__btn')!.click();
    c!.value = 'green';
    el.querySelector<HTMLButtonElement>('.block-cloze__btn')!.click();
    expect(got).toEqual([{ blockId: 'c1', result: 'wrong' }, { blockId: 'c1', result: 'right' }]);
  });

  it('self-check reports done when the answer is shown or a confidence is picked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const reveal = renderBlock(b('k1', 'self_check', { mode: 'reveal', prompt: 'Why?', answer: 'Because' }), 'student');
    const sure = renderBlock(b('k2', 'self_check', { mode: 'confidence', prompt: 'How sure?', answer: 'x' }), 'student');
    host.append(reveal, sure);
    reveal.querySelector<HTMLButtonElement>('.block-self-check__btn')!.click();
    sure.querySelector<HTMLButtonElement>('.block-self-check__confidence-btn')!.click();
    expect(got).toEqual([{ blockId: 'k1', result: 'done' }, { blockId: 'k2', result: 'done' }]);
  });
});
```

(Check the cloze blank syntax with `grep -n "export function parseClozeText" -A15 apps/teaching/src/blocks/*.ts` and use whatever marks a blank if it isn't `[[word]]`.)

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-answered.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement.** Write `answered.ts`:

```ts
// apps/teaching/src/lecture/answered.ts
import type { GateResult } from './state';

/**
 * Gate blocks fire this when a student answers. Outside a lecture nothing
 * listens; the lecture player listens on its stage to unlock the next beat.
 */
export const LECTURE_ANSWERED = 'lecture:answered';
export type AnsweredDetail = { blockId: string; result: GateResult };

export function emitAnswered(from: HTMLElement, blockId: string, result: GateResult): void {
  from.dispatchEvent(new CustomEvent<AnsweredDetail>(LECTURE_ANSWERED, { bubbles: true, detail: { blockId, result } }));
}
```

In `render.ts`, import `emitAnswered` and add to `RenderContext`:

```ts
  /** In the lecture player: `live` for students, `preview` for the teacher's Play as student. */
  lecture?: 'live' | 'preview';
```

Cloze `check` handler: after `persist();` add `emitAnswered(root, block.id, scoreValue === blanks.length ? 'right' : 'wrong');`. Cloze `reveal` handler: after `persist();` add `emitAnswered(root, block.id, 'wrong');`, because showing the answers counts as a miss.
Self-check checklist `checkbox` click: after `saveActivityState(...)` add `if (checked.size) emitAnswered(root, block.id, 'done');`. Reveal toggle: after `saveActivityState(...)` add `if (revealed) emitAnswered(root, block.id, 'done');`. Confidence button: after `saveActivityState(...)` add `emitAnswered(root, block.id, 'done');`.

- [ ] **Step 4: Run it and check that it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-answered.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/lecture/answered.ts apps/teaching/src/blocks/render.ts apps/teaching/tests/unit/lecture-answered.test.ts
git commit -m "Teaching lecture: cloze and self-check report answers to the player"
```

### Task 7: Narration controller

**Files:**
- Create: `apps/teaching/src/lecture/narration.ts`
- Test: covered in Task 8's player test (happy-dom `HTMLAudioElement` can't play; the test checks wiring, not sound)

- [ ] **Step 1: Write `narration.ts`**

```ts
// apps/teaching/src/lecture/narration.ts
import type { Narration } from '@/schemas/block';
import { el, readJSON, writeJSON } from '@/quiz/dom';

const RATES = [1, 1.25, 1.5] as const;
const RATE_KEY = 'lecture:rate';

export type NarrationHandle = {
  /** The play button, clip progress and speed, for the bottom bar. */
  el: HTMLElement;
  /** Swap to a scene's clip. Autoplays when allowed; otherwise waits for a tap. */
  load(narration: Narration | null): void;
  toggle(): void;
  pause(): void;
  /** Seconds into the current clip, for hand-ups. */
  time(): number;
  /** Called when a clip finishes or the scene has none (true), or starts playing (false). */
  onIdle(fn: (idle: boolean) => void): void;
  dispose(): void;
};

/**
 * One audio element for the whole lecture. Safari only lets a page play
 * sound after a tap, so the Start tap plays the first clip and later clips
 * reuse the same element. If a play is still refused, the button says so.
 */
export function createNarration(): NarrationHandle {
  const audio = new Audio();
  audio.preload = 'auto';
  let rate: number = RATES.includes(readJSON<number>(RATE_KEY) as 1) ? (readJSON<number>(RATE_KEY) as number) : 1;
  let idleFn: (idle: boolean) => void = () => {};
  let has = false;

  const root = el('div', 'lecture-narration');
  const play = el('button', 'lecture-narration__play');
  play.type = 'button';
  const track = el('div', 'lecture-narration__track');
  const fill = el('div', 'lecture-narration__fill');
  track.append(fill);
  track.setAttribute('aria-hidden', 'true');
  const speed = el('button', 'lecture-narration__speed');
  speed.type = 'button';
  root.append(play, track, speed);

  const paint = () => {
    root.hidden = !has;
    const playing = has && !audio.paused;
    play.textContent = playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
    speed.textContent = `${rate}×`;
    speed.setAttribute('aria-label', `Narration speed ${rate} times`);
    const pct = audio.duration > 0 && Number.isFinite(audio.duration) ? (audio.currentTime / audio.duration) * 100 : 0;
    fill.style.width = `${pct}%`;
  };

  const tryPlay = () => {
    audio.playbackRate = rate;
    void audio.play().catch(() => paint());
  };

  play.addEventListener('click', () => (audio.paused ? tryPlay() : audio.pause()));
  speed.addEventListener('click', () => {
    rate = RATES[(RATES.indexOf(rate as 1) + 1) % RATES.length]!;
    audio.playbackRate = rate;
    writeJSON(RATE_KEY, rate);
    paint();
  });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('play', () => { paint(); idleFn(false); });
  audio.addEventListener('pause', paint);
  audio.addEventListener('ended', () => { paint(); idleFn(true); });

  return {
    el: root,
    load(narration) {
      audio.pause();
      has = !!narration?.url;
      if (narration?.url) {
        audio.src = narration.url;
        tryPlay();
      } else {
        audio.removeAttribute('src');
        queueMicrotask(() => idleFn(true));
      }
      paint();
    },
    toggle: () => (audio.paused ? tryPlay() : audio.pause()),
    pause: () => audio.pause(),
    time: () => (Number.isFinite(audio.currentTime) ? Math.round(audio.currentTime) : 0),
    onIdle(fn) { idleFn = fn; },
    dispose() {
      audio.pause();
      audio.removeAttribute('src');
    }
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/teaching && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/teaching/src/lecture/narration.ts
git commit -m "Teaching lecture: narration controller"
```

### Task 8: The player, and routing lectures to it

**Files:**
- Create: `apps/teaching/src/lecture/player.ts`, `apps/teaching/src/lecture/lecture.css`, `apps/teaching/src/lecture/api.ts` (with the calls stubbed to an interface; the server lands in Task 11)
- Modify: `apps/teaching/src/student/lesson-view.ts` (`renderPublishedLesson`)
- Test: `apps/teaching/tests/unit/lecture-player.test.ts`

- [ ] **Step 1: Write the client API module** (Task 11 builds the server it calls)

```ts
// apps/teaching/src/lecture/api.ts
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';

export type LectureIdentity = { need: 'class' | 'initials' | null; initials: string | null };
export type MyHandup = { id: string; scene_id: string; scene_label: string; text: string; status: 'open' | 'answered'; reply: string; at: string };
export type LectureStatus = { identity: LectureIdentity; handups: MyHandup[] };
export type ProgressBody = { reached: string[]; replays: Record<string, number>; last_scene: string; missed: string[]; ticked: number; finished: boolean };

/** What the player needs from the server. Preview passes null and sends nothing. */
export type LectureClient = {
  status(): Promise<LectureStatus>;
  claim(initials: string): Promise<LectureStatus>;
  handup(input: { scene_id: string; scene_label: string; clip_s: number; text: string }): Promise<LectureStatus>;
  progress(body: ProgressBody, leaving?: boolean): void;
};

/**
 * Students are known by the class initials the quiz uses: the same device
 * token per class, so a student who claimed for a quiz is already known here.
 */
export function lectureClient(lessonId: string, classId: string | undefined): LectureClient {
  const endpoint = `/api/published/lecture/${encodeURIComponent(lessonId)}`;
  const classToken = classId ? deviceToken(`class:${classId}`) : null;
  const fields = classId ? { class_id: classId, ...(classToken ? { class_token: classToken } : {}) } : {};
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<LectureStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    handup: (input) => call('handup', input),
    progress(body, leaving = false) {
      const payload = JSON.stringify({ action: 'progress', ...fields, ...body });
      if (leaving) {
        void fetch(endpoint, { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
      } else {
        void apiPost(endpoint, JSON.parse(payload)).catch(() => {});
      }
    }
  };
}
```

(Check `apiPost` prefixes paths with the API base the same way `fetch` would here: `sed -n 1,90p apps/teaching/src/api/client.ts`. If it adds a base URL, build the keepalive URL the same way.)

- [ ] **Step 2: Write the failing player test**

```ts
// apps/teaching/tests/unit/lecture-player.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Block } from '@/schemas/block';
import { mountLecturePlayer } from '@/lecture/player';
import { emitAnswered } from '@/lecture/answered';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: `Scene ${id}`, ...extra });
const text = (id: string) => b(id, 'rich_text', { html: `<p>${id}</p>` });

const blocks: Block[] = [
  heading('h1', { narration: { url: '/a.webm', duration_s: 90, transcript: 'Hello class' } }), text('t1'), text('t2'),
  heading('h2'), b('k1', 'self_check', { mode: 'reveal', prompt: 'Why?', answer: 'Because' }), b('n1', 'note_cue', { kind: 'copy', prompt: 'Write it' })
];

function mount() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const handle = mountLecturePlayer(host, { lessonId: 'l1', title: 'Tone', blocks, client: null, renderHero: (h) => h.append(document.createElement('header')) });
  const main = () => host.querySelector<HTMLButtonElement>('.lecture-bar__main')!;
  return { host, handle, main };
}

describe('lecture player', () => {
  beforeEach(() => localStorage.clear());

  it('opens on a title card with running time and a book reminder', () => {
    const { host } = mount();
    expect(host.querySelector('.lecture-title__time')?.textContent).toBe('About 2 min');
    expect(host.textContent).toContain('You’ll need your book and a pen');
  });

  it('reveals beats one at a time with a counted button and placeholders', () => {
    const { host, main } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(main().textContent).toBe('Reveal · 2 of 2');
    expect(host.querySelectorAll('.lecture-beat--hidden')).toHaveLength(1);
    expect(host.querySelector('.lecture-beat--next')).not.toBeNull();
    main().click();
    expect(host.querySelectorAll('.lecture-beat--hidden')).toHaveLength(0);
    expect(main().textContent).toBe('Next scene →');
  });

  it('holds a gate until answered, then holds the note cue for three seconds', async () => {
    const { host, main } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    main().click();
    main().click();
    expect(main().textContent).toBe('Answer to continue');
    expect(main().disabled).toBe(true);
    emitAnswered(host.querySelector('[data-block-id="k1"]') as HTMLElement, 'k1', 'done');
    expect(main().textContent).toBe('Reveal · 2 of 2');
    main().click();
    expect(main().textContent).toBe('Done · I wrote it');
    expect(main().disabled).toBe(true);
  });

  it('shows the transcript as captions when CC is on', () => {
    const { host } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    const captions = host.querySelector<HTMLElement>('.lecture-captions')!;
    expect(captions.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('.lecture-bar__cc')!.click();
    expect(captions.hidden).toBe(false);
    expect(captions.textContent).toBe('Hello class');
  });

  it('comes back to the same scene', () => {
    const first = mount();
    first.host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    first.main().click();
    first.main().click();
    first.handle.dispose();
    const again = mount();
    expect(again.host.querySelector('.lecture-title__start')?.textContent).toBe('Pick up at Scene h2');
  });

  it('hides the hand-up button when there is no class', () => {
    const { host } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(host.querySelector<HTMLElement>('.lecture-strip__hand')!.hidden).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-player.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 4: Write `player.ts`**

```ts
// apps/teaching/src/lecture/player.ts
import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { lectureScenes, noteCues, type LectureScene } from './scenes';
import { act, answer, goTo, mainAction, restoreState, startState, type LectureState } from './state';
import { LECTURE_ANSWERED, type AnsweredDetail } from './answered';
import { createNarration } from './narration';
import type { LectureClient, LectureStatus, MyHandup } from './api';
import './lecture.css';

export type LecturePlayerOptions = {
  lessonId: string;
  title: string;
  blocks: Block[];
  /** Null in preview and when opened without a class: nothing is sent. */
  client: LectureClient | null;
  /** Draws the lesson's cover and title onto the title card. */
  renderHero: (host: HTMLElement) => void;
  /** Teacher preview: hinge answers check locally and the strip jumps to any scene. */
  preview?: boolean;
};

export type LecturePlayerHandle = { dispose(): void };

const NOTE_LOCK_MS = 3000;
const HINT_MS = 4000;
const SEND_EVERY = 3;

/**
 * The lecture player: a title card, then one scene at a time with its
 * narration, tap to reveal, gates and note cues, and a recap at the end.
 * The rules live in state.ts; this file only draws them.
 */
export function mountLecturePlayer(host: HTMLElement, options: LecturePlayerOptions): LecturePlayerHandle {
  const { lessonId, blocks, client, preview = false } = options;
  const scenes = lectureScenes(blocks);
  const saveKey = `lecture:${lessonId}:state`;
  let state: LectureState = restoreState(preview ? null : readJSON(saveKey), scenes);
  let status: LectureStatus | null = null;
  let localHandups: MyHandup[] = [];
  let hinted = false;
  let hintTimer = 0;
  let unsent = 0;
  const noteReady = new Map<string, number>();
  const narration = createNarration();

  const root = el('div', 'lecture');
  host.replaceChildren(root);

  const save = () => { if (!preview) writeJSON(saveKey, state); };
  const progressBody = () => ({
    reached: state.reached, replays: state.replays, last_scene: scenes[state.scene]?.id ?? '',
    missed: state.missed, ticked: state.ticked.length, finished: state.finished
  });
  const send = (leaving = false) => {
    if (!client || status?.identity.need) return;
    unsent = 0;
    client.progress(progressBody(), leaving);
  };
  const onLeave = () => { if (document.visibilityState === 'hidden') send(true); };
  document.addEventListener('visibilitychange', onLeave);

  // ---------- title card ----------
  function titleCard(): void {
    narration.pause();
    const card = el('section', 'lecture-title');
    options.renderHero(card);
    const total = scenes.reduce((sum, s) => sum + (s.narration?.duration_s ?? 0), 0);
    if (total > 0) card.append(el('p', 'lecture-title__time', `About ${Math.max(1, Math.round(total / 60))} min`));
    card.append(el('p', 'lecture-title__book', 'You’ll need your book and a pen.'));
    const who = el('div', 'lecture-title__who');
    const start = el('button', 'btn btn--primary lecture-title__start');
    start.type = 'button';
    const resumeAt = state.scene > 0 && !state.finished ? scenes[state.scene] : undefined;
    start.textContent = resumeAt ? `Pick up at ${resumeAt.label}` : 'Start';
    start.addEventListener('click', () => play());
    card.append(who, start);
    if (resumeAt) {
      const again = el('button', 'btn btn--ghost lecture-title__again', 'Start again');
      again.type = 'button';
      again.addEventListener('click', () => { state = startState(scenes); save(); play(); });
      card.append(again);
    }
    root.replaceChildren(card);
    paintWho(who, start);
  }

  function paintWho(who: HTMLElement, start: HTMLButtonElement): void {
    const need = status?.identity.need === 'initials';
    start.disabled = need;
    who.replaceChildren();
    if (!need) {
      if (status?.identity.initials) who.append(el('p', 'lecture-title__as', `Watching as ${status.identity.initials}`));
      return;
    }
    const input = el('input', 'qz-input lecture-title__initials');
    input.autocomplete = 'off';
    input.maxLength = 5;
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'button';
    const err = el('p', 'lecture-title__err');
    err.hidden = true;
    go.addEventListener('click', async () => {
      try {
        status = await client!.claim(input.value);
        paintWho(who, start);
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t work. Try again.';
        err.hidden = false;
      }
    });
    who.append(el('p', 'lecture-title__ask', 'Type your initials so your teacher can see your hand-ups.'), input, go, err);
  }

  // ---------- playing ----------
  const strip = el('header', 'lecture-strip');
  const chapterName = el('p', 'lecture-strip__chapter');
  const dots = el('ol', 'lecture-strip__dots');
  const hand = el('button', 'lecture-strip__hand', '✋ Lost me');
  hand.type = 'button';
  strip.append(chapterName, dots, hand);

  const stage = el('main', 'lecture-stage');
  const captions = el('p', 'lecture-captions');
  captions.hidden = true;
  const hint = el('p', 'lecture-hint', 'Tap Reveal for the next part');
  hint.hidden = true;

  const bar = el('footer', 'lecture-bar');
  const back = el('button', 'lecture-bar__back', '◀ Back');
  back.type = 'button';
  const cc = el('button', 'lecture-bar__cc', 'CC');
  cc.type = 'button';
  cc.setAttribute('aria-pressed', 'false');
  const main = el('button', 'btn btn--primary lecture-bar__main');
  main.type = 'button';
  bar.append(back, narration.el, cc, main);

  back.addEventListener('click', () => {
    if (state.detour) state = act(state, scenes, { kind: 'return', label: '' });
    else state = goTo(state, scenes, state.scene - 1);
    save();
    paintScene();
  });
  cc.addEventListener('click', () => {
    const on = cc.getAttribute('aria-pressed') !== 'true';
    cc.setAttribute('aria-pressed', String(on));
    paintCaptions();
  });
  main.addEventListener('click', () => {
    const action = mainAction(state, scenes);
    const before = state.scene;
    state = act(state, scenes, action);
    save();
    if (action.kind === 'finish') { send(); return recap(); }
    if (action.kind === 'detour' || action.kind === 'return' || state.scene !== before) {
      if (state.scene !== before && ++unsent >= SEND_EVERY) send();
      return paintScene();
    }
    revealUpTo();
    paintBar();
  });
  hand.addEventListener('click', () => openHandup());
  stage.addEventListener(LECTURE_ANSWERED, (e) => {
    const { blockId, result } = (e as CustomEvent<AnsweredDetail>).detail;
    state = answer(state, blockId, result);
    save();
    paintBar();
  });
  // A video or clip inside the scene pauses the narration.
  stage.addEventListener('play', () => narration.pause(), true);
  narration.onIdle((idle) => {
    window.clearTimeout(hintTimer);
    if (!idle || hinted) return;
    hintTimer = window.setTimeout(() => {
      const kind = mainAction(state, scenes).kind;
      if (kind !== 'reveal' && kind !== 'next') return;
      hinted = true;
      hint.hidden = false;
    }, HINT_MS);
  });

  const onKey = (e: KeyboardEvent) => {
    if (!root.contains(stage)) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, button, [contenteditable="true"]'))) return;
    if (e.key === ' ') { e.preventDefault(); narration.toggle(); }
    if (e.key === 'ArrowRight' && !main.disabled) { e.preventDefault(); main.click(); }
  };
  document.addEventListener('keydown', onKey);

  function play(): void {
    root.replaceChildren(strip, stage, captions, hint, bar);
    hand.hidden = !client || preview;
    paintScene();
  }

  function sceneBlocks(scene: LectureScene): Array<{ block: Block; beat: number }> {
    return scene.beats.map((beat, i) => ({ block: beat.block, beat: i }));
  }

  function paintScene(): void {
    window.clearTimeout(hintTimer);
    hint.hidden = true;
    const scene = scenes[state.scene];
    if (!scene) return recap();
    const detourGate = state.detour ? scene.beats.find((b) => b.block.id === state.detour) : null;
    chapterName.textContent = scene.chapter?.label ?? options.title;
    paintDots();
    stage.replaceChildren();
    stage.classList.toggle('lecture-stage--detour', !!detourGate);
    const ctx = { lessonId, pageBlocks: blocks, lecture: preview ? ('preview' as const) : ('live' as const) };
    if (detourGate?.sidePath) {
      stage.append(el('p', 'lecture-stage__detour', 'A second look'));
      stage.append(el('h2', 'lecture-stage__title', detourGate.sidePath.content.title || 'Let’s look again'));
      for (const child of detourGate.sidePath.content.blocks as Block[]) stage.append(beatEl(renderBlock(child, 'student', ctx), -1));
      narration.load(detourGate.sidePath.content.narration ?? null);
    } else {
      if (scene.heading) stage.append(renderBlock(scene.heading, 'student', ctx));
      else stage.append(el('h2', 'lecture-stage__title', scene.label));
      stage.classList.toggle('lecture-stage--single-image', scene.beats.length === 1 && scene.beats[0]!.block.block_type === 'image');
      for (const { block, beat } of sceneBlocks(scene)) stage.append(beatEl(renderBlock(block, 'student', ctx), beat));
      narration.load(scene.narration);
      revealUpTo();
    }
    paintCaptions();
    paintBar();
    stage.scrollTo?.({ top: 0 });
  }

  function beatEl(content: HTMLElement, beat: number): HTMLElement {
    const wrap = el('div', 'lecture-beat');
    wrap.dataset.beat = String(beat);
    wrap.append(content);
    return wrap;
  }

  function revealUpTo(): void {
    const beats = stage.querySelectorAll<HTMLElement>('.lecture-beat[data-beat]');
    let marked = false;
    for (const beat of beats) {
      const i = Number(beat.dataset.beat);
      if (i < 0) continue;
      const hidden = i >= state.shown;
      if (!hidden && beat.classList.contains('lecture-beat--hidden')) beat.classList.add('lecture-beat--in');
      beat.classList.toggle('lecture-beat--hidden', hidden);
      beat.classList.toggle('lecture-beat--next', hidden && !marked);
      if (hidden) marked = true;
      beat.inert = hidden;
      beat.setAttribute('aria-hidden', String(hidden));
    }
    hint.hidden = true;
  }

  function paintDots(): void {
    dots.replaceChildren();
    scenes.forEach((scene, i) => {
      const dot = el('li', 'lecture-strip__dot');
      if (scene.chapter && scene.chapter.id === scene.id) dot.classList.add('lecture-strip__dot--chapter');
      if (scene.beats.some((b) => b.gate)) dot.classList.add('lecture-strip__dot--gate');
      if (scene.beats.some((b) => b.block.block_type === 'note_cue')) dot.classList.add('lecture-strip__dot--note');
      if (state.reached.includes(scene.id)) dot.classList.add('lecture-strip__dot--seen');
      if (i === state.scene) {
        dot.classList.add('lecture-strip__dot--here');
        dot.setAttribute('aria-current', 'step');
        if (state.detour) dot.classList.add('lecture-strip__dot--detour');
      }
      dot.title = scene.label;
      if (preview) {
        dot.tabIndex = 0;
        dot.addEventListener('click', () => { state = goTo(state, scenes, i); paintScene(); });
      }
      dots.append(dot);
    });
    dots.setAttribute('aria-label', `Scene ${state.scene + 1} of ${scenes.length}`);
  }

  function paintCaptions(): void {
    const scene = scenes[state.scene];
    const gate = state.detour ? scene?.beats.find((b) => b.block.id === state.detour) : null;
    const text = (gate?.sidePath?.content.narration ?? scene?.narration)?.transcript ?? '';
    captions.textContent = text;
    captions.hidden = cc.getAttribute('aria-pressed') !== 'true' || !text;
    cc.hidden = !text;
  }

  function paintBar(): void {
    const action = mainAction(state, scenes);
    main.textContent = action.label;
    main.disabled = action.kind === 'wait';
    back.disabled = state.scene === 0 && !state.detour;
    if (action.kind === 'tick') {
      const ready = noteReady.get(action.noteId) ?? Date.now() + NOTE_LOCK_MS;
      noteReady.set(action.noteId, ready);
      const left = ready - Date.now();
      if (left > 0) {
        main.disabled = true;
        window.setTimeout(paintBar, left);
      }
    }
  }

  // ---------- hand-up ----------
  function openHandup(prefill = ''): void {
    if (!client) return;
    const scene = scenes[state.scene];
    if (!scene) return;
    const sheet = el('dialog', 'lecture-sheet');
    const form = el('form', 'lecture-sheet__form');
    form.method = 'dialog';
    form.append(el('p', 'lecture-sheet__title', `✋ ${scene.label}`));
    const box = el('textarea', 'lecture-sheet__text');
    box.maxLength = 500;
    box.rows = 3;
    box.placeholder = 'What lost you? (optional)';
    box.value = prefill;
    const sendBtn = el('button', 'btn btn--primary', 'Send to my teacher');
    sendBtn.type = 'button';
    const cancel = el('button', 'btn btn--ghost', 'Cancel');
    cancel.type = 'button';
    const note = el('p', 'lecture-sheet__note');
    note.setAttribute('role', 'status');
    cancel.addEventListener('click', () => sheet.close());
    sendBtn.addEventListener('click', async () => {
      sendBtn.disabled = true;
      try {
        status = await client.handup({ scene_id: scene.id, scene_label: scene.label, clip_s: narration.time(), text: box.value.trim() });
        localHandups = [];
        note.textContent = 'Sent. Your teacher will see it.';
        window.setTimeout(() => sheet.close(), 1200);
      } catch (e) {
        note.textContent = e instanceof Error ? e.message : 'That didn’t send. Try again.';
        sendBtn.disabled = false;
      }
    });
    form.append(box, note, sendBtn, cancel);
    sheet.append(form);
    sheet.addEventListener('close', () => sheet.remove());
    root.append(sheet);
    sheet.showModal?.();
  }
  // A Question note cue offers the hand-up straight from its card.
  stage.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('.lecture-raise');
    if (link) openHandup((link as HTMLElement).dataset.prompt ?? '');
  });

  // ---------- recap ----------
  function recap(): void {
    narration.pause();
    const page = el('section', 'lecture-recap');
    page.append(el('h2', 'lecture-recap__title', 'Recap'));
    const notes = el('ul', 'lecture-recap__list');
    for (const { block } of noteCues(scenes)) {
      const done = state.ticked.includes(block.id);
      const item = el('li', `lecture-recap__note${done ? ' lecture-recap__note--done' : ''}`);
      item.append(el('span', 'lecture-recap__mark', done ? '✓' : '○'), el('span', '', (block.content as { prompt: string }).prompt));
      notes.append(item);
    }
    if (notes.childElementCount) page.append(el('h3', 'lecture-recap__head', 'In your book'), notes);
    const missed = scenes.flatMap((scene, i) => scene.beats.filter((b) => state.missed.includes(b.block.id)).map(() => ({ scene, i })));
    if (missed.length) {
      const list = el('ul', 'lecture-recap__list');
      for (const { scene, i } of missed) {
        const item = el('li');
        const go = el('button', 'btn btn--ghost', `Look again: ${scene.label}`);
        go.type = 'button';
        go.addEventListener('click', () => { state = goTo({ ...state, finished: false }, scenes, i); play(); });
        item.append(go);
        list.append(item);
      }
      page.append(el('h3', 'lecture-recap__head', 'Look again'), list);
    }
    const mine = [...(status?.handups ?? []), ...localHandups];
    if (mine.length) {
      const list = el('ul', 'lecture-recap__list');
      for (const h of mine) {
        const item = el('li', 'lecture-recap__handup');
        item.append(el('p', '', `✋ ${h.scene_label}${h.text ? `: ${h.text}` : ''}`));
        item.append(el('p', 'lecture-recap__reply', h.status === 'answered' ? `Your teacher: ${h.reply || 'Answered.'}` : 'Waiting for your teacher.'));
        list.append(item);
      }
      page.append(el('h3', 'lecture-recap__head', 'Your hand-ups'), list);
    }
    const finish = el('button', 'btn btn--primary lecture-recap__finish', state.finished ? 'Finished ✓' : 'Finish');
    finish.type = 'button';
    finish.addEventListener('click', () => {
      state = { ...state, finished: true };
      save();
      send();
      finish.textContent = 'Finished ✓';
    });
    page.append(finish);
    root.replaceChildren(page);
  }

  titleCard();
  if (client && !preview) {
    void client.status().then((next) => {
      status = next;
      if (root.querySelector('.lecture-title')) titleCard();
    }).catch(() => {});
  }

  return {
    dispose() {
      send(true);
      narration.dispose();
      window.clearTimeout(hintTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onLeave);
    }
  };
}
```

The note cue's **Raise it with ✋** link: in `note-cue.ts` `renderNoteCue`, for `kind === 'question'`, append a button the player picks up by class:

```ts
  if (block.content.kind === 'question') {
    const raise = document.createElement('button');
    raise.type = 'button';
    raise.className = 'lecture-raise';
    raise.dataset.prompt = block.content.prompt;
    raise.textContent = 'Raise it with ✋';
    root.append(raise);
  }
```

and hide it outside the player in `lecture.css` with `.lecture-raise { display: none; } .lecture .lecture-raise { display: inline-flex; }`. Put `.lecture-raise { display: none; }` in `app.css` as well, because `lecture.css` only loads with the player.

- [ ] **Step 5: Write `lecture.css`**

```css
/* apps/teaching/src/lecture/lecture.css */
.lecture { display: grid; grid-template-rows: auto 1fr auto auto auto; min-height: calc(100dvh - 4rem); max-width: 72rem; margin: 0 auto; }
.lecture-title { display: grid; gap: var(--space-3); justify-items: start; padding: var(--space-4) 0; }
.lecture-title__time, .lecture-title__book { margin: 0; color: var(--muted); }
.lecture-title__book { font-weight: var(--weight-semibold); color: var(--ink); }
.lecture-title__who { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.lecture-strip { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: 1fr auto; gap: var(--space-1) var(--space-3); align-items: center; padding: var(--space-2) 0; background: var(--paper); }
.lecture-strip__chapter { margin: 0; font-size: var(--text-sm); color: var(--muted); }
.lecture-strip__dots { grid-column: 1 / -1; grid-row: 2; display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
.lecture-strip__dot { flex: 1; height: 4px; border-radius: var(--radius-full); background: var(--line); position: relative; }
.lecture-strip__dot--seen { background: color-mix(in srgb, var(--marine) 45%, var(--line)); }
.lecture-strip__dot--here { background: var(--marine); }
.lecture-strip__dot--detour { background: var(--amber, #c98a1b); }
.lecture-strip__dot--chapter { margin-left: 6px; }
.lecture-strip__dot--gate::after, .lecture-strip__dot--note::after { content: ''; position: absolute; right: 2px; top: -3px; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--marine); }
.lecture-strip__dot--note::after { border-color: var(--muted); }
.lecture-strip__hand { grid-column: 2; grid-row: 1; border: 1px solid var(--line); background: var(--paper); border-radius: var(--radius-full); padding: var(--space-1) var(--space-3); font-size: var(--text-sm); }
.lecture-stage { display: grid; gap: var(--space-4); align-content: start; padding: var(--space-4) 0 var(--space-6, 3rem); max-width: 46rem; width: 100%; margin: 0 auto; }
.lecture-stage--single-image { max-width: none; }
.lecture-stage--single-image .lecture-beat img { width: 100%; max-height: 70dvh; object-fit: contain; }
.lecture-stage--detour { border-left: 4px solid var(--amber, #c98a1b); padding-left: var(--space-3); }
.lecture-stage__detour { margin: 0; color: var(--amber, #c98a1b); font-weight: var(--weight-semibold); font-size: var(--text-sm); }
.lecture-stage__title { margin: 0; font-size: var(--text-xl); }
.lecture-beat--hidden { min-height: 3.5rem; border: 2px dashed var(--line); border-radius: var(--radius-md); }
.lecture-beat--hidden > * { visibility: hidden; max-height: 3rem; overflow: hidden; }
.lecture-beat--next { animation: lecture-pulse 1.6s ease-in-out infinite; }
.lecture-beat--in { animation: lecture-in 260ms ease-out; }
@keyframes lecture-pulse { 50% { border-color: color-mix(in srgb, var(--marine) 55%, var(--line)); } }
@keyframes lecture-in { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .lecture-beat--next, .lecture-beat--in { animation: none; } }
.lecture-captions { margin: 0 auto; max-width: 46rem; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: color-mix(in srgb, var(--ink) 6%, var(--paper)); font-size: var(--text-sm); }
.lecture-hint { margin: 0 auto var(--space-2); color: var(--muted); font-size: var(--text-sm); text-align: center; }
.lecture-bar { position: sticky; bottom: 0; display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2) 0 calc(var(--space-2) + env(safe-area-inset-bottom)); background: var(--paper); border-top: 1px solid var(--line); }
.lecture-bar button { min-height: 44px; }
.lecture-bar__back, .lecture-bar__cc { border: 1px solid var(--line); background: var(--paper); border-radius: var(--radius-md); padding: 0 var(--space-3); }
.lecture-bar__cc[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.lecture-bar__main { margin-left: auto; min-width: 11rem; }
.lecture-narration { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
.lecture-narration__play { width: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); }
.lecture-narration__track { flex: 1; height: 4px; border-radius: var(--radius-full); background: var(--line); overflow: hidden; }
.lecture-narration__fill { height: 100%; width: 0; background: var(--marine); }
.lecture-narration__speed { border: 0; background: none; font-size: var(--text-sm); color: var(--muted); }
.lecture-sheet { border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-4); max-width: 28rem; width: calc(100% - 2rem); }
.lecture-sheet__form { display: grid; gap: var(--space-2); }
.lecture-sheet__title { margin: 0; font-weight: var(--weight-semibold); }
.lecture-sheet__text { width: 100%; }
.lecture-recap { display: grid; gap: var(--space-3); max-width: 46rem; margin: 0 auto; padding: var(--space-4) 0; }
.lecture-recap__list { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-2); }
.lecture-recap__note { display: flex; gap: var(--space-2); }
.lecture-recap__note--done .lecture-recap__mark { color: var(--success); }
.lecture-recap__reply { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.lecture .lecture-raise { display: inline-flex; margin-top: var(--space-2); border: 0; background: none; color: var(--marine); padding: 0; text-decoration: underline; }
@media (max-width: 600px) {
  .lecture-bar { flex-wrap: wrap; }
  .lecture-narration { order: -1; flex-basis: 100%; }
  .lecture-bar__main { flex: 1; min-width: 0; }
}
```

- [ ] **Step 6: Route lectures to the player.** In `lesson-view.ts`, import `mountLecturePlayer`, `lectureClient` and `isSidePath`. At the top of `renderPublishedLesson`, after `content.replaceChildren();`:

```ts
  if (lesson.pedagogical_mode === 'lecture') {
    const classId = extras?.cls?.id;
    lecturePlayer?.dispose();
    lecturePlayer = mountLecturePlayer(content, {
      lessonId: lesson.lesson_id,
      title: lesson.title,
      blocks: lesson.blocks,
      client: classId ? lectureClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => { renderPublishedLessonHero(hostEl, lesson, extras?.cls); }
    });
    return;
  }
```

Declare `let lecturePlayer: LecturePlayerHandle | null = null;` at module level, import the type, and call `lecturePlayer?.dispose(); lecturePlayer = null;` inside the `dispose()` that `mountStudentLessonView` returns. In the ordinary-lesson block loop add `if (isSidePath(block)) continue;`, so a side path never shows as a loose section on a normal page. `renderLessonNav` still runs after the player for class lessons, which is fine (it sits below the recap).

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-player.test.ts tests/unit/lecture-state.test.ts tests/unit/lecture-scenes.test.ts && npx tsc --noEmit`
Expected: PASS and clean. If happy-dom lacks `HTMLElement.inert` or `dialog.showModal`, the code already guards `showModal?.()`; for `inert`, cast as `(beat as HTMLElement & { inert: boolean }).inert = hidden` if `tsc` complains.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/lecture apps/teaching/src/blocks/note-cue.ts apps/teaching/src/styles/app.css apps/teaching/src/student/lesson-view.ts apps/teaching/tests/unit/lecture-player.test.ts
git commit -m "Teaching lecture: student player with narration, reveal, gates, note cues and recap"
```

### Task 9: Editor controls on the canvas

**Files:**
- Create: `apps/teaching/src/lecture/tree.ts`, `apps/teaching/src/lecture/narration-field.ts`, `apps/teaching/src/lecture/editor-tools.ts`
- Modify: `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (~988-1050)
- Test: `apps/teaching/tests/unit/lecture-editor-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-editor-tools.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { insertAfter, nextSibling } from '@/lecture/tree';
import { createLectureEditorTools } from '@/lecture/editor-tools';
import { renderBlock } from '@/blocks/render';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as unknown as Block;

describe('lecture tree helpers', () => {
  it('inserts after a block inside a section and finds its next sibling', () => {
    const blocks = [b('s1', 'section', { title: 'A', blocks: [b('q1', 'cloze', { text: 'x' }), b('t1', 'rich_text', { html: '' })] })];
    const next = insertAfter(blocks, 'q1', b('p1', 'section', { title: 'again', blocks: [], side_path: true }));
    const inner = (next[0]!.content as { blocks: Block[] }).blocks.map((x) => x.id);
    expect(inner).toEqual(['q1', 'p1', 't1']);
    expect(nextSibling(next, 'q1')?.id).toBe('p1');
  });
});

describe('lecture editor tools', () => {
  function setup(blocks: Block[], lecture = true) {
    let current = blocks;
    const tools = createLectureEditorTools({ isLecture: () => lecture, getBlocks: () => current, onBlocks: (next) => { current = next; }, idFactory: () => 'new1' });
    const row = document.createElement('div');
    row.append(renderBlock(blocks[0]!, 'teacher'));
    tools.decorate(row, blocks[0]!);
    return { row, current: () => current };
  }

  it('does nothing outside a lecture', () => {
    const { row } = setup([b('h1', 'heading', { text: 'A' })], false);
    expect(row.querySelector('.lecture-tools')).toBeNull();
  });

  it('gives a heading a record pill and a reveal toggle', () => {
    const { row, current } = setup([b('h1', 'heading', { text: 'A' })]);
    expect(row.querySelector('.lecture-tools .narration-field')).not.toBeNull();
    row.querySelector<HTMLButtonElement>('[data-reveal="all"]')!.click();
    expect((current()[0]!.content as { reveal?: string }).reveal).toBe('all');
  });

  it('lets a gate switch off and add an If wrong path', () => {
    const { row, current } = setup([b('q1', 'cloze', { text: 'x' })]);
    row.querySelector<HTMLButtonElement>('.lecture-tools__side-path')!.click();
    expect(current().map((x) => x.id)).toEqual(['q1', 'new1']);
    expect(current()[1]).toMatchObject({ block_type: 'section', content: { title: 'Let’s look again', side_path: true, blocks: [] } });
    row.querySelector<HTMLInputElement>('.lecture-tools__gate input')!.click();
    expect((current()[0]!.content as { gate?: boolean }).gate).toBe(false);
  });

  it('gives a chapter a takeaway switch and wording', () => {
    const { row, current } = setup([b('s1', 'section', { title: 'Imagery', blocks: [] })]);
    const words = row.querySelector<HTMLInputElement>('.lecture-tools__takeaway-prompt')!;
    words.value = 'Your best line';
    words.dispatchEvent(new Event('change'));
    expect((current()[0]!.content as { takeaway?: unknown }).takeaway).toEqual({ enabled: true, prompt: 'Your best line' });
  });
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-editor-tools.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write `tree.ts`**

```ts
// apps/teaching/src/lecture/tree.ts
import type { Block } from '@/schemas/block';

type Lists = (block: Block) => Array<{ blocks: Block[]; rebuild: (blocks: Block[]) => Block }>;

/** The child lists a block holds: a section's blocks, each column, each tab. */
const childLists: Lists = (block) => {
  const c = block.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
  if (block.block_type === 'section' && Array.isArray(c.blocks)) return [{ blocks: c.blocks, rebuild: (blocks) => ({ ...block, content: { ...block.content, blocks } }) as Block }];
  if (block.block_type === 'columns' && c.columns) return c.columns.map((col, i) => ({ blocks: col.blocks, rebuild: (blocks) => ({ ...block, content: { ...block.content, columns: c.columns!.map((x, j) => (j === i ? { ...x, blocks } : x)) } }) as Block }));
  if (block.block_type === 'tabs' && c.tabs) return c.tabs.map((tab, i) => ({ blocks: tab.blocks, rebuild: (blocks) => ({ ...block, content: { ...block.content, tabs: c.tabs!.map((x, j) => (j === i ? { ...x, blocks } : x)) } }) as Block }));
  return [];
};

export function insertAfter(blocks: Block[], id: string, added: Block): Block[] {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) return [...blocks.slice(0, at + 1), added, ...blocks.slice(at + 1)];
  return blocks.map((block) => {
    let next = block;
    for (const list of childLists(block)) {
      const changed = insertAfter(list.blocks, id, added);
      if (changed !== list.blocks) next = list.rebuild(changed);
    }
    return next;
  });
}

export function nextSibling(blocks: Block[], id: string): Block | null {
  const at = blocks.findIndex((b) => b.id === id);
  if (at >= 0) return blocks[at + 1] ?? null;
  for (const block of blocks) {
    for (const list of childLists(block)) {
      const found = nextSibling(list.blocks, id);
      if (found) return found;
    }
  }
  return null;
}
```

Careful: `insertAfter` returns a fresh array from `.map` even when nothing changed, which breaks the `changed !== list.blocks` check. Make the map keep identity:

```ts
  let touched = false;
  const out = blocks.map((block) => {
    let next = block;
    for (const list of childLists(next)) {
      const changed = insertAfter(list.blocks, id, added);
      if (changed !== list.blocks) { next = list.rebuild(changed); touched = true; }
    }
    return next;
  });
  return touched ? out : blocks;
```

Use this version as the final body after the `at >= 0` line.

- [ ] **Step 4: Write `narration-field.ts`**

```ts
// apps/teaching/src/lecture/narration-field.ts
import type { Narration } from '@/schemas/block';
import { AUDIO_ACCEPT, createUploadButton } from '@/blocks/upload-button';
import { createAudioRecordButton } from '@/blocks/audio-record-button';

/**
 * Recordings from MediaRecorder often report an Infinity duration until the
 * browser has scanned the whole file. Seeking far past the end makes it work
 * the real length out.
 */
export function measureDuration(url: string, timeoutMs = 4000): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (value: number) => { window.clearTimeout(timer); audio.removeAttribute('src'); resolve(Math.round(Number.isFinite(value) ? value : 0)); };
    const timer = window.setTimeout(() => done(0), timeoutMs);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      audio.currentTime = 1e7;
    });
    audio.addEventListener('durationchange', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) done(audio.duration); });
    audio.addEventListener('error', () => done(0));
    audio.src = url;
  });
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

export function createNarrationField(options: { label: string; value: Narration | undefined; onChange: (next: Narration | undefined) => void }): HTMLElement {
  const root = document.createElement('div');
  root.className = 'narration-field';
  let value = options.value;

  const paint = () => {
    root.replaceChildren();
    const label = document.createElement('span');
    label.className = 'narration-field__label';
    label.textContent = options.label;
    root.append(label);
    if (value) {
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = value.url;
      player.className = 'narration-field__audio';
      const length = document.createElement('span');
      length.className = 'narration-field__length';
      length.textContent = value.duration_s ? clock(value.duration_s) : '';
      const redo = document.createElement('button');
      redo.type = 'button';
      redo.className = 'btn btn--ghost';
      redo.textContent = 'Re-record';
      redo.addEventListener('click', () => { value = undefined; paint(); });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => { value = undefined; options.onChange(undefined); paint(); });
      const words = document.createElement('details');
      words.className = 'narration-field__transcript';
      const summary = document.createElement('summary');
      summary.textContent = value.transcript ? 'Transcript' : 'Add transcript (for captions)';
      const area = document.createElement('textarea');
      area.rows = 3;
      area.maxLength = 8000;
      area.value = value.transcript ?? '';
      area.addEventListener('change', () => {
        value = { ...value!, transcript: area.value.trim() || undefined };
        options.onChange(value);
      });
      words.append(summary, area);
      root.append(player, length, redo, remove, words);
      return;
    }
    let uploaded = '';
    const upload = createUploadButton({
      accept: AUDIO_ACCEPT,
      noun: 'a recording',
      label: 'Upload',
      onUploaded: (url) => {
        uploaded = url;
        void measureDuration(url).then((duration_s) => {
          value = { url, duration_s, ...(options.value?.transcript ? { transcript: options.value.transcript } : {}) };
          options.onChange(value);
          paint();
        });
      }
    });
    const record = createAudioRecordButton({ upload: (file) => upload.uploadFiles([file]), uploaded: () => Boolean(uploaded), fileTitle: () => options.label });
    root.append(record.el, upload.el);
  };
  paint();
  return root;
}
```

(Check that `AUDIO_ACCEPT` and `createUploadButton` export from `@/blocks/upload-button`. `editors.ts` imports them from a module listed around line 88; use that module path.)

- [ ] **Step 5: Write `editor-tools.ts`**

```ts
// apps/teaching/src/lecture/editor-tools.ts
import type { Block } from '@/schemas/block';
import { mapBlockById } from '@/blocks/block-pulse';
import { findBlockById } from '@/blocks/find-block';
import { createNarrationField } from './narration-field';
import { isSidePath, takesSidePath, DEFAULT_TAKEAWAY } from './scenes';
import { insertAfter, nextSibling } from './tree';

export type LectureEditorToolsOptions = {
  isLecture: () => boolean;
  getBlocks: () => Block[];
  onBlocks: (blocks: Block[]) => void;
  idFactory: () => string;
};

const GATES = new Set(['hinge_question', 'cloze', 'self_check']);

/**
 * In a lecture, each heading, section and gate on the canvas gets a strip of
 * lecture controls. They ride on the canvas row like the block pulse dot, so
 * the block editors stay as they are.
 */
export function createLectureEditorTools(options: LectureEditorToolsOptions) {
  const patch = (id: string, fn: (content: Record<string, unknown>) => Record<string, unknown>) => {
    options.onBlocks(mapBlockById(options.getBlocks(), id, (block) => ({ ...block, content: fn(block.content as Record<string, unknown>) }) as Block));
  };

  function toolsFor(block: Block): HTMLElement | null {
    const tools = document.createElement('div');
    tools.className = 'lecture-tools';
    // Clicks here must not select the row and open its editor.
    for (const type of ['click', 'pointerdown', 'mousedown'] as const) tools.addEventListener(type, (e) => e.stopPropagation());

    if (block.block_type === 'heading') {
      tools.append(createNarrationField({ label: '🎙 Scene narration', value: block.content.narration, onChange: (narration) => patch(block.id, (c) => ({ ...c, narration })) }));
      const reveal = document.createElement('div');
      reveal.className = 'lecture-tools__reveal';
      reveal.setAttribute('role', 'radiogroup');
      reveal.setAttribute('aria-label', 'How this scene shows');
      for (const [value, label] of [['one', 'One at a time'], ['all', 'Show all']] as const) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.dataset.reveal = value;
        pill.setAttribute('role', 'radio');
        pill.setAttribute('aria-checked', String((block.content.reveal ?? 'one') === value));
        pill.textContent = label;
        pill.addEventListener('click', () => patch(block.id, (c) => ({ ...c, reveal: value })));
        reveal.append(pill);
      }
      tools.append(reveal);
      return tools;
    }

    if (block.block_type === 'section' && isSidePath(block)) {
      tools.append(note('If wrong · plays only after a wrong answer on the question above'));
      tools.append(createNarrationField({ label: '🎙 Narration', value: block.content.narration, onChange: (narration) => patch(block.id, (c) => ({ ...c, narration })) }));
      return tools;
    }

    if (block.block_type === 'section') {
      tools.append(createNarrationField({ label: '🎙 Chapter intro', value: block.content.narration, onChange: (narration) => patch(block.id, (c) => ({ ...c, narration })) }));
      const on = block.content.takeaway?.enabled !== false;
      const wrap = document.createElement('label');
      wrap.className = 'lecture-tools__takeaway';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = on;
      box.addEventListener('click', () => patch(block.id, (c) => ({ ...c, takeaway: { ...(c.takeaway as object), enabled: box.checked } })));
      wrap.append(box, document.createTextNode(' Takeaway at the end'));
      const words = document.createElement('input');
      words.type = 'text';
      words.className = 'lecture-tools__takeaway-prompt';
      words.maxLength = 300;
      words.placeholder = DEFAULT_TAKEAWAY(block.content.title.trim() || 'this chapter');
      words.value = block.content.takeaway?.prompt ?? '';
      words.disabled = !on;
      words.addEventListener('change', () => patch(block.id, (c) => ({ ...c, takeaway: { enabled: true, ...(words.value.trim() ? { prompt: words.value.trim() } : {}) } })));
      tools.append(wrap, words);
      return tools;
    }

    if (GATES.has(block.block_type)) {
      const gateOn = (block.content as { gate?: boolean }).gate !== false;
      const gate = document.createElement('label');
      gate.className = 'lecture-tools__gate';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = gateOn;
      box.addEventListener('click', () => patch(block.id, (c) => ({ ...c, gate: box.checked })));
      gate.append(box, document.createTextNode(' Gate: students answer before moving on'));
      tools.append(gate);
      if (takesSidePath(block)) {
        const after = nextSibling(options.getBlocks(), block.id);
        if (after && isSidePath(after)) {
          tools.append(note('If wrong path ✓ (just below)'));
        } else {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'btn btn--ghost lecture-tools__side-path';
          add.textContent = '+ If wrong path';
          add.addEventListener('click', () => {
            const path = { id: options.idFactory(), type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'Let’s look again', blocks: [], side_path: true } } as unknown as Block;
            options.onBlocks(insertAfter(options.getBlocks(), block.id, path));
          });
          tools.append(add);
        }
      }
      return tools;
    }
    return null;
  }

  function note(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'lecture-tools__note';
    p.textContent = text;
    return p;
  }

  function attach(target: HTMLElement, block: Block): void {
    if (target.querySelector(':scope > .lecture-tools')) return;
    const tools = toolsFor(block);
    if (tools) target.append(tools);
  }

  return {
    decorate(row: HTMLElement, block: Block): void {
      if (!options.isLecture()) return;
      attach(row, block);
      // Blocks inside a section preview get their own strip.
      for (const el of row.querySelectorAll<HTMLElement>('.block[data-block-id]')) {
        const id = el.dataset.blockId;
        if (!id || id === block.id) continue;
        const inner = findBlockById(options.getBlocks(), id);
        if (inner) attach(el, inner);
      }
    }
  };
}
```

Add editor styles to `lecture.css`, and import `lecture.css` in `editor-tools.ts` too:

```css
.lecture-tools { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-2); padding: var(--space-2); border: 1px dashed color-mix(in srgb, var(--marine) 35%, transparent); border-radius: var(--radius-md); font-size: var(--text-sm); }
.lecture-tools__note { margin: 0; color: var(--muted); }
.lecture-tools__reveal { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius-full); overflow: hidden; }
.lecture-tools__reveal button { border: 0; background: var(--paper); padding: var(--space-1) var(--space-3); }
.lecture-tools__reveal button[aria-checked="true"] { background: var(--ink); color: var(--paper); }
.lecture-tools__takeaway-prompt { flex: 1 1 16rem; }
.narration-field { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.narration-field__label { font-weight: var(--weight-semibold); }
.narration-field__audio { height: 32px; max-width: 16rem; }
.narration-field__transcript { flex-basis: 100%; }
.narration-field__transcript textarea { width: 100%; }
```

- [ ] **Step 6: Wire into `mount-page.ts`.** Import `createLectureEditorTools` and `resolvePedagogicalMode` (already imported). Before `mountBlockCanvas`:

```ts
  const lectureTools = createLectureEditorTools({
    isLecture: () => resolvePedagogicalMode(lesson.pedagogical_mode) === 'lecture',
    getBlocks: () => lesson.blocks,
    onBlocks: (blocks) => {
      emitLesson({ ...lesson, blocks });
      canvas.update(blocks, media);
    },
    idFactory: options.idFactory
  });
```

In `decorateRow`, add `lectureTools.decorate(row, block);`. In the `modeSelect` change handler, after `syncQuizPanel();`, add `canvas.update(lesson.blocks, media);` so the strips appear or go away straight away. (`emitLesson` updates the `lesson` variable; check it does: `grep -n "function emitLesson" -A6 apps/teaching/src/teacher/lesson-canvas/mount-page.ts`.)

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-editor-tools.test.ts && npx tsc --noEmit`
Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/lecture apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/tests/unit/lecture-editor-tools.test.ts
git commit -m "Teaching lecture: record narration, reveal, takeaway, gate and side-path controls on the canvas"
```

---

## Phase 2: self-paced hinge gates

### Task 10: Hinge question answers alone in a lecture

**Files:**
- Modify: `netlify/functions/_shared/hinge.mjs` (`assertLive` returns the published lesson; new `solo` action in `hingeAction`)
- Create: `apps/teaching/src/blocks/hinge-question/solo.ts`
- Modify: `apps/teaching/src/blocks/hinge-question/index.ts`
- Test: `tests/unit/hinge-solo.test.js`, plus a case in `apps/teaching/tests/unit/lecture-answered.test.ts`

- [ ] **Step 1: Write the failing server test**

```js
// tests/unit/hinge-solo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hingeAction } from '../../netlify/functions/_shared/hinge.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const hinge = () => ({
  id: 'hq1', type: 'block', block_type: 'hinge_question', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'Which?', options: [{ id: 'a', text: 'Gravity', misconception: '' }, { id: 'b', text: 'Magnetism', misconception: 'pull = magnet' }], correct_id: 'a', seconds: 60, move_on: 80, reteach: 50 }
});
function storeFor(mode) {
  const data = new Map([
    ['lessons/lesson1', { blocks: [hinge()] }],
    ['published/lessons/lesson1', { blocks: filterBlocksForStudent([hinge()]), ...(mode ? { pedagogical_mode: mode } : {}) }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const token = 'a'.repeat(48);

test('in a lecture a student answers alone and hears right or wrong', async () => {
  const store = storeFor('lecture');
  const wrong = await hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'b' });
  assert.deepEqual(wrong, { phase: 'solo', mine: 'b', correct_id: 'a', right: false });
  const right = await hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'a' });
  assert.equal(right.right, true);
  assert.ok([...store.data.keys()].some((k) => k.startsWith('hinge/lesson1/hq1/solo/')));
});

test('solo answers are refused outside a lecture', async () => {
  await assert.rejects(hingeAction(storeFor(null), 'lesson1', 'hq1', { action: 'solo', token, pick: 'a' }), { code: 'not_lecture' });
});

test('solo needs a real answer and a device', async () => {
  const store = storeFor('lecture');
  await assert.rejects(hingeAction(store, 'lesson1', 'hq1', { action: 'solo', token, pick: 'z' }), { code: 'bad_pick' });
  await assert.rejects(hingeAction(store, 'lesson1', 'hq1', { action: 'solo', pick: 'a' }), { code: 'no_device' });
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `node --test tests/unit/hinge-solo.test.js`
Expected: FAIL (`solo` falls through to the idle branch).

- [ ] **Step 3: Implement the server side.** In `hinge.mjs`, make `assertLive` also return the published lesson:

```js
  return { draft, published, draftLesson, publishedLesson };
```

Add above `hingeAction`:

```js
/**
 * A lecture has no teacher in the room to open a round, so each student
 * answers alone. The right answer still comes from the draft and is sent
 * back only after they answer.
 *
 *   hinge/{lesson}/{block}/solo/{device}   { pick, right, at }
 */
async function soloAnswer(store, lesson, block, body, { draft, published, publishedLesson }) {
  if (publishedLesson?.pedagogical_mode !== 'lecture') reject(409, 'not_lecture', 'This question is answered with your teacher.');
  if (!validToken(body.token)) reject(400, 'no_device', 'This browser needs to allow saving to answer.');
  const s = setup(draft, published, 'main');
  if (s.options.length < 2 || !s.correct_id) reject(409, 'unfinished', 'This question isn’t ready yet.');
  if (!s.options.some((o) => o.id === body.pick)) reject(400, 'bad_pick', 'Choose one of the answers.');
  const right = body.pick === s.correct_id;
  await store.setJSON(`hinge/${lesson}/${block}/solo/${deviceHash(body.token)}`, { pick: body.pick, right, at: new Date().toISOString() });
  return { phase: 'solo', mine: body.pick, correct_id: s.correct_id, right };
}
```

In `hingeAction`, right after `const { draft, published, draftLesson } = await assertLive(...)`, change the destructure to include `publishedLesson` and add:

```js
  if (!teacher && body.action === 'solo') return soloAnswer(store, lesson, block, body, { draft, published, publishedLesson });
```

- [ ] **Step 4: Run it and check that it passes, plus the old hinge tests**

Run: `node --test tests/unit/hinge-solo.test.js tests/unit/hinge.test.js`
Expected: PASS.

- [ ] **Step 5: Write the client solo view**

```ts
// apps/teaching/src/blocks/hinge-question/solo.ts
import { apiPost } from '@/api/client';
import { el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { emitAnswered } from '@/lecture/answered';
import { LETTERS, type HingeBlock } from './shared';

type Saved = { pick: string; correct_id: string; right: boolean };

/**
 * A hinge question inside a lecture: the student answers alone, once, and
 * sees right or wrong with the right answer marked. In the teacher's preview
 * the draft still holds the answer, so it checks locally and sends nothing.
 */
export function mountSolo(block: HingeBlock, lessonId: string, preview: boolean): HTMLElement {
  const saveKey = `hinge:${lessonId}:${block.id}:solo`;
  const deviceKey = `hinge:${lessonId}:${block.id}:device`;
  const root = el('div', 'hq-run hq-solo');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  let saved = preview ? null : readJSON<Saved>(saveKey);
  let busy = false;

  function token(): string | null {
    const have = readJSON<string>(deviceKey);
    if (have && /^[a-f0-9]{48}$/.test(have)) return have;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    return writeJSON(deviceKey, fresh) ? fresh : null;
  }

  async function pick(id: string): Promise<void> {
    if (busy || saved) return;
    busy = true;
    try {
      if (preview) {
        const correct = (block.content as { correct_id?: string }).correct_id ?? '';
        saved = { pick: id, correct_id: correct, right: id === correct };
      } else {
        const res = await apiPost<{ mine: string; correct_id: string; right: boolean }>(
          `/api/published/hinge/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`,
          { action: 'solo', token: token(), pick: id }
        );
        saved = { pick: res.mine, correct_id: res.correct_id, right: res.right };
        writeJSON(saveKey, saved);
      }
      paint();
      emitAnswered(root, block.id, saved.right ? 'right' : 'wrong');
    } catch (error) {
      alert.textContent = errorText(error);
      alert.hidden = false;
    } finally {
      busy = false;
    }
  }

  function paint(): void {
    const list = el('div', 'hq-choices');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Your answer');
    block.content.options.forEach((o, i) => {
      const choice = el('button', 'hq-choice');
      choice.type = 'button';
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', String(saved?.pick === o.id));
      choice.dataset.chosen = String(saved?.pick === o.id);
      if (saved) choice.dataset.right = String(o.id === saved.correct_id);
      choice.disabled = !!saved;
      choice.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-choice__text', o.text));
      choice.addEventListener('click', () => void pick(o.id));
      list.append(choice);
    });
    const parts: HTMLElement[] = [list];
    if (saved) {
      const box = el('div', `hq-verdict hq-verdict--${saved.right ? 'right' : 'wrong'}`);
      box.setAttribute('role', 'status');
      box.append(el('p', 'hq-verdict__title block-subtitle', saved.right ? 'You got it.' : 'Not this time.'), el('p', 'block-body', saved.right ? 'Your answer was right.' : 'The right answer is marked above.'));
      parts.push(box);
    }
    root.replaceChildren(...parts, alert);
  }

  paint();
  return root;
}
```

In `hinge-question/index.ts`, replace the final `root.append(...)` with:

```ts
  if (mode === 'student' && ctx.lecture) {
    root.append(mountSolo(block, ctx.lessonId, ctx.lecture === 'preview'));
    return root;
  }
  root.append(mode === 'teacher' ? mountTeacher(block, ctx.lessonId, prompt) : mountStudent(block, ctx.lessonId, prompt));
```

and `import { mountSolo } from './solo';`.

- [ ] **Step 6: Add a client test** to `lecture-answered.test.ts`:

```ts
  it('a hinge in a lecture preview checks locally and reports the result', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const got = listen(host);
    const hinge = b('hq1', 'hinge_question', { prompt: 'Which?', options: [{ id: 'a', text: 'Gravity' }, { id: 'b', text: 'Magnetism' }], correct_id: 'a', seconds: 60, move_on: 80, reteach: 50 });
    const el = renderBlock(hinge, 'student', { lessonId: 'l1', lecture: 'preview' });
    host.append(el);
    el.querySelectorAll<HTMLButtonElement>('.hq-choice')[1]!.click();
    return Promise.resolve().then(() => {
      expect(got).toEqual([{ blockId: 'hq1', result: 'wrong' }]);
      expect(el.querySelector('.hq-verdict--wrong')).not.toBeNull();
    });
  });
```

- [ ] **Step 7: Run all the lecture tests**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-answered.test.ts tests/unit/hinge-question-block.test.ts && cd ../.. && node --test tests/unit/hinge-solo.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/hinge.mjs apps/teaching/src/blocks/hinge-question tests/unit/hinge-solo.test.js apps/teaching/tests/unit/lecture-answered.test.ts
git commit -m "Teaching lecture: hinge questions answered alone in a lecture"
```

---

## Phase 3: hand-ups, progress, teacher panel

### Task 11: Lecture server: identity, hand-ups, progress, teacher summary

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (`export` on `identify`)
- Create: `netlify/functions/_shared/lecture.mjs`, `netlify/functions/published-lecture.mjs`, `netlify/functions/lecture.mjs`
- Modify: `netlify/functions/_shared/public-student-routes.mjs`
- Test: `tests/unit/lecture.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/lecture.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lectureAction, lectureTeacherAction } from '../../netlify/functions/_shared/lecture.mjs';
import { classKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
function storeFor({ mode = 'lecture', students = [] } = {}) {
  const data = new Map([
    [publishedLessonKey('lesson1'), { lesson_id: 'lesson1', pedagogical_mode: mode, blocks: [block('h1', 'heading', { text: 'Tone' }), block('k1', 'cloze', { text: 'x' }), block('h2', 'heading', { text: 'Mood' })] }],
    [classKey('class1'), { id: 'class1', status: 'active', title: '9A', students }]
  ]);
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n) });

test('status needs a class, and an open class lets anyone in', async () => {
  const store = storeFor();
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', scene_id: 'h1' }), { code: 'need_class' });
  const status = await lectureAction(store, 'lesson1', { action: 'status', ...who(1) });
  assert.deepEqual(status, { identity: { need: null, initials: null }, handups: [] });
});

test('a hand-up is saved, capped and comes back in status', async () => {
  const store = storeFor();
  const after = await lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'h1', scene_label: 'Tone', clip_s: 12, text: '  what is tone?  ' });
  assert.equal(after.handups.length, 1);
  assert.deepEqual({ ...after.handups[0], id: 'x', at: 'x' }, { id: 'x', at: 'x', scene_id: 'h1', scene_label: 'Tone', text: 'what is tone?', status: 'open', reply: '' });
  await assert.rejects(lectureAction(store, 'lesson1', { action: 'handup', ...who(1), scene_id: 'nope' }), { code: 'bad_scene' });
});

test('progress keeps only known ids and one record per student', async () => {
  const store = storeFor();
  const body = { action: 'progress', ...who(1), reached: ['h1', 'h2', 'evil'], replays: { h1: 2, evil: 9 }, last_scene: 'h2', missed: ['k1', 'h9'], ticked: 3, finished: true };
  await lectureAction(store, 'lesson1', body);
  await lectureAction(store, 'lesson1', body);
  const records = [...store.data.keys()].filter((k) => k.startsWith('lecture/lesson1/progress/'));
  assert.equal(records.length, 1);
  const saved = store.data.get(records[0]);
  assert.deepEqual([saved.reached, saved.replays, saved.missed, saved.finished], [['h1', 'h2'], { h1: 2 }, ['k1'], true]);
});

test('refused when the lesson is not a published lecture', async () => {
  await assert.rejects(lectureAction(storeFor({ mode: 'quiz' }), 'lesson1', { action: 'status', ...who(1) }), { code: 'not_lecture' });
});

test('the teacher sees counts per scene, misses per gate and the hand-ups, and can answer one', async () => {
  const store = storeFor();
  await lectureAction(store, 'lesson1', { action: 'progress', ...who(1), reached: ['h1', 'h2'], replays: { h1: 1 }, last_scene: 'h2', missed: ['k1'], ticked: 0, finished: false });
  await lectureAction(store, 'lesson1', { action: 'progress', ...who(2), reached: ['h1'], replays: {}, last_scene: 'h1', missed: [], ticked: 0, finished: false });
  await lectureAction(store, 'lesson1', { action: 'handup', ...who(2), scene_id: 'h1', scene_label: 'Tone', clip_s: 3, text: 'lost' });
  const summary = await lectureTeacherAction(store, 'lesson1', { action: 'summary' });
  assert.equal(summary.students, 2);
  assert.deepEqual(summary.scenes, { h1: { reached: 2, replays: 1 }, h2: { reached: 1, replays: 0 } });
  assert.deepEqual(summary.misses, { k1: 1 });
  assert.equal(summary.handups.length, 1);
  const answered = await lectureTeacherAction(store, 'lesson1', { action: 'answer', id: summary.handups[0].id, reply: 'Tone is the speaker’s attitude.' });
  assert.equal(answered.handups[0].status, 'answered');
  const mine = await lectureAction(store, 'lesson1', { action: 'status', ...who(2) });
  assert.equal(mine.handups[0].reply, 'Tone is the speaker’s attitude.');
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `node --test tests/unit/lecture.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Export `identify`** in `quiz.mjs`: change `async function identify(` to `export async function identify(`.

- [ ] **Step 4: Write `lecture.mjs`**

```js
// netlify/functions/_shared/lecture.mjs
/**
 * Lectures: hand-ups and one small progress record per student.
 *
 *   lecture/{lesson}/handups/{owner}/{id}   { scene_id, scene_label, clip_s, text, status, reply, at, class_id, student_id? }
 *   lecture/{lesson}/progress/{owner}       { reached, replays, last_scene, missed, ticked, finished, at, class_id, student_id? }
 *
 * Students are known the way the quiz knows them (class initials, or the
 * device in a class with no list); `owner` is the same hash. No model is
 * called anywhere here. Gate results for hinge questions live in hinge.mjs;
 * `missed` keeps the few gate ids a student got wrong so the teacher's strip
 * can mark them, since cloze and self-check are checked on the device.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject, validToken, walkBlocks } from './question-drop.mjs';
import { identify } from './quiz.mjs';

export { QuizError as LectureError };

const MAX_HANDUPS = 30;
const MAX_TEXT = 500;
const MAX_IDS = 300;

const keys = (lesson) => ({
  handups: `lecture/${lesson}/handups/`,
  ownHandups: (owner) => `lecture/${lesson}/handups/${owner}/`,
  handup: (owner, id) => `lecture/${lesson}/handups/${owner}/${id}`,
  progressAll: `lecture/${lesson}/progress/`,
  progress: (owner) => `lecture/${lesson}/progress/${owner}`
});

async function loadLecture(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lecture not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Lecture not found.');
  if (lesson.pedagogical_mode !== 'lecture') reject(409, 'not_lecture', 'This lesson isn’t a lecture.');
  const ids = new Set([...walkBlocks(lesson.blocks)].map((b) => b.id).filter((id) => typeof id === 'string'));
  return { lesson, ids };
}

const known = (ids, list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && ids.has(id)))].slice(0, MAX_IDS);
const cleanText = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
const publicHandup = (id, h) => ({ id, scene_id: h.scene_id, scene_label: h.scene_label, text: h.text, status: h.status, reply: h.reply ?? '', at: h.at });

async function ownHandups(store, k, owner) {
  const list = await listBlobKeys(store, k.ownHandups(owner));
  const rows = await Promise.all(list.map(async (key) => [key.slice(key.lastIndexOf('/') + 1), await read(store, key)]));
  return rows.filter(([, h]) => h).map(([id, h]) => publicHandup(id, h)).sort((a, b) => a.at.localeCompare(b.at));
}

export async function lectureAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'claim', 'handup', 'progress'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { ids } = await loadLecture(store, lessonId);
  const who = await identify(store, body, action);
  if (who.need === 'class') reject(403, 'need_class', 'Open this lecture from your class page.');
  const k = keys(lessonId);
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return { identity, handups: [] };
  }
  if (!who.student && !validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const owner = who.student ? deviceHash(`student:${who.classId}:${who.student.id}`) : deviceHash(body.class_token);
  const stamp = { class_id: who.classId, ...(who.student ? { student_id: who.student.id } : {}) };

  if (action === 'handup') {
    if (typeof body.scene_id !== 'string' || !ids.has(body.scene_id)) reject(400, 'bad_scene', 'That part of the lecture has changed. Reload the page.');
    const mine = await listBlobKeys(store, k.ownHandups(owner));
    if (mine.length >= MAX_HANDUPS) reject(429, 'too_many', 'You’ve sent a lot of hand-ups. Ask your teacher in class.');
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    await store.setJSON(k.handup(owner, id), {
      scene_id: body.scene_id,
      scene_label: cleanText(body.scene_label, 80),
      clip_s: Number.isFinite(body.clip_s) ? Math.max(0, Math.min(900, Math.round(body.clip_s))) : 0,
      text: cleanText(body.text, MAX_TEXT),
      status: 'open',
      reply: '',
      at: new Date().toISOString(),
      ...stamp
    });
  }

  if (action === 'progress') {
    const replays = Object.fromEntries(Object.entries(body.replays && typeof body.replays === 'object' ? body.replays : {})
      .filter(([id, n]) => ids.has(id) && Number.isInteger(n) && n > 0).map(([id, n]) => [id, Math.min(n, 999)]));
    await store.setJSON(k.progress(owner), {
      reached: known(ids, body.reached),
      replays,
      last_scene: ids.has(body.last_scene) ? body.last_scene : '',
      missed: known(ids, body.missed),
      ticked: Number.isInteger(body.ticked) ? Math.max(0, Math.min(body.ticked, 999)) : 0,
      finished: body.finished === true,
      at: new Date().toISOString(),
      ...stamp
    });
    return { identity, handups: [] };
  }

  return { identity, handups: await ownHandups(store, k, owner) };
}

async function labeller(store) {
  const rosters = new Map();
  return async (record) => {
    if (!record.class_id || !record.student_id) return null;
    if (!rosters.has(record.class_id)) rosters.set(record.class_id, await loadRoster(store, record.class_id));
    const s = rosters.get(record.class_id)?.students.find((x) => x.id === record.student_id);
    return s ? { initials: s.initials, name: s.name ?? null } : null;
  };
}

async function summary(store, lessonId) {
  const k = keys(lessonId);
  const [progressKeys, handupKeys] = await Promise.all([listBlobKeys(store, k.progressAll), listBlobKeys(store, k.handups)]);
  const progress = (await Promise.all(progressKeys.map((key) => read(store, key)))).filter(Boolean);
  const scenes = {};
  const misses = {};
  for (const p of progress) {
    for (const id of p.reached ?? []) {
      scenes[id] ??= { reached: 0, replays: 0 };
      scenes[id].reached += 1;
    }
    for (const [id, n] of Object.entries(p.replays ?? {})) {
      scenes[id] ??= { reached: 0, replays: 0 };
      scenes[id].replays += n;
    }
    for (const id of p.missed ?? []) misses[id] = (misses[id] ?? 0) + 1;
  }
  const label = await labeller(store);
  const handups = (await Promise.all(handupKeys.map(async (key) => {
    const h = await read(store, key);
    if (!h) return null;
    const [owner, id] = key.slice(k.handups.length).split('/');
    return { ...publicHandup(`${owner}~${id}`, h), clip_s: h.clip_s ?? 0, who: await label(h) };
  }))).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
  return { students: progress.length, scenes, misses, handups };
}

export async function lectureTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Lecture not found.');
  const action = body.action ?? 'summary';
  if (!['summary', 'answer'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'answer') {
    const [owner, id] = typeof body.id === 'string' ? body.id.split('~') : [];
    if (!/^[a-f0-9]{24}$/.test(owner ?? '') || !/^[a-z0-9]{6,24}$/.test(id ?? '')) reject(400, 'bad_id', 'That hand-up wasn’t found.');
    const key = keys(lessonId).handup(owner, id);
    const h = await read(store, key);
    if (!h) reject(404, 'not_found', 'That hand-up wasn’t found.');
    await store.setJSON(key, { ...h, status: 'answered', reply: cleanText(body.reply, MAX_TEXT), replied_at: new Date().toISOString() });
  }
  return summary(store, lessonId);
}
```

(Check that `deviceHash` returns 24 hex characters, `.slice(0, 24)` in question-drop.mjs, which matches the `bad_id` pattern.)

- [ ] **Step 5: Write the two function files and the route**

```js
// netlify/functions/published-lecture.mjs
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { lectureAction, LectureError } from './_shared/lecture.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/lecture/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
const MAX_BODY = 16000;
export function createPublishedLectureHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'Invalid request.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/lecture\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new LectureError(413, 'too_large', 'Invalid request.');
      const result = await lectureAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof LectureError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedLectureHandler();
```

```js
// netlify/functions/lecture.mjs
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { lectureTeacherAction, LectureError } from './_shared/lecture.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/lecture' };
export function createLectureHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/lecture$/);
    try {
      const result = await lectureTeacherAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof LectureError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createLectureHandler();
```

In `public-student-routes.mjs`, after the quiz route:

```js
  { method: 'POST', pattern: /^\/api\/published\/lecture\/[^/]+$/ },
```

Check whether `netlify.toml` or a redirects or functions list needs new functions named (`grep -n "published-quiz" netlify.toml netlify/*.json 2>/dev/null`). If the quiz function is listed somewhere, list the two lecture functions next to it.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/lecture.test.js tests/unit/hinge-solo.test.js && npm run test:unit 2>&1 | tail -5`
Expected: PASS. The full unit run still passes; route-list tests may count routes, so update their expected count if one fails on the new route.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions tests/unit/lecture.test.js
git commit -m "Teaching lecture: hand-ups, progress and teacher summary on the server"
```

### Task 12: Teacher lecture panel (Play as student, replay strip, hand-ups)

**Files:**
- Create: `apps/teaching/src/lecture/preview.ts`, `apps/teaching/src/lecture/teacher-panel.ts`
- Modify: `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (next to `quizHost`, ~999-1027)
- Test: `apps/teaching/tests/unit/lecture-panel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-panel.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { previewBlocks } from '@/lecture/preview';
import { mountLecturePanel } from '@/lecture/teacher-panel';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}, visibility = 'student_teacher') =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility, content }) as unknown as Block;

describe('preview blocks', () => {
  it('drops teacher-only blocks and teacher notes but keeps hinge answers', () => {
    const hinge = b('q', 'hinge_question', { prompt: 'p', options: [], correct_id: 'a' });
    const out = previewBlocks([b('t', 'rich_text', {}, 'teacher_only'), b('n', 'teacher_note', {}), b('s', 'section', { title: 'A', blocks: [hinge, b('x', 'rich_text', {}, 'teacher_only')] })]);
    expect(out.map((x) => x.id)).toEqual(['s']);
    expect((out[0]!.content as { blocks: Block[] }).blocks).toEqual([hinge]);
  });
});

describe('lecture panel', () => {
  it('shades each scene by how many students reached it and lists hand-ups by scene', async () => {
    const lesson = { id: 'l1', title: 'Tone', blocks: [b('h1', 'heading', { text: 'Tone' }), b('k1', 'cloze', { text: 'x' }), b('h2', 'heading', { text: 'Mood' })] } as unknown as Lesson;
    const fetchSummary = vi.fn().mockResolvedValue({
      students: 4,
      scenes: { h1: { reached: 4, replays: 2 }, h2: { reached: 1, replays: 0 } },
      misses: { k1: 3 },
      handups: [{ id: 'o~1', scene_id: 'h1', scene_label: 'Tone', text: 'lost', status: 'open', reply: '', at: '2026-10-23T01:00:00Z', clip_s: 12, who: { initials: 'AB', name: null } }]
    });
    const panel = mountLecturePanel({ getLesson: () => lesson, fetchSummary, answerHandup: vi.fn(), onAddCallout: vi.fn() });
    document.body.append(panel.root);
    await panel.refresh();
    const cells = panel.root.querySelectorAll<HTMLElement>('.lecture-replay__scene');
    expect(cells).toHaveLength(2);
    expect(cells[0]!.style.getPropertyValue('--reach')).toBe('1');
    expect(cells[0]!.textContent).toContain('↻ 2');
    expect(cells[0]!.textContent).toContain('✗ 3');
    expect(cells[0]!.textContent).toContain('✋ 1');
    expect(cells[1]!.style.getPropertyValue('--reach')).toBe('0.25');
    expect(panel.root.querySelector('.lecture-handups__group-title')?.textContent).toBe('Tone · 1');
    expect(panel.root.querySelector('.lecture-handups__item')?.textContent).toContain('AB');
  });
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-panel.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Write `preview.ts`**

```ts
// apps/teaching/src/lecture/preview.ts
import type { Block } from '@/schemas/block';

/**
 * What a student would get, from the draft, for the teacher's Play as
 * student. Teacher-only blocks and teacher notes go; hinge answers stay so
 * the preview can check them without a published copy.
 */
export function previewBlocks(blocks: readonly Block[]): Block[] {
  return blocks
    .filter((block) => block.visibility !== 'teacher_only' && block.block_type !== 'teacher_note')
    .map((block) => {
      const c = block.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
      if (block.block_type === 'section' && c.blocks) return { ...block, content: { ...block.content, blocks: previewBlocks(c.blocks) } } as Block;
      if (block.block_type === 'columns' && c.columns) return { ...block, content: { ...block.content, columns: c.columns.map((col) => ({ ...col, blocks: previewBlocks(col.blocks) })) } } as Block;
      if (block.block_type === 'tabs' && c.tabs) return { ...block, content: { ...block.content, tabs: c.tabs.map((tab) => ({ ...tab, blocks: previewBlocks(tab.blocks) })) } } as Block;
      return block;
    });
}
```

- [ ] **Step 4: Write `teacher-panel.ts`**

```ts
// apps/teaching/src/lecture/teacher-panel.ts
import { apiPost } from '@/api/client';
import type { Lesson } from '@/schemas/lesson';
import { el, plural } from '@/quiz/dom';
import { lectureScenes } from './scenes';
import { previewBlocks } from './preview';
import { mountLecturePlayer } from './player';
import './lecture.css';

export type TeacherHandup = { id: string; scene_id: string; scene_label: string; text: string; status: 'open' | 'answered'; reply: string; at: string; clip_s: number; who: { initials: string; name: string | null } | null };
export type LectureSummary = { students: number; scenes: Record<string, { reached: number; replays: number }>; misses: Record<string, number>; handups: TeacherHandup[] };

export type LecturePanelOptions = {
  getLesson: () => Lesson;
  fetchSummary?: (lessonId: string) => Promise<LectureSummary>;
  answerHandup?: (lessonId: string, id: string, reply: string) => Promise<LectureSummary>;
  /** Drops a hand-up's answer into its scene as a callout. */
  onAddCallout: (sceneId: string, text: string) => void;
};

export type LecturePanelHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };

const api = (lessonId: string, body: unknown) => apiPost<LectureSummary>(`/api/lessons/${encodeURIComponent(lessonId)}/lecture`, body);

/**
 * Shown above the canvas on a lesson whose type is Lecture: Play as student,
 * one strip of scenes shaded by how far the class got, and the hand-ups.
 * One call loads it all; it reloads when the teacher comes back to the tab.
 */
export function mountLecturePanel(options: LecturePanelOptions): LecturePanelHandle {
  const fetchSummary = options.fetchSummary ?? ((id) => api(id, { action: 'summary' }));
  const answerHandup = options.answerHandup ?? ((id, handup, reply) => api(id, { action: 'answer', id: handup, reply }));
  const root = el('section', 'lecture-panel');
  const head = el('div', 'lecture-panel__head');
  const title = el('h2', 'lecture-panel__title', 'Lecture');
  const play = el('button', 'btn btn--secondary', '▶ Play as student');
  play.type = 'button';
  head.append(title, play);
  const strip = el('div', 'lecture-replay');
  const handups = el('div', 'lecture-handups');
  const status = el('p', 'lecture-panel__status');
  root.append(head, status, strip, handups);
  let data: LectureSummary | null = null;

  play.addEventListener('click', () => openPreview());

  function openPreview(): void {
    const lesson = options.getLesson();
    const overlay = el('div', 'lecture-preview');
    const close = el('button', 'btn btn--ghost lecture-preview__close', 'Close preview');
    close.type = 'button';
    const host = el('div', 'lecture-preview__host');
    overlay.append(close, host);
    document.body.append(overlay);
    const player = mountLecturePlayer(host, {
      lessonId: lesson.id, title: lesson.title, blocks: previewBlocks(lesson.blocks), client: null, preview: true,
      renderHero: (h) => h.append(el('h1', 'lecture-title__heading', lesson.title))
    });
    close.addEventListener('click', () => { player.dispose(); overlay.remove(); });
  }

  function paint(): void {
    const lesson = options.getLesson();
    const scenes = lectureScenes(previewBlocks(lesson.blocks));
    status.textContent = data ? (data.students ? `${plural(data.students, 'student')} started` : 'No students have started yet.') : 'Loading…';
    strip.replaceChildren();
    for (const scene of scenes) {
      const counts = data?.scenes[scene.id] ?? { reached: 0, replays: 0 };
      const misses = scene.beats.reduce((n, beat) => n + (data?.misses[beat.block.id] ?? 0), 0);
      const hands = data?.handups.filter((h) => h.scene_id === scene.id).length ?? 0;
      const cell = el('div', 'lecture-replay__scene');
      cell.style.setProperty('--reach', String(data?.students ? Math.round((counts.reached / data.students) * 100) / 100 : 0));
      cell.title = `${scene.label}: ${counts.reached} reached`;
      cell.append(el('span', 'lecture-replay__label', scene.label));
      const marks = el('span', 'lecture-replay__marks');
      if (counts.replays) marks.append(el('span', '', `↻ ${counts.replays}`));
      if (hands) marks.append(el('span', '', `✋ ${hands}`));
      if (misses) marks.append(el('span', '', `✗ ${misses}`));
      cell.append(marks);
      strip.append(cell);
    }
    handups.replaceChildren();
    const open = data?.handups ?? [];
    if (!open.length) return;
    handups.append(el('h3', 'lecture-handups__title', 'Hand-ups'));
    for (const scene of scenes) {
      const group = open.filter((h) => h.scene_id === scene.id);
      if (!group.length) continue;
      const box = el('div', 'lecture-handups__group');
      box.append(el('p', 'lecture-handups__group-title', `${scene.label} · ${group.length}`));
      for (const h of group) box.append(handupRow(h));
      handups.append(box);
    }
  }

  function handupRow(h: TeacherHandup): HTMLElement {
    const lesson = options.getLesson();
    const row = el('div', `lecture-handups__item${h.status === 'answered' ? ' lecture-handups__item--done' : ''}`);
    const whoText = h.who ? h.who.initials : 'A student';
    row.append(el('p', 'lecture-handups__who', `${whoText} · ${h.clip_s ? `${Math.floor(h.clip_s / 60)}:${String(h.clip_s % 60).padStart(2, '0')} in` : 'no clip'}`));
    row.append(el('p', 'lecture-handups__text', h.text || '(no question typed)'));
    if (h.status === 'answered') {
      row.append(el('p', 'lecture-handups__reply', `Answered${h.reply ? `: ${h.reply}` : ''}`));
      if (h.reply) {
        const add = el('button', 'btn btn--ghost', 'Add as callout');
        add.type = 'button';
        add.addEventListener('click', () => options.onAddCallout(h.scene_id, h.reply));
        row.append(add);
      }
      return row;
    }
    const reply = el('input', 'lecture-handups__reply-input');
    reply.placeholder = 'One-line reply (optional)';
    reply.maxLength = 500;
    const done = el('button', 'btn btn--secondary', 'Answered');
    done.type = 'button';
    done.addEventListener('click', async () => {
      done.disabled = true;
      try {
        data = await answerHandup(lesson.id, h.id, reply.value.trim());
        paint();
      } catch {
        done.disabled = false;
      }
    });
    row.append(reply, done);
    return row;
  }

  async function refresh(): Promise<void> {
    try {
      data = await fetchSummary(options.getLesson().id);
    } catch {
      data = data ?? { students: 0, scenes: {}, misses: {}, handups: [] };
    }
    paint();
  }

  const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  paint();

  return { root, refresh, dispose() { document.removeEventListener('visibilitychange', onVisible); root.remove(); } };
}
```

Add to `lecture.css`:

```css
.lecture-panel { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-md); margin-bottom: var(--space-3); }
.lecture-panel__head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.lecture-panel__title { margin: 0; font-size: var(--text-lg, 1.125rem); }
.lecture-panel__status { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.lecture-replay { display: flex; gap: 4px; overflow-x: auto; }
.lecture-replay__scene { flex: 1 0 7rem; display: grid; gap: 2px; padding: var(--space-2); border-radius: var(--radius-md); font-size: var(--text-xs); background: color-mix(in srgb, var(--marine) calc(var(--reach, 0) * 60%), var(--paper)); color: var(--ink); border: 1px solid var(--line); }
.lecture-replay__label { font-weight: var(--weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lecture-replay__marks { display: flex; gap: var(--space-1); }
.lecture-handups { display: grid; gap: var(--space-2); }
.lecture-handups__title, .lecture-handups__group-title { margin: 0; font-weight: var(--weight-semibold); }
.lecture-handups__item { display: grid; gap: var(--space-1); padding: var(--space-2); border-left: 3px solid var(--marine); }
.lecture-handups__item--done { border-left-color: var(--line); color: var(--muted); }
.lecture-handups__who, .lecture-handups__text, .lecture-handups__reply { margin: 0; font-size: var(--text-sm); }
.lecture-preview { position: fixed; inset: 0; z-index: 50; background: var(--paper); overflow: auto; padding: var(--space-3) 16px; }
.lecture-preview__close { position: sticky; top: 0; z-index: 3; }
```

- [ ] **Step 5: Wire into `mount-page.ts`**, beside `quizHost`:

```ts
  const lectureHost = document.createElement('div');
  lectureHost.className = 'lesson-page__lecture';
  let lecturePanel: LecturePanelHandle | null = null;
  function syncLecturePanel(): void {
    const isLecture = resolvePedagogicalMode(lesson.pedagogical_mode) === 'lecture';
    if (isLecture && !lecturePanel) {
      lecturePanel = mountLecturePanel({
        getLesson: () => lesson,
        onAddCallout: (sceneId, text) => {
          const callout = { ...createBlock('callout', options.idFactory()), content: { style: 'info', body: text } } as Block;
          const blocks = insertAfter(lesson.blocks, sceneId, callout);
          emitLesson({ ...lesson, blocks });
          canvas.update(blocks, media);
        }
      });
      lectureHost.append(lecturePanel.root);
      void lecturePanel.refresh();
    } else if (!isLecture && lecturePanel) {
      lecturePanel.dispose();
      lecturePanel = null;
    }
    lectureHost.hidden = !isLecture;
  }
```

Add `lectureHost` to `root.append(coverHost, metaRow, quizHost, lectureHost, canvasHost)`. Call `syncLecturePanel()` where `syncQuizPanel()` is called (mode change and initial mount), and dispose it wherever the quiz panel is disposed. Check the callout `style` values with `grep -n "CalloutStyleSchema = " -A3 apps/teaching/src/schemas/block.ts` and pick the neutral one if `info` isn't valid. Import `createBlock`, `insertAfter`, `mountLecturePanel` and `LecturePanelHandle`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-panel.test.ts && npx tsc --noEmit`
Expected: PASS and clean.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/lecture apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/tests/unit/lecture-panel.test.ts
git commit -m "Teaching lecture: teacher panel with Play as student, replay strip and hand-ups"
```

---

## Phase 4: check it all

### Task 13: Full gate and browser walk

- [ ] **Step 1: Regenerate and run the whole suite**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && cd apps/teaching && npx vitest run && npx tsc --noEmit && cd ../.. && npm run test:unit`
Expected: all PASS. Fix anything the new block type broke in exhaustive tests (block counts, insert-menu snapshots in `tests/unit/__baselines__`).

- [ ] **Step 2: Run the PR gate**

Run: `npm run pre-pr-check`
Expected: exit 0.

- [ ] **Step 3: Walk it in the browser** (preview server from `.claude/launch.json`; use the Teaching dev server and mock publish), at desktop and 390px:
1. New lesson → type **Lecture**. Add: section "Imagery" → heading → image → rich text → note cue (Copy this) → hinge question with **+ If wrong path** (one text block inside) → heading → cloze.
2. Record a 5-second clip on the first heading. The pill shows a length, not 0:00. Add a transcript.
3. **Play as student**: title card shows "About 1 min" and the book line; Start plays the clip; Reveal counts up; the dotted placeholder pulses; the note cue holds Done for 3 seconds; a wrong hinge answer offers **Let's look again →**, the side path is tinted, and **Back to the lecture →** continues after the gate; CC shows the transcript; the recap lists the note cues with ticks and the missed gate.
4. Publish, open the student link from a class page, type initials, send a hand-up, reload: it returns to the same scene.
5. Teacher panel: the replay strip shades scene 1, shows ✋ 1 and ✗ 1; answer the hand-up; the student recap shows the reply.
6. A normal lesson with a side-path section doesn't show the section to students.
Take a screenshot of the player at 390px and the teacher panel for the PR.

- [ ] **Step 4: Note what couldn't be checked here** in the PR body: Safari audio unlock after Start (Adam to test on iPhone), and several real student devices at once.

- [ ] **Step 5: Push and open the PR** (ready for review, merge commit auto-merge once the gate passes, per CLAUDE.md).

```bash
git push -u origin claude/lecture-player
gh pr create --title "Teaching: lecture player" --body-file /tmp/lecture-pr.md
```

The PR body covers what it does, the phases, the spec changes listed at the top of this plan, the test results and screenshots, and what's unverified.
