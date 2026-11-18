import type { MarkbookView } from '@/markbook/types';
import type { InsightContext } from './context';
import { markbookEvidence, type Source } from './markbook-evidence';
import { withLessonOutcomes, withPointTags } from './syllabus';
import { expandTags } from './tags';
import type { Evidence } from './types';

/**
 * The focus areas (modules) this class has been taught: the areas of the units
 * its quizzes, written work, games and handed-in tasks come from. Null when
 * none can be worked out, so nothing is narrowed.
 */
export function taughtAreas(view: MarkbookView, ctx: InsightContext): ReadonlySet<string> | null {
  const lessons = new Set<string>([
    ...view.quizzes.map((q) => q.lesson_id),
    ...(view.work ?? []).map((w) => w.lesson_id),
    ...(view.games ?? []).map((g) => g.lesson_id),
    ...(view.rubrics ?? []).map((r) => r.lesson_id),
    ...(view.markbook.columns ?? []).flatMap((c) => (c.kind === 'assessment' && c.piece ? [c.piece.lesson_id] : []))
  ]);
  const areas = new Set<string>();
  for (const lesson of lessons) {
    for (const area of ctx.chain?.lessonAreas.get(lesson) ?? []) areas.add(area);
    // No chain: the lesson's own dot points name its areas.
    if (!ctx.chain) for (const tag of ctx.lessonPoints?.get(lesson) ?? []) areas.add(tag.split(':')[1]!);
  }
  return areas.size ? areas : null;
}

/** Drops `dp:` tags outside the taught areas: an outcome every module shares must not mark a module not yet taught. */
function withinAreas(evidence: Evidence[], areas: ReadonlySet<string> | null): Evidence[] {
  if (!areas) return evidence;
  return evidence.map((e) => {
    const tags = e.tags.filter((t) => !t.startsWith('dp:') || areas.has(t.split(':')[1]!));
    return tags.length === e.tags.length ? e : { ...e, tags };
  });
}

/** A class's markbook evidence with catalogue tags, families, the outcomes quiz lessons reach, and the dot points. */
export function classEvidence(view: MarkbookView, ctx: InsightContext): { evidence: Evidence[]; sources: Source[] } {
  const { evidence, sources } = markbookEvidence(view, ctx.outcomes);
  const outcomed = withLessonOutcomes(expandTags(evidence, ctx.table), ctx.lessonOutcomes ?? new Map());
  const pointed = withPointTags(outcomed, ctx.lessonPoints ?? new Map(), ctx.outcomePoints ?? new Map(), ctx.chain ?? null);
  return { evidence: withinAreas(pointed, taughtAreas(view, ctx)), sources };
}
