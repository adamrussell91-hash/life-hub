/**
 * Marking shadow math. A marking shadow is the workload created when scripts
 * come in. Rate order is explicit, then learned from finished sessions, then
 * the hub default. Minutes spread across days that still have capacity.
 */
import { addDaysKey } from '@/domain/school-time';

export type Marking = {
  class_label: string;
  scripts: number;
  minutes_per_script: number | null;
  collected_on: string;
  return_by: string;
  scripts_marked: number;
};

export type MarkingSession = { minutes: number; scriptsMarked: number };

export type MarkingRate = {
  rate: number;
  source: 'explicit' | 'learned' | 'default';
  sessions: number;
};

export function resolveMarkingRate(input: {
  minutesPerScript: number | null;
  sessions: MarkingSession[];
  defaultMinutes: number;
}): MarkingRate {
  if (input.minutesPerScript != null && input.minutesPerScript > 0) {
    return { rate: input.minutesPerScript, source: 'explicit', sessions: input.sessions.length };
  }
  const usable = input.sessions.filter((session) => session.scriptsMarked > 0 && session.minutes > 0);
  if (usable.length) {
    const minutes = usable.reduce((sum, session) => sum + session.minutes, 0);
    const scripts = usable.reduce((sum, session) => sum + session.scriptsMarked, 0);
    return { rate: minutes / scripts, source: 'learned', sessions: usable.length };
  }
  return { rate: input.defaultMinutes, source: 'default', sessions: 0 };
}

/** "starting guess" until three finished marking sessions exist. */
export function rateCaption(rate: MarkingRate): string {
  if (rate.source === 'explicit') return 'minutes per script';
  if (rate.source === 'learned' && rate.sessions >= 3) return 'learned rate';
  return 'starting guess';
}

export function syncedMarkingFields(marking: Marking, rate: number): { due_date: string; estimated_duration: number } {
  return {
    due_date: marking.return_by,
    estimated_duration: marking.scripts * rate
  };
}

export function capacityDays(from: string, to: string, capacityOf: (date: string) => number): string[] {
  const days: string[] = [];
  if (!from || !to || from > to) return days;
  for (let date = from; date <= to; date = addDaysKey(date, 1)) {
    if (capacityOf(date) > 0) days.push(date);
  }
  return days;
}

/** Remaining minutes, shared evenly across capacity days. Walls are already zero. */
export function spreadRemaining(minutes: number, days: string[]): Map<string, number> {
  const share = minutes / Math.max(1, days.length);
  return new Map(days.map((date) => [date, days.length ? share : 0]));
}

export type ShadowPaint = {
  label: string;
  warnText: string;
  warn: boolean;
  perDay: number;
  days: number;
  progress: number;
  remainingMinutes: number;
};

export function markingShadowPaint(input: {
  marking: Marking;
  rate: number;
  today: string;
  capacityOf: (date: string) => number;
}): ShadowPaint {
  const { marking, rate, today } = input;
  const remainingMinutes = Math.max(0, marking.scripts - marking.scripts_marked) * rate;
  const days = capacityDays(marking.collected_on, marking.return_by, input.capacityOf);
  const from = marking.collected_on > today ? marking.collected_on : today;
  const left = capacityDays(from, marking.return_by, input.capacityOf);
  const perDay = remainingMinutes / Math.max(1, left.length);
  const warn = left.some((date) => perDay > input.capacityOf(date) * 0.6);
  const hrs =
    remainingMinutes >= 60
      ? `~${Math.round(remainingMinutes / 60)} h left`
      : `~${Math.round(remainingMinutes)} min left`;
  return {
    label: `${marking.class_label} · ${marking.scripts_marked} of ${marking.scripts} · ${hrs}`,
    warnText: warn ? `needs ${Math.round(perDay)} min a day` : '',
    warn,
    perDay,
    days: days.length,
    progress: marking.scripts > 0 ? marking.scripts_marked / marking.scripts : 0,
    remainingMinutes
  };
}

export function bumpScriptsMarked(marking: Marking, scripts: number): Marking {
  return {
    ...marking,
    scripts_marked: Math.min(marking.scripts, marking.scripts_marked + Math.max(0, scripts))
  };
}
