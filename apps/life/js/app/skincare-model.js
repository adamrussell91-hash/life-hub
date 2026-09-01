import { addCalendarDays, enumerateDateKeys } from '../core/time.js';
import { resolveRoutineProducts } from './skincare-routine-membership.js';
import { defaultCategoryForProductName } from './skincare-product-library.js';

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function isRoutineLog(entry, routine) {
  return entry.record?.type === 'skincare'
    && entry.record.routine === routine
    && !String(entry.body ?? '').startsWith('Procedure:');
}

function streakFor(entries, date, routine) {
  const loggedDates = new Set(
    entries
      .filter(entry => isRoutineLog(entry, routine) && entry.record.date <= date)
      .map(entry => entry.record.date)
  );
  const mostRecentDate = [...loggedDates].sort().at(-1);
  if (!mostRecentDate) return 0;

  let streak = 0;
  for (let cursor = mostRecentDate; loggedDates.has(cursor); cursor = addCalendarDays(cursor, -1)) {
    streak += 1;
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

function resolveRoutineShelf(routineKey, baseRoutine, library, membership) {
  if (!baseRoutine) return baseRoutine;
  if (library && membership) {
    const resolved = resolveRoutineProducts(routineKey, membership, library);
    return {
      ...baseRoutine,
      products: resolved.map(entry => entry.name),
      productEntries: resolved.map(entry => ({
        id: entry.id,
        name: entry.name,
        category: entry.category || '',
        hint: entry.hint || ''
      }))
    };
  }
  const products = baseRoutine.products ?? [];
  return {
    ...baseRoutine,
    products,
    productEntries: products.map(name => ({
      id: null,
      name,
      category: defaultCategoryForProductName(name),
      hint: ''
    }))
  };
}

export function buildSkincareModel({ events, date, routines, nowHourKey, library = null, membership = null }) {
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
  const base = routines ?? {};
  const resolvedRoutines = {
    ...base,
    am: resolveRoutineShelf('am', base.am, library, membership),
    pm: resolveRoutineShelf('pm', base.pm, library, membership),
    extras: base.extras
  };

  return {
    date,
    currentRoutine: nowHourKey === 'am' || nowHourKey === 'pm' ? nowHourKey : 'pm',
    routines: resolvedRoutines,
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
