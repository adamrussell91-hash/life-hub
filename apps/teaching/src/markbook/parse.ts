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

/** Codes or ids, separated by commas or spaces. Unknown codes come back so the form can name them. */
export function parseOutcomeCodes(text: string, labels: OutcomeLabel[]): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const token of text.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
    const found = labels.find((l) => l.code.toLowerCase() === token.toLowerCase() || l.id === token);
    if (found) {
      if (!ids.includes(found.id)) ids.push(found.id);
    } else unknown.push(token.toUpperCase());
  }
  return { ids, unknown };
}

export const formatOutcomeCodes = (ids: string[], labels: OutcomeLabel[]): string =>
  ids.map((id) => labels.find((l) => l.id === id)?.code ?? id).join(', ');

export function outcomeLabels(rows: ReadonlyArray<{ id: string; code: string; title: string; group: string; status?: string }>): OutcomeLabel[] {
  return rows.filter((r) => r.status !== 'trashed').map(({ id, code, title, group }) => ({ id, code, title, group }));
}
