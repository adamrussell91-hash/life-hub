import { peekCurriculum } from '@/app/curriculum-state';
import { loadFeedbackCodes, type FeedbackCode } from '@/blocks/feedback-codes';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { outcomeLabels } from '@/markbook/parse';
import { loadSkills } from '@/skills/api';
import { loadAlignment } from '@/alignment/api';
import type { Alignment } from '@/alignment/schema';
import { lessonOutcomeMap, lessonPointMap, outcomePointMap } from './syllabus';
import type { TagContext } from './tags';

/**
 * What the insight views need to name tags and codes. Each part may be
 * missing; views fall back to raw ids. `lessonOutcomes` holds the outcome
 * tags each lesson's dot points reach, for quiz items tagged with none.
 */
export type InsightContext = TagContext & {
  codes: FeedbackCode[];
  lessonOutcomes?: ReadonlyMap<string, string[]>;
  /** Each lesson's dot point tags, and the dot points each outcome tag reaches. */
  lessonPoints?: ReadonlyMap<string, string[]>;
  outcomePoints?: ReadonlyMap<string, string[]>;
};

let cached: Promise<Omit<InsightContext, 'outcomes' | 'lessonOutcomes' | 'lessonPoints' | 'outcomePoints' | 'alignment'> & { alignment: Alignment | null }> | null = null;

export async function loadInsightContext(): Promise<InsightContext> {
  let failed = false;
  const soft = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch(() => {
      failed = true;
      return fallback;
    });
  const mine = (cached ??= Promise.all([
    soft(loadLiteraryElements(), null),
    soft(loadSkills(), null),
    soft(loadFeedbackCodes(), [] as FeedbackCode[]),
    // Not every subject has an alignment; its loader keeps its own cache and retries a failure.
    loadAlignment().catch((): Alignment | null => null)
  ]).then(([table, skills, codes, alignment]) => {
    // A degraded result is used once but not kept, so the next call retries.
    if (failed && cached === mine) cached = null;
    return { table, skills, codes, alignment };
  }));
  // Outcomes and lessons are read each time: the curriculum may load after the first call.
  const { alignment, ...rest } = await mine;
  const curriculum = peekCurriculum();
  const outcomes = outcomeLabels(curriculum?.outcomes ?? []);
  return {
    ...rest,
    alignment,
    outcomes,
    lessonOutcomes: lessonOutcomeMap(curriculum?.lessons ?? [], alignment, outcomes),
    lessonPoints: lessonPointMap(curriculum?.lessons ?? [], alignment),
    outcomePoints: outcomePointMap(alignment, outcomes)
  };
}

export function codeLabel(id: string, codes: readonly FeedbackCode[]): string {
  const code = codes.find((c) => c.id === id);
  return code ? `${code.code} ${code.label}` : id;
}
