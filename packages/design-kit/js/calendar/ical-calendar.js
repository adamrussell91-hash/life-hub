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

/** @param {Array<Record<string, unknown>>} rows */
export function eventsFromCalendarFeeds(rows) {
  const out = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== 'string' || !DATE.test(String(row.date))) continue;
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
        ...(AMBIENT.has(feed) ? { ambient: true } : {}),
        source_calendar: FEED_LABEL[feed]
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
