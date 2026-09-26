import { describe, expect, it } from 'vitest';
import { nextSwitchDelayMs, phaseFor } from '@/lib/comm-phase';

const w = { scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: '2026-10-14T01:05:00.000Z' };

describe('phaseFor', () => {
  it('before, during, after around the window', () => {
    expect(phaseFor(w, new Date('2026-10-14T00:40:00.000Z'))).toBe('before');
    expect(phaseFor(w, new Date('2026-10-14T00:50:00.000Z'))).toBe('during');
    expect(phaseFor(w, new Date('2026-10-14T01:05:00.000Z'))).toBe('after');
  });
  it('no window means a logged comm: after', () => {
    expect(phaseFor({ scheduled_start: null, scheduled_end: null }, new Date())).toBe('after');
  });
  it('a start with no end runs for 60 minutes', () => {
    const open = { scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: null };
    expect(phaseFor(open, new Date('2026-10-14T01:49:00.000Z'))).toBe('during');
    expect(phaseFor(open, new Date('2026-10-14T01:50:00.000Z'))).toBe('after');
  });
});

describe('nextSwitchDelayMs', () => {
  it('counts down to the next boundary, or null when done', () => {
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T00:49:00.000Z'))).toBe(60_000);
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T01:04:00.000Z'))).toBe(60_000);
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T01:06:00.000Z'))).toBeNull();
  });
});
