/** Turns the one "What this role asks for" box into criteria lines. */

export const MAX_CRITERIA = 20;
/** A line this long is a paragraph from an ad, not a criterion. */
const PROSE_LINE_LENGTH = 400;

export type CriterionSource = 'ad' | 'ann' | 'adam';
export type CriterionLine = { text: string; source?: string };
export type SavedCriterion = { id?: string; text: string; order: number; source: CriterionSource };

const LEADING_MARK = /^(?:[-*•·▪◦‣–—]+|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/i;

function asSource(value: string | undefined): CriterionSource {
  return value === 'ad' || value === 'ann' ? value : 'adam';
}

function key(text: string): string {
  return text.trim().toLowerCase();
}

/** One criterion per line: bullets and numbering go, repeats and blanks drop. */
export function splitCriteriaLines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(LEADING_MARK, '').trim();
    if (!line || seen.has(key(line))) continue;
    seen.add(key(line));
    lines.push(line);
  }
  return lines;
}

/** Too long or too wordy to save line for line, so Ann picks out the criteria. */
export function readsAsAd(text: string): boolean {
  const lines = splitCriteriaLines(text);
  return lines.length > MAX_CRITERIA || lines.some((line) => line.length > PROSE_LINE_LENGTH);
}

/**
 * Keeps each criterion's id so the skill cards linked to it stay linked: an
 * unchanged line matches on its text, a reworded one on its position.
 */
export function reconcileCriteria(
  lines: CriterionLine[],
  existing: ReadonlyArray<{ id: string; text: string; source: string; order?: number }>
): SavedCriterion[] {
  const old = [...existing].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const taken = new Set<number>();
  const matches = lines.map((line) => {
    const at = old.findIndex((c, i) => !taken.has(i) && key(c.text) === key(line.text));
    if (at >= 0) taken.add(at);
    return at;
  });
  return lines.slice(0, MAX_CRITERIA).map((line, index) => {
    let at = matches[index]!;
    if (at < 0 && old[index] && !taken.has(index)) {
      at = index;
      taken.add(index);
    }
    const match = at >= 0 ? old[at] : undefined;
    return {
      ...(match ? { id: match.id } : {}),
      text: line.text.trim(),
      order: index,
      source: asSource(line.source ?? match?.source)
    };
  });
}
