// apps/tasks/tests/unit/focus-strip.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFocusStrip } from '@/views/focus-strip';

afterEach(() => vi.useRealTimers());

describe('focus strip', () => {
  it('counts down, can be stopped, and only one runs at a time', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    startFocusStrip(host, { minutes: 25, label: 'Focus on HA evidence' });
    expect(host.querySelector('.focus-strip__clock')?.textContent).toBe('25:00');
    vi.advanceTimersByTime(61_000);
    expect(host.querySelector('.focus-strip__clock')?.textContent).toBe('23:59');
    startFocusStrip(host, { minutes: 15, label: "Hammond's with you" });
    expect(host.querySelectorAll('.focus-strip')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('.focus-strip button')!.click();
    expect(host.querySelector('.focus-strip')).toBeNull();
  });

  it('removes itself at zero', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    startFocusStrip(host, { minutes: 1, label: 'x' });
    vi.advanceTimersByTime(60_000);
    expect(host.querySelector('.focus-strip')).toBeNull();
  });
});
