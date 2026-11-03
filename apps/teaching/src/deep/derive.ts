import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block } from '@/schemas/block';
import { evidenceSteps, piecesTaught } from './block-tags';
import { PIECE_TARGET, PIECE_TARGET_LABEL, piecesFor, STEP_LABEL, type DeepUnderstanding, type KnowledgePiece, type PlacedStep } from './schema';

export type StepTask = { lesson_id: string; block_id: string; title: string };
/** Where a unit's pieces are taught and tested, and every task that is evidence for each step, read from lesson tags. A step with no task has no entry. */
export type Placements = {
  taught: Map<string, string[]>;
  tested: Map<string, { lessons: string[]; items: number }>;
  steps: Map<PlacedStep, StepTask[]>;
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
      for (const step of evidenceSteps(block)) {
        if (step.du !== duId) continue;
        const tasks = out.steps.get(step.step) ?? out.steps.set(step.step, []).get(step.step)!;
        tasks.push({ lesson_id: lesson.id, block_id: block.id, title: blockTitle(block) });
      }
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
  if (core < PIECE_TARGET.min) gaps.push(`Only ${core} knowledge piece${core === 1 ? '' : 's'} (aim for ${PIECE_TARGET_LABEL} Essential and Strong)`);
  if (core > PIECE_TARGET.max) gaps.push(`${core} knowledge pieces (aim for ${PIECE_TARGET_LABEL} Essential and Strong)`);
  const untaught = pieces.filter((x) => !p.taught.has(x.id)).length;
  if (untaught) gaps.push(`${untaught} piece${untaught === 1 ? '' : 's'} not taught yet`);
  const untested = pieces.filter((x) => !p.tested.has(x.id)).length;
  if (untested) gaps.push(`${untested} piece${untested === 1 ? '' : 's'} not tested yet`);
  const missing = (['2a', '2b', '3', '4'] as const).filter((s) => !p.steps.has(s)).map((s) => STEP_LABEL[s]);
  if (missing.length) gaps.push(`No evidence task for Step${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);
  return gaps;
}

/** The chain's links for one deep understanding: rules 1, 3 and 4 of the one-chain model. Flags only; nothing here blocks a save. */
export type ChainFlags = {
  /** Its own pieces with no dot point yet. Shared pieces are flagged on the deep understanding that owns them. */
  no_point: KnowledgePiece[];
  /** Its own pieces whose dot point isn't one of this deep understanding's. */
  off_du: KnowledgePiece[];
  no_u: boolean;
  no_r: boolean;
};

const pointKind = (ref: string): string => ref.split(':')[1]?.charAt(0) ?? '';

export function chainFlags(du: DeepUnderstanding): ChainFlags {
  return {
    no_point: du.pieces.filter((p) => !p.dot_point),
    off_du: du.pieces.filter((p) => p.dot_point && !du.dot_points.includes(p.dot_point)),
    no_u: !du.dot_points.some((ref) => pointKind(ref) === 'U'),
    no_r: !du.dot_points.some((ref) => pointKind(ref) === 'R')
  };
}

/** The peach warnings for those links, worded like planGaps. Empty when the links are whole. */
export function chainGaps(du: DeepUnderstanding): string[] {
  const f = chainFlags(du);
  const gaps: string[] = [];
  if (f.no_u) gaps.push('Needs a U dot point');
  if (f.no_r) gaps.push('Needs an R dot point');
  if (f.no_point.length) gaps.push(`${f.no_point.length} piece${f.no_point.length === 1 ? '' : 's'} with no U dot point`);
  if (f.off_du.length) gaps.push(`${f.off_du.length} piece${f.off_du.length === 1 ? '' : 's'} on a U outside this deep understanding`);
  return gaps;
}

/** The unit's U and R points (ticked on its lessons, for instance: `unitScope`) that sit in no deep understanding. */
export function pointsOutsideDus(unitPoints: readonly string[], deep: readonly DeepUnderstanding[]): string[] {
  const placed = new Set(deep.flatMap((d) => d.dot_points));
  return [...new Set(unitPoints)].filter((ref) => !placed.has(ref));
}
