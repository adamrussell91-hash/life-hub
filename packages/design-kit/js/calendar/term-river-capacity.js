/** The river uses the same readiness input and rows as Day and Week. */
import { capacityForDates, dayLoadHours, forecastSeries } from './capacity-model.js';
import { withCheckins } from './readiness-checkins.js';
import { isHoliday } from '../school-time.js';
import { chipFromEvent } from './tideline-model.js';

export function buildRiverCapacity(input, dateKeys) {
  const data = input?.visual?.RIVER ?? {};
  const today = input?.today ?? data.TODAY ?? null;
  const terms = input?.terms?.length ? input.terms : data.TERMS ?? input?.visual?.school_terms ?? [];
  const events = withCheckins(input?.events ?? [], { apiFetch: input?.apiFetch, today });
  const holiday = date => isHoliday(date, terms);
  // Fixtures exist only for the standalone illustration. Even live workload without
  // a sleep log must use readiness, just as Day and Week do.
  if (events.length || !Object.keys(data.LOGGED ?? {}).length) {
    return capacityForDates(events, dateKeys, { today, isHoliday: holiday });
  }
  const logged = data.LOGGED;
  const lastDate = Object.keys(logged).sort().at(-1);
  const pattern = date => (data.PATTERN ?? []).filter(p => date >= p.from && date <= p.to).reduce((sum, p) => sum + p.delta, 0);
  const out = new Map();
  for (const date of dateKeys) {
    if (logged[date] != null) out.set(date, { pct: logged[date], forecast: false });
  }
  for (const row of forecastSeries(dateKeys.filter(date => date > lastDate), {
    lastPct: logged[lastDate], lastDate, isHoliday: holiday, pattern
  })) out.set(row.date, { ...row, forecast: true });
  return out;
}

/** Stable data stamp; mutations with unchanged ids/count still require a repaint. */
export function riverInputFingerprint(input) {
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().filter(key => typeof value[key] !== 'function').map(key => [key, canonical(value[key])]));
    }
    return value;
  };
  return JSON.stringify(canonical({
    today: input?.today,
    events: input?.events ?? [],
    terms: input?.terms ?? [],
    ghosts: input?.ghosts ?? [],
    river: input?.visual?.RIVER ?? {},
    schoolTerms: input?.visual?.school_terms ?? []
  }));
}

/** Live booked hours use the same event conversion and load exclusions as Day/Week.
 * Illustration commitments are a fallback only when no hub events have arrived.
 */
export function buildRiverCommitments(input) {
  const events = input?.events ?? [];
  const valid = item => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date ?? '')
    && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start
    && !item.ambient && dayLoadHours([item]) > 0;
  if (!events.length) return (input?.visual?.RIVER?.COMMITMENTS ?? []).filter(valid);
  const clock = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');
  const taskStatus = new Map(events.filter(event => event?.record?.type === 'task')
    .map(event => [event.record.id, event.record.status]));
  return events.map(event => {
    const record = event?.record;
    if (!record || !clock(record.time) || (record.end_time && !clock(record.end_time))) return null;
    if (record.duration_min != null && (!Number.isFinite(Number(record.duration_min)) || Number(record.duration_min) <= 0)) return null;
    if (record.type === 'work_block' && taskStatus.get(record.task_id) === 'done') return null;
    const chip = chipFromEvent(event);
    return chip ? { ...chip, ghost: Boolean(record.ghost || record.status === 'proposed') } : null;
  }).filter(valid);
}
