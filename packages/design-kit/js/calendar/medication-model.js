/**
 * Dexamphetamine timing for the calendar. Pure: medication logs in, day status out.
 *
 * Honesty rules (Day Sense brief §3.3):
 * - A missing log is unknown, never "skipped". Only a logged skip is a skip.
 * - "Usual" times come from Adam's own logs (at least two in the last four weeks), never a guess.
 * - The effect window is a visual guide ("about 4 h"), not pharmacology; no dose advice.
 */

export const MEDICATION = Object.freeze({
  name: 'Dexamphetamine',
  short: 'Dexy',
  effectHours: 4, // drawn window after a dose; a guide, labelled "about"
  onsetHours: 0.5,
  promptAfterHours: 0.5, // one prompt this long after the usual time with no log
  promptUntilHours: 4, // …and not after this (the moment has passed)
  lateAfterHours: 1, // taken this much after usual counts as late for the evening plan
  missingAfterHours: 1.5, // no log this long after usual: "not logged" (unknown)
  historyDays: 28,
  minSamples: 2,
  dinnerAt: 18.25, // 6:15 pm
  snackAt: 20.5 // 8:30 pm
});

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const toHours = (hhmm) => {
  const m = TIME.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};
export const toHHMM = (hours) => {
  const total = Math.round(hours * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
export const clock = (hours) => {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'pm' : 'am'}`;
};

const DAY_MS = 86_400_000;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Dose logs from calendar events (records of type `medication`). */
export function medicationLogs(events) {
  return (events ?? [])
    .map((event) => (event?.record && typeof event.record === 'object' ? event.record : event))
    .filter((record) => record?.type === 'medication' && typeof record.date === 'string');
}

export function slotOf(record) {
  if (record.slot === 'am' || record.slot === 'pm') return record.slot;
  const hours = toHours(record.time);
  return hours != null && hours >= 12 ? 'pm' : 'am';
}

/** Median taken time per slot over the last four weeks, from at least two logs. */
export function usualDoseTimes(logs, today) {
  const since = addDays(today, -MEDICATION.historyDays);
  const out = {};
  for (const slot of ['am', 'pm']) {
    const hours = logs
      .filter((log) => log.status === 'taken' && log.date >= since && log.date <= today && slotOf(log) === slot)
      .map((log) => toHours(log.time))
      .filter((value) => value != null)
      .sort((a, b) => a - b);
    if (hours.length < MEDICATION.minSamples) continue;
    const mid = Math.floor(hours.length / 2);
    const median = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
    out[slot] = Math.round(median * 12) / 12; // nearest 5 minutes
  }
  return out;
}

/**
 * One day's doses.
 * @returns {{
 *   doses: Array<{ slot: 'am'|'pm', status: 'taken'|'skipped'|'upcoming'|'due'|'unknown', time?: number, usual?: number, late?: boolean, window?: [number, number] }>,
 *   prompt: { slot: 'am'|'pm', usual: number } | null,
 *   evening: null | { reason: 'skipped'|'late'|'unknown', rows: Array<{ at: number, title: string }> },
 *   summary: string
 * }}
 */
export function medicationDay({ date, today, nowHour, logs, usual }) {
  const mine = logs.filter((log) => log.date === date);
  const isToday = date === today;
  const isPast = date < today;
  const doses = [];
  let prompt = null;
  for (const slot of ['am', 'pm']) {
    const forSlot = mine.filter((log) => slotOf(log) === slot);
    const taken = forSlot.filter((log) => log.status === 'taken' && toHours(log.time) != null)
      .sort((a, b) => toHours(a.time) - toHours(b.time))[0];
    const skipped = forSlot.find((log) => log.status === 'skipped');
    const expected = usual?.[slot];
    if (taken) {
      const time = toHours(taken.time);
      doses.push({
        slot,
        status: 'taken',
        time,
        ...(expected != null ? { usual: expected, late: time - expected > MEDICATION.lateAfterHours } : {}),
        window: [time + MEDICATION.onsetHours, time + MEDICATION.effectHours]
      });
      continue;
    }
    if (skipped) {
      doses.push({ slot, status: 'skipped', ...(expected != null ? { usual: expected } : {}) });
      continue;
    }
    if (expected == null) continue; // no pattern yet for this slot: say nothing
    if (isPast || (isToday && nowHour >= expected + MEDICATION.missingAfterHours)) {
      doses.push({ slot, status: 'unknown', usual: expected });
    } else if (isToday && nowHour >= expected) {
      doses.push({ slot, status: 'due', usual: expected });
    } else {
      doses.push({ slot, status: 'upcoming', usual: expected });
    }
    if (isToday && nowHour >= expected + MEDICATION.promptAfterHours && nowHour < expected + MEDICATION.promptUntilHours) {
      prompt ??= { slot, usual: expected };
    }
  }

  // Evening plan: a skipped, late or unlogged afternoon dose. Support, not scoring.
  const pm = doses.find((dose) => dose.slot === 'pm');
  let evening = null;
  const reason = pm?.status === 'skipped' ? 'skipped' : pm?.late ? 'late' : pm?.status === 'unknown' ? 'unknown' : null;
  if (reason && (isToday || isPast)) {
    const from = isToday ? Math.max(nowHour, 0) : 0;
    const rows = [];
    if (MEDICATION.dinnerAt >= from) rows.push({ at: MEDICATION.dinnerAt, title: 'Dinner, planned' });
    if (MEDICATION.snackAt >= from) rows.push({ at: MEDICATION.snackAt, title: 'Evening snack, planned' });
    if (rows.length) evening = { reason, rows };
  }

  return { doses, prompt, evening, summary: summaryLine(doses) };
}

function summaryLine(doses) {
  if (!doses.length) return '';
  return doses.map((dose) => {
    const label = dose.slot === 'am' ? 'AM' : 'PM';
    if (dose.status === 'taken') return `${label} ${clock(dose.time)}${dose.late ? ' (late)' : ''}`;
    if (dose.status === 'skipped') return `${label} skipped`;
    if (dose.status === 'unknown') return `${label} not logged`;
    if (dose.status === 'due') return `${label} due ${clock(dose.usual)}`;
    return `${label} ~${clock(dose.usual)}`;
  }).join(' · ');
}

/** Candidate for POST /api/chat/confirm (same path as every Life log). */
export function doseCandidate({ date, status, time, slot }) {
  return {
    type: 'medication',
    date,
    ...(status === 'taken' ? { time } : {}),
    notes: '',
    fields: {
      medication: MEDICATION.name,
      status,
      slot
    }
  };
}

/**
 * Almanac context (Day Sense §3.1 Term/Almanac): adherence over the last `days`, and the
 * forecast days that follow a skipped dose. Honest overlay only: those days are drawn with
 * a lighter band; the forecast number never changes. A day with no log is "not logged",
 * never counted as missed.
 * @param {object[]} logs medication records
 * @returns {{ summary: string, taken: number, skipped: number, unlogged: number, days: number, lighter: string[] }}
 */
export function medicationContext(logs, { today, from, to, days = 14 }) {
  const DAY = 86_400_000;
  const key = (ms) => new Date(ms).toISOString().slice(0, 10);
  const at = Date.parse(`${today}T00:00:00Z`);
  const window = Array.from({ length: days }, (_, i) => key(at - (days - 1 - i) * DAY));
  const byDate = new Map();
  for (const log of logs ?? []) {
    if (log?.type !== 'medication' && log?.record?.type !== 'medication') continue;
    const row = log.record ?? log;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  let taken = 0;
  let skipped = 0;
  let unlogged = 0;
  const skippedDates = [];
  for (const date of window) {
    const rows = byDate.get(date) ?? [];
    if (rows.some((row) => row.status === 'skipped')) {
      skipped += 1;
      skippedDates.push(date);
    } else if (rows.some((row) => row.status === 'taken')) taken += 1;
    else unlogged += 1;
  }
  // The day after a skipped dose (and a skip today's own evening) carries the lighter band.
  const lighter = [...new Set(skippedDates.flatMap((date) => [date, key(Date.parse(`${date}T00:00:00Z`) + DAY)]))]
    .filter((date) => (!from || date >= from) && (!to || date <= to))
    .sort();
  const parts = [`taken ${taken} of the last ${days} days`];
  if (skipped) parts.push(`${skipped} skipped`);
  if (unlogged) parts.push(`${unlogged} not logged`);
  return { summary: `Dexy: ${parts.join(' · ')}`, taken, skipped, unlogged, days, lighter };
}
