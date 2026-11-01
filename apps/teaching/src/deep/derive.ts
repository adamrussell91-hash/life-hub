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
