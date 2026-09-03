import { describe, it, expect } from 'vitest';
import {
  yearMonthFromDate, shiftYearMonth, monthGridRange, buildClassCalendarModel
} from '@/schedule/class-calendar-model';

describe('class-calendar-model', () => {
  it('shifts months across year boundaries', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-08', 0)).toBe('2026-08');
  });

  it('pads the grid to whole Mon-Sun weeks', () => {
    // Aug 2026: 1st is a Saturday, 31st is a Monday
    const r = monthGridRange('2026-08');
    expect(r.first).toBe('2026-08-01');
    expect(r.last).toBe('2026-08-31');
    expect(r.start).toBe('2026-07-27'); // Monday before the 1st
    expect(r.end).toBe('2026-09-06');   // Sunday after the 31st
  });

  it('always yields whole weeks', () => {
    for (const ym of ['2026-01', '2026-02', '2026-08', '2027-11']) {
      const { start, end } = monthGridRange(ym);
      const span = (new Date(`${end}T00:00:00Z`).getTime()
                  - new Date(`${start}T00:00:00Z`).getTime()) / 86400000 + 1;
      expect(span % 7).toBe(0);
    }
  });

  it('marks today, selection and out-of-month days', () => {
    const model = buildClassCalendarModel({
      scheduled: [
        { id: 's1', lesson_id: 'l1', unit_id: 'u1', date: '2026-08-12', delivery_status: 'current' },
        { id: 's2', lesson_id: 'l2', unit_id: 'u1', date: '2026-08-10', delivery_status: 'delivered' }
      ] as never,
      lessonTitles: new Map([['l1', 'Narrative Structure'], ['l2', 'Introduction']]),
      today: '2026-08-12',
      selectedDate: '2026-08-12',
      viewMonth: '2026-08'
    });

    expect(model.monthLabel).toBe('August 2026');
    const twelfth = model.monthDays.find(d => d.date === '2026-08-12')!;
    expect(twelfth.isToday).toBe(true);
    expect(twelfth.inMonth).toBe(true);
    expect(twelfth.lessons).toHaveLength(1);
    expect(model.monthDays.find(d => d.date === '2026-07-27')!.inMonth).toBe(false);
    expect(model.dayLessons[0].title).toBe('Narrative Structure');
  });

  it('defaults the view month to the selected date', () => {
    const m = buildClassCalendarModel({
      scheduled: [], lessonTitles: new Map(), today: '2026-08-12', selectedDate: '2026-09-03'
    });
    expect(m.viewMonth).toBe('2026-09');
  });
});
