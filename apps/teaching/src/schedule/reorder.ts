import type { ScheduledLesson } from '@/schemas';

export function reorderScheduledLesson(
  rows: ScheduledLesson[],
  id: string,
  direction: 'up' | 'down'
): ScheduledLesson[] {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    return rows;
  }

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= rows.length) {
    return rows;
  }

  const current = rows[index];
  const neighbor = rows[neighborIndex];

  return rows.map((row) => {
    if (row.id === current.id) {
      return { ...row, schedule_order: neighbor.schedule_order };
    }
    if (row.id === neighbor.id) {
      return { ...row, schedule_order: current.schedule_order };
    }
    return row;
  });
}
