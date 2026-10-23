# Tutorial Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Teaching lesson of type Tutorial holds a Common demo, one tab per small group (built around why that group gets a technique wrong) and a per-group exit check. Ann groups the flagged students and drafts it. Students self-run their tab up to "With teacher", the teacher sits with each group on a live board, and exit-check results reach the markbook like any quiz.

**Architecture:** The draft is one block tree. Top-level blocks are Common, and top-level sections marked `tutorial_group` are a group's tab (`tutorial_exit: true` makes it that group's exit check). On publish the server splits it three ways: Common goes in the public snapshot, tabs go to a server-only record served one group at a time, and exit-check questions go through the quiz engine, narrowed per student. Students play each stretch with the existing lecture player (Common, the tab before With teacher, the tab after it), then the existing student quiz for the exit check. A new `tutorial.mjs` module stores progress, faded-example answers and per-group teacher state; the teacher's live board polls it.

**Tech Stack:** TypeScript, plain DOM, Zod 3, Vitest + happy-dom (`apps/teaching`), Node `node:test` (root `tests/unit`), Netlify Functions + Blobs, Anthropic Messages API (one Sonnet call for grouping).

**Spec:** `docs/superpowers/specs/2026-10-23-tutorial-mode-design.md`

---

## Changes from the spec (found while mapping the code)

1. **Group tabs never reach the published lesson.** Published lessons are public by link, so a student could read other groups' tabs from it. At publish, Common goes in the snapshot and each tab is stored at `tutorial/{lesson}/tabs`. The server hands a student only their own group's tab, after the initials claim.
2. **Exit checks run on the quiz engine, on the tutorial lesson itself.** Exit sections hold `quiz_question` blocks. Publish splits them with `prepareQuizPublish` exactly like a quiz, and the key record gains `groups: { studentId: questionIds[] }`. Every place the engine scores an attempt narrows the record to that student's questions. So the markbook column, Results, Patterns and Next steps all work with no new screens. One column per tutorial, as the spec says.
3. **The exit check opens only after the teacher's Done.** `quiz.mjs` `start` checks the group record (`tutorial-status.mjs`, which has no quiz import, so there's no import cycle).
4. **No hinge questions inside a group tab.** Hinge solo checks need the block in the published lesson, and tabs aren't there. Tabs use faded examples, cloze and self-check as gates, all checked on the device. A publish issue says so.
5. **A faded example is one block per step.** Ann writes three: the full example (no blanks), then one blank, then two. A student fills the blanks and presses Check. The model answer then shows beside theirs, and they choose *Got it* or *Not quite*. *Not quite* is a wrong gate answer, so an If wrong path plays. The ratings and typed answers go to the server for the live board.
6. **Ann's evidence quotes come from the evidence layer's recorded mistakes** (the option a student picked, what they named a technique as, what they missed, and your feedback codes). Free-written answers aren't stored in the evidence layer. The grouping call sees no names: students go as S1, S2, … and the browser maps them back.
7. **A tutorial belongs to one class** (`tutorial.class_id`), because its groups are that class's students. A class with no list can't run one, because students can't be told apart.
8. **"3 of 5 groups seen" shows on the tutorial board header, not on the map dot.** Map dots are drawn from lesson data alone, with no per-lesson server reads. Adding a read for every tutorial on every map load isn't worth it for a label.
9. **The Common demo in Focus view shows Common only.** `lesson-display.ts` filters the group sections out, the same way it already drops quiz questions.
10. **Hand-ups in a tutorial reuse the lecture player's ✋.** A tutorial client adapts the player's `LectureClient` to the tutorial endpoint, and hand-ups show on the board.

---

## File structure

**New: `apps/teaching/src/tutorial/`**
| File | One job |
|---|---|
| `schema.ts` | Zod for `lesson.tutorial` (class, groups) and the stage names |
| `model.ts` | Pure: split a block tree into Common / tabs / exits; split a tab at With teacher; skeleton for a new tutorial; publish issues |
| `stage.ts` | Pure: which stage a student is in, from the server status and what the device has finished |
| `api.ts` | Student and teacher calls to the tutorial endpoints; adapter to `LectureClient` |
| `player.ts` | Student flow: Common → tab → waiting → You do → exit check |
| `board.ts` | Teacher panel: group strip, live board, Sit with group, Show to group, Done |
| `editor-tabs.ts` | Teacher editor: Common / group / exit tabs that show one part of the canvas at a time |
| `grouping.ts` | Pure brief + parse for the grouping call; anonymising students |
| `plan-sheet.ts` | The Plan a tutorial sheet: confirm, group, adjust, draft |
| `draft.ts` | Creates the tutorial lesson with its skeleton and starts Ann's drafting job |
| `tutorial.css` | Board, player and tabs styles |

**New: blocks**
- `apps/teaching/src/blocks/faded-example.ts`: render, editor, check-and-rate
- `apps/teaching/src/blocks/with-teacher.ts`: render (student marker) and editor (talking points)
- `apps/teaching/public/assets/blocks/faded_example.svg`, `with_teacher.svg`

**New: server**
- `netlify/functions/_shared/tutorial-status.mjs`: keys and `exitUnlocked`
- `netlify/functions/_shared/tutorial.mjs`: publish split, student actions, teacher actions
- `netlify/functions/_shared/tutorial-groups-model.mjs`: the grouping model call
- `netlify/functions/published-tutorial.mjs`, `netlify/functions/tutorial.mjs`, `netlify/functions/tutorial-groups.mjs`

**Modified**
- `apps/teaching/src/schemas/block.ts`: section fields, two block schemas
- `apps/teaching/src/schemas/lesson.ts`: `tutorial` field; publish checks
- `apps/teaching/src/schemas/published-lesson.ts`: `pedagogical_mode` adds `tutorial`
- `apps/teaching/src/schemas/publish-block-issues.ts`, `apps/teaching/src/blocks/{create-block,block-meta,registry,render,editors,search-text}.ts`
- `apps/teaching/src/lecture/{scenes,player}.ts`: faded example is a gate; player runs as a segment
- `apps/teaching/src/student/lesson-view.ts`: tutorial route
- `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`: board and editor tabs
- `apps/teaching/src/teacher/lesson-display.ts`: Focus view shows Common only
- `apps/teaching/src/markbook/{next-view,types,grid}.ts`, `apps/teaching/src/teacher/sections/markbook.ts`
- `apps/teaching/src/ai/{quiz-proposal,block-recipes}.ts`
- `netlify/functions/lesson-publish.mjs`, `netlify/functions/_shared/quiz.mjs`, `netlify/functions/_shared/public-student-routes.mjs`
- `apps/teaching/scripts/mock-api.ts`
- Generated: `netlify/functions/_shared/teaching-block-schema.mjs`, `netlify/functions/_shared/teaching-ai-runtime.mjs`, `netlify/functions/_shared/notion-import-core.mjs`, `packages/block-styles/blocks.css`

**Commands used throughout**
- Teaching unit test: `cd apps/teaching && npx vitest run tests/unit/<file>`
- Teaching typecheck: `cd apps/teaching && npx tsc --noEmit`
- Server test: `node --test tests/unit/<file>` (from repo root)
- Regenerate: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && node scripts/generate-teaching-ai-runtime.mjs`

**Privacy rule for every task:** fixtures and tests use invented names only (Ann Bell, Cy Dale, Ed Fox, Gus Hale). No real student or class names anywhere in this repo.

---

## Phase 1: data and publish

### Task 1: Tutorial schema and section fields

**Files:**
- Create: `apps/teaching/src/tutorial/schema.ts`
- Modify: `apps/teaching/src/schemas/block.ts` (SectionBlockObjectSchema ~1805)
- Modify: `apps/teaching/src/schemas/lesson.ts`
- Test: `apps/teaching/tests/unit/tutorial-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { TutorialSettingsSchema } from '@/tutorial/schema';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium' } as const;
const group = { id: 'g1', name: 'Re-tells the plot', why: 'Describes what happens instead of the effect.', goal: 'Today: explaining the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'Named it “it goes back to the start”' }] };

describe('tutorial schema', () => {
  it('keeps tutorial_group and tutorial_exit on a section', () => {
    const s = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'Group 1', blocks: [], tutorial_group: 'g1', tutorial_exit: true } });
    expect(s.block_type === 'section' && s.content).toMatchObject({ tutorial_group: 'g1', tutorial_exit: true });
  });

  it('parses settings and rejects a bad gap type', () => {
    expect(TutorialSettingsSchema.parse({ class_id: 'class1', groups: [group] }).groups[0]!.evidence).toHaveLength(1);
    expect(() => TutorialSettingsSchema.parse({ class_id: 'class1', groups: [{ ...group, gap_type: 'other' }] })).toThrow();
  });

  it('defaults evidence and caps groups at 8', () => {
    const { evidence: _e, ...bare } = group;
    expect(TutorialSettingsSchema.parse({ class_id: 'c', groups: [bare] }).groups[0]!.evidence).toEqual([]);
    expect(() => TutorialSettingsSchema.parse({ class_id: 'c', groups: Array.from({ length: 9 }, (_, i) => ({ ...group, id: `g${i}` })) })).toThrow();
  });

  it('keeps tutorial on a lesson', () => {
    const lesson = LessonSchema.parse({
      id: 'l1', type: 'lesson', title: 'T', unit_id: 'u1', sequence: 0, blocks: [],
      created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z',
      pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [group] }
    });
    expect(lesson.tutorial?.groups[0]!.name).toBe('Re-tells the plot');
  });
});
```

If `LessonSchema` needs more common fields than these, copy the minimal valid lesson from `apps/teaching/tests/unit/lesson-schema.test.ts` and add the two tutorial fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-schema.test.ts`
Expected: FAIL, cannot resolve `@/tutorial/schema`.

- [ ] **Step 3: Write the schema module**

```ts
// apps/teaching/src/tutorial/schema.ts
import { z } from 'zod';

export const GAP_TYPES = ['knowledge', 'mix_up'] as const;
export type GapType = (typeof GAP_TYPES)[number];

/** Where a student is in a tutorial. `waiting` is the With teacher screen before the teacher has been. */
export const TUTORIAL_STAGES = ['common', 'before', 'waiting', 'after', 'exit', 'done'] as const;
export type TutorialStage = (typeof TUTORIAL_STAGES)[number];

export const TutorialGroupSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  /** Teacher-facing: "Re-tells the plot". Students never see it. */
  name: z.string().min(1).max(80),
  /** Teacher-facing: why this group gets it wrong. */
  why: z.string().max(300),
  /** Student-facing goal, written as what they will do: "Today: explaining the effect". */
  goal: z.string().max(140),
  gap_type: z.enum(GAP_TYPES),
  students: z.array(z.string().min(1).max(64)).max(40),
  /** Ann's evidence for placing each student, from their recorded mistakes. */
  evidence: z.array(z.object({ student: z.string().min(1).max(64), quote: z.string().max(300) })).max(80).default([]),
  /** Students the teacher marked unsure; the exit check confirms the placement. */
  unsure: z.array(z.string().min(1).max(64)).max(40).optional()
});
export type TutorialGroup = z.infer<typeof TutorialGroupSchema>;

export const TutorialSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  /** The evidence tag the tutorial works on, e.g. "tech:cyclical_structure". */
  tag: z.string().max(80).optional(),
  /** The quiz whose evidence flagged these students. */
  source_lesson_id: z.string().max(64).optional(),
  groups: z.array(TutorialGroupSchema).max(8)
});
export type TutorialSettings = z.infer<typeof TutorialSettingsSchema>;
```

- [ ] **Step 4: Add the section fields**

In `apps/teaching/src/schemas/block.ts`, inside `SectionBlockObjectSchema` `content`, after `side_path`:

```ts
    /** Tutorial: this top-level section is the tab for the group with this id. */
    tutorial_group: z.string().regex(/^[a-z0-9_-]{1,40}$/).optional(),
    /** Tutorial: with tutorial_group, this section is that group's exit check (quiz questions). */
    tutorial_exit: z.boolean().optional()
```

- [ ] **Step 5: Add the lesson field**

In `apps/teaching/src/schemas/lesson.ts`, import `TutorialSettingsSchema` from `'../tutorial/schema'` and add after `quiz`:

```ts
  /** Tutorial lessons only: the class and its groups. */
  tutorial: TutorialSettingsSchema.optional(),
```

- [ ] **Step 6: Run the test, then typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-schema.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/tutorial/schema.ts apps/teaching/src/schemas/block.ts apps/teaching/src/schemas/lesson.ts apps/teaching/tests/unit/tutorial-schema.test.ts
git commit -m "Teaching tutorial: lesson groups and section markers"
```

### Task 2: With teacher and faded example block schemas

**Files:**
- Modify: `apps/teaching/src/schemas/block.ts` (`BlockTypeSchema` ~24, after `NoteCueBlockSchema` ~932, `leafBlockSchemas` ~1647)
- Test: `apps/teaching/tests/unit/tutorial-blocks-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-blocks-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';

const base = { type: 'block', visibility: 'student_teacher', variant: 'medium' } as const;
const faded = {
  prompt: 'How is the ending built?',
  extract: 'The house was empty. … The house was empty again.',
  parts: [
    { label: 'Technique', answer: 'Cyclical structure' },
    { label: 'Where', answer: 'The first and last lines both describe the empty house.' },
    { label: 'Effect', answer: 'Nothing has changed for her, so the reader feels her loneliness.' }
  ],
  blanks: [2]
};

describe('tutorial block schemas', () => {
  it('parses a with_teacher block', () => {
    const b = BlockSchema.parse({ ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: ['Ask: what does the reader feel?'] } });
    expect(b.block_type).toBe('with_teacher');
  });

  it('parses a faded example and keeps blanks', () => {
    const b = BlockSchema.parse({ ...base, id: 'f1', block_type: 'faded_example', content: faded });
    expect(b.block_type === 'faded_example' && b.content.blanks).toEqual([2]);
  });

  it('rejects a blank that points past the parts, and more than 4 parts', () => {
    expect(() => BlockSchema.parse({ ...base, id: 'f2', block_type: 'faded_example', content: { ...faded, blanks: [3] } })).toThrow();
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `P${i}`, answer: 'x' }));
    expect(() => BlockSchema.parse({ ...base, id: 'f3', block_type: 'faded_example', content: { ...faded, parts: five, blanks: [] } })).toThrow();
  });

  it('allows both inside a section', () => {
    const s = BlockSchema.parse({ ...base, id: 's1', block_type: 'section', content: { title: 'G', tutorial_group: 'g1', blocks: [
      { ...base, id: 'f1', block_type: 'faded_example', content: faded },
      { ...base, id: 'w1', block_type: 'with_teacher', content: { talking_points: [] } }
    ] } });
    expect(s.block_type === 'section' && s.content.blocks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-blocks-schema.test.ts`
Expected: FAIL, invalid discriminator `with_teacher`.

- [ ] **Step 3: Add the schemas**

Add `'with_teacher', 'faded_example'` to `BlockTypeSchema` straight after `'note_cue'`. After `NoteCueBlockSchema` add:

```ts
/** Tutorial: where a group stops for the teacher. Talking points are the teacher's only. */
export const WithTeacherBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('with_teacher'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({
    talking_points: z.array(z.string().max(300)).max(8)
  }),
  ...blockLayout,
  ...blockTimestamps
});

/**
 * Tutorial: one step of a faded worked example. `parts` is the full example
 * (technique, where, effect); `blanks` are the part indexes the student writes.
 * No blanks is the fully worked example.
 */
export const FadedExampleBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('faded_example'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z
    .object({
      prompt: z.string().max(300),
      extract: z.string().max(2000),
      parts: z.array(z.object({ label: z.string().min(1).max(40), answer: z.string().max(600) })).min(1).max(4),
      blanks: z.array(z.number().int().min(0).max(3)).max(4),
      /** A step with blanks is a gate unless switched off. */
      gate: z.boolean().optional()
    })
    .refine((c) => c.blanks.every((i) => i < c.parts.length) && new Set(c.blanks).size === c.blanks.length, {
      message: 'Each blank must name a different part of the example.',
      path: ['blanks']
    }),
  ...blockLayout,
  ...blockTimestamps
});
```

Add `WithTeacherBlockSchema, FadedExampleBlockSchema,` to `leafBlockSchemas` right after `NoteCueBlockSchema,`.

- [ ] **Step 4: Run test and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-blocks-schema.test.ts && npx tsc --noEmit`
Expected: test PASS. Typecheck FAILS in `create-block.ts`, `render.ts`, `editors.ts` and `search-text.ts` on exhaustive switches. Task 7 fixes these; for now confirm those are the only errors.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/schemas/block.ts apps/teaching/tests/unit/tutorial-blocks-schema.test.ts
git commit -m "Teaching tutorial: with_teacher and faded_example block schemas"
```

### Task 3: Pure tutorial model

**Files:**
- Create: `apps/teaching/src/tutorial/model.ts`
- Test: `apps/teaching/tests/unit/tutorial-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-model.test.ts
import { describe, it, expect } from 'vitest';
import type { Block } from '@/schemas/block';
import { groupOf, splitAtTeacher, tutorialCommon, tutorialIssues, tutorialParts, tutorialSkeleton } from '@/tutorial/model';
import type { TutorialSettings } from '@/tutorial/schema';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;
const section = (id: string, extra: Record<string, unknown>, blocks: Block[] = []): Block => b(id, 'section', { title: id, blocks, ...extra });

const tree: Block[] = [
  b('h1', 'heading', { text: 'Demo' }),
  section('tabA', { tutorial_group: 'ga' }, [b('f1', 'faded_example', {}), b('w1', 'with_teacher', { talking_points: [] }), b('y1', 'self_check', {})]),
  section('exitA', { tutorial_group: 'ga', tutorial_exit: true }, [b('q1', 'quiz_question', {})]),
  section('tabB', { tutorial_group: 'gb' }, []),
  b('r1', 'rich_text', { text: 'Wrap-up' })
];

const settings: TutorialSettings = {
  class_id: 'class1',
  groups: [
    { id: 'ga', name: 'A', why: '', goal: 'Today: naming it', gap_type: 'knowledge', students: ['st_ann'], evidence: [] },
    { id: 'gb', name: 'B', why: '', goal: 'Today: telling them apart', gap_type: 'mix_up', students: ['st_cy'], evidence: [] }
  ]
};

describe('tutorial model', () => {
  it('splits Common, tabs and exits', () => {
    const parts = tutorialParts(tree);
    expect(parts.common.map((x) => x.id)).toEqual(['h1', 'r1']);
    expect([...parts.tabs.keys()]).toEqual(['ga', 'gb']);
    expect(parts.exits.get('ga')?.id).toBe('exitA');
    expect(tutorialCommon(tree).map((x) => x.id)).toEqual(['h1', 'r1']);
  });

  it('splits a tab at With teacher', () => {
    const tab = tutorialParts(tree).tabs.get('ga')!;
    const split = splitAtTeacher(tab.content.blocks as Block[]);
    expect(split.before.map((x) => x.id)).toEqual(['f1']);
    expect(split.withTeacher?.id).toBe('w1');
    expect(split.after.map((x) => x.id)).toEqual(['y1']);
    expect(splitAtTeacher([b('x', 'rich_text')]).withTeacher).toBeNull();
  });

  it('finds a student’s group', () => {
    expect(groupOf(settings, 'st_cy')?.id).toBe('gb');
    expect(groupOf(settings, 'st_zz')).toBeNull();
    expect(groupOf(undefined, 'st_cy')).toBeNull();
  });

  it('builds a skeleton: a Common heading, then a tab and an exit per group', () => {
    let n = 0;
    const blocks = tutorialSkeleton(settings.groups, () => `id${++n}`);
    const parts = tutorialParts(blocks);
    expect(parts.common).toHaveLength(1);
    expect([...parts.tabs.keys()]).toEqual(['ga', 'gb']);
    expect([...parts.exits.keys()]).toEqual(['ga', 'gb']);
    const tab = parts.tabs.get('ga')!;
    expect((tab.content.blocks as Block[]).some((x) => x.block_type === 'with_teacher')).toBe(true);
  });

  it('lists publish issues', () => {
    const missing = tutorialIssues({ tutorial: settings, blocks: [section('tabA', { tutorial_group: 'ga' }, [])] });
    expect(missing).toContain('Group “A” has no With teacher step.');
    expect(missing).toContain('Group “A” has no exit check questions.');
    expect(missing).toContain('Group “B” has no tab.');
    const hinge = tutorialIssues({ tutorial: settings, blocks: [section('tabA', { tutorial_group: 'ga' }, [b('hq', 'hinge_question', {})])] });
    expect(hinge).toContain('Group “A” has a hinge question. In a group tab, use a faded example, cloze or self-check instead.');
    expect(tutorialIssues({ blocks: [] })).toEqual(['Plan the groups first: open the markbook and press Plan a tutorial.']);
    const stray = tutorialIssues({ tutorial: settings, blocks: [b('q9', 'quiz_question', {})] });
    expect(stray).toContain('Quiz questions in a tutorial go in a group’s exit check.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-model.test.ts`
Expected: FAIL, cannot resolve `@/tutorial/model`.

- [ ] **Step 3: Write the module**

```ts
// apps/teaching/src/tutorial/model.ts
import type { Block } from '@/schemas/block';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { TutorialGroup, TutorialSettings } from './schema';

/**
 * A tutorial is one block tree:
 * - top-level blocks that aren't group sections are Common (everyone);
 * - a top-level section with `tutorial_group` is that group's tab;
 * - the same with `tutorial_exit: true` is that group's exit check.
 * A tab stops at its `with_teacher` block until the teacher has sat with the group.
 */

export type SectionBlock = Extract<Block, { block_type: 'section' }>;
export type WithTeacherBlock = Extract<Block, { block_type: 'with_teacher' }>;

const groupId = (block: Block): string | null =>
  block.block_type === 'section' && typeof block.content.tutorial_group === 'string' ? block.content.tutorial_group : null;

export const isGroupTab = (block: Block): block is SectionBlock => groupId(block) !== null && !(block as SectionBlock).content.tutorial_exit;
export const isExitCheck = (block: Block): block is SectionBlock => groupId(block) !== null && (block as SectionBlock).content.tutorial_exit === true;

export type TutorialParts = { common: Block[]; tabs: Map<string, SectionBlock>; exits: Map<string, SectionBlock> };

export function tutorialParts(blocks: readonly Block[]): TutorialParts {
  const parts: TutorialParts = { common: [], tabs: new Map(), exits: new Map() };
  for (const block of blocks) {
    const id = groupId(block);
    if (id === null) parts.common.push(block);
    else if (isExitCheck(block)) parts.exits.set(id, block);
    else parts.tabs.set(id, block as SectionBlock);
  }
  return parts;
}

export const tutorialCommon = (blocks: readonly Block[]): Block[] => tutorialParts(blocks).common;

export function splitAtTeacher(blocks: readonly Block[]): { before: Block[]; withTeacher: WithTeacherBlock | null; after: Block[] } {
  const at = blocks.findIndex((block) => block.block_type === 'with_teacher');
  if (at === -1) return { before: [...blocks], withTeacher: null, after: [] };
  return { before: blocks.slice(0, at), withTeacher: blocks[at] as WithTeacherBlock, after: blocks.slice(at + 1) };
}

export function groupOf(settings: TutorialSettings | undefined, studentId: string): TutorialGroup | null {
  return settings?.groups.find((group) => group.students.includes(studentId)) ?? null;
}

const shell = (id: string, block_type: Block['block_type'], content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;

/** A new tutorial: a Common demo heading, then per group a tab (goal, With teacher) and an empty exit check. */
export function tutorialSkeleton(groups: readonly TutorialGroup[], newId: () => string): Block[] {
  const blocks: Block[] = [shell(newId(), 'heading', { text: 'Demo' })];
  for (const group of groups) {
    blocks.push(
      shell(newId(), 'section', {
        title: group.name,
        tutorial_group: group.id,
        blocks: [shell(newId(), 'heading', { text: group.goal }), shell(newId(), 'with_teacher', { talking_points: [] })]
      }),
      shell(newId(), 'section', { title: `Exit check: ${group.name}`, tutorial_group: group.id, tutorial_exit: true, blocks: [] })
    );
  }
  return blocks;
}

/** What stops a tutorial publishing, in the teacher's words. */
export function tutorialIssues(lesson: { tutorial?: TutorialSettings; blocks: readonly Block[] }): string[] {
  const settings = lesson.tutorial;
  if (!settings || settings.groups.length === 0) return ['Plan the groups first: open the markbook and press Plan a tutorial.'];
  const issues: string[] = [];
  const parts = tutorialParts(lesson.blocks);
  for (const group of settings.groups) {
    const tab = parts.tabs.get(group.id);
    if (!tab) {
      issues.push(`Group “${group.name}” has no tab.`);
      continue;
    }
    const inner = tab.content.blocks as Block[];
    if (!splitAtTeacher(inner).withTeacher) issues.push(`Group “${group.name}” has no With teacher step.`);
    let hinge = false;
    visitBlocks(inner, (block) => {
      if (block.block_type === 'hinge_question') hinge = true;
    });
    if (hinge) issues.push(`Group “${group.name}” has a hinge question. In a group tab, use a faded example, cloze or self-check instead.`);
    let questions = 0;
    visitBlocks((parts.exits.get(group.id)?.content.blocks as Block[]) ?? [], (block) => {
      if (block.block_type === 'quiz_question') questions += 1;
    });
    if (questions === 0) issues.push(`Group “${group.name}” has no exit check questions.`);
  }
  let stray = false;
  visitBlocks([...parts.common, ...[...parts.tabs.values()].flatMap((tab) => tab.content.blocks as Block[])], (block) => {
    if (block.block_type === 'quiz_question') stray = true;
  });
  if (stray) issues.push('Quiz questions in a tutorial go in a group’s exit check.');
  return issues;
}
```

- [ ] **Step 4: Run test**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/tutorial/model.ts apps/teaching/tests/unit/tutorial-model.test.ts
git commit -m "Teaching tutorial: split a tutorial into Common, tabs and exit checks"
```

### Task 4: Publish rules for a tutorial lesson

**Files:**
- Modify: `apps/teaching/src/schemas/lesson.ts` (`PublishableLessonSchema`)
- Modify: `apps/teaching/src/schemas/published-lesson.ts`
- Test: `apps/teaching/tests/unit/tutorial-publish-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-publish-schema.test.ts
import { describe, it, expect } from 'vitest';
import { PublishableLessonSchema } from '@/schemas/lesson';
import { PublishedLessonSchema } from '@/schemas/published-lesson';

const b = (id: string, block_type: string, content: Record<string, unknown> = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const q = (id: string) => b(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: 'Which?', marks: 1, choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } });
const lesson = (blocks: unknown[]) => ({
  id: 'l1', type: 'lesson', title: 'Structure', unit_id: 'u1', sequence: 0, blocks,
  created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z', pedagogical_mode: 'tutorial',
  tutorial: { class_id: 'class1', groups: [{ id: 'ga', name: 'A', why: '', goal: 'Today', gap_type: 'knowledge', students: ['st_ann'] }] }
});

describe('tutorial publish rules', () => {
  it('allows quiz questions in an exit check', () => {
    const ok = PublishableLessonSchema.safeParse(lesson([
      b('t', 'section', { title: 'A', tutorial_group: 'ga', blocks: [b('w', 'with_teacher', { talking_points: [] })] }),
      b('e', 'section', { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks: [q('q1')] })
    ]));
    expect(ok.success).toBe(true);
  });

  it('refuses a tutorial with tutorial issues', () => {
    const bad = PublishableLessonSchema.safeParse(lesson([]));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toContain('Group “A” has no tab.');
  });

  it('a published lesson can be a tutorial', () => {
    expect(PublishedLessonSchema.shape.pedagogical_mode.parse('tutorial')).toBe('tutorial');
  });
});
```

The `q()` helper must be a valid quiz question for `checkQuestion`. If its shape differs, copy a valid multiple-choice question from `apps/teaching/tests/unit/quiz-core.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-publish-schema.test.ts`
Expected: FAIL. The quiz-question check refuses the exit check, and `'tutorial'` isn't in the published enum.

- [ ] **Step 3: Update `PublishableLessonSchema`**

In `apps/teaching/src/schemas/lesson.ts`, import `tutorialIssues` from `'../tutorial/model'`. Change the stray quiz-question check to skip tutorials, and add the tutorial check:

```ts
  if (lesson.pedagogical_mode !== 'quiz' && lesson.pedagogical_mode !== 'tutorial') {
    // …existing stray quiz_question check unchanged…
  }
  if (lesson.pedagogical_mode === 'tutorial') {
    for (const message of tutorialIssues(lesson)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['blocks'] });
    }
  }
```

In the `listPublishBlockIssues` call, treat a tutorial like a lecture (gates and side paths are allowed):

```ts
  for (const issue of listPublishBlockIssues(lesson.blocks, { lecture: lesson.pedagogical_mode === 'lecture' || lesson.pedagogical_mode === 'tutorial' })) {
```

- [ ] **Step 4: Update the published schema**

In `apps/teaching/src/schemas/published-lesson.ts`, change the enum to `z.enum(['quiz', 'lecture', 'tutorial'])`. Leave `toPublishedLesson` as it is: the server builds tutorial snapshots (Task 6).

- [ ] **Step 5: Run test and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-publish-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/schemas/lesson.ts apps/teaching/src/schemas/published-lesson.ts apps/teaching/tests/unit/tutorial-publish-schema.test.ts
git commit -m "Teaching tutorial: publish rules and published type"
```

### Task 5: Quiz engine narrows a tutorial's exit check per student

**Files:**
- Create: `netlify/functions/_shared/tutorial-status.mjs`
- Modify: `netlify/functions/_shared/quiz.mjs`
- Test: `tests/unit/tutorial-quiz.test.js`

- [ ] **Step 1: Write the status module**

```js
// netlify/functions/_shared/tutorial-status.mjs
/**
 * The per-group teacher state of a tutorial, kept apart from tutorial.mjs so
 * the quiz engine can ask "may this student start the exit check?" without
 * importing the tutorial module (which imports the quiz engine).
 *
 *   tutorial/{lesson}/groups/{group}   { sitting, seen_at, done_students, shown }
 *   tutorial/{lesson}/tabs             { version, class_id, groups: [{ id, goal, students, blocks }] }
 */
export const tutorialKeys = (lesson) => ({
  tabs: `tutorial/${lesson}/tabs`,
  group: (group) => `tutorial/${lesson}/groups/${group}`,
  progressAll: `tutorial/${lesson}/progress/`,
  progress: (owner) => `tutorial/${lesson}/progress/${owner}`,
  answers: (owner) => `tutorial/${lesson}/answers/${owner}`,
  handups: `tutorial/${lesson}/handups/`,
  ownHandups: (owner) => `tutorial/${lesson}/handups/${owner}/`,
  handup: (owner, id) => `tutorial/${lesson}/handups/${owner}/${id}`
});

export const emptyGroupState = () => ({ sitting: false, seen_at: null, done_students: [], shown: null });

async function readJSON(store, key) {
  const value = await store.get(key, { type: 'json' });
  return value ?? null;
}

/** The student's group id from the stored tabs record, or null. */
export async function tutorialGroupFor(store, lessonId, studentId) {
  const tabs = await readJSON(store, tutorialKeys(lessonId).tabs);
  return tabs?.groups?.find((g) => Array.isArray(g.students) && g.students.includes(studentId))?.id ?? null;
}

/** True once the teacher has pressed Done for this student's group with them in it, or unlocked them alone. */
export async function exitUnlocked(store, lessonId, studentId) {
  const group = await tutorialGroupFor(store, lessonId, studentId);
  if (!group) return false;
  const state = await readJSON(store, tutorialKeys(lessonId).group(group));
  return Array.isArray(state?.done_students) && state.done_students.includes(studentId);
}
```

Check how `read` in `question-drop.mjs` calls the store (`store.get(key, { type: 'json' })` or a wrapper) and use the same call, so the test store's `get` works.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/tutorial-quiz.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { quizAction, quizTeacherAction, prepareQuizPublish, storeQuizKey, classQuizScores } from '../../netlify/functions/_shared/quiz.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: `Q ${id}`, marks: 1, choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } });
const ROSTER = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }];

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

async function setup() {
  const store = memoryStore();
  const draft = { id: 'tut1', title: 'Structure', unit_id: 'u1', pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [] } };
  const quiz = prepareQuizPublish({ ...draft, pedagogical_mode: 'quiz' }, [mc('qa1'), mc('qa2'), mc('qb1')]).quiz;
  quiz.record.groups = { st_ann: ['qa1', 'qa2'], st_cy: ['qb1'] };
  await storeQuizKey(store, 'tut1', quiz);
  store.data.set(draftLessonKey('tut1'), draft);
  store.data.set(publishedLessonKey('tut1'), { lesson_id: 'tut1', title: 'Structure', unit_id: 'u1', pedagogical_mode: 'tutorial', blocks: [], quiz: quiz.snapshot });
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: ROSTER });
  store.data.set(tutorialKeys('tut1').tabs, { version: 'v', class_id: 'class1', groups: [{ id: 'ga', students: ['st_ann'] }, { id: 'gb', students: ['st_cy'] }] });
  return store;
}
const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n), token: tok(n + 5) });

test('each student sees only their group’s exit questions', async () => {
  const store = await setup();
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  const ann = await quizAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(ann.questions.map((q) => q.id), ['qa1', 'qa2']);
  assert.equal(ann.settings.question_count, 2);
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  const cy = await quizAction(store, 'tut1', { action: 'status', ...who(2) });
  assert.deepEqual(cy.questions.map((q) => q.id), ['qb1']);
});

test('the exit check opens only after the teacher’s Done', async () => {
  const store = await setup();
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await assert.rejects(quizAction(store, 'tut1', { action: 'start', ...who(1) }), { code: 'not_yet' });
  store.data.set(tutorialKeys('tut1').group('ga'), { sitting: false, seen_at: '2026-10-23T01:00:00.000Z', done_students: ['st_ann'], shown: null });
  const started = await quizAction(store, 'tut1', { action: 'start', ...who(1) });
  assert.deepEqual(started.current.questions.map((q) => q.id), ['qa1', 'qa2']);
});

test('scores count only the student’s own questions', async () => {
  const store = await setup();
  store.data.set(tutorialKeys('tut1').group('gb'), { sitting: false, seen_at: 'x', done_students: ['st_cy'], shown: null });
  await quizAction(store, 'tut1', { action: 'claim', ...who(2), initials: 'CD' });
  await quizAction(store, 'tut1', { action: 'start', ...who(2) });
  await quizAction(store, 'tut1', { action: 'submit', ...who(2), responses: { qb1: { selected: ['a'] } } });
  const scores = await classQuizScores(store, 'tut1', 'class1', ['st_ann', 'st_cy']);
  assert.equal(scores.scores.st_cy.max, 1);
  assert.equal(scores.scores.st_cy.score, 1);
  const results = await quizTeacherAction(store, 'tut1', { action: 'results' });
  assert.equal(results.attempts[0].max, 1);
});
```

The `submit` body shape must match `quizAction`'s `submit`. Read `quizAction`'s `submit` branch first, and fix the `responses` shape in this test if it differs.

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/unit/tutorial-quiz.test.js`
Expected: FAIL with `not_published`, because `loadQuiz` refuses a tutorial draft.

- [ ] **Step 4: Change `quiz.mjs`**

1. Import: `import { exitUnlocked } from './tutorial-status.mjs';`
2. Add beside `publicQuestions`:

```js
const QUIZ_MODES = new Set(['quiz', 'tutorial']);

/**
 * A tutorial's exit check holds every group's questions; each student answers
 * only their group's. `groups` maps student id → question ids. A plain quiz has
 * no `groups` and is returned as it is.
 */
export function narrow(record, studentId) {
  if (!record?.groups) return record;
  const mine = new Set(record.groups[studentId] ?? []);
  return { ...record, order: record.order.filter((id) => mine.has(id)) };
}
```

3. In `loadQuiz`, change `draft.pedagogical_mode !== 'quiz'` to `!QUIZ_MODES.has(draft.pedagogical_mode)`. In `unitFamily`, change `d.pedagogical_mode !== 'quiz'` to `!QUIZ_MODES.has(d.pedagogical_mode)`.
4. In `quizAction`: destructure `draft` from `loadQuiz` too. Straight after `const who = await identify(...)` and the `for_students` check, add:

```js
  // A tutorial's exit check: only the student's own group's questions, and only after the teacher's Done.
  if (record.groups) {
    if (!who.student && !['status', 'claim'].includes(action)) reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
    record = narrow(record, who.student?.id);
    if (action === 'start' && draft.pedagogical_mode === 'tutorial' && !(await exitUnlocked(store, lessonId, who.student.id))) {
      reject(403, 'not_yet', 'Your teacher opens this after you’ve worked together.');
    }
  }
```

Change `const { record, settings, k } = await loadQuiz(...)` to `let`-bound `record` (`const loaded = await loadQuiz(...); let { record } = loaded; const { draft, settings, k } = loaded;`).

5. Every `recordFor(...)` result in `quizAction` (`attemptRecord` ~363 and `rec` in the results map ~459) becomes `narrow(await recordFor(...), who.student?.id)`.
6. In `quizTeacherAction`, the `handedIn` helper: `rec: narrow(await recordFor(store, lessonId, start.version, record), start.student_id)`. In the results loop: `const rec = narrow(await recordFor(store, lessonId, start.version, record), start.student_id);`.
7. In `buildInsight`: `const rec = narrow(await recordFor(store, lessonId, a.start.version, record), a.start.student_id);`.
8. In `liveTeacher`, refuse tutorials at the top: `if (record.groups) reject(409, 'not_live', 'A tutorial’s exit check can’t run live.');`.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/unit/tutorial-quiz.test.js tests/unit/quiz*.test.js`
Expected: all PASS (the existing quiz tests prove nothing changed for quizzes).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/tutorial-status.mjs netlify/functions/_shared/quiz.mjs tests/unit/tutorial-quiz.test.js
git commit -m "Teaching tutorial: exit checks run on the quiz engine, narrowed per student"
```

### Task 6: Publish splits a tutorial

**Files:**
- Create: `netlify/functions/_shared/tutorial.mjs` (publish part only; Task 11 adds actions)
- Modify: `netlify/functions/lesson-publish.mjs`
- Test: `tests/unit/tutorial-publish.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/tutorial-publish.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTutorialPublish } from '../../netlify/functions/_shared/tutorial.mjs';

const block = (id, block_type, content = {}, visibility = 'student_teacher') => ({ id, type: 'block', block_type, variant: 'medium', visibility, content });
const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: 'Q', marks: 1, choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } });
const draft = {
  id: 'tut1', pedagogical_mode: 'tutorial',
  tutorial: { class_id: 'class1', groups: [
    { id: 'ga', name: 'Re-tells', why: 'x', goal: 'Today: the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'q' }] },
    { id: 'gb', name: 'Mix-up', why: 'y', goal: 'Today: telling them apart', gap_type: 'mix_up', students: ['st_cy'], evidence: [] }
  ] }
};
const blocks = [
  block('h1', 'heading', { text: 'Demo' }),
  block('tA', 'section', { title: 'Re-tells', tutorial_group: 'ga', blocks: [block('f1', 'faded_example', { prompt: 'p', extract: 'e', parts: [{ label: 'Effect', answer: 'a' }], blanks: [0] }), block('w1', 'with_teacher', { talking_points: ['Secret point'] })] }),
  block('eA', 'section', { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks: [mc('qa1')] }),
  block('tB', 'section', { title: 'Mix-up', tutorial_group: 'gb', blocks: [block('w2', 'with_teacher', { talking_points: [] })] }),
  block('eB', 'section', { title: 'Exit', tutorial_group: 'gb', tutorial_exit: true, blocks: [mc('qb1'), mc('qb2')] })
];

test('Common goes public; tabs go to the server; exit questions become a narrowed quiz', () => {
  const out = prepareTutorialPublish(draft, blocks);
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.common.map((b) => b.id), ['h1']);
  assert.deepEqual(out.tabs.groups.map((g) => [g.id, g.goal, g.students]), [['ga', 'Today: the effect', ['st_ann']], ['gb', 'Today: telling them apart', ['st_cy']]]);
  // No teacher words reach students: talking points, names, whys and evidence stay out.
  const shipped = JSON.stringify(out.tabs);
  assert.ok(!shipped.includes('Secret point'));
  assert.ok(!shipped.includes('Re-tells'));
  assert.ok(!shipped.includes('evidence'));
  assert.deepEqual(out.quiz.record.groups, { st_ann: ['qa1'], st_cy: ['qb1', 'qb2'] });
  assert.deepEqual(out.quiz.record.settings.for_students, ['st_ann', 'st_cy']);
  assert.equal(out.quiz.snapshot.question_count, 3);
  // Answers never ship in the stored tabs or the Common blocks.
  assert.ok(!JSON.stringify(out.common).includes('correct'));
});

test('a problem with an exit question is reported', () => {
  const broken = blocks.map((b) => (b.id === 'eA' ? { ...b, content: { ...b.content, blocks: [block('qa1', 'quiz_question', { question: { id: 'qa1', kind: 'multiple_choice', prompt: '', marks: 1, choices: [], correct: [] } })] } } : b));
  assert.equal(prepareTutorialPublish(draft, broken).problems.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/tutorial-publish.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the publish part of `tutorial.mjs`**

```js
// netlify/functions/_shared/tutorial.mjs
/**
 * Tutorials: one lesson, a Common part for everyone, a tab per small group
 * and an exit check per group.
 *
 * Publish splits the draft. Common goes in the public snapshot. Each group's
 * tab is stored at tutorial/{lesson}/tabs and handed only to that group's
 * students. Exit questions become a quiz key whose `groups` narrow it per
 * student (quiz.mjs). Teacher words (group names, whys, evidence, talking
 * points) never leave the draft.
 *
 *   tutorial/{lesson}/tabs                  { version, class_id, groups: [{ id, goal, students, blocks }] }
 *   tutorial/{lesson}/groups/{group}        { sitting, seen_at, done_students, shown }
 *   tutorial/{lesson}/progress/{owner}      { stage, at, class_id, student_id, group_id }
 *   tutorial/{lesson}/answers/{owner}       { [block id]: { parts: { [index]: text }, rating, at } }
 *   tutorial/{lesson}/handups/{owner}/{id}  { block_id, label, text, status, reply, at, class_id, student_id, group_id }
 *
 * No model is called here.
 */
import { prepareQuizPublish } from './quiz.mjs';
import { tutorialKeys } from './tutorial-status.mjs';

const groupOfSection = (block) =>
  block?.block_type === 'section' && typeof block.content?.tutorial_group === 'string' ? block.content.tutorial_group : null;

/** Talking points are the teacher's; the student copy of With teacher is only the marker. */
function studentTab(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) =>
    block.block_type === 'with_teacher' ? { ...block, content: { talking_points: [] } } : block
  );
}

/**
 * `studentBlocks` are the draft's blocks after the student filter (teacher-only
 * blocks gone). Returns what publish stores: the public Common blocks, the tabs
 * record, the quiz key for the exit checks, and any problems.
 */
export function prepareTutorialPublish(draft, studentBlocks) {
  const groups = Array.isArray(draft?.tutorial?.groups) ? draft.tutorial.groups : [];
  const common = [];
  const tabs = new Map();
  const exits = new Map();
  for (const block of studentBlocks) {
    const id = groupOfSection(block);
    if (id === null) common.push(block);
    else if (block.content.tutorial_exit === true) exits.set(id, block.content.blocks ?? []);
    else tabs.set(id, block.content.blocks ?? []);
  }
  const exitBlocks = groups.flatMap((g) => exits.get(g.id) ?? []);
  const quizPublish = prepareQuizPublish({ ...draft, pedagogical_mode: 'quiz', quiz: { attempts: 1, feedback: 'instant', confidence: true, ...(draft.quiz ?? {}) } }, exitBlocks);
  const quiz = quizPublish.quiz;
  if (quiz) {
    const questionIds = (blocks) => {
      const ids = [];
      const walk = (list) => list.forEach((b) => (b.block_type === 'quiz_question' ? ids.push(b.id) : Array.isArray(b.content?.blocks) && walk(b.content.blocks)));
      walk(blocks);
      return ids.filter((id) => quiz.record.order.includes(id));
    };
    quiz.record.groups = Object.fromEntries(groups.flatMap((g) => g.students.map((s) => [s, questionIds(exits.get(g.id) ?? [])])));
    quiz.record.settings = { ...quiz.record.settings, for_students: groups.flatMap((g) => g.students) };
  }
  return {
    common,
    problems: quizPublish.problems,
    quiz,
    tabs: {
      version: quiz?.version ?? `${Date.now().toString(36)}`,
      class_id: draft.tutorial?.class_id ?? null,
      groups: groups.map((g) => ({ id: g.id, goal: g.goal, students: [...g.students], blocks: studentTab(tabs.get(g.id)) }))
    }
  };
}

export async function storeTutorialTabs(store, lessonId, tabs) {
  await store.setJSON(tutorialKeys(lessonId).tabs, tabs);
}
```

- [ ] **Step 4: Wire it into `lesson-publish.mjs`**

Import `{ prepareTutorialPublish, storeTutorialTabs }` and `{ storeQuizKey }` (already imported). After `publishBlocks` is ready and before `prepareQuizPublish`, branch:

```js
    // A tutorial: Common is public; tabs and exit-check keys are stored apart (tutorial.mjs).
    if (draft.pedagogical_mode === 'tutorial') {
      const tutorial = prepareTutorialPublish(draft, publishBlocks);
      if (tutorial.problems.length > 0) {
        return withCors(errorResponse(400, 'validation_error', `An exit check question isn’t finished: ${tutorial.problems[0]}`, false), request, env);
      }
      if (tutorial.quiz) await storeQuizKey(store, id, tutorial.quiz);
      await storeTutorialTabs(store, id, { ...tutorial.tabs, groups: tutorial.tabs.groups.map((g) => ({ ...g, blocks: sanitizeBlocksDeep(g.blocks) })) });
      const snapshot = {
        lesson_id: id, title, unit_id,
        blocks: sanitizeBlocksDeep(tutorial.common),
        published_at: publishedAt, schema_version: 1,
        ...(draft.cover ? { cover: draft.cover } : {}),
        ...(outcomeIds.length > 0 ? { outcome_ids: outcomeIds } : {}),
        pedagogical_mode: 'tutorial',
        ...(tutorial.quiz ? { quiz: tutorial.quiz.snapshot } : {})
      };
      await setJSON(store, publishedLessonKey(id), snapshot);
      await setJSON(store, draftLessonKey(id), { ...draft, published_at: publishedAt, updated_at: publishedAt });
      return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
    }
```

- [ ] **Step 5: Add a publish test through the handler**

Find the existing publish handler test (`tests/unit/lesson-publish*.test.js`). Add one case: a tutorial draft publishes, the snapshot has only Common blocks and `pedagogical_mode: 'tutorial'`, `tutorial/{id}/tabs` is written, and `quiz/{id}/current` exists. Follow that file's store and request helpers exactly.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/tutorial-publish.test.js tests/unit/lesson-publish*.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/tutorial.mjs netlify/functions/lesson-publish.mjs tests/unit/tutorial-publish.test.js tests/unit/lesson-publish*.test.js
git commit -m "Teaching tutorial: publish keeps tabs and exit keys off the public lesson"
```

---

## Phase 2: blocks

### Task 7: Register the two blocks

**Files:**
- Create: `apps/teaching/src/blocks/with-teacher.ts`
- Create: `apps/teaching/src/blocks/faded-example.ts` (render and editor; Task 8 adds checking)
- Create: `apps/teaching/public/assets/blocks/with_teacher.svg`, `faded_example.svg`
- Modify: `apps/teaching/src/blocks/{create-block,block-meta,registry,render,editors,search-text}.ts`, `apps/teaching/src/schemas/publish-block-issues.ts`
- Test: `apps/teaching/tests/unit/tutorial-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-blocks.test.ts
import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';
import { BlockSchema } from '@/schemas/block';

describe('tutorial blocks', () => {
  it('creates valid empty blocks', () => {
    expect(BlockSchema.parse(createBlock('with_teacher', 'w1')).block_type).toBe('with_teacher');
    const faded = BlockSchema.parse(createBlock('faded_example', 'f1'));
    expect(faded.block_type === 'faded_example' && faded.content.parts.map((p) => p.label)).toEqual(['Technique', 'Where', 'Effect']);
  });

  it('renders With teacher to students without the talking points', () => {
    const block = { ...createBlock('with_teacher', 'w1'), content: { talking_points: ['Secret'] } } as Parameters<typeof renderBlock>[0];
    const el = renderBlock(block, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el.textContent).toContain('Your teacher will join you here');
    expect(el.textContent).not.toContain('Secret');
    expect(renderBlock(block, 'teacher', { lessonId: 'l1', pageBlocks: [] }).textContent).toContain('Secret');
  });

  it('shows a worked step in full and a faded step with inputs', () => {
    const base = createBlock('faded_example', 'f1') as Extract<Parameters<typeof renderBlock>[0], { block_type: 'faded_example' }>;
    const full = { ...base, content: { ...base.content, extract: 'Text', parts: base.content.parts.map((p) => ({ ...p, answer: `${p.label} answer` })), blanks: [] } };
    const el = renderBlock(full, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el.textContent).toContain('Effect answer');
    expect(el.querySelectorAll('textarea')).toHaveLength(0);
    const faded = { ...full, content: { ...full.content, blanks: [2] } };
    const el2 = renderBlock(faded, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el2.querySelectorAll('textarea')).toHaveLength(1);
    expect(el2.textContent).not.toContain('Effect answer');
  });

  it('flags an empty faded example and empty talking points are fine', () => {
    const issues = listPublishBlockIssues([createBlock('faded_example', 'f1'), createBlock('with_teacher', 'w1')]);
    expect(issues.map((i) => i.blockId)).toEqual(['f1']);
  });
});
```

Check `listPublishBlockIssues`'s return shape (`blockId` or another field name) and `RenderContext`'s required fields in `render.ts`, and adjust the test to match.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-blocks.test.ts`
Expected: FAIL, unknown block type in `createBlock`.

- [ ] **Step 3: Write `with-teacher.ts`**

```ts
// apps/teaching/src/blocks/with-teacher.ts
import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import type { BlockChangeHandler } from '@/blocks/editors';

type WithTeacherBlock = Extract<Block, { block_type: 'with_teacher' }>;

/**
 * Where a tutorial group stops for the teacher. Students see a calm marker;
 * the tutorial player holds them here until the teacher sits with the group.
 * Talking points are for the teacher's live board only.
 */
export function renderWithTeacher(block: WithTeacherBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-with-teacher';
  const head = document.createElement('p');
  head.className = 'block-with-teacher__head';
  head.textContent = mode === 'teacher' ? 'With teacher' : 'Your teacher will join you here.';
  root.append(head);
  if (mode === 'teacher' && block.content.talking_points.length) {
    const list = document.createElement('ul');
    list.className = 'block-with-teacher__points';
    for (const point of block.content.talking_points) {
      const item = document.createElement('li');
      item.textContent = point;
      list.append(item);
    }
    root.append(list);
  }
  return root;
}

export function createWithTeacherEditor(
  block: WithTeacherBlock,
  onChange: BlockChangeHandler<WithTeacherBlock>,
  getLatest: () => WithTeacherBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';
  const label = document.createElement('label');
  label.className = 'block-editor__label';
  label.textContent = 'Talking points (one per line, no names)';
  const points = document.createElement('textarea');
  points.className = 'block-editor__with-teacher-points';
  points.rows = 4;
  points.value = block.content.talking_points.join('\n');
  points.addEventListener('input', () => {
    const latest = getLatest();
    const talking_points = points.value.split('\n').map((p) => p.trim()).filter(Boolean).slice(0, 8);
    onChange({ ...latest, content: { ...latest.content, talking_points } });
  });
  label.append(points);
  fields.append(label);
  return fields;
}
```

If other editors wrap their fields with `editorShell` (as `note-cue.ts` does), wrap these the same way.

- [ ] **Step 4: Write `faded-example.ts` (render and editor)**

```ts
// apps/teaching/src/blocks/faded-example.ts
import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import type { BlockChangeHandler } from '@/blocks/editors';

export type FadedExampleBlock = Extract<Block, { block_type: 'faded_example' }>;

/** Fired when a student rates a faded step; the tutorial player sends it to the live board. */
export const FADED_EVENT = 'tutorial:faded';
export type FadedDetail = { blockId: string; parts: Record<number, string>; rating: 'right' | 'wrong' };

export const FADED_DEFAULT_PARTS = ['Technique', 'Where', 'Effect'] as const;

/**
 * One step of a faded worked example: the extract, then each part of the
 * model answer. Blank parts are for the student to write; the rest show.
 * Checking and rating are added in attachFadedCheck (same file, Task 8).
 */
export function renderFadedExample(block: FadedExampleBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-faded';
  root.dataset.blockId = block.id;
  const { prompt, extract, parts, blanks } = block.content;
  if (prompt) {
    const p = document.createElement('p');
    p.className = 'block-faded__prompt block-body';
    p.textContent = prompt;
    root.append(p);
  }
  const quote = document.createElement('blockquote');
  quote.className = 'block-faded__extract';
  quote.textContent = extract;
  root.append(quote);
  const list = document.createElement('dl');
  list.className = 'block-faded__parts';
  parts.forEach((part, index) => {
    const term = document.createElement('dt');
    term.textContent = part.label;
    const value = document.createElement('dd');
    if (blanks.includes(index) && mode !== 'teacher') {
      const input = document.createElement('textarea');
      input.className = 'block-faded__input';
      input.rows = 2;
      input.dataset.part = String(index);
      input.setAttribute('aria-label', `Your ${part.label.toLowerCase()}`);
      value.append(input);
    } else {
      value.textContent = part.answer;
      if (blanks.includes(index)) value.classList.add('block-faded__model');
    }
    list.append(term, value);
  });
  root.append(list);
  return root;
}

export function createFadedExampleEditor(
  block: FadedExampleBlock,
  onChange: BlockChangeHandler<FadedExampleBlock>,
  getLatest: () => FadedExampleBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__faded';
  const emit = (patch: Partial<FadedExampleBlock['content']>) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
  };
  const area = (label: string, value: string, rows: number, on: (v: string) => void) => {
    const wrap = document.createElement('label');
    wrap.className = 'block-editor__label';
    wrap.textContent = label;
    const input = document.createElement('textarea');
    input.rows = rows;
    input.value = value;
    input.addEventListener('input', () => on(input.value));
    wrap.append(input);
    return wrap;
  };
  fields.append(
    area('Prompt', block.content.prompt, 1, (prompt) => emit({ prompt })),
    area('Extract', block.content.extract, 3, (extract) => emit({ extract }))
  );
  block.content.parts.forEach((part, index) => {
    const row = document.createElement('div');
    row.className = 'block-editor__faded-part';
    row.append(
      area(`${part.label}: model answer`, part.answer, 2, (answer) =>
        emit({ parts: getLatest().content.parts.map((p, i) => (i === index ? { ...p, answer } : p)) })
      )
    );
    const blank = document.createElement('label');
    blank.className = 'block-editor__check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = block.content.blanks.includes(index);
    box.addEventListener('change', () => {
      const current = getLatest().content.blanks.filter((i) => i !== index);
      emit({ blanks: box.checked ? [...current, index].sort() : current });
    });
    blank.append(box, ' Students write this part');
    row.append(blank);
    fields.append(row);
  });
  return fields;
}
```

- [ ] **Step 5: Wire both blocks in, following `note_cue` at each site**

- `create-block.ts`: add both types to the type list (~53) and the insert-menu group that holds `note_cue` (~245, ~303, ~320). Labels (~123): `with_teacher: 'With teacher'`, `faded_example: 'Faded example'`. Factory cases (~684):

```ts
    case 'with_teacher':
      return { ...shared, block_type: 'with_teacher', variant: 'medium', content: { talking_points: [] } };
    case 'faded_example':
      return { ...shared, block_type: 'faded_example', variant: 'medium', content: { prompt: '', extract: '', parts: FADED_DEFAULT_PARTS.map((label) => ({ label, answer: '' })), blanks: [] } };
```

- `block-meta.ts` (~45): `with_teacher: 'In a tutorial tab: where the group waits for you. Holds your talking points.'`, `faded_example: 'A worked example with some parts left for students to write, then compare with the model.'`. Add both to `VECTOR_BLOCK_ICONS`.
- `registry.ts`: `with_teacher: { render: renderWithTeacher, createEditor: createWithTeacherEditor }`, `faded_example: { render: renderFadedExample, createEditor: createFadedExampleEditor }`.
- `render.ts` (~2358): `case 'with_teacher': return wrapBlock(renderWithTeacher(block, mode), block, mode);` and the same for `faded_example`.
- `editors.ts` (~3117): matching cases, following `note_cue`.
- `search-text.ts` (~124): `with_teacher` returns `talking_points.join(' ')`; `faded_example` returns `[prompt, extract, ...parts.map(p => p.answer)].join(' ')`.
- `publish-block-issues.ts`: labels (~32) `with_teacher: 'With teacher'`, `faded_example: 'Faded example'`. Issue beside the note cue rule (~395):

```ts
  if (block.block_type === 'faded_example' && (!block.content.extract.trim() || block.content.parts.some((p) => !p.answer.trim()))) {
    // Follow the shape note_cue's issue pushes here, with the message:
    // 'Faded example needs an extract and a model answer for every part.'
  }
```

- Icons: copy `note_cue.svg` to `with_teacher.svg` and `faded_example.svg`. A person-and-table outline for With teacher and three stacked lines for Faded example are enough. Keep the same viewBox and stroke as `note_cue.svg`.

- [ ] **Step 6: Regenerate, run test and typecheck**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && cd apps/teaching && npx vitest run tests/unit/tutorial-blocks.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/blocks apps/teaching/src/schemas/publish-block-issues.ts apps/teaching/public/assets/blocks apps/teaching/tests/unit/tutorial-blocks.test.ts netlify/functions/_shared/teaching-block-schema.mjs netlify/functions/_shared/notion-import-core.mjs packages/block-styles/blocks.css
git commit -m "Teaching tutorial: With teacher and Faded example blocks"
```

### Task 8: Faded example check, rate, and gate

**Files:**
- Modify: `apps/teaching/src/blocks/faded-example.ts`
- Modify: `apps/teaching/src/lecture/scenes.ts` (`GATE_TYPES`, `takesSidePath`)
- Test: `apps/teaching/tests/unit/faded-example.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/faded-example.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderFadedExample, FADED_EVENT, type FadedExampleBlock } from '@/blocks/faded-example';
import { LECTURE_ANSWERED } from '@/lecture/answered';
import { isGate, takesSidePath } from '@/lecture/scenes';

const block: FadedExampleBlock = {
  id: 'f1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'p', extract: 'e', parts: [{ label: 'Technique', answer: 'Cyclical' }, { label: 'Effect', answer: 'Lonely' }], blanks: [1] }
};

describe('faded example check', () => {
  it('Check shows the model next to the answer; rating fires both events', () => {
    const el = renderFadedExample(block, 'student');
    document.body.append(el);
    const faded = vi.fn();
    const answered = vi.fn();
    document.body.addEventListener(FADED_EVENT, (e) => faded((e as CustomEvent).detail));
    document.body.addEventListener(LECTURE_ANSWERED, (e) => answered((e as CustomEvent).detail));
    (el.querySelector('textarea') as HTMLTextAreaElement).value = 'It feels sad';
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(el.textContent).toContain('Lonely');
    (el.querySelector('.block-faded__rate--wrong') as HTMLButtonElement).click();
    expect(faded).toHaveBeenCalledWith({ blockId: 'f1', parts: { 1: 'It feels sad' }, rating: 'wrong' });
    expect(answered).toHaveBeenCalledWith({ blockId: 'f1', result: 'wrong' });
    el.remove();
  });

  it('Check waits for something written', () => {
    const el = renderFadedExample(block, 'student');
    (el.querySelector('.block-faded__check') as HTMLButtonElement).click();
    expect(el.textContent).not.toContain('Lonely');
    expect(el.querySelector('.block-faded__nudge')?.textContent).toBe('Write your part first.');
  });

  it('is a gate when it has blanks and takes a side path', () => {
    expect(isGate(block)).toBe(true);
    expect(isGate({ ...block, content: { ...block.content, blanks: [] } })).toBe(false);
    expect(isGate({ ...block, content: { ...block.content, gate: false } })).toBe(false);
    expect(takesSidePath(block)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/faded-example.test.ts`
Expected: FAIL, no `.block-faded__check` button.

- [ ] **Step 3: Add checking to `renderFadedExample`**

Import `emitAnswered` from `@/lecture/answered`. At the end of `renderFadedExample`, before `return root`, add for students:

```ts
  if (mode !== 'teacher' && blanks.length > 0) attachFadedCheck(root, block);
```

and add the function:

```ts
function attachFadedCheck(root: HTMLElement, block: FadedExampleBlock): void {
  const actions = document.createElement('div');
  actions.className = 'block-faded__actions';
  const nudge = document.createElement('p');
  nudge.className = 'block-faded__nudge';
  nudge.setAttribute('aria-live', 'polite');
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'btn btn--primary block-faded__check';
  check.textContent = 'Check';
  actions.append(check, nudge);
  root.append(actions);
  check.addEventListener('click', () => {
    const inputs = [...root.querySelectorAll<HTMLTextAreaElement>('.block-faded__input')];
    if (inputs.some((input) => !input.value.trim())) {
      nudge.textContent = 'Write your part first.';
      return;
    }
    const parts: Record<number, string> = Object.fromEntries(inputs.map((input) => [Number(input.dataset.part), input.value.trim()]));
    for (const input of inputs) {
      input.readOnly = true;
      const model = document.createElement('p');
      model.className = 'block-faded__model';
      model.textContent = `Model: ${block.content.parts[Number(input.dataset.part)]!.answer}`;
      input.after(model);
    }
    nudge.textContent = 'Compare yours with the model.';
    const rate = (rating: 'right' | 'wrong', label: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn--secondary block-faded__rate block-faded__rate--${rating}`;
      button.textContent = label;
      button.addEventListener('click', () => {
        actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        root.dispatchEvent(new CustomEvent<FadedDetail>(FADED_EVENT, { bubbles: true, detail: { blockId: block.id, parts, rating } }));
        emitAnswered(root, block.id, rating);
      });
      return button;
    };
    check.replaceWith(rate('right', 'Got it'), rate('wrong', 'Not quite'));
  });
}
```

`emitAnswered(from, blockId, result)` dispatches `LECTURE_ANSWERED` with `{ blockId, result }`, bubbling.

- [ ] **Step 4: Make it a gate in `scenes.ts`**

```ts
const GATE_TYPES = new Set<Block['block_type']>(['hinge_question', 'cloze', 'self_check', 'faded_example']);

export function isGate(block: Block): boolean {
  if (!GATE_TYPES.has(block.block_type) || (block.content as { gate?: boolean }).gate === false) return false;
  // A fully worked step has nothing to answer.
  return block.block_type !== 'faded_example' || block.content.blanks.length > 0;
}

export function takesSidePath(block: Block): boolean {
  return block.block_type === 'hinge_question' || block.block_type === 'cloze' || block.block_type === 'faded_example';
}
```

Also add `'faded_example'` to the `GATES` set in `lecture/editor-tools.ts`, so the gate toggle and **+ If wrong path** show on it in the editor.

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/faded-example.test.ts tests/unit/lecture-scenes.test.ts tests/unit/lecture-editor-tools.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/blocks/faded-example.ts apps/teaching/src/lecture/scenes.ts apps/teaching/src/lecture/editor-tools.ts apps/teaching/tests/unit/faded-example.test.ts
git commit -m "Teaching tutorial: faded example checks, self-rates and gates"
```

---

## Phase 3: students

### Task 9: Tutorial server: student actions

**Files:**
- Modify: `netlify/functions/_shared/tutorial.mjs`
- Test: `tests/unit/tutorial.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/tutorial.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialAction } from '../../netlify/functions/_shared/tutorial.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { classKey, publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }
];
export function storeFor() {
  const data = new Map([
    [publishedLessonKey('tut1'), { lesson_id: 'tut1', pedagogical_mode: 'tutorial', blocks: [block('h1', 'heading', { text: 'Demo' })] }],
    [classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: ROSTER }],
    [tutorialKeys('tut1').tabs, { version: 'v1', class_id: 'class1', groups: [
      { id: 'ga', goal: 'Today: the effect', students: ['st_ann'], blocks: [block('f1', 'faded_example', {}), block('w1', 'with_teacher', { talking_points: [] }), block('y1', 'self_check', {})] },
      { id: 'gb', goal: 'Today: telling them apart', students: ['st_cy'], blocks: [block('w2', 'with_teacher', { talking_points: [] })] }
    ] }]
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
const claim = (store, n, initials) => tutorialAction(store, 'tut1', { action: 'claim', ...who(n), initials });

test('a student gets only their own group’s tab, after claiming', async () => {
  const store = storeFor();
  const before = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.equal(before.identity.need, 'initials');
  assert.equal(before.group, null);
  const ann = await claim(store, 1, 'AB');
  assert.equal(ann.group.goal, 'Today: the effect');
  assert.deepEqual(ann.group.blocks.map((b) => b.id), ['f1', 'w1', 'y1']);
  assert.equal(JSON.stringify(ann).includes('w2'), false);
  assert.deepEqual({ sitting: ann.sitting, unlocked: ann.unlocked, shown: ann.shown }, { sitting: false, unlocked: false, shown: null });
});

test('a student in no group is told so', async () => {
  const store = storeFor();
  const ed = await claim(store, 3, 'EF');
  assert.equal(ed.not_for_you, true);
  assert.equal(ed.group, null);
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(3), stage: 'before' }), { code: 'not_for_you' });
});

test('progress and faded answers are saved under the student', async () => {
  const store = storeFor();
  await claim(store, 1, 'AB');
  await tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'waiting' });
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'f1', parts: { 0: '  It repeats  ' }, rating: 'wrong' });
  const keys = [...store.data.keys()];
  const progress = store.data.get(keys.find((k) => k.startsWith('tutorial/tut1/progress/')));
  assert.equal(progress.stage, 'waiting');
  assert.equal(progress.group_id, 'ga');
  const answers = store.data.get(keys.find((k) => k.startsWith('tutorial/tut1/answers/')));
  assert.deepEqual(answers.f1.parts, { 0: 'It repeats' });
  assert.equal(answers.f1.rating, 'wrong');
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'w2', parts: {}, rating: 'right' }), { code: 'bad_block' });
  await assert.rejects(tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'flying' }), { code: 'bad_stage' });
});

test('status carries the group’s teacher state', async () => {
  const store = storeFor();
  store.data.set(tutorialKeys('tut1').group('ga'), { sitting: true, seen_at: null, done_students: ['st_ann'], shown: { text: 'It repeats' } });
  const ann = await claim(store, 1, 'AB');
  assert.deepEqual({ sitting: ann.sitting, unlocked: ann.unlocked, shown: ann.shown }, { sitting: true, unlocked: true, shown: { text: 'It repeats' } });
});

test('a class with no list can’t run a tutorial', async () => {
  const store = storeFor();
  store.data.set(classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: [] });
  const s = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.equal(s.anonymous, true);
  assert.equal(s.group, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/tutorial.test.js`
Expected: FAIL, `tutorialAction` is not exported.

- [ ] **Step 3: Add student actions to `tutorial.mjs`**

Add imports:

```js
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { QuizError, deviceHash, read, reject, validToken } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { emptyGroupState, tutorialKeys } from './tutorial-status.mjs';

export { QuizError as TutorialError };
```

Then:

```js
const STAGES = new Set(['common', 'before', 'waiting', 'after', 'exit', 'done']);
const MAX_TEXT = 600;
const MAX_HANDUPS = 30;
const clean = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');

async function loadTutorial(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Tutorial not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Tutorial not found.');
  if (lesson.pedagogical_mode !== 'tutorial') reject(409, 'not_tutorial', 'This lesson isn’t a tutorial.');
  const tabs = (await read(store, tutorialKeys(lessonId).tabs)) ?? { groups: [] };
  return { lesson, tabs };
}

const blockIds = (blocks) => {
  const ids = new Set();
  const walk = (list) => (Array.isArray(list) ? list : []).forEach((b) => { if (typeof b?.id === 'string') ids.add(b.id); walk(b?.content?.blocks); });
  walk(blocks);
  return ids;
};

export async function tutorialAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!['status', 'claim', 'progress', 'answer', 'handup'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { tabs } = await loadTutorial(store, lessonId);
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this tutorial from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this tutorial from your class page.');
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  const empty = { identity, group: null, sitting: false, unlocked: false, shown: null, handups: [] };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return empty;
  }
  if (!who.student) {
    if (action === 'status' || action === 'claim') return { ...empty, anonymous: true };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  const group = tabs.groups.find((g) => g.students.includes(who.student.id));
  if (!group) {
    if (action === 'status' || action === 'claim') return { ...empty, not_for_you: true };
    reject(403, 'not_for_you', 'This one isn’t for you today.');
  }
  if (!validToken(body.class_token)) reject(400, 'no_device', 'This browser can’t remember you. Use your usual browser.');
  const k = tutorialKeys(lessonId);
  const owner = deviceHash(`student:${who.classId}:${who.student.id}`);
  const stamp = { class_id: who.classId, student_id: who.student.id, group_id: group.id };

  if (action === 'progress') {
    if (!STAGES.has(body.stage)) reject(400, 'bad_stage', 'Unknown step.');
    await store.setJSON(k.progress(owner), { stage: body.stage, at: new Date().toISOString(), ...stamp });
  }
  if (action === 'answer') {
    if (typeof body.block_id !== 'string' || !blockIds(group.blocks).has(body.block_id)) reject(400, 'bad_block', 'That part has changed. Reload the page.');
    const parts = Object.fromEntries(Object.entries(body.parts && typeof body.parts === 'object' ? body.parts : {})
      .filter(([i]) => /^[0-3]$/.test(i)).map(([i, text]) => [i, clean(text, MAX_TEXT)]));
    const rating = body.rating === 'right' || body.rating === 'wrong' ? body.rating : null;
    const all = (await read(store, k.answers(owner))) ?? {};
    all[body.block_id] = { parts, rating, at: new Date().toISOString() };
    await store.setJSON(k.answers(owner), all);
  }
  if (action === 'handup') {
    const mine = await listBlobKeys(store, k.ownHandups(owner));
    if (mine.length >= MAX_HANDUPS) reject(429, 'too_many', 'You’ve sent a lot of hand-ups. Ask your teacher.');
    const id = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    await store.setJSON(k.handup(owner, id), { block_id: clean(body.scene_id, 64), label: clean(body.scene_label, 80), text: clean(body.text, 500), status: 'open', reply: '', at: new Date().toISOString(), ...stamp });
  }

  const state = (await read(store, k.group(group.id))) ?? emptyGroupState();
  const handupKeys = await listBlobKeys(store, k.ownHandups(owner));
  const handups = (await Promise.all(handupKeys.map(async (key) => [key.slice(key.lastIndexOf('/') + 1), await read(store, key)])))
    .filter(([, h]) => h)
    .map(([id, h]) => ({ id, scene_id: h.block_id, scene_label: h.label, text: h.text, status: h.status, reply: h.reply ?? '', at: h.at }));
  return {
    identity,
    group: { id: group.id, goal: group.goal, blocks: group.blocks },
    sitting: !!state.sitting,
    unlocked: Array.isArray(state.done_students) && state.done_students.includes(who.student.id),
    shown: state.shown ?? null,
    handups
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/unit/tutorial.test.js tests/unit/tutorial-publish.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/tutorial.mjs tests/unit/tutorial.test.js
git commit -m "Teaching tutorial: student status, progress, faded answers and hand-ups"
```

### Task 10: Student endpoint and route

**Files:**
- Create: `netlify/functions/published-tutorial.mjs`
- Modify: `netlify/functions/_shared/public-student-routes.mjs`, `apps/teaching/scripts/mock-api.ts`
- Test: `apps/teaching/tests/unit/tutorial-api-mock.test.ts`

- [ ] **Step 1: Write the handler (copy of `published-lecture.mjs`)**

```js
// netlify/functions/published-tutorial.mjs
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { tutorialAction, TutorialError } from './_shared/tutorial.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/tutorial/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
const MAX_BODY = 16000;
export function createPublishedTutorialHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That’s too long to send. Shorten it and try again.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/tutorial\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new TutorialError(413, 'too_large', 'That’s too long to send. Shorten it and try again.');
      const result = await tutorialAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof TutorialError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedTutorialHandler();
```

- [ ] **Step 2: Register the public route**

In `public-student-routes.mjs`, after the lecture line: `{ method: 'POST', pattern: /^\/api\/published\/tutorial\/[^/]+$/ },`.

- [ ] **Step 3: Write the mock test**

```ts
// apps/teaching/tests/unit/tutorial-api-mock.test.ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

const seed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/seed.json'), 'utf-8')) as SeedData;
const PASSPHRASE = 'teaching-hub-local';

describe('tutorial routes (mock)', () => {
  it('serves the tutorial functions for students and the teacher', async () => {
    const api = createMockApi({ seed: JSON.parse(JSON.stringify(seed)) as SeedData, passphrase: PASSPHRASE });
    const signIn = await api.request('POST', '/api/auth', { body: { passphrase: PASSPHRASE } });
    const cookie = signIn.headers.get('set-cookie') as string;
    const student = await api.request('POST', '/api/published/tutorial/nope', { body: { action: 'status' } });
    expect(student.status).toBe(404);
    const teacher = await api.request('POST', '/api/lessons/nope/tutorial', { cookie, body: { action: 'summary' } });
    expect(teacher.status).toBe(404);
  });
});
```

The teacher route returns 404 for an unknown lesson because its summary reads the draft (Task 12). Until Task 12, mark that half `it.todo`, or add this test in Task 12 instead.

- [ ] **Step 4: Wire the mock**

In `apps/teaching/scripts/mock-api.ts`, import `createPublishedTutorialHandler` (and, after Task 12, `createTutorialHandler`). Add a branch next to the lecture branches (~3605):

```ts
      : path.startsWith('/api/published/tutorial/')
        ? createPublishedTutorialHandler(deps)
```

Add `/^\/api\/published\/tutorial\/[^/]+$/.test(path) ||` to the list at ~3712.

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-api-mock.test.ts tests/unit/lecture-api-mock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/published-tutorial.mjs netlify/functions/_shared/public-student-routes.mjs apps/teaching/scripts/mock-api.ts apps/teaching/tests/unit/tutorial-api-mock.test.ts
git commit -m "Teaching tutorial: student endpoint"
```

### Task 11: Student stage rules and client

**Files:**
- Create: `apps/teaching/src/tutorial/stage.ts`, `apps/teaching/src/tutorial/api.ts`
- Test: `apps/teaching/tests/unit/tutorial-stage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-stage.test.ts
import { describe, it, expect } from 'vitest';
import { studentStage, type DeviceProgress } from '@/tutorial/stage';

const none: DeviceProgress = { common: false, before: false, after: false, exit: false };
const server = (over: Partial<{ unlocked: boolean; hasCommon: boolean; hasAfter: boolean }> = {}) => ({ unlocked: false, hasCommon: true, hasAfter: true, ...over });

describe('student stage', () => {
  it('walks Common → before → waiting', () => {
    expect(studentStage(none, server())).toBe('common');
    expect(studentStage({ ...none, common: true }, server())).toBe('before');
    expect(studentStage({ ...none, common: true, before: true }, server())).toBe('waiting');
  });
  it('skips Common when there is none', () => {
    expect(studentStage(none, server({ hasCommon: false }))).toBe('before');
  });
  it('After and the exit check open only when unlocked', () => {
    const done = { ...none, common: true, before: true };
    expect(studentStage(done, server({ unlocked: true }))).toBe('after');
    expect(studentStage({ ...done, after: true }, server({ unlocked: true }))).toBe('exit');
    expect(studentStage(done, server({ unlocked: true, hasAfter: false }))).toBe('exit');
    expect(studentStage({ ...done, after: true, exit: true }, server({ unlocked: true }))).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-stage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `stage.ts`**

```ts
// apps/teaching/src/tutorial/stage.ts
import type { TutorialStage } from './schema';

/** What this device has finished. Kept in localStorage per tutorial. */
export type DeviceProgress = { common: boolean; before: boolean; after: boolean; exit: boolean };
export type StageInputs = { unlocked: boolean; hasCommon: boolean; hasAfter: boolean };

/**
 * Where a student is. Everything up to With teacher is theirs to work through;
 * You do and the exit check wait for the teacher's Done (`unlocked`).
 */
export function studentStage(done: DeviceProgress, s: StageInputs): TutorialStage {
  if (s.hasCommon && !done.common) return 'common';
  if (!done.before) return 'before';
  if (!s.unlocked) return 'waiting';
  if (s.hasAfter && !done.after) return 'after';
  if (!done.exit) return 'exit';
  return 'done';
}
```

- [ ] **Step 4: Write `api.ts`**

```ts
// apps/teaching/src/tutorial/api.ts
import { apiPost } from '@/api/client';
import { deviceToken } from '@/quiz/dom';
import type { Block } from '@/schemas/block';
import type { LectureClient, LectureStatus, MyHandup } from '@/lecture/api';
import type { TutorialStage } from './schema';

export type TutorialStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  group: { id: string; goal: string; blocks: Block[] } | null;
  sitting: boolean;
  unlocked: boolean;
  shown: { text: string; label: string } | null;
  handups: MyHandup[];
};

export type TutorialClient = {
  status(): Promise<TutorialStatus>;
  claim(initials: string): Promise<TutorialStatus>;
  progress(stage: TutorialStage): Promise<TutorialStatus>;
  answer(blockId: string, parts: Record<number, string>, rating: 'right' | 'wrong'): Promise<TutorialStatus>;
  /** The lecture player's client, so its ✋ and initials claim talk to the tutorial. Progress is sent by stage instead. */
  forPlayer(): LectureClient;
};

export function tutorialClient(lessonId: string, classId: string): TutorialClient {
  const endpoint = `/api/published/tutorial/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<TutorialStatus>(endpoint, { action, ...fields, ...extra });
  const asLecture = (s: TutorialStatus): LectureStatus => ({ identity: s.identity, handups: s.handups, ...(s.anonymous ? { anonymous: true } : {}) });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    progress: (stage) => call('progress', { stage }),
    answer: (blockId, parts, rating) => call('answer', { block_id: blockId, parts, rating }),
    forPlayer: () => ({
      status: () => call('status').then(asLecture),
      claim: (initials) => call('claim', { initials }).then(asLecture),
      handup: (input) => call('handup', input).then(asLecture),
      progress: () => {}
    })
  };
}
```

- [ ] **Step 5: Run test and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-stage.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/tutorial/stage.ts apps/teaching/src/tutorial/api.ts apps/teaching/tests/unit/tutorial-stage.test.ts
git commit -m "Teaching tutorial: student stages and client"
```

### Task 12: Lecture player runs as a segment

**Files:**
- Modify: `apps/teaching/src/lecture/player.ts`
- Test: `apps/teaching/tests/unit/lecture-player-segment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/lecture-player-segment.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountLecturePlayer } from '@/lecture/player';
import type { Block } from '@/schemas/block';

const b = (id: string, block_type: string, content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;

describe('lecture player as a segment', () => {
  it('skips the title card, ends on a Done button and calls onDone', () => {
    const host = document.createElement('div');
    const onDone = vi.fn();
    mountLecturePlayer(host, {
      lessonId: 'tut1', title: 'Structure', blocks: [b('h1', 'heading', { text: 'Demo' }), b('r1', 'rich_text', { text: 'Watch.' })],
      client: null, renderHero: () => {},
      segment: { saveKey: 'tutorial:tut1:common', doneLabel: 'On to your group', onDone }
    });
    expect(host.querySelector('.lecture-title')).toBeNull();
    expect(host.querySelector('.lecture-stage')).not.toBeNull();
    const main = host.querySelector('.lecture-bar__main') as HTMLButtonElement;
    for (let i = 0; i < 5 && !host.querySelector('.lecture-recap'); i += 1) main.click();
    const finish = host.querySelector('.lecture-recap__finish') as HTMLButtonElement;
    expect(finish.textContent).toBe('On to your group');
    finish.click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
```

The click count needed to reach the recap depends on reveal mode. The loop clicks until the recap appears.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-player-segment.test.ts`
Expected: FAIL, the title card shows.

- [ ] **Step 3: Add the `segment` option**

In `LecturePlayerOptions` add:

```ts
  /**
   * Plays one stretch of a tutorial: no title card, its own save key, and the
   * recap's Finish becomes `doneLabel` and calls `onDone`.
   */
  segment?: { saveKey: string; doneLabel: string; onDone: () => void };
```

Then make three changes:
- `const saveKey = options.segment?.saveKey ?? \`lecture:${lessonId}:state\`;`
- In the recap's `finish` button: label `options.segment?.doneLabel ?? (state.finished ? 'Finished ✓' : 'Finish')`. In its click handler, after `send()`, add `options.segment?.onDone();` and keep the label unchanged when `segment` is set.
- At the place the player first draws (the line that calls `titleCard()` after setup), use `if (options.segment) { started = true; play(); } else titleCard();`.

- [ ] **Step 4: Run tests**

Run: `cd apps/teaching && npx vitest run tests/unit/lecture-player-segment.test.ts tests/unit/lecture-player.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/lecture/player.ts apps/teaching/tests/unit/lecture-player-segment.test.ts
git commit -m "Teaching lecture player: can play one stretch of a tutorial"
```

### Task 13: Tutorial player and lesson-view route

**Files:**
- Create: `apps/teaching/src/tutorial/player.ts`, `apps/teaching/src/tutorial/tutorial.css`
- Modify: `apps/teaching/src/student/lesson-view.ts` (~80, ~116)
- Test: `apps/teaching/tests/unit/tutorial-player.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-player.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountTutorialPlayer } from '@/tutorial/player';
import type { TutorialClient, TutorialStatus } from '@/tutorial/api';
import type { Block } from '@/schemas/block';

vi.mock('@/quiz/student-quiz', () => ({ mountStudentQuiz: () => Object.assign(document.createElement('section'), { className: 'qz-quiz' }) }));

const b = (id: string, block_type: string, content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;
const lesson = { lesson_id: 'tut1', title: 'Structure', unit_id: 'u1', blocks: [], published_at: '2026-10-23T00:00:00.000Z', schema_version: 1 as const, pedagogical_mode: 'tutorial' as const };
const status = (over: Partial<TutorialStatus> = {}): TutorialStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'ga', goal: 'Today: the effect', blocks: [b('r1', 'rich_text', { text: 'Step' }), b('w1', 'with_teacher', { talking_points: [] }), b('r2', 'rich_text', { text: 'You do' })] },
  sitting: false, unlocked: false, shown: null, handups: [], ...over
});
const client = (s: TutorialStatus): TutorialClient => ({
  status: vi.fn(async () => s), claim: vi.fn(async () => s), progress: vi.fn(async () => s), answer: vi.fn(async () => s),
  forPlayer: () => ({ status: async () => ({ identity: s.identity, handups: [] }), claim: async () => ({ identity: s.identity, handups: [] }), handup: async () => ({ identity: s.identity, handups: [] }), progress: () => {} })
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => localStorage.clear());

describe('tutorial player', () => {
  it('shows the goal and plays the tab up to With teacher, then waits', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status()), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('Today: the effect');
    localStorage.setItem('tutorial:tut1:done', JSON.stringify({ common: true, before: true, after: false, exit: false }));
    const again = document.createElement('div');
    mountTutorialPlayer(again, { lesson, client: client(status()), renderHero: () => {} });
    await flush();
    expect(again.querySelector('.tut-wait')?.textContent).toContain('Your teacher will join you here');
  });

  it('shows what the teacher put up while sitting with the group', async () => {
    localStorage.setItem('tutorial:tut1:done', JSON.stringify({ common: true, before: true, after: false, exit: false }));
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ sitting: true, shown: { text: 'It goes back to the start', label: 'Effect' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.tut-shown')?.textContent).toContain('It goes back to the start');
  });

  it('after Done goes to You do, then the exit check', async () => {
    localStorage.setItem('tutorial:tut1:done', JSON.stringify({ common: true, before: true, after: true, exit: false }));
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson: { ...lesson, quiz: { version: 'v', question_count: 1, total_marks: 1 } as never }, classId: 'class1', client: client(status({ unlocked: true })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.qz-quiz')).not.toBeNull();
  });

  it('tells a student outside the groups', async () => {
    const host = document.createElement('div');
    mountTutorialPlayer(host, { lesson, client: client(status({ group: null, not_for_you: true })), renderHero: () => {} });
    await flush();
    expect(host.textContent).toContain('This one isn’t for you today.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-player.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `player.ts`**

```ts
// apps/teaching/src/tutorial/player.ts
import type { PublishedLesson } from '@/schemas/published-lesson';
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { mountLecturePlayer, type LecturePlayerHandle } from '@/lecture/player';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import { FADED_EVENT, type FadedDetail } from '@/blocks/faded-example';
import { splitAtTeacher } from './model';
import { studentStage, type DeviceProgress } from './stage';
import type { TutorialClient, TutorialStatus } from './api';
import './tutorial.css';

export type TutorialPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: TutorialClient | null;
  renderHero: (host: HTMLElement) => void;
};

const POLL_MS = 5000;
const NONE: DeviceProgress = { common: false, before: false, after: false, exit: false };

/**
 * A student's tutorial: Common (if any), their group's tab up to With teacher,
 * a calm wait until the teacher has sat with them, You do, then the exit check.
 * Each stretch plays in the lecture player; this file only moves between them.
 */
export function mountTutorialPlayer(host: HTMLElement, options: TutorialPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const lessonId = lesson.lesson_id;
  const doneKey = `tutorial:${lessonId}:done`;
  let done: DeviceProgress = { ...NONE, ...(readJSON<DeviceProgress>(doneKey) ?? {}) };
  let status: TutorialStatus | null = null;
  let player: LecturePlayerHandle | null = null;
  let poll = 0;
  let disposed = false;
  const root = el('div', 'tut');
  host.replaceChildren(root);

  const finish = (part: keyof DeviceProgress) => {
    done = { ...done, [part]: true };
    writeJSON(doneKey, done);
    paint();
  };

  // Faded answers go to the teacher's live board.
  root.addEventListener(FADED_EVENT, (e) => {
    const { blockId, parts, rating } = (e as CustomEvent<FadedDetail>).detail;
    void client?.answer(blockId, parts, rating).catch(() => {});
  });

  function segment(blocks: PublishedLesson['blocks'], key: string, doneLabel: string, part: keyof DeviceProgress): void {
    player?.dispose();
    const stage = el('div', 'tut__segment');
    root.append(stage);
    player = mountLecturePlayer(stage, {
      lessonId,
      title: lesson.title,
      blocks,
      client: client ? client.forPlayer() : null,
      renderHero: options.renderHero,
      segment: { saveKey: `tutorial:${lessonId}:${key}`, doneLabel, onDone: () => finish(part) }
    });
  }

  function paint(): void {
    if (disposed) return;
    window.clearTimeout(poll);
    player?.dispose();
    player = null;
    root.replaceChildren();
    if (!client) return void root.append(el('p', 'tut__note', 'Open this tutorial from your class page.'));
    if (!status) return void root.append(el('p', 'tut__note', 'Loading…'));
    if (status.identity.need === 'initials') return void root.append(claimForm());
    if (status.anonymous) return void root.append(el('p', 'tut__note', 'Your teacher hasn’t added a class list yet.'));
    if (!status.group) return void root.append(el('p', 'tut__note', 'This one isn’t for you today.'));
    const tab = splitAtTeacher(status.group.blocks);
    const stage = studentStage(done, { unlocked: status.unlocked, hasCommon: lesson.blocks.length > 0, hasAfter: tab.after.length > 0 });
    void client.progress(stage).catch(() => {});
    root.append(el('p', 'tut__goal', status.group.goal));
    if (stage === 'common') return segment(lesson.blocks, 'common', 'On to your group', 'common');
    if (stage === 'before') return segment(tab.before, 'before', 'I’m ready for my teacher', 'before');
    if (stage === 'waiting') return waiting();
    if (stage === 'after') return segment(tab.after, 'after', 'On to the check', 'after');
    if (stage === 'exit') {
      const quiz = el('div', 'tut__exit');
      quiz.append(mountStudentQuiz(lesson, { classId: options.classId, pickClass: false }));
      const end = el('button', 'btn btn--secondary tut__finish', 'I’ve handed it in');
      end.type = 'button';
      end.addEventListener('click', () => finish('exit'));
      root.append(quiz, end);
      return;
    }
    root.append(el('p', 'tut__note', 'All done. Nice work.'));
  }

  /** The With teacher screen. It checks in every few seconds, only while it's showing. */
  function waiting(): void {
    const box = el('section', 'tut-wait');
    box.append(el('h2', 'tut-wait__title', status?.sitting ? 'Your teacher is with your group.' : 'Your teacher will join you here.'));
    if (status?.shown) {
      const shown = el('blockquote', 'tut-shown');
      shown.append(el('p', 'tut-shown__label', status.shown.label), el('p', 'tut-shown__text', status.shown.text));
      box.append(shown);
    }
    root.append(box);
    poll = window.setTimeout(refresh, POLL_MS);
  }

  function claimForm(): HTMLElement {
    const form = el('form', 'tut-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'tut-claim__err');
    err.setAttribute('role', 'alert');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        status = await client!.claim(input.value.trim());
        if (status.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else paint();
      } catch (error) {
        err.textContent = error instanceof Error ? error.message : 'That didn’t work. Try again.';
      }
    });
    form.append(el('p', '', 'Type your initials so your teacher can see your work.'), input, go, err);
    return form;
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      status = await client.status();
    } catch {
      // A dropped check-in tries again on the next tick.
    }
    paint();
  }

  paint();
  void refresh();
  return {
    dispose() {
      disposed = true;
      window.clearTimeout(poll);
      player?.dispose();
    }
  };
}
```

`refresh()` calls `paint()`, which calls `client.progress(stage)` on every paint. That is one small write per screen change and per 5-second check-in while waiting. To keep writes down, send progress only when the stage changes: hold `let lastStage = ''` and call `progress` only when `stage !== lastStage`.

- [ ] **Step 4: Write `tutorial.css`**

```css
/* apps/teaching/src/tutorial/tutorial.css */
.tut { display: grid; gap: 1rem; }
.tut__goal { font-weight: 600; color: var(--ink-2, #3b3b3b); margin: 0; }
.tut__note { color: var(--ink-3, #666); }
.tut-wait { display: grid; gap: .75rem; place-items: center; text-align: center; padding: 2.5rem 1rem; border: 1px dashed var(--line, #d8d4cc); border-radius: 14px; }
.tut-wait__title { font-size: 1.25rem; margin: 0; }
.tut-shown { margin: 0; padding: 1rem 1.25rem; border-left: 4px solid var(--accent, #6c8f7d); background: var(--paper-2, #f6f3ee); text-align: left; max-width: 34rem; }
.tut-shown__label { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 .25rem; color: var(--ink-3, #666); }
.tut-shown__text { margin: 0; font-size: 1.1rem; }
.tut-claim { display: grid; gap: .5rem; max-width: 20rem; }
.block-faded__extract { margin: 0 0 .75rem; padding: .75rem 1rem; background: var(--paper-2, #f6f3ee); border-radius: 10px; white-space: pre-wrap; }
.block-faded__parts { display: grid; grid-template-columns: max-content 1fr; gap: .5rem 1rem; margin: 0; }
.block-faded__parts dt { font-weight: 600; }
.block-faded__parts dd { margin: 0; }
.block-faded__input { width: 100%; }
.block-faded__model { color: var(--accent-ink, #3d6b55); }
.block-faded__actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: .75rem; }
.block-with-teacher { padding: .75rem 1rem; border: 1px dashed var(--line, #d8d4cc); border-radius: 10px; }
.block-with-teacher__head { margin: 0; font-weight: 600; }
@media (max-width: 560px) { .block-faded__parts { grid-template-columns: 1fr; } }
```

Use the hub's real token names: check `lecture.css` for the variables it uses and match them.

- [ ] **Step 5: Route tutorials in `lesson-view.ts`**

Import `mountTutorialPlayer` and `tutorialClient`. Add `'Tutorial'` to the eyebrow (~80): `… : lesson.pedagogical_mode === 'tutorial' ? 'Tutorial' : 'Lesson'`. In `renderPublishedLesson`, before the lecture branch:

```ts
  if (lesson.pedagogical_mode === 'tutorial') {
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountTutorialPlayer(playerHost, {
      lesson,
      classId,
      client: classId ? tutorialClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => renderPublishedLessonHero(hostEl, lesson, extras?.cls)
    });
  }
```

`renderPublishedLesson` returns `LecturePlayerHandle | null`. The tutorial handle has the same `dispose()` shape, so change the return type to `{ dispose(): void } | null`.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-player.test.ts tests/unit/lesson-view.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/tutorial/player.ts apps/teaching/src/tutorial/tutorial.css apps/teaching/src/student/lesson-view.ts apps/teaching/tests/unit/tutorial-player.test.ts
git commit -m "Teaching tutorial: student player from Common to the exit check"
```

---

## Phase 4: teacher

### Task 14: Tutorial server: teacher actions

**Files:**
- Modify: `netlify/functions/_shared/tutorial.mjs`
- Create: `netlify/functions/tutorial.mjs`
- Modify: `apps/teaching/scripts/mock-api.ts`
- Test: `tests/unit/tutorial-teacher.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/tutorial-teacher.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialAction, tutorialTeacherAction } from '../../netlify/functions/_shared/tutorial.mjs';
import { tutorialKeys } from '../../netlify/functions/_shared/tutorial-status.mjs';
import { draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { storeFor } from './tutorial.test.js';

const tok = (n) => String(n).repeat(48).slice(0, 48);
const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
function withDraft() {
  const store = storeFor();
  store.data.set(draftLessonKey('tut1'), { id: 'tut1', title: 'Structure', pedagogical_mode: 'tutorial', tutorial: { class_id: 'class1', groups: [
    { id: 'ga', name: 'Re-tells', why: 'x', goal: 'g', gap_type: 'knowledge', students: ['st_ann'], evidence: [] },
    { id: 'gb', name: 'Mix-up', why: 'y', goal: 'g', gap_type: 'mix_up', students: ['st_cy'], evidence: [] }
  ] }, blocks: [] });
  return store;
}

test('summary lists groups with students, stages and status', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'progress', ...who(1), stage: 'waiting' });
  const s = await tutorialTeacherAction(store, 'tut1', { action: 'summary' });
  assert.deepEqual(s.groups.map((g) => [g.id, g.name, g.status]), [['ga', 'Re-tells', 'waiting'], ['gb', 'Mix-up', 'not_started']]);
  assert.deepEqual(s.groups[0].students, [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', unlocked: false }]);
  assert.deepEqual({ seen: s.seen, total: s.total }, { seen: 0, total: 2 });
});

test('sit, board, show, done', async () => {
  const store = withDraft();
  await tutorialAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await tutorialAction(store, 'tut1', { action: 'answer', ...who(1), block_id: 'f1', parts: { 0: 'It repeats' }, rating: 'wrong' });
  await tutorialTeacherAction(store, 'tut1', { action: 'sit', group_id: 'ga' });
  const board = await tutorialTeacherAction(store, 'tut1', { action: 'board', group_id: 'ga' });
  assert.equal(board.sitting, true);
  assert.deepEqual(board.students[0].answers.f1, { parts: { 0: 'It repeats' }, rating: 'wrong', at: board.students[0].answers.f1.at });
  await tutorialTeacherAction(store, 'tut1', { action: 'show', group_id: 'ga', student_id: 'st_ann', block_id: 'f1', part: '0' });
  const seenByAnn = await tutorialAction(store, 'tut1', { action: 'status', ...who(1) });
  assert.deepEqual(seenByAnn.shown, { text: 'It repeats', label: 'One answer from your group' });
  assert.equal(JSON.stringify(seenByAnn.shown).includes('Ann'), false);
  const done = await tutorialTeacherAction(store, 'tut1', { action: 'done', group_id: 'ga', students: ['st_ann'] });
  assert.equal(done.groups[0].status, 'seen');
  const state = store.data.get(tutorialKeys('tut1').group('ga'));
  assert.deepEqual({ sitting: state.sitting, done: state.done_students, shown: state.shown }, { sitting: false, done: ['st_ann'], shown: null });
  assert.equal((await tutorialAction(store, 'tut1', { action: 'status', ...who(1) })).unlocked, true);
});

test('unlock one student later; refuses a student outside the group', async () => {
  const store = withDraft();
  await tutorialTeacherAction(store, 'tut1', { action: 'unlock', group_id: 'gb', student_id: 'st_cy' });
  assert.deepEqual(store.data.get(tutorialKeys('tut1').group('gb')).done_students, ['st_cy']);
  await assert.rejects(tutorialTeacherAction(store, 'tut1', { action: 'unlock', group_id: 'gb', student_id: 'st_ann' }), { code: 'bad_student' });
});

test('moving a student keeps them in one group in the draft', async () => {
  const store = withDraft();
  await tutorialTeacherAction(store, 'tut1', { action: 'move', student_id: 'st_ann', group_id: 'gb' });
  const groups = store.data.get(draftLessonKey('tut1')).tutorial.groups;
  assert.deepEqual(groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
  const tabs = store.data.get(tutorialKeys('tut1').tabs);
  assert.deepEqual(tabs.groups.map((g) => g.students), [[], ['st_cy', 'st_ann']]);
});
```

`storeFor` is exported from `tutorial.test.js`. If importing one test file from another runs its tests twice, move `storeFor` to `tests/unit/helpers/tutorial-store.js` and import it in both.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/tutorial-teacher.test.js`
Expected: FAIL, `tutorialTeacherAction` is not exported.

- [ ] **Step 3: Add teacher actions to `tutorial.mjs`**

Add imports `draftLessonKey` (from `teaching-blobs.mjs`) and `loadRoster` (from `class-claims.mjs`), then:

```js
/** Moving a student touches the draft (groups) and the published tabs, so both stay in step. */
async function moveStudent(store, lessonId, studentId, groupId) {
  const draft = await read(store, draftLessonKey(lessonId));
  const groups = draft?.tutorial?.groups;
  if (!Array.isArray(groups) || !groups.some((g) => g.id === groupId)) reject(404, 'not_found', 'That group is gone.');
  const shift = (list) => list.map((g) => ({ ...g, students: g.id === groupId ? [...g.students.filter((s) => s !== studentId), studentId] : g.students.filter((s) => s !== studentId) }));
  await store.setJSON(draftLessonKey(lessonId), { ...draft, tutorial: { ...draft.tutorial, groups: shift(groups) }, updated_at: new Date().toISOString() });
  const tabs = await read(store, tutorialKeys(lessonId).tabs);
  if (tabs) await store.setJSON(tutorialKeys(lessonId).tabs, { ...tabs, groups: shift(tabs.groups) });
}

function groupStatus(state, students) {
  if (students.length && students.every((s) => s.stage === 'done')) return 'done';
  if (state.seen_at) return 'seen';
  if (students.some((s) => s.stage === 'waiting')) return 'waiting';
  if (students.some((s) => s.stage !== 'not_started')) return 'working';
  return 'not_started';
}

async function summary(store, lessonId, draft) {
  const k = tutorialKeys(lessonId);
  const classId = draft.tutorial?.class_id;
  const roster = classId ? await loadRoster(store, classId) : null;
  const byId = new Map((roster?.students ?? []).map((s) => [s.id, s]));
  const groups = await Promise.all((draft.tutorial?.groups ?? []).map(async (g) => {
    const state = (await read(store, k.group(g.id))) ?? emptyGroupState();
    const students = await Promise.all(g.students.map(async (id) => {
      const progress = await read(store, k.progress(deviceHash(`student:${classId}:${id}`)));
      const s = byId.get(id);
      return { id, initials: s?.initials ?? '–', name: s?.name ?? 'Removed student', stage: progress?.stage ?? 'not_started', unlocked: state.done_students.includes(id) };
    }));
    const handups = (await listBlobKeys(store, k.handups)).length;
    return { id: g.id, name: g.name, why: g.why, gap_type: g.gap_type, students, sitting: !!state.sitting, seen_at: state.seen_at ?? null, status: groupStatus(state, students), handups };
  }));
  return { groups, seen: groups.filter((g) => g.seen_at).length, total: groups.length };
}

export async function tutorialTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Tutorial not found.');
  const action = body.action ?? 'summary';
  if (!['summary', 'board', 'sit', 'show', 'hide', 'done', 'unlock', 'move'].includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || draft.pedagogical_mode !== 'tutorial') reject(404, 'not_found', 'Tutorial not found.');
  if (action === 'summary') return summary(store, lessonId, draft);
  if (action === 'move') {
    await moveStudent(store, lessonId, body.student_id, body.group_id);
    return summary(store, lessonId, await read(store, draftLessonKey(lessonId)));
  }
  const group = (draft.tutorial?.groups ?? []).find((g) => g.id === body.group_id);
  if (!group) reject(404, 'not_found', 'That group is gone.');
  const k = tutorialKeys(lessonId);
  const state = (await read(store, k.group(group.id))) ?? emptyGroupState();
  const classId = draft.tutorial.class_id;
  const ownerOf = (id) => deviceHash(`student:${classId}:${id}`);

  if (action === 'sit') await store.setJSON(k.group(group.id), { ...state, sitting: true });
  if (action === 'hide') await store.setJSON(k.group(group.id), { ...state, shown: null });
  if (action === 'show') {
    if (!group.students.includes(body.student_id)) reject(400, 'bad_student', 'That student isn’t in this group.');
    const answers = (await read(store, k.answers(ownerOf(body.student_id)))) ?? {};
    const text = answers[body.block_id]?.parts?.[body.part];
    if (typeof text !== 'string' || !text) reject(404, 'not_found', 'That answer is gone.');
    // Shown to the group with no name, so nobody is called out.
    await store.setJSON(k.group(group.id), { ...state, shown: { text, label: 'One answer from your group' } });
  }
  if (action === 'done') {
    const picked = (Array.isArray(body.students) ? body.students : []).filter((id) => group.students.includes(id));
    await store.setJSON(k.group(group.id), { ...state, sitting: false, shown: null, seen_at: new Date().toISOString(), done_students: [...new Set([...state.done_students, ...picked])] });
  }
  if (action === 'unlock') {
    if (!group.students.includes(body.student_id)) reject(400, 'bad_student', 'That student isn’t in this group.');
    await store.setJSON(k.group(group.id), { ...state, done_students: [...new Set([...state.done_students, body.student_id])] });
  }
  if (action === 'board') {
    const roster = await loadRoster(store, classId);
    const byId = new Map((roster?.students ?? []).map((s) => [s.id, s]));
    const students = await Promise.all(group.students.map(async (id) => ({
      id,
      initials: byId.get(id)?.initials ?? '–',
      name: byId.get(id)?.name ?? 'Removed student',
      stage: (await read(store, k.progress(ownerOf(id))))?.stage ?? 'not_started',
      answers: (await read(store, k.answers(ownerOf(id)))) ?? {}
    })));
    const fresh = (await read(store, k.group(group.id))) ?? emptyGroupState();
    return { group: { id: group.id, name: group.name, why: group.why }, sitting: !!fresh.sitting, shown: fresh.shown, done_students: fresh.done_students, students };
  }
  return summary(store, lessonId, await read(store, draftLessonKey(lessonId)));
}
```

`handups` in `summary` counts every hand-up in the tutorial, not per group. Make it per group by filtering on the stored `group_id`: read each hand-up, then count those with `group_id === g.id`. Do this before the test for hand-ups in Task 15.

- [ ] **Step 4: Write `netlify/functions/tutorial.mjs`**

Copy `netlify/functions/lecture.mjs`. Change the path to `/api/lessons/:id/tutorial`, the regex to `/\/lessons\/([^/]+)\/tutorial$/`, and call `tutorialTeacherAction` with `TutorialError`. Name the factory `createTutorialHandler`.

- [ ] **Step 5: Wire the mock**

In `mock-api.ts`, import `createTutorialHandler`. Add `: /^\/api\/lessons\/[^/]+\/tutorial$/.test(path) ? createTutorialHandler(deps)` next to the lecture branch, and `/^\/api\/lessons\/[^/]+\/tutorial$/.test(path) ||` to the list. Turn the teacher half of `tutorial-api-mock.test.ts` back on.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/tutorial*.test.js && cd apps/teaching && npx vitest run tests/unit/tutorial-api-mock.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/tutorial.mjs netlify/functions/tutorial.mjs apps/teaching/scripts/mock-api.ts tests/unit/tutorial-teacher.test.js apps/teaching/tests/unit/tutorial-api-mock.test.ts
git commit -m "Teaching tutorial: teacher summary, live board, sit, show, done, unlock, move"
```

### Task 15: Teacher board

**Files:**
- Create: `apps/teaching/src/tutorial/board.ts`
- Modify: `apps/teaching/src/tutorial/api.ts` (teacher client)
- Modify: `apps/teaching/src/tutorial/tutorial.css`
- Test: `apps/teaching/tests/unit/tutorial-board.test.ts`

- [ ] **Step 1: Add the teacher client to `api.ts`**

```ts
export type BoardStudent = { id: string; initials: string; name: string; stage: TutorialStage | 'not_started'; unlocked: boolean };
export type GroupSummary = { id: string; name: string; why: string; gap_type: 'knowledge' | 'mix_up'; students: BoardStudent[]; sitting: boolean; seen_at: string | null; status: 'not_started' | 'working' | 'waiting' | 'seen' | 'done'; handups: number };
export type TutorialSummary = { groups: GroupSummary[]; seen: number; total: number };
export type LiveAnswer = { parts: Record<string, string>; rating: 'right' | 'wrong' | null; at: string };
export type LiveBoard = {
  group: { id: string; name: string; why: string };
  sitting: boolean;
  shown: { text: string; label: string } | null;
  done_students: string[];
  students: Array<{ id: string; initials: string; name: string; stage: string; answers: Record<string, LiveAnswer> }>;
};

export type TutorialTeacherApi = {
  summary(): Promise<TutorialSummary>;
  board(groupId: string): Promise<LiveBoard>;
  sit(groupId: string): Promise<TutorialSummary>;
  show(groupId: string, studentId: string, blockId: string, part: string): Promise<TutorialSummary>;
  hide(groupId: string): Promise<TutorialSummary>;
  done(groupId: string, students: string[]): Promise<TutorialSummary>;
  unlock(groupId: string, studentId: string): Promise<TutorialSummary>;
  move(studentId: string, groupId: string): Promise<TutorialSummary>;
};

export function tutorialTeacherApi(lessonId: string): TutorialTeacherApi {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/tutorial`;
  const call = <T>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(endpoint, { action, ...extra });
  return {
    summary: () => call('summary'),
    board: (group_id) => call('board', { group_id }),
    sit: (group_id) => call('sit', { group_id }),
    show: (group_id, student_id, block_id, part) => call('show', { group_id, student_id, block_id, part }),
    hide: (group_id) => call('hide', { group_id }),
    done: (group_id, students) => call('done', { group_id, students }),
    unlock: (group_id, student_id) => call('unlock', { group_id, student_id }),
    move: (student_id, group_id) => call('move', { student_id, group_id })
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-board.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountTutorialBoard } from '@/tutorial/board';
import type { LiveBoard, TutorialSummary, TutorialTeacherApi } from '@/tutorial/api';
import type { Block } from '@/schemas/block';

const summary: TutorialSummary = {
  seen: 1, total: 2,
  groups: [
    { id: 'ga', name: 'Re-tells the plot', why: 'x', gap_type: 'knowledge', sitting: false, seen_at: null, status: 'waiting', handups: 1,
      students: [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', unlocked: false }, { id: 'st_ed', initials: 'EF', name: 'Ed Fox', stage: 'before', unlocked: false }] },
    { id: 'gb', name: 'Mix-up', why: 'y', gap_type: 'mix_up', sitting: false, seen_at: '2026-10-21T00:00:00.000Z', status: 'seen', handups: 0, students: [] }
  ]
};
const board: LiveBoard = {
  group: { id: 'ga', name: 'Re-tells the plot', why: 'x' }, sitting: true, shown: null, done_students: [],
  students: [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', stage: 'waiting', answers: { f1: { parts: { 2: 'It repeats' }, rating: 'wrong', at: 'x' } } }]
};
const faded = { id: 'f1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher', content: { prompt: '', extract: 'e', parts: [{ label: 'Technique', answer: 'a' }, { label: 'Where', answer: 'b' }, { label: 'Effect', answer: 'c' }], blanks: [2] } } as Block;
const lesson = () => ({ blocks: [{ id: 'tA', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'A', tutorial_group: 'ga', blocks: [faded, { id: 'w1', type: 'block', block_type: 'with_teacher', variant: 'medium', visibility: 'student_teacher', content: { talking_points: ['Ask what the reader feels'] } }] } }] as Block[] });
const api = (): TutorialTeacherApi => ({
  summary: vi.fn(async () => summary), board: vi.fn(async () => board), sit: vi.fn(async () => summary), show: vi.fn(async () => summary),
  hide: vi.fn(async () => summary), done: vi.fn(async () => summary), unlock: vi.fn(async () => summary), move: vi.fn(async () => summary)
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('tutorial board', () => {
  it('draws a card per group and the seen count', async () => {
    const handle = mountTutorialBoard({ getLesson: lesson, api: api() });
    await handle.refresh();
    expect(handle.root.querySelector('.tut-board__count')?.textContent).toBe('1 of 2 groups seen');
    const cards = handle.root.querySelectorAll('.tut-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain('Waiting for you');
    expect(cards[0]!.textContent).toContain('✋ 1');
  });

  it('Sit with group opens the live board with answers and talking points', async () => {
    const a = api();
    const handle = mountTutorialBoard({ getLesson: lesson, api: a });
    await handle.refresh();
    (handle.root.querySelector('.tut-card__sit') as HTMLButtonElement).click();
    await flush();
    expect(a.sit).toHaveBeenCalledWith('ga');
    const live = handle.root.querySelector('.tut-live')!;
    expect(live.textContent).toContain('It repeats');
    expect(live.textContent).toContain('Ask what the reader feels');
    (live.querySelector('.tut-live__show') as HTMLButtonElement).click();
    expect(a.show).toHaveBeenCalledWith('ga', 'st_ann', 'f1', '2');
  });

  it('Done unlocks the students who are here, with absent ones unticked', async () => {
    const a = api();
    const handle = mountTutorialBoard({ getLesson: lesson, api: a });
    await handle.refresh();
    (handle.root.querySelector('.tut-card__sit') as HTMLButtonElement).click();
    await flush();
    (handle.root.querySelector('.tut-live__done') as HTMLButtonElement).click();
    expect(a.done).toHaveBeenCalledWith('ga', ['st_ann']);
    handle.dispose();
  });
});
```

The live board ticks students whose stage is `waiting` (they reached With teacher). In the test the board's one student is `waiting`, so Done sends `['st_ann']`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-board.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write `board.ts`**

```ts
// apps/teaching/src/tutorial/board.ts
import type { Block } from '@/schemas/block';
import { button, el } from '@/quiz/dom';
import { splitAtTeacher, tutorialParts } from './model';
import type { GroupSummary, LiveBoard, TutorialSummary, TutorialTeacherApi } from './api';
import './tutorial.css';

export type TutorialBoardOptions = { getLesson: () => { blocks: Block[] }; api: TutorialTeacherApi };
export type TutorialBoardHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };

const POLL_MS = 4000;
const STATUS_TEXT: Record<GroupSummary['status'], string> = {
  not_started: 'Not started',
  working: 'Working on their own',
  waiting: 'Waiting for you',
  seen: 'Seen',
  done: 'Exit check done'
};
const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The teacher's tutorial board above the canvas: a card per group, and the
 * live board for the group being sat with. The live board checks for new
 * answers every few seconds, and only while it is open.
 */
export function mountTutorialBoard(options: TutorialBoardOptions): TutorialBoardHandle {
  const root = el('section', 'tut-board');
  const head = el('header', 'tut-board__head');
  const count = el('p', 'tut-board__count');
  head.append(el('h2', 'tut-board__title', 'Tutorial groups'), count);
  const strip = el('div', 'tut-board__strip');
  const live = el('div', 'tut-board__live');
  const error = el('p', 'tut-board__error');
  error.setAttribute('role', 'alert');
  root.append(head, strip, error, live);
  let summary: TutorialSummary | null = null;
  let open: string | null = null;
  let poll = 0;
  let disposed = false;

  const fail = (e: unknown) => (error.textContent = e instanceof Error ? e.message : 'That didn’t work. Try again.');

  function paintStrip(): void {
    if (!summary) return;
    count.textContent = `${summary.seen} of ${summary.total} groups seen`;
    strip.replaceChildren(...summary.groups.map((g) => {
      const card = el('article', `tut-card tut-card--${g.status}`);
      card.append(el('h3', 'tut-card__name', g.name), el('p', 'tut-card__meta', `${g.students.length} ${g.students.length === 1 ? 'student' : 'students'}`));
      const dots = el('p', 'tut-card__dots');
      for (const s of g.students) {
        const dot = el('span', `tut-dot tut-dot--${s.stage}`, s.initials);
        dot.title = `${s.name}: ${s.stage.replace('_', ' ')}`;
        dots.append(dot);
      }
      card.append(dots, el('p', 'tut-card__status', g.seen_at && g.status === 'seen' ? `Seen ${dateText(g.seen_at)}` : STATUS_TEXT[g.status]));
      if (g.handups) card.append(el('p', 'tut-card__hand', `✋ ${g.handups}`));
      const sit = button(g.sitting ? 'Back to group' : 'Sit with group', 'secondary', async () => {
        try {
          if (!g.sitting) summary = await options.api.sit(g.id);
          open = g.id;
          paintStrip();
          await paintLive();
        } catch (e) {
          fail(e);
        }
      });
      sit.classList.add('tut-card__sit');
      card.append(sit);
      return card;
    }));
  }

  async function paintLive(): Promise<void> {
    window.clearTimeout(poll);
    if (!open || disposed) return void live.replaceChildren();
    let board: LiveBoard;
    try {
      board = await options.api.board(open);
    } catch (e) {
      fail(e);
      return;
    }
    if (disposed || open !== board.group.id) return;
    const tab = tutorialParts(options.getLesson().blocks).tabs.get(board.group.id);
    const inner = (tab?.content.blocks as Block[]) ?? [];
    const { before, withTeacher } = splitAtTeacher(inner);
    const faded = before.filter((b): b is Extract<Block, { block_type: 'faded_example' }> => b.block_type === 'faded_example' && b.content.blanks.length > 0);
    const box = el('section', 'tut-live');
    box.append(el('h3', 'tut-live__title', `With ${board.group.name}`), el('p', 'tut-live__why', board.group.why));
    if (withTeacher?.content.talking_points.length) {
      const points = el('ul', 'tut-live__points');
      for (const p of withTeacher.content.talking_points) points.append(el('li', '', p));
      box.append(el('h4', 'tut-live__head', 'Talking points'), points);
    }
    const table = el('div', 'tut-live__rows');
    const here = new Set(board.students.filter((s) => s.stage === 'waiting' || board.done_students.includes(s.id)).map((s) => s.id));
    for (const s of board.students) {
      const row = el('div', 'tut-live__row');
      const tick = el('input');
      tick.type = 'checkbox';
      tick.checked = here.has(s.id);
      tick.setAttribute('aria-label', `${s.name} is here`);
      tick.addEventListener('change', () => (tick.checked ? here.add(s.id) : here.delete(s.id)));
      row.append(tick, el('span', 'tut-live__who', s.initials));
      for (const step of faded) {
        const answer = s.answers[step.id];
        const cell = el('div', `tut-live__cell${answer?.rating === 'wrong' ? ' tut-live__cell--wrong' : ''}`);
        for (const index of step.content.blanks) {
          const text = answer?.parts[String(index)];
          if (!text) continue;
          cell.append(el('p', 'tut-live__answer', text));
          const show = button('Show to group', 'ghost', () => {
            void options.api.show(board.group.id, s.id, step.id, String(index)).then(() => paintLive(), fail);
          });
          show.classList.add('tut-live__show');
          cell.append(show);
        }
        if (!answer) cell.append(el('p', 'tut-live__none', '…'));
        row.append(cell);
      }
      table.append(row);
    }
    box.append(table);
    const actions = el('div', 'tut-live__actions');
    if (board.shown) actions.append(button('Take it down', 'secondary', () => void options.api.hide(board.group.id).then(() => paintLive(), fail)));
    const done = button('Done with this group', 'primary', async () => {
      try {
        summary = await options.api.done(board.group.id, [...here]);
        open = null;
        paintStrip();
        live.replaceChildren();
      } catch (e) {
        fail(e);
      }
    });
    done.classList.add('tut-live__done');
    actions.append(done);
    box.append(actions);
    live.replaceChildren(box);
    poll = window.setTimeout(() => void paintLive(), POLL_MS);
  }

  return {
    root,
    async refresh() {
      try {
        summary = await options.api.summary();
        error.textContent = '';
        paintStrip();
      } catch (e) {
        fail(e);
      }
    },
    dispose() {
      disposed = true;
      window.clearTimeout(poll);
    }
  };
}
```

Re-rendering on every poll would lose a teacher's untick of an absent student. To prevent that, keep `here` in a `Map<groupId, Set<string>>` outside `paintLive`, set from the board only the first time a group opens.

- [ ] **Step 5: Add board styles to `tutorial.css`**

```css
.tut-board { display: grid; gap: .75rem; margin-bottom: 1rem; }
.tut-board__head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.tut-board__strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: .75rem; }
.tut-card { border: 1px solid var(--line, #d8d4cc); border-radius: 12px; padding: .75rem; display: grid; gap: .35rem; }
.tut-card--waiting { border-color: var(--accent, #6c8f7d); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #6c8f7d) 25%, transparent); }
.tut-card__name { margin: 0; font-size: 1rem; }
.tut-card__dots { display: flex; flex-wrap: wrap; gap: .25rem; margin: 0; }
.tut-dot { font-size: .7rem; padding: .1rem .35rem; border-radius: 999px; background: var(--paper-2, #f1eee8); }
.tut-dot--waiting, .tut-dot--after, .tut-dot--exit, .tut-dot--done { background: color-mix(in srgb, var(--accent, #6c8f7d) 30%, white); }
.tut-live { border: 1px solid var(--line, #d8d4cc); border-radius: 12px; padding: 1rem; display: grid; gap: .75rem; }
.tut-live__rows { display: grid; gap: .5rem; overflow-x: auto; }
.tut-live__row { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(10rem, 1fr); grid-template-columns: auto 3rem; gap: .5rem; align-items: start; }
.tut-live__cell--wrong { border-left: 3px solid var(--warn, #c9893b); padding-left: .4rem; }
.tut-live__actions { display: flex; gap: .5rem; justify-content: flex-end; }
@media (max-width: 560px) {
  .tut-board__strip { grid-template-columns: 1fr; }
  .tut-live__row { grid-auto-flow: row; grid-template-columns: 1fr; }
}
```

At 390px each student becomes a stacked card. The spec's swipe between students isn't needed when they stack; record that in the PR description.

- [ ] **Step 6: Run test and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-board.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/tutorial/board.ts apps/teaching/src/tutorial/api.ts apps/teaching/src/tutorial/tutorial.css apps/teaching/tests/unit/tutorial-board.test.ts
git commit -m "Teaching tutorial: teacher board and live board"
```

### Task 16: Editor tabs, board on the lesson page, Focus shows Common

**Files:**
- Create: `apps/teaching/src/tutorial/editor-tabs.ts`
- Modify: `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (~1037 lecture panel, ~1099 `decorateRow`)
- Modify: `apps/teaching/src/teacher/lesson-display.ts:99`
- Test: `apps/teaching/tests/unit/tutorial-editor-tabs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-editor-tabs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTutorialTabs, inTab } from '@/tutorial/editor-tabs';
import type { Block } from '@/schemas/block';

const s = (id: string, extra: Record<string, unknown>) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: id, blocks: [], ...extra } }) as Block;
const h = { id: 'h1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'Demo' } } as Block;
const lesson = { blocks: [h, s('tA', { tutorial_group: 'ga' }), s('eA', { tutorial_group: 'ga', tutorial_exit: true })], tutorial: { class_id: 'c', groups: [{ id: 'ga', name: 'Re-tells', why: '', goal: '', gap_type: 'knowledge' as const, students: [], evidence: [] }] } };

describe('tutorial editor tabs', () => {
  it('says which top-level blocks belong to a tab', () => {
    expect(inTab(h, 'common')).toBe(true);
    expect(inTab(lesson.blocks[1]!, 'common')).toBe(false);
    expect(inTab(lesson.blocks[1]!, 'ga')).toBe(true);
    expect(inTab(lesson.blocks[2]!, 'ga')).toBe(true);
    expect(inTab(lesson.blocks[1]!, 'all')).toBe(true);
  });

  it('draws Common, one tab per group and All, and reports the choice', () => {
    const onTab = vi.fn();
    const tabs = createTutorialTabs({ getLesson: () => lesson, onTab });
    const labels = [...tabs.root.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Common', 'Re-tells', 'All']);
    (tabs.root.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(onTab).toHaveBeenCalledWith('ga');
    expect(tabs.current()).toBe('ga');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-editor-tabs.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `editor-tabs.ts`**

```ts
// apps/teaching/src/tutorial/editor-tabs.ts
import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import type { TutorialSettings } from './schema';

export type TutorialTab = 'common' | 'all' | string;

/** A top-level block shows on the canvas when it belongs to the chosen tab. */
export function inTab(block: Block, tab: TutorialTab): boolean {
  if (tab === 'all') return true;
  const group = block.block_type === 'section' ? block.content.tutorial_group : undefined;
  return tab === 'common' ? typeof group !== 'string' : group === tab;
}

/**
 * Tabs above a tutorial's canvas: Common, each group (its tab and exit check
 * together), and All. They only hide rows on the canvas; nothing is moved.
 */
export function createTutorialTabs(options: { getLesson: () => { tutorial?: TutorialSettings }; onTab: (tab: TutorialTab) => void }) {
  let tab: TutorialTab = 'common';
  const root = el('div', 'hub-pills tut-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Tutorial part');
  function paint(): void {
    const groups = options.getLesson().tutorial?.groups ?? [];
    const items: Array<[TutorialTab, string]> = [['common', 'Common'], ...groups.map((g): [TutorialTab, string] => [g.id, g.name]), ['all', 'All']];
    root.replaceChildren(...items.map(([id, label]) => {
      const pill = el('button', 'hub-pills__pill', label);
      pill.type = 'button';
      pill.setAttribute('aria-pressed', String(id === tab));
      pill.addEventListener('click', () => {
        tab = id;
        paint();
        options.onTab(id);
      });
      return pill;
    }));
    applyHubPillsThumb?.(root);
  }
  paint();
  return { root, current: () => tab, repaint: paint };
}
```

Check how `note-cue.ts` calls `applyHubPillsThumb` (its arguments and pill class names) and match that. The project rule is kit pills, not selects.

- [ ] **Step 4: Mount board and tabs in `mount-page.ts`**

Next to `syncLecturePanel` (~1040), add `syncTutorialPanel`, called wherever `syncLecturePanel` is called:

```ts
  // A lesson set to Tutorial gets its board (groups, live board) and the part tabs.
  const tutorialHost = document.createElement('div');
  tutorialHost.className = 'lesson-page__tutorial';
  let tutorialBoard: TutorialBoardHandle | null = null;
  let tutorialTabs: ReturnType<typeof createTutorialTabs> | null = null;
  function syncTutorialPanel(): void {
    const isTutorial = resolvePedagogicalMode(lesson.pedagogical_mode) === 'tutorial';
    if (isTutorial && !tutorialBoard) {
      tutorialBoard = mountTutorialBoard({ getLesson: () => lesson, api: tutorialTeacherApi(lesson.id) });
      tutorialTabs = createTutorialTabs({ getLesson: () => lesson, onTab: () => canvas.update(lesson.blocks, media) });
      tutorialHost.append(tutorialBoard.root, tutorialTabs.root);
      void tutorialBoard.refresh();
    } else if (!isTutorial && tutorialBoard) {
      tutorialBoard.dispose();
      tutorialBoard = null;
      tutorialTabs = null;
      tutorialHost.replaceChildren();
    }
    tutorialTabs?.repaint();
    tutorialHost.hidden = !isTutorial;
  }
```

Insert `tutorialHost` into the page where `lectureHost` is inserted. In the canvas `decorateRow` (~1099), add at the top. This runs only for top-level rows, because `decorateRow` receives nested rows too; check `containerOf(lesson.blocks, block.id) === null` from `@/lecture/tree`:

```ts
      if (tutorialTabs && containerOf(lesson.blocks, block.id) === null) row.hidden = !inTab(block, tutorialTabs.current());
```

New blocks the teacher inserts while a group tab is open land at the top level, outside the group's section. Clicking **+** inside the group section adds inside it, which is what a teacher will do. Note this in the walk (Task 21).

- [ ] **Step 5: Focus view shows Common only**

In `lesson-display.ts:99`:

```ts
    const shown = isQuiz
      ? lesson.blocks.filter((block) => block.block_type !== 'quiz_question')
      : lesson.pedagogical_mode === 'tutorial'
        ? tutorialCommon(lesson.blocks)
        : lesson.blocks;
```

Import `tutorialCommon` from `@/tutorial/model`.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-editor-tabs.test.ts tests/unit/lesson-canvas-page.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/tutorial/editor-tabs.ts apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/src/teacher/lesson-display.ts apps/teaching/tests/unit/tutorial-editor-tabs.test.ts
git commit -m "Teaching tutorial: board and part tabs on the lesson page; Focus shows Common"
```

---

## Phase 5: Ann

### Task 17: Grouping brief and parse (pure)

**Files:**
- Create: `apps/teaching/src/tutorial/grouping.ts`
- Test: `apps/teaching/tests/unit/tutorial-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-grouping.test.ts
import { describe, it, expect } from 'vitest';
import { anonymise, groupingBrief, parseGroups } from '@/tutorial/grouping';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, why: Evidence['why'], share = 0): Evidence => ({ item: 'q1', tags: ['tech:cyclical'], share, why, student, source: 'quiz1', date: '2026-10-20', confidence: null });
const evidence = [
  ev('st_ann', [{ type: 'named', as: 'repetition', target: 'cyclical structure' }]),
  ev('st_cy', [{ type: 'not_found', target: 'cyclical structure' }]),
  ev('st_zz', [{ type: 'code', id: 'vague' }])
];

describe('tutorial grouping', () => {
  it('anonymises students and keeps only the chosen ones', () => {
    const anon = anonymise(['st_ann', 'st_cy'], evidence, 'tech:cyclical');
    expect(anon.keys).toEqual({ S1: 'st_ann', S2: 'st_cy' });
    expect(anon.rows.map((r) => r.key)).toEqual(['S1', 'S2']);
    expect(JSON.stringify(anon)).not.toContain('st_zz');
  });

  it('writes a brief with no ids or names', () => {
    const anon = anonymise(['st_ann', 'st_cy'], evidence, 'tech:cyclical');
    const brief = groupingBrief({ tagLabel: 'Cyclical structure', rows: anon.rows, mistakeText: (w) => JSON.stringify(w) });
    expect(brief).toContain('Cyclical structure');
    expect(brief).toContain('S1');
    expect(brief).not.toContain('st_ann');
  });

  it('parses groups, maps keys back and drops unknown keys', () => {
    const raw = '```json\n{"groups":[{"name":"Names it wrong","why":"Calls it repetition","goal":"Today: naming it","gap_type":"mix_up","members":["S1","S9"],"quotes":{"S1":"Named it repetition"}},{"name":"Can’t find it","why":"Misses the return","goal":"Today: finding where it starts and ends","gap_type":"knowledge","members":["S2"],"quotes":{}}]}\n```';
    const groups = parseGroups(raw, { S1: 'st_ann', S2: 'st_cy' });
    expect(groups.map((g) => [g.name, g.students, g.gap_type])).toEqual([['Names it wrong', ['st_ann'], 'mix_up'], ['Can’t find it', ['st_cy'], 'knowledge']]);
    expect(groups[0]!.evidence).toEqual([{ student: 'st_ann', quote: 'Named it repetition' }]);
    expect(groups[0]!.id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('puts any student Ann left out in an Unsure group, and refuses junk', () => {
    const groups = parseGroups('{"groups":[{"name":"A","why":"","goal":"Today","gap_type":"knowledge","members":["S1"],"quotes":{}}]}', { S1: 'st_ann', S2: 'st_cy' });
    expect(groups.at(-1)!.students).toEqual(['st_cy']);
    expect(groups.at(-1)!.unsure).toEqual(['st_cy']);
    expect(() => parseGroups('not json', { S1: 'st_ann' })).toThrow('Ann’s grouping came back unreadable. Try again.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-grouping.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `grouping.ts`**

```ts
// apps/teaching/src/tutorial/grouping.ts
import type { Evidence, Why } from '@/evidence/types';
import { TutorialGroupSchema, type TutorialGroup } from './schema';

/** At most this many groups; a teacher can't sit with more in a lesson or two. */
export const MAX_GROUPS = 5;

export type AnonRow = { key: string; mistakes: Why[]; share: number | null };

/**
 * What leaves the app for grouping: S1, S2… and their recorded mistakes on
 * the one tag. No names, initials or ids. `keys` stays in the browser.
 */
export function anonymise(students: readonly string[], evidence: readonly Evidence[], tag: string): { keys: Record<string, string>; rows: AnonRow[] } {
  const keys: Record<string, string> = {};
  const rows = students.map((student, i) => {
    const key = `S${i + 1}`;
    keys[key] = student;
    const mine = evidence.filter((e) => e.student === student && e.tags.includes(tag));
    const shares = mine.map((e) => e.share).filter((s): s is number => s !== null);
    return { key, mistakes: mine.flatMap((e) => e.why).slice(0, 12), share: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null };
  });
  return { keys, rows };
}

export function groupingBrief(input: { tagLabel: string; rows: AnonRow[]; mistakeText: (why: Why) => string }): string {
  const lines = input.rows.map((r) => `${r.key} (${r.share === null ? 'not marked' : `${Math.round(r.share * 100)}%`}): ${r.mistakes.map(input.mistakeText).join('; ') || 'low marks, no mistake recorded'}`);
  return [
    `These students are behind on ${input.tagLabel}. Group them by WHY they get it wrong, so each group can be taught to its reason.`,
    `Make 2 to ${MAX_GROUPS} groups. Every student goes in exactly one group.`,
    'For each group give: name (teacher-facing, under 8 words), why (one sentence), goal (student-facing, starts "Today:", says what they will do, never what they can’t), gap_type ("knowledge" when something is missing, "mix_up" when they confuse two things), members (the S keys), quotes (per member, one short line from their mistakes above that shows the reason).',
    'Reply with JSON only: {"groups":[{"name":"","why":"","goal":"","gap_type":"knowledge","members":["S1"],"quotes":{"S1":""}}]}',
    'Students:',
    ...lines
  ].join('\n\n');
}

const slug = (text: string, i: number) => `${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'group'}-${i + 1}`;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Ann's reply → groups with real student ids. Anyone left out goes in an Unsure group. */
export function parseGroups(raw: string, keys: Record<string, string>): TutorialGroup[] {
  let parsed: { groups?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Ann’s grouping came back unreadable. Try again.');
  }
  if (!Array.isArray(parsed.groups)) throw new Error('Ann’s grouping came back unreadable. Try again.');
  const placed = new Set<string>();
  const groups: TutorialGroup[] = [];
  parsed.groups.slice(0, MAX_GROUPS).forEach((g, i) => {
    const raw = g as { name?: string; why?: string; goal?: string; gap_type?: string; members?: unknown; quotes?: Record<string, string> };
    const students = (Array.isArray(raw.members) ? raw.members : []).map((m) => keys[String(m)]).filter((id): id is string => !!id && !placed.has(id));
    students.forEach((id) => placed.add(id));
    if (!students.length) return;
    const back = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
    const candidate = {
      id: slug(raw.name ?? 'group', i),
      name: (raw.name ?? `Group ${i + 1}`).slice(0, 80),
      why: (raw.why ?? '').slice(0, 300),
      goal: (raw.goal ?? 'Today: practising this together').slice(0, 140),
      gap_type: raw.gap_type === 'mix_up' ? 'mix_up' : 'knowledge',
      students,
      evidence: students.map((id) => ({ student: id, quote: (raw.quotes?.[back[id]!] ?? '').slice(0, 300) })).filter((e) => e.quote)
    };
    groups.push(TutorialGroupSchema.parse(candidate));
  });
  const left = Object.values(keys).filter((id) => !placed.has(id));
  if (left.length) groups.push(TutorialGroupSchema.parse({ id: 'unsure', name: 'Unsure', why: 'Ann couldn’t place these students. Move each one to a group.', goal: 'Today: practising this together', gap_type: 'knowledge', students: left, evidence: [], unsure: left }));
  return groups;
}
```

- [ ] **Step 4: Run test**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-grouping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/tutorial/grouping.ts apps/teaching/tests/unit/tutorial-grouping.test.ts
git commit -m "Teaching tutorial: grouping brief and parse, with no names sent"
```

### Task 18: Grouping endpoint

**Files:**
- Create: `netlify/functions/_shared/tutorial-groups-model.mjs`, `netlify/functions/tutorial-groups.mjs`
- Modify: `apps/teaching/scripts/mock-api.ts` (mock reply so the walk works with no key)
- Test: `tests/unit/tutorial-groups.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/tutorial-groups.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { askForGroups } from '../../netlify/functions/_shared/tutorial-groups-model.mjs';

test('sends the brief and returns the text; refuses a brief with an id in it', async () => {
  let sent;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"groups":[]}' }], usage: { input_tokens: 900, output_tokens: 300 } }) };
  };
  const out = await askForGroups({ brief: 'S1: named it as repetition', apiKey: 'k', fetchImpl });
  assert.equal(out.text, '{"groups":[]}');
  assert.equal(sent.messages[0].content, 'S1: named it as repetition');
  assert.match(sent.model, /^claude-/);
  await assert.rejects(askForGroups({ brief: 'st_ann named it', apiKey: 'k', fetchImpl }), { code: 'names_in_brief' });
});

test('no key: a clear error', async () => {
  await assert.rejects(askForGroups({ brief: 'S1', apiKey: '' }), { code: 'no_key' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unit/tutorial-groups.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the model module**

```js
// netlify/functions/_shared/tutorial-groups-model.mjs
/**
 * Ann's grouping call for a tutorial: one Sonnet message, no tools. The brief
 * names students only as S1, S2…; anything that looks like a student id is
 * refused before it leaves.
 */
import { QuizError } from './question-drop.mjs';

const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 45_000;
const SYSTEM = 'You are Ann, a teaching assistant for a secondary English teacher in Sydney. You group students by the reason behind their mistakes so the teacher can reteach each reason. Reply with JSON only.';

export async function askForGroups({ brief, apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.TEACHING_AI_MODEL || MODEL, fetchImpl = fetch }) {
  if (!apiKey) throw new QuizError(503, 'no_key', 'Ann isn’t set up on this server.');
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 12000) throw new QuizError(400, 'bad_brief', 'Nothing to group.');
  if (/\bst_[a-z0-9]/i.test(brief)) throw new QuizError(400, 'names_in_brief', 'The brief named a student. Nothing was sent.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM, messages: [{ role: 'user', content: brief }] }),
      signal: ctrl.signal
    });
    if (!response.ok) throw new QuizError(502, 'model_failed', 'Ann couldn’t group them just now. Try again.');
    const data = await response.json();
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    return { text, usage: data.usage ?? null };
  } finally {
    clearTimeout(timer);
  }
}
```

Student ids in this project may not start with `st_`. Read `class-claims.mjs` for the id format and match the guard to it. The guard is a backstop: the brief is built from S-keys only.

- [ ] **Step 4: Write the handler**

`netlify/functions/tutorial-groups.mjs`: an operator handler at `/api/tutorial-groups`, POST only. It takes `{ brief }`, calls `askForGroups({ brief, apiKey: env.ANTHROPIC_API_KEY })` and returns `{ text }`, mapping `QuizError` to `errorResponse`. Copy the structure of `netlify/functions/lecture.mjs`.

- [ ] **Step 5: Mock reply**

In `mock-api.ts`, route `/api/tutorial-groups` to a stub that reads the S-keys in the brief and returns two groups (odd keys / even keys). Then the local walk shows the grouping screen with no API key. Name the groups "Names it wrong" and "Re-tells the plot".

- [ ] **Step 6: Run tests**

Run: `node --test tests/unit/tutorial-groups.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/tutorial-groups-model.mjs netlify/functions/tutorial-groups.mjs apps/teaching/scripts/mock-api.ts tests/unit/tutorial-groups.test.js
git commit -m "Teaching tutorial: Ann's grouping call, names never sent"
```

### Task 19: Ann can draft into a tutorial

**Files:**
- Modify: `apps/teaching/src/ai/quiz-proposal.ts`
- Modify: `apps/teaching/src/ai/block-recipes.ts`
- Create: `apps/teaching/src/tutorial/draft.ts`
- Test: `apps/teaching/tests/unit/tutorial-ann.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-ann.test.ts
import { describe, it, expect, vi } from 'vitest';
import { quizProposalIssues } from '@/ai/quiz-proposal';
import { draftBrief, startTutorial } from '@/tutorial/draft';
import type { Lesson } from '@/schemas/lesson';
import type { TutorialGroup } from '@/tutorial/schema';

const mc = (id: string) => ({ id, type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher', content: { question: { id, kind: 'multiple_choice', prompt: 'Which?', marks: 1, choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } } });
const exit = (blocks: unknown[]) => ({ id: 'eA', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks } });
const lesson = { pedagogical_mode: 'tutorial', blocks: [] } as unknown as Lesson;
const groups: TutorialGroup[] = [{ id: 'ga', name: 'Re-tells', why: 'Re-tells the plot', goal: 'Today: the effect', gap_type: 'knowledge', students: ['st_ann'], evidence: [{ student: 'st_ann', quote: 'Said “it goes back to the start”' }] }];

describe('Ann in a tutorial', () => {
  it('allows quiz questions in an exit check section and nowhere else', () => {
    expect(quizProposalIssues({ kind: 'replace_section', section: exit([mc('q1')]) } as never, lesson)).toEqual([]);
    const loose = quizProposalIssues({ kind: 'insert_blocks', position: 'below', blocks: [mc('q2')] } as never, lesson);
    expect(loose.join(' ')).toContain('exit check');
  });

  it('briefs Ann per group with section ids and no names', () => {
    const brief = draftBrief({ tagLabel: 'Cyclical structure', groups, sections: { common: 'h1', tabs: { ga: 'tA' }, exits: { ga: 'eA' } } });
    expect(brief).toContain('tA');
    expect(brief).toContain('eA');
    expect(brief).toContain('Re-tells the plot');
    expect(brief).toContain('faded_example');
    expect(brief).not.toContain('st_ann');
  });

  it('creates the lesson with its skeleton, then starts Ann', async () => {
    const createLesson = vi.fn(async (_b: Record<string, unknown>) => ({ id: 'tut1' }));
    const startJob = vi.fn(async () => ({}) as never);
    const id = await startTutorial({ unitId: 'u1', afterLessonId: 'quiz1', classId: 'class1', tag: 'tech:cyclical', tagLabel: 'Cyclical structure', groups }, { createLesson, startJob });
    expect(id).toBe('tut1');
    const body = createLesson.mock.calls[0]![0];
    expect(body).toMatchObject({ pedagogical_mode: 'tutorial', unit_id: 'u1', after_lesson_id: 'quiz1', tutorial: { class_id: 'class1', tag: 'tech:cyclical', source_lesson_id: 'quiz1' } });
    expect((body.blocks as unknown[]).length).toBe(3);
    expect(startJob).toHaveBeenCalledWith(expect.objectContaining({ lesson_id: 'tut1', agent: 'ann', scope: 'lesson' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-ann.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Teach `quizProposalIssues` about tutorials**

Replace the "not a quiz" check:

```ts
  if (lesson.pedagogical_mode === 'tutorial') {
    if (questionsOutsideExit(proposal) > 0) {
      issues.push('In a tutorial, quiz questions only go in a group’s exit check section (tutorial_exit: true). Use replace_section on that group’s exit check.');
    }
  } else if (lesson.pedagogical_mode !== 'quiz' && setMode !== 'quiz') {
    // …existing message unchanged…
  }
```

with:

```ts
/** Quiz questions in a proposal that don't sit inside an exit-check section. */
function questionsOutsideExit(proposal: AiProposal): number {
  let outside = 0;
  const walk = (blocks: Block[], inExit: boolean) => {
    for (const block of blocks) {
      if (block.block_type === 'quiz_question' && !inExit) outside += 1;
      if (block.block_type === 'section') walk(block.content.blocks as Block[], inExit || block.content.tutorial_exit === true);
    }
  };
  walk(proposalBlocks(proposal), false);
  return outside;
}
```

A `replace_block` of a single question inside an exit section won't pass this. Ann redrafts whole sections in a tutorial, and the brief tells her to (Step 5), so that's accepted.

- [ ] **Step 4: Add tutorial recipes to `block-recipes.ts`**

Append to the recipe text Ann reads:

```
A tutorial lesson (type tutorial) has Common blocks at the top level, and per group a section with tutorial_group (the group's tab) and a section with tutorial_group and tutorial_exit: true (the exit check). Fill each with propose_replace_section, keeping the section's id, title, tutorial_group and tutorial_exit.
A group tab follows I do → We do → You do: a heading with the group's goal; a worked example (faded_example with blanks: []) for a knowledge gap, or for a mix_up a contrast pair (two short callouts side by side in a columns block, then a self_check asking which is which and why); then two faded_example steps (blanks: [one part], then blanks: [two parts]), each followed by a side_path section ("A second look") for a wrong answer; then one with_teacher block with 2–4 talking_points (no student names); then You do: one faded_example with every part blank on a new extract.
faded_example: content { prompt, extract, parts: [{ label: "Technique", answer }, { label: "Where", answer }, { label: "Effect", answer }], blanks: [part indexes the student writes] }.
with_teacher: content { talking_points: [string] }.
No hinge_question in a tutorial tab. Exit checks: 2–3 quiz_question blocks aimed at that group's exact reason, tagged with the same technique.
Goals and talking points say what students will do, never what they can't do.
```

- [ ] **Step 5: Write `draft.ts`**

```ts
// apps/teaching/src/tutorial/draft.ts
import { apiPost } from '@/api/client';
import { startAiJob, type StartAiJobPayload, type StartAiJobResult } from '@/ai/jobs-client';
import { tutorialParts, tutorialSkeleton } from './model';
import type { TutorialGroup } from './schema';

const BRIEF_MAX = 8000;

export type DraftSections = { common: string; tabs: Record<string, string>; exits: Record<string, string> };

/** What Ann is told: the groups' reasons and goals, their evidence lines, and which section to fill. No names. */
export function draftBrief(input: { tagLabel: string; groups: readonly TutorialGroup[]; sections: DraftSections }): string {
  const parts = [
    'Go ahead and build without a plan: the teacher has already confirmed this tutorial.',
    `This tutorial reteaches ${input.tagLabel} to small groups. Fill every section below with propose_replace_section, one proposal per section.`,
    `Common (section-less blocks at the top, starting at block ${input.sections.common}): a short teacher demo of ${input.tagLabel} on one extract, with tap-to-reveal steps. Insert below that heading.`
  ];
  for (const g of input.groups) {
    const lines = g.evidence.slice(0, 6).map((e) => `- ${e.quote}`).join('\n');
    parts.push(
      [
        `Group tab section ${input.sections.tabs[g.id]} and exit check section ${input.sections.exits[g.id]}.`,
        `Reason: ${g.why}`,
        `Goal shown to students: ${g.goal}`,
        `Gap type: ${g.gap_type === 'mix_up' ? 'mix_up: start with a contrast pair' : 'knowledge: start with a fully worked faded_example'}`,
        lines ? `What these students wrote or chose:\n${lines}` : ''
      ].filter(Boolean).join('\n')
    );
  }
  parts.push('Follow the tutorial recipe: faded_example steps, a with_teacher block, You do, and 2–3 exit check questions per group.');
  const brief = parts.join('\n\n');
  return brief.length > BRIEF_MAX ? brief.slice(0, BRIEF_MAX) : brief;
}

export type TutorialDeps = {
  createLesson: (body: Record<string, unknown>) => Promise<{ id: string }>;
  startJob: (payload: StartAiJobPayload) => Promise<StartAiJobResult>;
};
export const httpTutorialDeps: TutorialDeps = { createLesson: (body) => apiPost<{ id: string }>('/api/lessons', body), startJob: (p) => startAiJob(p) };

export type StartTutorialInput = { unitId: string; afterLessonId: string; classId: string; tag: string; tagLabel: string; groups: TutorialGroup[] };

/** Creates the tutorial straight after its quiz, with a skeleton Ann fills, then starts Ann. */
export async function startTutorial(input: StartTutorialInput, deps: TutorialDeps = httpTutorialDeps): Promise<string> {
  let n = 0;
  const stamp = Date.now().toString(36);
  const blocks = tutorialSkeleton(input.groups, () => `tut-${stamp}-${++n}`);
  const lesson = await deps.createLesson({
    title: `Tutorial: ${input.tagLabel}`,
    unit_id: input.unitId,
    pedagogical_mode: 'tutorial',
    after_lesson_id: input.afterLessonId,
    blocks,
    tutorial: { class_id: input.classId, tag: input.tag, source_lesson_id: input.afterLessonId, groups: input.groups }
  });
  const parts = tutorialParts(blocks);
  const sections: DraftSections = {
    common: parts.common[0]!.id,
    tabs: Object.fromEntries([...parts.tabs].map(([g, s]) => [g, s.id])),
    exits: Object.fromEntries([...parts.exits].map(([g, s]) => [g, s.id]))
  };
  await deps.startJob({ lesson_id: lesson.id, agent: 'ann', scope: 'lesson', message: draftBrief({ tagLabel: input.tagLabel, groups: input.groups, sections }) });
  return lesson.id;
}
```

Check that `POST /api/lessons` accepts `blocks` and `tutorial` in the create body (`netlify/functions/lessons*.mjs`). If the create endpoint only takes known fields, add `tutorial` and `blocks` the way `quiz` and `pedagogical_mode` are passed through, with a server test.

- [ ] **Step 6: Regenerate the AI runtime, run tests**

Run: `node scripts/generate-teaching-ai-runtime.mjs && cd apps/teaching && npx vitest run tests/unit/tutorial-ann.test.ts tests/unit/quiz-proposal*.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/ai apps/teaching/src/tutorial/draft.ts apps/teaching/tests/unit/tutorial-ann.test.ts netlify/functions/_shared/teaching-ai-runtime.mjs
git commit -m "Teaching tutorial: Ann drafts tabs and exit checks into a tutorial"
```

### Task 20: Plan a tutorial sheet and markbook button

**Files:**
- Create: `apps/teaching/src/tutorial/plan-sheet.ts`
- Modify: `apps/teaching/src/markbook/next-view.ts` (~23 actions, ~123 group card)
- Modify: `apps/teaching/src/teacher/sections/markbook.ts` (~452, ~483)
- Modify: `apps/teaching/src/evidence/constants.ts` (cost line)
- Test: `apps/teaching/tests/unit/tutorial-plan-sheet.test.ts`

- [ ] **Step 1: Add the cost line**

In `evidence/constants.ts`:

```ts
/** Plan a tutorial: one grouping call plus one Ann drafting job across every group. */
export const TUTORIAL = {
  /** Grouping is one short Sonnet call; drafting is about one follow-up quiz build per group (FOLLOW_UP.cost). */
  cost: (groups: number) => `about A$${(0.05 + 0.4 * groups).toFixed(2)} to A$${(0.1 + 0.6 * groups).toFixed(2)}`
} as const;
```

These figures scale the recorded follow-up quiz build (`FOLLOW_UP.cost`, A$0.30–0.55 for ~10 questions) per group, because one group tab plus its exit check is a little more than one follow-up. After the first live run, replace them with the job's recorded usage.

- [ ] **Step 2: Write the failing test**

```ts
// apps/teaching/tests/unit/tutorial-plan-sheet.test.ts
import { describe, it, expect, vi } from 'vitest';
import { openTutorialPlan } from '@/tutorial/plan-sheet';
import type { Evidence } from '@/evidence/types';

const ev = (student: string): Evidence => ({ item: 'q1', tags: ['tech:cyc'], share: 0, why: [{ type: 'not_found', target: 'cyclical' }], student, source: 'quiz1', date: '2026-10-20', confidence: null });
const students = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }];
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Plan a tutorial', () => {
  it('confirms, groups, lets the teacher move a student, then drafts', async () => {
    const group = vi.fn(async (_brief: string) => '{"groups":[{"name":"Can’t find it","why":"w","goal":"Today: finding it","gap_type":"knowledge","members":["S1","S2"],"quotes":{"S1":"Missed the return"}}]}');
    const start = vi.fn(async () => 'tut1');
    const onDone = vi.fn();
    const sheet = openTutorialPlan({
      classId: 'class1', unitId: 'u1', sourceLessonId: 'quiz1', tag: 'tech:cyc', tagLabel: 'Cyclical structure',
      students, chosen: ['st_ann', 'st_cy'], evidence: [ev('st_ann'), ev('st_cy')], mistakeText: () => 'missed it',
      onDone, deps: { group, start }
    });
    expect(sheet.textContent).toContain('What Ann is told (no names)');
    expect(sheet.textContent).not.toContain('Ann Bell (');
    (sheet.querySelector('.tut-plan__group-btn') as HTMLButtonElement).click();
    await flush();
    expect(group.mock.calls[0]![0]).not.toContain('st_ann');
    expect(sheet.querySelector('.tut-plan__groups')?.textContent).toContain('Missed the return');
    expect(sheet.querySelector('.tut-plan__groups')?.textContent).toContain('AB');
    (sheet.querySelector('.tut-plan__draft') as HTMLButtonElement).click();
    await flush();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ classId: 'class1', groups: [expect.objectContaining({ students: ['st_ann', 'st_cy'] })] }));
    expect(onDone).toHaveBeenCalledWith('tut1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-plan-sheet.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Write `plan-sheet.ts`**

```ts
// apps/teaching/src/tutorial/plan-sheet.ts
import { apiPost } from '@/api/client';
import { openOverlay } from '@/markbook/overlay';
import { button, el } from '@/quiz/dom';
import { TUTORIAL } from '@/evidence/constants';
import type { Evidence, Why } from '@/evidence/types';
import { anonymise, groupingBrief, parseGroups } from './grouping';
import { startTutorial, type StartTutorialInput } from './draft';
import type { TutorialGroup } from './schema';

export type PlanDeps = { group: (brief: string) => Promise<string>; start: (input: StartTutorialInput) => Promise<string> };
export const httpPlanDeps: PlanDeps = {
  group: (brief) => apiPost<{ text: string }>('/api/tutorial-groups', { brief }).then((r) => r.text),
  start: (input) => startTutorial(input)
};

export type TutorialPlanOptions = {
  classId: string;
  unitId: string;
  sourceLessonId: string;
  tag: string;
  tagLabel: string;
  students: Array<{ id: string; name: string; initials: string }>;
  chosen: string[];
  evidence: Evidence[];
  mistakeText: (why: Why) => string;
  onDone: (lessonId: string) => void;
  deps?: PlanDeps;
};

/**
 * Plan a tutorial: see what Ann is told and the cost, let Ann group the
 * students by why, adjust the groups, then draft. Nothing is drafted until
 * Draft tutorial.
 */
export function openTutorialPlan(o: TutorialPlanOptions): HTMLElement {
  const deps = o.deps ?? httpPlanDeps;
  const sheet = el('div', 'mb-sheet tut-plan');
  const heading = el('h3', 'mb-form__title', `Tutorial: ${o.tagLabel}`);
  heading.id = `tut-plan-${Math.random().toString(36).slice(2, 8)}`;
  const listed = new Set(o.students.map((s) => s.id));
  const picked = o.chosen.filter((id) => listed.has(id));
  const anon = anonymise(picked, o.evidence, o.tag);
  const brief = groupingBrief({ tagLabel: o.tagLabel, rows: anon.rows, mistakeText: o.mistakeText });
  const byId = new Map(o.students.map((s) => [s.id, s]));
  const error = el('p', 'mb-form__error');
  error.setAttribute('aria-live', 'polite');
  const groupsHost = el('div', 'tut-plan__groups');
  let groups: TutorialGroup[] = [];
  let busy = false;
  const handle = { close: () => {} };

  function paintGroups(): void {
    groupsHost.replaceChildren(...groups.map((g, gi) => {
      const card = el('section', 'tut-plan__group');
      const name = el('input', 'mb-form__input');
      name.value = g.name;
      name.setAttribute('aria-label', 'Group name');
      name.addEventListener('input', () => (groups[gi] = { ...groups[gi]!, name: name.value.slice(0, 80) || 'Group' }));
      card.append(name, el('p', 'tut-plan__why', g.why), el('p', 'tut-plan__goal', g.goal));
      const list = el('ul', 'tut-plan__students');
      for (const id of g.students) {
        const s = byId.get(id);
        const item = el('li', 'tut-plan__student');
        item.append(el('span', 'tut-plan__who', s ? `${s.initials} · ${s.name}` : id));
        const quote = g.evidence.find((e) => e.student === id)?.quote;
        if (quote) item.append(el('span', 'tut-plan__quote', `“${quote}”`));
        const move = el('select', 'mb-form__input tut-plan__move');
        move.setAttribute('aria-label', `Move ${s?.initials ?? 'student'} to`);
        for (const other of groups) move.append(new Option(other.name, other.id, false, other.id === g.id));
        move.append(new Option('Leave out of the tutorial', ''));
        move.addEventListener('change', () => {
          groups = groups.map((x) => ({ ...x, students: x.students.filter((y) => y !== id) }));
          if (move.value) groups = groups.map((x) => (x.id === move.value ? { ...x, students: [...x.students, id] } : x));
          groups = groups.filter((x) => x.students.length);
          paintGroups();
        });
        item.append(move);
        list.append(item);
      }
      card.append(list);
      return card;
    }));
    draft.hidden = groups.length === 0;
  }

  const groupBtn = button('Ask Ann to group them', 'primary', async () => {
    if (busy) return;
    busy = true;
    groupBtn.disabled = true;
    error.textContent = '';
    try {
      groups = parseGroups(await deps.group(brief), anon.keys);
      paintGroups();
      groupBtn.textContent = 'Group again';
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Try again.';
    } finally {
      busy = false;
      groupBtn.disabled = false;
    }
  });
  groupBtn.classList.add('tut-plan__group-btn');
  const draft = button('Draft tutorial', 'primary', async () => {
    if (busy) return;
    busy = true;
    draft.disabled = true;
    try {
      const id = await deps.start({ unitId: o.unitId, afterLessonId: o.sourceLessonId, classId: o.classId, tag: o.tag, tagLabel: o.tagLabel, groups });
      handle.close();
      o.onDone(id);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Try again.';
      busy = false;
      draft.disabled = false;
    }
  });
  draft.classList.add('tut-plan__draft');
  draft.hidden = true;
  const preview = el('pre', 'ev-plan__brief', brief);
  sheet.append(
    heading,
    el('p', 'mb__empty', `Ann groups ${picked.length} students by why they get ${o.tagLabel} wrong. You can move anyone before she drafts. Only these students will see the tutorial.`),
    el('h4', 'mb-form__label', 'What Ann is told (no names)'),
    preview,
    el('p', 'mb__empty', `Cost: grouping is a few cents; drafting is ${TUTORIAL.cost(Math.max(2, Math.min(5, Math.ceil(picked.length / 3))))}, depending on how many groups.`),
    groupBtn,
    groupsHost,
    error,
    el('div', 'mb-form__actions', ''),
  );
  sheet.lastElementChild!.append(button('Cancel', 'secondary', () => handle.close()), draft);
  const opened = openOverlay(sheet, { labelledBy: heading.id, canClose: () => !busy });
  handle.close = opened.close;
  return sheet;
}
```

The move control is a `<select>`, but the project rule is kit pills, not selects. When there are 5 or fewer groups, swap it for a `hub-pills` row of group names plus "Leave out", and keep the select only as a fallback above 5. That can't happen, because `MAX_GROUPS` is 5. So build pills, following `editor-tabs.ts`.

- [ ] **Step 5: Add the button to the markbook**

In `next-view.ts`, add `planTutorial?: (tag: string, students: string[], evidence: Evidence[]) => void;` to the actions type. In the group card loop (~123), only for `move.kind === 'group'`, after the Ann follow-up buttons:

```ts
    if (move.kind === 'group' && actions.planTutorial) {
      for (const part of move.parts) {
        const plan = el('button', 'btn btn--secondary mb-move__tutorial', move.parts.length > 1 ? `Plan a tutorial: ${label(part.tag)}` : 'Plan a tutorial');
        plan.type = 'button';
        plan.addEventListener('click', () => actions.planTutorial?.(part.tag, part.students, evidence));
        tools.append(plan);
      }
    }
```

In `teacher/sections/markbook.ts`, pass `planTutorial: (tag, ids, evidence) => planTutorial(current, context, tag, ids, evidence)` beside `followUp` (~452). Add, beside `followUp` (~483):

```ts
  /** Plan a tutorial for `ids` on `tag`, after the latest shown quiz with evidence on it. */
  function planTutorial(current: MarkbookView, context: InsightContext, tag: string, ids: string[], evidence: Evidence[]): void {
    const lessonId = latestQuizFor(current, tag, evidence);
    const quiz = current.quizzes.find((q) => q.lesson_id === lessonId);
    if (!quiz?.unit_id) {
      status.textContent = 'Tutorials start from a quiz in a unit.';
      return;
    }
    const listed = new Set(current.students.map((s) => s.id));
    openTutorialPlan({
      classId: cls.id,
      unitId: quiz.unit_id,
      sourceLessonId: quiz.lesson_id,
      tag,
      tagLabel: tagLabel(tag, context),
      students: current.students,
      chosen: ids.filter((id) => listed.has(id)),
      evidence,
      mistakeText: (why) => mixUpText({ tag, key: '', why, count: 1, students: [] }, (t) => tagLabel(t, context), (id) => codeLabel(id, context.codes)),
      onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
    });
  }
```

`mixUpText` takes a `MixUp`. Check its signature in `evidence/views/parts.ts`. If it needs more than `why`, write a small `whyText(why, label, codeLabel)` there with the same wording and use it in both places.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/tutorial-plan-sheet.test.ts tests/unit/markbook*.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/tutorial/plan-sheet.ts apps/teaching/src/markbook/next-view.ts apps/teaching/src/teacher/sections/markbook.ts apps/teaching/src/evidence/constants.ts apps/teaching/tests/unit/tutorial-plan-sheet.test.ts
git commit -m "Teaching tutorial: Plan a tutorial from the markbook's Small group card"
```

---

## Phase 6: markbook, gate, walk

### Task 21: Markbook shows the group on hover

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (`classInsight` return, `classQuizScores`)
- Modify: `netlify/functions/_shared/markbook.mjs` (`quizColumns`)
- Modify: `apps/teaching/src/markbook/types.ts`, `apps/teaching/src/markbook/grid.ts:62`
- Test: extend `tests/unit/tutorial-quiz.test.js`; extend `apps/teaching/tests/unit/markbook-grid*.test.ts`

- [ ] **Step 1: Write the failing server test**

Add to `tests/unit/tutorial-quiz.test.js`:

```js
test('the markbook column knows each student’s group', async () => {
  const store = await setup();
  store.data.get(draftLessonKey('tut1')).tutorial.groups = [{ id: 'ga', name: 'Re-tells the plot', students: ['st_ann'] }];
  store.data.set(tutorialKeys('tut1').group('ga'), { done_students: ['st_ann'] });
  await quizAction(store, 'tut1', { action: 'claim', ...who(1), initials: 'AB' });
  await quizAction(store, 'tut1', { action: 'start', ...who(1) });
  await quizAction(store, 'tut1', { action: 'submit', ...who(1), responses: { qa1: { selected: ['a'] }, qa2: { selected: ['b'] } } });
  const scores = await classQuizScores(store, 'tut1', 'class1', ['st_ann']);
  assert.deepEqual(scores.groups, { st_ann: 'Re-tells the plot' });
});
```

`setup()` stores the draft with `store.data.set`, and `get` clones it. Mutate the stored object (`store.data.get(...)`) as shown, so the next read sees the change.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/unit/tutorial-quiz.test.js`
Expected: FAIL, `scores.groups` undefined.

- [ ] **Step 3: Carry the groups through**

In `classInsight`'s return add:

```js
    tutorial_groups: draft.pedagogical_mode === 'tutorial'
      ? Object.fromEntries((draft.tutorial?.groups ?? []).flatMap((g) => g.students.map((s) => [s, g.name])))
      : null,
```

In `classQuizScores`'s return add `...(insight.tutorial_groups ? { groups: insight.tutorial_groups } : {})`. In `markbook.mjs` `quizColumns`, add `...(q.groups ? { groups: q.groups } : {})` to each column.

In `types.ts` `QuizColumn`, add `/** Tutorial exit checks: each student's group name. */ groups?: Record<string, string>;`. In `grid.ts` `cellButton`'s quiz branch, add the group to the label: `const group = column.groups?.[sid]; …` and append `` group ? ` · ${group}` : '' `` to the aria label, and set `b.title = group` when present.

- [ ] **Step 4: Add a grid test**

In the existing markbook grid test file, add a case: a quiz column with `groups: { st_ann: 'Re-tells the plot' }` gives Ann's cell `title` `'Re-tells the plot'`.

- [ ] **Step 5: Run tests**

Run: `node --test tests/unit/tutorial-quiz.test.js tests/unit/markbook*.test.js && cd apps/teaching && npx vitest run tests/unit/markbook-grid*.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs netlify/functions/_shared/markbook.mjs apps/teaching/src/markbook/types.ts apps/teaching/src/markbook/grid.ts tests/unit/tutorial-quiz.test.js apps/teaching/tests/unit
git commit -m "Teaching tutorial: markbook cells show the student's group"
```

### Task 22: Full gate, fixture and walk

**Files:**
- Modify: `apps/teaching/fixtures/seed.json` (an invented class of 16, a quiz with evidence, so Plan a tutorial shows)
- Possibly modify: anything the gate or the walk turns up

- [ ] **Step 1: Regenerate everything and run the full gate**

Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && node scripts/generate-teaching-ai-runtime.mjs && npm run pre-pr-check`
Expected: exit 0. Fix anything it reports, then rerun it.

- [ ] **Step 2: Seed a walkable class**

In `apps/teaching/fixtures/seed.json`, add an invented class "7Z Demo" with 16 students. Use invented names only (Ann Bell, Cy Dale, Ed Fox, Gus Hale, …). Add a published quiz with first attempts where 8 students miss cyclical structure, so Next steps shows a Small group card. Follow the shape of the existing seeded quiz and class.

- [ ] **Step 3: Walk in the local preview, desktop then 390px**

Start the preview. A worktree needs the temporary `launch.json` entry with absolute `--prefix` paths, then restore it (see the quiz-insights memory). Then:
1. Markbook → Next steps → Small group card → **Plan a tutorial**. Confirm no names in "What Ann is told". **Ask Ann to group them** (mock reply), move one student, **Draft tutorial**.
2. The new lesson opens with the board and tabs. Switch tabs (Common, each group, All). Fill one faded example and one exit question by hand (the mock doesn't run Ann), then publish.
3. Open the student link `?class=` in a second tab, claim "AB" and play Common. In the group tab, write and check a faded step, and choose Not quite (the side path plays). Reach "Your teacher will join you here".
4. Teacher: the group card says Waiting for you → Sit with group → the answer appears on the live board → Show to group (the student tab shows it, with no name) → Done with this group.
5. Student: You do → exit check → hand in.
6. Markbook: one column for the tutorial, and the cell's title shows the group.
7. Repeat steps 3–4 at 390px. Cards stack, and the live board shows one student per row.

Note anything off, fix it, and re-walk that step.

- [ ] **Step 4: Commit the fixture and walk fixes**

```bash
git add apps/teaching/fixtures/seed.json
git commit -m "Teaching tutorial: walkable demo class in the fixture"
```

- [ ] **Step 5: Open the PR**

Push `claude/tutorial-mode`. Open the PR ready (not draft), with the spec, the "Changes from the spec" list and the walk notes in the description. Enable auto-merge (merge commit). Not covered and must be named: the live Ann grouping and drafting run (needs Adam's go and shows its cost first), and Safari narration.

---

## Self-review notes

- **Spec coverage:** Structure, Common/tabs/exits (Tasks 1–3, 6). Gradual release, faded examples and contrast pairs (Tasks 7–8, 19 recipe). Ann grouping with evidence quotes and adjusting (Tasks 17–18, 20). Drafting and Draft again (Task 19; Draft again = the teacher asks Ann on that section from the AI panel, or presses Plan again). Board, Sit with group, live board, Show to group, Done and statuses (Tasks 14–16). Multi-day progress (device progress plus the server group state, Tasks 9, 11, 13). Absent students and unlocking one (Task 14 `unlock`, the board's tick boxes). Wrong group (Task 14 `move`; the board doesn't yet have a Move control, so the editor's grouping lives in the plan sheet; add a Move menu on the live board row when walking if it's needed). Markbook column and hover (Tasks 5, 21). Map label moved to the board header (Change 8). Phone layout (Tasks 13, 15 CSS; walk in Task 22).
- **Known follow-up named in the spec as out of scope:** no auto re-grouping, no multi-group students, no peer features.
