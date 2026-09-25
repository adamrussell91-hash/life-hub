/**
 * Deterministic calendar ghost proposals. No LLM.
 *
 * Pure: capacity, events, openings and past decisions in; validateGhost-passing
 * ghosts out. The scheduled job and chat tool both call this (or append a single
 * agent-authored ghost with the same id rules).
 *
 * Reference: docs/superpowers/specs/2026-09-24-calendar-design.md ("Where ghosts come from").
 */
import { validateGhost } from './ghost-writes.js';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;
const THROTTLE_DAYS = 30;
const THROTTLE_COUNT = 3;
const THROTTLE_GAP_DAYS = 7;
const GOOD_NIGHT_HORIZON = 14;
const DEFAULT_SLEEP = '22:00';
const LIGHTS_OUT_CAP = '22:00';

function toMs(key) {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

function addDays(key, days) {
  return new Date(toMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minToHhmm(min) {
  const t = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Lights out: profile sleep minus 30 minutes, never after 22:00. */
export function bedtimeFromSleep(sleepHhmm) {
  const sleep = HHMM.test(sleepHhmm) ? sleepHhmm : DEFAULT_SLEEP;
  const raw = hhmmToMin(sleep) - 30;
  const capped = Math.min(raw, hhmmToMin(LIGHTS_OUT_CAP));
  return minToHhmm(capped);
}

export function ghostId(agent, kind, date) {
  return `${agent}-${kind}-${date}`;
}

function statusOf(entry) {
  return typeof entry?.status === 'string' && entry.status ? entry.status : 'pending';
}

/** Ids already pending, accepted or dismissed — never re-propose. */
function knownIds(pending) {
  const ids = new Set();
  for (const entry of pending ?? []) {
    if (!entry || typeof entry.id !== 'string') continue;
    if (['pending', 'accepted', 'dismissed'].includes(statusOf(entry))) ids.add(entry.id);
  }
  return ids;
}

function wallsOn(events) {
  const dates = new Set();
  for (const event of events ?? []) {
    const rec = event?.record ?? event;
    if (rec?.type === 'calendar_block' && rec.kind === 'wall' && DATE_KEY.test(rec.date ?? '')) {
      dates.add(rec.date);
    }
  }
  return dates;
}

function restBlockOn(events, date) {
  return (events ?? []).some(event => {
    const rec = event?.record ?? event;
    return rec?.type === 'calendar_block' && rec.kind === 'rest' && rec.date === date;
  });
}

function coreyCoversEvening(events, date) {
  return (events ?? []).some(event => {
    const rec = event?.record ?? event;
    if (rec?.type !== 'calendar_block' || rec.kind !== 'corey' || rec.date !== date) return false;
    const start = typeof rec.time === 'string' ? rec.time : '';
    const end = typeof rec.end_time === 'string' ? rec.end_time : '';
    if (!HHMM.test(start) || !HHMM.test(end)) return false;
    // Same evening window as a good night (18:00–22:00).
    return start < '22:00' && end > '18:00';
  });
}

function bedtimePending(pending, date) {
  return (pending ?? []).some(entry =>
    entry?.kind === 'bedtime' && entry.date === date && statusOf(entry) === 'pending');
}

/**
 * Planned workout after 15:00 on `date`. Prefer record.status planned/missing;
 * skipped/completed are not proposed.
 */
function eveningWorkout(events, date) {
  const candidates = [];
  for (const event of events ?? []) {
    const rec = event?.record ?? event;
    if (rec?.type !== 'workout' || rec.date !== date) continue;
    if (rec.status === 'skipped' || rec.status === 'completed') continue;
    const time = typeof rec.time === 'string' ? rec.time : '';
    if (!HHMM.test(time) || time <= '15:00') continue;
    candidates.push({
      path: typeof event.path === 'string' ? event.path : (typeof rec.path === 'string' ? rec.path : null),
      chipId: typeof rec.chipId === 'string' ? rec.chipId
        : (typeof rec.id === 'string' ? rec.id : (typeof event.id === 'string' ? event.id : null)),
      time
    });
  }
  candidates.sort((a, b) => a.time.localeCompare(b.time));
  return candidates[0] ?? null;
}

function sleepHoursOn(events, date) {
  for (const event of events ?? []) {
    const rec = event?.record ?? event;
    if (rec?.type === 'sleep' && rec.date === date && Number.isFinite(rec.duration_h)) {
      return rec.duration_h;
    }
  }
  return null;
}

function capacityOf(capacity, date) {
  if (!capacity) return null;
  if (capacity instanceof Map) return capacity.get(date) ?? null;
  if (typeof capacity.get === 'function') return capacity.get(date) ?? null;
  return capacity[date] ?? null;
}

function skipReason(cap) {
  const pct = Number.isFinite(cap?.pct) ? Math.round(cap.pct) : null;
  const symptom = cap?.factors?.find(f => f.id === 'symptoms')?.symptoms?.[0];
  const detail = symptom || (typeof cap?.note === 'string' && cap.note !== 'steady' ? cap.note : null);
  if (pct == null) return detail || 'low capacity';
  return detail ? `capacity ${pct}%, ${detail}` : `capacity ${pct}%`;
}

/**
 * Learn from no: same agent+kind dismissed 3+ times in the last 30 days →
 * at most one proposal of that kind per week (7 days since the latest dismiss).
 */
export function isThrottled(decisions, agent, kind, today) {
  const since = addDays(today, -THROTTLE_DAYS);
  const dismissals = (decisions ?? [])
    .filter(row => row
      && row.agent === agent
      && row.kind === kind
      && row.outcome === 'dismissed'
      && typeof row.at === 'string'
      && row.at.slice(0, 10) >= since)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (dismissals.length < THROTTLE_COUNT) return false;
  const latest = dismissals[0].at.slice(0, 10);
  return latest > addDays(today, -THROTTLE_GAP_DAYS);
}

function parseDecisions(decisions) {
  if (!Array.isArray(decisions)) return [];
  return decisions.filter(row => row && typeof row === 'object');
}

/**
 * @param {object} input
 * @param {string} input.today YYYY-MM-DD
 * @param {string[]} [input.days] date keys to consider (defaults to today..+13)
 * @param {Map|object} input.capacity from capacityForDates
 * @param {Array} input.events Life events ({ path, record }) and/or visual items
 * @param {Array} [input.openings] from findOpenings (wantId good-night)
 * @param {Array} [input.pending] pending-calendar-ghosts queue (any status)
 * @param {Array} [input.decisions] parsed calendar-ghost-decisions.jsonl rows
 * @param {object} [input.profile] planning profile with day_profile.sleep
 * @returns {object[]} ghosts that pass validateGhost
 */
export function proposeGhosts({
  today,
  days = null,
  capacity,
  events = [],
  openings = [],
  pending = [],
  decisions = [],
  profile = null
} = {}) {
  if (!DATE_KEY.test(today ?? '')) throw new TypeError('proposeGhosts needs today (YYYY-MM-DD)');
  const dateKeys = Array.isArray(days) && days.length
    ? days.filter(d => DATE_KEY.test(d))
    : Array.from({ length: GOOD_NIGHT_HORIZON }, (_, i) => addDays(today, i));
  const known = knownIds(pending);
  const walls = wallsOn(events);
  const decisionRows = parseDecisions(decisions);
  const sleepHhmm = profile?.day_profile?.sleep ?? profile?.sleep ?? DEFAULT_SLEEP;
  const lightsOut = bedtimeFromSleep(sleepHhmm);
  const out = [];

  const take = ghost => {
    if (known.has(ghost.id) || out.some(g => g.id === ghost.id)) return;
    if (walls.has(ghost.date)) return;
    if (ghost.kind === 'bedtime' && ghost.time > LIGHTS_OUT_CAP) return;
    if (ghost.kind === 'protect_block' && (ghost.start >= LIGHTS_OUT_CAP || ghost.end > LIGHTS_OUT_CAP)) return;
    if (isThrottled(decisionRows, ghost.agent, ghost.kind, today)) return;
    validateGhost(ghost);
    out.push(ghost);
    known.add(ghost.id);
  };

  for (const date of dateKeys) {
    if (walls.has(date)) continue;
    const cap = capacityOf(capacity, date);
    if (!cap || cap.soften !== true || cap.forecast === true) continue;

    const workout = eveningWorkout(events, date);
    if (workout?.path && workout.chipId) {
      take({
        id: ghostId('sara', 'skip_workout', date),
        agent: 'sara',
        kind: 'skip_workout',
        date,
        reason: skipReason(cap),
        workoutPath: workout.path,
        overItem: workout.chipId,
        label: 'Skip workout',
        meta: `Sara · you’re at ${Math.round(cap.pct)}%`,
        chip: { date, start: workout.time, end: workout.time, kind: 'fitness' }
      });
    }

    // Bedtime: today or tomorrow only.
    if (date === today || date === addDays(today, 1)) {
      if (!bedtimePending(pending, date) && !restBlockOn(events, date)) {
        const slept = sleepHoursOn(events, date);
        const reason = slept != null ? `${slept} h last night` : null;
        take({
          id: ghostId('sara', 'bedtime', date),
          agent: 'sara',
          kind: 'bedtime',
          date,
          time: lightsOut,
          ...(reason ? { reason } : {}),
          label: `Lights out ${lightsOut}`,
          meta: 'Sara',
          chip: {
            date,
            start: minToHhmm(hhmmToMin(lightsOut) - 30),
            end: lightsOut,
            kind: 'health'
          }
        });
      }
    }
  }

  const goodNight = (openings ?? []).find(o => o.wantId === 'good-night' && Array.isArray(o.dates) && o.dates.length);
  if (goodNight) {
    const date = goodNight.dates[0];
    const horizonEnd = addDays(today, GOOD_NIGHT_HORIZON - 1);
    if (DATE_KEY.test(date) && date >= today && date <= horizonEnd
      && !walls.has(date) && !coreyCoversEvening(events, date)) {
      take({
        id: ghostId('hammond', 'protect_block', date),
        agent: 'hammond',
        kind: 'protect_block',
        date,
        start: '18:00',
        end: '22:00',
        title: 'Good night: dinner out + a show',
        with: 'corey',
        label: 'Good night: dinner out + a show',
        meta: 'Hammond · your definition of a good night',
        chip: { date, start: '18:00', end: '22:00', kind: 'corey' }
      });
    }
  }

  return out;
}
