import { describe, it, expect } from 'vitest';
import { generateScheduleDates } from '@/schedule/generate-dates';

describe('generateScheduleDates', () => {
  it('includes start date when it is a meeting day', () => {
    // 2026-08-10 is Monday
    expect(
      generateScheduleDates({
        startDate: '2026-08-10',
        meetingDays: [1, 2, 3, 4, 5],
        lessonCount: 3
      })
    ).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('skips weekends for Mon–Fri pattern', () => {
    expect(
      generateScheduleDates({
        startDate: '2026-08-14', // Friday
        meetingDays: [1, 2, 3, 4, 5],
        lessonCount: 2
      })
    ).toEqual(['2026-08-14', '2026-08-17']); // Mon
  });

  it('places only Mon/Wed/Fri', () => {
    expect(
      generateScheduleDates({
        startDate: '2026-08-10',
        meetingDays: [1, 3, 5],
        lessonCount: 4
      })
    ).toEqual(['2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17']);
  });

  it('snaps forward when start is not a meeting day', () => {
    // 2026-08-11 is Tuesday; pattern Mon/Wed/Fri
    expect(
      generateScheduleDates({
        startDate: '2026-08-11',
        meetingDays: [1, 3, 5],
        lessonCount: 1
      })
    ).toEqual(['2026-08-12']);
  });

  it('throws on empty meetingDays or non-positive lessonCount', () => {
    expect(() =>
      generateScheduleDates({ startDate: '2026-08-10', meetingDays: [], lessonCount: 1 })
    ).toThrow();
  });
});
