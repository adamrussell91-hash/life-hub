// netlify/functions/_shared/goal-calendar-context.mjs
/**
 * Best-effort Life calendar + binding context for Hammond goal reads (G-30 / G-31).
 * Failures are silent: callers get empty slots / null binding and must still return a read.
 */
import { addDays } from '../../../packages/design-kit/js/lead-lines.js';
import { findOpenings } from '../../../packages/design-kit/js/openings.js';
import { capacityForDates } from '../../../apps/life/js/app/capacity-model.js';
import { buildBindingGoal } from '../../../apps/life/js/app/binding-goal.js';

export function slotsFromCapacity(capacityDays, today) {
  if (!Array.isArray(capacityDays) || !capacityDays.length) return [];
  const wants = [
    { id: 'goal-block', title: 'Goal block', span: 'lunch', minPct: 40, minHours: 1 }
  ];
  const openings = findOpenings(capacityDays, wants);
  const hit = openings.find(o => o.dates?.length)?.dates ?? [];
  return hit
    .filter(date => date >= today)
    .map(date => ({ date, start: '12:00', end: '13:00' }));
}

/** Pure helper for tests: build slots from a capacity map. */
export function buildSlotsFromEvents(events, today, { days = 14 } = {}) {
  const dates = [];
  for (let i = 0; i < days; i += 1) dates.push(addDays(today, i));
  const capacity = capacityForDates(events ?? [], dates, { isHoliday: () => false });
  const daysIn = dates.map(date => {
    const row = capacity?.[date] ?? {};
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      date,
      pct: typeof row.pct === 'number' ? row.pct : 80,
      weekday,
      freeEvening: typeof row.freeEvening === 'number' ? row.freeEvening : 4,
      freeDay: typeof row.freeDay === 'number' ? row.freeDay : 6,
      holiday: false
    };
  });
  return slotsFromCapacity(daysIn, today);
}

export function bindingFromEvents(events, today) {
  try {
    return buildBindingGoal({ events: events ?? [], date: today });
  } catch {
    return null;
  }
}
