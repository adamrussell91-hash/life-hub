import { peekCurriculum } from '@/app/curriculum-state';
import { loadFeedbackCodes, type FeedbackCode } from '@/blocks/feedback-codes';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { outcomeLabels } from '@/markbook/parse';
import { loadSkills } from '@/skills/api';
import type { TagContext } from './tags';

/** What the insight views need to name tags and codes. Each part may be missing; views fall back to raw ids. */
export type InsightContext = TagContext & { codes: FeedbackCode[] };

let cached: Promise<Omit<InsightContext, 'outcomes'>> | null = null;

export async function loadInsightContext(): Promise<InsightContext> {
  cached ??= Promise.all([
    loadLiteraryElements().catch(() => null),
    loadSkills().catch(() => null),
    loadFeedbackCodes().catch(() => [] as FeedbackCode[])
  ]).then(([table, skills, codes]) => ({ table, skills, codes }));
  // Outcomes are read each time: the curriculum may load after the first call.
  return { ...(await cached), outcomes: outcomeLabels(peekCurriculum()?.outcomes ?? []) };
}

export function codeLabel(id: string, codes: readonly FeedbackCode[]): string {
  const code = codes.find((c) => c.id === id);
  return code ? `${code.code} ${code.label}` : id;
}
