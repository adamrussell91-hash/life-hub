import { apiGet } from '@/api/client';
import { loadFeedbackCodes, type FeedbackCode } from '@/blocks/feedback-codes';
import { visitBlocks } from '@/blocks/walk-blocks';
import { deepApi } from '@/deep/api';
import type { DeepUnderstanding } from '@/deep/schema';
import type { NextStepBank } from '@/quiz/core';
import type { Block } from '@/schemas/block';
import { loadSkills } from '@/skills/api';
import { loadStudentRungs, type SkillRungs } from '@/skills/rungs-api';
import type { SkillsContinuum } from '@/skills/schema';
import { rubricRows, rubricTags, type RubricPieceRow } from './rubric-model';
import type { PassedSteps, RubricSetup } from './rubric-panel';

/**
 * Finds what a piece of work is tagged with and loads what its rubric shows.
 * Null when the work carries no tags, which keeps the marking as it was.
 */

export type RubricWhere = { lessonId: string; blockId?: string | null; questionId?: string | null; who?: { classId: string; studentId: string } | null };
type Lesson = { unit_id?: string; blocks?: Block[] };
type Item = { skills?: string[]; pieces?: string[]; next_steps?: NextStepBank };
export type RubricDeps = {
  lesson?: (id: string) => Promise<Lesson>;
  unit?: (id: string) => Promise<{ deep_understandings?: DeepUnderstanding[] }>;
  continuum?: () => Promise<SkillsContinuum>;
  codes?: () => Promise<readonly FeedbackCode[]>;
  progress?: (classId: string, unitId: string) => Promise<{ steps: Record<string, Record<string, { step: string }>> }>;
  rungs?: (classId: string, studentId: string) => Promise<SkillRungs>;
};

const realDeps: Required<RubricDeps> = {
  lesson: (id) => apiGet<Lesson>(`/api/lessons/${encodeURIComponent(id)}`),
  unit: (id) => apiGet(`/api/units/${encodeURIComponent(id)}`),
  continuum: loadSkills,
  codes: loadFeedbackCodes,
  progress: (classId, unitId) => deepApi.load(classId, unitId),
  rungs: loadStudentRungs
};

/** The block a piece of work sits in, and the item carrying its own tags: a quiz question, or a written task's questions read together. */
function findWork(blocks: readonly Block[], where: RubricWhere): { block: Block | null; item: Item | null } {
  let found: { block: Block | null; item: Item | null } = { block: null, item: null };
  visitBlocks(blocks as Block[], (block) => {
    const content = block.content as { question?: Item & { id?: string }; questions?: Item[] } | undefined;
    if (where.questionId && (content?.question?.id === where.questionId || block.id === where.questionId)) found = { block, item: content?.question ?? null };
    else if (where.blockId && block.id === where.blockId) {
      const items = content?.question ? [content.question] : content?.questions ?? [];
      found = {
        block,
        item: {
          skills: items.flatMap((q) => q.skills ?? []),
          pieces: items.flatMap((q) => q.pieces ?? []),
          next_steps: Object.assign({}, ...items.map((q) => q.next_steps ?? {})) as NextStepBank
        }
      };
    }
  });
  return found;
}

export function passedOf(progress: { steps: Record<string, Record<string, { step: string }>> } | null, studentId: string): PassedSteps {
  return Object.fromEntries(Object.entries(progress?.steps[studentId] ?? {}).map(([du, row]) => [du, row.step])) as PassedSteps;
}

export async function loadRubricSetup(where: RubricWhere, deps: RubricDeps = {}): Promise<RubricSetup | null> {
  const use = { ...realDeps, ...deps };
  const lesson = await use.lesson(where.lessonId).catch(() => null);
  if (!lesson) return null;
  const { block, item } = findWork(lesson.blocks ?? [], where);
  if (!block) return null;
  return setupFor(rubricTags(block, item), lesson.unit_id ?? null, where.who ?? null, item?.next_steps ?? null, use);
}

/** The rubric for work with no lesson (writing the teacher added): its unit and its own deep tags. */
export async function loadUnitRubricSetup(where: { unitId: string; settings: Block['settings']; who?: RubricWhere['who'] }, deps: RubricDeps = {}): Promise<RubricSetup | null> {
  return setupFor(rubricTags({ settings: where.settings }), where.unitId, where.who ?? null, null, { ...realDeps, ...deps });
}

async function setupFor(tags: ReturnType<typeof rubricTags>, unitId: string | null, who: RubricWhere['who'], bank: NextStepBank | null, use: Required<RubricDeps>): Promise<RubricSetup | null> {
  if (!tags.skills.length && !tags.pieces.length && !tags.steps.length) return null;
  const [unit, continuum, codes] = await Promise.all([
    unitId ? use.unit(unitId).catch(() => null) : Promise.resolve(null),
    tags.skills.length ? use.continuum().catch(() => null) : Promise.resolve(null),
    use.codes().catch(() => [] as readonly FeedbackCode[])
  ]);
  const deep = unit?.deep_understandings ?? [];
  const [progress, last] = await Promise.all([
    who && unitId && tags.steps.length ? use.progress(who.classId, unitId).catch(() => null) : Promise.resolve(null),
    who && tags.skills.length ? use.rungs(who.classId, who.studentId).catch(() => null) : Promise.resolve(null)
  ]);
  const unitPieces: RubricPieceRow[] = deep.flatMap((d) => d.pieces.map((p) => ({ id: p.id, text: p.text, tier: p.tier })));
  return {
    rows: rubricRows(tags, { continuum, deep }),
    unitPieces,
    deep,
    continuum,
    codes,
    bank,
    passed: progress && who ? passedOf(progress, who.studentId) : null,
    last,
    unitId
  };
}
