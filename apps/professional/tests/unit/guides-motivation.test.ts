import { describe, expect, it } from 'vitest';
import { LEAN_WEIGHTS, motivationSdt } from '@/guides/motivation-sdt';

const g = motivationSdt;

describe('motivation guide', () => {
  it('has six scales in continuum order and a prompt for each', () => {
    expect(g.scales.map((s) => s.id)).toEqual(['amotivation', 'external', 'introjected', 'identified', 'integrated', 'intrinsic']);
    expect(g.prompts.map((p) => p.scale)).toEqual(g.scales.map((s) => s.id));
    for (const p of g.prompts) expect(p.listenFor.length).toBeGreaterThanOrEqual(2);
  });

  it('suggests 0, 3, 6 or 9 from the taps', () => {
    const v = g.suggest({ amotivation: 0, external: 1, introjected: 3, identified: 2, integrated: 0, intrinsic: 1 }, {});
    expect(v).toEqual({ amotivation: 0, external: 3, introjected: 9, identified: 6, integrated: 0, intrinsic: 3 });
  });

  it('checks only when introjected and identified were both heard', () => {
    expect(g.needsCheck({ introjected: 1, identified: 1 })).toBe(true);
    expect(g.needsCheck({ introjected: 3, identified: 0 })).toBe(false);
    expect(g.needsCheck({})).toBe(false);
  });

  it('nets the probe answers: agreeing answers move 3 points each, mixed answers cancel', () => {
    const taps = { introjected: 2, identified: 2 } as const;
    expect(g.suggest(taps, { alone: 'yes', feel: 'missed' })).toMatchObject({ introjected: 0, identified: 10 });
    expect(g.suggest(taps, { alone: 'no', feel: 'guilty' })).toMatchObject({ introjected: 10, identified: 0 });
    expect(g.suggest(taps, { alone: 'yes', feel: 'guilty' })).toMatchObject({ introjected: 6, identified: 6 });
  });

  it('names the profile from the autonomous and controlled means', () => {
    expect(g.profileFor({ external: 3, introjected: 7, identified: 5, integrated: 2, intrinsic: 2 }).id).toBe('control');
    expect(g.profileFor({ external: 1, introjected: 2, identified: 7, integrated: 6, intrinsic: 8 }).id).toBe('own');
    expect(g.profileFor({ external: 6, introjected: 7, identified: 7, integrated: 6, intrinsic: 6 }).id).toBe('both');
    expect(g.profileFor({ external: 5, introjected: 5, identified: 4, integrated: 4, intrinsic: 4 }).id).toBe('control');
    expect(g.profileFor({ amotivation: 8, external: 1, introjected: 1, identified: 1, integrated: 0, intrinsic: 1 }).id).toBe('low');
  });

  it('leans from 0 (controlled) to 1 (autonomous), even at 0.5, amotivation left out', () => {
    expect(LEAN_WEIGHTS).toEqual({ external: -2, introjected: -1, identified: 1, integrated: 1, intrinsic: 2 });
    expect(g.lean({})).toBe(0.5);
    expect(g.lean({ amotivation: 10 })).toBe(0.5);
    expect(g.lean({ external: 10, introjected: 10 })).toBe(0.125);
    expect(g.lean({ intrinsic: 10, identified: 10, integrated: 10 })).toBe(1);
  });

  it('writes moves in can-do words and never names a type', () => {
    const words = /\b(not|never|without|rather than|amotivat|external|introject|identified|integrated|intrinsic)\b/i;
    for (const profile of g.profiles) {
      expect(profile.moves.length).toBeGreaterThanOrEqual(2);
      for (const move of profile.moves) expect(move).not.toMatch(words);
    }
  });
});
