import type { PointChain } from '@/evidence/syllabus';
import { GRID } from '@/evidence/constants';
import { rungOf, type Rung } from '@/evidence/syllabus-grid';
import type { Evidence } from '@/evidence/types';
import { visitBlocks } from '@/blocks/walk-blocks';
import { evidenceSteps } from './block-tags';
import type { LessonLike } from './editor';
import type { DeepUnderstanding, PlacedStep } from './schema';

/**
 * What the By deep understanding lens adds to the Monitoring lanes. Pure.
 * Skills and rungs are for reading only: they never move a student a step.
 */

const ORDER: PlacedStep[] = ['2a', '2b', '3', '4'];

/** The skills (`strand.sub`) a deep understanding's Responding points need. */
export function skillsForDu(du: Pick<DeepUnderstanding, 'dot_points'>, chain: PointChain | null | undefined): string[] {
  if (!chain) return [];
  return [...chain.skills].filter(([, refs]) => refs.some((r) => du.dot_points.includes(r))).map(([id]) => id);
}

/** Where a student sits on one skill, from its tagged marks alone. Null below the minimum number of marks. */
export function skillRungOf(evidence: readonly Evidence[], student: string, skill: string): Rung | null {
  const mine = evidence.filter((e) => e.student === student && e.share !== null && e.tags.includes(`skill:${skill}`));
  if (mine.length < GRID.minItems) return null;
  return rungOf(mine.reduce((sum, e) => sum + (e.share as number), 0) / mine.length);
}

const questionOf = (item: string): string => item.split('#')[0] as string;

/**
 * Steps a student looks ready to be passed on: an auto-marked item on a block
 * tagged with that DU step, all of it answered with full marks. Steps already
 * passed are left out. The teacher still presses Pass. Keyed `student|du`.
 */
export function readyToPass(input: {
  lessons: readonly LessonLike[];
  evidence: readonly Evidence[];
  students: readonly string[];
  steps: Record<string, Record<string, { step: PlacedStep }>>;
}): Map<string, PlacedStep[]> {
  const tagged: Array<{ lesson: string; block: string; du: string; step: PlacedStep }> = [];
  for (const lesson of input.lessons) {
    visitBlocks(lesson.blocks ?? [], (block) => {
      for (const s of evidenceSteps(block)) tagged.push({ lesson: lesson.id, block: block.id, du: s.du, step: s.step });
    });
  }
  const out = new Map<string, PlacedStep[]>();
  for (const student of input.students) {
    const mine = input.evidence.filter((e) => e.student === student && e.share !== null);
    for (const t of tagged) {
      const passed = input.steps[student]?.[t.du]?.step;
      if (passed && ORDER.indexOf(t.step) <= ORDER.indexOf(passed)) continue;
      const items = mine.filter((e) => e.source === `quiz:${t.lesson}` && questionOf(e.item) === t.block);
      if (!items.length || !items.every((e) => (e.share ?? 0) >= 1)) continue;
      const key = `${student}|${t.du}`;
      const list = out.get(key) ?? [];
      if (!list.includes(t.step)) out.set(key, [...list, t.step].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    }
  }
  return out;
}
