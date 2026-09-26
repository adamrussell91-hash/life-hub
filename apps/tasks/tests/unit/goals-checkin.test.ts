// apps/tasks/tests/unit/goals-checkin.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { checkInProminent, checkInStripLine, openSundayCheckIn } from '@/views/goals-checkin';
import { renderHammondStrip } from '@/views/hammond-goal';
import { goal } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getGoalCheckins: vi.fn(),
    saveGoalCheckin: vi.fn(),
    getGoalRead: vi.fn(),
    decideGhost: vi.fn(),
    rescanGoalRead: vi.fn()
  }
}));

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

describe('Sunday check-in via tasksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tasksApi.saveGoalCheckin).mockResolvedValue({
      checkin: { date: '2026-09-27', moved: [], stuck: [], moves_planned: 0 }
    });
    vi.mocked(tasksApi.getGoalCheckins).mockResolvedValue({
      checkin: { date: '2026-09-27', moves_planned: 2 }
    });
  });

  it('Done posts through tasksApi.saveGoalCheckin, not relative fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const host = document.createElement('div');
    document.body.append(host);
    const g = goal({ id: 'g1', title: 'HA evidence' });
    openSundayCheckIn(host, [g], [], '2026-09-27', () => undefined);

    // Advance to step 2 (One move) and click Done.
    const next = () => host.querySelector<HTMLButtonElement>('.btn--primary')!;
    next().click(); // → stuck
    next().click(); // → one move
    const done = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Done')!;
    done.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(tasksApi.saveGoalCheckin).toHaveBeenCalledWith({
      date: '2026-09-27',
      moved: [],
      stuck: [],
      moves_planned: 0
    });
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/goal-checkins/),
      expect.anything()
    );
    fetchSpy.mockRestore();
    host.remove();
  });

  it('Hammond strip loads check-in via tasksApi.getGoalCheckins', async () => {
    const host = document.createElement('div');
    const g = goal({ id: 'g1', title: 'HA evidence' });
    renderHammondStrip(
      host,
      [
        {
          read: {
            goal_id: 'g1',
            verdict: 'Moving',
            looked_at: ['Week log'],
            ghosts: [],
            signals: [],
            generated_at: '2026-09-27T00:00:00Z'
          },
          reason: 'daily'
        } as never
      ],
      [g],
      () => undefined
    );
    await vi.waitFor(() => {
      expect(tasksApi.getGoalCheckins).toHaveBeenCalled();
    });
    expect(host.querySelector('.hammond-strip__checkin')?.textContent).toMatch(/Checked in/);
  });
});
