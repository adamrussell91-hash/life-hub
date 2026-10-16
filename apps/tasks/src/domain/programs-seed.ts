import { ProgramSchema, type Program } from '@/schemas/program';
import catalog from '../../fixtures/competitions.json';

/** Git source of truth for the Programs catalogue. Never Notion. */
export function catalogPrograms(): Program[] {
  return (catalog as Program[]).map((item) => ProgramSchema.parse(item));
}

const DATE_KEYS = [
  'starts_on',
  'ends_on',
  'dates_precision',
  'due_on',
  'due_precision',
  'entries_close_on',
  'entries_close_precision',
  'dates_source_url',
  'dates_checked_on'
] as const;
const catalogueDates = new Map(
  (catalog as Array<Partial<Program> & { id: string }>)
    .filter((item) => item.starts_on || item.due_on || item.entries_close_on)
    .map((item) => [item.id, Object.fromEntries(DATE_KEYS.map((key) => [key, item[key] ?? null]))])
);

/**
 * Stored programs were seeded before the catalogue had dates. A stored record that has never had
 * dates set (no date keys at all) takes them from the catalogue; once dates are saved on the record,
 * even as blank, the record wins. Same rule as the Netlify programs function.
 */
export function withCatalogueDates<T>(raw: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if ('starts_on' in record || 'ends_on' in record) return raw;
  const dates = typeof record.id === 'string' ? catalogueDates.get(record.id) : undefined;
  return dates ? ({ ...record, ...dates } as T) : raw;
}

const CLASS_KEYS = ['format', 'provider', 'settings', 'entry', 'entry_route', 'subjects'] as const;
const catalogueClasses = new Map(
  (catalog as Array<Partial<Program> & { id: string }>)
    .filter((item) => item.format)
    .map((item) => [item.id, Object.fromEntries(CLASS_KEYS.map((key) => [key, item[key] ?? null]))])
);

/**
 * Stored programs were seeded before the catalogue was classified. A stored record with no
 * `format` key takes the catalogue's classification, and its subjects with it (the recatalogue
 * moves subjects between lines); once `format` is saved on the record, even as null, the record
 * wins. Same rule as the Netlify programs function.
 */
export function withCatalogueClasses<T>(raw: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if ('format' in record) return raw;
  const classes = typeof record.id === 'string' ? catalogueClasses.get(record.id) : undefined;
  if (!classes) return raw;
  const next = { ...record, ...classes };
  if (!Array.isArray(next.settings)) next.settings = [];
  if (!Array.isArray(next.subjects)) next.subjects = record.subjects;
  return next as T;
}
