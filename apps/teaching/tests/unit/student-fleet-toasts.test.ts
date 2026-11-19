import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({ apiPost: vi.fn() }));

import { apiPost } from '@/api/client';
import { HOST_GRACE_MS, holdClassFleetSignals, resetClassFleetSignals } from '@/student/fleet-toasts';
import { resetFleetSignals, type FleetSignal } from '@/games/kinds/fleet-week/signals';

// Invented content only.
const ev = (id: string, lesson: string): FleetSignal => ({ id, kind: 'report_ready', line: 'Dawn report is in.', game_id: 'g_fleet', lesson_id: lesson });
const flush = () => new Promise((r) => setTimeout(r, 0));
const loads = () => vi.mocked(apiPost).mock.calls.filter(([, body]) => (body as { action: string }).action === 'fleet_signals').length;

afterEach(() => {
  resetClassFleetSignals();
  resetFleetSignals();
  vi.mocked(apiPost).mockReset();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('class-wide Fleet week toasts on any student page', () => {
  it('reads fleet_signals through the class profile endpoint and toasts', async () => {
    vi.mocked(apiPost).mockResolvedValue({ events: [ev('e1', 'lesson_a')] });
    const hold = holdClassFleetSignals('class_fw');
    await flush();
    expect(apiPost).toHaveBeenCalledWith('/api/published/profile/class_fw', expect.objectContaining({ action: 'fleet_signals' }));
    expect(document.querySelector('.fws-toast')?.textContent).toContain('Dawn report is in.');
    hold.release();
  });

  it('pages share one host: a second hold reuses it, and it goes only after the last release and a grace', async () => {
    vi.useFakeTimers();
    vi.mocked(apiPost).mockResolvedValue({ events: [] });
    const a = holdClassFleetSignals('class_fw');
    const b = holdClassFleetSignals('class_fw');
    expect(b.signals).toBe(a.signals);
    a.release();
    b.release();
    const c = holdClassFleetSignals('class_fw');
    expect(c.signals).toBe(a.signals);
    c.release();
    await vi.advanceTimersByTimeAsync(HOST_GRACE_MS + 1);
    const d = holdClassFleetSignals('class_fw');
    expect(d.signals).not.toBe(a.signals);
    d.release();
  });

  it('leaves out the lesson whose arcade toasts its own events on this page', async () => {
    vi.mocked(apiPost).mockResolvedValue({ events: [ev('e_here', 'lesson_here')] });
    const hold = holdClassFleetSignals('class_fw', { except: 'lesson_here' });
    await flush();
    expect(loads()).toBe(1);
    expect(document.querySelector('.fws-toast')).toBeNull();
    // Still counted for badges.
    expect(hold.signals.events().map((e) => e.id)).toEqual(['e_here']);
    hold.release();
  });
});
