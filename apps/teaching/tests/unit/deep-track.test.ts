import { describe, expect, it } from 'vitest';
import { circleFor, FADE_DAYS, step1Passed, studentStep } from '@/deep/track';
import type { Evidence } from '@/evidence/types';

const ev = (student: string, date: string, share: number | null, tag = 'kp:kp_aa11bb'): Evidence => ({ item: 'q', tags: [tag], share, why: [], student, source: `quiz:${date}`, date, confidence: null });
const today = '2026-11-20';

describe('piece circles', () => {
  it('none, half, full; two right answers on one day count once', () => {
    expect(circleFor([], 'AB', 'kp_aa11bb', today).fill).toBe('none');
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('half');
    expect(circleFor([ev('AB', '2026-11-18', 1), ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('half');
    expect(circleFor([ev('AB', '2026-11-10', 1), ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today).fill).toBe('full');
  });
  it('amber when the latest check was wrong; waiting answers say nothing', () => {
    const c = circleFor([ev('AB', '2026-11-10', 1), ev('AB', '2026-11-12', 1), ev('AB', '2026-11-18', 0), ev('AB', '2026-11-19', null)], 'AB', 'kp_aa11bb', today);
    expect(c.amber).toBe(true);
    expect(c.fill).toBe('full');
  });
  it('faded when not checked lately', () => {
    const old = new Date(Date.parse(`${today}T00:00:00Z`) - (FADE_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    expect(circleFor([ev('AB', old, 1)], 'AB', 'kp_aa11bb', today).faded).toBe(true);
  });
  it('rings: used in writing beats missed; missed hidden while amber', () => {
    const writing = { b1: { AB: { used: [], missed: ['kp_aa11bb'], at: '2026-11-15' } }, b2: { AB: { used: ['kp_aa11bb'], missed: [], at: '2026-11-16' } } };
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today, writing).ring).toBe('used');
    const missedOnly = { b1: writing.b1 };
    expect(circleFor([ev('AB', '2026-11-18', 1)], 'AB', 'kp_aa11bb', today, missedOnly).ring).toBe('missed');
    expect(circleFor([ev('AB', '2026-11-18', 0)], 'AB', 'kp_aa11bb', today, missedOnly).ring).toBe('none');
  });
});

describe('Step 1 exit', () => {
  const pieces = [
    { id: 'e1', text: 'a', tier: 'essential' as const },
    { id: 'e2', text: 'b', tier: 'essential' as const },
    { id: 's1', text: 'c', tier: 'strong' as const },
    { id: 's2', text: 'd', tier: 'strong' as const },
    { id: 's3', text: 'e', tier: 'strong' as const },
    { id: 'x1', text: 'f', tier: 'sophisticated' as const }
  ];
  const full = { fill: 'full' as const, amber: false, faded: false, ring: 'none' as const };
  const none = { ...full, fill: 'none' as const };
  it('needs every Essential full and 80% of introduced Essential + Strong; Sophisticated ignored', () => {
    const introduced = new Set(['e1', 'e2', 's1', 's2', 's3', 'x1']);
    expect(step1Passed(pieces, introduced, { e1: full, e2: full, s1: full, s2: full, s3: none, x1: none })).toBe(true);
    expect(step1Passed(pieces, introduced, { e1: full, e2: full, s1: full, s2: none, s3: none, x1: full })).toBe(false);
    expect(step1Passed(pieces, introduced, { e1: full, e2: none, s1: full, s2: full, s3: full, x1: full })).toBe(false);
  });
  it('only counts pieces introduced so far', () => {
    expect(step1Passed(pieces, new Set(['e1', 's1']), { e1: full, s1: full })).toBe(true);
    expect(step1Passed(pieces, new Set(), {})).toBe(false);
  });
});

describe('each student’s step', () => {
  it('teacher passes win; otherwise Step 1 or nothing', () => {
    expect(studentStep(true, { step: '2b', at: '2026-11-10' })).toBe('2b');
    expect(studentStep(true, undefined)).toBe('1');
    expect(studentStep(false, undefined)).toBeNull();
  });
});
