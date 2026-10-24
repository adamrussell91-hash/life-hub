# Design Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Teaching lesson of type Design Sprint takes groups through five deadline-driven phases (Understand, Sketch, Decide, Prototype, Test). Class phases alternate with home phases, there is a class lock, and votes are anonymous and made against criteria. Students upload prototypes and pitch them live with class feedback. Every phase is scaffolded by the setup Kit and Thinking Toolkit moves. Prototype and Reflection marks land in the markbook as outcome evidence.

**Architecture:** The draft lesson carries `lesson.sprint` (settings) and one top-level section per phase marked `sprint_phase` (that phase's guides). Top-level blocks outside those sections are the challenge brief.

On publish the whole student-safe body goes in the public snapshot, with a public `sprint` subset (no groups, no outcomes). The server-only `sprint/{lesson}/config` holds the groups, deadlines and rules.

Pure rules live in `apps/teaching/src/sprint/rules.ts`: Sydney deadlines, the phase-open rule, the class lock, the vote tally and the heat map. They are bundled to the server like `quiz/core.ts`, so the browser and the server decide the same way.

A new `sprint.mjs` stores submissions, group records, the lock, feedback rounds and files. The teacher map and the student player poll it.

Marks are saved as two markbook **assessment columns**, so evidence, Patterns and Next steps pick them up with no new code.

**Tech Stack:** TypeScript, plain DOM, Zod 3, Vitest + happy-dom (`apps/teaching`), Node `node:test` (root `tests/unit`), Netlify Functions + Blobs. No AI calls.

**Spec:** `docs/superpowers/specs/2026-10-24-design-sprint-design.md`
**Mockups:** `docs/superpowers/specs/design-sprint-screens/`

---

## Changes from the spec (found while mapping the code)

1. **Marks are two markbook assessment columns**, "{title}: Prototype" and "{title}: Reflection". Each sprint criterion becomes a column criterion worth 3 marks (Starting 1, Showing 2, Strong 3), with its linked outcome. `markbookEvidence` already turns assessment criteria into outcome evidence (`apps/teaching/src/evidence/markbook-evidence.ts`), so evidence, Patterns and Next steps need no changes. The spec described one column with two figures; two columns reuse everything that already exists.
2. **The pitch runs in a Pitch view of its own**, opened from the progress map. It looks like Focus view but sits outside the Focus controller, because that controller steps through blocks and a pitch steps through groups.
3. **Student uploads are capped at 5 MB, in one request.** Netlify drops bodies over 6 MB, and the chunked-parts path in `media-upload.mjs` is teacher-only. Allowed: PDF, PNG, JPEG, WEBP, or a link. A PowerPoint exports to PDF.
4. **One class per sprint** (`sprint.class_id`), as with tutorials. The groups are that class's students.
5. **No progress label on the unit map dot.** Map dots are drawn from lesson data with no per-lesson server reads (the same call as tutorial-mode change 8). Progress shows on the sprint's own progress map.
6. **Files and feedback are fetched by POST**, so class tokens never go in a URL.
7. **Spotlight shows as a banner on students' sprint screens.** The class sees it on their devices, or the teacher can show it in the Pitch view.
8. **"The three ideas differ" is checked lightly.** Three ideas must have different titles and different idea text. Deeper difference is prompted by the Breadth value check, which needs a one-line answer.
9. **A phase's "class part" ends on a set date and time** (`ends_at`, `YYYY-MM-DDTHH:MM`, Sydney time), or when the teacher presses End class part.

---

## File structure

**New: `apps/teaching/src/sprint/`**
| File | One job |
|---|---|
| `schema.ts` | Zod: settings, phases, criteria, requirements, idea guide, groups, payloads, public subset (generated to the server) |
| `rules.ts` | Pure: Sydney deadlines, phase open rule, class lock, late, vote tally, heat levels (generated to the server) |
| `defaults.ts` | Default Kit: checklist, model idea, frames, reflection prompts, per-phase Thinking moves, new sprint settings and phase sections |
| `checks.ts` | Pure: "check before you submit" nudges for each phase |
| `model.ts` | Pure: split the draft into brief and phase sections; publish issues; the public `sprint` subset |
| `api.ts` | Student and teacher calls; types for every response |
| `kit-editor.ts` | Teacher Kit: settings, criteria (with outcomes), requirements, idea guide, phases and deadlines, groups |
| `editor-tabs.ts` | Teacher canvas tabs: Brief / each phase |
| `player.ts` | Student shell: claim, countdown, stepper, lock screen, guides panel, intentions, spotlight, phase dispatch |
| `phase-understand.ts`, `phase-sketch.ts`, `phase-decide.ts`, `phase-prototype.ts`, `phase-test.ts` | One student phase form each |
| `map.ts` | Teacher progress map: grid, phone cards, badges, End class part, extend, unlock |
| `group-board.ts` | Teacher group board: notes, gallery with authors, heat, confirm, parts, uploads, spotlight |
| `marking.ts` | Marking panel and the markbook columns |
| `pitch-view.ts` | Pitch view: pitch file, 2-minute timer, feedback round controls, running order |
| `sprint.css` | All sprint styles |

**New: server**
- `netlify/functions/_shared/sprint-keys.mjs`: blob keys
- `netlify/functions/_shared/sprint.mjs`: publish config, student actions, teacher actions, rounds
- `netlify/functions/_shared/sprint-files.mjs`: student upload and file reads
- `netlify/functions/published-sprint.mjs` (`POST /api/published/sprint/:id`)
- `netlify/functions/published-sprint-file.mjs` (`POST /api/published/sprint-file/:id`)
- `netlify/functions/sprint.mjs` (`POST /api/lessons/:id/sprint`, operator)
- `netlify/functions/sprint-file.mjs` (`POST /api/lessons/:id/sprint-file`, operator)
- Generated: `netlify/functions/_shared/sprint-schema.mjs`, `netlify/functions/_shared/sprint-rules.mjs`

**Modified**
- `apps/teaching/src/schemas/block.ts`: `sprint_phase` on sections
- `apps/teaching/src/schemas/lesson.ts`: `sprint` field; publish checks
- `apps/teaching/src/schemas/published-lesson.ts`: `design_sprint` mode, `sprint` subset
- `apps/teaching/src/student/lesson-view.ts`: sprint route
- `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`: Kit, tabs, map
- `netlify/functions/lesson-publish.mjs`: sprint branch
- `netlify/functions/_shared/public-student-routes.mjs`: two public routes
- `scripts/generate-alchemy-schema.mjs`: two bundles
- `apps/teaching/scripts/mock-api.ts`: four handlers

**Commands used throughout**
- Teaching unit test: `cd apps/teaching && npx vitest run tests/unit/<file>`
- Teaching typecheck: `cd apps/teaching && npx tsc --noEmit`
- Server test: `node --test tests/unit/<file>` (from the repo root)
- Regenerate: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && node scripts/generate-teaching-ai-runtime.mjs`
- Gate before the PR: `npm run pre-pr-check`

**Privacy rule for every task:** fixtures and tests use invented names only (Ann Bell, Cy Dale, Ed Fox, Gus Hale, Ivy Jones, Kai Lee). No real student or class names anywhere in this repo.

**Wording rule for every student-facing string:** say what students do and can do. No "without", "not", "never" or "rather than" in feedback or prompts. The UI states that "aren't on your class list" style system messages may keep are errors only.

---

## Phase 1: data, rules and publish

### Task 1: Sprint schema, section marker and lesson field

**Files:**
- Create: `apps/teaching/src/sprint/schema.ts`
- Modify: `apps/teaching/src/schemas/block.ts` (section content, beside `tutorial_group` ~1877)
- Modify: `apps/teaching/src/schemas/lesson.ts` (after `tutorial:` ~60)
- Modify: `apps/teaching/src/schemas/published-lesson.ts` (~21)
- Modify: `scripts/generate-alchemy-schema.mjs` (add a bundle after the tutorial one ~52)
- Test: `apps/teaching/tests/unit/sprint-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-schema.test.ts
import { describe, it, expect } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { PublishedLessonSchema } from '@/schemas/published-lesson';
import { SketchPayloadSchema, SprintSettingsSchema, SPRINT_PHASES } from '@/sprint/schema';

const phase = (key: string, where: 'class' | 'home') => ({ key, where, due_date: '2026-10-28', due_time: '15:00' });
export const settings = () => ({
  class_id: 'class1',
  criteria: [{ id: 'c1', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Explains why it matters' }],
  idea_guide: { checklist: ['It answers our group question.'], model: { topic: 'The Great Wall', text: 'What if…', notes: [] } },
  phases: [phase('understand', 'class'), phase('sketch', 'home'), phase('decide', 'class'), phase('prototype', 'home'), phase('test', 'class')],
  groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }]
});

describe('sprint schema', () => {
  it('fills defaults: teacher decides, standard support, 2 hour lock', () => {
    const s = SprintSettingsSchema.parse(settings());
    expect(s.decider).toBe('teacher');
    expect(s.support).toBe('standard');
    expect(s.lock_hours).toBe(2);
    expect(s.requirements).toEqual([]);
    expect(s.phases[1]!.ends_at).toBe('');
  });

  it('needs exactly five phases in order', () => {
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: settings().phases.slice(0, 4) })).toThrow();
    const swapped = settings().phases;
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: swapped })).toThrow(/order/);
    expect(SPRINT_PHASES).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
  });

  it('caps the lock at 24 hours and ideas at 5', () => {
    expect(() => SprintSettingsSchema.parse({ ...settings(), lock_hours: 25 })).toThrow();
    const p = settings().phases;
    p[1] = { ...p[1]!, ideas: 6 } as typeof p[1];
    expect(() => SprintSettingsSchema.parse({ ...settings(), phases: p })).toThrow();
  });

  it('keeps sprint_phase on a section and sprint on a lesson', () => {
    const s = BlockSchema.parse({ id: 's1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'Sketch', blocks: [], sprint_phase: 'sketch' } });
    expect(s.block_type === 'section' && s.content.sprint_phase).toBe('sketch');
    const lesson = LessonSchema.parse({
      id: 'l1', type: 'lesson', title: 'Pompeii', unit_id: 'u1', sequence: 0, blocks: [],
      created_at: '2026-10-24T00:00:00.000Z', updated_at: '2026-10-24T00:00:00.000Z',
      pedagogical_mode: 'design_sprint', sprint: settings()
    });
    expect(lesson.sprint?.groups[0]!.name).toBe('Kestrel');
  });

  it('lets a published lesson carry design_sprint and its public subset', () => {
    const p = PublishedLessonSchema.parse({
      lesson_id: 'l1', title: 'Pompeii', unit_id: 'u1', blocks: [], published_at: '2026-10-24T00:00:00.000Z', schema_version: 1,
      pedagogical_mode: 'design_sprint',
      sprint: { support: 'guided', lock_hours: 2, criteria: [{ id: 'c1', text: 'Uses sources' }], reflection_criteria: [], reflection_prompts: [], requirements: [], idea_guide: settings().idea_guide, phases: settings().phases.map((x) => ({ ...x, ends_at: '', instruction: '', stretch: '' })) }
    });
    expect(p.sprint?.support).toBe('guided');
  });

  it('caps sketch cards at five and trims text', () => {
    const card = { id: 'k1', title: '  Ash  ', idea: 'x', answers: 'y', evidence: 'z', criteria: {}, requirements: {}, value_answer: '' };
    expect(SketchPayloadSchema.parse({ cards: [card], strongest: 'k1', strongest_why: '' }).cards[0]!.title).toBe('Ash');
    expect(() => SketchPayloadSchema.parse({ cards: Array.from({ length: 6 }, (_, i) => ({ ...card, id: `k${i}` })), strongest: '', strongest_why: '' })).toThrow();
  });
});
```

If `LessonSchema` or `PublishedLessonSchema` needs more fields, copy the minimal valid objects from `apps/teaching/tests/unit/tutorial-schema.test.ts` and add the sprint fields.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-schema.test.ts`
Expected: FAIL, cannot resolve `@/sprint/schema`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/schema.ts`**

```ts
import { z } from 'zod';

/**
 * A Design Sprint: settings on the draft lesson (`lesson.sprint`), the public
 * subset students get with the published lesson, and what students send for
 * each phase. Generated to netlify/functions/_shared/sprint-schema.mjs so the
 * server validates with the same rules. Imports nothing from the app.
 */

export const SPRINT_PHASES = ['understand', 'sketch', 'decide', 'prototype', 'test'] as const;
export type SprintPhaseKey = (typeof SPRINT_PHASES)[number];
export const SprintPhaseKeySchema = z.enum(SPRINT_PHASES);

export const PHASE_LABELS: Record<SprintPhaseKey, string> = {
  understand: 'Understand',
  sketch: 'Sketch',
  decide: 'Decide',
  prototype: 'Prototype',
  test: 'Test'
};

/** Starting · Showing · Strong, stored as 1 · 2 · 3. */
export const LEVEL_LABELS = ['Starting', 'Showing', 'Strong'] as const;
export const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Level = z.infer<typeof LevelSchema>;

export const SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 } as const;

export const SprintIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const Day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
const Time = z.string().regex(/^(\d{2}:\d{2})?$/);
const text = (max: number) => z.string().trim().max(max);

export const SprintCriterionSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z.string().min(1).max(64).optional()
});
export type SprintCriterion = z.infer<typeof SprintCriterionSchema>;

export const SprintRequirementSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  phases: z.array(SprintPhaseKeySchema).max(5).default(['sketch', 'prototype'])
});
export type SprintRequirement = z.infer<typeof SprintRequirementSchema>;

export const IdeaGuideSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  model: z.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z.array(text(120)).max(6).default([])
  }),
  pair: z.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
export type IdeaGuide = z.infer<typeof IdeaGuideSchema>;

export const SprintPhaseSchema = z.object({
  key: SprintPhaseKeySchema,
  where: z.enum(['class', 'home']),
  due_date: Day.default(''),
  due_time: Time.default('15:00'),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(''),
  instruction: text(600).default(''),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default('')
});
export type SprintPhase = z.infer<typeof SprintPhaseSchema>;

export const SprintGroupSchema = z.object({
  id: SprintIdSchema,
  name: z.string().trim().min(1).max(40),
  students: z.array(z.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
export type SprintGroup = z.infer<typeof SprintGroupSchema>;

const phasesInOrder = (phases: readonly { key: string }[]) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);

export const SprintSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  decider: z.enum(['top_vote', 'teacher']).default('teacher'),
  support: z.enum(['guided', 'standard', 'open']).default('standard'),
  lock_hours: z.number().int().min(0).max(24).default(2),
  criteria: z.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z.array(text(200)).max(2).default([]),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5).refine(phasesInOrder, 'Phases must be in order: Understand, Sketch, Decide, Prototype, Test.'),
  groups: z.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z.object({ prototype: z.string().optional(), reflection: z.string().optional() }).default({})
});
export type SprintSettings = z.infer<typeof SprintSettingsSchema>;

/** What students get with the published lesson: no class, groups, outcomes or columns. */
export const PublicSprintSchema = z.object({
  support: z.enum(['guided', 'standard', 'open']),
  lock_hours: z.number().int().min(0).max(24),
  criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z.array(z.string().max(200)).max(2),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5)
});
export type PublicSprint = z.infer<typeof PublicSprintSchema>;

// ---------------------------------------------------------------- payloads

const where = text(200);
const Wheres = z.record(z.string().max(40), where).default({});

export const UnderstandPayloadSchema = z.object({
  notes: z.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's notes) this student starred. */
  star: z.string().max(40).default(''),
  stretch: text(300).default('')
});
export const SketchCardSchema = z.object({
  id: SprintIdSchema,
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default('')
});
export type SketchCard = z.infer<typeof SketchCardSchema>;
export const SketchPayloadSchema = z.object({
  cards: z.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z.string().max(40).default(''),
  strongest_why: text(300).default('')
});
export const DecidePayloadSchema = z.object({
  /** Criterion id → idea id. */
  votes: z.record(z.string().max(40), z.string().max(40)).default({}),
  reasons: z.record(z.string().max(40), text(300)).default({}),
  opened: z.array(z.string().max(40)).max(40).default([]),
  stretch: text(300).default('')
});
export const PrototypePayloadSchema = z.object({
  text: text(4000).default(''),
  link: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, 'Links start with https://').default(''),
  files: z.array(z.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z.record(z.string().max(40), LevelSchema).default({}),
  self_why: z.record(z.string().max(40), text(300)).default({}),
  value_answer: text(300).default('')
});
export const TestPayloadSchema = z.object({
  reflection: z.array(text(1000)).max(2).default([]),
  quote: text(300).default(''),
  change_criterion: z.string().max(40).default(''),
  value_answer: text(300).default('')
});
export const PAYLOAD_SCHEMAS = {
  understand: UnderstandPayloadSchema,
  sketch: SketchPayloadSchema,
  decide: DecidePayloadSchema,
  prototype: PrototypePayloadSchema,
  test: TestPayloadSchema
} as const;
export type PhasePayload = {
  understand: z.infer<typeof UnderstandPayloadSchema>;
  sketch: z.infer<typeof SketchPayloadSchema>;
  decide: z.infer<typeof DecidePayloadSchema>;
  prototype: z.infer<typeof PrototypePayloadSchema>;
  test: z.infer<typeof TestPayloadSchema>;
};

export const PartSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(80),
  shows: text(200).default(''),
  criterion: z.string().max(40).default('')
});
export type Part = z.infer<typeof PartSchema>;
export const PartsSchema = z.array(PartSchema).max(SPRINT_LIMITS.parts);

export const FeedbackEntrySchema = z.object({
  levels: z.record(z.string().max(40), LevelSchema).default({}),
  worked: text(300).default(''),
  next: text(300).default(''),
  /** The criterion the written lines are about. */
  about: z.string().max(40).default('')
});
export type FeedbackEntry = z.infer<typeof FeedbackEntrySchema>;
```

- [ ] **Step 4: Add the section marker, the lesson field and the published mode**

In `apps/teaching/src/schemas/block.ts`, add the import beside the tutorial import at the top:

```ts
import { SprintPhaseKeySchema } from '../sprint/schema';
```

and in the section content object, right after `tutorial_exit: z.boolean().optional()` (add a comma after it):

```ts
    /** Design Sprint: this top-level section holds the guides for one phase. */
    sprint_phase: SprintPhaseKeySchema.optional()
```

In `apps/teaching/src/schemas/lesson.ts`, import and add the field after `tutorial: TutorialSettingsSchema.optional(),`:

```ts
import { SprintSettingsSchema } from '../sprint/schema';
// …
  /** Design Sprint lessons only: Kit, phases and groups. */
  sprint: SprintSettingsSchema.optional(),
```

In `apps/teaching/src/schemas/published-lesson.ts`, widen the mode and add the subset:

```ts
import { PublicSprintSchema } from '../sprint/schema';
// …
  pedagogical_mode: z.enum(['quiz', 'lecture', 'tutorial', 'design_sprint']).optional(),
  sprint: PublicSprintSchema.optional(),
```

- [ ] **Step 5: Bundle the schema for the server**

In `scripts/generate-alchemy-schema.mjs`, copy the tutorial bundle entry (the one with `entryPoints: ['apps/teaching/src/tutorial/schema.ts']`) and change it to:

```js
  {
    entryPoints: ['apps/teaching/src/sprint/schema.ts'],
    outfile: 'netlify/functions/_shared/sprint-schema.mjs',
    banner: { js: '// Generated from apps/teaching/src/sprint/schema.ts; regenerate with scripts/generate-alchemy-schema.mjs.' }
  },
```

Keep every other option the tutorial entry has (bundle, format, platform, external zod).

- [ ] **Step 6: Run the test, the typecheck and the generator**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-schema.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.
Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && node scripts/generate-teaching-ai-runtime.mjs && git status --short`
Expected: `netlify/functions/_shared/sprint-schema.mjs` is new; `teaching-block-schema.mjs` changes (the section marker), and `teaching-ai-runtime.mjs` may change too. Stage whatever the generators changed.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/sprint/schema.ts apps/teaching/src/schemas apps/teaching/tests/unit/sprint-schema.test.ts scripts/generate-alchemy-schema.mjs netlify/functions/_shared/
git add -u packages/block-styles
git commit -m "Teaching sprint: schema, section marker and lesson field"
```

---

### Task 2: Pure rules (deadlines, phase open, lock, tally)

**Files:**
- Create: `apps/teaching/src/sprint/rules.ts`
- Modify: `scripts/generate-alchemy-schema.mjs` (one more bundle)
- Test: `apps/teaching/tests/unit/sprint-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-rules.test.ts
import { describe, it, expect } from 'vitest';
import { sydneyEpoch, phaseDue, openPhases, lockState, isLate, tally, heatLevels, type GroupFacts } from '@/sprint/rules';

const at = (iso: string) => new Date(iso).getTime();
const phases = [
  { key: 'understand', due_date: '2026-10-21', due_time: '15:00' },
  { key: 'sketch', due_date: '2026-10-24', due_time: '09:00' },
  { key: 'decide', due_date: '2026-10-28', due_time: '15:00' },
  { key: 'prototype', due_date: '2026-11-03', due_time: '09:00' },
  { key: 'test', due_date: '2026-11-06', due_time: '15:00' }
] as const;
const facts = (over: Partial<GroupFacts> = {}): GroupFacts => ({ size: 4, submitted: {}, ended: {}, lock: null, ...over });

describe('sprint rules', () => {
  it('reads a Sydney date and time, summer time included', () => {
    expect(sydneyEpoch('2026-10-24', '09:00')).toBe(at('2026-10-23T22:00:00Z')); // AEDT, UTC+11
    expect(sydneyEpoch('2026-06-10', '09:00')).toBe(at('2026-06-09T23:00:00Z')); // AEST, UTC+10
    expect(sydneyEpoch('', '09:00')).toBeNull();
    expect(phaseDue({ due_date: '2026-10-24', due_time: '' })).toBe(sydneyEpoch('2026-10-24', '23:59'));
  });

  it('opens Understand at once and the next phase at the deadline', () => {
    expect(openPhases(phases, facts(), at('2026-10-20T00:00:00Z'))).toEqual(['understand']);
    expect(openPhases(phases, facts(), at('2026-10-21T05:00:00Z'))).toEqual(['understand', 'sketch']);
  });

  it('opens the next phase early when the whole group is in', () => {
    const f = facts({ submitted: { understand: 4 } });
    expect(openPhases(phases, f, at('2026-10-20T00:00:00Z'))).toEqual(['understand', 'sketch']);
    expect(openPhases(phases, facts({ submitted: { understand: 3 } }), at('2026-10-20T00:00:00Z'))).toEqual(['understand']);
  });

  it('opens the next phase when the class part ends, but only once the lock lifts', () => {
    const ended = { understand: { at: '2026-10-20T03:00:00.000Z', present: ['st_ann'] } };
    const lock = { phase: 'understand' as const, until: '2026-10-20T05:00:00.000Z', unlocked: [] };
    expect(openPhases(phases, facts({ ended, lock }), at('2026-10-20T04:00:00Z'))).toEqual(['understand']);
    expect(openPhases(phases, facts({ ended, lock }), at('2026-10-20T05:00:01Z'))).toEqual(['understand', 'sketch']);
  });

  it('locks everyone but unlocked students until the lock lifts', () => {
    const lock = { phase: 'decide' as const, until: '2026-10-28T05:00:00.000Z', unlocked: ['st_cy'] };
    expect(lockState(lock, 'st_ann', at('2026-10-28T04:00:00Z'))).toEqual({ locked: true, until: '2026-10-28T05:00:00.000Z' });
    expect(lockState(lock, 'st_cy', at('2026-10-28T04:00:00Z'))).toEqual({ locked: false, until: null });
    expect(lockState(lock, 'st_ann', at('2026-10-28T06:00:00Z'))).toEqual({ locked: false, until: null });
    expect(lockState(null, 'st_ann', 0)).toEqual({ locked: false, until: null });
  });

  it('marks late work', () => {
    expect(isLate(phases[1], '2026-10-23T21:59:00.000Z')).toBe(false);
    expect(isLate(phases[1], '2026-10-23T22:01:00.000Z')).toBe(true);
    expect(isLate({ due_date: '', due_time: '' }, '2030-01-01T00:00:00.000Z')).toBe(false);
  });

  it('tallies criterion votes, finds the top idea and spots a tie', () => {
    const votes = [{ c1: 'A', c2: 'B' }, { c1: 'A', c2: 'A' }, { c1: 'C', c2: 'B' }];
    const t = tally(votes, ['c1', 'c2'], ['A', 'B', 'C', 'D']);
    expect(t.totals).toEqual({ A: 3, B: 2, C: 1, D: 0 });
    expect(t.top).toBe('A');
    expect(t.tie).toBe(false);
    const tied = tally([{ c1: 'A' }, { c1: 'B' }], ['c1'], ['A', 'B']);
    expect(tied).toMatchObject({ top: null, tie: true });
    expect(tally([], ['c1'], ['A']).top).toBeNull();
  });

  it('turns counts into heat levels 0–3 for each criterion', () => {
    const t = tally([{ c1: 'A' }, { c1: 'A' }, { c1: 'A' }, { c1: 'B' }], ['c1'], ['A', 'B', 'C']);
    expect(heatLevels(t.counts, ['c1'])).toEqual({ A: { c1: 3 }, B: { c1: 1 }, C: { c1: 0 } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-rules.test.ts`
Expected: FAIL, cannot resolve `@/sprint/rules`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/rules.ts`**

```ts
import { SPRINT_PHASES, type SprintPhaseKey } from './schema';

/**
 * The rules both the browser and the server use, so a phase opens, locks and
 * is late the same way on each side. Generated to
 * netlify/functions/_shared/sprint-rules.mjs. Pure: pass `now` in.
 */

const SYDNEY = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

/** Sydney wall time minus UTC at this instant, in ms. */
function sydneyOffset(epoch: number): number {
  const parts = SYDNEY.formatToParts(new Date(epoch));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(epoch / 60000) * 60000;
}

/** "2026-10-24" + "09:00" in Sydney → epoch ms, or null when the date is empty. */
export function sydneyEpoch(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /^(\d{2}):(\d{2})$/.exec(time) ?? ['', '23', '59'];
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let epoch = wall - sydneyOffset(wall);
  epoch = wall - sydneyOffset(epoch);
  return epoch;
}

/** A phase's deadline; no time means the end of that day. */
export function phaseDue(phase: { due_date: string; due_time: string }): number | null {
  return sydneyEpoch(phase.due_date, phase.due_time || '23:59');
}

/** "2026-10-28T15:00" → epoch, or null. */
export function endsAtEpoch(endsAt: string): number | null {
  const [date, time] = endsAt.split('T');
  return date && time ? sydneyEpoch(date, time) : null;
}

export type LockRecord = { phase: SprintPhaseKey; until: string; unlocked: string[] };
export type EndedRecord = Partial<Record<SprintPhaseKey, { at: string; present: string[] }>>;

/** What a group has done that opens phases: how many submitted each phase, which class parts ended, the lock. */
export type GroupFacts = {
  size: number;
  submitted: Partial<Record<SprintPhaseKey, number>>;
  ended: EndedRecord;
  lock: LockRecord | null;
};

/**
 * The phases open for a group at `now`, in order. Understand is always open.
 * Each next phase opens when the one before it is due, or everyone in the
 * group has submitted it, or its class part has ended. While the class lock
 * that followed the previous phase runs, the next phase stays shut.
 */
export function openPhases(
  phases: ReadonlyArray<{ key: string; due_date: string; due_time: string }>,
  facts: GroupFacts,
  now: number
): SprintPhaseKey[] {
  const open: SprintPhaseKey[] = ['understand'];
  for (let i = 1; i < SPRINT_PHASES.length; i += 1) {
    const prev = SPRINT_PHASES[i - 1]!;
    const due = phaseDue(phases[i - 1]!);
    const allIn = facts.size > 0 && (facts.submitted[prev] ?? 0) >= facts.size;
    const triggered = (due !== null && due <= now) || allIn || !!facts.ended[prev];
    const held = facts.lock?.phase === prev && Date.parse(facts.lock.until) > now;
    if (!triggered || held) break;
    open.push(SPRINT_PHASES[i]!);
  }
  return open;
}

/** Whether this student is held by the class lock right now. */
export function lockState(lock: LockRecord | null, studentId: string, now: number): { locked: boolean; until: string | null } {
  if (!lock || lock.unlocked.includes(studentId) || Date.parse(lock.until) <= now) return { locked: false, until: null };
  return { locked: true, until: lock.until };
}

/** Class work is frozen for a student who was there when the class part ended. */
export function isFrozen(ended: EndedRecord, phase: SprintPhaseKey, studentId: string): boolean {
  return !!ended[phase]?.present.includes(studentId);
}

export function isLate(phase: { due_date: string; due_time: string }, submittedAt: string): boolean {
  const due = phaseDue(phase);
  return due !== null && Date.parse(submittedAt) > due;
}

export type Tally = {
  counts: Record<string, Record<string, number>>;
  totals: Record<string, number>;
  /** The idea with the most votes, or null when nobody voted or two ideas tie. */
  top: string | null;
  tie: boolean;
};

/** Each ballot gives one vote per criterion: { criterionId: ideaId }. Votes for unknown ideas are ignored. */
export function tally(ballots: ReadonlyArray<Record<string, string>>, criteria: readonly string[], ideas: readonly string[]): Tally {
  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  for (const idea of ideas) {
    counts[idea] = Object.fromEntries(criteria.map((c) => [c, 0]));
    totals[idea] = 0;
  }
  for (const ballot of ballots) {
    for (const c of criteria) {
      const idea = ballot[c];
      if (idea && counts[idea]) {
        counts[idea]![c]! += 1;
        totals[idea]! += 1;
      }
    }
  }
  const best = Math.max(0, ...Object.values(totals));
  const leaders = Object.keys(totals).filter((idea) => totals[idea] === best);
  const tie = best > 0 && leaders.length > 1;
  return { counts, totals, top: best > 0 && !tie ? leaders[0]! : null, tie };
}

/** 0 for no votes; otherwise 1–3 against the most any idea got on that criterion. */
export function heatLevels(counts: Tally['counts'], criteria: readonly string[]): Record<string, Record<string, 0 | 1 | 2 | 3>> {
  const out: Record<string, Record<string, 0 | 1 | 2 | 3>> = {};
  for (const c of criteria) {
    const max = Math.max(0, ...Object.values(counts).map((row) => row[c] ?? 0));
    for (const [idea, row] of Object.entries(counts)) {
      const n = row[c] ?? 0;
      (out[idea] ??= {})[c] = n === 0 || max === 0 ? 0 : (Math.max(1, Math.ceil((3 * n) / max)) as 1 | 2 | 3);
    }
  }
  return out;
}
```

- [ ] **Step 4: Bundle the rules for the server**

In `scripts/generate-alchemy-schema.mjs`, add one more entry after the sprint schema entry from Task 1:

```js
  {
    entryPoints: ['apps/teaching/src/sprint/rules.ts'],
    outfile: 'netlify/functions/_shared/sprint-rules.mjs',
    banner: { js: '// Generated from apps/teaching/src/sprint/rules.ts; regenerate with scripts/generate-alchemy-schema.mjs.' }
  },
```

- [ ] **Step 5: Run the test and the generator**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-rules.test.ts`
Expected: PASS (8 tests).
Run: `node scripts/generate-alchemy-schema.mjs && node -e "import('./netlify/functions/_shared/sprint-rules.mjs').then(m => console.log(Object.keys(m).sort().join(',')))"`
Expected: `endsAtEpoch,heatLevels,isFrozen,isLate,lockState,openPhases,phaseDue,sydneyEpoch,tally`

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/sprint/rules.ts apps/teaching/tests/unit/sprint-rules.test.ts scripts/generate-alchemy-schema.mjs netlify/functions/_shared/sprint-rules.mjs
git commit -m "Teaching sprint: deadline, phase, lock and vote rules"
```

---

### Task 3: Default Kit and the check-before-submit rules

**Files:**
- Create: `apps/teaching/src/sprint/defaults.ts`
- Create: `apps/teaching/src/sprint/checks.ts`
- Test: `apps/teaching/tests/unit/sprint-defaults.test.ts`
- Test: `apps/teaching/tests/unit/sprint-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/teaching/tests/unit/sprint-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { newSprintSettings, newSprintBlocks, PHASE_MOVES, phaseIntention, phaseMove, toolFrames } from '@/sprint/defaults';
import { SprintSettingsSchema } from '@/sprint/schema';
import { BlockSchema } from '@/schemas/block';

let n = 0;
const id = () => `b${++n}`;

describe('sprint defaults', () => {
  it('makes valid settings with 3 ideas, the checklist and reflection defaults', () => {
    const s = SprintSettingsSchema.parse(newSprintSettings('class1'));
    expect(s.phases.map((p) => p.where)).toEqual(['class', 'home', 'class', 'home', 'class']);
    expect(s.phases[0]!.ideas).toBe(3);
    expect(s.phases[1]!.ideas).toBe(3);
    expect(s.idea_guide.checklist).toHaveLength(5);
    expect(s.reflection_criteria[0]!.text).toBe('Explains what the test showed and what to change next');
    expect(s.reflection_prompts).toHaveLength(2);
  });

  it('seeds one section per phase, each starting with its Thinking move', () => {
    const blocks = newSprintBlocks(id).map((b) => BlockSchema.parse(b));
    const phases = blocks.filter((b) => b.block_type === 'section' && b.content.sprint_phase).map((b) => b.block_type === 'section' && b.content.sprint_phase);
    expect(phases).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
    const sketch = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'sketch');
    const first = sketch?.block_type === 'section' ? sketch.content.blocks[0] : undefined;
    expect(first?.block_type).toBe('thinking_move');
    expect(first?.block_type === 'thinking_move' && first.content.value).toBe('value:breadth');
    const understand = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'understand');
    expect(understand?.block_type === 'section' && understand.content.blocks.map((b) => b.block_type)).toEqual(['thinking_move', 'question_quadrant']);
  });

  it('reads the move, its intention and the tool frames from a phase section', () => {
    const blocks = newSprintBlocks(id);
    const move = phaseMove(blocks, 'decide');
    expect(move).toMatchObject({ skill: PHASE_MOVES.decide.skill, value: 'value:relevance' });
    expect(phaseIntention(move)).toMatch(/^We will think by applying/);
    expect(toolFrames(phaseMove(blocks, 'sketch'))).toEqual(['What if ___?', 'For example, ___.']);
    expect(phaseMove([], 'decide')).toBeNull();
  });
});
```

```ts
// apps/teaching/tests/unit/sprint-checks.test.ts
import { describe, it, expect } from 'vitest';
import { fullSentence, sketchProblems, voteProblems, partsProblems, prototypeProblems, feedbackProblems, reflectionProblems } from '@/sprint/checks';

const card = (over = {}) => ({
  id: 'k1', title: 'What the ash kept', idea: 'What if the panel showed five objects?', answers: 'Ordinary objects make the town feel close to us.',
  evidence: 'For example, the carbonised loaf in Source B.', criteria: { c1: 'Loaf and graffiti in Sources B and D' }, requirements: { r1: 'Sources B and D' }, value_answer: 'This one is about objects, idea 1 was about people.', ...over
});
const reqs = [{ id: 'r1', text: 'Uses at least two sources', phases: ['sketch' as const] }];

describe('sprint checks', () => {
  it('wants a full sentence', () => {
    expect(fullSentence('bread')).toBe(false);
    expect(fullSentence('The bread shows daily life.')).toBe(true);
  });

  it('checks every idea card and the set', () => {
    const good = { cards: [card(), card({ id: 'k2', title: 'Then and now', idea: 'What if it compared streets?' }), card({ id: 'k3', title: 'Pliny', idea: 'What if it used the letter?' })], strongest: 'k1', strongest_why: 'It names two sources and fits Year 7.' };
    expect(sketchProblems(good, { ideas: 3, requirements: reqs })).toEqual([]);
    const thin = { ...good, cards: [card({ answers: 'bread' }), ...good.cards.slice(1)] };
    expect(sketchProblems(thin, { ideas: 3, requirements: reqs })[0]).toMatch(/Idea 1: Add a little more/);
    expect(sketchProblems({ ...good, cards: good.cards.slice(0, 2) }, { ideas: 3, requirements: reqs })).toContain('Write 3 ideas. You have 2 so far.');
    expect(sketchProblems({ ...good, cards: [card(), card({ id: 'k2' }), card({ id: 'k3', title: 'P', idea: 'What if it used the letter?' })] }, { ideas: 3, requirements: reqs })).toContain('Give each idea its own title and its own idea.');
    expect(sketchProblems({ ...good, cards: [card({ criteria: {} }), ...good.cards.slice(1)] }, { ideas: 3, requirements: reqs })[0]).toMatch(/link it to at least one criterion/);
    expect(sketchProblems({ ...good, cards: [card({ requirements: {} }), ...good.cards.slice(1)] }, { ideas: 3, requirements: reqs })[0]).toMatch(/say where it meets "Uses at least two sources"/);
    expect(sketchProblems({ ...good, strongest: '' }, { ideas: 3, requirements: reqs })).toContain('Pick your strongest idea and say why.');
  });

  it('checks votes: every set opened, a vote and a reason per criterion', () => {
    const crit = [{ id: 'c1', text: 'Uses sources' }];
    expect(voteProblems({ votes: { c1: 'A' }, reasons: { c1: 'It names the loaf and the graffiti.' }, opened: ['s1', 's2'] }, crit, ['s1', 's2'])).toEqual([]);
    expect(voteProblems({ votes: {}, reasons: {}, opened: ['s1'] }, crit, ['s1', 's2'])).toEqual(['Open every set of ideas before you vote.', 'Give "Uses sources" to one idea.']);
    expect(voteProblems({ votes: { c1: 'A' }, reasons: { c1: 'best' }, opened: ['s1', 's2'] }, crit, ['s1', 's2'])).toEqual(['"Uses sources": say why in a full sentence.']);
  });

  it('checks parts link to a criterion', () => {
    expect(partsProblems([{ id: 'p1', text: 'Panel text', shows: 'The baker’s morning', criterion: 'c1' }])).toEqual([]);
    expect(partsProblems([{ id: 'p1', text: 'Panel text', shows: '', criterion: '' }])).toEqual(['"Panel text": pick the criterion it serves.']);
  });

  it('checks the prototype self-check and requirements', () => {
    const crit = [{ id: 'c1', text: 'Uses sources' }];
    const ok = { text: 'Panel text here', link: '', files: [], requirements: { r1: 'Paragraph 2' }, self: { c1: 2 as const }, self_why: { c1: 'It quotes Source B in the first line.' }, value_answer: 'Each date matches the source.' };
    expect(prototypeProblems(ok, crit, reqs.map((r) => ({ ...r, phases: ['prototype' as const] })))).toEqual([]);
    expect(prototypeProblems({ ...ok, text: '', files: [] }, crit, [])).toContain('Add your part: write it, upload a file or add a link.');
    expect(prototypeProblems({ ...ok, self: {} }, crit, [])).toContain('"Uses sources": pick Starting, Showing or Strong and say why.');
  });

  it('checks feedback and the reflection', () => {
    const crit = [{ id: 'c1', text: 'Uses sources' }];
    expect(feedbackProblems({ levels: { c1: 3 }, worked: 'The graffiti made it feel real.', next: 'Try naming the source on the panel.', about: 'c1' }, crit)).toEqual([]);
    expect(feedbackProblems({ levels: {}, worked: '', next: '', about: '' }, crit)).toEqual(['Pick a level for "Uses sources".', 'Say what worked in a full sentence.', 'Give one thing to try next in a full sentence.', 'Pick the criterion your comments are about.']);
    expect(reflectionProblems({ reflection: ['The panel names its sources clearly.', 'We would add a map so visitors see where.'], quote: 'Try naming the source', change_criterion: 'c1', value_answer: 'It matters because visitors need to see where.' })).toEqual([]);
    expect(reflectionProblems({ reflection: [], quote: '', change_criterion: '', value_answer: '' })).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-defaults.test.ts tests/unit/sprint-checks.test.ts`
Expected: FAIL, cannot resolve `@/sprint/defaults` and `@/sprint/checks`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/defaults.ts`**

```ts
import type { Block } from '@/schemas/block';
import { moveContent, moveSentence } from '@/toolkit/content';
import { libraryTool } from '@/toolkit/library';
import { createBlock } from '@/blocks/create-block';
import { SPRINT_PHASES, PHASE_LABELS, type SprintPhaseKey, type SprintSettings } from './schema';

/**
 * The Kit a new sprint starts with, so the teacher edits rather than builds.
 * All thinking language comes from the Thinking Toolkit library.
 */

export const DEFAULT_CHECKLIST = [
  'It answers our group question.',
  'It meets the criteria.',
  'It uses evidence from what we’ve studied, and names the source, text or quote.',
  'Our group could build it before the deadline.',
  'It does something of its own, beyond the model.'
];

export const DEFAULT_MODEL = {
  topic: 'The Great Wall',
  text: 'One brick’s story: what if the panel followed one brick from the kiln to the wall? It makes a huge wall feel human, using the maker’s stamp on a Ming-era brick.',
  notes: ['Answers the question: makes a huge thing feel human', 'Grabs the visitor: one object, one story', 'Names its source: the maker’s stamp']
};

export const HMW_FRAME = { lead: 'How might we', parts: ['[action]', 'for [who]', 'so that [result]?'] };
export const DEFAULT_REFLECTION_CRITERION = 'Explains what the test showed and what to change next';
export const DEFAULT_REFLECTION_PROMPTS = ['What did the feedback show your idea does well?', 'What would you change next, and why?'];

export const SKETCH_STARTERS = { idea: 'Our idea is…', answers: 'It answers our question because…', evidence: 'The evidence it uses is…' };
export const FEEDBACK_STARTERS = { worked: 'It works because…', next: 'Try…' };

/** Each phase's default Thinking move: skill, tools, value (library ids). */
export const PHASE_MOVES: Record<SprintPhaseKey, { skill: string; tools: string[]; value: string }> = {
  understand: { skill: 'skill:examine', tools: ['tool:question'], value: 'value:relevance' },
  sketch: { skill: 'skill:apply', tools: ['tool:suggestion', 'tool:example'], value: 'value:breadth' },
  decide: { skill: 'skill:apply', tools: ['tool:criteria', 'tool:reasons'], value: 'value:relevance' },
  prototype: { skill: 'skill:justify', tools: ['tool:reasons', 'tool:example'], value: 'value:accuracy' },
  test: { skill: 'skill:evaluate', tools: ['tool:reasons', 'tool:suggestion'], value: 'value:clarity' }
};

const WHERE: Record<SprintPhaseKey, 'class' | 'home'> = { understand: 'class', sketch: 'home', decide: 'class', prototype: 'home', test: 'class' };

export function newSprintSettings(classId: string): SprintSettings {
  return {
    class_id: classId,
    decider: 'teacher',
    support: 'standard',
    lock_hours: 2,
    criteria: [],
    reflection_criteria: [{ id: 'reflect', text: DEFAULT_REFLECTION_CRITERION }],
    reflection_prompts: [...DEFAULT_REFLECTION_PROMPTS],
    requirements: [],
    idea_guide: { checklist: [...DEFAULT_CHECKLIST], model: { ...DEFAULT_MODEL, notes: [...DEFAULT_MODEL.notes] } },
    phases: SPRINT_PHASES.map((key) => ({
      key,
      where: WHERE[key],
      due_date: '',
      due_time: '15:00',
      ends_at: '',
      instruction: '',
      stretch: '',
      ...(key === 'understand' || key === 'sketch' ? { ideas: 3 } : {})
    })),
    groups: [],
    columns: {}
  };
}

const section = (id: string, key: SprintPhaseKey, blocks: Block[]): Block =>
  ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: PHASE_LABELS[key], blocks, sprint_phase: key } }) as Block;

/** One section per phase, each starting with its move; Understand adds the Question Quadrant, Test the Thinking reflection. */
export function newSprintBlocks(newId: () => string): Block[] {
  return SPRINT_PHASES.map((key) => {
    const m = PHASE_MOVES[key];
    const moveId = newId();
    const move = { ...createBlock('thinking_move', moveId), content: moveContent(m.skill, m.tools, m.value, moveId) } as Block;
    const extra: Block[] = [];
    if (key === 'understand') extra.push(createBlock('question_quadrant', newId()));
    if (key === 'test') extra.push(createBlock('thinking_reflection', newId()));
    return section(newId(), key, [move, ...extra]);
  });
}

type Move = { skill: string; tools: string[]; value: string };

/** The first Thinking move in a phase's section, or null. */
export function phaseMove(blocks: readonly Block[], key: SprintPhaseKey): Move | null {
  const sec = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === key);
  if (!sec || sec.block_type !== 'section') return null;
  const move = (sec.content.blocks as Block[]).find((b) => b.block_type === 'thinking_move');
  return move && move.block_type === 'thinking_move' ? { skill: move.content.skill, tools: move.content.tools, value: move.content.value } : null;
}

/** "We will think by applying …, judged for breadth." */
export function phaseIntention(move: Move | null): string {
  if (!move) return '';
  const sentence = moveSentence(move.skill, move.tools, move.value).replace(/\.$/, '');
  return `We will think by ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}.`;
}

/** The tools' sentence frames, in the move's order. */
export function toolFrames(move: Move | null): string[] {
  return (move?.tools ?? []).map((id) => libraryTool(id)?.sentence ?? '').filter(Boolean);
}
```

Check `moveSentence('skill:apply', ['tool:criteria', 'tool:reasons'], 'value:relevance')` in a quick REPL-free way by reading `apps/teaching/src/toolkit/content.ts:208`. If its lead is not "Applying", change the test's `/^We will think by applying/` to match its real lead word and note it in the commit.

- [ ] **Step 4: Write `apps/teaching/src/sprint/checks.ts`**

```ts
import type { FeedbackEntry, Part, PhasePayload, SprintCriterion, SprintRequirement } from './schema';

/**
 * "Check before you submit": short, kind nudges that say what to add.
 * An empty list means ready. Wording says what to do, never what is wrong.
 */

const MORE = 'Add a little more: say what it shows.';
export const fullSentence = (text: string | undefined): boolean => (text ?? '').trim().split(/\s+/).filter(Boolean).length >= 4;
const crit = (c: { text: string }) => `"${c.text}"`;

export function understandProblems(p: PhasePayload['understand'], ideas: number): string[] {
  const out: string[] = [];
  const notes = p.notes.filter((n) => n.trim());
  if (notes.length < ideas) out.push(`Write ${ideas} "How might we" questions. You have ${notes.length} so far.`);
  if (notes.some((n) => !/^how might we\b/i.test(n.trim()))) out.push('Start each question with "How might we".');
  return out;
}

export function sketchProblems(
  p: PhasePayload['sketch'],
  opts: { ideas: number; requirements: readonly SprintRequirement[] }
): string[] {
  const out: string[] = [];
  const reqs = opts.requirements.filter((r) => r.phases.includes('sketch'));
  p.cards.forEach((c, i) => {
    const name = `Idea ${i + 1}`;
    if (!c.title.trim()) out.push(`${name}: give it a title.`);
    for (const field of [c.idea, c.answers, c.evidence]) if (!fullSentence(field)) { out.push(`${name}: ${MORE}`); break; }
    if (!Object.values(c.criteria).some((w) => w.trim())) out.push(`${name}: link it to at least one criterion and quote the line that shows it.`);
    for (const r of reqs) if (!c.requirements[r.id]?.trim()) out.push(`${name}: say where it meets "${r.text}".`);
    if (!fullSentence(c.value_answer)) out.push(`${name}: answer the check question in a full sentence.`);
  });
  if (p.cards.length < opts.ideas) out.push(`Write ${opts.ideas} ideas. You have ${p.cards.length} so far.`);
  const titles = new Set(p.cards.map((c) => c.title.trim().toLowerCase()));
  const ideasText = new Set(p.cards.map((c) => c.idea.trim().toLowerCase()));
  if (titles.size < p.cards.length || ideasText.size < p.cards.length) out.push('Give each idea its own title and its own idea.');
  if (!p.strongest || !fullSentence(p.strongest_why)) out.push('Pick your strongest idea and say why.');
  return out;
}

export function voteProblems(
  p: Pick<PhasePayload['decide'], 'votes' | 'reasons' | 'opened'>,
  criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[],
  sets: readonly string[]
): string[] {
  const out: string[] = [];
  if (sets.some((s) => !p.opened.includes(s))) out.push('Open every set of ideas before you vote.');
  for (const c of criteria) {
    if (!p.votes[c.id]) out.push(`Give ${crit(c)} to one idea.`);
    else if (!fullSentence(p.reasons[c.id])) out.push(`${crit(c)}: say why in a full sentence.`);
  }
  return out;
}

export function partsProblems(parts: readonly Part[]): string[] {
  return parts.filter((p) => !p.criterion).map((p) => `"${p.text}": pick the criterion it serves.`);
}

export function prototypeProblems(
  p: PhasePayload['prototype'],
  criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[],
  requirements: readonly SprintRequirement[]
): string[] {
  const out: string[] = [];
  if (!p.text.trim() && !p.files.length && !p.link) out.push('Add your part: write it, upload a file or add a link.');
  for (const r of requirements.filter((x) => x.phases.includes('prototype'))) if (!p.requirements[r.id]?.trim()) out.push(`Say where your part meets "${r.text}".`);
  for (const c of criteria) if (!p.self[c.id] || !fullSentence(p.self_why[c.id])) out.push(`${crit(c)}: pick Starting, Showing or Strong and say why.`);
  if (!fullSentence(p.value_answer)) out.push('Answer the check question in a full sentence.');
  return out;
}

export function feedbackProblems(f: FeedbackEntry, criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[]): string[] {
  const out: string[] = [];
  for (const c of criteria) if (!f.levels[c.id]) out.push(`Pick a level for ${crit(c)}.`);
  if (!fullSentence(f.worked)) out.push('Say what worked in a full sentence.');
  if (!fullSentence(f.next)) out.push('Give one thing to try next in a full sentence.');
  if (!f.about) out.push('Pick the criterion your comments are about.');
  return out;
}

export function reflectionProblems(p: PhasePayload['test']): string[] {
  const out: string[] = [];
  if (p.reflection.length < 2 || p.reflection.some((r) => !fullSentence(r))) out.push('Answer both reflection questions in full sentences.');
  if (!p.quote.trim()) out.push('Quote one piece of feedback your group received.');
  if (!p.change_criterion) out.push('Pick the criterion your change is about.');
  if (!fullSentence(p.value_answer)) out.push('Answer the check question in a full sentence.');
  return out;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-defaults.test.ts tests/unit/sprint-checks.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/sprint/defaults.ts apps/teaching/src/sprint/checks.ts apps/teaching/tests/unit/sprint-defaults.test.ts apps/teaching/tests/unit/sprint-checks.test.ts
git commit -m "Teaching sprint: default Kit, Thinking moves and submit checks"
```

---

### Task 4: Publish split, publish issues and the publish branch

**Files:**
- Create: `apps/teaching/src/sprint/model.ts`
- Modify: `apps/teaching/src/schemas/lesson.ts` (PublishableLessonSchema)
- Create: `netlify/functions/_shared/sprint-keys.mjs`
- Create: `netlify/functions/_shared/sprint.mjs` (publish part only in this task)
- Modify: `netlify/functions/lesson-publish.mjs` (before the tutorial branch ~195)
- Test: `apps/teaching/tests/unit/sprint-model.test.ts`
- Test: `tests/unit/sprint-publish.test.js`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/teaching/tests/unit/sprint-model.test.ts
import { describe, it, expect } from 'vitest';
import { sprintParts, sprintIssues, publicSprint } from '@/sprint/model';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';

let n = 0;
const id = () => `b${++n}`;
const brief = { id: 'h1', type: 'block', block_type: 'heading', variant: 'medium', visibility: 'student_teacher', content: { text: 'The challenge' } } as const;

describe('sprint model', () => {
  it('splits the brief from the phase sections', () => {
    const parts = sprintParts([brief, ...newSprintBlocks(id)] as never);
    expect(parts.brief.map((b) => b.id)).toEqual(['h1']);
    expect([...parts.phases.keys()]).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
  });

  it('lists what stops a sprint publishing', () => {
    const s = newSprintSettings('class1');
    const issues = sprintIssues({ sprint: s, blocks: [] });
    expect(issues).toContain('Add at least 2 criteria in the Kit.');
    expect(issues).toContain('Set a deadline for every phase.');
    expect(issues).toContain('Put every student in a group.');
    const ready = { ...s, criteria: [{ id: 'c1', text: 'A' }, { id: 'c2', text: 'B' }], groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann'] }], phases: s.phases.map((p, i) => ({ ...p, due_date: `2026-11-0${i + 1}` })) };
    expect(sprintIssues({ sprint: ready, blocks: [] })).toEqual([]);
    const backwards = { ...ready, phases: ready.phases.map((p, i) => ({ ...p, due_date: `2026-11-0${5 - i}` })) };
    expect(sprintIssues({ sprint: backwards, blocks: [] })).toContain('Each phase’s deadline must come after the one before it.');
    expect(sprintIssues({ blocks: [] })).toEqual(['Set up the sprint’s Kit before publishing.']);
  });

  it('keeps groups, class, outcomes and columns out of the public subset', () => {
    const s = { ...newSprintSettings('class1'), criteria: [{ id: 'c1', text: 'A', outcome: 'ht4-9' }], groups: [{ id: 'g1', name: 'K', students: ['st_ann'] }], columns: { prototype: 'abcdefgh' } };
    const pub = publicSprint(s);
    expect(JSON.stringify(pub)).not.toMatch(/class1|st_ann|ht4-9|abcdefgh/);
    expect(pub.criteria).toEqual([{ id: 'c1', text: 'A' }]);
  });
});
```

```js
// tests/unit/sprint-publish.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSprintPublish } from '../../netlify/functions/_shared/sprint.mjs';

const section = (id, key, blocks = []) => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: key, blocks, sprint_phase: key } });
const phases = ['understand', 'sketch', 'decide', 'prototype', 'test'].map((key, i) => ({ key, where: i % 2 ? 'home' : 'class', due_date: `2026-11-0${i + 1}`, due_time: '15:00', ends_at: '', instruction: '', stretch: '' }));
const draft = {
  id: 'sp1',
  pedagogical_mode: 'design_sprint',
  sprint: {
    class_id: 'class1', decider: 'top_vote', support: 'open', lock_hours: 2,
    criteria: [{ id: 'c1', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Why it matters' }],
    reflection_criteria: [{ id: 'reflect', text: 'Explains what the test showed' }], reflection_prompts: ['a', 'b'],
    requirements: [{ id: 'r1', text: 'Two sources', phases: ['sketch'] }],
    idea_guide: { checklist: ['x'], model: { topic: 'Wall', text: 'y', notes: [] } },
    phases, groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }], columns: {}
  }
};

test('publish keeps the body public and the groups server-side', () => {
  const out = prepareSprintPublish(draft, [section('s1', 'understand'), section('s2', 'sketch')]);
  assert.equal(out.snapshot.blocks.length, 2);
  assert.equal(out.snapshot.sprint.support, 'open');
  assert.equal(JSON.stringify(out.snapshot).includes('st_ann'), false);
  assert.equal(JSON.stringify(out.snapshot).includes('ht4-9'), false);
  assert.deepEqual(out.config.groups, [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }]);
  assert.equal(out.config.class_id, 'class1');
  assert.equal(out.config.decider, 'top_vote');
  assert.deepEqual(out.config.criteria, ['c1', 'c2']);
  assert.equal(out.config.phases[1].ideas, undefined);
  assert.equal(typeof out.config.version, 'string');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-model.test.ts`
Expected: FAIL, cannot resolve `@/sprint/model`.
Run: `node --test tests/unit/sprint-publish.test.js`
Expected: FAIL, cannot find `sprint.mjs`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/model.ts`**

```ts
import type { Block } from '@/schemas/block';
import { phaseDue } from './rules';
import { SPRINT_PHASES, type PublicSprint, type SprintPhaseKey, type SprintSettings } from './schema';

type Section = Extract<Block, { block_type: 'section' }>;

export const phaseOfSection = (b: Block): SprintPhaseKey | null =>
  b.block_type === 'section' && typeof b.content.sprint_phase === 'string' ? b.content.sprint_phase : null;

/** Top-level blocks outside phase sections are the brief; each phase has at most one section (the first wins). */
export function sprintParts(blocks: readonly Block[]): { brief: Block[]; phases: Map<SprintPhaseKey, Section> } {
  const brief: Block[] = [];
  const phases = new Map<SprintPhaseKey, Section>();
  for (const b of blocks) {
    const key = phaseOfSection(b);
    if (key === null) brief.push(b);
    else if (!phases.has(key)) phases.set(key, b as Section);
  }
  return { brief, phases };
}

/** What stops a sprint publishing, in the teacher's words. */
export function sprintIssues(lesson: { sprint?: SprintSettings; blocks: readonly Block[] }): string[] {
  const s = lesson.sprint;
  if (!s) return ['Set up the sprint’s Kit before publishing.'];
  const out: string[] = [];
  if (s.criteria.length < 2) out.push('Add at least 2 criteria in the Kit.');
  const dues = s.phases.map((p) => phaseDue(p));
  if (dues.some((d) => d === null)) out.push('Set a deadline for every phase.');
  else if (dues.some((d, i) => i > 0 && d! <= dues[i - 1]!)) out.push('Each phase’s deadline must come after the one before it.');
  if (!s.groups.length || s.groups.some((g) => !g.students.length)) out.push('Put every student in a group.');
  const seen = new Set<string>();
  for (const g of s.groups) for (const st of g.students) {
    if (seen.has(st)) { out.push('A student is in two groups. Keep each student in one group.'); break; }
    seen.add(st);
  }
  return out;
}

export function publicSprint(s: SprintSettings): PublicSprint {
  const strip = (c: { id: string; text: string }) => ({ id: c.id, text: c.text });
  return {
    support: s.support,
    lock_hours: s.lock_hours,
    criteria: s.criteria.map(strip),
    reflection_criteria: s.reflection_criteria.map(strip),
    reflection_prompts: [...s.reflection_prompts],
    requirements: s.requirements.map((r) => ({ ...r, phases: [...r.phases] })),
    idea_guide: s.idea_guide,
    phases: s.phases.map((p) => ({ ...p }))
  };
}

export { SPRINT_PHASES };
```

In `apps/teaching/src/schemas/lesson.ts`, import `sprintIssues` and add, after the tutorial block inside `PublishableLessonSchema`'s `superRefine`:

```ts
  if (lesson.pedagogical_mode === 'design_sprint') {
    for (const message of sprintIssues(lesson)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['sprint'] });
    }
  }
```

```ts
import { sprintIssues } from '../sprint/model';
```

- [ ] **Step 4: Write `netlify/functions/_shared/sprint-keys.mjs`**

```js
/**
 * Where a Design Sprint keeps its state. One class per sprint.
 *
 *   sprint/{lesson}/config                    { version, class_id, groups, decider, lock_hours, phases, criteria, reflection_criteria, requirements, ideas }
 *   sprint/{lesson}/lock                      { ended: { [phase]: { at, present[] } }, lock: { phase, until, unlocked[] } | null }
 *   sprint/{lesson}/extend                    { group: { [g]: { [phase]: { due_date, due_time } } }, student: { [s]: { … } } }
 *   sprint/{lesson}/seen/{student}            { [phase]: iso }   first time the student opened the phase
 *   sprint/{lesson}/subs/{student}/{phase}    { payload, saved_at, submitted_at, late, frozen }
 *   sprint/{lesson}/groups/{group}            { in: { [phase]: student[] }, question, chosen, awaiting, votes_closed_at, parts, claims, pitch }
 *   sprint/{lesson}/fileowner/{id}            { owner, student }
 *   sprint/{lesson}/files/{student}/{id}      bytes, metadata { contentType }
 *   sprint/{lesson}/filemeta/{student}/{id}   { name, mime, size, at, phase }
 *   sprint/{lesson}/rounds/{group}            { status, opened_at, closed_at, entries: { [student]: { levels, worked, next, about, flagged, status } } }
 *   sprint/{lesson}/stage                     { running: group|null, spotlight: { text, label } | null }
 */
export const sprintKeys = (lesson) => ({
  config: `sprint/${lesson}/config`,
  lock: `sprint/${lesson}/lock`,
  extend: `sprint/${lesson}/extend`,
  seen: (student) => `sprint/${lesson}/seen/${student}`,
  sub: (student, phase) => `sprint/${lesson}/subs/${student}/${phase}`,
  group: (group) => `sprint/${lesson}/groups/${group}`,
  file: (student, id) => `sprint/${lesson}/files/${student}/${id}`,
  fileMeta: (student, id) => `sprint/${lesson}/filemeta/${student}/${id}`,
  fileMetaPrefix: (student) => `sprint/${lesson}/filemeta/${student}/`,
  fileOwner: (id) => `sprint/${lesson}/fileowner/${id}`,
  round: (group) => `sprint/${lesson}/rounds/${group}`,
  stage: `sprint/${lesson}/stage`
});

export const emptyGroup = () => ({ in: {}, question: null, chosen: null, awaiting: null, votes_closed_at: null, parts: [], claims: {}, pitch: null });
export const emptyLock = () => ({ ended: {}, lock: null });
```

- [ ] **Step 5: Write the publish part of `netlify/functions/_shared/sprint.mjs`**

```js
/**
 * Design Sprints. Publish keeps the whole student-safe body public (brief and
 * phase guides are for everyone) with a public `sprint` subset; the groups,
 * class and rules go to sprint/{lesson}/config. Student and teacher actions
 * below read and write the records listed in sprint-keys.mjs. No model is
 * called here.
 */
import { sprintKeys } from './sprint-keys.mjs';

const strip = (c) => ({ id: c.id, text: c.text });

export function prepareSprintPublish(draft, studentBlocks) {
  const s = draft.sprint;
  const snapshot = {
    blocks: studentBlocks,
    sprint: {
      support: s.support,
      lock_hours: s.lock_hours,
      criteria: s.criteria.map(strip),
      reflection_criteria: s.reflection_criteria.map(strip),
      reflection_prompts: [...s.reflection_prompts],
      requirements: s.requirements,
      idea_guide: s.idea_guide,
      phases: s.phases
    }
  };
  const config = {
    version: Date.now().toString(36),
    class_id: s.class_id,
    decider: s.decider,
    lock_hours: s.lock_hours,
    groups: s.groups.map((g) => ({ id: g.id, name: g.name, students: [...g.students] })),
    phases: s.phases.map((p) => ({ key: p.key, where: p.where, due_date: p.due_date, due_time: p.due_time, ends_at: p.ends_at })),
    ideas: Object.fromEntries(s.phases.filter((p) => p.ideas).map((p) => [p.key, p.ideas])),
    criteria: s.criteria.map((c) => c.id),
    reflection_criteria: s.reflection_criteria.map((c) => c.id),
    requirements: s.requirements.map((r) => ({ id: r.id, phases: [...r.phases] }))
  };
  return { snapshot, config };
}

export async function storeSprintConfig(store, lessonId, config) {
  await store.setJSON(sprintKeys(lessonId).config, config);
}
```

- [ ] **Step 6: Add the publish branch**

In `netlify/functions/lesson-publish.mjs`, import beside the tutorial import:

```js
import { prepareSprintPublish, storeSprintConfig } from './_shared/sprint.mjs';
```

and add this branch directly above `// A tutorial: Common is public; …`:

```js
    // A design sprint: the body is public; groups, class and rules are stored apart (sprint.mjs).
    if (draft.pedagogical_mode === 'design_sprint' && draft.sprint) {
      const sprint = prepareSprintPublish(draft, publishBlocks);
      await storeSprintConfig(store, id, sprint.config);
      await setJSON(store, publishedLessonKey(id), {
        lesson_id: id,
        title,
        unit_id,
        blocks: sanitizeBlocksDeep(sprint.snapshot.blocks),
        published_at: publishedAt,
        schema_version: 1,
        ...(draft.cover ? { cover: draft.cover } : {}),
        ...(outcomeIds.length > 0 ? { outcome_ids: outcomeIds } : {}),
        ...(draft.feedback_off === true ? { feedback_off: true } : {}),
        pedagogical_mode: 'design_sprint',
        sprint: sprint.snapshot.sprint
      });
      await setJSON(store, draftLessonKey(id), { ...draft, published_at: publishedAt, updated_at: publishedAt });
      return withCors(okResponse(200, { student_path: `/s/lessons/${id}` }), request, env);
    }
```

The draft has already passed `PublishableLessonSchema` higher up in this handler, so `sprintIssues` has run.

- [ ] **Step 7: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-model.test.ts && npx tsc --noEmit`
Expected: PASS.
Run: `node --test tests/unit/sprint-publish.test.js tests/unit/tutorial-publish.test.js`
Expected: PASS (the tutorial publish test is unchanged).

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/sprint/model.ts apps/teaching/src/schemas/lesson.ts apps/teaching/tests/unit/sprint-model.test.ts netlify/functions/_shared/sprint-keys.mjs netlify/functions/_shared/sprint.mjs netlify/functions/lesson-publish.mjs tests/unit/sprint-publish.test.js
git commit -m "Teaching sprint: publish split and publish checks"
```

---
## Phase 2: server

### Task 5: Student core: claim, status, open, save, submit, class lock

**Files:**
- Modify: `netlify/functions/_shared/sprint.mjs` (append)
- Create: `netlify/functions/published-sprint.mjs`
- Modify: `netlify/functions/_shared/public-student-routes.mjs`
- Create: `tests/unit/helpers/sprint-store.js`
- Test: `tests/unit/sprint-student.test.js`

- [ ] **Step 1: Write the store helper**

```js
// tests/unit/helpers/sprint-store.js
// In-memory store and fixture for the sprint server tests. Invented names only.
import { sprintKeys } from '../../../netlify/functions/_shared/sprint-keys.mjs';
import { classKey, publishedLessonKey, draftLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';

export const ROSTER = [
  { id: 'st_ann', name: 'Ann Bell', initials: 'AB' },
  { id: 'st_cy', name: 'Cy Dale', initials: 'CD' },
  { id: 'st_ed', name: 'Ed Fox', initials: 'EF' },
  { id: 'st_gus', name: 'Gus Hale', initials: 'GH' }
];
const phase = (key, where, due) => ({ key, where, due_date: due, due_time: '15:00', ends_at: '' });
export const CONFIG = () => ({
  version: 'v1',
  class_id: 'class1',
  decider: 'top_vote',
  lock_hours: 2,
  groups: [{ id: 'g1', name: 'Kestrel', students: ['st_ann', 'st_cy'] }, { id: 'g2', name: 'Heron', students: ['st_ed', 'st_gus'] }],
  phases: [phase('understand', 'class', '2026-11-02'), phase('sketch', 'home', '2026-11-04'), phase('decide', 'class', '2026-11-06'), phase('prototype', 'home', '2026-11-10'), phase('test', 'class', '2026-11-12')],
  ideas: { understand: 3, sketch: 3 },
  criteria: ['c1', 'c2'],
  reflection_criteria: ['reflect'],
  requirements: [{ id: 'r1', phases: ['sketch'] }]
});
export const DRAFT = () => ({ id: 'sp1', title: 'Pompeii', pedagogical_mode: 'design_sprint', sprint: { ...CONFIG(), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }], groups: CONFIG().groups } });

export function storeFor(config = CONFIG()) {
  const data = new Map([
    [publishedLessonKey('sp1'), { lesson_id: 'sp1', pedagogical_mode: 'design_sprint', blocks: [], sprint: { criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }] } }],
    [draftLessonKey('sp1'), DRAFT()],
    [classKey('class1'), { id: 'class1', status: 'active', title: '7B', students: ROSTER }],
    [sprintKeys('sp1').config, config]
  ]);
  const etags = new Map();
  let n = 0;
  const store = {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async set(key, bytes, opts = {}) { data.set(key, { bytes, metadata: opts.metadata ?? {} }); return { modified: true }; },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfMatch !== undefined && (etags.get(key) ?? (data.has(key) ? 'e0' : undefined)) !== opts.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value));
      etags.set(key, `e${++n}`);
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
  return store;
}

export const tok = (n) => String(n).repeat(48).slice(0, 48);
export const who = (n) => ({ class_id: 'class1', class_token: tok(n) });
/** Device n claims initials; 1 Ann, 2 Cy, 3 Ed, 4 Gus. */
export const INITIALS = { 1: 'AB', 2: 'CD', 3: 'EF', 4: 'GH' };
```

If `store.get` in other helpers is called with `{ type: 'json' }`, this one ignores options, the same as `tutorial-store.js`.

- [ ] **Step 2: Write the failing test**

```js
// tests/unit/sprint-student.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { sprintKeys } from '../../netlify/functions/_shared/sprint-keys.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const at = (iso) => () => Date.parse(iso);
const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const claim = (store, n) => act(store, n, 'claim', { initials: INITIALS[n] });
const notes = (...n) => ({ notes: n, star: '', stretch: '' });

test('a student claims, sees their group and only Understand open', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  assert.equal((await act(store, 1, 'status')).identity.need, 'initials');
  const s = await claim(store, 1);
  assert.equal(s.group.name, 'Kestrel');
  assert.deepEqual(s.group.mates, ['CD']);
  assert.deepEqual(s.phases.filter((p) => p.open).map((p) => p.key), ['understand']);
  assert.equal(JSON.stringify(s).includes('st_cy'), false);
});

test('saving keeps a draft; submitting counts toward the group', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  await act(store, 1, 'open', { phase: 'understand' });
  const saved = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we make it close?') });
  assert.equal(saved.phases[0].state, 'draft');
  assert.equal(saved.notes.length, 1);
  assert.equal(saved.notes[0].mine, true);
  const star = saved.notes[0].id;
  const sent = await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we make it close?'), star } });
  assert.equal(sent.phases[0].state, 'in');
  assert.equal(sent.phases[0].count_in, 1);
  await assert.rejects(act(store, 1, 'save', { phase: 'sketch', payload: { cards: [] } }), { code: 'not_open' });
});

test('submitting Understand needs a star on one of the group’s notes', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: notes('How might we start?') }), { code: 'need_star' });
  await assert.rejects(act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we start?'), star: 'zzzzzzzzzzzz' } }), { code: 'need_star' });
});

test('the next phase opens when the whole group is in', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2]) await claim(store, n);
  const a = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we a?') });
  const star = a.notes[0].id;
  await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we a?'), star } });
  await act(store, 2, 'submit', { phase: 'understand', payload: { ...notes('How might we b?'), star } });
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.phases.filter((p) => p.open).map((p) => p.key), ['understand', 'sketch']);
  assert.equal(s.question.text, 'How might we a?');
});

test('ending the class part freezes work, locks the sprint and opens the next phase after the lock', async () => {
  const config = { ...CONFIG(), phases: CONFIG().phases.map((p) => (p.key === 'understand' ? { ...p, ends_at: '2026-11-02T11:00' } : p)) };
  const store = storeFor(config);
  setSprintClock(at('2026-11-01T22:00:00Z')); // 9 am Sydney, 2 Nov
  await claim(store, 1);
  await act(store, 1, 'open', { phase: 'understand' });
  await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we keep it?') });
  setSprintClock(at('2026-11-02T01:00:00Z')); // noon: ended at 11 am, locked until 1 pm
  const locked = await act(store, 1, 'status');
  assert.equal(locked.lock.until, '2026-11-02T02:00:00.000Z');
  assert.equal(locked.phases[0].state, 'in');
  assert.equal(locked.phases[0].frozen, true);
  assert.deepEqual(locked.phases.filter((p) => p.open).map((p) => p.key), ['understand']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('More') }), { code: 'locked' });
  setSprintClock(at('2026-11-02T02:30:00Z'));
  const after = await act(store, 1, 'status');
  assert.equal(after.lock, null);
  assert.deepEqual(after.phases.filter((p) => p.open).map((p) => p.key), ['understand', 'sketch']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('More') }), { code: 'frozen' });
});

test('an absent student catches up on the class part after the lock', async () => {
  const config = { ...CONFIG(), phases: CONFIG().phases.map((p) => (p.key === 'understand' ? { ...p, ends_at: '2026-11-02T11:00' } : p)) };
  const store = storeFor(config);
  setSprintClock(at('2026-11-02T03:00:00Z'));
  await claim(store, 2);
  const s = await act(store, 2, 'save', { phase: 'understand', payload: notes('How might we catch up?') });
  assert.equal(s.phases[0].frozen, false);
  assert.equal(s.phases[0].state, 'draft');
});

test('a student in no group is told so', async () => {
  setSprintClock(at('2026-11-01T00:00:00Z'));
  const store = storeFor({ ...CONFIG(), groups: [{ id: 'g1', name: 'Kestrel', students: ['st_cy'] }] });
  const s = await claim(store, 1);
  assert.equal(s.not_for_you, true);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: notes('x') }), { code: 'not_for_you' });
});

test('late work is marked late', async () => {
  setSprintClock(at('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await claim(store, 1);
  const s = await act(store, 1, 'save', { phase: 'understand', payload: notes('How might we a?') });
  await act(store, 1, 'submit', { phase: 'understand', payload: { ...notes('How might we a?'), star: s.notes[0].id } });
  const sub = [...store.data.entries()].find(([k]) => k.includes('/subs/') && k.endsWith('/understand'))[1];
  assert.equal(sub.late, true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/unit/sprint-student.test.js`
Expected: FAIL, `sprintAction` is not exported.

- [ ] **Step 4: Append the student core to `netlify/functions/_shared/sprint.mjs`**

Add these imports at the top of the file, under the existing `sprintKeys` import (change that line to also import `emptyGroup, emptyLock`):

```js
import { isSafeId } from './class-examples.mjs';
import { publishedLessonKey, draftLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { QuizError, deviceHash, read, reject } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { PAYLOAD_SCHEMAS } from './sprint-schema.mjs';
import { openPhases, lockState, isFrozen, isLate, tally, heatLevels, endsAtEpoch, phaseDue } from './sprint-rules.mjs';
import { sprintKeys, emptyGroup, emptyLock } from './sprint-keys.mjs';

export { QuizError as SprintError };
```

Then append:

```js
// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let clock = () => Date.now();
/** Tests set the time; pass nothing to go back to the real clock. */
export const setSprintClock = (fn) => { clock = fn ?? (() => Date.now()); };
const iso = (ms) => new Date(ms).toISOString();
const list = (v) => (Array.isArray(v) ? v : []);
export const PHASES = ['understand', 'sketch', 'decide', 'prototype', 'test'];
const short = (text) => deviceHash(text).slice(0, 12);
export const ownerOf = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

async function loadSprint(store, lessonId) {
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Sprint not found.');
  const lesson = await read(store, publishedLessonKey(lessonId));
  if (!lesson) reject(404, 'not_found', 'Sprint not found.');
  if (lesson.pedagogical_mode !== 'design_sprint') reject(409, 'not_sprint', 'This lesson isn’t a design sprint.');
  const config = await read(store, sprintKeys(lessonId).config);
  if (!config) reject(409, 'not_published', 'Publish the sprint again.');
  return { lesson, config };
}

/** A phase's dates after any extension: student beats group beats class. */
export function phaseFor(config, extend, key, groupId, studentId) {
  const base = config.phases.find((p) => p.key === key);
  const over = (studentId && extend?.student?.[studentId]?.[key]) || extend?.group?.[groupId]?.[key] || extend?.class?.[key];
  return over ? { ...base, ...over } : base;
}
const groupPhases = (config, extend, groupId) => PHASES.map((key) => phaseFor(config, extend, key, groupId, null));

export async function groupState(store, k, groupId) {
  return { ...emptyGroup(), ...((await read(store, k.group(groupId))) ?? {}) };
}

export function factsFor(group, state, lockRec) {
  return {
    size: group.students.length,
    submitted: Object.fromEntries(PHASES.map((key) => [key, list(state.in?.[key]).filter((s) => group.students.includes(s)).length])),
    ended: lockRec.ended ?? {},
    lock: lockRec.lock ?? null
  };
}

/** True once a phase is over for the group: all in, past its deadline, or its class part ended. */
export function phaseDone(config, extend, group, state, lockRec, key, now) {
  const due = phaseDue(phaseFor(config, extend, key, group.id, null));
  const allIn = group.students.length > 0 && group.students.every((s) => list(state.in?.[key]).includes(s));
  return allIn || (due !== null && due <= now) || !!lockRec.ended?.[key];
}

/**
 * End a class part at `at`: students who opened the phase before then were
 * there, so their work is frozen and submitted as it stands; then the sprint
 * locks for lock_hours. Running it twice changes nothing.
 */
export async function endClassPart(store, lessonId, config, phase, at) {
  const k = sprintKeys(lessonId);
  const rec = { ...emptyLock(), ...((await read(store, k.lock)) ?? {}) };
  if (rec.ended[phase]) return rec;
  const present = [];
  for (const g of config.groups) {
    const state = await groupState(store, k, g.id);
    let changed = false;
    for (const s of g.students) {
      const owner = ownerOf(config.class_id, s);
      const seen = (await read(store, k.seen(owner))) ?? {};
      if (!seen[phase] || Date.parse(seen[phase]) > at) continue;
      present.push(s);
      const sub = await read(store, k.sub(owner, phase));
      if (!sub) continue;
      await store.setJSON(k.sub(owner, phase), { ...sub, frozen: true, submitted_at: sub.submitted_at ?? iso(at), late: sub.late ?? false });
      if (!list(state.in[phase]).includes(s)) {
        state.in = { ...state.in, [phase]: [...list(state.in[phase]), s] };
        changed = true;
      }
    }
    if (changed) await store.setJSON(k.group(g.id), state);
  }
  const next = {
    ended: { ...rec.ended, [phase]: { at: iso(at), present } },
    lock: config.lock_hours > 0 ? { phase, until: iso(at + config.lock_hours * 3600000), unlocked: [] } : null
  };
  await store.setJSON(k.lock, next);
  return next;
}

/** Class parts whose end time has passed end on their own, as if End class part was pressed then. */
export async function endDueClassParts(store, lessonId, config) {
  const now = clock();
  let rec = { ...emptyLock(), ...((await read(store, sprintKeys(lessonId).lock)) ?? {}) };
  for (const p of config.phases) {
    if (p.where !== 'class' || rec.ended[p.key]) continue;
    const at = endsAtEpoch(p.ends_at ?? '');
    if (at !== null && at <= now) rec = await endClassPart(store, lessonId, config, p.key, at);
  }
  return rec;
}

// ---------------------------------------------------------------------------
// Anonymous ids. Notes, sets and ideas get ids made from the lesson and the
// author's owner hash, so the server can map them back and students can't.
// ---------------------------------------------------------------------------

const noteId = (lessonId, owner, i) => short(`${lessonId}:note:${owner}:${i}`);
const setId = (lessonId, owner) => short(`${lessonId}:set:${owner}`);
const ideaId = (lessonId, owner, cardId) => short(`${lessonId}:idea:${owner}:${cardId}`);

/** Every group member's subs for one phase: [{ student, owner, sub }]. */
async function groupSubs(store, lessonId, config, group, phase) {
  const k = sprintKeys(lessonId);
  return Promise.all(group.students.map(async (student) => {
    const owner = ownerOf(config.class_id, student);
    return { student, owner, sub: await read(store, k.sub(owner, phase)) };
  }));
}

export async function groupNotes(store, lessonId, config, group) {
  const subs = await groupSubs(store, lessonId, config, group, 'understand');
  return subs.flatMap(({ student, owner, sub }) =>
    list(sub?.payload?.notes).map((text, i) => ({ id: noteId(lessonId, owner, i), index: i, text, student, star: sub?.payload?.star ?? '' })).filter((n) => n.text.trim())
  );
}

/** The gallery: submitted sketches, each author's cards as one set, strongest first. Sets are ordered by id, never by roster. */
export async function groupGallery(store, lessonId, config, group, closedAt) {
  const subs = await groupSubs(store, lessonId, config, group, 'sketch');
  return subs
    .filter(({ sub }) => sub?.submitted_at && (!closedAt || Date.parse(sub.submitted_at) <= Date.parse(closedAt)))
    .map(({ student, owner, sub }) => {
      const cards = list(sub.payload.cards);
      const strongest = sub.payload.strongest;
      const ordered = [...cards.filter((c) => c.id === strongest), ...cards.filter((c) => c.id !== strongest)];
      return {
        id: setId(lessonId, owner),
        student,
        ideas: ordered.map((c) => ({ id: ideaId(lessonId, owner, c.id), index: cards.indexOf(c), title: c.title, idea: c.idea, answers: c.answers, evidence: c.evidence, file: c.file ?? null, strongest: c.id === strongest }))
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Settle what a closed phase decides: the group question after Understand,
 * the chosen idea after Decide's votes. With the teacher as decider (or a
 * tie, or nothing to choose from) the group waits on the teacher instead.
 */
export async function resolveGroup(store, lessonId, config, group, state, lockRec, extend, now) {
  const k = sprintKeys(lessonId);
  let next = state;
  if (!next.question && next.awaiting?.kind !== 'question' && phaseDone(config, extend, group, next, lockRec, 'understand', now)) {
    const notes = await groupNotes(store, lessonId, config, group);
    const subs = await groupSubs(store, lessonId, config, group, 'understand');
    const t = tally(subs.map(({ sub }) => ({ star: sub?.payload?.star ?? '' })), ['star'], notes.map((n) => n.id));
    const top = notes.find((n) => n.id === t.top);
    next = config.decider === 'top_vote' && top
      ? { ...next, question: { id: top.id, text: top.text } }
      : { ...next, awaiting: { kind: 'question', tie: t.tie, empty: notes.length === 0 } };
  }
  const votesIn = group.students.every((s) => list(next.voted).includes(s));
  const decideOver = phaseDone(config, extend, group, next, lockRec, 'decide', now);
  if (!next.votes_closed_at && (votesIn || decideOver) && (next.question || next.awaiting?.kind !== 'question')) {
    const closedAt = iso(now);
    const gallery = await groupGallery(store, lessonId, config, group, closedAt);
    const ideas = gallery.flatMap((set) => set.ideas.map((i) => i.id));
    const subs = await groupSubs(store, lessonId, config, group, 'decide');
    const t = tally(subs.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, ideas);
    next = { ...next, votes_closed_at: closedAt };
    if (config.decider === 'top_vote' && t.top) next.chosen = t.top;
    else next.awaiting = { kind: 'idea', tie: t.tie, empty: ideas.length === 0 };
  }
  if (next !== state) await store.setJSON(k.group(group.id), next);
  return next;
}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

const STUDENT_ACTIONS = ['status', 'claim', 'open', 'save', 'submit', 'parts', 'claim_part', 'pitch', 'feedback'];

async function whoAndGroup(store, config, body, action) {
  let who;
  try {
    who = await identify(store, body, action);
  } catch (e) {
    if (e instanceof QuizError && e.code === 'need_class') reject(e.status, 'need_class', 'Open this sprint from your class page.');
    throw e;
  }
  if (who.need === 'class') reject(403, 'need_class', 'Open this sprint from your class page.');
  const group = who.student && who.classId === config.class_id ? config.groups.find((g) => g.students.includes(who.student.id)) ?? null : null;
  return { who, group };
}

/** Throws unless this student may change this phase now. */
function mayEdit(view, phase) {
  const row = view.phases.find((p) => p.key === phase);
  if (!row) reject(400, 'bad_phase', 'Unknown phase.');
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  if (!row.open) reject(409, 'not_open', 'This phase hasn’t opened yet.');
  if (row.frozen) reject(409, 'frozen', 'Your class work for this phase is in.');
  if (row.state === 'in' && row.closed) reject(409, 'closed', 'This phase has closed.');
}

/**
 * Everything the student's screen needs. Authors are never included:
 * notes, sets and ideas carry anonymous ids, and vote counts become heat
 * levels only once voting has closed.
 */
async function studentView(store, lessonId, config, who, group) {
  const k = sprintKeys(lessonId);
  const now = clock();
  const sid = who.student.id;
  const owner = ownerOf(config.class_id, sid);
  const lockRec = await endDueClassParts(store, lessonId, config);
  const extend = (await read(store, k.extend)) ?? {};
  let state = await groupState(store, k, group.id);
  state = await resolveGroup(store, lessonId, config, group, state, lockRec, extend, now);
  const open = openPhases(groupPhases(config, extend, group.id), factsFor(group, state, lockRec), now);
  const roster = await loadRoster(store, config.class_id);
  const initials = new Map(list(roster?.students).map((s) => [s.id, s.initials]));
  const mine = {};
  const phases = [];
  for (const key of PHASES) {
    const sub = await read(store, k.sub(owner, key));
    if (sub) mine[key] = sub.payload;
    const p = phaseFor(config, extend, key, group.id, sid);
    const due = phaseDue(p);
    phases.push({
      key,
      open: open.includes(key),
      due_date: p.due_date,
      due_time: p.due_time,
      state: sub?.submitted_at ? 'in' : sub ? 'draft' : 'none',
      late: !!sub?.late,
      frozen: !!sub?.frozen || isFrozen(lockRec.ended ?? {}, key, sid),
      closed: due !== null && due <= now,
      count_in: list(state.in[key]).filter((s) => group.students.includes(s)).length
    });
  }
  const notes = (await groupNotes(store, lessonId, config, group)).map((n) => ({ id: n.id, text: n.text, mine: n.student === sid }));
  const gallery = open.includes('decide') ? (await groupGallery(store, lessonId, config, group, state.votes_closed_at)).map(({ id, ideas }) => ({ id, ideas })) : null;
  let heat = null;
  if (state.votes_closed_at && gallery) {
    const subs = await groupSubs(store, lessonId, config, group, 'decide');
    const t = tally(subs.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, gallery.flatMap((s) => s.ideas.map((i) => i.id)));
    heat = heatLevels(t.counts, config.criteria);
  }
  const chosenIdea = state.chosen && gallery ? gallery.flatMap((s) => s.ideas).find((i) => i.id === state.chosen) ?? null : null;
  const view = {
    identity: { need: null, initials: who.student.initials },
    group: { id: group.id, name: group.name, size: group.students.length, mates: group.students.filter((s) => s !== sid).map((s) => initials.get(s) ?? '–') },
    phases,
    lock: lockState(lockRec.lock, sid, now).locked ? { until: lockRec.lock.until } : null,
    mine,
    notes,
    question: state.question ? { text: state.question.text } : null,
    gallery,
    heat,
    votes_closed: !!state.votes_closed_at,
    chosen: chosenIdea ? { id: chosenIdea.id, title: chosenIdea.title, idea: chosenIdea.idea } : null,
    awaiting: state.awaiting ? { kind: state.awaiting.kind } : null,
    parts: list(state.parts).map((p) => ({ ...p, claimed: list(state.claims[p.id]).length, mine: list(state.claims[p.id]).includes(sid) })),
    pitch: state.pitch ? { kind: state.pitch.kind, name: state.pitch.name ?? '', file: state.pitch.file ?? null, link: state.pitch.link ?? '' } : null
  };
  return view;
}

/** Structural checks the server makes before a submit; the browser shows the kinder, fuller checks. */
async function submitProblem(store, lessonId, config, group, sid, phase, payload, view) {
  if (phase === 'understand') {
    if (!payload.notes.some((n) => n.trim())) return ['need_notes', 'Write at least one question first.'];
    if (!view.notes.some((n) => n.id === payload.star)) return ['need_star', 'Star one of your group’s questions.'];
  }
  if (phase === 'sketch' && !payload.cards.length) return ['need_ideas', 'Write at least one idea first.'];
  if (phase === 'decide') {
    if (!config.criteria.every((c) => payload.votes[c])) return ['need_votes', 'Give every criterion to one idea.'];
    if (!view.parts.some((p) => p.mine)) return ['need_part', 'Claim a part of the prototype.'];
  }
  if (phase === 'test' && payload.reflection.filter((r) => r.trim()).length < 2) return ['need_reflection', 'Answer both reflection questions.'];
  return null;
}

export async function sprintAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'status';
  if (!STUDENT_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  const { config } = await loadSprint(store, lessonId);
  const { who, group } = await whoAndGroup(store, config, body, action);
  const identity = { need: who.need, initials: who.student?.initials ?? null };
  if (who.need === 'initials') {
    if (action !== 'status' && action !== 'claim') reject(403, 'need_initials', 'Type your initials first.');
    return { identity, group: null };
  }
  if (!who.student) {
    if (action === 'status' || action === 'claim') return { identity, group: null, anonymous: true };
    reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
  }
  if (!group) {
    if (action === 'status' || action === 'claim') return { identity, group: null, not_for_you: true };
    reject(403, 'not_for_you', 'This sprint isn’t set for you.');
  }
  const k = sprintKeys(lessonId);
  const sid = who.student.id;
  const owner = ownerOf(config.class_id, sid);
  let view = await studentView(store, lessonId, config, who, group);
  if (action === 'status' || action === 'claim') return withRound(store, lessonId, config, group, sid, view);

  const phase = body.phase;
  if (action === 'open') {
    if (!PHASES.includes(phase)) reject(400, 'bad_phase', 'Unknown phase.');
    const seen = (await read(store, k.seen(owner))) ?? {};
    if (view.phases.find((p) => p.key === phase)?.open && !seen[phase]) await store.setJSON(k.seen(owner), { ...seen, [phase]: iso(clock()) });
  }
  if (action === 'save' || action === 'submit') {
    if (!PHASES.includes(phase)) reject(400, 'bad_phase', 'Unknown phase.');
    mayEdit(view, phase);
    const parsed = PAYLOAD_SCHEMAS[phase].safeParse(body.payload ?? {});
    if (!parsed.success) reject(400, 'bad_payload', parsed.error.issues[0]?.message ?? 'Check your answer.');
    const payload = parsed.data;
    await checkOwnFiles(store, lessonId, owner, phase, payload);
    if (phase === 'decide') checkVotes(view, config, payload);
    const prev = await read(store, k.sub(owner, phase));
    // Once voting closes, Decide can still be submitted (after claiming a part), but the votes stay as they were.
    if (phase === 'decide' && view.votes_closed) {
      const before = prev?.payload?.votes ?? {};
      if (!config.criteria.every((c) => (before[c] ?? '') === (payload.votes[c] ?? ''))) reject(409, 'votes_closed', 'Voting has closed for your group.');
    }
    const now = clock();
    const next = { ...(prev ?? {}), payload, saved_at: iso(now) };
    if (action === 'submit') {
      const problem = await submitProblem(store, lessonId, config, group, sid, phase, payload, view);
      if (problem) reject(400, problem[0], problem[1]);
      const p = phaseFor(config, (await read(store, k.extend)) ?? {}, phase, group.id, sid);
      next.submitted_at = prev?.submitted_at ?? iso(now);
      next.late = isLate(p, next.submitted_at);
    }
    await store.setJSON(k.sub(owner, phase), next);
    const seen = (await read(store, k.seen(owner))) ?? {};
    if (!seen[phase]) await store.setJSON(k.seen(owner), { ...seen, [phase]: iso(now) });
    const state = await groupState(store, k, group.id);
    let changed = false;
    if (action === 'submit' && !list(state.in[phase]).includes(sid)) {
      state.in = { ...state.in, [phase]: [...list(state.in[phase]), sid] };
      changed = true;
    }
    if (phase === 'decide' && config.criteria.every((c) => payload.votes[c]) && !list(state.voted).includes(sid)) {
      state.voted = [...list(state.voted), sid];
      changed = true;
    }
    if (changed) await store.setJSON(k.group(group.id), state);
  }
  if (action === 'parts' || action === 'claim_part' || action === 'pitch') await groupWrite(store, lessonId, config, group, sid, owner, view, action, body);
  if (action === 'feedback') await giveFeedback(store, lessonId, config, group, sid, body);
  view = await studentView(store, lessonId, config, who, group);
  return withRound(store, lessonId, config, group, sid, view);
}
```

`checkOwnFiles`, `checkVotes`, `groupWrite`, `giveFeedback` and `withRound` come in Tasks 6, 8 and 9. To keep this task's tests green, add these stubs at the end of the file now; Tasks 6, 8 and 9 replace them:

```js
async function checkOwnFiles() {}
function checkVotes() {}
async function groupWrite() { reject(400, 'bad_action', 'Unknown action.'); }
async function giveFeedback() { reject(400, 'bad_action', 'Unknown action.'); }
async function withRound(store, lessonId, config, group, sid, view) { return view; }
```

- [ ] **Step 5: Write the student endpoint and open its route**

```js
// netlify/functions/published-sprint.mjs: the student side of a design sprint.
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { sprintAction, SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/sprint/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 900, windowSize: 60 } };
const MAX_BODY = 40000;
export function createPublishedSprintHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > MAX_BODY) return withCors(errorResponse(413, 'too_large', 'That’s too long to send. Shorten it and try again.', false), request, env);
    const match = new URL(request.url).pathname.match(/\/published\/sprint\/([^/]+)$/);
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new SprintError(413, 'too_large', 'That’s too long to send. Shorten it and try again.');
      const result = await sprintAction(store, match?.[1], JSON.parse(text));
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedSprintHandler();
```

The body cap is 40 000 characters (higher than the tutorial's 16 000) because three idea cards of 600-character fields plus reasons can pass 16 000.

In `netlify/functions/_shared/public-student-routes.mjs`, add after the tutorial line:

```js
  { method: 'POST', pattern: /^\/api\/published\/sprint\/[^/]+$/ },
  { method: 'POST', pattern: /^\/api\/published\/sprint-file\/[^/]+$/ },
```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/sprint-student.test.js tests/unit/sprint-publish.test.js`
Expected: PASS (8 + 1 tests). If the lock test fails on `until`, check that 11:00 on 2 Nov 2026 Sydney is 00:00 UTC (AEDT, UTC+11) and that 2 hours later is `02:00:00.000Z`.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/sprint.mjs netlify/functions/published-sprint.mjs netlify/functions/_shared/public-student-routes.mjs tests/unit/helpers/sprint-store.js tests/unit/sprint-student.test.js
git commit -m "Teaching sprint: student claim, phases, submissions and class lock"
```

---

### Task 6: Group decisions: gallery, votes, heat, parts, claims, pitch

**Files:**
- Modify: `netlify/functions/_shared/sprint.mjs` (replace the `checkVotes` and `groupWrite` stubs)
- Test: `tests/unit/sprint-decide.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/sprint-decide.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const card = (id, title) => ({ id, title, idea: `What if ${title}?`, answers: 'It answers it well enough.', evidence: 'For example, Source B.', criteria: { c1: 'Source B' }, requirements: {}, value_answer: 'It takes a different angle.' });

/** Both Kestrel students get through Understand and Sketch; returns the store at Decide. */
async function atDecide(config = CONFIG()) {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor(config);
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  const s = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  const star = s.notes[0].id;
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: { notes: [`How might we ${n}?`], star, stretch: '' } });
  await act(store, 1, 'submit', { phase: 'sketch', payload: { cards: [card('k1', 'Ash'), card('k2', 'Streets')], strongest: 'k2', strongest_why: 'It compares then and now.' } });
  await act(store, 2, 'submit', { phase: 'sketch', payload: { cards: [card('k1', 'Baker')], strongest: 'k1', strongest_why: 'One person’s day.' } });
  return store;
}

test('the gallery shows every set with no authors, strongest first', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  assert.equal(s.gallery.length, 2);
  const titles = s.gallery.flatMap((set) => set.ideas.map((i) => i.title)).sort();
  assert.deepEqual(titles, ['Ash', 'Baker', 'Streets']);
  const mine = s.gallery.find((set) => set.ideas.some((i) => i.title === 'Ash'));
  assert.equal(mine.ideas[0].title, 'Streets');
  assert.equal(JSON.stringify(s.gallery).match(/st_|student|owner/), null);
});

test('votes must name gallery ideas and known criteria', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { votes: { c1: 'nope' }, reasons: {}, opened: [] } }), { code: 'bad_vote' });
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: { votes: { c9: s.gallery[0].ideas[0].id }, reasons: {}, opened: [] } }), { code: 'bad_vote' });
});

test('top vote goes through once everyone has voted; students see heat, never counts', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ash = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Ash').id;
  const votes = (a, b) => ({ votes: { c1: a, c2: b }, reasons: { c1: 'It names a source.', c2: 'It says why.' }, opened: s.gallery.map((x) => x.id) });
  await act(store, 1, 'save', { phase: 'decide', payload: votes(baker, baker) });
  const before = await act(store, 1, 'status');
  assert.equal(before.heat, null);
  await act(store, 2, 'save', { phase: 'decide', payload: votes(baker, ash) });
  const after = await act(store, 1, 'status');
  assert.equal(after.votes_closed, true);
  assert.equal(after.chosen.title, 'Baker');
  assert.deepEqual(after.heat[baker], { c1: 3, c2: 3 });
  assert.equal(JSON.stringify(after.heat).includes('"2"'), false);
  await assert.rejects(act(store, 1, 'save', { phase: 'decide', payload: votes(ash, ash) }), { code: 'votes_closed' });
});

test('with the teacher as decider the group waits', async () => {
  const store = await atDecide({ ...CONFIG(), decider: 'teacher' });
  const s1 = await act(store, 1, 'status');
  assert.equal(s1.question, null);
  assert.deepEqual(s1.awaiting, { kind: 'question' });
});

test('parts: written once the idea is chosen, one claim each, then Decide can be submitted', async () => {
  const store = await atDecide();
  const s = await act(store, 1, 'status');
  const baker = s.gallery.flatMap((x) => x.ideas).find((i) => i.title === 'Baker').id;
  const ballot = { votes: { c1: baker, c2: baker }, reasons: { c1: 'It names a source.', c2: 'It says why it matters.' }, opened: s.gallery.map((x) => x.id) };
  await assert.rejects(act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1' }] }), { code: 'no_idea_yet' });
  for (const n of [1, 2]) await act(store, n, 'save', { phase: 'decide', payload: ballot });
  const withParts = await act(store, 1, 'parts', { parts: [{ id: 'p1', text: 'Panel text', shows: 'The morning', criterion: 'c1' }, { id: 'p2', text: 'Artefact list', shows: '', criterion: 'c2' }] });
  assert.equal(withParts.parts.length, 2);
  await act(store, 1, 'claim_part', { part_id: 'p1' });
  await assert.rejects(act(store, 2, 'claim_part', { part_id: 'p1' }), { code: 'part_taken' });
  const claimed = await act(store, 2, 'claim_part', { part_id: 'p2' });
  assert.deepEqual(claimed.parts.map((p) => [p.id, p.claimed, p.mine]), [['p1', 1, false], ['p2', 1, true]]);
  const sent = await act(store, 2, 'submit', { phase: 'decide', payload: ballot });
  assert.equal(sent.phases[2].state, 'in');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/sprint-decide.test.js`
Expected: FAIL. `bad_vote` isn't thrown (the stub), and `parts` rejects with `bad_action`.

- [ ] **Step 3: Replace the `checkVotes` and `groupWrite` stubs**

```js
import { PartsSchema } from './sprint-schema.mjs';
```

(add `PartsSchema` to the existing `sprint-schema.mjs` import line), then replace the two stubs with:

```js
/** Votes name a known criterion and an idea in this group's gallery; opened lists only real set ids. */
function checkVotes(view, config, payload) {
  const ideas = new Set((view.gallery ?? []).flatMap((s) => s.ideas.map((i) => i.id)));
  const sets = new Set((view.gallery ?? []).map((s) => s.id));
  for (const [c, idea] of Object.entries(payload.votes)) {
    if (!config.criteria.includes(c) || !ideas.has(idea)) reject(400, 'bad_vote', 'That idea has changed. Reload the page.');
  }
  payload.opened = payload.opened.filter((id) => sets.has(id));
}

/** Parts list, part claims and the pitch file: shared group state any member may write. */
async function groupWrite(store, lessonId, config, group, sid, owner, view, action, body) {
  const k = sprintKeys(lessonId);
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  const state = await groupState(store, k, group.id);
  if (action === 'parts' || action === 'claim_part') {
    if (!view.phases.find((p) => p.key === 'decide')?.open) reject(409, 'not_open', 'Decide hasn’t opened yet.');
    if (!state.chosen) reject(409, 'no_idea_yet', 'Your group’s idea is still being chosen.');
    if (view.phases.find((p) => p.key === 'decide')?.frozen) reject(409, 'frozen', 'Your class work for this phase is in.');
  }
  if (action === 'parts') {
    const parsed = PartsSchema.safeParse(body.parts);
    if (!parsed.success) reject(400, 'bad_parts', parsed.error.issues[0]?.message ?? 'Check the parts list.');
    const keep = new Set(parsed.data.map((p) => p.id));
    state.parts = parsed.data.map((p) => ({ ...p, criterion: config.criteria.includes(p.criterion) ? p.criterion : '' }));
    state.claims = Object.fromEntries(Object.entries(state.claims).filter(([id]) => keep.has(id)));
  }
  if (action === 'claim_part') {
    const part = list(state.parts).find((p) => p.id === body.part_id);
    if (!part) reject(404, 'not_found', 'That part has gone. Reload the page.');
    // Two may share a part only when the group has more people than parts.
    const cap = group.students.length > list(state.parts).length ? 2 : 1;
    const others = list(state.claims[part.id]).filter((s) => s !== sid);
    if (others.length >= cap) reject(409, 'part_taken', 'Someone has claimed that part. Pick another.');
    state.claims = Object.fromEntries(Object.entries(state.claims).map(([id, ss]) => [id, list(ss).filter((s) => s !== sid)]));
    state.claims[part.id] = [...others, sid];
  }
  if (action === 'pitch') {
    if (!view.phases.find((p) => p.key === 'prototype')?.open) reject(409, 'not_open', 'Prototype hasn’t opened yet.');
    if (typeof body.link === 'string' && body.link) {
      if (!/^https:\/\/\S{3,490}$/.test(body.link)) reject(400, 'bad_link', 'Links start with https://');
      state.pitch = { kind: 'link', link: body.link, by: sid, at: iso(clock()) };
    } else {
      const meta = typeof body.file_id === 'string' ? await read(store, k.fileMeta(owner, body.file_id)) : null;
      if (!meta) reject(404, 'not_found', 'Upload the file first.');
      state.pitch = { kind: 'file', file: body.file_id, name: meta.name, by: sid, at: iso(clock()) };
    }
  }
  await store.setJSON(k.group(group.id), state);
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/sprint-decide.test.js tests/unit/sprint-student.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/sprint.mjs tests/unit/sprint-decide.test.js
git commit -m "Teaching sprint: anonymous gallery, criterion votes, heat, parts and claims"
```

---

### Task 7: Teacher actions: map, board, end class, unlock, extend, confirm, spotlight, move

**Files:**
- Modify: `netlify/functions/_shared/sprint.mjs` (append)
- Create: `netlify/functions/sprint.mjs`
- Test: `tests/unit/sprint-teacher.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/sprint-teacher.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { draftLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { sprintKeys } from '../../netlify/functions/_shared/sprint-keys.mjs';
import { storeFor, who, INITIALS, CONFIG } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const teach = (store, action, extra = {}) => sprintTeacherAction(store, 'sp1', { action, ...extra });

test('the summary shows each group, each phase and each student by name', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  const s = await teach(store, 'summary');
  assert.deepEqual(s.groups.map((g) => g.name), ['Kestrel', 'Heron']);
  const ann = s.groups[0].students.find((x) => x.initials === 'AB');
  assert.equal(ann.name, 'Ann Bell');
  assert.equal(ann.phases.understand, 'draft');
  assert.equal(s.groups[0].open.at(-1), 'understand');
  assert.equal(s.class_parts.understand, 'open');
});

test('End class part freezes, locks and reports who was there; unlock frees one student', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'open', { phase: 'understand' });
  const s = await teach(store, 'end_class', { phase: 'understand' });
  assert.equal(s.class_parts.understand, 'ended');
  assert.equal(s.lock.until, '2026-11-01T02:00:00.000Z');
  assert.deepEqual(s.ended.understand.present, ['st_ann']);
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'locked' });
  await teach(store, 'unlock', { student_id: 'st_ann' });
  await assert.rejects(act(store, 1, 'save', { phase: 'understand', payload: { notes: ['x'] } }), { code: 'frozen' });
  await assert.rejects(teach(store, 'end_class', { phase: 'sketch' }), { code: 'not_class' });
});

test('extend moves a deadline for one group only', async () => {
  setSprintClock(() => Date.parse('2026-11-03T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'extend', { scope: 'group', id: 'g1', phase: 'understand', due_date: '2026-11-05', due_time: '15:00' });
  const s = await teach(store, 'summary');
  assert.deepEqual(s.groups.find((g) => g.id === 'g1').open, ['understand']);
  assert.deepEqual(s.groups.find((g) => g.id === 'g2').open, ['understand', 'sketch']);
  await assert.rejects(teach(store, 'extend', { scope: 'group', id: 'g9', phase: 'understand', due_date: '2026-11-05' }), { code: 'not_found' });
});

test('confirm sets the group question or idea and clears the wait', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor({ ...CONFIG(), decider: 'teacher' });
  for (const n of [1, 2]) await act(store, n, 'claim', { initials: INITIALS[n] });
  const s = await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we a?'], star: '', stretch: '' } });
  for (const n of [1, 2]) await act(store, n, 'submit', { phase: 'understand', payload: { notes: [`How might we ${n}?`], star: s.notes[0].id, stretch: '' } });
  const board = await teach(store, 'board', { group_id: 'g1' });
  assert.equal(board.awaiting.kind, 'question');
  assert.equal(board.notes[0].name, 'Ann Bell');
  await teach(store, 'confirm', { group_id: 'g1', kind: 'question', id: board.notes[1].id });
  const after = await act(store, 2, 'status');
  assert.equal(after.question.text, board.notes[1].text);
  assert.equal(after.awaiting, null);
});

test('spotlight puts one answer up with no name; clear takes it down', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await act(store, 1, 'claim', { initials: INITIALS[1] });
  await act(store, 1, 'save', { phase: 'understand', payload: { notes: ['How might we make ash talk?'], star: '', stretch: '' } });
  await teach(store, 'spotlight', { student_id: 'st_ann', phase: 'understand', field: 'notes.0' });
  const s = await act(store, 1, 'status');
  assert.deepEqual(s.spotlight, { text: 'How might we make ash talk?', label: 'One idea from the class' });
  await teach(store, 'spotlight', { clear: true });
  assert.equal((await act(store, 1, 'status')).spotlight, null);
});

test('move takes a student to another group in the config and the draft', async () => {
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  const store = storeFor();
  await teach(store, 'move', { student_id: 'st_ann', group_id: 'g2' });
  assert.deepEqual(store.data.get(sprintKeys('sp1').config).groups.map((g) => g.students), [['st_cy'], ['st_ed', 'st_gus', 'st_ann']]);
  assert.deepEqual(store.data.get(draftLessonKey('sp1')).sprint.groups.map((g) => g.students), [['st_cy'], ['st_ed', 'st_gus', 'st_ann']]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/sprint-teacher.test.js`
Expected: FAIL, `sprintTeacherAction` is not exported.

- [ ] **Step 3: Add the spotlight to the student view**

`studentView` must show the spotlight. In `studentView`, before `return view;`, add:

```js
  const stage = (await read(store, k.stage)) ?? {};
  view.spotlight = stage.spotlight ?? null;
```

- [ ] **Step 4: Append the teacher actions**

```js
// ---------------------------------------------------------------------------
// Teacher side: the progress map, a group's board and the class controls.
// Names show here only; anything put up for students goes through stage, nameless.
// ---------------------------------------------------------------------------

const TEACHER_ACTIONS = ['summary', 'board', 'end_class', 'unlock', 'extend', 'confirm', 'spotlight', 'move', 'run', 'round', 'moderate'];

async function teacherContext(store, lessonId) {
  const { config } = await loadSprint(store, lessonId);
  const k = sprintKeys(lessonId);
  const lockRec = await endDueClassParts(store, lessonId, config);
  const extend = (await read(store, k.extend)) ?? {};
  const roster = await loadRoster(store, config.class_id);
  const byId = new Map(list(roster?.students).map((s) => [s.id, s]));
  return { config, k, lockRec, extend, byId };
}

async function teacherSummary(store, lessonId) {
  const { config, k, lockRec, extend, byId } = await teacherContext(store, lessonId);
  const now = clock();
  const groups = [];
  for (const g of config.groups) {
    const state = await resolveGroup(store, lessonId, config, g, await groupState(store, k, g.id), lockRec, extend, now);
    const open = openPhases(groupPhases(config, extend, g.id), factsFor(g, state, lockRec), now);
    const students = await Promise.all(g.students.map(async (id) => {
      const owner = ownerOf(config.class_id, id);
      const phases = {};
      for (const key of PHASES) {
        const sub = await read(store, k.sub(owner, key));
        phases[key] = !sub ? 'none' : !sub.submitted_at ? 'draft' : sub.late ? 'late' : 'in';
      }
      // Who has opened each phase: End class part uses it to say who was there.
      const seen = (await read(store, k.seen(owner))) ?? {};
      const opened = Object.fromEntries(PHASES.map((key) => [key, !!seen[key]]));
      return { id, initials: byId.get(id)?.initials ?? '–', name: byId.get(id)?.name ?? 'Removed student', phases, opened };
    }));
    groups.push({ id: g.id, name: g.name, students, open, awaiting: state.awaiting ?? null, chosen: !!state.chosen, question: state.question?.text ?? null });
  }
  const classParts = Object.fromEntries(config.phases.filter((p) => p.where === 'class').map((p) => [p.key, lockRec.ended[p.key] ? 'ended' : 'open']));
  const lock = lockRec.lock && Date.parse(lockRec.lock.until) > now ? lockRec.lock : null;
  const stage = (await read(store, k.stage)) ?? {};
  return { groups, class_parts: classParts, ended: lockRec.ended, lock, extend, running: stage.running ?? null, spotlight: stage.spotlight ?? null };
}

async function teacherBoard(store, lessonId, groupId) {
  const { config, k, lockRec, extend, byId } = await teacherContext(store, lessonId);
  const g = config.groups.find((x) => x.id === groupId);
  if (!g) reject(404, 'not_found', 'That group is gone.');
  const state = await resolveGroup(store, lessonId, config, g, await groupState(store, k, g.id), lockRec, extend, clock());
  const name = (id) => byId.get(id)?.name ?? 'Removed student';
  const notes = (await groupNotes(store, lessonId, config, g)).map((n) => ({ id: n.id, text: n.text, name: name(n.student), student_id: n.student, index: n.index }));
  const gallery = (await groupGallery(store, lessonId, config, g, state.votes_closed_at)).map((set) => ({ id: set.id, name: name(set.student), student_id: set.student, ideas: set.ideas }));
  const decide = await groupSubs(store, lessonId, config, g, 'decide');
  const t = tally(decide.map(({ sub }) => sub?.payload?.votes ?? {}), config.criteria, gallery.flatMap((s) => s.ideas.map((i) => i.id)));
  const subs = {};
  for (const key of ['prototype', 'test']) {
    subs[key] = (await groupSubs(store, lessonId, config, g, key)).map(({ student, sub }) => ({ student_id: student, name: name(student), sub }));
  }
  const reasons = decide.map(({ student, sub }) => ({ name: name(student), votes: sub?.payload?.votes ?? {}, reasons: sub?.payload?.reasons ?? {} }));
  const round = (await read(store, k.round(g.id))) ?? null;
  return {
    group: { id: g.id, name: g.name },
    awaiting: state.awaiting ?? null,
    question: state.question ?? null,
    chosen: state.chosen ?? null,
    notes,
    gallery,
    totals: t.totals,
    heat: heatLevels(t.counts, config.criteria),
    reasons,
    parts: list(state.parts).map((p) => ({ ...p, by: list(state.claims[p.id]).map(name) })),
    pitch: state.pitch ? { ...state.pitch, by: name(state.pitch.by) } : null,
    subs,
    round: round ? { ...round, entries: Object.entries(round.entries ?? {}).map(([student, e]) => ({ student_id: student, name: name(student), ...e })) } : null
  };
}

/** "notes.0", "cards.1.idea", "reasons.c1", "text": one text field from a submission. */
function fieldText(payload, field) {
  if (typeof field !== 'string' || !/^[a-z_]+(\.[a-z0-9_]+){0,2}$/.test(field)) return null;
  let value = payload;
  for (const part of field.split('.')) value = value?.[/^\d+$/.test(part) ? Number(part) : part];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Moves a student in the published config and in the draft (against its etag, so a save in another tab wins and the move retries). */
async function moveStudent(store, lessonId, config, studentId, groupId) {
  const k = sprintKeys(lessonId);
  if (!config.groups.some((g) => g.id === groupId)) reject(404, 'not_found', 'That group is gone.');
  const shift = (groups) => groups.map((g) => {
    const others = list(g.students).filter((s) => s !== studentId);
    return { ...g, students: g.id === groupId ? [...others, studentId] : others };
  });
  await store.setJSON(k.config, { ...config, groups: shift(config.groups) });
  for (let i = 0; i < 3; i += 1) {
    const row = await store.getWithMetadata(draftLessonKey(lessonId), { type: 'json', consistency: 'strong' });
    if (!row?.data?.sprint) return;
    const written = await store.setJSON(draftLessonKey(lessonId), { ...row.data, sprint: { ...row.data.sprint, groups: shift(row.data.sprint.groups) }, updated_at: iso(clock()) }, { onlyIfMatch: row.etag });
    if (written?.modified !== false) return;
  }
  reject(409, 'changed', 'The lesson changed in another tab. Try again.');
}

export async function sprintTeacherAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  const action = body.action ?? 'summary';
  if (!TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'summary') return teacherSummary(store, lessonId);
  if (action === 'board') return teacherBoard(store, lessonId, body.group_id);
  const { config, k, extend } = await teacherContext(store, lessonId);
  const now = clock();

  if (action === 'end_class') {
    const p = config.phases.find((x) => x.key === body.phase);
    if (!p || p.where !== 'class') reject(400, 'not_class', 'Only class phases have a class part to end.');
    await endClassPart(store, lessonId, config, p.key, now);
  }
  if (action === 'unlock') {
    const rec = { ...emptyLock(), ...((await read(store, k.lock)) ?? {}) };
    if (rec.lock && typeof body.student_id === 'string') await store.setJSON(k.lock, { ...rec, lock: { ...rec.lock, unlocked: [...new Set([...rec.lock.unlocked, body.student_id])] } });
  }
  if (action === 'extend') {
    if (!PHASES.includes(body.phase) || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date ?? '')) reject(400, 'bad_date', 'Pick a phase and a date.');
    const time = /^\d{2}:\d{2}$/.test(body.due_time ?? '') ? body.due_time : '15:00';
    const scope = body.scope;
    if (scope === 'group' && !config.groups.some((g) => g.id === body.id)) reject(404, 'not_found', 'That group is gone.');
    if (scope === 'student' && !config.groups.some((g) => g.students.includes(body.id))) reject(404, 'not_found', 'That student isn’t in this sprint.');
    if (!['class', 'group', 'student'].includes(scope)) reject(400, 'bad_scope', 'Pick the class, a group or a student.');
    const next = { class: {}, group: {}, student: {}, ...extend };
    const over = { due_date: body.due_date, due_time: time };
    if (scope === 'class') next.class = { ...next.class, [body.phase]: over };
    else next[scope] = { ...next[scope], [body.id]: { ...(next[scope][body.id] ?? {}), [body.phase]: over } };
    await store.setJSON(k.extend, next);
  }
  if (action === 'confirm') {
    const g = config.groups.find((x) => x.id === body.group_id);
    if (!g) reject(404, 'not_found', 'That group is gone.');
    const state = await groupState(store, k, g.id);
    if (body.kind === 'question') {
      const note = (await groupNotes(store, lessonId, config, g)).find((n) => n.id === body.id);
      if (!note) reject(404, 'not_found', 'That question is gone.');
      await store.setJSON(k.group(g.id), { ...state, question: { id: note.id, text: note.text }, awaiting: null });
    } else if (body.kind === 'idea') {
      const ideas = (await groupGallery(store, lessonId, config, g, state.votes_closed_at)).flatMap((s) => s.ideas);
      if (!ideas.some((i) => i.id === body.id)) reject(404, 'not_found', 'That idea is gone.');
      await store.setJSON(k.group(g.id), { ...state, chosen: body.id, awaiting: null, votes_closed_at: state.votes_closed_at ?? iso(now) });
    } else reject(400, 'bad_kind', 'Confirm a question or an idea.');
  }
  if (action === 'spotlight') {
    const stage = (await read(store, k.stage)) ?? {};
    if (body.clear) await store.setJSON(k.stage, { ...stage, spotlight: null });
    else {
      if (!PHASES.includes(body.phase) || !config.groups.some((g) => g.students.includes(body.student_id))) reject(400, 'bad_spotlight', 'That answer is gone.');
      const sub = await read(store, k.sub(ownerOf(config.class_id, body.student_id), body.phase));
      const text = fieldText(sub?.payload, body.field);
      if (!text) reject(404, 'not_found', 'That answer is gone.');
      await store.setJSON(k.stage, { ...stage, spotlight: { text, label: 'One idea from the class' } });
    }
  }
  if (action === 'move') await moveStudent(store, lessonId, config, body.student_id, body.group_id);
  if (action === 'run' || action === 'round' || action === 'moderate') await roundAction(store, lessonId, config, action, body);
  return teacherSummary(store, lessonId);
}
```

Add a stub for `roundAction` at the end of the file (Task 8 replaces it):

```js
async function roundAction() { reject(400, 'bad_action', 'Unknown action.'); }
```

- [ ] **Step 5: Write the teacher endpoint**

```js
// netlify/functions/sprint.mjs: the teacher side of a design sprint (map, board, class controls, rounds).
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { sprintTeacherAction, SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/sprint' };
export function createSprintHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const match = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/sprint$/);
    try {
      const result = await sprintTeacherAction(store, match?.[1], await request.json());
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSprintHandler();
```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/unit/sprint-teacher.test.js tests/unit/sprint-decide.test.js tests/unit/sprint-student.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/sprint.mjs netlify/functions/sprint.mjs tests/unit/sprint-teacher.test.js
git commit -m "Teaching sprint: teacher map, board, end class, extend, confirm, spotlight, move"
```

---

### Task 8: Pitch feedback rounds with moderation

**Files:**
- Modify: `netlify/functions/_shared/sprint.mjs` (replace the `giveFeedback`, `withRound` and `roundAction` stubs)
- Test: `tests/unit/sprint-rounds.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/sprint-rounds.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, sprintTeacherAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const teach = (store, action, extra = {}) => sprintTeacherAction(store, 'sp1', { action, ...extra });
const entry = (over = {}) => ({ levels: { c1: 3, c2: 2 }, worked: 'The graffiti made it feel real.', next: 'Try naming the source on the panel.', about: 'c1', ...over });

async function ready() {
  setSprintClock(() => Date.parse('2026-11-11T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2, 3, 4]) await act(store, n, 'claim', { initials: INITIALS[n] });
  return store;
}

test('an open round gives everyone outside the presenting group a feedback card', async () => {
  const store = await ready();
  await teach(store, 'run', { group_id: 'g1' });
  await teach(store, 'round', { group_id: 'g1', op: 'open' });
  const ed = await act(store, 3, 'status');
  assert.deepEqual(ed.round, { group_id: 'g1', group_name: 'Kestrel', sent: false });
  const ann = await act(store, 1, 'status');
  assert.equal(ann.round, null);
  await assert.rejects(act(store, 1, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'own_group' });
});

test('feedback is saved once per student, flagged text is held until released', async () => {
  const store = await ready();
  await teach(store, 'round', { group_id: 'g1', op: 'open' });
  const sent = await act(store, 3, 'feedback', { group_id: 'g1', entry: entry() });
  assert.equal(sent.round.sent, true);
  await act(store, 4, 'feedback', { group_id: 'g1', entry: entry({ worked: 'This is shit honestly but ok.' }) });
  await teach(store, 'round', { group_id: 'g1', op: 'close' });
  await assert.rejects(act(store, 3, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'round_closed' });
  await teach(store, 'round', { group_id: 'g1', op: 'release' });
  const ann = await act(store, 1, 'status');
  assert.equal(ann.received.lines.length, 1);
  assert.deepEqual(ann.received.levels.c1, [0, 0, 1]);
  assert.equal(JSON.stringify(ann.received).match(/st_|Ed|Gus/), null);
  const board = await teach(store, 'board', { group_id: 'g1' });
  const held = board.round.entries.find((e) => e.flagged);
  assert.equal(held.name, 'Gus Hale');
  await teach(store, 'moderate', { group_id: 'g1', student_id: 'st_gus', status: 'released' });
  assert.equal((await act(store, 1, 'status')).received.lines.length, 2);
});

test('feedback for a group with no open round is refused', async () => {
  const store = await ready();
  await assert.rejects(act(store, 3, 'feedback', { group_id: 'g1', entry: entry() }), { code: 'round_closed' });
});
```

The word in the flagged line must be one `flagText` in `peer-feedback-filter.mjs` catches. If it isn't, swap in a word from that file's list.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/sprint-rounds.test.js`
Expected: FAIL, `run` rejects with `bad_action`.

- [ ] **Step 3: Replace the three stubs**

Add to the imports: `import { flagText } from './peer-feedback-filter.mjs';` and add `FeedbackEntrySchema` to the `sprint-schema.mjs` import. Then replace `giveFeedback`, `withRound` and `roundAction` with:

```js
/** Feedback on the presenting group: once per student, while the round is open, never on your own group. */
async function giveFeedback(store, lessonId, config, group, sid, body) {
  const k = sprintKeys(lessonId);
  const target = config.groups.find((g) => g.id === body.group_id);
  if (!target) reject(404, 'not_found', 'That group is gone.');
  if (target.id === group.id) reject(400, 'own_group', 'Your group is presenting. Listen to the feedback.');
  const round = await read(store, k.round(target.id));
  if (round?.status !== 'open') reject(409, 'round_closed', 'Feedback for this group has closed.');
  const parsed = FeedbackEntrySchema.safeParse(body.entry);
  if (!parsed.success) reject(400, 'bad_feedback', parsed.error.issues[0]?.message ?? 'Check your feedback.');
  const e = parsed.data;
  const levels = Object.fromEntries(Object.entries(e.levels).filter(([c]) => config.criteria.includes(c)));
  const flagged = flagText(e.worked) || flagText(e.next);
  const entries = { ...(round.entries ?? {}), [sid]: { levels, worked: e.worked, next: e.next, about: config.criteria.includes(e.about) ? e.about : '', flagged, status: flagged ? 'held' : 'ok', at: iso(clock()) } };
  await store.setJSON(k.round(target.id), { ...round, entries });
}

/** Adds the running round's card, the group's released feedback and the spotlight to a student view. */
async function withRound(store, lessonId, config, group, sid, view) {
  const k = sprintKeys(lessonId);
  const stage = (await read(store, k.stage)) ?? {};
  let round = null;
  for (const g of config.groups) {
    if (g.id === group.id) continue;
    const r = await read(store, k.round(g.id));
    if (r?.status === 'open') { round = { group_id: g.id, group_name: g.name, sent: !!r.entries?.[sid] }; break; }
  }
  const own = await read(store, k.round(group.id));
  let received = null;
  if (own?.status === 'released') {
    const shown = Object.values(own.entries ?? {}).filter((e) => e.status === 'ok' || e.status === 'released');
    const levels = Object.fromEntries(config.criteria.map((c) => [c, [1, 2, 3].map((lv) => shown.filter((e) => e.levels[c] === lv).length)]));
    received = { levels, lines: shown.map((e) => ({ worked: e.worked, next: e.next, about: e.about })) };
  }
  return { ...view, round, received, running: stage.running ?? null };
}

/** run: who is pitching now. round: open, close or release a group's feedback. moderate: release or remove one entry. */
async function roundAction(store, lessonId, config, action, body) {
  const k = sprintKeys(lessonId);
  if (action === 'run') {
    if (body.group_id !== null && !config.groups.some((g) => g.id === body.group_id)) reject(404, 'not_found', 'That group is gone.');
    const stage = (await read(store, k.stage)) ?? {};
    await store.setJSON(k.stage, { ...stage, running: body.group_id });
    return;
  }
  const g = config.groups.find((x) => x.id === body.group_id);
  if (!g) reject(404, 'not_found', 'That group is gone.');
  const round = (await read(store, k.round(g.id))) ?? { status: 'closed', entries: {} };
  if (action === 'round') {
    const now = iso(clock());
    if (body.op === 'open') {
      // One round at a time: opening this one closes any other.
      for (const other of config.groups) {
        if (other.id === g.id) continue;
        const r = await read(store, k.round(other.id));
        if (r?.status === 'open') await store.setJSON(k.round(other.id), { ...r, status: 'closed', closed_at: now });
      }
      await store.setJSON(k.round(g.id), { ...round, status: 'open', opened_at: now });
    } else if (body.op === 'close') await store.setJSON(k.round(g.id), { ...round, status: 'closed', closed_at: now });
    else if (body.op === 'release') await store.setJSON(k.round(g.id), { ...round, status: 'released' });
    else reject(400, 'bad_op', 'Open, close or release.');
  }
  if (action === 'moderate') {
    const e = round.entries?.[body.student_id];
    if (!e || !['released', 'removed'].includes(body.status)) reject(404, 'not_found', 'That feedback is gone.');
    await store.setJSON(k.round(g.id), { ...round, entries: { ...round.entries, [body.student_id]: { ...e, status: body.status } } });
  }
}
```

`studentView` already sets `view.spotlight` (Task 7). `withRound` adds `round`, `received` and `running`.

- [ ] **Step 4: Run all the sprint server tests**

Run: `node --test tests/unit/sprint-rounds.test.js tests/unit/sprint-teacher.test.js tests/unit/sprint-decide.test.js tests/unit/sprint-student.test.js tests/unit/sprint-publish.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/sprint.mjs tests/unit/sprint-rounds.test.js
git commit -m "Teaching sprint: pitch feedback rounds with hold-and-release"
```

---

### Task 9: Student uploads and file reads

**Files:**
- Create: `netlify/functions/_shared/sprint-files.mjs`
- Create: `netlify/functions/published-sprint-file.mjs`
- Create: `netlify/functions/sprint-file.mjs`
- Modify: `netlify/functions/_shared/sprint.mjs` (replace the `checkOwnFiles` stub)
- Modify: `apps/teaching/scripts/mock-api.ts` (four handlers)
- Test: `tests/unit/sprint-files.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/sprint-files.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sprintAction, setSprintClock } from '../../netlify/functions/_shared/sprint.mjs';
import { uploadSprintFile, readSprintFile, teacherSprintFile } from '../../netlify/functions/_shared/sprint-files.mjs';
import { storeFor, who, INITIALS } from './helpers/sprint-store.js';

const act = (store, n, action, extra = {}) => sprintAction(store, 'sp1', { action, ...who(n), ...extra });
const pdf = (bytes = 10) => new File([new Uint8Array(bytes)], 'panel.pdf', { type: 'application/pdf' });
const form = (n, phase, file) => { const f = new FormData(); f.set('class_id', 'class1'); f.set('class_token', who(n).class_token); f.set('phase', phase); f.set('file', file); return f; };

async function atPrototype() {
  setSprintClock(() => Date.parse('2026-11-07T00:00:00Z'));
  const store = storeFor();
  for (const n of [1, 2, 3]) await act(store, n, 'claim', { initials: INITIALS[n] });
  return store;
}

test('a student uploads into an open phase; their group can read it, another group can’t', async () => {
  const store = await atPrototype();
  const up = await uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf()));
  assert.equal(up.name, 'panel.pdf');
  const mate = await readSprintFile(store, 'sp1', { action: 'get', ...who(2), file_id: up.id });
  assert.equal(mate.mime, 'application/pdf');
  assert.equal(mate.bytes.byteLength, 10);
  await assert.rejects(readSprintFile(store, 'sp1', { action: 'get', ...who(3), file_id: up.id }), { code: 'not_found' });
  const teacher = await teacherSprintFile(store, 'sp1', { file_id: up.id });
  assert.equal(teacher.name, 'panel.pdf');
});

test('uploads are PDF or picture, 5 MB at most, only into an open Sketch or Prototype', async () => {
  const store = await atPrototype();
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', new File(['x'], 'a.zip', { type: 'application/zip' }))), { code: 'bad_type' });
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf(5 * 1024 * 1024 + 1))), { code: 'too_large' });
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'test', pdf())), { code: 'bad_phase' });
  setSprintClock(() => Date.parse('2026-11-01T00:00:00Z'));
  await assert.rejects(uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf())), { code: 'not_open' });
});

test('a payload may only name the student’s own files', async () => {
  const store = await atPrototype();
  const up = await uploadSprintFile(store, 'sp1', form(1, 'prototype', pdf()));
  await act(store, 1, 'save', { phase: 'prototype', payload: { files: [up.id] } });
  await assert.rejects(act(store, 2, 'save', { phase: 'prototype', payload: { files: [up.id] } }), { code: 'bad_file' });
  const pitched = await act(store, 1, 'pitch', { file_id: up.id });
  assert.equal(pitched.pitch.name, 'panel.pdf');
});
```

`atPrototype` sets the clock after the Decide deadline (6 Nov), so Prototype is open by the deadline rule.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/sprint-files.test.js`
Expected: FAIL, cannot find `sprint-files.mjs`.

- [ ] **Step 3: Write `netlify/functions/_shared/sprint-files.mjs`**

```js
/**
 * Student files for a sprint: sketches and prototype parts. Kept under the
 * sprint, apart from the teacher's media library. A student may read their
 * own files and their group's; the teacher reads any. Fetched by POST so the
 * class token never sits in a URL.
 */
import { randomBytes } from 'node:crypto';
import { read, reject } from './question-drop.mjs';
import { identify } from './quiz.mjs';
import { sprintAction, ownerOf } from './sprint.mjs';
import { sprintKeys } from './sprint-keys.mjs';
import { listBlobKeys } from './blobs-list.mjs';

export const SPRINT_FILE_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
export const SPRINT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 6;

/** The student's sprint view, through the same identity and group rules as every sprint action. */
async function studentFor(store, lessonId, fields) {
  const view = await sprintAction(store, lessonId, { action: 'status', class_id: fields.class_id, class_token: fields.class_token });
  if (!view.group) reject(403, view.not_for_you ? 'not_for_you' : 'need_initials', view.not_for_you ? 'This sprint isn’t set for you.' : 'Type your initials first.');
  return view;
}

/** The claimed student's id for these class fields. */
async function studentIdFor(store, fields) {
  const who = await identify(store, { class_id: fields.class_id, class_token: fields.class_token }, 'status');
  if (!who.student) reject(403, 'need_initials', 'Type your initials first.');
  return who.student.id;
}

export async function uploadSprintFile(store, lessonId, form) {
  const fields = { class_id: form.get('class_id'), class_token: form.get('class_token') };
  const phase = form.get('phase');
  const file = form.get('file');
  if (phase !== 'sketch' && phase !== 'prototype') reject(400, 'bad_phase', 'Files go with Sketch or Prototype.');
  if (!(file instanceof File)) reject(400, 'no_file', 'Pick a file.');
  if (!SPRINT_FILE_MIME.has(file.type)) reject(400, 'bad_type', 'Upload a PDF or a picture (PNG, JPG or WEBP).');
  if (file.size > SPRINT_FILE_BYTES) reject(413, 'too_large', 'That file is over 5 MB. Save a smaller copy or add a link.');
  const view = await studentFor(store, lessonId, fields);
  if (view.lock) reject(423, 'locked', 'The sprint is locked for now. It opens again soon.');
  if (!view.phases.find((p) => p.key === phase)?.open) reject(409, 'not_open', 'This phase hasn’t opened yet.');
  const config = await read(store, sprintKeys(lessonId).config);
  const studentId = await studentIdFor(store, fields);
  const owner = ownerOf(config.class_id, studentId);
  const k = sprintKeys(lessonId);
  if ((await listBlobKeys(store, k.fileMetaPrefix(owner))).length >= MAX_FILES) reject(429, 'too_many', 'You’ve uploaded 6 files. Use a link for more.');
  const id = randomBytes(8).toString('hex');
  await store.set(k.file(owner, id), await file.arrayBuffer(), { metadata: { contentType: file.type } });
  const meta = { name: file.name.slice(0, 120), mime: file.type, size: file.size, at: new Date().toISOString(), phase };
  await store.setJSON(k.fileMeta(owner, id), meta);
  await store.setJSON(k.fileOwner(id), { owner, student: studentId });
  return { id, ...meta };
}

async function fileRecord(store, lessonId, fileId) {
  if (typeof fileId !== 'string' || !/^[a-f0-9]{16}$/.test(fileId)) reject(404, 'not_found', 'That file has gone.');
  const k = sprintKeys(lessonId);
  const index = await read(store, k.fileOwner(fileId));
  if (!index) reject(404, 'not_found', 'That file has gone.');
  const meta = await read(store, k.fileMeta(index.owner, fileId));
  const blob = await store.get(k.file(index.owner, fileId), { type: 'arrayBuffer', consistency: 'strong' });
  // The real store returns the ArrayBuffer; the test store keeps { bytes, metadata }.
  const bytes = blob?.bytes ?? blob;
  if (!meta || !bytes) reject(404, 'not_found', 'That file has gone.');
  return { ...meta, bytes, student: index.student };
}

/** A student reads a file of their own or their group's. */
export async function readSprintFile(store, lessonId, body) {
  await studentFor(store, lessonId, body);
  const config = await read(store, sprintKeys(lessonId).config);
  const me = await studentIdFor(store, body);
  const file = await fileRecord(store, lessonId, body.file_id);
  const group = config.groups.find((g) => g.students.includes(me));
  if (!group?.students.includes(file.student)) reject(404, 'not_found', 'That file has gone.');
  return file;
}

export async function teacherSprintFile(store, lessonId, body) {
  return fileRecord(store, lessonId, body.file_id);
}
```

- [ ] **Step 4: Replace the `checkOwnFiles` stub in `sprint.mjs`**

`sprint-files.mjs` imports `sprint.mjs`, so `sprint.mjs` must not import `sprint-files.mjs` at the top (that would be a cycle). Read the owner index directly instead:

```js
/** Files named in a payload must be the student's own. */
async function checkOwnFiles(store, lessonId, owner, phase, payload) {
  const ids = phase === 'prototype' ? payload.files : phase === 'sketch' ? payload.cards.map((c) => c.file).filter(Boolean) : [];
  const k = sprintKeys(lessonId);
  for (const id of ids) {
    const index = await read(store, k.fileOwner(id));
    if (index?.owner !== owner) reject(400, 'bad_file', 'That file has gone. Upload it again.');
  }
}
```


- [ ] **Step 5: Write the two file endpoints**

```js
// netlify/functions/published-sprint-file.mjs: students upload (multipart) and read (JSON, returns bytes) sprint files.
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { uploadSprintFile, readSprintFile, SPRINT_FILE_BYTES } from './_shared/sprint-files.mjs';
import { SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/sprint-file/:id', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 120, windowSize: 60 } };
export function createPublishedSprintFileHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    if (Number(request.headers.get('content-length')) > SPRINT_FILE_BYTES + 64 * 1024) return withCors(errorResponse(413, 'too_large', 'That file is over 5 MB. Save a smaller copy or add a link.', false), request, env);
    const lessonId = new URL(request.url).pathname.match(/\/published\/sprint-file\/([^/]+)$/)?.[1];
    try {
      if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
        return withCors(okResponse(200, await uploadSprintFile(store, lessonId, await request.formData()), { 'cache-control': 'no-store' }), request, env);
      }
      const file = await readSprintFile(store, lessonId, JSON.parse(await request.text()));
      return withCors(new Response(file.bytes, { status: 200, headers: { 'content-type': file.mime, 'cache-control': 'private, no-store', 'content-disposition': `inline; filename="${encodeURIComponent(file.name)}"` } }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedSprintFileHandler();
```

```js
// netlify/functions/sprint-file.mjs: the teacher reads any file in a sprint.
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { teacherSprintFile } from './_shared/sprint-files.mjs';
import { SprintError } from './_shared/sprint.mjs';
import { errorResponse, guardRequestOrigin, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/lessons/:id/sprint-file' };
export function createSprintFileHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const originError = guardRequestOrigin(request, env);
    if (originError) return withCors(originError, request, env);
    const lessonId = new URL(request.url).pathname.match(/\/lessons\/([^/]+)\/sprint-file$/)?.[1];
    try {
      const file = await teacherSprintFile(store, lessonId, await request.json());
      return withCors(new Response(file.bytes, { status: 200, headers: { 'content-type': file.mime, 'cache-control': 'private, no-store' } }), request, env);
    } catch (e) {
      if (e instanceof SprintError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createSprintFileHandler();
```

`errorResponse` returns a Response, so `withCors` wraps it the same way as in `published-tutorial.mjs`.

- [ ] **Step 6: Wire the mock API for the dev server**

In `apps/teaching/scripts/mock-api.ts`, import beside the tutorial handlers:

```ts
import { createPublishedSprintHandler } from '../../../netlify/functions/published-sprint.mjs';
import { createSprintHandler } from '../../../netlify/functions/sprint.mjs';
import { createPublishedSprintFileHandler } from '../../../netlify/functions/published-sprint-file.mjs';
import { createSprintFileHandler } from '../../../netlify/functions/sprint-file.mjs';
```

and add four branches to the handler chain, right after the two tutorial branches:

```ts
      : /^\/api\/lessons\/[^/]+\/sprint$/.test(path)
        ? createSprintHandler(deps)
      : /^\/api\/lessons\/[^/]+\/sprint-file$/.test(path)
        ? createSprintFileHandler(deps)
      : path.startsWith('/api/published/sprint-file/')
        ? createPublishedSprintFileHandler(deps)
      : path.startsWith('/api/published/sprint/')
        ? createPublishedSprintHandler(deps)
```

The `sprint-file` branches come before `sprint/`, because `/api/published/sprint-file/` also starts with `/api/published/sprint`.

- [ ] **Step 7: Run all sprint server tests and the route test**

Run: `node --test tests/unit/sprint-files.test.js tests/unit/sprint-rounds.test.js tests/unit/sprint-teacher.test.js tests/unit/sprint-decide.test.js tests/unit/sprint-student.test.js tests/unit/sprint-publish.test.js`
Expected: PASS.
Run: `node --test tests/unit/public-student-routes.test.js` (if that file exists; otherwise `grep -l PUBLIC_STUDENT_API_ROUTES tests/unit/*.js` and run what it finds)
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions/_shared/sprint-files.mjs netlify/functions/_shared/sprint.mjs netlify/functions/published-sprint-file.mjs netlify/functions/sprint-file.mjs apps/teaching/scripts/mock-api.ts tests/unit/sprint-files.test.js
git commit -m "Teaching sprint: student uploads and file reads"
```

---
## Phase 3: browser, student side

### Task 10: Client API

**Files:**
- Create: `apps/teaching/src/sprint/api.ts`
- Test: `apps/teaching/tests/unit/sprint-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-api.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sprintClient, sprintTeacherApi } from '@/sprint/api';

afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('sprint api', () => {
  it('posts student actions with the class fields', async () => {
    const fetch = vi.fn(async () => ok({ identity: { need: null, initials: 'AB' }, group: null }));
    vi.stubGlobal('fetch', fetch);
    await sprintClient('sp1', 'class1').save('sketch', { cards: [], strongest: '', strongest_why: '' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/published\/sprint\/sp1$/);
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'save', phase: 'sketch', class_id: 'class1' });
  });

  it('uploads as multipart and reads files as blobs, with no token in the URL', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) =>
      init.body instanceof FormData ? ok({ id: 'aaaaaaaaaaaaaaaa', name: 'a.pdf', mime: 'application/pdf', size: 1, at: 'x', phase: 'prototype' }) : new Response(new Blob(['%PDF']), { status: 200, headers: { 'content-type': 'application/pdf' } })
    );
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x' }));
    const c = sprintClient('sp1', 'class1');
    const up = await c.upload('prototype', new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(up.id).toBe('aaaaaaaaaaaaaaaa');
    expect(await c.fileUrl(up.id)).toBe('blob:x');
    for (const [url] of fetch.mock.calls as unknown as [string][]) expect(url).not.toMatch(/token/);
  });

  it('posts teacher actions to the lesson', async () => {
    const fetch = vi.fn(async () => ok({ groups: [] }));
    vi.stubGlobal('fetch', fetch);
    await sprintTeacherApi('sp1').endClass('decide');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/lessons\/sp1\/sprint$/);
    expect(JSON.parse(String(init.body))).toEqual({ action: 'end_class', phase: 'decide' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-api.test.ts`
Expected: FAIL, cannot resolve `@/sprint/api`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/api.ts`**

```ts
import { apiPost, ApiClientError } from '@/api/client';
import { getApiBaseUrl } from '@/api/config';
import { deviceToken } from '@/quiz/dom';
import type { FeedbackEntry, Level, Part, PhasePayload, SprintPhaseKey } from './schema';

// ---------------------------------------------------------------- student

export type PhaseRow = {
  key: SprintPhaseKey; open: boolean; due_date: string; due_time: string;
  state: 'none' | 'draft' | 'in'; late: boolean; frozen: boolean; closed: boolean; count_in: number;
};
export type GalleryIdea = { id: string; index?: number; title: string; idea: string; answers: string; evidence: string; file: string | null; strongest: boolean };
export type GallerySet = { id: string; ideas: GalleryIdea[] };
export type HeatLevel = 0 | 1 | 2 | 3;
export type SprintStatus = {
  identity: { need: 'class' | 'initials' | null; initials: string | null };
  anonymous?: boolean;
  not_for_you?: boolean;
  group: { id: string; name: string; size: number; mates: string[] } | null;
  phases?: PhaseRow[];
  lock?: { until: string } | null;
  mine?: Partial<PhasePayload>;
  notes?: Array<{ id: string; text: string; mine: boolean }>;
  question?: { text: string } | null;
  gallery?: GallerySet[] | null;
  heat?: Record<string, Record<string, HeatLevel>> | null;
  votes_closed?: boolean;
  chosen?: { id: string; title: string; idea: string } | null;
  awaiting?: { kind: 'question' | 'idea' } | null;
  parts?: Array<Part & { claimed: number; mine: boolean }>;
  pitch?: { kind: 'file' | 'link'; name: string; file: string | null; link: string } | null;
  spotlight?: { text: string; label: string } | null;
  round?: { group_id: string; group_name: string; sent: boolean } | null;
  received?: { levels: Record<string, [number, number, number]>; lines: Array<{ worked: string; next: string; about: string }> } | null;
  running?: string | null;
};
export type UploadedFile = { id: string; name: string; mime: string; size: number; at: string; phase: SprintPhaseKey };

export type SprintClient = {
  status(): Promise<SprintStatus>;
  claim(initials: string): Promise<SprintStatus>;
  open(phase: SprintPhaseKey): Promise<SprintStatus>;
  save<P extends SprintPhaseKey>(phase: P, payload: PhasePayload[P]): Promise<SprintStatus>;
  submit<P extends SprintPhaseKey>(phase: P, payload: PhasePayload[P]): Promise<SprintStatus>;
  parts(parts: Part[]): Promise<SprintStatus>;
  claimPart(partId: string): Promise<SprintStatus>;
  pitch(source: { file_id: string } | { link: string }): Promise<SprintStatus>;
  feedback(groupId: string, entry: FeedbackEntry): Promise<SprintStatus>;
  upload(phase: 'sketch' | 'prototype', file: File): Promise<UploadedFile>;
  /** An object URL for a file the student may read. */
  fileUrl(fileId: string): Promise<string>;
};

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { code: string; message: string } } | null;
  if (body?.ok) return body.data as T;
  throw new ApiClientError({ code: body?.error?.code ?? 'invalid_response', message: body?.error?.message ?? 'That didn’t work. Try again.' });
}

/** POST JSON and get bytes back as an object URL; errors come back as JSON. */
async function postForUrl(path: string, body: unknown): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || (response.headers.get('content-type') ?? '').includes('application/json')) return unwrap<string>(response);
  return URL.createObjectURL(await response.blob());
}

export function sprintClient(lessonId: string, classId: string): SprintClient {
  const endpoint = `/api/published/sprint/${encodeURIComponent(lessonId)}`;
  const fileEndpoint = `/api/published/sprint-file/${encodeURIComponent(lessonId)}`;
  const classToken = deviceToken(`class:${classId}`);
  const fields = { class_id: classId, ...(classToken ? { class_token: classToken } : {}) };
  const call = (action: string, extra: Record<string, unknown> = {}) => apiPost<SprintStatus>(endpoint, { action, ...fields, ...extra });
  return {
    status: () => call('status'),
    claim: (initials) => call('claim', { initials }),
    open: (phase) => call('open', { phase }),
    save: (phase, payload) => call('save', { phase, payload }),
    submit: (phase, payload) => call('submit', { phase, payload }),
    parts: (parts) => call('parts', { parts }),
    claimPart: (partId) => call('claim_part', { part_id: partId }),
    pitch: (source) => call('pitch', source),
    feedback: (groupId, entry) => call('feedback', { group_id: groupId, entry }),
    async upload(phase, file) {
      const form = new FormData();
      form.set('class_id', classId);
      if (classToken) form.set('class_token', classToken);
      form.set('phase', phase);
      form.set('file', file);
      return unwrap<UploadedFile>(await fetch(`${getApiBaseUrl()}${fileEndpoint}`, { method: 'POST', credentials: 'include', body: form }));
    },
    fileUrl: (fileId) => postForUrl(fileEndpoint, { action: 'get', ...fields, file_id: fileId })
  };
}

// ---------------------------------------------------------------- teacher

export type MapStudent = { id: string; initials: string; name: string; phases: Record<SprintPhaseKey, 'none' | 'draft' | 'in' | 'late'>; opened: Record<SprintPhaseKey, boolean> };
export type MapGroup = { id: string; name: string; students: MapStudent[]; open: SprintPhaseKey[]; awaiting: { kind: 'question' | 'idea'; tie: boolean; empty: boolean } | null; chosen: boolean; question: string | null };
export type SprintSummary = {
  groups: MapGroup[];
  class_parts: Partial<Record<SprintPhaseKey, 'open' | 'ended'>>;
  ended: Partial<Record<SprintPhaseKey, { at: string; present: string[] }>>;
  lock: { phase: SprintPhaseKey; until: string; unlocked: string[] } | null;
  extend: Record<string, unknown>;
  running: string | null;
  spotlight: { text: string; label: string } | null;
};
export type BoardSub = { student_id: string; name: string; sub: { payload: Record<string, unknown>; submitted_at?: string; late?: boolean } | null };
export type GroupBoard = {
  group: { id: string; name: string };
  awaiting: MapGroup['awaiting'];
  question: { id: string; text: string } | null;
  chosen: string | null;
  notes: Array<{ id: string; text: string; name: string; student_id: string; index: number }>;
  gallery: Array<{ id: string; name: string; student_id: string; ideas: GalleryIdea[] }>;
  totals: Record<string, number>;
  heat: Record<string, Record<string, HeatLevel>>;
  reasons: Array<{ name: string; votes: Record<string, string>; reasons: Record<string, string> }>;
  parts: Array<Part & { by: string[] }>;
  pitch: { kind: 'file' | 'link'; file?: string; link?: string; name?: string; by: string } | null;
  subs: { prototype: BoardSub[]; test: BoardSub[] };
  round: { status: 'open' | 'closed' | 'released'; entries: Array<{ student_id: string; name: string; levels: Record<string, Level>; worked: string; next: string; about: string; flagged: boolean; status: string }> } | null;
};

export type SprintTeacherApi = {
  summary(): Promise<SprintSummary>;
  board(groupId: string): Promise<GroupBoard>;
  endClass(phase: SprintPhaseKey): Promise<SprintSummary>;
  unlock(studentId: string): Promise<SprintSummary>;
  extend(input: { scope: 'class' | 'group' | 'student'; id?: string; phase: SprintPhaseKey; due_date: string; due_time: string }): Promise<SprintSummary>;
  confirm(groupId: string, kind: 'question' | 'idea', id: string): Promise<SprintSummary>;
  spotlight(studentId: string, phase: SprintPhaseKey, field: string): Promise<SprintSummary>;
  clearSpotlight(): Promise<SprintSummary>;
  move(studentId: string, groupId: string): Promise<SprintSummary>;
  run(groupId: string | null): Promise<SprintSummary>;
  round(groupId: string, op: 'open' | 'close' | 'release'): Promise<SprintSummary>;
  moderate(groupId: string, studentId: string, status: 'released' | 'removed'): Promise<SprintSummary>;
  fileUrl(fileId: string): Promise<string>;
};

export function sprintTeacherApi(lessonId: string): SprintTeacherApi {
  const path = `/api/lessons/${encodeURIComponent(lessonId)}/sprint`;
  const call = <T = SprintSummary>(action: string, extra: Record<string, unknown> = {}) => apiPost<T>(path, { action, ...extra });
  return {
    summary: () => call('summary'),
    board: (groupId) => call<GroupBoard>('board', { group_id: groupId }),
    endClass: (phase) => call('end_class', { phase }),
    unlock: (studentId) => call('unlock', { student_id: studentId }),
    extend: (input) => call('extend', input),
    confirm: (groupId, kind, id) => call('confirm', { group_id: groupId, kind, id }),
    spotlight: (studentId, phase, field) => call('spotlight', { student_id: studentId, phase, field }),
    clearSpotlight: () => call('spotlight', { clear: true }),
    move: (studentId, groupId) => call('move', { student_id: studentId, group_id: groupId }),
    run: (groupId) => call('run', { group_id: groupId }),
    round: (groupId, op) => call('round', { group_id: groupId, op }),
    moderate: (groupId, studentId, status) => call('moderate', { group_id: groupId, student_id: studentId, status }),
    fileUrl: (fileId) => postForUrl(`/api/lessons/${encodeURIComponent(lessonId)}/sprint-file`, { file_id: fileId })
  };
}
```

Check that `getApiBaseUrl` is exported from `apps/teaching/src/api/config.ts` (it is imported by `client.ts`). If it takes an argument, call it with no argument as `client.ts` does for the default.

- [ ] **Step 4: Run the test**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-api.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/sprint/api.ts apps/teaching/tests/unit/sprint-api.test.ts
git commit -m "Teaching sprint: student and teacher client"
```

---

### Task 11: Student player shell and the form kit

**Files:**
- Create: `apps/teaching/src/sprint/form-kit.ts`
- Create: `apps/teaching/src/sprint/player.ts`
- Create: `apps/teaching/src/sprint/sprint.css`
- Modify: `apps/teaching/src/student/lesson-view.ts` (`renderPublishedLesson`, beside the tutorial branch)
- Test: `apps/teaching/tests/unit/sprint-player.test.ts`

The player shows the chrome and hands the body to one phase form. Phase forms come in Tasks 12–14; this task registers a placeholder form per phase that Tasks 12–14 replace.

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-player.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountSprintPlayer } from '@/sprint/player';
import type { SprintClient, SprintStatus } from '@/sprint/api';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';
import type { PublishedLesson } from '@/schemas/published-lesson';

let n = 0;
const id = () => `b${++n}`;
const settings = { ...newSprintSettings('class1'), criteria: [{ id: 'c1', text: 'Uses sources' }], phases: newSprintSettings('class1').phases.map((p, i) => ({ ...p, due_date: `2030-11-0${i + 1}` })) };
const lesson = { lesson_id: 'sp1', title: 'Pompeii', unit_id: 'u1', blocks: newSprintBlocks(id), published_at: 'x', schema_version: 1, pedagogical_mode: 'design_sprint', sprint: publicSprint(settings) } as unknown as PublishedLesson;
const row = (key: string, open: boolean) => ({ key, open, due_date: '2030-11-01', due_time: '15:00', state: 'none', late: false, frozen: false, closed: false, count_in: 0 });
const status = (over: Partial<SprintStatus> = {}): SprintStatus => ({
  identity: { need: null, initials: 'AB' },
  group: { id: 'g1', name: 'Kestrel', size: 2, mates: ['CD'] },
  phases: ['understand', 'sketch', 'decide', 'prototype', 'test'].map((k, i) => row(k, i === 0)) as SprintStatus['phases'],
  lock: null, mine: {}, notes: [], question: null, gallery: null, heat: null, chosen: null, awaiting: null, parts: [], pitch: null, spotlight: null, round: null, received: null,
  ...over
});
const client = (s: SprintStatus): SprintClient => ({
  status: vi.fn(async () => s), claim: vi.fn(async () => s), open: vi.fn(async () => s), save: vi.fn(async () => s), submit: vi.fn(async () => s),
  parts: vi.fn(async () => s), claimPart: vi.fn(async () => s), pitch: vi.fn(async () => s), feedback: vi.fn(async () => s),
  upload: vi.fn(), fileUrl: vi.fn(async () => 'blob:x')
}) as unknown as SprintClient;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('sprint player', () => {
  it('asks for initials first', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ identity: { need: 'initials', initials: null }, group: null })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('input[aria-label="Your initials"]')).not.toBeNull();
  });

  it('shows the group, the stepper, the intention and the Understand form', async () => {
    const host = document.createElement('div');
    const c = client(status());
    mountSprintPlayer(host, { lesson, classId: 'class1', client: c, renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-group')?.textContent).toContain('Kestrel');
    expect([...host.querySelectorAll('.sprint-step')].map((s) => s.textContent)).toHaveLength(5);
    expect(host.querySelector('.sprint-step--now')?.textContent).toContain('Understand');
    expect(host.querySelector('.sprint-intent')?.textContent).toMatch(/^We will think by/);
    expect(c.open).toHaveBeenCalledWith('understand');
  });

  it('shows the lock screen while the class lock runs', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ lock: { until: '2030-11-01T05:00:00.000Z' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-lock h2')?.textContent).toBe('Your class work is in');
    expect(host.querySelector('.sprint-form')).toBeNull();
  });

  it('shows the spotlight banner with no name', async () => {
    const host = document.createElement('div');
    mountSprintPlayer(host, { lesson, classId: 'class1', client: client(status({ spotlight: { text: 'How might we make ash talk?', label: 'One idea from the class' } })), renderHero: () => {} });
    await flush();
    expect(host.querySelector('.sprint-spotlight')?.textContent).toContain('How might we make ash talk?');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-player.test.ts`
Expected: FAIL, cannot resolve `@/sprint/player`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/form-kit.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { libraryValue } from '@/toolkit/library';
import type { Block } from '@/schemas/block';
import type { PhaseRow, SprintClient, SprintStatus } from './api';
import type { PhasePayload, PublicSprint, SprintPhaseKey } from './schema';

/** What every phase form is given. */
export type FormContext = {
  status: SprintStatus;
  sprint: PublicSprint;
  blocks: Block[];
  row: PhaseRow;
  /** False when frozen, locked or closed: the form shows what was sent, read-only. */
  editable: boolean;
  client: SprintClient;
  /** Sentence frames from the phase's Thinking move tools. */
  frames: string[];
  /** The move's value check: question and what it asks for. */
  valueCheck: { question: string; asks: string } | null;
  /** Show starters inline (Guided), folded (Standard) or not at all (Open). */
  support: PublicSprint['support'];
  onStatus(next: SprintStatus): void;
};
export type PhaseForm = { el: HTMLElement; dispose(): void };

export function valueCheckFor(valueId: string | undefined): FormContext['valueCheck'] {
  const probe = valueId ? libraryValue(valueId)?.probes[0] : undefined;
  return probe ? { question: probe.question, asks: probe.asks } : null;
}

/** A labelled textarea with its starter (shown per support level) and a "Use a frame" button. */
export function frameField(opts: { label: string; value: string; max: number; rows?: number; starter?: string; frames?: string[]; support: FormContext['support']; disabled: boolean; onInput(v: string): void }): HTMLElement {
  const wrap = el('div', 'sprint-field');
  const label = el('label', 'sprint-field__label', opts.label);
  const area = el('textarea', 'qz-input sprint-field__input');
  area.rows = opts.rows ?? 3;
  area.maxLength = opts.max;
  area.value = opts.value;
  area.disabled = opts.disabled;
  area.addEventListener('input', () => opts.onInput(area.value));
  const id = `sf-${Math.random().toString(36).slice(2, 9)}`;
  area.id = id;
  label.htmlFor = id;
  wrap.append(label);
  const frames = opts.frames ?? [];
  if (opts.support !== 'open' && (opts.starter || frames.length)) {
    const starter = el('div', 'sprint-field__starter');
    if (opts.starter) starter.append(el('span', '', opts.starter));
    for (const f of frames) {
      const use = button(`Use: ${f}`, 'ghost', () => {
        if (area.disabled) return;
        area.value = area.value ? `${area.value} ${f}` : f;
        opts.onInput(area.value);
        area.focus();
      });
      use.classList.add('sprint-frame');
      starter.append(use);
    }
    if (opts.support === 'standard') {
      const fold = el('details', 'sprint-field__fold');
      fold.append(el('summary', '', 'Show starters'), starter);
      wrap.append(fold);
    } else wrap.append(starter);
  }
  wrap.append(area);
  return wrap;
}

/** The value check: the question, what it asks, and a one-line answer box. */
export function valueCheckField(ctx: FormContext, value: string, onInput: (v: string) => void): HTMLElement | null {
  if (!ctx.valueCheck) return null;
  const box = el('div', 'sprint-value');
  box.append(el('strong', '', ctx.valueCheck.question), el('p', '', ctx.valueCheck.asks));
  const input = el('input', 'qz-input');
  input.maxLength = 300;
  input.value = value;
  input.disabled = !ctx.editable;
  input.setAttribute('aria-label', ctx.valueCheck.question);
  input.addEventListener('input', () => onInput(input.value));
  box.append(input);
  return box;
}

/**
 * Save as you type (4 s after the last change), and the submit bar with the
 * checks. Class work is saved to the server, so ending the class part
 * submits what is there.
 */
export function submitBar<P extends SprintPhaseKey>(ctx: FormContext, phase: P, payload: () => PhasePayload[P], problems: () => string[]): { el: HTMLElement; changed(): void; dispose(): void } {
  const bar = el('div', 'sprint-submit');
  const list = el('ul', 'sprint-checks');
  const note = el('p', 'sprint-submit__note');
  const err = el('p', 'sprint-submit__err');
  err.setAttribute('role', 'alert');
  let timer = 0;
  let busy = false;
  const saved = ctx.row.state === 'in' ? 'In. You can change it until the deadline.' : ctx.row.state === 'draft' ? 'Saved as a draft.' : '';
  note.textContent = ctx.row.frozen ? 'Your class work is in.' : saved;
  const send = async (kind: 'save' | 'submit') => {
    if (busy || !ctx.editable) return;
    busy = true;
    err.textContent = '';
    try {
      const next = kind === 'save' ? await ctx.client.save(phase, payload()) : await ctx.client.submit(phase, payload());
      note.textContent = kind === 'submit' ? 'In. You can change it until the deadline.' : 'Saved as a draft.';
      if (kind === 'submit') ctx.onStatus(next);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
    } finally {
      busy = false;
    }
  };
  const check = () => {
    const p = problems();
    list.replaceChildren(...p.map((t) => el('li', '', t)));
    return p;
  };
  const go = button('Check and submit', 'primary', () => {
    if (check().length === 0) void send('submit');
  });
  go.disabled = !ctx.editable;
  bar.append(el('h3', '', 'Check before you submit'), list, go, note, err);
  return {
    el: bar,
    changed() {
      if (!ctx.editable) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void send('save'), 4000);
    },
    dispose: () => window.clearTimeout(timer)
  };
}
```

- [ ] **Step 4: Write `apps/teaching/src/sprint/player.ts`**

```ts
import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { el } from '@/quiz/dom';
import { formatDueDay, formatDueTime } from '@/blocks/classroom-tools/logic';
import { phaseDue } from './rules';
import { phaseIntention, phaseMove, toolFrames } from './defaults';
import { sprintParts } from './model';
import { PHASE_LABELS, type PublicSprint, type SprintPhaseKey } from './schema';
import { valueCheckFor, type FormContext, type PhaseForm } from './form-kit';
import type { SprintClient, SprintStatus } from './api';
import './sprint.css';

export type SprintPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  client: SprintClient | null;
  renderHero: (host: HTMLElement) => void;
};

/** Each phase's form; Tasks 12–14 register theirs. */
export const PHASE_FORMS: Partial<Record<SprintPhaseKey, (ctx: FormContext) => PhaseForm>> = {};
/** A form is rebuilt only when this changes, so polling never wipes what a student is typing. */
export const FORM_SIGNATURES: Partial<Record<SprintPhaseKey, (s: SprintStatus) => string>> = {};

const POLL_MS = 8000;

/** "2 days left · Tue 28 Oct, 3:00 pm", or hours and minutes on the day. */
export function dueText(due_date: string, due_time: string, now: number): string {
  const due = phaseDue({ due_date, due_time });
  if (due === null) return '';
  const when = `${formatDueDay(due_date)}, ${formatDueTime(due_time || '23:59')}`;
  const left = due - now;
  if (left <= 0) return `Closed · ${when}`;
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left · ${when}`;
  const mins = Math.ceil(left / 60_000);
  return `${Math.floor(mins / 60)} h ${mins % 60} min left · ${when}`;
}

export function mountSprintPlayer(host: HTMLElement, options: SprintPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const sprint = lesson.sprint as PublicSprint;
  const blocks = lesson.blocks as Block[];
  const parts = sprintParts(blocks);
  let status: SprintStatus | null = null;
  let chosen: SprintPhaseKey | null = null;
  let form: PhaseForm | null = null;
  let formKey = '';
  let poll = 0;
  let disposed = false;
  const opened = new Set<SprintPhaseKey>();

  const shell = el('div', 'sprint');
  const hero = el('div', 'sprint__hero');
  options.renderHero(hero);
  const spot = el('div', 'sprint-spotlight');
  const top = el('div', 'sprint__top');
  const body = el('div', 'sprint__body');
  shell.append(hero, spot, top, body);
  host.replaceChildren(shell);

  const current = (s: SprintStatus): SprintPhaseKey => {
    const open = (s.phases ?? []).filter((p) => p.open).map((p) => p.key);
    if (chosen && open.includes(chosen)) return chosen;
    return open.at(-1) ?? 'understand';
  };

  function claimForm(): HTMLElement {
    const f = el('form', 'sprint-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--primary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'sprint-claim__err');
    err.setAttribute('role', 'alert');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!client) return;
      try {
        const next = await client.claim(input.value.trim());
        if (next.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else apply(next);
      } catch (error) {
        err.textContent = error instanceof Error ? error.message : 'That didn’t work. Try again.';
      }
    });
    f.append(el('p', '', 'Type your initials to join your group.'), input, go, err);
    return f;
  }

  function paintTop(s: SprintStatus, key: SprintPhaseKey): void {
    top.replaceChildren();
    const row = s.phases?.find((p) => p.key === key);
    const test = s.phases?.find((p) => p.key === 'test');
    const cd = el('div', 'sprint-countdown');
    const left = el('div');
    left.append(el('div', 'sprint-countdown__title', `${PHASE_LABELS[key]} closes`), el('div', 'sprint-countdown__sub', test ? `Pitch day: ${formatDueDay(test.due_date)}` : ''));
    cd.append(left, el('div', 'sprint-countdown__fig', row ? dueText(row.due_date, row.due_time, Date.now()) : ''));
    const group = el('div', 'sprint-group', `Group ${s.group?.name ?? ''} · ${(s.group?.mates ?? []).join(' · ')} · ${row?.count_in ?? 0} of ${s.group?.size ?? 0} in`);
    const intent = el('p', 'sprint-intent', phaseIntention(phaseMove(blocks, key)));
    const steps = el('nav', 'sprint-steps');
    steps.setAttribute('aria-label', 'Sprint phases');
    for (const p of s.phases ?? []) {
      const b = el('button', `sprint-step${p.key === key ? ' sprint-step--now' : p.state === 'in' ? ' sprint-step--done' : !p.open ? ' sprint-step--later' : ''}`);
      b.type = 'button';
      b.disabled = !p.open;
      const where = sprint.phases.find((x) => x.key === p.key)?.where === 'class' ? 'Class' : 'Home';
      b.append(el('b', '', PHASE_LABELS[p.key]), el('span', '', `${where}${p.state === 'in' ? ' · in' : p.key === key ? ' · now' : ''}`));
      b.addEventListener('click', () => { chosen = p.key; paint(); });
      steps.append(b);
    }
    const brief = el('details', 'sprint-brief');
    brief.append(el('summary', '', 'The challenge'));
    for (const b of parts.brief) brief.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks: blocks }));
    top.append(cd, group, steps, intent, brief);
  }

  function guidesPanel(key: SprintPhaseKey): HTMLElement {
    const panel = el('details', 'sprint-guides');
    panel.open = typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 900px)').matches;
    panel.append(el('summary', '', 'Guides'));
    const sec = parts.phases.get(key);
    for (const b of (sec?.content.blocks as Block[] | undefined) ?? []) panel.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks: blocks }));
    if (key === 'sketch' || key === 'decide') {
      const g = sprint.idea_guide;
      const check = el('div', 'sprint-guide');
      check.append(el('div', 'sprint-guide__kind', 'Good idea checklist'));
      const ul = el('ul');
      for (const line of g.checklist) ul.append(el('li', '', line));
      check.append(ul);
      const model = el('div', 'sprint-guide');
      model.append(el('div', 'sprint-guide__kind', `Model idea · ${g.model.topic}`), el('p', '', g.model.text));
      for (const n of g.model.notes) model.append(el('p', 'sprint-guide__note', n));
      if (g.pair) model.append(el('p', '', `Developing: ${g.pair.developing}`), el('p', '', `Strong: ${g.pair.strong}`), el('p', 'sprint-guide__note', g.pair.note));
      panel.append(check, model);
    }
    const reqs = sprint.requirements.filter((r) => r.phases.includes(key));
    if (reqs.length) {
      const box = el('div', 'sprint-guide');
      box.append(el('div', 'sprint-guide__kind', 'Requirements'));
      const ul = el('ul');
      for (const r of reqs) ul.append(el('li', '', r.text));
      box.append(ul);
      panel.append(box);
    }
    const stretch = sprint.phases.find((p) => p.key === key)?.stretch;
    if (stretch) {
      const box = el('div', 'sprint-guide');
      box.append(el('div', 'sprint-guide__kind', 'Stretch'), el('p', '', stretch));
      panel.append(box);
    }
    return panel;
  }

  function lockScreen(s: SprintStatus): HTMLElement {
    const box = el('section', 'sprint-lock');
    const until = new Date(s.lock!.until);
    box.append(el('div', 'sprint-lock__icon', '✓'), el('h2', '', 'Your class work is in'), el('p', '', `The sprint opens again at ${until.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.`));
    const clock = el('div', 'sprint-lock__clock');
    const tick = () => {
      const ms = Math.max(0, until.getTime() - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const sec = Math.floor((ms % 60_000) / 1000);
      clock.textContent = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    tick();
    box.append(clock);
    return box;
  }

  function paint(): void {
    if (disposed || !status) return;
    const s = status;
    spot.replaceChildren();
    spot.hidden = !s.spotlight;
    if (s.spotlight) spot.append(el('strong', '', s.spotlight.label), el('p', '', s.spotlight.text));
    if (s.identity.need === 'initials') { top.replaceChildren(); body.replaceChildren(claimForm()); return; }
    if (s.anonymous || !s.group) {
      top.replaceChildren();
      body.replaceChildren(el('p', 'sprint-note', s.not_for_you ? 'This sprint is set for other groups. Ask your teacher which group you’re in.' : 'Your teacher hasn’t added a class list yet.'));
      return;
    }
    const key = current(s);
    paintTop(s, key);
    if (s.lock) {
      form?.dispose();
      form = null;
      formKey = '';
      body.replaceChildren(lockScreen(s));
      return;
    }
    if (!opened.has(key) && client) {
      opened.add(key);
      void client.open(key).catch(() => {});
    }
    const sig = `${key}|${FORM_SIGNATURES[key]?.(s) ?? ''}`;
    if (sig === formKey && form) return;
    form?.dispose();
    formKey = sig;
    const row = s.phases!.find((p) => p.key === key)!;
    const move = phaseMove(blocks, key);
    const ctx: FormContext = {
      status: s, sprint, blocks, row,
      editable: !row.frozen && !(row.state === 'in' && row.closed),
      client: client!,
      frames: toolFrames(move),
      valueCheck: valueCheckFor(move?.value),
      support: sprint.support,
      onStatus: (next) => apply(next)
    };
    const make = PHASE_FORMS[key];
    form = make ? make(ctx) : { el: el('p', 'sprint-note', 'This phase opens soon.'), dispose() {} };
    const layout = el('div', 'sprint-layout');
    const work = el('section', 'sprint-form');
    work.append(form.el);
    layout.append(work, guidesPanel(key));
    body.replaceChildren(layout);
  }

  function apply(next: SprintStatus): void {
    status = next;
    paint();
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      apply(await client.status());
    } catch {
      /* The next poll tries again. */
    }
  }

  if (!client) body.replaceChildren(el('p', 'sprint-note', 'Open this sprint from your class page.'));
  else {
    void refresh();
    poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  }

  return {
    dispose() {
      disposed = true;
      window.clearInterval(poll);
      form?.dispose();
    }
  };
}

```

- [ ] **Step 5: Write `apps/teaching/src/sprint/sprint.css`**

Use the Teaching tokens (`--navy`, `--ink`, `--muted`, `--line`, `--pastel-*`, `--radius-*`). Lay out every class used in the sprint files. Copy the look from the mockups in `docs/superpowers/specs/design-sprint-screens/` (`base.css` has the same token values and the countdown, stepper, pill and dot styles).

```css
/* Design Sprint: student player, teacher map, board, marking and pitch view. */
.sprint { display: grid; gap: var(--space-4, 16px); }
.sprint-spotlight { padding: 12px 16px; border-radius: var(--radius-md); background: var(--pastel-gold); color: var(--pastel-gold-ink); }
.sprint-spotlight p { margin: 4px 0 0; }
.sprint-countdown { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 20px; border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--navy), var(--navy-2, #244f7c)); color: #fff; }
.sprint-countdown__title { font-weight: 650; font-size: 18px; }
.sprint-countdown__sub { font-size: 12px; opacity: .75; }
.sprint-countdown__fig { font-weight: 650; text-align: right; }
.sprint-group { color: var(--muted); font-size: 13px; margin: 8px 0; }
.sprint-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.sprint-step { font: inherit; text-align: left; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: rgba(255,255,255,.6); color: var(--ink); cursor: pointer; }
.sprint-step b { display: block; font-size: 14px; }
.sprint-step span { font-size: 12px; }
.sprint-step--now { background: #fff; border-color: var(--navy); box-shadow: 0 0 0 2px rgba(23,55,94,.12); }
.sprint-step--done { background: var(--pastel-sage); color: var(--pastel-sage-ink); border-color: transparent; }
.sprint-step--later, .sprint-step:disabled { color: var(--muted); cursor: default; }
.sprint-intent { margin: 12px 0 0; padding: 12px 16px; border-radius: var(--radius-md); background: var(--pastel-lilac); color: var(--pastel-lilac-ink); }
.sprint-brief { margin-top: 12px; }
.sprint-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
.sprint-form { padding: 18px 20px; border-radius: var(--radius-lg); background: rgba(255,255,255,.75); border: 1px solid var(--line); }
.sprint-guides { padding: 16px; border-radius: var(--radius-lg); background: rgba(255,255,255,.75); border: 1px solid var(--line); position: sticky; top: 16px; }
.sprint-guides > summary { font-weight: 650; cursor: pointer; }
.sprint-guide { border: 1px solid var(--line); background: #fff; border-radius: 14px; padding: 12px; margin-top: 10px; font-size: 13px; }
.sprint-guide__kind { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--pastel-lilac-ink); }
.sprint-guide__note { color: var(--muted); }
.sprint-field { margin-bottom: 14px; }
.sprint-field__label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.sprint-field__starter { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.sprint-field__input { width: 100%; }
.sprint-frame { font-size: 12px; padding: 2px 8px; }
.sprint-value { margin-top: 12px; padding: 12px 14px; border-radius: 14px; background: var(--pastel-lilac); color: var(--pastel-lilac-ink); }
.sprint-value p { margin: 4px 0 8px; }
.sprint-value input { width: 100%; }
.sprint-submit { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 14px; }
.sprint-checks { margin: 0 0 10px; padding-left: 18px; color: var(--pastel-peach-ink); }
.sprint-submit__note { color: var(--muted); font-size: 13px; }
.sprint-submit__err, .sprint-claim__err { color: var(--danger, #a33); font-size: 13px; }
.sprint-lock { padding: 26px 22px; text-align: center; border-radius: var(--radius-lg); background: rgba(255,255,255,.8); border: 1px solid var(--line); }
.sprint-lock__icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; margin: 0 auto 12px; background: var(--pastel-sage); color: var(--pastel-sage-ink); font-size: 26px; }
.sprint-lock__clock { font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--navy); margin-top: 12px; }
.sprint-note { color: var(--muted); }
.sprint-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0 16px; }
.sprint-tab[aria-selected="true"] { background: var(--navy); color: #fff; border-color: var(--navy); }
.sprint-row { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; padding: 6px 0; font-size: 14px; }
.sprint-row input[type="text"], .sprint-row .qz-input { width: 100%; margin-top: 4px; }
.sprint-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.sprint-idea { background: #fff; border: 1px solid var(--line); border-radius: var(--radius-md); padding: 14px; display: grid; gap: 8px; }
.sprint-idea__tag { font-size: 12px; font-weight: 700; color: var(--muted); }
.sprint-chip { font: inherit; font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--paper, #fbf8f2); cursor: pointer; }
.sprint-chip[aria-pressed="true"] { background: var(--navy); color: #fff; border-color: var(--navy); }
.sprint-heat { display: flex; gap: 3px; }
.sprint-heat i { width: 18px; height: 18px; border-radius: 5px; background: var(--pastel-blue); }
.sprint-heat i[data-level="1"] { background: #c3d7ef; }
.sprint-heat i[data-level="2"] { background: #7fa4d3; }
.sprint-heat i[data-level="3"] { background: var(--navy); }
.sprint-levels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.sprint-level[aria-pressed="true"] { background: var(--navy); color: #fff; border-color: var(--navy); }
.sprint-card { position: fixed; inset: auto 16px 16px auto; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; z-index: 40; padding: 16px; border-radius: var(--radius-lg); background: #fff; box-shadow: 0 18px 48px rgba(39,55,74,.2); }
@media (max-width: 900px) {
  .sprint-layout { grid-template-columns: 1fr; }
  .sprint-guides { position: static; order: -1; }
  .sprint-gallery { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .sprint-countdown { flex-direction: column; align-items: flex-start; }
  .sprint-countdown__fig { text-align: left; }
  .sprint-step { padding: 6px 4px; text-align: center; }
  .sprint-step b { font-size: 11px; }
  .sprint-step span { display: none; }
}
```

Tasks 15–18 append their own sections to this file.

- [ ] **Step 6: Route published sprints to the player**

In `apps/teaching/src/student/lesson-view.ts`, import:

```ts
import { mountSprintPlayer } from '@/sprint/player';
import { sprintClient } from '@/sprint/api';
import '@/sprint/forms';
```

(`forms.ts` is created in Task 12; until then, leave the third import out and add it in Task 12.)

In `renderPublishedLesson`, add above `if (lesson.pedagogical_mode === 'tutorial') {`:

```ts
  if (lesson.pedagogical_mode === 'design_sprint' && lesson.sprint) {
    // The brief and phase guides are in the snapshot; the group and submissions come from the server after the claim.
    const classId = extras?.cls?.id ?? extras?.quizClassId;
    const playerHost = document.createElement('div');
    content.append(playerHost);
    return mountSprintPlayer(playerHost, {
      lesson,
      classId,
      client: classId ? sprintClient(lesson.lesson_id, classId) : null,
      renderHero: (hostEl) => {
        renderPublishedLessonHero(hostEl, lesson, extras?.cls);
      }
    });
  }
```

Also add `lesson.pedagogical_mode === 'design_sprint' ? 'Design Sprint' :` to the `eyebrow:` chain at line ~82, before `'Lesson'`.

- [ ] **Step 7: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-player.test.ts && npx tsc --noEmit`
Expected: PASS. The Understand body shows "This phase opens soon." until Task 12 registers its form; the test only checks the chrome.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/sprint/form-kit.ts apps/teaching/src/sprint/player.ts apps/teaching/src/sprint/sprint.css apps/teaching/src/student/lesson-view.ts apps/teaching/tests/unit/sprint-player.test.ts
git commit -m "Teaching sprint: student player, countdown, stepper, guides and lock screen"
```

---

### Task 12: Understand and Sketch forms

**Files:**
- Create: `apps/teaching/src/sprint/phase-understand.ts`
- Create: `apps/teaching/src/sprint/phase-sketch.ts`
- Create: `apps/teaching/src/sprint/forms.ts` (registers every phase form)
- Modify: `apps/teaching/src/student/lesson-view.ts` (add `import '@/sprint/forms';`)
- Test: `apps/teaching/tests/unit/sprint-forms-early.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-forms-early.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountUnderstand } from '@/sprint/phase-understand';
import { mountSketch } from '@/sprint/phase-sketch';
import type { FormContext } from '@/sprint/form-kit';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }], requirements: [{ id: 'r1', text: 'Two sources', phases: ['sketch'] }] });
const ctx = (over: Partial<FormContext> = {}): FormContext => ({
  status: { identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, notes: [{ id: 'n1', text: 'How might we a?', mine: false }], mine: {} },
  sprint, blocks: [], row: { key: 'understand', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 },
  editable: true,
  client: { save: vi.fn(async () => ({})), submit: vi.fn(async () => ({})) } as never,
  frames: ['What if ___?'], valueCheck: { question: 'Is there another way to look at this?', asks: 'Name a different view.' }, support: 'guided', onStatus: vi.fn(),
  ...over
});

describe('understand form', () => {
  it('shows the frame, three boxes and the group’s notes to star', () => {
    const f = mountUnderstand(ctx());
    expect(f.el.querySelectorAll('.sprint-note-input')).toHaveLength(3);
    expect(f.el.textContent).toContain('How might we [action] for [who] so that [result]?');
    const star = f.el.querySelector<HTMLButtonElement>('.sprint-star')!;
    star.click();
    expect(star.getAttribute('aria-pressed')).toBe('true');
  });

  it('lists what to add before it submits', () => {
    const c = ctx();
    const f = mountUnderstand(c);
    f.el.querySelector<HTMLButtonElement>('.sprint-submit .btn--primary')!.click();
    expect(f.el.querySelector('.sprint-checks')?.textContent).toContain('Write 3 "How might we" questions');
    expect(c.client.submit).not.toHaveBeenCalled();
  });
});

describe('sketch form', () => {
  it('has a tab per idea, the idea card fields and the requirement ticks', () => {
    const f = mountSketch(ctx({ row: { key: 'sketch', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 } }));
    expect(f.el.querySelectorAll('.sprint-tab')).toHaveLength(3);
    expect(f.el.textContent).toContain('It answers our question because…');
    expect(f.el.textContent).toContain('Two sources');
    expect(f.el.textContent).toContain('Is there another way to look at this?');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-early.test.ts`
Expected: FAIL, cannot resolve the phase modules.

- [ ] **Step 3: Write `apps/teaching/src/sprint/phase-understand.ts`**

```ts
import { el } from '@/quiz/dom';
import { understandProblems } from './checks';
import { HMW_FRAME } from './defaults';
import { submitBar, type FormContext, type PhaseForm } from './form-kit';
import type { PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Understand: write the "How might we" questions, then star the strongest one from the group. */
export function mountUnderstand(ctx: FormContext): PhaseForm {
  const ideas = ctx.sprint.phases[0]!.ideas ?? 3;
  const mine = ctx.status.mine?.understand;
  const state: PhasePayload['understand'] = { notes: [...(mine?.notes ?? [])], star: mine?.star ?? '', stretch: mine?.stretch ?? '' };
  while (state.notes.length < ideas) state.notes.push('');
  const root = el('div', 'sprint-understand');
  root.append(el('h2', '', 'How might we…?'));
  if (ctx.sprint.phases[0]!.instruction) root.append(el('p', '', ctx.sprint.phases[0]!.instruction));
  if (ctx.support !== 'open') root.append(el('p', 'sprint-field__starter', `${HMW_FRAME.lead} ${HMW_FRAME.parts.join(' ')}`));
  const bar = submitBar(ctx, 'understand', () => ({ ...state, notes: state.notes.filter((n) => n.trim()) }), () => {
    const p = understandProblems(state, ideas);
    if (!state.star) p.push('Star the group question you think is strongest.');
    return p;
  });
  state.notes.forEach((text, i) => {
    const input = el('input', 'qz-input sprint-note-input');
    input.maxLength = 200;
    input.value = text || '';
    input.placeholder = 'How might we…';
    input.disabled = !ctx.editable;
    input.setAttribute('aria-label', `Question ${i + 1}`);
    input.addEventListener('input', () => { state.notes[i] = input.value; bar.changed(); });
    root.append(input);
  });
  const group = el('div', 'sprint-notes');
  group.append(el('h3', '', 'Your group’s questions'));
  const notes = ctx.status.notes ?? [];
  if (!notes.length) group.append(el('p', 'sprint-note', 'Your group’s questions show here as they write them.'));
  for (const n of notes) {
    const star = el('button', 'sprint-chip sprint-star', `☆ ${n.text}`);
    star.type = 'button';
    star.disabled = !ctx.editable;
    star.setAttribute('aria-pressed', String(state.star === n.id));
    star.addEventListener('click', () => {
      state.star = n.id;
      group.querySelectorAll('.sprint-star').forEach((b) => b.setAttribute('aria-pressed', String(b === star)));
      bar.changed();
    });
    group.append(star);
  }
  root.append(group, bar.el);
  return { el: root, dispose: bar.dispose };
}

/** Rebuild when the group's notes change (new questions to star), never while typing otherwise. */
export const understandSignature = (s: SprintStatus) => (s.notes ?? []).map((n) => n.id).join(',');
```

- [ ] **Step 4: Write `apps/teaching/src/sprint/phase-sketch.ts`**

```ts
import { el } from '@/quiz/dom';
import { sketchProblems } from './checks';
import { SKETCH_STARTERS } from './defaults';
import { frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import type { PhasePayload, SketchCard } from './schema';
import type { SprintStatus } from './api';

const blank = (i: number): SketchCard => ({ id: `k${i + 1}`, title: '', idea: '', answers: '', evidence: '', criteria: {}, requirements: {}, value_answer: '' });

/** Sketch: one tab per idea card, the checks for each, then the strongest pick. */
export function mountSketch(ctx: FormContext): PhaseForm {
  const ideas = ctx.sprint.phases[1]!.ideas ?? 3;
  const mine = ctx.status.mine?.sketch;
  const state: PhasePayload['sketch'] = { cards: [...(mine?.cards ?? [])], strongest: mine?.strongest ?? '', strongest_why: mine?.strongest_why ?? '' };
  while (state.cards.length < ideas) state.cards.push(blank(state.cards.length));
  const reqs = ctx.sprint.requirements.filter((r) => r.phases.includes('sketch'));
  const root = el('div', 'sprint-sketch');
  root.append(el('h2', '', `Your ${ideas} ideas`));
  if (ctx.status.question) root.append(el('p', 'sprint-note', `Our question: ${ctx.status.question.text}`));
  const bar = submitBar(ctx, 'sketch', () => state, () => sketchProblems(state, { ideas, requirements: ctx.sprint.requirements }));
  const tabs = el('div', 'sprint-tabs');
  tabs.setAttribute('role', 'tablist');
  const pane = el('div', 'sprint-card-pane');
  let at = 0;

  const paintCard = () => {
    const c = state.cards[at]!;
    const change = () => bar.changed();
    pane.replaceChildren();
    const title = el('input', 'qz-input');
    title.maxLength = 80;
    title.value = c.title;
    title.disabled = !ctx.editable;
    title.setAttribute('aria-label', 'Title');
    title.addEventListener('input', () => { c.title = title.value; change(); });
    pane.append(el('label', 'sprint-field__label', 'Title'), title);
    pane.append(
      frameField({ label: SKETCH_STARTERS.idea, value: c.idea, max: 600, frames: ctx.frames.slice(0, 1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.idea = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.answers, value: c.answers, max: 600, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.answers = v; change(); } }),
      frameField({ label: SKETCH_STARTERS.evidence, value: c.evidence, max: 600, frames: ctx.frames.slice(1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { c.evidence = v; change(); } })
    );
    const upload = el('input');
    upload.type = 'file';
    upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
    upload.disabled = !ctx.editable;
    upload.setAttribute('aria-label', 'Add a picture or PDF');
    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      try {
        c.file = (await ctx.client.upload('sketch', file)).id;
        change();
      } catch (e) {
        pane.append(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'That didn’t upload.'));
      }
    });
    pane.append(el('label', 'sprint-field__label', c.file ? 'Picture or PDF added' : 'Add a picture or PDF (optional)'), upload);
    const check = el('div', 'sprint-card-check');
    check.append(el('h3', '', 'Criteria this idea meets'));
    for (const cr of ctx.sprint.criteria) check.append(tickRow(cr.text, c.criteria, cr.id, 'The line that shows it', ctx.editable, change));
    if (reqs.length) {
      check.append(el('h3', '', 'Requirements'));
      for (const r of reqs) check.append(tickRow(r.text, c.requirements, r.id, 'Where is it?', ctx.editable, change));
    }
    const value = valueCheckField(ctx, c.value_answer, (v) => { c.value_answer = v; change(); });
    if (value) check.append(value);
    pane.append(check);
  };

  const paintTabs = () => {
    tabs.replaceChildren(...state.cards.map((c, i) => {
      const t = el('button', 'btn btn--secondary sprint-tab', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(i === at));
      t.addEventListener('click', () => { at = i; paintTabs(); paintCard(); });
      return t;
    }));
  };

  const strongest = el('div', 'sprint-strongest');
  const pick = el('select', 'qz-input');
  pick.disabled = !ctx.editable;
  pick.setAttribute('aria-label', 'Your strongest idea');
  const refreshPick = () => {
    pick.replaceChildren(el('option', '', 'Pick your strongest idea'), ...state.cards.map((c, i) => {
      const o = el('option', '', `Idea ${i + 1}${c.title ? `: ${c.title}` : ''}`);
      o.value = c.id;
      o.selected = state.strongest === c.id;
      return o;
    }));
    (pick.firstChild as HTMLOptionElement).value = '';
  };
  refreshPick();
  pick.addEventListener('focus', refreshPick);
  pick.addEventListener('change', () => { state.strongest = pick.value; bar.changed(); });
  strongest.append(el('h3', '', 'Your strongest idea'), pick, frameField({ label: 'Why is it the strongest?', value: state.strongest_why, max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.strongest_why = v; bar.changed(); } }));

  paintTabs();
  paintCard();
  root.append(tabs, pane, strongest, bar.el);
  return { el: root, dispose: bar.dispose };
}

/** A tick with a "where" box; unticking clears it. */
function tickRow(label: string, into: Record<string, string>, id: string, placeholder: string, editable: boolean, change: () => void): HTMLElement {
  const row = el('label', 'sprint-row');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = !!into[id];
  box.disabled = !editable;
  const text = el('span', '', label);
  const where = el('input', 'qz-input');
  where.type = 'text';
  where.maxLength = 200;
  where.placeholder = placeholder;
  where.value = into[id] ?? '';
  where.hidden = !box.checked;
  where.disabled = !editable;
  box.addEventListener('change', () => {
    where.hidden = !box.checked;
    if (!box.checked) delete into[id];
    change();
  });
  where.addEventListener('input', () => { into[id] = where.value; change(); });
  text.append(where);
  row.append(box, text);
  return row;
}

export const sketchSignature = (s: SprintStatus) => (s.question?.text ?? '');
```

- [ ] **Step 5: Write `apps/teaching/src/sprint/forms.ts`**

```ts
import { PHASE_FORMS, FORM_SIGNATURES } from './player';
import { mountUnderstand, understandSignature } from './phase-understand';
import { mountSketch, sketchSignature } from './phase-sketch';

/** Registers each phase's form with the player. Tasks 13 and 14 add Decide, Prototype and Test here. */
PHASE_FORMS.understand = mountUnderstand;
FORM_SIGNATURES.understand = understandSignature;
PHASE_FORMS.sketch = mountSketch;
FORM_SIGNATURES.sketch = sketchSignature;
```

Add `import '@/sprint/forms';` to `apps/teaching/src/student/lesson-view.ts` (Task 11 Step 6).

- [ ] **Step 6: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-early.test.ts tests/unit/sprint-player.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/sprint/phase-understand.ts apps/teaching/src/sprint/phase-sketch.ts apps/teaching/src/sprint/forms.ts apps/teaching/src/student/lesson-view.ts apps/teaching/tests/unit/sprint-forms-early.test.ts
git commit -m "Teaching sprint: Understand and Sketch forms with frames and checks"
```

---

### Task 13: Decide and Prototype forms

**Files:**
- Create: `apps/teaching/src/sprint/phase-decide.ts`
- Create: `apps/teaching/src/sprint/phase-prototype.ts`
- Modify: `apps/teaching/src/sprint/forms.ts`
- Test: `apps/teaching/tests/unit/sprint-forms-mid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-forms-mid.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountDecide } from '@/sprint/phase-decide';
import { mountPrototype } from '@/sprint/phase-prototype';
import type { FormContext } from '@/sprint/form-kit';
import type { SprintStatus } from '@/sprint/api';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }] });
const idea = (id: string, title: string) => ({ id, title, idea: `What if ${title}?`, answers: 'a', evidence: 'e', file: null, strongest: false });
const base = (over: Partial<SprintStatus> = {}): SprintStatus => ({
  identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, mine: {},
  gallery: [{ id: 's1', ideas: [idea('i1', 'Ash'), idea('i2', 'Streets')] }, { id: 's2', ideas: [idea('i3', 'Baker')] }],
  heat: null, votes_closed: false, chosen: null, parts: [], ...over
});
const row = (key: 'decide' | 'prototype') => ({ key, open: true, due_date: '', due_time: '', state: 'none' as const, late: false, frozen: false, closed: false, count_in: 0 });
const ctx = (status: SprintStatus, key: 'decide' | 'prototype' = 'decide'): FormContext => ({
  status, sprint, blocks: [], row: row(key), editable: true,
  client: { save: vi.fn(async () => status), submit: vi.fn(async () => status), parts: vi.fn(async () => status), claimPart: vi.fn(async () => status), upload: vi.fn(), pitch: vi.fn(async () => status), fileUrl: vi.fn() } as never,
  frames: ['I think ___ because ___.'], valueCheck: null, support: 'standard', onStatus: vi.fn()
});

describe('decide form', () => {
  it('keeps each set folded until opened, then one vote per criterion moves between ideas', () => {
    const f = mountDecide(ctx(base()));
    const sets = f.el.querySelectorAll<HTMLDetailsElement>('.sprint-set');
    expect(sets).toHaveLength(2);
    expect(f.el.querySelectorAll('.sprint-vote')).toHaveLength(0);
    sets.forEach((s) => { s.open = true; s.dispatchEvent(new Event('toggle')); });
    const chips = [...f.el.querySelectorAll<HTMLButtonElement>('.sprint-vote')].filter((b) => b.dataset.criterion === 'c1');
    chips[0]!.click();
    chips[2]!.click();
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    expect(f.el.textContent).not.toMatch(/Ann|AB/);
  });

  it('after voting shows the chosen idea, the heat and the parts editor', () => {
    const f = mountDecide(ctx(base({ votes_closed: true, chosen: { id: 'i3', title: 'Baker', idea: 'What if Baker?' }, heat: { i1: { c1: 1, c2: 0 }, i2: { c1: 0, c2: 0 }, i3: { c1: 3, c2: 3 } }, parts: [{ id: 'p1', text: 'Panel text', shows: '', criterion: 'c1', claimed: 0, mine: false }] })));
    expect(f.el.querySelector('.sprint-chosen')?.textContent).toContain('Baker');
    expect(f.el.querySelectorAll('.sprint-heat i[data-level="3"]')).toHaveLength(2);
    expect(f.el.querySelector('.sprint-parts')?.textContent).toContain('Panel text');
    expect(f.el.textContent).not.toMatch(/\b\d+ votes?\b/);
  });
});

describe('prototype form', () => {
  it('shows the part brief, upload, pitch file and the self-check', () => {
    const s = base({ chosen: { id: 'i3', title: 'Baker', idea: 'x' }, parts: [{ id: 'p1', text: 'Panel text', shows: 'The baker’s morning', criterion: 'c1', claimed: 1, mine: true }] });
    const f = mountPrototype(ctx(s, 'prototype'));
    expect(f.el.querySelector('.sprint-brief-part')?.textContent).toContain('The baker’s morning');
    expect(f.el.querySelector('input[type="file"]')).not.toBeNull();
    expect(f.el.querySelectorAll('.sprint-levels')).toHaveLength(2);
    expect(f.el.textContent).toContain('Pitch file');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-mid.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Write `apps/teaching/src/sprint/phase-decide.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { partsProblems, voteProblems } from './checks';
import { frameField, submitBar, type FormContext, type PhaseForm } from './form-kit';
import type { Part, PhasePayload } from './schema';
import type { GalleryIdea, SprintStatus } from './api';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Decide: open every set of ideas (no names, ever), give each criterion to
 * one idea with a reason, then, once the group's idea is chosen, write the
 * parts list and claim a part.
 */
export function mountDecide(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = s.mine?.decide;
  const state: PhasePayload['decide'] = { votes: { ...(mine?.votes ?? {}) }, reasons: { ...(mine?.reasons ?? {}) }, opened: [...(mine?.opened ?? [])], stretch: mine?.stretch ?? '' };
  const sets = s.gallery ?? [];
  const root = el('div', 'sprint-decide');
  if (s.question) root.append(el('p', 'sprint-note', `Our question: ${s.question.text}`));
  const voting = !s.votes_closed;
  const bar = submitBar(ctx, 'decide', () => state, () => [
    ...(voting ? voteProblems(state, ctx.sprint.criteria, sets.map((x) => x.id)) : []),
    ...(s.chosen && !(s.parts ?? []).some((p) => p.mine) ? ['Claim a part of the prototype.'] : [])
  ]);
  let letter = 0;
  const label = new Map<string, string>();
  for (const set of sets) for (const i of set.ideas) label.set(i.id, `Idea ${LETTERS[letter++] ?? letter}`);

  if (voting) {
    root.append(el('h2', '', 'Pick the idea that does each one best'), el('p', '', 'Open every set first. Then give each criterion to one idea and say why. One idea can get more than one.'));
    const gallery = el('div', 'sprint-sets');
    sets.forEach((set, n) => {
      const d = el('details', 'sprint-set');
      d.append(el('summary', '', `Set ${n + 1} · ${set.ideas.length} ${set.ideas.length === 1 ? 'idea' : 'ideas'}`));
      const grid = el('div', 'sprint-gallery');
      d.addEventListener('toggle', () => {
        if (!d.open) return;
        if (!state.opened.includes(set.id)) { state.opened.push(set.id); bar.changed(); }
        if (!grid.childElementCount) for (const i of set.ideas) grid.append(ideaCard(i, label.get(i.id)!, ctx, state, root, bar.changed));
      });
      d.append(grid);
      gallery.append(d);
    });
    root.append(gallery);
    const reasons = el('div', 'sprint-reasons');
    reasons.append(el('h3', '', 'Why each one?'));
    for (const c of ctx.sprint.criteria) {
      reasons.append(frameField({ label: `${c.text}: it does this best because…`, value: state.reasons[c.id] ?? '', max: 300, rows: 2, frames: ctx.frames.slice(-1), support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.reasons[c.id] = v; bar.changed(); } }));
    }
    root.append(reasons);
  } else {
    root.append(el('h2', '', s.chosen ? 'Your group’s idea' : 'Your teacher is choosing'));
    if (s.chosen) {
      const chosen = el('div', 'sprint-chosen');
      chosen.append(el('strong', '', s.chosen.title), el('p', '', s.chosen.idea));
      root.append(chosen);
    }
    if (s.heat) root.append(heatTable(sets, label, s.heat, ctx));
  }
  if (s.chosen) root.append(partsEditor(ctx));
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

function ideaCard(i: GalleryIdea, name: string, ctx: FormContext, state: PhasePayload['decide'], root: HTMLElement, changed: () => void): HTMLElement {
  const card = el('article', 'sprint-idea');
  card.append(el('span', 'sprint-idea__tag', name), el('strong', '', i.title), el('p', '', i.idea), el('p', 'sprint-note', i.answers), el('p', 'sprint-note', i.evidence));
  if (i.file) {
    const open = button('Open the picture or PDF', 'ghost', async () => window.open(await ctx.client.fileUrl(i.file!), '_blank', 'noopener'));
    card.append(open);
  }
  const chips = el('div', 'sprint-votes');
  for (const c of ctx.sprint.criteria) {
    const chip = el('button', 'sprint-chip sprint-vote', c.text);
    chip.type = 'button';
    chip.dataset.criterion = c.id;
    chip.dataset.idea = i.id;
    chip.disabled = !ctx.editable;
    chip.setAttribute('aria-pressed', String(state.votes[c.id] === i.id));
    chip.addEventListener('click', () => {
      state.votes[c.id] = i.id;
      root.querySelectorAll<HTMLButtonElement>(`.sprint-vote[data-criterion="${c.id}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idea === i.id)));
      changed();
    });
    chips.append(chip);
  }
  card.append(chips);
  return card;
}

/** Which ideas did best on which criterion: shades, never numbers. */
function heatTable(sets: SprintStatus['gallery'] & object, label: Map<string, string>, heat: NonNullable<SprintStatus['heat']>, ctx: FormContext): HTMLElement {
  const box = el('div', 'sprint-heat-table');
  box.append(el('h3', '', 'How the group voted'), el('p', 'sprint-note', `Darker means more of your group picked it for ${ctx.sprint.criteria.map((c) => c.text).join(', ')}.`));
  for (const set of sets) for (const i of set.ideas) {
    const r = el('div', 'sprint-heat-row');
    const cells = el('span', 'sprint-heat');
    for (const c of ctx.sprint.criteria) {
      const cell = el('i');
      cell.dataset.level = String(heat[i.id]?.[c.id] ?? 0);
      cell.title = c.text;
      cells.append(cell);
    }
    r.append(el('span', '', `${label.get(i.id)}: ${i.title}`), cells);
    box.append(r);
  }
  return box;
}

/** The parts list any member can edit, and one claim each. */
function partsEditor(ctx: FormContext): HTMLElement {
  const box = el('div', 'sprint-parts');
  box.append(el('h3', '', 'Parts of the prototype'), el('p', 'sprint-note', 'List what the prototype needs, what each part must show and the criterion it serves. Then claim one part.'));
  const parts: Part[] = (ctx.status.parts ?? []).map(({ claimed: _c, mine: _m, ...p }) => p);
  const list = el('div');
  const err = el('p', 'sprint-submit__err');
  const save = async () => {
    const problems = partsProblems(parts);
    if (problems.length) { err.textContent = problems[0]!; return; }
    try { ctx.onStatus(await ctx.client.parts(parts)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t save.'; }
  };
  const paint = () => {
    list.replaceChildren(...parts.map((p, i) => {
      const r = el('div', 'sprint-part');
      const name = el('input', 'qz-input');
      name.value = p.text; name.maxLength = 80; name.setAttribute('aria-label', 'Part');
      name.addEventListener('input', () => { p.text = name.value; });
      const shows = el('input', 'qz-input');
      shows.value = p.shows; shows.maxLength = 200; shows.placeholder = 'What it must show'; shows.setAttribute('aria-label', 'What it must show');
      shows.addEventListener('input', () => { p.shows = shows.value; });
      const crit = el('select', 'qz-input');
      crit.setAttribute('aria-label', 'Criterion it serves');
      crit.append(el('option', '', 'Criterion it serves'));
      (crit.firstChild as HTMLOptionElement).value = '';
      for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; o.selected = p.criterion === c.id; crit.append(o); }
      crit.addEventListener('change', () => { p.criterion = crit.value; });
      const live = (ctx.status.parts ?? []).find((x) => x.id === p.id);
      const claim = button(live?.mine ? 'Yours' : live?.claimed ? 'Claimed' : 'Claim this part', live?.mine ? 'primary' : 'secondary', async () => {
        try { ctx.onStatus(await ctx.client.claimPart(p.id)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
      });
      claim.disabled = !live || (!!live.claimed && !live.mine);
      r.append(name, shows, crit, claim, button('Remove', 'ghost', () => { parts.splice(i, 1); paint(); }));
      return r;
    }));
  };
  paint();
  box.append(list, button('+ Part', 'ghost', () => { parts.push({ id: `p${Date.now().toString(36)}`, text: 'New part', shows: '', criterion: '' }); paint(); }), button('Save parts', 'secondary', () => void save()), err);
  return box;
}

export const decideSignature = (s: SprintStatus) =>
  [(s.gallery ?? []).map((x) => x.id).join(','), s.votes_closed ? 1 : 0, s.chosen?.id ?? '', (s.parts ?? []).map((p) => `${p.id}:${p.claimed}:${p.mine ? 1 : 0}`).join(',')].join('|');
```

- [ ] **Step 4: Write `apps/teaching/src/sprint/phase-prototype.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { prototypeProblems } from './checks';
import { frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import { LEVEL_LABELS, type Level, type PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Prototype: build your part (write, upload or link), set the group's pitch file, then check it against the criteria. */
export function mountPrototype(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = s.mine?.prototype;
  const state: PhasePayload['prototype'] = { text: mine?.text ?? '', link: mine?.link ?? '', files: [...(mine?.files ?? [])], requirements: { ...(mine?.requirements ?? {}) }, self: { ...(mine?.self ?? {}) }, self_why: { ...(mine?.self_why ?? {}) }, value_answer: mine?.value_answer ?? '' };
  const myPart = (s.parts ?? []).find((p) => p.mine);
  const root = el('div', 'sprint-prototype');
  root.append(el('h2', '', myPart ? `Your part: ${myPart.text}` : 'Your part'));
  const brief = el('div', 'sprint-brief-part');
  brief.append(el('p', '', s.chosen ? `Group idea: ${s.chosen.title}` : ''), el('p', '', myPart?.shows ? `It must show: ${myPart.shows}` : 'Claim a part in Decide first.'));
  const serves = ctx.sprint.criteria.find((c) => c.id === myPart?.criterion);
  if (serves) brief.append(el('p', '', `It serves: ${serves.text}`));
  root.append(brief);
  const bar = submitBar(ctx, 'prototype', () => state, () => prototypeProblems(state, ctx.sprint.criteria, ctx.sprint.requirements));
  root.append(frameField({ label: 'Write your part here, or upload it below', value: state.text, max: 4000, rows: 8, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.text = v; bar.changed(); } }));

  const files = el('div', 'sprint-files');
  const fileList = el('ul');
  const paintFiles = () => fileList.replaceChildren(...state.files.map((id, i) => el('li', '', `File ${i + 1} added`)));
  paintFiles();
  const upload = el('input');
  upload.type = 'file';
  upload.accept = 'application/pdf,image/png,image/jpeg,image/webp';
  upload.disabled = !ctx.editable || state.files.length >= 3;
  upload.setAttribute('aria-label', 'Upload a PDF or picture');
  const err = el('p', 'sprint-submit__err');
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    try {
      const up = await ctx.client.upload('prototype', file);
      state.files.push(up.id);
      paintFiles();
      bar.changed();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t upload.';
    }
  });
  const link = el('input', 'qz-input');
  link.placeholder = 'https://… (Canva, Slides, a document)';
  link.value = state.link;
  link.disabled = !ctx.editable;
  link.setAttribute('aria-label', 'Link');
  link.addEventListener('input', () => { state.link = link.value.trim(); bar.changed(); });
  files.append(el('label', 'sprint-field__label', 'Upload a PDF or picture (up to 5 MB), or add a link'), upload, fileList, link, err);
  root.append(files);

  const pitch = el('div', 'sprint-pitch');
  pitch.append(el('h3', '', 'Pitch file'), el('p', 'sprint-note', s.pitch ? `Set: ${s.pitch.kind === 'link' ? s.pitch.link : s.pitch.name}` : 'One person sets what your group will show during the 2-minute pitch.'));
  const usePitch = button('Use my file or link as the pitch file', 'secondary', async () => {
    try {
      const next = state.link ? await ctx.client.pitch({ link: state.link }) : state.files[0] ? await ctx.client.pitch({ file_id: state.files.at(-1)! }) : null;
      if (next) ctx.onStatus(next);
      else err.textContent = 'Upload a file or add a link first.';
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t work.';
    }
  });
  usePitch.disabled = !ctx.editable;
  pitch.append(usePitch);
  root.append(pitch);

  const self = el('div', 'sprint-self');
  self.append(el('h3', '', 'Check your part against the criteria'));
  for (const c of ctx.sprint.criteria) {
    self.append(el('p', 'sprint-field__label', c.text));
    const levels = el('div', 'sprint-levels');
    LEVEL_LABELS.forEach((name, i) => {
      const lv = (i + 1) as Level;
      const b = el('button', 'btn btn--secondary sprint-level', name);
      b.type = 'button';
      b.disabled = !ctx.editable;
      b.setAttribute('aria-pressed', String(state.self[c.id] === lv));
      b.addEventListener('click', () => {
        state.self[c.id] = lv;
        levels.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        bar.changed();
      });
      levels.append(b);
    });
    self.append(levels, frameField({ label: 'Why? Point to the line or part that shows it.', value: state.self_why[c.id] ?? '', max: 300, rows: 2, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.self_why[c.id] = v; bar.changed(); } }));
  }
  for (const r of ctx.sprint.requirements.filter((x) => x.phases.includes('prototype'))) {
    self.append(frameField({ label: `Where does your part meet "${r.text}"?`, value: state.requirements[r.id] ?? '', max: 200, rows: 1, support: 'open', disabled: !ctx.editable, onInput: (v) => { state.requirements[r.id] = v; bar.changed(); } }));
  }
  const value = valueCheckField(ctx, state.value_answer, (v) => { state.value_answer = v; bar.changed(); });
  if (value) self.append(value);
  root.append(self, bar.el);
  return { el: root, dispose: bar.dispose };
}

export const prototypeSignature = (s: SprintStatus) => [(s.parts ?? []).find((p) => p.mine)?.id ?? '', s.pitch?.file ?? s.pitch?.link ?? ''].join('|');
```

- [ ] **Step 5: Register both forms**

Append to `apps/teaching/src/sprint/forms.ts`:

```ts
import { mountDecide, decideSignature } from './phase-decide';
import { mountPrototype, prototypeSignature } from './phase-prototype';

PHASE_FORMS.decide = mountDecide;
FORM_SIGNATURES.decide = decideSignature;
PHASE_FORMS.prototype = mountPrototype;
FORM_SIGNATURES.prototype = prototypeSignature;
```

(Move the imports to the top of the file with the others.)

- [ ] **Step 6: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-mid.test.ts tests/unit/sprint-forms-early.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/sprint/phase-decide.ts apps/teaching/src/sprint/phase-prototype.ts apps/teaching/src/sprint/forms.ts apps/teaching/tests/unit/sprint-forms-mid.test.ts
git commit -m "Teaching sprint: Decide gallery and votes, parts, Prototype part and self-check"
```

---

### Task 14: Test: feedback card and reflection

**Files:**
- Create: `apps/teaching/src/sprint/phase-test.ts`
- Modify: `apps/teaching/src/sprint/forms.ts`
- Modify: `apps/teaching/src/sprint/player.ts` (show the feedback card)
- Test: `apps/teaching/tests/unit/sprint-forms-test.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-forms-test.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountTest, mountFeedbackCard } from '@/sprint/phase-test';
import type { FormContext } from '@/sprint/form-kit';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';

const sprint = publicSprint({ ...newSprintSettings('c'), criteria: [{ id: 'c1', text: 'Uses sources' }] });
const status = { identity: { need: null, initials: 'AB' }, group: { id: 'g1', name: 'K', size: 2, mates: [] }, mine: {}, received: { levels: { c1: [0, 1, 2] as [number, number, number] }, lines: [{ worked: 'The graffiti felt real.', next: 'Try naming the source.', about: 'c1' }] } };
const ctx = (): FormContext => ({
  status, sprint, blocks: [], row: { key: 'test', open: true, due_date: '', due_time: '', state: 'none', late: false, frozen: false, closed: false, count_in: 0 }, editable: true,
  client: { save: vi.fn(), submit: vi.fn(), feedback: vi.fn(async () => status) } as never,
  frames: [], valueCheck: null, support: 'guided', onStatus: vi.fn()
});

describe('test phase', () => {
  it('shows the feedback the group received and the two reflection prompts', () => {
    const f = mountTest(ctx());
    expect(f.el.querySelector('.sprint-received')?.textContent).toContain('Try naming the source.');
    expect(f.el.querySelector('.sprint-received')?.textContent).toContain('Strong 2');
    expect(f.el.textContent).toContain('What did the feedback show your idea does well?');
  });

  it('feedback card checks before sending and sends once', async () => {
    const c = ctx();
    const card = mountFeedbackCard(c, { group_id: 'g2', group_name: 'Heron', sent: false });
    card.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(card.querySelector('.sprint-checks')?.textContent).toContain('Pick a level for "Uses sources".');
    expect(c.client.feedback).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-test.test.ts`
Expected: FAIL, cannot resolve `@/sprint/phase-test`.

- [ ] **Step 3: Write `apps/teaching/src/sprint/phase-test.ts`**

```ts
import { button, el } from '@/quiz/dom';
import { feedbackProblems, reflectionProblems } from './checks';
import { FEEDBACK_STARTERS } from './defaults';
import { frameField, submitBar, valueCheckField, type FormContext, type PhaseForm } from './form-kit';
import { LEVEL_LABELS, type FeedbackEntry, type Level, type PhasePayload } from './schema';
import type { SprintStatus } from './api';

/** Test: the pitch is live in class; this is the reflection on what the group's feedback showed. */
export function mountTest(ctx: FormContext): PhaseForm {
  const s = ctx.status;
  const mine = s.mine?.test;
  const prompts = ctx.sprint.reflection_prompts.length ? ctx.sprint.reflection_prompts : ['What did the feedback show your idea does well?', 'What would you change next, and why?'];
  const state: PhasePayload['test'] = { reflection: [...(mine?.reflection ?? [])], quote: mine?.quote ?? '', change_criterion: mine?.change_criterion ?? '', value_answer: mine?.value_answer ?? '' };
  while (state.reflection.length < 2) state.reflection.push('');
  const root = el('div', 'sprint-test');
  root.append(el('h2', '', 'What the test showed'));
  const got = el('div', 'sprint-received');
  if (!s.received) got.append(el('p', 'sprint-note', 'Your group’s feedback shows here once your teacher releases it.'));
  else {
    for (const c of ctx.sprint.criteria) {
      const counts = s.received.levels[c.id] ?? [0, 0, 0];
      got.append(el('p', '', `${c.text}: ${LEVEL_LABELS.map((l, i) => `${l} ${counts[i]}`).join(' · ')}`));
    }
    const ul = el('ul');
    for (const line of s.received.lines) ul.append(el('li', '', `${line.worked} ${line.next}`));
    got.append(ul);
  }
  root.append(got);
  const bar = submitBar(ctx, 'test', () => state, () => reflectionProblems(state));
  prompts.forEach((p, i) => root.append(frameField({ label: p, value: state.reflection[i] ?? '', max: 1000, rows: 4, frames: ctx.frames, support: ctx.support, disabled: !ctx.editable, onInput: (v) => { state.reflection[i] = v; bar.changed(); } })));
  root.append(frameField({ label: 'Quote one piece of feedback your group received', value: state.quote, max: 300, rows: 2, support: 'open', disabled: !ctx.editable, onInput: (v) => { state.quote = v; bar.changed(); } }));
  const crit = el('select', 'qz-input');
  crit.setAttribute('aria-label', 'Criterion your change is about');
  crit.disabled = !ctx.editable;
  crit.append(el('option', '', 'The criterion your change is about'));
  (crit.firstChild as HTMLOptionElement).value = '';
  for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; o.selected = state.change_criterion === c.id; crit.append(o); }
  crit.addEventListener('change', () => { state.change_criterion = crit.value; bar.changed(); });
  root.append(crit);
  const value = valueCheckField(ctx, state.value_answer, (v) => { state.value_answer = v; bar.changed(); });
  if (value) root.append(value);
  root.append(bar.el);
  return { el: root, dispose: bar.dispose };
}

/** The card that pops up while another group pitches: a level per criterion and two short lines. */
export function mountFeedbackCard(ctx: FormContext, round: NonNullable<SprintStatus['round']>): HTMLElement {
  const card = el('section', 'sprint-card');
  card.setAttribute('aria-label', `Feedback for Group ${round.group_name}`);
  card.append(el('div', 'sprint-note', 'Feedback for'), el('h2', '', `Group ${round.group_name}`), el('p', 'sprint-note', 'Your name stays hidden from the group.'));
  if (round.sent) { card.append(el('p', '', 'Sent. Thank you.')); return card; }
  const entry: FeedbackEntry = { levels: {}, worked: '', next: '', about: '' };
  for (const c of ctx.sprint.criteria) {
    card.append(el('p', 'sprint-field__label', c.text));
    const levels = el('div', 'sprint-levels');
    LEVEL_LABELS.forEach((name, i) => {
      const b = el('button', 'btn btn--secondary sprint-level', name);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        entry.levels[c.id] = (i + 1) as Level;
        levels.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      levels.append(b);
    });
    card.append(levels);
  }
  card.append(
    frameField({ label: 'What worked', value: '', max: 300, rows: 2, starter: FEEDBACK_STARTERS.worked, support: ctx.support, disabled: false, onInput: (v) => { entry.worked = v; } }),
    frameField({ label: 'One thing to try next', value: '', max: 300, rows: 2, starter: FEEDBACK_STARTERS.next, support: ctx.support, disabled: false, onInput: (v) => { entry.next = v; } })
  );
  const about = el('select', 'qz-input');
  about.setAttribute('aria-label', 'Your comments are about');
  about.append(el('option', '', 'Your comments are about…'));
  (about.firstChild as HTMLOptionElement).value = '';
  for (const c of ctx.sprint.criteria) { const o = el('option', '', c.text); o.value = c.id; about.append(o); }
  about.addEventListener('change', () => { entry.about = about.value; });
  const checks = el('ul', 'sprint-checks');
  const err = el('p', 'sprint-submit__err');
  const send = button('Send feedback', 'primary', async () => {
    const p = feedbackProblems(entry, ctx.sprint.criteria);
    checks.replaceChildren(...p.map((t) => el('li', '', t)));
    if (p.length) return;
    send.disabled = true;
    try { ctx.onStatus(await ctx.client.feedback(round.group_id, entry)); } catch (e) { err.textContent = e instanceof Error ? e.message : 'That didn’t send.'; send.disabled = false; }
  });
  card.append(about, checks, send, err);
  return card;
}

export const testSignature = (s: SprintStatus) => (s.received ? `r${s.received.lines.length}` : '');
```

- [ ] **Step 4: Register Test and show the card in the player**

Append to `forms.ts`:

```ts
import { mountTest, testSignature } from './phase-test';

PHASE_FORMS.test = mountTest;
FORM_SIGNATURES.test = testSignature;
```

In `player.ts`, add a card host and paint it from `paint()`. The player never imports the phase files (they import the player), so add a registry next to `PHASE_FORMS`:

```ts
/** Set by forms.ts: the feedback card for a running round. */
export const CARDS: { feedback?: (ctx: FormContext, round: NonNullable<SprintStatus['round']>) => HTMLElement } = {};
```

In `forms.ts`: `import { CARDS } from './player';` and `CARDS.feedback = mountFeedbackCard;`.

In `mountSprintPlayer`, after `shell.append(hero, spot, top, body);`:

```ts
  const cardHost = el('div', 'sprint__card');
  shell.append(cardHost);
  let cardKey = '';
```

and in `paint()`, straight after `paintTop(s, key);`, add:

```ts
    const r = s.round;
    const key2 = r ? `${r.group_id}:${r.sent ? 1 : 0}` : '';
    if (key2 !== cardKey) {
      cardKey = key2;
      cardHost.replaceChildren();
      if (r && !s.lock && CARDS.feedback) {
        const row = s.phases!.find((p) => p.key === 'test')!;
        cardHost.append(CARDS.feedback({ status: s, sprint, blocks, row, editable: true, client: client!, frames: [], valueCheck: null, support: sprint.support, onStatus: (next) => apply(next) }, r));
      }
    }
```

It runs on every paint, lock included; the `!s.lock` guard keeps the card away while the class lock runs.

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-forms-test.test.ts tests/unit/sprint-player.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/sprint/phase-test.ts apps/teaching/src/sprint/forms.ts apps/teaching/src/sprint/player.ts apps/teaching/tests/unit/sprint-forms-test.test.ts
git commit -m "Teaching sprint: pitch feedback card and reflection"
```

---
## Phase 4: browser, teacher side

### Task 15: Kit editor, phase tabs and the lesson page

**Files:**
- Create: `apps/teaching/src/sprint/kit-editor.ts`
- Create: `apps/teaching/src/sprint/editor-tabs.ts`
- Modify: `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (beside the tutorial panel ~1112–1170, and the tab hooks at ~1197, ~1230, ~1347)
- Modify: `apps/teaching/src/sprint/sprint.css` (append)
- Test: `apps/teaching/tests/unit/sprint-kit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-kit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountKitEditor, evenGroups, kitId } from '@/sprint/kit-editor';
import { inSprintTab } from '@/sprint/editor-tabs';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

let n = 0;
const id = () => `b${++n}`;
const lesson = (): Lesson => ({ id: 'l1', type: 'lesson', title: 'Pompeii', unit_id: 'u1', sequence: 0, blocks: newSprintBlocks(id), created_at: 'x', updated_at: 'x', pedagogical_mode: 'design_sprint', sprint: newSprintSettings('class1') }) as unknown as Lesson;
const roster = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }, { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }, { id: 'st_gus', name: 'Gus Hale', initials: 'GH' }, { id: 'st_ivy', name: 'Ivy Jones', initials: 'IJ' }];

describe('kit editor', () => {
  it('makes ids that are valid markbook ids', () => {
    expect(kitId()).toMatch(/^[a-z0-9]{10}$/);
  });

  it('splits a roster into even groups in roster order', () => {
    const groups = evenGroups(roster, 2);
    expect(groups.map((g) => g.students)).toEqual([['st_ann', 'st_cy', 'st_ed'], ['st_gus', 'st_ivy']]);
    expect(groups.map((g) => g.name)).toEqual(['Group 1', 'Group 2']);
  });

  it('adds a criterion with an outcome and emits the lesson', async () => {
    let current = lesson();
    const emit = vi.fn((next: Lesson) => { current = next; });
    const k = mountKitEditor({ getLesson: () => current, emit, classes: [{ id: 'class1', name: '7B' }], loadRoster: async () => roster, outcomes: async () => [{ id: 'ht4-9', label: 'HT4-9 Sources' }] });
    await new Promise((r) => setTimeout(r, 0));
    k.root.querySelector<HTMLButtonElement>('[data-add="criterion"]')!.click();
    expect(current.sprint!.criteria).toHaveLength(1);
    const text = k.root.querySelector<HTMLInputElement>('.kit-criterion input')!;
    text.value = 'Uses sources';
    text.dispatchEvent(new Event('input'));
    const out = k.root.querySelector<HTMLSelectElement>('.kit-criterion select')!;
    out.value = 'ht4-9';
    out.dispatchEvent(new Event('change'));
    expect(current.sprint!.criteria[0]).toMatchObject({ text: 'Uses sources', outcome: 'ht4-9' });
  });

  it('switches requirement phases with the chips', () => {
    let current = lesson();
    const k = mountKitEditor({ getLesson: () => current, emit: (next) => { current = next; }, classes: [], loadRoster: async () => [], outcomes: async () => [] });
    k.root.querySelector<HTMLButtonElement>('[data-add="requirement"]')!.click();
    k.root.querySelector<HTMLButtonElement>('.kit-requirement [data-phase="decide"]')!.click();
    expect(current.sprint!.requirements[0]!.phases).toEqual(['sketch', 'prototype', 'decide']);
  });
});

describe('sprint tabs', () => {
  it('shows the brief on Brief and each phase section on its tab', () => {
    const blocks = newSprintBlocks(id);
    const brief = { id: 'h1', block_type: 'heading' } as never;
    expect(inSprintTab(brief, 'brief')).toBe(true);
    expect(inSprintTab(blocks[1]!, 'sketch')).toBe(true);
    expect(inSprintTab(blocks[1]!, 'brief')).toBe(false);
    expect(inSprintTab(blocks[1]!, 'all')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-kit.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Write `apps/teaching/src/sprint/editor-tabs.ts`**

```ts
import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import { PHASE_LABELS, SPRINT_PHASES, type SprintPhaseKey } from './schema';
import { phaseOfSection } from './model';

export type SprintTab = 'kit' | 'brief' | SprintPhaseKey | 'all';

/** A top-level block shows on the canvas when it belongs to the chosen tab. Kit shows no blocks. */
export function inSprintTab(block: Block, tab: SprintTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'kit') return false;
  const key = phaseOfSection(block);
  return tab === 'brief' ? key === null : key === tab;
}

/** Kit, Brief, one per phase, All. They hide canvas rows and show the Kit; nothing moves. */
export function createSprintTabs(options: { onTab: (tab: SprintTab) => void }) {
  let tab: SprintTab = 'kit';
  const root = el('div', 'hub-pills sprint-edit-tabs');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Sprint part');
  const items: Array<[SprintTab, string]> = [['kit', 'Kit'], ['brief', 'Challenge'], ...SPRINT_PHASES.map((k): [SprintTab, string] => [k, PHASE_LABELS[k]]), ['all', 'All']];
  function paint(): void {
    root.replaceChildren(...items.map(([id, label]) => {
      const pill = el('button', 'hub-pills__btn', label);
      pill.type = 'button';
      pill.dataset.tab = id;
      pill.setAttribute('aria-pressed', String(id === tab));
      pill.classList.toggle('is-active', id === tab);
      pill.addEventListener('click', () => set(id));
      return pill;
    }));
    requestAnimationFrame(() => applyHubPillsThumb(root));
  }
  function set(id: SprintTab): void {
    if (tab === id) return;
    tab = id;
    paint();
    options.onTab(id);
  }
  paint();
  return { root, current: () => tab, repaint: paint, set };
}
```

- [ ] **Step 4: Write `apps/teaching/src/sprint/kit-editor.ts`**

```ts
import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { PHASE_LABELS, SPRINT_LIMITS, SPRINT_PHASES, type SprintGroup, type SprintPhaseKey, type SprintSettings } from './schema';
import { newSprintSettings } from './defaults';

export type KitEditorOptions = {
  getLesson: () => Lesson;
  emit: (next: Lesson) => void;
  /** The classes that teach this unit; the sprint belongs to one. */
  classes: Array<{ id: string; name: string }>;
  loadRoster: (classId: string) => Promise<Array<{ id: string; name: string; initials: string }>>;
  /** Outcomes the lesson's dot points reach, for linking criteria. */
  outcomes: () => Promise<Array<{ id: string; label: string }>>;
};

/** 10 lowercase letters and digits: valid as a markbook criterion id too. */
export function kitId(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) out += a[b % a.length];
  return out;
}

/** n groups, students in roster order, as even as possible. */
export function evenGroups(students: ReadonlyArray<{ id: string }>, n: number): SprintGroup[] {
  const count = Math.max(1, Math.min(SPRINT_LIMITS.groups, n));
  const groups: SprintGroup[] = Array.from({ length: count }, (_, i) => ({ id: kitId(), name: `Group ${i + 1}`, students: [] }));
  const size = Math.ceil(students.length / count);
  students.forEach((s, i) => groups[Math.min(count - 1, Math.floor(i / size))]!.students.push(s.id));
  return groups.filter((g) => g.students.length);
}

const SHORT: Record<SprintPhaseKey, string> = { understand: 'U', sketch: 'S', decide: 'D', prototype: 'P', test: 'T' };

/**
 * The Kit: everything set once and used through the phases. Every change
 * emits the whole lesson, as the canvas does; the page autosaves it.
 */
export function mountKitEditor(o: KitEditorOptions): { root: HTMLElement; repaint(): void; dispose(): void } {
  const root = el('section', 'kit');
  let outcomes: Array<{ id: string; label: string }> = [];
  let roster: Array<{ id: string; name: string; initials: string }> = [];
  const s = (): SprintSettings => o.getLesson().sprint ?? newSprintSettings(o.classes[0]?.id ?? '');
  const put = (change: (draft: SprintSettings) => void, repaint = false) => {
    const draft = structuredClone(s());
    change(draft);
    o.emit({ ...o.getLesson(), sprint: draft });
    if (repaint) paint();
  };
  const card = (title: string, why: string) => {
    const c = el('div', 'kit-card');
    c.append(el('h3', '', title), el('p', 'kit-why', why));
    root.append(c);
    return c;
  };
  const text = (value: string, max: number, onInput: (v: string) => void, label: string) => {
    const i = el('input', 'qz-input');
    i.maxLength = max;
    i.value = value;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => onInput(i.value));
    return i;
  };
  const selectOf = (options: Array<[string, string]>, value: string, onChange: (v: string) => void, label: string) => {
    const sel = el('select', 'qz-input');
    sel.setAttribute('aria-label', label);
    for (const [v, l] of options) { const op = el('option', '', l); op.value = v; op.selected = v === value; sel.append(op); }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  };

  function paint(): void {
    root.replaceChildren();
    const cur = s();

    const settings = card('Settings', 'How much scaffolding shows, who chooses the group’s idea, ideas each, and the class lock.');
    settings.append(
      selectOf([['guided', 'Guided (Years 7–8)'], ['standard', 'Standard (Years 9–10)'], ['open', 'Open (Years 11–12)']], cur.support, (v) => put((d) => { d.support = v as SprintSettings['support']; }), 'Support level'),
      selectOf([['teacher', 'Teacher confirms'], ['top_vote', 'Top vote goes through']], cur.decider, (v) => put((d) => { d.decider = v as SprintSettings['decider']; }), 'Who decides'),
      selectOf([1, 2, 3, 4, 5].map((n) => [String(n), `${n} ${n === 1 ? 'idea' : 'ideas'} each`]), String(cur.phases[1]!.ideas ?? 3), (v) => put((d) => { d.phases[0]!.ideas = Number(v); d.phases[1]!.ideas = Number(v); }), 'Ideas per person'),
      selectOf([0, 1, 2, 3, 4, 6, 12, 24].map((n) => [String(n), n === 0 ? 'No class lock' : `Lock for ${n} h`]), String(cur.lock_hours), (v) => put((d) => { d.lock_hours = Number(v); }), 'Class lock')
    );

    const crit = card('Criteria', 'Judged on Starting · Showing · Strong. Used for idea cards, votes, pitch feedback and your marks.');
    cur.criteria.forEach((c, i) => {
      const row = el('div', 'kit-row kit-criterion');
      row.append(
        text(c.text, 160, (v) => put((d) => { d.criteria[i]!.text = v; }), 'Criterion'),
        selectOf([['', 'No outcome'], ...outcomes.map((x): [string, string] => [x.id, x.label])], c.outcome ?? '', (v) => put((d) => { if (v) d.criteria[i]!.outcome = v; else delete d.criteria[i]!.outcome; }), 'Outcome'),
        button('Remove', 'ghost', () => put((d) => { d.criteria.splice(i, 1); }, true))
      );
      crit.append(row);
    });
    const addC = button('+ Criterion', 'ghost', () => put((d) => { d.criteria.push({ id: kitId(), text: 'New criterion' }); }, true));
    addC.dataset.add = 'criterion';
    addC.disabled = cur.criteria.length >= SPRINT_LIMITS.criteria;
    crit.append(addC);

    const refl = card('Reflection', 'Marked with its own criterion. Two prompts students answer at home after the pitch.');
    refl.append(
      text(cur.reflection_criteria[0]?.text ?? '', 160, (v) => put((d) => { d.reflection_criteria = [{ ...(d.reflection_criteria[0] ?? { id: kitId() }), text: v }]; }), 'Reflection criterion'),
      ...[0, 1].map((i) => text(cur.reflection_prompts[i] ?? '', 200, (v) => put((d) => { d.reflection_prompts[i] = v; }), `Reflection prompt ${i + 1}`))
    );

    const req = card('Requirements', 'Must-haves, yes or no. Students tick each one and say where it is.');
    cur.requirements.forEach((r, i) => {
      const row = el('div', 'kit-row kit-requirement');
      row.append(text(r.text, 160, (v) => put((d) => { d.requirements[i]!.text = v; }), 'Requirement'));
      const chips = el('span', 'kit-chips');
      for (const key of SPRINT_PHASES) {
        const on = r.phases.includes(key);
        const chip = el('button', `kit-chip${on ? ' kit-chip--on' : ''}`, SHORT[key]);
        chip.type = 'button';
        chip.dataset.phase = key;
        chip.title = PHASE_LABELS[key];
        chip.setAttribute('aria-pressed', String(on));
        chip.addEventListener('click', () => put((d) => {
          const p = d.requirements[i]!.phases;
          d.requirements[i]!.phases = on ? p.filter((x) => x !== key) : [...p, key];
        }, true));
        chips.append(chip);
      }
      row.append(chips, button('Remove', 'ghost', () => put((d) => { d.requirements.splice(i, 1); }, true)));
      req.append(row);
    });
    const addR = button('+ Requirement', 'ghost', () => put((d) => { d.requirements.push({ id: kitId(), text: 'New requirement', phases: ['sketch', 'prototype'] }); }, true));
    addR.dataset.add = 'requirement';
    addR.disabled = cur.requirements.length >= SPRINT_LIMITS.requirements;
    req.append(addR, el('p', 'kit-why', 'U Understand · S Sketch · D Decide · P Prototype · T Test'));

    const guide = card('Idea guide', 'Shown in Sketch and Decide. Write the model on a different topic from the challenge, so students follow it without copying it.');
    const lines = el('textarea', 'qz-input');
    lines.rows = 5;
    lines.value = cur.idea_guide.checklist.join('\n');
    lines.setAttribute('aria-label', 'Good idea checklist, one per line');
    lines.addEventListener('input', () => put((d) => { d.idea_guide.checklist = lines.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8); }));
    const modelText = el('textarea', 'qz-input');
    modelText.rows = 3;
    modelText.value = cur.idea_guide.model.text;
    modelText.setAttribute('aria-label', 'Model idea');
    modelText.addEventListener('input', () => put((d) => { d.idea_guide.model.text = modelText.value; }));
    const notes = el('textarea', 'qz-input');
    notes.rows = 3;
    notes.value = cur.idea_guide.model.notes.join('\n');
    notes.setAttribute('aria-label', 'What each part of the model does, one per line');
    notes.addEventListener('input', () => put((d) => { d.idea_guide.model.notes = notes.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6); }));
    guide.append(el('label', 'kit-label', 'Good idea checklist'), lines, el('label', 'kit-label', 'Model topic'), text(cur.idea_guide.model.topic, 80, (v) => put((d) => { d.idea_guide.model.topic = v; }), 'Model topic'), el('label', 'kit-label', 'Model idea'), modelText, el('label', 'kit-label', 'What each part does'), notes);

    const phases = card('Phases and deadlines', 'A phase opens when the one before is due, everyone in the group is in, or its class part ends.');
    cur.phases.forEach((p, i) => {
      const row = el('div', 'kit-row kit-phase');
      const date = el('input', 'qz-input');
      date.type = 'date';
      date.value = p.due_date;
      date.setAttribute('aria-label', `${PHASE_LABELS[p.key]} due date`);
      date.addEventListener('change', () => put((d) => { d.phases[i]!.due_date = date.value; }));
      const time = el('input', 'qz-input');
      time.type = 'time';
      time.value = p.due_time;
      time.setAttribute('aria-label', `${PHASE_LABELS[p.key]} due time`);
      time.addEventListener('change', () => put((d) => { d.phases[i]!.due_time = time.value; }));
      row.append(el('strong', '', PHASE_LABELS[p.key]), selectOf([['class', 'Class'], ['home', 'Home']], p.where, (v) => put((d) => { d.phases[i]!.where = v as 'class' | 'home'; }, true), `${PHASE_LABELS[p.key]} where`), date, time);
      if (p.where === 'class') {
        const ends = el('input', 'qz-input');
        ends.type = 'datetime-local';
        ends.value = p.ends_at;
        ends.setAttribute('aria-label', `${PHASE_LABELS[p.key]} class part ends`);
        ends.addEventListener('change', () => put((d) => { d.phases[i]!.ends_at = ends.value.slice(0, 16); }));
        row.append(el('label', 'kit-label', 'Class part ends (optional)'), ends);
      }
      row.append(
        text(p.instruction, 600, (v) => put((d) => { d.phases[i]!.instruction = v; }), `${PHASE_LABELS[p.key]} instruction`),
        text(p.stretch, 300, (v) => put((d) => { d.phases[i]!.stretch = v; }), `${PHASE_LABELS[p.key]} stretch`)
      );
      phases.append(row);
    });

    const groups = card('Groups', 'Groups for this sprint only. Students join by their initials.');
    if (!o.classes.length) groups.append(el('p', 'kit-why', 'Add this unit to a class first.'));
    else {
      groups.append(selectOf(o.classes.map((c): [string, string] => [c.id, c.name]), cur.class_id, (v) => { put((d) => { d.class_id = v; d.groups = []; }); void loadRoster(v); }, 'Class'));
      const n = el('input', 'qz-input');
      n.type = 'number';
      n.min = '1';
      n.max = String(SPRINT_LIMITS.groups);
      n.value = String(Math.max(1, cur.groups.length || Math.ceil(roster.length / 4)));
      n.setAttribute('aria-label', 'How many groups');
      groups.append(n, button('Make even groups', 'secondary', () => put((d) => { d.groups = evenGroups(roster, Number(n.value)); }, true)));
      const byStudent = new Map(cur.groups.flatMap((g) => g.students.map((st) => [st, g.id] as const)));
      for (const g of cur.groups) {
        groups.append(text(g.name, 40, (v) => put((d) => { const x = d.groups.find((y) => y.id === g.id); if (x) x.name = v; }), 'Group name'));
      }
      for (const st of roster) {
        const row = el('div', 'kit-row');
        row.append(el('span', '', `${st.initials} · ${st.name}`), selectOf([['', 'No group'], ...cur.groups.map((g): [string, string] => [g.id, g.name])], byStudent.get(st.id) ?? '', (v) => put((d) => {
          d.groups = d.groups.map((g) => ({ ...g, students: g.students.filter((x) => x !== st.id) }));
          const to = d.groups.find((g) => g.id === v);
          if (to) to.students.push(st.id);
        }), `${st.name}'s group`));
        groups.append(row);
      }
    }
  }

  async function loadRoster(classId: string): Promise<void> {
    if (!classId) return;
    try { roster = await o.loadRoster(classId); } catch { roster = []; }
    paint();
  }

  paint();
  void o.outcomes().then((list) => { outcomes = list; paint(); }).catch(() => {});
  void loadRoster(s().class_id);
  return { root, repaint: paint, dispose() {} };
}
```

The roster's names show only on this teacher screen. Nothing personal is written into the repo.

- [ ] **Step 5: Wire the Kit, tabs and map into the lesson page**

In `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`:

Imports (beside the tutorial ones):

```ts
import { mountKitEditor } from '@/sprint/kit-editor';
import { createSprintTabs, inSprintTab, type SprintTab } from '@/sprint/editor-tabs';
import { mountSprintMap, type SprintMapHandle } from '@/sprint/map';
import { sprintTeacherApi } from '@/sprint/api';
import { newSprintSettings, newSprintBlocks } from '@/sprint/defaults';
import { phaseOfSection } from '@/sprint/model';
import { httpMarkbookApi } from '@/markbook/api';
import { outcomeLabels } from '@/markbook/parse';
import { peekCurriculum } from '@/app/curriculum-state';
import { loadAlignment } from '@/alignment/api';
import { dotPointOutcomes } from '@/evidence/syllabus';
```

After the tutorial panel block (after `function syncTutorialPanel() {…}`), add:

```ts
  // A lesson set to Design Sprint gets the progress map, the Kit and the phase tabs.
  const sprintHost = document.createElement('div');
  sprintHost.className = 'lesson-page__sprint';
  let sprintTabs: ReturnType<typeof createSprintTabs> | null = null;
  let sprintKit: ReturnType<typeof mountKitEditor> | null = null;
  let sprintMap: SprintMapHandle | null = null;
  const sprintOutcomes = async (): Promise<Array<{ id: string; label: string }>> => {
    const labels = outcomeLabels(peekCurriculum()?.outcomes ?? []);
    const alignment = await loadAlignment().catch(() => null);
    const tags = dotPointOutcomes(lesson.dot_points ?? [], alignment, labels).map((t) => t.slice(4));
    const pick = tags.length ? labels.filter((l) => tags.includes(l.id)) : labels;
    return pick.map((l) => ({ id: l.id, label: `${l.code} ${l.title}` }));
  };
  function syncSprintPanel(): void {
    const isSprint = resolvePedagogicalMode(lesson.pedagogical_mode) === 'design_sprint';
    const classes = options.flowClasses ?? [];
    // A new sprint starts with the default Kit and one guide section per phase.
    if (isSprint && !lesson.sprint && classes.length) {
      // emitLesson only records the lesson, so redraw the canvas for the new sections and carry on mounting.
      emitLesson({ ...lesson, sprint: newSprintSettings(classes[0]!.id), blocks: [...lesson.blocks, ...newSprintBlocks(options.idFactory)] });
      canvas.update(lesson.blocks, media);
    }
    if (isSprint && !sprintTabs) {
      sprintTabs = createSprintTabs({ onTab: showSprintTab });
      sprintKit = mountKitEditor({
        getLesson: () => lesson,
        emit: emitLesson,
        classes,
        loadRoster: (classId) => httpMarkbookApi.load(classId).then((v) => v.students.filter((s) => !s.removed)),
        outcomes: sprintOutcomes
      });
      sprintMap = lesson.published_at ? mountSprintMap({ getLesson: () => lesson, api: sprintTeacherApi(lesson.id), emitLesson }) : null;
      sprintHost.append(...(sprintMap ? [sprintMap.root] : []), sprintTabs.root, sprintKit.root);
      if (sprintMap) void sprintMap.refresh();
    } else if (!isSprint && sprintTabs) {
      sprintMap?.dispose();
      sprintMap = null;
      sprintKit = null;
      sprintTabs = null;
      sprintHost.replaceChildren();
    }
    if (sprintKit) sprintKit.root.hidden = sprintTabs?.current() !== 'kit';
    sprintHost.hidden = !isSprint;
  }
  function showSprintTab(_tab: SprintTab): void {
    if (sprintKit) sprintKit.root.hidden = sprintTabs?.current() !== 'kit';
    canvas.clearSelection();
    canvas.update(lesson.blocks, media);
  }
```

Then:
1. Call `syncSprintPanel();` next to every `syncTutorialPanel();` call (search for it; it is called on mount and on lesson update ~1033).
2. In `root.append(coverHost, metaRow, quizHost, lectureHost, tutorialHost, canvasHost);` add `sprintHost` after `tutorialHost`.
3. In the canvas row filter at ~1197, after the tutorial line, add:
   ```ts
   if (sprintTabs && lesson.blocks.some((b) => b.id === block.id)) row.hidden = !inSprintTab(block, sprintTabs.current());
   ```
4. At ~1230, change `if (tutorialTabs) canvas.update(lesson.blocks, media);` to `if (tutorialTabs || sprintTabs) canvas.update(lesson.blocks, media);`.
5. At ~1347 (revealing a block on another tab), add after the tutorial line:
   ```ts
   if (sprintTabs && target && !inSprintTab(target, sprintTabs.current())) sprintTabs.set(phaseOfSection(target) ?? 'brief');
   ```
6. In the insert-target function (`tutorialInsertTarget`, ~1160), add at its top so new blocks on a phase tab land in that phase's section:
   ```ts
   const st = sprintTabs?.current();
   if (sprintTabs && st && st !== 'kit' && st !== 'brief' && st !== 'all') {
     const section = lesson.blocks.find((b) => phaseOfSection(b) === st);
     if (section && section.block_type === 'section') return { parent: { kind: 'section', id: section.id }, index: section.content.blocks.length };
   }
   ```

`mountSprintMap` and `SprintMapHandle` come from Task 16. Until Task 16 lands, keep the `sprintMap` lines but import a stub: create `apps/teaching/src/sprint/map.ts` now with

```ts
import type { Lesson } from '@/schemas/lesson';
import type { SprintTeacherApi } from './api';
export type SprintMapHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };
export function mountSprintMap(_o: { getLesson: () => Lesson; api: SprintTeacherApi; emitLesson: (next: Lesson) => void }): SprintMapHandle {
  return { root: document.createElement('div'), refresh: async () => {}, dispose() {} };
}
```

Task 16 replaces this file.

- [ ] **Step 6: Append Kit styles to `sprint.css`**

```css
/* Teacher: Kit and tabs. */
.kit { display: grid; gap: 14px; margin: 12px 0; }
.kit-card { padding: 16px; border-radius: var(--radius-lg); background: rgba(255,255,255,.75); border: 1px solid var(--line); display: grid; gap: 8px; }
.kit-why { color: var(--muted); font-size: 13px; margin: 0; }
.kit-label { font-size: 13px; font-weight: 600; }
.kit-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px; background: #fff; border: 1px solid var(--line); border-radius: 12px; }
.kit-row .qz-input { flex: 1 1 180px; min-width: 0; }
.kit-chips { display: inline-flex; gap: 4px; }
.kit-chip { font: inherit; font-size: 11px; font-weight: 700; width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--line); background: var(--paper, #fbf8f2); color: var(--muted); cursor: pointer; }
.kit-chip--on { background: var(--navy); color: #fff; border-color: var(--navy); }
.sprint-edit-tabs { margin: 12px 0; }
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-kit.test.ts tests/unit/tutorial-lesson-page.test.ts && npx tsc --noEmit`
Expected: PASS (the tutorial page test proves the tutorial wiring is untouched).

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/sprint/kit-editor.ts apps/teaching/src/sprint/editor-tabs.ts apps/teaching/src/sprint/map.ts apps/teaching/src/sprint/sprint.css apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/tests/unit/sprint-kit.test.ts
git commit -m "Teaching sprint: Kit editor, phase tabs and new-sprint defaults on the lesson page"
```

---

### Task 16: Progress map and group board

**Files:**
- Replace: `apps/teaching/src/sprint/map.ts`
- Create: `apps/teaching/src/sprint/group-board.ts`
- Modify: `apps/teaching/src/sprint/sprint.css` (append)
- Test: `apps/teaching/tests/unit/sprint-map.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-map.test.ts
import { describe, it, expect, vi } from 'vitest';
import { mountSprintMap } from '@/sprint/map';
import type { SprintSummary, SprintTeacherApi } from '@/sprint/api';
import { newSprintSettings } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

const phases = (over: Record<string, string> = {}) => ({ understand: 'in', sketch: 'none', decide: 'none', prototype: 'none', test: 'none', ...over }) as never;
const opened = (over: Record<string, boolean> = {}) => ({ understand: true, sketch: false, decide: false, prototype: false, test: false, ...over }) as never;
const summary = (): SprintSummary => ({
  groups: [
    { id: 'g1', name: 'Kestrel', open: ['understand', 'sketch', 'decide'], awaiting: { kind: 'idea', tie: false, empty: false }, chosen: false, question: 'How might we?',
      students: [{ id: 'st_ann', initials: 'AB', name: 'Ann Bell', phases: phases({ sketch: 'in', decide: 'draft' }), opened: opened({ decide: true }) }, { id: 'st_cy', initials: 'CD', name: 'Cy Dale', phases: phases({ sketch: 'late' }), opened: opened() }] },
    { id: 'g2', name: 'Heron', open: ['understand'], awaiting: null, chosen: false, question: null,
      students: [{ id: 'st_ed', initials: 'EF', name: 'Ed Fox', phases: phases({ understand: 'draft' }), opened: opened() }] }
  ],
  class_parts: { understand: 'ended', decide: 'open', test: 'open' }, ended: {}, lock: null, extend: {}, running: null, spotlight: null
});
const api = (): SprintTeacherApi => ({ summary: vi.fn(async () => summary()), endClass: vi.fn(async () => summary()), board: vi.fn(async () => ({ group: { id: 'g1', name: 'Kestrel' }, notes: [], gallery: [], totals: {}, heat: {}, reasons: [], parts: [], pitch: null, subs: { prototype: [], test: [] }, round: null, awaiting: null, question: null, chosen: null })) }) as unknown as SprintTeacherApi;
const lesson = { id: 'l1', title: 'Pompeii', sprint: newSprintSettings('class1') } as unknown as Lesson;

describe('progress map', () => {
  it('draws a row per group with a dot per student and the waiting badge', async () => {
    const m = mountSprintMap({ getLesson: () => lesson, api: api(), emitLesson: vi.fn() });
    await m.refresh();
    expect(m.root.querySelectorAll('.smap-row')).toHaveLength(2);
    const kestrel = m.root.querySelector('.smap-row')!;
    expect(kestrel.querySelectorAll('.smap-cell')[1]!.querySelectorAll('.dot--in, .dot--late')).toHaveLength(2);
    expect(kestrel.textContent).toContain('Choose idea');
    expect(m.root.querySelector('.dot--late')?.getAttribute('title')).toBe('Cy Dale: in late');
  });

  it('End class part says who will be marked absent before it ends', async () => {
    const a = api();
    const m = mountSprintMap({ getLesson: () => lesson, api: a, emitLesson: vi.fn() });
    await m.refresh();
    m.root.querySelector<HTMLButtonElement>('[data-end="decide"]')!.click();
    const confirm = m.root.querySelector('.smap-confirm')!;
    expect(confirm.textContent).toContain('1 draft will be submitted as it is');
    expect(confirm.textContent).toContain('Mark 2 students absent (CD, EF)');
    confirm.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(a.endClass).toHaveBeenCalledWith('decide');
  });

  it('opens a group board from its row', async () => {
    const a = api();
    const m = mountSprintMap({ getLesson: () => lesson, api: a, emitLesson: vi.fn() });
    await m.refresh();
    m.root.querySelector<HTMLElement>('.smap-cell')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.board).toHaveBeenCalledWith('g1');
    expect(m.root.querySelector('.sboard')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-map.test.ts`
Expected: FAIL (the stub map draws nothing).

- [ ] **Step 3: Write `apps/teaching/src/sprint/map.ts`**

```ts
import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { dueText } from './player';
import { PHASE_LABELS, SPRINT_PHASES, type SprintPhaseKey } from './schema';
import { mountGroupBoard } from './group-board';
import { openPitchView } from './pitch-view';
import type { MapGroup, SprintSummary, SprintTeacherApi } from './api';
import './sprint.css';

export type SprintMapHandle = { root: HTMLElement; refresh(): Promise<void>; dispose(): void };
const POLL_MS = 15000;
const STATE_TEXT = { none: 'not in', draft: 'started', in: 'in', late: 'in late' } as const;
const DOT = { none: 'dot--none', draft: 'dot--started', in: 'dot--in', late: 'dot--late' } as const;

function badge(g: MapGroup, key: SprintPhaseKey): string {
  const a = g.awaiting;
  if (!a) return '';
  if (a.kind === 'question' && key === 'understand') return a.empty ? 'No questions in' : a.tie ? 'Tie: choose question' : 'Choose question';
  if (a.kind === 'idea' && key === 'decide') return a.empty ? 'No ideas in' : a.tie ? 'Tie: choose idea' : 'Choose idea';
  return '';
}

/**
 * The teacher's progress map: phases across, groups down, a dot per student.
 * Names show here only. Clicking a row opens that group's board below.
 */
export function mountSprintMap(o: { getLesson: () => Lesson; api: SprintTeacherApi; emitLesson: (next: Lesson) => void }): SprintMapHandle {
  const root = el('section', 'smap');
  const head = el('header', 'smap__head');
  const notice = el('div', 'smap__notice');
  const grid = el('div', 'smap__grid');
  const confirmHost = el('div');
  const boardHost = el('div');
  const error = el('p', 'sprint-submit__err');
  error.setAttribute('role', 'alert');
  root.append(head, notice, confirmHost, grid, boardHost, error);
  let summary: SprintSummary | null = null;
  let poll = 0;
  let board: { refresh(): Promise<void>; dispose(): void } | null = null;

  const run = async (p: Promise<SprintSummary>) => {
    try { summary = await p; paint(); } catch (e) { error.textContent = e instanceof Error ? e.message : 'That didn’t work.'; }
  };

  function confirmEnd(key: SprintPhaseKey): void {
    if (!summary) return;
    const students = summary.groups.flatMap((g) => g.students);
    const drafts = students.filter((s) => s.opened[key] && s.phases[key] === 'draft').length;
    const absent = students.filter((s) => !s.opened[key]);
    const hours = o.getLesson().sprint?.lock_hours ?? 2;
    const box = el('div', 'smap-confirm');
    const ul = el('ul');
    ul.append(
      el('li', '', `Freeze ${PHASE_LABELS[key]} class work${drafts ? ` (${drafts} ${drafts === 1 ? 'draft will be submitted as it is' : 'drafts will be submitted as they are'})` : ''}`),
      el('li', '', hours ? `Lock the sprint for ${hours} h` : 'No class lock is set'),
      el('li', '', `Open ${PHASE_LABELS[SPRINT_PHASES[SPRINT_PHASES.indexOf(key) + 1] ?? key]} when the lock lifts`)
    );
    if (absent.length) ul.append(el('li', '', `Mark ${absent.length} ${absent.length === 1 ? 'student' : 'students'} absent (${absent.map((s) => s.initials).join(', ')}): they can catch up from home after the lock`));
    box.append(el('strong', '', `End the ${PHASE_LABELS[key]} class part?`), ul, button('End and lock', 'primary', () => { confirmHost.replaceChildren(); void run(o.api.endClass(key)); }), button('Not yet', 'secondary', () => confirmHost.replaceChildren()));
    confirmHost.replaceChildren(box);
  }

  function extendForm(): void {
    if (!summary) return;
    const box = el('div', 'smap-confirm');
    const scope = el('select', 'qz-input');
    for (const [v, l] of [['class', 'Whole class'], ['group', 'One group'], ['student', 'One student']]) { const op = el('option', '', l); op.value = v; scope.append(op); }
    const who = el('select', 'qz-input');
    const fill = () => {
      who.replaceChildren();
      who.hidden = scope.value === 'class';
      const items = scope.value === 'group' ? summary!.groups.map((g) => [g.id, g.name]) : summary!.groups.flatMap((g) => g.students.map((s) => [s.id, `${s.initials} · ${s.name}`]));
      for (const [v, l] of items) { const op = el('option', '', l); op.value = v!; who.append(op); }
    };
    scope.addEventListener('change', fill);
    fill();
    const phase = el('select', 'qz-input');
    for (const k of SPRINT_PHASES) { const op = el('option', '', PHASE_LABELS[k]); op.value = k; phase.append(op); }
    const date = el('input', 'qz-input'); date.type = 'date';
    const time = el('input', 'qz-input'); time.type = 'time'; time.value = '15:00';
    for (const [c, l] of [[scope, 'Extend for'], [who, 'Who'], [phase, 'Phase'], [date, 'New due date'], [time, 'New due time']] as const) c.setAttribute('aria-label', l);
    box.append(el('strong', '', 'Extend a deadline'), scope, who, phase, date, time, button('Extend', 'primary', () => {
      if (!date.value) return;
      confirmHost.replaceChildren();
      void run(o.api.extend({ scope: scope.value as 'class' | 'group' | 'student', ...(scope.value === 'class' ? {} : { id: who.value }), phase: phase.value as SprintPhaseKey, due_date: date.value, due_time: time.value || '15:00' }));
    }), button('Cancel', 'secondary', () => confirmHost.replaceChildren()));
    confirmHost.replaceChildren(box);
  }

  function openBoard(groupId: string): void {
    board?.dispose();
    board = mountGroupBoard(boardHost, { api: o.api, groupId, getLesson: o.getLesson, emitLesson: o.emitLesson, onChanged: () => void refresh() });
  }

  function paint(): void {
    if (!summary) return;
    const s = summary;
    const sprint = o.getLesson().sprint;
    head.replaceChildren(
      el('h2', '', 'Progress map'),
      button('Extend a deadline', 'secondary', extendForm),
      ...(s.spotlight ? [button('Take down the spotlight', 'secondary', () => void run(o.api.clearSpotlight()))] : []),
      button('Run pitches', 'primary', () => openPitchView({ api: o.api, getLesson: o.getLesson, summary: s, onClose: () => void refresh() }))
    );
    notice.replaceChildren();
    if (s.lock) {
      const until = new Date(s.lock.until).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      const who = el('select', 'qz-input');
      who.setAttribute('aria-label', 'Unlock one student');
      who.append(el('option', '', 'Unlock one student…'));
      for (const st of s.groups.flatMap((g) => g.students)) { const op = el('option', '', `${st.initials} · ${st.name}`); op.value = st.id; who.append(op); }
      who.addEventListener('change', () => { if (who.value) void run(o.api.unlock(who.value)); });
      notice.append(el('span', 'pill pill--wait', `Locked until ${until}`), who);
    }
    grid.replaceChildren();
    const header = el('div', 'smap-row smap-row--head');
    header.append(el('div'));
    for (const key of SPRINT_PHASES) {
      const p = sprint?.phases.find((x) => x.key === key);
      const h = el('div', 'smap-ph');
      h.append(el('b', '', PHASE_LABELS[key]), el('span', `pill ${p?.where === 'class' ? 'pill--class' : 'pill--home'}`, p?.where === 'class' ? 'Class' : 'Home'), el('span', 'smap-due', p ? dueText(p.due_date, p.due_time, Date.now()) : ''));
      if (p?.where === 'class' && s.class_parts[key] === 'open' && s.groups.some((g) => g.open.includes(key))) {
        const end = button(`End class part · locks ${sprint?.lock_hours ?? 2} h`, 'secondary', () => confirmEnd(key));
        end.dataset.end = key;
        h.append(end);
      }
      if (s.class_parts[key] === 'ended') h.append(el('span', 'smap-due', 'Class part ended'));
      header.append(h);
    }
    grid.append(header);
    for (const g of s.groups) {
      const row = el('div', 'smap-row');
      const name = el('div', 'smap-name');
      name.append(el('b', '', g.name), el('span', '', g.students.map((x) => x.initials).join(' · ')));
      row.append(name);
      for (const key of SPRINT_PHASES) {
        const cell = el('div', `smap-cell${g.open.at(-1) === key ? ' smap-cell--now' : ''}`);
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `${g.name}, ${PHASE_LABELS[key]}`);
        for (const st of g.students) {
          const d = el('i', `dot ${DOT[st.phases[key]]}`);
          d.title = `${st.name}: ${STATE_TEXT[st.phases[key]]}`;
          cell.append(d);
        }
        const b = badge(g, key);
        if (b) cell.append(el('span', 'pill pill--wait', b));
        if ((key === 'prototype' || key === 'test') && g.students.some((st) => st.phases[key] === 'in' || st.phases[key] === 'late')) cell.append(el('span', 'pill pill--mark', 'Mark'));
        const open = () => openBoard(g.id);
        cell.addEventListener('click', open);
        cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        row.append(cell);
      }
      grid.append(row);
    }
  }

  async function refresh(): Promise<void> {
    try {
      summary = await o.api.summary();
      error.textContent = '';
      paint();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'The map didn’t load.';
    }
  }

  poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  return { root, refresh, dispose() { window.clearInterval(poll); board?.dispose(); } };
}
```

`openPitchView` comes from Task 18. Until then, create `apps/teaching/src/sprint/pitch-view.ts` with a stub:

```ts
import type { Lesson } from '@/schemas/lesson';
import type { SprintSummary, SprintTeacherApi } from './api';
export function openPitchView(_o: { api: SprintTeacherApi; getLesson: () => Lesson; summary: SprintSummary; onClose(): void }): () => void {
  return () => {};
}
```

- [ ] **Step 4: Write `apps/teaching/src/sprint/group-board.ts`**

```ts
import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import { LEVEL_LABELS } from './schema';
import { mountMarking } from './marking';
import type { GroupBoard, SprintTeacherApi } from './api';

/**
 * One group's board for the teacher: its questions, the gallery with
 * authors, heat and vote totals, the reasons, parts, pitch file, the work to
 * mark and the pitch feedback with hold-and-release. Spotlight puts one
 * answer up for the class with no name.
 */
export function mountGroupBoard(host: HTMLElement, o: { api: SprintTeacherApi; groupId: string; getLesson: () => Lesson; emitLesson: (next: Lesson) => void; onChanged(): void }): { refresh(): Promise<void>; dispose(): void } {
  const root = el('section', 'sboard');
  host.replaceChildren(root);
  let disposed = false;
  const act = async (p: Promise<unknown>) => { try { await p; o.onChanged(); await refresh(); } catch (e) { root.append(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'That didn’t work.')); } };
  const crit = () => o.getLesson().sprint?.criteria ?? [];

  function paint(b: GroupBoard): void {
    root.replaceChildren();
    root.append(el('h2', '', `Group ${b.group.name}`));

    const q = el('div', 'sboard__part');
    q.append(el('h3', '', 'Questions'), el('p', 'sprint-note', b.question ? `Group question: ${b.question.text}` : b.awaiting?.kind === 'question' ? 'Waiting for you to choose the question.' : 'The question is chosen when Understand closes.'));
    for (const n of b.notes) {
      const r = el('div', 'kit-row');
      r.append(el('span', '', `${n.text} · ${n.name}`), button('Spotlight', 'ghost', () => void act(o.api.spotlight(n.student_id, 'understand', `notes.${n.index}`))));
      if (b.awaiting?.kind === 'question') r.append(button('Choose this one', 'secondary', () => void act(o.api.confirm(b.group.id, 'question', n.id))));
      q.append(r);
    }
    root.append(q);

    const g = el('div', 'sboard__part');
    g.append(el('h3', '', 'Gallery'), el('p', 'sprint-note', b.chosen ? 'The idea is chosen.' : b.awaiting?.kind === 'idea' ? 'Voting has closed. Choose the idea.' : 'Votes are open.'));
    for (const set of b.gallery) {
      g.append(el('p', 'kit-label', set.name));
      for (const i of set.ideas) {
        const r = el('div', `kit-row${b.chosen === i.id ? ' sboard__chosen' : ''}`);
        const heat = el('span', 'sprint-heat');
        for (const c of crit()) { const cell = el('i'); cell.dataset.level = String(b.heat[i.id]?.[c.id] ?? 0); cell.title = c.text; heat.append(cell); }
        r.append(el('span', '', `${i.title}${i.strongest ? ' (their strongest)' : ''} · ${b.totals[i.id] ?? 0} votes`), heat);
        if (typeof i.index === 'number') r.append(button('Spotlight', 'ghost', () => void act(o.api.spotlight(set.student_id, 'sketch', `cards.${i.index}.idea`))));
        if (b.awaiting?.kind === 'idea' || (!b.chosen && b.awaiting === null)) r.append(button(b.awaiting?.kind === 'idea' ? 'Choose this idea' : 'Pick this idea', 'secondary', () => void act(o.api.confirm(b.group.id, 'idea', i.id))));
        g.append(r);
      }
    }
    root.append(g);

    if (b.reasons.some((r) => Object.keys(r.reasons).length)) {
      const rs = el('div', 'sboard__part');
      rs.append(el('h3', '', 'Vote reasons'));
      for (const r of b.reasons) for (const c of crit()) if (r.reasons[c.id]) rs.append(el('p', '', `${r.name}, ${c.text}: ${r.reasons[c.id]}`));
      root.append(rs);
    }

    const p = el('div', 'sboard__part');
    p.append(el('h3', '', 'Parts and pitch file'));
    for (const part of b.parts) p.append(el('p', '', `${part.text}: ${part.by.join(', ') || 'unclaimed'}`));
    if (b.pitch) {
      const pitch = b.pitch;
      p.append(button(`Open pitch file (${pitch.kind === 'link' ? pitch.link : pitch.name}) · set by ${pitch.by}`, 'ghost', async () => {
        if (pitch.kind === 'link' && pitch.link) window.open(pitch.link, '_blank', 'noopener');
        else if (pitch.file) window.open(await o.api.fileUrl(pitch.file), '_blank', 'noopener');
      }));
    }
    root.append(p);

    const mark = el('div', 'sboard__part');
    mark.append(el('h3', '', 'Marking'));
    const markHost = el('div');
    const inProto = b.subs.prototype.filter((x) => x.sub?.submitted_at).length;
    const inTest = b.subs.test.filter((x) => x.sub?.submitted_at).length;
    mark.append(
      button(`Mark prototype parts (${inProto} in)`, 'secondary', () => mountMarking(markHost, { kind: 'prototype', board: b, api: o.api, getLesson: o.getLesson, emitLesson: o.emitLesson })),
      button(`Mark reflections (${inTest} in)`, 'secondary', () => mountMarking(markHost, { kind: 'reflection', board: b, api: o.api, getLesson: o.getLesson, emitLesson: o.emitLesson })),
      markHost
    );
    root.append(mark);

    if (b.round) {
      const rd = el('div', 'sboard__part');
      rd.append(el('h3', '', `Pitch feedback (${b.round.status})`));
      for (const e of b.round.entries) {
        const r = el('div', 'kit-row');
        const levels = crit().map((c) => `${c.text}: ${LEVEL_LABELS[(e.levels[c.id] ?? 1) - 1]}`).join(' · ');
        r.append(el('span', '', `${e.name} · ${levels} · ${e.worked} ${e.next}${e.flagged ? ' · held' : ''}`));
        if (e.status === 'held') r.append(button('Release', 'secondary', () => void act(o.api.moderate(b.group.id, e.student_id, 'released'))));
        if (e.status !== 'removed') r.append(button('Remove', 'ghost', () => void act(o.api.moderate(b.group.id, e.student_id, 'removed'))));
        rd.append(r);
      }
      root.append(rd);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const b = await o.api.board(o.groupId);
      if (!disposed) paint(b);
    } catch (e) {
      root.replaceChildren(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'The board didn’t load.'));
    }
  }
  void refresh();
  return { refresh, dispose() { disposed = true; host.replaceChildren(); } };
}
```

`mountMarking` comes from Task 17. Until then, create `apps/teaching/src/sprint/marking.ts` with a stub:

```ts
import type { Lesson } from '@/schemas/lesson';
import type { GroupBoard, SprintTeacherApi } from './api';
export function mountMarking(host: HTMLElement, _o: { kind: 'prototype' | 'reflection'; board: GroupBoard; api: SprintTeacherApi; getLesson: () => Lesson; emitLesson: (next: Lesson) => void }): void {
  host.replaceChildren();
}
```

- [ ] **Step 5: Append map and board styles**

```css
/* Teacher: progress map and group board. */
.smap { padding: 16px; border-radius: var(--radius-lg); background: rgba(255,255,255,.75); border: 1px solid var(--line); display: grid; gap: 10px; margin-bottom: 12px; }
.smap__head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.smap__head h2 { margin-right: auto; }
.smap__notice { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.smap-row { display: grid; grid-template-columns: 150px repeat(5, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
.smap-row > div { padding: 10px; }
.smap-ph { display: grid; gap: 4px; font-size: 13px; }
.smap-due { color: var(--muted); font-size: 12px; }
.smap-name span { display: block; color: var(--muted); font-size: 12px; }
.smap-cell { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; cursor: pointer; border-radius: 10px; }
.smap-cell:hover, .smap-cell:focus-visible { background: rgba(23,55,94,.06); }
.smap-cell--now { background: rgba(23,55,94,.03); }
.smap-confirm { padding: 14px; border-radius: 14px; background: var(--pastel-gold); color: var(--pastel-gold-ink); display: grid; gap: 8px; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--navy); }
.dot--in { background: var(--navy); }
.dot--none { border-color: rgba(23,55,94,.18); }
.dot--late { background: var(--pastel-gold-ink); border-color: var(--pastel-gold-ink); }
.pill { display: inline-flex; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.pill--class { background: var(--pastel-blue); color: var(--pastel-blue-ink); }
.pill--home { background: var(--pastel-peach); color: var(--pastel-peach-ink); }
.pill--wait { background: var(--pastel-lilac); color: var(--pastel-lilac-ink); }
.pill--mark { background: var(--pastel-gold); color: var(--pastel-gold-ink); }
.sboard { display: grid; gap: 12px; padding: 16px; border-radius: var(--radius-lg); background: rgba(255,255,255,.75); border: 1px solid var(--line); }
.sboard__part { display: grid; gap: 6px; }
.sboard__chosen { border-color: var(--navy); }
@media (max-width: 600px) {
  .smap-row--head { display: none; }
  .smap-row { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; padding: 10px 0; }
  .smap-name { grid-column: 1 / -1; padding: 0 4px; }
  .smap-cell { padding: 6px 4px; justify-content: center; background: var(--paper, #fbf8f2); }
  .smap-cell .pill { display: none; }
}
```

Check the `.pill` and `.dot` class names don't clash with existing Teaching styles (`grep -rn "\.pill\b\|\.dot\b" apps/teaching/src --include=*.css`). If they do, prefix them `sprint-pill` / `sprint-dot` in both the CSS and `map.ts`, and in the test's selectors.

- [ ] **Step 6: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-map.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/sprint/map.ts apps/teaching/src/sprint/group-board.ts apps/teaching/src/sprint/marking.ts apps/teaching/src/sprint/pitch-view.ts apps/teaching/src/sprint/sprint.css apps/teaching/tests/unit/sprint-map.test.ts
git commit -m "Teaching sprint: progress map, End class part, extend, unlock and group board"
```

---

### Task 17: Marking into the markbook

**Files:**
- Replace: `apps/teaching/src/sprint/marking.ts`
- Test: `apps/teaching/tests/unit/sprint-marking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-marking.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sprintColumn, markId, ensureColumns } from '@/sprint/marking';
import { checkColumn } from '@/markbook/schema';
import { newSprintSettings } from '@/sprint/defaults';
import type { Lesson } from '@/schemas/lesson';

const settings = { ...newSprintSettings('class1'), criteria: [{ id: 'abcdefgh12', text: 'Uses sources', outcome: 'ht4-9' }, { id: 'c2', text: 'Why it matters' }] };
settings.phases[4]!.due_date = '2026-11-12';
const lesson = { id: 'l1', title: 'Pompeii', sprint: settings } as unknown as Lesson;

describe('sprint marking', () => {
  it('turns any criterion id into a valid markbook id, keeping ones that already are', () => {
    expect(markId('abcdefgh12')).toBe('abcdefgh12');
    expect(markId('c2')).toMatch(/^[a-z0-9]{8,24}$/);
    expect(markId('c2')).not.toBe(markId('c20'));
  });

  it('builds valid assessment columns: 3 marks a criterion, bands, outcomes', () => {
    const col = sprintColumn(lesson, 'prototype', 'col12345');
    expect(checkColumn(col)).toHaveProperty('column');
    expect(col).toMatchObject({ kind: 'assessment', title: 'Pompeii: Prototype', date: '2026-11-12', weight: 0 });
    expect(col.criteria[0]).toMatchObject({ max: 3, outcomes: ['ht4-9'] });
    expect(col.criteria[0]!.bands!.map((b) => b.label)).toEqual(['Starting', 'Showing', 'Strong']);
    expect(sprintColumn(lesson, 'reflection', 'col67890').criteria[0]!.label).toBe('Explains what the test showed and what to change next');
  });

  it('makes the two columns once and remembers them on the lesson', async () => {
    const markbook = { saveColumn: vi.fn(async () => ({})) } as never;
    const first = await ensureColumns(lesson, markbook);
    expect((markbook as { saveColumn: ReturnType<typeof vi.fn> }).saveColumn).toHaveBeenCalledTimes(2);
    const again = await ensureColumns(first.lesson, markbook);
    expect((markbook as { saveColumn: ReturnType<typeof vi.fn> }).saveColumn).toHaveBeenCalledTimes(2);
    expect(again.ids).toEqual(first.ids);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-marking.test.ts`
Expected: FAIL, `sprintColumn` is not exported (the stub).

- [ ] **Step 3: Write `apps/teaching/src/sprint/marking.ts`**

```ts
import type { Lesson } from '@/schemas/lesson';
import type { AssessmentColumn, AssessmentMark } from '@/markbook/schema';
import { httpMarkbookApi, type MarkbookApi } from '@/markbook/api';
import { button, el } from '@/quiz/dom';
import { LEVEL_LABELS, type Level } from './schema';
import { kitId } from './kit-editor';
import type { BoardSub, GroupBoard, SprintTeacherApi } from './api';

/**
 * Sprint marks live in two markbook assessment columns, so the evidence
 * layer, Patterns and Next steps use them like any assessment. Each sprint
 * criterion is a column criterion worth 3: Starting 1, Showing 2, Strong 3.
 */

export type MarkKind = 'prototype' | 'reflection';
const BANDS = [{ label: 'Starting', min: 1 }, { label: 'Showing', min: 2 }, { label: 'Strong', min: 3 }];

/** A criterion id the markbook accepts: kept if it already fits, else made to fit without clashing. */
export function markId(id: string): string {
  if (/^[a-z0-9]{8,24}$/.test(id)) return id;
  const clean = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `sc${clean.length}${clean}`.padEnd(8, '0').slice(0, 24);
}

export function sprintColumn(lesson: Lesson, kind: MarkKind, columnId: string): AssessmentColumn {
  const s = lesson.sprint!;
  const list = kind === 'prototype' ? s.criteria : s.reflection_criteria;
  const date = s.phases[4]!.due_date || new Date().toISOString().slice(0, 10);
  return {
    id: columnId,
    kind: 'assessment',
    title: `${lesson.title}: ${kind === 'prototype' ? 'Prototype' : 'Reflection'}`.slice(0, 120),
    date,
    weight: 0,
    criteria: list.map((c) => ({ id: markId(c.id), label: c.text, max: 3, outcomes: c.outcome ? [c.outcome] : [], bands: BANDS }))
  };
}

/** Makes whichever of the two columns is missing; returns their ids and the lesson that records them. */
export async function ensureColumns(lesson: Lesson, markbook: Pick<MarkbookApi, 'saveColumn'>): Promise<{ ids: { prototype: string; reflection: string }; lesson: Lesson }> {
  const s = lesson.sprint!;
  const ids = { prototype: s.columns.prototype ?? '', reflection: s.columns.reflection ?? '' };
  for (const kind of ['prototype', 'reflection'] as const) {
    if (ids[kind]) continue;
    ids[kind] = kitId();
    await markbook.saveColumn(s.class_id, sprintColumn(lesson, kind, ids[kind]));
  }
  return { ids, lesson: { ...lesson, sprint: { ...s, columns: ids } } };
}

/** The marking panel: each student's work, their self-check, a level per criterion and a comment. */
export function mountMarking(host: HTMLElement, o: { kind: MarkKind; board: GroupBoard; api: SprintTeacherApi; getLesson: () => Lesson; emitLesson: (next: Lesson) => void; markbook?: MarkbookApi }): void {
  const markbook = o.markbook ?? httpMarkbookApi;
  const subs: BoardSub[] = (o.kind === 'prototype' ? o.board.subs.prototype : o.board.subs.test).filter((x) => x.sub?.submitted_at);
  const root = el('div', 'smark');
  host.replaceChildren(root);
  if (!subs.length) { root.append(el('p', 'sprint-note', 'Nothing is in to mark yet.')); return; }
  let at = 0;
  let ids: { prototype: string; reflection: string } | null = null;
  let marks: Record<string, Record<string, unknown>> = {};

  const start = async () => {
    try {
      const made = await ensureColumns(o.getLesson(), markbook);
      const had = o.getLesson().sprint!.columns;
      if (had.prototype !== made.ids.prototype || had.reflection !== made.ids.reflection) o.emitLesson(made.lesson);
      ids = made.ids;
      marks = (await markbook.load(o.getLesson().sprint!.class_id)).markbook.marks;
      paint();
    } catch (e) {
      root.replaceChildren(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'The markbook didn’t load.'));
    }
  };

  function paint(): void {
    const lesson = o.getLesson();
    const s = lesson.sprint!;
    const list = o.kind === 'prototype' ? s.criteria : s.reflection_criteria;
    const columnId = ids![o.kind];
    const row = subs[at]!;
    const p = row.sub!.payload as Record<string, unknown>;
    const old = (marks[columnId]?.[row.student_id] as AssessmentMark | undefined) ?? { criteria: {} };
    const levels: Record<string, number> = { ...old.criteria };
    let comment = old.feedback ?? '';
    root.replaceChildren(el('h3', '', `${o.kind === 'prototype' ? 'Prototype part' : 'Reflection'}: ${row.name} (${at + 1} of ${subs.length})`));
    const work = el('div', 'smark__work');
    if (o.kind === 'prototype') {
      if (p.text) work.append(el('p', '', String(p.text)));
      if (p.link) work.append(button(`Open link: ${String(p.link)}`, 'ghost', () => window.open(String(p.link), '_blank', 'noopener')));
      for (const id of (p.files as string[] | undefined) ?? []) work.append(button('Open their file', 'ghost', async () => window.open(await o.api.fileUrl(id), '_blank', 'noopener')));
    } else {
      for (const r of (p.reflection as string[] | undefined) ?? []) work.append(el('p', '', r));
      if (p.quote) work.append(el('p', 'sprint-note', `Quoted: ${String(p.quote)}`));
    }
    root.append(work);
    const self = (p.self as Record<string, Level> | undefined) ?? {};
    for (const c of list) {
      const box = el('div', 'smark__crit');
      box.append(el('p', 'sprint-field__label', c.text));
      if (self[c.id]) box.append(el('p', 'sprint-note', `They judged: ${LEVEL_LABELS[self[c.id]! - 1]} · ${String((p.self_why as Record<string, string> | undefined)?.[c.id] ?? '')}`));
      const gap = el('p', 'sprint-note');
      const lv = el('div', 'sprint-levels');
      LEVEL_LABELS.forEach((name, i) => {
        const b = el('button', 'btn btn--secondary sprint-level', name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(levels[markId(c.id)] === i + 1));
        b.addEventListener('click', () => {
          levels[markId(c.id)] = i + 1;
          lv.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          const theirs = self[c.id];
          gap.textContent = theirs && Math.abs(theirs - (i + 1)) >= 2 ? `Talk this one through: they judged ${LEVEL_LABELS[theirs - 1]}, you marked ${name}.` : '';
        });
        lv.append(b);
      });
      box.append(lv, gap);
      root.append(box);
    }
    const note = el('textarea', 'qz-input');
    note.rows = 3;
    note.maxLength = 2000;
    note.value = comment;
    note.setAttribute('aria-label', 'Comment');
    note.addEventListener('input', () => { comment = note.value; });
    const err = el('p', 'sprint-submit__err');
    const save = async (next: boolean) => {
      try {
        const book = await markbook.setMark(s.class_id, columnId, row.student_id, { criteria: levels, ...(comment.trim() ? { feedback: comment.trim() } : {}) });
        marks = book.marks;
        if (next && at < subs.length - 1) { at += 1; paint(); } else err.textContent = 'Saved.';
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t save.';
      }
    };
    root.append(note, button('Save', 'secondary', () => void save(false)), button('Save and next student', 'primary', () => void save(true)), err);
  }

  root.append(el('p', 'sprint-note', 'Opening the markbook…'));
  void start();
}
```

Comment wording ("Talk this one through: they judged…") is teacher-facing only.

- [ ] **Step 4: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-marking.test.ts tests/unit/sprint-map.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/sprint/marking.ts apps/teaching/tests/unit/sprint-marking.test.ts
git commit -m "Teaching sprint: mark Prototype and Reflection into markbook assessment columns"
```

---

### Task 18: Pitch view

**Files:**
- Replace: `apps/teaching/src/sprint/pitch-view.ts`
- Modify: `apps/teaching/src/sprint/sprint.css` (append)
- Test: `apps/teaching/tests/unit/sprint-pitch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/sprint-pitch.test.ts
import { describe, it, expect, vi } from 'vitest';
import { openPitchView } from '@/sprint/pitch-view';
import type { SprintSummary, SprintTeacherApi } from '@/sprint/api';
import type { Lesson } from '@/schemas/lesson';

const summary = { groups: [{ id: 'g1', name: 'Kestrel', students: [{ id: 'a' }, { id: 'b' }] }, { id: 'g2', name: 'Heron', students: [{ id: 'c' }, { id: 'd' }] }], class_parts: {}, ended: {}, lock: null, extend: {}, running: null, spotlight: null } as unknown as SprintSummary;
const board = (status: 'open' | 'closed' | 'released' | null) => ({ group: { id: 'g1', name: 'Kestrel' }, pitch: { kind: 'link', link: 'https://example.com/deck', by: 'Ann Bell' }, round: status ? { status, entries: [{ student_id: 'c' }] } : null });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pitch view', () => {
  it('runs the first group, shows its pitch and the 2-minute timer', async () => {
    const api = { run: vi.fn(async () => summary), board: vi.fn(async () => board(null)), round: vi.fn(async () => summary), fileUrl: vi.fn() } as unknown as SprintTeacherApi;
    const close = openPitchView({ api, getLesson: () => ({ sprint: { criteria: [] } }) as unknown as Lesson, summary, onClose: vi.fn() });
    await flush();
    expect(api.run).toHaveBeenCalledWith('g1');
    const view = document.querySelector('.spitch')!;
    expect(view.querySelector('.spitch__who')?.textContent).toContain('Group Kestrel');
    expect(view.querySelector('.spitch__timer')?.textContent).toBe('2:00');
    expect(view.querySelector('a.spitch__link')?.getAttribute('href')).toBe('https://example.com/deck');
    close();
    expect(document.querySelector('.spitch')).toBeNull();
  });

  it('opens feedback and counts it against the class outside the group', async () => {
    const api = { run: vi.fn(async () => summary), board: vi.fn(async () => board('open')), round: vi.fn(async () => summary), fileUrl: vi.fn() } as unknown as SprintTeacherApi;
    const close = openPitchView({ api, getLesson: () => ({ sprint: { criteria: [] } }) as unknown as Lesson, summary, onClose: vi.fn() });
    await flush();
    document.querySelector<HTMLButtonElement>('[data-round="open"]')!.click();
    await flush();
    expect(api.round).toHaveBeenCalledWith('g1', 'open');
    expect(document.querySelector('.spitch__count')?.textContent).toBe('Feedback open · 1 of 2 in');
    close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-pitch.test.ts`
Expected: FAIL (the stub draws nothing).

- [ ] **Step 3: Write `apps/teaching/src/sprint/pitch-view.ts`**

```ts
import type { Lesson } from '@/schemas/lesson';
import { button, el } from '@/quiz/dom';
import type { GroupBoard, SprintSummary, SprintTeacherApi } from './api';

const PITCH_MS = 120_000;
const POLL_MS = 4000;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * The pitch on the projector: one group at a time, its pitch file, a
 * 2-minute timer (a prompt, never a cut-off) and the feedback round. The
 * class gives feedback on their own devices while it is open.
 */
export function openPitchView(o: { api: SprintTeacherApi; getLesson: () => Lesson; summary: SprintSummary; onClose(): void }): () => void {
  const groups = o.summary.groups;
  let at = Math.max(0, groups.findIndex((g) => g.id === o.summary.running));
  let started = 0;
  let tick = 0;
  let poll = 0;
  let objectUrl = '';
  const view = el('div', 'spitch');
  view.setAttribute('role', 'dialog');
  view.setAttribute('aria-label', 'Pitches');
  const bar = el('div', 'spitch__bar');
  const who = el('div', 'spitch__who');
  const timer = el('div', 'spitch__timer', clock(PITCH_MS));
  const stage = el('div', 'spitch__stage');
  const foot = el('div', 'spitch__foot');
  const count = el('span', 'spitch__count');
  const order = el('div', 'spitch__order');
  bar.append(who, timer);
  view.append(bar, stage, foot, order);
  document.body.append(view);

  const outside = () => groups.filter((g) => g.id !== groups[at]!.id).reduce((n, g) => n + g.students.length, 0);
  const showCount = (b: GroupBoard | null) => {
    const r = b?.round;
    count.textContent = !r ? 'Feedback not open' : `Feedback ${r.status} · ${r.entries.length} of ${outside()} in`;
  };

  async function show(): Promise<void> {
    const g = groups[at]!;
    who.replaceChildren(el('span', '', `Group ${g.name}`), el('small', '', `Pitch ${at + 1} of ${groups.length}`));
    stage.replaceChildren(el('p', '', 'Opening the pitch file…'));
    started = 0;
    timer.textContent = clock(PITCH_MS);
    await o.api.run(g.id);
    const b = await o.api.board(g.id);
    stage.replaceChildren();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
    if (!b.pitch) stage.append(el('p', '', 'This group hasn’t set a pitch file. They can present without one.'));
    else if (b.pitch.kind === 'link' && b.pitch.link) {
      const a = el('a', 'spitch__link', 'Open the group’s link');
      a.href = b.pitch.link;
      a.target = '_blank';
      a.rel = 'noopener';
      stage.append(a);
    } else if (b.pitch.file) {
      objectUrl = await o.api.fileUrl(b.pitch.file);
      if ((b.pitch.name ?? '').toLowerCase().endsWith('.pdf')) {
        const frame = el('iframe', 'spitch__file');
        frame.src = objectUrl;
        frame.title = 'Pitch file';
        stage.append(frame);
      } else {
        const img = el('img', 'spitch__file');
        img.src = objectUrl;
        img.alt = 'The group’s pitch file';
        stage.append(img);
      }
    }
    showCount(b);
    paintOrder();
  }

  const roundButton = (op: 'open' | 'close' | 'release', label: string, kind: 'primary' | 'secondary') => {
    const b = button(label, kind, async () => {
      await o.api.round(groups[at]!.id, op);
      showCount(await o.api.board(groups[at]!.id));
    });
    b.dataset.round = op;
    return b;
  };

  function paintOrder(): void {
    order.replaceChildren(...groups.map((g, i) => {
      const chip = el('button', `spitch__chip${i === at ? ' spitch__chip--now' : i < at ? ' spitch__chip--done' : ''}`, g.name);
      chip.type = 'button';
      chip.addEventListener('click', () => { at = i; void show(); });
      return chip;
    }));
  }

  foot.append(
    count,
    button('Start timer', 'secondary', () => { started = Date.now(); }),
    roundButton('open', 'Open feedback', 'primary'),
    roundButton('close', 'Close feedback', 'secondary'),
    roundButton('release', 'Release to the group', 'secondary'),
    button('Next group', 'secondary', () => { if (at < groups.length - 1) { at += 1; void show(); } }),
    button('Close', 'ghost', () => close())
  );

  tick = window.setInterval(() => {
    if (!started) return;
    const left = Math.max(0, PITCH_MS - (Date.now() - started));
    timer.textContent = clock(left);
    timer.classList.toggle('spitch__timer--up', left === 0);
  }, 250);
  poll = window.setInterval(async () => {
    try { showCount(await o.api.board(groups[at]!.id)); } catch { /* next poll */ }
  }, POLL_MS);

  function close(): void {
    window.clearInterval(tick);
    window.clearInterval(poll);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    view.remove();
    void o.api.run(null).catch(() => {});
    o.onClose();
  }
  void show();
  return close;
}
```

`URL.revokeObjectURL` may be missing in happy-dom. If the test fails there, guard it with `if (objectUrl && typeof URL.revokeObjectURL === 'function')`.

- [ ] **Step 4: Append pitch view styles**

```css
/* Teacher: pitch view on the projector. */
.spitch { position: fixed; inset: 0; z-index: 60; background: #0f2238; color: #fff; display: grid; grid-template-rows: auto 1fr auto auto; gap: 14px; padding: 20px; }
.spitch__bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.spitch__who span { display: block; font-size: 24px; font-weight: 700; }
.spitch__who small { opacity: .7; }
.spitch__timer { font-size: 44px; font-weight: 700; font-variant-numeric: tabular-nums; }
.spitch__timer--up { color: var(--pastel-gold); }
.spitch__stage { display: grid; place-items: center; min-height: 0; }
.spitch__file { width: 100%; height: 100%; border: 0; border-radius: 16px; background: #fff; object-fit: contain; }
.spitch__link { color: #fff; font-size: 20px; }
.spitch__foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.spitch__count { margin-right: auto; }
.spitch .btn { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.25); }
.spitch .btn--primary { background: #fff; color: var(--navy); }
.spitch__order { display: flex; flex-wrap: wrap; gap: 6px; }
.spitch__chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 0; background: rgba(255,255,255,.1); color: #fff; cursor: pointer; }
.spitch__chip--now { background: #fff; color: var(--navy); font-weight: 700; }
.spitch__chip--done { opacity: .5; text-decoration: line-through; }
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-pitch.test.ts tests/unit/sprint-map.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/sprint/pitch-view.ts apps/teaching/src/sprint/sprint.css apps/teaching/tests/unit/sprint-pitch.test.ts
git commit -m "Teaching sprint: pitch view with timer and feedback round"
```

---

## Phase 5: walk it, gate it, ship it

### Task 19: Walk the whole sprint, run the gate, open the PR

**Files:** none new, unless the walk finds bugs (fix them in the file at fault and add a test that would have caught each one).

- [ ] **Step 1: Run every sprint test and the full suites**

Run: `cd apps/teaching && npx vitest run tests/unit/sprint-*.test.ts && npx tsc --noEmit`
Run: `node --test tests/unit/sprint-*.test.js`
Run: `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs && node scripts/generate-teaching-ai-runtime.mjs && git status --short`
Expected: all PASS; the generator leaves nothing unstaged.

- [ ] **Step 2: Walk it in the preview at desktop and 390px**

Start the Teaching dev server with `preview_start` (`teaching-dev` in `.claude/launch.json`, pointed at this worktree). Then:

1. Make a lesson in a unit that a class teaches, and set its type to Design Sprint. The Kit opens with the default checklist, the Great Wall model, 3 ideas, a 2 h lock and five phase sections, each with its Thinking move.
2. In the Kit, add 2 criteria (link one to an outcome) and 1 requirement on Sketch. Set dates a day apart starting today, with Understand's class part ending in 5 minutes. Make 2 even groups. Publish. Publishing fails with a clear message if a date is missing.
3. As a student (the published page `/s/lessons/{id}` opened from the class page), claim initials. Check the countdown, the stepper, the intention line, the guides panel, the "How might we" frame and three boxes. Write 3 questions and star one. To act as other students, post to the student API from the console with other tokens (`class_token: '2'.repeat(48)` and so on), claiming their initials first.
4. Wait for the class part's end time (or press End class part on the map). The confirm lists drafts and absences; the student sees the lock screen and its countdown. Use Unlock one student; that student sees "Your class work for this phase is in."
5. Extend Understand for one group. Only that group stays on Understand.
6. As each student in a group, submit three idea cards through Sketch. The checks list what to add; the requirement tick needs a "where".
7. In Decide, sets stay folded until opened. Vote with reasons. Check that no names or counts show for students. With "Teacher confirms", the map shows Choose idea; confirm from the board. Write parts and claim one each.
8. In Prototype, upload a PDF (under 5 MB), set it as the pitch file, and fill in the self-check.
9. Open Run pitches. The PDF shows and the timer runs. Open feedback, send feedback from another group's student (the card appears on their screen), close, release. The presenting group sees the summary in Test.
10. Mark one prototype part and one reflection. The markbook gets "{title}: Prototype" and "{title}: Reflection" columns, and the class's Next steps pick up the outcome evidence.
11. Repeat steps 3, 6, 7 and the map at 390px (`resize_window` preset `mobile`). There should be no sideways scroll, the guides should fold above the work, and the map should become group cards.
12. Check that Spotlight puts a note up on students' screens with no name, and that Take down removes it.

Fix anything that breaks, with a test each time, and commit each fix on its own.

- [ ] **Step 3: Run the gate**

Run: `npm run pre-pr-check`
Expected: exit 0. Fix and rerun until it passes.

- [ ] **Step 4: Open the PR (ready, not draft) and turn on auto-merge**

```bash
git push -u origin claude/design-sprint
gh pr create --title "Teaching: Design Sprint lesson type" --body-file - <<'EOF'
A Design Sprint lesson takes groups through Understand, Sketch, Decide, Prototype and Test. Phases alternate between class and home and run on deadlines with countdowns.

- Setup Kit: criteria (each can link to an outcome), requirements, idea guide (checklist + model on a different topic), support level, decider, ideas per person (3), class lock (2 h).
- Each phase opens with a Thinking Toolkit move; its tool frames become starters and its value check is the last check before submitting.
- End class part freezes class work, submits drafts and locks the sprint for the lock length. Absent students catch up after the lock.
- Anonymous gallery with criterion votes and reasons; students see heat, never names or counts. Top vote or teacher confirms.
- Students upload prototypes (PDF/picture, 5 MB) or add a link; the pitch runs in a Pitch view with a 2-minute timer and a class feedback round with hold-and-release.
- Prototype and Reflection marks go to two markbook assessment columns, so outcome evidence, Patterns and Next steps pick them up.
- No AI calls.

Spec: docs/superpowers/specs/2026-10-24-design-sprint-design.md
Plan: docs/superpowers/plans/2026-10-24-design-sprint.md

Walked in preview at desktop and 390px. Not covered: Safari upload from a phone camera roll.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr merge --auto --merge
```

If auto-merge stalls on a conflict: merge `main` in, rerun `node scripts/generate-alchemy-schema.mjs && node scripts/generate-block-css.mjs`, rerun `npm run pre-pr-check`, and push.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| Five phases, class/home, deadlines, open rule, late, extend | 1, 2, 5, 7 |
| Class lock: End class part, end time, freeze, auto-submit drafts, absent catch-up, unlock one | 2, 5, 7, 16 |
| Criteria used three times; outcome links | 1, 4, 13, 14, 15, 17 |
| Kit: requirements, guides by phase, idea guide, model on another topic, support levels | 1, 3, 11, 15 |
| Thinking Toolkit moves per phase; tool frames; value check; intentions | 3, 11, 12–14 |
| Model / frame / check / stretch per phase; rigour guards (full sentence, reasons, open every set, self-check gap) | 3, 11–14, 17 |
| Spotlight | 7, 11, 16 |
| Groups for each sprint, even groups, student count line, decider (top vote / teacher, tie, empty) | 5, 6, 7, 15, 16 |
| Anonymous votes and heat, never names or counts | 5, 6, 13 |
| Parts list and claims | 6, 13 |
| Student uploads and pitch file | 9, 13 |
| Pitch, feedback rounds, moderation, reflection | 8, 14, 18 |
| Teacher views: progress map, phone cards, group board, marking panel | 16, 17 |
| Markbook and evidence | 17 (as markbook assessment columns, change 1) |
| Unit map dot | Not built (change 5) |
| Testing | Every task; walk in 19 |
