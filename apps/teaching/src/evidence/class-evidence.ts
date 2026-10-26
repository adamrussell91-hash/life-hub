import type { MarkbookView } from '@/markbook/types';
import type { InsightContext } from './context';
import { markbookEvidence, type Source } from './markbook-evidence';
import { withLessonOutcomes, withPointTags } from './syllabus';
import { expandTags } from './tags';
import type { Evidence } from './types';

/** A class's markbook evidence with catalogue tags, families, the outcomes quiz lessons reach, and the dot points. */
export function classEvidence(view: MarkbookView, ctx: InsightContext): { evidence: Evidence[]; sources: Source[] } {
  const { evidence, sources } = markbookEvidence(view, ctx.outcomes);
  const outcomed = withLessonOutcomes(expandTags(evidence, ctx.table), ctx.lessonOutcomes ?? new Map());
  return { evidence: withPointTags(outcomed, ctx.lessonPoints ?? new Map(), ctx.outcomePoints ?? new Map()), sources };
}
