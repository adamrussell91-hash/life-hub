import { describe, expect, it } from 'vitest';
import {
  assignEmploymentLanes,
  axisYearTicks,
  branchPolyline,
  clampZoom,
  clusterMarks,
  riverHeightPx,
  roleBandExtraPx,
  timeToUnit,
  truncateRiverLabel,
  yearFraction
} from '@/domain/career-river-geometry';

describe('career-river-geometry', () => {
  it('maps Now to 0.4 when Now is in view', () => {
    const zoom = { from: 2020, to: 2030 };
    expect(timeToUnit(2020, zoom, 2025)).toBeCloseTo(0, 5);
    expect(timeToUnit(2025, zoom, 2025)).toBeCloseTo(0.4, 5);
    expect(timeToUnit(2030, zoom, 2025)).toBeCloseTo(1, 5);
  });

  it('uses linear scale when Now is out of view', () => {
    const zoom = { from: 2010, to: 2015 };
    expect(timeToUnit(2010, zoom, 2025)).toBeCloseTo(0, 5);
    expect(timeToUnit(2015, zoom, 2025)).toBeCloseTo(1, 5);
    expect(timeToUnit(2012.5, zoom, 2025)).toBeCloseTo(0.5, 5);
  });

  it('clamps zoom span to at least 1 year', () => {
    const clamped = clampZoom({ from: 2025, to: 2025.2 }, 2012, 2035);
    expect(clamped.to - clamped.from).toBeGreaterThanOrEqual(1);
  });

  it('sizes height from the Phase 3 formula', () => {
    expect(riverHeightPx('horizontal', 3, 10)).toBe(Math.max(440, 120 + 3 * 64));
    expect(riverHeightPx('vertical', 3, 10)).toBe(Math.max(640, 10 * 100));
  });

  it('emits readable year axis ticks by zoom span', () => {
    expect(axisYearTicks({ from: 2023, to: 2026 })).toEqual([2023, 2024, 2025, 2026]);
    expect(axisYearTicks({ from: 2012, to: 2026 }).every((y) => y % 3 === 0)).toBe(true);
    expect(axisYearTicks({ from: 2012, to: 2026 }).length).toBeGreaterThan(2);
    expect(axisYearTicks({ from: 2000, to: 2035 }).every((y) => y % 5 === 0)).toBe(true);
  });

  it('clusters marks closer than 10px', () => {
    const clusters = clusterMarks(
      [
        { id: 'a', unit: 0.5, title: 'A' },
        { id: 'b', unit: 0.502, title: 'B' },
        { id: 'c', unit: 0.8, title: 'C' }
      ],
      1000,
      10
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.count).toBe(2);
    expect(clusters[1]!.count).toBe(1);
  });

  it('builds a peel polyline past the split', () => {
    const pts = branchPolyline({
      orientation: 'horizontal',
      lengthPx: 800,
      midPx: 200,
      nowUnit: 0.4,
      splitUnit: 0.5,
      arrivalUnit: 0.9,
      laneY: 80,
      bundleY: 4
    });
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]!.y).toBeCloseTo(204, 0);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(280, 0);
  });

  it('yearFraction is mid-year for July', () => {
    expect(yearFraction('2026-07-02')).toBeGreaterThan(2026.4);
    expect(yearFraction('2026-07-02')).toBeLessThan(2026.6);
  });

  it('stacks concurrent employment into separate lanes', () => {
    const lanes = assignEmploymentLanes([
      { valid_from: '2021-01-25', valid_to: '2024-08-16' },
      { valid_from: '2023-01-23', valid_to: '2024-08-16' },
      { valid_from: '2024-08-19', valid_to: '2024-12-20' }
    ]);
    expect(lanes[0]).toBe(0);
    expect(lanes[1]).toBe(1);
    expect(lanes[2]).toBe(0);
    expect(roleBandExtraPx(2)).toBeGreaterThan(roleBandExtraPx(1));
  });

  it('truncates river labels to a pixel budget', () => {
    expect(truncateRiverLabel('English Teacher', 12)).toBe('');
    expect(truncateRiverLabel('English Teacher', 48)).toMatch(/Engl/);
    expect(truncateRiverLabel('Gifted', 80)).toBe('Gifted');
  });
});
