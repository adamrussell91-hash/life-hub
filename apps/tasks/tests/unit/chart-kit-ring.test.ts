import { describe, expect, it } from 'vitest';
import { buildRingTarget } from '@/chart-kit/ring';

describe('buildRingTarget', () => {
  it('maps complete/total into circumference and capped dashoffset', () => {
    const ring = buildRingTarget({ value: 1, target: 5 }, { size: 64, strokeWidth: 8 });
    expect(ring.size).toBe(64);
    expect(ring.strokeWidth).toBe(8);
    expect(ring.center).toBe(32);
    expect(ring.radius).toBe(28);
    expect(Math.abs(ring.circumference - 2 * Math.PI * 28)).toBeLessThan(1e-9);
    expect(Math.abs(ring.dashoffset - ring.circumference * 0.8)).toBeLessThan(1e-9);
    expect(ring.fraction).toBe(0.2);
  });

  it('over-target values cap visual fraction at 1 but expose raw value', () => {
    const ring = buildRingTarget({ value: 150, target: 100 }, { size: 72, strokeWidth: 7 });
    expect(ring.fraction).toBe(1);
    expect(ring.dashoffset).toBe(0);
    expect(ring.value).toBe(150);
    expect(ring.target).toBe(100);
  });

  it('zero or missing target yields fraction 0 without NaN', () => {
    const ring = buildRingTarget({ value: 40, target: 0 }, { size: 64, strokeWidth: 8 });
    expect(ring.fraction).toBe(0);
    expect(Number.isFinite(ring.dashoffset)).toBe(true);
  });
});
