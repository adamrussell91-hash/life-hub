import { daysBetween } from './calendar-dates';
import type { ScheduledLesson, Unit } from '@/schemas';

export type UnitDateSpan = { start: string; end: string; source: 'unit' | 'scheduled' };

type UnitInput = Pick<Unit, 'id' | 'start_date' | 'end_date'>;
type ScheduledInput = Pick<ScheduledLesson, 'unit_id' | 'date'>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scheduledSpan(unitId: string, scheduled: ScheduledInput[]): UnitDateSpan | null {
  const dates = scheduled.filter((row) => row.unit_id === unitId).map((row) => row.date);
  if (dates.length === 0) return null;
  const start = dates.reduce((min, date) => (date < min ? date : min));
  const end = dates.reduce((max, date) => (date > max ? date : max));
  return { start, end, source: 'scheduled' };
}

export function unitDateSpan(
  unit: UnitInput,
  scheduled: ScheduledInput[]
): UnitDateSpan | null {
  const { start_date, end_date } = unit;
  if (start_date && end_date && daysBetween(start_date, end_date) >= 0) {
    return { start: start_date, end: end_date, source: 'unit' };
  }
  return scheduledSpan(unit.id, scheduled);
}

export function unitDateProgress(
  span: UnitDateSpan,
  today: string
): { ratio: number; daysElapsed: number; daysRemaining: number } {
  const { start, end } = span;
  const spanDays = daysBetween(start, end);

  if (spanDays === 0) {
    const ratio = today >= start ? 1 : 0;
    const daysRemaining = today <= end ? daysBetween(today, end) : 0;
    return { ratio, daysElapsed: ratio, daysRemaining: Math.max(0, daysRemaining) };
  }

  const elapsed = daysBetween(start, today);
  const ratio = clamp(elapsed / Math.max(1, spanDays), 0, 1);
  const daysElapsed = clamp(elapsed, 0, spanDays);
  const daysRemaining = Math.max(0, daysBetween(today, end));

  return { ratio, daysElapsed, daysRemaining };
}
