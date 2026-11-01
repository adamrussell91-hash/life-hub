# Deep understandings (Willingham) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Adam's rule for builds: few big chunks, no per-task reviewer, run the gate once at the end (memory: token-saving builds).

**Goal:** Teachers plan 3–4 deep understandings per unit, tag where each knowledge piece is taught and tested, place the five steps by evidence task, and monitor every student on each deep understanding.

**Architecture:** A `deep_understandings` field on the unit holds the plan. Where pieces are taught, tested and evidenced is derived from tags on lesson blocks and quiz questions (`kp:` and `du:` evidence tags). Per-class progress (teacher-passed steps, piece use in writing) lives in a new class record behind `/api/classes/:id/deep`. Pure logic sits in `apps/teaching/src/deep/`; three views (Plan, Make one, Monitoring) port the approved mockup.

**Tech Stack:** TypeScript, zod, Vite, vitest (`apps/teaching`), Netlify functions in `.mjs` with `node:test` (`tests/unit/*.test.js` at the repo root).

**Spec:** `docs/superpowers/specs/2026-11-01-deep-understandings-design.md`
**Visual source:** `docs/mockups/deep-understandings.html`. Its `render…`, `editor`, `finder`, `detail`, `mini` functions and CSS are the reference for every view. Port the markup and class names; replace the mockup's invented data with the real model.

**Branch / worktree:** `claude/deep-understandings` at `../life-hub-deep-understandings` (already holds the spec and mockup).

**Commands** (from the worktree root):
- Teaching unit tests: `cd apps/teaching && npx vitest run tests/unit/<file>.test.ts`
- Function tests: `node --test tests/unit/<file>.test.js`
- Regenerate the server evidence module: `node scripts/generate-alchemy-schema.mjs`
- Typecheck: `cd apps/teaching && npx tsc --noEmit`
- Gate (once, at the end): `npm run pre-pr-check`. This touches Teaching only. If the gate asks for the full Tasks or grove suite, stop and find out why (CLAUDE.md rule).

**Privacy:** fixtures use invented students (initials like `AB`), invented claims and pieces. No real syllabus wording in tests; copy the invented alignment style from `tests/unit/alignment.test.ts`.

---

## File map

| File | Job |
|---|---|
| `apps/teaching/src/deep/schema.ts` (new) | zod schemas, types, id makers, limits |
| `apps/teaching/src/schemas/unit.ts` | `deep_understandings` field |
| `apps/teaching/src/teacher/unit-api.ts` | `patchUnit` accepts it |
| `apps/teaching/src/evidence/types.ts`, `evidence/tags.ts` | `kp` / `du` tag kinds and labels |
| `apps/teaching/src/quiz/core.ts`, `quiz/evidence.ts` | question `pieces` → key → `kp:` evidence tags |
| `netlify/functions/_shared/quiz.mjs` | declared tags include `kp:` |
| `netlify/functions/_shared/quiz-evidence.mjs` | regenerated |
| `apps/teaching/src/deep/block-tags.ts` (new) | read and write piece / step / target tags in block settings |
| `apps/teaching/src/blocks/visibility.ts` | strip those settings from student feeds |
| `apps/teaching/src/deep/scope.ts` (new) | the unit's dot points and their linked concept bullets |
| `apps/teaching/src/deep/derive.ts` (new) | taught / tested / step placements, lesson weeks, plan gaps |
| `apps/teaching/src/deep/track.ts` (new) | piece circles, Step 1 exit, each student's step |
| `netlify/functions/_shared/class-deep.mjs`, `netlify/functions/class-deep.mjs` (new) | per-class progress store |
| `apps/teaching/src/deep/api.ts` (new) | client for that store |
| `apps/teaching/src/deep/context.ts` (new) | the open lesson's unit pieces, for the quiz builder and block menu |
| `apps/teaching/src/deep/plan-view.ts`, `editor.ts`, `monitor-view.ts`, `deep.css` (new) | the three views |
| `apps/teaching/src/teacher/sections/units.ts` | mount the views; drop the Willingham button |
| `apps/teaching/src/blocks/walkthru-note/planning.ts` | `renderFrameworkLenses` skips Willingham |
| `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`, `teacher/lesson-editor.ts` | block menu item, context |
| `apps/teaching/src/quiz/builder.ts` | "Knowledge pieces" chip picker |

---

### Task 1: Schema

**Files:**
- Create: `apps/teaching/src/deep/schema.ts`
- Modify: `apps/teaching/src/schemas/unit.ts`, `apps/teaching/src/teacher/unit-api.ts`
- Test: `apps/teaching/tests/unit/deep-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DeepUnderstandingSchema, DEEP_LIMITS, newDuId, newPieceId, pieceTag, stepTag } from '@/deep/schema';
import { UnitSchema } from '@/schemas/unit';

const du = {
  id: 'du_ab12cd',
  claim: 'Composers turn a borrowed form back on the people who made it.',
  why: 'Carries to any unseen text this class meets.',
  dot_points: ['area-one:U1'],
  concept_bullets: ['ARG1'],
  pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' }],
  shared_piece_ids: [],
  steps: [{ step: '2a', fill: 'In the first text the road is the monster.' }]
};

describe('deep understanding schema', () => {
  it('accepts a full record', () => {
    expect(DeepUnderstandingSchema.parse(du).pieces[0]!.tier).toBe('essential');
  });
  it('needs a dot point and a concept bullet', () => {
    expect(DeepUnderstandingSchema.safeParse({ ...du, dot_points: [] }).success).toBe(false);
    expect(DeepUnderstandingSchema.safeParse({ ...du, concept_bullets: [] }).success).toBe(false);
  });
  it('a unit holds at most four, and older units without any still load', () => {
    const unit = { id: 'u1', type: 'unit', title: 'T', year_id: 'y', subject_id: 's', lesson_ids: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
    expect(UnitSchema.safeParse(unit).success).toBe(true);
    expect(UnitSchema.safeParse({ ...unit, deep_understandings: Array(DEEP_LIMITS.perUnit + 1).fill(du) }).success).toBe(false);
  });
  it('makes ids and tags', () => {
    expect(newDuId()).toMatch(/^du_[a-z0-9]{6}$/);
    expect(newPieceId()).toMatch(/^kp_[a-z0-9]{6}$/);
    expect(pieceTag('kp_aa11bb')).toBe('kp:kp_aa11bb');
    expect(stepTag('du_ab12cd', '2b')).toBe('du:du_ab12cd:2b');
  });
});
```

If `CommonFields` needs more fields than the unit literal above, copy them from `apps/teaching/src/schemas/common.ts` into the fixture.

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-schema.test.ts`
Expected: FAIL, cannot resolve `@/deep/schema`.

- [ ] **Step 3: Write `apps/teaching/src/deep/schema.ts`**

```ts
import { z } from 'zod';
import { DotPointRefSchema } from '@/schemas/block';

/**
 * Deep understandings (Willingham): the three or four claims a unit is built
 * to make flexible, the knowledge pieces each rests on, and the five steps.
 * Where pieces are taught and tested is never stored here; it comes from
 * `kp:` and `du:` tags on the unit's lessons (see derive.ts).
 */

export const DEEP_LIMITS = { perUnit: 4, pieces: 24, claim: 400, why: 300, piece: 200, fill: 400 } as const;
export const TIERS = ['essential', 'strong', 'sophisticated'] as const;
export type Tier = (typeof TIERS)[number];
export const STEPS = ['1', '2a', '2b', '3', '4'] as const;
export type Step = (typeof STEPS)[number];
export type PlacedStep = Exclude<Step, '1'>;
export const STEP_LABEL: Record<Step, string> = { '1': '1', '2a': '2A', '2b': '2B', '3': '3', '4': '4' };
export const STEP_NAME: Record<Step, string> = {
  '1': 'Know the pieces',
  '2a': 'Explain it in one text',
  '2b': 'Explain it in a second text',
  '3': 'Compare when prompted',
  '4': 'Spot and use it unprompted'
};

export const DuIdSchema = z.string().regex(/^du_[a-z0-9]{4,16}$/);
export const PieceIdSchema = z.string().regex(/^kp_[a-z0-9]{4,16}$/);
const ConceptBulletSchema = z.string().regex(/^[A-Z]{2,5}\d{1,2}$/);

export const KnowledgePieceSchema = z.object({
  id: PieceIdSchema,
  text: z.string().trim().min(1).max(DEEP_LIMITS.piece),
  tier: z.enum(TIERS)
});

export const DeepUnderstandingSchema = z.object({
  id: DuIdSchema,
  claim: z.string().trim().max(DEEP_LIMITS.claim),
  why: z.string().trim().max(DEEP_LIMITS.why).default(''),
  dot_points: z.array(DotPointRefSchema).min(1).max(8),
  concept_bullets: z.array(ConceptBulletSchema).min(1).max(8),
  pieces: z.array(KnowledgePieceSchema).max(DEEP_LIMITS.pieces).default([]),
  /** Pieces owned by another deep understanding in this unit. */
  shared_piece_ids: z.array(PieceIdSchema).max(DEEP_LIMITS.pieces).default([]),
  steps: z.array(z.object({ step: z.enum(['2a', '2b', '3', '4']), fill: z.string().trim().max(DEEP_LIMITS.fill) })).max(4).default([])
});

export type KnowledgePiece = z.infer<typeof KnowledgePieceSchema>;
export type DeepUnderstanding = z.infer<typeof DeepUnderstandingSchema>;

const rand = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, '0');
export const newDuId = (): string => `du_${rand()}`;
export const newPieceId = (): string => `kp_${rand()}`;
export const pieceTag = (pieceId: string): string => `kp:${pieceId}`;
export const stepTag = (duId: string, step: PlacedStep): string => `du:${duId}:${step}`;

/** Every piece a deep understanding counts: its own, then the shared ones found in the unit. */
export function piecesFor(du: DeepUnderstanding, all: readonly DeepUnderstanding[]): KnowledgePiece[] {
  const byId = new Map(all.flatMap((d) => d.pieces).map((p) => [p.id, p]));
  return [...du.pieces, ...du.shared_piece_ids.map((id) => byId.get(id)).filter((p): p is KnowledgePiece => !!p)];
}

/** A draft that has only a claim so far: the editor saves as it goes, before links exist. */
export const DeepUnderstandingDraftSchema = DeepUnderstandingSchema.extend({
  dot_points: z.array(DotPointRefSchema).max(8),
  concept_bullets: z.array(ConceptBulletSchema).max(8)
});
```

Note: the editor saves drafts as you go, so the unit field stores the draft shape and the plan shows "Needs a dot point" / "Needs a concept bullet" as peach gaps. The strict schema is what "Ready to teach?" checks against.

- [ ] **Step 4: Add the field to the unit**

In `apps/teaching/src/schemas/unit.ts` add the import `import { DeepUnderstandingDraftSchema, DEEP_LIMITS } from '../deep/schema';` and, after `outcome_ids`:

```ts
  /** Willingham deep understandings: the unit's 3–4 claims and their knowledge pieces (deep/schema.ts). */
  deep_understandings: z.array(DeepUnderstandingDraftSchema).max(DEEP_LIMITS.perUnit).optional(),
```

In the test, the "needs a dot point" case uses `DeepUnderstandingSchema` (strict), which still fails as written. In `apps/teaching/src/teacher/unit-api.ts` add `deep_understandings?: DeepUnderstanding[];` to the `body` type and import the type from `@/deep/schema`.

If importing `../deep/schema` from `schemas/unit.ts` makes a cycle through `schemas/block`, move `DotPointRefSchema` usage to a local `z.string().regex(/^[a-z0-9-]{2,40}:[UR]\d{1,2}$/)` in `deep/schema.ts`.

- [ ] **Step 5: Run the test and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-schema.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/deep/schema.ts apps/teaching/src/schemas/unit.ts apps/teaching/src/teacher/unit-api.ts apps/teaching/tests/unit/deep-schema.test.ts
git commit -m "Deep understandings: unit schema"
```

---

### Task 2: Evidence tags and quiz pieces

**Files:**
- Modify: `apps/teaching/src/evidence/types.ts`, `apps/teaching/src/evidence/tags.ts`, `apps/teaching/src/quiz/core.ts` (`base`, `QuestionKey`, `keyHead`), `apps/teaching/src/quiz/evidence.ts` (`answerEvidence`), `netlify/functions/_shared/quiz.mjs` (declared tags, ~line 295)
- Regenerate: `netlify/functions/_shared/quiz-evidence.mjs`
- Test: `apps/teaching/tests/unit/deep-tags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { kindOf, tagLabel } from '@/evidence/tags';
import { answerEvidence } from '@/quiz/evidence';
import { splitQuestion, QuizQuestionSchema } from '@/quiz/core';

const ctx = {
  table: null, outcomes: [], skills: null,
  deep: [{ id: 'du_ab12cd', claim: 'A borrowed form turned back', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' as const }], shared_piece_ids: [], steps: [] }]
};

describe('deep understanding tags', () => {
  it('knows the kinds', () => {
    expect(kindOf('kp:kp_aa11bb')).toBe('kp');
    expect(kindOf('du:du_ab12cd:2a')).toBe('du');
  });
  it('labels pieces and steps, and falls back to the raw value', () => {
    expect(tagLabel('kp:kp_aa11bb', ctx)).toBe('The form began as a warning story');
    expect(tagLabel('du:du_ab12cd:2b', ctx)).toBe('DU 1 · Step 2B');
    expect(tagLabel('kp:kp_zz99zz', ctx)).toBe('kp_zz99zz');
  });
  it('a quiz question tagged with pieces gives kp: evidence', () => {
    const q = QuizQuestionSchema.parse({ id: 'q1', kind: 'short_answer', prompt: 'Where did the form begin?', marks: 1, accepted: ['a warning story'], pieces: ['kp_aa11bb'] });
    const { question, key } = splitQuestion(q);
    const [item] = answerEvidence({ question, key, response: { text: 'a warning story' }, awarded: 1 });
    expect(item!.tags).toContain('kp:kp_aa11bb');
  });
});
```

`splitQuestion` (core.ts ~line 595) returns `{ question, key }`; `keyHead` is built inside it.

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-tags.test.ts`
Expected: FAIL (`kindOf` returns null; `pieces` stripped).

- [ ] **Step 3: Implement**

`evidence/types.ts`:

```ts
export type TagKind = 'tech' | 'fam' | 'out' | 'skill' | 'kp' | 'du';
export const TAG_KINDS: TagKind[] = ['tech', 'fam', 'out', 'skill', 'kp', 'du'];
export const TAG_KIND_LABEL: Record<TagKind, string> = { tech: 'Technique', fam: 'Family', out: 'Outcome', skill: 'Skill', kp: 'Knowledge piece', du: 'Deep understanding' };
```

Check every `Record<TagKind, …>` and `switch` over `TagKind` that `tsc` now flags and add the two kinds (views that list tag kinds may simply skip `kp`/`du`: deep understandings have their own view).

`evidence/tags.ts`: extend `TagContext` with `deep?: readonly DeepUnderstanding[] | null`, then

```ts
export function kindOf(tag: string): TagKind | null {
  const prefix = tag.slice(0, Math.max(0, tag.indexOf(':')));
  return prefix === 'tech' || prefix === 'fam' || prefix === 'out' || prefix === 'skill' || prefix === 'kp' || prefix === 'du' ? prefix : null;
}
```

and in `tagLabel`, before `return tag;`:

```ts
  if (kind === 'kp') return ctx.deep?.flatMap((d) => d.pieces).find((p) => p.id === value)?.text ?? value;
  if (kind === 'du') {
    const [duId, step] = value.split(':');
    const n = (ctx.deep ?? []).findIndex((d) => d.id === duId);
    return n >= 0 && step ? `DU ${n + 1} · Step ${STEP_LABEL[step as Step] ?? step}` : value;
  }
```

`quiz/core.ts` `base`, after `skills`:

```ts
  /** Knowledge pieces this question checks (deep understandings), for the unit's tracking. */
  pieces: z.array(z.string().regex(/^kp_[a-z0-9]{4,16}$/)).max(6).optional()
```

`QuestionKey`: add `pieces?: string[];`. `keyHead`: add `...(q.pieces?.length ? { pieces: [...q.pieces] } : {})`.

`quiz/evidence.ts` `answerEvidence` `base`:

```ts
  const base = [
    ...(key.outcomes?.length ? key.outcomes : input.fallbackOutcomes ?? []).map((o) => `out:${o}`),
    ...(key.skills ?? []).map((s) => `skill:${s}`),
    ...(key.pieces ?? []).map((p) => `kp:${p}`)
  ];
```

`netlify/functions/_shared/quiz.mjs` next to `for (const skill of key.skills ?? []) tags.add(...)`:

```js
    for (const piece of key.pieces ?? []) tags.add(`kp:${piece}`);
```

and update that function's doc comment to say "skills, knowledge pieces and catalogue techniques".

- [ ] **Step 4: Regenerate and test**

Run: `node scripts/generate-alchemy-schema.mjs && cd apps/teaching && npx vitest run tests/unit/deep-tags.test.ts tests/unit/framework-lenses.test.ts && npx tsc --noEmit`
Expected: PASS. `git diff --stat netlify/functions/_shared/quiz-evidence.mjs` shows the `pieces` lines.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/evidence apps/teaching/src/quiz/core.ts apps/teaching/src/quiz/evidence.ts netlify/functions/_shared/quiz.mjs netlify/functions/_shared/quiz-evidence.mjs apps/teaching/tests/unit/deep-tags.test.ts
git commit -m "Deep understandings: kp and du evidence tags, quiz questions carry pieces"
```

---

### Task 3: Block tags (taught, evidence task, target pieces)

**Files:**
- Create: `apps/teaching/src/deep/block-tags.ts`
- Modify: `apps/teaching/src/blocks/visibility.ts` (`stripWalkthruField`)
- Test: `apps/teaching/tests/unit/deep-block-tags.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { evidenceStepOf, piecesTaught, targetPieces, withEvidenceStep, withPiecesTaught, withTargetPieces } from '@/deep/block-tags';
import { filterBlocksForStudent } from '@/blocks/visibility';

const block = { id: 'b1', block_type: 'rich_text', visibility: 'all', content: { html: '<p>x</p>' }, settings: { walkthru: 'w1-cold-calling' } } as never;

describe('deep understanding block tags', () => {
  it('round-trips taught pieces, the evidence step and target pieces', () => {
    let b = withPiecesTaught(block, ['kp_aa11bb', 'kp_aa11bb', 'kp_cc22dd']);
    b = withEvidenceStep(b, { du: 'du_ab12cd', step: '2a' });
    b = withTargetPieces(b, ['kp_cc22dd']);
    expect(piecesTaught(b)).toEqual(['kp_aa11bb', 'kp_cc22dd']);
    expect(evidenceStepOf(b)).toEqual({ du: 'du_ab12cd', step: '2a' });
    expect(targetPieces(b)).toEqual(['kp_cc22dd']);
    expect(piecesTaught(withPiecesTaught(b, []))).toEqual([]);
    expect(evidenceStepOf(withEvidenceStep(b, null))).toBeNull();
  });
  it('ignores junk', () => {
    expect(piecesTaught({ settings: { deep_taught: ['nope', 3] } } as never)).toEqual([]);
    expect(evidenceStepOf({ settings: { deep_step: { du: 'x', step: '9' } } } as never)).toBeNull();
  });
  it('students never get the fields', () => {
    const tagged = withTargetPieces(withEvidenceStep(withPiecesTaught(block, ['kp_aa11bb']), { du: 'du_ab12cd', step: '3' }), ['kp_aa11bb']);
    const [out] = filterBlocksForStudent([tagged]) as Array<{ settings?: Record<string, unknown> }>;
    expect(out!.settings ?? {}).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-block-tags.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `apps/teaching/src/deep/block-tags.ts`**

```ts
import type { Block } from '@/schemas/block';
import type { PlacedStep } from './schema';

/**
 * A block's deep understanding tags, kept in its settings like a chosen
 * WalkThru (walkthru-note/attach.ts). Teacher-only: visibility.ts strips them.
 *   deep_taught   pieces this block teaches
 *   deep_step     the step this block is the evidence task for
 *   deep_targets  pieces a writing task expects students to use (2–3)
 */

type Settings = Record<string, unknown>;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DU = /^du_[a-z0-9]{4,16}$/;
const PLACED = new Set(['2a', '2b', '3', '4']);
export const DEEP_SETTING_KEYS = ['deep_taught', 'deep_step', 'deep_targets'] as const;

const settingsOf = (block: Pick<Block, 'settings'>): Settings => ((block.settings ?? {}) as Settings);
const pieceList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && PIECE.test(x)))] : []);

function withSetting<T extends Block>(block: T, key: string, value: unknown): T {
  const { [key]: _old, ...rest } = settingsOf(block);
  const empty = value === null || (Array.isArray(value) && value.length === 0);
  return { ...block, settings: empty ? rest : { ...rest, [key]: value } };
}

export const piecesTaught = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_taught);
export const targetPieces = (block: Pick<Block, 'settings'>): string[] => pieceList(settingsOf(block).deep_targets).slice(0, 3);
export const withPiecesTaught = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_taught', pieceList(ids));
export const withTargetPieces = <T extends Block>(block: T, ids: string[]): T => withSetting(block, 'deep_targets', pieceList(ids).slice(0, 3));

export type EvidenceStep = { du: string; step: PlacedStep };
export function evidenceStepOf(block: Pick<Block, 'settings'>): EvidenceStep | null {
  const v = settingsOf(block).deep_step as { du?: unknown; step?: unknown } | undefined;
  return v && typeof v.du === 'string' && DU.test(v.du) && typeof v.step === 'string' && PLACED.has(v.step) ? { du: v.du, step: v.step as PlacedStep } : null;
}
export const withEvidenceStep = <T extends Block>(block: T, value: EvidenceStep | null): T => withSetting(block, 'deep_step', value);
```

- [ ] **Step 4: Strip from student feeds**

In `apps/teaching/src/blocks/visibility.ts`, rename `stripWalkthruField` to `stripTeacherSettings` (update its one caller) and replace its settings branch with:

```ts
  const settings = (out as { settings?: Record<string, unknown> }).settings;
  if (settings && ['walkthru', ...DEEP_SETTING_KEYS].some((key) => Object.prototype.hasOwnProperty.call(settings, key))) {
    const { walkthru: _chosen, deep_taught: _taught, deep_step: _step, deep_targets: _targets, ...rest } = settings;
    out = { ...out, settings: rest } as Block;
  }
```

Update the doc comment: "WalkThru notes, jots, a block's chosen WalkThru and its deep understanding tags are teacher-only…". Import `DEEP_SETTING_KEYS` from `@/deep/block-tags`.

- [ ] **Step 5: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-block-tags.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/teaching/src/deep/block-tags.ts apps/teaching/src/blocks/visibility.ts apps/teaching/tests/unit/deep-block-tags.test.ts
git commit -m "Deep understandings: teacher-only block tags for taught pieces, evidence step and targets"
```

---

### Task 4: Scope and derivation

**Files:**
- Create: `apps/teaching/src/deep/scope.ts`, `apps/teaching/src/deep/derive.ts`
- Test: `apps/teaching/tests/unit/deep-derive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { unitScope } from '@/deep/scope';
import { lessonWeeks, placements, planGaps } from '@/deep/derive';
import type { Alignment } from '@/alignment/schema';

// Invented alignment, same shape as tests/unit/alignment.test.ts.
const alignment = {
  concepts: [
    { key: 'ARG', name: 'Argument', head: 'h', bullets: [{ n: 1, text: 'claims need reasons', adv: false }, { n: 2, text: 'counter claims help', adv: false }] },
    { key: 'STY', name: 'Style', head: 'h', bullets: [{ n: 1, text: 'style shapes meaning', adv: false }] }
  ],
  focus_areas: [{ id: 'area-one', name: 'A', points: [
    { id: 'U1', kind: 'U', short: 'Close reading', text: 't', outcomes: [], concepts: [{ ref: 'ARG1', link: 'shared' }, { ref: 'STY1', link: 'related' }], processes: [] },
    { id: 'R1', kind: 'R', short: 'New forms', text: 't', outcomes: [], concepts: [{ ref: 'ARG2', link: 'shared' }], processes: [] },
    { id: 'U2', kind: 'U', short: 'Not taught', text: 't', outcomes: [], concepts: [{ ref: 'STY1', link: 'shared' }], processes: [] }
  ] }]
} as unknown as Alignment;

const quiz = (id: string, pieces: string[]) => ({ id, block_type: 'quiz_question', visibility: 'all', content: { question: { id, kind: 'short_answer', prompt: 'p', marks: 1, accepted: ['a'], pieces } }, settings: {} });
const lessons = [
  { id: 'L1', title: 'One', dot_points: ['area-one:U1'], blocks: [{ id: 'b1', block_type: 'rich_text', visibility: 'all', content: {}, settings: { deep_taught: ['kp_aa11bb'] } }] },
  { id: 'L2', title: 'Two', dot_points: ['area-one:R1'], blocks: [quiz('q1', ['kp_aa11bb']), quiz('q2', ['kp_aa11bb']), { id: 'b2', block_type: 'question_set', visibility: 'all', content: { title: 'Paragraph' }, settings: { deep_step: { du: 'du_ab12cd', step: '2a' } } }] },
  { id: 'L3', title: 'Three', blocks: [{ id: 'sec', block_type: 'section', visibility: 'all', content: { blocks: [quiz('q3', ['kp_aa11bb'])] }, settings: {} }] }
] as never;

describe('unit scope', () => {
  it('lists only the unit’s dot points and the concept bullets linked to them', () => {
    const scope = unitScope(lessons, alignment);
    expect(scope.points.map((p) => p.ref)).toEqual(['area-one:U1', 'area-one:R1']);
    expect(scope.bullets.map((b) => [b.ref, b.via])).toEqual([['ARG1', ['U1']], ['STY1', ['U1']], ['ARG2', ['R1']]]);
  });
});

describe('placements', () => {
  it('finds taught and tested lessons, item counts and step tasks, inside sections too', () => {
    const p = placements(lessons, 'du_ab12cd');
    expect(p.taught.get('kp_aa11bb')).toEqual(['L1']);
    expect(p.tested.get('kp_aa11bb')).toEqual({ lessons: ['L2', 'L3'], items: 3 });
    expect(p.steps.get('2a')).toEqual({ lesson_id: 'L2', block_id: 'b2', title: 'Paragraph' });
  });
});

describe('lesson weeks', () => {
  it('weeks run from the earliest dated lesson; undated lessons are null', () => {
    const weeks = lessonWeeks(['L1', 'L2', 'L3'], [
      { lesson_id: 'L1', date: '2026-10-12' }, { lesson_id: 'L1', date: '2026-10-14' },
      { lesson_id: 'L2', date: '2026-10-20' }
    ]);
    expect(weeks.get('L1')).toBe(1);
    expect(weeks.get('L2')).toBe(2);
    expect(weeks.get('L3')).toBeNull();
  });
});

describe('plan gaps', () => {
  it('names what is missing', () => {
    const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: [], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 't', tier: 'essential' as const }, { id: 'kp_cc22dd', text: 'u', tier: 'strong' as const }], shared_piece_ids: [], steps: [] };
    expect(planGaps(du, [du], placements(lessons, 'du_ab12cd'))).toEqual([
      'Needs a dot point',
      'Only 2 knowledge pieces (aim for 8 to 12 Essential and Strong)',
      '1 piece not taught yet',
      '1 piece not tested yet',
      'No evidence task for Steps 2B, 3, 4'
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-derive.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `apps/teaching/src/deep/scope.ts`**

```ts
import type { Alignment } from '@/alignment/schema';

/** The unit's dot points (ticked on any of its lessons) and the concept bullets the syllabus links to them. */
export type ScopePoint = { ref: string; id: string; kind: 'U' | 'R'; short: string };
export type ScopeBullet = { ref: string; text: string; via: string[] };

export function unitScope(lessons: ReadonlyArray<{ dot_points?: string[] }>, alignment: Alignment | null): { points: ScopePoint[]; bullets: ScopeBullet[] } {
  if (!alignment) return { points: [], bullets: [] };
  const ticked = new Set(lessons.flatMap((l) => l.dot_points ?? []));
  const points: ScopePoint[] = [];
  for (const area of alignment.focus_areas) {
    for (const p of area.points) {
      const ref = `${area.id}:${p.id}`;
      if (ticked.has(ref)) points.push({ ref, id: p.id, kind: p.kind, short: p.short });
    }
  }
  const order = (id: string): number => (id.startsWith('U') ? 0 : 100) + Number(id.slice(1));
  points.sort((a, b) => order(a.id) - order(b.id));
  const bullets = new Map<string, ScopeBullet>();
  for (const sp of points) {
    const [areaId] = sp.ref.split(':');
    const point = alignment.focus_areas.find((a) => a.id === areaId)?.points.find((p) => p.id === sp.id);
    for (const c of point?.concepts ?? []) {
      const key = c.ref.replace(/\d+$/, '');
      const n = Number(c.ref.slice(key.length));
      const text = alignment.concepts.find((x) => x.key === key)?.bullets.find((b) => b.n === n)?.text;
      if (!text) continue;
      const row = bullets.get(c.ref) ?? { ref: c.ref, text, via: [] };
      if (!row.via.includes(sp.id)) row.via.push(sp.id);
      bullets.set(c.ref, row);
    }
  }
  return { points, bullets: [...bullets.values()] };
}
```

- [ ] **Step 4: Write `apps/teaching/src/deep/derive.ts`**

```ts
import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import { evidenceStepOf, piecesTaught } from './block-tags';
import { piecesFor, STEP_LABEL, type DeepUnderstanding, type PlacedStep } from './schema';

/** Where a unit's pieces are taught and tested, and which task is each step's evidence, read from lesson tags. */
export type Placements = {
  taught: Map<string, string[]>;
  tested: Map<string, { lessons: string[]; items: number }>;
  steps: Map<PlacedStep, { lesson_id: string; block_id: string; title: string }>;
};
type LessonLike = { id: string; title?: string; blocks?: Block[] };

const blockTitle = (b: Block): string => {
  const c = b.content as Record<string, unknown> | undefined;
  return String(c?.title ?? c?.heading ?? c?.prompt ?? '').trim() || 'Untitled task';
};

export function placements(lessons: readonly LessonLike[], duId: string): Placements {
  const out: Placements = { taught: new Map(), tested: new Map(), steps: new Map() };
  const addLesson = (list: string[], id: string) => { if (!list.includes(id)) list.push(id); };
  for (const lesson of lessons) {
    visitBlocks(lesson.blocks ?? [], (block: Block) => {
      for (const p of piecesTaught(block)) addLesson(out.taught.get(p) ?? out.taught.set(p, []).get(p)!, lesson.id);
      const question = (block.content as { question?: { pieces?: string[] } } | undefined)?.question;
      for (const p of question?.pieces ?? []) {
        const row = out.tested.get(p) ?? { lessons: [], items: 0 };
        addLesson(row.lessons, lesson.id);
        row.items += 1;
        out.tested.set(p, row);
      }
      const step = evidenceStepOf(block);
      if (step?.du === duId && !out.steps.has(step.step)) out.steps.set(step.step, { lesson_id: lesson.id, block_id: block.id, title: blockTitle(block) });
    });
  }
  return out;
}

/** Week number per lesson (1 = the week of the earliest dated lesson, weeks start Monday); null when undated. */
export function lessonWeeks(lessonIds: readonly string[], rows: ReadonlyArray<{ lesson_id: string; date: string }>): Map<string, number | null> {
  const first = new Map<string, string>();
  for (const r of rows) if (!first.has(r.lesson_id) || r.date < first.get(r.lesson_id)!) first.set(r.lesson_id, r.date);
  const monday = (iso: string): number => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000;
  };
  const dates = [...first.values()].sort();
  const start = dates.length ? monday(dates[0]!) : 0;
  return new Map(lessonIds.map((id) => [id, first.has(id) ? Math.floor((monday(first.get(id)!) - start) / (7 * 86_400_000)) + 1 : null]));
}

/** The peach warnings for one deep understanding on the plan. */
export function planGaps(du: DeepUnderstanding, all: readonly DeepUnderstanding[], p: Placements): string[] {
  const gaps: string[] = [];
  if (!du.claim.trim()) gaps.push('Needs a claim');
  if (!du.dot_points.length) gaps.push('Needs a dot point');
  if (!du.concept_bullets.length) gaps.push('Needs a concept bullet');
  const pieces = piecesFor(du, all);
  const core = pieces.filter((x) => x.tier !== 'sophisticated').length;
  if (core < 8) gaps.push(`Only ${core} knowledge piece${core === 1 ? '' : 's'} (aim for 8 to 12 Essential and Strong)`);
  const untaught = pieces.filter((x) => !p.taught.has(x.id)).length;
  if (untaught) gaps.push(`${untaught} piece${untaught === 1 ? '' : 's'} not taught yet`);
  const untested = pieces.filter((x) => !p.tested.has(x.id)).length;
  if (untested) gaps.push(`${untested} piece${untested === 1 ? '' : 's'} not tested yet`);
  const missing = (['2a', '2b', '3', '4'] as const).filter((s) => !p.steps.has(s)).map((s) => STEP_LABEL[s]);
  if (missing.length) gaps.push(`No evidence task for Step${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);
  return gaps;
}
```

Check `visitBlocks`'s signature in `apps/teaching/src/blocks/walk-blocks.ts` and that it walks section children (the test's `q3` sits in a section). If it doesn't descend into `content.blocks`, use the walker that does (grep `export function` in that file).

In the expected test output the 2A task exists, so "No evidence task for Steps 2B, 3, 4" is right; the 1-piece-untaught line is `kp_cc22dd`.

- [ ] **Step 5: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-derive.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/teaching/src/deep/scope.ts apps/teaching/src/deep/derive.ts apps/teaching/tests/unit/deep-derive.test.ts
git commit -m "Deep understandings: unit scope, placements from tags, lesson weeks, plan gaps"
```

---

### Task 5: Tracking (circles, Step 1, each student's step)

**Files:**
- Create: `apps/teaching/src/deep/track.ts`
- Test: `apps/teaching/tests/unit/deep-track.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { circleFor, FADE_DAYS, step1Passed, studentStep } from '@/deep/track';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, date: string, share: number | null, tag = 'kp:kp_aa11bb'): Evidence => ({ item: 'q', tags: [tag], share, why: [], student, source: `quiz:${date}`, date, confidence: null });
const today = '2026-11-20';

describe('piece circles', () => {
  it('none, half, full; two right answers on one day count once', () => {
    expect(circleFor([], 'AB', 'kp_aa11bb', today).fill).toBe('none');
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('half');
    expect(circleFor([ev('AB', '2026-11-18', 1), ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('half');
    expect(circleFor([ev('AB', '2026-11-10', 1), ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('full');
  });
  it('amber when the latest check was wrong; waiting answers say nothing', () => {
    const c = circleFor([ev('AB', '2026-11-10', 1), ev('AB', '2026-11-12', 1), ev('AB', '2026-11-18', 0), ev('AB', '2026-11-19', null)], 'AB', 'kp_aa11bb', today);
    expect(c.amber).toBe(true);
    expect(c.fill).toBe('full');
  });
  it('faded when not checked lately', () => {
    const old = new Date(Date.parse(`${today}T00:00:00Z`) - (FADE_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(circleFor([ev('AB', old, 1)], 'AB', 'kp_aa11bb', today).faded).toBe(true);
  });
  it('rings: used in writing beats missed; missed hidden while amber', () => {
    const writing = { b1: { AB: { used: [], missed: ['kp_aa11bb'], at: '2026-11-15' } }, b2: { AB: { used: ['kp_aa11bb'], missed: [], at: '2026-11-16' } } };
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today, writing).ring).toBe('used');
    const missedOnly = { b1: writing.b1 };
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today, missedOnly).ring).toBe('missed');
    expect(circleFor([ev('AB', '2026-11-18', 0)], 'AB', 'kp_aa11bb', today, missedOnly).ring).toBe('none');
  });
});

describe('Step 1 exit', () => {
  const pieces = [
    { id: 'e1', text: 'a', tier: 'essential' as const },
    { id: 'e2', text: 'b', tier: 'essential' as const },
    { id: 's1', text: 'c', tier: 'strong' as const },
    { id: 's2', text: 'd', tier: 'strong' as const },
    { id: 's3', text: 'e', tier: 'strong' as const },
    { id: 'x1', text: 'f', tier: 'sophisticated' as const }
  ];
  const full = { fill: 'full' as const, amber: false, faded: false, ring: 'none' as const };
  const none = { ...full, fill: 'none' as const };
  it('needs every Essential full and 80% of introduced Essential + Strong; Sophisticated ignored', () => {
    const introduced = new Set(['e1', 'e2', 's1', 's2', 's3', 'x1']);
    expect(step1Passed(pieces, introduced, { e1: full, e2: full, s1: full, s2: full, s3: none, x1: none })).toBe(true);
    expect(step1Passed(pieces, introduced, { e1: full, e2: full, s1: full, s2: none, s3: none, x1: full })).toBe(false);
    expect(step1Passed(pieces, introduced, { e1: full, e2: none, s1: full, s2: full, s3: full, x1: full })).toBe(false);
  });
  it('only counts pieces introduced so far', () => {
    expect(step1Passed(pieces, new Set(['e1', 's1']), { e1: full, s1: full })).toBe(true);
    expect(step1Passed(pieces, new Set(), {})).toBe(false);
  });
});

describe('each student’s step', () => {
  it('teacher passes win; otherwise Step 1 or nothing', () => {
    expect(studentStep(true, { step: '2b', at: '2026-11-10' })).toBe('2b');
    expect(studentStep(true, undefined)).toBe('1');
    expect(studentStep(false, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-track.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `apps/teaching/src/deep/track.ts`**

```ts
import type { Evidence } from '@/evidence/types';
import type { KnowledgePiece, PlacedStep, Step } from './schema';

/**
 * One student's hold on one knowledge piece, from `kp:` quiz evidence and the
 * teacher's piece-use ticks on writing tasks. Pure; the monitor view feeds it.
 *   fill   none · half (right once) · full (right on two separate days)
 *   amber  the latest marked check was wrong (memory jog)
 *   faded  no check in FADE_DAYS
 *   ring   used (in writing) · missed (expected, not used; hidden while amber) · none
 */
export const FADE_DAYS = 28;
export type Circle = { fill: 'none' | 'half' | 'full'; amber: boolean; faded: boolean; ring: 'used' | 'missed' | 'none' };
export type WritingTicks = Record<string, Record<string, { used: string[]; missed: string[]; at: string }>>;

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function circleFor(evidence: readonly Evidence[], student: string, pieceId: string, today: string, writing: WritingTicks = {}): Circle {
  const tag = `kp:${pieceId}`;
  const mine = evidence.filter((e) => e.student === student && e.share !== null && e.tags.includes(tag)).sort((a, b) => a.date.localeCompare(b.date));
  const rightDays = new Set(mine.filter((e) => (e.share ?? 0) >= 1).map((e) => e.date));
  const fill = rightDays.size >= 2 ? 'full' : rightDays.size === 1 ? 'half' : 'none';
  const last = mine[mine.length - 1];
  const amber = !!last && (last.share ?? 0) < 1;
  const faded = !!last && daysBetween(last.date, today) > FADE_DAYS;
  const ticks = Object.values(writing).map((byStudent) => byStudent[student]).filter((t): t is NonNullable<typeof t> => !!t);
  const used = ticks.some((t) => t.used.includes(pieceId));
  const missed = ticks.some((t) => t.missed.includes(pieceId));
  const ring = used ? 'used' : missed && !amber ? 'missed' : 'none';
  return { fill, amber, faded, ring };
}

/** Step 1 exit: every introduced Essential piece full, and 80% of introduced Essential + Strong full. */
export function step1Passed(pieces: readonly KnowledgePiece[], introduced: ReadonlySet<string>, circles: Readonly<Record<string, Circle>>): boolean {
  const counted = pieces.filter((p) => p.tier !== 'sophisticated' && introduced.has(p.id));
  if (!counted.length) return false;
  const isFull = (id: string) => circles[id]?.fill === 'full';
  if (!counted.filter((p) => p.tier === 'essential').every((p) => isFull(p.id))) return false;
  return counted.filter((p) => isFull(p.id)).length / counted.length >= 0.8;
}

/** Where a student sits: the step the teacher last passed them on, else 1 once they're through Step 1, else null (still in Step 1). */
export function studentStep(passedStep1: boolean, passed: { step: PlacedStep; at: string } | undefined): Step | null {
  if (passed) return passed.step;
  return passedStep1 ? '1' : null;
}
```

Meaning of `studentStep`'s result for the views: `null` = working on Step 1; `'1'` = Step 1 done, working on 2A; `'2a'` = 2A done, and so on. The Monitoring lanes are "working on" lanes, so lane = the step after the result.

- [ ] **Step 4: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-track.test.ts`
Expected: PASS.

```bash
git add apps/teaching/src/deep/track.ts apps/teaching/tests/unit/deep-track.test.ts
git commit -m "Deep understandings: piece circles, Step 1 exit, student steps"
```

---

### Task 6: Per-class progress store

**Files:**
- Create: `netlify/functions/_shared/class-deep.mjs`, `netlify/functions/class-deep.mjs`, `apps/teaching/src/deep/api.ts`
- Test: `tests/unit/class-deep.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classDeepAction } from '../../netlify/functions/_shared/class-deep.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}
const cls = { id: 'class1', type: 'class', title: '12 English', students: [{ id: 'st_ab', name: 'Ada Bell' }] };
const store = () => storeFixture([['classes/class1', cls]]);

test('load is empty for a new unit', async () => {
  assert.deepEqual(await classDeepAction(store(), 'class1', { action: 'load', unit_id: 'unit1' }), { steps: {}, writing: {} });
});

test('set_step passes a student on a step, and null clears it', async () => {
  const s = store();
  await classDeepAction(s, 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: '2a', hint: true, today: '2026-11-20' });
  let doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.deepEqual(doc.steps.st_ab.du_ab12cd, { step: '2a', at: '2026-11-20', hint: true });
  await classDeepAction(s, 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: null, today: '2026-11-21' });
  doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.equal(doc.steps.st_ab?.du_ab12cd, undefined);
});

test('set_writing keeps piece ticks per task and student', async () => {
  const s = store();
  await classDeepAction(s, 'class1', { action: 'set_writing', unit_id: 'unit1', block_id: 'b1', student_id: 'st_ab', used: ['kp_aa11bb'], missed: ['kp_cc22dd', 'bad'], today: '2026-11-20' });
  const doc = await classDeepAction(s, 'class1', { action: 'load', unit_id: 'unit1' });
  assert.deepEqual(doc.writing.b1.st_ab, { used: ['kp_aa11bb'], missed: ['kp_cc22dd'], at: '2026-11-20' });
});

test('refuses students not on the list, unknown classes and bad steps', async () => {
  await assert.rejects(classDeepAction(store(), 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_zz', du_id: 'du_ab12cd', step: '2a', today: '2026-11-20' }), /not in this class/);
  await assert.rejects(classDeepAction(store(), 'nope', { action: 'load', unit_id: 'unit1' }), /Class not found/);
  await assert.rejects(classDeepAction(store(), 'class1', { action: 'set_step', unit_id: 'unit1', student_id: 'st_ab', du_id: 'du_ab12cd', step: '9', today: '2026-11-20' }), /step/);
});
```

Check `loadRoster` in `_shared/class-claims.mjs`: it fills student ids with `assignInitials`. If those ids differ from the fixture's `st_ab`, build the fixture so the student's id survives `assignInitials` (read `_shared/student-initials.mjs`).

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/unit/class-deep.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `netlify/functions/_shared/class-deep.mjs`**

```js
/**
 * Deep understanding progress for one class and unit: the steps a teacher has
 * passed each student on (Step 1 is worked out from quiz evidence, never
 * stored), and which knowledge pieces each student used or missed in writing.
 *
 *   deep/{class}/{unit}   { steps: { [student]: { [du]: { step, at, hint? } } },
 *                           writing: { [block]: { [student]: { used, missed, at } } } }
 */
import { isSafeId } from './class-examples.mjs';
import { loadRoster } from './class-claims.mjs';
import { read, reject } from './question-drop.mjs';

const key = (classId, unitId) => `deep/${classId}/${unitId}`;
const STEPS = new Set(['2a', '2b', '3', '4']);
const DU = /^du_[a-z0-9]{4,16}$/;
const PIECE = /^kp_[a-z0-9]{4,16}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pieces = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && PIECE.test(x)))].slice(0, 24) : []);

async function loadDoc(store, classId, unitId) {
  const doc = await read(store, key(classId, unitId));
  return { steps: doc?.steps ?? {}, writing: doc?.writing ?? {} };
}

export async function classDeepAction(store, classId, body) {
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  const unitId = body?.unit_id;
  if (!isSafeId(unitId)) reject(400, 'bad_request', 'Pick a unit.');
  const doc = await loadDoc(store, classId, unitId);
  if (body.action === 'load') return doc;

  const student = roster.students.find((s) => s.id === body.student_id);
  if (!student) reject(400, 'bad_request', 'That student is not in this class.');
  const today = DAY.test(body.today ?? '') ? body.today : new Date().toISOString().slice(0, 10);

  if (body.action === 'set_step') {
    if (!DU.test(body.du_id ?? '')) reject(400, 'bad_request', 'Pick a deep understanding.');
    if (body.step !== null && !STEPS.has(body.step)) reject(400, 'bad_request', 'Pick a step: 2A, 2B, 3 or 4.');
    const mine = { ...(doc.steps[student.id] ?? {}) };
    if (body.step === null) delete mine[body.du_id];
    else mine[body.du_id] = { step: body.step, at: today, ...(body.hint ? { hint: true } : {}) };
    doc.steps[student.id] = mine;
  } else if (body.action === 'set_writing') {
    if (!isSafeId(body.block_id)) reject(400, 'bad_request', 'Pick a writing task.');
    const task = { ...(doc.writing[body.block_id] ?? {}) };
    task[student.id] = { used: pieces(body.used), missed: pieces(body.missed), at: today };
    doc.writing[body.block_id] = task;
  } else {
    reject(400, 'bad_request', 'Unknown action.');
  }
  await store.setJSON(key(classId, unitId), doc);
  return doc;
}
```

Check `reject` in `_shared/question-drop.mjs` throws a `QuizError` with that `(status, code, message)` order; match its real signature. Check `read` takes `(store, key)`.

- [ ] **Step 4: Write the handler `netlify/functions/class-deep.mjs`**

Copy `netlify/functions/class-claims.mjs` exactly, with these changes: import `classDeepAction` from `./_shared/class-deep.mjs`; `config = { path: '/api/classes/:id/deep' }`; the path regex `/\/classes\/([^/]+)\/deep$/`; the doc comment "Teacher only: a class's deep understanding progress for a unit."; the handler name `createClassDeepHandler`.

- [ ] **Step 5: Write `apps/teaching/src/deep/api.ts`**

```ts
import { apiPost } from '@/api/client';
import type { PlacedStep } from './schema';
import type { WritingTicks } from './track';

export type DeepProgress = { steps: Record<string, Record<string, { step: PlacedStep; at: string; hint?: boolean }>>; writing: WritingTicks };
const path = (classId: string) => `/api/classes/${encodeURIComponent(classId)}/deep`;

export const deepApi = {
  load: (classId: string, unitId: string) => apiPost<DeepProgress>(path(classId), { action: 'load', unit_id: unitId }),
  setStep: (classId: string, unitId: string, studentId: string, duId: string, step: PlacedStep | null, hint = false) =>
    apiPost<DeepProgress>(path(classId), { action: 'set_step', unit_id: unitId, student_id: studentId, du_id: duId, step, hint }),
  setWriting: (classId: string, unitId: string, blockId: string, studentId: string, used: string[], missed: string[]) =>
    apiPost<DeepProgress>(path(classId), { action: 'set_writing', unit_id: unitId, block_id: blockId, student_id: studentId, used, missed })
};
```

- [ ] **Step 6: Run and commit**

Run: `node --test tests/unit/class-deep.test.js && cd apps/teaching && npx tsc --noEmit`
Expected: PASS.

```bash
git add netlify/functions/_shared/class-deep.mjs netlify/functions/class-deep.mjs apps/teaching/src/deep/api.ts tests/unit/class-deep.test.js
git commit -m "Deep understandings: per-class progress store"
```

---

### Task 7: Unit page — Plan and Make one

**Files:**
- Create: `apps/teaching/src/deep/plan-view.ts`, `apps/teaching/src/deep/editor.ts`, `apps/teaching/src/deep/deep.css`
- Modify: `apps/teaching/src/teacher/sections/units.ts` (~line 621–625), `apps/teaching/src/blocks/walkthru-note/planning.ts` (`renderFrameworkLenses`), `apps/teaching/tests/unit/framework-lenses.test.ts`
- Test: `apps/teaching/tests/unit/deep-views.test.ts`

The views port the mockup's Plan view (`renderPlan`, the DU cards, the "Across the lessons" grid, the expanded card with knowledge pieces and the step ladder) and Make one view (`editor`, `finder`). Copy the CSS rules those functions use from the mockup's `<style>` into `deep.css`, prefixing every class with `du-` (the app has its own `.chip`, `.panel`, `.seg`). Use the app's existing tokens (`--navy`, `--wave`, `--sage`, `--gold` etc. if defined in `src/styles/app.css`; otherwise the mockup's values as local custom properties on `.du-root`).

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDeepPlan } from '@/deep/plan-view';
import { mountDeepEditor } from '@/deep/editor';

const du = { id: 'du_ab12cd', claim: 'A borrowed form turned back on its makers.', why: 'Carries to unseen texts.', dot_points: ['area-one:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'The form began as a warning story', tier: 'essential' as const }], shared_piece_ids: [], steps: [] };
const lessons = [{ id: 'L1', title: 'One', dot_points: ['area-one:U1'], blocks: [] }] as never;
const scope = { points: [{ ref: 'area-one:U1', id: 'U1', kind: 'U' as const, short: 'Close reading' }], bullets: [{ ref: 'ARG1', text: 'claims need reasons', via: ['U1'] }] };

describe('deep understanding views', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('the plan shows each claim, its links and its gaps, and offers a new one', () => {
    const onNew = vi.fn();
    const host = document.createElement('div');
    mountDeepPlan(host, { deep: [du], lessons, weeks: new Map([['L1', 1]]), scope, onOpen: vi.fn(), onNew });
    expect(host.textContent).toContain('A borrowed form turned back on its makers.');
    expect(host.textContent).toContain('U1');
    expect(host.textContent).toContain('ARG1');
    expect(host.textContent).toContain('not taught yet');
    host.querySelector<HTMLButtonElement>('[data-du-action="new"]')!.click();
    expect(onNew).toHaveBeenCalled();
  });

  it('the editor lists only the unit’s scope and saves as you go', () => {
    const onChange = vi.fn();
    const host = document.createElement('div');
    mountDeepEditor(host, { du: { ...du, dot_points: [], concept_bullets: [] }, all: [du], lessons, weeks: new Map(), scope, onChange, onClose: vi.fn() });
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-du-link]')];
    expect(boxes.map((b) => b.value)).toEqual(['area-one:U1', 'ARG1']);
    boxes[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ dot_points: ['area-one:U1'] }));
    expect(host.textContent).not.toContain('Search all');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-views.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `plan-view.ts`**

Export:

```ts
export type DeepPlanOptions = {
  deep: DeepUnderstanding[];
  lessons: Array<{ id: string; title?: string; dot_points?: string[]; blocks?: Block[] }>;
  weeks: Map<string, number | null>;
  scope: { points: ScopePoint[]; bullets: ScopeBullet[] };
  onOpen: (duId: string) => void;   // opens Make one for that deep understanding
  onNew: () => void;
};
export function mountDeepPlan(host: HTMLElement, options: DeepPlanOptions): { update: (next: Partial<DeepPlanOptions>) => void; destroy: () => void };
```

Content, top to bottom (port from the mockup's Plan view):
1. Heading "Deep understandings" with an ⓘ (`<details class="du-eye">`, the mockup's `eye()`), text: "The three or four claims this unit is built to make flexible. Each rests on knowledge pieces and climbs five steps."
2. One card per deep understanding: number, claim (serif), "Why this one", pills for dot points (`U1`) and concept bullets (`ARG1`) with the full text in `title`, the `planGaps(...)` lines as peach warnings, click → `onOpen(du.id)`.
3. `+ Deep understanding` button, `data-du-action="new"`, hidden when there are already four.
4. "Across the lessons": a table, one row per deep understanding, one column per week from `options.weeks` (plus "Not dated yet" when any lesson is null), each cell lists the codes placed in that week: `K` when a piece is first taught there, `2A`/`2B`/`3`/`4` when that step's task sits there. Wrap in a scroll box (memory: wide tables scroll inside a page-width box). Empty steps show as peach `3?` in the last week column.
5. Under the grid, the expanded card for the deep understanding last opened (default the first): knowledge pieces grouped by tier with Taught/Tested chips (`L…` short titles from `options.lessons`), the exit rule line "Step 1 done when every Essential piece is secure and 80% of Essential + Strong taught so far", and the step ladder with `STEP_NAME`, the unit fill line, and the evidence task title.

Compute placements once per deep understanding with `placements(options.lessons, du.id)`.

- [ ] **Step 4: Write `editor.ts`**

Export:

```ts
export type DeepEditorOptions = {
  du: DeepUnderstanding;
  all: DeepUnderstanding[];
  lessons: Array<{ id: string; title?: string; dot_points?: string[]; blocks?: Block[] }>;
  weeks: Map<string, number | null>;
  scope: { points: ScopePoint[]; bullets: ScopeBullet[] };
  onChange: (next: DeepUnderstanding) => void;    // called on every edit; the caller debounces the save
  onTagLessons: (pieceId: string, lessonIds: string[]) => Promise<void>;  // writes deep_taught on a block in each lesson
  onPickTask: (step: PlacedStep) => Promise<void>; // opens the task picker (Step 6)
  onClose: () => void;
};
export function mountDeepEditor(host: HTMLElement, options: DeepEditorOptions): { update: (next: Partial<DeepEditorOptions>) => void; destroy: () => void };
```

(The test passes only the fields it needs; make `onTagLessons` and `onPickTask` optional in the type so it compiles, and hide those buttons when absent.)

Port the mockup's `editor(narrow)` sections:
1. **The claim**: textarea (`DEEP_LIMITS.claim`), two live checks: "Written as a claim, not a theme" is ok when the text has ≥ 6 words and a verb-ish word count > 1 (keep simple: ≥ 6 words); "Names a move that carries beyond this text" stays as guidance text, not a check. "Why this one" input.
2. **Link it to the syllabus**: two checkbox lists from `options.scope` only (`data-du-link`, `value` = the ref), concept bullets labelled `via U1`. No search box. Empty scope shows: "Tick dot points on this unit's lessons first; they appear here."
3. **Knowledge pieces**: one row per piece (tier segmented control, text input, Taught chips + `+`/"Tag where it's taught", Tested chips + "N items" or "Write items"). "Write items" opens the first lesson the piece is taught in (or the unit's first lesson) in the lesson editor: `location.hash = '#/lessons/<id>'` (check the real lesson route in `src/teacher/nav.ts`). Add row; "+ Use a piece from deep understanding N" lists other deep understandings' pieces and adds the id to `shared_piece_ids`. Checks: count of Essential + Strong vs 8–12; untaught/untested pieces named.
4. **Lesson finder** (opens under a piece row): search input over number, title and "Week N"; list grouped by week (`options.weeks`, undated last), checkboxes, picked chips, Done → `onTagLessons(piece.id, ids)`. Tagging writes `withPiecesTaught` onto the lesson's first block (or a new teacher-only `teacher_note` block if the lesson has none) through `apiGet`/`apiPut` `/api/lessons/:id` in the caller (units.ts), the same way `makeCardsFromAnthology` writes a lesson.
5. **Place the steps**: Step 1 says "Tracked through each piece's quiz items". Steps 2A–4: serif fill input, the evidence task (title, `L…`, `Week N`) with Change, or a peach "Find the task that counts…" → `onPickTask(step)`.
6. Side panel "Ready to teach?": the strict `DeepUnderstandingSchema.safeParse` result plus `planGaps` as ticks and open circles; stacks under the form below 1180px.

- [ ] **Step 5: Task picker (in `editor.ts`)**

`pickEvidenceTask(lessons, weeks): Promise<{ lesson_id: string; block_id: string } | null>`: a dialog listing writing blocks (`question_set`, `quiz_question` with `extended_response`/`explain_effect`, `rich_text` with student input, any block carrying `next_steps`) grouped by week then lesson, with a search box. On pick, the caller writes `withEvidenceStep(block, { du, step })` into that lesson (clearing the same `du`+`step` on any other block in the unit's lessons first) and saves. Use the app's existing dialog helper (`askSelectCard` in units.ts is a single list; build a small `<dialog class="du-picker">` instead, styled like the mockup's `.finder`).

- [ ] **Step 6: Wire into `units.ts` and drop the Willingham button**

In `apps/teaching/src/blocks/walkthru-note/planning.ts`, `renderFrameworkLenses`: iterate `FRAMEWORK_LENSES.filter((lens) => lens.id !== 'fw_willingham')`. Add a one-line comment: "Willingham lives in Deep understandings (deep/plan-view.ts)." In `tests/unit/framework-lenses.test.ts` expect 4 buttons and pick index 1 for `fw_marge` (Rosenshine, MARGE, Wiliam, Berger).

In `units.ts`, after `planSection.append(planHeading)` and before the planning prompts, add a `deepHost` section (`unit-page__deep`). Load what it needs once:

```ts
const deepHost = document.createElement('section');
deepHost.className = 'unit-page__deep glass-panel';
deepHost.dataset.unitSection = 'deep';
void (async () => {
  const [lessons, { alignment }] = await Promise.all([
    Promise.all(unit.lesson_ids.map((id) => apiGet<Lesson>(`/api/lessons/${id}`).catch(() => null))).then((rows) => rows.filter((l): l is Lesson => !!l)),
    fetchAlignment().catch(() => ({ alignment: null }))
  ]);
  const weeks = lessonWeeks(unit.lesson_ids, curriculum.scheduled_lessons.filter((r) => r.unit_id === unit.id));
  mountDeepSection(deepHost, { unit, lessons, weeks, scope: unitScope(lessons, alignment), save: (deep) => patchUnit(unit.id, { deep_understandings: deep }) });
})();
```

`mountDeepSection` (export it from `plan-view.ts`) owns the Plan / Make one / Monitoring tabs (pills, like the mockup's top bar), keeps the working copy of `unit.deep_understandings`, debounces saves at 400ms like `scheduleSave` in units.ts, and implements `onTagLessons` / task picking by reading and `apiPut`-ing lessons. Re-run `placements` after each lesson write. `onNew` appends `{ id: newDuId(), claim: '', why: '', dot_points: [], concept_bullets: [], pieces: [], shared_piece_ids: [], steps: [] }` and opens Make one.

Import `./deep.css` from `plan-view.ts`.

- [ ] **Step 7: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-views.test.ts tests/unit/framework-lenses.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/teaching/src/deep apps/teaching/src/teacher/sections/units.ts apps/teaching/src/blocks/walkthru-note/planning.ts apps/teaching/tests/unit/deep-views.test.ts apps/teaching/tests/unit/framework-lenses.test.ts
git commit -m "Deep understandings: Plan and Make one on the unit page; Willingham button retired"
```

---

### Task 8: Lesson editor and quiz builder tagging

**Files:**
- Create: `apps/teaching/src/deep/context.ts`, `apps/teaching/src/deep/block-menu.ts`
- Modify: `apps/teaching/src/teacher/lesson-editor.ts` (inside the `fetchCurriculum().then` around line 872), `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (`createBlockMenu`, ~line 707), `apps/teaching/src/quiz/builder.ts` (the skills field ~line 1120)
- Test: `apps/teaching/tests/unit/deep-lesson-tagging.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { setUnitDeep, unitDeep } from '@/deep/context';
import { deepMenuItems } from '@/deep/block-menu';
import { piecesTaught } from '@/deep/block-tags';

const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces: [{ id: 'kp_aa11bb', text: 'Piece one', tier: 'essential' as const }], shared_piece_ids: [], steps: [] };
const block = { id: 'b1', block_type: 'rich_text', visibility: 'all', content: {}, settings: {} } as never;

describe('tagging from the lesson', () => {
  it('holds the open lesson’s unit pieces', () => {
    setUnitDeep([du]);
    expect(unitDeep().map((d) => d.id)).toEqual(['du_ab12cd']);
    setUnitDeep([]);
    expect(unitDeep()).toEqual([]);
  });
  it('offers one menu item when the unit has deep understandings, none otherwise', () => {
    expect(deepMenuItems(block, [], vi.fn())).toEqual([]);
    const items = deepMenuItems(block, [du], vi.fn());
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe('Deep understanding…');
  });
  it('the sheet’s apply writes taught pieces', async () => {
    const onChange = vi.fn();
    const items = deepMenuItems(block, [du], onChange, { ask: async () => ({ taught: ['kp_aa11bb'], step: null, targets: [] }) });
    await items[0]!.onSelect();
    expect(piecesTaught(onChange.mock.calls[0]![0])).toEqual(['kp_aa11bb']);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-lesson-tagging.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `context.ts`**

```ts
import type { DeepUnderstanding } from './schema';

/** The open lesson's unit deep understandings, set by the lesson editor; the block menu and quiz builder read it. */
let current: DeepUnderstanding[] = [];
export const setUnitDeep = (deep: readonly DeepUnderstanding[] | undefined): void => { current = [...(deep ?? [])]; };
export const unitDeep = (): DeepUnderstanding[] => current;
```

In `lesson-editor.ts` inside the `fetchCurriculum().then`, after `const unit = …`: `setUnitDeep(unit?.deep_understandings);`. On dispose: `setUnitDeep([])`.

- [ ] **Step 4: Write `block-menu.ts`**

```ts
import type { Block } from '@/schemas/block';
import { evidenceStepOf, piecesTaught, targetPieces, withEvidenceStep, withPiecesTaught, withTargetPieces, type EvidenceStep } from './block-tags';
import type { DeepUnderstanding } from './schema';

export type DeepSheetResult = { taught: string[]; step: EvidenceStep | null; targets: string[] };
type Ask = (block: Block, deep: DeepUnderstanding[]) => Promise<DeepSheetResult | null>;

/** The block menu's "Deep understanding…" item: what this block teaches, whether it's a step's evidence task, and its target pieces. */
export function deepMenuItems(block: Block, deep: DeepUnderstanding[], onChange: (next: Block) => void, deps: { ask?: Ask } = {}) {
  if (!deep.length) return [];
  const ask = deps.ask ?? askDeepSheet;
  return [{
    label: 'Deep understanding…',
    dataset: { blockAction: 'deep' },
    onSelect: async () => {
      const result = await ask(block, deep);
      if (!result) return;
      onChange(withTargetPieces(withEvidenceStep(withPiecesTaught(block, result.taught), result.step), result.targets));
    }
  }];
}
```

`askDeepSheet` (same file) opens a `<dialog class="du-sheet">` with three parts, pre-filled from `piecesTaught`, `evidenceStepOf`, `targetPieces`:
1. "This block teaches" — checkboxes of every piece, grouped by deep understanding (DU 1 claim as the group heading), tier tag on each.
2. "This is the evidence task for" — a select: "Nothing", then "DU N · Step 2A/2B/3/4" for each deep understanding.
3. "Pieces to look for in this writing (2–3)" — shown only when a step is chosen; checkboxes, max 3.
Buttons: Save / Cancel. Resolve `null` on cancel.

In `mount-page.ts` `createBlockMenu`, before `'separator'`, spread `...deepMenuItems(block, unitDeep(), (next) => onBlockChange(next))`. Check the menu item type `createHubMenuButton` takes (it needs `icon`; use `HUB_LIST_ICONS.check` or the closest tag-like icon in that map) and the name of the per-block change callback used by `createVisibilitySelect` (`onBlockChange`).

Also add a quiet line under a tagged block in edit mode: "Teaches 2 pieces · Evidence for DU 1 Step 2A" (class `du-block-line`), from the same readers. This is the spec's "Builds towards" line.

- [ ] **Step 5: Quiz builder picker**

In `apps/teaching/src/quiz/builder.ts`, after the skills field (~line 1138), when `unitDeep().length`:

```ts
const deep = unitDeep();
if (deep.length) {
  const box = document.createElement('div');
  box.className = 'du-q-pieces';
  for (const [n, du] of deep.entries()) {
    for (const piece of du.pieces) {
      const label = document.createElement('label');
      const input = Object.assign(document.createElement('input'), { type: 'checkbox', value: piece.id, checked: !!q.pieces?.includes(piece.id) });
      input.addEventListener('change', () => {
        const next = [...box.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value).slice(0, 6);
        if (next.length) q.pieces = next; else delete q.pieces;
        onChange();
      });
      label.append(input, ` DU ${n + 1} · ${piece.text}`);
      box.append(label);
    }
  }
  more.append(labelled('Knowledge pieces this checks', box, 'Counts towards each student’s circles on the unit’s deep understandings. Republish for changes to count.'));
}
```

Match the real names in that block (`more`, `labelled`, the change callback) by reading lines 1080–1140 first. Add `q.pieces?.length` to the `more.open` condition at line 1082. Where the builder strips fields on kind change (line ~70 `delete q.skills`), leave `pieces` alone: pieces apply to every kind.

- [ ] **Step 6: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-lesson-tagging.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/teaching/src/deep apps/teaching/src/teacher/lesson-editor.ts apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/src/quiz/builder.ts apps/teaching/tests/unit/deep-lesson-tagging.test.ts
git commit -m "Deep understandings: tag pieces, evidence tasks and targets from the lesson editor and quiz builder"
```

---

### Task 9: Monitoring

**Files:**
- Create: `apps/teaching/src/deep/monitor-view.ts`
- Modify: `apps/teaching/src/deep/plan-view.ts` (`mountDeepSection` gets the Monitoring tab), `apps/teaching/src/deep/deep.css`
- Test: `apps/teaching/tests/unit/deep-monitor.test.ts`

Port the mockup's Monitoring view: "What this unit is built to deliver" (+ "Copy as a summary paragraph"), "All three at once", "Where each student is" (DU pills, distribution bar, filters + sort, lanes with ⓘ teaching advice, student chips with pips, age and "N not used"), the student detail panel (Evidence for this step; Known, not used with the task; Next move), the two group boxes, and the Knowledge pieces table with circles and the 80% line.

- [ ] **Step 1: Write the pure part's failing test**

`monitor-view.ts` exports a pure `buildMonitor` the view renders from:

```ts
import { describe, expect, it } from 'vitest';
import { buildMonitor } from '@/deep/monitor-view';

const pieces = [
  { id: 'kp_e1e1e1', text: 'E one', tier: 'essential' as const },
  { id: 'kp_s1s1s1', text: 'S one', tier: 'strong' as const }
];
const du = { id: 'du_ab12cd', claim: 'c', why: '', dot_points: ['a:U1'], concept_bullets: ['ARG1'], pieces, shared_piece_ids: [], steps: [] };
const ev = (student: string, date: string, piece: string, share: number) => ({ item: 'q', tags: [`kp:${piece}`], share, why: [], student, source: 'quiz:L1', date, confidence: null });

describe('monitor model', () => {
  it('places students in lanes, finds known-not-used and doesn’t-remember groups', () => {
    const m = buildMonitor({
      deep: [du],
      students: [{ id: 'st_a', initials: 'AB' }, { id: 'st_b', initials: 'CD' }, { id: 'st_c', initials: 'EF' }],
      evidence: [
        ev('st_a', '2026-11-02', 'kp_e1e1e1', 1), ev('st_a', '2026-11-09', 'kp_e1e1e1', 1),
        ev('st_a', '2026-11-02', 'kp_s1s1s1', 1), ev('st_a', '2026-11-09', 'kp_s1s1s1', 1),
        ev('st_b', '2026-11-09', 'kp_e1e1e1', 0)
      ],
      progress: { steps: { st_c: { du_ab12cd: { step: '2a', at: '2026-11-10' } } }, writing: { b1: { st_a: { used: [], missed: ['kp_s1s1s1'], at: '2026-11-12' } } } },
      introduced: new Set(['kp_e1e1e1', 'kp_s1s1s1']),
      today: '2026-11-20'
    });
    const lanes = m.byDu.get('du_ab12cd')!.lanes;
    expect(lanes['1'].map((s) => s.initials)).toEqual(['CD']);
    expect(lanes['2a'].map((s) => s.initials)).toEqual(['AB']);
    expect(lanes['2b'].map((s) => s.initials)).toEqual(['EF']);
    expect(m.byDu.get('du_ab12cd')!.knowsNotUsed).toEqual([{ student: 'st_a', piece: 'kp_s1s1s1', block: 'b1' }]);
    expect(m.byDu.get('du_ab12cd')!.doesntRemember.map((r) => r.student)).toEqual(['st_b']);
  });
});
```

Lane keys are the step each student is **working on**: `'1' | '2a' | '2b' | '3' | '4' | 'done'` (a student passed on Step 4 sits in `done`).

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-monitor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `buildMonitor`**

```ts
export type MonitorInput = {
  deep: DeepUnderstanding[];
  students: Array<{ id: string; initials: string }>;
  evidence: Evidence[];
  progress: DeepProgress;
  introduced: ReadonlySet<string>;
  today: string;
};
type Lane = '1' | '2a' | '2b' | '3' | '4' | 'done';
const NEXT: Record<'none' | Step, Lane> = { none: '1', '1': '2a', '2a': '2b', '2b': '3', '3': '4', '4': 'done' };

export function buildMonitor(input: MonitorInput) {
  const byDu = new Map<string, {
    lanes: Record<Lane, Array<{ id: string; initials: string; notUsed: number; since: string | null }>>;
    circles: Record<string, Record<string, Circle>>;
    knowsNotUsed: Array<{ student: string; piece: string; block: string }>;
    doesntRemember: Array<{ student: string; pieces: string[] }>;
  }>();
  for (const du of input.deep) {
    const pieces = piecesFor(du, input.deep);
    const lanes: Record<Lane, Array<{ id: string; initials: string; notUsed: number; since: string | null }>> = { '1': [], '2a': [], '2b': [], '3': [], '4': [], done: [] };
    const circles: Record<string, Record<string, Circle>> = {};
    const knowsNotUsed: Array<{ student: string; piece: string; block: string }> = [];
    const doesntRemember: Array<{ student: string; pieces: string[] }> = [];
    for (const s of input.students) {
      const mine: Record<string, Circle> = {};
      for (const p of pieces) mine[p.id] = circleFor(input.evidence, s.id, p.id, input.today, input.progress.writing);
      circles[s.id] = mine;
      const passed = input.progress.steps[s.id]?.[du.id];
      const step = studentStep(step1Passed(pieces, input.introduced, mine), passed);
      const notUsed = pieces.filter((p) => mine[p.id]!.ring === 'missed').length;
      lanes[NEXT[step ?? 'none']].push({ id: s.id, initials: s.initials, notUsed, since: passed?.at ?? null });
      for (const [block, byStudent] of Object.entries(input.progress.writing)) {
        for (const piece of byStudent[s.id]?.missed ?? []) if (pieces.some((p) => p.id === piece) && mine[piece]?.ring === 'missed') knowsNotUsed.push({ student: s.id, piece, block });
      }
      const amber = pieces.filter((p) => mine[p.id]!.amber).map((p) => p.id);
      if (amber.length) doesntRemember.push({ student: s.id, pieces: amber });
    }
    byDu.set(du.id, { lanes, circles, knowsNotUsed, doesntRemember });
  }
  return { byDu };
}
```

(In the test, `st_a` has no writing tick that says `used`, so `kp_s1s1s1` has ring `missed` and shows in `knowsNotUsed`; `st_a` passes Step 1 with both pieces full, so they're working on 2A.)

- [ ] **Step 4: Render it**

`mountDeepMonitor(host, { unit, deep, lessons, classes })`:
- A class picker (classes teaching the unit, from `curriculum.classes` filtered like `lesson-editor.ts` line 878). On pick: `httpMarkbookApi.load(classId)` → `classEvidence(view, ctx)` (`loadInsightContext()` for `ctx`) → keep `evidence` items whose tags include a `kp:` tag; `deepApi.load(classId, unit.id)`; `students` from `view.students` (id + initials).
- `introduced` = pieces taught in a lesson whose scheduled date for this class is ≤ today, plus any piece with evidence for anyone in the class.
- Render each section from the mockup, reading `buildMonitor(...)`. Chip click opens the detail panel. Next move buttons:
  - "Pass on this step" → `deepApi.setStep(classId, unit.id, student, du.id, nextStep, hintTicked)`; "Move back" → set to the previous step or `null` (teacher action only; the spec says nothing moves back automatically).
  - "Send as a next step" → use the next-step feedback engine's existing teacher action for a personal next step on that writing block (find it from `memory: next-step-feedback`, `apps/teaching/src/ai/next-step-jobs.ts` and the markbook's returned work; if there is no teacher-set personal next step API yet, show the button disabled with the text "Coming with next steps" and say so in the PR).
  - "Set a redo" and "Add to a regroup" → open the existing regroup flow (`saveGroup` in `markbook/api.ts`) with the student and the piece's tag (`kp:<id>`) prefilled.
- "Mark piece use" on each evidence task with target pieces: a student × target grid of three-state buttons (used / missed / blank) → `deepApi.setWriting`.
- "Copy as a summary paragraph": "This unit builds N deep understandings: 1) <claim> (<dot points>, <concept bullets>). …" to the clipboard.

- [ ] **Step 5: Run and commit**

Run: `cd apps/teaching && npx vitest run tests/unit/deep-monitor.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add apps/teaching/src/deep apps/teaching/tests/unit/deep-monitor.test.ts
git commit -m "Deep understandings: Monitoring view"
```

---

### Task 10: Walk it, gate, PR

- [ ] **Step 1: Browser walk (dev mock)**

Start the Teaching dev preview from `.claude/launch.json` (`preview_start`). On a unit with invented lessons: make a deep understanding (claim, one dot point, one concept bullet, 8 pieces), tag two pieces from the lesson editor's block menu, tag a quiz question's pieces in the builder, pick an evidence task for 2A. Check Plan shows the claim, links, weeks grid and gaps; Make one shows only the unit's dot points; Monitoring loads a class. Repeat at 390px (`resize_window` mobile). Fix what's broken, then reset the viewport to desktop.

- [ ] **Step 2: Gate**

Check the diff first: `git diff --stat origin/main...HEAD`. Nothing under grove, `packages/`, Tasks fixtures or workflows should be in it. Then:

Run: `npm run pre-pr-check`
Expected: exit 0. A Teaching-only diff should not trigger the full suite.

- [ ] **Step 3: Push and open the PR (ready, not draft), then enable auto-merge**

```bash
git push -u origin claude/deep-understandings
gh pr create --title "Deep understandings: plan, tag and monitor a unit's 3–4 deep understandings" --body-file /tmp/pr-body.md
```

The PR body: what it adds (the three views, tags, class store), what goes (the Willingham framework button), what wasn't walked (Safari, a real class's Monitoring), and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Invented examples only. Then enable auto-merge (merge commit).

---

## Self-review notes

- Spec coverage: claim, why, links (T1, T7), unit-only scope (T4, T7), tiers and sharing (T1, T4), taught/tested from tags and the lesson finder (T3, T4, T7), lesson-editor tagging (T8), steps by evidence task (T3, T4, T7), `kp:`/`du:` tags (T2), class progress (T6), circles and Step 1 exit (T5), the three screens (T7, T9), weeks grid (T4, T7), "Builds towards" line (T8), Willingham button gone (T7), tests (each task), browser walk (T10).
- `du:` step evidence tags exist for labels and future quiz-level step evidence; step passes are teacher actions stored in the class record, as the spec says.
- AI marking of short answers is out of scope (`docs/future-build-ideas/ai-short-answer-marking.md`).
