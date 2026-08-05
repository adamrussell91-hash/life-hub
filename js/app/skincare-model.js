import { addCalendarDays, enumerateDateKeys } from '../core/time.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function isRoutineLog(entry, routine) {
  return entry.record?.type === 'skincare'
    && entry.record.routine === routine
    && !String(entry.body ?? '').startsWith('Procedure:');
}

function streakFor(entries, date, routine) {
  let streak = 0;
  let cursor = date;
  while (entries.some(entry => entry.record.date === cursor && isRoutineLog(entry, routine))) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}

function dayState(entries, day) {
  const am = entries.some(entry => entry.record.date === day && isRoutineLog(entry, 'am'));
  const pm = entries.some(entry => entry.record.date === day && isRoutineLog(entry, 'pm'));
  if (am && pm) return 'both';
  if (am) return 'am';
  if (pm) return 'pm';
  return 'miss';
}

export function buildSkincareModel({ events, date, routines, nowHourKey }) {
  if (!date) throw new RangeError('Skincare display date is unavailable');
  const skincareEntries = (events ?? [])
    .map(event => ({ record: event.record, path: event.path, body: event.body }))
    .filter(entry => entry.record?.type === 'skincare');
  const records = skincareEntries.filter(entry => entry.record.date === date);

  const am = records.find(entry => entry.record.routine === 'am' && !String(entry.body ?? '').startsWith('Procedure:'));
  const pm = records.find(entry => entry.record.routine === 'pm' && !String(entry.body ?? '').startsWith('Procedure:'));
  const procedures = records.filter(entry => String(entry.body ?? '').startsWith('Procedure:'));

  const weekDates = enumerateDateKeys(addCalendarDays(date, -(WEEK_DAYS - 1)), date);
  const monthDates = enumerateDateKeys(addCalendarDays(date, -(MONTH_DAYS - 1)), date);

  return {
    date,
    currentRoutine: nowHourKey === 'am' || nowHourKey === 'pm' ? nowHourKey : 'pm',
    routines,
    amLogged: Boolean(am),
    pmLogged: Boolean(pm),
    amRecord: am?.record ?? null,
    pmRecord: pm?.record ?? null,
    procedures: procedures.map(entry => ({
      path: entry.path,
      notes: entry.body,
      products: entry.record.products ?? []
    })),
    weekDots: weekDates.map(day => ({
      date: day,
      logged: skincareEntries.some(entry => entry.record.date === day),
      isToday: day === date
    })),
    amStreak: streakFor(skincareEntries, date, 'am'),
    pmStreak: streakFor(skincareEntries, date, 'pm'),
    monthHeatmap: monthDates.map(day => ({
      date: day,
      state: dayState(skincareEntries, day),
      isToday: day === date
    }))
  };
}
