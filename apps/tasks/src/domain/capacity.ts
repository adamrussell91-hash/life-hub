import type { Task } from '@/schemas/task';
import { tasksForDay, toDateKey } from '@/domain/queries';

export type CapacityLevel = 'free' | 'light' | 'busy' | 'slammed';

export type DayCapacity = {
  date_key: string;
  weekday: string;
  level: CapacityLevel;
  open_task_count: number;
  estimated_minutes: number;
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
