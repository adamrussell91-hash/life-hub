/**
 * Term-rhythm factor for the load strip.
 * With fewer than two completed terms the factor is 1.
 * After that it is the median minutes finished in week N of a term
 * divided by the median across every week.
 */
import { addDaysKey, mondayOf } from '@/domain/school-time';
import type { Marking } from '@/domain/marking-shadow';
import { capacityDays, spreadRemaining } from '@/domain/marking-shadow';

export type TermWeekSample = { termKey: string; weekIndex: number; minutes: number };

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function termRhythmFactor(samples: TermWeekSample[], weekIndex: number): number {
  const terms = new Set(samples.map((sample) => sample.termKey));
  if (terms.size < 2) return 1;
  const week = samples.filter((sample) => sample.weekIndex === weekIndex).map((sample) => sample.minutes);
  const all = samples.map((sample) => sample.minutes);
  const base = median(all);
  if (!week.length || base <= 0) return 1;
  return median(week) / base;
}

export function learningTermRhythm(samples: TermWeekSample[]): boolean {
  return new Set(samples.map((sample) => sample.termKey)).size < 2;
}

export type LoadTask = {
  status: string;
  due: string | null;
  est: number | null;
  marking: Marking | null;
};

export type WeekLoad = {
  key: string;
  minutes: number;
  capacity: number;
  wall: boolean;
  over: boolean;
};

export function buildWeekLoad(input: {
  today: string;
  rangeEnd: string;
  tasks: LoadTask[];
  capacityOf: (date: string) => number;
  wallOn: (date: string) => boolean;
  factorFor: (monday: string) => number;
}): WeekLoad[] {
  const weeks = new Map<string, { minutes: number; capacity: number; wall: boolean }>();
  const ensure = (key: string) => {
    const monday = mondayOf(key);
    let row = weeks.get(monday);
    if (!row) {
      let capacity = 0;
      let wall = false;
      for (let index = 0; index < 7; index += 1) {
        const date = addDaysKey(monday, index);
        if (input.wallOn(date)) wall = true;
        else capacity += input.capacityOf(date);
      }
      row = { minutes: 0, capacity: capacity * input.factorFor(monday), wall };
      weeks.set(monday, row);
    }
    return row;
  };
  for (let key = mondayOf(input.today); key <= input.rangeEnd; key = addDaysKey(key, 7)) ensure(key);
  for (const task of input.tasks) {
    if (task.status === 'done' || !task.due || task.due < input.today) continue;
    if (task.marking) {
      const rate =
        task.marking.minutes_per_script ??
        (task.est && task.marking.scripts ? task.est / task.marking.scripts : 0);
      const remaining = Math.max(0, task.marking.scripts - task.marking.scripts_marked) * rate;
      const from = task.marking.collected_on > input.today ? task.marking.collected_on : input.today;
      const days = capacityDays(from, task.marking.return_by, (date) => (input.wallOn(date) ? 0 : input.capacityOf(date)));
      const spread = spreadRemaining(remaining, days);
      for (const [date, minutes] of spread) ensure(date).minutes += minutes;
    } else if (task.est) {
      ensure(task.due).minutes += task.est;
    }
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, row]) => ({
      key,
      minutes: row.minutes,
      capacity: row.capacity,
      wall: row.wall,
      over: row.minutes > row.capacity && row.capacity > 0
    }));
}
