import type { Lesson, ScheduledLesson } from '@/schemas';

type OrderLesson = Pick<Lesson, 'id' | 'sequence'>;
type OrderSlot = Pick<ScheduledLesson, 'lesson_id' | 'date' | 'delivery_status'>;

/** Earliest date each lesson is taught, across every class. Skipped slots don't count. */
export function firstTaughtDates(slots: OrderSlot[]): Map<string, string> {
  const first = new Map<string, string>();
  for (const slot of slots) {
    if (slot.delivery_status === 'skipped') continue;
    const current = first.get(slot.lesson_id);
    if (!current || slot.date < current) first.set(slot.lesson_id, slot.date);
  }
  return first;
}

/** Dated lessons first by date, then undated lessons in their saved order. */
export function lessonsByDate<T extends OrderLesson>(lessons: T[], slots: OrderSlot[]): T[] {
  const first = firstTaughtDates(slots);
  return [...lessons].sort((a, b) => {
    const aDate = first.get(a.id);
    const bDate = first.get(b.id);
    if (aDate && bDate) return aDate.localeCompare(bDate) || a.sequence - b.sequence;
    if (aDate) return -1;
    if (bDate) return 1;
    return a.sequence - b.sequence;
  });
}
