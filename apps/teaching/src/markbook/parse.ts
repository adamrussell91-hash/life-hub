import type { Band } from './schema';
import type { OutcomeLabel } from './types';

/** Short text fields the teacher types instead of using pickers: bands and outcome codes. */

export function parseBands(text: string): { bands: Band[] } | { problem: string } {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  const bands: Band[] = [];
  for (const part of parts) {
    const match = /^(.+?)\s+(\d+(?:\.\d+)?)$/.exec(part);
    if (!match) return { problem: 'Write each band as a name then its lowest mark, like A 13.' };
    bands.push({ label: match[1]!.trim(), min: Number(match[2]) });
  }
  return { bands };
}

export const formatBands = (bands: Band[] | undefined): string => (bands ?? []).map((b) => `${b.label} ${b.min}`).join(', ');

/** The catalogue outcome a code or id names: a code match first, ignoring case, then an id match. */
export const findOutcome = (token: string, labels: readonly OutcomeLabel[]): OutcomeLabel | undefined =>
  labels.find((l) => l.code.toLowerCase() === token.toLowerCase()) ?? labels.find((l) => l.id === token);

/** A code or id as its catalogue id, or the token itself when the catalogue doesn't know it. */
export const outcomeIdOf = (token: string, labels: readonly OutcomeLabel[]): string => findOutcome(token, labels)?.id ?? token;

/** Codes or ids, separated by commas or spaces. Unknown codes come back so the form can name them. */
export function parseOutcomeCodes(text: string, labels: OutcomeLabel[]): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const token of text.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    const found = findOutcome(token, labels);
    if (found) {
      if (!ids.includes(found.id)) ids.push(found.id);
    } else if (!unknown.includes(token.toUpperCase())) unknown.push(token.toUpperCase());
  }
  return { ids, unknown };
}

export const formatOutcomeCodes = (ids: string[], labels: OutcomeLabel[]): string =>
  ids.map((id) => labels.find((l) => l.id === id)?.code ?? id).join(', ');

/** A placeholder built from the class's own catalogue, so the example codes are ones that work. */
export const outcomeCodeExample = (labels: OutcomeLabel[]): string =>
  labels.slice(0, 2).map((l) => l.code).join(', ') || 'Outcome codes, comma separated';

export function outcomeLabels(rows: ReadonlyArray<{ id: string; code: string; title: string; group: string; status?: string }>): OutcomeLabel[] {
  return rows.filter((r) => r.status !== 'trashed').map(({ id, code, title, group }) => ({ id, code, title, group }));
}
