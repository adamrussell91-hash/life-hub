import { apiGet } from '@/api/client';
import type { CodeColour } from '@/blocks/peer-annotate';

/**
 * The teacher's marking shorthand (TS, E, AR, FW …): one library shared by
 * Voice block marking and annotation notes. The server keeps it
 * (netlify/functions/_shared/feedback-codes.mjs); this file holds the types
 * and the pure helpers both surfaces use.
 */

export type FeedbackCodeGroup = 'composition' | 'viva' | 'speaking';
export type Criterion = 1 | 2 | 3;

export type FeedbackCode = {
  id: string;
  code: string;
  label: string;
  group: FeedbackCodeGroup;
  criterion: Criterion | null;
  colour: CodeColour;
  descriptor: string;
  key?: string;
  strength_descriptor?: string;
  hidden?: boolean;
};

export const FEEDBACK_CODES_ENDPOINT = '/api/feedback-codes';

export const GROUP_LABELS: Record<FeedbackCodeGroup, string> = {
  composition: 'Composition',
  viva: 'Viva',
  speaking: 'Speaking'
};

export const CRITERION_LABELS: Record<Criterion, string> = {
  1: 'Criterion 1 · Ideas',
  2: 'Criterion 2 · Evidence',
  3: 'Criterion 3 · Expression'
};

/** Strengths are always drawn green, whatever the code's own colour. */
export const STRENGTH_COLOUR: CodeColour = 'sage';

export const codeInk = (colour: CodeColour): string => `var(--pastel-${colour}-ink)`;

let cached: Promise<FeedbackCode[]> | null = null;

/** The library, fetched once per page. `fresh` refetches after an edit. */
export function loadFeedbackCodes(fresh = false): Promise<FeedbackCode[]> {
  if (!cached || fresh) {
    cached = apiGet<{ codes: FeedbackCode[] }>(FEEDBACK_CODES_ENDPOINT).then((data) => data.codes);
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export function primeFeedbackCodes(codes: FeedbackCode[]): void {
  cached = Promise.resolve(codes);
}

export type TypedEntry =
  | { kind: 'match'; code: FeedbackCode }
  | { kind: 'partial'; matches: FeedbackCode[] }
  | { kind: 'none' };

/**
 * What a run of typed letters means so far. "T" is partial while TS exists;
 * Space then confirms the exact code. Hidden codes never match.
 */
export function resolveTyped(buffer: string, codes: readonly FeedbackCode[], confirm = false): TypedEntry {
  const typed = buffer.trim().toUpperCase();
  if (!typed) return { kind: 'none' };
  const live = codes.filter((c) => !c.hidden);
  const exact = live.find((c) => c.code === typed);
  const longer = live.filter((c) => c.code.startsWith(typed) && c.code !== typed);
  if (exact && (confirm || longer.length === 0)) return { kind: 'match', code: exact };
  if (exact || longer.length) return { kind: 'partial', matches: exact ? [exact, ...longer] : longer };
  return { kind: 'none' };
}

export function codeForKey(key: string, codes: readonly FeedbackCode[]): FeedbackCode | undefined {
  return codes.find((c) => !c.hidden && c.group === 'speaking' && c.key === key);
}

/** "AR" or "AR+" for a strength. */
export function codeText(code: Pick<FeedbackCode, 'code'>, positive: boolean): string {
  return positive ? `${code.code}+` : code.code;
}

/** What the student reads for a tag. */
export function descriptorFor(code: FeedbackCode, positive: boolean): string {
  if (positive) return code.strength_descriptor || `Strength: ${code.label.toLowerCase()}.`;
  return code.descriptor;
}

export type TaggedCode = { code_id: string; positive: boolean };

export type SummaryLine = { heading: string; items: Array<{ code: FeedbackCode; text: string; count: number; positive: boolean }> };

/**
 * Tags grouped by rubric criterion, then speaking. Strengths and corrections
 * of the same code are counted apart: "E+ ×2 · E ×1".
 */
export function summariseByCriterion(tags: readonly TaggedCode[], codes: readonly FeedbackCode[]): SummaryLine[] {
  const byId = new Map(codes.map((c) => [c.id, c]));
  const buckets = new Map<string, Map<string, { code: FeedbackCode; positive: boolean; count: number }>>();
  for (const tag of tags) {
    const code = byId.get(tag.code_id);
    if (!code) continue;
    const heading = code.criterion ? CRITERION_LABELS[code.criterion] : GROUP_LABELS[code.group];
    const bucket = buckets.get(heading) ?? new Map();
    const key = `${code.id}:${tag.positive}`;
    const hit = bucket.get(key) ?? { code, positive: tag.positive, count: 0 };
    hit.count += 1;
    bucket.set(key, hit);
    buckets.set(heading, bucket);
  }
  const order = [CRITERION_LABELS[1], CRITERION_LABELS[2], CRITERION_LABELS[3], GROUP_LABELS.speaking, GROUP_LABELS.composition, GROUP_LABELS.viva];
  return order
    .filter((heading) => buckets.has(heading))
    .map((heading) => ({
      heading,
      items: [...buckets.get(heading)!.values()]
        .sort((a, b) => Number(b.positive) - Number(a.positive) || b.count - a.count)
        .map((hit) => ({ code: hit.code, text: codeText(hit.code, hit.positive), count: hit.count, positive: hit.positive }))
    }));
}

export function summaryLineText(line: SummaryLine): string {
  return line.items.map((item) => (item.count > 1 ? `${item.text} ×${item.count}` : item.text)).join(' · ');
}
