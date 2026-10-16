import catalog from '../../../apps/tasks/fixtures/competitions.json' with { type: 'json' };

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
];

const catalogueDates = new Map(
  catalog
    .filter(item => item && (item.starts_on || item.due_on || item.entries_close_on))
    .map(item => [item.id, Object.fromEntries(DATE_KEYS.map(key => [key, item[key] ?? null]))])
);

/**
 * Stored programs were seeded before the catalogue had dates. A stored record that has never had
 * dates set (no date keys at all) takes them from the catalogue fixture; once dates are saved on the
 * record, even as blank, the record wins. Same rule as `withCatalogueDates` in the Tasks app.
 */
export function withCatalogueDates(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  if ('starts_on' in record || 'ends_on' in record) return record;
  const dates = typeof record.id === 'string' ? catalogueDates.get(record.id) : undefined;
  return dates ? { ...record, ...dates } : record;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRECISIONS = new Set(['day', 'part', 'month']);

/** A precision word from a request body, or `day` when a date was typed in by hand. */
export function pickPrecision(value, hasDate) {
  if (!hasDate) return null;
  return typeof value === 'string' && PRECISIONS.has(value) ? value : 'day';
}

/** Date fields from a request body: ISO dates or null; source URL as a string or null. */
export function pickProgramDates(body) {
  const date = value => (typeof value === 'string' && ISO_DATE.test(value) ? value : null);
  return {
    starts_on: date(body.starts_on),
    ends_on: date(body.ends_on),
    due_on: date(body.due_on),
    entries_close_on: date(body.entries_close_on),
    dates_source_url: typeof body.dates_source_url === 'string' && body.dates_source_url.trim() ? body.dates_source_url.trim() : null,
    dates_checked_on: date(body.dates_checked_on)
  };
}

const CLASS_KEYS = ['format', 'provider', 'settings', 'entry', 'entry_route', 'subjects'];

const catalogueClasses = new Map(
  catalog
    .filter(item => item && item.format)
    .map(item => [item.id, Object.fromEntries(CLASS_KEYS.map(key => [key, item[key] ?? null]))])
);

/**
 * Stored programs were seeded before the catalogue was classified. A stored record with no `format`
 * key takes the catalogue's classification, and its subjects with it; once `format` is saved on the
 * record, even as null, the record wins. Same rule as `withCatalogueClasses` in the Tasks app.
 */
export function withCatalogueClasses(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  if ('format' in record) return record;
  const classes = typeof record.id === 'string' ? catalogueClasses.get(record.id) : undefined;
  if (!classes) return record;
  const next = { ...record, ...classes };
  if (!Array.isArray(next.settings)) next.settings = [];
  if (!Array.isArray(next.subjects)) next.subjects = record.subjects;
  return next;
}

const PICKS = {
  format: ['Exam', 'Written entry', 'Speaking', 'Simulation', 'Project', 'Creative work', 'Day event', 'Program'],
  provider: ['School', 'External'],
  entry: ['Individual', 'Team', 'Either'],
  entry_route: ['School enters', 'Student applies', 'Selection']
};
const SETTINGS = ['At school', 'Online', 'Away'];

/** Classification fields from a request body: known values or null, settings as a known-value list. */
export function pickProgramClasses(body) {
  const picked = {};
  for (const [key, values] of Object.entries(PICKS)) {
    picked[key] = typeof body[key] === 'string' && values.includes(body[key]) ? body[key] : null;
  }
  picked.settings = Array.isArray(body.settings)
    ? [...new Set(body.settings.filter(value => SETTINGS.includes(value)))]
    : [];
  return picked;
}
