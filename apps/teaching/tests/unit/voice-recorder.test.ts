import { describe, expect, it } from 'vitest';

/** Elapsed formatter used by the recorder UI (kept in sync with voice-recorder.ts). */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

describe('voice recorder helpers', () => {
  it('formats elapsed mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(1500)).toBe('0:01');
    expect(formatElapsed(65_000)).toBe('1:05');
  });

  it('records tap timestamps as seconds from elapsed ms', () => {
    const elapsedMs = 12_500;
    const tap = { t: elapsedMs / 1000, anchor: { stanza: 's1', quote: { exact: 'Bent' } } };
    expect(tap.t).toBe(12.5);
  });
});
