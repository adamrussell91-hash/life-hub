import type { Task } from '@/schemas/task';
import { addDays, startOfDay, tasksForDay, toDateKey } from '@/domain/queries';

export type CapacityLevel = 'free' | 'light' | 'busy' | 'slammed';

export type DayCapacity = {
  date_key: string;
  weekday: string;
  level: CapacityLevel;
  open_task_count: number;
  estimated_minutes: number;
};

export type CapacitySnapshot = {
  generated_at: string;
  horizon_days: number;
  days: DayCapacity[];
  /** Human phrases only — never task titles (Corey-safe). */
  headlines: string[];
  overall: CapacityLevel;
};

function levelFromLoad(taskCount: number, minutes: number): CapacityLevel {
  if (taskCount === 0 && minutes === 0) return 'free';
  if (taskCount >= 5 || minutes >= 360) return 'slammed';
  if (taskCount >= 3 || minutes >= 240) return 'busy';
  if (taskCount >= 1 || minutes >= 60) return 'light';
  return 'free';
}

function effort(task: Task): number {
  return task.estimated_duration ?? 45;
}

export function buildDayCapacity(tasks: Task[], day: Date): DayCapacity {
  const dayTasks = tasksForDay(tasks, day);
  const estimated_minutes = dayTasks.reduce((sum, t) => sum + effort(t), 0);
  return {
    date_key: toDateKey(day),
    weekday: day.toLocaleDateString(undefined, { weekday: 'long' }),
    level: levelFromLoad(dayTasks.length, estimated_minutes),
    open_task_count: dayTasks.length,
    estimated_minutes
  };
}

function overallLevel(days: DayCapacity[]): CapacityLevel {
  if (days.some((d) => d.level === 'slammed')) return 'slammed';
  if (days.filter((d) => d.level === 'busy').length >= 2) return 'busy';
  if (days.some((d) => d.level === 'busy' || d.level === 'light')) return 'light';
  return 'free';
}

/** Build Corey-safe headlines from day levels (no task content). */
export function capacityHeadlines(days: DayCapacity[], from: Date = new Date()): string[] {
  const headlines: string[] = [];
  const slammed = days.filter((d) => d.level === 'slammed');
  if (slammed.length) {
    const last = slammed[slammed.length - 1]!;
    headlines.push(`Slammed through ${last.weekday}`);
  }

  const busyRun: DayCapacity[] = [];
  for (const day of days) {
    if (day.level === 'busy' || day.level === 'slammed') busyRun.push(day);
    else if (busyRun.length) break;
  }
  if (busyRun.length >= 2 && !slammed.length) {
    headlines.push(`Busy until ${busyRun[busyRun.length - 1]!.weekday}`);
  }

  const freeWeekend = days.filter(
    (d) =>
      (d.weekday === 'Saturday' || d.weekday === 'Sunday') &&
      (d.level === 'free' || d.level === 'light')
  );
  for (const day of freeWeekend) {
    if (day.level === 'free') headlines.push(`Free ${day.weekday} afternoon`);
    else headlines.push(`${day.weekday} looks light`);
  }

  if (!headlines.length) {
    const nextBusy = days.find((d) => d.level === 'busy' || d.level === 'slammed');
    if (nextBusy) headlines.push(`${nextBusy.weekday} is the pinch`);
    else headlines.push('Clear horizon for the next stretch');
  }

  // Prefer a short list
  return headlines.slice(0, 3);
}

export function buildCapacitySnapshot(
  tasks: Task[],
  from: Date = new Date(),
  horizonDays = 14
): CapacitySnapshot {
  const start = startOfDay(from);
  const days: DayCapacity[] = [];
  for (let i = 0; i < horizonDays; i += 1) {
    days.push(buildDayCapacity(tasks, addDays(start, i)));
  }
  return {
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    days,
    headlines: capacityHeadlines(days, from),
    overall: overallLevel(days.slice(0, 7))
  };
}

/** Strip anything task-identifying for the public Corey payload. */
export function toCoreyPublicView(snapshot: CapacitySnapshot): {
  generated_at: string;
  headlines: string[];
  overall: CapacityLevel;
  days: Array<{ date_key: string; weekday: string; level: CapacityLevel }>;
} {
  return {
    generated_at: snapshot.generated_at,
    headlines: snapshot.headlines,
    overall: snapshot.overall,
    days: snapshot.days.map((d) => ({
      date_key: d.date_key,
      weekday: d.weekday,
      level: d.level
    }))
  };
}
