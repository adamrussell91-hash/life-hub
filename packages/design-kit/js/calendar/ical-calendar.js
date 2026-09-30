/**
 * Adam's iCloud calendars (GET /api/calendar-feeds) → calendar event rows.
 * Read-only: Life Hub never writes back to iCloud.
 *
 *   health → `medical` records: Health lane, Sara's bookings (merges with Life medical logs)
 *   work   → `ical_event` / work: Events chip, a fixed commitment
 *   social, family → `ical_event`, ambient: shown quietly, never counted as load.
 *     "What breakfast was today": a thing that is happening, not a demand.
 */

export const FEED_LABEL = Object.freeze({
  work: 'Work calendar',
  social: 'Social',
  family: 'Family',
  health: 'Health appointments'
});

const AMBIENT = new Set(['social', 'family']);
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<Record<string, unknown>>} [freed] dropped recurring commitments (GET /api/calendar-feeds `freed`)
 */
export function eventsFromCalendarFeeds(rows, freed = []) {
  const out = [];
  // A dropped series stops showing from the day it was dropped, even before Adam
  // deletes it in iCloud. Earlier weeks stay: they happened.
  const droppedFrom = new Map();
  for (const row of freed ?? []) {
    if (row && typeof row.series === 'string' && DATE.test(String(row.from))) droppedFrom.set(row.series, row.from);
  }
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== 'string' || !DATE.test(String(row.date))) continue;
    const from = typeof row.series === 'string' ? droppedFrom.get(row.series) : null;
    if (from && row.date >= from) continue;
    const feed = String(row.feed ?? '');
    if (!FEED_LABEL[feed]) continue;
    const timed = !row.all_day && TIME.test(String(row.time ?? ''));
    out.push({
      path: `ical:${row.id}`,
      record: {
        type: feed === 'health' ? 'medical' : 'ical_event',
        id: row.id,
        feed,
        date: row.date,
        ...(timed ? { time: row.time } : {}),
        ...(timed && TIME.test(String(row.end_time ?? '')) ? { end_time: row.end_time } : {}),
        all_day: !timed,
        title: typeof row.title === 'string' && row.title ? row.title : 'Busy',
        ...(typeof row.location === 'string' && row.location ? { location: row.location } : {}),
        ...(typeof row.notes === 'string' && row.notes ? { notes: row.notes } : {}),
        ...(typeof row.span === 'string' ? { span: row.span } : {}),
        ...(typeof row.series === 'string' ? { series: row.series } : {}),
        ...(AMBIENT.has(feed) ? { ambient: true } : {}),
        source_calendar: FEED_LABEL[feed]
      },
      body: ''
    });
  }
  for (const row of freed ?? []) {
    if (!row || typeof row.id !== 'string' || !DATE.test(String(row.from))) continue;
    out.push({
      path: `freed:${row.id}`,
      record: {
        type: 'freed_span',
        id: row.id,
        series: typeof row.series === 'string' ? row.series : null,
        title: typeof row.title === 'string' ? row.title : 'Freed time',
        weekday: Number(row.weekday),
        start: row.start,
        end: row.end,
        from: row.from,
        reason: typeof row.reason === 'string' ? row.reason : '',
        term_end: typeof row.term_end === 'string' ? row.term_end : null
      },
      body: ''
    });
  }
  return out;
}

/** Window the hub calendars ask for: five weeks back (capacity history) to a year ahead (Almanac). */
export function calendarFeedRange(today) {
  const at = Date.parse(`${today}T00:00:00Z`);
  const key = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { from: key(at - 35 * 86_400_000), to: key(at + 400 * 86_400_000) };
}

const FEED_IDS = Object.freeze(['work', 'social', 'family', 'health']);
const PROBLEM_STATUSES = new Set(['unconfigured', 'error', 'stale']);

/**
 * Fail-visible summary of GET /api/calendar-feeds `data.feeds`.
 * Never treat "HTTP 200 + all unconfigured" as a healthy empty calendar.
 *
 * @param {Array<{ id?: string, status?: string }>|null|undefined} feeds
 * @returns {{ severity: 'ok'|'degraded'|'error', line: string|null, problems: Array<{ id: string, status: string }> }}
 */
export function summarizeIcalFeedStatuses(feeds) {
  const rows = Array.isArray(feeds) ? feeds : [];
  const byId = new Map(rows.map((row) => [String(row?.id ?? ''), String(row?.status ?? '')]));
  const problems = FEED_IDS
    .map((id) => ({ id, status: byId.get(id) || 'unconfigured' }))
    .filter((row) => PROBLEM_STATUSES.has(row.status));
  if (!problems.length) return { severity: 'ok', line: null, problems };

  const idsFor = (status) => problems.filter((p) => p.status === status).map((p) => p.id);
  const unconfigured = idsFor('unconfigured');
  const errored = idsFor('error');
  const stale = idsFor('stale');

  const parts = [];
  if (unconfigured.length === FEED_IDS.length) {
    parts.push(`iCloud calendars not linked in Netlify (${FEED_IDS.join(', ')})`);
  } else if (unconfigured.length) {
    parts.push(`iCloud not linked: ${unconfigured.join(', ')}`);
  }
  if (errored.length) parts.push(`iCloud unreachable: ${errored.join(', ')}`);
  if (stale.length) parts.push(`iCloud stale copy: ${stale.join(', ')}`);

  // `error` = a configured feed failed to fetch. Missing Netlify secrets are `degraded`
  // (Retry cannot create ICAL_FEED_* vars).
  return {
    severity: errored.length ? 'error' : 'degraded',
    line: parts.join(' · '),
    problems
  };
}
