import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoRetry, type AutoRetryState } from '@/lib/auto-retry';

describe('createAutoRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('first try runs after the first delay; success reports linked and stops', async () => {
    const states: AutoRetryState[] = [];
    const run = vi.fn().mockResolvedValue(undefined);
    createAutoRetry({ run, onState: (s) => states.push(s), delays: [5000, 30000] });
    expect(states).toEqual(['linking']);
    await vi.advanceTimersByTimeAsync(4999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('linked');
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('backs off through the delays, then the steady interval', async () => {
    const run = vi.fn().mockRejectedValue(new Error('down'));
    createAutoRetry({ run, onState: () => {}, delays: [1000, 2000], steadyMs: 5000, stuckAfterMs: 1e9 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('reports stuck once failures pass stuckAfterMs, with the error', async () => {
    const states: Array<[AutoRetryState, unknown]> = [];
    const err = new Error('professional_task_link_incomplete');
    createAutoRetry({
      run: vi.fn().mockRejectedValue(err),
      onState: (s, e) => states.push([s, e]),
      delays: [1000],
      steadyMs: 1000,
      stuckAfterMs: 3000
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(states.at(-1)?.[0]).toBe('linking');
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toEqual(['stuck', err]);
  });

  it('tryNow runs at once and cancels the pending timer; stop ends everything', async () => {
    const run = vi.fn().mockRejectedValue(new Error('down'));
    const retry = createAutoRetry({ run, onState: () => {}, delays: [10000], steadyMs: 10000 });
    await retry.tryNow();
    expect(run).toHaveBeenCalledTimes(1);
    retry.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
