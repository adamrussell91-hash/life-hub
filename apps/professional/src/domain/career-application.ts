/**
 * Plain rules behind the Criteria Mirror (the application workspace): word
 * limits, word counts, `[add: …]` brackets, cost lines and what a criteria save
 * may send. No DOM here, so each rule is tested on its own.
 */
import type { SelectionCriterion } from './types';

export const WORD_LIMIT_MIN = 25;
export const WORD_LIMIT_MAX = 2000;
/** "1 page" in an ad means about this many words. */
const WORDS_PER_PAGE = 500;

/** Costs the page states before Ann runs (A$). */
export const APPLICATION_COSTS = {
  check: 0.1,
  responses: 0.15,
  /** One criterion redrafted on its own. */
  criterion: 0.05,
  cover_letter: 0.08,
  cv: 0.1,
  everything: 0.35
} as const;

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, half: 0.5 };

function clampLimit(words: number): number | null {
  if (!Number.isFinite(words) || words <= 0) return null;
  return Math.min(WORD_LIMIT_MAX, Math.max(WORD_LIMIT_MIN, Math.round(words)));
}

/**
 * Picks a word limit out of a criterion line: "(250 words)", "max 300 words",
 * "no more than 400 words", "(1 page)" (~500), "half a page" (~250). The line
 * itself keeps the wording.
 */
export function parseWordLimit(text: string): number | null {
  const line = String(text ?? '');
  const words = line.match(/(\d{1,3}(?:,\d{3})?|\d{2,4})\s*(?:-|–)?\s*words?\b/i);
  if (words) return clampLimit(Number(words[1]!.replace(/,/g, '')));
  if (/\bhalf(?:\s+an?)?\s+(?:a\s+)?(?:a4\s+)?page\b/i.test(line)) return clampLimit(WORDS_PER_PAGE / 2);
  const pages = line.match(/\b(\d|one|two|three|four)\s*(?:a4\s+)?pages?\b/i);
  if (pages) {
    const raw = pages[1]!.toLowerCase();
    const count = NUMBER_WORDS[raw] ?? Number(raw);
    return clampLimit(count * WORDS_PER_PAGE);
  }
  return null;
}

export function countWords(text: string | null | undefined): number {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** "142 / 250 words", or "142 words" with no limit. */
export function wordCountLabel(text: string | null | undefined, limit: number | null | undefined): string {
  const count = countWords(text);
  const noun = count === 1 && !limit ? 'word' : 'words';
  return limit ? `${count} / ${limit} words` : `${count} ${noun}`;
}

export function overLimit(text: string | null | undefined, limit: number | null | undefined): boolean {
  return Boolean(limit) && countWords(text) > (limit as number);
}

/** Things Ann could not find in the record and left for Adam: `[add: …]`. */
export function countAddBrackets(text: string | null | undefined): number {
  return (String(text ?? '').match(/\[add:[^\]]*\]/gi) ?? []).length;
}

export function addBracketsLabel(count: number): string {
  if (!count) return '';
  return count === 1 ? '1 thing to add' : `${count} things to add`;
}

/** "10c", "90c", "$1.20". */
export function formatCost(aud: number): string {
  const value = Number.isFinite(aud) && aud > 0 ? aud : 0;
  if (value < 1) return `${Math.max(1, Math.round(value * 100))}c`;
  return `$${value.toFixed(2)}`;
}

/** "About 10c" for a button note. */
export function costLine(aud: number): string {
  return `About ${formatCost(aud)}`;
}

/** "412 records in 11 batches, about 90c. Go?" */
export function historyEstimateSentence(estimate: { sources: number; batches: number; cost_aud: number }): string {
  const sources = Math.max(0, Math.round(estimate.sources || 0));
  if (!sources) return 'Nothing to read in that window.';
  const batches = Math.max(1, Math.round(estimate.batches || 0));
  const records = sources === 1 ? '1 record' : `${sources} records`;
  const batchWord = batches === 1 ? '1 batch' : `${batches} batches`;
  return `${records} in ${batchWord}, about ${formatCost(estimate.cost_aud)}. Go?`;
}

/** The keys `application-schema.mjs` accepts on a criterion. Anything else fails the save. */
const CRITERION_KEYS = [
  'id',
  'criterion',
  'response',
  'order',
  'completed',
  'word_limit',
  'check',
  'response_source',
  'response_drafted_at',
  'response_pending'
] as const;

export type CriterionSave = Partial<SelectionCriterion> & { criterion: string; order: number; completed: boolean };

/** One criterion as the schema takes it: only its own keys, never `notes` or `evidence_refs`. */
export function criterionForSave(criterion: Partial<SelectionCriterion>): CriterionSave {
  const source = criterion as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of CRITERION_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  out.criterion = String(criterion.criterion ?? '').trim();
  out.order = Number.isInteger(criterion.order) ? criterion.order : 0;
  out.completed = Boolean(criterion.completed);
  if (out.response === undefined) out.response = null;
  return out as CriterionSave;
}

function textKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Existing criteria stay as they are; each new line is added after them with
 * its word limit picked up. Lines already on the application are not added twice.
 */
export function mergeSplitCriteria(
  existing: ReadonlyArray<Partial<SelectionCriterion>>,
  lines: string[]
): { criteria: CriterionSave[]; added: number } {
  const kept = [...existing]
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((c) => criterionForSave(c));
  const seen = new Set(kept.map((c) => textKey(c.criterion)));
  let order = kept.reduce((max, c) => Math.max(max, c.order), 0);
  const added: CriterionSave[] = [];
  for (const raw of lines) {
    const text = raw.trim();
    if (!text || seen.has(textKey(text))) continue;
    seen.add(textKey(text));
    order += 1;
    added.push({
      criterion: text,
      response: null,
      order,
      completed: false,
      word_limit: parseWordLimit(text)
    });
  }
  return { criteria: [...kept, ...added], added: added.length };
}
