// apps/tasks/tests/unit/goals-checkin.test.ts
import { describe, expect, it } from 'vitest';
import { checkInProminent, checkInStripLine } from '@/views/goals-checkin';

describe('Sunday check-in helpers', () => {
  it('is prominent on Sat, Sun and Mon', () => {
    expect(checkInProminent('2026-09-26')).toBe(true); // Sat
    expect(checkInProminent('2026-09-27')).toBe(true); // Sun
    expect(checkInProminent('2026-09-28')).toBe(true); // Mon
    expect(checkInProminent('2026-09-29')).toBe(false); // Tue
  });

  it('shows strip line until next Saturday', () => {
    const line = checkInStripLine({ date: '2026-09-27', moves_planned: 2 }, '2026-09-29');
    expect(line).toMatch(/Checked in/);
    expect(line).toMatch(/2 moves planned/);
    expect(checkInStripLine({ date: '2026-09-27', moves_planned: 2 }, '2026-10-03')).toBeNull();
  });
});
