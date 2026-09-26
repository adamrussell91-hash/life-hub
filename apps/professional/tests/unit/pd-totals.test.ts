import { describe, expect, it } from 'vitest';
import { groupTotals, talkHoursNote } from '@/lib/pd-totals';

const ev = (id: string, start: string, hours: number | null, state = 'completed', attendance: string | null = 'attended') =>
  ({ id, start, end: start, hours, occurrence_state: state, attendance_state: attendance, time_zone: 'Australia/Sydney' });

describe('groupTotals', () => {
  it('sums done and planned hours and measures the gaps between sessions', () => {
    const totals = groupTotals([
      ev('s2', '2026-10-29T22:00:00.000Z', 6, 'scheduled', 'registered'),
      ev('s1', '2026-09-17T23:00:00.000Z', 6),
      ev('s3', '2026-11-19T22:00:00.000Z', 6, 'scheduled', null)
    ]);
    expect(totals.hoursDone).toBe(6);
    expect(totals.hoursTotal).toBe(18);
    expect(totals.sessions.map((session) => [session.id, session.label, session.gapAfter])).toEqual([
      ['s1', '18/09', '6 wks'],
      ['s2', '30/10', '3 wks'],
      ['s3', '20/11', null]
    ]);
  });
  it('gaps under a week are days', () => {
    const totals = groupTotals([ev('d1', '2026-10-05T22:00:00.000Z', 6), ev('d2', '2026-10-06T22:00:00.000Z', 5)]);
    expect(totals.sessions[0]!.gapAfter).toBe('1 day');
  });
});

describe('talkHoursNote', () => {
  it('says when talk hours and event hours differ', () => {
    expect(talkHoursNote([{ hours: 1.5 }, { hours: 2 }, { hours: 1.5 }], 6)).toBe('Talks add up to 5 h of 6 h.');
    expect(talkHoursNote([{ hours: 3 }, { hours: 3 }], 6)).toBeNull();
    expect(talkHoursNote([{ hours: null }], 6)).toBeNull();
  });
});
