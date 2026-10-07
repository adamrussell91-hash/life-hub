import { describe, expect, it } from 'vitest';
import { formatShortRange, formatTicketMoment, formatWeekdayDate } from '@/lib/date-label';

describe('formatTicketMoment', () => {
  it('keeps weekday + time on same-day tickets', () => {
    expect(formatTicketMoment('2026-12-04', '09:35', false)).toBe('Fri 09:35');
  });

  it('uses the calendar day on overnight tickets so the span is obvious', () => {
    expect(formatTicketMoment('2026-12-01', '22:15', true)).toBe('Tue 1 Dec 22:15');
    expect(formatTicketMoment('2026-12-02', '04:10', true)).toBe('Wed 2 Dec 04:10');
  });

  it('shows Time to set when the clock is missing', () => {
    expect(formatTicketMoment('2026-12-01', undefined, true)).toBe('Time to set');
  });
});

describe('overnight range label', () => {
  it('formats 1 – 2 Dec for an overnight span', () => {
    expect(formatShortRange('2026-12-01', '2026-12-02')).toBe('1 – 2 Dec');
    expect(formatWeekdayDate('2026-12-04')).toBe('Fri 4 Dec');
  });
});
