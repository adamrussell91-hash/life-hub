import { describe, it, expect, vi, afterEach } from 'vitest';
import { localTodayYmd, resolveScheduleToday } from '@/schedule/today';

describe('localTodayYmd', () => {
  it('formats local calendar date as YYYY-MM-DD', () => {
    expect(localTodayYmd(new Date(2026, 7, 8, 15, 30, 0))).toBe('2026-08-08');
  });
});

describe('resolveScheduleToday', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses curriculum anchor under Vitest when no env override', () => {
    expect(resolveScheduleToday('2026-08-12')).toBe('2026-08-12');
  });

  it('prefers VITE_SCHEDULE_ANCHOR_DATE over curriculum anchor', () => {
    vi.stubEnv('VITE_SCHEDULE_ANCHOR_DATE', '2026-09-01');
    expect(resolveScheduleToday('2026-08-12')).toBe('2026-09-01');
  });
});
