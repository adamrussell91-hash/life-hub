import type { MarkbookView } from '@/markbook/types';
import type { InsightContext } from './context';
import { markbookEvidence, type Source } from './markbook-evidence';
import { withLessonOutcomes } from './syllabus';
import { expandTags } from './tags';
import type { Evidence } from './types';

/** A class's markbook evidence with catalogue tags, families, and the outcomes quiz lessons reach. */
export function classEvidence(view: MarkbookView, ctx: InsightContext): { evidence: Evidence[]; sources: Source[] } {
  const { evidence, sources } = markbookEvidence(view, ctx.outcomes);
  return { evidence: withLessonOutcomes(expandTags(evidence, ctx.table), ctx.lessonOutcomes ?? new Map()), sources };
}
