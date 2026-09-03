import { describe, it, expect } from 'vitest';
import { scheduleNeighbors } from '@/schedule/schedule-neighbors';

type Row = {
  lesson_id: string;
  published: boolean;
  schedule_order: number;
  title: string;
};

function rows(partial: Array<Partial<Row> & Pick<Row, 'lesson_id' | 'published' | 'schedule_order'>>): Row[] {
  return partial.map((r) => ({ title: r.title ?? r.lesson_id, ...r }));
}

describe('scheduleNeighbors', () => {
  it('returns adjacent published neighbors and skips unpublished', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: false, schedule_order: 2, title: 'B' },
      { lesson_id: 'c', published: true, schedule_order: 3, title: 'C' },
      { lesson_id: 'd', published: true, schedule_order: 4, title: 'D' }
    ]);

    expect(scheduleNeighbors(schedule, 'c')).toEqual({
      prev: { lesson_id: 'a', title: 'A' },
      next: { lesson_id: 'd', title: 'D' }
    });
  });

  it('omits prev on first published and next on last', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: true, schedule_order: 2, title: 'B' }
    ]);

    expect(scheduleNeighbors(schedule, 'a')).toEqual({
      next: { lesson_id: 'b', title: 'B' }
    });
    expect(scheduleNeighbors(schedule, 'b')).toEqual({
      prev: { lesson_id: 'a', title: 'A' }
    });
  });

  it('returns empty object when lessonId missing from published chain', () => {
    const schedule = rows([
      { lesson_id: 'a', published: true, schedule_order: 1 },
      { lesson_id: 'draft', published: false, schedule_order: 2 }
    ]);
    expect(scheduleNeighbors(schedule, 'draft')).toEqual({});
    expect(scheduleNeighbors(schedule, 'missing')).toEqual({});
  });

  it('sorts by schedule_order before filtering', () => {
    const schedule = rows([
      { lesson_id: 'c', published: true, schedule_order: 3, title: 'C' },
      { lesson_id: 'a', published: true, schedule_order: 1, title: 'A' },
      { lesson_id: 'b', published: true, schedule_order: 2, title: 'B' }
    ]);
    expect(scheduleNeighbors(schedule, 'b')).toEqual({
      prev: { lesson_id: 'a', title: 'A' },
      next: { lesson_id: 'c', title: 'C' }
    });
  });
});
