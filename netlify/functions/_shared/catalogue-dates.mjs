import catalog from '../../../apps/tasks/fixtures/competitions.json' with { type: 'json' };

const DATE_KEYS = ['starts_on', 'ends_on', 'dates_source_url', 'dates_checked_on'];

const catalogueDates = new Map(
  catalog
    .filter(item => item && (item.starts_on || item.ends_on))
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

/** Date fields from a request body: ISO dates or null; source URL as a string or null. */
export function pickProgramDates(body) {
  const date = value => (typeof value === 'string' && ISO_DATE.test(value) ? value : null);
  return {
    starts_on: date(body.starts_on),
    ends_on: date(body.ends_on),
    dates_source_url: typeof body.dates_source_url === 'string' && body.dates_source_url.trim() ? body.dates_source_url.trim() : null,
    dates_checked_on: date(body.dates_checked_on)
  };
}
